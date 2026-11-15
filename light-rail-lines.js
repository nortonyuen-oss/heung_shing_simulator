// 輕鐵 phase 2 (docs/light-rail-design.md §3-§4): stations, lines and cars on the light rail's track
// (light-rail.js). A line is drawn station after station, as the tram's; its round trip is found on the
// light rail's whole network - street track, its own track, viaducts and ramps - by the tram's route
// finder (tram-lines.js buildTramLineRoute) on the light rail's geometry (buildLightRailGeometry), each
// point given its height and whether it runs in the road's traffic. A car runs at the traffic's pace
// on the road (queueing with it, as a tram), faster on its own track; two cars may run coupled back to
// back. Stations are Norton's 豐年路 render (light-rail-station-art.js).

const LIGHT_RAIL_SERVICE = Object.freeze({
  stationCost: 2000,
  carPrice: 400,               // an LRV (a second coupled to it: the same again)
  carCapacity: 200,
  carMonthlyUpkeep: 3,
  maxStationsPerLine: 20,
  maxLines: 8,
  maxSetsPerLine: 12,
  // on its own track and the viaducts half as fast again as on the road (stepTram's own pace there)
  reservedSpeed: 1.5,
  // end to end behind the set ahead: on the road as a tram keeps; on its own track further
  streetGapTiles: 0.25,
  reservedGapTiles: 0.6,
  dwellTiles: 2.6,
  // riders and money (docs/light-rail-design.md §5; tuned in 太子 with the city running, 2026-11-15:
  // the station by the busy road there reaches some 1,800 riders a day at a bus stop's share - the same
  // people the buses count - so it takes a third of that; a dense two-station line then pays back in
  // about 22 months, a typical four-station one in about two years)
  fare: 0.02,                  // flat, as the 輕鐵's single fare: a 4-tile bus ride's
  catchmentRadius: 6,          // a tram stop's is 4, a bus stop's 5: its stations are further apart
  boardingShare: 0.35,         // times a bus stop's daily share
  stationMonthlyUpkeep: 4,
  tileRunningCost: 0.0002,
});

const LRT_SET = Object.freeze({
  // a car's length as drawn (light-rail-art.js), and the coupling between a pair's two cars
  carTiles: typeof LIGHT_RAIL_CAR_TILES === 'number' ? LIGHT_RAIL_CAR_TILES : 0.86,
  couplerTiles: 0.03,
});

const LIGHT_RAIL_LINE_COLORS = Object.freeze(['#e8711a', '#c0392b', '#2471a3', '#7d3c98', '#17a589', '#d4ac0d', '#2e8b57', '#a04000']);
const LIGHT_RAIL_LINE_NAMES = Object.freeze(['505綫', '610綫', '614綫', '615綫', '705綫', '751綫', '761P綫', '507綫']);

let lightRailLineDraft = null;
let lightRailNetworkRevision = 0;

function lrtState() {
  return getLightRailState();
}

function lrtSay(key, fallback, vars = {}, kind = 'info') {
  if (typeof showToast === 'function') showToast(lightRailT(key, fallback, vars), kind);
  return kind !== 'warning';
}

function lrtCompanyClosed() {
  if (typeof isTransportExpansionActive !== 'function' || isTransportExpansionActive()) return false;
  return !lrtSay('lightRail.track.company', '要先開辦運輸公司，輕鐵由公司出錢起。', {}, 'warning');
}

function lrtSpend(amount) {
  if (typeof isTransportExpansionActive === 'function' && !isTransportExpansionActive()) return false;
  return typeof spendTransportConstruction === 'function' ? spendTransportConstruction(amount) : false;
}

// ── Stations ────────────────────────────────────────────────────────────────────────────────────────

function getLightRailStationById(id, state = lrtState()) {
  return state.stations.find((st) => st.id === id) || null;
}

// The station whose platforms cover a tile (its own and one each way along its track).
function getLightRailStationAt(row, col, state = lrtState()) {
  return state.stations.find((st) => (st.axis === 'ns'
    ? st.col === col && Math.abs(st.row - row) <= 1
    : st.row === row && Math.abs(st.col - col) <= 1)) || null;
}

function isLightRailStationTile(row, col) {
  if (typeof getTransportExpansionState !== 'function' || !getTransportExpansionState()?.lightRail) return false;
  return Boolean(getLightRailStationAt(row, col));
}

function getLightRailLineStations(line, state = lrtState()) {
  return line.stationIds.map((id) => getLightRailStationById(id, state)).filter(Boolean);
}

function getLightRailLineSets(line, state = lrtState()) {
  return state.cars.filter((v) => v.lineId === line.id);
}

const LIGHT_RAIL_STATION_REFUSALS = Object.freeze({
  noTrack: ['lightRail.station.noTrack', '輕鐵站要起喺輕鐵路軌上面。'],
  notStraight: ['lightRail.station.notStraight', '輕鐵站要三格直嘅雙軌（月台兩格長）：喺直路中間撳。'],
  notGround: ['lightRail.station.notGround', '輕鐵站要起喺空地嘅路軌上（唔可以喺馬路、平交路、高架或者上落橋）。'],
  notFlat: ['lightRail.station.notFlat', '輕鐵站要起喺平地上（唔可以喺山坡）。'],
  taken: ['lightRail.station.taken', '附近已經有輕鐵站。'],
});

function placeLightRailStation(scene, row, col) {
  if (lrtCompanyClosed()) return false;
  const state = lrtState();
  const res = whyNotLightRailStationAt(row, col, state, lightRailMapEnv());
  if (res.code) return lrtSay(...LIGHT_RAIL_STATION_REFUSALS[res.code], {}, 'warning');
  if (!lrtSpend(LIGHT_RAIL_SERVICE.stationCost)) {
    return lrtSay('lightRail.station.funds', '公司資金唔夠起輕鐵站（要 ${cost}）。', { cost: LIGHT_RAIL_SERVICE.stationCost.toLocaleString() }, 'warning');
  }
  const n = state.stations.length + 1;
  const station = { id: `lst-${state.nextId++}`, ...res.site, name: lightRailT('lightRail.station.name', '輕鐵站 {n}', { n }), waitingByLine: {} };
  state.stations.push(station);
  lightRailNetworkRevision += 1;
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return lrtSay('lightRail.station.built', '起咗「{name}」。用「輕鐵路線」工具一個個站撳，開一條輕鐵綫。', { name: station.name }, 'success');
}

