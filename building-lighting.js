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
  // Glow LOD. Only the `windowBudget` buildings nearest the camera keep a
  // visible glow at all; the rest are hidden. Night render cost turned out to
  // be a flat ~0.34ms per VISIBLE additive Graphics - a per-object batch flush,
  // independent of the geometry inside it - so the object count is the only
  // thing that moves the number. Measured on one dense night view: 400 glows
  // 165ms, 48 glows 46ms, identical drawn geometry.
  windowBudget: 48,
  // Per-building cap on drawn window cells. A calibrated profile can carry 300+
  // cells, far more than resolves on screen; sampling every Nth cell keeps the
  // pattern and the silhouette while cutting the polygon count. Barely affects
  // frame time on its own (see above) but keeps relight work down.
  maxWindowCells: 40,
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

// A building's window area is described as up to four PANELS - the visible
// isometric wall faces (A/B/C/D). Each panel is a parallelogram given by four
// normalised texture corners [tl, tr, br, bl] (0..1, texture origin top-left);
// the grid is laid out by bilinear interpolation inside it, so a row of windows
// follows the 1:2 iso slope and a column stays vertical.
//   lamps   - [{x,y,r}] soft street/entrance/public-light pools (the always-on
//             layer; an uncalibrated building has exactly one).
//   beacons - [{x,y,color,period}] blinking indicator lights (airport nav /
//             rooftop warning). color is one of BUILDING_LIGHT_BEACON_COLORS.
// Everything is normalised, so a profile is texture-size independent.
const BUILDING_LIGHT_MAX_PANELS = 4;
const BUILDING_LIGHT_PANEL_LABELS = Object.freeze(['A', 'B', 'C', 'D']);
const BUILDING_LIGHT_BEACON_COLORS = Object.freeze({
  red: 0xff3b30, blue: 0x3b82ff, white: 0xf4f8ff, yellow: 0xffd23b, green: 0x39d353,
});
const BUILDING_LIGHT_BEACON_DEFAULT_PERIOD = 1600; // ms per blink

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
  // Explicit panels: [] means "no windows"; omitted means the class default.
  const src = Array.isArray(o.panels) ? o.panels : defaultBuildingLightPanels(cls);
  const panels = src.slice(0, BUILDING_LIGHT_MAX_PANELS).map((p) => {
    const corners = (p.corners || p.c || [[0, 0], [1, 0], [1, 1], [0, 1]])
      .map((pt) => Object.freeze([Number(pt[0]) || 0, Number(pt[1]) || 0]));
    return Object.freeze({
      corners: Object.freeze(corners),
      rows: Math.max(1, Math.round(p.rows ?? 8)),
      cols: Math.max(1, Math.round(p.cols ?? 5)),
      on: p.on !== false,
    });
  });

  // lamps: explicit list wins; else the legacy single ex/ey/er point; else, for
  // an omitted spec, one lamp near the base (entrance: null suppresses it).
  let lamps;
  if (Array.isArray(o.lamps)) {
    lamps = o.lamps;
  } else if (o.entrance === null) {
    lamps = [];
  } else if (o.ex != null || o.ey != null || o.er != null) {
    lamps = [{ x: o.ex ?? 0.5, y: o.ey ?? 0.9, r: o.er ?? 0.1 }];
  } else {
    lamps = [{ x: 0.5, y: 0.9, r: 0.09 }];
  }
  const frozenLamps = Object.freeze(lamps.map((l) => Object.freeze({
    x: Number(l.x) || 0, y: Number(l.y) || 0, r: Math.max(0.01, Number(l.r) || 0.08),
  })));

  const beacons = Object.freeze((Array.isArray(o.beacons) ? o.beacons : []).map((b) => Object.freeze({
    x: Number(b.x) || 0,
    y: Number(b.y) || 0,
    color: BUILDING_LIGHT_BEACON_COLORS[b.color] ? b.color : 'red',
    period: Math.max(200, Number(b.period) || BUILDING_LIGHT_BEACON_DEFAULT_PERIOD),
  })));

  return Object.freeze({
    class: cls,
    color: o.color ?? BUILDING_LIGHT_CLASS_COLOR[cls],
    panels: Object.freeze(panels),
    lamps: frozenLamps,
    beacons,
    service: !!o.service,
    hasSignage: !!o.hasSignage,       // v1.1 render
    hasFloodlight: !!o.hasFloodlight,  // v1.1 render
  });
}

const BUILDING_LIGHT_CLASS_DEFAULTS = Object.freeze({
  res: makeBuildingLightProfile({ class: 'res' }),
  off: makeBuildingLightProfile({ class: 'off' }),
  ind: makeBuildingLightProfile({ class: 'ind', entrance: null }),
  svc: makeBuildingLightProfile({ class: 'svc', service: true }),
});

// What every uncalibrated building gets: no windows, one dim street lamp - so a
// fresh city reads as lit-but-quiet instead of a wall of glowing grids.
const BUILDING_LIGHT_MINIMAL_PROFILE = makeBuildingLightProfile({
  class: 'off', panels: [], lamps: [{ x: 0.5, y: 0.88, r: 0.07 }],
});

// Live calibration store, keyed by sprite key, hydrated from the dedicated
// SQLite table (GET /api/building-light-profiles) at scene setup and updated by
// building-light-calibrator.js on Apply. This is the authoritative source for a
// calibrated model; the baked BUILDING_LIGHT_HERO_PROFILES below are just the
// last export snapshot that ships with a release.
const BUILDING_LIGHT_DB_PROFILES = {};

function setBuildingLightDbProfile(spriteKey, data) {
  if (!spriteKey) return;
  if (data == null) { delete BUILDING_LIGHT_DB_PROFILES[spriteKey]; return; }
  try { BUILDING_LIGHT_DB_PROFILES[spriteKey] = makeBuildingLightProfile(data); }
  catch { /* ignore a malformed entry */ }
}

function loadBuildingLightDbProfiles(entries) {
  Object.keys(BUILDING_LIGHT_DB_PROFILES).forEach((k) => delete BUILDING_LIGHT_DB_PROFILES[k]);
  Object.entries(entries || {}).forEach(([k, d]) => setBuildingLightDbProfile(k, d));
}

async function fetchBuildingLightDbProfiles(scene) {
  if (typeof fetch !== 'function') return;
  try {
    const res = await fetch('/api/building-light-profiles');
    if (!res.ok) return;
    const json = await res.json();
    loadBuildingLightDbProfiles(json && json.entries ? json.entries : {});
    const target = scene || (typeof activeScene !== 'undefined' ? activeScene : null);
    if (target && typeof refreshAllBuildingLightGlows === 'function') {
      refreshAllBuildingLightGlows(target);
    }
  } catch { /* offline: baked profiles + calibrator still work */ }
}

// Calibrated per-family profiles, baked from building-light-calibrator.js.
// A family absent here falls back to the class default above.
const BUILDING_LIGHT_PROFILES = {};
Object.assign(BUILDING_LIGHT_PROFILES, {
  residential2: makeBuildingLightProfile({
    class: 'res', ex: 0.5, ey: 0.9, er: 0.1,
    panels: [
      { c: [[0.15, 0.233], [0.5, 0.317], [0.497, 0.877], [0.145, 0.789]], rows: 9, cols: 5 },
      { c: [[0.5, 0.28], [0.85, 0.234], [0.85, 0.56], [0.5, 0.72]], rows: 9, cols: 5 },
    ],
  }),
});

