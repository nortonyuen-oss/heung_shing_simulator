const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const clockSource = fs.readFileSync(path.join(ROOT, 'game-clock.js'), 'utf8');
const weatherSource = fs.readFileSync(path.join(ROOT, 'sim-weather.js'), 'utf8');

// game-clock.js is a plain (non-module) script loaded after constants.js in
// index.html — it expects TICKS_PER_MONTH, a mutable `city`, and the legacy
// simPaused/simSpeedMul speed globals to already exist, and calls a handful
// of optional hooks (runDailySystems/runLegacyCitySimulationPulse/updateHUD/
// triggerAutosave) purely by `typeof x === 'function'` check, exactly like
// every other cross-file call in this codebase.
function createClockContext(overrides = {}) {
  const calls = { daily: 0, pulse: 0, hud: 0, autosave: 0 };
  const events = [];
  const city = { tick: 0, day: 1, month: 1, year: 1900 };

  const sandbox = {
    city,
    simPaused: false,
    simSpeedMul: 1,
    TICKS_PER_MONTH: 4,
    console,
    runDailySystems: () => { calls.daily++; },
    runLegacyCitySimulationPulse: () => { calls.pulse++; },
    updateHUD: () => { calls.hud++; },
    triggerAutosave: () => { calls.autosave++; },
    ...overrides,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(clockSource, context, { filename: 'game-clock.js' });
  vm.runInContext(
    "onGameClockEvent('gameclock:day', (p) => __events.push(['day', p]));"
    + "onGameClockEvent('gameclock:month', (p) => __events.push(['month', p]));"
    + "onGameClockEvent('gameclock:year', (p) => __events.push(['year', p]));"
    + "onGameClockEvent('gameclock:citypulse', (p) => __events.push(['citypulse', p]));",
    context,
  );
  context.__events = events;
  return { context, city, calls, events };
}

test('GAME_SPEEDS exposes exactly the five required speeds in the right values', () => {
  const { context } = createClockContext();
  const speeds = { ...vm.runInContext('GAME_SPEEDS', context) };
  assert.deepEqual(speeds, { PAUSED: 0, SLOW: 0.15, HALF: 0.5, NORMAL: 1, FAST: 2 });
});

test('default speed is 1x and setGameSpeed normalizes an invalid speed to 1x', () => {
  const { context } = createClockContext();
  assert.equal(vm.runInContext('getGameSpeed()', context), 1);
  assert.equal(vm.runInContext('isGamePaused()', context), false);

  vm.runInContext('setGameSpeed(4)', context); // 4x no longer exists
  assert.equal(vm.runInContext('getGameSpeed()', context), 1);
});

test('pausing does not clobber simSpeedMul, so resuming continues at the prior speed', () => {
  const { context } = createClockContext({ simSpeedMul: 2 });
  vm.runInContext('setGameSpeed(GAME_SPEEDS.PAUSED)', context);
  assert.equal(vm.runInContext('isGamePaused()', context), true);
  assert.equal(vm.runInContext('simSpeedMul', context), 2);
  vm.runInContext('setGameSpeed(simSpeedMul)', context);
  assert.equal(vm.runInContext('getGameSpeed()', context), 2);
});

test('vehicle visual speed never drops below 1x at slow-motion game speeds, but scales up above 1x', () => {
  const speedFor = (simSpeedMul, simPaused = false) => {
    const { context } = createClockContext({ simSpeedMul, simPaused });
    return vm.runInContext('getVehicleVisualSpeedMultiplier()', context);
  };

  assert.equal(speedFor(0.15), 1, '0.15x game speed still moves vehicles at normal (1x) speed');
  assert.equal(speedFor(0.5), 1, '0.5x game speed still moves vehicles at normal (1x) speed');
  assert.equal(speedFor(1), 1, '1x game speed moves vehicles at normal (1x) speed');
  assert.equal(speedFor(2), 2, '2x game speed doubles vehicle speed');
  assert.equal(speedFor(2, true), 0, 'pausing stops vehicle movement regardless of the stored speed');
});

test('calendar: Jan 1 -> Jan 2, Jan 30 -> Feb 1, Dec 30 -> Jan 1 of next year (with autosave)', () => {
  const { context, city, calls } = createClockContext();

  vm.runInContext('advanceCalendarDay()', context);
  assert.deepEqual({ day: city.day, month: city.month, year: city.year }, { day: 2, month: 1, year: 1900 });

  city.day = 30; city.month = 1;
  vm.runInContext('advanceCalendarDay()', context);
  assert.deepEqual({ day: city.day, month: city.month, year: city.year }, { day: 1, month: 2, year: 1900 });

  city.day = 30; city.month = 12; city.year = 1900;
  assert.equal(calls.autosave, 0);
  vm.runInContext('advanceCalendarDay()', context);
  assert.deepEqual({ day: city.day, month: city.month, year: city.year }, { day: 1, month: 1, year: 1901 });
  assert.equal(calls.autosave, 1, 'year rollover triggers exactly one autosave');
});

test('shouldRunCitySimulationPulse is true only on days 1/8/15/22', () => {
  const { context } = createClockContext();
  const pulseDays = vm.runInContext('CITY_SIMULATION_PULSE_DAYS', context);
  assert.deepEqual([...pulseDays], [1, 8, 15, 22]);

  [1, 8, 15, 22].forEach((day) => {
    assert.equal(vm.runInContext(`shouldRunCitySimulationPulse(${day})`, context), true, `day ${day}`);
  });
  [2, 7, 9, 30].forEach((day) => {
    assert.equal(vm.runInContext(`shouldRunCitySimulationPulse(${day})`, context), false, `day ${day}`);
  });
});

test('economy protection: 30 calendar-day advances produce exactly 4 legacy simulation pulses', () => {
  const { context, city, calls } = createClockContext();
  for (let i = 0; i < 30; i++) {
    vm.runInContext('advanceCalendarDay(); onCalendarDayAdvanced(null);', context);
  }
  assert.equal(calls.pulse, 4, 'four pulses/month keeps monthly economy cadence (city.tick % TICKS_PER_MONTH) unchanged');
  assert.equal(city.tick, 4);
  assert.equal(calls.daily, 30, 'daily systems (weather) run on every calendar day');
  assert.equal(calls.hud, 30, 'HUD refreshes once per calendar day');
});

test('clock advances authoritative vehicles before each midnight commuter reset', () => {
  const sequence = [];
  const { context } = createClockContext({
    simSpeedMul: 2,
    advanceTransportVehiclesByGameDays: (days) => sequence.push(['move', days]),
    runDailySystems: () => sequence.push(['daily']),
  });
  vm.runInContext('startGameClock(); updateGameClock(null, 1000);', context);

  const dailyIndices = sequence
    .map((entry, index) => entry[0] === 'daily' ? index : -1)
    .filter((index) => index >= 0);
  assert.equal(dailyIndices.length, 3, '1000 ms at 2x spans exactly three game days');
  for (const dailyIndex of dailyIndices) {
    assert.equal(sequence[dailyIndex - 1][0], 'move', 'vehicle movement for the elapsed day happens before arrivals');
  }
  const movedDays = sequence
    .filter(([kind]) => kind === 'move')
    .reduce((sum, [, days]) => sum + days, 0);
  assert.ok(Math.abs(movedDays - 3) < 1e-9);
});

test('speed ratio: 2x/0.5x/0.15x advance proportionally to 1x over the same real time, pause advances 0 days', () => {
  const feedRealMs = (context, totalMs, stepMs = 500) => {
    let remaining = totalMs;
    while (remaining > 0) {
      const step = Math.min(stepMs, remaining);
      vm.runInContext(`updateGameClock(null, ${step})`, context);
      remaining -= step;
    }
  };

  const daysAdvancedFor = (speed) => {
    const { context } = createClockContext({ simSpeedMul: speed === 0 ? 1 : speed, simPaused: speed === 0 });
    vm.runInContext('startGameClock()', context);
    feedRealMs(context, 20000); // 20 real seconds — exactly 1 game month at 1x
    // city.day wraps around at month/year boundaries, so count total days
    // advanced via the emitted 'day' events instead.
    return vm.runInContext('__events', context).filter(([name]) => name === 'day').length;
  };

  const oneX = daysAdvancedFor(1);
  const twoX = daysAdvancedFor(2);
  const halfX = daysAdvancedFor(0.5);
  const slowX = daysAdvancedFor(0.15);
  const paused = daysAdvancedFor(0);

  assert.ok(Math.abs(oneX - 30) <= 1, `1x should advance ~30 days, got ${oneX}`);
  assert.ok(Math.abs(twoX - 2 * oneX) <= 1, `2x should advance ~2x as many days as 1x, got ${twoX} vs ${oneX}`);
  assert.ok(Math.abs(halfX - 0.5 * oneX) <= 1, `0.5x should advance ~half as many days as 1x, got ${halfX} vs ${oneX}`);
  assert.ok(Math.abs(slowX - 0.15 * oneX) <= 1, `0.15x should advance ~0.15x as many days as 1x, got ${slowX} vs ${oneX}`);
  assert.equal(paused, 0, 'paused clock advances 0 days regardless of elapsed real time');
});

test('0.15x speed produces roughly 27 real minutes per game year (acceptance criterion)', () => {
  const { context } = createClockContext({ simSpeedMul: 0.15 });
  const baseRealMsPerGameDay = vm.runInContext('BASE_REAL_MS_PER_GAME_DAY', context);
  const gameDaysPerMonth = vm.runInContext('GAME_DAYS_PER_MONTH', context);
  const realMsPerYearAt015x = (baseRealMsPerGameDay * gameDaysPerMonth * 12) / 0.15;
  const realMinutesPerYear = realMsPerYearAt015x / 60000;
  assert.ok(Math.abs(realMinutesPerYear - 26.67) < 0.5, `expected ~26.7 min/year, got ${realMinutesPerYear.toFixed(2)}`);
});

test('typhoon genesis: daily probability is re-derived so per-month storm odds match the legacy 4-evaluation/month chance', () => {
  const context = vm.createContext({ TICKS_PER_MONTH: 4, GAME_DAYS_PER_MONTH: 30, Math });
  vm.runInContext(weatherSource, context, { filename: 'sim-weather.js' });

  const legacy = vm.runInContext('WEATHER_TYPHOON_GENESIS_CHANCE_LEGACY', context);
  const daily = vm.runInContext('WEATHER_TYPHOON_GENESIS_CHANCE', context);

  assert.ok(daily > 0 && daily < legacy, 'daily chance must be strictly smaller than the old per-evaluation chance');

  // Probability of *no* genesis over a full game month must match between
  // the old (4 evaluations/month) and new (30 evaluations/month) cadence -
  // that's what keeps storms-per-year roughly unchanged.
  const legacyNoGenesisPerMonth = (1 - legacy) ** 4;
  const dailyNoGenesisPerMonth = (1 - daily) ** 30;
  assert.ok(
    Math.abs(legacyNoGenesisPerMonth - dailyNoGenesisPerMonth) < 1e-9,
    `expected equal monthly no-genesis odds, got legacy=${legacyNoGenesisPerMonth} daily=${dailyNoGenesisPerMonth}`,
  );
});
