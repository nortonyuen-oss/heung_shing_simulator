// 輕鐵 (docs/light-rail-design.md): a transport system of its own beside the 電車 - its track, stations,
// lines and cars in transport.lightRail, paid for by the transport company. Phase 1: the track.
//
// One track tool, laid at the height picked (地面 / 高架 - never underground, Norton 2026-11-15:
// 輕鐵唔會地下化). Each tile holds OpenTTD TrackBits (railway-track.js), in the same frame as the tram's
// and the metro's, so one line may run along a road, off it over open ground and up onto a viaduct.
// What a tile's track is follows from the tile:
// - on a road, along it: street track, laid and drawn as the tram's (tram.js) - a track in each lane
//   of a narrow road, down the reservation of a dual carriageway;
// - on a road, straight across it: a level crossing (平交路), the rails let into the road;
// - on open ground: ballasted track, the metro's (railway-track.js), turning 45 degrees at a tile edge;
// - up: a viaduct two levels up, a ramp of four tiles each end (metro-surface.js planRailAtHeight with
//   LIGHT_RAIL_SPEC; the pieces by scripts/prepare-light-rail-viaduct-assets.py).

const LIGHT_RAIL = Object.freeze({
  streetCostPerTile: 150,      // the tram's is 120
  groundCostPerTile: 400,      // the metro's is 500
  crossingCostPerTile: 500,    // the rails let into the road, the signals
  deckCostPerTile: 1500,       // the metro's is 2000
  rampCostPerTile: 900,
  monthlyUpkeepPerTile: 1.5,
});
// (its heights: a deck two levels up - 13.3 m, Norton 2026-11-15 - its ramps four tiles; no tunnels)
const LIGHT_RAIL_SPEC = Object.freeze({ deckLevels: 2, rampTiles: 4, underground: false });

const LIGHT_RAIL_KIND_COST = Object.freeze({
  street: LIGHT_RAIL.streetCostPerTile,
  ground: LIGHT_RAIL.groundCostPerTile,
  crossing: LIGHT_RAIL.crossingCostPerTile,
  deck: LIGHT_RAIL.deckCostPerTile,
  ramp: LIGHT_RAIL.rampCostPerTile,
});

function normalizeLightRailState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const tracks = {};
  Object.entries(src.tracks && typeof src.tracks === 'object' ? src.tracks : {}).forEach(([key, mask]) => {
    const m = Math.floor(Number(mask));
    if (/^\d+:\d+$/.test(key) && m > 0 && m < 64) tracks[key] = m;
  });
  const trackElev = {};
  Object.entries(src.trackElev && typeof src.trackElev === 'object' ? src.trackElev : {}).forEach(([key, code]) => {
    // (a deck `d<level>`, a ramp step `<1..4><side it rises to>`)
    if (tracks[key] && typeof code === 'string' && /^(d[1-9]|[1-4][nesw])$/.test(code)) trackElev[key] = code;
  });
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const text = (v, d) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : d);
  const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  // 輕鐵站 (phase 2/3): on a straight of open-ground track, its platforms two tiles long about the tile
  const stations = list(src.stations).map((st) => ({
    id: String(st.id), row: Math.floor(num(st.row, -1)), col: Math.floor(num(st.col, -1)),
    axis: st.axis === 'ew' ? 'ew' : 'ns', name: text(st.name, '輕鐵站'), waitingByLine: {},
  })).filter((st) => st.id && st.row >= 0 && st.col >= 0);
  const stationIds = new Set(stations.map((st) => st.id));
  const lines = list(src.lines).map((l) => ({
    id: String(l.id), name: text(l.name, '輕鐵綫'), color: /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : '#e8711a',
    stationIds: (Array.isArray(l.stationIds) ? l.stationIds.map(String) : []).filter((id) => stationIds.has(id)),
    status: l.status === 'suspended' ? 'suspended' : 'active',
    monthToDatePassengers: Math.max(0, num(l.monthToDatePassengers)), monthToDateRevenue: Math.max(0, num(l.monthToDateRevenue)),
    history: list(l.history).slice(-24),
    ...(l.newsPending ? { newsPending: true } : {}),
  })).filter((l) => l.id && l.stationIds.length >= 2);
  const lineIds = new Set(lines.map((l) => l.id));
  // a car (or two coupled back to back) on a line
  const cars = list(src.cars).map((v) => ({
    id: String(v.id), lineId: String(v.lineId), dist: Math.max(0, num(v.dist)), dwellLeft: Math.max(0, num(v.dwellLeft)),
    callIndex: Math.max(0, Math.floor(num(v.callIndex))), aboard: Math.max(0, num(v.aboard)),
    cars: v.cars === 2 ? 2 : 1, purchasePrice: Math.max(0, num(v.purchasePrice)), ageMonths: Math.max(0, Math.floor(num(v.ageMonths))),
    tilesThisMonth: Math.max(0, num(v.tilesThisMonth)),
    monthToDateRevenue: Math.max(0, num(v.monthToDateRevenue)), lastMonthRevenue: Math.max(0, num(v.lastMonthRevenue)),
  })).filter((v) => v.id && lineIds.has(v.lineId));
  return {
    tracks, trackElev, stations, lines, cars, nextId: Math.max(1, Math.floor(num(src.nextId, 1))),
    // 輕便鐵路撥款 (council-definitions.js lightRailFunding): passed by the council - the light rail is
    // open to the company from then on - and what is left of its grants, for the light rail only
    approved: src.approved === true,
    grantBalance: Math.max(0, Math.round(num(src.grantBalance))),
  };
}

function getLightRailState() {
  const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
  if (!transport) return normalizeLightRailState(null);
  if (!transport.lightRail) transport.lightRail = normalizeLightRailState(null);
  return transport.lightRail;
}

// Open to the transport company once the council has passed 輕便鐵路撥款 (a city of 15,000 at least,
// with a transport company and a 立法會: council-voting.js).
function isLightRailUnlocked() {
  if (typeof isTransportExpansionActive === 'function' && !isTransportExpansionActive()) return false;
  return getLightRailState().approved === true;
}

// The council's grant (council-effects.js), kept apart from the company's cash for the light rail only;
// the first one opens it.
function grantLightRailFunding(amount) {
  const value = Math.max(0, Math.round(Number(amount) || 0));
  const state = getLightRailState();
  state.approved = true;
  state.grantBalance += value;
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  if (typeof refreshTransportUi === 'function') refreshTransportUi();
  return value;
}

// What the light rail builds and buys is paid from the grant first, the company's cash for the rest.
// False, and nothing spent, when the two together are not enough (or it is not open yet).
function spendLightRailFunds(amount) {
  if (!isLightRailUnlocked()) return false;
  const cost = Math.max(0, Math.round(Number(amount) || 0));
  const state = getLightRailState();
  const fromGrant = Math.min(state.grantBalance, cost);
  const rest = cost - fromGrant;
  if (rest > 0 && !(typeof spendTransportConstruction === 'function' && spendTransportConstruction(rest))) return false;
  state.grantBalance -= fromGrant;
  if (fromGrant > 0 && typeof showToast === 'function') {
    showToast(lightRailT('lightRail.toast.paidFromGrant', '輕鐵撥款支付 ${paid}{rest}，撥款餘額 ${left}。', {
      paid: fromGrant.toLocaleString(),
      rest: rest > 0 ? lightRailT('lightRail.toast.paidRest', '，公司現金支付 ${rest}', { rest: rest.toLocaleString() }) : '',
      left: state.grantBalance.toLocaleString(),
    }), 'info');
  }
  return true;
}

