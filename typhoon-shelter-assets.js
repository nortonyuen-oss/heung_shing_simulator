// 避風塘素材表: every object in the typhoon-shelter art and the textures baked from it.
//
// The source sheets (scripts/source-art/typhoonShelter/*.png, already corrected to 2:1 isometric -
// see isometric-correction.json there) mostly hold one object drawn from two sides, or a row of
// small props. Each object is a `part` with its crop rectangle on the sheet. The bake
// (scripts/bake-typhoon-shelter-textures.js) writes, per part:
//   Models/typhoonShelter/ts_<id>.png          the day texture
//   Models/typhoonShelter/ts_<id>_m.png        its mirror, when `mirror` (the other diagonal)
//   ...__lit.png / ...__litb.png               night, when the part has a sea light profile
//                                              (two frames of the 漁火 twinkle, sea-lighting.js)
// Night variants are __lit*, never __night*: that suffix belongs to the building night bake.
//
// Mirroring is decided here, in the bake, never with setFlipX at runtime: every derived texture
// (night frames, anchors, the release atlas/trim) then works per texture like the street props.
// Parts with readable lettering (the 珍寶 restaurants) are not mirrored.
//
// Boats carry `facing`: the screen direction the bow points in that view (the way
// getVesselTextureDirection names directions). A mirrored texture faces the mirrored direction.
// Sheets drawn bow-on and stern-on give all four headings; sheets with two bow-on renders only two
// (missing headings are listed by getTyphoonShelterMissingHeadings).

const TYPHOON_SHELTER_TEXTURE_DIR = 'Models/typhoonShelter';
const TYPHOON_SHELTER_SOURCE_DIR = 'scripts/source-art/typhoonShelter';

const TYPHOON_SHELTER_CATEGORIES = Object.freeze([
  ['boat', '船隻'],
  ['floating', '浮台／水上屋'],
  ['pier', '碼頭／防波堤'],
  ['landmark', '海鮮舫'],
  ['marker', '浮標'],
  ['prop', '岸邊配件'],
]);

// [id suffix, rect [x, y, w, h] on the corrected sheet, extra]
const typhoonShelterPart = (sheet, category, label, views, extra = {}) => views.map(([suffix, rect, more = {}]) => Object.freeze({
  id: `${sheet}_${suffix}`,
  sheet: `${sheet}.png`,
  rect: Object.freeze(rect),
  category,
  label: `${label}${more.label ? ` · ${more.label}` : ` · ${suffix}`}`,
  mirror: (more.mirror ?? extra.mirror) !== false,
  facing: more.facing || null,
}));

