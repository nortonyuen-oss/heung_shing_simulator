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
  vm.runInContext(source('sim-wealth-districts.js'), context, { filename: 'sim-wealth-districts.js' });
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

test('top-quality commercial baseline keeps most buildings L/M and keeps UH a small minority', () => {
  const context = createGrowthContext();
  const result = vm.runInContext(`getCommercialTierWeights(${premiumFactors}, DENSITY_HIGH,
    ['L', 'M', 'H', 'UH'].map((commercialTier) => ({ commercialTier })))`, context);

  assert.ok(Math.abs(result.L + result.M - 0.77) < 1e-12);
  assert.equal(result.H, 0.17);
  assert.equal(result.UH, 0.06);
});

test('a saturated six-tile neighbourhood blocks additional commercial towers', () => {
  const context = createGrowthContext();
  const result = vm.runInContext(`(() => {
    const factors = {
      ...${premiumFactors},
      skylineStats: { total: 7, highRiseCount: 3, highRiseRatio: 3 / 7, modelCounts: {} },
    };
    return getCommercialTierWeights(factors, DENSITY_HIGH,
      ['L', 'M', 'H', 'UH'].map((commercialTier) => ({ commercialTier })));
  })()`, context);

  assert.equal(result.H, 0);
  assert.equal(result.UH, 0);
});

// Residential deliberately dropped skyline-saturation throttling: a wealth
// district's whole point is that it stays consistently full of its tier, so
// getResidentialWealthDistrictWeights doesn't even take skyline stats as
// input (unlike getCommercialTierWeights above, which still does).
test('residential wealth-tier odds are not throttled by nearby skyline saturation', () => {
  const context = createGrowthContext();
  const result = vm.runInContext(`getResidentialWealthDistrictWeights('ultraRich',
    ['L', 'M', 'H', 'UH'].map((wealthTier) => ({ wealthTier })))`, context);

  assert.equal(result.UH, 0.70);
  assert.equal(result.H, 0.30);
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

test('premium upgrades and skyline recovery are sharded once per tile each month', () => {
  const context = createGrowthContext();
  const rates = vm.runInContext(`({
    upgrade: PREMIUM_VISUAL_UPGRADE_CHANCE_PER_MONTH,
    rebalance: PREMIUM_VISUAL_REBALANCE_CHANCE_PER_MONTH,
    radius: SKYLINE_NEIGHBORHOOD_RADIUS,
  })`, context);
  const growth = source('sim-growth.js');
  const checks = vm.runInContext(`(() => {
    const counts = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        let count = 0;
        for (let tick = 0; tick < TICKS_PER_MONTH; tick++) {
          if (shouldRunMonthlyZoneVisualCheck(row, col, tick)) count++;
        }
        counts.push(count);
      }
    }
    return counts;
  })()`, context);

  assert.deepEqual({ ...rates }, { upgrade: 0.012, rebalance: 0.045, radius: 6 });
  assert.deepEqual(Array.from(checks), Array(16).fill(1));
  assert.match(growth, /runMonthlyVisualCheck[\s\S]*?PREMIUM_VISUAL_REBALANCE_CHANCE_PER_MONTH/);
  assert.match(growth, /runMonthlyVisualCheck[\s\S]*?PREMIUM_VISUAL_UPGRADE_CHANCE_PER_MONTH/);
});
