// Tile keys: which texture each terrain and road tile shows - road shapes (with
// carriageway widening), shorelines, beaches, hills and water patterns - and how those
// keys rotate with the view. Split out of main.js.

// ── Tile-key direction rotation ───────────────────────────────────────────────
// All tile-key functions compute adjacency from logical mapData neighbours
// (n=row-1, e=col+1, s=row+1, w=col-1) and embed those compass letters in the
// key name.  When the view is rotated those letters must be rotated too so that
// the correct texture is chosen.  One CW step maps n→e→s→w→n.

function rotateDirection(direction, steps) {
  const order = ['n', 'e', 's', 'w'];
  const index = order.indexOf(direction);
  if (index < 0) return direction;
  return order[(index + ((steps % 4) + 4)) % 4];
}

function rotateTileKey(key, steps) {
  steps = ((steps % 4) + 4) % 4;
  if (steps === 0) return key;
  // Apply one step at a time (keeps the logic simple and fast enough for 4 steps max)
  if (steps > 1) return rotateTileKey(rotateTileKey(key, 1), steps - 1);

  const rotDir = { n: 'e', e: 's', s: 'w', w: 'n' };
  const d = (c) => rotDir[c] ?? c;

  // Straight roads swap orientation each 90°
  if (key === 'road_straight_v') return 'road_straight_h';
  if (key === 'road_straight_h') return 'road_straight_v';
  if (key === 'road_bridge_v') return 'road_bridge_h';
  if (key === 'road_bridge_h') return 'road_bridge_v';

  // Patterns: PREFIX_edge_X  →  PREFIX_edge_{d(X)}
  const edgeM = key.match(/^(.+_edge)_([nesw])$/);
  if (edgeM) return `${edgeM[1]}_${d(edgeM[2])}`;

  // Patterns: PREFIX_corner_XY  →  PREFIX_corner_{canonical rotated pair}
  // Canonical names: ne (n+e→NE), se (e+s→SE), sw (s+w→SW), nw (n+w→NW)
  const cornerM = key.match(/^(.+_corner(?:_water|_land)?)_([nesw]{2})$/);
  if (cornerM) {
    const a = d(cornerM[2][0]);
    const b = d(cornerM[2][1]);
    const canon = { ne:'ne', es:'se', sw:'sw', nw:'nw', se:'se', en:'ne', ws:'sw', wn:'nw' };
    return `${cornerM[1]}_${canon[a + b] ?? (a + b)}`;
  }

  // Patterns: PREFIX_t_X  →  PREFIX_t_{d(X)}
  const tM = key.match(/^(.+_t)_([nesw])$/);
  if (tM) return `${tM[1]}_${d(tM[2])}`;

  // Hill-road variants use the same compass rotation rules.
  const hillM = key.match(/^(.+_hill2?)_([nesw])$/);
  if (hillM) return `${hillM[1]}_${d(hillM[2])}`;

  // Patterns: PREFIX_end_X  →  PREFIX_end_{d(X)}
  const endM = key.match(/^(.+_end)_([nesw])$/);
  if (endM) return `${endM[1]}_${d(endM[2])}`;

  // Symmetric tiles (cross, full, plateau, isolated) — unchanged
  return key;
}

function getTileKey(row, col) {
  return rotateTileKey(getBaseTileKey(row, col), mapRotation);
}

function getBaseTileKey(row, col) {
  const tileType = getBaseTileType(row, col);
  const hasHeight = getTileHeight(row, col) > 0;
  let key;
  if      (tileType === ROAD)  key = getRoadKey(row, col);
  else if (tileType === DIRT)  key = 'dirt_full';
  // a typhoon shelter's waterfront: the quay's beach and the open ground beside it are paved (石仔地)
  else if (tileType === BEACH) {
    key = isTyphoonShelterPavedTileSafe(row, col) ? 'dirt_full'
      : isTyphoonShelterQuayTileSafe(row, col) ? 'ground_full' : getBeachKey(row, col);
  }
  else if (tileType === WATER) key = getWaterKey(row, col);
  else if (hasHeight)          key = getHillKey(row, col);
  else                         key = isTyphoonShelterPavedTileSafe(row, col) ? 'dirt_full' : 'ground_full';
  return key;
}

