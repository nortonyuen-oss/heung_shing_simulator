// Real-city terrain scenarios: Hong Kong, Taipei, Tokyo, New York and the other built-in
// geographies - coastline masks traced from real maps, mountain relief and the painting
// helpers that shape a scenario's land and water. Split out of main.js.

let tokyoRealCoastlineMaskBytes = null;
const realCityCoastlineMaskCache = new Map();

function getTokyoRealCoastlineMaskBytes() {
  if (tokyoRealCoastlineMaskBytes) return tokyoRealCoastlineMaskBytes;
  const raw = atob(TOKYO_REAL_COASTLINE_MASK_B64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  tokyoRealCoastlineMaskBytes = bytes;
  return bytes;
}

function getExternalRealCityCoastlineMaskSpec(cityId) {
  return window.REAL_CITY_COASTLINE_MASKS?.[cityId] ?? null;
}

function getExternalRealCityCoastlineMaskBytes(cityId) {
  if (realCityCoastlineMaskCache.has(cityId)) return realCityCoastlineMaskCache.get(cityId);
  const spec = getExternalRealCityCoastlineMaskSpec(cityId);
  if (!spec?.b64) return null;
  try {
    const raw = atob(spec.b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    realCityCoastlineMaskCache.set(cityId, bytes);
    return bytes;
  } catch (error) {
    console.error('[RealCoastline Mask Decode]', cityId, error);
    realCityCoastlineMaskCache.set(cityId, null);
    return null;
  }
}

function applyExternalRealCoastlineFlatMap(ctx, cityId) {
  fillScenarioTerrain(ctx.map, ctx.heights, WATER, 0);
  const bits = getExternalRealCityCoastlineMaskBytes(cityId);
  if (!bits) {
    if (cityId === 'new-york') {
      applyNewYorkRealCoastlineFlatMap(ctx);
    }
    return;
  }
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const bitIndex = row * MAP_WIDTH + col;
      const byte = bits[bitIndex >> 3] ?? 0;
      const mask = 1 << (7 - (bitIndex & 7));
      if (byte & mask) {
        setScenarioLandHeight(ctx.map, ctx.heights, row, col, 0);
      }
    }
  }
}

function isPointInsidePolygonNormalized(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-8) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function applyRealCoastlineFlatMap(ctx, polygons) {
  fillScenarioTerrain(ctx.map, ctx.heights, WATER, 0);
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const x = col / (MAP_WIDTH - 1);
      const y = row / (MAP_HEIGHT - 1);
      let onLand = false;
      for (let index = 0; index < polygons.length; index++) {
        if (isPointInsidePolygonNormalized(x, y, polygons[index])) {
          onLand = true;
          break;
        }
      }
      if (onLand) {
        setScenarioLandHeight(ctx.map, ctx.heights, row, col, 0);
      }
    }
  }
}

function applyHongKongRealCoastlineFlatMap(ctx) {
  applyRealCoastlineFlatMap(ctx, HONG_KONG_REAL_COASTLINE_POLYGONS);
}

function applyTokyoRealCoastlineFlatMap(ctx) {
  fillScenarioTerrain(ctx.map, ctx.heights, WATER, 0);
  const bits = getTokyoRealCoastlineMaskBytes();
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const bitIndex = row * MAP_WIDTH + col;
      const byte = bits[bitIndex >> 3] ?? 0;
      const mask = 1 << (7 - (bitIndex & 7));
      if (byte & mask) {
        setScenarioLandHeight(ctx.map, ctx.heights, row, col, 0);
      }
    }
  }
}

function applyNewYorkRealCoastlineFlatMap(ctx) {
  applyRealCoastlineFlatMap(ctx, NEW_YORK_REAL_COASTLINE_POLYGONS);
}

function paintScenarioPeakOnLand(ctx, centerX, centerY, rx, ry, targetHeight) {
  const minRow = Math.max(0, Math.floor((centerY - ry - 0.02) * (MAP_HEIGHT - 1)));
  const maxRow = Math.min(MAP_HEIGHT - 1, Math.ceil((centerY + ry + 0.02) * (MAP_HEIGHT - 1)));
  const minCol = Math.max(0, Math.floor((centerX - rx - 0.02) * (MAP_WIDTH - 1)));
  const maxCol = Math.min(MAP_WIDTH - 1, Math.ceil((centerX + rx + 0.02) * (MAP_WIDTH - 1)));
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (ctx.map[row][col] === WATER) continue;
      const nx = ((col / (MAP_WIDTH - 1)) - centerX) / Math.max(0.01, rx);
      const ny = ((row / (MAP_HEIGHT - 1)) - centerY) / Math.max(0.01, ry);
      if (nx * nx + ny * ny <= 1) {
        setScenarioLandHeight(ctx.map, ctx.heights, row, col, targetHeight);
      }
    }
  }
}

