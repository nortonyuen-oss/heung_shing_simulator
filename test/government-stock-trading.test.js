const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');

function makeContext({ budget = 20000000, hasExchange = true, gttShares = 100000, crashActive = false } = {}) {
  const stocks = [
    {
      symbol: 'GTT', name: '港騰互娛', sector: '科技', basePrice: 100, price: 100, prevPrice: 100,
      fairValue: 100, sharesOutstanding: gttShares, history: [100], isHSI: true, listed: true, idioShock: 0,
    },
    {
      symbol: 'ALI', name: '阿里爸爸雲商', sector: '科技', basePrice: 200, price: 200, prevPrice: 200,
      fairValue: 200, sharesOutstanding: 100000, history: [200], isHSI: true, listed: true, idioShock: 0,
    },
    {
      symbol: 'UNL', name: '未上市股', sector: '工業', basePrice: 50, price: 50, prevPrice: 50,
      fairValue: 50, sharesOutstanding: 100000, history: [50], isHSI: false, listed: false, idioShock: 0,
    },
  ];
  const announceCalls = { intervention: [], profit: [], loss: [], largeBuy: [] };
  const context = vm.createContext({
    city: {
      tick: 4,
      year: 2026,
      month: 1,
      budget,
      stockMarket: {
        hsi: 20000,
        prevHsi: 20000,
        regime: 'range',
        regimeMonthsLeft: 3,
        stocks,
        governmentPortfolio: { positions: {}, realizedPnl: 0 },
        crash: { active: crashActive },
      },
    },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    hasBuildingType: () => hasExchange,
    isPolicyActive: () => false,
    announceStockMarketCrash: () => {},
    announceGovernmentMarketIntervention: (trade) => announceCalls.intervention.push(trade),
    announceGovernmentTradingProfit: (trade) => announceCalls.profit.push(trade),
    announceGovernmentTradingLoss: (trade) => announceCalls.loss.push(trade),
    announceGovernmentLargeBuy: (trade) => announceCalls.largeBuy.push(trade),
    showToast: () => {},
  });
  vm.runInContext(source('constants.js'), context, { filename: 'constants.js' });
  vm.runInContext(source('sim-economy.js'), context, { filename: 'sim-economy.js' });
  context.announceCalls = announceCalls;
  return context;
}

test('trading is locked below the treasury threshold or without a stock exchange', () => {
  const belowThreshold = makeContext({ budget: 5000000 });
  const result1 = vm.runInContext("buyGovernmentStock('GTT', 1000)", belowThreshold);
  assert.equal(result1.success, false);
  assert.equal(result1.reason, 'locked');

  const noExchange = makeContext({ budget: 20000000, hasExchange: false });
  const result2 = vm.runInContext("buyGovernmentStock('GTT', 1000)", noExchange);
  assert.equal(result2.success, false);
  assert.equal(result2.reason, 'locked');

  const unlocked = vm.runInContext('isGovernmentStockTradingUnlocked()', makeContext({ budget: 10000001 }));
  assert.equal(unlocked, true);
  const exactlyAtThreshold = vm.runInContext('isGovernmentStockTradingUnlocked()', makeContext({ budget: 10000000 }));
  assert.equal(exactlyAtThreshold, false);
});

test('buying deducts cash including fee, records shares/avgCost, and lifts the price', () => {
  const context = makeContext();
  const result = vm.runInContext("buyGovernmentStock('GTT', 100000)", context);

  assert.equal(result.success, true);
  assert.equal(result.symbol, 'GTT');
  // 100000 / (100 * 1.0025) = 997.5... -> floor to 997 shares
  assert.equal(result.shares, 997);
  assert.ok(Math.abs(result.cost - 997 * 100) < 1e-9);
  assert.ok(Math.abs(result.fee - result.cost * 0.0025) < 1e-9);
  assert.ok(result.impact > 0, 'a buy order should push the price up');
  assert.ok(result.newPrice > 100);

  const budgetAfter = vm.runInContext('city.budget', context);
  assert.ok(Math.abs(budgetAfter - (20000000 - result.totalSpend)) < 1e-6);

  const shares = vm.runInContext('city.stockMarket.governmentPortfolio.positions.GTT.shares', context);
  const avgCost = vm.runInContext('city.stockMarket.governmentPortfolio.positions.GTT.avgCost', context);
  assert.equal(shares, 997);
  assert.ok(Math.abs(avgCost - 100) < 1e-9);
});

