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
// is held (festival-venues.js, Phase 1). kind 'random' has no calendar date. firstYear: not held
// before that game year.
//
// quiet (六四, Norton 2026-10-11): a quiet remembrance in the park and nothing else - no switch of
// its own (only the master switch), not listed in the festival calendar, no notice, news, forum
// post, council comment, inspect text, attendance figure or effect. Everything that writes text
// about festivals must skip a quiet one. Held from 1990 (the first vigil) and every year after.
const FESTIVAL_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'lunarNewYear', kind: 'calendar', organiser: 'government', venue: 'flagshipPark', label: '新春年宵' }),
  Object.freeze({ id: 'bunHill', kind: 'calendar', organiser: 'government', venue: 'eventGround', label: '海旁搶包山之夜' }),
  Object.freeze({ id: 'dragonBoat', kind: 'calendar', organiser: 'government', venue: 'promenade', label: '香城龍舟邀請賽' }),
  Object.freeze({ id: 'june4', kind: 'calendar', organiser: 'community', venue: 'flagshipPark', label: '六四', quiet: true, firstYear: 1990 }),
  Object.freeze({ id: 'yulan', kind: 'calendar', organiser: 'community', venue: 'residentialKerbs', label: '盂蘭燒街衣' }),
  Object.freeze({ id: 'midAutumn', kind: 'calendar', organiser: 'government', venue: 'residentialRoute', label: '中秋舞火龍' }),
  Object.freeze({ id: 'christmas', kind: 'calendar', organiser: 'government', venue: 'commercialStreets', label: '聖誕燈飾' }),
  Object.freeze({ id: 'ufo', kind: 'random', organiser: null, venue: 'anywhere', label: '發現 UFO' }),
]);
const FESTIVAL_DEFINITIONS_BY_ID = Object.freeze(Object.fromEntries(FESTIVAL_DEFINITIONS.map((d) => [d.id, d])));
const FESTIVAL_IDS = Object.freeze(FESTIVAL_DEFINITIONS.map((d) => d.id));
// the festivals with a switch (and, if government-run, a tier) of their own
const FESTIVAL_SWITCHABLE_IDS = Object.freeze(FESTIVAL_DEFINITIONS.filter((d) => !d.quiet).map((d) => d.id));

// 唔辦／簡辦／標準／盛大
const FESTIVAL_TIERS = Object.freeze(['skip', 'basic', 'standard', 'grand']);
const FESTIVAL_DEFAULT_TIER = 'standard';
const FESTIVAL_HISTORY_LIMIT = 40;
const FESTIVAL_OUTCOMES = Object.freeze(['held', 'skipped', 'cancelled', 'noVenue']);

function isGovernmentFestival(id) {
  return FESTIVAL_DEFINITIONS_BY_ID[id]?.organiser === 'government';
}

function isQuietFestival(id) {
  return !!FESTIVAL_DEFINITIONS_BY_ID[id]?.quiet;
}

/** Whether a festival is held at all in a game year (六四 from 1990). */
function isFestivalHeldInYear(id, year) {
  const definition = FESTIVAL_DEFINITIONS_BY_ID[id];
  if (!definition) return false;
  return !definition.firstYear || Math.trunc(Number(year)) >= definition.firstYear;
}

