// Native map rehearsal. An independent playback cursor does not advance or bill the city.
// Calendar scheduling, admission and news remain separate from this test-mode rehearsal.
const BUN_HILL_TILE_M = 20;
const BUN_HILL_UP_PX = 5;
const BUN_HILL_DIRS = [[-1,0],[0,1],[1,0],[0,-1]];
let bunHillEventMetadata = null;

function bunHillVenuePoint(venue,xM,yM) {
  const x=xM/20,y=yM/20,r=venue.row-.5,c=venue.col-.5;
  if(venue.orientation===1)return {row:r+x,col:c+venue.cols-y};
  if(venue.orientation===2)return {row:r+venue.rows-y,col:c+venue.cols-x};
  if(venue.orientation===3)return {row:r+venue.rows-x,col:c+y};
  return {row:r+y,col:c+x};
}

// Only real, level ground tiles count. Require three connected shoreline tiles and two
// distinct ground-to-promenade exits on the seaward edge, excluding piers and bridges.
function selectBunHillVenue(ctx,preferred='') {
  const key=(r,c)=>`${r}:${c}`;
  const promenades=new Set((ctx.promenadeTiles||[]).filter(([r,c])=>
    !ctx.isPier?.(r,c)&&!ctx.isNearBridge?.(r,c)&&ctx.seaSideOf?.(r,c)).map(p=>p.join(':')));
  const directions=['n','e','s','w'];
  const grounds=[...(ctx.eventGrounds||[])].sort((a,b)=>(b.id===preferred)-(a.id===preferred)||a.id.localeCompare(b.id));
  for(const layoutId of ['standard','compact']) {
    const layout=typeof BUN_HILL_LAYOUTS!=='undefined'?BUN_HILL_LAYOUTS[layoutId]:require('./festival-bun-hill').BUN_HILL_LAYOUTS[layoutId];
    for(const ground of grounds) {
      const cells=new Set(ground.tiles.map(p=>p.join(':')));
      for(const orientation of [0,1,2,3]) {
        const cols=orientation%2?layout.rows:layout.cols,rows=orientation%2?layout.cols:layout.rows;
        for(const [row,col] of ground.tiles) {
          const tiles=[];
          for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)tiles.push([row+r,col+c]);
          if(!tiles.every(([r,c])=>cells.has(key(r,c))&&!ctx.blocked?.(r,c)&&
            (!ctx.heightOf||ctx.heightOf(r,c)===ground.height)))continue;
          const venue={id:ground.id,row,col,cols,rows,orientation,layoutId,tiles,height:ground.height};
          const sea=orientation; // local y=0 points north/east/south/west respectively
          const [dr,dc]=BUN_HILL_DIRS[sea],exits=[];
          for(const [r,c] of tiles) {
            if(cells.has(key(r+dr,c+dc)))continue;
            if(promenades.has(key(r+dr,c+dc))&&ctx.seaSideOf(r+dr,c+dc)===directions[sea]&&
              (!ctx.heightOf||ctx.heightOf(r+dr,c+dc)===ground.height))exits.push([r+dr,c+dc]);
          }
          if(exits.length<2)continue;
          const connected=[exits[0]],seen=new Set([key(...exits[0])]);
          for(let i=0;i<connected.length;i++)for(const [a,b] of BUN_HILL_DIRS) {
            const [r,c]=connected[i],id=key(r+a,c+b);
            if(!seen.has(id)&&promenades.has(id)&&(!ctx.heightOf||ctx.heightOf(r+a,c+b)===ground.height)) {
              seen.add(id);connected.push([r+a,c+b]);
            }
          }
          if(connected.length<3||!exits.every(p=>seen.has(key(...p))))continue;
          return {...venue,exits};
        }
      }
    }
  }
  return null;
}

function getBunHillMapVenueContext(scene) {
  const ctx=getFestivalVenueContext(scene),blocked=new Set();
  for(const [id,record] of Object.entries(buildingData)) {
    if(record.type==='event_ground')continue;
    const [row,col]=id.split(':').map(Number);
    for(let dr=0;dr<(record.footprintRows||1);dr++)for(let dc=0;dc<(record.footprintCols||1);dc++)blocked.add(`${row+dr}:${col+dc}`);
  }
  return {...ctx,heightOf:(r,c)=>heightMap[r]?.[c],blocked:(r,c)=>mapData[r]?.[c]===WATER||blocked.has(`${r}:${c}`)};
}

