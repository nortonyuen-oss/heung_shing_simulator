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
  // The old park key now shows the boat garden (module 01). Do not reuse the old
  // festival coordinates: its former square is water/trees in the replacement.
  park_flagship_victoria: Object.freeze({
    path: 'Models/parks/park4x4/victoriaPark4-01.png',
    spots: Object.freeze({}),
  }),
  park_flagship_victoria_module03: Object.freeze({
    path: 'Models/parks/park4x4/victoriaPark4-module03.png',
    spots: Object.freeze({ centre: Object.freeze([550, 710]) }),
  }),
  // Remembrance keeps these west-pitch areas. The New Year fair has its own
  // six-pitch layout below, with no performance stage on the middle pitch.
  park_flagship_victoria_module05: Object.freeze({
    path: 'Models/parks/park4x4/victoriaPark4-module05.png',
    pxPerM: Math.hypot(504, 252) / 80,
    spots: Object.freeze({}),
    areas: Object.freeze({
      pitch: Object.freeze({ left: [213, 661], top: [460, 538], right: [586, 609] }),
      plaza: Object.freeze({ left: [473, 798], top: [712, 681], right: [837, 752] }),
      lawn: Object.freeze({ left: [344, 730], top: [590, 612], right: [710, 679] }),
    }),
    way: Object.freeze({ gate: Object.freeze([527, 933]), map: Object.freeze([484, 912]), booth: Object.freeze([575, 911]) }),
  }),
  park_flagship_victoria_module06: Object.freeze({
    path: 'Models/parks/park4x4/victoriaPark4-module06.png',
    spots: Object.freeze({}),
  }),
  // the 2x2 sports ground is a basketball court: a neighbourhood flower market on the court
  // the 3x3 sports ground: the field inside the running track (60 m a side: 9.45 art px a metre)
  sports_ground_3x3: Object.freeze({
    path: 'Models/parks/park3x3/sportField3-01.png',
    pxPerM: 9.45,
    spots: Object.freeze({}),
    areas: Object.freeze({ field: Object.freeze({ left: [250, 690], top: [533, 528], right: [835, 680] }) }),
  }),
  sports_ground_2x2: Object.freeze({
    path: 'Models/parks/park2x2/sportField3-02.png',
    pxPerM: 18.1,
    spots: Object.freeze({}),
    areas: Object.freeze({ court: Object.freeze({ left: [278, 922], top: [778, 668], right: [1334, 874] }) }),
  }),
  // the temples' forecourts: a lion dance and the 頭炷香 incense burner at New Year
  heritage_temple_2x2: Object.freeze({ path: 'Models/specialSites/2x2/tample2-01.png', spots: Object.freeze({ forecourt: Object.freeze([560, 880]) }) }),
  heritage_temple_2x2_alt: Object.freeze({ path: 'Models/specialSites/2x2/tample2-02.png', spots: Object.freeze({ forecourt: Object.freeze([500, 885]) }) }),
  grand_temple_3x3: Object.freeze({ path: 'Models/specialSites/3x3/tample3-01.png', spots: Object.freeze({ forecourt: Object.freeze([333, 819]) }) }),
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

// Edge-connected, level event-ground tiles form reusable venues. Holes are preserved:
// a component's bounding box must never be treated as fully available land.
function getEventGroundVenueComponents(tiles, heightOf = () => 0) {
  const key = (r,c) => `${r}:${c}`;
  const byKey = new Map((tiles || []).filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger))
    .map(([r,c]) => [key(r,c),[r,c]]));
  const sorted = [...byKey.values()].sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  const seen = new Set(), out = [];
  for (const first of sorted) {
    if (seen.has(key(...first))) continue;
    const members = [first], height = heightOf(...first);seen.add(key(...first));
    for (let i=0;i<members.length;i++) {
      const [r,c]=members[i];
      for (const p of [[r-1,c],[r,c+1],[r+1,c],[r,c-1]]) {
        const id=key(...p);
        if (!seen.has(id) && byKey.has(id) && heightOf(...p) === height) {seen.add(id);members.push(p);}
      }
    }
    members.sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
    out.push({id:`eventGround:${key(...members[0])}`,tiles:members,height,areaM2:members.length*400});
  }
  return out;
}

// Large events request a real rectangle within the component, not just enough tiles.
function findEventGroundRectangle(venue, cols, rows) {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols<1 || rows<1) return null;
  const cells=new Set((venue.tiles||[]).map(p=>p.join(':')));
  for (const [row,col] of venue.tiles||[]) {
    const footprint=[];
    for(let dr=0;dr<rows;dr++)for(let dc=0;dc<cols;dc++)footprint.push([row+dr,col+dc]);
    if(footprint.every(p=>cells.has(p.join(':')))) return {row,col,cols,rows,widthM:cols*20,depthM:rows*20,tiles:footprint};
  }
  return null;
}

