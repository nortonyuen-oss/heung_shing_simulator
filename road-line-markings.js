// Road surface line markings (馬路劃線) — lane dividers, arrows, zebra crossings, box
// junctions etc. painted onto the road tiles themselves.
//
// Unlike bridge parapets or street lamps (sparse, one prop sprite per tile edge/post), road
// tiles are the densest thing on the map — 旺角 alone measures 2,439 of them (see
// docs/performance-notes.md). A second overlay sprite per road tile would multiply the exact
// draw-call/vertex-upload cost that already showed up as the single biggest render bottleneck
// (a mere 304 street lamps cost 24ms before installVertexUploadShim). So line markings follow
// the OTHER precedent in this codebase — building night-window lighting: bake the marking into
// a second, pre-composited copy of the tile texture at build time (scripts/bake-road-line-
// textures.js), and at runtime it is a single `sprite.setTexture()` swap, exactly like
// applyBuildingNightTexture in main.js. One sprite per tile, unchanged from today.
//
// ONE TILE SHAPE, SEVERAL PRINTED VARIANTS
// A logical tile shape (road-tile-sets.js's 'road_straight_h' etc.) is not one marking set but
// a small CATALOGUE of them: a plain straight road, a bus-stop straight road, a stop-line
// straight road, a parking-bay straight road, ... - each its own baked texture, selected per
// placed tile (not per tile SHAPE), the same way a residential zone tile picks one of several
// building skins. Nothing here decides *which* variant a given map tile shows - that's a
// separate placement question (does this tile sit in busStopMap? is it a marked parking bay?)
// answered by whatever calls applyRoadLineTexture, exactly as bridge-parapets.js separates
// "where do segments go" (computeBridgeParapetPlacements, reading bridgeMap) from "what texture
// does this one look like" (bridgeParapetTextureKey).
//
// Placement data (ROAD_LINE_TILE_PROFILES) is authored with road-line-calibrator.js, the same
// way BUILDING_LIGHT_HERO_PROFILES is authored with building-light-calibrator.js: drag markings
// around on a canvas workbench, then paste the generated JS literal in here. Coordinates are
// normalized (0..1) over the tile's own canvas so they don't depend on any one road tile set's
// pixel size (classic 100x65 vs newRoadTiles 160x80 - see road-tile-sets.js).

// Every marking sprite this project has, and where it lives. `w`/`h` are the source PNG's own
// pixel size (all authored oversized, e.g. 1254x1254, then downscaled onto a tile) - the
// calibrator needs the aspect ratio to draw an undistorted preview.
const ROAD_LINE_MARKING_FILES = Object.freeze({
  arrowMergeLeft: { file: 'newRoadTiles/roadLines/arrowMergeLeft.png', w: 975, h: 449 },
  arrowMergeRight: { file: 'newRoadTiles/roadLines/arrowMergeRight.png', w: 1254, h: 1254 },
  arrowStraight: { file: 'newRoadTiles/roadLines/arrowStraight.png', w: 1254, h: 1254 },
  arrowStraightOrRight: { file: 'newRoadTiles/roadLines/arrowStraightOrRight.png', w: 1254, h: 1254 },
  boxJunctionBracket_white: { file: 'newRoadTiles/roadLines/boxJunctionBracket_white.png', w: 1086, h: 1448 },
  boxJunctionBracket_yellow: { file: 'newRoadTiles/roadLines/boxJunctionBracket_yellow.png', w: 1254, h: 1254 },
  busStopText_bilingual: { file: 'newRoadTiles/roadLines/busStopText_bilingual.png', w: 306, h: 1189 },
  chevronCorridor_crossing: { file: 'newRoadTiles/roadLines/chevronCorridor_crossing.png', w: 828, h: 1900 },
  cornerBracket_white: { file: 'newRoadTiles/roadLines/cornerBracket_white.png', w: 1254, h: 1254 },
  giveWayTriangle: { file: 'newRoadTiles/roadLines/giveWayTriangle.png', w: 1254, h: 1254 },
  junctionApproach_laneMarking: { file: 'newRoadTiles/roadLines/junctionApproach_laneMarking.png', w: 312, h: 320 },
  laneDivider_dashedDiagonal: { file: 'newRoadTiles/roadLines/laneDivider_dashedDiagonal.png', w: 1254, h: 1254 },
  pavementCorner_roadEdge: { file: 'newRoadTiles/roadLines/pavementCorner_roadEdge.png', w: 1254, h: 1254 },
  stopText_bilingual: { file: 'newRoadTiles/roadLines/stopText_bilingual.png', w: 1254, h: 1254 },
  zebraCrossing: { file: 'newRoadTiles/roadLines/zebraCrossing.png', w: 1448, h: 1086 },
});

