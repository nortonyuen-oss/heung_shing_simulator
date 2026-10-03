// 避風塘 objects on the map: boats, piers, breakwater pieces drawn as sprites on their footprint.
//
// This is the placement layer the shelter phases build on (Phase 0: 佔地、方向、地表). An object is
// { objectId, row, col, facing } - the footprint's top-left tile and a logical facing (n/e/s/w).
// Its texture is chosen per map rotation (typhoon-shelter-assets.js pickTyphoonShelterTexture),
// fitted to the footprint diamond by the texture's ground corners, and depth-sorted like a
// building. Textures load on demand: the 177 sea textures are not part of the startup preload.
//
// Placement data (ground corners and facings per texture, footprint sizes per object) comes from
// data/typhoon-shelter-placement.json, calibrated with the 避風塘素材校準 tool.

const TYPHOON_SHELTER_PLACEMENT_URL = 'data/typhoon-shelter-placement.json';
// How far a shore-aligned object (a pier on the water's edge) reaches over the shoreline, in metres:
// the water tiles along a coast draw part of the shore in their own art, so a pier merely touching
// its tile's edge still looks adrift.
const TYPHOON_SHELTER_SHORE_OVERLAP_M = 8;
const TYPHOON_SHELTER_LOGICAL_STEP = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });
const TYPHOON_SHELTER_LOGICAL_BACK = Object.freeze({ n: 's', s: 'n', e: 'w', w: 'e' });
const TYPHOON_SHELTER_TEXTURE_PREFIX = 'typhoonShelter:';

let typhoonShelterPlacement = { parts: {}, objects: {} };
let typhoonShelterPlacementLoad = null;
let typhoonShelterObjectSeq = 0;

