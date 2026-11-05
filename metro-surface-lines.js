// 地鐵第三期 (docs/metro-phase3-design.md §3, §5): surface stations, lines on the track, and the
// trains drawn running on it. A surface station is a platform on five straight track tiles (a
// four-car train, 90 m); a surface line runs station to station along the track laid
// (metro-surface.js), found tile by tile through the TrackBits; its trains are worked out from the
// clock like the underground ones (metro.js) and drawn car by car, on the left-hand track (the
// MTR's), each car's picture by its way on the map (metro-train-art.js).

const METRO_SURFACE = Object.freeze({
  stationCost: 8000,            // no digging: an underground station is 15,000
  platformTiles: 5,
  // trains on the surface run slower than in the tunnels, so they can be watched (Norton,
  // 2026-11-05: 30% slower than the first 2)
  speedTilesPerMinute: 1.4,
  dwellMinutes: 2,
  carTiles: 22.5 / 20,          // an MTR car, 22.5 m
  carGapTiles: 0.06,
  cars: 4,
  trackOffsetTiles: 2.25 / 20,  // each track crosses a tile edge this far from its middle
  endRunTiles: 2.5,             // the line's geometry runs on past the end stations to their platforms' ends
  // 剪式渡綫: a terminus has a scissors crossover just outside its platforms, as the MTR's do - a
  // train coming in crosses to the platform it is given, and back to the left-hand track leaving
  crossoverTiles: 2,
  zPxPerMetre: 10,              // as the platforms' and viaduct's art, on a 512-px tile
});

// ── Pure: stations and the way along the track ──────────────────────────────────

// The five tiles of a surface station: along its axis, centred on its tile.
function surfaceStationTiles(station) {
  const half = Math.floor(METRO_SURFACE.platformTiles / 2);
  const out = [];
  for (let k = -half; k <= half; k++) {
    out.push(station.axis === 'ns' ? [station.row + k, station.col] : [station.row, station.col + k]);
  }
  return out;
}

/**
 * Whether a platform may go here: five straight track tiles along one axis, centred on (row, col),
 * none of them another station's. Pure with `bits` (TrackBits by "row:col") and `isStationTile`.
 * Returns { axis } or { code: 'notStraight' }.
 */
function whyNotSurfaceStationAt(row, col, bits, isStationTile = () => false) {
  const mask = bits[`${row}:${col}`];
  const axis = mask === 1 ? 'ns' : mask === 2 ? 'we' : null;
  if (!axis) return { code: 'notStraight' };
  const ok = surfaceStationTiles({ row, col, axis }).every(([r, c]) => bits[`${r}:${c}`] === mask && !isStationTile(r, c));
  return ok ? { axis } : { code: 'notStraight' };
}

// The middle of a tile's side, in (col, row): where the track crosses it.
function railEdgeMiddle(row, col, side) {
  return { n: [col + 0.5, row], s: [col + 0.5, row + 1], w: [col, row + 0.5], e: [col + 1, row + 0.5] }[side];
}

/**
 * The way along the track from one station's middle tile to another's: [{ row, col, entry, exit }]
 * tile by tile (the first tile has no entry, the last no exit), or null. Pure: a breadth-first
 * search through the TrackBits, a tile entered by one side left by the other side of any bit
 * that has it.
 */
