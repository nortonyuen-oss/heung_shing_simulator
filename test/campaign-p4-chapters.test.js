'use strict';

// 《玩轉18區》 P4 phase 6 (docs/campaign-p4-design.md §13): chapters 10 離島, 11 葵青, 14 九龍城 and
// 15 深水埗 - their story in three languages, and their stars read from the systems P4 built.
const test = require('node:test');
const assert = require('node:assert/strict');
const campaign = require('../campaign-chapters.js');

const SPECS = campaign.CAMPAIGN_CHAPTER_SPECS;
const objective = (id, star, objectiveId) => SPECS[id].stars[star].objectives.find((o) => o.id === objectiveId);
const passes = (id, star, s, base = {}) => SPECS[id].stars[star].objectives.every((o) => o.check(s, base));

test('P4 chapters 10, 11, 14, 15: playable on their maps, 24 months, the story in three languages by known speakers', () => {
  const maps = { ch10: 'chek-lap-kok', ch11: 'tsing-yi', ch14: 'kowloon-city', ch15: 'sham-shui-po' };
  Object.entries(maps).forEach(([id, mapId]) => {
    assert.ok(campaign.isCampaignChapterPlayable(id), id);
    assert.equal(campaign.CAMPAIGN_CHAPTERS_BY_ID[id].mapId, mapId);
    assert.equal(campaign.getCampaignDeadlineMonths(id), 24);
    const spec = SPECS[id];
    assert.equal(spec.stars.length, 3);
    const lines = [...spec.intro, ...spec.outro, ...spec.failure, ...spec.events.flatMap((e) => e.lines)];
    const texts = lines.map((line) => line.text || line.card);
    spec.intro.filter((line) => line.hint).forEach((line) => texts.push(line.hint));
    spec.stars.forEach((star) => { texts.push(star.title); star.objectives.forEach((o) => texts.push(o.label)); });
    [spec.outroForum, ...spec.events.map((e) => e.forum)].forEach((forum) => {
      texts.push(forum.headline, forum.body, ...(forum.comments || [forum.comment]));
    });
    texts.forEach((text) => ['zhHant', 'en', 'ja'].forEach((lang) => assert.ok(text?.[lang], `${id}: ${JSON.stringify(text)} in ${lang}`)));
    lines.forEach((line) => { if (line.speaker) assert.ok(campaign.CAMPAIGN_SPEAKERS[line.speaker], `${id}: ${line.speaker}`); });
  });
});

test('P4 10 離島: flights with passengers, 東涌 grown, the line into town, the books and the night', () => {
  const s = {
    airportRoutes: 3, airportPassengers: 40000, population: 50000,
    buildings: { police_station: 1, fire_station: 1, hospital: 1, primary_school: 1, airport: 1 },
    offMap: { metro: { 'tsing-yi': 300 } }, busRoutes: 2, airportFees: 5000, airportCost: 1500,
    airportCurfew: true, trafficIndex: 0.4, happiness: 0.61, monthlyNet: 100,
  };
  assert.ok(passes('ch10', 0, s));
  assert.equal(objective('ch10', 0, 'flights').check({ ...s, airportPassengers: 39999 }), false);
  assert.equal(objective('ch10', 0, 'rail').check({ ...s, offMap: {} }), false, 'the line has to reach town');
  assert.equal(objective('ch10', 0, 'airportBooks').check({ ...s, airportFees: 1000 }), false);
  // the curfew, whatever the noise: the night's seats are the price of the 40,000
  assert.equal(objective('ch10', 0, 'noise').check({ ...s, airportCurfew: false, airportNoiseResidents: 0 }), false, 'the curfew itself');
  assert.equal(objective('ch10', 2, 'world').check({ airportRoutes: 6, airportLongHaul: 1 }), false, 'two long-haul');
  assert.equal(SPECS.ch10.events[0].when({ buildings: { buddha_statue: 1 } }), true, 'the cable car, once the Buddha stands');
});

