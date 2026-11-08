// 電車 phases 2-4 (docs/tram-design.md §3-§6): stops on the track, lines through them, and the
// trams on the track's lines (tram.js buildTramTrackGeometry), each on its left-hand track. A tram
// moves as the company's buses do, at the traffic's own pace (traffic-visuals.js
// computeTrafficProgressAmount - not the sky's, which runs three to twenty-four times faster): on a
// narrow road it is one of the traffic - it waits behind the car or bus in front and at a red light,
// and the cars queue behind it - and everywhere it keeps its distance behind the tram ahead and stops
// at its stops. At a terminus it goes round a loop where the track has one (堅尼地城, 跑馬地), else
// crosses to the other track and back, as the metro does. Its riders gather at its stops hour by hour
// (the bus stops' commuter curve) and pay a flat fare as they board (叮叮's).

const TRAM_SERVICE = Object.freeze({
  // (tuned in 太子, 2026-11-08: a 24-tile line of six stops and six trams down a busy street, $5,280,
  // draws some 5,300 riders a month at 1x - 2,900 at 4x, fewer trips a day - and pays back in about
  // 15 months at 1x, 30 at 4x; a quiet street's line still makes a little. A bus takes 17 months.)
  stopCost: 150,
  stopMonthlyUpkeep: 1,
  trackMonthlyUpkeepPerTile: 0.3,
  tramPrice: 250,               // a bus is 280 (萬)
  tramCapacity: 115,            // Hong Kong's double-deck tram
  tramMonthlyUpkeep: 2,
  tileRunningCost: 0.0001,
  fare: 0.07,                   // flat, as 叮叮's, whatever the distance: a quarter of a bus ride's
  catchmentRadius: 4,           // a bus stop's is 5: tram stops are close together
  boardingShare: 1.5,           // times a bus stop's daily share: cheap short hops
  // its pace: the traffic's (0.9 tiles a second at 1x), a little slower; at a stop as long as a bus
  // takes (TRAFFIC_VISUAL_CONFIG.busStopDwellMs, 3 s), in the traffic's tiles
  speedFactor: 0.85,
  dwellTiles: 2.6,
  maxStopsPerLine: 20,
  maxLines: 6,
  maxTramsPerLine: 12,
  loopMaxTiles: 48,             // a terminus loop round a block at most this long
  crossoverTiles: 0.8,          // no loop: across to the other track over this far
  // trams run 06:00 to midnight (sky minutes)
  serviceFromMinute: 6 * 60,
  serviceToMinute: 24 * 60,
  // in the traffic: middles this far apart at least behind a tram, a car or a bus (traffic-visuals.js
  // minimumHeadwayTiles x a bus's headway), and behind another tram
  trafficSpacingTiles: 0.65 * 1.4,
  tramSpacingTiles: 0.8,
  headwayFactor: 1.4,
});

// 電車's green and its advertising liveries (tram-art.js), taken in turn as trams are bought
const TRAM_LIVERIES = Object.freeze(['green', 'hss', 'lan', 'nightday']);
const TRAM_LINE_COLORS = Object.freeze(['#2e8b57', '#c0392b', '#2471a3', '#d68910', '#7d3c98', '#17a589']);

let tramLineDraft = null;
let tramNetworkRevision = 0;

function tramState() {
  return getTramState();
}

function getTramStopById(id, state = tramState()) {
  return state.stops.find((s) => s.id === id) || null;
}

// A stop's tiles: its own, and on a dual carriageway the band's other half (its far platform).
function tramStopTiles(stop) {
  if (!stop.band) return [[stop.row, stop.col]];
  return stop.axis === 'ns' ? [[stop.row, stop.col], [stop.row, stop.col + 1]] : [[stop.row, stop.col], [stop.row + 1, stop.col]];
}

function getTramStopAt(row, col, state = tramState()) {
  return state.stops.find((s) => tramStopTiles(s).some(([r, c]) => r === row && c === col)) || null;
}

function getTramLineStops(line, state = tramState()) {
  return line.stopIds.map((id) => getTramStopById(id, state)).filter(Boolean);
}

function getTramLineTrams(line, state = tramState()) {
  return state.trams.filter((v) => v.lineId === line.id);
}

function getTramStopLines(stop, state = tramState()) {
  return state.lines.filter((l) => l.stopIds.includes(stop.id));
}

// ── Stops (docs/tram-design.md §5b) ─────────────────────────────────────────────────────────────

/**
 * Whether a stop may go here, and how: on a straight stretch of track (nothing else on the tile),
 * on a narrow road's straight tile or a dual carriageway's reservation (either half clicked: the
 * stop is the band's pair), not right beside another stop. Pure with `ctx` { tracks, bandAt,
 * roadKeyAt, stopAt }. Returns { site: { row, col, axis, band } } or { code }.
 */
function whyNotTramStopAt(row, col, ctx) {
  const mask = ctx.tracks[`${row}:${col}`] || 0;
  if (!mask) return { code: 'noTrack' };
  const band = ctx.bandAt(row, col);
  const side = tramReservationSideOf(band);
  let site;
  if (side) {
    const axis = band.orientation === 'v' ? 'ns' : 'ew';
    const r = side === 'n' ? row - 1 : row, c = side === 'w' ? col - 1 : col;
    site = { row: r, col: c, axis, band: true };
  } else {
    const key = ctx.roadKeyAt(row, col);
    if (key !== 'road_straight_v' && key !== 'road_straight_h') return { code: 'notStraight' };
    site = { row, col, axis: key === 'road_straight_v' ? 'ns' : 'ew', band: false };
  }
  const bit = site.axis === 'ns' ? 1 : 2;
  if (mask !== bit) return { code: 'notStraight' };
  const [dr, dc] = site.axis === 'ns' ? [1, 0] : [0, 1];
  for (let k = -1; k <= 1; k++) {
    if (ctx.stopAt(site.row + dr * k, site.col + dc * k)) return { code: k === 0 ? 'taken' : 'tooClose' };
  }
  return { site };
}

function tramStopContext() {
  return {
    tracks: tramState().tracks,
    bandAt: tramBandAt,
    roadKeyAt: typeof getBaseTileKey === 'function' ? getBaseTileKey : () => null,
    stopAt: (r, c) => getTramStopAt(r, c),
  };
}

const TRAM_STOP_REFUSALS = Object.freeze({
  noTrack: ['tram.stop.noTrack', '電車站要起喺電車路軌上。'],
  notStraight: ['tram.stop.notStraight', '電車站要起喺一段直路軌上（唔可以喺路口、彎位或者窄路入雙線嗰度）。'],
  taken: ['tram.stop.taken', '呢度已經有電車站。'],
  tooClose: ['tram.stop.tooClose', '太近另一個電車站。'],
});

