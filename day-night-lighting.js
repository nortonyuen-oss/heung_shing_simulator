// Day and night: the sun-angle tint, drifting clouds, the star field and moon phases,
// the baked night art buildings swap to after dark, and how dark the night gets.
// Split out of main.js.

// ── Dynamic lighting: sun-angle tint + cloud drift (screen-space, zoom-aware) ──

// A handful of overlapping soft lobes baked into one texture reads as an
// irregular cumulus patch instead of one perfectly round smudge. Built with
// real canvas radial gradients (continuous alpha falloff) rather than
// Phaser Graphics' stacked flat-alpha circles, which banded into visible
// concentric rings at each step boundary - a gradient has no steps to band.
function generateCloudBlobTexture(scene) {
  if (scene.textures.exists('fx_cloud_blob')) return;
  const w = 380;
  const h = 220;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const lobes = [
    { x: 0.30, y: 0.55, r: 0.34 },
    { x: 0.52, y: 0.38, r: 0.42 },
    { x: 0.72, y: 0.52, r: 0.32 },
    { x: 0.45, y: 0.62, r: 0.30 },
    { x: 0.20, y: 0.60, r: 0.22 },
    { x: 0.82, y: 0.62, r: 0.20 },
  ];
  // 'lighter' (additive) blending lets overlapping lobes melt into each
  // other smoothly instead of one lobe's hard circular edge cutting across
  // another's gradient.
  ctx.globalCompositeOperation = 'lighter';
  lobes.forEach(({ x, y, r }) => {
    const cx = x * w; const cy = y * h; const radius = r * h;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(0.7, 'rgba(255,255,255,0.28)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  });
  scene.textures.addCanvas('fx_cloud_blob', canvas);
}

// Clouds fade out over this zoom range and are fully gone at/above the end -
// "descending through the cloud layer" as the camera zooms in, not a hard cut.
const CLOUD_FADE_ZOOM_START = 0.9;
const CLOUD_FADE_ZOOM_END = 1.2;

// Cloud cover by getCloudDensityTier(): a handful of thin, near-white wisps
// even on a clear day, building through cloudy/showers/heavy-rain to a
// thick, dark ("烏雲") deck under black rainstorm warning or a severe
// typhoon signal. frequency (lower = denser spawn rate) and lifespan
// together set the roughly steady-state particle count (lifespan/frequency).
// No tint at the light end: live-tested against the actual building palette,
// a grey-blue tint blended into near-invisibility against this city's own
// beige/grey rooftops even at full alpha - the texture's native soft white
// reads clearly as drifting cloud/mist on its own. Darker tiers do tint,
// deliberately, to read as heavier/stormier cloud.
// Per-particle alpha is kept flat-to-lower across denser tiers, deliberately:
// overlapping translucent particles compound toward opaque (three layers at
// 0.6 alpha already reads as ~94% opaque), so "thicker" cloud cover mostly
// comes from more particles overlapping more, not from cranking alpha - and
// "darker/stormier" comes from the tint darkening, not from extra opacity on
// top of the sky-darkening overlay/rain the storm already has.
// Thinned 2026-09-28: at the old density (steady ~60 / 84 / 113 screen-sized
// particles for moderate / heavy / extreme) the deck compounded to near-opaque
// and a black-rain or Signal 8 city lost ~60% of its contrast - the whole
// picture read as blurred. Fewer, fainter particles keep the gaps between them
// open so the city shows through the storm. Measured on 太子 at zoom 0.8 with
// getWeatherOverlayAlpha trimmed alongside (luminance std-dev, 45 with no
// weather): heavy rain 31 -> 34, black rain 17 -> 29, Signal 8 17 -> 28.
const CLOUD_DENSITY_TIERS = {
  minimal: { frequency: 9000, lifespan: 30000, alpha: { min: 0.07, max: 0.12 }, scaleMul: 0.65, tint: null },
  light: { frequency: 1500, lifespan: 45000, alpha: { min: 0.22, max: 0.34 }, scaleMul: 1.0, tint: null },
  moderate: { frequency: 1100, lifespan: 42000, alpha: { min: 0.20, max: 0.30 }, scaleMul: 1.1, tint: 0xe4e7ec },
  heavy: { frequency: 800, lifespan: 38000, alpha: { min: 0.18, max: 0.28 }, scaleMul: 1.25, tint: 0xb0b6c2 },
  extreme: { frequency: 600, lifespan: 34000, alpha: { min: 0.18, max: 0.28 }, scaleMul: 1.45, tint: 0x5c6175 },
};
const CLOUD_DRIFT_BASE_CONFIG = {
  speedX: { min: 12, max: 22 },
  speedY: 0,
  quantity: 1,
};
// A cloud particle is bigger than the viewport, so it must not simply appear
// at its full alpha and vanish at the end of its life: at the moderate tier
// that is a screen-sized pale blob popping in every 0.7s, which reads as the
// whole picture flickering. Each particle rolls its own alpha at birth and
// eases in over the first share of its lifespan and out over the last.
const CLOUD_FADE_LIFE_SHARE = 0.18;
function cloudFadeEnvelope(lifeT) {
  const edge = Math.min(1, Math.max(0, Math.min(lifeT, 1 - lifeT) / CLOUD_FADE_LIFE_SHARE));
  return edge * edge * (3 - 2 * edge);
}
function cloudAlphaOp(min, max) {
  return {
    onEmit: (particle) => {
      particle.cloudAlpha = min + Math.random() * (max - min);
      return 0;
    },
    onUpdate: (particle, key, lifeT) => particle.cloudAlpha * cloudFadeEnvelope(lifeT),
  };
}
// Clouds sit above the ground night pass (only the light atmosphere pass covers them), so at
// night they stayed near-white over a dark map. Each particle's tint is instead re-read every
// frame: the weather tier's colour, dimmed by the ground pass and cooled toward a slate blue, so
// the cover darkens with the sky through dusk and the small hours without a setConfig (which
// resets the emitter's timer, see updateDynamicLighting).
const CLOUD_NIGHT_TINT = 0x8c9bb8;
let cloudNightDim = 0; // the ground pass alpha, set by applyNightDarkness
function getCloudNightTint(baseTint) {
  const k = Math.max(0, Math.min(1, cloudNightDim));
  if (k <= 0) return baseTint;
  const channel = (shift) => {
    const base = (baseTint >> shift) & 0xff;
    const night = (CLOUD_NIGHT_TINT >> shift) & 0xff;
    const hue = base + ((base * night) / 255 - base) * k;
    return Math.round(hue * (1 - k)) & 0xff;
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
function cloudTintOp(baseTint) {
  const tint = baseTint ?? 0xffffff;
  return {
    onEmit: () => getCloudNightTint(tint),
    onUpdate: () => getCloudNightTint(tint),
  };
}
const CLOUD_CLEARING_FADE_MS = 6500;

function seededCelestialRandom(seedState) {
  seedState.value = (seedState.value * 1664525 + 1013904223) >>> 0;
  return seedState.value / 0x100000000;
}

function generateStarFieldTexture(scene) {
  if (scene.textures.exists('fx_starfield')) return;
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const seed = { value: 0x48_4b_4f }; // deterministic Hong Kong sky texture
  for (let i = 0; i < 185; i++) {
    const x = seededCelestialRandom(seed) * canvas.width;
    const y = seededCelestialRandom(seed) * canvas.height;
    const radius = 0.45 + Math.pow(seededCelestialRandom(seed), 3) * 1.35;
    const opacity = 0.32 + seededCelestialRandom(seed) * 0.68;
    const warmth = seededCelestialRandom(seed);
    const color = warmth > 0.82 ? '255,232,205' : warmth < 0.12 ? '205,224,255' : '245,248,255';
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.4);
    glow.addColorStop(0, `rgba(${color},${opacity})`);
    glow.addColorStop(0.28, `rgba(${color},${opacity * 0.8})`);
    glow.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  scene.textures.addCanvas('fx_starfield', canvas);
}

const MOON_PHASE_TEXTURE_COUNT = 24;

function generateMoonPhaseTextures(scene) {
  const size = 64;
  for (let phaseIndex = 0; phaseIndex < MOON_PHASE_TEXTURE_COUNT; phaseIndex++) {
    const key = `fx_moon_phase_${phaseIndex}`;
    if (scene.textures.exists(key)) continue;
    const phase = phaseIndex / MOON_PHASE_TEXTURE_COUNT;
    const angle = Math.PI * 2 * phase;
    const lightX = Math.sin(angle);
    const lightZ = -Math.cos(angle);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(size, size);
    const radius = size * 0.41;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = (x + 0.5 - size / 2) / radius;
        const ny = (y + 0.5 - size / 2) / radius;
        const radial = nx * nx + ny * ny;
        if (radial > 1) continue;
        const nz = Math.sqrt(Math.max(0, 1 - radial));
        const illumination = Math.max(0, nx * lightX + nz * lightZ);
        if (illumination <= 0) continue;
        const edge = Math.min(1, (1 - radial) * 12);
        const crater = 0.9 + 0.1 * Math.sin(x * 0.72 + y * 0.37) * Math.sin(y * 0.21);
        const brightness = illumination * crater;
        const offset = (y * size + x) * 4;
        image.data[offset] = Math.round(226 + 24 * brightness);
        image.data[offset + 1] = Math.round(218 + 25 * brightness);
        image.data[offset + 2] = Math.round(185 + 45 * brightness);
        image.data[offset + 3] = Math.round(255 * edge * Math.min(1, illumination * 3.5));
      }
    }
    ctx.putImageData(image, 0, 0);
    scene.textures.addCanvas(key, canvas);
  }
}

function setupCelestialBackground(scene) {
  generateStarFieldTexture(scene);
  generateMoonPhaseTextures(scene);
  scene.starField = scene.add.tileSprite(0, 0, scene.scale.width, scene.scale.height, 'fx_starfield');
  scene.starField.setOrigin(0, 0);
  scene.starField.setScrollFactor(0);
  scene.starField.setDepth(-100);
  scene.starField.setBlendMode('ADD');
  scene.starField.setAlpha(0);

  scene.moonSprite = scene.add.image(0, 0, 'fx_moon_phase_12');
  scene.moonSprite.setScrollFactor(0);
  scene.moonSprite.setDepth(-99);
  scene.moonSprite.setBlendMode('ADD');
  scene.moonSprite.setAlpha(0);
}

function cancelCloudClearingTransition(scene) {
  scene.cloudClearingTween?.remove?.();
  scene.cloudClearingTween = null;
  scene.cloudDriftEmitter?.setAlpha(1);
}

function startCloudClearingTransition(scene, cloudEmitter) {
  if (scene.cloudClearingTween) return;
  cloudEmitter.stop(); // existing cloudy deck drifts on while dissolving; no new deck particles
  scene.cloudClearingTween = scene.tweens.add({
    targets: cloudEmitter,
    alpha: 0,
    duration: CLOUD_CLEARING_FADE_MS,
    ease: 'Sine.easeInOut',
    onComplete: () => {
      cloudEmitter.killAll?.();
      cloudEmitter.setAlpha(1);
      scene.cloudClearingTween = null;
      scene.cloudDriftWeatherTierName = 'minimal';
      scene.cloudDriftLastConfigKey = null;
      if (typeof getCloudDensityTier !== 'function' || getCloudDensityTier() === 'minimal') {
        updateDynamicLighting(scene);
      }
    },
  });
}

function setupDynamicLighting(scene) {
  setupCelestialBackground(scene);
  scene.sunLightGraphics = scene.add.graphics();
  scene.sunLightGraphics.setScrollFactor(0);
  scene.sunLightGraphics.setDepth(999995); // below weatherOverlay/rain/lightning (999998+)

  // Separate from weatherOverlay: this is time-of-day darkness, not a storm.
  //
  // Night darkness is split across TWO passes so that lit building windows can
  // survive it. A single full-screen pass at the old 0.54 peak sat above every
  // sprite, so anything drawn as ordinary pixels - such as a window baked into
  // a building's night texture - came out as mid-grey rather than lit. The
  // ground pass carries most of the darkening but sits UNDER the object band,
  // dimming terrain and roads only; the atmosphere pass keeps a light wash over
  // everything so the scene still reads as one image. Buildings supply their
  // own darkening (baked or tinted) and trees/vehicles are tinted to match.
  scene.groundNightOverlay = scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x020713, 1);
  scene.groundNightOverlay.setOrigin(0, 0);
  scene.groundNightOverlay.setScrollFactor(0);
  scene.groundNightOverlay.setDepth(getWorldDepth('object') - 1);
  scene.groundNightOverlay.setAlpha(0);
  // Extra darkness away from the city: a map-shaped pass just above this one (night-remote-darkness.js).
  if (typeof createNightRemoteDarknessLayer === 'function') createNightRemoteDarknessLayer(scene);

  scene.nightOverlay = scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x020713, 1);
  scene.nightOverlay.setOrigin(0, 0);
  scene.nightOverlay.setScrollFactor(0);
  scene.nightOverlay.setDepth(999997);
  scene.nightOverlay.setAlpha(0);

  generateCloudBlobTexture(scene);
  // Padded for the smallest supported zoom, same reasoning as scene.rainSpawnWidth
  // in setupWeatherEffects: a scrollFactor(0) emitter's spawn offsets live in
  // pre-zoom space, so they must be generous enough to still cover the full
  // canvas once the camera's zoom transform shrinks everything back down.
  scene.cloudSpawnWidth = (scene.scale.width / 0.4) * 1.1;
  scene.cloudSpawnHeight = (scene.scale.height / 0.4) * 1.1;
  scene.cloudDriftEmitter = scene.add.particles(0, 0, 'fx_cloud_blob', {
    ...CLOUD_DRIFT_BASE_CONFIG,
    frequency: CLOUD_DENSITY_TIERS.light.frequency,
    lifespan: CLOUD_DENSITY_TIERS.light.lifespan,
    alpha: cloudAlphaOp(CLOUD_DENSITY_TIERS.light.alpha.min, CLOUD_DENSITY_TIERS.light.alpha.max),
    tint: cloudTintOp(CLOUD_DENSITY_TIERS.light.tint),
    x: { min: -240, max: scene.cloudSpawnWidth },
    y: { min: -120, max: scene.cloudSpawnHeight },
    scale: { min: 1.4, max: 2.6 },
  }); // real tier/scale applied immediately below by updateDynamicLighting()
  scene.cloudDriftEmitter.setScrollFactor(0);
  scene.cloudDriftEmitter.setDepth(999996);
  scene.cloudDriftEmitter.stop();

  syncWeatherFxToCamera(scene);
  updateDynamicLighting(scene);
}

// Called by the 100ms day/night visual cadence, the ambient weather safety
// interval, and immediately on zoom changes. Cloud reconfiguration remains
// key-guarded below, so the faster sky cadence does not reset its emitter.
// ── Baked night textures ─────────────────────────────────────────────────────
// A model with a calibrated light profile also ships four night variants
// (scripts/bake-night-textures.js) with the dark facade, lit windows and lamp
// pools already in its pixels: `__night` (evening peak), `__nighthalf` (about
// half of peak), `__nightdeep` (a few windows) and `__nightlamps` (street
// lamps only). Swapping to one at dusk
// costs nothing per frame, unlike the retained glow object it replaces - the
// whole reason the bake exists. Buildings using one also skip the runtime
// night tint, since their darkening is baked in. Which of the three a building
// wears at a given minute is getBuildingNightVariant's call
// (building-lighting.js), per building, so the city lights up and dims block
// by block.
const BUILDING_NIGHT_TEXTURE_PREFIX = 'bl_night__';
const BUILDING_NIGHT_VARIANT_SUFFIX = Object.freeze({ night: '', half: '__half', deep: '__deep', lamps: '__lamps', christmas: '__christmas' });
const BUILDING_NIGHT_VARIANT_FILE_SUFFIX = Object.freeze({
  night: '__night.png', half: '__nighthalf.png', deep: '__nightdeep.png', lamps: '__nightlamps.png', christmas: '__nightchristmas.png',
});
// Must match BAKE_DIM_DEEP / DIM_TINT in scripts/bake-night-textures.js: the
// swap always lands on the lamps-only variant, which wears the deep facade. A
// building with baked art is tinted toward exactly this on its DAY texture as
// dusk comes in, so that at the moment of the swap its facade brightness is
// already the same and only the street lamps appear. Swapping straight from an
// untinted day texture is a visible jolt.
const BUILDING_BAKED_DIM = 0.68;
const BUILDING_BAKED_TINT = 0x8f99b0;
// Night level at which the pre-swap tint has finished ramping and the swap
// happens. Below this the day texture is shown, progressively dimmed.
const BUILDING_NIGHT_SWAP_AT = 0.30;
const buildingNightPathBySlug = new Map();   // model slug -> logical night path
let buildingNightIndexBuilt = false;

function buildBuildingNightTextureIndex() {
  if (buildingNightIndexBuilt) return buildingNightPathBySlug;
  buildingNightIndexBuilt = true;
  const entries = modelAssetManifest?.entries;
  if (!entries) return buildingNightPathBySlug;
  Object.keys(entries).forEach((logicalPath) => {
    const file = logicalPath.split('/').pop() || '';
    // Longest suffix first: `x__nightdeep.png` also ends with `deep.png`, not
    // with `__night.png`, but keep the order explicit anyway.
    for (const variant of ['christmas', 'half', 'deep', 'lamps', 'night']) {
      const fileSuffix = BUILDING_NIGHT_VARIANT_FILE_SUFFIX[variant];
      if (!file.endsWith(fileSuffix)) continue;
      buildingNightPathBySlug.set(
        file.slice(0, -fileSuffix.length) + BUILDING_NIGHT_VARIANT_SUFFIX[variant], logicalPath,
      );
      return;
    }
  });
  return buildingNightPathBySlug;
}

function getBuildingNightRecord(sprite) {
  return typeof buildingData !== 'undefined' && typeof getTileId === 'function'
    ? buildingData[getTileId(sprite.mapRow, sprite.mapCol)] : null;
}

// The model slug the bake named this building's night art after, or null when
// the model has no baked night art.
function getBuildingNightSlug(sprite, record) {
  // The record wins: it is rewritten by every path that changes a building's
  // model (placement, save load, and redevelopment in sim-growth), so it can
  // never name art the sprite is no longer showing. Fixed buildings (services,
  // landmarks, power, port, depot, parks) carry no filename at all - their
  // record holds a hand-authored sprite key - so the art file is looked up
  // from the model table, which is also what the bake named the texture after.
  const file = record?.sourceFileName
    ?? sprite.modelSourceFileName
    ?? getFixedBuildingModelBySpriteKey(record?.spriteKey ?? sprite.logicalSpriteKey)?.path?.split('/').pop();
  if (!file) return null;
  const slug = String(file).replace(/\.[^.]+$/, '');
  return buildBuildingNightTextureIndex().has(slug) ? slug : null;
}

function getSeasonalBuildingNightVariant(slug, record, variant, month = typeof city !== 'undefined' ? city.month : 0) {
  return Number(month) === 12 && record?.type === 'commercial' && buildBuildingNightTextureIndex().has(slug + '__christmas') ? 'christmas' : variant;
}

function getBuildingNightTextureKey(sprite, variant = 'night') {
  if (!sprite) return null;
  const slug = getBuildingNightSlug(sprite, getBuildingNightRecord(sprite));
  if (!slug) return null;
  variant = getSeasonalBuildingNightVariant(slug, getBuildingNightRecord(sprite), variant);
  return BUILDING_NIGHT_TEXTURE_PREFIX + slug + (BUILDING_NIGHT_VARIANT_SUFFIX[variant] ?? '');
}

// Load on demand, one at a time, reusing the zone-texture loader's discipline
// of never starting a load while another is in flight.
const pendingNightTextureLoads = new Set();
function requestBuildingNightTexture(scene, slug) {
  const key = BUILDING_NIGHT_TEXTURE_PREFIX + slug;
  if (scene.textures.exists(key) || pendingNightTextureLoads.has(key)) return;
  const logicalPath = buildBuildingNightTextureIndex().get(slug);
  if (!logicalPath) return;
  pendingNightTextureLoads.add(key);
  const start = () => {
    if (scene.load.isLoading()) {
      scene.load.once('complete', start);
      return;
    }
    scene.load.image(key, resolveModelAssetPath(logicalPath));
    scene.load.once('complete', () => pendingNightTextureLoads.delete(key));
    scene.load.start();
  };
  start();
}

// The night art a saved city will wear the moment it appears: one key per
// (model, variant) its buildings resolve to at `minute`. The load path fetches
// these before the sprites are built, so a city loaded after dark does not
// flash a daytime skyline and then dress itself one texture load at a time.
function collectBuildingNightTextureKeys(records, minute, sunsetMin) {
  const keys = new Set();
  if (typeof getBuildingNightVariant !== 'function' || typeof getBuildingNightKind !== 'function'
    || typeof getBuildingLightSeed !== 'function') return keys;
  Object.entries(records || {}).forEach(([id, record]) => {
    if (!record) return;
    const slug = getBuildingNightSlug({ logicalSpriteKey: record.spriteKey }, record);
    if (!slug) return;
    const [row, col] = String(id).split(':').map(Number);
    let variant = getBuildingNightVariant(
      getBuildingNightKind(record), getBuildingLightSeed(row, col), minute, sunsetMin,
    );
    variant = getSeasonalBuildingNightVariant(slug, record, variant);
    keys.add(BUILDING_NIGHT_TEXTURE_PREFIX + slug + (BUILDING_NIGHT_VARIANT_SUFFIX[variant] ?? ''));
  });
  return keys;
}

// One loader batch for a set of night keys. Resolves once the loader has run;
// anything still missing is left to the per-tick swap, which requests and
// retries on its own. Callers wait for the loader to be idle first.
function preloadBuildingNightTextures(scene, keys) {
  const index = buildBuildingNightTextureIndex();
  const queued = [];
  keys.forEach((key) => {
    if (scene.textures.exists(key) || pendingNightTextureLoads.has(key)) return;
    const logicalPath = index.get(key.slice(BUILDING_NIGHT_TEXTURE_PREFIX.length));
    if (!logicalPath) return;
    pendingNightTextureLoads.add(key);
    scene.load.image(key, resolveModelAssetPath(logicalPath));
    queued.push(key);
  });
  if (!queued.length) return Promise.resolve();
  return new Promise((resolve) => {
    scene.load.once('complete', () => {
      queued.forEach((key) => pendingNightTextureLoads.delete(key));
      resolve();
    });
    scene.load.start();
  });
}

// Night art ships at a fraction of its day texture's size (scripts/bake-night-textures.js,
// NIGHT_TEXTURE_SCALE) - the same canvas, scaled. Give the loaded night texture its day texture's
// size: Phaser draws a frame at its size and maps it onto the image by size / source size, so the
// small image is stretched over the full frame, and a sprite swapped onto it keeps its scale,
// origin and footprint. Done once per night texture.
function fitNightTextureToDay(scene, nightKey, dayKey) {
  const night = scene.textures.get(nightKey);
  const day = dayKey && scene.textures.exists(dayKey) ? scene.textures.get(dayKey) : null;
  if (!night || !day || night.__fittedToDay === dayKey) return;
  const source = night.source?.[0];
  const dayFrame = day.get();
  const frame = night.get();
  if (!source || !dayFrame || !frame) return;
  if (source.width !== dayFrame.width || source.height !== dayFrame.height) {
    source.width = dayFrame.width;
    source.height = dayFrame.height;
    frame.setSize(dayFrame.width, dayFrame.height);
  }
  night.__fittedToDay = dayKey;
}

function applyBuildingNightTexture(scene, sprite, wantNight, variant = 'night') {
  const key = getBuildingNightTextureKey(sprite, variant);
  if (!key) return false;
  if (wantNight) {
    if (!scene.textures.exists(key)) {
      requestBuildingNightTexture(scene, key.slice(BUILDING_NIGHT_TEXTURE_PREFIX.length));
      // Until it arrives the day art stays up; hold it at the baked dim so a
      // tower that has just gone up after dark is not a daylight-bright flash
      // among its lit neighbours. The tint pass skips this sprite meanwhile.
      if (scene.__nightBakedPreTint) sprite.setTint(scene.__nightBakedPreTint);
      sprite.skipNightTint = true;
      sprite.__nightArtPending = true;
      return false;
    }
    if (sprite.texture.key !== key) {
      sprite.__dayTextureKey = sprite.__dayTextureKey ?? sprite.texture.key;
      fitNightTextureToDay(scene, key, sprite.__dayTextureKey);
      sprite.setTexture(key);
      // The small-hours tint (applyNightObjectTint) only re-walks the sprites
      // when the depth moves, so a swap mid-plateau has to keep it itself.
      if (scene.__nightBakedTint) sprite.setTint(scene.__nightBakedTint);
      else sprite.clearTint?.();
    }
    sprite.skipNightTint = true;
    sprite.__nightArtPending = false;
    return true;
  }
  if (sprite.__dayTextureKey) {
    if (scene.textures.exists(sprite.__dayTextureKey)) sprite.setTexture(sprite.__dayTextureKey);
    sprite.__dayTextureKey = null;
  }
  sprite.skipNightTint = false;
  sprite.__nightArtPending = false;
  return false;
}

// A building went up, grew or turned after the last walk: make the next
// lighting tick look again rather than waiting for the display minute to move.
function markBuildingNightArtDirty(scene) {
  if (scene) scene.__blNightTexPending = true;
}

// Swap the visible set between day art and each building's own night variant.
// Runs on the lighting tick, not per frame, and walks the sprites only when
// the display minute has moved (a building's variant can only change on a
// minute boundary) or a texture was still loading last time.
function syncBuildingNightTextures(scene, rawNightAlpha) {
  if (!scene?.buildingSprites) return;
  // With the calibrator open, stay on day art: building-lighting.js draws the
  // live glow instead so edits are visible, and the baked art would fight it.
  const calibrating = typeof isBuildingLightCalibrationInputActive === 'function'
    && isBuildingLightCalibrationInputActive();
  const wantNight = !calibrating && rawNightAlpha >= BUILDING_NIGHT_SWAP_AT;
  const minute = wantNight && typeof getGameTimeOfDayMinutes === 'function'
    ? Math.floor(getGameTimeOfDayMinutes()) : -1;
  // The dusk ramp is anchored to today's sunset, not the clock.
  const sunset = typeof getAstronomyVisualDay === 'function'
    ? Number(getAstronomyVisualDay()?.sunsetMinutes) : NaN;
  const season = typeof city !== 'undefined' && Number(city.month) === 12 ? 12 : 0;
  const state = wantNight ? `night:${minute}:${season}` : 'day';
  if (scene.__blNightTexState === state && !scene.__blNightTexPending) return;
  const pickVariant = typeof getBuildingNightVariantWindow === 'function' && typeof getBuildingNightKind === 'function'
    && typeof getBuildingLightSeed === 'function';
  // At 1x a game minute passes every ~80ms, so this walk used to re-resolve every building on
  // nearly every lighting tick (~9ms, 35ms peaks, in 旺角). Each building's schedule is a pure
  // function of the minute, so remember the variant it wears and the minute it next changes
  // (getBuildingNightVariantWindow) and skip it until then; a new night invalidates the memo.
  if (wantNight && scene.__blNightTexState !== state && !String(scene.__blNightTexState || '').startsWith('night:')) {
    scene.__blNightSession = (scene.__blNightSession || 0) + 1;
  }
  const session = scene.__blNightSession || 0;
  const line = minute < 720 ? minute + 1440 : minute; // the noon-to-noon line the windows use
  let pending = false;
  const seen = scene.__blNightTexSeen || (scene.__blNightTexSeen = new Set());
  seen.clear();
  scene.buildingSprites.forEach((sprite) => {
    if (!sprite || seen.has(sprite)) return;
    seen.add(sprite);
    if (wantNight && sprite.__nightSeason === season && sprite.__nightWindowSession === session && sprite.__nightWindowApplied
      && line < sprite.__nightWindowUntil
      // ... as long as nothing else put the day art back on it meanwhile.
      && typeof sprite.texture?.key === 'string' && sprite.texture.key.startsWith(BUILDING_NIGHT_TEXTURE_PREFIX)) return;
    const record = getBuildingNightRecord(sprite);
    if (!getBuildingNightSlug(sprite, record)) return;
    let variant = 'night';
    let until = Infinity;
    if (wantNight && pickVariant) {
      const window = getBuildingNightVariantWindow(
        getBuildingNightKind(record), getBuildingLightSeed(sprite.mapRow, sprite.mapCol), minute, sunset,
      );
      variant = window.variant;
      until = window.until;
    }
    const applied = applyBuildingNightTexture(scene, sprite, wantNight, variant);
    if (wantNight) {
      sprite.__nightSeason = season;
      sprite.__nightWindowSession = session;
      sprite.__nightWindowUntil = until;
      sprite.__nightWindowApplied = applied;
      if (!applied) pending = true;
    } else {
      sprite.__nightWindowApplied = false;
    }
  });
  seen.clear();
  scene.__blNightTexState = state;
  // textures still loading: come back next tick and finish the swap
  scene.__blNightTexPending = pending;
}

// ── Night darkness split ─────────────────────────────────────────────────────
// The visible night darkness players see, at its midnight peak. The keyframe
// data in sim-weather.js still peaks at 0.54 and stays the authoritative input
// to the lamp ramps; this is the display target the two passes composite to.
// Deepened 2026-09-28 (0.45/0.56 -> 0.62/0.71: the ground's remaining light cut
// by ~15% and then another 20%) with the atmosphere share cut so the pass over
// the buildings stays ~0.14: the extra dark lands on the ground only, and the
// lit windows, lamp pools and beacons stand out against it.
const NIGHT_DARKNESS_PEAK = 0.62;
// ... and in the small hours (getDeepNightDepth, sim-weather.js), when the
// keyframe curve is flat but the city has gone to bed.
const NIGHT_DARKNESS_DEEP_PEAK = 0.71;
const NIGHT_KEYFRAME_PEAK = 0.54;
// How much of that darkness stays in the pass above every sprite. The rest
// goes below the object band. A lit window baked into a building texture only
// has to survive this share, so keep it low enough that white stays white-ish:
// 255 * (1 - 0.14) = ~219 (0.62 * 0.226).
const NIGHT_ATMOSPHERE_SHARE = 0.226;

// Colour applied to objects in the object band (trees, vehicles, vessels) to
// stand in for the ground pass they no longer sit under.
const NIGHT_OBJECT_TINT = 0x9aa3b4;
// Buildings sit above the ground pass too, but unlike trees they should NOT be
// darkened all the way down to it - a lit facade catching street light reads
// brighter than bare ground, and over-darkening kills the window glow the whole
// split exists to protect. They absorb this share of the ground pass instead,
// landing at ~0.37 total darkness against the ground's 0.62.
const NIGHT_BUILDING_DARKNESS_SHARE = 0.5;
// A building wearing baked night art has its darkening in the pixels, but the
// same texture is worn at 21:00 and at 03:00; in the small hours it takes this
// share of the object tint on top, so the towers settle with the ground.
const NIGHT_BAKED_DEEP_SHARE = 0.35;

function computeNightDarknessPasses(rawNightAlpha, deepNightDepth = 0) {
  const raw = Math.max(0, Math.min(NIGHT_KEYFRAME_PEAK, Number(rawNightAlpha) || 0));
  const depth = Math.max(0, Math.min(1, Number(deepNightDepth) || 0));
  const peak = NIGHT_DARKNESS_PEAK + (NIGHT_DARKNESS_DEEP_PEAK - NIGHT_DARKNESS_PEAK) * depth;
  const total = (raw / NIGHT_KEYFRAME_PEAK) * peak;
  const atmosphere = total * NIGHT_ATMOSPHERE_SHARE;
  // Solve (1 - ground)(1 - atmosphere) = 1 - total so the two passes composite
  // to exactly `total` over anything that sits under both.
  const ground = atmosphere >= 1 ? 1 : 1 - (1 - total) / (1 - atmosphere);
  return { total, atmosphere, ground: Math.max(0, Math.min(1, ground)) };
}

function applyNightDarkness(scene, rawNightAlpha, deepNightDepth = 0) {
  const { total, atmosphere, ground } = computeNightDarknessPasses(rawNightAlpha, deepNightDepth);
  // The lamp ramps in building-lighting.js / traffic-visuals.js are calibrated
  // against the original keyframe curve, not against either pass alpha.
  scene.nightRawAlpha = Math.max(0, Number(rawNightAlpha) || 0);
  scene.nightDeepDepth = Math.max(0, Math.min(1, Number(deepNightDepth) || 0));
  scene.nightDarkness = total;
  scene.nightOverlay?.setAlpha(atmosphere);
  scene.groundNightOverlay?.setAlpha(ground);
  cloudNightDim = ground;
  // Swap baked night art in slightly before the tint ramps, so a building never
  // shows a fully lit facade next to an already-dark street.
  syncBuildingNightTextures(scene, scene.nightRawAlpha);
  // Before the object tint: trees far from the city read this pass's alpha for their tint.
  if (typeof updateNightRemoteDarkness === 'function') {
    updateNightRemoteDarkness(scene, scene.nightRawAlpha, scene.nightDeepDepth, total);
  }
  applyNightObjectTint(scene, ground);
}

// Trees, vehicles and vessels live in the object band and so are no longer
// covered by the ground pass. Tint them by the same amount instead. Only
// touched when the tint bucket actually changes, so this is free per frame.
function applyNightObjectTint(scene, ground) {
  // Quantised off the raw night curve rather than the ground pass: the baked-art
  // pre-swap ramp below finishes by raw 0.30, which is only a few 5% steps of
  // ground and would visibly stair-step.
  const rawStep = Math.round(Math.max(0, Number(scene.nightRawAlpha) || 0) * 100);
  const depthStep = Math.round(Math.max(0, Math.min(1, Number(scene.nightDeepDepth) || 0)) * 100);
  const step = rawStep * 1000 + depthStep;
  if (scene.__nightTintStep === step) return;
  scene.__nightTintStep = step;
  // The tint strength is the ground pass share (0..1). It used to be derived from rawStep
  // (raw x 5, up to 2.7 at midnight), which overshot the lerp into negative channels and
  // turned every tree a garbled red after dark.
  const k = Math.max(0, Math.min(1, Number(ground) || 0));
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const tint = k <= 0 ? 0xffffff : (
    (lerp(0xff, (NIGHT_OBJECT_TINT >> 16) & 0xff, k) << 16)
    | (lerp(0xff, (NIGHT_OBJECT_TINT >> 8) & 0xff, k) << 8)
    | lerp(0xff, NIGHT_OBJECT_TINT & 0xff, k)
  );
  scene.__nightPropTint = k <= 0 ? null : tint;
  // Only what is on screen is re-tinted now; the rest (~80% of the city at zoom 1) is marked and
  // picks up the current tint when the viewport culling shows it (applyDeferredNightTint). Each
  // step of dusk, dawn and the deep-night ramp used to re-tint all ~10,000 sprites: up to 128 ms.
  const apply = (sprite) => {
    if (!sprite || typeof sprite.setTint !== 'function') return;
    if (!sprite.visible) {
      sprite.__nightTintDirty = 'prop';
      return;
    }
    sprite.__nightTintDirty = null;
    applyNightPropTint(scene, sprite);
  };
  scene.treeSprites?.forEach((sprites) => {
    if (Array.isArray(sprites)) sprites.forEach(apply);
    else apply(sprites);
  });
  // Bridge parapets and pedestrian railings are unlit: they darken with the trees.
  scene.bridgeParapetSprites?.forEach(apply);
  scene.pedestrianRailingSprites?.forEach(apply);
  scene.streetFurnitureSprites?.forEach(apply);
  scene.promenadePropSprites?.forEach(apply);
  // So do the bare-land clutter and the typhoon shelters' works (one being previewed keeps its
  // own tint); the shelter boats take theirs as they are drawn each frame.
  scene.debrisSprites?.forEach(apply);
  scene.typhoonShelterObjects?.forEach((record) => { if (!record.tint) apply(record.sprite); });

  // Buildings take a lighter share (see NIGHT_BUILDING_DARKNESS_SHARE). Once a
  // model carries a baked night texture its darkening is in the pixels and it
  // opts out via `skipNightTint` - except in the small hours, when it takes
  // NIGHT_BAKED_DEEP_SHARE of the object tint so the towers settle with the
  // ground instead of holding their 21:00 brightness until dawn.
  //
  // Before that swap happens, a building that HAS baked art is instead ramped
  // toward the baked dim on its day texture, so the swap lands on a facade that
  // already matches and only the street lamps change.
  const raw = Math.max(0, Number(scene.nightRawAlpha) || 0);
  const deepK = (depthStep / 100) * NIGHT_BAKED_DEEP_SHARE;
  const deepTint = deepK <= 0 ? 0xffffff : (
    (lerp(0xff, (NIGHT_OBJECT_TINT >> 16) & 0xff, deepK) << 16)
    | (lerp(0xff, (NIGHT_OBJECT_TINT >> 8) & 0xff, deepK) << 8)
    | lerp(0xff, NIGHT_OBJECT_TINT & 0xff, deepK)
  );
  scene.__nightBakedTint = deepK <= 0 ? null : deepTint;
  const preK = Math.min(1, raw / BUILDING_NIGHT_SWAP_AT) * BUILDING_BAKED_DIM;
  const preTint = preK <= 0 ? 0xffffff : (
    (lerp(0xff, (BUILDING_BAKED_TINT >> 16) & 0xff, preK) << 16)
    | (lerp(0xff, (BUILDING_BAKED_TINT >> 8) & 0xff, preK) << 8)
    | lerp(0xff, BUILDING_BAKED_TINT & 0xff, preK)
  );
  // applyBuildingNightTexture holds a building whose night art is still
  // loading at this tint; past the swap point it is the full baked dim.
  scene.__nightBakedPreTint = raw >= BUILDING_NIGHT_SWAP_AT ? preTint : null;
  const bk = k * NIGHT_BUILDING_DARKNESS_SHARE;
  const buildingTint = bk <= 0 ? 0xffffff : (
    (lerp(0xff, (NIGHT_OBJECT_TINT >> 16) & 0xff, bk) << 16)
    | (lerp(0xff, (NIGHT_OBJECT_TINT >> 8) & 0xff, bk) << 8)
    | lerp(0xff, NIGHT_OBJECT_TINT & 0xff, bk)
  );
  // buildingSprites holds one entry per footprint tile, all pointing at the
  // same sprite - dedupe so a 5x5 landmark is not tinted 25 times.
  const seenBuildings = scene.__nightTintSeen || (scene.__nightTintSeen = new Set());
  seenBuildings.clear();
  scene.__nightBuildingTint = bk <= 0 ? null : buildingTint;
  scene.__nightBuildingPreK = preK;
  scene.__nightBuildingPreTint = preTint;
  scene.buildingSprites?.forEach((sprite) => {
    if (!sprite || seenBuildings.has(sprite)) return;
    seenBuildings.add(sprite);
    if (typeof sprite.setTint !== 'function') return;
    if (!sprite.visible) {
      sprite.__nightTintDirty = 'building';
      return;
    }
    sprite.__nightTintDirty = null;
    applyNightBuildingTint(scene, sprite);
  });
  seenBuildings.clear();
}

function applyNightPropTint(scene, sprite) {
  const tint = scene.__nightPropTint;
  // Away from the city the ground takes an extra pass (night-remote-darkness.js); these props
  // sit above it, so they take the same amount on their tint.
  const remote = typeof getNightRemoteDimAt === 'function' ? getNightRemoteDimAt(scene, sprite.x, sprite.y) : 0;
  if (remote > 0.004) sprite.setTint(scaleNightTint(tint ?? 0xffffff, 1 - remote));
  else if (tint === null || tint === undefined) sprite.clearTint?.();
  else sprite.setTint(tint);
}

// The per-building part of applyNightObjectTint, from the tints it left on the scene.
function applyNightBuildingTint(scene, sprite) {
  const hasBakedArt = typeof getBuildingNightTextureKey === 'function';
  const deepTint = scene.__nightBakedTint;
  const preK = scene.__nightBuildingPreK || 0;
  const preTint = scene.__nightBuildingPreTint;
  if (sprite.skipNightTint) {
    // wearing baked night art - or still waiting for it on a dimmed day texture
    if (sprite.__nightArtPending) {
      if (scene.__nightBakedPreTint) sprite.setTint(scene.__nightBakedPreTint);
    } else if (!deepTint) sprite.clearTint?.();
    else sprite.setTint(deepTint);
    return;
  }
  const baked = hasBakedArt && getBuildingNightTextureKey(sprite);
  const tint = baked ? (preK > 0 ? preTint : null) : scene.__nightBuildingTint;
  if (!tint) sprite.clearTint?.();
  else sprite.setTint(tint);
}

// Called by the viewport culling as a sprite comes on screen: catch up on a night tint step
// that passed while it was off screen.
function applyDeferredNightTint(sprite) {
  const kind = sprite?.__nightTintDirty;
  const scene = sprite?.scene;
  if (!kind || !scene) return;
  sprite.__nightTintDirty = null;
  if (kind === 'building') applyNightBuildingTint(scene, sprite);
  else applyNightPropTint(scene, sprite);
}

function updateDynamicLighting(scene) {
  const graphics = scene?.sunLightGraphics;
  if (!graphics) return;
  const camera = scene.cameras?.main;

  if (!isDynamicLightingEnabled()) {
    graphics.clear();
    applyNightDarkness(scene, 0);
    scene.trafficLightStrength = 0;
    scene.buildingLightStrength = 0;
    scene.starField?.setAlpha(0);
    scene.moonSprite?.setAlpha(0);
    camera?.setBackgroundColor?.(
      typeof SKY_BACKGROUND_DEFAULT_COLOR === 'number' ? SKY_BACKGROUND_DEFAULT_COLOR : 0x87ceeb,
    );
    cancelCloudClearingTransition(scene);
    scene.cloudDriftEmitter?.stop();
    return;
  }

  const timeMinutes = typeof getGameTimeOfDayMinutes === 'function' ? getGameTimeOfDayMinutes() : 12 * 60;
  const sun = typeof getSunLightVisualState === 'function' ? getSunLightVisualState(timeMinutes) : { active: false };
  const zoom = camera?.zoom || 1;
  const w = scene.scale.width / zoom;
  const h = scene.scale.height / zoom;
  const x = camera.centerX - w / 2;
  const y = camera.centerY - h / 2;
  camera?.setBackgroundColor?.(
    typeof getSkyBackgroundColor === 'function' ? getSkyBackgroundColor(timeMinutes) : 0x87ceeb,
  );
  // rawNightAlpha keeps the original 0..0.54 curve: the vehicle and building
  // lamp ramps below are calibrated against it and must not shift.
  const rawNightAlpha = typeof getNightOverlayAlpha === 'function' ? getNightOverlayAlpha(timeMinutes) : 0;
  const deepNightDepth = typeof getDeepNightDepth === 'function' ? getDeepNightDepth(timeMinutes) : 0;
  applyNightDarkness(scene, rawNightAlpha, deepNightDepth);
  // Cache the vehicle-lamp strength once per lighting tick; every road vehicle
  // reads scene.trafficLightStrength instead of recomputing it per frame.
  if (typeof computeRuntimeTrafficLightStrength === 'function') {
    scene.trafficLightStrength = computeRuntimeTrafficLightStrength(scene);
  }
  if (typeof computeRuntimeBuildingLightStrength === 'function') {
    scene.buildingLightStrength = computeRuntimeBuildingLightStrength(scene);
  }
  const stars = typeof getStarFieldVisualState === 'function'
    ? getStarFieldVisualState(timeMinutes)
    : { active: false, alpha: 0 };
  scene.starField?.setAlpha(stars.active ? stars.alpha : 0);
  if (scene.starField) {
    scene.starField.tilePositionX = -(timeMinutes / (24 * 60)) * 70;
  }
  const moon = typeof getMoonVisualState === 'function'
    ? getMoonVisualState(timeMinutes)
    : { active: false, alpha: 0, phase: 0.5, xRatio: 0.5, yRatio: 0.2 };
  if (scene.moonSprite) {
    const phaseIndex = Math.round((Number(moon.phase) || 0) * MOON_PHASE_TEXTURE_COUNT) % MOON_PHASE_TEXTURE_COUNT;
    const moonTexture = `fx_moon_phase_${phaseIndex}`;
    if (scene.moonSprite.texture?.key !== moonTexture && scene.textures.exists(moonTexture)) {
      scene.moonSprite.setTexture(moonTexture);
    }
    scene.moonSprite
      .setPosition(x + w * moon.xRatio, y + h * moon.yRatio)
      .setScale(0.88 / zoom)
      .setAlpha(moon.active ? moon.alpha : 0);
  }
  graphics.clear();
  if (sun.active && typeof lerpColorChannels === 'function') {
    const eastColor = lerpColorChannels(sun.warmColor, sun.shadowColor, sun.sunSide);
    const westColor = lerpColorChannels(sun.shadowColor, sun.warmColor, sun.sunSide);
    graphics.fillGradientStyle(eastColor, westColor, eastColor, westColor, sun.alpha, sun.alpha, sun.alpha, sun.alpha);
    graphics.fillRect(x, y, w, h);
  }

  // Like descending through a cloud layer from altitude: cover holds steady
  // above CLOUD_FADE_ZOOM_START, thins out as the camera "descends" through
  // it, and has fully broken clear by CLOUD_FADE_ZOOM_END - not a hard pop.
  const cloudsActive = zoom < CLOUD_FADE_ZOOM_END;
  const cloudEmitter = scene.cloudDriftEmitter;
  if (cloudEmitter && cloudsActive) {
    const tierName = typeof getCloudDensityTier === 'function' ? getCloudDensityTier() : 'light';
    const previousTierName = scene.cloudDriftWeatherTierName;
    if (tierName === 'minimal' && previousTierName && previousTierName !== 'minimal') {
      startCloudClearingTransition(scene, cloudEmitter);
      return;
    }
    if (tierName !== 'minimal' && scene.cloudClearingTween) cancelCloudClearingTransition(scene);
    const tier = CLOUD_DENSITY_TIERS[tierName] || CLOUD_DENSITY_TIERS.light;
    const fade = zoom <= CLOUD_FADE_ZOOM_START ? 1
      : Math.max(0, 1 - (zoom - CLOUD_FADE_ZOOM_START) / (CLOUD_FADE_ZOOM_END - CLOUD_FADE_ZOOM_START));
    // scrollFactor(0) cancels camera *pan* but NOT *zoom* (see syncWeatherFxToCamera's
    // comment) - a fixed particle scale would shrink toward invisible at a heavily
    // zoomed-out view, so size is compensated up by 1/zoom the same way that
    // function enlarges the overlay rectangles' width/height.
    const zoomScale = Math.min(4, 1 / Math.max(0.25, zoom));
    // setConfig() resets Phaser's internal frequency-elapsed timer back to zero
    // (confirmed live: calling it every ~500ms tick against a 1200ms frequency
    // meant the timer was wiped before it ever reached 1200ms, so the emitter
    // sat "emitting" forever without ever actually emitting a single particle).
    // Only reconfigure when the effective config (weather tier, zoom-driven
    // scale, or fade amount) actually changed.
    const fadeKey = Math.round(fade * 20); // 5%-step buckets - plenty smooth, avoids reconfiguring every tiny scroll delta
    const configKey = `${tierName}:${zoomScale}:${fadeKey}`;
    if (scene.cloudDriftLastConfigKey !== configKey) {
      scene.cloudDriftLastConfigKey = configKey;
      const baseScaleMul = tier.scaleMul * zoomScale;
      cloudEmitter.setConfig({
        ...CLOUD_DRIFT_BASE_CONFIG,
        frequency: tier.frequency,
        lifespan: tier.lifespan,
        alpha: cloudAlphaOp(tier.alpha.min * fade, tier.alpha.max * fade),
        tint: cloudTintOp(tier.tint),
        x: { min: -240, max: scene.cloudSpawnWidth },
        y: { min: -120, max: scene.cloudSpawnHeight },
        scale: { min: 1.4 * baseScaleMul, max: 2.6 * baseScaleMul },
      });
      scene.cloudDriftWeatherTierName = tierName;
    }
    if (!cloudEmitter.emitting) cloudEmitter.start();
  } else {
    cancelCloudClearingTransition(scene);
    scene.cloudDriftLastConfigKey = null; // force a reconfigure next time clouds turn on
    cloudEmitter?.stop();
  }
}
