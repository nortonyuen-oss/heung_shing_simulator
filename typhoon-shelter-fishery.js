// 漁業 (Phase 5): the typhoon shelters' fishery in the city's economy - its jobs in the labour
// market, the fleet held to the berths, the hands and the fish markets there are, the month's
// catch settled into the treasury, and the landing platforms, floating fuel stations and floating
// workshops a busy shelter adds for itself. Design: docs/typhoon-shelter-phase5-design.md.
//
// A sky-day is a calendar month (game-clock.js) and the boats are alongside by 05:00, an hour before
// the month turns at 06:00: a month's catch is exactly the night just landed, worked out from the
// clock (typhoonShelterNightLandings) when the month is settled. Nothing accumulates; only the last
// night settled is kept, so a night is never paid twice.

const TYPHOON_SHELTER_FISHERY = Object.freeze({
  // crew per fishing boat, by its art (TYPHOON_SHELTER_FLEET.models): 燈光船, 刺網船, 拖網船
  crew: Object.freeze({ fishingBoat1: 6, fishingBoat3: 4, fishingBoat4: 8 }),
  tenderJobs: 1,                 // a sampan's boatman
  // the 海事處 buildings' jobs: the market and its bay are traditional (low-education) work, the
  // restaurant commercial
  buildingJobs: Object.freeze({ fish_market: 30, fish_loading_bay: 10, seafood_restaurant: 20 }),
  pricePerTonne: 70,             // wholesale, in game dollars: the catch's value, shown, not taxed
  // The treasury's take (2026-10-09 review): per job, nine tenths of what a traditional industrial
  // job pays (TAX_PER_INDUSTRIAL over a 1x1 building's JOBS_PER_IND * ANCHOR_RATIO jobs), the
  // crews' as fishery tax and the market hands' as its commission - scaled by how good the month's
  // catch was against every boat's full night, up to maxCatchShare (the fuel station's bonus)
  industryShare: 0.9,
  maxCatchShare: 1.1,
  // what the markets take a night, in tonnes
  marketTonnes: 24,
  bayTonnes: 12,                 // a loading bay adds this to its market
  restaurantTonnes: 1,           // bought straight off the boats
  noRoadShare: 0.5,              // a market whose road does not reach the network: half
  noMarketBoats: 4,              // with no market the catch is sold on the quay, to so many boats
  // hands: a boat joins only if the low-education labour gap covers its crew. When the traditional
  // trades fill less than (1 - shortageShare) of their jobs for so many months, the fishery keeps
  // only that share of its berths' boats - one boat leaving a month - like the other trades: the
  // shortage is the city's, not the fishery's, and its few jobs cannot close it
  shortageShare: 0.1,
  shortageMonths: 3,
  // the landing stages and platforms take so many boats unloading at once; past that the catch
  // waits and loses value, at most this much
  stageBoats: 10,
  platformBoats: 10,
  queueLossMax: 0.2,
  history: 12,                   // months kept for the panel
});

// Tourists (2026-10-09): a working shelter draws them - the boats, the 漁火, the seafood - so it adds
// to the city's monthly visitor capacity (council-effects.js updateCityAttractivenessMetrics), and
// far more while 「無處不旅遊」 runs.
const TYPHOON_SHELTER_TOURISM = Object.freeze({
  shelterVisitors: 2000,
  restaurantVisitors: 500,
  campaign: 'tourEverywhere',
  campaignMultiplier: Object.freeze({ success: 3, failure: 1.5 }),
  yachtVisitors: 100,            // each yacht in a shelter: its owners' guests, the harbour cruise
  yachtMooringFee: 8,            // a month, to the treasury, at the 9% base tax rate
});

// The facilities a shelter adds for itself (works kinds of the same names, typhoon-shelter-works.js).
const TYPHOON_SHELTER_FACILITIES = Object.freeze({
  landingPlatform: Object.freeze({ objectId: 'floatingPier3', cost: 1500, upkeep: 12, label: '卸魚平台' }),
  gasStation: Object.freeze({ objectId: 'floatingGasStation', cost: 4000, upkeep: 30, label: '水上油站', minBoats: 12, catchBonus: 0.1 }),
  workshop: Object.freeze({ objectId: 'floatingWorkshop', cost: 3000, upkeep: 24, label: '水上工場', minBoats: 16, minDamaged: 3, repairDays: 0.5, repairBill: 0.7 }),
});
const TYPHOON_SHELTER_FACILITY_KINDS = Object.freeze(Object.keys(TYPHOON_SHELTER_FACILITIES));
const TYPHOON_SHELTER_FACILITY_ORDER = Object.freeze(['landingPlatform', 'gasStation', 'workshop']);

// ---------------------------------------------------------------------------
// pure rules (tested in test/typhoon-shelter-fishery.test.js)
// ---------------------------------------------------------------------------

function isTyphoonShelterFishingBoat(model) {
  return Object.prototype.hasOwnProperty.call(TYPHOON_SHELTER_FISHERY.crew, model);
}

/**
 * The fishery's jobs: { traditional, commercial, crews, market }. `boats` are fleet boats
 * ({ model }), `tenders` the shelter's sampans, `buildings` counts of the 海事處 buildings; `crews`
 * (boats and sampans) and `market` (the market and its bay) split the traditional jobs. Jobs go
 * with the fleet, not with the night's sailing: a storm or the moratorium does not put the crews
 * out of work.
 */
