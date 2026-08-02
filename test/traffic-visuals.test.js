const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const {
  TRAFFIC_VISUAL_CONFIG,
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
  isTrafficSevereWeather,
  TRAFFIC_SEVERE_WEATHER_GROUNDED_CATEGORIES,
  chooseTrafficModelForSpawn,
  purgeSevereWeatherGroundedTraffic,
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
  getReadyTrafficModels,
  setupTrafficVisuals,
  updateTrafficVisuals,
} = require('../traffic-visuals');

test('vehicle texture directions match the supplied four-view convention', () => {
  assert.equal(getTrafficTextureDirection(-1, -1), 'nw');
  assert.equal(getTrafficTextureDirection(-1, 1), 'sw');
  assert.equal(getTrafficTextureDirection(1, -1), 'ne');
  assert.equal(getTrafficTextureDirection(1, 1), 'se');
  assert.equal(getTrafficTextureDirection(0, 0, 'sw'), 'sw');
});

test('logical eastbound traffic remaps through every rotated screen view', () => {
  const eastboundScreenVectors = [
    { dx: 50, dy: 25, texture: 'se' },
    { dx: -50, dy: 25, texture: 'sw' },
    { dx: -50, dy: -25, texture: 'nw' },
    { dx: 50, dy: -25, texture: 'ne' },
  ];
  eastboundScreenVectors.forEach(({ dx, dy, texture }) => {
    assert.equal(getTrafficTextureDirection(dx, dy), texture);
  });
});

test('registry contains 19 complete four-direction vehicle models', () => {
  assert.equal(TRAFFIC_MODEL_REGISTRY.length, 19);
  assert.deepEqual(TRAFFIC_DIRECTIONS, ['ne', 'nw', 'se', 'sw']);
  const ids = new Set();
  let assetCount = 0;
  for (const model of TRAFFIC_MODEL_REGISTRY) {
    assert.ok(!ids.has(model.id), `duplicate traffic model: ${model.id}`);
    ids.add(model.id);
    for (const direction of TRAFFIC_DIRECTIONS) {
      const asset = model.directions[direction];
      assert.ok(asset?.key, `${model.id} ${direction} texture key`);
      assert.ok(fs.existsSync(path.join(ROOT, asset.path)), asset.path);
      assetCount++;
    }
  }
  assert.equal(assetCount, 76);
});

test('vehicle scales preserve realistic relative lengths', () => {
  const scale = (id) => TRAFFIC_MODEL_BY_ID.get(id).scale;
  assert.equal(scale('bus_kmb'), 0.18816);
  assert.equal(scale('bus_citybus'), 0.18816);
  assert.equal(scale('minibus_green'), 0.1104);
  assert.equal(scale('truck_basic'), 0.1032);
  assert.equal(scale('truck_fish'), 0.0984);
  assert.equal(scale('van_plain'), 0.0852);
  assert.equal(scale('icecream_van'), 0.084);
  assert.equal(scale('car_odyssey'), 0.0756);
  assert.equal(scale('taxi_red'), 0.0732);
  assert.equal(scale('car_hrv'), 0.0684);
  assert.ok(scale('bus_kmb') > scale('minibus_green'));
  assert.ok(scale('minibus_green') > scale('van_plain'));
  assert.ok(scale('van_plain') > scale('taxi_red'));
});

test('category weights match the planned Hong Kong traffic mix', () => {
  const weights = Object.create(null);
  for (const model of TRAFFIC_MODEL_REGISTRY) {
    weights[model.category] = (weights[model.category] ?? 0) + model.weight;
  }
  for (const [category, expected] of Object.entries({
    bus: 10,
    car: 34,
    minibus: 14,
    taxi: 26,
    truck: 7,
    van: 8,
    icecream: 0,
  })) {
    assert.ok(Math.abs(weights[category] - expected) < 1e-9, category);
  }
  assert.equal(pickWeightedTrafficModel(() => 0).id, 'bus_kmb');
  assert.equal(pickWeightedTrafficModel(() => 0.999999).id, 'van_namkee');
  assert.notEqual(pickWeightedTrafficModel(() => 0.999999).id, 'icecream_van');
});

