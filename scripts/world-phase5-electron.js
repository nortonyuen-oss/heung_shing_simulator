// Run with drive-electron.js and an isolated DRIVE_USER_DATA directory.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
module.exports = async ({ evaluate, waitFor, sleep, cdp, screenshot, consoleLines }) => {
  const out = path.resolve(__dirname, '../test-results/world-phase5'); fs.mkdirSync(out, { recursive: true });
  await waitFor('typeof gameReady!=="undefined"&&gameReady', 180000);
  await evaluate(`setLanguage('zhHant');document.getElementById('btn-new-game').click();document.querySelector('[data-source-id="hk-territory"]').click();document.getElementById('city-name-input').value='Electron 全港驗收';document.getElementById('btn-start-city').click();true;`);
  const settled = 'globalThis.__worldStreamingPreview?.ready && __worldStreamingPreview.manager.snapshot().states.ACTIVE===__worldStreamingPreview.manager.snapshot().wanted';
  await waitFor(settled, 90000);
  const initial = await evaluate('({name:__worldStreamingPreview.delta.header.city.name,platform:HEUNG_SHING_CONFIG.platform,slot:__worldStreamingPreview.session.id})');
  assert.equal(initial.name, 'Electron 全港驗收'); assert.equal(initial.platform, 'desktop');
  await evaluate(`(async()=>{const p=__worldStreamingPreview;for(const tool of ['flatten4','market2'])p.construction.confirm(await p.construction.plan(tool,{col:1599,row:1791}));await p.session.flush();return true;})()`); await waitFor(settled, 60000);
  const window = await evaluate(`new Promise(resolve=>{const values=[];let previous;function frame(time){if(previous!==undefined)values.push(time-previous);previous=time;if(values.length<180){requestAnimationFrame(frame);return;}values.sort((a,b)=>a-b);resolve({samples:180,p95Ms:values[171],p99Ms:values[178]});}requestAnimationFrame(frame);})`);
  for (let i = 0; i < 40; i++) { await evaluate(`(()=>{const p=__worldStreamingPreview;if(${i}%10===0)p.rotate();p.setFocus(${112 + i * 127 % 2800},${128 + i % 16 * 128});return true;})()`); await waitFor(settled, 60000); }
  await cdp('HeapProfiler.collectGarbage');
  const final = await evaluate(`(()=>{const p=__worldStreamingPreview,s=p.stats(),gl=p.game.renderer.gl,info=gl?.getExtension('WEBGL_debug_renderer_info');return {name:p.delta.header.city.name,entities:p.delta.entities.size,maxMounted:s.maxMounted,objects:s.renderer.gameObjects,cache:s.terrain,minimap:s.minimap.cache,save:s.save,frameP95Ms:s.frameP95Ms,detailLoadP95Ms:s.detailLoadP95Ms,heapBytes:performance.memory?.usedJSHeapSize??null,renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):'WebGL',errors:p.errors};})()`);
  assert.equal(final.entities, 1); assert(final.maxMounted <= 9); assert.equal(final.errors.length, 0);
  const reload = await evaluate('location.href'); await cdp('Page.navigate', { url: reload }); await waitFor(settled, 60000); assert.equal(await evaluate('__worldStreamingPreview.delta.entities.size'), 1);
  await screenshot(path.join(out, 'electron.png'));
  fs.writeFileSync(path.join(out, 'electron-report.json'), JSON.stringify({ initial, window, final, runtimeExceptions: consoleLines.filter(line => line.startsWith('EXCEPTION:')) }, null, 2));
  console.log(JSON.stringify({ stage: 'electron', initial, window, final }));
};