function isTyphoonShelterQuayTileSafe(row, col) {
  return typeof isTyphoonShelterQuayTile === 'function' && isTyphoonShelterQuayTile(row, col);
}

function isTyphoonShelterPavedTileSafe(row, col) {
  return typeof isTyphoonShelterPavedTile === 'function' && isTyphoonShelterPavedTile(row, col);
}

function getBaseTileType(row, col) {
  if (!isBridgeTile(row, col)) return mapData[row][col];
  return getBridgeUnderlayTileType(row, col);
}

// ── Carriageway widening (parallel roads placed side-by-side) ───────────────
// Hong Kong dual-carriageway convention (see docs/road-widening-plan.md): two or more
// straight, same-orientation road cells placed side-by-side form ONE widened road
// rather than each cell independently reading its neighbours as a T/cross junction —
// but ONLY the unambiguous straight middle of that band. Per direct product decision,
// a road's own end — including where two widened lanes terminate together, which the
// plain bitmask reads as a corner joining them into a loop, and every corner/T/cross
// of a wide band turning or meeting another band — keeps EXACTLY the original
// single-cell 4-neighbour bitmask below, unchanged. So getRoadCarriagewayBand requires
// strict through-connection on the travel axis (both neighbours present, not just one)
// before a cell is even considered, only counts lateral neighbours that are themselves
// parallel lanes, and bails if any other road touches the band's edge at that row.
const CARRIAGEWAY_MAX_BAND_WIDTH = 12; // generous — real HK roads rarely exceed ~6 lanes each way

// Status of a width range at one row/column: 'full' (every cell road), 'none' (none),
// or 'partial' (a mix). Used by getRoadCarriagewayBand's run-length tie-break.
function roadRowWidthStatus(row, colStart, colEnd) {
  let any = false, all = true;
  for (let c = colStart; c <= colEnd; c++) {
    if (isRoadLikeTile(row, c)) any = true; else all = false;
  }
  return all ? 'full' : any ? 'partial' : 'none';
}

function roadColWidthStatus(col, rowStart, rowEnd) {
  let any = false, all = true;
  for (let r = rowStart; r <= rowEnd; r++) {
    if (isRoadLikeTile(r, col)) any = true; else all = false;
  }
  return all ? 'full' : any ? 'partial' : 'none';
}

function getVerticalCarriagewayCandidate(row, col) {
  // Strict through required (both sides) — a road's own end must fall through to the
  // plain bitmask below, so only cells unambiguously mid-run reach the width scan.
  if (!isRoadLikeTile(row - 1, col) || !isRoadLikeTile(row + 1, col)) return null;
  // Only widen into a neighbour that is itself a parallel lane (road directly above AND
  // below it too). A plain "is it road" scan picks up a crossing band's whole row at a
  // loop corner (width 6 instead of the true 2), which then needed fragile look-ahead
  // heuristics to undo — and those in turn misfired on a legitimate 1→2 lane widening.
  let start = col, end = col;
  while (start > col - CARRIAGEWAY_MAX_BAND_WIDTH && isRoadLikeTile(row, start - 1)
    && isRoadLikeTile(row - 1, start - 1) && isRoadLikeTile(row + 1, start - 1)) start--;
  while (end < col + CARRIAGEWAY_MAX_BAND_WIDTH && isRoadLikeTile(row, end + 1)
    && isRoadLikeTile(row - 1, end + 1) && isRoadLikeTile(row + 1, end + 1)) end++;
  const width = end - start + 1;
  if (width < 2 || width > CARRIAGEWAY_MAX_BAND_WIDTH) return null;
  // Road right beyond the matched lanes is a real branch at this row (a crossing band's
  // row, a side street) — a genuine junction, so keep the original bitmask here.
  if (isRoadLikeTile(row, start - 1) || isRoadLikeTile(row, end + 1)) return null;
  return { start, end, width, index: col - start };
}

