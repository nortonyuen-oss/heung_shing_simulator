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
    // art pixels to a metre along a map axis: its 4 x 4 diamond, 1013 px across, is 80 m a side
    pxPerM: 7.08,
    spots: Object.freeze({ centre: Object.freeze([585, 738]) }),
    // the open ground: each area's left, top and right corners (the fourth is left + right - top).
    // The 年宵 market spreads over all of them (Norton 2026-10-11: 遍佈整個公園既唔同 section).
    areas: Object.freeze({
      pitch: Object.freeze({ left: [146, 674], top: [272, 606], right: [360, 658] }),      // the football pitch
      plaza: Object.freeze({ left: [503, 722], top: [578, 685], right: [680, 735] }),      // the paved square
      lawn: Object.freeze({ left: [400, 600], top: [465, 566], right: [540, 603] }),       // the great lawn, north
      tennis: Object.freeze({ left: [225, 768], top: [305, 725], right: [425, 750] }),     // the tennis courts
      basketball: Object.freeze({ left: [610, 605], top: [660, 575], right: [800, 622] }), // the basketball courts
    }),
    // the 年宵's way in on the lower-right edge's middle (along it, 6.33 x -3.16 px a metre; inward,
    // -6.33 x -3.16): the arch a metre in, the map and the booth 6 m either side and 3 m in
    way: Object.freeze({ gate: Object.freeze([759, 842]), map: Object.freeze([708, 855]), booth: Object.freeze([784, 817]) }),
  }),
  // the 2x2 sports ground is a basketball court: a neighbourhood flower market on the court
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
      if (record?.type === 'sports_ground_small' || record?.type === 'heritage_temple' || record?.type === 'grand_temple') {
        const key = record.spriteKey || scene?.buildingSprites?.get(id)?.texture?.key;
        if (key && FESTIVAL_BUILDING_SPOTS[key]) (record.type === 'sports_ground_small' ? courts : temples).push({ id, textureKey: key, cols: record.footprintCols, rows: record.footprintRows });
        return;
      }
      if (record?.type !== 'park_flagship') return;
      // the record's key: after dark the sprite wears its night texture under another key
      const textureKey = record.spriteKey || scene?.buildingSprites?.get(id)?.texture?.key;
      if (textureKey) parks.push({ id, textureKey, cols: record.footprintCols || 4, rows: record.footprintRows || 4 });
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

// What the stalls sell. As at the real 維園年宵 the fair is zoned: 濕貨 (flowers, kumquats) on the
// pitches and courts, 乾貨 (揮春, 利是, toys, pinwheels, gifts) on the paved square, the 熟食 stalls in
// a row of their own at its end.
const LNY_WET_GOODS = Object.freeze(['lnyStallBlossoms', 'lnyStallPeach', 'lnyStallKumquat', 'lnyStallOrchids', 'lnyStallNarcissus', 'lnyStallFlowers']);
const LNY_DRY_GOODS = Object.freeze(['lnyStallLaisee', 'lnyStallCouplets', 'lnyStallPinwheels', 'lnyStallToys', 'lnyStallGifts']);
const LNY_FOOD = Object.freeze(['lnyStallSnacks']);

