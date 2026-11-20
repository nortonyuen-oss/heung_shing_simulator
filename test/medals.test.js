'use strict';

// 香城洋紫荊勳章 (Norton 2026-11-17, 《玩轉18區》劇本 v1.2 APPENDIX C): the 36 medals' rules, the
// player-wide cabinet (跟玩家・跨存檔), and the hooks that feed it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const medals = require('../medal-definitions.js');
const { LOVERS_STORY_DEFS } = require('../lovers-stories.js');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');
const stamp = (city = '測試城') => ({ at: '2026-11-17T00:00:00.000Z', city, year: 2030, month: 1 });
const judge = (snapshot, profile = medals.createEmptyMedalProfile()) => {
  const result = medals.evaluateMedals({ buildings: {}, policies: {}, transit: {}, facts: {}, ...snapshot }, profile, stamp());
  return { ...result, profile };
};
const earns = (snapshot, id) => judge(snapshot).newlyEarned.includes(id);
const completeDiary = () => ({ seen: Object.fromEntries(LOVERS_STORY_DEFS.map((def, i) => [def.id, 100 + i * 3])) });

test('all 36 traceable medals are listed: 19 core, 14 selected, 3 special; all 36 judged', () => {
  assert.equal(medals.MEDAL_DEFS.length, 36);
  assert.equal(new Set(medals.MEDAL_DEFS.map((def) => def.id)).size, 36);
  const bySeries = (series) => medals.MEDAL_DEFS.filter((def) => def.series === series).map((def) => def.id);
  assert.deepEqual(bySeries('A'), Array.from({ length: 19 }, (_, i) => `A${String(i + 1).padStart(2, '0')}`));
  assert.deepEqual(bySeries('B'), Array.from({ length: 14 }, (_, i) => `B${String(i + 1).padStart(2, '0')}`));
  assert.deepEqual(bySeries('S'), ['C01', 'D01', 'E01']);
  const byStatus = (status) => medals.MEDAL_DEFS.filter((def) => def.status === status).map((def) => def.id);
  assert.deepEqual(byStatus('locked'), [], 'A15-A19 set 2026-11-17');
  assert.deepEqual(byStatus('blocked'), [], '公屋/居屋 and the routes live since P4, Claire with the lovers stories, E01 with the campaign');
  assert.equal(byStatus('active').length, 36);
  medals.MEDAL_DEFS.forEach((def) => {
    ['zhHant', 'en', 'ja'].forEach((language) => {
      assert.ok(def.name[language], `${def.id} name in ${language}`);
      assert.ok(def.desc[language], `${def.id} description in ${language}`);
    });
    if (def.status === 'active') assert.ok(def.live || def.parts?.length, `${def.id} has a rule`);
    else assert.ok(!def.live && !def.parts, `${def.id} has no rule until it is unlocked`);
  });
  assert.equal(medals.MEDAL_DEFS_BY_ID.C01.tier, 'black');
  assert.ok(medals.MEDAL_DEFS_BY_ID.C01.hidden && medals.MEDAL_DEFS_BY_ID.D01.hidden, 'C.7: the two secret medals start hidden');
});

test('「大於／超過」 is strict and 「至少／達」 is not (C.7)', () => {
  assert.equal(earns({ population: 3000 }, 'A01'), false, 'A01 needs more than 3,000');
  assert.equal(earns({ population: 3001 }, 'A01'), true);
  assert.equal(earns({ population: 300000 }, 'A05'), true, 'A05 達 300,000');
  assert.equal(earns({ highDensityResidents: 85000 }, 'A04'), false);
  assert.equal(earns({ highDensityResidents: 85001 }, 'A04'), true);
  assert.equal(earns({ population: 10000, happiness: 0.70 }, 'B01'), false, 'happiness exactly 70% does not count');
  assert.equal(earns({ population: 10000, happiness: 0.71 }, 'B01'), true);
  assert.equal(earns({ ridicule: 80 }, 'B11'), false);
  assert.equal(earns({ ridicule: 81 }, 'B11'), true);
  const exchange = { buildings: { stock_exchange: 1 } };
  assert.equal(earns({ ...exchange, governmentRealizedPnl: 1000000 }, 'A12'), false, 'the notable-profit bar, exceeded');
  assert.equal(earns({ ...exchange, governmentRealizedPnl: 1000001 }, 'A12'), true);
  assert.equal(earns({ governmentRealizedPnl: 9e9 }, 'A12'), false, 'no stock exchange, no medal');
});

