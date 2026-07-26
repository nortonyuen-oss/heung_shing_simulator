const TRAFFIC_VISUAL_CONFIG = Object.freeze({
  zoomMin: 1.4,
  refreshMs: 250,
  maxVehicles: 28,
  minimumLoad: 0.02,
  densityDivisor: 3,
  laneOffsetTiles: 0.20,
  sameSignDiagonalLaneOffsetTiles: 0.12,
  northEastLaneOffsetTiles: 0.08,
  baseSpeedTilesPerSecond: 0.9,
  minimumHeadwayTiles: 0.65,
  viewportPaddingTiles: 1,
  maxDeltaMs: 50,
  maxLoadAttempts: 2,
  maxResidentModels: 12,
  maxModelsPerLoadBatch: 1,
  maxPendingModels: 2,
  maxSpawnsPerRefresh: 4,
  maxLegTransitionsPerFrame: 4,
  modelDiscoveryMs: 1500,
  depthRefreshMs: 250,
  uphillSpeedFactor: 0.82,
  downhillSpeedFactor: 0.94,
  surfaceConnectionTolerancePx: 0.75,
});

const ICE_CREAM_EVENT_CONFIG = Object.freeze({
  initialCooldownMinMs: 15000,
  initialCooldownMaxMs: 30000,
  cooldownMinMs: 90000,
  cooldownMaxMs: 180000,
  retryCooldownMs: 5000,
  parkingOffsetTiles: 0.42,
  parkingCurveLeadTiles: 0.38,
  musicDurationFallbackMs: 22422,
  musicBaseVolume: 0.55,
});
const ICE_CREAM_AUDIO_KEY = 'event_ice_cream_truck';
const ICE_CREAM_EDUCATION_TARGET_TYPES = Object.freeze([
  'primary_school',
  'secondary_school',
  'community_college',
  'university',
]);
const ICE_CREAM_VISITOR_ATTRACTION_TYPES = Object.freeze([
  'exhibition_center',
  'cultural_center',
  'space_museum',
  'buddha_statue',
  'heritage_temple',
  'grand_temple',
  'heritage_church',
  'indoor_coliseum',
  'murray_house',
  'ocean_park',
  'football_stadium',
]);
const ICE_CREAM_TARGET_TYPES = Object.freeze([
  ...ICE_CREAM_EDUCATION_TARGET_TYPES,
  ...ICE_CREAM_VISITOR_ATTRACTION_TYPES,
]);

const TRAFFIC_DIRECTIONS = Object.freeze(['ne', 'nw', 'se', 'sw']);
const TRAFFIC_LOGICAL_DIRECTIONS = Object.freeze({
  n: Object.freeze({ row: -1, col: 0 }),
  e: Object.freeze({ row: 0, col: 1 }),
  s: Object.freeze({ row: 1, col: 0 }),
  w: Object.freeze({ row: 0, col: -1 }),
});
const TRAFFIC_OPPOSITE_DIRECTION = Object.freeze({
  n: 's',
  e: 'w',
  s: 'n',
  w: 'e',
});

function createTrafficDirectionAssets(id, folder, baseName) {
  return Object.freeze(Object.fromEntries(TRAFFIC_DIRECTIONS.map((direction) => {
    const suffix = direction.toUpperCase();
    return [
      direction,
      Object.freeze({
        key: `traffic_${id}_${direction}`,
        path: `Models/traffic/${folder}/${baseName}${suffix}.png`,
      }),
    ];
  })));
}

function createTrafficModel({
  id,
  category,
  folder,
  baseName,
  scale,
  weight,
  speedFactor,
  headwayFactor,
  originY,
}) {
  return Object.freeze({
    id,
    category,
    scale,
    weight,
    speedFactor,
    headwayFactor,
    originX: 0.5,
    originY,
    directions: createTrafficDirectionAssets(id, folder, baseName),
  });
}

const TRAFFIC_MODEL_REGISTRY = Object.freeze([
  createTrafficModel({
    id: 'bus_kmb', category: 'bus', folder: 'bus', baseName: 'kmb',
    scale: 0.18816, weight: 6, speedFactor: 1, headwayFactor: 1, originY: 0.79,
  }),
  createTrafficModel({
    id: 'bus_citybus', category: 'bus', folder: 'bus', baseName: 'cityBus',
    scale: 0.18816, weight: 4, speedFactor: 1, headwayFactor: 1, originY: 0.79,
  }),
  createTrafficModel({
    id: 'car_hrv', category: 'car', folder: 'car', baseName: 'hrv',
    scale: 0.0684, weight: 13.6, speedFactor: 1.35, headwayFactor: 0.55, originY: 0.86,
  }),
  createTrafficModel({
    id: 'car_odyssey', category: 'car', folder: 'car', baseName: 'odyssey',
    scale: 0.0756, weight: 10.2, speedFactor: 1.3, headwayFactor: 0.58, originY: 0.86,
  }),
  createTrafficModel({
    id: 'car_odyssey2', category: 'car', folder: 'car', baseName: 'odyssey2',
    scale: 0.0756, weight: 10.2, speedFactor: 1.3, headwayFactor: 0.58, originY: 0.86,
  }),
  createTrafficModel({
    id: 'minibus_green', category: 'minibus', folder: 'minibus', baseName: 'greenMinibus',
    scale: 0.1104, weight: 7.7, speedFactor: 1.15, headwayFactor: 0.72, originY: 0.81,
  }),
  createTrafficModel({
    id: 'minibus_red1', category: 'minibus', folder: 'minibus', baseName: 'redMinibus1',
    scale: 0.1104, weight: 3.5, speedFactor: 1.15, headwayFactor: 0.72, originY: 0.81,
  }),
  createTrafficModel({
    id: 'minibus_red2', category: 'minibus', folder: 'minibus', baseName: 'redMinibus2',
    scale: 0.1104, weight: 2.8, speedFactor: 1.15, headwayFactor: 0.72, originY: 0.81,
  }),
  createTrafficModel({
    id: 'taxi_red', category: 'taxi', folder: 'taxi', baseName: 'redTaxi',
    scale: 0.0732, weight: 20.8, speedFactor: 1.25, headwayFactor: 0.55, originY: 0.86,
  }),
  createTrafficModel({
    id: 'taxi_green', category: 'taxi', folder: 'taxi', baseName: 'greenTaxi',
    scale: 0.0732, weight: 3.12, speedFactor: 1.25, headwayFactor: 0.55, originY: 0.86,
  }),
  createTrafficModel({
    id: 'taxi_blue', category: 'taxi', folder: 'taxi', baseName: 'blueTaxi',
    scale: 0.0732, weight: 2.08, speedFactor: 1.25, headwayFactor: 0.55, originY: 0.86,
  }),
  createTrafficModel({
    id: 'truck_basic', category: 'truck', folder: 'truck', baseName: 'basicTruck',
    scale: 0.1032, weight: 2.8, speedFactor: 0.82, headwayFactor: 0.76, originY: 0.81,
  }),
  createTrafficModel({
    id: 'truck_logistic', category: 'truck', folder: 'truck', baseName: 'logisticTruck',
    scale: 0.1032, weight: 2.45, speedFactor: 0.82, headwayFactor: 0.76, originY: 0.81,
  }),
  createTrafficModel({
    id: 'truck_fish', category: 'truck', folder: 'truck', baseName: 'fishTruck',
    scale: 0.0984, weight: 1.75, speedFactor: 0.85, headwayFactor: 0.72, originY: 0.81,
  }),
  createTrafficModel({
    id: 'van_plain', category: 'van', folder: 'van', baseName: 'plainVan',
    scale: 0.0852, weight: 2.8, speedFactor: 1.05, headwayFactor: 0.62, originY: 0.83,
  }),
  createTrafficModel({
    id: 'van_garden', category: 'van', folder: 'van', baseName: 'gardenVan',
    scale: 0.0852, weight: 2, speedFactor: 1.05, headwayFactor: 0.62, originY: 0.83,
  }),
  createTrafficModel({
    id: 'van_silver', category: 'van', folder: 'van', baseName: 'silverVan',
    scale: 0.0852, weight: 2, speedFactor: 1.05, headwayFactor: 0.62, originY: 0.83,
  }),
  createTrafficModel({
    id: 'van_namkee', category: 'van', folder: 'van', baseName: 'namkeeVan',
    scale: 0.0852, weight: 1.2, speedFactor: 1.05, headwayFactor: 0.62, originY: 0.83,
  }),
  createTrafficModel({
    id: 'icecream_van', category: 'icecream', folder: 'icecream', baseName: 'iceCream',
    scale: 0.084, weight: 0, speedFactor: 0.85, headwayFactor: 0.62, originY: 0.82,
  }),
]);

const TRAFFIC_MODEL_BY_ID = new Map(TRAFFIC_MODEL_REGISTRY.map((model) => [model.id, model]));
const TRAFFIC_STARTER_MODEL_IDS = Object.freeze([
  'car_hrv',
]);

function getTrafficTextureDirection(dx, dy, fallback = 'ne') {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return fallback;
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return fallback;
  if (dx < 0) return dy < 0 ? 'nw' : 'sw';
  return dy < 0 ? 'ne' : 'se';
}

