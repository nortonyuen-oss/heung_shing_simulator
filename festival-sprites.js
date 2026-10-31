// 節慶 on the map: the festival props drawn while their festival is on (docs/festival-dlc-design.md).
//
// Each frame-ish (FESTIVAL_UPDATE_MS) updateFestivals works out from the clock which festivals are
// on (festivals.js getActiveFestivals), settles a government one's money once a year, lays its
// placements out from the map (festival-venues.js) and keeps scene.festivalSprites in step: added
// when the festival starts or its venue appears, gone - and their textures unloaded - when it ends.
// Nothing about a running festival is saved.
//
// Drawing follows the typhoon shelter props: textures load on demand (they are not in the startup
// preload), the art is drawn at its real size (heightM, or lengthM along a diagonal), every sprite
// carries the world mask (an unmasked sprite splits the batch: docs/performance-notes.md) and is
// culled with the buildings (viewport-culling.js). By night a lit part shows its __lit/__litb
// frames, twinkling; otherwise it darkens with the other props (day-night-lighting.js).

const FESTIVAL_TEXTURES_URL = 'data/festival-textures.json';
const FESTIVAL_TEXTURE_KEY_PREFIX = 'festival:';
const FESTIVAL_UPDATE_MS = 250;
const FESTIVAL_LAYOUT_MS = 2000;
const FESTIVAL_TWINKLE_MS = 700;
// screen px a metre at zoom 1: up (as the street furniture) and along a map axis (a 20 m tile's
// edge spans TILE_WIDTH / 2)
const FESTIVAL_PX_PER_METRE_UP = 5;
const FESTIVAL_PX_PER_METRE_ALONG = 2.5;
// The 年宵 stalls (calibrated meshes) are drawn at the 20 m tile's true vertical rate - 2.5 x cos30/cos45,
// as the buildings, street-food carts and people are - not the 5 px a metre the rest of the festival
// art is drawn larger than life at (Norton 2026-10-31: 1格20米做的比例比之前好，檔口大小需要再調整).
const FESTIVAL_STALL_PX_PER_METRE_UP = 2.5 * Math.cos(Math.PI / 6) / Math.cos(Math.PI / 4);
const FESTIVAL_TILE_M = 20;
const FESTIVAL_STEP = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });
const FESTIVAL_STALL_CANVAS_RESOLUTION = 4;
const festivalStallShapes = new Map();
let festivalStallCanvasSequence = 0;

let festivalTextureMeta = null;     // data/festival-textures.json .textures
let festivalTextureMetaLoad = null;