// A station taken away: off every line; a line left with fewer than two closes, its cars sold.
function removeLightRailStation(scene, station) {
  const state = lrtState();
  state.stations = state.stations.filter((st) => st !== station);
  state.lines.forEach((line) => { line.stationIds = line.stationIds.filter((id) => id !== station.id); });
  state.lines.filter((l) => l.stationIds.length < 2).forEach((l) => removeLightRailLine(l.id));
  lightRailNetworkRevision += 1;
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
}

function demolishLightRailStationAt(scene, row, col) {
  const station = getLightRailStationAt(row, col);
  if (!station) return false;
  removeLightRailStation(scene, station);
  return true;
}

// ── Lines and cars ──────────────────────────────────────────────────────────────────────────────────

function lrtJoiningPhase(phases) {
  return typeof ferryJoiningPhase === 'function' ? ferryJoiningPhase(phases) : (phases.length ? (phases.at(-1) + 0.5) % 1 : 0);
}

function buyLightRailCar(lineId) {
  const state = lrtState();
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return { ok: false, code: 'line' };
  const fleet = getLightRailLineSets(line, state);
  if (fleet.length >= LIGHT_RAIL_SERVICE.maxSetsPerLine) return { ok: false, code: 'full' };
  if (!lrtSpend(LIGHT_RAIL_SERVICE.carPrice)) return { ok: false, code: 'funds' };
  const plan = getLightRailLineRoute(line, state);
  const L = plan ? plan.route.length : 1;
  const phase = lrtJoiningPhase(fleet.map((v) => (Number(v.dist) || 0) / L).sort((a, b) => a - b));
  const car = {
    id: `lrv-${state.nextId++}`, lineId, dist: phase * L, dwellLeft: 0, aboard: 0, cars: 1,
    callIndex: plan ? tramNextCallIndex(plan.route, phase * L) : 0,
    purchasePrice: LIGHT_RAIL_SERVICE.carPrice, ageMonths: 0, tilesThisMonth: 0,
  };
  state.cars.push(car);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return { ok: true, car };
}

// One more of the line's cars coupled into a pair (bought); all pairs - all single again (the second
// cars sold back at the resale share).
function coupleLightRailCars(lineId) {
  const state = lrtState();
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return { ok: false };
  const fleet = getLightRailLineSets(line, state);
  const single = fleet.find((v) => v.cars !== 2);
  if (single) {
    if (!lrtSpend(LIGHT_RAIL_SERVICE.carPrice)) return { ok: false, code: 'funds' };
    single.cars = 2;
    single.purchasePrice += LIGHT_RAIL_SERVICE.carPrice;
  } else {
    const factor = typeof TRANSPORT_VEHICLE_RESALE_FACTOR === 'number' ? TRANSPORT_VEHICLE_RESALE_FACTOR : 0.5;
    const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
    fleet.forEach((v) => {
      v.cars = 1;
      v.purchasePrice = Math.max(0, v.purchasePrice - LIGHT_RAIL_SERVICE.carPrice);
      if (transport) transport.company.cash = Math.round(transport.company.cash + LIGHT_RAIL_SERVICE.carPrice * factor);
    });
  }
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return { ok: true };
}

function sellLightRailCarNow(state, v) {
  const value = Math.round(v.purchasePrice * (typeof TRANSPORT_VEHICLE_RESALE_FACTOR === 'number' ? TRANSPORT_VEHICLE_RESALE_FACTOR : 0.5));
  state.cars = state.cars.filter((x) => x !== v);
  const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
  if (transport) transport.company.cash = Math.round(transport.company.cash + value);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return value;
}

function sellOneLightRailCar(lineId) {
  const state = lrtState();
  const line = state.lines.find((l) => l.id === lineId);
  const v = line && getLightRailLineSets(line, state).at(-1);
  return v ? sellLightRailCarNow(state, v) : 0;
}

function removeLightRailLine(lineId) {
  const state = lrtState();
  let value = 0;
  state.cars.filter((v) => v.lineId === lineId).forEach((v) => { value += sellLightRailCarNow(state, v); });
  state.lines = state.lines.filter((l) => l.id !== lineId);
  lightRailNetworkRevision += 1;
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return value;
}

function setLightRailLineSuspended(lineId, suspended) {
  const line = lrtState().lines.find((l) => l.id === lineId);
  if (!line) return;
  line.status = suspended ? 'suspended' : 'active';
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
}

