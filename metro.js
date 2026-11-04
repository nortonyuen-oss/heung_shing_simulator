// 地鐵 (docs/metro-design.md), phase 1: underground. The transport company builds stations - a
// 1 x 1 entrance by a road - and lines between them, buys trains and takes fares by distance. The
// tunnels run straight from station to station under anything, the sea too, so nothing is drawn on
// the ground but the entrances; in Transport Mode the lines, stations and trains are drawn over the
// map. As with the Star Ferry (ferry.js) the state lives in the transport company's (`metro`), and
// a train's place is worked out from the clock: nothing moving is stored.

const METRO = Object.freeze({
  // a line pays back in about a year (a double-decker takes 17 months): docs/metro-design.md §5
  stationCost: 15000,
  stationMonthlyUpkeep: 100,
  tunnelCostPerLandTile: 300,
  tunnelCostPerSeaTile: 700,
  catchmentRadius: 10,         // 200 m: people walk further to the MTR than to a bus stop (5)
  boardingShare: 4,            // times a bus stop's daily share
  trainPrice: 5000,
  trainCapacity: 1500,
  speedTilesPerMinute: 4,      // a bus does 1.33 on the road
  dwellMinutes: 1,
  trainMonthlyUpkeep: 150,
  tileRunningCost: 0.004,
  // by distance, as the MTR's: on boarding, and for every tile ridden (company dollars)
  fareBase: 0.05,
  farePerTile: 0.002,
  maxStationsPerLine: 12,
  maxLines: 8,
  maxTrainsPerLine: 10,
  unlockPopulation: 30000,
  // trains run from 06:00 to 01:00 (sky minutes of the day)
  serviceFromMinute: 6 * 60,
  serviceToMinute: 60,
  // a train this often or better is a full service (getMetroLineQuality)
  fullServiceHeadwayMinutes: 10,
  landValueBonusMax: 0.15,     // a bus stop's is 0.08
  trafficReliefMax: 0.4,       // a bus route's is 0.25
  // 鐵路加物業 (docs/metro-phase2-design.md §2): the company's share of the rise in land value round
  // its stations, each month - a building's rise x its level x its tiles x this - rising to the full
  // over a station's first year of trains, and at most so much a station
  propertyRatePerTile: 40,
  propertyRampMonths: 12,
  propertyStationCap: 2000,
  // 轉車站 (§3): a station's riders grow with what the network reaches past its own lines, to half again
  networkBoostMax: 0.5,
  // (Norton 2026-11-04, §4.2) in a big city a station's riders grow slowly past what a station in
  // the phase-1 test city drew in a day - a line there paid back in about a year, in 太子 in a month -
  // and the property income grows with the city, to three times at 360,000 people
  ridershipKneePerDay: 750,
  ridershipExponent: 0.1,
  propertyCityScaleFrom: 40000,
  propertyCityScaleMax: 3,
});

// The MTR's line colours: 荃灣綫, 港島綫, 觀塘綫, 東涌綫, 將軍澳綫, 南港島綫, 屯馬綫, 東鐵綫
const METRO_LINE_COLORS = Object.freeze(['#e2231a', '#0075c2', '#00a040', '#f38b00', '#7d499d', '#b5bd00', '#923011', '#5eb7e8']);
const METRO_DIRS = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });

function metroT(key, fallback, vars = {}) {
  const fill = (text) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  if (typeof t !== 'function') return fill(fallback);
  const out = t(key, vars);
  return out && out !== key ? out : fill(fallback);
}

// ── State ─────────────────────────────────────────────────────────────────────

function normalizeMetroState(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const num = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);
  const queue = (x) => Math.max(0, Math.min(99999, num(x)));
  const queues = (raw) => Object.fromEntries(Object.entries(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {})
    .map(([k, v]) => [String(k).slice(0, 40), queue(v)]).filter(([, v]) => v > 0));
  const stations = (Array.isArray(src.stations) ? src.stations : []).map((s) => {
    const row = Math.floor(num(s?.row, NaN)); const col = Math.floor(num(s?.col, NaN));
    if (!s?.id || !Number.isFinite(row) || !Number.isFinite(col)) return null;
    return {
      id: String(s.id).slice(0, 40), row, col,
      facing: METRO_DIRS[s.facing] ? s.facing : 's',
      name: String(s.name || '').slice(0, 40),
      // its queue for each line that calls (fractional, so a quiet station's few riders an hour
      // still add up), and of those the riders come from another line, who have paid to board
      waitingByLine: queues(s.waitingByLine),
      transferByLine: queues(s.transferByLine),
      // (phase 1 kept one queue: it goes to the station's line below)
      legacyWaiting: queue(s.waiting),
      // months with trains calling (for the rise in land value) and last month's property income
      servedMonths: Math.max(0, Math.floor(num(s.servedMonths))),
      lastPropertyIncome: Math.max(0, Math.round(num(s.lastPropertyIncome))),
    };
  }).filter(Boolean);
  const stationIds = new Set(stations.map((s) => s.id));
  const lines = (Array.isArray(src.lines) ? src.lines : []).map((l, i) => {
    const ids = (Array.isArray(l?.stationIds) ? l.stationIds : []).map(String).filter((id) => stationIds.has(id));
    if (!l?.id || ids.length < 2) return null;
    return {
      id: String(l.id).slice(0, 40),
      name: String(l.name || '').slice(0, 40),
      color: typeof l.color === 'string' && /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : METRO_LINE_COLORS[i % METRO_LINE_COLORS.length],
      stationIds: ids.slice(0, METRO.maxStationsPerLine),
      status: l.status === 'suspended' ? 'suspended' : 'active',
      monthToDatePassengers: Math.max(0, Math.floor(num(l.monthToDatePassengers))),
      monthToDateRevenue: Math.max(0, num(l.monthToDateRevenue)),
      // of the riders boarding, those changing from another line at a 轉車站
      monthToDateTransfers: Math.max(0, num(l.monthToDateTransfers)),
      history: (Array.isArray(l.history) ? l.history : []).slice(-24).map((h) => ({
        year: Math.floor(num(h?.year)), month: Math.floor(num(h?.month)),
        passengers: Math.max(0, Math.floor(num(h?.passengers))),
        transfers: Math.max(0, Math.floor(num(h?.transfers))),
        revenue: num(h?.revenue), cost: num(h?.cost), net: num(h?.net),
      })),
    };
  }).filter(Boolean);
  const lineIds = new Set(lines.map((l) => l.id));
  stations.forEach((station) => {
    const legacy = station.legacyWaiting;
    delete station.legacyWaiting;
    [station.waitingByLine, station.transferByLine].forEach((map) => Object.keys(map).forEach((k) => { if (!lineIds.has(k)) delete map[k]; }));
    if (legacy > 0 && !Object.keys(station.waitingByLine).length) {
      const line = lines.find((l) => l.stationIds.includes(station.id));
      if (line) station.waitingByLine[line.id] = legacy;
    }
    Object.keys(station.transferByLine).forEach((k) => {
      station.transferByLine[k] = Math.min(station.transferByLine[k], station.waitingByLine[k] || 0);
    });
  });
  const trains =(Array.isArray(src.trains) ? src.trains : []).map((v) => {
    if (!v?.id || !lineIds.has(String(v.lineId))) return null;
    return {
      id: String(v.id).slice(0, 40),
      lineId: String(v.lineId),
      phase: ((num(v.phase) % 1) + 1) % 1,
      aboard: Math.max(0, Math.min(METRO.trainCapacity, Math.floor(num(v.aboard)))),
      purchasePrice: Math.max(0, num(v.purchasePrice, METRO.trainPrice)),
      ageMonths: Math.max(0, Math.floor(num(v.ageMonths))),
      tilesThisMonth: Math.max(0, num(v.tilesThisMonth)),
      monthToDateRevenue: Math.max(0, num(v.monthToDateRevenue)),
      lastMonthRevenue: Math.max(0, num(v.lastMonthRevenue)),
    };
  }).filter(Boolean);
  const used = trains.map((v) => Number(String(v.id).replace(/^train-/, '')) || 0);
  return {
    stations, lines, trains,
    nextId: Math.max(1, Math.floor(num(src.nextId, 1))),
    nextTrainId: Math.max(1, Math.floor(num(src.nextTrainId, 1)), ...used.map((n) => n + 1)),
    // once open, it stays open (a city that shrinks below the mark keeps its railway)
    unlocked: src.unlocked === true,
    // 地下鐵路撥款 (council-definitions.js): what is left of the government's grants, for the metro only
    grantBalance: Math.max(0, Math.round(num(src.grantBalance))),
    // 鐵路加物業: last month's property income, all stations
    lastPropertyIncome: Math.max(0, Math.round(num(src.lastPropertyIncome))),
  };
}

