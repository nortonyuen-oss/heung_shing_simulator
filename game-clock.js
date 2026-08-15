// ── Game Clock ────────────────────────────────────────────────────────────────
// Decouples real wall-clock time from the calendar. Real frame deltas
// accumulate (scaled by the player's chosen speed) into whole calendar days;
// the calendar advances every day, but the heavy legacy city simulation
// (power/growth/economy/etc., see simulation.js's runLegacyCitySimulationPulse)
// still only runs on CITY_SIMULATION_PULSE_DAYS — the same four dates/month
// the old TICKS_PER_MONTH-based tick loop landed on — so none of the existing
// monthly tuning keyed on city.tick % TICKS_PER_MONTH needs to change.
//
// Speed state lives in main.js's simPaused/simSpeedMul globals (read/written
// here so every other consumer of those globals — topbar.js, traffic/vessel/
// aircraft-visuals.js, visual-route-calibrator.js — keeps working unchanged.

const GAME_SPEEDS = Object.freeze({
  PAUSED: 0,
  SLOW:   0.15,
  HALF:   0.5,
  NORMAL: 1,
  FAST:   2,
});
const GAME_SPEED_VALUES = Object.freeze(Object.values(GAME_SPEEDS));

const GAME_DAYS_PER_MONTH = 30;
// 1x baseline preserved from the legacy SIM_TICK_MS(5000) * TICKS_PER_MONTH(4)
// pacing: 20 real sec/game month, ~4 real min/game year.
const BASE_REAL_MS_PER_GAME_DAY = 20000 / GAME_DAYS_PER_MONTH;

// The same four calendar dates per month the old tick loop displayed
// (TICKS_PER_MONTH=4 → 1/8/15/22). The heavy legacy simulation still runs
// only on these days, at the same 4x/month cadence as before.
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

let gameClockAccumulatorMs = 0;
let gameClockRunning = false;

const gameClockListeners = {
  'gameclock:day': [],
  'gameclock:month': [],
  'gameclock:year': [],
  'gameclock:speedchange': [],
  'gameclock:citypulse': [],
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

  if (city.day > GAME_DAYS_PER_MONTH) {
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
  if (monthAdvanced) emitGameClockEvent('gameclock:month', payload);
  if (yearAdvanced) {
    emitGameClockEvent('gameclock:year', payload);
    // Autosave at the start of each new year (January), same trigger point
    // as the old advanceDate().
    if (typeof triggerAutosave === 'function') triggerAutosave();
  }
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

  // Refreshed once per calendar day, after weather and (if it ran) the
  // heavy pulse have both settled today's state.
  if (typeof updateHUD === 'function') updateHUD();
}

// ── Frame driver ────────────────────────────────────────────────────────────
// Call once per Phaser update-loop frame with the real frame delta (ms).
// Uses a single accumulator instead of a per-speed setInterval, per the
// clock refactor spec (no destroy/recreate-timer-per-speed).
function updateGameClock(scene, realDeltaMs) {
  if (!gameClockRunning || isGamePaused()) return;

  const speed = getGameSpeed();
  const clampedDeltaMs = Math.min(GAME_CLOCK_MAX_FRAME_DELTA_MS, Math.max(0, Number(realDeltaMs) || 0));
  gameClockAccumulatorMs += clampedDeltaMs * speed;

  while (gameClockAccumulatorMs >= BASE_REAL_MS_PER_GAME_DAY) {
    gameClockAccumulatorMs -= BASE_REAL_MS_PER_GAME_DAY;
    advanceCalendarDay();
    onCalendarDayAdvanced(scene);
  }
}

function startGameClock() {
  gameClockRunning = true;
}

function stopGameClock() {
  gameClockRunning = false;
}

function resetGameClockAccumulator() {
  gameClockAccumulatorMs = 0;
}
