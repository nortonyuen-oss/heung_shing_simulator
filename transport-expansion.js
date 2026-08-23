// ── Optional Transport Expansion: Buses First ──────────────────────────────
//
// The base game deliberately treats bus stops, depots and ambient buses as
// decorative. This module upgrades those existing assets into an optional,
// save-scoped TTD-lite service layer. Every public read returns a neutral value
// unless the expansion is available, enabled and unlocked, which is the key
// compatibility guarantee for old cities and players who prefer the original
// city-building rhythm.

const TRANSPORT_EXPANSION_ID = 'transport';
const TRANSPORT_EXPANSION_SCHEMA_VERSION = 2;
const TRANSPORT_EXPANSION_UNLOCK_POPULATION = 3000;
// v1's "credit that falls through to city.budget" is gone as of schema v2 -
// the company now has its own real treasury (company.cash), seeded once at
// unlock and never topped up from or drained into city.budget again. See
// TRANSPORT_TTD_SPEC.md §4. All company money uses the SAME stylized dollar
// scale as the rest of the game (COST_HOSPITAL: 7200 etc.), where each $1
// reads as 萬 - so $600 here is "600萬", enough for two double-deckers
// ($280 + $210) with slack, exactly the spec's sizing intent.
const TRANSPORT_STARTUP_CAPITAL = 600;
const TRANSPORT_STOP_CATCHMENT_RADIUS = 5;
// How close a stop needs to be to water/beach before its auto-generated
// default name is allowed to draw the "XX碼頭" (pier) template - see
// getTransportStopAutoName.
const TRANSPORT_STOP_PIER_WATERFRONT_RADIUS = 4;
const TRANSPORT_DEPOT_CAPACITY = 12;
const TRANSPORT_DEPOT_MONTHLY_UPKEEP = 12;
// Legacy v1 clamp only - a v1 save's raw `route.buses` count is clamped to
// this range while being converted into that many grandfathered vehicles
// during migration (migrateTransportRoutesToVehicles). Schema v2 itself has
// no per-route bus cap; fleet size is bounded by depot capacity instead, §10.
const TRANSPORT_LEGACY_ROUTE_BUS_MAX = 8;
// §9: player-selected fare rate per travelled road tile. The actual charge is
// passengers alighting x chargeable trip tiles x this rate, converted onto
// the game's stylized dollar economy below.
const TRANSPORT_FARE_MIN = 15;
const TRANSPORT_FARE_MAX = 60;
const TRANSPORT_FARE_STEP = 5;
const TRANSPORT_DEFAULT_FARE = 35;
const TRANSPORT_MINUTES_PER_ROAD_TILE = 0.75;
const TRANSPORT_MINUTES_PER_STOP = 1.5;
// Converts riders x per-tile fare x travelled tiles into company dollars on
// the stylized 萬 scale. Sub-dollar amounts accrue via company.cashFraction,
// so short trips are never lost to rounding.
const TRANSPORT_FARE_ECONOMY_SCALE = 0.00015;
// A standard bus covers six authoritative tiles/day x 30 calendar days.
// Express classes multiply this by their speedFactor. Month-end settlement
// still charges each vehicle's exact tilesThisMonth.
const TRANSPORT_ESTIMATED_TILES_PER_MONTH = 180;
const TRANSPORT_TRAFFIC_RELIEF_MAX = 0.25;
const TRANSPORT_HAPPINESS_BONUS_MAX = 0.025;
const TRANSPORT_COMMERCIAL_DEMAND_BONUS_MAX = 0.03;
const TRANSPORT_INDUSTRIAL_DEMAND_BONUS_MAX = 0.03;
const TRANSPORT_LAND_VALUE_BONUS_MAX = 0.08;
const TRANSPORT_HISTORY_LIMIT = 24;
const TRANSPORT_MAX_ROUTES = 50;
const TRANSPORT_DEFAULT_VEHICLE_CLASS_ID = 'standard_double_decker';
// §9 purchase catalog, in the game's stylized dollars where $1 reads as 萬:
// $280 = 280萬 = a realistic year-2000 HK double-decker, sitting naturally
// next to COST_HOSPITAL's $7,200 (7200萬). monthlyUpkeep and tileRunningCost
// are calibrated against the REAL per-vehicle simulation's mileage (a bus
// genuinely drives ~20k tiles/month), keeping running costs a small fraction
// of peak revenue so the strategic risk is ridership falling short, not
// fixed costs - see TRANSPORT_TTD_SPEC.md §9.
const TRANSPORT_VEHICLE_CLASSES = Object.freeze({
  standard_double_decker: Object.freeze({
    id: 'standard_double_decker',
    skin: 'bus_kmb',
    capacity: 70,
    speedFactor: 1.0,
    purchasePrice: 280,
    monthlyRidershipCap: 4200,
    monthlyUpkeep: 3,
    tileRunningCost: 0.0001,
  }),
  express_single_deck: Object.freeze({
    id: 'express_single_deck',
    skin: 'bus_citybus',
    capacity: 45,
    speedFactor: 1.25,
    purchasePrice: 210,
    monthlyRidershipCap: 2700,
    monthlyUpkeep: 3,
    tileRunningCost: 0.0001,
  }),
});
// §10/§12: mandatory periodic servicing and the lightweight breakdown model.
const TRANSPORT_SERVICE_INTERVAL_DAYS = 120;
const TRANSPORT_SERVICE_DURATION_DAYS = 4;
const TRANSPORT_CONDITION_DECAY_PER_DAY = 1 / (TRANSPORT_SERVICE_INTERVAL_DAYS * 3);
const TRANSPORT_BREAKDOWN_CONDITION_THRESHOLD = 0.35;
const TRANSPORT_BREAKDOWN_DAILY_CHANCE = 0.03;
const TRANSPORT_BREAKDOWN_DURATION_DAYS = 2;
// Resale value on Sell (§10): worn, aged vehicles fetch less than a fresh one.
const TRANSPORT_VEHICLE_RESALE_FACTOR = 0.5;
// §4/§16: v1's whole bankruptcy mechanic - after this many *consecutive*
// month-end settlements with company.cash below zero, every route is
// auto-suspended (running costs stop; the player sells vehicles or waits
// out the grace period next time). No company loan mechanic in v1.
const TRANSPORT_BANKRUPTCY_GRACE_MONTHS = 3;
// §12 authoritative vehicle speed. A normal bus covers six road tiles per
// calendar day, so a typical stop-to-stop journey spans several visible game
// days (OpenTTD-style) while still completing useful trips before servicing.
// Express buses apply their class speedFactor to this value. The game clock
// advances this continuously; the map sprite only renders the saved progress.
const TRANSPORT_VEHICLE_TILES_PER_GAME_DAY = 6;
// §12 boarding: fraction of a stop's catchment origin units that forms that
// day's commuter pool. Midnight replaces the previous queue with this value
// instead of stacking yesterday's unserved riders indefinitely; vehicles
// reaching the stop during the day subtract from the current pool.
const TRANSPORT_STOP_DAILY_BOARDING_SHARE = 0.15;
const TRANSPORT_STOP_WAITING_CAP = 9999;
// This epsilon keeps tile count strictly ahead of turn count even on a full
// 256x256 route, while still breaking equal-length ties in favour of fewer
// turns.
const TRANSPORT_ROUTE_TURN_COST = 0.000001;
const TRANSPORT_ROUTE_COLORS = Object.freeze([
  '#e53935', '#1e88e5', '#43a047', '#fb8c00',
  '#8e24aa', '#00897b', '#6d4c41', '#3949ab',
]);

const TRANSPORT_DESTINATION_UNITS = Object.freeze({
  primary_school: 70,
  secondary_school: 100,
  library: 45,
  community_college: 110,
  university: 180,
  hospital: 180,
  fire_station: 35,
  police_station: 35,
  legislative_council: 90,
  stock_exchange: 160,
  park_small: 25,
  park_large: 80,
  park_flagship: 160,
  sports_ground_small: 55,
  sports_ground_large: 110,
  exhibition_center: 150,
  cultural_center: 120,
  space_museum: 100,
  buddha_statue: 90,
  heritage_temple: 55,
  grand_temple: 100,
  heritage_church: 55,
  indoor_coliseum: 170,
  murray_house: 60,
  ocean_park: 240,
  football_stadium: 220,
  airport: 260,
  container_port: 180,
});

const GAME_EXPANSION_REGISTRY = Object.freeze({
  [TRANSPORT_EXPANSION_ID]: Object.freeze({
    id: TRANSPORT_EXPANSION_ID,
    schemaVersion: TRANSPORT_EXPANSION_SCHEMA_VERSION,
    // v1 ships inside the main application. A future store connector only
    // needs to replace this entitlement predicate; save and gameplay gates do
    // not need to change.
    isAvailable: () => true,
  }),
});

function createDefaultTransportExpansionState(enabled = false) {
  return {
    schemaVersion: TRANSPORT_EXPANSION_SCHEMA_VERSION,
    enabled: !!enabled,
    unlocked: false,
    unlockAnnounced: false,
    company: createDefaultTransportCompany(),
    nextStopId: 1,
    nextRouteId: 1,
    nextVehicleId: 1,
    stops: [],
    routes: [],
    vehicles: [],
    commissionedDepotIds: [],
    weatherSuspendedDaysThisMonth: 0,
    lastWeatherDayKey: '',
    lastSettledMonthIndex: -1,
    lastFinancials: createEmptyTransportFinancials(),
    financeHistory: [],
    monthsInDebt: 0,
  };
}

// Name/presidentName default to '' (not a hardcoded language) - the UI shows
// a localized placeholder via t() when empty, same pattern
// getTransportStopDisplayName already uses for unnamed stops.
function createDefaultTransportCompany() {
  return {
    name: '',
    presidentName: '',
    cash: 0,
    // Sub-dollar fare revenue accrues here until it crosses a whole dollar,
    // which then lands in `cash` - keeps per-dwell credits real-time without
    // losing fractions of the 萬-scale dollar to rounding.
    cashFraction: 0,
    foundedYear: 0,
    foundedMonth: 0,
  };
}

function normalizeTransportCompany(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    name: String(source.name || '').slice(0, 60),
    presidentName: String(source.presidentName || '').slice(0, 40),
    // Unlike building/route money, company cash is allowed to go negative -
    // that's the bankruptcy signal in TRANSPORT_TTD_SPEC.md §4, not a bug.
    cash: normalizeTransportLegacyScaleMoney(Number(source.cash) || 0, 100000),
    cashFraction: transportClamp(Number(source.cashFraction) || 0, 0, 0.999999),
    foundedYear: Math.max(0, Math.floor(Number(source.foundedYear) || 0)),
    foundedMonth: transportClamp(Math.floor(Number(source.foundedMonth) || 0), 0, 12),
  };
}

// Dev-branch saves written before the v0.6 unit correction stored company
// money x10,000 too large (the "real dollar" scale). Any magnitude beyond
// what the stylized economy can possibly produce is that old scale, so
// divide the exact factor back out - e.g. a legacy cash of -400,013 loads
// as -$40. Values in the plausible new-scale range pass through untouched.
function normalizeTransportLegacyScaleMoney(value, threshold) {
  const numeric = Math.round(Number(value) || 0);
  return Math.abs(numeric) > threshold ? Math.round(numeric / 10000) : numeric;
}

function createEmptyTransportFinancials() {
  return {
    revenue: 0,
    routeOperations: 0,
    depotUpkeep: 0,
    cost: 0,
    net: 0,
  };
}

function normalizeTransportFinanceHistory(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((entry) => entry && typeof entry === 'object')
    .slice(-TRANSPORT_HISTORY_LIMIT)
    .map((entry) => {
      const financials = {
        ...createEmptyTransportFinancials(),
        ...Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, Number(value) || 0])),
      };
      return {
        year: Math.max(0, Math.floor(Number(entry.year) || 0)),
        month: transportClamp(Math.floor(Number(entry.month) || 1), 1, 12),
        passengers: transportRoundMoney(entry.passengers),
        revenue: transportRoundMoney(financials.revenue),
        routeOperations: transportRoundMoney(financials.routeOperations),
        depotUpkeep: transportRoundMoney(financials.depotUpkeep),
        cost: transportRoundMoney(financials.cost),
        net: Math.round(Number(financials.net) || 0),
        closingCash: Math.round(Number(entry.closingCash) || 0),
      };
    });
}

let expansionState = {
  [TRANSPORT_EXPANSION_ID]: createDefaultTransportExpansionState(false),
};

const transportRuntime = {
  dirtyNetwork: true,
  dirtyStops: true,
  dirtyDemand: true,
  dirtyRouteIds: new Set(),
  revision: 0,
  routeRuntime: new Map(),
  buildingModeShare: new Map(),
  landValueBonus: new Map(),
  happinessBonus: 0,
  commercialDemandBonus: 0,
  industrialDemandBonus: 0,
  stopWaitingEstimate: new Map(),
  queueRevision: 0,
  summary: createEmptyTransportSummary(),
};

function createEmptyTransportSummary() {
  return {
    activeRoutes: 0,
    totalRoutes: 0,
    monthlyPassengers: 0,
    averageReliability: 0,
    residentialCoverage: 0,
    serviceQuality: 0,
    connectedDepots: 0,
    fleetCapacity: 0,
    fleetAllocated: 0,
  };
}

function transportClamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function transportRoundMoney(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function normalizeTransportFare(value) {
  const clamped = transportClamp(value, TRANSPORT_FARE_MIN, TRANSPORT_FARE_MAX);
  return Math.round(clamped / TRANSPORT_FARE_STEP) * TRANSPORT_FARE_STEP;
}

function normalizeTransportColor(value, fallbackIndex = 0) {
  const text = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
  return TRANSPORT_ROUTE_COLORS[fallbackIndex % TRANSPORT_ROUTE_COLORS.length];
}

function getDefaultTransportRouteName(index) {
  const number = Math.max(1, Math.floor(Number(index) || 1));
  if (typeof t !== 'function') return `Bus ${number}`;
  const translated = t('transport.defaultRouteName', { number });
  return translated === 'transport.defaultRouteName' ? `Bus ${number}` : translated;
}

function normalizeTransportStop(raw, fallbackIndex) {
  if (!raw || typeof raw !== 'object') return null;
  const row = Math.floor(Number(raw.row));
  const col = Math.floor(Number(raw.col));
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
  const id = String(raw.id || `stop-${fallbackIndex + 1}`).slice(0, 80);
  const stop = {
    id,
    row,
    col,
    name: String(raw.name || '').slice(0, 60),
    createdTick: Math.max(0, Math.floor(Number(raw.createdTick) || 0)),
    waitingPassengers: transportClamp(
      Math.floor(Number(raw.waitingPassengers) || 0), 0, TRANSPORT_STOP_WAITING_CAP,
    ),
  };
  // Saves created before persistent queues existed have no queue value to
  // restore. Preserve that distinction as a non-enumerable migration marker;
  // it never leaks into save JSON and is removed after the initial seed.
  if (!Object.prototype.hasOwnProperty.call(raw, 'waitingPassengers')) {
    Object.defineProperty(stop, 'needsWaitingPassengerSeed', {
      value: true,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  return stop;
}

function normalizeTransportStats(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    potentialPassengers: transportRoundMoney(source.potentialPassengers),
    monthlyPassengers: transportRoundMoney(source.monthlyPassengers),
    loadFactor: transportClamp(source.loadFactor, 0, 2),
    reliability: transportClamp(source.reliability, 0, 1),
    headwayMinutes: Math.max(0, Number(source.headwayMinutes) || 0),
    waitMinutes: Math.max(0, Number(source.waitMinutes) || 0),
    roundTripMinutes: Math.max(0, Number(source.roundTripMinutes) || 0),
    averageFareDistanceTiles: Math.max(0, Number(source.averageFareDistanceTiles) || 0),
    revenue: transportRoundMoney(source.revenue),
    cost: transportRoundMoney(source.cost),
    net: Math.round(Number(source.net) || 0),
    quality: transportClamp(source.quality, 0, 1),
    effectiveBuses: Math.max(0, Math.floor(Number(source.effectiveBuses) || 0)),
  };
}

function normalizeTransportRoute(raw, fallbackIndex) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || `route-${fallbackIndex + 1}`).slice(0, 80);
  const stopIds = Array.from(new Set((Array.isArray(raw.stopIds) ? raw.stopIds : [])
    .map((value) => String(value || '').slice(0, 80))
    .filter(Boolean)));
  const history = (Array.isArray(raw.history) ? raw.history : [])
    .filter((entry) => entry && typeof entry === 'object')
    .slice(-TRANSPORT_HISTORY_LIMIT)
    .map((entry) => ({
      year: Math.floor(Number(entry.year) || 0),
      month: transportClamp(Math.floor(Number(entry.month) || 1), 1, 12),
      passengers: transportRoundMoney(entry.passengers),
      revenue: transportRoundMoney(entry.revenue),
      cost: transportRoundMoney(entry.cost),
      net: Math.round(Number(entry.net) || 0),
      reliability: transportClamp(entry.reliability, 0, 1),
    }));
  const vehicleClassId = String(
    raw.vehicleClassId || raw.servicePlan?.vehicleClassId || 'standard_double_decker',
  ).slice(0, 80);
  return {
    id,
    name: String(raw.name || getDefaultTransportRouteName(fallbackIndex + 1)).slice(0, 60),
    color: normalizeTransportColor(raw.color, fallbackIndex),
    stopIds,
    // No `buses` field as of schema v2 - which (and how many) vehicles serve
    // a route is derived at runtime from vehicle.routeId (TRANSPORT_TTD_SPEC.md
    // §8.3), never stored on the route itself. A v1 blob's `raw.buses` is
    // read separately during migration (migrateTransportRoutesToVehicles),
    // not here.
    fare: normalizeTransportFare(raw.fare ?? TRANSPORT_DEFAULT_FARE),
    status: raw.status === 'suspended' ? 'suspended' : 'active',
    // §3 restore: opt-in - when true, a vehicle also boards/alights at any
    // other present bus stop its path happens to pass, not only the stops
    // the player explicitly added to stopIds.
    pickupPassthroughStops: raw.pickupPassthroughStops === true,
    vehicleClassId,
    servicePlan: {
      ...(raw.servicePlan && typeof raw.servicePlan === 'object' && !Array.isArray(raw.servicePlan)
        ? raw.servicePlan
        : {}),
      mode: String(raw.servicePlan?.mode || 'pooled').slice(0, 40),
      vehicleClassId,
    },
    lastStats: normalizeTransportStats(raw.lastStats),
    history,
    // §12 real per-vehicle accrual, month-to-date - reset to 0 by
    // settleTransportMonth. Revenue is credited to company.cash the instant
    // a rider alights (dwellTransportVehicleAtStop), not batched here; these
    // fields exist purely for live route.lastStats/history reporting.
    monthToDatePassengers: transportRoundMoney(raw.monthToDatePassengers),
    monthToDateRevenue: transportRoundMoney(raw.monthToDateRevenue),
    monthToDatePassengerTiles: Math.max(0, Number(raw.monthToDatePassengerTiles) || 0),
  };
}

const TRANSPORT_VEHICLE_STATUSES = Object.freeze(new Set([
  'active', 'depot', 'servicing', 'broken_down', 'delivering_to_depot', 'returning_for_service',
]));

function normalizeTransportVehicle(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').slice(0, 80);
  if (!id) return null;
  return {
    id,
    classId: String(raw.classId || TRANSPORT_DEFAULT_VEHICLE_CLASS_ID).slice(0, 80),
    routeId: raw.routeId ? String(raw.routeId).slice(0, 80) : null,
    depotId: raw.depotId ? String(raw.depotId).slice(0, 80) : null,
    orderIndex: Math.max(0, Math.floor(Number(raw.orderIndex) || 0)),
    progress: transportClamp(raw.progress, 0, 1),
    ageMonths: Math.max(0, Math.floor(Number(raw.ageMonths) || 0)),
    odometerTiles: Math.max(0, Math.floor(Number(raw.odometerTiles) || 0)),
    condition: transportClamp(raw.condition ?? 1, 0, 1),
    daysSinceService: Math.max(0, Math.floor(Number(raw.daysSinceService) || 0)),
    status: TRANSPORT_VEHICLE_STATUSES.has(raw.status) ? raw.status : 'depot',
    // Counts down status: 'servicing' / 'broken_down' respectively; 0 when neither.
    serviceDaysRemaining: Math.max(0, Math.floor(Number(raw.serviceDaysRemaining) || 0)),
    brokenDaysRemaining: Math.max(0, Math.floor(Number(raw.brokenDaysRemaining) || 0)),
    purchasePrice: Math.max(0, normalizeTransportLegacyScaleMoney(raw.purchasePrice, 10000)),
    passengersAboard: Math.max(0, Math.floor(Number(raw.passengersAboard) || 0)),
    // Aggregate distance already travelled by everyone currently aboard.
    // Adding passengers does not alter the balance; movement adds
    // passengersAboard x tiles, and alighting removes their proportional
    // share. This gives distance fares without storing one record per rider.
    passengerDistanceTiles: Math.max(0, Number(raw.passengerDistanceTiles) || 0),
    lastFareDistanceTiles: Math.max(0, Number(raw.lastFareDistanceTiles) || 0),
    // Set at each dwell to that dwell's alighting revenue (not a running
    // total) - a transient "just collected $X" figure for the vehicle
    // inspector, §6/§12.
    tripRevenueAccrued: Math.max(0, Number(raw.tripRevenueAccrued) || 0),
    // Increments once per dwell (whether or not it earned revenue) so a
    // renderer can detect "a new dwell just happened" even when two
    // consecutive dwells happen to accrue the identical dollar amount.
    tripRevenueSerial: Math.max(0, Math.floor(Number(raw.tripRevenueSerial) || 0)),
    // Tiles driven this calendar month - feeds tileRunningCost at
    // settleTransportMonth, then resets to 0. Distinct from odometerTiles
    // (lifetime, never resets).
    tilesThisMonth: Math.max(0, Math.floor(Number(raw.tilesThisMonth) || 0)),
  };
}

// v1 -> v2: a route's old `buses` count becomes that many real, free
// ("grandfathered") vehicles assigned to it - the player already "paid" for
// them conceptually under the old model (TRANSPORT_TTD_SPEC.md §8.4).
// `rawRoutes` must be the *unnormalized* source routes (normalizeTransportRoute
// no longer keeps `buses`), matched by array position to `normalizedRoutes`.
function migrateTransportRoutesToVehicles(rawRoutes, normalizedRoutes, startVehicleId) {
  const vehicles = [];
  let nextVehicleId = Math.max(1, Math.floor(Number(startVehicleId) || 1));
  const allDepotIds = typeof buildingData === 'undefined'
    ? []
    : Object.keys(buildingData).filter((id) => buildingData[id]?.type === 'bus_depot');
  const connectedDepotIds = typeof isTransportDepotConnected === 'function'
    ? allDepotIds.filter((id) => isTransportDepotConnected(id, buildingData[id]))
    : [];
  // Prefer connected depots so a grandfathered fleet starts road-usable; if
  // none are connected (yet), still grandfather the vehicles rather than
  // silently deleting the player's fleet - they just start parked/inactive
  // until a depot is reconnected.
  const pool = connectedDepotIds.length > 0 ? connectedDepotIds : allDepotIds;
  let depotCursor = 0;

  normalizedRoutes.forEach((route, index) => {
    const rawBusCount = Math.round(transportClamp(
      rawRoutes?.[index]?.buses, 0, TRANSPORT_LEGACY_ROUTE_BUS_MAX,
    ));
    for (let i = 0; i < rawBusCount; i++) {
      const depotId = pool.length > 0 ? pool[depotCursor % pool.length] : null;
      depotCursor++;
      const vehicle = normalizeTransportVehicle({
        id: `bus-${nextVehicleId++}`,
        classId: route.vehicleClassId,
        routeId: route.id,
        depotId,
        status: depotId ? 'active' : 'depot',
        condition: 1,
        purchasePrice: 0, // grandfathered, not a real purchase - see §8.4
      });
      if (vehicle) vehicles.push(vehicle);
    }
  });
  return { vehicles, nextVehicleId };
}

function normalizeTransportExpansionState(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const defaults = createDefaultTransportExpansionState(false);
  const sourceVersion = Math.max(1, Math.floor(Number(source.schemaVersion) || 1));
  const stops = (Array.isArray(source.stops) ? source.stops : [])
    .map(normalizeTransportStop)
    .filter(Boolean);
  const stopIds = new Set(stops.map((stop) => stop.id));
  const routes = (Array.isArray(source.routes) ? source.routes : [])
    .map(normalizeTransportRoute)
    .filter(Boolean)
    .map((route) => ({
      ...route,
      stopIds: route.stopIds.filter((id) => stopIds.has(id)),
    }));

  let vehicles = (Array.isArray(source.vehicles) ? source.vehicles : [])
    .map(normalizeTransportVehicle)
    .filter(Boolean);
  let nextVehicleId = Math.max(1, Math.floor(Number(source.nextVehicleId) || vehicles.length + 1));
  let company = normalizeTransportCompany(source.company);

  // v1 -> v2: synthesize vehicles from each route's old `buses` count, and
  // carry forward whatever startup credit was left as the new company's
  // opening cash - see TRANSPORT_TTD_SPEC.md §8.4. One-way; a v2 save is
  // never read by pre-migration code.
  if (sourceVersion < 2) {
    const migrated = migrateTransportRoutesToVehicles(
      Array.isArray(source.routes) ? source.routes : [], routes, nextVehicleId,
    );
    vehicles = migrated.vehicles;
    nextVehicleId = migrated.nextVehicleId;
    company = {
      ...company,
      cash: transportRoundMoney(source.startupCreditRemaining),
    };
  }

  return {
    ...defaults,
    schemaVersion: TRANSPORT_EXPANSION_SCHEMA_VERSION,
    enabled: source.enabled === true,
    unlocked: source.unlocked === true,
    unlockAnnounced: source.unlockAnnounced === true,
    company,
    nextStopId: Math.max(1, Math.floor(Number(source.nextStopId) || stops.length + 1)),
    nextRouteId: Math.max(1, Math.floor(Number(source.nextRouteId) || routes.length + 1)),
    nextVehicleId,
    stops,
    routes,
    vehicles,
    commissionedDepotIds: Array.from(new Set(
      (Array.isArray(source.commissionedDepotIds) ? source.commissionedDepotIds : [])
        .map((id) => String(id || '').slice(0, 80))
        .filter(Boolean),
    )),
    weatherSuspendedDaysThisMonth: transportClamp(
      Math.floor(Number(source.weatherSuspendedDaysThisMonth) || 0), 0, 30,
    ),
    lastWeatherDayKey: String(source.lastWeatherDayKey || '').slice(0, 40),
    lastSettledMonthIndex: Number.isFinite(Number(source.lastSettledMonthIndex))
      ? Math.floor(Number(source.lastSettledMonthIndex))
      : -1,
    lastFinancials: {
      ...createEmptyTransportFinancials(),
      ...(source.lastFinancials && typeof source.lastFinancials === 'object'
        ? Object.fromEntries(Object.entries(source.lastFinancials).map(([key, value]) => [key, Number(value) || 0]))
        : {}),
    },
    financeHistory: normalizeTransportFinanceHistory(source.financeHistory),
    monthsInDebt: Math.max(0, Math.floor(Number(source.monthsInDebt) || 0)),
  };
}

function getTransportExpansionState() {
  if (!expansionState[TRANSPORT_EXPANSION_ID]) {
    expansionState[TRANSPORT_EXPANSION_ID] = createDefaultTransportExpansionState(false);
  }
  return expansionState[TRANSPORT_EXPANSION_ID];
}

function isExpansionAvailable(id) {
  const entry = GAME_EXPANSION_REGISTRY[id];
  return !!entry && entry.isAvailable() === true;
}

function isExpansionEnabled(id) {
  if (!isExpansionAvailable(id)) return false;
  return expansionState[id]?.enabled === true;
}

function isTransportExpansionActive() {
  const state = getTransportExpansionState();
  return isExpansionEnabled(TRANSPORT_EXPANSION_ID) && state.unlocked === true;
}

function isTransportOperational() {
  return isTransportExpansionActive() && getTransportExpansionState().routes.length > 0;
}

function resetExpansionState(options = {}) {
  expansionState = {
    [TRANSPORT_EXPANSION_ID]: createDefaultTransportExpansionState(options.transportEnabled === true),
  };
  resetTransportRuntime();
  if (typeof resetTransportUiForCityChange === 'function') resetTransportUiForCityChange();
}

function resetTransportRuntime() {
  transportRuntime.dirtyNetwork = true;
  transportRuntime.dirtyStops = true;
  transportRuntime.dirtyDemand = true;
  transportRuntime.dirtyRouteIds.clear();
  transportRuntime.revision++;
  transportRuntime.routeRuntime.clear();
  transportRuntime.buildingModeShare.clear();
  transportRuntime.landValueBonus.clear();
  transportRuntime.happinessBonus = 0;
  transportRuntime.commercialDemandBonus = 0;
  transportRuntime.industrialDemandBonus = 0;
  transportRuntime.stopWaitingEstimate.clear();
  transportRuntime.queueRevision++;
  transportRuntime.summary = createEmptyTransportSummary();
  if (typeof invalidateTransportVisuals === 'function') {
    invalidateTransportVisuals(typeof activeScene === 'undefined' ? null : activeScene, true);
  }
}

function getExpansionSaveState() {
  const state = getTransportExpansionState();
  // Derived paths, coverage maps and live vehicle positions intentionally do
  // not exist in the persistent object.
  return {
    [TRANSPORT_EXPANSION_ID]: JSON.parse(JSON.stringify(state)),
  };
}

function restoreExpansionState(rawExpansions) {
  expansionState = {
    [TRANSPORT_EXPANSION_ID]: normalizeTransportExpansionState(rawExpansions?.transport),
  };
  resetTransportRuntime();
  syncTransportStops();
  updateTransportUnlockState({ notify: false });
  seedLegacyTransportWaitingQueues();
  if (typeof resetTransportUiForCityChange === 'function') resetTransportUiForCityChange();
}

function updateTransportUnlockState(options = {}) {
  const state = getTransportExpansionState();
  if (!state.enabled || !isExpansionAvailable(TRANSPORT_EXPANSION_ID)) return false;
  const population = Number(typeof city === 'undefined' ? 0 : city.population) || 0;
  if (state.unlocked || population < TRANSPORT_EXPANSION_UNLOCK_POPULATION) return state.unlocked;
  state.unlocked = true;
  // Founding grant: the company's one and only transfer from the city -
  // see TRANSPORT_TTD_SPEC.md §4. `foundedYear === 0` means "not founded
  // yet" (createDefaultTransportCompany's sentinel), so this only fires
  // once, even if population dips and re-crosses the threshold somehow.
  if (state.company.foundedYear === 0) {
    state.company.cash = TRANSPORT_STARTUP_CAPITAL;
    state.company.foundedYear = typeof city === 'undefined' ? 1900 : city.year;
    state.company.foundedMonth = typeof city === 'undefined' ? 1 : city.month;
  }
  if (!state.unlockAnnounced && options.notify !== false) {
    state.unlockAnnounced = true;
    if (typeof showToast === 'function') showToast(t('transport.toast.unlocked'), 'info');
  }
  markTransportDemandDirty();
  if (typeof refreshTransportUi === 'function') refreshTransportUi();
  return true;
}

function setExpansionEnabled(id, enabled, options = {}) {
  if (id !== TRANSPORT_EXPANSION_ID || !isExpansionAvailable(id)) return false;
  const state = getTransportExpansionState();
  state.enabled = !!enabled;
  updateTransportUnlockState({ notify: options.notify !== false });
  resetTransportRuntime();
  if (typeof refreshTransportUi === 'function') refreshTransportUi();
  if (typeof updateSettingsMenu === 'function') updateSettingsMenu();
  if (typeof queueCityChangeAutosave === 'function' && options.autosave !== false) {
    queueCityChangeAutosave();
  }
  return state.enabled;
}

// The ONLY construction spender for transport infrastructure (stop pairing,
// depot buildings, vehicle purchases). While the expansion isn't active yet,
// it's ordinary city spending (a city can have bus stops long before anyone
// unlocks the company). Once active, it draws *exclusively* from
// company.cash - no fallback to city.budget, ever. See TRANSPORT_TTD_SPEC.md
// §4: "Company cannot spend city.budget, and the city cannot spend
// company.cash."
function spendTransportConstruction(amount) {
  const cost = Math.max(0, Math.round(Number(amount) || 0));
  if (!isTransportExpansionActive()) {
    return typeof spendBudget === 'function' ? spendBudget(cost) : false;
  }
  const state = getTransportExpansionState();
  if (state.company.cash < cost) return false;
  state.company.cash = Math.round(state.company.cash - cost);
  if (typeof refreshTransportUi === 'function') refreshTransportUi();
  return true;
}

function getTransportStopKey(row, col) {
  return `${Math.floor(Number(row))}:${Math.floor(Number(col))}`;
}

function syncTransportStops() {
  const state = getTransportExpansionState();
  const byLocation = new Map(state.stops.map((stop) => [getTransportStopKey(stop.row, stop.col), stop]));
  if (typeof busStopMap !== 'undefined' && Array.isArray(busStopMap)) {
    for (let row = 0; row < busStopMap.length; row++) {
      const cells = busStopMap[row];
      if (!Array.isArray(cells)) continue;
      for (let col = 0; col < cells.length; col++) {
        if (!Array.isArray(cells[col]) || cells[col].length === 0) continue;
        const key = getTransportStopKey(row, col);
        if (byLocation.has(key)) continue;
        const stop = {
          id: `stop-${state.nextStopId++}`,
          row,
          col,
          name: '',
          createdTick: Math.max(0, Number(typeof city === 'undefined' ? 0 : city.tick) || 0),
          waitingPassengers: 0,
        };
        state.stops.push(stop);
        byLocation.set(key, stop);
      }
    }
  }
  transportRuntime.dirtyStops = false;
  return state.stops;
}

function getTransportStopById(id) {
  if (transportRuntime.dirtyStops) syncTransportStops();
  return getTransportExpansionState().stops.find((stop) => stop.id === id) ?? null;
}

function getTransportStopAt(row, col, options = {}) {
  if (transportRuntime.dirtyStops) syncTransportStops();
  const stop = getTransportExpansionState().stops.find((entry) => (
    entry.row === row && entry.col === col
  )) ?? null;
  if (!stop || options.presentOnly !== true) return stop;
  return isTransportStopPresent(stop) ? stop : null;
}

function isTransportStopPresent(stop) {
  if (!stop) return false;
  const sides = typeof getBusStopSides === 'function' ? getBusStopSides(stop.row, stop.col) : null;
  return Array.isArray(sides) && sides.length > 0;
}

// §15 auto-naming: a stop with no player-chosen name is labelled after its
// district (a nearby district sign, or else one of the 18 auto-scattered
// HK districts, per city-districts.js) plus a template suffix - a compass
// direction picked from the stop's real position relative to that district's
// centre, "碼頭" only when the stop is actually near water, and the other
// templates picked deterministically (per stop.id, stable across reloads)
// from what's left. Nothing here is stored - it's recomputed every call, so
// a stop's default name tracks its district live until the player renames it.
function getTransportStopAutoName(stop) {
  if (!stop || typeof getDistrictNameForTile !== 'function') return null;
  const district = getDistrictNameForTile(stop.row, stop.col);
  if (!district) return null;
  const random = typeof createRandom === 'function' ? createRandom(`transport-stop-name:${stop.id}`) : Math.random;

  const dRow = stop.row - district.center.row;
  const dCol = stop.col - district.center.col;
  let directionZh;
  let directionEn;
  if (dRow === 0 && dCol === 0) {
    const options = [['北', 'North'], ['南', 'South'], ['東', 'East'], ['西', 'West']];
    [directionZh, directionEn] = options[Math.floor(random() * options.length)];
  } else if (Math.abs(dRow) >= Math.abs(dCol)) {
    [directionZh, directionEn] = dRow < 0 ? ['北', 'North'] : ['南', 'South'];
  } else {
    [directionZh, directionEn] = dCol < 0 ? ['西', 'West'] : ['東', 'East'];
  }

  const nearWater = typeof isNearWaterfront === 'function'
    && isNearWaterfront(stop.row, stop.col, TRANSPORT_STOP_PIER_WATERFRONT_RADIUS);
  const templates = [
    { zh: directionZh, en: ` ${directionEn}` },
    { zh: '市中心', en: ' Town Centre' },
    { zh: '新城', en: ' New Town' },
    { zh: '廣場', en: ' Plaza' },
    { zh: '花園', en: ' Garden' },
  ];
  if (nearWater) templates.push({ zh: '碼頭', en: ' Pier' });
  const template = templates[Math.floor(random() * templates.length)];

  return {
    zh: `${district.zhRoot}${template.zh}`,
    en: `${district.en}${template.en}`,
  };
}

function getTransportStopDisplayName(stop, index = 0) {
  if (stop?.name) return stop.name;
  const auto = getTransportStopAutoName(stop);
  if (auto) {
    const language = typeof getCurrentLanguage === 'function' ? getCurrentLanguage() : 'en';
    return language === 'en' ? auto.en : auto.zh;
  }
  return `${typeof t === 'function' ? t('transport.stop') : 'Stop'} ${index + 1}`;
}

function renameTransportStop(stopId, name) {
  const stop = getTransportStopById(stopId);
  if (!stop) return false;
  stop.name = String(name || '').trim().slice(0, 60);
  return true;
}

function listTransportStopSites(options = {}) {
  if (transportRuntime.dirtyStops) syncTransportStops();
  return getTransportExpansionState().stops.filter((stop) => {
    if (options.presentOnly === false) return true;
    return isTransportStopPresent(stop);
  });
}

function isTransportStopPaired(stop) {
  if (!stop) return false;
  const sides = typeof getBusStopSides === 'function' ? getBusStopSides(stop.row, stop.col) : null;
  const eligible = typeof getBusStopEligibleSides === 'function'
    ? getBusStopEligibleSides(stop.row, stop.col)
    : null;
  return Array.isArray(eligible)
    && eligible.length === 2
    && Array.isArray(sides)
    && eligible.every((side) => sides.includes(side));
}

function getTransportStopPairingCost(stopIds) {
  return Array.from(new Set(stopIds || [])).reduce((sum, id) => {
    const stop = getTransportStopById(id);
    if (!stop) return sum;
    const sides = typeof getBusStopSides === 'function' ? getBusStopSides(stop.row, stop.col) : null;
    const eligible = typeof getBusStopEligibleSides === 'function'
      ? getBusStopEligibleSides(stop.row, stop.col)
      : null;
    if (!Array.isArray(eligible)) return sum;
    const missing = eligible.filter((side) => !Array.isArray(sides) || !sides.includes(side)).length;
    return sum + missing * (typeof COST_BUS_STOP === 'number' ? COST_BUS_STOP : 20);
  }, 0);
}

function ensureTransportStopPairs(stopIds, scene = (typeof activeScene === 'undefined' ? null : activeScene)) {
  const uniqueIds = Array.from(new Set(stopIds || []));
  const stops = uniqueIds.map(getTransportStopById).filter(Boolean);
  if (stops.length !== uniqueIds.length) return false;
  if (stops.some((stop) => !isTransportStopPresent(stop))) return false;
  const eligibleSides = stops.map((stop) => (
    typeof getBusStopEligibleSides === 'function'
      ? getBusStopEligibleSides(stop.row, stop.col)
      : null
  ));
  if (eligibleSides.some((eligible) => !Array.isArray(eligible) || eligible.length !== 2)) return false;
  const totalCost = getTransportStopPairingCost(uniqueIds);
  if (totalCost > 0 && !spendTransportConstruction(totalCost)) return false;
  for (let index = 0; index < stops.length; index++) {
    const stop = stops[index];
    const eligible = eligibleSides[index];
    if (typeof setBusStopSides === 'function') setBusStopSides(stop.row, stop.col, Array.from(eligible));
    if (typeof refreshBusStopSpriteAt === 'function') refreshBusStopSpriteAt(scene, stop.row, stop.col);
  }
  markTransportStopsDirty(stops);
  return true;
}

function getTransportDepotFrontageTiles(anchorId, record) {
  if (!record || record.type !== 'bus_depot') return [];
  const [row, col] = String(anchorId).split(':').map(Number);
  const rows = Math.max(1, Number(record.footprintRows) || 3);
  const cols = Math.max(1, Number(record.footprintCols) || 3);
  const side = ['n', 'e', 's', 'w'].includes(record.busDepotRawSide)
    ? record.busDepotRawSide
    : 's';
  const tiles = [];
  if (side === 'n' || side === 's') {
    const frontageRow = side === 'n' ? row - 1 : row + rows;
    for (let offset = 0; offset < cols; offset++) tiles.push([frontageRow, col + offset]);
  } else {
    const frontageCol = side === 'w' ? col - 1 : col + cols;
    for (let offset = 0; offset < rows; offset++) tiles.push([row + offset, frontageCol]);
  }
  return tiles;
}

function isTransportDepotConnected(anchorId, record = (typeof buildingData === 'undefined' ? null : buildingData[anchorId])) {
  return getTransportDepotFrontageTiles(anchorId, record).some(([row, col]) => (
    typeof isInsideMap === 'function'
      && isInsideMap(row, col)
      && (typeof isRoadTile === 'function' ? isRoadTile(row, col) : false)
  ));
}

function listTransportDepots(options = {}) {
  if (typeof buildingData === 'undefined') return [];
  const state = getTransportExpansionState();
  const commissioned = new Set(state.commissionedDepotIds);
  return Object.entries(buildingData)
    .filter(([, record]) => record?.type === 'bus_depot')
    .map(([id, record]) => ({
      id,
      record,
      connected: isTransportDepotConnected(id, record),
      commissioned: commissioned.has(id),
    }))
    .filter((depot) => options.connectedOnly !== true || depot.connected);
}

// Commissions every currently-connected depot (idempotent), not just the
// first one ever seen - a depot only needs a road frontage to go into
// service, so all of them should become selectable/usable as soon as
// they're connected.
function commissionAllConnectedTransportDepots() {
  const state = getTransportExpansionState();
  const connected = listTransportDepots({ connectedOnly: true });
  connected.forEach((depot) => {
    if (!state.commissionedDepotIds.includes(depot.id)) state.commissionedDepotIds.push(depot.id);
  });
  return connected;
}

function getConnectedCommissionedTransportDepots() {
  const commissioned = new Set(getTransportExpansionState().commissionedDepotIds);
  return listTransportDepots({ connectedOnly: true }).filter((depot) => commissioned.has(depot.id));
}

// §13: repurposed from an abstract per-route pool into literal depot parking
// capacity - citywide total (reporting) and per-depot (purchase gating).
function getTransportFleetCapacity() {
  return getConnectedCommissionedTransportDepots().length * TRANSPORT_DEPOT_CAPACITY;
}

function getTransportRequestedFleet() {
  return getTransportExpansionState().vehicles.length;
}

function getTransportDepotVehicleCount(depotId) {
  return getTransportExpansionState().vehicles.filter((vehicle) => vehicle.depotId === depotId).length;
}

function getTransportRouteVehicles(routeId) {
  return getTransportExpansionState().vehicles.filter((vehicle) => vehicle.routeId === routeId);
}

// "Effective" = actually able to run today: assigned, not laid up for
// service/repair/return, and homed at a depot that's currently connected+
// commissioned (a disconnected depot's vehicles idle in place, §11).
function getTransportRouteEffectiveVehicleCount(routeId) {
  const connectedDepotIds = new Set(getConnectedCommissionedTransportDepots().map((depot) => depot.id));
  return getTransportRouteVehicles(routeId).filter((vehicle) => (
    vehicle.status === 'active' && connectedDepotIds.has(vehicle.depotId)
  )).length;
}

// §12 running cost: tileRunningCost x tiles driven this month + monthlyUpkeep,
// summed per-vehicle. `dayFraction` prorates monthlyUpkeep for a live
// mid-month display estimate (updateTransportSimulation); settleTransportMonth
// calls this with dayFraction 1 (full month) right before resetting the
// per-vehicle/per-route month-to-date counters.
function getTransportRouteAccruedCost(route, dayFraction = 1) {
  let cost = 0;
  for (const vehicle of getTransportRouteVehicles(route.id)) {
    const vehicleClass = getTransportVehicleClass(vehicle.classId);
    cost += vehicle.tilesThisMonth * vehicleClass.tileRunningCost + vehicleClass.monthlyUpkeep * dayFraction;
  }
  return transportRoundMoney(cost);
}

function getTransportVehicleClass(classId) {
  return TRANSPORT_VEHICLE_CLASSES[classId] || TRANSPORT_VEHICLE_CLASSES[TRANSPORT_DEFAULT_VEHICLE_CLASS_ID];
}

function listTransportVehicleClasses() {
  return Object.values(TRANSPORT_VEHICLE_CLASSES);
}

// §10 Buy tab: creates a parked, unassigned vehicle at `depotId`, debiting
// company.cash. Throws createTransportError on any validation failure so
// callers (UI, tests) can branch on `.code` the same way route creation does.
function buyTransportVehicle(depotId, classId) {
  if (!isTransportExpansionActive()) throw createTransportError('notActive');
  const state = getTransportExpansionState();
  const depot = listTransportDepots({ connectedOnly: true }).find((entry) => entry.id === depotId);
  if (!depot || !state.commissionedDepotIds.includes(depotId)) throw createTransportError('needsDepot');
  if (getTransportDepotVehicleCount(depotId) >= TRANSPORT_DEPOT_CAPACITY) {
    throw createTransportError('depotFull');
  }
  const vehicleClass = TRANSPORT_VEHICLE_CLASSES[classId];
  if (!vehicleClass) throw createTransportError('invalidClass');
  if (!spendTransportConstruction(vehicleClass.purchasePrice)) throw createTransportError('insufficientFunds');
  const vehicle = normalizeTransportVehicle({
    id: `bus-${state.nextVehicleId}`,
    classId,
    routeId: null,
    depotId,
    status: 'depot',
    condition: 1,
    purchasePrice: vehicleClass.purchasePrice,
  });
  state.nextVehicleId++;
  state.vehicles.push(vehicle);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return vehicle;
}

// §10 Fleet tab "Assign to route": pass routeId: null to unassign back to
// idle-at-depot. Only a vehicle currently parked at its depot (status
// 'depot') can be (re)assigned - one already out on a route must be sold or
// reassigned via the depot's own service/return flow, not teleported.
function assignTransportVehicleToRoute(vehicleId, routeId) {
  const state = getTransportExpansionState();
  const vehicle = state.vehicles.find((entry) => entry.id === vehicleId);
  if (!vehicle) throw createTransportError('missingVehicle');
  if (vehicle.status !== 'depot') throw createTransportError('vehicleNotAvailable');
  if (routeId) {
    const route = state.routes.find((entry) => entry.id === routeId);
    if (!route) throw createTransportError('missingRoute');
    vehicle.routeId = routeId;
    vehicle.orderIndex = 0;
    vehicle.progress = 0;
    vehicle.passengersAboard = 0;
    vehicle.passengerDistanceTiles = 0;
    vehicle.lastFareDistanceTiles = 0;
    vehicle.status = 'active';
  } else {
    vehicle.routeId = null;
  }
  markTransportRouteDirty(routeId || '');
  updateTransportSimulation();
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return vehicle;
}

// §10 Fleet tab "Sell": a vehicle out on a route must return to its depot
// first (mirrors OpenTTD - no mid-road scrapping). Since real per-vehicle
// movement isn't simulated yet (§12 lands later), this flags the return and
// reports false; advanceTransportVehiclesDaily() resolves the trip once the
// depot is reachable, at which point a follow-up Sell call succeeds.
function sellTransportVehicle(vehicleId) {
  const state = getTransportExpansionState();
  const vehicle = state.vehicles.find((entry) => entry.id === vehicleId);
  if (!vehicle) return false;
  if (vehicle.status !== 'depot') {
    sendTransportVehicleToDepot(vehicleId);
    return false;
  }
  const index = state.vehicles.indexOf(vehicle);
  state.vehicles.splice(index, 1);
  const resaleValue = Math.round(vehicle.purchasePrice * vehicle.condition * TRANSPORT_VEHICLE_RESALE_FACTOR);
  state.company.cash = Math.round(state.company.cash + resaleValue);
  markTransportRouteDirty(vehicle.routeId || '');
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return true;
}

// OpenTTD-style explicit "send to depot" command. A moving bus keeps its
// route assignment until the daily movement state reaches its home depot;
// advanceTransportVehiclesDaily() then parks and unassigns it so it can be
// reassigned or sold without teleporting it off the road.
function sendTransportVehicleToDepot(vehicleId) {
  const vehicle = getTransportExpansionState().vehicles.find((entry) => entry.id === vehicleId);
  if (!vehicle) return false;
  if (vehicle.status === 'depot' || vehicle.status === 'delivering_to_depot') return true;
  if (vehicle.status !== 'active' && vehicle.status !== 'returning_for_service'
    && vehicle.status !== 'broken_down') return false;
  vehicle.status = 'delivering_to_depot';
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return true;
}

// §10/§12 daily tick: ages every non-parked vehicle, runs the mandatory
// periodic-service state machine, resolves in-progress depot returns (sell
// or service recall), and rolls the lightweight breakdown chance for
// vehicles whose service was skipped (most likely a disconnected depot).
// Call once per simulated day, e.g. from game-clock.js's daily advance hook.
function advanceTransportVehiclesDaily() {
  if (!isTransportExpansionActive()) return;
  const state = getTransportExpansionState();
  const connectedDepotIds = new Set(getConnectedCommissionedTransportDepots().map((depot) => depot.id));
  for (const vehicle of state.vehicles) {
    if (vehicle.status === 'depot') {
      // §10: idle parked time slowly restores condition (a mechanic can
      // always get to a bus that's sitting in the yard) - but a *working*
      // vehicle relies on the mandatory periodic service below, never this.
      vehicle.condition = transportClamp(
        vehicle.condition + TRANSPORT_CONDITION_DECAY_PER_DAY * 2, 0, 1,
      );
      continue;
    }
    if (vehicle.status === 'servicing') {
      vehicle.serviceDaysRemaining = Math.max(0, vehicle.serviceDaysRemaining - 1);
      if (vehicle.serviceDaysRemaining <= 0) {
        vehicle.condition = 1;
        vehicle.daysSinceService = 0;
        vehicle.status = vehicle.routeId ? 'active' : 'depot';
      }
      continue;
    }
    if (vehicle.status === 'broken_down') {
      vehicle.brokenDaysRemaining = Math.max(0, vehicle.brokenDaysRemaining - 1);
      if (vehicle.brokenDaysRemaining <= 0) vehicle.status = vehicle.routeId ? 'active' : 'depot';
      continue;
    }
    vehicle.daysSinceService++;
    vehicle.condition = transportClamp(vehicle.condition - TRANSPORT_CONDITION_DECAY_PER_DAY, 0, 1);
    if (vehicle.status === 'delivering_to_depot' || vehicle.status === 'returning_for_service') {
      // No real movement sim yet (§12) - resolve the return the moment the
      // depot is reachable; otherwise the vehicle idles in place, unable to
      // route home, exactly like a broken route's assigned vehicles (§11).
      if (!vehicle.depotId || !connectedDepotIds.has(vehicle.depotId)) continue;
      if (vehicle.status === 'returning_for_service') {
        vehicle.status = 'servicing';
        vehicle.serviceDaysRemaining = TRANSPORT_SERVICE_DURATION_DAYS;
        vehicle.passengersAboard = 0;
        vehicle.passengerDistanceTiles = 0;
        vehicle.lastFareDistanceTiles = 0;
      } else {
        vehicle.status = 'depot';
        vehicle.routeId = null;
        vehicle.passengersAboard = 0;
        vehicle.passengerDistanceTiles = 0;
        vehicle.lastFareDistanceTiles = 0;
      }
      continue;
    }
    if (vehicle.status !== 'active') continue;
    if (vehicle.daysSinceService >= TRANSPORT_SERVICE_INTERVAL_DAYS) {
      if (vehicle.depotId && connectedDepotIds.has(vehicle.depotId)) {
        vehicle.status = 'returning_for_service';
      }
      // Depot disconnected: service deferred, condition keeps decaying - the
      // natural in-fiction consequence, no special-case code needed (§10).
      continue;
    }
    if (
      vehicle.condition < TRANSPORT_BREAKDOWN_CONDITION_THRESHOLD
      && Math.random() < TRANSPORT_BREAKDOWN_DAILY_CHANCE
    ) {
      vehicle.status = 'broken_down';
      vehicle.brokenDaysRemaining = TRANSPORT_BREAKDOWN_DURATION_DAYS;
    }
  }
}

function setTransportStopWaitingCount(stop, value) {
  if (!stop) return 0;
  const next = transportClamp(
    Math.floor(Number(value) || 0), 0, TRANSPORT_STOP_WAITING_CAP,
  );
  const previous = Math.max(0, Math.floor(Number(stop.waitingPassengers) || 0));
  stop.waitingPassengers = next;
  transportRuntime.stopWaitingEstimate.set(stop.id, next);
  if (next !== previous) transportRuntime.queueRevision++;
  return next;
}

function seedLegacyTransportWaitingQueues() {
  if (!isTransportExpansionActive()) return 0;
  let seeded = 0;
  for (const stop of getTransportExpansionState().stops) {
    if (stop.needsWaitingPassengerSeed !== true) continue;
    const arrivals = isTransportStopPresent(stop)
      ? Math.round(
          getTransportStopCatchmentUnits(stop).originUnits
          * TRANSPORT_STOP_DAILY_BOARDING_SHARE,
        )
      : 0;
    setTransportStopWaitingCount(stop, arrivals);
    delete stop.needsWaitingPassengerSeed;
    seeded++;
  }
  return seeded;
}

function getTransportRouteFareDistanceCap(route) {
  if (!route) return 1;
  ensureTransportRouteRuntime();
  const runtime = transportRuntime.routeRuntime.get(route.id);
  return Math.max(1, (runtime?.path?.length || 2) - 1);
}

function calculateTransportFareRevenue(passengers, farePerTile, distanceTiles) {
  return Math.max(0, Number(passengers) || 0)
    * normalizeTransportFare(farePerTile)
    * Math.max(0, Number(distanceTiles) || 0)
    * TRANSPORT_FARE_ECONOMY_SCALE;
}

// §12 dwell: alight (destination-weighted among the route's stops) before
// boarding from the stop's persistent queue. Revenue credits company.cash
// immediately - real per-trip cash flow, not batched to month-end like
// running costs.
function dwellTransportVehicleAtStop(vehicle, route, stop) {
  const vehicleClass = getTransportVehicleClass(vehicle.classId);
  vehicle.tripRevenueAccrued = 0;
  vehicle.tripRevenueSerial = (Math.max(0, Math.floor(Number(vehicle.tripRevenueSerial) || 0))) + 1;

  if (vehicle.passengersAboard > 0) {
    const stops = route.stopIds.map(getTransportStopById).filter(Boolean);
    let totalDestinationUnits = 0;
    for (const routeStop of stops) totalDestinationUnits += getTransportStopCatchmentUnits(routeStop).destinationUnits;
    const stopDestinationUnits = getTransportStopCatchmentUnits(stop).destinationUnits;
    const alightShare = totalDestinationUnits > 0
      ? transportClamp(stopDestinationUnits / totalDestinationUnits, 0.05, 0.6)
      : 0.2;
    const alighting = Math.min(vehicle.passengersAboard, Math.round(vehicle.passengersAboard * alightShare));
    if (alighting > 0) {
      const aboardBeforeAlighting = vehicle.passengersAboard;
      const passengerDistanceBalance = Math.max(0, Number(vehicle.passengerDistanceTiles) || 0);
      const averageTravelledTiles = passengerDistanceBalance / aboardBeforeAlighting;
      const chargeableDistanceTiles = Math.min(
        averageTravelledTiles,
        getTransportRouteFareDistanceCap(route),
      );
      vehicle.passengersAboard -= alighting;
      vehicle.passengerDistanceTiles = vehicle.passengersAboard > 0
        ? Math.max(0, passengerDistanceBalance - averageTravelledTiles * alighting)
        : 0;
      vehicle.lastFareDistanceTiles = chargeableDistanceTiles;
      // Fare is distance based: riders x actual average travelled tiles x
      // the route's per-tile rate. A single outbound route length caps the
      // bill so somebody staying aboard for a return loop is not overcharged.
      const revenue = calculateTransportFareRevenue(
        alighting, route.fare, chargeableDistanceTiles,
      );
      const state = getTransportExpansionState();
      state.company.cashFraction += revenue;
      const wholeDollars = Math.floor(state.company.cashFraction);
      if (wholeDollars > 0) {
        state.company.cash += wholeDollars;
        state.company.cashFraction -= wholeDollars;
      }
      vehicle.tripRevenueAccrued = revenue;
      route.monthToDatePassengers += alighting;
      route.monthToDateRevenue += revenue;
      route.monthToDatePassengerTiles = Math.max(0, Number(route.monthToDatePassengerTiles) || 0)
        + alighting * chargeableDistanceTiles;
    }
  }

  const waitingPool = Math.max(0, Math.floor(Number(stop.waitingPassengers) || 0));
  const boardable = Math.max(0, vehicleClass.capacity - vehicle.passengersAboard);
  const boarding = Math.min(waitingPool, boardable);
  if (boarding > 0) {
    vehicle.passengersAboard += boarding;
    setTransportStopWaitingCount(stop, waitingPool - boarding);
  }
}

// §7/§12 daily commuter reset. Each station begins the day with its catchment-
// based commuter pool; yesterday's unserved riders do not stack into an
// unrealistic crowd. Boarding is exclusively performed by
// advanceTransportVehiclesByGameDays when a vehicle reaches a stop, so
// multiple vehicles during the same day naturally share one queue.
function simulateTransportVehiclesDaily() {
  if (!isTransportExpansionActive() || isTransportSevereWeather()) return;
  const state = getTransportExpansionState();
  for (const stop of state.stops) {
    if (!isTransportStopPresent(stop)) continue;
    const arrivals = Math.round(
      getTransportStopCatchmentUnits(stop).originUnits * TRANSPORT_STOP_DAILY_BOARDING_SHARE,
    );
    setTransportStopWaitingCount(stop, arrivals);
  }
}

function getTransportStopWaitingCount(stopId) {
  if (!isTransportExpansionActive() || isTransportSevereWeather()) return 0;
  const stop = getTransportStopById(stopId);
  return stop ? Math.max(0, Math.floor(Number(stop.waitingPassengers) || 0)) : 0;
}

// Best-known map tile for a vehicle when no on-screen sprite exists (zoomed
// out, §15's culling): the cycle stop its daily simulation last reached, or
// its home depot's anchor tile while parked/servicing. Camera tracking and
// the inspector's position row fall back to this.
function getTransportVehicleApproximateTile(vehicleId) {
  const state = getTransportExpansionState();
  const vehicle = state.vehicles.find((entry) => entry.id === vehicleId);
  if (!vehicle) return null;
  const route = state.routes.find((entry) => entry.id === vehicle.routeId);
  if (route) {
    const runtime = transportRuntime.routeRuntime.get(route.id);
    const position = getTransportVehiclePathPosition(vehicle, route, runtime);
    if (position) return position.path[position.currentIndex];
    const cycleStops = getTransportRouteCycleStops(route);
    if (cycleStops.length > 0) {
      const stop = cycleStops[((vehicle.orderIndex % cycleStops.length) + cycleStops.length) % cycleStops.length];
      if (stop) return { row: stop.row, col: stop.col };
    }
  }
  if (vehicle.depotId) {
    const separator = String(vehicle.depotId).indexOf(':');
    const row = Number(String(vehicle.depotId).slice(0, separator));
    const col = Number(String(vehicle.depotId).slice(separator + 1));
    if (Number.isFinite(row) && Number.isFinite(col)) return { row, col };
  }
  return null;
}

function transportDirectionBetween(current, next) {
  const dr = next.row - current.row;
  const dc = next.col - current.col;
  if (dr === -1 && dc === 0) return 'n';
  if (dr === 0 && dc === 1) return 'e';
  if (dr === 1 && dc === 0) return 's';
  if (dr === 0 && dc === -1) return 'w';
  return '';
}

class TransportMinHeap {
  constructor() { this.items = []; }
  isBefore(left, right) {
    if (left.priority !== right.priority) return left.priority < right.priority;
    // For equal A* scores, advance the node closest to the goal. This avoids
    // flooding a large open road grid with every equally short partial path.
    return (left.remaining ?? Infinity) < (right.remaining ?? Infinity);
  }
  push(value) {
    this.items.push(value);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.isBefore(value, this.items[parent])) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = value;
  }
  pop() {
    if (this.items.length === 0) return null;
    const root = this.items[0];
    const tail = this.items.pop();
    if (this.items.length === 0) return root;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.items.length) break;
      const smaller = right < this.items.length && this.isBefore(this.items[right], this.items[left])
        ? right : left;
      if (!this.isBefore(this.items[smaller], tail)) break;
      this.items[index] = this.items[smaller];
      index = smaller;
    }
    this.items[index] = tail;
    return root;
  }
}

