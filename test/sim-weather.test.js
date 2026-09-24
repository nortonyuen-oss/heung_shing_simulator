const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const weatherSource = fs.readFileSync(path.join(ROOT, 'sim-weather.js'), 'utf8');
const cityStateSource = fs.readFileSync(path.join(ROOT, 'city-state.js'), 'utf8');

// Weather runs on the environmental (day/night) clock: city.environmentMinutes
// counts displayed minutes, 60 per displayed hour, 1440 per displayed day.
const HOUR = 60;
const DAY = 24 * HOUR;

function freshWeather() {
  return {
    condition: 'clear', temperatureC: 24, humidityPct: 60, rainfallMm: 0, rainWarning: 'none', windKph: 10,
    conditionUntilMinutes: 0,
    typhoonStage: 'none', typhoonActive: false, typhoonName: '', typhoonPeakWindKph: 0,
    typhoonDurationHours: 0, typhoonHoursElapsed: 0, typhoonNextInDays: 0,
    typhoonWindKph: 0, typhoonNameIndex: 0, signal8ReachedThisStorm: false,
  };
}

// A seeded RNG so the distribution assertions below are stable run to run.
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createWeatherContext({ month = 7, random = seededRandom(7) } = {}) {
  const city = { month, day: 1, year: 2026, name: 'Test', weather: freshWeather(), environmentMinutes: 0 };
  const signals = [];
  const changes = [];
  const sandbox = {
    city,
    console,
    Math: Object.assign(Object.create(Math), { random }),
    normalizeCityFinanceState: () => {},
    announceTyphoonSignalChange: (name, stage, wind) => signals.push({ name, stage, wind }),
    emitGameClockEvent: (name, payload) => { if (name === 'weather:change') changes.push(payload); },
    getDefaultCityName: () => 'Test',
    t: (key) => key,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(weatherSource, context, { filename: 'sim-weather.js' });
  const advance = (fromMinutes, toMinutes) => vm.runInContext(`advanceWeatherClock(${fromMinutes}, ${toMinutes})`, context);
  // walk the clock the way game-clock.js does: many small frames
  const walk = (fromMinutes, toMinutes, stepMinutes = 7) => {
    let cursor = fromMinutes;
    while (cursor < toMinutes) {
      const next = Math.min(toMinutes, cursor + stepMinutes);
      advance(cursor, next);
      cursor = next;
    }
  };
  return { context, city, signals, changes, advance, walk };
}

test('rainfall settles to zero after rain, including saves stuck at 1 mm', () => {
  for (const condition of ['clear', 'cloudy', 'hot', 'cool', 'windy']) {
    for (const rainfallMm of [1, 20, 95]) {
      const { city, advance } = createWeatherContext({ month: 1 });
      Object.assign(city.weather, { condition, rainfallMm, conditionUntilMinutes: 2 * DAY });
      let previous = rainfallMm;
      for (let hour = 0; hour < 12; hour++) {
        advance(hour * HOUR, (hour + 1) * HOUR);
        assert.ok(city.weather.rainfallMm >= 0 && city.weather.rainfallMm <= previous);
        previous = city.weather.rainfallMm;
      }
      assert.equal(city.weather.rainfallMm, 0, `${condition} after ${rainfallMm} mm`);
    }
  }
});

test('rainy conditions still produce rainfall and block ice cream trucks', () => {
  const { canSpawnIceCreamTruckForWeather } = require('../traffic-visuals');
  for (const condition of ['showers', 'heavyRain']) {
    const { city, advance } = createWeatherContext({ month: 1 });
    Object.assign(city.weather, { condition, conditionUntilMinutes: DAY });
    advance(0, HOUR);
    assert.ok(city.weather.rainfallMm > 0);
    assert.equal(canSpawnIceCreamTruckForWeather(city.weather), false);
  }
});

test('a dry daytime city spawns an ice cream truck again after the last rain reading clears', () => {
  const { context, city, advance } = createWeatherContext({ month: 1 });
  Object.assign(city.weather, { condition: 'clear', rainfallMm: 1, conditionUntilMinutes: DAY });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'traffic-visuals.js'), 'utf8'), context);
  vm.runInContext(`
    const TILE_WIDTH = 64, TILE_HEIGHT = 32, TILE_IMAGE_HEIGHT = 32;
    const BUILDING_SURFACE_Y_OFFSET = 0, ROAD = 2;
    const mapData = Array.from({ length: 3 }, (_, row) => Array(31).fill(row === 1 ? ROAD : 0));
    const heightMap = [], bridgeMap = [], roadUnderlayMap = [];
    const buildingData = { '0:15': { type: 'primary_school', footprintRows: 1, footprintCols: 1 } };
    function isInsideMap(row, col) { return row >= 0 && row < 3 && col >= 0 && col < 31; }
    function isoToScreen(col, row) { return { x: (col - row) * 32, y: (col + row) * 16 }; }
    function getGameTimeOfDayMinutes() { return 12 * 60; }
    function getWorldDepth(_layer, y) { return y; }
    function addToRenderLayer() {}
    const sprite = {
      setOrigin() {}, setScale() {}, setMask() {}, setTexture() {}, setPosition() {}, setDepth() {},
    };
    const scene = {
      offsetX: 0, offsetY: 0,
      cameras: { main: { zoom: 1, width: 128, height: 128, scrollX: 384, scrollY: 176 } },
      textures: { exists: () => true },
      add: { image: () => sprite },
    };
    const state = setupTrafficVisuals(scene);
    state.iceCreamCooldownMinutes = 0;
    updateIceCreamEvent(scene, state, 16, false, 1);
  `, context);
  assert.equal(vm.runInContext('state.iceCreamEvent', context), null, 'residual rainfall blocks spawning');
  advance(0, HOUR);
  vm.runInContext('updateIceCreamEvent(scene, state, 16, false, 1)', context);
  const event = vm.runInContext('state.iceCreamEvent', context);
  assert.ok(event, 'the truck must spawn once dry');
  assert.equal(event.model.id, 'icecream_van');
  assert.equal(event.targetId, '0:15');
  assert.equal(event.phase, 'entering');
  assert.ok(event.movementLegs.some((leg) => leg.kind === 'parkingApproach'));
});

