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
  const city = { tick: 0, timeOfDayMinutes: 6 * 60, day: 1, month: 1, year: 1900 };

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

test('environment clock takes eight real minutes per 24 hours at displayed 1x', () => {
  const { context, city } = createClockContext({ simSpeedMul: 0.15 });
  vm.runInContext('advanceGameTimeOfDay(GAME_DAY_NIGHT_CYCLE_REAL_MS / 2, GAME_SPEEDS.SLOW)', context);
  assert.equal(city.timeOfDayMinutes, 18 * 60, 'half the cycle advances 06:00 to 18:00');
  vm.runInContext('advanceGameTimeOfDay(GAME_DAY_NIGHT_CYCLE_REAL_MS / 2, GAME_SPEEDS.SLOW)', context);
  assert.equal(city.timeOfDayMinutes, 6 * 60, 'the second half wraps through midnight to 06:00');
});

test('environment clock follows displayed 1x/2x/4x/8x speed labels and formats the topbar time', () => {
  const minutesAfterOneRealMinute = (speed) => {
    const { context, city } = createClockContext();
    vm.runInContext(`advanceGameTimeOfDay(60000, ${speed})`, context);
    return city.timeOfDayMinutes;
  };

  assert.equal(minutesAfterOneRealMinute(0.15), 9 * 60);
  assert.equal(minutesAfterOneRealMinute(0.5), 12 * 60);
  assert.equal(minutesAfterOneRealMinute(1), 18 * 60);
  assert.equal(minutesAfterOneRealMinute(2), 6 * 60);

  const { context } = createClockContext();
  assert.equal(vm.runInContext('formatGameTimeOfDay(0)', context), '00:00');
  assert.equal(vm.runInContext('formatGameTimeOfDay(15 * 60 + 11)', context), '15:11');
  assert.equal(vm.runInContext('formatGameTimeOfDay(24 * 60)', context), '00:00');
});

test('pausing freezes the environment clock together with the simulation', () => {
  const { context, city } = createClockContext({ simPaused: true, simSpeedMul: 0.15 });
  vm.runInContext('startGameClock(); updateGameClock(null, 1000)', context);
  assert.equal(city.timeOfDayMinutes, 6 * 60);
});

