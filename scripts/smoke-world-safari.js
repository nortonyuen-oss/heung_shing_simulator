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
const settled = 'globalThis.__worldGameHost?.ready && __worldGameHost.manager.snapshot().states.ACTIVE===__worldGameHost.manager.snapshot().wanted';
(async () => {
 try {
  await command('/timeouts', { script: 120000, pageLoad: 120000, implicit: 0 }); await command('/window/rect', { width: 1280, height: 900 });
  await command('/url', { url: origin }); await waitFor('typeof gameReady!=="undefined"&&gameReady');
  await evaluate(`if(document.getElementById('btn-world-saves'))throw Error('Obsolete entry'); document.getElementById('btn-new-game').click();document.querySelector('[data-source-id="hk-territory"]').click();document.getElementById('city-name-input').value='Safari 全境整合';document.getElementById('btn-start-city').click();return true;`);
  await waitFor(settled);
  const initial = await evaluate(`return {name:city.name,id:__worldGameHost.session.id,writable:HeungShingStorage.writable};`); assert.equal(initial.name,'Safari 全境整合'); assert(initial.writable);
  for (const tile of [{ col:1697,row:1832 }, { col:1980,row:1450 }]) {
    for (const mode of ['world','local']) {
      const point = await evaluate(`document.querySelector('[data-city-minimap-mode="${mode}"]').click();const p=__worldGameHost.minimap.tileToPoint(${tile.col},${tile.row}),r=document.getElementById('city-minimap-canvas').getBoundingClientRect();return {x:Math.round(r.left+p.x/512*r.width),y:Math.round(r.top+p.y/256*r.height)};`);
      await command('/actions',{actions:[{type:'pointer',id:'world-map-test',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,origin:'viewport',x:point.x,y:point.y},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});
      await waitFor(`Math.hypot(__worldGameHost.viewpoint().col-${tile.col},__worldGameHost.viewpoint().row-${tile.row})<${mode==='world'?24:3}`); await waitFor(settled);
    }
    assert.notEqual(await evaluate(`return mapData[${tile.row}][${tile.col}];`),5,'island/runway remains land after real Safari minimap navigation');
  }
  await evaluate(`__worldGameHost.adapter.centreCamera(activeScene.cameras.main,1593,1200);return true;`);await waitFor(settled);
  await evaluate(`setGameSpeed(GAME_SPEEDS.PAUSED);mapData[1200][1593]=GROUND;heightMap[1200][1593]=0;selectedTool='road';applyToolAt(activeScene,1200,1593);if(!await saveGame())throw Error('Save failed');return true;`);
  for(let i=0;i<12;i++){await evaluate(`__worldGameHost.adapter.centreCamera(activeScene.cameras.main,${112+i*127%2800},${128+i%12*128});return true;`);await waitFor(settled);}
  await evaluate(`if(!await saveGame())throw Error('Save failed');return true;`); await command('/refresh',{}); await waitFor(settled);
  assert.equal(await evaluate('return mapData[1200][1593];'),2); assert(await evaluate('return HeungShingStorage.writable;'));
  await evaluate('await returnToMainMenu(); document.getElementById("btn-continue").click();return true;');
  await waitFor('document.querySelector("[data-world-slot]")'); await evaluate(`document.querySelector('[data-world-slot="${initial.id}"]').click();return true;`);await waitFor(settled);
  const final = await evaluate(`return {city:city.name,maxMounted:__worldGameHost.manager.snapshot().maxMounted,cache:__worldGameHost.provider.snapshot(),minimap:__worldGameHost.minimap.snapshot(),frames:window.__frameErrors||[],save:__worldGameHost.session.diagnostics()};`);
  assert(final.maxMounted<=9);assert.equal(final.frames.length,0);
  assert(final.minimap.cache.bytes<=4194304);assert.equal(final.minimap.cache.errors,0);
  fs.writeFileSync(path.join(OUT,'safari-integration.png'),Buffer.from(await command('/screenshot'),'base64'));
  fs.writeFileSync(path.join(OUT,'safari-integration-report.json'),JSON.stringify({browser:session.capabilities,initial,final},null,2));console.log(JSON.stringify({browser:'Safari',initial,final}));
 } finally { await fetch(base,{method:'DELETE'}).catch(()=>{}); }
})().catch(error=>{console.error(error);process.exitCode=1;});
