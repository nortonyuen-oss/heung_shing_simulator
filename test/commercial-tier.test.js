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
      demandC: 0.6,
      creditRating: 'A',
      monthlyIncome: 12000,
      monthlyExpenses: 8000,
      pollution: 10,
    },
    buildingData: {},
    commercialBuildingModels: [],
    houseModelSets: {},
    serviceMap: [[{ park: 2 }]],
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    isInsideMap: (row, col) => row === 0 && col === 0,
    getScenicValue: () => 0.4,
    getLocalHealthPollutionPressure: () => 0.1,
    getTreeInfluenceValue: () => 0.8,
    ...overrides,
  });
  vm.runInContext(source('constants.js'), context, { filename: 'constants.js' });
  vm.runInContext(source('sim-growth.js'), context, { filename: 'sim-growth.js' });
  return context;
}

test('every renamed commercial model is catalogued with its grade', () => {
  const context = vm.createContext({});
  vm.runInContext(source('model-catalog.js'), context, { filename: 'model-catalog.js' });
  const result = vm.runInContext(`(() => {
    const files = COMMERCIAL_BUILDING_MODEL_SETS.flatMap((config) => config.fallbackSourceFiles);
    return {
      files,
      tiers: files.reduce((counts, fileName) => {
        const tier = getCommercialTierFromFileName(fileName);
        counts[tier] = (counts[tier] || 0) + 1;
        return counts;
      }, {}),
    };
  })()`, context);

  assert.equal(result.files.length, 23);
  assert.deepEqual({ ...result.tiers }, { L: 5, M: 8, H: 8, UH: 2 });
  result.files.forEach((fileName) => {
    const set = Object.values(vm.runInContext('COMMERCIAL_BUILDING_MODEL_SETS', context))
      .find((config) => config.fallbackSourceFiles.includes(fileName));
    assert.ok(fs.existsSync(path.join(ROOT, set.folder, fileName)), fileName);
  });

  const twoByTwo = vm.runInContext(
    `COMMERCIAL_BUILDING_MODEL_SETS.find((config) => config.footprintCols === 2).fallbackSourceFiles`,
    context,
  );
  const threeByThree = vm.runInContext(
    `COMMERCIAL_BUILDING_MODEL_SETS.find((config) => config.footprintCols === 3).fallbackSourceFiles`,
    context,
  );
  assert.ok(!twoByTwo.includes('commercialBuilding2-08-M.png'));
  assert.ok(threeByThree.includes('commercialBuilding3-12-M.png'));
  assert.ok(threeByThree.includes('commercialBuilding3-13-H.png'));
});

test('commercial quality combines land, scenery, environment, economy and catalysts', () => {
  const context = makeGrowthContext();
  const factors = vm.runInContext(`getCommercialSiteFactors(0, 0, 1, {
    landValueMap: [[0.8]],
    pollutionSources: [],
    economy: 0.6,
    stockExchanges: [{ row: 0, col: 0 }],
    airports: [{ row: 0, col: 0 }],
    tileFactors: new Map(),
  })`, context);

  assert.equal(factors.landValue, 0.8);
  assert.equal(factors.scenic, 0.4);
  assert.equal(factors.pollution, 0.1);
  assert.ok(Math.abs(factors.environment - 0.9) < 1e-9);
  assert.equal(factors.stockExchange, 1);
  assert.equal(factors.airport, 1);
  assert.ok(Math.abs(factors.quality - 0.78) < 1e-9);
});

test('stock exchange and airport provide presence plus proximity bonuses', () => {
  const context = makeGrowthContext();
  const factors = vm.runInContext(`({
    absent: getCommercialCatalystFactor(0, 0, [], 20),
    nearby: getCommercialCatalystFactor(0, 0, [{ row: 0, col: 0 }], 20),
    distant: getCommercialCatalystFactor(0, 0, [{ row: 40, col: 40 }], 20),
  })`, context);

  assert.equal(factors.absent, 0);
  assert.equal(factors.nearby, 1);
  assert.equal(factors.distant, 0.6);
});

test('UH requires high density, a stock exchange and an airport', () => {
  const context = makeGrowthContext();
  const weights = vm.runInContext(`(() => {
    const models = ['L', 'M', 'H', 'UH'].map((commercialTier) => ({ commercialTier }));
    const base = {
      quality: 0.9,
      landValue: 0.9,
      scenic: 0.8,
      pollution: 0.05,
      environment: 0.9,
      economy: 0.9,
      stockExchange: 1,
      airport: 1,
    };
    return {
      low: getCommercialTierWeights(base, DENSITY_LOW, models),
      medium: getCommercialTierWeights(base, DENSITY_MED, models),
      high: getCommercialTierWeights(base, DENSITY_HIGH, models),
      noExchange: getCommercialTierWeights({ ...base, stockExchange: 0 }, DENSITY_HIGH, models),
      noAirport: getCommercialTierWeights({ ...base, airport: 0 }, DENSITY_HIGH, models),
    };
  })()`, context);

  assert.equal(weights.low.UH, 0);
  assert.equal(weights.medium.UH, 0);
  assert.ok(weights.high.UH > 0);
  assert.equal(weights.noExchange.UH, 0);
  assert.equal(weights.noAirport.UH, 0);
  [weights.low, weights.medium, weights.high].forEach((entry) => assert.ok(entry.H > 0));
});

