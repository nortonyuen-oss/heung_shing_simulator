const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');

function extractFunction(fileName, functionName) {
  const text = source(fileName);
  const start = text.indexOf(`function ${functionName}(`);
  assert.ok(start >= 0, `${functionName} must exist in ${fileName}`);
  const braceStart = text.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = braceStart; index < text.length; index++) {
    const character = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth++;
    else if (character === '}') {
      depth--;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error(`Unable to extract ${functionName}`);
}

test('industrial policies expose the planned costs, category and prerequisite', () => {
  const context = vm.createContext({});
  vm.runInContext(source('constants.js'), context);
  const policies = vm.runInContext(`CITY_POLICY_DEFS.filter((policy) => (
    policy.id === 'industrialBuildingRevitalization' || policy.id === 'strongCountryManufacturing'
  ))`, context);
  const revitalization = policies.find((policy) => policy.id === 'industrialBuildingRevitalization');
  const strongCountry = policies.find((policy) => policy.id === 'strongCountryManufacturing');

  assert.equal(revitalization.monthlyBase, 180);
  assert.equal(revitalization.category, 'financeEconomy');
  assert.equal(strongCountry.monthlyBase, 320);
  assert.equal(strongCountry.category, 'educationScience');
  assert.deepEqual([...strongCountry.requiresPolicies], ['scienceDevelopment']);
  assert.equal(strongCountry.hideUntilPolicyRequirements, true);

  const state = source('city-state.js');
  const preview = source('council-policy-preview.js');
  assert.match(state, /industrialBuildingRevitalization'\) cost \+= city\.industrialCount \* 3/);
  assert.match(state, /strongCountryManufacturing'\) cost \+= city\.industrialCount \* 8/);
  assert.match(preview, /industrialBuildingRevitalization'\) cost \+= city\.industrialCount \* 3/);
  assert.match(preview, /strongCountryManufacturing'\) cost \+= city\.industrialCount \* 8/);
});

test('policy prerequisites and dynamic enactment year use stable state', () => {
  const context = vm.createContext({
    city: {
      year: 2028,
      activePolicies: { scienceDevelopment: false, strongCountryManufacturing: false },
      council: { policyStates: { strongCountryManufacturing: { enactedYear: -1 } } },
    },
    isPolicyActive: (id) => context.city.activePolicies[id] === true,
    t: (_key, params) => `Strong Nation Manufacturing ${params.year}`,
    CITY_POLICY_DEFS: [{
      id: 'strongCountryManufacturing',
      titleKey: 'policy.strongCountryManufacturing.title',
      requiresPolicies: ['scienceDevelopment'],
    }],
  });
  vm.runInContext([
    extractFunction('city-state.js', 'getCouncilRequiredPolicyIds'),
    extractFunction('city-state.js', 'getMissingCouncilPolicyRequirement'),
    extractFunction('council-policy-preview.js', 'getCouncilPolicyDefinition'),
    extractFunction('council-policy-preview.js', 'getCouncilPolicyDisplayYear'),
    extractFunction('council-policy-preview.js', 'getCouncilPolicyDisplayTitle'),
  ].join('\n'), context);

  assert.equal(vm.runInContext('getMissingCouncilPolicyRequirement(CITY_POLICY_DEFS[0])', context), 'scienceDevelopment');
  context.city.activePolicies.scienceDevelopment = true;
  assert.equal(vm.runInContext('getMissingCouncilPolicyRequirement(CITY_POLICY_DEFS[0])', context), '');
  assert.equal(vm.runInContext("getCouncilPolicyDisplayTitle('strongCountryManufacturing')", context), 'Strong Nation Manufacturing 2028');
  context.city.year = 2035;
  context.city.council.policyStates.strongCountryManufacturing.enactedYear = 2028;
  context.city.activePolicies.strongCountryManufacturing = true;
  assert.equal(vm.runInContext("getCouncilPolicyDisplayTitle('strongCountryManufacturing')", context), 'Strong Nation Manufacturing 2028');
  context.city.activePolicies.strongCountryManufacturing = false;
  assert.equal(vm.runInContext("getCouncilPolicyDisplayTitle('strongCountryManufacturing')", context), 'Strong Nation Manufacturing 2035');
});

test('old council saves receive additive policy news and forum event defaults', () => {
  const context = vm.createContext({
    COUNCIL_SCHEMA_VERSION: 2,
    CITY_POLICY_DEFS: [
      { id: 'industrialBuildingRevitalization' },
      { id: 'strongCountryManufacturing' },
    ],
    COUNCIL_OFFICIAL_IDS: [],
    COUNCIL_INITIAL_RELATIONSHIPS: {},
    COUNCIL_SPECIAL_EVENT_DEFS: [],
    COUNCIL_RESOLUTION_IDS: [],
  });
  vm.runInContext(source('council-state.js'), context);
  const normalized = vm.runInContext('normalizeCouncilState({}, {})', context);
  assert.equal(normalized.policyStates.industrialBuildingRevitalization.enactedYear, -1);
  assert.equal(normalized.policyStates.strongCountryManufacturing.enactedYear, -1);
  assert.deepEqual([...normalized.policyNewsSchedules], []);
  assert.equal(normalized.forumEventState.labExplosionLastMonthIndex, -1);
});

test('strong-country enactment requires science development but repeal does not', () => {
  const definition = {
    id: 'strongCountryManufacturing',
    requiresPolicies: ['scienceDevelopment'],
  };
  const context = vm.createContext({
    city: {
      population: 10000,
      budget: 10000,
      activePolicies: { scienceDevelopment: false, strongCountryManufacturing: false },
      council: {
        activeSession: null,
        policyStates: { strongCountryManufacturing: { cooldownUntilMonthIndex: -1 } },
      },
    },
    normalizeCityFinanceState: () => {},
    getCityMonthIndex: () => 24000,
    hasBuildingType: (type) => type === 'legislative_council',
    getCouncilPolicyDefinition: () => definition,
    getCouncilMotionMissingBuilding: () => '',
    getMissingCouncilPolicyRequirement: () => (
      context.city.activePolicies.scienceDevelopment ? '' : 'scienceDevelopment'
    ),
    isPolicyActive: (id) => context.city.activePolicies[id] === true,
  });
  vm.runInContext(extractFunction('council-voting.js', 'getCouncilMotionAvailability'), context);
  assert.equal(
    vm.runInContext("getCouncilMotionAvailability('policy', 'strongCountryManufacturing', 'enact').reason", context),
    'needsPolicy',
  );
  context.city.activePolicies.scienceDevelopment = true;
  assert.equal(
    vm.runInContext("getCouncilMotionAvailability('policy', 'strongCountryManufacturing', 'enact').available", context),
    true,
  );
  context.city.activePolicies.strongCountryManufacturing = true;
  context.city.activePolicies.scienceDevelopment = false;
  assert.equal(
    vm.runInContext("getCouncilMotionAvailability('policy', 'strongCountryManufacturing', 'repeal').available", context),
    true,
  );
});

test('industrial effects use the specified demand, pollution, tax, traffic and science boosts', () => {
  const simulation = source('simulation.js');
  const infrastructure = source('sim-infrastructure.js');
  const growth = source('sim-growth.js');
  const state = source('city-state.js');

  assert.match(simulation, /industrialBuildingRevitalization'\) \? 0\.12 : 0/);
  assert.match(simulation, /strongCountryManufacturing'\) \? 0\.10 : 0/);
  assert.match(simulation, /industrialBuildingRevitalization'\) \? 0\.70 : 1/);
  assert.match(simulation, /STRONG_COUNTRY_HIGHER_EDU_BONUS/);
  assert.match(state, /industrialBuildingRevitalization'\) \? 1\.10 : 1/);
  assert.match(infrastructure, /industrialBuildingRevitalization'\)[\s\S]*?\? 1\.65 : 1/);
  assert.match(infrastructure, /strongCountryManufacturing'\) \? 0\.08 : 0/);
  assert.match(growth, /strongCountryManufacturing'\) \? 0\.15 : 0/);
});

test('strong-country schedules survive months, charge abuse, cancel research on repeal and allow a new cycle', () => {
  const announcements = [];
  const context = vm.createContext({
    city: {
      year: 2028,
      tick: 40,
      budget: 10000,
      cityRidicule: 0,
      council: { policyNewsSchedules: [] },
    },
    normalizeCityFinanceState: () => {},
    getCityMonthIndex: () => 24000,
    hashCouncilEffectSeed: () => 0.5,
    councilEffectClamp: (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0)),
    announceIndustrialBuildingRevitalizationForum: () => {},
    announceStrongCountryAbuseForum: (schedule) => announcements.push(`abuse:${schedule.id}`),
    announceStrongCountryResearchForum: (schedule) => announcements.push(`research:${schedule.id}`),
  });
  vm.runInContext([
    extractFunction('council-effects.js', 'handleCouncilPolicyLifecycle'),
    extractFunction('council-effects.js', 'announceDuePolicyForumNews'),
  ].join('\n'), context);

  vm.runInContext("handleCouncilPolicyLifecycle('strongCountryManufacturing', 'enact', 24000)", context);
  const first = context.city.council.policyNewsSchedules[0];
  assert.equal(first.enactedYear, 2028);
  assert.equal(first.abuseDueMonthIndex, 24006);
  assert.ok(first.researchDueMonthIndex >= 24007 && first.researchDueMonthIndex <= 24012);

  vm.runInContext('announceDuePolicyForumNews(24006)', context);
  assert.equal(context.city.budget, 8000);
  assert.equal(context.city.cityRidicule, 10);
  assert.deepEqual(announcements, [`abuse:${first.id}`]);

  vm.runInContext("handleCouncilPolicyLifecycle('strongCountryManufacturing', 'repeal', 24007)", context);
  vm.runInContext(`announceDuePolicyForumNews(${first.researchDueMonthIndex})`, context);
  assert.equal(first.researchCancelled, true);
  assert.equal(announcements.some((item) => item.startsWith('research:')), false);

  context.city.year = 2029;
  context.city.tick = 80;
  vm.runInContext("handleCouncilPolicyLifecycle('strongCountryManufacturing', 'enact', 24012)", context);
  assert.equal(context.city.council.policyNewsSchedules.length, 2);
  assert.equal(context.city.council.policyNewsSchedules[1].enactedYear, 2029);
});

test('secondary-school lab explosion is rare, requires a school and has a 12-month cooldown', () => {
  const posts = [];
  let hasSecondarySchool = false;
  const context = vm.createContext({
    city: {
      name: '香城',
      council: { forumEventState: { labExplosionLastMonthIndex: -1 } },
    },
    normalizeCityFinanceState: () => {},
    hasBuildingType: (type) => type === 'secondary_school' && hasSecondarySchool,
    hashCouncilEffectSeed: () => 0.01,
    getIndustrialPolicyForumLocale: () => ({
      language: 'zhHant', category: '城市發展', educationCategory: '城中熱話', author: '香城熱話台',
    }),
    addCityNews: () => {},
    addForumPost: (article, metadata) => {
      const post = { ...article, ...metadata };
      posts.push(post);
      return post;
    },
  });
  vm.runInContext(extractFunction('newspaper.js', 'maybeAnnounceSecondarySchoolLabExplosion'), context);

  assert.equal(vm.runInContext('maybeAnnounceSecondarySchoolLabExplosion(100)', context), null);
  hasSecondarySchool = true;
  const first = vm.runInContext('maybeAnnounceSecondarySchoolLabExplosion(100)', context);
  assert.equal(first.image, 'UI/news/labExplosion.webp');
  assert.match(first.headline, /杏壇中學實驗室爆炸/);
  assert.equal(vm.runInContext('maybeAnnounceSecondarySchoolLabExplosion(111)', context), null);
  assert.ok(vm.runInContext('maybeAnnounceSecondarySchoolLabExplosion(112)', context));
  assert.equal(posts.length, 2);
});

test('industrial policy forum copy uses all four optimized images and keeps stock-crash coverage', () => {
  const newspaper = source('newspaper.js');
  assert.match(newspaper, /revokeIndustrialBuildings\.webp/);
  assert.match(newspaper, /strongCountry20XX\.webp/);
  assert.match(newspaper, /researchAndDevelopment\.webp/);
  assert.match(newspaper, /labExplosion\.webp/);
  assert.match(newspaper, /活化工廈政策 工廈變Party Room War Game場/);
  assert.match(newspaper, /星之子周星星發明太陽能電筒/);
  assert.match(newspaper, /攞你命3000/);
  assert.match(newspaper, /function announceStockMarketCrash/);
  assert.match(newspaper, /stockMarketShock\.webp/);
  assert.match(newspaper, /stockMarketShock2\.webp/);
});

test('forum categories show only their 15 newest posts in game-date order', () => {
  const posts = Array.from({ length: 18 }, (_, index) => ({
    id: `development-${index}`,
    category: '城市發展',
    year: 2000 + index,
    month: 1,
    resolutionMonthIndex: -1,
  }));
  posts.push(
    { id: 'buzz-newer', category: '城中熱話', year: 2025, month: 6, resolutionMonthIndex: -1 },
    { id: 'buzz-older-inserted-last', category: '城中熱話', year: 1999, month: 12, resolutionMonthIndex: -1 },
  );
  const context = vm.createContext({ city: { forumPosts: posts } });
  vm.runInContext(extractFunction('newspaper.js', 'getForumPostsByRecency'), context);

  const development = vm.runInContext("getForumPostsByRecency('城市發展', 15)", context);
  assert.equal(development.length, 15);
  assert.equal(development[0].id, 'development-17');
  assert.equal(development.at(-1).id, 'development-3');

  const buzz = vm.runInContext("getForumPostsByRecency('城中熱話', 15)", context);
  assert.deepEqual([...buzz].map((post) => post.id), ['buzz-newer', 'buzz-older-inserted-last']);
});

test('all three industrial-policy stories open the forum-style newspaper extra', () => {
  const newspaper = source('newspaper.js');
  [
    'announceIndustrialBuildingRevitalizationForum',
    'announceStrongCountryAbuseForum',
    'announceStrongCountryResearchForum',
  ].forEach((functionName) => {
    const implementation = extractFunction('newspaper.js', functionName);
    assert.match(implementation, /showResolutionNewspaper\(article, post\?\.id \|\| ''\)/);
  });
});

test('new forum source images, release WebPs and thumbnails have the required dimensions', async () => {
  const names = ['labExplosion', 'researchAndDevelopment', 'revokeIndustrialBuildings', 'strongCountry20XX'];
  for (const name of names) {
    const pngPath = path.join(ROOT, 'UI', 'news', `${name}.png`);
    const webpPath = path.join(ROOT, 'UI', 'news', `${name}.webp`);
    const thumbPath = path.join(ROOT, 'UI', 'news', 'thumbs', `${name}.webp`);
    assert.ok(fs.existsSync(pngPath), `${name} PNG source`);
    assert.ok(fs.existsSync(webpPath), `${name} WebP`);
    assert.ok(fs.existsSync(thumbPath), `${name} thumbnail`);
    const full = await sharp(webpPath).metadata();
    const thumb = await sharp(thumbPath).metadata();
    assert.deepEqual([full.width, full.height], [960, 640]);
    assert.deepEqual([thumb.width, thumb.height], [180, 125]);
  }
  const pkg = JSON.parse(source('package.json'));
  assert.ok(pkg.build.files.includes('UI/news/**/*.webp'));
  assert.ok(pkg.build.files.includes('!UI/news/**/*.png'));
});
