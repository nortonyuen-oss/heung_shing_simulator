'use strict';

// 《玩轉18區》 P2 (docs/campaign-levels-design.md §5): chapters 02 大埔, 03 西貢, 04 南區, 07 屯門 and
// 12 東區 - their story, stars, start cities and deadlines, the unlocking that steps over chapters
// still to come, and the city facts the new objectives read.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const campaign = require('../campaign-chapters.js');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');
const specs = campaign.CAMPAIGN_CHAPTER_SPECS;
const P2 = ['ch02', 'ch03', 'ch04', 'ch07', 'ch12'];
const parks = { park_small: 1 };

// a city that meets every first-star objective of each P2 chapter (base: the run's start)
const starOne = {
  ch02: () => ({
    busRoutes: 3, busRoutesNet: 420, population: 8200, unemploymentRate: 0.06, monthlyNet: 300,
    buildings: { police_station: 1, fire_station: 1, hospital: 1, public_market: 1, ...parks },
  }),
  ch03: () => ({
    promenadeLongest: 18, typhoonShelters: 1, yachts: 2, festivalHeldYear: { dragonBoat: 1903 },
    tourismAppeal: 61, happiness: 0.55, monthlyNet: 120, buildings: {},
  }),
  ch04: () => ({
    transit: { metro: 2400, ferry: 300 }, typhoonShelters: 1, industrialCount: 30, unemploymentRate: 0.05,
    buildings: { ocean_park: 1 }, festivalHeldYear: { dragonBoat: 1903 }, happiness: 0.6, monthlyNet: 900,
  }),
  ch07: () => ({
    busRoutes: 6, crossDistrictRoutes: 3, transit: { lightRail: 800 }, trafficIndex: 0.48,
    buildings: { police_station: 2 }, crimeRate: 0.22, monthlyNet: 1500,
  }),
  ch12: () => ({
    transit: { tram: 900, metro: 4000, bus: 1200 }, residentialCount: 300, commercialCount: 120, industrialCount: 40,
    unemploymentRate: 0.05, trafficIndex: 0.45, crimeRate: 0.2, happiness: 0.6, monthlyNet: 2000, buildings: {},
  }),
};
const startBase = { festivalHeldYear: { dragonBoat: 1902 } };

test('P2: five chapters with their story in three languages, by known speakers, every portrait there', () => {
  P2.forEach((id) => {
    const spec = specs[id];
    assert.ok(campaign.isCampaignChapterPlayable(id), id);
    assert.equal(spec.startFile, `UI/campaign/${id}.json`);
    assert.equal(spec.stars.length, 3, `${id} has three stars`);
    const lines = [...spec.intro, ...spec.outro, ...spec.failure, ...spec.events.flatMap((event) => event.lines)];
    lines.forEach((line) => {
      const text = line.card || line.text;
      ['zhHant', 'en', 'ja'].forEach((lang) => assert.ok(text[lang], `${id}: ${text.zhHant} in ${lang}`));
      if (line.hint) ['zhHant', 'en', 'ja'].forEach((lang) => assert.ok(line.hint[lang], `${id} hint in ${lang}`));
      if (!line.card) assert.ok(campaign.CAMPAIGN_SPEAKERS[line.speaker], `${id}: speaker ${line.speaker}`);
    });
    spec.stars.forEach((star) => {
      ['zhHant', 'en', 'ja'].forEach((lang) => assert.ok(star.title[lang], `${id} star title in ${lang}`));
      star.objectives.forEach((objective) => ['zhHant', 'en', 'ja'].forEach((lang) => assert.ok(objective.label[lang], `${id}.${objective.id} in ${lang}`)));
    });
    [spec.outroForum, ...spec.events.map((event) => event.forum).filter(Boolean)].forEach((forum) => {
      ['zhHant', 'en', 'ja'].forEach((lang) => assert.ok(forum.headline[lang] && forum.body[lang], `${id} forum in ${lang}`));
    });
  });
  Object.values(campaign.CAMPAIGN_SPEAKERS).forEach((speaker) => {
    if (speaker.portrait) assert.ok(fs.existsSync(path.join(ROOT, speaker.portrait)), speaker.portrait);
    else assert.ok(speaker.glyph, 'a speaker without art has a glyph');
  });
  assert.equal(campaign.CAMPAIGN_SPEAKERS.tourism.portrait, 'UI/officials/councilMember-tourism.PNG');
  // the safety branch is told plainly: no forum joke goes with it
  assert.equal(specs.ch07.events.find((event) => event.id === 'nightSafety').forum, undefined);
});

