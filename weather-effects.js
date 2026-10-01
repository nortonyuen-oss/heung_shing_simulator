// Weather effects: rain streaks and lightning driven by storm severity, the animated
// sea-surface shimmer on open water, and rain ripples. Split out of main.js.

// Rain particle tiers (screen-space). Shares the same storm-severity ladder as
// getWeatherOverlayAlpha()/getRainEffectTier() (sim-weather.js). lifespan shortens at
// higher tiers (faster-falling drops cross the screen quicker anyway) to keep the
// on-screen particle count bounded for performance. speedX (wind lean) is NOT set here —
// see getRainWindSpeedX(), which drives the slant continuously from actual wind speed
// regardless of tier, so calm rain always falls near-vertical and only leans hard once
// the wind actually picks up.
const RAIN_TIER_CONFIG = {
  light:    { frequency: 30, quantity: 2, lifespan: 950, speedY: [420, 520] },
  moderate: { frequency: 16, quantity: 2, lifespan: 900, speedY: [560, 700] },
  heavy:    { frequency: 9,  quantity: 3, lifespan: 800, speedY: [700, 900] },
  extreme:  { frequency: 6,  quantity: 3, lifespan: 700, speedY: [900, 1150] },
};

// Baseline non-rain wind is ~7-22 km/h (sim-weather.js); anything below that reads as
// "calm" and rain should fall essentially straight down. Above it, lean scales with
// wind speed up to a cap so even a Signal 10 typhoon doesn't send streaks flying
// off-screen instantly.
function getRainWindSpeedX(windKph) {
  const excess = Math.max(0, (Number(windKph) || 0) - 15);
  const lean = Math.min(230, excess * 1.4);
  const jitter = lean * 0.15;
  return { min: -(lean + jitter), max: -Math.max(0, lean - jitter) };
}

// ── Rain particles + lightning flash (screen-space, storm-severity driven) ─────

function generateRainStreakTexture(scene) {
  if (scene.textures.exists('fx_rain_streak')) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.lineStyle(1.5, 0xdfeaff, 0.9);
  g.lineBetween(1, 0, 3, 20);
  g.generateTexture('fx_rain_streak', 4, 20);
  g.destroy();
}

function setupWeatherEffects(scene) {
  generateRainStreakTexture(scene);

  // Spawn-width is fixed generously at the smallest supported zoom (0.4, see the mouse
  // wheel handler's zoom clamp) so it comfortably covers the viewport at any zoom level.
  // Every setConfig() call below must keep re-specifying x/y (see the comment there for
  // why), so this is stored on the scene rather than being a setup-local constant.
  scene.rainSpawnWidth = (scene.scale.width / 0.4) * 1.1;
  scene.rainEmitter = scene.add.particles(0, 0, 'fx_rain_streak', {
    x: { min: 0, max: scene.rainSpawnWidth },
    y: -20,
    lifespan: 950,
    speedY: { min: 420, max: 520 },
    speedX: { min: -5, max: 5 },
    alpha: { start: 0.85, end: 0.3 },
    quantity: 2,
    frequency: 30,
    // The streak texture is drawn as a near-vertical line; rotate each particle to match
    // its own actual fall direction so the visible streak really leans with the wind
    // instead of always looking upright regardless of speedX.
    emitCallback: (particle) => {
      particle.rotation = Math.atan2(particle.velocityX, particle.velocityY);
    },
  });
  scene.rainEmitter.setScrollFactor(0);
  scene.rainEmitter.setDepth(999998);
  scene.rainEmitter.stop();
  scene.currentRainTier = 'none';

  scene.lightningFlash = scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0xffffff, 1);
  scene.lightningFlash.setOrigin(0, 0);
  scene.lightningFlash.setScrollFactor(0);
  scene.lightningFlash.setDepth(1000000);
  scene.lightningFlash.setAlpha(0);
  scene.lightningTimer = null;

  syncWeatherFxToCamera(scene);
  applyWeatherEffectsEnabledState(scene);
}

