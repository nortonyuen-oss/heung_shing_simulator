const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function source(fileName) {
  return fs.readFileSync(path.join(ROOT, fileName), 'utf8');
}

test('Ocean Park project has fiscal, population and economic submission gates', () => {
  const context = vm.createContext({});
  vm.runInContext(source('council-definitions.js'), context, { filename: 'council-definitions.js' });
  const project = vm.runInContext("getCouncilResolutionDefinition('oceanParkDevelopmentProject')", context);

  assert.equal(project.oneTime, true);
  assert.equal(project.unlockBuildingType, 'ocean_park');
  assert.equal(project.unlockPopulation, 35000);
  assert.equal(project.minimumMonthlyIncome, 6000);
  assert.equal(project.minimumMonthlySurplus, 1000);
  assert.equal(project.minimumEconomyIndex, 50);
  assert.equal(project.upfrontBase, 10000);
});

test('Ocean Park proposal cannot be submitted until every city requirement passes', () => {
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
          oceanParkDevelopmentProject: { cooldownUntilMonthIndex: -1, timesApproved: 0 },
        },
      },
    },
    hasBuildingType: () => true,
    normalizeCityFinanceState: () => {},
    getCityMonthIndex: () => 0,
    getCouncilResolutionUpfrontCost: () => 10000,
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
    "getCouncilMotionAvailability('resolution', 'oceanParkDevelopmentProject', 'resolution')",
    context,
  );

  assert.equal(availability().reason, 'population');
  vm.runInContext('city.population = 35000', context);
  assert.equal(availability().reason, 'monthlyIncome');
  vm.runInContext('city.monthlyIncome = 6000; city.monthlyExpenses = 5500', context);
  assert.equal(availability().reason, 'monthlySurplus');
  vm.runInContext('city.monthlyExpenses = 4500', context);
  assert.equal(availability().reason, 'economy');
  vm.runInContext('testEconomyIndex = 50', context);
  assert.equal(availability().reason, 'available');
  vm.runInContext('city.council.resolutionStates.oceanParkDevelopmentProject.timesApproved = 1', context);
  assert.equal(availability().reason, 'alreadyApproved');
});

test('new Ocean Parks are hidden 8x8 projects while old saves retain 4x4 occupancy', () => {
  const constants = source('constants.js');
  const html = source('index.html');
  const tools = source('tool-menu.js');
  const save = source('save.js');

  assert.match(constants, /ocean_park:\s*\{[\s\S]*?spriteKey:\s*'ocean_park_8x8'[\s\S]*?footprintCols:\s*8[\s\S]*?footprintRows:\s*8/);
  assert.match(constants, /LEGACY_OCEAN_PARK_MODEL[\s\S]*?spriteKey:\s*'ocean_park_4x4'[\s\S]*?footprintCols:\s*4[\s\S]*?footprintRows:\s*4/);
  assert.match(constants, /ocean_park:\s*\{\s*requiresResolution:\s*'oceanParkDevelopmentProject',\s*hideUntilApproved:\s*true/);
  assert.match(html, /data-tool="ocean-park" hidden>/);
  assert.match(tools, /row\.hidden = Boolean\(rule\?\.hideUntilApproved && !state\.unlocked\)/);
  assert.match(save, /migrateOceanParkBuildingRecord\(record\)[\s\S]*?deriveLoadedSpriteKey\(record\)/);
  assert.match(save, /isLegacy4x4[\s\S]*?record\.spriteKey = targetModel\.spriteKey[\s\S]*?record\.footprintCols = targetModel\.footprintCols/);
  assert.match(save, /grandfatherLegacyOceanParkProjectApproval\(\)/);
});