// A* over (tile, incoming direction). Equal-length paths therefore prefer
// fewer turns without making a longer geometric detour merely to stay straight.
function findTransportPath(start, destination, getNeighbours) {
  if (!start || !destination || typeof getNeighbours !== 'function') return null;
  if (start.row === destination.row && start.col === destination.col) return [{ ...start }];
  const heap = new TransportMinHeap();
  const startKey = `${start.row}:${start.col}:`;
  const costs = new Map([[startKey, 0]]);
  const parents = new Map([[startKey, null]]);
  const nodes = new Map([[startKey, { row: start.row, col: start.col, direction: '' }]]);
  const heuristic = (node) => Math.abs(node.row - destination.row) + Math.abs(node.col - destination.col);
  heap.push({ key: startKey, priority: heuristic(start), remaining: heuristic(start), cost: 0 });
  let goalKey = null;

  while (heap.items.length > 0) {
    const item = heap.pop();
    if (!item || item.cost !== costs.get(item.key)) continue;
    const current = nodes.get(item.key);
    if (current.row === destination.row && current.col === destination.col) {
      goalKey = item.key;
      break;
    }
    const neighbours = Array.from(getNeighbours(current.row, current.col) || [])
      .filter((next) => next && Number.isFinite(next.row) && Number.isFinite(next.col))
      .sort((a, b) => (
        'nesw'.indexOf(transportDirectionBetween(current, a))
        - 'nesw'.indexOf(transportDirectionBetween(current, b))
      ));
    for (const next of neighbours) {
      const direction = transportDirectionBetween(current, next);
      if (!direction) continue;
      const turnCost = current.direction && current.direction !== direction ? TRANSPORT_ROUTE_TURN_COST : 0;
      const nextCost = item.cost + 1 + turnCost;
      const nextKey = `${next.row}:${next.col}:${direction}`;
      if (nextCost >= (costs.get(nextKey) ?? Infinity)) continue;
      const node = { row: next.row, col: next.col, direction };
      costs.set(nextKey, nextCost);
      parents.set(nextKey, item.key);
      nodes.set(nextKey, node);
      const remaining = heuristic(node);
      heap.push({ key: nextKey, cost: nextCost, priority: nextCost + remaining, remaining });
    }
  }
  if (!goalKey) return null;
  const path = [];
  let key = goalKey;
  while (key) {
    const node = nodes.get(key);
    path.push({ row: node.row, col: node.col });
    key = parents.get(key);
  }
  return path.reverse();
}

