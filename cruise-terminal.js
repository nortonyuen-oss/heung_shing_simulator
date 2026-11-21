// 郵輪碼頭 (docs/campaign-p4-design.md §4.2, §11): a cruise terminal on the shore, the cruise ships
// that call at it, the passengers they land, and the traffic of a call day.
//
// The ships keep a timetable worked out from the clock, as the ferries and the shelter boats do -
// nothing moving is stored. A sky-day is a month: a terminal gets 2-6 calls a month by the city's
// tourism appeal (fixed for the month as it begins), spread evenly over it, each alongside for
// CRUISE_TUNING.dwellDays calendar days. Each call lands 3,000 passengers. Those who can get into
// town - by the metro, a bus, a tram, the light rail or a ferry within 15 tiles, or by taxi and coach
// on the roads - spend there; the rest spend round the terminal. While a ship is alongside, the roads
// near the terminal carry twice their traffic and the coaches' and taxis'.
//
// What is saved: city.cruiseTerminal ({ monthIndex, calls: { id: n } }, the month's calls) and
// city.cruiseHistory (the months settled, 12 at most).
const CRUISE_TUNING = Object.freeze({
  footprint: 6,                // 〔暫定〕 a 6 x 6 lot on the shore (the terminal itself is 6 x 2.8 of it)
  passengersPerCall: 3000,
  minCalls: 2,                 // 〔暫定〕 calls a month at a terminal, by the tourism appeal
  maxCalls: 6,
  appealForMin: 30,
  appealForMax: 80,
  dwellDays: 2,                // 〔暫定〕 calendar days alongside (a calendar day is ~46 sky minutes)
  speedTilesPerMinute: 1.5,    // sky minutes, in from the map edge and back out
  transitRadius: 15,           // tiles from the lot to a stop or station the passengers use
  modeShares: Object.freeze({ metro: 0.45, bus: 0.25, tram: 0.1, lightRail: 0.1, ferry: 0.1 }),
  maxTransitShare: 0.75,
  roadShare: 0.25,             // by taxi and coach, when a road reaches the terminal
  townSpend: 0.6,              // $ tourism takings a passenger who gets into town
  quaySpend: 0.25,             // $ one who stays round the terminal
  duesPerPassenger: 0.2,       // $ the terminal's passenger dues, on top of its flat revenue
  peakRadius: 8,               // tiles round the lot whose roads a call day loads
  peakMultiplier: 2,           // their traffic on a call day (spec: 加倍)
  coachLoadPerThousand: 6,     // traffic units a road tile near the terminal, per 1,000 by road a call
  roadReach: 2,                // a road within this many tiles of the lot
  shipLengthTiles: 7,          // 〔暫定〕 ~140 m drawn (a real one is twice that, as landmarks are pressed)
  shipBeamTiles: 0.9,           // Norton's cruise ship (2026-11-21) is 8 : 1, length to beam
  berthGapTiles: 0.15,
  historyMonths: 12,
});

// The four facings by where the sea lies on screen (scripts/source-art/cruiseTerminal/fit.py), from
// Norton's two views: the sea view (berth to the lower left) and its mirror; the land view (berth
// behind, to the upper right - the entrance, coaches and taxis in front) and its mirror.
const CRUISE_TERMINAL_FACING_KEYS = Object.freeze({
  e: 'cruise_terminal_6x6', s: 'cruise_terminal_6x6_m', w: 'cruise_terminal_6x6_back', n: 'cruise_terminal_6x6_back_m',
});
const CRUISE_DIRS = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });
const CRUISE_OPPOSITE = Object.freeze({ n: 's', s: 'n', e: 'w', w: 'e' });

function cruiseClamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function cruiseT(key, fallback, vars = {}) {
  const fill = (text) => String(text).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  if (typeof t !== 'function') return fill(fallback);
  const out = t(key, vars);
  return out && out !== key ? out : fill(fallback);
}

// ── Pure ───────────────────────────────────────────────────────────────────────────────────────────

// A terminal's calls in a month by the city's tourism appeal (0-100).
function getCruiseCallsForAppeal(appeal, tuning = CRUISE_TUNING) {
  const k = cruiseClamp((Number(appeal) - tuning.appealForMin) / (tuning.appealForMax - tuning.appealForMin));
  return Math.round(tuning.minCalls + k * (tuning.maxCalls - tuning.minCalls));
}

// The share of the passengers who leave by public transport, from the modes within reach
// ({ metro, bus, tram, lightRail, ferry }: true where one is).
function getCruiseTransitShare(modes, tuning = CRUISE_TUNING) {
  const sum = Object.entries(tuning.modeShares).reduce((acc, [mode, share]) => acc + (modes?.[mode] ? share : 0), 0);
  return Math.min(tuning.maxTransitShare, sum);
}

/**
 * A terminal's month: { calls, passengers, transitShare, roadShare, intoTown, townSpend, quaySpend,
 * dues }. terminal: { modes, roadAccess }. Without a road nobody gets anywhere (no calls either: a
 * ship does not call where its passengers cannot leave the quay).
 */
