// Trees: the wild forest the terrain generator seeds, the ones players plant with the tree
// tool, their sprites, and the canopy measure scenic value reads. Split out of main.js.

function removeTreesInFootprint(scene, row, col, footprintCols = 1, footprintRows = 1) {
  getFootprintTiles(row, col, footprintCols, footprintRows).forEach(([tileRow, tileCol]) => {
    removeTree(scene, tileRow, tileCol);
  });
}

function clearTreeSprites(scene) {
  scene?.treeSprites?.forEach((sprites) => sprites.forEach((s) => s.destroy()));
  scene?.treeSprites?.clear();
}

function normalizeTreeRecord(tree, row, col) {
  if (!tree) return null;
  const species = TREE_SPECIES.some((entry) => entry.id === tree.species)
    ? tree.species
    : chooseTreeSpeciesForTile(row, col, Math.random()).id;
  const rawCount = Number(tree.count ?? 1);
  return {
    species,
    age: Math.max(0, Math.min(TREE_MATURE_AGE, Math.round(Number(tree.age ?? 0)))),
    variant: Number.isFinite(Number(tree.variant)) ? Number(tree.variant) : Math.random(),
    count: Number.isFinite(rawCount) && rawCount >= 1 ? Math.min(3, Math.round(rawCount)) : 1,
    planted: !!tree.planted,
  };
}

function getTreeSpecies(speciesId) {
  return TREE_SPECIES.find((entry) => entry.id === speciesId) ?? TREE_SPECIES[0];
}

function chooseTreeSpeciesForTile(row, col, randomValue = Math.random()) {
  const hill = mapData[row]?.[col] === HILL;
  const weights = TREE_SPECIES.map((species) => hill ? species.hillWeight : 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let pick = randomValue * total;
  for (let i = 0; i < TREE_SPECIES.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return TREE_SPECIES[i];
  }
  return TREE_SPECIES[TREE_SPECIES.length - 1];
}

function getTreeSpriteKey(tree) {
  const species = getTreeSpecies(tree?.species);
  return (tree?.age ?? 0) >= TREE_MATURE_AGE ? species.tallKey : species.shortKey;
}

function isTreeTerrainEligible(row, col) {
  return isInsideMap(row, col) && (mapData[row][col] === GROUND || mapData[row][col] === HILL);
}

// Where a wild tree may sprout (forest generation and spread, sim-growth.js updateTrees).
function canTreeGrowAt(scene, row, col, blockedTiles = null) {
  if (!isTreeTerrainEligible(row, col)) return false;
  if (treeMap[row]?.[col]) return false;
  return canTreeOccupyAt(scene, row, col, blockedTiles);
}

// Where the player may plant one (the tree tool). A planted tree is street furniture, not
// forest: it may stand beside a road (the wild rule keeps canopies off the tarmac) and on an
// empty zoned lot (placeSpriteBuilding clears it when the lot develops). Everything else -
// water, roads, bridges, buildings, pylons, signs - still says no.
function canPlantTreeAt(scene, row, col) {
  return getTreePlantingBlockReason(scene, row, col) === null;
}

// Why the tree tool refuses a tile, for the hover guide and the toast; null when it may plant.
function getTreePlantingBlockReason(scene, row, col) {
  if (!isInsideMap(row, col)) return 'terrain';
  if (mapData[row][col] === ROAD || roadUnderlayMap[row]?.[col] != null || bridgeMap[row]?.[col]) return 'road';
  if (!isTreeTerrainEligible(row, col)) return 'terrain';
  if (treeMap[row]?.[col]) return 'tree';
  const id = getTileId(row, col);
  if (buildingData[id] || scene?.buildingSprites?.has(id)) return 'building';
  if (typeof hasDistrictSignAt === 'function' && hasDistrictSignAt(row, col)) return 'building';
  if (powerLineSet.has(id)) return 'powerLine';
  return null;
}

// Whether a tree standing at (row, col) may stay there. A player-planted tree (`planted`)
// keeps its roadside or zoned lot; a wild one is culled off both (see canPlantTreeAt).
function canTreeOccupyAt(scene, row, col, blockedTiles = null, { planted = false } = {}) {
  if (!isTreeTerrainEligible(row, col)) return false;
  if (mapData[row]?.[col] === ROAD) return false;
  if (roadUnderlayMap[row]?.[col] != null) return false;
  if (!planted && isAdjacentToRoad(row, col)) return false;
  const id = getTileId(row, col);
  if (!planted && zoneMap[row]?.[col] !== ZONE_NONE) return false;
  if (powerLineSet.has(id)) return false;
  if (bridgeMap[row]?.[col]) return false;
  if (blockedTiles?.has(id)) return false;
  if (buildingData[id]) return false;
  if (scene?.buildingSprites?.has(id)) return false;
  if (typeof hasDistrictSignAt === 'function' && hasDistrictSignAt(row, col)) return false;
  return true;
}

function buildTreeBlockedTilesFromSave(save) {
  const blocked = new Set();

  // Block all road tiles and their 1-tile diagonal buffer from saved mapData.
  // The buffer prevents large tree canopies from visually overlapping road surfaces.
  if (Array.isArray(save?.mapData)) {
    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        if ((save.mapData[row] ?? [])[col] === ROAD) {
          blocked.add(getTileId(row, col));
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = row + dr, nc = col + dc;
              if (isInsideMap(nr, nc)) blocked.add(getTileId(nr, nc));
            }
          }
        }
      }
    }
  }

  // Block building footprints
  Object.entries(save?.buildingData ?? {}).forEach(([id, record]) => {
    const [row, col] = id.split(':').map(Number);
    const footprintCols = record?.footprintCols ?? 1;
    const footprintRows = record?.footprintRows ?? 1;
    getFootprintTiles(row, col, footprintCols, footprintRows).forEach(([tileRow, tileCol]) => {
      if (isInsideMap(tileRow, tileCol)) blocked.add(getTileId(tileRow, tileCol));
    });
  });

  return blocked;
}