function buildTransportRoutePathResult(stopIds, getNeighbours = (
  typeof getTrafficRoadNeighbours === 'function' ? getTrafficRoadNeighbours : null
)) {
  const stops = (stopIds || []).map(getTransportStopById).filter(Boolean);
  if (stops.length < 2 || typeof getNeighbours !== 'function') return { path: null, brokenPoint: null };
  const combined = [];
  for (let index = 0; index < stops.length - 1; index++) {
    const segment = findTransportPath(stops[index], stops[index + 1], getNeighbours);
    if (!segment || segment.length < 2) {
      return {
        path: null,
        brokenPoint: { row: stops[index + 1].row, col: stops[index + 1].col },
      };
    }
    combined.push(...(index === 0 ? segment : segment.slice(1)));
  }
  return { path: combined, brokenPoint: null };
}

function buildTransportRoutePath(stopIds, getNeighbours = (
  typeof getTrafficRoadNeighbours === 'function' ? getTrafficRoadNeighbours : null
)) {
  return buildTransportRoutePathResult(stopIds, getNeighbours).path;
}

function createTransportError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// Fleet size is no longer validated here (§13) - a route can exist with zero
// assigned vehicles (broken/idle until the player assigns some from the
// Depot window, §10/§11); capacity is enforced at vehicle purchase time
// instead (buyTransportVehicle).
function validateTransportRouteDraft(draft) {
  if (!isTransportExpansionActive()) throw createTransportError('notActive');
  const stopIds = Array.from(new Set((draft.stopIds || []).map(String)));
  if (stopIds.length < 2) throw createTransportError('needsStops');
  const stops = stopIds.map(getTransportStopById);
  if (stops.some((stop) => !stop)) throw createTransportError('missingStop');
  if (stops.some((stop) => !isTransportStopPresent(stop))) throw createTransportError('missingStop');
  // A stop with only one road-shoulder shelter built is still a valid,
  // one-sided stop - the pathfinder only needs to reach its tile, it never
  // reasons about which curb a shelter sits on. Requiring both sides here
  // used to force the player to pay to add the missing shelter just to use
  // an otherwise-functional stop; that upgrade is now optional (see
  // ensureTransportStopPairs), never mandatory.
  const path = buildTransportRoutePath(stopIds);
  if (!path) throw createTransportError('noPath');
  const connectedDepots = commissionAllConnectedTransportDepots();
  if (connectedDepots.length === 0) throw createTransportError('needsDepot');
  return {
    stopIds,
    fare: normalizeTransportFare(draft.fare ?? TRANSPORT_DEFAULT_FARE),
    pickupPassthroughStops: draft.pickupPassthroughStops === true,
    path,
  };
}