test('Claire’s Memories is the existing hidden memorial, awarded only for a recorded completed story', () => {
  const def = medals.MEDAL_DEFS_BY_ID.D01;
  assert.equal(def.status, 'active');
  assert.equal(def.hidden, true);
  assert.equal(def.tier, 'memorial');
  assert(def.quote.zhHant);
  assert.equal(earns({}, 'D01'), false);
  assert.equal(earns({ facts: { 'forum:farewell': stamp() } }, 'D01'), false);
  assert.equal(earns({ facts: { loversStoryComplete: stamp() } }, 'D01'), true);
});

test('transport: firsts are remembered; the tycoon needs all four modes in a month and > $10,000 fares', () => {
  assert.equal(earns({ facts: { 'transit:bus': stamp() } }, 'A09'), true);
  assert.equal(earns({ transit: { lightRail: 30 } }, 'A10'), true, 'light rail is a railway');
  assert.equal(earns({ transit: { tram: 30 } }, 'A10'), false, 'the tram is B06, not a railway');
  assert.equal(earns({ transit: { tram: 30 } }, 'B06'), true);
  assert.equal(earns({ transit: { ferry: 1 } }, 'B05'), true);
  const four = { bus: 1, ferry: 1, metro: 1, tram: 1 };
  assert.equal(earns({ transit: four }, 'A14'), true);
  assert.equal(earns({ transit: { ...four, tram: 0, lightRail: 500 } }, 'A14'), false, 'light rail does not stand in for the tram');
  assert.equal(earns({ transit: four, transitRevenue: 10000 }, 'A11'), false);
  assert.equal(earns({ transit: four, transitRevenue: 10001 }, 'A11'), true);
});

test('香港的眼淚: the ferry pier is 皇后碼頭, the night bazaar\'s carts the 車仔檔', () => {
  const profile = medals.createEmptyMedalProfile();
  let result = medals.evaluateMedals({ buildings: { murray_house: 1 }, ferryPiers: 2 }, profile, stamp('中西區'));
  assert.ok(!result.newlyEarned.includes('A13'));
  assert.deepEqual(Object.keys(profile.parts.A13).sort(), ['murrayHouse', 'queensPier']);
  result = medals.evaluateMedals({ buildings: { floating_restaurant: 1 }, nightMarketRunning: true }, profile, stamp('南區'));
  assert.ok(result.newlyEarned.includes('A13'));
});

test('A15-A19 as set on the real saves (docs/medals-design.md §5)', () => {
  assert.equal(earns({ population: 156007, transitRiders: 19702 }, 'A15'), false, '堅尼地城 is at 12.6%');
  assert.equal(earns({ population: 156007, transitRiders: 23402 }, 'A15'), true, '15%');
  assert.equal(earns({ population: 49999, transitRiders: 40000 }, 'A15'), false, 'a city of 50,000 at least');
  assert.equal(earns({ commercialTax: 999 }, 'A16'), false);
  assert.equal(earns({ commercialTax: 1000 }, 'A16'), true);
  const leader = { commercialCount: 251, industrialCount: 52, buildings: { container_port: 2 }, unemploymentRate: 0 };
  assert.equal(earns(leader, 'A17'), true, '堅尼地城 qualifies');
  assert.equal(earns({ ...leader, buildings: {} }, 'A17'), false, 'no port');
  assert.equal(earns({ ...leader, unemploymentRate: 0.08 }, 'A17'), false, 'unemployment under 8%');
  assert.equal(earns({ gradeAOffices: 4, commercialTax: 13005 }, 'A18'), false, '堅尼地城 has 4 grade-A towers');
  assert.equal(earns({ gradeAOffices: 11, commercialTax: 16704 }, 'A18'), true, '太子');
  assert.equal(earns({ gradeAOffices: 8, commercialTax: 3072 }, 'A18'), false, '香港: towers but not the tax');
  assert.equal(earns({ surplusStreak: 11 }, 'A19'), false);
  assert.equal(earns({ surplusStreak: 12 }, 'A19'), true);
});

