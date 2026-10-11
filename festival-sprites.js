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
const FESTIVAL_TILE_M = 20;
const FESTIVAL_STEP = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });

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

// Real size: the art's height (or, sized by length, its width along a diagonal) in texture pixels
// against the metres it stands for; a placement's own heightM (a smaller tree at a mall's door)
// over the part's.
function getFestivalSpriteScale(meta, part, resize, heightM = null) {
  if (heightM) {
    const px = (meta.anchor.y - meta.top) * resize;
    return px > 0 ? (heightM * FESTIVAL_PX_PER_METRE_UP) / px : 1;
  }
  if (part.lengthM && Number.isFinite(meta.left) && meta.right > meta.left) {
    return (part.lengthM * FESTIVAL_PX_PER_METRE_ALONG) / ((meta.right - meta.left) * resize);
  }
  const heightPx = (meta.anchor.y - meta.top) * resize;
  return heightPx > 0 ? ((part.heightM || 5) * FESTIVAL_PX_PER_METRE_UP) / heightPx : 1;
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
  const { row, col } = placement;
  let dRow = 0;
  let dCol = 0;
  (placement.offsets || []).forEach(([dir, metres]) => {
    const [dr, dc] = FESTIVAL_STEP[dir] || [0, 0];
    dRow += (dr * metres) / FESTIVAL_TILE_M;
    dCol += (dc * metres) / FESTIVAL_TILE_M;
  });
  const geo = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
  const centre = isoToScreen(col, row);
  const shifted = isoToScreen(col + dCol, row + dRow);
  let depth = getBuildingSortDepth(getBuildingAnchor(row, col, 1, 1).y, 1, 1, 0);
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
  const ay = meta.anchor.y * own.resize + own.offsetY;
  sprite.setOrigin(ax / frame.width, ay / frame.height);
  sprite.setScale(getFestivalSpriteScale(meta, part, own.resize, placement.heightM));
  sprite.setPosition(at.x, at.y);
  sprite.setDepth(at.depth);
  sprite.festivalLitShown = file !== meta.file;
  if (sprite.festivalLitShown) sprite.clearTint();   // the night art carries its own night
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
  (scene.festivalTextureKeys || new Set()).forEach((key) => {
    if (keep.has(key)) return;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.festivalTextureKeys.delete(key);
  });
}

// Brings scene.festivalSprites in line with the placements wanted now.
async function syncFestivalSprites(scene, placements) {
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
  const token = (scene.festivalSyncToken || 0) + 1;
  scene.festivalSyncToken = token;
  await loadFestivalTextures(scene, files);
  if (scene.festivalSyncToken !== token) return; // a newer sync took over while these loaded
  files.forEach((f) => scene.festivalTextureKeys.add(getFestivalSceneTextureKey(f)));
  wanted.forEach((placement, id) => {
    let sprite = scene.festivalSprites.get(id);
    if (!sprite) {
      const firstKey = getFestivalSceneTextureKey(FESTIVAL_PARTS_BY_ID[placement.partId] ? getFestivalTexturePath(placement.partId) : '');
      if (!scene.textures.exists(firstKey)) return;
      sprite = scene.add.image(0, 0, firstKey);
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
  };
}

// The placements of every festival on now. A government festival is drawn only once settled as
// held (paid for); a festival with no programme yet draws nothing.
function getWantedFestivalPlacements(scene, active, ctx) {
  const out = [];
  active.forEach(({ id, phase }) => {
    if (!FESTIVAL_PROGRAMMES[id] || !phase) return;
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
  const activeKey = `${city.year}|${active.map(({ id, phase }) => `${id}:${getFestivalTier(id)}:${phase}`).join(',')}`;
  let placements = scene.festivalPlacements || [];
  if (activeKey !== scene.festivalActiveKey || time >= (scene.festivalLayoutAt || 0)) {
    scene.festivalActiveKey = activeKey;
    scene.festivalLayoutAt = time + FESTIVAL_LAYOUT_MS;
    const ctx = active.length ? getFestivalVenueContext(scene) : null;
    if (live) {
      active.forEach(({ id }) => {
        const prior = getFestivalHistoryEntry(id, city.year);
        if (!isGovernmentFestival(id) || (prior && prior.outcome !== 'noVenue')) return;
        const trial = layoutFestival(id, { ...getFestivalLayoutContext(id, ctx, 'open'), tier: getFestivalTier(id) === 'skip' ? 'standard' : getFestivalTier(id) });
        const hasVenue = trial.length > 0;
        if (prior && !hasVenue) return;
        const economy = typeof getCityEconomyIndex === 'function' ? getCityEconomyIndex() : 50;
        const income = getFestivalIncome(id, trial.filter((p) => p.stall && p.sold).length, economy);
        const entry = settleFestivalMonth(id, city.year, { hasVenue, income });
        if (entry && typeof onFestivalSettled === 'function') onFestivalSettled(id, entry);
      });
    }
    placements = active.length ? getWantedFestivalPlacements(scene, active, ctx) : [];
    scene.festivalPlacements = placements;
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
      if (file && sprite.texture?.key !== getFestivalSceneTextureKey(file)) positionFestivalSprite(scene, sprite);
    });
  }
  if (live && typeof maybeShowFestivalNotices === 'function') maybeShowFestivalNotices(scene, active, placements);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getFestivalSpriteScale, FESTIVAL_PX_PER_METRE_UP, FESTIVAL_PX_PER_METRE_ALONG };
}
