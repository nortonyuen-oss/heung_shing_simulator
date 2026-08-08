const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const growthSource = fs.readFileSync(path.join(ROOT, 'sim-growth.js'), 'utf8');
const simulationSource = fs.readFileSync(path.join(ROOT, 'simulation.js'), 'utf8');
const economySource = fs.readFileSync(path.join(ROOT, 'sim-economy.js'), 'utf8');
const infrastructureSource = fs.readFileSync(path.join(ROOT, 'sim-infrastructure.js'), 'utf8');
const calibrator = require('../visual-route-calibrator.js');

function loadViewportCullingContext() {
  const start = mainSource.indexOf('function getCameraWorldViewRect');
  const end = mainSource.indexOf('function updateGameFrame', start);
  assert.ok(start >= 0 && end > start, 'viewport culling functions must remain extractable');
  const context = vm.createContext({
    MAP_WIDTH: 16,
    MAP_HEIGHT: 16,
    TILE_WIDTH: 10,
    TILE_HEIGHT: 5,
    TILE_IMAGE_HEIGHT: 10,
    MAX_TERRAIN_HEIGHT: 0,
    HEIGHT_STEP_PIXELS: 0,
    Math,
    Number,
    Set,
    performance,
    worldToLogicalPoint: (_scene, x, y) => ({ x: x / 10, y: y / 10 }),
  });
  vm.runInContext(mainSource.slice(start, end), context, { filename: 'main-culling.js' });
  return context;
}

function createTerrainTile(x, y) {
  return {
    x,
    y,
    visible: true,
    displayList: {},
    setVisible(value) { this.visible = value; },
    removeFromDisplayList() { this.displayList = null; },
    addToDisplayList() { this.displayList = {}; },
  };
}

test('terrain viewport keeps only camera-local tiles on the Phaser display list', () => {
  const context = loadViewportCullingContext();
  const scene = {
    cameras: {
      main: { width: 40, height: 40, zoom: 1, originX: 0, originY: 0, scrollX: 0, scrollY: 0 },
    },
    tileSprites: Array.from({ length: 16 }, (_, row) => (
      Array.from({ length: 16 }, (_, col) => createTerrainTile(col * 10, row * 10))
    )),
    buildingSprites: new Map(),
    treeSprites: new Map(),
    zoneOverlays: new Map(),
    powerLineSprites: new Map(),
    bridgeSprites: new Map(),
    districtSignSprites: new Map(),
    children: { queueDepthSort() {} },
  };
  context.scene = scene;
  vm.runInContext('updateTerrainViewportCulling(scene, true)', context);

  const firstActive = scene.tileSprites.flat().filter((tile) => tile.displayList).length;
  assert.equal(firstActive, scene.activeTerrainSpriteIds.size);
  assert.ok(firstActive > 0 && firstActive < 256);
  assert.ok(scene.viewportCullStats.terrainCandidates < 256);

  const firstPasses = scene.viewportCullStats.passes;
  vm.runInContext('updateTerrainViewportCulling(scene)', context);
  assert.equal(scene.viewportCullStats.passes, firstPasses, 'stationary camera must reuse the cull result');

  scene.cameras.main.scrollX = 40;
  vm.runInContext('updateTerrainViewportCulling(scene)', context);
  assert.ok(scene.viewportCullStats.terrainEntered > 0);
  assert.ok(scene.viewportCullStats.terrainExited > 0);
  assert.equal(
    scene.tileSprites.flat().filter((tile) => tile.displayList).length,
    scene.activeTerrainSpriteIds.size,
  );
});

