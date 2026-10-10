// 海濱步道 (waterfront promenade), built from the parks menu tile by tile along the shore
// (Norton, 2026-10-10). The typhoon shelters' promenade kit, laid on whole tiles: the parks' dark
// red brick (promenadeBrickSquare, scripts/source-art/typhoonShelter/tools/promenade.py --only
// promenadeBrick) in four 10 m cells, on each cell side the coping and seawall toward the sea or
// the kerb toward the land, a vintage lamp on every other tile, and along the open sea the
// harbourfront railing - left out at a public pier (公眾碼頭), where bollards and mooring rings
// stand on the coping instead (no landing stage: Norton, 2026-10-10): one in every
// PROMENADE.pierEvery tiles along a run, or wherever the player right-clicks one in (or out).
// Facing a typhoon shelter's basin it has no railing, as the shelter's own quays have none. Along
// it, a park bench facing the sea on every tile between the lamps and a litter bin by each lamp
// (street-furniture art, PROMENADE_PROPS).
//
// It counts as a small park (service coverage, so land value) and adds a little to the city's
// attractiveness; its upkeep is on the parks' budget line. State: city.promenade.tiles,
// { 'row:col': 0 (pier as the run picks) | 1 (a pier) | 2 (no pier) }.

const PROMENADE = Object.freeze({
  cost: 400,
  upkeep: 5,               // a month, per tile
  pierEvery: 6,            // a public pier in every this many tiles along a run
  parkRadius: 5,           // tiles: covered as by a small park
  attractivenessPerTile: 0.08,
  attractivenessCap: 6,
  lampInM: 6,              // the lamp: this far in from the tile's centre toward the sea
});

// The seaside furniture: [kind, metres in from the tile's centre toward the sea, metres along the
// promenade], on the tiles with a lamp ('lamp') and those between ('between').
const PROMENADE_PROPS = Object.freeze({
  lamp: Object.freeze([['bin', 7.2, 5]]),
  between: Object.freeze([['bench', 7.2, 0]]),
});

const PROMENADE_STEP = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });
const PROMENADE_OPPOSITE = Object.freeze({ n: 's', s: 'n', e: 'w', w: 'e' });

// Open water a promenade faces: not the water under a bridge (the bridge's deck meets the paving
// there - a kerb, no coping, wall or railing jutting out under it).
function isPromenadeSea(row, col) {
  return isInsideMap(row, col) && mapData[row][col] === WATER && !(typeof isBridgeTile === 'function' && isBridgeTile(row, col));
}

// A bridge or its ramp on this tile or one round it: the lamps, benches and bins (drawn with the
// objects, over every bridge) keep off such a tile, or they stood on the bridge's parapet.
function isPromenadeNearBridge(row, col) {
  const sprites = typeof activeScene !== 'undefined' ? activeScene?.bridgeSprites : null;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const [r, c] = [row + dr, col + dc];
      if (!isInsideMap(r, c)) continue;
      if ((typeof isBridgeTile === 'function' && isBridgeTile(r, c)) || sprites?.has(getTileId(r, c))) return true;
    }
  }
  return false;
}

function normalizePromenadeState(raw) {
  const tiles = {};
  Object.entries(raw?.tiles || {}).forEach(([key, value]) => {
    if (!/^\d+:\d+$/.test(key)) return;
    const pier = Number(value);
    tiles[key] = pier === 1 || pier === 2 ? pier : 0;
  });
  return { version: 1, tiles };
}

function getPromenadeState() {
  if (typeof city === 'undefined') return { version: 1, tiles: {} };
  if (!city.promenade || typeof city.promenade !== 'object' || !city.promenade.tiles) city.promenade = normalizePromenadeState(city.promenade);
  return city.promenade;
}

function isPromenadeTile(row, col) {
  return Object.prototype.hasOwnProperty.call(getPromenadeState().tiles, `${row}:${col}`);
}

function getPromenadeTileKeys() {
  return Object.keys(getPromenadeState().tiles);
}