const TYPHOON_SHELTER_PARTS = Object.freeze([
  // Boats - bow-on (se) and stern-on (nw) renders, unless noted.
  ...typhoonShelterPart('fishingBoat1', 'boat', '漁船 1', [['a', [291, 31, 703, 985], { facing: 'se' }], ['b', [1026, 12, 731, 1004], { facing: 'nw' }]]),
  // b is drawn nearly side-on and was only scaled, not sheared, in the isometric correction.
  ...typhoonShelterPart('fishingBoat2', 'boat', '漁船 2', [['a', [329, 238, 580, 778], { facing: 'se' }], ['b', [941, 436, 777, 579], { facing: 'se', label: 'b (側面，待重繪)' }]]),
  ...typhoonShelterPart('fishingBoat3', 'boat', '漁船 3', [['a', [306, 154, 606, 862], { facing: 'se' }], ['b', [945, 189, 797, 827], { facing: 'nw' }]]),
  ...typhoonShelterPart('fishingBoat4', 'boat', '漁船 4', [['a', [309, 211, 651, 805], { facing: 'se' }], ['b', [992, 271, 746, 745], { facing: 'nw' }]]),
  ...typhoonShelterPart('homeBoat1', 'boat', '住家艇 1', [['a', [299, 190, 662, 826], { facing: 'se' }], ['b', [993, 253, 757, 763], { facing: 'nw' }]]),
  ...typhoonShelterPart('homeBoat2', 'boat', '住家艇 2', [['a', [302, 229, 649, 787], { facing: 'se' }], ['b', [984, 194, 761, 822], { facing: 'nw' }]]),
  ...typhoonShelterPart('kaido1', 'boat', '街渡', [['a', [279, 174, 659, 842], { facing: 'se' }], ['b', [970, 198, 798, 817], { facing: 'nw' }]]),
  ...typhoonShelterPart('speedboat1', 'boat', '遊艇 1', [['a', [286, 124, 723, 892], { facing: 'se' }], ['b', [1041, 401, 720, 614], { facing: 'nw' }]]),
  ...typhoonShelterPart('speedboat2', 'boat', '遊艇 2', [['a', [238, 280, 766, 736], { facing: 'se' }], ['b', [1036, 445, 773, 570], { facing: 'nw' }]]),
  // 舢舨: both renders are bow-on (b is the longer, more side-on one).
  ...typhoonShelterPart('sanpan1', 'boat', '舢舨 1', [['a', [10, 100, 383, 401], { facing: 'se' }], ['b', [425, 36, 589, 466], { facing: 'se' }]]),
  ...typhoonShelterPart('sanpan2', 'boat', '舢舨 2 (有篷)', [['a', [386, 485, 507, 530], { facing: 'se' }], ['b', [925, 413, 736, 602], { facing: 'se' }]]),
  ...typhoonShelterPart('sanpan3', 'boat', '舢舨 3', [['a', [357, 431, 539, 585], { facing: 'se' }], ['b', [930, 383, 760, 632], { facing: 'se' }]]),
  ...typhoonShelterPart('sanpan4', 'boat', '舢舨 4 (賣貨)', [['a', [314, 378, 609, 637], { facing: 'se' }], ['b', [955, 321, 779, 695], { facing: 'se' }]]),
  ...typhoonShelterPart('sanpan5', 'boat', '舢舨 5 (搖櫓)', [['a', [321, 299, 655, 716], { facing: 'se' }], ['b', [1008, 352, 719, 664], { facing: 'se' }]]),

  ...typhoonShelterPart('homeBoat3', 'floating', '浮屋艇', [['a', [267, 305, 782, 710]], ['b', [1081, 112, 700, 903]]]),
  ...typhoonShelterPart('floatingHome', 'floating', '水上屋', [['a', [325, 76, 692, 939]], ['b', [1049, 236, 675, 779]]]),
  ...typhoonShelterPart('floatingChef', 'floating', '艇仔粥餐船', [['a', [277, 144, 750, 872]], ['b', [1060, 81, 711, 935]]]),
  ...typhoonShelterPart('floatingGasStation', 'floating', '水上油站', [['a', [287, 282, 725, 733]], ['b', [1044, 385, 716, 631]]]),
  ...typhoonShelterPart('floatingWorkshop', 'floating', '水上工場', [['a', [265, 332, 758, 684]], ['b', [1055, 325, 727, 690]]]),
  ...typhoonShelterPart('floatingPier1', 'floating', '浮橋 (樓梯)', [['a', [312, 270, 718, 746]], ['b', [1062, 277, 673, 739]]]),
  ...typhoonShelterPart('floatingPier2', 'floating', '浮橋 (長)', [['a', [253, 66, 772, 438]], ['b', [1057, 16, 736, 488]]]),
  ...typhoonShelterPart('floatingPier3', 'floating', '作業浮台', [['a', [314, 271, 739, 745]], ['b', [1085, 356, 648, 660]]]),
  ...typhoonShelterPart('floatingPier4', 'floating', '浮台 (細)', [['a', [363, 129, 600, 375]], ['b', [996, 30, 688, 474]]]),

  ...typhoonShelterPart('pierSet1', 'pier', '石碼頭', [['a', [432, 45, 562, 458]], ['b', [1026, 8, 590, 496]]]),
  ...typhoonShelterPart('pierSet2', 'pier', '木碼頭', [['a', [263, 394, 761, 622]], ['b', [1056, 359, 728, 657]]]),
  ...typhoonShelterPart('pierShop1', 'pier', '碼頭士多', [['a', [255, 235, 793, 780]], ['b', [1081, 124, 710, 892]]]),
  ...typhoonShelterPart('pierShop2', 'pier', '魚檔', [['a', [330, 74, 674, 942]], ['b', [1037, 59, 681, 956]]]),
  ...typhoonShelterPart('causeway1', 'pier', '防波堤', [['a', [402, 61, 635, 443]], ['b', [1069, 8, 577, 495]]]),
  ...typhoonShelterPart('causeway2', 'pier', '防波堤燈塔', [['a', [323, 72, 696, 944]], ['b', [1051, 33, 674, 983]]]),
  ...typhoonShelterPart('causeway3', 'pier', '防波堤吊機', [['a', [365, 12, 651, 1004]], ['b', [1048, 72, 635, 944]]]),

  // The restaurant sheets are three renders, not views of one model: 1 and 3 lie along one
  // diagonal, 2 along the other. Never mirrored - the 珍寶 signs would read backwards.
  ...typhoonShelterPart('floatingRestaurant1', 'landmark', '珍寶海鮮舫 1', [['a', [314, 39, 1420, 977]]], { mirror: false }),
  ...typhoonShelterPart('floatingRestaurant2', 'landmark', '珍寶海鮮舫 2', [['a', [384, 12, 1279, 1004]]], { mirror: false }),
  ...typhoonShelterPart('floatingRestaurant3', 'landmark', '珍寶海鮮舫 3', [['a', [375, 12, 1297, 1003]]], { mirror: false }),

  ...typhoonShelterPart('bout1', 'marker', '航標', [['a', [469, 11, 546, 1005], { label: '紅' }], ['b', [1047, 56, 531, 960], { label: '綠' }]]),
  ...typhoonShelterPart('bout2', 'marker', '繫泊浮泡', [['a', [9, 126, 492, 378]], ['b', [533, 84, 482, 420]]]),
  ...typhoonShelterPart('bout3', 'marker', '浮泡串', [['a', [390, 48, 644, 455]], ['b', [1070, 8, 589, 494]]]),

  ...typhoonShelterPart('shoreAssessories1', 'prop', '漁具堆 1', [['a', [358, 367, 647, 649]], ['b', [1037, 216, 653, 800]]]),
  ...typhoonShelterPart('shoreAssessories2', 'prop', '碼頭燈', [['a', [8, 109, 428, 907], { label: '單燈' }], ['b', [468, 169, 547, 847], { label: '雙燈' }]]),
  ...typhoonShelterPart('shoreAssessories3', 'prop', '漁具堆 2', [['a', [331, 142, 707, 874]], ['b', [1070, 238, 646, 778]]]),
  ...typhoonShelterPart('shoreAssessories4', 'prop', '漁具堆 3', [['a', [332, 276, 686, 740]], ['b', [1050, 259, 665, 757]]]),
  ...typhoonShelterPart('shoreFence', 'prop', '海旁欄杆', [
    ['corner', [107, 289, 630, 393], { label: '轉角' }],
    ['straightA', [769, 203, 553, 479], { label: '直段 A' }],
    ['gate', [882, 714, 284, 302], { label: '閘' }],
    ['straightB', [1354, 178, 586, 504], { label: '直段 B' }],
  ]),
  ...typhoonShelterPart('pierAssessories', 'prop', '繫纜樁', [
    ['bollardRope', [422, 12, 397, 485], { label: '大纜樁 (纜)' }],
    ['bollardSmall', [440, 792, 232, 224], { label: '細纜樁' }],
    ['cleat', [535, 412, 360, 366], { label: '羊角' }],
    ['bollardTall', [711, 735, 227, 272], { label: '高纜樁' }],
    ['bollardDouble', [843, 55, 459, 435], { label: '雙纜樁' }],
    ['cleatTimber', [920, 485, 535, 321], { label: '木座羊角 (纜)' }],
    ['cleatSmall', [981, 785, 316, 207], { label: '細羊角 (纜)' }],
    ['bollardTimber', [1279, 146, 347, 418], { label: '木座纜樁 (纜)' }],
    ['mooringRing', [1364, 677, 254, 292], { label: '繫船環' }],
  ]),
]);