// Known variant ids with a Chinese label, for the calibrator's picker and for anything that
// wants to show a human name. Not exhaustive or closed - a placement's variant id is just a
// string key in ROAD_LINE_TILE_PROFILES[logicalKey], and road-line-calibrator.js lets you type
// a new one; this registry only supplies labels/ordering for the ones already in mind. There is
// no 'plain' entry: a variant-less tile is simply the base tile with nothing baked over it.
const ROAD_LINE_VARIANT_LABELS = Object.freeze({
  busStop: '巴士站',
  stopLine: '停車線',
  parkingBay: '停車格',
});

function getRoadLineVariantLabel(variantId) {
  return ROAD_LINE_VARIANT_LABELS[variantId] ?? variantId;
}

// Frozen, hand-calibrated placements — the "frozen constants" a calibrator session pastes over.
// Keyed by the road-tile-set-independent logical key (road-tile-sets.js ROAD_TILE_LOGICAL_FILES)
// NOT by filename, so the same profile applies whichever tile set (classic/newRoadTiles) is
// active, then by a free-form variant id ('busStop', 'stopLine', 'parkingBay', ...): the same
// tile shape's several printed styles. Each placement: {marking, corners, opacity?} - `corners`
// is four [x, y] points normalized 0..1 over the tile canvas (0,0 = top-left), in source order
// top-left/top-right/bottom-right/bottom-left, i.e. where each of the marking PNG's own four
// corners should land. Four independent corners (not a centre + rotation + scale) so a marking
// can be dragged to actually lean into the tile's isometric ground plane instead of sitting on
// it as a flat, screen-aligned rectangle - road-line-warp.js does the perspective warp from the
// source rectangle to this quad, both in the calibrator's live preview and in the bake.
// `opacity` (0..1, default 1 when omitted) fades a marking that reads too flat/sticker-like
// against the tile's own worn paint - road-line-warp.js's warpQuadImageOnto applies it.
//
// Calibrated in-game (road-line-calibrator.js -> "複製 JS") and pasted here.
const ROAD_LINE_TILE_PROFILES = Object.freeze({
  road_straight_v: {
    busStopSW: [
      { marking: 'busStopText_bilingual', corners: [[0.44523, 0.702895], [0.375941, 0.627417], [0.658472, 0.336448], [0.730784, 0.412722]], opacity: 0.6 },
    ],
    busStopNE: [
      { marking: 'busStopText_bilingual', corners: [[0.543034, 0.310584], [0.615025, 0.387875], [0.345627, 0.669596], [0.272265, 0.590008]], opacity: 0.6 },
    ],
    zebraCrossingNS: [
      { marking: 'chevronCorridor_crossing', corners: [[0.559003, 0.246365], [0.750034, 0.435777], [0.439887, 0.755857], [0.245891, 0.571679]], opacity: 0.6 },
    ],
    parking: [
      { marking: 'boxJunctionBracket_yellow', corners: [[0.495339, 0.790407], [0.287441, 0.573335], [0.556857, 0.301312], [0.760774, 0.51262]], opacity: 0.6 },
    ],
    parking2: [
      { marking: 'boxJunctionBracket_yellow', corners: [[0.508431, 0.195654], [0.743345, 0.434318], [0.432596, 0.751061], [0.196908, 0.512749]], opacity: 0.6 },
    ],
    busStopBoth2: [
      { marking: 'busStopText_bilingual', corners: [[0.546472, 0.305404], [0.624494, 0.384568], [0.345965, 0.668287], [0.267489, 0.592485]], opacity: 0.6 },
      { marking: 'busStopText_bilingual', corners: [[0.445396, 0.712467], [0.36821, 0.633171], [0.653232, 0.345531], [0.724708, 0.42518]], opacity: 0.6 },
    ],
    straight2: [
      { marking: 'pavementCorner_roadEdge', corners: [[0.549496, 0.296505], [0.714841, 0.289677], [0.679754, 0.653772], [0.502181, 0.619515]], opacity: 0.6 },
    ],
    straight3: [
      { marking: 'arrowStraight', corners: [[0.362457, 0.707659], [0.363287, 0.56039], [0.552559, 0.552205], [0.554008, 0.701395]], opacity: 0.85 },
      { marking: 'arrowStraightOrRight', corners: [[0.349017, 0.659212], [0.266328, 0.583941], [0.416119, 0.427772], [0.492813, 0.513798]], opacity: 0.85 },
    ],
    // Junction approaches (calibrated 2026-09-27): the tile just before a junction, named by the
    // side of the junction it stops at. dualLane* = a two-lane approach, singleCross* = one lane.
    dualLaneStopN: [
      { marking: 'arrowStraightOrRight', corners: [[0.374596, 0.619263], [0.309363, 0.550069], [0.431676, 0.424033], [0.493219, 0.498632]], opacity: 0.6 },
      { marking: 'arrowStraightOrRight', corners: [[0.37727, 0.621941], [0.450953, 0.702038], [0.564244, 0.584623], [0.493738, 0.502695]], opacity: 0.6 },
      { marking: 'laneDivider_dashedDiagonal', corners: [[0.2613, 0.423905], [0.438339, 0.477258], [0.472298, 0.802239], [0.311934, 0.77375]], opacity: 0.6 },
    ],
    dualLaneStopS: [
      { marking: 'laneDivider_dashedDiagonal', corners: [[0.493041, 0.189756], [0.638467, 0.26551], [0.762355, 0.554348], [0.603371, 0.490478]], opacity: 0.6 },
      { marking: 'arrowStraightOrRight', corners: [[0.622784, 0.376231], [0.702143, 0.453844], [0.585033, 0.573296], [0.512754, 0.493298]], opacity: 0.6 },
      { marking: 'arrowStraightOrRight', corners: [[0.626241, 0.375219], [0.550753, 0.30201], [0.437917, 0.417404], [0.511406, 0.492325]], opacity: 0.6 },
    ],
    singleCrossStopN: [
      { marking: 'junctionApproach_laneMarking', corners: [[0.43325, 0.716625], [0.359384, 0.643079], [0.495376, 0.498], [0.569935, 0.57785]], opacity: 0.6 },
      { marking: 'arrowStraight', corners: [[0.401532, 0.664774], [0.405473, 0.546473], [0.561134, 0.532385], [0.560589, 0.661136]], opacity: 0.6 },
    ],
    singleCrossStopS: [
      { marking: 'arrowStraight', corners: [[0.625601, 0.317903], [0.628692, 0.411437], [0.457067, 0.441742], [0.456494, 0.346442]], opacity: 0.6 },
      { marking: 'junctionApproach_laneMarking', corners: [[0.571883, 0.275727], [0.649813, 0.361345], [0.500471, 0.511427], [0.422267, 0.429239]], opacity: 0.6 },
    ],
  },
  road_straight_h: {
    busStopNW: [
      { marking: 'busStopText_bilingual', corners: [[0.305873, 0.453568], [0.382513, 0.37912], [0.653592, 0.656666], [0.578092, 0.735592]], opacity: 0.6 },
    ],
    busStopSE: [
      { marking: 'busStopText_bilingual', corners: [[0.686884, 0.535588], [0.614378, 0.61265], [0.346623, 0.346237], [0.419386, 0.267439]], opacity: 0.6 },
    ],
    zebraCrossing: [
      { marking: 'chevronCorridor_crossing', corners: [[0.245703, 0.440781], [0.439683, 0.246448], [0.747031, 0.566598], [0.56303, 0.75398]], opacity: 0.6 },
    ],
    parking3: [
      { marking: 'boxJunctionBracket_yellow', corners: [[0.197064, 0.496033], [0.431183, 0.258227], [0.747533, 0.569084], [0.509532, 0.810319]], opacity: 0.6 },
    ],
    parking4: [
      { marking: 'boxJunctionBracket_yellow', corners: [[0.80563, 0.502811], [0.566618, 0.739251], [0.268196, 0.436513], [0.501, 0.195452]], opacity: 0.6 },
    ],
    straight: [
      { marking: 'arrowStraight', corners: [[0.309991, 0.358588], [0.434647, 0.371566], [0.481408, 0.581708], [0.346163, 0.553095]], opacity: 0.6 },
      { marking: 'arrowStraightOrRight', corners: [[0.362062, 0.34889], [0.431688, 0.280618], [0.55489, 0.406357], [0.491582, 0.477151]], opacity: 0.6 },
    ],
    busStopBoth1: [
      { marking: 'busStopText_bilingual', corners: [[0.302676, 0.459161], [0.381783, 0.384852], [0.665296, 0.6578], [0.583103, 0.735545]], opacity: 0.6 },
      { marking: 'busStopText_bilingual', corners: [[0.709293, 0.559295], [0.623034, 0.645051], [0.349294, 0.349612], [0.426598, 0.27252]], opacity: 0.6 },
    ],
    straight4: [
      { marking: 'arrowStraight', corners: [[0.629467, 0.774122], [0.49728, 0.726309], [0.4659, 0.517991], [0.592466, 0.482736]], opacity: 0.6 },
      { marking: 'arrowMergeRight', corners: [[0.687438, 0.632858], [0.558346, 0.655253], [0.533553, 0.41933], [0.665358, 0.398109]], opacity: 0.6 },
    ],
    // Junction approaches - see road_straight_v's dualLaneStopN comment.
    dualLaneStopE: [
      { marking: 'laneDivider_dashedDiagonal', corners: [[0.54492, 0.260317], [0.510357, 0.422953], [0.221016, 0.499512], [0.272412, 0.341976]], opacity: 0.6 },
      { marking: 'arrowStraightOrRight', corners: [[0.382113, 0.388382], [0.45353, 0.305035], [0.551786, 0.401116], [0.477134, 0.489717]], opacity: 0.6 },
      { marking: 'arrowStraightOrRight', corners: [[0.381538, 0.389977], [0.310637, 0.46714], [0.415612, 0.567696], [0.476824, 0.49028]], opacity: 0.6 },
    ],
    dualLaneStopW: [
      { marking: 'arrowStraightOrRight', corners: [[0.623304, 0.624679], [0.551031, 0.705523], [0.454978, 0.604329], [0.521504, 0.518593]], opacity: 0.6 },
      { marking: 'arrowStraightOrRight', corners: [[0.622557, 0.621613], [0.693313, 0.542551], [0.590945, 0.434285], [0.521961, 0.516427]], opacity: 0.65 },
      { marking: 'laneDivider_dashedDiagonal', corners: [[0.429342, 0.80152], [0.514079, 0.638804], [0.793825, 0.479345], [0.749928, 0.619538]], opacity: 0.6 },
    ],
    singleCrossStopE: [
      { marking: 'junctionApproach_laneMarking', corners: [[0.285071, 0.439982], [0.361548, 0.35645], [0.495211, 0.489458], [0.415706, 0.575248]], opacity: 0.6 },
      { marking: 'arrowStraight', corners: [[0.339811, 0.395287], [0.44448, 0.40751], [0.449521, 0.542879], [0.36444, 0.552285]], opacity: 0.6 },
    ],
    singleCrossStopW: [
      { marking: 'arrowStraight', corners: [[0.6579, 0.59117], [0.567672, 0.621752], [0.521734, 0.411211], [0.646165, 0.43504]], opacity: 0.6 },
      { marking: 'junctionApproach_laneMarking', corners: [[0.714492, 0.568325], [0.639745, 0.648981], [0.499917, 0.504189], [0.571419, 0.424707]], opacity: 0.6 },
    ],
  },
});

