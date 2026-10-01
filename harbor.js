// Container port: which coast a port faces, where one may be placed, its directional
// sprites, and the frontage index terrain rendering reads. Split out of main.js.

// Terrain rendering asks whether a water/beach tile sits in front of a
// container port.  Keep those few tile ids indexed so a full-map redraw does
// not scan every building for every terrain tile.
const harborFrontageTileIds = new Set();

// ── Container port orientation ─────────────────────────────────────────────
// The four LL/LR/UL/UR sprites represent the four screen-facing quay directions.
// Water is sampled from raw mapData
// neighbours (n=row-1, e=col+1, s=row+1, w=col-1) around the whole footprint,
// then rotated through rotateDirection() so the choice stays correct at every
// mapRotation — same technique getBridgeRampVisualDirection() uses for ramps.

function getHarborWaterSides(row, col, footprintCols = HARBOR_FOOTPRINT_COLS, footprintRows = HARBOR_FOOTPRINT_ROWS) {
  const sides = { n: false, e: false, s: false, w: false };
  for (let dc = 0; dc < footprintCols; dc++) {
    if (mapData[row - 1]?.[col + dc] === WATER) sides.n = true;
    if (mapData[row + footprintRows]?.[col + dc] === WATER) sides.s = true;
  }
  for (let dr = 0; dr < footprintRows; dr++) {
    if (mapData[row + dr]?.[col - 1] === WATER) sides.w = true;
    if (mapData[row + dr]?.[col + footprintCols] === WATER) sides.e = true;
  }
  return sides;
}

function getHarborSideTiles(
  row,
  col,
  side,
  offset = 1,
  footprintCols = HARBOR_FOOTPRINT_COLS,
  footprintRows = HARBOR_FOOTPRINT_ROWS,
) {
  if (side === 'n' || side === 's') {
    const tileRow = side === 'n' ? row - offset : row + footprintRows - 1 + offset;
    return Array.from({ length: footprintCols }, (_, index) => [tileRow, col + index]);
  }
  const tileCol = side === 'w' ? col - offset : col + footprintCols - 1 + offset;
  return Array.from({ length: footprintRows }, (_, index) => [row + index, tileCol]);
}

function getHarborCoastCandidate(
  row,
  col,
  side,
  footprintCols = HARBOR_FOOTPRINT_COLS,
  footprintRows = HARBOR_FOOTPRINT_ROWS,
) {
  const frontageTiles = getHarborSideTiles(row, col, side, 1, footprintCols, footprintRows);
  const beyondTiles = getHarborSideTiles(row, col, side, 2, footprintCols, footprintRows);
  let directWaterCount = 0;
  let beachCount = 0;
  for (let index = 0; index < frontageTiles.length; index++) {
    const [frontRow, frontCol] = frontageTiles[index];
    const [beyondRow, beyondCol] = beyondTiles[index];
    const frontageType = mapData[frontRow]?.[frontCol];
    if (frontageType === WATER) {
      directWaterCount++;
      continue;
    }
    if (frontageType === BEACH && mapData[beyondRow]?.[beyondCol] === WATER) {
      beachCount++;
      continue;
    }
    return null;
  }
  return {
    side,
    coastMode: beachCount > 0 ? 'beach-buffer' : 'direct-water',
    frontageTiles,
    beyondTiles,
    score: directWaterCount * 2 + beachCount,
  };
}

function analyzeHarborCoast(
  row,
  col,
  footprintCols = HARBOR_FOOTPRINT_COLS,
  footprintRows = HARBOR_FOOTPRINT_ROWS,
) {
  return ['n', 'e', 's', 'w']
    .map((side) => getHarborCoastCandidate(row, col, side, footprintCols, footprintRows))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || 'nesw'.indexOf(a.side) - 'nesw'.indexOf(b.side))[0] ?? null;
}

function isHarborFootprintSurfaceAllowed(row, col, anchorRow, anchorCol, coastSide) {
  if (canPlaceBuilding(row, col)) return true;
  if (mapData[row]?.[col] !== BEACH) return false;
  return getHarborSideTiles(anchorRow, anchorCol, coastSide, 0)
    .some(([edgeRow, edgeCol]) => edgeRow === row && edgeCol === col);
}

function canPlaceHarborFootprint(row, col) {
  const coast = analyzeHarborCoast(row, col);
  if (!coast) return false;
  return getFootprintTiles(row, col, HARBOR_FOOTPRINT_COLS, HARBOR_FOOTPRINT_ROWS)
    .every(([tileRow, tileCol]) => (
      isInsideMap(tileRow, tileCol)
      && isHarborFootprintSurfaceAllowed(tileRow, tileCol, row, col, coast.side)
      && mapData[tileRow][tileCol] !== ROAD
      && !isBridgeTile(tileRow, tileCol)
      && !activeScene?.buildingSprites?.has(getTileId(tileRow, tileCol))
      && !buildingData[getTileId(tileRow, tileCol)]
      && !(typeof hasDistrictSignAt === 'function' && hasDistrictSignAt(tileRow, tileCol))
    ));
}

function getHarborVisualWaterSides(row, col, footprintCols = HARBOR_FOOTPRINT_COLS, footprintRows = HARBOR_FOOTPRINT_ROWS) {
  const raw = getHarborWaterSides(row, col, footprintCols, footprintRows);
  const visual = { n: false, e: false, s: false, w: false };
  ['n', 'e', 's', 'w'].forEach((dir) => {
    if (raw[dir]) visual[rotateDirection(dir, mapRotation)] = true;
  });
  return visual;
}