function getTrafficLeftLaneOffset(deltaRow, deltaCol, amount = TRAFFIC_VISUAL_CONFIG.laneOffsetTiles) {
  const row = -deltaCol * amount;
  const col = deltaRow * amount;
  return {
    row: row === 0 ? 0 : row,
    col: col === 0 ? 0 : col,
  };
}

function getTrafficLaneOffsetAmount(screenDeltaX, screenDeltaY, config = TRAFFIC_VISUAL_CONFIG) {
  // The NE render's apparent wheel-contact centre sits farther toward the
  // nearside edge than its SW counterpart, so only NE travel needs this
  // smaller offset to remain centred in the lane.
  if (screenDeltaX > 0 && screenDeltaY < 0) {
    return config.northEastLaneOffsetTiles;
  }
  // The NW↔SE screen diagonal (both components share a sign) needs a smaller
  // logical offset in this road art. A larger value pushes the wheel contact
  // point through the nearside lane and onto the pavement.
  return screenDeltaX * screenDeltaY > 0
    ? config.sameSignDiagonalLaneOffsetTiles
    : config.laneOffsetTiles;
}

function computeTrafficVehicleTarget(loads, config = TRAFFIC_VISUAL_CONFIG) {
  const score = Array.from(loads ?? []).reduce((sum, value) => {
    const load = Number(value);
    return load > config.minimumLoad ? sum + Math.sqrt(load) : sum;
  }, 0);
  return Math.min(config.maxVehicles, Math.floor(score / config.densityDivisor));
}

function computeTrafficSpawnBudget(currentCount, targetCount, config = TRAFFIC_VISUAL_CONFIG) {
  const missing = Math.max(0, Math.floor(targetCount) - Math.max(0, Math.floor(currentCount)));
  return Math.min(config.maxSpawnsPerRefresh, missing);
}

function computeTrafficProgressAmount(
  delta,
  paused,
  speedMultiplier,
  config = TRAFFIC_VISUAL_CONFIG,
  vehicleSpeedFactor = 1,
) {
  if (paused) return 0;
  const speed = Math.max(0, Number(speedMultiplier) || 0);
  const vehicleSpeed = Math.max(0, Number(vehicleSpeedFactor) || 0);
  const clampedDelta = Math.min(config.maxDeltaMs, Math.max(0, Number(delta) || 0));
  return config.baseSpeedTilesPerSecond * speed * vehicleSpeed * clampedDelta / 1000;
}

function getTrafficLegSpeedFactor(leg, config = TRAFFIC_VISUAL_CONFIG) {
  const startLift = Number(leg?.surfaceLifts?.start) || 0;
  const endLift = Number(leg?.surfaceLifts?.end) || 0;
  if (endLift > startLift + config.surfaceConnectionTolerancePx) {
    return config.uphillSpeedFactor;
  }
  if (endLift < startLift - config.surfaceConnectionTolerancePx) {
    return config.downhillSpeedFactor;
  }
  return 1;
}

function pickWeightedTrafficModel(
  random = Math.random,
  models = TRAFFIC_MODEL_REGISTRY,
) {
  const candidates = Array.from(models ?? []).filter((model) => Number(model?.weight) > 0);
  const total = candidates.reduce((sum, model) => sum + model.weight, 0);
  if (total <= 0) return null;
  let pick = random() * total;
  for (const model of candidates) {
    pick -= model.weight;
    if (pick <= 0) return model;
  }
  return candidates.at(-1) ?? null;
}

function classifyTrafficTurn(previous, current, next) {
  const incoming = {
    row: current.row - previous.row,
    col: current.col - previous.col,
  };
  const outgoing = {
    row: next.row - current.row,
    col: next.col - current.col,
  };
  if (incoming.row === outgoing.row && incoming.col === outgoing.col) return 'straight';
  if (incoming.row === -outgoing.row && incoming.col === -outgoing.col) return 'uturn';

  // Logical columns are screen-independent X and rows increase toward Y.
  // With Y pointing down, a negative 2D cross product is a left turn.
  const cross = incoming.col * outgoing.row - incoming.row * outgoing.col;
  return cross < 0 ? 'left' : 'right';
}

function chooseNextTrafficTile(previous, current, neighbours, random = Math.random) {
  const candidates = (neighbours ?? []).filter((tile) => (
    tile.row !== previous?.row || tile.col !== previous?.col
  ));
  if (candidates.length === 0) {
    return (neighbours ?? []).find((tile) => (
      tile.row === previous?.row && tile.col === previous?.col
    )) ?? null;
  }

  const weights = candidates.map((tile) => {
    const turn = previous ? classifyTrafficTurn(previous, current, tile) : 'straight';
    if (turn === 'straight') return 0.65;
    if (turn === 'left' || turn === 'right') return 0.175;
    return 0;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return candidates[Math.floor(random() * candidates.length)] ?? candidates[0];

  let pick = random() * total;
  for (let index = 0; index < candidates.length; index++) {
    pick -= weights[index];
    if (pick <= 0) return candidates[index];
  }
  return candidates.at(-1);
}

function isTrafficFlatRoadTile(row, col, layers) {
  const roadValue = layers?.roadValue ?? 2;
  return layers?.mapData?.[row]?.[col] === roadValue
    && Number(layers?.heightMap?.[row]?.[col] ?? 0) === 0
    && !layers?.bridgeMap?.[row]?.[col]
    && layers?.roadUnderlayMap?.[row]?.[col] == null
    && !layers?.slopeMap?.[row]?.[col]
    && !(typeof layers?.isSlopeRoad === 'function' && layers.isSlopeRoad(row, col));
}

function normalizeTrafficBridgeValue(value) {
  if (value === 'row' || value === 'col') return `deck:${value}`;
  if (value === 'deck:row' || value === 'deck:col') return value;
  if (typeof value === 'string' && /^ramp:[nesw]$/.test(value)) return value;
  return null;
}

function getTrafficDirectionForDelta(deltaRow, deltaCol) {
  if (deltaRow === -1 && deltaCol === 0) return 'n';
  if (deltaRow === 0 && deltaCol === 1) return 'e';
  if (deltaRow === 1 && deltaCol === 0) return 's';
  if (deltaRow === 0 && deltaCol === -1) return 'w';
  return null;
}

function canSpawnIceCreamTruckForWeather(weather) {
  return (
    ICE_CREAM_TARGET_TYPES.length > 0
    && ['clear', 'cloudy'].includes(weather?.condition)
    && weather?.typhoonStage === 'none'
    && weather?.typhoonActive !== true
    && Number(weather?.rainfallMm ?? 0) === 0
    && (weather?.rainWarning ?? 'none') === 'none'
  );
}

function isIceCreamTargetBuilding(type) {
  return ICE_CREAM_TARGET_TYPES.includes(type);
}

function findTrafficPathOutsideView(start, isOutsideView, getNeighbours, options = {}) {
  if (!start || typeof isOutsideView !== 'function' || typeof getNeighbours !== 'function') {
    return null;
  }
  const startKey = `${start.row}:${start.col}`;
  const parents = new Map([[startKey, null]]);
  const requiredFirstStep = options.firstStep ?? null;
  let queue;
  if (requiredFirstStep) {
    const firstStepIsConnected = getNeighbours(start.row, start.col).some((tile) => (
      tile.row === requiredFirstStep.row && tile.col === requiredFirstStep.col
    ));
    if (!firstStepIsConnected) return null;
    parents.set(`${requiredFirstStep.row}:${requiredFirstStep.col}`, start);
    queue = [{ row: requiredFirstStep.row, col: requiredFirstStep.col }];
  } else {
    queue = [{ row: start.row, col: start.col }];
  }
  let destination = null;
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex++];
    if (isOutsideView(current.row, current.col)) {
      destination = current;
      break;
    }
    for (const next of getNeighbours(current.row, current.col)) {
      const key = `${next.row}:${next.col}`;
      if (parents.has(key)) continue;
      parents.set(key, current);
      queue.push({ row: next.row, col: next.col });
    }
  }
  if (!destination) return null;

  const path = [];
  let current = destination;
  while (current) {
    path.push(current);
    current = parents.get(`${current.row}:${current.col}`);
  }
  return path.reverse();
}

function getTrafficVirtualOutsideTile(path) {
  if (!Array.isArray(path) || path.length < 2) return null;
  const outsideRoad = path[0];
  const nextRoad = path[1];
  return {
    row: outsideRoad.row - (nextRoad.row - outsideRoad.row),
    col: outsideRoad.col - (nextRoad.col - outsideRoad.col),
  };
}

function getIceCreamArrivalDirectionForBuildingSide(buildingSide) {
  if (!buildingSide) return null;
  const row = Number(buildingSide.row);
  const col = Number(buildingSide.col);
  if (Math.abs(row) + Math.abs(col) !== 1) return null;
  // Hong Kong left-hand traffic: the destination curb must be on the van's
  // left. getTrafficLeftLaneOffset(dr, dc) points to {-dc, dr}, so invert
  // that relationship to obtain the required direction of travel.
  const directionRow = col;
  const directionCol = -row;
  return {
    row: directionRow === 0 ? 0 : directionRow,
    col: directionCol === 0 ? 0 : directionCol,
  };
}

