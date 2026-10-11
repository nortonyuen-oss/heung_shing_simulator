const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),sharp=require('sharp');
const {selectBunHillVenue,bunHillVenuePoint,getBunHillMapContestFrame}=require('../bun-hill-event');
const {getEventGroundVenueComponents}=require('../festival-venues');
const {BUN_HILL_LAYOUTS}=require('../festival-bun-hill');
function context(cols=4,rows=3,orientation=0){
 const tiles=[];for(let r=10;r<10+rows;r++)for(let c=20;c<20+cols;c++)tiles.push([r,c]);
 const promenadeTiles=Array.from({length:orientation%2?rows:cols},(_,i)=>orientation===0?[9,20+i]:orientation===1?[10+i,20+cols]:orientation===2?[10+rows,20+i]:[10+i,19]);
 return {eventGrounds:getEventGroundVenueComponents(tiles),promenadeTiles,seaSideOf:()=>['n','e','s','w'][orientation],heightOf:()=>0};
}
test('shore venue requires a filled level rectangle, connected waterfront and separate exits',()=>{
 const ctx=context(),venue=selectBunHillVenue(ctx);assert.equal(venue.layoutId,'standard');assert.equal(venue.tiles.length,12);assert.equal(venue.exits.length,4);
 assert.equal(selectBunHillVenue(context(3,2)).layoutId,'compact');
 assert.equal(selectBunHillVenue({...context(3,2),promenadeTiles:[[9,20],[9,21]]}),null,'two shoreline tiles are insufficient');
 assert.equal(selectBunHillVenue({...context(3,2),isPier:()=>true}),null);
 assert.equal(selectBunHillVenue({...context(3,2),isNearBridge:()=>true}),null);
 assert.equal(selectBunHillVenue({...context(3,2),blocked:(r,c)=>r===10&&c===20}),null);
 assert.equal(selectBunHillVenue({...context(3,2),heightOf:(r,c)=>r===11?1:0}),null);
 assert.equal(selectBunHillVenue({...context(3,2),seaSideOf:()=>null}),null);
 const hole=context(3,2);hole.eventGrounds[0].tiles.pop();assert.equal(selectBunHillVenue(hole),null);
 for(let rot=0;rot<4;rot++){
  const ctx=context(rot%2?2:3,rot%2?3:2,rot),v=selectBunHillVenue(ctx);assert.equal(v.orientation,rot);
  for(const [x,y] of [[1,1],[59,1],[59,39],[1,39]]){const p=bunHillVenuePoint(v,x,y);assert.ok(v.tiles.some(([r,c])=>r===Math.round(p.row)&&c===Math.round(p.col)));}
 }
});
test('measured art has power-of-two canvases, equal isometric slopes and preserved physical scale',async()=>{
 const {parts}=JSON.parse(fs.readFileSync('data/bun-hill-geometry.json'));
 const tower=parts.bunHill1,characters=JSON.parse(fs.readFileSync('data/bun-hill-climbers.json'));
 for(const [key,part] of Object.entries(parts)) {
  const image=await sharp(part.file).metadata();assert.equal(image.width&(image.width-1),0);assert.equal(image.height&(image.height-1),0);
  const points=part.ground;for(let i=1;i<points.length;i++)assert.ok(Math.abs(Math.abs((points[i][1]-points[i-1][1])/(points[i][0]-points[i-1][0]))-.5)<1e-5);
  if(part.beam)for(let i=1;i<part.beam.length;i++)assert.ok(Math.abs(Math.abs((part.beam[i][1]-part.beam[i-1][1])/(part.beam[i][0]-part.beam[i-1][0]))-.5)<1e-5,'same-height roof beams follow the tile axes');
  if(part.body){assert.ok(Math.abs((part.body[0][1]-part.body[1][1])*part.scale-part.heightM*5)<1e-7);
   assert.ok(Math.abs((part.rail[0][1]-part.rail[1][1])*part.scale-5.5)<1e-7);
   assert.ok(part.heightM>=4&&part.heightM<=6,'railings, rather than a nominal 14m tower, set the scale');}
  else assert.ok(Math.abs(Math.abs(points[1][0]-points[0][0])*part.scale-part.lengthM*2.5)<1e-7);
  assert.ok(part.reserveM.every((n,i)=>n>part.footprintM[i]));
  if(part.mirrored){const base=parts[key.replace(/_m$/,'')];assert.equal(part.anchor[0],image.width-base.anchor[0]);assert.equal(part.scale,base.scale);}
 }
 for(const frame of Object.values(characters.frames))assert.ok(Math.abs((5.5/(frame.heightM*5))-1.1/1.7)<1e-10);
 const footprint=tower.reserveM;
 for(const layout of Object.values(BUN_HILL_LAYOUTS)) {
  const [x,y]=layout.tower,[a,b,w,h]=layout.core;
  assert.ok(x-footprint[0]/2>=a&&x+footprint[0]/2<=a+w&&y-footprint[1]/2>=b&&y+footprint[1]/2<=b+h);
  const stage=parts.bunHillStage.reserveM,[sx,sy]=layout.stage;
  assert.ok(sx-stage[0]/2>=6,'keep the six-metre side exit clear');
  assert.ok(sx+stage[0]/2<=x-footprint[0]/2||sy+stage[1]/2<=y-footprint[1]/2);
  assert.ok(sy-stage[1]/2>=6,'stage leaves the shoreline passage open');
  assert.equal(sx,layout.widthM/2,'stage is centred along the rear boundary');
  assert.equal(x,sx,'main tower lines up with stage');
  assert.ok(layout.decor.length===2&&layout.decor[0][0]<x&&layout.decor[1][0]>x);
  for(const [i,p] of layout.decor.entries()) {
   const reserve=parts[`bunHill${i+2}`].reserveM;
   assert.ok(p[1]>y,'display towers stand in front of the main tower');
   assert.ok(p[0]-reserve[0]/2>=6&&p[0]+reserve[0]/2<=layout.widthM-6);
   assert.ok(p[0]+reserve[0]/2<=a||p[0]-reserve[0]/2>=a+w,'display towers do not enter competition core');
   assert.ok(p[1]+reserve[1]/2<layout.crowds[0][1],'leave space before front audience');
  }
  assert.deepEqual(layout.stageFacing,parts.bunHillStage.frontLocal);
  assert.equal(layout.signboards.length,6);
  for(const side of [0,1])assert.equal(layout.signboards.filter(b=>b.side===side).length,3);
  for(const b of layout.signboards)assert.ok(layout.fences[b.side].some((p,i,path)=>i&&((p[0]===b.point[0]&&path[i-1][0]===b.point[0]&&b.point[1]>=Math.min(p[1],path[i-1][1])&&b.point[1]<=Math.max(p[1],path[i-1][1]))||(p[1]===b.point[1]&&path[i-1][1]===b.point[1]&&b.point[0]>=Math.min(p[0],path[i-1][0])&&b.point[0]<=Math.max(p[0],path[i-1][0])))),'flower board is mounted on its fence');

 }
});
test('rehearsal sky crosses midnight while city clock and simulation remain unchanged',()=>{
 const city={timeOfDayMinutes:360,environmentMinutes:12,year:2026,month:1,day:1};
 const scene={bunHillEventSession:{city,offset:1081,closed:false}},c=vm.createContext({city,activeScene:scene,TICKS_PER_MONTH:4,simPaused:false,simSpeedMul:1,console});
 vm.runInContext(fs.readFileSync('game-clock.js','utf8'),c);const before=JSON.stringify(city);
 assert.equal(vm.runInContext('getGameTimeOfDayMinutes()',c),1);
 c.scene=scene;vm.runInContext('startGameClock();updateGameClock(scene,60000)',c);
 assert.equal(JSON.stringify(city),before);scene.bunHillEventSession=null;
 assert.equal(vm.runInContext('getGameTimeOfDayMinutes()',c),360);
});
test('overdue athletes return after the deadline without earning more points',()=>{
 const {simulateBunHillDesignContest}=require('../festival-bun-hill'),contest=simulateBunHillDesignContest('香城:2026');
 const deadline=getBunHillMapContestFrame(contest,180),later=getBunHillMapContestFrame(contest,220);
 assert.ok(deadline.contestants.some(p=>p.heightM>0&&p.dq));
 const returning=getBunHillMapContestFrame(contest,181);
 for(const p of returning.contestants){const at=deadline.contestants[p.sector];assert.ok(p.heightM<=at.heightM);if(p.heightM>0)assert.equal(p.pose,'descending');}
 assert.ok(later.contestants.every(p=>p.pose==='grounded'&&p.heightM===0));
 assert.deepEqual(later.contestants.map(p=>[p.buns,p.score,p.dq]),deadline.contestants.map(p=>[p.buns,p.score,p.dq]));
 assert.deepEqual(later.awards,deadline.awards);
});