test('超級聯繫人: a line off the map is a connection to the neighbours too (區外交通)', () => {
  const profile = medals.createEmptyMedalProfile();
  medals.evaluateMedals({ buildings: {}, regionConnections: 0, offMapLines: 1 }, profile, stamp('荃灣'));
  assert.ok(profile.parts.A03.region);
});

test('parts build up across cities (C.7 跨存檔): 超級聯繫人 from two saves', () => {
  const profile = medals.createEmptyMedalProfile();
  let result = medals.evaluateMedals({ buildings: {}, regionConnections: 2 }, profile, stamp('北區'));
  assert.deepEqual(result.newlyEarned, []);
  assert.ok(profile.parts.A03.region);
  result = medals.evaluateMedals({ buildings: { container_port: 1, airport: 1 }, regionConnections: 0 }, profile, stamp('離島'));
  assert.ok(result.newlyEarned.includes('A03'));
  assert.equal(profile.earned.A03.city, '離島');
  result = medals.evaluateMedals({ buildings: {}, regionConnections: 0 }, profile, stamp());
  assert.ok(!result.newlyEarned.includes('A03'), 'earned once, never again');
  assert.ok(profile.earned.A03, 'and never taken back');
});

test('盛事之都 needs all eight named events and venues, each on its own record', () => {
  const profile = medals.createEmptyMedalProfile();
  const city1 = {
    buildings: { football_stadium: 1, indoor_coliseum: 1 },
    approvedResolutions: { menaConcert: 1, muiKinKwokMatch: 1, leagueMatchday: 1, tourEverywhere: 1, fantasyFingHeungShing: 1 },
    nightMarketRunning: true,
  };
  let result = medals.evaluateMedals(city1, profile, stamp());
  assert.ok(!result.newlyEarned.includes('A07'), 'an approved Fing programme is not yet a show held');
  assert.equal(Object.keys(profile.parts.A07).length, 7);
  result = medals.evaluateMedals({ buildings: {}, facts: { 'held:fantasyFingHeungShing': true } }, profile, stamp());
  assert.ok(result.newlyEarned.includes('A07'));
});

test('黑紫荊 needs the four named events plus ridicule 100; hidden until earned', () => {
  const facts = {
    'forum:kirinCouncillor': stamp(), 'failed:fantasyFingHeungShing': stamp(),
    'policy:busSeatbeltMandate': stamp(), 'policy:arcticPenguinReserve': stamp(),
  };
  assert.equal(earns({ facts, ridicule: 99 }, 'C01'), false);
  const three = { ...facts };
  delete three['forum:kirinCouncillor'];
  assert.equal(earns({ facts: three, ridicule: 100 }, 'C01'), false, 'other absurd news does not stand in for the kirin');
  assert.equal(earns({ facts, ridicule: 100 }, 'C01'), true);
  assert.equal(earns({ policies: { busSeatbeltMandate: true, arcticPenguinReserve: true }, failedMajorEvents: ['fantasyFingHeungShing'], facts: { 'forum:kirinCouncillor': stamp() }, ridicule: 100 }, 'C01'), true,
    'a save that already passed the acts and flopped a show counts');
});

test('國際笑話中心: five different absurd events in the same game year', () => {
  assert.equal(earns({ absurdByYear: { 2030: ['a', 'b', 'c', 'd'], 2031: ['e'] } }, 'B12'), false, 'no adding up across years');
  assert.equal(earns({ absurdByYear: { 2030: ['a', 'a', 'b', 'c', 'd'] } }, 'B12'), false, 'the same event twice is one');
  assert.equal(earns({ absurdByYear: { 2030: ['a', 'b', 'c', 'd', 'e'] } }, 'B12'), true);
  const definition = (absurdity) => ({ absurdity });
  assert.equal(medals.isMedalAbsurdResolution(definition(2), 'success'), true);
  assert.equal(medals.isMedalAbsurdResolution(definition(1), 'success'), false);
  assert.equal(medals.isMedalAbsurdResolution(definition(0), 'pitch_invasion_chaos'), true, 'any failure is absurd');
  assert.equal(medals.isMedalAbsurdResolution(definition(2), 'typhoon_cancelled'), false);
  assert.equal(medals.isMedalFailedOutcome('typhoon_cancelled'), false);
  assert.equal(medals.isMedalFailedOutcome('drone_crash'), true);
});