const TYPHOON_SHELTER_PARTS_BY_ID = Object.freeze(Object.fromEntries(TYPHOON_SHELTER_PARTS.map((p) => [p.id, p])));

const TYPHOON_SHELTER_MIRRORED_FACING = Object.freeze({ se: 'sw', sw: 'se', nw: 'ne', ne: 'nw' });

function getTyphoonShelterTexturePath(id, { mirrored = false, night = 0 } = {}) {
  const suffix = night === 1 ? '__lit' : night === 2 ? '__litb' : '';
  return `${TYPHOON_SHELTER_TEXTURE_DIR}/ts_${id}${mirrored ? '_m' : ''}${suffix}.png`;
}

// Every texture the bake writes for a part's day art: [{ file, mirrored, facing }].
function getTyphoonShelterPartTextures(partDef) {
  const list = [{ file: getTyphoonShelterTexturePath(partDef.id), mirrored: false, facing: partDef.facing }];
  if (partDef.mirror) {
    list.push({
      file: getTyphoonShelterTexturePath(partDef.id, { mirrored: true }),
      mirrored: true,
      facing: partDef.facing ? TYPHOON_SHELTER_MIRRORED_FACING[partDef.facing] : null,
    });
  }
  return list;
}

// Boat model (sheet name) -> { se: [{ id, mirrored }], sw: [...], nw: [...], ne: [...] }
function getTyphoonShelterBoatHeadings(sheet) {
  const headings = { se: [], sw: [], nw: [], ne: [] };
  TYPHOON_SHELTER_PARTS.filter((p) => p.sheet === `${sheet}.png` && p.facing).forEach((p) => {
    getTyphoonShelterPartTextures(p).forEach((t) => headings[t.facing]?.push({ id: p.id, mirrored: t.mirrored }));
  });
  return headings;
}

function getTyphoonShelterMissingHeadings(sheet) {
  const headings = getTyphoonShelterBoatHeadings(sheet);
  return Object.keys(headings).filter((h) => !headings[h].length);
}

// ---------------------------------------------------------------------------
// 防波堤組件: chaining the causeway art into a long breakwater
// ---------------------------------------------------------------------------
//
// The causeway sheets were not drawn as a modular kit, but they chain well enough (checked by
// compositing, 2026-10-03): a straight section repeated along its diagonal reads as one long
// breakwater - every section's end wall shows as a joint, like an expansion joint - and the
// lighthouse (causeway2) and crane (causeway3) heads cap either end of a run or turn it.
// Only the turn whose corner points at the camera (a V: a run in from the north-west, out to the
// north-east, or the mirror of that) has been checked by eye; on the other turns the joint lands on
// a head's front face (its stairs and tyres). There is no T junction.
//
// Every number is a pixel of the baked day texture (ts_<id>.png), unmirrored. A mirrored texture
// uses x -> width - x and swaps nw<->ne, se<->sw. Ends and faces are the middle of the deck edge
// where a run meets the next piece, at the straight section's deck height; `step` is the
// horizontal distance (screen px) from one section to the next along its diagonal - a little short
// of the deck's length, so each section tucks its end wall under the next. A head is drawn at
// `scale` times the section textures' scale; its faces are given at that scale's deck height (the
// head's own deck stands higher - it has steps up). `headGap` is how far (horizontal px) a head's
// face sits out from the end of the run it caps.
//
// The two section renders differ: causeway1_a is long and narrow (deck 48 px across, ~3.8 decks
// long), causeway1_b shorter and wider (64 px, ~2.5). Do not mix them within one run.

const TYPHOON_SHELTER_BREAKWATER = Object.freeze({
  headGap: 12,
  segments: Object.freeze({
    causeway1_a: Object.freeze({
      width: 512, axis: 'nwse', step: 170, deckAcross: 48,
      ends: Object.freeze({ nw: Object.freeze([170, 252]), se: Object.freeze([352, 341]) }),
    }),
    causeway1_b: Object.freeze({
      width: 512, axis: 'nesw', step: 160, deckAcross: 64,
      ends: Object.freeze({ sw: Object.freeze([188, 300]), ne: Object.freeze([348, 221]) }),
    }),
  }),
  heads: Object.freeze({
    causeway2_a: Object.freeze({
      width: 512, scale: 0.55, label: '燈塔堤頭',
      faces: Object.freeze({ nw: Object.freeze([181, 682]), ne: Object.freeze([331, 682]), se: Object.freeze([331, 757]), sw: Object.freeze([181, 757]) }),
    }),
    causeway3_a: Object.freeze({
      width: 512, scale: 0.55, label: '吊機堤頭',
      faces: Object.freeze({ nw: Object.freeze([187, 685]), ne: Object.freeze([332, 685]), se: Object.freeze([332, 760]), sw: Object.freeze([187, 760]) }),
    }),
  }),
});

const TYPHOON_SHELTER_DIR_UNIT = Object.freeze({ se: [1, 0.5], nw: [-1, -0.5], ne: [1, -0.5], sw: [-1, 0.5] });
const TYPHOON_SHELTER_DIR_OPPOSITE = Object.freeze({ se: 'nw', nw: 'se', ne: 'sw', sw: 'ne' });
const TYPHOON_SHELTER_DIR_MIRROR = Object.freeze({ se: 'sw', sw: 'se', nw: 'ne', ne: 'nw' });