function bunHillEventTextureKey(file){return `bun-event:${file.split('/').pop()}`;}
function getBunHillMapContestFrame(contest,seconds) {
  const frame=(typeof getBunHillDesignContestFrame==='function'?getBunHillDesignContestFrame:require('./festival-bun-hill').getBunHillDesignContestFrame)(contest,seconds);
  // Scores lock at the deadline, but an overdue climber must still return safely afterwards.
  if(seconds>180)frame.contestants=frame.contestants.map(person=>{
    const c=contest.contestants[person.sector];
    if(c.finishSec<=seconds)return {...person,pose:'grounded',heightM:0};
    return {...person,pose:'descending',heightM:Math.max(0,person.heightM*(c.finishSec-seconds)/(c.finishSec-180))};
  });
  return frame;
}
async function loadBunHillEventTextures(scene) {
  if(!bunHillEventMetadata) {
    const responses=await Promise.all(['data/bun-hill-geometry.json','data/bun-hill-climbers.json','data/festival-textures.json'].map(f=>fetch(f)));
    if(responses.some(r=>!r.ok))throw Error('未能載入包山模型資料');
    const [geometry,climbers,festivalTextures]=await Promise.all(responses.map(r=>r.json()));
    const crowds={};
    for(const [name,m] of Object.entries(festivalTextures.textures))if(name.startsWith('fx_dbspectators')) {
      crowds[name.replace('fx_db','')]={...m,anchor:[m.anchor.x,m.anchor.y],
        scale:m.heightM*BUN_HILL_UP_PX/m.personHeightPx};
    }
    bunHillEventMetadata={geometry,climbers,crowds};
  }
  const files=[...Object.values(bunHillEventMetadata.geometry.parts),...Object.values(bunHillEventMetadata.climbers.frames).filter(m=>!m.mirrored),...Object.values(bunHillEventMetadata.crowds)].map(m=>m.file);
  const missing=files.filter(file=>!scene.textures.exists(bunHillEventTextureKey(file)));
  if(missing.length)await new Promise((resolve,reject)=>{
    const start=()=>{
      missing.forEach(file=>scene.load.image(bunHillEventTextureKey(file),typeof resolveModelAssetPath==='function'?resolveModelAssetPath(file):file));
      scene.load.once('complete',()=>missing.every(file=>scene.textures.exists(bunHillEventTextureKey(file)))?resolve():reject(Error('包山模型載入失敗')));
      scene.load.start();
    };
    if(scene.load.isLoading())scene.load.once('complete',start);else start();
  });
  return bunHillEventMetadata;
}

function bunHillMapPoint(scene,venue,x,y) {
  const at=bunHillVenuePoint(venue,x,y);
  return getFestivalPlacementPoint(scene,{mode:'tile',...at,groundBuildingId:`${Math.round(at.row)}:${Math.round(at.col)}`});
}
function bunHillPositionImage(sprite,meta,x,y,scale,anchor=meta.anchor) {
  const mapping=typeof getModelTexturePixelMapping==='function'?getModelTexturePixelMapping(meta.file,{width:sprite.frame.width,height:sprite.frame.height}):{resize:1,offsetX:0,offsetY:0};
  sprite.setOrigin((anchor[0]*mapping.resize+mapping.offsetX)/sprite.frame.width,(anchor[1]*mapping.resize+mapping.offsetY)/sprite.frame.height);
  sprite.setScale(scale/mapping.resize).setPosition(x,y);
  sprite.bunHillPhysicalScale=scale;
}
function bunHillSceneImage(session,id,meta) {
  let sprite=session.scene.bunHillSprites.get(id);
  const key=bunHillEventTextureKey(meta.file);
  if(!sprite){sprite=session.scene.add.image(0,0,key);if(session.scene.worldMask)sprite.setMask(session.scene.worldMask);session.scene.bunHillSprites.set(id,sprite);}
  else if(sprite.texture.key!==key)sprite.setTexture(key);
  sprite.setVisible(true);return sprite;
}

