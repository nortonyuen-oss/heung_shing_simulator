// Reproducible whole-course inspection and complete-day recording in an isolated profile.
// DRIVE_USER_DATA=/tmp/dragon-course node scripts/drive-electron.js scripts/preview-dragon-boat-course.js
const fs = require('node:fs');
const path = require('node:path');
const OUT = path.resolve(__dirname, '../.data/dragon-boat-review');
module.exports = async ({ evaluate, waitFor, screenshot, sleep, consoleLines }) => {
  if (!process.env.DRIVE_USER_DATA) throw new Error('An isolated DRIVE_USER_DATA profile is required.');
  fs.mkdirSync(OUT, { recursive: true });
  await waitFor('typeof activeScene !== "undefined" && gameReady');
  await evaluate('startNewGame("龍舟賽道展示城")');
  await evaluate(`(() => {
    stopSimTimer(); simPaused=true;city.year=2026;city.month=1;
    for(let r=97;r<118;r++)for(let c=85;c<130;c++){
      removeTree(activeScene,r,c);removeDebris(activeScene,r,c);
      mapData[r][c]=r<=100?GROUND:WATER;heightMap[r][c]=0;refreshTileSprite(activeScene,r,c);
    }
    city.promenade={version:1,tiles:Object.fromEntries(Array.from({length:22},(_,i)=>['100:'+(96+i),0]))};
    syncPromenadeSprites(activeScene);syncPromenadeProps(activeScene);
    getCityFestivalState().venues.dragonBoat='100:100:s:w:270';
    previewDragonBoatFestival();city.timeOfDayMinutes=360;
  })()`);
  await waitFor('activeScene.dragonBoatSprites?.size > 0');
  const summary = await evaluate(`(() => {
    const scene=activeScene,run=city.festivals.dragonBoat,c=run.course,L=c.distanceM/20,space=dragonBoatCourseSpace(c);
    const camera=scene.cameras.main;camera.setZoom(.85);
    const middle=dbPoint(c,L/2,1.5);centerCameraOnTile(scene,middle.row,middle.col);
    camera.scrollX-=75/camera.zoom;
    const graphics=scene.add.graphics().setDepth(1000000000);
    if(scene.worldMask)graphics.setMask(scene.worldMask);
    const point=(s,k)=>{const p=dbPoint(c,s,k);return getFestivalPlacementPoint(scene,{mode:'tile',row:p.row,col:p.col});};
    const line=(a,b,color,width=1,alpha=.6)=>{graphics.lineStyle(width,color,alpha);graphics.lineBetween(a.x,a.y,b.x,b.y);};
    const polygon=(points,color,alpha)=>{graphics.fillStyle(color,alpha);graphics.fillPoints(points,true);};
    const rect=(s0,s1,k0,k1,color)=>{const pts=[point(s0,k0),point(s1,k0),point(s1,k1),point(s0,k1)];polygon(pts,color,.09);for(let i=0;i<4;i++)line(pts[i],pts[(i+1)%4],color,2,.8);};
    for(let r=space.minRow-.5;r<=space.maxRow+.51;r++)for(let col=space.minCol-.5;col<=space.maxCol+.51;col++){
      if(col<space.maxCol+.5){const a=getFestivalPlacementPoint(scene,{mode:'tile',row:r,col}),b=getFestivalPlacementPoint(scene,{mode:'tile',row:r,col:col+1});line(a,b,0xffffff,1,.22);}
      if(r<space.maxRow+.5){const a=getFestivalPlacementPoint(scene,{mode:'tile',row:r,col}),b=getFestivalPlacementPoint(scene,{mode:'tile',row:r+1,col});line(a,b,0xffffff,1,.22);}
    }
    rect(-1,L+1,-.5,3.5,0x67dbff);rect(-1,0,-.2,2.2,0xffdc73);rect(L,L+1,-.2,2.2,0xffdc73);
    for(let lane=0;lane<6;lane++)line(point(0,lane*.4),point(L,lane*.4),0xb8f1ff,1,.3);
    line(point(0,-.25),point(0,2.25),0x63ffa2,4,1);line(point(L,-.25),point(L,2.25),0xff7894,4,1);
    line(point(L+.1,3),point(-.45,3),0xdbb4ff,3,.8);
    const label=(s,k,text,color)=>{const p=point(s,k);scene.add.text(p.x,p.y,text,{fontFamily:'Arial',fontSize:'16px',color,backgroundColor:'#102838',padding:{x:7,y:4}}).setOrigin(.5).setDepth(1000000001);};
    label(0,-.8,'起點','#63ffa2');label(L,-.8,'終點','#ff7894');label(L/2,3.9,'外側返回航道','#dbb4ff');label(L/2,-.6,c.distanceM+' 米競渡','#ffffff');
    window.__dragonReview={graphics,run,space};
    const legend=document.createElement('div');legend.id='dragon-course-legend';
    Object.assign(legend.style,{position:'fixed',left:'245px',top:'100px',padding:'12px 18px',background:'rgba(8,27,39,.94)',color:'white',font:'16px sans-serif',zIndex:'10000',borderRadius:'10px',pointerEvents:'none'});
    legend.innerHTML='270 米賽道 · 六條 8 米線道<br>前後緩衝各 20 米 · 外側返回航道<br>幾何範圍 310 × 80 米｜格網預留 '+space.alongTiles+' × '+space.acrossTiles+' 格 = '+space.alongTiles*20+' × '+space.acrossTiles*20+' 米<br>白色格網：每格 20 米；岸上看台另計（至少 6 格相連步道）';document.body.appendChild(legend);
    updateHUD();updateTopbarGameTime();
    return {course:c,space,teams:run.teams,rounds:run.rounds,treesOnWater:treeMap.reduce((n,row,r)=>n+row.filter((t,c)=>t&&mapData[r][c]===WATER).length,0)};
  })()`);
  if(summary.treesOnWater)throw new Error('Trees remain on water');
  fs.writeFileSync(path.join(OUT,'measurement.json'),JSON.stringify(summary,null,2)+'\n');
  await sleep(500);await screenshot(path.join(OUT,'course-overview.png'));
  console.log('Overview captured:',summary.space.alongTiles,summary.space.acrossTiles,'tiles. Recording full day (about 2 minutes).');
  await evaluate(`(() => {
    const scene=activeScene,canvas=document.createElement('canvas');canvas.width=scene.game.canvas.width;canvas.height=scene.game.canvas.height;
    const ctx=canvas.getContext('2d'),chunks=[],mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
    const recorder=new MediaRecorder(canvas.captureStream(15),{mimeType:mime,videoBitsPerSecond:2500000});
    const start=performance.now(),run=window.__dragonReview.run;
    const stages=minute=>{const p=dragonBoatPhase(minute,false);if(p.kind==='race')return (p.round===2?'決賽':'第'+(p.round+1)+'輪排位賽')+' · '+(p.minute<10?'集結':p.minute<15?'對線':p.minute<45?'競渡':p.minute<50?'衝線後減速':'外側返回');return {setup:'搭台及準備',waiting:'候賽及整備',awards:minute<1020?'賽果公布／頒獎（暫無人物）':'收艇及清場',off:'活動結束'}[p.kind];};
    const paint=()=>{
      const minute=city.timeOfDayMinutes;ctx.drawImage(scene.game.canvas,0,0);ctx.fillStyle='rgba(8,27,39,.94)';ctx.fillRect(20,20,canvas.width-40,110);
      ctx.fillStyle='#ffffff';ctx.font='bold 24px sans-serif';ctx.fillText('香城龍舟邀請賽｜完整流程 · 不加入人群',38,54);
      ctx.font='19px sans-serif';ctx.fillText(formatGameTimeOfDay(minute)+'  '+stages(minute),38,87);
      ctx.font='16px sans-serif';ctx.fillStyle='#b8f1ff';ctx.fillText('270m競渡｜前後緩衝各20m｜水面預留'+window.__dragonReview.space.alongTiles+'×'+window.__dragonReview.space.acrossTiles+'格（'+window.__dragonReview.space.alongTiles*20+'×'+window.__dragonReview.space.acrossTiles*20+'m）｜每格20m',38,113);
      ctx.fillStyle='rgba(8,27,39,.94)';ctx.fillRect(20,canvas.height-95,canvas.width-40,75);
      ctx.fillStyle='#ffffff';ctx.font='17px sans-serif';const phase=dragonBoatPhase(minute,false),round=run.rounds[phase.round??2];
      let text='本次香城龍舟邀請賽由薩利亞意式餐廳贊助';if(phase.kind==='race'&&phase.minute>=15&&phase.minute<45){const elapsed=(phase.minute-15)/30*Math.max(...round.map(e=>e.seconds));const entry=round.find(e=>(e.incidents||[]).some(event=>elapsed>=event.seconds&&elapsed<event.seconds+8));if(entry){const event=entry.incidents.find(event=>elapsed>=event.seconds&&elapsed<event.seconds+8);text='偏航相撞：'+run.teams.find(t=>t.id===entry.teamId).name+' × '+run.teams.find(t=>t.id===event.otherTeamId).name+'｜減速、修正航向';}}if(minute>=960)text='冠軍：'+run.teams.find(t=>t.id===run.rounds[2][0].teamId).name+'｜'+run.rounds[2][0].seconds.toFixed(2)+'秒';
      ctx.fillText(text,38,canvas.height-64);ctx.fillStyle='#244251';ctx.fillRect(38,canvas.height-47,canvas.width-76,9);ctx.fillStyle='#67dbff';ctx.fillRect(38,canvas.height-47,(canvas.width-76)*Math.min(1,(minute-360)/720),9);
    };
    scene.game.events.on('postrender',paint);
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    window.__dragonVideoDone=new Promise((resolve,reject)=>{recorder.onerror=e=>reject(new Error(e.error?.message||'recording failed'));recorder.onstop=()=>{
      scene.game.events.off('postrender',paint);const reader=new FileReader();reader.onload=()=>{window.__dragonVideo=String(reader.result).split(',')[1];resolve(window.__dragonVideo.length);};reader.readAsDataURL(new Blob(chunks,{type:mime}));
    };});
    recorder.start(1000);
    const timer=setInterval(()=>{city.timeOfDayMinutes=Math.min(1082,360+(performance.now()-start)/1000*6);updateHUD();updateTopbarGameTime();if(city.timeOfDayMinutes>=1082){clearInterval(timer);setTimeout(()=>recorder.stop(),500);}},33);
    return true;
  })()`);
  const length=await evaluate('window.__dragonVideoDone');
  const pieces=[];for(let start=0;start<length;start+=800000)pieces.push(await evaluate(`window.__dragonVideo.slice(${start},${start+800000})`));
  fs.writeFileSync(path.join(OUT,'full-process.webm'),Buffer.from(pieces.join(''),'base64'));
  const end=await evaluate(`({status:city.festivals.dragonBoat.status,remainingSprites:activeScene.dragonBoatSprites.size,reports:city.forumPosts.filter(p=>p.id.includes('festival-dragonBoat')).length})`);
  if(end.status!=='held'||end.remainingSprites!==0||end.reports!==1)throw new Error(JSON.stringify(end));
  if(consoleLines.some(line=>line.includes('EXCEPTION')))throw new Error(consoleLines.filter(line=>line.includes('EXCEPTION')).join('\n'));
  console.log('Recording saved; complete-day check:',end);
};