// Why a promenade may not go on (row, col) - a code, or null when it may: on land at the water's
// edge (a side on the sea), flat, with no road, building, bridge, sign or shelter quay on it.
function whyNotPromenadeAt(row, col, ctx = {}) {
  const inside = ctx.isInside || ((r, c) => typeof isInsideMap === 'function' && isInsideMap(r, c));
  const isWater = ctx.isWater || ((r, c) => mapData[r][c] === WATER);
  const isSea = ctx.isSea || ctx.isWater || ((r, c) => isPromenadeSea(r, c));
  const isFree = ctx.isFree || ((r, c) => promenadeTileIsFree(r, c));
  if (!inside(row, col)) return 'outside';
  if (ctx.isPromenade ? ctx.isPromenade(row, col) : isPromenadeTile(row, col)) return 'built';
  if (isWater(row, col)) return 'water';
  if (!isFree(row, col)) return 'occupied';
  const touches = Object.values(PROMENADE_STEP).some(([dr, dc]) => inside(row + dr, col + dc) && isSea(row + dr, col + dc));
  if (!touches) return 'notShore';
  return null;
}

function promenadeTileIsFree(row, col) {
  const id = getTileId(row, col);
  if (![GROUND, DIRT, BEACH].includes(mapData[row][col])) return false;
  if (typeof isSlopeTile === 'function' && isSlopeTile(row, col)) return false;
  if (typeof isBridgeTile === 'function' && isBridgeTile(row, col)) return false;
  if (buildingData?.[id] || activeScene?.buildingSprites?.has(id)) return false;
  if (typeof hasDistrictSignAt === 'function' && hasDistrictSignAt(row, col)) return false;
  // a shelter's own quay has its promenade already
  if (typeof isTyphoonShelterQuayTile === 'function' && isTyphoonShelterQuayTile(row, col) && !isPromenadeTile(row, col)) return false;
  return true;
}

let promenadeToastAt = 0;

function promenadeToast(code) {
  // a drag over the shore says why a tile was skipped once, not once a tile
  const now = Date.now();
  if (now - promenadeToastAt < 1500) return;
  promenadeToastAt = now;
  const say = (key, fallback) => (typeof t === 'function' ? t(key) : fallback);
  const text = {
    notShore: say('promenade.toast.notShore', '海濱步道要起喺貼住海嘅陸地。'),
    occupied: say('promenade.toast.occupied', '呢格有路、建築或者橋，起唔到海濱步道。'),
    water: say('promenade.toast.notShore', '海濱步道要起喺貼住海嘅陸地。'),
  }[code];
  if (text && typeof showToast === 'function') showToast(text, 'warning');
}

// The parks menu's tool, a click or a drag over the shore: one tile at a time.
function placePromenade(scene, row, col, { quiet = false } = {}) {
  const why = whyNotPromenadeAt(row, col);
  if (why) {
    if (!quiet && why !== 'built' && why !== 'outside') promenadeToast(why);
    return false;
  }
  if (!spendBudget(PROMENADE.cost)) {
    if (!quiet && typeof showToast === 'function') showToast(t('toast.notEnoughFunds'), 'warning');
    return false;
  }
  getPromenadeState().tiles[`${row}:${col}`] = 0;
  onPromenadeChanged(scene);
  return true;
}

// The bulldozer: true when it took a promenade tile up (nothing else on it to knock down).
function demolishPromenadeAt(scene, row, col) {
  if (!isPromenadeTile(row, col)) return false;
  delete getPromenadeState().tiles[`${row}:${col}`];
  if (typeof spendBudget === 'function' && typeof COST_BULLDOZE === 'number') spendBudget(COST_BULLDOZE);
  onPromenadeChanged(scene);
  return true;
}

// A right-click with the tool on a promenade tile: a public pier there (or none, if the run had
// put one there), and back to the run's choice on the next.
function togglePromenadePierAt(scene, row, col) {
  const key = `${row}:${col}`;
  const state = getPromenadeState();
  if (!isPromenadeTile(row, col)) return false;
  const auto = getPromenadePiers(state).auto.has(key);
  const now = state.tiles[key];
  state.tiles[key] = now === 0 ? (auto ? 2 : 1) : 0;
  onPromenadeChanged(scene);
  if (typeof showToast === 'function') {
    const pier = getPromenadePiers(state).piers.has(key);
    showToast(pier ? t('promenade.toast.pierOn') : t('promenade.toast.pierOff'), 'info');
  }
  return true;
}

