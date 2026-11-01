// Terrain helpers shared by every map source - the slope and hill-shape rules the hill art
// needs, the finishing pass that applies them, and the seeded random - plus the world-map
// wrappers that generate a new city's terrain with the 原創地形 generator (terrain-original.js).
// The old procedural generator (straight rivers, table-top mountains, dirt dots) is gone; see
// docs/terrain-generator-v2-design.md.

// Profile names older saves and saved maps may carry, mapped to the nearest landform.
const LEGACY_TERRAIN_PROFILE_LANDFORMS = Object.freeze({
  default: 'hk-any', district: 'hk-any', custom: 'hk-any',
  island: 'hk-islands', harbor: 'hk-harbour', mountain: 'hk-hillside', plain: 'hk-plain',
  river: 'hk-valley', basin: 'hk-valley', lake: 'hk-valley', plateau: 'hk-hillside', desert: 'hk-plain',
});

function generateTerrainMap(seed) {
  return generateTerrainMapByProfile('hk-any', seed);
}

// The live world's terrain: commits the height map and metadata with the tiles it returns.
function generateTerrainMapByProfile(profileType, seed) {
  let generated;
  if (profileType === 'flat') {
    generated = { mapData: createFilledMap(GROUND), heightMap: createFilledMap(0), profileType: 'flat', seed, features: ['flat'] };
  } else {
    const landform = LEGACY_TERRAIN_PROFILE_LANDFORMS[profileType] ?? profileType;
    generated = generateOriginalTerrain(landform, seed);
  }
  commitGeneratedTerrainState(generated);
  return generated.mapData;
}

function commitGeneratedTerrainState(generated) {
  heightMap = generated.heightMap;
  currentTerrainMetadata = {
    generatorVersion: generated.generatorVersion ?? 4,
    profileType: generated.profileType,
    seed: generated.seed,
    features: generated.features ?? [],
  };
}

// The slope and hill-shape rules, in the order every map source finishes with: no stray
// specks, no slope steeper than one level a tile, no hill shape the art cannot draw.
function finishHkTerrain(mapRows, heightRows) {
  removeTinyTerrainComponents(mapRows, heightRows, WATER, 6, GROUND);
  removeTinyTerrainComponents(mapRows, heightRows, HILL, 4, GROUND);
  enforceGlobalSlopeConstraints(mapRows, heightRows, 1, 24);
  normalizeUnsupportedHillTopologiesGlobal(mapRows, heightRows, 3);
  enforceGlobalSlopeConstraints(mapRows, heightRows, 1, 4);
  quantizeHillHeights(mapRows, heightRows);
}

function createNumericMap(value) {
  return Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(value));
}

function removeTinyTerrainComponents(terrain, heights, tileType, minSize, replacement) {
  const visited = createNumericMap(false);
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (visited[row][col] || terrain[row][col] !== tileType) continue;
      const stack = [[row, col]];
      const cells = [];
      visited[row][col] = true;
      while (stack.length > 0) {
        const [r, c] = stack.pop();
        cells.push([r, c]);
        [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nr, nc]) => {
          if (!isInsideMap(nr, nc) || visited[nr][nc] || terrain[nr][nc] !== tileType) return;
          visited[nr][nc] = true;
          stack.push([nr, nc]);
        });
      }
      if (cells.length < minSize) {
        cells.forEach(([r, c]) => {
          terrain[r][c] = replacement;
          heights[r][c] = 0;
        });
      }
    }
  }
}

function quantizeHillHeights(terrain, heights) {
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (terrain[row][col] !== HILL) {
        heights[row][col] = 0;
        continue;
      }
      heights[row][col] = Math.max(1, Math.min(MAX_TERRAIN_HEIGHT, Math.round(heights[row][col])));
    }
  }
}

function enforceGlobalSlopeConstraints(terrain, heights, maxDelta = 1, passes = 1) {
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        if (terrain[row][col] !== HILL) {
          heights[row][col] = 0;
          continue;
        }

        const current = heights[row][col];
        const neighbors = [
          [row - 1, col],
          [row + 1, col],
          [row, col - 1],
          [row, col + 1],
        ];

        neighbors.forEach(([nr, nc]) => {
          if (!isInsideMap(nr, nc)) return;
          const neighbor = heights[nr][nc];
          const delta = current - neighbor;
          if (delta > maxDelta) {
            heights[row][col] = neighbor + maxDelta;
            changed = true;
          }
        });

        heights[row][col] = Math.max(1, Math.min(MAX_TERRAIN_HEIGHT, heights[row][col]));
      }
    }

    if (!changed) break;
  }
}

