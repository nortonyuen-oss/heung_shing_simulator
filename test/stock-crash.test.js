const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');

function makeContext() {
  const stocks = [
    { symbol: 'A', sector: '金融', basePrice: 100, price: 100, prevPrice: 100, sharesOutstanding: 100, history: [100], isHSI: true, listed: true },
    { symbol: 'B', sector: '科技', basePrice: 80, price: 80, prevPrice: 80, sharesOutstanding: 100, history: [80], isHSI: true, listed: true },
    { symbol: 'C', sector: '公用', basePrice: 60, price: 60, prevPrice: 60, sharesOutstanding: 100, history: [60], isHSI: false, listed: true },
  ];
  const context = vm.createContext({
    city: {
      tick: 4,
      year: 2026,
      month: 1,
      epidemicSeverity: 0,
      pollution: 0,
      unemploymentRate: 0,
      monthlyIncome: 10000,
      monthlyExpenses: 10000,
      stockMarket: {
        hsi: 20000,
        prevHsi: 20000,
        regime: 'range',
        regimeMonthsLeft: 3,
        stocks,
      },
    },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    hasBuildingType: () => true,
    isPolicyActive: () => false,
    announceStockMarketCrash: (crash) => { context.announcedCrash = { ...crash }; },
    showToast: () => {},
  });
  vm.runInContext(source('constants.js'), context, { filename: 'constants.js' });
  vm.runInContext(source('sim-economy.js'), context, { filename: 'sim-economy.js' });
  return context;
}

test('a stock crash cuts the whole listed market by 30–50 percent', () => {
  const context = makeContext();
  const crash = vm.runInContext("triggerStockMarketCrash(city.stockMarket, 0.5, 0, 0, 0, 'epidemic')", context);

  assert.ok(Math.abs(crash.severity - 0.4) < 1e-9);
  assert.equal(crash.openingHsi, 20000);
  assert.equal(crash.closingHsi, 12000);
  assert.equal(crash.monthsLeft, 3);
  assert.equal(crash.cooldownMonths, 18);
  assert.equal(crash.trigger, 'epidemic');
  assert.equal(context.city.stockMarket.regime, 'bear');
  assert.deepEqual(context.city.stockMarket.stocks.map((stock) => stock.price), [60, 48, 36]);
  assert.equal(context.announcedCrash.closingHsi, 12000);
});

test('epidemic, pollution and economic stress raise crash probability', () => {
  const context = makeContext();
  const baseChance = vm.runInContext('getStockCrashRiskProfile().chance', context);
  vm.runInContext(`
    city.epidemicSeverity = 0.8;
    city.pollution = 140;
    city.unemploymentRate = 0.28;
    city.monthlyIncome = 5000;
    city.monthlyExpenses = 25000;
    city.stockMarket.regime = 'bear';
  `, context);
  const stressed = vm.runInContext('getStockCrashRiskProfile()', context);

  assert.equal(baseChance, 0.003);
  assert.ok(stressed.chance > 0.06);
  assert.ok(stressed.chance <= 0.09);
  assert.equal(stressed.trigger, 'epidemic');
});

test('the crash remains active for several monthly updates before recovery', () => {
  const context = makeContext();
  vm.runInContext("triggerStockMarketCrash(city.stockMarket, 0, 0, 0, 0, 'market')", context);
  assert.equal(context.city.stockMarket.crash.monthsLeft, 3);

  for (const month of [2, 3, 4]) {
    context.city.month = month;
    context.city.tick += 4;
    vm.runInContext('updateStockMarketCrashEvent(city.stockMarket)', context);
  }

  assert.equal(context.city.stockMarket.crash.monthsLeft, 0);
  assert.equal(context.city.stockMarket.crash.active, false);
  assert.equal(context.city.stockMarket.crash.cooldownMonths, 18);
});

test('ticker and forum include the requested crash reporting lines', () => {
  const ticker = source('hud-ticker.js');
  const forum = source('newspaper.js');

  assert.match(ticker, /恆指一天內從開市.*急跌至收市/);
  assert.match(ticker, /只是技術性調整，不要怕/);
  assert.match(ticker, /排隊上股票交易所天台乘涼/);
  assert.match(forum, /function announceStockMarketCrash/);
  assert.match(forum, /股民丁蟹/);
  assert.match(forum, /天台乘涼關注組/);
});