function loadTyphoonShelterPlacement(force = false) {
  if (typhoonShelterPlacementLoad && !force) return typhoonShelterPlacementLoad;
  typhoonShelterPlacementLoad = (async () => {
    try {
      const res = await fetch(`${TYPHOON_SHELTER_PLACEMENT_URL}?v=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) setTyphoonShelterPlacement(await res.json());
    } catch (error) {
      console.warn('[typhoon shelter] placement data unavailable', error?.message);
    }
    return typhoonShelterPlacement;
  })();
  return typhoonShelterPlacementLoad;
}

function setTyphoonShelterPlacement(data) {
  typhoonShelterPlacement = {
    parts: { ...(data?.parts || {}) },
    objects: { ...(data?.objects || {}) },
  };
}

function getTyphoonShelterPlacement() { return typhoonShelterPlacement; }

// Per part: its calibrated facing, or 'off' for art switched off in calibration (part.disabled -
// drawn at the wrong proportions, say), which the game then never uses.
function getTyphoonShelterFacingOverrides() {
  return Object.fromEntries(Object.entries(typhoonShelterPlacement.parts)
    .filter(([, p]) => p?.facing || p?.disabled).map(([id, p]) => [id, p.disabled ? 'off' : p.facing]));
}

function getTyphoonShelterTextureKey(texturePath) {
  return `${TYPHOON_SHELTER_TEXTURE_PREFIX}${texturePath.split('/').pop().replace(/\.png$/, '')}`;
}

// Loads the textures not yet in the scene; resolves when all are available (or failed).
function loadTyphoonShelterTextures(scene, texturePaths) {
  const missing = [...new Set(texturePaths)].filter((p) => !scene.textures.exists(getTyphoonShelterTextureKey(p)));
  if (!missing.length) return Promise.resolve(true);
  return new Promise((resolve) => {
    const start = () => {
      missing.forEach((p) => {
        const url = typeof resolveModelAssetPath === 'function' ? resolveModelAssetPath(p) : p;
        scene.load.image(getTyphoonShelterTextureKey(p), url);
      });
      scene.load.once('complete', () => resolve(missing.every((p) => scene.textures.exists(getTyphoonShelterTextureKey(p)))));
      scene.load.start();
    };
    if (scene.load.isLoading()) scene.load.once('complete', start); else start();
  });
}

// Every texture an object could need across the four rotations.
function getTyphoonShelterObjectTexturePaths(objectId) {
  return getTyphoonShelterObjectTextures(objectId, getTyphoonShelterFacingOverrides()).map((t) => t.texture);
}

function getTyphoonShelterObjectSize(objectId) {
  return getTyphoonShelterRealSize(objectId, typhoonShelterPlacement.objects[objectId]);
}

// The object's real extent in metres, from its first texture's source art: { alongM, acrossM,
// heightM } along and across its facing. null until that texture has ground corners.
function getTyphoonShelterObjectMetres(objectId) {
  const def = TYPHOON_SHELTER_OBJECTS_BY_ID[objectId];
  const ids = Object.keys(def.parts);
  const partId = ids.find((id) => !typhoonShelterPlacement.parts[id]?.disabled) || ids[0];
  const part = typhoonShelterPlacement.parts[partId];
  const art = part?.ground && measureTyphoonShelterArt(part.ground, getTyphoonShelterObjectSize(objectId), part.top);
  if (!art) return null;
  const facing = part.facing || def.parts[partId] || 'se';
  const onSe = facing === 'se' || facing === 'nw';
  return { alongM: onSe ? art.seM : art.swM, acrossM: onSe ? art.swM : art.seM, heightM: art.heightM };
}

// The footprint covers the tiles the object really occupies; the table's depth x width is only
// the fallback before placement data loads.
function getTyphoonShelterObjectFootprint(objectId, facing) {
  const metres = getTyphoonShelterObjectMetres(objectId);
  return getTyphoonShelterFootprint(objectId, facing, metres
    ? getTyphoonShelterTilesForMetres(metres.alongM, metres.acrossM) : null);
}

function getTyphoonShelterFootprintTiles(row, col, cols, rows) {
  const tiles = [];
  for (let r = row; r < row + rows; r++) for (let c = col; c < col + cols; c++) tiles.push([r, c]);
  return tiles;
}

// The footprint's left, front (lowest) and right corners on screen, and its back corner - world
// coordinates without the scene offset. A tile's diamond sits TILE_IMAGE_HEIGHT above its
// isoToScreen point (the tile image's bottom), its lowest corner BUILDING_SURFACE_Y_OFFSET above.
function getTyphoonShelterFootprintDiamond(row, col, cols, rows) {
  const halfW = TILE_WIDTH / 2;
  const halfH = TILE_HEIGHT / 2;
  let left = null; let front = null; let right = null; let back = null;
  [[row, col], [row, col + cols - 1], [row + rows - 1, col], [row + rows - 1, col + cols - 1]].forEach(([r, c]) => {
    const p = isoToScreen(c, r);
    const cy = p.y - BUILDING_SURFACE_Y_OFFSET - halfH;
    const verts = [[p.x - halfW, cy], [p.x, cy + halfH], [p.x + halfW, cy], [p.x, cy - halfH]];
    verts.forEach((v) => {
      if (!left || v[0] < left[0]) left = v;
      if (!right || v[0] > right[0]) right = v;
      if (!front || v[1] > front[1]) front = v;
      if (!back || v[1] < back[1]) back = v;
    });
  });
  return { left, front, right, back };
}

const TYPHOON_SHELTER_STEP = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });
const TYPHOON_SHELTER_OPPOSITE = Object.freeze({ n: 's', s: 'n', e: 'w', w: 'e' });

// Solid land a jetty can start from. A BEACH tile is drawn mostly as shallow water with the
// shoreline across it, so a jetty ending at a beach tile stands visibly off the shore.
function isTyphoonShelterLandTile(row, col) {
  if (!isInsideMap(row, col)) return false;
  const t = mapData[row][col];
  return t !== WATER && t !== BEACH;
}

/**
 * Can `objectId` stand at (row, col) facing `facing`? { ok, reasons: [] } - reasons in 繁中 for
 * the tool's footprint overlay. `ignoreId` skips one placed object (the one being moved).
 */
function checkTyphoonShelterPlacement(scene, objectId, row, col, facing, ignoreId = null) {
  const def = TYPHOON_SHELTER_OBJECTS_BY_ID[objectId];
  const fp = getTyphoonShelterObjectFootprint(objectId, facing);
  const tiles = getTyphoonShelterFootprintTiles(row, col, fp.cols, fp.rows);
  const reasons = [];
  if (tiles.some(([r, c]) => !isInsideMap(r, c))) return { ok: false, reasons: ['超出地圖'] };
  const water = (r, c) => mapData[r][c] === WATER && !(typeof isBridgeTile === 'function' && isBridgeTile(r, c));
  if (def.surface === 'water') {
    if (!tiles.every(([r, c]) => water(r, c))) reasons.push('佔地唔全係水面');
  }
  if (def.surface === 'shore') {
    // over water, crossing the beach strip if there is one, out from solid land
    if (!tiles.every(([r, c]) => water(r, c) || mapData[r][c] === BEACH)) reasons.push('佔地唔係水面或沙灘');
    if (!tiles.some(([r, c]) => water(r, c))) reasons.push('冇伸出水面');
    // land must touch the footprint's back end (the side opposite its facing)
    const [dr, dc] = TYPHOON_SHELTER_STEP[TYPHOON_SHELTER_OPPOSITE[facing]];
    const backEdge = tiles.filter(([r, c]) => !tiles.some(([r2, c2]) => r2 === r + dr && c2 === c + dc));
    if (!backEdge.some(([r, c]) => isTyphoonShelterLandTile(r + dr, c + dc))) reasons.push('後端冇接岸');
  }
  if (def.surface === 'land') {
    if (!tiles.every(([r, c]) => mapData[r][c] !== WATER && mapData[r][c] !== ROAD)) reasons.push('佔地唔全係陸地');
  }
  if (tiles.some(([r, c]) => buildingData?.[getTileId(r, c)])) reasons.push('壓住建築');
  const taken = new Set();
  scene?.typhoonShelterObjects?.forEach((rec) => {
    if (rec.id === ignoreId) return;
    rec.tiles.forEach(([r, c]) => taken.add(`${r}:${c}`));
  });
  if (tiles.some(([r, c]) => taken.has(`${r}:${c}`))) reasons.push('同其他避風塘設施重疊');
  return { ok: reasons.length === 0, reasons };
}

// Ground corners of a texture in its loaded pixels (the staged release copy is resized, trimmed
// and padded, so source pixels are mapped through the manifest).
function getTyphoonShelterTextureGround(choice, texture) {
  const part = typhoonShelterPlacement.parts[choice.partId];
  if (!part?.ground) return null;
  const logical = choice.texture;
  const entry = typeof modelAssetManifest !== 'undefined'
    ? modelAssetManifest.entries?.[normalizeModelLogicalPath(logical)] : null;
  const mapping = typeof getModelTexturePixelMapping === 'function'
    ? getModelTexturePixelMapping(logical, texture)
    : { staged: false, resize: 1, offsetX: 0, offsetY: 0 };
  const sourceWidth = mapping.staged ? Number(entry?.sourceWidth) : Number(texture.width);
  const ground = choice.mirrored ? mirrorTyphoonShelterGroundCorners(part.ground, sourceWidth) : part.ground;
  const map = ([x, y]) => [x * mapping.resize + mapping.offsetX, y * mapping.resize + mapping.offsetY];
  return {
    left: map(ground.left),
    front: map(ground.front),
    right: map(ground.right),
    top: Number.isFinite(part.top) ? part.top * mapping.resize + mapping.offsetY : undefined,
  };
}

// A part with an art warp (calibration, see normalizeTyphoonShelterWarp) is drawn from a canvas
// texture `<key>~w`, the day art redrawn through the warp; it is redrawn in place when the warp
// changes. Returns the key to draw `choice` with (the plain one when there is no warp).
function resolveTyphoonShelterTextureKey(scene, choice) {
  const key = getTyphoonShelterTextureKey(choice.texture);
  const partWarp = typhoonShelterPlacement.parts[choice.partId]?.warp;
  if (!scene.textures.exists(key) || isTyphoonShelterWarpIdentity(partWarp)) return key;
  const src = scene.textures.get(key).getSourceImage();
  const ground = getTyphoonShelterTextureGround(choice, src);
  if (!ground) return key;
  const warp = choice.mirrored ? mirrorTyphoonShelterWarp(partWarp) : normalizeTyphoonShelterWarp(partWarp);
  const front = ground.front;
  const stamp = `${warp.k}|${warp.s}|${warp.h}|${front.join(',')}`;
  const wkey = `${key}~w`;
  let tex = scene.textures.exists(wkey) ? scene.textures.get(wkey) : null;
  if (tex?.typhoonShelterWarp?.stamp === stamp) return wkey;
  const box = getTyphoonShelterWarpCanvas(src.width, src.height, front, warp);
  if (!tex) tex = scene.textures.createCanvas(wkey, box.width, box.height);
  else tex.setSize(box.width, box.height);
  const ctx = tex.getContext();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);
  ctx.setTransform(...getTyphoonShelterWarpTransform(front, warp, box));
  ctx.drawImage(src, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  tex.refresh();
  tex.typhoonShelterWarp = {
    stamp, warp, front, dx: box.dx, dy: box.dy, baseWidth: src.width, baseHeight: src.height,
    version: (tex.typhoonShelterWarp?.version || 0) + 1,
  };
  return wkey;
}

// The ground corners (and top) of `choice` in the pixels of the texture `key` it is drawn with.
function getTyphoonShelterSpriteGround(scene, choice, key) {
  const tex = scene.textures.get(key);
  const info = tex?.typhoonShelterWarp;
  if (!info || !key.endsWith('~w')) return getTyphoonShelterTextureGround(choice, tex.getSourceImage());
  const ground = getTyphoonShelterTextureGround(choice, { width: info.baseWidth, height: info.baseHeight });
  if (!ground) return null;
  const P = (pt) => { const [x, y] = warpTyphoonShelterPoint(pt, info.front, info.warp); return [x + info.dx, y + info.dy]; };
  return {
    left: P(ground.left),
    front: P(ground.front),
    right: P(ground.right),
    // the top's x is not recorded: taken above the front corner
    top: Number.isFinite(ground.top) ? P([info.front[0], ground.top])[1] : undefined,
  };
}

function positionTyphoonShelterObject(scene, record) {
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  const screenFacing = getTyphoonShelterScreenFacing(record.facing, rotation);
  const choice = pickTyphoonShelterTexture(record.objectId, screenFacing, {
    facings: getTyphoonShelterFacingOverrides(), variant: record.variant,
  });
  record.screenFacing = screenFacing;
  record.choice = choice;
  // A breakwater section is drawn per tile of the line (footprintOverride 1x1), overlapping its
  // neighbours into one wall; other objects cover the tiles their real size needs.
  const fp = record.footprintOverride
    ? { cols: record.footprintOverride.cols, rows: record.footprintOverride.rows }
    : getTyphoonShelterObjectFootprint(record.objectId, record.facing);
  record.footprint = fp;
  record.tiles = getTyphoonShelterFootprintTiles(record.row, record.col, fp.cols, fp.rows);
  const diamond = getTyphoonShelterFootprintDiamond(record.row, record.col, fp.cols, fp.rows);
  record.diamond = diamond;
  const key = choice && resolveTyphoonShelterTextureKey(scene, choice);
  if (!choice || !scene.textures.exists(key)) {
    record.sprite?.setVisible(false);
    return false;
  }
  const warpVersion = scene.textures.get(key).typhoonShelterWarp?.version || 0;
  if (!record.sprite) {
    record.sprite = scene.add.image(0, 0, key);
    record.sprite.typhoonShelterId = record.id;
  } else if (record.sprite.texture.key !== key || record.warpVersion !== warpVersion) {
    record.sprite.setTexture(key); // again after a redraw, for the canvas's new size
  }
  record.warpVersion = warpVersion;
  const texture = scene.textures.get(key).getSourceImage();
  const ground = getTyphoonShelterSpriteGround(scene, choice, key);
  // drawn at its real size, centred on the footprint
  const art = ground && measureTyphoonShelterArt(ground, getTyphoonShelterObjectSize(record.objectId), ground.top);
  const fit = ground && fitTyphoonShelterGround(ground, diamond, art?.scale);
  record.metres = art;
  const sprite = record.sprite;
  if (fit) {
    sprite.setOrigin(fit.originX / texture.width, fit.originY / texture.height);
    sprite.setScale(fit.scale);
  } else {
    sprite.setOrigin(0.5, 1);
    sprite.setScale((diamond.right[0] - diamond.left[0]) / texture.width);
  }
  const at = fit ? [fit.x, fit.y] : [...diamond.front];
  // A shore-aligned object is pushed back toward the land until it reaches over the shoreline.
  if (record.shoreAlign && art) {
    const along = choice.facing === 'se' || choice.facing === 'nw' ? art.seM : art.swM;
    const shiftM = Math.max(0, (TYPHOON_SHELTER_TILE_M - along) / 2) + TYPHOON_SHELTER_SHORE_OVERLAP_M;
    const [dr, dc] = TYPHOON_SHELTER_LOGICAL_STEP[record.shoreDir || TYPHOON_SHELTER_LOGICAL_BACK[record.facing]];
    const a = isoToScreen(record.col, record.row);
    const b = isoToScreen(record.col + dc, record.row + dr);
    const k = shiftM / TYPHOON_SHELTER_TILE_M;
    at[0] += (b.x - a.x) * k;
    at[1] += (b.y - a.y) * k;
  }
  // alongM: slide along the facing (several short sections making up one tile of walkway or
  // breakwater); for those sections the slide counts in the depth too, so the one nearer the
  // viewer is drawn over
  let slideY = 0;
  if (record.alongM) {
    const [dr, dc] = TYPHOON_SHELTER_LOGICAL_STEP[record.facing];
    const a = isoToScreen(record.col, record.row);
    const b = isoToScreen(record.col + dc, record.row + dr);
    const k = record.alongM / TYPHOON_SHELTER_TILE_M;
    at[0] += (b.x - a.x) * k;
    at[1] += (b.y - a.y) * k;
    if (record.sectioned) slideY = (b.y - a.y) * k;
  }
  (record.offsets || []).forEach(([dir, m]) => {
    const [dr, dc] = TYPHOON_SHELTER_LOGICAL_STEP[dir] || [0, 0];
    const a = isoToScreen(record.col, record.row);
    const b = isoToScreen(record.col + dc, record.row + dr);
    at[0] += ((b.x - a.x) * m) / TYPHOON_SHELTER_TILE_M;
    at[1] += ((b.y - a.y) * m) / TYPHOON_SHELTER_TILE_M;
  });
  sprite.setPosition(at[0] + scene.offsetX, at[1] + scene.offsetY);
  const anchor = getBuildingAnchor(record.row, record.col, fp.cols, fp.rows);
  // depthBias lifts one object over another on the same tile (a landing stage over its walkway)
  sprite.setDepth(getBuildingSortDepth(anchor.y + slideY, fp.cols, fp.rows, 0) + (record.depthBias || 0));
  sprite.setAlpha(Number.isFinite(record.alpha) ? record.alpha : 1);
  if (record.tint) sprite.setTint(record.tint); else sprite.clearTint();
  sprite.setVisible(true);
  record.fit = fit;
  return true;
}

/**
 * Put an object on the map. Resolves to its record once its textures are loaded.
 * @param {{ objectId: string, row: number, col: number, facing: 'n'|'e'|'s'|'w', variant?: number, id?: string }} spec
 */
async function addTyphoonShelterObject(scene, spec) {
  if (!TYPHOON_SHELTER_OBJECTS_BY_ID[spec.objectId]) throw new Error(`unknown object ${spec.objectId}`);
  await loadTyphoonShelterPlacement();
  if (!scene.typhoonShelterObjects) scene.typhoonShelterObjects = new Map();
  typhoonShelterObjectSeq += 1;
  const record = {
    id: spec.id || `ts${typhoonShelterObjectSeq}`,
    objectId: spec.objectId,
    row: spec.row,
    col: spec.col,
    facing: spec.facing || 'e',
    variant: spec.variant ?? 0,
    tag: spec.tag || null,
    footprintOverride: spec.footprintOverride || null,
    shoreAlign: !!spec.shoreAlign,
    shoreDir: spec.shoreDir || null,
    depthBias: spec.depthBias || 0,
    alongM: spec.alongM || 0,
    // one of several sections along a tile: sorted by where it slid to
    sectioned: !!spec.sectioned,
    // [[logical direction, metres], ...]: moved off the tile's centre (a quay to its water edge)
    offsets: Array.isArray(spec.offsets) ? spec.offsets : null,
    alpha: spec.alpha,
    tint: spec.tint || null,
    sprite: null,
    tiles: [],
  };
  scene.typhoonShelterObjects.set(record.id, record);
  positionTyphoonShelterObject(scene, record); // reserves its tiles before the textures arrive
  await loadTyphoonShelterTextures(scene, getTyphoonShelterObjectTexturePaths(record.objectId));
  if (scene.typhoonShelterObjects.get(record.id) === record) positionTyphoonShelterObject(scene, record);
  return record;
}

function removeTyphoonShelterObject(scene, id) {
  const record = scene?.typhoonShelterObjects?.get(id);
  if (!record) return false;
  record.sprite?.destroy();
  scene.typhoonShelterObjects.delete(id);
  return true;
}

// All objects, or only those with `tag` (the calibrator's samples, the shelter works).
function clearTyphoonShelterObjects(scene, tag = undefined) {
  [...(scene?.typhoonShelterObjects?.values() || [])]
    .filter((rec) => tag === undefined || rec.tag === tag)
    .forEach((rec) => removeTyphoonShelterObject(scene, rec.id));
}

// Map rotation, window resize and placement-data edits all come through here.
let typhoonShelterPlacementRevision = 0; // bumped on every refresh: moving boats re-read their fit

function refreshAllTyphoonShelterSprites(scene) {
  typhoonShelterPlacementRevision += 1;
  scene?.typhoonShelterObjects?.forEach((record) => positionTyphoonShelterObject(scene, record));
}

function getTyphoonShelterPlacementRevision() { return typhoonShelterPlacementRevision; }

const typhoonShelterSpritesApi = {
  loadTyphoonShelterPlacement,
  setTyphoonShelterPlacement,
  getTyphoonShelterPlacement,
  getTyphoonShelterTextureKey,
  loadTyphoonShelterTextures,
  getTyphoonShelterObjectFootprint,
  getTyphoonShelterObjectSize,
  getTyphoonShelterObjectMetres,
  getTyphoonShelterFootprintDiamond,
  checkTyphoonShelterPlacement,
  addTyphoonShelterObject,
  removeTyphoonShelterObject,
  clearTyphoonShelterObjects,
  positionTyphoonShelterObject,
  refreshAllTyphoonShelterSprites,
  getTyphoonShelterPlacementRevision,
  resolveTyphoonShelterTextureKey,
  getTyphoonShelterSpriteGround,
};

if (typeof module !== 'undefined' && module.exports) module.exports = typhoonShelterSpritesApi;
if (typeof globalThis !== 'undefined') Object.assign(globalThis, typhoonShelterSpritesApi);
