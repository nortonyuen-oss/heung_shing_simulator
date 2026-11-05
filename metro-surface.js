// 地鐵第三期 (docs/metro-phase3-design.md): surface track. The transport company lays double track
// on open ground, dragged like a road. As in OpenTTD, a tile holds TrackBits (railway-track.js):
// X and Y straight through, and the four diagonals UPPER, LOWER, LEFT and RIGHT across a corner, so
// a line turns 45 degrees at a tile edge (Norton, 2026-11-05) and may run diagonally as a staircase
// of them. Each bit joins two sides of its tile (n: row - 1, e: col + 1, s: row + 1, w: col - 1, in
// the map's frame); the state is just "row:col" -> the tile's bits, so a save and a turn of the map
// need nothing else.

const METRO_RAIL = Object.freeze({
  costPerTile: 500,           // the tunnel's is 300 a tile: land, bed and track
  monthlyUpkeepPerTile: 2,
  // 高架 (step 4, Norton 2026-11-05: its own tool, the deck 8 m up): a viaduct tile and a ramp tile
  deckCostPerTile: 2000,
  rampCostPerTile: 1200,
  deckMetres: 8,
  rampTiles: 3,
});

const RAIL_DIRS = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });
const RAIL_OPPOSITE = Object.freeze({ n: 's', e: 'w', s: 'n', w: 'e' });
// the sides each bit joins, in the map's frame (railway-track.js: A west, B north, C east, D south)
const RAIL_BIT_SIDES = Object.freeze({
  1: ['s', 'n'],    // X: D - B
  2: ['w', 'e'],    // Y: A - C
  4: ['w', 'n'],    // UPPER: A - B
  8: ['s', 'e'],    // LOWER: D - C
  16: ['w', 's'],   // LEFT: A - D
  32: ['n', 'e'],   // RIGHT: B - C
});
// what a tile may hold this phase: one bit, the X/Y crossing, or two diagonals side by side
// (no points: lines do not branch yet)
const RAIL_ALLOWED_MASKS = new Set([1, 2, 4, 8, 16, 32, 0x03, 0x0c, 0x30]);

function railKey(row, col) {
  return `${row}:${col}`;
}

function railBitsOf(mask) {
  return [1, 2, 4, 8, 16, 32].filter((b) => mask & b);
}

// The bit that joins two sides of a tile (any two differ: opposite is X or Y, next to each other a diagonal).
function railBitFor(a, b) {
  const want = [a, b].sort().join();
  return [1, 2, 4, 8, 16, 32].find((bit) => RAIL_BIT_SIDES[bit].slice().sort().join() === want) || 0;
}

// The side a neighbouring tile lies on.
function railSideTowards(from, to) {
  return Object.keys(RAIL_DIRS).find((d) => RAIL_DIRS[d][0] === to.row - from.row && RAIL_DIRS[d][1] === to.col - from.col) || null;
}

/**
 * The tiles a drag lays, in order. Pure. Straight along a row or column; round one corner (along
 * the start's row first, then the end's column: the corner tile a diagonal, two 45-degree turns);
 * or, when the drag runs about as far across as down (within a tile), a diagonal: a staircase,
 * a step along the row then one along the column.
 */
function railDragPath(start, end) {
  const dr = end.row - start.row, dc = end.col - start.col;
  const stepR = Math.sign(dr), stepC = Math.sign(dc);
  const path = [{ row: start.row, col: start.col }];
  if (dr && dc && Math.abs(Math.abs(dr) - Math.abs(dc)) <= 1) {
    let { row, col } = start;
    let alongRow = Math.abs(dc) >= Math.abs(dr);
    while (row !== end.row || col !== end.col) {
      if ((alongRow && col !== end.col) || row === end.row) col += stepC; else row += stepR;
      path.push({ row, col });
      alongRow = !alongRow;
    }
    return path;
  }
  for (let c = start.col; c !== end.col;) {
    c += stepC;
    path.push({ row: start.row, col: c });
  }
  for (let r = start.row; r !== end.row;) {
    r += stepR;
    path.push({ row: r, col: end.col });
  }
  return path;
}

/**
 * The bits with a path laid. Pure; a new object. Each tile on the way gets the bit joining the
 * sides it is entered and left by; an end tile already joined that way is left as it is, else it
 * gets the straight the path arrives on.
 */
