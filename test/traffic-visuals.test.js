const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const {
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
    icecream: 1,
  })) {
    assert.ok(Math.abs(weights[category] - expected) < 1e-9, category);
  }
  assert.equal(pickWeightedTrafficModel(() => 0).id, 'bus_kmb');
  assert.equal(pickWeightedTrafficModel(() => 0.999999).id, 'icecream_van');
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
  });
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
  assert.match(main, /tile\.setVisible\(/);
  assert.match(main, /camera\.scrollY\s*-=\s*dy\s*\/\s*camera\.zoom;[\s\S]*?updateTerrainViewportCulling\(this\)/);
  assert.match(main, /camera\.setZoom\(newZoom\);[\s\S]*?updateTerrainViewportCulling\(this,\s*true\)/);
  assert.match(main, /setupTrafficVisuals\(this\)/);
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