test('ice cream truck only starts in dry clear or cloudy weather', () => {
  const dry = {
    typhoonStage: 'none',
    typhoonActive: false,
    rainfallMm: 0,
    rainWarning: 'none',
  };
  assert.equal(canSpawnIceCreamTruckForWeather({ ...dry, condition: 'clear' }), true);
  assert.equal(canSpawnIceCreamTruckForWeather({ ...dry, condition: 'cloudy' }), true);
  for (const condition of ['showers', 'heavyRain', 'hot', 'cool', 'windy']) {
    assert.equal(canSpawnIceCreamTruckForWeather({ ...dry, condition }), false, condition);
  }
  assert.equal(canSpawnIceCreamTruckForWeather({ ...dry, condition: 'clear', rainfallMm: 1 }), false);
  assert.equal(canSpawnIceCreamTruckForWeather({ ...dry, condition: 'clear', rainWarning: 'amber' }), false);
  assert.equal(canSpawnIceCreamTruckForWeather({ ...dry, condition: 'cloudy', typhoonActive: true }), false);
  for (const typhoonStage of ['signal1', 'signal3', 'signal8', 'signal9', 'signal10']) {
    assert.equal(
      canSpawnIceCreamTruckForWeather({ ...dry, condition: 'clear', typhoonStage }),
      false,
      typhoonStage,
    );
  }
});

test('only signal 8 or above grounds buses and minibuses', () => {
  ['none', 'signal1', 'signal3'].forEach((typhoonStage) => {
    assert.equal(isTrafficSevereWeather({ typhoonStage }), false);
  });
  ['signal8', 'signal9', 'signal10'].forEach((typhoonStage) => {
    assert.equal(isTrafficSevereWeather({ typhoonStage }), true);
  });
  assert.deepEqual([...TRAFFIC_SEVERE_WEATHER_GROUNDED_CATEGORIES].sort(), ['bus', 'minibus']);
});

test('signal8+ excludes buses and minibuses from new spawns, but leaves every other category untouched', () => {
  // Regression test: "8號風球以上巴士小巴停駛" - only these two categories are
  // grounded; taxis/cars/trucks/vans must keep spawning normally so overall
  // traffic doesn't just vanish during a storm.
  const scene = { textures: { exists: () => true } };
  const originalCity = global.city;
  try {
    global.city = { weather: { typhoonStage: 'none' } };
    assert.equal(chooseTrafficModelForSpawn(scene, () => 0).id, 'bus_kmb');

    global.city = { weather: { typhoonStage: 'signal8' } };
    const grounded = chooseTrafficModelForSpawn(scene, () => 0);
    assert.equal(grounded.id, 'car_hrv', 'first non-grounded candidate once bus/minibus are filtered out');
    for (let i = 0; i <= 20; i++) {
      const model = chooseTrafficModelForSpawn(scene, () => i / 20);
      assert.ok(model, `a model must still be pickable at pick=${i / 20}`);
      assert.ok(
        !TRAFFIC_SEVERE_WEATHER_GROUNDED_CATEGORIES.includes(model.category),
        `${model.id} (${model.category}) must not spawn during signal8+`,
      );
    }

    global.city = { weather: { typhoonStage: 'signal9' } };
    assert.ok(!TRAFFIC_SEVERE_WEATHER_GROUNDED_CATEGORIES.includes(chooseTrafficModelForSpawn(scene, () => 0).category));

    global.city = { weather: { typhoonStage: 'signal3' } };
    assert.equal(chooseTrafficModelForSpawn(scene, () => 0).id, 'bus_kmb', 'below signal8, buses spawn normally again');
  } finally {
    if (originalCity === undefined) delete global.city;
    else global.city = originalCity;
  }
});

test('signal8+ immediately removes any bus/minibus already on the road, leaving other vehicles alone', () => {
  // Regression test: "全部巴士小巴在路上消失" - a selective purge, not the
  // blanket clearOrdinaryTrafficVisuals used for e.g. the zoom-out gate.
  const destroyed = [];
  const makeVehicle = (modelId) => ({
    model: TRAFFIC_MODEL_BY_ID.get(modelId),
    sprite: { destroy: () => destroyed.push(modelId) },
  });
  const state = {
    vehicles: [makeVehicle('bus_kmb'), makeVehicle('car_hrv'), makeVehicle('minibus_green'), makeVehicle('taxi_red')],
    dirty: false,
  };

  purgeSevereWeatherGroundedTraffic(state, { typhoonStage: 'none' });
  assert.deepEqual(destroyed, []);
  assert.equal(state.vehicles.length, 4, 'below signal8, nothing is purged');
  assert.equal(state.dirty, false);

  purgeSevereWeatherGroundedTraffic(state, { typhoonStage: 'signal8' });
  assert.deepEqual(destroyed.sort(), ['bus_kmb', 'minibus_green']);
  assert.deepEqual(state.vehicles.map((vehicle) => vehicle.model.id).sort(), ['car_hrv', 'taxi_red']);
  assert.equal(state.dirty, true, 'purging must mark the view dirty so a refill is considered next refresh');

  // Idempotent - nothing left to purge, second call is a safe no-op.
  state.dirty = false;
  purgeSevereWeatherGroundedTraffic(state, { typhoonStage: 'signal8' });
  assert.equal(destroyed.length, 2);
  assert.equal(state.dirty, false);
});