function isLightRailTrackTile(row, col) {
  if (typeof getTransportExpansionState !== 'function') return false;
  return Boolean(getTransportExpansionState()?.lightRail?.tracks?.[`${row}:${col}`]);
}

// What a tile's light rail takes of the ground: 'ground' (track on it, a ramp, a level crossing),
// 'deck' (a viaduct: a road may run under it, nothing built) or null (none there).
function lightRailGroundUse(row, col) {
  if (!isLightRailTrackTile(row, col)) return null;
  const code = getLightRailState().trackElev[`${row}:${col}`];
  return code && railDeckLevel(code) != null ? 'deck' : 'ground';
}

function lightRailT(key, fallback, vars = {}) {
  const fill = (text) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  if (typeof t !== 'function') return fill(fallback);
  const out = t(key, vars);
  return out && out !== key ? out : fill(fallback);
}

// ── What a tile's track is (pure, with the map as `env`) ─────────────────────────────────────────────

// The way a road tile's road runs: 'ns', 'ew', or null (a junction, a lone tile). A dual
// carriageway's band says so itself ('v': its lanes run north-south).
function lightRailRoadAxis(row, col, env) {
  const band = env.bandAt(row, col);
  if (band) return band.orientation === 'v' ? 'ns' : 'ew';
  const ns = env.isRoad(row - 1, col) || env.isRoad(row + 1, col);
  const ew = env.isRoad(row, col - 1) || env.isRoad(row, col + 1);
  if (ns && !ew) return 'ns';
  if (ew && !ns) return 'ew';
  return null;
}

// A straight across a road running `axis`: X (north-south) over an east-west road, or Y over a
// north-south one.
function lightRailCrossesRoad(mask, axis) {
  return (mask === 1 && axis === 'ew') || (mask === 2 && axis === 'ns');
}

// 'street', 'crossing', 'ground', 'deck' or 'ramp'.
function lightRailTileKind(row, col, mask, code, env) {
  if (code) return railDeckLevel(code) != null ? 'deck' : 'ramp';
  if (!env.isRoad(row, col)) return 'ground';
  return lightRailCrossesRoad(mask, lightRailRoadAxis(row, col, env)) ? 'crossing' : 'street';
}

// The kerbs a road tile's light rail runs across: the sides its track leaves the road by, onto ground
// that is not road - a level crossing's two, a turn off the road's one. No railing, lamp or bench
// stands on such a kerb (pedestrian-railings.js, street-lamps.js, street-furniture.js). [side]
function lightRailKerbSidesAt(row, col) {
  if (!lightRailIsRoad(row, col) || typeof getTransportExpansionState !== 'function') return [];
  const mask = getTransportExpansionState()?.lightRail?.tracks?.[`${row}:${col}`];
  if (!mask) return [];
  const sides = new Set();
  railBitsOf(mask).forEach((bit) => RAIL_BIT_SIDES[bit].forEach((side) => {
    const [dr, dc] = RAIL_DIRS[side];
    if (!lightRailIsRoad(row + dr, col + dc)) sides.add(side);
  }));
  return [...sides];
}

function lightRailCrossesKerbAt(row, col, side) {
  return lightRailKerbSidesAt(row, col).includes(side);
}

function lightRailCutsKerbAt(row, col) {
  return lightRailKerbSidesAt(row, col).length > 0;
}

// ── Level crossings (phase 4, docs/light-rail-design.md §2.4) ──────────────────────────────────────
// A road crossed by light rail track has traffic lights, as Hong Kong's crossings do (no barriers): a
// pole on each approach, at the end of the tile before the crossing, on the driver's left. They run in
// the junction signals' system (traffic-signals.js): each crossing is a junction there, its lights not
// on a cycle but set by the light rail's cars (light-rail-lines.js updateLightRailCrossings) - green,
// amber as a car comes near, red until it has gone by; the road traffic, the buses and the managed
// vehicles stop at its stop lines, as at any red light.

const lightRailCrossingCache = { key: null, list: [] };

// [{ row, col, axis: the road's way ('ns' | 'ew'), band }]
function getLightRailCrossings() {
  if (typeof getTransportExpansionState !== 'function' || !getTransportExpansionState()?.lightRail) return [];
  const state = getLightRailState();
  const key = `${lightRailTrackRevision}|${typeof roadTileCount !== 'undefined' ? roadTileCount : 0}|${Object.keys(state.tracks).length}`;
  if (lightRailCrossingCache.key === key) return lightRailCrossingCache.list;
  const env = lightRailMapEnv();
  const list = [];
  Object.entries(state.tracks).forEach(([k, mask]) => {
    const [row, col] = k.split(':').map(Number);
    if (state.trackElev[k] || lightRailTileKind(row, col, mask, null, env) !== 'crossing') return;
    list.push({ row, col, axis: lightRailRoadAxis(row, col, env), band: Boolean(env.bandAt(row, col)) });
  });
  lightRailCrossingCache.key = key;
  lightRailCrossingCache.list = list;
  return list;
}

function isLightRailCrossingTile(row, col) {
  return getLightRailCrossings().some((x) => x.row === row && x.col === col);
}

// The poles: one for each way the road comes in, on the tile before the crossing (traffic-signals.js
// placement form: the tile it stands on, the way the traffic it faces is going, its "junction").
function getLightRailCrossingSignalPlacements(isRoadTile = lightRailIsRoad) {
  const out = [];
  getLightRailCrossings().forEach((x) => {
    const ways = x.axis === 'ew' ? [['e', 0, -1], ['w', 0, 1]] : [['s', -1, 0], ['n', 1, 0]];
    ways.forEach(([travel, dr, dc]) => {
      const row = x.row + dr, col = x.col + dc;
      if (!isRoadTile(row, col) || isLightRailCrossingTile(row, col)) return;
      // (not on a junction: its own signals stand there)
      if (lightRailRoadAxis(row, col, lightRailMapEnv()) === null) return;
      out.push({ row, col, travel, junctionRow: x.row, junctionCol: x.col, lightRailCrossing: true });
    });
  });
  return out;
}

// Each crossing's lights now: "row:col" -> 'amber' | 'red' (green when not there).
const lightRailCrossingLights = new Map();

function getLightRailCrossingPhase(row, col) {
  const vehicle = lightRailCrossingLights.get(`${row}:${col}`) || 'green';
  return { vehicle, ped: 'red', stage: vehicle, active: 0 };
}

function setLightRailCrossingLights(lights) {
  lightRailCrossingLights.clear();
  lights.forEach((v, k) => lightRailCrossingLights.set(k, v));
}

// Where a vehicle waits for a crossing's red: its middle this far along the leg into the crossing tile
// (from the tile before's middle) - its nose at the stop line, 0.28 of a tile from the crossing's middle;
// a longer vehicle (headwayFactor) further back.
function lightRailCrossingStopProgress(headwayFactor = 1) {
  const extra = Math.max(0, (Number(headwayFactor) || 1) - 0.55) / 0.45;
  return Math.max(0.2, 0.52 - 0.25 * extra);
}

// After track is laid or taken up: the kerbside things worked out again.
function onLightRailTracksChanged(scene) {
  if (!scene) return;
  if (typeof scheduleTrafficSignalRefresh === 'function') scheduleTrafficSignalRefresh(scene);
  if (typeof scheduleStreetLampRefresh === 'function') scheduleStreetLampRefresh(scene);
  if (typeof schedulePedestrianRailingRefresh === 'function') schedulePedestrianRailingRefresh(scene);
  if (typeof scheduleStreetFurnitureRefresh === 'function') scheduleStreetFurnitureRefresh(scene, { recomputeTraffic: false });
}