test('landmark medals, 雞棚之都, 民主之父, 媽媽咪呀', () => {
  const five = { exhibition_center: 1, ocean_park: 1, murray_house: 1, yacht_club: 1, floating_restaurant: 1 };
  assert.equal(earns({ population: 100000, buildings: five }, 'B02'), true);
  assert.equal(earns({ population: 99999, buildings: five }, 'B02'), false);
  assert.equal(earns({ buildings: { yacht_club: 3 } }, 'B10'), false, 'two different kinds');
  assert.equal(earns({ buildings: { yacht_club: 1, gold_coast_hotel: 1 } }, 'B10'), true);
  const coop = { buildings: { science_park: 4 }, policies: { scienceDevelopment: true, strongCountryManufacturing: true } };
  assert.equal(earns({ ...coop, scienceParkJobs: 9999 }, 'A06'), false);
  assert.equal(earns({ ...coop, scienceParkJobs: 10000 }, 'A06'), true);
  assert.equal(earns({ policies: { districtCouncilElection: true } }, 'A08'), false);
  assert.equal(earns({ policies: { districtCouncilElection: true, legislativeCouncilElection: true } }, 'A08'), true);
  const food = { seafood_restaurant: 1, floating_restaurant: 1 };
  assert.equal(earns({ buildings: food }, 'B09'), false, 'the dai pai dong night market must be running');
  assert.equal(earns({ buildings: food, nightMarketRunning: true }, 'B09'), true);
  assert.equal(earns({ facts: { typhoonEvent: stamp() } }, 'B14'), true);
  assert.equal(earns({ failedMajorEvents: ['muiKinKwokMatch'] }, 'B13'), true);
});

test('every building type a rule reads is one the game builds', () => {
  const known = source('tools.js') + source('constants.js');
  const pseudo = new Set(['floating_restaurant', 'science_park']); // counted by medals.js itself
  const types = new Set([...medals.MEDAL_TOURISM_LANDMARK_TYPES, ...medals.MEDAL_WATERFRONT_LANDMARK_TYPES,
    'legislative_council', 'container_port', 'airport', 'stock_exchange', 'football_stadium', 'indoor_coliseum',
    'exhibition_center', 'gold_coast_hotel', 'seafood_restaurant']);
  types.forEach((type) => {
    if (pseudo.has(type)) return;
    assert.match(known, new RegExp(`'${type}'|\\b${type}:`), `${type} is a building type`);
  });
  const definitions = source('medal-definitions.js');
  (definitions.match(/built\(s, '([a-z_]+)'\)/g) || []).map((m) => m.match(/'([a-z_]+)'/)[1]).forEach((type) => {
    assert.ok(types.has(type) || pseudo.has(type), `${type} is covered above`);
  });
});

test('a stored profile is cleaned: unknown medals, parts and odd keys are dropped', () => {
  const profile = medals.normalizeMedalProfile({
    earned: { A01: stamp(), Z99: stamp(), A02: 'yes' },
    parts: { A03: { region: stamp(), moon: stamp() }, A01: { x: stamp() } },
    facts: { 'transit:bus': stamp(), 'bad key!': stamp() },
  });
  assert.deepEqual(Object.keys(profile.earned), ['A01']);
  assert.deepEqual(profile.parts, { A03: { region: profile.parts.A03.region } });
  assert.deepEqual(Object.keys(profile.facts), ['transit:bus']);
  assert.deepEqual(medals.normalizeMedalProfile(null), medals.createEmptyMedalProfile());
  assert.deepEqual(medals.getMedalCompletion(profile), { earned: 1, total: 36 });
});

