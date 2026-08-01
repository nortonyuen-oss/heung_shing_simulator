const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const growthSource = fs.readFileSync(path.join(ROOT, 'sim-growth.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const mapUtilsSource = fs.readFileSync(path.join(ROOT, 'map-utils.js'), 'utf8');

function createDeclineContext(buildingCount = 1000) {
  const buildingData = {};
  const zoneMap = [[]];
  for (let index = 0; index < buildingCount; index++) {
    buildingData[`0:${index}`] = {
      type: 'residential',
      level: index < buildingCount / 2 ? 1 : 2,
    };
    zoneMap[0][index] = 1;
  }
  const mutations = [];
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0;
  const context = vm.createContext({
    Math: deterministicMath,
    Number,
    Object,
    TICKS_PER_MONTH: 4,
    ZONE_DECLINE_MUTATION_FRACTION_PER_MONTH: 0.005,
    ZONE_DECLINE_REMOVAL_FRACTION_PER_MONTH: 0.0015,
    ZONE_DECLINE_MAX_MUTATIONS_PER_MONTH: 8,
    ZONE_DECLINE_MAX_REMOVALS_PER_MONTH: 2,
    SHRINK_CHANCE: 0.30,
    ZONE_NONE: 0,
    ZONE_RES: 1,
    ZONE_COM: 2,
    city: {
      tick: 4,
      powerRatio: 0.2,
      demandR: 0.8,
      demandC: 0.8,
      demandI: 0.2,
    },
    buildingData,
    zoneMap,
    hasAdjacentRoad: () => true,
    getTileId: (row, col) => `${row}:${col}`,
    shrinkOrRemoveZoneBuilding: (_scene, row, col) => {
      mutations.push({ row, col, level: buildingData[`${row}:${col}`]?.level });
      return true;
    },
  });
  const start = growthSource.indexOf('function getZoneDeclineBudgets');
  const end = growthSource.indexOf('function isBuildingHighScoreVisual', start);
  assert.ok(start >= 0 && end > start, 'zone decline helpers must remain extractable');
  vm.runInContext(
    'let lastZoneDeclineTick = null; let zoneDeclineCandidateCursor = 0; let lastZoneDeclineStats = null;',
    context,
  );
  vm.runInContext(growthSource.slice(start, end), context, { filename: 'zone-decline.js' });
  context.mutations = mutations;
  return context;
}

test('monthly decline budgets cap both mutations and disappearing buildings', () => {
  const context = createDeclineContext(1000);
  vm.runInContext('stats = applyMonthlyZoneDecline({})', context);

  assert.equal(context.stats.mutationBudget, 5);
  assert.equal(context.stats.removalBudget, 2);
  assert.equal(context.stats.mutations, 5);
  assert.equal(context.stats.removals, 2);
  assert.equal(context.stats.downgrades, 3);
  assert.equal(context.mutations.length, 5);

  vm.runInContext('sameTickStats = applyMonthlyZoneDecline({})', context);
  assert.equal(context.mutations.length, 5, 'the same month boundary cannot decline twice');
  assert.equal(context.sameTickStats.tick, 4);

  vm.runInContext('city.tick = 5; nonMonthlyStats = applyMonthlyZoneDecline({})', context);
  assert.equal(context.mutations.length, 5, 'non-monthly ticks do not decline buildings');

  vm.runInContext('city.tick = 8; nextMonthStats = applyMonthlyZoneDecline({})', context);
  assert.equal(context.nextMonthStats.mutations, 5);
  assert.equal(context.nextMonthStats.removals, 2);
  assert.equal(context.mutations.length, 10);
});

test('decline limits stay bounded as a city grows and healthy cities do not decline', () => {
  const context = createDeclineContext(1000);
  vm.runInContext(`
    smallBudget = getZoneDeclineBudgets(50);
    normalBudget = getZoneDeclineBudgets(1000);
    hugeBudget = getZoneDeclineBudgets(10000);
    city.tick = 4;
    city.powerRatio = 1;
    healthyStats = applyMonthlyZoneDecline({});
  `, context);

  assert.deepEqual({ ...context.smallBudget }, { mutations: 1, removals: 1 });
  assert.deepEqual({ ...context.normalBudget }, { mutations: 5, removals: 2 });
  assert.deepEqual({ ...context.hugeBudget }, { mutations: 8, removals: 2 });
  assert.equal(context.healthyStats.candidates, 0);
  assert.equal(context.healthyStats.mutations, 0);
});

test('simulation removals skip immediate full-city refresh while player removals keep it', () => {
  assert.match(mainSource, /function removeBuilding\(scene, row, col, options = \{\}\)/);
  assert.match(mainSource, /options\.refreshInfrastructure !== false[\s\S]*?refreshInfrastructureEffects\(scene\)/);
  assert.match(mapUtilsSource, /options\.refreshInfrastructure !== false[\s\S]*?refreshInfrastructureEffects\(scene\)/);
  assert.doesNotMatch(
    growthSource,
    /removeBuilding\(scene,\s*(?:r|row),\s*(?:c|col)\s*\)/,
  );
  assert.match(growthSource, /applyMonthlyZoneDecline\(scene\)/);
});