// scrollFactor(0) cancels camera *pan* but NOT *zoom* — a scrollFactor-0 object still
// gets scaled by the camera's zoom (pivoting at world origin), so at zoom < 1 a
// screen-space overlay sized to scale.width/height renders smaller than the actual
// viewport, leaving an uncovered strip. Re-sizing by 1/zoom keeps it pinned to the
// full visible canvas at any zoom level. Must be called whenever zoom or canvas size
// changes (mouse wheel zoom, window resize) and is also re-applied periodically as a
// safety net from the ambient/weather-fx interval.
function syncWeatherFxToCamera(scene) {
  const camera = scene?.cameras?.main;
  if (!camera) return;
  const zoom = camera.zoom || 1;
  const w = scene.scale.width / zoom;
  const h = scene.scale.height / zoom;
  const x = camera.centerX - w / 2;
  const y = camera.centerY - h / 2;
  scene.weatherOverlay?.setSize(w, h).setPosition(x, y);
  scene.nightOverlay?.setSize(w, h).setPosition(x, y);
  scene.groundNightOverlay?.setSize(w, h).setPosition(x, y);
  scene.lightningFlash?.setSize(w, h).setPosition(x, y);
  scene.starField?.setSize(w, h).setPosition(x, y).setTileScale(1 / zoom, 1 / zoom);
  // setPosition() is safe here (see the big comment on applyRainState() for why plain
  // property assignment of x/y is NOT), and only touches x/y — it won't disturb the
  // speedX/speedY/etc ops applyRainState() manages.
  scene.rainEmitter?.setPosition(x, y);
  scene.cloudDriftEmitter?.setPosition(x, y);
}

// speedX/speedY/x/y/alpha/quantity/lifespan are all "EmitterOp"-backed properties in
// Phaser's particle system (see phaser.js configOpMap). Plain property assignment
// (`emitter.speedX = {min,max}`) does not reliably reconfigure them at runtime — the
// only supported way is `emitter.setConfig({...})`, BUT setConfig() re-derives *every*
// op key from the object passed in, falling back to that op's original default (not its
// current value) for any key you omit. So every call here must restate x/y (the spawn
// range) and alpha alongside whatever actually changed (speedY/lifespan/quantity from
// the rain tier, speedX from live wind speed) — omitting any of them would silently
// reset it to a default and break spawning/positioning.
function applyRainState(scene) {
  if (!scene?.rainEmitter) return;
  const tier = typeof getRainEffectTier === 'function' ? getRainEffectTier() : 'none';
  scene.currentRainTier = tier;
  const config = RAIN_TIER_CONFIG[tier];
  if (!config) {
    scene.rainEmitter.stop();
    return;
  }
  const wind = getRainWindSpeedX(city.weather?.windKph);
  scene.rainEmitter.setConfig({
    x: { min: 0, max: scene.rainSpawnWidth },
    y: -20,
    lifespan: config.lifespan,
    speedY: { min: config.speedY[0], max: config.speedY[1] },
    speedX: wind,
    alpha: { start: 0.85, end: 0.3 },
    quantity: config.quantity,
    frequency: config.frequency,
  });
  scene.rainEmitter.start();
  syncWeatherFxToCamera(scene); // setConfig() just reset x/y to the default (0,0) above
}

function triggerLightningStrike(scene) {
  if (scene.lightningFlash) {
    scene.tweens.chain({
      targets: scene.lightningFlash,
      tweens: [
        { alpha: 0.55, duration: 80, ease: 'Sine.easeOut' },
        { alpha: 0.1, duration: 60, ease: 'Sine.easeIn' },
        { alpha: 0.35, duration: 50, ease: 'Sine.easeOut' },
        { alpha: 0, duration: 150, ease: 'Sine.easeIn' },
      ],
    });
  }
  const thunderDelay = Phaser.Math.Between(200, 800);
  scene.time.delayedCall(thunderDelay, () => {
    if (!scene.sound?.locked) scene.sound.play('sfx_thunder', { volume: 0.5 });
  });
  scheduleNextLightning(scene);
}

function scheduleNextLightning(scene) {
  const range = typeof getLightningDelayRangeMs === 'function' ? getLightningDelayRangeMs() : null;
  if (!range) {
    scene.lightningTimer = null;
    return;
  }
  const delay = Phaser.Math.Between(range[0], range[1]);
  scene.lightningTimer = scene.time.delayedCall(delay, () => triggerLightningStrike(scene));
}

function updateWeatherEffectsTier(scene) {
  if (!scene) return;
  syncWeatherFxToCamera(scene); // sky darkening stays on regardless of the effects toggle
  if (typeof updateDynamicLighting === 'function') updateDynamicLighting(scene); // own toggle, independent of the one below
  if (!isWeatherEffectsEnabled()) return;

  applyRainState(scene);

  const eligible = !!(typeof getLightningDelayRangeMs === 'function' && getLightningDelayRangeMs());
  if (eligible && !scene.lightningTimer) {
    scheduleNextLightning(scene);
  } else if (!eligible && scene.lightningTimer) {
    scene.lightningTimer.remove();
    scene.lightningTimer = null;
  }
}

