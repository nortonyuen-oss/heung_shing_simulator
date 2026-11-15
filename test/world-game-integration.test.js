const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSparseGameGrid, sparseGameChunkEntries, serializeSparseGameGrid, restoreSparseGameGrid } = require('../world/world-game-state');
const { WorldSaveFormat: f } = require('../world/world-save-format');
const { WorldDeltaStore } = require('../world/world-delta-store');
const { WORLD } = require('../world/world-config');

function gameState() {
  return { version: 1, city: { name: '原遊戲城市', budget: -123.75, taxRate: .09 },
    layers: { mapData: [[2200, 3100, 2]], heightMap: [[2200, 3100, 0]], zoneMap: [[2201, 3100, 1]], zoneDensityMap: [[2201, 3100, 1]] },
    buildingData: { '2201:3100': { type: 'residential', footprintCols: 2, footprintRows: 2, population: 12, spriteKey: 'original-model' } },
    bridgeMap: [], roadUnderlayMap: [], treeMap: [], debrisMap: [], busStopMap: [],
    powerSources: [], powerLineSet: ['2200:3100'], lowDensityLockSet: ['2201:3100'], roadTileCount: 1,
    expansions: { transport: { enabled: true, routes: [{ id: 'bus-1' }] } } };
}
test('new territory keeps the original geographic starting point and saved cameras keep their position',()=>{
  const vm=require('node:vm'),fs=require('node:fs');
  const presets=fs.readFileSync(require.resolve('../terrain-presets'),'utf8');
  const start=presets.indexOf('function getHkTerritoryDefaultStart('),end=presets.indexOf('\n}',start)+2;
  const context=vm.createContext({HK_TERRAIN_TILES:WORLD});
  vm.runInContext(presets.slice(start,end),context);
  vm.runInContext(fs.readFileSync(require.resolve('../world/world-game-host'),'utf8'),context);
  const host=Object.create(vm.runInContext('WorldGameHost.prototype',context));host.delta={header:{}};
  assert.deepEqual(JSON.parse(JSON.stringify(host.initialViewpoint())),{col:1593,row:1200,rotation:0,zoom:.8});
  const saved={col:1716,row:1821,rotation:3,zoom:.4};host.delta.header.viewpoint=saved;
  assert.equal(host.initialViewpoint(),saved,'loading a city must not move its camera or constructions');
});
test('world compatibility grids never allocate terrain cells when reading distant places', () => {
  let writes = 0;
  const grid = createSparseGameGrid(WORLD.width, WORLD.height, (row, col) => row + col, () => writes++);
  assert(Array.isArray(grid)); assert(Array.isArray(grid[2200]));
  assert.equal(grid[2200].length, WORLD.width);
  assert.equal(Object.getOwnPropertyDescriptor(grid[2200], 'length').value, 0, 'row storage owns no full-width backing array');
  for (let row = 0; row < WORLD.height; row++) assert.equal(grid[row][3000], row + 3000);
  assert.equal(grid.sparseCells.size, 0); assert.equal(writes, 0);
  grid[2200][3100] = 0; grid[1][2] = 9; grid[1][2] = 9;
  assert.equal(writes, 2); assert.equal(grid[2200][3100], 0);
  const restored = restoreSparseGameGrid(createSparseGameGrid(WORLD.width, WORLD.height, 1), serializeSparseGameGrid(grid));
  assert.equal(restored[2200][3100], 0); assert.equal(restored[1][2], 9); assert.equal(restored.sparseCells.size, 2);
  assert.throws(() => { restored[2] = []; });
});
test('render chunk queries and road totals do not scan cold terrain cells',()=>{
  const grid=createSparseGameGrid(WORLD.width,WORLD.height,0);
  for(let row=1000;row<1100;row++)for(let col=2000;col<2200;col++)grid.sparseCells.set(`${row}:${col}`,2);
  grid[10][10]=2;grid[11][10]=1;
  grid.sparseCells[Symbol.iterator]=()=>{throw Error('Unnecessary cold-cell scan');};
  assert.deepEqual([...sparseGameChunkEntries(grid,['r:0:0'])],[['10:10',2],['11:10',1]]);
  assert.equal(grid.sparseChunkCells.get('r:0:0').counts.get(2),1);
  grid[11][10]=2;assert.equal(grid.sparseChunkCells.get('r:0:0').counts.get(2),2);
  grid.sparseCells.delete('10:10');assert.equal(grid.sparseChunkCells.get('r:0:0').counts.get(2),1);
  grid.clearSparse();assert.equal(grid.sparseChunkCells.size,0);assert.equal(grid.sparseCells.size,0);
});
test('territory metadata is available without loading the complete legacy RLE source',()=>{
  const vm=require('node:vm'),fs=require('node:fs'),context=vm.createContext({HeungShingWorld:{WORLD}});
  vm.runInContext(fs.readFileSync(require.resolve('../terrain-presets'),'utf8'),context);
  const descriptor=context.getHkFullTerritoryTerrainDescriptor();assert.equal(descriptor.width,WORLD.width);assert.equal(descriptor.height,WORLD.height);
  assert.equal(descriptor.startCol,1593);assert.equal(descriptor.startRow,1200);assert.equal(descriptor.mapData,null);
});
test('legacy real-terrain samples load once on demand and can retry after a failed request',async()=>{
  const vm=require('node:vm'),fs=require('node:fs'),scripts=[];
  const context=vm.createContext({resolveBundledAssetPath:()=>'/assets/legacy-hk.js',document:{createElement:()=>({remove(){}}),head:{appendChild(s){scripts.push(s);}}}});
  vm.runInContext(fs.readFileSync(require.resolve('../terrain-presets'),'utf8'),context);
  const first=context.ensureHkTerrainSource(),duplicate=context.ensureHkTerrainSource();assert.equal(first,duplicate);assert.equal(scripts.length,1);assert.equal(scripts[0].src,'/assets/legacy-hk.js');
  const rejected=assert.rejects(first,/could not be loaded/);scripts[0].onerror();await rejected;
  const retry=context.ensureHkTerrainSource();assert.equal(scripts.length,2);
  vm.runInContext('const HK_TERRAIN_TILES={width:3187,height:2400};',context);scripts[1].onload();await retry;
  await context.ensureHkTerrainSource();assert.equal(scripts.length,2);
});
test('a late terrain preview cannot generate a whole territory or change the live map dimensions',async()=>{
  const vm=require('node:vm'),fs=require('node:fs');let release;
  const gate=new Promise(resolve=>release=resolve),context=vm.createContext({HK_TERRAIN_LANDFORMS:{'hk-any':()=>true},t:key=>key,ensureHkTerrainSource:()=>gate});
  vm.runInContext('let MAP_WIDTH=256,MAP_HEIGHT=256,calls=0;function setMapDimensions(w,h){MAP_WIDTH=w;MAP_HEIGHT=h;}function sampleHkTerrain(){calls++;return {width:MAP_WIDTH,height:MAP_HEIGHT};}',context);
  vm.runInContext(fs.readFileSync(require.resolve('../map-sources'),'utf8'),context);
  const source=context.createGeneratedMapSource('hk-any','delayed','real'),first=source.getTerrain(),second=source.getTerrain();
  vm.runInContext('setMapDimensions(3187,2400)',context);release();const [a,b]=await Promise.all([first,second]);
  assert.equal(a.width,256);assert.equal(a.height,256);assert.equal(a,b);assert.equal(vm.runInContext('calls',context),1);
  assert.deepEqual(Array.from(vm.runInContext('[MAP_WIDTH,MAP_HEIGHT]',context)),[3187,2400]);
  vm.runInContext('sampleHkTerrain=()=>{throw Error("preview failed")}',context);
  await assert.rejects(context.createGeneratedMapSource('hk-any','failed','real').getTerrain(),/preview failed/);
  assert.deepEqual(Array.from(vm.runInContext('[MAP_WIDTH,MAP_HEIGHT]',context)),[3187,2400]);
});
test('minimap city pixels are cached and local painting never scans cold world cells',()=>{
  const vm=require('node:vm'),fs=require('node:fs'),grid=createSparseGameGrid(WORLD.width,WORLD.height,0),zones=createSparseGameGrid(WORLD.width,WORLD.height,0);
  for(let row=1000;row<1100;row++)for(let col=2000;col<2200;col++)grid.sparseCells.set(`${row}:${col}`,2);
  grid[10][10]=2;grid.sparseCells[Symbol.iterator]=()=>{throw Error('Cold world scan');};let writes=0;
  const layer={createImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),putImageData(){writes++;}};
  const canvas={getContext:()=>layer},context=vm.createContext({mapData:grid,zoneMap:zones,buildingData:{},ROAD:2,document:{createElement:()=>canvas},HeungShingWorld:{sparseGameChunkEntries},cityMinimapTileColor:()=>[118,148,98]});
  vm.runInContext(fs.readFileSync(require.resolve('../world/world-game-host'),'utf8'),context);
  const host=Object.create(vm.runInContext('WorldGameHost.prototype',context));
  Object.assign(host,{stateVersion:0,buildingVersion:0,indexBuildings(){},buildingChunks:new Map(),footprints:new Map(),minimap:{mode:'local',layoutKey:'local-0',region:{col:0,row:0,width:256,height:256},drawBase(){},clip(){},contains:(c,r)=>c>=0&&r>=0&&c<256&&r<256,transform:{worldToMinimap:(c,r)=>({x:c,y:r})}}});
  const ctx={canvas:{width:512,height:256},drawImage(){},restore(){}};
  host.paintMinimap(ctx);assert.equal(writes,1);for(let i=0;i<100;i++)host.paintMinimap(ctx);assert.equal(writes,1);
  host.stateVersion++;host.paintMinimap(ctx);assert.equal(writes,2);
  host.minimap.layoutKey='rotated';host.paintMinimap(ctx);assert.equal(writes,3);
});
test('refreshing an unloaded neighbouring road updates its data without forcing a sprite',()=>{
  const vm=require('node:vm'),fs=require('node:fs'),source=fs.readFileSync(require.resolve('../main'),'utf8');
  const start=source.indexOf('function refreshTileSprite('),end=source.indexOf('\nfunction ',start+1),invalidated=[];
  const context=vm.createContext({ROAD:2,mapData:{10:{10:2}},isWorldGameActive:()=>true,__worldGameHost:{invalidate:(r,c)=>invalidated.push([r,c])},getTileKey:()=> 'road_cross',resolveTileTextureKey:key=>key,isoToScreen:()=>({x:0,y:0}),ensureTileSprite:()=>null});
  vm.runInContext(source.slice(start,end),context);context.refreshTileSprite({},10,10);assert.deepEqual(invalidated,[[10,10]]);
});
test('integrated game state survives incremental world checkpoints without changing old world v2 data', () => {
  const delta = new WorldDeltaStore(); delta.header.game = gameState();
  delta.header.city.budget = 0; delta.header.revision++; delta.metaDirty = true;
  const checkpoint = delta.checkpoint(true), saved = f.mergeWorldCheckpoint(null, checkpoint);
  assert.equal(saved.game.city.budget, -123.75); assert.equal(saved.game.buildingData['2201:3100'].population, 12);
  const portable = f.importWorldSave(f.exportWorldSave(saved)); assert.deepEqual(portable.game, gameState());
  assert.equal(portable.game.expansions.transport.routes[0].id, 'bus-1');
  assert.equal(f.validateWorldSnapshot(f.emptyWorldSnapshot()).game, undefined);
});
test('world imports reject corrupt sparse layers and buildings outside territory bounds', () => {
  const saved = f.emptyWorldSnapshot(); saved.game = gameState();
  saved.game.layers.mapData.push([WORLD.height, 2, 1]); assert.throws(() => f.validateWorldSnapshot(saved), /sparse cell/);
  saved.game = gameState(); saved.game.layers.zoneMap.push([2201, 3100, 1]); assert.throws(() => f.validateWorldSnapshot(saved), /sparse cell/);
  saved.game = gameState(); saved.game.buildingData['2201:3100'].footprintCols = 100; assert.throws(() => f.validateWorldSnapshot(saved), /footprint/);
});