function getMetroState() {
  const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
  if (!transport) return normalizeMetroState(null);
  if (!transport.metro) transport.metro = normalizeMetroState(null);
  return transport.metro;
}

// 地下鐵路撥款: the treasury's grant, passed by the council (council-effects.js), kept apart from the
// company's cash for the metro only.
function grantMetroFunding(amount) {
  const value = Math.max(0, Math.round(Number(amount) || 0));
  if (!value) return 0;
  getMetroState().grantBalance += value;
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  if (typeof refreshTransportUi === 'function') refreshTransportUi();
  return value;
}

// What the metro builds and buys is paid from the grant first, the company's cash for the rest.
// False, and nothing spent, when the two together are not enough.
function spendMetroFunds(amount) {
  const cost = Math.max(0, Math.round(Number(amount) || 0));
  const state = getMetroState();
  const fromGrant = Math.min(state.grantBalance, cost);
  const rest = cost - fromGrant;
  if (rest > 0) {
    const spend = typeof spendTransportConstruction === 'function' ? spendTransportConstruction : null;
    if (!spend || !spend(rest)) return false;
  }
  state.grantBalance -= fromGrant;
  // the company's cash does not move while the grant pays, so say where the money came from
  if (fromGrant > 0 && typeof showToast === 'function') {
    showToast(metroT('metro.toast.paidFromGrant', '地鐵撥款支付 ${paid}{rest}，撥款餘額 ${left}。', {
      paid: fromGrant.toLocaleString(),
      rest: rest > 0 ? metroT('metro.toast.paidRest', '，公司現金支付 ${rest}', { rest: rest.toLocaleString() }) : '',
      left: state.grantBalance.toLocaleString(),
    }), 'info');
  }
  return true;
}

// Open to the transport company once the city has 30,000 people; the forum hears of it.
function isMetroUnlocked() {
  if (typeof isTransportExpansionActive === 'function' && !isTransportExpansionActive()) return false;
  const state = getMetroState();
  if (state.unlocked) return true;
  if ((Number(typeof city !== 'undefined' ? city.population : 0) || 0) < METRO.unlockPopulation) return false;
  state.unlocked = true;
  announceMetroUnlocked();
  return true;
}

function announceMetroUnlocked() {
  if (typeof addForumPost !== 'function' || typeof city === 'undefined') return;
  const cityName = String(city.name || '').trim() || '香城';
  const headline = `【鐵路規劃】${cityName}人口突破三萬　運輸公司研究興建地下鐵路`;
  if (typeof addCityNews === 'function') addCityNews(headline);
  addForumPost({
    headline,
    body: [
      `${cityName}人口突破三萬，路面交通越嚟越逼。運輸公司宣佈可以開始興建地下鐵路：喺路邊起地鐵站出入口，再喺站與站之間掘隧道，連海底都可以過。`,
      '有街坊即刻問幾時有得搭：「起好之後返工唔使再喺巴士站企成個鐘。」亦有人擔心掘隧道會唔會好嘈。',
      '運輸公司表示，地鐵車費會按距離計，車站附近嘅樓價預計都會升。',
    ],
    source: 'local',
    social: { likes: 2100, laughs: 90, angry: 160, commentCount: 688, shares: 940 },
  }, { id: `metroUnlock-${city.year}`, category: '城市發展', author: '運輸公司' });
}

function getMetroStationById(id, state = getMetroState()) {
  return state.stations.find((s) => s.id === id) || null;
}

function getMetroStationAt(row, col) {
  if (typeof getTransportExpansionState !== 'function') return null;
  const transport = getTransportExpansionState();
  return transport?.metro?.stations?.find((s) => s.row === row && s.col === col) || null;
}

// A station's entrance stands here: no road, building or zone goes on it.
function isMetroStationTile(row, col) {
  return Boolean(getMetroStationAt(row, col));
}

function getMetroStationLine(station, state = getMetroState()) {
  return state.lines.find((l) => l.stationIds.includes(station.id)) || null;
}

function getMetroLineStations(line, state = getMetroState()) {
  return line.stationIds.map((id) => getMetroStationById(id, state)).filter(Boolean);
}

function getMetroLineTrains(line, state = getMetroState()) {
  return state.trains.filter((v) => v.lineId === line.id);
}

// Every line calling at a station: more than one makes it a 轉車站.
function getMetroStationLines(station, state = getMetroState()) {
  return state.lines.filter((l) => l.stationIds.includes(station.id));
}

