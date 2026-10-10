// 渡海小輪 (docs/star-ferry-design.md): ferry piers on the shore, routes between them and Star
// Ferries sailing the water path. Phase 1: piers, routes and sailing; no passengers or fares yet.
//
// The state lives in the transport company's (transport-expansion.js `ferry`), one company for the
// buses and the ferries (Norton, 2026-10-09). Piers are drawn with the typhoon shelter's object
// sprites (real size, the view that faces the shore, turned with the map); the ferries with its
// boat sprites. A ferry's position is worked out from the clock, as the shelter boats' are: nothing
// moving is stored, so a reload or a fast-forward never drifts.

const FERRY = Object.freeze({
  pierCols: 2,
  pierRows: 2,
  pierCost: 2500,
  pierLengthM: 28,            // drawn across the 2 x 2 lot's middle, straddling the shoreline
  roadReach: 3,               // a road within this many tiles of the pier's land side
  bridgeClearance: 2,         // no bridge within this many tiles of a pier's lot, either way round
  speedTilesPerMinute: 1,     // sky minutes (getTyphoonShelterFleetClock)
  dwellMinutes: 5,            // alongside each pier
  turnCost: 4,                // tiles: the water path keeps to long straight runs
  lengthTiles: 1.5,           // 30 m (Norton, 2026-10-09: drawn a little under the real 40 m, to sit with the city)
  beamTiles: 0.34,            // its beam, at the same scale
  berthGapTiles: 0.25,        // ~5 m off the pier's 28 m face: its tyre fenders stand out past it
  outTiles: 1,                // beyond its outer end it turns onto the route
  maxRoutes: 24,
  capacity: 400,              // passengers a ferry carries
  // flat fare per passenger (the Star Ferry's), in company dollars: what a bus rider pays for about
  // 20 tiles at the default fare (35 x 20 x TRANSPORT_FARE_ECONOMY_SCALE)
  fare: 0.1,
  // homes within this many tiles of the pier's shore side ride - a 10-tile circle - and only on its
  // own shore: reached over land from the pier, never across the water (Norton, 2026-10-10)
  catchmentRadius: 5,
  boardingShare: 3,           // times a bus stop's daily share: a crossing saves the long way round by road
  minZoom: 0.4,               // below this the ferries are a few pixels long: not drawn
  // the company's side (docs/star-ferry-design.md §3): a ferry costs three double-deckers; the
  // upkeep is a month's, the running cost per tile sailed; a pier has its own upkeep
  vesselPrice: 900,
  vesselMonthlyUpkeep: 30,
  tileRunningCost: 0.002,
  pierMonthlyUpkeep: 25,
  maxVesselsPerRoute: 6,
  objectId: 'starFerry',
  pierObjectId: 'ferryPier',
});

const FERRY_DIRS = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });
const FERRY_OPPOSITE = Object.freeze({ n: 's', s: 'n', e: 'w', w: 'e' });
// The two ways along a pier's face, by its shore side.
const FERRY_ALONG = Object.freeze({ n: ['w', 'e'], s: ['w', 'e'], e: ['n', 's'], w: ['n', 's'] });
// A Star Ferry never turns round - it is double-ended and simply sails the other way. So one view
// per axis whichever way along it it goes: drawn by the axis, not the heading (n and s alike, e and w).
const FERRY_DRAW_HEADING = Object.freeze({ n: 'n', s: 'n', e: 'e', w: 'e' });

const FERRY_ROUTE_COLORS = Object.freeze(['#1f8a5b', '#c2412d', '#2f6db3', '#c79a1c', '#7a4fb3', '#178a96']);

function ferryT(key, fallback, vars = {}) {
  if (typeof t !== 'function') return fallback.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const out = t(key, vars);
  return out && out !== key ? out : fallback.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

// ── State ─────────────────────────────────────────────────────────────────────

function normalizeFerryState(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const piers = (Array.isArray(src.piers) ? src.piers : []).map((p) => {
    const row = Math.floor(Number(p?.row)); const col = Math.floor(Number(p?.col));
    if (!p?.id || !Number.isFinite(row) || !Number.isFinite(col) || !FERRY_DIRS[p.land]) return null;
    return { id: String(p.id).slice(0, 40), row, col, land: p.land, name: String(p.name || '').slice(0, 40),
      // its queue: fractional, so a quiet pier's few riders an hour still add up
      waiting: Math.max(0, Math.min(9999, Number(p.waiting) || 0)),
      // riders held back by a storm signal (as for bus stops, transport-expansion.js)
      stormBacklog: Math.max(0, Math.min(9999, Number(p.stormBacklog) || 0)) };
  }).filter(Boolean);
  const pierIds = new Set(piers.map((p) => p.id));
  const legacyFleet = new Map();   // a save from before the fleet: route id -> [ferries' passengers aboard]
  const routes = (Array.isArray(src.routes) ? src.routes : []).map((r, i) => {
    const ids = (Array.isArray(r?.pierIds) ? r.pierIds : []).map(String).filter((id) => pierIds.has(id));
    if (!r?.id || ids.length < 2) return null;
    const id = String(r.id).slice(0, 40);
    if (!Array.isArray(src.vessels)) {
      const n = Math.max(0, Math.min(FERRY.maxVesselsPerRoute, Math.floor(Number(r.vessels ?? 1))));
      legacyFleet.set(id, Array.from({ length: n }, (_, k) => Number(r.aboard?.[k]) || 0));
    }
    return {
      id,
      pierIds: ids.slice(0, 2),
      color: typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : FERRY_ROUTE_COLORS[i % FERRY_ROUTE_COLORS.length],
      status: r.status === 'suspended' ? 'suspended' : 'active',
      // the month's takings so far (settleFerryMonth), and the months before
      monthToDatePassengers: Math.max(0, Math.floor(Number(r.monthToDatePassengers) || 0)),
      monthToDateRevenue: Math.max(0, Number(r.monthToDateRevenue) || 0),
      history: (Array.isArray(r.history) ? r.history : []).slice(-24).map((h) => ({
        year: Math.floor(Number(h?.year) || 0), month: Math.floor(Number(h?.month) || 0),
        passengers: Math.max(0, Math.floor(Number(h?.passengers) || 0)),
        revenue: Number(h?.revenue) || 0, cost: Number(h?.cost) || 0, net: Number(h?.net) || 0,
      })),
    };
  }).filter(Boolean);
  const routeIds = new Set(routes.map((r) => r.id));
  let nextVesselId = Math.max(1, Math.floor(Number(src.nextVesselId) || 1));
  let vessels;
  if (Array.isArray(src.vessels)) {
    vessels = src.vessels.map((v) => normalizeFerryVessel(v, routeIds)).filter(Boolean);
  } else {
    // spaced evenly round the timetable, as they sailed before
    vessels = [];
    legacyFleet.forEach((aboard, routeId) => aboard.forEach((n, k) => vessels.push(normalizeFerryVessel({
      id: `ferry-${nextVesselId++}`, routeId, phase: k / aboard.length, aboard: n, purchasePrice: FERRY.vesselPrice,
    }, routeIds))));
  }
  const used = vessels.map((v) => Number(String(v.id).replace(/^ferry-/, '')) || 0);
  nextVesselId = Math.max(nextVesselId, ...used.map((n) => n + 1));
  const surge = Number(src.stormSurgeHour);
  return {
    piers, routes, vessels, nextId: Math.max(1, Math.floor(Number(src.nextId) || 1)), nextVesselId,
    // the hour a storm's held-back riders last reached the piers (accrueFerryPiersForHour)
    stormSurgeHour: src.stormSurgeHour !== null && Number.isInteger(surge) && surge >= 0 && surge < 24 ? surge : null,
  };
}

// One ferry of the company's (a Star Ferry): its place in its route's timetable (`phase`, the share
// of a round trip it runs ahead of the clock), its worth and wear, and what it is doing.
function normalizeFerryVessel(v, routeIds) {
  if (!v?.id || !routeIds.has(String(v.routeId))) return null;
  const num = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);
  const status = ['active', 'servicing', 'broken_down'].includes(v.status) ? v.status : 'active';
  return {
    id: String(v.id).slice(0, 40),
    routeId: String(v.routeId),
    phase: ((num(v.phase) % 1) + 1) % 1,
    purchasePrice: Math.max(0, num(v.purchasePrice, FERRY.vesselPrice)),
    condition: Math.max(0, Math.min(1, num(v.condition, 1))),
    minutesSinceService: Math.max(0, num(v.minutesSinceService)),
    status,
    // off the timetable since this sky minute (in the yard, or broken down where it lay), and for how
    // much longer: on its return it carries on from where it stopped
    downStartedAt: status === 'active' ? null : num(v.downStartedAt),
    downMinutesRemaining: status === 'active' ? 0 : Math.max(0, num(v.downMinutesRemaining)),
    sellAtNextPier: !!v.sellAtNextPier,
    aboard: Math.max(0, Math.min(FERRY.capacity, Math.floor(num(v.aboard)))),
    ageMonths: Math.max(0, Math.floor(num(v.ageMonths))),
    tilesThisMonth: Math.max(0, num(v.tilesThisMonth)),
    monthToDateRevenue: Math.max(0, num(v.monthToDateRevenue)),
    lastMonthRevenue: Math.max(0, num(v.lastMonthRevenue)),
  };
}

