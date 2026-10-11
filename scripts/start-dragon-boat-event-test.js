// Open an interactive Dragon Boat event in an isolated copy; pass --keep to the driver.
// DRIVE_USER_DATA=/tmp/<copied-profile> node scripts/drive-electron.js scripts/start-dragon-boat-event-test.js --keep
module.exports=async({evaluate,waitFor,bringToFront,consoleLines})=>{
 if(!process.env.DRIVE_USER_DATA)throw Error('Use an isolated test profile');
 await waitFor('typeof activeScene!=="undefined" && gameReady');
 if(!await evaluate(`loadSaveById(${Number(process.env.DRAGON_SAVE_ID||15845)},activeScene)`))throw Error('Cannot load 太子');
 await evaluate(`(()=>{
  hideLandingScreen();stopSimTimer();simPaused=true;
  if(city.month>=getFestivalMonth('dragonBoat',city.year))city.year++;
  city.month=getFestivalMonth('dragonBoat',city.year);city.timeOfDayMinutes=480;
  city.environmentMinutes=Math.floor(getEnvironmentMinutes()/1440)*1440+480;resetGameClockAccumulator();
  city.weather={condition:'sunny',typhoonStage:'none',rainWarning:'none',rainfall:0};
  clearDragonBoatSprites(activeScene);getCityFestivalState().enabled=true;
  setFestivalEnabled('dragonBoat',true);setFestivalTier('dragonBoat','standard');
  const run=createCityDragonBoatRun(activeScene,480,getDragonBoatContext(activeScene));
  if(!run.course||run.status!=='running')throw Error(run.reason||'No playable course');
  const c=run.course,p=dbPoint(c,c.distanceM/40,1.2);
  setMapZoom(activeScene,1.1);centerCameraOnTile(activeScene,Math.round(p.row),Math.round(p.col));
  activeScene.cameras.main.scrollX-=65/activeScene.cameras.main.zoom;
  updateHUD();updateTopbarGameTime();
 })()`);
 await bringToFront();
 await waitFor('Array.from(activeScene.dragonBoatSprites?.values()||[]).filter(s=>s.festivalPlacement.crowd).length>0');
 await evaluate(`(async()=>{
  activeScene.sound.unlock();await activeScene.sound.context.resume();
  setSimSpeed(GAME_SPEEDS.SLOW);startSimTimer();updateSpeedButtons();updateDragonBoatAudio(activeScene);
 })()`);
 await waitFor("activeScene.dragonBoatAudio?.sounds.opening?.isPlaying && !simPaused");
 const state=await evaluate(`({city:city.name,year:city.year,month:city.month,minute:city.timeOfDayMinutes,status:city.festivals.dragonBoat.status,distance:city.festivals.dragonBoat.course.distanceM,crowdGroups:Array.from(activeScene.dragonBoatSprites.values()).filter(s=>s.festivalPlacement.crowd).length,audio:Object.keys(activeScene.dragonBoatAudio.sounds),clockRunning:gameClockRunning})`);
 if(consoleLines.some(s=>s.includes('EXCEPTION')))throw Error(consoleLines.filter(s=>s.includes('EXCEPTION')).join('\n'));
 console.log('Interactive event test started:',JSON.stringify(state));
 await bringToFront();
};