function applyHongKongMountainRelief(ctx) {
  // Lantau Island: east-west central spine (Tai O west hills -> Lantau Peak/Sunset Peak -> Mui Wo east)
  paintScenarioHillRidge(ctx, [
    { x: 0.10, y: 0.81 }, { x: 0.16, y: 0.80 }, { x: 0.22, y: 0.79 },
    { x: 0.27, y: 0.78 }, { x: 0.33, y: 0.79 },
  ], 9, 5);
  paintScenarioHillRidge(ctx, [
    { x: 0.13, y: 0.86 }, { x: 0.20, y: 0.84 }, { x: 0.27, y: 0.83 }, { x: 0.32, y: 0.84 },
  ], 7, 4);
  paintScenarioHillRidge(ctx, [
    { x: 0.19, y: 0.76 }, { x: 0.23, y: 0.75 }, { x: 0.28, y: 0.75 },
  ], 5, 3);
  paintScenarioPeakOnLand(ctx, 0.22, 0.80, 0.07, 0.05, 6);
  paintScenarioPeakOnLand(ctx, 0.27, 0.78, 0.07, 0.05, 6);
  paintScenarioPeakOnLand(ctx, 0.15, 0.82, 0.05, 0.04, 4);
  paintScenarioPeakOnLand(ctx, 0.31, 0.80, 0.05, 0.04, 4);

  // New Territories central backbone (Tai Mo Shan belt)
  paintScenarioHillRidge(ctx, [
    { x: 0.39, y: 0.48 }, { x: 0.50, y: 0.43 }, { x: 0.61, y: 0.39 }, { x: 0.73, y: 0.37 },
  ], 10, 6);
  paintScenarioHillRidge(ctx, [
    { x: 0.56, y: 0.36 }, { x: 0.64, y: 0.33 }, { x: 0.72, y: 0.31 },
  ], 8, 4);
  paintScenarioPeakOnLand(ctx, 0.52, 0.42, 0.09, 0.07, 7);
  paintScenarioPeakOnLand(ctx, 0.63, 0.39, 0.08, 0.06, 6);
  paintScenarioPeakOnLand(ctx, 0.69, 0.33, 0.06, 0.05, 4);

  // Sai Kung massif (east New Territories): west-east ridge with eastern peninsula relief
  paintScenarioHillRidge(ctx, [
    { x: 0.76, y: 0.40 }, { x: 0.82, y: 0.37 }, { x: 0.88, y: 0.35 }, { x: 0.93, y: 0.36 },
  ], 7, 5);
  paintScenarioHillRidge(ctx, [
    { x: 0.81, y: 0.45 }, { x: 0.86, y: 0.42 }, { x: 0.91, y: 0.41 },
  ], 6, 4);
  paintScenarioHillRidge(ctx, [
    { x: 0.88, y: 0.31 }, { x: 0.92, y: 0.28 }, { x: 0.95, y: 0.25 },
  ], 5, 3);
  paintScenarioPeakOnLand(ctx, 0.82, 0.38, 0.06, 0.05, 6);
  paintScenarioPeakOnLand(ctx, 0.88, 0.36, 0.05, 0.04, 5);
  paintScenarioPeakOnLand(ctx, 0.92, 0.35, 0.04, 0.04, 4);
  paintScenarioPeakOnLand(ctx, 0.86, 0.43, 0.05, 0.04, 4);

  // Kowloon north ridge (Fei Ngo / Lion Rock corridor)
  paintScenarioHillRidge(ctx, [
    { x: 0.47, y: 0.53 }, { x: 0.56, y: 0.50 }, { x: 0.66, y: 0.49 },
  ], 7, 4);
  paintScenarioPeakOnLand(ctx, 0.58, 0.50, 0.06, 0.04, 5);
  paintScenarioPeakOnLand(ctx, 0.50, 0.54, 0.05, 0.04, 3);

  // Hong Kong Island east-west spine (Victoria Peak -> central ridge -> Tai Tam/Pottinger)
  paintScenarioHillRidge(ctx, [
    { x: 0.52, y: 0.84 }, { x: 0.58, y: 0.82 }, { x: 0.64, y: 0.81 },
    { x: 0.70, y: 0.82 }, { x: 0.75, y: 0.84 },
  ], 8, 5);
  paintScenarioHillRidge(ctx, [
    { x: 0.54, y: 0.79 }, { x: 0.60, y: 0.77 }, { x: 0.67, y: 0.77 }, { x: 0.73, y: 0.79 },
  ], 6, 4);
  paintScenarioHillRidge(ctx, [
    { x: 0.71, y: 0.81 }, { x: 0.74, y: 0.78 }, { x: 0.77, y: 0.74 },
  ], 5, 3);
  paintScenarioPeakOnLand(ctx, 0.56, 0.82, 0.06, 0.04, 6);
  paintScenarioPeakOnLand(ctx, 0.63, 0.80, 0.06, 0.04, 5);
  paintScenarioPeakOnLand(ctx, 0.70, 0.82, 0.06, 0.04, 5);
  paintScenarioPeakOnLand(ctx, 0.74, 0.84, 0.05, 0.04, 4);
  paintScenarioPeakOnLand(ctx, 0.76, 0.77, 0.04, 0.03, 3);

  // Lantau south flank and nearby small islands.
  paintScenarioHillRidge(ctx, [
    { x: 0.10, y: 0.90 }, { x: 0.16, y: 0.88 }, { x: 0.23, y: 0.87 }, { x: 0.29, y: 0.88 },
  ], 5, 3);
  paintScenarioPeakOnLand(ctx, 0.13, 0.89, 0.04, 0.03, 3);
  paintScenarioPeakOnLand(ctx, 0.25, 0.87, 0.05, 0.03, 3);

  paintScenarioHillRidge(ctx, [
    { x: 0.64, y: 0.91 }, { x: 0.68, y: 0.88 }, { x: 0.72, y: 0.84 },
  ], 5, 3);
  paintScenarioPeakOnLand(ctx, 0.66, 0.90, 0.04, 0.03, 3);
  paintScenarioPeakOnLand(ctx, 0.70, 0.84, 0.04, 0.03, 2);
}

