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
// Baked night variant per building
// ---------------------------------------------------------------------------
// Every calibrated model ships three baked night textures: 'night' (the
// eveningPeak windows), 'deep' (the deepNight windows) and 'lamps' (street
// lamps only, not a single window). The schedule above decides how many
// windows each texture HAS; this decides which texture a given building WEARS
// at a given minute, so the city dims block by block instead of all at once:
//   dusk .. 23:00      a share of each kind shows 'night', the rest 'deep'
//   23:00 .. 01:00     each 'night' building drops to 'deep' at its own minute
//   01:00 .. 03:00     half the buildings go 'lamps' at their own minute
//   05:30 .. 06:00     ... and come back to 'deep' (early risers)
// Every roll comes from the building's tile seed, so a tower keeps the same
// habits night after night and across a reload. Emergency services never dim.
const BUILDING_NIGHT_PEAK_SHARE = Object.freeze({
  residential: 0.70, commercial: 0.50, industrial: 0.30, landmark: 1, emergency: 1,
});
const BUILDING_NIGHT_LAMPS_SHARE = 0.50;
const BUILDING_NIGHT_FADE_START = 23 * 60;
const BUILDING_NIGHT_FADE_SPAN = 120;
const BUILDING_NIGHT_LAMPS_START = 24 * 60 + 60;       // 01:00, past midnight
const BUILDING_NIGHT_LAMPS_SPAN = 120;
const BUILDING_NIGHT_WAKE_START = 24 * 60 + 5 * 60 + 30; // 05:30
const BUILDING_NIGHT_WAKE_SPAN = 30;
const BUILDING_NIGHT_VARIANTS = Object.freeze(['night', 'deep', 'lamps']);

// Landmarks stay fully lit until the 23:00 fade; port, depot and power plants
// keep industrial hours. Anything else that is not a zone or a 24h service
// (schools, library, legco, exchange, sports grounds, parks) keeps office hours.
const BUILDING_NIGHT_LANDMARK_TYPES = new Set([
  'exhibition_center', 'cultural_center', 'space_museum', 'buddha_statue',
  'heritage_temple', 'grand_temple', 'heritage_church', 'indoor_coliseum',
  'murray_house', 'ocean_park', 'football_stadium', 'airport',
]);
const BUILDING_NIGHT_INDUSTRIAL_TYPES = new Set([
  'industrial', 'power_plant_coal', 'power_plant_solar', 'power_plant_nuclear',
  'container_port', 'bus_depot',
]);

function getBuildingNightKind(record) {
  const t = record?.type;
  if (BUILDING_LIGHT_SERVICE_TYPES.has(t)) return 'emergency';
  if (BUILDING_NIGHT_LANDMARK_TYPES.has(t)) return 'landmark';
  if (BUILDING_LIGHT_RESIDENTIAL_TYPES.has(t)) return 'residential';
  if (BUILDING_NIGHT_INDUSTRIAL_TYPES.has(t)) return 'industrial';
  return 'commercial';
}

