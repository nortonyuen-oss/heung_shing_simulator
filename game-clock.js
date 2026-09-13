// ── Game Clock ────────────────────────────────────────────────────────────────
// One clock. The environmental (day/night) clock is the master: real frame
// deltas, scaled by the player's chosen speed, advance city.timeOfDayMinutes
// and the monotonic city.environmentMinutes. Everything else is derived from
// it:
//
//   - one displayed day (sunrise to sunrise) is one calendar MONTH: the
//     month's days (real lengths, see getDaysInMonth) divide the sky-day
//     evenly, about 46-51 displayed minutes each, and the month rolls over
//     at the next 06:00;
//   - the heavy legacy city simulation (power/growth/economy/etc., see
//     simulation.js's runLegacyCitySimulationPulse) still runs on
//     CITY_SIMULATION_PULSE_DAYS — the same four dates/month the old
//     TICKS_PER_MONTH tick loop landed on — which now fall at 06:00, 11:36,
//     17:12 and 22:48 of the sky-day, and the month's settlement lands on the
//     06:00 one, so none of the existing tuning keyed on city.tick %
//     TICKS_PER_MONTH needs to change;
//   - weather (sim-weather.js) and the transport company's buses
//     (transport-expansion.js) run in displayed hours and minutes.
//
// Before this the calendar ran on its own 667 ms-per-day accumulator, so one
// sky-day covered 108-180 calendar days: the morning and the evening of the
// same sunrise were in different seasons, a bus took "several days" to reach
// the next stop, and monthly bills came due dozens of times per sunset.
//
// Speed state lives in main.js's simPaused/simSpeedMul globals (read/written
// here so every other consumer of those globals — topbar.js, traffic/vessel/
// aircraft-visuals.js, visual-route-calibrator.js — keeps working unchanged.
// The four speed values only pick a day/night multiplier now (1/2/4/8, see
// getDayNightSpeedMultiplier) and the ambient-traffic visual speed.

const GAME_SPEEDS = Object.freeze({
  PAUSED: 0,
  SLOW:   0.15,
  HALF:   0.5,
  NORMAL: 1,
  FAST:   2,
});
const GAME_SPEED_VALUES = Object.freeze(Object.values(GAME_SPEEDS));

// Months are their real length: 31/28/31/30/31/30/31/31/30/31/30/31, with a
// Gregorian leap day in February (1904 has one, 1900 does not). The HKO
// astronomy table the sky reads from is a real calendar too, so the two
// agree. GAME_DAYS_PER_MONTH is the nominal figure the four pulse dates are
// spaced on; nothing else should assume every month has thirty days.
const GAME_DAYS_PER_MONTH = 30;
const GAME_MONTH_LENGTHS = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

function isGameLeapYear(year) {
  const y = Math.trunc(Number(year) || 0);
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function getDaysInMonth(month, year) {
  const m = Math.max(1, Math.min(12, Math.trunc(Number(month) || 1)));
  if (m === 2 && isGameLeapYear(year)) return 29;
  return GAME_MONTH_LENGTHS[m - 1];
}

// At the topbar's displayed 1x speed it takes eight real minutes to traverse
// a full 24 hours; the 2x/4x/8x buttons scale it by their displayed labels,
// and pause freezes it. With a sky-day being a calendar month, a game year is
// 96 real minutes at 1x and 12 at 8x.
const GAME_TIME_MINUTES_PER_DAY = 24 * 60;
const GAME_DAY_NIGHT_CYCLE_REAL_MS = 8 * 60 * 1000;
const GAME_DAY_START_MINUTES = 6 * 60;

// Displayed minutes per calendar day: the month's days spread across the 24
// hours of one sky-day - 46.5 minutes in a 31-day month, 51.4 in February.
function getMinutesPerCalendarDay(month, year) {
  return GAME_TIME_MINUTES_PER_DAY / getDaysInMonth(month, year);
}

// The same four calendar dates per month the old tick loop displayed
// (TICKS_PER_MONTH=4 → 1/8/15/22). The heavy legacy simulation still runs
// only on these days, at the same 4x/month cadence as before; every month
// has at least 28 days, so all four always fall.
const CITY_SIMULATION_PULSE_DAYS = Object.freeze(
  Array.from(
    { length: TICKS_PER_MONTH },
    (_, i) => 1 + i * Math.floor(GAME_DAYS_PER_MONTH / TICKS_PER_MONTH),
  ),
);

// Real frame deltas are clamped before accumulating so that a backgrounded/
// throttled tab regaining focus doesn't dump a huge batch of catch-up days
// (and heavy simulation pulses) into a single frame.
const GAME_CLOCK_MAX_FRAME_DELTA_MS = 1000;

let gameClockRunning = false;

const gameClockListeners = {
  'gameclock:time': [],
  'gameclock:day': [],
  'gameclock:month': [],
  'gameclock:year': [],
  'gameclock:speedchange': [],
  'gameclock:citypulse': [],
  // Fired by sim-weather.js whenever the condition, a warning or a typhoon
  // signal actually changes; this is what the HUD refreshes on.
  'weather:change': [],
};

function onGameClockEvent(eventName, callback) {
  if (!gameClockListeners[eventName] || typeof callback !== 'function') return;
  gameClockListeners[eventName].push(callback);
}

function emitGameClockEvent(eventName, payload) {
  (gameClockListeners[eventName] || []).forEach((callback) => {
    try {
      callback(payload);
    } catch (error) {
      console.error(`[GameClock] listener for ${eventName} failed`, error);
    }
  });
}

// ── Speed API ───────────────────────────────────────────────────────────────

function getGameSpeed() {
  if (typeof simPaused !== 'undefined' && simPaused) return GAME_SPEEDS.PAUSED;
  return typeof simSpeedMul !== 'undefined' ? simSpeedMul : GAME_SPEEDS.NORMAL;
}

function isGamePaused() {
  return getGameSpeed() === GAME_SPEEDS.PAUSED;
}

function getDayNightSpeedMultiplier(speed = getGameSpeed()) {
  if (speed === GAME_SPEEDS.PAUSED) return 0;
  if (speed === GAME_SPEEDS.SLOW) return 1;
  if (speed === GAME_SPEEDS.HALF) return 2;
  if (speed === GAME_SPEEDS.NORMAL) return 4;
  if (speed === GAME_SPEEDS.FAST) return 8;
  return 1;
}

function normalizeGameTimeMinutes(value, fallback = GAME_DAY_START_MINUTES) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return ((safe % GAME_TIME_MINUTES_PER_DAY) + GAME_TIME_MINUTES_PER_DAY) % GAME_TIME_MINUTES_PER_DAY;
}

