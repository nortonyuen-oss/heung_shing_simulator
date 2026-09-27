// Decides which printed road-line variant (busStop/zebraCrossing/arrow.../...), if any, a
// placed road tile should show - the "where does each variant go" half of the system, kept
// separate from "what does that variant look like" (road-line-markings.js
// getRoadLineTextureKey), the same split bridge-parapets.js draws between
// computeBridgeParapetPlacements (where) and bridgeParapetTextureKey (what).
//
// PURE PER-TILE, NOT A WHOLE-MAP CACHE
// An earlier version of this file precomputed a whole-map Map of every tile's variant, the way
// computeBridgeParapetPlacements does for a comparatively tiny set of bridge segments. Road
// tiles are the densest thing on the map (2,439 in 旺角 alone - road-line-markings.js's header
// comment) and, worse, getRoadCarriagewayBand's own classification of one tile can depend on
// tiles up to CARRIAGEWAY_MAX_BAND_WIDTH away (main.js) - exactly the kind of dependency that
// made the carriageway-band refresh radius bug (docs/road-widening-plan.md) so easy to get
// subtly wrong with a cache that isn't invalidated over a wide enough area. So this now mirrors
// getRoadCarriagewayBand itself: a plain function of (row, col) that only ever reads a handful
// of nearby tiles, recomputed fresh every time a tile's texture key is resolved (cheap, and
// nothing to invalidate).
//
// THE RULES (2026-09-27 product decisions)
//   - busStop: a tile with a bus stop shows its bus-stop marking, full stop - this OVERRIDES
//     every other rule below, because a bus stop is a deliberate, singular placement a player
//     made on purpose, while the other rules are conditions the road geometry happens to meet.
//   - junction approach: the straight tile on each side of a yellow-box junction (road_cross /
//     road_t_*) that leads into it. Named by the side of the junction the tile sits on
//     (dualLaneStopN = north of the junction, arrows pointing south into it):
//       - dual carriageway (a band tile): dualLaneStop{N,S,E,W} - two same-direction lanes with
//         straight-or-turn arrows - only on the carriageway whose one-way direction enters the
//         junction; the carriageway leaving it stays plain. A shared (odd-width middle) lane
//         never gets one.
//       - single carriageway (one lane each way): singleCrossStop{N,S,E,W} - stop line and arrow
//         on the keep-left half. A one-tile stub between two junctions takes the first of
//         north/south (or east/west) in map terms, since one tile can only show one approach.
//   - zebraCrossing: a single-lane (non-band) straight tile with 3 plain straight tiles on both
//     sides (same orientation, non-band, no bus stop, not a junction approach) - and none of
//     those 3 may be a zebra either. That makes it a property of the whole straight run, not of
//     the tile's immediate neighbours: zebras are laid out every 4th tile along the run, centred
//     (isRoadLineZebraIndex). Callers must therefore refresh an entire straight run when any
//     tile in it changes - see refreshRoadLineRunsLeaving, main.js.
// Priority: busStop, then junction approach, then zebraCrossing. A variant is only ever returned
// if that (tile shape, variant) pair actually has calibrated placements
// (roadTileVariantHasLineMarkings) - an uncalibrated variant silently falls back to the plain
// tile, never a missing-texture pop.

const ROAD_LINE_MIDBLOCK_CLEARANCE = 3; // tiles required plain on each side for a zebra crossing

const ROAD_LINE_DIRECTION_DELTA = Object.freeze({
  north: { row: -1, col: 0 },
  south: { row: 1, col: 0 },
  east: { row: 0, col: 1 },
  west: { row: 0, col: -1 },
});

function isRoadLineRealJunctionKey(key) {
  return key === 'road_cross' || (typeof key === 'string' && key.startsWith('road_t_'));
}