// The sides of a promenade tile on the water: ['n', 'e', ...].
function getPromenadeSeaSides(row, col, isWater = isPromenadeSea) {
  return Object.entries(PROMENADE_STEP).filter(([, [dr, dc]]) => isWater(row + dr, col + dc)).map(([side]) => side);
}

// The public piers: { piers: Set of 'row:col', auto: Set }. Along each run of promenade on the
// water (tiles joined side by side), one in every pierEvery tiles - starting half a run in, so a
// short run gets its pier near the middle; the player's own choices on top.
function getPromenadePiers(state = getPromenadeState(), seaSidesOf = getPromenadeSeaSides) {
  const keys = Object.keys(state.tiles).filter((k) => seaSidesOf(...k.split(':').map(Number)).length);
  const left = new Set(keys);
  const auto = new Set();
  while (left.size) {
    const start = left.values().next().value;
    left.delete(start);
    const run = [start];
    for (let i = 0; i < run.length; i++) {
      const [r, c] = run[i].split(':').map(Number);
      Object.values(PROMENADE_STEP).forEach(([dr, dc]) => {
        const k = `${r + dr}:${c + dc}`;
        if (left.has(k)) { left.delete(k); run.push(k); }
      });
    }
    // along the run: by its longer extent
    const rc = run.map((k) => k.split(':').map(Number));
    const spanR = Math.max(...rc.map(([r]) => r)) - Math.min(...rc.map(([r]) => r));
    const spanC = Math.max(...rc.map(([, c]) => c)) - Math.min(...rc.map(([, c]) => c));
    rc.sort((a, b) => (spanR >= spanC ? (a[0] - b[0]) || (a[1] - b[1]) : (a[1] - b[1]) || (a[0] - b[0])));
    const first = Math.min(rc.length - 1, Math.floor(Math.min(PROMENADE.pierEvery, rc.length) / 2));
    for (let i = first; i < rc.length; i += PROMENADE.pierEvery) auto.add(`${rc[i][0]}:${rc[i][1]}`);
  }
  const piers = new Set();
  keys.forEach((k) => {
    const choice = state.tiles[k];
    if (choice === 1 || (choice === 0 && auto.has(k))) piers.add(k);
  });
  return { piers, auto };
}

// The shelters' water: a promenade facing it has no railing, as their quays have none.
function getPromenadeShelterWater() {
  const water = new Set();
  if (typeof getTyphoonShelterAnalyses !== 'function') return water;
  getTyphoonShelterAnalyses().forEach((a) => {
    a?.basin?.forEach((k) => water.add(k));
    a?.ring?.forEach((k) => water.add(k));
  });
  return water;
}