function typhoonShelterFisheryJobs({ boats = [], tenders = 0, buildings = {} } = {}) {
  const F = TYPHOON_SHELTER_FISHERY;
  const crews = boats.reduce((s, b) => s + (F.crew[b.model] || 0), 0) + tenders * F.tenderJobs;
  const market = (buildings.fish_market || 0) * F.buildingJobs.fish_market
    + (buildings.fish_loading_bay || 0) * F.buildingJobs.fish_loading_bay;
  return { traditional: crews + market, commercial: (buildings.seafood_restaurant || 0) * F.buildingJobs.seafood_restaurant, crews, market };
}

// The treasury's take per fishery job a month at full catch: nine tenths of an industrial job's tax.
function typhoonShelterFisheryTaxPerJob(taxScale = 1) {
  const tax = typeof TAX_PER_INDUSTRIAL === 'number' ? TAX_PER_INDUSTRIAL : 40;
  const jobs = (typeof JOBS_PER_IND === 'number' ? JOBS_PER_IND : 12) * (typeof ANCHOR_RATIO === 'number' ? ANCHOR_RATIO : 30);
  return (TYPHOON_SHELTER_FISHERY.industryShare * tax * Math.max(0, taxScale)) / jobs;
}

/**
 * What a shelter's markets take a night, in tonnes: markets [{ bay: bool, connected: bool }], each a
 * market with or without its loading bay, its road reaching the network or not; plus its
 * restaurants.
 */
function typhoonShelterMarketTonnes(markets = [], restaurants = 0) {
  const F = TYPHOON_SHELTER_FISHERY;
  const marketTonnes = markets.reduce((s, m) => s + (F.marketTonnes + (m.bay ? F.bayTonnes : 0)) * (m.connected === false ? F.noRoadShare : 1), 0);
  return marketTonnes + restaurants * F.restaurantTonnes;
}

/**
 * The boats a shelter may have: { target, caps: { berths, labour, market }, bottleneck }.
 * - berths: the berth target as before (typhoon-shelter-fleet.js), for all boats.
 * - market: the fishing boats its markets can take a catch from, as all boats (÷ fishingShare).
 * - labour: with workers to spare, today's boats plus as many as they make crews for; short of them,
 *   today's boats; short for months (`shortage`), the berths' boats times the share of their jobs
 *   the traditional trades fill (`staffedShare`).
 * Below today's boats for want of market or hands, the fleet loses one boat a month at most
 * (`shrinkAllowed` says whether this month's has gone).
 */
function typhoonShelterFleetCaps({
  berthTarget, current, fishingShare = 1, marketTonnes = 0, hasMarket = false,
  labourGap = Infinity, avgCrew = 6, shortage = false, staffedShare = 1, shrinkAllowed = true,
}) {
  const F = TYPHOON_SHELTER_FISHERY;
  const tonnesPerBoat = typeof TYPHOON_SHELTER_FLEET !== 'undefined' ? TYPHOON_SHELTER_FLEET.catchTonnesPerTrip : 1.5;
  const fishingMarket = hasMarket ? Math.floor(marketTonnes / tonnesPerBoat) : F.noMarketBoats + Math.floor(marketTonnes / tonnesPerBoat);
  const market = Math.floor(fishingMarket / Math.max(0.05, fishingShare));
  const extra = Number.isFinite(labourGap) ? Math.max(0, Math.floor(labourGap / Math.max(1, avgCrew))) : Infinity;
  const labour = shortage
    ? Math.min(current, Math.floor(Math.max(0, berthTarget) * Math.max(0, Math.min(1, staffedShare))))
    : current + extra;
  const caps = { berths: Math.max(0, berthTarget), labour, market };
  let target = Math.min(caps.berths, caps.labour, caps.market);
  // the berths go at once (a boat cannot lie on water that is no longer a berth); the rest slowly
  if (target < current && target < caps.berths) target = shrinkAllowed ? Math.max(target, current - 1) : current;
  target = Math.min(target, caps.berths);
  const bottleneck = target >= caps.berths ? 'berths'
    : caps.labour <= caps.market ? 'labour' : 'market';
  return { target: Math.max(0, target), caps, bottleneck };
}

// How much of its value the catch keeps when more boats come in than can unload at once (0.8..1).
function typhoonShelterLandingEfficiency(fishingBoats, landingBoats) {
  const F = TYPHOON_SHELTER_FISHERY;
  if (!(fishingBoats > landingBoats) || landingBoats <= 0) return landingBoats > 0 || fishingBoats === 0 ? 1 : 1 - F.queueLossMax;
  return 1 - F.queueLossMax * Math.min(1, (fishingBoats - landingBoats) / landingBoats);
}

/**
 * A month's money from one shelter's night: { tonnes, value, tax, commission }. `tonnes` landed
 * (before the fuel station's bonus) against `fullTonnes`, every fishing boat's full night; the
 * shelter's `crews` and `marketJobs`; the markets' `marketTonnes` a night (an idle market earns
 * less); `taxScale` the city's tax rate over the 9% base. `value` is the catch's worth, for show:
 * the treasury takes the per-job tax (typhoonShelterFisheryTaxPerJob), not the catch's value.
 */