test('selling returns cash net of fee, tracks realized P&L, and depresses the price', () => {
  const context = makeContext();
  vm.runInContext("buyGovernmentStock('GTT', 500000)", context);
  const budgetAfterBuy = vm.runInContext('city.budget', context);
  const priceAfterBuy = vm.runInContext("city.stockMarket.stocks.find((s) => s.symbol === 'GTT').price", context);
  assert.ok(priceAfterBuy > 100); // sanity: buying did move the price up from the base

  // simulate a price rally before selling, so the position is profitable
  vm.runInContext("city.stockMarket.stocks.find((s) => s.symbol === 'GTT').price = 150;", context);
  const sellResult = vm.runInContext("sellGovernmentStock('GTT', 2000)", context);

  assert.equal(sellResult.success, true);
  assert.ok(sellResult.impact < 0, 'a sell order should push the price down');

  const priceAfterSell = vm.runInContext("city.stockMarket.stocks.find((s) => s.symbol === 'GTT').price", context);
  assert.ok(priceAfterSell < 150);

  const budgetAfterSell = vm.runInContext('city.budget', context);
  assert.ok(Math.abs(budgetAfterSell - (budgetAfterBuy + sellResult.netProceeds)) < 1e-6);

  const realizedPnl = vm.runInContext('city.stockMarket.governmentPortfolio.realizedPnl', context);
  assert.ok(realizedPnl > 0, 'selling above avgCost should realize a gain');
});

test('selling more than held is clamped to the actual position, and a fully-closed position is removed', () => {
  const context = makeContext();
  vm.runInContext("buyGovernmentStock('GTT', 50000)", context);
  const held = vm.runInContext('city.stockMarket.governmentPortfolio.positions.GTT.shares', context);

  const result = vm.runInContext(`sellGovernmentStock('GTT', ${held + 10000})`, context);
  assert.equal(result.success, true);
  assert.equal(result.shares, held);

  const position = vm.runInContext('city.stockMarket.governmentPortfolio.positions.GTT', context);
  assert.equal(position, undefined);
});

test('selling a stock with no position fails cleanly', () => {
  const context = makeContext();
  const result = vm.runInContext("sellGovernmentStock('ALI', 100)", context);
  assert.equal(result.success, false);
  assert.equal(result.reason, 'no-position');
});

test('buy orders cannot push government ownership past the cap', () => {
  // sharesOutstanding 1000 -> 15% cap is 150 shares, deliberately small so a
  // single large order is guaranteed to hit the ceiling.
  const context = makeContext({ budget: 500000000, gttShares: 1000 });
  const first = vm.runInContext("buyGovernmentStock('GTT', 10000)", context);
  assert.equal(first.success, true);
  assert.ok(first.shares <= 150);

  vm.runInContext("buyGovernmentStock('GTT', 10000000)", context);
  const shares = vm.runInContext('city.stockMarket.governmentPortfolio.positions.GTT.shares', context);
  assert.ok(shares <= 150, `ownership cap exceeded: ${shares}/1000 shares`);
  assert.equal(shares, 150, 'a large enough order should fill exactly up to the cap');

  const third = vm.runInContext("buyGovernmentStock('GTT', 10000)", context);
  assert.equal(third.success, false);
  assert.equal(third.reason, 'ownership-cap');
});

test('buying more than the treasury can afford is rejected', () => {
  const context = makeContext({ budget: 10500000 });
  const result = vm.runInContext("buyGovernmentStock('GTT', 20000000)", context);
  assert.equal(result.success, false);
  assert.equal(result.reason, 'insufficient-funds');
  const budgetAfter = vm.runInContext('city.budget', context);
  assert.equal(budgetAfter, 10500000);
});

test('an unlisted stock cannot be bought', () => {
  const context = makeContext();
  const result = vm.runInContext("buyGovernmentStock('UNL', 10000)", context);
  assert.equal(result.success, false);
  assert.equal(result.reason, 'not-found');
});

test('portfolio market value and unrealized P&L track live prices', () => {
  const context = makeContext();
  vm.runInContext("buyGovernmentStock('GTT', 100000)", context);
  const shares = vm.runInContext('city.stockMarket.governmentPortfolio.positions.GTT.shares', context);
  vm.runInContext("city.stockMarket.stocks.find((s) => s.symbol === 'GTT').price = 120;", context);

  const value = vm.runInContext('getGovernmentPortfolioMarketValue()', context);
  const unrealized = vm.runInContext('getGovernmentPortfolioUnrealizedPnl()', context);

  assert.ok(Math.abs(value - shares * 120) < 1e-6);
  assert.ok(unrealized > 0);
});

test('a large buy during an active crash announces a market intervention', () => {
  const context = makeContext({ crashActive: true });
  const result = vm.runInContext("buyGovernmentStock('GTT', 2000000)", context);

  assert.equal(result.success, true);
  assert.equal(context.announceCalls.intervention.length, 1);
  assert.equal(context.announceCalls.intervention[0].symbol, 'GTT');
  assert.ok(context.announceCalls.intervention[0].cost >= 1000000);
  assert.equal(context.announceCalls.profit.length, 0);
  assert.equal(context.announceCalls.loss.length, 0);
});