function createTransportRoute(draft = {}) {
  const state = getTransportExpansionState();
  if (state.routes.length >= TRANSPORT_MAX_ROUTES) throw createTransportError('routeLimit');
  const valid = validateTransportRouteDraft(draft);
  const routeIndex = state.nextRouteId++;
  const route = normalizeTransportRoute({
    id: `route-${routeIndex}`,
    name: String(draft.name || '').trim() || getDefaultTransportRouteName(routeIndex),
    color: draft.color,
    stopIds: valid.stopIds,
    fare: valid.fare,
    pickupPassthroughStops: valid.pickupPassthroughStops,
    status: 'active',
    servicePlan: draft.servicePlan,
  }, state.routes.length);
  state.routes.push(route);
  markTransportRouteDirty(route.id);
  updateTransportSimulation();
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return route;
}

function updateTransportRoute(routeId, draft = {}) {
  const state = getTransportExpansionState();
  const route = state.routes.find((entry) => entry.id === routeId);
  if (!route) throw createTransportError('missingRoute');
  const valid = validateTransportRouteDraft({ ...route, ...draft });
  route.name = String(draft.name ?? route.name).trim().slice(0, 60) || route.name;
  route.color = normalizeTransportColor(draft.color ?? route.color, state.routes.indexOf(route));
  route.stopIds = valid.stopIds;
  route.fare = valid.fare;
  route.pickupPassthroughStops = valid.pickupPassthroughStops;
  markTransportRouteDirty(route.id);
  updateTransportSimulation();
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return route;
}

function setTransportRouteSuspended(routeId, suspended) {
  const route = getTransportExpansionState().routes.find((entry) => entry.id === routeId);
  if (!route) return false;
  route.status = suspended ? 'suspended' : 'active';
  markTransportRouteDirty(routeId);
  updateTransportSimulation();
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return true;
}

function deleteTransportRoute(routeId) {
  const state = getTransportExpansionState();
  const index = state.routes.findIndex((entry) => entry.id === routeId);
  if (index < 0) return false;
  state.routes.splice(index, 1);
  // Free up its vehicles rather than leaving them pointed at a route that no
  // longer exists - they head back to being idle, unassigned depot stock.
  for (const vehicle of getTransportRouteVehicles(routeId)) {
    vehicle.routeId = null;
    if (vehicle.status === 'active') vehicle.status = 'delivering_to_depot';
  }
  transportRuntime.routeRuntime.delete(routeId);
  markTransportRouteDirty(routeId);
  updateTransportSimulation();
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return true;
}

