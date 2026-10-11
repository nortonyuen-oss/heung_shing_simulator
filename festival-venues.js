// 節慶場地: where a festival's things stand (docs/festival-dlc-design.md §3.1).
//
// Placements are worked out from the map every time they are needed - nothing is saved - and come
// in two kinds:
//   tile       on a map tile, moved off its centre by metres along logical directions:
//              { mode: 'tile', row, col, offsets: [[dir, metres], ...], alongDir, align }
//              `alongDir` is the logical direction the venue runs (a promenade's shore) and
//              `align` how the part's long axis lies against it: 'along', 'across' or null.
//   building   on a point of a building's art, which never turns with the map (a park is the
//              same picture at every rotation, so its open square is a point of that picture):
//              { mode: 'building', buildingId, point: [x, y] }   point in source-image pixels
// Each also has { id, partId, festival }.

// The open ground in a building's art where a festival piece can stand, in that art's source
// pixels (picked by eye from the 1024 px renders; a calibration tool can replace these). Keyed by
// the building record's spriteKey (parks) or sourceFileName (zone models such as the malls).
const FESTIVAL_BUILDING_SPOTS = Object.freeze({
  // victoriaPark4-01.png: the paved square in the middle, on its mosaic
  park_flagship_victoria: Object.freeze({
    path: 'Models/parks/park4x4/victoriaPark4-01.png',
    spots: Object.freeze({ centre: Object.freeze([585, 738]) }),
  }),
  // 商場 (Norton 2026-10-11: the malls all dress up for Christmas, a tree at a 時代廣場's door):
  // the forecourt in front of each large commercial model's entrance. `christmas`: what stands there
  // - the big tree at the shopping malls and hotels, the gift display at the office towers.
  // The two street-market blocks (4-03, 4-04) have no forecourt and get nothing.
  ...Object.fromEntries([
    ['3x3', 'commercialBuilding3-01-H.png', [602, 768], 'christmasGiftArch'],
    ['3x3', 'commercialBuilding3-03-M.png', [430, 830], 'christmasGiftArch'],
    ['3x3', 'commercialBuilding3-04-H.png', [307, 768], 'christmasGiftArch'],
    ['3x3', 'commercialBuilding3-05-UH.png', [384, 794], 'christmasGiftArch'],
    ['3x3', 'commercialBuilding3-07-M.png', [360, 780], 'christmasTree'],      // the harbourfront mall
    ['3x3', 'commercialBuilding3-08-H.png', [620, 900], 'christmasGiftArch'],
    ['3x3', 'commercialBuilding3-09-M.png', [330, 850], 'christmasTree'],
    ['3x3', 'commercialBuilding3-10-M.png', [470, 860], 'christmasGiftArch'],
    ['3x3', 'commercialBuilding3-11-H.png', [430, 860], 'christmasGiftArch'],
    ['3x3', 'commercialBuilding3-12-M.png', [384, 870], 'christmasTree'],      // the department store
    ['3x3', 'commercialBuilding3-13-H.png', [397, 883], 'christmasTree'],      // the grand hotel's fountain court
    ['4x4', 'commercialBuilding4-01-H.png', [422, 832], 'christmasTree'],      // the atrium mall's plaza
    ['4x4', 'commercialBuilding4-02-H.png', [320, 768], 'christmasTree'],
    ['5x5', 'commercialBuilding5-01-UH.png', [420, 1080], 'christmasTree'],
  ].map(([size, file, door, christmas]) => [file, Object.freeze({
    path: `Models/commercial/${size}/${file}`,
    spots: Object.freeze({ door: Object.freeze(door) }),
    christmas,
  })])),
});

