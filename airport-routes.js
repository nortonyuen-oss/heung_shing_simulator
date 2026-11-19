// 航班 (docs/campaign-p4-design.md §4.3, §12): the airport's international routes. From its panel the
// player opens routes to a dozen cities and sets their daily flights; each route fills its seats as
// far as its demand goes (the city's people and visitors, the tourism appeal, the distance), and
// the airport earns a fee a passenger and pays for every daily flight. A share of the arrivals are
// visitors. Flights at night (23:00-06:00) trouble the homes under the airport's noise; a curfew
// stops them, and the night's seats with them.
//
// Saved: city.airportRoutes ({ routes: { id: daily }, curfew }) and city.airportHistory (the months
// settled, 12 at most). The aircraft on screen follow the timetable's size: a gate in use for every
// AIRPORT_TUNING.flightsPerGate daily flights, none at night under a curfew (aircraft-visuals.js).
const AIRPORT_TUNING = Object.freeze({
  maxDaily: 6,                         // daily flights a route can have
  seats: Object.freeze({ short: 180, long: 300 }),
  daysPerMonth: 30,
  demandPerResident: 0.06,             // passengers a month (both ways) a resident brings to a route of weight 1
  demandPerVisitor: 0.5,               // and a visitor to the city
  distanceKm: 6000,                    // demand falls as 1 / (1 + km / this)
  maxLoad: 0.92,
  feePerPassenger: 0.12,               // $ the airport's charges a passenger
  dailyFlightCost: Object.freeze({ short: 250, long: 500 }), // $ a month for each daily flight (slots, handling)
  curfewSeats: 17 / 24,                // the seats left when nothing flies 23:00-06:00
  curfewStart: 23 * 60,
  curfewEnd: 6 * 60,
  visitorShare: 0.2,                   // of the passengers, visitors to the city
  visitorSpend: 0.3,                   // $ tourism takings a visitor by air
  flightsPerGate: 3,
  gates: 6,
  nightPenaltyMax: 0.04,               // happiness, all homes under the noise and a busy night
  busyNightFlights: 20,                // daily flights at which the night is at its worst
  historyMonths: 12,
  // an airport from before the routes keeps flying: these until the player sets them
  defaultRoutes: Object.freeze({ taipei: 2, bangkok: 1, tokyo: 1 }),
});

function airportT(zhHant, en, ja) { return Object.freeze({ zhHant, en, ja }); }

// 〔暫定〕 The cities, by great-circle distance from Hong Kong; weight is how much people travel there.
const AIRPORT_DESTINATIONS = Object.freeze([
  { id: 'taipei', name: airportT('台北', 'Taipei', '台北'), km: 810, weight: 1.2, haul: 'short' },
  { id: 'manila', name: airportT('馬尼拉', 'Manila', 'マニラ'), km: 1120, weight: 0.9, haul: 'short' },
  { id: 'bangkok', name: airportT('曼谷', 'Bangkok', 'バンコク'), km: 1720, weight: 1.1, haul: 'short' },
  { id: 'seoul', name: airportT('首爾', 'Seoul', 'ソウル'), km: 2060, weight: 0.9, haul: 'short' },
  { id: 'osaka', name: airportT('大阪', 'Osaka', '大阪'), km: 2480, weight: 1.0, haul: 'short' },
  { id: 'singapore', name: airportT('新加坡', 'Singapore', 'シンガポール'), km: 2590, weight: 1.0, haul: 'short' },
  { id: 'tokyo', name: airportT('東京', 'Tokyo', '東京'), km: 2890, weight: 1.2, haul: 'short' },
  { id: 'dubai', name: airportT('杜拜', 'Dubai', 'ドバイ'), km: 5950, weight: 0.7, haul: 'long' },
  { id: 'sydney', name: airportT('悉尼', 'Sydney', 'シドニー'), km: 7380, weight: 0.7, haul: 'long' },
  { id: 'london', name: airportT('倫敦', 'London', 'ロンドン'), km: 9630, weight: 0.9, haul: 'long' },
  { id: 'vancouver', name: airportT('溫哥華', 'Vancouver', 'バンクーバー'), km: 10270, weight: 0.8, haul: 'long' },
].map((d) => Object.freeze(d)));
const AIRPORT_DESTINATIONS_BY_ID = Object.freeze(Object.fromEntries(AIRPORT_DESTINATIONS.map((d) => [d.id, d])));

function airportClamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function airportUiT(key, fallback, vars = {}) {
  const fill = (text) => String(text).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  if (typeof t !== 'function') return fill(fallback);
  const out = t(key, vars);
  return out && out !== key ? out : fill(fallback);
}

// ── Pure ───────────────────────────────────────────────────────────────────────────────────────────

function normalizeAirportRoutes(raw) {
  const routes = {};
  Object.entries(raw?.routes && typeof raw.routes === 'object' ? raw.routes : {}).forEach(([id, daily]) => {
    if (!AIRPORT_DESTINATIONS_BY_ID[id]) return;
    const n = Math.max(0, Math.min(AIRPORT_TUNING.maxDaily, Math.floor(Number(daily) || 0)));
    if (n > 0) routes[id] = n;
  });
  return { routes, curfew: raw?.curfew === true };
}

// Passengers a month (both ways) a route would carry with seats enough. inputs: { population,
// visitors (the city's own, before the airport's), appeal (0-100) }.
function getAirportRouteDemand(destination, inputs, tuning = AIRPORT_TUNING) {
  if (!destination) return 0;
  const base = num0(inputs?.population) * tuning.demandPerResident + num0(inputs?.visitors) * tuning.demandPerVisitor;
  const appeal = 0.5 + airportClamp(num0(inputs?.appeal) / 100);
  return Math.round(base * destination.weight * appeal / (1 + destination.km / tuning.distanceKm));
}

function num0(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The airport's month: per route { id, daily, seats, demand, passengers, load, fees, cost } and the
 * totals { routesFlying (with passengers), dailyFlights, passengers, fees, cost, visitors, tourism,
 * nightFlights }. state: normalizeAirportRoutes(); without an airport nothing flies.
 */
function computeAirportState(state, inputs, hasAirport = true, tuning = AIRPORT_TUNING) {
  const routes = [];
  const total = { routesFlying: 0, dailyFlights: 0, passengers: 0, fees: 0, cost: 0, visitors: 0, tourism: 0, nightFlights: 0 };
  if (hasAirport) {
    Object.entries(state?.routes || {}).forEach(([id, daily]) => {
      const destination = AIRPORT_DESTINATIONS_BY_ID[id];
      if (!destination || !(daily > 0)) return;
      const seatsPerFlight = tuning.seats[destination.haul];
      const seats = Math.round(daily * 2 * tuning.daysPerMonth * seatsPerFlight * (state.curfew ? tuning.curfewSeats : 1));
      const demand = getAirportRouteDemand(destination, inputs, tuning);
      const passengers = Math.round(Math.min(demand, seats * tuning.maxLoad));
      const fees = Math.round(passengers * tuning.feePerPassenger);
      const cost = daily * tuning.dailyFlightCost[destination.haul];
      routes.push({ id, daily, seats, demand, passengers, load: seats > 0 ? passengers / seats : 0, fees, cost });
      total.dailyFlights += daily;
      total.passengers += passengers;
      total.fees += fees;
      total.cost += cost;
      if (passengers > 0) total.routesFlying += 1;
    });
  }
  total.visitors = Math.round(total.passengers * tuning.visitorShare);
  total.tourism = Math.round(total.visitors * tuning.visitorSpend);
  // a day's flights spread over the 24 hours: 7 of them at night, unless the curfew stops them
  total.nightFlights = state?.curfew ? 0 : Math.round(total.dailyFlights * 7 / 24 * 10) / 10;
  return { routes, ...total };
}

// The gates in use for a day's flights (the aircraft on screen).
function getAirportGateCapForFlights(dailyFlights, tuning = AIRPORT_TUNING) {
  return Math.max(0, Math.min(tuning.gates, Math.ceil(num0(dailyFlights) / tuning.flightsPerGate)));
}

// Whether sky minute m (0-1439 of the day's 24 hours, 0 = midnight) is inside the curfew.
function isAirportCurfewMinute(minute, tuning = AIRPORT_TUNING) {
  const m = ((Math.floor(num0(minute)) % 1440) + 1440) % 1440;
  return m >= tuning.curfewStart || m < tuning.curfewEnd;
}

// How unhappy the night flights make the city: the share of its people under the noise, by how
// busy the night is.
function getAirportNightPenalty(noiseShare, nightFlights, tuning = AIRPORT_TUNING) {
  if (!(nightFlights > 0)) return 0;
  return airportClamp(noiseShare) * airportClamp(nightFlights / (tuning.busyNightFlights * 7 / 24)) * tuning.nightPenaltyMax;
}

function normalizeAirportHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-AIRPORT_TUNING.historyMonths).map((entry) => ({
    monthIndex: Math.floor(num0(entry?.monthIndex)),
    routes: Math.max(0, Math.round(num0(entry?.routes))),
    dailyFlights: Math.max(0, Math.round(num0(entry?.dailyFlights))),
    passengers: Math.max(0, Math.round(num0(entry?.passengers))),
    fees: Math.max(0, Math.round(num0(entry?.fees))),
    cost: Math.max(0, Math.round(num0(entry?.cost))),
    curfew: entry?.curfew === true,
  }));
}