function collectIceCreamParkingCandidates(
  anchor,
  record,
  isParkingRoad,
) {
  if (!anchor || !record || !isIceCreamTargetBuilding(record.type)) return [];
  const footprintRows = Math.max(1, Number(record.footprintRows ?? 1) || 1);
  const footprintCols = Math.max(1, Number(record.footprintCols ?? 1) || 1);
  const footprint = new Set();
  for (let rowOffset = 0; rowOffset < footprintRows; rowOffset++) {
    for (let colOffset = 0; colOffset < footprintCols; colOffset++) {
      footprint.add(`${anchor.row + rowOffset}:${anchor.col + colOffset}`);
    }
  }

  const candidates = new Map();
  for (const key of footprint) {
    const [buildingRow, buildingCol] = key.split(':').map(Number);
    for (const delta of Object.values(TRAFFIC_LOGICAL_DIRECTIONS)) {
      const road = {
        row: buildingRow - delta.row,
        col: buildingCol - delta.col,
      };
      const roadKey = `${road.row}:${road.col}`;
      if (footprint.has(roadKey) || candidates.has(roadKey)) continue;
      if (!isParkingRoad(road.row, road.col)) continue;
      candidates.set(roadKey, {
        road,
        buildingSide: { row: delta.row, col: delta.col },
      });
    }
  }
  return Array.from(candidates.values());
}

function getTrafficLayerHeight(layers, row, col) {
  return Math.max(0, Number(layers?.heightMap?.[row]?.[col]) || 0);
}

function getTrafficRoadSlopeKey(layers, row, col) {
  if (typeof layers?.getRoadSlopeKey === 'function') {
    return layers.getRoadSlopeKey(row, col);
  }
  return layers?.roadSlopeKeyMap?.[row]?.[col] ?? null;
}

function createTrafficRoadSurface({
  row,
  col,
  kind,
  directions,
  centerLift,
  endpointLifts,
}) {
  return {
    row,
    col,
    kind,
    directions,
    centerLift,
    endpointLifts,
  };
}

function getTrafficRoadSurface(row, col, layers) {
  const roadValue = layers?.roadValue ?? 2;
  const heightStep = Math.max(0, Number(layers?.heightStepPixels) || 12);
  const bridgeDeckLift = Math.max(0, Number(layers?.bridgeDeckLiftPixels) || 15);
  const bridge = normalizeTrafficBridgeValue(layers?.bridgeMap?.[row]?.[col]);

  if (bridge === 'deck:row' || bridge === 'deck:col') {
    const directions = bridge === 'deck:row' ? ['e', 'w'] : ['n', 's'];
    return createTrafficRoadSurface({
      row,
      col,
      kind: 'bridge-deck',
      directions,
      centerLift: bridgeDeckLift,
      endpointLifts: Object.fromEntries(directions.map((direction) => [direction, bridgeDeckLift])),
    });
  }

  const rampMatch = bridge?.match(/^ramp:([nesw])$/);
  if (rampMatch) {
    const highDirection = rampMatch[1];
    const lowDirection = TRAFFIC_OPPOSITE_DIRECTION[highDirection];
    return createTrafficRoadSurface({
      row,
      col,
      kind: 'bridge-ramp',
      directions: [highDirection, lowDirection],
      centerLift: bridgeDeckLift / 2,
      endpointLifts: {
        [highDirection]: bridgeDeckLift,
        [lowDirection]: 0,
      },
    });
  }

  if (layers?.mapData?.[row]?.[col] !== roadValue) return null;

  const tileHeight = getTrafficLayerHeight(layers, row, col);
  const tileLift = tileHeight * heightStep;
  const slopeKey = getTrafficRoadSlopeKey(layers, row, col);
  if (slopeKey === 'road_slope_corner') return null;

  const crestMatch = slopeKey?.match(/^road_hill2_([nesw])$/);
  if (crestMatch) {
    const axisDirection = crestMatch[1];
    const directions = axisDirection === 'n' || axisDirection === 's'
      ? ['n', 's']
      : ['e', 'w'];
    const endpointLifts = Object.fromEntries(directions.map((direction) => {
      const delta = TRAFFIC_LOGICAL_DIRECTIONS[direction];
      return [
        direction,
        getTrafficLayerHeight(layers, row + delta.row, col + delta.col) * heightStep,
      ];
    }));
    return createTrafficRoadSurface({
      row,
      col,
      kind: 'terrain-crest',
      directions,
      centerLift: tileLift,
      endpointLifts,
    });
  }

  const slopeMatch = slopeKey?.match(/^road_hill_([nesw])$/);
  if (slopeMatch) {
    const lowDirection = slopeMatch[1];
    const highDirection = TRAFFIC_OPPOSITE_DIRECTION[lowDirection];
    const delta = TRAFFIC_LOGICAL_DIRECTIONS[lowDirection];
    const lowLift = getTrafficLayerHeight(
      layers,
      row + delta.row,
      col + delta.col,
    ) * heightStep;
    return createTrafficRoadSurface({
      row,
      col,
      kind: 'terrain-slope',
      directions: [lowDirection, highDirection],
      centerLift: (lowLift + tileLift) / 2,
      endpointLifts: {
        [lowDirection]: lowLift,
        [highDirection]: tileLift,
      },
    });
  }

  const directions = ['n', 'e', 's', 'w'];
  return createTrafficRoadSurface({
    row,
    col,
    kind: tileHeight > 0 ? 'elevated-flat' : 'flat',
    directions,
    centerLift: tileLift,
    endpointLifts: Object.fromEntries(directions.map((direction) => [direction, tileLift])),
  });
}

function trafficRoadSurfacesConnect(
  current,
  next,
  direction,
  config = TRAFFIC_VISUAL_CONFIG,
) {
  if (!current || !next || !direction) return false;
  const opposite = TRAFFIC_OPPOSITE_DIRECTION[direction];
  if (!current.directions.includes(direction) || !next.directions.includes(opposite)) {
    return false;
  }
  const currentLift = Number(current.endpointLifts[direction]);
  const nextLift = Number(next.endpointLifts[opposite]);
  return Number.isFinite(currentLift)
    && Number.isFinite(nextLift)
    && Math.abs(currentLift - nextLift) <= config.surfaceConnectionTolerancePx;
}

function getTrafficRuntimeLayers() {
  return {
    mapData,
    heightMap,
    bridgeMap,
    roadUnderlayMap,
    roadValue: ROAD,
    heightStepPixels: typeof HEIGHT_STEP_PIXELS === 'number' ? HEIGHT_STEP_PIXELS : 12,
    bridgeDeckLiftPixels: typeof BRIDGE_DECK_VISUAL_LIFT === 'number'
      ? BRIDGE_DECK_VISUAL_LIFT
      : 15,
    getRoadSlopeKey: (row, col) => (
      typeof getRoadSlopeKey === 'function' ? getRoadSlopeKey(row, col) : null
    ),
  };
}

function isRuntimeTrafficRoad(row, col) {
  return isInsideMap(row, col)
    && !!getTrafficRoadSurface(row, col, getTrafficRuntimeLayers());
}

function getTrafficRoadNeighbours(row, col) {
  const layers = getTrafficRuntimeLayers();
  const surface = getTrafficRoadSurface(row, col, layers);
  if (!surface) return [];
  return Object.entries(TRAFFIC_LOGICAL_DIRECTIONS).flatMap(([direction, delta]) => {
    const tile = { row: row + delta.row, col: col + delta.col };
    if (!isInsideMap(tile.row, tile.col)) return [];
    const nextSurface = getTrafficRoadSurface(tile.row, tile.col, layers);
    return trafficRoadSurfacesConnect(surface, nextSurface, direction) ? [tile] : [];
  });
}

function runtimeTrafficTilesConnect(current, next, layers = getTrafficRuntimeLayers()) {
  if (!current || !next) return false;
  const direction = getTrafficDirectionForDelta(
    next.row - current.row,
    next.col - current.col,
  );
  if (!direction) return false;
  return trafficRoadSurfacesConnect(
    getTrafficRoadSurface(current.row, current.col, layers),
    getTrafficRoadSurface(next.row, next.col, layers),
    direction,
  );
}

function getTrafficState(scene) {
  if (!scene) return null;
  if (!scene.trafficVisualState) {
    scene.trafficVisualState = {
      vehicles: [],
      nextVehicleId: 1,
      lastRefreshTime: -Infinity,
      modelTextureState: new Map(),
      pendingModelIds: new Set(),
      modelLastUsed: new Map(),
      modelUseCounter: 0,
      loaderActive: false,
      loaderWaiting: false,
      starterRequested: false,
      lastModelDiscoveryTime: -Infinity,
      nextDepthRefreshTime: 0,
      iceCreamEvent: null,
      iceCreamCooldownMs: randomIceCreamCooldown(true),
      dirty: true,
    };
  }
  return scene.trafficVisualState;
}

function setupTrafficVisuals(scene) {
  return getTrafficState(scene);
}

function destroyTrafficVehicle(vehicle) {
  vehicle?.sprite?.destroy?.();
}

