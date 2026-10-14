const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { layoutChristmasDecorations, CHRISTMAS_PROMENADE_CYCLE, orderFestivalPromenadeRuns, FESTIVAL_BUILDING_SPOTS } = require('../festival-venues.js');
const { getFestivalSpriteScale } = require('../festival-sprites.js');
const { FESTIVAL_PARTS_BY_ID } = require('../festival-assets.js');

const ROOT = path.resolve(__dirname, '..');

// festivals.js (with the calendar it reads) in a sandbox holding a city
function festivalsSandbox(city) {
  const context = vm.createContext({ city, console });
  ['festival-lunar-data.js', 'festival-calendar.js', 'festivals.js'].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  });
  return context;
}

test('the programme: Christmas is up all month and peaks from 18:00 through the small hours', () => {
  const ctx = festivalsSandbox({ festivals: null });
  const phase = (m) => vm.runInContext(`getFestivalPhase('christmas', ${m})`, ctx);
  assert.equal(phase(6 * 60), 'open');
  assert.equal(phase(17 * 60 + 59), 'open');
  assert.equal(phase(18 * 60), 'peak');
  assert.equal(phase(2 * 60), 'peak', 'past midnight is still the night of the festival');
  assert.equal(vm.runInContext("getFestivalPhase('dragonBoat', 600)", ctx), 'open', 'daytime dragon boat programme');
});

test('active festivals: the month, the switches and 六四 from 1990', () => {
  const city = { festivals: null, population: 0 };
  const ctx = festivalsSandbox(city);
  const active = (year, month) => vm.runInContext(`getActiveFestivals({ year: ${year}, month: ${month}, minuteOfDay: 1200 }).map((a) => a.id)`, ctx);
  assert.deepEqual([...active(2026, 12)], ['christmas']);
  assert.deepEqual([...active(2026, 6)], ['june4', 'dragonBoat', 'bunHill']);
  assert.deepEqual([...active(1985, 6)].includes('june4'), false);
  vm.runInContext("setFestivalEnabled('christmas', false)", ctx);
  assert.deepEqual([...active(2026, 12)], []);
  vm.runInContext("setFestivalEnabled('christmas', true); setFestivalsEnabled(false)", ctx);
  assert.deepEqual([...active(2026, 6)], [], 'the master switch takes 六四 too');
  assert.equal(vm.runInContext('isChristmasLightingMonth(12)', ctx), false, 'the Christmas walls go off with it');
  vm.runInContext('setFestivalsEnabled(true)', ctx);
  assert.equal(vm.runInContext('isChristmasLightingMonth(12)', ctx), true);
  assert.equal(vm.runInContext('isChristmasLightingMonth(11)', ctx), false);
});

test('settling a government festival: pays once, takes the month effect, records the year', () => {
  const city = { festivals: null, population: 100000 };
  const ctx = festivalsSandbox(city);
  const spent = [];
  const effects = [];
  ctx.io = {
    hasVenue: true,
    spend: (amount) => { spent.push(amount); return true; },
    addEffect: (sourceId, months, modifiers) => effects.push({ sourceId, months, modifiers }),
  };
  const first = vm.runInContext("settleFestivalMonth('christmas', 2026, io)", ctx);
  assert.equal(first.outcome, 'held');
  assert.deepEqual(spent, [1800], 'standard: 800 + 100,000 x 0.01');
  assert.equal(effects.length, 1);
  assert.equal(effects[0].sourceId, 'festival:christmas:2026');
  assert.equal(effects[0].modifiers.attractiveness, 3);
  assert.equal(vm.runInContext("settleFestivalMonth('christmas', 2026, io)", ctx), null, 'once a year');
  assert.equal(spent.length, 1);

  // 唔辦: nothing paid, nothing gained
  vm.runInContext("setFestivalTier('christmas', 'skip')", ctx);
  assert.equal(vm.runInContext("settleFestivalMonth('christmas', 2027, io)", ctx).outcome, 'skipped');
  assert.equal(spent.length, 1);

  // the treasury cannot pay
  vm.runInContext("setFestivalTier('christmas', 'grand')", ctx);
  ctx.poor = { ...ctx.io, spend: () => false };
  assert.equal(vm.runInContext("settleFestivalMonth('christmas', 2028, poor)", ctx).outcome, 'skipped');
  assert.equal(effects.length, 1);

  // no venue, then one is built that month: settled again
  ctx.none = { ...ctx.io, hasVenue: false };
  assert.equal(vm.runInContext("settleFestivalMonth('christmas', 2029, none)", ctx).outcome, 'noVenue');
  assert.equal(vm.runInContext("settleFestivalMonth('christmas', 2029, none)", ctx), null);
  assert.equal(vm.runInContext("settleFestivalMonth('christmas', 2029, io)", ctx).outcome, 'held');
  assert.equal(vm.runInContext("getCityFestivalState().history.filter((e) => e.year === 2029).length", ctx), 1);

  // a community festival is never settled (no money, no effects)
  assert.equal(vm.runInContext("settleFestivalMonth('june4', 2026, io)", ctx), null);
  assert.deepEqual({ ...vm.runInContext("getFestivalEffects('june4', null)", ctx) }, {});
});