test('a condition holds 5-11 displayed hours, so a displayed day sees 2-3 rolls', () => {
  const { city, walk } = createWeatherContext({ month: 3 }); // no typhoon season
  const rollsPerDay = [];
  for (let day = 0; day < 40; day++) {
    let rolls = 0;
    let lastUntil = city.weather.conditionUntilMinutes;
    for (let minute = day * DAY; minute < (day + 1) * DAY; minute += 5) {
      walk(minute, minute + 5, 5);
      if (city.weather.conditionUntilMinutes !== lastUntil) {
        const hold = (city.weather.conditionUntilMinutes - minute) / HOUR;
        assert.ok(hold >= 5 - 1 && hold <= 11 + 1, `hold of ${hold.toFixed(1)}h is outside 5-11h`);
        lastUntil = city.weather.conditionUntilMinutes;
        rolls++;
      }
    }
    rollsPerDay.push(rolls);
  }
  const mean = rollsPerDay.reduce((a, b) => a + b, 0) / rollsPerDay.length;
  assert.ok(mean >= 2 && mean <= 3.5, `expected 2-3 rolls per displayed day on average, got ${mean.toFixed(2)}`);
  assert.ok(rollsPerDay.every((n) => n >= 1 && n <= 5), `per-day rolls out of range: ${rollsPerDay}`);
});

