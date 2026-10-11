// 香城節令 (festivals): the festivals, and what a city stores about them. Design:
// docs/festival-dlc-design.md. Which month each falls in is festival-calendar.js.
//
// A festival's progress (setup, peak, teardown) is worked out from the clock, like the typhoon
// shelter fleet, so nothing about a running festival is saved. city.festivals holds only:
//   enabled      the city's master switch (Settings → 節慶活動)
//   festivals    per festival: enabled, and the funding tier of a government-run one
//   venues       per festival: a venue the player picked over the automatic choice ('' = auto)
//   history      what happened each year (outcome, attendance, money), the latest FESTIVAL_HISTORY_LIMIT
//   ufo          when the last UFO came, and how many have
// Adding a field here needs it in normalizeFestivalState too (city-state.js normalises with it).

// organiser: 'government' festivals take a funding tier; 'community' ones (六四, 盂蘭 燒街衣) are
// put on by the people, cost the treasury nothing and have no tier. venue: the kind of place it
// is held (festival-venues.js, Phase 1). kind 'random' has no calendar date.
const FESTIVAL_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'lunarNewYear', kind: 'calendar', organiser: 'government', venue: 'flagshipPark', label: '新春年宵' }),
  Object.freeze({ id: 'dragonBoat', kind: 'calendar', organiser: 'government', venue: 'promenade', label: '端午龍舟＋搶包山' }),
  Object.freeze({ id: 'june4', kind: 'calendar', organiser: 'community', venue: 'flagshipPark', label: '六四燭光晚會' }),
  Object.freeze({ id: 'yulan', kind: 'calendar', organiser: 'community', venue: 'residentialKerbs', label: '盂蘭燒街衣' }),
  Object.freeze({ id: 'midAutumn', kind: 'calendar', organiser: 'government', venue: 'residentialRoute', label: '中秋舞火龍' }),
  Object.freeze({ id: 'christmas', kind: 'calendar', organiser: 'government', venue: 'commercialStreets', label: '聖誕燈飾' }),
  Object.freeze({ id: 'ufo', kind: 'random', organiser: null, venue: 'anywhere', label: '發現 UFO' }),
]);
const FESTIVAL_DEFINITIONS_BY_ID = Object.freeze(Object.fromEntries(FESTIVAL_DEFINITIONS.map((d) => [d.id, d])));
const FESTIVAL_IDS = Object.freeze(FESTIVAL_DEFINITIONS.map((d) => d.id));

// 唔辦／簡辦／標準／盛大
const FESTIVAL_TIERS = Object.freeze(['skip', 'basic', 'standard', 'grand']);
const FESTIVAL_DEFAULT_TIER = 'standard';
const FESTIVAL_HISTORY_LIMIT = 40;
const FESTIVAL_OUTCOMES = Object.freeze(['held', 'skipped', 'cancelled', 'noVenue']);

function isGovernmentFestival(id) {
  return FESTIVAL_DEFINITIONS_BY_ID[id]?.organiser === 'government';
}

function createFestivalState() {
  return {
    version: 1,
    enabled: true,
    festivals: Object.fromEntries(FESTIVAL_IDS.map((id) => [id, {
      enabled: true,
      tier: isGovernmentFestival(id) ? FESTIVAL_DEFAULT_TIER : null,
    }])),
    venues: Object.fromEntries(FESTIVAL_IDS.map((id) => [id, ''])),
    history: [],
    ufo: { lastMonthIndex: -1, sightings: 0 },
  };
}

const festivalInt = (value, fallback) => (Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback);

function normalizeFestivalHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object' || !FESTIVAL_DEFINITIONS_BY_ID[entry.id]) return null;
  const year = festivalInt(entry.year, NaN);
  if (!Number.isFinite(year)) return null;
  return {
    id: entry.id,
    year,
    outcome: FESTIVAL_OUTCOMES.includes(entry.outcome) ? entry.outcome : 'held',
    attendance: Math.max(0, festivalInt(entry.attendance, 0)),
    cost: Math.max(0, festivalInt(entry.cost, 0)),
    income: Math.max(0, festivalInt(entry.income, 0)),
  };
}

/** A clean city.festivals from whatever a save holds (missing or older saves get the defaults). */
function normalizeFestivalState(raw) {
  const state = createFestivalState();
  if (!raw || typeof raw !== 'object') return state;
  state.enabled = raw.enabled !== false;
  FESTIVAL_IDS.forEach((id) => {
    const saved = raw.festivals?.[id];
    if (!saved || typeof saved !== 'object') return;
    state.festivals[id].enabled = saved.enabled !== false;
    if (isGovernmentFestival(id) && FESTIVAL_TIERS.includes(saved.tier)) state.festivals[id].tier = saved.tier;
  });
  FESTIVAL_IDS.forEach((id) => {
    if (typeof raw.venues?.[id] === 'string') state.venues[id] = raw.venues[id].slice(0, 60);
  });
  state.history = (Array.isArray(raw.history) ? raw.history : [])
    .map(normalizeFestivalHistoryEntry).filter(Boolean).slice(-FESTIVAL_HISTORY_LIMIT);
  state.ufo = {
    lastMonthIndex: festivalInt(raw.ufo?.lastMonthIndex, -1),
    sightings: Math.max(0, festivalInt(raw.ufo?.sightings, 0)),
  };
  return state;
}

function getCityFestivalState() {
  if (typeof city === 'undefined' || !city) return null;
  if (!city.festivals || typeof city.festivals !== 'object') city.festivals = createFestivalState();
  return city.festivals;
}

/** The city's master switch (Settings → 節慶活動). */
function areFestivalsEnabled() {
  return getCityFestivalState()?.enabled !== false;
}

function setFestivalsEnabled(enabled) {
  const state = getCityFestivalState();
  if (state) state.enabled = !!enabled;
}

/** Whether one festival is on: the master switch and its own. */
function isFestivalEnabled(id) {
  const state = getCityFestivalState();
  return !!state && state.enabled !== false && state.festivals?.[id]?.enabled !== false && !!FESTIVAL_DEFINITIONS_BY_ID[id];
}

function setFestivalEnabled(id, enabled) {
  const entry = getCityFestivalState()?.festivals?.[id];
  if (entry) entry.enabled = !!enabled;
}

/** A government festival's funding tier; null for community festivals and the UFO. */
function getFestivalTier(id) {
  if (!isGovernmentFestival(id)) return null;
  const tier = getCityFestivalState()?.festivals?.[id]?.tier;
  return FESTIVAL_TIERS.includes(tier) ? tier : FESTIVAL_DEFAULT_TIER;
}

function setFestivalTier(id, tier) {
  const entry = getCityFestivalState()?.festivals?.[id];
  if (entry && isGovernmentFestival(id) && FESTIVAL_TIERS.includes(tier)) entry.tier = tier;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FESTIVAL_DEFINITIONS,
    FESTIVAL_DEFINITIONS_BY_ID,
    FESTIVAL_IDS,
    FESTIVAL_TIERS,
    FESTIVAL_DEFAULT_TIER,
    FESTIVAL_HISTORY_LIMIT,
    FESTIVAL_OUTCOMES,
    isGovernmentFestival,
    createFestivalState,
    normalizeFestivalState,
    areFestivalsEnabled,
    setFestivalsEnabled,
    isFestivalEnabled,
    setFestivalEnabled,
    getFestivalTier,
    setFestivalTier,
  };
}