test('runtime traffic update calls the severe-weather purge on every frame, before the pause/zoom/refresh gates', () => {
  // The purge (tested directly above) has to run unconditionally near the
  // top of updateTrafficVisuals - after the visibility early-return, but
  // before pause/zoom/dirty gating - so a bus/minibus vanishes the moment
  // signal8+ is detected, even mid-pause or while zoomed out. A full
  // behavioural run through updateTrafficVisuals itself would need a real
  // road/tile network mocked up (refreshVisibleTraffic re-targets vehicle
  // count from live road load, which would just delete the survivor for an
  // unrelated reason in a roads-less fake scene) - source position is the
  // precise, honest thing to assert here.
  const moduleSource = fs.readFileSync(path.join(ROOT, 'traffic-visuals.js'), 'utf8');
  const bodyStart = moduleSource.indexOf('function updateTrafficVisuals(time, delta) {');
  const bodyEnd = moduleSource.indexOf('\nfunction ', bodyStart + 1);
  const body = moduleSource.slice(bodyStart, bodyEnd);
  const visibilityGateIndex = body.indexOf('if (scene.scene?.isVisible');
  const purgeCallIndex = body.indexOf('purgeSevereWeatherGroundedTraffic(state,');
  const pauseIndex = body.indexOf('const paused =');
  const zoomGateIndex = body.indexOf('camera.zoom < TRAFFIC_VISUAL_CONFIG.zoomMin');
  const refreshIndex = body.indexOf('refreshVisibleTraffic(scene, time)');
  assert.ok(visibilityGateIndex >= 0 && purgeCallIndex > visibilityGateIndex, 'purge must run after the visibility early-return');
  assert.ok(purgeCallIndex < pauseIndex, 'purge must run unconditionally, before pause is even computed');
  assert.ok(purgeCallIndex < zoomGateIndex, 'purge must run before the zoom gate');
  assert.ok(purgeCallIndex < refreshIndex, 'purge must run before refreshVisibleTraffic re-targets vehicle count');
});