// Calibrated per-model "hero" overrides, baked from the calibrator SQLite store.
//
// Keyed by STABLE MODEL SLUG (the source filename without its extension, e.g.
// "residential2-12-UH-LD"), never by the discovery-order logical key
// ("house2x2_12"). Those index keys shift the moment a model file is added,
// removed or renamed, which would silently point every later profile at the
// wrong building. Service/park/special entries below (university_4x4 etc.) are
// hand-authored sprite keys and already stable.
const BUILDING_LIGHT_HERO_PROFILES = {
  university_4x4: makeBuildingLightProfile({
    class: 'off', ex: 0.532, ey: 0.726, er: 0.1,
    panels: [
      { c: [[0.253, 0.452], [0.483, 0.538], [0.486, 0.665], [0.252, 0.579]], rows: 3, cols: 11 },
      { c: [[0.566, 0.503], [0.789, 0.601], [0.788, 0.727], [0.565, 0.621]], rows: 3, cols: 9 },
    ],
  }),
  hospital_4x4: makeBuildingLightProfile({
    class: 'svc', ex: 0.5, ey: 0.9, er: 0.1, service: true,
    panels: [
      { c: [[0.104, 0.462], [0.626, 0.667], [0.63, 0.87], [0.105, 0.648]], rows: 8, cols: 5 },
      { c: [[0.627, 0.675], [0.965, 0.521], [0.963, 0.675], [0.626, 0.836]], rows: 8, cols: 4 },
    ],
  }),
  "commercialBuilding3-03-M": makeBuildingLightProfile({
    class: 'off', ex: 0.5, ey: 0.9, er: 0.1,
    panels: [
      { c: [[0.347, 0.338], [0.493, 0.397], [0.491, 0.667], [0.346, 0.602]], rows: 12, cols: 4 },
      { c: [[0.611, 0.456], [0.779, 0.381], [0.778, 0.616], [0.609, 0.694]], rows: 11, cols: 5 },
    ],
  }),
  "commercialBuilding3-09-M": makeBuildingLightProfile({
    class: 'off', ex: 0.325, ey: 0.758, er: 0.1,
    panels: [
      { c: [[0.353, 0.303], [0.496, 0.364], [0.499, 0.674], [0.342, 0.598]], rows: 12, cols: 4 },
      { c: [[0.499, 0.367], [0.65, 0.296], [0.65, 0.597], [0.5, 0.669]], rows: 12, cols: 4 },
    ],
  }),
  heritage_church_3x3: makeBuildingLightProfile({
    class: 'res', ex: 0.5, ey: 0.9, er: 0.1,
    panels: [
      { c: [[0.286, 0.518], [0.328, 0.544], [0.341, 0.762], [0.294, 0.74]], rows: 2, cols: 1 },
      { c: [[0.449, 0.781], [0.72, 0.658], [0.721, 0.718], [0.455, 0.835]], rows: 1, cols: 7 },
    ],
  }),
  park_large: makeBuildingLightProfile({
    class: 'off', ex: 0.647, ey: 0.762, er: 0.1,
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 12, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
  }),
  library_2x2: makeBuildingLightProfile({
    class: 'off', ex: 0.5, ey: 0.9, er: 0.1,
    panels: [
      { c: [[0.325, 0.521], [0.525, 0.606], [0.52, 0.776], [0.323, 0.687]], rows: 4, cols: 3 },
      { c: [[0.665, 0.662], [0.795, 0.607], [0.793, 0.708], [0.665, 0.772]], rows: 3, cols: 2 },
    ],
  }),
  heritage_temple_2x2_alt: makeBuildingLightProfile({
    class: 'res', ex: 0.225, ey: 0.778, er: 0.1,
    panels: [
      { c: [[0.274, 0.685], [0.541, 0.794], [0.538, 0.887], [0.276, 0.777]], rows: 1, cols: 1 },
      { c: [[0.578, 0.798], [0.62, 0.775], [0.619, 0.812], [0.577, 0.833]], rows: 1, cols: 2 },
    ],
  }),
  grand_temple_3x3: makeBuildingLightProfile({
    class: 'res', ex: 0.529, ey: 0.862, er: 0.1,
    panels: [
      { c: [[0.351, 0.592], [0.636, 0.688], [0.631, 0.745], [0.352, 0.638]], rows: 1, cols: 3 },
      { c: [[0.646, 0.69], [0.8, 0.626], [0.798, 0.67], [0.645, 0.739]], rows: 1, cols: 1 },
    ],
  }),
  "house1-01-L-LD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.565, 0.567], [0.645, 0.608], [0.645, 0.725], [0.566, 0.693]], rows: 1, cols: 1 },
    ],
    lamps: [{ x: 0.685, y: 0.679, r: 0.06 }, { x: 0.478, y: 0.586, r: 0.06 }],
  }),
  "house1-02-L-LD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.57, 0.499], [0.652, 0.545], [0.647, 0.679], [0.569, 0.643]], rows: 1, cols: 1 },
    ],
    lamps: [{ x: 0.693, y: 0.63, r: 0.05 }, { x: 0.477, y: 0.513, r: 0.05 }, { x: 0.366, y: 0.764, r: 0.04 }, { x: 0.308, y: 0.733, r: 0.04 }, { x: 0.25, y: 0.719, r: 0.04 }],
  }),
  "house1-03-L-LD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.167, 0.57], [0.29, 0.634], [0.289, 0.766], [0.169, 0.712]], rows: 2, cols: 2 },
      { c: [[0.376, 0.688], [0.487, 0.744], [0.488, 0.856], [0.378, 0.803]], rows: 2, cols: 2 },
      { c: [[0.52, 0.727], [0.603, 0.685], [0.606, 0.827], [0.519, 0.869]], rows: 2, cols: 4 },
      { c: [[0.732, 0.617], [0.814, 0.577], [0.815, 0.72], [0.731, 0.763]], rows: 2, cols: 4 },
    ],
    lamps: [{ x: 0.513, y: 0.539, r: 0.07 }, { x: 0.823, y: 0.747, r: 0.07 }, { x: 0.342, y: 0.772, r: 0.06 }, { x: 0.464, y: 0.606, r: 0.04 }, { x: 0.254, y: 0.497, r: 0.04 }, { x: 0.677, y: 0.497, r: 0.04 }, { x: 0.456, y: 0.395, r: 0.04 }, { x: 0.5, y: 0.85, r: 0.03 }],
  }),
  "house1-05-H-LD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.246, 0.397], [0.317, 0.431], [0.313, 0.602], [0.243, 0.567]], rows: 2, cols: 1 },
      { c: [[0.354, 0.434], [0.41, 0.461], [0.411, 0.634], [0.353, 0.606]], rows: 2, cols: 1 },
      { c: [[0.461, 0.564], [0.537, 0.596], [0.535, 0.658], [0.46, 0.623]], rows: 1, cols: 2 },
      { c: [[0.588, 0.58], [0.673, 0.534], [0.674, 0.583], [0.587, 0.626]], rows: 1, cols: 4 },
    ],
    lamps: [{ x: 0.487, y: 0.892, r: 0.05 }, { x: 0.428, y: 0.851, r: 0.04 }, { x: 0.254, y: 0.783, r: 0.04 }, { x: 0.807, y: 0.634, r: 0.09 }, { x: 0.595, y: 0.769, r: 0.05 }, { x: 0.453, y: 0.699, r: 0.05 }, { x: 0.747, y: 0.441, r: 0.03 }, { x: 0.356, y: 0.278, r: 0.03 }, { x: 0.21, y: 0.632, r: 0.03 }, { x: 0.3, y: 0.678, r: 0.03 }],
  }),
  "house1-06-H-LD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.153, 0.514], [0.227, 0.537], [0.229, 0.734], [0.147, 0.695]], rows: 3, cols: 1 },
      { c: [[0.294, 0.552], [0.368, 0.587], [0.367, 0.78], [0.295, 0.75]], rows: 3, cols: 1 },
      { c: [[0.46, 0.605], [0.531, 0.603], [0.534, 0.716], [0.46, 0.714]], rows: 2, cols: 1 },
      { c: [[0.773, 0.601], [0.84, 0.574], [0.842, 0.615], [0.774, 0.645]], rows: 1, cols: 1 },
    ],
    lamps: [{ x: 0.54, y: 0.883, r: 0.06 }, { x: 0.442, y: 0.882, r: 0.06 }, { x: 0.54, y: 0.757, r: 0.05 }, { x: 0.457, y: 0.758, r: 0.05 }, { x: 0.296, y: 0.828, r: 0.05 }, { x: 0.198, y: 0.779, r: 0.04 }, { x: 0.116, y: 0.74, r: 0.05 }, { x: 0.035, y: 0.696, r: 0.05 }, { x: 0.706, y: 0.829, r: 0.05 }, { x: 0.803, y: 0.781, r: 0.05 }, { x: 0.883, y: 0.739, r: 0.05 }, { x: 0.968, y: 0.698, r: 0.05 }],
  }),
  "residential2-04-L-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.18, 0.222], [0.256, 0.263], [0.256, 0.651], [0.178, 0.612]], rows: 7, cols: 2 },
      { c: [[0.542, 0.318], [0.662, 0.259], [0.666, 0.655], [0.543, 0.718]], rows: 7, cols: 2 },
      { c: [[0.344, 0.252], [0.513, 0.335], [0.506, 0.724], [0.341, 0.643]], rows: 7, cols: 3 },
      { c: [[0.768, 0.248], [0.823, 0.225], [0.821, 0.673], [0.768, 0.698]], rows: 8, cols: 1 },
    ],
    lamps: [{ x: 0.665, y: 0.816, r: 0.1 }, { x: 0.369, y: 0.829, r: 0.09 }, { x: 0.183, y: 0.725, r: 0.09 }, { x: 0.718, y: 0.682, r: 0.09 }],
  }),
  "residential2-05-L-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.347, 0.259], [0.503, 0.338], [0.502, 0.774], [0.347, 0.704]], rows: 7, cols: 4 },
      { c: [[0.542, 0.328], [0.761, 0.222], [0.764, 0.734], [0.542, 0.848]], rows: 8, cols: 5 },
      { c: [[0.233, 0.218], [0.329, 0.267], [0.32, 0.784], [0.235, 0.739]], rows: 8, cols: 2 },
    ],
    lamps: [{ x: 0.734, y: 0.765, r: 0.1 }, { x: 0.438, y: 0.804, r: 0.05 }, { x: 0.333, y: 0.753, r: 0.05 }],
  }),
  "residential2-06-M-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.215, 0.298], [0.424, 0.395], [0.416, 0.774], [0.213, 0.68]], rows: 10, cols: 6 },
      { c: [[0.584, 0.384], [0.781, 0.286], [0.777, 0.713], [0.58, 0.818]], rows: 11, cols: 6 },
      { c: [[0.511, 0.357], [0.558, 0.379], [0.554, 0.735], [0.508, 0.702]], rows: 9, cols: 2 },
      { c: [[0.439, 0.389], [0.481, 0.363], [0.481, 0.717], [0.44, 0.739]], rows: 9, cols: 2 },
    ],
    lamps: [{ x: 0.425, y: 0.88, r: 0.05 }, { x: 0.589, y: 0.801, r: 0.05 }, { x: 0.403, y: 0.806, r: 0.05 }, { x: 0.574, y: 0.879, r: 0.05 }, { x: 0.684, y: 0.827, r: 0.05 }, { x: 0.745, y: 0.798, r: 0.05 }, { x: 0.79, y: 0.773, r: 0.05 }, { x: 0.963, y: 0.691, r: 0.05 }, { x: 0.321, y: 0.825, r: 0.05 }, { x: 0.134, y: 0.736, r: 0.05 }, { x: 0.035, y: 0.688, r: 0.05 }, { x: 0.187, y: 0.693, r: 0.06 }, { x: 0.865, y: 0.735, r: 0.05 }],
  }),
  "residential2-07-M-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.268, 0.287], [0.349, 0.324], [0.341, 0.723], [0.265, 0.684]], rows: 8, cols: 2 },
      { c: [[0.504, 0.34], [0.547, 0.358], [0.542, 0.651], [0.499, 0.63]], rows: 6, cols: 1 },
      { c: [[0.587, 0.347], [0.63, 0.363], [0.632, 0.65], [0.589, 0.634]], rows: 6, cols: 1 },
      { c: [[0.702, 0.349], [0.752, 0.325], [0.751, 0.746], [0.701, 0.772]], rows: 7, cols: 1 },
    ],
    lamps: [{ x: 0.572, y: 0.809, r: 0.1 }, { x: 0.273, y: 0.739, r: 0.09 }, { x: 0.776, y: 0.738, r: 0.09 }, { x: 0.304, y: 0.828, r: 0.05 }, { x: 0.381, y: 0.861, r: 0.05 }],
  }),
  "residential2-09-UH-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.113, 0.404], [0.246, 0.47], [0.24, 0.768], [0.107, 0.696]], rows: 6, cols: 2 },
      { c: [[0.267, 0.458], [0.482, 0.361], [0.481, 0.654], [0.268, 0.763]], rows: 6, cols: 5 },
      { c: [[0.555, 0.374], [0.753, 0.468], [0.75, 0.705], [0.546, 0.602]], rows: 5, cols: 3 },
      { c: [[0.8, 0.465], [0.906, 0.409], [0.902, 0.703], [0.802, 0.751]], rows: 6, cols: 2 },
    ],
    lamps: [{ x: 0.5, y: 0.9, r: 0.1 }, { x: 0.51, y: 0.636, r: 0.09 }, { x: 0.576, y: 0.662, r: 0.09 }, { x: 0.216, y: 0.786, r: 0.09 }, { x: 0.022, y: 0.693, r: 0.09 }, { x: 0.79, y: 0.788, r: 0.09 }, { x: 0.983, y: 0.689, r: 0.09 }],
  }),
  "residential2-03-UH-LD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.137, 0.556], [0.23, 0.597], [0.231, 0.774], [0.137, 0.722]], rows: 5, cols: 3 },
      { c: [[0.275, 0.554], [0.471, 0.463], [0.473, 0.68], [0.28, 0.771]], rows: 6, cols: 4 },
      { c: [[0.492, 0.452], [0.755, 0.574], [0.756, 0.778], [0.489, 0.657]], rows: 5, cols: 6 },
      { c: [[0.768, 0.569], [0.864, 0.523], [0.86, 0.694], [0.769, 0.745]], rows: 5, cols: 3 },
    ],
    lamps: [{ x: 0.5, y: 0.9, r: 0.06 }, { x: 0.339, y: 0.826, r: 0.06 }, { x: 0.41, y: 0.855, r: 0.06 }, { x: 0.06, y: 0.717, r: 0.06 }, { x: 0.193, y: 0.783, r: 0.06 }, { x: 0.64, y: 0.844, r: 0.06 }, { x: 0.76, y: 0.786, r: 0.06 }, { x: 0.881, y: 0.729, r: 0.05 }, { x: 0.529, y: 0.735, r: 0.09 }],
  }),
  "residential2-11-H-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.263, 0.259], [0.343, 0.298], [0.344, 0.608], [0.257, 0.56]], rows: 6, cols: 2 },
      { c: [[0.365, 0.3], [0.467, 0.344], [0.463, 0.642], [0.364, 0.601]], rows: 6, cols: 2 },
      { c: [[0.593, 0.324], [0.636, 0.338], [0.638, 0.647], [0.591, 0.63]], rows: 6, cols: 1 },
      { c: [[0.71, 0.337], [0.757, 0.312], [0.757, 0.666], [0.714, 0.69]], rows: 7, cols: 1 },
    ],
    lamps: [{ x: 0.265, y: 0.727, r: 0.1 }, { x: 0.574, y: 0.804, r: 0.09 }, { x: 0.779, y: 0.724, r: 0.09 }, { x: 0.297, y: 0.824, r: 0.05 }, { x: 0.377, y: 0.857, r: 0.05 }],
  }),
  "residential2-12-UH-LD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.272, 0.619], [0.361, 0.659], [0.36, 0.704], [0.274, 0.668]], rows: 1, cols: 16 },
      { c: [[0.378, 0.654], [0.429, 0.627], [0.43, 0.677], [0.375, 0.705]], rows: 1, cols: 13 },
      { c: [[0.702, 0.647], [0.757, 0.621], [0.756, 0.695], [0.705, 0.723]], rows: 2, cols: 8 },
      { c: [[0.604, 0.59], [0.639, 0.601], [0.642, 0.641], [0.606, 0.63]], rows: 1, cols: 10 },
    ],
    lamps: [{ x: 0.584, y: 0.86, r: 0.05 }, { x: 0.423, y: 0.864, r: 0.07 }, { x: 0.544, y: 0.67, r: 0.07 }, { x: 0.47, y: 0.671, r: 0.05 }, { x: 0.284, y: 0.823, r: 0.05 }, { x: 0.141, y: 0.761, r: 0.05 }, { x: 0.046, y: 0.708, r: 0.05 }, { x: 0.754, y: 0.8, r: 0.05 }, { x: 0.96, y: 0.705, r: 0.05 }],
  }),
  "residential2-13-UH-LD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.18, 0.545], [0.263, 0.58], [0.263, 0.636], [0.178, 0.601]], rows: 1, cols: 10 },
      { c: [[0.31, 0.582], [0.382, 0.55], [0.382, 0.617], [0.308, 0.652]], rows: 1, cols: 14 },
      { c: [[0.478, 0.526], [0.528, 0.525], [0.532, 0.565], [0.478, 0.564]], rows: 1, cols: 16 },
      { c: [[0.639, 0.486], [0.681, 0.507], [0.681, 0.553], [0.638, 0.537]], rows: 1, cols: 10 },
    ],
    lamps: [{ x: 0.452, y: 0.613, r: 0.04 }, { x: 0.551, y: 0.614, r: 0.04 }, { x: 0.596, y: 0.846, r: 0.05 }, { x: 0.401, y: 0.844, r: 0.05 }, { x: 0.205, y: 0.779, r: 0.05 }, { x: 0.014, y: 0.687, r: 0.05 }, { x: 0.793, y: 0.781, r: 0.05 }, { x: 0.983, y: 0.685, r: 0.05 }],
  }),
  "residential2-14-UH-LD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.115, 0.635], [0.249, 0.699], [0.248, 0.783], [0.113, 0.722]], rows: 2, cols: 3 },
      { c: [[0.55, 0.816], [0.63, 0.777], [0.627, 0.86], [0.549, 0.899]], rows: 2, cols: 2 },
      { c: [[0.722, 0.706], [0.91, 0.623], [0.908, 0.711], [0.72, 0.808]], rows: 2, cols: 5 },
      { c: [[0.427, 0.506], [0.537, 0.555], [0.538, 0.653], [0.426, 0.601]], rows: 2, cols: 2 },
    ],
    lamps: [{ x: 0.503, y: 0.908, r: 0.06 }, { x: 0.695, y: 0.817, r: 0.05 }, { x: 0.747, y: 0.794, r: 0.05 }, { x: 0.338, y: 0.828, r: 0.05 }, { x: 0.271, y: 0.798, r: 0.05 }, { x: 0.125, y: 0.726, r: 0.05 }, { x: 0.025, y: 0.68, r: 0.05 }, { x: 0.876, y: 0.731, r: 0.05 }, { x: 0.971, y: 0.683, r: 0.05 }],
  }),
  "residential2-01-M-HD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.166, 0.305], [0.243, 0.325], [0.237, 0.744], [0.163, 0.726]], rows: 18, cols: 2 },
      { c: [[0.703, 0.344], [0.859, 0.305], [0.862, 0.728], [0.71, 0.765]], rows: 18, cols: 3 },
      { c: [[0.444, 0.345], [0.569, 0.377], [0.576, 0.808], [0.438, 0.765]], rows: 18, cols: 3 },
      { c: [[0.291, 0.313], [0.398, 0.34], [0.399, 0.77], [0.287, 0.743]], rows: 18, cols: 2 },
    ],
    lamps: [{ x: 0.43, y: 0.931, r: 0.08 }, { x: 0.22, y: 0.886, r: 0.05 }, { x: 0.771, y: 0.882, r: 0.05 }, { x: 0.911, y: 0.848, r: 0.05 }, { x: 0.096, y: 0.857, r: 0.05 }, { x: 0.159, y: 0.747, r: 0.05 }, { x: 0.42, y: 0.82, r: 0.05 }, { x: 0.59, y: 0.819, r: 0.05 }, { x: 0.876, y: 0.756, r: 0.05 }, { x: 0.577, y: 0.931, r: 0.08 }],
  }),
  "residential2-02-M-HD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.136, 0.284], [0.27, 0.314], [0.271, 0.733], [0.14, 0.698]], rows: 24, cols: 4 },
      { c: [[0.311, 0.327], [0.49, 0.372], [0.494, 0.772], [0.32, 0.742]], rows: 24, cols: 5 },
      { c: [[0.568, 0.371], [0.664, 0.352], [0.66, 0.739], [0.563, 0.764]], rows: 25, cols: 2 },
      { c: [[0.743, 0.326], [0.846, 0.302], [0.849, 0.703], [0.74, 0.736]], rows: 24, cols: 3 },
    ],
    lamps: [{ x: 0.488, y: 0.914, r: 0.1 }, { x: 0.25, y: 0.876, r: 0.09 }, { x: 0.066, y: 0.844, r: 0.09 }, { x: 0.645, y: 0.888, r: 0.09 }, { x: 0.791, y: 0.851, r: 0.09 }, { x: 0.93, y: 0.815, r: 0.09 }, { x: 0.487, y: 0.829, r: 0.05 }, { x: 0.772, y: 0.764, r: 0.05 }, { x: 0.175, y: 0.768, r: 0.05 }],
  }),
  "residential2-15-H-HD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.119, 0.271], [0.26, 0.31], [0.259, 0.801], [0.118, 0.765]], rows: 27, cols: 2 },
      { c: [[0.676, 0.329], [0.877, 0.287], [0.879, 0.772], [0.676, 0.817]], rows: 27, cols: 3 },
      { c: [[0.305, 0.229], [0.475, 0.274], [0.48, 0.842], [0.3, 0.801]], rows: 27, cols: 4 },
      { c: [[0.49, 0.279], [0.649, 0.241], [0.649, 0.805], [0.49, 0.847]], rows: 27, cols: 3 },
    ],
    lamps: [{ x: 0.572, y: 0.899, r: 0.05 }, { x: 0.278, y: 0.865, r: 0.05 }, { x: 0.198, y: 0.846, r: 0.05 }, { x: 0.094, y: 0.821, r: 0.05 }, { x: 0.411, y: 0.895, r: 0.05 }, { x: 0.658, y: 0.878, r: 0.05 }, { x: 0.785, y: 0.851, r: 0.05 }, { x: 0.911, y: 0.816, r: 0.05 }, { x: 0.421, y: 0.94, r: 0.07 }, { x: 0.574, y: 0.939, r: 0.07 }],
  }),
  "residential2-16-H-HD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.306, 0.281], [0.505, 0.366], [0.505, 0.875], [0.304, 0.774]], rows: 27, cols: 5 },
      { c: [[0.505, 0.364], [0.686, 0.283], [0.687, 0.785], [0.507, 0.879]], rows: 27, cols: 6 },
      { c: [[0.272, 0.787], [0.503, 0.891], [0.504, 0.967], [0.275, 0.855]], rows: 1, cols: 3 },
      { c: [[0.527, 0.897], [0.7, 0.809], [0.7, 0.864], [0.527, 0.949]], rows: 3, cols: 4 },
    ],
    lamps: [{ x: 0.504, y: 0.942, r: 0.1 }, { x: 0.289, y: 0.856, r: 0.09 }, { x: 0.69, y: 0.864, r: 0.09 }, { x: 0.546, y: 0.299, r: 0.02 }, { x: 0.428, y: 0.282, r: 0.03 }, { x: 0.489, y: 0.307, r: 0.03 }, { x: 0.599, y: 0.274, r: 0.03 }, { x: 0.353, y: 0.267, r: 0.03 }],
  }),
  "residential2-17-H-HD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.153, 0.273], [0.502, 0.346], [0.52, 0.89], [0.149, 0.803]], rows: 24, cols: 5 },
      { c: [[0.513, 0.35], [0.849, 0.274], [0.851, 0.793], [0.512, 0.884]], rows: 24, cols: 6 },
      { c: [[0.344, 0.223], [0.486, 0.251], [0.493, 0.309], [0.342, 0.278]], rows: 2, cols: 6 },
      { c: [[0.556, 0.259], [0.62, 0.245], [0.619, 0.304], [0.553, 0.318]], rows: 2, cols: 3 },
    ],
    lamps: [{ x: 0.519, y: 0.926, r: 0.1 }, { x: 0.149, y: 0.849, r: 0.09 }, { x: 0.871, y: 0.841, r: 0.09 }, { x: 0.323, y: 0.261, r: 0.03 }, { x: 0.735, y: 0.264, r: 0.03 }],
  }),
  "residential2-18-H-HD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.147, 0.23], [0.498, 0.318], [0.491, 0.887], [0.139, 0.799]], rows: 21, cols: 6 },
      { c: [[0.505, 0.319], [0.854, 0.231], [0.865, 0.791], [0.499, 0.89]], rows: 21, cols: 5 },
      { c: [[0.536, 0.896], [0.884, 0.806], [0.884, 0.875], [0.533, 0.967]], rows: 1, cols: 3 },
      { c: [[0.126, 0.811], [0.503, 0.897], [0.504, 0.971], [0.129, 0.881]], rows: 2, cols: 4 },
    ],
    lamps: [{ x: 0.499, y: 0.887, r: 0.1 }, { x: 0.141, y: 0.816, r: 0.09 }, { x: 0.659, y: 0.859, r: 0.09 }, { x: 0.788, y: 0.83, r: 0.09 }, { x: 0.877, y: 0.801, r: 0.09 }, { x: 0.342, y: 0.861, r: 0.09 }],
  }),
  "residential2-10-H-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.324, 0.287], [0.506, 0.362], [0.505, 0.738], [0.325, 0.655]], rows: 19, cols: 7 },
      { c: [[0.519, 0.362], [0.676, 0.291], [0.676, 0.65], [0.517, 0.723]], rows: 19, cols: 5 },
      { c: [[0.211, 0.648], [0.381, 0.728], [0.373, 0.906], [0.213, 0.832]], rows: 2, cols: 1 },
      { c: [[0.585, 0.764], [0.757, 0.686], [0.757, 0.841], [0.588, 0.92]], rows: 2, cols: 4 },
    ],
    lamps: [{ x: 0.545, y: 0.891, r: 0.1 }, { x: 0.662, y: 0.862, r: 0.09 }, { x: 0.464, y: 0.891, r: 0.09 }, { x: 0.301, y: 0.826, r: 0.09 }, { x: 0.758, y: 0.789, r: 0.09 }, { x: 0.277, y: 0.656, r: 0.04 }, { x: 0.449, y: 0.748, r: 0.04 }, { x: 0.548, y: 0.747, r: 0.04 }, { x: 0.715, y: 0.658, r: 0.04 }],
  }),
  "residential3-01-L-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.169, 0.238], [0.297, 0.298], [0.294, 0.686], [0.172, 0.622]], rows: 14, cols: 3 },
      { c: [[0.305, 0.298], [0.397, 0.347], [0.397, 0.73], [0.301, 0.681]], rows: 14, cols: 3 },
      { c: [[0.598, 0.347], [0.697, 0.299], [0.692, 0.69], [0.599, 0.733]], rows: 14, cols: 3 },
      { c: [[0.703, 0.3], [0.836, 0.239], [0.836, 0.622], [0.707, 0.682]], rows: 14, cols: 3 },
    ],
    lamps: [{ x: 0.587, y: 0.875, r: 0.1 }, { x: 0.408, y: 0.877, r: 0.09 }, { x: 0.701, y: 0.77, r: 0.09 }, { x: 0.293, y: 0.773, r: 0.09 }, { x: 0.163, y: 0.728, r: 0.09 }, { x: 0.546, y: 0.79, r: 0.09 }, { x: 0.452, y: 0.787, r: 0.09 }, { x: 0.838, y: 0.729, r: 0.09 }],
  }),
  "residential3-02-L-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.271, 0.264], [0.322, 0.286], [0.319, 0.715], [0.271, 0.694]], rows: 18, cols: 2 },
      { c: [[0.528, 0.344], [0.587, 0.313], [0.586, 0.758], [0.53, 0.785]], rows: 18, cols: 2 },
      { c: [[0.423, 0.327], [0.472, 0.347], [0.469, 0.784], [0.42, 0.758]], rows: 18, cols: 2 },
      { c: [[0.678, 0.284], [0.739, 0.252], [0.737, 0.687], [0.678, 0.719]], rows: 18, cols: 2 },
    ],
    lamps: [{ x: 0.5, y: 0.9, r: 0.1 }, { x: 0.297, y: 0.811, r: 0.09 }, { x: 0.606, y: 0.868, r: 0.09 }, { x: 0.929, y: 0.705, r: 0.09 }, { x: 0.094, y: 0.682, r: 0.09 }, { x: 0.439, y: 0.812, r: 0.09 }, { x: 0.356, y: 0.774, r: 0.09 }, { x: 0.804, y: 0.679, r: 0.09 }],
  }),
  "residential3-03-H-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.257, 0.304], [0.415, 0.375], [0.409, 0.718], [0.257, 0.663]], rows: 9, cols: 3 },
      { c: [[0.603, 0.389], [0.672, 0.356], [0.671, 0.696], [0.605, 0.718]], rows: 9, cols: 2 },
      { c: [[0.689, 0.409], [0.785, 0.367], [0.789, 0.656], [0.684, 0.698]], rows: 8, cols: 2 },
      { c: [[0.465, 0.397], [0.548, 0.399], [0.552, 0.717], [0.467, 0.72]], rows: 7, cols: 1 },
    ],
    lamps: [{ x: 0.541, y: 0.903, r: 0.05 }, { x: 0.464, y: 0.903, r: 0.05 }, { x: 0.64, y: 0.851, r: 0.05 }, { x: 0.373, y: 0.857, r: 0.05 }, { x: 0.018, y: 0.712, r: 0.05 }, { x: 0.17, y: 0.791, r: 0.05 }, { x: 0.825, y: 0.782, r: 0.05 }, { x: 0.974, y: 0.704, r: 0.05 }, { x: 0.556, y: 0.771, r: 0.05 }, { x: 0.458, y: 0.77, r: 0.05 }],
  }),
  "residential3-04-H-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.261, 0.213], [0.526, 0.327], [0.524, 0.705], [0.264, 0.574]], rows: 12, cols: 4 },
      { c: [[0.575, 0.303], [0.724, 0.227], [0.723, 0.595], [0.575, 0.672]], rows: 12, cols: 3 },
      { c: [[0.473, 0.722], [0.632, 0.801], [0.632, 0.844], [0.475, 0.77]], rows: 1, cols: 19 },
      { c: [[0.572, 0.686], [0.748, 0.598], [0.747, 0.647], [0.574, 0.739]], rows: 1, cols: 16 },
    ],
    lamps: [{ x: 0.5, y: 0.9, r: 0.05 }, { x: 0.689, y: 0.828, r: 0.05 }, { x: 0.954, y: 0.701, r: 0.05 }, { x: 0.386, y: 0.86, r: 0.05 }, { x: 0.305, y: 0.821, r: 0.05 }, { x: 0.22, y: 0.782, r: 0.05 }, { x: 0.142, y: 0.742, r: 0.05 }, { x: 0.038, y: 0.696, r: 0.05 }, { x: 0.791, y: 0.774, r: 0.05 }, { x: 0.861, y: 0.743, r: 0.05 }],
  }),
  "residential3-05-UH-LD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.348, 0.55], [0.634, 0.654], [0.641, 0.74], [0.349, 0.622]], rows: 2, cols: 21 },
      { c: [[0.654, 0.656], [0.778, 0.597], [0.775, 0.665], [0.65, 0.724]], rows: 2, cols: 13 },
      { c: [[0.456, 0.519], [0.551, 0.556], [0.551, 0.583], [0.454, 0.544]], rows: 1, cols: 15 },
      { c: [[0.597, 0.56], [0.65, 0.532], [0.649, 0.564], [0.594, 0.589]], rows: 1, cols: 10 },
    ],
    lamps: [{ x: 0.515, y: 0.927, r: 0.05 }, { x: 0.666, y: 0.792, r: 0.05 }, { x: 0.54, y: 0.854, r: 0.05 }, { x: 0.327, y: 0.845, r: 0.05 }, { x: 0.241, y: 0.812, r: 0.05 }, { x: 0.299, y: 0.682, r: 0.07 }, { x: 0.067, y: 0.664, r: 0.07 }, { x: 0.158, y: 0.624, r: 0.07 }, { x: 0.21, y: 0.718, r: 0.07 }, { x: 0.76, y: 0.821, r: 0.05 }, { x: 1, y: 0.701, r: 0.05 }, { x: 0.004, y: 0.711, r: 0.05 }],
  }),
  "residential3-06-L-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.216, 0.343], [0.412, 0.429], [0.416, 0.772], [0.216, 0.679]], rows: 13, cols: 5 },
      { c: [[0.601, 0.434], [0.746, 0.365], [0.748, 0.704], [0.601, 0.783]], rows: 14, cols: 4 },
      { c: [[0.492, 0.454], [0.521, 0.454], [0.52, 0.727], [0.492, 0.727]], rows: 10, cols: 1 },
      { c: [[0.766, 0.36], [0.792, 0.348], [0.791, 0.68], [0.762, 0.695]], rows: 13, cols: 1 },
    ],
    lamps: [{ x: 0.406, y: 0.822, r: 0.06 }, { x: 0.644, y: 0.84, r: 0.06 }, { x: 0.274, y: 0.802, r: 0.06 }, { x: 0.703, y: 0.822, r: 0.06 }, { x: 0.841, y: 0.763, r: 0.06 }, { x: 0.097, y: 0.704, r: 0.06 }, { x: 0.195, y: 0.773, r: 0.06 }, { x: 0.326, y: 0.834, r: 0.06 }],
  }),
  "residential3-07-M-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.378, 0.404], [0.414, 0.421], [0.415, 0.8], [0.383, 0.776]], rows: 25, cols: 2 },
      { c: [[0.445, 0.427], [0.494, 0.455], [0.489, 0.84], [0.447, 0.821]], rows: 25, cols: 2 },
      { c: [[0.565, 0.416], [0.608, 0.396], [0.606, 0.783], [0.563, 0.807]], rows: 25, cols: 4 },
      { c: [[0.512, 0.445], [0.538, 0.435], [0.538, 0.825], [0.509, 0.837]], rows: 25, cols: 2 },
    ],
    lamps: [{ x: 0.519, y: 0.894, r: 0.06 }, { x: 0.464, y: 0.886, r: 0.06 }, { x: 0.624, y: 0.875, r: 0.06 }, { x: 0.262, y: 0.798, r: 0.06 }, { x: 0.342, y: 0.866, r: 0.06 }],
  }),
  "residential3-08-M-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.318, 0.407], [0.376, 0.437], [0.373, 0.765], [0.318, 0.731]], rows: 17, cols: 2 },
      { c: [[0.602, 0.432], [0.631, 0.415], [0.63, 0.742], [0.603, 0.758]], rows: 17, cols: 2 },
      { c: [[0.447, 0.46], [0.464, 0.471], [0.467, 0.803], [0.442, 0.791]], rows: 17, cols: 1 },
      { c: [[0.496, 0.479], [0.524, 0.461], [0.522, 0.792], [0.497, 0.803]], rows: 17, cols: 2 },
    ],
    lamps: [{ x: 0.547, y: 0.893, r: 0.06 }, { x: 0.302, y: 0.837, r: 0.06 }, { x: 0.733, y: 0.808, r: 0.06 }, { x: 0.548, y: 0.824, r: 0.06 }, { x: 0.628, y: 0.799, r: 0.06 }, { x: 0.185, y: 0.763, r: 0.06 }],
  }),
  "residential3-12-H-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.356, 0.181], [0.506, 0.238], [0.507, 0.822], [0.35, 0.746]], rows: 24, cols: 5 },
      { c: [[0.513, 0.233], [0.653, 0.177], [0.656, 0.746], [0.514, 0.814]], rows: 24, cols: 3 },
    ],
    lamps: [{ x: 0.571, y: 0.881, r: 0.1 }, { x: 0.426, y: 0.88, r: 0.09 }, { x: 0.76, y: 0.8, r: 0.09 }, { x: 0.245, y: 0.81, r: 0.09 }],
  }),
  "residential3-14-M-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.328, 0.354], [0.5, 0.437], [0.5, 0.816], [0.328, 0.732]], rows: 9, cols: 5 },
      { c: [[0.5, 0.444], [0.667, 0.365], [0.665, 0.737], [0.5, 0.82]], rows: 9, cols: 5 },
    ],
    lamps: [{ x: 0.5, y: 0.9, r: 0.1 }],
  }),
};

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