function settleTyphoonShelterNight({
  tonnes = 0, fullTonnes = 0, crews = 0, marketJobs = 0, marketTonnes = 0, hasMarket = false,
  taxScale = 1, catchBonus = 0, efficiency = 1,
}) {
  const F = TYPHOON_SHELTER_FISHERY;
  const landed = tonnes * (1 + catchBonus);
  const share = fullTonnes > 0 ? Math.min(F.maxCatchShare, (landed * efficiency) / fullTonnes) : 0;
  const perJob = typhoonShelterFisheryTaxPerJob(taxScale);
  const busy = hasMarket && marketTonnes > 0 ? Math.min(1, landed / marketTonnes) : 0;
  return {
    tonnes: Math.round(landed * 10) / 10,
    value: Math.round(landed * F.pricePerTonne * efficiency),
    tax: Math.round(perJob * crews * share),
    commission: Math.round(perJob * marketJobs * busy * Math.min(1, share)),
  };
}

/**
 * The facility a shelter should add next, or null: a landing platform while more fishing boats come
 * in than its stages and platforms take, then a fuel station, then a workshop (or a workshop at once
 * after a storm that damaged several boats). One of each fuel station and workshop.
 */
function nextTyphoonShelterFacility({ fishingBoats = 0, landingBoats = 0, facilities = [], damagedLastStorm = 0 }) {
  const X = TYPHOON_SHELTER_FACILITIES;
  const has = (kind) => facilities.some((f) => f.kind === kind);
  if (fishingBoats > landingBoats) return 'landingPlatform';
  if (!has('workshop') && damagedLastStorm >= X.workshop.minDamaged) return 'workshop';
  if (!has('gasStation') && fishingBoats >= X.gasStation.minBoats) return 'gasStation';
  if (!has('workshop') && fishingBoats >= X.workshop.minBoats) return 'workshop';
  return null;
}

/**
 * Where a new facility goes: a basin tile { row, col, facing } or null. Open water first - a tile no
 * lane, berth or work uses - beside a walkway or the shore; else a free berth beside a walkway or
 * the shore, the one furthest from the entrances (the boats there have furthest to go anyway).
 * Never a lane, a work, or a berth with a boat on it.
 */
function chooseTyphoonShelterFacilitySite({ basin, channel, lanes, slots, items, occupied = new Set(), entrances = [] }) {
  const key = (r, c) => `${r}:${c}`;
  const parse = (k) => k.split(':').map(Number);
  const used = new Set((items || []).filter((i) => i.state !== 'demolishing').map((i) => key(i.row, i.col)));
  const berthTiles = new Map();
  (slots || []).forEach((s) => (s.tiles || []).forEach((t) => berthTiles.set(t, s)));
  const walk = new Set((items || []).filter((i) => ['pontoon', 'floatingPier', 'pier'].includes(i.kind)).map((i) => key(i.row, i.col)));
  const dirs = [['n', -1, 0], ['s', 1, 0], ['e', 0, 1], ['w', 0, -1]];
  const beside = (r, c) => dirs.find(([, dr, dc]) => walk.has(key(r + dr, c + dc)) || !basin.has(key(r + dr, c + dc)));
  const fromEntrance = (r, c) => Math.min(Infinity, ...entrances.map(([er, ec]) => Math.abs(er - r) + Math.abs(ec - c)));
  const candidates = [];
  [...basin].sort().forEach((k) => {
    if (used.has(k) || lanes?.has(k) || channel?.has(k)) return;
    const [r, c] = parse(k);
    const side = beside(r, c);
    if (!side) return;
    const slot = berthTiles.get(k);
    if (slot && occupied.has(slot.key)) return;
    candidates.push({ row: r, col: c, facing: side[0], open: !slot, far: fromEntrance(r, c) });
  });
  candidates.sort((a, b) => (b.open - a.open) || (b.far - a.far) || a.row - b.row || a.col - b.col);
  const best = candidates[0];
  return best ? { row: best.row, col: best.col, facing: best.facing } : null;
}

function normalizeTyphoonShelterFishery(raw) {
  const facilities = (Array.isArray(raw?.facilities) ? raw.facilities : [])
    .filter((f) => TYPHOON_SHELTER_FACILITY_KINDS.includes(f?.kind) && Number.isFinite(f.row) && Number.isFinite(f.col))
    .slice(0, 24)
    .map((f) => ({ kind: f.kind, row: Math.round(f.row), col: Math.round(f.col), facing: ['n', 'e', 's', 'w'].includes(f.facing) ? f.facing : 'n' }));
  return {
    autoExpand: raw?.autoExpand !== false,
    shortageMonths: Math.max(0, Math.min(99, Math.round(Number(raw?.shortageMonths) || 0))),
    facilities,
    ...(TYPHOON_SHELTER_FACILITY_KINDS.includes(raw?.suggest) ? { suggest: raw.suggest } : {}),
    ...(TYPHOON_SHELTER_FACILITY_KINDS.includes(raw?.suggest) && raw?.noRoom ? { noRoom: true } : {}),
    ...(Number.isFinite(raw?.shrinkMonth) ? { shrinkMonth: Math.round(raw.shrinkMonth) } : {}),
  };
}

function normalizeCityFishery(raw) {
  const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
  const month = (m) => ({
    year: num(m?.year), month: num(m?.month),
    tonnes: Math.round((Number(m?.tonnes) || 0) * 10) / 10, value: num(m?.value), tax: num(m?.tax),
    commission: num(m?.commission), fresh: num(m?.fresh),
  });
  const lastMonth = raw?.lastMonth ? {
    ...month(raw.lastMonth),
    byShelter: Object.fromEntries(Object.entries(raw.lastMonth.byShelter || {}).slice(0, 32)
      .map(([id, s]) => [String(id).slice(0, 16), { tonnes: Math.round((Number(s?.tonnes) || 0) * 10) / 10, value: num(s?.value), tax: num(s?.tax), commission: num(s?.commission) }])),
  } : null;
  return {
    lastSettledDay: Number.isFinite(Number(raw?.lastSettledDay)) ? Math.round(Number(raw.lastSettledDay)) : null,
    lastMonth,
    history: (Array.isArray(raw?.history) ? raw.history : []).slice(-TYPHOON_SHELTER_FISHERY.history).map(month),
  };
}