const ROAD_LINE_TEXTURE_SUFFIX = '__lines';

function isRoadLineMarkingKey(markingKey) {
  return Object.prototype.hasOwnProperty.call(ROAD_LINE_MARKING_FILES, markingKey);
}

function getRoadLineMarkingFile(markingKey) {
  return ROAD_LINE_MARKING_FILES[markingKey] ?? null;
}

function getRoadLineMarkingKeys() {
  return Object.keys(ROAD_LINE_MARKING_FILES);
}

// Every variant id calibrated for one logical tile shape, e.g. ['busStop', 'parkingBay'].
function getRoadLineVariantIds(logicalKey) {
  return Object.keys(ROAD_LINE_TILE_PROFILES[logicalKey] ?? {});
}

// The calibrated placements for one (tile shape, variant), or an empty array if none.
function getRoadLinePlacements(logicalKey, variantId) {
  return ROAD_LINE_TILE_PROFILES[logicalKey]?.[variantId] ?? [];
}

function roadTileVariantHasLineMarkings(logicalKey, variantId) {
  return getRoadLinePlacements(logicalKey, variantId).length > 0;
}

// The baked variant's texture key for one (tile shape, variant), mirroring
// getRoadTileTextureKey (road-tile-sets.js) plus the night-texture suffix convention (main.js
// BUILDING_NIGHT_TEXTURE_PREFIX/_VARIANT_SUFFIX): base key + '__lines' + '_' + variantId. Does
// not itself check the texture exists - callers use scene.textures.exists() the way
// applyBuildingNightTexture does.
function getRoadLineTextureKey(logicalKey, variantId, tileSetId) {
  if (typeof getRoadTileTextureKey !== 'function' || !variantId) return null;
  const baseKey = getRoadTileTextureKey(logicalKey, tileSetId);
  return baseKey ? `${baseKey}${ROAD_LINE_TEXTURE_SUFFIX}_${variantId}` : null;
}