// The stable slug for a model: its source filename minus the extension. Unlike
// the discovery-order logical key ("house2x2_12") this survives models being
// added, removed or renamed, so a calibrated profile always follows its art.
function getBuildingLightModelSlug(record, sprite) {
  const file = sprite?.modelSourceFileName
    ?? record?.sourceFileName
    ?? (typeof record?.assetId === 'string' ? record.assetId.split('/').pop() : null);
  if (!file) return null;
  return String(file).replace(/\.[^.]+$/, '');
}

function resolveBuildingLightProfile(record, spriteKey, slug) {
  const family = getBuildingLightFamily(record);
  // in-editor live preview override (calibrator, optional) beats everything
  const override = typeof getBuildingLightCalibrationOverride === 'function'
    ? getBuildingLightCalibrationOverride(slug || spriteKey, family)
    : null;
  if (override) return override;
  // Stable slug wins; the logical key stays as a fallback so calibrations saved
  // under the old index keys keep resolving until they are re-saved.
  return (slug && BUILDING_LIGHT_DB_PROFILES[slug])
    || (spriteKey && BUILDING_LIGHT_DB_PROFILES[spriteKey])
    || BUILDING_LIGHT_DB_PROFILES[family]
    || (slug && BUILDING_LIGHT_HERO_PROFILES[slug])
    || (spriteKey && BUILDING_LIGHT_HERO_PROFILES[spriteKey])
    || BUILDING_LIGHT_PROFILES[family]
    || BUILDING_LIGHT_MINIMAL_PROFILE;
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

// Fraction of a grid cell the lit window fills (rest is the mullion gap).
const BUILDING_LIGHT_WINDOW_FILL = 0.72;

// One entry per grid cell of every active panel:
//   { on, alpha, nx, ny, panel, quad }
// nx/ny are the bilinear cell centre in normalised texture space; quad is the
// window's four normalised corners, itself bilinear-interpolated on the panel -
// so the window is a sheared parallelogram matching the iso face, not a
// screen-aligned rectangle.
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
  const f = BUILDING_LIGHT_WINDOW_FILL / 2;
  for (let pi = 0; pi < panels.length; pi++) {
    const panel = panels[pi];
    if (!panel.on) continue;
    const du = 1 / panel.cols;
    const dv = 1 / panel.rows;
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
        const uc = (c + 0.5) * du;
        const vc = (r + 0.5) * dv;
        const uv = bilerpBuildingLight(panel.corners, uc, vc);
        out.push({
          on,
          alpha,
          panel: pi,
          nx: uv[0],
          ny: uv[1],
          quad: [
            bilerpBuildingLight(panel.corners, uc - f * du, vc - f * dv),
            bilerpBuildingLight(panel.corners, uc + f * du, vc - f * dv),
            bilerpBuildingLight(panel.corners, uc + f * du, vc + f * dv),
            bilerpBuildingLight(panel.corners, uc - f * du, vc + f * dv),
          ],
        });
      }
    }
  }
  return out;
}