function enforceLocalSlopeConstraints(centerRow, centerCol, radius = 2, passes = 1, maxDelta = 1) {
  for (let pass = 0; pass < passes; pass++) {
    for (let row = centerRow - radius; row <= centerRow + radius; row++) {
      for (let col = centerCol - radius; col <= centerCol + radius; col++) {
        if (!isInsideMap(row, col)) continue;

        if (mapData[row][col] !== HILL) {
          if (mapData[row][col] === ROAD) continue;
          heightMap[row][col] = 0;
          continue;
        }

        const current = getTileHeight(row, col);
        const neighbors = [
          [row - 1, col],
          [row + 1, col],
          [row, col - 1],
          [row, col + 1],
        ];

        let clamped = current;
        neighbors.forEach(([nr, nc]) => {
          if (!isInsideMap(nr, nc)) return;
          if (mapData[nr][nc] !== HILL) return;
          const neighborHeight = getTileHeight(nr, nc);
          if (clamped > neighborHeight + maxDelta) {
            clamped = neighborHeight + maxDelta;
          }
        });

        heightMap[row][col] = Math.max(1, Math.min(MAX_TERRAIN_HEIGHT, clamped));
      }
    }
  }
}

function normalizeUnsupportedHillTopologiesGlobal(terrain, heights, passes = 1) {
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        if (terrain[row][col] !== HILL) continue;
        const current = heights[row][col];
        if (current <= 0) continue;

        // Outside the map is level with the edge tile, as the renderer treats it (tile-keys.js).
        const neighbors = [
          row > 0 ? heights[row - 1][col] : current,
          col < MAP_WIDTH - 1 ? heights[row][col + 1] : current,
          row < MAP_HEIGHT - 1 ? heights[row + 1][col] : current,
          col > 0 ? heights[row][col - 1] : current,
        ];

        const lowerDirs = ['n', 'e', 's', 'w'].filter((dir, index) => neighbors[index] < current);
        const hasOppositePair = (lowerDirs.length === 2) && areOppositeDirs(lowerDirs[0], lowerDirs[1]);

        if (lowerDirs.length >= 3 || hasOppositePair) {
          // Step down gradually instead of snapping to neighbor max,
          // which tends to create large flat "table" plateaus.
          const target = Math.max(1, current - 1);
          if (target < current) {
            heights[row][col] = target;
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
}

function normalizeUnsupportedHillTopologiesLocal(centerRow, centerCol, radius = 2, passes = 1) {
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    for (let row = centerRow - radius; row <= centerRow + radius; row++) {
      for (let col = centerCol - radius; col <= centerCol + radius; col++) {
        if (!isInsideMap(row, col)) continue;
        if (mapData[row][col] !== HILL) continue;
        const current = getTileHeight(row, col);
        if (current <= 0) continue;

        const neighbors = [
          row > 0 ? (mapData[row - 1][col] === HILL ? getTileHeight(row - 1, col) : null) : null,
          col < MAP_WIDTH - 1 ? (mapData[row][col + 1] === HILL ? getTileHeight(row, col + 1) : null) : null,
          row < MAP_HEIGHT - 1 ? (mapData[row + 1][col] === HILL ? getTileHeight(row + 1, col) : null) : null,
          col > 0 ? (mapData[row][col - 1] === HILL ? getTileHeight(row, col - 1) : null) : null,
        ];

        const lowerDirs = ['n', 'e', 's', 'w'].filter((dir, index) => neighbors[index] !== null && neighbors[index] < current);
        const hasOppositePair = (lowerDirs.length === 2) && areOppositeDirs(lowerDirs[0], lowerDirs[1]);

        if (lowerDirs.length >= 3 || hasOppositePair) {
          // Keep local editing behavior consistent with world generation:
          // reduce one level per pass to avoid abrupt flat rims.
          const target = Math.max(1, current - 1);
          if (target < current) {
            heightMap[row][col] = target;
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function createRandom(seedText) {
  const seedString = String(seedText ?? '');
  let hash = 2166136261;
  for (let index = 0; index < seedString.length; index++) {
    hash ^= seedString.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  let state = hash >>> 0;
  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  random.seed = state;
  return random;
}