function normalizeTransportChangedTiles(changedTiles) {
  const source = Array.isArray(changedTiles) ? changedTiles : [changedTiles];
  return source
    .filter((tile) => tile && Number.isFinite(Number(tile.row)) && Number.isFinite(Number(tile.col)))
    .map((tile) => ({ row: Math.floor(Number(tile.row)), col: Math.floor(Number(tile.col)) }));
}

function transportRuntimeTouchesTiles(runtime, changedTiles) {
  if (!runtime || runtime.status === 'broken') return true;
  const route = getTransportExpansionState().routes.find((entry) => entry.id === runtime.routeId);
  const points = Array.isArray(runtime.path) && runtime.path.length > 0
    ? runtime.path
    : (route?.stopIds || []).map(getTransportStopById).filter(Boolean);
  if (points.length === 0) return true;
  let minRow = Infinity;
  let maxRow = -Infinity;
  let minCol = Infinity;
  let maxCol = -Infinity;
  for (const point of points) {
    minRow = Math.min(minRow, point.row);
    maxRow = Math.max(maxRow, point.row);
    minCol = Math.min(minCol, point.col);
    maxCol = Math.max(maxCol, point.col);
  }
  minRow--;
  maxRow++;
  minCol--;
  maxCol++;
  return changedTiles.some((tile) => (
    tile.row >= minRow && tile.row <= maxRow && tile.col >= minCol && tile.col <= maxCol
  ));
}

function changedTilesTouchTransportDepot(changedTiles) {
  return listTransportDepots().some((depot) => {
    const frontage = getTransportDepotFrontageTiles(depot.id, depot.record);
    return changedTiles.some((tile) => frontage.some(([row, col]) => (
      Math.abs(tile.row - row) + Math.abs(tile.col - col) <= 1
    )));
  });
}

function markTransportNetworkDirty(changedTiles = null) {
  const normalizedTiles = normalizeTransportChangedTiles(changedTiles);
  let affected = false;
  if (normalizedTiles.length === 0 || changedTilesTouchTransportDepot(normalizedTiles)) {
    transportRuntime.dirtyNetwork = true;
    transportRuntime.dirtyRouteIds.clear();
    affected = true;
  } else if (!transportRuntime.dirtyNetwork) {
    for (const runtime of transportRuntime.routeRuntime.values()) {
      if (!transportRuntimeTouchesTiles(runtime, normalizedTiles)) continue;
      transportRuntime.dirtyRouteIds.add(runtime.routeId);
      affected = true;
    }
  }
  transportRuntime.dirtyDemand = true;
  transportRuntime.revision++;
  if (affected && typeof invalidateTransportVisuals === 'function') {
    invalidateTransportVisuals(typeof activeScene === 'undefined' ? null : activeScene, true);
  }
}

function markTransportRouteDirty(routeId) {
  if (routeId) transportRuntime.dirtyRouteIds.add(String(routeId));
  transportRuntime.dirtyDemand = true;
  transportRuntime.revision++;
  if (typeof invalidateTransportVisuals === 'function') {
    invalidateTransportVisuals(typeof activeScene === 'undefined' ? null : activeScene, true);
  }
}

function markTransportStopsDirty(changedTiles = null) {
  transportRuntime.dirtyStops = true;
  markTransportNetworkDirty(changedTiles);
}

function markTransportDemandDirty() {
  transportRuntime.dirtyDemand = true;
  transportRuntime.revision++;
  if (typeof invalidateTransportVisuals === 'function') {
    invalidateTransportVisuals(typeof activeScene === 'undefined' ? null : activeScene);
  }
}

function getTransportDestinationUnits(record) {
  if (!record) return 0;
  if (record.type === 'commercial' || record.type === 'industrial') {
    return typeof getBuildingJobCapacity === 'function' ? getBuildingJobCapacity(record) : 0;
  }
  const fixed = TRANSPORT_DESTINATION_UNITS[record.type];
  if (fixed) return fixed;
  if (typeof SPECIAL_BUILDING_EFFECTS !== 'undefined' && SPECIAL_BUILDING_EFFECTS[record.type]) {
    const area = Math.max(1, (record.footprintCols ?? 1) * (record.footprintRows ?? 1));
    return Math.max(30, area * 20);
  }
  return 0;
}

// §12 real boarding/alighting: origin (boarding demand) and destination
// (alighting draw) catchment units around a single stop. Mirrors the
// per-route building scan in updateTransportSimulation, but for one stop in
// isolation - a building within radius of two nearby stops can count toward
// both (accepted simplification; the per-day claimed-riders tracking in
// simulateTransportVehiclesDaily is what actually prevents double-boarding).
function getTransportStopCatchmentUnits(stop) {
  if (!stop || typeof buildingData === 'undefined') return { originUnits: 0, destinationUnits: 0 };
  let originUnits = 0;
  let destinationUnits = 0;
  for (const [id, record] of Object.entries(buildingData)) {
    if (!record || record.type === 'bus_depot') continue;
    const separator = id.indexOf(':');
    const anchorRow = Number(id.slice(0, separator));
    const anchorCol = Number(id.slice(separator + 1));
    const row = anchorRow + (Math.max(1, Number(record.footprintRows) || 1) - 1) / 2;
    const col = anchorCol + (Math.max(1, Number(record.footprintCols) || 1) - 1) / 2;
    if (Math.abs(stop.row - row) + Math.abs(stop.col - col) > TRANSPORT_STOP_CATCHMENT_RADIUS) continue;
    // §14.4: UH (ultra-rich) residents don't ride the bus at all, not just
    // "don't count toward happiness" - they generate no boarding demand.
    if (record.type === 'residential' && record.wealthTier !== 'UH') {
      originUnits += Math.max(0, Number(record.population) || 0) * 0.18;
    }
    destinationUnits += getTransportDestinationUnits(record);
  }
  return { originUnits, destinationUnits };
}

// §12 movement: a route's stops visited in round-trip cyclic order (forward
// through stopIds, then back through the interior stops) - the same shape
// as ensureTransportRouteRuntime's tile-level roundTripPath, but at stop
// granularity. vehicle.orderIndex indexes into this array.
function getTransportRouteCycleStops(route) {
  const stops = (route?.stopIds || []).map(getTransportStopById).filter(Boolean);
  if (stops.length < 2) return [];
  return [...stops, ...stops.slice(1, -1).reverse()];
}

// Locate every stop-order point on the tile-level round-trip path. Repeated
// interior stops are deliberately found in sequence, first outbound and then
// inbound, so vehicle.orderIndex and the rendered tile always describe the
// same leg.
function getTransportRouteCycleStopPathIndices(route, runtime) {
  const cycleStops = getTransportRouteCycleStops(route);
  const path = runtime?.roundTripPath;
  if (cycleStops.length < 2 || !Array.isArray(path) || path.length < 2) return [];
  const indices = [];
  let searchFrom = 0;
  for (const stop of cycleStops) {
    let found = -1;
    for (let index = searchFrom; index < path.length; index++) {
      if (path[index].row === stop.row && path[index].col === stop.col) {
        found = index;
        break;
      }
    }
    if (found < 0) return [];
    indices.push(found);
    searchFrom = found + 1;
  }
  return indices;
}

function getTransportVehiclePathPosition(vehicle, route = null, runtime = null) {
  if (!vehicle) return null;
  const state = getTransportExpansionState();
  const assignedRoute = route || state.routes.find((entry) => entry.id === vehicle.routeId);
  if (!assignedRoute) return null;
  ensureTransportRouteRuntime();
  const routeRuntime = runtime || transportRuntime.routeRuntime.get(assignedRoute.id);
  const path = routeRuntime?.roundTripPath;
  const stopIndices = getTransportRouteCycleStopPathIndices(assignedRoute, routeRuntime);
  if (!Array.isArray(path) || path.length < 2 || stopIndices.length < 2) return null;
  const orderIndex = ((vehicle.orderIndex % stopIndices.length) + stopIndices.length) % stopIndices.length;
  const startIndex = stopIndices[orderIndex];
  const nextIndex = stopIndices[(orderIndex + 1) % stopIndices.length];
  const segmentTiles = Math.max(
    1,
    nextIndex > startIndex ? nextIndex - startIndex : path.length - startIndex + nextIndex,
  );
  const distance = transportClamp(vehicle.progress, 0, 1) * segmentTiles;
  const positionAlongPath = (startIndex + distance) % path.length;
  const currentIndex = Math.floor(positionAlongPath) % path.length;
  return {
    path,
    currentIndex,
    progress: positionAlongPath - Math.floor(positionAlongPath),
    orderIndex,
    segmentTiles,
  };
}

// Continuous, authoritative movement measured in calendar days. game-clock.js
// calls this for each fraction of a day before firing the next daily arrival
// tick, which keeps queue growth and vehicle arrivals correctly ordered even
// at fast-forward speeds.
// §3 restore: scans forward from the vehicle's current position (in tiles,
// within the *current* stop-to-stop segment) for the nearest other present
// bus stop that isn't already one of the route's designated stops. Only
// consulted when the route opts in (route.pickupPassthroughStops) - most
// routes never pay this scan.
function findTransportOpportunisticStopWithinSegment(route, runtime, startIndex, segmentTiles, fromTiles) {
  const path = runtime.roundTripPath;
  const len = path.length;
  if (!Array.isArray(path) || len === 0) return null;
  const stopIdSet = new Set(route.stopIds);
  const firstStep = Math.max(1, Math.floor(fromTiles) + 1);
  for (let steps = firstStep; steps < segmentTiles; steps++) {
    const tile = path[(startIndex + steps) % len];
    const stop = getTransportStopAt(tile.row, tile.col, { presentOnly: true });
    if (stop && !stopIdSet.has(stop.id)) return { stop, tilesFromStart: steps };
  }
  return null;
}

function advanceTransportVehiclesByGameDays(gameDays) {
  const elapsedDays = Math.max(0, Number(gameDays) || 0);
  if (elapsedDays <= 0 || !isTransportExpansionActive() || isTransportSevereWeather()) return;
  ensureTransportRouteRuntime();
  const state = getTransportExpansionState();
  for (const vehicle of state.vehicles) {
    if (vehicle.status !== 'active') continue;
    const route = state.routes.find((entry) => entry.id === vehicle.routeId);
    const runtime = route ? transportRuntime.routeRuntime.get(route.id) : null;
    if (!route || !runtime || runtime.status !== 'active') continue;
    const cycleStops = getTransportRouteCycleStops(route);
    const stopIndices = getTransportRouteCycleStopPathIndices(route, runtime);
    if (cycleStops.length < 2 || stopIndices.length !== cycleStops.length) continue;

    vehicle.orderIndex = ((vehicle.orderIndex % cycleStops.length) + cycleStops.length) % cycleStops.length;
    vehicle.progress = transportClamp(vehicle.progress, 0, 1);
    const vehicleClass = getTransportVehicleClass(vehicle.classId);
    let distanceRemaining = elapsedDays
      * TRANSPORT_VEHICLE_TILES_PER_GAME_DAY
      * vehicleClass.speedFactor;
    let travelled = 0;
    let transitions = 0;
    while (distanceRemaining > 0.000001 && transitions < 1000) {
      const startIndex = stopIndices[vehicle.orderIndex];
      const nextOrderIndex = (vehicle.orderIndex + 1) % cycleStops.length;
      const nextIndex = stopIndices[nextOrderIndex];
      const segmentTiles = Math.max(
        1,
        nextIndex > startIndex
          ? nextIndex - startIndex
          : runtime.roundTripPath.length - startIndex + nextIndex,
      );
      const positionTiles = vehicle.progress * segmentTiles;
      let targetTiles = segmentTiles;
      let opportunisticStop = null;
      if (route.pickupPassthroughStops) {
        const found = findTransportOpportunisticStopWithinSegment(
          route, runtime, startIndex, segmentTiles, positionTiles,
        );
        if (found) {
          targetTiles = found.tilesFromStart;
          opportunisticStop = found.stop;
        }
      }
      const tilesToTarget = Math.max(0, targetTiles - positionTiles);
      if (tilesToTarget <= 0.000001) {
        if (opportunisticStop) {
          dwellTransportVehicleAtStop(vehicle, route, opportunisticStop);
        } else {
          vehicle.progress = 0;
          vehicle.orderIndex = nextOrderIndex;
          dwellTransportVehicleAtStop(vehicle, route, cycleStops[vehicle.orderIndex]);
        }
        transitions++;
        continue;
      }
      const step = Math.min(distanceRemaining, tilesToTarget);
      vehicle.passengerDistanceTiles = Math.max(
        0,
        Number(vehicle.passengerDistanceTiles) || 0,
      ) + vehicle.passengersAboard * step;
      vehicle.progress += step / segmentTiles;
      travelled += step;
      distanceRemaining -= step;
      if (step < tilesToTarget - 0.000001) break;
      if (opportunisticStop) {
        dwellTransportVehicleAtStop(vehicle, route, opportunisticStop);
      } else {
        vehicle.progress = 0;
        vehicle.orderIndex = nextOrderIndex;
        dwellTransportVehicleAtStop(vehicle, route, cycleStops[vehicle.orderIndex]);
      }
      transitions++;
    }
    vehicle.odometerTiles = Math.max(0, Number(vehicle.odometerTiles) || 0) + travelled;
    vehicle.tilesThisMonth = Math.max(0, Number(vehicle.tilesThisMonth) || 0) + travelled;
  }
}

function getTransportQueueRevision() {
  return transportRuntime.queueRevision;
}

function getTransportFareDemandFactor(fare) {
  return transportClamp(1 - 0.12 * (normalizeTransportFare(fare) - TRANSPORT_DEFAULT_FARE), 0.55, 1.18);
}

function getTransportFrequencyFactor(headwayMinutes) {
  return transportClamp(20 / Math.max(1, Number(headwayMinutes) || 1), 0.35, 1);
}

