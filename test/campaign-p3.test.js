'use strict';

// 《玩轉18區》 P3 (docs/campaign-levels-design.md §4C): chapters 06 沙田, 08 元朗, 09 荃灣, 13 觀塘,
// 16 灣仔, 17 油尖旺 and 18 中西區 - their story, stars and deadlines, the 國際XX中心 titles, the
// measures taken from the chapter's start, and the city facts the new objectives read.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const campaign = require('../campaign-chapters.js');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');
const specs = campaign.CAMPAIGN_CHAPTER_SPECS;
const P3 = ['ch06', 'ch08', 'ch09', 'ch13', 'ch16', 'ch17', 'ch18'];
const allTransit = { metro: 4000, bus: 2500, tram: 1500, ferry: 900, lightRail: 1200 };

// the city at the chapter's start (the base), and one that meets every first-star objective
const startSnapshot = { villageHouses: 200, taxCI: 10000, industrialCount: 100, monthIndex: 500 };
const starOne = {
  ch06: () => ({
    population: 36000, residentialByWealth: { L: 30, M: 50, H: 30, UH: 5 }, educationBasic: 0.65,
    buildings: { primary_school: 2, secondary_school: 1, hospital: 1, park_small: 3 },
    metroSurfaceRiders: 900, transit: { bus: 800 }, happiness: 0.62, monthlyNet: 400,
  }),
  ch08: () => ({
    population: 46000, unemploymentRate: 0.07, lightRailMetroInterchanges: 1, villageHouses: 170,
    buildings: { heritage_temple: 1 }, policies: { greenParks: true }, pollution: 30,
    busRoutes: 3, happiness: 0.6, monthlyNet: 300,
  }),
  ch09: () => ({
    residentialCount: 300, commercialCount: 150, industrialCount: 120, unemploymentRate: 0.06, population: 51000,
    transit: { metro: 2000, bus: 1500 }, offMap: { ferry: { 'central-western': 620 } },
    buildings: { police_station: 1, fire_station: 1, hospital: 1, primary_school: 1 }, monthlyNet: 800,
  }),
  ch13: () => ({
    population: 82000, metroElevatedRiders: 1200, transit: { bus: 900 }, policies: { industrialBuildingRevitalization: true },
    industrialCount: 70, promenadeLongest: 16, taxCI: 12500, surplusStreak: 3, trafficIndex: 0.48,
  }),
  ch16: () => ({
    buildings: { exhibition_center: 1, stock_exchange: 1, cultural_center: 1, space_museum: 1 }, gradeAOffices: 3,
    majorEvents: [{ id: 'menaConcert', monthIndex: 501 }, { id: 'tourEverywhere', monthIndex: 505 }, { id: 'fantasyFingHeungShing', monthIndex: 510 }],
    governmentHoldings: 2, hsi: 22000, transit: allTransit, tourismAppeal: 81, surplusStreak: 4,
  }),
  ch17: () => ({
    population: 91000, unemploymentRate: 0.05, commercialTax: 8200, policies: { nightBazaarWeekend: true }, crimeRate: 0.15,
    buildings: { cultural_center: 1, space_museum: 1, university: 1 }, transit: allTransit, tourismAppeal: 82, surplusStreak: 3,
  }),
  ch18: () => ({
    buildings: { stock_exchange: 1, legislative_council: 1 }, gradeAOffices: 6, governmentHoldings: 1, surplusStreak: 3,
    underseaTunnels: 1, tunnelBusRoutes: 1, transit: allTransit, happiness: 0.62,
    policies: { districtCouncilElection: true, legislativeCouncilElection: true, icac: true },
  }),
};

