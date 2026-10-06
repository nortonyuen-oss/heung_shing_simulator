const assert = require('node:assert/strict');
const test = require('node:test');
const shelter = require('../typhoon-shelter.js');
const works = require('../typhoon-shelter-works.js');
const fleet = require('../typhoon-shelter-fleet.js');
globalThis.normalizeTyphoonShelterWorks = works.normalizeTyphoonShelterWorks;
globalThis.normalizeTyphoonShelterFleet = fleet.normalizeTyphoonShelterFleet;
const {
  TYPHOON_SHELTER_FLEET,
  computeTyphoonShelterBerths,
  planTyphoonShelterRoutes,
  typhoonShelterRouteFor,
  typhoonShelterRouteLength,
  typhoonShelterPointAlong,
  createTyphoonShelterFleet,
  reconcileTyphoonShelterFleet,
  typhoonShelterBoatTimes,
  typhoonShelterBoatState,
  isTyphoonShelterFishingWeatherBad,
} = fleet;

// a bay opening south to the sea, a road behind its north shore
const BAY = [
  '#####R##########',
  '################',
  '##............##',
  '##............##',
  '##............##',
  '##............##',
  '##............##',
  '##............##',
  '~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~',
];

function setup() {
  const grid = BAY.map((row) => [...row]);
  const basin = new Set();
  grid.forEach((row, r) => row.forEach((ch, c) => { if (ch === '.') basin.add(`${r}:${c}`); }));
  const kinds = { '#': 'land', R: 'land', '~': 'water', '.': 'water' };
  const map = { width: grid[0].length, height: grid.length, kind: (r, c) => (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length ? null : kinds[grid[r][c]]) };
  const plan = { id: 'ts1', seed: 7, basin: shelter.encodeTyphoonShelterBasin(basin), entrances: [], reservePct: 20 };
  plan.entrances = shelter.suggestTyphoonShelterEntrances(plan, map);
  const analysis = shelter.analyzeTyphoonShelter(plan, map);
  const ctx = {
    roadDistance: (r, c) => Math.abs(r) + Math.abs(c - 5),
    isLand: (r, c) => map.kind(r, c) === 'land',
  };
  const items = works.completeTyphoonShelterWorks(works.reconcileTyphoonShelterWorks(works.createTyphoonShelterWorks(), works.layoutTyphoonShelterWorks(plan, analysis, ctx))).works.items;
  const isSea = (r, c) => map.kind(r, c) === 'water' && !analysis.basin.has(`${r}:${c}`) && !analysis.breakwater.has(`${r}:${c}`);
  return { map, plan, analysis, items, isSea };
}

test('berths: two tiles for a boat, never on the channel or the walkways', () => {
  const { analysis, items } = setup();
  const slots = computeTyphoonShelterBerths(analysis, items);
  const blocked = new Set(items.filter((i) => ['pier', 'floatingPier', 'pontoon'].includes(i.kind)).map((i) => `${i.row}:${i.col}`));
  const seen = new Set();
  slots.forEach((s) => s.tiles.forEach((k) => {
    assert.ok(analysis.basin.has(k) && !analysis.channel.has(k) && !blocked.has(k), k);
    assert.ok(!seen.has(k), `${k} in two berths`);
    seen.add(k);
  }));
  // the walkways take a few mooring tiles and the lanes their rows; the fleet only ever fills the
  // berths that exist
  assert.ok(slots.length >= analysis.berths.daily * 0.6, `${slots.length} berths, ${analysis.berths.daily} planned`);
  assert.ok(slots.filter((s) => s.size === 2).length >= slots.length / 3);
});

test('every berth has a way out through an entrance to the open sea', () => {
  const { map, analysis, items, isSea } = setup();
  const routes = planTyphoonShelterRoutes(analysis, items, isSea, { width: map.width, height: map.height, offshoreTiles: 3 });
  computeTyphoonShelterBerths(analysis, items).forEach((s) => {
    const route = typhoonShelterRouteFor(routes, s);
    assert.ok(route, `${s.key} has a route`);
    const [lr, lc] = route[route.length - 1];
    assert.ok(isSea(lr, lc), 'it ends out at sea');
    assert.ok(typhoonShelterRouteLength(route) > 0);
    // it never crosses land, the breakwater or the walkways
    route.slice(1).forEach(([r, c]) => assert.ok(map.kind(r, c) === 'water', `${r}:${c}`));
  });
});

