// Bare land: the dirt clusters scattered over large flat grass, and the derelict debris
// (dumped vehicles, container piles) that dot dirt tiles. Split out of main.js.

// ── Bare land: dirt clusters + derelict debris ────────────────────────────────
// Two layers, both purely decorative (no simulation effect, mirroring trees):
// 1. Dirt clusters - large flat grass (GROUND) regions get a few irregular
//    dirt (DIRT) patches instead of being uniform grass, via scatterDirtClusters
//    (fresh world generation, operates on the plain terrain/heights arrays
//    before a scene exists) and scatterBareLandDirtClusters (a one-time
//    retrofit for saves from before this feature existed, operating on the
//    live map/zone/building state).
// 2. Debris - dirt tiles only (dirt never grows trees, see
//    isTreeTerrainEligible) get a flat 30% chance of one derelict prop
//    (dumped vehicle or shipping-container pile), randomly offset within the
//    tile like trees, via generateInitialDebris/restoreOrGenerateDebris.

function getBareLandDebrisKind(id) {
  return BARE_LAND_DEBRIS_KINDS.find((kind) => kind.id === id) ?? BARE_LAND_DEBRIS_KINDS[0];
}

function chooseBareLandDebrisKind(randomValue = Math.random()) {
  const total = BARE_LAND_DEBRIS_KINDS.reduce((sum, kind) => sum + kind.weight, 0);
  let pick = randomValue * total;
  for (const kind of BARE_LAND_DEBRIS_KINDS) {
    pick -= kind.weight;
    if (pick <= 0) return kind;
  }
  return BARE_LAND_DEBRIS_KINDS[BARE_LAND_DEBRIS_KINDS.length - 1];
}

function getDebrisSpriteKey(debris) {
  return getBareLandDebrisKind(debris?.kind).key;
}

function isDirtTerrainEligible(row, col) {
  return isInsideMap(row, col) && mapData[row][col] === DIRT;
}

// Debris art is chunky (full vehicles/container piles) and anchored at its
// tile's front-bottom corner, so a piece sitting right at a dirt patch's edge
// visually overhangs onto whatever neighbouring terrain is there (grass,
// water, road) even though its own tile is correctly dirt - same class of
// problem isAdjacentToRoad already solves for tree canopies. Requiring every
// neighbour to also be dirt keeps debris comfortably inside the patch.
function isAdjacentToNonDirtTerrain(row, col) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr, nc = col + dc;
      if (!isInsideMap(nr, nc)) return true;
      if (mapData[nr]?.[nc] !== DIRT) return true;
    }
  }
  return false;
}

function canDebrisOccupyAt(scene, row, col, blockedTiles = null) {
  if (!isDirtTerrainEligible(row, col)) return false;
  if (isAdjacentToNonDirtTerrain(row, col)) return false;
  const id = getTileId(row, col);
  if (zoneMap[row]?.[col] !== ZONE_NONE) return false;
  if (powerLineSet.has(id)) return false;
  if (bridgeMap[row]?.[col]) return false;
  if (blockedTiles?.has(id)) return false;
  if (buildingData[id]) return false;
  if (scene?.buildingSprites?.has(id)) return false;
  if (typeof hasDistrictSignAt === 'function' && hasDistrictSignAt(row, col)) return false;
  return true;
}

function canDebrisGrowAt(scene, row, col, blockedTiles = null) {
  if (debrisMap[row]?.[col]) return false;
  return canDebrisOccupyAt(scene, row, col, blockedTiles);
}

// Debris only ever spawns when every neighbour of its tile is also DIRT (see
// isAdjacentToNonDirtTerrain) - that invariant is only checked once, at spawn time.
// Editing a NEIGHBOUR's terrain (eg. painting it to water) doesn't touch the debris
// tile itself, so nothing previously re-validated it: a lone DIRT tile could be left
// surrounded by water with its derelict-vehicle/container prop still there, visually
// overhanging onto the water around it. Call this on every tile whose type just
// changed so its 8 neighbours get re-checked, not just the edited tile.
function invalidateOrphanedNeighborDebris(scene, row, col) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (!isInsideMap(nr, nc)) continue;
      if (!debrisMap[nr]?.[nc]) continue;
      if (mapData[nr][nc] === DIRT && isAdjacentToNonDirtTerrain(nr, nc)) {
        removeDebris(scene, nr, nc);
      }
    }
  }
}

// Same per-tile pseudo-random jitter technique as getTreeVisualOffset, just
// with a wider max offset since debris art is chunkier than a tree canopy.
function getDebrisVisualOffset(debris) {
  const variant = Number.isFinite(Number(debris?.variant)) ? Number(debris.variant) : 0.5;
  const xSeed = fract(Math.sin((variant + 0.271) * 15485.863) * 41421.356);
  const ySeed = fract(Math.sin((variant + 0.911) * 8233.171) * 17161.412);
  const colShift = (xSeed - 0.5) * 2 * BARE_LAND_DEBRIS_VISUAL_OFFSET_COL_MAX;
  const rowShift = (ySeed - 0.5) * 2 * BARE_LAND_DEBRIS_VISUAL_OFFSET_ROW_MAX;
  return {
    x: colShift * (TILE_WIDTH / 2 / 50) - rowShift * (TILE_WIDTH / 2 / 50),
    y: colShift * (TILE_HEIGHT / 2 / 50) + rowShift * (TILE_HEIGHT / 2 / 50),
  };
}