// Everyone waiting at a station, for every line.
function getMetroStationWaiting(station) {
  return Object.values(station?.waitingByLine || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

/**
 * What a station reaches on the running lines: `byLine` the other stations of each line calling
 * here, `own` the most of those on one line, `network` every station it can get to changing at
 * 轉車站. Pure: `lines` are { id, stationIds, status }.
 */
function metroStationReach(stationId, lines) {
  const running = lines.filter((l) => l.status !== 'suspended' && l.stationIds.length > 1);
  const byLine = new Map();
  running.forEach((l) => { if (l.stationIds.includes(stationId)) byLine.set(l.id, new Set(l.stationIds).size - 1); });
  const seen = new Set([stationId]);
  const queue = [stationId];
  while (queue.length) {
    const here = queue.shift();
    running.forEach((l) => {
      if (!l.stationIds.includes(here)) return;
      l.stationIds.forEach((id) => { if (!seen.has(id)) { seen.add(id); queue.push(id); } });
    });
  }
  return { byLine, own: Math.max(0, ...byLine.values()), network: seen.size - 1 };
}

// How many more ride from a station for what the network reaches past its own line: half as many
// again once it reaches twice as far (docs/metro-phase2-design.md §3.2). Pure.
function metroNetworkBoost(reach) {
  if (!(reach.own > 0)) return 1;
  return 1 + METRO.networkBoostMax * Math.min(1, Math.max(0, reach.network - reach.own) / reach.own);
}

/**
 * Of those getting off line `lineId` at a station, the share changing to its other lines - as the
 * other lines reach stations this one does not - and how they split over those lines. Pure.
 * Returns { share, to: [[lineId, part]] } (the parts add to 1).
 */
function metroTransferSplit(stationId, lineId, lines) {
  const running = lines.filter((l) => l.status !== 'suspended' && l.stationIds.length > 1);
  const self = running.find((l) => l.id === lineId);
  if (!self) return { share: 0, to: [] };
  const mine = new Set(self.stationIds);
  const others = running.filter((l) => l.id !== lineId && l.stationIds.includes(stationId))
    .map((l) => [l.id, l.stationIds.filter((id) => !mine.has(id)).length])
    .filter(([, n]) => n > 0);
  const elsewhere = new Set(running.filter((l) => l.id !== lineId && l.stationIds.includes(stationId))
    .flatMap((l) => l.stationIds).filter((id) => !mine.has(id))).size;
  if (!elsewhere) return { share: 0, to: [] };
  const total = others.reduce((sum, [, n]) => sum + n, 0);
  return { share: elsewhere / (elsewhere + mine.size - 1), to: others.map(([id, n]) => [id, n / total]) };
}

// ── Stations ──────────────────────────────────────────────────────────────────

const METRO_REFUSALS = Object.freeze({
  locked: ['metro.station.locked', '城市人口要有 30,000 先可以起地鐵。'],
  outside: ['metro.station.outside', '超出地圖範圍。'],
  ground: ['metro.station.ground', '地鐵站要起喺平地上（唔可以喺水、路、斜坡或者建築上面）。'],
  noRoad: ['metro.station.noRoad', '地鐵站出入口要貼住馬路。'],
});

/**
 * Whether a station's entrance may stand at (row, col): flat open ground, a road beside it - the
 * side it faces. Pure with `ctx` { isInside, isOpenGround, isRoad }. Returns { facing } or { code }.
 */
function whyNotMetroStationAt(row, col, ctx) {
  if (!ctx.isInside(row, col)) return { code: 'outside' };
  if (!ctx.isOpenGround(row, col)) return { code: 'ground' };
  const facing = ['s', 'e', 'n', 'w'].find((d) => {
    const [dr, dc] = METRO_DIRS[d];
    return ctx.isInside(row + dr, col + dc) && ctx.isRoad(row + dr, col + dc);
  });
  return facing ? { facing } : { code: 'noRoad' };
}

function getMetroStationContext() {
  const id = (r, c) => (typeof getTileId === 'function' ? getTileId(r, c) : `${r}:${c}`);
  return {
    isInside: (r, c) => isInsideMap(r, c),
    isOpenGround: (r, c) => typeof canPlaceBuilding === 'function' && canPlaceBuilding(r, c)
      && mapData[r][c] !== ROAD && !(typeof isBridgeTile === 'function' && isBridgeTile(r, c))
      && !buildingData[id(r, c)] && !activeScene?.buildingSprites?.has(id(r, c))
      && !isMetroStationTile(r, c),
    isRoad: (r, c) => mapData[r][c] === ROAD,
  };
}

function whyNotMetroStation(row, col) {
  if (!isMetroUnlocked()) return metroT(...METRO_REFUSALS.locked);
  const res = whyNotMetroStationAt(row, col, getMetroStationContext());
  return res.code ? metroT(...METRO_REFUSALS[res.code]) : null;
}

function placeMetroStation(scene, row, col) {
  const warn = (msg) => { if (typeof showToast === 'function') showToast(msg, 'warning'); return false; };
  if (!isMetroUnlocked()) return warn(metroT(...METRO_REFUSALS.locked));
  const res = whyNotMetroStationAt(row, col, getMetroStationContext());
  if (res.code) return warn(metroT(...METRO_REFUSALS[res.code]));
  if (!spendMetroFunds(METRO.stationCost)) {
    return warn(metroT('metro.station.funds', '公司資金唔夠起地鐵站（要 ${cost}）。', { cost: METRO.stationCost.toLocaleString() }));
  }
  if (typeof removeTree === 'function') removeTree(scene, row, col);
  if (typeof removeDebris === 'function') removeDebris(scene, row, col);
  if (typeof removeZoneOverlay === 'function') removeZoneOverlay(scene, row, col);
  if (typeof zoneMap !== 'undefined' && zoneMap[row]) zoneMap[row][col] = typeof ZONE_NONE !== 'undefined' ? ZONE_NONE : 0;
  const state = getMetroState();
  const n = state.nextId++;
  state.stations.push({
    id: `station-${n}`, row, col, facing: res.facing, name: metroT('metro.station.name', '地鐵站 {n}', { n }),
    waitingByLine: {}, transferByLine: {}, servedMonths: 0, lastPropertyIncome: 0,
  });
  metroNetworkRevision += 1;
  syncMetroStations(scene);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  if (typeof showToast === 'function') showToast(metroT('metro.station.built', '起好地鐵站。用「地鐵綫」工具由一個站撳去另一個站。'), 'success');
  return true;
}

// The bulldozer on a station: refused while a line calls at it.
function demolishMetroStationAt(scene, row, col) {
  const station = getMetroStationAt(row, col);
  if (!station) return false;
  const state = getMetroState();
  if (getMetroStationLine(station, state)) {
    if (typeof showToast === 'function') showToast(metroT('metro.station.onLine', '「{name}」仲有地鐵綫經過：先喺運輸公司路線表移走佢。', { name: station.name }), 'warning');
    return true;
  }
  state.stations = state.stations.filter((s) => s !== station);
  if (metroLineDraft?.stationIds?.includes(station.id)) metroLineDraft = null;
  metroNetworkRevision += 1;
  syncMetroStations(scene);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return true;
}

// ── Lines ─────────────────────────────────────────────────────────────────────

// The tunnel between two stations: straight, under anything. Its length in tiles and how many of
// the tiles it passes under are sea. Pure with `isSea`.
function metroTunnelBetween(a, b, isSea) {
  const length = Math.hypot(b.row - a.row, b.col - a.col);
  const steps = Math.max(1, Math.ceil(length));
  let sea = 0;
  for (let k = 1; k < steps; k++) {
    const r = Math.round(a.row + (b.row - a.row) * (k / steps));
    const c = Math.round(a.col + (b.col - a.col) * (k / steps));
    if (isSea(r, c)) sea += 1;
  }
  const land = Math.max(0, steps - 1 - sea);
  return { length, sea, land, cost: Math.round(land * METRO.tunnelCostPerLandTile + sea * METRO.tunnelCostPerSeaTile) };
}

function metroIsSea(r, c) {
  return typeof isInsideMap === 'function' && isInsideMap(r, c) && mapData[r][c] === WATER;
}

// 地鐵綫: click station by station. The first two make a line (and buy its first train); each one
// after extends it; clicking the last station again ends the drawing. With nothing being drawn, a
// click on the end of a line carries that line on, anywhere else starts a new one; after 新增地鐵綫
// (`forceNew`) the first click always starts a new one. A line may call at another line's station -
// a 轉車站 (docs/metro-phase2-design.md §3.1) - but at none of its own twice.
let metroLineDraft = null;   // { lineId } of the line being drawn, { firstStationId }, or { forceNew }

function handleMetroLineClick(scene, row, col) {
  const say = (key, fallback, vars = {}, kind = 'info') => { if (typeof showToast === 'function') showToast(metroT(key, fallback, vars), kind); return kind !== 'warning'; };
  const station = getMetroStationAt(row, col);
  if (!station) return say('metro.line.pickStation', '撳一個地鐵站。', {}, 'warning');
  const state = getMetroState();
  const draftLine = metroLineDraft?.lineId ? state.lines.find((l) => l.id === metroLineDraft.lineId) : null;
  const pending = metroLineDraft?.firstStationId && !draftLine ? getMetroStationById(metroLineDraft.firstStationId, state) : null;

  // nothing being drawn: carry on a line that ends here, or start a new line here
  if (!draftLine && !pending) {
    const ending = metroLineDraft?.forceNew ? null
      : getMetroStationLines(station, state).find((l) => l.stationIds[0] === station.id || l.stationIds.at(-1) === station.id);
    if (ending) {
      // carry on from this end: make it the last station
      if (ending.stationIds[0] === station.id && ending.stationIds.length > 1) ending.stationIds.reverse();
      metroLineDraft = { lineId: ending.id };
      metroNetworkRevision += 1;
      return say('metro.line.extend', '延長「{line}」：撳下一個站；再撳「{name}」完成。', { line: ending.name, name: station.name });
    }
    if (state.lines.length >= METRO.maxLines) { metroLineDraft = null; return say('metro.line.max', '地鐵綫數目已經到上限。', {}, 'warning'); }
    metroLineDraft = { firstStationId: station.id };
    return say('metro.line.pickSecond', '由「{name}」開出：撳下一個站。', { name: station.name });
  }

  const last = draftLine ? getMetroStationById(draftLine.stationIds.at(-1), state) : pending;
  if (last.id === station.id) { metroLineDraft = null; return say('metro.line.done', '完成。'); }
  if (draftLine?.stationIds.includes(station.id)) {
    return say('metro.line.again', '「{line}」已經經過「{name}」：一條綫唔可以經同一個站兩次。', { line: draftLine.name, name: station.name }, 'warning');
  }
  if (draftLine && draftLine.stationIds.length >= METRO.maxStationsPerLine) {
    metroLineDraft = null;
    return say('metro.line.full', '一條綫最多 {n} 個站。', { n: METRO.maxStationsPerLine }, 'warning');
  }
  const tunnel = metroTunnelBetween(last, station, metroIsSea);
  if (!spendMetroFunds(tunnel.cost)) {
    return say('metro.line.funds', '公司資金唔夠掘隧道（要 ${cost}）。', { cost: tunnel.cost.toLocaleString() }, 'warning');
  }
  // another line already calls here: the riders can change (轉車站)
  const interchange = getMetroStationLines(station, state).length > 0;
  if (interchange) say('metro.line.interchange', '「{name}」變成轉車站：乘客可以喺度轉綫。', { name: station.name }, 'success');
  if (draftLine) {
    draftLine.stationIds.push(station.id);
    metroNetworkRevision += 1;
    if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
    return say('metro.line.extended', '「{line}」延長到「{name}」（隧道 ${cost}）。撳下一個站，或者再撳「{name}」完成。', { line: draftLine.name, name: station.name, cost: tunnel.cost.toLocaleString() }, 'success');
  }
  const index = state.lines.length;
  const line = {
    id: `line-${state.nextId++}`,
    name: metroT(`metro.line.defaultName${index % 8}`, ['荃灣綫', '港島綫', '觀塘綫', '東涌綫', '將軍澳綫', '南港島綫', '屯馬綫', '東鐵綫'][index % 8]),
    color: METRO_LINE_COLORS[state.lines.length % METRO_LINE_COLORS.length],
    stationIds: [pending.id, station.id],
    status: 'active', monthToDatePassengers: 0, monthToDateRevenue: 0, monthToDateTransfers: 0, history: [],
  };
  state.lines.push(line);
  metroLineDraft = { lineId: line.id };
  metroNetworkRevision += 1;
  const bought = buyMetroTrain(line.id).ok;
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return bought
    ? say('metro.line.opened', '「{line}」開咗（隧道 ${cost}），買咗一列列車。撳下一個站延長，或者再撳「{name}」完成。', { line: line.name, cost: tunnel.cost.toLocaleString(), name: station.name }, 'success')
    : say('metro.line.openedNoTrain', '「{line}」開咗，但公司資金唔夠買列車（${price}）：喺運輸公司路線表加車。', { line: line.name, price: METRO.trainPrice.toLocaleString() }, 'warning');
}

function cancelMetroLineDraft() {
  metroLineDraft = null;
}

// Close a line: its trains are sold, its stations stay.
function removeMetroLine(lineId) {
  const state = getMetroState();
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return 0;
  const value = getMetroLineTrains(line, state).reduce((sum, v) => sum + sellMetroTrainNow(state, v), 0);
  state.lines = state.lines.filter((l) => l !== line);
  if (metroLineDraft?.lineId === lineId) metroLineDraft = null;
  metroNetworkRevision += 1;
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return value;
}

function setMetroLineSuspended(lineId, suspended) {
  const line = getMetroState().lines.find((l) => l.id === lineId);
  if (!line) return false;
  line.status = suspended ? 'suspended' : 'active';
  return true;
}

// ── The timetable ─────────────────────────────────────────────────────────────

/**
 * A line's round trip, out to its last station and back: one leg per hop, each starting with the
 * train at its `from` station for the dwell. Pure: `points` are the stations' { row, col } in order.
 * Returns { legs: [{ from, to, fromIndex, toIndex, length, start }], cycle } in clock minutes.
 */
function metroLineSchedule(points) {
  const n = points.length;
  const order = [];
  for (let i = 0; i < n - 1; i++) order.push([i, i + 1]);
  for (let i = n - 1; i > 0; i--) order.push([i, i - 1]);
  let t = 0;
  const legs = order.map(([a, b]) => {
    const length = Math.hypot(points[b].row - points[a].row, points[b].col - points[a].col);
    const leg = { from: points[a], to: points[b], fromIndex: a, toIndex: b, length, start: t };
    t += METRO.dwellMinutes + length / METRO.speedTilesPerMinute;
    return leg;
  });
  return { legs, cycle: t };
}

// Where a train `phase` of a round trip ahead of the clock is at clock minute t: { r, c, state:
// 'atStation'|'running', station (index) }. Pure.
function metroTrainPointAt(schedule, t, phase = 0) {
  const { legs, cycle } = schedule;
  if (!(cycle > 0) || !legs.length) return null;
  const p = ((t + cycle * phase) % cycle + cycle) % cycle;
  let leg = legs[legs.length - 1];
  for (const candidate of legs) { if (candidate.start <= p) leg = candidate; else break; }
  const into = p - leg.start;
  if (into < METRO.dwellMinutes) return { r: leg.from.row, c: leg.from.col, state: 'atStation', station: leg.fromIndex };
  const k = Math.min(1, ((into - METRO.dwellMinutes) * METRO.speedTilesPerMinute) / Math.max(1e-6, leg.length));
  return { r: leg.from.row + (leg.to.row - leg.from.row) * k, c: leg.from.col + (leg.to.col - leg.from.col) * k, state: 'running', station: null };
}

// Every call at a station in clock minutes (t0, t1] by trains at the given phases, in order: a
// train calls at a leg's `from` station as the leg starts. Pure. [{ t, train, leg }].
function metroArrivalsAt(schedule, t0, t1, phases) {
  const { legs, cycle } = schedule;
  const out = [];
  if (!(t1 > t0) || !(cycle > 0)) return out;
  phases.forEach((phase, train) => {
    const offset = cycle * phase;
    legs.forEach((leg, index) => {
      for (let k = Math.floor((t0 + offset - leg.start) / cycle) + 1; ; k++) {
        const t = k * cycle + leg.start - offset;
        if (t > t1) break;
        if (t > t0) out.push({ t, train, leg: index });
      }
    });
  });
  return out.sort((a, b) => a.t - b.t || a.train - b.train);
}

/**
 * A train calls at a station: those aboard pay for the tiles just ridden and the share bound here
 * gets off - riders are spread evenly over the stations ahead of them, so at the end of the line
 * everyone does; then the station's queue for the way the train leaves boards, up to its room, and
 * pays the boarding fare - but not those changing from another line (`transferShare` of the queue),
 * whose journey goes on by the tile, as the MTR's does. Pure. `arrivingAhead` counts this station
 * and those after it the way the train came; `share` is the part of the queue going the way it leaves.
 * Returns { alighting, boarding, revenue }.
 */
function metroCall({ aboard, waiting, rodeTiles, arrivingAhead, share, transferShare = 0 }) {
  const riding = Math.max(0, Math.floor(aboard || 0));
  const revenueRide = riding * Math.max(0, rodeTiles || 0) * METRO.farePerTile;
  const alighting = arrivingAhead <= 1 ? riding : Math.round(riding / arrivingAhead);
  const room = METRO.trainCapacity - (riding - alighting);
  const boarding = Math.max(0, Math.min(room, Math.floor(Math.max(0, waiting || 0) * Math.max(0, Math.min(1, share)))));
  const paying = boarding * (1 - Math.max(0, Math.min(1, transferShare || 0)));
  return { alighting, boarding, revenue: revenueRide + paying * METRO.fareBase };
}

// A line's timetable, worked out once per network change.
let metroNetworkRevision = 0;
const metroScheduleCache = new Map();

function getMetroLineSchedule(line, state = getMetroState()) {
  const stations = getMetroLineStations(line, state);
  if (stations.length < 2) return null;
  const key = `${metroNetworkRevision}|${line.id}|${stations.map((s) => `${s.row},${s.col}`).join(';')}`;
  if (metroScheduleCache.has(key)) return metroScheduleCache.get(key);
  const schedule = metroLineSchedule(stations.map((s) => ({ row: s.row, col: s.col })));
  if (metroScheduleCache.size > 64) metroScheduleCache.clear();
  metroScheduleCache.set(key, schedule);
  return schedule;
}

function metroSkyMinutes(envMinutes) {
  return envMinutes + (typeof GAME_DAY_START_MINUTES === 'number' ? GAME_DAY_START_MINUTES : 360);
}

// Trains run 06:00 to 01:00.
function isMetroRunning(skyMinutes) {
  const m = ((Math.floor(skyMinutes) % 1440) + 1440) % 1440;
  return m >= METRO.serviceFromMinute || m < METRO.serviceToMinute;
}

// Where a new train joins a line: in the middle of the widest gap (as a ferry does).
function metroJoiningPhase(phases) {
  return typeof ferryJoiningPhase === 'function' ? ferryJoiningPhase(phases) : (phases.length ? (phases.at(-1) + 0.5) % 1 : 0);
}

// ── The company's trains ──────────────────────────────────────────────────────

function buyMetroTrain(lineId) {
  const state = getMetroState();
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return { ok: false, code: 'line' };
  const fleet = getMetroLineTrains(line, state);
  if (fleet.length >= METRO.maxTrainsPerLine) return { ok: false, code: 'full' };
  if (!spendMetroFunds(METRO.trainPrice)) return { ok: false, code: 'funds' };
  const train = {
    id: `train-${state.nextTrainId++}`, lineId, phase: metroJoiningPhase(fleet.map((v) => v.phase)),
    aboard: 0, purchasePrice: METRO.trainPrice, ageMonths: 0, tilesThisMonth: 0, monthToDateRevenue: 0, lastMonthRevenue: 0,
  };
  state.trains.push(train);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return { ok: true, train };
}

function metroTrainResaleValue(v) {
  const factor = typeof TRANSPORT_VEHICLE_RESALE_FACTOR === 'number' ? TRANSPORT_VEHICLE_RESALE_FACTOR : 0.5;
  return Math.round(v.purchasePrice * factor);
}

function sellMetroTrainNow(state, v) {
  const value = metroTrainResaleValue(v);
  state.trains = state.trains.filter((x) => x !== v);
  const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
  if (transport) transport.company.cash = Math.round(transport.company.cash + value);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return value;
}

// One train off a line (its newest): sold at once - it is somewhere under the city, and the next
// station is never more than a minute or two away.
function sellOneMetroTrain(lineId) {
  const state = getMetroState();
  const fleet = state.trains.filter((v) => v.lineId === lineId);
  return fleet.length ? sellMetroTrainNow(state, fleet.at(-1)) : 0;
}

// ── Riders and fares ──────────────────────────────────────────────────────────

// Where a station's riders come from: homes and work within 10 tiles of its entrance.
function metroStationCatchmentPoint(station) {
  return { id: `metro-${station.id}`, row: station.row, col: station.col, radius: METRO.catchmentRadius };
}

// A station's riders a day past the knee grow slowly (by the power `ridershipExponent`): what a day
// of its catchment would draw, scaled by this. Pure.
function metroRidershipFactor(dailyRaw) {
  const knee = METRO.ridershipKneePerDay;
  if (!(dailyRaw > knee)) return 1;
  return (knee * (dailyRaw / knee) ** METRO.ridershipExponent) / dailyRaw;
}

// Each station's factor for the day (not saved: worked out again from the catchment).
const metroRidershipFactorCache = new Map();

function getMetroStationRidershipFactor(station, day, share) {
  const cached = metroRidershipFactorCache.get(station.id);
  if (cached && cached.day === day && cached.row === station.row && cached.col === station.col) return cached.factor;
  const point = metroStationCatchmentPoint(station);
  let daily = 0;
  for (let h = 0; h < 24; h++) daily += getTransportStopRidersForHour(point, h, share);
  const factor = metroRidershipFactor(daily);
  if (metroRidershipFactorCache.size > 256) metroRidershipFactorCache.clear();
  metroRidershipFactorCache.set(station.id, { day, row: station.row, col: station.col, factor });
  return factor;
}

// Hour by hour each station's riders join its queues, split over the lines calling there by how
// many stations each reaches - more of them where the network reaches past the station's own lines.
function accrueMetroStationsForHour(state, envHour) {
  if (typeof getTransportStopRidersForHour !== 'function') return;
  const dayStart = typeof GAME_DAY_START_MINUTES === 'number' ? GAME_DAY_START_MINUTES : 360;
  const hour = ((envHour + Math.floor(dayStart / 60)) % 24 + 24) % 24;
  const resetHour = typeof TRANSPORT_STOP_POOL_RESET_HOUR === 'number' ? TRANSPORT_STOP_POOL_RESET_HOUR : 4;
  const share = (typeof TRANSPORT_STOP_DAILY_BOARDING_SHARE === 'number' ? TRANSPORT_STOP_DAILY_BOARDING_SHARE : 0.75) * METRO.boardingShare;
  const active = state.lines.filter((l) => l.status === 'active');
  state.stations.forEach((station) => {
    if (hour === resetHour || !station.waitingByLine) { station.waitingByLine = {}; station.transferByLine = {}; }
    const reach = metroStationReach(station.id, active);
    if (!reach.byLine.size) { station.waitingByLine = {}; station.transferByLine = {}; return; }
    const damping = getMetroStationRidershipFactor(station, Math.floor(envHour / 24), share);
    const riders = getTransportStopRidersForHour(metroStationCatchmentPoint(station), hour, share) * damping * metroNetworkBoost(reach);
    const total = [...reach.byLine.values()].reduce((sum, n) => sum + n, 0);
    reach.byLine.forEach((n, lineId) => {
      station.waitingByLine[lineId] = Math.min(99999, (station.waitingByLine[lineId] || 0) + riders * (n / total));
    });
  });
}

// Every call at a station in environment minutes (from, to]: riders off and paying, some of them
// changing to the station's other lines; then the queue for this line on.
function callMetroTrains(state, fromMinutes, toMinutes) {
  const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
  const active = state.lines.filter((l) => l.status === 'active');
  state.lines.forEach((line) => {
    if (line.status !== 'active') return;
    const fleet = getMetroLineTrains(line, state);
    const schedule = getMetroLineSchedule(line, state);
    if (!fleet.length || !schedule) return;
    const stations = getMetroLineStations(line, state);
    const n = stations.length;
    metroArrivalsAt(schedule, metroSkyMinutes(fromMinutes), metroSkyMinutes(toMinutes), fleet.map((v) => v.phase)).forEach(({ t, train, leg }) => {
      if (!isMetroRunning(t)) return;
      const v = fleet[train];
      if (!state.trains.includes(v)) return;
      const here = schedule.legs[leg];
      const previous = schedule.legs[(leg - 1 + schedule.legs.length) % schedule.legs.length];
      const station = stations[here.fromIndex];
      const i = here.fromIndex;
      // the way it came: this station and those beyond it; the way it leaves: the stations ahead,
      // over which the queue splits
      const arrivingAhead = previous.toIndex > previous.fromIndex ? n - i : i + 1;
      const leavingAhead = here.toIndex > here.fromIndex ? n - 1 - i : i;
      const waiting = station.waitingByLine[line.id] || 0;
      const transfers = Math.min(waiting, station.transferByLine[line.id] || 0);
      const call = metroCall({
        aboard: v.aboard, waiting, rodeTiles: previous.length, arrivingAhead,
        share: leavingAhead / Math.max(1, n - 1), transferShare: waiting > 0 ? transfers / waiting : 0,
      });
      v.aboard = v.aboard - call.alighting + call.boarding;
      const left = Math.max(0, waiting - call.boarding);
      station.waitingByLine[line.id] = left;
      station.transferByLine[line.id] = waiting > 0 ? transfers * (left / waiting) : 0;
      // at a 轉車站 some of those getting off go on by another line, already paid up
      const change = metroTransferSplit(station.id, line.id, active);
      if (change.share > 0 && call.alighting > 0) {
        const changing = call.alighting * change.share;
        change.to.forEach(([otherId, part]) => {
          station.waitingByLine[otherId] = Math.min(99999, (station.waitingByLine[otherId] || 0) + changing * part);
          station.transferByLine[otherId] = Math.min(station.waitingByLine[otherId], (station.transferByLine[otherId] || 0) + changing * part);
        });
      }
      if (call.revenue > 0 && transport) {
        transport.company.cashFraction = (Number(transport.company.cashFraction) || 0) + call.revenue;
        const whole = Math.floor(transport.company.cashFraction);
        if (whole > 0) { transport.company.cash += whole; transport.company.cashFraction -= whole; }
        line.monthToDateRevenue += call.revenue;
        v.monthToDateRevenue += call.revenue;
      }
      line.monthToDatePassengers += call.boarding;
      if (waiting > 0) line.monthToDateTransfers += call.boarding * (transfers / waiting);
    });
  });
}

// From the transport company's clock (advanceTransportClock, environment minutes): hour by hour
// the stations' queues grow on the commuter curve and every train that called took its riders.
function advanceMetroClock(fromMinutes, toMinutes) {
  if (typeof mapData === 'undefined' || !(toMinutes > fromMinutes)) return;
  const state = getMetroState();
  if (!state.lines.length) return;
  for (let t = fromMinutes; t < toMinutes;) {
    const next = Math.min(toMinutes, (Math.floor(t / 60) + 1) * 60);
    if (next % 60 === 0 && next > t) accrueMetroStationsForHour(state, next / 60);
    callMetroTrains(state, t, next);
    // the tiles run, for the running cost
    const minutes = next - t;
    state.lines.forEach((line) => {
      const schedule = line.status === 'active' ? getMetroLineSchedule(line, state) : null;
      if (!schedule) return;
      const runningShare = (schedule.cycle - schedule.legs.length * METRO.dwellMinutes) / schedule.cycle;
      getMetroLineTrains(line, state).forEach((v) => { v.tilesThisMonth += minutes * METRO.speedTilesPerMinute * runningShare; });
    });
    t = next;
  }
}

// The month for the company's books (settleTransportMonth): the fares (credited as the trains
// called), the riders, and the costs - each train's upkeep and running, each station's upkeep.
function settleMetroMonth(ended = null) {
  // (the month's turn is where a growing city first hears of its railway)
  isMetroUnlocked();
  const state = getMetroState();
  const out = { revenue: 0, passengers: 0, cost: 0, property: 0 };
  state.lines.forEach((line) => {
    const fleet = getMetroLineTrains(line, state);
    const cost = fleet.reduce((sum, v) => sum + METRO.trainMonthlyUpkeep + v.tilesThisMonth * METRO.tileRunningCost, 0);
    out.revenue += line.monthToDateRevenue;
    out.passengers += line.monthToDatePassengers;
    out.cost += cost;
    line.history.push({
      year: ended ? ended.year : (typeof city !== 'undefined' ? city.year : 0),
      month: ended ? ended.month : (typeof city !== 'undefined' ? city.month : 0),
      passengers: line.monthToDatePassengers, transfers: Math.round(line.monthToDateTransfers || 0),
      revenue: Math.round(line.monthToDateRevenue * 100) / 100,
      cost: Math.round(cost * 100) / 100, net: Math.round((line.monthToDateRevenue - cost) * 100) / 100,
    });
    if (line.history.length > 24) line.history.splice(0, line.history.length - 24);
    line.monthToDateRevenue = 0;
    line.monthToDatePassengers = 0;
    line.monthToDateTransfers = 0;
  });
  state.trains.forEach((v) => {
    v.lastMonthRevenue = v.monthToDateRevenue;
    v.monthToDateRevenue = 0;
    v.tilesThisMonth = 0;
    v.ageMonths += 1;
  });
  out.cost += state.stations.length * METRO.stationMonthlyUpkeep;
  out.property = settleMetroProperty(state);
  return out;
}

// ── 鐵路加物業 (docs/metro-phase2-design.md §2) ────────────────────────────────

/**
 * The month's property income of each station: for every home and shop within reach of a station
 * with trains, its rise in land value - the station's service x the metro's land-value rise,
 * falling away to the catchment's edge, x how far into its first year of trains the station is -
 * times its level and tiles; each building counted once, by the station that raises it most; and
 * the whole (and the cap) by `cityScale`, the land being worth more in a bigger city.
 * Pure: `stations` are { id, row, col, quality, ramp }, `buildings` { row, col, level, tiles } (row
 * and col its middle). Returns Map station id -> income (whole dollars, at most the cap).
 */
function metroPropertyIncome(stations, buildings, cityScale = 1) {
  const radius = METRO.catchmentRadius;
  const raw = new Map();
  const live = stations.filter((s) => s.quality > 0 && s.ramp > 0);
  if (!live.length) return new Map();
  buildings.forEach((b) => {
    let best = 0; let by = null;
    live.forEach((s) => {
      const distance = Math.abs(s.row - b.row) + Math.abs(s.col - b.col);
      if (distance > radius) return;
      const rise = s.quality * s.ramp * METRO.landValueBonusMax * (1 - distance / (radius + 1));
      if (rise > best) { best = rise; by = s.id; }
    });
    if (by) raw.set(by, (raw.get(by) || 0) + best * Math.max(1, b.level || 1) * Math.max(1, b.tiles || 1) * METRO.propertyRatePerTile);
  });
  const scale = Math.max(1, cityScale);
  return new Map([...raw].map(([id, value]) => [id, Math.min(METRO.propertyStationCap * scale, Math.round(value * scale))]));
}

// How much more the land round a station is worth in a bigger city: from 1 at 40,000 people, as the
// square root of the population, to three times. Pure.
function metroPropertyCityScale(population) {
  const p = Math.max(0, Number(population) || 0);
  return Math.min(METRO.propertyCityScaleMax, Math.max(1, Math.sqrt(p / METRO.propertyCityScaleFrom)));
}

// The homes and shops of the city, for metroPropertyIncome.
function getMetroPropertyBuildings() {
  if (typeof buildingData === 'undefined' || !buildingData) return [];
  const out = [];
  for (const [id, record] of Object.entries(buildingData)) {
    if (!record || (record.type !== 'residential' && record.type !== 'commercial')) continue;
    const separator = id.indexOf(':');
    const rows = Math.max(1, Number(record.footprintRows) || 1);
    const cols = Math.max(1, Number(record.footprintCols) || 1);
    out.push({
      row: Number(id.slice(0, separator)) + (rows - 1) / 2,
      col: Number(id.slice(separator + 1)) + (cols - 1) / 2,
      level: Math.max(1, Math.min(3, Number(record.level) || 1)),
      tiles: rows * cols,
    });
  }
  return out;
}

// At the month's turn: each station with trains is a month further on, and the company takes its
// share of the rise in land value round it. Returns the month's property income.
function settleMetroProperty(state) {
  const quality = new Map();
  state.lines.forEach((line) => {
    const q = getMetroLineQuality(line, state);
    if (q > 0) line.stationIds.forEach((id) => quality.set(id, Math.max(quality.get(id) || 0, q)));
  });
  const stations = state.stations.map((station) => {
    if (quality.has(station.id)) station.servedMonths += 1;
    return {
      id: station.id, row: station.row, col: station.col, quality: quality.get(station.id) || 0,
      ramp: Math.min(1, station.servedMonths / METRO.propertyRampMonths),
    };
  });
  const income = metroPropertyIncome(stations, getMetroPropertyBuildings(),
    metroPropertyCityScale(typeof city !== 'undefined' ? city.population : 0));
  let total = 0;
  state.stations.forEach((station) => {
    station.lastPropertyIncome = income.get(station.id) || 0;
    total += station.lastPropertyIncome;
  });
  state.lastPropertyIncome = total;
  return total;
}

// ── The city round the stations ───────────────────────────────────────────────

// How good a line's service is, 0..1: a train every 10 minutes or better is a full service.
function getMetroLineQuality(line, state = getMetroState()) {
  if (line.status !== 'active') return 0;
  const trains = getMetroLineTrains(line, state).length;
  const schedule = getMetroLineSchedule(line, state);
  if (!trains || !schedule) return 0;
  const headway = schedule.cycle / trains;
  return Math.max(0, Math.min(1, METRO.fullServiceHeadwayMinutes / headway));
}

/**
 * The stations' share of the transport company's effects (updateTransportSimulation): land value
 * and traffic relief round each station of a running line, falling away to its catchment's edge,
 * and the homes, shops and works it serves for the company's happiness and demand bonuses. Adds to
 * the maps given; returns { lines, quality } for the company's average.
 */
function applyMetroCityEffects({ landValueBonus, buildingModeShare, residentialBenefits, residentialReached, commercialBenefits, industrialBenefits, keyOf }) {
  const out = { lines: 0, quality: 0 };
  if (typeof getTransportExpansionState !== 'function' || !getTransportExpansionState()?.metro) return out;
  const state = getMetroState();
  const radius = METRO.catchmentRadius;
  const stations = [];
  state.lines.forEach((line) => {
    const quality = getMetroLineQuality(line, state);
    if (!(quality > 0)) return;
    out.lines += 1;
    out.quality += quality;
    getMetroLineStations(line, state).forEach((station) => stations.push({ station, quality }));
  });
  if (!stations.length) return out;
  const raise = (map, key, value) => map.set(key, Math.max(map.get(key) || 0, value));
  stations.forEach(({ station, quality }) => {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const distance = Math.abs(dr) + Math.abs(dc);
        if (distance > radius || !isInsideMap(station.row + dr, station.col + dc)) continue;
        raise(landValueBonus, keyOf(station.row + dr, station.col + dc), quality * METRO.landValueBonusMax * (1 - distance / (radius + 1)));
      }
    }
  });
  if (typeof buildingData === 'undefined') return out;
  for (const [id, record] of Object.entries(buildingData)) {
    if (!record || !['residential', 'commercial', 'industrial'].includes(record.type)) continue;
    const separator = id.indexOf(':');
    const row = Number(id.slice(0, separator)) + (Math.max(1, Number(record.footprintRows) || 1) - 1) / 2;
    const col = Number(id.slice(separator + 1)) + (Math.max(1, Number(record.footprintCols) || 1) - 1) / 2;
    let best = 0;
    stations.forEach(({ station, quality }) => {
      const distance = Math.abs(station.row - row) + Math.abs(station.col - col);
      if (distance <= radius) best = Math.max(best, quality * (1 - distance / (radius + 1)));
    });
    if (!(best > 0)) continue;
    raise(buildingModeShare, id, best * METRO.trafficReliefMax);
    if (record.type === 'residential') {
      residentialReached.add(id);
      if (record.wealthTier !== 'UH') raise(residentialBenefits, id, best);
    } else if (record.type === 'commercial') {
      raise(commercialBenefits, id, best);
    } else {
      raise(industrialBenefits, id, best);
    }
  }
  return out;
}

