// 貨櫃貨運 (docs/campaign-p4-design.md §4.1): what the container ports carry and the trucks it puts
// on the roads. Derived from the city each pulse - nothing but the months' history is saved.
//
// A port's berths handle up to PORT_FREIGHT_TUNING.berthTeu a month. The cargo comes from the
// industry the trucks can reach (its goods out, its supplies in) and, through the edge roads, from
// the districts beyond (轉口). Every TEU is a truck trip between the port gate and where it goes.
// The trucks take the cheapest road: a road with homes along it costs more, so a way round the
// housing is used when one exists - the player's lever against 貨櫃車 under the windows.
const PORT_FREIGHT_TUNING = Object.freeze({
  berthTeu: 4000,             // 〔暫定〕 TEU a month one container port's berths can handle
  teuPerIndustrialJob: 0.5,   // local cargo per factory job reachable by road from a port
  transhipmentPerLane: 600,   // through cargo per edge-road lane to the districts beyond
  trucksPerTeu: 1,            // one truck trip per TEU
  duesPerTeu: 0.1,            // $ port dues a TEU, on top of the port's flat lease revenue
  jobsPerThousandTeu: 40,     // dockers, drivers and yard hands
  trafficPerThousandTrucks: 4, // traffic units on each road tile per 1,000 trucks a month
  homesDetour: 4,             // extra cost of a road tile with homes beside it (trucks avoid them)
  fullConflictTrucks: 4000,   // trucks a month at which a road through housing is at its worst
  maxHappinessPenalty: 0.06,
  historyMonths: 12,
});

function portFreightClamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

// A small binary heap of [cost, index] for the road search.
function createPortFreightHeap() {
  const items = [];
  const up = (i) => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (items[p][0] <= items[i][0]) break;
      [items[p], items[i]] = [items[i], items[p]];
      i = p;
    }
  };
  const down = (i) => {
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < items.length && items[l][0] < items[m][0]) m = l;
      if (r < items.length && items[r][0] < items[m][0]) m = r;
      if (m === i) break;
      [items[m], items[i]] = [items[i], items[m]];
      i = m;
    }
  };
  return {
    get size() { return items.length; },
    push(item) { items.push(item); up(items.length - 1); },
    pop() {
      const top = items[0];
      const last = items.pop();
      if (items.length) { items[0] = last; down(0); }
      return top;
    },
  };
}

// The road tiles around a footprint (the four sides, not the corners).
function getPortFreightPerimeterRoads(lot, isRoad) {
  const out = [];
  const { row, col } = lot;
  const rows = Math.max(1, lot.rows || 1), cols = Math.max(1, lot.cols || 1);
  for (let c = col; c < col + cols; c++) {
    if (isRoad(row - 1, c)) out.push([row - 1, c]);
    if (isRoad(row + rows, c)) out.push([row + rows, c]);
  }
  for (let r = row; r < row + rows; r++) {
    if (isRoad(r, col - 1)) out.push([r, col - 1]);
    if (isRoad(r, col + cols)) out.push([r, col + cols]);
  }
  return out;
}