// ── Laying track (pure, with the map as `env`) ──────────────────────────────────────────────────────

/**
 * What a drag of the track tool at `height` ('ground' | 'deck') would do on `state` ({ tracks,
 * trackElev }): { ok, reason, bad, mode ('street' | 'rail'), path, bits, elev, cost, kinds: { kind:
 * tiles }, newTiles, clearTiles (whose ground it takes) }.
 * - From a road to a road, setting off along it: the street way - the tram's planner (tram.js
 *   planTramTrack) on the light rail's own track, a dual carriageway's partner tile and the line's
 *   ends worked out as the tram's are.
 * - Else the rail way: the metro's (metro-surface.js planRailAtHeight) with the light rail's heights,
 *   over open ground, onto a viaduct and its ramps; a road crossed straight on the way is a level
 *   crossing (§2.4), anywhere else a road stops it.
 * env: isRoad, bandAt, canStreet, canCross, canGround, and rail: { level, openEdges, inside, canDeck,
 * groundAt } for planRailAtHeight.
 */
function planLightRailTrackPure(start, end, height, state, env) {
  const bits = state.tracks || {};
  const elev = state.trackElev || {};
  const key = (p) => railKey(p.row, p.col);
  const out = { ok: false, reason: null, bad: null, mode: 'rail', path: [start], bits, elev, cost: 0, kinds: {}, newTiles: [], clearTiles: [], height };

  // ── the street way
  const sameTile = start.row === end.row && start.col === end.col;
  if (height === 'ground' && env.isRoad(start.row, start.col) && env.isRoad(end.row, end.col)) {
    const path = tramDragPath(start, end);
    const first = path[1] ? railSideTowards(path[0], path[1]) : null;
    const axis = lightRailRoadAxis(start.row, start.col, env);
    const along = sameTile || !axis || ((first === 'n' || first === 's') === (axis === 'ns'));
    if (along && path.every((p) => env.isRoad(p.row, p.col))) {
      out.mode = 'street';
      const plan = planTramTrack(start, end, bits, (r, c) => env.canStreet(r, c), env.bandAt);
      out.path = plan.path;
      if (!plan.ok) { out.reason = plan.reason === 'notRoad' ? 'street' : plan.reason; out.bad = plan.bad; return out; }
      const next = { ...bits };
      plan.removes.forEach(({ row, col, bit }) => {
        const k = railKey(row, col);
        next[k] = (next[k] || 0) & ~bit;
        if (!next[k]) delete next[k];
      });
      plan.adds.forEach(({ row, col, bit }) => { const k = railKey(row, col); next[k] = (next[k] || 0) | bit; });
      // (street track carries no height: a tile taken back from a viaduct's end keeps none)
      const nextElev = { ...elev };
      const tiles = [...new Set([...plan.adds, ...plan.removes].map((a) => railKey(a.row, a.col)))];
      tiles.forEach((k) => { if (!next[k]) delete nextElev[k]; });
      out.bits = next;
      out.elev = nextElev;
      out.newTiles = tiles;
      out.kinds = { street: tiles.length };
      out.cost = plan.adds.length ? new Set(plan.adds.map((a) => railKey(a.row, a.col))).size * LIGHT_RAIL.streetCostPerTile : 0;
      out.ok = true;
      return out;
    }
  }

  // ── the rail way
  const path0 = railDragPath(start, end);
  // (the roads it crosses straight, where a level crossing may go)
  const crossings = new Set();
  if (height === 'ground') {
    path0.forEach((p, i) => {
      if (!env.isRoad(p.row, p.col) || bits[key(p)] || i === 0 || i === path0.length - 1) return;
      const a = railSideTowards(p, path0[i - 1]), b = railSideTowards(p, path0[i + 1]);
      if (RAIL_OPPOSITE[a] !== b) return;
      if (lightRailCrossesRoad(railBitFor(a, b), lightRailRoadAxis(p.row, p.col, env)) && env.canCross(p.row, p.col)) crossings.add(key(p));
    });
  }
  const railEnv = { ...env.rail, canGround: (r, c) => env.canGround(r, c) || crossings.has(railKey(r, c)), spec: LIGHT_RAIL_SPEC };
  const plan = planRailAtHeight(height, path0, bits, elev, railEnv);
  out.path = plan.path;
  if (!plan.ok) {
    out.reason = plan.reason;
    out.bad = plan.bad;
    // (a road in the way, not crossed straight: say so, not "open ground only")
    if (plan.reason === 'ground' && plan.bad) {
      const [r, c] = plan.bad.split(':').map(Number);
      if (env.isRoad(r, c)) out.reason = 'crossing';
    }
    return out;
  }
  const path = plan.path;
  const next = addRailPathBits(bits, path);
  const nextElev = { ...elev };
  Object.entries(plan.assign).forEach(([k, code]) => { if (code) nextElev[k] = code; else delete nextElev[k]; });
  const junctions = railBadTiles(next);
  if (junctions.length) { out.reason = 'junction'; out.bad = junctions[0]; return out; }
  const plain = Object.keys(nextElev).find((k) => next[k] && !RAIL_PLAIN_MASKS.has(next[k]));
  if (plain) { out.reason = 'deckPoints'; out.bad = plain; return out; }
  // (a level crossing straight across: no points on it)
  const crossed = [...crossings].find((k) => next[k] !== 1 && next[k] !== 2);
  if (crossed) { out.reason = 'crossingStraight'; out.bad = crossed; return out; }
  const askew = path.find(({ row, col }) => {
    const k = railKey(row, col);
    const edges = env.rail.openEdges(row, col);
    return !nextElev[k] && edges.length === 1 && next[k] !== (edges[0] === 'n' || edges[0] === 's' ? 1 : 2);
  });
  if (askew) { out.reason = 'slopeAxis'; out.bad = key(askew); return out; }
  const mismatch = railLevelMismatch(next, nextElev, path.map(key), env.rail.groundAt, LIGHT_RAIL_SPEC);
  if (mismatch) { out.reason = 'levelJoin'; out.bad = mismatch; return out; }
  out.newTiles = Object.keys(plan.assign);
  out.newTiles.forEach((k) => {
    const [r, c] = k.split(':').map(Number);
    const code = plan.assign[k];
    const kind = code ? railCodeKind(code) : crossings.has(k) ? 'crossing' : 'ground';
    out.kinds[kind] = (out.kinds[kind] || 0) + 1;
    out.cost += LIGHT_RAIL_KIND_COST[kind] || 0;
    // (a crossing is the road's; a road runs on under a viaduct)
    if (kind === 'crossing' || (kind === 'deck' && env.isRoad(r, c))) return;
    out.clearTiles.push(k);
  });
  out.bits = next;
  out.elev = nextElev;
  out.ok = true;
  return out;
}

// ── The lines' way (phase 2, pure) ─────────────────────────────────────────────────────────────────

// Off the road the tracks cross every tile edge 2.25 m either side of its middle (railway-track.js),
// as drawn.
const LIGHT_RAIL_GEOM = Object.freeze({ railHalf: 2.25 / 20, samples: 8 });

function lightRailEdgeMiddle(row, col, side) {
  if (side === 'n') return [col + 0.5, row];
  if (side === 's') return [col + 0.5, row + 1];
  if (side === 'w') return [col, row + 0.5];
  return [col + 1, row + 0.5];
}

