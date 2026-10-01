// Terrain generation: the seeded random maps a new city starts from - height fields,
// coasts, ridges, rivers, beaches and the slope rules hills must obey - plus the seeded
// random and noise helpers it is built on. Split out of main.js.

// ── Terrain generation ────────────────────────────────────────────────────────

const REALISTIC_TERRAIN_PROFILES = {
  default: {
    seaLevel: 0.28, baseElevation: 0.44, relief: 0.9, ridgeCount: 2, riverCount: 2,
    coastMode: 'edgeSea', buildableBias: 0.52, dryness: 0.22, erosionPasses: 2,
  },
  island: {
    seaLevel: 0.38, baseElevation: 0.16, relief: 0.82, ridgeCount: 2, riverCount: 2,
    coastMode: 'island', buildableBias: 0.28, dryness: 0.18, erosionPasses: 2,
  },
  harbor: {
    seaLevel: 0.34, baseElevation: 0.44, relief: 0.82, ridgeCount: 2, riverCount: 2,
    coastMode: 'harbor', buildableBias: 0.42, dryness: 0.18, erosionPasses: 2, harborMouthWidth: 34,
  },
  mountain: {
    seaLevel: 0.18, baseElevation: 0.56, relief: 1.55, ridgeCount: 4, riverCount: 3,
    coastMode: 'edgeSea', buildableBias: 0.24, dryness: 0.16, erosionPasses: 3,
  },
  desert: {
    seaLevel: 0.08, baseElevation: 0.32, relief: 0.7, ridgeCount: 2, riverCount: 1,
    coastMode: 'none', buildableBias: 0.38, dryness: 0.86, erosionPasses: 1,
  },
  plain: {
    seaLevel: 0.16, baseElevation: 0.30, relief: 0.42, ridgeCount: 1, riverCount: 2,
    coastMode: 'edgeSea', buildableBias: 0.62, dryness: 0.20, erosionPasses: 1,
  },
  lake: {
    seaLevel: 0.16, baseElevation: 0.40, relief: 0.75, ridgeCount: 2, riverCount: 2,
    coastMode: 'lake', buildableBias: 0.42, dryness: 0.12, erosionPasses: 2,
  },
  river: {
    seaLevel: 0.12, baseElevation: 0.42, relief: 0.75, ridgeCount: 2, riverCount: 4,
    coastMode: 'none', buildableBias: 0.52, dryness: 0.16, erosionPasses: 2,
  },
  plateau: {
    seaLevel: 0.10, baseElevation: 0.54, relief: 1.05, ridgeCount: 2, riverCount: 2,
    coastMode: 'none', buildableBias: 0.32, dryness: 0.34, erosionPasses: 2,
  },
  basin: {
    seaLevel: 0.20, baseElevation: 0.32, relief: 1.0, ridgeCount: 3, riverCount: 2,
    coastMode: 'basin', buildableBias: 0.38, dryness: 0.18, erosionPasses: 2,
  },
  flat: {
    seaLevel: -1, baseElevation: 0, relief: 0, ridgeCount: 0, riverCount: 0,
    coastMode: 'none', buildableBias: 1, dryness: 0, erosionPasses: 0,
  },
};

function generateTerrainMap(seed) {
  const generated = generateRealisticTerrainMap('default', seed);
  commitGeneratedTerrainState(generated);
  return generated.mapData;
}

function generateTerrainMapByProfile(profileType, seed) {
  const generated = generateRealisticTerrainMap(profileType, seed);
  commitGeneratedTerrainState(generated);
  return generated.mapData;
}

function commitGeneratedTerrainState(generated) {
  heightMap = generated.heightMap;
  currentTerrainMetadata = generated.metadata;
}

function generateRealisticTerrainMap(profileType = 'default', seed, options = {}) {
  const requestedProfile = REALISTIC_TERRAIN_PROFILES[profileType] ? profileType : 'default';
  const config = { ...REALISTIC_TERRAIN_PROFILES[requestedProfile], ...options };
  const random = createRandom(seed);

  if (requestedProfile === 'flat') {
    const terrain = createFilledMap(GROUND);
    const heights = createFilledMap(0);
    const metadata = { generatorVersion: 2, profileType: requestedProfile, seed, features: ['flat'] };
    return {
      mapData: terrain,
      heightMap: heights,
      metadata,
    };
  }

  const field = createNumericMap(0);
  const masks = createTerrainMasks();
  const metadata = {
    generatorVersion: 2,
    profileType: requestedProfile,
    seed,
    features: [],
  };

  buildBaseHeightField(field, config, requestedProfile, random);
  applyCoastModel(field, masks, config, requestedProfile, random, metadata);
  const ridges = generateRidgeNetwork(config, requestedProfile, random);
  applyRidgeNetwork(field, ridges, config, requestedProfile, metadata);
  applyProfileLandform(field, masks, config, requestedProfile, random, metadata);
  routeRiverNetwork(field, masks, config, requestedProfile, random, metadata);
  smoothWaterMasks(field, masks, config, requestedProfile);
  erodeFieldAlongDrainage(field, masks, config);

  const { terrain, heights } = classifyTerrain(field, masks, config, requestedProfile, random);
  cleanupTerrainComponents(terrain, heights, requestedProfile);
  addBeachesBySlope(terrain, heights, field, config);
  scatterDirtClusters(terrain, heights, random);
  smoothHillHeights(terrain, heights, Math.min(2, config.erosionPasses + 1));
  enforceGlobalSlopeConstraints(terrain, heights, 1, 4);
  quantizeHillHeights(terrain, heights);
  normalizeUnsupportedHillTopologiesGlobal(terrain, heights, 3);
  enforceGlobalSlopeConstraints(terrain, heights, 1, 2);
  quantizeHillHeights(terrain, heights);
  flattenMapBorder(terrain, heights, 3);

  return { mapData: terrain, heightMap: heights, metadata };
}

function createNumericMap(value) {
  return Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(value));
}