function getHorizontalCarriagewayCandidate(row, col) {
  // Mirror of getVerticalCarriagewayCandidate onto the other axis.
  if (!isRoadLikeTile(row, col - 1) || !isRoadLikeTile(row, col + 1)) return null;
  let start = row, end = row;
  while (start > row - CARRIAGEWAY_MAX_BAND_WIDTH && isRoadLikeTile(start - 1, col)
    && isRoadLikeTile(start - 1, col - 1) && isRoadLikeTile(start - 1, col + 1)) start--;
  while (end < row + CARRIAGEWAY_MAX_BAND_WIDTH && isRoadLikeTile(end + 1, col)
    && isRoadLikeTile(end + 1, col - 1) && isRoadLikeTile(end + 1, col + 1)) end++;
  const height = end - start + 1;
  if (height < 2 || height > CARRIAGEWAY_MAX_BAND_WIDTH) return null;
  if (isRoadLikeTile(start - 1, col) || isRoadLikeTile(end + 1, col)) return null;
  return { start, end, width: height, index: row - start };
}

// Returns null when (row, col) is not part of a widened band (either a lone 1-wide
// road, or a genuine end/junction/corner/cross that the existing bitmask below should
// keep handling unchanged). Otherwise returns this cell's position within the band:
// `index` counts from the west edge (vertical bands) or north edge (horizontal
// bands); `direction` is which way that lane carries traffic, assigned by Hong
// Kong's keep-left rule (see getTrafficLeftLaneOffset, traffic-visuals.js): for a
// vertical band the west half is northbound and the east half southbound; for a
// horizontal band the north half is eastbound and the south half westbound. An
// odd-width band's exact middle lane is a shared/reversible lane, not a fixed
// direction — see docs/road-widening-plan.md section 3.
function getRoadCarriagewayBand(row, col) {
  const v = getVerticalCarriagewayCandidate(row, col);
  const h = getHorizontalCarriagewayCandidate(row, col);

  let orientation = null, band = null;
  if (v && h) {
    // Both passed the checks above — a genuine ambiguous solid rectangle (any solid
    // W×L block reads validly both ways, not just perfect squares). Break the tie
    // using the band's actual run length along its OWN travel axis, not its lane
    // count: whichever elongation is longer is the real orientation.
    let vRun = 1;
    for (let r = row - 1; roadRowWidthStatus(r, v.start, v.end) === 'full'; r--) vRun++;
    for (let r = row + 1; roadRowWidthStatus(r, v.start, v.end) === 'full'; r++) vRun++;
    let hRun = 1;
    for (let c = col - 1; roadColWidthStatus(c, h.start, h.end) === 'full'; c--) hRun++;
    for (let c = col + 1; roadColWidthStatus(c, h.start, h.end) === 'full'; c++) hRun++;
    if (vRun !== hRun) { orientation = vRun > hRun ? 'v' : 'h'; band = vRun > hRun ? v : h; }
  } else if (v) { orientation = 'v'; band = v; }
  else if (h) { orientation = 'h'; band = h; }

  if (!band) return null;
  return {
    orientation,
    width: band.width,
    index: band.index,
    direction: getCarriagewayLaneDirection(band.width, band.index, orientation === 'v'),
  };
}

function getCarriagewayLaneDirection(width, index, vertical) {
  const half = Math.floor(width / 2);
  let side;
  if (width % 2 === 0) {
    side = index < half ? 'A' : 'B';
  } else {
    side = index < half ? 'A' : index > half ? 'B' : 'shared';
  }
  if (side === 'shared') return 'shared';
  if (vertical) return side === 'A' ? 'north' : 'south';
  return side === 'A' ? 'east' : 'west';
}

