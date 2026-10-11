const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const db=require('../festival-dragon-boat');
function shoreContext(blocked=()=>false){const run=Array.from({length:18},(_,i)=>[30,10+i]);return {runs:[run],seaSideOf:()=> 's',hasPromenade:(r,c)=>r===30&&c>=10&&c<=27,isSea:(r,c)=>r>30&&r<40&&c>0&&c<60,isBlocked:blocked};}
function run(){const teams=db.createDragonBoatTeams({districtName:'土瓜灣',companyName:'香城航運',seed:'test'});return db.normalizeDragonBoatRun({year:2026,month:6,status:'running',seed:'test',course:db.selectDragonBoatCourse(shoreContext()),teams,tier:'standard'});}
test('a staircase audience shore is separate from a straight 270m course and its return corridor',()=>{
 const ctx=shoreContext();const c=db.selectDragonBoatCourse(ctx);assert.equal(c.distanceM,270);assert.ok(db.dbCourseValid(c,ctx));
 assert.equal(Math.hypot(db.dbPoint(c,13.5).row-c.row,db.dbPoint(c,13.5).col-c.col)*20,270);
 assert.equal(db.selectDragonBoatCourse({...ctx,runs:[[[30,10],[30,11]]]}),null);
 assert.equal(db.selectDragonBoatCourse({...ctx,isSea:()=>false}),null);
 assert.equal(db.selectDragonBoatCourse({...ctx,isBlocked:()=>true}),null);
 assert.equal(db.dbCourseValid({...c,dir:c.sea},ctx),false);
});
test('boats and outside return must avoid ferry/bridge blocked cells',()=>{
 const ctx=shoreContext(),c=db.selectDragonBoatCourse(ctx),p=db.dbPoint(c,5,3);
 assert.equal(db.dbCourseValid(c,{...ctx,isBlocked:(r,col)=>r===Math.round(p.row)&&col===Math.round(p.col)}),false);
});
test('the six specified names keep the female-drummer green boat and city fallback',()=>{
 const teams=db.createDragonBoatTeams({districtName:'土瓜灣',cityName:'太子',seed:'x'});
 assert.deepEqual(teams.map(t=>t.name),['土瓜灣街坊福利會','香城女神隊','李彩樺漁業聯會','漁民樂海鮮酒家','香城討論區毒L','太子小輪職工會']);assert.equal(teams[1].colour,'green');
});
test('save normalisation restores the exact seeded rounds and rejects unusable running saves',()=>{
 const r=run(),loaded=db.normalizeDragonBoatRun(JSON.parse(JSON.stringify(r)));assert.deepEqual(loaded,r);
 assert.equal(db.normalizeDragonBoatRun({...r,course:null}),null);assert.equal(db.normalizeDragonBoatRun({...r,teams:[]}),null);
 assert.equal(db.normalizeDragonBoatRun({...r,course:{...r.course,row:Infinity}}),null);
 assert.equal(db.normalizeDragonBoatRun({...r,month:19}),null);
 assert.equal(db.normalizeDragonBoatRun({...r,extra:'discarded'}).extra,undefined);
});
test('all boats advance monotonically and cross the finish in their published order',()=>{
 const r=run(),round=r.rounds.at(-1),max=Math.max(...round.map(e=>e.seconds));
 for(const entry of round){let prior=-1;for(let i=0;i<=1000;i++){const p=db.dragonBoatProgress(i/1000,entry,max);assert.ok(p>=prior&&p>=0&&p<=1);prior=p;}assert.equal(prior,1);}
 const first=round[0];assert.equal(db.dragonBoatProgress(first.seconds/max,first,max),1);
 assert.ok(db.dragonBoatProgress(first.seconds/max,round[1],max)<1);
 assert.equal(new Set(round.map(e=>e.lane)).size,6);
});
test('red rain and T3 stop boats, yellow rain does not; delayed format has one qualifier',()=>{
 assert.ok(db.dragonBoatWeatherBad({typhoonStage:'signal3'}));assert.ok(db.dragonBoatWeatherBad({rainWarning:'red'}));assert.equal(db.dragonBoatWeatherBad({rainWarning:'yellow',typhoonStage:'signal1'}),false);
 const r=db.normalizeDragonBoatRun({...run(),delayed:true});assert.equal(r.rounds.length,2);assert.equal(db.dragonBoatPhase(545,true).kind,'waiting');assert.equal(db.dragonBoatPhase(905,true).round,1);
});
test('race envelope includes every sampled pose, including the outer return',()=>{
 const r=run(),ctx=shoreContext();for(let minute=540;minute<600;minute+=.2)for(const team of r.teams){const p=db.dragonBoatPose(r,team,minute);assert.ok(ctx.isSea(Math.round(p.row),Math.round(p.col)));}
});
test('measured boat textures preserve 18m along-axis scale in all 24 views',()=>{
 const {getFestivalParts}=require('../festival-assets'),{getFestivalSpriteScale}=require('../festival-sprites');
 const meta=require('../data/festival-textures.json');
 for(const part of getFestivalParts('dragonBoat').filter(p=>/^db(black|blue|green|purple|red|yellow)/.test(p.id)))for(const mirror of ['', '_m']){
  const m=meta.textures[`fx_${part.id}${mirror}`];assert.ok(m.groundSpanX>0);const scale=getFestivalSpriteScale(m,part,1);assert.equal(Math.round(scale*m.groundSpanX*1e8)/1e8,45);
 }
});
function browser(){const context=vm.createContext({console,Map,Set,Math,city:{name:'太子',year:2026,month:6,budget:10000,population:1000,weather:{},happiness:.5},
 addCouncilTemporaryEffect:(...args)=>context.effects.push(args),addForumPost:(...args)=>context.posts.push(args),effects:[],posts:[],addCityNews:()=>{},queueCityChangeAutosave:()=>{},
 getDistrictNameForTile:()=>({zh:'土瓜灣'})});
 for(const file of ['festival-lunar-data.js','festival-calendar.js','festivals.js','festival-dragon-boat.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 context.city.festivals=vm.runInContext('createFestivalState()',context);context.city.festivals.dragonBoat=JSON.parse(JSON.stringify(run()));return context;}
test('finishing and reload cannot pay effects, refunds, or forum reports twice',()=>{
 const c=browser();vm.runInContext("finishDragonBoatRun(city.festivals.dragonBoat,'held');finishDragonBoatRun(city.festivals.dragonBoat,'held')",c);assert.equal(c.effects.length,1);assert.equal(c.posts.length,1);assert.equal(c.city.festivals.history[0].champion.length>0,true);
 vm.runInContext("city.festivals=normalizeFestivalState(JSON.parse(JSON.stringify(city.festivals)));postDragonBoatReport(city.festivals.dragonBoat)",c);assert.equal(c.posts.length,1);
 const cancelled=browser();cancelled.city.festivals.dragonBoat.cost=1000;
 vm.runInContext("finishDragonBoatRun(city.festivals.dragonBoat,'cancelled','紅雨');finishDragonBoatRun(city.festivals.dragonBoat,'cancelled','紅雨')",cancelled);assert.equal(cancelled.city.budget,10500);assert.equal(cancelled.effects.length,0);assert.equal(cancelled.posts.length,1);
 const late=browser();late.city.festivals.dragonBoat.cost=1000;late.city.festivals.dragonBoat.lastMinute=545;vm.runInContext("finishDragonBoatRun(city.festivals.dragonBoat,'cancelled','紅雨')",late);assert.equal(late.city.budget,10250);
});

test('shelter fleet route objects block the race corridor outside the basin',()=>{
 const c=browser();c.getFestivalVenueContext=()=>({promenadeTiles:[[30,10],[30,11],[30,12],[30,13],[30,14],[30,15]]});
 c.orderFestivalPromenadeRuns=tiles=>[tiles];c.typhoonShelterFleetCache=new Map([['shelter',{routeBySlot:new Map([['slot',{route:[[33,12],[33,18]],length:6}]])}]]);
 const ctx=vm.runInContext('getDragonBoatContext({})',c);assert.ok(ctx.isBlocked(33,15));assert.ok(ctx.isBlocked(32,15));assert.equal(ctx.isBlocked(37,15),false);
});

test('space report covers exactly the validated water cells, beyond nominal geometry',()=>{
 const c=run().course,space=db.dragonBoatCourseSpace(c),seen=new Set();
 assert.ok(db.dbCourseValid(c,{...shoreContext(),isSea:(r,col)=>{seen.add(`${r}:${col}`);return true;}}));
 assert.deepEqual(new Set(space.tiles),seen);assert.equal(space.geometryLengthM,310);assert.equal(space.geometryWidthM,80);
 assert.equal(space.alongTiles,17);assert.equal(space.acrossTiles,5);assert.equal(space.tileCount,85);
});
test('hull centre stays continuous when return headings change and boats rejoin the start',()=>{
 const r=run();for(const t of r.teams)for(const minute of [590,592,598,600]){
  const a=db.dragonBoatPose(r,t,minute-.00001),b=db.dragonBoatPose(r,t,minute+.00001);
  assert.ok(Math.hypot(a.row-b.row,a.col-b.col)*20<.01);
 }
});

test('return convoy keeps boats separated on the outer straight and rejoins every lane',()=>{
 const r=run(),c=r.course,n={n:[-1,0],e:[0,1],s:[1,0],w:[0,-1]}[c.sea];
 for(let minute=590;minute<600;minute+=.05){
  const poses=r.teams.map(t=>db.dragonBoatPose(r,t,minute));
  const outer=poses.filter(p=>Math.abs((p.row-c.row)*n[0]+(p.col-c.col)*n[1]-3)<1e-8);
  for(let i=0;i<outer.length;i++)for(let j=i+1;j<outer.length;j++)assert.ok(Math.hypot(outer[i].row-outer[j].row,outer[i].col-outer[j].col)*20>18);
 }
 for(const t of r.teams){const a=db.dragonBoatPose(r,t,599.99999),b=db.dragonBoatPose(r,t,600);assert.ok(Math.hypot(a.row-b.row,a.col-b.col)*20<.01);}
});

test('six crews have substantial speed differences, while contact remains occasional',()=>{
 let contacts=0,totalSpread=0;
 for(let i=0;i<100;i++){
  const seed=`varied-${i}`,teams=db.createDragonBoatTeams({seed}),round=db.dragonBoatRound(teams,seed,'final',270);
  assert.ok(new Set(teams.map(t=>Math.round(t.strength*100))).size>=3);
  const spread=round.at(-1).seconds-round[0].seconds;totalSpread+=spread;
  if(round.some(e=>e.incidents.length))contacts++;
  assert.deepEqual(db.dragonBoatRound(teams,seed,'final',270),round);
 }
 assert.ok(totalSpread/100>15);assert.ok(contacts>0&&contacts<70);
});

test('recorded contacts require hull overlap and visibly slow the affected crews',()=>{
 let checked=0;
 for(let i=0;i<30;i++){
  const seed=`contact-${i}`,round=db.dragonBoatRound(db.createDragonBoatTeams({seed}),seed,'final',270);
  for(const entry of round)for(const event of entry.incidents){
   const other=round.find(e=>e.teamId===event.otherTeamId),a=db.dragonBoatTrackPoint(entry,event.seconds),b=db.dragonBoatTrackPoint(other,event.seconds);
   assert.ok(Math.abs(a.alongM-b.alongM)<=17.00001);assert.ok(Math.abs(a.acrossM-b.acrossM)<=2.80001);
   const before=db.dragonBoatTrackPoint(entry,event.seconds-1),after=db.dragonBoatTrackPoint(entry,event.seconds+1);
   assert.ok(after.alongM-a.alongM<(a.alongM-before.alongM)*.6);checked++;
  }
 }
 assert.ok(checked>0);
});

test('lateral drift stays inside reserved water and finish positions never jump backwards',()=>{
 const r=run();let drift=0;
 for(const round of r.rounds)for(const entry of round)for(const [time,along,across] of entry.track){
  assert.ok(across>=-3&&across<=43);assert.ok(along>=0&&along<=270);
  drift=Math.max(drift,Math.abs(across-entry.lane*8));
 }
 assert.ok(drift>1);
 for(const t of r.teams){
  const a=db.dragonBoatPose(r,t,584.99999),b=db.dragonBoatPose(r,t,585.00001);
  assert.ok(Math.hypot(a.row-b.row,a.col-b.col)*20<.01);
 }
});

test('old saves keep their original results; new saves regenerate compact deterministic tracks',()=>{
 const r=run(),old=db.normalizeDragonBoatRun({...r,motionVersion:1});delete old.motionVersion;
 const restored=db.normalizeDragonBoatRun(JSON.parse(JSON.stringify(old)));
 assert.equal(restored.motionVersion,1);assert.deepEqual(restored.rounds,old.rounds);
 assert.ok(restored.rounds.every(round=>round.every(e=>!e.track)));
 const json=JSON.stringify(r),fresh=db.normalizeDragonBoatRun(JSON.parse(json));assert.equal(json.includes('"track"'),false);
 assert.equal(fresh.motionVersion,2);
 for(let i=0;i<r.rounds.length;i++)for(let j=0;j<6;j++)assert.deepEqual(fresh.rounds[i][j].track,r.rounds[i][j].track);
});

test('forum collision reports describe actual contacts and omit them for clean races',()=>{
 const c=browser(),r=c.city.festivals.dragonBoat;
 r.rounds[0][0].incidents=[{seconds:20,alongM:60,acrossM:8,otherTeamId:r.rounds[0].find(e=>e.teamId!==r.rounds[0][0].teamId).teamId}];
 // Both hull entries report the same contact; the news must mention it once.
 const a=r.rounds[0][0],b=r.rounds[0].find(e=>e.teamId===a.incidents[0].otherTeamId);
 b.incidents=[{...a.incidents[0],otherTeamId:a.teamId}];
 for(const round of r.rounds)for(const entry of round)if(entry!==a&&entry!==b)entry.incidents=[];
 vm.runInContext("finishDragonBoatRun(city.festivals.dragonBoat,'held')",c);
 assert.equal(c.posts[0][0].image,'UI/news/dragonBoatCollision.webp');
 assert.ok(fs.existsSync(c.posts[0][0].image));
 assert.ok(fs.existsSync('UI/news/thumbs/dragonBoatCollision.webp'));
 assert.ok(c.posts[0][0].headline.includes('偏航相撞'));assert.equal(c.posts[0][0].body.filter(s=>s.includes('出現偏航相撞')).length,1);
 const clean=browser();for(const round of clean.city.festivals.dragonBoat.rounds)for(const entry of round)entry.incidents=[];
 vm.runInContext("finishDragonBoatRun(city.festivals.dragonBoat,'held')",clean);
 assert.equal(clean.posts[0][0].headline.includes('偏航相撞'),false);assert.equal(clean.posts[0][0].image,'');
});

test('live collision news waits for impact, deduplicates both hulls and survives reload',()=>{
 const c=browser(),r=c.city.festivals.dragonBoat,round=r.rounds[0],a=round[0],b=round[1];
 for(const entries of r.rounds)for(const entry of entries)entry.incidents=[];
 a.incidents=[{seconds:20,alongM:60,acrossM:8,otherTeamId:b.teamId}];b.incidents=[{...a.incidents[0],otherTeamId:a.teamId}];
 const minute=555+20/Math.max(...round.map(e=>e.seconds))*30;
 vm.runInContext(`postDragonBoatContactNews(city.festivals.dragonBoat,${minute-.001})`,c);assert.equal(c.posts.length,0);
 vm.runInContext(`postDragonBoatContactNews(city.festivals.dragonBoat,${minute+.001});postDragonBoatContactNews(city.festivals.dragonBoat,600)`,c);
 assert.equal(c.posts.length,1);assert.equal(c.posts[0][0].image,'UI/news/dragonBoatCollision.webp');assert.match(c.posts[0][0].headline,/龍舟撞船/);assert.ok(c.posts[0][0].headline.includes(r.teams.find(t=>t.id===a.teamId).name));
 const restored=db.normalizeDragonBoatRun(JSON.parse(JSON.stringify(r)));assert.deepEqual(Array.from(restored.contactReports),Array.from(r.contactReports));
 restored.rounds=r.rounds;c.city.festivals.dragonBoat=restored;
 vm.runInContext('postDragonBoatContactNews(city.festivals.dragonBoat,600)',c);assert.equal(c.posts.length,1);
 c.city.festivals.dragonBoat.status='cancelled';c.city.festivals.dragonBoat.contactReports=[];
 vm.runInContext('postDragonBoatContactNews(city.festivals.dragonBoat,600)',c);assert.equal(c.posts.length,1);
});

test('spectator groups remain on land within shore cells and leave structures and piers clear',()=>{
 for(const [dir,sea] of [['e','s'],['w','n'],['s','w'],['n','e']]){
  const a={n:[-1,0],e:[0,1],s:[1,0],w:[0,-1]}[dir],n={n:[-1,0],e:[0,1],s:[1,0],w:[0,-1]}[sea];
  const course={row:40+n[0]*1.5,col:40+n[1]*1.5,dir,sea,distanceM:270,venueTiles:Array.from({length:14},(_,i)=>[40+a[0]*i,40+a[1]*i])};
  const reserved=new Set(['40:40']),blocked=course.venueTiles[3],slots=db.dragonBoatSpectatorSlots(course,reserved,(r,c)=>r!==blocked[0]||c!==blocked[1]);
  assert.equal(slots.length,36);
  const groups=new Map();for(const p of slots){const key=`${p.shoreRow}:${p.shoreCol}`;groups.set(key,(groups.get(key)||0)+1);}
  assert.ok([...groups.values()].every(count=>count===3));
  for(const p of slots){assert.ok(!reserved.has(`${p.shoreRow}:${p.shoreCol}`));assert.notDeepEqual([p.shoreRow,p.shoreCol],blocked);
   // Conservative 2.5 m clearance in both map axes: no part enters the water tile.
   assert.ok(Math.abs(p.row-p.shoreRow)*20+2.5<10);assert.ok(Math.abs(p.col-p.shoreCol)*20+2.5<10);
   assert.ok(Math.abs(((p.row-p.shoreRow)*n[0]+(p.col-p.shoreCol)*n[1])*20-7)<1e-8);
  }
  for(let i=0;i<slots.length;i++)for(let j=i+1;j<slots.length;j++)assert.ok(Math.hypot(slots[i].row-slots[j].row,slots[i].col-slots[j].col)*20>=5.99);
 }
});

test('all eight spectator textures scale the measured adult to 1.7 m in release and source sizes',()=>{
 const {getFestivalParts}=require('../festival-assets'),{getFestivalSpriteScale}=require('../festival-sprites'),meta=require('../data/festival-textures.json');
 const parts=getFestivalParts('dragonBoat').filter(p=>p.id.startsWith('dbspectators'));assert.equal(parts.length,4);
 for(const p of parts)for(const mirror of ['', '_m']){const m=meta.textures[`fx_${p.id}${mirror}`];assert.ok(m.personHeightPx>0);assert.equal(m.people,7);
  assert.ok(Number.isInteger(Math.log2(m.width))&&Number.isInteger(Math.log2(m.height)));
  for(const resize of [1,.5])assert.ok(Math.abs(getFestivalSpriteScale(m,p,resize)*m.personHeightPx*resize-8.5)<1e-8);
 }
});

test('rotating the map immediately selects the opposite spectator view and mirror',()=>{
 const c=browser();c.scene={time:{now:100}};c.mapRotation=0;
 c.isPromenadeTile=()=>true;c.promenadeTileIsFree=()=>true;c.isPromenadeNearBridge=()=>false;c.getPromenadePiers=()=>({piers:new Set()});c.getPromenadeSeaSides=()=>['s'];
 c.isoToScreen=(col,row)=>c.mapRotation===0?{x:-row,y:row}:{x:row,y:-row};
 const front=vm.runInContext('dragonBoatCrowdPlacements(scene,city.festivals.dragonBoat,915,new Set())',c);
 assert.ok(front.length>0);assert.ok(front.every(p=>p.partId.includes('Front')&&p.mirrored));
 c.mapRotation=2;
 const back=vm.runInContext('dragonBoatCrowdPlacements(scene,city.festivals.dragonBoat,915,new Set())',c);
 assert.equal(back.length,front.length);assert.ok(back.every(p=>p.partId.includes('Back')&&!p.mirrored));
});


test('water props use the fishing swell without changing their base, size or race position',()=>{
 const c=browser();vm.runInContext(fs.readFileSync('typhoon-shelter-sprites.js','utf8'),c);
 let seaFlow=true;c.isSeaFlowEnabled=()=>seaFlow;
 for(const partId of ['dbredNW','dbgreenSW','dbrescueBoat','dbraceBuoy','dbstartMarker','dbgoalMarker','dbguardLine','dbpier']){
  const p={id:partId,partId,row:31.5,col:12.25},profile=db.getDragonBoatFloatProfile(partId);
  const sprite={festivalPlacement:p,x:100,y:200,depth:42,scale:1.7,rotation:0,
   setPosition(x,y){this.x=x;this.y=y;},setRotation(roll){this.rotation=roll;}};
  c.sprite=sprite;c.profile=profile;
  let maxDy=0,maxRoll=0;
  for(let t=0;t<5000;t+=100){
   sprite.setPosition(100,200); // The production placement step reprojects the anchor each frame.
   const expected=vm.runInContext(`getTyphoonShelterBob(${t},31.5,12.25,dbHash(sprite.festivalPlacement.id),profile.lengthM,profile)`,c);
   vm.runInContext(`applyDragonBoatBobbing(sprite,${t})`,c);
   assert.equal(sprite.y,200+expected.dy);assert.equal(sprite.rotation,expected.roll);
   assert.equal(sprite.x,100);assert.equal(sprite.depth,42);assert.equal(sprite.scale,1.7);
   maxDy=Math.max(maxDy,Math.abs(sprite.y-200));maxRoll=Math.max(maxRoll,Math.abs(sprite.rotation));
  }
  assert.ok(maxDy>.3&&maxDy<2);assert.equal(maxRoll>0,profile.roll>0);
  assert.deepEqual(sprite.festivalPlacement,p);
  seaFlow=false;sprite.setPosition(100,200);vm.runInContext('applyDragonBoatBobbing(sprite,1200)',c);
  assert.equal(sprite.y,200);assert.equal(sprite.rotation,0);seaFlow=true;
 }
 for(const partId of ['dbceremonyStage','dbchampionStand1','dbviewersStage','dbspectatorsFront1','dbspectatorsBack2']){
  assert.equal(db.getDragonBoatFloatProfile(partId),null);
  const sprite={festivalPlacement:{partId},setPosition(){throw Error('land prop moved');},setRotation(){throw Error('land prop rolled');}};
  c.sprite=sprite;vm.runInContext('applyDragonBoatBobbing(sprite,1200)',c);
 }
});