// ── In the game ────────────────────────────────────────────────────────────────────────────────────

function getAirportLot() {
  if (typeof buildingData === 'undefined' || !buildingData) return null;
  for (const [id, record] of Object.entries(buildingData)) {
    if (record?.type !== 'airport') continue;
    const [row, col] = id.split(':').map(Number);
    return { id, row, col, rows: record.footprintRows || 12, cols: record.footprintCols || 12 };
  }
  return null;
}

// The routes the city has set; an airport that has none yet (built before them) gets the defaults.
function getAirportRoutes() {
  if (typeof city === 'undefined') return normalizeAirportRoutes(null);
  if (!city.airportRoutes || typeof city.airportRoutes !== 'object') {
    city.airportRoutes = getAirportLot() ? { routes: { ...AIRPORT_TUNING.defaultRoutes }, curfew: false } : { routes: {}, curfew: false };
  }
  const normalized = normalizeAirportRoutes(city.airportRoutes);
  city.airportRoutes = normalized;
  return normalized;
}

let airportStateCache = null;

function invalidateAirportState() {
  airportStateCache = null;
}

// The residents within the airport's noise (its nuisance radius), and their share of the city.
function getAirportNoiseResidents(lot) {
  if (!lot || typeof buildingData === 'undefined') return 0;
  const radius = typeof SPECIAL_BUILDING_EFFECTS !== 'undefined' ? SPECIAL_BUILDING_EFFECTS.airport?.nuisanceRadius || 20 : 20;
  const gap = (value, from, size) => Math.max(from - value, value - (from + size - 1), 0);
  let residents = 0;
  Object.entries(buildingData).forEach(([id, record]) => {
    if (record?.type !== 'residential') return;
    const [row, col] = id.split(':').map(Number);
    if (Math.max(gap(row, lot.row, lot.rows), gap(col, lot.col, lot.cols)) <= radius) residents += Number(record.population) || 0;
  });
  return residents;
}