function getFerryState() {
  const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
  if (!transport) return normalizeFerryState(null);
  if (!transport.ferry) transport.ferry = normalizeFerryState(null);
  return transport.ferry;
}

// ── Piers ─────────────────────────────────────────────────────────────────────

function ferryPierTiles(row, col) {
  const out = [];
  for (let r = row; r < row + FERRY.pierRows; r++) for (let c = col; c < col + FERRY.pierCols; c++) out.push([r, c]);
  return out;
}

// The two tiles just outside the lot on side `dir`.
function ferryPierSideTiles(row, col, dir) {
  if (dir === 'n') return [[row - 1, col], [row - 1, col + 1]];
  if (dir === 's') return [[row + FERRY.pierRows, col], [row + FERRY.pierRows, col + 1]];
  if (dir === 'w') return [[row, col - 1], [row + 1, col - 1]];
  return [[row, col + FERRY.pierCols], [row + 1, col + FERRY.pierCols]];
}

// The half of the lot on side `dir` (the two tiles of the lot nearest it).
function ferryPierHalfTiles(row, col, dir) {
  if (dir === 'n') return [[row, col], [row, col + 1]];
  if (dir === 's') return [[row + 1, col], [row + 1, col + 1]];
  if (dir === 'w') return [[row, col], [row + 1, col]];
  return [[row, col + 1], [row + 1, col + 1]];
}

/**
 * Whether a pier may stand with its top corner at (row, col). Pure. It straddles the shoreline:
 * the lot's half on one side is the shore (sand or flat ground at the water's edge), the other half
 * water, with open water beyond for the ferry and a road near the shore.
 * ctx: { isInside(r, c), isWater(r, c), isShore(r, c) (flat free land), isRoad(r, c), isBlocked(r, c) }
 * Returns { land } (the shore side, n/e/s/w) or { code }: 'outside', 'occupied', 'notShore' (no half
 * on the shore with the other on the water), 'nearBridge' (a bridge within FERRY.bridgeClearance
 * tiles, when ctx.isBridge is given), 'noSea' (no open water three tiles out) or 'noRoad'.
 */
function whyNotFerryPierAt(row, col, ctx) {
  for (const [r, c] of ferryPierTiles(row, col)) {
    if (!ctx.isInside(r, c)) return { code: 'outside' };
    if (ctx.isBlocked(r, c)) return { code: 'occupied' };
  }
  // a span close by would hide the ferries at the berths (bridges draw below every object)
  if (ctx.isBridge) {
    const k = FERRY.bridgeClearance;
    for (let r = row - k; r < row + FERRY.pierRows + k; r++) {
      for (let c = col - k; c < col + FERRY.pierCols + k; c++) if (ctx.isInside(r, c) && ctx.isBridge(r, c)) return { code: 'nearBridge' };
    }
  }
  const shores = ['n', 'e', 's', 'w'].filter((dir) => ferryPierHalfTiles(row, col, dir).every(([r, c]) => ctx.isShore(r, c))
    && ferryPierHalfTiles(row, col, FERRY_OPPOSITE[dir]).every(([r, c]) => ctx.isWater(r, c)));
  if (!shores.length) return { code: 'notShore' };
  let failure = 'noSea';
  for (const land of shores) {
    // the berths and the way out: open water three tiles out from the lot's sea face (no bridge
    // over it - a span in front of the berth would hide the ferry lying there)
    const [dr, dc] = FERRY_DIRS[FERRY_OPPOSITE[land]];
    const sea = [1, 2, 3].flatMap((k) => ferryPierSideTiles(row, col, FERRY_OPPOSITE[land]).map(([r, c]) => [r + dr * (k - 1), c + dc * (k - 1)]));
    if (!sea.every(([r, c]) => ctx.isInside(r, c) && ctx.isWater(r, c) && !ctx.isBlocked(r, c))) continue;
    failure = 'noRoad';
    const near = ferryPierHalfTiles(row, col, land).some(([lr, lc]) => {
      for (let r = lr - FERRY.roadReach; r <= lr + FERRY.roadReach; r++) {
        for (let c = lc - FERRY.roadReach; c <= lc + FERRY.roadReach; c++) if (ctx.isInside(r, c) && ctx.isRoad(r, c)) return true;
      }
      return false;
    });
    if (near) return { land };
  }
  return { code: failure };
}

// The berths: a ferry lies side-on along one of the pier's flanks - the two faces running out from
// the shore - square to the coastline, its gangway to the pier. Star Ferry piers have berthed them
// alongside since 1907 (Gwulo: "go alongside and berth parallel to the quay wall"). [{ side,
// berth: { r, c, dir }, point, tile }] for the flank on each side: `berth` its centre (its inner
// end at the shoreline), `point` straight out to sea past its outer end, where it turns onto the
// route, `tile` the water tile there.
function ferryBerthEnds(pier, berthOffset = null) {
  const sea = FERRY_OPPOSITE[pier.land];
  const [sr, sc] = FERRY_DIRS[sea];
  return FERRY_ALONG[pier.land].map((flank) => {
    // the 渡輪泊位校正 tool's nudge for this berth, in metres: further off the pier, further out
    const nudge = berthOffset ? berthOffset(pier, flank) : null;
    const out = FERRY.lengthTiles / 2 + FERRY.berthGapTiles + (Number(nudge?.outM) || 0) / 20;
    const side = FERRY.pierLengthM / 2 / 20 + FERRY.beamTiles / 2 + FERRY.berthGapTiles + (Number(nudge?.gapM) || 0) / 20;
    const [fr, fc] = FERRY_DIRS[flank];
    const berth = { r: pier.row + 0.5 + sr * out + fr * side, c: pier.col + 0.5 + sc * out + fc * side, dir: sea };
    const reach = FERRY.lengthTiles / 2 + FERRY.outTiles;
    const point = { r: berth.r + sr * reach, c: berth.c + sc * reach };
    return { side: flank, berth, point, tile: [Math.round(point.r), Math.round(point.c)] };
  });
}

// The first berth (the tests' and the inspector's reference).
function ferryBerthPoint(pier) {
  return ferryBerthEnds(pier)[0].berth;
}

// ── Water paths ───────────────────────────────────────────────────────────────

/**
 * The cheapest water path from one pier to another: 4-connected, each turn costing FERRY.turnCost
 * tiles so it sails in long straight runs. Pure. passable(r, c) for open water; height/width the
 * map's. Returns [[r, c], ...] from one of A's berth ends to one of B's, or null.
 */