// The line tool: a station, then the next (joined along the track), ...; the last again to finish.
function handleLightRailLineClick(scene, row, col) {
  if (lrtCompanyClosed()) return false;
  const station = getLightRailStationAt(row, col);
  if (!station) return lrtSay('lightRail.line.pickStation', '撳一個輕鐵站。', {}, 'warning');
  const state = lrtState();
  const draftLine = lightRailLineDraft?.lineId ? state.lines.find((l) => l.id === lightRailLineDraft.lineId) : null;
  const pending = lightRailLineDraft?.firstStationId && !draftLine ? getLightRailStationById(lightRailLineDraft.firstStationId, state) : null;
  if (!draftLine && !pending) {
    const ending = lightRailLineDraft?.forceNew ? null
      : state.lines.find((l) => l.stationIds[0] === station.id || l.stationIds.at(-1) === station.id);
    if (ending) {
      if (ending.stationIds[0] === station.id) ending.stationIds.reverse();
      lightRailLineDraft = { lineId: ending.id };
      lightRailNetworkRevision += 1;
      return lrtSay('lightRail.line.extend', '延長「{line}」：撳下一個站；再撳「{name}」完成。', { line: ending.name, name: station.name });
    }
    if (state.lines.length >= LIGHT_RAIL_SERVICE.maxLines) { lightRailLineDraft = null; return lrtSay('lightRail.line.max', '輕鐵綫數目已經到上限。', {}, 'warning'); }
    lightRailLineDraft = { firstStationId: station.id };
    return lrtSay('lightRail.line.pickSecond', '由「{name}」開出：撳下一個輕鐵站。', { name: station.name });
  }
  const last = draftLine ? getLightRailStationById(draftLine.stationIds.at(-1), state) : pending;
  if (last.id === station.id) {
    lightRailLineDraft = null;
    if (draftLine) announceLightRailLineOpened(draftLine);
    return lrtSay('lightRail.line.done', '完成。');
  }
  if (draftLine?.stationIds.includes(station.id)) {
    return lrtSay('lightRail.line.again', '「{line}」已經經過「{name}」。', { line: draftLine.name, name: station.name }, 'warning');
  }
  if (draftLine && draftLine.stationIds.length >= LIGHT_RAIL_SERVICE.maxStationsPerLine) {
    lightRailLineDraft = null;
    return lrtSay('lightRail.line.full', '一條輕鐵綫最多 {n} 個站。', { n: LIGHT_RAIL_SERVICE.maxStationsPerLine }, 'warning');
  }
  const stations = draftLine ? [...getLightRailLineStations(draftLine, state), station] : [last, station];
  const route = buildTramLineRoute(getLightRailGeometry(), stations.map(lrtStationStop));
  if (route.code) {
    return lrtSay('lightRail.line.noTrack', '「{from}」同「{to}」之間冇輕鐵路軌連住（或者要掉頭先去到）：先鋪路軌。', { from: last.name, to: station.name }, 'warning');
  }
  if (draftLine) {
    draftLine.stationIds.push(station.id);
    lightRailNetworkRevision += 1;
    if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
    return lrtSay('lightRail.line.extended', '「{line}」延長到「{name}」。撳下一個站，或者再撳「{name}」完成。', { line: draftLine.name, name: station.name }, 'success');
  }
  const index = state.lines.length;
  const line = {
    id: `lline-${state.nextId++}`,
    name: LIGHT_RAIL_LINE_NAMES[index % LIGHT_RAIL_LINE_NAMES.length],
    color: LIGHT_RAIL_LINE_COLORS[index % LIGHT_RAIL_LINE_COLORS.length],
    stationIds: [pending.id, station.id], status: 'active', monthToDatePassengers: 0, monthToDateRevenue: 0, history: [],
  };
  state.lines.push(line);
  lightRailLineDraft = { lineId: line.id };
  lightRailNetworkRevision += 1;
  line.newsPending = true;
  const bought = buyLightRailCar(line.id).ok;
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return bought
    ? lrtSay('lightRail.line.opened', '「{line}」開咗，買咗一架輕鐵。撳下一個站延長，或者再撳「{name}」完成。', { line: line.name, name: station.name }, 'success')
    : lrtSay('lightRail.line.openedNoCar', '「{line}」開咗，但公司資金唔夠買輕鐵（${price}）：喺運輸公司路線表加車。', { line: line.name, price: LIGHT_RAIL_SERVICE.carPrice.toLocaleString() }, 'warning');
}

function cancelLightRailLineDraft() {
  const draftLine = lightRailLineDraft?.lineId ? lrtState().lines.find((l) => l.id === lightRailLineDraft.lineId) : null;
  lightRailLineDraft = null;
  if (draftLine) announceLightRailLineOpened(draftLine);
}

// A new line in 香城討論區, once: when it is drawn to its end (or at the month's turn).
function announceLightRailLineOpened(line, state = lrtState()) {
  if (!line?.newsPending || typeof city === 'undefined') return false;
  if (lightRailLineDraft?.lineId === line.id) return false;
  delete line.newsPending;
  if (typeof addForumPost !== 'function') return false;
  const stations = getLightRailLineStations(line, state);
  if (stations.length < 2) return false;
  const cityName = String(city.name || '').trim() || '香城';
  const headline = `【輕鐵通車】${line.name}今日投入服務　街坊：唔使再等小巴`;
  if (typeof addCityNews === 'function') addCityNews(headline);
  addForumPost({
    headline,
    body: [
      `${cityName}輕鐵「${line.name}」今日通車，由「${stations[0].name}」開往「${stations.at(-1).name}」，沿途 ${stations.length} 個站。`,
      '路面同汽車一齊行、出到專用路軌就加速，上橋落橋一程過；過馬路嗰陣交通燈會轉紅讓輕鐵先過。有街坊話繁忙時間兩卡車都迫爆，運輸公司話會睇乘客量再加班次。',
    ],
    source: 'local',
    social: { likes: 2800, laughs: 260, angry: 40, commentCount: 540, shares: 720 },
  }, { id: `lightRailLineOpen-${line.id}`, category: '城中熱話', author: '運輸公司' });
  return true;
}

// ── Riders and money ────────────────────────────────────────────────────────────────────────────────

function lightRailStationCatchmentPoint(st) {
  return { id: `lrt-${st.id}`, row: st.row, col: st.col, radius: LIGHT_RAIL_SERVICE.catchmentRadius };
}

// Hour by hour each station's riders join its queues, split over the lines calling there (the tram's
// way, tram-lines.js accrueTramStopsForHour).
function accrueLightRailStationsForHour(state, envHour) {
  if (typeof getTransportStopRidersForHour !== 'function') return;
  const dayStart = typeof GAME_DAY_START_MINUTES === 'number' ? GAME_DAY_START_MINUTES : 360;
  const hour = ((envHour + Math.floor(dayStart / 60)) % 24 + 24) % 24;
  const resetHour = typeof TRANSPORT_STOP_POOL_RESET_HOUR === 'number' ? TRANSPORT_STOP_POOL_RESET_HOUR : 4;
  const share = (typeof TRANSPORT_STOP_DAILY_BOARDING_SHARE === 'number' ? TRANSPORT_STOP_DAILY_BOARDING_SHARE : 0.75) * LIGHT_RAIL_SERVICE.boardingShare;
  const active = state.lines.filter((l) => l.status === 'active' && getLightRailLineSets(l, state).length);
  state.stations.forEach((st) => {
    if (hour === resetHour || !st.waitingByLine) st.waitingByLine = {};
    const lines = active.filter((l) => l.stationIds.includes(st.id));
    if (!lines.length) { st.waitingByLine = {}; return; }
    const riders = getTransportStopRidersForHour(lightRailStationCatchmentPoint(st), hour, share);
    lines.forEach((l) => { st.waitingByLine[l.id] = Math.min(9999, (st.waitingByLine[l.id] || 0) + riders / lines.length); });
  });
}