test('terrain grid is created detached to avoid a quadratic first cull pass', () => {
  assert.match(mainSource, /this\.activeTerrainSpriteIds\s*=\s*new Set\(\)/);
  assert.match(mainSource, /this\.make\.image\(\{[\s\S]*?add:\s*false[\s\S]*?\}\)/);
  assert.doesNotMatch(
    mainSource.slice(
      mainSource.indexOf('// Draw the map:'),
      mainSource.indexOf('// Pre-generate zone overlay textures'),
    ),
    /this\.add\.image\(/,
  );
});

test('Phaser follows display rAF without divisor-based hard frame limiting', () => {
  assert.match(mainSource, /fps:\s*\{\s*target:\s*60,\s*limit:\s*0,/);
  assert.doesNotMatch(mainSource, /fps:\s*\{\s*target:\s*60,\s*limit:\s*(?:60|75),/);
});

test('profiler separates raw frame cadence from update and render durations', () => {
  const scene = {
    children: { list: Array(80).fill({}) },
    cameras: { main: { renderList: Array(20).fill({}) } },
    textures: { list: {}, exists: () => false },
    viewportCullStats: { activeTerrain: 16, terrainCandidates: 25 },
  };
  calibrator.setVisualRouteCalibrationTestModeEnabled(true);
  calibrator.recordVisualRoutePerformanceFrameStart(scene, 100);
  calibrator.recordVisualRoutePerformanceFrameStart(scene, 120);
  calibrator.recordVisualRoutePerformanceFrameStart(scene, 142);
  calibrator.recordVisualRoutePerformanceDuration(scene, 'update', 4);
  calibrator.recordVisualRoutePerformanceDuration(scene, 'render', 8);
  const snapshot = calibrator.getVisualRoutePerformanceSnapshot(scene);
  calibrator.setVisualRouteCalibrationTestModeEnabled(false);

  assert.equal(snapshot.frame.averageMs, 21);
  assert.equal(snapshot.frame.p95Ms, 22);
  assert.equal(snapshot.sections.update.averageMs, 4);
  assert.equal(snapshot.sections.render.averageMs, 8);
  assert.deepEqual(snapshot.objects, {
    displayList: 80,
    rendered: 20,
    activeTerrain: 16,
    terrainCandidates: 25,
    terrainObjects: 0,
    buildingSpriteReferences: 0,
    uniqueBuildingSprites: 0,
    treeTiles: 0,
    zoneOverlays: 0,
  });
});

test('legacy terrain and park keys resolve to canonical textures without duplicate preloads', () => {
  assert.match(mainSource, /hill_plateau:\s*'ground_full'/);
  assert.match(mainSource, /park_small:\s*'park_small_open'/);
  assert.doesNotMatch(mainSource, /load\.image\('hill_plateau'/);
  assert.doesNotMatch(mainSource, /load\.image\('park_small'/);
});

test('growth quality maps are reused within a game month and rebuilt at the boundary', () => {
  const end = growthSource.indexOf('function isBuildingHighScoreVisual');
  assert.ok(end > 0, 'growth cache functions must remain extractable');
  let landValueBuilds = 0;
  const context = vm.createContext({
    Date,
    Map,
    Math,
    Number,
    TICKS_PER_MONTH: 4,
    city: { tick: 0 },
    computeLandValueMap: () => {
      landValueBuilds++;
      return [[landValueBuilds]];
    },
    createResidentialQualityContext: (landValueMap) => ({ landValueMap, economy: 0 }),
    createCommercialQualityContext: (landValueMap) => ({ landValueMap, economy: 0 }),
    getResidentialEconomyScore: () => 0.5,
    getCommercialEconomyScore: () => 0.6,
    performance,
  });
  vm.runInContext(growthSource.slice(0, end), context, { filename: 'growth-cache.js' });
  vm.runInContext(`
    first = getZoneGrowthQualityContexts();
    city.tick = 1;
    second = getZoneGrowthQualityContexts();
    city.tick = 4;
    third = getZoneGrowthQualityContexts();
    stats = getZoneGrowthQualityContextCacheStats();
  `, context);

  assert.equal(landValueBuilds, 2);
  assert.equal(context.first, context.second);
  assert.notEqual(context.second, context.third);
  assert.equal(context.stats.hits, 1);
  assert.equal(context.stats.rebuilds, 2);
});

test('mature-city quality-map rebuild is prepared before the monthly budget tick', () => {
  const end = growthSource.indexOf('function isBuildingHighScoreVisual');
  assert.ok(end > 0, 'growth cache functions must remain extractable');
  const stages = [];
  const context = vm.createContext({
    Date,
    Map,
    Math,
    Number,
    TICKS_PER_MONTH: 4,
    city: { tick: 0 },
    computeLandValueMap: () => ({ source: 'initial' }),
    computeTreeCanopyMap: () => { stages.push('canopy'); return { canopy: true }; },
    computePollutionMap: (canopy) => { stages.push('pollution'); return { canopy }; },
    computeLandValueInfluenceMaps: () => { stages.push('influences'); return { influence: true }; },
    composeLandValueMap: () => { stages.push('compose'); return { source: 'staged' }; },
    createResidentialQualityContext: (landValueMap) => ({ landValueMap, economy: 0 }),
    createCommercialQualityContext: (landValueMap) => ({ landValueMap, economy: 0 }),
    getResidentialEconomyScore: () => 0.5,
    getCommercialEconomyScore: () => 0.6,
    performance,
  });
  vm.runInContext(growthSource.slice(0, end), context, { filename: 'growth-staged-cache.js' });
  vm.runInContext(`
    initial = getZoneGrowthQualityContexts();
    city.tick = 1;
    afterCanopy = getZoneGrowthQualityContexts();
    city.tick = 2;
    afterPollution = getZoneGrowthQualityContexts();
    city.tick = 3;
    afterInfluences = getZoneGrowthQualityContexts();
    city.tick = 4;
    completed = getZoneGrowthQualityContexts();
    stagedStats = getZoneGrowthQualityContextCacheStats();
  `, context);

  assert.equal(context.afterCanopy, context.initial);
  assert.equal(context.afterPollution, context.initial);
  assert.equal(context.afterInfluences, context.initial);
  assert.notEqual(context.completed, context.initial);
  assert.equal(context.completed.landValueMap.source, 'staged');
  assert.deepEqual(stages, ['canopy', 'pollution', 'influences', 'compose']);
  assert.equal(context.stagedStats.rebuilds, 2);
  assert.equal(context.stagedStats.pendingStage, null);
});

test('growth reuses a sparse zoned-tile index until zoning changes', () => {
  const end = growthSource.indexOf('function isBuildingHighScoreVisual');
  assert.ok(end > 0, 'growth cache functions must remain extractable');
  const context = vm.createContext({
    Date,
    MAP_HEIGHT: 3,
    MAP_WIDTH: 4,
    Math,
    Number,
    TICKS_PER_MONTH: 4,
    ZONE_NONE: 0,
    city: { tick: 0 },
    performance,
    zoneMap: [
      [0, 1, 0, 2],
      [0, 0, 0, 0],
      [3, 0, 1, 0],
    ],
  });
  vm.runInContext(growthSource.slice(0, end), context, { filename: 'growth-tile-cache.js' });
  vm.runInContext(`
    first = getZoneGrowthTiles();
    second = getZoneGrowthTiles();
    zoneMap[0][1] = ZONE_NONE;
    invalidateZoneGrowthTileCache();
    third = getZoneGrowthTiles();
    tileStats = getZoneGrowthTileCacheStats();
  `, context);

  assert.equal(context.first, context.second);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.first.map(({ id }) => id))),
    ['0:1', '0:3', '2:0', '2:2'],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.third.map(({ id }) => id))),
    ['0:3', '2:0', '2:2'],
  );
  assert.equal(context.tileStats.hits, 1);
  assert.equal(context.tileStats.rebuilds, 2);
  assert.match(growthSource, /for \(const \{ row: r, col: c, id \} of getZoneGrowthTiles\(\)\)/);
});

