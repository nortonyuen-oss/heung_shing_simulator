// 天橋 / 懸索橋 (Norton 2026-11-27): high road bridges. The road tool's 橋款 picker - 地面 (the road on
// the ground, and the low bridge over water as before: bridges.js), 天橋 or 懸索橋 - decides what a drag
// builds. A high bridge climbs four terrain levels (52 px, clear of a double-decker and of any train)
// up four ramp tiles, a level a tile as the roads up the hills, runs a deck at that level and comes
// down four tiles the far side. Its deck may cross water and ground railway track (地鐵 and
// 輕鐵 laid on the ground, or a tunnel), never a road (the traffic has one layer). A 懸索橋 is the same
// road hung from two cables over two towers, 青馬大橋's way, over water.
//
// In the bridge map (bridges.js BRIDGE_VALUE_PATTERN) a deck tile is 'deck:<axis>:<level>', a ramp
// 'ramp:<the way up>:<its foot's level>', ':s' after on a suspension bridge's tiles. A ramp tile is a
// road on the map (mapData ROAD, as a low bridge's ends); a deck tile keeps the ground or the water
// under it, with the track on it. The pictures are drawn here, in the object band, sorted as the
// metro's viaduct is - each tile at its front corner - with what stands on the deck (traffic, lamps,
// parapets) just after it and the trains under it just before (highBridgeDeckDepthOver).

const FLYOVER = Object.freeze({
  // (Norton 2026-11-27: 3 levels first - then 巴士好高，橋墩可能太矮: a double-decker stands 31-34 px,
  // the clearance under a 3-level deck's girder was 26; four levels leave 39)
  deckLevels: 4,
  rampTiles: 4,
  rampCostPerTile: 60,
  deckCostPerTile: 160,
  suspensionDeckCostPerTile: 360,
  // tiles of water under it at least: a short span's towers came out stumpy (Norton 2026-11-27:
  // 短橋橋墩會矮好多，係咪要某個長度既橋先起懸索式) - shorter, build a 天橋
  suspensionMinWater: 10,
  suspensionMinTowerPx: 110,
  maxBaseLevel: 5,
});
const ROAD_BRIDGE_STYLES = Object.freeze(['ground', 'flyover', 'suspension']);
let roadBridgeStyle = 'ground';

function getRoadBridgeStyle() {
  return roadBridgeStyle;
}