test('P4 11 葵青: 150,000 people, 8,000 TEU, the trucks off the homes (under 10%), not all port, rail and books', () => {
  const s = {
    population: 150000, portThroughput: 8000, portTruckResidentialShare: 0.08,
    buildings: { police_station: 1, fire_station: 1, hospital: 1, secondary_school: 1, container_port: 2 },
    residentialCount: 500, commercialCount: 200, industrialCount: 300,
    transit: { metro: 5000 }, unemploymentRate: 0.05, surplusStreak: 3,
  };
  assert.ok(passes('ch11', 0, s));
  assert.equal(objective('ch11', 0, 'trucks').check({ ...s, portTruckResidentialShare: 0.1 }), false);
  assert.equal(objective('ch11', 0, 'notAllPort').check({ ...s, industrialCount: 2000 }), false, 'all port and factories');
  assert.equal(objective('ch11', 0, 'books').check({ ...s, surplusStreak: 2 }), false);
  assert.equal(SPECS.ch11.events[0].when({ portThroughput: 6000, portTruckResidentialShare: 0.13 }), true);
  assert.equal(SPECS.ch11.events[0].when({ portThroughput: 6000, portTruckResidentialShare: 0.05 }), false, 'trucks already round the homes');
});

test('P4 14 九龍城: 220,000 people, the cruise passengers into town, the 屯馬綫, the call-day roads, GigaBox', () => {
  const s = {
    population: 220000, cruiseCalls: 4, cruisePassengers: 12000, cruiseTransitShare: 0.45, cruiseCallsThisMonth: 4,
    cruisePeakTraffic: 0.5, transit: { metro: 10000 }, busRoutes: 3, gradeAOffices: 15,
    tourismAppeal: 60, crimeRate: 0.2, monthlyNet: 100,
  };
  assert.ok(passes('ch14', 0, s));
  assert.equal(objective('ch14', 0, 'cruise').check({ ...s, cruiseTransitShare: 0.25 }), false, 'by taxi and coach only');
  assert.equal(objective('ch14', 0, 'cruise').check({ ...s, cruiseCalls: 0 }), false, 'no ship has called');
  assert.equal(objective('ch14', 0, 'peak').check({ ...s, cruisePeakTraffic: 0.6 }), false);
  assert.equal(objective('ch14', 0, 'peak').check({ ...s, cruiseCallsThisMonth: 0 }), false, 'no calls, nothing managed');
  assert.equal(objective('ch14', 0, 'gigabox').check({ ...s, gradeAOffices: 7 }), false, 'the start town\'s seven');
  const film = SPECS.ch14.events.find((e) => e.id === 'filmShoot');
  assert.equal(film.when({ buildings: { cultural_center: 1 } }), true);
  assert.equal(film.scene, 'UI/campaign/events/kowloonWalledCity.webp');
  assert.ok(film.lines.some((line) => line.speaker === 'filmStar'), '古大樂 at last');
});

test('P4 15 深水埗: safety and welfare apart, the estates and the cheap homes kept, the 危樓 repaired, the books', () => {
  const s = {
    population: 240000, publicHousingResidents: 40000, residentialByWealth: { L: 300, M: 500, H: 200, UH: 0 },
    safetyIndex: 70, welfareBills: 3, welfareCoverage: 0.6, happiness: 0.65, buildingRepairs: 12, surplusStreak: 3,
  };
  const base = { buildingRepairs: 2, buildingRebuilds: 0 };
  assert.ok(passes('ch15', 0, s, base));
  assert.equal(objective('ch15', 0, 'repairs').check(s, { buildingRepairs: 3 }), false, 'only those since the chapter began');
  assert.equal(objective('ch15', 0, 'people').check({ ...s, residentialByWealth: { L: 100, M: 700, H: 200 } }), false, 'the cheap homes pushed out');
  assert.equal(objective('ch15', 0, 'welfare').check({ ...s, welfareBills: 2 }), false);
  assert.equal(objective('ch15', 0, 'safety').check({ ...s, safetyIndex: 69 }), false);
  // police alone, or welfare alone, is not the star (劇本 第二事件)
  assert.equal(passes('ch15', 0, { ...s, welfareBills: 0, welfareCoverage: 0 }, base), false);
  assert.equal(passes('ch15', 0, { ...s, safetyIndex: 40 }, base), false);
  const event = SPECS.ch15.events[0];
  assert.equal(event.when({ buildingRepairs: 4, buildingRebuilds: 0 }, { base: { buildingRepairs: 1, buildingRebuilds: 0 } }), true);
  assert.equal(event.when({ buildingRepairs: 2, buildingRebuilds: 1 }, { base: { buildingRepairs: 1, buildingRebuilds: 0 } }), false);
  assert.ok(SPECS.ch15.outro.some((line) => line.speaker === 'queen'), 'Her Majesty\'s message');
});