function randomIceCreamCooldown(initial = false, random = Math.random) {
  const min = initial
    ? ICE_CREAM_EVENT_CONFIG.initialCooldownMinMs
    : ICE_CREAM_EVENT_CONFIG.cooldownMinMs;
  const max = initial
    ? ICE_CREAM_EVENT_CONFIG.initialCooldownMaxMs
    : ICE_CREAM_EVENT_CONFIG.cooldownMaxMs;
  return min + Math.max(0, Math.min(1, Number(random()) || 0)) * (max - min);
}

function destroyIceCreamEvent(event) {
  if (!event) return;
  if (event.sound) {
    event.sound.off?.('complete');
    event.sound.stop?.();
    event.sound.destroy?.();
  }
  destroyTrafficVehicle(event);
}

function clearOrdinaryTrafficVisuals(state) {
  state?.vehicles?.forEach(destroyTrafficVehicle);
  if (state?.vehicles) state.vehicles.length = 0;
}

function clearTrafficVisuals(scene) {
  const state = scene?.trafficVisualState;
  if (!state) return;
  clearOrdinaryTrafficVisuals(state);
  destroyIceCreamEvent(state.iceCreamEvent);
  state.iceCreamEvent = null;
  state.iceCreamCooldownMs = randomIceCreamCooldown(true);
  state.dirty = true;
}

function invalidateTrafficVisualView(scene, clear = false) {
  const state = getTrafficState(scene);
  if (!state) return;
  if (clear) clearTrafficVisuals(scene);
  state.dirty = true;
}

function invalidateTrafficVisualNetwork(scene) {
  const state = scene?.trafficVisualState;
  if (!state) return;
  state.vehicles = state.vehicles.filter((vehicle) => {
    const valid = runtimeTrafficTilesConnect(vehicle.current, vehicle.next);
    if (!valid) destroyTrafficVehicle(vehicle);
    return valid;
  });
  const event = state.iceCreamEvent;
  const eventRouteBroken = event?.movementLegs
    ?.slice(event.movementIndex)
    .some((descriptor) => (
      descriptor.kind === 'road'
      && !runtimeTrafficTilesConnect(descriptor.current, descriptor.next)
    ));
  if (eventRouteBroken) {
    destroyIceCreamEvent(event);
    state.iceCreamEvent = null;
    state.iceCreamCooldownMs = randomIceCreamCooldown();
  }
  state.dirty = true;
}

function getTrafficModelTextureRecord(state, modelId) {
  let record = state.modelTextureState.get(modelId);
  if (!record) {
    record = { status: 'unloaded', attempts: 0 };
    state.modelTextureState.set(modelId, record);
  }
  return record;
}

function trafficModelTexturesAreReady(scene, model) {
  return TRAFFIC_DIRECTIONS.every((direction) => (
    scene?.textures?.exists?.(model.directions[direction].key)
  ));
}

function touchTrafficModel(state, modelId) {
  state.modelUseCounter++;
  state.modelLastUsed.set(modelId, state.modelUseCounter);
}

function getReadyTrafficModels(scene) {
  const state = getTrafficState(scene);
  return TRAFFIC_MODEL_REGISTRY.filter((model) => {
    const record = getTrafficModelTextureRecord(state, model.id);
    if (record.status === 'ready' && trafficModelTexturesAreReady(scene, model)) return true;
    if (trafficModelTexturesAreReady(scene, model)) {
      record.status = 'ready';
      return true;
    }
    return false;
  });
}

function evictTrafficModelsForCapacity(scene, state, incomingCount) {
  const activeModelIds = new Set(state.vehicles.map((vehicle) => vehicle.model.id));
  if (state.iceCreamEvent?.model?.id) {
    activeModelIds.add(state.iceCreamEvent.model.id);
  }
  const ready = getReadyTrafficModels(scene);
  let excess = Math.max(
    0,
    ready.length + incomingCount - TRAFFIC_VISUAL_CONFIG.maxResidentModels,
  );
  if (excess === 0) return;

  const candidates = ready
    .filter((model) => !activeModelIds.has(model.id))
    .sort((a, b) => (
      (state.modelLastUsed.get(a.id) ?? -Infinity)
      - (state.modelLastUsed.get(b.id) ?? -Infinity)
    ));
  for (const model of candidates) {
    if (excess <= 0) break;
    TRAFFIC_DIRECTIONS.forEach((direction) => {
      const key = model.directions[direction].key;
      if (scene.textures.exists(key)) scene.textures.remove(key);
    });
    getTrafficModelTextureRecord(state, model.id).status = 'unloaded';
    state.modelLastUsed.delete(model.id);
    excess--;
  }
}

function finalizeTrafficModelLoad(scene, state, models) {
  models.forEach((model) => {
    const record = getTrafficModelTextureRecord(state, model.id);
    if (trafficModelTexturesAreReady(scene, model)) {
      record.status = 'ready';
      touchTrafficModel(state, model.id);
    } else if (record.attempts < TRAFFIC_VISUAL_CONFIG.maxLoadAttempts) {
      record.status = 'unloaded';
      state.pendingModelIds.add(model.id);
    } else {
      record.status = 'failed';
    }
  });
  state.loaderActive = false;
  state.dirty = true;
  pumpTrafficTextureQueue(scene);
}

function pumpTrafficTextureQueue(scene) {
  const state = getTrafficState(scene);
  if (!state || state.loaderActive || state.pendingModelIds.size === 0) return;

  if (scene.load?.isLoading?.()) {
    if (!state.loaderWaiting) {
      state.loaderWaiting = true;
      scene.load.once('complete', () => {
        state.loaderWaiting = false;
        pumpTrafficTextureQueue(scene);
      });
    }
    return;
  }

  const batch = [];
  for (const modelId of state.pendingModelIds) {
    state.pendingModelIds.delete(modelId);
    const model = TRAFFIC_MODEL_BY_ID.get(modelId);
    if (!model) continue;
    const record = getTrafficModelTextureRecord(state, modelId);
    if (record.status === 'ready' || record.status === 'loading' || record.status === 'failed') {
      continue;
    }
    batch.push(model);
    if (batch.length >= TRAFFIC_VISUAL_CONFIG.maxModelsPerLoadBatch) break;
  }
  if (batch.length === 0) return;

  evictTrafficModelsForCapacity(scene, state, batch.length);
  state.loaderActive = true;
  let queuedFileCount = 0;
  batch.forEach((model) => {
    const record = getTrafficModelTextureRecord(state, model.id);
    record.status = 'loading';
    record.attempts++;
    TRAFFIC_DIRECTIONS.forEach((direction) => {
      const { key, path } = model.directions[direction];
      if (scene.textures.exists(key)) return;
      const resolved = typeof resolveModelAssetPath === 'function'
        ? resolveModelAssetPath(path)
        : path;
      const separator = resolved.includes('?') ? '&' : '?';
      scene.load.image(
        key,
        `${resolved}${separator}trafficModel=${encodeURIComponent(model.id)}&load=${record.attempts}`,
      );
      queuedFileCount++;
    });
  });

  if (queuedFileCount === 0) {
    finalizeTrafficModelLoad(scene, state, batch);
    return;
  }

  scene.load.once('complete', () => {
    finalizeTrafficModelLoad(scene, state, batch);
  });
  scene.load.start();
}

function requestTrafficModels(scene, models) {
  const state = getTrafficState(scene);
  if (!state) return;
  Array.from(models ?? []).forEach((model) => {
    if (!model) return;
    const record = getTrafficModelTextureRecord(state, model.id);
    if (trafficModelTexturesAreReady(scene, model)) {
      record.status = 'ready';
      touchTrafficModel(state, model.id);
      return;
    }
    if (
      record.status === 'unloaded'
      && state.pendingModelIds.size < TRAFFIC_VISUAL_CONFIG.maxPendingModels
    ) {
      state.pendingModelIds.add(model.id);
    }
  });
  pumpTrafficTextureQueue(scene);
}

function ensureTrafficStarterTextures(scene) {
  const state = getTrafficState(scene);
  if (!state || state.starterRequested) return;
  state.starterRequested = true;
  requestTrafficModels(
    scene,
    TRAFFIC_STARTER_MODEL_IDS.map((modelId) => TRAFFIC_MODEL_BY_ID.get(modelId)),
  );
}

function getTrafficCameraRect(scene, paddingTiles = 0) {
  const camera = scene?.cameras?.main;
  if (!camera) return null;
  const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
  const viewWidth = Math.max(0, Number(camera.width) || 0) / zoom;
  const viewHeight = Math.max(0, Number(camera.height) || 0) / zoom;
  const originX = Number.isFinite(camera.originX) ? camera.originX : 0.5;
  const originY = Number.isFinite(camera.originY) ? camera.originY : 0.5;
  const view = {
    x: (Number(camera.scrollX) || 0) + (Number(camera.width) || 0) * originX - viewWidth * originX,
    y: (Number(camera.scrollY) || 0) + (Number(camera.height) || 0) * originY - viewHeight * originY,
    width: viewWidth,
    height: viewHeight,
  };
  const padX = paddingTiles * TILE_WIDTH;
  const padY = paddingTiles * TILE_IMAGE_HEIGHT;
  return {
    x: view.x - padX,
    y: view.y - padY,
    width: view.width + padX * 2,
    height: view.height + padY * 2,
  };
}