function setRoadBridgeStyle(style) {
  if (!ROAD_BRIDGE_STYLES.includes(style)) return;
  roadBridgeStyle = style;
  if (typeof document !== 'undefined') {
    document.querySelectorAll('[data-bridge-style]').forEach((b) => {
      const on = b.dataset.bridgeStyle === style;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
}

function highBridgeT(key, fallback, vars = {}) {
  const fill = (text) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  if (typeof t !== 'function') return fill(fallback);
  const out = t(key, vars);
  return out && out !== key ? out : fill(fallback);
}

const HIGH_BRIDGE_OPPOSITE = Object.freeze({ n: 's', e: 'w', s: 'n', w: 'e' });

function highBridgeDirBetween(a, b) {
  if (b.row < a.row) return 'n';
  if (b.col > a.col) return 'e';
  if (b.row > a.row) return 's';
  return 'w';
}

// ── Planning (pure, with the map as `env`) ──────────────────────────────────────────────────────────

/**
 * What a straight drag (`path`, along `axis` 'row' | 'col' as main.js getStraightDragPath gives it) of
 * the road tool with 天橋 ('flyover') or 懸索橋 ('suspension') picked would build: { ok, reason, bad
 * ('row:col'), tiles: [{ row, col, kind: 'ramp' | 'deck', value }], base, level, water, cost }.
 * - The first four tiles and the last four are its ramps: flat ground (or a road) at one level, the
 *   level the drag starts at; nothing else on them.
 * - Between them the deck, four levels up: over water, or over flat ground no higher than the ramps'
 *   with nothing on it but grass, trees, railway track on the ground (or in a tunnel) and roads
 *   (立交: the road goes on under it).
 * env: inside, height, isWater, isSlope, isRoad, blocked (built on), rail -> null | 'under' (ground
 * track or a tunnel: a deck may span it) | 'no' (a ramp, a portal, a viaduct, a station), shelter
 * (a 避風塘's water), nearPier (within 2 tiles of a ferry pier).
 */
function planHighBridgePure(path, axis, style, env) {
  const out = { ok: false, reason: null, bad: null, tiles: [], base: 0, level: 0, water: 0, roads: 0, cost: 0, style };
  const n = path.length;
  const R = FLYOVER.rampTiles;
  if (n < 2 * R + 1) { out.reason = 'tooShort'; return out; }
  const refuse = (reason, p) => { out.reason = reason; out.bad = `${p.row}:${p.col}`; out.tiles = []; return out; };
  const up = highBridgeDirBetween(path[0], path[1]);
  const down = HIGH_BRIDGE_OPPOSITE[up];
  if (!env.inside(path[0].row, path[0].col)) return refuse('outside', path[0]);
  const base = env.height(path[0].row, path[0].col);
  if (env.isWater(path[0].row, path[0].col)) return refuse('rampWater', path[0]);
  if (base > FLYOVER.maxBaseLevel) return refuse('tooHigh', path[0]);
  const level = base + FLYOVER.deckLevels;
  const tag = style === 'suspension' ? ':s' : '';
  for (let i = 0; i < n; i++) {
    const p = path[i];
    const { row: r, col: c } = p;
    if (!env.inside(r, c)) return refuse('outside', p);
    if (env.blocked(r, c)) return refuse('blocked', p);
    if (env.shelter(r, c)) return refuse('shelter', p);
    if (i < R || i >= n - R) {
      if (env.isWater(r, c)) return refuse('rampWater', p);
      if (env.isSlope(r, c) || env.height(r, c) !== base) return refuse('rampGround', p);
      if (env.rail(r, c)) return refuse('rampRail', p);
      const step = i < R ? i : n - 1 - i;
      out.tiles.push({ row: r, col: c, kind: 'ramp', value: `ramp:${i < R ? up : down}:${base + step}${tag}` });
      continue;
    }
    if (env.isWater(r, c)) {
      if (env.nearPier(r, c)) return refuse('pier', p);
      out.water += 1;
    } else {
      // (a road under it: a 立交, its traffic passing under - Norton 2026-11-27)
      if (env.isSlope(r, c) || env.height(r, c) > base) return refuse('deckGround', p);
      if (env.rail(r, c) === 'no') return refuse('rail', p);
      if (env.isRoad(r, c)) out.roads += 1;
    }
    out.tiles.push({ row: r, col: c, kind: 'deck', value: `deck:${axis}:${level}${tag}` });
  }
  if (style === 'suspension' && out.water < FLYOVER.suspensionMinWater) {
    out.reason = 'suspensionWater';
    out.tiles = [];
    return out;
  }
  const roadCost = typeof COST_ROAD === 'number' ? COST_ROAD : 10;
  const decks = n - 2 * R;
  out.base = base;
  out.level = level;
  out.cost = n * roadCost + 2 * R * FLYOVER.rampCostPerTile
    + decks * (style === 'suspension' ? FLYOVER.suspensionDeckCostPerTile : FLYOVER.deckCostPerTile);
  out.ok = true;
  return out;
}

const HIGH_BRIDGE_REFUSALS = Object.freeze({
  tooShort: ['highBridge.tooShort', '天橋最少要九格：兩頭各四格上落斜路，中間至少一格橋面。'],
  outside: ['highBridge.outside', '超出地圖範圍。'],
  tooHigh: ['highBridge.tooHigh', '呢度太高，起唔到天橋。'],
  blocked: ['highBridge.blocked', '天橋經過嘅地方有嘢擋住（建築、車站、碼頭、巴士站、海濱長廊、隧道口或者其他橋）。'],
  shelter: ['highBridge.shelter', '避風塘規劃範圍內唔可以起橋。'],
  rampWater: ['highBridge.rampWater', '兩頭四格上落斜路要起喺陸地上。'],
  rampGround: ['highBridge.rampGround', '上落斜路要起喺同一高度嘅平地上（唔可以喺山坡）。'],
  rampRail: ['highBridge.rampRail', '上落斜路唔可以壓住路軌：拖長啲，等橋面跨過路軌。'],
  pier: ['highBridge.pier', '渡輪碼頭 2 格範圍內唔可以起橋。'],
  deckGround: ['highBridge.deckGround', '橋面下面要係平地，唔可以高過兩頭嘅地面。'],
  rail: ['highBridge.rail', '天橋下面嘅路軌要係地面或者地底路軌（唔可以係車站、上落橋、高架或者隧道口）。'],
  suspensionWater: ['highBridge.suspensionWater', '懸索橋要跨過最少 {n} 格海面。'],
  funds: ['highBridge.funds', '資金唔夠起橋（要 ${cost}）。'],
});

function highBridgeRefusal(reason, vars = {}) {
  const [key, fallback] = HIGH_BRIDGE_REFUSALS[reason] || HIGH_BRIDGE_REFUSALS.blocked;
  return highBridgeT(key, fallback, { n: FLYOVER.suspensionMinWater, ...vars });
}

// ── On the map ──────────────────────────────────────────────────────────────────────────────────────

// Railway track on a tile, as a deck sees it: null, 'under' (track on the ground or in a tunnel - the
// deck spans it) or 'no' (a ramp, a portal, a viaduct: as high as the deck).
function highBridgeRailAt(row, col) {
  let found = null;
  if (typeof isMetroTrackTile === 'function' && isMetroTrackTile(row, col)) {
    const code = typeof getMetroTrackElev === 'function' ? getMetroTrackElev()[`${row}:${col}`] : null;
    if (code && (typeof railGroundUse !== 'function' || railGroundUse(code) !== 'none')) return 'no';
    found = 'under';
  }
  if (typeof isLightRailTrackTile === 'function' && isLightRailTrackTile(row, col)) {
    if (getLightRailState().trackElev[`${row}:${col}`]) return 'no';
    found = 'under';
  }
  return found;
}

// Track on the ground under a deck tile (no pier stands on it).
function highBridgeSurfaceRailAt(row, col) {
  if (typeof metroTrackGroundUse === 'function' && metroTrackGroundUse(row, col) === 'ground') return true;
  if (typeof lightRailGroundUse === 'function' && lightRailGroundUse(row, col) === 'ground') return true;
  return false;
}

function highBridgeMapEnv(scene) {
  return {
    inside: (r, c) => isInsideMap(r, c),
    height: (r, c) => getTileHeight(r, c),
    isWater: (r, c) => mapData[r][c] === WATER,
    isSlope: (r, c) => typeof isSlopeTile === 'function' && isSlopeTile(r, c),
    isRoad: (r, c) => mapData[r][c] === ROAD,
    blocked: (r, c) => {
      const id = getTileId(r, c);
      return Boolean(buildingData[id] || scene?.buildingSprites?.has(id)
        || (typeof isBridgeTile === 'function' && isBridgeTile(r, c))
        || (typeof isUnderseaTunnelTile === 'function' && isUnderseaTunnelTile(r, c))
        || (typeof isPromenadeTile === 'function' && isPromenadeTile(r, c))
        || (typeof isMetroStationTile === 'function' && isMetroStationTile(r, c))
        || (typeof isMetroSurfaceStationTile === 'function' && isMetroSurfaceStationTile(r, c))
        || (typeof isLightRailStationTile === 'function' && isLightRailStationTile(r, c))
        || (typeof getFerryPierAt === 'function' && getFerryPierAt(r, c))
        || (typeof getBusStopAtTile === 'function' && getBusStopAtTile(r, c))
        || (typeof hasDistrictSignAt === 'function' && hasDistrictSignAt(r, c)));
    },
    rail: highBridgeRailAt,
    shelter: (r, c) => typeof findTyphoonShelterAt === 'function' && Boolean(findTyphoonShelterAt(r, c)),
    nearPier: (r, c) => typeof isNearFerryPier === 'function' && isNearFerryPier(r, c),
  };
}

// The road tool's drag with 天橋 / 懸索橋 picked (main.js commitRoadDrag, tool-actions.js).
function planHighBridge(scene, pathInfo, style = roadBridgeStyle) {
  return planHighBridgePure(pathInfo?.path || [], pathInfo?.axis || 'row', style, highBridgeMapEnv(scene));
}

function buildHighBridge(scene, plan) {
  if (!plan?.ok) return false;
  if (!spendBudget(plan.cost)) {
    if (typeof showToast === 'function') showToast(highBridgeRefusal('funds', { cost: plan.cost.toLocaleString() }), 'warning');
    return false;
  }
  plan.tiles.forEach(({ row, col, kind, value }) => {
    const id = getTileId(row, col);
    const oldType = mapData[row][col];
    removeTree(scene, row, col);
    removeDebris(scene, row, col);
    removeZoneOverlay(scene, row, col);
    if (typeof zoneMap !== 'undefined' && zoneMap[row]) zoneMap[row][col] = typeof ZONE_NONE !== 'undefined' ? ZONE_NONE : 0;
    bridgeMap.set(id, value);
    roadUnderlayMap.set(id, oldType);
    if (kind === 'ramp') {
      if (oldType !== ROAD) roadTileCount++;
      mapData[row][col] = ROAD;
    } else if (oldType !== ROAD) {
      // (a deck over a road is that road's tile still: counted once)
      roadTileCount++;
    }
  });
  refreshTilesAlongPath(scene, plan.tiles);
  refreshBridgeSpritesAlongPath(scene, plan.tiles);
  if (typeof markTrafficNetworkDirty === 'function') markTrafficNetworkDirty(plan.tiles);
  if (typeof refreshInfrastructureEffects === 'function') refreshInfrastructureEffects(scene);
  onHighBridgeChanged(scene, plan.tiles);
  if (typeof updateHUD === 'function') updateHUD();
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  if (typeof showToast === 'function') {
    const name = plan.style === 'suspension' ? highBridgeT('highBridge.name.suspension', '懸索橋') : highBridgeT('highBridge.name.flyover', '天橋');
    showToast(highBridgeT('highBridge.built', '起好{name}：{n} 格（${cost}）。', { name, n: plan.tiles.length, cost: plan.cost.toLocaleString() }), 'success');
  }
  return true;
}

// A high bridge's tiles changed (built, or one bulldozed): a suspension bridge's cables follow its
// whole length, so every tile of the runs touched is drawn again.
function onHighBridgeChanged(scene, tiles) {
  if (!scene?.bridgeSprites) return;
  const done = new Set();
  tiles.forEach(({ row, col }) => {
    [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
      const r = row + dr, c = col + dc;
      if (!isInsideMap(r, c) || !isHighBridgeTile(r, c)) return;
      highBridgeRun(r, c).tiles.forEach((tile) => {
        const id = getTileId(tile.row, tile.col);
        if (done.has(id)) return;
        done.add(id);
        refreshBridgeSprite(scene, tile.row, tile.col);
      });
    });
  });
}

// The run of high bridge tiles through (row, col) along its axis, one style: { tiles (in map order),
// axis, suspension, level (the deck's) }.
function highBridgeRun(row, col) {
  const info = getBridgeInfo(row, col);
  if (!info?.high) return { tiles: [], axis: null, suspension: false, level: 0 };
  const [dr, dc] = info.axis === 'row' ? [0, 1] : [1, 0];
  const same = (r, c) => {
    if (!isInsideMap(r, c)) return null;
    const other = getBridgeInfo(r, c);
    return other?.high && other.axis === info.axis && other.suspension === info.suspension ? other : null;
  };
  let r0 = row, c0 = col;
  while (same(r0 - dr, c0 - dc)) { r0 -= dr; c0 -= dc; }
  const tiles = [];
  let level = info.kind === 'deck' ? info.level : 0;
  for (let r = r0, c = c0; ; r += dr, c += dc) {
    const other = same(r, c);
    if (!other) break;
    tiles.push({ row: r, col: c, info: other });
    if (other.kind === 'deck') level = Math.max(level, other.level);
    else level = Math.max(level, other.level + 1);
  }
  return { tiles, axis: info.axis, suspension: info.suspension, level };
}

// A 天橋's deck over a road (立交): the tile has two roads, the ground's and the deck's.
function isHighBridgeInterchangeTile(row, col) {
  const info = getBridgeInfo(row, col);
  return Boolean(info?.high && info.kind === 'deck' && mapData[row][col] === ROAD);
}

// ── Depth ───────────────────────────────────────────────────────────────────────────────────────────

// A high bridge tile's pictures sort at its front corner in the object band, as the metro viaduct's
// deck tiles do; what stands on it a little after, in this order.
const HIGH_BRIDGE_DEPTH = Object.freeze({
  towerFarLow: -0.02, pier: -0.01, towerFar: 0.02, cableFar: 0.03, far: 0.05, farPost: 0.08, vehicle: 0.1,
  nearPost: 0.5, near: 0.6, cableNear: 0.7, towerNear: 0.75, cableFarFront: 0.78, cableNearFront: 0.8,
});

function highBridgeTileDepth(row, col) {
  return getWorldDepth('object', isoToScreen(col, row).y + TILE_HEIGHT);
}

// `part` of HIGH_BRIDGE_DEPTH on a high bridge tile; null on any other tile.
function highBridgeItemDepth(row, col, part) {
  if (!isInsideMap(row, col) || !isHighBridgeTile(row, col)) return null;
  return highBridgeTileDepth(row, col) + (HIGH_BRIDGE_DEPTH[part] ?? 0);
}

// A lamp post (street-lamps.js placement) on a high bridge: behind the traffic on the far kerb, in
// front of it on the near one.
function highBridgePostDepth(placement) {
  const info = isInsideMap(placement.row, placement.col) ? getBridgeInfo(placement.row, placement.col) : null;
  if (!info?.high) return null;
  const across = info.axis === 'row' ? Math.sign(placement.offsetRow || 0) : Math.sign(placement.offsetCol || 0);
  const side = info.axis === 'row' ? (across > 0 ? 's' : 'n') : (across > 0 ? 'e' : 'w');
  const visual = typeof rotateDirection === 'function' ? rotateDirection(side, typeof mapRotation === 'number' ? mapRotation : 0) : side;
  return highBridgeItemDepth(placement.row, placement.col, visual === 's' || visual === 'e' ? 'nearPost' : 'farPost');
}

// A road vehicle (traffic-visuals.js) on a high bridge, or running onto one: over the decks of the
// tiles it is on and coming to, ordered among the others on them by how near it is. Null off them.
function highBridgeVehicleDepth(vehicle, position) {
  let floor = -Infinity;
  [vehicle?.current, vehicle?.next].forEach((tile) => {
    if (!tile || !isInsideMap(tile.row, tile.col) || !isHighBridgeTile(tile.row, tile.col)) return;
    // (on the road under a 天橋 crossing it: under the deck, not on it)
    if (isHighBridgeInterchangeTile(tile.row, tile.col) && tile.layer !== 'deck') return;
    floor = Math.max(floor, highBridgeTileDepth(tile.row, tile.col));
  });
  if (floor === -Infinity) return null;
  const y = Number(position?.depthY) || 0;
  return floor + HIGH_BRIDGE_DEPTH.vehicle + ((((y % TILE_HEIGHT) + TILE_HEIGHT) % TILE_HEIGHT) / TILE_HEIGHT) * 0.3;
}

// The depth of a high bridge's deck over the screen point (x, y) - a train passing under it is put
// just before it (metro-surface.js metroDeckDepthOver, metro-surface-lines.js) - or null.
function highBridgeDeckDepthOver(scene, x, y) {
  if (!scene?.bridgeSprites?.size || typeof screenToIso !== 'function') return null;
  const iso = screenToIso(x - scene.offsetX, y - scene.offsetY + (typeof TILE_PICK_Y_OFFSET === 'number' ? TILE_PICK_Y_OFFSET : 0));
  const r0 = Math.floor(iso.y), c0 = Math.floor(iso.x);
  const hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2;
  let best = null;
  for (let dr = -1; dr <= 2; dr++) {
    for (let dc = -1; dc <= 2; dc++) {
      const entry = scene.bridgeSprites.get(`${r0 + dr}:${c0 + dc}`);
      if (!entry?.high || !entry.deckLiftPx || !entry.body?.visible) continue;
      const f = metroFlatTileCentre(scene, r0 + dr, c0 + dc);
      const ground = entry.groundPx || 0;
      const dx = x - f.x, dy = y - (f.y - ground);
      if (Math.abs(dx) >= hw) continue;
      const w = hh * (1 - Math.abs(dx) / hw);
      if (dy > w || dy < -w - entry.deckLiftPx) continue;
      best = best == null ? entry.body.depth : Math.min(best, entry.body.depth);
    }
  }
  return best;
}

// ── Pictures ────────────────────────────────────────────────────────────────────────────────────────
// Drawn here on canvases, in the visual frame (the map turned): u along the screen's south-east, v
// along its south-west, both -0.5..0.5 across a tile from its middle, z up in px. A deck along a road
// is 0.75 of a tile wide (the low bridge's art: bridges.js), its kerbs raised, a yellow line inside
// each and a white one down the middle; a concrete box girder under it on piers (天橋), or a steel
// truss hung from the cables (懸索橋). Faces toward the south-west are lit, the south-east in shade.

const HIGH_BRIDGE_RES = 2;            // canvas px a screen px
const HB = Object.freeze({
  half: 0.375, kerb: 0.09, kerbUp: 2, lineIn: 0.25, lineW: 0.022, centreW: 0.026,
  slab: 6, girder: 7, girderHalf: 0.27, truss: 12, trussHalf: 0.37,
  cableAt: 0.42, legAt: 0.45, legHalf: 0.05, legAlong: 0.075,
});
const HB_COLOUR = Object.freeze({
  asphalt: '#3e3f3d', kerbTop: '#8f9087', kerbLit: '#b4b2a7', kerbShade: '#9b998f',
  yellow: '#a68b44', white: '#e4e4df',
  slabLit: '#dbd8ce', slabShade: '#b8b5aa', slabLine: 'rgba(60,58,52,0.35)',
  girderLit: '#b7b4a9', girderShade: '#97958c',
  wallLit: '#cdcabe', wallShade: '#adaa9f', wallJoint: 'rgba(40,38,32,0.16)', coping: '#e3e0d6',
  pierLit: '#c6c3b8', pierShade: '#a19f95', waterline: 'rgba(30,45,55,0.45)',
  trussLit: '#c9cdcb', trussShade: '#a7acaa', trussBar: '#6d7471',
  towerLit: '#dad7cc', towerShade: '#b0ada2', towerTrim: 'rgba(70,66,58,0.25)',
  cable: '#dcddd8', cableShadow: 'rgba(60,62,62,0.55)', hanger: 'rgba(205,207,203,0.95)',
  // at night (added over the darkened bridge): the cables' lamps, the towers' floodlight and their
  // aircraft warning lamps
  // (Norton 2026-11-27, a photo of 青馬大橋 by night: cool white lamps strung along the cables, the deck
  // a line of gold, the towers washed blue-white brightening to the head, gold and white in the sea)
  cableLamp: [236, 244, 255], deckLamp: [255, 184, 88], underlight: 'rgba(255,176,86,0.26)',
  flood: [150, 232, 246], floodShadeK: 0.65, towerTop: [255, 255, 246], warning: [255, 52, 40],
  reflectDeck: 0xff9a34, reflectTower: 0xc6f0ff,
});

// A lamp's glow: bright in the middle, fading out over `r` px (drawn added at night).
function hbGlow(ctx, x, y, r, [red, green, blue], k = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${red},${green},${blue},${k})`);
  g.addColorStop(0.35, `rgba(${red},${green},${blue},${0.75 * k})`);
  g.addColorStop(1, `rgba(${red},${green},${blue},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function hbProject(u, v, z) {
  return [(TILE_WIDTH / 2) * (u - v), (TILE_HEIGHT / 2) * (u + v) - z];
}

// (along, across) in a tile -> (u, v), for a bridge running along the screen's u or v
function hbFrame(visAxis) {
  return visAxis === 'u' ? (a, b) => [a, b] : (a, b) => [b, a];
}

function hbPoly(ctx, pts, fill) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// A face standing at `across` = b, along a0..a1, from zLo(a) up to zHi(a) (straight between the ends).
function hbFace(ctx, frame, b, zLo, zHi, fill, a0 = -0.5, a1 = 0.5) {
  const P = (a, z) => { const [u, v] = frame(a, b); return hbProject(u, v, z); };
  hbPoly(ctx, [P(a0, zHi(a0)), P(a1, zHi(a1)), P(a1, zLo(a1)), P(a0, zLo(a0))], fill);
}

// A face across the bridge at along = a, across b0..b1, zLo..zHi.
function hbEndFace(ctx, frame, a, b0, b1, zLo, zHi, fill) {
  const P = (b, z) => { const [u, v] = frame(a, b); return hbProject(u, v, z); };
  hbPoly(ctx, [P(b0, zHi), P(b1, zHi), P(b1, zLo), P(b0, zLo)], fill);
}

// A strip of the road's surface, across b0..b1, at z(a) + dz.
function hbSurface(ctx, frame, b0, b1, z, dz, fill, a0 = -0.5, a1 = 0.5) {
  const P = (a, b) => { const [u, v] = frame(a, b); return hbProject(u, v, z(a) + dz); };
  hbPoly(ctx, [P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)], fill);
}

// A box (along a0..a1, across b0..b1, z0..z1): its two faces toward the viewer and its top.
function hbBox(ctx, frame, visAxis, a0, a1, b0, b1, z0, z1, lit, shade, top = null) {
  const alongLit = visAxis === 'v';   // the face at a1 faces south-west (lit) when along is v
  hbEndFace(ctx, frame, a1, b0, b1, z0, z1, alongLit ? lit : shade);
  hbFace(ctx, frame, b1, () => z0, () => z1, alongLit ? shade : lit, a0, a1);
  if (top) hbSurface(ctx, frame, b0, b1, () => z1, 0, top, a0, a1);
}

// The road on top: asphalt, the kerbs, the lines - at z(a).
function hbDrawRoad(ctx, frame, visAxis, z, a0, a1) {
  const lit = visAxis === 'u';        // the faces toward +across face south-west when along is u
  hbSurface(ctx, frame, -HB.half, HB.half, z, 0, HB_COLOUR.asphalt, a0, a1);
  hbFace(ctx, frame, -HB.half + HB.kerb, (a) => z(a), (a) => z(a) + HB.kerbUp, lit ? HB_COLOUR.kerbLit : HB_COLOUR.kerbShade, a0, a1);
  hbSurface(ctx, frame, -HB.half, -HB.half + HB.kerb, z, HB.kerbUp, HB_COLOUR.kerbTop, a0, a1);
  hbSurface(ctx, frame, HB.half - HB.kerb, HB.half, z, HB.kerbUp, HB_COLOUR.kerbTop, a0, a1);
  hbSurface(ctx, frame, -HB.lineIn - HB.lineW, -HB.lineIn, z, 0, HB_COLOUR.yellow, a0, a1);
  hbSurface(ctx, frame, HB.lineIn, HB.lineIn + HB.lineW, z, 0, HB_COLOUR.yellow, a0, a1);
  hbSurface(ctx, frame, -HB.centreW / 2, HB.centreW / 2, z, 0, HB_COLOUR.white, a0, a1);
}

// A steel truss face (懸索橋's deck): its chords and diagonals, at across b, zLo..zHi.
function hbTrussFace(ctx, frame, b, zLo, zHi, lit, a0 = -0.5, a1 = 0.5) {
  hbFace(ctx, frame, b, () => zLo, () => zHi, lit ? HB_COLOUR.trussLit : HB_COLOUR.trussShade, a0, a1);
  const P = (a, z) => { const [u, v] = frame(a, b); return hbProject(u, v, z); };
  ctx.strokeStyle = HB_COLOUR.trussBar;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  [zLo + 0.5, zHi - 0.5].forEach((z) => { const [x0, y0] = P(a0, z); const [x1, y1] = P(a1, z); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); });
  const bays = 4;
  for (let k = 0; k <= bays; k++) {
    const a = a0 + ((a1 - a0) * k) / bays;
    const [x0, y0] = P(a, zLo); const [x1, y1] = P(a, zHi);
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    if (k < bays) {
      const an = a0 + ((a1 - a0) * (k + 1)) / bays;
      const [x2, y2] = P(an, k % 2 ? zLo : zHi);
      const [x3, y3] = P(a, k % 2 ? zHi : zLo);
      ctx.moveTo(x3, y3); ctx.lineTo(x2, y2);
    }
  }
  ctx.stroke();
}

// A canvas texture `key` of `w` x `h` screen px whose point (ax, ay) is the picture's anchor; drawn
// by draw(ctx) with that point at the origin. Kept once made; { ox, oy } for setOrigin.
const highBridgeTextureAnchors = new Map();

function hbTexture(scene, key, w, h, ax, ay, draw) {
  if (!scene.textures.exists(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * HIGH_BRIDGE_RES);
    canvas.height = Math.ceil(h * HIGH_BRIDGE_RES);
    const ctx = canvas.getContext('2d');
    ctx.scale(HIGH_BRIDGE_RES, HIGH_BRIDGE_RES);
    ctx.translate(ax, ay);
    ctx.lineJoin = 'round';
    draw(ctx);
    // (drawn first, then added: a canvas added empty and refreshed keeps empty mipmaps)
    scene.textures.addCanvas(key, canvas);
  }
  highBridgeTextureAnchors.set(key, { ox: ax / w, oy: ay / h });
  return key;
}

// The deck tile, its surface at the anchor's height.
function hbDeckTexture(scene, visAxis, suspension) {
  const key = `hb_deck_${visAxis}_${suspension ? 's' : 'f'}`;
  const frame = hbFrame(visAxis);
  const lit = visAxis === 'u';
  return hbTexture(scene, key, 128, 128, 64, 40, (ctx) => {
    const A0 = -0.505, A1 = 0.505;
    const zero = () => 0;
    if (suspension) {
      hbTrussFace(ctx, frame, HB.trussHalf, -HB.slab - HB.truss, -HB.slab + 0.5, lit, A0, A1);
    } else {
      hbFace(ctx, frame, HB.girderHalf, () => -HB.slab - HB.girder, () => -HB.slab + 0.5, lit ? HB_COLOUR.girderLit : HB_COLOUR.girderShade, A0, A1);
    }
    hbFace(ctx, frame, HB.half, () => -HB.slab, () => HB.kerbUp, lit ? HB_COLOUR.slabLit : HB_COLOUR.slabShade, A0, A1);
    hbFace(ctx, frame, HB.half, () => -HB.slab, () => -HB.slab + 0.8, HB_COLOUR.slabLine, A0, A1);
    hbDrawRoad(ctx, frame, visAxis, zero, A0, A1);
  });
}

// A ramp tile: the road climbing from z0 to z0 + a level toward `visDir`, on a walled embankment
// from the ground (the anchor) up.
function hbRampTexture(scene, visDir, z0) {
  const key = `hb_ramp_${visDir}_${z0}`;
  const visAxis = visDir === 'e' || visDir === 'w' ? 'u' : 'v';
  const frame = hbFrame(visAxis);
  const lit = visAxis === 'u';
  const toPlus = visDir === 'e' || visDir === 's';
  const step = typeof HEIGHT_STEP_PIXELS === 'number' ? HEIGHT_STEP_PIXELS : 13;
  const z = (a) => z0 + step * (toPlus ? a + 0.5 : 0.5 - a);
  return hbTexture(scene, key, 128, 128, 64, 96, (ctx) => {
    const A0 = -0.505, A1 = 0.505;
    hbFace(ctx, frame, HB.half, () => 0, (a) => z(a) + HB.kerbUp, lit ? HB_COLOUR.wallLit : HB_COLOUR.wallShade, A0, A1);
    // the wall's panels and its coping
    const P = (a, zz) => { const [u, v] = frame(a, HB.half); return hbProject(u, v, zz); };
    ctx.strokeStyle = HB_COLOUR.wallJoint;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    [-0.25, 0, 0.25].forEach((a) => {
      if (z(a) < 3) return;
      const [x0, y0] = P(a, 0.5); const [x1, y1] = P(a, z(a) - 1.2);
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    });
    ctx.stroke();
    hbFace(ctx, frame, HB.half, (a) => Math.max(0, z(a) - 1.4), (a) => z(a) + HB.kerbUp, HB_COLOUR.coping, A0, A1);
    // the top ramp's end, toward the viewer where the deck goes on over open ground: an abutment wall
    if (toPlus && z(0.5) >= FLYOVER.deckLevels * step - 0.01) {
      hbEndFace(ctx, frame, 0.5, -HB.half, HB.half, 0, z(0.5) + HB.kerbUp, lit ? HB_COLOUR.wallShade : HB_COLOUR.wallLit);
      hbEndFace(ctx, frame, 0.5, -HB.half, HB.half, z(0.5) - 1.4, z(0.5) + HB.kerbUp, HB_COLOUR.coping);
    }
    hbDrawRoad(ctx, frame, visAxis, z, A0, A1);
  });
}

// A 懸索橋 deck or ramp tile's lights at night, at its surface z(a): `side` 'far' - the far kerb's
// lamps in a line of gold and the truss lit from below; 'near' - the near kerb's (over the traffic
// and the parapet). The anchor as the tile's own picture's.
function hbDeckLightTexture(scene, key, visAxis, z, side, w, h, ax, ay) {
  const frame = hbFrame(visAxis);
  return hbTexture(scene, key, w, h, ax, ay, (ctx) => {
    if (side === 'far') hbFace(ctx, frame, HB.trussHalf, (a) => z(a) - HB.slab - HB.truss, (a) => z(a) - HB.slab + 0.5, HB_COLOUR.underlight);
    const b = side === 'far' ? -HB.half + 0.02 : HB.half - 0.02;
    for (let k = 0; k < 12; k++) {
      const a = -0.5 + (k + 0.5) / 12;
      const [x, y] = hbProject(...frame(a, b), z(a) + HB.kerbUp + 3);
      hbGlow(ctx, x, y, 6.5, HB_COLOUR.deckLamp, 0.52);
      hbGlow(ctx, x, y, 1.7, [255, 226, 160], 0.85);
    }
  });
}

// A pier from the ground (the anchor) up to the girder: a column and its crosshead.
function hbPierTexture(scene, visAxis, height, water) {
  const h = Math.max(6, Math.round(height));
  const key = `hb_pier_${visAxis}_${h}_${water ? 'w' : 'g'}`;
  const frame = hbFrame(visAxis);
  return hbTexture(scene, key, 64, h + 40, 32, h + 24, (ctx) => {
    hbBox(ctx, frame, visAxis, -0.06, 0.06, -0.085, 0.085, 0, h - 5, HB_COLOUR.pierLit, HB_COLOUR.pierShade);
    hbBox(ctx, frame, visAxis, -0.07, 0.07, -0.26, 0.26, h - 5, h, HB_COLOUR.pierLit, HB_COLOUR.pierShade);
    if (water) hbBox(ctx, frame, visAxis, -0.075, 0.075, -0.1, 0.1, 0, 1.6, HB_COLOUR.waterline, HB_COLOUR.waterline);
  });
}

// ── 懸索橋: the cables and towers ────────────────────────────────────────────────────────────────────
// Over a run of tiles (s = 0 at its first tile's outer edge, n at the last's), its deck at z 0 and its
// ramps below: two towers over the water a sixth of the way in from each end of the deck, the main
// cable sagging between them nearly to the deck, the side spans down to an anchorage on each end's
// first tile; hangers every quarter tile. As 青馬大橋: tall concrete towers, their legs narrowing as
// they rise, four portal beams; a deep steel truss under the road.

function suspensionGeometry(run) {
  const n = run.tiles.length;
  const decks = run.tiles.map((t, i) => (t.info.kind === 'deck' ? i : -1)).filter((i) => i >= 0);
  if (decks.length < 3) return null;
  const first = decks[0], last = decks[decks.length - 1];
  const inset = Math.max(1, Math.round((last - first) * 0.17));
  const t1 = first + inset, t2 = last - inset;
  if (t2 - t1 < 2) return null;
  const main = t2 - t1;
  const towerH = Math.max(FLYOVER.suspensionMinTowerPx, Math.min(220, main * 13.5));
  const step = typeof HEIGHT_STEP_PIXELS === 'number' ? HEIGHT_STEP_PIXELS : 13;
  // the deck's height (relative to the deck level) at s
  const deckZ = (s) => {
    const i = Math.max(0, Math.min(n - 1, Math.floor(s)));
    const info = run.tiles[i].info;
    if (info.kind === 'deck') return 0;
    const f = Math.max(0, Math.min(1, s - i));
    const climbsWithS = info.dir === (run.axis === 'row' ? 'e' : 's');
    const z0 = (info.level - run.level) * step;
    return z0 + step * (climbsWithS ? f : 1 - f);
  };
  const s1 = t1 + 0.5, s2 = t2 + 0.5, sm = (s1 + s2) / 2, half = (s2 - s1) / 2;
  const sagZ = 7;
  const sA = 0.5, sB = n - 0.5;
  const anchorTop = (sEnd) => deckZ(sEnd) + 11;
  const zA = anchorTop(sA), zB = anchorTop(sB);
  const cableZ = (s) => {
    if (s >= s1 && s <= s2) {
      const x = (s - sm) / half;
      return sagZ + (towerH - sagZ) * x * x;
    }
    if (s < s1) {
      const x = Math.max(0, (s - sA) / (s1 - sA));
      return zA + (towerH - zA) * (0.35 * x * x + 0.65 * x);
    }
    const x = Math.max(0, (sB - s) / (sB - s2));
    return zB + (towerH - zB) * (0.35 * x * x + 0.65 * x);
  };
  return { n, towers: [t1, t2], towerH, deckZ, cableZ, ends: [sA, sB], anchorTop };
}

// The cables are drawn from three small textures every bridge shares - a length of cable, a hanger,
// a lamp's glow - laid as many little sprites, rotated and stretched: a per-tile canvas of each cable
// held ~70 MB for one long bridge (GPU and CPU both) and helped a phone browser over its limit
// (Norton 2026-11-28: 起埋條橋好似會死多兩錢).
const HB_SHARED = Object.freeze({ cable: 'hb_line_cable', hanger: 'hb_line_hanger', glow: 'hb_glow' });

function hbSharedTextures(scene) {
  if (scene.textures.exists(HB_SHARED.glow)) return;
  const make = (key, w, h, draw) => {
    if (scene.textures.exists(key)) return;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext('2d'));
    scene.textures.addCanvas(key, canvas);
  };
  // a cable, lit side up, its shadow under it: rows 2-5 the cable, 6-7 the shadow
  make(HB_SHARED.cable, 32, 8, (ctx) => {
    ctx.fillStyle = HB_COLOUR.cable;
    ctx.fillRect(0, 2, 32, 4);
    ctx.fillStyle = HB_COLOUR.cableShadow;
    ctx.fillRect(0, 6, 32, 2);
  });
  make(HB_SHARED.hanger, 32, 4, (ctx) => {
    ctx.fillStyle = HB_COLOUR.hanger;
    ctx.fillRect(0, 1, 32, 2);
  });
  // a lamp: a hard bright middle in a soft halo (tinted to its colour, drawn added)
  make(HB_SHARED.glow, 32, 32, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.14, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  });
}