test('P4 start towns: 10, 11, 14 and 15 start built on their maps, short of their first star', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ROOT = path.resolve(__dirname, '..');
  const load = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, SPECS[id].startFile), 'utf8'));
  const types = (save) => Object.values(save.buildingData).map((b) => b.type);
  const count = (save, type) => types(save).filter((t) => t === type).length;
  // [chapter, population band (70-80% of star 1's, give or take), map]
  [['ch10', 33000, 40000, 'chek-lap-kok'], ['ch11', 105000, 120000, 'tsing-yi'], ['ch14', 154000, 176000, 'kowloon-city'], ['ch15', 165000, 192000, 'sham-shui-po']]
    .forEach(([id, min, max, mapId]) => {
      const start = load(id);
      assert.equal(start.format, 'heung-shing-campaign-start');
      assert.equal(start.chapterId, id);
      const save = start.save_data;
      assert.equal(save.city.districtProfileId, mapId);
      assert.deepEqual([save.mapWidth, save.mapHeight], [256, 256]);
      assert.equal(save.city.budget, SPECS[id].fresh.budget);
      assert.ok(!save.city.campaign, `${id} starts clean`);
      assert.ok(!(save.city.epidemicSeverity > 0), `${id}: no epidemic at the start`);
      assert.ok(save.city.population >= min && save.city.population <= max, `${id}: ${save.city.population} people`);
      const { centerRow, centerCol } = save.viewpoint;
      const near = Object.keys(save.buildingData).filter((key) => {
        const [row, col] = key.split(':').map(Number);
        return Math.abs(row - centerRow) <= 10 && Math.abs(col - centerCol) <= 10;
      });
      assert.ok(near.length >= 30, `${id}: ${near.length} buildings in view`);
    });
  // 10: the airport flying three routes; no fire station yet, no line into town
  const ch10 = load('ch10').save_data;
  assert.equal(count(ch10, 'airport'), 1);
  assert.equal(Object.keys(ch10.city.airportRoutes.routes).length, 3);
  assert.equal(count(ch10, 'fire_station'), 0, 'the player brings fire cover');
  // 11: two container ports working
  assert.equal(count(load('ch11').save_data, 'container_port'), 2);
  // 14: the Kai Tak cruise terminal stands on the runway, not yet open (no road to it)
  const ch14 = load('ch14').save_data;
  const terminal = Object.entries(ch14.buildingData).find(([, b]) => b.type === 'cruise_terminal');
  assert.ok(terminal, 'the terminal');
  const [tr, tc] = terminal[0].split(':').map(Number);
  // mapData is saved run-length coded, row-major: [value, count, value, count, ...]; ROAD is 2 (main.js)
  assert.equal(ch14.mapData.encoding, 'rle-row-major-v1');
  const tiles = [];
  for (let i = 0; i < ch14.mapData.runs.length; i += 2) for (let n = 0; n < ch14.mapData.runs[i + 1]; n++) tiles.push(ch14.mapData.runs[i]);
  assert.equal(tiles.length, 256 * 256);
  assert.ok(tiles.filter((v) => v === 2).length > 1000, 'the town has roads');
  const road = (r, c) => tiles[r * 256 + c] === 2;
  let roadNear = false;
  for (let r = tr - 2; r < tr + 8; r++) for (let c = tc - 2; c < tc + 8; c++) if ((r < tr || r >= tr + 6 || c < tc || c >= tc + 6) && road(r, c)) roadNear = true;
  assert.equal(roadNear, false, 'no road to the terminal yet (劇本: 郵輪碼頭尚未啟用)');
  // 15: the old town - homes decades old, some 危樓, one police station
  const ch15 = load('ch15').save_data;
  const homes = Object.values(ch15.buildingData).filter((b) => b.type === 'residential');
  const dangerous = homes.filter((b) => b.condition < 30).length;
  assert.ok(dangerous >= 15 && dangerous <= 40, `${dangerous} 危樓`);
  assert.ok(homes.filter((b) => Number.isFinite(b.builtMonthIndex)).every((b) => b.builtMonthIndex <= ch15.city.year * 12 + ch15.city.month));
  assert.equal(count(ch15, 'police_station'), 1, 'the streets little watched');
  assert.ok(Math.round(100 - ch15.city.crimeRateIndex * 100) <= 40, 'safety near 35 at the start');
});