// ── Sea surface flow: animated shimmer on open-water tiles ─────────────────────
//
// Rather than hand-drawing new water tile art (there'd be 13 coastline edge/corner
// variants to keep in sync with the terrain masking logic), this reuses the existing
// static 'water_full' texture and bakes a handful of frames with a soft ripple-glint
// overlay, the same "draw once onto canvas" trick as the cloud blob above. Only
// water_full (open sea/lake, the overwhelming majority of visible water tiles) is
// animated for now - the coastline edge/corner tiles paint land and water into the
// same texture, so a blanket highlight would shimmer the land half too; those stay
// static until that gets a proper per-pixel water mask.
//
// First cut used one hard-edged diagonal gradient swept across the tile - at a
// glance it read as rain streaks, not water, because a single straight uniform-width
// line is exactly what rain looks like. Real light-on-ripples is soft, scattered
// dabs tracing a wavy (not straight) path, and it pulses rather than holding one
// brightness - both are reproduced below.
//
// Sea state (getSeaStateTier(), sim-weather.js) scales three things together: how
// fast the ripple/breathing cycle runs, how tall the wave bands are, and how bright
// the glints get - so a Signal 8 sea visibly churns while a clear-day sea barely
// breathes, without needing a separate whitecap/foam layer yet.
const SEA_FLOW_FRAME_COUNT = 8;
const SEA_FLOW_BASE_KEY = 'water_full';
// 'light' matches the fixed tuning already approved for the default calm-weather
// look (260ms/1.0/1.0) so the common case doesn't regress; 'minimal' only pulls back
// a little from there, while heavy/extreme ramp up hard since escalating to visibly
// rough seas under a typhoon is the actual point of this tier system.
const SEA_FLOW_TIER_CONFIG = {
  minimal:  { tickMs: 300, ampScale: 0.90, alphaScale: 0.90 },
  light:    { tickMs: 260, ampScale: 1.00, alphaScale: 1.00 },
  moderate: { tickMs: 220, ampScale: 1.20, alphaScale: 1.10 },
  heavy:    { tickMs: 160, ampScale: 1.55, alphaScale: 1.35 },
  extreme:  { tickMs: 100, ampScale: 2.00, alphaScale: 1.65 },
};

// Sunset glints: an extra scatter of small warm-tinted dabs baked into the same
// texture, strength bucketed 0..4 (rather than continuous) so it fits the existing
// "bake once, swap texture key" model instead of re-baking every frame. Only
// meaningful near the top of the sun's arc (see getSeaFlowSunsetBucket below), so in
// practice only a couple of buckets ever get generated in a given session.
const SEA_FLOW_SUNSET_BUCKET_MAX = 4;

function seaFlowRgba(colorInt, alpha) {
  const r = (colorInt >> 16) & 0xff;
  const g = (colorInt >> 8) & 0xff;
  const b = colorInt & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

// A flat orange dab reads as a colour tint, not a glint - real sun-glitter on water
// is a scatter of small, near-white-hot specular points that happen to sit on a warm
// sky, not an orange smear. Every dab gets a white-hot core fading through the
// sunset's gold into nothing, so it reads as a point of caught light; a minority are
// "hero" glints - bigger, brighter, and given a thin four-point sparkle flare - mixed
// among many small pinpricks, the way a few facets of real water catch the sun hard
// while most only catch it faintly.
function drawSeaFlowSunsetGlints(gctx, w, h, bucket) {
  if (bucket <= 0) return;
  const strength = bucket / SEA_FLOW_SUNSET_BUCKET_MAX;
  const goldColor = (typeof SUN_LIGHT_KEYFRAMES !== 'undefined' && SUN_LIGHT_KEYFRAMES.sunset?.color) ?? 0xff7a3d;
  const hotColor = 0xfff6dc;
  const count = Math.round((7 + strength * 17) * 0.5);
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const isHero = Math.random() < 0.22;
    const radius = isHero ? 2.0 + Math.random() * 1.7 : 0.7 + Math.random() * 0.9;
    const alpha = (isHero ? 0.80 + Math.random() * 0.20 : 0.45 + Math.random() * 0.35) * strength;
    const gradient = gctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, seaFlowRgba(hotColor, alpha));
    gradient.addColorStop(0.45, seaFlowRgba(goldColor, alpha * 0.65));
    gradient.addColorStop(1, seaFlowRgba(goldColor, 0));
    gctx.fillStyle = gradient;
    gctx.beginPath();
    gctx.arc(x, y, radius, 0, Math.PI * 2);
    gctx.fill();
    if (isHero) {
      const flareLen = radius * 2.8;
      gctx.strokeStyle = seaFlowRgba(hotColor, alpha * 0.5);
      gctx.lineWidth = 0.6;
      gctx.beginPath();
      gctx.moveTo(x - flareLen, y);
      gctx.lineTo(x + flareLen, y);
      gctx.moveTo(x, y - flareLen);
      gctx.lineTo(x, y + flareLen);
      gctx.stroke();
    }
  }
}