// The baked file's own path, for a preload call: newRoadTiles/roadNS_fixed.png + 'busStop' ->
// newRoadTiles/roadNS_fixed__lines_busStop.png. Road tiles bypass the Models/ staging pipeline
// entirely (prepare-release-assets.js only walks Models/ - road-tile-sets.js loads
// newRoadTiles/ at its own raw path), so - unlike the building night textures - there is no
// staged manifest to consult: this is a plain sibling file scripts/bake-road-line-textures.js
// writes next to the source tile. NOT auto-preloaded yet: wire this in alongside the existing
// `this.load.image(`${set.texturePrefix}_${logicalKey}`, getRoadTileAssetPath(...))` call
// (main.js, ~line 2069), looping getRoadLineVariantIds(logicalKey) and calling
// `scene.load.image(getRoadLineTextureKey(logicalKey, variantId, set.id),
// getRoadLineBakedAssetPath(logicalKey, variantId, set.id))`, guarded by the file existing.
function getRoadLineBakedAssetPath(logicalKey, variantId, tileSetId) {
  if (typeof getRoadTileAssetPath !== 'function' || !variantId) return null;
  const basePath = getRoadTileAssetPath(logicalKey, tileSetId);
  return basePath ? basePath.replace(/\.png$/i, `${ROAD_LINE_TEXTURE_SUFFIX}_${variantId}.png`) : null;
}