// ---------------------------------------------------------------------------
// game side
// ---------------------------------------------------------------------------

function tsFisheryT(key, fallback, vars) {
  if (typeof t !== 'function') return fallback;
  const out = t(key, vars);
  return out && out !== key ? out : fallback;
}

// The operational shelters and their waterfront tiles, as the markets are assigned
// (typhoon-shelter-market.js layTyphoonShelterMarkets).
function getTyphoonShelterWaterfronts() {
  return getTyphoonShelterState().shelters.filter((p) => p.status === 'operational').map((p) => ({
    id: p.id,
    tiles: (p.works?.items || []).filter((i) => i.state === 'done' && ['pier', 'quay', 'quayFill', 'quayGround'].includes(i.kind))
      .map((i) => ({ row: i.row, col: i.col })),
  }));
}

// Each shelter's markets and restaurants: Map shelterId -> { markets: [{ id, bay, connected }],
// restaurants, bays }. Worked out from the buildings themselves, not from what is drawn.
function getTyphoonShelterMarketsByShelter() {
  const out = new Map();
  if (typeof buildingData === 'undefined' || typeof assignTyphoonShelterMarkets !== 'function') return out;
  const shelters = getTyphoonShelterWaterfronts();
  if (!shelters.length) return out;
  const entry = (id) => { if (!out.has(id)) out.set(id, { markets: [], restaurants: 0, bays: 0 }); return out.get(id); };
  const isRoad = typeof isTyphoonShelterMarketRoad === 'function' ? isTyphoonShelterMarketRoad : () => false;
  assignTyphoonShelterMarkets({
    markets: collectTyphoonShelterBuildings('fish_market'),
    bays: collectTyphoonShelterBuildings('fish_loading_bay'),
    shelters,
  }, isRoad).forEach((m) => {
    if (!m.shelterId) return;
    const road = m.bay ? m.bay.road : m.road;
    const e = entry(m.shelterId);
    e.markets.push({ id: m.id, bay: !!m.bay, connected: (road?.through || 0) > 0 });
    if (m.bay) e.bays += 1;
  });
  assignTyphoonShelterMarkets({ markets: collectTyphoonShelterBuildings('seafood_restaurant'), bays: [], shelters }, isRoad)
    .forEach((r) => { if (r.shelterId) entry(r.shelterId).restaurants += 1; });
  return out;
}

function getTyphoonShelterFacilityCount(plan, kind) {
  return (plan.works?.items || []).filter((i) => i.kind === kind && i.state === 'done').length;
}

// The boats a shelter's stages and platforms can take unloading at once.
function getTyphoonShelterLandingBoats(plan) {
  const F = TYPHOON_SHELTER_FISHERY;
  return getTyphoonShelterFacilityCount(plan, 'floatingPier') * F.stageBoats
    + getTyphoonShelterFacilityCount(plan, 'pier') * F.stageBoats
    + getTyphoonShelterFacilityCount(plan, 'landingPlatform') * F.platformBoats;
}

function getTyphoonShelterTenderCount(plan) {
  const fishing = (plan.fleet?.boats || []).filter((b) => isTyphoonShelterFishingBoat(b.model)).length;
  if (!fishing || typeof getTyphoonShelterTenderSpots !== 'function') return 0;
  const per = typeof TYPHOON_SHELTER_TENDERS !== 'undefined' ? TYPHOON_SHELTER_TENDERS.boatsPerTender : 4;
  return Math.min(getTyphoonShelterTenderSpots(plan.works?.items).length, Math.ceil(fishing / per));
}

// The 「無處不旅遊」 multiplier on the shelters' tourists this month: 1 unless the campaign runs.
function getTyphoonShelterCampaignMultiplier(effects, monthIndex) {
  const T = TYPHOON_SHELTER_TOURISM;
  const live = (effects || []).find((e) => e?.sourceId === T.campaign
    && monthIndex >= Number(e.startMonthIndex) && monthIndex <= Number(e.endMonthIndex));
  if (!live) return 1;
  return live.outcome === 'success' ? T.campaignMultiplier.success : T.campaignMultiplier.failure;
}

// Visitors a month the working shelters can take (their restaurants included).
function typhoonShelterTouristCapacity({ shelters = 0, restaurants = 0, yachts = 0, multiplier = 1 }) {
  const T = TYPHOON_SHELTER_TOURISM;
  return Math.round((shelters * T.shelterVisitors + restaurants * T.restaurantVisitors + yachts * T.yachtVisitors) * multiplier);
}

function getTyphoonShelterTouristCapacity() {
  if (typeof getTyphoonShelterState !== 'function' || typeof city === 'undefined') return 0;
  const shelters = getTyphoonShelterState().shelters.filter((p) => p.status === 'operational');
  if (!shelters.length) return 0;
  const markets = getTyphoonShelterMarketsByShelter();
  const restaurants = shelters.reduce((n, p) => n + (markets.get(p.id)?.restaurants || 0), 0);
  const monthIndex = typeof getCityMonthIndex === 'function' ? getCityMonthIndex() : 0;
  return typhoonShelterTouristCapacity({ shelters: shelters.length, restaurants, yachts: getTyphoonShelterYachtCount(), multiplier: getTyphoonShelterCampaignMultiplier(city.temporaryEffects, monthIndex) });
}

