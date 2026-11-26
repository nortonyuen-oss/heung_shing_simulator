'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { calculateIndustrialDemand, normalizeIndustrialZones } = require('../industrial-zones');
const { createSparseGameGrid } = require('../world/world-game-state');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const market = {
  population: 10000, labourForce: 5000, lowEduWorkers: 1600, commercialJobs: 1800,
  regularJobs: 300, scienceJobs: 0, basicEducation: 0.65, higherEducation: 0.55,
};

test('science demand can start the first park and rises with education and research', () => {
  assert(calculateIndustrialDemand({ population: 0 }).science < 0, 'no talent yet');
  const first = calculateIndustrialDemand(market).science;
  assert(first > 0, 'no existing science park or 80% unlock required');
  assert(calculateIndustrialDemand({ ...market, commercialJobs: 10000 }).science > 0, 'commercial employment cannot suppress the entire research sector');
  let previous = -Infinity;
  for (let education = 0; education <= 1; education += 0.05) {
    const value = calculateIndustrialDemand({ ...market, higherEducation: education, scienceJobs: 1000 }).science;
    assert(value >= previous);
    previous = value;
  }
  assert(calculateIndustrialDemand({ ...market, basicEducation: 0.9 }).science > first);
  assert(calculateIndustrialDemand({ ...market, researchSupport: 0.7 }).science > first);
  assert(calculateIndustrialDemand({ ...market, researchSupport: 1 }).science
    > calculateIndustrialDemand({ ...market, researchSupport: 0.7 }).science);
});

test('city consumption and commercial supply chains sustain industry in an educated city', () => {
  const educated = { ...market, higherEducation: 0.95, lowEduWorkers: 50 };
  const demand = calculateIndustrialDemand(educated).regular;
  assert(demand > 0.3);
  assert(calculateIndustrialDemand({ ...educated, commercialJobs: 6000 }).regular > demand);
  assert(calculateIndustrialDemand({ ...educated, population: 50000 }).regular > demand);
});

test('oversupply cools both markets; pollution, power and policy still matter', () => {
  const balanced = calculateIndustrialDemand(market);
  const oversupply = calculateIndustrialDemand({ ...market, regularJobs: 100000, scienceJobs: 100000 });
  assert(oversupply.regular < 0 && oversupply.science < 0);
  const polluted = calculateIndustrialDemand({ ...market, pollution: 200 });
  assert(balanced.regular - polluted.regular > balanced.science - polluted.science);
  const shortage = calculateIndustrialDemand({ ...market, sharedAdjustment: -0.7 });
  assert(Math.abs(balanced.regular - shortage.regular - 0.7) < 1e-9);
  assert(Math.abs(balanced.science - shortage.science - 0.7) < 1e-9);
  assert(calculateIndustrialDemand({ ...market, regularPolicyBonus: 0.12 }).regular > balanced.regular);
});

test('old saves have ordinary industrial land; invalid science-zone coordinates are dropped', () => {
  assert.deepEqual(normalizeIndustrialZones(undefined), {});
  assert.deepEqual(normalizeIndustrialZones([]), {});
  assert.deepEqual(normalizeIndustrialZones({ '1:2': 1, '0:0': 1, '3:1': 2, '-1:2': 1, '8:2': 1, '2:8': 1, nope: 1 }, 8, 8), { '1:2': 1, '0:0': 1 });
});

