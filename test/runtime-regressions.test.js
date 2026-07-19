const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { after, before, test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function createSaveVm() {
  const source = fs.readFileSync(path.join(ROOT, 'save.js'), 'utf8');
  const context = vm.createContext({
    AbortController,
    Array,
    console,
    fetch: async () => { throw new Error('Unexpected fetch'); },
    JSON,
    MAP_HEIGHT: 3,
    MAP_WIDTH: 4,
    Math,
    Number,
    Object,
    Promise,
    ROAD_TILE_SET_DEFAULT_ID: 'default',
    Set,
    String,
    TREE_SYSTEM_VERSION: 1,
    clearTimeout,
    setTimeout,
  });
  vm.runInContext(source, context, { filename: 'save.js' });
  return context;
}

test('compact v15 maps and sparse trees round-trip exactly', () => {
  const context = createSaveVm();
  context.layers = {
    mapData: [[1, 1, 2, 2], [1, 5, 5, 2], [6, 6, 1, 1]],
    heightMap: [[0, 0, 0, 0], [0, 0, 0, 0], [2, 2, 0, 0]],
    bridgeMap: [[null, null, null, null], [null, 'deck:row', 'deck:row', null], [null, null, null, null]],
    roadUnderlayMap: [[null, null, null, null], [null, 5, 5, null], [null, null, null, null]],
    zoneMap: [[0, 1, 1, 0], [0, 2, 3, 0], [0, 0, 0, 0]],
    zoneDensityMap: [[1, 1, 2, 1], [1, 2, 3, 1], [1, 1, 1, 1]],
    treeMap: [[null, { species: 'banyan', age: 6, variant: 0.37, count: 2 }, null, null], [null, null, null, null], [null, null, { species: 'palmLeaf', age: 2, variant: 0.91, count: 1 }, null]],
  };
  vm.runInContext(`
    encoded = {
      version: 15,
      mapData: encodeCompactRleMap(layers.mapData, 'mapData'),
      heightMap: encodeCompactRleMap(layers.heightMap, 'heightMap'),
      bridgeMap: encodeCompactRleMap(layers.bridgeMap, 'bridgeMap'),
      roadUnderlayMap: encodeCompactRleMap(layers.roadUnderlayMap, 'roadUnderlayMap'),
      zoneMap: encodeCompactRleMap(layers.zoneMap, 'zoneMap'),
      zoneDensityMap: encodeCompactRleMap(layers.zoneDensityMap, 'zoneDensityMap'),
      treeMap: encodeCompactTreeMap(layers.treeMap),
    };
    decoded = decodeSaveDataForLoad(encoded);
  `, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.decoded.mapData)), context.layers.mapData);
  assert.deepEqual(JSON.parse(JSON.stringify(context.decoded.heightMap)), context.layers.heightMap);
  assert.deepEqual(JSON.parse(JSON.stringify(context.decoded.bridgeMap)), context.layers.bridgeMap);
  assert.deepEqual(JSON.parse(JSON.stringify(context.decoded.roadUnderlayMap)), context.layers.roadUnderlayMap);
  assert.deepEqual(JSON.parse(JSON.stringify(context.decoded.zoneMap)), context.layers.zoneMap);
  assert.deepEqual(JSON.parse(JSON.stringify(context.decoded.zoneDensityMap)), context.layers.zoneDensityMap);
  assert.deepEqual(JSON.parse(JSON.stringify(context.decoded.treeMap)), context.layers.treeMap);
});

test('compact decoder rejects corrupt runs and leaves v14 saves compatible', () => {
  const context = createSaveVm();
  context.corrupt = { encoding: 'rle-row-major-v1', width: 4, height: 3, runs: [1, 11] };
  assert.throws(
    () => vm.runInContext("decodeCompactRleMap(corrupt, 'mapData')", context),
    /decoded 11 of 12 cells/,
  );
  assert.equal(vm.runInContext('legacy = { version: 14, mapData: [[1]] }; decodeSaveDataForLoad(legacy) === legacy', context), true);
});

test('save requests serialize an immutable snapshot before entering the queue', async () => {
  const context = createSaveVm();
  Object.assign(context, {
    activeScene: {},
    city: { name: 'City A', population: 10, year: 1900, month: 1, budget: 5000 },
    currentSeed: 'seed',
    mapData: Array.from({ length: 3 }, () => Array(4).fill(1)),
    heightMap: Array.from({ length: 3 }, () => Array(4).fill(0)),
    bridgeMap: Array.from({ length: 3 }, () => Array(4).fill(null)),
    roadUnderlayMap: Array.from({ length: 3 }, () => Array(4).fill(null)),
    zoneMap: Array.from({ length: 3 }, () => Array(4).fill(0)),
    zoneDensityMap: Array.from({ length: 3 }, () => Array(4).fill(1)),
    treeMap: Array.from({ length: 3 }, () => Array(4).fill(null)),
    buildingData: { '1:1': { type: 'residential', nested: { value: 'A' } } },
    powerSources: new Set(),
    powerLineSet: new Set(),
    roadTileCount: 0,
    getDefaultCityName: () => 'Default',
    getCurrentRoadTileSetId: () => 'default',
    showToast: () => {},
    t: (key) => key,
  });
  const bodies = [];
  context.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ id: 1 }) };
  };

  const saving = vm.runInContext('saveGame(false)', context);
  context.city.name = 'City B';
  context.buildingData['1:1'].nested.value = 'B';
  assert.equal(await saving, true);
  assert.equal(bodies[0].city_name, 'City A');
  assert.equal(bodies[0].save_data.buildingData['1:1'].nested.value, 'A');
});