function addRailPathBits(bits, path) {
  const out = { ...bits };
  for (let i = 0; i < path.length; i++) {
    const here = path[i];
    const key = railKey(here.row, here.col);
    const sides = [];
    if (i > 0) sides.push(railSideTowards(here, path[i - 1]));
    if (i < path.length - 1) sides.push(railSideTowards(here, path[i + 1]));
    let bit;
    if (sides.length === 2) bit = railBitFor(sides[0], sides[1]);
    else {
      const side = sides[0];
      if (!side) continue;
      if (railBitsOf(out[key] || 0).some((b) => RAIL_BIT_SIDES[b].includes(side))) continue;
      // the end of a line, its loose side square to the way this one comes: turn it (a diagonal
      // from its joined side to this one), as OpenTTD does when a line is carried on round a corner
      const bitsHere = railBitsOf(out[key] || 0);
      if (bitsHere.length === 1) {
        const joined = RAIL_BIT_SIDES[bitsHere[0]].filter((s) => {
          const [dr, dc] = RAIL_DIRS[s];
          const neighbour = out[railKey(here.row + dr, here.col + dc)] || 0;
          return railBitsOf(neighbour).some((b) => RAIL_BIT_SIDES[b].includes(RAIL_OPPOSITE[s]));
        });
        if (joined.length === 1 && joined[0] !== RAIL_OPPOSITE[side]) {
          out[key] = railBitFor(joined[0], side);
          continue;
        }
      }
      bit = railBitFor(side, RAIL_OPPOSITE[side]);
    }
    out[key] = (out[key] || 0) | bit;
  }
  return out;
}

// ── 高架 (step 4) ───────────────────────────────────────────────────────────────
// An elevated tile is 'd' (the deck, 8 m up) or a ramp step: `${step}${up}`, step 1..3 from the
// ground, `up` the side it rises towards.

// The track's height (metres) where it crosses a side of an elevated tile (0 on the ground). Pure.
function railSideHeight(code, side) {
  if (!code) return 0;
  if (code === 'd') return METRO_RAIL.deckMetres;
  const step = Number(code[0]), up = code[1];
  const lo = ((step - 1) / METRO_RAIL.rampTiles) * METRO_RAIL.deckMetres;
  const hi = (step / METRO_RAIL.rampTiles) * METRO_RAIL.deckMetres;
  if (side === up) return hi;
  if (side === RAIL_OPPOSITE[up]) return lo;
  return (lo + hi) / 2;
}

/**
 * An elevated drag: its first and last three tiles ramps (unless that end starts on the viaduct
 * already there - its deck or a ramp - carrying it on: a ramp it crosses becomes deck), the rest deck. Pure with `elev` (the elevated tiles) and `canDeck` / `canRamp`.
 * Returns { ok, reason, assign: { key: code }, decks, ramps }; reason 'tooShort', 'rampStraight',
 * 'rampGround' or 'deckGround'.
 */
function planRailElevated(path, bits, elev, canDeck, canRamp) {
  const n = path.length;
  const R = METRO_RAIL.rampTiles;
  const key = (i) => railKey(path[i].row, path[i].col);
  const startDeck = Boolean(elev[key(0)]);
  const endDeck = Boolean(elev[key(n - 1)]);
  const out = { ok: false, reason: null, assign: {}, decks: 0, ramps: 0 };
  if (n < (startDeck ? 0 : R) + (endDeck ? 0 : R) + 1) { out.reason = 'tooShort'; return out; }
  const side = (i, j) => railSideTowards(path[i], path[j]);
  // the ramps run straight: the tiles from the end through the first deck tile in one line
  const straight = (from, to) => {
    const step = Math.sign(to - from);
    const d = side(from, from + step);
    for (let i = from; i !== to; i += step) if (side(i, i + step) !== d) return false;
    return true;
  };
  if ((!startDeck && !straight(0, R)) || (!endDeck && !straight(n - 1, n - 1 - R))) { out.reason = 'rampStraight'; return out; }
  for (let i = 0; i < n; i++) {
    const k = key(i);
    let code = 'd';
    if (!startDeck && i < R) code = `${i + 1}${side(i, i + 1)}`;
    else if (!endDeck && i >= n - R) code = `${n - i}${side(i, i - 1)}`;
    if (code === 'd') {
      if (elev[k] === 'd') continue;                 // carrying on (or across) a deck
      if (elev[k]) { out.assign[k] = 'd'; out.decks += 1; continue; }   // an old ramp, built up into deck
      if (bits[k] || !canDeck(path[i].row, path[i].col)) { out.reason = 'deckGround'; out.bad = k; return out; }
      out.decks += 1;
    } else {
      if (bits[k] || !canRamp(path[i].row, path[i].col)) { out.reason = 'rampGround'; out.bad = k; return out; }
      out.ramps += 1;
    }
    out.assign[k] = code;
  }
  out.ok = true;
  return out;
}

