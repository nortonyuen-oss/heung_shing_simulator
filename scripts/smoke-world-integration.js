#!/usr/bin/env node
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const express = require('express'), { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
(async () => {
 const app = express(); app.use(express.static(path.join(ROOT, 'release/web')));
 const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
 let browser;
 try {
  browser = await chromium.launch({ channel:'chrome', headless:true });
  const context = await browser.newContext({viewport:{width:1280,height:900}}), page = await context.newPage(), errors=[];
  page.on('pageerror', e => {errors.push(e.message); console.log('PAGE ERROR',e.message);});
  page.on('console', m => { if(m.type()==='error') console.log('CONSOLE',m.text().slice(0,400)); });
  page.on('dialog',d=>d.accept());
  const origin=`http://127.0.0.1:${server.address().port}`;
  await page.goto(origin); await page.waitForFunction(()=>typeof gameReady!=='undefined' && gameReady,null,{timeout:150000});
  console.log('ready'); assert.equal(await page.locator('#btn-world-saves').count(),0);
  await page.click('#btn-new-game');
  const choices=await page.locator('.setup-chip[data-source-id]').evaluateAll(elements=>elements.map(e=>({id:e.dataset.sourceId,selected:e.getAttribute('aria-checked')})));
  assert.equal(choices.at(-1).id,'hk-territory');assert.notEqual(choices.find(c=>c.selected==='true')?.id,'hk-territory');
  assert.equal(await page.evaluate(()=>typeof HK_TERRAIN_TILES),'undefined','ordinary boot must not decode the legacy territory source');
  await page.click('[data-source-id="hk-territory"]'); await page.fill('#city-name-input','融入測試城');
  await page.locator('#newgame-start-year button').filter({hasText:/^1900$/}).click();
  assert(await page.locator('#newgame-road-tile-set').isVisible());
  await page.click('#btn-start-city');
  await page.waitForFunction(()=>globalThis.__worldGameHost?.ready,null,{timeout:120000});
  await page.waitForFunction(()=>__worldGameHost.manager.snapshot().states.ACTIVE===9,null,{timeout:90000});
  console.log('world', await page.evaluate(()=>({size:[MAP_WIDTH,MAP_HEIGHT],city:city.name,stats:__worldGameHost.manager.snapshot(),frames:window.__frameErrors})));
  assert.equal(new URL(page.url()).pathname,'/');
  assert.equal(await page.evaluate(()=>typeof HK_TERRAIN_TILES),'undefined','streamed territory uses packs, not the full RLE');
  assert.deepEqual(await page.evaluate(()=>{const v=__worldGameHost.viewpoint();return {col:v.col,row:v.row};}),{col:1593,row:1200},'new territory retains its original geographic starting point');
  const blocked=await page.evaluate(()=>{selectedTool='road';return applyToolAt(activeScene,100,100);});assert.equal(blocked.reason,'loading');assert.equal(blocked.cost,0);
  assert.equal(await page.evaluate(()=>__worldGameHost.chunkTable.rows.size),0,'unexplored/undeveloped chunks have no summary row');
  const built = await page.evaluate(async()=>{
   setGameSpeed(GAME_SPEEDS.PAUSED);
   const h=__worldGameHost, scene=activeScene, r=1200,c=1593, initialRevision=h.session.storageRevision;
   for(let row=r;row<r+6;row++)for(let col=c;col<c+10;col++){mapData[row][col]=GROUND;heightMap[row][col]=0;}
   selectedTool='road'; const road=applyToolAt(scene,r+2,c+2);
   selectedTool='zone-res'; const zone=applyToolAt(scene,r+3,c+2);
   selectedTool='house'; const house=applyToolAt(scene,r+4,c+4);
   const started=performance.now();while(h.session.storageRevision===initialRevision&&performance.now()-started<10000)await new Promise(resolve=>setTimeout(resolve,50));
   if(h.session.storageRevision===initialRevision)throw Error('Construction autosave did not run');
   const saved=await saveGame();
   return {road,zone,house,saved,buildingIds:Object.keys(buildingData),budget:city.budget,slot:h.session.id,tick:city.tick,save:h.session.exportBackup().length};
  }); console.log('built',built);
  const summaries=await page.evaluate(()=>__worldGameHost.chunkTable.serialize());assert(summaries.length>0);assert(summaries.length<4);assert.equal(Object.keys(summaries[0]).length,9); assert(built.saved); assert(built.road.changed); assert(built.zone.changed); assert(built.buildingIds.length);
  await page.evaluate(()=>{const h=__worldGameHost;h.adapter.centreCamera(activeScene.cameras.main,40,40);});
  await page.waitForFunction(()=>__worldGameHost.manager.snapshot().activeIds.every(id=>Number(id.split(':')[1])<4),null,{timeout:30000});
  const far=await page.evaluate(()=>({sprites:activeScene.buildingSprites.size,logical:Object.keys(buildingData).length,occupied:activeScene.buildingSprites.has('1204:1597'),tiles:getZoneGrowthTiles().length}));
  console.log('far',far);assert.equal(far.sprites,0);assert(far.occupied);assert.equal(far.logical,built.buildingIds.length);
  await page.evaluate(()=>{updatePowerGrid(activeScene);updateServiceCoverage();updateTrafficMap();runEconomy(activeScene);});
  await page.evaluate(()=>{__worldGameHost.adapter.centreCamera(activeScene.cameras.main,1593,1200);rotateMap(activeScene);});
  await page.waitForFunction(()=>__worldGameHost.manager.snapshot().states.ACTIVE===9,null,{timeout:30000});
  assert(await page.evaluate(()=>saveGame()));
  await page.reload();await page.waitForFunction(()=>globalThis.__worldGameHost?.ready,null,{timeout:150000});
  const restored=await page.evaluate(()=>({slot:__worldGameHost.session.id,name:city.name,road:mapData[1202][1595],zone:zoneMap[1203][1595],buildings:Object.keys(buildingData).length,rotation:mapRotation,frames:window.__frameErrors}));
  console.log('restored',restored); assert.equal(restored.slot,built.slot);assert.equal(restored.road,2);assert.equal(restored.zone,1);assert.equal(restored.rotation,1);
  await page.evaluate(()=>returnToMainMenu());
  await page.waitForFunction(()=>!isWorldGameActive()&&MAP_WIDTH===256&&MAP_HEIGHT===256&&activeScene.tileSprites.size===65536,null,{timeout:30000});
  const legacySerialization=await page.evaluate(async()=>{const payload=buildSavePayload();const result=await serializeSavePayload(payload,true);return {offThread:result.offThread,width:payload.save_data.mapWidth};});
  assert(legacySerialization.offThread,'ordinary-city autosave payload remains Worker-cloneable');assert.equal(legacySerialization.width,256);
  await page.click('#btn-continue'); await page.locator(`[data-world-slot="${built.slot}"]`).click();
  await page.waitForFunction(()=>globalThis.__worldGameHost?.ready,null,{timeout:90000});
  const debug=await context.newCDPSession(page);await debug.send('HeapProfiler.collectGarbage');const heapBefore=await page.evaluate(()=>performance.memory?.usedJSHeapSize||0);
  for(let i=0;i<28;i++){
   await page.evaluate(i=>{const h=__worldGameHost;const col=128+i*127%2800,row=128+i%12*160;h.adapter.centreCamera(activeScene.cameras.main,col,row);h.manager.setFocus(col,row);},i);
   await page.waitForFunction(()=>{const h=__worldGameHost,s=h.manager.snapshot();return s.states.ACTIVE===s.wanted&&!s.states.UNMOUNTING&&!s.states.MOUNTING;},null,{timeout:30000});
   const stats=await page.evaluate(()=>__worldGameHost.stats());assert(stats.maxMounted<=9);assert(stats.terrain.decodedBytes<=2097152);assert(stats.terrain.packBytes<=1048576);assert.equal(stats.summaryRecords,summaries.length);assert(stats.regionalLod.bytes<=8388608);assert(stats.regionalLod.textureBytes<=8388608);assert(stats.regionalLod.textures<=4);
  }
  await debug.send('HeapProfiler.collectGarbage');const heapAfter=await page.evaluate(()=>performance.memory?.usedJSHeapSize||0);assert(heapAfter-heapBefore<24*1024*1024);
  console.log('jump-pressure',{...await page.evaluate(()=>__worldGameHost.stats()),heapBefore,heapAfter});
  await page.evaluate(()=>__worldGameHost.adapter.centreCamera(activeScene.cameras.main,1593,1200));
  const frames=await page.evaluate(()=>window.__frameErrors||[]);assert.deepEqual(frames,[]);assert.deepEqual(errors,[]);
  fs.mkdirSync(path.join(ROOT,'test-results/world-integration'),{recursive:true});
  await page.waitForFunction(()=>__worldGameHost.manager.snapshot().states.ACTIVE===9,null,{timeout:30000});
  await page.evaluate(()=>{setGameSpeed(GAME_SPEEDS.PAUSED);city.timeOfDayMinutes=720;updateDynamicLighting(activeScene);});
  await page.waitForTimeout(400);
  console.log('visual',await page.evaluate(()=>({view:__worldGameHost.viewpoint(),camera:{scrollX:activeScene.cameras.main.scrollX,scrollY:activeScene.cameras.main.scrollY},objects:__worldGameHost.renderer.snapshot(),lod:{x:__worldGameHost.lod.image.x,y:__worldGameHost.lod.image.y,visible:__worldGameHost.lod.image.visible},scene:activeScene.scene.isVisible()})));
  await page.screenshot({path:path.join(ROOT,'test-results/world-integration/shared-game.png')});
  console.log('PASS shared scene, original tools and simulation, sparse offscreen entities, reload and unified load menu');
  await page.evaluate(()=>returnToMainMenu());
  const realSampler=await page.evaluate(async()=>{
    performance.clearResourceTimings();
    const source=createGeneratedMapSource('hk-harbour','lazy-real-sampler-test','real'),terrain=await source.getTerrain();
    await source.getTerrain();const url=new URL(resolveBundledAssetPath('hk-terrain-tiles.js'),location.href).href;
    return {width:terrain.mapData[0].length,height:terrain.mapData.length,requests:performance.getEntriesByName(url).length};
  });assert.deepEqual(realSampler,{width:256,height:256,requests:1});
  console.log('PASS legacy real-terrain sampler loads once on explicit demand');
  await context.close();
 } catch(e){console.error(e);process.exitCode=1;} finally{await browser?.close();await new Promise(r=>server.close(r));}
})();