// medals.js in a sandbox: the browser bits stubbed, the storage answering as told.
function loadRuntime({ stored = null, getOk = true } = {}) {
  const requests = [];
  const timers = [];
  const clock = {};
  const context = vm.createContext({
    console: { warn() {}, error() {}, log() {} },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout() {},
    Promise, JSON, Object, Array, Number, String, Math, Set, Date, Error,
    onGameClockEvent: (name, fn) => { clock[name] = fn; },
    HeungShingStorage: {
      request: async (url, options = {}) => {
        requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
        if ((options.method || 'GET') === 'GET') return getOk ? { ok: true, json: async () => ({ data: stored }) } : { ok: false, status: 500 };
        return { ok: true, json: async () => ({ ok: true }) };
      },
    },
    city: {
      name: '測試城', year: 2030, month: 3, population: 5000, happiness: 0.5, cityRidicule: 0,
      activePolicies: {}, council: { resolutionStates: {}, resolutionHistory: [], activePrograms: [] },
      weather: { typhoonActive: false },
    },
    buildingData: {
      '1:1': { type: 'residential', density: 3, population: 180 },
      '1:2': { type: 'residential', density: 1, population: 4 },
      '2:2': { type: 'legislative_council' },
    },
    DENSITY_HIGH: 3,
    POP_PER_LEVEL: [0, 4, 12, 30],
    toasts: [],
    showToast(message, type) { context.toasts.push({ message, type }); },
    getCurrentLanguage: () => 'zhHant',
  });
  context.globalThis = context;
  vm.runInContext(source('lovers-stories.js'), context);
  vm.runInContext(source('medal-definitions.js'), context);
  vm.runInContext(source('medals.js'), context);
  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve)); };
  const runTimers = () => timers.splice(0).forEach((fn) => fn());
  return { context, requests, clock, flush, runTimers };
}

test('runtime: loads the player profile, judges the city, saves the cabinet, toasts the medal', async () => {
  const { context, requests, clock, flush, runTimers } = loadRuntime({ stored: { earned: { B11: stamp('舊城') } } });
  await flush();
  assert.equal(requests[0].url, '/api/player-profile/medals');
  const snapshot = context.collectMedalSnapshot();
  assert.equal(snapshot.highDensityResidents, 180, 'only the high-density homes');
  assert.equal(snapshot.buildings.legislative_council, 1);
  assert.equal(typeof clock['gameclock:month'], 'function', 'judged at every month\'s turn');
  clock['gameclock:month']();
  const profile = context.getMedalProfile();
  assert.ok(profile.earned.A01 && profile.earned.A02, 'earned from the live city');
  assert.equal(profile.earned.B11.city, '舊城', 'the stored cabinet is kept');
  assert.ok(context.toasts.some((toast) => toast.type === 'medal' && toast.message.includes('首任行政長官')));
  runTimers();
  await flush();
  const put = requests.find((request) => request.method === 'PUT');
  assert.ok(put?.body?.data?.earned?.A01, 'the cabinet is written back');
  assert.ok(put.body.data.earned.B11, 'with everything it already had');
});

test('runtime: the completed diary awards the hidden medal immediately, persists it and never awards it twice', async () => {
  const { context, flush, runTimers, requests } = loadRuntime();
  await flush();
  context.city.loversStories = completeDiary();
  delete context.city.loversStories.seen.farewell;
  context.onMedalCityLoaded();
  assert.equal(context.getMedalProfile().earned.D01, undefined);
  context.city.loversStories = completeDiary();
  assert(context.noteMedalLoversStoryComplete().includes('D01'));
  assert.equal(context.getMedalProfile().earned.D01.city, '測試城');
  assert(context.getMedalProfile().facts.loversStoryComplete);
  context.noteMedalLoversStoryComplete();
  context.onMedalCityLoaded();
  context.city.name = '另一座城';
  context.city.loversStories = { seen: {} };
  context.runMedalEvaluation();
  assert.equal(context.getMedalProfile().earned.D01.city, '測試城');
  assert.equal(context.toasts.filter((toast) => toast.message.includes('Claire')).length, 1);
  runTimers(); await flush();
  assert(requests.some((request) => request.method === 'PUT' && request.body.data.earned.D01 && request.body.data.facts.loversStoryComplete));
});

test('runtime: loading a completed city backfills the medal even after its news history is pruned', async () => {
  const { context, flush } = loadRuntime();
  await flush();
  context.city.loversStories = completeDiary();
  context.city.forumPosts = [];
  context.onMedalCityLoaded();
  assert(context.getMedalProfile().earned.D01);
});

test('runtime: two incomplete cities cannot combine their stories into the memorial', async () => {
  const { context, flush } = loadRuntime();
  await flush();
  const diary = completeDiary();
  context.city.loversStories = { seen: Object.fromEntries(Object.entries(diary.seen).slice(0, 6)) };
  context.onMedalCityLoaded();
  context.city.name = '第二座城';
  context.city.loversStories = { seen: Object.fromEntries(Object.entries(diary.seen).slice(6)) };
  context.noteMedalLoversStoryComplete();
  context.onMedalCityLoaded();
  assert.equal(context.getMedalProfile().facts.loversStoryComplete, undefined);
  assert.equal(context.getMedalProfile().earned.D01, undefined);
});