/**
 * The elevated run a tile belongs to: it and every elevated tile joined to it through the track.
 * Pure. [key].
 */
function railElevatedRun(bits, elev, startKey) {
  const seen = new Set([startKey]);
  const queue = [startKey];
  while (queue.length) {
    const k = queue.shift();
    const [r, c] = k.split(':').map(Number);
    railBitsOf(bits[k] || 0).forEach((b) => RAIL_BIT_SIDES[b].forEach((s) => {
      const [dr, dc] = RAIL_DIRS[s];
      const nk = railKey(r + dr, c + dc);
      if (seen.has(nk) || !elev[nk]) return;
      if (!railBitsOf(bits[nk] || 0).some((nb) => RAIL_BIT_SIDES[nb].includes(RAIL_OPPOSITE[s]))) return;
      seen.add(nk); queue.push(nk);
    }));
  }
  return [...seen];
}

/** The tiles whose bits this phase cannot have (points, three-way junctions): [key]. Pure. */
function railBadTiles(bits) {
  return Object.entries(bits).filter(([, mask]) => mask && !RAIL_ALLOWED_MASKS.has(mask)).map(([key]) => key);
}

// ── In the game ───────────────────────────────────────────────────────────────

function getMetroTrackBits() {
  return typeof getMetroState === 'function' ? getMetroState().tracks : {};
}

// Bumped whenever track is laid or taken up (surface lines' geometry is worked out again).
let metroTrackRevision = 0;
function metroTrackRevisionKey() {
  return metroTrackRevision;
}

// Where track may be laid: flat open ground, nothing built on it.
function canLayMetroTrackAt(row, col) {
  if (!isInsideMap(row, col)) return false;
  if (mapData[row][col] === WATER || mapData[row][col] === ROAD) return false;
  if (typeof isBridgeTile === 'function' && isBridgeTile(row, col)) return false;
  if (getTileHeight(row, col) !== 0 || (typeof isSlopeTile === 'function' && isSlopeTile(row, col))) return false;
  const id = getTileId(row, col);
  if (buildingData[id] || activeScene?.buildingSprites?.has(id)) return false;
  if (typeof isMetroStationTile === 'function' && isMetroStationTile(row, col)) return false;
  if (typeof isUnderseaTunnelTile === 'function' && isUnderseaTunnelTile(row, col)) return false;
  if (typeof isPromenadeTile === 'function' && isPromenadeTile(row, col)) return false;
  return true;
}

function isMetroTrackTile(row, col) {
  if (typeof getTransportExpansionState !== 'function') return false;
  const tracks = getTransportExpansionState()?.metro?.tracks;
  return Boolean(tracks && tracks[railKey(row, col)]);
}

/** What laying a drag would do: { ok, reason, path, bits, cost, newTiles }. */
function planMetroTrack(start, end) {
  const path = railDragPath(start, end);
  const out = { ok: false, reason: null, path, cost: 0, newTiles: [] };
  if (typeof isMetroUnlocked === 'function' && !isMetroUnlocked()) { out.reason = 'locked'; return out; }
  if (path.length < 2) { out.reason = 'tooShort'; return out; }
  const bits = getMetroTrackBits();
  // ground track does not run into a viaduct (its ramps meet the ground track at their foot)
  const elev = getMetroTrackElev();
  if (path.some(({ row, col }) => elev[railKey(row, col)])) { out.reason = 'elevated'; return out; }
  const bad = path.find(({ row, col }) => !bits[railKey(row, col)] && !canLayMetroTrackAt(row, col));
  if (bad) { out.reason = 'ground'; out.bad = bad; return out; }
  const next = addRailPathBits(bits, path);
  const junctions = railBadTiles(next);
  if (junctions.length) { out.reason = 'junction'; out.bad = junctions[0]; return out; }
  out.newTiles = path.map(({ row, col }) => railKey(row, col)).filter((k, i, all) => !bits[k] && all.indexOf(k) === i);
  out.cost = out.newTiles.length * METRO_RAIL.costPerTile;
  out.bits = next;
  out.ok = true;
  return out;
}