// One tile's cable on one side (`b` the across of its plane), over a0..a1 of the tile: [{ id, key,
// dx, dy (from the anchor: the deck level over the tile's middle), rot, sx, sy, ox, oy, lit, tint }] -
// the cable in short straight lengths, its hangers every quarter tile, at night its lamps.
function hbCablePieces(geo, visAxis, b, sAt, sMid, a0 = -0.5, a1 = 0.5) {
  const frame = hbFrame(visAxis);
  const P = (a, z) => hbProject(...frame(a, b), z);
  const inSpan = (s) => s >= geo.ends[0] - 1e-6 && s <= geo.ends[1] + 1e-6;
  const dir = sAt(1) - sAt(0) > 0 ? 1 : -1;
  const aOf = (s) => (s - sMid) * dir;
  const out = [];
  const line = (id, key, p0, p1, thick, rows) => {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy);
    if (len < 0.2) return;
    // (a hair longer at each end, so the lengths meet without a gap where they turn)
    out.push({ id, key, dx: p0[0] - (dx / len) * 0.4, dy: p0[1] - (dy / len) * 0.4, rot: Math.atan2(dy, dx),
      sx: (len + 0.8) / 32, sy: thick / rows, ox: 0, oy: 0.5 });
  };
  // the cable: from the anchorage on, in quarter-tile lengths
  const stops = [];
  for (let k = 0; k <= 4; k++) stops.push(a0 + ((a1 - a0) * k) / 4);
  geo.ends.forEach((sEnd) => { const a = aOf(sEnd); if (a > a0 && a < a1) stops.push(a); });
  stops.sort((x, y) => x - y);
  const inside = stops.filter((a) => inSpan(sAt(a)));
  for (let i = 0; i + 1 < inside.length; i++) {
    const p0 = P(inside[i], geo.cableZ(sAt(inside[i]))), p1 = P(inside[i + 1], geo.cableZ(sAt(inside[i + 1])));
    // (a parabola: a length's middle sags under the chord - two halves follow it)
    const am = (inside[i] + inside[i + 1]) / 2;
    const pm = P(am, geo.cableZ(sAt(am)));
    line(`c${i}a`, HB_SHARED.cable, p0, pm, 2.4 * 8 / 6, 8);
    line(`c${i}b`, HB_SHARED.cable, pm, p1, 2.4 * 8 / 6, 8);
  }
  // the hangers, the cable down to the deck's edge
  [-0.375, -0.125, 0.125, 0.375].forEach((a, i) => {
    if (a < a0 || a > a1) return;
    const s = sAt(a);
    if (!inSpan(s)) return;
    const zc = geo.cableZ(s), zd = geo.deckZ(s) + HB.kerbUp;
    if (zc - zd < 4) return;
    line(`h${i}`, HB_SHARED.hanger, P(a, zc), P(a, zd), 0.6 * 4 / 2, 4);
  });
  // at night, a lamp every eighth of a tile (the run's own eighths: each drawn by one tile only)
  const lo = sAt(dir > 0 ? a0 : a1), hi = sAt(dir > 0 ? a1 : a0);
  for (let k = Math.ceil(lo * 8 - 1e-6); k / 8 < hi - 1e-6; k++) {
    const sk = k / 8;
    if (!inSpan(sk)) continue;
    const [x, y] = P(aOf(sk), geo.cableZ(sk));
    out.push({ id: `l${k}`, key: HB_SHARED.glow, dx: x, dy: y, rot: 0, sx: 11 / 32, sy: 11 / 32, ox: 0.5, oy: 0.5, lit: true,
      tint: (HB_COLOUR.cableLamp[0] << 16) | (HB_COLOUR.cableLamp[1] << 8) | HB_COLOUR.cableLamp[2] });
  }
  return out;
}