function findSurfacePath(bits, from, to) {
  const DIRS = { n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] };
  const OPP = { n: 's', e: 'w', s: 'n', w: 'e' };
  const SIDES = { 1: ['s', 'n'], 2: ['w', 'e'], 4: ['w', 'n'], 8: ['s', 'e'], 16: ['w', 's'], 32: ['n', 'e'] };
  const exitsFrom = (mask, entry) => [1, 2, 4, 8, 16, 32].filter((b) => (mask & b) && SIDES[b].includes(entry))
    .map((b) => SIDES[b].find((s) => s !== entry));
  const startExits = from.axis === 'ns' ? ['n', 's'] : ['w', 'e'];
  const seen = new Map();
  const queue = [];
  startExits.forEach((exit) => {
    const [dr, dc] = DIRS[exit];
    const r = from.row + dr, c = from.col + dc, entry = OPP[exit];
    const mask = bits[`${r}:${c}`] || 0;
    if (!exitsFrom(mask, entry).length && !(r === to.row && c === to.col && mask)) return;
    const key = `${r}:${c}:${entry}`;
    seen.set(key, { prev: null, firstExit: exit, row: r, col: c, entry });
    queue.push(key);
  });
  while (queue.length) {
    const key = queue.shift();
    const node = seen.get(key);
    if (node.row === to.row && node.col === to.col) {
      // back to the start
      const steps = [];
      for (let k = key; k; k = seen.get(k).prev) steps.unshift(seen.get(k));
      const out = [{ row: from.row, col: from.col, entry: null, exit: steps[0].firstExit }];
      steps.forEach((s, i) => out.push({ row: s.row, col: s.col, entry: s.entry, exit: i < steps.length - 1 ? steps[i + 1].fromExit : null }));
      return out;
    }
    const mask = bits[`${node.row}:${node.col}`] || 0;
    for (const exit of exitsFrom(mask, node.entry)) {
      const [dr, dc] = DIRS[exit];
      const r = node.row + dr, c = node.col + dc, entry = OPP[exit];
      const next = `${r}:${c}:${entry}`;
      if (seen.has(next) || !(bits[`${r}:${c}`] || 0)) continue;
      if (!exitsFrom(bits[`${r}:${c}`], entry).length) continue;
      seen.set(next, { prev: key, row: r, col: c, entry, fromExit: exit });
      queue.push(next);
    }
  }
  return null;
}

/**
 * A surface line's centre line through its stations: vertices in (col, row) with how a track sits
 * beside each (`across`: the unit direction a track is offset along there - the tile edge it
 * crosses, or square to the platform at a station), their distances along, and each station's
 * distance. It runs on past the end stations to their platforms' ends. Pure; null where two
 * stations have no track between them.
 */
function surfaceLineGeometry(stations, bits, elevAt = null) {
  // (elevAt(row, col, side): the track's height in metres where it crosses that side of the tile -
  // on a viaduct or a ramp; 0 on the ground)
  const verts = [];
  const push = (pt, across, z = 0) => {
    const last = verts.at(-1);
    if (last && Math.abs(last.x - pt[0]) < 1e-9 && Math.abs(last.y - pt[1]) < 1e-9) return;
    verts.push({ x: pt[0], y: pt[1], across, z });
  };
  const centreAcross = (st) => (st.axis === 'ns' ? [1, 0] : [0, 1]);
  const edgeAcross = (side) => (side === 'n' || side === 's' ? [1, 0] : [0, 1]);
  const stationIdx = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const path = findSurfacePath(bits, stations[i], stations[i + 1]);
    if (!path) return null;
    stationIdx.push(verts.length === 0 ? 0 : verts.length - 1);
    if (!verts.length) push([stations[i].col + 0.5, stations[i].row + 0.5], centreAcross(stations[i]));
    path.forEach((step, k) => {
      if (step.exit) push(railEdgeMiddle(step.row, step.col, step.exit), edgeAcross(step.exit), elevAt ? elevAt(step.row, step.col, step.exit) : 0);
      if (k === path.length - 1) push([step.col + 0.5, step.row + 0.5], centreAcross(stations[i + 1]));
    });
  }
  stationIdx.push(verts.length - 1);
  // run on past each end station along its platform
  const extend = (atStart) => {
    const a = atStart ? verts[0] : verts.at(-1);
    const b = atStart ? verts[1] : verts.at(-2);
    const dx = a.x - b.x, dy = a.y - b.y, len = Math.hypot(dx, dy) || 1;
    const v = { x: a.x + (dx / len) * METRO_SURFACE.endRunTiles, y: a.y + (dy / len) * METRO_SURFACE.endRunTiles, across: a.across, z: a.z };
    if (atStart) { verts.unshift(v); for (let i = 0; i < stationIdx.length; i++) stationIdx[i] += 1; } else verts.push(v);
  };
  if (verts.length < 2) return null;
  extend(true); extend(false);
  const cum = [0];
  for (let i = 1; i < verts.length; i++) cum.push(cum[i - 1] + Math.hypot(verts[i].x - verts[i - 1].x, verts[i].y - verts[i - 1].y));
  return { verts, cum, stationAt: stationIdx.map((i) => cum[i]), length: cum.at(-1) };
}

