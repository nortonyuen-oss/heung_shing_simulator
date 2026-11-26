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

function setup(world, width = 8, height = 8) {
  const grid = value => world ? createSparseGameGrid(width, height, value)
    : Array.from({ length: height }, () => Array(width).fill(value));
  const image = () => {
    const sprite = { destroy() {} };
    for (const key of ['setOrigin', 'setDepth', 'setAlpha', 'setMask']) sprite[key] = () => sprite;
    return sprite;
  };
  const context = vm.createContext({ console, performance,
    HeungShingWorld: { createSparseGameGrid, sparseGameChunkEntries, WorldChunkSummaryTable, WorldSaveFormat, WorldDiagnostics },
    MAP_WIDTH: width, MAP_HEIGHT: height, GROUND: 1, ROAD: 2, DIRT: 3, BEACH: 4, WATER: 5, HILL: 6,
    city: { budget: 100000, taxRate: .09, population: 0, residentialCount: 0,
      commercialCount: 0, industrialCount: 0, happiness: .5, pollution: 0 },
    mapData: grid(1), heightMap: grid(0), zoneMap: grid(0), zoneDensityMap: grid(1), powerMap: grid(0),
    buildingData: { '0:0': { type: 'power_plant_coal', footprintCols: 2, footprintRows: 2 } },
    treeMap: new Map(), debrisMap: new Map(), bridgeMap: new Map(), roadUnderlayMap: new Map(),
    busStopMap: new Map(), serviceMap: new Map(), powerLineSet: new Set(), powerSources: new Set(['0:0']), lowDensityLockSet: new Set(),
    isInsideMap: (r, c) => r >= 0 && c >= 0 && r < height && c < width,
    getDistrictProfileEffect: () => 0, getDepartmentFunding: () => 1, getTransportExpansionState: () => ({}),
    isPolicyActive: () => false, getPowerPlantOutput: record => record.type === 'power_plant_coal' ? 600 : 0,
    canPlaceBuilding: () => true, removeTree() {}, removeDebris() {},
    isoToScreen: () => ({ x: 0, y: 0 }), getElevationVisualOffset: () => 0,
    addToRenderLayer() {}, getTerrainTileDepth: () => 0, getTileKey: () => 'ground',
    clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
    getCardinalNeighbors: (r, c) => [[r - 1, c], [r, c + 1], [r + 1, c], [r, c - 1]],
  });
  const load = file => vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  load('constants.js'); load('map-utils.js'); load('housing-types.js'); load('industrial-zones.js'); load('world/world-game-host.js'); load('tools.js'); load('sim-infrastructure.js');
  const state = fs.readFileSync(path.join(ROOT, 'city-state.js'), 'utf8');
  vm.runInContext(state.slice(state.indexOf('function getBuildingPowerDemand('), state.indexOf('function getPowerPlantAgeMonths(')), context);
  vm.runInContext('let _powerGridDirty = true; function markPowerGridDirty() { _powerGridDirty = true; }', context);
  context.scene = { add: { image }, zoneOverlays: new Map(), buildingSprites: new Map(), offsetX: 0, offsetY: 0 };
  if (world) {
    vm.runInContext('globalThis.__worldGameHost = new WorldGameHost(scene); __worldGameHost.enabled = true; __worldGameHost.baseTile = () => ({ terrainType: 1, height: 0 });', context);
    vm.runInContext('scene.buildingSprites = new WorldGameBuildingSprites(__worldGameHost)', context);
  } else {
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) context.scene.buildingSprites.set(`${r}:${c}`, {});
    context.getActiveSweepBounds = () => ({ rowStart: 0, colStart: 0, rowCount: height, colCount: width });
  }
  for (let col = 0; col < width - 1; col++) context.mapData[2][col] = 2;
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
    assert.equal(c.city.totalPowerDemand, 0, 'vacant lots receive power without consuming it');
    for (let col = 2; col < 6; col++) assert.equal(c.powerMap[3][col], true, 'new residential lots must receive road power');
    c.placeZone(c.scene, 3, 2, 1, 1);
    assert.equal(vm.runInContext('_powerGridDirty', c), false, 'painting an unchanged zone does not schedule another scan');
    assert(c.placeZone(c.scene, 3, 2, 2, 2));
    c.updatePowerGrid(c.scene);
    assert.equal(c.city.totalPowerDemand, 0, 'rezoning a vacant lot does not create a load');
    for (let col = 2; col < 6; col++) c.removeZoneOverlay(c.scene, 3, col);
    c.updatePowerGrid(c.scene);
    assert.equal(c.city.totalPowerDemand, 0);
  });

  test(`${world ? 'streamed territory' : 'ordinary city'}: a coal plant can start high-density R/C/I without vacant zones forcing demand negative`, () => {
    const c = setup(world, 32, 16);
    const simulation = fs.readFileSync(path.join(ROOT, 'simulation.js'), 'utf8');
    c.normalizeCityFinanceState = () => {};
    c.updateRuleOfLawIndex = () => {};
    c.hasBuildingType = type => Object.values(c.buildingData).some(record => record.type === type);
    vm.runInContext(simulation.slice(simulation.indexOf('function getPowerShortageDemandPenalty('),
      simulation.indexOf('// ── Zone growth / shrink')), c);
    c.updateDemand();
    const originalDemand = [c.city.demandR, c.city.demandC, c.city.demandI];
    assert(originalDemand.every(value => value > 0), 'an empty new city has demand to begin growing');
    for (const [zone, startCol] of [[1, 3], [2, 11], [3, 19]]) {
      for (let row = 3; row < 9; row++) for (let col = startCol; col < startCol + 6; col++) {
        assert(c.placeZone(c.scene, row, col, zone, 3, zone === 1 ? 'public' : 'private'));
      }
    }
    c.updatePowerGrid(c.scene);
    c.updateDemand();
    assert.equal(c.getHousingZoneType(3, 3), 'public');
    assert.equal(c.city.totalPowerSupply, 600);
    assert.equal(c.city.totalPowerDemand, 0);
    assert.equal(c.city.powerRatio, 1);
    assert.equal(c.city.powerStatus, 'surplus');
    assert.deepEqual([c.city.demandR, c.city.demandC, c.city.demandI], originalDemand);
    for (const col of [3, 11, 19]) assert.equal(c.powerMap[3][col], true, 'all three zones receive road power');
  });

  test(`${world ? 'streamed territory' : 'ordinary city'}: actual buildings consume power once per footprint and genuine overload still applies`, () => {
    const c = setup(world, 32, 16);
    for (let row = 3; row < 7; row++) for (let col = 2; col < 6; col++) c.placeZone(c.scene, row, col, 1, 3, 'public');
    c.buildingData['3:2'] = { type: 'residential', level: 3, footprintCols: 2, footprintRows: 2 };
    if (world) c.__worldGameHost.invalidate(3, 2);
    else for (let row = 3; row < 5; row++) for (let col = 2; col < 4; col++) c.scene.buildingSprites.set(`${row}:${col}`, {});
    c.updatePowerGrid(c.scene);
    assert.equal(c.city.totalPowerDemand, 10, 'one building plus vacant zoned tiles only counts its actual draw');
    assert.equal(c.powerMap[3][2], true);
    for (let row = 10; row < 15; row++) for (let col = 2; col < 10; col++) {
      c.buildingData[`${row}:${col}`] = { type: 'industrial', level: 3 };
    }
    c.markPowerGridDirty();
    c.updatePowerGrid(c.scene);
    assert.equal(c.city.totalPowerSupply, 600);
    assert.equal(c.city.totalPowerDemand, 890);
    assert.equal(c.city.powerRatio, 600 / 890);
    assert.equal(c.city.powerStatus, 'overloaded', 'real demand still requires generating capacity');
    assert.equal(c.buildingData['0:0'].powerLoad, 600);
    assert.equal(c.buildingData['0:0'].powerLoadState, 'overloaded');
  });
}
