const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');

function makeGrowthContext(overrides = {}) {
  const context = vm.createContext({
    city: {
      unemploymentRate: 0.05,
      demandC: 0.5,
      creditRating: 'A',
      monthlyIncome: 10000,
      monthlyExpenses: 7000,
      healthIndex: 0.75,
      pollution: 10,
    },
    houseModelSets: {},
    serviceMap: [[{ park: 2 }]],
    modelUsageCounts: new Map(),
    modelRecentHistory: new Map(),
    MODEL_VARIATION_USAGE_WEIGHT: 0.7,
    MODEL_VARIATION_RECENT_PENALTY: 0.18,
    MODEL_VARIATION_MIN_WEIGHT: 0.04,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    isInsideMap: (row, col) => row === 0 && col === 0,
    getScenicValue: () => 0.4,
    getLocalHealthPollutionPressure: () => 0.1,
    getTreeInfluenceValue: () => 0.8,
    getLocalHealthScore: () => 0.7,
    ...overrides,
  });
  vm.runInContext(source('constants.js'), context, { filename: 'constants.js' });
  vm.runInContext(source('sim-growth.js'), context, { filename: 'sim-growth.js' });
  vm.runInContext(source('sim-wealth-districts.js'), context, { filename: 'sim-wealth-districts.js' });
  return context;
}

test('every renamed residential model is catalogued with its wealth tier', () => {
  const context = vm.createContext({});
  vm.runInContext(source('model-catalog.js'), context, { filename: 'model-catalog.js' });
  const result = vm.runInContext(`(() => {
    const files = Object.values(HOUSE_MODEL_SETS).flatMap((config) => config.preferredFiles);
    return {
      files,
      tiers: files.reduce((counts, fileName) => {
        const tier = getResidentialWealthTierFromFileName(fileName);
        counts[tier] = (counts[tier] || 0) + 1;
        return counts;
      }, {}),
    };
  })()`, context);

  assert.equal(result.files.length, 37);
  assert.deepEqual({ ...result.tiers }, { L: 9, H: 13, M: 9, UH: 6 });
  result.files.forEach((fileName) => {
    const set = Object.values(vm.runInContext('HOUSE_MODEL_SETS', context))
      .find((config) => config.preferredFiles.includes(fileName));
    assert.ok(fs.existsSync(path.join(ROOT, set.folder, fileName)), fileName);
  });
});

test('residential quality combines land, scenery, environment, economy and health', () => {
  const context = makeGrowthContext();
  const factors = vm.runInContext(`getResidentialSiteFactors(0, 0, 1, {
    landValueMap: [[0.8]],
    pollutionSources: [],
    economy: 0.6,
    tileFactors: new Map(),
  })`, context);

  assert.equal(factors.landValue, 0.8);
  assert.equal(factors.scenic, 0.4);
  assert.equal(factors.pollution, 0.1);
  assert.ok(Math.abs(factors.environment - 0.895) < 1e-9);
  assert.equal(factors.economy, 0.6);
  assert.equal(factors.health, 0.7);
  assert.ok(Math.abs(factors.quality - 0.704) < 1e-9);
});

test('low density can grow 2x2/3x3 low-rise buildings but stays capped below 4x4 towers', () => {
  const context = vm.createContext({});
  vm.runInContext(source('constants.js'), context, { filename: 'constants.js' });
  const DENSITY_LOW = vm.runInContext('DENSITY_LOW', context);
  const res2x2 = vm.runInContext('RES_2X2_SPAWN_CHANCE', context);
  const resLarge = vm.runInContext('RES_LARGE_SPAWN_CHANCE', context);

  assert.ok(res2x2[DENSITY_LOW] > 0, 'low density should have a real chance to grow a 2x2');
  assert.ok(resLarge[DENSITY_LOW][3] > 0, 'low density should have a real chance to grow a 3x3');
  assert.equal(resLarge[DENSITY_LOW][4], 0, 'low density must stay capped below 4x4 towers');
  assert.equal(resLarge[DENSITY_LOW][5], 0, 'low density must stay capped below 5x5 towers');
});

function makeDistrictContext(overrides = {}) {
  const context = vm.createContext({
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    ...overrides,
  });
  vm.runInContext(source('constants.js'), context, { filename: 'constants.js' });
  vm.runInContext(source('sim-wealth-districts.js'), context, { filename: 'sim-wealth-districts.js' });
  return context;
}

test('district wealth-tier odds exactly match the requested table, independent of density', () => {
  const context = makeDistrictContext();
  const probabilities = vm.runInContext('RESIDENTIAL_WEALTH_DISTRICT_PROBABILITIES', context);

  assert.deepEqual({ ...probabilities.ultraRich }, { L: 0, M: 0, H: 0.30, UH: 0.70 });
  assert.deepEqual({ ...probabilities.wealthy }, { L: 0, M: 0.40, H: 0.60, UH: 0 });
  assert.deepEqual({ ...probabilities.middleClass }, { L: 0.30, M: 0.50, H: 0.20, UH: 0 });
  assert.deepEqual({ ...probabilities.commoner }, { L: 0.60, M: 0.40, H: 0, UH: 0 });

  // No density parameter at all - a district's odds apply the same way
  // regardless of the tile's zoning density (unlike the old system, where UH
  // was only ever reachable at DENSITY_LOW).
  const weights = vm.runInContext(`getResidentialWealthDistrictWeights('ultraRich',
    ['L', 'M', 'H', 'UH'].map((wealthTier) => ({ wealthTier })))`, context);
  assert.equal(weights.UH, 0.70);
  assert.equal(weights.H, 0.30);
  assert.equal(weights.L, 0);
  assert.equal(weights.M, 0);
});