// The city's fishery jobs (simulation.js updateDemand): { traditional, commercial, byShelter }.
function getTyphoonShelterFisheryJobs() {
  const out = { traditional: 0, commercial: 0, byShelter: {} };
  if (typeof getTyphoonShelterState !== 'function') return out;
  const byShelter = getTyphoonShelterMarketsByShelter();
  getTyphoonShelterState().shelters.forEach((plan) => {
    if (plan.status !== 'operational') return;
    const m = byShelter.get(plan.id);
    const jobs = typhoonShelterFisheryJobs({
      boats: plan.fleet?.boats || [],
      tenders: getTyphoonShelterTenderCount(plan),
      buildings: { fish_market: m?.markets.length || 0, fish_loading_bay: m?.bays || 0, seafood_restaurant: m?.restaurants || 0 },
    });
    out.byShelter[plan.id] = jobs;
    out.traditional += jobs.traditional;
    out.commercial += jobs.commercial;
  });
  return out;
}

// From updateDemand: the low-education labour gap with the fishery's jobs in it, and those jobs -
// the fleet grows only into workers who have no job yet.
function recordTyphoonShelterFisheryLabour(lowEduJobGap, jobs, lowEduWorkers, traditionalJobs) {
  if (typeof city === 'undefined') return;
  const staffed = traditionalJobs > 0 ? Math.min(1, Math.max(0, lowEduWorkers / traditionalJobs)) : 1;
  city.fisheryLabour = { gap: Math.round(lowEduJobGap), jobs: Math.round(jobs || 0), staffed: Math.round(staffed * 1000) / 1000 };
}

// The labour gap now: as at the last pulse, less the crews of boats that have come since.
function getTyphoonShelterLabourGap() {
  const L = typeof city !== 'undefined' ? city.fisheryLabour : null;
  if (!L || !Number.isFinite(L.gap)) return Infinity;
  const now = getTyphoonShelterFisheryJobs().traditional;
  return L.gap - Math.max(0, now - (L.jobs || 0));
}

// The fishing boats' share of a working (non-yacht) fleet: the house boats make up the rest.
const TYPHOON_SHELTER_FISHING_SHARE = (() => {
  if (typeof TYPHOON_SHELTER_FLEET === 'undefined') return 0.82;
  const working = TYPHOON_SHELTER_FLEET.models.filter((m) => !m.leisure);
  const all = working.reduce((s, m) => s + m.weight, 0);
  return working.filter((m) => m.fishing).reduce((s, m) => s + m.weight, 0) / Math.max(1, all);
})();

// The yachts in the working shelters.
function getTyphoonShelterYachtCount() {
  if (typeof getTyphoonShelterState !== 'function') return 0;
  return getTyphoonShelterState().shelters.filter((p) => p.status === 'operational')
    .reduce((n, p) => n + (p.fleet?.boats || []).filter((b) => typeof isTyphoonShelterLeisureModel === 'function' && isTyphoonShelterLeisureModel(b.model)).length, 0);
}

// The yachts' mooring fees a month (budget line 遊艇泊位費, city-state.js).
function getTyphoonShelterMooringFees() {
  if (typeof city === 'undefined') return 0;
  const taxScale = (Number.isFinite(Number(city.taxRate)) ? Number(city.taxRate) : 0.09) / 0.09;
  return getTyphoonShelterYachtCount() * TYPHOON_SHELTER_TOURISM.yachtMooringFee * taxScale;
}

// The fleet target for a shelter (typhoon-shelter-fleet.js updateTyphoonShelterFleets): the berth
// target held to the hands and the markets. `marketsByShelter` from getTyphoonShelterMarketsByShelter.
function getTyphoonShelterFleetCaps(plan, berthTarget, marketsByShelter = getTyphoonShelterMarketsByShelter()) {
  const m = marketsByShelter.get(plan.id);
  const current = (plan.fleet?.boats || []).length;
  const avgCrew = Object.values(TYPHOON_SHELTER_FISHERY.crew).reduce((s, v) => s + v, 0) / Object.keys(TYPHOON_SHELTER_FISHERY.crew).length;
  const monthIndex = typeof city !== 'undefined' ? (Number(city.year) || 0) * 12 + (Number(city.month) || 0) : 0;
  return typhoonShelterFleetCaps({
    berthTarget,
    current,
    fishingShare: TYPHOON_SHELTER_FISHING_SHARE,
    marketTonnes: typhoonShelterMarketTonnes(m?.markets || [], m?.restaurants || 0),
    hasMarket: !!m?.markets.length,
    labourGap: getTyphoonShelterLabourGap(),
    avgCrew: avgCrew / TYPHOON_SHELTER_FISHING_SHARE,
    shortage: (plan.fishery?.shortageMonths || 0) >= TYPHOON_SHELTER_FISHERY.shortageMonths,
    staffedShare: Number.isFinite(city?.fisheryLabour?.staffed) ? city.fisheryLabour.staffed : 1,
    shrinkAllowed: plan.fishery?.shrinkMonth !== monthIndex,
  });
}

/**
 * Once a month (sim-economy.js, before the budget): settle the night just landed into
 * city.fishery, count the months short of hands, and add a facility where one is wanted.
 */