test('monthly economy reuses the land-value map already built by growth', () => {
  assert.match(
    economySource,
    /getCachedZoneGrowthLandValueMap\(\)[\s\S]*?computeAverageLandValueFromMap\(cachedLandValueMap\)/,
  );
  assert.match(economySource, /sim\.economy\.\$\{section\}/);
  assert.match(economySource, /function computeAverageLandValueFromMap[\s\S]*?getZoneGrowthTiles\(\)/);
});

test('crime and happiness iterate the sparse zoned-tile index', () => {
  assert.match(simulationSource, /function forEachSimulationZonedTile[\s\S]*?getZoneGrowthTiles\(\)/);
  assert.match(simulationSource, /function updateCrimeRateIndex[\s\S]*?forEachSimulationZonedTile/);
  assert.match(simulationSource, /function computeHappiness[\s\S]*?forEachSimulationZonedTile/);
});

test('traffic reuses sparse road and zone indexes between network edits', () => {
  assert.match(infrastructureSource, /let trafficRoadTilesCache = null/);
  assert.match(infrastructureSource, /function updateTrafficMap[\s\S]*?getTrafficRoadTiles\(\)/);
  assert.match(infrastructureSource, /function updateTrafficMap[\s\S]*?getZoneGrowthTiles\(\)/);
  assert.match(
    infrastructureSource,
    /function markTrafficNetworkDirty[\s\S]*?trafficRoadTilesCache = null[\s\S]*?trafficRouteCache\.clear\(\)/,
  );
  assert.doesNotMatch(
    infrastructureSource.match(/function updateTrafficMap\(\)[\s\S]*?\/\/ Accumulate demand/)?.[0] ?? '',
    /trafficMap\[r\]\[c\] = 0/,
  );
});