function mirrorTyphoonShelterPoints(points, width) {
  return Object.fromEntries(Object.entries(points).map(([dir, [x, y]]) => [TYPHOON_SHELTER_DIR_MIRROR[dir], [width - x, y]]));
}

// A straight section for a run heading `dir`: the art itself on its own diagonal, the mirror on
// the other. `id` defaults to the long section.
function getTyphoonShelterBreakwaterSegment(dir, id = 'causeway1_a') {
  const def = TYPHOON_SHELTER_BREAKWATER.segments[id];
  if (!def) throw new Error(`unknown breakwater section ${id}`);
  if (!TYPHOON_SHELTER_DIR_UNIT[dir]) throw new Error(`unknown direction ${dir}`);
  const onOwnAxis = def.axis === 'nwse' ? dir === 'nw' || dir === 'se' : dir === 'ne' || dir === 'sw';
  const mirrored = !onOwnAxis;
  return {
    id,
    mirrored,
    texture: getTyphoonShelterTexturePath(id, { mirrored }),
    step: def.step,
    ends: mirrored ? mirrorTyphoonShelterPoints(def.ends, def.width) : { ...def.ends },
  };
}

// A head, as given in a layout: 'causeway2_a' or { id: 'causeway2_a', mirrored: true }.
function getTyphoonShelterBreakwaterHead(spec) {
  const id = typeof spec === 'string' ? spec : spec?.id;
  const mirrored = typeof spec === 'object' && !!spec?.mirrored;
  const def = TYPHOON_SHELTER_BREAKWATER.heads[id];
  if (!def) throw new Error(`unknown breakwater head ${id}`);
  return {
    id,
    mirrored,
    texture: getTyphoonShelterTexturePath(id, { mirrored }),
    scale: def.scale,
    faces: mirrored ? mirrorTyphoonShelterPoints(def.faces, def.width) : { ...def.faces },
  };
}

/**
 * Lay out a breakwater: one or more straight legs, a head at every turn, optional heads at the
 * two ends. Coordinates are screen px at the section textures' own scale (multiply by the
 * sprite scale you draw sections at), with (0, 0) at the deck-end middle where the first leg
 * starts.
 * @param {{ legs: {dir: 'se'|'nw'|'ne'|'sw', count: number}[], segment?: string,
 *           start?: string|object|null, end?: string|object|null, corner?: string|object }} spec
 * @returns {{ pieces: {kind, id, mirrored, texture, x, y, scale, center: number[]}[],
 *             ends: {start: number[], end: number[]} }}
 *   x, y: where the texture's top-left corner goes. pieces come in draw order (back to front:
 *   by the y of `center`, the middle of the piece's deck at section deck height).
 */
function layoutTyphoonShelterBreakwater(spec) {
  const legs = spec?.legs || [];
  if (!legs.length) throw new Error('a breakwater needs at least one leg');
  const gap = TYPHOON_SHELTER_BREAKWATER.headGap;
  const add = (p, d, k = 1) => [p[0] + TYPHOON_SHELTER_DIR_UNIT[d][0] * k, p[1] + TYPHOON_SHELTER_DIR_UNIT[d][1] * k];
  const pieces = [];
  const placeHead = (headSpec, faceDir, facePoint) => {
    const head = getTyphoonShelterBreakwaterHead(headSpec);
    const face = head.faces[faceDir];
    const x = facePoint[0] - face[0] * head.scale;
    const y = facePoint[1] - face[1] * head.scale;
    const mid = [(head.faces.nw[0] + head.faces.se[0]) / 2, (head.faces.nw[1] + head.faces.se[1]) / 2];
    pieces.push({
      kind: 'head', id: head.id, mirrored: head.mirrored, texture: head.texture, x, y, scale: head.scale,
      center: [x + mid[0] * head.scale, y + mid[1] * head.scale],
    });
    return { x, y, head };
  };

  let cursor = [0, 0];
  const startDir = legs[0].dir;
  if (spec.start) placeHead(spec.start, startDir, add(cursor, TYPHOON_SHELTER_DIR_OPPOSITE[startDir], gap));
  legs.forEach((leg, li) => {
    const count = Math.round(Number(leg.count));
    if (!(count >= 1)) throw new Error(`leg ${li} needs at least one section`);
    const seg = getTyphoonShelterBreakwaterSegment(leg.dir, spec.segment);
    const back = TYPHOON_SHELTER_DIR_OPPOSITE[leg.dir];
    let x = cursor[0] - seg.ends[back][0];
    let y = cursor[1] - seg.ends[back][1];
    for (let k = 0; k < count; k++) {
      pieces.push({
        kind: 'segment', id: seg.id, mirrored: seg.mirrored, texture: seg.texture, x, y, scale: 1,
        center: [x + (seg.ends[back][0] + seg.ends[leg.dir][0]) / 2, y + (seg.ends[back][1] + seg.ends[leg.dir][1]) / 2],
      });
      if (k < count - 1) [x, y] = add([x, y], leg.dir, seg.step);
    }
    cursor = [x + seg.ends[leg.dir][0], y + seg.ends[leg.dir][1]];
    const next = legs[li + 1];
    if (!next) return;
    if (next.dir === leg.dir || next.dir === back) throw new Error(`leg ${li + 1} must turn 90° from ${leg.dir}`);
    const corner = placeHead(spec.corner || 'causeway2_a', back, add(cursor, leg.dir, gap));
    const out = corner.head.faces[next.dir];
    cursor = add([corner.x + out[0] * corner.head.scale, corner.y + out[1] * corner.head.scale], next.dir, gap);
  });
  const endPoint = cursor;
  const lastDir = legs[legs.length - 1].dir;
  if (spec.end) placeHead(spec.end, TYPHOON_SHELTER_DIR_OPPOSITE[lastDir], add(endPoint, lastDir, gap));
  pieces.sort((a, b) => a.center[1] - b.center[1] || a.center[0] - b.center[0]);
  return { pieces, ends: { start: [0, 0], end: endPoint } };
}