function canPlaceHarbor(row, col) {
  return canPlaceHarborFootprint(row, col);
}

function getHarborVisualKey(
  row,
  col,
  footprintCols = HARBOR_FOOTPRINT_COLS,
  footprintRows = HARBOR_FOOTPRINT_ROWS,
  rawSide = '',
) {
  const coastSide = rawSide || analyzeHarborCoast(row, col, footprintCols, footprintRows)?.side;
  const raw = coastSide
    ? { n: coastSide === 'n', e: coastSide === 'e', s: coastSide === 's', w: coastSide === 'w' }
    : getHarborWaterSides(row, col, footprintCols, footprintRows);
  const visual = { n: false, e: false, s: false, w: false };
  ['n', 'e', 's', 'w'].forEach((dir) => {
    if (raw[dir]) visual[rotateDirection(dir, mapRotation)] = true;
  });
  // Logical neighbours map to isometric screen edges as follows:
  // n → upper-right, e → lower-right, s → lower-left, w → upper-left.
  // The filename suffix states where the water edge appears in the artwork.
  if (visual.n) return 'harbor_ur';
  if (visual.e) return 'harbor_lr';
  if (visual.s) return 'harbor_ll';
  if (visual.w) return 'harbor_ul';
  return 'harbor_ll';
}

function getHarborRecordWaterSide(row, col, record) {
  if (['n', 'e', 's', 'w'].includes(record?.harborWaterSide)) return record.harborWaterSide;
  return analyzeHarborCoast(
    row,
    col,
    record?.footprintCols ?? HARBOR_FOOTPRINT_COLS,
    record?.footprintRows ?? HARBOR_FOOTPRINT_ROWS,
  )?.side || '';
}

function addHarborFrontageToCache(row, col, record, side = '') {
  const waterSide = side || getHarborRecordWaterSide(row, col, record);
  if (!waterSide) return;
  getHarborSideTiles(
    row,
    col,
    waterSide,
    1,
    record?.footprintCols ?? HARBOR_FOOTPRINT_COLS,
    record?.footprintRows ?? HARBOR_FOOTPRINT_ROWS,
  ).forEach(([tileRow, tileCol]) => {
    if (isInsideMap(tileRow, tileCol)) harborFrontageTileIds.add(getTileId(tileRow, tileCol));
  });
}

function rebuildHarborFrontageTileCache() {
  harborFrontageTileIds.clear();
  Object.entries(buildingData).forEach(([id, record]) => {
    if (record?.type !== HARBOR_BUILDING_TYPE) return;
    const [row, col] = id.split(':').map(Number);
    addHarborFrontageToCache(row, col, record);
  });
}

function clearHarborFrontageTileCache() {
  harborFrontageTileIds.clear();
}

function isHarborFrontageTile(row, col) {
  return harborFrontageTileIds.has(getTileId(row, col));
}

function refreshHarborCoastTiles(scene, row, col, side) {
  if (!scene || !side) return;
  getHarborSideTiles(row, col, side, 1).forEach(([tileRow, tileCol]) => {
    if (isInsideMap(tileRow, tileCol)) refreshTileArea(scene, tileRow, tileCol);
  });
}

function refreshAllHarborFrontages(scene) {
  harborFrontageTileIds.forEach((id) => {
    const [row, col] = id.split(':').map(Number);
    if (isInsideMap(row, col)) refreshTileArea(scene, row, col);
  });
}

function refreshHarborSprites(scene) {
  Object.entries(buildingData).forEach(([id, record]) => {
    if (record.type !== HARBOR_BUILDING_TYPE) return;
    const [row, col] = id.split(':').map(Number);
    const footprintCols = record.footprintCols ?? HARBOR_FOOTPRINT_COLS;
    const footprintRows = record.footprintRows ?? HARBOR_FOOTPRINT_ROWS;
    const rawSide = getHarborRecordWaterSide(row, col, record);
    if (rawSide) record.harborWaterSide = rawSide;
    const newKey = getHarborVisualKey(row, col, footprintCols, footprintRows, rawSide);
    if (newKey === record.spriteKey) return;
    record.spriteKey = newKey;
    record.assetId = HARBOR_MODELS[newKey]?.path;
    const sprite = scene?.buildingSprites?.get(id);
    if (!sprite) return;
    sprite.setTexture(newKey);
    // The orientation's night art is a different texture; drop the day/night
    // bookkeeping so dawn cannot restore the previous orientation's day art.
    sprite.__dayTextureKey = null;
    sprite.skipNightTint = false;
    markBuildingNightArtDirty(scene);
    const opts = harborModelMetadata[newKey];
    if (opts) {
      sprite.setOrigin(opts.originX ?? 0.5, opts.originY ?? 1);
      if (opts.scaleX || opts.scaleY) sprite.setScale(opts.scaleX ?? opts.scale ?? 1, opts.scaleY ?? opts.scale ?? 1);
      else if (opts.scale) sprite.setScale(opts.scale);
      sprite.spriteOffsetX = opts.offsetX ?? 0;
      sprite.spriteOffsetY = opts.offsetY ?? 0;
      sprite.anchorMode = opts.anchorMode;
      Object.assign(record, {
        originX: opts.originX,
        originY: opts.originY,
        scale: opts.scale,
        scaleX: opts.scaleX,
        scaleY: opts.scaleY,
        offsetX: opts.offsetX,
        offsetY: opts.offsetY,
        anchorMode: opts.anchorMode,
      });
      positionBuilding(scene, sprite);
    }
  });
}