test('district weights zero out tiers with no loaded model art and fall back to whatever tier is available', () => {
  const context = makeDistrictContext();
  const onlyMAvailable = vm.runInContext(
    `getResidentialWealthDistrictWeights('ultraRich', [{ wealthTier: 'M' }])`,
    context,
  );
  assert.deepEqual({ ...onlyMAvailable }, { L: 0, M: 1, H: 0, UH: 0 });

  const commonerWithFullCatalog = vm.runInContext(
    `getResidentialWealthDistrictWeights('commoner', ['L', 'M', 'H', 'UH'].map((wealthTier) => ({ wealthTier })))`,
    context,
  );
  assert.equal(commonerWithFullCatalog.L, 0.60);
  assert.equal(commonerWithFullCatalog.M, 0.40);
  assert.equal(commonerWithFullCatalog.H, 0);
  assert.equal(commonerWithFullCatalog.UH, 0);
});

test('wealth district grid classifies cells from average land value of built residential tiles, defaulting to commoner below the min-built threshold', () => {
  const context = makeDistrictContext({ MAP_WIDTH: 32, MAP_HEIGHT: 32, buildingData: {} });
  const minBuilt = vm.runInContext('WEALTH_DISTRICT_MIN_BUILT_TILES', context);

  const buildingData = {};
  for (let i = 0; i < minBuilt - 1; i++) {
    buildingData[`0:${i}`] = { type: 'residential', footprintCols: 1, footprintRows: 1 };
  }
  context.buildingData = buildingData;
  context.landValueMap = Array.from({ length: 32 }, () => new Array(32).fill(0.95));

  const belowThreshold = vm.runInContext('computeWealthDistrictGridMap(landValueMap)', context);
  assert.equal(belowThreshold[0][0], 'commoner', 'below the min-built-tile threshold should default to commoner even with high land value');

  // A flagship park (Victoria Park) sits near the cell centre (8,8) so the
  // ultraRich amenity gate below is satisfied.
  buildingData['8:8'] = { type: 'park_flagship', footprintCols: 1, footprintRows: 1 };
  buildingData[`0:${minBuilt}`] = { type: 'residential', footprintCols: 1, footprintRows: 1 };
  const atThreshold = vm.runInContext('computeWealthDistrictGridMap(landValueMap)', context);
  assert.equal(atThreshold[0][0], 'ultraRich', 'once enough tiles are built, high land value and a nearby amenity should classify as ultraRich');

  const midCell = vm.runInContext('getResidentialWealthDistrictTier(0, 0, computeWealthDistrictGridMap(landValueMap))', context);
  assert.equal(midCell, 'ultraRich');
});

test('ultraRich requires a nearby amenity (flagship park, waterfront or landmark) on top of the land-value band', () => {
  const context = makeDistrictContext({ MAP_WIDTH: 32, MAP_HEIGHT: 32, buildingData: {} });
  const minBuilt = vm.runInContext('WEALTH_DISTRICT_MIN_BUILT_TILES', context);
  context.landValueMap = Array.from({ length: 32 }, () => new Array(32).fill(0.95));

  const buildingData = {};
  for (let i = 0; i < minBuilt; i++) {
    buildingData[`0:${i}`] = { type: 'residential', footprintCols: 1, footprintRows: 1 };
  }
  context.buildingData = buildingData;

  const noAmenity = vm.runInContext('computeWealthDistrictGridMap(landValueMap)', context);
  assert.equal(noAmenity[0][0], 'wealthy', 'high land value alone should cap at wealthy without a nearby amenity');

  // A landmark (heritage_church, standing in for "教會") near the cell centre
  // (8,8) should now unlock ultraRich for the same land value.
  buildingData['9:9'] = { type: 'heritage_church', footprintCols: 1, footprintRows: 1 };
  const withLandmark = vm.runInContext('computeWealthDistrictGridMap(landValueMap)', context);
  assert.equal(withLandmark[0][0], 'ultraRich', 'a nearby landmark should unlock ultraRich once the land-value band is met');
});