function getAirportState() {
  const tick = typeof city === 'undefined' ? 0 : city.tick;
  const count = typeof buildingData === 'undefined' || !buildingData ? 0 : Object.keys(buildingData).length;
  const routes = getAirportRoutes();
  const key = JSON.stringify(routes);
  if (airportStateCache && airportStateCache.tick === tick && airportStateCache.count === count && airportStateCache.key === key) {
    return airportStateCache.state;
  }
  const lot = getAirportLot();
  const inputs = typeof city === 'undefined' ? {} : {
    population: city.population,
    // the city's own visitors, before the cruise ships' and the flights' (no feeding on itself)
    visitors: Number.isFinite(Number(city.baseVisitors)) ? city.baseVisitors : city.monthlyVisitors,
    appeal: city.tourismAppeal,
  };
  const state = computeAirportState(routes, inputs, !!lot);
  state.lot = lot;
  state.curfew = routes.curfew;
  state.noiseResidents = lot ? getAirportNoiseResidents(lot) : 0;
  const population = typeof city === 'undefined' ? 0 : Number(city.population) || 0;
  state.nightPenalty = getAirportNightPenalty(population > 0 ? state.noiseResidents / population : 0, state.nightFlights);
  airportStateCache = { tick, count, key, state };
  return state;
}

function getAirportMonthlyVisitors() { return getAirportState().visitors; }
function getAirportTourismRevenue() { return getAirportState().tourism; }
function getAirportRouteFinancials() { const s = getAirportState(); return { revenue: s.fees, upkeep: s.cost }; }
function getAirportNightHappinessPenalty() { return getAirportState().nightPenalty; }

// For the aircraft (aircraft-visuals.js): the gates in use, and whether the curfew holds now.
function getAirportGateCap() {
  return getAirportGateCapForFlights(getAirportState().dailyFlights);
}

function isAirportCurfewNow() {
  if (!getAirportRoutes().curfew) return false;
  const minute = typeof getGameTimeOfDayMinutes === 'function' ? getGameTimeOfDayMinutes() : 12 * 60;
  return isAirportCurfewMinute(minute);
}

// The player's changes, from the airport's panel.
function setAirportRouteDaily(destinationId, delta) {
  const destination = AIRPORT_DESTINATIONS_BY_ID[destinationId];
  if (!destination || typeof city === 'undefined') return false;
  const routes = getAirportRoutes();
  const next = Math.max(0, Math.min(AIRPORT_TUNING.maxDaily, (routes.routes[destinationId] || 0) + Math.sign(Number(delta) || 0)));
  if (next > 0) routes.routes[destinationId] = next; else delete routes.routes[destinationId];
  city.airportRoutes = routes;
  invalidateAirportState();
  refreshAirportInspect();
  return true;
}

function toggleAirportCurfew() {
  if (typeof city === 'undefined') return false;
  const routes = getAirportRoutes();
  routes.curfew = !routes.curfew;
  city.airportRoutes = routes;
  invalidateAirportState();
  refreshAirportInspect();
  return routes.curfew;
}

function refreshAirportInspect() {
  if (typeof showInspectPanel === 'function' && typeof activeScene !== 'undefined' && activeScene && typeof lastInspectTile !== 'undefined' && lastInspectTile) {
    showInspectPanel(activeScene, lastInspectTile.row, lastInspectTile.col);
  }
}

// The month ends: it is settled into the history.
function recordAirportMonth() {
  if (typeof city === 'undefined') return;
  invalidateAirportState();
  const history = normalizeAirportHistory(city.airportHistory);
  const state = getAirportState();
  if (!state.lot && !history.length) return;
  const monthIndex = (typeof getCityMonthIndex === 'function' ? getCityMonthIndex() : 0) - 1;
  if (history.at(-1)?.monthIndex === monthIndex) return;   // (settled once)
  history.push({ monthIndex, routes: state.routesFlying,
    dailyFlights: state.dailyFlights, passengers: state.passengers, fees: state.fees, cost: state.cost, curfew: state.curfew });
  city.airportHistory = history.slice(-AIRPORT_TUNING.historyMonths);
}

if (typeof onGameClockEvent === 'function') onGameClockEvent('gameclock:month', recordAirportMonth);

// ── The panel ──────────────────────────────────────────────────────────────────────────────────────