function createTerrainMasks() {
  return {
    water: createNumericMap(false),
    river: createNumericMap(false),
    lake: createNumericMap(false),
    beach: createNumericMap(false),
    dirt: createNumericMap(false),
  };
}

function buildBaseHeightField(field, config, profileType, random) {
  const coastEdge = Math.floor(random() * 4);
  config._coastEdge = coastEdge;

  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const nx = col / (MAP_WIDTH - 1);
      const ny = row / (MAP_HEIGHT - 1);
      const broad = valueNoise(col * 0.007, row * 0.007, random);
      const medium = valueNoise(col * 0.018 + 41, row * 0.018 - 29, random);
      const detail = valueNoise(col * 0.042 + 90, row * 0.042 - 40, random);
      let gradient = 0;

      if (profileType === 'mountain') gradient = (1 - nx) * 0.45 + (1 - ny) * 0.25;
      else if (profileType === 'plain') gradient = (1 - ny) * 0.12;
      else if (profileType === 'river') gradient = (1 - nx) * 0.18 + (1 - ny) * 0.10;
      else if (profileType === 'desert') gradient = (nx - 0.5) * 0.12;
      else if (profileType === 'plateau') gradient = 0.20 + (1 - ny) * 0.12;

      field[row][col] = config.baseElevation
        + (broad - 0.5) * config.relief * 0.82
        + (medium - 0.5) * config.relief * 0.28
        + (detail - 0.5) * config.relief * 0.14
        + gradient;
    }
  }
}

function applyCoastModel(field, masks, config, profileType, random, metadata) {
  if (config.coastMode === 'none') return;

  if (config.coastMode === 'edgeSea') {
    const edge = config._coastEdge ?? 1;
    const coastLine = Array.from({ length: Math.max(MAP_WIDTH, MAP_HEIGHT) }, (_, along) => (
      20
      + valueNoise(along * 0.025, 20 + along * 0.006, random) * 36
      + Math.max(0, valueNoise(along * 0.011 + 60, along * 0.014 - 20, random) - 0.58) * 72
    ));
    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        const along = edge < 2 ? row : col;
        const inward = edge === 0 ? row
          : edge === 1 ? MAP_WIDTH - 1 - col
            : edge === 2 ? MAP_HEIGHT - 1 - row
              : col;
        const coast = coastLine[along];
        if (inward < coast) {
          masks.water[row][col] = true;
          field[row][col] = Math.min(field[row][col], config.seaLevel - 0.18);
        } else if (inward < coast + 14) {
          field[row][col] -= (1 - (inward - coast) / 14) * 0.18;
        }
      }
    }
    metadata.features.push('coast');
    return;
  }

  if (config.coastMode === 'island') {
    applyIslandCoast(field, masks, config, random, metadata);
    return;
  }

  if (config.coastMode === 'harbor') {
    applyHarborCoast(field, masks, config, random, metadata);
    return;
  }

  if (config.coastMode === 'lake') {
    applyLakeBasin(field, masks, config, random, metadata);
    return;
  }

  if (config.coastMode === 'basin') {
    applyBasinRim(field, masks, config, random, metadata);
  }
}

function applyIslandCoast(field, masks, config, random, metadata) {
  const spines = generateIslandSpines(random);
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const warpRow = row + (valueNoise(col * 0.016 + 7, row * 0.016 - 11, random) - 0.5) * 22;
      const warpCol = col + (valueNoise(col * 0.016 - 13, row * 0.016 + 17, random) - 0.5) * 22;
      let land = -0.35;
      spines.forEach((spine, index) => {
        const d = distanceToPolyline(warpRow, warpCol, spine.points);
        const width = spine.width * (index === 0 ? 1 : 0.72);
        land = Math.max(land, 1.05 - d / width);
      });
      land += (valueNoise(col * 0.018, row * 0.018, random) - 0.5) * 0.55;
      if (land < 0) {
        masks.water[row][col] = true;
        field[row][col] = config.seaLevel - 0.25;
      } else {
        field[row][col] += land * 0.75;
      }
    }
  }
  metadata.features.push('island-chain');
}

function generateIslandSpines(random) {
  const spines = [];
  const mainStart = { row: 60 + random() * 40, col: 24 + random() * 32 };
  const mainEnd = { row: 160 + random() * 42, col: 196 + random() * 30 };
  spines.push({
    width: 46 + random() * 22,
    points: makeMeanderingPolyline(mainStart, mainEnd, random, 6, 34),
  });
  const count = 2 + Math.floor(random() * 4);
  for (let i = 0; i < count; i++) {
    const anchor = spines[0].points[1 + Math.floor(random() * (spines[0].points.length - 2))];
    const angle = random() * Math.PI * 2;
    const len = 36 + random() * 56;
    const end = {
      row: Math.max(22, Math.min(MAP_HEIGHT - 22, anchor.row + Math.sin(angle) * len)),
      col: Math.max(22, Math.min(MAP_WIDTH - 22, anchor.col + Math.cos(angle) * len)),
    };
    spines.push({
      width: 17 + random() * 18,
      points: makeMeanderingPolyline(anchor, end, random, 4, 18),
    });
  }
  return spines;
}