test('Christmas layout: one piece every few odd tiles of a promenade, landward, never on a pier or by a bridge', () => {
  const promenadeTiles = [];
  for (let col = 0; col < 20; col++) promenadeTiles.push([0, col]);
  const ctx = {
    tier: 'standard',
    promenadeTiles,
    seaSideOf: () => 's',
    isPier: (row, col) => col === 9,
    isNearBridge: (row, col) => col === 17,
  };
  const placements = layoutChristmasDecorations(ctx);
  const cols = placements.map((p) => p.col);
  // row + col odd and (row + col - 1) / 2 even: col 1, 5, 9 (pier), 13, 17 (bridge)
  assert.deepEqual(cols, [1, 5, 13]);
  placements.forEach((p) => {
    assert.equal(p.mode, 'tile');
    assert.deepEqual(p.offsets, [['n', 4]], 'moved toward the land');
    assert.equal(p.alongDir, 'e');
    assert.ok(FESTIVAL_PARTS_BY_ID[p.partId], p.partId);
  });
  // the pieces cycle
  assert.equal(new Set(placements.map((p) => p.partId)).size, 3);
  assert.equal(CHRISTMAS_PROMENADE_CYCLE.length, 4);
  // the tiers: grand every odd tile, basic every eighth, skip none
  assert.equal(layoutChristmasDecorations({ ...ctx, isPier: () => false, isNearBridge: () => false, tier: 'grand' }).length, 10);
  assert.equal(layoutChristmasDecorations({ ...ctx, isPier: () => false, isNearBridge: () => false, tier: 'basic' }).length, 3);
  assert.equal(layoutChristmasDecorations({ ...ctx, tier: 'skip' }).length, 0);
});

test('Christmas layout: a staircase coast is walked in order, so it gets decorations too', () => {
  // the shore of a generated coast: right, up, right, up ... (row + col alternates between two values)
  const tiles = [];
  for (let i = 0; i < 12; i++) tiles.push([20 - Math.floor(i / 2), 5 + Math.ceil(i / 2)]);
  const runs = orderFestivalPromenadeRuns([...tiles].reverse());
  assert.equal(runs.length, 1);
  assert.equal(runs[0].length, 12);
  // walked from an end, each step to an edge neighbour
  runs[0].slice(1).forEach(([r, c], i) => {
    const [pr, pc] = runs[0][i];
    assert.equal(Math.abs(r - pr) + Math.abs(c - pc), 1);
  });
  const placements = layoutChristmasDecorations({ tier: 'standard', promenadeTiles: tiles, seaSideOf: () => 's' });
  assert.equal(placements.length, 3, 'six odd tiles, every second one');
  // two runs apart stay apart
  assert.equal(orderFestivalPromenadeRuns([[0, 0], [0, 1], [5, 5], [5, 6]]).length, 2);
});

test('Christmas layout: the tree on the open square of each Victoria Park', () => {
  const placements = layoutChristmasDecorations({
    tier: 'basic',
    parks: [{ id: '4:6', textureKey: 'park_flagship_victoria' }, { id: '1:1', textureKey: 'someOtherPark' }],
  });
  assert.equal(placements.length, 1);
  assert.equal(placements[0].mode, 'building');
  assert.equal(placements[0].buildingId, '4:6');
  assert.equal(placements[0].partId, 'christmasTree');
  assert.deepEqual([...placements[0].point], [585, 738]);
});