// The anchorage at a bridge's end, on one side: a concrete block on the ground the cable runs into.
// The anchor: the deck level over its tile's middle.
function hbAnchorTexture(scene, visAxis, b, zt, groundZ) {
  const key = `hb_anchor_${visAxis}_${b > 0 ? 'n' : 'f'}_${Math.round(zt)}_${Math.round(groundZ)}`;
  const frame = hbFrame(visAxis);
  const h = Math.ceil(zt - groundZ + 64);
  return hbTexture(scene, key, 128, h, 64, Math.ceil(zt + 32), (ctx) => {
    const outward = b > 0 ? 1 : -1;
    const lo = outward > 0 ? b - 0.03 : b - 0.12, hi = outward > 0 ? b + 0.12 : b + 0.03;
    hbBox(ctx, frame, visAxis, -0.3, 0.3, lo, hi, groundZ, zt - 3, HB_COLOUR.towerLit, HB_COLOUR.towerShade, HB_COLOUR.towerLit);
    hbBox(ctx, frame, visAxis, -0.2, 0.2, lo + 0.02, hi - 0.02, zt - 3, zt, HB_COLOUR.towerShade, HB_COLOUR.towerShade, HB_COLOUR.towerLit);
  });
}

// A face given by its four corners (along, across, z).
function hbQuad(ctx, frame, corners, fill) {
  hbPoly(ctx, corners.map(([a, b, z]) => { const [u, v] = frame(a, b); return hbProject(u, v, z); }), fill);
}