/** The game's view of the venues a layout needs (in the browser; tests pass their own). */
function getFestivalVenueContext(scene = typeof activeScene !== 'undefined' ? activeScene : null) {
  const promenadeTiles = typeof getPromenadeTileKeys === 'function'
    ? getPromenadeTileKeys().map((key) => key.split(':').map(Number)) : [];
  const piers = typeof getPromenadePiers === 'function' ? getPromenadePiers().piers : new Set();
  const parks = [];
  const malls = [];
  const courts = [];
  const sportsGrounds = [];
  const temples = [];
  const eventGroundTiles = [];
  if (typeof buildingData !== 'undefined' && buildingData) {
    Object.entries(buildingData).forEach(([id, record]) => {
      if (record?.type === 'event_ground') {
        const at = id.split(':').map(Number);
        if (at.length === 2 && at.every(Number.isInteger) && (record.footprintCols || 1) === 1 && (record.footprintRows || 1) === 1) eventGroundTiles.push(at);
        return;
      }
      if (record?.type === 'commercial') {
        if (FESTIVAL_BUILDING_SPOTS[record.sourceFileName]) malls.push({ id, modelKey: record.sourceFileName });
        return;
      }
      if (record?.type === 'sports_ground_small' || record?.type === 'sports_ground_large' || record?.type === 'heritage_temple' || record?.type === 'grand_temple') {
        const key = record.spriteKey || scene?.buildingSprites?.get(id)?.texture?.key;
        if (!key || !FESTIVAL_BUILDING_SPOTS[key]) return;
        const entry = { id, textureKey: key, cols: record.footprintCols, rows: record.footprintRows };
        if (record.type === 'sports_ground_small') courts.push(entry);
        else if (record.type === 'sports_ground_large') sportsGrounds.push(entry);
        else temples.push(entry);
        return;
      }
      if (record?.type !== 'park_flagship') return;
      // the record's key: after dark the sprite wears its night texture under another key
      const textureKey = record.spriteKey || scene?.buildingSprites?.get(id)?.texture?.key;
      if (textureKey) {
        const [row, col] = id.split(':').map(Number);
        parks.push({ id, textureKey, row, col, height: typeof heightMap !== 'undefined' ? heightMap[row]?.[col] ?? 0 : 0,
          cols: record.footprintCols || 4, rows: record.footprintRows || 4 });
      }
    });
  }
  return {
    promenadeTiles,
    eventGroundTiles,
    eventGrounds: getEventGroundVenueComponents(eventGroundTiles, (r,c) => typeof heightMap !== 'undefined' ? heightMap[r]?.[c] : 0),
    seaSideOf: (row, col) => (typeof getPromenadeSeaSides === 'function' ? getPromenadeSeaSides(row, col)[0] || null : null),
    isPier: (row, col) => piers.has(`${row}:${col}`),
    isNearBridge: (row, col) => typeof isPromenadeNearBridge === 'function' && isPromenadeNearBridge(row, col),
    parks,
    malls,
    courts,
    sportsGrounds,
    temples,
  };
}

// ── 新春 年宵 (docs/festival-dlc-design.md §4.1) ─────────────────────────────

// A point of a parallelogram on building art: u from the left corner toward the top one, v from
// the left corner toward the bottom one (left + right - top), both 0..1.
function getFestivalAreaPoint(area, u, v) {
  const [L, T, R] = [area.left, area.top, area.right];
  const B = [L[0] + R[0] - T[0], L[1] + R[1] - T[1]];
  return [Math.round(L[0] + u * (T[0] - L[0]) + v * (B[0] - L[0])), Math.round(L[1] + u * (T[1] - L[1]) + v * (B[1] - L[1]))];
}

// 濕貨 means flowers and kumquats; dry goods are laisee, couplets, toys and gifts.
// The Victoria layout separates these into northern dry and southern flower rows.
const LNY_WET_GOODS = Object.freeze(['lnyStallBlossoms', 'lnyStallPeach', 'lnyStallKumquat', 'lnyStallOrchids', 'lnyStallNarcissus', 'lnyStallFlowers']);
const LNY_DRY_GOODS = Object.freeze(['lnyStallLaisee', 'lnyStallCouplets', 'lnyStallPinwheels', 'lnyStallToys', 'lnyStallGifts']);
const LNY_FOOD = Object.freeze(['lnyStallSnacks']);

// FEHD 2027 Victoria Park plan: wet4x5, regular dry3x1.5, large dry4.5x2,
// food5x4 metres. Keep the dimensions, reduce counts to fit the condensed park.
// https://www.fehd.gov.hk/english/events/cnyf2027/layout/Victoria_Park.pdf
const VICTORIA_LNY_STALL_SPECS = Object.freeze({
  wet: Object.freeze({ width: 4, depth: 5, maxHeightM: 4, goods: LNY_WET_GOODS }),
  dry: Object.freeze({ width: 3, depth: 1.5, maxHeightM: 3, goods: LNY_DRY_GOODS }),
  dryLarge: Object.freeze({ width: 4.5, depth: 2, maxHeightM: 3, goods: LNY_DRY_GOODS }),
  food: Object.freeze({ width: 5, depth: 4, maxHeightM: 4, goods: LNY_FOOD }),
});
const VICTORIA_LNY_PX_PER_M = Math.hypot(504, 252) / 80;
const VICTORIA_LNY_MODULE_OFFSETS = Object.freeze(Object.fromEntries(Array.from({ length: 6 }, (_, i) => [
  i === 0 ? 'park_flagship_victoria' : `park_flagship_victoria_module0${i + 1}`,
  Object.freeze([Math.floor(i / 2) * 4, i % 2 * 4]),
])));
// Inset floor polygons, not alpha bounds: no stalls over fences, trees, goals,
// the statue, pavilion, basketball courts or the shared module promenades.
const VICTORIA_LNY_MODULES = Object.freeze({
  park_flagship_victoria_module05: Object.freeze({
    side: 'west',
    fields: Object.freeze([
      { left: [235, 660], top: [461, 547], right: [571, 602] },
      { left: [366, 729], top: [594, 615], right: [698, 667] },
      { left: [494, 796], top: [712, 687], right: [820, 741] },
    ]),
    gate: Object.freeze([46, 716]),
  }),
  park_flagship_victoria_module06: Object.freeze({
    side: 'east',
    fields: Object.freeze([
      { left: [423, 552], top: [495, 516], right: [637, 587] },
      { left: [300, 609], top: [374, 572], right: [518, 644] },
      { left: [205, 660], top: [267, 629], right: [393, 692] },
    ]),
    gate: Object.freeze([965, 716]),
  }),
});

// The six variants share an inferred park origin. Only the matching, level
// modules form one fair: separately placed copies never duplicate a main fair.
function getVictoriaParkLnyVenues(parks = []) {
  const groups = new Map();
  [...new Map(parks.map(p => [p.id, p])).values()].forEach((park) => {
    const offset = VICTORIA_LNY_MODULE_OFFSETS[park.textureKey];
    if (!offset || (park.cols ?? 4) !== 4 || (park.rows ?? 4) !== 4) return;
    const parsed = String(park.id).split(':').map(Number);
    const row = park.row ?? parsed[0], col = park.col ?? parsed[1];
    if (!Number.isInteger(row) || !Number.isInteger(col)) return;
    const originRow = row - offset[0], originCol = col - offset[1];
    const id = `victoria:${originRow}:${originCol}:${Number(park.height) || 0}`;
    if (!groups.has(id)) groups.set(id, { id, row: originRow, col: originCol, members: [], markets: [] });
    const group = groups.get(id);
    group.members.push(park);
    if (VICTORIA_LNY_MODULES[park.textureKey]) group.markets.push(park);
  });
  return [...groups.values()].filter(g => g.markets.length).map((group) => ({ ...group,
    markets: group.markets.sort((a, b) => a.textureKey.localeCompare(b.textureKey)),
  })).sort((a, b) => b.markets.length - a.markets.length || a.row - b.row || a.col - b.col);
}