// Every piece to draw: Map id -> record for addTyphoonShelterObject.
function layPromenadePieces(state = getPromenadeState()) {
  const wanted = new Map();
  const keys = Object.keys(state.tiles);
  if (!keys.length) return wanted;
  const tileM = typeof TYPHOON_SHELTER_TILE_M === 'number' ? TYPHOON_SHELTER_TILE_M : 20;
  const half = tileM / 4;
  const isWater = isPromenadeSea;
  const shelterWater = getPromenadeShelterWater();
  const { piers } = getPromenadePiers(state, (r, c) => getPromenadeSeaSides(r, c, isWater));
  const nearBridge = isPromenadeNearBridge;
  const railing = typeof PROMENADE_RAILING !== 'undefined' ? PROMENADE_RAILING
    : { objectId: 'shoreFence_straightA', insetM: 0.6, along: [-3.33, 0, 3.33] };
  const band = new Set();
  keys.forEach((k) => {
    const [r, c] = k.split(':').map(Number);
    for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) band.add(`${2 * r + dr}:${2 * c + dc}`);
  });
  // The paving, its edges, the railing and a pier's fittings are ground (record.ground): drawn under
  // every road and bridge - a bridge or its ramp beside the promenade is drawn over its wall and
  // railing, however the two sort by position (sorted among the roads by where they lay, the
  // tiles beside a ramp still came out on top of it) - and under the cars, people and buildings.
  // The ground's night pass darkens them there, as it does the roads: a tint of their own (white)
  // keeps the props' night tint off, which would darken them twice. The lamps stand with the objects.
  const record = (id, row, col, facing, objectId, offsets, depthBias, extra = {}) => wanted.set(id, {
    id, objectId, row, col, facing, tag: 'promenade', alpha: 1, tint: 0xffffff, ground: true,
    footprintOverride: { cols: 1, rows: 1 }, shoreAlign: false, shoreDir: null,
    sectioned: true, alongM: 0, offsets, depthBias, variant: ((row * 31 + col) & 7), hidden: false, ...extra,
  });
  band.forEach((key) => {
    const [R, C] = key.split(':').map(Number);
    const row = Math.floor(R / 2);
    const col = Math.floor(C / 2);
    const tileKey = `${row}:${col}`;
    const offsets = [[R % 2 ? 's' : 'n', half], [C % 2 ? 'e' : 'w', half]];
    record(`prom|${key}`, row, col, 'e', 'promenadeBrickSquare', offsets, 0);
    Object.entries(PROMENADE_STEP).forEach(([side, [dr, dc]]) => {
      const [nR, nC] = [R + dr, C + dc];
      if (band.has(`${nR}:${nC}`)) return;
      const [tr, tc] = [Math.floor(nR / 2), Math.floor(nC / 2)];
      const sea = (tr !== row || tc !== col) && isWater(tr, tc);
      record(`prom|${key}#${side}`, row, col, side, sea ? 'promenadeEdge' : 'promenadeKerb', offsets, sea ? 0.04 : 0.02);
      // the railing along the open sea: not facing a shelter, nor at a public pier
      if (sea && !shelterWater.has(`${tr}:${tc}`) && !piers.has(tileKey)) {
        const run = side === 'n' || side === 's' ? 'e' : 'n';
        const edge = half - railing.insetM;
        railing.along.forEach((along, i) => record(`prom|${key}#rail${side}${i}`, row, col, run, railing.objectId,
          [...offsets, [side, edge], [run, along]], 0.06));
      }
    });
  });
  keys.forEach((tileKey) => {
    const [row, col] = tileKey.split(':').map(Number);
    const sides = getPromenadeSeaSides(row, col, isWater);
    const sea = sides[0];
    if ((row + col) % 2 === 0) {
      if (!nearBridge(row, col)) record(`prom|${tileKey}#lamp`, row, col, sea || 's', 'promenadeLamp', sea ? [[sea, PROMENADE.lampInM]] : [], 0.3, { tint: null, ground: false });
    }
    // a public pier: bollards and mooring rings on the coping where the railing is left out, as
    // on the shelters' quays (QUAY_EDGE)
    if (sea && piers.has(tileKey)) {
      const edge = typeof QUAY_EDGE !== 'undefined' ? QUAY_EDGE
        : { insetM: 0.9, fittings: [['pierAssessories_bollardSmall', -7.5], ['pierAssessories_mooringRing', -2.5], ['pierAssessories_mooringRing', 2.5], ['pierAssessories_bollardSmall', 7.5]] };
      const run = sea === 'n' || sea === 's' ? 'e' : 'n';
      const edgeM = tileM / 2 - edge.insetM;
      edge.fittings.forEach(([objectId, along], i) => record(`prom|${tileKey}#fit${i}`, row, col, run, objectId,
        [[sea, edgeM], [run, along]], 0.2, { sectioned: false }));
    }
  });
  return wanted;
}