// A tower leg at across `b`, from z0 to z1, narrowing as it rises (half-widths along / across at
// the foot and the head): its two faces toward the viewer and its top.
function hbLeg(ctx, frame, visAxis, b, z0, z1, along0, along1, across0, across1) {
  const alongLit = visAxis === 'v';
  hbQuad(ctx, frame, [[along0, b - across0, z0], [along0, b + across0, z0], [along1, b + across1, z1], [along1, b - across1, z1]],
    alongLit ? HB_COLOUR.towerLit : HB_COLOUR.towerShade);
  hbQuad(ctx, frame, [[-along0, b + across0, z0], [along0, b + across0, z0], [along1, b + across1, z1], [-along1, b + across1, z1]],
    alongLit ? HB_COLOUR.towerShade : HB_COLOUR.towerLit);
  hbQuad(ctx, frame, [[-along1, b - across1, z1], [along1, b - across1, z1], [along1, b + across1, z1], [-along1, b + across1, z1]], HB_COLOUR.towerLit);
}

// A tower's pieces: 'farLow' - its far leg under the deck (behind the deck); 'far' - the far leg over
// the deck (behind the traffic); 'near' - the near leg, its foot to its top, with the portal beams
// across (over the road, in front of the traffic). `groundZ` the ground (or the sea) under it, below
// the deck.
function hbTowerTexture(scene, key, visAxis, piece, towerH, groundZ, water, lit = false) {
  const frame = hbFrame(visAxis);
  const z0 = piece === 'far' ? -HB.slab : groundZ;
  const z1 = piece === 'farLow' ? -HB.slab : towerH;
  const h = Math.ceil(z1 - z0 + 84);
  const ay = Math.ceil(z1 + 48);
  const b = piece === 'near' ? HB.legAt : -HB.legAt;
  // (the leg's half-widths at a height: wide at the sea, narrower at the top)
  const along = (z) => 0.105 - 0.035 * Math.max(0, Math.min(1, (z - groundZ) / (towerH - groundZ)));
  const across = (z) => 0.075 - 0.028 * Math.max(0, Math.min(1, (z - groundZ) / (towerH - groundZ)));
  return hbTexture(scene, key, 128, h, 64, ay, (ctx) => {
    // at night: floodlight up the faces toward the viewer, a red lamp on each leg's head
    if (lit) {
      // the floodlight: faint at the sea, brightest at the head
      const [fr, fg, fb] = HB_COLOUR.flood;
      const yAt = (z) => hbProject(...frame(0, b), z)[1];
      const wash = (k) => {
        const g = ctx.createLinearGradient(0, yAt(groundZ), 0, yAt(towerH));
        g.addColorStop(0, `rgba(${fr},${fg},${fb},${0.08 * k})`);
        g.addColorStop(0.55, `rgba(${fr},${fg},${fb},${0.3 * k})`);
        g.addColorStop(1, `rgba(${fr},${fg},${fb},${0.68 * k})`);
        return g;
      };
      const alongLit = visAxis === 'v';
      const [a0w, a1w, c0w, c1w] = [along(z0), along(z1), across(z0), across(z1)];
      hbQuad(ctx, frame, [[a0w, b - c0w, z0], [a0w, b + c0w, z0], [a1w, b + c1w, z1], [a1w, b - c1w, z1]], wash(alongLit ? 1 : HB_COLOUR.floodShadeK));
      hbQuad(ctx, frame, [[-a0w, b + c0w, z0], [a0w, b + c0w, z0], [a1w, b + c1w, z1], [-a1w, b + c1w, z1]], wash(alongLit ? HB_COLOUR.floodShadeK : 1));
      if (piece === 'near') {
        [0.34, 0.6, 0.83, 1].map((f) => HB.kerbUp + 18 + (towerH - HB.kerbUp - 18) * f).forEach((zTop, i) => {
          const deep = i === 3 ? 9 : 7;
          hbEndFace(ctx, frame, 0.055, -HB.legAt, HB.legAt, zTop - deep, zTop, wash(alongLit ? 1 : HB_COLOUR.floodShadeK));
        });
        // the head lit white, over the top beam
        const [tx, ty] = hbProject(...frame(0, 0), towerH - 4);
        hbGlow(ctx, tx, ty, 22, HB_COLOUR.towerTop, 0.22);
        hbGlow(ctx, tx, ty, 9, HB_COLOUR.towerTop, 0.35);
      }
      if (z1 === towerH) {
        const [x, y] = hbProject(...frame(0, b), towerH + 4);
        hbGlow(ctx, x, y, 3.2, HB_COLOUR.warning);
      }
      return;
    }
    const leg = () => {
      if (water && z0 === groundZ) hbBox(ctx, frame, visAxis, -0.15, 0.15, b - 0.12, b + 0.12, groundZ, groundZ + 5, HB_COLOUR.pierLit, HB_COLOUR.pierShade, HB_COLOUR.pierShade);
      hbLeg(ctx, frame, visAxis, b, z0, z1, along(z0), along(z1), across(z0), across(z1));
      if (z1 === towerH) hbBox(ctx, frame, visAxis, -0.05, 0.05, b - 0.035, b + 0.035, towerH, towerH + 3, HB_COLOUR.towerShade, HB_COLOUR.towerShade, HB_COLOUR.towerLit);
    };
    if (piece !== 'near') { leg(); return; }
    // the portal beams: three over the road, the top one at the head
    [0.34, 0.6, 0.83, 1].map((f) => HB.kerbUp + 18 + (towerH - HB.kerbUp - 18) * f).forEach((zTop, i) => {
      const deep = i === 3 ? 9 : 7;
      hbBox(ctx, frame, visAxis, -0.055, 0.055, -HB.legAt, HB.legAt, zTop - deep, zTop, HB_COLOUR.towerLit, HB_COLOUR.towerShade, HB_COLOUR.towerLit);
    });
    leg();
  });
}

