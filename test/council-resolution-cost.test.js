const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');

// getCouncilResolutionUpfrontCost lives in council-effects.js next to a lot of
// unrelated machinery; slice out just the constant and the function.
function createCostContext(city) {
  const effects = source('council-effects.js');
  const start = effects.indexOf('const COUNCIL_RESOLUTION_INCOME_FLOOR');
  const end = effects.indexOf('\n}\n', effects.indexOf('function getCouncilResolutionUpfrontCost(')) + 3;
  const context = vm.createContext({ city, Math });
  vm.runInContext(source('council-definitions.js'), context, { filename: 'council-definitions.js' });
  vm.runInContext(effects.slice(start, end), context, { filename: 'council-effects-cost.js' });
  return context;
}

test('a one-off bill is priced as a floor plus months of the city\'s monthly income', () => {
  const city = { population: 50000, monthlyIncome: 25000 };
  const context = createCostContext(city);
  const cost = (id) => vm.runInContext(`getCouncilResolutionUpfrontCost('${id}')`, context);

  // cashHandout: 20 000 + 3 months of 25 000
  assert.equal(cost('cashHandout'), 95000);
  // the flat-priced projects ignore income
  assert.equal(cost('oceanParkDevelopmentProject'), 10000);
  assert.equal(cost('roseGardenAirportProject'), 25000);

  // population no longer enters the price
  city.population = 500000;
  assert.equal(cost('cashHandout'), 95000);

  // a village pays the income floor's worth, never zero
  city.monthlyIncome = 300;
  assert.equal(cost('cashHandout'), 20000 + 3 * 2000);
  city.monthlyIncome = 0;
  assert.equal(cost('leagueMatchday'), 5000 + 0.5 * 2000);
});

test('every priced resolution is a few months of income, not fifty', () => {
  const context = createCostContext({ population: 50000, monthlyIncome: 25000 });
  const defs = vm.runInContext('COUNCIL_RESOLUTION_DEFS', context);
  for (const def of defs) {
    assert.ok(!('costPerCitizen' in def), `${def.id} still carries the retired costPerCitizen field`);
    assert.ok(Number.isFinite(def.monthsOfIncome), `${def.id} needs monthsOfIncome`);
    if (def.oneTime) continue;
    assert.ok(def.monthsOfIncome >= 0.5 && def.monthsOfIncome <= 5, `${def.id}: ${def.monthsOfIncome} months`);
    const cost = vm.runInContext(`getCouncilResolutionUpfrontCost('${def.id}')`, context);
    assert.ok(cost / 25000 <= 8, `${def.id} costs ${cost}, more than 8 months of a 25 000 income`);
  }
});