// Make the promenade's sprites match the state (they live with the shelters' works, tag 'promenade').
// addTyphoonShelterObject registers its record only after an await, so a second pass in the same
// moment (a drag lays several tiles a frame) would not see the first pass's pieces: it would add
// them again, and could not take back those no longer wanted - the stray landing stages and
// railing across a pier. The pieces still on their way are kept here, by id, with what they are.
function syncPromenadeSprites(scene = typeof activeScene !== 'undefined' ? activeScene : null) {
  if (!scene || typeof addTyphoonShelterObject !== 'function') return;
  syncPromenadeProps(scene);
  if (!scene.typhoonShelterObjects) scene.typhoonShelterObjects = new Map();
  const pending = scene.promenadePending || (scene.promenadePending = new Map());
  const sig = (w) => `${w.objectId}|${w.facing}|${w.row}|${w.col}|${w.depthBias || 0}|${w.tint || 0}|${w.ground ? 1 : 0}`;
  const wanted = layPromenadePieces();
  [...scene.typhoonShelterObjects.values()].forEach((rec) => {
    if (rec.tag === 'promenade' && !wanted.has(rec.id) && !pending.has(rec.id)) removeTyphoonShelterObject(scene, rec.id);
  });
  pending.forEach((_, id) => { if (!wanted.has(id)) pending.set(id, null); });
  wanted.forEach((w, id) => {
    const want = sig(w);
    if (pending.has(id)) { pending.set(id, want); return; } // its piece is on its way: settled when it lands
    const rec = scene.typhoonShelterObjects.get(id);
    if (rec && sig(rec) === want) return;
    if (rec) removeTyphoonShelterObject(scene, id);
    pending.set(id, want);
    addTyphoonShelterObject(scene, w).then((added) => {
      const now = pending.get(id);
      pending.delete(id);
      if (now === want) return;
      // no longer wanted, or wanted otherwise since: take it back, and lay the new one
      if (scene.typhoonShelterObjects.get(id) === added) removeTyphoonShelterObject(scene, id);
      else { added.sprite?.destroy(); added.lightSprite?.destroy(); }
      if (now) schedulePromenadeSync(scene);
    }).catch((error) => {
      pending.delete(id);
      console.warn('[promenade] sprite', error?.message);
    });
  });
}

// One pass a frame however many tiles a drag laid in it.
function schedulePromenadeSync(scene) {
  if (!scene || scene.promenadeSyncQueued) return;
  scene.promenadeSyncQueued = true;
  const run = () => { scene.promenadeSyncQueued = false; syncPromenadeSprites(scene); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 0);
}

// The benches and bins: street-furniture sprites of their own (scene.promenadePropSprites), culled
// and darkened after dark with the roadside furniture (viewport-culling.js, day-night-lighting.js).
// Each: { kind, row, col, sea, inM, alongM }.
function layPromenadeProps(state = getPromenadeState()) {
  const props = [];
  const isWater = isPromenadeSea;
  const tileM = typeof TYPHOON_SHELTER_TILE_M === 'number' ? TYPHOON_SHELTER_TILE_M : 20;
  Object.keys(state.tiles).forEach((tileKey) => {
    const [row, col] = tileKey.split(':').map(Number);
    const sea = getPromenadeSeaSides(row, col, isWater)[0];
    if (!sea || isPromenadeNearBridge(row, col)) return;
    const set = (row + col) % 2 === 0 ? PROMENADE_PROPS.lamp : PROMENADE_PROPS.between;
    set.forEach(([kind, inM, alongM], i) => props.push({ id: `${tileKey}#${kind}${i}`, kind, row, col, sea, inM: inM / tileM, alongM: alongM / tileM }));
  });
  return props;
}

// The prop's screen view: facing the sea along the shore - the baked views face the camera's
// lower left (sw) or lower right (se); with the sea up the screen, the one along the same line.
function promenadePropView(prop, rotation = typeof mapRotation === 'number' ? mapRotation : 0) {
  const screen = typeof getTyphoonShelterScreenFacing === 'function' ? getTyphoonShelterScreenFacing(prop.sea, rotation) : 'sw';
  return screen === 'se' || screen === 'nw' ? 'se' : 'sw';
}

function positionPromenadeProp(scene, sprite) {
  const prop = sprite.promenadeProp;
  const textureKey = typeof streetFurnitureTextureKey === 'function' ? streetFurnitureTextureKey(prop.kind, promenadePropView(prop)) : null;
  if (!textureKey || typeof applyStreetFurnitureSpriteTexture !== 'function'
    || !applyStreetFurnitureSpriteTexture(scene, sprite, prop.kind, textureKey)) return false;
  const [sr, sc] = PROMENADE_STEP[prop.sea];
  const [ar, ac] = sr === 0 ? [1, 0] : [0, 1];   // along the shore
  const point = { row: prop.row + sr * prop.inM + ar * prop.alongM, col: prop.col + sc * prop.inM + ac * prop.alongM };
  const geo = getTileFaceGeometry(prop.row, prop.col, scene.offsetX, scene.offsetY);
  const centre = isoToScreen(prop.col, prop.row);
  const shifted = isoToScreen(point.col, point.row);
  sprite.setPosition(geo.center.x + (shifted.x - centre.x), geo.center.y + (shifted.y - centre.y));
  sprite.setDepth(getWorldDepth('object', shifted.y + TILE_HEIGHT));
  return true;
}