test('a boat goes out in the evening, fishes the night and is alongside before dawn', () => {
  const boat = { id: 3, model: 'fishingBoat3', slot: 'x' };
  const day = 5;
  const t0 = day * 1440;
  const { depart, arrive } = typhoonShelterBoatTimes(7, boat.id, day, boat.model);
  assert.ok(depart >= 17 * 60 && depart < 19 * 60, `out at ${depart / 60}h`);
  assert.ok(arrive >= 27 * 60 && arrive < 29 * 60, 'alongside 03:00-05:00 the next morning');
  const L = 20;
  const travel = L / TYPHOON_SHELTER_FLEET.speedTilesPerMinute;
  const at = (minute, opts = {}) => typhoonShelterBoatState(boat, L, t0 + minute, { seed: 7, ...opts });
  assert.equal(at(depart - 1).mode, 'moored');
  assert.equal(at(depart + 1).mode, 'out');
  assert.equal(at(depart + travel + 1).mode, 'away');
  assert.equal(at(arrive - travel + 1).mode, 'in');
  assert.equal(at(arrive + 1).mode, 'moored');
  // the night belongs to the day it started: a trip day runs 06:00 to 06:00
  assert.equal(fleet.getTyphoonShelterTripDay(t0 + 26 * 60), day);
  assert.equal(fleet.getTyphoonShelterTripDay(t0 + 30 * 60), day + 1);
  // house boats and sampans stay put; a night off is a night in
  assert.equal(at(depart + 30, { fishing: false }).mode, 'moored');
  assert.equal(at(depart + 30, { times: { ...typhoonShelterBoatTimes(7, boat.id, day, boat.model), rest: true } }).mode, 'moored');
  // the same moment always gives the same answer: positions are never stored
  assert.deepEqual(at(depart + 7), at(depart + 7));
});

test('trip types: lamp boats and gill-netters leave at dusk, trawlers earlier and not in the 休漁期', () => {
  assert.equal(fleet.getTyphoonShelterBoatTrip('fishingBoat1'), 'light');
  assert.equal(fleet.getTyphoonShelterBoatTrip('fishingBoat3'), 'gillnet');
  assert.equal(fleet.getTyphoonShelterBoatTrip('fishingBoat4'), 'trawler');
  const boats = [1, 2, 3, 4, 5, 6].map((id) => ({ id, model: id % 2 ? 'fishingBoat4' : 'fishingBoat1', slot: `s${id}` }));
  const plan = { seed: 7, fleet: { boats } };
  const normal = fleet.typhoonShelterFleetSchedule(plan, () => 20, 3);
  boats.filter((b) => b.model === 'fishingBoat4').forEach((b) => assert.ok(normal.get(b.id).depart < 17 * 60 && !normal.get(b.id).rest));
  boats.filter((b) => b.model === 'fishingBoat1').forEach((b) => assert.ok(normal.get(b.id).depart >= 17 * 60));
  const moratorium = fleet.typhoonShelterFleetSchedule(plan, () => 20, 3, { moratorium: true });
  boats.forEach((b) => assert.equal(!!moratorium.get(b.id).rest, b.model === 'fishingBoat4' || !!normal.get(b.id).rest));
  // the month of a trip day, counted from today's: May to August is the 休漁期
  globalThis.city = { month: 4, environmentMinutes: 10 * 1440 + 100 };
  globalThis.getEnvironmentMinutes = () => globalThis.city.environmentMinutes;
  try {
    assert.equal(fleet.isTyphoonShelterMoratoriumDay(10), false, 'April');
    assert.equal(fleet.isTyphoonShelterMoratoriumDay(11), true, 'May');
    assert.equal(fleet.isTyphoonShelterMoratoriumDay(14), true, 'August');
    assert.equal(fleet.isTyphoonShelterMoratoriumDay(15), false, 'September');
  } finally {
    delete globalThis.city;
    delete globalThis.getEnvironmentMinutes;
  }
});

