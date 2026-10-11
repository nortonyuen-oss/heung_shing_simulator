// 節慶素材表: every festival prop and the textures baked from it (docs/festival-dlc-design.md §5).
//
// Sources: scripts/source-art/festivals/original/<Festival>/ holds Norton's renders as delivered
// (sheets and single props). Each one used in game is first squared to 2:1 isometric -
// scripts/source-art/festivals/isometric-correction.json, run through the typhoon shelter's
// tools/correct.py (vertical skew + x:y scale, never a perspective warp) - into
// scripts/source-art/festivals/<Festival>/. A `part` here is one object on such a corrected sheet:
// the whole sheet, or a crop rectangle when a sheet holds several props.
//
// The bake (scripts/bake-festival-textures.js) writes, per part:
//   Models/festivals/fx_<id>.png          the day texture
//   Models/festivals/fx_<id>_m.png        its mirror (the other diagonal), when `mirror`
//   ...__lit.png / ...__litb.png          night, when `lit`: two twinkle frames (renderFestivalNightPixels)
// and records each texture's size and anchor (bottom centre of the object, texture px) in
// data/festival-textures.json. Night variants are __lit*, never __night* (that suffix belongs to
// the building night bake). Mirroring happens here, never with setFlipX at runtime; parts with
// readable lettering set mirror: false.
//
// Sizes are real: heightM is the object's height from the ground to its top, lengthM its long
// side, drawn at 1 tile = 20 m (5 px a metre of height at zoom 1), like the typhoon shelter art.
// Models/festivals/Christmas/buildingDeco/ is not part of this: those are the 聖誕幕牆 overlays
// composited into the building night bake (christmas-wall.js).

const FESTIVAL_TEXTURE_DIR = 'Models/festivals';
const FESTIVAL_SOURCE_DIR = 'scripts/source-art/festivals';
const FESTIVAL_TEXTURE_PREFIX = 'fx_';

const FESTIVAL_PART_CATEGORIES = Object.freeze([
  ['decoration', '裝飾／燈飾'],
  ['structure', '舞台／棚架'],
  ['stall', '攤位'],
  ['vessel', '船隻'],
  ['crowd', '人群'],
  ['prop', '道具'],
]);

// festival: a FESTIVAL_DEFINITIONS id (festivals.js). sheet: under FESTIVAL_SOURCE_DIR. rect:
// [x, y, w, h] on the sheet, or null for the whole sheet. saturation: < 1 tones a loud render down
// at bake time (Norton prefers muted, realistic colour on surfaces; light sculptures stay as drawn).
// axis: the screen diagonal the part's long axis (a sleigh's length, an arch's span) runs along in
// the unmirrored art - '/' (lower left to upper right) or '\\' - so a placement can pick the view
// that lies along or across its venue (festival-sprites.js); null for round things.
const festivalPart = (id, festival, sheet, category, label, extra = {}) => Object.freeze({
  id,
  festival,
  sheet,
  rect: extra.rect ? Object.freeze(extra.rect) : null,
  category,
  label,
  heightM: extra.heightM ?? null,
  lengthM: extra.lengthM ?? null,
  mirror: extra.mirror !== false,
  axis: extra.axis ?? null,
  lit: !!extra.lit,
  saturation: extra.saturation ?? 1,
});

const FESTIVAL_PARTS = Object.freeze([
  // 聖誕 (docs/festival-dlc-design.md §4.6). The chapel is not the heritage_church model's
  // December look - a different building altogether - so it stands on its own.
  festivalPart('christmasChapel', 'christmas', 'Christmas/ChristmasDeco1.png', 'structure', '聖誕小教堂', { heightM: 16, lit: true }),
  // 9 m, not a real plaza tree's 15-20: beside the game's compressed buildings 15 m dwarfed a mall
  // (Norton 2026-10-11: 聖誕樹太大)
  festivalPart('christmasTree', 'christmas', 'Christmas/ChristmasDeco2.png', 'decoration', '聖誕樹', { heightM: 9, lit: true }),
  festivalPart('christmasLightArch', 'christmas', 'Christmas/ChristmasDeco3.png', 'decoration', '燈飾拱門', { heightM: 7, lit: true, axis: '/' }),
  festivalPart('christmasGiftArch', 'christmas', 'Christmas/ChristmasDeco4.png', 'decoration', '禮物拱門', { heightM: 6, lit: true, axis: '/' }),
  festivalPart('christmasSleigh', 'christmas', 'Christmas/ChristmasDeco5.png', 'decoration', '雪橇燈飾', { lengthM: 16, lit: true, axis: '/' }),
]);
const FESTIVAL_PARTS_BY_ID = Object.freeze(Object.fromEntries(FESTIVAL_PARTS.map((p) => [p.id, p])));

function getFestivalTextureKey(partId, mirrored = false) {
  return `${FESTIVAL_TEXTURE_PREFIX}${partId}${mirrored ? '_m' : ''}`;
}