/**
 * The light rail's track as the tram's route finder takes it (tram-lines.js buildTramLineRoute): the
 * street track's links worked out as the tram's are (buildTramTrackGeometry), and each other tile's -
 * open ground, a level crossing, a viaduct, a ramp - a straight double track between its edges' middles
 * (a diagonal across the corner, as drawn), joined at the same edge nodes. Pure with `env`.
 */
function buildLightRailGeometry(state, env) {
  const street = {};
  const crossing = new Set();
  Object.entries(state.tracks || {}).forEach(([k, mask]) => {
    if ((state.trackElev || {})[k]) return;
    const [r, c] = k.split(':').map(Number);
    if (!env.isRoad(r, c)) return;
    street[k] = mask;
    if (lightRailTileKind(r, c, mask, null, env) === 'crossing') crossing.add(k);
  });
  const geo = buildTramTrackGeometry(street, (r, c) => (crossing.has(railKey(r, c)) ? null : env.bandAt(r, c)), env.isRoad);
  const nodes = new Map();
  geo.links.forEach((l) => [l.a, l.b, l.from, l.to].forEach((n) => { if (n) nodes.set(n.key, n); }));
  const nodeAt = (row, col, side) => {
    const e = tramEdgeOf(row, col, side);
    const key = tramEdgeKey(e);
    let n = nodes.get(key);
    if (!n) {
      n = { key, axis: e.axis, line: e.line, pos: e.at + 0.5, half: LIGHT_RAIL_GEOM.railHalf, slope: 0, halfSlope: 0, band: false, links: [] };
      nodes.set(key, n);
    }
    return n;
  };
  const h = LIGHT_RAIL_GEOM.railHalf, N = LIGHT_RAIL_GEOM.samples;
  Object.entries(state.tracks || {}).forEach(([key, mask]) => {
    if (street[key] !== undefined) return;
    const [row, col] = key.split(':').map(Number);
    railBitsOf(mask).forEach((bit) => {
      const [sa, sb] = RAIL_BIT_SIDES[bit];
      const a = nodeAt(row, col, sa), b = nodeAt(row, col, sb);
      const ends = (side) => {
        const [x, y] = lightRailEdgeMiddle(row, col, side);
        return side === 'n' || side === 's' ? [[x - h, y], [x + h, y]] : [[x, y - h], [x, y + h]];
      };
      let A = ends(sa), B = ends(sb);
      if (bit !== 1 && bit !== 2) {
        // a diagonal: inner with inner, nearer the corner its two sides share
        const K = [sa === 'e' || sb === 'e' ? col + 1 : col, sa === 's' || sb === 's' ? row + 1 : row];
        const near = (p, q) => Math.hypot(p[0] - K[0], p[1] - K[1]) - Math.hypot(q[0] - K[0], q[1] - K[1]);
        A = A.slice().sort(near); B = B.slice().sort(near);
      }
      const rails = [0, 1].map((i) => {
        const pts = [];
        for (let k = 0; k <= N; k++) pts.push([A[i][0] + (B[i][0] - A[i][0]) * k / N, A[i][1] + (B[i][1] - A[i][1]) * k / N]);
        return pts;
      });
      const mid = rails[0].map((p, i) => [(p[0] + rails[1][i][0]) / 2, (p[1] + rails[1][i][1]) / 2]);
      const length = Math.hypot(mid[N][0] - mid[0][0], mid[N][1] - mid[0][1]);
      const link = { tile: key, row, col, bit, sides: [sa, sb], a, b, from: a, to: b, straight: bit === 1 || bit === 2, consumed: false, rail: true, rails, mid, length };
      geo.links.push(link);
      a.links.push(link);
      b.links.push(link);
    });
  });
  return geo;
}

/** The track's height at a map point (x = col, y = row), metres over the flat. Pure with `env`. */
function lightRailHeightAt(x, y, state, env) {
  const row = Math.floor(y), col = Math.floor(x);
  const key = railKey(row, col);
  const code = (state.trackElev || {})[key];
  const fx = x - col, fy = y - row;
  // how far toward a side across the tile
  const toward = (side) => (side === 'n' ? 1 - fy : side === 's' ? fy : side === 'w' ? 1 - fx : fx);
  if (!code) {
    // the ground (a hillside: from its foot to its top across it)
    const edges = env.rail.openEdges(row, col);
    if (edges.length === 1) {
      const foot = env.rail.groundAt(key, edges[0]), top = env.rail.groundAt(key, RAIL_OPPOSITE[edges[0]]);
      return foot + (top - foot) * toward(RAIL_OPPOSITE[edges[0]]);
    }
    return env.rail.groundAt(key, null);
  }
  if (railDeckLevel(code) != null) return railSideHeight(code, null, 0, LIGHT_RAIL_SPEC);
  const up = code[1];
  const ground = env.rail.groundAt(key, null);
  const lo = railSideHeight(code, RAIL_OPPOSITE[up], ground, LIGHT_RAIL_SPEC), hi = railSideHeight(code, up, ground, LIGHT_RAIL_SPEC);
  return lo + (hi - lo) * toward(up);
}

// Whether a map point runs in the road's traffic: street track on a narrow road (a dual carriageway's
// reservation, a level crossing and the light rail's own track do not). Pure with `env`.
function lightRailInTrafficAt(x, y, state, env) {
  const row = Math.floor(y), col = Math.floor(x);
  const mask = (state.tracks || {})[railKey(row, col)];
  if (!mask || (state.trackElev || {})[railKey(row, col)] || !env.isRoad(row, col)) return false;
  return lightRailTileKind(row, col, mask, null, env) === 'street' && !env.bandAt(row, col);
}

// A station's place (docs/light-rail-design.md §3): the middle of its two-tile platforms on a tile of
// straight double track on open ground, the track straight on each side of it too (the platforms
// reach half a tile each way). { code, site: { row, col, axis } }, code null when it may go. Pure.
function whyNotLightRailStationAt(row, col, state, env) {
  const tracks = state.tracks || {}, elev = state.trackElev || {};
  const mask = tracks[railKey(row, col)];
  if (!mask) return { code: 'noTrack' };
  if (mask !== 1 && mask !== 2) return { code: 'notStraight' };
  const axis = mask === 1 ? 'ns' : 'ew';
  const [dr, dc] = axis === 'ns' ? [1, 0] : [0, 1];
  const tiles = [[row - dr, col - dc], [row, col], [row + dr, col + dc]];
  for (const [r, c] of tiles) {
    const k = railKey(r, c);
    if (tracks[k] !== mask) return { code: 'notStraight' };
    if (elev[k] || env.isRoad(r, c)) return { code: 'notGround' };
    // (its platforms level: not on a hillside)
    if (env.rail.openEdges(r, c).length) return { code: 'notFlat' };
  }
  const near = (state.stations || []).find((st) => (axis === 'ns' ? st.col === col && Math.abs(st.row - row) < 3 : st.row === row && Math.abs(st.col - col) < 3)
    || (st.row === row && st.col === col));
  if (near) return { code: 'taken' };
  return { code: null, site: { row, col, axis } };
}

// ── On the map ──────────────────────────────────────────────────────────────────────────────────────

function lightRailIsRoad(row, col) {
  return typeof isInsideMap === 'function' && isInsideMap(row, col) && mapData[row][col] === ROAD;
}

function lightRailBandAt(row, col) {
  return lightRailIsRoad(row, col) && typeof getRoadCarriagewayBand === 'function' ? getRoadCarriagewayBand(row, col) : null;
}