function trafficPointInRect(point, rect) {
  return !!rect
    && point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
}

function getTrafficSurfacePoint(scene, row, col) {
  const iso = isoToScreen(col, row);
  return {
    x: iso.x + scene.offsetX,
    y: iso.y + scene.offsetY - BUILDING_SURFACE_Y_OFFSET - TILE_HEIGHT / 2,
    depthY: iso.y + TILE_HEIGHT / 2,
  };
}

function getTrafficLanePoint(scene, tile, deltaRow, deltaCol) {
  const centerScreen = isoToScreen(tile.col, tile.row);
  const nextScreen = isoToScreen(tile.col + deltaCol, tile.row + deltaRow);
  const amount = getTrafficLaneOffsetAmount(
    nextScreen.x - centerScreen.x,
    nextScreen.y - centerScreen.y,
  );
  const offset = getTrafficLeftLaneOffset(deltaRow, deltaCol, amount);
  const center = getTrafficSurfacePoint(scene, tile.row, tile.col);
  const shifted = isoToScreen(tile.col + offset.col, tile.row + offset.row);
  const unshifted = centerScreen;
  return {
    x: center.x + shifted.x - unshifted.x,
    y: center.y + shifted.y - unshifted.y,
    depthY: center.depthY + shifted.y - unshifted.y,
  };
}

function getTrafficLogicalBounds(scene, rect) {
  const surfaceYOffset = BUILDING_SURFACE_Y_OFFSET + TILE_HEIGHT / 2;
  const corners = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
  ].map(([worldX, worldY]) => screenToIso(
    worldX - scene.offsetX,
    worldY - scene.offsetY + surfaceYOffset,
  ));
  return {
    minRow: Math.max(0, Math.floor(Math.min(...corners.map((point) => point.y))) - 2),
    maxRow: Math.min(MAP_HEIGHT - 1, Math.ceil(Math.max(...corners.map((point) => point.y))) + 2),
    minCol: Math.max(0, Math.floor(Math.min(...corners.map((point) => point.x))) - 2),
    maxCol: Math.min(MAP_WIDTH - 1, Math.ceil(Math.max(...corners.map((point) => point.x))) + 2),
  };
}

function collectVisibleTrafficRoads(scene, rect) {
  const bounds = getTrafficLogicalBounds(scene, rect);
  const roads = [];
  for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
    for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
      if (!isRuntimeTrafficRoad(row, col)) continue;
      const load = Number(trafficMap?.[row]?.[col] ?? 0);
      if (load <= TRAFFIC_VISUAL_CONFIG.minimumLoad) continue;
      const neighbours = getTrafficRoadNeighbours(row, col);
      if (neighbours.length === 0) continue;
      const point = getTrafficSurfacePoint(scene, row, col);
      if (!trafficPointInRect(point, rect)) continue;
      roads.push({ row, col, load, neighbours });
    }
  }
  return roads;
}

function weightedTrafficRoadPick(roads, random = Math.random) {
  const total = roads.reduce((sum, road) => sum + road.load ** 0.75, 0);
  if (total <= 0) return null;
  let pick = random() * total;
  for (const road of roads) {
    pick -= road.load ** 0.75;
    if (pick <= 0) return road;
  }
  return roads.at(-1) ?? null;
}

function getTrafficLegSurfaceLifts(current, next, layers = getTrafficRuntimeLayers()) {
  const direction = getTrafficDirectionForDelta(
    next.row - current.row,
    next.col - current.col,
  );
  const currentSurface = getTrafficRoadSurface(current.row, current.col, layers);
  const nextSurface = getTrafficRoadSurface(next.row, next.col, layers);
  if (!trafficRoadSurfacesConnect(currentSurface, nextSurface, direction)) {
    return { start: 0, boundary: 0, end: 0 };
  }

  const opposite = TRAFFIC_OPPOSITE_DIRECTION[direction];
  const currentBoundaryLift = Number(currentSurface.endpointLifts[direction]);
  const nextBoundaryLift = Number(nextSurface.endpointLifts[opposite]);
  return {
    start: currentSurface.centerLift,
    boundary: (currentBoundaryLift + nextBoundaryLift) / 2,
    end: nextSurface.centerLift,
  };
}

function createTrafficLeg(scene, previous, current, next) {
  const incoming = {
    row: current.row - previous.row,
    col: current.col - previous.col,
  };
  const outgoing = {
    row: next.row - current.row,
    col: next.col - current.col,
  };
  const start = getTrafficLanePoint(scene, current, incoming.row, incoming.col);
  const end = getTrafficLanePoint(scene, next, outgoing.row, outgoing.col);
  const turn = classifyTrafficTurn(previous, current, next);
  const control = turn === 'straight'
    ? {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
        depthY: (start.depthY + end.depthY) / 2,
      }
    : getTrafficLanePoint(scene, current, outgoing.row, outgoing.col);
  return {
    start,
    control,
    end,
    turn,
    surfaceLifts: getTrafficLegSurfaceLifts(current, next),
  };
}

function evaluateTrafficLeg(leg, progress) {
  const t = Math.max(0, Math.min(1, progress));
  const inverse = 1 - t;
  if (leg?.cubic) {
    const value = (key) => (
      inverse ** 3 * leg.start[key]
      + 3 * inverse * inverse * t * leg.control1[key]
      + 3 * inverse * t * t * leg.control2[key]
      + t ** 3 * leg.end[key]
    );
    const derivative = (key) => (
      3 * inverse * inverse * (leg.control1[key] - leg.start[key])
      + 6 * inverse * t * (leg.control2[key] - leg.control1[key])
      + 3 * t * t * (leg.end[key] - leg.control2[key])
    );
    return {
      x: value('x'),
      y: value('y'),
      depthY: value('depthY'),
      dx: derivative('x'),
      dy: derivative('y'),
      surfaceLift: 0,
    };
  }
  const value = (key) => (
    inverse * inverse * leg.start[key]
    + 2 * inverse * t * leg.control[key]
    + t * t * leg.end[key]
  );
  const derivative = (key) => (
    2 * inverse * (leg.control[key] - leg.start[key])
    + 2 * t * (leg.end[key] - leg.control[key])
  );
  const startLift = Number(leg.surfaceLifts?.start) || 0;
  const boundaryLift = Number(leg.surfaceLifts?.boundary) || 0;
  const endLift = Number(leg.surfaceLifts?.end) || 0;
  const surfaceLift = t <= 0.5
    ? startLift + (boundaryLift - startLift) * t * 2
    : boundaryLift + (endLift - boundaryLift) * (t - 0.5) * 2;
  return {
    x: value('x'),
    y: value('y') - surfaceLift,
    depthY: value('depthY') - surfaceLift,
    dx: derivative('x'),
    dy: derivative('y'),
    surfaceLift,
  };
}

function createIceCreamCubicLeg(start, control1, control2, end) {
  return {
    cubic: true,
    start,
    control1,
    control2,
    end,
    turn: 'parking',
    surfaceLifts: { start: 0, boundary: 0, end: 0 },
  };
}

function createIceCreamPointLeg(start, end) {
  return {
    start,
    control: {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
      depthY: (start.depthY + end.depthY) / 2,
    },
    end,
    turn: 'straight',
    surfaceLifts: { start: 0, boundary: 0, end: 0 },
  };
}

function getIceCreamParkingPoint(scene, parking) {
  const center = getTrafficSurfacePoint(scene, parking.road.row, parking.road.col);
  const shifted = isoToScreen(
    parking.road.col + parking.buildingSide.col * ICE_CREAM_EVENT_CONFIG.parkingOffsetTiles,
    parking.road.row + parking.buildingSide.row * ICE_CREAM_EVENT_CONFIG.parkingOffsetTiles,
  );
  const unshifted = isoToScreen(parking.road.col, parking.road.row);
  const surface = getTrafficRoadSurface(
    parking.road.row,
    parking.road.col,
    getTrafficRuntimeLayers(),
  );
  const lift = Number(surface?.centerLift) || 0;
  return {
    x: center.x + shifted.x - unshifted.x,
    y: center.y + shifted.y - unshifted.y - lift,
    depthY: center.depthY + shifted.y - unshifted.y - lift,
    dx: 0,
    dy: 0,
    surfaceLift: lift,
  };
}

function getIceCreamForwardScreenVector(tile, direction, amountTiles) {
  const start = isoToScreen(tile.col, tile.row);
  const end = isoToScreen(
    tile.col + direction.col * amountTiles,
    tile.row + direction.row * amountTiles,
  );
  return {
    x: end.x - start.x,
    y: end.y - start.y,
    depthY: end.y - start.y,
  };
}

function createIceCreamRoadLegs(scene, path) {
  const legs = [];
  for (let index = 0; index < path.length - 1; index++) {
    const current = path[index];
    const next = path[index + 1];
    const previous = index > 0
      ? path[index - 1]
      : {
          row: current.row - (next.row - current.row),
          col: current.col - (next.col - current.col),
        };
    legs.push({
      kind: 'road',
      current,
      next,
      leg: createTrafficLeg(scene, previous, current, next),
    });
  }
  return legs;
}