function applyHarborCoast(field, masks, config, random, metadata) {
  const edge = Math.floor(random() * 4);
  config._coastEdge = edge;
  const mouthCenter = 104 + random() * 48;
  const bayDepth = 108 + random() * 44;
  const mouthWidth = config.harborMouthWidth ?? 34;

  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const coords = edgeRelativeCoords(row, col, edge);
      const along = coords.along;
      const inward = coords.inward;
      const bayCurve = mouthCenter
        + Math.sin(inward * 0.035) * 24
        + (valueNoise(inward * 0.025, along * 0.014, random) - 0.5) * 34;
      const widening = mouthWidth + Math.sin(Math.min(1, inward / bayDepth) * Math.PI) * 58;
      const openSea = inward < 14 + valueNoise(along * 0.03, 7, random) * 20;
      const bay = inward < bayDepth && Math.abs(along - bayCurve) < widening;
      const innerHarbor = inward > bayDepth * 0.42 && inward < bayDepth * 0.92 && Math.abs(along - bayCurve) < widening * 1.16;
      if (openSea || bay || innerHarbor) {
        masks.water[row][col] = true;
        field[row][col] = config.seaLevel - (openSea ? 0.32 : 0.20);
      } else {
        const shoreDist = Math.abs(along - bayCurve) - widening;
        if (shoreDist > 0 && shoreDist < 20 && inward < bayDepth + 28) {
          field[row][col] -= (1 - shoreDist / 20) * 0.16;
        }
      }
    }
  }

  addHarborHeadlands(field, masks, edge, mouthCenter, bayDepth, random);
  metadata.features.push('natural-harbor', 'headlands');
}

function addHarborHeadlands(field, masks, edge, mouthCenter, bayDepth, random) {
  const headlandOffsets = [-1, 1];
  headlandOffsets.forEach((side) => {
    const points = [];
    for (let i = 0; i < 5; i++) {
      const inward = 22 + i * (bayDepth / 5);
      const along = mouthCenter + side * (34 + i * 7 + random() * 14);
      points.push(edgeToMapCoords(inward, along, edge));
    }
    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        const d = distanceToPolyline(row, col, points);
        if (d < 18) {
          const lift = (1 - d / 18) * 0.52;
          if (!masks.water[row][col] || d < 8) {
            masks.water[row][col] = false;
            field[row][col] += lift;
          }
        }
      }
    }
  });
}

function applyLakeBasin(field, masks, config, random, metadata) {
  const center = { row: 92 + random() * 72, col: 88 + random() * 80 };
  const rx = 42 + random() * 36;
  const ry = 34 + random() * 32;
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const warpCol = col + (valueNoise(col * 0.018, row * 0.018, random) - 0.5) * 20;
      const warpRow = row + (valueNoise(col * 0.018 + 31, row * 0.018 - 7, random) - 0.5) * 20;
      const dx = (warpCol - center.col) / rx;
      const dy = (warpRow - center.row) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      const shoreNoise = (fbmNoise(col * 0.03, row * 0.03, random, 3, 2, 0.5) - 0.5) * 0.22;
      if (d + shoreNoise < 1) {
        masks.water[row][col] = true;
        masks.lake[row][col] = true;
        field[row][col] = config.seaLevel - 0.22;
      } else if (d < 1.4) {
        field[row][col] -= (1.4 - d) * 0.34;
      } else if (d < 2.2) {
        field[row][col] += (2.2 - d) * 0.10;
      }
    }
  }
  metadata.features.push('lake-basin');
}

function applyBasinRim(field, masks, config, random, metadata) {
  const center = { row: 118 + random() * 28, col: 112 + random() * 34 };
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const nx = (col - center.col) / 100;
      const ny = (row - center.row) / 92;
      const d = Math.sqrt(nx * nx + ny * ny);
      const broken = (valueNoise(col * 0.025, row * 0.025, random) - 0.5) * 0.28;
      const rim = Math.max(0, 1 - Math.abs(d - 0.72 + broken) / 0.22);
      const sink = Math.max(0, 1 - d / 0.44);
      field[row][col] += rim * 0.78 - sink * 0.36;
      if (sink > 0.72 && config.seaLevel > 0.15 && random.seed % 2 === 0) {
        masks.lake[row][col] = true;
        masks.water[row][col] = true;
        field[row][col] = config.seaLevel - 0.15;
      }
    }
  }
  metadata.features.push('basin-rim');
}

function applyProfileLandform(field, masks, config, profileType, random, metadata) {
  if (profileType === 'desert') {
    applyDuneBands(field, masks, random);
    metadata.features.push('dune-fields');
  } else if (profileType === 'plateau') {
    applyPlateauMesa(field, masks, random);
    metadata.features.push('plateau-mesa');
  } else if (profileType === 'plain') {
    flattenCentralLowlands(field, masks, 0.16);
    metadata.features.push('alluvial-plain');
  } else if (profileType === 'harbor' || profileType === 'default') {
    flattenCentralLowlands(field, masks, 0.08);
  }
}

function applyDuneBands(field, masks, random) {
  const angle = random() * Math.PI;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const band = Math.sin((col * cos + row * sin) * 0.09 + valueNoise(col * 0.015, row * 0.015, random) * 3);
      field[row][col] += Math.max(0, band) * 0.16;
      if (band > 0.22) masks.dirt[row][col] = true;
    }
  }
}

function applyPlateauMesa(field, masks, random) {
  const tilt = random() * Math.PI;
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const nx = (col - MAP_WIDTH / 2) / (MAP_WIDTH / 2);
      const ny = (row - MAP_HEIGHT / 2) / (MAP_HEIGHT / 2);
      const shelf = Math.max(Math.abs(nx * 0.85 + Math.cos(tilt) * 0.18), Math.abs(ny * 0.75 + Math.sin(tilt) * 0.18));
      if (shelf < 0.58 + (valueNoise(col * 0.018, row * 0.018, random) - 0.5) * 0.22) {
        field[row][col] += 0.58;
      }
      const canyon = Math.abs(Math.sin(col * 0.025 + valueNoise(row * 0.02, col * 0.01, random) * 2));
      if (canyon < 0.08) {
        field[row][col] -= 0.34;
        masks.dirt[row][col] = true;
      }
    }
  }
}

function flattenCentralLowlands(field, masks, strength) {
  for (let row = 34; row < MAP_HEIGHT - 34; row++) {
    for (let col = 34; col < MAP_WIDTH - 34; col++) {
      if (masks.water[row][col]) continue;
      const low = field[row][col] < 0.58;
      if (low) field[row][col] = lerp(field[row][col], 0.38, strength);
    }
  }
}