// ── On the map ────────────────────────────────────────────────────────────────

// The entrance (Models/subwayStation, each view squared to 2:1 on its paving - scripts/source-art/
// subwayStation), shrunk to 68% on a paved plinth that fills the tile (scripts/prepare-subway-
// station-assets.py). The front view's stairs face down-left on screen, the back view's up-right;
// mirrored, down-right and up-left: the four ways to a road. `anchor` is the middle of the
// plinth's diamond and `pavingWidth` its width, in the picture's pixels.
const METRO_STATION_ART = Object.freeze({
  front: { path: 'Models/subwayStation/subwayStation.png', key: 'metro_station_front', anchor: [512, 761], pavingWidth: 1000 },
  back: { path: 'Models/subwayStation/subwayStationBack.png', key: 'metro_station_back', anchor: [512, 761], pavingWidth: 1000 },
});

function loadMetroStationTextures(scene) {
  const missing = Object.values(METRO_STATION_ART).filter((view) => !scene.textures.exists(view.key));
  if (!scene?.textures || !missing.length) return Promise.resolve(true);
  return new Promise((resolve) => {
    const start = () => {
      missing.forEach((view) => scene.load.image(view.key, typeof resolveModelAssetPath === 'function' ? resolveModelAssetPath(view.path) : view.path));
      scene.load.once('complete', () => resolve(true));
      scene.load.start();
    };
    if (scene.load.isLoading()) scene.load.once('complete', start); else start();
  });
}

