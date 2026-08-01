const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const simulationSource = fs.readFileSync(path.join(ROOT, 'simulation.js'), 'utf8');

function createPowerPenaltyContext() {
  const context = vm.createContext({
    Number,
    city: { powerRatio: 1 },
    POWER_SHORTAGE_DEMAND_PENALTY_SCALE: 1.40,
    POWER_SHORTAGE_DEMAND_PENALTY_MAX: 1.15,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  });
  const start = simulationSource.indexOf('function getPowerShortageDemandPenalty');
  const end = simulationSource.indexOf('function updateDemand', start);
  assert.ok(start >= 0 && end > start, 'power-shortage demand helper must remain extractable');
  vm.runInContext(simulationSource.slice(start, end), context, { filename: 'power-shortage-demand.js' });
  return context;
}

test('power shortage demand penalty scales sharply with the missing supply', () => {
  const context = createPowerPenaltyContext();
  vm.runInContext(`
    full = getPowerShortageDemandPenalty(1);
    strained = getPowerShortageDemandPenalty(0.75);
    half = getPowerShortageDemandPenalty(0.5);
    severe = getPowerShortageDemandPenalty(0.2);
    none = getPowerShortageDemandPenalty(0);
  `, context);

  assert.equal(context.full, 0);
  assert.ok(Math.abs(context.strained - 0.35) < 1e-9);
  assert.ok(Math.abs(context.half - 0.70) < 1e-9);
  assert.ok(Math.abs(context.severe - 1.12) < 1e-9);
  assert.equal(context.none, 1.15);
});

test('all three R/C/I demand formulas apply the shared shortage penalty', () => {
  const demandBody = simulationSource.slice(
    simulationSource.indexOf('function updateDemand'),
    simulationSource.indexOf('// ── Zone growth / shrink', simulationSource.indexOf('function updateDemand')),
  );
  const applications = demandBody.match(/- powerShortageDemandPenalty/g) ?? [];
  assert.equal(applications.length, 3);
  assert.doesNotMatch(simulationSource, /const powerPenalty = Math\.max\(0, 1 - \(city\.powerRatio/);
});