// Determine which road tile to use based on neighbouring roads
function getRoadKey(row, col) {
  if (isBridgeTile(row, col)) {
    const bridgeValue = normalizeBridgeMapValue(bridgeMap[row][col]);
    if (bridgeValue === 'deck:row') return 'road_bridge_h';
    if (bridgeValue === 'deck:col') return 'road_bridge_v';
    const rampMatch = bridgeValue?.match(/^ramp:([nesw])$/);
    if (rampMatch) return getBridgeRampRoadKey(rampMatch[1]);
  }

  const slopeKey = getRoadSlopeKey(row, col);
  if (slopeKey === 'road_slope_corner') return 'road_isolated';
  if (slopeKey) return slopeKey;

  // A cell that is part of a widened (multi-lane) parallel band always renders as
  // a plain straight tile — it must never fall into the junction bitmask below,
  // which would otherwise misread the lateral band-mate as a perpendicular branch.
  const band = getRoadCarriagewayBand(row, col);
  if (band) return band.orientation === 'v' ? 'road_straight_v' : 'road_straight_h';

  // Determine adjacency on diagonal edges (NE, SE, SW, NW).  The 'north' tile in mapData corresponds
  // to the NE edge of the isometric tile, 'east' corresponds to SE, 'south' to SW and 'west' to NW.
  const ne = row > 0 && isRoadLikeTile(row - 1, col);
  const se = col < MAP_WIDTH - 1 && isRoadLikeTile(row, col + 1);
  const sw = row < MAP_HEIGHT - 1 && isRoadLikeTile(row + 1, col);
  const nw = col > 0 && isRoadLikeTile(row, col - 1);
  // Cross intersection (all four sides connect)
  if (ne && se && sw && nw) return 'road_cross';
  // Straight roads (two opposite sides connect)
  if (ne && sw && !se && !nw) return 'road_straight_v';
  if (se && nw && !ne && !sw) return 'road_straight_h';
  // Corner roads (two adjacent sides connect)
  if (ne && se && !sw && !nw) return 'road_corner_ne';
  if (se && sw && !nw && !ne) return 'road_corner_se';
  if (sw && nw && !ne && !se) return 'road_corner_sw';
  if (nw && ne && !se && !sw) return 'road_corner_nw';
  // T intersections (three sides connect).  Missing side dictates which T variant to use.
  if (!sw && ne && se && nw) return 'road_t_n'; // missing SW side
  if (!nw && ne && se && sw) return 'road_t_e'; // missing NW side
  if (!ne && se && sw && nw) return 'road_t_s'; // missing NE side
  if (!se && ne && sw && nw) return 'road_t_w'; // missing SE side
  if (ne) return 'road_end_s';
  if (se) return 'road_end_w';
  if (sw) return 'road_end_n';
  if (nw) return 'road_end_e';
  return 'road_isolated';
}

function getBridgeRampRoadKey(direction) {
  const mode = typeof getRoadTileSetBridgeRampMode === 'function'
    ? getRoadTileSetBridgeRampMode()
    : 'hill2';
  if (mode === 'straight') {
    return direction === 'n' || direction === 's'
      ? 'road_straight_v'
      : 'road_straight_h';
  }
  return `road_hill2_${getOppositeDirection(direction)}`;
}

function getRoadSlopeKey(row, col) {
  const supportedSlopeKey = getSupportedRoadSlopeKey(row, col);
  if (supportedSlopeKey) return supportedSlopeKey;
  return isSlopeTile(row, col) ? 'road_slope_corner' : null;
}

function getBeachKey(row, col) {
  return getShorelineKey(row, col);
}

function getWaterKey(row, col) {
  return getWaterPatternKey(row, col);
}

function getHillKey(row, col) {
  const openEdges = normalizeHillOpenEdges(row, col, getHillOpenEdges(row, col));
  return getEdgePatternKey(openEdges, 'hill', 'hill_plateau', 'hill_plateau');
}

function normalizeHillOpenEdges(row, col, openEdges) {
  if (openEdges.length <= 1) return openEdges;

  if (openEdges.length === 2) {
    const pair = openEdges.slice().sort((a, b) => 'nesw'.indexOf(a) - 'nesw'.indexOf(b)).join('');
    if (pair === 'ne' || pair === 'es' || pair === 'sw' || pair === 'nw') {
      return openEdges;
    }
  }

  const currentHeight = getTileHeight(row, col);
  const dropByDir = {
    n: currentHeight - (row > 0 ? getTileHeight(row - 1, col) : 0),
    e: currentHeight - (col < MAP_WIDTH - 1 ? getTileHeight(row, col + 1) : 0),
    s: currentHeight - (row < MAP_HEIGHT - 1 ? getTileHeight(row + 1, col) : 0),
    w: currentHeight - (col > 0 ? getTileHeight(row, col - 1) : 0),
  };

  const sorted = openEdges.slice().sort((a, b) => dropByDir[b] - dropByDir[a]);

  // 3/4 open-edge topologies are not representable with the current tileset.
  // Degrade to a single dominant edge to avoid random corner spikes.
  if (sorted.length >= 3) {
    return [sorted[0]];
  }

  if (sorted.length >= 2) {
    const best = sorted[0];
    const adjacent = sorted.find((dir) => dir !== best && !areOppositeDirs(best, dir));
    if (adjacent) return [best, adjacent].sort((a, b) => 'nesw'.indexOf(a) - 'nesw'.indexOf(b));
  }

  return [sorted[0]];
}