function applyBuiltInCityGeographyTemplate(scenarioId, terrainData, seedText = '') {
  const map = terrainData?.mapData?.map((row) => Array.from(row));
  const heights = terrainData?.heightMap?.map((row) => Array.from(row));
  if (!map || !heights) return terrainData;

  const rng = createRandom(`${seedText}:${scenarioId}:geo-v2`);
  const ctx = { map, heights, rng };
  const shapeId = scenarioId.replace(/^builtin:/, '');

  const builders = {
    'hong-kong': buildHongKongScenarioShape,
    taipei: buildTaipeiScenarioShape,
    tokyo: buildTokyoScenarioShape,
    'new-york': buildNewYorkScenarioShape,
    singapore: buildSingaporeScenarioShape,
    london: buildLondonScenarioShape,
    copenhagen: buildCopenhagenScenarioShape,
    sydney: buildSydneyScenarioShape,
  };

  const builder = builders[shapeId];
  if (!builder) return terrainData;

  builder(ctx);
  const preserveCoastline = ['hong-kong', 'tokyo', 'new-york', 'singapore', 'london', 'copenhagen', 'sydney'].includes(shapeId);
  finalizeScenarioTerrain(ctx, { preserveWaterMask: preserveCoastline });

  return {
    ...terrainData,
    mapData: map,
    heightMap: heights,
    features: [...(terrainData.features ?? []), `city-template:${shapeId}`],
  };
}

function fillScenarioTerrain(map, heights, tile, height) {
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      map[row][col] = tile;
      heights[row][col] = height;
    }
  }
}

function setScenarioLandHeight(map, heights, row, col, targetHeight = 0) {
  if (!isInsideMap(row, col)) return;
  const safeHeight = Math.max(0, Math.min(MAX_TERRAIN_HEIGHT, Math.round(targetHeight)));
  heights[row][col] = safeHeight;
  map[row][col] = safeHeight > 0 ? HILL : GROUND;
}

function setScenarioWater(map, heights, row, col) {
  if (!isInsideMap(row, col)) return;
  map[row][col] = WATER;
  heights[row][col] = 0;
}