function getVictoriaLnyFieldSize(area) {
  return {
    u: Math.hypot(area.top[0] - area.left[0], area.top[1] - area.left[1]) / VICTORIA_LNY_PX_PER_M,
    v: Math.hypot(area.right[0] - area.top[0], area.right[1] - area.top[1]) / VICTORIA_LNY_PX_PER_M,
  };
}

// Continuous rows, with a 2m emergency cross-passage after every six booths.
// Visitor row aisles are 3.5m (5m on basic), main north/south separation 6m.
// These aisle widths are game design choices; the official plan is not to scale.
function getVictoriaLnyColumns(length, width) {
  const usable = length - 1;
  let count = Math.floor(usable / width);
  const span = n => n * width + Math.floor(Math.max(0, n - 1) / 6) * 2;
  while (count > 0 && span(count) > usable) count--;
  const start = (length - span(count)) / 2;
  return Array.from({ length: count }, (_, i) => start + (i + 0.5) * width + Math.floor(i / 6) * 2);
}

function layoutVictoriaParkLny(out, ctx) {
  const venues = getVictoriaParkLnyVenues(ctx.parks);
  const main = venues.find(v => v.id === ctx.mainVenue || v.members.some(p => p.id === ctx.mainVenue)) || venues[0];
  venues.forEach((venue) => {
    const isMain = venue === main;
    const rowLimit = !isMain || ctx.tier === 'basic' ? 1 : Infinity;
    const aisle = ctx.tier === 'basic' ? 5 : 3.5;
    const add = (park, key, partId, point, extra = {}) => out.push({
      id: `lunarNewYear:${venue.id}:${park.id}:${key}`, festival: 'lunarNewYear',
      partId, mode: 'building', buildingId: park.id, point, marketVenueId: venue.id, ...extra,
    });
    venue.markets.forEach((park) => {
      const config = VICTORIA_LNY_MODULES[park.textureKey];
      config.fields.forEach((area, field) => {
        const size = getVictoriaLnyFieldSize(area);
        const slots = [], foodCount = field === 0 ? (isMain ? 2 : 1) : 0;
        const foodBay = foodCount ? { u0: 0, u1: 11, v0: config.side === 'west' ? 0 : size.v - 8, v1: config.side === 'west' ? 8 : size.v } : null;
        const conflicts = (u, v, spec) => foodBay && u - spec.depth / 2 < foodBay.u1
          && u + spec.depth / 2 > foodBay.u0 && v - spec.width / 2 < foodBay.v1 && v + spec.width / 2 > foodBay.v0;
        const addRow = (kind, u, row) => {
          const spec = VICTORIA_LNY_STALL_SPECS[kind];
          getVictoriaLnyColumns(size.v, spec.width).forEach((v, col) => {
            if (!conflicts(u, v, spec)) slots.push({ kind, u, v, row, col });
          });
        };
        const available = size.u - 1;
        // Northern dry goods / southern flowers. Small module06 fields cannot
        // fit both bands plus the main lane: use its northern pitch for dry goods.
        const mixed = available >= 5 + 1.5 + 6;
        const wetBand = mixed ? (available - 6) * 0.52 : available;
        const dryStart = mixed ? 0.5 + wetBand + 6 : 0.5;
        const useWet = mixed || field !== 0 || config.side === 'west';
        if (useWet) {
          const rows = Math.min(rowLimit, Math.max(0, Math.floor((wetBand + aisle) / (5 + aisle))));
          const span = rows * 5 + Math.max(0, rows - 1) * aisle;
          for (let r = 0; r < rows; r++) addRow('wet', 0.5 + (wetBand - span) / 2 + 2.5 + r * (5 + aisle), `wet${r}`);
        }
        if (mixed || !useWet) {
          let cursor = size.u - 0.5;
          for (let r = 0; r < rowLimit; r++) {
            const kind = isMain && ctx.tier !== 'basic' && r === 0 ? 'dryLarge' : 'dry';
            const spec = VICTORIA_LNY_STALL_SPECS[kind];
            if (cursor - spec.depth < dryStart) break;
            addRow(kind, cursor - spec.depth / 2, `dry${r}`);
            cursor -= spec.depth + aisle;
          }
        }
        for (let i = 0; i < foodCount; i++) slots.push({ kind: 'food', u: 2.5 + i * 6,
          v: config.side === 'west' ? 3.5 : size.v - 3.5, row: 'food', col: i });
        slots.forEach((slot) => {
          const spec = VICTORIA_LNY_STALL_SPECS[slot.kind];
          if (slot.u - spec.depth / 2 < 0.5 || slot.u + spec.depth / 2 > size.u - 0.5
            || slot.v - spec.width / 2 < 0.5 || slot.v + spec.width / 2 > size.v - 0.5) return;
          const key = `field${field}:${slot.row}:${slot.col}`;
          const sold = lnyHash(`${ctx.seed}:${venue.id}:${park.id}:${key}:let`) < (ctx.soldShare ?? 1);
          const goods = spec.goods;
          const partId = goods[Math.floor(lnyHash(`${ctx.seed}:${venue.id}:${park.id}:${field}:${slot.kind}:${Math.floor(slot.col / 3)}:kind`) * goods.length)];
          add(park, key, ctx.phase === 'setup' || !sold ? 'lnyStallEmpty' : partId,
            getFestivalAreaPoint(area, slot.u / size.u, slot.v / size.v), {
              stall: true, sold, marketZone: slot.kind === 'dryLarge' ? 'dry' : slot.kind,
              stallType: slot.kind, marketRow: `${field}:${slot.row}`,
              marketSlot: { field, u: slot.u, v: slot.v },
              footprintM: { width: spec.width, depth: spec.depth }, maxHeightM: spec.maxHeightM,
              anchorMode: 'ground-center', mirrored: slot.kind === 'wet' && Number(slot.row.slice(3)) % 2 === 0,
            });
        });
        if (foodBay && isMain) {
          const serviceV = config.side === 'west' ? 7 : size.v - 7;
          add(park, 'information', 'lnyInfoBooth', getFestivalAreaPoint(area, 5.5 / size.u, serviceV / size.v),
            { footprintM: { width: 1.5, depth: 1.5 }, maxHeightM: 2.8, anchorMode: 'ground-center' });
          add(park, 'map', 'lnySiteMap', getFestivalAreaPoint(area, 5.5 / size.u, (config.side === 'west' ? 0.8 : size.v - 0.8) / size.v), { heightM: 2 });
          if (ctx.phase === 'setup') {
            add(park, 'trolley', config.side === 'west' ? 'lnyTrolleyFlowers' : 'lnyTrolleyBoxes',
              getFestivalAreaPoint(area, 5.5 / size.u, 3.5 / size.v), { heightM: 1.2 });
          }
        }
      });
      if (isMain) add(park, 'gate', 'lnyGate', config.gate, {
        footprintM: { width: 6, depth: 1 }, maxHeightM: 4, anchorMode: 'ground-center', mirrored: config.side === 'west',
      });
    });
  });
}