/**
 * The track a train runs on, going forward (dir 1, the way the line's stations go) or back: the
 * centre line moved to the left of the way it goes, each vertex along its `across` (so the track
 * crosses each tile edge where the track tiles have it). Pure. [[col, row]].
 */
function surfaceTrackLine(geom, dir) {
  const v = geom.verts;
  return v.map((p, i) => {
    const a = v[Math.max(0, i - 1)], b = v[Math.min(v.length - 1, i + 1)];
    const tx = (b.x - a.x) * dir, ty = (b.y - a.y) * dir;
    // left of (tx, ty) on the map (col right, row down) is (ty, -tx)
    const side = Math.sign(ty * p.across[0] - tx * p.across[1]) || 1;
    return [p.x + p.across[0] * side * METRO_SURFACE.trackOffsetTiles, p.y + p.across[1] * side * METRO_SURFACE.trackOffsetTiles];
  });
}

// A point a distance along a polyline (with its cumulative lengths), clamped to its ends. Pure.
function surfacePointAt(line, cum, x) {
  const d = Math.max(0, Math.min(cum.at(-1), x));
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
  const k = (d - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
  return [line[lo][0] + (line[hi][0] - line[lo][0]) * k, line[lo][1] + (line[hi][1] - line[lo][1]) * k];
}

/**
 * Which track a point of a train is on at distance x along the line, going dir: +1 the track left
 * of the way the line's stations go, -1 the other; in between while it crosses. Away from the ends
 * it keeps left (dir). At a terminus it stands on the platform `picks` gives it (picks.first,
 * picks.last: +1 or -1), crossing over on the two tiles outside the platform. Pure.
 */
function surfaceTrackSide(geom, x, dir, picks = null) {
  if (!picks) return dir;
  const half = METRO_SURFACE.platformTiles / 2;
  const cross = METRO_SURFACE.crossoverTiles;
  const ease = (k) => k * k * (3 - 2 * k);
  const blend = (a, b, k) => a + (b - a) * ease(Math.max(0, Math.min(1, k)));
  const lo = geom.stationAt[0] + half;
  const hi = geom.stationAt.at(-1) - half;
  if (x <= lo + cross) return blend(picks.first, dir, (x - lo) / cross);
  if (x >= hi - cross) return blend(dir, picks.last, (x - (hi - cross)) / cross);
  return dir;
}

/**
 * The cars of a train whose middle is at distance x along the line, going dir: each car's middle
 * (col, row), its way (dcol, drow) and its place ('lead', 'mid', 'trail'). Each car finds its own
 * track (surfaceTrackSide), so a train snakes through a crossover car by car. Pure.
 */
function surfaceTrainCars(geom, x, dir, picks = null) {
  const left = surfaceTrackLine(geom, 1), right = surfaceTrackLine(geom, -1);
  const at = (d) => {
    const side = surfaceTrackSide(geom, d, dir, picks);
    const p = surfacePointAt(left, geom.cum, d), q = surfacePointAt(right, geom.cum, d);
    const k = (1 - side) / 2;
    return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
  };
  // the height there: along the line between its vertices (a viaduct's deck, a ramp's slope)
  const zs = geom.verts.map((v) => v.z || 0);
  const zAt = (d) => surfacePointAt(zs.map((z) => [z, 0]), geom.cum, d)[0];
  const spacing = METRO_SURFACE.carTiles + METRO_SURFACE.carGapTiles;
  const n = METRO_SURFACE.cars;
  const out = [];
  for (let i = 0; i < n; i++) {
    const xi = x + dir * ((n - 1) / 2 - i) * spacing;
    const a = at(xi + dir * METRO_SURFACE.carTiles / 2);
    const b = at(xi - dir * METRO_SURFACE.carTiles / 2);
    out.push({ pos: at(xi), z: zAt(xi), heading: [a[0] - b[0], a[1] - b[1]], role: i === 0 ? 'lead' : i === n - 1 ? 'trail' : 'mid' });
  }
  return out;
}

/**
 * A car's picture (metro-train-art.js) by its way on the map, the map turned `turn` quarter
 * turns, and its place in the train: the cab cars show their cab at the train's ends. Pure.
 */
function surfaceCarView(dcol, drow, role, turn = 0) {
  // the way on screen: turn the map-frame heading with the map
  let c = dcol, r = drow;
  for (let k = 0; k < ((turn % 4) + 4) % 4; k++) { const nc = -r, nr = c; c = nc; r = nr; }
  const k = ((Math.round(Math.atan2(r, c) * 180 / Math.PI / 45) % 8) + 8) % 8;
  const axis = ['fall', 'vert', 'rise', 'horiz', 'fall', 'vert', 'rise', 'horiz'][k];
  if (role === 'mid') return axis + '_mid';
  if (axis === 'horiz') {
    const frontRight = k === 7;
    return (role === 'lead' ? frontRight : !frontRight) ? 'horiz_cabR' : 'horiz_cabL';
  }
  const frontNear = k <= 2;
  return axis + ((role === 'lead' ? frontNear : !frontNear) ? '_cabNear' : '_cabFar');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    METRO_SURFACE, surfaceStationTiles, whyNotSurfaceStationAt, findSurfacePath, surfaceLineGeometry,
    surfaceTrackLine, surfacePointAt, surfaceTrackSide, surfaceTrainCars, surfaceCarView, surfaceCrossoverTiles,
  };
}

