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
  return { tracks, trackElev, nextId: Math.max(1, Math.floor(Number(src.nextId) || 1)) };
}

function getLightRailState() {
  const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
  if (!transport) return normalizeLightRailState(null);
  if (!transport.lightRail) transport.lightRail = normalizeLightRailState(null);
  return transport.lightRail;
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

// After track is laid or taken up: the kerbside things worked out again.
function onLightRailTracksChanged(scene) {
  if (!scene) return;
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
  const plan = planLightRailTrackPure(start, end, height, getLightRailState(), lightRailMapEnv());
  if (plan.ok && typeof isTransportExpansionActive === 'function' && !isTransportExpansionActive()) {
    return { ...plan, ok: false, reason: 'company' };
  }
  return plan;
}

const LIGHT_RAIL_TRACK_REFUSALS = Object.freeze({
  company: ['lightRail.track.company', '要先開辦運輸公司，輕鐵由公司出錢起。'],
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
  if (plan.cost > 0 && !(typeof spendTransportConstruction === 'function' && spendTransportConstruction(plan.cost))) {
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
  // street track and level crossings: drawn on their road tiles as the tram's is
  geo.tiles.forEach((cell, key) => {
    const road = getTileSprite(scene, cell.row, cell.col);
    if (!road) return;
    const picture = tramTilePicture(geo, cell, turn);
    // (its own keys: the tram drops the pictures its own tiles no longer show)
    picture.key = `lrt_${picture.key}`;
    if (!scene.textures.exists(picture.key)) drawTramTrackPicture(scene, picture);
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
}

// The track's upkeep for the company's month.
function getLightRailTrackMonthlyUpkeep() {
  if (typeof getTransportExpansionState !== 'function') return 0;
  return Object.keys(getTransportExpansionState()?.lightRail?.tracks || {}).length * LIGHT_RAIL.monthlyUpkeepPerTile;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LIGHT_RAIL, LIGHT_RAIL_SPEC, normalizeLightRailState, lightRailRoadAxis, lightRailCrossesRoad, lightRailTileKind,
    planLightRailTrackPure,
  };
}