function areOppositeDirs(a, b) {
  return (a === 'n' && b === 's') || (a === 's' && b === 'n') || (a === 'e' && b === 'w') || (a === 'w' && b === 'e');
}

function getHillOpenEdges(row, col) {
  const currentHeight = getTileHeight(row, col);
  if (currentHeight <= 0) return ['n', 'e', 's', 'w'];

  const neighborHeight = {
    n: row > 0 ? getTileHeight(row - 1, col) : 0,
    e: col < MAP_WIDTH - 1 ? getTileHeight(row, col + 1) : 0,
    s: row < MAP_HEIGHT - 1 ? getTileHeight(row + 1, col) : 0,
    w: col > 0 ? getTileHeight(row, col - 1) : 0,
  };

  return ['n', 'e', 's', 'w'].filter((dir) => neighborHeight[dir] < currentHeight);
}

function getWaterPatternKey(row, col) {
  // A container-port sprite already draws its own quay wall. Suppress the
  // normal grassy/sandy shoreline lip on the adjoining frontage tiles so the
  // quay meets open water without a duplicate bank.
  if (isHarborFrontageTile(row, col)) return 'water_full';
  if (isOnMapEdge(row, col)) return 'water_full';
  // a quay wall meets the water square, as a container port's does: no bank toward it
  const quayEdges = [['n', -1, 0], ['e', 0, 1], ['s', 1, 0], ['w', 0, -1]]
    .filter(([, dr, dc]) => isTyphoonShelterQuayTileSafe(row + dr, col + dc)).map(([direction]) => direction);
  const connectedEdges = getAdjacentEdges(row, col, WATER)
    .concat(getAdjacentEdges(row, col, BEACH), quayEdges);
  const openEdges = ['n', 'e', 's', 'w'].filter((direction) => !connectedEdges.includes(direction));
  return getEdgePatternKey(openEdges, 'water', 'water_full');
}

function getTerrainPatternKey(row, col, terrainType, prefix, fullKey = `${prefix}_full`) {
  const openEdges = getOpenEdges(row, col, terrainType);
  return getEdgePatternKey(openEdges, prefix, fullKey);
}

function getShorelineKey(row, col) {
  // Beach frontage is visually occupied by the quay. Keep BEACH in mapData so
  // saves and terrain simulation stay intact, but render water beneath the port.
  if (isHarborFrontageTile(row, col)) return 'water_full';
  if (isOnMapEdge(row, col)) return 'beach_full';
  const waterEdges = getAdjacentEdges(row, col, WATER);
  if (waterEdges.length === 2) {
    const waterCorner = getCornerPairSuffix(waterEdges);
    if (waterCorner && isWaterDiagonalForCorner(row, col, waterCorner)) {
      return `beach_corner_water_${rotateCornerSuffixCCW(waterCorner)}`;
    }
  }
  const beachEdges = getAdjacentEdges(row, col, BEACH);
  const shorelineEdges = waterEdges.length > 0 ? waterEdges : getOppositeEdges(beachEdges);
  if (shorelineEdges.length === 2) {
    const corner = getCornerPairSuffix(shorelineEdges);
    if (corner) return `beach_corner_${rotateCornerSuffix180(corner)}`;
  }
  return getEdgePatternKey(shorelineEdges, 'beach', 'beach_full');
}

function getAdjacentEdges(row, col, terrainType) {
  const ne = row > 0 && mapData[row - 1][col] === terrainType;
  const se = col < MAP_WIDTH - 1 && mapData[row][col + 1] === terrainType;
  const sw = row < MAP_HEIGHT - 1 && mapData[row + 1][col] === terrainType;
  const nw = col > 0 && mapData[row][col - 1] === terrainType;

  return [
    ['n', ne],
    ['e', se],
    ['s', sw],
    ['w', nw],
  ].filter(([, matches]) => matches).map(([direction]) => direction);
}