test('P3: seven chapters with their story in three languages, by known speakers, 24 months each', () => {
  P3.forEach((id) => {
    const spec = specs[id];
    assert.ok(campaign.isCampaignChapterPlayable(id), id);
    assert.equal(spec.startFile, `UI/campaign/${id}.json`);
    assert.equal(campaign.getCampaignDeadlineMonths(id), 24, `${id}: star 1 within 24 months`);
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
    ['zhHant', 'en', 'ja'].forEach((lang) => assert.ok(spec.fresh.cityName[lang], `${id} city name in ${lang}`));
  });
  Object.values(campaign.CAMPAIGN_SPEAKERS).forEach((speaker) => {
    if (speaker.portrait) assert.ok(fs.existsSync(path.join(ROOT, speaker.portrait)), speaker.portrait);
    else assert.ok(speaker.glyph, 'a speaker without art has a glyph');
  });
  // 中西區, the last: the queen's final order in, and her word out
  assert.ok(specs.ch18.intro.some((line) => line.speaker === 'queen'));
  assert.ok(specs.ch18.outro.some((line) => line.speaker === 'queen'));
});

test('P3: each chapter\'s first star is met by a city that does what the script asks, and not by an empty one', () => {
  P3.forEach((id) => {
    const run = campaign.createCampaignRun(id, 500, startSnapshot);
    const met = campaign.evaluateCampaignStar(specs[id], 0, starOne[id](), run);
    assert.equal(met.done, true, `${id}: ${JSON.stringify(met.items.filter((item) => !item.done).map((item) => item.id))}`);
    const empty = campaign.evaluateCampaignStar(specs[id], 0, { buildings: {}, transit: {} }, run);
    assert.equal(empty.done, false, id);
    assert.ok(empty.items.every((item) => typeof item.progress === 'string'), `${id} shows progress on an empty city`);
  });
});

test('P3: measured from the start - village houses kept, tax growth, industry kept, events since', () => {
  const item = (id, star, objectiveId, snapshot, base = startSnapshot) => campaign.evaluateCampaignStar(specs[id], star, snapshot,
    campaign.createCampaignRun(id, 500, base)).items.find((entry) => entry.id === objectiveId);
  // 元朗: 80% of the village houses kept
  assert.equal(item('ch08', 0, 'villages', { villageHouses: 159, buildings: { heritage_temple: 1 } }).done, false);
  assert.equal(item('ch08', 0, 'villages', { villageHouses: 160, buildings: { heritage_temple: 1 } }).done, true);
  // 觀塘: tax 20% up on the start; none counted without a start figure
  assert.equal(item('ch13', 0, 'taxGrowth', { taxCI: 11999 }).done, false);
  assert.equal(item('ch13', 0, 'taxGrowth', { taxCI: 12000 }).done, true);
  assert.equal(item('ch13', 0, 'taxGrowth', { taxCI: 12000 }).progress, '+20% / +20%');
  assert.equal(item('ch13', 0, 'taxGrowth', { taxCI: 99999 }, { ...startSnapshot, taxCI: 0 }).done, false);
  // 荃灣 二星: 70% of the industry kept
  const revitalise = (industrialCount) => item('ch09', 1, 'revitalise', { industrialCount, policies: { industrialBuildingRevitalization: true } }).done;
  assert.equal(revitalise(69), false);
  assert.equal(revitalise(70), true);
  // 灣仔: major events since the chapter began only
  const events = (list) => item('ch16', 0, 'majorEvents', { majorEvents: list }).done;
  assert.equal(events([{ monthIndex: 400 }, { monthIndex: 450 }, { monthIndex: 501 }, { monthIndex: 502 }]), false, 'two of them before');
  assert.equal(events([{ monthIndex: 500 }, { monthIndex: 501 }, { monthIndex: 502 }]), true);
  // 荃灣: homes, shops and industry each 15% to 60%
  const sectors = (r, c, i) => item('ch09', 0, 'sectors', { residentialCount: r, commercialCount: c, industrialCount: i, unemploymentRate: 0.05 }).done;
  assert.equal(sectors(70, 15, 15), false, 'all homes');
  assert.equal(sectors(50, 30, 20), true);
  // the base keeps the start, a stored run too
  const run = campaign.createCampaignRun('ch13', 500, startSnapshot);
  assert.deepEqual({ ...run.base, festivalHeldYear: undefined, festivalNoVenueYear: undefined },
    // buildingRepairs: P4 第 15 章's repairs since the start (welfare.js)
    { villageHouses: 200, taxCI: 10000, industrialCount: 100, buildingRepairs: 0, monthIndex: 500, festivalHeldYear: undefined, festivalNoVenueYear: undefined });
  const stored = campaign.normalizeCampaignRun(JSON.parse(JSON.stringify(run)));
  assert.equal(stored.base.taxCI, 10000);
  assert.equal(stored.base.monthIndex, 500);
});