// §13: kept as the demand-ceiling estimator (route editor's "potential
// ridership" preview) - real per-vehicle trips (§12) will eventually be what
// actually generates revenue, but this formula shape still stands in for
// that until then, now driven by the route's vehicleClassId (§9) instead of
// the old flat aggregate constants.
function computeTransportRouteMetrics(options = {}) {
  const potentialPassengers = Math.max(0, Math.round(Number(options.potentialPassengers) || 0));
  const outboundTiles = Math.max(1, Math.round(Number(options.outboundTiles) || 1));
  const stopCount = Math.max(2, Math.round(Number(options.stopCount) || 2));
  const effectiveBuses = Math.max(0, Math.round(Number(options.effectiveBuses) || 0));
  const fare = normalizeTransportFare(options.fare ?? TRANSPORT_DEFAULT_FARE);
  const vehicleClass = getTransportVehicleClass(options.classId);
  const averageTraffic = transportClamp(options.averageTraffic, 0, 1);
  const weatherAvailability = transportClamp(options.weatherAvailability ?? 1, 0, 1);
  const roundTripTiles = outboundTiles * 2;
  const roundTripMinutes = roundTripTiles * TRANSPORT_MINUTES_PER_ROAD_TILE
    + stopCount * 2 * TRANSPORT_MINUTES_PER_STOP;
  const headwayMinutes = effectiveBuses > 0 ? roundTripMinutes / effectiveBuses : 0;
  const frequencyFactor = effectiveBuses > 0 ? getTransportFrequencyFactor(headwayMinutes) : 0;
  const reliability = transportClamp((1 - averageTraffic * 0.35) * weatherAvailability, 0, 1);
  const demandAfterService = potentialPassengers
    * frequencyFactor
    * getTransportFareDemandFactor(fare)
    * reliability;
  const capacity = effectiveBuses * vehicleClass.monthlyRidershipCap;
  const monthlyPassengers = Math.max(0, Math.round(Math.min(demandAfterService, capacity)));
  // Two-stop services charge the full end-to-end distance. On routes with
  // intermediate stops, half the outbound path is a stable planning estimate;
  // live revenue always uses each vehicle's measured passenger distance.
  const averageFareDistanceTiles = stopCount <= 2
    ? outboundTiles
    : Math.max(1, outboundTiles / 2);
  const quality = potentialPassengers > 0
    ? transportClamp(monthlyPassengers / potentialPassengers, 0, 1)
    : 0;
  const loadFactor = capacity > 0 ? transportClamp(monthlyPassengers / capacity, 0, 2) : 0;
  const revenue = transportRoundMoney(calculateTransportFareRevenue(
    monthlyPassengers, fare, averageFareDistanceTiles,
  ));
  const cost = transportRoundMoney(
    effectiveBuses
    * (vehicleClass.monthlyUpkeep + vehicleClass.tileRunningCost * TRANSPORT_ESTIMATED_TILES_PER_MONTH)
    * weatherAvailability,
  );
  return {
    potentialPassengers,
    monthlyPassengers,
    loadFactor,
    reliability,
    headwayMinutes,
    waitMinutes: headwayMinutes / 2,
    roundTripMinutes,
    averageFareDistanceTiles,
    revenue,
    cost,
    net: revenue - cost,
    quality,
    effectiveBuses,
  };
}

function isTransportSevereWeather() {
  const stage = typeof city === 'undefined' ? 'none' : city.weather?.typhoonStage;
  return ['signal8', 'signal9', 'signal10'].includes(stage);
}

function recordTransportDailyAvailability() {
  const state = getTransportExpansionState();
  if (!isTransportExpansionActive()) return;
  const key = `${city.year}:${city.month}:${city.day}`;
  if (state.lastWeatherDayKey === key) return;
  state.lastWeatherDayKey = key;
  if (isTransportSevereWeather()) {
    state.weatherSuspendedDaysThisMonth = Math.min(30, state.weatherSuspendedDaysThisMonth + 1);
  }
}

function getTransportRouteRuntime(routeId) {
  return transportRuntime.routeRuntime.get(routeId) ?? null;
}

function ensureTransportRouteRuntime() {
  if (transportRuntime.dirtyStops) syncTransportStops();
  if (!transportRuntime.dirtyNetwork && transportRuntime.dirtyRouteIds.size === 0) return;
  const state = getTransportExpansionState();
  const connectedDepots = getConnectedCommissionedTransportDepots();
  const previousRuntime = transportRuntime.routeRuntime;
  const nextRuntime = new Map();

  for (const route of state.routes) {
    const previous = previousRuntime.get(route.id);
    const rebuildPath = transportRuntime.dirtyNetwork
      || transportRuntime.dirtyRouteIds.has(route.id)
      || !previous;
    let status = route.status === 'suspended' ? 'suspended' : 'active';
    let brokenReason = '';
    let brokenPoint = null;
    const stops = route.stopIds.map(getTransportStopById);
    if (stops.length < 2 || stops.some((stop) => !stop || !isTransportStopPresent(stop))) {
      status = 'broken';
      brokenReason = 'missingStop';
      const missing = stops.find((stop) => !stop || !isTransportStopPresent(stop));
      if (missing) brokenPoint = { row: missing.row, col: missing.col };
    }
    let path = null;
    if (status === 'active') {
      if (rebuildPath) {
        const result = buildTransportRoutePathResult(route.stopIds);
        path = result.path;
        brokenPoint = result.brokenPoint;
      } else {
        path = previous.path;
        brokenPoint = previous.brokenPoint ?? null;
      }
      if (!path) {
        status = 'broken';
        brokenReason = 'noPath';
      }
    }
    if (status === 'active' && connectedDepots.length === 0) {
      status = 'broken';
      brokenReason = 'needsDepot';
    }
    const effectiveBuses = status === 'active' ? getTransportRouteEffectiveVehicleCount(route.id) : 0;
    if (status === 'active' && effectiveBuses <= 0) {
      status = 'broken';
      brokenReason = 'fleetCapacity';
    }
    nextRuntime.set(route.id, {
      routeId: route.id,
      status,
      brokenReason,
      brokenPoint,
      path,
      roundTripPath: path && path.length >= 2
        ? [...path, ...path.slice(1, -1).reverse()]
        : null,
      effectiveBuses,
      coveredBuildingIds: rebuildPath ? [] : Array.from(previous?.coveredBuildingIds || []),
      stats: normalizeTransportStats(route.lastStats),
    });
  }
  transportRuntime.routeRuntime = nextRuntime;
  transportRuntime.dirtyNetwork = false;
  transportRuntime.dirtyRouteIds.clear();
}

function updateTransportSimulation() {
  updateTransportUnlockState();
  transportRuntime.buildingModeShare.clear();
  transportRuntime.landValueBonus.clear();
  transportRuntime.happinessBonus = 0;
  transportRuntime.commercialDemandBonus = 0;
  transportRuntime.industrialDemandBonus = 0;
  transportRuntime.summary = createEmptyTransportSummary();
  if (!isTransportExpansionActive()) {
    transportRuntime.routeRuntime.clear();
    transportRuntime.dirtyDemand = false;
    return transportRuntime.summary;
  }

  seedLegacyTransportWaitingQueues();

  ensureTransportRouteRuntime();
  const state = getTransportExpansionState();
  const weatherAvailability = transportClamp(1 - state.weatherSuspendedDaysThisMonth / 30, 0, 1);
  const currentlySuspendedForWeather = isTransportSevereWeather();
  const residentialBenefits = new Map();
  const commercialBenefits = new Map();
  const industrialBenefits = new Map();
  let reliabilityTotal = 0;
  let qualityTotal = 0;
  let activeRoutes = 0;
  let monthlyPassengers = 0;

  for (const route of state.routes) {
    const runtime = transportRuntime.routeRuntime.get(route.id);
    if (!runtime || runtime.status !== 'active' || !runtime.path) {
      route.lastStats = normalizeTransportStats({ effectiveBuses: runtime?.effectiveBuses ?? 0 });
      if (runtime) runtime.stats = route.lastStats;
      continue;
    }
    const stops = route.stopIds.map(getTransportStopById).filter(Boolean);
    const assignments = [];
    let originUnits = 0;
    let destinationUnits = 0;
    if (typeof buildingData !== 'undefined') {
      for (const [id, record] of Object.entries(buildingData)) {
        if (!record || record.type === 'bus_depot') continue;
        const separator = id.indexOf(':');
        const anchorRow = Number(id.slice(0, separator));
        const anchorCol = Number(id.slice(separator + 1));
        const row = anchorRow + (Math.max(1, Number(record.footprintRows) || 1) - 1) / 2;
        const col = anchorCol + (Math.max(1, Number(record.footprintCols) || 1) - 1) / 2;
        let nearestStop = null;
        let nearestDistance = Infinity;
        for (const stop of stops) {
          const distance = Math.abs(stop.row - row) + Math.abs(stop.col - col);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestStop = stop;
          }
        }
        if (!nearestStop || nearestDistance > TRANSPORT_STOP_CATCHMENT_RADIUS) continue;
        const origin = record.type === 'residential'
          ? Math.max(0, Number(record.population) || 0) * 0.18
          : 0;
        const destination = getTransportDestinationUnits(record);
        if (origin <= 0 && destination <= 0) continue;
        originUnits += origin;
        destinationUnits += destination;
        assignments.push({ id, row, col, record, origin, destination });
      }
    }

    const potentialPassengers = Math.max(0, Math.round(Math.min(originUnits, destinationUnits)));
    let averageTraffic = 0;
    if (typeof trafficMap !== 'undefined' && runtime.path.length > 0) {
      averageTraffic = runtime.path.reduce((sum, tile) => (
        sum + Math.max(0, Number(trafficMap[tile.row]?.[tile.col]) || 0)
      ), 0) / runtime.path.length;
    }
    // §12/§14.1: route.lastStats is now real accrued data from per-vehicle
    // arrivals (advanceTransportVehiclesByGameDays), not the aggregate
    // formula - the same numbers driving traffic relief/happiness/demand
    // now reflect actual usage, not an estimate. potentialPassengers/
    // capacity are prorated to "so far this month" so quality/loadFactor
    // stay meaningful mid-month instead of reading as near-zero on day 1.
    // computeTransportRouteMetrics remains available separately as the
    // route editor's "potential ridership" ceiling preview (§13).
    const vehicleClass = getTransportVehicleClass(route.vehicleClassId);
    const dayFraction = transportClamp((typeof city === 'undefined' ? 30 : Math.max(1, city.day)) / 30, 1 / 30, 1);
    const potentialSoFar = potentialPassengers * dayFraction;
    const capacitySoFar = runtime.effectiveBuses * vehicleClass.monthlyRidershipCap * dayFraction;
    const servedPassengers = route.monthToDatePassengers;
    const averageFareDistanceTiles = servedPassengers > 0
      ? (Math.max(0, Number(route.monthToDatePassengerTiles) || 0) / servedPassengers)
      : 0;
    const reliability = transportClamp((1 - averageTraffic * 0.35) * weatherAvailability, 0, 1);
    const quality = potentialSoFar > 0 ? transportClamp(servedPassengers / potentialSoFar, 0, 1) : 0;
    const loadFactor = capacitySoFar > 0 ? transportClamp(servedPassengers / capacitySoFar, 0, 2) : 0;
    const revenue = route.monthToDateRevenue;
    const cost = getTransportRouteAccruedCost(route, dayFraction);
    // Headway/wait are pure route-geometry figures (unaffected by real vs.
    // estimated ridership) - still worth showing in the route card.
    const roundTripMinutes = (runtime.path.length - 1) * 2 * TRANSPORT_MINUTES_PER_ROAD_TILE
      + stops.length * 2 * TRANSPORT_MINUTES_PER_STOP;
    const headwayMinutes = runtime.effectiveBuses > 0 ? roundTripMinutes / runtime.effectiveBuses : 0;
    const stats = normalizeTransportStats({
      potentialPassengers,
      monthlyPassengers: servedPassengers,
      loadFactor,
      reliability,
      headwayMinutes,
      waitMinutes: headwayMinutes / 2,
      roundTripMinutes,
      averageFareDistanceTiles,
      revenue,
      cost,
      net: revenue - cost,
      quality,
      effectiveBuses: runtime.effectiveBuses,
    });
    const benefitQuality = quality * transportClamp(loadFactor / 0.35, 0, 1);
    route.lastStats = stats;
    runtime.stats = stats;
    runtime.coveredBuildingIds = assignments.map((entry) => entry.id);
    runtime.currentlySuspendedForWeather = currentlySuspendedForWeather;
    activeRoutes++;
    monthlyPassengers += servedPassengers;
    reliabilityTotal += reliability;
    qualityTotal += benefitQuality;

    if (!currentlySuspendedForWeather && benefitQuality > 0) {
      for (const assignment of assignments) {
        if (assignment.record.type === 'residential' || assignment.record.type === 'commercial'
          || assignment.record.type === 'industrial') {
          const share = Math.min(
            TRANSPORT_TRAFFIC_RELIEF_MAX,
            benefitQuality * TRANSPORT_TRAFFIC_RELIEF_MAX,
          );
          transportRuntime.buildingModeShare.set(
            assignment.id,
            Math.max(transportRuntime.buildingModeShare.get(assignment.id) || 0, share),
          );
        }
        // §14.4: UH (ultra-rich) residents never contribute to the transit
        // happiness bonus, however well-served their building is - they
        // don't ride the bus. L/M/H residents do.
        if (assignment.origin > 0 && assignment.record.type === 'residential'
          && assignment.record.wealthTier !== 'UH') {
          residentialBenefits.set(
            assignment.id,
            Math.max(residentialBenefits.get(assignment.id) || 0, benefitQuality),
          );
        }
        if (assignment.record.type === 'commercial') {
          commercialBenefits.set(
            assignment.id,
            Math.max(commercialBenefits.get(assignment.id) || 0, benefitQuality),
          );
        }
        // §14.3: industrial demand boost - only counts an industrial
        // building whose nearest stop is served by an active route (this
        // loop already only runs for active routes' assignments).
        if (assignment.record.type === 'industrial') {
          industrialBenefits.set(
            assignment.id,
            Math.max(industrialBenefits.get(assignment.id) || 0, benefitQuality),
          );
        }
      }
      for (const stop of stops) {
        for (let dr = -TRANSPORT_STOP_CATCHMENT_RADIUS; dr <= TRANSPORT_STOP_CATCHMENT_RADIUS; dr++) {
          for (let dc = -TRANSPORT_STOP_CATCHMENT_RADIUS; dc <= TRANSPORT_STOP_CATCHMENT_RADIUS; dc++) {
            const distance = Math.abs(dr) + Math.abs(dc);
            if (distance > TRANSPORT_STOP_CATCHMENT_RADIUS) continue;
            const row = stop.row + dr;
            const col = stop.col + dc;
            if (typeof isInsideMap === 'function' && !isInsideMap(row, col)) continue;
            const bonus = benefitQuality * TRANSPORT_LAND_VALUE_BONUS_MAX
              * (1 - distance / (TRANSPORT_STOP_CATCHMENT_RADIUS + 1));
            const key = getTransportStopKey(row, col);
            transportRuntime.landValueBonus.set(
              key,
              Math.max(transportRuntime.landValueBonus.get(key) || 0, bonus),
            );
          }
        }
      }
    }
  }

  let coveredResidentialPopulation = 0;
  for (const [id, quality] of residentialBenefits) {
    coveredResidentialPopulation += Math.max(0, Number(buildingData[id]?.population) || 0) * quality;
  }
  const residentialCoverage = typeof city === 'undefined' || city.population <= 0
    ? 0
    : transportClamp(coveredResidentialPopulation / city.population, 0, 1);
  const averageQuality = activeRoutes > 0 ? qualityTotal / activeRoutes : 0;
  transportRuntime.happinessBonus = Math.min(
    TRANSPORT_HAPPINESS_BONUS_MAX,
    residentialCoverage * averageQuality * TRANSPORT_HAPPINESS_BONUS_MAX,
  );
  const commercialCount = Math.max(1, Number(typeof city === 'undefined' ? 1 : city.commercialCount) || 1);
  const commercialCoverage = transportClamp(commercialBenefits.size / commercialCount, 0, 1);
  transportRuntime.commercialDemandBonus = Math.min(
    TRANSPORT_COMMERCIAL_DEMAND_BONUS_MAX,
    commercialCoverage * averageQuality * TRANSPORT_COMMERCIAL_DEMAND_BONUS_MAX,
  );
  const industrialCount = Math.max(1, Number(typeof city === 'undefined' ? 1 : city.industrialCount) || 1);
  const industrialCoverage = transportClamp(industrialBenefits.size / industrialCount, 0, 1);
  transportRuntime.industrialDemandBonus = Math.min(
    TRANSPORT_INDUSTRIAL_DEMAND_BONUS_MAX,
    industrialCoverage * averageQuality * TRANSPORT_INDUSTRIAL_DEMAND_BONUS_MAX,
  );
  const connectedDepots = getConnectedCommissionedTransportDepots().length;
  transportRuntime.summary = {
    activeRoutes,
    totalRoutes: state.routes.length,
    monthlyPassengers,
    averageReliability: activeRoutes > 0 ? reliabilityTotal / activeRoutes : 0,
    residentialCoverage,
    serviceQuality: averageQuality,
    connectedDepots,
    fleetCapacity: connectedDepots * TRANSPORT_DEPOT_CAPACITY,
    fleetAllocated: Array.from(transportRuntime.routeRuntime.values())
      .reduce((sum, runtime) => sum + runtime.effectiveBuses, 0),
  };
  transportRuntime.dirtyDemand = false;
  return transportRuntime.summary;
}