test('calendar: months are their real length, February keeps its leap day, and the year turns after Dec 31', () => {
  const { context, city, calls } = createClockContext();

  vm.runInContext('advanceCalendarDay()', context);
  assert.deepEqual({ day: city.day, month: city.month, year: city.year }, { day: 2, month: 1, year: 1900 });

  // January has 31 days: the 30th is not the end of the month
  city.day = 30; city.month = 1;
  vm.runInContext('advanceCalendarDay()', context);
  assert.deepEqual({ day: city.day, month: city.month, year: city.year }, { day: 31, month: 1, year: 1900 });
  assert.equal(calls.autosave, 0);
  vm.runInContext('advanceCalendarDay()', context);
  assert.deepEqual({ day: city.day, month: city.month, year: city.year }, { day: 1, month: 2, year: 1900 });
  // a month is a sky-day, so every month rollover is a sunrise checkpoint
  assert.equal(calls.autosave, 1, 'month rollover triggers exactly one autosave');

  // 1900 is not a leap year (divisible by 100, not 400): Feb 28 -> Mar 1
  city.day = 28; city.month = 2; city.year = 1900;
  vm.runInContext('advanceCalendarDay()', context);
  assert.deepEqual({ day: city.day, month: city.month }, { day: 1, month: 3 });
  // 1904 is: Feb 28 -> Feb 29 -> Mar 1
  city.day = 28; city.month = 2; city.year = 1904;
  vm.runInContext('advanceCalendarDay()', context);
  assert.deepEqual({ day: city.day, month: city.month }, { day: 29, month: 2 });
  vm.runInContext('advanceCalendarDay()', context);
  assert.deepEqual({ day: city.day, month: city.month }, { day: 1, month: 3 });
  // there is never a February 30th or an April 31st
  assert.equal(
    JSON.stringify(vm.runInContext('[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => getDaysInMonth(m, 1900))', context)),
    JSON.stringify([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]),
  );
  assert.equal(vm.runInContext('getDaysInMonth(2, 2000)', context), 29);
  assert.equal(vm.runInContext('getDaysInMonth(2, 1900)', context), 28);

  city.day = 31; city.month = 12; city.year = 1900;
  const autosavesBefore = calls.autosave;
  vm.runInContext('advanceCalendarDay()', context);
  assert.deepEqual({ day: city.day, month: city.month, year: city.year }, { day: 1, month: 1, year: 1901 });
  assert.equal(calls.autosave, autosavesBefore + 1, 'the year rollover is also a month rollover');
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

test('economy protection: one January (31 advances) produces exactly 4 legacy simulation pulses', () => {
  const { context, city, calls } = createClockContext();
  // Jan 1 -> Feb 1 is 31 advances: pulses on the 8th, 15th, 22nd and Feb 1st
  for (let i = 0; i < 31; i++) {
    vm.runInContext('advanceCalendarDay(); onCalendarDayAdvanced(null);', context);
  }
  assert.equal(calls.pulse, 4, 'four pulses/month keeps monthly economy cadence (city.tick % TICKS_PER_MONTH) unchanged');
  assert.equal(city.tick, 4);
  assert.deepEqual({ month: city.month, day: city.day }, { month: 2, day: 1 });
  assert.equal(calls.daily, 31, 'daily systems (transport) run on every calendar day');
  assert.equal(calls.hud, 31, 'HUD refreshes once per calendar day');
});

test('the frame hands buses the displayed span before replaying the calendar days it crossed', () => {
  const sequence = [];
  const { context } = createClockContext({
    simSpeedMul: 2,   // x8 sky: 1000 real ms = 24 displayed minutes, so 7 frames = 168 = 3.5 calendar days
    advanceTransportClock: (from, to) => sequence.push(['move', from, to]),
    runDailySystems: () => sequence.push(['daily']),
  });
  vm.runInContext('startGameClock()', context);
  for (let i = 0; i < 7; i++) vm.runInContext('updateGameClock(null, 1000)', context);

  const dailyIndices = sequence
    .map((entry, index) => entry[0] === 'daily' ? index : -1)
    .filter((index) => index >= 0);
  assert.equal(dailyIndices.length, 3, '168 displayed minutes cross three ~46-minute January days');
  for (const dailyIndex of dailyIndices) {
    assert.equal(sequence[dailyIndex - 1][0], 'move', 'the frame moves buses before it replays the day boundary');
  }
  const moves = sequence.filter(([kind]) => kind === 'move');
  assert.equal(moves.length, 7, 'one movement span per frame');
  const movedMinutes = moves.reduce((sum, [, from, to]) => sum + (to - from), 0);
  assert.ok(Math.abs(movedMinutes - 168) < 1e-6, `spans add up to the displayed minutes elapsed, got ${movedMinutes}`);
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
    feedRealMs(context, 120000); // 2 real minutes: one sky-day (= one month) at NORMAL (x4)
    // city.day wraps around at month/year boundaries, so count total days
    // advanced via the emitted 'day' events instead.
    return vm.runInContext('__events', context).filter(([name]) => name === 'day').length;
  };

  // The calendar follows the sky: the four speeds are x1/x2/x4/x8 of the
  // 8-real-minute day, so NORMAL (internally 1, displayed 4x) covers a whole
  // 30-day month in two real minutes.
  const oneX = daysAdvancedFor(1);
  const twoX = daysAdvancedFor(2);
  const halfX = daysAdvancedFor(0.5);
  const slowX = daysAdvancedFor(0.15);
  const paused = daysAdvancedFor(0);

  // starting Jan 1 1900: one sky-day is all of January, two are January and
  // February, half a sky-day is half of January's 31 days
  assert.equal(oneX, 31, `NORMAL should advance January in 2 real minutes, got ${oneX}`);
  assert.equal(twoX, 31 + 28, `FAST should advance January and February, got ${twoX}`);
  assert.ok(halfX === 15 || halfX === 16, `HALF should advance ~half of January, got ${halfX}`);
  assert.ok(slowX === 7 || slowX === 8, `SLOW should advance ~a quarter of January, got ${slowX}`);
  assert.equal(paused, 0, 'paused clock advances 0 days regardless of elapsed real time');
});

test('one sky-day is one month: 96 real minutes per game year at 1x, 12 at 8x, and the day of the month follows the sky', () => {
  const { context } = createClockContext();
  const cycleMs = vm.runInContext('GAME_DAY_NIGHT_CYCLE_REAL_MS', context);
  assert.equal((cycleMs * 12) / 60000, 96, 'a year is twelve sky-days of eight real minutes at displayed 1x');
  assert.equal((cycleMs * 12) / 60000 / 8, 12, 'twelve real minutes per year at displayed 8x');

  // day-of-month is a function of the sky time, with the month's real length
  // dividing the sky-day: January's 31 days are ~46.45 minutes each, February's
  // 28 are ~51.43
  const jan = vm.runInContext('getMinutesPerCalendarDay(1, 1900)', context);
  const feb = vm.runInContext('getMinutesPerCalendarDay(2, 1900)', context);
  assert.ok(Math.abs(jan - 1440 / 31) < 1e-9);
  assert.ok(Math.abs(feb - 1440 / 28) < 1e-9);
  const dayAt = (envMinutes, month = 1) => vm.runInContext(`getCalendarDayForEnvironmentMinutes(${envMinutes}, ${month}, 1900)`, context);
  assert.equal(dayAt(0), 1);
  assert.equal(dayAt(jan - 0.1), 1);
  assert.equal(dayAt(jan), 2);
  assert.equal(dayAt(12 * 60), 16, 'noon-ish sky is mid-month');
  assert.equal(dayAt(24 * 60 - 1), 31, 'the last slot before sunrise is the 31st in January');
  assert.equal(dayAt(24 * 60 - 1, 2), 28, '... and the 28th in February');
  assert.equal(dayAt(24 * 60), 1, 'the next sunrise is the first of the next month');
});

test('a fast-forwarded frame replays every calendar day it crossed, in order, and the pulse days land in sequence', () => {
  const { context, city, calls } = createClockContext({ simSpeedMul: 2 });
  const pulses = [];
  vm.runInContext("onGameClockEvent('gameclock:citypulse', (p) => __events.push(['pulse', p]));", context);
  vm.runInContext('startGameClock()', context);
  // 1000 real ms at x8 is the clamp and 24 displayed minutes; 400 clamped
  // frames = 9600 displayed minutes = 200 calendar days
  for (let i = 0; i < 400; i++) vm.runInContext('updateGameClock(null, 1000)', context);
  // 9600 displayed minutes = 6 whole sky-days (Jan-Jun 1900 = 181 days) plus
  // two thirds of July (20 of its 31 day boundaries)
  const dayEvents = vm.runInContext('__events', context).filter(([name]) => name === 'day');
  assert.equal(dayEvents.length, 181 + 20);
  assert.equal(calls.daily, 181 + 20);
  const pulseDays = vm.runInContext('__events', context).filter(([name]) => name === 'pulse').map(([, p]) => p.day);
  // January's day-1 pulse never fires (the city starts on it), then four a
  // month through June and three so far in July
  assert.equal(pulseDays.length, 3 + 5 * 4 + 3);
  assert.deepEqual(pulseDays.slice(0, 8), [8, 15, 22, 1, 8, 15, 22, 1], 'pulses fall on 8/15/22/1 in order');
  assert.deepEqual({ month: city.month, day: city.day }, { month: 7, day: 21 });
});

test('a loaded city has its day-of-month snapped to the sky', () => {
  const { context, city } = createClockContext();
  city.day = 27;
  city.timeOfDayMinutes = 12 * 60;
  city.environmentMinutes = 6 * 60 + 5 * 24 * 60; // noon on some later sky-day
  vm.runInContext('alignCalendarDayToEnvironment()', context);
  assert.equal(city.day, 8, 'noon is day 8 of the month');
});

test('the environmental clock counts displayed minutes monotonically and hands weather each span', () => {
  const spans = [];
  const { context, city } = createClockContext({
    simSpeedMul: 1,
    advanceWeatherClock: (from, to) => spans.push([from, to]),
  });
  assert.equal(city.environmentMinutes ?? 0, 0);
  // at NORMAL the day/night clock runs 4x: 8 real minutes -> 24h, so 2 real
  // minutes is one full displayed day
  vm.runInContext('advanceGameTimeOfDay(120000)', context);
  assert.ok(Math.abs(city.environmentMinutes - 1440) < 1e-6, `one displayed day, got ${city.environmentMinutes}`);
  // timeOfDayMinutes wrapped back to where it started; the counter did not
  assert.ok(Math.abs(city.timeOfDayMinutes - 6 * 60) < 1e-6);
  vm.runInContext('advanceGameTimeOfDay(30000)', context);
  assert.ok(city.environmentMinutes > 1440);
  // weather was handed every span, contiguous and in order
  assert.equal(spans.length, 2);
  assert.equal(spans[0][0], 0);
  assert.ok(Math.abs(spans[0][1] - spans[1][0]) < 1e-9, 'spans are contiguous');
  assert.ok(spans[1][1] > spans[1][0]);
  // a paused clock hands weather nothing
  const paused = createClockContext({ simPaused: true, advanceWeatherClock: (from, to) => spans.push([from, to]) });
  vm.runInContext('updateGameClock(null, 5000)', paused.context);
  assert.equal(spans.length, 2, 'no weather span while paused');
});

test('weather no longer rides the calendar: the daily loop does not call it and the clock file owns the hook', () => {
  const simulation = fs.readFileSync(path.join(ROOT, 'simulation.js'), 'utf8');
  const daily = simulation.slice(simulation.indexOf('function runDailySystems('), simulation.indexOf('function runLegacyCitySimulationPulse('));
  assert.doesNotMatch(daily, /updateWeatherSimulation\(\)/);
  assert.match(clockSource, /advanceWeatherClock\(envBefore, envAfter\)/);
  // legacy per-calendar-day genesis derivation is gone with it
  assert.doesNotMatch(weatherSource, /WEATHER_TYPHOON_GENESIS_CHANCE/);
});