// Only active on clear days near the 17:30 orange-red keyframe. The shared game
// clock keeps it aligned with the topbar/sky; it recedes before the violet night.
function getSeaFlowSunsetBucket(scene) {
  if (typeof isDynamicLightingEnabled === 'function' && !isDynamicLightingEnabled()) return 0;
  if (typeof getSunLightVisualState !== 'function') return 0;
  const timeMinutes = typeof getGameTimeOfDayMinutes === 'function' ? getGameTimeOfDayMinutes() : 12 * 60;
  const sun = getSunLightVisualState(timeMinutes);
  if (!sun.active) return 0;
  const strength = typeof sun.sunsetStrength === 'number'
    ? sun.sunsetStrength
    : Math.max(0, Math.min(1, (sun.sunSide - 0.6) / 0.4));
  return Math.round(strength * SEA_FLOW_SUNSET_BUCKET_MAX);
}

function generateSeaFlowTextures(scene, tier = 'moderate', sunBucket = 0) {
  const comboKey = `${tier}:${sunBucket}`;
  if (!(scene.seaFlowGeneratedTiers instanceof Set)) scene.seaFlowGeneratedTiers = new Set();
  if (scene.seaFlowGeneratedTiers.has(comboKey)) return;
  if (!scene.textures.exists(SEA_FLOW_BASE_KEY)) return;
  const source = scene.textures.get(SEA_FLOW_BASE_KEY).getSourceImage();
  const w = source.width;
  const h = source.height;
  const tierConfig = SEA_FLOW_TIER_CONFIG[tier] || SEA_FLOW_TIER_CONFIG.moderate;
  // Two wavy bands at different heights/wavelengths so the tile doesn't read as one
  // repeating stripe - closer to how real ripple crests overlap at different scales.
  const bands = [
    { yFrac: 0.34, wavelength: w * 0.55, ampFrac: 0.10 * tierConfig.ampScale, dabRadius: 3.4, peakAlpha: 0.16 * tierConfig.alphaScale },
    { yFrac: 0.64, wavelength: w * 0.40, ampFrac: 0.07 * tierConfig.ampScale, dabRadius: 2.6, peakAlpha: 0.12 * tierConfig.alphaScale },
  ];
  for (let frame = 0; frame < SEA_FLOW_FRAME_COUNT; frame++) {
    const frameKey = `${SEA_FLOW_BASE_KEY}_flow_${comboKey}_${frame}`;
    if (scene.textures.exists(frameKey)) continue;

    // One dim->bright->dim breath per full frame loop, so brightness pulses like a
    // gentle swell instead of holding a constant glow.
    const breath = 0.35 + 0.65 * (0.5 - 0.5 * Math.cos((frame / SEA_FLOW_FRAME_COUNT) * Math.PI * 2));
    const wavePhase = (frame / SEA_FLOW_FRAME_COUNT) * Math.PI * 2;

    // Dabs are additively blended on their own transparent canvas first so
    // overlapping glints melt into soft continuous ripples; only the finished blend
    // gets clipped to the tile's diamond silhouette in the pass below (clipping each
    // dab individually would let 'source-atop' cut into glints not drawn yet).
    const glintCanvas = document.createElement('canvas');
    glintCanvas.width = w;
    glintCanvas.height = h;
    const gctx = glintCanvas.getContext('2d');
    gctx.globalCompositeOperation = 'lighter';
    bands.forEach((band, bandIndex) => {
      const baseY = h * band.yFrac;
      const amp = h * band.ampFrac;
      const alpha = band.peakAlpha * breath;
      if (alpha <= 0.01) return;
      for (let x = 2; x < w - 2; x += 5) {
        const y = baseY + Math.sin((x / band.wavelength) * Math.PI * 2 + wavePhase + bandIndex) * amp;
        const gradient = gctx.createRadialGradient(x, y, 0, x, y, band.dabRadius);
        gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
        gradient.addColorStop(0.7, `rgba(255,255,255,${alpha * 0.35})`);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        gctx.fillStyle = gradient;
        gctx.beginPath();
        gctx.arc(x, y, band.dabRadius, 0, Math.PI * 2);
        gctx.fill();
      }
    });
    // Sparkle points get their own random scatter each frame (unlike the smooth
    // sine-path ripple dabs above), so cycling through the 8 frames reads as
    // twinkling glints rather than a fixed pattern sliding around.
    drawSeaFlowSunsetGlints(gctx, w, h, sunBucket);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0, w, h);
    // 'source-atop' only paints over pixels the base tile already occupies, so the
    // glints stay clipped to the tile's own diamond silhouette instead of bleeding
    // past its edge.
    ctx.globalCompositeOperation = 'source-atop';
    ctx.drawImage(glintCanvas, 0, 0);
    scene.textures.addCanvas(frameKey, canvas);
  }
  scene.seaFlowGeneratedTiers.add(comboKey);
}

