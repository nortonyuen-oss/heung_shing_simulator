// Record the full Dragon Boat event in an isolated copy of 太子, using the actual saved city.
// DRIVE_USER_DATA=/tmp/<copied-profile> DRAGON_SAVE_ID=15845 node scripts/drive-electron.js scripts/record-taizi-dragon-boat.js
const fs=require('node:fs'),path=require('node:path');
const OUT=path.resolve(__dirname,'../.data/taizi-dragon-boat-recording-with-sound');
module.exports=async({evaluate,waitFor,screenshot,sleep,consoleLines,bringToFront})=>{
 if(!process.env.DRIVE_USER_DATA)throw new Error('An isolated profile is required');
 fs.mkdirSync(OUT,{recursive:true});
 await waitFor('typeof activeScene!=="undefined" && gameReady');
 const loaded=await evaluate('loadSaveById('+Number(process.env.DRAGON_SAVE_ID||15845)+',activeScene)');
 if(!loaded)throw new Error('Load failed: '+consoleLines.filter(s=>s.includes('[Load]')).join(' | '));
 await evaluate(`(()=>{
  hideLandingScreen();stopSimTimer();simPaused=true;
  // Advance the copy to the next festival without changing the player's save.
  if(city.month>=getFestivalMonth('dragonBoat',city.year))city.year+=1;
  city.month=getFestivalMonth('dragonBoat',city.year);city.timeOfDayMinutes=360;
  clearDragonBoatSprites(activeScene);
  getCityFestivalState().enabled=true;setFestivalEnabled('dragonBoat',true);setFestivalTier('dragonBoat','standard');
  const run=createCityDragonBoatRun(activeScene,360,getDragonBoatContext(activeScene));
  if(!run.course||run.status!=='running')throw new Error('No playable race: '+run.reason);
 })()`);
 await bringToFront();await waitFor('activeScene.dragonBoatSprites?.size > 6',60000);
 const summary=await evaluate(`(()=>{
  const scene=activeScene,run=city.festivals.dragonBoat,c=run.course,L=c.distanceM/20,space=dragonBoatCourseSpace(c);
  setMapZoom(scene,.9);const middle=dbPoint(c,L/2,1.2);
  centerCameraOnTile(scene,Math.round(middle.row),Math.round(middle.col));scene.cameras.main.scrollX-=65/scene.cameras.main.zoom;
  updateHUD();updateTopbarGameTime();window.__dragonReview={run,space};
  return {cityName:city.name,year:city.year,month:city.month,course:c,space,teams:run.teams,rounds:run.rounds};
 })()`);
 fs.writeFileSync(path.join(OUT,'measurement.json'),JSON.stringify(summary,null,2)+'\n');
 await sleep(400);await bringToFront();await screenshot(path.join(OUT,'poster.png'));
 console.log('Recording 太子',summary.year,'270m event on existing coast (about 2 minutes).');
  await evaluate(`(async() => {
    const scene=activeScene,canvas=document.createElement('canvas');canvas.width=scene.game.canvas.width;canvas.height=scene.game.canvas.height;
    const ctx=canvas.getContext('2d'),chunks=[],mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')?'video/webm;codecs=vp9,opus':'video/webm';
    scene.sound.pauseOnBlur=false;
    scene.sound.unlock();await scene.sound.context.resume();
    if(scene.sound.context.state!=='running'||!scene.sound.masterVolumeNode)throw new Error('Audio capture unavailable');
    if(activeMusic){activeMusic.pause();isMusicPlaying=false;}
    setStoredAmbientVolume(.85);simPaused=false;stopSimTimer();
    const audio=scene.sound.context.createMediaStreamDestination();scene.sound.masterVolumeNode.connect(audio);
    const stream=new MediaStream([...canvas.captureStream(15).getVideoTracks(),...audio.stream.getAudioTracks()]);
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2500000,audioBitsPerSecond:128000});
    window.__dragonRecordedAudioTracks=stream.getAudioTracks().length;window.__dragonCrowdPeak=0;
    const start=performance.now(),run=window.__dragonReview.run;
    const stages=minute=>{const p=dragonBoatPhase(minute,false);if(p.kind==='race')return (p.round===2?'決賽':'第'+(p.round+1)+'輪排位賽')+' · '+(p.minute<10?'集結':p.minute<15?'對線':p.minute<45?'競渡':p.minute<50?'衝線後減速':'外側返回');return {setup:'搭台及準備',waiting:'候賽及整備',awards:minute<1020?'賽果公布／頒獎（暫無人物）':'收艇及清場',off:'活動結束'}[p.kind];};
    const paint=()=>{
      const minute=city.timeOfDayMinutes;window.__dragonCrowdPeak=Math.max(window.__dragonCrowdPeak,Array.from(scene.dragonBoatSprites.values()).filter(s=>s.festivalPlacement.crowd).length);ctx.drawImage(scene.game.canvas,0,0);ctx.fillStyle='rgba(8,27,39,.94)';ctx.fillRect(20,20,canvas.width-40,110);
      ctx.fillStyle='#ffffff';ctx.font='bold 24px sans-serif';ctx.fillText('太子龍舟邀請賽｜海旁觀眾 · 完整賽事',38,54);
      ctx.font='19px sans-serif';ctx.fillText(formatGameTimeOfDay(minute)+'  '+(minute>=480&&minute<540?'開幕禮 · 鼓聲':stages(minute)),38,87);
      ctx.font='16px sans-serif';ctx.fillStyle='#b8f1ff';ctx.fillText('270m競渡｜前後緩衝各20m｜水面預留'+window.__dragonReview.space.alongTiles+'×'+window.__dragonReview.space.acrossTiles+'格（'+window.__dragonReview.space.alongTiles*20+'×'+window.__dragonReview.space.acrossTiles*20+'m）｜每格20m',38,113);
      ctx.fillStyle='rgba(8,27,39,.94)';ctx.fillRect(20,canvas.height-95,canvas.width-40,75);
      ctx.fillStyle='#ffffff';ctx.font='17px sans-serif';const phase=dragonBoatPhase(minute,false),round=run.rounds[phase.round??2];
      let text='本次香城龍舟邀請賽由薩利亞意式餐廳贊助';if(phase.kind==='race'&&phase.minute>=15&&phase.minute<45){const elapsed=(phase.minute-15)/30*Math.max(...round.map(e=>e.seconds));const entry=round.find(e=>(e.incidents||[]).some(event=>elapsed>=event.seconds&&elapsed<event.seconds+8));if(entry){const event=entry.incidents.find(event=>elapsed>=event.seconds&&elapsed<event.seconds+8);text='偏航相撞：'+run.teams.find(t=>t.id===entry.teamId).name+' × '+run.teams.find(t=>t.id===event.otherTeamId).name+'｜減速、修正航向';}}if(minute>=960)text='冠軍：'+run.teams.find(t=>t.id===run.rounds[2][0].teamId).name+'｜'+run.rounds[2][0].seconds.toFixed(2)+'秒';
      ctx.fillText(text,38,canvas.height-64);ctx.fillStyle='#244251';ctx.fillRect(38,canvas.height-47,canvas.width-76,9);ctx.fillStyle='#67dbff';ctx.fillRect(38,canvas.height-47,(canvas.width-76)*Math.min(1,(minute-360)/720),9);
    };
    scene.game.events.on('postrender',paint);
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    window.__dragonVideoDone=new Promise((resolve,reject)=>{recorder.onerror=e=>reject(new Error(e.error?.message||'recording failed'));recorder.onstop=()=>{
      scene.game.events.off('postrender',paint);scene.sound.masterVolumeNode.disconnect(audio);stream.getTracks().forEach(t=>t.stop());simPaused=true;const reader=new FileReader();reader.onload=()=>{const uri=String(reader.result);window.__dragonVideo=uri.slice(uri.indexOf(';base64,')+8);resolve(window.__dragonVideo.length);};reader.readAsDataURL(new Blob(chunks,{type:mime}));
    };});
    recorder.start(1000);
    const timer=setInterval(()=>{city.timeOfDayMinutes=Math.min(1082,360+(performance.now()-start)/1000*6);updateHUD();updateTopbarGameTime();if(city.timeOfDayMinutes>=1082){clearInterval(timer);setTimeout(()=>recorder.stop(),500);}},33);
    return true;
  })()`);
  const length=await evaluate('window.__dragonVideoDone');
  const pieces=[];for(let start=0;start<length;start+=800000)pieces.push(await evaluate(`window.__dragonVideo.slice(${start},${start+800000})`));
  const video=Buffer.from(pieces.join(''),'base64');
  if(video.length<1000000||video.subarray(0,4).toString('hex')!=='1a45dfa3')throw new Error('Invalid WebM export');
  fs.writeFileSync(path.join(OUT,'full-process.webm'),video);
  const end=await evaluate(`({status:city.festivals.dragonBoat.status,remainingSprites:activeScene.dragonBoatSprites.size,reports:city.forumPosts.filter(p=>p.id==='festival-dragonBoat-'+city.year+'-'+city.month+'-report').length,audioTracks:window.__dragonRecordedAudioTracks,crowdGroups:window.__dragonCrowdPeak})`);
  if(end.status!=='held'||end.remainingSprites!==0||end.reports!==1||end.audioTracks!==1||end.crowdGroups<27)throw new Error(JSON.stringify(end));
  if(consoleLines.some(line=>line.includes('EXCEPTION')))throw new Error(consoleLines.filter(line=>line.includes('EXCEPTION')).join('\n'));
  fs.writeFileSync(path.join(OUT,'completion.json'),JSON.stringify(end,null,2)+'\n');
  console.log('Recording saved; complete-day check:',end);
};
