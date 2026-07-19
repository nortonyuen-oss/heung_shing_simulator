const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');

function createGrowthContext() {
  const context = vm.createContext({
    city: {
      demandC: 0.7,
      unemploymentRate: 0.05,
      creditRating: 'A',
      monthlyIncome: 10000,
      monthlyExpenses: 6000,
      pollution: 5,
    },
    buildingData: {},
    houseModelSets: {},
    commercialBuildingModels: [],
    serviceMap: [],
    mapData: [],
    roadUnderlayMap: [],
    bridgeMap: [],
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    isInsideMap: () => true,
    MODEL_VARIATION_USAGE_WEIGHT: 0.7,
    MODEL_VARIATION_RECENT_PENALTY: 0.18,
    MODEL_VARIATION_MIN_WEIGHT: 0.04,
  });
  vm.runInContext(source('constants.js'), context, { filename: 'constants.js' });
  vm.runInContext(source('sim-growth.js'), context, { filename: 'sim-growth.js' });
  return context;
}

const premiumFactors = `({
  quality: 0.95,
  landValue: 0.92,
  scenic: 0.85,
  pollution: 0.04,
  environment: 0.92,
  health: 0.90,
  economy: 0.92,
  stockExchange: 1,
  airport: 1,
  urbanCore: 1,
  skylineStats: { total: 8, highRiseCount: 0, highRiseRatio: 0, modelCounts: {} },
})`;

test('top-quality baseline keeps most buildings L/M and caps UH at five percent', () => {
  const context = createGrowthContext();
  const result = vm.runInContext(`(() => {
    const models = ['L', 'M', 'H', 'UH'];
    return {
      residential: getResidentialWealthWeights(${premiumFactors}, DENSITY_LOW,
        models.map((wealthTier) => ({ wealthTier }))),
      commercial: getCommercialTierWeights(${premiumFactors}, DENSITY_HIGH,
        models.map((commercialTier) => ({ commercialTier }))),
    };
  })()`, context);

  assert.ok(Math.abs(result.residential.L + result.residential.M - 0.67) < 1e-12);
  assert.equal(result.residential.H, 0.28);
  assert.equal(result.residential.UH, 0.05);
  assert.ok(Math.abs(result.commercial.L + result.commercial.M - 0.66) < 1e-12);
  assert.equal(result.commercial.H, 0.29);
  assert.equal(result.commercial.UH, 0.05);
});

test('a saturated six-tile neighbourhood blocks additional towers', () => {
  const context = createGrowthContext();
  const result = vm.runInContext(`(() => {
    const factors = {
      ...${premiumFactors},
      skylineStats: { total: 7, highRiseCount: 3, highRiseRatio: 3 / 7, modelCounts: {} },
    };
    return {
      residential: getResidentialWealthWeights(factors, DENSITY_HIGH,
        ['L', 'M', 'H', 'UH'].map((wealthTier) => ({ wealthTier }))),
      commercial: getCommercialTierWeights(factors, DENSITY_HIGH,
        ['L', 'M', 'H', 'UH'].map((commercialTier) => ({ commercialTier }))),
    };
  })()`, context);

  assert.equal(result.residential.H, 0);
  assert.equal(result.residential.UH, 0);
  assert.equal(result.commercial.H, 0);
  assert.equal(result.commercial.UH, 0);
});

test('CBD and transport conditions concentrate commercial towers', () => {
  const context = createGrowthContext();
  const result = vm.runInContext(`(() => {
    const models = ['L', 'M', 'H', 'UH'].map((commercialTier) => ({ commercialTier }));
    const quiet = { ...${premiumFactors}, urbanCore: 0.20 };
    const cbd = { ...${premiumFactors}, urbanCore: 1.00 };
    return {
      quiet: getCommercialTierWeights(quiet, DENSITY_HIGH, models),
      cbd: getCommercialTierWeights(cbd, DENSITY_HIGH, models),
    };
  })()`, context);

  assert.ok(result.quiet.H < result.cbd.H * 0.2);
  assert.ok(result.quiet.UH < result.cbd.UH * 0.05);
});

test('nearby duplicate models receive an exponential six-tile penalty', () => {
  const context = createGrowthContext();
  const result = vm.runInContext(`({
    none: getSpatialModelWeight({ key: 'tower' }, { skylineStats: { modelCounts: {} } }),
    one: getSpatialModelWeight({ key: 'tower' }, { skylineStats: { modelCounts: { tower: 1 } } }),
    two: getSpatialModelWeight({ key: 'tower' }, { skylineStats: { modelCounts: { tower: 2 } } }),
  })`, context);

  assert.equal(result.none, 1);
  assert.equal(result.one, 0.18);
  assert.ok(Math.abs(result.two - 0.0324) < 1e-12);
});

test('premium upgrades and skyline recovery run on slower monthly rates', () => {
  const context = createGrowthContext();
  const rates = vm.runInContext(`({
    upgrade: PREMIUM_VISUAL_UPGRADE_CHANCE_PER_MONTH,
    rebalance: PREMIUM_VISUAL_REBALANCE_CHANCE_PER_MONTH,
    radius: SKYLINE_NEIGHBORHOOD_RADIUS,
  })`, context);
  const growth = source('sim-growth.js');

  assert.deepEqual({ ...rates }, { upgrade: 0.012, rebalance: 0.045, radius: 6 });
  assert.match(growth, /city\.tick % TICKS_PER_MONTH === 0[\s\S]*?PREMIUM_VISUAL_REBALANCE_CHANCE_PER_MONTH/);
  assert.match(growth, /city\.tick % TICKS_PER_MONTH === 0[\s\S]*?PREMIUM_VISUAL_UPGRADE_CHANCE_PER_MONTH/);
});