// A set calls at a station: riders off (spread over the stations ahead), the queue for the way it
// leaves on up to its room (a pair takes twice a car's), each paying the flat fare. Pure.
function lightRailCall({ aboard, waiting, arrivingAhead, share, capacity }) {
  const riding = Math.max(0, Math.floor(aboard || 0));
  const alighting = arrivingAhead <= 1 ? riding : Math.round(riding / arrivingAhead);
  const room = capacity - (riding - alighting);
  const boarding = Math.max(0, Math.min(room, Math.floor(Math.max(0, waiting || 0) * Math.max(0, Math.min(1, share)))));
  return { alighting, boarding, revenue: boarding * LIGHT_RAIL_SERVICE.fare };
}

function lightRailCallAt(state, line, v, route, call) {
  const stations = getLightRailLineStations(line, state);
  const n = stations.length;
  const st = stations[call.stop];
  if (!st) return;
  const i = route.calls.indexOf(call);
  const prev = route.calls[(i - 1 + route.calls.length) % route.calls.length];
  const arrivingAhead = prev.leaving > 0 ? n - call.stop : call.stop + 1;
  const leavingAhead = call.leaving > 0 ? n - 1 - call.stop : call.stop;
  const waiting = st.waitingByLine?.[line.id] || 0;
  const r = lightRailCall({ aboard: v.aboard, waiting, arrivingAhead, share: leavingAhead / Math.max(1, n - 1), capacity: LIGHT_RAIL_SERVICE.carCapacity * v.cars });
  v.aboard = v.aboard - r.alighting + r.boarding;
  if (st.waitingByLine) st.waitingByLine[line.id] = Math.max(0, waiting - r.boarding);
  const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
  if (r.revenue > 0 && transport) {
    transport.company.cashFraction = (Number(transport.company.cashFraction) || 0) + r.revenue;
    const whole = Math.floor(transport.company.cashFraction);
    if (whole > 0) { transport.company.cash += whole; transport.company.cashFraction -= whole; }
    line.monthToDateRevenue += r.revenue;
    v.monthToDateRevenue = (v.monthToDateRevenue || 0) + r.revenue;
  }
  line.monthToDatePassengers += r.boarding;
}

// From the transport company's clock (transport-expansion.js advanceTransportClock): the queues.
function advanceLightRailClock(fromMinutes, toMinutes) {
  if (typeof mapData === 'undefined' || !(toMinutes > fromMinutes)) return;
  if (typeof getTransportExpansionState !== 'function' || !getTransportExpansionState()?.lightRail) return;
  const state = lrtState();
  if (!state.lines.length) return;
  for (let h = Math.floor(fromMinutes / 60) + 1; h * 60 <= toMinutes; h++) accrueLightRailStationsForHour(state, h);
}

// The month for the company's books (settleTransportMonth): the fares (credited at each call), the
// riders, and the costs - each car's upkeep and running, the stations' and the track's upkeep.
function settleLightRailMonth(ended = null) {
  const out = { revenue: 0, passengers: 0, cost: 0 };
  if (typeof getTransportExpansionState !== 'function' || !getTransportExpansionState()?.lightRail) return out;
  const state = lrtState();
  state.lines.forEach((line) => announceLightRailLineOpened(line, state));
  state.lines.forEach((line) => {
    const fleet = getLightRailLineSets(line, state);
    const cost = fleet.reduce((sum, v) => sum + LIGHT_RAIL_SERVICE.carMonthlyUpkeep * v.cars + v.tilesThisMonth * LIGHT_RAIL_SERVICE.tileRunningCost * v.cars, 0);
    out.revenue += line.monthToDateRevenue;
    out.passengers += line.monthToDatePassengers;
    out.cost += cost;
    line.history.push({
      year: ended ? ended.year : (typeof city !== 'undefined' ? city.year : 0),
      month: ended ? ended.month : (typeof city !== 'undefined' ? city.month : 0),
      passengers: line.monthToDatePassengers,
      revenue: Math.round(line.monthToDateRevenue * 100) / 100,
      cost: Math.round(cost * 100) / 100, net: Math.round((line.monthToDateRevenue - cost) * 100) / 100,
    });
    if (line.history.length > 24) line.history.splice(0, line.history.length - 24);
    line.monthToDateRevenue = 0;
    line.monthToDatePassengers = 0;
  });
  state.cars.forEach((v) => {
    v.lastMonthRevenue = v.monthToDateRevenue || 0;
    v.monthToDateRevenue = 0;
    v.tilesThisMonth = 0;
    v.ageMonths += 1;
  });
  out.cost += state.stations.length * LIGHT_RAIL_SERVICE.stationMonthlyUpkeep;
  out.cost += typeof getLightRailTrackMonthlyUpkeep === 'function' ? getLightRailTrackMonthlyUpkeep() : 0;
  return out;
}

// ── Routes ──────────────────────────────────────────────────────────────────────────────────────────

function lrtStationStop(st) {
  return { row: st.row, col: st.col, axis: st.axis, band: false };
}

const lrtGeometryCache = { key: null, geo: null };

// (kept while the track - the very object, a load replaces it - and the roads stay as they are)
function lrtNetworkStamp() {
  const tracks = lrtState().tracks;
  if (!lightRailStateIds.has(tracks)) lightRailStateIds.set(tracks, lightRailStateNextId++);
  return `${lightRailStateIds.get(tracks)}|${lightRailTrackRevision}|${typeof roadTileCount !== 'undefined' ? roadTileCount : 0}`;
}

function getLightRailGeometry() {
  const key = lrtNetworkStamp();
  if (lrtGeometryCache.key === key) return lrtGeometryCache.geo;
  const geo = buildLightRailGeometry(lrtState(), lightRailMapEnv());
  lrtGeometryCache.key = key;
  lrtGeometryCache.geo = geo;
  return geo;
}

const lrtRouteCache = new Map();