test('annual autosave is scheduled after the simulation task yields', () => {
  assert.match(mainSource, /function triggerAutosave\(\)[\s\S]*?scheduleAnnualAutosave\(\)/);
  assert.doesNotMatch(
    mainSource.match(/function triggerAutosave\(\)[\s\S]*?\n\}/)?.[0] ?? '',
    /\bsaveGame\(true\);/,
  );
});

test('residential tree/scenic scores are cached per game month and shared across lookups', () => {
  const start = simulationSource.indexOf('let residentialEnvironmentScoreBucket');
  const end = simulationSource.indexOf('function getLocalHealthPollutionPressure', start);
  assert.ok(start >= 0 && end > start, 'residential environment score cache must remain extractable');

  let calls = 0;
  const context = vm.createContext({
    Map,
    Math,
    Number,
    MAP_WIDTH: 16,
    TICKS_PER_MONTH: 4,
    city: { tick: 0 },
    getTreeInfluenceValue: (row, col) => { calls++; return row + col * 0.01; },
    getScenicValue: (row, col) => row - col * 0.01,
  });
  vm.runInContext(simulationSource.slice(start, end), context, { filename: 'residential-environment-score.js' });

  vm.runInContext(`
    first = getResidentialEnvironmentScore(2, 3);
    second = getResidentialEnvironmentScore(2, 3);
    city.tick = 3;
    third = getResidentialEnvironmentScore(2, 3);
  `, context);
  assert.equal(calls, 1, 'repeated lookups within the same game month must not recompute');
  assert.equal(context.first, context.second);
  assert.equal(context.first, context.third);
  assert.ok(Math.abs(context.first.tree - 2.03) < 1e-9);
  assert.ok(Math.abs(context.first.scenic - 1.97) < 1e-9);

  vm.runInContext('city.tick = 4; fourth = getResidentialEnvironmentScore(2, 3);', context);
  assert.equal(calls, 2, 'crossing a month boundary must rebuild the cache');
  assert.notEqual(context.fourth, context.first);
  assert.ok(Math.abs(context.fourth.tree - context.first.tree) < 1e-9);

  vm.runInContext(
    'invalidateResidentialEnvironmentScoreCache(); fifth = getResidentialEnvironmentScore(2, 3);',
    context,
  );
  assert.equal(calls, 3, 'explicit invalidation must force a recompute even mid-month');
});

test('happiness and health pressure read tree/scenic scores through the cache, not raw per-tile scans', () => {
  assert.doesNotMatch(simulationSource, /treeScore \+= getTreeInfluenceValue/);
  assert.doesNotMatch(simulationSource, /scenicScore \+= getScenicValue/);
  assert.match(simulationSource, /const env = getResidentialEnvironmentScore\(r, c\);/);
  assert.match(simulationSource, /pressure -= getResidentialEnvironmentScore\(row, col\)\.tree \* 0\.10;/);
});