test('ice cream targets include education sites and every non-airport visitor attraction', () => {
  assert.deepEqual(ICE_CREAM_EDUCATION_TARGET_TYPES, [
    'primary_school',
    'secondary_school',
    'community_college',
    'university',
  ]);
  assert.deepEqual(ICE_CREAM_VISITOR_ATTRACTION_TYPES, [
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
  assert.deepEqual(ICE_CREAM_TARGET_TYPES, [
    'primary_school',
    'secondary_school',
    'community_college',
    'university',
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
  ICE_CREAM_TARGET_TYPES.forEach((type) => assert.equal(isIceCreamTargetBuilding(type), true));
  ['library', 'park_large', 'airport', 'container_port', 'stock_exchange', 'residential'].forEach((type) => {
    assert.equal(isIceCreamTargetBuilding(type), false);
  });
});

test('viewport routing reaches the nearest connected road outside the current view', () => {
  const roads = new Set(['2:0', '2:1', '2:2', '2:3', '2:4']);
  const deltas = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  const isRoad = (row, col) => roads.has(`${row}:${col}`);
  const getNeighbours = (row, col) => deltas
    .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
    .filter((tile) => isRoad(tile.row, tile.col));
  const targetToOutside = findTrafficPathOutsideView(
    { row: 2, col: 2 },
    (row, col) => col >= 4,
    getNeighbours,
  );
  assert.deepEqual(targetToOutside, [
    { row: 2, col: 2 },
    { row: 2, col: 3 },
    { row: 2, col: 4 },
  ]);
  const arrivalPath = [...targetToOutside].reverse();
  assert.deepEqual(
    getTrafficVirtualOutsideTile(arrivalPath),
    { row: 2, col: 5 },
  );
  assert.equal(
    findTrafficPathOutsideView({ row: 2, col: 2 }, () => false, getNeighbours),
    null,
  );
  assert.deepEqual(
    findTrafficPathOutsideView(
      { row: 2, col: 2 },
      (_row, col) => col === 0 || col === 4,
      getNeighbours,
      { firstStep: { row: 2, col: 1 } },
    ),
    [
      { row: 2, col: 2 },
      { row: 2, col: 1 },
      { row: 2, col: 0 },
    ],
  );
});

test('ice cream arrival direction keeps the destination curb on the traffic-left side', () => {
  const cases = [
    { buildingSide: { row: -1, col: 0 }, direction: { row: 0, col: 1 } },
    { buildingSide: { row: 0, col: 1 }, direction: { row: 1, col: 0 } },
    { buildingSide: { row: 1, col: 0 }, direction: { row: 0, col: -1 } },
    { buildingSide: { row: 0, col: -1 }, direction: { row: -1, col: 0 } },
  ];
  for (const { buildingSide, direction } of cases) {
    assert.deepEqual(
      getIceCreamArrivalDirectionForBuildingSide(buildingSide),
      direction,
    );
    const left = getTrafficLeftLaneOffset(direction.row, direction.col, 1);
    assert.deepEqual(left, buildingSide);
  }
  assert.equal(getIceCreamArrivalDirectionForBuildingSide({ row: 1, col: 1 }), null);
});

test('parking candidates sit on roads directly outside a target footprint', () => {
  const roads = new Set(['1:2', '2:4', '4:3']);
  const candidates = collectIceCreamParkingCandidates(
    { row: 2, col: 2 },
    { type: 'primary_school', footprintRows: 2, footprintCols: 2 },
    (row, col) => roads.has(`${row}:${col}`),
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.road).sort((a, b) => a.row - b.row || a.col - b.col),
    [{ row: 1, col: 2 }, { row: 2, col: 4 }, { row: 4, col: 3 }],
  );
  const northRoad = candidates.find((candidate) => candidate.road.row === 1);
  assert.deepEqual(northRoad.buildingSide, { row: 1, col: 0 });
  assert.deepEqual(
    collectIceCreamParkingCandidates(
      { row: 2, col: 2 },
      { type: 'hospital', footprintRows: 2, footprintCols: 2 },
      () => true,
    ),
    [],
  );
});

test('left-hand traffic offsets to the logical left of every travel direction', () => {
  assert.deepEqual(getTrafficLeftLaneOffset(-1, 0), { row: 0, col: -0.20 });
  assert.deepEqual(getTrafficLeftLaneOffset(0, 1), { row: -0.20, col: 0 });
  assert.deepEqual(getTrafficLeftLaneOffset(1, 0), { row: 0, col: 0.20 });
  assert.deepEqual(getTrafficLeftLaneOffset(0, -1), { row: 0.20, col: 0 });
});

test('same-sign diagonals and NE travel use their calibrated narrower lane offsets', () => {
  assert.equal(getTrafficLaneOffsetAmount(50, 25), 0.12);
  assert.equal(getTrafficLaneOffsetAmount(-50, -25), 0.12);
  assert.equal(getTrafficLaneOffsetAmount(-50, 25), 0.20);
  assert.equal(getTrafficLaneOffsetAmount(50, -25), 0.08);
});

test('vehicle target follows visible traffic load and respects threshold and cap', () => {
  assert.equal(computeTrafficVehicleTarget([0, 0.01, 0.02]), 0);
  assert.equal(computeTrafficVehicleTarget(Array(16).fill(1)), 5);
  assert.equal(computeTrafficVehicleTarget(Array(400).fill(1)), TRAFFIC_VISUAL_CONFIG.maxVehicles);
  assert.equal(TRAFFIC_VISUAL_CONFIG.maxVehicles, 28);
});

test('cold-start spawning is spread across bounded refresh batches', () => {
  assert.equal(computeTrafficSpawnBudget(0, 28), 4);
  assert.equal(computeTrafficSpawnBudget(24, 28), 4);
  assert.equal(computeTrafficSpawnBudget(27, 28), 1);
  assert.equal(computeTrafficSpawnBudget(28, 28), 0);
  assert.equal(computeTrafficSpawnBudget(40, 28), 0);
});

test('movement follows pause and simulation speed while clamping long frames', () => {
  assert.equal(computeTrafficProgressAmount(50, false, 1), 0.045);
  assert.equal(computeTrafficProgressAmount(50, false, 2), 0.09);
  assert.equal(computeTrafficProgressAmount(200, false, 1), 0.045);
  assert.equal(computeTrafficProgressAmount(50, true, 2), 0);
  assert.ok(
    Math.abs(
      computeTrafficProgressAmount(50, false, 1, TRAFFIC_VISUAL_CONFIG, 1.35) - 0.06075
    ) < 1e-12
  );
});

test('flat-road eligibility excludes elevated roads, bridges, and bridge underlays', () => {
  const layers = {
    mapData: [[2, 2, 2, 2, 2]],
    heightMap: [[0, 1, 0, 0, 0]],
    bridgeMap: [[null, null, 'deck:row', null, null]],
    roadUnderlayMap: [[null, null, null, 5, null]],
    slopeMap: [[false, false, false, false, true]],
    roadValue: 2,
  };
  assert.equal(isTrafficFlatRoadTile(0, 0, layers), true);
  assert.equal(isTrafficFlatRoadTile(0, 1, layers), false);
  assert.equal(isTrafficFlatRoadTile(0, 2, layers), false);
  assert.equal(isTrafficFlatRoadTile(0, 3, layers), false);
  assert.equal(isTrafficFlatRoadTile(0, 4, layers), false);
});

test('traffic surfaces describe terrain slopes, crests, bridge ramps, and bridge decks', () => {
  const terrainSlopeLayers = {
    mapData: [[2, 2, 2]],
    heightMap: [[0, 1, 1]],
    bridgeMap: [[null, null, null]],
    roadSlopeKeyMap: [[null, 'road_hill_w', null]],
    roadValue: 2,
    heightStepPixels: 12,
  };
  const slope = getTrafficRoadSurface(0, 1, terrainSlopeLayers);
  assert.equal(slope.kind, 'terrain-slope');
  assert.deepEqual(slope.directions, ['w', 'e']);
  assert.equal(slope.centerLift, 6);
  assert.deepEqual(slope.endpointLifts, { w: 0, e: 12 });

  const elevated = getTrafficRoadSurface(0, 2, terrainSlopeLayers);
  assert.equal(elevated.kind, 'elevated-flat');
  assert.equal(elevated.centerLift, 12);

  const crestLayers = {
    mapData: [[2], [2], [2]],
    heightMap: [[0], [1], [0]],
    bridgeMap: [[null], [null], [null]],
    roadSlopeKeyMap: [[null], ['road_hill2_n'], [null]],
    roadValue: 2,
    heightStepPixels: 12,
  };
  const crest = getTrafficRoadSurface(1, 0, crestLayers);
  assert.equal(crest.kind, 'terrain-crest');
  assert.deepEqual(crest.directions, ['n', 's']);
  assert.equal(crest.centerLift, 12);
  assert.deepEqual(crest.endpointLifts, { n: 0, s: 0 });

  const bridgeLayers = {
    mapData: [[2, 2, 5]],
    heightMap: [[0, 0, 0]],
    bridgeMap: [[null, 'ramp:e', 'deck:row']],
    roadSlopeKeyMap: [[null, null, null]],
    roadValue: 2,
    bridgeDeckLiftPixels: 15,
  };
  const ramp = getTrafficRoadSurface(0, 1, bridgeLayers);
  const deck = getTrafficRoadSurface(0, 2, bridgeLayers);
  assert.equal(ramp.kind, 'bridge-ramp');
  assert.deepEqual(ramp.directions, ['e', 'w']);
  assert.equal(ramp.centerLift, 7.5);
  assert.deepEqual(ramp.endpointLifts, { e: 15, w: 0 });
  assert.equal(deck.kind, 'bridge-deck');
  assert.deepEqual(deck.directions, ['e', 'w']);
  assert.equal(deck.centerLift, 15);

  bridgeLayers.bridgeMap[0][2] = 'deck:col';
  const columnDeck = getTrafficRoadSurface(0, 2, bridgeLayers);
  assert.deepEqual(columnDeck.directions, ['n', 's']);
});

test('traffic surface connections require matching direction and boundary height', () => {
  const terrainLayers = {
    mapData: [[2, 2, 2]],
    heightMap: [[0, 1, 1]],
    bridgeMap: [[null, null, null]],
    roadSlopeKeyMap: [[null, 'road_hill_w', null]],
    roadValue: 2,
    heightStepPixels: 12,
  };
  const low = getTrafficRoadSurface(0, 0, terrainLayers);
  const slope = getTrafficRoadSurface(0, 1, terrainLayers);
  const high = getTrafficRoadSurface(0, 2, terrainLayers);
  assert.equal(trafficRoadSurfacesConnect(low, slope, 'e'), true);
  assert.equal(trafficRoadSurfacesConnect(slope, high, 'e'), true);
  assert.equal(trafficRoadSurfacesConnect(low, high, 'e'), false);

  const bridgeLayers = {
    mapData: [[2, 2, 5]],
    heightMap: [[0, 0, 0]],
    bridgeMap: [[null, 'ramp:e', 'deck:row']],
    roadSlopeKeyMap: [[null, null, null]],
    roadValue: 2,
    bridgeDeckLiftPixels: 15,
  };
  const shore = getTrafficRoadSurface(0, 0, bridgeLayers);
  const ramp = getTrafficRoadSurface(0, 1, bridgeLayers);
  const deck = getTrafficRoadSurface(0, 2, bridgeLayers);
  assert.equal(trafficRoadSurfacesConnect(shore, ramp, 'e'), true);
  assert.equal(trafficRoadSurfacesConnect(ramp, deck, 'e'), true);
  assert.equal(trafficRoadSurfacesConnect(deck, deck, 'n'), false);
});

test('traffic legs rise continuously at surface boundaries and adjust hill speed', () => {
  const layers = {
    mapData: [[2, 2, 2]],
    heightMap: [[0, 1, 1]],
    bridgeMap: [[null, null, null]],
    roadSlopeKeyMap: [[null, 'road_hill_w', null]],
    roadValue: 2,
    heightStepPixels: 12,
  };
  assert.deepEqual(
    getTrafficLegSurfaceLifts(
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      layers,
    ),
    { start: 0, boundary: 0, end: 6 },
  );
  assert.deepEqual(
    getTrafficLegSurfaceLifts(
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      layers,
    ),
    { start: 6, boundary: 12, end: 12 },
  );

  const leg = {
    start: { x: 0, y: 20, depthY: 30 },
    control: { x: 5, y: 20, depthY: 35 },
    end: { x: 10, y: 20, depthY: 40 },
    surfaceLifts: { start: 0, boundary: 0, end: 6 },
  };
  assert.equal(evaluateTrafficLeg(leg, 0.5).surfaceLift, 0);
  assert.equal(evaluateTrafficLeg(leg, 0.75).surfaceLift, 3);
  assert.equal(evaluateTrafficLeg(leg, 1).y, 14);
  assert.equal(evaluateTrafficLeg(leg, 1).depthY, 34);
  assert.equal(evaluateTrafficLeg(leg, 1).dx, 10);
  assert.equal(evaluateTrafficLeg(leg, 1).dy, 0);
  assert.equal(getTrafficLegSpeedFactor(leg), TRAFFIC_VISUAL_CONFIG.uphillSpeedFactor);
  assert.equal(
    getTrafficLegSpeedFactor({ surfaceLifts: { start: 6, boundary: 0, end: 0 } }),
    TRAFFIC_VISUAL_CONFIG.downhillSpeedFactor,
  );
  assert.equal(
    getTrafficLegSpeedFactor({ surfaceLifts: { start: 15, boundary: 15, end: 15 } }),
    1,
  );
});

test('route selection prefers available non-U-turn exits and reverses only at dead ends', () => {
  const previous = { row: 1, col: 0 };
  const current = { row: 1, col: 1 };
  const straight = { row: 1, col: 2 };
  const left = { row: 0, col: 1 };
  const right = { row: 2, col: 1 };

  assert.equal(classifyTrafficTurn(previous, current, straight), 'straight');
  assert.equal(classifyTrafficTurn(previous, current, left), 'left');
  assert.equal(classifyTrafficTurn(previous, current, right), 'right');
  assert.deepEqual(
    chooseNextTrafficTile(previous, current, [previous, straight, left, right], () => 0),
    straight,
  );
  assert.deepEqual(chooseNextTrafficTile(previous, current, [previous], () => 0.5), previous);
});

test('quadratic traffic legs interpolate position, depth, and travel derivative', () => {
  const leg = {
    start: { x: 0, y: 0, depthY: 10 },
    control: { x: 5, y: 0, depthY: 15 },
    end: { x: 10, y: 10, depthY: 20 },
  };
  const midpoint = evaluateTrafficLeg(leg, 0.5);
  assert.deepEqual(midpoint, {
    x: 5,
    y: 2.5,
    depthY: 15,
    dx: 10,
    dy: 10,
    surfaceLift: 0,
  });
});

test('cubic parking legs move forward while easing laterally into and out of the curb', () => {
  const leg = {
    cubic: true,
    start: { x: 0, y: 0, depthY: 0 },
    control1: { x: 4, y: 0, depthY: 2 },
    control2: { x: 6, y: 4, depthY: 4 },
    end: { x: 10, y: 4, depthY: 6 },
  };
  const start = evaluateTrafficLeg(leg, 0);
  const approach = evaluateTrafficLeg(leg, 0.25);
  const end = evaluateTrafficLeg(leg, 1);
  assert.deepEqual(
    { x: start.x, y: start.y, dx: start.dx, dy: start.dy },
    { x: 0, y: 0, dx: 12, dy: 0 },
  );
  assert.equal(approach.x, 2.6875);
  assert.equal(approach.y, 0.625);
  assert.deepEqual(
    { x: end.x, y: end.y, dx: end.dx, dy: end.dy },
    { x: 10, y: 4, dx: 12, dy: 0 },
  );
});

test('camera bounds follow live scroll values without relying on stale Phaser worldView', () => {
  global.TILE_WIDTH = 100;
  global.TILE_IMAGE_HEIGHT = 65;
  const rect = getTrafficCameraRect({
    cameras: {
      main: {
        scrollX: 500,
        scrollY: 250,
        width: 1200,
        height: 700,
        zoom: 1.4,
        originX: 0.5,
        originY: 0.5,
        worldView: { x: 0, y: 0, width: 1, height: 1 },
      },
    },
  });
  assert.ok(Math.abs(rect.x - 671.4285714285714) < 1e-9);
  assert.ok(Math.abs(rect.y - 350) < 1e-9);
  assert.ok(Math.abs(rect.width - 857.1428571428572) < 1e-9);
  assert.ok(Math.abs(rect.height - 500) < 1e-9);
  delete global.TILE_WIDTH;
  delete global.TILE_IMAGE_HEIGHT;
});

test('moving vehicles batch depth sorts while continuing to update position', () => {
  global.TILE_HEIGHT = 50;
  global.getWorldDepth = (_layer, localDepth) => 200000 + localDepth;
  let positions = 0;
  let depthUpdates = 0;
  const vehicle = {
    model: TRAFFIC_MODEL_BY_ID.get('car_hrv'),
    textureDirection: 'ne',
    sprite: {
      texture: { key: 'traffic_car_hrv_ne' },
      setTexture() {},
      setPosition() { positions++; },
      setDepth() { depthUpdates++; },
    },
  };
  const position = { x: 10, y: 20, depthY: 30, dx: 1, dy: -1 };

  setTrafficVehicleVisual(vehicle, position, 0, true);
  setTrafficVehicleVisual(vehicle, position, 50);
  setTrafficVehicleVisual(vehicle, position, 124);
  setTrafficVehicleVisual(vehicle, position, 125);

  assert.equal(positions, 4);
  assert.equal(depthUpdates, 1);

  const state = { vehicles: [vehicle], nextDepthRefreshTime: 0 };
  refreshTrafficVehicleDepths(state, 0);
  refreshTrafficVehicleDepths(state, 249);
  refreshTrafficVehicleDepths(state, 250);
  assert.equal(depthUpdates, 3);
  delete global.TILE_HEIGHT;
  delete global.getWorldDepth;
});

test('zoom threshold loads only one starter quartet, then clears vehicles without unloading textures', () => {
  const loaded = new Set();
  const queued = [];
  const callbacks = {};
  let starts = 0;
  let destroyed = 0;
  const scene = {
    cameras: { main: { zoom: 1.39 } },
    textures: { exists: (key) => loaded.has(key) },
    load: {
      isLoading: () => false,
      image: (key, assetPath) => queued.push({ key, assetPath }),
      once: (event, callback) => { callbacks[event] = callback; },
      start: () => { starts++; },
    },
  };
  const state = setupTrafficVisuals(scene);

  updateTrafficVisuals.call(scene, 0, 16);
  assert.equal(starts, 0);

  scene.cameras.main.zoom = 1.4;
  updateTrafficVisuals.call(scene, 16, 16);
  updateTrafficVisuals.call(scene, 32, 16);
  assert.equal(queued.length, 4);
  assert.equal(starts, 1);

  queued.forEach(({ key }) => loaded.add(key));
  const firstComplete = callbacks.complete;
  firstComplete();
  assert.equal(getReadyTrafficModels(scene).length, 1);
  assert.equal(starts, 1);

  state.vehicles.push({
    model: TRAFFIC_MODEL_REGISTRY[0],
    sprite: { destroy: () => { destroyed++; } },
  });
  scene.cameras.main.zoom = 1.39;
  updateTrafficVisuals.call(scene, 48, 16);
  assert.equal(destroyed, 1);
  assert.equal(state.vehicles.length, 0);
  assert.equal(loaded.size, 4);
});

test('traffic module is loaded before main and wired into lifecycle invalidation hooks', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const landing = fs.readFileSync(path.join(ROOT, 'landing-screen.js'), 'utf8');
  const topbar = fs.readFileSync(path.join(ROOT, 'topbar.js'), 'utf8');
  const save = fs.readFileSync(path.join(ROOT, 'save.js'), 'utf8');
  const infrastructure = fs.readFileSync(path.join(ROOT, 'sim-infrastructure.js'), 'utf8');

  assert.ok(html.indexOf('traffic-visuals.js') < html.indexOf('main.js'));
  assert.match(main, /scene:\s*\{\s*preload,\s*create,\s*update:\s*updateGameFrame\s*\}/);
  assert.match(main, /function updateGameFrame\(time,\s*delta\)/);
  assert.match(main, /updateTerrainViewportCulling\(this\)/);
  assert.match(main, /updateTrafficVisuals\.call\(this,\s*time,\s*delta\)/);
  assert.match(main, /function updateTerrainViewportCulling\(scene,\s*force\s*=\s*false\)/);
  assert.match(main, /function setTerrainSpriteViewportActive\(tile,\s*active\)/);
  assert.match(main, /tile\.removeFromDisplayList\(\)/);
  assert.match(main, /getTerrainViewportLogicalRange\(scene,/);
  assert.match(main, /camera\.scrollY\s*-=\s*dy\s*\/\s*camera\.zoom;[\s\S]*?updateTerrainViewportCulling\(this\)/);
  assert.match(main, /camera\.setZoom\(newZoom\);[\s\S]*?updateTerrainViewportCulling\(this,\s*true\)/);
  assert.match(main, /setupTrafficVisuals\(this\)/);
  assert.match(main, /\{\s*key:\s*'event_ice_cream_truck',\s*file:\s*'Sounds\/iceCreamTruck\.m4a'\s*\}/);
  assert.ok(fs.existsSync(path.join(ROOT, 'Sounds/iceCreamTruck.m4a')));
  assert.match(main, /scene\.renderLayerMode\s*=\s*'depth-bands'/);
  assert.match(main, /this\.scene\.setVisible\(false\)/);
  assert.match(landing, /setGameWorldVisible\(true\)/);
  assert.match(topbar, /setGameWorldVisible\(false\)/);
  assert.match(main, /invalidateTrafficVisualView\(this,\s*true\)/);
  assert.match(main, /clearTrafficVisuals\(scene\)/);
  assert.match(save, /clearTrafficVisuals\(scene\)/);
  assert.match(infrastructure, /invalidateTrafficVisualNetwork/);
});

test('all traffic textures resolve through the model asset pipeline without legacy bus paths', () => {
  const trafficSource = fs.readFileSync(path.join(ROOT, 'traffic-visuals.js'), 'utf8');
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  assert.match(trafficSource, /resolveModelAssetPath\(path\)/);
  assert.doesNotMatch(trafficSource, /kmb[A-Z]{2}_fixed\.png/);
  assert.doesNotMatch(trafficSource, /TRAFFIC_BUS_TEXTURES/);
  assert.match(trafficSource, /addToRenderLayer\(scene,\s*sprite,\s*'objectLayer'\)/);
  assert.match(trafficSource, /getWorldDepth\('object',\s*position\.depthY \+ TILE_HEIGHT \/ 2\)/);
  assert.doesNotMatch(main, /traffic:\s*250000/);
});