// ---------------------------------------------------------------------------
// Placement on the map (Phase 0: 佔地、方向、地表)
// ---------------------------------------------------------------------------
//
// A placeable object is one thing on the map - a boat model, a pier - drawn by whichever of its
// textures shows it from the side the camera needs. Each texture has a screen `facing`: the
// diagonal its front points along (a boat's bow, a pier's seaward stairs). An object is placed
// with a logical facing (n/e/s/w, a map direction); at map rotation r its screen facing is
// TYPHOON_SHELTER_SCREEN_OF_LOGICAL[rotateDirection(facing, r)], and the texture with that facing
// is drawn - or, when the art has no view from that side, one on the same diagonal facing the
// other way (the outline is right, the detail on the wrong end), or as a last resort any.
//
// Footprint: `depth` tiles along the facing, `width` across it. Logically an object facing e/w
// spans depth columns and width rows; facing n/s, width columns and depth rows.
//
// A texture is fitted to its footprint by its ground corners (as buildings are, building-ground-
// fit.js): the left, front and right points where the object meets the ground or water, in that
// texture's own pixels. Their left-right span sets the scale; the point that divides it in the
// footprint's own proportion, at the front corner's height, goes on the footprint's front corner.
// Ground corners and facings are calibrated per texture of the unmirrored art (the mirror reuses
// them flipped) in data/typhoon-shelter-placement.json; until then they are the automatic
// proposals scripts/propose-typhoon-shelter-placement.js wrote there.

const TYPHOON_SHELTER_SCREEN_OF_LOGICAL = Object.freeze({ n: 'ne', e: 'se', s: 'sw', w: 'nw' });
const TYPHOON_SHELTER_SURFACES = Object.freeze({
  water: '水面',       // every footprint tile is open water
  shore: '岸邊',       // water, with land touching the footprint's back end (a jetty)
  land: '陸地',        // every tile dry land (quayside props)
});

// [id, label, category, surface, parts ({ partId: facing | null }), depth, width]
// facing null: not judged by eye yet - the proposal from the ground corners is used.
const typhoonShelterObject = (id, label, category, surface, parts, depth, width, extra = {}) => Object.freeze({
  id, label, category, surface, parts: Object.freeze(parts), depth, width, verified: !!extra.verified,
});
const typhoonShelterSheetObject = (sheet, surface, depth, width) => {
  const parts = TYPHOON_SHELTER_PARTS.filter((p) => p.sheet === `${sheet}.png`);
  return typhoonShelterObject(sheet, parts[0].label.split(' · ')[0], parts[0].category, surface,
    Object.fromEntries(parts.map((p) => [p.id, p.facing])), depth, width);
};
const typhoonShelterSingleObjects = (sheet, surface, depth, width) => TYPHOON_SHELTER_PARTS
  .filter((p) => p.sheet === `${sheet}.png`)
  .map((p) => typhoonShelterObject(p.id, p.label, p.category, surface, { [p.id]: null }, depth, width));

const TYPHOON_SHELTER_OBJECTS = Object.freeze([
  // Phase 0 代表性校準: facings judged by eye.
  typhoonShelterObject('fishingBoat3', '漁船 3', 'boat', 'water', { fishingBoat3_a: 'se', fishingBoat3_b: 'nw' }, 2, 1, { verified: true }),
  typhoonShelterObject('fishingBoat4', '漁船 4', 'boat', 'water', { fishingBoat4_a: 'se', fishingBoat4_b: 'nw' }, 2, 1, { verified: true }),
  // stairs at the seaward end; both renders face the same way
  typhoonShelterObject('pierSet1', '石碼頭', 'pier', 'shore', { pierSet1_a: 'se', pierSet1_b: 'se' }, 2, 1, { verified: true }),
  // a symmetric section: its facing only says which diagonal it lies on
  typhoonShelterObject('causeway1', '防波堤 (直段)', 'pier', 'water', { causeway1_a: 'se' }, 2, 1, { verified: true }),
  // landing steps on the front-right face in both renders
  typhoonShelterObject('causeway2', '防波堤燈塔', 'pier', 'water', { causeway2_a: 'se', causeway2_b: 'se' }, 2, 2, { verified: true }),

  ...['fishingBoat1', 'fishingBoat2', 'homeBoat1', 'homeBoat2', 'kaido1', 'speedboat1', 'speedboat2']
    .map((s) => typhoonShelterSheetObject(s, 'water', 2, 1)),
  ...['sanpan1', 'sanpan2', 'sanpan3', 'sanpan4', 'sanpan5'].map((s) => typhoonShelterSheetObject(s, 'water', 1, 1)),
  typhoonShelterSheetObject('homeBoat3', 'water', 2, 1),
  typhoonShelterSheetObject('floatingHome', 'water', 1, 1),
  typhoonShelterSheetObject('floatingChef', 'water', 2, 1),
  typhoonShelterSheetObject('floatingGasStation', 'water', 2, 2),
  typhoonShelterSheetObject('floatingWorkshop', 'water', 2, 2),
  typhoonShelterSheetObject('floatingPier1', 'water', 2, 1),
  typhoonShelterSheetObject('floatingPier2', 'water', 3, 1),
  typhoonShelterSheetObject('floatingPier3', 'water', 2, 2),
  typhoonShelterSheetObject('floatingPier4', 'water', 2, 1),
  typhoonShelterSheetObject('pierSet2', 'shore', 2, 2),
  typhoonShelterSheetObject('pierShop1', 'shore', 2, 2),
  typhoonShelterSheetObject('pierShop2', 'shore', 2, 2),
  // the shorter, wider section render - not to be mixed with causeway1 in one run
  typhoonShelterObject('causeway1b', '防波堤 (短直段)', 'pier', 'water', { causeway1_b: 'sw' }, 2, 1),
  typhoonShelterObject('causeway3', '防波堤吊機', 'pier', 'water', { causeway3_a: 'sw', causeway3_b: 'se' }, 2, 2),
  // the three restaurant renders are three models; the entrance is on a long side
  ...['floatingRestaurant1', 'floatingRestaurant2', 'floatingRestaurant3'].map((s) => typhoonShelterSheetObject(s, 'water', 3, 6)),
  ...typhoonShelterSingleObjects('bout1', 'water', 1, 1),
  typhoonShelterSheetObject('bout2', 'water', 1, 1),
  typhoonShelterSheetObject('bout3', 'water', 1, 1),
  ...['shoreAssessories1', 'shoreAssessories3', 'shoreAssessories4'].map((s) => typhoonShelterSheetObject(s, 'land', 1, 1)),
  ...typhoonShelterSingleObjects('shoreAssessories2', 'land', 1, 1),
  ...typhoonShelterSingleObjects('shoreFence', 'land', 1, 1),
  ...typhoonShelterSingleObjects('pierAssessories', 'land', 1, 1),
]);
const TYPHOON_SHELTER_OBJECTS_BY_ID = Object.freeze(Object.fromEntries(TYPHOON_SHELTER_OBJECTS.map((o) => [o.id, o])));