// Scale a quad about its centroid (for the outer bloom pass).
function scaleBuildingLightQuad(quad, factor) {
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < 4; i++) { cx += quad[i][0]; cy += quad[i][1]; }
  cx /= 4;
  cy /= 4;
  return quad.map((p) => [cx + (p[0] - cx) * factor, cy + (p[1] - cy) * factor]);
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
  // scene.nightRawAlpha is the unsplit keyframe curve this ramp is calibrated
  // against; nightOverlay.alpha is now only the atmosphere share of it.
  const nightAlpha = Number.isFinite(Number(scene?.nightRawAlpha))
    ? Number(scene.nightRawAlpha)
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

// Force every building glow to re-resolve its profile and redraw. Used by the
// calibrator's Apply so a change lands on the live city at once.
function refreshAllBuildingLightGlows(scene, immediate) {
  const glows = scene?.buildingLightGlows;
  if (!glows) return;
  const bucket = getRuntimeBuildingLightBucket(scene);
  const now = (typeof performance !== 'undefined' && performance.now)
    ? performance.now() : Date.now();
  const q = scene.buildingLightQueue || (scene.buildingLightQueue = []);
  let budget = immediate ? 96 : 0;
  glows.forEach((glow, id) => {
    if (budget > 0 && glow.sprite && glow.sprite.visible) {
      relightBuildingGlow(scene, glow.sprite, glow, bucket, now);
      budget -= 1;
    } else if (q.indexOf(id) === -1) {
      q.push(id);
    }
  });
  scene.buildingLightBucket = null; // make the next tick treat every glow as dirty
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

let buildingLightDbFetched = false;

function setupBuildingLights(scene) {
  if (!scene) return;
  ensureBuildingLightTextures(scene);
  scene.buildingLightGlows = scene.buildingLightGlows || new Map(); // anchor tileId -> glow state
  scene.buildingLightQueue = scene.buildingLightQueue || [];       // anchor tileIds pending relight
  scene.buildingLightBucket = scene.buildingLightBucket || null;
  scene.buildingLightsActive = false;
  if (!buildingLightDbFetched) {
    buildingLightDbFetched = true;
    fetchBuildingLightDbProfiles(scene);
  }
}

function destroyBuildingLightGlow(glow) {
  glow?.gfx?.destroy?.();
  if (Array.isArray(glow?.beacons)) glow.beacons.forEach((b) => b.sprite?.destroy?.());
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
  if (!scene?.add?.graphics) return null;
  const w = Math.max(4, Math.round(sprite.width || sprite.displayWidth || 32));
  const h = Math.max(4, Math.round(sprite.height || sprite.displayHeight || 32));
  // A retained Graphics per building: redrawn only on relight, static between,
  // one draw object in the display list. Local (0,0) is the sprite's draw
  // position; windows are placed in local px = (n - origin) * texSize.
  const gfx = scene.add.graphics();
  gfx.setScale(sprite.scaleX || 1, sprite.scaleY || 1);
  gfx.setDepth((sprite.depth || 0) + 0.1);
  const additive = typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 'ADD';
  gfx.setBlendMode?.(additive);
  if (scene.worldMask) gfx.setMask(scene.worldMask);
  if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, gfx, 'objectLayer');
  const record = buildingLightRecordFor(sprite);
  const seed = getBuildingLightSeed(sprite.mapRow, sprite.mapCol);
  return {
    gfx,
    sprite,
    textureKey: sprite.texture?.key || null,
    // Window LOD state - set each time the camera settles; a new glow starts
    // allowed so a building that pops in near the camera lights immediately.
    windowsAllowed: true,
    drewWindows: false,
    drawnCells: 0,
    beacons: [],       // [{ sprite, period, phase }]
    hasBeacons: false,
    texW: w,
    texH: h,
    originX: sprite.originX ?? 0.5,
    originY: sprite.originY ?? 1,
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
  const profile = resolveBuildingLightProfile(
    record,
    sprite.logicalSpriteKey || sprite.renderTextureKey,
    getBuildingLightModelSlug(record, sprite),
  );
  const g = glow.gfx;
  g.clear();
  g.setPosition(sprite.x, sprite.y);
  g.setDepth((sprite.depth || 0) + 0.1);
  const tint = profile.color & 0xffffff;
  // window normal-space -> Graphics-local px (relative to the sprite's origin)
  const px = (q) => q.map((p) => ({
    x: (p[0] - glow.originX) * glow.texW,
    y: (p[1] - glow.originY) * glow.texH,
  }));

  // Windows are the expensive half and only drawn for buildings inside the
  // window LOD budget (see BUILDING_LIGHT_CONFIG.windowBudget). Lamps below are
  // always drawn - they are a few circles and carry the night read at distance.
  glow.drewWindows = !!glow.windowsAllowed;
  if (glow.windowsAllowed) {
    const cells = computeLitBuildingWindows(profile, glow.seed, bucket, glow.jitterNonce, glow.personality);
    // Cap drawn cells per building by sampling evenly across the lit set, so a
    // 300-cell tower thins out instead of losing its whole upper half.
    const lit = [];
    for (let i = 0; i < cells.length; i++) if (cells[i].on) lit.push(cells[i]);
    const cap = BUILDING_LIGHT_CONFIG.maxWindowCells;
    const step = lit.length > cap ? lit.length / cap : 1;
    const drawn = step === 1 ? lit.length : cap;
    for (let n = 0; n < drawn; n++) {
      const cell = lit[step === 1 ? n : Math.floor(n * step)];
      if (!cell) continue;
      g.fillStyle(tint, Math.min(0.5, cell.alpha * 0.3));
      g.fillPoints(px(scaleBuildingLightQuad(cell.quad, 1.7)), true);
      g.fillStyle(tint, Math.min(1, cell.alpha));
      g.fillPoints(px(cell.quad), true);
    }
    glow.drawnCells = drawn;
  } else {
    glow.drawnCells = 0;
  }

  // Street / public lamps - the always-on layer, drawn into the same Graphics.
  // A touch dimmer in the deep-night bucket.
  const lampScale = bucket === 'deepNight' ? 0.66 : 1;
  const lampPx = (n) => ({
    x: (n.x - glow.originX) * glow.texW,
    y: (n.y - glow.originY) * glow.texH,
  });
  const lamps = profile.lamps || [];
  for (let i = 0; i < lamps.length; i++) {
    const lamp = lamps[i];
    const p = lampPx(lamp);
    const rad = lamp.r * glow.texW;
    g.fillStyle(0xffdca8, 0.12 * lampScale);
    g.fillCircle(p.x, p.y, rad);
    g.fillStyle(0xffe6bf, 0.34 * lampScale);
    g.fillCircle(p.x, p.y, rad * 0.5);
    g.fillStyle(0xfff3df, 0.72 * lampScale);
    g.fillCircle(p.x, p.y, rad * 0.18);
  }

  // Blinking indicator beacons - separate sprites, pulsed per frame in
  // updateBuildingLights. Reconcile the pool to the profile.
  const beaconDefs = profile.beacons || [];
  glow.hasBeacons = beaconDefs.length > 0;
  while (glow.beacons.length > beaconDefs.length) glow.beacons.pop().sprite?.destroy?.();
  for (let i = 0; i < beaconDefs.length; i++) {
    const def = beaconDefs[i];
    let b = glow.beacons[i];
    if (!b) {
      const sprite2 = scene.add.circle(0, 0, 2.4, 0xffffff, 1);
      sprite2.setBlendMode?.(typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 'ADD');
      if (scene.worldMask) sprite2.setMask(scene.worldMask);
      if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, sprite2, 'objectLayer');
      b = { sprite: sprite2, period: def.period, phase: 0 };
      glow.beacons[i] = b;
    }
    b.period = def.period;
    b.phase = ((glow.seed >>> (i * 3)) & 0xff) / 255 * Math.PI * 2;
    const colorHex = BUILDING_LIGHT_BEACON_COLORS[def.color] ?? BUILDING_LIGHT_BEACON_COLORS.red;
    b.sprite.setFillStyle?.(colorHex, 1);
    const lp = lampPx(def);
    b.sprite.setPosition(sprite.x + lp.x * (sprite.scaleX || 1), sprite.y + lp.y * (sprite.scaleY || 1));
    b.sprite.setRadius?.(Math.max(1.6, glow.texW * 0.012));
    b.sprite.setDepth((sprite.depth || 0) + 0.13);
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
    glow.gfx.setAlpha(alpha);
    if (glow.gfx.x !== sprite.x || glow.gfx.y !== sprite.y) glow.gfx.setPosition(sprite.x, sprite.y);
    if (glow.hasBeacons) {
      for (let bi = 0; bi < glow.beacons.length; bi++) {
        const b = glow.beacons[bi];
        const t = (time / b.period) * Math.PI * 2 + b.phase;
        const pulse = 0.08 + 0.92 * Math.max(0, Math.sin(t));
        b.sprite.setAlpha(strength * pulse);
      }
    }
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

  // Window LOD: pick the nearest `windowBudget` glows to the camera centre and
  // let only those draw their window grid. Re-evaluated on the same cadence as
  // a camera move rather than every frame; a glow that changes side of the
  // budget is queued for a redraw.
  const cam = s.cameras && s.cameras.main;
  const camKey = cam
    ? `${Math.round(cam.scrollX / 24)}:${Math.round(cam.scrollY / 24)}:${(cam.zoom || 1).toFixed(2)}`
    : '';
  if (camKey !== s.__blLodKey || bucketChanged) {
    s.__blLodKey = camKey;
    const cx = cam ? cam.midPoint.x : 0;
    const cy = cam ? cam.midPoint.y : 0;
    const ranked = s.__blRanked || (s.__blRanked = []);
    ranked.length = 0;
    glows.forEach((glow, id) => {
      const sp = glow.sprite;
      if (!sp || !sp.visible) return;
      const dx = sp.x - cx;
      const dy = sp.y - cy;
      ranked.push([dx * dx + dy * dy, id, glow]);
    });
    ranked.sort((a, b) => a[0] - b[0]);
    const cap = BUILDING_LIGHT_CONFIG.windowBudget;
    for (let i = 0; i < ranked.length; i++) {
      const [, id, glow] = ranked[i];
      const allowed = i < cap;
      // Hide the whole glow outside the budget, not just its windows. Measured
      // on a dense night view (same camera, ~430 visible buildings): 400 shown
      // glows renders in 165ms, 48 in 46ms, with the same ~200 drawn window
      // cells either way. The cost is ~0.34ms per visible additive Graphics
      // regardless of what it contains - a per-object batch flush - so cutting
      // objects is the only lever that moves render time.
      if (glow.gfx.visible !== allowed) glow.gfx.setVisible(allowed);
      if (glow.windowsAllowed === allowed) continue;
      glow.windowsAllowed = allowed;
      if (allowed !== glow.drewWindows && queue.indexOf(id) === -1) queue.push(id);
    }
  }

  let budget = BUILDING_LIGHT_CONFIG.relightsPerFrame;
  while (budget-- > 0 && queue.length) {
    const id = queue.shift();
    const glow = glows.get(id);
    if (!glow || !glow.sprite?.visible) continue;
    relightBuildingGlow(s, glow.sprite, glow, bucket, time);
    glow.gfx.setAlpha(alpha);
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
  BUILDING_LIGHT_MINIMAL_PROFILE,
  BUILDING_LIGHT_BEACON_COLORS,
  BUILDING_LIGHT_MAX_PANELS,
  BUILDING_LIGHT_PANEL_LABELS,
  BUILDING_LIGHT_PROFILES,
  BUILDING_LIGHT_HERO_PROFILES,
  hashBuildingLight,
  getBuildingLightSeed,
  getBuildingLightPersonality,
  getBuildingLightBucket,
  getBuildingLightTargetRatio,
  makeBuildingLightProfile,
  getBuildingLightClass,
  getBuildingLightFamily,
  resolveBuildingLightProfile,
  getBuildingLightModelSlug,
  setBuildingLightDbProfile,
  loadBuildingLightDbProfiles,
  BUILDING_LIGHT_DB_PROFILES,
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
    refreshAllBuildingLightGlows,
    setBuildingLightDbProfile,
    loadBuildingLightDbProfiles,
    fetchBuildingLightDbProfiles,
    BUILDING_LIGHT_DB_PROFILES,
    resolveBuildingLightProfile,
    getBuildingLightModelSlug,
    getBuildingLightClass,
    getBuildingLightFamily,
    computeRuntimeBuildingLightStrength,
    getRuntimeBuildingLightBucket,
    computeLitBuildingWindows,
    makeBuildingLightProfile,
    defaultBuildingLightPanels,
    bilerpBuildingLight,
    BUILDING_LIGHT_BEACON_COLORS,
    BUILDING_LIGHT_MAX_PANELS,
    BUILDING_LIGHT_PANEL_LABELS,
    BUILDING_LIGHT_MINIMAL_PROFILE,
    BUILDING_LIGHT_PROFILES,
    BUILDING_LIGHT_CLASS_DEFAULTS,
  });
}