function settleTyphoonShelterFishery() {
  if (typeof city === 'undefined' || typeof getTyphoonShelterState !== 'function') return;
  const fishery = normalizeCityFishery(city.fishery);
  const env = getTyphoonShelterFleetClock();
  const day = getTyphoonShelterTripDay(env) - 1;   // the night that ended at 06:00
  const state = getTyphoonShelterState();
  const analyses = getTyphoonShelterAnalyses();
  const markets = getTyphoonShelterMarketsByShelter();
  const storm = state.storm || null;
  const taxScale = (Number.isFinite(Number(city.taxRate)) ? Number(city.taxRate) : 0.09) / 0.09;
  const fresh = 0;   // the restaurants pay commercial tax and draw tourists (getTyphoonShelterTouristCapacity)
  const already = fishery.lastSettledDay != null && day <= fishery.lastSettledDay;
  const month = { year: city.year, month: city.month, tonnes: 0, value: 0, tax: 0, commission: 0, fresh, byShelter: {} };
  const staffed = Number.isFinite(city.fisheryLabour?.staffed) ? city.fisheryLabour.staffed : 1;
  const jobs = getTyphoonShelterFisheryJobs();
  let plans = state.shelters;
  let changed = false;
  plans = plans.map((plan) => {
    if (plan.status !== 'operational' || !plan.fleet) return plan;
    const analysis = analyses.get(plan.id);
    if (!analysis) return plan;
    const geometry = getTyphoonShelterFleetGeometry(plan, analysis);
    const m = markets.get(plan.id);
    const fishingBoats = plan.fleet.boats.filter((b) => isTyphoonShelterFishingBoat(b.model)).length;
    const landingBoats = getTyphoonShelterLandingBoats(plan);
    if (!already) {
      const landings = typhoonShelterNightLandings(plan, geometry, day, { storm, moratorium: isTyphoonShelterMoratoriumDay(day) });
      const tonnes = landings.reduce((s, l) => s + l.tonnes, 0);
      const shelterJobs = jobs.byShelter[plan.id] || { crews: 0, market: 0 };
      const r = settleTyphoonShelterNight({
        tonnes,
        fullTonnes: fishingBoats * (typeof TYPHOON_SHELTER_FLEET !== 'undefined' ? TYPHOON_SHELTER_FLEET.catchTonnesPerTrip : 1.5),
        crews: shelterJobs.crews,
        marketJobs: shelterJobs.market,
        marketTonnes: typhoonShelterMarketTonnes(m?.markets || [], m?.restaurants || 0),
        hasMarket: !!m?.markets.length,
        taxScale,
        catchBonus: getTyphoonShelterFacilityCount(plan, 'gasStation') ? TYPHOON_SHELTER_FACILITIES.gasStation.catchBonus : 0,
        efficiency: typhoonShelterLandingEfficiency(fishingBoats, landingBoats),
      });
      month.byShelter[plan.id] = r;
      month.tonnes += r.tonnes; month.value += r.value; month.tax += r.tax; month.commission += r.commission;
    }
    // hands: the traditional trades fill too few of their jobs, month after month
    const shelterJobs = jobs.byShelter[plan.id]?.traditional || 0;
    const short = staffed < 1 - TYPHOON_SHELTER_FISHERY.shortageShare && shelterJobs > 0;
    const fisheryState = normalizeTyphoonShelterFishery(plan.fishery);
    const shortageMonths = short ? fisheryState.shortageMonths + 1 : 0;
    let next = { ...fisheryState, shortageMonths };
    // a facility, where the shelter needs one and the treasury and the water allow
    let works = plan.works;
    const want = nextTyphoonShelterFacility({
      fishingBoats, landingBoats, facilities: fisheryState.facilities,
      damagedLastStorm: plan.fleet.boats.filter((b) => Number(b.repairUntil) > env - TYPHOON_SHELTER_MINUTES_PER_DAY).length,
    });
    const frozen = typeof isTyphoonShelterStormFreeze === 'function' && isTyphoonShelterStormFreeze(storm);
    // once a month: only when the month is settled (a reload replaying the turn adds nothing)
    if (already) return plan;
    delete next.suggest;
    delete next.noRoom;
    if (want && !frozen) {
      const kind = TYPHOON_SHELTER_FACILITIES[want];
      const site = chooseTyphoonShelterFacilitySite({
        basin: analysis.basin, channel: analysis.channel, lanes: geometry.lanes, slots: geometry.slots,
        items: plan.works?.items, occupied: new Set(plan.fleet.boats.map((b) => b.slot)),
        entrances: analysis.entrances.flatMap((e) => e.tiles.map((k) => k.split(':').map(Number))),
      });
      if (site && next.autoExpand && (Number(city.budget) || 0) >= kind.cost * 2) {
        const built = buildTyphoonShelterFacility(plan, want, site);
        if (built) { works = built.works; next = { ...next, facilities: [...next.facilities, { kind: want, ...site }] }; }
      } else if (site) {
        next.suggest = want;
      } else {
        next.suggest = want;
        next.noRoom = true;
      }
    }
    if (JSON.stringify(next) === JSON.stringify(plan.fishery || null) && works === plan.works) return plan;
    changed = true;
    return { ...plan, fishery: next, works };
  });
  if (!already) {
    fishery.lastSettledDay = day;
    fishery.lastMonth = month;
    fishery.history = [...fishery.history, month].slice(-TYPHOON_SHELTER_FISHERY.history);
  }
  city.fishery = typeof rememberNormalizedCityStateObject === 'function' ? rememberNormalizedCityStateObject(normalizeCityFishery(fishery)) : fishery;
  if (changed) {
    setTyphoonShelterState({ ...state, shelters: plans });
    if (typeof syncTyphoonShelterFacilitySprites === 'function') syncTyphoonShelterFacilitySprites();
  }
}

