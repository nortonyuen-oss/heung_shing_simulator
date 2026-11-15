#!/usr/bin/env node
// Uses only the dedicated Safari automation session created for this acceptance run.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const session = JSON.parse(fs.readFileSync(process.env.WORLD_SAFARI_SESSION || '/private/tmp/city-world-phase5-safari-session.json')).value;
const base = `http://127.0.0.1:4184/session/${session.sessionId}`, origin = process.env.WORLD_SAFARI_URL || 'http://127.0.0.1:4183';
const OUT = path.resolve(__dirname, '../test-results/world-phase5'); fs.mkdirSync(OUT, { recursive: true });
async function command(route, body) {
  const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(150000) });
  const data = (await response.json()).value; if (data?.error) throw Error(data.message); return data;
}
async function evaluate(script) {
  const value = await command('/execute/async', { script: `const done=arguments[arguments.length-1];(async()=>{${script}})().then(done,e=>done({testError:e.name+': '+e.message+' '+(e.stack||'')}));`, args: [] });
  if (value?.testError) throw Error(value.testError); return value;
}
async function waitFor(expression, timeout = 150000) {
  const start = Date.now(); while (Date.now() - start < timeout) {
    try { if (await command('/execute/sync', { script: `return !!(${expression});`, args: [] })) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error(`Safari timeout: ${expression}`);
}
const settled = 'globalThis.__worldStreamingPreview?.ready && __worldStreamingPreview.manager.snapshot().states.ACTIVE===__worldStreamingPreview.manager.snapshot().wanted';
(async () => {
  try {
    await command('/timeouts', { script: 120000, pageLoad: 120000, implicit: 0 }); await command('/window/rect', { width: 1280, height: 900 });
    console.log('Safari: opening packaged main menu'); await command('/url', { url: origin }); await waitFor('typeof gameReady!=="undefined"&&gameReady');
    await evaluate(`setLanguage('zhHant');document.getElementById('btn-new-game').click();document.querySelector('[data-source-id="hk-territory"]').click();document.getElementById('city-name-input').value='Safari 全港驗收';[...document.querySelectorAll('#newgame-start-year button')].find(b=>b.textContent==='1900').click();document.getElementById('btn-start-city').click();return true;`);
    await waitFor(settled); console.log('Safari: world entry ready');
    const initial = await evaluate(`const p=__worldStreamingPreview;return {name:p.delta.header.city.name,year:p.delta.header.city.startYear,id:p.session.id,writable:HeungShingStorage.writable};`);
    assert.equal(initial.name, 'Safari 全港驗收'); assert.equal(initial.year, 1900); assert(initial.writable);
    await evaluate(`const p=__worldStreamingPreview;for(const tool of ['flatten4','market2'])p.construction.confirm(await p.construction.plan(tool,{col:1599,row:1791}));p.simulation.advance(60000);await p.session.flush();return true;`); await waitFor(settled);
    console.log('Safari: construction and save complete');
    const frames = await evaluate(`return new Promise(resolve=>{const values=[];let previous;function frame(time){if(previous!==undefined)values.push(time-previous);previous=time;if(values.length<120){requestAnimationFrame(frame);return;}values.sort((a,b)=>a-b);resolve({samples:120,p95Ms:values[114],p99Ms:values[118]});}requestAnimationFrame(frame);});`);
    for (let i = 0; i < 24; i++) {
      await evaluate(`const p=__worldStreamingPreview;if(${i}%6===0)p.rotate();p.setFocus(${112 + i * 127 % 2800},${128 + i % 16 * 128});return true;`); await waitFor(settled);
    }
    const backup = await evaluate(`return __worldStreamingPreview.session.exportBackup();`); fs.writeFileSync(path.join(OUT, 'safari.heungshing'), backup);
    await command('/refresh', {}); await waitFor(settled);
    console.log('Safari: world reload complete');
    assert.equal(await evaluate('return HeungShingStorage.writable;'), true, 'Safari reload must keep its same-tab writer lease');
    assert.equal(await evaluate('return __worldStreamingPreview.delta.entities.size;'), 1);
    await evaluate('document.querySelector("header a").click();return true;'); await waitFor('typeof gameReady!=="undefined"&&gameReady');
    console.log('Safari: returned to main menu');
    await evaluate(`document.getElementById('btn-world-saves').click();return true;`);
    await waitFor('document.querySelector("#world-save-list-items button")');
    assert.equal(await evaluate('return getComputedStyle(document.getElementById("world-save-list")).visibility;'), 'visible');
    await evaluate(`[...document.querySelectorAll('#world-save-list-items button')].find(b=>b.textContent.includes('Safari 全港驗收')).click();return true;`); await waitFor(settled);
    const final = await evaluate(`const p=__worldStreamingPreview,s=p.stats();return {name:p.delta.header.city.name,entities:p.delta.entities.size,maxMounted:s.maxMounted,frameP95Ms:s.frameP95Ms,detailLoadP95Ms:s.detailLoadP95Ms,cache:s.terrain,minimap:s.minimap.cache,save:s.save,errors:p.errors,secureContext:isSecureContext,writable:HeungShingStorage.writable};`);
    assert.equal(final.entities, 1); assert(final.maxMounted <= 9); assert.equal(final.errors.length, 0); assert.equal(final.minimap.errors, 0);
    assert(final.writable);
    fs.writeFileSync(path.join(OUT, 'safari.png'), Buffer.from(await command('/screenshot'), 'base64'));
    fs.writeFileSync(path.join(OUT, 'safari-report.json'), JSON.stringify({ browser: session.capabilities, initial, frames, final, note: 'Native desktop Safari; physical iPhone acceptance is separate.' }, null, 2));
    console.log(JSON.stringify({ browser: 'Safari', version: session.capabilities.browserVersion, initial, frames, final }));
  } finally { await fetch(base, { method: 'DELETE' }).catch(() => {}); }
})().catch(error => { console.error(error); process.exitCode = 1; });
