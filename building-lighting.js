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

// Calibrated per-model "hero" overrides, keyed by logical sprite key, baked from
// building-light-calibrator.js (2026-08-30 pass).
const BUILDING_LIGHT_HERO_PROFILES = {
  house2x2_15: makeBuildingLightProfile({
    class: 'res', ex: 0.729, ey: 0.888, er: 0.1,
    panels: [
      { c: [[0.147, 0.227], [0.5, 0.313], [0.497, 0.881], [0.142, 0.79]], rows: 14, cols: 5 },
      { c: [[0.505, 0.316], [0.866, 0.227], [0.869, 0.791], [0.503, 0.884]], rows: 13, cols: 5 },
    ],
  }),
  house3x3_8: makeBuildingLightProfile({
    class: 'res', ex: 0.507, ey: 0.908, er: 0.1,
    panels: [
      { c: [[0.349, 0.176], [0.512, 0.242], [0.511, 0.809], [0.352, 0.74]], rows: 16, cols: 5 },
      { c: [[0.515, 0.238], [0.654, 0.181], [0.658, 0.743], [0.511, 0.815]], rows: 16, cols: 5 },
    ],
  }),
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
  commercial_building_3x3_0: makeBuildingLightProfile({
    class: 'off', ex: 0.5, ey: 0.9, er: 0.1,
    panels: [
      { c: [[0.347, 0.338], [0.493, 0.397], [0.491, 0.667], [0.346, 0.602]], rows: 12, cols: 4 },
      { c: [[0.611, 0.456], [0.779, 0.381], [0.778, 0.616], [0.609, 0.694]], rows: 11, cols: 5 },
    ],
  }),
  commercial_building_3x3_3: makeBuildingLightProfile({
    class: 'off', ex: 0.325, ey: 0.758, er: 0.1,
    panels: [
      { c: [[0.353, 0.303], [0.496, 0.364], [0.499, 0.674], [0.342, 0.598]], rows: 12, cols: 4 },
      { c: [[0.499, 0.367], [0.65, 0.296], [0.65, 0.597], [0.5, 0.669]], rows: 12, cols: 4 },
    ],
  }),
  house2x2_16: makeBuildingLightProfile({
    class: 'res', ex: 0.5, ey: 0.9, er: 0.1,
    panels: [
      { c: [[0.33, 0.281], [0.505, 0.35], [0.506, 0.747], [0.324, 0.652]], rows: 10, cols: 7 },
      { c: [[0.521, 0.348], [0.672, 0.281], [0.671, 0.663], [0.522, 0.743]], rows: 11, cols: 6 },
    ],
  }),
  house3x3_6: makeBuildingLightProfile({
    class: 'res', ex: 0.625, ey: 0.874, er: 0.1,
    panels: [
      { c: [[0.383, 0.395], [0.493, 0.442], [0.49, 0.831], [0.379, 0.784]], rows: 15, cols: 6 },
      { c: [[0.51, 0.445], [0.609, 0.397], [0.609, 0.779], [0.507, 0.836]], rows: 15, cols: 6 },
    ],
  }),
  heritage_church_3x3: makeBuildingLightProfile({
    class: 'res', ex: 0.5, ey: 0.9, er: 0.1,
    panels: [
      { c: [[0.286, 0.518], [0.328, 0.544], [0.341, 0.762], [0.294, 0.74]], rows: 2, cols: 1 },
      { c: [[0.449, 0.781], [0.72, 0.658], [0.721, 0.718], [0.455, 0.835]], rows: 1, cols: 7 },
    ],
  }),
  house2x2_6: makeBuildingLightProfile({
    class: 'res', ex: 0.5, ey: 0.9, er: 0.1,
    panels: [
      { c: [[0.259, 0.259], [0.461, 0.349], [0.462, 0.642], [0.256, 0.565]], rows: 7, cols: 5 },
      { c: [[0.714, 0.33], [0.756, 0.311], [0.76, 0.671], [0.714, 0.692]], rows: 7, cols: 1 },
    ],
  }),
  house2x2_5: makeBuildingLightProfile({
    class: 'res', ex: 0.507, ey: 0.811, er: 0.1,
    panels: [
      { c: [[0.279, 0.587], [0.475, 0.489], [0.475, 0.628], [0.276, 0.732]], rows: 4, cols: 4 },
      { c: [[0.52, 0.471], [0.702, 0.567], [0.7, 0.717], [0.517, 0.624]], rows: 4, cols: 4 },
    ],
  }),
  house2x2_4: makeBuildingLightProfile({
    class: 'res', ex: 0.5, ey: 0.9, er: 0.1,
    panels: [
      { c: [[0.126, 0.269], [0.493, 0.353], [0.493, 0.852], [0.113, 0.761]], rows: 14, cols: 5 },
      { c: [[0.501, 0.36], [0.871, 0.261], [0.868, 0.77], [0.504, 0.867]], rows: 14, cols: 5 },
    ],
  }),
  park_large: makeBuildingLightProfile({
    class: 'off', ex: 0.647, ey: 0.762, er: 0.1,
    panels: [
      { c: [[0.15, 0.11], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 12, cols: 5, on: false },
      { c: [[0.5, 0.28], [0.85, 0.11], [0.85, 0.56], [0.5, 0.72]], rows: 12, cols: 5, on: false },
    ],
  }),
  house2x2_9: makeBuildingLightProfile({
    class: 'res', ex: 0.5, ey: 0.9, er: 0.1,
    panels: [
      { c: [[0.321, 0.282], [0.501, 0.358], [0.501, 0.736], [0.322, 0.646]], rows: 14, cols: 5 },
      { c: [[0.522, 0.358], [0.673, 0.293], [0.67, 0.635], [0.524, 0.707]], rows: 15, cols: 4 },
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
  house3x3_4: makeBuildingLightProfile({
    class: 'res', ex: 0.5, ey: 0.9, er: 0.1,
    panels: [
      { c: [[0.328, 0.538], [0.554, 0.626], [0.551, 0.711], [0.325, 0.604]], rows: 2, cols: 5 },
      { c: [[0.654, 0.655], [0.786, 0.583], [0.785, 0.649], [0.653, 0.725]], rows: 2, cols: 5 },
    ],
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

function resolveBuildingLightProfile(record, spriteKey) {
  const family = getBuildingLightFamily(record);
  const override = typeof getBuildingLightCalibrationOverride === 'function'
    ? getBuildingLightCalibrationOverride(spriteKey, family)
    : null;
  if (override) return override;
  return (spriteKey && BUILDING_LIGHT_HERO_PROFILES[spriteKey])
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

function setupBuildingLights(scene) {
  if (!scene) return;
  ensureBuildingLightTextures(scene);
  scene.buildingLightGlows = scene.buildingLightGlows || new Map(); // anchor tileId -> glow state
  scene.buildingLightQueue = scene.buildingLightQueue || [];       // anchor tileIds pending relight
  scene.buildingLightBucket = scene.buildingLightBucket || null;
  scene.buildingLightsActive = false;
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
  const profile = resolveBuildingLightProfile(record, sprite.logicalSpriteKey || sprite.renderTextureKey);
  const cells = computeLitBuildingWindows(profile, glow.seed, bucket, glow.jitterNonce, glow.personality);
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
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!cell.on) continue;
    g.fillStyle(tint, Math.min(0.5, cell.alpha * 0.3));
    g.fillPoints(px(scaleBuildingLightQuad(cell.quad, 1.7)), true);
    g.fillStyle(tint, Math.min(1, cell.alpha));
    g.fillPoints(px(cell.quad), true);
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
    resolveBuildingLightProfile,
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