test('runtime: a completion received during profile loading is kept; storage failure and attract mode do not award', async () => {
  const pending = loadRuntime();
  pending.context.city.loversStories = completeDiary();
  pending.context.noteMedalLoversStoryComplete();
  assert(pending.context.getMedalProfile().facts.loversStoryComplete);
  pending.context.city.name = '等待讀取時切換的城市';
  pending.context.city.month = 9;
  pending.context.city.loversStories = { seen: {} };
  await pending.flush();
  assert(pending.context.getMedalProfile().earned.D01);
  assert.equal(pending.context.getMedalProfile().earned.D01.city, '測試城', 'retain the city which completed the story');
  assert.equal(pending.context.getMedalProfile().earned.D01.month, 3, 'retain its completion month');

  const failed = loadRuntime({ getOk: false });
  failed.context.city.loversStories = completeDiary();
  failed.context.noteMedalLoversStoryComplete();
  failed.runTimers(); await failed.flush();
  assert.equal(failed.context.getMedalProfile().earned.D01, undefined);
  assert.equal(failed.requests.some((request) => request.method === 'PUT'), false);

  const showcase = loadRuntime();
  await showcase.flush();
  showcase.context.city.loversStories = completeDiary();
  showcase.context.isAttractModeActive = () => true;
  showcase.context.noteMedalLoversStoryComplete();
  showcase.context.runMedalEvaluation();
  assert.equal(showcase.context.getMedalProfile().facts.loversStoryComplete, undefined);
  assert.equal(showcase.context.getMedalProfile().earned.D01, undefined);
});

test('runtime: only a successfully published final story triggers the medal hook', async () => {
  const { context, flush } = loadRuntime();
  await flush();
  context.city.month = 9;
  context.city.loversStories = completeDiary();
  delete context.city.loversStories.seen.farewell;
  Object.assign(context, {
    hasBuildingType: () => false,
    getCouncilNewsOfficialDisplayName: () => '測試官員',
    getDefaultCityName: () => '香城', tMonth: String,
    getTransportExpansionState: () => ({ lastModeTotals: { metro: 10 } }),
    getCityMonthIndex: () => context.city.year * 12 + context.city.month - 1,
    normalizeForumImagePath: (value) => value,
  });
  context.Math = Object.assign(Object.create(Math), { random: () => 0 });
  vm.runInContext(source('newspaper.js'), context);
  vm.runInContext('maybeAnnounceCaacaantengAd = () => null; actualAddForumPost = addForumPost; addForumPost = () => null;', context);
  assert.equal(context.generateMonthlyForumPost(), null);
  assert.equal(context.getMedalProfile().earned.D01, undefined);
  assert.equal(context.city.loversStories.seen.farewell, undefined);
  context.city.month++;
  vm.runInContext('addForumPost = actualAddForumPost;', context);
  const post = context.generateMonthlyForumPost();
  assert.equal(post.id, 'lovers-farewell');
  assert(context.getMedalProfile().earned.D01);
});

test('runtime: a failed profile load never writes over the stored cabinet, and the showcase earns nothing', async () => {
  const failed = loadRuntime({ getOk: false });
  await failed.flush();
  failed.clock['gameclock:month']();
  failed.context.noteMedalFact('transit:bus');
  failed.runTimers();
  await failed.flush();
  assert.equal(failed.requests.filter((request) => request.method === 'PUT').length, 0);
  assert.ok(failed.requests.filter((request) => request.method === 'GET').length >= 2, 'it tries again');

  const showcase = loadRuntime();
  showcase.context.isAttractModeActive = () => true;
  await showcase.flush();
  showcase.clock['gameclock:month']();
  showcase.context.noteMedalFact('transit:bus');
  assert.equal(Object.keys(showcase.context.getMedalProfile().earned).length, 0);
  assert.equal(Object.keys(showcase.context.getMedalProfile().facts).length, 0);
});