function findFerryPath(from, to, passable, height, width, berthOffset = null) {
  const starts = ferryBerthEnds(from, berthOffset).filter(({ tile: [r, c] }) => passable(r, c));
  const goals = new Set(ferryBerthEnds(to, berthOffset).filter(({ tile: [r, c] }) => passable(r, c)).map(({ tile: [r, c] }) => r * width + c));
  if (!starts.length || !goals.size) return null;
  const dirs = ['n', 'e', 's', 'w'];
  const N = height * width * 4;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap = [];
  const push = (d, s) => {
    heap.push([d, s]); let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0]; const last = heap.pop();
    if (heap.length) {
      heap[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1; const r = l + 1; let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  // straight out to sea from the berth it leaves
  const leave = dirs.indexOf(FERRY_OPPOSITE[from.land]);
  starts.forEach(({ tile: [r, c] }) => { const s = (r * width + c) * 4 + leave; dist[s] = 0; push(0, s); });
  let found = -1;
  while (heap.length) {
    const [d, s] = pop();
    if (d > dist[s]) continue;
    const cell = s >> 2; const di = s & 3;
    if (goals.has(cell)) { found = s; break; }
    const r = Math.floor(cell / width); const c = cell % width;
    for (let ni = 0; ni < 4; ni++) {
      const [dr, dc] = FERRY_DIRS[dirs[ni]];
      const nr = r + dr; const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= height || nc >= width || !passable(nr, nc)) continue;
      const ns = (nr * width + nc) * 4 + ni;
      const nd = d + 1 + (ni === di ? 0 : FERRY.turnCost);
      if (nd < dist[ns]) { dist[ns] = nd; prev[ns] = s; push(nd, ns); }
    }
  }
  if (found < 0) return null;
  const path = [];
  for (let s = found; s >= 0; s = prev[s]) {
    const cell = s >> 2;
    const last = path[path.length - 1];
    const r = Math.floor(cell / width); const c = cell % width;
    if (!last || last[0] !== r || last[1] !== c) path.push([r, c]);
  }
  return path.reverse();
}

// A leg as a polyline: alongside A's flank, straight out to sea, the path, straight in alongside
// B's. { points, lengths, total, from, to } - from/to the berths used, each heading the way the
// ferry leaves A (out to sea) and lies at B (in from it): square to the shore either way.
function ferryLeg(from, to, path, berthOffset = null) {
  const same = (t, p) => p && t[0] === p[0] && t[1] === p[1];
  const endsA = ferryBerthEnds(from, berthOffset);
  const endsB = ferryBerthEnds(to, berthOffset);
  const endA = endsA.find((e) => same(e.tile, path[0])) || endsA[0];
  const endB = endsB.find((e) => same(e.tile, path[path.length - 1])) || endsB[0];
  const a = endA.berth;
  const b = endB.berth;
  const points = [[a.r, a.c], [endA.point.r, endA.point.c], ...path.slice(1, -1).map(([r, c]) => [r, c]),
    [endB.point.r, endB.point.c], [b.r, b.c]];
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  return { points, lengths, total: lengths[lengths.length - 1], from: { ...a, dir: FERRY_OPPOSITE[from.land] }, to: { ...b, dir: to.land } };
}

function ferryHeading(dr, dc, fallback) {
  if (Math.abs(dr) < 1e-9 && Math.abs(dc) < 1e-9) return fallback;
  return Math.abs(dr) >= Math.abs(dc) ? (dr > 0 ? 's' : 'n') : (dc > 0 ? 'e' : 'w');
}

// The point `d` tiles along a leg, heading the way it goes.
function ferryPointAlong(leg, d) {
  const { points, lengths } = leg;
  const x = Math.max(0, Math.min(leg.total, d));
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < x) i++;
  const seg = lengths[i] - lengths[i - 1] || 1;
  const k = (x - lengths[i - 1]) / seg;
  const [r0, c0] = points[i - 1]; const [r1, c1] = points[i];
  return { r: r0 + (r1 - r0) * k, c: c0 + (c1 - c0) * k, dir: ferryHeading(r1 - r0, c1 - c0, leg.from.dir) };
}

/**
 * Where ferry `index` of `count` on a route is at clock minute `t`. Pure: legs { out, back } are
 * ferryLeg()s. The ferries share one timetable, evenly apart: alongside A, across, alongside B,
 * back. Returns { r, c, dir, state: 'alongside'|'sailing', pier: 0|1|null }.
 */
// A round trip in clock minutes: alongside A, across, alongside B, back.
function ferryCycleMinutes(legs) {
  return 2 * FERRY.dwellMinutes + (legs.out.total + legs.back.total) / FERRY.speedTilesPerMinute;
}

// Where a ferry `phase` of a round trip ahead of the clock is at clock minute t.
function ferryVesselPointAt(legs, t, phase = 0) {
  const speed = FERRY.speedTilesPerMinute;
  const dwell = FERRY.dwellMinutes;
  const outT = legs.out.total / speed;
  const cycle = ferryCycleMinutes(legs);
  let p = ((t + cycle * phase) % cycle + cycle) % cycle;
  if (p < dwell) return { ...legs.out.from, state: 'alongside', pier: 0 };
  p -= dwell;
  if (p < outT) return { ...ferryPointAlong(legs.out, p * speed), state: 'sailing', pier: null };
  p -= outT;
  if (p < dwell) return { ...legs.out.to, state: 'alongside', pier: 1 };
  p -= dwell;
  return { ...ferryPointAlong(legs.back, p * speed), state: 'sailing', pier: null };
}

// The `index`-th of `count` ferries spaced evenly round the timetable.
function ferryVesselPoint(legs, t, index = 0, count = 1) {
  return ferryVesselPointAt(legs, t, index / Math.max(1, count));
}

/**
 * The berthings in clock minutes (t0, t1] of ferries at the given phases, in order. Pure.
 * [{ t, vessel (index into phases), pier: 0|1 }] - a ferry berths at A at the start of each round
 * trip and at B when the outward leg ends.
 */
function ferryArrivalsAt(legs, t0, t1, phases) {
  const dwell = FERRY.dwellMinutes;
  const outT = legs.out.total / FERRY.speedTilesPerMinute;
  const cycle = ferryCycleMinutes(legs);
  const out = [];
  if (!(t1 > t0) || !(cycle > 0)) return out;
  phases.forEach((phaseShare, v) => {
    const offset = cycle * phaseShare;
    for (const [pier, phase] of [[0, 0], [1, dwell + outT]]) {
      // t + offset = k * cycle + phase
      for (let k = Math.floor((t0 + offset - phase) / cycle) + 1; ; k++) {
        const t = k * cycle + phase - offset;
        if (t > t1) break;
        if (t > t0) out.push({ t, vessel: v, pier });
      }
    }
  });
  return out.sort((a, b) => a.t - b.t || a.vessel - b.vessel);
}

// The same for `count` ferries spaced evenly.
function ferryArrivals(legs, t0, t1, count = 1) {
  const n = Math.max(1, count);
  return ferryArrivalsAt(legs, t0, t1, Array.from({ length: n }, (_, v) => v / n));
}

// Where a new ferry joins a timetable: in the middle of the widest gap between those already on it,
// so none of them has to move.
function ferryJoiningPhase(phases) {
  if (!phases.length) return 0;
  const sorted = [...phases].sort((a, b) => a - b);
  let best = { gap: -1, at: 0 };
  sorted.forEach((p, i) => {
    const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 1;
    if (next - p > best.gap) best = { gap: next - p, at: (p + (next - p) / 2) % 1 };
  });
  return best.at;
}

/**
 * A ferry berths: everyone aboard (from the other pier) goes ashore and pays the flat fare, then
 * the pier's queue boards up to the capacity. Pure. Returns { alighting, boarding, revenue }.
 */
function ferryBerthing(aboard, waiting) {
  const alighting = Math.max(0, Math.floor(aboard || 0));
  const boarding = Math.min(Math.max(0, Math.floor(waiting || 0)), FERRY.capacity);
  return { alighting, boarding, revenue: alighting * FERRY.fare };
}

// ── In the game ───────────────────────────────────────────────────────────────

// 渡輪泊位校正 (ferry-berth-calibrator.js): a nudge per berth as drawn - by which way the pier's
// shore side faces on screen (that picks its art) and which side of it the berth lies on screen,
// `${shoreFacing}|left|right` -> { gapM, outM }. Shipped in data/ferry-berths.json.
const FERRY_BERTHS_URL = 'data/ferry-berths.json';
let ferryBerthCalibration = {};
let ferryBerthRevision = 0;