function drawBunHillMapEvent(session) {
  const {scene,venue,assets}=session,layout=BUN_HILL_LAYOUTS[venue.layoutId];
  const phase=getBunHillDesignPhase(session.offset,venue.layoutId);
  session.phase=phase.id;
  session.frame=null;
  session.ropes?.forEach(g=>g.clear());
  session.fences?.forEach(g=>g.clear());
  const used=new Set();
  const part=(id,name,point,heightM=null,axis=[1,0],mountM=0)=>{
    const at=bunHillMapPoint(scene,venue,...point);if(!at)return null;
    // Flip directions with the map; no stretched or rotated raster art.
    const a=bunHillVenuePoint(venue,...point),b=bunHillVenuePoint(venue,point[0]+axis[0],point[1]+axis[1]);
    const sa=isoToScreen(a.col,a.row),sb=isoToScreen(b.col,b.row);
    const mirror=(sb.x-sa.x)*(sb.y-sa.y)<0;
    const meta=assets.geometry.parts[name+(mirror?'_m':'')];
    const scale=meta.scale*(heightM?heightM/(meta.heightM||heightM):1);
    const sprite=bunHillSceneImage(session,id,meta);used.add(id);
    bunHillPositionImage(sprite,meta,at.x,at.y-mountM*BUN_HILL_UP_PX,scale);sprite.setDepth(at.depth);
    // Decorative lanterns and floodlit tower stay legible through the night rehearsal.
    sprite.clearTint();
    return {sprite,meta,scale,at};
  };
  if(!['idle','closed'].includes(phase.id)) {
    const towers=[part('tower','bunHill1',layout.tower),...layout.decor.map((p,i)=>part(`decor:${i}`,`bunHill${i+2}`,p))];
    part('stage','bunHillStage',layout.stage);
    // This solid flower board is optional decoration, not a walk-through gateway.
    layout.signboards.forEach((board,i)=>part(`signboard:${i}`,'bunHillSignboard',board.point,null,board.axis||[1,0],1.1));
    // Draw actual 1.1m railings in the ground projection, with a gap at the stage.
    // Separate short panels receive their own depth so rotation cannot put the
    // entire boundary on top of a tower standing in front of it.
    let panel=0;
    for(const path of layout.fences)for(let j=1;j<path.length;j++) {
      const a=path[j-1],b=path[j],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2);
      for(let k=0;k<steps;k++) {
        const p=bunHillMapPoint(scene,venue,a[0]+(b[0]-a[0])*k/steps,a[1]+(b[1]-a[1])*k/steps);
        const q=bunHillMapPoint(scene,venue,a[0]+(b[0]-a[0])*(k+1)/steps,a[1]+(b[1]-a[1])*(k+1)/steps);
        if(!p||!q)continue;
        session.fences??=[];
        const g=session.fences[panel]??(session.fences[panel]=scene.add.graphics());panel++;
        if(scene.worldMask)g.setMask(scene.worldMask);
        g.setDepth((p.depth+q.depth)/2).lineStyle(.35,0xc6b9a0,.95);
        for(const h of [2.5,5.5]){g.beginPath();g.moveTo(p.x,p.y-h);g.lineTo(q.x,q.y-h);g.strokePath();}
        g.lineStyle(.55,0xd5c6ab,1);
        for(const at of [p,q]){g.beginPath();g.moveTo(at.x,at.y);g.lineTo(at.x,at.y-5.5);g.strokePath();}
      }
    }
    if(!['setup','teardown'].includes(phase.id))for(const slot of getBunHillCrowdSlots(layout)) {
      const at=bunHillMapPoint(scene,venue,slot.x,slot.y),target=bunHillMapPoint(scene,venue,...slot.target);
      if(!at||!target)continue;
      const view=target.y<at.y?'Back':'Front',mirror=target.x<at.x;
      const meta=assets.crowds[`spectators${view}${slot.variant}${mirror?'_m':''}`];
      const sprite=bunHillSceneImage(session,slot.id,meta);used.add(slot.id);
      bunHillPositionImage(sprite,meta,at.x,at.y,meta.scale);sprite.setDepth(at.depth).clearTint();
    }
    if(!['setup','teardown'].includes(phase.id)) {
      const elapsed=session.offset>=1080?Math.round((session.offset-1080)*12000)/1000:0;
      const frame=getBunHillMapContestFrame(session.contest,elapsed);
      session.frame=frame;
      if(!session.ropes)session.ropes=Array.from({length:6},()=>scene.add.graphics());
      for(const [towerIndex,tower] of towers.entries()) {
        if(!tower)continue;
        const [bodyBase,bodyTop]=tower.meta.body;
        const baseX=tower.at.x+(bodyBase[0]-tower.meta.anchor[0])*tower.scale;
        const baseY=tower.at.y+(bodyBase[1]-tower.meta.anchor[1])*tower.scale;
        const ropes=session.ropes.slice(towerIndex*2,towerIndex*2+2);
        ropes.forEach((g,i)=>{if(scene.worldMask)g.setMask(scene.worldMask);g.setDepth(tower.sprite.depth+(i?.0015:-.0015));g.lineStyle(.45,0xe6ded0,.7);});
        for(const person of frame.contestants) {
          if(person.towerIndex!==towerIndex)continue;
          const contestant=session.contest.contestants[person.sector];
          // isoToScreen rotates (x, 2y) counterclockwise by +90 degrees per map step.
          const selection=getBunHillClimberAnimationPose({...person,sector:Math.floor(person.sector/3)*3+towerIndex},frame.time,-((typeof mapRotation==='number'?mapRotation:0)+venue.orientation),contestant);
          const meta=assets.climbers.frames[selection.key];
          const sprite=bunHillSceneImage(session,person.id,meta);used.add(person.id);
          // Contest strategy heights are normalised; display them on the measured short tower.
          // Keep the athlete at 1.7m and leave room for their head/raised hand below the cap.
          const heightM=person.heightM/session.contest.towerHeightM*Math.max(0,tower.meta.heightM-1.7);
          sprite.bunHillClimbHeightM=heightM;
          sprite.bunHillTowerIndex=towerIndex;
          const h=Math.min(1,(heightM+meta.hipHeightM)/tower.meta.heightM);
          // Follow the tapered body rather than climbing in a straight line off its surface.
          const radius=(selection.onGround?tower.meta.radii[0]*1.28:tower.meta.radii[0]*(1-h)+tower.meta.radii[1]*h)*tower.scale;
          const x=baseX+Math.cos(selection.angle)*radius;
          const feetY=baseY+Math.sin(selection.angle)*radius/2-heightM*BUN_HILL_UP_PX;
          const scale=meta.heightM*BUN_HILL_UP_PX/meta.personHeightPx;
          bunHillPositionImage(sprite,meta,x,feetY-(selection.onGround?0:meta.hipHeightM*BUN_HILL_UP_PX),scale,selection.onGround?meta.groundAnchor:meta.anchor);
          sprite.setDepth(tower.sprite.depth+(selection.behind&&!selection.onGround?-.002:.002)+person.sector/1000000);
          sprite.clearTint(); // The competition body and competitors are under the same floodlights.
          if(!selection.onGround) {
            const rope=ropes[selection.behind?0:1];
            const topX=tower.at.x+(bodyTop[0]-tower.meta.anchor[0])*tower.scale+Math.cos(selection.angle)*tower.meta.radii[1]*tower.scale;
            const topY=tower.at.y+(bodyTop[1]-tower.meta.anchor[1])*tower.scale+Math.sin(selection.angle)*tower.meta.radii[1]*tower.scale/2;
            rope.beginPath();rope.moveTo(topX,topY);rope.lineTo(sprite.x,sprite.y);rope.strokePath();
          }
        }
      }
    }
  }
  scene.bunHillSprites.forEach((sprite,id)=>{if(!used.has(id)){sprite.destroy();scene.bunHillSprites.delete(id);}});
  if(typeof cullSpriteMapEntries==='function') {
    const bounds=getActiveWorldViewportCameras(scene).map(camera=>getPaddedWorldViewportBounds(camera,200,220));
    cullSpriteMapEntries(scene.bunHillSprites,bounds,null,scene.cameras.main,bounds[0]);
  }
  const root=session.root;
  if(root){root.querySelector('[data-phase]').textContent=phase.id==='relay'?'接力時段（接力動畫待接入）':phase.label;
    root.querySelector('[data-seek]').value=session.offset;
    const results=root.querySelector('[data-results]');
    if(session.frame){results.textContent=session.frame.time===180?
      `男子：${session.frame.awards.men.map(p=>p.name).join('、')}｜女子：${session.frame.awards.women.map(p=>p.name).join('、')}`:
      `餘下 ${Math.ceil(session.frame.remaining)} 秒｜${session.frame.contestants.filter(p=>p.pose==='collecting').length} 人摘包中`;}
    else results.textContent='';
    if(session.frame) {
      const sig=session.frame.contestants.map(p=>`${p.buns}:${p.score}:${p.dq}`).join('|');
      if(sig!==session.resultsSig){session.resultsSig=sig;
        root.querySelector('[data-table]').innerHTML=session.frame.contestants.map(p=>`<tr><td>${p.name}</td><td>${p.gender==='female'?'女子':'男子'}</td><td>${p.buns}</td><td>${p.dq?'逾時失格':p.score}</td></tr>`).join('');
      }
    }
  }
}