function generateForestMap(random) {
  const forestCount = TREE_FOREST_COUNT_MIN +
    Math.floor(random() * (TREE_FOREST_COUNT_MAX - TREE_FOREST_COUNT_MIN + 1));
  const forests = [];
  for (let f = 0; f < forestCount; f++) {
    forests.push({
      row:      random() * MAP_HEIGHT,
      col:      random() * MAP_WIDTH,
      radius:   TREE_FOREST_RADIUS_MIN + random() * (TREE_FOREST_RADIUS_MAX - TREE_FOREST_RADIUS_MIN),
      strength: TREE_FOREST_STRENGTH_MIN + random() * (TREE_FOREST_STRENGTH_MAX - TREE_FOREST_STRENGTH_MIN),
    });
  }

  const weights = createFilledMap(TREE_BASE_DENSITY);
  for (const f of forests) {
    const rMin = Math.max(0, Math.floor(f.row - f.radius));
    const rMax = Math.min(MAP_HEIGHT - 1, Math.ceil(f.row + f.radius));
    const cMin = Math.max(0, Math.floor(f.col - f.radius));
    const cMax = Math.min(MAP_WIDTH - 1, Math.ceil(f.col + f.radius));
    for (let row = rMin; row <= rMax; row++) {
      for (let col = cMin; col <= cMax; col++) {
        const dist = Math.sqrt((row - f.row) ** 2 + (col - f.col) ** 2);
        if (dist < f.radius) {
          const w = f.strength * (1 - dist / f.radius);
          if (w > weights[row][col]) weights[row][col] = w;
        }
      }
    }
  }
  return weights;
}

function generateInitialTrees(scene, blockedTiles = null) {
  const random = createRandom(`${currentSeed}:trees`);
  treeMap = createFilledMap(null);
  const forestWeights = generateForestMap(random);

  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (!canTreeGrowAt(scene, row, col, blockedTiles)) continue;

      const hillMul = mapData[row][col] === HILL ? 1.8 : 1.0;
      const chance = Math.min(forestWeights[row][col] * hillMul, 0.82);
      if (random() >= chance) continue;

      const inForest = forestWeights[row][col] > TREE_BASE_DENSITY * 4;
      const species = chooseTreeSpeciesForTile(row, col, random());
      const r = random();
      treeMap[row][col] = {
        species: species.id,
        age:     Math.floor(random() * (TREE_MATURE_AGE + 1)),
        variant: random(),
        count:   inForest ? (r < 0.70 ? 1 : r < 0.92 ? 2 : 3) : 1,
      };
    }
  }
  if (typeof invalidateTreeSimulationTiles === 'function') invalidateTreeSimulationTiles();
}