/**
 * The two tiles of a terminus's scissors crossover: on along the line from the platform's end it
 * leaves by, while they are straight track along the station. Pure. [[row, col] x 2] or null.
 */
function surfaceCrossoverTiles(station, nextStation, bits) {
  const path = findSurfacePath(bits, station, nextStation);
  if (!path) return null;
  const exit = path[0].exit;
  const step = { n: [-1, 0], s: [1, 0], w: [0, -1], e: [0, 1] }[exit];
  const half = Math.floor(METRO_SURFACE.platformTiles / 2);
  const mask = station.axis === 'ns' ? 1 : 2;
  const tiles = [half + 1, half + 2].map((k) => [station.row + step[0] * k, station.col + step[1] * k]);
  return tiles.every(([r, c]) => bits[`${r}:${c}`] === mask) ? tiles : null;
}

// ── In the game ───────────────────────────────────────────────────────────────

function isMetroSurfaceStationTile(row, col) {
  if (typeof getTransportExpansionState !== 'function') return false;
  return (getTransportExpansionState()?.metro?.stations || []).some((s) => s.surface && surfaceStationTiles(s).some(([r, c]) => r === row && c === col));
}

function whyNotMetroSurfaceStation(row, col) {
  if (typeof isMetroUnlocked === 'function' && !isMetroUnlocked()) return metroT('metro.station.locked', '城市人口要有 30,000 先可以起地鐵。');
  // (on the ground: an elevated tile is no platform's)
  const elev = getMetroState().trackElev || {};
  const res = whyNotSurfaceStationAt(row, col, getMetroState().tracks, (r, c) => isMetroSurfaceStationTile(r, c) || Boolean(elev[`${r}:${c}`]));
  return res.code ? metroT('metro.surfaceStation.notStraight', '地面站要起喺五格直路軌上（撳中間嗰格）。') : null;
}