test('bad weather keeps boats in and turns those out for home', () => {
  const boat = { id: 3, model: 'fishingBoat3', slot: 'x' };
  const day = 5;
  const { depart } = typhoonShelterBoatTimes(7, boat.id, day);
  const L = 20;
  const t0 = day * 1440;
  const hold = (from, until = null) => ({ holds: [{ from, until }], standbys: [] });
  // held before it left: it never goes
  assert.equal(typhoonShelterBoatState(boat, L, t0 + depart + 30, { seed: 7, storm: hold(t0 + depart - 10) }).mode, 'moored');
  // held while out: it turns for home at once
  const turning = typhoonShelterBoatState(boat, L, t0 + depart + 12, { seed: 7, storm: hold(t0 + depart + 10) });
  assert.equal(turning.mode, 'in');
  assert.ok(turning.distance < 10 * TYPHOON_SHELTER_FLEET.speedTilesPerMinute);
  // a hold still open the next morning keeps it in; one closed overnight lets it sail
  const next = (day + 1) * 1440;
  const nextDepart = typhoonShelterBoatTimes(7, boat.id, day + 1).depart;
  assert.equal(typhoonShelterBoatState(boat, L, next + nextDepart + 30, { seed: 7, storm: hold(t0 + depart + 10) }).mode, 'moored');
  assert.notEqual(typhoonShelterBoatState(boat, L, next + nextDepart + 30, { seed: 7, storm: hold(t0 + depart + 10, next) }).mode, 'moored');
  // closed after its departure time that day: it stays in until tomorrow (no late starts)
  assert.equal(typhoonShelterBoatState(boat, L, next + 900, { seed: 7, storm: hold(t0 + depart + 10, next + nextDepart + 1) }).mode, 'moored');
  // a boat laid up for repairs stays in
  assert.equal(typhoonShelterBoatState({ ...boat, repairUntil: next + 1440 }, L, next + nextDepart + 30, { seed: 7 }).mode, 'moored');
  assert.ok(isTyphoonShelterFishingWeatherBad({ typhoonStage: 'signal3', rainWarning: 'none' }));
  assert.ok(isTyphoonShelterFishingWeatherBad({ typhoonStage: 'none', rainWarning: 'black' }));
  assert.ok(!isTyphoonShelterFishingWeatherBad({ typhoonStage: 'signal1', rainWarning: 'amber' }));
});

test('the fleet grows a few boats a day to its berths and keeps them when berths move', () => {
  const { analysis, items } = setup();
  const slots = computeTyphoonShelterBerths(analysis, items);
  let f = createTyphoonShelterFleet();
  f = reconcileTyphoonShelterFleet(f, slots, 10, { seed: 7, arrivals: 3 });
  assert.equal(f.boats.length, 3);
  for (let i = 0; i < 5; i++) f = reconcileTyphoonShelterFleet(f, slots, 10, { seed: 7, arrivals: 3 });
  // boats only on the two-tile berths: the sampans tie up at the landing stages instead
  const full = Math.min(10, slots.filter((sl) => sl.size >= 2).length);
  assert.equal(f.boats.length, full);
  assert.equal(new Set(f.boats.map((b) => b.slot)).size, full, 'one boat a berth');
  assert.ok(f.boats.every((b) => !b.model.startsWith('sanpan')));
  // a big boat only takes a two-tile berth
  const sizeOf = new Map(slots.map((s) => [s.key, s.size]));
  f.boats.forEach((b) => assert.ok(TYPHOON_SHELTER_FLEET.models.find((m) => m.objectId === b.model).size <= sizeOf.get(b.slot)));
  // berths gone: boats move to free ones; target down: the fleet shrinks
  const fewer = slots.slice(0, 6);
  const moved = reconcileTyphoonShelterFleet(f, fewer, 10, { seed: 7 });
  assert.ok(moved.boats.length <= 6);
  assert.ok(moved.boats.every((b) => fewer.some((s) => s.key === b.slot)));
  assert.equal(reconcileTyphoonShelterFleet(f, slots, 4, { seed: 7 }).boats.length, Math.min(4, full));
});

test('the fleet survives the save normaliser', () => {
  const { plan, analysis, items } = setup();
  const slots = computeTyphoonShelterBerths(analysis, items);
  const f = reconcileTyphoonShelterFleet(createTyphoonShelterFleet(), slots, 6, { seed: 7 });
  f.boats[0].repairUntil = 9000;
  f.hold = { day: 3, from: 300 };
  const saved = JSON.parse(JSON.stringify({ shelters: [{ ...plan, works: { approved: true, items }, fleet: f }], nextId: 2 }));
  const loaded = shelter.normalizeTyphoonShelterState(saved).shelters[0].fleet;
  assert.deepEqual(loaded.boats, f.boats);
  assert.equal(loaded.boats[0].repairUntil, 9000);
  assert.equal(loaded.hold, undefined, 'the Phase 3 one-day hold is dropped');
  assert.equal(loaded.nextId, f.nextId);
});