function generateRidgeNetwork(config, profileType, random) {
  if (config.ridgeCount <= 0) return [];
  const ridges = [];
  const count = config.ridgeCount + (random() < 0.35 ? 1 : 0);

  for (let i = 0; i < count; i++) {
    const diagonal = random() < 0.65 || profileType === 'mountain';
    const start = diagonal
      ? { row: 18 + random() * 64, col: -10 + random() * 70 }
      : { row: random() * MAP_HEIGHT, col: 18 + random() * 46 };
    const end = diagonal
      ? { row: 170 + random() * 70, col: 178 + random() * 86 }
      : { row: random() * MAP_HEIGHT, col: 190 + random() * 48 };

    const points = makeMeanderingPolyline(start, end, random, 5 + Math.floor(random() * 3), profileType === 'mountain' ? 42 : 28);
    ridges.push({
      points,
      width: (profileType === 'mountain' ? 20 : 15) + random() * 18,
      strength: (profileType === 'mountain' ? 0.78 : 0.42) + random() * 0.28,
    });

    if (random() < 0.72) {
      const anchor = points[1 + Math.floor(random() * (points.length - 2))];
      const angle = Math.atan2(end.row - start.row, end.col - start.col) + (random() < 0.5 ? 1 : -1) * (0.7 + random() * 0.7);
      const branchEnd = {
        row: anchor.row + Math.sin(angle) * (42 + random() * 64),
        col: anchor.col + Math.cos(angle) * (42 + random() * 64),
      };
      ridges.push({
        points: makeMeanderingPolyline(anchor, branchEnd, random, 4, 20),
        width: 10 + random() * 12,
        strength: (profileType === 'mountain' ? 0.42 : 0.24) + random() * 0.18,
      });
    }
  }

  return ridges;
}

function applyRidgeNetwork(field, ridges, config, profileType, metadata) {
  if (ridges.length === 0) return;
  ridges.forEach((ridge) => {
    for (let index = 0; index < ridge.points.length - 1; index++) {
      const a = ridge.points[index];
      const b = ridge.points[index + 1];
      const margin = Math.ceil(ridge.width * 3.2);
      const minRow = Math.max(0, Math.floor(Math.min(a.row, b.row) - margin));
      const maxRow = Math.min(MAP_HEIGHT - 1, Math.ceil(Math.max(a.row, b.row) + margin));
      const minCol = Math.max(0, Math.floor(Math.min(a.col, b.col) - margin));
      const maxCol = Math.min(MAP_WIDTH - 1, Math.ceil(Math.max(a.col, b.col) + margin));

      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const d = distanceToSegment(row, col, a, b);
          if (d > margin) continue;
          const ridgeLift = Math.exp(-((d / ridge.width) ** 2)) * ridge.strength;
          const shoulder = Math.exp(-((d / (ridge.width * 2.8)) ** 2)) * ridge.strength * 0.18;
          field[row][col] += ridgeLift + shoulder;
          if (profileType === 'mountain' && d > ridge.width * 1.1 && d < ridge.width * 2.0) {
            field[row][col] -= 0.06;
          }
        }
      }
    }
  });
  metadata.features.push('ridge-network');
}

function routeRiverNetwork(field, masks, config, profileType, random, metadata) {
  const count = Math.max(0, config.riverCount);
  for (let i = 0; i < count; i++) {
    const source = chooseRiverSource(field, masks, random, i);
    if (!source) continue;
    const path = routeRiver(field, source, masks, config, random, profileType);
    if (path.length > 18) {
      paintRiverPath(field, masks, path, config, i === 0 ? 1 : 0);
      metadata.features.push(i === 0 ? 'main-river' : 'tributary');
    }
  }
}

function chooseRiverSource(field, masks, random, index) {
  let best = null;
  let bestScore = -Infinity;
  for (let attempts = 0; attempts < 900; attempts++) {
    const row = 12 + Math.floor(random() * (MAP_HEIGHT - 24));
    const col = 12 + Math.floor(random() * (MAP_WIDTH - 24));
    if (masks.water[row][col]) continue;
    const edgePenalty = Math.min(row, col, MAP_HEIGHT - 1 - row, MAP_WIDTH - 1 - col) * 0.003;
    const score = field[row][col] + edgePenalty + (index === 0 ? 0 : random() * 0.15);
    if (score > bestScore) {
      bestScore = score;
      best = { row, col };
    }
  }
  return best;
}

function routeRiver(field, source, masks, config, random, profileType) {
  const path = [];
  let row = source.row;
  let col = source.col;
  let prev = { dr: 0, dc: 0 };
  const visited = new Set();
  const targetEdge = config._coastEdge ?? Math.floor(random() * 4);

  for (let step = 0; step < MAP_WIDTH + MAP_HEIGHT; step++) {
    if (!isInsideMap(row, col)) break;
    path.push({ row, col });
    if ((masks.water[row][col] && step > 8) || isNearMapEdge(row, col)) break;
    visited.add(`${row},${col}`);

    let best = null;
    let bestScore = Infinity;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (!isInsideMap(nr, nc)) continue;
        if (visited.has(`${nr},${nc}`) && random() < 0.92) continue;
        const edgeBias = distanceToPreferredDrainEdge(nr, nc, targetEdge) * 0.002;
        const isSameDirection = dr === prev.dr && dc === prev.dc;
        const isReverse = dr === -prev.dr && dc === -prev.dc && (prev.dr !== 0 || prev.dc !== 0);
        const dot = dr * prev.dr + dc * prev.dc;
        const inertia = isSameDirection ? -0.09 : 0;
        const turnPenalty = isReverse ? 0.20 : dot <= 0 && (prev.dr !== 0 || prev.dc !== 0) ? 0.07 : 0;
        const meander = valueNoise(nc * 0.045 + step * 0.01, nr * 0.045, random) * 0.08;
        const score = field[nr][nc] + edgeBias + meander + inertia + turnPenalty;
        if (score < bestScore) {
          bestScore = score;
          best = { row: nr, col: nc, dr, dc };
        }
      }
    }
    if (!best) break;

    const current = field[row][col];
    if (field[best.row][best.col] > current - 0.01) {
      field[best.row][best.col] = current - (profileType === 'plain' ? 0.006 : 0.018);
    }
    prev = { dr: best.dr, dc: best.dc };
    row = best.row;
    col = best.col;
  }

  return path;
}

