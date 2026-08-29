// Night building lighting - v1. Design: building-night-lighting artifact.
//
// Philosophy carried from the vehicle lamps: fake the light, never cast it. A
// building's lit windows are a pure function of (tile seed, game time bucket),
// so nothing is saved and a reload reproduces the same skyline. The frame loop
// never iterates windows - it only drains a small relight queue when a bucket
// boundary is crossed or a building scrolls into view, and does nothing at all
// by day.
//
// Four light kinds (v1 ships the first three): window grid, entrance glow,
// all-night service floor. Signage and ground floodlights are v1.1 - the
// profile fields exist but are not rendered yet.

const BUILDING_LIGHT_CONFIG = Object.freeze({
  windowDotTextureKey: 'fx_building_window',
  entranceTextureKey: 'fx_building_entrance',
  nightOnsetAlpha: 0.02,
  nightFullAlpha: 0.30,
  visibleThreshold: 0.02,
  // Option A (locked): the glow renders under the full-screen night overlay, so
  // its brightness is boosted to punch through the <=0.30 alpha dimming.
  punchThrough: 1.55,
  relightsPerFrame: 4,
  // Each building re-rolls a few windows on its own staggered timer so the
  // pattern breathes without animating.
  jitterMinMs: 22000,
  jitterMaxMs: 52000,
  corridorAlpha: 0.34,
});

// Warm homes, cool offices, dim amber sheds, clinical white for 24h services.
const BUILDING_LIGHT_CLASS_COLOR = Object.freeze({
  res: 0xffcf87,
  off: 0xdfe8ff,
  ind: 0xffe0b0,
  svc: 0xeef3ff,
});

const BUILDING_LIGHT_BUCKETS = Object.freeze([
  'day', 'duskRamp', 'eveningPeak', 'lateEvening', 'deepNight', 'dawnFade',
]);

// Target lit ratio per bucket, per class. Services follow the office curve but
// are floored (below). Personality bias (+-0.12) is added on top per building.
const BUILDING_LIGHT_SCHEDULE = Object.freeze({
  day: Object.freeze({ res: 0, off: 0, ind: 0 }),
  duskRamp: Object.freeze({ res: 0.14, off: 0.38, ind: 0.10 }),
  eveningPeak: Object.freeze({ res: 0.32, off: 0.42, ind: 0.12 }),
  lateEvening: Object.freeze({ res: 0.20, off: 0.15, ind: 0.06 }),
  deepNight: Object.freeze({ res: 0.06, off: 0.05, ind: 0.03 }),
  dawnFade: Object.freeze({ res: 0.08, off: 0.06, ind: 0.03 }),
});
const BUILDING_LIGHT_SERVICE_FLOOR = Object.freeze({
  day: 0, duskRamp: 0.20, eveningPeak: 0.20, lateEvening: 0.18, deepNight: 0.15, dawnFade: 0.10,
});

// 24h-lit building types (get the service floor + guaranteed corridor windows).
const BUILDING_LIGHT_SERVICE_TYPES = new Set([
  'hospital', 'clinic', 'fire_station', 'police_station', 'police_head',
  'convenience_store', 'convenience', 'ambulance_depot',
]);
const BUILDING_LIGHT_RESIDENTIAL_TYPES = new Set(['residential']);
const BUILDING_LIGHT_INDUSTRIAL_TYPES = new Set(['industrial']);

// ---------------------------------------------------------------------------
// Deterministic noise
// ---------------------------------------------------------------------------