test('points along a route carry the heading', () => {
  const route = [[2, 2], [2, 5], [6, 5]];
  assert.deepEqual(typhoonShelterPointAlong(route, 1.5), { r: 2, c: 3.5, dir: 'e' });
  assert.deepEqual(typhoonShelterPointAlong(route, 5), { r: 4, c: 5, dir: 's' });
});

test('a boat turned back by the weather lands only part of its catch', () => {
  const { plan, analysis, items, map } = setup();
  Object.assign(globalThis, {
    WATER: 0, MAP_WIDTH: map.width, MAP_HEIGHT: map.height,
    mapData: BAY.map((row) => [...row].map((ch) => (ch === '#' || ch === 'R' ? 1 : 0))),
    isInsideMap: (r, c) => r >= 0 && c >= 0 && r < map.height && c < map.width,
  });
  const slots = computeTyphoonShelterBerths(analysis, items);
  const boats = reconcileTyphoonShelterFleet(createTyphoonShelterFleet(), slots, 12, { seed: 7 }).boats;
  const day = 9;
  // the next morning, 07:00: last night's trips and catch
  const morning = (day + 1) * 1440 + 7 * 60;
  const base = { ...plan, id: 'calm', works: { approved: true, items }, fleet: { nextId: 13, boats } };
  const calm = fleet.summarizeTyphoonShelterFleet(base, analysis, morning, null);
  assert.ok(calm.fishing > 0 && calm.tripsToday > 0 && calm.tripsToday <= calm.fishing, 'a few take the night off');
  assert.equal(calm.catchToday, Math.round(calm.tripsToday * TYPHOON_SHELTER_FLEET.catchTonnesPerTrip * 10) / 10);
  const storm = { holds: [{ from: day * 1440 + 21 * 60, until: null }], standbys: [] };
  const stormy = fleet.summarizeTyphoonShelterFleet({ ...base, id: 'stormy' }, analysis, morning, storm);
  assert.equal(stormy.tripsToday, calm.tripsToday, 'everyone was out by 19:00');
  assert.ok(stormy.catchToday < calm.catchToday / 2, `${stormy.catchToday} vs ${calm.catchToday}`);
  assert.equal(stormy.held, true);
});

test('art switched off in calibration: that view is not drawn, a model with none left gets no boats', () => {
  const assets = require('../typhoon-shelter-assets.js');
  const off = { fishingBoat3_a: 'off' };
  const views = assets.getTyphoonShelterObjectTextures('fishingBoat3', off);
  assert.ok(views.length > 0 && views.every((t) => t.partId !== 'fishingBoat3_a'), 'the other view is still used');
  assert.ok(assets.pickTyphoonShelterTexture('fishingBoat3', 'se', { facings: off }), 'and still drawn every way');

  const { analysis, items } = setup();
  const slots = computeTyphoonShelterBerths(analysis, items);
  const n = slots.length;
  const before = reconcileTyphoonShelterFleet(createTyphoonShelterFleet(), slots, n, { seed: 7 });
  // switch off every view of a model the fleet has
  const victim = before.boats.map((b) => b.model).find((m) => m.startsWith('fishingBoat'));
  assert.ok(victim, 'the fleet has a fishing boat');
  const allOff = Object.fromEntries(Object.keys(assets.TYPHOON_SHELTER_OBJECTS_BY_ID[victim].parts).map((id) => [id, 'off']));
  assert.equal(assets.pickTyphoonShelterTexture(victim, 'se', { facings: allOff }), null);
  globalThis.getTyphoonShelterFacingOverrides = () => allOff;
  globalThis.getTyphoonShelterObjectTextures = assets.getTyphoonShelterObjectTextures;
  try {
    const after = reconcileTyphoonShelterFleet(before, slots, n, { seed: 7 });
    assert.ok(!after.boats.some((b) => b.model === victim), 'its boats leave');
    const fresh = reconcileTyphoonShelterFleet(createTyphoonShelterFleet(), slots, n, { seed: 7 });
    assert.ok(fresh.boats.length >= n - 3, 'the other models fill the berths');
    assert.ok(!fresh.boats.some((b) => b.model === victim), 'and none arrive');
  } finally {
    delete globalThis.getTyphoonShelterFacingOverrides;
    delete globalThis.getTyphoonShelterObjectTextures;
  }
});