test('runtime: the surplus streak counts months only as they turn, and a deficit resets it', async () => {
  const { context, clock, flush } = loadRuntime();
  await flush();
  context.city.monthlyIncome = 1000;
  context.city.monthlyExpenses = 400;
  context.runMedalEvaluation();
  context.onMedalCityLoaded();
  assert.equal(context.city.medalLog.surplusStreak ?? 0, 0, 'judging is not a month');
  for (let i = 0; i < 11; i++) clock['gameclock:month']();
  assert.equal(context.city.medalLog.surplusStreak, 11);
  assert.ok(!context.getMedalProfile().earned.A19);
  clock['gameclock:month']();
  assert.ok(context.getMedalProfile().earned.A19, 'the twelfth month in a row');
  context.city.monthlyExpenses = 1200;
  clock['gameclock:month']();
  assert.equal(context.city.medalLog.surplusStreak, 0);
  const snapshot = context.collectMedalSnapshot();
  assert.equal(snapshot.gradeAOffices, 0);
  context.buildingData['3:3'] = { type: 'commercial', commercialTier: 'UH' };
  context.buildingData['3:4'] = { type: 'commercial', commercialTier: 'M' };
  assert.equal(context.collectMedalSnapshot().gradeAOffices, 1);
});

test('麒麟撞議員 runs once every Lunar New Year, and the council keeps the year it ran', () => {
  const news = source('newspaper.js');
  assert.match(news, /if \(kirinStory && !kirinRanThisYear && \(city\.month === 2 \|\| !featuredTopic\)\) featuredTopic = kirinStory;/);
  assert.match(news, /city\.council\.forumEventState\.kirinLastYear = Math\.floor\(Number\(city\.year\) \|\| 0\);/);
  const context = vm.createContext({});
  ['constants.js', 'council-definitions.js', 'council-state.js'].forEach((file) => vm.runInContext(source(file), context));
  const kept = vm.runInContext('normalizeCouncilState({ forumEventState: { labExplosionLastMonthIndex: 5, kirinLastYear: 2031 } }, {}).forumEventState', context);
  assert.equal(kept.kirinLastYear, 2031, 'a save keeps the year the kirin ran');
  assert.equal(vm.runInContext('createDefaultCouncilState({}).forumEventState.kirinLastYear', context), -1);
});

test('runtime hooks: events and absurdities are noted where they happen', async () => {
  const { context, flush } = loadRuntime();
  await flush();
  context.getCouncilResolutionDefinition = (id) => ({ fantasyFingHeungShing: { absurdity: 2 }, muiKinKwokMatch: { absurdity: 1 } })[id] || null;
  context.city.weather.typhoonActive = true;
  context.noteMedalResolutionOutcome('muiKinKwokMatch', 'bench_warmer_refund');
  const facts = context.getMedalProfile().facts;
  assert.ok(facts['held:muiKinKwokMatch'] && facts['failed:muiKinKwokMatch'] && facts.majorEventFailed && facts.typhoonEvent);
  context.city.weather.typhoonActive = false;
  context.noteMedalResolutionOutcome('fantasyFingHeungShing', 'typhoon_cancelled');
  assert.ok(!facts['held:fantasyFingHeungShing'], 'a cancelled show was not held');
  context.noteMedalPolicyEnacted('busSeatbeltMandate');
  context.noteMedalPolicyEnacted('cleanAir');
  context.noteMedalForumStory('kirinCouncillor');
  context.noteMedalForumStory('kirinCouncillor');
  assert.ok(facts['policy:busSeatbeltMandate'] && facts['forum:kirinCouncillor'] && !facts['policy:cleanAir']);
  assert.deepEqual([...context.city.medalLog.absurd.map((entry) => entry.id)],
    ['resolution:muiKinKwokMatch', 'policy:busSeatbeltMandate', 'forum:kirinCouncillor']);
  context.noteMedalTransitMonth({ bus: 0, ferry: 12 });
  assert.ok(facts['transit:ferry'] && !facts['transit:bus']);
});