// Compact neighbourhood courts retain 2m booths; Victoria Park uses the official
// dimensions and dedicated field layout above. Rows run across an area's v side.
const LNY_STALL_M = 2;
const LNY_AISLE_M = Object.freeze({ basic: 5, standard: 2.5, grand: 2 });
const LNY_EDGE_M = 1;
// Which goods each area sells, and caps on its rows and stalls a row. The great lawn is the show
// ground, no stalls; another park keeps to its pitch; a basketball court has a few short rows.
const LNY_AREAS = Object.freeze({
  main: Object.freeze({
    pitch: Object.freeze({ goods: LNY_WET_GOODS }),
    tennis: Object.freeze({ goods: LNY_WET_GOODS }),
    basketball: Object.freeze({ goods: LNY_WET_GOODS }),
    plaza: Object.freeze({ goods: LNY_DRY_GOODS, lastRow: LNY_FOOD }),
  }),
  park: Object.freeze({ pitch: Object.freeze({ goods: LNY_WET_GOODS, maxRows: 2 }) }),
  court: Object.freeze({ court: Object.freeze({ goods: [...LNY_WET_GOODS, ...LNY_DRY_GOODS], lastRow: LNY_FOOD, maxRows: 4, maxPerRow: 8 }) }),
});

function lnyHash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h / 4294967296;
}

/** An area's rows: [{ u, v: [..] }] as fractions of its sides, for a tier. */
function getLnyRows(area, pxPerM, tier, zone = {}) {
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]) / pxPerM;
  const uM = len(area.left, area.top);
  const vM = len(area.top, area.right);
  const aisle = LNY_AISLE_M[tier] ?? LNY_AISLE_M.standard;
  const perRow = Math.min(zone.maxPerRow ?? Infinity, Math.floor((vM - 2 * LNY_EDGE_M) / LNY_STALL_M));
  const rowCount = Math.min(zone.maxRows ?? Infinity, Math.floor((uM - 2 * LNY_EDGE_M + aisle) / (LNY_STALL_M + aisle)));
  if (perRow < 1 || rowCount < 1) return [];
  const runM = perRow * LNY_STALL_M;
  const v0 = (vM - runM) / 2 + LNY_STALL_M / 2;
  const blockM = rowCount * LNY_STALL_M + (rowCount - 1) * aisle;
  // the rows from the far (top) side down, so the aisle each faces lies on its near side
  const u0 = (uM + blockM) / 2 - LNY_STALL_M / 2;
  return Array.from({ length: rowCount }, (_, r) => ({
    u: (u0 - r * (LNY_STALL_M + aisle)) / uM,
    v: Array.from({ length: perRow }, (_, k) => (v0 + k * LNY_STALL_M) / vM)
      // The park/court markets use the same six-booth blocks and cross passages.
      .filter((v,k) => k % 7 !== 6 && (vM < 24 || Math.abs(v * vM - vM / 2) >= 3)),
  }));
}

// The stalls of one area, each with what it sells and whether it was let (`soldShare`, from the
// economy: a weak year leaves some as bare tents). During setup they are all bare tents.
function layoutLnyStalls(out, building, area, pxPerM, zone, ctx, prefix) {
  const setup = ctx.phase === 'setup';
  const rows = getLnyRows(area, pxPerM, ctx.tier, zone);
  rows.forEach((row, r) => {
    const goods = r === rows.length - 1 && zone.lastRow && rows.length > 1 ? zone.lastRow : zone.goods;
    row.v.forEach((v, k) => {
      const key = `${prefix}:${r}:${k}`;
      const sold = lnyHash(`${ctx.seed}:${key}:let`) < (ctx.soldShare ?? 1);
      // neighbours tend to sell the same (a run of peach blossom, then of kumquats)
      const kind = goods[Math.floor(lnyHash(`${ctx.seed}:${prefix}:${r}:${Math.floor(k / 3)}:kind`) * goods.length)];
      out.push({
        id: `lunarNewYear:${key}`,
        festival: 'lunarNewYear',
        partId: setup || !sold ? 'lnyStallEmpty' : kind,
        mode: 'building',
        buildingId: building.id,
        point: getFestivalAreaPoint(area, row.u, v),
        stall: true,
        sold,
      });
    });
  });
}

/**
 * 新春 for a city: one main 年宵 across a matching pair of Victoria Park football modules,
 * smaller fairs in other park groups and on neighbourhood courts, and incense at temples.
 * Lion troupes tour neighbouring streets during the market and the following morning.
 * @param {object} ctx  as layoutChristmasDecorations, plus courts, temples ({ id, textureKey }),
 *   phase ('setup'|'open'|'peak'|'after'), soldShare (0..1), seed, mainVenue (a park id or '')
 */