test('the persist chance keeps the current condition on some rolls, so visible changes are rarer than rolls', () => {
  // RNG pinned below the 40% persist chance: every roll keeps the condition
  const { city, advance } = createWeatherContext({ month: 3, random: () => 0.1 });
  city.weather.condition = 'cloudy';
  city.weather.conditionUntilMinutes = 0;
  advance(0, 12 * HOUR);
  assert.equal(city.weather.condition, 'cloudy');
  // and pinned above it: the roll draws a fresh condition from the profile
  const other = createWeatherContext({ month: 3, random: () => 0.95 });
  other.city.weather.condition = 'cloudy';
  other.city.weather.conditionUntilMinutes = 0;
  other.advance(0, 12 * HOUR);
  assert.notEqual(other.city.weather.condition, 'cloudy');
});

test('inside the season a storm arrives 4-6 displayed days after the countdown starts, never outside it', () => {
  const { city, walk } = createWeatherContext({ month: 8 });
  let genesisDay = -1;
  for (let day = 0; day < 8 && genesisDay < 0; day++) {
    walk(day * DAY, (day + 1) * DAY, 15);
    if (city.weather.typhoonActive) genesisDay = day;
  }
  assert.ok(genesisDay >= 3 && genesisDay <= 6, `first storm on displayed day ${genesisDay}, expected 4-6`);

  const winter = createWeatherContext({ month: 1 });
  winter.walk(0, 30 * DAY, 30);
  assert.equal(winter.city.weather.typhoonActive, false, 'no genesis outside April-November');
});

test('a storm lasts 18-36 displayed hours and its signal rises then falls back to none', () => {
  const { city, signals, walk } = createWeatherContext({ month: 9, random: seededRandom(3) });
  // force the countdown to expire on the first daily check, which comes at
  // the start of the next displayed day (hour 24 on the environmental clock)
  city.weather.typhoonNextInDays = 1;
  walk(0, 23 * HOUR, 5);
  assert.equal(city.weather.typhoonActive, false, 'nothing before the daily check');
  walk(23 * HOUR, 25 * HOUR, 5);
  assert.equal(city.weather.typhoonActive, true, 'storm forms on the daily check');
  const duration = city.weather.typhoonDurationHours;
  assert.ok(duration >= 18 && duration <= 36, `duration ${duration}h outside 18-36h`);
  const name = city.weather.typhoonName;
  assert.ok(name, 'storm is named');

  walk(25 * HOUR, 25 * HOUR + (duration + 2) * HOUR, 5);
  assert.equal(city.weather.typhoonActive, false, 'storm has blown out');
  assert.equal(city.weather.typhoonStage, 'none');
  assert.ok(city.weather.typhoonNextInDays >= 4 && city.weather.typhoonNextInDays <= 6, 'next storm scheduled 4-6 days out');

  // the announced signal sequence rises, peaks and falls, ending with 'none'
  const order = { none: 0, signal1: 1, signal3: 2, signal8: 3, signal9: 4, signal10: 5 };
  const stages = signals.filter((s) => s.name === name).map((s) => order[s.stage]);
  assert.ok(stages.length >= 3, `expected a signal arc, got ${JSON.stringify(signals)}`);
  const peak = Math.max(...stages);
  const peakIndex = stages.indexOf(peak);
  for (let i = 1; i <= peakIndex; i++) assert.ok(stages[i] >= stages[i - 1], 'signals rise to the peak');
  for (let i = peakIndex + 1; i < stages.length; i++) assert.ok(stages[i] <= stages[i - 1], 'signals fall after the peak');
  assert.equal(stages[stages.length - 1], 0, 'the storm ends with the signal lowered');
});

test('a paused clock leaves the weather exactly where it was', () => {
  const { city, advance } = createWeatherContext({ month: 8 });
  city.weather.typhoonActive = true;
  city.weather.typhoonDurationHours = 24;
  city.weather.typhoonHoursElapsed = 5;
  city.weather.conditionUntilMinutes = 500;
  const before = JSON.stringify(city.weather);
  advance(300, 300);
  assert.equal(JSON.stringify(city.weather), before);
});