function loadFestivalTextureMeta() {
  if (festivalTextureMetaLoad) return festivalTextureMetaLoad;
  festivalTextureMetaLoad = fetch(`${FESTIVAL_TEXTURES_URL}?v=${Date.now()}`, { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => { festivalTextureMeta = data?.textures || {}; return festivalTextureMeta; })
    .catch((error) => {
      console.warn('[festivals] texture data unavailable', error?.message);
      festivalTextureMeta = {};
      return festivalTextureMeta;
    });
  return festivalTextureMetaLoad;
}

function getFestivalSceneTextureKey(path) {
  return `${FESTIVAL_TEXTURE_KEY_PREFIX}${String(path).split('/').pop().replace(/\.png$/, '')}`;
}

// Loads the textures not yet in the scene; resolves when all are there (or failed).
function loadFestivalTextures(scene, paths) {
  const missing = [...new Set(paths)].filter((p) => !scene.textures.exists(getFestivalSceneTextureKey(p)));
  if (!missing.length) return Promise.resolve(true);
  return new Promise((resolve) => {
    const start = () => {
      missing.forEach((p) => {
        const url = typeof resolveModelAssetPath === 'function' ? resolveModelAssetPath(p) : p;
        scene.load.image(getFestivalSceneTextureKey(p), url);
      });
      scene.load.once('complete', () => resolve(missing.every((p) => scene.textures.exists(getFestivalSceneTextureKey(p)))));
      scene.load.start();
    };
    if (scene.load.isLoading()) scene.load.once('complete', start); else start();
  });
}

// The day and night files of the parts a set of placements uses.
function getFestivalPlacementFiles(placements) {
  const files = new Set();
  placements.forEach((placement) => {
    const part = FESTIVAL_PARTS_BY_ID[placement.partId];
    if (!part) return;
    getFestivalPartTextures(part).forEach((tex) => {
      files.add(tex.file);
      (festivalTextureMeta?.[getFestivalTextureKey(part.id, tex.mirrored)]?.night || []).forEach((f) => files.add(f));
    });
  });
  return [...files];
}

// The screen diagonal a logical direction runs along at the current rotation: '\\' when going that
// way moves down and right (or up and left), '/' otherwise.
function getFestivalScreenAxis(row, col, dir) {
  const [dr, dc] = FESTIVAL_STEP[dir] || [0, 1];
  const a = isoToScreen(col, row);
  const b = isoToScreen(col + dc, row + dr);
  return (b.x - a.x) * (b.y - a.y) > 0 ? '\\' : '/';
}

// Which baked view a placement shows: the mirror when the part's long axis must lie the other way.
function getFestivalPlacementMirrored(placement) {
  const part = FESTIVAL_PARTS_BY_ID[placement.partId];
  if (placement.mirrored != null) return !!placement.mirrored && !!part?.mirror;
  if (!part?.mirror || !part.axis || placement.mode !== 'tile' || !placement.align) return false;
  const shore = getFestivalScreenAxis(placement.row, placement.col, placement.alongDir);
  const want = placement.align === 'along' ? shore : (shore === '/' ? '\\' : '/');
  return want !== part.axis;
}

// The texture a sprite is drawn with now: the day art, or by night a lit part's twinkle frame.
function getFestivalSpriteFile(scene, sprite) {
  const meta = festivalTextureMeta?.[sprite.festivalTextureKey];
  if (!meta) return null;
  if (scene.festivalLit && meta.night?.length) {
    const frame = Math.floor(((scene.time?.now || 0) + sprite.festivalSeed * FESTIVAL_TWINKLE_MS) / FESTIVAL_TWINKLE_MS) % meta.night.length;
    const night = meta.night[frame];
    if (scene.textures.exists(getFestivalSceneTextureKey(night))) return night;
  }
  return meta.file;
}

function getFestivalFootprintSpanM(footprintM) {
  return Number.isFinite(footprintM?.width) && footprintM.width > 0
    && Number.isFinite(footprintM?.depth) && footprintM.depth > 0
    ? footprintM.width + footprintM.depth : 0;
}

// Legacy Image sizing: a placement's height or footprint overrides its part's default size.
// Calibrated booths bypass this envelope approximation and render their metre-sized mesh.
function getFestivalSpriteScale(meta, part, resize, heightM = null, footprintM = null) {
  if (heightM) {
    const px = (meta.personHeightPx > 0 ? meta.personHeightPx : meta.anchor.y - meta.top) * resize;
    return px > 0 ? (heightM * FESTIVAL_PX_PER_METRE_UP) / px : 1;
  }
  const footprintSpanM = getFestivalFootprintSpanM(footprintM);
  const groundSpanX = meta.groundSpanX > 0 ? meta.groundSpanX : meta.right - meta.left;
  if (footprintSpanM && groundSpanX > 0) {
    return (footprintSpanM * FESTIVAL_PX_PER_METRE_ALONG) / (groundSpanX * resize);
  }
  if (meta.personHeightPx > 0 && part.heightM) return (part.heightM * FESTIVAL_PX_PER_METRE_UP) / (meta.personHeightPx * resize);
  if (part.lengthM && meta.groundSpanX > 0) return (part.lengthM * FESTIVAL_PX_PER_METRE_ALONG) / (meta.groundSpanX * resize);
  if (part.lengthM && Number.isFinite(meta.left) && meta.right > meta.left) {
    return (part.lengthM * FESTIVAL_PX_PER_METRE_ALONG) / ((meta.right - meta.left) * resize);
  }
  const heightPx = (meta.anchor.y - meta.top) * resize;
  return heightPx > 0 ? ((part.heightM || 5) * FESTIVAL_PX_PER_METRE_UP) / heightPx : 1;
}

// Approximate an opt-in booth's ground centre from its existing bottom anchor. A 2:1 ground
// diamond's centre is one quarter of its projected width above its front. Keep X unchanged:
// these legacy anchors are opaque-bounds centres, without calibrated horizontal ground corners.
// This returns a loaded-texture offset, so release resizing and night padding remain consistent.
function getFestivalGroundCenterOffsetY(footprintM, scale) {
  const spanM = getFestivalFootprintSpanM(footprintM);
  return spanM && scale > 0 ? (spanM * FESTIVAL_PX_PER_METRE_ALONG) / (4 * scale) : 0;
}

// Calibrated booths already have world-pixel geometry and retain unit scale on both axes.
// Uncalibrated decorations keep their existing envelope/height sizing and anchor convention.
function getFestivalPlacementScales(meta, part, resize, placement = {}) {
  if (meta.stallCalibration && getFestivalFootprintSpanM(placement.footprintM)) return { scaleX: 1, scaleY: 1 };
  // a placement may ask for a lengthwise part at another length (the 盂蘭 戲棚 across an estate court)
  const lengthRatio = placement.lengthM > 0 && part?.lengthM > 0 && !placement.heightM && !placement.footprintM
    ? placement.lengthM / part.lengthM : 1;
  const scaleX = getFestivalSpriteScale(meta, part, resize, placement.heightM, placement.footprintM) * lengthRatio;
  let scaleY = scaleX;
  const spanM = getFestivalFootprintSpanM(placement.footprintM);
  const heightPx = (meta.anchor.y - meta.top) * resize;
  if (spanM && Number.isFinite(placement.maxHeightM) && placement.maxHeightM > 0 && heightPx > 0) {
    const centreOffset = placement.anchorMode === 'ground-center' ? spanM * FESTIVAL_PX_PER_METRE_ALONG / 4 : 0;
    scaleY = Math.min(scaleX, (placement.maxHeightM * FESTIVAL_PX_PER_METRE_UP + centreOffset) / heightPx);
  }
  return { scaleX, scaleY };
}

function getFestivalStallShape(meta, placement, mirrored) {
  if (!meta.stallCalibration || !getFestivalFootprintSpanM(placement.footprintM)) return null;
  const build = typeof buildFestivalStallGeometry === 'function' ? buildFestivalStallGeometry
    : typeof require === 'function' ? require('./festival-stall-geometry.js').buildFestivalStallGeometry : null;
  if (!build) return null;
  const heightM = Number.isFinite(placement.maxHeightM) && placement.maxHeightM > 0 ? placement.maxHeightM : 3;
  const key = JSON.stringify([meta.stallCalibration, placement.footprintM, heightM, mirrored]);
  if (!festivalStallShapes.has(key)) festivalStallShapes.set(key, build(meta.stallCalibration, placement.footprintM, {
    heightM, eaveM: heightM * 0.8, mirrored,
    pxPerMetreAlong: FESTIVAL_PX_PER_METRE_ALONG, pxPerMetreUp: FESTIVAL_STALL_PX_PER_METRE_UP,
  }));
  return { key, geometry: festivalStallShapes.get(key) };
}

// Trimmed release/night textures have different pixel windows. Clip each geometry triangle to
// its loaded UV window, interpolating world positions; clamping UVs alone would smear edge pixels.
function getFestivalStallMeshBuffers(geometry, mapping, width, height) {
  const points = [], indices = [];
  const interpolate = (a, b, t) => Object.fromEntries(['x', 'y', 'u', 'v'].map((k) => [k, a[k] + (b[k] - a[k]) * t]));
  const planes = [(p) => p.u, (p) => 1 - p.u, (p) => p.v, (p) => 1 - p.v];
  for (let n = 0; n < geometry.indices.length; n += 3) {
    let polygon = geometry.indices.slice(n, n + 3).map((i) => {
      const p = geometry.vertices[i];
      return { x: p.x, y: p.y, u: (p.sourceX * mapping.resize + mapping.offsetX) / width,
        v: (p.sourceY * mapping.resize + mapping.offsetY) / height };
    });
    for (const distance of planes) {
      const clipped = [];
      if (!polygon.length) break;
      let previous = polygon.at(-1), previousDistance = distance(previous);
      for (const current of polygon) {
        const currentDistance = distance(current);
        if ((previousDistance >= 0) !== (currentDistance >= 0)) {
          clipped.push(interpolate(previous, current, previousDistance / (previousDistance - currentDistance)));
        }
        if (currentDistance >= 0) clipped.push(current);
        previous = current;
        previousDistance = currentDistance;
      }
      polygon = clipped;
    }
    for (let i = 1; i + 1 < polygon.length; i++) {
      const triangle = [polygon[0], polygon[i], polygon[i + 1]];
      const [a, b, c] = triangle;
      if (Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) < 1e-10) continue;
      for (const p of triangle) {
        indices.push(points.length);
        points.push({ ...p, u: Math.max(0, Math.min(1, p.u)), v: Math.max(0, Math.min(1, p.v)) });
      }
    }
  }
  return { points, indices, vertices: points.flatMap((p) => [p.x, -p.y]), uvs: points.flatMap((p) => [p.u, p.v]) };
}