function createIceCreamArrivalLegs(scene, path, outside, parking) {
  const roadLegs = createIceCreamRoadLegs(scene, path);
  if (roadLegs.length === 0) return [];
  const finalRoadLeg = roadLegs.at(-1);
  const arrivalDirection = {
    row: finalRoadLeg.next.row - finalRoadLeg.current.row,
    col: finalRoadLeg.next.col - finalRoadLeg.current.col,
  };
  const parkingPoint = getIceCreamParkingPoint(scene, parking);
  const forward = getIceCreamForwardScreenVector(
    parking.road,
    arrivalDirection,
    ICE_CREAM_EVENT_CONFIG.parkingCurveLeadTiles,
  );
  finalRoadLeg.kind = 'parkingApproach';
  finalRoadLeg.leg = createIceCreamCubicLeg(
    evaluateTrafficLeg(finalRoadLeg.leg, 0),
    evaluateTrafficLeg(finalRoadLeg.leg, 0.42),
    {
      x: parkingPoint.x - forward.x,
      y: parkingPoint.y - forward.y,
      depthY: parkingPoint.depthY - forward.depthY,
    },
    parkingPoint,
  );
  const delta = {
    row: path[1].row - path[0].row,
    col: path[1].col - path[0].col,
  };
  const outsidePoint = getTrafficLanePoint(scene, outside, delta.row, delta.col);
  const edgePoint = evaluateTrafficLeg(roadLegs[0].leg, 0);
  return [{
    kind: 'entry',
    current: null,
    next: path[0],
    leg: createIceCreamPointLeg(outsidePoint, edgePoint),
  }, ...roadLegs];
}

function createIceCreamDepartureLegs(scene, path, outside, parking) {
  const roadLegs = createIceCreamRoadLegs(scene, path);
  if (roadLegs.length === 0) return [];
  const firstRoadLeg = roadLegs[0];
  const departureDirection = {
    row: firstRoadLeg.next.row - firstRoadLeg.current.row,
    col: firstRoadLeg.next.col - firstRoadLeg.current.col,
  };
  const parkingPoint = getIceCreamParkingPoint(scene, parking);
  const forward = getIceCreamForwardScreenVector(
    parking.road,
    departureDirection,
    ICE_CREAM_EVENT_CONFIG.parkingCurveLeadTiles,
  );
  firstRoadLeg.kind = 'parkingDeparture';
  firstRoadLeg.leg = createIceCreamCubicLeg(
    parkingPoint,
    {
      x: parkingPoint.x + forward.x,
      y: parkingPoint.y + forward.y,
      depthY: parkingPoint.depthY + forward.depthY,
    },
    evaluateTrafficLeg(firstRoadLeg.leg, 0.58),
    evaluateTrafficLeg(firstRoadLeg.leg, 1),
  );
  const lastRoadLeg = roadLegs.at(-1);
  const delta = {
    row: outside.row - path.at(-1).row,
    col: outside.col - path.at(-1).col,
  };
  const edgePoint = evaluateTrafficLeg(lastRoadLeg.leg, 1);
  const outsidePoint = getTrafficLanePoint(scene, outside, delta.row, delta.col);
  return [...roadLegs, {
    kind: 'exit',
    current: path.at(-1),
    next: null,
    leg: createIceCreamPointLeg(edgePoint, outsidePoint),
  }];
}

function setIceCreamTruckPosition(event, position, updateDirection = true) {
  if (updateDirection) {
    setTrafficVehicleVisual(event, position, 0, true);
    return;
  }
  event.sprite.setPosition(position.x, position.y);
  event.lastPosition = position;
  event.sprite.setDepth(getWorldDepth('object', position.depthY + TILE_HEIGHT / 2));
}

function isRuntimeIceCreamParkingRoad(row, col) {
  if (!isRuntimeTrafficRoad(row, col)) return false;
  const surface = getTrafficRoadSurface(row, col, getTrafficRuntimeLayers());
  return surface?.kind === 'flat' || surface?.kind === 'elevated-flat';
}

function getRuntimeIceCreamRouteOutsideView(scene, parking, firstTravelDelta) {
  const visibleRect = getTrafficCameraRect(scene);
  const spawnRect = getTrafficCameraRect(
    scene,
    TRAFFIC_VISUAL_CONFIG.viewportPaddingTiles + 1,
  );
  if (!visibleRect || !spawnRect) return null;
  const parkingPoint = getTrafficSurfacePoint(scene, parking.road.row, parking.road.col);
  if (!trafficPointInRect(parkingPoint, visibleRect)) return null;
  const firstStep = firstTravelDelta
    ? {
        row: parking.road.row + firstTravelDelta.row,
        col: parking.road.col + firstTravelDelta.col,
      }
    : null;

  const targetToOutside = findTrafficPathOutsideView(
    parking.road,
    (row, col) => !trafficPointInRect(getTrafficSurfacePoint(scene, row, col), spawnRect),
    getTrafficRoadNeighbours,
    { firstStep },
  );
  if (!targetToOutside || targetToOutside.length < 2) return null;
  const path = [...targetToOutside].reverse();
  const outside = getTrafficVirtualOutsideTile(path);
  return outside ? { targetToOutside, path, outside } : null;
}

function collectRuntimeIceCreamTargets(scene, random = Math.random) {
  if (typeof buildingData === 'undefined') return [];

  const targets = [];
  for (const [id, record] of Object.entries(buildingData)) {
    if (!isIceCreamTargetBuilding(record?.type)) continue;
    const [row, col] = id.split(':').map(Number);
    const parkingCandidates = collectIceCreamParkingCandidates(
      { row, col },
      record,
      isRuntimeIceCreamParkingRoad,
    );
    for (const parking of parkingCandidates) {
      const arrivalDirection = getIceCreamArrivalDirectionForBuildingSide(parking.buildingSide);
      if (!arrivalDirection) continue;
      const arrivalOutboundDirection = {
        row: -arrivalDirection.row,
        col: -arrivalDirection.col,
      };
      const route = getRuntimeIceCreamRouteOutsideView(
        scene,
        parking,
        arrivalOutboundDirection,
      );
      const departureRoute = getRuntimeIceCreamRouteOutsideView(
        scene,
        parking,
        arrivalDirection,
      );
      if (!route || !departureRoute) continue;
      targets.push({
        targetId: id,
        targetType: record.type,
        parking,
        arrivalDirection,
        path: route.path,
        outside: route.outside,
        departurePath: departureRoute.targetToOutside,
        departureOutside: departureRoute.outside,
      });
    }
  }
  for (let index = targets.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.max(0, Math.min(0.999999, random())) * (index + 1));
    [targets[index], targets[swapIndex]] = [targets[swapIndex], targets[index]];
  }
  return targets;
}

function spawnIceCreamEvent(scene, state, random = Math.random) {
  const model = TRAFFIC_MODEL_BY_ID.get('icecream_van');
  if (!model) return false;
  if (!trafficModelTexturesAreReady(scene, model)) {
    requestTrafficModels(scene, [model]);
    return false;
  }

  const target = collectRuntimeIceCreamTargets(scene, random)[0];
  if (!target) return false;
  const movementLegs = createIceCreamArrivalLegs(
    scene,
    target.path,
    target.outside,
    target.parking,
  );
  if (movementLegs.length === 0) return false;

  const sprite = scene.add.image(0, 0, model.directions.ne.key);
  addToRenderLayer(scene, sprite, 'objectLayer');
  sprite.setOrigin(model.originX, model.originY);
  sprite.setScale(model.scale);
  sprite.setMask(scene.worldMask);

  const event = {
    id: `icecream_${state.nextVehicleId++}`,
    model,
    sprite,
    targetId: target.targetId,
    targetType: target.targetType,
    parking: target.parking,
    arrivalDirection: target.arrivalDirection,
    arrivalPath: target.path,
    outside: target.outside,
    departurePath: target.departurePath,
    departureOutside: target.departureOutside,
    phase: 'entering',
    movementLegs,
    movementIndex: 0,
    progress: 0,
    current: null,
    next: target.path[0],
    textureDirection: 'ne',
    lastPosition: null,
    sound: null,
    soundPausedForSimulation: false,
    musicElapsedMs: 0,
    musicComplete: false,
  };
  setIceCreamTruckPosition(event, evaluateTrafficLeg(movementLegs[0].leg, 0));
  state.iceCreamEvent = event;
  return true;
}

function getIceCreamEventAudioVolume(scene, event) {
  const camera = scene?.cameras?.main;
  const position = event?.lastPosition;
  if (!camera || !position) return 0;
  const rect = getTrafficCameraRect(scene);
  if (!rect) return 0;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const distance = Math.hypot(position.x - centerX, position.y - centerY);
  const audibleRadius = Math.max(rect.width, rect.height) * 0.8;
  const proximity = Math.max(0, Math.min(1, 1 - distance / Math.max(1, audibleRadius)));
  const zoomFade = Math.max(0, Math.min(
    1,
    (camera.zoom - 0.5) / (TRAFFIC_VISUAL_CONFIG.zoomMin - 0.5),
  ));
  const ambientMix = typeof getStoredAmbientVolume === 'function'
    ? getStoredAmbientVolume()
    : 1;
  return ICE_CREAM_EVENT_CONFIG.musicBaseVolume * proximity * zoomFade * ambientMix;
}