// The stalls stand shoulder to shoulder in long rows, every row facing an aisle (the art shows a
// stall from its front, so no back-to-back rows): a 2 m stall, an aisle by tier, a metre clear of
// the area's edges; rows run along the area's v side (the art's front edge), across its u side.
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
 * 新春 for a city: the main 年宵 market on one Victoria Park's pitch (the player's pick, else the
 * first), a small one in every other Victoria Park and on every basketball court, a lion dance and
 * the incense burner at each temple; the morning after (phase 'after'), lion dances at the malls'
 * doors (開年舞獅).
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
  if (ctx.phase === 'after') {
    (ctx.malls || []).forEach((mall, i) => {
      const door = FESTIVAL_BUILDING_SPOTS[mall.modelKey]?.spots?.door;
      if (!door || FESTIVAL_BUILDING_SPOTS[mall.modelKey].christmas !== 'christmasTree') return; // the big malls
      add(`lion:${mall.id}`, i % 2 ? 'lnyLionGold' : 'lnyLionRed', mall, door);
      add(`drum:${mall.id}`, 'lnyDrum', mall, [door[0] + 70, door[1] + 30]);
    });
    return out;
  }
  const grounds = ctx.eventGrounds || getEventGroundVenueComponents(ctx.eventGroundTiles || []);
  grounds.forEach(venue => layoutEventGroundFair(out,venue,ctx));
  const parks = (ctx.parks || []).filter((p) => FESTIVAL_BUILDING_SPOTS[p.textureKey]?.areas?.pitch);
  const main = parks.find((p) => p.id === ctx.mainVenue) || parks[0];
  parks.forEach((park) => {
    const areas = FESTIVAL_BUILDING_SPOTS[park.textureKey].areas;
    const isMain = park === main;
    const pxPerM = FESTIVAL_BUILDING_SPOTS[park.textureKey].pxPerM;
    Object.entries(LNY_AREAS[isMain ? 'main' : 'park']).forEach(([name, zone]) => {
      if (areas[name]) layoutLnyStalls(out, park, areas[name], pxPerM, zone, ctx, `park:${park.id}:${name}`);
    });
    if (!isMain) return;
    // the way in at the south gate: the 年宵 arch, the site map, the information booth
    // the way in: the arch on the park's lower-right edge, its beam along that edge (squared, the
    // mirror for that diagonal), the site map and the information booth either side, just inside. Fixed
    // on the park's art, which is the same picture at every map rotation (Norton 2026-10-11).
    const way = FESTIVAL_BUILDING_SPOTS[park.textureKey].way;
    if (way) {
      add(`gate:${park.id}`, 'lnyGate', park, way.gate, { mirrored: true });
      add(`map:${park.id}`, 'lnySiteMap', park, way.map);
      add(`booth:${park.id}`, 'lnyInfoBooth', park, way.booth);
    }
    const lawn = areas.lawn;
    if (ctx.phase === 'setup') {
      add(`trolley1:${park.id}`, 'lnyTrolleyFlowers', park, getFestivalAreaPoint(areas.pitch, 0.5, 0.5));
      add(`trolley2:${park.id}`, 'lnyTrolleyBoxes', park, getFestivalAreaPoint(areas.plaza, 0.5, 0.5));
      return;
    }
    // the show ground on the great lawn: the stage at its back facing the open lawn (mirrored, Norton
    // 2026-10-11), flags and firecrackers either side
    add(`stage:${park.id}`, 'lnyStage', park, getFestivalAreaPoint(lawn, 0.8, 0.45), { mirrored: true });
    add(`crackers:${park.id}`, 'lnyFirecrackers', park, getFestivalAreaPoint(lawn, 0.15, 0.85));
    add(`banners:${park.id}`, 'lnyBanners', park, getFestivalAreaPoint(lawn, 0.85, 0.2));
    if (ctx.phase === 'peak') {
      add(`poles:${park.id}`, 'lnyLionPoles', park, getFestivalAreaPoint(lawn, 0.75, 0.75));
      add(`dragon:${park.id}`, 'lnyDragon', park, getFestivalAreaPoint(areas.plaza, 0.5, 0.95));
    }
  });
  (ctx.courts || []).forEach((court) => {
    const spot = FESTIVAL_BUILDING_SPOTS[court.textureKey];
    if (spot?.areas?.court) layoutLnyStalls(out, court, spot.areas.court, spot.pxPerM, LNY_AREAS.court.court, ctx, `court:${court.id}`);
  });
  if (ctx.phase === 'peak') {
    (ctx.temples || []).forEach((temple) => {
      const fc = FESTIVAL_BUILDING_SPOTS[temple.textureKey]?.spots?.forecourt;
      if (!fc) return;
      add(`incense:${temple.id}`, 'templeIncenseBurner', temple, [fc[0] - 60, fc[1] - 10]);
      add(`lion:${temple.id}`, 'lnyLionPair', temple, fc);
      add(`drum:${temple.id}`, 'lnyDrum', temple, [fc[0] + 70, fc[1] + 25]);
    });
  }
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

/** Every placement of a festival for the city as it stands. */
function layoutFestival(id, ctx) {
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
    getFestivalAreaPoint,
    LNY_AREAS,
    getLnyRows,
    layoutFestival,
    orderFestivalPromenadeRuns,
    layoutJune4,
    getJune4Presence,
  };
}