// Only walks the small camera-local set updateTerrainViewportCulling() already
// maintains (a few hundred tiles at most), so this stays cheap regardless of the
// 256x256 map size. Re-derives each tile's real key from live game state rather than
// caching it at tile-creation time, so terraforming a water tile into land (or vice
// versa) is picked up automatically instead of going stale.
function updateSeaFlowAnimation(scene, time) {
  if (!scene?.activeTerrainSpriteIds?.size || !isSeaFlowEnabled()) return;
  const tier = typeof getSeaStateTier === 'function' ? getSeaStateTier() : 'moderate';
  const tierConfig = SEA_FLOW_TIER_CONFIG[tier] || SEA_FLOW_TIER_CONFIG.moderate;
  if (scene.seaFlowNextTickAt === undefined) scene.seaFlowNextTickAt = 0;
  if (time < scene.seaFlowNextTickAt) return;
  scene.seaFlowNextTickAt = time + tierConfig.tickMs;
  const sunBucket = getSeaFlowSunsetBucket(scene);
  const comboKey = `${tier}:${sunBucket}`;
  if (!scene.seaFlowGeneratedTiers?.has(comboKey)) generateSeaFlowTextures(scene, tier, sunBucket);
  scene.seaFlowFrame = ((scene.seaFlowFrame ?? 0) + 1) % SEA_FLOW_FRAME_COUNT;
  for (const id of scene.activeTerrainSpriteIds) {
    const row = Math.floor(id / MAP_WIDTH);
    const col = id % MAP_WIDTH;
    const tile = scene.tileSprites[row]?.[col];
    if (!tile) continue;
    if (resolveTileTextureKey(getTileKey(row, col)) !== SEA_FLOW_BASE_KEY) continue;
    const phase = (scene.seaFlowFrame + row + col) % SEA_FLOW_FRAME_COUNT;
    const frameKey = `${SEA_FLOW_BASE_KEY}_flow_${comboKey}_${phase}`;
    if (scene.textures.exists(frameKey) && tile.texture?.key !== frameKey) {
      tile.setTexture(frameKey);
    }
  }
}

// ── Rain ripples: transient rings on open water while it's raining ─────────────
//
// Unlike the ambient shimmer above (a per-tile texture swap, permanently on the
// tile), a ripple is a one-off event at a specific point that expands and fades -
// that's a transient world sprite + tween, the same shape as how rain streaks or
// lightning already work, not another texture-bake variant.
const RAIN_RIPPLE_BASE_KEY = 'water_full';
// Density scales with getRainEffectTier() (sim-weather.js) - the same tier already
// driving rain particle density and lightning frequency, so ripples get busier and
// thin out in lockstep with the rest of the storm rather than being rolled
// independently. Heavy/extreme also spawn more than one ripple per tick - shortening
// the interval alone hits a point of diminishing returns (each ripple's own ~1s
// lifespan caps how "busy" a single-spawn-at-a-time model can ever look), so a real
// downpour needs multiple drops landing at once, not just landing faster.
const RAIN_RIPPLE_CONFIG = {
  none: null,
  light: { intervalMs: 450, spawnCount: 1 },
  moderate: { intervalMs: 260, spawnCount: 1 },
  heavy: { intervalMs: 180, spawnCount: 2 },
  extreme: { intervalMs: 120, spawnCount: 3 },
};