const METRO_TRACK_REFUSALS = Object.freeze({
  locked: ['metro.track.locked', '城市人口要有 30,000 先可以起地鐵。'],
  tooShort: ['metro.track.tooShort', '拖長啲：路軌最少兩格。'],
  ground: ['metro.track.ground', '路軌要起喺平地空地上（唔可以喺水、路、斜坡或者建築上面）；過馬路要高架，遲啲先有。'],
  junction: ['metro.track.junction', '路軌唔可以喺度分叉（第三期未有道岔）。'],
  funds: ['metro.track.funds', '公司資金唔夠起路軌（要 ${cost}）。'],
  elevated: ['metro.track.elevated', '地面路軌唔可以駁入高架中間：喺斜坡腳接駁。'],
  rampStraight: ['metro.track.rampStraight', '高架兩頭各要三格直路做斜坡。'],
  rampGround: ['metro.track.rampGround', '斜坡要起喺平地空地上（唔可以喺路、建築或者其他路軌上面）。'],
  deckGround: ['metro.track.deckGround', '高架橋墩要落喺平地或者馬路上（唔可以喺水、建築或者地面路軌上面）。'],
});

function metroTrackRefusal(reason, vars = {}) {
  const [key, fallback] = METRO_TRACK_REFUSALS[reason] || METRO_TRACK_REFUSALS.ground;
  return metroT(key, fallback, vars);
}

// The drag's end (tool-menu.js pointerup): lay it, or say why not.
function commitMetroTrackDrag(scene, start, end) {
  const plan = planMetroTrack(start, end);
  const warn = (msg) => { if (typeof showToast === 'function') showToast(msg, 'warning'); return false; };
  if (!plan.ok) return warn(metroTrackRefusal(plan.reason));
  if (plan.cost > 0 && !spendMetroFunds(plan.cost)) return warn(metroTrackRefusal('funds', { cost: plan.cost.toLocaleString() }));
  plan.newTiles.forEach((k) => {
    const [row, col] = k.split(':').map(Number);
    if (typeof removeTree === 'function') removeTree(scene, row, col);
    if (typeof removeDebris === 'function') removeDebris(scene, row, col);
    if (typeof removeZoneOverlay === 'function') removeZoneOverlay(scene, row, col);
    if (typeof zoneMap !== 'undefined' && zoneMap[row]) zoneMap[row][col] = typeof ZONE_NONE !== 'undefined' ? ZONE_NONE : 0;
  });
  getMetroState().tracks = plan.bits;
  metroTrackRevision += 1;
  syncMetroTracks(scene);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  if (typeof showToast === 'function' && plan.cost > 0) {
    showToast(metroT('metro.track.built', '起好 {n} 格路軌（${cost}）。', { n: plan.newTiles.length, cost: plan.cost.toLocaleString() }), 'success');
  }
  return true;
}

function getMetroTrackElev() {
  return typeof getMetroState === 'function' ? (getMetroState().trackElev || {}) : {};
}

// Where a viaduct's pier may stand: flat ground or a road, nothing built there.
function canDeckMetroTrackAt(row, col) {
  if (!isInsideMap(row, col)) return false;
  if (mapData[row][col] === WATER) return false;
  if (typeof isBridgeTile === 'function' && isBridgeTile(row, col)) return false;
  if (getTileHeight(row, col) !== 0) return false;
  const id = getTileId(row, col);
  if (buildingData[id] || activeScene?.buildingSprites?.has(id)) return false;
  if (typeof isMetroStationTile === 'function' && isMetroStationTile(row, col)) return false;
  if (typeof isUnderseaTunnelTile === 'function' && isUnderseaTunnelTile(row, col)) return false;
  if (typeof isPromenadeTile === 'function' && isPromenadeTile(row, col)) return false;
  return true;
}