function setFerryBerthCalibration(berths) {
  ferryBerthCalibration = {};
  Object.entries(berths && typeof berths === 'object' ? berths : {}).forEach(([key, v]) => {
    const gapM = Number(v?.gapM) || 0; const outM = Number(v?.outM) || 0;
    if (gapM || outM) ferryBerthCalibration[key] = { gapM, outM };
  });
  ferryBerthRevision += 1;
}

function getFerryBerthCalibration() { return { ...ferryBerthCalibration }; }

function loadFerryBerths() {
  if (typeof fetch !== 'function') return Promise.resolve();
  return fetch(`${FERRY_BERTHS_URL}?v=${Date.now()}`, { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => { if (data) setFerryBerthCalibration(data.berths); })
    .catch(() => {});
}

function getFerryBerthKey(pier, flank, rotation) {
  const shore = getTyphoonShelterScreenFacing(pier.land, rotation);
  const side = getTyphoonShelterScreenFacing(flank, rotation);
  return `${shore}|${side === 'sw' || side === 'nw' ? 'left' : 'right'}`;
}

// The nudge for a berth at the map's present turn.
function getFerryBerthOffset(pier, flank) {
  if (typeof getTyphoonShelterScreenFacing !== 'function') return null;
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  return ferryBerthCalibration[getFerryBerthKey(pier, flank, rotation)] || null;
}

function isFerryRuntime() {
  return typeof mapData !== 'undefined' && typeof isInsideMap === 'function';
}

// Whether a bridge tile at (row, col) would stand within FERRY.bridgeClearance of a pier's lot.
function isNearFerryPier(row, col) {
  const k = FERRY.bridgeClearance;
  return getFerryState().piers.some((p) => row >= p.row - k && row < p.row + FERRY.pierRows + k
    && col >= p.col - k && col < p.col + FERRY.pierCols + k);
}

function getFerryPierAt(row, col) {
  return getFerryState().piers.find((p) => row >= p.row && row < p.row + FERRY.pierRows && col >= p.col && col < p.col + FERRY.pierCols) || null;
}

// Tiles no pier may take and no ferry may cross: typhoon shelter water and its breakwaters.
function getFerryShelterTiles() {
  const out = new Set();
  if (typeof getTyphoonShelterAnalyses !== 'function') return out;
  getTyphoonShelterAnalyses().forEach((a) => {
    a?.basin?.forEach((k) => out.add(k));
    a?.ring?.forEach((k) => out.add(k));
  });
  return out;
}

function getFerryPierContext() {
  const shelter = getFerryShelterTiles();
  const id = (r, c) => (typeof getTileId === 'function' ? getTileId(r, c) : `${r}:${c}`);
  return {
    isInside: (r, c) => isInsideMap(r, c),
    isWater: (r, c) => mapData[r][c] === WATER && !(typeof isBridgeTile === 'function' && isBridgeTile(r, c)),
    // the shore half: sand or flat ground at sea level, nothing built on it
    isShore: (r, c) => [BEACH, GROUND, DIRT].includes(mapData[r][c]) && (typeof getTileHeight !== 'function' || getTileHeight(r, c) === 0)
      && !(typeof isTyphoonShelterPavedTile === 'function' && isTyphoonShelterPavedTile(r, c)),
    isRoad: (r, c) => mapData[r][c] === ROAD,
    isBridge: (r, c) => typeof isBridgeTile === 'function' && isBridgeTile(r, c),
    isBlocked: (r, c) => shelter.has(`${r}:${c}`) || !!getFerryPierAt(r, c)
      || !!buildingData[id(r, c)] || !!activeScene?.buildingSprites?.has(id(r, c)),
  };
}

const FERRY_REFUSALS = Object.freeze({
  outside: ['ferry.pier.outside', '超出地圖範圍。'],
  occupied: ['ferry.pier.occupied', '呢度已經有嘢（避風塘、橋、碼頭或者建築物）。'],
  notShore: ['ferry.pier.notShore', '碼頭要起喺岸邊：2 × 2 格一半係沙灘或者平地，一半係水。'],
  nearBridge: ['ferry.pier.nearBridge', '碼頭 2 格範圍內唔可以有橋。'],
  noSea: ['ferry.pier.noSea', '碼頭對出三格要係開闊水面（唔可以有橋），畀渡輪泊埋同駛出。'],
  noRoad: ['ferry.pier.noRoad', '碼頭岸邊 3 格內要有馬路。'],
});

// Why a pier may not stand at (row, col), as a sentence; null when it may.
function whyNotFerryPier(row, col) {
  const res = whyNotFerryPierAt(row, col, getFerryPierContext());
  if (!res.code) return null;
  return ferryT(...FERRY_REFUSALS[res.code]);
}

function placeFerryPier(scene, row, col) {
  const res = whyNotFerryPierAt(row, col, getFerryPierContext());
  const warn = (msg) => { if (typeof showToast === 'function') showToast(msg, 'warning'); return false; };
  if (res.code) return warn(ferryT(...FERRY_REFUSALS[res.code]));
  const spend = typeof spendTransportConstruction === 'function' ? spendTransportConstruction : spendBudget;
  if (!spend(FERRY.pierCost)) return warn(ferryT('ferry.pier.funds', '公司資金唔夠起碼頭（要 ${cost}）。', { cost: FERRY.pierCost.toLocaleString() }));
  // the trees on its shore half go, as under any building
  ferryPierHalfTiles(row, col, res.land).forEach(([r, c]) => { if (typeof removeTree === 'function') removeTree(scene, r, c); });
  const state = getFerryState();
  const n = state.nextId++;
  state.piers.push({ id: `pier-${n}`, row, col, land: res.land, name: ferryT('ferry.pier.name', '渡輪碼頭 {n}', { n }), waiting: 0 });
  ferryNetworkRevision += 1;
  syncFerryPiers(scene);
  if (typeof showToast === 'function') showToast(ferryT('ferry.pier.built', '起好渡輪碼頭。用「渡輪航線」連接兩個碼頭。'), 'success');
  return true;
}

// The bulldozer on a pier: pulled down with every route that calls at it (asked first).
function demolishFerryPierAt(scene, row, col) {
  const pier = getFerryPierAt(row, col);
  if (!pier) return false;
  const state = getFerryState();
  const routes = state.routes.filter((r) => r.pierIds.includes(pier.id));
  const question = routes.length
    ? ferryT('ferry.pier.confirmDemolishRoutes', '拆走「{name}」？用佢嘅 {n} 條航線會一齊取消。', { name: pier.name, n: routes.length })
    : ferryT('ferry.pier.confirmDemolish', '拆走「{name}」？', { name: pier.name });
  if (typeof confirm === 'function' && !confirm(question)) return true;
  // its routes close: their ferries are sold where they lie
  routes.forEach((r) => removeFerryRoute(r.id));
  state.piers = state.piers.filter((p) => p !== pier);
  if (ferryRouteDraft === pier.id) ferryRouteDraft = null;
  ferryNetworkRevision += 1;
  syncFerryPiers(scene);
  return true;
}

// 渡輪航線: click one pier, then another.
let ferryRouteDraft = null;

function handleFerryRouteClick(scene, row, col) {
  const say = (key, fallback, vars, kind = 'info') => { if (typeof showToast === 'function') showToast(ferryT(key, fallback, vars), kind); };
  const pier = getFerryPierAt(row, col);
  if (!pier) { say('ferry.route.pickPier', '撳一個渡輪碼頭。', {}, 'warning'); return false; }
  const state = getFerryState();
  if (!ferryRouteDraft || !state.piers.some((p) => p.id === ferryRouteDraft)) {
    ferryRouteDraft = pier.id;
    say('ferry.route.pickSecond', '由「{name}」開出：再撳另一個碼頭。', { name: pier.name });
    return true;
  }
  if (ferryRouteDraft === pier.id) { ferryRouteDraft = null; say('ferry.route.cancelled', '取消咗。'); return true; }
  const from = state.piers.find((p) => p.id === ferryRouteDraft);
  ferryRouteDraft = null;
  if (state.routes.some((r) => r.pierIds.includes(from.id) && r.pierIds.includes(pier.id))) {
    say('ferry.route.exists', '呢兩個碼頭之間已經有航線。', {}, 'warning'); return false;
  }
  if (state.routes.length >= FERRY.maxRoutes) { say('ferry.route.max', '航線數目已經到上限。', {}, 'warning'); return false; }
  const route = { id: `ferry-${state.nextId++}`, pierIds: [from.id, pier.id], color: FERRY_ROUTE_COLORS[state.routes.length % FERRY_ROUTE_COLORS.length],
    status: 'active', monthToDatePassengers: 0, monthToDateRevenue: 0, history: [] };
  if (!getFerryRouteLegs(route)) { say('ferry.route.noWater', '「{a}」同「{b}」之間冇水路連接。', { a: from.name, b: pier.name }, 'warning'); return false; }
  state.routes.push(route);
  ferryNetworkRevision += 1;
  // and its first ferry, bought at the pier
  if (buyFerry(route.id).ok) {
    say('ferry.route.opened', '「{a}」⇄「{b}」航線開咗，買咗一艘天星小輪（${price}）行走。', { a: from.name, b: pier.name, price: FERRY.vesselPrice.toLocaleString() }, 'success');
  } else {
    say('ferry.route.openedNoFerry', '「{a}」⇄「{b}」航線開咗，但公司資金唔夠買船（${price}），喺運輸公司航線列表加船。', { a: from.name, b: pier.name, price: FERRY.vesselPrice.toLocaleString() }, 'warning');
  }
  return true;
}

// A route's two legs, worked out once per network change (ferryNetworkRevision).
let ferryNetworkRevision = 0;
const ferryLegCache = new Map();

function getFerryRouteLegs(route) {
  const state = getFerryState();
  const [a, b] = route.pierIds.map((id) => state.piers.find((p) => p.id === id));
  if (!a || !b) return null;
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  const key = `${ferryNetworkRevision}|${ferryBerthRevision}|${rotation}|${a.id}@${a.row},${a.col},${a.land}|${b.id}@${b.row},${b.col},${b.land}`;
  if (ferryLegCache.has(key)) return ferryLegCache.get(key);
  const shelter = getFerryShelterTiles();
  const H = mapData.length; const W = mapData[0].length;
  const passable = (r, c) => {
    const water = mapData[r][c] === WATER || (typeof isBridgeTile === 'function' && isBridgeTile(r, c));
    return water && !shelter.has(`${r}:${c}`) && !getFerryPierAt(r, c);
  };
  const path = findFerryPath(a, b, passable, H, W, getFerryBerthOffset);
  const legs = path ? { out: ferryLeg(a, b, path, getFerryBerthOffset), back: ferryLeg(b, a, [...path].reverse(), getFerryBerthOffset) } : null;
  if (ferryLegCache.size > 64) ferryLegCache.clear();
  ferryLegCache.set(key, legs);
  return legs;
}

// The land a pier serves: within FERRY.catchmentRadius of the middle of its shore half (a diamond,
// as a bus stop's), reached over land from that half - never across the water: the far shore, a
// headland over a bay, the other end of a bridge are none of its (Norton, 2026-10-10). Pure with
// `isLand`; a Set of 'row:col'.
function ferryPierCatchmentLand(pier, isLand, radius = FERRY.catchmentRadius) {
  const half = ferryPierHalfTiles(pier.row, pier.col, pier.land);
  const centre = [(half[0][0] + half[1][0]) / 2, (half[0][1] + half[1][1]) / 2];
  const inReach = (r, c) => Math.abs(r - centre[0]) + Math.abs(c - centre[1]) <= radius;
  const land = new Set();
  const queue = half.filter(([r, c]) => isLand(r, c));
  queue.forEach(([r, c]) => land.add(`${r}:${c}`));
  for (let i = 0; i < queue.length; i++) {
    const [r, c] = queue[i];
    Object.values(FERRY_DIRS).forEach(([dr, dc]) => {
      const [nr, nc] = [r + dr, c + dc];
      const key = `${nr}:${nc}`;
      if (land.has(key) || !inReach(nr, nc) || !isLand(nr, nc)) return;
      land.add(key);
      queue.push([nr, nc]);
    });
  }
  return land;
}

// Where a pier's riders come from: the middle of its shore half, its own shore only (worked out
// afresh each time - some sixty tiles - so a change to the coast counts at once; its key, for the
// stops' memo, is the land itself).
function ferryPierCatchmentPoint(pier) {
  const half = ferryPierHalfTiles(pier.row, pier.col, pier.land);
  const isLand = (r, c) => isInsideMap(r, c) && mapData[r][c] !== WATER;
  const tiles = ferryPierCatchmentLand(pier, isLand);
  return {
    id: `ferry-${pier.id}`, row: (half[0][0] + half[1][0]) / 2, col: (half[0][1] + half[1][1]) / 2, radius: FERRY.catchmentRadius,
    // (a building of more than one tile is indexed at its centre - 180.5, 124.5: any tile round it)
    accepts: (r, c) => [Math.floor(r), Math.ceil(r)].some((rr) => [Math.floor(c), Math.ceil(c)].some((cc) => tiles.has(`${rr}:${cc}`))),
    acceptsKey: [...tiles].sort().join(','),
  };
}

// The last berthing on each ferry, for its "+$" over the map (updateFerries): not saved.
const ferryBerthingLog = new Map();

// From the transport company's clock (advanceTransportClock, environment minutes): each hour the
// piers' queues grow as the bus stops' do - the commuter curve, cleared at 04:00 - and every ferry
// that berthed in the span lands its passengers, takes its fares and boards the queue.
function advanceFerryClock(fromMinutes, toMinutes) {
  if (!isFerryRuntime() || !(toMinutes > fromMinutes)) return;
  const state = getFerryState();
  if (!state.routes.length) return;
  // hour by hour, the queues grown before the berthings in that hour (a long span - a fast-forward -
  // would otherwise see only the queue left after the 04:00 clearing)
  for (let t = fromMinutes; t < toMinutes;) {
    const next = Math.min(toMinutes, (Math.floor(t / 60) + 1) * 60);
    if (next % 60 === 0 && next > t) accrueFerryPiersForHour(state, next / 60);
    berthFerries(state, t, next);
    advanceFerryVessels(state, t, next);
    t = next;
  }
}

function ferrySkyMinutes(envMinutes) {
  return envMinutes + (typeof GAME_DAY_START_MINUTES === 'number' ? GAME_DAY_START_MINUTES : 360);
}

// The bus fleet's servicing rules (transport-expansion.js), for ferries: wear while they sail, a
// three-hour service every four sky-days in the yard at their first pier (hidden: taken off the
// timetable at a berthing there - berthFerries), and a worn ferry now and then breaking down where
// it lies, for two hours. Back on the timetable, a ferry carries on from where it stopped: its phase
// is put back by the time it was away. Environment minutes (from, to].
function advanceFerryVessels(state, fromMinutes, toMinutes) {
  const minutes = toMinutes - fromMinutes;
  if (!(minutes > 0) || !state.vessels.length) return;
  const decay = typeof TRANSPORT_CONDITION_DECAY_PER_MINUTE === 'number' ? TRANSPORT_CONDITION_DECAY_PER_MINUTE : 1 / (4 * 1440 * 3);
  const threshold = typeof TRANSPORT_BREAKDOWN_CONDITION_THRESHOLD === 'number' ? TRANSPORT_BREAKDOWN_CONDITION_THRESHOLD : 0.35;
  const chancePerHour = typeof TRANSPORT_BREAKDOWN_CHANCE_PER_HOUR === 'number' ? TRANSPORT_BREAKDOWN_CHANCE_PER_HOUR : 0.00127;
  const breakdownMinutes = typeof TRANSPORT_BREAKDOWN_DURATION_MINUTES === 'number' ? TRANSPORT_BREAKDOWN_DURATION_MINUTES : 120;
  const routes = new Map(state.routes.map((r) => [r.id, r]));
  const hourEnded = Math.floor(toMinutes / 60) > Math.floor(fromMinutes / 60);
  state.vessels.forEach((v) => {
    const route = routes.get(v.routeId);
    const legs = route && getFerryRouteLegs(route);
    if (!route || !legs) return;
    if (v.status !== 'active') {
      v.downMinutesRemaining -= minutes;
      if (v.downMinutesRemaining > 0) return;
      const away = ferrySkyMinutes(toMinutes) - v.downStartedAt;
      if (v.status === 'servicing') { v.condition = 1; v.minutesSinceService = 0; }
      v.status = 'active';
      v.phase = (((v.phase - away / ferryCycleMinutes(legs)) % 1) + 1) % 1;
      v.downStartedAt = null;
      v.downMinutesRemaining = 0;
      return;
    }
    if (route.status !== 'active') return;
    v.minutesSinceService += minutes;
    v.condition = Math.max(0, v.condition - decay * minutes);
    // the share of a round trip it is under way, at the speed it sails
    const cycle = ferryCycleMinutes(legs);
    v.tilesThisMonth += minutes * FERRY.speedTilesPerMinute * (cycle - 2 * FERRY.dwellMinutes) / cycle;
    if (hourEnded && v.condition < threshold && ferryHash(v.id, Math.floor(toMinutes / 60)) < chancePerHour) {
      v.status = 'broken_down';
      v.downStartedAt = ferrySkyMinutes(toMinutes);
      v.downMinutesRemaining = breakdownMinutes;
    }
  });
}

// A fixed draw in [0, 1) for a ferry and an hour, so a fast-forward or a reload rolls the same.
function ferryHash(id, n) {
  let h = 2166136261;
  const str = `${id}|${n}`;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000000) / 1000000;
}