function paintRiverPath(field, masks, path, config, extraWidth = 0) {
  const smoothPath = smoothRiverPath(path);
  smoothPath.forEach(({ row, col }, index) => {
    const t = index / Math.max(1, smoothPath.length - 1);
    const width = 1.15 + extraWidth + t * 2.45;
    paintSoftWaterDisc(field, masks, row, col, width, config, true);
  });
  paintRiverMouth(field, masks, smoothPath, config, extraWidth);
}

function smoothRiverPath(path) {
  if (path.length < 5) return path.map(({ row, col }) => ({ row, col }));

  const controls = [];
  const stride = Math.max(4, Math.floor(path.length / 18));
  for (let i = 0; i < path.length; i += stride) {
    controls.push(path[i]);
  }
  const last = path[path.length - 1];
  if (controls[controls.length - 1] !== last) controls.push(last);

  const samples = [];
  for (let i = 0; i < controls.length - 1; i++) {
    const p0 = controls[Math.max(0, i - 1)];
    const p1 = controls[i];
    const p2 = controls[i + 1];
    const p3 = controls[Math.min(controls.length - 1, i + 2)];
    const distance = Math.hypot(p2.row - p1.row, p2.col - p1.col);
    const steps = Math.max(4, Math.ceil(distance / 2.4));
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      samples.push({
        row: catmullRom(p0.row, p1.row, p2.row, p3.row, t),
        col: catmullRom(p0.col, p1.col, p2.col, p3.col, t),
      });
    }
  }
  samples.push({ row: last.row, col: last.col });
  return samples;
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

function paintRiverMouth(field, masks, path, config, extraWidth = 0) {
  if (path.length < 4) return;
  const end = path[path.length - 1];
  const before = path[Math.max(0, path.length - 8)];
  const dirRow = end.row - before.row;
  const dirCol = end.col - before.col;
  const length = Math.hypot(dirRow, dirCol) || 1;
  const unitRow = dirRow / length;
  const unitCol = dirCol / length;
  const normalRow = -unitCol;
  const normalCol = unitRow;

  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const centerRow = end.row + unitRow * i * 1.7;
    const centerCol = end.col + unitCol * i * 1.7;
    const spread = (2.1 + extraWidth + t * 3.4);
    for (let side = -1; side <= 1; side++) {
      const offset = side * spread * 0.45 * t;
      paintSoftWaterDisc(
        field,
        masks,
        centerRow + normalRow * offset,
        centerCol + normalCol * offset,
        spread * (side === 0 ? 1 : 0.72),
        config,
        true,
      );
    }
  }
}

function paintSoftWaterDisc(field, masks, row, col, width, config, isRiver = false) {
  const radius = width + 2.7;
  for (let rr = Math.floor(row - radius); rr <= Math.ceil(row + radius); rr++) {
    for (let cc = Math.floor(col - radius); cc <= Math.ceil(col + radius); cc++) {
      if (!isInsideMap(rr, cc)) continue;
      const dist = Math.hypot(rr - row, cc - col);
      if (dist <= width) {
        masks.water[rr][cc] = true;
        if (isRiver) masks.river[rr][cc] = true;
        field[rr][cc] = Math.min(field[rr][cc], config.seaLevel - 0.12);
      } else if (dist <= radius) {
        const falloff = 1 - (dist - width) / (radius - width);
        field[rr][cc] -= falloff * 0.11;
        masks.dirt[rr][cc] = true;
      }
    }
  }
}

function smoothWaterMasks(field, masks, config, profileType) {
  const passes = profileType === 'harbor' || profileType === 'lake' ? 2 : 1;
  for (let pass = 0; pass < passes; pass++) {
    const nextWater = masks.water.map((row) => row.slice());
    for (let row = 1; row < MAP_HEIGHT - 1; row++) {
      for (let col = 1; col < MAP_WIDTH - 1; col++) {
        const waterNeighbors = countWaterNeighbors(masks, row, col, true);
        const cardinalWater = countWaterNeighbors(masks, row, col, false);

        if (!masks.water[row][col]) {
          const lowEnough = field[row][col] <= config.seaLevel + (profileType === 'plain' ? 0.18 : 0.32);
          if (lowEnough && (waterNeighbors >= 5 || cardinalWater >= 3)) {
            nextWater[row][col] = true;
          }
          continue;
        }

        if (!masks.river[row][col] && !masks.lake[row][col] && waterNeighbors <= 1) {
          nextWater[row][col] = false;
        } else if (!masks.river[row][col] && waterNeighbors <= 2 && field[row][col] > config.seaLevel - 0.04) {
          nextWater[row][col] = false;
        }
      }
    }

    for (let row = 1; row < MAP_HEIGHT - 1; row++) {
      for (let col = 1; col < MAP_WIDTH - 1; col++) {
        masks.water[row][col] = nextWater[row][col];
        if (masks.water[row][col]) {
          field[row][col] = Math.min(field[row][col], config.seaLevel - 0.08);
        } else {
          masks.river[row][col] = false;
        }
      }
    }
  }
}

function countWaterNeighbors(masks, row, col, includeDiagonals = true) {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      if (!includeDiagonals && Math.abs(dr) + Math.abs(dc) !== 1) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (isInsideMap(nr, nc) && masks.water[nr][nc]) count++;
    }
  }
  return count;
}