function computeCruiseTerminalMonth(terminal, calls, tuning = CRUISE_TUNING) {
  const n = terminal?.roadAccess ? Math.max(0, Math.floor(Number(calls) || 0)) : 0;
  const passengers = n * tuning.passengersPerCall;
  const transitShare = getCruiseTransitShare(terminal?.modes, tuning);
  const roadShare = Math.min(tuning.roadShare, 1 - transitShare);
  const intoTown = Math.round(passengers * (transitShare + roadShare));
  const quay = passengers - intoTown;
  return {
    calls: n,
    passengers,
    transitShare: n ? transitShare : 0,
    roadShare: n ? roadShare : 0,
    intoTown,
    townSpend: Math.round(intoTown * tuning.townSpend),
    quaySpend: Math.round(quay * tuning.quaySpend),
    dues: Math.round(passengers * tuning.duesPerPassenger),
  };
}

// The month's totals over its terminals ([computeCruiseTerminalMonth]), the transit share weighted
// by passengers.
function sumCruiseMonths(months) {
  const total = { calls: 0, passengers: 0, intoTown: 0, transitPassengers: 0, tourism: 0, dues: 0 };
  months.forEach((m) => {
    total.calls += m.calls;
    total.passengers += m.passengers;
    total.intoTown += m.intoTown;
    total.transitPassengers += m.passengers * m.transitShare;
    total.tourism += m.townSpend + m.quaySpend;
    total.dues += m.dues;
  });
  total.transitShare = total.passengers ? total.transitPassengers / total.passengers : 0;
  total.transitPassengers = Math.round(total.transitPassengers);
  return total;
}

/**
 * The month's calls at a terminal as [{ arrive, depart }] in sky minutes from the month's start
 * (06:00 on the 1st), spread evenly; `offset` (0-1 of a slot) staggers a second terminal's.
 */
function getCruiseSchedule(calls, dwellMinutes, offset = 0, monthMinutes = 24 * 60) {
  const n = Math.max(0, Math.floor(Number(calls) || 0));
  if (!n) return [];
  const slot = monthMinutes / n;
  return Array.from({ length: n }, (_, i) => {
    const middle = (i + 0.5 + offset) * slot;
    return { arrive: middle - dwellMinutes / 2, depart: middle + dwellMinutes / 2 };
  });
}

// Where a terminal's ship is at sky minute t of the month: { state: 'in'|'alongside'|'out', d }
// (d the minutes into the run in or out), or null at sea. inMinutes/outMinutes are the runs.
function getCruiseShipPhase(t, schedule, inMinutes, outMinutes) {
  for (const call of schedule) {
    if (t >= call.arrive - inMinutes && t < call.arrive) return { state: 'in', d: t - (call.arrive - inMinutes), call };
    if (t >= call.arrive && t < call.depart) return { state: 'alongside', d: t - call.arrive, call };
    if (t >= call.depart && t < call.depart + outMinutes) return { state: 'out', d: t - call.depart, call };
  }
  return null;
}

// How busy the roads round the terminal are on a call day, 0-1: each road's load (traffic units,
// before the road's cap) doubled, with the coaches and taxis of a call spread over them.
function computeCruisePeakTraffic(loads, roadPassengersPerCall, cap, tuning = CRUISE_TUNING) {
  if (!loads.length) return 0;
  const coach = roadPassengersPerCall / 1000 * tuning.coachLoadPerThousand;
  const sum = loads.reduce((acc, load) => acc + cruiseClamp((load * tuning.peakMultiplier + coach) / cap), 0);
  return sum / loads.length;
}

function normalizeCruiseHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-CRUISE_TUNING.historyMonths).map((entry) => ({
    monthIndex: Math.floor(Number(entry?.monthIndex) || 0),
    calls: Math.max(0, Math.round(Number(entry?.calls) || 0)),
    passengers: Math.max(0, Math.round(Number(entry?.passengers) || 0)),
    intoTown: Math.max(0, Math.round(Number(entry?.intoTown) || 0)),
    transitShare: cruiseClamp(entry?.transitShare),
    peakTraffic: cruiseClamp(entry?.peakTraffic),
    tourism: Math.max(0, Math.round(Number(entry?.tourism) || 0)),
    dues: Math.max(0, Math.round(Number(entry?.dues) || 0)),
  }));
}

// The art by where the sea lies on screen.
function getCruiseTerminalFacingKey(screenSide) {
  return CRUISE_TERMINAL_FACING_KEYS[screenSide] || CRUISE_TERMINAL_FACING_KEYS.e;
}

// ── In the game ────────────────────────────────────────────────────────────────────────────────────

function isCruiseTerminalRecord(record) {
  return record?.type === 'cruise_terminal';
}