test('real size: height in metres at 5 px each, or length along a diagonal at 2.5 px each', () => {
  const meta = { anchor: { x: 100, y: 500 }, top: 100, left: 20, right: 420 };
  // 15 m tall from 400 px of art: 75 screen px
  assert.equal(getFestivalSpriteScale(meta, { heightM: 15 }, 1) * 400, 75);
  // through a staged texture shrunk to half, the same on screen
  assert.equal(getFestivalSpriteScale(meta, { heightM: 15 }, 0.5) * 200, 75);
  // 16 m long from 400 px of width: 40 screen px
  assert.equal(getFestivalSpriteScale(meta, { lengthM: 16 }, 1) * 400, 40);
});

test('Christmas at the malls: a tree at the big malls\' doors, the gift display at the towers, none at the markets', () => {
  const malls = [
    { id: '10:10', modelKey: 'commercialBuilding4-01-H.png' },   // the atrium mall
    { id: '20:20', modelKey: 'commercialBuilding3-01-H.png' },   // an office tower
    { id: '30:30', modelKey: 'commercialBuilding4-03-L.png' },   // a street market block
  ];
  const standard = layoutChristmasDecorations({ tier: 'standard', malls });
  assert.deepEqual(standard.map((p) => [p.buildingId, p.partId]), [['10:10', 'christmasTree'], ['20:20', 'christmasGiftArch']]);
  assert.equal(standard[0].mode, 'building');
  // a modest year dresses only the big malls
  assert.deepEqual(layoutChristmasDecorations({ tier: 'basic', malls }).map((p) => p.buildingId), ['10:10']);
  // every spot names a model file that exists, with a point inside its art
  Object.values(FESTIVAL_BUILDING_SPOTS).forEach((entry) => {
    assert.ok(fs.existsSync(path.join(ROOT, entry.path)), entry.path);
    Object.values(entry.spots).forEach(([x, y]) => assert.ok(x > 0 && x < 1024 && y > 0 && y < 1200, `${entry.path} ${x},${y}`));
  });
});

test('新春: setup, open, the evening peak, closed at three; lion dances the morning after', () => {
  const ctx = festivalsSandbox({ festivals: null, population: 0 });
  const phase = (m) => vm.runInContext(`getFestivalPhase('lunarNewYear', ${m})`, ctx);
  assert.equal(phase(7 * 60), 'setup');
  assert.equal(phase(12 * 60), 'open');
  assert.equal(phase(21 * 60), 'peak');
  assert.equal(phase(2 * 60), 'peak');
  assert.equal(phase(4 * 60), null, 'packed up by three');
  // 2026: 除夕 16 February, so the market is February's and the lions March's morning
  const active = (month, minute) => JSON.stringify(vm.runInContext(`getActiveFestivals({ year: 2026, month: ${month}, minuteOfDay: ${minute} })`, ctx));
  assert.match(active(2, 12 * 60), /lunarNewYear","phase":"open/);
  assert.match(active(3, 8 * 60), /lunarNewYear","phase":"after/);
  assert.doesNotMatch(active(3, 14 * 60), /lunarNewYear/, 'the lions are done by noon');
  // the stall auction: more for more stalls, more in a good economy
  assert.equal(vm.runInContext("getFestivalIncome('lunarNewYear', 10, 50)", ctx), 10 * (80 + 2.4 * 50));
  assert.ok(vm.runInContext("getFestivalIncome('lunarNewYear', 10, 90)", ctx) > vm.runInContext("getFestivalIncome('lunarNewYear', 10, 20)", ctx));
  assert.equal(vm.runInContext("getFestivalIncome('christmas', 10, 50)", ctx), 0);
});