// `corners` is an array of already rotation-resolved visual corners ('ur'|'ul'|'lr'|'ll') where
// this tile has a bus stop - see getBusStopVisualCorner, main.js. A vertical road's two possible
// stop corners are ur/ll (NE/SW); a horizontal road's are ul/lr (NW/SE) - same pairing
// BUS_STOP_ROAD_ORIENTATIONS uses, just already rotated by the caller.
function resolveRoadLineBusStopVariant(logicalKey, corners) {
  if (!Array.isArray(corners) || corners.length === 0) return null;
  if (logicalKey === 'road_straight_v') {
    const hasNE = corners.includes('ur');
    const hasSW = corners.includes('ll');
    if (hasNE && hasSW) return 'busStopBoth2';
    if (hasNE) return 'busStopNE';
    if (hasSW) return 'busStopSW';
    return null;
  }
  if (logicalKey === 'road_straight_h') {
    const hasNW = corners.includes('ul');
    const hasSE = corners.includes('lr');
    if (hasNW && hasSE) return 'busStopBoth1';
    if (hasNW) return 'busStopNW';
    if (hasSE) return 'busStopSE';
    return null;
  }
  return null;
}

// `towardJunction` is the ON-SCREEN direction from this tile to the junction (already rotated),
// matched against the RENDERED key; the variant is named for the junction side the tile is on.
function resolveRoadLineApproachVariant(logicalKey, towardJunction, dual) {
  const prefix = dual ? 'dualLaneStop' : 'singleCrossStop';
  const side = logicalKey === 'road_straight_v'
    ? { north: 'S', south: 'N' }[towardJunction]
    : logicalKey === 'road_straight_h'
      ? { east: 'W', west: 'E' }[towardJunction]
      : null;
  return side ? `${prefix}${side}` : null;
}

const ROAD_LINE_ZEBRA_SPACING = ROAD_LINE_MIDBLOCK_CLEARANCE + 1;
const ROAD_LINE_MAX_RUN_SCAN = 512; // safety bound; far larger than any map side

// Which indices of a `length`-tile plain straight run get a zebra crossing. Every zebra needs
// ROAD_LINE_MIDBLOCK_CLEARANCE plain tiles on both sides that are NOT themselves zebras, so
// they sit ROAD_LINE_ZEBRA_SPACING apart; the pattern is centred so any slack is split
// evenly between the two ends of the run.
function isRoadLineZebraIndex(index, length) {
  const clearance = ROAD_LINE_MIDBLOCK_CLEARANCE;
  const span = length - 1 - 2 * clearance;
  if (span < 0) return false;
  const count = Math.floor(span / ROAD_LINE_ZEBRA_SPACING) + 1;
  const first = clearance + Math.floor((span - (count - 1) * ROAD_LINE_ZEBRA_SPACING) / 2);
  const offset = index - first;
  return offset >= 0 && offset % ROAD_LINE_ZEBRA_SPACING === 0 && offset / ROAD_LINE_ZEBRA_SPACING < count;
}

// Counts consecutive plain tiles from (row, col) stepping by (deltaRow, deltaCol), not
// counting (row, col) itself.
function countRoadLinePlainRun(isPlainAt, row, col, deltaRow, deltaCol) {
  let count = 0;
  while (count < ROAD_LINE_MAX_RUN_SCAN && isPlainAt(row + deltaRow * (count + 1), col + deltaCol * (count + 1))) {
    count++;
  }
  return count;
}

const ROAD_LINE_COMPASS = ['north', 'east', 'south', 'west'];

// Map-frame compass direction -> the direction it appears as on screen at `rotation` quarter
// turns, matching rotateTileKey's n->e->s->w step (main.js).
function rotateRoadLineDirection(direction, rotation) {
  const index = ROAD_LINE_COMPASS.indexOf(direction);
  if (index < 0) return direction;
  return ROAD_LINE_COMPASS[(index + (((rotation || 0) % 4) + 4)) % 4];
}