function closeBunHillMapEvent(scene=typeof activeScene!=='undefined'?activeScene:null) {
  const session=scene?.bunHillEventSession||scene?.bunHillLiveSession;if(!session)return;
  scene.bunHillEventSession=null;scene.bunHillLiveSession=null;session.closed=true;session.root?.remove();
  scene.bunHillSprites?.forEach(sprite=>sprite.destroy());scene.bunHillSprites=new Map();
  session.ropes?.forEach(g=>g.destroy());
  session.fences?.forEach(g=>g.destroy());
  if(session.assets) {
    [...Object.values(session.assets.geometry.parts),...Object.values(session.assets.climbers.frames),...Object.values(session.assets.crowds||{})].forEach(meta=>{
      const key=bunHillEventTextureKey(meta.file);if(scene.textures.exists(key))scene.textures.remove(key);
    });
  }
  // Restore only while still in the same city; never write an old clock over a newly loaded save.
  if(session.before&&typeof city!=='undefined'&&city===session.city) {
    resetGameClockAccumulator();simPaused=session.before.paused;
    simSpeedMul=session.before.speed;
    if(!simPaused)startSimTimer();updateSpeedButtons();updateHUD();updateTopbarGameTime();
  }
}
async function startBunHillEventTest(scene=typeof activeScene!=='undefined'?activeScene:null,race=false) {
  if(!scene||!isFestivalGameplayLive()||!isVisualRouteCalibrationTestModeEnabled())return false;
  if(scene.bunHillEventSession&&!scene.bunHillEventSession.assets)return false;
  closeBunHillMapEvent(scene);
  const venue=selectBunHillVenue(getBunHillMapVenueContext(scene));
  if(!venue){showFestivalNotice('搶包山需要連接海濱步道的平坦活動空地：最少 3×2 格，並有兩個出入口；公共碼頭及橋旁不適用。');return false;}
  const session={scene,city,venue,contest:simulateBunHillDesignContest(`${city.name}:${city.year}`),
    before:{time:city.timeOfDayMinutes,environment:city.environmentMinutes,paused:simPaused,speed:simSpeedMul},offset:race?1080:720,playing:false,speed:3,previous:null,closed:false};
  scene.bunHillEventSession=session;scene.bunHillSprites=new Map();
  stopSimTimer();simPaused=true;
  if(typeof stopDragonBoatAudio==='function')stopDragonBoatAudio(scene);
  try{session.assets=await loadBunHillEventTextures(scene);}catch(error){
    if(scene.bunHillEventSession===session){session.assets=bunHillEventMetadata;closeBunHillMapEvent(scene);showFestivalNotice(error.message);}
    return false;
  }
  if(scene.bunHillEventSession!==session){
    if(!scene.bunHillEventSession)Object.values(session.assets.geometry.parts).concat(Object.values(session.assets.climbers.frames),Object.values(session.assets.crowds||{})).forEach(meta=>{
      const key=bunHillEventTextureKey(meta.file);if(scene.textures.exists(key))scene.textures.remove(key);
    });
    return false;
  }
  const root=document.createElement('div');session.root=root;root.id='bun-hill-map-event';
  root.style.cssText='position:fixed;left:50%;bottom:76px;transform:translateX(-50%);z-index:100010;background:#102333;color:#ecf3f7;border:1px solid #406276;border-radius:10px;padding:12px;max-width:calc(100vw - 30px);font:13px system-ui;box-shadow:0 4px 24px #0008';
  root.innerHTML='<div>搶包山場地測試 · <span data-phase></span> · 一格 20m／欄杆 1.1m／選手 1.7m</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><button data-play>播放</button><button data-race>個人決賽</button><button data-speed>3倍（決賽60秒）</button><button data-close>結束測試</button><input data-seek type="range" min="720" max="1200" step=".02" style="width:240px" aria-label="搶包山節目時間"></div><div data-results></div><details style="margin-top:6px"><summary>即時成績（3分鐘前未落地者失格）</summary><div style="max-height:160px;overflow:auto"><table style="width:100%;text-align:left"><thead><tr><th>選手</th><th>組別</th><th>平安包</th><th>分數</th></tr></thead><tbody data-table></tbody></table></div></details>';
  root.querySelectorAll('button').forEach(b=>b.style.cssText='background:#284859;color:white;border:1px solid #527385;border-radius:4px;padding:5px 8px;cursor:pointer');
  root.addEventListener('pointerdown',e=>e.stopPropagation());root.addEventListener('wheel',e=>e.stopPropagation());
  root.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape')closeBunHillMapEvent(scene);});
  root.querySelector('[data-close]').onclick=()=>closeBunHillMapEvent(scene);
  root.querySelector('[data-play]').onclick=e=>{session.playing=!session.playing;session.previous=null;e.target.textContent=session.playing?'暫停':'播放';};
  root.querySelector('[data-race]').onclick=()=>{session.offset=1080;session.frame=null;session.previous=null;};
  root.querySelector('[data-speed]').onclick=e=>{session.speed=session.speed===3?1:3;e.target.textContent=session.speed===3?'3倍（決賽60秒）':'原速（決賽180秒）';};
  root.querySelector('[data-seek]').oninput=e=>{session.offset=Number(e.target.value);session.frame=null;session.previous=null;};
  document.body.append(root);
  const at=bunHillMapPoint(scene,venue,...BUN_HILL_LAYOUTS[venue.layoutId].tower);
  if(at){setMapZoom(scene,2);scene.cameras.main.centerOn(at.x,at.y-35);}
  updateSpeedButtons();updateBunHillMapEvent(scene,scene.time.now);return true;
}
function updateBunHillMapEvent(scene,time) {
  const session=scene?.bunHillEventSession;if(!session?.assets)return;
  if(city!==session.city||!isFestivalGameplayLive()||!isVisualRouteCalibrationTestModeEnabled()){closeBunHillMapEvent(scene);return;}
  if(time>=(session.checkAt||0)) {
    session.checkAt=time+2000;
    const ctx=getBunHillMapVenueContext(scene),grounds=new Set(ctx.eventGroundTiles.map(p=>p.join(':')));
    if(!session.venue.tiles.every(([r,c])=>grounds.has(`${r}:${c}`)&&!ctx.blocked(r,c)&&ctx.heightOf(r,c)===session.venue.height)||
      !session.venue.exits.every(([r,c])=>isPromenadeTile(r,c)&&!ctx.isPier(r,c)&&!ctx.isNearBridge(r,c))) {
      closeBunHillMapEvent(scene);showFestivalNotice('場地已改變，搶包山測試已結束。');return;
    }
  }
  const playbackNow=performance.now();
  if(session.previous!==null&&session.playing)session.offset=Math.min(1200,session.offset+Math.min(250,playbackNow-session.previous)/1000*session.speed/12);
  session.previous=playbackNow;
  // Keep the sky and lamps at the matching rehearsal time, including after midnight.
  drawBunHillMapEvent(session);
  const minute=Math.floor((session.offset+360)%1440);
  if(minute!==session.displayMinute){session.displayMinute=minute;updateTopbarGameTime({label:formatGameTimeOfDay(minute)});}
  if(session.offset>=1200){session.playing=false;session.root.querySelector('[data-play]').textContent='播放';}
}

