const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSparseGameGrid, sparseGameChunkEntries } = require('../world/world-game-state');
const { WorldChunkSummaryTable } = require('../world/world-chunk-summary');
const { WorldSaveFormat } = require('../world/world-save-format');
const { WorldDiagnostics } = require('../world/world-diagnostics');
const ROOT = path.resolve(__dirname, '..');

function setup(world) {
  const grid = value => world ? createSparseGameGrid(8, 8, value)
    : Array.from({ length: 8 }, () => Array(8).fill(value));
  const image = () => {
    const sprite = { destroy() {} };
    for (const key of ['setOrigin', 'setDepth', 'setAlpha', 'setMask']) sprite[key] = () => sprite;
    return sprite;
  };
  const context = vm.createContext({ console, performance,
    HeungShingWorld: { createSparseGameGrid, sparseGameChunkEntries, WorldChunkSummaryTable, WorldSaveFormat, WorldDiagnostics },
    MAP_WIDTH: 8, MAP_HEIGHT: 8, GROUND: 1, ROAD: 2, DIRT: 3, BEACH: 4, WATER: 5, HILL: 6,
    city: { budget: 10000, taxRate: .09 },
    mapData: grid(1), heightMap: grid(0), zoneMap: grid(0), zoneDensityMap: grid(1), powerMap: grid(0),
    buildingData: { '0:0': { type: 'power_plant_coal', footprintCols: 2, footprintRows: 2 } },
    treeMap: new Map(), debrisMap: new Map(), bridgeMap: new Map(), roadUnderlayMap: new Map(),
    busStopMap: new Map(), serviceMap: new Map(), powerLineSet: new Set(), powerSources: new Set(['0:0']), lowDensityLockSet: new Set(),
    isInsideMap: (r, c) => r >= 0 && c >= 0 && r < 8 && c < 8,
    getDistrictProfileEffect: () => 0, getDepartmentFunding: () => 1, getTransportExpansionState: () => ({}),
    isPolicyActive: () => false, getPowerPlantOutput: record => record.type === 'power_plant_coal' ? 600 : 0,
    canPlaceBuilding: () => true, removeTree() {}, removeDebris() {},
    isoToScreen: () => ({ x: 0, y: 0 }), getElevationVisualOffset: () => 0,
    addToRenderLayer() {}, getTerrainTileDepth: () => 0, getTileKey: () => 'ground',
    clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
    getCardinalNeighbors: (r, c) => [[r - 1, c], [r, c + 1], [r + 1, c], [r, c - 1]],
  });
  const load = file => vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  load('constants.js'); load('map-utils.js'); load('world/world-game-host.js'); load('tools.js'); load('sim-infrastructure.js');
  const state = fs.readFileSync(path.join(ROOT, 'city-state.js'), 'utf8');
  vm.runInContext(state.slice(state.indexOf('function getBuildingPowerDemand('), state.indexOf('function getPowerPlantAgeMonths(')), context);
  vm.runInContext('let _powerGridDirty = true; function markPowerGridDirty() { _powerGridDirty = true; }', context);
  context.scene = { add: { image }, zoneOverlays: new Map(), buildingSprites: new Map(), offsetX: 0, offsetY: 0 };
  if (world) {
    vm.runInContext('globalThis.__worldGameHost = new WorldGameHost(scene); __worldGameHost.enabled = true; __worldGameHost.baseTile = () => ({ terrainType: 1, height: 0 });', context);
    vm.runInContext('scene.buildingSprites = new WorldGameBuildingSprites(__worldGameHost)', context);
  } else {
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) context.scene.buildingSprites.set(`${r}:${c}`, {});
    context.getActiveSweepBounds = () => ({ rowStart: 0, colStart: 0, rowCount: 8, colCount: 8 });
  }
  for (let col = 0; col < 7; col++) context.mapData[2][col] = 2;
  context.updatePowerGrid(context.scene);
  assert.equal(context.city.totalPowerDemand, 0);
  assert.equal(context.powerMap[2][4], true, 'existing road already conducts power');
  return context;
}

for (const world of [false, true]) {
  test(`${world ? 'streamed territory' : 'ordinary city'}: zoning after the power grid settles supplies new lots on the next pulse`, () => {
    const c = setup(world);
    for (let col = 2; col < 6; col++) assert(c.placeZone(c.scene, 3, col, 1, 1));
    c.updatePowerGrid(c.scene);
    assert.equal(c.city.totalPowerDemand, 12);
    for (let col = 2; col < 6; col++) assert.equal(c.powerMap[3][col], true, 'new residential lots must receive road power');
    c.placeZone(c.scene, 3, 2, 1, 1);
    assert.equal(vm.runInContext('_powerGridDirty', c), false, 'painting an unchanged zone does not schedule another scan');
    assert(c.placeZone(c.scene, 3, 2, 2, 2));
    c.updatePowerGrid(c.scene);
    assert.equal(c.city.totalPowerDemand, 17, 'rezoning refreshes the density-dependent demand');
    for (let col = 2; col < 6; col++) c.removeZoneOverlay(c.scene, 3, col);
    c.updatePowerGrid(c.scene);
    assert.equal(c.city.totalPowerDemand, 0, 'dezoning releases the reserved supply');
  });
}