function paintScenarioWaterDisc(ctx, centerRow, centerCol, radius) {
  const minRow = Math.max(0, Math.floor(centerRow - radius - 1));
  const maxRow = Math.min(MAP_HEIGHT - 1, Math.ceil(centerRow + radius + 1));
  const minCol = Math.max(0, Math.floor(centerCol - radius - 1));
  const maxCol = Math.min(MAP_WIDTH - 1, Math.ceil(centerCol + radius + 1));
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (Math.hypot(row - centerRow, col - centerCol) <= radius) {
        setScenarioWater(ctx.map, ctx.heights, row, col);
      }
    }
  }
}

function paintScenarioWaterPath(ctx, points, widthStart, widthEnd) {
  const mapPoints = points.map((point) => ({
    row: point.y * (MAP_HEIGHT - 1),
    col: point.x * (MAP_WIDTH - 1),
  }));
  if (mapPoints.length < 2) return;
  let traveled = 0;
  let total = 0;
  for (let i = 0; i < mapPoints.length - 1; i++) {
    total += Math.hypot(mapPoints[i + 1].row - mapPoints[i].row, mapPoints[i + 1].col - mapPoints[i].col);
  }
  total = Math.max(1, total);

  for (let i = 0; i < mapPoints.length - 1; i++) {
    const start = mapPoints[i];
    const end = mapPoints[i + 1];
    const segLen = Math.max(1, Math.hypot(end.row - start.row, end.col - start.col));
    const steps = Math.max(8, Math.ceil(segLen));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const row = lerp(start.row, end.row, t);
      const col = lerp(start.col, end.col, t);
      const globalT = (traveled + segLen * t) / total;
      const width = lerp(widthStart, widthEnd, globalT);
      paintScenarioWaterDisc(ctx, row, col, width);
    }
    traveled += segLen;
  }
}

function paintScenarioEllipse(ctx, options = {}) {
  const {
    x = 0.5,
    y = 0.5,
    rx = 0.2,
    ry = 0.2,
    rotation = 0,
    jitter = 0,
    mode = 'water',
    landHeight = 0,
  } = options;

  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const minRow = Math.max(0, Math.floor((y - ry - 0.08) * (MAP_HEIGHT - 1)));
  const maxRow = Math.min(MAP_HEIGHT - 1, Math.ceil((y + ry + 0.08) * (MAP_HEIGHT - 1)));
  const minCol = Math.max(0, Math.floor((x - rx - 0.08) * (MAP_WIDTH - 1)));
  const maxCol = Math.min(MAP_WIDTH - 1, Math.ceil((x + rx + 0.08) * (MAP_WIDTH - 1)));

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const nx = (col / (MAP_WIDTH - 1)) - x;
      const ny = (row / (MAP_HEIGHT - 1)) - y;
      const xr = (nx * cosR + ny * sinR) / Math.max(0.01, rx);
      const yr = (-nx * sinR + ny * cosR) / Math.max(0.01, ry);
      const noise = jitter
        ? (valueNoise(col * 0.023 + 17, row * 0.023 - 11, ctx.rng) - 0.5) * jitter
        : 0;
      if (xr * xr + yr * yr <= 1 + noise) {
        if (mode === 'water') {
          setScenarioWater(ctx.map, ctx.heights, row, col);
        } else {
          setScenarioLandHeight(ctx.map, ctx.heights, row, col, landHeight);
        }
      }
    }
  }
}

function paintScenarioHillRidge(ctx, points, width, peakHeight) {
  const ridge = points.map((point) => ({
    row: point.y * (MAP_HEIGHT - 1),
    col: point.x * (MAP_WIDTH - 1),
  }));
  for (let i = 0; i < ridge.length - 1; i++) {
    const start = ridge[i];
    const end = ridge[i + 1];
    const margin = Math.ceil(width * 2.2);
    const minRow = Math.max(0, Math.floor(Math.min(start.row, end.row) - margin));
    const maxRow = Math.min(MAP_HEIGHT - 1, Math.ceil(Math.max(start.row, end.row) + margin));
    const minCol = Math.max(0, Math.floor(Math.min(start.col, end.col) - margin));
    const maxCol = Math.min(MAP_WIDTH - 1, Math.ceil(Math.max(start.col, end.col) + margin));
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (ctx.map[row][col] === WATER) continue;
        const d = distanceToSegment(row, col, start, end);
        if (d > width * 2.1) continue;
        const lift = Math.exp(-((d / Math.max(1, width)) ** 2)) * peakHeight;
        const currentHeight = ctx.heights[row][col] ?? 0;
        setScenarioLandHeight(ctx.map, ctx.heights, row, col, Math.max(currentHeight, Math.round(lift)));
      }
    }
  }
}