// Why a terminal may not stand at (row, col), as a sentence for the player; null when it may: a whole
// side of its lot on the sea (as a container port's), the rest clear, flat land.
function whyNotCruiseTerminal(row, col) {
  const size = CRUISE_TUNING.footprint;
  const coast = typeof analyzeHarborCoast === 'function' ? analyzeHarborCoast(row, col, size, size) : null;
  if (!coast) return cruiseT('cruise.place.coast', '郵輪碼頭要起喺海邊：地盤一整邊要貼海。');
  const ok = getFootprintTiles(row, col, size, size).every(([r, c]) => (
    isInsideMap(r, c)
    && (typeof isHarborFootprintSurfaceAllowed === 'function' ? isHarborFootprintSurfaceAllowed(r, c, row, col, coast.side) : canPlaceBuilding(r, c))
    && mapData[r][c] !== ROAD
    && !(typeof isBridgeTile === 'function' && isBridgeTile(r, c))
    && !activeScene?.buildingSprites?.has(getTileId(r, c))
    && !buildingData[getTileId(r, c)]
    && !(typeof hasDistrictSignAt === 'function' && hasDistrictSignAt(r, c))
  ));
  return ok ? null : cruiseT('cruise.place.blocked', '呢度唔夠位：郵輪碼頭要 6×6 格平地。');
}

function getCruiseTerminalCoastSide(row, col, record) {
  if (['n', 'e', 's', 'w'].includes(record?.cruiseCoastSide)) return record.cruiseCoastSide;
  const size = record?.footprintCols || CRUISE_TUNING.footprint;
  return (typeof analyzeHarborCoast === 'function' ? analyzeHarborCoast(row, col, size, size)?.side : null) || 'e';
}