test('新春 layout: the main fair on one Victoria Park pitch, small ones elsewhere, temples at the peak', () => {
  const { layoutLunarNewYear, getLnyRows, FESTIVAL_BUILDING_SPOTS } = require('../festival-venues.js');
  const base = {
    tier: 'standard', seed: 's', soldShare: 1,
    parks: [{ id: '1:1', textureKey: 'park_flagship_victoria' }, { id: '9:9', textureKey: 'park_flagship_victoria' }],
    courts: [{ id: '5:5', textureKey: 'sports_ground_2x2' }],
    temples: [{ id: '7:7', textureKey: 'heritage_temple_2x2' }],
    malls: [{ id: '3:3', modelKey: 'commercialBuilding4-01-H.png' }, { id: '4:4', modelKey: 'commercialBuilding3-01-H.png' }],
  };
  const count = (ps, f) => ps.filter(f).length;
  const peak = layoutLunarNewYear({ ...base, phase: 'peak' });
  const mainCount = count(peak, (p) => p.stall && p.buildingId === '1:1');
  assert.ok(mainCount >= 40, `the main fair is big (${mainCount})`);
  assert.ok(count(peak, (p) => p.stall && p.buildingId === '9:9') < mainCount / 2, 'a smaller one in the other park');
  assert.ok(count(peak, (p) => p.stall && p.buildingId === '5:5') >= 16, 'a court has a proper market');
  // the main fair spreads over the park's areas, not one pitch, zoned: flowers on the pitch, dry goods on the square
  const main = peak.filter((p) => p.stall && p.buildingId === '1:1');
  assert.ok(new Set(main.map((p) => p.id.split(':')[4])).size >= 4);
  assert.ok(main.filter((p) => p.id.includes(':pitch:')).every((p) => /Blossoms|Peach|Kumquat|Orchids|Narcissus|Flowers/.test(p.partId)));
  assert.ok(main.some((p) => p.id.includes(':plaza:') && /Laisee|Couplets|Pinwheels|Toys|Gifts/.test(p.partId)));
  assert.ok(main.some((p) => p.partId === 'lnyStallSnacks'), 'a row of food stalls');
  // stalls in a row stand shoulder to shoulder: 2 m apart in the art
  const spot = FESTIVAL_BUILDING_SPOTS.park_flagship_victoria;
  const row = main.filter((p) => /:pitch:0:/.test(p.id)).map((p) => p.point);
  const step = Math.hypot(row[1][0] - row[0][0], row[1][1] - row[0][1]) / spot.pxPerM;
  assert.ok(Math.abs(step - 2) < 0.15, `${step} m apart`);
  // fewer in a modest year, more in a grand one
  const rows = (tier) => getLnyRows(spot.areas.pitch, spot.pxPerM, tier).reduce((n, r) => n + r.v.length, 0);
  assert.ok(rows('basic') < rows('standard') && rows('standard') <= rows('grand'));
  assert.equal(count(peak, (p) => p.partId === 'lnyGate'), 1, 'one gate, at the main fair');
  assert.equal(count(peak, (p) => p.partId === 'lnyStage' && p.mirrored), 1, 'the stage, mirrored');
  assert.equal(count(peak, (p) => p.buildingId === '7:7'), 3, 'the temple: lions, drum, incense');
  // the player's pick of main venue
  assert.equal(count(layoutLunarNewYear({ ...base, phase: 'peak', mainVenue: '9:9' }), (p) => p.stall && p.buildingId === '9:9'), mainCount);
  // setup: bare tents and trolleys, no temple yet
  const setup = layoutLunarNewYear({ ...base, phase: 'setup' });
  assert.ok(setup.filter((p) => p.stall).every((p) => p.partId === 'lnyStallEmpty'));
  assert.ok(count(setup, (p) => /Trolley/.test(p.partId)) === 2 && count(setup, (p) => p.buildingId === '7:7') === 0);
  // a weak economy: some stalls stay bare
  const weak = layoutLunarNewYear({ ...base, phase: 'open', soldShare: 0.5 });
  assert.ok(count(weak, (p) => p.stall && !p.sold) > 0 && count(weak, (p) => p.stall && p.sold) > 0);
  assert.ok(weak.filter((p) => p.stall && !p.sold).every((p) => p.partId === 'lnyStallEmpty'));
  // the morning after: lions at the big malls' doors only
  const after = layoutLunarNewYear({ ...base, phase: 'after' });
  assert.deepEqual([...new Set(after.map((p) => p.buildingId))], ['3:3']);
  assert.equal(layoutLunarNewYear({ ...base, tier: 'skip', phase: 'peak' }).length, 0);
  // every part named is a baked part
  [...peak, ...setup, ...after].forEach((p) => assert.ok(FESTIVAL_PARTS_BY_ID[p.partId], p.partId));
});

