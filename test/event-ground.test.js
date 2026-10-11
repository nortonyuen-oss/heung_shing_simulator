const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {getEventGroundVenueComponents,findEventGroundRectangle,layoutLunarNewYear,getFestivalVenueContext}=require('../festival-venues');

test('activity grounds join only across level shared edges and never fill holes',()=>{
 const tiles=[[5,5],[5,6],[6,5],[6,6],[7,7],[4,5]];
 const grounds=getEventGroundVenueComponents(tiles,(r)=>r===4?1:0);
 assert.equal(grounds.length,3);const square=grounds.find(g=>g.tiles.length===4);
 assert.equal(square.areaM2,1600);assert.equal(findEventGroundRectangle(square,2,2).tiles.length,4);
 assert.equal(findEventGroundRectangle(square,3,2),null);
 const hole=getEventGroundVenueComponents([[0,0],[0,1],[1,0]])[0];
 assert.equal(findEventGroundRectangle(hole,2,2),null);
 assert.deepEqual(getEventGroundVenueComponents([...tiles].reverse(),r=>r===4?1:0),grounds);
 const six=getEventGroundVenueComponents([[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]])[0];
 assert.equal(findEventGroundRectangle(six,3,2).widthM,60);assert.equal(findEventGroundRectangle(six,3,2).depthM,40);
});

test('continuous fair rows respect metres, aisles, zones, holes and deterministic lettings',()=>{
 const ctx={tier:'standard',phase:'open',seed:'城:2026',soldShare:.5,eventGroundTiles:[[8,9],[8,10],[9,9],[9,10]]};
 const placements=layoutLunarNewYear(ctx),stalls=placements.filter(p=>p.stall);
 assert.ok(stalls.length>16);assert.deepEqual(layoutLunarNewYear(ctx),placements);
 assert.deepEqual(new Set(stalls.map(p=>p.marketZone)),new Set(['wet','dry','food']));
 for(const p of placements){assert.equal(p.mode,'tile');assert.ok(ctx.eventGroundTiles.some(([r,c])=>p.groundBuildingId===`${r}:${c}`));}
 for(const p of stalls){
  assert.equal(p.partId==='lnyStallEmpty',!p.sold);
  const x=(p.col-8.5)*20,y=(p.row-7.5)*20;
  assert.ok(x-1>=2&&x+1<=38&&y-1>=2&&y+1<=38);
  if(p.marketZone!=='food')assert.ok(Math.abs(x-20)>=3,'four-metre main aisle');
 }
 for(let i=0;i<stalls.length;i++)for(let j=i+1;j<stalls.length;j++){
  const dr=Math.abs(stalls[i].row-stalls[j].row)*20,dc=Math.abs(stalls[i].col-stalls[j].col)*20;
  assert.ok(dr>=2-1e-7||dc>=2-1e-7,'no overlapping booth footprints');
 }
 assert.ok(stalls.some((a,i)=>stalls.slice(i+1).some(b=>a.marketRow===b.marketRow&&Math.abs(a.col-b.col)*20<2.01)),'connected rows');
 assert.ok(layoutLunarNewYear({...ctx,phase:'setup'}).filter(p=>p.stall).every(p=>p.partId==='lnyStallEmpty'));
 assert.ok(layoutLunarNewYear({...ctx,tier:'basic'}).filter(p=>p.stall).length<stalls.length);
 assert.equal(layoutLunarNewYear({...ctx,tier:'skip'}).length,0);
 assert.equal(layoutLunarNewYear({...ctx,phase:'after'}).length,0);
 const holeTiles=[[0,0],[0,1],[1,0]];
 for(const p of layoutLunarNewYear({...ctx,eventGroundTiles:holeTiles}).filter(p=>p.stall)){
  for(const dr of [-.0499,.0499])for(const dc of [-.0499,.0499])assert.ok(holeTiles.some(([r,c])=>r===Math.round(p.row+dr)&&c===Math.round(p.col+dc)));
 }
});

test('stone borders follow exposed level edges through all four rotations and demolition',()=>{
 const c=vm.createContext({console});vm.runInContext(fs.readFileSync('building-placement.js','utf8'),c);
 c.records={'0:0':{type:'event_ground'},'0:1':{type:'event_ground'}};
 for(let rotation=0;rotation<4;rotation++)assert.equal(vm.runInContext(`getEventGroundEdgeMask(records,0,0,()=>0,${rotation})`,c),15^(1<<((1+rotation)%4)));
 assert.equal(vm.runInContext('getEventGroundEdgeMask(records,0,0,(r,c)=>c,0)',c),15);
 delete c.records['0:1'];assert.equal(vm.runInContext('getEventGroundEdgeMask(records,0,0,()=>0,0)',c),15);
});

test('placed activity-ground records survive save texture recovery and expose reusable venue tiles',()=>{
 const c=vm.createContext({console,buildingData:{},city:{budget:1000},
  isInsideMap:(r,col)=>r>=0&&col>=0,canPlaceBuildingFootprint:()=>true,
  spendBudget:cost=>{c.city.budget-=cost;return true;},getTileId:(r,col)=>`${r}:${col}`,
  getParkSpriteOptions:()=>({originX:.5,originY:1,scale:.2}),placeSpriteBuilding:()=>{},refreshInfrastructureEffects:()=>{},
  window:{},document:{addEventListener(){}},setTimeout,clearTimeout});
 for(const file of ['constants.js','tools.js','save.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c,{filename:file});
 c.refreshInfrastructureEffects=()=>{};
 assert.equal(vm.runInContext("placePark({},10,12,{id:'event_ground',type:'event_ground',spriteKey:'event_ground',footprintCols:1,footprintRows:1})",c),true);
 assert.equal(c.city.budget,850);assert.equal(c.buildingData['10:12'].parkVariant,'event_ground');
 assert.equal(vm.runInContext("deriveFallbackSpriteKey({type:'event_ground'})",c),'event_ground');
 // Actual browser venue extraction must recognise records, not merely a test-only tiles field.
 vm.runInContext(fs.readFileSync('festival-venues.js','utf8'),c);
 const ctx=vm.runInContext('getFestivalVenueContext({})',c);
 assert.equal(ctx.eventGroundTiles.length,1);assert.equal(ctx.eventGrounds[0].areaM2,400);
 assert.equal(ctx.parks.length,0);
 const before=c.city.budget;c.canPlaceBuildingFootprint=()=>false;
 assert.equal(vm.runInContext("placePark({},10,12,{type:'event_ground',spriteKey:'event_ground'})",c),false);assert.equal(c.city.budget,before);
});

test('the activity-ground floor sorts below props even on its far edge',()=>{
 const c=vm.createContext({console,TILE_HEIGHT:50,getWorldDepth:(layer,y)=>(layer==='road'?100000:200000)+y});
 vm.runInContext(fs.readFileSync('building-placement.js','utf8'),c);
 const depth=key=>vm.runInContext(`getBuildingSpriteDepth('${key}',100)`,c);
 assert.equal(depth('event_ground_edges3'),100150);assert.equal(depth('event_ground'),100150);assert.equal(depth('event_ground__night'),100150);
 assert.equal(depth('fish_loading_bay_2x2_m'),100150);assert.equal(depth('park_small_open'),200150);
});