test('an UH-only footprint is unavailable before all UH conditions pass', () => {
  const context = makeGrowthContext();
  const result = vm.runInContext(`(() => {
    const models = [{ commercialTier: 'UH' }];
    const factors = {
      quality: 0.9,
      landValue: 0.9,
      scenic: 0.8,
      pollution: 0.05,
      environment: 0.9,
      economy: 0.9,
      stockExchange: 1,
      airport: 1,
    };
    return {
      low: getCommercialTierWeights(factors, DENSITY_LOW, models),
      high: getCommercialTierWeights(factors, DENSITY_HIGH, models),
    };
  })()`, context);

  assert.equal(Object.values(result.low).reduce((sum, value) => sum + value, 0), 0);
  assert.ok(result.high.UH > 0);
});

test('legacy commercial filenames migrate to the renamed grade assets', () => {
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
  context.commercialBuildingModels = [{
    key: 'commercial_building_3x3_7',
    assetId: 'zone:commercial/3x3/commercialBuilding3-05-UH.png',
    sourceFileName: 'commercialBuilding3-05-UH.png',
    commercialTier: 'UH',
  }];
  context.record = {
    type: 'commercial',
    spriteKey: 'commercial_building_3x3_7',
    assetId: 'zone:commercial/3x3/commercialBuilding3-05-highScore.png',
    sourceFileName: 'commercialBuilding3-05-highScore.png',
  };

  assert.equal(vm.runInContext('getSaveModelForRecord(record).sourceFileName', context), 'commercialBuilding3-05-UH.png');
  assert.equal(context.record.commercialTier, 'UH');
});

test('deleted or resized commercial assets fall back to same-footprint models', () => {
  const context = vm.createContext({
    AbortController,
    Array,
    console,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    clearTimeout,
    setTimeout,
  });
  vm.runInContext(source('save.js'), context, { filename: 'save.js' });
  context.commercialBuildingModels = [
    {
      key: 'commercial_building_1x1_2',
      assetId: 'zone:commercial/1x1/commercialBuilding1-04-M.png',
      sourceFileName: 'commercialBuilding1-04-M.png',
      commercialTier: 'M',
    },
    {
      key: 'commercial_building_4x4_0',
      assetId: 'zone:commercial/4x4/commercialBuilding4-01-H.png',
      sourceFileName: 'commercialBuilding4-01-H.png',
      commercialTier: 'H',
    },
    {
      key: 'commercial_building_4x4_1',
      assetId: 'zone:commercial/4x4/commercialBuilding4-02-H.png',
      sourceFileName: 'commercialBuilding4-02-H.png',
      commercialTier: 'H',
    },
    {
      key: 'commercial_building_2x2_0',
      assetId: 'zone:commercial/2x2/commercialBuilding2-02-H.png',
      sourceFileName: 'commercialBuilding2-02-H.png',
      commercialTier: 'H',
      footprintCols: 2,
      footprintRows: 2,
    },
    {
      key: 'commercial_building_2x2_1',
      assetId: 'zone:commercial/2x2/commercialBuilding2-03-M.png',
      sourceFileName: 'commercialBuilding2-03-M.png',
      commercialTier: 'M',
      footprintCols: 2,
      footprintRows: 2,
    },
  ];

  for (const [deletedFile, fallbackFile] of [
    ['commercialBuilding1-02-M.png', 'commercialBuilding1-04-M.png'],
    ['commercialBuilding4-03-L.png', 'commercialBuilding4-01-H.png'],
    ['commercialBuilding4-04-L.png', 'commercialBuilding4-02-H.png'],
    ['commercialBuilding2-07-H.png', 'commercialBuilding2-02-H.png'],
    ['commercialBuilding2-08-M.png', 'commercialBuilding2-03-M.png'],
  ]) {
    context.record = {
      type: 'commercial',
      assetId: `zone:commercial/removed/${deletedFile}`,
      sourceFileName: deletedFile,
      footprintCols: deletedFile.startsWith('commercialBuilding2-') ? 2 : undefined,
      footprintRows: deletedFile.startsWith('commercialBuilding2-') ? 2 : undefined,
    };
    assert.equal(vm.runInContext('getSaveModelForRecord(record).sourceFileName', context), fallbackFile);
    if (deletedFile.startsWith('commercialBuilding2-')) {
      assert.equal(context.record.footprintCols, 2);
      assert.equal(context.record.footprintRows, 2);
    }
  }
});