// Street track goes where tram track may - a road, not a bridge, a slope or a tunnel's mouth - and not
// on the tram's own (two systems, never one tile).
function canLayLightRailStreetAt(row, col) {
  if (!lightRailIsRoad(row, col)) return false;
  if (typeof isBridgeTile === 'function' && isBridgeTile(row, col)) return false;
  if (typeof isSlopeTile === 'function' && isSlopeTile(row, col)) return false;
  if (typeof isUnderseaTunnelTile === 'function' && isUnderseaTunnelTile(row, col)) return false;
  if (typeof isTramTrackTile === 'function' && isTramTrackTile(row, col)) return false;
  return true;
}

// ... and a level crossing, not at a bus stop either.
function canCrossLightRailAt(row, col) {
  if (!canLayLightRailStreetAt(row, col)) return false;
  if (typeof getBusStopAtTile === 'function' && getBusStopAtTile(row, col)) return false;
  return true;
}

// Open ground, as the metro's track takes it (metro-surface.js canLayMetroTrackAt), and no metro
// track on it (over a metro tunnel is fine).
function canLayLightRailGroundAt(row, col) {
  if (typeof canLayMetroTrackAt !== 'function' || !canLayMetroTrackAt(row, col)) return false;
  if (typeof metroTrackGroundUse === 'function' && (metroTrackGroundUse(row, col) || 'none') !== 'none') return false;
  return true;
}

// Where a viaduct's pier may stand: as the metro's, and not on the metro's or the tram's track.
function canDeckLightRailAt(row, col) {
  if (typeof canDeckMetroTrackAt !== 'function' || !canDeckMetroTrackAt(row, col)) return false;
  if (typeof metroTrackGroundUse === 'function' && (metroTrackGroundUse(row, col) || 'none') !== 'none') return false;
  return true;
}

function lightRailMapEnv() {
  return {
    isRoad: lightRailIsRoad,
    bandAt: lightRailBandAt,
    canStreet: canLayLightRailStreetAt,
    canCross: canCrossLightRailAt,
    canGround: canLayLightRailGroundAt,
    rail: {
      level: (row, col) => (isInsideMap(row, col) ? getTileHeight(row, col) : 0),
      openEdges: metroOpenEdges,
      inside: isInsideMap,
      canDeck: canDeckLightRailAt,
      groundAt: metroGroundMetresAt,
    },
  };
}

// The height the track tool lays at: 'ground' 地面 or 'deck' 高架, picked in the flyout.
let lightRailHeight = 'ground';
const LIGHT_RAIL_HEIGHTS = Object.freeze(['ground', 'deck']);

function getLightRailHeight() {
  return lightRailHeight;
}

