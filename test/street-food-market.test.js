'use strict';

// street-food-market.js: schedule, weather gate, venue discovery and the seeded per-venue layout.
// Pure logic only - no Phaser, no sharp - mirrors how typhoon-shelter-fleet.js's berths/routes/
// schedule are tested apart from typhoon-shelter-sprites.js's drawing.
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getStreetFoodPhase, getStreetFoodWeatherState, STREET_FOOD_WEATHER_DINER_SHARE,
  getStreetFoodVenues, getStreetFoodVenueEdgeRuns, streetFoodEdgeDistanceM, getStreetFoodVenueLayout,
  getStreetFoodVenueFixtures, STREET_FOOD_STALL_LAYOUT, STREET_FOOD_TABLE_LAYOUT, STREET_FOOD_FIXTURE_LAYOUT,
  streetFoodWrapMinute, STREET_FOOD_SCHEDULE,
} = require('../street-food-market.js');

const CARTS = ['curryFishball', 'cartNoodles', 'friedSnacks', 'roastChestnut'];
const HAWKERS = ['hawkerAunt', 'hawkerUncle', 'hawkerGranny', 'hawkerYoungMan'];
const DINERS = ['seatedMan', 'seatedWoman'];
const PASSERSBY = ['walkerOfficeMan', 'walkerElder'];
const QUEUERS = ['dinerFather', 'dinerCoupleWoman'];
const TABLES = ['roundTableCream', 'roundTableMint'];
const STOOLS = ['foldingStoolRed', 'foldingStoolGreen'];
const ROSTER = { carts: CARTS, hawkers: HAWKERS, queuers: QUEUERS, diners: DINERS, passersby: PASSERSBY, tableFurniture: TABLES, stools: STOOLS };
const M = 1 / 20; // tiles per metre
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message || ''} ${actual} vs ${expected}`);
const metres = (a, b) => Math.hypot(a.row - b.row, a.col - b.col) * 20;

test('開日頭放學時候到夜晚宵夜: empty before 放學, open through the evening, thinner at 宵夜, gone by 02:00', () => {
  assert.equal(getStreetFoodPhase(10 * 60).phase, 'empty', 'midday: no lunch stalls, this is the 放學 crowd');
  assert.equal(getStreetFoodPhase(STREET_FOOD_SCHEDULE.openFrom).presence, 0);
  assert.equal(getStreetFoodPhase(STREET_FOOD_SCHEDULE.openFrom + 15).phase, 'opening');
  assert.ok(getStreetFoodPhase(STREET_FOOD_SCHEDULE.openFrom + 15).presence > 0
    && getStreetFoodPhase(STREET_FOOD_SCHEDULE.openFrom + 15).presence < 1);
  const evening = getStreetFoodPhase(19 * 60);
  assert.equal(evening.phase, 'open');
  assert.equal(evening.presence, 1);
  assert.equal(evening.dinerShare, 1);
  const lateNight = getStreetFoodPhase(23 * 60 + 45);
  assert.equal(lateNight.phase, 'lateNight');
  assert.equal(lateNight.presence, 1, '宵夜 is thinner on diners, not thinner on stalls');
  assert.ok(lateNight.dinerShare < evening.dinerShare);
  const justAfterMidnight = getStreetFoodPhase(0 * 60 + 45);
  assert.equal(justAfterMidnight.phase, 'lateNight', '00:45 continues the same evening, not a fresh empty day');
  const closing = getStreetFoodPhase(1 * 60 + 45);
  assert.equal(closing.phase, 'closing');
  assert.ok(closing.presence > 0 && closing.presence < 1);
  assert.equal(getStreetFoodPhase(2 * 60 + 30).phase, 'empty', 'bare again by 02:00');
  assert.equal(getStreetFoodPhase(5 * 60).phase, 'empty');
});

test('streetFoodWrapMinute only wraps the small hours, matching festival-venues.js\'s June4/Yulan cutoff', () => {
  assert.equal(streetFoodWrapMinute(5 * 60 + 59), 29 * 60 + 59);
  assert.equal(streetFoodWrapMinute(6 * 60), 6 * 60);
  assert.equal(streetFoodWrapMinute(20 * 60), 20 * 60);
});

test('weather: signal 8+ or black rain closes it outright; ordinary rain only thins the diners', () => {
  assert.equal(getStreetFoodWeatherState({ typhoonStage: 'signal8' }), 'closed');
  assert.equal(getStreetFoodWeatherState({ typhoonStage: 'signal3' }), 'clear');
  assert.equal(getStreetFoodWeatherState({ rainWarning: 'black' }), 'closed');
  assert.equal(getStreetFoodWeatherState({ condition: 'heavyRain' }), 'rain');
  assert.equal(getStreetFoodWeatherState({ rainWarning: 'amber' }), 'rain');
  assert.equal(getStreetFoodWeatherState({ condition: 'showers' }), 'lightRain');
  assert.equal(getStreetFoodWeatherState({ condition: 'clear' }), 'clear');
  assert.equal(getStreetFoodWeatherState(null), 'clear');
  assert.equal(STREET_FOOD_WEATHER_DINER_SHARE.closed, 0);
  assert.ok(STREET_FOOD_WEATHER_DINER_SHARE.rain < STREET_FOOD_WEATHER_DINER_SHARE.lightRain);
  assert.ok(STREET_FOOD_WEATHER_DINER_SHARE.lightRain < STREET_FOOD_WEATHER_DINER_SHARE.clear);
});

test('getStreetFoodVenues: 節慶實際預留 > 平日小食墟 - the caller\'s claim predicate excludes a venue entirely', () => {
  const a = { id: 'eventGround:1:1', tiles: [[1, 1]], height: 0 };
  const b = { id: 'eventGround:5:5', tiles: [[5, 5], [5, 6]], height: 0 };
  const ctx = { eventGrounds: [a, b] };
  assert.deepEqual(getStreetFoodVenues(ctx), [a, b], 'nothing claimed: both free');
  assert.deepEqual(getStreetFoodVenues(ctx, (v) => v.id === a.id), [b], 'claimed venue excluded, the other still runs');
  assert.deepEqual(getStreetFoodVenues(ctx, () => true), [], 'every venue claimed (e.g. a city-wide LNY fair)');
});

test('getStreetFoodVenueEdgeRuns: open edges merge into straight runs, an L keeps its inside corner shut', () => {
  const single = getStreetFoodVenueEdgeRuns({ id: 'a', tiles: [[5, 5]] });
  assert.deepEqual(single.map((r) => r.side).sort(), ['E', 'N', 'S', 'W']);
  single.forEach((r) => assert.equal(r.to - r.from, 1));
  const square = getStreetFoodVenueEdgeRuns({ id: 'b', tiles: [[0, 0], [0, 1], [1, 0], [1, 1]] });
  assert.equal(square.length, 4, '2x2: one 40 m run a side, not two 20 m ones');
  square.forEach((r) => assert.equal(r.to - r.from, 2));
  const north = square.find((r) => r.side === 'N');
  assert.deepEqual([north.axis, north.fixed, north.inward], ['col', -0.5, [1, 0]]);
  // L: (0,0) (1,0) (1,1) - the inside corner at (0,1) is not venue, so its edges are open runs too
  const ell = getStreetFoodVenueEdgeRuns({ id: 'c', tiles: [[0, 0], [1, 0], [1, 1]] });
  assert.equal(ell.reduce((sum, r) => sum + (r.to - r.from), 0), 8, 'an L of 3 tiles has 8 open unit edges');
  near(streetFoodEdgeDistanceM(square, 0.5, 0.5), 20, 'the 2x2 centre is 20 m from every edge');
  near(streetFoodEdgeDistanceM(square, -0.5 + 3 * M, 0.5), 3);
});

test('getStreetFoodVenueLayout: closed (weather or outside hours) draws nothing, needs no asset roster', () => {
  const venue = { id: 'eventGround:10:10', tiles: [[10, 10], [10, 11], [11, 10], [11, 11]] };
  const closedByHour = getStreetFoodVenueLayout(venue, { minuteOfDay: 10 * 60, weather: { condition: 'clear' }, ...ROSTER });
  assert.equal(closedByHour.presence, 0);
  assert.deepEqual(closedByHour.stalls, []);
  const closedByStorm = getStreetFoodVenueLayout(venue, { minuteOfDay: 19 * 60, weather: { typhoonStage: 'signal8' }, ...ROSTER });
  assert.equal(closedByStorm.presence, 0);
  const noRoster = getStreetFoodVenueLayout(venue, { minuteOfDay: 19 * 60, weather: { condition: 'clear' }, carts: [], hawkers: [], diners: [], passersby: [] });
  assert.equal(noRoster.presence, 0);
});

test('按真實尺寸重新排位: one 20 m lot holds 8-12 carts along its edges, long side along the edge, none overlapping', () => {
  const venue = { id: 'eventGround:10:10', tiles: [[10, 10]] };
  const layout = getStreetFoodVenueLayout(venue, { minuteOfDay: 19 * 60, weather: { condition: 'clear' }, ...ROSTER });
  assert.equal(layout.phase, 'open');
  assert.ok(layout.stalls.length >= 8 && layout.stalls.length <= 12, `${layout.stalls.length} carts`);
  const runs = getStreetFoodVenueEdgeRuns(venue);
  const S = STREET_FOOD_STALL_LAYOUT;
  layout.stalls.forEach((stall, i) => {
    assert.ok(CARTS.includes(stall.cartId));
    assert.ok(HAWKERS.includes(stall.hawkerId));
    near(streetFoodEdgeDistanceM(runs, stall.row, stall.col), S.cartInsetM, `cart ${S.cartInsetM} m in from the edge`);
    near(streetFoodEdgeDistanceM(runs, stall.hawker.row, stall.hawker.col), S.hawkerInsetM, 'hawker between cart and edge');
    // the long side runs along the edge: a col-axis (N/S) edge steps inward by row, and vice versa
    assert.equal(stall.inward[stall.alongAxis === 'col' ? 1 : 0], 0);
    stall.queue.forEach((q) => {
      assert.ok(QUEUERS.includes(q.personId));
      assert.ok(streetFoodEdgeDistanceM(runs, q.row, q.col) > S.cartInsetM + 0.5, 'the queue stands in front of the counter, inside the lot');
    });
    layout.stalls.slice(i + 1).forEach((other) => assert.ok(metres(stall, other) >= S.minGapM, 'carts kept apart'));
  });
});

test('tables sit on the interior grid clear of the queues, each with four stools and at most three sitters', () => {
  const venue = { id: 'eventGround:3:3', tiles: [[3, 3], [3, 4], [4, 3], [4, 4]] };
  const layout = getStreetFoodVenueLayout(venue, { minuteOfDay: 19 * 60, weather: { condition: 'clear' }, ...ROSTER });
  const runs = getStreetFoodVenueEdgeRuns(venue);
  assert.ok(layout.tables.length > 4 && layout.tables.length <= STREET_FOOD_TABLE_LAYOUT.maxTables);
  layout.tables.forEach((table) => {
    assert.ok(TABLES.includes(table.tableId));
    assert.ok(streetFoodEdgeDistanceM(runs, table.row, table.col) >= STREET_FOOD_TABLE_LAYOUT.minInsetM - 1e-9);
    assert.equal(table.stools.length, 4);
    table.stools.forEach((stool) => {
      assert.ok(STOOLS.includes(stool.stoolId));
      near(metres(stool, table), STREET_FOOD_TABLE_LAYOUT.stoolOffsetM);
      if (stool.seatedId) assert.ok(DINERS.includes(stool.seatedId));
    });
    const seated = table.stools.filter((s) => s.seatedId).length;
    assert.ok(seated <= 3, 'never every seat filled');
    assert.equal(table.occupied, seated > 0);
  });
  layout.walkers.forEach((walker) => assert.ok(PASSERSBY.includes(walker.personId)));
  // 中間空就放多幾張檯: a single 20 m tile fills its middle, inside all four rows of carts - at any
  // row/col, not just near 0 (5.5 m in from row 29.5 is 29.775, a hair short in floating point)
  for (const tile of [[0, 0], [9, 9], [30, 30], [117, 83]]) {
    const one = getStreetFoodVenueLayout({ id: 'eventGround:9:9', tiles: [tile] }, { minuteOfDay: 19 * 60, weather: {}, ...ROSTER });
    assert.equal(one.tables.length, 13, `${tile}: ${one.tables.length} tables`);
  }
  const one = getStreetFoodVenueLayout({ id: 'eventGround:9:9', tiles: [[9, 9]] }, { minuteOfDay: 19 * 60, weather: {}, ...ROSTER });
  one.tables.forEach((table, i) => one.tables.slice(i + 1).forEach((other) => assert.ok(metres(table, other) >= 2 * STREET_FOOD_TABLE_LAYOUT.stoolOffsetM + 0.32 + 0.3, 'stools clear of the next table\'s')));
});

test('the lot\'s own fixtures: a lamp post or an electric box on every outside corner, 1-2 boxes, string spans along each edge', () => {
  const F = STREET_FOOD_FIXTURE_LAYOUT;
  const one = getStreetFoodVenueFixtures({ id: 'v1', tiles: [[0, 0]] });
  assert.equal(one.lamps.length + one.cabinets.length, 4, 'four corners, each a lamp or a box');
  assert.equal(one.cabinets.length, 1, 'a small lot: one 電箱');
  assert.ok(['n', 's', 'e', 'w'].includes(one.cabinets[0].side));
  assert.equal(one.strings.length, 8, 'two spans to each 20 m edge');
  one.strings.forEach((span) => {
    near(metres(span.a, span.b), F.stringSpanM, 'pole to pole');
    assert.ok(span.a[span.axis] < span.b[span.axis], 'a span runs along its edge');
  });
  const big = getStreetFoodVenueFixtures({ id: 'v9', tiles: Array.from({ length: 9 }, (_, i) => [Math.floor(i / 3), i % 3]) });
  assert.equal(big.cabinets.length, 2, 'a bigger lot: two 電箱');
  assert.equal(big.lamps.length, 4 - 2 + 8, 'the corners left over plus a lamp at each of the 8 tile joints along the edges');
  // an L: its inside corner is not an outside corner, so it gets no lamp of its own
  const ell = getStreetFoodVenueFixtures({ id: 'vL', tiles: [[0, 0], [1, 0], [1, 1]] });
  assert.equal(ell.lamps.length + ell.cabinets.length, 5 + 2, '5 outside corners, plus a joint lamp on each of its two 40 m edges');
});

test('carts keep clear of the lamp posts, boxes and string poles; the fixtures stay when the market is shut', () => {
  const venue = { id: 'eventGround:4:4', tiles: [[4, 4], [4, 5], [5, 4], [5, 5]] };
  const open = getStreetFoodVenueLayout(venue, { minuteOfDay: 19 * 60, weather: {}, ...ROSTER });
  const fixtures = [...open.lamps, ...open.cabinets, ...open.strings.flatMap((span) => [span.a, span.b])];
  open.stalls.forEach((stall) => fixtures.forEach((f) => {
    assert.ok(metres(stall, f) >= STREET_FOOD_STALL_LAYOUT.fixtureClearM - 1e-9);
    assert.ok(metres(stall.hawker, f) >= STREET_FOOD_STALL_LAYOUT.fixtureClearM - 1e-9);
  }));
  const shut = getStreetFoodVenueLayout(venue, { minuteOfDay: 11 * 60, weather: {}, ...ROSTER });
  assert.equal(shut.stalls.length, 0);
  assert.equal(shut.strings.length, 0, 'the string lights come down with the stalls');
  assert.deepEqual(shut.lamps, open.lamps, 'the lamp posts are the lot\'s, not the market\'s');
  assert.deepEqual(shut.cabinets, open.cabinets);
});

test('getStreetFoodVenueLayout: same venue and minute reseed to the identical layout (reload/rotate-safe)', () => {
  const venue = { id: 'eventGround:3:3', tiles: [[3, 3], [3, 4], [3, 5], [4, 3], [4, 4], [4, 5]] };
  const options = { minuteOfDay: 19 * 60, weather: { condition: 'clear' }, ...ROSTER };
  const a = getStreetFoodVenueLayout(venue, options);
  const b = getStreetFoodVenueLayout(venue, options);
  assert.deepEqual(a, b);
  // a later minute reseeds the queues/seating/walkers but not which stalls or tables exist
  const c = getStreetFoodVenueLayout(venue, { ...options, minuteOfDay: 21 * 60 + 5 });
  assert.deepEqual(a.stalls.map((s) => [s.id, s.cartId]), c.stalls.map((s) => [s.id, s.cartId]));
  assert.deepEqual(a.tables.map((t) => t.id), c.tables.map((t) => t.id));
});

test('rain thins the diners at a table without removing the stalls', () => {
  const venue = { id: 'eventGround:7:7', tiles: [[7, 7], [7, 8], [8, 7], [8, 8], [7, 9], [9, 7]] };
  const clear = getStreetFoodVenueLayout(venue, { minuteOfDay: 19 * 60, weather: { condition: 'clear' }, ...ROSTER });
  const rain = getStreetFoodVenueLayout(venue, { minuteOfDay: 19 * 60, weather: { condition: 'heavyRain' }, ...ROSTER });
  assert.equal(clear.stalls.length, rain.stalls.length, 'ordinary rain does not clear the stalls');
  assert.ok(rain.walkers.length <= clear.walkers.length);
});
