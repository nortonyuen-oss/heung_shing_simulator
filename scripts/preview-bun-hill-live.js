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

 await evaluate(`(()=>{setVisualRouteCalibrationTestModeEnabled(false);city.year=2026;city.month=getFestivalMonth('bunHill',2026);city.environmentMinutes=720;city.timeOfDayMinutes=1080;city.festivals=createFestivalState();setFestivalEnabled('dragonBoat',false);city.weather={};updateBunHillLiveEvent(activeScene,activeScene.time.now);return true;})()`);
 await waitFor('activeScene.bunHillLiveSession?.assets&&activeScene.bunHillSprites.size===10');
 const setup=await evaluate('({budget:city.budget,cost:city.festivals.bunHill.cost,paused:simPaused,testMode:isVisualRouteCalibrationTestModeEnabled(),status:city.festivals.bunHill.status})');
 if(setup.testMode||setup.status!=='running'||setup.cost!==1200)throw Error(JSON.stringify(setup));
 await evaluate(`(()=>{city.environmentMinutes=1080+70/12;city.timeOfDayMinutes=70/12;updateHUD();updateTopbarGameTime({label:formatGameTimeOfDay()});updateBunHillLiveEvent(activeScene,activeScene.time.now);const s=activeScene.bunHillLiveSession,p=bunHillMapPoint(activeScene,s.venue,40,30);setMapZoom(activeScene,2);activeScene.cameras.main.centerOn(p.x,p.y);return true;})()`);
 await waitFor('activeScene.bunHillSprites.size===37');await bringToFront();await sleep(300);
 fs.mkdirSync('.data/bun-hill-design',{recursive:true});await screenshot('.data/bun-hill-design/live-event-race.png');
 const saved=await evaluate(`(()=>{window.__bunLiveSave=JSON.parse(JSON.stringify(buildSavePayload().save_data));return {budget:city.budget,run:city.festivals.bunHill,clock:city.timeOfDayMinutes};})()`);
 await evaluate(`(()=>{const decoded=decodeSaveDataForLoad(window.__bunLiveSave);applySaveData(activeScene,decoded);stopSimTimer();simPaused=true;hideLandingScreen();return true;})()`);
 await waitFor('activeScene.bunHillLiveSession?.assets&&activeScene.bunHillSprites.size===37');
 const reloaded=await evaluate('({budget:city.budget,year:city.festivals.bunHill.year,clock:city.timeOfDayMinutes,history:city.festivals.history.filter(p=>p.id==="bunHill").length})');
 if(reloaded.budget!==saved.budget||Math.abs(reloaded.clock-saved.clock)>1e-7||reloaded.year!==2026)throw Error(JSON.stringify({saved,reloaded}));
 await evaluate(`(()=>{city.environmentMinutes=1095;city.timeOfDayMinutes=15;updateBunHillLiveEvent(activeScene,activeScene.time.now);return true;})()`);
 await sleep(100);
 const finish=await evaluate(`({status:city.festivals.bunHill.status,posts:city.forumPosts.filter(p=>p.id==='festival-bunHill-2026-'+city.month+'-report').length,effects:city.temporaryEffects.filter(p=>p.sourceId==='festival:bunHill:2026').length,budget:city.budget,report:city.festivals.bunHill.report})`);
 if(finish.status!=='held'||finish.posts!==1||finish.effects!==1||finish.budget!==saved.budget||!finish.report)throw Error(JSON.stringify(finish));
 const newsImage=await evaluate(`city.forumPosts.find(p=>p.id==='festival-bunHill-2026-'+city.month+'-report')?.image`);
 if(newsImage!=='UI/news/bunHillCompetition.webp')throw Error('Missing bun hill result image: '+newsImage);
 const imageLoaded=await evaluate(`new Promise(resolve=>{const img=new Image();img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight});img.onerror=()=>resolve(null);img.src='UI/news/bunHillCompetition.webp';})`);
 if(!imageLoaded?.width)throw Error('Bun hill result image failed to load');
 await evaluate(`(()=>{const post=city.forumPosts.find(p=>p.id==='festival-bunHill-2026-'+city.month+'-report');showResolutionNewspaper(post,post.id);return true;})()`);
 await waitFor(`(()=>{const img=document.getElementById('forum-post-image');return img&&!img.hidden&&img.complete&&img.naturalWidth>0;})()`);
 await screenshot('.data/bun-hill-design/live-event-news.png');
 await evaluate(`closeDialog('newspaper-dialog')`);
 await evaluate(`(()=>{city.environmentMinutes=1115;city.timeOfDayMinutes=35;updateBunHillLiveEvent(activeScene,activeScene.time.now);window.__bunLiveSave=JSON.parse(JSON.stringify(buildSavePayload().save_data));applySaveData(activeScene,decodeSaveDataForLoad(window.__bunLiveSave));stopSimTimer();simPaused=true;hideLandingScreen();return true;})()`);
 await waitFor('activeScene.bunHillLiveSession?.assets');
 const savedNewsImage=await evaluate(`city.forumPosts.find(p=>p.id==='festival-bunHill-2026-'+city.month+'-report')?.image`);
 if(savedNewsImage!==newsImage)throw Error('News image lost after reload');
 await evaluate(`(()=>{city.environmentMinutes=1200;city.timeOfDayMinutes=120;updateBunHillLiveEvent(activeScene,activeScene.time.now);return true;})()`);
 const closed=await evaluate(`({sprites:activeScene.bunHillSprites.size,session:!!activeScene.bunHillLiveSession,posts:city.forumPosts.filter(p=>p.id==='festival-bunHill-2026-'+city.month+'-report').length,effects:city.temporaryEffects.filter(p=>p.sourceId==='festival:bunHill:2026').length,budget:city.budget,clock:city.timeOfDayMinutes})`);
 if(closed.sprites||closed.session||closed.posts!==1||closed.effects!==1||closed.budget!==saved.budget||closed.clock!==120)throw Error(JSON.stringify(closed));
 const exceptions=consoleLines.filter(s=>s.includes('EXCEPTION'));if(exceptions.length)throw Error(exceptions.join('\n'));
 fs.writeFileSync('.data/bun-hill-design/live-event-check.json',JSON.stringify({setup,reloaded,finish,closed},null,2));console.log(JSON.stringify({setup,reloaded,finish,closed}));
};