function syncPromenadeProps(scene) {
  const store = scene.promenadePropSprites || (scene.promenadePropSprites = new Map());
  const wanted = new Map(layPromenadeProps().map((p) => [p.id, p]));
  store.forEach((sprite, id) => {
    const want = wanted.get(id);
    if (want && want.sea === sprite.promenadeProp.sea) return;
    sprite.destroy();
    store.delete(id);
  });
  wanted.forEach((prop, id) => {
    if (store.has(id)) return;
    const textureKey = typeof streetFurnitureTextureKey === 'function' ? streetFurnitureTextureKey(prop.kind, promenadePropView(prop)) : null;
    if (!textureKey || !scene.textures.exists(textureKey)) return;
    const sprite = scene.add.image(0, 0, textureKey);
    sprite.setVisible(false); // until the viewport culling shows it (small props: zoomed in)
    if (scene.worldMask) sprite.setMask(scene.worldMask);
    sprite.promenadeProp = prop;
    sprite.mapRow = prop.row;
    sprite.mapCol = prop.col;
    if (!positionPromenadeProp(scene, sprite)) { sprite.destroy(); return; }
    store.set(id, sprite);
  });
  scene.terrainViewportCacheKey = null; // let the next culling pass show the new ones
}

// After a map turn: every prop to its new view and place.
function refreshPromenadeProps(scene) {
  scene?.promenadePropSprites?.forEach((sprite) => positionPromenadeProp(scene, sprite));
}

// After a tile is built, taken up or its pier changed: the sprites, the ground under them (the
// shelters' quay terrain - hard standing, the water beside it walled, no sandy bank), the parks'
// coverage.
function onPromenadeChanged(scene = typeof activeScene !== 'undefined' ? activeScene : null) {
  if (typeof syncTyphoonShelterQuayTerrain === 'function') syncTyphoonShelterQuayTerrain(scene);
  schedulePromenadeSync(scene);
  if (typeof markServiceCoverageDirty === 'function') markServiceCoverageDirty();
  if (typeof updateHUD === 'function') updateHUD();
}

// A road, a building, the sea or a bridge put on a promenade tile since: that tile goes. Checked a
// couple of times a second (main.js), cheaply.
function prunePromenade(scene) {
  const state = getPromenadeState();
  const gone = Object.keys(state.tiles).filter((k) => {
    const [r, c] = k.split(':').map(Number);
    if (!isInsideMap(r, c) || mapData[r][c] === WATER || mapData[r][c] === ROAD) return true;
    const id = getTileId(r, c);
    return !!(buildingData?.[id] || scene?.buildingSprites?.has(id) || (typeof isBridgeTile === 'function' && isBridgeTile(r, c)));
  });
  if (!gone.length) return false;
  gone.forEach((k) => delete state.tiles[k]);
  onPromenadeChanged(scene);
  return true;
}

function updatePromenade(scene, time) {
  if (!scene || time < (scene.promenadeNextCheckAt || 0)) return;
  scene.promenadeNextCheckAt = time + 500;
  if (getPromenadeTileKeys().length) prunePromenade(scene);
}

// The parks' coverage (sim-infrastructure.js): each tile as a small park.
function getPromenadeServiceTiles() {
  return getPromenadeTileKeys();
}

function getPromenadeMonthlyUpkeep() {
  return getPromenadeTileKeys().length * PROMENADE.upkeep;
}

function getPromenadeAttractiveness() {
  return Math.min(PROMENADE.attractivenessCap, getPromenadeTileKeys().length * PROMENADE.attractivenessPerTile);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PROMENADE,
    normalizePromenadeState,
    whyNotPromenadeAt,
    getPromenadePiers,
  };
}
