// Terrain editing: the raise, lower and flatten tools - which tiles block an edit, and the
// radiating plans that keep the slopes around an edited tile within the hill rules.
// Split out of main.js.

const TERRAIN_RAISE_BLOCK_RADIUS = 1;
const TERRAIN_RADIATE_BASE_RADIUS = 4;

function getRaiseTerrainBlockers(scene, centerRow, centerCol, radius = 1) {
  const tiles = [];
  for (let row = centerRow - radius; row <= centerRow + radius; row++) {
    for (let col = centerCol - radius; col <= centerCol + radius; col++) {
      if (!isInsideMap(row, col)) continue;
      tiles.push({ row, col });
    }
  }

  return getTerrainEditBlockersForTiles(scene, tiles);
}

function getTerrainEditBlockersForTiles(scene, tiles) {
  const blockers = [];
  const visited = new Set();

  tiles.forEach(({ row, col }) => {
    if (!isInsideMap(row, col)) return;
    const key = `${row},${col}`;
    if (visited.has(key)) return;
    visited.add(key);

    if (mapData[row][col] === ROAD || isBridgeTile(row, col)) {
      blockers.push({ row, col, reason: 'road' });
      return;
    }

    const id = getTileId(row, col);
    if (scene.buildingSprites.has(id) || !!buildingData[id] || (typeof hasDistrictSignAt === 'function' && hasDistrictSignAt(row, col))) {
      blockers.push({ row, col, reason: 'building' });
    }
  });

  return blockers;
}

function buildRadiatingRaisePlan(centerRow, centerCol, targetCenterHeight, baseRadius = TERRAIN_RADIATE_BASE_RADIUS) {
  const plannedHeights = new Map();
  const makeKey = (row, col) => `${row},${col}`;

  function getHeightWithPlan(row, col) {
    const key = makeKey(row, col);
    if (plannedHeights.has(key)) return plannedHeights.get(key);
    return getTileHeight(row, col);
  }

  function stageRaise(row, col, targetHeight) {
    if (!isInsideMap(row, col)) return false;
    const nextHeight = Math.max(0, Math.min(MAX_TERRAIN_HEIGHT, targetHeight));
    const key = makeKey(row, col);
    const baseline = plannedHeights.has(key)
      ? plannedHeights.get(key)
      : getTileHeight(row, col);

    if (nextHeight <= baseline) return false;
    plannedHeights.set(key, nextHeight);
    return true;
  }

  // Seed with a Chebyshev-distance pyramid (9x9 when radius=4):
  // center gets targetCenterHeight, each outward ring is one level lower.
  for (let row = centerRow - baseRadius; row <= centerRow + baseRadius; row++) {
    for (let col = centerCol - baseRadius; col <= centerCol + baseRadius; col++) {
      if (!isInsideMap(row, col)) continue;
      const distance = Math.max(Math.abs(row - centerRow), Math.abs(col - centerCol));
      const required = targetCenterHeight - distance;
      if (required <= 0) continue;
      stageRaise(row, col, required);
    }
  }

  // Expand outward as needed so all cardinal neighbors remain within one level.
  let changed = true;
  while (changed) {
    changed = false;
    const snapshot = Array.from(plannedHeights.entries());

    for (let i = 0; i < snapshot.length; i++) {
      const [key, height] = snapshot[i];
      const [row, col] = key.split(',').map(Number);
      const neighbors = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ];

      for (let n = 0; n < neighbors.length; n++) {
        const [nr, nc] = neighbors[n];
        if (!isInsideMap(nr, nc)) continue;
        const minNeighborHeight = Math.max(0, height - 1);
        const neighborHeight = getHeightWithPlan(nr, nc);
        if (neighborHeight >= minNeighborHeight) continue;
        if (stageRaise(nr, nc, minNeighborHeight)) changed = true;
      }
    }
  }

  const affectedTiles = [];
  plannedHeights.forEach((plannedHeight, key) => {
    const [row, col] = key.split(',').map(Number);
    const current = getTileHeight(row, col);
    if (plannedHeight <= current) return;
    affectedTiles.push({ row, col, targetHeight: plannedHeight });
  });

  return affectedTiles;
}