// The view and its mirroring that face a station's entrance towards its road on screen.
function getMetroStationView(station) {
  const [dr, dc] = METRO_DIRS[station.facing] || METRO_DIRS.s;
  const here = isoToScreen(station.col, station.row);
  const road = isoToScreen(station.col + dc, station.row + dr);
  const back = road.y < here.y;
  return { view: back ? METRO_STATION_ART.back : METRO_STATION_ART.front, mirrored: back ? road.x < here.x : road.x > here.x };
}

function placeMetroStationSprite(scene, station, sprite) {
  const { view, mirrored } = getMetroStationView(station);
  if (!scene.textures.exists(view.key)) return;
  if (sprite.texture.key !== view.key) sprite.setTexture(view.key);
  const source = scene.textures.get(view.key).getSourceImage();
  const anchor = typeof getPropTextureAnchor === 'function'
    ? getPropTextureAnchor(view.path, view.anchor[0], view.anchor[1], source)
    : { originX: view.anchor[0] / source.width, originY: view.anchor[1] / source.height, scaleMultiplier: 1 };
  // (a flip turns the picture about its middle, so the anchor's mirror is the origin then)
  sprite.setFlipX(mirrored);
  sprite.setOrigin(mirrored ? 1 - anchor.originX : anchor.originX, anchor.originY);
  sprite.setScale((TILE_WIDTH / view.pavingWidth) * anchor.scaleMultiplier);
  const face = getTileFaceGeometry(station.row, station.col, scene.offsetX, scene.offsetY);
  sprite.setPosition(face.center.x, face.center.y);
  // sorted as a 1 x 1 building is (building-placement.js), so the towers behind it stay behind it
  const pos = isoToScreen(station.col, station.row);
  sprite.setDepth(getBuildingSortDepth(pos.y, 1, 1, getBuildingElevationOffset(station.row, station.col, 1, 1)));
  // dark at night with the ground, from the moment it is built (day-night-lighting.js)
  if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
}