function generateRippleRingTexture(scene) {
  if (scene.textures.exists('fx_ripple_ring')) return;
  // A ripple is a circle lying flat on the ground plane, and this map is a 2:1
  // isometric projection (TILE_WIDTH:TILE_HEIGHT, main.js:2-3) - a flat circle drawn
  // as an actual circle here would read as a ring tilted up off the water, not lying
  // on it. Draw it circular in a squashed coordinate space instead, so the baked
  // texture itself comes out a 2:1 ellipse and stays that shape through the tween's
  // uniform scale-up.
  const w = 44;
  const h = 22;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const r = w / 2 - 3;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(1, h / w);
  // A ring, not a filled disc: transparent center and outside, a soft bright band
  // partway out - a raindrop's ripple, not a splash of paint.
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.68, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.82, 'rgba(255,255,255,0.7)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  scene.textures.addCanvas('fx_ripple_ring', canvas);
}

// A few random probes into the already-culled visible-tile set, not a scan of it -
// good enough odds of landing on open water whenever there's a meaningful amount of
// it on screen, without paying for a full pass on every spawn tick.
function pickVisibleRainRippleTile(scene) {
  const ids = scene?.activeTerrainSpriteIds;
  if (!ids?.size) return null;
  const idArray = Array.from(ids);
  for (let attempt = 0; attempt < 6; attempt++) {
    const id = idArray[Math.floor(Math.random() * idArray.length)];
    const row = Math.floor(id / MAP_WIDTH);
    const col = id % MAP_WIDTH;
    if (resolveTileTextureKey(getTileKey(row, col)) === RAIN_RIPPLE_BASE_KEY) return { row, col };
  }
  return null;
}

function spawnRainRipple(scene) {
  const tile = pickVisibleRainRippleTile(scene);
  if (!tile) return;
  const { row, col } = tile;
  const pos = isoToScreen(col, row);
  // Scatter within the tile's own footprint rather than always its exact anchor
  // point, so ripples don't all line up on the same isometric grid dot.
  const x = pos.x + scene.offsetX + (Math.random() - 0.5) * TILE_WIDTH * 0.7;
  const y = pos.y + scene.offsetY + TILE_HEIGHT * 0.5 + (Math.random() - 0.5) * TILE_HEIGHT * 0.5;
  const ring = scene.add.image(x, y, 'fx_ripple_ring');
  // getTerrainTileDepth() + 1 put this in the 'terrain' depth band (WORLD_LAYER_DEPTHS,
  // main.js:349-354) alongside the water tiles themselves - a neighbouring tile whose
  // own baseY happens to be even slightly higher paints right over a "+1" offset,
  // which is exactly why debris/tree sprites use the 'object' band instead
  // (placeDebrisSprite, main.js:7098) despite also sitting on open terrain. Same fix
  // here: object band is always above every terrain tile, not just this one +1 unit.
  ring.setDepth(getObjectTileDepth(row, col, y));
  ring.setMask(scene.worldMask);
  ring.setBlendMode('ADD');
  ring.setScale(0.3);
  ring.setAlpha(0.55);
  scene.tweens.add({
    targets: ring,
    scale: 1.15,
    alpha: 0,
    duration: 850 + Math.random() * 300,
    ease: 'Sine.easeOut',
    onComplete: () => ring.destroy(),
  });
}

// Rides the same isWeatherEffectsEnabled() toggle that already gates rain
// particles/lightning (main.js:104) - ripples are visual load tied directly to rain,
// so a player turning that off to save performance should lose these too, not need
// a second switch for the same storm.
function updateRainRipples(scene, time) {
  if (!scene || !isWeatherEffectsEnabled()) return;
  const tier = typeof getRainEffectTier === 'function' ? getRainEffectTier() : 'none';
  const config = RAIN_RIPPLE_CONFIG[tier];
  if (!config) return;
  if (scene.rainRippleNextSpawnAt === undefined) scene.rainRippleNextSpawnAt = 0;
  if (time < scene.rainRippleNextSpawnAt) return;
  scene.rainRippleNextSpawnAt = time + config.intervalMs;
  if (!scene.textures.exists('fx_ripple_ring')) generateRippleRingTexture(scene);
  for (let i = 0; i < config.spawnCount; i++) spawnRainRipple(scene);
}