// Victoria Park-inspired continuous stall blocks, rather than four kiosks per
// tile. The existing artwork is a calibrated 2x2m booth (compact game version).
// Rows share their backs; a 4m main aisle, 4m row aisles and 2m cross passages
// divide the wet/dry blocks. Food and visitor services occupy the entrance apron.
function layoutEventGroundFair(out, venue, ctx) {
  const cells = new Set(venue.tiles.map(([r,c]) => `${r}:${c}`));
  const r0 = Math.min(...venue.tiles.map(p=>p[0]))-.5;
  const c0 = Math.min(...venue.tiles.map(p=>p[1]))-.5;
  const width = (Math.max(...venue.tiles.map(p=>p[1]))+.5-c0)*20;
  const depth = (Math.max(...venue.tiles.map(p=>p[0]))+.5-r0)*20;
  const centre = width/2;
  const fits = (y,x,h=2,w=2) => {
    for (let r=Math.floor(r0+(y-h/2)/20+.5+1e-7);r<=Math.floor(r0+(y+h/2)/20+.5-1e-7);r++)
      for (let c=Math.floor(c0+(x-w/2)/20+.5+1e-7);c<=Math.floor(c0+(x+w/2)/20+.5-1e-7);c++)
        if (!cells.has(`${r}:${c}`)) return false;
    return true;
  };
  const add = (key,partId,y,x,extra={},h=2,w=2) => {
    if (!fits(y,x,h,w)) return;
    const row=r0+y/20,col=c0+x/20;
    out.push({id:`lunarNewYear:${venue.id}:${key}`,festival:'lunarNewYear',partId,
      mode:'tile',row,col,groundBuildingId:`${Math.round(row)}:${Math.round(col)}`,
      alongDir:'e',align:'along',...extra});
  };
  const blocks=[];
  for(let y=2;y+4<=depth-6;y+=8) blocks.push(y);
  blocks.forEach((y,b) => {
    const zone=b<Math.ceil(blocks.length/2)?'wet':'dry';
    const goods=zone==='wet'?LNY_WET_GOODS:LNY_DRY_GOODS;
    for(let face=0;face<(ctx.tier==='basic'?1:2);face++) {
      [[2,centre-2],[centre+2,width-2]].forEach(([start,end],side)=>{
        let slot=0;
        for(let x=start+1;x+1<=end;x+=2,slot++){
          // Break long rows every six booths, preserving a clear cross passage.
          if(slot%7===6) continue;
          const key=`${b}:${face}:${side}:${slot}`;
          const sold=lnyHash(`${ctx.seed}:${venue.id}:${key}:let`)<(ctx.soldShare??1);
          const kind=goods[Math.floor(lnyHash(`${ctx.seed}:${venue.id}:${b}:${side}:${Math.floor(slot/3)}:kind`)*goods.length)];
          add(`stall:${key}`,ctx.phase==='setup'||!sold?'lnyStallEmpty':kind,y+1+face*2,x,
            {stall:true,sold,marketZone:zone,marketRow:b*2+face,mirrored:face===0});
        }
      });
    }
  });
  // Keep the middle open all the way to the entrance; food stays to one side.
  for(let i=0;i<Math.min(4,Math.floor((width/2-5)/2));i++) {
    const key=`food:${i}`,sold=lnyHash(`${ctx.seed}:${venue.id}:${key}:let`)<(ctx.soldShare??1);
    add(key,ctx.phase==='setup'||!sold?'lnyStallEmpty':'lnyStallSnacks',depth-3,width-3-i*2,
      {stall:true,sold,marketZone:'food',marketRow:'food'});
  }
  add('gate','lnyGate',depth-2,centre,{},2,6);
  add('map','lnySiteMap',depth-3,centre-5);
  add('information','lnyInfoBooth',depth-3,centre-7);
}

function layoutLunarNewYear(ctx) {
  if (!ctx.tier || ctx.tier === 'skip') return [];
  const out = [];
  const add = (id, partId, building, point, extra = {}) => out.push({ id: `lunarNewYear:${id}`, festival: 'lunarNewYear', partId, mode: 'building', buildingId: building.id, point, ...extra });
  const streetLayout = typeof layoutLionDanceStreets === 'function' ? layoutLionDanceStreets
    : typeof require === 'function' ? require('./festival-lion-dance.js').layoutLionDanceStreets : null;
  if (ctx.phase === 'after') {
    return streetLayout ? streetLayout(ctx) : out;
  }
  const grounds = ctx.eventGrounds || getEventGroundVenueComponents(ctx.eventGroundTiles || []);
  grounds.forEach(venue => layoutEventGroundFair(out,venue,ctx));
  layoutVictoriaParkLny(out, ctx);
  (ctx.courts || []).forEach((court) => {
    const spot = FESTIVAL_BUILDING_SPOTS[court.textureKey];
    if (spot?.areas?.court) layoutLnyStalls(out, court, spot.areas.court, spot.pxPerM, LNY_AREAS.court.court, ctx, `court:${court.id}`);
  });
  if (ctx.phase === 'peak') {
    (ctx.temples || []).forEach((temple) => {
      const fc = FESTIVAL_BUILDING_SPOTS[temple.textureKey]?.spots?.forecourt;
      if (!fc) return;
      add(`incense:${temple.id}`, 'templeIncenseBurner', temple, [fc[0] - 60, fc[1] - 10]);
    });
  }
  if (streetLayout) out.push(...streetLayout(ctx));
  return out;
}

// ── 六四 (docs/festival-dlc-design.md §4.3): a quiet remembrance ──────────────
// No stage, screen, banners, booths or police; no text anywhere. People sit quietly with candles on
// the pitches of one Victoria Park, as at the real vigil, among patches of candles, drawn at the
// park's own scale; the 國殤之柱 and flowers in the paved square (Norton 2026-10-13). They arrive from one corner from
// 19:00, the ground is full by 20:00, and they leave again from 22:00 until 22:30. How full it
// gets follows the population, and is only ever drawn - no figure is shown anywhere.
const JUNE4_AREAS = Object.freeze(['pitch', 'tennis', 'basketball']);
// a cell is one group of seated people or one patch of candles, at the park art's scale
const JUNE4_CELL_M = 1.2;
const JUNE4_ARRIVE = Object.freeze({ from: 19 * 60, to: 20 * 60 });
const JUNE4_LEAVE = Object.freeze({ from: 22 * 60, to: 22 * 60 + 30 });
// what stands in a cell, by share
const JUNE4_CELL_KINDS = Object.freeze([
  [0.26, 'june4Sitting'], [0.16, 'june4SitA'], [0.16, 'june4SitB'], [0.14, 'june4SitC'],
  [0.12, 'june4Candles1'], [0.16, 'june4Candles2'],
]);

