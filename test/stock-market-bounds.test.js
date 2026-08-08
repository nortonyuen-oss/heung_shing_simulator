const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');

function makeContext(overrides = {}) {
  const stocks = Array.from({ length: 10 }, (_, index) => ({
    symbol: `S${index}`,
    sector: ['金融', '科技', '公用', '地產', '消費'][index % 5],
    basePrice: 50 + index * 10,
    price: 50 + index * 10,
    prevPrice: 50 + index * 10,
    fairValue: 50 + index * 10,
    sharesOutstanding: 100,
    history: [50 + index * 10],
    isHSI: index < 6,
    listed: true,
    idioShock: 0,
  }));
  const context = vm.createContext({
    city: {
      tick: 0,
      year: 2000,
      month: 1,
      epidemicSeverity: 0,
      pollution: 0,
      unemploymentRate: 0.05,
      happiness: 0.7,
      ruleOfLawIndex: 0.6,
      demandC: 0.5,
      monthlyIncome: 15000,
      monthlyExpenses: 10000,
      stockMarket: {
        hsi: 20000,
        prevHsi: 20000,
        regime: 'bull',
        regimeMonthsLeft: 1e9,
        stocks,
      },
      ...overrides,
    },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    hasBuildingType: () => true,
    isPolicyActive: () => false,
    announceStockMarketCrash: () => {},
    showToast: () => {},
  });
  vm.runInContext(source('constants.js'), context, { filename: 'constants.js' });
  vm.runInContext(source('sim-economy.js'), context, { filename: 'sim-economy.js' });
  return context;
}

function runLongBullSimulation(context, years) {
  return vm.runInContext(`(() => {
    const totalTicks = TICKS_PER_MONTH * 12 * ${years};
    let maxHsi = -Infinity;
    let minHsi = Infinity;
    let outOfBoundsTick = -1;
    for (let tick = 1; tick <= totalTicks; tick++) {
      city.tick = tick;
      city.month = (Math.floor((tick - 1) / TICKS_PER_MONTH) % 12) + 1;
      city.year = 2000 + Math.floor((tick - 1) / (TICKS_PER_MONTH * 12));
      updateStockMarketTick();
      const hsi = city.stockMarket.hsi;
      if (!Number.isFinite(hsi) || hsi < HSI_MIN_LEVEL || hsi > HSI_MAX_LEVEL) {
        outOfBoundsTick = tick;
        break;
      }
      if (hsi > maxHsi) maxHsi = hsi;
      if (hsi < minHsi) minHsi = hsi;
    }
    return {
      maxHsi,
      minHsi,
      outOfBoundsTick,
      finalHsi: city.stockMarket.hsi,
      fairValueRatios: city.stockMarket.stocks.map((stock) => stock.fairValue / stock.basePrice),
    };
  })()`, context);
}

// Regression test for a real bug: fair value compounded at a fixed annual
// drift forever, with no ceiling. A city can run for centuries of in-game
// time, and even a modest realistic annual return diverges to absurd
// (trillions-of-points) HSI levels over that many ticks - which is exactly
// what happened to a real save file. The fix bounds each stock's fair value
// to a realistic multiple of its base price, with the HSI clamp itself as a
// backstop. This test sustains a permanent bull regime (the strongest
// upward drift in the game) across centuries of ticks and asserts the HSI
// never leaves the realistic band no matter how long the city runs.
test('a sustained bull regime cannot push the HSI past a realistic ceiling over centuries of play', () => {
  const context = makeContext();
  const hsiMin = vm.runInContext('HSI_MIN_LEVEL', context);
  const hsiMax = vm.runInContext('HSI_MAX_LEVEL', context);
  const result = runLongBullSimulation(context, 250);

  assert.equal(result.outOfBoundsTick, -1, `HSI left the [${hsiMin}, ${hsiMax}] band at tick ${result.outOfBoundsTick}`);
  assert.ok(result.maxHsi <= hsiMax);
});

test('fair value stays within a bounded multiple of base price no matter how long the drift compounds', () => {
  const context = makeContext();
  const minMultiple = vm.runInContext('STOCK_FAIR_VALUE_MIN_MULTIPLE', context);
  const maxMultiple = vm.runInContext('STOCK_FAIR_VALUE_MAX_MULTIPLE', context);
  const result = runLongBullSimulation(context, 200);

  result.fairValueRatios.forEach((ratio) => {
    assert.ok(ratio >= minMultiple - 1e-9 && ratio <= maxMultiple + 1e-9, `fair value ratio ${ratio} out of bounds`);
  });
});

// Regression test for a real design bug: fair value used to grow at a fixed
// positive rate in every regime, including bear, so mean reversion kept
// dragging price back up even mid-crash and the whole market felt like a
// one-way climb regardless of the bull/bear label. Fair value now tracks the
// regime's own drift (damped), so a sustained bear phase should make the
// fundamentals genuinely erode, not just the price dip against a still-rising
// anchor.
test('fair value genuinely declines during a sustained bear regime, not just price', () => {
  const context = makeContext();
  vm.runInContext("city.stockMarket.regime = 'bear'; city.stockMarket.regimeMonthsLeft = 1e9;", context);

  const initialFairValue = vm.runInContext('city.stockMarket.stocks[0].fairValue', context);
  const result = runLongBullSimulation(context, 5); // regime is pinned to bear above, regardless of the helper's name
  const finalFairValue = vm.runInContext('city.stockMarket.stocks[0].fairValue', context);

  assert.ok(finalFairValue < initialFairValue, `expected fair value to fall in a sustained bear market: ${initialFairValue} -> ${finalFairValue}`);
  assert.equal(result.outOfBoundsTick, -1);
});

// Regression test for the reported complaint: the index used to feel like it
// "only ever goes up ~4.5%/year" because bull was an almost one-way trap
// (84% to stay bull, 2% to ever enter bear) and fair value never fell.
// Running many independent decades with real regime transitions should now
// produce a healthy share of down years, not an almost-always-positive climb.
test('a long run with real regime transitions produces a meaningful share of down years', () => {
  const context = makeContext();
  const yearlySamples = vm.runInContext(`(() => {
    const ticksPerYear = TICKS_PER_MONTH * 12;
    const years = 300;
    const totalTicks = ticksPerYear * years;
    const yearlyReturns = [];
    let yearStartHsi = city.stockMarket.hsi;
    for (let tick = 1; tick <= totalTicks; tick++) {
      city.tick = tick;
      city.month = (Math.floor((tick - 1) / TICKS_PER_MONTH) % 12) + 1;
      city.year = 2000 + Math.floor((tick - 1) / ticksPerYear);
      updateStockMarketTick();
      if (tick % ticksPerYear === 0) {
        yearlyReturns.push((city.stockMarket.hsi - yearStartHsi) / yearStartHsi);
        yearStartHsi = city.stockMarket.hsi;
      }
    }
    return yearlyReturns;
  })()`, context);

  const downYears = yearlySamples.filter((r) => r < 0).length;
  const downFraction = downYears / yearlySamples.length;
  assert.ok(downFraction >= 0.15, `expected a real share of down years, got ${(downFraction * 100).toFixed(1)}% (${downYears}/${yearlySamples.length})`);
});