function buildRadiatingLowerPlan(centerRow, centerCol, targetCenterHeight, baseRadius = TERRAIN_RADIATE_BASE_RADIUS) {
  const plannedHeights = new Map();
  const makeKey = (row, col) => `${row},${col}`;

  function getHeightWithPlan(row, col) {
    const key = makeKey(row, col);
    if (plannedHeights.has(key)) return plannedHeights.get(key);
    return getTileHeight(row, col);
  }

  function stageLower(row, col, targetHeight) {
    if (!isInsideMap(row, col)) return false;
    const nextHeight = Math.max(0, Math.min(MAX_TERRAIN_HEIGHT, targetHeight));
    const key = makeKey(row, col);
    const baseline = plannedHeights.has(key)
      ? plannedHeights.get(key)
      : getTileHeight(row, col);

    if (nextHeight >= baseline) return false; // only lower, never raise
    plannedHeights.set(key, nextHeight);
    return true;
  }

  // Seed: inverted Chebyshev pyramid — center digs deepest, each outward ring is one level shallower.
  for (let row = centerRow - baseRadius; row <= centerRow + baseRadius; row++) {
    for (let col = centerCol - baseRadius; col <= centerCol + baseRadius; col++) {
      if (!isInsideMap(row, col)) continue;
      const distance = Math.max(Math.abs(row - centerRow), Math.abs(col - centerCol));
      const maxAllowed = targetCenterHeight + distance;
      const currentH = getTileHeight(row, col);
      if (currentH > maxAllowed) {
        stageLower(row, col, maxAllowed);
      }
    }
  }

  // Expand outward: if we lowered a tile, its cardinal neighbors that are now
  // more than 1 higher must also be lowered to maintain the slope constraint.
  let changed = true;
  while (changed) {
    changed = false;
    const snapshot = Array.from(plannedHeights.entries());

    for (let i = 0; i < snapshot.length; i++) {
      const [key, height] = snapshot[i];
      const [row, col] = key.split(',').map(Number);
      const neighbors = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ];

      for (let n = 0; n < neighbors.length; n++) {
        const [nr, nc] = neighbors[n];
        if (!isInsideMap(nr, nc)) continue;
        const maxNeighborHeight = height + 1;
        const neighborHeight = getHeightWithPlan(nr, nc);
        if (neighborHeight <= maxNeighborHeight) continue;
        if (stageLower(nr, nc, maxNeighborHeight)) changed = true;
      }
    }
  }

  const affectedTiles = [];
  plannedHeights.forEach((plannedHeight, key) => {
    const [row, col] = key.split(',').map(Number);
    const current = getTileHeight(row, col);
    if (plannedHeight >= current) return; // skip if not actually lowering
    affectedTiles.push({ row, col, targetHeight: plannedHeight });
  });

  return affectedTiles;
}

function applyRaiseTerrain(scene, row, col, radius = 1) {
  const currentHeight = getTileHeight(row, col);
  const targetCenterHeight = Math.min(MAX_TERRAIN_HEIGHT, currentHeight + 1);
  if (targetCenterHeight <= currentHeight) {
    return false;
  }

  const baseRadius = Math.max(radius, TERRAIN_RADIATE_BASE_RADIUS);
  const affectedTiles = buildRadiatingRaisePlan(row, col, targetCenterHeight, baseRadius);
  if (affectedTiles.length === 0) {
    return false;
  }

  const blockers = getTerrainEditBlockersForTiles(scene, affectedTiles);
  if (blockers.length > 0) {
    showToast(t('toast.terrainEditBlockedByInfrastructure'), 'warning');
    return false;
  }

  let minRow = row;
  let maxRow = row;
  let minCol = col;
  let maxCol = col;

  affectedTiles.forEach(({ row: tileRow, col: tileCol, targetHeight }) => {
    if (!heightMap[tileRow]) heightMap[tileRow] = [];
    heightMap[tileRow][tileCol] = targetHeight;
    mapData[tileRow][tileCol] = HILL;

    minRow = Math.min(minRow, tileRow);
    maxRow = Math.max(maxRow, tileRow);
    minCol = Math.min(minCol, tileCol);
    maxCol = Math.max(maxCol, tileCol);
  });

  const reconcileRadius = Math.max(
    Math.abs(minRow - row),
    Math.abs(maxRow - row),
    Math.abs(minCol - col),
    Math.abs(maxCol - col),
  ) + 1;

  reconcileSurfaceTerrainFromHeight(row, col, reconcileRadius);
  affectedTiles.forEach(({ row: tileRow, col: tileCol }) => {
    refreshTileArea(scene, tileRow, tileCol);
  });
  if (typeof invalidateOverlayCache === 'function') invalidateOverlayCache();
  return true;
}