// ── 節目表 and money ──────────────────────────────────────────────────────────
// What a held festival looks like through its month's sky-day, by clock minute: the setup
// before `open`, the event until `close` (past midnight counts on, 24:00 = 1440), and the peak -
// when the notice goes out and the lights matter - from `peak`. Christmas is up all month and
// lit every night. Festivals without a programme yet are not drawn.
// `after`: a morning in the month that follows (新春's 開年舞獅 at the shops' doors).
const FESTIVAL_PROGRAMMES = Object.freeze({
  bunHill: Object.freeze({ setup: 1080, open: 1140, peak: 1410, close: 1560 }),
  dragonBoat: Object.freeze({ setup: 360, open: 480, peak: 900, close: 1080 }),
  christmas: Object.freeze({ setup: 6 * 60, open: 6 * 60, peak: 18 * 60, close: 30 * 60 }),
  // 六四: people gather from 19:00, the candles all lit by 20:00, gone by 22:30 (festival-venues.js
  // getJune4Presence); quiet - no peak notice (festival-ui.js skips quiet festivals)
  june4: Object.freeze({ setup: 19 * 60, open: 19 * 60, peak: 20 * 60, close: 22 * 60 + 30 }),
  // 年宵: the stalls go up in the morning, open at ten, the crowds and the lights after six, the
  // last of it at three in the morning
  lunarNewYear: Object.freeze({ setup: 6 * 60, open: 10 * 60, peak: 18 * 60, close: 27 * 60, after: Object.freeze({ open: 6 * 60, close: 12 * 60 }) }),
});

// Government festivals: what each tier costs (a base plus a share per resident, paid when the
// festival month begins) and what it brings for that month (city.temporaryEffects). Trial values;
// a council event's success is attractiveness +3, tourism +2 for scale.
const FESTIVAL_TIER_SCALE = Object.freeze({ skip: 0, basic: 0.5, standard: 1, grand: 1.6 });
const FESTIVAL_ECONOMICS = Object.freeze({
  bunHill: Object.freeze({ baseCost: 1200, costPerResident: 0.008, effects: Object.freeze({ attractiveness: 1, tourism: 1, happiness: 0.005 }) }),
  dragonBoat: Object.freeze({ baseCost: 1800, costPerResident: 0.015, effects: Object.freeze({ attractiveness: 3, tourism: 3, happiness: 0.015 }) }),
  // 年宵: the stall auction brings money back (incomePerStall x let stalls, more in a good economy)
  lunarNewYear: Object.freeze({
    baseCost: 1500,
    costPerResident: 0.02,
    incomePerStall: Object.freeze({ base: 80, perEconomyPoint: 2.4 }),
    effects: Object.freeze({ attractiveness: 3, tourism: 2, happiness: 0.02 }),
  }),
  christmas: Object.freeze({
    baseCost: 800,
    costPerResident: 0.01,
    effects: Object.freeze({ attractiveness: 3, tourism: 2, commercialDemand: 0.05, happiness: 0.01 }),
  }),
});

/** A festival's cost at a tier for a population; 0 when it is not funded or not costed yet. */
function getFestivalCost(id, tier, population) {
  const economics = FESTIVAL_ECONOMICS[id];
  const k = FESTIVAL_TIER_SCALE[tier] || 0;
  if (!economics || !k) return 0;
  return Math.round((economics.baseCost + Math.max(0, Number(population) || 0) * economics.costPerResident) * k);
}

/** The month's modifiers a held festival brings at a tier (none for a quiet one). */
function getFestivalEffects(id, tier) {
  const economics = FESTIVAL_ECONOMICS[id];
  const k = isGovernmentFestival(id) ? (FESTIVAL_TIER_SCALE[tier] || 0) : 1;
  if (!economics || !k || isQuietFestival(id)) return {};
  return Object.fromEntries(Object.entries(economics.effects).map(([key, v]) => [key, Math.round(v * k * 1000) / 1000]));
}

/**
 * Where a festival's programme stands at a minute of its month's sky-day.
 * @returns {'setup'|'open'|'peak'|null} null before setup or after close (or no programme)
 */
function getFestivalPhase(id, minuteOfDay) {
  const programme = FESTIVAL_PROGRAMMES[id];
  if (!programme) return null;
  let m = Number(minuteOfDay);
  if (!Number.isFinite(m)) return null;
  // the sky-day starts at 06:00: the small hours belong to the night before
  if (m < 6 * 60) m += 24 * 60;
  if (m < programme.setup || m >= programme.close) return null;
  if (m < programme.open) return 'setup';
  return m >= programme.peak ? 'peak' : 'open';
}