function softenScenarioLowlands(ctx, centerX, centerY, rx, ry) {
  const minRow = Math.max(0, Math.floor((centerY - ry - 0.05) * (MAP_HEIGHT - 1)));
  const maxRow = Math.min(MAP_HEIGHT - 1, Math.ceil((centerY + ry + 0.05) * (MAP_HEIGHT - 1)));
  const minCol = Math.max(0, Math.floor((centerX - rx - 0.05) * (MAP_WIDTH - 1)));
  const maxCol = Math.min(MAP_WIDTH - 1, Math.ceil((centerX + rx + 0.05) * (MAP_WIDTH - 1)));
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (ctx.map[row][col] === WATER) continue;
      const nx = ((col / (MAP_WIDTH - 1)) - centerX) / rx;
      const ny = ((row / (MAP_HEIGHT - 1)) - centerY) / ry;
      if (nx * nx + ny * ny > 1) continue;
      if (ctx.heights[row][col] > 1) {
        setScenarioLandHeight(ctx.map, ctx.heights, row, col, 1);
      } else {
        setScenarioLandHeight(ctx.map, ctx.heights, row, col, 0);
      }
    }
  }
}

function finalizeScenarioTerrain(ctx, options = {}) {
  const preserveWaterMask = Boolean(options.preserveWaterMask);

  // Keep pre-finalized scenario terrain within the global 1-step slope rule.
  enforceGlobalSlopeConstraints(ctx.map, ctx.heights, 1, 10);

  const next = ctx.map.map((row) => row.slice());
  for (let row = 1; row < MAP_HEIGHT - 1; row++) {
    for (let col = 1; col < MAP_WIDTH - 1; col++) {
      if (ctx.map[row][col] !== GROUND || (ctx.heights[row][col] ?? 0) > 0) continue;
      let adjacentWater = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (ctx.map[row + dr][col + dc] === WATER) adjacentWater++;
        }
      }
      if (adjacentWater >= 2) next[row][col] = BEACH;
    }
  }

  if (!preserveWaterMask) {
    for (let row = 1; row < MAP_HEIGHT - 1; row++) {
      for (let col = 1; col < MAP_WIDTH - 1; col++) {
        if (ctx.map[row][col] !== WATER) continue;
        let touchingWater = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            if (ctx.map[row + dr][col + dc] === WATER) touchingWater++;
          }
        }
        if (touchingWater <= 1) {
          next[row][col] = GROUND;
          ctx.heights[row][col] = 0;
        }
      }
    }
  }

  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      ctx.map[row][col] = next[row][col];
      if (ctx.map[row][col] === WATER || ctx.map[row][col] === BEACH) {
        ctx.heights[row][col] = 0;
      } else {
        const h = Math.max(0, Math.min(MAX_TERRAIN_HEIGHT, Math.round(ctx.heights[row][col] ?? 0)));
        ctx.heights[row][col] = h;
        if (ctx.map[row][col] !== HILL) {
          ctx.map[row][col] = h > 0 ? HILL : GROUND;
        }
      }
    }
  }
}

function buildHongKongScenarioShape(ctx) {
  applyHongKongRealCoastlineFlatMap(ctx);
  applyHongKongMountainRelief(ctx);
}

