'use strict';

// street-food-market.js: schedule, weather gate, venue discovery and the seeded per-venue layout.
// Pure logic only - no Phaser, no sharp - mirrors how typhoon-shelter-fleet.js's berths/routes/
// schedule are tested apart from typhoon-shelter-sprites.js's drawing.
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getStreetFoodPhase, getStreetFoodWeatherState, STREET_FOOD_WEATHER_DINER_SHARE,
  getStreetFoodVenues, getStreetFoodVenueCapacity, getStreetFoodVenuePerimeter, getStreetFoodVenueLayout,
  streetFoodWrapMinute, STREET_FOOD_SCHEDULE,
} = require('../street-food-market.js');

const CARTS = ['curryFishball', 'cartNoodles', 'friedSnacks', 'roastChestnut'];
const HAWKERS = ['hawkerAunt', 'hawkerUncle', 'hawkerGranny', 'hawkerYoungMan'];
const DINERS = ['seatedMan', 'seatedWoman'];
const PASSERSBY = ['walkerOfficeMan', 'walkerElder'];

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

test('capacity grows with venue size, per the design draft\'s 空地配置 targets', () => {
  assert.deepEqual(getStreetFoodVenueCapacity(1).stalls, [3, 4]);
  assert.deepEqual(getStreetFoodVenueCapacity(2).stalls, [5, 6]);
  assert.deepEqual(getStreetFoodVenueCapacity(4).stalls, [8, 10]);
  assert.deepEqual(getStreetFoodVenueCapacity(9).stalls, [10, 12]);
  assert.deepEqual(getStreetFoodVenueCapacity(40).stalls, [10, 12], 'a huge event ground still caps at 12 (first version)');
});

test('getStreetFoodVenuePerimeter: an L-shaped lot keeps its interior corner out and both arms in', () => {
  // 3x3 minus the (1,1) centre and the (0,2)/(2,0) opposite corners: a plus-ish ring
  const venue = { id: 'x', tiles: [[0, 0], [0, 1], [1, 0], [1, 2], [2, 1], [2, 2]] };
  const perimeter = getStreetFoodVenuePerimeter(venue);
  assert.equal(perimeter.length, 6, 'every tile here borders empty ground, all are perimeter');
  const seen = new Set(perimeter.map((p) => `${p.r}:${p.c}`));
  venue.tiles.forEach(([r, c]) => assert.ok(seen.has(`${r}:${c}`)));
});

test('getStreetFoodVenueLayout: closed (weather or outside hours) draws nothing, needs no asset roster', () => {
  const venue = { id: 'eventGround:10:10', tiles: [[10, 10], [10, 11], [11, 10], [11, 11]] };
  const closedByHour = getStreetFoodVenueLayout(venue, { minuteOfDay: 10 * 60, weather: { condition: 'clear' }, carts: CARTS, hawkers: HAWKERS, diners: DINERS, passersby: PASSERSBY });
  assert.equal(closedByHour.presence, 0);
  assert.deepEqual(closedByHour.stalls, []);
  const closedByStorm = getStreetFoodVenueLayout(venue, { minuteOfDay: 19 * 60, weather: { typhoonStage: 'signal8' }, carts: CARTS, hawkers: HAWKERS, diners: DINERS, passersby: PASSERSBY });
  assert.equal(closedByStorm.presence, 0);
  const noRoster = getStreetFoodVenueLayout(venue, { minuteOfDay: 19 * 60, weather: { condition: 'clear' }, carts: [], hawkers: [], diners: [], passersby: [] });
  assert.equal(noRoster.presence, 0);
});

test('getStreetFoodVenueLayout: stalls fill the perimeter, face into the venue, never overlap a tile', () => {
  const venue = { id: 'eventGround:10:10', tiles: [[10, 10], [10, 11], [11, 10], [11, 11]] };
  const layout = getStreetFoodVenueLayout(venue, { minuteOfDay: 19 * 60, weather: { condition: 'clear' }, carts: CARTS, hawkers: HAWKERS, diners: DINERS, passersby: PASSERSBY });
  assert.equal(layout.phase, 'open');
  assert.ok(layout.stalls.length >= 3 && layout.stalls.length <= 4);
  const tiles = new Set();
  for (const stall of layout.stalls) {
    const key = `${stall.row}:${stall.col}`;
    assert.ok(!tiles.has(key), 'two stalls on the same tile');
    tiles.add(key);
    assert.ok(CARTS.includes(stall.cartId));
    assert.ok(HAWKERS.includes(stall.hawkerId));
    assert.equal(typeof stall.mirrored, 'boolean');
    assert.ok(venue.tiles.some(([r, c]) => r === stall.row && c === stall.col), 'stall sits on a venue tile');
  }
  for (const table of layout.tables) assert.ok(!tiles.has(`${table.row}:${table.col}`), 'a table must not share a stall\'s tile');
});

test('getStreetFoodVenueLayout: same venue and minute reseed to the identical layout (reload/rotate-safe)', () => {
  const venue = { id: 'eventGround:3:3', tiles: [[3, 3], [3, 4], [3, 5], [4, 3], [4, 4], [4, 5]] };
  const options = { minuteOfDay: 19 * 60, weather: { condition: 'clear' }, carts: CARTS, hawkers: HAWKERS, diners: DINERS, passersby: PASSERSBY };
  const a = getStreetFoodVenueLayout(venue, options);
  const b = getStreetFoodVenueLayout(venue, options);
  assert.deepEqual(a, b);
  // a later minute within the same open window reseeds the walkers/seating but not which stalls exist
  const c = getStreetFoodVenueLayout(venue, { ...options, minuteOfDay: 19 * 60 + 5 });
  assert.deepEqual(a.stalls.map((s) => s.cartId), c.stalls.map((s) => s.cartId));
});

test('rain thins the diners at a table without removing the stalls', () => {
  const venue = { id: 'eventGround:7:7', tiles: [[7, 7], [7, 8], [8, 7], [8, 8], [7, 9], [9, 7]] };
  const clear = getStreetFoodVenueLayout(venue, { minuteOfDay: 19 * 60, weather: { condition: 'clear' }, carts: CARTS, hawkers: HAWKERS, diners: DINERS, passersby: PASSERSBY });
  const rain = getStreetFoodVenueLayout(venue, { minuteOfDay: 19 * 60, weather: { condition: 'heavyRain' }, carts: CARTS, hawkers: HAWKERS, diners: DINERS, passersby: PASSERSBY });
  assert.equal(clear.stalls.length, rain.stalls.length, 'ordinary rain does not clear the stalls');
  assert.ok(rain.walkers.length <= clear.walkers.length);
});