function rotateTyphoonShelterLogicalDirection(direction, steps) {
  const order = ['n', 'e', 's', 'w'];
  const i = order.indexOf(direction);
  return i < 0 ? direction : order[(i + ((steps % 4) + 4)) % 4];
}

// The screen facing a logical facing shows as at map rotation `rotation` (0-3).
function getTyphoonShelterScreenFacing(logicalFacing, rotation = 0) {
  return TYPHOON_SHELTER_SCREEN_OF_LOGICAL[rotateTyphoonShelterLogicalDirection(logicalFacing, rotation)] || null;
}

// ---------------------------------------------------------------------------
// Real-world size: one tile is 20 m
// ---------------------------------------------------------------------------
//
// The game's scale (street-furniture.js, constants.js): a tile edge is 20 m and 50 screen px
// across, so one metre along a map axis is 2.5 px horizontally (1.25 down); one metre of height is
// 5 px. Every object is drawn at its real size: boats, platforms and breakwaters by `lengthM`, their
// longest horizontal dimension (the art's other proportions follow); small props by `heightM`.
// The footprint follows from the size - the tiles the object actually covers - rather than the
// art being stretched to fill a footprint. Values are typical Hong Kong examples, tunable in the
// 避風塘素材校準 tool (saved as overrides in data/typhoon-shelter-placement.json `objects`).

const TYPHOON_SHELTER_TILE_M = 20;
const TYPHOON_SHELTER_PX_PER_M = 2.5;        // horizontal screen px per metre along a map axis
const TYPHOON_SHELTER_PX_PER_M_HEIGHT = 5;   // screen px per metre of height
// A size this far over a whole number of tiles still counts as that many (a 21 m boat is 1 tile).
const TYPHOON_SHELTER_TILE_TOLERANCE = 0.1;

const TYPHOON_SHELTER_REAL_SIZES = Object.freeze({
  // 本地拖網／圍網漁船 20-30 m
  fishingBoat1: { lengthM: 26 }, fishingBoat2: { lengthM: 22 }, fishingBoat3: { lengthM: 24 }, fishingBoat4: { lengthM: 24 },
  homeBoat1: { lengthM: 15 }, homeBoat2: { lengthM: 15 }, homeBoat3: { lengthM: 14 },
  kaido1: { lengthM: 22 },                                   // 街渡
  speedboat1: { lengthM: 13 }, speedboat2: { lengthM: 18 },  // 遊艇
  sanpan1: { lengthM: 8 }, sanpan2: { lengthM: 8 }, sanpan3: { lengthM: 8 }, sanpan4: { lengthM: 9 }, sanpan5: { lengthM: 7 },
  floatingHome: { lengthM: 10 }, floatingChef: { lengthM: 14 }, floatingGasStation: { lengthM: 18 }, floatingWorkshop: { lengthM: 16 },
  // floatingPier2 is a walkway section: real floating walkways are 2-4 m wide, the art is 2:1, so a
  // section is 8 m and a 20 m tile of walkway takes three; floatingPier1 is its landing stage
  floatingPier1: { lengthM: 9 }, floatingPier2: { lengthM: 8 }, floatingPier3: { lengthM: 18 }, floatingPier4: { lengthM: 10 },
  pierSet1: { lengthM: 20 }, pierSet2: { lengthM: 16 }, pierShop1: { lengthM: 10 }, pierShop2: { lengthM: 8 },
  causeway1: { lengthM: 30 }, causeway1b: { lengthM: 22 }, causeway2: { lengthM: 16 }, causeway3: { lengthM: 16 },
  // 珍寶海鮮舫 ~76 m
  floatingRestaurant1: { lengthM: 76 }, floatingRestaurant2: { lengthM: 76 }, floatingRestaurant3: { lengthM: 76 },
  bout1_a: { heightM: 5.5 }, bout1_b: { heightM: 5.5 }, bout2: { heightM: 1.6 }, bout3: { heightM: 1.6 },
  shoreAssessories1: { heightM: 2.2 }, shoreAssessories3: { heightM: 2.2 }, shoreAssessories4: { heightM: 2.4 },
  shoreAssessories2_a: { heightM: 5 }, shoreAssessories2_b: { heightM: 5 },
  shoreFence_corner: { heightM: 1.2 }, shoreFence_straightA: { heightM: 1.2 }, shoreFence_gate: { heightM: 1.2 }, shoreFence_straightB: { heightM: 1.2 },
  pierAssessories_bollardRope: { heightM: 0.9 }, pierAssessories_bollardSmall: { heightM: 0.6 }, pierAssessories_cleat: { heightM: 0.5 },
  pierAssessories_bollardTall: { heightM: 0.9 }, pierAssessories_bollardDouble: { heightM: 0.8 }, pierAssessories_cleatTimber: { heightM: 0.6 },
  pierAssessories_cleatSmall: { heightM: 0.4 }, pierAssessories_bollardTimber: { heightM: 0.9 }, pierAssessories_mooringRing: { heightM: 0.6 },
});