function placeTramStop(scene, row, col) {
  const say = (key, fallback, vars = {}, kind = 'info') => { if (typeof showToast === 'function') showToast(tramT(key, fallback, vars), kind); return kind !== 'warning'; };
  const res = whyNotTramStopAt(row, col, tramStopContext());
  // (and its track straight on through it: not part of a shift between a narrow road and a reservation)
  if (!res.code && !tramStopLinkIsPlain(getTramTrackGeometry(), res.site)) res.code = 'notStraight';
  if (res.code) return say(...TRAM_STOP_REFUSALS[res.code], {}, 'warning');
  if (typeof spendTransportConstruction === 'function' && !spendTransportConstruction(TRAM_SERVICE.stopCost)) {
    return say('tram.stop.funds', '公司資金唔夠起電車站（要 ${cost}）。', { cost: TRAM_SERVICE.stopCost.toLocaleString() }, 'warning');
  }
  const state = tramState();
  const n = state.stops.length + 1;
  const stop = { id: `tstop-${state.nextId++}`, ...res.site, name: tramT('tram.stop.name', '電車站 {n}', { n }), waitingByLine: {} };
  state.stops.push(stop);
  onTramStopsChanged(scene, stop);
  return say('tram.stop.built', '起咗「{name}」。用「電車路線」工具一個個站撳，開一條電車綫。', { name: stop.name }, 'success');
}

// A stop taken away (the bulldozer, or its track gone): off every line; a line left with fewer than
// two stops closes, its trams sold.
function removeTramStop(scene, stop) {
  const state = tramState();
  if (!state.stops.includes(stop)) return false;
  state.stops = state.stops.filter((s) => s !== stop);
  state.lines.forEach((line) => { line.stopIds = line.stopIds.filter((id) => id !== stop.id); });
  state.lines.filter((l) => l.stopIds.length < 2).forEach((l) => removeTramLine(l.id));
  onTramStopsChanged(scene, stop);
  return true;
}

function demolishTramStopAt(scene, row, col) {
  const stop = getTramStopAt(row, col);
  return stop ? removeTramStop(scene, stop) : false;
}

// Stops whose track has gone (or changed under them) go too.
function pruneTramStops(scene) {
  const ctx = tramStopContext();
  tramState().stops.slice().forEach((stop) => {
    const others = { ...ctx, stopAt: (r, c) => { const s = getTramStopAt(r, c); return s && s !== stop ? s : null; } };
    const res = whyNotTramStopAt(stop.row, stop.col, others);
    if (res.code || res.site.row !== stop.row || res.site.col !== stop.col || res.site.axis !== stop.axis) removeTramStop(scene, stop);
  });
}

function onTramStopsChanged(scene, stop = null) {
  tramNetworkRevision += 1;
  if (scene) {
    scene.__tramStopSignature = null;
    // the zebra crossing beside a stop on a narrow road (road-line-variants.js)
    if (stop && typeof refreshTileList === 'function') {
      const [dr, dc] = stop.axis === 'ns' ? [1, 0] : [0, 1];
      const tiles = [];
      for (let k = -2; k <= 2; k++) tiles.push([stop.row + dr * k, stop.col + dc * k]);
      refreshTileList(scene, tiles);
      if (typeof scheduleStreetLampRefresh === 'function') scheduleStreetLampRefresh(scene);
      if (typeof schedulePedestrianRailingRefresh === 'function') schedulePedestrianRailingRefresh(scene);
    }
  }
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
}

// The tile beside a narrow road's stop that gets its zebra crossing (Norton, 2026-11-08: 車站旁邊通常
// 有斑馬線): the next one along, the way the map's columns or rows go. For road-line-variants.js.
function isTramStopZebraTile(row, col) {
  if (typeof getTransportExpansionState !== 'function' || !getTransportExpansionState()?.tram?.stops?.length) return false;
  return tramState().stops.some((s) => !s.band && (s.axis === 'ns' ? s.row + 1 === row && s.col === col : s.row === row && s.col + 1 === col));
}

// ── The way a line goes (pure) ──────────────────────────────────────────────────────────────────

// Which side of a node's edge a link lies on (-1 or 1).
function tramLinkSide(link, node) {
  const p = node === link.from ? link.mid[1] : link.mid[link.mid.length - 2];
  const v = node.axis === 'H' ? p[1] : p[0];
  return v < node.line ? -1 : 1;
}

// The links at each node (by their ends as drawn: a corner that took in a tile ends past it).
function tramNodeIndex(geo) {
  const at = new Map();
  geo.links.forEach((l) => {
    if (l.consumed || !l.mid) return;
    [l.from, l.to].forEach((n) => { if (!at.has(n)) at.set(n, []); at.get(n).push(l); });
  });
  return at;
}

// Where a link run `dir` (1 from its `from` node, -1 from its `to`) can go on: the links on the far
// side of the node it leaves by.
function tramNextLinks(index, link, dir) {
  const node = dir > 0 ? link.to : link.from;
  const side = tramLinkSide(link, node);
  return (index.get(node) || []).filter((l) => l !== link && tramLinkSide(l, node) === -side)
    .map((l) => ({ link: l, dir: l.from === node ? 1 : -1 }));
}

// The shortest way from a start (link, dir) on to a goal, its first and last included; null if none
// within `maxLength` tiles. Pure.
function tramShortestPath(index, start, isGoal, maxLength = Infinity) {
  const key = (s) => `${s.link.from.key}>${s.link.to.key}#${s.dir}`;
  const best = new Map([[key(start), 0]]);
  const back = new Map();
  const open = [{ s: start, d: 0 }];
  while (open.length) {
    open.sort((a, b) => a.d - b.d);
    const { s, d } = open.shift();
    if (d > (best.get(key(s)) ?? Infinity)) continue;
    if (s !== start && isGoal(s.link, s.dir)) {
      const path = [s];
      let k = key(s);
      while (back.has(k)) { const prev = back.get(k); path.unshift(prev); k = key(prev); }
      return path;
    }
    tramNextLinks(index, s.link, s.dir).forEach((n) => {
      const nd = d + n.link.length;
      if (nd > maxLength) return;
      const k = key(n);
      if (nd < (best.get(k) ?? Infinity)) { best.set(k, nd); back.set(k, s); open.push({ s: n, d: nd }); }
    });
  }
  return null;
}

