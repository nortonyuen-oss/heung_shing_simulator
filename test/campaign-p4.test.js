'use strict';

// 《玩轉18區》 P4 (docs/campaign-p4-design.md): the chapters that needed new systems. Chapter 05
// 黃大仙《有求必應》 so far - 公屋 and 居屋 beside private homes (housing-types.js), 黃大仙祠 with a
// bus stop or station beside it, and the services the estates lack at the start.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const campaign = require('../campaign-chapters.js');
const housing = require('../housing-types.js');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');
const CH05 = campaign.CAMPAIGN_CHAPTER_SPECS.ch05;
const objective = (star, id) => CH05.stars[star].objectives.find((o) => o.id === id);

// a city that meets every first-star objective
const starOne = () => ({
  population: 61000, publicSectorShare: 0.5, publicHousingResidents: 20000, hosResidents: 10500,
  buildings: { grand_temple: 1, public_market: 2, heritage_temple: 1 }, templeTransit: true, templeFireCover: true,
  transit: { metro: 1200, bus: 900 },
  homeCover: { police: 0.7, fire: 0.65, health: 0.6, school: 0.62 },
  happiness: 0.61, monthlyNet: 500,
});

test('P4 05 黃大仙: playable on the 九龍城 map\'s north, 24 months for a metro, the script\'s three stars', () => {
  assert.ok(campaign.isCampaignChapterPlayable('ch05'));
  assert.equal(campaign.CAMPAIGN_CHAPTERS_BY_ID.ch05.mapId, 'kowloon-city');
  assert.equal(campaign.getCampaignDeadlineMonths('ch05'), 24);
  assert.deepEqual(CH05.stars.map((star) => star.title.zhHant), ['萬家燈火', '新春頭炷香', '有求必應']);
  assert.deepEqual(CH05.stars[0].objectives.map((o) => o.id), ['mixed', 'temple', 'transit', 'services', 'balance']);
  // every line and label in three languages
  const texts = [
    ...CH05.intro, ...CH05.outro, ...CH05.failure, ...CH05.events.flatMap((e) => e.lines),
  ].map((line) => line.text || line.card);
  CH05.stars.forEach((star) => { texts.push(star.title); star.objectives.forEach((o) => texts.push(o.label)); });
  texts.push(CH05.events[0].forum.headline, CH05.outroForum.headline, ...CH05.outroForum.comments);
  texts.forEach((text) => ['zhHant', 'en', 'ja'].forEach((lang) => assert.ok(text?.[lang], `${JSON.stringify(text)} in ${lang}`)));
  CH05.intro.concat(CH05.outro, CH05.failure, CH05.events[0].lines).forEach((line) => {
    if (line.speaker) assert.ok(campaign.CAMPAIGN_SPEAKERS[line.speaker], line.speaker);
  });
});

test('P4 05 黃大仙: star one needs the mix, the temple linked, metro and buses, the services and the books', () => {
  const s = starOne();
  CH05.stars[0].objectives.forEach((o) => assert.ok(o.check(s, {}), o.id));
  const mixed = objective(0, 'mixed');
  assert.equal(mixed.check({ ...s, publicSectorShare: 0.29 }, {}), false, 'too few estates');
  assert.equal(mixed.check({ ...s, publicSectorShare: 0.71 }, {}), false, 'too few private homes');
  assert.equal(mixed.check({ ...s, publicSectorShare: 0.3 }, {}), true);
  assert.equal(mixed.check({ ...s, population: 59999 }, {}), false);
  assert.equal(objective(0, 'temple').check({ ...s, templeTransit: false }, {}), false, 'a temple with no bus or train beside it');
  assert.equal(objective(0, 'temple').check({ ...s, buildings: {} }, {}), false);
  const services = objective(0, 'services');
  assert.equal(services.check({ ...s, homeCover: { ...s.homeCover, fire: 0.59 } }, {}), false, 'coverage, not just a station');
  assert.equal(services.check({ ...s, buildings: { ...s.buildings, public_market: 1 } }, {}), false, 'two markets');
  assert.match(services.progress(s, {}), /🚓 70% · 🚒 65% · 🏥 60% · 🏫 62% · 🛒 2 \/ 2/);
});