function canRenderFestivalStallMesh(scene) {
  return typeof scene.add?.mesh === 'function' && !!(scene.game?.renderer?.gl || scene.sys?.game?.renderer?.gl);
}

// Canvas has no Phaser Mesh renderer. Rasterize the same triangles into a transient, supersampled
// cache texture, preserving the PNGs and the exact ground geometry rather than stretching an Image.
function getFestivalStallCanvasTexture(scene, file, sourceKey, shape, mapping, frame, buffers) {
  if (!scene.festivalStallCanvasTextures) scene.festivalStallCanvasTextures = new Map();
  const signature = JSON.stringify([shape.key, file, mapping, frame.width, frame.height]);
  const cached = scene.festivalStallCanvasTextures.get(signature);
  if (cached) return cached;
  const resolution = FESTIVAL_STALL_CANVAS_RESOLUTION, pad = 2;
  const minX = Math.min(...buffers.points.map((p) => p.x)), minY = Math.min(...buffers.points.map((p) => p.y));
  const maxX = Math.max(...buffers.points.map((p) => p.x)), maxY = Math.max(...buffers.points.map((p) => p.y));
  const width = 2 ** Math.ceil(Math.log2(Math.max(1, Math.ceil((maxX - minX) * resolution) + pad * 2)));
  const height = 2 ** Math.ceil(Math.log2(Math.max(1, Math.ceil((maxY - minY) * resolution) + pad * 2)));
  const key = `festival:stall-canvas:${++festivalStallCanvasSequence}`;
  const texture = scene.textures.createCanvas(key, width, height);
  const context = texture.getContext(), source = scene.textures.get(sourceKey).getSourceImage();
  for (let n = 0; n < buffers.points.length; n += 3) {
    const p = buffers.points.slice(n, n + 3).map((v) => ({
      sx: v.u * frame.width, sy: v.v * frame.height,
      dx: (v.x - minX) * resolution + pad, dy: (v.y - minY) * resolution + pad,
    }));
    const ux = p[1].sx - p[0].sx, uy = p[1].sy - p[0].sy;
    const vx = p[2].sx - p[0].sx, vy = p[2].sy - p[0].sy, det = ux * vy - vx * uy;
    if (Math.abs(det) < 1e-10) continue;
    const ax = p[1].dx - p[0].dx, ay = p[1].dy - p[0].dy;
    const bx = p[2].dx - p[0].dx, by = p[2].dy - p[0].dy;
    const a = (ax * vy - bx * uy) / det, b = (ay * vy - by * uy) / det;
    const c = (bx * ux - ax * vx) / det, d = (by * ux - ay * vx) / det;
    context.save();
    context.beginPath();
    context.moveTo(p[0].dx, p[0].dy);
    context.lineTo(p[1].dx, p[1].dy);
    context.lineTo(p[2].dx, p[2].dy);
    context.closePath();
    context.clip();
    context.transform(a, b, c, d, p[0].dx - a * p[0].sx - c * p[0].sy, p[0].dy - b * p[0].sx - d * p[0].sy);
    context.drawImage(source, 0, 0);
    context.restore();
  }
  texture.refresh();
  // These canvases are populated after creation. Their initial GPU mip levels are blank;
  // sample the refreshed base level when the uniformly scaled Image is minified.
  texture.setFilter(0); // Phaser.Textures.FilterMode.LINEAR
  const entry = { key, file, originX: (-minX * resolution + pad) / width,
    originY: (-minY * resolution + pad) / height, scale: 1 / resolution };
  scene.festivalStallCanvasTextures.set(signature, entry);
  return entry;
}

