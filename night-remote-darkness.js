// Darker nights away from the city (View menu toggle, calibrated in 校正工具 → 燈光).
//
// The night darkness in main.js (applyNightDarkness) is two full-screen passes with one alpha
// each, so a mountain or open sea far from any street is exactly as bright as the tile next to
// a lit tower. This adds a third, map-shaped pass: one textured quad laid over the ground (same
// depth band as scene.groundNightOverlay) whose texture is a 1-texel-per-tile "distance from the
// city" field. Near buildings and roads it is transparent - the city keeps today's look - and
// it fades to FAR_BRIGHTNESS of the daylight over a few tiles further out.
//
// Cost: one draw call per frame. The field (a two-pass chamfer distance transform over the
// 256x256 grid, ~2 ms) is only recomputed when the set of lit tiles actually changes; GPU
// bilinear filtering of the 256x256 texture gives the smooth fade for free. Trees and other
// unlit props in the object band sample the same field when their night tint is applied.

// Shipped values. The calibrator's "複製 JSON" output pastes over this.
const NIGHT_REMOTE_DARKNESS_DEFAULTS = Object.freeze({
  // Remaining light (1 = daylight) on ground far from the city at the ordinary night peak. The
  // city itself sits at 1 - NIGHT_DARKNESS_PEAK = 0.38 there.
  farBrightness: 0.27,
  // ... and in the small hours (getDeepNightDepth), where the city settles to 0.29.
  deepFarBrightness: 0.19,
  // Tiles from the nearest building or road that still get the full city light.
  litRadius: 2,
  // Tiles over which it then fades down to the far brightness.
  fadeTiles: 8,
});
const NIGHT_REMOTE_DARKNESS_LIMITS = Object.freeze({
  farBrightness: [0.05, 0.6],
  deepFarBrightness: [0.05, 0.6],
  litRadius: [0, 12],
  fadeTiles: [1, 40],
});
const NIGHT_REMOTE_DARKNESS_SETTING_KEY = 'citybuilder.nightRemoteDarkness.v1';
const NIGHT_REMOTE_DARKNESS_CALIBRATION_KEY = 'night-remote-darkness-calibration:v1';
const NIGHT_REMOTE_DARKNESS_TEXTURE_KEY = 'fx_night_remote_darkness';
const NIGHT_REMOTE_DARKNESS_COLOR = 0x020713; // same as the ground / atmosphere passes
// A change of roads or buildings bumps the lit-tile version and is picked up this soon after;
// anything that slipped past the version bumps is caught by the slower full re-check.
const NIGHT_REMOTE_DARKNESS_CHECK_MS = 400;
const NIGHT_REMOTE_DARKNESS_RESCAN_MS = 10000;
// Calibrator preview: the field drawn in daylight, strongly, so its shape can be judged.
const NIGHT_REMOTE_DARKNESS_PREVIEW_COLOR = 0xff2a8a;
const NIGHT_REMOTE_DARKNESS_PREVIEW_ALPHA = 0.7;

let nightRemoteDarknessEnabledCache = null;
let nightRemoteDarknessPreview = false;
const nightRemoteDarknessOverrides = loadNightRemoteDarknessOverrides();

function clampNightRemoteValue(name, value) {
  const [min, max] = NIGHT_REMOTE_DARKNESS_LIMITS[name];
  const number = Number(value);
  if (!Number.isFinite(number)) return NIGHT_REMOTE_DARKNESS_DEFAULTS[name];
  return Math.max(min, Math.min(max, number));
}