// { lengthM } or { heightM }; a calibration override replaces the table entry.
function getTyphoonShelterRealSize(objectId, override = null) {
  if (override && (Number(override.lengthM) > 0 || Number(override.heightM) > 0)) {
    return Number(override.lengthM) > 0 ? { lengthM: Number(override.lengthM) } : { heightM: Number(override.heightM) };
  }
  return TYPHOON_SHELTER_REAL_SIZES[objectId] || null;
}

/**
 * The texture-to-screen scale that draws art at its real size, and the size it then has.
 * @param {{left, front, right}} ground ground corners, texture px
 * @param {{lengthM?: number, heightM?: number}} size
 * @param {number} [topY] the art's topmost opaque row, texture px (needed for heightM)
 * @returns {{ scale, seM, swM, heightM }|null} seM / swM: extent along the screen se-nw / ne-sw axis
 */
function measureTyphoonShelterArt(ground, size, topY) {
  if (!ground || !size) return null;
  const a = ground.front[0] - ground.left[0];
  const b = ground.right[0] - ground.front[0];
  if (!(a > 0) || !(b > 0)) return null;
  const groundCentreY = ground.front[1] - (a + b) / 4;
  let scale;
  if (Number(size.lengthM) > 0) scale = (size.lengthM * TYPHOON_SHELTER_PX_PER_M) / Math.max(a, b);
  else if (Number(size.heightM) > 0 && Number.isFinite(topY) && groundCentreY > topY) {
    scale = (size.heightM * TYPHOON_SHELTER_PX_PER_M_HEIGHT) / (groundCentreY - topY);
  } else return null;
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    scale,
    seM: r1((a * scale) / TYPHOON_SHELTER_PX_PER_M),
    swM: r1((b * scale) / TYPHOON_SHELTER_PX_PER_M),
    heightM: Number.isFinite(topY) ? r1(((groundCentreY - topY) * scale) / TYPHOON_SHELTER_PX_PER_M_HEIGHT) : null,
  };
}

// Tiles covered by an object `alongM` long (along its facing) and `acrossM` wide.
function getTyphoonShelterTilesForMetres(alongM, acrossM) {
  const tiles = (m) => Math.max(1, Math.ceil(m / TYPHOON_SHELTER_TILE_M - TYPHOON_SHELTER_TILE_TOLERANCE));
  return { depth: tiles(alongM), width: tiles(acrossM) };
}

// Logical footprint of an object placed facing `logicalFacing`, with size overrides
// ({ depth, width } - from its real size, see typhoon-shelter-sprites.js).
function getTyphoonShelterFootprint(objectId, logicalFacing, override = null) {
  const def = TYPHOON_SHELTER_OBJECTS_BY_ID[objectId];
  if (!def) throw new Error(`unknown typhoon shelter object ${objectId}`);
  const depth = Math.max(1, Math.round(override?.depth ?? def.depth));
  const width = Math.max(1, Math.round(override?.width ?? def.width));
  const alongCols = logicalFacing === 'e' || logicalFacing === 'w';
  return { cols: alongCols ? depth : width, rows: alongCols ? width : depth, depth, width };
}

// Every texture an object can be drawn with: [{ partId, mirrored, texture, facing }]. `facings`
// overrides the table's facings per part (calibration data); a part with no facing anywhere is
// left out.
function getTyphoonShelterObjectTextures(objectId, facings = {}) {
  const def = TYPHOON_SHELTER_OBJECTS_BY_ID[objectId];
  if (!def) throw new Error(`unknown typhoon shelter object ${objectId}`);
  const list = [];
  Object.entries(def.parts).forEach(([partId, tableFacing]) => {
    const facing = facings[partId] || tableFacing;
    const partDef = TYPHOON_SHELTER_PARTS_BY_ID[partId];
    if (!facing || !partDef) return;
    list.push({ partId, mirrored: false, texture: getTyphoonShelterTexturePath(partId), facing });
    if (partDef.mirror) {
      list.push({ partId, mirrored: true, texture: getTyphoonShelterTexturePath(partId, { mirrored: true }), facing: TYPHOON_SHELTER_MIRRORED_FACING[facing] });
    }
  });
  return list;
}

// The texture to draw an object with for a screen facing: { ...texture, match } where match is
// 'exact', 'axis' (same diagonal, facing the other way) or 'any'. `variant` picks among equal
// candidates (e.g. a per-object seed), so two renders of one model both get used.
function pickTyphoonShelterTexture(objectId, screenFacing, { facings = {}, variant = 0 } = {}) {
  const all = getTyphoonShelterObjectTextures(objectId, facings);
  if (!all.length) return null;
  const opposite = { se: 'nw', nw: 'se', ne: 'sw', sw: 'ne' }[screenFacing];
  const choose = (list, match) => (list.length ? { ...list[Math.abs(variant | 0) % list.length], match } : null);
  return choose(all.filter((t) => t.facing === screenFacing), 'exact')
    || choose(all.filter((t) => t.facing === opposite), 'axis')
    || choose(all, 'any');
}