function accrueFerryPiersForHour(state, envHour) {
  if (typeof getTransportStopRidersForHour !== 'function') return;
  const severe = typeof isTransportSevereWeather === 'function' && isTransportSevereWeather();
  const keep = typeof TRANSPORT_STORM_BACKLOG_KEEP === 'number' ? TRANSPORT_STORM_BACKLOG_KEEP : 0.7;
  const dayStart = typeof GAME_DAY_START_MINUTES === 'number' ? GAME_DAY_START_MINUTES : 360;
  const hour = ((envHour + Math.floor(dayStart / 60)) % 24 + 24) % 24;
  const served = new Set(state.routes.flatMap((r) => r.pierIds));
  const resetHour = typeof TRANSPORT_STOP_POOL_RESET_HOUR === 'number' ? TRANSPORT_STOP_POOL_RESET_HOUR : 4;
  const share = (typeof TRANSPORT_STOP_DAILY_BOARDING_SHARE === 'number' ? TRANSPORT_STOP_DAILY_BOARDING_SHARE : 0.75) * FERRY.boardingShare;
  if (severe) {
    // the ferries are tied up; the crossings people meant to make wait for the signal to drop
    state.piers.forEach((pier) => {
      if (!served.has(pier.id)) return;
      pier.stormBacklog = Math.min(9999, (Number(pier.stormBacklog) || 0) + getTransportStopRidersForHour(ferryPierCatchmentPoint(pier), hour, share));
    });
    return;
  }
  const releasing = state.piers.some((pier) => (Number(pier.stormBacklog) || 0) > 0);
  const reset = hour === resetHour && !releasing
    && (typeof shouldClearTransportPoolAfterStorm !== 'function' || shouldClearTransportPoolAfterStorm(state, hour));
  state.piers.forEach((pier) => {
    const backlog = Number(pier.stormBacklog) || 0;
    pier.stormBacklog = 0;
    if (!served.has(pier.id)) { pier.waiting = 0; return; }
    const current = reset ? 0 : (Number(pier.waiting) || 0);
    pier.waiting = Math.min(9999, current + getTransportStopRidersForHour(ferryPierCatchmentPoint(pier), hour, share) + backlog * keep);
  });
  if (releasing) state.stormSurgeHour = hour;
}