test('a small buy during a crash does not announce an intervention', () => {
  const context = makeContext({ crashActive: true });
  vm.runInContext("buyGovernmentStock('GTT', 50000)", context);
  assert.equal(context.announceCalls.intervention.length, 0);
});

test('a large buy without an active crash announces a large buy, not an intervention', () => {
  const context = makeContext({ crashActive: false, gttShares: 1000000 });
  vm.runInContext("buyGovernmentStock('GTT', 2000000)", context);
  assert.equal(context.announceCalls.intervention.length, 0);
  assert.equal(context.announceCalls.largeBuy.length, 1);
});

test('a large profitable sale announces a profit, not a loss', () => {
  const context = makeContext();
  vm.runInContext("buyGovernmentStock('GTT', 5000000)", context);
  vm.runInContext("city.stockMarket.stocks.find((s) => s.symbol === 'GTT').price *= 3;", context);
  const shares = vm.runInContext('city.stockMarket.governmentPortfolio.positions.GTT.shares', context);
  const result = vm.runInContext(`sellGovernmentStock('GTT', ${shares})`, context);

  assert.equal(result.success, true);
  assert.ok(result.realizedGain >= 1000000, `expected a notable gain, got ${result.realizedGain}`);
  assert.equal(context.announceCalls.profit.length, 1);
  assert.equal(context.announceCalls.profit[0].symbol, 'GTT');
  assert.ok(context.announceCalls.profit[0].gain >= 1000000);
  assert.equal(context.announceCalls.loss.length, 0);
});

test('a large loss on sale announces a loss, not a profit', () => {
  const context = makeContext();
  vm.runInContext("buyGovernmentStock('GTT', 5000000)", context);
  vm.runInContext("city.stockMarket.stocks.find((s) => s.symbol === 'GTT').price *= 0.2;", context);
  const shares = vm.runInContext('city.stockMarket.governmentPortfolio.positions.GTT.shares', context);
  const result = vm.runInContext(`sellGovernmentStock('GTT', ${shares})`, context);

  assert.equal(result.success, true);
  assert.ok(result.realizedGain <= -1000000, `expected a notable loss, got ${result.realizedGain}`);
  assert.equal(context.announceCalls.loss.length, 1);
  assert.equal(context.announceCalls.loss[0].symbol, 'GTT');
  assert.ok(context.announceCalls.loss[0].loss >= 1000000);
  assert.equal(context.announceCalls.profit.length, 0);
});

test('a small gain or loss on sale does not trigger any announcement', () => {
  const context = makeContext();
  vm.runInContext("buyGovernmentStock('GTT', 50000)", context);
  vm.runInContext("city.stockMarket.stocks.find((s) => s.symbol === 'GTT').price *= 1.05;", context);
  const shares = vm.runInContext('city.stockMarket.governmentPortfolio.positions.GTT.shares', context);
  vm.runInContext(`sellGovernmentStock('GTT', ${shares})`, context);

  assert.equal(context.announceCalls.profit.length, 0);
  assert.equal(context.announceCalls.loss.length, 0);
});

test('a large buy outside a crash announces a large buy, not an intervention', () => {
  const context = makeContext({ crashActive: false, gttShares: 1000000 });
  const result = vm.runInContext("buyGovernmentStock('GTT', 6000000)", context);

  assert.equal(result.success, true);
  assert.ok(result.cost >= 1000000, `expected a notable cost, got ${result.cost}`);
  assert.equal(context.announceCalls.largeBuy.length, 1);
  assert.equal(context.announceCalls.largeBuy[0].symbol, 'GTT');
  assert.equal(context.announceCalls.intervention.length, 0);
});

test('a large buy during a crash announces an intervention, not a large buy', () => {
  const context = makeContext({ crashActive: true, gttShares: 1000000 });
  vm.runInContext("buyGovernmentStock('GTT', 6000000)", context);

  assert.equal(context.announceCalls.intervention.length, 1);
  assert.equal(context.announceCalls.largeBuy.length, 0);
});

test('a buy below the notable-amount threshold outside a crash announces nothing', () => {
  const context = makeContext({ crashActive: false, gttShares: 1000000 });
  const result = vm.runInContext("buyGovernmentStock('GTT', 500000)", context);

  assert.equal(result.success, true);
  assert.ok(result.cost < 1000000, `expected a sub-threshold cost, got ${result.cost}`);
  assert.equal(context.announceCalls.largeBuy.length, 0);
  assert.equal(context.announceCalls.intervention.length, 0);
});