// Build a facility now, paying for it: { works } or null when the treasury cannot.
function buildTyphoonShelterFacility(plan, kind, site) {
  const def = TYPHOON_SHELTER_FACILITIES[kind];
  if (!def || !site) return null;
  if (typeof spendBudget === 'function' && !spendBudget(def.cost)) return null;
  const item = { key: `${kind}:${site.row}:${site.col}`, kind, row: site.row, col: site.col, facing: site.facing, state: 'done' };
  if (typeof showToast === 'function') {
    showToast(tsFisheryT('typhoonShelter.fishery.built', `「${plan.name}」加建${def.label}（$${def.cost}）。`, { name: plan.name, facility: def.label, cost: def.cost }), 'info');
  }
  return { works: { ...plan.works, items: [...(plan.works?.items || []), item] } };
}

// The panel's 批准 for a suggested facility, when the shelter does not expand on its own.
function approveTyphoonShelterFacility(planId) {
  const state = getTyphoonShelterState();
  const plan = state.shelters.find((p) => p.id === planId);
  const analysis = plan && getTyphoonShelterAnalyses().get(planId);
  const want = plan?.fishery?.suggest;
  if (!plan || !analysis || !want) return false;
  if (typeof isTyphoonShelterStormFreeze === 'function' && isTyphoonShelterStormFreeze(state.storm)) return false;
  const geometry = getTyphoonShelterFleetGeometry(plan, analysis);
  const site = chooseTyphoonShelterFacilitySite({
    basin: analysis.basin, channel: analysis.channel, lanes: geometry.lanes, slots: geometry.slots,
    items: plan.works?.items, occupied: new Set((plan.fleet?.boats || []).map((b) => b.slot)),
    entrances: analysis.entrances.flatMap((e) => e.tiles.map((k) => k.split(':').map(Number))),
  });
  if (!site) return false;
  const built = buildTyphoonShelterFacility(plan, want, site);
  if (!built) {
    if (typeof showToast === 'function') showToast(tsFisheryT('typhoonShelter.toast.funds', '市庫唔夠錢。'), 'warning');
    return false;
  }
  const fishery = normalizeTyphoonShelterFishery(plan.fishery);
  delete fishery.suggest;
  fishery.facilities = [...fishery.facilities, { kind: want, ...site }];
  setTyphoonShelterState({ ...state, shelters: state.shelters.map((p) => (p.id === planId ? { ...plan, works: built.works, fishery } : p)) });
  if (typeof updateHUD === 'function') updateHUD();
  if (typeof syncTyphoonShelterFacilitySprites === 'function') syncTyphoonShelterFacilitySprites();
  return true;
}

// The panel's 用途: what the shelter is for; the fleet's mix follows a boat a day.
function setTyphoonShelterUse(planId, use) {
  const state = getTyphoonShelterState();
  setTyphoonShelterState({
    ...state,
    shelters: state.shelters.map((p) => {
      if (p.id !== planId) return p;
      const next = { ...p };
      if (['mixed', 'leisure'].includes(use)) next.use = use; else delete next.use;
      return next;
    }),
  });
}

function setTyphoonShelterAutoExpand(planId, on) {
  const state = getTyphoonShelterState();
  setTyphoonShelterState({
    ...state,
    shelters: state.shelters.map((p) => (p.id === planId ? { ...p, fishery: { ...normalizeTyphoonShelterFishery(p.fishery), autoExpand: !!on } } : p)),
  });
}