function setLightRailHeight(height) {
  if (!LIGHT_RAIL_HEIGHTS.includes(height)) return;
  lightRailHeight = height;
  if (typeof document !== 'undefined') {
    document.querySelectorAll('[data-lrt-height]').forEach((b) => {
      const on = b.dataset.lrtHeight === height;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
}

function planLightRailTrack(start, end, height = lightRailHeight) {
  const state = getLightRailState();
  const plan = planLightRailTrackPure(start, end, height, state, lightRailMapEnv());
  if (plan.ok && typeof isTransportExpansionActive === 'function' && !isTransportExpansionActive()) {
    return { ...plan, ok: false, reason: 'company' };
  }
  if (plan.ok && !isLightRailUnlocked()) return { ...plan, ok: false, reason: 'locked' };
  // (a station's three tiles stay one straight: light-rail-lines.js)
  if (plan.ok && typeof isLightRailStationTile === 'function') {
    const touched = Object.keys({ ...state.tracks, ...plan.bits }).find((k) => {
      if (state.tracks[k] === plan.bits[k]) return false;
      const [r, c] = k.split(':').map(Number);
      return isLightRailStationTile(r, c);
    });
    if (touched) return { ...plan, ok: false, reason: 'station', bad: touched };
  }
  return plan;
}

const LIGHT_RAIL_TRACK_REFUSALS = Object.freeze({
  company: ['lightRail.track.company', '要先開辦運輸公司，輕鐵由公司出錢起。'],
  locked: ['lightRail.track.locked', '輕鐵要立法會通過「輕便鐵路撥款」先可以起（城市人口要有 15,000）。'],
  tooShort: ['lightRail.track.tooShort', '拖長啲：路軌最少兩格。'],
  nothing: ['lightRail.track.nothing', '呢度已經有路軌。'],
  street: ['lightRail.track.street', '沿馬路嘅路軌要喺馬路上（唔可以喺橋、斜路、隧道口或者電車路軌上面）。'],
  ground: ['lightRail.track.ground', '路軌要起喺空地上（唔可以喺水或者建築上面）。'],
  crossing: ['lightRail.track.crossing', '過馬路要打直過（平交路），唔可以喺路口、巴士站、斜路或者橋上面；或者用高架。'],
  crossingStraight: ['lightRail.track.crossingStraight', '平交路要直：喺馬路外面先轉彎或者分叉。'],
  junction: ['lightRail.track.junction', '呢個路軌組合起唔到（例如兩條斜綫交叉、四向分叉）。'],
  deckPoints: ['lightRail.track.deckPoints', '高架同上落橋唔可以有道岔：道岔要起喺地面。'],
  deckHill: ['lightRail.track.deckHill', '高架太高：最多九層。'],
  deckLevels: ['lightRail.track.deckLevels', '兩頭嘅高架唔一樣高：唔可以咁樣駁埋一齊。'],
  hillHigh: ['lightRail.track.hillHigh', '前面座山高過橋面：輕鐵唔挖隧道，繞路或者行地面上山。'],
  slopeAxis: ['lightRail.track.slopeAxis', '山坡上嘅路軌要沿住斜坡直上直落（唔可以打橫或者轉彎）。'],
  levelJoin: ['lightRail.track.levelJoin', '唔同高度嘅路軌唔可以喺度相交或者駁埋：換個位，或者喺路軌盡頭接駁。'],
  rampShort: ['lightRail.track.rampShort', '上落橋要四格直路：拖長啲先駁到嗰頭。'],
  rampStraight: ['lightRail.track.rampStraight', '上落橋要四格直路：喺上落橋外面先轉彎。'],
  rampGround: ['lightRail.track.rampGround', '上落橋要起喺四格同一高度嘅空地上（唔可以喺山坡、路或者建築上面）。'],
  rampHeight: ['lightRail.track.rampHeight', '高度唔夾：上落橋一次上落兩層。'],
  deckGround: ['lightRail.track.deckGround', '高架橋墩要落喺地面或者馬路上（唔可以喺水、建築或者其他路軌上面）。'],
  funds: ['lightRail.track.funds', '公司資金唔夠起路軌（要 ${cost}）。'],
  station: ['lightRail.track.station', '輕鐵站嗰三格路軌要保持直路：喺站外面分叉或者轉彎。'],
});

function lightRailTrackRefusal(reason, vars = {}) {
  const [key, fallback] = LIGHT_RAIL_TRACK_REFUSALS[reason] || LIGHT_RAIL_TRACK_REFUSALS.ground;
  return lightRailT(key, fallback, vars);
}

const LIGHT_RAIL_KIND_NAMES = Object.freeze({
  street: ['lightRail.kind.street', '路面'],
  ground: ['lightRail.kind.ground', '地面'],
  crossing: ['lightRail.kind.crossing', '平交路'],
  ramp: ['lightRail.kind.ramp', '上落橋'],
  deck: ['lightRail.kind.deck', '高架'],
});

function lightRailTrackSummary(kinds) {
  return Object.keys(LIGHT_RAIL_KIND_NAMES).filter((k) => kinds[k]).map((k) => {
    const [key, fallback] = LIGHT_RAIL_KIND_NAMES[k];
    return lightRailT('lightRail.kind.tiles', '{kind} {n} 格', { kind: lightRailT(key, fallback), n: kinds[k] });
  }).join(lightRailT('lightRail.kind.separator', '、'));
}

let lightRailTrackRevision = 0;

function commitLightRailTrackDrag(scene, start, end, height = lightRailHeight) {
  if (scene?.bridgePreviewGraphic) scene.bridgePreviewGraphic.clear();
  if (scene?.tunnelPreviewLabel) scene.tunnelPreviewLabel.setVisible(false);
  const warn = (msg) => { if (typeof showToast === 'function') showToast(msg, 'warning'); return false; };
  const plan = planLightRailTrack(start, end, height);
  if (!plan.ok) return warn(lightRailTrackRefusal(plan.reason));
  if (plan.cost > 0 && !spendLightRailFunds(plan.cost)) {
    return warn(lightRailTrackRefusal('funds', { cost: plan.cost.toLocaleString() }));
  }
  plan.clearTiles.forEach((k) => {
    const [row, col] = k.split(':').map(Number);
    if (typeof removeTree === 'function') removeTree(scene, row, col);
    if (typeof removeDebris === 'function') removeDebris(scene, row, col);
    if (typeof removeZoneOverlay === 'function') removeZoneOverlay(scene, row, col);
    if (typeof zoneMap !== 'undefined' && zoneMap[row]) zoneMap[row][col] = typeof ZONE_NONE !== 'undefined' ? ZONE_NONE : 0;
  });
  const state = getLightRailState();
  state.tracks = plan.bits;
  state.trackElev = plan.elev;
  lightRailTrackRevision += 1;
  syncLightRailTracks(scene);
  onLightRailTracksChanged(scene);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  if (typeof showToast === 'function' && plan.cost > 0) {
    showToast(lightRailT('lightRail.track.built', '起好輕鐵路軌：{parts}（${cost}）。', { parts: lightRailTrackSummary(plan.kinds), cost: plan.cost.toLocaleString() }), 'success');
  }
  return true;
}

// The bulldozer on light rail track: that tile's track taken up (a viaduct or a ramp tile alone), the
// road under street track or a crossing left. True when there was track there.
function demolishLightRailTrackAt(scene, row, col) {
  const state = getLightRailState();
  const key = railKey(row, col);
  if (!state.tracks[key]) return false;
  // not under a station (light-rail-lines.js: the bulldozer takes the station first)
  if (typeof isLightRailStationTile === 'function' && isLightRailStationTile(row, col)) return false;
  const next = { ...state.tracks };
  const nextElev = { ...state.trackElev };
  delete next[key];
  delete nextElev[key];
  state.tracks = next;
  state.trackElev = nextElev;
  lightRailTrackRevision += 1;
  syncLightRailTracks(scene);
  onLightRailTracksChanged(scene);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return true;
}

// While dragging: the tiles it would take, green or red, and what it lays and costs, or the reason.
function drawLightRailTrackDragPreview(scene, start, end, height = lightRailHeight) {
  const g = scene.bridgePreviewGraphic;
  if (!g) return;
  g.clear();
  const plan = planLightRailTrack(start, end, height);
  const color = plan.ok ? 0xf28c28 : 0xff4444;
  (plan.path || []).forEach(({ row, col }) => {
    if (!isInsideMap(row, col)) return;
    const geom = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
    const bad = plan.bad === railKey(row, col);
    g.fillStyle(bad ? 0xff4444 : color, bad ? 0.45 : 0.22);
    g.lineStyle(2, bad ? 0xff4444 : color, 0.9);
    g.beginPath();
    g.moveTo(geom.top.x, geom.top.y); g.lineTo(geom.right.x, geom.right.y);
    g.lineTo(geom.bottom.x, geom.bottom.y); g.lineTo(geom.left.x, geom.left.y);
    g.closePath(); g.fillPath(); g.strokePath();
  });
  if (typeof showUnderseaTunnelPreviewLabel === 'function') {
    const heightName = height === 'deck' ? lightRailT('lightRailHeight.deck', '高架') : lightRailT('lightRailHeight.ground', '地面');
    const text = `${heightName} · ${plan.ok
      ? lightRailT('lightRail.track.cost', '{parts} ${cost}', { parts: lightRailTrackSummary(plan.kinds) || lightRailT('lightRail.kind.none', '冇新路軌'), cost: plan.cost.toLocaleString() })
      : lightRailTrackRefusal(plan.reason)}`;
    const at = (plan.path || [])[(plan.path || []).length - 1] || end;
    showUnderseaTunnelPreviewLabel(scene, at.row, at.col, text, plan.ok);
  }
}

// ── Drawing ─────────────────────────────────────────────────────────────────────────────────────────

const LIGHT_RAIL_VIADUCT_TEXTURES = (() => {
  const out = [];
  ['x', 'y', 'upper', 'lower', 'left', 'right', 'cross_xy', 'parallel_horizontal', 'parallel_vertical'].forEach((n) => {
    out.push({ key: `lrt_viaduct_${n}_np`, path: `Models/lightRailViaduct/lrt_viaduct_${n}_np.png` });
  });
  [['x', ['n', 's']], ['y', ['w', 'e']]].forEach(([axis, ups]) => ups.forEach((up) => [1, 2, 3, 4].forEach((step) => {
    out.push({ key: `lrt_ramp_${axis}_${up}${step}`, path: `Models/lightRailViaduct/lrt_ramp_${axis}_${up}${step}.png` });
  })));
  for (let k = 1; k <= 18; k++) out.push({ key: `lrt_pier_${k}`, path: `Models/lightRailViaduct/lrt_pier_${k}.png` });
  return out;
})();

function loadLightRailViaductTextures(scene) {
  const wanted = LIGHT_RAIL_VIADUCT_TEXTURES.filter((tx) => !scene.textures.exists(tx.key));
  if (!wanted.length) return Promise.resolve(true);
  if (scene.__lightRailViaductLoading) return scene.__lightRailViaductLoading;
  scene.__lightRailViaductLoading = new Promise((resolve) => {
    const start = () => {
      wanted.forEach((tx) => scene.load.image(tx.key, typeof resolveModelAssetPath === 'function' ? resolveModelAssetPath(tx.path) : tx.path));
      scene.load.once('complete', () => { scene.__lightRailViaductLoading = null; resolve(true); });
      scene.load.start();
    };
    if (scene.load.isLoading()) scene.load.once('complete', start); else start();
  });
  return scene.__lightRailViaductLoading;
}

// An elevated tile's picture as the map is turned: the deck for its bits as drawn, the ramp for its
// axis and rising side as drawn.
function lightRailViaductTextureKey(mask, code) {
  const turn = typeof mapRotation === 'number' ? mapRotation : 0;
  if (railDeckLevel(code) != null) {
    const layout = typeof getRailwayTrackLayout === 'function' ? getRailwayTrackLayout(railVisualMask(mask, turn)) : null;
    return layout ? `${layout.asset.replace('metro_track_', 'lrt_viaduct_')}_np` : null;
  }
  const up = rotateDirection(code[1], turn);
  return `lrt_ramp_${up === 'n' || up === 's' ? 'x' : 'y'}_${up}${code[0]}`;
}

// The street track's lines, worked out as the tram's are (tram.js buildTramTrackGeometry), from the
// road tiles' track: a level crossing as a narrow road's straight (no reservation across a dual
// carriageway).
function getLightRailStreetGeometry(state = getLightRailState()) {
  const env = lightRailMapEnv();
  const street = {};
  const crossing = new Set();
  Object.entries(state.tracks).forEach(([k, mask]) => {
    if (state.trackElev[k]) return;
    const [r, c] = k.split(':').map(Number);
    if (!env.isRoad(r, c)) return;
    street[k] = mask;
    if (lightRailTileKind(r, c, mask, null, env) === 'crossing') crossing.add(k);
  });
  return buildTramTrackGeometry(street, (r, c) => (crossing.has(railKey(r, c)) ? null : lightRailBandAt(r, c)), lightRailIsRoad);
}

function syncLightRailTracks(scene = typeof activeScene !== 'undefined' ? activeScene : null) {
  if (!scene?.add || !scene.tileSprites || typeof getTransportExpansionState !== 'function') return;
  const state = getLightRailState();
  if (!scene.lightRailTrackSprites) scene.lightRailTrackSprites = new Map();
  if (!scene.lightRailPierSprites) scene.lightRailPierSprites = new Map();
  const env = lightRailMapEnv();
  const turn = typeof mapRotation === 'number' ? mapRotation : 0;
  // the viaduct's pictures and the reservation's paving, loaded the first time they are needed
  if (Object.keys(state.trackElev).length && LIGHT_RAIL_VIADUCT_TEXTURES.some((tx) => !scene.textures.exists(tx.key))) {
    loadLightRailViaductTextures(scene).then(() => syncLightRailTracks(scene));
  }
  const geo = getLightRailStreetGeometry(state);
  if ([...geo.tiles.values()].some((c) => c.paving) && typeof TRAM_PAVING_TEXTURES !== 'undefined'
    && TRAM_PAVING_TEXTURES.some((tx) => !scene.textures.exists(tx.key))) {
    loadTramTrackTextures(scene).then(() => syncLightRailTracks(scene));
    return;
  }
  const wanted = new Set();
  const piers = new Set();
  const pictures = new Set();
  const spriteFor = (key, texture, layerName) => {
    let sprite = scene.lightRailTrackSprites.get(key);
    if (sprite && sprite.__layerName !== layerName) { sprite.destroy(); sprite = null; }
    if (!sprite) {
      sprite = scene.add.image(0, 0, texture);
      addToRenderLayer(scene, sprite, layerName);
      if (typeof markMetroNight === 'function') markMetroNight(sprite, layerName);
      if (scene.worldMask) sprite.setMask(scene.worldMask);
      sprite.__layerName = layerName;
      scene.lightRailTrackSprites.set(key, sprite);
    } else if (sprite.texture.key !== texture) sprite.setTexture(texture);
    sprite.setVisible(true);
    wanted.add(key);
    return sprite;
  };
  // street track and level crossings: drawn on their road tiles as the tram's is (a crossing's with its
  // concrete panel and stop lines under the rails)
  const crossings = new Map(getLightRailCrossings().map((x) => [railKey(x.row, x.col), x]));
  geo.tiles.forEach((cell, key) => {
    const road = getTileSprite(scene, cell.row, cell.col);
    if (!road) return;
    const picture = tramTilePicture(geo, cell, turn);
    const xing = crossings.get(key);
    // (its own keys: the tram drops the pictures its own tiles no longer show)
    picture.key = xing ? `lrt_xing_${xing.axis}${xing.band ? 'b' : ''}_${turn}_${picture.key}` : `lrt_${picture.key}`;
    if (!scene.textures.exists(picture.key)) {
      if (xing) drawLightRailCrossingPicture(scene, picture, cell, turn, xing);
      else drawTramTrackPicture(scene, picture);
    }
    pictures.add(picture.key);
    const sprite = spriteFor(key, picture.key, 'roadLayer');
    sprite.__deckLiftPx = 0;
    sprite.setOrigin(road.originX, road.originY).setScale(road.scaleX, road.scaleY).setPosition(road.x, road.y);
    sprite.setDepth(road.depth + 0.5);
    if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
  });
  // open ground, viaducts and ramps
  Object.entries(state.tracks).forEach(([key, mask]) => {
    const [row, col] = key.split(':').map(Number);
    const code = state.trackElev[key];
    const kind = lightRailTileKind(row, col, mask, code, env);
    if (kind === 'street' || kind === 'crossing') return;
    const face = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
    const viaductOrigin = (sprite) => sprite.setOrigin(METRO_VIADUCT_ART.centre[0] / METRO_VIADUCT_ART.width, METRO_VIADUCT_ART.centre[1] / METRO_VIADUCT_ART.height);
    if (kind === 'ground') {
      const edges = metroOpenEdges(row, col);
      const slopeUp = edges.length === 1 ? rotateDirection(RAIL_OPPOSITE[edges[0]], turn) : null;
      const texture = slopeUp ? `metro_track_slope_${slopeUp}` : metroTrackTextureKey(mask);
      if (slopeUp && !scene.textures.exists(texture) && typeof loadMetroViaductTextures === 'function') {
        loadMetroViaductTextures(scene).then(() => syncLightRailTracks(scene));
      }
      if (!texture || !scene.textures.exists(texture)) return;
      const sprite = spriteFor(key, texture, 'roadLayer');
      sprite.__deckLiftPx = 0;
      sprite.setScale(TILE_WIDTH / RAILWAY_TRACK_TILE.width).setPosition(face.center.x, face.center.y);
      if (slopeUp) viaductOrigin(sprite); else sprite.setOrigin(0.5, 0.5);
      sprite.setDepth(getWorldDepth('road', face.center.y + 1));
      if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
      return;
    }
    const texture = lightRailViaductTextureKey(mask, code);
    if (!texture || !scene.textures.exists(texture)) return;
    const sprite = spriteFor(key, texture, 'objectLayer');
    sprite.setScale(TILE_WIDTH / 512);
    viaductOrigin(sprite);
    sprite.setDepth(getBuildingSortDepth(metroTileTopY(row, col), 1, 1, 0));
    if (kind === 'deck') {
      // the deck at its level (its picture is drawn two levels up), its piers down to the ground
      const deck = railDeckLevel(code);
      const flat = metroFlatTileCentre(scene, row, col);
      sprite.setPosition(flat.x, flat.y - (deck - LIGHT_RAIL_SPEC.deckLevels) * metroLevelPx());
      sprite.__deckLiftPx = deck * metroLevelPx();
      if (!metroDeckSpansRoad(row, col, mask)) syncLightRailPiers(scene, key, row, col, mask, deck, sprite.depth - 0.001, piers);
    } else {
      sprite.__deckLiftPx = 0;
      sprite.setPosition(face.center.x, face.center.y);
    }
    if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
  });
  scene.lightRailTrackSprites.forEach((sprite, key) => { if (!wanted.has(key)) { sprite.destroy(); scene.lightRailTrackSprites.delete(key); } });
  scene.lightRailPierSprites.forEach((sprite, id) => { if (!piers.has(id)) { sprite.destroy(); scene.lightRailPierSprites.delete(id); } });
  (scene.__lightRailPictures || new Set()).forEach((k) => { if (!pictures.has(k) && scene.textures.exists(k)) scene.textures.remove(k); });
  scene.__lightRailPictures = pictures;
  scene.__lightRailTrackSyncKey = lightRailTrackSyncKey(scene);
}

// A level crossing's picture: the road tile's face with a concrete panel along the track (its width
// either side), the stop lines across the lanes coming in (Hong Kong keeps left), and the rails over.
// Drawn in the map's frame and turned to the tile as drawn (tram.js tramTileLocal).
function drawLightRailCrossingPicture(scene, picture, cell, turn, xing) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(256, 49); ctx.lineTo(416, 129); ctx.lineTo(256, 209); ctx.lineTo(96, 129);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(160, 80, -160, 80, 256, 49);
  const L = (x, y) => tramTileLocal(cell.col + x, cell.row + y, cell.row, cell.col, turn);
  const poly = (pts, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    pts.map(([x, y]) => L(x, y)).forEach(([u, v], i) => (i ? ctx.lineTo(u, v) : ctx.moveTo(u, v)));
    ctx.closePath();
    ctx.fill();
  };
  const line = (a, b, style, width) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    const [u0, v0] = L(...a), [u1, v1] = L(...b);
    ctx.moveTo(u0, v0); ctx.lineTo(u1, v1);
    ctx.stroke();
  };
  // (the road runs along x for 'ew': the track across it, along y)
  const ew = xing.axis === 'ew';
  const P = (along, across) => (ew ? [across, along] : [along, across]);   // along the track, across it
  const H = 0.18;
  poly([P(0, 0.5 - H), P(1, 0.5 - H), P(1, 0.5 + H), P(0, 0.5 + H)], 'rgba(170, 166, 158, 0.96)');
  // its slabs' joints, and a darker edge each side
  for (let k = 1; k < 5; k++) line(P(k / 5, 0.5 - H), P(k / 5, 0.5 + H), 'rgba(120, 116, 110, 0.55)', 0.006);
  [-1, 1].forEach((sg) => line(P(0, 0.5 + sg * H), P(1, 0.5 + sg * H), 'rgba(90, 88, 84, 0.8)', 0.008));
  // the stop lines (narrow roads: the lanes 0.25 - 0.75 across the tile), on the near-side lanes coming in
  if (!xing.band) {
    const S = 0.28;
    if (ew) {
      // eastbound (from x < 0.5) keeps to y < 0.5; westbound to y > 0.5
      line([0.5 - S, 0.25], [0.5 - S, 0.5], 'rgba(238, 238, 232, 0.95)', 0.022);
      line([0.5 + S, 0.5], [0.5 + S, 0.75], 'rgba(238, 238, 232, 0.95)', 0.022);
    } else {
      // southbound (from y < 0.5) keeps to x > 0.5; northbound to x < 0.5
      line([0.5, 0.5 - S], [0.75, 0.5 - S], 'rgba(238, 238, 232, 0.95)', 0.022);
      line([0.25, 0.5 + S], [0.5, 0.5 + S], 'rgba(238, 238, 232, 0.95)', 0.022);
    }
  }
  // the rails (as the tram's)
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  const stroke = (pts, style) => {
    ctx.strokeStyle = style.colour;
    ctx.lineWidth = style.half * 2;
    ctx.beginPath();
    pts.forEach(([u, v], i) => (i ? ctx.lineTo(u, v) : ctx.moveTo(u, v)));
    ctx.stroke();
  };
  const { bed, groove, head } = TRAM_RAIL_STYLE;
  picture.curves.forEach((pts) => stroke(pts, bed));
  [groove, head].forEach((style) => picture.curves.forEach((pts) => [-1, 1].forEach((sg) => stroke(tramOffsetLine(pts, sg * style.at), style))));
  ctx.restore();
  scene.textures.addCanvas(picture.key, canvas);
}

// A deck's piers (its pictures have none): under the middle of each track's line on the tile, as
// drawn, down to the ground there (metro-surface.js syncMetroPiers, the light rail's slimmer ones).
function syncLightRailPiers(scene, key, row, col, mask, deck, depth, wanted) {
  const spots = new Map();
  railBitsOf(railVisualMask(mask)).forEach((bit) => {
    const at = { 1: [10, 10], 2: [10, 10], 4: [5, 5], 8: [15, 15], 16: [5, 15], 32: [15, 5] }[bit];
    spots.set(at.join(), at);
  });
  const flat = metroFlatTileCentre(scene, row, col);
  const ground = metroGroundMetresAt(key, null);
  const half = METRO_RAIL.hillLevelMetres / 2;
  const k = Math.max(1, Math.min(18, Math.round((deck * METRO_RAIL.hillLevelMetres - ground) / half)));
  const texture = `lrt_pier_${k}`;
  if (!scene.textures.exists(texture)) return;
  [...spots.values()].forEach(([c, r], i) => {
    const id = `${key}|${i}`;
    wanted.add(id);
    let sprite = scene.lightRailPierSprites.get(id);
    if (!sprite) {
      sprite = scene.add.image(0, 0, texture);
      addToRenderLayer(scene, sprite, 'objectLayer');
      if (typeof markMetroNight === 'function') markMetroNight(sprite, 'objectLayer');
      if (scene.worldMask) sprite.setMask(scene.worldMask);
      scene.lightRailPierSprites.set(id, sprite);
    } else if (sprite.texture.key !== texture) sprite.setTexture(texture);
    const src = scene.textures.get(texture).getSourceImage();
    sprite.setOrigin(0.5, (src.height - 22) / src.height);
    sprite.setScale(TILE_WIDTH / 512);
    sprite.setPosition(flat.x + (c - r) * (TILE_WIDTH / 2) / 20, flat.y + (c + r - 20) * (TILE_HEIGHT / 2) / 20 - ground * 10 * (TILE_WIDTH / 512));
    sprite.setDepth(depth);
    if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
  });
}

function clearLightRailTrackSprites(scene) {
  scene?.lightRailTrackSprites?.forEach((sprite) => sprite.destroy());
  scene?.lightRailPierSprites?.forEach((sprite) => sprite.destroy());
  if (scene) { scene.lightRailTrackSprites = new Map(); scene.lightRailPierSprites = new Map(); scene.__lightRailTrackSyncKey = null; }
}

const lightRailStateIds = new WeakMap();
let lightRailStateNextId = 1;

// Drawn again when the track, the roads, the map's turn or its place change (each frame's check).
function lightRailTrackSyncKey(scene) {
  const tracks = getLightRailState().tracks;
  if (!lightRailStateIds.has(tracks)) lightRailStateIds.set(tracks, lightRailStateNextId++);
  return [lightRailStateIds.get(tracks), lightRailTrackRevision, typeof roadTileCount !== 'undefined' ? roadTileCount : 0,
    typeof mapRotation === 'number' ? mapRotation : 0, scene.offsetX, scene.offsetY].join('|');
}

function updateLightRail(scene, delta = 16) {
  if (!scene?.add || typeof getTransportExpansionState !== 'function') return;
  const tracks = getTransportExpansionState()?.lightRail?.tracks;
  if ((tracks && Object.keys(tracks).length) || scene.lightRailTrackSprites?.size) {
    if (scene.__lightRailTrackSyncKey !== lightRailTrackSyncKey(scene)) syncLightRailTracks(scene);
  }
  // the stations, the lines' cars (light-rail-lines.js)
  if (typeof updateLightRailService === 'function') updateLightRailService(scene, delta);
}

// The track's upkeep for the company's month.
function getLightRailTrackMonthlyUpkeep() {
  if (typeof getTransportExpansionState !== 'function') return 0;
  return Object.keys(getTransportExpansionState()?.lightRail?.tracks || {}).length * LIGHT_RAIL.monthlyUpkeepPerTile;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LIGHT_RAIL, LIGHT_RAIL_SPEC, normalizeLightRailState, lightRailRoadAxis, lightRailCrossesRoad, lightRailTileKind,
    planLightRailTrackPure, buildLightRailGeometry, lightRailHeightAt, lightRailInTrafficAt, whyNotLightRailStationAt,
    isLightRailUnlocked, grantLightRailFunding, spendLightRailFunds,
  };
}