// ── The pieces of a tile ────────────────────────────────────────────────────────────────────────────

function hbVisualAxis(axis, rotation) {
  const visual = typeof rotateDirection === 'function' ? rotateDirection(axis === 'row' ? 'e' : 's', rotation) : (axis === 'row' ? 'e' : 's');
  return visual === 'e' || visual === 'w' ? 'u' : 'v';
}

function hbPlace(scene, sprite, key, x, y, depth, lit = false) {
  let s = sprite;
  if (!s) {
    s = scene.add.image(x, y, key);
    if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, s, 'objectLayer');
    if (scene.worldMask) s.setMask(scene.worldMask);
    if (lit) {
      // (a night light: added over the darkened bridge, untinted, as bright as the city's lights are
      // on - updateHighBridgeLights)
      s.setBlendMode?.(typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 'ADD');
      s.__nightNone = true;
      s.__hbLit = true;
    } else {
      // (standing on the ground but drawn in the object band: darkened with the ground, as the
      // metro's decks are - day-night-lighting.js applyNightPropTint)
      s.__nightGround = true;
    }
  } else if (s.texture.key !== key) {
    s.setTexture(key);
  }
  const anchor = highBridgeTextureAnchors.get(key) || { ox: 0.5, oy: 0.5 };
  s.setOrigin(anchor.ox, anchor.oy).setScale(1 / HIGH_BRIDGE_RES).setPosition(x, y).setDepth(depth);
  if (lit) s.setAlpha(highBridgeLightStrength(scene));
  else if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, s);
  return s;
}