/**
 * The festivals held in a month - on, held that year, falling in the month - each with its phase.
 * Quiet ones are included (the renderer draws them); every text-writing caller filters them out.
 * @param {{ year: number, month: number, minuteOfDay: number, isEnabled?: (id) => boolean }} at
 * @returns {Array<{ id: string, phase: string|null }>}
 */
function getActiveFestivals({ year, month, minuteOfDay, isEnabled = isFestivalEnabled }) {
  const calendar = typeof getFestivalsInMonth === 'function'
    ? getFestivalsInMonth
    : (typeof require === 'function' ? require('./festival-calendar.js').getFestivalsInMonth : null);
  if (!calendar) return [];
  const active = calendar(year, month)
    .filter((id) => isFestivalHeldInYear(id, year) && isEnabled(id))
    .map((id) => ({ id, phase: getFestivalPhase(id, minuteOfDay) }));
  // the morning after: last month's festival with an `after` window (never across New Year: the
  // festivals with one fall in January or February)
  if (Number(month) > 1) {
    calendar(year, Number(month) - 1).forEach((id) => {
      const after = FESTIVAL_PROGRAMMES[id]?.after;
      const m = Number(minuteOfDay);
      if (!after || !isFestivalHeldInYear(id, year) || !isEnabled(id) || active.some((a) => a.id === id)) return;
      if (m >= after.open && m < after.close) active.push({ id, phase: 'after' });
    });
  }
  return active;
}

/** What a government festival's stall auction brings for `stalls` let stalls (economy 0-100). */
function getFestivalIncome(id, stalls, economyIndex = 50) {
  const income = FESTIVAL_ECONOMICS[id]?.incomePerStall;
  if (!income) return 0;
  const econ = Math.max(0, Math.min(100, Number(economyIndex) || 0));
  return Math.round(Math.max(0, Number(stalls) || 0) * (income.base + income.perEconomyPoint * econ));
}

function getFestivalHistoryEntry(id, year) {
  const state = getCityFestivalState();
  return state?.history.find((entry) => entry.id === id && entry.year === Math.trunc(Number(year))) || null;
}

function recordFestivalHistory(entry) {
  const state = getCityFestivalState();
  const clean = state && normalizeFestivalHistoryEntry(entry);
  if (!clean) return null;
  state.history = state.history.filter((e) => !(e.id === clean.id && e.year === clean.year));
  state.history.push(clean);
  state.history = state.history.slice(-FESTIVAL_HISTORY_LIMIT);
  return clean;
}

/**
 * Settle a government festival once a year, when its month begins: pay for the tier and take its
 * effects for the month. Unaffordable or 唔辦 is recorded as skipped, no venue as noVenue (settled
 * again if a venue appears later that month). Returns the history entry, or null when it was
 * settled already (or is not a government festival).
 * @param {{ hasVenue?: boolean, income?: number, spend?: (amount) => boolean, earn?: (amount) => void,
 *   addEffect?: (sourceId, months, modifiers) => void }} [io]  income: what the stalls brought, paid in when held
 */
function settleFestivalMonth(id, year, io = {}) {
  const prior = getFestivalHistoryEntry(id, year);
  // a festival that found no venue is settled again once one is built in its month
  if (!isGovernmentFestival(id) || (prior && !(prior.outcome === 'noVenue' && io.hasVenue))) return null;
  const tier = getFestivalTier(id);
  const population = typeof city !== 'undefined' ? Number(city?.population) || 0 : 0;
  const cost = getFestivalCost(id, tier, population);
  const spend = io.spend || ((amount) => (typeof spendBudget === 'function' ? spendBudget(amount) : true));
  const addEffect = io.addEffect || ((sourceId, months, modifiers) => {
    if (typeof addCouncilTemporaryEffect === 'function') addCouncilTemporaryEffect(sourceId, months, modifiers);
  });
  let outcome = 'held';
  if (tier === 'skip') outcome = 'skipped';
  else if (io.hasVenue === false) outcome = 'noVenue';
  else if (cost && !spend(cost)) outcome = 'skipped';
  const income = outcome === 'held' ? Math.max(0, Math.round(Number(io.income) || 0)) : 0;
  if (outcome === 'held') {
    const effects = getFestivalEffects(id, tier);
    if (Object.keys(effects).length) addEffect(`festival:${id}:${year}`, 1, effects);
    const earn = io.earn || ((amount) => { if (typeof city !== 'undefined' && city) city.budget = (Number(city.budget) || 0) + amount; });
    if (income) earn(income);
  }
  return recordFestivalHistory({ id, year, outcome, cost: outcome === 'held' ? cost : 0, income });
}