test('a boat goes out along the lanes: never over another berth, a buoy or a walkway', () => {
  const { map, analysis, items, isSea } = setup();
  const mooring = works.planTyphoonShelterMooring(analysis, items);
  const routes = planTyphoonShelterRoutes(analysis, items, isSea, { width: map.width, height: map.height, offshoreTiles: 3, lanes: mooring.lanes });
  const berthOf = new Map();
  mooring.slots.forEach((s) => s.tiles.forEach((k) => berthOf.set(k, s.key)));
  const blocked = new Set(items.filter((i) => ['pier', 'floatingPier', 'pontoon', 'mooringBuoy', 'navBuoyRed', 'navBuoyGreen'].includes(i.kind)).map((i) => `${i.row}:${i.col}`));
  mooring.slots.forEach((s) => {
    assert.ok(s.access.length > 0, `${s.key} lies beside a lane`);
    const route = typhoonShelterRouteFor(routes, s);
    assert.ok(route, `${s.key} has a way out`);
    route.slice(1).forEach(([r, c]) => {
      const k = `${r}:${c}`;
      assert.ok(!blocked.has(k), `${s.key}: ${k} is a buoy or a walkway`);
      assert.ok(!berthOf.has(k) || berthOf.get(k) === s.key, `${s.key}: ${k} is another boat's berth`);
    });
  });
});

test('the fleet sails in order: nearest the entrance out first, furthest in home first, evenly spaced', () => {
  const plan = { seed: 7, fleet: { boats: [1, 2, 3, 4, 5, 6].map((id) => ({ id, model: 'fishingBoat3', slot: `s${id}` })) } };
  const len = { s1: 30, s2: 10, s3: 50, s4: 20, s5: 40, s6: 60 };
  const times = fleet.typhoonShelterFleetSchedule(plan, (b) => len[b.slot], 3);
  const byLength = plan.fleet.boats.slice().sort((x, y) => len[x.slot] - len[y.slot]);
  const departs = byLength.map((b) => times.get(b.id).depart);
  const backs = byLength.map((b) => times.get(b.id).arrive);
  departs.slice(1).forEach((t, i) => assert.ok(t > departs[i], 'nearer boats leave first'));
  backs.slice(1).forEach((t, i) => assert.ok(t < backs[i], 'further boats come home first'));
  const gap = TYPHOON_SHELTER_FLEET.trips.gillnet.departSpan / 6;
  departs.slice(1).forEach((t, i) => assert.ok(t - departs[i] > gap * 0.6, 'kept apart'));
  // a house boat is not in the order
  plan.fleet.boats.push({ id: 9, model: 'homeBoat1', slot: 's9' });
  assert.equal(fleet.typhoonShelterFleetSchedule(plan, (b) => len[b.slot] || 5, 3).has(9), false);
});

test('the fleet leaves the reserved berths free for storm visitors', () => {
  const { plan, analysis, items, map } = setup();
  Object.assign(globalThis, {
    WATER: 0, MAP_WIDTH: map.width, MAP_HEIGHT: map.height,
    mapData: BAY.map((row) => [...row].map((ch) => (ch === '#' || ch === 'R' ? 1 : 0))),
    isInsideMap: (r, c) => r >= 0 && c >= 0 && r < map.height && c < map.width,
  });
  const p = { ...plan, id: 'reserve', works: { approved: true, items } };
  const geometry = fleet.getTyphoonShelterFleetGeometry(p, analysis);
  const usable = geometry.slots.filter((s) => geometry.routeBySlot.get(s.key) && s.size >= 2).length;
  // the summary's estimate says more berths than were laid out: the fleet still stops short of
  // the reserved ones
  const summaries = new Map([['reserve', { operational: true, berths: { total: usable + 10, reserved: 3, daily: usable + 7 } }]]);
  let state = { shelters: [p] };
  for (let day = 0; day < 20; day++) state = { shelters: fleet.updateTyphoonShelterFleets(state, new Map([['reserve', analysis]]), summaries) || state.shelters };
  assert.equal(state.shelters[0].fleet.boats.length, usable - 3);
  // and nothing grows while a storm keeps the boats in
  const stormy = { shelters: [{ ...p, fleet: { nextId: 1, boats: [] } }], storm: { holds: [{ from: 0, until: null }], standbys: [], visitors: [] } };
  globalThis.isTyphoonShelterStormFreeze = require('../typhoon-shelter-storm.js').isTyphoonShelterStormFreeze;
  assert.equal(fleet.updateTyphoonShelterFleets(stormy, new Map([['reserve', analysis]]), summaries), null);
});