function mirrorTyphoonShelterGroundCorners(corners, width) {
  if (!corners) return null;
  return {
    left: [width - corners.right[0], corners.right[1]],
    front: [width - corners.front[0], corners.front[1]],
    right: [width - corners.left[0], corners.left[1]],
  };
}

/**
 * Fit a texture's ground corners into a footprint's screen diamond, centred on it. With
 * `fixedScale` (the real-size scale, measureTyphoonShelterArt) only the position is fitted.
 * Without, the art is contained in the footprint: scaled until both its
 * left-front and front-right extents fit, then centred on it. Art in the footprint's own
 * proportions (piers, breakwater) fills it exactly; a boat, beamier in the art than its
 * footprint, is limited by its beam.
 * @param {{left:number[], front:number[], right:number[]}} corners texture px
 * @param {{left:number[], front:number[], right:number[]}} diamond the footprint's left, front
 *   (lowest) and right corners on screen
 * @returns {{ originX, originY, scale, x, y }|null} put texture point (originX, originY) on screen
 *   point (x, y)
 */
function fitTyphoonShelterGround(corners, diamond, fixedScale = null) {
  const a = corners?.front?.[0] - corners?.left?.[0];
  const b = corners?.right?.[0] - corners?.front?.[0];
  const A = diamond?.front?.[0] - diamond?.left?.[0];
  const B = diamond?.right?.[0] - diamond?.front?.[0];
  if (!(a > 1) || !(b > 1) || !(A > 0) || !(B > 0)) return null;
  // The centre of an isometric parallelogram with these extents, taken from the front corner -
  // the lowest point, the one the detectors find most reliably; a side corner picked up a little
  // high (a rock or rail above the waterline) would otherwise tilt the whole object.
  return {
    originX: corners.front[0] + (b - a) / 2,
    originY: corners.front[1] - (a + b) / 4,
    scale: fixedScale > 0 ? fixedScale : Math.min(A / a, B / b),
    x: (diamond.left[0] + diamond.right[0]) / 2,
    y: (diamond.left[1] + diamond.right[1]) / 2,
  };
}

// A proposal for ground corners from the alpha channel when the building detector (straight lot
// edges) is not confident - boats, whose hulls curve. The lowest opaque pixel of each column traces
// the bottom of the object; its leftmost, lowest and rightmost points are the corners. (The
// object's isometric bounding box would be wrong: hulls are not drawn square to the axes, and the
// box then reaches far past the stern.) Columns whose bottom is only a rope or a thin rail - a
// short solid run - are skipped, or rigging hanging past the hull would count as the hull.
// alpha: width*height*channels bytes.
function proposeTyphoonShelterGroundCorners(alpha, width, height, { channels = 4, alphaThreshold = 48, minRun = 10 } = {}) {
  const offset = channels === 4 ? 3 : 0;
  const solid = (x, y) => alpha[(y * width + x) * channels + offset] > alphaThreshold;
  let left = null; let right = null; let front = null;
  for (let x = 0; x < width; x++) {
    let y = height - 1;
    while (y >= 0 && !solid(x, y)) y--;
    if (y < 0) continue;
    let run = 0;
    while (y - run >= 0 && solid(x, y - run) && run < minRun) run++;
    if (run < minRun) continue;
    if (!left) left = [x, y];
    right = [x, y];
    if (!front || y > front[1]) front = [x, y];
  }
  if (!front) return null;
  return { left, front, right };
}

// The sprite scale and map length of a section, for a deck `tilesAcross` tiles wide. One tile
// edge spans tileWidth / 2 screen px horizontally.
function getTyphoonShelterBreakwaterTileFit(tileWidth, tilesAcross = 1, id = 'causeway1_a') {
  const def = TYPHOON_SHELTER_BREAKWATER.segments[id];
  const edge = tileWidth / 2;
  const scale = (edge * tilesAcross) / def.deckAcross;
  return { scale, tilesPerSection: (def.step * scale) / edge };
}

const typhoonShelterAssetsApi = {
  TYPHOON_SHELTER_TEXTURE_DIR,
  TYPHOON_SHELTER_SOURCE_DIR,
  TYPHOON_SHELTER_CATEGORIES,
  TYPHOON_SHELTER_PARTS,
  TYPHOON_SHELTER_PARTS_BY_ID,
  TYPHOON_SHELTER_BREAKWATER,
  getTyphoonShelterTexturePath,
  getTyphoonShelterPartTextures,
  getTyphoonShelterBoatHeadings,
  getTyphoonShelterMissingHeadings,
  getTyphoonShelterBreakwaterSegment,
  getTyphoonShelterBreakwaterHead,
  layoutTyphoonShelterBreakwater,
  getTyphoonShelterBreakwaterTileFit,
  TYPHOON_SHELTER_TILE_M,
  TYPHOON_SHELTER_PX_PER_M,
  TYPHOON_SHELTER_PX_PER_M_HEIGHT,
  TYPHOON_SHELTER_REAL_SIZES,
  getTyphoonShelterRealSize,
  measureTyphoonShelterArt,
  getTyphoonShelterTilesForMetres,
  TYPHOON_SHELTER_SCREEN_OF_LOGICAL,
  TYPHOON_SHELTER_SURFACES,
  TYPHOON_SHELTER_OBJECTS,
  TYPHOON_SHELTER_OBJECTS_BY_ID,
  getTyphoonShelterScreenFacing,
  getTyphoonShelterFootprint,
  getTyphoonShelterObjectTextures,
  pickTyphoonShelterTexture,
  mirrorTyphoonShelterGroundCorners,
  fitTyphoonShelterGround,
  proposeTyphoonShelterGroundCorners,
};

if (typeof module !== 'undefined' && module.exports) module.exports = typhoonShelterAssetsApi;
if (typeof globalThis !== 'undefined') Object.assign(globalThis, typhoonShelterAssetsApi);