function collectCruiseTerminals() {
  const out = [];
  if (typeof buildingData === 'undefined' || !buildingData) return out;
  Object.entries(buildingData).forEach(([id, record]) => {
    if (!isCruiseTerminalRecord(record)) return;
    const [row, col] = id.split(':').map(Number);
    out.push({
      id, row, col, rows: record.footprintRows || CRUISE_TUNING.footprint, cols: record.footprintCols || CRUISE_TUNING.footprint,
      coastSide: getCruiseTerminalCoastSide(row, col, record), record,
    });
  });
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// How far a tile is from a lot (0 on it), counting the larger of the row and column gaps.
function cruiseLotGap(lot, row, col) {
  const gap = (value, from, size) => Math.max(from - value, value - (from + size - 1), 0);
  return Math.max(gap(row, lot.row, lot.rows), gap(col, lot.col, lot.cols));
}

function cruiseHasRoadAccess(lot) {
  const reach = CRUISE_TUNING.roadReach;
  const road = (r, c) => (typeof isRoadTile === 'function' ? isRoadTile(r, c) : mapData?.[r]?.[c] === ROAD);
  for (let r = lot.row - reach; r < lot.row + lot.rows + reach; r++) {
    for (let c = lot.col - reach; c < lot.col + lot.cols + reach; c++) {
      if (cruiseLotGap(lot, r, c) > 0 && typeof isInsideMap === 'function' && isInsideMap(r, c) && road(r, c)) return true;
    }
  }
  return false;
}

// The public transport within reach of a lot that is carrying anyone: { metro, bus, tram, lightRail, ferry }.
function getCruiseTransitModes(lot) {
  const near = (row, col) => cruiseLotGap(lot, row, col) <= CRUISE_TUNING.transitRadius;
  const riders = (line) => Math.max(0, Number((line?.history || []).at(-1)?.passengers) || 0);
  const modes = { metro: false, bus: false, tram: false, lightRail: false, ferry: false };
  try {
    const state = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
    if (state) {
      const stops = new Map((state.stops || []).map((stop) => [stop.id, stop]));
      modes.bus = (state.routes || []).some((route) => route.status !== 'suspended' && riders(route) > 0
        && (route.stopIds || []).some((id) => { const stop = stops.get(id); return stop && !stop.offMap && near(stop.row, stop.col); }));
    }
    const metro = typeof getMetroState === 'function' ? getMetroState() : null;
    if (metro && typeof getMetroLineStations === 'function') {
      modes.metro = (metro.lines || []).some((line) => line.status === 'active' && riders(line) > 0
        && getMetroLineStations(line, metro).some((st) => near(st.row, st.col)));
    }
    if (state?.tram && typeof getTramLineStops === 'function') {
      modes.tram = (state.tram.lines || []).some((line) => line.status !== 'suspended' && riders(line) > 0
        && getTramLineStops(line, state.tram).some((st) => near(st.row, st.col)));
    }
    if (state?.lightRail && typeof getLightRailLineStations === 'function') {
      modes.lightRail = (state.lightRail.lines || []).some((line) => line.status !== 'suspended' && riders(line) > 0
        && getLightRailLineStations(line, state.lightRail).some((st) => near(st.row, st.col)));
    }
    const ferry = typeof getFerryState === 'function' ? getFerryState() : null;
    if (ferry) {
      const piers = new Map((ferry.piers || []).map((pier) => [pier.id, pier]));
      modes.ferry = (ferry.routes || []).some((route) => route.status === 'active' && riders(route) > 0
        && (route.pierIds || []).some((id) => { const pier = piers.get(id); return pier && near(pier.row, pier.col); }));
    }
  } catch { /* a network not open */ }
  return modes;
}

function getCruiseMonthIndex() {
  return typeof getCityMonthIndex === 'function' ? getCityMonthIndex() : 0;
}

// The month's calls at each terminal, fixed as the month begins (a terminal built since takes its
// calls when first asked).
function getCruiseMonthCalls(terminals) {
  if (typeof city === 'undefined') return {};
  const monthIndex = getCruiseMonthIndex();
  if (!city.cruiseTerminal || city.cruiseTerminal.monthIndex !== monthIndex || typeof city.cruiseTerminal.calls !== 'object') {
    city.cruiseTerminal = { monthIndex, calls: {} };
  }
  const calls = city.cruiseTerminal.calls;
  terminals.forEach((terminal) => {
    if (!Number.isFinite(calls[terminal.id])) calls[terminal.id] = getCruiseCallsForAppeal(city.tourismAppeal ?? 40);
  });
  return calls;
}

let cruiseStateCache = null;

function invalidateCruiseState() {
  cruiseStateCache = null;
}

// Every terminal's month and the totals - from the city each pulse.
function getCruiseState() {
  const tick = typeof city === 'undefined' ? 0 : city.tick;
  const roads = typeof roadTileCount === 'number' ? roadTileCount : 0;
  const count = typeof buildingData === 'undefined' || !buildingData ? 0 : Object.keys(buildingData).length;
  const monthIndex = getCruiseMonthIndex();
  if (cruiseStateCache && cruiseStateCache.tick === tick && cruiseStateCache.roads === roads
    && cruiseStateCache.count === count && cruiseStateCache.monthIndex === monthIndex) return cruiseStateCache.state;
  const terminals = collectCruiseTerminals();
  const calls = getCruiseMonthCalls(terminals);
  const months = terminals.map((terminal) => {
    terminal.roadAccess = cruiseHasRoadAccess(terminal);
    terminal.modes = getCruiseTransitModes(terminal);
    terminal.month = computeCruiseTerminalMonth(terminal, calls[terminal.id]);
    return terminal.month;
  });
  const state = { terminals, ...sumCruiseMonths(months) };
  cruiseStateCache = { tick, roads, count, monthIndex, state };
  return state;
}

// Visitors and takings this month (council-effects.js updateCityAttractivenessMetrics).
function getCruiseMonthlyVisitors() {
  return getCruiseState().passengers;
}

function getCruiseTourismRevenue() {
  return getCruiseState().tourism;
}

// The terminals' passenger dues (city-state.js computeLandmarkFinancials).
function getCruiseMonthlyDues() {
  return getCruiseState().dues;
}

// The peak worked out at the last traffic update: how busy the roads near the terminals are on a
// call day, 0-1, by passengers.
let cruisePeakTraffic = 0;

function getCruisePeakTraffic() {
  return cruisePeakTraffic;
}

function getCruiseShipRuns(terminal) {
  const legs = getCruiseShipLegs(terminal);
  const speed = CRUISE_TUNING.speedTilesPerMinute;
  return legs ? { legs, inMinutes: legs.total / speed, outMinutes: legs.total / speed } : { legs: null, inMinutes: 30, outMinutes: 30 };
}

function getCruiseDwellMinutes() {
  const days = typeof getDaysInMonth === 'function' && typeof city !== 'undefined' ? getDaysInMonth(city.month, city.year) : 30;
  return CRUISE_TUNING.dwellDays * (24 * 60) / days;
}

function getCruiseTerminalSchedule(terminal, index) {
  const calls = getCruiseState().terminals.find((t) => t.id === terminal.id)?.month?.calls ?? 0;
  // a second terminal's calls half a slot after the first's
  return getCruiseSchedule(calls, getCruiseDwellMinutes(), index % 2 ? 0.5 : 0);
}

function getCruiseSkyMinute() {
  const env = typeof getEnvironmentMinutes === 'function' ? getEnvironmentMinutes() : 0;
  return ((env % 1440) + 1440) % 1440;
}

// The terminals with a ship alongside right now.
function getCruiseTerminalsAlongside() {
  const t = getCruiseSkyMinute();
  return getCruiseState().terminals.filter((terminal, index) => {
    const phase = getCruiseShipPhase(t, getCruiseTerminalSchedule(terminal, index), 0, 0);
    return phase?.state === 'alongside';
  });
}

/**
 * Called from updateTrafficMap before each road's load is set against its cap: works out the call-day
 * peak by the terminals, and - while a ship is alongside - doubles the load of the roads near it and
 * adds its coaches and taxis.
 */
function applyCruiseTerminalTrafficPeak(trafficMap, roadTiles, cap) {
  const state = getCruiseState();
  cruisePeakTraffic = 0;
  if (!state.terminals.length || !trafficMap) return;
  const width = typeof MAP_WIDTH === 'number' ? MAP_WIDTH : 256;
  const alongside = new Set(getCruiseTerminalsAlongside().map((terminal) => terminal.id));
  let weighted = 0;
  let weights = 0;
  state.terminals.forEach((terminal) => {
    const month = terminal.month;
    if (!month?.calls) return;
    const roadPerCall = month.passengers / month.calls * month.roadShare;
    const near = [];
    for (const tileIndex of roadTiles) {
      const r = Math.floor(tileIndex / width); const c = tileIndex % width;
      if (cruiseLotGap(terminal, r, c) <= CRUISE_TUNING.peakRadius) near.push([r, c]);
    }
    if (!near.length) return;
    const peak = computeCruisePeakTraffic(near.map(([r, c]) => trafficMap[r][c]), roadPerCall, cap);
    weighted += peak * month.passengers;
    weights += month.passengers;
    if (!alongside.has(terminal.id)) return;
    const coach = roadPerCall / 1000 * CRUISE_TUNING.coachLoadPerThousand;
    near.forEach(([r, c]) => { trafficMap[r][c] = trafficMap[r][c] * CRUISE_TUNING.peakMultiplier + coach; });
  });
  cruisePeakTraffic = weights ? weighted / weights : 0;
}

// The month ends: its calls are settled into the history, and next month's set by the appeal.
function recordCruiseMonth() {
  if (typeof city === 'undefined') return;
  invalidateCruiseState();
  const history = normalizeCruiseHistory(city.cruiseHistory);
  const terminals = collectCruiseTerminals();
  const last = city.cruiseTerminal;
  // (only a month that is over: its index behind the calendar's)
  if (terminals.length && last && typeof last.calls === 'object' && Number(last.monthIndex) < getCruiseMonthIndex()) {
    const months = terminals.map((terminal) => {
      terminal.roadAccess = cruiseHasRoadAccess(terminal);
      terminal.modes = getCruiseTransitModes(terminal);
      return computeCruiseTerminalMonth(terminal, last.calls[terminal.id] ?? 0);
    });
    const total = sumCruiseMonths(months);
    history.push({
      monthIndex: Number(last.monthIndex) || 0, calls: total.calls, passengers: total.passengers, intoTown: total.intoTown,
      transitShare: total.transitShare, peakTraffic: cruisePeakTraffic, tourism: total.tourism, dues: total.dues,
    });
  }
  city.cruiseHistory = history.slice(-CRUISE_TUNING.historyMonths);
  city.cruiseTerminal = null;
  invalidateCruiseState();
}

if (typeof onGameClockEvent === 'function') onGameClockEvent('gameclock:month', recordCruiseMonth);

// The last settled month (the chapters' 上月), or zeros.
function getCruiseLastMonth() {
  const history = normalizeCruiseHistory(typeof city === 'undefined' ? [] : city.cruiseHistory);
  return history.at(-1) || { calls: 0, passengers: 0, intoTown: 0, transitShare: 0, peakTraffic: 0, tourism: 0, dues: 0 };
}

// ── The terminal's art ─────────────────────────────────────────────────────────────────────────────

let cruiseFacingStamp = '';

// Each terminal drawn with its berth to the sea however the map turns (as the container port is).
function refreshCruiseTerminalSprites(scene) {
  if (typeof buildingData === 'undefined') return;
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  collectCruiseTerminals().forEach((terminal) => {
    const { id, record } = terminal;
    record.cruiseCoastSide = terminal.coastSide;
    const screenSide = typeof rotateDirection === 'function' ? rotateDirection(terminal.coastSide, rotation) : terminal.coastSide;
    const key = getCruiseTerminalFacingKey(screenSide);
    if (key === record.spriteKey) return;
    const model = typeof getSpecialBuildingModelBySpriteKey === 'function' ? getSpecialBuildingModelBySpriteKey(key) : null;
    const opts = typeof specialBuildingModelMetadata !== 'undefined' ? specialBuildingModelMetadata[key] : null;
    const sprite = scene?.buildingSprites?.get(id);
    if (!model) return;
    if (sprite && !scene.textures.exists(key)) {
      // The browser fetches building art on demand (Electron loads every facing at boot): fetch
      // this one and turn the terminal once it is in - without this the web's terminal kept the
      // facing it was built with however the map turned (v6.0.0-v6.0.3).
      if (typeof requestZoneModelTexture === 'function' && typeof getFixedBuildingModelLoadPath === 'function') {
        requestZoneModelTexture(scene, { key, path: getFixedBuildingModelLoadPath(model) }, (loaded) => {
          if (loaded) refreshCruiseTerminalSprites(scene);
        }, { sprite });
      }
      return;
    }
    record.spriteKey = key;
    record.assetId = model.path;
    if (opts) {
      Object.assign(record, {
        originX: opts.originX, originY: opts.originY, scale: opts.scale, scaleX: opts.scaleX, scaleY: opts.scaleY,
        offsetX: opts.offsetX, offsetY: opts.offsetY, anchorMode: opts.anchorMode,
      });
    }
    if (!sprite) return;
    sprite.setTexture(key);
    sprite.__dayTextureKey = null;
    sprite.skipNightTint = false;
    if (typeof markBuildingNightArtDirty === 'function') markBuildingNightArtDirty(scene);
    if (opts) {
      sprite.setOrigin(opts.originX ?? 0.5, opts.originY ?? 1);
      if (opts.scaleX || opts.scaleY) sprite.setScale(opts.scaleX ?? opts.scale ?? 1, opts.scaleY ?? opts.scale ?? 1);
      else if (opts.scale) sprite.setScale(opts.scale);
      sprite.spriteOffsetX = opts.offsetX ?? 0;
      sprite.spriteOffsetY = opts.offsetY ?? 0;
      sprite.anchorMode = opts.anchorMode;
    }
    if (typeof positionBuilding === 'function') positionBuilding(scene, sprite);
  });
}

// ── The ships ──────────────────────────────────────────────────────────────────────────────────────

const cruiseLegCache = new Map();

// The berth: alongside the lot's sea side, the hull's middle off the middle of that edge. In tile
// coordinates (a tile's middle at its row and column, as the ferries' and isoToScreen's).
function getCruiseBerth(terminal) {
  const side = terminal.coastSide;
  const [sr, sc] = CRUISE_DIRS[side];
  const out = CRUISE_TUNING.shipBeamTiles / 2 + CRUISE_TUNING.berthGapTiles;
  const midR = terminal.row + terminal.rows / 2;
  const midC = terminal.col + terminal.cols / 2;
  // the edge's middle, then out to sea
  const edgeR = sr ? (sr > 0 ? terminal.row + terminal.rows : terminal.row) : midR;
  const edgeC = sc ? (sc > 0 ? terminal.col + terminal.cols : terminal.col) : midC;
  // lying along the shore, its bow one way along it
  const along = side === 'n' || side === 's' ? 'e' : 's';
  return { r: edgeR + sr * out - 0.5, c: edgeC + sc * out - 0.5, along, sea: side };
}

// A water path from the map edge to a point a ship's length along the shore from the berth, then
// in alongside: { points, lengths, total, berthDir }, or null when the sea does not reach it.
function getCruiseShipLegs(terminal) {
  if (typeof mapData === 'undefined' || !mapData?.length) return null;
  const H = mapData.length; const W = mapData[0].length;
  const key = `${terminal.id}|${terminal.coastSide}`;
  if (cruiseLegCache.has(key)) return cruiseLegCache.get(key);
  const berth = getCruiseBerth(terminal);
  const shelter = typeof getFerryShelterTiles === 'function' ? getFerryShelterTiles() : new Set();
  const passable = (r, c) => r >= 0 && c >= 0 && r < H && c < W
    && (mapData[r][c] === WATER || (typeof isBridgeTile === 'function' && isBridgeTile(r, c)))
    && !shelter.has(`${r}:${c}`);
  const L = CRUISE_TUNING.shipLengthTiles;
  // the run-in: a ship's length along the shore either way, else straight out
  const [ar, ac] = CRUISE_DIRS[berth.along];
  const [sr, sc] = CRUISE_DIRS[berth.sea];
  const candidates = [
    { r: berth.r - ar * L, c: berth.c - ac * L, dir: berth.along },
    { r: berth.r + ar * L, c: berth.c + ac * L, dir: CRUISE_OPPOSITE[berth.along] },
    { r: berth.r + sr * L / 2, c: berth.c + sc * L / 2, dir: CRUISE_OPPOSITE[berth.sea] },
  ];
  let legs = null;
  for (const start of candidates) {
    const tile = [Math.round(start.r), Math.round(start.c)];
    if (!passable(...tile)) continue;
    const goals = [];
    for (let i = 0; i < W; i++) { goals.push([0, i], [H - 1, i]); }
    for (let i = 0; i < H; i++) { goals.push([i, 0], [i, W - 1]); }
    const path = typeof findFerryPath === 'function'
      ? findFerryPath({ startTiles: [tile], leaveDir: CRUISE_OPPOSITE[start.dir] }, { goalTiles: goals }, passable, H, W)
      : null;
    if (!path) continue;
    // from the edge (a tile and a half past it, out of sight) in to the run-in, then alongside
    const sea = path.slice().reverse();
    const [er, ec] = sea[0];
    const edgeSide = er === 0 ? 'n' : er === H - 1 ? 's' : ec === 0 ? 'w' : 'e';
    const [dr, dc] = CRUISE_DIRS[edgeSide];
    const points = [[er + dr * 1.5, ec + dc * 1.5], ...sea.slice(0, -1), [start.r, start.c], [berth.r, berth.c]];
    const lengths = [0];
    for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    legs = { points, lengths, total: lengths.at(-1), berthDir: start.dir, edgeSide };
    break;
  }
  if (cruiseLegCache.size > 16) cruiseLegCache.clear();
  cruiseLegCache.set(key, legs);
  return legs;
}

function cruiseHeading(dr, dc, fallback) {
  if (Math.abs(dr) < 1e-9 && Math.abs(dc) < 1e-9) return fallback;
  return Math.abs(dr) >= Math.abs(dc) ? (dr > 0 ? 's' : 'n') : (dc > 0 ? 'e' : 'w');
}

// The point d tiles along the legs from the map edge, heading the way it goes.
function cruisePointAlong(legs, d) {
  const { points, lengths } = legs;
  const x = Math.max(0, Math.min(legs.total, d));
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < x) i++;
  const seg = lengths[i] - lengths[i - 1] || 1;
  const k = (x - lengths[i - 1]) / seg;
  const [r0, c0] = points[i - 1]; const [r1, c1] = points[i];
  return { r: r0 + (r1 - r0) * k, c: c0 + (c1 - c0) * k, dir: cruiseHeading(r1 - r0, c1 - c0, legs.berthDir) };
}