// 聖誕 on the 海濱步道: one piece every `spacing` tiles along a run (walked in order: a coast is
// mostly a staircase), cycling through these. Only between the lamps (the odd tiles, (row + col) %
// 2 === 1, which alternate along any run), 4 m in from the tile's centre toward the land so the
// benches on the sea side stay clear; never on a public pier or beside a bridge.
const CHRISTMAS_PROMENADE_CYCLE = Object.freeze([
  Object.freeze({ partId: 'christmasTree', align: null }),
  Object.freeze({ partId: 'christmasLightArch', align: 'across' }),  // walked through along the shore
  Object.freeze({ partId: 'christmasSleigh', align: 'along' }),
  Object.freeze({ partId: 'christmasGiftArch', align: 'across' }),
]);
const CHRISTMAS_PROMENADE_SPACING = Object.freeze({ basic: 8, standard: 4, grand: 2 });
const CHRISTMAS_PROMENADE_INLAND_M = 4;
const CHRISTMAS_MALL_HEIGHT_M = Object.freeze({ christmasTree: 6, christmasGiftArch: 4 });

const FESTIVAL_OPPOSITE_DIR = Object.freeze({ n: 's', s: 'n', e: 'w', w: 'e' });
const FESTIVAL_ALONG_DIR = Object.freeze({ n: 'e', s: 'e', e: 's', w: 's' }); // along a shore facing that way

/**
 * 聖誕 decorations for a city.
 * @param {object} ctx
 * @param {string} ctx.tier                 'skip' | 'basic' | 'standard' | 'grand'
 * @param {Array<[number, number]>} [ctx.promenadeTiles]
 * @param {(row, col) => string|null} [ctx.seaSideOf]   the promenade tile's sea side (n/e/s/w)
 * @param {(row, col) => boolean} [ctx.isPier]
 * @param {(row, col) => boolean} [ctx.isNearBridge]
 * @param {Array<{ id: string, textureKey: string }>} [ctx.parks]  flagship parks: building id, sprite key
 * @param {Array<{ id: string, modelKey: string }>} [ctx.malls]  commercial buildings: id, model file
 * @returns {Array<object>} placements (see the top of this file)
 */
function layoutChristmasDecorations(ctx) {
  const spacing = CHRISTMAS_PROMENADE_SPACING[ctx.tier];
  if (!spacing) return [];
  const out = [];
  (ctx.parks || []).forEach((park) => {
    const spot = FESTIVAL_BUILDING_SPOTS[park.textureKey]?.spots?.centre;
    if (spot) out.push({ id: `christmas:park:${park.id}`, festival: 'christmas', partId: 'christmasTree', mode: 'building', buildingId: park.id, point: spot });
  });
  // the malls' doors: a modest year dresses only the big ones with a tree
  (ctx.malls || []).forEach((mall) => {
    const entry = FESTIVAL_BUILDING_SPOTS[mall.modelKey];
    if (!entry?.christmas || !entry.spots?.door) return;
    if (ctx.tier === 'basic' && entry.christmas !== 'christmasTree') return;
    out.push({
      id: `christmas:mall:${mall.id}`,
      festival: 'christmas',
      partId: entry.christmas,
      mode: 'building',
      buildingId: mall.id,
      point: entry.spots.door,
      // a forecourt is a few metres deep: smaller than the park's tree, or it covers the podium
      heightM: CHRISTMAS_MALL_HEIGHT_M[entry.christmas],
    });
  });
  let picked = 0; // the cycle runs on from one run to the next
  orderFestivalPromenadeRuns(ctx.promenadeTiles || []).forEach((run) => {
    let n = -1;
    run.forEach(([row, col]) => {
      if ((row + col) % 2 !== 1) return; // a lamp's tile
      n += 1;
      if (n % (spacing / 2) !== 0) return;
      const sea = ctx.seaSideOf?.(row, col);
      if (!sea || ctx.isPier?.(row, col) || ctx.isNearBridge?.(row, col)) return;
      const pick = CHRISTMAS_PROMENADE_CYCLE[picked % CHRISTMAS_PROMENADE_CYCLE.length];
      picked += 1;
      out.push({
        id: `christmas:promenade:${row}:${col}`,
        festival: 'christmas',
        partId: pick.partId,
        mode: 'tile',
        row,
        col,
        offsets: [[FESTIVAL_OPPOSITE_DIR[sea], CHRISTMAS_PROMENADE_INLAND_M]],
        alongDir: FESTIVAL_ALONG_DIR[sea],
        align: pick.align,
      });
    });
  });
  return out;
}