function loadNightRemoteDarknessOverrides() {
  try {
    const raw = globalThis.localStorage?.getItem(NIGHT_REMOTE_DARKNESS_CALIBRATION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const out = {};
    Object.keys(NIGHT_REMOTE_DARKNESS_DEFAULTS).forEach((name) => {
      if (parsed[name] !== undefined) out[name] = clampNightRemoteValue(name, parsed[name]);
    });
    return out;
  } catch {
    return {};
  }
}

function persistNightRemoteDarknessOverrides() {
  try {
    if (Object.keys(nightRemoteDarknessOverrides).length) {
      globalThis.localStorage?.setItem(NIGHT_REMOTE_DARKNESS_CALIBRATION_KEY, JSON.stringify(nightRemoteDarknessOverrides));
    } else {
      globalThis.localStorage?.removeItem(NIGHT_REMOTE_DARKNESS_CALIBRATION_KEY);
    }
  } catch { /* storage unavailable */ }
}

function getNightRemoteDarknessSettings() {
  return { ...NIGHT_REMOTE_DARKNESS_DEFAULTS, ...nightRemoteDarknessOverrides };
}

// Calibrator entry point. Pass null to drop one override, or no patch to drop them all.
function setNightRemoteDarknessSettings(patch, scene = typeof activeScene !== 'undefined' ? activeScene : null) {
  const before = getNightRemoteDarknessSettings();
  if (!patch) {
    Object.keys(nightRemoteDarknessOverrides).forEach((name) => delete nightRemoteDarknessOverrides[name]);
  } else {
    Object.entries(patch).forEach(([name, value]) => {
      if (!(name in NIGHT_REMOTE_DARKNESS_DEFAULTS)) return;
      if (value === null) delete nightRemoteDarknessOverrides[name];
      else nightRemoteDarknessOverrides[name] = clampNightRemoteValue(name, value);
    });
  }
  persistNightRemoteDarknessOverrides();
  const after = getNightRemoteDarknessSettings();
  if (scene) {
    if (before.litRadius !== after.litRadius || before.fadeTiles !== after.fadeTiles) {
      // the shape changed: force a rebuild on the next lighting tick
      scene.__nightRemoteMask = null;
    }
    refreshNightRemoteDarkness(scene);
  }
  return after;
}

function isNightRemoteDarknessEnabled() {
  if (nightRemoteDarknessEnabledCache !== null) return nightRemoteDarknessEnabledCache;
  try {
    const raw = globalThis.localStorage?.getItem(NIGHT_REMOTE_DARKNESS_SETTING_KEY);
    nightRemoteDarknessEnabledCache = raw === null || raw === undefined ? true : JSON.parse(raw) !== false;
  } catch {
    nightRemoteDarknessEnabledCache = true;
  }
  return nightRemoteDarknessEnabledCache;
}

function setNightRemoteDarknessEnabled(enabled, scene = typeof activeScene !== 'undefined' ? activeScene : null) {
  nightRemoteDarknessEnabledCache = !!enabled;
  try {
    globalThis.localStorage?.setItem(NIGHT_REMOTE_DARKNESS_SETTING_KEY, JSON.stringify(!!enabled));
  } catch { /* storage unavailable */ }
  if (scene) refreshNightRemoteDarkness(scene);
  return nightRemoteDarknessEnabledCache;
}

function isNightRemoteDarknessPreviewActive() {
  return nightRemoteDarknessPreview;
}

function setNightRemoteDarknessPreview(enabled, scene = typeof activeScene !== 'undefined' ? activeScene : null) {
  nightRemoteDarknessPreview = !!enabled;
  if (scene) refreshNightRemoteDarkness(scene);
  return nightRemoteDarknessPreview;
}

// Re-run the lighting tick now (and re-tint the props) after a setting changed.
function refreshNightRemoteDarkness(scene) {
  scene.__nightTintStep = null;
  if (typeof updateDynamicLighting === 'function') updateDynamicLighting(scene);
}

// Roads, bridges or buildings changed somewhere; main.js calls this from the placement paths.
function markNightRemoteDarknessDirty(scene) {
  if (scene) scene.__nightRemoteVersion = (scene.__nightRemoteVersion || 0) + 1;
}

// ── Pure maths (unit-tested) ────────────────────────────────────────────────

// The extra pass's alpha at full strength (far from the city), chosen so that ground under all
// three passes lands on the far brightness: (1 - total)(1 - extra) = farBrightness, scaled along
// the same keyframe curve as the city passes so it fades in at dusk and out at dawn with them.
function computeNightRemoteExtraAlpha(rawNightAlpha, deepNightDepth, total, settings = getNightRemoteDarknessSettings()) {
  const keyframePeak = typeof NIGHT_KEYFRAME_PEAK === 'number' ? NIGHT_KEYFRAME_PEAK : 0.54;
  const raw = Math.max(0, Math.min(keyframePeak, Number(rawNightAlpha) || 0));
  if (raw <= 0) return 0;
  const depth = Math.max(0, Math.min(1, Number(deepNightDepth) || 0));
  const farBrightness = settings.farBrightness + (settings.deepFarBrightness - settings.farBrightness) * depth;
  const farTotal = (raw / keyframePeak) * (1 - farBrightness);
  const cityTotal = Math.max(0, Math.min(0.999, Number(total) || 0));
  if (farTotal <= cityTotal) return 0;
  return Math.max(0, Math.min(1, 1 - (1 - farTotal) / (1 - cityTotal)));
}

// 0 on and near lit tiles, easing (smoothstep) to 1 at litRadius + fadeTiles and beyond.
// `lit` is a width*height Uint8Array, row-major. Returns a Float32Array of the same shape.
function computeNightRemoteField(lit, width, height, litRadius, fadeTiles) {
  const size = width * height;
  const dist = new Float32Array(size);
  const far = 1e6;
  for (let i = 0; i < size; i++) dist[i] = lit[i] ? 0 : far;
  const DIAG = Math.SQRT2;
  // Two-pass chamfer (1, sqrt 2): close enough to Euclidean for a soft glow, O(n).
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const i = r * width + c;
      let d = dist[i];
      if (d === 0) continue;
      if (c > 0 && dist[i - 1] + 1 < d) d = dist[i - 1] + 1;
      if (r > 0) {
        const up = i - width;
        if (dist[up] + 1 < d) d = dist[up] + 1;
        if (c > 0 && dist[up - 1] + DIAG < d) d = dist[up - 1] + DIAG;
        if (c < width - 1 && dist[up + 1] + DIAG < d) d = dist[up + 1] + DIAG;
      }
      dist[i] = d;
    }
  }
  for (let r = height - 1; r >= 0; r--) {
    for (let c = width - 1; c >= 0; c--) {
      const i = r * width + c;
      let d = dist[i];
      if (d === 0) continue;
      if (c < width - 1 && dist[i + 1] + 1 < d) d = dist[i + 1] + 1;
      if (r < height - 1) {
        const down = i + width;
        if (dist[down] + 1 < d) d = dist[down] + 1;
        if (c < width - 1 && dist[down + 1] + DIAG < d) d = dist[down + 1] + DIAG;
        if (c > 0 && dist[down - 1] + DIAG < d) d = dist[down - 1] + DIAG;
      }
      dist[i] = d;
    }
  }
  const radius = Math.max(0, Number(litRadius) || 0);
  const fade = Math.max(0.001, Number(fadeTiles) || 0);
  const field = dist; // reuse the buffer
  for (let i = 0; i < size; i++) {
    const t = Math.max(0, Math.min(1, (dist[i] - radius) / fade));
    field[i] = t * t * (3 - 2 * t);
  }
  return field;
}