test('the sampans tie up at the landing stages and run crews out and catches in', () => {
  const { TYPHOON_SHELTER_TENDERS: T, getTyphoonShelterTenderSpots, typhoonShelterTenderField, typhoonShelterTenderPath,
    planTyphoonShelterTenderRuns, typhoonShelterTenderPoint } = fleet;
  // a walkway runs south from the shore (row 0) down col 3; berths either side of it (cols 2, 4), a
  // lane beyond them (col 1, and col 5), and a lane across the bottom (row 8)
  const key = (r, c) => `${r}:${c}`;
  const basin = new Set();
  for (let r = 0; r <= 8; r++) for (let c = 0; c <= 6; c++) basin.add(key(r, c));
  const blocked = new Set([0, 1, 2, 3, 4, 5, 6].map((r) => key(r, 3)));     // the walkway
  const lanes = new Set([...[0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap((r) => [key(r, 1), key(r, 5)]), ...[0, 1, 2, 3, 4, 5, 6].map((c) => key(8, c))]);
  // berths along col 4, boats in all but rows 3-4 (a gap)
  const occupied = new Set([1, 2, 5, 6].map((r) => key(r, 4)));
  const spots = getTyphoonShelterTenderSpots([{ kind: 'floatingPier', state: 'done', row: 0, col: 3, facing: 'n' }]);
  assert.equal(spots.length, T.perStage);
  spots.forEach((s) => assert.ok(Math.abs(s.c - 3) > 0.3 && Math.abs(s.r) < 0.5, 'alongside, by the stage'));
  const east = spots.find((s) => s.c > 3);
  const field = typhoonShelterTenderField(east.start, { basin, lanes, blocked, occupied });
  // to a boat berthed beyond the walkway's west lane, at (6, 2)
  const slot = { key: '6:2', tiles: ['6:2'], access: ['6:1'] };
  const way = typhoonShelterTenderPath(field, east, slot);
  assert.ok(way, 'a way round');
  const tiles = way.route.slice(1, -1);
  tiles.forEach(([r, c]) => assert.ok(!blocked.has(key(r, c)), `never over the walkway (${r}:${c})`));
  tiles.slice(1).forEach(([r, c], i) => assert.equal(Math.abs(r - tiles[i][0]) + Math.abs(c - tiles[i][1]), 1, 'square steps, no diagonals'));
  // through the gap between the berthed boats rather than over one
  const crossed = tiles.filter(([r, c]) => occupied.has(key(r, c)));
  assert.equal(crossed.length, 0, 'between the boats, not through them');
  // the night's runs: crews aboard before each boat sails; one run at a time
  const boats = [1, 2, 3].map((id) => ({ id, slot, departAbs: 1000 + id * 20, arriveAbs: 1700 + id * 30 }));
  const runs = planTyphoonShelterTenderRuns([east], boats, () => way)[0];
  assert.ok(runs.length >= 3, `${runs.length} runs`);
  runs.forEach((run, i) => { if (i) assert.ok(run.start >= runs[i - 1].start + 2 * runs[i - 1].travel + runs[i - 1].stay - 1e-9); });
  const crew = runs.find((run) => run.stay === T.crewStay);
  assert.ok(crew.start + crew.travel <= 1020);
  assert.deepEqual(typhoonShelterTenderPoint(east, runs, 0), { r: east.r, c: east.c, dir: east.dir });
  const there = typhoonShelterTenderPoint(east, runs, runs[0].start + runs[0].travel + 1);
  assert.ok(Math.abs(there.r - way.route.at(-1)[0]) < 1e-6 && Math.abs(there.c - way.route.at(-1)[1]) < 1e-6, 'alongside the boat');
  // out of reach: let go
  assert.equal(planTyphoonShelterTenderRuns([east], boats, () => ({ route: way.route, length: 99 }))[0].length, 0);
});