test('六四: a quiet remembrance on one Victoria Park, people arriving from 19:00 and gone by 22:30', () => {
  const { layoutJune4, getJune4Presence } = require('../festival-venues.js');
  assert.equal(getJune4Presence(18 * 60 + 59), 0);
  assert.ok(getJune4Presence(19 * 60 + 30) > 0.4 && getJune4Presence(19 * 60 + 30) < 0.6, 'half arrived by 19:30');
  assert.equal(getJune4Presence(21 * 60), 1);
  assert.ok(getJune4Presence(22 * 60 + 15) < 0.6);
  assert.equal(getJune4Presence(22 * 60 + 30), 0);
  const parks = [{ id: '1:1', textureKey: 'park_flagship_victoria' }, { id: '9:9', textureKey: 'park_flagship_victoria' }];
  const at = (minute, population) => layoutJune4({ parks, minute, population, seed: 's' });
  const full = at(21 * 60, 400000);
  assert.ok(full.every((p) => p.buildingId === '1:1'), 'one park only');
  assert.ok(full.length > at(21 * 60, 20000).length, 'a bigger city, a bigger gathering');
  assert.ok(at(19 * 60 + 20, 400000).length < full.length, 'still arriving');
  assert.equal(at(21 * 60, 400000).length, full.length, 'the same every time');
  // the pillar, candles and seated people; nothing of a rally, nobody standing
  assert.ok(full.some((p) => p.partId === 'june4Pillar') && full.some((p) => /Candles/.test(p.partId)));
  assert.ok(full.every((p) => !/Standing|Stools|Stone|Wreath/.test(p.partId)));
  full.forEach((p) => {
    assert.ok(FESTIVAL_PARTS_BY_ID[p.partId]?.festival === 'june4', p.partId);
  });
  assert.deepEqual(layoutJune4({ parks: [], minute: 21 * 60, population: 1e6, seed: 's' }), [], 'no Victoria Park, nothing');
});

test('六四 says nothing: no switch, no tier, no money, no notice, no news', () => {
  const ctx = festivalsSandbox({ festivals: null, population: 500000 });
  assert.equal(vm.runInContext("isQuietFestival('june4')", ctx), true);
  assert.equal(vm.runInContext("FESTIVAL_SWITCHABLE_IDS.includes('june4')", ctx), false, 'not in the calendar window');
  assert.equal(vm.runInContext("getFestivalTier('june4')", ctx), null);
  assert.equal(vm.runInContext("getFestivalCost('june4', 'grand', 500000)", ctx), 0);
  assert.deepEqual({ ...vm.runInContext("getFestivalEffects('june4', null)", ctx) }, {});
  assert.equal(vm.runInContext("settleFestivalMonth('june4', 2026, { hasVenue: true })", ctx), null);
  // the notices skip it (festival-ui.js) and nothing writes news, forum posts or i18n text for it
  const ui = fs.readFileSync(path.join(ROOT, 'festival-ui.js'), 'utf8');
  assert.match(ui, /phase !== 'peak' \|\| isQuietFestival\(id\)/);
  const i18n = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
  assert.doesNotMatch(i18n, /festival\.(notice|toast[^']*|name)\.june4/);
  ['newspaper.js', 'council-news.js', 'hud-ticker.js', 'sim-news-events.js'].forEach((file) => {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, file), 'utf8'), /june4|六四/, `${file} must not mention it`);
  });
});