// ── Scene side ──────────────────────────────────────────────────────────────

// Lit tiles in the current *view* orientation (the texture is laid out the way isoToScreen draws
// the map, so a rotation only re-fills it and the quad never turns).
function collectNightRemoteLitMask(scene) {
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  const odd = rotation === 1 || rotation === 3;
  const width = odd ? MAP_HEIGHT : MAP_WIDTH;
  const height = odd ? MAP_WIDTH : MAP_HEIGHT;
  const lit = new Uint8Array(width * height);
  const mark = (row, col) => {
    if (row < 0 || col < 0 || row >= MAP_HEIGHT || col >= MAP_WIDTH) return;
    let vizCol = col;
    let vizRow = row;
    if (rotation === 1) { vizCol = MAP_HEIGHT - 1 - row; vizRow = col; }
    else if (rotation === 2) { vizCol = MAP_WIDTH - 1 - col; vizRow = MAP_HEIGHT - 1 - row; }
    else if (rotation === 3) { vizCol = row; vizRow = MAP_WIDTH - 1 - col; }
    lit[vizRow * width + vizCol] = 1;
  };
  const bridges = typeof bridgeMap !== 'undefined' ? bridgeMap : null;
  for (let row = 0; row < MAP_HEIGHT; row++) {
    const mapRow = mapData[row];
    const bridgeRow = bridges?.[row];
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (mapRow[col] === ROAD || bridgeRow?.[col]) mark(row, col);
    }
  }
  // one entry per footprint tile, keyed "row:col"
  scene.buildingSprites?.forEach((_sprite, tileId) => {
    const split = tileId.indexOf(':');
    mark(Number(tileId.slice(0, split)), Number(tileId.slice(split + 1)));
  });
  return { lit, width, height, rotation };
}