test('P2: each chapter\'s first star is met by a city that does what the script asks, and not by an empty one', () => {
  P2.forEach((id) => {
    const run = campaign.createCampaignRun(id, 100, startBase);
    const met = campaign.evaluateCampaignStar(specs[id], 0, starOne[id](), run);
    assert.equal(met.done, true, `${id}: ${JSON.stringify(met.items.filter((item) => !item.done).map((item) => item.id))}`);
    const empty = campaign.evaluateCampaignStar(specs[id], 0, { buildings: {}, transit: {} }, run);
    assert.equal(empty.done, false, id);
    assert.ok(empty.items.every((item) => typeof item.progress === 'string'), `${id} shows progress on an empty city`);
  });
});

test('P2: a festival counts only when held after the chapter began (the history keeps years)', () => {
  const run = campaign.createCampaignRun('ch03', 100, { festivalHeldYear: { dragonBoat: 1902 } });
  assert.deepEqual({ ...run.base.festivalHeldYear }, { dragonBoat: 1902 });
  const dragonBoat = (snapshot) => campaign.evaluateCampaignStar(specs.ch03, 0, snapshot, run).items.find((item) => item.id === 'dragonBoat').done;
  assert.equal(dragonBoat({ festivalHeldYear: { dragonBoat: 1902 } }), false, 'the race before the chapter');
  assert.equal(dragonBoat({ festivalHeldYear: { dragonBoat: 1903 } }), true, 'a race since');
  // a saved run keeps its base; a hand-edited one cannot smuggle odd keys in
  const stored = campaign.normalizeCampaignRun(JSON.parse(JSON.stringify({ ...run, base: { festivalHeldYear: { dragonBoat: 1902, 'bad key!': 5 } } })));
  assert.deepEqual(Object.keys(stored.base.festivalHeldYear), ['dragonBoat']);
  // 東區's second star: any festival since the chapter began
  const ch12run = campaign.createCampaignRun('ch12', 100, { festivalHeldYear: { christmas: 1902 } });
  const festival = (snapshot) => campaign.evaluateCampaignStar(specs.ch12, 1, snapshot, ch12run).items.find((item) => item.id === 'festival').done;
  assert.equal(festival({ festivalHeldYear: { christmas: 1902 } }), false);
  assert.equal(festival({ festivalHeldYear: { christmas: 1902, midAutumn: 1903 } }), true);
});

test('P2: star one fits in 24 months at most - 24 for the Dragon Boat race or a metro / light rail', () => {
  assert.deepEqual(P2.map((id) => campaign.getCampaignDeadlineMonths(id)), [12, 24, 24, 24, 24]);
  assert.equal(campaign.getCampaignDeadlineMonths('ch01'), 12);
  assert.equal(campaign.createCampaignRun('ch04', 200).deadlineMonthIndex, 224);
  assert.equal(campaign.normalizeCampaignRun({ chapterId: 'ch03', startMonthIndex: 50 }).deadlineMonthIndex, 74);
  // Norton 2026-11-19: 每一局一星大概落在24個月之內
  P2.forEach((id) => {
    const months = campaign.getCampaignDeadlineMonths(id);
    assert.ok(months <= 24, id);
    const ids = specs[id].stars[0].objectives.map((objective) => objective.id);
    // a yearly race, or a line that opens only at 15,000 / 30,000 people with the council's funding
    const slow = ids.includes('dragonBoat') || ids.includes('metro') || ids.includes('lightRail') || ids.includes('metroBus');
    assert.equal(months, slow ? 24 : 12, id);
  });
});

