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
    scale: 0.084, weight: 1, speedFactor: 0.85, headwayFactor: 0.62, originY: 0.82,
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

function clearTrafficVisuals(scene) {
  const state = scene?.trafficVisualState;
  if (!state) return;
  state.vehicles.forEach(destroyTrafficVehicle);
  state.vehicles.length = 0;
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
  return state.vehicles.some((vehicle) => (
    vehicle.current.row === current.row
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
    if (state.vehicles.length > 0) clearTrafficVisuals(scene);
    return;
  }

  if (
    camera.zoom < TRAFFIC_VISUAL_CONFIG.zoomMin
    || (typeof isTerrainCreatorMode !== 'undefined' && isTerrainCreatorMode)
  ) {
    if (state.vehicles.length > 0) clearTrafficVisuals(scene);
    return;
  }

  ensureTrafficStarterTextures(scene);
  if (getReadyTrafficModels(scene).length === 0) return;

  if (state.dirty || time - state.lastRefreshTime >= TRAFFIC_VISUAL_CONFIG.refreshMs) {
    refreshVisibleTraffic(scene, time);
  }

  const paused = typeof simPaused !== 'undefined' && simPaused;
  const speedMultiplier = paused
    ? 0
    : Math.max(0, Number(typeof simSpeedMul === 'undefined' ? 1 : simSpeedMul) || 0);
  if (speedMultiplier <= 0 || state.vehicles.length === 0) return;

  const viewRect = getTrafficCameraRect(scene, TRAFFIC_VISUAL_CONFIG.viewportPaddingTiles);
  state.vehicles = state.vehicles.filter((vehicle) => {
    if (trafficVehicleHasBlockingLeader(vehicle, state.vehicles)) return true;
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