// Every ferry that berthed in environment minutes (from, to]: lands its passengers, takes the
// fares, boards the queue. At its route's first pier a ferry due its service goes into the yard
// instead of boarding, and one being sold is sold at whichever pier it reaches first.
function berthFerries(state, fromMinutes, toMinutes) {
  const severe = typeof isTransportSevereWeather === 'function' && isTransportSevereWeather();
  const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
  const serviceDue = typeof TRANSPORT_SERVICE_INTERVAL_MINUTES === 'number' ? TRANSPORT_SERVICE_INTERVAL_MINUTES : 4 * 1440;
  const serviceMinutes = typeof TRANSPORT_SERVICE_DURATION_MINUTES === 'number' ? TRANSPORT_SERVICE_DURATION_MINUTES : 180;
  state.routes.forEach((route) => {
    if (route.status !== 'active') return;
    const fleet = state.vessels.filter((v) => v.routeId === route.id && v.status === 'active');
    if (!fleet.length) return;
    const legs = getFerryRouteLegs(route);
    if (!legs) return;
    const piers = route.pierIds.map((id) => state.piers.find((p) => p.id === id));
    if (piers.some((p) => !p)) return;
    route.monthToDatePassengers = Number(route.monthToDatePassengers) || 0;
    route.monthToDateRevenue = Number(route.monthToDateRevenue) || 0;
    piers.forEach((p) => { p.waiting = Number(p.waiting) || 0; });
    ferryArrivalsAt(legs, ferrySkyMinutes(fromMinutes), ferrySkyMinutes(toMinutes), fleet.map((v) => v.phase)).forEach(({ t, vessel, pier }) => {
      const v = fleet[vessel];
      if (v.status !== 'active' || !state.vessels.includes(v)) return; // gone into the yard or sold earlier in the span
      const at = piers[pier];
      const leaving = v.sellAtNextPier || (pier === 0 && v.minutesSinceService >= serviceDue);
      const b = ferryBerthing(v.aboard, severe || leaving ? 0 : at.waiting);
      v.aboard = b.boarding;
      at.waiting -= b.boarding;
      if (b.alighting > 0 && transport) {
        transport.company.cashFraction = (Number(transport.company.cashFraction) || 0) + b.revenue;
        const whole = Math.floor(transport.company.cashFraction);
        if (whole > 0) { transport.company.cash += whole; transport.company.cashFraction -= whole; }
        route.monthToDatePassengers += b.alighting;
        route.monthToDateRevenue += b.revenue;
        v.monthToDateRevenue += b.revenue;
      }
      const prev = ferryBerthingLog.get(v.id);
      ferryBerthingLog.set(v.id, { serial: (prev?.serial || 0) + 1, revenue: b.revenue });
      if (v.sellAtNextPier) {
        sellFerryNow(state, v);
      } else if (leaving) {
        v.status = 'servicing';
        v.downStartedAt = t;
        v.downMinutesRemaining = serviceMinutes;
      }
    });
  });
}

// ── The company's ferries ────────────────────────────────────────────────────

function getFerryRouteVessels(route, state = getFerryState()) {
  return state.vessels.filter((v) => v.routeId === route.id);
}

function ferryResaleValue(v) {
  const factor = typeof TRANSPORT_VEHICLE_RESALE_FACTOR === 'number' ? TRANSPORT_VEHICLE_RESALE_FACTOR : 0.5;
  return Math.round(v.purchasePrice * v.condition * factor);
}

function ferryCompanyCash() {
  const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
  return transport ? Number(transport.company.cash) || 0 : 0;
}

function creditFerryCompany(amount) {
  const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
  if (transport) transport.company.cash = Math.round(transport.company.cash + amount);
}