function applyLowerTerrain(scene, row, col, radius = 1) {
  const currentHeight = getTileHeight(row, col);
  const targetCenterHeight = Math.max(0, currentHeight - 1);
  if (targetCenterHeight >= currentHeight) {
    return false;
  }

  const baseRadius = Math.max(radius, TERRAIN_RADIATE_BASE_RADIUS);
  const affectedTiles = buildRadiatingLowerPlan(row, col, targetCenterHeight, baseRadius);
  if (affectedTiles.length === 0) {
    return false;
  }

  const blockers = getTerrainEditBlockersForTiles(scene, affectedTiles);
  if (blockers.length > 0) {
    showToast(t('toast.terrainEditBlockedByInfrastructure'), 'warning');
    return false;
  }

  let minRow = row;
  let maxRow = row;
  let minCol = col;
  let maxCol = col;

  affectedTiles.forEach(({ row: tileRow, col: tileCol, targetHeight }) => {
    if (!heightMap[tileRow]) heightMap[tileRow] = [];
    heightMap[tileRow][tileCol] = targetHeight;
    mapData[tileRow][tileCol] = targetHeight > 0 ? HILL : GROUND;

    minRow = Math.min(minRow, tileRow);
    maxRow = Math.max(maxRow, tileRow);
    minCol = Math.min(minCol, tileCol);
    maxCol = Math.max(maxCol, tileCol);
  });

  const reconcileRadius = Math.max(
    Math.abs(minRow - row),
    Math.abs(maxRow - row),
    Math.abs(minCol - col),
    Math.abs(maxCol - col),
  ) + 1;

  reconcileSurfaceTerrainFromHeight(row, col, reconcileRadius);
  affectedTiles.forEach(({ row: tileRow, col: tileCol }) => {
    refreshTileArea(scene, tileRow, tileCol);
  });
  if (typeof invalidateOverlayCache === 'function') invalidateOverlayCache();
  return true;
}

function applyFlattenTerrain(scene, row, col, radius = 1) {
  const blockers = getRaiseTerrainBlockers(scene, row, col, radius);
  if (blockers.length > 0) {
    showToast(t('toast.terrainEditBlockedByInfrastructure'), 'warning');
    return false;
  }

  const targetHeight = getTileHeight(row, col);
  const affectedTiles = [];
  for (let tileRow = row - radius; tileRow <= row + radius; tileRow++) {
    for (let tileCol = col - radius; tileCol <= col + radius; tileCol++) {
      if (!isInsideMap(tileRow, tileCol)) continue;
      affectedTiles.push({ row: tileRow, col: tileCol });
    }
  }

  affectedTiles.forEach(({ row: tileRow, col: tileCol }) => {
    if (!heightMap[tileRow]) heightMap[tileRow] = [];
    heightMap[tileRow][tileCol] = targetHeight;
    mapData[tileRow][tileCol] = targetHeight > 0 ? HILL : GROUND;
  });

  enforceLocalSlopeConstraints(row, col, radius + 2, 2, 1);
  reconcileSurfaceTerrainFromHeight(row, col, radius + 2);
  refreshTileArea(scene, row, col);
  if (typeof invalidateOverlayCache === 'function') invalidateOverlayCache();
  return true;
}