/**
 * A promenade's runs, each in walking order: its tiles joined edge to edge (a generated coast is a
 * staircase, so a run turns every tile or two), walked from the end with the lowest key so the
 * same promenade always walks the same way; a ring starts at its lowest key.
 * @param {Array<[number, number]>} tiles
 * @returns {Array<Array<[number, number]>>}
 */
function orderFestivalPromenadeRuns(tiles) {
  const key = (r, c) => `${r}:${c}`;
  const byKey = new Map(tiles.map(([r, c]) => [key(r, c), [r, c]]));
  const neighbours = ([r, c]) => [[r - 1, c], [r, c + 1], [r + 1, c], [r, c - 1]]
    .filter(([a, b]) => byKey.has(key(a, b)));
  const order = (a, b) => a[0] - b[0] || a[1] - b[1];
  const seen = new Set();
  const runs = [];
  [...byKey.values()].sort(order).forEach((first) => {
    if (seen.has(key(...first))) return;
    // the run this tile belongs to, then the end to walk it from
    const members = [first];
    const inRun = new Set([key(...first)]);
    for (let i = 0; i < members.length; i++) {
      neighbours(members[i]).forEach((n) => {
        if (!inRun.has(key(...n))) { inRun.add(key(...n)); members.push(n); }
      });
    }
    const ends = members.filter((t) => neighbours(t).length <= 1).sort(order);
    const start = ends[0] || members.sort(order)[0];
    const walk = [];
    const stack = [start];
    while (stack.length) {
      const tile = stack.pop();
      if (seen.has(key(...tile))) continue;
      seen.add(key(...tile));
      walk.push(tile);
      neighbours(tile).sort(order).reverse().forEach((n) => { if (!seen.has(key(...n))) stack.push(n); });
    }
    runs.push(walk);
  });
  return runs;
}

/** The game's view of the venues a layout needs (in the browser; tests pass their own). */
function getFestivalVenueContext(scene = typeof activeScene !== 'undefined' ? activeScene : null) {
  const promenadeTiles = typeof getPromenadeTileKeys === 'function'
    ? getPromenadeTileKeys().map((key) => key.split(':').map(Number)) : [];
  const piers = typeof getPromenadePiers === 'function' ? getPromenadePiers().piers : new Set();
  const parks = [];
  const malls = [];
  if (typeof buildingData !== 'undefined' && buildingData) {
    Object.entries(buildingData).forEach(([id, record]) => {
      if (record?.type === 'commercial') {
        if (FESTIVAL_BUILDING_SPOTS[record.sourceFileName]) malls.push({ id, modelKey: record.sourceFileName });
        return;
      }
      if (record?.type !== 'park_flagship') return;
      // the record's key: after dark the sprite wears its night texture under another key
      const textureKey = record.spriteKey || scene?.buildingSprites?.get(id)?.texture?.key;
      if (textureKey) parks.push({ id, textureKey });
    });
  }
  return {
    promenadeTiles,
    seaSideOf: (row, col) => (typeof getPromenadeSeaSides === 'function' ? getPromenadeSeaSides(row, col)[0] || null : null),
    isPier: (row, col) => piers.has(`${row}:${col}`),
    isNearBridge: (row, col) => typeof isPromenadeNearBridge === 'function' && isPromenadeNearBridge(row, col),
    parks,
    malls,
  };
}

/** Every placement of a festival for the city as it stands. */
function layoutFestival(id, ctx) {
  if (id === 'christmas') return layoutChristmasDecorations(ctx);
  return [];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FESTIVAL_BUILDING_SPOTS,
    CHRISTMAS_PROMENADE_CYCLE,
    CHRISTMAS_PROMENADE_SPACING,
    layoutChristmasDecorations,
    layoutFestival,
    orderFestivalPromenadeRuns,
  };
}
