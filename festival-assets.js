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
  // drawn as it is by night too (its own light: the UFO), never darkened with the props
  selfLit: !!extra.selfLit,
  // 盂蘭 (festival-yulan.js): a fire burns in it at night, a green ghost light hangs over it, or it is
  // a paper effigy burned at the end of the night
  fire: !!extra.fire,
  ghostLight: !!extra.ghostLight,
  effigy: !!extra.effigy,
  // the rect cut as it is (a person out of a crowd drawn as one connected piece)
  crop: !!extra.crop,
  // baked as a 阿飄 (applyFestivalGhostly)
  ghostly: !!extra.ghostly,
  saturation: extra.saturation ?? 1,
  geometry: extra.geometry ?? null,
});

const DRAGON_BOAT_GEOMETRY = typeof require === 'function' ? require('./data/dragon-boat-geometry.json') : null;

const DRAGON_BOAT_CROWD_GEOMETRY = typeof require === 'function' ? require('./data/dragon-boat-crowd-geometry.json') : null;

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

  // 新春 年宵 (§4.1). The box stalls are one style, squared together (isometric-correction.json);
  // the rest - the lions, the stage, the arch, round or irregular - bake straight from the renders.
  // Parts with readable lettering (揮春, 利是, the banners, the site map) are never mirrored.
  // Sizes (Norton 2026-10-11: 舞台同攤位太大): the squared renders were drawn from a low angle and come
  // out tall, so the stalls, stage and gate are sized by their footprint - lengthM is the two sides of
  // it added (a 2 x 2 m stall: 4) - not by their height. People and lions stay a little larger than
  // life so they read at all.
  ...[
    [5, 'lnyStallEmpty', '吉攤（未租出）', true],
    [6, 'lnyStallNarcissus', '水仙攤', true],
    [8, 'lnyStallBlossoms', '花攤（桃花年桔蘭花）', true],
    [9, 'lnyStallLaisee', '利是揮春攤', false],
    [10, 'lnyStallPinwheels', '風車攤', true],
    [13, 'lnyStallToys', '玩具精品攤', true],
    [16, 'lnyStallPeach', '桃花攤', true],
    [19, 'lnyStallKumquat', '年桔攤', true],
    [21, 'lnyStallOrchids', '蘭花攤', true],
    [23, 'lnyInfoBooth', '詢問處', false],
    [24, 'lnyStallFlowers', '鮮花攤', true],
    [26, 'lnyStallCouplets', '揮春攤', false],
    [28, 'lnyStallSnacks', '熟食小食攤', true],
    [29, 'lnyStallGifts', '賀年精品攤', true],
  ].map(([n, id, label, mirror]) => festivalPart(id, 'lunarNewYear', `LunarNewYear/lunarNewYearMarket${n}.png`, 'stall', label, { lengthM: 4, mirror, lit: true })),
  ...[
    [3, 'lnyDragon', '舞龍', 'crowd', { lengthM: 9 }],
    [4, 'lnyBarrier', '鐵馬', 'prop', { heightM: 1.1 }],
    [7, 'lnyLionPair', '醒獅一對', 'crowd', { heightM: 1.6 }],
    [11, 'lnyLionLeader', '大頭佛', 'crowd', { heightM: 1.7 }],
    [12, 'lnySiteMap', '場地地圖', 'prop', { heightM: 2.4, mirror: false }],
    [14, 'lnyTrolleyFlowers', '運花手推車', 'prop', { heightM: 1.4 }],
    [15, 'lnyFirecrackers', '炮仗裝飾架', 'decoration', { heightM: 2.4, mirror: false, lit: true }],
    [17, 'lnyLionRed', '紅獅', 'crowd', { heightM: 1.6 }],
    [18, 'lnyTrolleyBoxes', '運貨手推車', 'prop', { heightM: 1.4 }],
    [20, 'lnyLionGold', '黃獅', 'crowd', { heightM: 1.6 }],
    [22, 'lnyLionPoles', '梅花樁舞獅', 'crowd', { heightM: 2.8 }],
    [25, 'lnyDrum', '獅鼓鑼鈸', 'prop', { heightM: 1.4 }],
    [27, 'lnyBanners', '龍獅旗', 'decoration', { heightM: 2.6, mirror: false }],
    [30, 'lnyCaiQing', '採青台', 'prop', { heightM: 1.8, mirror: false, lit: true }],
  ].map(([n, id, label, category, extra]) => festivalPart(id, 'lunarNewYear', `original/LunarNewYear/lunarNewYearMarket${n}.png`, category, label, extra)),
  // the stage and the gate, squared like the stalls: a 5 x 3 m stage, a 4 m gate across the way in
  festivalPart('lnyStage', 'lunarNewYear', 'LunarNewYear/lunarNewYearMarket1.png', 'structure', '戲棚舞台', { lengthM: 8, lit: true }),
  // the gate stands on the park's edge, its beam along it (Norton 2026-10-11): squared like the
  // stalls, the mirror for the other diagonal; lengthM: its span, about 6 m
  festivalPart('lnyGate', 'lunarNewYear', 'LunarNewYear/lunarNewYearMarket2.png', 'structure', '年宵入口牌樓', { lengthM: 6, lit: true, axis: '\\' }),
  // the temple's 頭炷香: the 盂蘭 render's bronze incense burner, shared
  festivalPart('templeIncenseBurner', 'lunarNewYear', 'original/July14/July14accessories10.png', 'prop', '香爐', { heightM: 1.3, lit: true }),

  // 端午: corrected art, measured waterlines, four views via baked mirrors.
  ...['black', 'blue', 'green', 'purple', 'red', 'yellow'].flatMap((color) => ['NW', 'SW'].map((view) => {
    const name = `${color}Dragon${view}`;
    return festivalPart(`db${color}${view}`, 'dragonBoat', `DragonBoat/${name}.png`, 'vessel', name,
      { lengthM: 18, geometry: DRAGON_BOAT_GEOMETRY?.[name], axis: view === 'NW' ? '\\' : '/' });
  })),
  ...[
    ['viewersStage', '龍舟看台', 16], ['ceremonyStage', '龍舟大會台', 10],
    ['championStand1', '龍舟頒獎台', 10], ['championStand2', '龍舟頒獎台', 10],
    ['pier', '龍舟浮台', 8], ['rescueBoat', '救援艇', 7], ['guardLine', '線道浮波', 10],
  ].map(([name, label, lengthM]) => festivalPart(`db${name}`, 'dragonBoat', `DragonBoat/${name}.png`,
    name === 'rescueBoat' ? 'vessel' : 'structure', label, { lengthM, geometry: DRAGON_BOAT_GEOMETRY?.[name], axis: ['championStand1','championStand2','rescueBoat'].includes(name) ? '\\' : '/' })),
  ...[['startMarker', '起點浮標', 3], ['goalMarker', '終點浮標', 4], ['raceBuoy', '比賽浮標', 1.2]]
    .map(([name, label, heightM]) => festivalPart(`db${name}`, 'dragonBoat', `DragonBoat/${name}.png`, 'prop', label,
      { heightM, geometry: DRAGON_BOAT_GEOMETRY?.[name] })),

  ...['Back1','Front1','Back2','Front2'].map(view => festivalPart(`dbspectators${view}`, 'dragonBoat', `DragonBoat/spectators${view}.png`, 'crowd', `龍舟觀眾 ${view}`, {heightM:1.7, geometry:DRAGON_BOAT_CROWD_GEOMETRY?.[`spectators${view}`]})),

  // 六四 (§4.3, quiet; Norton 2026-10-13): candles, the 國殤之柱, flowers and people sitting with
  // candles - nothing of a rally. The candle patches are squared by their four ground corners
  // (tools/quad.py), the pillar by skew + x:y scale (isometric-correction.json). The people are drawn
  // at the park art's own scale - its figures are about 0.3 m tall by the game's metres, the park
  // being drawn about a fifth of life size - so they sit among it quietly instead of towering.
  festivalPart('june4Candles1', 'june4', 'June/JuneMemorial1.png', 'decoration', '燭光（大）', { lengthM: 3, lit: true }),
  festivalPart('june4Candles2', 'june4', 'June/JuneMemorial2.png', 'decoration', '燭光（細）', { lengthM: 3, lit: true }),
  festivalPart('june4Pillar', 'june4', 'June/pillarOfShame.png', 'structure', '國殤之柱', { heightM: 3, lit: true }),
  festivalPart('june4Sitting', 'june4', 'original/June/JuneMemorial4.png', 'crowd', '持燭席地市民', { heightM: 0.3, lit: true }),
  festivalPart('june4Flowers', 'june4', 'original/June/JuneMemorial5.png', 'decoration', '白菊花束', { heightM: 0.5, lit: true }),
  ...[
    ['june4SitA', [23, 735, 121, 94], '席地市民 A'],
    ['june4SitB', [165, 744, 116, 89], '席地市民 B'],
    ['june4SitC', [290, 733, 158, 90], '席地市民 C'],
  ].map(([id, rect, label]) => festivalPart(id, 'june4', 'original/June/維多利亞公園六四燭光追思像素素材集.png', 'crowd', label, { heightM: 0.28, rect, lit: true })),

  // 盂蘭 (§4.4, Phase 6): the opera stage squared by its deck and side wall, the offering mat by its
  // four corners; the burning bins, round, as drawn. The sheet pieces (pixel art) are already near
  // 2:1. Lettered pieces (孤魂之位, 奠, 燒街衣) are never mirrored. Fire glow, smoke and the green
  // ghost lights are drawn at runtime (festival-yulan.js).
  festivalPart('yulanStage', 'yulan', 'July14/July14MainStage1.png', 'structure', '神功戲棚', { lengthM: 24, lit: true }),
  festivalPart('yulanMat', 'yulan', 'July14/July14accessories4.png', 'prop', '供品蓆', { lengthM: 3.4, lit: true }),
  festivalPart('yulanRedCandles', 'yulan', 'original/July14/July14accessories1.png', 'prop', '紅燭', { heightM: 0.5, lit: true }),
  festivalPart('yulanBasket', 'yulan', 'original/July14/July14accessories3.png', 'prop', '衣紙籃', { heightM: 0.6 }),
  festivalPart('yulanBinStool', 'yulan', 'original/July14/July14accessories5.png', 'prop', '化寶桶連膠櫈', { heightM: 1, lit: true, fire: true }),
  festivalPart('yulanCauldron', 'yulan', 'original/July14/July14accessories6.png', 'prop', '化寶鑊', { heightM: 0.9, lit: true, fire: true }),
  festivalPart('yulanBarrel', 'yulan', 'original/July14/July14accessories7.png', 'prop', '化寶桶', { heightM: 1.1, lit: true, fire: true }),
  festivalPart('yulanPaperStack', 'yulan', 'original/July14/July14accessories8.png', 'prop', '衣紙金銀', { heightM: 0.6 }),
  ...[
    ['yulanShrine', 'original/July14/中式祭祀焚燒道具像素素材表.png', [636, 346, 243, 342], '孤魂之位', 'structure', { heightM: 3, mirror: false, lit: true, ghostLight: true }],
    ['yulanBanner', 'original/July14/中式祭祀焚燒道具像素素材表.png', [1197, 325, 130, 362], '「奠」幡', 'decoration', { heightM: 4, mirror: false }],
    ['yulanFurnace', 'original/July14/中式祭祀焚燒道具像素素材表.png', [1153, 44, 165, 266], '化寶爐', 'structure', { heightM: 2.4, lit: true, fire: true }],
    ['yulanHorse', 'original/July14/中式祭祀焚燒道具像素素材表.png', [715, 740, 172, 223], '紙紮馬', 'decoration', { heightM: 2.2, effigy: true }],
    ['yulanBoat', 'original/July14/中式祭祀焚燒道具像素素材表.png', [894, 713, 148, 226], '紙紮船', 'decoration', { heightM: 2.2, effigy: true }],
    ['yulanHouse', 'original/July14/香港燒街衣祭典像素素材表.png', [841, 317, 157, 217], '紙紮大屋', 'decoration', { heightM: 2.4, effigy: true }],
    ['yulanAltar', 'original/July14/香港燒街衣祭典像素素材表.png', [18, 282, 219, 269], '供桌', 'structure', { heightM: 1.6, mirror: false, lit: true }],
    ['yulanCage', 'original/July14/香港燒街衣祭典像素素材表.png', [1152, 33, 181, 237], '化寶鐵籠', 'prop', { heightM: 1.2, lit: true, fire: true }],
    ['yulanStools', 'original/July14/香港燒街衣祭典像素素材表.png', [23, 815, 249, 161], '紅藍膠櫈', 'prop', { heightM: 0.5 }],
    ['yulanBarrier', 'original/July14/香港燒街衣祭典像素素材表.png', [963, 755, 171, 188], '「燒街衣」鐵馬', 'prop', { heightM: 1.1, mirror: false }],
    ['yulanCone', 'original/July14/香港燒街衣祭典像素素材表.png', [1324, 782, 99, 143], '雪糕筒', 'prop', { heightM: 0.7 }],
  ].map(([id, sheet, rect, label, category, extra]) => festivalPart(id, 'yulan', sheet, category, label, { ...extra, rect })),
  // people at the street fires (Norton: 燒街衣係有人係路邊燒) and the 阿飄 that come to collect: two
  // people cut from the 端午 crowds, as they are and as ghosts
  ...[
    ['yulanBurnerMan', 'DragonBoat/spectatorsFront1.png', [822, 292, 168, 600], '燒衣街坊（男）', {}],
    ['yulanBurnerWoman', 'DragonBoat/spectatorsFront2.png', [820, 345, 162, 560], '燒衣街坊（女）', {}],
    ['yulanGhostA', 'DragonBoat/spectatorsFront1.png', [822, 292, 168, 600], '阿飄 A', { ghostly: true, selfLit: true }],
    ['yulanGhostB', 'DragonBoat/spectatorsFront2.png', [820, 345, 162, 560], '阿飄 B', { ghostly: true, selfLit: true }],
  ].map(([id, sheet, rect, label, extra]) => festivalPart(id, 'yulan', sheet, 'crowd', label, { heightM: 1.7, rect, crop: true, ...extra })),

  // 發現 UFO (§4.7): six frames of the one saucer - the alien waves, the lamps change - played in
  // turn, all at one scale (festival-ufo.js); the beam is drawn added, stretched to the ground. Nothing
  // on the ground to square to, so they bake straight from the renders (original/).
  ...[1, 2, 3, 4, 5, 6].map((n) => festivalPart(`ufo${n}`, 'ufo', `original/UFO/UFO${n}.png`, 'vessel', `UFO 畫格 ${n}`, { lengthM: 36, mirror: false, selfLit: true })),
  festivalPart('ufoBeam', 'ufo', 'original/UFO/spotLight.png', 'decoration', 'UFO 光柱', { heightM: 40, mirror: false, selfLit: true }),
  festivalPart('ufoWitnesses', 'ufo', 'original/UFO/UFOWitness.png', 'crowd', '目擊市民', { heightM: 6, mirror: true }),
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

/**
 * A person turned into a 阿飄 (盂蘭): pale, washed green-white and see-through. In place, straight alpha.
 */
function applyFestivalGhostly(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    const k = 0.55 + 0.45 * l;
    data[i] = Math.round(150 * k);
    data[i + 1] = Math.round(255 * k);
    data[i + 2] = Math.round(205 * k);
    data[i + 3] = Math.round(data[i + 3] * 0.6);
  }
  return data;
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
    applyFestivalGhostly,
  };
}