test('wiring: scripts, menu, storage routes and the game\'s hooks', () => {
  const html = source('index.html');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
  const at = (name) => scripts.indexOf(name);
  assert.ok(at('medal-definitions.js') > at('game-clock.js'));
  assert.equal(at('medals.js'), at('medal-definitions.js') + 1);
  assert.match(html, /data-menu-action="open-medal-cabinet" data-i18n="menu\.medalCabinet"/);
  assert.match(source('topbar.js'), /case 'open-medal-cabinet':\s+if \(typeof openMedalCabinet === 'function'\) openMedalCabinet\(\);/);
  assert.equal(source('i18n.js').match(/'menu\.medalCabinet'/g)?.length, 3, 'en, zh, ja');
  // the medal count in the top bar opens the cabinet too (Norton: 要有個位可以view到勳章)
  assert.match(html, /<button class="kpi-card kpi-card-button" id="topbar-medals-btn" type="button" onclick="openMedalCabinet\(\)"/);
  assert.match(html, /<span class="kpi-value" id="topbar-medals">/);
  ['topbar.kpi.medals', 'topbar.medalsTitle'].forEach((key) => {
    assert.equal(source('i18n.js').match(new RegExp(`'${key.replace('.', '\\.')}'`, 'g'))?.length, 3, `${key} in en, zh, ja`);
  });

  assert.match(source('db.js'), /CREATE TABLE IF NOT EXISTS player_profile/);
  assert.match(source('server.js'), /app\.get\('\/api\/player-profile\/:key'/);
  assert.match(source('server.js'), /app\.put\('\/api\/player-profile\/:key'/);
  assert.match(source('server.js'), /PLAYER_PROFILE_KEYS = new Set\(\['medals', 'campaign'\]\)/);
  assert.match(source('game-storage.js'), /\/api\\\/player-profile\\\/\(medals\|campaign\)/);

  assert.match(source('council-voting.js'), /noteMedalPolicyEnacted\(session\.itemId\)/);
  assert.match(source('council-voting.js'), /noteMedalResolutionOutcome\(session\.itemId, resolutionResult\.outcome\)/);
  assert.match(source('council-effects.js'), /noteMedalResolutionOutcome\(program\.resolutionId, result\.outcome\)/);
  assert.match(source('newspaper.js'), /medalStoryId: 'kirinCouncillor'/);
  assert.match(source('newspaper.js'), /noteMedalForumStory\('labExplosion'\)/);
  assert.match(source('transport-expansion.js'), /noteMedalTransitMonth\(state\.lastModeTotals\)/);
  assert.match(source('save.js'), /onMedalCityLoaded\(\)/);
  assert.equal(source('city-state.js').match(/medalLog: \{ absurd: \[\] \}|city\.medalLog = \{ absurd: \[\] \}/g)?.length, 2, 'new city and reset');
});

test('the player profile store round-trips through SQLite', () => {
  const { openGameDatabase } = require('../db.js');
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'medal-db-'));
  const store = openGameDatabase(path.join(dir, 'test.sqlite'));
  assert.equal(store.getPlayerProfile('medals'), null);
  store.putPlayerProfile('medals', { earned: { A01: stamp() } });
  assert.deepEqual(store.getPlayerProfile('medals'), { earned: { A01: stamp() } });
  assert.throws(() => store.putPlayerProfile('medals', [1]), /JSON object/);
  assert.throws(() => store.putPlayerProfile('../x', {}), /invalid/);
  store.close?.();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('B03 公屋之父 and B04 居者有其屋 count the residents of each housing type', () => {
  assert.equal(earns({ publicHousingResidents: 49999 }, 'B03'), false);
  assert.equal(earns({ publicHousingResidents: 50000 }, 'B03'), true);
  assert.equal(earns({ hosResidents: 19999 }, 'B04'), false);
  assert.equal(earns({ hosResidents: 20000 }, 'B04'), true);
  assert.equal(earns({ privateResidents: 90000 }, 'B03'), false, 'private homes are not public housing');
});

// E01 九龍皇帝 (v6.0.0): a star in each of the 18 districts of 《玩轉18區》, from the player's campaign profile.
test('E01: a star in every one of the 18 districts', () => {
  const e01 = medals.MEDAL_DEFS.find((def) => def.id === 'E01');
  assert.equal(e01.status, 'active');
  assert.equal(e01.live({ campaignChaptersStarred: 18 }), true);
  assert.equal(e01.live({ campaignChaptersStarred: 17 }), false);
  assert.equal(e01.live({}), false);
  const source = (file) => require('node:fs').readFileSync(require('node:path').join(__dirname, '..', file), 'utf8');
  assert.match(source('medals.js'), /campaignChaptersStarred: countMedalCampaignChaptersStarred\(\)/);
  assert.match(source('campaign.js'), /star === 1 && typeof runMedalEvaluation === 'function'/);
});