// Where a terminal's ship is at sky minute t: { r, c, dir, state } or null.
function getCruiseShipPoint(terminal, index, t = getCruiseSkyMinute()) {
  const runs = getCruiseShipRuns(terminal);
  if (!runs.legs) return null;
  const phase = getCruiseShipPhase(t, getCruiseTerminalSchedule(terminal, index), runs.inMinutes, runs.outMinutes);
  if (!phase) return null;
  const speed = CRUISE_TUNING.speedTilesPerMinute;
  if (phase.state === 'alongside') {
    const berth = runs.legs.points.at(-1);
    return { r: berth[0], c: berth[1], dir: runs.legs.berthDir, state: 'alongside' };
  }
  if (phase.state === 'in') return { ...cruisePointAlong(runs.legs, phase.d * speed), state: 'in' };
  // out: the way it came, bow first
  const p = cruisePointAlong(runs.legs, runs.legs.total - phase.d * speed);
  return { ...p, dir: CRUISE_OPPOSITE[p.dir], state: 'out' };
}

// Norton's cruise ship (2026-11-21): two views squared by scripts/source-art/artDebt/fit_cruise_ship.py
// and their mirrors, by where the bow points on screen. Each is placed by its hull's centre on the water
// and scaled to the ship's length, both in the picture's own pixels - the packaged art may be shrunk and
// padded (getModelTexturePixelMapping). It replaces the container ship stretched to a cruise ship's length.
const CRUISE_SHIP_VIEWS = Object.freeze(Object.fromEntries([
  ['se', 908, 510.5, 453.6],
  ['sw', 908, 510.5, 453.6],
  ['ne', 889, 500.0, 456.6],
  ['nw', 889, 500.0, 456.6],
].map(([heading, length, centreX, centreY]) => [heading, Object.freeze({
  key: `cruise_ship_${heading}`, path: `Models/specialSites/cruiseShip/cruiseShip-${heading.toUpperCase()}.png`, length, centreX, centreY,
})])));