function hashBuildingLight(a, b, c) {
  let h = (Math.imul(a >>> 0, 374761393)
    + Math.imul(b >>> 0, 668265263)
    + Math.imul(c >>> 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function getBuildingLightSeed(row, col) {
  return (Math.imul((Number(row) | 0) + 2166136261, 16777619)
    ^ Math.imul((Number(col) | 0) + 2166136261, 2246822519)) >>> 0;
}

function getBuildingLightPersonality(seed) {
  const s = seed >>> 0;
  return {
    occupancyBias: (hashBuildingLight(s, 11, 0) - 0.5) * 0.24,
    jitterPhase: hashBuildingLight(s, 12, 0),
    corridorCol: hashBuildingLight(s, 13, 0),
    warmShift: (hashBuildingLight(s, 14, 0) - 0.5) * 0.12,
  };
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

function getBuildingLightBucket(minutes, sunriseMin, sunsetMin) {
  const m = (((Number(minutes) || 0) % 1440) + 1440) % 1440;
  const sr = Number.isFinite(sunriseMin) ? sunriseMin : 390;
  const ss = Number.isFinite(sunsetMin) ? sunsetMin : 1110;
  if (m >= sr && m < ss) return 'day';
  const afterSunset = (m - ss + 1440) % 1440;
  if (afterSunset < 45) return 'duskRamp';
  const beforeSunrise = (sr - m + 1440) % 1440;
  if (beforeSunrise < 60) return 'dawnFade';
  if (m >= 60 && m < 300) return 'deepNight';       // 01:00 - 05:00
  if (m >= 22 * 60 || m < 60) return 'lateEvening'; // 22:00 - 01:00
  return 'eveningPeak';                             // dusk+45 .. 22:00
}

function getBuildingLightTargetRatio(bucket, cls, personality) {
  const row = BUILDING_LIGHT_SCHEDULE[bucket] || BUILDING_LIGHT_SCHEDULE.day;
  let base = cls === 'res' ? row.res : cls === 'ind' ? row.ind : row.off;
  if (cls === 'svc') base = Math.max(base, BUILDING_LIGHT_SERVICE_FLOOR[bucket] || 0);
  const biased = base + (personality?.occupancyBias || 0);
  return Math.max(0, Math.min(1, biased));
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

// A building's window area is described as one or two PANELS - the visible
// isometric wall faces. Each panel is a parallelogram given by four normalised
// texture corners [tl, tr, br, bl] (0..1, texture origin top-left); the grid is
// laid out by bilinear interpolation inside it, so a row of windows follows the
// 1:2 iso slope and a column stays vertical. entrance x/y/r is a single
// normalised point + radius. Everything is texture-size independent.
function bilerpBuildingLight(corners, u, v) {
  const tl = corners[0];
  const tr = corners[1];
  const br = corners[2];
  const bl = corners[3];
  const a = 1 - u;
  const b = 1 - v;
  return [
    a * b * tl[0] + u * b * tr[0] + u * v * br[0] + a * v * bl[0],
    a * b * tl[1] + u * b * tr[1] + u * v * br[1] + a * v * bl[1],
  ];
}

// Two parallelograms meeting at the near vertical edge (x = 0.5), each slanted
// at the 1:2 iso rate. Rows/heights vary by class; sheds (ind) show one face.
function defaultBuildingLightPanels(cls) {
  const near = 0.5;
  const farL = 0.15;
  const farR = 0.85;
  const shed = cls === 'ind';
  const topN = shed ? 0.5 : 0.28;
  const botN = shed ? 0.8 : 0.72;
  const topF = shed ? 0.4 : 0.11;
  const botF = shed ? 0.62 : 0.56;
  const rows = cls === 'off' ? 12 : cls === 'res' ? 9 : cls === 'svc' ? 5 : 2;
  const cols = shed ? 6 : 5;
  return [
    { corners: [[farL, topF], [near, topN], [near, botN], [farL, botF]], rows, cols, on: true },
    { corners: [[near, topN], [farR, topF], [farR, botF], [near, botN]], rows, cols, on: !shed },
  ];
}

function makeBuildingLightProfile(o = {}) {
  const cls = o.class || 'off';
  const src = (Array.isArray(o.panels) && o.panels.length) ? o.panels : defaultBuildingLightPanels(cls);
  const panels = src.map((p) => {
    const corners = (p.corners || p.c || [[0, 0], [1, 0], [1, 1], [0, 1]])
      .map((pt) => Object.freeze([Number(pt[0]) || 0, Number(pt[1]) || 0]));
    return Object.freeze({
      corners: Object.freeze(corners),
      rows: Math.max(1, Math.round(p.rows ?? 8)),
      cols: Math.max(1, Math.round(p.cols ?? 5)),
      on: p.on !== false,
    });
  });
  return Object.freeze({
    class: cls,
    color: o.color ?? BUILDING_LIGHT_CLASS_COLOR[cls],
    panels: Object.freeze(panels),
    entrance: o.entrance === null ? null : Object.freeze({
      x: o.ex ?? 0.5, y: o.ey ?? 0.9, r: o.er ?? 0.1,
    }),
    service: !!o.service,
    hasSignage: !!o.hasSignage,   // v1.1 render
    hasFloodlight: !!o.hasFloodlight, // v1.1 render
  });
}

const BUILDING_LIGHT_CLASS_DEFAULTS = Object.freeze({
  res: makeBuildingLightProfile({ class: 'res' }),
  off: makeBuildingLightProfile({ class: 'off' }),
  ind: makeBuildingLightProfile({ class: 'ind', entrance: null }),
  svc: makeBuildingLightProfile({ class: 'svc', service: true }),
});

// Calibrated per-family profiles, baked from building-light-calibrator.js.
// Empty until the first calibration pass; families fall back to the class
// default above.
const BUILDING_LIGHT_PROFILES = {};

function getBuildingLightClass(record) {
  const t = record?.type;
  if (BUILDING_LIGHT_RESIDENTIAL_TYPES.has(t)) return 'res';
  if (BUILDING_LIGHT_INDUSTRIAL_TYPES.has(t)) return 'ind';
  if (BUILDING_LIGHT_SERVICE_TYPES.has(t)) return 'svc';
  return 'off';
}

function getBuildingLightFamily(record) {
  const t = record?.type;
  const foot = Math.max(1, Math.min(5, Number(record?.footprintCols) || 1));
  if (t === 'residential' || t === 'commercial' || t === 'industrial') return `${t}${foot}`;
  return t || 'unknown';
}

function resolveBuildingLightProfile(record, spriteKey) {
  const family = getBuildingLightFamily(record);
  const override = typeof getBuildingLightCalibrationOverride === 'function'
    ? getBuildingLightCalibrationOverride(spriteKey, family)
    : null;
  if (override) return override;
  return BUILDING_LIGHT_PROFILES[family]
    || BUILDING_LIGHT_CLASS_DEFAULTS[getBuildingLightClass(record)]
    || BUILDING_LIGHT_CLASS_DEFAULTS.off;
}

// ---------------------------------------------------------------------------
// Window grid -> lit cells (the only "matrix", touched only on relight)
// ---------------------------------------------------------------------------

// Corridor windows: one vertical column, in the first active panel, alternate
// rows. Always lit while the building is dark-side - stops it going fully black.
function buildingLightCorridorCol(panel, personality) {
  return Math.max(0, Math.min(panel.cols - 1,
    Math.floor((personality?.corridorCol ?? 0.5) * panel.cols)));
}

// One entry per grid cell of every active panel:
//   { on, alpha, nx, ny, panel, cellW, cellH }
// nx/ny are the bilinear cell centre in normalised texture space; cellW/cellH
// are the cell's normalised footprint (for sizing the glow stamp).
function computeLitBuildingWindows(profile, seed, bucket, jitterNonce, personality) {
  const s = seed >>> 0;
  const pers = personality || getBuildingLightPersonality(s);
  const cls = profile.service ? 'svc' : (profile.class || 'off');
  const target = getBuildingLightTargetRatio(bucket, cls, pers);
  const dark = bucket !== 'day';
  const nonce = jitterNonce >>> 0;
  const panels = profile.panels || [];
  let corridorPanel = -1;
  for (let pi = 0; pi < panels.length; pi++) { if (panels[pi].on) { corridorPanel = pi; break; } }
  const corridorCol = corridorPanel >= 0
    ? buildingLightCorridorCol(panels[corridorPanel], pers) : -1;
  const out = [];
  for (let pi = 0; pi < panels.length; pi++) {
    const panel = panels[pi];
    if (!panel.on) continue;
    for (let r = 0; r < panel.rows; r++) {
      for (let c = 0; c < panel.cols; c++) {
        const key = pi * 4096 + r * panel.cols + c;
        let on = false;
        let alpha = 0;
        if (dark) {
          if (pi === corridorPanel && c === corridorCol && r % 2 === 0) {
            on = true;
            alpha = BUILDING_LIGHT_CONFIG.corridorAlpha;
          } else if (hashBuildingLight(s, key + 1, nonce) < target) {
            on = true;
            alpha = 0.6 + hashBuildingLight(s, key + 4099, nonce) * 0.32;
          }
        }
        const uv = bilerpBuildingLight(panel.corners, (c + 0.5) / panel.cols, (r + 0.5) / panel.rows);
        out.push({
          on, alpha, nx: uv[0], ny: uv[1], panel: pi,
          cellW: 1 / panel.cols, cellH: 1 / panel.rows,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Strength (mirrors the traffic-lamp cadence: cached once per lighting tick)
// ---------------------------------------------------------------------------

function smoothBuildingLightStep(v) {
  const t = Math.max(0, Math.min(1, Number(v) || 0));
  return t * t * (3 - 2 * t);
}

function computeBuildingLightStrength(nightAlpha, config = BUILDING_LIGHT_CONFIG) {
  const range = Math.max(1e-6, config.nightFullAlpha - config.nightOnsetAlpha);
  return smoothBuildingLightStep(((Number(nightAlpha) || 0) - config.nightOnsetAlpha) / range);
}

function computeRuntimeBuildingLightStrength(scene) {
  const timeMinutes = typeof getGameTimeOfDayMinutes === 'function' ? getGameTimeOfDayMinutes() : 12 * 60;
  const nightAlpha = Number.isFinite(Number(scene?.nightOverlay?.alpha))
    ? Number(scene.nightOverlay.alpha)
    : (typeof getNightOverlayAlpha === 'function' ? getNightOverlayAlpha(timeMinutes) : 0);
  return computeBuildingLightStrength(nightAlpha);
}

function getRuntimeBuildingLightStrength(scene) {
  const cached = Number(scene?.buildingLightStrength);
  return Number.isFinite(cached) ? cached : computeRuntimeBuildingLightStrength(scene);
}

function getRuntimeBuildingLightBucket(scene) {
  const timeMinutes = typeof getGameTimeOfDayMinutes === 'function' ? getGameTimeOfDayMinutes() : 12 * 60;
  const astronomy = typeof getAstronomyVisualDay === 'function' ? getAstronomyVisualDay() : null;
  return getBuildingLightBucket(
    timeMinutes,
    Number(astronomy?.sunriseMinutes),
    Number(astronomy?.sunsetMinutes),
  );
}

// ---------------------------------------------------------------------------
// Shared textures
// ---------------------------------------------------------------------------

function ensureBuildingLightTextures(scene) {
  if (!scene?.textures?.exists || !scene?.make?.graphics) return false;
  const winKey = BUILDING_LIGHT_CONFIG.windowDotTextureKey;
  const entKey = BUILDING_LIGHT_CONFIG.entranceTextureKey;
  if (scene.textures.exists(winKey) && scene.textures.exists(entKey)) return true;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  if (!g) return false;
  if (!scene.textures.exists(winKey)) {
    // A single soft window: a hot centre with a short bloom. Tinted per class
    // at draw time.
    g.fillStyle(0xffffff, 0.10);
    g.fillRect(0, 0, 12, 12);
    g.fillStyle(0xffffff, 0.5);
    g.fillRect(2, 2, 8, 8);
    g.fillStyle(0xffffff, 0.96);
    g.fillRect(3.5, 3.5, 5, 5);
    g.generateTexture(winKey, 12, 12);
    g.clear();
  }
  if (!scene.textures.exists(entKey)) {
    // A soft round pool for the ground-floor entrance.
    g.fillStyle(0xffffff, 0.12);
    g.fillCircle(16, 16, 15);
    g.fillStyle(0xffffff, 0.4);
    g.fillCircle(16, 16, 8);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(16, 16, 3.2);
    g.generateTexture(entKey, 32, 32);
  }
  g.destroy?.();
  return scene.textures.exists(winKey) && scene.textures.exists(entKey);
}

// ---------------------------------------------------------------------------
// Runtime: one RenderTexture glow per visible building, relit on a budget
// ---------------------------------------------------------------------------

function setupBuildingLights(scene) {
  if (!scene) return;
  ensureBuildingLightTextures(scene);
  scene.buildingLightGlows = scene.buildingLightGlows || new Map(); // anchor tileId -> glow state
  scene.buildingLightQueue = scene.buildingLightQueue || [];       // anchor tileIds pending relight
  scene.buildingLightBucket = scene.buildingLightBucket || null;
  scene.buildingLightsActive = false;
}

function destroyBuildingLightGlow(glow) {
  glow?.rt?.destroy?.();
  glow?.entrance?.destroy?.();
}

function clearBuildingLights(scene) {
  scene?.buildingLightGlows?.forEach((glow) => destroyBuildingLightGlow(glow));
  scene?.buildingLightGlows?.clear?.();
  if (scene?.buildingLightQueue) scene.buildingLightQueue.length = 0;
  if (scene) scene.buildingLightsActive = false;
}

// Called from removeBuilding so a bulldozed lot drops its glow immediately.
function releaseBuildingLightGlow(scene, sprite) {
  if (!scene?.buildingLightGlows || !sprite || typeof getTileId !== 'function') return;
  const id = getTileId(sprite.mapRow, sprite.mapCol);
  const glow = scene.buildingLightGlows.get(id);
  if (glow) {
    destroyBuildingLightGlow(glow);
    scene.buildingLightGlows.delete(id);
  }
}

function buildingLightRecordFor(sprite) {
  if (typeof buildingData === 'undefined' || typeof getTileId !== 'function') return null;
  return buildingData[getTileId(sprite.mapRow, sprite.mapCol)] || null;
}

function createBuildingLightGlow(scene, sprite) {
  if (!scene?.add?.renderTexture) return null;
  const w = Math.max(4, Math.round(sprite.width || sprite.displayWidth || 32));
  const h = Math.max(4, Math.round(sprite.height || sprite.displayHeight || 32));
  const rt = scene.add.renderTexture(sprite.x, sprite.y, w, h);
  rt.setOrigin(sprite.originX ?? 0.5, sprite.originY ?? 1);
  rt.setScale(sprite.scaleX || 1, sprite.scaleY || 1);
  rt.setDepth((sprite.depth || 0) + 0.1);
  const additive = typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 'ADD';
  rt.setBlendMode?.(additive);
  if (scene.worldMask) rt.setMask(scene.worldMask);
  if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, rt, 'objectLayer');
  const record = buildingLightRecordFor(sprite);
  const seed = getBuildingLightSeed(sprite.mapRow, sprite.mapCol);
  return {
    rt,
    sprite,
    textureKey: sprite.texture?.key || null,
    entrance: null,
    texW: w,
    texH: h,
    seed,
    personality: getBuildingLightPersonality(seed),
    record,
    lastBucket: null,
    nextJitterAt: 0,
    jitterNonce: (seed % 997) >>> 0,
  };
}

function relightBuildingGlow(scene, sprite, glow, bucket, time) {
  const record = glow.record || buildingLightRecordFor(sprite);
  glow.record = record;
  const profile = resolveBuildingLightProfile(record, sprite.logicalSpriteKey || sprite.renderTextureKey);
  const cells = computeLitBuildingWindows(profile, glow.seed, bucket, glow.jitterNonce, glow.personality);
  const winKey = BUILDING_LIGHT_CONFIG.windowDotTextureKey;
  const rt = glow.rt;
  rt.clear();
  const dotSrc = scene.textures.exists(winKey) ? winKey : null;
  const tint = profile.color;
  if (dotSrc) {
    const img = scene.__buildingLightStamp
      || (scene.__buildingLightStamp = scene.make.image({ key: winKey, add: false }));
    img.setOrigin(0.5, 0.5);
    img.setTint(tint);
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!cell.on) continue;
      const w = Math.max(2, cell.cellW * glow.texW * 0.82);
      const h = Math.max(2, cell.cellH * glow.texH * 0.82);
      img.setAlpha(cell.alpha);
      img.setDisplaySize(w, h);
      rt.draw(img, cell.nx * glow.texW, cell.ny * glow.texH);
    }
  }
  // Entrance glow
  const wantEntrance = profile.entrance
    && bucket !== 'day' && bucket !== 'deepNight' && profile.class !== 'ind';
  if (wantEntrance) {
    if (!glow.entrance) {
      glow.entrance = scene.add.image(0, 0, BUILDING_LIGHT_CONFIG.entranceTextureKey);
      glow.entrance.setBlendMode?.(typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 'ADD');
      if (scene.worldMask) glow.entrance.setMask(scene.worldMask);
      if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, glow.entrance, 'objectLayer');
      glow.entrance.setTint(0xffce93);
    }
    const localX = (profile.entrance.x - (sprite.originX ?? 0.5)) * glow.texW * (sprite.scaleX || 1);
    const localY = (profile.entrance.y - (sprite.originY ?? 1)) * glow.texH * (sprite.scaleY || 1);
    glow.entrance.setPosition(sprite.x + localX, sprite.y + localY);
    glow.entrance.setDisplaySize(
      profile.entrance.r * glow.texW * (sprite.scaleX || 1) * 2.4,
      profile.entrance.r * glow.texW * (sprite.scaleX || 1) * 2.4,
    );
    glow.entrance.setDepth((sprite.depth || 0) + 0.09);
    glow.entrance.setVisible(true);
  } else if (glow.entrance) {
    glow.entrance.setVisible(false);
  }
  glow.lastBucket = bucket;
  const span = BUILDING_LIGHT_CONFIG.jitterMaxMs - BUILDING_LIGHT_CONFIG.jitterMinMs;
  glow.nextJitterAt = time + BUILDING_LIGHT_CONFIG.jitterMinMs + glow.personality.jitterPhase * span;
}

function updateBuildingLights(scene, time) {
  const s = scene || this;
  if (!s?.buildingSprites || typeof getTileId !== 'function') return;
  if (!s.buildingLightGlows) setupBuildingLights(s);

  const strength = getRuntimeBuildingLightStrength(s);

  if (strength <= BUILDING_LIGHT_CONFIG.visibleThreshold) {
    if (s.buildingLightsActive) clearBuildingLights(s);
    return;
  }
  s.buildingLightsActive = true;

  const bucket = getRuntimeBuildingLightBucket(s);
  const bucketChanged = bucket !== s.buildingLightBucket;
  s.buildingLightBucket = bucket;

  const glows = s.buildingLightGlows;
  const queue = s.buildingLightQueue;
  const alpha = Math.min(1, strength * BUILDING_LIGHT_CONFIG.punchThrough);
  const entranceAlpha = Math.min(1, strength * 1.3);
  const jitterEnabled = bucket !== 'day';
  const liveIds = new Set();

  s.buildingSprites.forEach((sprite, key) => {
    if (!sprite || !sprite.active) return;
    const id = getTileId(sprite.mapRow, sprite.mapCol);
    if (key !== id || liveIds.has(id)) return; // once per building, at its anchor tile
    liveIds.add(id);
    let glow = glows.get(id);
    if (glow && (glow.sprite !== sprite || glow.textureKey !== (sprite.texture?.key || null))) {
      // the lot's building was replaced (upgrade) - rebuild from scratch
      destroyBuildingLightGlow(glow);
      glows.delete(id);
      glow = null;
    }
    if (!sprite.visible) {
      if (glow) { destroyBuildingLightGlow(glow); glows.delete(id); }
      return;
    }
    if (!glow) {
      glow = createBuildingLightGlow(s, sprite);
      if (!glow) return;
      glows.set(id, glow);
      if (queue.indexOf(id) === -1) queue.push(id);
      return;
    }
    glow.rt.setAlpha(alpha);
    if (glow.entrance) glow.entrance.setAlpha(entranceAlpha);
    if (bucketChanged || (jitterEnabled && time >= glow.nextJitterAt)) {
      if (queue.indexOf(id) === -1) queue.push(id);
    }
  });

  // drop glows for buildings that scrolled out or were removed
  glows.forEach((glow, id) => {
    if (!liveIds.has(id)) {
      destroyBuildingLightGlow(glow);
      glows.delete(id);
    }
  });

  let budget = BUILDING_LIGHT_CONFIG.relightsPerFrame;
  while (budget-- > 0 && queue.length) {
    const id = queue.shift();
    const glow = glows.get(id);
    if (!glow || !glow.sprite?.visible) continue;
    relightBuildingGlow(s, glow.sprite, glow, bucket, time);
    glow.rt.setAlpha(alpha);
  }
}

// ---------------------------------------------------------------------------

const buildingLightingTestApi = {
  BUILDING_LIGHT_CONFIG,
  BUILDING_LIGHT_BUCKETS,
  BUILDING_LIGHT_SCHEDULE,
  BUILDING_LIGHT_SERVICE_FLOOR,
  BUILDING_LIGHT_CLASS_DEFAULTS,
  BUILDING_LIGHT_CLASS_COLOR,
  BUILDING_LIGHT_PROFILES,
  hashBuildingLight,
  getBuildingLightSeed,
  getBuildingLightPersonality,
  getBuildingLightBucket,
  getBuildingLightTargetRatio,
  makeBuildingLightProfile,
  getBuildingLightClass,
  getBuildingLightFamily,
  resolveBuildingLightProfile,
  bilerpBuildingLight,
  defaultBuildingLightPanels,
  computeLitBuildingWindows,
  computeBuildingLightStrength,
  ensureBuildingLightTextures,
  setupBuildingLights,
  updateBuildingLights,
  clearBuildingLights,
};

if (typeof module !== 'undefined' && module.exports) module.exports = buildingLightingTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    setupBuildingLights,
    updateBuildingLights,
    clearBuildingLights,
    releaseBuildingLightGlow,
    resolveBuildingLightProfile,
    getBuildingLightClass,
    getBuildingLightFamily,
    computeRuntimeBuildingLightStrength,
    getRuntimeBuildingLightBucket,
    computeLitBuildingWindows,
    makeBuildingLightProfile,
    defaultBuildingLightPanels,
    bilerpBuildingLight,
    BUILDING_LIGHT_PROFILES,
    BUILDING_LIGHT_CLASS_DEFAULTS,
  });
}
