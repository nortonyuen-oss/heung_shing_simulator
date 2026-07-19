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

test('UH is low-density only while H remains available at every density', () => {
  const context = makeGrowthContext();
  const weights = vm.runInContext(`(() => {
    const models = ['L', 'M', 'H', 'UH'].map((wealthTier) => ({ wealthTier }));
    const factors = {
      quality: 0.9,
      landValue: 0.9,
      scenic: 0.8,
      pollution: 0.05,
      environment: 0.9,
      health: 0.85,
      economy: 0.85,
    };
    return [1, 2, 3].map((density) => getResidentialWealthWeights(factors, density, models));
  })()`, context);

  assert.ok(weights[0].UH > 0);
  assert.equal(weights[1].UH, 0);
  assert.equal(weights[2].UH, 0);
  weights.forEach((entry) => assert.ok(entry.H > 0));
});

test('premium tiers are blocked when their site minimums are not met', () => {
  const context = makeGrowthContext();
  const weights = vm.runInContext(`getResidentialWealthWeights({
    quality: 0.9,
    landValue: 0.35,
    scenic: 0.9,
    pollution: 0.05,
    environment: 0.9,
    health: 0.9,
    economy: 0.9,
  }, DENSITY_LOW, ['L', 'M', 'H', 'UH'].map((wealthTier) => ({ wealthTier })))`, context);

  assert.equal(weights.H, 0);
  assert.equal(weights.UH, 0);
  assert.ok(weights.L > 0 || weights.M > 0);
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
      assetId: 'zone:residential/house2x2/residential2-03-UH.png',
      sourceFileName: 'residential2-03-UH.png',
      wealthTier: 'UH',
    }],
  };
  context.record = {
    type: 'residential',
    spriteKey: 'house2x2_5',
    assetId: 'zone:residential/house2x2/residential2-03-highScore.png',
    sourceFileName: 'residential2-03-highScore.png',
  };

  assert.equal(vm.runInContext('getSaveModelForRecord(record).sourceFileName', context), 'residential2-03-UH.png');
  assert.equal(context.record.wealthTier, 'UH');
  assert.equal(context.record.assetId, 'zone:residential/house2x2/residential2-03-UH.png');
});