function erodeFieldAlongDrainage(field, masks, config) {
  for (let row = 1; row < MAP_HEIGHT - 1; row++) {
    for (let col = 1; col < MAP_WIDTH - 1; col++) {
      if (!masks.river[row][col]) continue;
      for (let rr = row - 3; rr <= row + 3; rr++) {
        for (let cc = col - 3; cc <= col + 3; cc++) {
          if (!isInsideMap(rr, cc) || masks.water[rr][cc]) continue;
          const dist = Math.hypot(rr - row, cc - col);
          if (dist <= 3) field[rr][cc] -= (1 - dist / 3) * 0.06 * Math.max(1, config.erosionPasses);
        }
      }
    }
  }
}

function classifyTerrain(field, masks, config, profileType, random) {
  const terrain = createFilledMap(GROUND);
  const heights = createFilledMap(0);
  const buildableCutoff = getBuildableCutoff(config, profileType);
  const heightScale = profileType === 'mountain' ? 5.7 : profileType === 'plateau' ? 5.0 : 4.25;

  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (masks.water[row][col] || field[row][col] <= config.seaLevel) {
        terrain[row][col] = WATER;
        heights[row][col] = 0;
        continue;
      }

      const relative = Math.max(0, field[row][col] - config.seaLevel);
      const slope = localFieldSlope(field, row, col);
      const dryNoise = valueNoise(col * 0.032 + 140, row * 0.032 - 75, random);
      const hillHeight = Math.max(0, Math.min(MAX_TERRAIN_HEIGHT, Math.round((relative - buildableCutoff) * heightScale)));

      if (hillHeight > 0 && (relative > buildableCutoff || slope > 0.18)) {
        terrain[row][col] = HILL;
        heights[row][col] = Math.max(1, hillHeight);
      } else if (masks.dirt[row][col] || dryNoise < config.dryness * 0.54 || slope > 0.16) {
        terrain[row][col] = DIRT;
      } else {
        terrain[row][col] = GROUND;
      }
    }
  }

  return { terrain, heights };
}

function getBuildableCutoff(config, profileType) {
  if (profileType === 'plain') return 0.62;
  if (profileType === 'default') return 0.76;
  if (profileType === 'harbor') return 1.08;
  if (profileType === 'mountain') return 1.30;
  if (profileType === 'island') return 1.02;
  if (profileType === 'plateau') return 0.78;
  if (profileType === 'desert') return 0.56;
  if (profileType === 'river') return 1.08;
  if (profileType === 'lake') return 0.52;
  if (profileType === 'basin') return 0.84;
  return 0.50;
}

function cleanupTerrainComponents(terrain, heights, profileType) {
  removeTinyTerrainComponents(terrain, heights, WATER, profileType === 'plain' ? 2 : 6, GROUND);
  removeTinyTerrainComponents(terrain, heights, HILL, 4, GROUND);
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

function addBeachesBySlope(terrain, heights, field, config) {
  const beachTiles = [];
  for (let row = 1; row < MAP_HEIGHT - 1; row++) {
    for (let col = 1; col < MAP_WIDTH - 1; col++) {
      if (terrain[row][col] !== GROUND && terrain[row][col] !== DIRT && !(terrain[row][col] === HILL && heights[row][col] <= 1)) continue;
      if (!hasCardinalTerrain(terrain, row, col, WATER)) continue;
      const slope = localFieldSlope(field, row, col);
      if (slope < 0.50 && field[row][col] < config.seaLevel + 1.10) {
        beachTiles.push([row, col]);
      }
    }
  }
  beachTiles.forEach(([row, col]) => {
    terrain[row][col] = BEACH;
    heights[row][col] = 0;
  });

  const cornerInfillTiles = [];
  for (let row = 1; row < MAP_HEIGHT - 1; row++) {
    for (let col = 1; col < MAP_WIDTH - 1; col++) {
      if (terrain[row][col] !== GROUND && terrain[row][col] !== DIRT && !(terrain[row][col] === HILL && heights[row][col] <= 1)) continue;
      if (hasCardinalTerrain(terrain, row, col, WATER)) continue;
      const slope = localFieldSlope(field, row, col);
      if (slope >= 0.62 || field[row][col] >= config.seaLevel + 1.25) continue;
      if (!hasBeachCornerInfillPattern(terrain, row, col)) continue;
      cornerInfillTiles.push([row, col]);
    }
  }

  cornerInfillTiles.forEach(([row, col]) => {
    terrain[row][col] = BEACH;
    heights[row][col] = 0;
  });
}

function hasBeachCornerInfillPattern(terrain, row, col) {
  const nBeach = terrain[row - 1][col] === BEACH;
  const eBeach = terrain[row][col + 1] === BEACH;
  const sBeach = terrain[row + 1][col] === BEACH;
  const wBeach = terrain[row][col - 1] === BEACH;

  const neWater = terrain[row - 1][col + 1] === WATER;
  const seWater = terrain[row + 1][col + 1] === WATER;
  const swWater = terrain[row + 1][col - 1] === WATER;
  const nwWater = terrain[row - 1][col - 1] === WATER;

  if (nBeach && eBeach && neWater) return true;
  if (eBeach && sBeach && seWater) return true;
  if (sBeach && wBeach && swWater) return true;
  if (wBeach && nBeach && nwWater) return true;

  return false;
}

function fbmNoise(x, y, random, octaves = 4, lacunarity = 2, gain = 0.5) {
  let frequency = 1;
  let amplitude = 1;
  let total = 0;
  let max = 0;
  for (let octave = 0; octave < octaves; octave++) {
    total += valueNoise(x * frequency + octave * 37.7, y * frequency - octave * 19.3, random) * amplitude;
    max += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return max > 0 ? total / max : 0;
}

function domainWarpPoint(col, row, random, strength = 16) {
  const wx = (fbmNoise(col * 0.012 + 21, row * 0.012 - 17, random, 3, 2, 0.5) - 0.5) * strength;
  const wy = (fbmNoise(col * 0.012 - 43, row * 0.012 + 31, random, 3, 2, 0.5) - 0.5) * strength;
  return { col: col + wx, row: row + wy, x: col + wx, y: row + wy };
}

function makeMeanderingPolyline(start, end, random, pointCount = 5, jitter = 24) {
  const points = [];
  for (let i = 0; i < pointCount; i++) {
    const t = i / (pointCount - 1);
    const row = lerp(start.row, end.row, t);
    const col = lerp(start.col, end.col, t);
    const bend = Math.sin(t * Math.PI) * jitter;
    const angle = Math.atan2(end.row - start.row, end.col - start.col) + Math.PI / 2;
    points.push({
      row: Math.max(0, Math.min(MAP_HEIGHT - 1, row + Math.sin(angle) * (random() - 0.5) * bend * 2)),
      col: Math.max(0, Math.min(MAP_WIDTH - 1, col + Math.cos(angle) * (random() - 0.5) * bend * 2)),
    });
  }
  return points;
}

function distanceToPolyline(row, col, points) {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length - 1; i++) {
    best = Math.min(best, distanceToSegment(row, col, points[i], points[i + 1]));
  }
  return best;
}

function distanceToSegment(row, col, a, b) {
  const vx = b.col - a.col;
  const vy = b.row - a.row;
  const wx = col - a.col;
  const wy = row - a.row;
  const len2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const px = a.col + vx * t;
  const py = a.row + vy * t;
  return Math.hypot(col - px, row - py);
}

function edgeRelativeCoords(row, col, edge) {
  if (edge === 0) return { inward: row, along: col };
  if (edge === 1) return { inward: MAP_WIDTH - 1 - col, along: row };
  if (edge === 2) return { inward: MAP_HEIGHT - 1 - row, along: MAP_WIDTH - 1 - col };
  return { inward: col, along: MAP_HEIGHT - 1 - row };
}

function edgeToMapCoords(inward, along, edge) {
  if (edge === 0) return { row: inward, col: along };
  if (edge === 1) return { row: along, col: MAP_WIDTH - 1 - inward };
  if (edge === 2) return { row: MAP_HEIGHT - 1 - inward, col: MAP_WIDTH - 1 - along };
  return { row: MAP_HEIGHT - 1 - along, col: inward };
}

function distanceToPreferredDrainEdge(row, col, edge) {
  if (edge === 0) return row;
  if (edge === 1) return MAP_WIDTH - 1 - col;
  if (edge === 2) return MAP_HEIGHT - 1 - row;
  return col;
}

function localFieldSlope(field, row, col) {
  const center = field[row]?.[col] ?? 0;
  const samples = [
    field[row - 1]?.[col] ?? center,
    field[row + 1]?.[col] ?? center,
    field[row]?.[col - 1] ?? center,
    field[row]?.[col + 1] ?? center,
  ];
  return samples.reduce((max, value) => Math.max(max, Math.abs(center - value)), 0);
}

function smoothHillMask(terrain, passes = 1) {
  for (let pass = 0; pass < passes; pass++) {
    const next = terrain.map((r) => r.slice());

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        const current = terrain[row][col];
        const hillNeighbors = getTerrainAdjacentEdges(terrain, row, col, HILL).length;

        // Remove single-pixel hill noise and fill tiny cardinal gaps to keep
        // contour lines coherent for the limited hill tileset.
        if (current === HILL && hillNeighbors <= 1) {
          next[row][col] = GROUND;
        } else if (current === GROUND && hillNeighbors >= 3) {
          next[row][col] = HILL;
        }
      }
    }

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        terrain[row][col] = next[row][col];
      }
    }
  }
}

