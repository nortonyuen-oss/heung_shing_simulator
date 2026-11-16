#!/usr/bin/env node
// Real shared-game loading/render measurements. Synthetic roads exist only in
// this isolated browser and are never imported into a player's save.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const express = require('express'), { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
async function settled(page) {
  await page.waitForFunction(() => {
    const h = globalThis.__worldGameHost, s = h?.manager?.snapshot();
    return h?.ready && s.states.ACTIVE === s.wanted && s.activeIds.every(id => h.manager.wanted.has(id))
      && !s.states.UNMOUNTING && !s.states.MOUNTING && !h.regionalLod.cache.pending.size && !h.minimap.cache.pending.size;
  }, null, { timeout: 60000 });
}
async function beginFrames(page) {
  await page.evaluate(() => { globalThis.__loadFrames = []; const epoch = globalThis.__loadFrameEpoch = (globalThis.__loadFrameEpoch || 0) + 1; let last;
    function frame(time) { if (__loadFrameEpoch !== epoch) return; if (last !== undefined) __loadFrames.push(time-last); last=time; requestAnimationFrame(frame); } requestAnimationFrame(frame);
  });
}
async function endFrames(page) {
  return page.evaluate(() => { __loadFrameEpoch++; const values=__loadFrames, sorted=[...values].sort((a,b)=>a-b);
    return { frames:values.length, fps:values.length*1000/values.reduce((a,b)=>a+b,0), p95Ms:sorted[Math.floor(sorted.length*.95)],p99Ms:sorted[Math.floor(sorted.length*.99)] };
  });
}
async function sample(page, duration=5000) { await beginFrames(page); await page.waitForTimeout(duration); return endFrames(page); }
async function focus(page, col, row) {
  await page.evaluate(({col,row})=>{const h=__worldGameHost;h.adapter.centreCamera(activeScene.cameras.main,col,row);h.manager.setFocus(col,row);},{col,row});await settled(page);
}
(async()=>{
  const app=express();app.use(express.static(path.join(ROOT,'release/web')));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
    await page.addInitScript(()=>performance.setResourceTimingBufferSize(5000));
    page.on('pageerror',e=>errors.push(e.message));const start=Date.now();await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(()=>typeof gameReady!=='undefined'&&gameReady,null,{timeout:150000});const bootMs=Date.now()-start;
    await page.click('#btn-new-game');const choices=await page.locator('.setup-chip[data-source-id]').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.sourceId,selected:n.getAttribute('aria-checked')})));
    assert.equal(choices.at(-1).id,'hk-territory');assert.notEqual(choices.find(v=>v.selected==='true')?.id,'hk-territory');
    await page.click('[data-source-id="hk-territory"]');const launch=Date.now();await beginFrames(page);await page.click('#btn-start-city');await settled(page);
    const initialLoad={milliseconds:Date.now()-launch,...await endFrames(page)};
    assert.equal(await page.evaluate(()=>typeof HK_TERRAIN_TILES),'undefined');
    const rleRequested=await page.evaluate(()=>{const url=new URL(resolveBundledAssetPath('hk-terrain-tiles.js'),location.href).href;return performance.getEntriesByType('resource').some(r=>r.name===url);});assert.equal(rleRequested,false);
    const steady=await sample(page);await beginFrames(page);
    for(const[col,row]of[[1697,1832],[1980,1450],[1600,1000],[2750,1700],[900,1800],[1400,700],[2200,1100],[1593,1200]])await focus(page,col,row);
    const travel=await endFrames(page);
    await page.evaluate(()=>{
      const h=__worldGameHost;setGameSpeed(GAME_SPEEDS.PAUSED);clearInterval(h.timer);clearTimeout(h.buildSaveTimer);
      for(let row=500;row<750;row++)for(let col=500;col<692;col++){
        mapData.sparseCells.set(`${row}:${col}`,ROAD);heightMap.sparseCells.set(`${row}:${col}`,0);h.modifiedStorageChunks.add(`s:${Math.floor(col/64)}:${Math.floor(row/64)}`);
      }
      roadTileCount=48000;h.stateVersion++;h.roadVersion++;h.lastVisualKey='';h.refreshChunkSummaryTable();
    });
    const coldRoads=await sample(page);await focus(page,590,620);
    const cdp=await context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
    const denseRoads=await sample(page),{profile}=await cdp.send('Profiler.stop'),renderedRoadImages=await page.evaluate(()=>activeScene.tileSprites.size);assert(renderedRoadImages<9216);
    const stats=await page.evaluate(()=>__worldGameHost.stats());assert(stats.maxMounted<=9);assert(stats.terrain.decodedBytes<=2097152);assert(stats.terrain.packBytes<=1048576);
    assert(stats.minimap.cache.bytes<=4194304);assert(stats.regionalLod.bytes<=8388608);assert.deepEqual(errors,[]);
    const report={browser:await browser.version(),note:'Desktop Chrome, 1280x900; 48k synthetic roads are paused for render isolation. Not a physical iPhone or a mature populated-city benchmark.',bootMs,initialLoad,steady,travel,coldRoads,denseRoads,renderedRoadImages,legacyFullTerrainRequested:rleRequested,stats};
    fs.mkdirSync(path.join(ROOT,'test-results/world-loading'),{recursive:true});fs.writeFileSync(path.join(ROOT,'test-results/world-loading/dense-roads-cpu.json'),JSON.stringify(profile));
    fs.writeFileSync(path.join(ROOT,'test-results/world-loading/report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
    for(const[label,result]of Object.entries({steady,coldRoads,denseRoads}))assert(result.fps>=30,`${label} below 30 FPS (${result.fps})`);
    await context.close();
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