// Buy a ferry onto a route (bought at its piers - the pier is the yard): it joins the timetable in
// its widest gap. { ok, vessel } or { ok: false, code: 'route'|'full'|'funds' }.
function buyFerry(routeId) {
  const state = getFerryState();
  const route = state.routes.find((r) => r.id === routeId);
  if (!route) return { ok: false, code: 'route' };
  const fleet = getFerryRouteVessels(route, state);
  if (fleet.length >= FERRY.maxVesselsPerRoute) return { ok: false, code: 'full' };
  const spend = typeof spendTransportConstruction === 'function' ? spendTransportConstruction : null;
  if (spend ? !spend(FERRY.vesselPrice) : ferryCompanyCash() < FERRY.vesselPrice) return { ok: false, code: 'funds' };
  if (!spend) creditFerryCompany(-FERRY.vesselPrice);
  const vessel = normalizeFerryVessel({
    id: `ferry-${state.nextVesselId++}`, routeId, phase: ferryJoiningPhase(fleet.map((v) => v.phase)), purchasePrice: FERRY.vesselPrice,
  }, new Set([routeId]));
  state.vessels.push(vessel);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return { ok: true, vessel };
}

// Sell a ferry. As a bus goes back to its depot first, a ferry under way is sold when it next
// berths (its passengers landed); one alongside, in the yard or on a suspended route at once.
// { ok, sold: true|false (pending), value }.
function sellFerry(vesselId) {
  const state = getFerryState();
  const v = state.vessels.find((x) => x.id === vesselId);
  if (!v) return { ok: false };
  const route = state.routes.find((r) => r.id === v.routeId);
  const legs = route && getFerryRouteLegs(route);
  const t = typeof getTyphoonShelterFleetClock === 'function' ? getTyphoonShelterFleetClock() : 0;
  const alongside = v.status !== 'active' || !route || route.status !== 'active' || !legs
    || ferryVesselPointAt(legs, t, v.phase).state === 'alongside';
  if (!alongside) {
    v.sellAtNextPier = true;
    return { ok: true, sold: false, value: ferryResaleValue(v) };
  }
  return { ok: true, sold: true, value: sellFerryNow(state, v) };
}

function sellFerryNow(state, v) {
  const value = ferryResaleValue(v);
  state.vessels = state.vessels.filter((x) => x !== v);
  creditFerryCompany(value);
  ferryBerthingLog.delete(v.id);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return value;
}

// Close a route: its ferries are sold where they are (no route left for them to finish).
function removeFerryRoute(routeId) {
  const state = getFerryState();
  const route = state.routes.find((r) => r.id === routeId);
  if (!route) return 0;
  const value = getFerryRouteVessels(route, state).reduce((sum, v) => sum + sellFerryNow(state, v), 0);
  state.routes = state.routes.filter((r) => r !== route);
  ferryNetworkRevision += 1;
  return value;
}

function setFerryRouteSuspended(routeId, suspended) {
  const route = getFerryState().routes.find((r) => r.id === routeId);
  if (!route) return false;
  route.status = suspended ? 'suspended' : 'active';
  return true;
}

// The month for the company's books (settleTransportMonth): the fares (credited as they berthed),
// the passengers, and the costs - each ferry's upkeep and its tiles sailed, each pier's upkeep.
// Each route's month goes into its history; the counts start again.
function settleFerryMonth(ended = null) {
  const state = getFerryState();
  const out = { revenue: 0, passengers: 0, cost: 0, vesselCost: 0, pierCost: 0 };
  state.routes.forEach((route) => {
    const fleet = getFerryRouteVessels(route, state);
    const cost = fleet.reduce((sum, v) => sum + FERRY.vesselMonthlyUpkeep + v.tilesThisMonth * FERRY.tileRunningCost, 0);
    out.revenue += route.monthToDateRevenue;
    out.passengers += route.monthToDatePassengers;
    out.vesselCost += cost;
    if (!Array.isArray(route.history)) route.history = [];
    route.history.push({
      year: ended ? ended.year : (typeof city !== 'undefined' ? city.year : 0),
      month: ended ? ended.month : (typeof city !== 'undefined' ? city.month : 0),
      passengers: route.monthToDatePassengers, revenue: Math.round(route.monthToDateRevenue * 100) / 100,
      cost: Math.round(cost * 100) / 100, net: Math.round((route.monthToDateRevenue - cost) * 100) / 100,
    });
    if (route.history.length > 24) route.history.splice(0, route.history.length - 24);
    route.monthToDateRevenue = 0;
    route.monthToDatePassengers = 0;
  });
  state.vessels.forEach((v) => {
    v.lastMonthRevenue = v.monthToDateRevenue;
    v.monthToDateRevenue = 0;
    v.tilesThisMonth = 0;
    v.ageMonths += 1;
  });
  out.pierCost = state.piers.length * FERRY.pierMonthlyUpkeep;
  out.cost = out.vesselCost + out.pierCost;
  return out;
}

// The piers as map sprites (the typhoon shelter's object sprites, tag 'ferry'): on load, a turn of
// the map comes through refreshAllTyphoonShelterSprites; here after a pier is built or pulled down.
function syncFerryPiers(scene) {
  if (!scene || typeof addTyphoonShelterObject !== 'function') return;
  if (!scene.typhoonShelterObjects) scene.typhoonShelterObjects = new Map();
  const wanted = new Map(getFerryState().piers.map((p) => [`ferry|${p.id}`, p]));
  [...scene.typhoonShelterObjects.values()].forEach((rec) => {
    if (rec.tag === 'ferry' && !wanted.has(rec.id)) removeTyphoonShelterObject(scene, rec.id);
  });
  wanted.forEach((p, id) => {
    const rec = scene.typhoonShelterObjects.get(id);
    if (rec && rec.row === p.row && rec.col === p.col && rec.facing === p.land) return;
    if (rec) removeTyphoonShelterObject(scene, id);
    addTyphoonShelterObject(scene, {
      id, objectId: FERRY.pierObjectId, row: p.row, col: p.col, facing: p.land, tag: 'ferry',
      footprintOverride: { cols: FERRY.pierCols, rows: FERRY.pierRows },
    }).catch((error) => console.warn('[ferry] pier sprite', error?.message));
  });
}

// Every frame: each route's ferries where the clock puts them.
function updateFerries(scene) {
  if (!scene || !isFerryRuntime() || typeof drawTyphoonShelterBoat !== 'function') return;
  if (!scene.ferrySprites) scene.ferrySprites = new Map();
  const live = new Set();
  const zoom = scene.cameras?.main?.zoom ?? 1;
  const routes = getFerryState().routes;
  if (zoom >= FERRY.minZoom && routes.length) {
    const t = typeof getTyphoonShelterFleetClock === 'function' ? getTyphoonShelterFleetClock() : 0;
    const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
    const facings = typeof getTyphoonShelterFacingOverrides === 'function' ? getTyphoonShelterFacingOverrides() : {};
    const state = getFerryState();
    routes.forEach((route) => {
      if (route.status !== 'active') return;
      const legs = getFerryRouteLegs(route);
      if (!legs) return;
      getFerryRouteVessels(route, state).forEach((vessel) => {
        // in the yard for its service: out of sight; broken down: where it stopped
        if (vessel.status === 'servicing') return;
        const id = `ferry|${vessel.id}`;
        live.add(id);
        const point = ferryVesselPointAt(legs, vessel.status === 'broken_down' ? vessel.downStartedAt : t, vessel.phase);
        const drawn = { ...point, dir: FERRY_DRAW_HEADING[point.dir] || point.dir };
        drawTyphoonShelterBoat(scene, id, FERRY.objectId, drawn, rotation, facings, scene.ferrySprites);
        const rec = scene.ferrySprites.get(id);
        if (rec) rec.ferryVesselId = vessel.id;
        // by its pier while near it (no bridge stands within two tiles of a pier), else under any span
        if (!orderFerryByPier(scene, rec?.sprite, point, route, rotation)) tuckFerryUnderBridge(scene, rec?.sprite, point);
        // its takings rising over it as it berths, like a bus's - in Transport Mode only
        const log = ferryBerthingLog.get(vessel.id);
        if (rec && log && rec.lastBerthing !== log.serial) {
          const first = rec.lastBerthing === undefined;
          rec.lastBerthing = log.serial;
          const transportMode = typeof isTransportModeActive !== 'undefined' && isTransportModeActive;
          if (!first && transportMode && log.revenue >= 0.5 && rec.sprite?.visible && typeof spawnTransportFareFloatText === 'function') {
            // over everything: it rises over the pier, which sorts above the ferry
            const overlay = typeof getPreviewOverlayDepth === 'function' ? getPreviewOverlayDepth(3) : rec.sprite.depth + 1e6;
            // and unmasked: the world mask hid it over the pier (it rises inside the map anyway)
            spawnTransportFareFloatText(scene, rec.sprite.x, rec.sprite.y - 40, log.revenue, overlay)?.clearMask?.();
          }
        }
      });
    });
  }
  // the calibrator's ferry, lying at the berth being set
  const preview = typeof getFerryBerthCalibrationPreview === 'function' ? getFerryBerthCalibrationPreview() : null;
  if (preview) {
    const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
    const facings = typeof getTyphoonShelterFacingOverrides === 'function' ? getTyphoonShelterFacingOverrides() : {};
    const id = 'ferry|calibration';
    live.add(id);
    drawTyphoonShelterBoat(scene, id, FERRY.objectId, { ...preview.point, dir: FERRY_DRAW_HEADING[preview.point.dir] || preview.point.dir },
      rotation, facings, scene.ferrySprites);
    const rec = scene.ferrySprites.get(id);
    if (rec?.sprite) { rec.sprite.setVisible(true); orderFerryByPier(scene, rec.sprite, preview.point, { pierIds: [preview.pier.id] }, rotation); }
  }
  scene.ferrySprites.forEach((rec, id) => {
    if (!live.has(id)) { rec.sprite?.destroy(); scene.ferrySprites.delete(id); }
  });
  // the routes over the water, in Transport Mode (ferry-ui.js)
  if (typeof updateFerryRouteOverlay === 'function') updateFerryRouteOverlay(scene);
}