function normalizeHillTerrain(terrain, passes = 1) {
  for (let pass = 0; pass < passes; pass++) {
    const next = terrain.map((r) => r.slice());
    let changed = false;

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        if (terrain[row][col] !== HILL) continue;

        const connected = getTerrainAdjacentEdges(terrain, row, col, HILL)
          .sort((a, b) => 'nesw'.indexOf(a) - 'nesw'.indexOf(b));
        const open = ['n', 'e', 's', 'w'].filter((d) => !connected.includes(d));

        let supported = false;
        if (open.length === 0 || open.length === 1) {
          supported = true;
        } else if (open.length === 2) {
          const pair = open.join('');
          supported = pair === 'ne' || pair === 'es' || pair === 'sw' || pair === 'nw';
        }

        if (!supported) {
          next[row][col] = GROUND;
          changed = true;
        }
      }
    }

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        terrain[row][col] = next[row][col];
      }
    }

    if (!changed) break;
  }
}

function smoothHillHeights(terrain, heights, passes = 1) {
  for (let pass = 0; pass < passes; pass++) {
    const next = heights.map((r) => r.slice());
    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        if (terrain[row][col] !== HILL) {
          next[row][col] = 0;
          continue;
        }

        const samples = [heights[row][col]];
        if (row > 0 && terrain[row - 1][col] === HILL) samples.push(heights[row - 1][col]);
        if (row < MAP_HEIGHT - 1 && terrain[row + 1][col] === HILL) samples.push(heights[row + 1][col]);
        if (col > 0 && terrain[row][col - 1] === HILL) samples.push(heights[row][col - 1]);
        if (col < MAP_WIDTH - 1 && terrain[row][col + 1] === HILL) samples.push(heights[row][col + 1]);
        const avg = samples.reduce((sum, v) => sum + v, 0) / samples.length;
        next[row][col] = Math.max(1, Math.min(MAX_TERRAIN_HEIGHT, avg));
      }
    }

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        heights[row][col] = next[row][col];
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

        const neighbors = [
          row > 0 ? heights[row - 1][col] : 0,
          col < MAP_WIDTH - 1 ? heights[row][col + 1] : 0,
          row < MAP_HEIGHT - 1 ? heights[row + 1][col] : 0,
          col > 0 ? heights[row][col - 1] : 0,
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

function getTerrainAdjacentEdges(terrain, row, col, terrainType) {
  const ne = row > 0 && terrain[row - 1][col] === terrainType;
  const se = col < MAP_WIDTH - 1 && terrain[row][col + 1] === terrainType;
  const sw = row < MAP_HEIGHT - 1 && terrain[row + 1][col] === terrainType;
  const nw = col > 0 && terrain[row][col - 1] === terrainType;

  return [
    ['n', ne],
    ['e', se],
    ['s', sw],
    ['w', nw],
  ].filter(([, matches]) => matches).map(([direction]) => direction);
}

function flattenMapBorder(terrain, heights, margin) {
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (row < margin || row >= MAP_HEIGHT - margin || col < margin || col >= MAP_WIDTH - margin) {
        if (terrain[row][col] === HILL) terrain[row][col] = GROUND;
        heights[row][col] = 0;
      }
    }
  }
}