test('盂蘭: 燒街衣 in the oldest districts, the 勝會 with its empty front row, effigies burned at the end', () => {
  const { layoutYulan, pickYulanStreets } = require('../festival-venues.js');
  const slots = [];
  for (let r = 0; r < 60; r++) for (let c = 0; c < 30; c++) {
    const district = r < 15 ? 'old' : r < 30 ? 'mid' : r < 45 ? 'new' : 'newest';
    slots.push({ row: r, col: c, side: 'n', half: 'e', district, age: { old: 400, mid: 200, new: 50, newest: 0 }[district] });
  }
  const streets = pickYulanStreets(slots, 's');
  assert.ok(streets.length > 10 && streets.length <= 60, `${streets.length} groups`);
  assert.deepEqual([...new Set(streets.map((s) => s.district))].sort(), ['mid', 'new', 'old'], 'the three oldest districts');
  streets.forEach((a, i) => streets.slice(i + 1).forEach((b) => assert.ok(Math.abs(a.row - b.row) > 2 || Math.abs(a.col - b.col) > 2, 'groups spaced apart')));
  assert.deepEqual(pickYulanStreets(slots, 's'), streets, 'the same each year');

  const courts = [1, 2, 3, 4].map((i) => ({ id: `${i}:${i}`, textureKey: 'sports_ground_2x2', district: ['old', 'old', 'mid', 'far'][i - 1] }));
  const at = (minute) => layoutYulan({ minute, seed: 's', kerbSlots: slots, courts });
  const ids = (ps, part) => ps.filter((p) => p.partId === part);
  const night = at(20 * 60);
  const fairs = new Set(night.filter((p) => p.id.startsWith('yulan:fair:')).map((p) => p.buildingId));
  assert.deepEqual([...fairs].sort(), ['1:1', '3:3', '4:4'], 'three 勝會, one a district, the old ones first');
  // the front row of stools has nobody in it
  const front = night.filter((p) => /stools:0:/.test(p.id) && p.buildingId === '1:1');
  assert.equal(front.length, 4);
  assert.ok(!night.some((p) => /audience:0:/.test(p.id)), 'the front row is left for the 好兄弟');
  assert.ok(night.some((p) => /audience:1:/.test(p.id)), 'the rows behind are full during the opera');
  assert.ok(ids(night, 'yulanMat').length === streets.length, 'every street group has its offerings');
  assert.ok(night.some((p) => p.fire && p.id.includes(':street:')), 'and its fire');
  // someone burning at every street fire; the 阿飄 come after nine, none before
  const fires = night.filter((p) => p.fire && p.id.includes(':street:'));
  assert.equal(night.filter((p) => /:burner$/.test(p.id)).length, fires.length, 'a neighbour at every fire');
  assert.equal(night.filter((p) => p.floating).length, 0, 'no 阿飄 at eight');
  const late = at(23 * 60);
  assert.ok(late.some((p) => p.floating && /yulanGhost/.test(p.partId)), 'the 阿飄 at the offerings late');
  assert.ok(night.some((p) => p.ghost), 'the 孤魂之位 carries the ghost light');
  // the morning: rice queue, no street offerings
  const morning = at(8 * 60);
  assert.ok(morning.some((p) => /queue/.test(p.id)) && !morning.some((p) => p.id.includes(':street:')));
  // half past eleven: the effigies burning; after half past midnight, gone, and the streets cleared
  assert.ok(at(23 * 60 + 45).filter((p) => p.effigy).every((p) => p.burning));
  assert.equal(at(60).filter((p) => p.effigy || p.id.includes(':street:')).length, 0);
  [...night, ...morning].forEach((p) => assert.ok(FESTIVAL_PARTS_BY_ID[p.partId], p.partId));
});

test('盂蘭 lights: an uneven flicker, green toward the colour asked', () => {
  const { yulanFlicker, lerpYulanColour, YULAN_GHOST_TIME } = require('../festival-yulan.js');
  const ks = [0, 100, 250, 400, 900].map((t) => yulanFlicker(t, 1));
  assert.ok(Math.max(...ks) - Math.min(...ks) > 0.05 && ks.every((k) => k > 0.4 && k < 1.1));
  assert.equal(lerpYulanColour(0x020713, 0x03160f, 0), 0x020713);
  assert.equal(lerpYulanColour(0x020713, 0x03160f, 1), 0x03160f);
  assert.deepEqual([...YULAN_GHOST_TIME], [22 * 60, 28 * 60]);
});
