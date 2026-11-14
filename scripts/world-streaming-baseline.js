// Used by scripts/drive-electron.js with a separate DRIVE_USER_DATA profile.
// The shipped real-city fixture is loaded into that disposable profile, never a player slot.
const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({ evaluate, waitFor, sleep, cdp }) => {
  const output = path.resolve(__dirname, '../test-results/world-streaming');
  fs.mkdirSync(output, { recursive: true });
  await waitFor('typeof gameReady !== "undefined" && gameReady', 180000);
  await evaluate(`(async()=>{
    const raw=await(await fetch('/UI/attract-city.json')).json(), cityState=raw.save_data.city;
    const payload={city_name:cityState.name,population:Number(cityState.population),year:cityState.year,
      month:cityState.month,budget:cityState.budget,save_data:raw.save_data};
    const response=await fetch('/api/saves',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!response.ok)throw new Error('Baseline fixture could not be staged');
    const row=await response.json();
    if(!await loadSaveById(row.id,activeScene))throw new Error('Baseline fixture could not be loaded');
    setGameSpeed(GAME_SPEEDS.PAUSED);hideLandingScreen();
    return true;
  })()`);
  await sleep(4000);
  await cdp('HeapProfiler.collectGarbage');
  // A fresh rAF window excludes startup/asset-loading frames from the steady-state baseline.
  const frameWindow = await evaluate(`new Promise(resolve=>{
    const values=[];let previous;
    function frame(time){
      if(previous!==undefined)values.push(time-previous);previous=time;
      if(values.length<120){requestAnimationFrame(frame);return;}
      const sorted=[...values].sort((a,b)=>a-b),mean=values.reduce((a,b)=>a+b,0)/values.length;
      resolve({samples:values.length,meanMs:mean,p95Ms:sorted[Math.floor(sorted.length*.95)],p99Ms:sorted[Math.floor(sorted.length*.99)],fps:1000/mean});
    }requestAnimationFrame(frame);
  })`);
  const legacy = await evaluate(`(()=>{
    const scene=activeScene,camera=scene.cameras.main,gl=scene.game.renderer.gl;
    const info=gl?.getExtension('WEBGL_debug_renderer_info');
    return {mapWidth:MAP_WIDTH,mapHeight:MAP_HEIGHT,terrainObjects:scene.tileSprites.size,
      buildingAnchors:Object.keys(buildingData).length,viewportCull:scene.viewportCullStats,
      camera:{width:camera.width,height:camera.height,zoom:camera.zoom,rotation:mapRotation},
      renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl?'WebGL':'Canvas',
      jsHeapBytes:performance.memory?.usedJSHeapSize??null,
      performance:typeof getVisualRoutePerformanceSnapshot==='function'?getVisualRoutePerformanceSnapshot(scene):null};
  })()`);
  legacy.frameWindow = frameWindow;
  fs.writeFileSync(path.join(output, 'legacy-baseline.json'), JSON.stringify(legacy, null, 2));
  console.log(JSON.stringify({ stage: 'legacy-baseline', terrainObjects: legacy.terrainObjects,
    buildingAnchors: legacy.buildingAnchors, renderer: legacy.renderer, jsHeapBytes: legacy.jsHeapBytes, frameWindow }));
  const url = await evaluate('new URL("/world/preview.html",location.href).href');
  await cdp('Page.navigate', { url });
  await waitFor('globalThis.__worldStreamingPreview?.ready && __worldStreamingPreview.stats().states.ACTIVE===9', 60000);
  await sleep(3000);
  await cdp('HeapProfiler.collectGarbage');
  const trial = await evaluate('__worldStreamingPreview.stats()');
  fs.writeFileSync(path.join(output, 'electron-trial.json'), JSON.stringify(trial, null, 2));
  console.log(JSON.stringify({ stage: 'electron-trial', active: trial.states.ACTIVE,
    gameObjects: trial.renderer.gameObjects, frameP95Ms: trial.frameP95Ms, jsHeapBytes: trial.jsHeapBytes }));
};