function restoreOrGenerateTrees(scene, save) {
  // Regenerate if the save predates the current forest-patch system so that
  // all existing saves get the improved distribution on first load.
  if (save?.treeVersion !== TREE_SYSTEM_VERSION) {
    generateInitialTrees(scene, buildTreeBlockedTilesFromSave(save));
    return;
  }

  treeMap = createFilledMap(null);
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const tree = normalizeTreeRecord(save.treeMap[row]?.[col], row, col);
      treeMap[row][col] = tree && canTreeOccupyAt(scene, row, col, null, { planted: tree.planted }) ? tree : null;
    }
  }
  if (typeof invalidateTreeSimulationTiles === 'function') invalidateTreeSimulationTiles();
}

function rebuildTreeSprites(scene) {
  clearTreeSprites(scene);
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (treeMap[row]?.[col]) placeTreeSprite(scene, row, col);
    }
  }
}

function getTreeSubOffset(count, index, variant) {
  if (count <= 1) return { x: 0, y: 0 };
  const baseAngle = variant * Math.PI * 2;
  const angle = baseAngle + index * (Math.PI * 2 / count);
  const r = count === 2 ? 7 : 5;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r * 0.5 };
}

function placeTreeSprite(scene, row, col) {
  const tree = treeMap[row]?.[col];
  if (!tree || !scene?.treeSprites) return;

  const pos = isoToScreen(col, row);
  const baseOffset = getTreeVisualOffset(tree);
  const elevOffset = getElevationVisualOffset(row, col);
  const count = tree.count ?? 1;
  const baseScale = isMatureTree(tree) ? 0.28 : 0.20;
  const countScale = count === 3 ? 0.82 : count === 2 ? 0.91 : 1.0;
  const scale = baseScale * countScale;
  const sprites = [];

  for (let i = 0; i < count; i++) {
    const sub = getTreeSubOffset(count, i, tree.variant);
    const sx = pos.x + scene.offsetX + baseOffset.x + sub.x;
    const sy = pos.y + scene.offsetY + TILE_PROP_FOOT_OFFSET_Y + elevOffset + baseOffset.y + sub.y;
    const sprite = scene.add.image(sx, sy, getTreeSpriteKey(tree));
    addToRenderLayer(scene, sprite, 'objectLayer');
    sprite.setOrigin(0.5, 1);
    sprite.setScale(scale);
    // Same depth basis as a building, lamp or vehicle on this tile: tile y + TILE_HEIGHT.
    sprite.setDepth(getObjectTileDepth(row, col, pos.y + TILE_HEIGHT + elevOffset + baseOffset.y + sub.y));
    sprite.setMask(scene.worldMask);
    sprite.mapRow = row;
    sprite.mapCol = col;
    sprite.treeSubIndex = i;
    sprite.treeCount = count;
    // Trees and buildings share one depth-sorted display list. Keeping trees on
    // Phaser's default MultiPipeline lets adjacent objects stay in the same
    // WebGL batch; a tree-only pipeline would flush that batch at every switch.
    sprites.push(sprite);
  }

  scene.treeSprites.set(getTileId(row, col), sprites);
  sortRenderLayer(scene, 'objectLayer');
}

function refreshTreeSprite(scene, row, col) {
  const id = getTileId(row, col);
  const existing = scene?.treeSprites?.get(id);
  if (existing) {
    existing.forEach((s) => s.destroy());
    scene.treeSprites.delete(id);
  }
  if (treeMap[row]?.[col]) placeTreeSprite(scene, row, col);
}

function removeTree(scene, row, col) {
  if (!isInsideMap(row, col) || !treeMap[row]?.[col]) return false;
  treeMap[row][col] = null;
  if (typeof invalidateTreeSimulationTiles === 'function') invalidateTreeSimulationTiles();
  if (typeof invalidateOverlayCache === 'function') invalidateOverlayCache();
  const id = getTileId(row, col);
  const sprites = scene?.treeSprites?.get(id);
  if (sprites) {
    sprites.forEach((s) => s.destroy());
    scene.treeSprites.delete(id);
  }
  return true;
}