// A line's round trip, each point given its height and whether it runs in the road's traffic.
function getLightRailLineRoute(line, state = lrtState()) {
  const stations = getLightRailLineStations(line, state);
  if (stations.length < 2) return null;
  const key = `${lightRailNetworkRevision}|${lrtNetworkStamp()}|${line.id}|${line.stationIds.join(',')}`;
  if (!lrtRouteCache.has(key)) {
    if (lrtRouteCache.size > 64) lrtRouteCache.clear();
    const route = buildTramLineRoute(getLightRailGeometry(), stations.map(lrtStationStop));
    if (route.code) lrtRouteCache.set(key, null);
    else {
      const env = lightRailMapEnv();
      route.traffic = route.pts.map(([x, y]) => lightRailInTrafficAt(x, y, state, env));
      lrtRouteCache.set(key, { route, key });
    }
  }
  return lrtRouteCache.get(key);
}

// A round trip as long as it takes, in the sky's minutes at the speed the game runs now: the stretches
// in the road's traffic at the tram's pace, its own track and viaducts half as fast again, and its calls.
function lightRailRoundTripMinutes(route) {
  let traffic = 0, reserved = 0;
  for (let i = 1; i < route.pts.length; i++) {
    const d = route.cum[i] - route.cum[i - 1];
    if (route.traffic[i] && route.traffic[i - 1]) traffic += d; else reserved += d;
  }
  const visual = typeof getVehicleVisualSpeedMultiplier === 'function' ? Math.max(1, getVehicleVisualSpeedMultiplier()) : 1;
  const sky = typeof getDayNightSpeedMultiplier === 'function' ? Math.max(1, getDayNightSpeedMultiplier()) : 1;
  const tilesPerSecond = (typeof TRAFFIC_VISUAL_CONFIG !== 'undefined' ? TRAFFIC_VISUAL_CONFIG.baseSpeedTilesPerSecond : 0.9) * visual;
  const pace = TRAM_SERVICE.speedFactor;
  const seconds = (traffic / pace + reserved / (pace * LIGHT_RAIL_SERVICE.reservedSpeed) + route.calls.length * TRAM_SERVICE.dwellTiles) / tilesPerSecond;
  const skyMinutesPerSecond = 1440 / ((typeof GAME_DAY_NIGHT_CYCLE_REAL_MS === 'number' ? GAME_DAY_NIGHT_CYCLE_REAL_MS : 480000) / 1000) * sky;
  return seconds * skyMinutesPerSecond;
}

// ── The fleet ───────────────────────────────────────────────────────────────────────────────────────

const lrtRouteKeys = new WeakMap();

// A set's length's half (a pair's two cars and the coupling between): `dist` is its middle, so it stops
// with the platforms' middle under its own.
function lrtSetHalf(v) {
  return v && v.cars === 2 ? LRT_SET.carTiles + LRT_SET.couplerTiles / 2 : LRT_SET.carTiles / 2;
}

// Where a set's car k (0 the leading one) is, from the set's middle, along its way (tiles).
function lrtCarOffset(v, k) {
  if (v.cars !== 2) return 0;
  const s = (LRT_SET.carTiles + LRT_SET.couplerTiles) / 2;
  return k === 0 ? s : -s;
}

// The level crossings' lights (light-rail.js): red from when a set's nose is CROSSING_RED tiles off until
// its tail is CROSSING_CLEAR past; amber for the CROSSING_AMBER before that. Pure but for the lights.
const LRT_CROSSING = Object.freeze({ red: 2.2, amber: 3.4, clear: 0.4, step: 0.2, carWait: 0.9, onIt: 0.6, departing: 0.8 });

// For each set: the crossing tiles about it - how far ahead of its nose each is (negative: under it,
// or behind). [{ v, key, ahead }]
function lrtCrossingsAbout(placed, plans, crossings) {
  const out = [];
  if (!crossings.size) return out;
  placed.forEach((t) => {
    const plan = plans.get(t.line.id);
    const half = lrtSetHalf(t.v);
    const seen = new Map();
    for (let s = -half - LRT_CROSSING.clear; s <= half + LRT_CROSSING.amber; s += LRT_CROSSING.step) {
      const [x, y] = tramRoutePointAt(plan.route, (Number(t.v.dist) || 0) + s).pos;
      const key = `${Math.floor(y)}:${Math.floor(x)}`;
      if (!crossings.has(key) || seen.has(key)) continue;
      seen.set(key, s - half);
    }
    seen.forEach((ahead, key) => out.push({ v: t.v, key, ahead }));
  });
  return out;
}

function updateLightRailCrossings(about) {
  const lights = new Map();
  about.forEach(({ v, key, ahead }) => {
    let light = ahead <= LRT_CROSSING.red ? 'red' : 'amber';
    // a set waiting at a station by the crossing holds nothing until it is about to go (amber then),
    // unless it stands on it
    if (v.dwellLeft > 0 && ahead > LRT_CROSSING.onIt) {
      if (v.dwellLeft > LRT_CROSSING.departing) return;
      light = 'amber';
    }
    if (lights.get(key) !== 'red') lights.set(key, light);
  });
  if (typeof setLightRailCrossingLights === 'function') setLightRailCrossingLights(lights);
}