test('P3: 國際XX中心 titles are held while their measure holds', () => {
  const titles = (snapshot) => campaign.evaluateCampaignStar(specs.ch16, 0, { buildings: {}, ...snapshot },
    campaign.createCampaignRun('ch16', 500, startSnapshot)).items.find((entry) => entry.id === 'titles');
  assert.equal(titles({}).progress, '0 / 2');
  assert.equal(titles({ tourismAppeal: 80 }).progress, '1 / 2', 'tourism');
  assert.equal(titles({ tourismAppeal: 80, buildings: { stock_exchange: 1 }, gradeAOffices: 2 }).progress, '1 / 2', 'an exchange without the towers');
  assert.equal(titles({ tourismAppeal: 80, buildings: { stock_exchange: 1 }, gradeAOffices: 3 }).done, true);
  assert.equal(titles({ buildings: { exhibition_center: 1 }, majorEvents: [] }).progress, '0 / 2', 'a centre with no event held');
});

test('P3 runtime: the snapshot reads wealth, villages, the railways, taxes, holdings, events and tunnels', () => {
  const context = vm.createContext({
    console: { warn() {}, error() {}, info() {}, log() {} },
    setTimeout: () => 0, clearTimeout() {},
    Promise, JSON, Object, Array, Number, String, Math, Set, Map, Date, Error,
    onGameClockEvent() {},
    HeungShingStorage: { request: async () => ({ ok: true, json: async () => ({ data: null }) }) },
    DENSITY_LOW: 1,
    city: {
      year: 1903, month: 6, campaign: null, educationBasicIndex: 0.7, educationHigherIndex: 0.3,
      lastBudgetSnapshot: { income: { commercialTax: 6000, industrialTax: 2500 } },
      stockMarket: { hsi: 21000 },
      council: { resolutionHistory: [
        { resolutionId: 'menaConcert', outcome: 'success', approvedMonthIndex: 99 },
        { resolutionId: 'menaConcert', outcome: 'cancelled', approvedMonthIndex: 100 },
        { resolutionId: 'fantasyFingHeungShing', summary: { outcome: 'success' }, completedMonthIndex: 101 },
        { resolutionId: 'roadRepairs', outcome: 'success', approvedMonthIndex: 101 },
      ] },
    },
    buildingData: {
      '1:1': { type: 'residential', wealthTier: 'M' },
      '1:2': { type: 'residential', wealthTier: 'H' },
      '1:3': { type: 'residential', wealthTier: 'L' },
      '5:5': { type: 'residential', wealthTier: 'UH', footprintRows: 2, footprintCols: 2 },
    },
    zoneDensityMap: Array.from({ length: 8 }, () => [1, 1, 1, 3, 1, 1, 1, 1]),
    getCityMonthIndex: () => 100,
    collectMedalSnapshot: () => ({ buildings: {}, transit: {} }),
    getCurrentLanguage: () => 'zhHant',
  });
  context.globalThis = context;
  vm.runInContext(source('campaign-chapters.js'), context);
  vm.runInContext(source('campaign.js'), context);
  const transport = {
    routes: [
      { id: 'r1', status: 'active', history: [{ passengers: 300 }] },
      { id: 'r2', status: 'active', history: [{ passengers: 300 }] },
    ],
  };
  context.getTransportExpansionState = () => transport;
  context.getMetroState = () => ({
    lines: [
      { id: 'm1', status: 'active', surface: true, history: [{ passengers: 700 }], stationIds: ['s1', 's2'] },
      { id: 'm2', status: 'active', history: [{ passengers: 400 }], stationIds: ['s3', 's4'] },
    ],
  });
  const metroStations = { s1: { row: 10, col: 10 }, s2: { row: 10, col: 30, elevated: true }, s3: { row: 50, col: 50 }, s4: { row: 60, col: 60 } };
  context.getMetroLineStations = (line) => line.stationIds.map((id) => metroStations[id]);
  context.getLightRailState = () => ({
    stations: [{ id: 'l1', row: 12, col: 11 }, { id: 'l2', row: 40, col: 40 }, { id: 'l3', row: 51, col: 52 }],
    lines: [{ id: 'lr1', status: 'active', stationIds: ['l1', 'l2'], history: [{ passengers: 80 }] }, { id: 'lr2', status: 'active', stationIds: ['l3', 'l2'], history: [] }],
  });
  context.getGovernmentPortfolio = () => ({ positions: { HSBC: { shares: 100 }, OLD: { shares: 0 } } });
  context.getUnderseaTunnels = () => [{}];
  context.isUnderseaTunnelTile = (row) => row === 7;
  context.getTransportRouteRuntime = (id) => ({ roundTripPath: id === 'r1' ? [{ row: 6, col: 1 }, { row: 7, col: 1 }] : [{ row: 1, col: 1 }] });
  const s = context.buildCampaignSnapshot();
  assert.deepEqual({ ...s.residentialByWealth }, { L: 1, M: 1, H: 1, UH: 1 });
  assert.equal(s.villageHouses, 2, 'one-tile homes on low-density land (1:3 is high density)');
  assert.equal(s.metroSurfaceRiders, 700);
  assert.equal(s.metroElevatedRiders, 700, 'a line with an elevated station');
  assert.equal(s.lightRailMetroInterchanges, 1, 'within three tiles of a served metro station, on a line with riders');
  assert.equal(s.taxCI, 8500);
  assert.equal(s.governmentHoldings, 1);
  assert.equal(s.hsi, 21000);
  assert.equal(JSON.stringify(s.majorEvents.map((e) => [e.id, e.monthIndex])), JSON.stringify([['menaConcert', 99], ['fantasyFingHeungShing', 101]]));
  assert.equal(s.underseaTunnels, 1);
  assert.equal(s.tunnelBusRoutes, 1);
  assert.equal(s.educationBasic, 0.7);
  assert.equal(s.monthIndex, 100);
});