// The 地面站 tool: a platform on the five straight tiles centred where it is clicked.
function placeMetroSurfaceStation(scene, row, col) {
  const warn = (msg) => { if (typeof showToast === 'function') showToast(msg, 'warning'); return false; };
  const why = whyNotMetroSurfaceStation(row, col);
  if (why) return warn(why);
  const { axis } = whyNotSurfaceStationAt(row, col, getMetroState().tracks);
  if (!spendMetroFunds(METRO_SURFACE.stationCost)) {
    return warn(metroT('metro.station.funds', '公司資金唔夠起地鐵站（要 ${cost}）。', { cost: METRO_SURFACE.stationCost.toLocaleString() }));
  }
  const state = getMetroState();
  const n = state.nextId++;
  state.stations.push({
    id: `station-${n}`, row, col, facing: 's', surface: true, axis,
    name: metroT('metro.station.name', '地鐵站 {n}', { n }),
    waitingByLine: {}, transferByLine: {}, servedMonths: 0, lastPropertyIncome: 0,
  });
  if (typeof metroNetworkRevision !== 'undefined') metroNetworkRevision += 1;
  syncMetroStations(scene);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  if (typeof showToast === 'function') showToast(metroT('metro.surfaceStation.built', '起好地面站。用「地鐵綫」工具由一個地面站撳去另一個，列車會沿路軌行。'), 'success');
  return true;
}

// A surface line's geometry, worked out again when its stations or the track change.
const surfaceLineGeometryCache = new Map();
function getSurfaceLineGeometry(line, state = getMetroState()) {
  const stations = getMetroLineStations(line, state);
  const key = `${line.id}|${stations.map((s) => `${s.row},${s.col},${s.axis}`).join(';')}|${metroTrackRevisionKey()}`;
  if (surfaceLineGeometryCache.has(key)) return surfaceLineGeometryCache.get(key);
  const elev = state.trackElev || {};
  const elevAt = (r, c, side) => (typeof railSideHeight === 'function' ? railSideHeight(elev[`${r}:${c}`], side) : 0);
  const geom = stations.length >= 2 && stations.every((s) => s.surface) ? surfaceLineGeometry(stations, state.tracks, elevAt) : null;
  if (surfaceLineGeometryCache.size > 64) surfaceLineGeometryCache.clear();
  surfaceLineGeometryCache.set(key, geom);
  return geom;
}

// The tiles the surface lines run over (their track may not be taken up while they do).
function getMetroSurfaceLineTiles(state = getMetroState()) {
  const tiles = new Set();
  state.lines.filter((l) => l.surface).forEach((line) => {
    const stations = getMetroLineStations(line, state);
    for (let i = 0; i < stations.length - 1; i++) {
      (findSurfacePath(state.tracks, stations[i], stations[i + 1]) || []).forEach((s) => tiles.add(`${s.row}:${s.col}`));
    }
  });
  return tiles;
}

// ── Pictures: platforms and trains ─────────────────────────────────────────────

const METRO_PLATFORM_TEXTURES = (() => {
  const out = [];
  [['x', ['mid', 'end_n', 'end_s']], ['y', ['mid', 'end_w', 'end_e']]].forEach(([axis, kinds]) => kinds.forEach((kind) => {
    ['platform', 'canopy_far', 'canopy_near'].forEach((layer) => {
      out.push({ key: `metro_${layer}_${axis}_${kind}`, path: `Models/metroPlatform/metro_${layer}_${axis}_${kind}.png` });
    });
  }));
  // and the termini's scissors crossovers, drawn over the track
  ['x', 'y'].forEach((axis) => [0, 1].forEach((k) => out.push({ key: `metro_track_crossover_${axis}_${k}`, path: `Models/metroTrack/metro_track_crossover_${axis}_${k}.png` })));
  return out;
})();
const METRO_PLATFORM_ART = Object.freeze({ width: 512, height: 352, centre: [256, 224] });