function advanceLightRailFleet(scene, delta, amount = null) {
  const state = lrtState();
  if (!state.cars.length) { if (typeof setLightRailCrossingLights === 'function') setLightRailCrossingLights(new Map()); return; }
  if (amount === null) {
    if (typeof computeTrafficProgressAmount !== 'function') return;
    const paused = typeof isGamePaused === 'function' ? isGamePaused() : (typeof simPaused !== 'undefined' && simPaused);
    amount = computeTrafficProgressAmount(delta, paused, typeof getVehicleVisualSpeedMultiplier === 'function' ? getVehicleVisualSpeedMultiplier() : 1);
  }
  const sky = typeof getTyphoonShelterFleetClock === 'function' ? getTyphoonShelterFleetClock() : 0;
  if (!isTramRunning(sky) && typeof setLightRailCrossingLights === 'function') setLightRailCrossingLights(new Map());
  if (!(amount > 0) || !isTramRunning(sky)) return;
  const placed = [];
  const plans = new Map();
  state.lines.forEach((line) => {
    if (line.status !== 'active') return;
    const plan = getLightRailLineRoute(line, state);
    if (!plan) return;
    plans.set(line.id, plan);
    getLightRailLineSets(line, state).forEach((v) => {
      if (lrtRouteKeys.get(v) !== plan.key) {
        v.dist = ((Number(v.dist) || 0) % plan.route.length + plan.route.length) % plan.route.length;
        v.callIndex = tramNextCallIndex(plan.route, v.dist);
        lrtRouteKeys.set(v, plan.key);
      }
      const at = tramRoutePointAt(plan.route, v.dist);
      placed.push({ v, line, ...at, heading: tramAxisHeading(at.pos, at.heading, state.tracks) });
    });
  });
  const traffic = scene ? [...(scene.trafficVisualState?.vehicles || []), ...(scene.transportVisualState?.vehicles || [])]
    .map(trafficVehicleMapPoint).filter(Boolean) : [];
  // the level crossings: their lights from where the sets are; and a set waits short of one with a
  // vehicle still on it (it had a green when it went in)
  const crossings = new Set(typeof getLightRailCrossings === 'function' ? getLightRailCrossings().map((x) => `${x.row}:${x.col}`) : []);
  const about = lrtCrossingsAbout(placed, plans, crossings);
  updateLightRailCrossings(about);
  const occupied = new Set();
  if (crossings.size) traffic.forEach((o) => { const k = `${Math.floor(o.pos[1])}:${Math.floor(o.pos[0])}`; if (crossings.has(k)) occupied.add(k); });
  placed.forEach((t) => {
    const plan = plans.get(t.line.id);
    const gap = t.traffic ? LIGHT_RAIL_SERVICE.streetGapTiles : LIGHT_RAIL_SERVICE.reservedGapTiles;
    const moved = stepTram(t.v, plan.route, amount * (t.traffic ? 1 : LIGHT_RAIL_SERVICE.reservedSpeed), {
      blocked: () => {
        if (occupied.size && about.some((a) => a.v === t.v && occupied.has(a.key) && a.ahead > 0 && a.ahead < LRT_CROSSING.carWait)) return true;
        // the set ahead on the same track (its middle, past both halves and its second car, and a gap)
        if (placed.some((o) => o !== t && tramBlockedBy(t.pos, t.heading, o.pos, o.heading,
          lrtSetHalf(t.v) + lrtSetHalf(o.v) + gap, 0.15, String(o.v.id) < String(t.v.id)))) return true;
        // on the road: the traffic ahead, as a tram waits for it
        if (t.traffic && traffic.some((o) => tramBlockedBy(t.pos, t.heading, o.pos, o.heading, TRAM_SERVICE.trafficSpacingTiles + lrtSetHalf(t.v) - 0.3))) return true;
        return false;
      },
      limit: () => {
        if (!t.traffic || !scene || typeof getTrafficSignalHoldProgress !== 'function') return null;
        const leg = tramAsTrafficLeg(t.pos, t.heading);
        const hold = getTrafficSignalHoldProgress(scene, leg.current, leg.next, leg.progress, TRAM_SERVICE.headwayFactor);
        return hold === null ? null : hold - leg.progress;
      },
      onCall: (call) => lightRailCallAt(state, t.line, t.v, plan.route, call),
    });
    t.v.tilesThisMonth += moved;
  });
}

// ── Drawing ─────────────────────────────────────────────────────────────────────────────────────────

const LRT_PX_PER_METRE = () => 10 * (TILE_WIDTH / 512);

// A map point at a height on screen: the flat ground under it (a hill's face is raised by its own
// height, which the height includes), up by the height.
function lightRailScreenAt(scene, x, y, z) {
  const ri = Math.floor(y), ci = Math.floor(x);
  const flat = metroFlatTileCentre(scene, ri, ci);
  const p0 = isoToScreen(ci + 0.5, ri + 0.5), p1 = isoToScreen(x, y);
  return { x: flat.x + p1.x - p0.x, y: flat.y + p1.y - p0.y - z * LRT_PX_PER_METRE() };
}

// Which picture a car shows, its way on screen given (sdx, sdy): the diagonal views (rise / fall) on
// the X and Y track, side on (horiz) and end on (vert) on the 45-degree diagonals.
function lightRailViewOf(sdx, sdy) {
  const r = Math.abs(sdy) / Math.max(1e-6, Math.abs(sdx));
  if (r < 0.25) return 'horiz';
  if (r > 2) return 'vert';
  return sdx * sdy > 0 ? 'fall' : 'rise';
}

// A car's art and its lamps: `trailer` a pair's second car (coupled back to back, facing the other
// way); `pair` it is one of two. lamps: [{ at: [x, y] art px, red }].
function lightRailCarPicture(view, sdx, sdy, trailer, pair, tilt) {
  const lamp = (art, which, red) => (art[which] || []).map((at) => ({ at, red }));
  if (view === 'horiz') {
    // its cab to the right when it runs right (a trailer's the other way)
    const cabRight = (sdx > 0) !== trailer;
    const art = LIGHT_RAIL_ART[cabRight ? 'horiz_right' : 'horiz_left'];
    // a single car shows both ends; a pair only its outer cab, the trailer's red
    const lamps = !pair ? [...lamp(art, 'heads', false), ...lamp(art, 'tails', true)] : lamp(art, 'heads', trailer);
    return { art, lamps };
  }
  // its front seen when it runs toward the viewer (down the screen)
  const frontSeen = view === 'vert' ? sdy > 0 : (sdx > 0) === (view === 'fall');
  const facing = trailer ? !frontSeen : frontSeen;
  const base = `${view}_${facing ? 'front' : 'rear'}`;
  const art = LIGHT_RAIL_ART[tilt && LIGHT_RAIL_ART[`${base}_${tilt}`] ? `${base}_${tilt}` : base];
  let lamps;
  if (!pair) lamps = facing ? lamp(art, 'heads', false) : lamp(art, 'tails', true);
  else lamps = facing ? lamp(art, 'heads', trailer) : [];
  return { art, lamps };
}