function getFestivalTexturePath(partId, mirrored = false) {
  return `${FESTIVAL_TEXTURE_DIR}/${getFestivalTextureKey(partId, mirrored)}.png`;
}

/** The textures a part bakes to: [{ file, mirrored }], the mirror second. */
function getFestivalPartTextures(part) {
  const textures = [{ file: getFestivalTexturePath(part.id), mirrored: false }];
  if (part.mirror) textures.push({ file: getFestivalTexturePath(part.id, true), mirrored: true });
  return textures;
}

function getFestivalParts(festivalId) {
  return FESTIVAL_PARTS.filter((p) => p.festival === festivalId);
}

// ── Night art ────────────────────────────────────────────────────────────────
// The renders already show their bulbs lit; at night everything else darkens and the bulbs stay.
// A pixel is a light when it is bright and either near-white (white bulbs, snowflakes) or a warm
// yellow-orange (fairy lights, star lanterns). Frame b twinkles: about one in four lights, picked
// by 6 px cells so a bulb dims as a whole, drops to FESTIVAL_NIGHT_TWINKLE.
const FESTIVAL_NIGHT_DIM = 0.5;
const FESTIVAL_NIGHT_TWINKLE = 0.6;
const FESTIVAL_LIGHT_MIN_VALUE = 0.82;
const FESTIVAL_WHITE_LIGHT_MIN_VALUE = 0.96;
const FESTIVAL_TWINKLE_CELL = 6;

function festivalLightStrength(r, g, b) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max < FESTIVAL_LIGHT_MIN_VALUE) return 0;
  const sat = max ? (max - min) / max : 0;
  const ramp = Math.min(1, (max - FESTIVAL_LIGHT_MIN_VALUE) / (1 - FESTIVAL_LIGHT_MIN_VALUE) * 2.5);
  // near-white needs to be brighter still: cream walls and white paint are not bulbs
  if (sat < 0.3) return max >= FESTIVAL_WHITE_LIGHT_MIN_VALUE ? Math.min(1, (max - FESTIVAL_WHITE_LIGHT_MIN_VALUE) / (1 - FESTIVAL_WHITE_LIGHT_MIN_VALUE) * 2) : 0;
  // hue of a warm light: red channel highest, green not far behind (yellow-orange, not red)
  if (r >= g && g >= b && g / Math.max(1, r) > 0.62) return ramp;
  return 0;
}

function festivalTwinkleHash(cx, cy) {
  let h = (cx * 374761393 + cy * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The night texture of a lit part: the art dimmed, its lights kept.
 * @param {Uint8Array|Buffer} day RGBA, straight alpha
 * @param {number} W
 * @param {number} H
 * @param {{ frame?: 0|1 }} [opts] frame 1 is the twinkle frame
 * @returns {Uint8Array} RGBA, same size, alpha unchanged
 */
function renderFestivalNightPixels(day, W, H, opts = {}) {
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = day[i + 3];
      if (!a) continue;
      const r = day[i]; const g = day[i + 1]; const b = day[i + 2];
      let light = festivalLightStrength(r, g, b);
      if (light && opts.frame === 1 && festivalTwinkleHash(Math.floor(x / FESTIVAL_TWINKLE_CELL), Math.floor(y / FESTIVAL_TWINKLE_CELL)) < 0.25) {
        light *= FESTIVAL_NIGHT_TWINKLE;
      }
      const k = FESTIVAL_NIGHT_DIM + (1 - FESTIVAL_NIGHT_DIM) * light;
      // the night sky's blue cast on what is not lit
      out[i] = Math.round(r * k * (light ? 1 : 0.92));
      out[i + 1] = Math.round(g * k * (light ? 1 : 0.96));
      out[i + 2] = Math.round(b * k);
      out[i + 3] = a;
    }
  }
  return out;
}

/** Tone an RGBA buffer's saturation in place (1 = as drawn). */
function applyFestivalSaturation(data, saturation) {
  if (!(saturation < 1)) return data;
  const s = Math.max(0, saturation);
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    for (let k = 0; k < 3; k++) data[i + k] = Math.max(0, Math.min(255, Math.round(l + (data[i + k] - l) * s)));
  }
  return data;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FESTIVAL_TEXTURE_DIR,
    FESTIVAL_SOURCE_DIR,
    FESTIVAL_TEXTURE_PREFIX,
    FESTIVAL_PART_CATEGORIES,
    FESTIVAL_PARTS,
    FESTIVAL_PARTS_BY_ID,
    FESTIVAL_NIGHT_DIM,
    getFestivalTextureKey,
    getFestivalTexturePath,
    getFestivalPartTextures,
    getFestivalParts,
    festivalLightStrength,
    renderFestivalNightPixels,
    applyFestivalSaturation,
  };
}