// ports: [{ id, row, col, rows, cols, active }]; industries: [{ row, col, rows, cols, jobs }];
// connections: [{ row, col, lanes }] (edge-road tiles); isRoad(r, c); hasHomesBeside(r, c).
function computePortFreightState({
  ports = [], industries = [], connections = [], width = 256, height = 256,
  isRoad = () => false, hasHomesBeside = () => false, tuning = PORT_FREIGHT_TUNING,
} = {}) {
  const empty = {
    ports: [], teu: 0, capacity: 0, local: 0, transit: 0, source: 0, trucks: 0,
    residentialShare: 0, residentialTrucks: 0, jobs: 0, dues: 0, tiles: new Map(),
  };
  if (!ports.length) return empty;
  const index = (r, c) => r * width + c;
  const inside = (r, c) => r >= 0 && c >= 0 && r < height && c < width;
  const portStates = ports.map((port) => ({
    id: port.id, row: port.row, col: port.col, active: port.active !== false,
    gates: port.active === false ? [] : getPortFreightPerimeterRoads(port, (r, c) => inside(r, c) && isRoad(r, c)),
    capacity: 0, local: 0, transit: 0, source: 0, teu: 0,
  }));
  portStates.forEach((port) => {
    port.roadConnected = port.gates.length > 0;
    port.capacity = port.roadConnected ? tuning.berthTeu : 0;
  });

  // One search from every gate: each road tile learns its nearest port and the way back to it.
  const cost = new Map();
  const prev = new Map();
  const owner = new Map();
  const order = [];
  const heap = createPortFreightHeap();
  portStates.forEach((port, p) => port.gates.forEach(([r, c]) => {
    const k = index(r, c);
    if (cost.has(k)) return;
    cost.set(k, 0); prev.set(k, -1); owner.set(k, p);
    heap.push([0, k]);
  }));
  const done = new Set();
  while (heap.size) {
    const [d, k] = heap.pop();
    if (done.has(k) || d > cost.get(k)) continue;
    done.add(k);
    order.push(k);
    const r = Math.floor(k / width), c = k % width;
    for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      if (!inside(nr, nc) || !isRoad(nr, nc)) continue;
      const nk = index(nr, nc);
      const step = 1 + (hasHomesBeside(nr, nc) ? tuning.homesDetour : 0);
      const nd = d + step;
      if (cost.has(nk) && cost.get(nk) <= nd) continue;
      cost.set(nk, nd); prev.set(nk, k); owner.set(nk, owner.get(k));
      heap.push([nd, nk]);
    }
  }

  // Where the cargo goes: the nearest reached road beside each factory, and each edge road.
  const drops = [];
  const nearestReached = (lot) => {
    let best = null;
    getPortFreightPerimeterRoads(lot, (r, c) => inside(r, c) && done.has(index(r, c))).forEach(([r, c]) => {
      const k = index(r, c);
      if (!best || cost.get(k) < cost.get(best)) best = k;
    });
    return best;
  };
  industries.forEach((lot) => {
    const jobs = Math.max(0, Number(lot.jobs) || 0);
    if (!jobs) return;
    const k = nearestReached(lot);
    if (k == null) return;
    const teu = jobs * tuning.teuPerIndustrialJob;
    portStates[owner.get(k)].local += teu;
    drops.push({ k, teu, kind: 'local' });
  });
  connections.forEach((connection) => {
    const k = index(connection.row, connection.col);
    if (!done.has(k)) return;
    const teu = Math.max(1, Number(connection.lanes) || 1) * tuning.transhipmentPerLane;
    portStates[owner.get(k)].transit += teu;
    drops.push({ k, teu, kind: 'transit' });
  });

  // Berths cap what each port handles; the cut falls evenly on its cargo.
  portStates.forEach((port) => {
    port.source = port.local + port.transit;
    port.teu = Math.min(port.capacity, port.source);
    port.scale = port.source > 0 ? port.teu / port.source : 0;
  });

  // Trucks along the way back to the gate, summed tile by tile from the far end in.
  const flow = new Map();
  drops.forEach(({ k, teu }) => {
    const port = portStates[owner.get(k)];
    const trucks = teu * port.scale * tuning.trucksPerTeu;
    if (trucks > 0) flow.set(k, (flow.get(k) || 0) + trucks);
  });
  for (let i = order.length - 1; i >= 0; i--) {
    const k = order[i];
    const f = flow.get(k);
    if (!f) continue;
    const back = prev.get(k);
    if (back >= 0) flow.set(back, (flow.get(back) || 0) + f);
  }
  // each port's gate tiles carry its whole output; any tile is counted once
  let trucks = 0;
  let residentialTrucks = 0;
  let tileTrucks = 0;
  flow.forEach((f, k) => {
    const r = Math.floor(k / width), c = k % width;
    tileTrucks += f;
    if (hasHomesBeside(r, c)) residentialTrucks += f;
  });
  portStates.forEach((port) => { trucks += port.teu * tuning.trucksPerTeu; });

  const teu = portStates.reduce((sum, port) => sum + port.teu, 0);
  return {
    ports: portStates.map(({ id, row, col, active, roadConnected, capacity, local, transit, source, teu: t }) => ({
      id, row, col, active, roadConnected, capacity,
      local: Math.round(local), transit: Math.round(transit), source: Math.round(source), teu: Math.round(t),
    })),
    teu: Math.round(teu),
    capacity: portStates.reduce((sum, port) => sum + port.capacity, 0),
    local: Math.round(portStates.reduce((sum, port) => sum + port.local * port.scale, 0)),
    transit: Math.round(portStates.reduce((sum, port) => sum + port.transit * port.scale, 0)),
    source: Math.round(portStates.reduce((sum, port) => sum + port.source, 0)),
    trucks: Math.round(trucks),
    // the share of the truck-kilometres driven past homes
    residentialShare: tileTrucks > 0 ? portFreightClamp(residentialTrucks / tileTrucks) : 0,
    residentialTrucks: Math.round(residentialTrucks),
    jobs: Math.round(teu / 1000 * tuning.jobsPerThousandTeu),
    dues: Math.round(teu * tuning.duesPerTeu),
    tiles: flow,
  };
}