// The night is one continuous line from noon to noon, so "23:00" and "01:00"
// compare the way the eye orders them rather than wrapping at midnight.
function getBuildingNightVariant(kind, seed, minuteOfDay) {
  if (kind === 'emergency') return 'night';
  const m = (((Number(minuteOfDay) || 0) % 1440) + 1440) % 1440;
  const n = m < 720 ? m + 1440 : m;
  const s = seed >>> 0;
  const share = BUILDING_NIGHT_PEAK_SHARE[kind] ?? BUILDING_NIGHT_PEAK_SHARE.commercial;
  const fadeAt = BUILDING_NIGHT_FADE_START + hashBuildingLight(s, 22, 0) * BUILDING_NIGHT_FADE_SPAN;
  if (n < fadeAt) return hashBuildingLight(s, 21, 0) < share ? 'night' : 'deep';
  if (hashBuildingLight(s, 23, 0) >= BUILDING_NIGHT_LAMPS_SHARE) return 'deep';
  const lampsOn = BUILDING_NIGHT_LAMPS_START + hashBuildingLight(s, 24, 0) * BUILDING_NIGHT_LAMPS_SPAN;
  const lampsOff = BUILDING_NIGHT_WAKE_START + hashBuildingLight(s, 25, 0) * BUILDING_NIGHT_WAKE_SPAN;
  return n >= lampsOn && n < lampsOff ? 'lamps' : 'deep';
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
    class: 'off', service: true,
    panels: [
      { c: [[0.255, 0.457], [0.386, 0.501], [0.384, 0.576], [0.252, 0.528]], rows: 2, cols: 6 },
      { c: [[0.493, 0.537], [0.561, 0.513], [0.564, 0.624], [0.496, 0.653]], rows: 3, cols: 3 },
      { c: [[0.566, 0.503], [0.727, 0.572], [0.724, 0.655], [0.566, 0.585]], rows: 2, cols: 9 },
      { c: [[0.792, 0.605], [0.934, 0.547], [0.933, 0.615], [0.79, 0.676]], rows: 2, cols: 8 },
    ],
    lamps: [{ x: 0.391, y: 0.821, r: 0.05 }, { x: 0.585, y: 0.818, r: 0.05 }, { x: 0.531, y: 0.729, r: 0.04 }, { x: 0.449, y: 0.73, r: 0.04 }, { x: 0.345, y: 0.682, r: 0.04 }, { x: 0.59, y: 0.702, r: 0.04 }, { x: 0.265, y: 0.681, r: 0.04 }, { x: 0.65, y: 0.698, r: 0.04 }, { x: 0.423, y: 0.628, r: 0.03 }, { x: 0.358, y: 0.605, r: 0.03 }, { x: 0.257, y: 0.552, r: 0.03 }],
  }),
  hospital_4x4: makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.119, 0.467], [0.189, 0.499], [0.191, 0.614], [0.117, 0.579]], rows: 6, cols: 3 },
      { c: [[0.533, 0.627], [0.613, 0.665], [0.615, 0.794], [0.528, 0.756]], rows: 6, cols: 3 },
      { c: [[0.662, 0.662], [0.785, 0.607], [0.781, 0.747], [0.66, 0.803]], rows: 7, cols: 4 },
      { c: [[0.29, 0.462], [0.35, 0.486], [0.346, 0.605], [0.287, 0.577]], rows: 6, cols: 3 },
    ],
    lamps: [{ x: 0.55, y: 0.906, r: 0.05 }, { x: 0.288, y: 0.803, r: 0.05 }, { x: 0.195, y: 0.758, r: 0.05 }, { x: 0.812, y: 0.773, r: 0.03 }, { x: 0.916, y: 0.725, r: 0.03 }, { x: 0.461, y: 0.904, r: 0.02 }, { x: 0.395, y: 0.876, r: 0.02 }, { x: 0.114, y: 0.722, r: 0.05 }],
  }),
  "commercialBuilding3-03-M": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.378, 0.351], [0.467, 0.389], [0.464, 0.657], [0.375, 0.613]], rows: 9, cols: 6 },
      { c: [[0.606, 0.451], [0.784, 0.374], [0.783, 0.61], [0.607, 0.697]], rows: 11, cols: 5 },
      { c: [[0.29, 0.353], [0.311, 0.364], [0.306, 0.592], [0.286, 0.584]], rows: 11, cols: 2 },
      { c: [[0.548, 0.445], [0.571, 0.454], [0.575, 0.699], [0.548, 0.685]], rows: 11, cols: 2 },
    ],
    lamps: [{ x: 0.45, y: 0.716, r: 0.06 }, { x: 0.337, y: 0.667, r: 0.06 }, { x: 0.597, y: 0.735, r: 0.06 }, { x: 0.697, y: 0.694, r: 0.06 }, { x: 0.753, y: 0.671, r: 0.06 }],
  }),
  "commercialBuilding3-09-M": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.352, 0.3], [0.49, 0.354], [0.489, 0.662], [0.347, 0.592]], rows: 15, cols: 5 },
      { c: [[0.501, 0.361], [0.634, 0.303], [0.634, 0.598], [0.503, 0.664]], rows: 15, cols: 7 },
      { c: [[0.405, 0.276], [0.472, 0.307], [0.457, 0.339], [0.385, 0.303]], rows: 1, cols: 6 },
      { c: [[0.524, 0.309], [0.586, 0.281], [0.603, 0.312], [0.543, 0.34]], rows: 1, cols: 6 },
    ],
    lamps: [{ x: 0.396, y: 0.771, r: 0.06 }, { x: 0.521, y: 0.808, r: 0.06 }, { x: 0.652, y: 0.758, r: 0.06 }, { x: 0.276, y: 0.708, r: 0.06 }, { x: 0.737, y: 0.709, r: 0.06 }],
  }),
  heritage_church_3x3: makeBuildingLightProfile({
    class: 'svc',
    panels: [
      { c: [[0.289, 0.532], [0.32, 0.542], [0.323, 0.716], [0.3, 0.709]], rows: 3, cols: 1 },
      { c: [[0.571, 0.737], [0.723, 0.667], [0.723, 0.714], [0.57, 0.788]], rows: 1, cols: 4 },
    ],
    lamps: [{ x: 0.492, y: 0.843, r: 0.05 }, { x: 0.35, y: 0.814, r: 0.05 }, { x: 0.296, y: 0.694, r: 0.05 }, { x: 0.75, y: 0.757, r: 0.05 }, { x: 0.636, y: 0.81, r: 0.05 }],
  }),
  park_large: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.435, 0.751], [0.485, 0.728], [0.486, 0.752], [0.436, 0.775]], rows: 1, cols: 2 },
      { c: [[0.909, 0.734], [0.908, 0.709], [0.866, 0.689], [0.865, 0.713]], rows: 2, cols: 1 },
    ],
    lamps: [{ x: 0.387, y: 0.889, r: 0.04 }, { x: 0.326, y: 0.861, r: 0.04 }, { x: 0.636, y: 0.749, r: 0.04 }, { x: 0.71, y: 0.667, r: 0.04 }, { x: 0.261, y: 0.683, r: 0.03 }, { x: 0.492, y: 0.555, r: 0.03 }],
  }),
  library_2x2: makeBuildingLightProfile({
    class: 'off', service: true,
    panels: [
      { c: [[0.326, 0.524], [0.524, 0.603], [0.522, 0.721], [0.324, 0.643]], rows: 3, cols: 6 },
      { c: [[0.566, 0.655], [0.617, 0.676], [0.614, 0.78], [0.567, 0.755]], rows: 3, cols: 3 },
      { c: [[0.235, 0.54], [0.285, 0.562], [0.283, 0.677], [0.234, 0.657]], rows: 3, cols: 3 },
      { c: [[0.731, 0.632], [0.794, 0.604], [0.794, 0.707], [0.73, 0.736]], rows: 3, cols: 2 },
    ],
    lamps: [{ x: 0.468, y: 0.85, r: 0.06 }, { x: 0.346, y: 0.801, r: 0.06 }, { x: 0.727, y: 0.8, r: 0.03 }, { x: 0.877, y: 0.735, r: 0.03 }, { x: 0.218, y: 0.746, r: 0.03 }, { x: 0.469, y: 0.733, r: 0.02 }, { x: 0.346, y: 0.686, r: 0.02 }],
  }),
  heritage_temple_2x2_alt: makeBuildingLightProfile({
    class: 'res', ex: 0.225, ey: 0.778, er: 0.1,
    panels: [
      { c: [[0.274, 0.685], [0.541, 0.794], [0.538, 0.887], [0.276, 0.777]], rows: 1, cols: 1 },
      { c: [[0.578, 0.798], [0.62, 0.775], [0.619, 0.812], [0.577, 0.833]], rows: 1, cols: 2 },
    ],
  }),
  grand_temple_3x3: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 12, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.565, y: 0.68, r: 0.05 }, { x: 0.422, y: 0.629, r: 0.05 }, { x: 0.637, y: 0.701, r: 0.05 }, { x: 0.36, y: 0.607, r: 0.05 }, { x: 0.716, y: 0.677, r: 0.05 }, { x: 0.782, y: 0.649, r: 0.05 }, { x: 0.5, y: 0.85, r: 0.05 }, { x: 0.155, y: 0.692, r: 0.05 }, { x: 0.493, y: 0.652, r: 0.05 }, { x: 0.462, y: 0.739, r: 0.05 }, { x: 0.402, y: 0.718, r: 0.05 }],
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
  "residential4-01-M-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.266, 0.336], [0.332, 0.309], [0.333, 0.546], [0.264, 0.579]], rows: 9, cols: 2 },
      { c: [[0.358, 0.275], [0.428, 0.307], [0.427, 0.565], [0.358, 0.532]], rows: 9, cols: 2 },
      { c: [[0.592, 0.349], [0.704, 0.398], [0.707, 0.615], [0.592, 0.556]], rows: 8, cols: 3 },
      { c: [[0.786, 0.384], [0.853, 0.348], [0.855, 0.576], [0.784, 0.608]], rows: 8, cols: 3 },
    ],
    lamps: [{ x: 0.443, y: 0.868, r: 0.06 }, { x: 0.098, y: 0.664, r: 0.06 }, { x: 0.586, y: 0.847, r: 0.06 }, { x: 0.803, y: 0.757, r: 0.06 }, { x: 0.942, y: 0.687, r: 0.06 }, { x: 0.37, y: 0.611, r: 0.06 }, { x: 0.607, y: 0.635, r: 0.06 }, { x: 0.531, y: 0.564, r: 0.06 }],
  }),
  "residential4-02-M-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.231, 0.194], [0.343, 0.236], [0.337, 0.476], [0.229, 0.443]], rows: 8, cols: 3 },
      { c: [[0.411, 0.205], [0.511, 0.247], [0.516, 0.498], [0.409, 0.458]], rows: 8, cols: 3 },
      { c: [[0.57, 0.248], [0.619, 0.224], [0.621, 0.479], [0.566, 0.505]], rows: 8, cols: 1 },
      { c: [[0.733, 0.241], [0.76, 0.227], [0.758, 0.484], [0.728, 0.498]], rows: 8, cols: 1 },
    ],
    lamps: [{ x: 0.335, y: 0.811, r: 0.06 }, { x: 0.596, y: 0.824, r: 0.06 }, { x: 0.066, y: 0.678, r: 0.06 }, { x: 0.882, y: 0.694, r: 0.06 }, { x: 0.447, y: 0.524, r: 0.04 }, { x: 0.796, y: 0.499, r: 0.04 }],
  }),
  "residential5-01-H-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.252, 0.4], [0.306, 0.428], [0.307, 0.581], [0.25, 0.556]], rows: 15, cols: 5 },
      { c: [[0.323, 0.422], [0.397, 0.384], [0.398, 0.547], [0.325, 0.577]], rows: 15, cols: 6 },
      { c: [[0.467, 0.35], [0.566, 0.304], [0.568, 0.471], [0.465, 0.52]], rows: 15, cols: 6 },
      { c: [[0.597, 0.363], [0.718, 0.419], [0.716, 0.584], [0.595, 0.537]], rows: 15, cols: 6 },
    ],
    lamps: [{ x: 0.405, y: 0.843, r: 0.06 }, { x: 0.636, y: 0.827, r: 0.06 }, { x: 0.799, y: 0.74, r: 0.06 }, { x: 0.311, y: 0.792, r: 0.06 }, { x: 0.225, y: 0.751, r: 0.06 }, { x: 0.941, y: 0.681, r: 0.05 }, { x: 0.097, y: 0.682, r: 0.05 }],
  }),
  "residential5-02-H-MD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.308, 0.445], [0.381, 0.413], [0.384, 0.586], [0.309, 0.626]], rows: 15, cols: 4 },
      { c: [[0.453, 0.39], [0.539, 0.35], [0.542, 0.52], [0.453, 0.571]], rows: 15, cols: 5 },
      { c: [[0.59, 0.395], [0.695, 0.438], [0.695, 0.616], [0.588, 0.577]], rows: 15, cols: 4 },
      { c: [[0.708, 0.447], [0.758, 0.421], [0.76, 0.59], [0.712, 0.615]], rows: 15, cols: 3 },
    ],
    lamps: [{ x: 0.399, y: 0.855, r: 0.05 }, { x: 0.592, y: 0.859, r: 0.05 }, { x: 0.566, y: 0.693, r: 0.04 }, { x: 0.625, y: 0.64, r: 0.04 }, { x: 0.377, y: 0.668, r: 0.04 }, { x: 0.843, y: 0.767, r: 0.05 }, { x: 0.202, y: 0.774, r: 0.05 }, { x: 0.092, y: 0.72, r: 0.05 }, { x: 0.898, y: 0.716, r: 0.05 }],
  }),
  "residential5-03-L-HD": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.286, 0.659], [0.336, 0.634], [0.334, 0.795], [0.284, 0.818]], rows: 14, cols: 5 },
      { c: [[0.4, 0.52], [0.509, 0.567], [0.509, 0.74], [0.402, 0.691]], rows: 18, cols: 7 },
      { c: [[0.634, 0.605], [0.747, 0.66], [0.744, 0.834], [0.63, 0.777]], rows: 19, cols: 6 },
      { c: [[0.391, 0.779], [0.537, 0.85], [0.536, 0.918], [0.388, 0.851]], rows: 8, cols: 8 },
    ],
    lamps: [{ x: 0.553, y: 0.774, r: 0.06 }, { x: 0.166, y: 0.778, r: 0.03 }, { x: 0.503, y: 0.94, r: 0.03 }],
  }),
  "commercialBuilding1-01-L": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.133, 0.26], [0.493, 0.419], [0.494, 0.745], [0.132, 0.575]], rows: 3, cols: 3 },
      { c: [[0.549, 0.406], [0.876, 0.263], [0.87, 0.562], [0.546, 0.704]], rows: 3, cols: 3 },
      { c: [[0.399, 0.661], [0.469, 0.633], [0.468, 0.711], [0.396, 0.738]], rows: 1, cols: 1 },
    ],
    lamps: [{ x: 0.26, y: 0.761, r: 0.06 }, { x: 0.128, y: 0.69, r: 0.06 }, { x: 0.878, y: 0.676, r: 0.06 }, { x: 0.675, y: 0.758, r: 0.09 }, { x: 0.594, y: 0.799, r: 0.09 }, { x: 0.43, y: 0.821, r: 0.09 }, { x: 0.356, y: 0.787, r: 0.09 }, { x: 0.534, y: 0.17, r: 0.04 }, { x: 0.465, y: 0.199, r: 0.03 }],
  }),
  "commercialBuilding1-02-M": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.319, 0.233], [0.507, 0.322], [0.524, 0.742], [0.319, 0.645]], rows: 6, cols: 1 },
      { c: [[0.528, 0.341], [0.597, 0.308], [0.601, 0.651], [0.529, 0.689]], rows: 5, cols: 1 },
      { c: [[0.595, 0.298], [0.705, 0.254], [0.705, 0.565], [0.598, 0.617]], rows: 4, cols: 1 },
      { c: [[0.323, 0.641], [0.515, 0.733], [0.522, 0.894], [0.325, 0.807]], rows: 2, cols: 4 },
    ],
    lamps: [{ x: 0.705, y: 0.742, r: 0.06 }, { x: 0.537, y: 0.81, r: 0.06 }, { x: 0.304, y: 0.777, r: 0.06 }, { x: 0.657, y: 0.646, r: 0.06 }, { x: 0.35, y: 0.631, r: 0.05 }],
  }),
  "commercialBuilding1-03-L": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.256, 0.317], [0.443, 0.404], [0.437, 0.795], [0.253, 0.709]], rows: 5, cols: 5 },
      { c: [[0.494, 0.415], [0.64, 0.42], [0.635, 0.798], [0.488, 0.796]], rows: 5, cols: 2 },
      { c: [[0.652, 0.408], [0.755, 0.35], [0.755, 0.752], [0.652, 0.807]], rows: 5, cols: 4 },
    ],
    lamps: [{ x: 0.5, y: 0.832, r: 0.1 }, { x: 0.723, y: 0.821, r: 0.09 }, { x: 0.291, y: 0.785, r: 0.09 }],
  }),
  "commercialBuilding1-04-M": makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.568, 0.585], [0.82, 0.683], [0.819, 0.75], [0.569, 0.649]], rows: 1, cols: 5 },
      { c: [[0.348, 0.542], [0.719, 0.367], [0.752, 0.583], [0.329, 0.756]], rows: 4, cols: 1 },
    ],
    lamps: [{ x: 0.167, y: 0.646, r: 0.1 }, { x: 0.373, y: 0.652, r: 0.09 }, { x: 0.555, y: 0.653, r: 0.09 }, { x: 0.427, y: 0.719, r: 0.09 }, { x: 0.624, y: 0.739, r: 0.03 }, { x: 0.647, y: 0.729, r: 0.03 }, { x: 0.265, y: 0.815, r: 0.05 }],
  }),
  "commercialBuilding1-05-L": makeBuildingLightProfile({
    class: 'off', service: true,
    panels: [
      { c: [[0.405, 0.873], [0.473, 0.841], [0.474, 0.889], [0.407, 0.922]], rows: 1, cols: 1 },
      { c: [[0.356, 0.844], [0.412, 0.87], [0.413, 0.916], [0.358, 0.893]], rows: 1, cols: 1 },
    ],
    lamps: [{ x: 0.249, y: 0.719, r: 0.09 }, { x: 0.79, y: 0.673, r: 0.09 }, { x: 0.453, y: 0.84, r: 0.09 }, { x: 0.502, y: 0.592, r: 0.09 }, { x: 0.672, y: 0.826, r: 0.07 }],
  }),
  "commercialBuilding2-02-H": makeBuildingLightProfile({
    class: 'ind', service: true,
    panels: [
      { c: [[0.333, 0.439], [0.745, 0.641], [0.742, 0.687], [0.333, 0.486]], rows: 1, cols: 26 },
      { c: [[0.638, 0.507], [0.751, 0.446], [0.748, 0.488], [0.639, 0.546]], rows: 1, cols: 15 },
    ],
    lamps: [{ x: 0.411, y: 0.777, r: 0.1 }, { x: 0.488, y: 0.763, r: 0.09 }, { x: 0.569, y: 0.743, r: 0.09 }, { x: 0.215, y: 0.651, r: 0.09 }, { x: 0.356, y: 0.558, r: 0.09 }],
  }),
  "commercialBuilding2-03-M": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.243, 0.324], [0.355, 0.383], [0.354, 0.674], [0.243, 0.628]], rows: 6, cols: 5 },
      { c: [[0.649, 0.379], [0.762, 0.326], [0.762, 0.632], [0.647, 0.682]], rows: 6, cols: 5 },
      { c: [[0.445, 0.378], [0.553, 0.38], [0.555, 0.676], [0.447, 0.682]], rows: 6, cols: 4 },
    ],
    lamps: [{ x: 0.5, y: 0.9, r: 0.06 }, { x: 0.571, y: 0.755, r: 0.06 }, { x: 0.429, y: 0.754, r: 0.06 }, { x: 0.729, y: 0.774, r: 0.06 }, { x: 0.268, y: 0.78, r: 0.06 }],
  }),
  "commercialBuilding2-04-M": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.832, 0.737], [0.929, 0.69], [0.929, 0.727], [0.828, 0.777]], rows: 1, cols: 5 },
      { c: [[0.566, 0.429], [0.602, 0.412], [0.604, 0.474], [0.566, 0.491]], rows: 1, cols: 1 },
      { c: [[0.06, 0.676], [0.179, 0.735], [0.181, 0.781], [0.063, 0.723]], rows: 1, cols: 4 },
    ],
    lamps: [{ x: 0.481, y: 0.824, r: 0.07 }, { x: 0.329, y: 0.793, r: 0.07 }, { x: 0.62, y: 0.785, r: 0.07 }, { x: 0.284, y: 0.525, r: 0.05 }, { x: 0.749, y: 0.58, r: 0.07 }, { x: 0.822, y: 0.526, r: 0.07 }, { x: 0.903, y: 0.478, r: 0.07 }, { x: 0.163, y: 0.504, r: 0.07 }, { x: 0.498, y: 0.435, r: 0.09 }],
  }),
  "commercialBuilding2-05-L": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.232, 0.33], [0.4, 0.416], [0.405, 0.629], [0.235, 0.559]], rows: 4, cols: 4 },
      { c: [[0.596, 0.415], [0.762, 0.343], [0.76, 0.566], [0.596, 0.645]], rows: 4, cols: 7 },
      { c: [[0.418, 0.353], [0.48, 0.382], [0.477, 0.605], [0.417, 0.584]], rows: 4, cols: 1 },
    ],
    lamps: [{ x: 0.346, y: 0.801, r: 0.1 }, { x: 0.614, y: 0.81, r: 0.09 }, { x: 0.737, y: 0.657, r: 0.09 }, { x: 0.202, y: 0.628, r: 0.09 }],
  }),
  "commercialBuilding2-06-L": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.258, 0.172], [0.509, 0.291], [0.51, 0.688], [0.251, 0.57]], rows: 7, cols: 3 },
      { c: [[0.582, 0.263], [0.744, 0.19], [0.751, 0.605], [0.59, 0.685]], rows: 7, cols: 2 },
      { c: [[0.237, 0.189], [0.237, 0.627], [0.194, 0.646], [0.194, 0.211]], rows: 1, cols: 3 },
      { c: [[0.813, 0.274], [0.809, 0.631], [0.763, 0.609], [0.768, 0.25]], rows: 1, cols: 6 },
    ],
    lamps: [{ x: 0.51, y: 0.819, r: 0.07 }, { x: 0.266, y: 0.697, r: 0.07 }, { x: 0.392, y: 0.746, r: 0.07 }, { x: 0.607, y: 0.765, r: 0.07 }, { x: 0.716, y: 0.714, r: 0.07 }],
  }),
  "commercialBuilding3-01-H": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.226, 0.188], [0.34, 0.233], [0.342, 0.585], [0.227, 0.533]], rows: 8, cols: 8 },
      { c: [[0.379, 0.197], [0.503, 0.252], [0.507, 0.639], [0.378, 0.575]], rows: 9, cols: 8 },
      { c: [[0.501, 0.255], [0.621, 0.2], [0.622, 0.58], [0.51, 0.635]], rows: 9, cols: 8 },
      { c: [[0.675, 0.232], [0.768, 0.19], [0.772, 0.542], [0.674, 0.592]], rows: 8, cols: 7 },
    ],
    lamps: [{ x: 0.496, y: 0.889, r: 0.06 }, { x: 0.717, y: 0.782, r: 0.06 }, { x: 0.838, y: 0.728, r: 0.06 }, { x: 0.262, y: 0.778, r: 0.06 }, { x: 0.164, y: 0.725, r: 0.06 }, { x: 0.497, y: 0.705, r: 0.09 }, { x: 0.659, y: 0.654, r: 0.09 }, { x: 0.343, y: 0.65, r: 0.09 }],
  }),
  "commercialBuilding3-04-H": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.381, 0.339], [0.464, 0.373], [0.462, 0.607], [0.38, 0.571]], rows: 6, cols: 5 },
      { c: [[0.58, 0.449], [0.782, 0.353], [0.783, 0.538], [0.579, 0.635]], rows: 6, cols: 5 },
      { c: [[0.239, 0.327], [0.358, 0.377], [0.364, 0.555], [0.243, 0.503]], rows: 5, cols: 3 },
      { c: [[0.488, 0.424], [0.563, 0.456], [0.561, 0.642], [0.487, 0.61]], rows: 5, cols: 2 },
    ],
    lamps: [{ x: 0.525, y: 0.894, r: 0.05 }, { x: 0.56, y: 0.759, r: 0.05 }, { x: 0.466, y: 0.729, r: 0.05 }, { x: 0.642, y: 0.734, r: 0.05 }, { x: 0.715, y: 0.705, r: 0.05 }, { x: 0.784, y: 0.666, r: 0.05 }, { x: 0.294, y: 0.657, r: 0.05 }, { x: 0.227, y: 0.631, r: 0.05 }, { x: 0.454, y: 0.656, r: 0.05 }, { x: 0.3, y: 0.598, r: 0.05 }],
  }),
  "commercialBuilding3-05-UH": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.35, 0.212], [0.523, 0.281], [0.523, 0.388], [0.351, 0.316]], rows: 4, cols: 12 },
      { c: [[0.354, 0.393], [0.516, 0.452], [0.517, 0.57], [0.353, 0.503]], rows: 4, cols: 12 },
      { c: [[0.732, 0.277], [0.789, 0.251], [0.785, 0.361], [0.731, 0.384]], rows: 4, cols: 6 },
      { c: [[0.732, 0.478], [0.786, 0.453], [0.786, 0.569], [0.733, 0.594]], rows: 4, cols: 6 },
    ],
    lamps: [{ x: 0.496, y: 0.872, r: 0.06 }, { x: 0.419, y: 0.837, r: 0.06 }, { x: 0.228, y: 0.734, r: 0.06 }, { x: 0.632, y: 0.797, r: 0.06 }, { x: 0.718, y: 0.744, r: 0.06 }, { x: 0.797, y: 0.698, r: 0.06 }, { x: 0.376, y: 0.616, r: 0.06 }, { x: 0.488, y: 0.666, r: 0.06 }],
    beacons: [
      { x: 0.319, y: 0.334, color: 'red' },
      { x: 0.318, y: 0.166, color: 'red' },
      { x: 0.55, y: 0.256, color: 'red' },
      { x: 0.549, y: 0.431, color: 'red' },
      { x: 0.314, y: 0.506, color: 'red' },
      { x: 0.55, y: 0.604, color: 'red' },
    ],
  }),
  "commercialBuilding3-07-M": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.268, 0.264], [0.35, 0.306], [0.351, 0.481], [0.266, 0.433]], rows: 8, cols: 8 },
      { c: [[0.395, 0.303], [0.527, 0.235], [0.529, 0.409], [0.392, 0.483]], rows: 8, cols: 9 },
      { c: [[0.545, 0.361], [0.691, 0.439], [0.691, 0.615], [0.541, 0.537]], rows: 8, cols: 11 },
      { c: [[0.724, 0.434], [0.815, 0.389], [0.814, 0.567], [0.726, 0.614]], rows: 8, cols: 7 },
    ],
    lamps: [{ x: 0.51, y: 0.871, r: 0.05 }, { x: 0.453, y: 0.838, r: 0.05 }, { x: 0.35, y: 0.785, r: 0.05 }, { x: 0.237, y: 0.717, r: 0.05 }, { x: 0.189, y: 0.69, r: 0.05 }, { x: 0.615, y: 0.865, r: 0.05 }, { x: 0.734, y: 0.81, r: 0.05 }, { x: 0.832, y: 0.761, r: 0.05 }, { x: 0.584, y: 0.721, r: 0.05 }, { x: 0.491, y: 0.68, r: 0.05 }, { x: 0.329, y: 0.597, r: 0.05 }, { x: 0.246, y: 0.558, r: 0.05 }],
    beacons: [
      { x: 0.373, y: 0.167, color: 'red' },
      { x: 0.729, y: 0.309, color: 'red' },
    ],
  }),
  "commercialBuilding3-10-M": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.239, 0.327], [0.552, 0.453], [0.552, 0.73], [0.237, 0.594]], rows: 7, cols: 18 },
      { c: [[0.558, 0.461], [0.641, 0.423], [0.638, 0.657], [0.559, 0.696]], rows: 6, cols: 5 },
      { c: [[0.686, 0.426], [0.794, 0.376], [0.794, 0.638], [0.682, 0.696]], rows: 7, cols: 7 },
      { c: [[0.473, 0.709], [0.543, 0.739], [0.543, 0.817], [0.471, 0.785]], rows: 2, cols: 4 },
    ],
    lamps: [{ x: 0.432, y: 0.761, r: 0.06 }, { x: 0.247, y: 0.676, r: 0.06 }, { x: 0.659, y: 0.773, r: 0.06 }, { x: 0.839, y: 0.693, r: 0.06 }, { x: 0.745, y: 0.74, r: 0.06 }],
  }),
  "commercialBuilding3-11-H": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.218, 0.2], [0.522, 0.329], [0.517, 0.658], [0.221, 0.535]], rows: 7, cols: 8 },
      { c: [[0.568, 0.325], [0.607, 0.304], [0.61, 0.766], [0.568, 0.791]], rows: 9, cols: 2 },
      { c: [[0.68, 0.294], [0.797, 0.233], [0.799, 0.59], [0.681, 0.654]], rows: 7, cols: 6 },
    ],
    lamps: [{ x: 0.487, y: 0.856, r: 0.1 }, { x: 0.668, y: 0.75, r: 0.09 }, { x: 0.451, y: 0.713, r: 0.09 }, { x: 0.247, y: 0.629, r: 0.09 }, { x: 0.803, y: 0.679, r: 0.09 }],
  }),
  "commercialBuilding3-13-H": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.103, 0.562], [0.23, 0.621], [0.228, 0.745], [0.1, 0.683]], rows: 4, cols: 7 },
      { c: [[0.365, 0.61], [0.639, 0.613], [0.636, 0.738], [0.361, 0.739]], rows: 4, cols: 6 },
      { c: [[0.763, 0.628], [0.897, 0.563], [0.898, 0.684], [0.764, 0.747]], rows: 4, cols: 6 },
      { c: [[0.454, 0.498], [0.548, 0.499], [0.544, 0.56], [0.456, 0.561]], rows: 2, cols: 3 },
    ],
    lamps: [{ x: 0.596, y: 0.817, r: 0.05 }, { x: 0.412, y: 0.818, r: 0.05 }, { x: 0.278, y: 0.821, r: 0.05 }, { x: 0.188, y: 0.786, r: 0.05 }, { x: 0.103, y: 0.747, r: 0.05 }, { x: 0.703, y: 0.831, r: 0.05 }, { x: 0.808, y: 0.786, r: 0.05 }, { x: 0.892, y: 0.743, r: 0.05 }, { x: 0.548, y: 0.896, r: 0.05 }, { x: 0.45, y: 0.897, r: 0.05 }],
  }),
  "commercialBuilding3-08-H": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.25, 0.153], [0.487, 0.258], [0.483, 0.679], [0.253, 0.575]], rows: 13, cols: 8 },
      { c: [[0.516, 0.258], [0.69, 0.173], [0.688, 0.562], [0.517, 0.655]], rows: 12, cols: 7 },
      { c: [[0.513, 0.697], [0.749, 0.577], [0.75, 0.639], [0.514, 0.763]], rows: 1, cols: 5, on: false },
    ],
    lamps: [{ x: 0.517, y: 0.819, r: 0.1 }, { x: 0.364, y: 0.76, r: 0.09 }, { x: 0.653, y: 0.769, r: 0.09 }, { x: 0.179, y: 0.686, r: 0.09 }, { x: 0.274, y: 0.724, r: 0.09 }, { x: 0.809, y: 0.694, r: 0.09 }, { x: 0.312, y: 0.641, r: 0.05 }, { x: 0.397, y: 0.677, r: 0.05 }, { x: 0.496, y: 0.712, r: 0.05 }, { x: 0.245, y: 0.611, r: 0.05 }, { x: 0.704, y: 0.618, r: 0.05 }, { x: 0.605, y: 0.664, r: 0.05 }],
  }),
  "commercialBuilding3-12-M": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.318, 0.6], [0.357, 0.619], [0.354, 0.799], [0.317, 0.78]], rows: 5, cols: 2 },
      { c: [[0.383, 0.691], [0.585, 0.692], [0.584, 0.802], [0.383, 0.796]], rows: 3, cols: 8 },
      { c: [[0.627, 0.619], [0.669, 0.6], [0.667, 0.776], [0.626, 0.795]], rows: 5, cols: 3 },
      { c: [[0.769, 0.585], [0.883, 0.531], [0.88, 0.687], [0.772, 0.738]], rows: 9, cols: 4 },
    ],
    lamps: [{ x: 0.57, y: 0.881, r: 0.06 }, { x: 0.452, y: 0.897, r: 0.06 }, { x: 0.277, y: 0.809, r: 0.06 }, { x: 0.735, y: 0.811, r: 0.06 }, { x: 0.849, y: 0.746, r: 0.06 }, { x: 0.118, y: 0.743, r: 0.06 }, { x: 0.263, y: 0.687, r: 0.07 }, { x: 0.263, y: 0.57, r: 0.07 }, { x: 0.197, y: 0.652, r: 0.07 }, { x: 0.197, y: 0.544, r: 0.07 }, { x: 0.26, y: 0.762, r: 0.07 }, { x: 0.196, y: 0.739, r: 0.07 }, { x: 0.688, y: 0.703, r: 0.07 }, { x: 0.743, y: 0.677, r: 0.07 }, { x: 0.69, y: 0.595, r: 0.07 }, { x: 0.744, y: 0.57, r: 0.07 }, { x: 0.691, y: 0.783, r: 0.07 }, { x: 0.747, y: 0.758, r: 0.07 }, { x: 0.485, y: 0.631, r: 0.09 }, { x: 0.546, y: 0.438, r: 0.07 }, { x: 0.641, y: 0.399, r: 0.07 }],
  }),
  "commercialBuilding4-01-H": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.377, 0.69], [0.624, 0.689], [0.623, 0.764], [0.376, 0.77]], rows: 2, cols: 16 },
      { c: [[0.64, 0.346], [0.737, 0.384], [0.739, 0.628], [0.633, 0.572]], rows: 12, cols: 5 },
      { c: [[0.781, 0.397], [0.828, 0.375], [0.828, 0.603], [0.779, 0.629]], rows: 8, cols: 3 },
      { c: [[0.589, 0.387], [0.616, 0.399], [0.619, 0.564], [0.588, 0.548]], rows: 8, cols: 4 },
    ],
    lamps: [{ x: 0.5, y: 0.9, r: 0.07 }, { x: 0.655, y: 0.818, r: 0.07 }, { x: 0.786, y: 0.695, r: 0.06 }, { x: 0.636, y: 0.703, r: 0.06 }, { x: 0.369, y: 0.709, r: 0.06 }, { x: 0.286, y: 0.715, r: 0.06 }, { x: 0.221, y: 0.682, r: 0.06 }, { x: 0.502, y: 0.707, r: 0.06 }, { x: 0.292, y: 0.78, r: 0.07 }, { x: 0.836, y: 0.675, r: 0.06 }],
  }),
  "commercialBuilding4-02-H": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.433, 0.509], [0.578, 0.563], [0.577, 0.678], [0.432, 0.619]], rows: 8, cols: 13 },
      { c: [[0.668, 0.354], [0.725, 0.33], [0.724, 0.551], [0.673, 0.575]], rows: 12, cols: 5 },
      { c: [[0.505, 0.302], [0.574, 0.329], [0.571, 0.529], [0.502, 0.494]], rows: 8, cols: 7 },
      { c: [[0.376, 0.397], [0.412, 0.413], [0.411, 0.513], [0.376, 0.5]], rows: 8, cols: 4 },
    ],
    lamps: [{ x: 0.5, y: 0.9, r: 0.06 }, { x: 0.316, y: 0.756, r: 0.06 }, { x: 0.505, y: 0.799, r: 0.06 }, { x: 0.178, y: 0.694, r: 0.06 }, { x: 0.712, y: 0.758, r: 0.06 }, { x: 0.344, y: 0.615, r: 0.06 }, { x: 0.834, y: 0.705, r: 0.06 }],
  }),
  "commercialBuilding4-03-L": makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.077, 0.539], [0.224, 0.606], [0.22, 0.738], [0.075, 0.669]], rows: 3, cols: 4 },
      { c: [[0.232, 0.61], [0.307, 0.575], [0.307, 0.705], [0.23, 0.744]], rows: 3, cols: 3 },
      { c: [[0.626, 0.653], [0.716, 0.699], [0.719, 0.818], [0.63, 0.769]], rows: 3, cols: 4 },
      { c: [[0.821, 0.615], [0.922, 0.563], [0.923, 0.704], [0.817, 0.755]], rows: 3, cols: 3 },
    ],
    lamps: [{ x: 0.396, y: 0.783, r: 0.06 }, { x: 0.459, y: 0.703, r: 0.06 }, { x: 0.515, y: 0.64, r: 0.06 }, { x: 0.563, y: 0.581, r: 0.06 }, { x: 0.621, y: 0.516, r: 0.06 }, { x: 0.494, y: 0.801, r: 0.06 }, { x: 0.553, y: 0.723, r: 0.06 }, { x: 0.596, y: 0.661, r: 0.06 }, { x: 0.631, y: 0.599, r: 0.06 }, { x: 0.69, y: 0.522, r: 0.05 }, { x: 0.63, y: 0.811, r: 0.06 }, { x: 0.483, y: 0.894, r: 0.06 }, { x: 0.316, y: 0.817, r: 0.05 }, { x: 0.171, y: 0.73, r: 0.05 }, { x: 0.624, y: 0.863, r: 0.05 }],
  }),
  "commercialBuilding4-04-L": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.166, 0.606], [0.458, 0.45], [0.459, 0.579], [0.163, 0.724]], rows: 3, cols: 5 },
      { c: [[0.518, 0.482], [0.842, 0.655], [0.845, 0.729], [0.519, 0.567]], rows: 2, cols: 10 },
      { c: [[0.051, 0.559], [0.15, 0.605], [0.147, 0.729], [0.05, 0.678]], rows: 3, cols: 2 },
      { c: [[0.864, 0.648], [0.94, 0.613], [0.942, 0.697], [0.864, 0.735]], rows: 2, cols: 4 },
    ],
    lamps: [{ x: 0.463, y: 0.882, r: 0.06 }, { x: 0.559, y: 0.85, r: 0.06 }, { x: 0.657, y: 0.804, r: 0.06 }, { x: 0.739, y: 0.76, r: 0.06 }, { x: 0.468, y: 0.796, r: 0.06 }, { x: 0.568, y: 0.753, r: 0.06 }, { x: 0.646, y: 0.714, r: 0.06 }, { x: 0.389, y: 0.758, r: 0.06 }, { x: 0.481, y: 0.715, r: 0.06 }, { x: 0.57, y: 0.676, r: 0.06 }, { x: 0.289, y: 0.711, r: 0.06 }, { x: 0.401, y: 0.664, r: 0.06 }, { x: 0.489, y: 0.631, r: 0.06 }, { x: 0.333, y: 0.832, r: 0.06 }, { x: 0.152, y: 0.743, r: 0.06 }, { x: 0.845, y: 0.763, r: 0.06 }],
  }),
  "commercialBuilding5-01-UH": makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.411, 0.606], [0.495, 0.527], [0.492, 0.841], [0.415, 0.796]], rows: 12, cols: 12 },
      { c: [[0.424, 0.327], [0.498, 0.357], [0.496, 0.52], [0.427, 0.495]], rows: 8, cols: 9 },
      { c: [[0.5, 0.361], [0.572, 0.336], [0.575, 0.503], [0.502, 0.54]], rows: 11, cols: 7 },
      { c: [[0.503, 0.545], [0.573, 0.51], [0.569, 0.804], [0.496, 0.845]], rows: 11, cols: 8 },
    ],
    lamps: [{ x: 0.5, y: 0.9, r: 0.08 }, { x: 0.338, y: 0.819, r: 0.08 }, { x: 0.264, y: 0.764, r: 0.08 }, { x: 0.678, y: 0.793, r: 0.08 }, { x: 0.631, y: 0.688, r: 0.04 }],
  }),
  "industrialBuilding1-01": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.279, 0.271], [0.523, 0.375], [0.516, 0.659], [0.28, 0.558]], rows: 3, cols: 6 },
      { c: [[0.536, 0.378], [0.743, 0.279], [0.742, 0.561], [0.535, 0.661]], rows: 3, cols: 4 },
    ],
    lamps: [{ x: 0.561, y: 0.689, r: 0.1 }, { x: 0.278, y: 0.623, r: 0.09 }, { x: 0.749, y: 0.624, r: 0.09 }],
  }),
  "industrialBuilding1-02": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.307, 0.296], [0.514, 0.385], [0.518, 0.706], [0.308, 0.606]], rows: 5, cols: 3 },
      { c: [[0.613, 0.34], [0.706, 0.299], [0.708, 0.64], [0.613, 0.685]], rows: 5, cols: 1 },
    ],
    lamps: [{ x: 0.313, y: 0.679, r: 0.06 }, { x: 0.491, y: 0.763, r: 0.05 }, { x: 0.625, y: 0.735, r: 0.05 }, { x: 0.734, y: 0.683, r: 0.05 }],
  }),
  "industrialBuilding2-01": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.251, 0.314], [0.534, 0.44], [0.541, 0.721], [0.254, 0.593]], rows: 5, cols: 4 },
      { c: [[0.556, 0.442], [0.823, 0.316], [0.824, 0.585], [0.555, 0.725]], rows: 5, cols: 4 },
    ],
    lamps: [{ x: 0.326, y: 0.764, r: 0.07 }, { x: 0.798, y: 0.718, r: 0.07 }, { x: 0.271, y: 0.654, r: 0.06 }, { x: 0.535, y: 0.771, r: 0.06 }, { x: 0.756, y: 0.672, r: 0.06 }],
  }),
  "industrialBuilding2-02": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.148, 0.362], [0.492, 0.51], [0.485, 0.756], [0.149, 0.613]], rows: 6, cols: 5 },
      { c: [[0.522, 0.487], [0.588, 0.487], [0.586, 0.765], [0.519, 0.765]], rows: 8, cols: 1 },
      { c: [[0.623, 0.475], [0.86, 0.37], [0.859, 0.645], [0.627, 0.756]], rows: 7, cols: 3 },
    ],
    lamps: [{ x: 0.493, y: 0.886, r: 0.07 }, { x: 0.32, y: 0.8, r: 0.07 }, { x: 0.794, y: 0.779, r: 0.07 }, { x: 0.598, y: 0.782, r: 0.04 }, { x: 0.498, y: 0.78, r: 0.04 }],
  }),
  "industrialBuilding2-03": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.16, 0.388], [0.445, 0.503], [0.446, 0.73], [0.16, 0.611]], rows: 4, cols: 2 },
      { c: [[0.616, 0.518], [0.884, 0.405], [0.883, 0.61], [0.619, 0.723]], rows: 4, cols: 3 },
      { c: [[0.494, 0.519], [0.557, 0.515], [0.556, 0.74], [0.497, 0.737]], rows: 7, cols: 1 },
    ],
    lamps: [{ x: 0.333, y: 0.801, r: 0.07 }, { x: 0.778, y: 0.755, r: 0.07 }, { x: 0.285, y: 0.68, r: 0.07 }, { x: 0.452, y: 0.746, r: 0.07 }, { x: 0.613, y: 0.747, r: 0.07 }, { x: 0.747, y: 0.684, r: 0.07 }],
  }),
  "industrialBuilding2-04": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.201, 0.326], [0.389, 0.41], [0.392, 0.733], [0.195, 0.655]], rows: 8, cols: 2 },
      { c: [[0.604, 0.426], [0.822, 0.33], [0.822, 0.656], [0.597, 0.757]], rows: 8, cols: 3 },
      { c: [[0.462, 0.424], [0.55, 0.431], [0.553, 0.766], [0.461, 0.765]], rows: 9, cols: 1 },
      { c: [[0.35, 0.3], [0.65, 0.4], [0.65, 0.7], [0.35, 0.6]], rows: 8, cols: 4, on: false },
    ],
    lamps: [{ x: 0.311, y: 0.841, r: 0.07 }, { x: 0.572, y: 0.793, r: 0.07 }, { x: 0.445, y: 0.788, r: 0.06 }, { x: 0.789, y: 0.787, r: 0.06 }, { x: 0.24, y: 0.694, r: 0.06 }, { x: 0.744, y: 0.71, r: 0.06 }],
  }),
  "industrialBuilding2-05": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.147, 0.379], [0.468, 0.514], [0.469, 0.775], [0.146, 0.641]], rows: 5, cols: 3 },
      { c: [[0.551, 0.511], [0.868, 0.374], [0.868, 0.637], [0.55, 0.788]], rows: 6, cols: 3 },
    ],
    lamps: [{ x: 0.772, y: 0.776, r: 0.06 }, { x: 0.229, y: 0.792, r: 0.06 }],
  }),
  "industrialBuilding2-06": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.176, 0.449], [0.584, 0.63], [0.586, 0.681], [0.175, 0.508]], rows: 1, cols: 4 },
      { c: [[0.5, 0.5], [0.85, 0.4], [0.85, 0.62], [0.5, 0.8]], rows: 2, cols: 6, on: false },
      { c: [[0.276, 0.583], [0.572, 0.71], [0.575, 0.766], [0.278, 0.633]], rows: 1, cols: 3 },
    ],
    lamps: [{ x: 0.347, y: 0.778, r: 0.05 }, { x: 0.674, y: 0.792, r: 0.05 }],
  }),
  "industrialBuilding2-07": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.416, 0.555], [0.496, 0.519], [0.498, 0.621], [0.418, 0.655]], rows: 3, cols: 2 },
      { c: [[0.354, 0.569], [0.4, 0.545], [0.397, 0.683], [0.355, 0.699]], rows: 3, cols: 1 },
    ],
    lamps: [{ x: 0.228, y: 0.768, r: 0.06 }, { x: 0.538, y: 0.819, r: 0.06 }, { x: 0.651, y: 0.727, r: 0.06 }],
  }),
  "sciencePark2-01": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.136, 0.551], [0.243, 0.602], [0.246, 0.744], [0.137, 0.694]], rows: 3, cols: 6 },
      { c: [[0.415, 0.547], [0.494, 0.582], [0.493, 0.697], [0.413, 0.658]], rows: 5, cols: 6 },
      { c: [[0.603, 0.605], [0.678, 0.569], [0.68, 0.716], [0.603, 0.751]], rows: 8, cols: 4 },
    ],
    lamps: [{ x: 0.511, y: 0.868, r: 0.05 }, { x: 0.313, y: 0.718, r: 0.05 }, { x: 0.5, y: 0.72, r: 0.05 }, { x: 0.576, y: 0.752, r: 0.05 }, { x: 0.802, y: 0.694, r: 0.05 }],
  }),
  "sciencePark2-02": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.443, 0.436], [0.497, 0.46], [0.496, 0.686], [0.439, 0.663]], rows: 4, cols: 3 },
      { c: [[0.499, 0.468], [0.546, 0.446], [0.552, 0.659], [0.497, 0.689]], rows: 4, cols: 1 },
      { c: [[0.629, 0.416], [0.661, 0.395], [0.66, 0.655], [0.622, 0.673]], rows: 5, cols: 1 },
      { c: [[0.684, 0.438], [0.744, 0.41], [0.745, 0.628], [0.681, 0.658]], rows: 4, cols: 3 },
    ],
    lamps: [{ x: 0.554, y: 0.867, r: 0.06 }, { x: 0.736, y: 0.788, r: 0.06 }, { x: 0.319, y: 0.802, r: 0.06 }, { x: 0.172, y: 0.743, r: 0.06 }, { x: 0.858, y: 0.739, r: 0.04 }],
  }),
  "sicencePark2-03": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.449, 0.73], [0.491, 0.726], [0.495, 0.765], [0.445, 0.768]], rows: 1, cols: 6 },
      { c: [[0.5, 0.5], [0.85, 0.4], [0.85, 0.62], [0.5, 0.8]], rows: 2, cols: 6, on: false },
      { c: [[0.519, 0.722], [0.581, 0.709], [0.581, 0.753], [0.523, 0.765]], rows: 1, cols: 4 },
    ],
    lamps: [{ x: 0.715, y: 0.797, r: 0.06 }, { x: 0.32, y: 0.809, r: 0.06 }, { x: 0.832, y: 0.729, r: 0.06 }, { x: 0.165, y: 0.722, r: 0.06 }, { x: 0.484, y: 0.856, r: 0.09 }],
  }),
  "sciencePark2-04": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.192, 0.466], [0.309, 0.524], [0.308, 0.689], [0.19, 0.634]], rows: 4, cols: 7 },
      { c: [[0.493, 0.573], [0.8, 0.442], [0.802, 0.579], [0.491, 0.713]], rows: 4, cols: 14 },
      { c: [[0.329, 0.52], [0.38, 0.54], [0.379, 0.725], [0.328, 0.702]], rows: 9, cols: 3 },
    ],
    lamps: [{ x: 0.515, y: 0.833, r: 0.08 }, { x: 0.182, y: 0.664, r: 0.07 }, { x: 0.419, y: 0.757, r: 0.07 }, { x: 0.626, y: 0.673, r: 0.07 }, { x: 0.809, y: 0.72, r: 0.08 }],
  }),
  "industrialBuilding3-01": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.111, 0.554], [0.441, 0.702], [0.439, 0.752], [0.11, 0.601]], rows: 2, cols: 5 },
      { c: [[0.73, 0.701], [0.938, 0.604], [0.939, 0.629], [0.734, 0.722]], rows: 1, cols: 3 },
      { c: [[0.533, 0.722], [0.637, 0.726], [0.64, 0.791], [0.533, 0.789]], rows: 2, cols: 1 },
    ],
    lamps: [{ x: 0.365, y: 0.866, r: 0.05 }, { x: 0.61, y: 0.9, r: 0.05 }, { x: 0.706, y: 0.87, r: 0.05 }, { x: 0.778, y: 0.809, r: 0.05 }, { x: 0.91, y: 0.737, r: 0.05 }, { x: 0.22, y: 0.795, r: 0.05 }, { x: 0.037, y: 0.685, r: 0.05 }],
  }),
  "industrialBuilding3-02": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.206, 0.618], [0.477, 0.728], [0.477, 0.771], [0.206, 0.659]], rows: 2, cols: 5 },
      { c: [[0.698, 0.731], [0.877, 0.645], [0.88, 0.662], [0.699, 0.745]], rows: 1, cols: 3 },
    ],
    lamps: [{ x: 0.517, y: 0.88, r: 0.05 }, { x: 0.336, y: 0.826, r: 0.05 }, { x: 0.221, y: 0.773, r: 0.05 }, { x: 0.083, y: 0.712, r: 0.05 }, { x: 0.685, y: 0.836, r: 0.05 }, { x: 0.809, y: 0.77, r: 0.05 }],
  }),
  "sciencePark3-01": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.394, 0.559], [0.706, 0.622], [0.706, 0.755], [0.393, 0.659]], rows: 3, cols: 14 },
      { c: [[0.826, 0.591], [0.885, 0.563], [0.885, 0.701], [0.827, 0.728]], rows: 4, cols: 6 },
      { c: [[0.408, 0.457], [0.491, 0.423], [0.692, 0.516], [0.614, 0.55]], rows: 1, cols: 1, on: false },
      { c: [[0.247, 0.528], [0.316, 0.552], [0.316, 0.718], [0.242, 0.683]], rows: 4, cols: 4 },
    ],
    lamps: [{ x: 0.579, y: 0.864, r: 0.05 }, { x: 0.301, y: 0.83, r: 0.05 }, { x: 0.153, y: 0.755, r: 0.05 }, { x: 0.753, y: 0.748, r: 0.05 }, { x: 0.685, y: 0.822, r: 0.05 }, { x: 0.511, y: 0.753, r: 0.07 }, { x: 0.333, y: 0.69, r: 0.07 }],
  }),
  "sciencePark3-02": makeBuildingLightProfile({
    class: 'ind',
    panels: [
      { c: [[0.315, 0.477], [0.496, 0.56], [0.495, 0.684], [0.317, 0.607]], rows: 5, cols: 4 },
      { c: [[0.746, 0.612], [0.896, 0.546], [0.895, 0.695], [0.748, 0.766]], rows: 6, cols: 4 },
      { c: [[0.544, 0.583], [0.601, 0.608], [0.603, 0.737], [0.542, 0.709]], rows: 6, cols: 4 },
      { c: [[0.316, 0.629], [0.487, 0.703], [0.485, 0.726], [0.32, 0.65]], rows: 1, cols: 4 },
    ],
    lamps: [{ x: 0.44, y: 0.841, r: 0.05 }, { x: 0.568, y: 0.831, r: 0.05 }, { x: 0.721, y: 0.833, r: 0.04 }, { x: 0.928, y: 0.677, r: 0.04 }, { x: 0.313, y: 0.732, r: 0.05 }, { x: 0.159, y: 0.707, r: 0.05 }, { x: 0.265, y: 0.61, r: 0.04 }, { x: 0.519, y: 0.716, r: 0.04 }, { x: 0.622, y: 0.747, r: 0.04 }],
  }),
  power_plant_coal_2x2: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 12, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.5, y: 0.9, r: 0.1 }],
    beacons: [
      { x: 0.384, y: 0.487, color: 'red' },
      { x: 0.525, y: 0.675, color: 'red' },
    ],
  }),
  fire_station_2x2: makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.299, 0.492], [0.638, 0.572], [0.639, 0.636], [0.3, 0.551]], rows: 1, cols: 5 },
      { c: [[0.764, 0.619], [0.863, 0.568], [0.859, 0.691], [0.765, 0.73]], rows: 2, cols: 3 },
    ],
    lamps: [{ x: 0.609, y: 0.787, r: 0.07 }, { x: 0.255, y: 0.706, r: 0.07 }, { x: 0.573, y: 0.671, r: 0.05 }, { x: 0.382, y: 0.63, r: 0.05 }, { x: 0.237, y: 0.59, r: 0.04 }, { x: 0.476, y: 0.8, r: 0.03 }, { x: 0.294, y: 0.753, r: 0.03 }, { x: 0.114, y: 0.69, r: 0.03 }, { x: 0.778, y: 0.778, r: 0.03 }, { x: 0.881, y: 0.731, r: 0.03 }, { x: 0.756, y: 0.697, r: 0.03 }],
  }),
  fire_station_2x2_alt: makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.285, 0.382], [0.644, 0.522], [0.645, 0.634], [0.286, 0.493]], rows: 2, cols: 6 },
      { c: [[0.675, 0.526], [0.843, 0.447], [0.84, 0.561], [0.676, 0.643]], rows: 2, cols: 3 },
      { c: [[0.679, 0.703], [0.725, 0.684], [0.726, 0.74], [0.681, 0.762]], rows: 1, cols: 1 },
    ],
    lamps: [{ x: 0.521, y: 0.794, r: 0.07 }, { x: 0.406, y: 0.708, r: 0.02 }, { x: 0.443, y: 0.723, r: 0.02 }, { x: 0.764, y: 0.658, r: 0.03 }, { x: 0.852, y: 0.736, r: 0.03 }, { x: 0.359, y: 0.823, r: 0.03 }, { x: 0.154, y: 0.727, r: 0.03 }, { x: 0.732, y: 0.789, r: 0.03 }, { x: 0.634, y: 0.833, r: 0.03 }],
  }),
  police_station_2x2: makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.169, 0.443], [0.299, 0.505], [0.293, 0.639], [0.171, 0.588]], rows: 2, cols: 2 },
      { c: [[0.493, 0.487], [0.576, 0.488], [0.576, 0.617], [0.494, 0.618]], rows: 2, cols: 3 },
      { c: [[0.708, 0.48], [0.759, 0.503], [0.758, 0.742], [0.7, 0.719]], rows: 3, cols: 1 },
      { c: [[0.792, 0.505], [0.848, 0.48], [0.851, 0.687], [0.795, 0.713]], rows: 3, cols: 1 },
    ],
    lamps: [{ x: 0.374, y: 0.802, r: 0.05 }, { x: 0.658, y: 0.803, r: 0.05 }, { x: 0.106, y: 0.716, r: 0.03 }, { x: 0.88, y: 0.726, r: 0.03 }, { x: 0.736, y: 0.744, r: 0.05 }, { x: 0.673, y: 0.679, r: 0.03 }, { x: 0.403, y: 0.676, r: 0.03 }],
  }),
  police_station_2x2_alt: makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.317, 0.577], [0.375, 0.598], [0.367, 0.733], [0.322, 0.71]], rows: 2, cols: 1 },
      { c: [[0.573, 0.594], [0.645, 0.568], [0.645, 0.719], [0.575, 0.744]], rows: 2, cols: 2 },
    ],
    lamps: [{ x: 0.541, y: 0.789, r: 0.05 }, { x: 0.408, y: 0.784, r: 0.05 }, { x: 0.728, y: 0.752, r: 0.05 }, { x: 0.273, y: 0.744, r: 0.05 }],
  }),
  primary_school_2x2: makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 5, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 5, cols: 5, on: false },
    ],
    lamps: [{ x: 0.559, y: 0.773, r: 0.05 }, { x: 0.356, y: 0.782, r: 0.05 }, { x: 0.287, y: 0.645, r: 0.05 }, { x: 0.406, y: 0.589, r: 0.05 }, { x: 0.584, y: 0.583, r: 0.05 }, { x: 0.718, y: 0.643, r: 0.05 }, { x: 0.738, y: 0.759, r: 0.03 }, { x: 0.243, y: 0.758, r: 0.03 }, { x: 0.822, y: 0.723, r: 0.03 }],
  }),
  secondary_school_2x2: makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 5, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 5, cols: 5, on: false },
    ],
    lamps: [{ x: 0.372, y: 0.785, r: 0.04 }, { x: 0.584, y: 0.775, r: 0.04 }, { x: 0.404, y: 0.593, r: 0.04 }, { x: 0.535, y: 0.526, r: 0.04 }, { x: 0.625, y: 0.61, r: 0.04 }, { x: 0.741, y: 0.791, r: 0.04 }, { x: 0.229, y: 0.783, r: 0.04 }, { x: 0.878, y: 0.723, r: 0.04 }, { x: 0.097, y: 0.726, r: 0.04 }, { x: 0.379, y: 0.698, r: 0.04 }, { x: 0.663, y: 0.693, r: 0.04 }],
  }),
  secondary_school_2x2_alt: makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 5, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 5, cols: 5, on: false },
    ],
    lamps: [{ x: 0.364, y: 0.784, r: 0.04 }, { x: 0.586, y: 0.789, r: 0.04 }, { x: 0.403, y: 0.584, r: 0.04 }, { x: 0.54, y: 0.52, r: 0.04 }, { x: 0.67, y: 0.702, r: 0.04 }, { x: 0.745, y: 0.787, r: 0.04 }, { x: 0.886, y: 0.722, r: 0.04 }, { x: 0.231, y: 0.78, r: 0.04 }, { x: 0.102, y: 0.722, r: 0.04 }],
  }),
  community_college_3x3: makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.488, 0.511], [0.533, 0.54], [0.534, 0.674], [0.486, 0.633]], rows: 2, cols: 5 },
      { c: [[0.613, 0.565], [0.713, 0.491], [0.713, 0.61], [0.615, 0.696]], rows: 5, cols: 5 },
      { c: [[0.377, 0.424], [0.484, 0.502], [0.483, 0.574], [0.378, 0.471]], rows: 1, cols: 9 },
      { c: [[0.545, 0.54], [0.601, 0.543], [0.602, 0.641], [0.546, 0.679]], rows: 2, cols: 5 },
    ],
    lamps: [{ x: 0.361, y: 0.748, r: 0.04 }, { x: 0.416, y: 0.789, r: 0.04 }, { x: 0.565, y: 0.837, r: 0.04 }, { x: 0.512, y: 0.834, r: 0.04 }, { x: 0.703, y: 0.687, r: 0.04 }, { x: 0.31, y: 0.693, r: 0.04 }, { x: 0.264, y: 0.647, r: 0.04 }, { x: 0.605, y: 0.798, r: 0.04 }],
  }),
  community_college_3x3_alt_2: makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.308, 0.388], [0.353, 0.426], [0.353, 0.589], [0.307, 0.548]], rows: 3, cols: 1 },
      { c: [[0.495, 0.493], [0.553, 0.548], [0.555, 0.68], [0.494, 0.616]], rows: 4, cols: 5 },
      { c: [[0.56, 0.549], [0.66, 0.46], [0.659, 0.58], [0.56, 0.671]], rows: 4, cols: 8 },
      { c: [[0.571, 0.702], [0.643, 0.635], [0.644, 0.698], [0.57, 0.763]], rows: 1, cols: 4 },
    ],
    lamps: [{ x: 0.535, y: 0.837, r: 0.04 }, { x: 0.468, y: 0.824, r: 0.04 }, { x: 0.652, y: 0.765, r: 0.04 }, { x: 0.388, y: 0.775, r: 0.04 }, { x: 0.332, y: 0.732, r: 0.04 }, { x: 0.249, y: 0.65, r: 0.04 }, { x: 0.719, y: 0.707, r: 0.04 }, { x: 0.447, y: 0.685, r: 0.04 }, { x: 0.383, y: 0.624, r: 0.04 }],
  }),
  community_college_3x3_alt_3: makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.262, 0.446], [0.329, 0.502], [0.326, 0.594], [0.267, 0.536]], rows: 2, cols: 4 },
      { c: [[0.457, 0.63], [0.508, 0.673], [0.506, 0.774], [0.456, 0.723]], rows: 2, cols: 5 },
      { c: [[0.523, 0.678], [0.678, 0.513], [0.677, 0.597], [0.522, 0.759]], rows: 2, cols: 4 },
      { c: [[0.507, 0.455], [0.554, 0.506], [0.557, 0.592], [0.508, 0.558]], rows: 2, cols: 4 },
    ],
    lamps: [{ x: 0.5, y: 0.9, r: 0.1 }],
  }),
  community_college_3x3_alt_4: makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.196, 0.555], [0.236, 0.567], [0.235, 0.659], [0.193, 0.647]], rows: 3, cols: 4 },
      { c: [[0.54, 0.544], [0.615, 0.511], [0.612, 0.639], [0.538, 0.672]], rows: 4, cols: 5 },
      { c: [[0.632, 0.55], [0.724, 0.506], [0.724, 0.567], [0.629, 0.61]], rows: 2, cols: 4 },
      { c: [[0.29, 0.543], [0.316, 0.559], [0.315, 0.695], [0.291, 0.683]], rows: 4, cols: 1 },
    ],
    lamps: [{ x: 0.407, y: 0.861, r: 0.04 }, { x: 0.584, y: 0.861, r: 0.04 }, { x: 0.305, y: 0.822, r: 0.04 }, { x: 0.634, y: 0.825, r: 0.04 }, { x: 0.668, y: 0.754, r: 0.04 }, { x: 0.268, y: 0.765, r: 0.04 }],
  }),
  university_4x4_alt: makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.066, 0.59], [0.172, 0.633], [0.173, 0.687], [0.067, 0.639]], rows: 3, cols: 5 },
      { c: [[0.572, 0.479], [0.624, 0.501], [0.625, 0.554], [0.57, 0.532]], rows: 3, cols: 5 },
      { c: [[0.254, 0.643], [0.379, 0.588], [0.379, 0.624], [0.252, 0.68]], rows: 2, cols: 6 },
      { c: [[0.688, 0.662], [0.778, 0.675], [0.778, 0.724], [0.69, 0.715]], rows: 3, cols: 5 },
    ],
    lamps: [{ x: 0.528, y: 0.86, r: 0.04 }, { x: 0.38, y: 0.852, r: 0.04 }, { x: 0.529, y: 0.755, r: 0.04 }, { x: 0.282, y: 0.751, r: 0.04 }, { x: 0.244, y: 0.739, r: 0.04 }, { x: 0.156, y: 0.721, r: 0.04 }, { x: 0.511, y: 0.584, r: 0.04 }, { x: 0.629, y: 0.63, r: 0.04 }, { x: 0.42, y: 0.615, r: 0.04 }, { x: 0.716, y: 0.791, r: 0.04 }, { x: 0.067, y: 0.703, r: 0.04 }, { x: 0.925, y: 0.708, r: 0.04 }],
  }),
  sports_ground_2x2: makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 5, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 5, cols: 5, on: false },
    ],
    lamps: [{ x: 0.53, y: 0.688, r: 0.05 }, { x: 0.396, y: 0.695, r: 0.05 }, { x: 0.711, y: 0.599, r: 0.05 }, { x: 0.212, y: 0.557, r: 0.05 }, { x: 0.379, y: 0.221, r: 0.04 }, { x: 0.657, y: 0.25, r: 0.04 }],
  }),
  sports_ground_3x3: makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 5, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 5, cols: 5, on: false },
    ],
    lamps: [{ x: 0.3, y: 0.798, r: 0.06 }, { x: 0.631, y: 0.821, r: 0.06 }, { x: 0.869, y: 0.707, r: 0.06 }, { x: 0.2, y: 0.758, r: 0.06 }, { x: 0.097, y: 0.629, r: 0.06 }, { x: 0.341, y: 0.53, r: 0.06 }, { x: 0.49, y: 0.447, r: 0.06 }, { x: 0.761, y: 0.523, r: 0.06 }],
  }),
  legislative_council_2x2: makeBuildingLightProfile({
    class: 'ind', service: true,
    panels: [
      { c: [[0.391, 0.717], [0.606, 0.71], [0.607, 0.82], [0.39, 0.823]], rows: 2, cols: 5 },
      { c: [[0.171, 0.655], [0.289, 0.705], [0.29, 0.786], [0.173, 0.732]], rows: 2, cols: 4 },
      { c: [[0.707, 0.717], [0.828, 0.658], [0.825, 0.736], [0.708, 0.791]], rows: 2, cols: 4 },
    ],
    lamps: [{ x: 0.562, y: 0.85, r: 0.04 }, { x: 0.433, y: 0.853, r: 0.04 }, { x: 0.354, y: 0.833, r: 0.04 }, { x: 0.777, y: 0.788, r: 0.04 }, { x: 0.207, y: 0.785, r: 0.04 }, { x: 0.652, y: 0.759, r: 0.02 }, { x: 0.838, y: 0.691, r: 0.02 }, { x: 0.166, y: 0.694, r: 0.02 }],
  }),
  legislative_council_2x2_alt: makeBuildingLightProfile({
    class: 'ind', service: true,
    panels: [
      { c: [[0.199, 0.481], [0.309, 0.525], [0.314, 0.65], [0.203, 0.603]], rows: 2, cols: 3 },
      { c: [[0.748, 0.55], [0.823, 0.517], [0.822, 0.636], [0.746, 0.674]], rows: 2, cols: 2 },
    ],
    lamps: [{ x: 0.399, y: 0.611, r: 0.03 }, { x: 0.471, y: 0.619, r: 0.03 }, { x: 0.526, y: 0.627, r: 0.03 }, { x: 0.606, y: 0.641, r: 0.03 }, { x: 0.571, y: 0.798, r: 0.06 }, { x: 0.286, y: 0.734, r: 0.06 }, { x: 0.706, y: 0.743, r: 0.06 }, { x: 0.335, y: 0.618, r: 0.02 }, { x: 0.667, y: 0.651, r: 0.02 }],
  }),
  stock_exchange_4x4: makeBuildingLightProfile({
    class: 'svc', service: true,
    panels: [
      { c: [[0.217, 0.586], [0.336, 0.633], [0.335, 0.761], [0.216, 0.71]], rows: 5, cols: 8 },
      { c: [[0.668, 0.637], [0.775, 0.592], [0.777, 0.712], [0.667, 0.756]], rows: 5, cols: 7 },
      { c: [[0.44, 0.64], [0.496, 0.654], [0.497, 0.724], [0.439, 0.71]], rows: 3, cols: 5 },
      { c: [[0.499, 0.654], [0.561, 0.638], [0.562, 0.71], [0.499, 0.723]], rows: 3, cols: 5 },
    ],
    lamps: [{ x: 0.57, y: 0.904, r: 0.04 }, { x: 0.67, y: 0.851, r: 0.04 }, { x: 0.758, y: 0.813, r: 0.04 }, { x: 0.917, y: 0.717, r: 0.04 }, { x: 0.425, y: 0.904, r: 0.04 }, { x: 0.327, y: 0.847, r: 0.04 }, { x: 0.237, y: 0.819, r: 0.04 }, { x: 0.074, y: 0.727, r: 0.04 }, { x: 0.616, y: 0.785, r: 0.04 }, { x: 0.385, y: 0.773, r: 0.04 }],
  }),
  heritage_temple_2x2: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 12, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.501, y: 0.77, r: 0.07 }, { x: 0.356, y: 0.71, r: 0.07 }],
  }),
  murray_house_2x2: makeBuildingLightProfile({
    class: 'res',
    panels: [
      { c: [[0.33, 0.611], [0.496, 0.544], [0.494, 0.592], [0.328, 0.662]], rows: 1, cols: 5 },
      { c: [[0.712, 0.65], [0.841, 0.594], [0.837, 0.704], [0.71, 0.762]], rows: 2, cols: 5 },
      { c: [[0.219, 0.578], [0.315, 0.615], [0.312, 0.717], [0.22, 0.681]], rows: 2, cols: 2 },
      { c: [[0.412, 0.692], [0.583, 0.761], [0.586, 0.81], [0.413, 0.744]], rows: 1, cols: 4 },
    ],
    lamps: [{ x: 0.604, y: 0.85, r: 0.05 }, { x: 0.407, y: 0.8, r: 0.05 }, { x: 0.193, y: 0.7, r: 0.05 }, { x: 0.589, y: 0.723, r: 0.04 }, { x: 0.456, y: 0.673, r: 0.04 }, { x: 0.819, y: 0.757, r: 0.05 }, { x: 0.542, y: 0.609, r: 0.03 }, { x: 0.593, y: 0.627, r: 0.03 }],
  }),
  space_museum_2x2: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.326, 0.556], [0.389, 0.584], [0.392, 0.691], [0.329, 0.648]], rows: 1, cols: 1 },
    ],
    lamps: [{ x: 0.544, y: 0.685, r: 0.06 }, { x: 0.447, y: 0.639, r: 0.06 }, { x: 0.652, y: 0.526, r: 0.03 }, { x: 0.497, y: 0.477, r: 0.03 }, { x: 0.431, y: 0.339, r: 0.03 }, { x: 0.724, y: 0.453, r: 0.03 }, { x: 0.279, y: 0.679, r: 0.04 }, { x: 0.584, y: 0.784, r: 0.04 }],
  }),
  buddha_statue_3x3: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 12, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.496, y: 0.779, r: 0.03 }, { x: 0.323, y: 0.729, r: 0.03 }, { x: 0.669, y: 0.755, r: 0.03 }, { x: 0.311, y: 0.658, r: 0.03 }, { x: 0.688, y: 0.669, r: 0.03 }, { x: 0.575, y: 0.728, r: 0.03 }, { x: 0.497, y: 0.943, r: 0.03 }, { x: 0.389, y: 0.804, r: 0.03 }, { x: 0.344, y: 0.789, r: 0.03 }, { x: 0.435, y: 0.738, r: 0.03 }, { x: 0.385, y: 0.726, r: 0.03 }, { x: 0.463, y: 0.686, r: 0.03 }, { x: 0.419, y: 0.678, r: 0.03 }, { x: 0.696, y: 0.853, r: 0.03 }, { x: 0.166, y: 0.793, r: 0.03 }],
  }),
  indoor_coliseum_3x3: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.177, 0.572], [0.468, 0.699], [0.468, 0.721], [0.177, 0.589]], rows: 1, cols: 12 },
      { c: [[0.521, 0.704], [0.837, 0.572], [0.838, 0.591], [0.521, 0.724]], rows: 1, cols: 10 },
      { c: [[0.541, 0.795], [0.693, 0.731], [0.693, 0.783], [0.542, 0.848]], rows: 2, cols: 3 },
      { c: [[0.383, 0.755], [0.482, 0.802], [0.481, 0.845], [0.383, 0.798]], rows: 1, cols: 6 },
    ],
    lamps: [{ x: 0.354, y: 0.782, r: 0.04 }, { x: 0.288, y: 0.748, r: 0.04 }, { x: 0.217, y: 0.724, r: 0.04 }, { x: 0.542, y: 0.805, r: 0.04 }, { x: 0.642, y: 0.763, r: 0.04 }, { x: 0.721, y: 0.732, r: 0.05 }],
  }),
  cultural_center_4x4: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.256, 0.43], [0.366, 0.538], [0.365, 0.562], [0.256, 0.456]], rows: 1, cols: 6 },
      { c: [[0.573, 0.561], [0.622, 0.601], [0.622, 0.643], [0.573, 0.602]], rows: 1, cols: 3 },
      { c: [[0.352, 0.459], [0.422, 0.483], [0.422, 0.52], [0.352, 0.496]], rows: 2, cols: 9 },
      { c: [[0.565, 0.447], [0.633, 0.386], [0.632, 0.432], [0.565, 0.491]], rows: 2, cols: 8 },
    ],
    lamps: [{ x: 0.562, y: 0.823, r: 0.04 }, { x: 0.481, y: 0.746, r: 0.04 }, { x: 0.387, y: 0.667, r: 0.04 }, { x: 0.257, y: 0.563, r: 0.04 }, { x: 0.565, y: 0.745, r: 0.04 }, { x: 0.624, y: 0.786, r: 0.04 }, { x: 0.868, y: 0.555, r: 0.02 }, { x: 0.823, y: 0.617, r: 0.02 }, { x: 0.723, y: 0.728, r: 0.02 }, { x: 0.694, y: 0.713, r: 0.02 }, { x: 0.156, y: 0.511, r: 0.02 }, { x: 0.503, y: 0.668, r: 0.03 }, { x: 0.559, y: 0.664, r: 0.03 }],
  }),
  exhibition_center_4x4: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.198, 0.605], [0.283, 0.643], [0.282, 0.716], [0.2, 0.677]], rows: 4, cols: 5 },
      { c: [[0.799, 0.627], [0.909, 0.576], [0.906, 0.649], [0.797, 0.7]], rows: 6, cols: 6 },
      { c: [[0.479, 0.639], [0.579, 0.634], [0.581, 0.696], [0.475, 0.704]], rows: 3, cols: 6 },
      { c: [[0.383, 0.614], [0.479, 0.64], [0.481, 0.706], [0.385, 0.685]], rows: 3, cols: 6 },
    ],
    lamps: [{ x: 0.608, y: 0.855, r: 0.04 }, { x: 0.372, y: 0.842, r: 0.04 }, { x: 0.725, y: 0.806, r: 0.04 }, { x: 0.87, y: 0.729, r: 0.04 }, { x: 0.278, y: 0.803, r: 0.04 }, { x: 0.113, y: 0.738, r: 0.04 }, { x: 0.538, y: 0.794, r: 0.02 }, { x: 0.412, y: 0.781, r: 0.02 }, { x: 0.644, y: 0.773, r: 0.02 }, { x: 0.334, y: 0.754, r: 0.02 }, { x: 0.474, y: 0.791, r: 0.02 }],
  }),
  football_stadium_4x4: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.149, 0.699], [0.395, 0.809], [0.388, 0.868], [0.152, 0.765]], rows: 2, cols: 6 },
      { c: [[0.577, 0.808], [0.729, 0.756], [0.729, 0.827], [0.577, 0.886]], rows: 3, cols: 3 },
    ],
    lamps: [{ x: 0.245, y: 0.636, r: 0.07 }, { x: 0.357, y: 0.583, r: 0.07 }, { x: 0.482, y: 0.536, r: 0.07 }, { x: 0.64, y: 0.513, r: 0.06 }, { x: 0.738, y: 0.551, r: 0.06 }, { x: 0.476, y: 0.728, r: 0.07 }, { x: 0.651, y: 0.661, r: 0.07 }, { x: 0.76, y: 0.576, r: 0.07 }, { x: 0.547, y: 0.865, r: 0.04 }, { x: 0.427, y: 0.866, r: 0.04 }],
  }),
  ocean_park_8x8: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 12, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.869, y: 0.747, r: 0.03 }, { x: 0.365, y: 0.869, r: 0.03 }, { x: 0.543, y: 0.775, r: 0.03 }, { x: 0.44, y: 0.713, r: 0.03 }, { x: 0.584, y: 0.679, r: 0.03 }, { x: 0.502, y: 0.629, r: 0.03 }, { x: 0.344, y: 0.621, r: 0.03 }, { x: 0.731, y: 0.741, r: 0.03 }, { x: 0.5, y: 0.85, r: 0.03 }, { x: 0.263, y: 0.657, r: 0.03 }],
  }),
  airport_12x12: makeBuildingLightProfile({
    class: 'svc',
    panels: [
      { c: [[0.415, 0.311], [0.487, 0.383], [0.487, 0.401], [0.415, 0.326]], rows: 2, cols: 27 },
      { c: [[0.499, 0.385], [0.529, 0.413], [0.528, 0.442], [0.499, 0.413]], rows: 4, cols: 12 },
      { c: [[0.539, 0.434], [0.64, 0.537], [0.64, 0.56], [0.539, 0.458]], rows: 2, cols: 30 },
      { c: [[0.691, 0.585], [0.734, 0.543], [0.734, 0.571], [0.691, 0.615]], rows: 3, cols: 5 },
    ],
    lamps: [{ x: 0.438, y: 0.351, r: 0.02 }, { x: 0.393, y: 0.778, r: 0.02 }, { x: 0.651, y: 0.575, r: 0.02 }, { x: 0.538, y: 0.466, r: 0.02 }, { x: 0.5, y: 0.85, r: 0.02 }, { x: 0.432, y: 0.434, r: 0.02 }, { x: 0.49, y: 0.488, r: 0.02 }, { x: 0.537, y: 0.538, r: 0.02 }, { x: 0.589, y: 0.59, r: 0.02 }, { x: 0.738, y: 0.509, r: 0.02 }, { x: 0.543, y: 0.328, r: 0.02 }, { x: 0.637, y: 0.417, r: 0.02 }],
    beacons: [
      { x: 0.323, y: 0.395, color: 'blue' },
      { x: 0.372, y: 0.346, color: 'blue' },
      { x: 0.703, y: 0.653, color: 'blue' },
      { x: 0.649, y: 0.723, color: 'blue' },
      { x: 0.236, y: 0.487, color: 'red' },
      { x: 0.314, y: 0.573, color: 'red' },
      { x: 0.401, y: 0.664, color: 'red' },
      { x: 0.477, y: 0.742, color: 'red' },
      { x: 0.539, y: 0.807, color: 'red' },
      { x: 0.354, y: 0.521, color: 'red' },
      { x: 0.277, y: 0.444, color: 'red' },
      { x: 0.451, y: 0.617, color: 'red' },
      { x: 0.522, y: 0.692, color: 'red' },
      { x: 0.587, y: 0.754, color: 'red' },
    ],
  }),
  power_plant_solar_2x2: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.285, 0.546], [0.368, 0.579], [0.368, 0.723], [0.284, 0.685]], rows: 3, cols: 2 },
    ],
    lamps: [{ x: 0.497, y: 0.901, r: 0.05 }, { x: 0.712, y: 0.748, r: 0.04 }, { x: 0.522, y: 0.673, r: 0.04 }, { x: 0.194, y: 0.775, r: 0.04 }],
  }),
  power_plant_nuclear_4x4: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.318, 0.669], [0.383, 0.701], [0.385, 0.756], [0.317, 0.724]], rows: 3, cols: 4 },
      { c: [[0.453, 0.746], [0.515, 0.747], [0.516, 0.799], [0.45, 0.797]], rows: 2, cols: 3 },
    ],
    lamps: [{ x: 0.636, y: 0.853, r: 0.03 }, { x: 0.317, y: 0.842, r: 0.03 }, { x: 0.062, y: 0.714, r: 0.03 }, { x: 0.945, y: 0.708, r: 0.03 }],
    beacons: [
      { x: 0.603, y: 0.501, color: 'red' },
      { x: 0.418, y: 0.552, color: 'red' },
      { x: 0.709, y: 0.824, color: 'red' },
      { x: 0.285, y: 0.823, color: 'red' },
      { x: 0.947, y: 0.619, color: 'red' },
      { x: 0.051, y: 0.625, color: 'red' },
    ],
  }),
  harbor_ur: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.536, y: 0.884, r: 0.05 }, { x: 0.482, y: 0.813, r: 0.04 }, { x: 0.627, y: 0.719, r: 0.04 }, { x: 0.345, y: 0.74, r: 0.04 }, { x: 0.508, y: 0.657, r: 0.04 }],
    beacons: [
      { x: 0.457, y: 0.561, color: 'red' },
      { x: 0.597, y: 0.625, color: 'red' },
      { x: 0.735, y: 0.697, color: 'red' },
    ],
  }),
  harbor_ul: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.456, y: 0.888, r: 0.05 }, { x: 0.636, y: 0.757, r: 0.04 }, { x: 0.46, y: 0.655, r: 0.04 }, { x: 0.318, y: 0.731, r: 0.04 }, { x: 0.49, y: 0.82, r: 0.04 }],
    beacons: [
      { x: 0.242, y: 0.686, color: 'red' },
      { x: 0.381, y: 0.629, color: 'red' },
      { x: 0.507, y: 0.548, color: 'red' },
    ],
  }),
  harbor_lr: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.343, y: 0.662, r: 0.04 }, { x: 0.437, y: 0.579, r: 0.04 }, { x: 0.566, y: 0.428, r: 0.04 }, { x: 0.33, y: 0.501, r: 0.04 }, { x: 0.461, y: 0.332, r: 0.04 }],
    beacons: [
      { x: 0.561, y: 0.634, color: 'red' },
      { x: 0.633, y: 0.544, color: 'red' },
      { x: 0.766, y: 0.462, color: 'red' },
    ],
  }),
  harbor_ll: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 12, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.56, y: 0.575, r: 0.05 }, { x: 0.659, y: 0.633, r: 0.05 }, { x: 0.412, y: 0.387, r: 0.05 }, { x: 0.524, y: 0.309, r: 0.05 }, { x: 0.654, y: 0.484, r: 0.05 }],
    beacons: [
      { x: 0.405, y: 0.634, color: 'red' },
      { x: 0.308, y: 0.551, color: 'red' },
      { x: 0.197, y: 0.452, color: 'red' },
    ],
  }),
  bus_depot_ur: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.19, 0.721], [0.478, 0.862], [0.478, 0.927], [0.188, 0.789]], rows: 2, cols: 4 },
      { c: [[0.518, 0.871], [0.731, 0.759], [0.731, 0.825], [0.52, 0.935]], rows: 2, cols: 3 },
    ],
    lamps: [{ x: 0.868, y: 0.726, r: 0.04 }, { x: 0.121, y: 0.716, r: 0.04 }],
  }),
  bus_depot_ul: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.27, 0.756], [0.479, 0.861], [0.478, 0.929], [0.27, 0.831]], rows: 2, cols: 3 },
      { c: [[0.522, 0.865], [0.815, 0.715], [0.815, 0.784], [0.522, 0.933]], rows: 2, cols: 4 },
    ],
    lamps: [{ x: 0.091, y: 0.733, r: 0.04 }, { x: 0.855, y: 0.699, r: 0.04 }],
  }),
  bus_depot_lr: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.194, 0.608], [0.386, 0.698], [0.383, 0.766], [0.195, 0.677]], rows: 2, cols: 3 },
      { c: [[0.49, 0.68], [0.74, 0.573], [0.74, 0.617], [0.488, 0.716]], rows: 1, cols: 3 },
    ],
    lamps: [{ x: 0.397, y: 0.762, r: 0.04 }, { x: 0.492, y: 0.73, r: 0.04 }, { x: 0.577, y: 0.693, r: 0.04 }, { x: 0.675, y: 0.661, r: 0.04 }, { x: 0.311, y: 0.732, r: 0.04 }, { x: 0.236, y: 0.698, r: 0.04 }],
  }),
  bus_depot_ll: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.336, 0.617], [0.601, 0.711], [0.6, 0.751], [0.335, 0.647]], rows: 1, cols: 3 },
      { c: [[0.613, 0.698], [0.806, 0.608], [0.804, 0.665], [0.613, 0.755]], rows: 2, cols: 3 },
    ],
    lamps: [{ x: 0.595, y: 0.763, r: 0.04 }, { x: 0.511, y: 0.729, r: 0.04 }, { x: 0.425, y: 0.703, r: 0.04 }, { x: 0.322, y: 0.675, r: 0.03 }, { x: 0.7, y: 0.726, r: 0.04 }, { x: 0.798, y: 0.677, r: 0.04 }],
  }),
  park_small_plaza: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.496, y: 0.477, r: 0.03 }, { x: 0.364, y: 0.535, r: 0.03 }],
  }),
  park_small_playground: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 12, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.501, y: 0.538, r: 0.05 }, { x: 0.133, y: 0.659, r: 0.04 }],
  }),
  park_small_palm: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.494, y: 0.911, r: 0.03 }, { x: 0.403, y: 0.871, r: 0.03 }, { x: 0.218, y: 0.777, r: 0.03 }, { x: 0.879, y: 0.717, r: 0.03 }],
  }),
  park_small_open: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 12, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.412, y: 0.644, r: 0.04 }],
  }),
  park_small_garden: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 12, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.504, y: 0.866, r: 0.04 }],
  }),
  park_large_pool: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 12, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.583, y: 0.707, r: 0.04 }, { x: 0.72, y: 0.56, r: 0.04 }, { x: 0.313, y: 0.677, r: 0.03 }, { x: 0.233, y: 0.6, r: 0.03 }, { x: 0.17, y: 0.528, r: 0.04 }, { x: 0.791, y: 0.458, r: 0.02 }],
  }),
  park_large_highscore: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.622, y: 0.835, r: 0.04 }, { x: 0.362, y: 0.832, r: 0.04 }, { x: 0.777, y: 0.704, r: 0.04 }, { x: 0.206, y: 0.707, r: 0.04 }, { x: 0.5, y: 0.771, r: 0.03 }, { x: 0.394, y: 0.696, r: 0.03 }, { x: 0.597, y: 0.693, r: 0.04 }],
  }),
  park_flagship_victoria: makeBuildingLightProfile({
    class: 'off',
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 12, cols: 5, on: false },
    ],
    lamps: [{ x: 0.553, y: 0.931, r: 0.03 }, { x: 0.447, y: 0.925, r: 0.03 }, { x: 0.465, y: 0.806, r: 0.02 }, { x: 0.595, y: 0.831, r: 0.03 }, { x: 0.339, y: 0.866, r: 0.03 }, { x: 0.417, y: 0.831, r: 0.03 }, { x: 0.5, y: 0.85, r: 0.03 }, { x: 0.286, y: 0.758, r: 0.03 }, { x: 0.341, y: 0.73, r: 0.03 }, { x: 0.244, y: 0.785, r: 0.03 }, { x: 0.205, y: 0.725, r: 0.03 }, { x: 0.352, y: 0.657, r: 0.03 }, { x: 0.259, y: 0.625, r: 0.03 }, { x: 0.129, y: 0.697, r: 0.03 }, { x: 0.596, y: 0.641, r: 0.03 }, { x: 0.711, y: 0.696, r: 0.03 }, { x: 0.671, y: 0.592, r: 0.03 }, { x: 0.794, y: 0.658, r: 0.03 }, { x: 0.527, y: 0.568, r: 0.03 }, { x: 0.689, y: 0.831, r: 0.03 }],
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
// The record is checked first because it is rewritten whenever a lot
// redevelops into a different model, while the sprite's copy is only as fresh
// as whatever last set it.
function getBuildingLightModelSlug(record, sprite) {
  const file = record?.sourceFileName
    ?? sprite?.modelSourceFileName
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
  // Baked art already carries the windows and lamps; only the beacons are live.
  const drawStatic = !glow.beaconsOnly;
  // window normal-space -> Graphics-local px (relative to the sprite's origin)
  const px = (q) => q.map((p) => ({
    x: (p[0] - glow.originX) * glow.texW,
    y: (p[1] - glow.originY) * glow.texH,
  }));

  // Windows are the expensive half and only drawn for buildings inside the
  // window LOD budget (see BUILDING_LIGHT_CONFIG.windowBudget). Lamps below are
  // always drawn - they are a few circles and carry the night read at distance.
  glow.drewWindows = drawStatic && !!glow.windowsAllowed;
  if (drawStatic && glow.windowsAllowed) {
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
  const lamps = drawStatic ? (profile.lamps || []) : [];
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
  // While the calibrator is open the live glow wins even for baked models,
  // otherwise an edit would appear to do nothing against the stale bake.
  const calibrating = typeof isBuildingLightCalibrationInputActive === 'function'
    && isBuildingLightCalibrationInputActive();

  s.buildingSprites.forEach((sprite, key) => {
    if (!sprite || !sprite.active) return;
    const id = getTileId(sprite.mapRow, sprite.mapCol);
    if (key !== id || liveIds.has(id)) return; // once per building, at its anchor tile
    liveIds.add(id);
    let glow = glows.get(id);
    if (glow && (
      glow.sprite !== sprite
      || glow.textureKey !== (sprite.texture?.key || null)
      // a beacons-only glow is not enough to preview an edit against
      || (calibrating && glow.beaconsOnly)
    )) {
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
      // A model with a baked night texture carries its glow in its own pixels -
      // giving it a glow object too would both double the light and reintroduce
      // the per-object render cost the bake exists to remove. Models with no
      // baked art (not yet calibrated, or calibrated since the last bake) keep
      // this live glow, so the calibrator workflow still shows something.
      const baked = !calibrating
        && typeof getBuildingNightTextureKey === 'function'
        && !!getBuildingNightTextureKey(sprite);
      let beaconsOnly = false;
      if (baked) {
        // Beacons blink, so they cannot live in a static texture. A baked model
        // whose profile has any keeps a glow that carries only the beacon
        // sprites: its Graphics object stays hidden, so it never draws windows
        // or lamps and never joins the per-object render cost the bake removed.
        const record = buildingLightRecordFor(sprite);
        const profile = resolveBuildingLightProfile(
          record,
          sprite.logicalSpriteKey || sprite.renderTextureKey,
          getBuildingLightModelSlug(record, sprite),
        );
        if (!(profile.beacons || []).length) return;
        beaconsOnly = true;
      }
      glow = createBuildingLightGlow(s, sprite);
      if (!glow) return;
      if (beaconsOnly) {
        glow.beaconsOnly = true;
        glow.windowsAllowed = false;
        glow.gfx.setVisible(false);
      }
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
      if (!sp || !sp.visible || glow.beaconsOnly) return;
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
  BUILDING_NIGHT_PEAK_SHARE,
  BUILDING_NIGHT_LAMPS_SHARE,
  BUILDING_NIGHT_VARIANTS,
  getBuildingNightKind,
  getBuildingNightVariant,
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
    getBuildingNightKind,
    getBuildingNightVariant,
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