// The entrances as sprites, made or moved to match the stations (after a station is built or
// pulled down, a load, or a turn of the map).
function syncMetroStations(scene) {
  if (!scene?.add || typeof getTransportExpansionState !== 'function') return;
  if (!scene.metroStationSprites) scene.metroStationSprites = new Map();
  const stations = getTransportExpansionState()?.metro?.stations || [];
  const ids = new Set(stations.map((s) => s.id));
  scene.metroStationSprites.forEach((sprite, id) => { if (!ids.has(id)) { sprite.destroy(); scene.metroStationSprites.delete(id); } });
  stations.forEach((station) => {
    let sprite = scene.metroStationSprites.get(station.id);
    if (!sprite) {
      sprite = scene.add.image(0, 0, '__DEFAULT');
      addToRenderLayer(scene, sprite, 'objectLayer');
      sprite.setMask(scene.worldMask);
      scene.metroStationSprites.set(station.id, sprite);
    }
    placeMetroStationSprite(scene, station, sprite);
  });
  // the first time, once the picture has loaded
  if (stations.length && Object.values(METRO_STATION_ART).some((view) => !scene.textures.exists(view.key))) {
    loadMetroStationTextures(scene).then(() => syncMetroStations(scene));
  }
}

function clearMetroSprites(scene) {
  scene?.metroStationSprites?.forEach((sprite) => sprite.destroy());
  if (scene) scene.metroStationSprites = new Map();
  scene?.metroOverlayGraphic?.clear();
}