// A piece of a cable on a shared texture (hbCablePieces): placed from the anchor, turned and
// stretched; a lamp tinted its colour and added at night.
function hbPlacePiece(scene, sprite, piece, x, y, depth) {
  let s = sprite;
  if (!s) {
    s = scene.add.image(0, 0, piece.key);
    if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, s, 'objectLayer');
    if (scene.worldMask) s.setMask(scene.worldMask);
    if (piece.lit) {
      s.setBlendMode?.(typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 'ADD');
      s.__nightNone = true;
      s.__hbLit = true;
    } else {
      s.__nightGround = true;
    }
  } else if (s.texture.key !== piece.key) {
    s.setTexture(piece.key);
  }
  s.setOrigin(piece.ox, piece.oy).setPosition(x + piece.dx, y + piece.dy).setRotation(piece.rot || 0)
    .setScale(piece.sx, piece.sy).setDepth(depth);
  if (piece.lit) {
    s.setTint(piece.tint);
    s.setAlpha(highBridgeLightStrength(scene));
  } else if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, s);
  return s;
}

// How bright the bridges' night lights are: with the buildings' windows (day-night-lighting.js).
function highBridgeLightStrength(scene) {
  return Math.max(0, Math.min(1, Number(scene?.buildingLightStrength) || 0));
}

// The lighting tick (day-night-lighting.js updateDynamicLighting): the lights up as the night comes.
function updateHighBridgeLights(scene) {
  if (!scene?.bridgeSprites?.size) return;
  const strength = highBridgeLightStrength(scene);
  if (scene.__highBridgeLightStrength === strength) return;
  scene.__highBridgeLightStrength = strength;
  const reflect = highBridgeReflectionStrength(scene);
  scene.bridgeSprites.forEach((entry) => {
    if (!entry?.high) return;
    (entry.extra || []).forEach((sprite) => {
      if (sprite.__hbReflection) sprite.setAlpha(sprite.__hbAlpha * reflect);
      else if (sprite.__hbLit) sprite.setAlpha(strength);
    });
  });
}

// The bridges' light in the sea: with their lamps, and only with the shore reflections setting on
// (water-effects.js).
function highBridgeReflectionStrength(scene) {
  if (typeof isShoreReflectionsEnabled === 'function' && !isShoreReflectionsEnabled()) return 0;
  return highBridgeLightStrength(scene);
}

// A streak of light in the sea under a deck tile: the shore reflections' rippled streak
// (water-effects.js), from the water under the deck down past where the deck's mirror image lies.
function hbPlaceReflection(scene, sprite, x, y, { tint, width, length, base }) {
  if (typeof ensureShoreReflectionTexture !== 'function' || !ensureShoreReflectionTexture(scene)) return null;
  const cell = typeof SHORE_REFLECTION_CELL !== 'undefined' ? SHORE_REFLECTION_CELL : { width: 48, height: 128 };
  let s = sprite;
  if (!s) {
    s = scene.add.image(x, y, SHORE_REFLECTION_TEXTURE_KEY, 0);
    if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, s, 'objectLayer');
    if (scene.worldMask) s.setMask(scene.worldMask);
    s.setBlendMode?.(typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 'ADD');
    s.__nightNone = true;
    s.__hbReflection = true;
    s.__hbPhase = Math.floor(Math.random() * (typeof WATER_EFFECT_FRAMES === 'number' ? WATER_EFFECT_FRAMES : 3));
  }
  s.__hbAlpha = base;
  s.setOrigin(0.5, 0).setPosition(x, y).setTint(tint);
  s.setScale((TILE_WIDTH / 2) * width / cell.width, length / cell.height);
  // (on the water, under every object - as the waterfront's streaks)
  s.setDepth(getWorldDepth('object') - 0.24);
  s.setAlpha(base * highBridgeReflectionStrength(scene));
  return s;
}

// A few times a second (water-effects.js updateShoreReflections): the streaks ripple.
function updateHighBridgeReflections(scene, time) {
  if (!scene?.bridgeSprites?.size || time < (scene.__hbReflectAt || 0)) return;
  scene.__hbReflectAt = time + 220;
  const strength = highBridgeReflectionStrength(scene);
  if (strength <= 0 && !scene.__hbReflectShown) return;
  scene.__hbReflectShown = strength > 0;
  scene.__hbReflectTick = (scene.__hbReflectTick || 0) + 1;
  const frames = typeof WATER_EFFECT_FRAMES === 'number' ? WATER_EFFECT_FRAMES : 3;
  scene.bridgeSprites.forEach((entry) => {
    if (!entry?.high) return;
    (entry.extra || []).forEach((sprite) => {
      if (!sprite.__hbReflection) return;
      sprite.setAlpha(sprite.__hbAlpha * strength);
      if (strength > 0 && sprite.visible) sprite.setFrame((scene.__hbReflectTick + sprite.__hbPhase) % frames);
    });
  });
}

// A tile's own canvases (the cables'), dropped when it no longer shows them.
function hbDropTextures(scene, entry, keep) {
  (entry.ownTextures || []).forEach((key) => {
    if (keep.has(key) || !scene.textures.exists(key)) return;
    scene.textures.remove(key);
    highBridgeTextureAnchors.delete(key);
  });
  entry.ownTextures = [...keep];
}

// A tile's pieces gone (bridges.js destroyBridgeSpriteEntry): its own canvases with them.
function releaseHighBridgeEntry(scene, entry) {
  if (!scene?.textures) return;
  (entry?.ownTextures || []).forEach((key) => {
    if (!scene.textures.exists(key)) return;
    scene.textures.remove(key);
    highBridgeTextureAnchors.delete(key);
  });
  if (entry) entry.ownTextures = [];
}