// Swap a road tile sprite onto one baked (tile shape, variant)'s texture if it exists and isn't
// already showing it; remembers the plain key on the sprite so callers can restore it (e.g. a
// variant no longer applying, or a "hide markings" debug toggle), the same way
// applyBuildingNightTexture remembers sprite.__dayTextureKey before swapping to a night key.
// `variantId` is null/falsy for an ordinary, unmarked tile - restores the base texture.
//
// `baseTextureKey`, if given, is the sprite's just-set plain texture key (main.js's
// resolveTileTextureKey result) for THIS refresh - always trusted over any previously
// remembered one. Without it, a tile's base key can change between refreshes (the tile's own
// shape changed, or the map was rotated so getTileKey now resolves a different orientation)
// while an old __roadLineBaseTextureKey from a still-active variant lingers, so restoring later
// (variant removed) would jump back to a base texture that no longer matches this tile at all.
// Every main.js call site has this value on hand already (it just set it on the sprite) and
// should always pass it; the parameter stays optional only so the pre-existing calibrator/test
// call sites (which restore a sprite outside the normal per-tile refresh, with no "this frame's"
// key to hand) keep today's exact behaviour.
function applyRoadLineTexture(scene, sprite, logicalKey, variantId, tileSetId, baseTextureKey) {
  if (!scene || !sprite) return false;
  if (!variantId || !roadTileVariantHasLineMarkings(logicalKey, variantId)) {
    if (baseTextureKey) {
      const changed = sprite.texture?.key !== baseTextureKey;
      if (changed) sprite.setTexture(baseTextureKey);
      sprite.__roadLineBaseTextureKey = null;
      return changed;
    }
    return restoreRoadTileBaseTexture(sprite);
  }
  const key = getRoadLineTextureKey(logicalKey, variantId, tileSetId);
  if (!key || !scene.textures?.exists?.(key)) return false;
  if (sprite.texture?.key === key) return true;
  sprite.__roadLineBaseTextureKey = baseTextureKey ?? sprite.__roadLineBaseTextureKey ?? sprite.texture?.key ?? null;
  sprite.setTexture(key);
  return true;
}