// Saved run belongs to the sky-day's month; midnight never creates a new run.
function normalizeBunHillRun(raw) {
  if(!raw||typeof raw!=='object')return null;
  const integer=n=>Number.isSafeInteger(n)&&n>=0;
  const money=n=>Number.isFinite(Number(n))?Math.max(0,Math.trunc(Number(n))):0;
  if(!integer(raw.year)||!integer(raw.month)||raw.month<1||raw.month>12||!integer(raw.base))return null;
  const status=['running','held','cancelled','noVenue','skipped'].includes(raw.status)?raw.status:'skipped';
  let venue=null;
  const v=raw.venue;
  if(v&&['standard','compact'].includes(v.layoutId)&&integer(v.row)&&integer(v.col)&&integer(v.orientation)&&v.orientation<4&&Number.isFinite(v.height)) {
    const layouts=typeof BUN_HILL_LAYOUTS!=='undefined'?BUN_HILL_LAYOUTS:require('./festival-bun-hill').BUN_HILL_LAYOUTS;
    const layout=layouts[v.layoutId],cols=v.orientation%2?layout.rows:layout.cols,rows=v.orientation%2?layout.cols:layout.rows;
    const tiles=Array.from({length:cols*rows},(_,i)=>[v.row+Math.floor(i/cols),v.col+i%cols]);
    const [dr,dc]=BUN_HILL_DIRS[v.orientation];
    const exits=tiles.filter(([r,c])=>!tiles.some(p=>p[0]===r+dr&&p[1]===c+dc)).map(([r,c])=>[r+dr,c+dc]);
    venue={id:String(v.id||'').slice(0,60),row:v.row,col:v.col,orientation:v.orientation,layoutId:v.layoutId,height:v.height,cols,rows,tiles,exits};
  }
  if((status==='running'||status==='held')&&!venue)return null;
  return {year:raw.year,month:raw.month,base:raw.base,status,venue,seed:String(raw.seed||`bunHill:${raw.year}`).slice(0,200),
    tier:['basic','standard','grand'].includes(raw.tier)?raw.tier:'standard',cost:money(raw.cost),refund:money(raw.refund),
    lastOffset:Math.min(1440,money(raw.lastOffset)),reason:String(raw.reason||'').slice(0,200),opening:raw.opening===true,report:raw.report===true,effect:raw.effect===true};
}
function bunHillLiveVenueValid(venue,ctx) {
  if(!venue)return false;
  const tiles=new Set((ctx.eventGroundTiles||[]).map(p=>p.join(':')));
  if(!venue.tiles.every(([r,c])=>tiles.has(`${r}:${c}`)&&!ctx.blocked?.(r,c)&&ctx.heightOf(r,c)===venue.height))return false;
  const outward=['n','e','s','w'][venue.orientation];
  const promenades=new Set(ctx.promenadeTiles.filter(([r,c])=>!ctx.isPier?.(r,c)&&!ctx.isNearBridge?.(r,c)&&ctx.heightOf(r,c)===venue.height).map(p=>p.join(':')));
  const exits=venue.exits.filter(([r,c])=>promenades.has(`${r}:${c}`)&&ctx.seaSideOf(r,c)===outward);
  if(exits.length<2)return false;
  const connected=[exits[0]],seen=new Set([exits[0].join(':')]);
  for(let i=0;i<connected.length;i++)for(const [dr,dc] of BUN_HILL_DIRS){
    const [r,c]=connected[i],key=`${r+dr}:${c+dc}`;
    if(promenades.has(key)&&!seen.has(key)){seen.add(key);connected.push([r+dr,c+dc]);}
  }
  return connected.length>=3&&exits.every(p=>seen.has(p.join(':')));
}
function postBunHillLiveReport(run) {
  if(run.report)return;
  const held=run.status==='held',contest=simulateBunHillDesignContest(run.seed);
  const headline=held?'【海旁搶包山】三塔競技完滿結束，包山王及包山后出爐':`【海旁搶包山】${run.status==='noVenue'?'未有合適場地':run.status==='skipped'?'本屆未能舉辦':'節目取消'}`;
  const body=held?[`${city.name||'香城'}海旁搶包山之夜在活動空地舉行，12 位選手分攀三座包山。`,
    `包山王：${contest.awards.men[0]?.name||'未產生'}；包山后：${contest.awards.women[0]?.name||'未產生'}；代代平安獎：${contest.awards.mostBuns?.name||'未產生'}。`,
    '高、中、低區平安包分別為 9、3、1 分；三分鐘前返回地面才有有效成績。',
    `逾時失格：${contest.results.filter(p=>!p.valid).map(p=>p.name).join('、')||'無'}。`]:[run.reason||'活動未能舉行。',`本屆支出 $${run.cost}，退回 $${run.refund}。`];
  if(typeof addForumPost==='function')addForumPost({headline,body,source:'local',image:held?'UI/news/bunHillCompetition.webp':''},
    {id:`festival-bunHill-${run.year}-${run.month}-report`,category:'城中熱話',author:'香城日報',outcome:`bunHill_${run.status}`,year:run.year,month:run.month});
  run.report=true;
  if(typeof addCityNews==='function')addCityNews(headline);
  if(typeof queueCityChangeAutosave==='function')queueCityChangeAutosave();
}
function finishBunHillLiveRun(run,status,reason='') {
  if(run.status!=='running')return;
  run.status=status;run.reason=reason;
  if(status==='cancelled'){
    run.refund=Math.round(run.cost*(run.lastOffset<1080?.5:.25));city.budget+=run.refund;
  }
  if(status==='held'&&!run.effect){
    if(typeof addCouncilTemporaryEffect==='function')addCouncilTemporaryEffect(`festival:bunHill:${run.year}`,1,getFestivalEffects('bunHill',run.tier));
    run.effect=true;
  }
  recordFestivalHistory({id:'bunHill',year:run.year,outcome:status,cost:run.cost,income:run.refund,attendance:status==='held'?(run.venue.layoutId==='standard'?105:84):0});
  postBunHillLiveReport(run);
  if(typeof updateHUD==='function')updateHUD();
}
function updateBunHillLiveEvent(scene,time) {
  if(!scene||typeof city==='undefined'||scene.bunHillEventSession)return;
  if(!isFestivalGameplayLive()){if(scene.bunHillLiveSession)closeBunHillMapEvent(scene);return;}
  const state=getCityFestivalState(),env=getEnvironmentMinutes(),base=Math.floor(env/1440)*1440,offset=env-base;
  let run=state.bunHill;
  // Manual date jumps interrupt a running edition instead of inventing a result.
  if(run?.status==='running'&&(run.year!==city.year||run.month!==city.month||run.base!==base))finishBunHillLiveRun(run,'cancelled','城市日期已跨越本屆活動時段');
  if(!isFestivalEnabled('bunHill')||getFestivalTier('bunHill')==='skip'){
    if(run?.status==='running'){run.lastOffset=offset;finishBunHillLiveRun(run,'cancelled','活動或撥款已關閉');}
    if(scene.bunHillLiveSession)closeBunHillMapEvent(scene);return;
  }
  if(city.month!==getFestivalMonth('bunHill',city.year)||offset<720||offset>=1200){
    if(run?.status==='running'&&offset>=1095){run.lastOffset=offset;finishBunHillLiveRun(run,'held');}
    if(scene.bunHillLiveSession)closeBunHillMapEvent(scene);return;
  }
  const edition=run&&run.year===city.year&&run.month===city.month&&run.base===base;
  if(edition&&run.status==='noVenue'&&offset>=1080){if(!run.report)postBunHillLiveReport(run);return;}
  // A completed year's ledger also protects older saves lacking a live run.
  if(!edition&&getFestivalHistoryEntry('bunHill',city.year)?.outcome==='held')return;
  if(!edition||run.status==='noVenue'){
    if(time<(scene.bunHillRetryAt||0))return;scene.bunHillRetryAt=time+2000;
    const venue=selectBunHillVenue(getBunHillMapVenueContext(scene),state.venues.bunHill||''),tier=getFestivalTier('bunHill');
    const status=!venue?'noVenue':offset>=1080?'skipped':'running';
    run=state.bunHill=normalizeBunHillRun({year:city.year,month:city.month,base,seed:`${city.name}:${city.year}`,venue,tier,status,lastOffset:offset,
      reason:!venue?'需要相連、同高度的岸上活動空地及至少兩個海濱步道入口':offset>=1080?'本屆開場時段已過':''});
    if(status==='running'){
      const cost=getFestivalCost('bunHill',tier,city.population);
      if(spendBudget(cost))run.cost=cost;else{run.status='skipped';run.reason='城市資金不足';}
      if(typeof updateHUD==='function')updateHUD();
      if(typeof queueCityChangeAutosave==='function')queueCityChangeAutosave();
    }
    if(run.status!=='running'){
      recordFestivalHistory({id:'bunHill',year:run.year,outcome:run.status});
      if(run.status!=='noVenue'||offset>=1080)postBunHillLiveReport(run);
      return;
    }
  }
  if(run.status==='cancelled'||run.status==='skipped')return;
  run.lastOffset=offset;
  if(run.status==='running'&&time>=(scene.bunHillLiveValidateAt||0)){
    scene.bunHillLiveValidateAt=time+2000;
    if(!bunHillLiveVenueValid(run.venue,getBunHillMapVenueContext(scene)))finishBunHillLiveRun(run,'cancelled','場地、地勢或海旁入口已改變');
    else if(['signal3','signal8','signal9','signal10'].includes(city.weather?.typhoonStage)||['red','black'].includes(city.weather?.rainWarning))finishBunHillLiveRun(run,'cancelled','強風或紅／黑色暴雨警告');
  }
  if(run.status==='cancelled'){if(scene.bunHillLiveSession)closeBunHillMapEvent(scene);return;}
  if(run.status==='running'&&offset>=1095)finishBunHillLiveRun(run,'held');
  if(!run.opening&&run.status==='running'&&offset>=1050){
    run.opening=true;
    showFestivalNotice('【海旁搶包山之夜】三塔競技午夜開賽！',()=>centerCameraOnTile(scene,run.venue.row,run.venue.col));
    if(typeof queueCityChangeAutosave==='function')queueCityChangeAutosave();
  }
  let session=scene.bunHillLiveSession;
  if(session&&(session.city!==city||session.run!==run)){closeBunHillMapEvent(scene);session=null;}
  if(!session){
    session={scene,city,run,venue:run.venue,contest:simulateBunHillDesignContest(run.seed),offset,closed:false};
    scene.bunHillLiveSession=session;scene.bunHillSprites=new Map();
    loadBunHillEventTextures(scene).then(assets=>{
      if(scene.bunHillLiveSession===session&&!session.closed)session.assets=assets;
      else if(!scene.bunHillEventSession&&!scene.bunHillLiveSession)Object.values(assets.geometry.parts).concat(Object.values(assets.climbers.frames),Object.values(assets.crowds)).forEach(m=>{const k=bunHillEventTextureKey(m.file);if(scene.textures.exists(k))scene.textures.remove(k);});
    }).catch(error=>{if(scene.bunHillLiveSession===session){closeBunHillMapEvent(scene);console.warn('[bunHill]',error.message);}});
  }
  session.offset=offset;
  if(session.assets)drawBunHillMapEvent(session);
}

if(typeof module!=='undefined'&&module.exports)module.exports={normalizeBunHillRun,bunHillLiveVenueValid,selectBunHillVenue,bunHillVenuePoint,getBunHillMapContestFrame,BUN_HILL_TILE_M,BUN_HILL_UP_PX};