// bridges.js refreshBridgeSprite / repositionBridgeSprites: the pieces of high bridge tile (row, col)
// made or placed again. `entry` the tile's old ones, or null. { high, body, side (pier), top (near
// cable), extra (far cable, tower legs), deckLiftPx, groundPx }.
function upsertHighBridgeEntry(scene, row, col, entry) {
  const info = getBridgeInfo(row, col);
  const out = entry || { high: true, body: null, side: null, top: null, extra: [] };
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  const step = typeof HEIGHT_STEP_PIXELS === 'number' ? HEIGHT_STEP_PIXELS : 13;
  const flat = metroFlatTileCentre(scene, row, col);
  const water = mapData[row][col] === WATER;
  const ground = water ? 0 : getTileHeight(row, col);
  const depth = highBridgeTileDepth(row, col);
  const visAxis = hbVisualAxis(info.axis, rotation);
  if (info.kind === 'deck') {
    out.body = hbPlace(scene, out.body, hbDeckTexture(scene, visAxis, info.suspension), flat.x, flat.y - info.level * step, depth);
  } else {
    const visDir = typeof rotateDirection === 'function' ? rotateDirection(info.dir, rotation) : info.dir;
    out.body = hbPlace(scene, out.body, hbRampTexture(scene, visDir, (info.level - ground) * step), flat.x, flat.y - ground * step, depth);
  }
  out.deckLiftPx = info.kind === 'deck' ? (info.level - ground) * step : 0;
  out.groundPx = ground * step;
  // a pier under a 天橋's deck, but not on the track it spans
  const pier = info.kind === 'deck' && !info.suspension && !highBridgeSurfaceRailAt(row, col) && mapData[row][col] !== ROAD;
  if (pier) {
    const height = (info.level - ground) * step - HB.slab - HB.girder;
    out.side = hbPlace(scene, out.side, hbPierTexture(scene, visAxis, height, water), flat.x, flat.y - ground * step, depth + HIGH_BRIDGE_DEPTH.pier);
  } else if (out.side) {
    out.side.destroy();
    out.side = null;
  }
  // a 懸索橋's cables, and its towers on their tiles: each piece sorted at its place among the deck's
  // (HIGH_BRIDGE_DEPTH); on a tower's tile the cables are cut at the tower, the half nearer the viewer
  // over its beams
  const own = new Set();
  const wanted = [];
  if (info.suspension) {
    const run = highBridgeRun(row, col);
    const geo = suspensionGeometry(run);
    const index = run.tiles.findIndex((tile) => tile.row === row && tile.col === col);
    if (geo && index >= 0) {
      // s along the run for `a` across this tile in the visual frame: +a is the map's way of the run,
      // or against it, as the map is turned
      const plusDir = visAxis === 'u' ? 'e' : 's';
      const mapPlus = info.axis === 'row' ? 'e' : 's';
      const sign = (typeof rotateDirection === 'function' ? rotateDirection(mapPlus, rotation) : mapPlus) === plusDir ? 1 : -1;
      const sMid = index + 0.5;
      const sAt = (a) => sMid + sign * a;
      const deckY = flat.y - run.level * step;
      const groundZ = (ground - run.level) * step;
      const tower = geo.towers.includes(index);
      hbSharedTextures(scene);
      const halves = tower ? [['Back', -0.5, 0], ['Front', 0, 0.5]] : [['', -0.5, 0.5]];
      [['Far', -HB.cableAt], ['Near', HB.cableAt]].forEach(([side, b]) => {
        halves.forEach(([half, a0, a1]) => {
          const depthPart = half === 'Front' ? (side === 'Far' ? 'cableFarFront' : 'cableNearFront') : (side === 'Far' ? 'cableFar' : 'cableNear');
          hbCablePieces(geo, visAxis, b, sAt, sMid, a0, a1).forEach((piece) => {
            wanted.push({ ...piece, part: `cable${side}${half}:${piece.id}`, depth: HIGH_BRIDGE_DEPTH[depthPart] + (piece.lit ? 0.004 : 0), y: deckY });
          });
        });
        // the anchorage, on an end tile. Its block reaches over the bridge tiles beside it along the run,
        // so it sorts by them (Norton, 2026-11-28: 穿模): the far one behind the deck and parapets of
        // the furthest of them, the near one in front of those of the nearest
        geo.ends.forEach((sEnd) => {
          if (Math.abs(sEnd - sMid) > 0.5) return;
          const key = hbAnchorTexture(scene, visAxis, b, geo.anchorTop(sEnd), groundZ);
          const own = highBridgeTileDepth(row, col);
          const along = info.axis === 'row' ? [[row, col - 1], [row, col + 1]] : [[row - 1, col], [row + 1, col]];
          const spanned = [own, ...along.filter(([r, c]) => isInsideMap(r, c) && isHighBridgeTile(r, c)).map(([r, c]) => highBridgeTileDepth(r, c))];
          const offset = side === 'Far'
            ? Math.min(...spanned) - own + HIGH_BRIDGE_DEPTH.towerFarLow - 0.005
            : Math.max(...spanned) - own + HIGH_BRIDGE_DEPTH.cableNear - 0.001;
          wanted.push({ part: `anchor${side}`, key, depth: offset, y: deckY });
        });
      });
      // the deck's line of gold, its two kerbs
      const zDeck = info.kind === 'deck' ? () => 0 : (() => {
        const visDir = typeof rotateDirection === 'function' ? rotateDirection(info.dir, rotation) : info.dir;
        const toPlus = visDir === 'e' || visDir === 's';
        const z0 = (info.level - run.level) * step;
        return (a) => z0 + step * (toPlus ? a + 0.5 : 0.5 - a);
      })();
      const visRise = info.kind === 'deck' ? 'flat' : (typeof rotateDirection === 'function' ? rotateDirection(info.dir, rotation) : info.dir);
      ['far', 'near'].forEach((side) => {
        const key = `hb_decklight_${visAxis}_${visRise}_${info.kind === 'deck' ? 0 : (info.level - run.level)}_${side}`;
        hbDeckLightTexture(scene, key, visAxis, zDeck, side, 128, 208, 64, 96);
        // (the far kerb's over its parapet, under the traffic: Norton 2026-11-27, 橋面兩側都要有燈帶)
        wanted.push({ part: `deckLight${side}`, key, depth: side === 'far' ? HIGH_BRIDGE_DEPTH.far + 0.02 : HIGH_BRIDGE_DEPTH.near + 0.02, y: deckY, lit: true });
      });
      if (tower) {
        ['farLow', 'far', 'near'].forEach((piece) => {
          const key = `hb_tower_${visAxis}_${piece}_${Math.round(geo.towerH)}_${groundZ}_${water ? 'w' : 'g'}`;
          hbTowerTexture(scene, key, visAxis, piece, geo.towerH, groundZ, water);
          const part = { farLow: 'towerFarLow', far: 'towerFar', near: 'towerNear' }[piece];
          wanted.push({ part, key, depth: HIGH_BRIDGE_DEPTH[part], y: deckY, towerH: geo.towerH });
          hbTowerTexture(scene, `${key}_lit`, visAxis, piece, geo.towerH, groundZ, water, true);
          wanted.push({ part: `${part}Lit`, key: `${key}_lit`, depth: HIGH_BRIDGE_DEPTH[part] + 0.004, y: deckY, lit: true });
        });
      }
    }
  }
  // at night, gold in the sea under a deck over the water, and the towers' blue-white
  const reflections = [];
  if (info.kind === 'deck' && water) {
    const lift = (info.level - ground) * step;
    reflections.push({ part: 'reflectDeck', tint: HB_COLOUR.reflectDeck, width: 1.3, length: lift * 2.3 + 18, base: info.suspension ? 0.8 : 0.45 });
    if (info.suspension && wanted.some((w) => w.part === 'towerNear')) {
      const geoH = wanted.find((w) => w.part === 'towerNear').towerH || 0;
      reflections.push({ part: 'reflectTower', tint: HB_COLOUR.reflectTower, width: 0.5, length: lift + geoH * 1.1, base: 0.7 });
    }
  }
  const old = new Map([...(out.extra || []), ...(out.top ? [out.top] : [])].map((sprite) => [sprite.__hbPart, sprite]));
  const extra = [];
  let near = null;
  wanted.forEach((w) => {
    const { part, key, depth: offset, y, lit } = w;
    const sprite = w.sx != null
      ? hbPlacePiece(scene, old.get(part), w, flat.x, y, depth + offset)
      : hbPlace(scene, old.get(part), key, flat.x, y, depth + offset, lit);
    old.delete(part);
    sprite.__hbPart = part;
    if (part === 'cableNear') near = sprite;
    else extra.push(sprite);
  });
  reflections.forEach((r) => {
    const sprite = hbPlaceReflection(scene, old.get(r.part), flat.x, flat.y, r);
    old.delete(r.part);
    if (sprite) { sprite.__hbPart = r.part; extra.push(sprite); }
  });
  old.forEach((sprite) => sprite.destroy());
  out.extra = extra;
  out.top = near;
  hbDropTextures(scene, out, own);
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FLYOVER, ROAD_BRIDGE_STYLES, planHighBridgePure, highBridgeDirBetween, HIGH_BRIDGE_REFUSALS,
  };
}