function generateInitialDebris(scene, blockedTiles = null) {
  const random = createRandom(`${currentSeed}:debris`);
  debrisMap = createFilledMap(null);
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (!canDebrisGrowAt(scene, row, col, blockedTiles)) continue;
      if (random() >= BARE_LAND_DEBRIS_SPAWN_CHANCE) continue;
      debrisMap[row][col] = {
        kind: chooseBareLandDebrisKind(random()).id,
        variant: random(),
      };
    }
  }
  if (typeof invalidateDebrisSimulationTiles === 'function') invalidateDebrisSimulationTiles();
}

function placeDebrisSprite(scene, row, col) {
  const debris = debrisMap[row]?.[col];
  if (!debris || !scene?.debrisSprites) return;

  const kind = getBareLandDebrisKind(debris.kind);
  const sprite = scene.add.image(0, 0, kind.key);
  addToRenderLayer(scene, sprite, 'objectLayer');
  sprite.setOrigin(0.5, 1);
  sprite.setScale(kind.scale);
  sprite.setMask(scene.worldMask);
  sprite.mapRow = row;
  sprite.mapCol = col;
  positionDebrisSprite(scene, sprite);
  scene.debrisSprites.set(getTileId(row, col), sprite);
  scene.terrainViewportCacheKey = null;
  sortRenderLayer(scene, 'objectLayer');
}

// Screen position and depth from the debris tile; re-run on rotation and window resize
// (positionAllTiles) like every other sprite anchored to a tile.
function positionDebrisSprite(scene, sprite) {
  const row = sprite.mapRow;
  const col = sprite.mapCol;
  const debris = debrisMap[row]?.[col];
  if (!debris) return;
  const pos = isoToScreen(col, row);
  const baseOffset = getDebrisVisualOffset(debris);
  const elevOffset = getElevationVisualOffset(row, col);
  sprite.setPosition(
    pos.x + scene.offsetX + baseOffset.x,
    pos.y + scene.offsetY + TILE_PROP_FOOT_OFFSET_Y + elevOffset + baseOffset.y,
  );
  sprite.setDepth(getObjectTileDepth(row, col, pos.y + TILE_HEIGHT + elevOffset + baseOffset.y));
}

function refreshDebrisSprite(scene, row, col) {
  const id = getTileId(row, col);
  const existing = scene?.debrisSprites?.get(id);
  if (existing) {
    existing.destroy();
    scene.debrisSprites.delete(id);
  }
  if (debrisMap[row]?.[col]) placeDebrisSprite(scene, row, col);
}

function removeDebris(scene, row, col) {
  if (!isInsideMap(row, col) || !debrisMap[row]?.[col]) return false;
  debrisMap[row][col] = null;
  if (typeof invalidateDebrisSimulationTiles === 'function') invalidateDebrisSimulationTiles();
  const id = getTileId(row, col);
  const sprite = scene?.debrisSprites?.get(id);
  if (sprite) {
    sprite.destroy();
    scene.debrisSprites.delete(id);
  }
  return true;
}

function removeDebrisInFootprint(scene, row, col, footprintCols = 1, footprintRows = 1) {
  getFootprintTiles(row, col, footprintCols, footprintRows).forEach(([tileRow, tileCol]) => {
    removeDebris(scene, tileRow, tileCol);
  });
}

function rebuildDebrisSprites(scene) {
  scene?.debrisSprites?.forEach((sprite) => sprite.destroy());
  scene?.debrisSprites?.clear();
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (debrisMap[row]?.[col]) placeDebrisSprite(scene, row, col);
    }
  }
}

function normalizeDebrisRecord(debris) {
  if (!debris || typeof debris !== 'object') return null;
  if (!BARE_LAND_DEBRIS_KINDS.some((kind) => kind.id === debris.kind)) return null;
  const variant = Number(debris.variant);
  if (!Number.isFinite(variant) || variant < 0 || variant > 1) return null;
  return { kind: debris.kind, variant };
}

function restoreOrGenerateDebris(scene, save) {
  // Same "regenerate on old saves" pattern as restoreOrGenerateTrees: a save
  // from before this feature (or one that predates a dirt-cluster retrofit
  // that just ran) has no debrisMap worth trusting, so seed it fresh instead.
  if (save?.bareLandVersion !== BARE_LAND_VERSION || !save?.debrisMap) {
    generateInitialDebris(scene);
    return;
  }

  debrisMap = createFilledMap(null);
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const debris = normalizeDebrisRecord(save.debrisMap[row]?.[col]);
      debrisMap[row][col] = debris && canDebrisOccupyAt(scene, row, col) ? debris : null;
    }
  }
  if (typeof invalidateDebrisSimulationTiles === 'function') invalidateDebrisSimulationTiles();
}