function placeTree(scene, row, col, options = {}) {
  const planted = !!options.planted;
  if (!(planted ? canPlantTreeAt(scene, row, col) : canTreeGrowAt(scene, row, col))) return false;
  if (options.spend !== false && !spendBudget(COST_TREE)) {
    showToast(t('toast.notEnoughFunds'), 'warning');
    return false;
  }

  const species = options.species
    ? getTreeSpecies(options.species)
    : chooseTreeSpeciesForTile(row, col);
  treeMap[row][col] = {
    species: species.id,
    age: options.age ?? 0,
    variant: Math.random(),
    ...(planted ? { planted: true } : {}),
  };
  if (typeof invalidateTreeSimulationTiles === 'function') invalidateTreeSimulationTiles();
  if (typeof invalidateOverlayCache === 'function') invalidateOverlayCache();
  refreshTreeSprite(scene, row, col);
  return true;
}

function positionTree(scene, sprite) {
  const row = sprite.mapRow;
  const col = sprite.mapCol;
  const pos = isoToScreen(col, row);
  const baseOffset = getTreeVisualOffset(treeMap[row]?.[col]);
  const elevOffset = getElevationVisualOffset(row, col);
  const sub = getTreeSubOffset(sprite.treeCount ?? 1, sprite.treeSubIndex ?? 0, treeMap[row]?.[col]?.variant ?? 0);
  sprite.setPosition(
    pos.x + scene.offsetX + baseOffset.x + sub.x,
    pos.y + scene.offsetY + TILE_PROP_FOOT_OFFSET_Y + elevOffset + baseOffset.y + sub.y,
  );
  sprite.setDepth(getObjectTileDepth(row, col, pos.y + TILE_HEIGHT + elevOffset + baseOffset.y + sub.y));
  sortRenderLayer(scene, 'objectLayer');
}

function getTreeVisualOffset(tree) {
  const variant = Number.isFinite(Number(tree?.variant)) ? Number(tree.variant) : 0.5;
  const xSeed = fract(Math.sin((variant + 0.137) * 12345.678) * 43758.5453);
  const ySeed = fract(Math.sin((variant + 0.731) * 9876.543) * 24634.6345);
  const colShift = (xSeed - 0.5) * 2 * TREE_VISUAL_OFFSET_COL_MAX;
  const rowShift = (ySeed - 0.5) * 2 * TREE_VISUAL_OFFSET_ROW_MAX;

  return {
    x: colShift * (TILE_WIDTH / 2 / 50) - rowShift * (TILE_WIDTH / 2 / 50),
    y: colShift * (TILE_HEIGHT / 2 / 50) + rowShift * (TILE_HEIGHT / 2 / 50),
  };
}

function isMatureTree(tree) {
  return !!tree && (tree.age ?? 0) >= TREE_MATURE_AGE;
}

function getMatureTreeCount() {
  if (typeof getTreeSimulationTiles === 'function') {
    let count = 0;
    for (const [row, col] of getTreeSimulationTiles(activeScene)) {
      if (isMatureTree(treeMap[row]?.[col])) count++;
    }
    return count;
  }

  let count = 0;
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (isMatureTree(treeMap[row]?.[col])) count++;
    }
  }
  return count;
}

function getTreeInfluenceValue(row, col, radius = TREE_CANOPY_RADIUS) {
  let score = 0;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const r = row + dr;
      const c = col + dc;
      if (!isInsideMap(r, c)) continue;
      const tree = treeMap[r]?.[c];
      if (!tree) continue;
      const dist = Math.abs(dr) + Math.abs(dc);
      if (dist > radius) continue;
      const maturity = isMatureTree(tree) ? 1 : 0.45;
      score += maturity * (1 - dist / Math.max(1, radius + 1));
    }
  }
  return clamp(score / 4, 0, 1);
}

function computeTreeCanopyMap(radius = TREE_CANOPY_RADIUS) {
  const map = createFilledMap(0);
  const treeTiles = typeof getTreeSimulationTiles === 'function'
    ? getTreeSimulationTiles(activeScene)
    : null;
  const tiles = treeTiles ?? (() => {
    const all = [];
    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        if (treeMap[row]?.[col]) all.push([row, col]);
      }
    }
    return all;
  })();

  for (const [row, col] of tiles) {
    const tree = treeMap[row]?.[col];
    if (!tree) continue;
    const strength = isMatureTree(tree) ? 1 : 0.45;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (!isInsideMap(r, c)) continue;
        const dist = Math.abs(dr) + Math.abs(dc);
        if (dist > radius) continue;
        map[r][c] = Math.min(1, map[r][c] + strength * (1 - dist / Math.max(1, radius + 1)) / 4);
      }
    }
  }
  return map;
}