// The single decision point. Two key lookups, because geometry and texture live in different
// frames once the view is rotated (rotateTileKey swaps road_straight_v/_h on every odd turn):
//   - `baseRoadKeyAt(row, col)` is the UNROTATED map-frame key (main.js getBaseTileKey). All
//     geometry - which axis the road runs along, whether neighbours are plain/junctions - is
//     read through this, since row/col deltas are map-frame.
//   - `roadKeyAt(row, col)` is the CURRENTLY RENDERED key (getTileKey), used only to pick which
//     texture variant to show (road_straight_v vs _h bakes, arrow direction on screen).
// `rotation` is mapRotation, used to turn a map-frame lane direction into its on-screen one.
// `busStopVisualCornersAt(row, col)` returns the tile's bus stop sides already converted to
// rotation-resolved corners (getBusStopSides through getBusStopVisualCorner) or null.
// `carriagewayBandAt(row, col)` is getRoadCarriagewayBand (map frame) - falsy means "not a band".
function getRoadLineVariantAt(row, col, {
  roadKeyAt,
  baseRoadKeyAt = roadKeyAt,
  rotation = 0,
  busStopVisualCornersAt = () => null,
  carriagewayBandAt = () => null,
}) {
  const logicalKey = roadKeyAt(row, col);
  if (logicalKey !== 'road_straight_v' && logicalKey !== 'road_straight_h') return null;
  const baseKey = baseRoadKeyAt(row, col);
  const hasMarkings = typeof roadTileVariantHasLineMarkings === 'function'
    ? roadTileVariantHasLineMarkings
    : () => false;

  const busStopVariant = resolveRoadLineBusStopVariant(logicalKey, busStopVisualCornersAt(row, col));
  if (busStopVariant && hasMarkings(logicalKey, busStopVariant)) return busStopVariant;

  const junctionToward = (r, c, direction) => {
    const delta = ROAD_LINE_DIRECTION_DELTA[direction];
    return isRoadLineRealJunctionKey(baseRoadKeyAt(r + delta.row, c + delta.col));
  };
  const approachVariant = (direction, dual) => {
    const variant = resolveRoadLineApproachVariant(logicalKey, rotateRoadLineDirection(direction, rotation), dual);
    return variant && hasMarkings(logicalKey, variant) ? variant : null;
  };

  const band = carriagewayBandAt(row, col);
  if (band) {
    if (band.direction === 'shared' || !ROAD_LINE_DIRECTION_DELTA[band.direction]) return null;
    return junctionToward(row, col, band.direction) ? approachVariant(band.direction, true) : null;
  }

  const axis = baseKey === 'road_straight_v' ? ['north', 'south'] : ['east', 'west'];
  const junctionSide = axis.find((direction) => junctionToward(row, col, direction));
  if (junctionSide) return approachVariant(junctionSide, false);

  // "Plain" = same straight orientation, single lane, no bus stop, not a junction approach.
  const isPlainAt = (r, c) => {
    if (baseRoadKeyAt(r, c) !== baseKey || carriagewayBandAt(r, c)) return false;
    if (axis.some((direction) => junctionToward(r, c, direction))) return false;
    const corners = busStopVisualCornersAt(r, c);
    return !(Array.isArray(corners) && corners.length > 0);
  };
  if (!isPlainAt(row, col)) return null;
  const [dr, dc] = baseKey === 'road_straight_v' ? [1, 0] : [0, 1];
  const before = countRoadLinePlainRun(isPlainAt, row, col, -dr, -dc);
  const after = countRoadLinePlainRun(isPlainAt, row, col, dr, dc);
  if (isRoadLineZebraIndex(before, before + 1 + after)) {
    const zebraVariant = logicalKey === 'road_straight_v' ? 'zebraCrossingNS' : 'zebraCrossing';
    if (hasMarkings(logicalKey, zebraVariant)) return zebraVariant;
  }
  return null;
}

const roadLineVariantsTestApi = {
  ROAD_LINE_MIDBLOCK_CLEARANCE,
  ROAD_LINE_DIRECTION_DELTA,
  isRoadLineRealJunctionKey,
  resolveRoadLineBusStopVariant,
  resolveRoadLineApproachVariant,
  isRoadLineZebraIndex,
  countRoadLinePlainRun,
  rotateRoadLineDirection,
  getRoadLineVariantAt,
};

if (typeof module !== 'undefined' && module.exports) module.exports = roadLineVariantsTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    resolveRoadLineBusStopVariant,
    resolveRoadLineApproachVariant,
    getRoadLineVariantAt,
  });
}