test('P2: unlocking steps over chapters still to come; a starred chapter stays open', () => {
  const profile = (stars) => campaign.normalizeCampaignProfile({ chapters: Object.fromEntries(Object.entries(stars).map(([id, n]) => [id, { stars: n }])) });
  assert.equal(campaign.isCampaignChapterUnlocked(profile({}), 'ch02'), false);
  assert.equal(campaign.isCampaignChapterUnlocked(profile({ ch01: 1 }), 'ch02'), true);
  assert.equal(campaign.isCampaignChapterUnlocked(profile({ ch01: 1, ch02: 1, ch03: 1 }), 'ch07'), false, 'not before 04');
  assert.equal(campaign.isCampaignChapterUnlocked(profile({ ch01: 1, ch02: 1, ch03: 1, ch04: 1 }), 'ch07'), true, '04 opens 07 past 05 and 06');
  assert.equal(campaign.isCampaignChapterUnlocked(profile({ ch01: 1, ch02: 1, ch03: 1, ch04: 1 }), 'ch05'), true, '05 shows as coming soon');
  assert.equal(campaign.isCampaignChapterUnlocked(profile({ ch07: 1 }), 'ch12'), true, '07 opens 12 past 08-11');
  assert.equal(campaign.isCampaignChapterUnlocked(profile({ ch07: 2 }), 'ch07'), true, 'a starred chapter stays open');
  assert.deepEqual(campaign.getCampaignChaptersUnlockedBy('ch04').map((chapter) => chapter.id), ['ch05', 'ch07']);
  assert.deepEqual(campaign.getCampaignChaptersUnlockedBy('ch01').map((chapter) => chapter.id), ['ch02']);
  assert.deepEqual(campaign.getCampaignChaptersUnlockedBy('ch12').map((chapter) => chapter.id), ['ch13']);
  assert.deepEqual(campaign.getCampaignChaptersUnlockedBy('ch18').map((chapter) => chapter.id), []);
});

test('P2: every chapter plays on its own 256x256 district map; 04 and 12 start from a built town on it', () => {
  const maps = source('hk-district-maps.js');
  const BUILT = { ch04: 'aberdeen', ch12: 'eastern' };
  P2.forEach((id) => {
    const spec = specs[id];
    assert.ok(!spec.requiresStartFile, id);
    assert.ok(spec.fresh.budget >= 60000 && spec.fresh.transportExpansion === true, id);
    ['zhHant', 'en', 'ja'].forEach((lang) => assert.ok(spec.fresh.cityName[lang], `${id} city name in ${lang}`));
    const mapId = campaign.CAMPAIGN_CHAPTERS_BY_ID[id].mapId;
    assert.ok(maps.includes(`{"id":"${mapId}","centre"`), `${id} plays on ${mapId}`);
    const file = path.join(ROOT, spec.startFile);
    assert.equal(fs.existsSync(file), !!BUILT[id], `${id} ${BUILT[id] ? 'ships' : 'has no'} start city`);
    if (!BUILT[id]) return;
    // Norton 2026-11-19: prebuilt cities are fine, but on the district map as it is (地圖基底唔使刻意創造);
    // about 15,000 people, so the metro (30,000) is work but within reach
    const start = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(start.format, 'heung-shing-campaign-start');
    assert.equal(start.chapterId, id);
    const save = start.save_data;
    assert.equal(mapId, BUILT[id]);
    assert.equal(save.city.districtProfileId, mapId, `${id} keeps the district's traits`);
    assert.deepEqual([save.mapWidth, save.mapHeight], [256, 256]);
    assert.ok(save.city.population >= 13000 && save.city.population <= 17000, `${id}: ${save.city.population} people`);
    assert.equal(save.city.budget, spec.fresh.budget, `${id} starts with the chapter's money`);
    assert.ok(!save.city.campaign, `${id}: a start file starts clean`);
    // the camera opens on the town, not the hills or the sea
    const { centerRow, centerCol } = save.viewpoint;
    const near = Object.keys(save.buildingData).filter((key) => {
      const [row, col] = key.split(':').map(Number);
      return Math.abs(row - centerRow) <= 10 && Math.abs(col - centerCol) <= 10;
    });
    assert.ok(near.length >= 10, `${id}: ${near.length} buildings in view`);
  });
  // without its file a chapter still starts, on the bare district map; one with neither says so
  // before the player is asked to leave the city
  const js = source('campaign.js');
  assert.match(js, /if \(!file && \(spec\.requiresStartFile \|\| !spec\.fresh\)\)/);
  assert.ok(js.indexOf('const file = await fetchCampaignStartFile') < js.indexOf("'開始新章節會離開而家個城市"));
});

