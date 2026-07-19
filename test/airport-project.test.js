const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function source(fileName) {
  return fs.readFileSync(path.join(ROOT, fileName), 'utf8');
}

test('Rose Garden airport project has the intended submission thresholds', () => {
  const context = vm.createContext({});
  vm.runInContext(source('council-definitions.js'), context, { filename: 'council-definitions.js' });
  const project = vm.runInContext("getCouncilResolutionDefinition('roseGardenAirportProject')", context);

  assert.equal(project.oneTime, true);
  assert.equal(project.unlockBuildingType, 'airport');
  assert.equal(project.unlockPopulation, 80000);
  assert.equal(project.minimumMonthlyIncome, 12000);
  assert.equal(project.minimumMonthlySurplus, 2000);
  assert.equal(project.minimumEconomyIndex, 65);
  assert.equal(project.upfrontBase, 25000);
});

test('airport project cannot be submitted until every city requirement passes', () => {
  const context = vm.createContext({
    city: {
      population: 0,
      budget: 100000,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      council: {
        activeSession: null,
        activePrograms: [],
        resolutionStates: {
          roseGardenAirportProject: { cooldownUntilMonthIndex: -1, timesApproved: 0 },
        },
      },
    },
    hasBuildingType: () => true,
    normalizeCityFinanceState: () => {},
    getCityMonthIndex: () => 0,
    getCouncilResolutionUpfrontCost: () => 25000,
    getCouncilPolicyDefinition: () => null,
    isPolicyActive: () => false,
    COUNCIL_POLICY_METADATA: {},
    COUNCIL_VOTING_OFFICIAL_IDS: [],
    hashCouncilEffectSeed: () => 0.5,
  });
  vm.runInContext(source('council-definitions.js'), context, { filename: 'council-definitions.js' });
  vm.runInContext('let testEconomyIndex = 0; function getCityEconomyIndex() { return testEconomyIndex; }', context);
  vm.runInContext(source('council-voting.js'), context, { filename: 'council-voting.js' });
  const availability = () => vm.runInContext(
    "getCouncilMotionAvailability('resolution', 'roseGardenAirportProject', 'resolution')",
    context,
  );

  assert.equal(availability().reason, 'population');
  vm.runInContext('city.population = 80000', context);
  assert.equal(availability().reason, 'monthlyIncome');
  vm.runInContext('city.monthlyIncome = 12000; city.monthlyExpenses = 11000', context);
  assert.equal(availability().reason, 'monthlySurplus');
  vm.runInContext('city.monthlyExpenses = 9000', context);
  assert.equal(availability().reason, 'economy');
  vm.runInContext('testEconomyIndex = 65', context);
  assert.equal(availability().reason, 'available');
  vm.runInContext('city.council.resolutionStates.roseGardenAirportProject.timesApproved = 1', context);
  assert.equal(availability().reason, 'alreadyApproved');
});

test('airport construction stays hidden and costs 150000 until project approval', () => {
  const constants = source('constants.js');
  const html = source('index.html');
  const tools = source('tool-menu.js');
  const save = source('save.js');

  assert.match(constants, /airport:\s*\{\s*requiresResolution:\s*'roseGardenAirportProject',\s*hideUntilApproved:\s*true/);
  assert.match(constants, /airport:\s+150000/);
  assert.match(html, /data-tool="airport" hidden>[\s\S]*?\$150000/);
  assert.match(tools, /row\.hidden = Boolean\(rule\?\.hideUntilApproved && !state\.unlocked\)/);
  assert.match(save, /grandfatherLegacyAirportProjectApproval\(\)/);
});