/** How much of the ground is taken at a minute, 0..1: arriving, full, leaving. */
function getJune4Presence(minuteOfDay) {
  const m = Number(minuteOfDay) < 6 * 60 ? Number(minuteOfDay) + 24 * 60 : Number(minuteOfDay);
  if (!Number.isFinite(m) || m < JUNE4_ARRIVE.from || m >= JUNE4_LEAVE.to) return 0;
  if (m < JUNE4_ARRIVE.to) return (m - JUNE4_ARRIVE.from) / (JUNE4_ARRIVE.to - JUNE4_ARRIVE.from);
  if (m < JUNE4_LEAVE.from) return 1;
  return 1 - (m - JUNE4_LEAVE.from) / (JUNE4_LEAVE.to - JUNE4_LEAVE.from);
}

/**
 * 六四 for a city: the remembrance on the first Victoria Park, or nothing without one.
 * @param {object} ctx  parks ({ id, textureKey }), minute (minute of the day), population, seed
 */
function layoutJune4(ctx) {
  const park = (ctx.parks || []).find((p) => FESTIVAL_BUILDING_SPOTS[p.textureKey]?.areas?.pitch);
  const presence = getJune4Presence(ctx.minute);
  if (!park || presence <= 0) return [];
  const spot = FESTIVAL_BUILDING_SPOTS[park.textureKey];
  const out = [];
  const add = (id, partId, point) => out.push({ id: `june4:${id}`, festival: 'june4', partId, mode: 'building', buildingId: park.id, point });
  // the pillar in the square, flowers and candles at its foot - there from the start
  const plaza = spot.areas.plaza;
  add('pillar', 'june4Pillar', getFestivalAreaPoint(plaza, 0.55, 0.5));
  add('flowers1', 'june4Flowers', getFestivalAreaPoint(plaza, 0.4, 0.38));
  add('flowers2', 'june4Flowers', getFestivalAreaPoint(plaza, 0.4, 0.66));
  add('candles1', 'june4Candles2', getFestivalAreaPoint(plaza, 0.3, 0.5));
  // a small city fills a corner of the pitch; a big one all three grounds
  const share = Math.max(0.2, Math.min(1, 0.2 + (Number(ctx.population) || 0) / 300000));
  const cells = [];
  JUNE4_AREAS.forEach((name, areaIndex) => {
    const area = spot.areas[name];
    if (!area) return;
    const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]) / spot.pxPerM;
    const uN = Math.max(1, Math.floor(len(area.left, area.top) / JUNE4_CELL_M));
    const vN = Math.max(1, Math.floor(len(area.top, area.right) / JUNE4_CELL_M));
    for (let i = 0; i < uN; i++) {
      for (let k = 0; k < vN; k++) {
        // the order people come in: from the area's near corner outward, the pitch first
        const order = areaIndex + (i / uN + (vN - 1 - k) / vN) / 2 + 0.08 * lnyHash(`${ctx.seed}:june4:${name}:${i}:${k}:o`);
        cells.push({ name, area, i, k, uN, vN, order });
      }
    }
  });
  cells.sort((a, b) => a.order - b.order);
  const shown = Math.round(cells.length * share * presence);
  cells.slice(0, shown).forEach((c) => {
    const roll = lnyHash(`${ctx.seed}:june4:${c.name}:${c.i}:${c.k}:kind`);
    let acc = 0;
    const kind = (JUNE4_CELL_KINDS.find(([w]) => (acc += w) > roll) || JUNE4_CELL_KINDS[0])[1];
    // up to a third of a cell's give either way, so the rows do not read as a grid
    const ju = (lnyHash(`${ctx.seed}:${c.name}:${c.i}:${c.k}:u`) - 0.5) * 0.66;
    const jv = (lnyHash(`${ctx.seed}:${c.name}:${c.i}:${c.k}:v`) - 0.5) * 0.66;
    add(`${c.name}:${c.i}:${c.k}`, kind, getFestivalAreaPoint(c.area, (c.i + 0.5 + ju) / c.uN, (c.k + 0.5 + jv) / c.vN));
  });
  return out;
}

// ── 盂蘭 (docs/festival-dlc-design.md §4.4): 燒街衣 on the old streets, the 勝會 on a court ─────
// Roadside: groups of burning bins, offerings, candles and paper on the pavements of the one to three
// districts with the most, and oldest, homes - the same kerb slots the street furniture uses, the
// same each year. The 勝會: the opera stage facing rows of stools (the front row left empty, for
// the 好兄弟), the 孤魂之位 shrine and 奠 banners, the altar, the furnace with the paper horse, boat
// and house, the rice booth with its queue. Fire light, smoke and the green ghost lights are drawn
// over these at runtime (festival-yulan.js).
const YULAN_TIMES = Object.freeze({
  rice: Object.freeze([6 * 60, 12 * 60]),       // 派平安米: the queue at the booth
  street: Object.freeze([18 * 60, 24 * 60 + 30]), // the offerings out on the pavements
  fire: Object.freeze([19 * 60, 24 * 60 + 30]),   // and burning
  opera: Object.freeze([19 * 60, 23 * 60]),       // 神功戲: the audience
  burn: Object.freeze([23 * 60 + 30, 24 * 60 + 30]), // the paper effigies burned
});
const YULAN_MAX_DISTRICTS = 3;
const YULAN_MAX_GROUPS = 60;
const YULAN_MAX_VENUES = 3;
const YULAN_KERB_IN_M = 7.6;   // a tile's centre to the pavement (the street furniture's 0.38 tile)
const YULAN_KERB_ALONG_M = 5;  // to the middle of the half tile
const YULAN_SIDE_ALONG = Object.freeze({ n: ['e', 'w'], s: ['e', 'w'], e: ['n', 's'], w: ['n', 's'] });
const YULAN_BINS = Object.freeze(['yulanBarrel', 'yulanBinStool', 'yulanCauldron', 'yulanCage']);
// the 端午 crowds: a heightM for the whole picture (raised arms and all), so each person stands about
// 1.7 m, as tall as the figures the court art paints (Norton 2026-10-14: 人群既高度)
const YULAN_CROWD = 2.4;