function startIceCreamEventMusic(scene, event) {
  event.musicElapsedMs = 0;
  event.musicComplete = false;
  const audioCache = scene?.cache?.audio;
  const audioIsReady = audioCache?.has?.(ICE_CREAM_AUDIO_KEY)
    ?? audioCache?.exists?.(ICE_CREAM_AUDIO_KEY)
    ?? true;
  if (!scene?.sound || scene.sound.locked || !audioIsReady) {
    return;
  }
  const sound = scene.sound.add(ICE_CREAM_AUDIO_KEY, {
    loop: false,
    volume: getIceCreamEventAudioVolume(scene, event),
  });
  sound.once('complete', () => {
    event.musicComplete = true;
  });
  sound.play();
  event.sound = sound;
}

function completeIceCreamParking(scene, event) {
  event.phase = 'parkedPlaying';
  event.current = null;
  event.next = null;
  startIceCreamEventMusic(scene, event);
}

function beginIceCreamDeparture(scene, event) {
  if (event.sound) {
    event.sound.off?.('complete');
    event.sound.stop?.();
    event.sound.destroy?.();
    event.sound = null;
  }
  const currentRoute = getRuntimeIceCreamRouteOutsideView(
    scene,
    event.parking,
    event.arrivalDirection,
  );
  const departurePath = currentRoute?.targetToOutside ?? event.departurePath;
  const departureOutside = currentRoute?.outside ?? event.departureOutside;
  const movementLegs = createIceCreamDepartureLegs(
    scene,
    departurePath,
    departureOutside,
    event.parking,
  );
  if (movementLegs.length === 0) {
    event.phase = 'finished';
    return;
  }
  event.phase = 'leaving';
  event.movementLegs = movementLegs;
  event.movementIndex = 0;
  event.progress = 0;
  event.current = movementLegs[0].current;
  event.next = movementLegs[0].next;
}

function advanceIceCreamMovement(scene, state, event, delta, speedMultiplier) {
  const descriptor = event.movementLegs[event.movementIndex];
  if (!descriptor) {
    event.phase = event.phase === 'leaving' ? 'finished' : event.phase;
    return;
  }
  event.current = descriptor.current;
  event.next = descriptor.next;
  if (
    ['road', 'parkingApproach', 'parkingDeparture'].includes(descriptor.kind)
    && trafficVehicleHasBlockingLeader(event, state.vehicles)
  ) {
    return;
  }

  const progressAmount = computeTrafficProgressAmount(
    delta,
    false,
    speedMultiplier,
    TRAFFIC_VISUAL_CONFIG,
    event.model.speedFactor * getTrafficLegSpeedFactor(descriptor.leg),
  );
  event.progress += progressAmount;
  let transitions = 0;
  while (
    event.progress >= 1
    && transitions++ < TRAFFIC_VISUAL_CONFIG.maxLegTransitionsPerFrame
  ) {
    event.progress -= 1;
    event.movementIndex++;
    const nextDescriptor = event.movementLegs[event.movementIndex];
    if (!nextDescriptor) {
      setIceCreamTruckPosition(event, evaluateTrafficLeg(descriptor.leg, 1));
      event.current = null;
      event.next = null;
      if (event.phase === 'leaving') event.phase = 'finished';
      else completeIceCreamParking(scene, event);
      return;
    }
    if (
      event.phase === 'entering'
      && ['road', 'parkingApproach'].includes(nextDescriptor.kind)
    ) {
      event.phase = 'drivingToTarget';
    }
    event.current = nextDescriptor.current;
    event.next = nextDescriptor.next;
  }
  const activeDescriptor = event.movementLegs[event.movementIndex];
  setIceCreamTruckPosition(
    event,
    evaluateTrafficLeg(activeDescriptor.leg, event.progress),
    ['road', 'parkingApproach', 'parkingDeparture'].includes(activeDescriptor.kind),
  );
}

function updateIceCreamEvent(scene, state, delta, paused, speedMultiplier) {
  const event = state.iceCreamEvent;
  if (!event) {
    if (paused || scene.cameras.main.zoom < TRAFFIC_VISUAL_CONFIG.zoomMin) return;
    state.iceCreamCooldownMs = Math.max(
      0,
      state.iceCreamCooldownMs - Math.min(1000, Math.max(0, delta)) * speedMultiplier,
    );
    if (state.iceCreamCooldownMs > 0) return;
    const weather = typeof city === 'undefined' ? null : city.weather;
    if (!canSpawnIceCreamTruckForWeather(weather)) return;
    if (!spawnIceCreamEvent(scene, state)) {
      state.iceCreamCooldownMs = ICE_CREAM_EVENT_CONFIG.retryCooldownMs;
      return;
    }
    return;
  }

  const targetStillExists = typeof buildingData !== 'undefined'
    && buildingData[event.targetId]?.type === event.targetType;
  if (!targetStillExists && !['parkedPlaying', 'leaving'].includes(event.phase)) {
    destroyIceCreamEvent(event);
    state.iceCreamEvent = null;
    state.iceCreamCooldownMs = randomIceCreamCooldown();
    return;
  }

  if (event.sound) {
    event.sound.setVolume?.(getIceCreamEventAudioVolume(scene, event));
    if (paused && !event.soundPausedForSimulation) {
      event.sound.pause?.();
      event.soundPausedForSimulation = true;
    } else if (!paused && event.soundPausedForSimulation) {
      event.sound.resume?.();
      event.soundPausedForSimulation = false;
    }
  }
  if (paused) return;

  if (event.phase === 'entering' || event.phase === 'drivingToTarget' || event.phase === 'leaving') {
    advanceIceCreamMovement(scene, state, event, delta, speedMultiplier);
  } else if (event.phase === 'parkedPlaying') {
    event.musicElapsedMs += Math.max(0, delta);
    if (
      event.musicComplete
      || event.musicElapsedMs >= ICE_CREAM_EVENT_CONFIG.musicDurationFallbackMs
      || !targetStillExists
    ) {
      beginIceCreamDeparture(scene, event);
    }
  }

  if (event.phase === 'finished') {
    destroyIceCreamEvent(event);
    state.iceCreamEvent = null;
    state.iceCreamCooldownMs = randomIceCreamCooldown();
  }
}

function setTrafficVehicleVisual(vehicle, position, time = 0, forceDepth = false) {
  const direction = getTrafficTextureDirection(
    position.dx,
    position.dy,
    vehicle.textureDirection,
  );
  vehicle.textureDirection = direction;
  const key = vehicle.model.directions[direction].key;
  if (vehicle.sprite.texture?.key !== key) vehicle.sprite.setTexture(key);
  vehicle.sprite.setPosition(position.x, position.y);
  vehicle.lastPosition = position;
  // Share the object band so foreground buildings can occlude traffic. Building
  // sprites include a half-tile front-edge bias in getBuildingSortDepth(); apply
  // the same bias to the wheel contact point so a bus beside the first footprint
  // tile does not disappear for a full tile before its depth catches up.
  if (forceDepth) {
    vehicle.sprite.setDepth(getWorldDepth('object', position.depthY + TILE_HEIGHT / 2));
  }
}

function refreshTrafficVehicleDepths(state, time) {
  if (!state || time < state.nextDepthRefreshTime) return;
  state.vehicles.forEach((vehicle) => {
    const position = vehicle.lastPosition;
    if (!position) return;
    vehicle.sprite.setDepth(getWorldDepth('object', position.depthY + TILE_HEIGHT / 2));
  });
  state.nextDepthRefreshTime = time + TRAFFIC_VISUAL_CONFIG.depthRefreshMs;
}

function maybeRequestTrafficModelForSpawn(scene, time, random = Math.random) {
  const state = getTrafficState(scene);
  if (
    state.loaderActive
    || state.pendingModelIds.size > 0
    || time - state.lastModelDiscoveryTime < TRAFFIC_VISUAL_CONFIG.modelDiscoveryMs
  ) {
    return;
  }

  const desired = pickWeightedTrafficModel(random, TRAFFIC_MODEL_REGISTRY);
  if (desired && !trafficModelTexturesAreReady(scene, desired)) {
    state.lastModelDiscoveryTime = time;
    requestTrafficModels(scene, [desired]);
  }
}

function chooseTrafficModelForSpawn(scene, random = Math.random) {
  const state = getTrafficState(scene);
  const readyModels = getReadyTrafficModels(scene);
  if (readyModels.length === 0) return null;
  const selected = pickWeightedTrafficModel(random, readyModels);
  if (selected) touchTrafficModel(state, selected.id);
  return selected;
}

function hasTrafficSpawnConflict(state, current, next) {
  const vehicles = state.iceCreamEvent
    ? [...state.vehicles, state.iceCreamEvent]
    : state.vehicles;
  return vehicles.some((vehicle) => (
    vehicle.current
    && vehicle.next
    && vehicle.current.row === current.row
    && vehicle.current.col === current.col
    && vehicle.next.row === next.row
    && vehicle.next.col === next.col
  ));
}