// The link a stop stands on: the straight through its tile along its axis (a band's: the one
// double track down the reservation).
function tramStopLink(geo, stop) {
  const bit = stop.axis === 'ns' ? 1 : 2;
  const line = stop.axis === 'ns' ? stop.row : stop.col;
  const cx = stop.col + (stop.band && stop.axis === 'ns' ? 1 : 0.5), cy = stop.row + (stop.band && stop.axis === 'ew' ? 1 : 0.5);
  let best = null, bestD = 0.6;
  geo.links.forEach((l) => {
    if (!l.straight || l.bit !== bit || l.consumed || !l.mid || Math.min(l.from.line, l.to.line) !== line) return;
    const m = l.mid[Math.floor(l.mid.length / 2)];
    const d = Math.hypot(m[0] - cx, m[1] - cy);
    if (d < bestD) { best = l; bestD = d; }
  });
  return best;
}

// Whether a stop's track runs straight through it (no shift across it, at either end). Pure.
function tramStopLinkIsPlain(geo, stop) {
  const l = tramStopLink(geo, stop);
  return Boolean(l && Math.abs(l.from.pos - l.to.pos) < 1e-9 && !l.from.shifted && !l.to.shifted);
}

// The rail a tram runs on along a link: the left-hand one the way it goes, in its order.
function tramLeftRail(link, dir) {
  const k = Math.floor(link.mid.length / 2);
  const a = link.mid[k - 1], b = link.mid[k + 1];
  const tx = (b[0] - a[0]) * dir, ty = (b[1] - a[1]) * dir;
  const o = [link.rails[0][k][0] - link.mid[k][0], link.rails[0][k][1] - link.mid[k][1]];
  const rail = o[0] * ty - o[1] * tx > 0 ? link.rails[0] : link.rails[1];
  return dir > 0 ? rail : rail.slice().reverse();
}

// Part of a polyline, by the share of its length from its start: [f0, f1].
function tramSlice(pts, f0, f1) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum.at(-1) || 1;
  const at = (d) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const k = (d - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
  };
  const d0 = f0 * total, d1 = f1 * total;
  const out = [at(d0)];
  for (let i = 0; i < pts.length; i++) if (cum[i] > d0 + 1e-9 && cum[i] < d1 - 1e-9) out.push(pts[i]);
  out.push(at(d1));
  return out;
}

/**
 * A line's round trip on the track: out through its stops, round a loop at the far end where the
 * track has one (else across to the other track, as the metro does at a terminus with its scissors
 * crossover), back through them, and round (or across) at the first. Pure: `geo` from
 * buildTramTrackGeometry, `stops` [{ row, col, axis, band }] in order. Returns { pts, cum, length,
 * calls: [{ at, stop, leaving: 1 out / -1 back }], traffic: [per point: on a narrow road's lanes],
 * loops: [first, last] } or { code: 'noStop' | 'noWay', at }.
 */
function buildTramLineRoute(geo, stops) {
  const n = stops.length;
  if (n < 2) return { code: 'noWay', at: 0 };
  const index = tramNodeIndex(geo);
  const links = stops.map((s) => tramStopLink(geo, s));
  const missing = links.findIndex((l) => !l);
  if (missing >= 0) return { code: 'noStop', at: missing };
  let out = null;
  let failAt = 1;
  [1, -1].forEach((d0) => {
    let state = { link: links[0], dir: d0 };
    const paths = [];
    let length = 0;
    for (let i = 0; i < n - 1; i++) {
      const path = links[i + 1] === links[i] ? null : tramShortestPath(index, state, (l) => l === links[i + 1]);
      if (!path) { failAt = Math.max(failAt, i + 1); return; }
      paths.push(path);
      length += path.reduce((sum, s) => sum + s.link.length, 0);
      state = path.at(-1);
    }
    if (!out || length < out.length) out = { paths, length, d0 };
  });
  if (!out) return { code: 'noWay', at: failAt };
  const { paths, d0 } = out;
  const end = paths.at(-1).at(-1);
  const loop = (from, toDir) => tramShortestPath(index, from, (l, d) => l === from.link && d === toDir, TRAM_SERVICE.loopMaxTiles);
  const loopEnd = loop(end, -end.dir);
  const loopStart = loop({ link: links[0], dir: -d0 }, d0);

  const pts = [];
  const traffic = [];
  const callAt = [];
  const blends = [];
  const add = (state, f0, f1, blend = false) => {
    const piece = tramSlice(tramLeftRail(state.link, state.dir), f0, f1);
    const inTraffic = !state.link.from.band && !state.link.to.band;
    if (blend && pts.length) blends.push({ index: pts.length, from: pts.at(-1) });
    else if (pts.length) piece.shift();
    piece.forEach((p) => { pts.push(p); traffic.push(inTraffic); });
  };
  const run = (path, blend) => {
    add(path[0], 0.5, 1, blend);
    path.slice(1, -1).forEach((s) => add(s, 0, 1));
    add(path.at(-1), 0, 0.5);
  };
  const reverse = (path) => path.slice().reverse().map((s) => ({ link: s.link, dir: -s.dir }));
  // the start: the first stop, where the trip out begins (on the way out's track - or, with no loop,
  // where the tram came in on the way back, to cross over as it leaves)
  if (loopStart) pts.push(tramSlice(tramLeftRail(links[0], d0), 0, 0.5).at(-1));
  else pts.push(tramSlice(tramLeftRail(links[0], -d0), 0, 0.5).at(-1));
  traffic.push(!links[0].from.band && !links[0].to.band);
  callAt.push({ index: 0, stop: 0, leaving: 1 });
  paths.forEach((path, i) => {
    run(path, i === 0 && !loopStart);
    callAt.push({ index: pts.length - 1, stop: i + 1, leaving: i + 1 === n - 1 ? -1 : 1 });
  });
  if (loopEnd) run(loopEnd, false);
  for (let i = n - 2; i >= 0; i--) {
    run(reverse(paths[i]), i === n - 2 && !loopEnd);
    if (i > 0) callAt.push({ index: pts.length - 1, stop: i, leaving: -1 });
  }
  if (loopStart) run(loopStart, false);
  // across to the other track (no loop): eased over the first stretch after the stop
  blends.forEach(({ index: i0, from }) => {
    const off = [from[0] - pts[i0][0], from[1] - pts[i0][1]];
    let d = 0;
    for (let i = i0; i < pts.length; i++) {
      if (i > i0) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const k = d / TRAM_SERVICE.crossoverTiles;
      if (k >= 1) break;
      const w = 1 - k * k * (3 - 2 * k);
      pts[i] = [pts[i][0] + off[0] * w, pts[i][1] + off[1] * w];
    }
  });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const calls = callAt.map((c) => ({ at: cum[c.index], stop: c.stop, leaving: c.leaving }));
  return { pts, cum, length: cum.at(-1), calls, traffic, loops: [Boolean(loopStart), Boolean(loopEnd)] };
}