/** What laying an elevated drag would do (the 高架路軌 tool): as planMetroTrack, with `elev`. */
function planMetroElevatedTrack(start, end) {
  const path = railDragPath(start, end);
  const out = { ok: false, reason: null, path, cost: 0, newTiles: [], elevated: true };
  if (typeof isMetroUnlocked === 'function' && !isMetroUnlocked()) { out.reason = 'locked'; return out; }
  const bits = getMetroTrackBits();
  const elev = getMetroTrackElev();
  const plan = planRailElevated(path, bits, elev, canDeckMetroTrackAt, canLayMetroTrackAt);
  if (!plan.ok) { out.reason = plan.reason; out.bad = plan.bad; return out; }
  const next = addRailPathBits(bits, path);
  const junctions = railBadTiles(next);
  if (junctions.length) { out.reason = 'junction'; out.bad = junctions[0]; return out; }
  out.newTiles = Object.keys(plan.assign);
  out.cost = plan.decks * METRO_RAIL.deckCostPerTile + plan.ramps * METRO_RAIL.rampCostPerTile;
  out.bits = next;
  out.elev = { ...elev, ...plan.assign };
  out.ok = true;
  return out;
}

function commitMetroElevatedDrag(scene, start, end) {
  const plan = planMetroElevatedTrack(start, end);
  const warn = (msg) => { if (typeof showToast === 'function') showToast(msg, 'warning'); return false; };
  if (!plan.ok) return warn(metroTrackRefusal(plan.reason));
  if (plan.cost > 0 && !spendMetroFunds(plan.cost)) return warn(metroTrackRefusal('funds', { cost: plan.cost.toLocaleString() }));
  plan.newTiles.forEach((k) => {
    const [row, col] = k.split(':').map(Number);
    if (typeof removeTree === 'function') removeTree(scene, row, col);
    if (typeof removeDebris === 'function') removeDebris(scene, row, col);
    if (mapData[row][col] === ROAD) return;            // a road runs on under the viaduct
    if (typeof removeZoneOverlay === 'function') removeZoneOverlay(scene, row, col);
    if (typeof zoneMap !== 'undefined' && zoneMap[row]) zoneMap[row][col] = typeof ZONE_NONE !== 'undefined' ? ZONE_NONE : 0;
  });
  const state = getMetroState();
  state.tracks = plan.bits;
  state.trackElev = plan.elev;
  metroTrackRevision += 1;
  syncMetroTracks(scene);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  if (typeof showToast === 'function' && plan.cost > 0) {
    showToast(metroT('metro.track.builtElevated', '起好 {n} 格高架（${cost}）。', { n: plan.newTiles.length, cost: plan.cost.toLocaleString() }), 'success');
  }
  return true;
}

// The bulldozer on track: that tile's track taken up (an elevated tile takes its whole viaduct,
// ramps and all, with it). True when there was track there.
function demolishMetroTrackAt(scene, row, col) {
  const bits = getMetroTrackBits();
  const key = railKey(row, col);
  if (!bits[key]) return false;
  // not under a platform, nor where a surface line runs (metro-surface-lines.js)
  const say = (k, fallback) => { if (typeof showToast === 'function') showToast(metroT(k, fallback), 'warning'); return true; };
  if (typeof isMetroSurfaceStationTile === 'function' && isMetroSurfaceStationTile(row, col)) {
    return say('metro.track.underStation', '路軌上面有地面站：先拆咗個站。');
  }
  const elev = getMetroTrackElev();
  const run = elev[key] ? railElevatedRun(bits, elev, key) : [key];
  const used = typeof getMetroSurfaceLineTiles === 'function' ? getMetroSurfaceLineTiles() : new Set();
  if (run.some((k) => used.has(k))) {
    return say('metro.track.inUse', '有地面綫行緊呢段路軌：先喺運輸公司路線表移走條綫。');
  }
  const next = { ...bits };
  const nextElev = { ...elev };
  run.forEach((k) => { delete next[k]; delete nextElev[k]; });
  getMetroState().tracks = next;
  getMetroState().trackElev = nextElev;
  metroTrackRevision += 1;
  syncMetroTracks(scene);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return true;
}