test('a fast-forwarded frame replays every displayed hour it spans', () => {
  const { city, advance } = createWeatherContext({ month: 8 });
  city.weather.typhoonActive = true;
  city.weather.typhoonDurationHours = 36;
  city.weather.typhoonHoursElapsed = 0;
  city.weather.typhoonPeakWindKph = 130;
  city.weather.conditionUntilMinutes = 99 * HOUR;
  advance(0, 30 * HOUR);
  assert.equal(city.weather.typhoonHoursElapsed, 30, 'thirty hour boundaries crossed, thirty hours elapsed');
});

test('legacy saves migrate: calendar-tick storms keep their place in the arc, old condition timers just expire', () => {
  const start = cityStateSource.indexOf('function migrateTyphoonLifecycle(');
  const end = cityStateSource.indexOf('\n}\n', start) + 3;
  const context = vm.createContext({ Math });
  vm.runInContext(cityStateSource.slice(start, end), context);
  const migrate = (weather) => vm.runInContext(`migrateTyphoonLifecycle(${JSON.stringify(weather)})`, context);

  // 8 of 9 legacy ticks (the strongest tier) halfway through -> 18..36h scale, half elapsed
  const legacy = migrate({ typhoonActive: true, typhoonDurationTicks: 8, typhoonTicksElapsed: 4 });
  assert.ok(legacy.typhoonDurationHours >= 18 && legacy.typhoonDurationHours <= 36, JSON.stringify(legacy));
  assert.equal(legacy.typhoonHoursElapsed, Math.round(legacy.typhoonDurationHours / 2));
  // no active storm in the old save -> nothing to carry
  assert.equal(JSON.stringify(migrate({ typhoonActive: false, typhoonDurationTicks: 7, typhoonTicksElapsed: 2 })), JSON.stringify({ typhoonDurationHours: 0, typhoonHoursElapsed: 0 }));
  // already-migrated saves pass through, clamped
  assert.equal(JSON.stringify(migrate({ typhoonDurationHours: 30, typhoonHoursElapsed: 45 })), JSON.stringify({ typhoonDurationHours: 30, typhoonHoursElapsed: 30 }));

  // the normaliser drops conditionTicksLeft and starts the new timer at 0
  assert.match(cityStateSource, /conditionUntilMinutes: Math\.max\(0, toFiniteOr\(savedWeather\.conditionUntilMinutes, 0\)\)/);
  assert.doesNotMatch(cityStateSource, /conditionTicksLeft: Math\.max/);
});

test('the small hours deepen the night from 23:00, hold 00:30-04:30, and ease out by 05:30', () => {
  const context = vm.createContext({ city: { weather: freshWeather() }, console });
  vm.runInContext(weatherSource, context, { filename: 'sim-weather.js' });
  const depth = (minute) => vm.runInContext(`getDeepNightDepth(${minute})`, context);
  const H = 60;
  assert.equal(depth(22 * H + 59), 0);
  assert.equal(depth(21 * H), 0);
  assert.equal(depth(12 * H), 0, 'noon');
  assert.equal(depth(6 * H), 0);
  assert.equal(depth(5 * H + 30), 0);
  assert.ok(Math.abs(depth(23 * H + 45) - 0.5) < 1e-9, 'halfway in at 23:45');
  assert.equal(depth(0 * H + 30), 1);
  assert.equal(depth(2 * H), 1);
  assert.equal(depth(4 * H + 30), 1);
  assert.ok(Math.abs(depth(5 * H) - 0.5) < 1e-9, 'halfway out at 05:00');
  // monotone on each ramp, and smooth (no jump larger than a few percent per minute)
  let prev = depth(23 * H);
  for (let m = 23 * H + 1; m < 24 * H + 30; m += 1) {
    const d = depth(m % 1440);
    assert.ok(d >= prev && d - prev < 0.05, `ramp in at ${m}`);
    prev = d;
  }
  prev = depth(4 * H + 30);
  for (let m = 4 * H + 31; m <= 5 * H + 30; m += 1) {
    const d = depth(m);
    assert.ok(d <= prev && prev - d < 0.05, `ramp out at ${m}`);
    prev = d;
  }
});