function getOpenEdges(row, col, terrainType) {
  const connectedEdges = getAdjacentEdges(row, col, terrainType);
  return ['n', 'e', 's', 'w'].filter((direction) => !connectedEdges.includes(direction));
}

function getOppositeEdges(edges) {
  const opposite = { n: 's', e: 'w', s: 'n', w: 'e' };
  return edges.map((edge) => opposite[edge]);
}

function getCornerPairSuffix(edges) {
  if (!Array.isArray(edges) || edges.length !== 2) return null;
  const pair = edges
    .slice()
    .sort((a, b) => 'nesw'.indexOf(a) - 'nesw'.indexOf(b))
    .join('');
  if (pair === 'ne') return 'ne';
  if (pair === 'es') return 'se';
  if (pair === 'sw') return 'sw';
  if (pair === 'nw') return 'nw';
  return null;
}

function rotateCornerSuffixCCW(suffix) {
  if (suffix === 'ne') return 'nw';
  if (suffix === 'se') return 'ne';
  if (suffix === 'sw') return 'se';
  if (suffix === 'nw') return 'sw';
  return suffix;
}

function rotateCornerSuffix180(suffix) {
  if (suffix === 'ne') return 'sw';
  if (suffix === 'se') return 'nw';
  if (suffix === 'sw') return 'ne';
  if (suffix === 'nw') return 'se';
  return suffix;
}

function isWaterDiagonalForCorner(row, col, cornerSuffix) {
  if (cornerSuffix === 'ne') return isTerrainType(row - 1, col + 1, WATER);
  if (cornerSuffix === 'se') return isTerrainType(row + 1, col + 1, WATER);
  if (cornerSuffix === 'sw') return isTerrainType(row + 1, col - 1, WATER);
  if (cornerSuffix === 'nw') return isTerrainType(row - 1, col - 1, WATER);
  return false;
}

function isTerrainType(row, col, terrainType) {
  return isInsideMap(row, col) && mapData[row][col] === terrainType;
}

function isOnMapEdge(row, col) {
  return row === 0 || col === 0 || row === MAP_HEIGHT - 1 || col === MAP_WIDTH - 1;
}

function getMixedCornerKey(row, col, edges, prefix) {
  const candidates = [
    { suffix: 'ne', directions: ['n', 'e'], samples: [[row - 1, col], [row, col + 1], [row - 1, col + 1]] },
    { suffix: 'se', directions: ['e', 's'], samples: [[row, col + 1], [row + 1, col], [row + 1, col + 1]] },
    { suffix: 'sw', directions: ['s', 'w'], samples: [[row + 1, col], [row, col - 1], [row + 1, col - 1]] },
    { suffix: 'nw', directions: ['w', 'n'], samples: [[row, col - 1], [row - 1, col], [row - 1, col - 1]] },
  ];

  let bestSuffix = null;
  let bestScore = -1;

  candidates.forEach((candidate) => {
    if (!candidate.directions.every((direction) => edges.includes(direction))) return;

    const score = candidate.samples.reduce((total, [sampleRow, sampleCol]) => {
      if (!isInsideMap(sampleRow, sampleCol)) return total;
      const terrain = mapData[sampleRow][sampleCol];
      if (terrain === WATER || terrain === BEACH) return total + 1;
      return total;
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestSuffix = candidate.suffix;
    }
  });

  return bestSuffix ? `${prefix}_${bestSuffix}` : null;
}

function getEdgePatternKey(edges, prefix, fullKey, fallbackKey = fullKey) {
  if (edges.length === 0) return fullKey;
  if (edges.length === 1) return `${prefix}_edge_${edges[0]}`;

  if (edges.length === 2) {
    const edgePair = edges.join('');
    if (edgePair === 'ne') return `${prefix}_corner_ne`;
    if (edgePair === 'es') return `${prefix}_corner_se`;
    if (edgePair === 'sw') return `${prefix}_corner_sw`;
    if (edgePair === 'nw') return `${prefix}_corner_nw`;
  }

  return fallbackKey;
}