function settleTransportMonth() {
  const state = getTransportExpansionState();
  const monthIndex = typeof city === 'undefined' ? 0 : city.year * 12 + city.month - 1;
  if (state.lastSettledMonthIndex === monthIndex) return state.lastFinancials;
  state.lastSettledMonthIndex = monthIndex;
  if (!isTransportExpansionActive()) {
    state.lastFinancials = createEmptyTransportFinancials();
    state.weatherSuspendedDaysThisMonth = 0;
    return state.lastFinancials;
  }
  updateTransportSimulation();
  // §12: revenue was already credited to company.cash in real time as each
  // rider alighted (dwellTransportVehicleAtStop) - this pass only *reports*
  // the month's real totals and debits the month's real running costs
  // (which do stay batched to month-end, per spec). Final cost uses
  // dayFraction 1 (full month), independent of route.lastStats' live
  // mid-month-prorated figure, since city.day may have already rolled over
  // to the new month by the time this runs.
  let revenue = 0;
  let routeOperations = 0;
  for (const route of state.routes) {
    const runtime = transportRuntime.routeRuntime.get(route.id);
    const routeCost = getTransportRouteAccruedCost(route, 1);
    if (runtime?.status === 'active') {
      revenue += route.monthToDateRevenue;
      routeOperations += routeCost;
    }
    route.history.push({
      year: city.year,
      month: city.month,
      passengers: route.monthToDatePassengers,
      revenue: transportRoundMoney(route.monthToDateRevenue),
      cost: routeCost,
      net: Math.round(route.monthToDateRevenue - routeCost),
      reliability: route.lastStats.reliability,
    });
    if (route.history.length > TRANSPORT_HISTORY_LIMIT) {
      route.history.splice(0, route.history.length - TRANSPORT_HISTORY_LIMIT);
    }
    route.monthToDatePassengers = 0;
    route.monthToDateRevenue = 0;
    route.monthToDatePassengerTiles = 0;
  }
  for (const vehicle of state.vehicles) {
    vehicle.tilesThisMonth = 0;
    vehicle.ageMonths++;
  }
  const depotUpkeep = getConnectedCommissionedTransportDepots().length * TRANSPORT_DEPOT_MONTHLY_UPKEEP;
  const cost = transportRoundMoney(routeOperations + depotUpkeep);
  const roundedRevenue = transportRoundMoney(revenue);
  // Cost only - revenue already flowed into company.cash above. company.cash
  // is allowed to go negative (bankruptcy signal, §4), unlike every other
  // money field in this module.
  state.company.cash = Math.round(state.company.cash - cost);
  state.lastFinancials = {
    revenue: roundedRevenue,
    routeOperations: transportRoundMoney(routeOperations),
    depotUpkeep: transportRoundMoney(depotUpkeep),
    cost,
    net: roundedRevenue - cost,
  };
  state.financeHistory.push({
    year: city.year,
    month: city.month,
    passengers: state.routes.reduce((sum, route) => (
      sum + (route.history.at(-1)?.passengers || 0)
    ), 0),
    ...state.lastFinancials,
    closingCash: state.company.cash,
  });
  if (state.financeHistory.length > TRANSPORT_HISTORY_LIMIT) {
    state.financeHistory.splice(0, state.financeHistory.length - TRANSPORT_HISTORY_LIMIT);
  }
  // §4 bankruptcy: three consecutive month-ends in the red auto-suspends
  // every route (the grace period), rather than any harder game-over -
  // suspended routes stop accruing running costs, and the player digs out
  // by selling vehicles. The counter restarts once cash is positive again.
  if (state.company.cash < 0) {
    state.monthsInDebt++;
    if (state.monthsInDebt >= TRANSPORT_BANKRUPTCY_GRACE_MONTHS) {
      state.monthsInDebt = 0;
      let suspendedAny = false;
      for (const route of state.routes) {
        if (route.status !== 'suspended') {
          route.status = 'suspended';
          markTransportRouteDirty(route.id);
          suspendedAny = true;
        }
      }
      if (suspendedAny && typeof showToast === 'function') {
        showToast(t('transport.toast.bankruptSuspended'), 'warning');
      }
    }
  } else {
    state.monthsInDebt = 0;
  }
  state.weatherSuspendedDaysThisMonth = 0;
  return state.lastFinancials;
}

function getTransportFinancials() {
  if (!isTransportExpansionActive()) return createEmptyTransportFinancials();
  return { ...createEmptyTransportFinancials(), ...getTransportExpansionState().lastFinancials };
}

function getBuildingTransportModeShare(id) {
  if (!isTransportExpansionActive() || isTransportSevereWeather()) return 0;
  return transportClamp(transportRuntime.buildingModeShare.get(String(id)) || 0, 0, TRANSPORT_TRAFFIC_RELIEF_MAX);
}

function getTransportLandValueBonus(row, col) {
  if (!isTransportExpansionActive() || isTransportSevereWeather()) return 0;
  return transportClamp(
    transportRuntime.landValueBonus.get(getTransportStopKey(row, col)) || 0,
    0,
    TRANSPORT_LAND_VALUE_BONUS_MAX,
  );
}

function getTransportHappinessBonus() {
  return isTransportExpansionActive() && !isTransportSevereWeather()
    ? transportRuntime.happinessBonus
    : 0;
}

function getTransportCommercialDemandBonus() {
  return isTransportExpansionActive() && !isTransportSevereWeather()
    ? transportRuntime.commercialDemandBonus
    : 0;
}

function getTransportIndustrialDemandBonus() {
  return isTransportExpansionActive() && !isTransportSevereWeather()
    ? transportRuntime.industrialDemandBonus
    : 0;
}

function getTransportSummary() {
  return { ...transportRuntime.summary };
}

function getTransportRoutesForVisuals() {
  if (!isTransportExpansionActive() || isTransportSevereWeather()) return [];
  if (getTransportExpansionState().routes.length === 0) return [];
  ensureTransportRouteRuntime();
  return getTransportExpansionState().routes.flatMap((route) => {
    const runtime = transportRuntime.routeRuntime.get(route.id);
    if (!runtime || runtime.status !== 'active' || !runtime.roundTripPath || runtime.effectiveBuses <= 0) return [];
    return [{ route, runtime }];
  });
}

const transportExpansionTestApi = {
  TRANSPORT_EXPANSION_SCHEMA_VERSION,
  TRANSPORT_EXPANSION_UNLOCK_POPULATION,
  TRANSPORT_STARTUP_CAPITAL,
  TRANSPORT_STOP_CATCHMENT_RADIUS,
  TRANSPORT_DEPOT_CAPACITY,
  TRANSPORT_DEPOT_MONTHLY_UPKEEP,
  TRANSPORT_MAX_ROUTES,
  TRANSPORT_VEHICLE_TILES_PER_GAME_DAY,
  TRANSPORT_STOP_DAILY_BOARDING_SHARE,
  TRANSPORT_STOP_WAITING_CAP,
  TRANSPORT_DEFAULT_VEHICLE_CLASS_ID,
  TRANSPORT_VEHICLE_CLASSES,
  TRANSPORT_SERVICE_INTERVAL_DAYS,
  TRANSPORT_SERVICE_DURATION_DAYS,
  TRANSPORT_CONDITION_DECAY_PER_DAY,
  TRANSPORT_BREAKDOWN_CONDITION_THRESHOLD,
  TRANSPORT_BREAKDOWN_DAILY_CHANCE,
  TRANSPORT_BREAKDOWN_DURATION_DAYS,
  TRANSPORT_VEHICLE_RESALE_FACTOR,
  TRANSPORT_BANKRUPTCY_GRACE_MONTHS,
  TRANSPORT_FARE_MIN,
  TRANSPORT_FARE_MAX,
  TRANSPORT_FARE_STEP,
  TRANSPORT_DEFAULT_FARE,
  TRANSPORT_FARE_ECONOMY_SCALE,
  TRANSPORT_ESTIMATED_TILES_PER_MONTH,
  TRANSPORT_TRAFFIC_RELIEF_MAX,
  TRANSPORT_HAPPINESS_BONUS_MAX,
  TRANSPORT_COMMERCIAL_DEMAND_BONUS_MAX,
  TRANSPORT_INDUSTRIAL_DEMAND_BONUS_MAX,
  TRANSPORT_LAND_VALUE_BONUS_MAX,
  createDefaultTransportExpansionState,
  createDefaultTransportCompany,
  normalizeTransportCompany,
  normalizeTransportVehicle,
  migrateTransportRoutesToVehicles,
  TRANSPORT_VEHICLE_STATUSES,
  normalizeTransportExpansionState,
  normalizeTransportFare,
  getTransportFareDemandFactor,
  calculateTransportFareRevenue,
  getTransportRouteFareDistanceCap,
  getTransportFrequencyFactor,
  getTransportVehicleClass,
  listTransportVehicleClasses,
  computeTransportRouteMetrics,
  findTransportPath,
  getTransportDepotFrontageTiles,
  createEmptyTransportFinancials,
  normalizeTransportFinanceHistory,
  spendTransportConstruction,
  settleTransportMonth,
  getTransportFinancials,
  buyTransportVehicle,
  sellTransportVehicle,
  sendTransportVehicleToDepot,
  assignTransportVehicleToRoute,
  advanceTransportVehiclesDaily,
  getTransportDepotVehicleCount,
  getTransportRouteVehicles,
  getTransportRouteEffectiveVehicleCount,
  getTransportFleetCapacity,
  getTransportRequestedFleet,
  getTransportIndustrialDemandBonus,
  simulateTransportVehiclesDaily,
  advanceTransportVehiclesByGameDays,
  dwellTransportVehicleAtStop,
  getTransportStopCatchmentUnits,
  getTransportRouteCycleStops,
  getTransportRouteCycleStopPathIndices,
  getTransportVehiclePathPosition,
  getTransportRouteAccruedCost,
  getTransportStopWaitingCount,
  getTransportQueueRevision,
  getTransportVehicleApproximateTile,
  getTransportStopDisplayName,
  getTransportStopAutoName,
  renameTransportStop,
};

if (typeof module !== 'undefined' && module.exports) module.exports = transportExpansionTestApi;