function loadRuntime() {
  const context = vm.createContext({
    console: { warn() {}, error() {}, info() {}, log() {} },
    setTimeout: () => 0, clearTimeout() {},
    Promise, JSON, Object, Array, Number, String, Math, Set, Map, Date, Error,
    onGameClockEvent() {},
    HeungShingStorage: { request: async () => ({ ok: true, json: async () => ({ data: null }) }) },
    city: { year: 1903, month: 6, campaign: null, crimeRateIndex: 0.31, tourismAppeal: 64, pollution: 0.2, budget: 45000, loans: [] },
    getCityMonthIndex: () => 100,
    collectMedalSnapshot: () => ({ buildings: {}, transit: {} }),
    getCurrentLanguage: () => 'zhHant',
  });
  context.globalThis = context;
  vm.runInContext(source('campaign-chapters.js'), context);
  vm.runInContext(source('campaign.js'), context);
  return context;
}

test('P2 runtime: the snapshot reads bus routes, districts, shelters, the promenade and festivals', () => {
  const context = loadRuntime();
  const stops = [
    { id: 1, row: 10, col: 10 }, { id: 2, row: 12, col: 60 }, // two districts
    { id: 3, row: 11, col: 11 }, { id: 4, row: 13, col: 12 }, // one district
  ];
  context.isTransportExpansionActive = () => true;
  context.getTransportExpansionState = () => ({
    stops,
    routes: [
      { id: 'a', status: 'active', stopIds: [1, 2], history: [{ passengers: 400, net: 120 }] },
      { id: 'b', status: 'active', stopIds: [3, 4], history: [{ passengers: 90, net: -40 }] },
      { id: 'c', status: 'suspended', stopIds: [1, 2], history: [{ passengers: 500, net: 300 }] },
      { id: 'd', status: 'active', stopIds: [1, 2], history: [{ passengers: 0, net: -15 }] },
    ],
  });
  context.getDistrictKeyForTile = (row, col) => (col < 40 ? 'west' : 'east');
  context.getTyphoonShelterState = () => ({ shelters: [{ status: 'operational' }, { status: 'planned' }] });
  context.getTyphoonShelterYachtCount = () => 3;
  // a run of 5 along a diagonal coast, and a separate 2
  context.getPromenadeTileKeys = () => ['5:5', '6:6', '7:6', '8:7', '9:8', '20:20', '20:21'];
  context.getCityFestivalState = () => ({ history: [
    { id: 'dragonBoat', year: 1901, outcome: 'held' }, { id: 'dragonBoat', year: 1903, outcome: 'held' },
    { id: 'dragonBoat', year: 1902, outcome: 'noVenue' }, { id: 'christmas', year: 1902, outcome: 'skipped' },
  ] });
  const snapshot = context.buildCampaignSnapshot();
  assert.equal(snapshot.busRoutes, 2, 'running routes with riders last month');
  assert.equal(snapshot.busRoutesNet, 80);
  assert.equal(snapshot.crossDistrictRoutes, 1);
  assert.equal(snapshot.typhoonShelters, 1);
  assert.equal(snapshot.yachts, 3);
  assert.equal(snapshot.promenadeLongest, 5);
  assert.equal(JSON.stringify(snapshot.festivalHeldYear), JSON.stringify({ dragonBoat: 1903 }));
  assert.equal(JSON.stringify(snapshot.festivalNoVenueYear), JSON.stringify({ dragonBoat: 1902 }));
  assert.equal(snapshot.crimeRate, 0.31);
  assert.equal(snapshot.tourismAppeal, 64);
  assert.equal(snapshot.funds, 45000);
});

test('P2 runtime: without the transport expansion or any shelters, the new facts are zero', () => {
  const snapshot = loadRuntime().buildCampaignSnapshot();
  ['busRoutes', 'busRoutesNet', 'crossDistrictRoutes', 'typhoonShelters', 'yachts', 'promenadeLongest'].forEach((key) => {
    assert.equal(snapshot[key], 0, key);
  });
  assert.equal(Object.keys(snapshot.festivalHeldYear).length, 0);
});