function fitCruiseShipSprite(sprite, view) {
  const frame = sprite.frame;
  const mapping = typeof getModelTexturePixelMapping === 'function'
    ? getModelTexturePixelMapping(view.path, frame) : { resize: 1, offsetX: 0, offsetY: 0 };
  sprite.setOrigin((view.centreX * mapping.resize + mapping.offsetX) / frame.width,
    (view.centreY * mapping.resize + mapping.offsetY) / frame.height);
  const tileWidth = typeof TILE_WIDTH === 'number' ? TILE_WIDTH : 100;
  sprite.setScale(CRUISE_TUNING.shipLengthTiles * tileWidth / 2 / (view.length * mapping.resize));
}

function getCruiseShipScreenDir(dir, rotation) {
  const visual = typeof rotateDirection === 'function' ? rotateDirection(dir, rotation) : dir;
  return { n: 'ne', e: 'se', s: 'sw', w: 'nw' }[visual] || 'ne';
}

function updateCruiseShips(scene) {
  if (!scene || typeof buildingData === 'undefined') return;
  // the terminal's art with its berth to the sea: on a load, a turn of the map, a terminal built
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  const terminals = collectCruiseTerminals();
  const stamp = `${rotation}|${terminals.map((terminal) => `${terminal.id}:${terminal.record.spriteKey}`).join(',')}`;
  if (stamp !== cruiseFacingStamp) {
    cruiseFacingStamp = stamp;
    cruiseLegCache.clear();
    refreshCruiseTerminalSprites(scene);
  }
  if (!scene.cruiseShips) scene.cruiseShips = new Map();
  const live = new Set();
  const zoom = scene.cameras?.main?.zoom ?? 1;
  if (terminals.length && zoom >= 0.3) {
    const t = getCruiseSkyMinute();
    terminals.forEach((terminal, index) => {
      const point = getCruiseShipPoint(terminal, index, t);
      if (!point) return;
      const id = `cruise|${terminal.id}`;
      live.add(id);
      const view = CRUISE_SHIP_VIEWS[getCruiseShipScreenDir(point.dir, rotation)];
      if (!scene.textures.exists(view.key)) {
        // fetched on demand, desktop and web alike; the ship comes in on a later frame
        if (typeof requestZoneModelTexture === 'function' && typeof resolveModelAssetPath === 'function') {
          requestZoneModelTexture(scene, { key: view.key, path: resolveModelAssetPath(view.path) });
        }
        return;
      }
      let rec = scene.cruiseShips.get(id);
      if (!rec) {
        const sprite = scene.add.image(0, 0, view.key);
        if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, sprite, 'objectLayer');
        if (scene.worldMask) sprite.setMask(scene.worldMask);
        rec = { sprite, viewKey: '' };
        scene.cruiseShips.set(id, rec);
      }
      if (rec.viewKey !== view.key) {
        if (rec.sprite.texture.key !== view.key) rec.sprite.setTexture(view.key);
        fitCruiseShipSprite(rec.sprite, view);
        rec.viewKey = view.key;
      }
      const at = typeof getVesselWaterSurfacePoint === 'function'
        ? getVesselWaterSurfacePoint(scene, point.r, point.c)
        : { ...isoToScreen(point.c, point.r), depthY: 0 };
      rec.sprite.setPosition(at.x, at.y);
      if (typeof getWorldDepth === 'function') rec.sprite.setDepth(getWorldDepth('object', at.depthY));
      // fading at the map edge it comes and goes by
      const legs = getCruiseShipRuns(terminal).legs;
      const H = mapData.length; const W = mapData[0].length;
      const side = legs?.edgeSide;
      const distance = side ? { n: point.r + 0.5, s: H - 0.5 - point.r, w: point.c + 0.5, e: W - 0.5 - point.c }[side] : 9;
      const alpha = cruiseClamp(distance / 3);
      rec.sprite.setAlpha(alpha);
      rec.sprite.setVisible(alpha > 0.02);
    });
  }
  scene.cruiseShips.forEach((rec, id) => {
    if (!live.has(id)) { rec.sprite?.destroy(); scene.cruiseShips.delete(id); }
  });
}