// A point a distance along a line's round trip, and its way there. Pure.
function tramRoutePointAt(route, dist) {
  const { pts, cum } = route;
  const d = ((dist % route.length) + route.length) % route.length;
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
  const k = (d - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
  const pos = [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * k, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * k];
  // (its way over a little more than a car's length: steady through the joins between points)
  const a = Math.max(0, lo - 2), b = Math.min(pts.length - 1, hi + 2);
  let hx = pts[b][0] - pts[a][0], hy = pts[b][1] - pts[a][1];
  const len = Math.hypot(hx, hy) || 1;
  hx /= len; hy /= len;
  return { pos, heading: [hx, hy], traffic: Boolean(route.traffic[lo] && route.traffic[hi]), index: lo };
}

// ── A tram on its way ────────────────────────────────────────────────────────────────────────────

/**
 * A tram calls at a stop: those aboard bound here get off (spread evenly over the stops ahead of
 * them, so all at the end of the line), then the stop's queue for the way it leaves gets on, up to
 * its room, each paying the flat fare. Pure. Returns { alighting, boarding, revenue }.
 */
function tramCall({ aboard, waiting, arrivingAhead, share }) {
  const riding = Math.max(0, Math.floor(aboard || 0));
  const alighting = arrivingAhead <= 1 ? riding : Math.round(riding / arrivingAhead);
  const room = TRAM_SERVICE.tramCapacity - (riding - alighting);
  const boarding = Math.max(0, Math.min(room, Math.floor(Math.max(0, waiting || 0) * Math.max(0, Math.min(1, share)))));
  return { alighting, boarding, revenue: boarding * TRAM_SERVICE.fare };
}

// The next call along a round trip from a distance (its index in route.calls). Pure.
function tramNextCallIndex(route, dist) {
  const i = route.calls.findIndex((c) => c.at > dist + 1e-9);
  return i < 0 ? 0 : i;
}

/**
 * A tram's step along its line's round trip by `amount` (the traffic's tiles this frame): out its
 * dwell at a stop first; then on at its pace - not at all while `blocked()`, and short of a red
 * light (`limit()`: how far it may go, or null) - calling at the stop it reaches (`onCall(call)`),
 * where it stops for its dwell. Pure but for `v` (dist, dwellLeft, callIndex) and the callbacks.
 * Returns the tiles it moved.
 */
function stepTram(v, route, amount, { blocked = () => false, limit = () => null, onCall = () => {} } = {}) {
  if (!(amount > 0) || !route?.calls?.length) return 0;
  if (v.dwellLeft > 0) {
    v.dwellLeft -= amount;
    if (v.dwellLeft > 0) return 0;
    v.dwellLeft = 0;
  }
  if (blocked()) return 0;
  let step = amount * TRAM_SERVICE.speedFactor;
  const cap = limit();
  if (cap !== null && cap !== undefined) step = Math.min(step, Math.max(0, cap));
  if (!(step > 0)) return 0;
  const L = route.length;
  const call = route.calls[v.callIndex % route.calls.length];
  const toCall = ((call.at - v.dist) % L + L) % L || L;
  if (step >= toCall) {
    v.dist = call.at;
    v.callIndex = (v.callIndex + 1) % route.calls.length;
    v.dwellLeft = TRAM_SERVICE.dwellTiles;
    onCall(call);
    return toCall;
  }
  v.dist = (v.dist + step) % L;
  return step;
}

// ── In the game: lines, trams, riders, the month ────────────────────────────────────────────────

const tramRouteCache = new Map();

function getTramLineRoute(line, state = tramState()) {
  const stops = getTramLineStops(line, state);
  if (stops.length < 2) return null;
  const geo = typeof getTramTrackGeometry === 'function' ? getTramTrackGeometry() : null;
  if (!geo) return null;
  const key = `${tramNetworkRevision}|${typeof tramStateStamp === 'function' ? tramStateStamp() : ''}|${line.id}|${line.stopIds.join(',')}`;
  if (!tramRouteCache.has(key)) {
    if (tramRouteCache.size > 64) tramRouteCache.clear();
    const route = buildTramLineRoute(geo, stops);
    tramRouteCache.set(key, route.code ? null : { route, key });
  }
  return tramRouteCache.get(key);
}

// A round trip as long as it takes, in the sky's minutes at the speed the game runs now (the trams
// keep the traffic's pace, so a faster game sees fewer trips a day). For the routes window.
function tramRoundTripMinutes(route) {
  const visual = typeof getVehicleVisualSpeedMultiplier === 'function' ? Math.max(1, getVehicleVisualSpeedMultiplier()) : 1;
  const sky = typeof getDayNightSpeedMultiplier === 'function' ? Math.max(1, getDayNightSpeedMultiplier()) : 1;
  const tilesPerSecond = (typeof TRAFFIC_VISUAL_CONFIG !== 'undefined' ? TRAFFIC_VISUAL_CONFIG.baseSpeedTilesPerSecond : 0.9) * visual;
  const seconds = (route.length / TRAM_SERVICE.speedFactor + route.calls.length * TRAM_SERVICE.dwellTiles) / tilesPerSecond;
  const skyMinutesPerSecond = 1440 / ((typeof GAME_DAY_NIGHT_CYCLE_REAL_MS === 'number' ? GAME_DAY_NIGHT_CYCLE_REAL_MS : 480000) / 1000) * sky;
  return seconds * skyMinutesPerSecond;
}

function tramSkyMinutes(envMinutes) {
  return envMinutes + (typeof GAME_DAY_START_MINUTES === 'number' ? GAME_DAY_START_MINUTES : 360);
}

function isTramRunning(skyMinutes) {
  const m = ((Math.floor(skyMinutes) % 1440) + 1440) % 1440;
  return m >= TRAM_SERVICE.serviceFromMinute && m < TRAM_SERVICE.serviceToMinute;
}

// Where a new tram joins its line: in the middle of the widest gap (as a ferry does).
function tramJoiningPhase(phases) {
  return typeof ferryJoiningPhase === 'function' ? ferryJoiningPhase(phases) : (phases.length ? (phases.at(-1) + 0.5) % 1 : 0);
}

function buyTram(lineId) {
  const state = tramState();
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return { ok: false, code: 'line' };
  const fleet = getTramLineTrams(line, state);
  if (fleet.length >= TRAM_SERVICE.maxTramsPerLine) return { ok: false, code: 'full' };
  if (typeof spendTransportConstruction === 'function' && !spendTransportConstruction(TRAM_SERVICE.tramPrice)) return { ok: false, code: 'funds' };
  const plan = getTramLineRoute(line, state);
  const phases = plan ? fleet.map((v) => (Number(v.dist) || 0) / plan.route.length) : fleet.map((v) => v.phase);
  const phase = tramJoiningPhase(phases.sort((a, b) => a - b));
  const tram = {
    id: `tram-${state.nextId++}`, lineId, phase, aboard: 0,
    dist: plan ? phase * plan.route.length : 0, dwellLeft: 0, callIndex: plan ? tramNextCallIndex(plan.route, phase * plan.route.length) : 0,
    livery: TRAM_LIVERIES[state.trams.length % TRAM_LIVERIES.length],
    purchasePrice: TRAM_SERVICE.tramPrice, ageMonths: 0, tilesThisMonth: 0, monthToDateRevenue: 0, lastMonthRevenue: 0,
  };
  state.trams.push(tram);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return { ok: true, tram };
}

function sellTramNow(state, v) {
  const value = Math.round(v.purchasePrice * (typeof TRANSPORT_VEHICLE_RESALE_FACTOR === 'number' ? TRANSPORT_VEHICLE_RESALE_FACTOR : 0.5));
  state.trams = state.trams.filter((x) => x !== v);
  const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
  if (transport) transport.company.cash = Math.round(transport.company.cash + value);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return value;
}

function sellOneTram(lineId) {
  const state = tramState();
  const fleet = state.trams.filter((v) => v.lineId === lineId);
  return fleet.length ? sellTramNow(state, fleet.at(-1)) : 0;
}

function removeTramLine(lineId) {
  const state = tramState();
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return 0;
  const value = getTramLineTrams(line, state).reduce((sum, v) => sum + sellTramNow(state, v), 0);
  state.lines = state.lines.filter((l) => l !== line);
  if (tramLineDraft?.lineId === lineId) tramLineDraft = null;
  tramNetworkRevision += 1;
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return value;
}

function setTramLineSuspended(lineId, suspended) {
  const line = tramState().lines.find((l) => l.id === lineId);
  if (!line) return false;
  line.status = suspended ? 'suspended' : 'active';
  return true;
}

const TRAM_LINE_NAMES = Object.freeze(['堅尼地城－筲箕灣', '屈地街－北角', '跑馬地－銅鑼灣', '上環－跑馬地', '石塘咀－銅鑼灣', '堅尼地城－跑馬地']);

// The 電車路線 tool: a stop, then the next, and so on - each joined to the last along the track;
// the last again to finish. A stop at the end of a line carries that line on.
function handleTramLineClick(scene, row, col) {
  const say = (key, fallback, vars = {}, kind = 'info') => { if (typeof showToast === 'function') showToast(tramT(key, fallback, vars), kind); return kind !== 'warning'; };
  const stop = getTramStopAt(row, col);
  if (!stop) return say('tram.line.pickStop', '撳一個電車站。', {}, 'warning');
  const state = tramState();
  const draftLine = tramLineDraft?.lineId ? state.lines.find((l) => l.id === tramLineDraft.lineId) : null;
  const pending = tramLineDraft?.firstStopId && !draftLine ? getTramStopById(tramLineDraft.firstStopId, state) : null;
  if (!draftLine && !pending) {
    const ending = tramLineDraft?.forceNew ? null
      : getTramStopLines(stop, state).find((l) => l.stopIds[0] === stop.id || l.stopIds.at(-1) === stop.id);
    if (ending) {
      if (ending.stopIds[0] === stop.id) ending.stopIds.reverse();
      tramLineDraft = { lineId: ending.id };
      tramNetworkRevision += 1;
      return say('tram.line.extend', '延長「{line}」：撳下一個站；再撳「{name}」完成。', { line: ending.name, name: stop.name });
    }
    if (state.lines.length >= TRAM_SERVICE.maxLines) { tramLineDraft = null; return say('tram.line.max', '電車綫數目已經到上限。', {}, 'warning'); }
    tramLineDraft = { firstStopId: stop.id };
    return say('tram.line.pickSecond', '由「{name}」開出：撳下一個電車站。', { name: stop.name });
  }
  const last = draftLine ? getTramStopById(draftLine.stopIds.at(-1), state) : pending;
  if (last.id === stop.id) { tramLineDraft = null; if (draftLine) announceTramLineOpened(draftLine); return say('tram.line.done', '完成。'); }
  if (draftLine?.stopIds.includes(stop.id)) {
    return say('tram.line.again', '「{line}」已經經過「{name}」。', { line: draftLine.name, name: stop.name }, 'warning');
  }
  if (draftLine && draftLine.stopIds.length >= TRAM_SERVICE.maxStopsPerLine) {
    tramLineDraft = null;
    return say('tram.line.full', '一條電車綫最多 {n} 個站。', { n: TRAM_SERVICE.maxStopsPerLine }, 'warning');
  }
  // joined along the track, the whole line so far with it
  const stops = draftLine ? [...getTramLineStops(draftLine, state), stop] : [last, stop];
  const geo = getTramTrackGeometry();
  const route = buildTramLineRoute(geo, stops);
  if (route.code) {
    return say('tram.line.noTrack', '「{from}」同「{to}」之間冇電車路軌連住（或者要掉頭先去到）：先鋪路軌。', { from: last.name, to: stop.name }, 'warning');
  }
  if (draftLine) {
    draftLine.stopIds.push(stop.id);
    tramNetworkRevision += 1;
    if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
    return say('tram.line.extended', '「{line}」延長到「{name}」。撳下一個站，或者再撳「{name}」完成。', { line: draftLine.name, name: stop.name }, 'success');
  }
  const index = state.lines.length;
  const line = {
    id: `tline-${state.nextId++}`,
    name: tramT(`tram.line.defaultName${index % TRAM_LINE_NAMES.length}`, TRAM_LINE_NAMES[index % TRAM_LINE_NAMES.length]),
    color: TRAM_LINE_COLORS[index % TRAM_LINE_COLORS.length],
    stopIds: [pending.id, stop.id], status: 'active', monthToDatePassengers: 0, monthToDateRevenue: 0, history: [], newsPending: true,
  };
  state.lines.push(line);
  tramLineDraft = { lineId: line.id };
  tramNetworkRevision += 1;
  const bought = buyTram(line.id).ok;
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return bought
    ? say('tram.line.opened', '「{line}」開咗，買咗一架電車。撳下一個站延長，或者再撳「{name}」完成。', { line: line.name, name: stop.name }, 'success')
    : say('tram.line.openedNoTram', '「{line}」開咗，但公司資金唔夠買電車（${price}）：喺運輸公司路線表加車。', { line: line.name, price: TRAM_SERVICE.tramPrice.toLocaleString() }, 'warning');
}

function cancelTramLineDraft() {
  const draftLine = tramLineDraft?.lineId ? tramState().lines.find((l) => l.id === tramLineDraft.lineId) : null;
  tramLineDraft = null;
  if (draftLine) announceTramLineOpened(draftLine);
}

// A new line in 香城討論區, once (as the metro's): when it is drawn to its end.
function announceTramLineOpened(line, state = tramState()) {
  if (!line?.newsPending || typeof city === 'undefined') return false;
  if (tramLineDraft?.lineId === line.id) return false;
  delete line.newsPending;
  if (typeof addForumPost !== 'function') return false;
  const stops = getTramLineStops(line, state);
  if (stops.length < 2) return false;
  const cityName = String(city.name || '').trim() || '香城';
  const headline = `【叮叮新綫】${line.name}今日通車　街坊：平、密、慢慢睇風景`;
  if (typeof addCityNews === 'function') addCityNews(headline);
  addForumPost({
    headline,
    image: 'UI/news/tramDriver.webp',
    body: [
      `${cityName}電車「${line.name}」今日通車，由「${stops[0].name}」開往「${stops.at(-1).name}」，沿途 ${stops.length} 個站。`,
      '車費劃一（落車先俾），班次密，短途街坊最受惠；有老街坊話坐上層吹住風睇街景，係全城最平嘅觀光團。',
    ],
    source: 'local',
    social: { likes: 3200, laughs: 420, angry: 15, commentCount: 680, shares: 950 },
  }, { id: `tramLineOpen-${line.id}`, category: '城中熱話', author: '運輸公司' });
  return true;
}

function tramStopCatchmentPoint(stop) {
  return { id: `tram-${stop.id}`, row: stop.row, col: stop.col, radius: TRAM_SERVICE.catchmentRadius };
}

// Hour by hour each stop's riders join its queues, split over the lines calling there.
function accrueTramStopsForHour(state, envHour) {
  if (typeof getTransportStopRidersForHour !== 'function') return;
  const dayStart = typeof GAME_DAY_START_MINUTES === 'number' ? GAME_DAY_START_MINUTES : 360;
  const hour = ((envHour + Math.floor(dayStart / 60)) % 24 + 24) % 24;
  const resetHour = typeof TRANSPORT_STOP_POOL_RESET_HOUR === 'number' ? TRANSPORT_STOP_POOL_RESET_HOUR : 4;
  const share = (typeof TRANSPORT_STOP_DAILY_BOARDING_SHARE === 'number' ? TRANSPORT_STOP_DAILY_BOARDING_SHARE : 0.75) * TRAM_SERVICE.boardingShare;
  const active = state.lines.filter((l) => l.status === 'active' && getTramLineTrams(l, state).length);
  state.stops.forEach((stop) => {
    if (hour === resetHour || !stop.waitingByLine) stop.waitingByLine = {};
    const lines = active.filter((l) => l.stopIds.includes(stop.id));
    if (!lines.length) { stop.waitingByLine = {}; return; }
    const riders = getTransportStopRidersForHour(tramStopCatchmentPoint(stop), hour, share);
    lines.forEach((l) => { stop.waitingByLine[l.id] = Math.min(9999, (stop.waitingByLine[l.id] || 0) + riders / lines.length); });
  });
}

// A tram calls at a stop: riders off, the queue for the way it leaves on, their fares paid.
function tramCallAt(state, line, v, route, call) {
  const stops = getTramLineStops(line, state);
  const n = stops.length;
  const stop = stops[call.stop];
  if (!stop) return;
  const i = route.calls.indexOf(call);
  const prev = route.calls[(i - 1 + route.calls.length) % route.calls.length];
  // the way it came, this stop and those beyond it; the way it leaves, the stops ahead
  const arrivingAhead = prev.leaving > 0 ? n - call.stop : call.stop + 1;
  const leavingAhead = call.leaving > 0 ? n - 1 - call.stop : call.stop;
  const waiting = stop.waitingByLine?.[line.id] || 0;
  const r = tramCall({ aboard: v.aboard, waiting, arrivingAhead, share: leavingAhead / Math.max(1, n - 1) });
  v.aboard = v.aboard - r.alighting + r.boarding;
  if (stop.waitingByLine) stop.waitingByLine[line.id] = Math.max(0, waiting - r.boarding);
  const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
  if (r.revenue > 0 && transport) {
    transport.company.cashFraction = (Number(transport.company.cashFraction) || 0) + r.revenue;
    const whole = Math.floor(transport.company.cashFraction);
    if (whole > 0) { transport.company.cash += whole; transport.company.cashFraction -= whole; }
    line.monthToDateRevenue += r.revenue;
    v.monthToDateRevenue += r.revenue;
  }
  line.monthToDatePassengers += r.boarding;
}

// From the transport company's clock (advanceTransportClock, environment minutes): the stops'
// queues, hour by hour.
function advanceTramClock(fromMinutes, toMinutes) {
  if (typeof mapData === 'undefined' || !(toMinutes > fromMinutes)) return;
  const state = tramState();
  if (!state.lines.length) return;
  for (let h = Math.floor(fromMinutes / 60) + 1; h * 60 <= toMinutes; h++) accrueTramStopsForHour(state, h);
}

// How often a tram waited, and for what (frames): for checking in the game.
const tramQueueStats = { tram: 0, car: 0, signal: 0 };

// The way each tram was last put on (not saved: a tram loaded is put back on its line's way).
const tramRouteKeys = new WeakMap();

// Each frame (updateTramService), seen or not: every running tram a step at the traffic's pace -
// held by the tram ahead of it, and on a narrow road by the car or bus ahead and the red light.
function advanceTramFleet(scene, delta, amount = null) {
  const state = tramState();
  if (!state.trams.length) return;
  if (amount === null) {
    if (typeof computeTrafficProgressAmount !== 'function') return;
    const paused = typeof isGamePaused === 'function' ? isGamePaused() : (typeof simPaused !== 'undefined' && simPaused);
    amount = computeTrafficProgressAmount(delta, paused, typeof getVehicleVisualSpeedMultiplier === 'function' ? getVehicleVisualSpeedMultiplier() : 1);
  }
  const sky = typeof getTyphoonShelterFleetClock === 'function' ? getTyphoonShelterFleetClock() : 0;
  if (!(amount > 0) || !isTramRunning(sky)) return;
  // where each is now, for the ones behind
  const placed = [];
  const plans = new Map();
  state.lines.forEach((line) => {
    if (line.status !== 'active') return;
    const plan = getTramLineRoute(line, state);
    if (!plan) return;
    plans.set(line.id, plan);
    getTramLineTrams(line, state).forEach((v) => {
      // (a line's way changed under it: put it back on it)
      if (tramRouteKeys.get(v) !== plan.key) {
        v.dist = ((Number(v.dist) || v.phase * plan.route.length) % plan.route.length + plan.route.length) % plan.route.length;
        v.callIndex = tramNextCallIndex(plan.route, v.dist);
        tramRouteKeys.set(v, plan.key);
      }
      placed.push({ v, line, ...tramRoutePointAt(plan.route, v.dist) });
    });
  });
  const traffic = scene ? [...(scene.trafficVisualState?.vehicles || []), ...(scene.transportVisualState?.vehicles || [])]
    .map(trafficVehicleMapPoint).filter(Boolean) : [];
  placed.forEach((t) => {
    const plan = plans.get(t.line.id);
    const moved = stepTram(t.v, plan.route, amount, {
      blocked: () => {
        if (placed.some((o) => o !== t && tramBlockedBy(t.pos, t.heading, o.pos, o.heading, TRAM_SERVICE.tramSpacingTiles, 0.15))) { tramQueueStats.tram++; return true; }
        if (t.traffic && traffic.some((o) => tramBlockedBy(t.pos, t.heading, o.pos, o.heading, TRAM_SERVICE.trafficSpacingTiles))) { tramQueueStats.car++; return true; }
        return false;
      },
      limit: () => {
        if (!t.traffic || !scene || typeof getTrafficSignalHoldProgress !== 'function') return null;
        const leg = tramAsTrafficLeg(t.pos, t.heading);
        const hold = getTrafficSignalHoldProgress(scene, leg.current, leg.next, leg.progress, TRAM_SERVICE.headwayFactor);
        if (hold !== null && hold - leg.progress < 0.02) tramQueueStats.signal++;
        return hold === null ? null : hold - leg.progress;
      },
      onCall: (call) => tramCallAt(state, t.line, t.v, plan.route, call),
    });
    t.v.tilesThisMonth += moved;
  });
}

// The month for the company's books (settleTransportMonth): the fares (credited at each call), the
// riders, and the costs - each tram's upkeep and running, the stops' and the track's upkeep.
function settleTramMonth(ended = null) {
  const state = tramState();
  state.lines.forEach((line) => announceTramLineOpened(line, state));
  const out = { revenue: 0, passengers: 0, cost: 0 };
  state.lines.forEach((line) => {
    const fleet = getTramLineTrams(line, state);
    const cost = fleet.reduce((sum, v) => sum + TRAM_SERVICE.tramMonthlyUpkeep + v.tilesThisMonth * TRAM_SERVICE.tileRunningCost, 0);
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
  state.trams.forEach((v) => {
    v.lastMonthRevenue = v.monthToDateRevenue;
    v.monthToDateRevenue = 0;
    v.tilesThisMonth = 0;
    v.ageMonths += 1;
  });
  out.cost += state.stops.length * TRAM_SERVICE.stopMonthlyUpkeep;
  out.cost += Object.keys(state.tracks).length * TRAM_SERVICE.trackMonthlyUpkeepPerTile;
  return out;
}

// ── Drawing: the stops and the trams ────────────────────────────────────────────────────────────

function tramScreenAt(scene, x, y) {
  if (typeof metroSurfaceScreenAt === 'function') return metroSurfaceScreenAt(scene, x, y);
  const ri = Math.floor(y), ci = Math.floor(x);
  const f = getTileFaceGeometry(ri, ci, scene.offsetX, scene.offsetY).center;
  const p0 = isoToScreen(ci + 0.5, ri + 0.5), p1 = isoToScreen(x, y);
  return { x: f.x + p1.x - p0.x, y: f.y + p1.y - p0.y };
}

function tramDepthAt(x, y) {
  return getWorldDepth('object', isoToScreen(x, y).y + TILE_HEIGHT / 2);
}

function tramArtLoaded(scene) {
  return typeof TRAM_ART !== 'undefined' && Object.values(TRAM_ART).every((a) => scene.textures.exists(a.key) && (!a.lit || scene.textures.exists(a.lit.key)));
}

function loadTramArt(scene) {
  if (typeof TRAM_ART === 'undefined' || scene.__tramArtLoading) return;
  const all = Object.values(TRAM_ART).flatMap((a) => [a, a.lit].filter(Boolean)).filter((a) => !scene.textures.exists(a.key));
  if (!all.length) return;
  scene.__tramArtLoading = true;
  all.forEach((a) => scene.load.image(a.key, typeof resolveModelAssetPath === 'function' ? resolveModelAssetPath(a.path) : a.path));
  scene.load.once('complete', () => { scene.__tramArtLoading = false; scene.__tramStopSignature = null; });
  scene.load.start();
}

function newTramSprite(scene, key) {
  const s = scene.add.image(0, 0, key);
  if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, s, 'objectLayer');
  if (scene.worldMask) s.setMask(scene.worldMask);
  return s;
}

// A stop's two platforms (§5b): either side of its track's middle - on the reservation, or on the
// pavements - each boarding toward the track; the picture with its boarding side toward the viewer
// or away, turned with the road.
function syncTramStops(scene) {
  if (!scene.tramStopSprites) scene.tramStopSprites = new Map();
  const state = tramState();
  const turn = typeof mapRotation === 'number' ? mapRotation : 0;
  const signature = `${state.stops.map((s) => `${s.id}@${s.row},${s.col}`).join('|')}#${turn}#${scene.offsetX},${scene.offsetY}`;
  if (scene.__tramStopSignature === signature) return;
  scene.__tramStopSignature = signature;
  const wanted = new Set();
  state.stops.forEach((stop) => {
    const off = stop.band ? TRAM_STOP_OFFSET.reservation : TRAM_STOP_OFFSET.kerb;
    const along = stop.axis === 'ns' ? [0, 1] : [1, 0];
    const across = stop.axis === 'ns' ? [1, 0] : [0, 1];
    const cx = stop.col + (stop.band && stop.axis === 'ns' ? 1 : 0.5), cy = stop.row + (stop.band && stop.axis === 'ew' ? 1 : 0.5);
    const a0 = isoToScreen(cx, cy), a1 = isoToScreen(cx + along[0], cy + along[1]);
    const fall = (a1.x - a0.x) * (a1.y - a0.y) > 0;
    [-1, 1].forEach((sg) => {
      const x = cx + across[0] * off * sg, y = cy + across[1] * off * sg;
      // its boarding side faces the track: toward the viewer if that way is down the screen
      const f0 = isoToScreen(x, y), f1 = isoToScreen(x - across[0] * sg, y - across[1] * sg);
      const front = f1.y > f0.y;
      const art = TRAM_ART[front ? 'stop_front' : 'stop_back'];
      const id = `${stop.id}|${sg}`;
      wanted.add(id);
      let sprite = scene.tramStopSprites.get(id);
      if (!sprite) { sprite = newTramSprite(scene, art.key); scene.tramStopSprites.set(id, sprite); }
      if (sprite.texture.key !== art.key) sprite.setTexture(art.key);
      const p = tramScreenAt(scene, x, y);
      sprite.setFlipX(!fall).setOrigin(fall ? art.anchor[0] / art.size[0] : 1 - art.anchor[0] / art.size[0], art.anchor[1] / art.size[1]);
      sprite.setScale(art.scale * TILE_WIDTH / 100).setPosition(p.x, p.y).setDepth(tramDepthAt(x, y));
      sprite.__nightGround = true;
      sprite.__tramStopArt = art;
    });
  });
  scene.tramStopSprites.forEach((sprite, id) => {
    if (wanted.has(id)) return;
    sprite.__tramLit?.destroy();
    sprite.destroy();
    scene.tramStopSprites.delete(id);
  });
}

// A tram as a car is, for the traffic's queueing (traffic-visuals.js buildTrafficLegBuckets): the
// tile it is on, the next it heads for and how far along, from tile middle to tile middle.
function tramAsTrafficLeg(pos, heading) {
  const alongX = Math.abs(heading[0]) >= Math.abs(heading[1]);
  const a = alongX ? pos[0] : pos[1];
  const other = Math.floor(alongX ? pos[1] : pos[0]);
  const step = Math.sign(alongX ? heading[0] : heading[1]) || 1;
  const k = step > 0 ? Math.floor(a - 0.5) : Math.ceil(a - 0.5);
  const progress = step > 0 ? a - 0.5 - k : k - (a - 0.5);
  const tile = (i) => (alongX ? { row: other, col: i } : { row: i, col: other });
  return { current: tile(k), next: tile(k + step), progress };
}

// The traffic's place on the map (a car's, a bus's): from its tile to the next.
function trafficVehicleMapPoint(vehicle) {
  if (!vehicle?.current || !vehicle?.next) return null;
  const p = Number.isFinite(vehicle.renderedProgress) ? vehicle.renderedProgress : Number(vehicle.progress) || 0;
  const dc = vehicle.next.col - vehicle.current.col, dr = vehicle.next.row - vehicle.current.row;
  return { pos: [vehicle.current.col + 0.5 + dc * p, vehicle.current.row + 0.5 + dr * p], heading: [dc, dr] };
}

// Whether something at `other` going `otherHeading` is in front of a tram, in its lane, nearer than
// `gap` (middles). Pure.
function tramBlockedBy(pos, heading, other, otherHeading, gap, lateral = 0.35) {
  if (heading[0] * otherHeading[0] + heading[1] * otherHeading[1] < 0.7) return false;
  const dx = other[0] - pos[0], dy = other[1] - pos[1];
  const ahead = dx * heading[0] + dy * heading[1];
  const side = Math.abs(dx * heading[1] - dy * heading[0]);
  return ahead > 0.01 && ahead < gap && side < lateral;
}

// The trams, each frame (main.js update via updateTram): where each is on its line, drawn and lit,
// and handed to the traffic to queue behind.
function updateTramVehicles(scene) {
  const state = tramState();
  if (!scene.tramSprites) scene.tramSprites = new Map();
  scene.tramTrafficLeaders = [];
  if (!state.lines.length && !scene.tramSprites.size) return;
  const sky = typeof getTyphoonShelterFleetClock === 'function' ? getTyphoonShelterFleetClock() : 0;
  const trams = [];
  if (isTramRunning(sky)) {
    state.lines.forEach((line) => {
      if (line.status !== 'active') return;
      const plan = getTramLineRoute(line, state);
      if (!plan) return;
      getTramLineTrams(line, state).forEach((v) => trams.push({ v, ...tramRoutePointAt(plan.route, Number(v.dist) || 0) }));
    });
  }
  const strength = typeof getRuntimeTrafficLightStrength === 'function' ? getRuntimeTrafficLightStrength(scene) : 0;
  const seen = new Set();
  trams.forEach((t) => {
    const [x, y] = t.pos;
    const p0 = isoToScreen(x, y), p1 = isoToScreen(x + t.heading[0], y + t.heading[1]);
    const sdx = p1.x - p0.x, sdy = p1.y - p0.y;
    const view = sdx * sdy > 0 ? 'fall' : 'rise';
    const art = TRAM_ART[`${t.v.livery}_${view}`] || TRAM_ART[`green_${view}`];
    let sprite = scene.tramSprites.get(t.v.id);
    if (!sprite) { sprite = newTramSprite(scene, art.key); scene.tramSprites.set(t.v.id, sprite); }
    seen.add(t.v.id);
    if (sprite.texture.key !== art.key) sprite.setTexture(art.key);
    const at = tramScreenAt(scene, x, y);
    sprite.setOrigin(art.anchor[0] / art.size[0], art.anchor[1] / art.size[1]).setScale(art.scale * TILE_WIDTH / 100);
    sprite.setPosition(at.x, at.y).setDepth(tramDepthAt(x, y)).setVisible(true);
    sprite.__nightGround = false;
    if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
    // its front seen when it runs the way its picture's cab faces on the screen
    syncTramVehicleLamps(scene, sprite, art, (sdx > 0) === (view === 'fall'), strength);
    if (t.traffic) {
      const leg = tramAsTrafficLeg(t.pos, t.heading);
      scene.tramTrafficLeaders.push({ ...leg, renderedProgress: leg.progress, model: { headwayFactor: TRAM_SERVICE.headwayFactor, category: 'tram' }, tram: true });
    }
  });
  scene.tramSprites.forEach((sprite, id) => {
    if (seen.has(id)) return;
    (sprite.__tramLamps || []).forEach((l) => l.destroy());
    sprite.destroy();
    scene.tramSprites.delete(id);
  });
}

// The stops' lights each frame (their strip lights come on with the windows).
function updateTramStopLights(scene) {
  if (!scene.tramStopSprites?.size) return;
  const strength = Number(scene.buildingLightStrength) || 0;
  scene.tramStopSprites.forEach((sprite) => {
    if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
    syncTramStopLight(scene, sprite, sprite.__tramStopArt, strength);
  });
}

function updateTramService(scene, delta = 16) {
  if (!scene?.add || typeof getTransportExpansionState !== 'function' || !getTransportExpansionState()?.tram) return;
  const state = tramState();
  if (!state.stops.length && !state.lines.length && !scene.tramStopSprites?.size && !scene.tramSprites?.size) return;
  // (the trams run whether drawn or not, as the buses do)
  advanceTramFleet(scene, delta);
  if (!tramArtLoaded(scene)) { loadTramArt(scene); return; }
  syncTramStops(scene);
  updateTramStopLights(scene);
  updateTramVehicles(scene);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TRAM_SERVICE, whyNotTramStopAt, buildTramLineRoute, tramRoutePointAt, stepTram, tramNextCallIndex,
    tramCall, tramStopLink, tramStopLinkIsPlain, tramAsTrafficLeg, tramBlockedBy, tramLeftRail,
  };
}