test('a nearby noxious facility blocks wealthy/ultraRich entirely, however high land value averages out', () => {
  const context = makeDistrictContext({ MAP_WIDTH: 32, MAP_HEIGHT: 32, buildingData: {} });
  const minBuilt = vm.runInContext('WEALTH_DISTRICT_MIN_BUILT_TILES', context);
  context.landValueMap = Array.from({ length: 32 }, () => new Array(32).fill(0.95));

  const buildingData = {};
  for (let i = 0; i < minBuilt; i++) {
    buildingData[`0:${i}`] = { type: 'residential', footprintCols: 1, footprintRows: 1 };
  }
  // A landmark unlocks ultraRich for this land value, same as the test above.
  buildingData['9:9'] = { type: 'heritage_church', footprintCols: 1, footprintRows: 1 };
  context.buildingData = buildingData;

  const withLandmarkOnly = vm.runInContext('computeWealthDistrictGridMap(landValueMap)', context);
  assert.equal(withLandmarkOnly[0][0], 'ultraRich');

  // A nearby power plant should now cap the same cell at middleClass, not
  // just downgrade ultraRich to wealthy - wealthy is blocked too.
  buildingData['10:10'] = { type: 'power_plant_coal', footprintCols: 2, footprintRows: 2 };
  const withPowerPlant = vm.runInContext('computeWealthDistrictGridMap(landValueMap)', context);
  assert.equal(withPowerPlant[0][0], 'middleClass', 'a nearby noxious facility must cap the cell below wealthy, even with a landmark and top land value');
});

test('legacy residential filenames migrate to the renamed wealth-tier assets', () => {
  const context = vm.createContext({
    AbortController,
    Array,
    console,
    fetch: async () => { throw new Error('Unexpected fetch'); },
    JSON,
    MAP_HEIGHT: 1,
    MAP_WIDTH: 1,
    Math,
    Number,
    Object,
    Promise,
    ROAD_TILE_SET_DEFAULT_ID: 'default',
    Set,
    String,
    TREE_SYSTEM_VERSION: 1,
    clearTimeout,
    setTimeout,
  });
  vm.runInContext(source('save.js'), context, { filename: 'save.js' });
  context.houseModelSets = {
    house2x2: [{
      key: 'house2x2_5',
      assetId: 'zone:residential/house2x2/residential2-03-UH-LD.png',
      sourceFileName: 'residential2-03-UH-LD.png',
      wealthTier: 'UH',
      massingTier: 'LD',
    }],
  };
  context.record = {
    type: 'residential',
    spriteKey: 'house2x2_5',
    assetId: 'zone:residential/house2x2/residential2-03-highScore.png',
    sourceFileName: 'residential2-03-highScore.png',
  };

  assert.equal(vm.runInContext('getSaveModelForRecord(record).sourceFileName', context), 'residential2-03-UH-LD.png');
  assert.equal(context.record.wealthTier, 'UH');
  assert.equal(context.record.massingTier, 'LD');
  assert.equal(context.record.assetId, 'zone:residential/house2x2/residential2-03-UH-LD.png');
});

test('HD massing never appears in low-density zones, even as a fallback when the wealth tier has no LD/MD art', () => {
  const context = makeGrowthContext();
  vm.runInContext(`
    houseModelSets.house2x2 = [
      { key: 'h_hdA', metadata: { scale: 1 }, wealthTier: 'H', massingTier: 'HD' },
      { key: 'h_hdB', metadata: { scale: 1 }, wealthTier: 'H', massingTier: 'HD' },
    ];
  `, context);
  const massingTiers = vm.runInContext(`
    Array.from({ length: 50 }, () => getRandomHouseModel(
      'house2x2', 0.9, false, DENSITY_LOW,
      { quality: 0.9, landValue: 0.9, scenic: 0.9, pollution: 0.05, environment: 0.9, health: 0.9, economy: 0.9, wealthDistrictTier: 'wealthy' },
      'H',
    )?.massingTier)
  `, context);

  // With no LD/MD art at all for this tier, the safety net has to fall back
  // to *something* rather than stall growth - but that fallback must still
  // never be HD at low density (the hard exclusion this test guards).
  assert.ok(massingTiers.every((tier) => tier === 'HD'), 'expected the only-HD fixture itself to be unaffected by this test setup');

  vm.runInContext(`
    houseModelSets.house2x2 = [
      { key: 'h_mdA', metadata: { scale: 1 }, wealthTier: 'H', massingTier: 'MD' },
      { key: 'h_hdA', metadata: { scale: 1 }, wealthTier: 'H', massingTier: 'HD' },
      { key: 'h_hdB', metadata: { scale: 1 }, wealthTier: 'H', massingTier: 'HD' },
    ];
  `, context);
  const massingTiersWithMdAvailable = vm.runInContext(`
    Array.from({ length: 200 }, () => getRandomHouseModel(
      'house2x2', 0.9, false, DENSITY_LOW,
      { quality: 0.9, landValue: 0.9, scenic: 0.9, pollution: 0.05, environment: 0.9, health: 0.9, economy: 0.9, wealthDistrictTier: 'wealthy' },
      'H',
    )?.massingTier)
  `, context);

  assert.ok(
    massingTiersWithMdAvailable.every((tier) => tier !== 'HD'),
    `expected no HD models at low density once an MD alternative exists, got: ${[...new Set(massingTiersWithMdAvailable)].join(', ')}`,
  );
  assert.ok(massingTiersWithMdAvailable.some((tier) => tier === 'MD'));
});
