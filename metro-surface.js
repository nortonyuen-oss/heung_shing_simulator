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
      bit = railBitFor(side, RAIL_OPPOSITE[side]);
    }
    out[key] = (out[key] || 0) | bit;
  }
  return out;
}

/** The tiles whose bits this phase cannot have (points, three-way junctions): [key]. Pure. */
function railBadTiles(bits) {
  return Object.entries(bits).filter(([, mask]) => mask && !RAIL_ALLOWED_MASKS.has(mask)).map(([key]) => key);
}

// ── In the game ───────────────────────────────────────────────────────────────

function getMetroTrackBits() {
  return typeof getMetroState === 'function' ? getMetroState().tracks : {};
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
  syncMetroTracks(scene);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  if (typeof showToast === 'function' && plan.cost > 0) {
    showToast(metroT('metro.track.built', '起好 {n} 格路軌（${cost}）。', { n: plan.newTiles.length, cost: plan.cost.toLocaleString() }), 'success');
  }
  return true;
}

// The bulldozer on track: that tile's track taken up. True when there was track there.
function demolishMetroTrackAt(scene, row, col) {
  const bits = getMetroTrackBits();
  const key = railKey(row, col);
  if (!bits[key]) return false;
  const next = { ...bits };
  delete next[key];
  getMetroState().tracks = next;
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
  const bits = getTransportExpansionState()?.metro?.tracks || {};
  scene.metroTrackSprites.forEach((sprite, key) => { if (!bits[key]) { sprite.destroy(); scene.metroTrackSprites.delete(key); } });
  Object.entries(bits).forEach(([key, mask]) => {
    const [row, col] = key.split(':').map(Number);
    const texture = metroTrackTextureKey(mask);
    if (!texture || !scene.textures.exists(texture)) return;
    let sprite = scene.metroTrackSprites.get(key);
    if (!sprite) {
      sprite = scene.add.image(0, 0, texture);
      addToRenderLayer(scene, sprite, 'roadLayer');
      if (scene.worldMask) sprite.setMask(scene.worldMask);
      scene.metroTrackSprites.set(key, sprite);
    } else if (sprite.texture.key !== texture) {
      sprite.setTexture(texture);
    }
    const face = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
    sprite.setOrigin(0.5, 0.5);
    sprite.setScale(TILE_WIDTH / (typeof RAILWAY_TRACK_TILE !== 'undefined' ? RAILWAY_TRACK_TILE.width : 512));
    sprite.setPosition(face.center.x, face.center.y);
    sprite.setDepth(getWorldDepth('road', face.center.y + 1));
    if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
  });
}

function clearMetroTrackSprites(scene) {
  scene?.metroTrackSprites?.forEach((sprite) => sprite.destroy());
  if (scene) scene.metroTrackSprites = new Map();
}

// While dragging: the tiles it would take, green or red, and the cost or the reason by the pointer.
function drawMetroTrackDragPreview(scene, start, end) {
  const g = scene.bridgePreviewGraphic;
  if (!g) return;
  g.clear();
  const plan = planMetroTrack(start, end);
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
      ? metroT('metro.track.cost', '路軌 {n} 格 ${cost}', { n: plan.newTiles.length, cost: plan.cost.toLocaleString() })
      : metroTrackRefusal(plan.reason), plan.ok);
  }
}

// The track's upkeep for the company's month (settleMetroMonth).
function getMetroTrackMonthlyUpkeep() {
  if (typeof getTransportExpansionState !== 'function') return 0;
  return Object.keys(getTransportExpansionState()?.metro?.tracks || {}).length * METRO_RAIL.monthlyUpkeepPerTile;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { METRO_RAIL, RAIL_BIT_SIDES, railDragPath, addRailPathBits, railBadTiles, railBitFor, railVisualMask };
}