function getGameTimeOfDayMinutes() {
  return normalizeGameTimeMinutes(
    typeof city === 'undefined' ? GAME_DAY_START_MINUTES : city.timeOfDayMinutes,
  );
}

function formatGameTimeOfDay(value = getGameTimeOfDayMinutes()) {
  const totalMinutes = Math.floor(normalizeGameTimeMinutes(value));
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Monotonic count of environmental (display) minutes since the city began.
// timeOfDayMinutes wraps every 24h, which is fine for the sky but useless for
// anything that has to know "is it later than when I started" across days -
// weather durations, typhoon lifecycles, bus servicing and the calendar
// itself are all timed against this instead.
function getEnvironmentMinutes() {
  if (typeof city === 'undefined') return 0;
  const value = Number(city.environmentMinutes);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

// Which calendar day of the month a given point of the sky-day is: day 1 at
// the sky-day's start (06:00), the middle of the month at 18:00, the last day
// in the final slot before the next sunrise.
function getCalendarDayForEnvironmentMinutes(
  environmentMinutes,
  month = typeof city !== 'undefined' ? city.month : 1,
  year = typeof city !== 'undefined' ? city.year : 1900,
) {
  const minuteOfDay = ((Number(environmentMinutes) || 0) % GAME_TIME_MINUTES_PER_DAY
    + GAME_TIME_MINUTES_PER_DAY) % GAME_TIME_MINUTES_PER_DAY;
  const days = getDaysInMonth(month, year);
  return Math.min(days, 1 + Math.floor(minuteOfDay / getMinutesPerCalendarDay(month, year)));
}

// Snap a loaded city's day-of-month to its sky time. Saves from before the
// calendar followed the display clock carry an arbitrary (day, time) pair;
// month and year are history and are left alone.
function alignCalendarDayToEnvironment() {
  if (typeof city === 'undefined') return;
  city.day = getCalendarDayForEnvironmentMinutes(getEnvironmentMinutes(), city.month, city.year);
}

function advanceGameTimeOfDay(realDeltaMs, speed = getGameSpeed()) {
  if (typeof city === 'undefined') return GAME_DAY_START_MINUTES;
  const previous = getGameTimeOfDayMinutes();
  const displaySpeed = getDayNightSpeedMultiplier(speed);
  const deltaMinutes = (Math.max(0, Number(realDeltaMs) || 0) / GAME_DAY_NIGHT_CYCLE_REAL_MS)
    * GAME_TIME_MINUTES_PER_DAY
    * displaySpeed;
  const next = normalizeGameTimeMinutes(previous + deltaMinutes);
  city.timeOfDayMinutes = next;
  const envBefore = getEnvironmentMinutes();
  const envAfter = envBefore + deltaMinutes;
  city.environmentMinutes = envAfter;
  if (Math.floor(previous) !== Math.floor(next)) {
    emitGameClockEvent('gameclock:time', {
      minutes: next,
      label: formatGameTimeOfDay(next),
      speed: displaySpeed,
      environmentMinutes: envAfter,
    });
  }
  // Weather and the bus company live on this clock too. Both advance in
  // whole environmental hours/minutes, so they are handed the span rather
  // than polled per frame.
  if (deltaMinutes > 0) {
    if (typeof advanceWeatherClock === 'function') advanceWeatherClock(envBefore, envAfter);
    if (typeof advanceTransportClock === 'function') advanceTransportClock(envBefore, envAfter);
  }
  return next;
}

// Traffic/vessel/aircraft visuals must never crawl slower than normal (1x) —
// the slow-motion clock speeds (0.15x/0.5x) exist for watching the calendar
// and weather unfold, not for making vehicles look like they're stuck. Only
// speeds faster than 1x actually speed vehicles up.
function getVehicleVisualSpeedMultiplier() {
  if (isGamePaused()) return 0;
  return Math.max(getGameSpeed(), GAME_SPEEDS.NORMAL);
}

// Single source of truth for changing speed. Pausing never overwrites
// simSpeedMul, so resuming (from any entry point) naturally continues at
// whatever non-zero speed was active before the pause.
function setGameSpeed(speed) {
  const normalized = GAME_SPEED_VALUES.includes(speed) ? speed : GAME_SPEEDS.NORMAL;
  if (typeof simPaused !== 'undefined') simPaused = normalized === GAME_SPEEDS.PAUSED;
  if (typeof simSpeedMul !== 'undefined' && normalized !== GAME_SPEEDS.PAUSED) {
    simSpeedMul = normalized;
  }
  emitGameClockEvent('gameclock:speedchange', { speed: normalized });
}

// ── Calendar ────────────────────────────────────────────────────────────────

function advanceCalendarDay() {
  city.day += 1;
  let monthAdvanced = false;
  let yearAdvanced = false;

  if (city.day > getDaysInMonth(city.month, city.year)) {
    city.day = 1;
    city.month += 1;
    monthAdvanced = true;

    if (city.month > 12) {
      city.month = 1;
      city.year += 1;
      yearAdvanced = true;
    }
  }

  const payload = { day: city.day, month: city.month, year: city.year, speed: getGameSpeed() };
  emitGameClockEvent('gameclock:day', payload);
  if (monthAdvanced) {
    emitGameClockEvent('gameclock:month', payload);
    // A month is a sky-day now, so this is a once-a-sunrise checkpoint - the
    // old once-a-January autosave would be 96 real minutes apart at 1x.
    if (typeof triggerAutosave === 'function') triggerAutosave();
  }
  if (yearAdvanced) emitGameClockEvent('gameclock:year', payload);
}

function shouldRunCitySimulationPulse(day) {
  return CITY_SIMULATION_PULSE_DAYS.includes(day);
}

function onCalendarDayAdvanced(scene) {
  if (typeof runDailySystems === 'function') runDailySystems(scene);

  if (shouldRunCitySimulationPulse(city.day)) {
    if (typeof runLegacyCitySimulationPulse === 'function') runLegacyCitySimulationPulse(scene);
    city.tick++;
    emitGameClockEvent('gameclock:citypulse', {
      tick: city.tick, day: city.day, month: city.month, year: city.year,
    });
  }

  // Refreshed once per calendar day, after the daily systems and (if it ran)
  // the heavy pulse have both settled today's state.
  if (typeof updateHUD === 'function') updateHUD();
}

// The calendar is a pure function of environmental minutes: every 1440 of
// them is a month, and the month's days divide that sky-day evenly. A frame
// that crosses several day boundaries (fast-forward, or a clamped catch-up
// after the tab was hidden) replays each one in order so the pulse days land
// in sequence. The current day's end is found from city.day and the length
// of city.month, so the step adapts as months change length.
function advanceCalendarForEnvironmentMinutes(scene, fromMinutes, toMinutes) {
  const from = Math.max(0, Number(fromMinutes) || 0);
  const to = Math.max(from, Number(toMinutes) || 0);
  if (typeof city === 'undefined' || to <= from) return;
  const epsilon = 1e-6;
  let cursor = from;
  for (let guard = 0; guard < 100000; guard++) {
    const skyDayBase = Math.floor((cursor + epsilon) / GAME_TIME_MINUTES_PER_DAY) * GAME_TIME_MINUTES_PER_DAY;
    const dayEnds = skyDayBase + city.day * getMinutesPerCalendarDay(city.month, city.year);
    if (dayEnds > to + epsilon) break;
    advanceCalendarDay();
    onCalendarDayAdvanced(scene);
    cursor = dayEnds;
  }
}

// ── Frame driver ────────────────────────────────────────────────────────────
// Call once per Phaser update-loop frame with the real frame delta (ms).
function updateGameClock(scene, realDeltaMs) {
  if (!gameClockRunning || isGamePaused()) return;

  const speed = getGameSpeed();
  const clampedDeltaMs = Math.min(GAME_CLOCK_MAX_FRAME_DELTA_MS, Math.max(0, Number(realDeltaMs) || 0));
  const envBefore = getEnvironmentMinutes();
  advanceGameTimeOfDay(clampedDeltaMs, speed);
  advanceCalendarForEnvironmentMinutes(scene, envBefore, getEnvironmentMinutes());
}

function startGameClock() {
  gameClockRunning = true;
}

function stopGameClock() {
  gameClockRunning = false;
}

// Kept for the two load paths that used to reset the calendar accumulator;
// the calendar is derived now, so this just re-aligns the day to the sky.
function resetGameClockAccumulator() {
  alignCalendarDayToEnvironment();
}
