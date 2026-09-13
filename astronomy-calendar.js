// ── Hong Kong astronomy calendar client ─────────────────────────────────────
// The server seeds its SQLite calendar from the bundled, versioned HKO 2026
// reference data. Runtime fetches are deliberately per game date (not per
// frame): the result is kept in memory for the rest of the session and the
// bundled equinox-like fallback keeps the sky usable if the local API is down.

const ASTRONOMY_API_BASE = '/api/astronomy';
const ASTRONOMY_FALLBACK = Object.freeze({
  sourceVersion: 'fallback',
  referenceYear: 2026,
  timezone: 'Asia/Hong_Kong',
  latitude: 22.302028,
  longitude: 114.174333,
  month: 3,
  day: 20,
  sunriseMinutes: 384,
  solarTransitMinutes: 770,
  sunsetMinutes: 1155,
  moonriseMinutes: null,
  moonTransitMinutes: null,
  moonsetMinutes: null,
  moonPhase: 0.5,
  civilTwilightMinutes: 24,
  nauticalTwilightMinutes: 52,
  astronomicalTwilightMinutes: 80,
});

const astronomyCalendarCache = new Map();
const astronomyCalendarPending = new Map();
let activeAstronomyDateKey = null;
let activeAstronomyData = null;

// One sky-day is one calendar month (game-clock.js), so the 30 calendar days
// all pass inside a single sunrise-to-sunrise. Sampling the mid-month row
// gives that sky-day one sunrise and one sunset instead of keyframes that
// creep by a minute or two every 48 displayed minutes.
const ASTRONOMY_SAMPLE_DAY = 15;

function getAstronomyDateKey(
  month = typeof city !== 'undefined' ? city?.month : 1,
  day = ASTRONOMY_SAMPLE_DAY,
) {
  const safeMonth = Math.max(1, Math.min(12, Math.trunc(Number(month) || 1)));
  const safeDay = Math.max(1, Math.min(31, Math.trunc(Number(day) || 1)));
  return `${safeMonth}-${safeDay}`;
}

function normalizeAstronomyData(data, month, day) {
  const normalized = { ...ASTRONOMY_FALLBACK, ...(data || {}) };
  normalized.month = Math.max(1, Math.min(12, Math.trunc(Number(month ?? normalized.month) || 1)));
  normalized.day = Math.max(1, Math.min(31, Math.trunc(Number(day ?? normalized.day) || 1)));
  const minuteFields = [
    'sunriseMinutes', 'solarTransitMinutes', 'sunsetMinutes',
    'civilTwilightMinutes', 'nauticalTwilightMinutes', 'astronomicalTwilightMinutes',
  ];
  minuteFields.forEach((field) => {
    if (!Number.isFinite(Number(normalized[field]))) normalized[field] = ASTRONOMY_FALLBACK[field];
    normalized[field] = Number(normalized[field]);
  });
  ['moonriseMinutes', 'moonTransitMinutes', 'moonsetMinutes'].forEach((field) => {
    normalized[field] = normalized[field] !== null && normalized[field] !== undefined
      && Number.isFinite(Number(normalized[field])) ? Number(normalized[field]) : null;
  });
  normalized.moonPhase = Math.max(0, Math.min(1, Number(normalized.moonPhase) || 0));
  return normalized;
}

function getCurrentAstronomyData() {
  const key = getAstronomyDateKey();
  const cached = astronomyCalendarCache.get(key);
  if (cached) {
    activeAstronomyDateKey = key;
    activeAstronomyData = cached;
    return cached;
  }
  // Fire-and-cache: rendering keeps yesterday's adjacent astronomy row while
  // the next game date is loading. The old current-key-only check dropped back
  // to the March fallback on every date boundary; around a winter sunset that
  // briefly turned an already-dark sky red again, producing a black/red flash.
  // Adjacent real dates differ by only a minute or two, so holding the previous
  // row is both visually continuous and much closer than a seasonal fallback.
  ensureAstronomyForDate().catch(() => {});
  if (activeAstronomyData) return activeAstronomyData;
  const [month, day] = key.split('-').map(Number);
  return normalizeAstronomyData(null, month, day);
}

async function ensureAstronomyForDate(
  month = typeof city !== 'undefined' ? city?.month : 1,
  day = ASTRONOMY_SAMPLE_DAY,
) {
  const key = getAstronomyDateKey(month, day);
  if (astronomyCalendarCache.has(key)) {
    const cached = astronomyCalendarCache.get(key);
    if (getAstronomyDateKey() === key) {
      activeAstronomyDateKey = key;
      activeAstronomyData = cached;
    }
    return cached;
  }
  if (astronomyCalendarPending.has(key)) return astronomyCalendarPending.get(key);

  const [safeMonth, safeDay] = key.split('-').map(Number);
  const request = fetch(`${ASTRONOMY_API_BASE}/${safeMonth}/${safeDay}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Astronomy API returned ${response.status}`);
      const data = normalizeAstronomyData(await response.json(), safeMonth, safeDay);
      astronomyCalendarCache.set(key, data);
      if (getAstronomyDateKey() === key) {
        activeAstronomyDateKey = key;
        activeAstronomyData = data;
        if (typeof activeScene !== 'undefined' && activeScene
          && typeof updateDynamicLighting === 'function') updateDynamicLighting(activeScene);
      }
      return data;
    })
    .catch((error) => {
      console.warn(`[Astronomy] Using fallback for ${key}:`, error?.message || error);
      const fallback = normalizeAstronomyData(null, safeMonth, safeDay);
      astronomyCalendarCache.set(key, fallback);
      if (getAstronomyDateKey() === key) {
        activeAstronomyDateKey = key;
        activeAstronomyData = fallback;
      }
      return fallback;
    })
    .finally(() => astronomyCalendarPending.delete(key));

  astronomyCalendarPending.set(key, request);
  return request;
}

if (typeof onGameClockEvent === 'function') {
  onGameClockEvent('gameclock:month', ({ month }) => {
    ensureAstronomyForDate(month, ASTRONOMY_SAMPLE_DAY).catch(() => {});
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ASTRONOMY_FALLBACK,
    getAstronomyDateKey,
    normalizeAstronomyData,
    getCurrentAstronomyData,
    ensureAstronomyForDate,
    astronomyCalendarCache,
  };
}