function positionFestivalStallGeometry(scene, sprite, shape, file, key, mapping, frame) {
  const signature = JSON.stringify([shape.key, file, mapping, frame.width, frame.height]);
  if (sprite.festivalStallGeometrySignature !== signature) {
    const buffers = getFestivalStallMeshBuffers(shape.geometry, mapping, frame.width, frame.height);
    if (!buffers.indices.length) return false;
    if (sprite.festivalStallRenderMode === 'mesh') {
      sprite.clear();
      sprite.setSize(frame.width, frame.height);
      sprite.setOrtho(frame.width, frame.height);
      sprite.hideCCW = false;
      sprite.addVertices(buffers.vertices, buffers.uvs, buffers.indices);
      sprite.setScale(1, 1);
    } else {
      sprite.festivalStallCanvasEntry = getFestivalStallCanvasTexture(scene, file, key, shape, mapping, frame, buffers);
    }
    sprite.festivalStallGeometrySignature = signature;
  }
  if (sprite.festivalStallRenderMode === 'canvas') {
    const cached = sprite.festivalStallCanvasEntry;
    sprite.setTexture(cached.key);
    sprite.setOrigin(cached.originX, cached.originY);
    sprite.setScale(cached.scale, cached.scale);
  }
  sprite.festivalStallGeometry = shape.geometry;
  return true;
}