// ── On the map ────────────────────────────────────────────────────────────────

// A tile's bits as drawn, the map turned as it is: each bit's two sides turned, then the bit
// joining those.
function railVisualMask(mask, turn = typeof mapRotation === 'number' ? mapRotation : 0) {
  return railBitsOf(mask).reduce((out, bit) => {
    const [a, b] = RAIL_BIT_SIDES[bit].map((side) => rotateDirection(side, turn));
    return out | railBitFor(a, b);
  }, 0);
}

function metroTrackTextureKey(mask) {
  const layout = typeof getRailwayTrackLayout === 'function' ? getRailwayTrackLayout(railVisualMask(mask)) : null;
  return layout ? layout.asset : null;
}

// The track as sprites, made, moved or dropped to match (after laying, a bulldozer, a load or a
// turn of the map: syncMetroStations calls this).
function syncMetroTracks(scene) {
  if (!scene?.add || typeof getTransportExpansionState !== 'function') return;
  if (!scene.metroTrackSprites) scene.metroTrackSprites = new Map();
  const metro = getTransportExpansionState()?.metro;
  const bits = metro?.tracks || {};
  const elev = metro?.trackElev || {};
  // the viaduct's pictures are loaded the first time there is one
  if (Object.keys(elev).length && METRO_VIADUCT_TEXTURES.some((t) => !scene.textures.exists(t.key))) {
    loadMetroViaductTextures(scene).then(() => syncMetroTracks(scene));
  }
  scene.metroTrackSprites.forEach((sprite, key) => {
    if (!bits[key] || Boolean(elev[key]) !== Boolean(sprite.__elevated)) { sprite.destroy(); scene.metroTrackSprites.delete(key); }
  });
  Object.entries(bits).forEach(([key, mask]) => {
    const [row, col] = key.split(':').map(Number);
    const code = elev[key];
    const texture = code ? metroViaductTextureKey(mask, code) : metroTrackTextureKey(mask);
    if (!texture || !scene.textures.exists(texture)) return;
    let sprite = scene.metroTrackSprites.get(key);
    if (!sprite) {
      sprite = scene.add.image(0, 0, texture);
      // a viaduct stands up among the buildings; ground track lies with the roads
      addToRenderLayer(scene, sprite, code ? 'objectLayer' : 'roadLayer');
      if (scene.worldMask) sprite.setMask(scene.worldMask);
      sprite.__elevated = Boolean(code);
      scene.metroTrackSprites.set(key, sprite);
    } else if (sprite.texture.key !== texture) {
      sprite.setTexture(texture);
    }
    const face = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
    sprite.setScale(TILE_WIDTH / (typeof RAILWAY_TRACK_TILE !== 'undefined' ? RAILWAY_TRACK_TILE.width : 512));
    sprite.setPosition(face.center.x, face.center.y);
    if (code) {
      sprite.setOrigin(METRO_VIADUCT_ART.centre[0] / METRO_VIADUCT_ART.width, METRO_VIADUCT_ART.centre[1] / METRO_VIADUCT_ART.height);
      // sorted as a 1 x 1 building (building-placement.js)
      const pos = isoToScreen(col, row);
      sprite.setDepth(typeof getBuildingSortDepth === 'function' ? getBuildingSortDepth(pos.y, 1, 1, 0) : getWorldDepth('object', face.center.y));
    } else {
      sprite.setOrigin(0.5, 0.5);
      sprite.setDepth(getWorldDepth('road', face.center.y + 1));
    }
    if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
  });
}

// The viaduct's pictures (scripts/prepare-metro-viaduct-assets.py): a deck for each layout a tile may
// hold, and the ramps, X and Y, rising either way, three steps.
const METRO_VIADUCT_ART = Object.freeze({ width: 512, height: 352, centre: [256, 224] });
const METRO_VIADUCT_TEXTURES = (() => {
  const out = [];
  ['x', 'y', 'upper', 'lower', 'left', 'right', 'cross_xy', 'parallel_horizontal', 'parallel_vertical']
    .forEach((n) => out.push({ key: `metro_viaduct_${n}`, path: `Models/metroViaduct/metro_viaduct_${n}.png` }));
  [['x', ['n', 's']], ['y', ['w', 'e']]].forEach(([axis, ups]) => ups.forEach((up) => [1, 2, 3].forEach((step) => {
    out.push({ key: `metro_ramp_${axis}_${up}${step}`, path: `Models/metroViaduct/metro_ramp_${axis}_${up}${step}.png` });
  })));
  return out;
})();

