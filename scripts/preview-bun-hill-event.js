// Private Electron profile only. Build an actual 80x60 m ground and shoreline.
const fs=require('node:fs');
module.exports=async({evaluate,waitFor,bringToFront,screenshot,sleep,consoleLines})=>{
 if(!process.env.DRIVE_USER_DATA)throw Error('An isolated profile is required');
 await waitFor('typeof activeScene!=="undefined"&&gameReady');
 await evaluate('startNewGame("搶包山比例測試城")');
 const prepared=await evaluate(`(()=>{
  stopSimTimer();simPaused=true;hideLandingScreen();getCityFestivalState().enabled=false;
  const scene=activeScene;
  for(let r=36;r<=47;r++)for(let c=36;c<=48;c++){
    mapData[r][c]=r<=39?WATER:GROUND;heightMap[r][c]=0;
    scene.treeSprites?.get(r+':'+c)?.forEach(s=>s.destroy());scene.treeSprites?.delete(r+':'+c);
    const debris=scene.debrisSprites?.get(r+':'+c);debris?.destroy();scene.debrisSprites?.delete(r+':'+c);
  }
  refreshAllTiles(scene);positionAllTiles(scene);
  const results=[];
  for(let c=39;c<=44;c++){results.push(placePromenade(scene,40,c,{quiet:true}));getPromenadeState().tiles['40:'+c]=2;}
  for(let r=41;r<=43;r++)for(let c=40;c<=43;c++)results.push(placePark(scene,r,c,{id:'event_ground',type:'event_ground',spriteKey:'event_ground',footprintCols:1,footprintRows:1}));
  onPromenadeChanged(scene);setVisualRouteCalibrationTestModeEnabled(true);
  return {placed:results.every(Boolean),venue:selectBunHillVenue(getBunHillMapVenueContext(scene))};
 })()`);
 if(!prepared.placed||prepared.venue?.layoutId!=='standard')throw Error(JSON.stringify(prepared));
 const standardCrowds=15,standardProps=10; // three towers, stage and six fence-mounted flower boards
 const before=await evaluate('JSON.stringify(city)');
 await evaluate('document.querySelector(".vrp-bun-race-btn").click();true');
 await waitFor('activeScene.bunHillEventSession?.assets&&document.getElementById("bun-hill-map-event")');
 await evaluate('visualRoutePerformancePanelVisible=false;document.getElementById("visual-route-performance-panel").hidden=true;true');
 await bringToFront();await sleep(700);
 const frames=[];fs.mkdirSync('.data/bun-hill-design',{recursive:true});
 for(const seconds of [0,20,70,170,180]) {
  await evaluate(`(()=>{const session=activeScene.bunHillEventSession;session.offset=1080+${seconds}/12;session.frame=null;updateBunHillMapEvent(activeScene,activeScene.time.now);return true;})()`);
  await sleep(160);
  const state=await evaluate(`(()=>{
    const session=activeScene.bunHillEventSession,tower=activeScene.bunHillSprites.get('tower');
    const meta=session.assets.geometry.parts[tower.texture.key.endsWith('_m.png')?'bunHill1_m':'bunHill1'];
    return {time:session.frame.time,phase:session.phase,count:activeScene.bunHillSprites.size,
      towerBodyPx:(meta.body[0][1]-meta.body[1][1])*tower.bunHillPhysicalScale,towerHeightM:meta.heightM,
      railPx:(meta.rail[0][1]-meta.rail[1][1])*tower.bunHillPhysicalScale,
      fences:session.fences?.length||0,
      crowdHeights:[...activeScene.bunHillSprites].filter(([id])=>id.startsWith('crowd:')).map(([id,s])=>{const m=session.assets.crowds[s.texture.key.split(':').at(-1).replace('fx_db','').replace('.png','')];return m.personHeightPx*s.bunHillPhysicalScale}),
      athletes:session.frame.contestants.map(p=>{const s=activeScene.bunHillSprites.get(p.id),key=s.texture.key.split(':').at(-1).replace('.png','');const m=session.assets.climbers.frames[key];return {id:p.id,pose:p.pose,heightM:s.bunHillClimbHeightM,towerIndex:s.bunHillTowerIndex,ceilingM:session.assets.geometry.parts['bunHill'+(s.bunHillTowerIndex+1)].heightM-1.7,personPx:m.personHeightPx*s.bunHillPhysicalScale,depth:s.depth,visible:s.visible};})};
  })()`);
  if(state.crowdHeights.length!==standardCrowds||state.crowdHeights.some(h=>Math.abs(h-8.5)>.001)||!state.fences||state.count!==standardProps+12+standardCrowds||Math.abs(state.railPx-5.5)>.001||Math.abs(state.towerBodyPx-state.towerHeightM*5)>.001||state.athletes.length!==12||state.athletes.some(a=>Math.abs(a.personPx-8.5)>.001||a.heightM>a.ceilingM))throw Error(JSON.stringify(state));
  for(const towerIndex of [0,1,2])if(state.athletes.filter(a=>a.towerIndex===towerIndex).length!==4)throw Error("Missing climbers on tower "+towerIndex);
  frames.push(state);await screenshot('.data/bun-hill-design/map-event-'+seconds+'.png');
 }
 await evaluate(`(()=>{const s=activeScene.bunHillEventSession,l=BUN_HILL_LAYOUTS[s.venue.layoutId];s.offset=1080+70/12;updateBunHillMapEvent(activeScene,activeScene.time.now);const p=bunHillMapPoint(activeScene,s.venue,l.widthM/2,l.depthM/2);setMapZoom(activeScene,2);activeScene.cameras.main.centerOn(p.x,p.y);s.root.hidden=true;return true;})()`);
 await sleep(300);await screenshot('.data/bun-hill-design/map-event-layout.png');
 await evaluate(`(()=>{const s=activeScene.bunHillEventSession;s.root.hidden=false;const p=bunHillMapPoint(activeScene,s.venue,...BUN_HILL_LAYOUTS[s.venue.layoutId].tower);setMapZoom(activeScene,4);activeScene.cameras.main.centerOn(p.x,p.y-35);return true;})()`);
 await sleep(300);await screenshot('.data/bun-hill-design/map-event-closeup.png');
 const rotations=[];
 for(let i=0;i<4;i++){
  await evaluate('rotateMap(activeScene);activeScene.bunHillEventSession.offset=1080+70/12;updateBunHillMapEvent(activeScene,activeScene.time.now);true');
  await sleep(200);
  rotations.push(await evaluate(`(()=>{const s=activeScene.bunHillEventSession,p=bunHillMapPoint(activeScene,s.venue,...BUN_HILL_LAYOUTS[s.venue.layoutId].tower),t=activeScene.bunHillSprites.get('tower');return {rotation:mapRotation,texture:t.texture.key,aligned:Math.abs(t.x-p.x)<.001&&Math.abs(t.y-p.y)<.001,count:activeScene.bunHillSprites.size};})()`));
 }
 if(rotations.some(r=>!r.aligned||r.count!==standardProps+12+standardCrowds))throw Error(JSON.stringify(rotations));
 await evaluate(`(()=>{const session=activeScene.bunHillEventSession;session.offset=1080;session.playing=true;session.previous=null;return true;})()`);
 await sleep(450);const playing=await evaluate('activeScene.bunHillEventSession.offset>1080');
 const ending=await evaluate(`(()=>{const session=activeScene.bunHillEventSession;session.playing=false;session.offset=1115;updateBunHillMapEvent(activeScene,activeScene.time.now);
   const safelyReturned=session.frame.contestants.every(p=>p.pose==='grounded'&&p.heightM===0);
   session.offset=1140;updateBunHillMapEvent(activeScene,activeScene.time.now);const teardown=activeScene.bunHillSprites.size;
   session.offset=1200;updateBunHillMapEvent(activeScene,activeScene.time.now);return {safelyReturned,teardown,closed:activeScene.bunHillSprites.size===0};})()`);
 if(!ending.safelyReturned||ending.teardown!==standardProps||!ending.closed)throw Error(JSON.stringify(ending));
 await evaluate('closeBunHillMapEvent(activeScene);true');
 const after=await evaluate('JSON.stringify(city)');
 const cleanup=await evaluate('activeScene.bunHillSprites.size===0&&!document.getElementById("bun-hill-map-event")&&!activeScene.bunHillEventSession&&!activeScene.textures.getTextureKeys().some(k=>k.startsWith("bun-event:"))');
 // Map rotation is a view change and not part of city; the rehearsal itself must not write city.
 if(before!==after||!cleanup||!playing)throw Error(JSON.stringify({cityUnchanged:before===after,cleanup,playing}));
 const exceptions=consoleLines.filter(s=>s.includes('EXCEPTION'));if(exceptions.length)throw Error(exceptions.join('\n'));
 // Rebuild only the test city's grounds to confirm the smaller 60x40m arrangement too.
 const compact=await evaluate(`(()=>{for(let r=41;r<=43;r++)for(let c=40;c<=43;c++)if(r===43||c===43)removeBuilding(activeScene,r,c);
   refreshInfrastructureEffects(activeScene);return selectBunHillVenue(getBunHillMapVenueContext(activeScene));})()`);
 if(compact?.layoutId!=='compact')throw Error(JSON.stringify(compact));
 await evaluate('startBunHillEventTest(activeScene,true)');
 await waitFor('activeScene.bunHillSprites.size===34');
 await sleep(200);await screenshot('.data/bun-hill-design/map-event-compact.png');
 await evaluate('setVisualRouteCalibrationTestModeEnabled(false);true');
 if(!await evaluate('!activeScene.bunHillEventSession&&activeScene.bunHillSprites.size===0'))throw Error('Leaving test mode did not clean up');
 const result={prepared,frames,rotations,playing,ending,cleanup,compact,testModeCleanup:true,cityUnchanged:true};
 fs.writeFileSync('.data/bun-hill-design/map-event-check.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
};