// In Transport Mode, each frame: the lines as dashed lines in their colours (underground), the
// stations as rings and the trains as dots where the clock has them.
function updateMetroOverlay(scene) {
  if (!scene?.add) return;
  const g = scene.metroOverlayGraphic || (scene.metroOverlayGraphic = (() => {
    const graphic = scene.add.graphics();
    addToRenderLayer(scene, graphic, 'effectLayer');
    graphic.setDepth(typeof getPreviewOverlayDepth === 'function' ? getPreviewOverlayDepth(0) : 1e6);
    return graphic;
  })());
  g.clear();
  const transportMode = typeof isTransportModeActive !== 'undefined' && isTransportModeActive;
  const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
  if (!transportMode || !transport?.metro?.stations?.length) return;
  const state = getMetroState();
  const at = (r, c) => {
    const ri = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.round(r)));
    const ci = Math.max(0, Math.min(MAP_WIDTH - 1, Math.round(c)));
    const a = getTileFaceGeometry(ri, ci, scene.offsetX, scene.offsetY).center;
    // between tile centres, by the fraction past the rounded tile (isometric is linear)
    const p0 = isoToScreen(ci, ri); const p1 = isoToScreen(c, r);
    return { x: a.x + (p1.x - p0.x), y: a.y + (p1.y - p0.y) };
  };
  const zoom = scene.cameras?.main?.zoom || 1;
  const width = Math.max(2, 4 / zoom);
  const sky = typeof getTyphoonShelterFleetClock === 'function' ? getTyphoonShelterFleetClock() : 0;
  state.lines.forEach((line) => {
    const stations = getMetroLineStations(line, state);
    const color = Number.parseInt(line.color.slice(1), 16);
    for (let i = 1; i < stations.length; i++) {
      const a = at(stations[i - 1].row, stations[i - 1].col);
      const b = at(stations[i].row, stations[i].col);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const dash = 14 / zoom;
      g.lineStyle(width, color, line.status === 'active' ? 0.95 : 0.4);
      for (let d = 0; d < length; d += dash * 2) {
        const k0 = d / length; const k1 = Math.min(1, (d + dash) / length);
        g.lineBetween(a.x + (b.x - a.x) * k0, a.y + (b.y - a.y) * k0, a.x + (b.x - a.x) * k1, a.y + (b.y - a.y) * k1);
      }
    }
    const schedule = getMetroLineSchedule(line, state);
    if (schedule && line.status === 'active' && isMetroRunning(sky)) {
      getMetroLineTrains(line, state).forEach((v) => {
        const p = metroTrainPointAt(schedule, sky, v.phase);
        if (!p) return;
        const s = at(p.r, p.c);
        g.fillStyle(0xffffff, 1); g.fillCircle(s.x, s.y, 6 / zoom);
        g.fillStyle(color, 1); g.fillCircle(s.x, s.y, 4 / zoom);
      });
    }
  });
  state.stations.forEach((station) => {
    const lines = getMetroStationLines(station, state);
    const s = at(station.row, station.col);
    g.fillStyle(0xffffff, 1); g.fillCircle(s.x, s.y, 7 / zoom);
    if (lines.length > 1) {
      // a 轉車站, as on the MTR's map: white with a black ring
      g.lineStyle(3.5 / zoom, 0x111111, 1);
      g.strokeCircle(s.x, s.y, 8 / zoom);
    } else {
      g.lineStyle(3 / zoom, lines[0] ? Number.parseInt(lines[0].color.slice(1), 16) : 0x777777, 1);
      g.strokeCircle(s.x, s.y, 7 / zoom);
    }
    // 鐵路加物業: a little house by a station that earned from the land round it last month
    if (station.lastPropertyIncome > 0) {
      const u = 1 / zoom;
      const hx = s.x + 11 * u; const hy = s.y - 10 * u;
      g.fillStyle(0x3a2a10, 1);
      g.fillRect(hx - 5 * u, hy - 1 * u, 10 * u, 8 * u);
      g.fillTriangle(hx - 7 * u, hy, hx, hy - 7 * u, hx + 7 * u, hy);
      g.fillStyle(0xf2b134, 1);
      g.fillRect(hx - 4 * u, hy, 8 * u, 6 * u);
      g.fillTriangle(hx - 5.5 * u, hy - 0.5 * u, hx, hy - 5.5 * u, hx + 5.5 * u, hy - 0.5 * u);
    }
  });
}