// How unhappy the trucks past the windows make the city: their share of the driving, by how
// busy the port is.
function getPortFreightHappinessPenalty(state, tuning = PORT_FREIGHT_TUNING) {
  if (!state?.trucks) return 0;
  return portFreightClamp(state.residentialShare) * portFreightClamp(state.trucks / tuning.fullConflictTrucks)
    * tuning.maxHappinessPenalty;
}

function normalizePortFreightHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-PORT_FREIGHT_TUNING.historyMonths).map((entry) => ({
    monthIndex: Math.floor(Number(entry?.monthIndex) || 0),
    teu: Math.max(0, Math.round(Number(entry?.teu) || 0)),
    local: Math.max(0, Math.round(Number(entry?.local) || 0)),
    transit: Math.max(0, Math.round(Number(entry?.transit) || 0)),
    trucks: Math.max(0, Math.round(Number(entry?.trucks) || 0)),
    residentialShare: portFreightClamp(entry?.residentialShare),
  }));
}

// ── In the game ─────────────────────────────────────────────────────────────

let portFreightStateCache = null;

function invalidatePortFreightState() {
  portFreightStateCache = null;
}

function getPortFreightBuildings() {
  const ports = [];
  const industries = [];
  if (typeof buildingData === 'undefined') return { ports, industries };
  Object.entries(buildingData).forEach(([id, record]) => {
    if (!record) return;
    if (record.type !== 'container_port' && record.type !== 'industrial') return;
    const [row, col] = id.split(':').map(Number);
    const lot = { id, row, col, rows: record.footprintRows || 1, cols: record.footprintCols || 1 };
    if (record.type === 'container_port') {
      ports.push({ ...lot, active: (record.powerState ?? 'active') !== 'abandoned' });
    } else if (!(typeof isScienceParkIndustrialRecord === 'function' && isScienceParkIndustrialRecord(record))) {
      industries.push({ ...lot, jobs: typeof getBuildingJobCapacity === 'function' ? getBuildingJobCapacity(record) : 0 });
    }
  });
  return { ports, industries };
}

function getPortFreightState() {
  const tick = typeof city === 'undefined' ? 0 : city.tick;
  const roads = typeof roadTileCount === 'number' ? roadTileCount : 0;
  const buildings = typeof buildingData === 'undefined' ? null : buildingData;
  const count = buildings ? Object.keys(buildings).length : 0;
  if (portFreightStateCache && portFreightStateCache.tick === tick && portFreightStateCache.roads === roads
    && portFreightStateCache.buildings === buildings && portFreightStateCache.count === count) {
    return portFreightStateCache.state;
  }
  const { ports, industries } = getPortFreightBuildings();
  const road = (r, c) => (typeof isRoadTile === 'function' ? isRoadTile(r, c) : mapData?.[r]?.[c] === ROAD);
  const homes = (r, c) => {
    for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      if (zoneMap?.[nr]?.[nc] === ZONE_RES) return true;
    }
    return false;
  };
  const connections = ports.length && typeof detectRegionConnections === 'function'
    ? detectRegionConnections().map(({ row, col, lanes }) => ({ row, col, lanes })) : [];
  const state = computePortFreightState({
    ports, industries, connections,
    width: typeof MAP_WIDTH === 'number' ? MAP_WIDTH : 256,
    height: typeof MAP_HEIGHT === 'number' ? MAP_HEIGHT : 256,
    isRoad: road, hasHomesBeside: homes,
  });
  portFreightStateCache = { tick, roads, buildings, count, state };
  return state;
}