test('cold chunk table records only developed chunks and exactly the requested metrics',()=>{
  const {WorldChunkSummaryTable,CHUNK_SUMMARY_FIELDS}=require('../world/world-chunk-summary');
  const table=new WorldChunkSummaryTable();
  table.replace([{chunkId:'s:1:1',developed:false,population:99},{chunkId:'s:2:2',developed:true,population:20,powerSupply:100,taxIncome:10,expenses:2},{chunkId:'s:2:2',developed:true,powerDemand:12,taxIncome:5,expenses:3}],{demandR:.2,demandC:-.1,demandI:.4});
  assert.equal(table.rows.size,1);assert.equal(table.rows.get('s:2:2').taxIncome,15);assert.equal(table.rows.get('s:2:2').powerDemand,12);
  assert.equal(Object.keys(table.rows.get('s:2:2')).length,CHUNK_SUMMARY_FIELDS.length+1);
  assert.equal(table.unloaded(new Set()).length,1);assert.equal(table.unloaded(new Set(['s:2:2'])).length,0);
  assert.deepEqual(new WorldChunkSummaryTable(table.serialize()).serialize(),table.serialize());
  table.replace([]);assert.equal(table.rows.size,0);
});

test('manual and automatic world saves share a writer and retain edits made during a pending flush',async()=>{
  const vm=require('node:vm'),fs=require('node:fs'),{WorldSaveSession}=require('../world/world-save-session');
  const context=vm.createContext({console,showToast:()=>{},t:key=>key});
  vm.runInContext(fs.readFileSync(require.resolve('../world/world-game-host'),'utf8'),context);
  const host=Object.create(vm.runInContext('WorldGameHost.prototype',context));
  host.stateVersion=0;host.delta=new WorldDeltaStore();let persisted=null,writes=0,release,entered;
  const gate=new Promise(resolve=>release=resolve),firstEntered=new Promise(resolve=>entered=resolve);
  host.session=new WorldSaveSession({delta:host.delta,storage:{async worldRequest(url,options){
    const request=JSON.parse(options.body);writes++;if(writes===1){entered();await gate;}
    persisted=f.mergeWorldCheckpoint(persisted,request.checkpoint);return {ok:true,json:async()=>({storageRevision:writes})};
  }}});
  host.capture=()=>{host.delta.header.city.name=String(host.stateVersion);host.delta.header.revision++;host.delta.metaDirty=true;};
  const first=host.save(true);await firstEntered;
  const rest=Array.from({length:20},()=>host.save(true));host.stateVersion++;release();
  assert((await Promise.all([first,...rest])).every(Boolean));
  assert.equal(writes,2,'one initial write and one write for the new edit');assert.equal(persisted.city.name,'1');assert.equal(host.delta.dirty,false);
  host.session.destroy();
});