// A car's slices (tram-lines.js tramSlicedPieces): sorted along its picture's axis where it lies; up on
// a viaduct a little over the deck its tile is drawn with; at the ground under a viaduct, under it.
function lightRailSlicedPieces(scene, pos, view, sprite, z) {
  const up = z > 0.5;
  const y0 = tramSortY(pos[0], pos[1]) + TILE_HEIGHT / 2 + (up ? 0.3 : 0);
  const deck = !up && typeof metroDeckDepthOver === 'function' ? metroDeckDepthOver(scene, sprite.x, sprite.y) : null;
  const cap = (d) => (deck != null && d > deck - 0.2 ? deck - 0.2 : d);
  const width = sprite.frame.realWidth;
  if (view === 'vert' || view === 'horiz') return [{ x0: 0, x1: width, depth: cap(getWorldDepth('object', y0)) }];
  const slope = (view === 'fall' ? 1 : -1) * TILE_HEIGHT / TILE_WIDTH;
  const left = sprite.x - sprite.displayOriginX * sprite.scaleX;
  const step = TRAM_SLICE_PX / sprite.scaleX;
  const out = [];
  for (let x0 = 0; x0 < width - 0.5; x0 += step) {
    const x1 = Math.min(width, x0 + step);
    const cx = left + ((x0 + x1) / 2) * sprite.scaleX;
    out.push({ x0, x1, depth: cap(getWorldDepth('object', y0 + slope * (cx - sprite.x))) });
  }
  return out;
}

function syncLightRailCarLamps(scene, sprite, lamps, strength) {
  const lit = strength > 0.01 && typeof ensureTrafficLightTextures === 'function' && ensureTrafficLightTextures(scene);
  const pool = sprite.__tramLamps || (sprite.__tramLamps = []);
  if (!lit || !sprite.visible) { pool.forEach((l) => l.setVisible(false)); return; }
  lamps.forEach(({ at: [lx, ly], red }, i) => {
    const key = red ? TRAFFIC_LIGHT_CONFIG.taillightTextureKey : TRAFFIC_LIGHT_CONFIG.headlightTextureKey;
    let lamp = pool[i];
    if (!lamp) {
      lamp = scene.add.image(0, 0, key);
      if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, lamp, 'objectLayer');
      if (scene.worldMask) lamp.setMask(scene.worldMask);
      lamp.setBlendMode?.(typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 'ADD');
      pool[i] = lamp;
    } else if (lamp.texture.key !== key) lamp.setTexture(key);
    lamp.setPosition(sprite.x + (lx - sprite.displayOriginX) * sprite.scaleX, sprite.y + (ly - sprite.displayOriginY) * sprite.scaleY);
    const scale = (red ? TRAM_LAMP_SCALE.tail : TRAM_LAMP_SCALE.head) * 0.8 * (TILE_WIDTH / 100);
    lamp.setScale(scale).setDepth(tramPieceDepthAt(sprite, lamp.x) + 0.02).setAlpha(Math.min(1, strength)).setVisible(true);
  });
  pool.slice(lamps.length).forEach((l) => l.setVisible(false));
}

function lightRailStationTextures() {
  if (typeof LIGHT_RAIL_STATION_ART === 'undefined') return [];
  return ['rise', 'fall'].flatMap((v) => ['base', 'front', 'base_lit', 'front_lit'].map((n) => LIGHT_RAIL_STATION_ART[v][n]).filter(Boolean));
}

function lightRailArtLoaded(scene) {
  return typeof LIGHT_RAIL_ART !== 'undefined' && [...Object.values(LIGHT_RAIL_ART), ...lightRailStationTextures()].every((a) => scene.textures.exists(a.key));
}

function loadLightRailArt(scene) {
  if (typeof LIGHT_RAIL_ART === 'undefined' || scene.__lightRailArtLoading) return;
  const all = [...Object.values(LIGHT_RAIL_ART), ...lightRailStationTextures()].filter((a) => a && !scene.textures.exists(a.key));
  if (!all.length) return;
  scene.__lightRailArtLoading = true;
  all.forEach((a) => scene.load.image(a.key, typeof resolveModelAssetPath === 'function' ? resolveModelAssetPath(a.path) : a.path));
  scene.load.once('complete', () => { scene.__lightRailArtLoading = false; scene.__lightRailStationSignature = null; });
  scene.load.start();
}

function updateLightRailCars(scene) {
  const state = lrtState();
  if (!scene.lightRailCarSprites) scene.lightRailCarSprites = new Map();
  scene.lightRailTrafficLeaders = [];
  if (!state.lines.length && !scene.lightRailCarSprites.size) return;
  const sky = typeof getTyphoonShelterFleetClock === 'function' ? getTyphoonShelterFleetClock() : 0;
  const env = lightRailMapEnv();
  const strength = typeof getRuntimeTrafficLightStrength === 'function' ? getRuntimeTrafficLightStrength(scene) : 0;
  const seen = new Set();
  const draw = (v, line, plan, k) => {
    const trailer = k === 1;
    const at = tramRoutePointAt(plan.route, (Number(v.dist) || 0) + lrtCarOffset(v, k));
    const [x, y] = at.pos;
    const heading = tramAxisHeading(at.pos, at.heading, state.tracks);
    const z = lightRailHeightAt(x, y, state, env);
    const p0 = isoToScreen(x, y), p1 = isoToScreen(x + heading[0], y + heading[1]);
    const sdx = p1.x - p0.x, sdy = p1.y - p0.y;
    const view = lightRailViewOf(sdx, sdy);
    // on a ramp: tilted, the end to the right raised or lowered
    let tilt = null;
    if (view === 'rise' || view === 'fall') {
      const zf = lightRailHeightAt(x + heading[0] * 0.4, y + heading[1] * 0.4, state, env);
      const zb = lightRailHeightAt(x - heading[0] * 0.4, y - heading[1] * 0.4, state, env);
      const rise = sdx > 0 ? zf - zb : zb - zf;
      if (rise > 0.5) tilt = 'r'; else if (rise < -0.5) tilt = 'l';
    }
    const { art, lamps } = lightRailCarPicture(view, sdx, sdy, trailer, v.cars === 2, tilt);
    if (!art) return;
    const id = `${v.id}#${k}`;
    seen.add(id);
    let sprite = scene.lightRailCarSprites.get(id);
    if (!sprite) { sprite = newTramSprite(scene, art.key); scene.lightRailCarSprites.set(id, sprite); }
    if (sprite.texture.key !== art.key) sprite.setTexture(art.key);
    const p = lightRailScreenAt(scene, x, y, z);
    sprite.setOrigin(art.anchor[0] / art.size[0], art.anchor[1] / art.size[1]).setScale(art.scale * TILE_WIDTH / 100);
    sprite.setPosition(p.x, p.y).setVisible(true);
    sprite.__nightGround = false;
    if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
    applyTramPieces(scene, sprite, lightRailSlicedPieces(scene, at.pos, view, sprite, z));
    syncLightRailCarLamps(scene, sprite, lamps, strength);
    // on a narrow road: a set the traffic queues behind (as a tram, tram-lines.js updateTramVehicles) -
    // by its middle, kept clear of by its half
    if (k === v.cars - 1 && at.traffic) {
      const mid = v.cars === 2 ? tramRoutePointAt(plan.route, Number(v.dist) || 0) : at;
      const leg = tramAsTrafficLeg(mid.pos, tramAxisHeading(mid.pos, mid.heading, state.tracks));
      const headwayFactor = TRAM_SERVICE.headwayFactor + (lrtSetHalf(v) - 0.3) / ((typeof TRAFFIC_VISUAL_CONFIG !== 'undefined' && TRAFFIC_VISUAL_CONFIG.minimumHeadwayTiles) || 0.65);
      scene.lightRailTrafficLeaders.push({ ...leg, renderedProgress: leg.progress, model: { headwayFactor, category: 'tram' }, tram: true });
    }
  };
  if (isTramRunning(sky)) {
    state.lines.forEach((line) => {
      if (line.status !== 'active') return;
      const plan = getLightRailLineRoute(line, state);
      if (!plan) return;
      getLightRailLineSets(line, state).forEach((v) => { for (let k = 0; k < v.cars; k++) draw(v, line, plan, k); });
    });
  }
  scene.lightRailCarSprites.forEach((sprite, id) => {
    if (seen.has(id)) return;
    destroyTramSprite(sprite);
    scene.lightRailCarSprites.delete(id);
  });
}

