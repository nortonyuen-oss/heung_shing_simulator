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

test('a boat leaves before dawn, is away at the grounds, and is home by night', () => {
  const boat = { id: 3, model: 'fishingBoat3', slot: 'x' };
  const day = 5;
  const env = (minute) => day * 1440 + minute;
  const { depart, back } = typhoonShelterBoatTimes(7, boat.id, day);
  assert.ok(depart >= 240 && depart < 480 && back >= 900 && back < 1260);
  const L = 20;
  const at = (minute, opts = {}) => typhoonShelterBoatState(boat, L, env(minute), { seed: 7, ...opts });
  assert.equal(at(depart - 1).mode, 'moored');
  assert.equal(at(depart + 1).mode, 'out');
  assert.equal(at(depart + L / TYPHOON_SHELTER_FLEET.speedTilesPerMinute + 1).mode, 'away');
  assert.equal(at(back + 1).mode, 'in');
  assert.equal(at(back + L / TYPHOON_SHELTER_FLEET.speedTilesPerMinute + 1).mode, 'moored');
  // house boats and sampans stay put
  assert.equal(at(depart + 30, { fishing: false }).mode, 'moored');
  // the same moment always gives the same answer: positions are never stored
  assert.deepEqual(at(depart + 7), at(depart + 7));
});

test('bad weather keeps boats in and turns those out for home', () => {
  const boat = { id: 3, model: 'fishingBoat3', slot: 'x' };
  const day = 5;
  const { depart } = typhoonShelterBoatTimes(7, boat.id, day);
  const L = 20;
  // held before it left: it never goes
  const early = { day, from: depart - 10 };
  assert.equal(typhoonShelterBoatState(boat, L, day * 1440 + depart + 30, { seed: 7, hold: early }).mode, 'moored');
  // held while out: it turns for home at once
  const late = { day, from: depart + 10 };
  const turning = typhoonShelterBoatState(boat, L, day * 1440 + depart + 12, { seed: 7, hold: late });
  assert.equal(turning.mode, 'in');
  assert.ok(turning.distance < 10 * TYPHOON_SHELTER_FLEET.speedTilesPerMinute);
  // a hold from another day does nothing
  assert.equal(typhoonShelterBoatState(boat, L, (day + 1) * 1440 + 900, { seed: 7, hold: late }).mode, 'away');
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
  assert.equal(f.boats.length, 10);
  assert.equal(new Set(f.boats.map((b) => b.slot)).size, 10, 'one boat a berth');
  // a big boat only takes a two-tile berth
  const sizeOf = new Map(slots.map((s) => [s.key, s.size]));
  f.boats.forEach((b) => assert.ok(TYPHOON_SHELTER_FLEET.models.find((m) => m.objectId === b.model).size <= sizeOf.get(b.slot)));
  // berths gone: boats move to free ones; target down: the fleet shrinks
  const fewer = slots.slice(0, 6);
  const moved = reconcileTyphoonShelterFleet(f, fewer, 10, { seed: 7 });
  assert.ok(moved.boats.length <= 6);
  assert.ok(moved.boats.every((b) => fewer.some((s) => s.key === b.slot)));
  assert.equal(reconcileTyphoonShelterFleet(f, slots, 4, { seed: 7 }).boats.length, 4);
});

test('the fleet survives the save normaliser', () => {
  const { plan, analysis, items } = setup();
  const slots = computeTyphoonShelterBerths(analysis, items);
  const f = reconcileTyphoonShelterFleet(createTyphoonShelterFleet(), slots, 6, { seed: 7 });
  f.hold = { day: 3, from: 300 };
  const saved = JSON.parse(JSON.stringify({ shelters: [{ ...plan, works: { approved: true, items }, fleet: f }], nextId: 2 }));
  const loaded = shelter.normalizeTyphoonShelterState(saved).shelters[0].fleet;
  assert.deepEqual(loaded.boats, f.boats);
  assert.deepEqual(loaded.hold, f.hold);
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
  const evening = day * 1440 + 23 * 60;
  const base = { ...plan, id: 'calm', works: { approved: true, items }, fleet: { nextId: 13, boats, hold: null } };
  const calm = fleet.summarizeTyphoonShelterFleet(base, analysis, evening);
  assert.ok(calm.fishing > 0);
  assert.equal(calm.tripsToday, calm.fishing);
  assert.equal(calm.catchToday, Math.round(calm.fishing * TYPHOON_SHELTER_FLEET.catchTonnesPerTrip * 10) / 10);
  const stormy = fleet.summarizeTyphoonShelterFleet({ ...base, id: 'stormy', fleet: { ...base.fleet, hold: { day, from: 9 * 60 } } }, analysis, evening);
  assert.equal(stormy.tripsToday, calm.tripsToday, 'everyone was out by 08:00');
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
  const backs = byLength.map((b) => times.get(b.id).back);
  departs.slice(1).forEach((t, i) => assert.ok(t > departs[i], 'nearer boats leave first'));
  backs.slice(1).forEach((t, i) => assert.ok(t < backs[i], 'further boats come home first'));
  const gap = TYPHOON_SHELTER_FLEET.departSpan / 6;
  departs.slice(1).forEach((t, i) => assert.ok(t - departs[i] > gap * 0.6, 'kept apart'));
  // a house boat is not in the order
  plan.fleet.boats.push({ id: 9, model: 'homeBoat1', slot: 's9' });
  assert.equal(fleet.typhoonShelterFleetSchedule(plan, (b) => len[b.slot] || 5, 3).has(9), false);
});