function loadMetroViaductTextures(scene) {
  const wanted = METRO_VIADUCT_TEXTURES.filter((t) => !scene.textures.exists(t.key));
  if (!wanted.length) return Promise.resolve(true);
  if (scene.__metroViaductLoading) return scene.__metroViaductLoading;
  scene.__metroViaductLoading = new Promise((resolve) => {
    const start = () => {
      wanted.forEach((t) => scene.load.image(t.key, typeof resolveModelAssetPath === 'function' ? resolveModelAssetPath(t.path) : t.path));
      scene.load.once('complete', () => { scene.__metroViaductLoading = null; resolve(true); });
      scene.load.start();
    };
    if (scene.load.isLoading()) scene.load.once('complete', start); else start();
  });
  return scene.__metroViaductLoading;
}

// An elevated tile's picture as the map is turned: the deck for its bits as drawn, or the ramp
// for its axis and rising side as drawn.
function metroViaductTextureKey(mask, code) {
  const turn = typeof mapRotation === 'number' ? mapRotation : 0;
  if (code === 'd') {
    const layout = typeof getRailwayTrackLayout === 'function' ? getRailwayTrackLayout(railVisualMask(mask, turn)) : null;
    return layout ? layout.asset.replace('metro_track_', 'metro_viaduct_') : null;
  }
  const up = rotateDirection(code[1], turn);
  return `metro_ramp_${up === 'n' || up === 's' ? 'x' : 'y'}_${up}${code[0]}`;
}

function clearMetroTrackSprites(scene) {
  scene?.metroTrackSprites?.forEach((sprite) => sprite.destroy());
  if (scene) scene.metroTrackSprites = new Map();
}

// While dragging: the tiles it would take, green or red, and the cost or the reason by the pointer.
function drawMetroTrackDragPreview(scene, start, end, elevated = false) {
  const g = scene.bridgePreviewGraphic;
  if (!g) return;
  g.clear();
  const plan = elevated ? planMetroElevatedTrack(start, end) : planMetroTrack(start, end);
  const color = plan.ok ? 0x45e6c3 : 0xff4444;
  plan.path.forEach(({ row, col }) => {
    if (!isInsideMap(row, col)) return;
    const geom = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
    g.fillStyle(color, 0.22);
    g.lineStyle(2, color, 0.9);
    g.beginPath();
    g.moveTo(geom.top.x, geom.top.y); g.lineTo(geom.right.x, geom.right.y);
    g.lineTo(geom.bottom.x, geom.bottom.y); g.lineTo(geom.left.x, geom.left.y);
    g.closePath(); g.fillPath(); g.strokePath();
  });
  if (typeof showUnderseaTunnelPreviewLabel === 'function') {
    showUnderseaTunnelPreviewLabel(scene, end.row, end.col, plan.ok
      ? (elevated ? metroT('metro.track.costElevated', '高架 {n} 格 ${cost}', { n: plan.newTiles.length, cost: plan.cost.toLocaleString() })
        : metroT('metro.track.cost', '路軌 {n} 格 ${cost}', { n: plan.newTiles.length, cost: plan.cost.toLocaleString() }))
      : metroTrackRefusal(plan.reason), plan.ok);
  }
}

// The track's upkeep for the company's month (settleMetroMonth).
function getMetroTrackMonthlyUpkeep() {
  if (typeof getTransportExpansionState !== 'function') return 0;
  return Object.keys(getTransportExpansionState()?.metro?.tracks || {}).length * METRO_RAIL.monthlyUpkeepPerTile;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { METRO_RAIL, RAIL_BIT_SIDES, railDragPath, addRailPathBits, railBadTiles, railBitFor, railVisualMask, railSideHeight, planRailElevated, railElevatedRun };
}