test('an explicit flatten-to-zero survives restoration before base terrain is decoded',()=>{
  let baseHeight=0;
  const grid=createSparseGameGrid(WORLD.width,WORLD.height,()=>baseHeight);
  restoreSparseGameGrid(grid,[[1760,1584,0]]);baseHeight=4;
  assert.equal(grid[1760][1584],0,'decoded hill must not resurrect after loading a flat saved tile');
  assert.equal(grid[1760][1585],4,'unedited neighbour still reads the immutable base');
});

test('road terrain stays known after the decoded base cache is evicted',()=>{
  const vm=require('node:vm'),fs=require('node:fs');
  let base={terrainType:6,height:3};
  const map=createSparseGameGrid(WORLD.width,WORLD.height,0),heights=createSparseGameGrid(WORLD.width,WORLD.height,()=>0);
  const context=vm.createContext({mapData:map,heightMap:heights,HeungShingWorld:{WorldSaveFormat:f}});
  vm.runInContext(fs.readFileSync(require.resolve('../world/world-game-host'),'utf8'),context);
  const host=Object.create(vm.runInContext('WorldGameHost.prototype',context));Object.assign(host,{enabled:true,modifiedStorageChunks:new Set(),baseTile:()=>base});
  map[10][10]=2;host.rememberSurface(10,10);assert.equal(heights[10][10],3);
  base={terrainType:0,height:0};assert.equal(host.hasTerrainTile(10,10),true);assert.equal(host.hasTerrainTile(20,20),false);
  host.rememberSurface(20,20);assert.equal(heights.sparseCells.has('20:20'),false,'missing terrain must not invent a flat cell');
});