function createFestivalState() {
  return {
    version: 1,
    enabled: true,
    festivals: Object.fromEntries(FESTIVAL_SWITCHABLE_IDS.map((id) => [id, {
      enabled: true,
      tier: isGovernmentFestival(id) ? FESTIVAL_DEFAULT_TIER : null,
    }])),
    venues: Object.fromEntries(FESTIVAL_IDS.map((id) => [id, ''])),
    history: [],
    ufo: { lastMonthIndex: -1, sightings: 0 },
    dragonBoat: null,
    bunHill: null,
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
    ...(entry.id === 'dragonBoat' && (entry.champion || entry.distanceM) ? { champion: String(entry.champion || '').slice(0,100), distanceM: [200,270,500].includes(entry.distanceM) ? entry.distanceM : 0 } : {}),
  };
}

/** A clean city.festivals from whatever a save holds (missing or older saves get the defaults). */
function normalizeFestivalState(raw) {
  const state = createFestivalState();
  if (!raw || typeof raw !== 'object') return state;
  state.enabled = raw.enabled !== false;
  FESTIVAL_SWITCHABLE_IDS.forEach((id) => {
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
  const normalizeDragon = typeof normalizeDragonBoatRun === 'function' ? normalizeDragonBoatRun : (typeof require === 'function' ? require('./festival-dragon-boat.js').normalizeDragonBoatRun : null);
  state.dragonBoat = normalizeDragon ? normalizeDragon(raw.dragonBoat) : null;
  const normalizeBunHill = typeof normalizeBunHillRun === 'function' ? normalizeBunHillRun : (typeof require === 'function' ? require('./bun-hill-event.js').normalizeBunHillRun : null);
  state.bunHill = normalizeBunHill ? normalizeBunHill(raw.bunHill) : null;
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

/** Whether one festival is on: the master switch and its own (a quiet one has only the master). */
function isFestivalEnabled(id) {
  const state = getCityFestivalState();
  if (!state || state.enabled === false || !FESTIVAL_DEFINITIONS_BY_ID[id]) return false;
  return isQuietFestival(id) || state.festivals?.[id]?.enabled !== false;
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

/** Whether the 聖誕幕牆 night art shows: December, with Christmas on (day-night-lighting.js). */
function isChristmasLightingMonth(month = typeof city !== 'undefined' ? city?.month : 0) {
  return Number(month) === 12 && isFestivalEnabled('christmas');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FESTIVAL_DEFINITIONS,
    FESTIVAL_DEFINITIONS_BY_ID,
    FESTIVAL_IDS,
    FESTIVAL_SWITCHABLE_IDS,
    FESTIVAL_TIERS,
    FESTIVAL_DEFAULT_TIER,
    FESTIVAL_HISTORY_LIMIT,
    FESTIVAL_OUTCOMES,
    FESTIVAL_PROGRAMMES,
    FESTIVAL_ECONOMICS,
    FESTIVAL_TIER_SCALE,
    getFestivalCost,
    getFestivalEffects,
    getFestivalPhase,
    getActiveFestivals,
    getFestivalIncome,
    getFestivalHistoryEntry,
    recordFestivalHistory,
    settleFestivalMonth,
    isGovernmentFestival,
    isQuietFestival,
    isFestivalHeldInYear,
    createFestivalState,
    normalizeFestivalState,
    areFestivalsEnabled,
    setFestivalsEnabled,
    isFestivalEnabled,
    setFestivalEnabled,
    getFestivalTier,
    setFestivalTier,
    isChristmasLightingMonth,
  };
}