test('P4 05 黃大仙: the New Year incense, the estates, and the long haul', () => {
  const s = { ...starOne(), festivalHeldYear: { lunarNewYear: 1903 }, publicHousingResidents: 26000, unemploymentRate: 0.05, happiness: 0.66 };
  const base = { festivalHeldYear: { lunarNewYear: 1902 } };
  CH05.stars[1].objectives.forEach((o) => assert.ok(o.check(s, base), o.id));
  assert.equal(objective(1, 'firstIncense').check(s, { festivalHeldYear: { lunarNewYear: 1903 } }), false, 'one held since the chapter began');
  assert.equal(objective(1, 'crowds').check({ ...s, templeFireCover: false }, base), false);
  const later = { ...s, publicHousingResidents: 41000, trafficIndex: 0.4, crimeRate: 0.25, happiness: 0.76, funds: 310000 };
  CH05.stars[2].objectives.forEach((o) => assert.ok(o.check(later, base), o.id));
  assert.equal(objective(2, 'bigEstates').check({ ...later, publicSectorShare: 0.8 }, base), false, 'still a mix');
  assert.equal(objective(2, 'heritage').check({ ...later, buildings: { grand_temple: 1 } }, base), false);
  assert.equal(CH05.events[0].when({ buildings: { grand_temple: 1 } }), true, 'the first fortune stick when the temple stands');
});

test('P4 05 黃大仙: the start town on the district map, estates and private homes, short of its first star', () => {
  const file = path.join(ROOT, CH05.startFile);
  assert.ok(fs.existsSync(file), 'ch05 ships its start city');
  const start = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(start.format, 'heung-shing-campaign-start');
  assert.equal(start.chapterId, 'ch05');
  const save = start.save_data;
  assert.equal(save.city.districtProfileId, 'kowloon-city');
  assert.deepEqual([save.mapWidth, save.mapHeight], [256, 256]);
  assert.equal(save.city.budget, CH05.fresh.budget);
  assert.ok(!save.city.campaign, 'a start file starts clean');
  assert.ok(!(save.city.epidemicSeverity > 0), 'no epidemic under way at the start');
  // about 70-80% of 60,000, as the P3 towns are of theirs
  assert.ok(save.city.population >= 36000 && save.city.population <= 51000, `${save.city.population} people`);
  // the town on the map's north (樂富, 黃大仙, 新蒲崗), clear of 啟德
  const rows = Object.keys(save.buildingData).map((key) => Number(key.split(':')[0]));
  assert.ok(Math.max(...rows) < 85, 'nothing built south into 九龍城');
  // 公屋 and 居屋 land, and homes of each type on it
  const zones = housing.normalizeHousingZones(save.city.housingZones, 256, 256);
  const codes = Object.values(zones);
  assert.ok(codes.filter((code) => code === 1).length >= 45 && codes.filter((code) => code === 2).length >= 45, '公屋 and 居屋 land');
  const residents = housing.countHousingTypeResidents(save.buildingData);
  assert.ok(residents.public > 0 && residents.hos > 0 && residents.private > 0);
  const share = (residents.public + residents.hos) / residents.total;
  assert.ok(share >= 0.35 && share <= 0.65, `public sector ${Math.round(share * 100)}%: inside the band, with room both ways`);
  // the services the script says are short: no temple yet, and no fire cover where it will stand
  const types = Object.values(save.buildingData).map((b) => b.type);
  assert.ok(!types.includes('grand_temple'), 'the player builds 黃大仙祠');
  ['police_station', 'fire_station', 'hospital', 'public_market', 'primary_school'].forEach((type) => assert.ok(types.includes(type), type));
  // the camera opens on the town
  const { centerRow, centerCol } = save.viewpoint;
  const near = Object.keys(save.buildingData).filter((key) => {
    const [row, col] = key.split(':').map(Number);
    return Math.abs(row - centerRow) <= 10 && Math.abs(col - centerCol) <= 10;
  });
  assert.ok(near.length >= 30, `${near.length} buildings in view`);
});

test('P4 05 黃大仙 in the game: the snapshot reads the mix, the temple\'s links and the services\' cover', () => {
  const runtime = source('campaign.js');
  assert.match(runtime, /\.\.\.collectHousingFacts\(\)/);
  assert.match(runtime, /publicSectorShare: total > 0 \? publicSector \/ total : 0/);
  assert.match(runtime, /CAMPAIGN_TEMPLE_TRANSIT_TILES = 6/);
  assert.match(runtime, /homeCover/);
  assert.match(source('inspect-panel.js'), /zone\.housingLotTip\./);
});