const yulanSkyMinute = (m) => (Number(m) < 6 * 60 ? Number(m) + 24 * 60 : Number(m));
const yulanDuring = (minute, [from, to]) => { const m = yulanSkyMinute(minute); return m >= from && m < to; };

/**
 * The roadside groups: the districts with the most homes on their pavements, weighted by how old
 * they are, and in them every slot that wins its roll and has none of its neighbours taken.
 * @param {Array<{ row, col, side, half, district, age }>} slots  free kerb slots facing homes
 * @returns {Array<object>} the chosen slots, each with `district`
 */
function pickYulanStreets(slots, seed = '') {
  const byDistrict = new Map();
  slots.forEach((s) => {
    const d = byDistrict.get(s.district) || { district: s.district, slots: [], age: 0 };
    d.slots.push(s);
    d.age += Number(s.age) || 0;
    byDistrict.set(s.district, d);
  });
  const ranked = [...byDistrict.values()]
    .map((d) => ({ ...d, score: d.slots.length * (1 + d.age / d.slots.length / 120) }))
    .sort((a, b) => b.score - a.score || String(a.district).localeCompare(String(b.district)))
    .slice(0, YULAN_MAX_DISTRICTS);
  const picked = [];
  const taken = new Set();
  // a fair share each, so the first district does not take them all
  const perDistrict = Math.ceil(YULAN_MAX_GROUPS / Math.max(1, ranked.length));
  ranked.forEach((d) => {
    let mine = 0;
    d.slots
      .map((s) => ({ s, roll: lnyHash(`${seed}:yulan:${s.row}:${s.col}:${s.side}`) }))
      // the slots a viewer can see first (no building in front: s.open, festival-yulan.js); the
      // spacing below keeps the groups apart
      .sort((a, b) => (a.s.open === false) - (b.s.open === false) || a.roll - b.roll)
      .forEach(({ s }) => {
        if (picked.length >= YULAN_MAX_GROUPS || mine >= perDistrict) return;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (taken.has(`${s.row + dr}:${s.col + dc}`)) return;
        taken.add(`${s.row}:${s.col}`);
        picked.push(s);
        mine += 1;
      });
  });
  return picked;
}

// One roadside group (Norton 2026-10-14: 燒街衣係有人係路邊燒，阿飄係附近收嘢): a neighbour crouched at a
// burning bin with the offerings beside it, sometimes a second, candles, a stool, paper, a 燒街衣
// barrier or a cone; after nine a 阿飄 comes to the offerings, and stays past the last of the fire.
// Drawn a little larger than life (YULAN_STREET_SCALE), as the game draws its streets.
const YULAN_STREET_SCALE = 1.5;
function layoutYulanStreetGroup(out, s, ctx) {
  const roll = (salt) => lnyHash(`${ctx.seed}:yulan:${s.row}:${s.col}:${s.side}:${salt}`);
  // alongM: metres from the tile's centre toward its `half` end; inM: further toward the kerb (+)
  // or the building line (-)
  const add = (key, partId, alongM, inM = 0, extra = {}) => {
    const part = typeof FESTIVAL_PARTS_BY_ID !== 'undefined' ? FESTIVAL_PARTS_BY_ID[partId] : null;
    out.push({
      id: `yulan:street:${s.row}:${s.col}:${s.side}:${key}`, festival: 'yulan', partId, mode: 'tile', row: s.row, col: s.col,
      offsets: [[s.side, YULAN_KERB_IN_M + inM], [s.half, alongM]],
      district: s.district, ...(part?.heightM && !extra.heightM ? { heightM: part.heightM * YULAN_STREET_SCALE } : {}), ...extra,
    });
  };
  const burning = yulanDuring(ctx.minute, YULAN_TIMES.fire);
  const man = roll('who') < 0.5;
  if (burning) {
    add('bin', YULAN_BINS[Math.floor(roll('bin') * YULAN_BINS.length)], 5, 0, { fire: true });
    add('burner', man ? 'yulanBurnerMan' : 'yulanBurnerWoman', 6.8, -1.2, { heightM: 1.7 * YULAN_STREET_SCALE });
    if (roll('second') < 0.35 && yulanDuring(ctx.minute, [19 * 60, 22 * 60])) {
      add('burner2', man ? 'yulanBurnerWoman' : 'yulanBurnerMan', 3.2, -1.6, { heightM: 1.7 * YULAN_STREET_SCALE });
    }
  }
  add('mat', 'yulanMat', 2.4, 0.4, { heightM: undefined });
  if (roll('candles') < 0.5) add('candles', 'yulanRedCandles', 1, -0.6);
  if (roll('paper') < 0.6) add('paper', roll('paperKind') < 0.5 ? 'yulanPaperStack' : 'yulanBasket', 7.5, 0.6);
  if (roll('barrier') < 0.25) add('barrier', 'yulanBarrier', 9, -0.8);
  else if (roll('cone') < 0.3) add('cone', 'yulanCone', 9, -0.8);
  // the 阿飄 at the offerings, from nine (a few come early), until the street is swept
  const comes = 21 * 60 + Math.floor(roll('ghostAt') * 120);
  if (roll('ghost') < 0.55 && yulanSkyMinute(ctx.minute) >= comes) {
    add('ghost', roll('ghostKind') < 0.5 ? 'yulanGhostA' : 'yulanGhostB', 1.4, 1.4, { heightM: 1.7 * YULAN_STREET_SCALE, floating: true });
  }
}