// Bridges sort in the road band, below every object, so a ferry would be drawn over any span in
// front of it - one it is passing under, or one between it and the camera. Any bridge tile level
// with or in front of the ferry whose sprite overlaps it puts the ferry just below that span.
function tuckFerryUnderBridge(scene, sprite, point) {
  if (!sprite || typeof isBridgeTile !== 'function' || !scene.bridgeSprites?.size) return;
  const box = sprite.getBounds();
  const reach = 4;
  let depth = Infinity;
  for (let r = Math.floor(point.r) - reach; r <= Math.ceil(point.r) + reach; r++) {
    for (let c = Math.floor(point.c) - reach; c <= Math.ceil(point.c) + reach; c++) {
      if (r + c < point.r + point.c - 1.5 || !isInsideMap(r, c) || !isBridgeTile(r, c)) continue;
      const entry = scene.bridgeSprites.get(getTileId(r, c));
      const parts = entry?.getBounds ? [entry] : [entry?.body, entry?.top].filter(Boolean);
      parts.forEach((part) => {
        const b = part.getBounds();
        if (b.right < box.left || b.left > box.right || b.bottom < box.top || b.top > box.bottom) return;
        if (Number.isFinite(part.depth)) depth = Math.min(depth, part.depth);
      });
    }
  }
  if (!Number.isFinite(depth)) return false;
  sprite.setDepth(depth - 0.01);
  return true;
}

// Beside its pier the ferry is drawn in front of it or behind it by where it lies on the ground, not
// by screen height: the pier sorts by its 2 x 2 lot's front corner, which puts it over a ferry lying
// along the flank nearer the camera at some turns of the map. Separated along the coast (alongside a
// flank) or out to sea (past the pier's face): in front when that side faces the camera.
function orderFerryByPier(scene, sprite, point, route, rotation) {
  if (!sprite || typeof getTyphoonShelterScreenFacing !== 'function') return false;
  const state = getFerryState();
  for (const id of route.pierIds) {
    const pier = state.piers.find((p) => p.id === id);
    const rec = pier && scene.typhoonShelterObjects?.get(`ferry|${pier.id}`);
    if (!rec?.sprite) continue;
    const dr = point.r - (pier.row + 0.5);
    const dc = point.c - (pier.col + 0.5);
    if (Math.abs(dr) > 3 || Math.abs(dc) > 3) continue;
    // at a berth, or on the straight run between it and open water: by that berth's flank (as
    // calibrated - a berth nudged in against the pier is still on its side)
    const berthEnd = ferryBerthEnds(pier, getFerryBerthOffset).find((end) => {
      const ax = end.berth.r; const ay = end.berth.c; const bx = end.point.r; const by = end.point.c;
      const len2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
      const k = Math.max(0, Math.min(1, ((point.r - ax) * (bx - ax) + (point.c - ay) * (by - ay)) / len2));
      return Math.hypot(point.r - (ax + (bx - ax) * k), point.c - (ay + (by - ay) * k)) < 0.3;
    });
    if (berthEnd) {
      const facing = getTyphoonShelterScreenFacing(berthEnd.side, rotation);
      const inFront = facing === 'se' || facing === 'sw';
      sprite.setDepth(inFront ? Math.max(sprite.depth, rec.sprite.depth + 0.01) : Math.min(sprite.depth, rec.sprite.depth - 0.01));
      return true;
    }
    const sea = FERRY_OPPOSITE[pier.land];
    const [sr, sc] = FERRY_DIRS[sea];
    const [ar, ac] = FERRY_DIRS[FERRY_ALONG[pier.land][1]];
    const seaward = dr * sr + dc * sc;
    const along = dr * ar + dc * ac;
    const pierHalf = FERRY.pierLengthM / 2 / 20;
    // the ferry's half-extents along the coast and out to sea, by which way its hull lies
    const lengthwise = FERRY_DIRS[point.dir] && (FERRY_DIRS[point.dir][0] * sr + FERRY_DIRS[point.dir][1] * sc) !== 0;
    const halfAlong = lengthwise ? FERRY.beamTiles / 2 : FERRY.lengthTiles / 2;
    const halfSea = lengthwise ? FERRY.lengthTiles / 2 : FERRY.beamTiles / 2;
    let side = null;
    if (Math.abs(along) - halfAlong >= pierHalf - 0.05) side = FERRY_ALONG[pier.land][along > 0 ? 1 : 0];
    else if (seaward - halfSea >= pierHalf - 0.05) side = sea;
    if (!side) return true;   // overlapping it (turning in): its own depth
    const facing = getTyphoonShelterScreenFacing(side, rotation);
    const inFront = facing === 'se' || facing === 'sw';
    const pierDepth = rec.sprite.depth;
    sprite.setDepth(inFront ? Math.max(sprite.depth, pierDepth + 0.01) : Math.min(sprite.depth, pierDepth - 0.01));
    return true;
  }
  return false;
}

function clearFerrySprites(scene) {
  scene?.ferrySprites?.forEach((rec) => rec.sprite?.destroy());
  scene?.ferrySprites?.clear();
}

const ferryApi = {
  FERRY,
  FERRY_DRAW_HEADING,
  setFerryBerthCalibration,
  getFerryBerthCalibration,
  getFerryBerthKey,
  normalizeFerryState,
  getFerryState,
  ferryPierTiles,
  ferryPierSideTiles,
  ferryPierHalfTiles,
  whyNotFerryPierAt,
  ferryBerthPoint,
  ferryBerthEnds,
  findFerryPath,
  ferryLeg,
  ferryPointAlong,
  ferryVesselPoint,
  ferryVesselPointAt,
  ferryCycleMinutes,
  ferryArrivals,
  ferryArrivalsAt,
  ferryJoiningPhase,
  ferryPierCatchmentLand,
  normalizeFerryVessel,
  getFerryRouteVessels,
  buyFerry,
  sellFerry,
  removeFerryRoute,
  setFerryRouteSuspended,
  ferryResaleValue,
  advanceFerryVessels,
  ferryBerthing,
  getFerryPierAt,
  isNearFerryPier,
  whyNotFerryPier,
  placeFerryPier,
  demolishFerryPierAt,
  handleFerryRouteClick,
  getFerryRouteLegs,
  syncFerryPiers,
  updateFerries,
  advanceFerryClock,
  settleFerryMonth,
  clearFerrySprites,
};

if (typeof window !== 'undefined' && typeof fetch === 'function') loadFerryBerths();

if (typeof module !== 'undefined' && module.exports) module.exports = ferryApi;