test('save session generations preserve a successful slot on failed load and reject stale responses', async () => {
  const installSaveState = (context) => Object.assign(context, {
    activeScene: { scene: {}, tileSprites: [], buildingSprites: new Map(), zoneOverlays: new Map() },
    city: { name: 'Race City', population: 10, year: 1900, month: 1, budget: 5000 },
    currentSeed: 'seed',
    mapData: Array.from({ length: 3 }, () => Array(4).fill(1)),
    heightMap: Array.from({ length: 3 }, () => Array(4).fill(0)),
    bridgeMap: Array.from({ length: 3 }, () => Array(4).fill(null)),
    roadUnderlayMap: Array.from({ length: 3 }, () => Array(4).fill(null)),
    zoneMap: Array.from({ length: 3 }, () => Array(4).fill(0)),
    zoneDensityMap: Array.from({ length: 3 }, () => Array(4).fill(1)),
    treeMap: Array.from({ length: 3 }, () => Array(4).fill(null)),
    buildingData: {}, powerSources: new Set(), powerLineSet: new Set(), roadTileCount: 0,
    getDefaultCityName: () => 'Default', getCurrentRoadTileSetId: () => 'default',
    showToast: () => {}, t: (key) => key,
    window: { setTimeout },
    console: { error: () => {}, log: console.log, warn: console.warn },
  });

  const failedLoadContext = createSaveVm();
  installSaveState(failedLoadContext);
  let releaseFirstSave;
  const firstSaveGate = new Promise((resolve) => { releaseFirstSave = resolve; });
  failedLoadContext.fetch = async (_url, options = {}) => {
    if (options.method === 'POST') {
      await firstSaveGate;
      return { ok: true, json: async () => ({ id: 123 }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const firstSave = vm.runInContext('saveGame(false)', failedLoadContext);
  const failedLoad = vm.runInContext('loadSaveById(999, activeScene)', failedLoadContext);
  releaseFirstSave();
  assert.equal(await firstSave, true);
  assert.equal(await failedLoad, false);
  assert.equal(vm.runInContext('currentSaveId', failedLoadContext), 123);

  const newCityContext = createSaveVm();
  installSaveState(newCityContext);
  let releaseStaleSave;
  const staleSaveGate = new Promise((resolve) => { releaseStaleSave = resolve; });
  newCityContext.fetch = async () => {
    await staleSaveGate;
    return { ok: true, json: async () => ({ id: 456 }) };
  };
  const staleSave = vm.runInContext('saveGame(false)', newCityContext);
  vm.runInContext('beginNewCitySaveSession()', newCityContext);
  releaseStaleSave();
  assert.equal(await staleSave, true);
  assert.equal(vm.runInContext('currentSaveId', newCityContext), null);

  const deletedSlotContext = createSaveVm();
  installSaveState(deletedSlotContext);
  vm.runInContext('currentSaveId = 999', deletedSlotContext);
  const methods = [];
  deletedSlotContext.fetch = async (_url, options = {}) => {
    methods.push(options.method);
    if (options.method === 'PUT') return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 201, json: async () => ({ id: 777 }) };
  };
  assert.equal(await vm.runInContext('saveGame(false)', deletedSlotContext), true);
  assert.deepEqual(methods, ['PUT', 'POST']);
  assert.equal(vm.runInContext('currentSaveId', deletedSlotContext), 777);
});

test('repeated city normalization preserves live forum and market references', () => {
  const source = fs.readFileSync(path.join(ROOT, 'city-state.js'), 'utf8');
  const start = source.indexOf('const _normalizedCityStateObjects');
  const end = source.indexOf('let _buildingCountCache', start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({
    city: {
      departmentBudgets: {}, activePolicies: {}, council: {}, loans: [], nextLoanId: 1,
      stockMarket: { hsi: 100, prevHsi: 100, regime: 'range', regimeMonthsLeft: 0, stocks: [{ symbol: 'A', price: 10, prevPrice: 10, history: [10], listed: true }] },
      temporaryEffects: [], weather: {}, districtSigns: [], aiNews: { history: [] },
      forumPosts: [{ id: 'post-1', headline: 'Test', image: 'UI/News/rainstorm.png', body: ['Body'], social: { comments: [] } }],
      year: 1900, month: 1,
    },
    clampDepartmentBudget: (value) => Number.isFinite(Number(value)) ? Number(value) : 100,
    normalizeCouncilState: (value) => ({ ...value, normalized: true }),
    createDefaultStockMarketState: () => ({
      hsi: 100, prevHsi: 100, regime: 'range', regimeMonthsLeft: 0, lastRotationTick: 0,
      stocks: [{ symbol: 'A', name: 'A', sector: 'test', basePrice: 10, price: 10, prevPrice: 10, history: [10], fairValue: 10, idioShock: 0, sharesOutstanding: 1, isHSI: true, listed: true }],
    }),
    HSI_COMPONENT_SYMBOLS: ['A'], MAP_HEIGHT: 256, MAP_WIDTH: 256,
    STOCK_LISTING_COUNT: 1, TYPHOON_NAMES: ['Typhoon'],
  });
  vm.runInContext(source.slice(start, end), context);
  vm.runInContext('normalizeCityFinanceState(); postRef = city.forumPosts[0]; forumRef = city.forumPosts; marketRef = city.stockMarket; normalizeCityFinanceState();', context);
  assert.equal(vm.runInContext('city.forumPosts === forumRef', context), true);
  assert.equal(vm.runInContext('city.forumPosts[0] === postRef', context), true);
  assert.equal(vm.runInContext('city.stockMarket === marketRef', context), true);
  assert.equal(context.city.forumPosts[0].image, 'UI/news/rainstorm.webp');
});

test('forum image references are case-correct optimized assets with thumbnails', () => {
  const sources = ['newspaper.js', 'council-news.js', 'city-state.js']
    .map((name) => fs.readFileSync(path.join(ROOT, name), 'utf8')).join('\n');
  // The old spelling may appear in the migration regex, but never as a live
  // quoted asset reference that would break on case-sensitive packages.
  assert.doesNotMatch(sources, /['"`]UI\/News\/[a-zA-Z0-9_.-]+/);
  const assets = [...sources.matchAll(/UI\/news\/([a-zA-Z0-9_.-]+\.webp)/g)].map((match) => match[1]);
  assert.ok(assets.length > 0);
  for (const asset of new Set(assets)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'UI', 'news', asset)), `missing ${asset}`);
    assert.ok(fs.existsSync(path.join(ROOT, 'UI', 'news', 'thumbs', asset)), `missing thumbnail ${asset}`);
  }
});

test('desktop package explicitly includes forum WebP assets', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(packageJson.build.files.includes('UI/news/**/*.webp'));
});

test('visible application version is sourced from package metadata', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const translations = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
  assert.match(html, new RegExp(`v${packageJson.version.replace(/\./g, '\\.')}<\\/title>`));
  assert.doesNotMatch(translations, /(?:Version|版本|バージョン) 2\.0\.0/);
  assert.match(translations, /fetch\('\/api\/app-info'/);
});

test('simulation hot paths do not use shifting BFS queues or production debug scans', () => {
  const infrastructure = fs.readFileSync(path.join(ROOT, 'sim-infrastructure.js'), 'utf8');
  const simulation = fs.readFileSync(path.join(ROOT, 'simulation.js'), 'utf8');
  assert.doesNotMatch(infrastructure, /queue\.shift\s*\(/);
  assert.match(simulation, /const SIM_DEBUG_LOGGING = false;/);
});

let gameServer;
let tempDir;

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heung-shing-tests-'));
  const { startGameServer } = require(path.join(ROOT, 'server.js'));
  gameServer = await startGameServer({ port: 0, dbPath: path.join(tempDir, 'test.sqlite') });
});

after(async () => {
  if (gameServer) await gameServer.close();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('save API rejects malformed save_data and accepts a valid object', async () => {
  const invalid = await fetch(`${gameServer.url}/api/saves`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city_name: 'Broken', save_data: 'not-json' }),
  });
  assert.equal(invalid.status, 400);

  const valid = await fetch(`${gameServer.url}/api/saves`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city_name: 'Valid', population: 1, year: 1900, month: 1, budget: 100, save_data: { version: 15 } }),
  });
  assert.equal(valid.status, 201);
  const row = await valid.json();
  const loaded = await fetch(`${gameServer.url}/api/saves/${row.id}`);
  assert.equal(loaded.status, 200);
  assert.deepEqual((await loaded.json()).save_data, { version: 15 });
});

test('app metadata and forum WebP assets are served by the desktop HTTP stack', async () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const infoResponse = await fetch(`${gameServer.url}/api/app-info`);
  assert.equal(infoResponse.status, 200);
  assert.deepEqual(await infoResponse.json(), { version: packageJson.version });

  const imageResponse = await fetch(`${gameServer.url}/UI/news/rainstorm.webp`);
  assert.equal(imageResponse.status, 200);
  assert.match(imageResponse.headers.get('content-type') || '', /^image\/webp\b/);
  assert.ok((await imageResponse.arrayBuffer()).byteLength > 0);

  const modelResponse = await fetch(`${gameServer.url}/Models/commercial/1x1/commercialBuilding1-04-M.png`);
  assert.equal(modelResponse.status, 200);
  assert.match(modelResponse.headers.get('content-type') || '', /^image\/png\b/);
  assert.equal(modelResponse.headers.get('cache-control'), 'no-cache, must-revalidate');
});