test('P3: every chapter starts from a built town on its own district map, short of its first star', () => {
  const maps = source('hk-district-maps.js');
  // the first star's population target where the script sets one; 16 灣仔 and 18 中西區 ask for
  // buildings, events and policy instead, so they start from a full CBD
  const TARGET = { ch06: 35000, ch08: 45000, ch09: 50000, ch13: 80000, ch17: 90000 };
  P3.forEach((id) => {
    const spec = specs[id];
    const mapId = campaign.CAMPAIGN_CHAPTERS_BY_ID[id].mapId;
    assert.ok(maps.includes(`{"id":"${mapId}","centre"`), `${id} plays on ${mapId}`);
    const file = path.join(ROOT, spec.startFile);
    assert.ok(fs.existsSync(file), `${id} ships its start city`);
    // Norton 2026-11-19: prebuilt cities are fine, but on the district map as it is
    const start = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(start.format, 'heung-shing-campaign-start');
    assert.equal(start.chapterId, id);
    const save = start.save_data;
    assert.equal(save.city.districtProfileId, mapId, `${id} keeps the district's traits`);
    assert.deepEqual([save.mapWidth, save.mapHeight], [256, 256]);
    assert.equal(save.city.budget, spec.fresh.budget, `${id} starts with the chapter's money`);
    assert.ok(!save.city.campaign, `${id}: a start file starts clean`);
    const people = save.city.population;
    if (TARGET[id]) {
      // most of the way there, so a star lands inside the 24 months, but not given away
      assert.ok(people >= TARGET[id] * 0.6 && people <= TARGET[id] * 0.85, `${id}: ${people} of ${TARGET[id]}`);
    } else {
      assert.ok(people >= 45000 && people <= 65000, `${id}: ${people} people`);
    }
    // the camera opens on the town, not the hills or the sea
    const { centerRow, centerCol } = save.viewpoint;
    const near = Object.keys(save.buildingData).filter((key) => {
      const [row, col] = key.split(':').map(Number);
      return Math.abs(row - centerRow) <= 10 && Math.abs(col - centerCol) <= 10;
    });
    assert.ok(near.length >= 30, `${id}: ${near.length} buildings in view`);
  });
});