function fixture(streamed = false) {
  const grid = value => streamed ? createSparseGameGrid(8, 8, value) : Array.from({ length: 8 }, () => Array(8).fill(value));
  const math = Object.create(Math); math.random = () => 0.99;
  const model = (size, science) => ({
    key: `${science ? 'science' : 'factory'}_${size}`, sourceFileName: `${science ? 'sciencePark' : 'industrialBuilding'}${size}.png`,
    footprintCols: size, footprintRows: size,
    metadata: { scale: 1, footprintCols: size, footprintRows: size },
  });
  const image = () => {
    const sprite = { destroy() {} };
    for (const method of ['setOrigin', 'setDepth', 'setAlpha', 'setMask']) sprite[method] = () => sprite;
    return sprite;
  };
  const context = vm.createContext({
    GROUND: 1, ROAD: 2, DIRT: 3, BEACH: 4, WATER: 5, HILL: 6,
    Math: math, city: { budget: 10000, tick: 1, scienceParkUnlocked: false, educationHigherIndex: 0.5, demandI: 0.9, demandRegularI: -0.6, demandScienceI: 0.6 },
    mapData: grid(1), heightMap: grid(0), zoneMap: grid(0), zoneDensityMap: grid(1), powerMap: grid(true),
    industrialBuildingModels: [model(1, false), model(2, false), model(2, true), model(3, true), model(5, true)],
    modelUsageCounts: new Map(), modelRecentHistory: new Map(), buildingData: {}, lowDensityLockSet: new Set(),
    clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
    isInsideMap: (r, c) => r >= 0 && c >= 0 && r < 8 && c < 8,
    getTileId: (r, c) => `${r}:${c}`, getTileHeight: () => 0, canPlaceBuilding: () => true,
    canPlaceBuildingFootprint: () => true, hasAdjacentRoad: () => true,
    removeTree() {}, removeDebris() {}, markPowerGridDirty() {}, invalidateBuildingCountCache() {},
    isoToScreen: () => ({ x: 0, y: 0 }), getElevationVisualOffset: () => 0, addToRenderLayer() {},
    getTerrainTileDepth: () => 0, getTileKey: () => 'ground', isPolicyActive: () => false,
  });
  for (const file of ['constants.js', 'model-catalog.js', 'housing-types.js', 'industrial-zones.js', 'tools.js', 'sim-infrastructure.js', 'sim-growth.js']) {
    vm.runInContext(source(file), context, { filename: file });
  }
  context.scene = { buildingSprites: new Map(), zoneOverlays: new Map(), add: { image }, offsetX: 0, offsetY: 0 };
  context.placeSpriteBuilding = (_scene, r, c, _key, options) => {
    for (let dr = 0; dr < options.footprintRows; dr++) for (let dc = 0; dc < options.footprintCols; dc++) {
      context.scene.buildingSprites.set(`${r + dr}:${c + dc}`, { mapRow: r, mapCol: c });
    }
  };
  context.removeBuilding = (_scene, r, c) => { delete context.buildingData[`${r}:${c}`]; return true; };
  context.zone = (r0, c0, size, type = 'science') => {
    for (let r = r0; r < r0 + size; r++) for (let c = c0; c < c0 + size; c++) {
      assert(context.placeZone(context.scene, r, c, 3, 1, 'private', type));
    }
  };
  return context;
}