function buildTaipeiScenarioShape(ctx) {
  fillScenarioTerrain(ctx.map, ctx.heights, GROUND, 0);

  // Tamsui estuary on the northwest side.
  paintScenarioEllipse(ctx, {
    mode: 'water', x: -0.08, y: 0.10, rx: 0.24, ry: 0.18, rotation: -0.18, jitter: 0.10,
  });

  // Taipei river network: Keelung River (east->west), Xindian River (south->north),
  // Dahan River (southwest->north), then confluence to Tamsui outlet.
  paintScenarioWaterPath(ctx, [
    { x: 0.98, y: 0.26 }, { x: 0.86, y: 0.27 }, { x: 0.74, y: 0.29 }, { x: 0.62, y: 0.31 }, { x: 0.50, y: 0.33 },
  ], 4, 7);
  paintScenarioWaterPath(ctx, [
    { x: 0.56, y: 0.97 }, { x: 0.54, y: 0.83 }, { x: 0.52, y: 0.70 }, { x: 0.51, y: 0.56 }, { x: 0.50, y: 0.42 },
  ], 4, 8);
  paintScenarioWaterPath(ctx, [
    { x: 0.15, y: 0.95 }, { x: 0.22, y: 0.82 }, { x: 0.30, y: 0.68 }, { x: 0.39, y: 0.55 }, { x: 0.50, y: 0.42 },
  ], 5, 8);
  paintScenarioWaterPath(ctx, [
    { x: 0.50, y: 0.42 }, { x: 0.40, y: 0.34 }, { x: 0.29, y: 0.25 }, { x: 0.17, y: 0.16 }, { x: 0.03, y: 0.08 },
  ], 8, 11);

  // Linkou Plateau on the northwest flank (higher tableland west of Taipei Basin).
  paintScenarioEllipse(ctx, {
    mode: 'land', x: 0.10, y: 0.30, rx: 0.16, ry: 0.12, rotation: -0.18, jitter: 0.10, landHeight: 2,
  });
  paintScenarioHillRidge(ctx, [
    { x: 0.03, y: 0.32 }, { x: 0.10, y: 0.28 }, { x: 0.18, y: 0.25 },
  ], 6, 3);

  // Yangmingshan volcanic group north of the basin.
  paintScenarioHillRidge(ctx, [
    { x: 0.18, y: 0.24 }, { x: 0.32, y: 0.19 }, { x: 0.48, y: 0.17 }, { x: 0.64, y: 0.19 }, { x: 0.78, y: 0.24 },
  ], 8, 5);
  paintScenarioHillRidge(ctx, [
    { x: 0.26, y: 0.15 }, { x: 0.38, y: 0.13 }, { x: 0.52, y: 0.14 }, { x: 0.66, y: 0.17 },
  ], 7, 5);

  // East-northeast ridge toward Nangang/Shenkeng corridor.
  paintScenarioHillRidge(ctx, [
    { x: 0.71, y: 0.32 }, { x: 0.79, y: 0.40 }, { x: 0.85, y: 0.50 },
  ], 7, 4);

  // Wulai mountain system (south and southeast high relief).
  paintScenarioHillRidge(ctx, [
    { x: 0.62, y: 0.58 }, { x: 0.69, y: 0.70 }, { x: 0.76, y: 0.84 },
  ], 9, 5);
  paintScenarioHillRidge(ctx, [
    { x: 0.52, y: 0.64 }, { x: 0.60, y: 0.76 }, { x: 0.69, y: 0.90 },
  ], 10, 6);
  paintScenarioHillRidge(ctx, [
    { x: 0.18, y: 0.66 }, { x: 0.25, y: 0.76 }, { x: 0.33, y: 0.86 },
  ], 8, 4);
  paintScenarioHillRidge(ctx, [
    { x: 0.10, y: 0.34 }, { x: 0.19, y: 0.40 }, { x: 0.27, y: 0.50 },
  ], 6, 3);

  paintScenarioPeakOnLand(ctx, 0.34, 0.18, 0.07, 0.05, 6);
  paintScenarioPeakOnLand(ctx, 0.50, 0.14, 0.07, 0.05, 6);
  paintScenarioPeakOnLand(ctx, 0.62, 0.19, 0.08, 0.05, 5);
  paintScenarioPeakOnLand(ctx, 0.79, 0.43, 0.06, 0.05, 5);
  paintScenarioPeakOnLand(ctx, 0.64, 0.78, 0.09, 0.07, 7);
  paintScenarioPeakOnLand(ctx, 0.73, 0.84, 0.08, 0.06, 6);
  paintScenarioPeakOnLand(ctx, 0.27, 0.80, 0.07, 0.06, 4);
  paintScenarioPeakOnLand(ctx, 0.12, 0.30, 0.07, 0.05, 3);

  // Keep central Taipei Basin broadly flat and buildable.
  softenScenarioLowlands(ctx, 0.48, 0.50, 0.27, 0.22);
  softenScenarioLowlands(ctx, 0.43, 0.43, 0.19, 0.15);
}

function buildTokyoScenarioShape(ctx) {
  applyTokyoRealCoastlineFlatMap(ctx);
}

function buildNewYorkScenarioShape(ctx) {
  applyExternalRealCoastlineFlatMap(ctx, 'new-york');
}

function buildSingaporeScenarioShape(ctx) {
  applyExternalRealCoastlineFlatMap(ctx, 'singapore');
}

function buildLondonScenarioShape(ctx) {
  applyExternalRealCoastlineFlatMap(ctx, 'london');
}

function buildCopenhagenScenarioShape(ctx) {
  applyExternalRealCoastlineFlatMap(ctx, 'copenhagen');
}

function buildSydneyScenarioShape(ctx) {
  applyExternalRealCoastlineFlatMap(ctx, 'sydney');
}