function restoreRoadTileBaseTexture(sprite) {
  if (!sprite?.__roadLineBaseTextureKey) return false;
  sprite.setTexture(sprite.__roadLineBaseTextureKey);
  sprite.__roadLineBaseTextureKey = null;
  return true;
}

const roadLineMarkingsTestApi = {
  ROAD_LINE_MARKING_FILES,
  ROAD_LINE_VARIANT_LABELS,
  ROAD_LINE_TILE_PROFILES,
  ROAD_LINE_TEXTURE_SUFFIX,
  isRoadLineMarkingKey,
  getRoadLineMarkingFile,
  getRoadLineMarkingKeys,
  getRoadLineVariantLabel,
  getRoadLineVariantIds,
  getRoadLinePlacements,
  roadTileVariantHasLineMarkings,
  getRoadLineTextureKey,
  getRoadLineBakedAssetPath,
  applyRoadLineTexture,
  restoreRoadTileBaseTexture,
};

if (typeof module !== 'undefined' && module.exports) module.exports = roadLineMarkingsTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    ROAD_LINE_MARKING_FILES,
    ROAD_LINE_VARIANT_LABELS,
    ROAD_LINE_TILE_PROFILES,
    ROAD_LINE_TEXTURE_SUFFIX,
    isRoadLineMarkingKey,
    getRoadLineMarkingFile,
    getRoadLineMarkingKeys,
    getRoadLineVariantLabel,
    getRoadLineVariantIds,
    getRoadLinePlacements,
    roadTileVariantHasLineMarkings,
    getRoadLineTextureKey,
    getRoadLineBakedAssetPath,
    applyRoadLineTexture,
    restoreRoadTileBaseTexture,
  });
}