function sameNightRemoteMask(a, b) {
  if (!a || !b || a.width !== b.width || a.height !== b.height || a.rotation !== b.rotation) return false;
  const x = a.lit;
  const y = b.lit;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

function createNightRemoteDarknessLayer(scene) {
  if (!scene?.add?.container || !scene.textures) return null;
  if (scene.textures.exists(NIGHT_REMOTE_DARKNESS_TEXTURE_KEY)) scene.textures.remove(NIGHT_REMOTE_DARKNESS_TEXTURE_KEY);
  const texture = scene.textures.createCanvas(NIGHT_REMOTE_DARKNESS_TEXTURE_KEY, MAP_WIDTH, MAP_HEIGHT);
  // One texel per tile, square in grid space: rotate 45 degrees, then squash the container to the
  // 2:1 isometric diamond. (1, 0) -> (50, 25) and (0, 1) -> (-50, 25), exactly like isoToScreen.
  const image = scene.add.image(0, 0, NIGHT_REMOTE_DARKNESS_TEXTURE_KEY);
  image.setOrigin(0, 0);
  image.setRotation(Math.PI / 4);
  image.setScale((TILE_WIDTH / 2) * Math.SQRT2);
  image.setTint(NIGHT_REMOTE_DARKNESS_COLOR);
  const container = scene.add.container(0, 0, [image]);
  container.setScale(1, TILE_HEIGHT / TILE_WIDTH);
  // Just above the ground night pass, still under every building, tree and vehicle.
  container.setDepth(getWorldDepth('object') - 0.5);
  container.setVisible(false);
  scene.nightRemoteDarknessLayer = { container, image, texture };
  scene.__nightRemoteMask = null;
  scene.__nightRemoteField = null;
  scene.nightRemoteExtraAlpha = 0;
  return scene.nightRemoteDarknessLayer;
}

function rebuildNightRemoteDarknessTexture(scene, mask) {
  const layer = scene.nightRemoteDarknessLayer;
  if (!layer) return;
  const settings = getNightRemoteDarknessSettings();
  const field = computeNightRemoteField(mask.lit, mask.width, mask.height, settings.litRadius, settings.fadeTiles);
  const { texture } = layer;
  if (texture.width !== mask.width || texture.height !== mask.height) texture.setSize(mask.width, mask.height);
  const context = texture.getContext();
  const imageData = context.createImageData(mask.width, mask.height);
  const data = imageData.data;
  for (let i = 0, p = 0; i < field.length; i++, p += 4) {
    data[p] = 255;
    data[p + 1] = 255;
    data[p + 2] = 255;
    data[p + 3] = Math.round(field[i] * 255);
  }
  context.putImageData(imageData, 0, 0);
  texture.refresh();
  scene.__nightRemoteMask = mask;
  scene.__nightRemoteField = { field, width: mask.width, height: mask.height };
  // props sample the field for their tint: make the next tint pass look again
  scene.__nightTintStep = null;
}

function syncNightRemoteDarknessField(scene) {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const version = scene.__nightRemoteVersion || 0;
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  const stale = !scene.__nightRemoteMask
    || scene.__nightRemoteMask.rotation !== rotation
    || (version !== scene.__nightRemoteCheckedVersion && now >= (scene.__nightRemoteNextCheckAt || 0))
    || now >= (scene.__nightRemoteNextRescanAt || 0);
  if (!stale) return;
  scene.__nightRemoteCheckedVersion = version;
  scene.__nightRemoteNextCheckAt = now + NIGHT_REMOTE_DARKNESS_CHECK_MS;
  scene.__nightRemoteNextRescanAt = now + NIGHT_REMOTE_DARKNESS_RESCAN_MS;
  const mask = collectNightRemoteLitMask(scene);
  if (!sameNightRemoteMask(mask, scene.__nightRemoteMask)) rebuildNightRemoteDarknessTexture(scene, mask);
}

// Called from applyNightDarkness every lighting tick (10/s).
function updateNightRemoteDarkness(scene, rawNightAlpha, deepNightDepth, total) {
  const layer = scene?.nightRemoteDarknessLayer;
  if (!layer) return;
  const preview = nightRemoteDarknessPreview;
  const extra = isNightRemoteDarknessEnabled()
    ? computeNightRemoteExtraAlpha(rawNightAlpha, deepNightDepth, total)
    : 0;
  if (Math.abs(extra - (scene.nightRemoteExtraAlpha || 0)) > 1e-4) {
    // the tint bucket in applyNightObjectTint already moves with raw/depth, but a toggle or a
    // calibrator change can move this alone
    if (!extra || !scene.nightRemoteExtraAlpha) scene.__nightTintStep = null;
  }
  scene.nightRemoteExtraAlpha = extra;
  if (extra <= 0 && !preview) {
    layer.container.setVisible(false);
    return;
  }
  syncNightRemoteDarknessField(scene);
  layer.container.setPosition(ORIGIN_X + (scene.offsetX || 0), (scene.offsetY || 0) - TILE_HEIGHT);
  layer.image.setTint(preview ? NIGHT_REMOTE_DARKNESS_PREVIEW_COLOR : NIGHT_REMOTE_DARKNESS_COLOR);
  layer.container.setAlpha(preview ? NIGHT_REMOTE_DARKNESS_PREVIEW_ALPHA : extra);
  layer.container.setVisible(true);
}

// How much extra darkness a world position gets (0..1): the pass alpha times the field there.
// Used by the prop night tint; a nearest-tile lookup is plenty under a fade this wide.
function getNightRemoteDimAt(scene, worldX, worldY) {
  const extra = scene?.nightRemoteExtraAlpha || 0;
  const info = scene?.__nightRemoteField;
  if (extra <= 0 || !info) return 0;
  // Inverse of isoToScreen in the texture's own (view) orientation. Sprites sit on their tile's
  // bottom vertex (origin 0.5, 1), which is the tile centre plus half a tile down.
  const x = (worldX - (scene.offsetX || 0) - ORIGIN_X) / (TILE_WIDTH / 2);
  const y = (worldY - (scene.offsetY || 0) + TILE_HEIGHT / 2) / (TILE_HEIGHT / 2);
  const col = Math.floor((x + y) / 2);
  const row = Math.floor((y - x) / 2);
  const c = Math.max(0, Math.min(info.width - 1, col));
  const r = Math.max(0, Math.min(info.height - 1, row));
  return extra * info.field[r * info.width + c];
}

// Multiplies each channel of a 0xRRGGBB tint by `factor`.
function scaleNightTint(tint, factor) {
  const k = Math.max(0, Math.min(1, factor));
  return (Math.round(((tint >> 16) & 0xff) * k) << 16)
    | (Math.round(((tint >> 8) & 0xff) * k) << 8)
    | Math.round((tint & 0xff) * k);
}

const nightRemoteDarknessApi = {
  NIGHT_REMOTE_DARKNESS_DEFAULTS,
  NIGHT_REMOTE_DARKNESS_LIMITS,
  computeNightRemoteExtraAlpha,
  computeNightRemoteField,
  getNightRemoteDarknessSettings,
  setNightRemoteDarknessSettings,
  isNightRemoteDarknessEnabled,
  setNightRemoteDarknessEnabled,
  isNightRemoteDarknessPreviewActive,
  setNightRemoteDarknessPreview,
  markNightRemoteDarknessDirty,
  createNightRemoteDarknessLayer,
  updateNightRemoteDarkness,
  getNightRemoteDimAt,
  scaleNightTint,
};

if (typeof module !== 'undefined' && module.exports) module.exports = nightRemoteDarknessApi;

if (typeof globalThis !== 'undefined') Object.assign(globalThis, nightRemoteDarknessApi);