function spawnTrafficVehicle(scene, roads, random = Math.random, time = 0) {
  const state = getTrafficState(scene);
  for (let attempt = 0; attempt < 12; attempt++) {
    const road = weightedTrafficRoadPick(roads, random);
    if (!road) return false;
    const next = road.neighbours[Math.floor(random() * road.neighbours.length)];
    if (!next || hasTrafficSpawnConflict(state, road, next)) continue;
    const model = chooseTrafficModelForSpawn(scene, random);
    if (!model) return false;

    const previous = {
      row: road.row - (next.row - road.row),
      col: road.col - (next.col - road.col),
    };
    const current = { row: road.row, col: road.col };
    const sprite = scene.add.image(0, 0, model.directions.ne.key);
    addToRenderLayer(scene, sprite, 'objectLayer');
    sprite.setOrigin(model.originX, model.originY);
    sprite.setScale(model.scale);
    sprite.setMask(scene.worldMask);

    const vehicle = {
      id: state.nextVehicleId++,
      model,
      sprite,
      previous,
      current,
      next: { row: next.row, col: next.col },
      progress: random() * 0.8,
      textureDirection: 'ne',
      leg: null,
    };
    vehicle.leg = createTrafficLeg(scene, vehicle.previous, vehicle.current, vehicle.next);
    setTrafficVehicleVisual(
      vehicle,
      evaluateTrafficLeg(vehicle.leg, vehicle.progress),
      time,
      true,
    );
    state.vehicles.push(vehicle);
    return true;
  }
  return false;
}

function removeTrafficVehiclesOutside(scene, rect, time) {
  const state = getTrafficState(scene);
  state.vehicles = state.vehicles.filter((vehicle) => {
    const position = evaluateTrafficLeg(vehicle.leg, vehicle.progress);
    const keep = trafficPointInRect(position, rect)
      && runtimeTrafficTilesConnect(vehicle.current, vehicle.next);
    if (!keep) destroyTrafficVehicle(vehicle);
    return keep;
  });
  refreshTrafficVehicleDepths(state, time);
}

function refreshVisibleTraffic(scene, time) {
  const state = getTrafficState(scene);
  const rect = getTrafficCameraRect(scene, TRAFFIC_VISUAL_CONFIG.viewportPaddingTiles);
  removeTrafficVehiclesOutside(scene, rect, time);
  const roads = collectVisibleTrafficRoads(scene, rect);
  const target = computeTrafficVehicleTarget(roads.map((road) => road.load));

  const excess = Math.max(0, state.vehicles.length - target);
  if (excess > 0) {
    state.vehicles.splice(target, excess).forEach(destroyTrafficVehicle);
  }

  const spawnBudget = computeTrafficSpawnBudget(state.vehicles.length, target);
  if (spawnBudget > 0) maybeRequestTrafficModelForSpawn(scene, time);
  for (let attempt = 0; attempt < spawnBudget && state.vehicles.length < target; attempt++) {
    if (!spawnTrafficVehicle(scene, roads, Math.random, time)) break;
  }

  state.lastRefreshTime = time;
  state.dirty = false;
}

function trafficVehicleHasBlockingLeader(vehicle, vehicles) {
  return vehicles.some((leader) => (
    leader !== vehicle
    && leader.current
    && leader.next
    && vehicle.current
    && vehicle.next
    && leader.current.row === vehicle.current.row
    && leader.current.col === vehicle.current.col
    && leader.next.row === vehicle.next.row
    && leader.next.col === vehicle.next.col
    && leader.progress > vehicle.progress
    && leader.progress - vehicle.progress < (
      TRAFFIC_VISUAL_CONFIG.minimumHeadwayTiles
      * Math.max(vehicle.model.headwayFactor, leader.model.headwayFactor)
    )
  ));
}

function advanceTrafficVehicle(scene, vehicle, amount, viewRect, time) {
  vehicle.progress += amount;
  let transitions = 0;
  while (
    vehicle.progress >= 1
    && transitions < TRAFFIC_VISUAL_CONFIG.maxLegTransitionsPerFrame
  ) {
    transitions++;
    vehicle.progress -= 1;
    const previous = vehicle.current;
    const current = vehicle.next;
    const neighbours = getTrafficRoadNeighbours(current.row, current.col);
    const next = chooseNextTrafficTile(previous, current, neighbours);
    if (!next) return false;

    vehicle.previous = previous;
    vehicle.current = current;
    vehicle.next = { row: next.row, col: next.col };
    vehicle.leg = createTrafficLeg(scene, vehicle.previous, vehicle.current, vehicle.next);
    if (!trafficPointInRect(vehicle.leg.start, viewRect)) return false;
  }
  if (vehicle.progress >= 1) return false;
  setTrafficVehicleVisual(vehicle, evaluateTrafficLeg(vehicle.leg, vehicle.progress), time);
  return true;
}

function updateTrafficVisuals(time, delta) {
  const scene = this;
  const state = getTrafficState(scene);
  const camera = scene?.cameras?.main;
  if (!state || !camera) return;

  if (scene.scene?.isVisible && !scene.scene.isVisible()) {
    if (state.vehicles.length > 0 || state.iceCreamEvent) clearTrafficVisuals(scene);
    return;
  }

  const paused = typeof simPaused !== 'undefined' && simPaused;
  const speedMultiplier = paused
    ? 0
    : Math.max(0, Number(typeof simSpeedMul === 'undefined' ? 1 : simSpeedMul) || 0);

  if (!(typeof isTerrainCreatorMode !== 'undefined' && isTerrainCreatorMode)) {
    updateIceCreamEvent(scene, state, delta, paused, speedMultiplier);
  }

  if (
    camera.zoom < TRAFFIC_VISUAL_CONFIG.zoomMin
    || (typeof isTerrainCreatorMode !== 'undefined' && isTerrainCreatorMode)
  ) {
    if (state.vehicles.length > 0) {
      clearOrdinaryTrafficVisuals(state);
      state.dirty = true;
    }
    if (
      typeof isTerrainCreatorMode !== 'undefined'
      && isTerrainCreatorMode
      && state.iceCreamEvent
    ) {
      destroyIceCreamEvent(state.iceCreamEvent);
      state.iceCreamEvent = null;
      state.iceCreamCooldownMs = randomIceCreamCooldown(true);
    }
    return;
  }

  ensureTrafficStarterTextures(scene);
  if (getReadyTrafficModels(scene).length === 0) return;

  if (state.dirty || time - state.lastRefreshTime >= TRAFFIC_VISUAL_CONFIG.refreshMs) {
    refreshVisibleTraffic(scene, time);
  }

  if (speedMultiplier <= 0 || state.vehicles.length === 0) return;

  const viewRect = getTrafficCameraRect(scene, TRAFFIC_VISUAL_CONFIG.viewportPaddingTiles);
  const leaders = state.iceCreamEvent
    ? [...state.vehicles, state.iceCreamEvent]
    : state.vehicles;
  state.vehicles = state.vehicles.filter((vehicle) => {
    if (trafficVehicleHasBlockingLeader(vehicle, leaders)) return true;
    const progressAmount = computeTrafficProgressAmount(
      delta,
      paused,
      speedMultiplier,
      TRAFFIC_VISUAL_CONFIG,
      vehicle.model.speedFactor * getTrafficLegSpeedFactor(vehicle.leg),
    );
    const keep = advanceTrafficVehicle(scene, vehicle, progressAmount, viewRect, time);
    if (!keep) destroyTrafficVehicle(vehicle);
    return keep;
  });
}

const trafficVisualTestApi = {
  TRAFFIC_VISUAL_CONFIG,
  ICE_CREAM_EVENT_CONFIG,
  ICE_CREAM_EDUCATION_TARGET_TYPES,
  ICE_CREAM_VISITOR_ATTRACTION_TYPES,
  ICE_CREAM_TARGET_TYPES,
  TRAFFIC_DIRECTIONS,
  TRAFFIC_MODEL_REGISTRY,
  TRAFFIC_MODEL_BY_ID,
  getTrafficTextureDirection,
  getTrafficLeftLaneOffset,
  getTrafficLaneOffsetAmount,
  computeTrafficVehicleTarget,
  computeTrafficSpawnBudget,
  computeTrafficProgressAmount,
  pickWeightedTrafficModel,
  classifyTrafficTurn,
  chooseNextTrafficTile,
  isTrafficFlatRoadTile,
  getTrafficLegSpeedFactor,
  getTrafficDirectionForDelta,
  canSpawnIceCreamTruckForWeather,
  isIceCreamTargetBuilding,
  findTrafficPathOutsideView,
  getTrafficVirtualOutsideTile,
  getIceCreamArrivalDirectionForBuildingSide,
  collectIceCreamParkingCandidates,
  getTrafficRoadSurface,
  trafficRoadSurfacesConnect,
  getTrafficLegSurfaceLifts,
  evaluateTrafficLeg,
  getTrafficCameraRect,
  setTrafficVehicleVisual,
  refreshTrafficVehicleDepths,
  trafficModelTexturesAreReady,
  requestTrafficModels,
  getReadyTrafficModels,
  setupTrafficVisuals,
  updateTrafficVisuals,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = trafficVisualTestApi;
}

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    setupTrafficVisuals,
    updateTrafficVisuals,
    clearTrafficVisuals,
    invalidateTrafficVisualView,
    invalidateTrafficVisualNetwork,
  });
}