// Called from updateDemand: the port's jobs join the industry's, and city.portFreight carries
// this month's rates for the HUD, the chapters and the medals.
function updatePortFreight() {
  const state = getPortFreightState();
  if (typeof city !== 'undefined') {
    city.portFreight = state.ports.length ? {
      teu: state.teu, capacity: state.capacity, local: state.local, transit: state.transit,
      source: state.source, trucks: state.trucks, residentialShare: state.residentialShare,
      jobs: state.jobs, dues: state.dues,
    } : null;
  }
  return state;
}

function getPortFreightJobs() {
  return getPortFreightState().jobs;
}

function getPortFreightMonthlyDues() {
  return getPortFreightState().dues;
}

function getPortFreightCityHappinessPenalty() {
  return getPortFreightHappinessPenalty(getPortFreightState());
}

// Truck traffic on the roads they use (called from updateTrafficMap).
function addPortFreightTrafficLoad(addLoad) {
  const state = getPortFreightState();
  if (!state.trucks) return;
  const width = typeof MAP_WIDTH === 'number' ? MAP_WIDTH : 256;
  state.tiles.forEach((trucks, k) => {
    addLoad(Math.floor(k / width), k % width, trucks / 1000 * PORT_FREIGHT_TUNING.trafficPerThousandTrucks);
  });
}

// How much more often a truck is drawn on this road (traffic-visuals.js): 1 off the truck routes.
function getPortFreightTruckBoostAt(row, col) {
  const state = portFreightStateCache?.state;
  if (!state?.trucks) return 1;
  const width = typeof MAP_WIDTH === 'number' ? MAP_WIDTH : 256;
  const trucks = state.tiles.get(row * width + col) || 0;
  return 1 + Math.min(6, trucks / 500);
}

function recordPortFreightMonth() {
  if (typeof city === 'undefined') return;
  const state = getPortFreightState();
  const history = normalizePortFreightHistory(city.portFreightHistory);
  if (!state.ports.length && !history.length) return;
  const monthIndex = (Number(city.year) || 0) * 12 + (Number(city.month) || 1) - 1;
  history.push({ monthIndex, teu: state.teu, local: state.local, transit: state.transit,
    trucks: state.trucks, residentialShare: state.residentialShare });
  city.portFreightHistory = history.slice(-PORT_FREIGHT_TUNING.historyMonths);
}

if (typeof onGameClockEvent === 'function') onGameClockEvent('gameclock:month', recordPortFreightMonth);

// The truck routes, drawn for a few seconds from the port's panel: red past homes, amber elsewhere.
function flashPortFreightRoutes(scene = typeof activeScene === 'undefined' ? null : activeScene) {
  const state = getPortFreightState();
  if (!scene?.add || !state.tiles.size || typeof isoToScreen !== 'function') return false;
  const width = typeof MAP_WIDTH === 'number' ? MAP_WIDTH : 256;
  scene.portFreightFlash?.destroy();
  const g = scene.add.graphics();
  if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, g, 'effectLayer');
  g.setDepth(typeof getPreviewOverlayDepth === 'function' ? getPreviewOverlayDepth(0) : 1e6);
  const surface = (typeof BUILDING_SURFACE_Y_OFFSET === 'number' ? BUILDING_SURFACE_Y_OFFSET : 15)
    + (typeof TILE_HEIGHT === 'number' ? TILE_HEIGHT / 2 : 16);
  const corner = (col, row) => {
    const at = isoToScreen(col, row);
    return { x: at.x + (scene.offsetX || 0), y: at.y + (scene.offsetY || 0) - surface };
  };
  let peak = 0;
  state.tiles.forEach((trucks) => { peak = Math.max(peak, trucks); });
  state.tiles.forEach((trucks, k) => {
    const r = Math.floor(k / width), c = k % width;
    const homes = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([nr, nc]) => zoneMap?.[nr]?.[nc] === ZONE_RES);
    g.fillStyle(homes ? 0xd8462f : 0xe0a530, 0.35 + 0.45 * Math.min(1, trucks / peak));
    g.fillPoints([corner(c, r), corner(c + 1, r), corner(c + 1, r + 1), corner(c, r + 1)], true);
  });
  scene.portFreightFlash = g;
  scene.time?.delayedCall?.(6000, () => {
    if (scene.portFreightFlash === g) scene.portFreightFlash = null;
    g.destroy();
  });
  return true;
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  PORT_FREIGHT_TUNING, computePortFreightState, getPortFreightHappinessPenalty, normalizePortFreightHistory,
};