function loadMetroSurfaceTextures(scene) {
  const wanted = [
    ...METRO_PLATFORM_TEXTURES,
    ...(typeof METRO_TRAIN_ART !== 'undefined' ? Object.values(METRO_TRAIN_ART).map((a) => ({ key: a.key, path: a.path })) : []),
  ].filter((t) => !scene.textures.exists(t.key));
  if (!wanted.length) return Promise.resolve(true);
  if (scene.__metroSurfaceLoading) return scene.__metroSurfaceLoading;
  scene.__metroSurfaceLoading = new Promise((resolve) => {
    const start = () => {
      wanted.forEach((t) => scene.load.image(t.key, typeof resolveModelAssetPath === 'function' ? resolveModelAssetPath(t.path) : t.path));
      scene.load.once('complete', () => { scene.__metroSurfaceLoading = null; resolve(true); });
      scene.load.start();
    };
    if (scene.load.isLoading()) scene.load.once('complete', start); else start();
  });
  return scene.__metroSurfaceLoading;
}

// A platform tile's pictures as the map is turned: the axis as drawn, and which end, if an end.
function metroPlatformPieceKey(station, k) {
  const turn = typeof mapRotation === 'number' ? mapRotation : 0;
  const visualAxis = ['n', 's'].includes(rotateDirection(station.axis === 'ns' ? 'n' : 'w', turn)) ? 'x' : 'y';
  const half = Math.floor(METRO_SURFACE.platformTiles / 2);
  if (Math.abs(k) !== half) return { axis: visualAxis, kind: 'mid' };
  // the end's side in the map's frame, then as drawn
  const mapSide = station.axis === 'ns' ? (k < 0 ? 'n' : 's') : (k < 0 ? 'w' : 'e');
  return { axis: visualAxis, kind: `end_${rotateDirection(mapSide, turn)}` };
}

// The platforms as sprites (syncMetroStations calls this): three to a tile - the platforms on the
// ground, the far canopy before the trains, the near one after them.
function syncMetroPlatforms(scene) {
  if (!scene?.add || typeof getTransportExpansionState !== 'function') return;
  if (!scene.metroPlatformSprites) scene.metroPlatformSprites = new Map();
  const stations = (getTransportExpansionState()?.metro?.stations || []).filter((s) => s.surface);
  if (stations.length && METRO_PLATFORM_TEXTURES.some((t) => !scene.textures.exists(t.key))) {
    loadMetroSurfaceTextures(scene).then(() => syncMetroPlatforms(scene));
    return;
  }
  const wanted = new Set();
  const half = Math.floor(METRO_SURFACE.platformTiles / 2);
  stations.forEach((station) => {
    surfaceStationTiles(station).forEach(([row, col], i) => {
      const { axis, kind } = metroPlatformPieceKey(station, i - half);
      const face = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
      // sorted among the buildings in their frame (isoToScreen, without the scene's offset)
      const isoY = isoToScreen(col + 0.5, row + 0.5).y;
      [['platform', getWorldDepth('road', face.center.y + 2)],
        ['canopy_far', getWorldDepth('object', isoY - TILE_HEIGHT * 0.4)],
        ['canopy_near', getWorldDepth('object', isoY + TILE_HEIGHT * 0.4)]].forEach(([layer, depth]) => {
        const id = `${station.id}|${i}|${layer}`;
        wanted.add(id);
        const texture = `metro_${layer}_${axis}_${kind}`;
        let sprite = scene.metroPlatformSprites.get(id);
        if (!sprite) {
          sprite = scene.add.image(0, 0, texture);
          addToRenderLayer(scene, sprite, layer === 'platform' ? 'roadLayer' : 'objectLayer');
          if (scene.worldMask) sprite.setMask(scene.worldMask);
          scene.metroPlatformSprites.set(id, sprite);
        } else if (sprite.texture.key !== texture) {
          sprite.setTexture(texture);
        }
        sprite.setOrigin(METRO_PLATFORM_ART.centre[0] / METRO_PLATFORM_ART.width, METRO_PLATFORM_ART.centre[1] / METRO_PLATFORM_ART.height);
        sprite.setScale(TILE_WIDTH / METRO_PLATFORM_ART.width);
        sprite.setPosition(face.center.x, face.center.y);
        sprite.setDepth(depth);
        if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
      });
    });
  });
  // each surface line's termini: a scissors crossover on the two tiles outside the platform
  const state = getMetroState();
  state.lines.filter((l) => l.surface).forEach((line) => {
    const st = getMetroLineStations(line, state);
    if (st.length < 2) return;
    [[st[0], st[1]], [st.at(-1), st.at(-2)]].forEach(([terminus, next]) => {
      const tiles = surfaceCrossoverTiles(terminus, next, state.tracks);
      if (!tiles) return;
      const turn = typeof mapRotation === 'number' ? mapRotation : 0;
      const visualAxis = ['n', 's'].includes(rotateDirection(terminus.axis === 'ns' ? 'n' : 'w', turn)) ? 'x' : 'y';
      // piece 0 is the one nearer the top of the axis as drawn (the art's first tile)
      const along = (r, c) => { const [vr, vc] = metroVizOf(r, c); return visualAxis === 'x' ? vr : vc; };
      const ordered = tiles.slice().sort((a, b) => along(a[0], a[1]) - along(b[0], b[1]));
      ordered.forEach(([row, col], k) => {
        const id = `xo|${line.id}|${terminus.id}|${k}`;
        wanted.add(id);
        const texture = `metro_track_crossover_${visualAxis}_${k}`;
        if (!scene.textures.exists(texture)) return;
        let sprite = scene.metroPlatformSprites.get(id);
        if (!sprite) {
          sprite = scene.add.image(0, 0, texture);
          addToRenderLayer(scene, sprite, 'roadLayer');
          if (scene.worldMask) sprite.setMask(scene.worldMask);
          scene.metroPlatformSprites.set(id, sprite);
        } else if (sprite.texture.key !== texture) sprite.setTexture(texture);
        const face = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
        sprite.setOrigin(0.5, 0.5);
        sprite.setScale(TILE_WIDTH / 512);
        sprite.setPosition(face.center.x, face.center.y);
        sprite.setDepth(getWorldDepth('road', face.center.y + 1.5));
        if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
      });
    });
  });
  scene.metroPlatformSprites.forEach((sprite, id) => { if (!wanted.has(id)) { sprite.destroy(); scene.metroPlatformSprites.delete(id); } });
}