for (const streamed of [false, true]) {
  test(`${streamed ? 'streamed' : 'ordinary'} land: science zoning costs, no-op, rezone, dezone and separate lot boundaries`, () => {
    const c = fixture(streamed);
    c.zone(1, 1, 2);
    assert.equal(c.city.budget, 9800);
    assert.equal(c.getZoneOverlayCode(3, 1, 1), 'sci');
    assert(c.getZonePlacementQuote(1, 1, 3, 1, 'private', 'science').noop);
    c.placeZone(c.scene, 1, 1, 3, 1, 'private', 'science');
    assert.equal(c.city.budget, 9800);
    assert(c.canPlaceZoneBuildingFootprint(c.scene, 1, 1, 3, 2, 2));
    c.placeZone(c.scene, 2, 2, 3, 1, 'private', 'regular');
    assert.equal(c.city.budget, 9750);
    assert.equal(c.canPlaceZoneBuildingFootprint(c.scene, 1, 1, 3, 2, 2), false);
    c.dezoneAt(c.scene, 1, 1);
    assert.equal(c.city.industrialZones['1:1'], undefined);
    c.placeZone(c.scene, 1, 2, 2);
    assert.equal(c.city.industrialZones['1:2'], undefined, 'commercial rezoning clears specialization');
    const restored = normalizeIndustrialZones(JSON.parse(JSON.stringify(c.city)).industrialZones, 8, 8);
    assert.deepEqual(restored, { '2:1': 1 });
  });

  test(`${streamed ? 'streamed' : 'ordinary'} science lots grow research art below the natural-conversion unlock and keep it on upgrades`, () => {
    const c = fixture(streamed);
    c.zone(1, 1, 2);
    assert.equal(c.spawnZoneBuilding(c.scene, 1, 1, 3, 1), true);
    const record = c.buildingData['1:1'];
    assert(c.isScienceParkIndustrialRecord(record));
    assert.equal(record.footprintCols, 2);
    assert.equal(c.city.scienceParkUnlocked, false, 'manual zoning does not change natural-conversion unlock');
    c.upgradeZoneBuilding(c.scene, 1, 1, 3);
    assert.equal(record.level, 2);
    assert.equal(c.buildingData['1:1'], record);
    c.shrinkOrRemoveZoneBuilding(c.scene, 1, 1);
    assert.equal(record.level, 1);
    assert(c.isScienceParkIndustrialRecord(record));
    assert.equal(c.getIndustrialGrowthDemand(1, 1, record), 0.6);
    assert.equal(c.getIndustrialGrowthDemand(0, 0), -0.6);
    assert.equal(c.collectZoneDeclineCandidates().candidates.length, 0, 'healthy science market is independent of weak traditional industry');
  });
}

test('narrow science land or missing science textures never becomes a factory; large parks can grow directly', () => {
  const c = fixture();
  c.zone(1, 1, 1);
  assert.equal(c.spawnZoneBuilding(c.scene, 1, 1, 3, 1), false);
  c.zone(1, 1, 2);
  c.isZoneModelTextureLoaded = key => key.startsWith('factory');
  assert.equal(c.spawnZoneBuilding(c.scene, 1, 1, 3, 1), false);
  assert.equal(Object.keys(c.buildingData).length, 0);
  c.isZoneModelTextureLoaded = () => true;
  c.zone(1, 1, 5);
  assert.equal(c.spawnZoneBuilding(c.scene, 1, 1, 3, 1, 3, { forceFootprint: 5 }), true);
  assert.equal(c.buildingData['1:1'].footprintCols, 5);
  assert(c.isScienceParkIndustrialRecord(c.buildingData['1:1']));
});

test('the real growth pulse uses research demand on science land while ordinary industry is weak', () => {
  const c = fixture();
  c.Math.random = () => 0;
  c.zone(1, 1, 2);
  c.zone(4, 4, 2, 'regular');
  const growthContext = { landValueMap: Array.from({ length: 8 }, () => Array(8).fill(0.5)), commercialMergeBudget: 0 };
  c.growZoneTile(c.scene, { row: 4, col: 4, id: '4:4' }, growthContext);
  assert.equal(c.buildingData['4:4'], undefined, 'negative traditional demand blocks factories');
  c.growZoneTile(c.scene, { row: 1, col: 1, id: '1:1' }, growthContext);
  assert(c.isScienceParkIndustrialRecord(c.buildingData['1:1']), 'positive research demand grows the first park');
});

test('ordinary industry retains the original 80% education unlock and conversion path', () => {
  const c = fixture();
  c.zone(1, 1, 2, 'regular');
  assert.equal(c.getRandomIndustrialBuildingModel(2, 2).key, 'factory_2');
  c.city.educationHigherIndex = 0.79; c.updateScienceParkUnlockState();
  assert.equal(c.city.scienceParkUnlocked, false);
  c.city.educationHigherIndex = 0.8; c.updateScienceParkUnlockState();
  assert.equal(c.city.scienceParkUnlocked, true);
  c.Math.random = () => 0;
  assert(c.isScienceParkModel(c.getRandomIndustrialBuildingModel(2, 2)));
});