function airportSay(text) {
  if (!text || typeof text !== 'object') return String(text || '');
  const lang = typeof getCurrentLanguage === 'function' ? getCurrentLanguage() : (typeof currentLanguage !== 'undefined' ? currentLanguage : 'zhHant');
  return text[lang] || text.zhHant || text.en || '';
}

function buildAirportInspectHtml() {
  const state = getAirportState();
  if (!state.lot) return '';
  const fmt = (v) => Math.round(Number(v) || 0).toLocaleString();
  const byId = Object.fromEntries(state.routes.map((route) => [route.id, route]));
  const routes = getAirportRoutes();
  const rows = AIRPORT_DESTINATIONS.map((destination) => {
    const route = byId[destination.id];
    const daily = routes.routes[destination.id] || 0;
    const detail = route
      ? airportUiT('airport.routeDetail', '{passengers} 人 · 入座 {load}%', { passengers: fmt(route.passengers), load: Math.round(route.load * 100) })
      : airportUiT('airport.routeDemand', '需求 {demand} 人', { demand: fmt(getAirportRouteDemand(destination, { population: city.population, visitors: city.baseVisitors ?? city.monthlyVisitors, appeal: city.tourismAppeal })) });
    return `<div class="insp-row" style="display:flex;align-items:center;gap:4px;margin-top:4px">
      <span style="flex:1;min-width:0;white-space:nowrap">${destination.haul === 'long' ? '🛫' : '✈️'} ${airportSay(destination.name)}</span>
      <button type="button" class="insp-action-btn" style="flex:0 0 24px;width:24px;padding:0;margin:0" onclick="setAirportRouteDaily('${destination.id}', -1)" ${daily ? '' : 'disabled'}>−</button>
      <b style="flex:0 0 1.6em;text-align:center">${daily}</b>
      <button type="button" class="insp-action-btn" style="flex:0 0 24px;width:24px;padding:0;margin:0" onclick="setAirportRouteDaily('${destination.id}', 1)" ${daily < AIRPORT_TUNING.maxDaily ? '' : 'disabled'}>＋</button>
    </div>
    <div class="insp-row insp-muted" style="font-size:11px;padding-left:1.6em">${detail}</div>`;
  }).join('');
  return `<div class="insp-section">
    <div class="insp-row insp-ok">${airportUiT('airport.summary', '{routes} 條航線 · 每日 {flights} 班 · 每月 {passengers} 人', { routes: state.routesFlying, flights: state.dailyFlights, passengers: fmt(state.passengers) })}</div>
    <div class="insp-row insp-muted">${airportUiT('airport.money', '機場費 ${fees} · 航線開支 ${cost} · 旅客 {visitors} 人', { fees: fmt(state.fees), cost: fmt(state.cost), visitors: fmt(state.visitors) })}</div>
    <div class="insp-row insp-muted">${airportUiT('airport.dailyHint', '每條航線每日班次（＋／−）：')}</div>
    ${rows}
    <div class="insp-row ${state.curfew ? 'insp-ok' : (state.nightPenalty > 0.005 ? 'insp-warn' : 'insp-muted')}">${state.curfew
    ? airportUiT('airport.curfewOn', '🌙 夜間宵禁（23:00–06:00 冇航班，座位少三成）')
    : airportUiT('airport.night', '🌙 夜間每日 {night} 班 · 噪音範圍住咗 {residents} 人', { night: state.nightFlights, residents: fmt(state.noiseResidents) })}</div>
    <button class="insp-action-btn" type="button" onclick="toggleAirportCurfew()">${state.curfew ? airportUiT('airport.curfewLift', '取消宵禁') : airportUiT('airport.curfewSet', '實施夜間宵禁')}</button>
  </div>`;
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  AIRPORT_TUNING, AIRPORT_DESTINATIONS, AIRPORT_DESTINATIONS_BY_ID, normalizeAirportRoutes, getAirportRouteDemand,
  computeAirportState, getAirportGateCapForFlights, isAirportCurfewMinute, getAirportNightPenalty, normalizeAirportHistory,
};