// A tile's place as drawn (isoToScreen's turned grid): [row, col].
function metroVizOf(row, col) {
  if (mapRotation === 1) return [col, MAP_HEIGHT - 1 - row];
  if (mapRotation === 2) return [MAP_HEIGHT - 1 - row, MAP_WIDTH - 1 - col];
  if (mapRotation === 3) return [MAP_WIDTH - 1 - col, row];
  return [row, col];
}

// A point in (col, row) on screen: the tile's face, then across it (isometric is linear).
function metroSurfaceScreenAt(scene, col, row) {
  const ri = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(row)));
  const ci = Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor(col)));
  const f = getTileFaceGeometry(ri, ci, scene.offsetX, scene.offsetY).center;
  const p0 = isoToScreen(ci + 0.5, ri + 0.5), p1 = isoToScreen(col, row);
  return { x: f.x + (p1.x - p0.x), y: f.y + (p1.y - p0.y) };
}

// The surface trains, each frame (main.js update): where the clock has each, car by car.
function updateMetroSurfaceTrains(scene) {
  if (!scene?.add || typeof getTransportExpansionState !== 'function' || !getTransportExpansionState()?.metro) return;
  if (!scene.metroTrainSprites) scene.metroTrainSprites = new Map();
  const state = getMetroState();
  const surfaceLines = state.lines.filter((l) => l.surface && l.status === 'active');
  // the termini's crossovers follow the lines: drawn again when a line or the track changes
  const signature = `${state.lines.filter((l) => l.surface).map((l) => `${l.id}:${l.stationIds.join(',')}`).join('|')}#${metroTrackRevisionKey()}#${mapRotation}`;
  if (scene.__metroSurfaceSignature !== signature) {
    scene.__metroSurfaceSignature = signature;
    syncMetroPlatforms(scene);
  }
  const seen = new Set();
  if (surfaceLines.length && typeof METRO_TRAIN_ART !== 'undefined'
    && Object.values(METRO_TRAIN_ART).some((a) => !scene.textures.exists(a.key))) {
    loadMetroSurfaceTextures(scene);
  } else if (surfaceLines.length) {
    const sky = typeof getTyphoonShelterFleetClock === 'function' ? getTyphoonShelterFleetClock() : 0;
    const running = isMetroRunning(sky);
    const turn = typeof mapRotation === 'number' ? mapRotation : 0;
    surfaceLines.forEach((line) => {
      const schedule = getMetroLineSchedule(line, state);
      const geom = getSurfaceLineGeometry(line, state);
      if (!schedule || !geom || !running) return;
      getMetroLineTrains(line, state).forEach((v, index) => {
        const p = metroTrainPointAt(schedule, sky, v.phase);
        // trains take the two platforms at each terminus in turn
        const picks = { first: index % 2 ? 1 : -1, last: index % 2 ? -1 : 1 };
        if (!p?.leg) return;
        const from = geom.stationAt[p.leg.fromIndex], to = geom.stationAt[p.leg.toIndex];
        const dir = Math.sign(to - from) || 1;
        const x = from + (to - from) * (p.k || 0);
        let sprites = scene.metroTrainSprites.get(v.id);
        if (!sprites) {
          sprites = Array.from({ length: METRO_SURFACE.cars }, () => {
            const s = scene.add.image(0, 0, METRO_TRAIN_ART.fall_mid.key);
            addToRenderLayer(scene, s, 'objectLayer');
            if (scene.worldMask) s.setMask(scene.worldMask);
            if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, s);
            return s;
          });
          scene.metroTrainSprites.set(v.id, sprites);
        }
        seen.add(v.id);
        surfaceTrainCars(geom, x, dir, picks).forEach((car, i) => {
          const art = METRO_TRAIN_ART[surfaceCarView(car.heading[0], car.heading[1], car.role, turn)];
          const sprite = sprites[i];
          if (sprite.texture.key !== art.key) sprite.setTexture(art.key);
          const src = scene.textures.get(art.key).getSourceImage();
          const anchor = typeof getPropTextureAnchor === 'function'
            ? getPropTextureAnchor(art.path, art.anchor[0], art.anchor[1], src)
            : { originX: art.anchor[0] / src.width, originY: art.anchor[1] / src.height, scaleMultiplier: 1 };
          sprite.setOrigin(anchor.originX, anchor.originY);
          sprite.setScale((TILE_WIDTH / 512) * anchor.scaleMultiplier);
          const at = metroSurfaceScreenAt(scene, car.pos[0], car.pos[1]);
          // up on a viaduct or a ramp: drawn that much higher, and after the deck it runs on (and the
          // next tile's, which its front reaches)
          const lift = (car.z || 0) * METRO_SURFACE.zPxPerMetre * (TILE_WIDTH / 512);
          sprite.setPosition(at.x, at.y - lift);
          // sorted among the buildings and the viaduct in their frame (isoToScreen, no scene offset)
          const isoY = isoToScreen(car.pos[0], car.pos[1]).y;
          sprite.setDepth(getWorldDepth('object', isoY + (car.z > 0.05 ? TILE_HEIGHT * 1.1 : 0)));
          sprite.setVisible(true);
        });
      });
    });
  }
  scene.metroTrainSprites.forEach((sprites, id) => {
    if (seen.has(id)) return;
    sprites.forEach((s) => s.destroy());
    scene.metroTrainSprites.delete(id);
  });
}

function clearMetroSurfaceSprites(scene) {
  scene?.metroPlatformSprites?.forEach((s) => s.destroy());
  scene?.metroTrainSprites?.forEach((sprites) => sprites.forEach((s) => s.destroy()));
  if (scene) { scene.metroPlatformSprites = new Map(); scene.metroTrainSprites = new Map(); }
}
