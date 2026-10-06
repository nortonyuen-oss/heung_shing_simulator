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
// written by scripts/bake-typhoon-shelter-textures.js: each texture's night (漁火) frames, if any
const TYPHOON_SHELTER_TEXTURES_URL = 'data/typhoon-shelter-textures.json';
let typhoonShelterNightArt = new Map();   // day texture path -> [lit, litb] paths
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
      const tex = await fetch(`${TYPHOON_SHELTER_TEXTURES_URL}?v=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
      if (tex?.ok) setTyphoonShelterNightArt(await tex.json());
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

function setTyphoonShelterNightArt(meta) {
  typhoonShelterNightArt = new Map(Object.values(meta?.textures || {})
    .filter((t) => typeof t?.file === 'string' && Array.isArray(t.night) && t.night.length)
    .map((t) => [t.file, t.night.slice(0, 2)]));
}

// 漁火: a sea asset's night frame (0 or 1, the two twinkle frames) for its day texture, or null.
function getTyphoonShelterNightTexture(choice, frame) {
  const night = choice && typhoonShelterNightArt.get(choice.texture);
  return night ? night[frame % night.length] : null;
}

// Whether the sea lights are on: with the street lamps (street-lamps.js), and the lights toggle.
function isTyphoonShelterSeaLit(scene) {
  return typeof streetLampsShouldBeLit === 'function' && streetLampsShouldBeLit(scene);
}

// The night frame a choice is drawn with right now, loaded if need be: the choice itself by day, or
// until its night art has loaded. `seed` staggers the twinkle from one boat to the next.
const typhoonShelterNightRequested = new Set();
function getTyphoonShelterLitChoice(scene, choice, seed = 0) {
  if (!scene.typhoonShelterSeaLit) return choice;
  const frame = Math.floor(((scene.time?.now || 0) + seed * 1000) / 650) % 2;
  const path = getTyphoonShelterNightTexture(choice, frame);
  if (!path) return choice;
  if (!scene.textures.exists(getTyphoonShelterTextureKey(path))) {
    const both = typhoonShelterNightArt.get(choice.texture) || [];
    if (!typhoonShelterNightRequested.has(choice.texture)) {
      typhoonShelterNightRequested.add(choice.texture);
      loadTyphoonShelterTextures(scene, both);
    }
    return choice;
  }
  return { ...choice, texture: path, night: true };
}

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

// The texture's size as drawn (its base frame).
function getTyphoonShelterTextureSize(scene, key) {
  const frame = scene.textures.get(key)?.get?.();
  return frame ? { width: frame.width, height: frame.height } : { width: 0, height: 0 };
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
// A source-PNG pixel -> the loaded texture's pixel: the staged (release) copy is trimmed and
// resized (model-assets.js); mirrored art is the source flipped across its width.
function getTyphoonShelterTexturePointMap(choice, texture) {
  const logical = choice.texture;
  const entry = typeof modelAssetManifest !== 'undefined'
    ? modelAssetManifest.entries?.[normalizeModelLogicalPath(logical)] : null;
  const mapping = typeof getModelTexturePixelMapping === 'function'
    ? getModelTexturePixelMapping(logical, texture)
    : { staged: false, resize: 1, offsetX: 0, offsetY: 0 };
  const sourceWidth = mapping.staged ? Number(entry?.sourceWidth) : Number(texture.width);
  return { sourceWidth, map: ([x, y]) => [x * mapping.resize + mapping.offsetX, y * mapping.resize + mapping.offsetY] };
}

// Where a point of the (unmirrored) source art is on a sprite's texture, through the staged copy's
// trim and the calibrator's warp, as getTyphoonShelterSpriteGround places the ground.
function getTyphoonShelterSpriteTexturePoint(scene, choice, key, [x, y]) {
  const info = scene.textures.get(key)?.typhoonShelterWarp;
  const warped = !!info && key.endsWith('~w');
  const texture = warped ? { width: info.baseWidth, height: info.baseHeight } : getTyphoonShelterTextureSize(scene, key);
  const { sourceWidth, map } = getTyphoonShelterTexturePointMap(choice, texture);
  const p = map([choice.mirrored ? sourceWidth - x : x, y]);
  if (!warped) return p;
  const [wx, wy] = warpTyphoonShelterPoint(p, info.front, info.warp);
  return [wx + info.dx, wy + info.dy];
}

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
  const baseFrame = scene.textures.get(key).get();
  const src = { width: baseFrame.width, height: baseFrame.height };
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
  ctx.drawImage(baseFrame.source.image, baseFrame.cutX, baseFrame.cutY, baseFrame.cutWidth, baseFrame.cutHeight,
    0, 0, baseFrame.cutWidth, baseFrame.cutHeight);
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
  if (!info || !key.endsWith('~w')) return getTyphoonShelterTextureGround(choice, getTyphoonShelterTextureSize(scene, key));
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

// The world mask the terrain, the props and the ships are drawn under. Phaser flushes its sprite
// batch whenever the mask changes from one object to the next, and nearly everything round a
// shelter (water, shore, roads, lamps) carries this mask: an unmasked shelter sprite between them
// costs three draw calls (end the mask, draw, start it again) - a shelter on screen took a frame
// from 42 batches to 156 and an Intel Mac from 55 fps to 25. Under the same mask it batches in.
function maskTyphoonShelterSprite(scene, sprite) {
  if (scene?.worldMask && sprite && typeof sprite.setMask === 'function') sprite.setMask(scene.worldMask);
}

// Whether a sprite's anchor lies in the camera view padded as the viewport culling pads it (so a
// sprite placed or moved between culling passes agrees with the next pass).
function isTyphoonShelterSpriteInView(scene, sprite) {
  const camera = scene?.cameras?.main;
  if (!camera?.worldView || typeof getPaddedWorldViewportBounds !== 'function') return true;
  // the building sprites' padding in updateTerrainViewportCulling
  const padX = TILE_WIDTH * 6;
  const padY = TILE_IMAGE_HEIGHT * 6 + MAX_TERRAIN_HEIGHT * HEIGHT_STEP_PIXELS + TILE_HEIGHT * 4;
  const b = getPaddedWorldViewportBounds(camera, padX, padY);
  return sprite.x >= b.minX && sprite.x <= b.maxX && sprite.y >= b.minY && sprite.y <= b.maxY;
}

function positionTyphoonShelterObject(scene, record) {
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  const screenFacing = getTyphoonShelterScreenFacing(record.facing, rotation);
  const choice = pickTyphoonShelterTexture(record.objectId, screenFacing, {
    facings: getTyphoonShelterFacingOverrides(), variant: record.variant,
  });
  record.screenFacing = screenFacing;
  record.choice = choice;
  // a buoy's 漁火 frame (updateTyphoonShelterBobbing keeps it twinkling)
  const drawn = record.nightFrame != null && isTyphoonShelterFloater(record.objectId)
    ? getTyphoonShelterLitChoice(scene, choice, record.bobSeed || 0) : choice;
  // A breakwater section is drawn per tile of the line (footprintOverride 1x1), overlapping its
  // neighbours into one wall; other objects cover the tiles their real size needs.
  const fp = record.footprintOverride
    ? { cols: record.footprintOverride.cols, rows: record.footprintOverride.rows }
    : getTyphoonShelterObjectFootprint(record.objectId, record.facing);
  record.footprint = fp;
  record.tiles = getTyphoonShelterFootprintTiles(record.row, record.col, fp.cols, fp.rows);
  const diamond = getTyphoonShelterFootprintDiamond(record.row, record.col, fp.cols, fp.rows);
  record.diamond = diamond;
  const key = drawn && resolveTyphoonShelterTextureKey(scene, drawn);
  if (!drawn || !scene.textures.exists(key)) {
    record.drawable = false;
    record.sprite?.setVisible(false);
    return false;
  }
  record.drawable = true;
  const warpVersion = scene.textures.get(key).typhoonShelterWarp?.version || 0;
  if (!record.sprite) {
    record.sprite = scene.add.image(0, 0, key);
    record.sprite.typhoonShelterId = record.id;
    maskTyphoonShelterSprite(scene, record.sprite);
  } else if (record.sprite.texture.key !== key || record.warpVersion !== warpVersion) {
    record.sprite.setTexture(key); // again after a redraw, for the canvas's new size
  }
  record.warpVersion = warpVersion;
  const texture = getTyphoonShelterTextureSize(scene, key);
  const ground = getTyphoonShelterSpriteGround(scene, drawn, key);
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
    const overlapM = Number.isFinite(record.shoreOverlapM) ? record.shoreOverlapM : TYPHOON_SHELTER_SHORE_OVERLAP_M;
    const shiftM = Math.max(0, (TYPHOON_SHELTER_TILE_M - along) / 2) + overlapM;
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
    if (record.sectioned) slideY += ((b.y - a.y) * m) / TYPHOON_SHELTER_TILE_M;
  });
  sprite.setPosition(at[0] + scene.offsetX, at[1] + scene.offsetY);
  // a buoy rides the swell from here (updateTyphoonShelterBobbing)
  record.baseX = sprite.x;
  record.baseY = sprite.y;
  if (isTyphoonShelterFloater(record.objectId) && !record.tint) {
    if (!scene.typhoonShelterFloaters) scene.typhoonShelterFloaters = new Set();
    scene.typhoonShelterFloaters.add(record);
  }
  const anchor = getBuildingAnchor(record.row, record.col, fp.cols, fp.rows);
  // depthBias lifts one object over another on the same tile (a landing stage over its walkway)
  let depth = getBuildingSortDepth(anchor.y + slideY, fp.cols, fp.rows, 0) + (record.depthBias || 0);
  if (record.aboveFootprint) {
    const f = record.aboveFootprint;
    const under = getBuildingSortDepth(getBuildingAnchor(f.row, f.col, f.cols, f.rows).y, f.cols, f.rows, 0);
    depth = Math.max(depth, under + 0.05 + slideY * 1e-4);
  }
  sprite.setDepth(depth);
  sprite.setAlpha(Number.isFinite(record.alpha) ? record.alpha : 1);
  // a preview carries its own tint; the built works darken after dark like the other unlit props
  if (record.tint) sprite.setTint(record.tint);
  else if (drawn.night) sprite.clearTint();  // the 漁火 art carries its own night
  else if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
  else sprite.clearTint();
  // shown only inside the camera's (padded) view, as viewport-culling.js keeps it
  sprite.setVisible(!record.hidden && isTyphoonShelterSpriteInView(scene, sprite));
  record.fit = fit;
  placeTyphoonShelterLight(scene, record);
  return true;
}

// ---------------------------------------------------------------------------
// 浮沉: the boats and buoys ride the swell of the sea flow animation (weather-effects.js), whose
// 8-frame shimmer runs along the diagonals (each tile's phase is frame + row + col) and quickens and
// grows with the sea state. They heave a pixel or two and roll a little, half as fast as the
// shimmer (a hull answers the swell, not every ripple), a small sampan or buoy more than a big boat.
// ---------------------------------------------------------------------------

const TYPHOON_SHELTER_BOB = Object.freeze({
  heavePx: 1.3,        // at zoom 1, for a ~8 m hull on a light sea
  rollRad: 0.014,      // ~0.8 degree
  periodWaves: 2,      // one heave per this many shimmer cycles
  refLengthM: 8,
});

function isTyphoonShelterFloater(objectId) {
  return typeof objectId === 'string' && objectId.startsWith('bout');
}

// { dy, roll } for something floating at (row, col) - fractional for a moving boat. `seed` (0..1)
// shifts it a little off its neighbours; `lengthM` its size.
function getTyphoonShelterBob(time, row, col, seed = 0, lengthM = TYPHOON_SHELTER_BOB.refLengthM) {
  if (typeof isSeaFlowEnabled === 'function' && !isSeaFlowEnabled()) return { dy: 0, roll: 0 };
  const tier = typeof getSeaStateTier === 'function' ? getSeaStateTier() : 'light';
  const config = (typeof SEA_FLOW_TIER_CONFIG !== 'undefined' && (SEA_FLOW_TIER_CONFIG[tier] || SEA_FLOW_TIER_CONFIG.light))
    || { tickMs: 260, ampScale: 1 };
  const frames = typeof SEA_FLOW_FRAME_COUNT === 'number' ? SEA_FLOW_FRAME_COUNT : 8;
  const periodMs = config.tickMs * frames * TYPHOON_SHELTER_BOB.periodWaves;
  const phase = 2 * Math.PI * (time / periodMs + (row + col) / frames + seed * 0.2);
  const size = Math.max(0.55, Math.min(1.4, Math.sqrt(TYPHOON_SHELTER_BOB.refLengthM / Math.max(1, lengthM))));
  const k = config.ampScale * size;
  // the roll lags the heave by a quarter turn: the hull tips as the crest passes under it
  return { dy: TYPHOON_SHELTER_BOB.heavePx * k * Math.sin(phase), roll: TYPHOON_SHELTER_BOB.rollRad * k * Math.sin(phase - Math.PI / 2) };
}

function getTyphoonShelterRecordSeed(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h & 0xffff) / 0xffff;
}

// Every frame: the buoys in view bob (the boats bob as they are drawn, typhoon-shelter-fleet.js).
function updateTyphoonShelterBobbing(scene, time) {
  const floaters = scene?.typhoonShelterFloaters;
  if (!floaters?.size) return;
  const lit = !!scene.typhoonShelterSeaLit;
  floaters.forEach((record) => {
    const sprite = record.sprite;
    if (!sprite?.active) { floaters.delete(record); return; }
    if (record.bobSeed === undefined) record.bobSeed = getTyphoonShelterRecordSeed(record.id);
    // 漁火: the night frame follows the lights and the twinkle; redrawn when it changes
    const frame = lit && getTyphoonShelterNightTexture(record.choice, 0)
      ? Math.floor(((scene.time?.now || 0) + record.bobSeed * 1000) / 650) % 2 : null;
    if (frame !== (record.nightFrame ?? null) || (frame != null && record.nightKeyMissing)) {
      record.nightFrame = frame;
      positionTyphoonShelterObject(scene, record);
      record.nightKeyMissing = frame != null && !String(sprite.texture?.key || '').includes('__lit');
    }
    if (!sprite.visible || !Number.isFinite(record.baseY)) return;
    if (record.bobLengthM === undefined) record.bobLengthM = record.metres?.seM || 2;
    const bob = getTyphoonShelterBob(time, record.row, record.col, record.bobSeed, record.bobLengthM);
    sprite.setPosition(record.baseX, record.baseY + bob.dy);
    sprite.setRotation(bob.roll);
  });
}

// ---------------------------------------------------------------------------
// Night lights: the promenade lamps' lanterns glow while the street lamps are lit, and the
// entrance heads' lanterns blink as the airport beacons do (building-lighting.js). Each is one
// additive sprite over its object, shown only while the object is drawn.
// ---------------------------------------------------------------------------

// Where each light sits on its source art (Models/typhoonShelter/ts_<part>.png, px; measured on the
// glass). The loaded texture may be the staged copy, trimmed and resized, or a warped one: these
// go through the same mapping as the ground corners (getTyphoonShelterSpriteTexturePoint).
const TYPHOON_SHELTER_LIGHT_ANCHORS = Object.freeze({
  causeway2_a: Object.freeze([255.8, 492.7]),
  causeway2_b: Object.freeze([283.3, 473.1]),
});
// The lamp's glow is drawn on the lamp art's own 128 x 256 grid, widened to 512 x 512 for the pool
// of light round its foot: lantern glass at (64, 82), foot at (64, 214). The lamp is small on
// screen (~25 px tall at zoom 1), so its light reaches well past it, as a street lamp's does: drawn
// at the lamp's own size it was a few pixels and could not be seen (2026-10-04).
const TYPHOON_SHELTER_LAMP_GLOW_KEY = 'fx_ts_lamp_glow';
const TYPHOON_SHELTER_LAMP_ART_WIDTH = 128;
const TYPHOON_SHELTER_LAMP_GLOW_SIZE = 512;
const TYPHOON_SHELTER_LAMP_GLOW_PAD = (TYPHOON_SHELTER_LAMP_GLOW_SIZE - TYPHOON_SHELTER_LAMP_ART_WIDTH) / 2;
const TYPHOON_SHELTER_LAMP_GLASS = Object.freeze({ x: 63.6, y: 81.7, rx: 11, ry: 14 });
const TYPHOON_SHELTER_LAMP_FOOT = Object.freeze({ x: 64, y: 214 });
// A harbour light flashes slower than an airport beacon (a navigation light is "Fl 2s"-ish).
const TYPHOON_SHELTER_BEACON_PERIOD = 2400;

// A record's light: 'lamp', 'beacon:<colour>' or null.
function getTyphoonShelterRecordLight(spec) {
  if (spec.light) return spec.light;
  return spec.objectId === 'promenadeLamp' ? 'lamp' : null;
}

// The vintage lantern lit warm white: the glass itself, a halo round it and a soft pool on the
// paving below - the colours of the street lamps' bake (scripts/bake-street-lamp-textures.js),
// paler, as these are not sodium lamps.
function ensureTyphoonShelterLampGlowTexture(scene) {
  const key = TYPHOON_SHELTER_LAMP_GLOW_KEY;
  if (scene.textures.exists(key)) return key;
  if (typeof scene.textures.addCanvas !== 'function' || typeof document === 'undefined') return null;
  const pad = TYPHOON_SHELTER_LAMP_GLOW_PAD;
  const W = TYPHOON_SHELTER_LAMP_GLOW_SIZE;
  const H = TYPHOON_SHELTER_LAMP_GLOW_SIZE;
  // drawn first and handed to Phaser after: the game mipmaps power-of-two textures (main.js), and a
  // CanvasTexture made empty and refreshed later keeps the empty mipmaps - drawn small, as the lamp
  // is, it showed nothing
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const glass = TYPHOON_SHELTER_LAMP_GLASS;
  const foot = TYPHOON_SHELTER_LAMP_FOOT;
  const blob = (x, y, rx, ry, stops) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    stops.forEach(([at, colour]) => g.addColorStop(at, colour));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  ctx.globalCompositeOperation = 'lighter';
  // the pool on the ground (a 2:1 ellipse in the isometric view), about the lamp's height across
  blob(foot.x + pad, foot.y, 125, 62, [[0, 'rgba(240,170,80,0.6)'], [0.5, 'rgba(236,150,60,0.25)'], [1, 'rgba(236,150,60,0)']]);
  // the light falling from the lantern to it
  const fall = ctx.createLinearGradient(0, glass.y, 0, foot.y);
  fall.addColorStop(0, 'rgba(255,190,100,0.32)');
  fall.addColorStop(1, 'rgba(255,190,100,0.04)');
  ctx.fillStyle = fall;
  ctx.beginPath();
  ctx.moveTo(glass.x + pad - glass.rx * 1.4, glass.y);
  ctx.lineTo(glass.x + pad + glass.rx * 1.4, glass.y);
  ctx.lineTo(foot.x + pad + 75, foot.y);
  ctx.lineTo(foot.x + pad - 75, foot.y);
  ctx.closePath();
  ctx.fill();
  // the halo, then the glass
  blob(glass.x + pad, glass.y, glass.rx * 7, glass.rx * 6.5, [[0, 'rgba(255,200,120,0.8)'], [0.3, 'rgba(255,176,72,0.35)'], [1, 'rgba(255,176,72,0)']]);
  blob(glass.x + pad, glass.y, glass.rx * 1.6, glass.ry * 1.5, [[0, 'rgba(255,244,214,1)'], [0.6, 'rgba(255,226,160,0.9)'], [1, 'rgba(255,226,160,0)']]);
  scene.textures.addCanvas(key, canvas);
  return key;
}

function placeTyphoonShelterLight(scene, record) {
  const sprite = record.sprite;
  const light = record.light;
  if (!light || !sprite || !record.drawable) {
    if (record.lightSprite) record.lightSprite.setVisible(false);
    return;
  }
  const lamp = light === 'lamp';
  const key = lamp
    ? ensureTyphoonShelterLampGlowTexture(scene)
    : (typeof ensureBuildingBeaconTexture === 'function' ? ensureBuildingBeaconTexture(scene, light.split(':')[1]) : null);
  if (!key) return;
  if (!record.lightSprite) {
    const glow = scene.add.image(0, 0, key);
    // The lamps' glow is drawn normally (alpha-blended): it then batches in with the works round it.
    // Added, each of a shelter's ~20 lamps split the sprite batch - 179 draw calls a frame became 202
    // (2026-10-04) - for a look hardly different at night. The few beacons stay added, as the
    // airport's are: their hot core reads through the red lantern.
    if (!lamp) glow.setBlendMode(typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 'ADD');
    maskTyphoonShelterSprite(scene, glow);
    glow.setVisible(false);
    record.lightSprite = glow;
    if (!scene.typhoonShelterLights) scene.typhoonShelterLights = new Set();
    scene.typhoonShelterLights.add(record);
  } else if (record.lightSprite.texture?.key !== key) {
    record.lightSprite.setTexture(key);
  }
  const glow = record.lightSprite;
  const key0 = sprite.texture.key;
  const choice = record.choice;
  // a texture point -> the world, through the sprite's origin and scale
  const world = ([x, y]) => [
    sprite.x + (x - sprite.originX * sprite.frame.width) * sprite.scaleX,
    sprite.y + (y - sprite.originY * sprite.frame.height) * sprite.scaleY,
  ];
  const sourcePoint = (pt) => world(getTyphoonShelterSpriteTexturePoint(scene, choice, key0, pt));
  if (lamp) {
    // the glow is drawn on the lamp art's own grid: put its glass on the lamp's glass, sized by
    // the glass-to-foot height (the staged copy is resized, a warp may stretch it)
    const glass = TYPHOON_SHELTER_LAMP_GLASS;
    const foot = TYPHOON_SHELTER_LAMP_FOOT;
    const [gx, gy] = sourcePoint([glass.x, glass.y]);
    const [, fy] = sourcePoint([foot.x, foot.y]);
    const k = (fy - gy) / (foot.y - glass.y);
    glow.setOrigin((glass.x + TYPHOON_SHELTER_LAMP_GLOW_PAD) / glow.frame.width, glass.y / glow.frame.height);
    glow.setScale(k);
    glow.setPosition(gx, gy);
    glow.setDepth(sprite.depth + 0.01);
  } else {
    const anchor = TYPHOON_SHELTER_LIGHT_ANCHORS[choice?.partId];
    const [bx, by] = anchor ? sourcePoint(anchor) : [sprite.x, sprite.y - sprite.displayHeight * 0.5];
    glow.setOrigin(0.5, 0.5);
    glow.setScale(typeof BUILDING_LIGHT_BEACON_SCALE === 'number' ? BUILDING_LIGHT_BEACON_SCALE : 0.7);
    glow.setPosition(bx, by);
    glow.setDepth(sprite.depth + 0.13);
    if (!Number.isFinite(record.lightPhase)) {
      let h = 0;
      for (const ch of String(record.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      record.lightPhase = ((h & 0xff) / 255) * Math.PI * 2;
    }
  }
}

// Every frame: the lamps follow the street lamps' lit state; the beacons pulse with the building
// lights' strength. A light shows only while its object is drawn (the viewport cull hides that).
function updateTyphoonShelterLights(scene, time) {
  const lights = scene?.typhoonShelterLights;
  if (!lights?.size) return;
  const allowed = (typeof isBuildingLightsEnabled !== 'function' || isBuildingLightsEnabled())
    && !(typeof isAttractLightsSuppressed === 'function' && isAttractLightsSuppressed());
  const lampsLit = allowed && typeof streetLampsShouldBeLit === 'function' && streetLampsShouldBeLit(scene);
  const strength = allowed && typeof getRuntimeBuildingLightStrength === 'function' ? getRuntimeBuildingLightStrength(scene) : 0;
  lights.forEach((record) => {
    const glow = record.lightSprite;
    if (!glow?.active) { lights.delete(record); return; }
    const shown = !!(record.light && record.drawable && record.sprite?.visible);
    if (record.light === 'lamp') {
      const on = shown && lampsLit;
      if (glow.visible !== on) glow.setVisible(on);
      return;
    }
    const on = shown && strength > 0.01;
    if (glow.visible !== on) glow.setVisible(on);
    if (!on) return;
    const t = (time / TYPHOON_SHELTER_BEACON_PERIOD) * Math.PI * 2 + record.lightPhase;
    glow.setAlpha(strength * (0.08 + 0.92 * Math.max(0, Math.sin(t))));
  });
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
    // how far it reaches over the shoreline (default TYPHOON_SHELTER_SHORE_OVERLAP_M)
    shoreOverlapM: Number.isFinite(spec.shoreOverlapM) ? spec.shoreOverlapM : null,
    depthBias: spec.depthBias || 0,
    alongM: spec.alongM || 0,
    // one of several sections along a tile: sorted by where it slid to
    sectioned: !!spec.sectioned,
    // [[logical direction, metres], ...]: moved off the tile's centre (a quay to its water edge)
    offsets: Array.isArray(spec.offsets) ? spec.offsets : null,
    alpha: spec.alpha,
    tint: spec.tint || null,
    // kept out of sight whatever the camera (a loading bay's crate pile while it is empty)
    hidden: !!spec.hidden,
    // drawn over this building footprint's sprite ({ row, col, cols, rows }): a crate pile in a bay
    aboveFootprint: spec.aboveFootprint || null,
    // a night light over it: 'lamp' (the promenade lamp's lantern) or 'beacon:<colour>'
    light: getTyphoonShelterRecordLight(spec),
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
  record.lightSprite?.destroy();
  scene.typhoonShelterFloaters?.delete(record);
  scene.typhoonShelterLights?.delete(record);
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
  isTyphoonShelterSpriteInView,
  getTyphoonShelterPlacementRevision,
  getTyphoonShelterTextureSize,
  maskTyphoonShelterSprite,
  resolveTyphoonShelterTextureKey,
  getTyphoonShelterSpriteGround,
  getTyphoonShelterRecordLight,
  getTyphoonShelterSpriteTexturePoint,
  updateTyphoonShelterLights,
  TYPHOON_SHELTER_LIGHT_ANCHORS,
  getTyphoonShelterBob,
  getTyphoonShelterNightTexture,
  getTyphoonShelterLitChoice,
  isTyphoonShelterSeaLit,
  setTyphoonShelterNightArt,
  getTyphoonShelterRecordSeed,
  updateTyphoonShelterBobbing,
  isTyphoonShelterFloater,
};

if (typeof module !== 'undefined' && module.exports) module.exports = typhoonShelterSpritesApi;
if (typeof globalThis !== 'undefined') Object.assign(globalThis, typhoonShelterSpritesApi);