// Where a placement stands on screen (world px) and its depth, or null if its venue is gone.
function getFestivalPlacementPoint(scene, placement) {
  if (placement.mode === 'building') {
    const building = scene.buildingSprites?.get(placement.buildingId);
    // by the building's own key: after dark its sprite wears its night texture under another key
    const record = typeof buildingData !== 'undefined' ? buildingData[placement.buildingId] : null;
    const spot = building && (FESTIVAL_BUILDING_SPOTS[record?.sourceFileName] || FESTIVAL_BUILDING_SPOTS[record?.spriteKey || building.texture?.key]);
    if (!spot) return null;
    const frame = building.frame;
    const mapping = typeof getModelTexturePixelMapping === 'function'
      ? getModelTexturePixelMapping(spot.path, { width: frame.width, height: frame.height })
      : { resize: 1, offsetX: 0, offsetY: 0 };
    const tx = placement.point[0] * mapping.resize + mapping.offsetX;
    const ty = placement.point[1] * mapping.resize + mapping.offsetY;
    return {
      x: building.x + (tx - building.displayOriginX) * building.scaleX,
      y: building.y + (ty - building.displayOriginY) * building.scaleY,
      // just over the park or forecourt it stands in, so under whatever is in front of that; among
      // the things on one building, the lower on the picture the nearer
      depth: building.depth + 0.01 + ty / 100000,
    };
  }
  const row = Math.round(placement.row), col = Math.round(placement.col);
  let dRow = placement.row - row;
  let dCol = placement.col - col;
  (placement.offsets || []).forEach(([dir, metres]) => {
    const [dr, dc] = FESTIVAL_STEP[dir] || [0, 0];
    dRow += (dr * metres) / FESTIVAL_TILE_M;
    dCol += (dc * metres) / FESTIVAL_TILE_M;
  });
  const geo = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
  const centre = isoToScreen(col, row);
  const shifted = isoToScreen(col + dCol, row + dRow);
  let depth = getBuildingSortDepth(getBuildingAnchor(row, col, 1, 1).y, 1, 1, 0);
  if (placement.lionDance) depth += shifted.y - centre.y;
  if (placement.groundBuildingId) {
    const ground = scene.buildingSprites?.get(placement.groundBuildingId);
    if (!ground) return null;
    depth = Math.max(depth, ground.depth + 0.01) + (shifted.y - centre.y) / 100000;
  }
  return {
    x: geo.center.x + (shifted.x - centre.x),
    y: geo.center.y + (shifted.y - centre.y),
    // sorted like a one-tile building on its tile
    depth,
  };
}

// Draws a sprite with the texture it should have now, at its place and size.
function positionFestivalSprite(scene, sprite) {
  const placement = sprite.festivalPlacement;
  const part = FESTIVAL_PARTS_BY_ID[placement.partId];
  sprite.festivalTextureKey = getFestivalTextureKey(part.id, getFestivalPlacementMirrored(placement));
  const meta = festivalTextureMeta?.[sprite.festivalTextureKey];
  const file = getFestivalSpriteFile(scene, sprite);
  const key = file && getFestivalSceneTextureKey(file);
  const at = getFestivalPlacementPoint(scene, placement);
  if (!meta || !key || !scene.textures.exists(key) || !at) {
    sprite.festivalDrawable = false;
    sprite.setVisible(false);
    return false;
  }
  if (sprite.texture?.key !== key) sprite.setTexture(key);
  const frame = sprite.frame;
  const mapping = typeof getModelTexturePixelMapping === 'function'
    ? getModelTexturePixelMapping(meta.file, { width: frame.width, height: frame.height })
    : { resize: 1, offsetX: 0, offsetY: 0 };
  // the night frames are trimmed on their own in the release, so map through their own entry
  const own = file !== meta.file && typeof getModelTexturePixelMapping === 'function'
    ? getModelTexturePixelMapping(file, { width: frame.width, height: frame.height }) : mapping;
  const ax = meta.anchor.x * own.resize + own.offsetX;
  let ay = meta.anchor.y * own.resize + own.offsetY;
  const shape = getFestivalStallShape(meta, placement, getFestivalPlacementMirrored(placement));
  if (shape) {
    if (!positionFestivalStallGeometry(scene, sprite, shape, file, key, own, frame)) return false;
  } else {
    const { scaleX, scaleY } = getFestivalPlacementScales(meta, part, own.resize, placement);
    if (placement.anchorMode === 'ground-center') ay -= getFestivalGroundCenterOffsetY(placement.footprintM, scaleY);
    sprite.setOrigin(ax / frame.width, ay / frame.height);
    sprite.setScale(scaleX, scaleY);
  }
  sprite.setPosition(at.x, at.y);
  sprite.festivalBaseY = at.y;  // a 阿飄 floats about it (festival-yulan.js)
  sprite.setDepth(at.depth);
  sprite.festivalLitShown = file !== meta.file;
  sprite.festivalSourceTextureKey = key;
  // the night art, and what gives its own light (a UFO, a 阿飄), are never darkened
  if (sprite.festivalLitShown || part.selfLit) sprite.clearTint();
  else if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
  sprite.festivalDrawable = true;
  return true;
}