function carveSeas(terrain, random) {
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const edgeDistance = Math.min(row, col, MAP_HEIGHT - 1 - row, MAP_WIDTH - 1 - col);
      const shoreNoise = valueNoise(col * 0.045, row * 0.045, random) * 18;
      const bayNoise = valueNoise(col * 0.018 + 60, row * 0.018 - 25, random) * 38;
      const seaDepth = 10 + shoreNoise + Math.max(0, bayNoise - 18);

      if (edgeDistance < seaDepth) {
        terrain[row][col] = WATER;
      }
    }
  }
}

function carveRivers(terrain, random) {
  const riverCount = 5 + Math.floor(random() * 4);

  for (let river = 0; river < riverCount; river++) {
    let row = 32 + Math.floor(random() * (MAP_HEIGHT - 64));
    let col = 32 + Math.floor(random() * (MAP_WIDTH - 64));
    let direction = random() * Math.PI * 2;

    for (let step = 0; step < MAP_WIDTH * 2; step++) {
      paintCircle(terrain, row, col, WATER, random() < 0.18 ? 2 : 1);

      if (isNearMapEdge(row, col)) break;

      const nearestEdgeCol = col < MAP_WIDTH / 2 ? 0 : MAP_WIDTH - 1;
      const nearestEdgeRow = row < MAP_HEIGHT / 2 ? 0 : MAP_HEIGHT - 1;
      const edgeTargetCol = Math.abs(col - nearestEdgeCol) < Math.abs(row - nearestEdgeRow) ? nearestEdgeCol : col;
      const edgeTargetRow = edgeTargetCol === col ? nearestEdgeRow : row;
      const targetAngle = Math.atan2(edgeTargetRow - row, edgeTargetCol - col);
      direction = rotateAngleToward(direction, targetAngle, 0.08);
      direction += (random() - 0.5) * 0.7;

      col += Math.round(Math.cos(direction));
      row += Math.round(Math.sin(direction));

      if (!isInsideMap(row, col)) break;
    }
  }
}

function addBeaches(terrain) {
  const beachTiles = [];

  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (terrain[row][col] !== GROUND) continue;
      if (hasCardinalTerrain(terrain, row, col, WATER)) {
        beachTiles.push([row, col]);
      }
    }
  }

  beachTiles.forEach(([row, col]) => {
    terrain[row][col] = BEACH;
  });
}

function addPatches(terrain, random, tileType, patchCount, minRadius, maxRadius) {
  for (let patch = 0; patch < patchCount; patch++) {
    const centerRow = Math.floor(random() * MAP_HEIGHT);
    const centerCol = Math.floor(random() * MAP_WIDTH);
    const radiusRow = minRadius + Math.floor(random() * (maxRadius - minRadius));
    const radiusCol = minRadius + Math.floor(random() * (maxRadius - minRadius));

    for (let row = centerRow - radiusRow; row <= centerRow + radiusRow; row++) {
      for (let col = centerCol - radiusCol; col <= centerCol + radiusCol; col++) {
        if (!isInsideMap(row, col)) continue;
        if (terrain[row][col] !== GROUND) continue;

        const dy = (row - centerRow) / radiusRow;
        const dx = (col - centerCol) / radiusCol;
        if (dx * dx + dy * dy < 1 && random() > 0.15) {
          terrain[row][col] = tileType;
        }
      }
    }
  }
}

function paintCircle(terrain, row, col, tileType, radius) {
  for (let y = row - radius; y <= row + radius; y++) {
    for (let x = col - radius; x <= col + radius; x++) {
      if (!isInsideMap(y, x)) continue;
      if ((y - row) ** 2 + (x - col) ** 2 <= radius ** 2) {
        terrain[y][x] = tileType;
      }
    }
  }
}

function isNearMapEdge(row, col) {
  return row < 8 || col < 8 || row >= MAP_HEIGHT - 8 || col >= MAP_WIDTH - 8;
}

function hasCardinalTerrain(terrain, row, col, tileType) {
  return [
    [row - 1, col],
    [row, col + 1],
    [row + 1, col],
    [row, col - 1],
  ].some(([tileRow, tileCol]) => (
    isInsideMap(tileRow, tileCol) && terrain[tileRow][tileCol] === tileType
  ));
}

function valueNoise(x, y, random) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = smoothStep(x - x0);
  const sy = smoothStep(y - y0);
  const n00 = hashNoise(x0, y0, random.seed);
  const n10 = hashNoise(x0 + 1, y0, random.seed);
  const n01 = hashNoise(x0, y0 + 1, random.seed);
  const n11 = hashNoise(x0 + 1, y0 + 1, random.seed);
  const ix0 = lerp(n00, n10, sx);
  const ix1 = lerp(n01, n11, sx);
  return lerp(ix0, ix1, sy);
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function rotateAngleToward(currentAngle, targetAngle, turnRate) {
  const difference = Math.atan2(
    Math.sin(targetAngle - currentAngle),
    Math.cos(targetAngle - currentAngle),
  );
  return currentAngle + Math.max(-turnRate, Math.min(turnRate, difference));
}

function hashNoise(x, y, seed) {
  let hash = x * 374761393 + y * 668265263 + seed;
  hash = (hash ^ (hash >>> 13)) * 1274126177;
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
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
