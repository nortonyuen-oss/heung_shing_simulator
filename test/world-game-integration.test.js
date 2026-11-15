const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSparseGameGrid, serializeSparseGameGrid, restoreSparseGameGrid } = require('../world/world-game-state');
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