// The 勝會 on one area (u from its left corner toward the top one, v toward the bottom one): the
// stage at the far side facing down to the rows of stools, the shrine on the left, the furnace and
// effigies on the right, the rice booth by the near corner. `at(u, v, key, partId, extra)` places.
function layoutYulanFair(at, ctx) {
  // the stage over the far hoop, as a real 戲棚 stands over the court (Norton 2026-10-14), its front to
  // the stools
  at(0.66, 0.56, 'stage', 'yulanStage');
  // stools in rows before it; the front row is left empty for the 好兄弟
  const audience = yulanDuring(ctx.minute, YULAN_TIMES.opera);
  [0.5, 0.41, 0.32].forEach((u, row) => {
    [0.3, 0.44, 0.58, 0.72].forEach((v, k) => {
      at(u, v, `stools:${row}:${k}`, 'yulanStools');
      if (audience && row > 0) at(u - 0.04, v, `audience:${row}:${k}`, k % 2 ? 'dbspectatorsBack2' : 'dbspectatorsBack1', { heightM: YULAN_CROWD });
    });
  });
  // the 孤魂之位 with its banners and altar on the left
  at(0.35, 0.08, 'shrine', 'yulanShrine', { ghost: true });
  at(0.55, 0.06, 'banner1', 'yulanBanner');
  at(0.15, 0.1, 'banner2', 'yulanBanner');
  at(0.32, 0.2, 'altar', 'yulanAltar');
  at(0.24, 0.24, 'incense', 'templeIncenseBurner');
  // the furnace and the paper effigies on the right, burned at the end of the night
  at(0.5, 0.94, 'furnace', 'yulanFurnace', { fire: yulanDuring(ctx.minute, YULAN_TIMES.fire) });
  const burnt = yulanSkyMinute(ctx.minute) >= YULAN_TIMES.burn[1];
  const burning = yulanDuring(ctx.minute, YULAN_TIMES.burn);
  if (!burnt) {
    [['horse', 'yulanHorse', 0.32], ['boat', 'yulanBoat', 0.22], ['house', 'yulanHouse', 0.12]].forEach(([key, partId, u]) => {
      at(u, 0.9, key, partId, { effigy: true, burning });
    });
  }
  at(0.38, 0.84, 'paper', 'yulanPaperStack');
  // 派平安米: the booth by the near corner and, in the morning, its queue
  at(0.08, 0.62, 'rice', 'lnyInfoBooth');
  if (yulanDuring(ctx.minute, YULAN_TIMES.rice)) {
    [0.5, 0.4].forEach((v, i) => at(0.1, v, `queue:${i}`, i ? 'dbspectatorsFront2' : 'dbspectatorsFront1', { heightM: YULAN_CROWD }));
  }
}

/**
 * 盂蘭 for a city.
 * @param {object} ctx  minute, seed, kerbSlots ([{ row, col, side, half, district, age }]),
 *   courts / sportsGrounds ({ id, textureKey, district }), eventGrounds (components, with district)
 */
function layoutYulan(ctx) {
  const out = [];
  // the old districts (for the 勝會); the street groups drawn are those in the player's view when
  // the game gives them (festival-yulan.js pickYulanViewStreets), else these
  const streets = pickYulanStreets(ctx.kerbSlots || [], ctx.seed);
  const drawn = ctx.viewStreets || streets;
  if (yulanDuring(ctx.minute, YULAN_TIMES.street)) drawn.forEach((s) => layoutYulanStreetGroup(out, s, ctx));
  // the 勝會: up to three, the old districts first, then any
  const oldDistricts = [...new Set(streets.map((s) => s.district))];
  const venues = [];
  (ctx.eventGrounds || []).forEach((g) => {
    const rect = findEventGroundRectangle(g, 2, 2);
    if (rect) venues.push({ kind: 'ground', id: g.id, rect, district: g.district });
  });
  [...(ctx.sportsGrounds || []), ...(ctx.courts || [])].forEach((b) => {
    const spot = FESTIVAL_BUILDING_SPOTS[b.textureKey];
    const area = spot?.areas?.field || spot?.areas?.court;
    if (area) venues.push({ kind: 'building', id: b.id, area, district: b.district });
  });
  const rank = (v) => { const i = oldDistricts.indexOf(v.district); return i < 0 ? 99 : i; };
  const chosen = [];
  venues.sort((a, b) => rank(a) - rank(b) || String(a.id).localeCompare(String(b.id))).forEach((v) => {
    if (chosen.length >= YULAN_MAX_VENUES || chosen.some((c) => c.district != null && c.district === v.district)) return;
    chosen.push(v);
  });
  chosen.forEach((v) => {
    const at = v.kind === 'building'
      ? (u, vv, key, partId, extra = {}) => out.push({ id: `yulan:fair:${v.id}:${key}`, festival: 'yulan', partId, mode: 'building', buildingId: v.id, point: getFestivalAreaPoint(v.area, u, vv), ...extra })
      : (u, vv, key, partId, extra = {}) => {
        // on the ground's 2 x 2 tiles: u from its left corner (last row, first column) toward the top
        // (first row), v toward the bottom (last column) - as the building areas at rotation 0
        const { row, col, rows, cols } = v.rect;
        const r = row - 0.5 + rows * (1 - u);
        const c = col - 0.5 + cols * vv;
        out.push({ id: `yulan:fair:${v.id}:${key}`, festival: 'yulan', partId, mode: 'tile', row: r, col: c,
          groundBuildingId: `${Math.min(row + rows - 1, Math.max(row, Math.round(r)))}:${Math.min(col + cols - 1, Math.max(col, Math.round(c)))}`, ...extra });
      };
    layoutYulanFair(at, ctx);
  });
  return out;
}

/** Every placement of a festival for the city as it stands. */
function layoutFestival(id, ctx) {
  if (id === 'yulan') return layoutYulan(ctx);
  if (id === 'june4') return layoutJune4(ctx);
  if (id === 'christmas') return layoutChristmasDecorations(ctx);
  if (id === 'lunarNewYear') return layoutLunarNewYear(ctx);
  return [];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FESTIVAL_BUILDING_SPOTS,
    getFestivalVenueContext,
    getEventGroundVenueComponents,
    findEventGroundRectangle,
    CHRISTMAS_PROMENADE_CYCLE,
    CHRISTMAS_PROMENADE_SPACING,
    layoutChristmasDecorations,
    layoutLunarNewYear,
    VICTORIA_LNY_MODULES,
    VICTORIA_LNY_STALL_SPECS,
    getVictoriaParkLnyVenues,
    getVictoriaLnyFieldSize,
    getFestivalAreaPoint,
    LNY_AREAS,
    getLnyRows,
    layoutFestival,
    orderFestivalPromenadeRuns,
    layoutYulan,
    pickYulanStreets,
    YULAN_TIMES,
    layoutJune4,
    getJune4Presence,
  };
}