function removeFestivalSprite(scene, id) {
  const sprite = scene.festivalSprites?.get(id);
  if (!sprite) return;
  sprite.destroy();
  scene.festivalSprites.delete(id);
}

// Textures of festivals no longer on: dropped, so a month of decorations costs nothing after it.
function unloadFestivalTextures(scene, keepFiles) {
  const keep = new Set([...keepFiles].map(getFestivalSceneTextureKey));
  scene.festivalStallCanvasTextures?.forEach((entry, signature) => {
    if (keep.has(getFestivalSceneTextureKey(entry.file))) return;
    if (scene.textures.exists(entry.key)) scene.textures.remove(entry.key);
    scene.festivalStallCanvasTextures.delete(signature);
  });
  (scene.festivalTextureKeys || new Set()).forEach((key) => {
    // textures something else draws with right now (the 盂蘭 wanderers, festival-yulan.js)
    if (keep.has(key) || scene.festivalPinnedKeys?.has(key)) return;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.festivalTextureKeys.delete(key);
  });
}

// Brings scene.festivalSprites in line with the placements wanted now.
async function syncFestivalSprites(scene, placements) {
  const token = (scene.festivalSyncToken || 0) + 1;
  scene.festivalSyncToken = token;
  if (!scene.festivalSprites) scene.festivalSprites = new Map();
  if (!scene.festivalTextureKeys) scene.festivalTextureKeys = new Set();
  const wanted = new Map(placements.map((p) => [p.id, p]));
  [...scene.festivalSprites.keys()].forEach((id) => {
    const sprite = scene.festivalSprites.get(id);
    const want = wanted.get(id);
    if (!want || want.partId !== sprite.festivalPlacement.partId) removeFestivalSprite(scene, id);
    else sprite.festivalPlacement = want;
  });
  const files = getFestivalPlacementFiles(placements);
  unloadFestivalTextures(scene, files);
  if (!placements.length) return;
  await loadFestivalTextures(scene, files);
  if (scene.festivalSyncToken !== token) return; // a newer sync took over while these loaded
  files.forEach((f) => scene.festivalTextureKeys.add(getFestivalSceneTextureKey(f)));
  wanted.forEach((placement, id) => {
    let sprite = scene.festivalSprites.get(id);
    const part = FESTIVAL_PARTS_BY_ID[placement.partId];
    const meta = part && festivalTextureMeta?.[getFestivalTextureKey(part.id, getFestivalPlacementMirrored(placement))];
    const shape = meta && getFestivalStallShape(meta, placement, getFestivalPlacementMirrored(placement));
    const mode = shape ? (canRenderFestivalStallMesh(scene) ? 'mesh' : 'canvas') : null;
    if (sprite && (sprite.festivalStallRenderMode || null) !== mode) {
      removeFestivalSprite(scene, id);
      sprite = null;
    }
    if (!sprite) {
      const firstKey = getFestivalSceneTextureKey(FESTIVAL_PARTS_BY_ID[placement.partId] ? getFestivalTexturePath(placement.partId) : '');
      if (!scene.textures.exists(firstKey)) return;
      sprite = mode === 'mesh' ? scene.add.mesh(0, 0, firstKey) : scene.add.image(0, 0, firstKey);
      if (mode) sprite.festivalStallRenderMode = mode;
      sprite.setVisible(false); // until the viewport culling shows it
      if (scene.worldMask) sprite.setMask(scene.worldMask);
      sprite.festivalPlacement = placement;
      sprite.festivalSeed = [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 97;
      scene.festivalSprites.set(id, sprite);
    }
    positionFestivalSprite(scene, sprite);
  });
  scene.terrainViewportCacheKey = null; // let the next culling pass show the new ones
}

// After a map turn or a window resize: every sprite to its new view and place.
function refreshFestivalSprites(scene) {
  scene?.festivalSprites?.forEach((sprite) => positionFestivalSprite(scene, sprite));
}

function clearFestivalSprites(scene) {
  if (typeof closeBunHillMapEvent === 'function') closeBunHillMapEvent(scene);
  if (typeof clearLionDance === 'function') clearLionDance(scene);
  if (scene) scene.festivalSyncToken = (scene.festivalSyncToken || 0) + 1;
  if (!scene?.festivalSprites) return;
  [...scene.festivalSprites.keys()].forEach((id) => removeFestivalSprite(scene, id));
  unloadFestivalTextures(scene, []);
  scene.festivalPlacementSig = '';
  scene.festivalPlacements = [];
  scene.festivalActiveKey = '';
}

function isFestivalGameplayLive() {
  if (typeof isAttractModeActive === 'function' && isAttractModeActive()) return false;
  if (typeof isTerrainCreatorMode !== 'undefined' && isTerrainCreatorMode) return false;
  return true;
}

// What a layout needs beyond the venues: the phase, how many stalls were let this year (the
// economy), a seed for the year, the player's chosen main venue.
const festivalSoldShares = new Map(); // `${city}:${year}:${id}` -> share, fixed for the year once seen
function getFestivalLayoutContext(id, ctx, phase) {
  const key = `${city.name}:${city.year}:${id}`;
  if (!festivalSoldShares.has(key)) {
    const economy = typeof getCityEconomyIndex === 'function' ? getCityEconomyIndex() : 50;
    festivalSoldShares.set(key, Math.max(0.45, Math.min(1, 0.45 + (economy / 100) * 0.6)));
  }
  return {
    ...ctx,
    phase,
    soldShare: festivalSoldShares.get(key),
    seed: `${city.name || 'heung-shing'}:${city.year}`,
    mainVenue: getCityFestivalState()?.venues?.[id] || '',
    minute: typeof getGameTimeOfDayMinutes === 'function' ? getGameTimeOfDayMinutes() : Number(city.timeOfDayMinutes) || 0,
    population: Number(city.population) || 0,
    // 盂蘭: the kerb slots facing homes and the venues' districts (festival-yulan.js)
    ...(id === 'yulan' && typeof getYulanLayoutExtras === 'function'
      ? getYulanLayoutExtras(typeof activeScene !== 'undefined' ? activeScene : null, ctx || {}) : {}),
    ...(id === 'lunarNewYear' && typeof getLionDanceLayoutExtras === 'function'
      ? getLionDanceLayoutExtras(typeof activeScene !== 'undefined' ? activeScene : null) : {}),
  };
}

// The placements of every festival on now. A government festival is drawn only once settled as
// held (paid for); a festival with no programme yet draws nothing.
function getWantedFestivalPlacements(scene, active, ctx) {
  const out = [];
  active.forEach(({ id, phase }) => {
    if ((id === 'dragonBoat' || id === 'bunHill') || !FESTIVAL_PROGRAMMES[id] || !phase) return;
    if (isGovernmentFestival(id) && getFestivalHistoryEntry(id, city.year)?.outcome !== 'held') return;
    out.push(...layoutFestival(id, { ...getFestivalLayoutContext(id, ctx, phase), tier: getFestivalTier(id) }));
  });
  return out;
}

function updateFestivals(scene, time) {
  if (!scene || typeof city === 'undefined' || time < (scene.festivalNextUpdateAt || 0)) return;
  scene.festivalNextUpdateAt = time + FESTIVAL_UPDATE_MS;
  if (typeof isTerrainCreatorMode !== 'undefined' && isTerrainCreatorMode) {
    clearFestivalSprites(scene);
    return;
  }
  if (!festivalTextureMeta) { loadFestivalTextureMeta(); return; }
  const minuteOfDay = typeof getGameTimeOfDayMinutes === 'function' ? getGameTimeOfDayMinutes() : Number(city.timeOfDayMinutes) || 0;
  const active = getActiveFestivals({ year: city.year, month: city.month, minuteOfDay })
    .filter(({ id }) => FESTIVAL_PROGRAMMES[id]);
  const live = isFestivalGameplayLive();
  // The layout reads every building, so it is redone only every FESTIVAL_LAYOUT_MS, or at once
  // when the festivals on, their tiers or the year change; the twinkle below runs every update.
  let activeKey = `${city.year}|${active.map(({ id, phase }) => `${id}:${getFestivalTier(id)}:${phase}`).join(',')}`;
  // 盂蘭's street fires follow the view (festival-yulan.js): lay out again as soon as the camera
  // has moved a little or crossed 1x, not only every FESTIVAL_LAYOUT_MS
  if (active.some(({ id }) => id === 'yulan' || id === 'lunarNewYear')) {
    const camera = scene.cameras?.main;
    if (camera) activeKey += `|cam:${Math.round(camera.scrollX / 250)}:${Math.round(camera.scrollY / 250)}:${camera.zoom > 1}`;
  }
  let placements = scene.festivalPlacements || [];
  if (activeKey !== scene.festivalActiveKey || time >= (scene.festivalLayoutAt || 0)) {
    scene.festivalActiveKey = activeKey;
    scene.festivalLayoutAt = time + FESTIVAL_LAYOUT_MS;
    const ctx = active.length ? getFestivalVenueContext(scene) : null;
    if (live) {
      active.forEach(({ id }) => {
        if ((id === 'dragonBoat' || id === 'bunHill')) return;
        const prior = getFestivalHistoryEntry(id, city.year);
        if (!isGovernmentFestival(id) || (prior && prior.outcome !== 'noVenue')) return;
        const trialContext = { ...getFestivalLayoutContext(id, ctx, 'open'), tier: getFestivalTier(id) === 'skip' ? 'standard' : getFestivalTier(id) };
        const trial = layoutFestival(id, trialContext);
        const hasVenue = trial.length > 0 || (id === 'lunarNewYear' && trialContext.lionVenueAvailable === true);
        if (prior && !hasVenue) return;
        const economy = typeof getCityEconomyIndex === 'function' ? getCityEconomyIndex() : 50;
        const income = getFestivalIncome(id, trial.filter((p) => p.stall && p.sold).length, economy);
        const entry = settleFestivalMonth(id, city.year, { hasVenue, income });
        if (entry && typeof onFestivalSettled === 'function') onFestivalSettled(id, entry);
      });
    }
    placements = active.length ? getWantedFestivalPlacements(scene, active, ctx) : [];
    scene.festivalPlacements = placements;
    // Route coordinates/elevations can change without changing actor IDs or art.
    // Keep live movers on the newly validated route even when no texture sync is needed.
    placements.forEach((placement) => {
      const sprite = scene.festivalSprites?.get(placement.id);
      if (sprite?.festivalPlacement?.partId === placement.partId) sprite.festivalPlacement = placement;
    });
  }
  const sig = placements.map((p) => `${p.id}|${p.partId}`).join(';');
  const lit = typeof streetLampsShouldBeLit === 'function' && streetLampsShouldBeLit(scene);
  const litChanged = lit !== !!scene.festivalLit;
  scene.festivalLit = lit;
  if (sig !== scene.festivalPlacementSig) {
    scene.festivalPlacementSig = sig;
    syncFestivalSprites(scene, placements).catch((error) => console.warn('[festivals] sprites', error?.message));
  } else if (lit || litChanged) {
    // the twinkle, and the swap between day and night art at dusk and dawn
    scene.festivalSprites?.forEach((sprite) => {
      const file = getFestivalSpriteFile(scene, sprite);
      if (file && (sprite.festivalSourceTextureKey || sprite.texture?.key) !== getFestivalSceneTextureKey(file)) positionFestivalSprite(scene, sprite);
    });
  }
  if (live && typeof maybeShowFestivalNotices === 'function') maybeShowFestivalNotices(scene, active, placements);
  if (live && typeof maybePostYulanStory === 'function') maybePostYulanStory(scene, placements);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getFestivalSpriteScale, getFestivalGroundCenterOffsetY, getFestivalPlacementScales,
    getFestivalStallShape, getFestivalStallMeshBuffers,
    FESTIVAL_PX_PER_METRE_UP, FESTIVAL_PX_PER_METRE_ALONG };
}