// Fresh world generation: operates on the plain terrain/heights arrays built
// by generateRealisticTerrainMap, before any scene/zone/building state exists,
// so eligibility here is just "still flat grass" - the live retrofit below
// additionally has to respect zoning/buildings/roads on an existing city.
function scatterDirtClusters(terrain, heights, random) {
  const visited = createNumericMap(false);
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (visited[row][col] || terrain[row][col] !== GROUND) continue;
      const stack = [[row, col]];
      const cells = [];
      visited[row][col] = true;
      while (stack.length > 0) {
        const [r, c] = stack.pop();
        cells.push([r, c]);
        [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nr, nc]) => {
          if (!isInsideMap(nr, nc) || visited[nr][nc] || terrain[nr][nc] !== GROUND) return;
          visited[nr][nc] = true;
          stack.push([nr, nc]);
        });
      }
      if (cells.length < BARE_LAND_DIRT_CLUSTER_MIN_REGION_TILES) continue;

      const clusterCount = Math.max(1, Math.floor(cells.length / BARE_LAND_DIRT_CLUSTER_TILES_PER_CLUSTER));
      for (let i = 0; i < clusterCount; i++) {
        const [cr, cc] = cells[Math.floor(random() * cells.length)];
        paintDirtClusterBlob(terrain, cr, cc, random, (r, c) => terrain[r]?.[c] === GROUND);
      }
    }
  }
}

// Shared blob painter for both the world-gen and live-retrofit dirt-cluster
// passes: an irregular (not perfectly circular) patch, feathered at the edge
// so it reads as a natural bare patch rather than a stamped disc.
function paintDirtClusterBlob(terrain, centerRow, centerCol, random, isEligible) {
  const radius = BARE_LAND_DIRT_CLUSTER_RADIUS_MIN
    + random() * (BARE_LAND_DIRT_CLUSTER_RADIUS_MAX - BARE_LAND_DIRT_CLUSTER_RADIUS_MIN);
  const span = Math.ceil(radius);
  for (let dr = -span; dr <= span; dr++) {
    for (let dc = -span; dc <= span; dc++) {
      const row = centerRow + dr;
      const col = centerCol + dc;
      if (!isEligible(row, col)) continue;
      const dist = Math.hypot(dr, dc);
      if (dist > radius) continue;
      if (dist > radius * 0.6 && random() < (dist - radius * 0.6) / (radius * 0.4)) continue;
      terrain[row][col] = DIRT;
    }
  }
}

// One-time retrofit for saves from before this feature: scatters the same
// kind of dirt clusters, but only ever onto tiles that are genuinely vacant
// right now (unzoned, unbuilt, no bridge/power line/district sign, no
// existing tree - trees are never bulldozed to make room for a bare patch).
function scatterBareLandDirtClusters(scene) {
  const random = createRandom(`${currentSeed}:bareLandRetrofit`);
  const isEligible = (row, col) => (
    isInsideMap(row, col)
    && mapData[row][col] === GROUND
    && zoneMap[row]?.[col] === ZONE_NONE
    && !bridgeMap[row]?.[col]
    && !powerLineSet.has(getTileId(row, col))
    && roadUnderlayMap[row]?.[col] == null
    && !buildingData[getTileId(row, col)]
    && !scene?.buildingSprites?.has(getTileId(row, col))
    && !treeMap[row]?.[col]
    && !(typeof hasDistrictSignAt === 'function' && hasDistrictSignAt(row, col))
  );

  const visited = createNumericMap(false);
  let changed = false;
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (visited[row][col] || !isEligible(row, col)) continue;
      const stack = [[row, col]];
      const cells = [];
      visited[row][col] = true;
      while (stack.length > 0) {
        const [r, c] = stack.pop();
        cells.push([r, c]);
        [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nr, nc]) => {
          if (!isInsideMap(nr, nc) || visited[nr][nc] || !isEligible(nr, nc)) return;
          visited[nr][nc] = true;
          stack.push([nr, nc]);
        });
      }
      if (cells.length < BARE_LAND_DIRT_CLUSTER_MIN_REGION_TILES) continue;

      const clusterCount = Math.max(1, Math.floor(cells.length / BARE_LAND_DIRT_CLUSTER_TILES_PER_CLUSTER));
      for (let i = 0; i < clusterCount; i++) {
        const [cr, cc] = cells[Math.floor(random() * cells.length)];
        paintDirtClusterBlob(mapData, cr, cc, random, isEligible);
        changed = true;
      }
    }
  }
  if (changed) {
    if (typeof invalidateZoneGrowthTileCache === 'function') invalidateZoneGrowthTileCache();
    if (typeof invalidateOverlayCache === 'function') invalidateOverlayCache();
  }
  return changed;
}