function clearCruiseShips(scene) {
  scene?.cruiseShips?.forEach((rec) => rec.sprite?.destroy());
  scene?.cruiseShips?.clear();
  cruiseLegCache.clear();
  cruiseFacingStamp = '';
}

// ── The panel ──────────────────────────────────────────────────────────────────────────────────────

function formatCruiseClock(skyMinute) {
  // sky minute 0 is 06:00 on the 1st; a calendar day is the month's share of the sky-day
  const days = typeof getDaysInMonth === 'function' && typeof city !== 'undefined' ? getDaysInMonth(city.month, city.year) : 30;
  const day = Math.min(days, 1 + Math.floor(skyMinute / (1440 / days)));
  return `${typeof city !== 'undefined' ? city.month : 1}/${day}`;
}

function buildCruiseTerminalInspectHtml(id) {
  const state = getCruiseState();
  const index = state.terminals.findIndex((terminal) => terminal.id === id);
  const terminal = state.terminals[index];
  if (!terminal) return '';
  if (!terminal.roadAccess) {
    return `<div class="insp-section"><div class="insp-row insp-warn">${cruiseT('cruise.noRoad', '未有路接到碼頭：郵輪唔會埋岸。')}</div></div>`;
  }
  const month = terminal.month;
  const last = getCruiseLastMonth();
  const pct = (v) => Math.round(cruiseClamp(v) * 100);
  const fmt = (v) => Math.round(Number(v) || 0).toLocaleString();
  const t = getCruiseSkyMinute();
  const schedule = getCruiseTerminalSchedule(terminal, index);
  const now = getCruiseShipPhase(t, schedule, 0, 0);
  const next = schedule.find((call) => call.arrive > t);
  const status = now ? cruiseT('cruise.alongside', '🛳 郵輪泊緊岸')
    : next ? cruiseT('cruise.next', '下一班 {date}', { date: formatCruiseClock(next.arrive) })
      : cruiseT('cruise.none', '今個月冇班次喇');
  const icons = { metro: '🚇', bus: '🚌', tram: '🚋', lightRail: '🚈', ferry: '⛴' };
  const modes = Object.keys(icons).map((mode) => `<span style="opacity:${terminal.modes[mode] ? 1 : 0.3}">${icons[mode]}</span>`).join('');
  const peak = getCruisePeakTraffic();
  return `<div class="insp-section">
    <div class="insp-row ${now ? 'insp-ok' : ''}">${cruiseT('cruise.calls', '今個月 {calls} 班 · {status}', { calls: month.calls, status })}</div>
    <div class="insp-row">${cruiseT('cruise.passengers', '每月旅客 {passengers} 人 · 入到市區 {intoTown}%', { passengers: fmt(month.passengers), intoTown: month.passengers ? pct(month.intoTown / month.passengers) : 0 })}</div>
    <div class="insp-row">${cruiseT('cruise.transit', '{radius} 格內交通 {modes} · 搭公共交通 {share}%', { radius: CRUISE_TUNING.transitRadius, modes, share: pct(month.transitShare) })}</div>
    <div class="insp-row ${peak >= 0.5 ? 'insp-warn' : 'insp-muted'}">${cruiseT('cruise.peak', '泊岸日附近道路擠塞 {value}%', { value: pct(peak) })}</div>
    <div class="insp-row insp-muted">${cruiseT('cruise.takings', '旅遊收入 ${tourism} · 碼頭費 ${dues}', { tourism: fmt(month.townSpend + month.quaySpend), dues: fmt(month.dues) })}</div>
    <div class="insp-row insp-muted">${cruiseT('cruise.lastMonth', '上月：{calls} 班 · {passengers} 人', { calls: last.calls, passengers: fmt(last.passengers) })}</div>
    ${Object.values(terminal.modes).some(Boolean) ? ''
    : `<div class="insp-row insp-muted">${cruiseT('cruise.transitTip', '喺 {radius} 格內開地鐵站或者巴士站，多啲旅客入到市區消費。', { radius: CRUISE_TUNING.transitRadius })}</div>`}
  </div>`;
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  CRUISE_TUNING, CRUISE_TERMINAL_FACING_KEYS, getCruiseCallsForAppeal, getCruiseTransitShare, computeCruiseTerminalMonth,
  sumCruiseMonths, getCruiseSchedule, getCruiseShipPhase, computeCruisePeakTraffic, normalizeCruiseHistory,
  getCruiseTerminalFacingKey,
};