// The stations (scripts/prepare-light-rail-station-assets.py, Norton's 豐年路 render): its far platform
// and the passengers' crossing (base) behind every car on its tracks, its near platform (front) in front
// of them all - each layer sorted past the cars it may overlap - and their tube lights at night.
function syncLightRailStations(scene) {
  if (!scene.lightRailStationSprites) scene.lightRailStationSprites = new Map();
  if (typeof LIGHT_RAIL_STATION_ART === 'undefined') return;
  const state = lrtState();
  const turn = typeof mapRotation === 'number' ? mapRotation : 0;
  const signature = `${state.stations.map((s) => `${s.id}@${s.row},${s.col},${s.axis}`).join('|')}#${turn}#${scene.offsetX},${scene.offsetY}`;
  const strength = Math.max(0, Math.min(1, Number(scene.buildingLightStrength) || 0));
  if (scene.__lightRailStationSignature !== signature) {
    scene.__lightRailStationSignature = signature;
    const wanted = new Set();
    const env = lightRailMapEnv();
    state.stations.forEach((st) => {
      const along = st.axis === 'ns' ? [0, 1] : [1, 0];
      const across = st.axis === 'ns' ? [1, 0] : [0, 1];
      const cx = st.col + 0.5, cy = st.row + 0.5;
      const a0 = isoToScreen(cx, cy), a1 = isoToScreen(cx + along[0], cy + along[1]);
      const view = (a1.x - a0.x) * (a1.y - a0.y) > 0 ? 'fall' : 'rise';
      const art = LIGHT_RAIL_STATION_ART[view];
      // (the depths of the cars it may overlap: on both tracks, a car's length past each end)
      const reach = LIGHT_RAIL_STATION_ART.platformTiles / 2 + LRT_SET.carTiles;
      const depths = [];
      [-0.1125, 0.1125].forEach((t) => [-reach, 0, reach].forEach((k) => depths.push(tramDepthAt(cx + across[0] * t + along[0] * k, cy + across[1] * t + along[1] * k))));
      const p = lightRailScreenAt(scene, cx, cy, lightRailHeightAt(cx, cy, state, env));
      [['base', Math.min(...depths) - 0.6], ['front', Math.max(...depths) + 0.6]].forEach(([layer, depth]) => {
        [layer, `${layer}_lit`].forEach((name) => {
          const tex = art[name];
          if (!tex || !scene.textures.exists(tex.key)) return;
          const id = `${st.id}|${name}`;
          wanted.add(id);
          let sprite = scene.lightRailStationSprites.get(id);
          if (!sprite) {
            sprite = newTramSprite(scene, tex.key);
            if (name.endsWith('_lit')) sprite.setBlendMode?.(typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 'ADD');
            scene.lightRailStationSprites.set(id, sprite);
          } else if (sprite.texture.key !== tex.key) sprite.setTexture(tex.key);
          sprite.setOrigin(art.anchor[0] / art.size[0], art.anchor[1] / art.size[1]).setScale(art.scale * TILE_WIDTH / 100)
            .setPosition(p.x, p.y).setDepth(depth + (name.endsWith('_lit') ? 0.01 : 0));
          sprite.__lrtLit = name.endsWith('_lit');
          sprite.__nightGround = !sprite.__lrtLit;
          if (!sprite.__lrtLit && typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
        });
      });
    });
    scene.lightRailStationSprites.forEach((sprite, id) => {
      if (wanted.has(id)) return;
      sprite.destroy();
      scene.lightRailStationSprites.delete(id);
    });
  }
  // (the tube lights come on with the buildings' windows)
  scene.lightRailStationSprites.forEach((sprite) => {
    if (sprite.__lrtLit) sprite.setAlpha(strength).setVisible(strength > 0.01);
    else if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
  });
}

function updateLightRailService(scene, delta = 16) {
  if (!scene?.add || typeof getTransportExpansionState !== 'function' || !getTransportExpansionState()?.lightRail) return;
  const state = lrtState();
  if (!state.stations.length && !state.lines.length && !scene.lightRailStationSprites?.size && !scene.lightRailCarSprites?.size) {
    scene.lightRailTrafficLeaders = [];
    return;
  }
  advanceLightRailFleet(scene, delta);
  if (!lightRailArtLoaded(scene)) { loadLightRailArt(scene); return; }
  syncLightRailStations(scene);
  updateLightRailCars(scene);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LIGHT_RAIL_SERVICE, LRT_SET, LRT_CROSSING, lightRailViewOf, lightRailCarPicture, lrtSetHalf, lrtCarOffset, lrtCrossingsAbout, lightRailCall };
}
