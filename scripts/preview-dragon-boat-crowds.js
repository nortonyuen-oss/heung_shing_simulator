// Inspect spectators in an isolated copy of a saved city.
// DRIVE_USER_DATA=/tmp/<copied-profile> DRAGON_SAVE_ID=15845 node scripts/drive-electron.js scripts/preview-dragon-boat-crowds.js
const fs=require('node:fs');
module.exports=async({evaluate,waitFor,screenshot,sleep,consoleLines,bringToFront})=>{
 if(!process.env.DRIVE_USER_DATA)throw new Error('An isolated DRIVE_USER_DATA profile is required');
 await waitFor('typeof activeScene!=="undefined" && gameReady');
 const loaded=await evaluate('loadSaveById('+Number(process.env.DRAGON_SAVE_ID||15845)+',activeScene)');if(!loaded)throw new Error('Load failed: '+consoleLines.filter(s=>s.includes('[Load]')||s.includes('EXCEPTION')).join(' | '));
 await evaluate('hideLandingScreen();stopSimTimer();simPaused=true');await sleep(1800);
 const result=await evaluate(`(()=>{
 const ctx=getDragonBoatContext(activeScene),course=selectDragonBoatCourse(ctx,getCityFestivalState().venues.dragonBoat||'');
 return {name:city.name,year:city.year,month:city.month,budget:city.budget,population:city.population,enabled:isFestivalEnabled('dragonBoat'),tier:getFestivalTier('dragonBoat'),cost:getFestivalCost('dragonBoat',getFestivalTier('dragonBoat'),city.population),promenadeTiles:ctx.promenadeTiles.length,runs:ctx.runs.map(r=>r.length),course,space:course?dragonBoatCourseSpace(course):null,weather:city.weather,existingRun:city.festivals?.dragonBoat?{status:city.festivals.dragonBoat.status,reason:city.festivals.dragonBoat.reason,course:city.festivals.dragonBoat.course}:null};
 })()`);
 fs.mkdirSync('.data/dragon-boat-crowd-preview',{recursive:true});fs.writeFileSync('.data/dragon-boat-crowd-preview/check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 if(result.course){
 await evaluate(`(()=>{const scene=activeScene,c=${JSON.stringify(result.course)};city.month=getFestivalMonth('dragonBoat',city.year);city.timeOfDayMinutes=915;getCityFestivalState().venues.dragonBoat=c.id;createCityDragonBoatRun(scene,915,getDragonBoatContext(scene));city.timeOfDayMinutes=915;const p=dbPoint(c,c.distanceM/40,1.5);scene.cameras.main.setZoom(.85);centerCameraOnTile(scene,Math.round(p.row),Math.round(p.col));})();`);
 await bringToFront();
 try{await waitFor('Array.from(activeScene.dragonBoatSprites?.values()||[]).some(s=>s.festivalPlacement?.crowd)',60000);}catch(e){console.log('CHECK FAILURE',await evaluate('({run:city.festivals.dragonBoat.status,minute:city.timeOfDayMinutes,loaded:activeScene.dragonBoatLoaded,loading:activeScene.dragonBoatLoading,count:activeScene.dragonBoatSprites?.size})'));console.log(consoleLines.filter(s=>s.includes('EXCEPTION')||s.includes('error')).join('\n'));throw e;}await sleep(1000);await evaluate('updateHUD();updateTopbarGameTime()');await bringToFront();await screenshot('.data/dragon-boat-crowd-preview/course.png');
 const check=await evaluate(`(()=>{const sprites=Array.from(activeScene.dragonBoatSprites.values()).filter(s=>s.festivalPlacement.crowd);return {crowdGroups:sprites.length,people:sprites.length*7,allOnLand:sprites.every(s=>mapData[Math.round(s.festivalPlacement.row)][Math.round(s.festivalPlacement.col)]!==WATER),variants:[...new Set(sprites.map(s=>s.festivalPlacement.partId))],sizes:sprites.map(s=>{const m=festivalTextureMeta[s.festivalTextureKey],mapping=getModelTexturePixelMapping(m.file,{width:s.frame.width,height:s.frame.height});return {part:s.festivalPlacement.partId,adultHeightPx:s.scaleY*m.personHeightPx*mapping.resize};})};})()`);
 const density=await evaluate(`(()=>{
  const counts={},c=city.festivals.dragonBoat.course,n=DB_STEPS[c.sea];
  const items=Array.from(activeScene.dragonBoatSprites.values()).filter(s=>s.festivalPlacement.crowd).map(s=>s.festivalPlacement);
  for(const p of items){const key=Math.round(p.row)+':'+Math.round(p.col);counts[key]=(counts[key]||0)+1;}
  return {groupsPerTile:counts,allAtShore:items.every(p=>Math.abs(((p.row-Math.round(p.row))*n[0]+(p.col-Math.round(p.col))*n[1])*20-7)<1e-8)};
 })()`);
 Object.assign(check,density);
 if(!check.allAtShore||Object.values(check.groupsPerTile).some(n=>n!==3))throw new Error(JSON.stringify(check));
 if(!check.allOnLand||!check.crowdGroups||check.sizes.some(s=>Math.abs(s.adultHeightPx-8.5)>.01))throw new Error(JSON.stringify(check));
 fs.writeFileSync('.data/dragon-boat-crowd-preview/crowd-check.json',JSON.stringify(check,null,2));console.log('CROWDS',JSON.stringify(check));
 await evaluate(`(()=>{const sprite=Array.from(activeScene.dragonBoatSprites.values()).find(s=>s.festivalPlacement.crowd),p=sprite.festivalPlacement;activeScene.cameras.main.setZoom(2.4);updateMapNavigationControls(activeScene);centerCameraOnTile(activeScene,Math.round(p.row),Math.round(p.col));})();`);await sleep(400);await bringToFront();await screenshot('.data/dragon-boat-crowd-preview/closeup.png');
 await evaluate('city.timeOfDayMinutes=1020');await sleep(400);const remaining=await evaluate('Array.from(activeScene.dragonBoatSprites.values()).filter(s=>s.festivalPlacement.crowd).length');if(remaining)throw new Error('Crowds remain after cleanup');console.log('17:00 crowd cleanup:',remaining);
 }
};