// The panel's 漁業 rows for one shelter.
function typhoonShelterFisheryRows(plan) {
  if (plan.status !== 'operational') return [];
  const say = tsFisheryT;
  const money = (v) => `$${Math.round(v).toLocaleString()}`;
  const markets = getTyphoonShelterMarketsByShelter();
  const jobs = getTyphoonShelterFisheryJobs().byShelter[plan.id] || { traditional: 0, commercial: 0 };
  const summary = typeof typhoonShelterWorkSummaries !== 'undefined' ? typhoonShelterWorkSummaries.get(plan.id) : null;
  const uses = typeof TYPHOON_SHELTER_USES !== 'undefined' ? TYPHOON_SHELTER_USES : {};
  const options = Object.entries(uses).map(([k, u]) => `<option value="${k}"${(plan.use || 'fishing') === k ? ' selected' : ''}>${u.label}${u.leisure ? `（遊艇 ${Math.round(u.leisure * 100)}%）` : ''}</option>`).join('');
  const rows = [
    [say('typhoonShelter.use', '用途'), `<select class="ts-use" data-ts-use="${plan.id}">${options}</select>`],
    [say('typhoonShelter.fishery.jobs', '漁業職位'), `${jobs.traditional + jobs.commercial}${jobs.commercial ? `（酒家 ${jobs.commercial}）` : ''}`],
  ];
  if (summary?.berths) {
    const geometry = getTyphoonShelterFleetGeometry(plan, getTyphoonShelterAnalyses().get(plan.id));
    const boatBerths = geometry.slots.filter((s) => s.size >= 2 && geometry.routeBySlot.get(s.key)).length;
    const berthTarget = Math.max(0, Math.min(summary.berths.daily, boatBerths - summary.berths.reserved));
    // the working fleet's caps: the yachts' berths aside (plan.use)
    const leisureSlots = Math.round(berthTarget * (typeof getTyphoonShelterLeisureShare === 'function' ? getTyphoonShelterLeisureShare(plan) : 0));
    const workPlan = { ...plan, fleet: { ...(plan.fleet || {}), boats: (plan.fleet?.boats || []).filter((b) => !(typeof isTyphoonShelterLeisureModel === 'function' && isTyphoonShelterLeisureModel(b.model))) } };
    const caps = getTyphoonShelterFleetCaps(workPlan, berthTarget - leisureSlots, markets);
    const label = { berths: say('typhoonShelter.fishery.capBerths', '泊位'), labour: say('typhoonShelter.fishery.capLabour', '人手'), market: say('typhoonShelter.fishery.capMarket', '魚市場') };
    const fmt = (k) => (Number.isFinite(caps.caps[k]) ? caps.caps[k] : '∞');
    rows.push([say('typhoonShelter.fishery.caps', '船隊上限'),
      `${label.berths} ${fmt('berths')} · ${label.labour} ${fmt('labour')} · ${label.market} ${fmt('market')}（${say('typhoonShelter.fishery.bottleneck', '限於')}${label[caps.bottleneck]}）`]);
  }
  const last = city.fishery?.lastMonth?.byShelter?.[plan.id];
  if (last) {
    rows.push([say('typhoonShelter.fishery.lastMonth', '上月漁獲'), `${last.tonnes} 噸 · ${money(last.value)}`]);
    rows.push([say('typhoonShelter.fishery.income', '市庫收入'), `${say('typhoonShelter.fishery.tax', '漁業稅')} ${money(last.tax)} · ${say('typhoonShelter.fishery.commission', '佣金')} ${money(last.commission)}`]);
  }
  const fishery = normalizeTyphoonShelterFishery(plan.fishery);
  const built = TYPHOON_SHELTER_FACILITY_ORDER.map((k) => [k, getTyphoonShelterFacilityCount(plan, k)]).filter(([, n]) => n > 0)
    .map(([k, n]) => `${TYPHOON_SHELTER_FACILITIES[k].label}${n > 1 ? ` ×${n}` : ''}`);
  rows.push([say('typhoonShelter.fishery.facilities', '設施'), `${built.length ? built.join('、') : say('typhoonShelter.fishery.none', '未有')}
    <label class="ts-auto-expand"><input type="checkbox" data-ts-auto-expand="${plan.id}"${fishery.autoExpand ? ' checked' : ''}> ${say('typhoonShelter.fishery.auto', '自動擴建')}</label>`]);
  if (plan.fishery?.suggest) {
    const def = TYPHOON_SHELTER_FACILITIES[plan.fishery.suggest];
    rows.push([say('typhoonShelter.fishery.suggest', '建議'), plan.fishery.noRoom
      ? `${def.label}：${say('typhoonShelter.fishery.noRoom', '冇位擴建')}`
      : `${def.label}（${money(def.cost)}）<button type="button" class="ts-facility-approve" data-ts-facility="${plan.id}">${say('typhoonShelter.approve', '確定興建')}</button>`]);
  }
  // what holds it back
  const hints = [];
  const m = markets.get(plan.id);
  if (!m?.markets.length) hints.push(say('typhoonShelter.fishery.hintNoMarket', '冇魚市場：漁獲喺岸邊賣，冇佣金'));
  const fishingBoats = (plan.fleet?.boats || []).filter((b) => isTyphoonShelterFishingBoat(b.model)).length;
  if (fishingBoats > getTyphoonShelterLandingBoats(plan)) hints.push(say('typhoonShelter.fishery.hintLanding', '卸魚位不足'));
  if (fishery.shortageMonths > 0) hints.push(say('typhoonShelter.fishery.hintLabour', '人手不足'));
  if (hints.length) rows.push([say('typhoonShelter.fishery.hints', '提示'), hints.join('；')]);
  return rows;
}

const typhoonShelterFisheryApi = {
  TYPHOON_SHELTER_FISHERY,
  TYPHOON_SHELTER_FACILITIES,
  TYPHOON_SHELTER_FACILITY_KINDS,
  isTyphoonShelterFishingBoat,
  typhoonShelterFisheryJobs,
  typhoonShelterMarketTonnes,
  typhoonShelterFleetCaps,
  typhoonShelterLandingEfficiency,
  settleTyphoonShelterNight,
  TYPHOON_SHELTER_TOURISM,
  getTyphoonShelterCampaignMultiplier,
  typhoonShelterTouristCapacity,
  getTyphoonShelterTouristCapacity,
  typhoonShelterFisheryTaxPerJob,
  nextTyphoonShelterFacility,
  chooseTyphoonShelterFacilitySite,
  normalizeTyphoonShelterFishery,
  normalizeCityFishery,
  getTyphoonShelterMarketsByShelter,
  getTyphoonShelterFisheryJobs,
  recordTyphoonShelterFisheryLabour,
  getTyphoonShelterFleetCaps,
  getTyphoonShelterLandingBoats,
  settleTyphoonShelterFishery,
  approveTyphoonShelterFacility,
  setTyphoonShelterUse,
  getTyphoonShelterYachtCount,
  getTyphoonShelterMooringFees,
  setTyphoonShelterAutoExpand,
  typhoonShelterFisheryRows,
};

if (typeof module !== 'undefined' && module.exports) module.exports = typhoonShelterFisheryApi;
if (typeof globalThis !== 'undefined') Object.assign(globalThis, typhoonShelterFisheryApi);
