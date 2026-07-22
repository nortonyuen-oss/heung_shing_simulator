const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

test('every registered music track ships with the game', () => {
  const catalog = fs.readFileSync(path.join(ROOT, 'model-catalog.js'), 'utf8');
  const musicBlock = catalog.slice(
    catalog.indexOf('const MUSIC_TRACKS = ['),
    catalog.indexOf('\n];', catalog.indexOf('const MUSIC_TRACKS = [')) + 3,
  );
  const musicPaths = [...musicBlock.matchAll(/file: '([^']+\.mp3)'/g)].map((match) => match[1]);
  assert.ok(musicPaths.includes('Music/City Pulse.mp3'));
  assert.equal(new Set(musicPaths).size, musicPaths.length, 'music paths must be unique');
  musicPaths.forEach((relativePath) => {
    const absolutePath = path.join(ROOT, relativePath);
    assert.ok(fs.existsSync(absolutePath), `missing registered music: ${relativePath}`);
    assert.ok(fs.statSync(absolutePath).size > 0, `empty registered music: ${relativePath}`);
  });
});

function loadScriptValues(fileName, expression, globals = {}) {
  const source = fs.readFileSync(path.join(ROOT, fileName), 'utf8');
  const context = vm.createContext({ ...globals });
  return vm.runInContext(`${source}\n;(${expression})`, context, { filename: fileName });
}

function assertAssetExists(relativePath) {
  assert.ok(fs.existsSync(path.join(ROOT, relativePath)), `missing asset: ${relativePath}`);
}

test('fixed building registries point at the current asset set', () => {
  const registries = loadScriptValues(
    'constants.js',
    `({
      POWER_PLANT_MODELS,
      SERVICE_BUILDING_MODELS,
      SPECIAL_BUILDING_MODELS,
      HARBOR_MODELS,
      SERVICE_BUILDING_MODEL_VARIANTS,
      SPECIAL_BUILDING_MODEL_VARIANTS,
      LEGACY_AIRPORT_MODEL,
      LEGACY_AIRPORT_8X8_MODEL,
      LEGACY_OCEAN_PARK_MODEL,
    })`,
  );

  const modelRegistries = [
    registries.POWER_PLANT_MODELS,
    registries.SERVICE_BUILDING_MODELS,
    registries.SPECIAL_BUILDING_MODELS,
    registries.HARBOR_MODELS,
    ...Object.values(registries.SERVICE_BUILDING_MODEL_VARIANTS),
    ...Object.values(registries.SPECIAL_BUILDING_MODEL_VARIANTS),
    [registries.LEGACY_AIRPORT_MODEL],
    [registries.LEGACY_AIRPORT_8X8_MODEL],
    [registries.LEGACY_OCEAN_PARK_MODEL],
  ];
  modelRegistries.flatMap((registry) => Array.isArray(registry) ? registry : Object.values(registry)).forEach((model) => {
    assertAssetExists(model.path);
    assert.ok(model.footprintCols > 0 && model.footprintRows > 0, model.path);
  });

  assert.equal(registries.SPECIAL_BUILDING_MODELS.airport.footprintCols, 12);
  assert.equal(registries.SPECIAL_BUILDING_MODELS.airport.footprintRows, 12);
  assert.equal(registries.LEGACY_AIRPORT_MODEL.footprintCols, 6);
  assert.equal(registries.LEGACY_AIRPORT_MODEL.footprintRows, 6);
  assert.equal(registries.LEGACY_AIRPORT_8X8_MODEL.footprintCols, 8);
  assert.equal(registries.LEGACY_AIRPORT_8X8_MODEL.footprintRows, 8);
  assert.equal(registries.SPECIAL_BUILDING_MODELS.ocean_park.footprintCols, 8);
  assert.equal(registries.SPECIAL_BUILDING_MODELS.ocean_park.footprintRows, 8);
  assert.equal(registries.LEGACY_OCEAN_PARK_MODEL.footprintCols, 4);
  assert.equal(registries.LEGACY_OCEAN_PARK_MODEL.footprintRows, 4);
  assert.ok(registries.SPECIAL_BUILDING_MODELS.airport.cacheVersion);
  assert.deepEqual(
    Object.keys(registries.HARBOR_MODELS).sort(),
    ['harbor_ll', 'harbor_lr', 'harbor_ul', 'harbor_ur'],
  );
  Object.values(registries.HARBOR_MODELS).forEach((model) => {
    assert.equal(model.footprintCols, 4);
    assert.equal(model.footprintRows, 4);
    assert.match(model.path, /Models\/containerPort\/4x4\//);
  });
  assert.equal(registries.SERVICE_BUILDING_MODEL_VARIANTS.community_college.length, 4);
  assert.equal(registries.SERVICE_BUILDING_MODEL_VARIANTS.university.length, 2);
  assert.equal(registries.SPECIAL_BUILDING_MODEL_VARIANTS.heritage_temple.length, 2);
  assert.equal(registries.SPECIAL_BUILDING_MODELS.grand_temple.footprintCols, 3);
  assert.equal(registries.SPECIAL_BUILDING_MODELS.grand_temple.footprintRows, 3);
});

test('zone-model fallback catalogs contain only files that ship', () => {
  const catalog = loadScriptValues(
    'model-catalog.js',
    '({ HOUSE_MODEL_SETS, COMMERCIAL_BUILDING_MODEL_SETS, INDUSTRIAL_BUILDING_MODEL_SETS })',
  );
  const configs = [
    ...Object.values(catalog.HOUSE_MODEL_SETS),
    ...catalog.COMMERCIAL_BUILDING_MODEL_SETS,
    ...catalog.INDUSTRIAL_BUILDING_MODEL_SETS,
  ];

  configs.forEach((config) => {
    const files = config.fallbackSourceFiles ?? config.preferredFiles ?? [config.defaultFile];
    files.forEach((fileName) => assertAssetExists(`${config.folder}${fileName}`));
  });
});

test('industrial catalog keeps both 3x3 science parks and classifies every science park', () => {
  const catalog = loadScriptValues(
    'model-catalog.js',
    `({
      INDUSTRIAL_BUILDING_MODEL_SETS,
      getModelFileAlias,
      isDisabledModelFile,
      isScienceParkModel,
      getResidentialWealthTierFromFileName,
      getCommercialTierFromFileName,
    })`,
  );
  const config2x2 = catalog.INDUSTRIAL_BUILDING_MODEL_SETS.find((entry) => entry.footprintCols === 2);
  const config3x3 = catalog.INDUSTRIAL_BUILDING_MODEL_SETS.find((entry) => entry.footprintCols === 3);
  assert.ok(config2x2 && config3x3);
  assert.equal(config3x3.disabledFiles, undefined);
  assert.equal(catalog.isScienceParkModel({ sourceFileName: 'sicencePark2-03.webp' }), true);

  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const start = main.indexOf('function sortModelFiles(');
  const end = main.indexOf('\nclass TreeAlphaPipeline', start);
  const context = vm.createContext({
    ...catalog,
    DEFAULT_BUILDING_ANCHOR_MODE: 'effective-bottom-to-map-bottom',
    resolveModelAssetPath: (value) => value,
    getManifestZoneModelMetadata: () => null,
  });
  vm.runInContext(main.slice(start, end), context);

  const pngFiles = config3x3.fallbackSourceFiles;
  const webpFiles = pngFiles.map((fileName) => fileName.replace(/\.png$/, '.webp'));
  context.config = config3x3;
  context.pngFiles = pngFiles;
  context.webpFiles = webpFiles;
  const result = vm.runInContext(`({
    png: createModelEntries(config.keyPrefix, sortModelFiles(pngFiles, config), config),
    webp: createModelEntries(config.keyPrefix, sortModelFiles(webpFiles, config), config),
  })`, context);
  assert.deepEqual([...result.png].map((model) => model.key), [
    'industrial_building_3x3_0',
    'industrial_building_3x3_1',
    'industrial_building_3x3_2',
    'industrial_building_3x3_3',
  ]);
  assert.deepEqual(
    [...result.png].map((model) => model.fileName.replace(/\.png$/, '')),
    [...result.webp].map((model) => model.fileName.replace(/\.webp$/, '')),
  );
  assert.equal([...result.webp].some((model) => /sciencePark3-02/i.test(model.sourceFileName)), true);
  assert.equal([...result.webp].filter(catalog.isScienceParkModel).length, 2);

  context.config = config2x2;
  context.pngFiles = config2x2.fallbackSourceFiles;
  context.webpFiles = config2x2.fallbackSourceFiles.map((fileName) => fileName.replace(/\.png$/, '.webp'));
  const result2x2 = vm.runInContext(`({
    png: createModelEntries(config.keyPrefix, sortModelFiles(pngFiles, config), config),
    webp: createModelEntries(config.keyPrefix, sortModelFiles(webpFiles, config), config),
  })`, context);
  assert.equal([...result2x2.png].length, 11);
  assert.equal([...result2x2.png].filter(catalog.isScienceParkModel).length, 4);
  assert.deepEqual(
    [...result2x2.png].map((model) => model.fileName.replace(/\.png$/, '')),
    [...result2x2.webp].map((model) => model.fileName.replace(/\.webp$/, '')),
  );
});

test('science-park conversion loads its texture before removing industry', () => {
  const infrastructure = fs.readFileSync(path.join(ROOT, 'sim-infrastructure.js'), 'utf8');
  const conversionStart = infrastructure.indexOf('function tryConvertSingleIndustrialToSciencePark(');
  const conversionEnd = infrastructure.indexOf('\nfunction convertEligibleIndustrialToScienceParks(', conversionStart);
  const conversion = infrastructure.slice(conversionStart, conversionEnd);
  const batchStart = conversionEnd;
  const batchEnd = infrastructure.indexOf('\n// ── Power grid', batchStart);
  const batch = infrastructure.slice(batchStart, batchEnd);
  const requestIndex = conversion.indexOf('requestZoneModelTexture(scene, model');
  const removeIndex = conversion.indexOf('removeBuilding(scene, row, col)');

  assert.ok(requestIndex >= 0 && removeIndex > requestIndex);
  assert.match(conversion, /loaded[\s\S]*?current === record[\s\S]*?tryConvertSingleIndustrialToSciencePark/);
  assert.match(batch, /tryConvertSingleIndustrialToSciencePark\(scene, row, col, record, model\)/);
  assert.doesNotMatch(batch, /removeBuilding\(/);

  const constants = fs.readFileSync(path.join(ROOT, 'constants.js'), 'utf8');
  const growth = fs.readFileSync(path.join(ROOT, 'sim-growth.js'), 'utf8');
  assert.match(constants, /SCIENCE_PARK_UNLOCK_HIGHER_EDU\s*=\s*0\.8/);
  assert.match(infrastructure, /higherEdu >= SCIENCE_PARK_UNLOCK_HIGHER_EDU/);
  assert.match(infrastructure, /isPolicyActive\('scienceDevelopment'\) \? 0\.10 : 0/);
  assert.match(growth, /isPolicyActive\('scienceDevelopment'\) \? 0\.20 : 0/);
});

test('sciencePark3-02 delayed texture load preserves the old building until success', () => {
  const infrastructure = fs.readFileSync(path.join(ROOT, 'sim-infrastructure.js'), 'utf8');
  const start = infrastructure.indexOf('function isScienceParkIndustrialRecord(');
  const end = infrastructure.indexOf('\nfunction convertEligibleIndustrialToScienceParks(', start);
  const model = {
    key: 'industrial_building_3x3_3',
    assetId: 'Models/industrial/3x3/sciencePark3-02.png',
    sourceFileName: 'sciencePark3-02.png',
    footprintCols: 3,
    footprintRows: 3,
    metadata: { footprintCols: 3, footprintRows: 3, scale: 1, originX: 0.5, originY: 1 },
  };
  const oldRecord = {
    type: 'industrial',
    spriteKey: 'industrial_building_3x3_0',
    sourceFileName: 'industrialBuilding3-01.png',
    footprintCols: 3,
    footprintRows: 3,
  };
  let textureLoaded = false;
  let deferredCallback = null;
  let removeCount = 0;
  let placedKey = null;
  const context = vm.createContext({
    industrialBuildingModels: [model],
    buildingData: { '2:3': oldRecord },
    isScienceParkModel: (value) => /sciencepark/i.test(value?.sourceFileName ?? ''),
    getTileId: (row, col) => `${row}:${col}`,
    requestZoneModelTexture: (_scene, _model, callback) => { deferredCallback = callback; },
    removeBuilding: () => { removeCount += 1; return true; },
    placeSpriteBuilding: (_scene, _row, _col, key) => { placedKey = key; },
    markPowerGridDirty: () => {},
    invalidateBuildingCountCache: () => {},
    pickVariedModel: (models) => models[0],
  });
  vm.runInContext(infrastructure.slice(start, end), context);
  context.scene = { textures: { exists: () => textureLoaded } };
  context.model = model;
  context.oldRecord = oldRecord;

  const immediate = vm.runInContext(
    'tryConvertSingleIndustrialToSciencePark(scene, 2, 3, oldRecord, model)',
    context,
  );
  assert.equal(immediate, false);
  assert.equal(removeCount, 0);
  assert.equal(context.buildingData['2:3'], oldRecord);
  assert.equal(typeof deferredCallback, 'function');

  textureLoaded = true;
  deferredCallback(true);
  assert.equal(removeCount, 1);
  assert.equal(placedKey, 'industrial_building_3x3_3');
  assert.equal(context.buildingData['2:3'].sourceFileName, 'sciencePark3-02.png');
});

test('both road sets provide every logical road topology', () => {
  const roadSets = loadScriptValues('road-tile-sets.js', 'ROAD_TILE_SETS');
  roadSets.forEach((set) => {
    assert.equal(Object.keys(set.files).length, 26, set.id);
    Object.values(set.files).forEach((fileName) => assertAssetExists(`${set.folder}${fileName}`));
  });
});

test('large transport sources use transparent PNG canvases', () => {
  const files = [
    'Models/airPort/6x6/airport6-01.png',
    'Models/containerPort/4x4/containerPort4-LL.png',
    'Models/containerPort/4x4/containerPort4-LR.png',
    'Models/containerPort/4x4/containerPort4-UL.png',
    'Models/containerPort/4x4/containerPort4-UR.png',
  ];

  files.forEach((fileName) => {
    const png = fs.readFileSync(path.join(ROOT, fileName));
    assert.equal(png.toString('ascii', 1, 4), 'PNG', fileName);
    assert.ok(png.readUInt32BE(16) >= 1024, fileName);
    assert.ok(png.readUInt32BE(20) >= 512, fileName);
    assert.ok([4, 6].includes(png[25]), `${fileName} must have an alpha channel`);
  });
});

test('container-port suffixes match the isometric screen edge containing water', () => {
  const source = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const rotateStart = source.indexOf('function rotateDirection(');
  const rotateEnd = source.indexOf('\nfunction rotateTileKey(', rotateStart);
  const harborStart = source.indexOf('function getHarborWaterSides(');
  const harborEnd = source.indexOf('\nfunction refreshHarborSprites(', harborStart);
  assert.ok(rotateStart >= 0 && rotateEnd > rotateStart);
  assert.ok(harborStart >= 0 && harborEnd > harborStart);

  const context = vm.createContext({
    HARBOR_FOOTPRINT_COLS: 4,
    HARBOR_FOOTPRINT_ROWS: 4,
    WATER: 0,
    GROUND: 1,
    ROAD: 2,
    BEACH: 4,
    mapRotation: 0,
    mapData: [],
    activeScene: null,
    buildingData: {},
    HARBOR_BUILDING_TYPE: 'container_port',
    harborFrontageTileIds: new Set(),
    canPlaceBuilding: (row, col) => context.mapData[row]?.[col] === 1,
    isInsideMap: (row, col) => row >= 0 && col >= 0 && row < context.mapData.length && col < context.mapData[0].length,
    getFootprintTiles: (row, col, cols, rows) => Array.from({ length: rows }, (_, dr) => (
      Array.from({ length: cols }, (__, dc) => [row + dr, col + dc])
    )).flat(),
    isBridgeTile: () => false,
    getTileId: (row, col) => `${row}:${col}`,
    hasDistrictSignAt: () => false,
  });
  vm.runInContext(source.slice(rotateStart, rotateEnd), context);
  vm.runInContext(source.slice(harborStart, harborEnd), context);

  const keyForWaterSide = (side, rotation = 0) => {
    context.mapRotation = rotation;
    context.mapData = Array.from({ length: 6 }, () => Array(6).fill(1));
    if (side === 'n') for (let col = 1; col <= 4; col++) context.mapData[0][col] = 0;
    if (side === 'e') for (let row = 1; row <= 4; row++) context.mapData[row][5] = 0;
    if (side === 's') for (let col = 1; col <= 4; col++) context.mapData[5][col] = 0;
    if (side === 'w') for (let row = 1; row <= 4; row++) context.mapData[row][0] = 0;
    return vm.runInContext('getHarborVisualKey(1, 1)', context);
  };

  assert.equal(keyForWaterSide('n'), 'harbor_ur');
  assert.equal(keyForWaterSide('e'), 'harbor_lr');
  assert.equal(keyForWaterSide('s'), 'harbor_ll');
  assert.equal(keyForWaterSide('w'), 'harbor_ul');
  assert.equal(keyForWaterSide('n', 1), 'harbor_lr');

  context.mapRotation = 0;
  context.mapData = Array.from({ length: 8 }, () => Array(8).fill(1));
  for (let col = 2; col <= 5; col++) {
    context.mapData[6][col] = 4;
    context.mapData[7][col] = 0;
  }
  assert.equal(vm.runInContext('canPlaceHarborFootprint(2, 2)', context), true, 'beach backed by water is valid');
  assert.equal(vm.runInContext("analyzeHarborCoast(2, 2).coastMode", context), 'beach-buffer');

  context.mapData = Array.from({ length: 8 }, () => Array(8).fill(1));
  for (let col = 2; col <= 5; col++) context.mapData[6][col] = 0;
  context.mapData[5][2] = 4;
  context.mapData[5][3] = 4;
  context.mapData[5][4] = 4;
  context.mapData[5][5] = 4;
  assert.equal(vm.runInContext('canPlaceHarborFootprint(2, 2)', context), true, 'waterfront footprint row may be beach');

  context.mapData = Array.from({ length: 8 }, () => Array(8).fill(1));
  context.mapData[6][2] = 0;
  assert.equal(vm.runInContext('canPlaceHarborFootprint(2, 2)', context), false, 'one water tile is not a continuous quay');

  context.mapData = Array.from({ length: 8 }, () => Array(8).fill(1));
  for (let col = 2; col <= 5; col++) context.mapData[6][col] = 0;
  context.buildingData['2:2'] = {
    type: 'container_port',
    footprintCols: 4,
    footprintRows: 4,
    harborWaterSide: 's',
  };
  vm.runInContext('rebuildHarborFrontageTileCache()', context);
  assert.equal(vm.runInContext('isHarborFrontageTile(6, 2)', context), true);
  assert.equal(vm.runInContext('isHarborFrontageTile(5, 2)', context), false);
  vm.runInContext('clearHarborFrontageTileCache()', context);
  assert.equal(vm.runInContext('isHarborFrontageTile(6, 2)', context), false);

  const frontageLookupStart = source.indexOf('function isHarborFrontageTile(');
  const frontageLookupEnd = source.indexOf('\nfunction refreshHarborCoastTiles(', frontageLookupStart);
  const frontageLookup = source.slice(frontageLookupStart, frontageLookupEnd);
  assert.match(frontageLookup, /harborFrontageTileIds\.has/);
  assert.doesNotMatch(frontageLookup, /Object\.entries\(buildingData\)/);

  assert.match(source, /function getWaterPatternKey\(row, col\) \{[\s\S]*?isHarborFrontageTile\(row, col\)[\s\S]*?return 'water_full'/);
  assert.match(source, /function getShorelineKey\(row, col\) \{[\s\S]*?isHarborFrontageTile\(row, col\)[\s\S]*?return 'water_full'/);
});

test('updated model metadata anchors the true lowest corner to the map', () => {
  const constants = fs.readFileSync(path.join(ROOT, 'constants.js'), 'utf8');
  const catalog = fs.readFileSync(path.join(ROOT, 'model-catalog.js'), 'utf8');
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');

  assert.match(constants, /DEFAULT_BUILDING_ANCHOR_MODE\s*=\s*'effective-bottom-to-map-bottom'/);
  assert.match(catalog, /modelMetadata:v10/);
  assert.match(main, /anchorMode:\s*overrides\.anchorMode\s*\?\?\s*config\.anchorMode\s*\?\?\s*DEFAULT_BUILDING_ANCHOR_MODE/);
  assert.match(main, /anchored\.originX\s*=\s*anchored\.lowestCornerOriginX/);
  assert.match(main, /anchored\.originY\s*=\s*anchored\.lowestCornerOriginY/);
  assert.match(main, /function getSpecialBuildingModelMetadata[\s\S]*?return applySpriteAnchorMode\(/);
  assert.match(main, /function getParkModelMetadata[\s\S]*?return applySpriteAnchorMode\(/);
});

test('the 5x5 commercial model is exposed to the catalog and growth system', () => {
  const catalog = loadScriptValues('model-catalog.js', 'COMMERCIAL_BUILDING_MODEL_SETS');
  const config = catalog.find((entry) => entry.footprintCols === 5 && entry.footprintRows === 5);
  assert.ok(config);
  assert.equal(config.apiFolder, 'commercial/5x5');
  assertAssetExists(`${config.folder}${config.fallbackSourceFiles[0]}`);

  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const growth = fs.readFileSync(path.join(ROOT, 'sim-growth.js'), 'utf8');
  assert.match(server, /'commercial\/5x5'/);
  assert.match(growth, /\[5,\s*4,\s*3,\s*2\]/);
});

test('selected civic variants cycle in order and keep their saved sprite key', () => {
  const selection = loadScriptValues(
    'constants.js',
    `({
      cyclicTypes: [...CYCLIC_SERVICE_BUILDING_TYPES],
      fire: [0, 1, 2, 3].map((count) => selectServiceBuildingModel('fire_station', count).spriteKey),
      police: [0, 1, 2, 3].map((count) => selectServiceBuildingModel('police_station', count).spriteKey),
      colleges: [0, 1, 2, 3, 4, 5].map((count) => selectServiceBuildingModel('community_college', count).spriteKey),
      universities: [0, 1, 2, 3].map((count) => selectServiceBuildingModel('university', count).spriteKey),
    })`,
  );
  const tools = fs.readFileSync(path.join(ROOT, 'tools.js'), 'utf8');
  const save = fs.readFileSync(path.join(ROOT, 'save.js'), 'utf8');

  assert.deepEqual(
    [...selection.cyclicTypes].sort(),
    ['community_college', 'fire_station', 'police_station', 'university'],
  );
  assert.deepEqual([...selection.fire], [
    'fire_station_2x2', 'fire_station_2x2_alt',
    'fire_station_2x2', 'fire_station_2x2_alt',
  ]);
  assert.deepEqual([...selection.police], [
    'police_station_2x2', 'police_station_2x2_alt',
    'police_station_2x2', 'police_station_2x2_alt',
  ]);
  assert.deepEqual([...selection.colleges], [
    'community_college_3x3', 'community_college_3x3_alt_2',
    'community_college_3x3_alt_3', 'community_college_3x3_alt_4',
    'community_college_3x3', 'community_college_3x3_alt_2',
  ]);
  assert.deepEqual([...selection.universities], [
    'university_4x4', 'university_4x4_alt',
    'university_4x4', 'university_4x4_alt',
  ]);
  assert.match(tools, /selectServiceBuildingModel\(buildingType, existingServiceCount\)/);
  assert.match(tools, /buildingType === 'heritage_temple'[\s\S]*?existingSpecialCount % specialModels\.length/);
  assert.match(save, /savedKey[\s\S]*?isSpecialBuildingSpriteKey\(savedKey\)[\s\S]*?return savedKey/);
});

test('civic, leisure and landmark menus are grouped by building purpose', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const menuScript = fs.readFileSync(path.join(ROOT, 'tool-menu.js'), 'utf8');
  const group = (id) => {
    const match = html.match(new RegExp(`data-tool-group-items="${id}"[\\s\\S]*?</div>`));
    assert.ok(match, `missing tool group: ${id}`);
    return match[0];
  };

  assert.match(group('safety-health'), /fire-station[\s\S]*police-station[\s\S]*hospital/);
  assert.match(group('education'), /primary-school[\s\S]*secondary-school[\s\S]*community-college[\s\S]*university/);
  assert.match(group('government-economy'), /legislative-council[\s\S]*stock-exchange/);
  assert.match(group('transport-gateways'), /harbor[\s\S]*data-tool="airport" hidden/);
  assert.match(group('parks-greenery'), /data-tool="park"[\s\S]*data-tool="tree"/);
  assert.match(group('cultural-facilities'), /library[\s\S]*cultural-center[\s\S]*space-museum/);
  assert.match(group('religious-buildings'), /heritage-temple[\s\S]*grand-temple[\s\S]*heritage-church/);
  assert.match(group('sports-facilities'), /sports-ground[\s\S]*data-park-shortcut="swimming_pool"/);
  assert.match(group('major-venues'), /indoor-coliseum[\s\S]*football-stadium/);
  assert.match(group('heritage-sites'), /buddha-statue[\s\S]*murray-house/);
  assert.doesNotMatch(group('heritage-sites'), /heritage-temple|heritage-church/);
  assert.match(group('tourism-attractions'), /exhibition-center[\s\S]*ocean-park/);

  assert.match(menuScript, /tool === 'heritage-temple'[\s\S]*?return 'parks'/);

  assert.match(menuScript, /PARK_OPTIONS\.filter\(\(opt\) => opt\.id !== 'swimming_pool'\)/);
  assert.match(menuScript, /function toggleToolGroup\(/);
  assert.match(html, /\.tool-flyout\s*\{[\s\S]*?max-height:\s*calc\(100vh - 16px\)[\s\S]*?overflow-y:\s*auto/);
});

test('religious buildings have bounded community-support effects', () => {
  const values = loadScriptValues(
    'constants.js',
    '({ SPECIAL_BUILDING_EFFECTS, SPECIAL_BUILDING_UNLOCKS, SPECIAL_BUILDING_COSTS, BUILDING_POWER_DEMAND })',
  );
  const simulation = fs.readFileSync(path.join(ROOT, 'simulation.js'), 'utf8');

  assert.equal(values.SPECIAL_BUILDING_UNLOCKS.heritage_temple.maxCount, 4);
  assert.equal(values.SPECIAL_BUILDING_UNLOCKS.heritage_church.maxCount, 2);
  assert.equal(values.SPECIAL_BUILDING_UNLOCKS.grand_temple.maxCount, 1);
  ['heritage_temple', 'grand_temple', 'heritage_church'].forEach((type) => {
    assert.ok(values.SPECIAL_BUILDING_EFFECTS[type].communitySupportBonus > 0, type);
    assert.ok(values.SPECIAL_BUILDING_EFFECTS[type].happinessBonus > 0, type);
    assert.ok(values.SPECIAL_BUILDING_COSTS[type] > 0, type);
    assert.ok(values.BUILDING_POWER_DEMAND[type] > 0, type);
  });
  assert.match(simulation, /Math\.min\(0\.06, sumSpecialBuildingEffect\('communitySupportBonus'\)\)/);
  assert.match(simulation, /Math\.min\(0\.03, sumSpecialBuildingEffect\('communitySupportBonus'\) \* 0\.5\)/);
});

test('new airports load as 12x12 while old saves retain safe 6x6 and 8x8 fallbacks', () => {
  const constants = fs.readFileSync(path.join(ROOT, 'constants.js'), 'utf8');
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const save = fs.readFileSync(path.join(ROOT, 'save.js'), 'utf8');

  assert.match(constants, /airport:\s*\{[\s\S]*?spriteKey:\s*'airport_12x12'[\s\S]*?cacheVersion:[\s\S]*?footprintCols:\s*12[\s\S]*?footprintRows:\s*12/);
  assert.match(constants, /LEGACY_AIRPORT_MODEL[\s\S]*?spriteKey:\s*'airport_6x6_legacy'[\s\S]*?footprintCols:\s*6[\s\S]*?footprintRows:\s*6/);
  assert.match(constants, /LEGACY_AIRPORT_8X8_MODEL[\s\S]*?spriteKey:\s*'airport_8x8_legacy'[\s\S]*?footprintCols:\s*8[\s\S]*?footprintRows:\s*8/);
  assert.match(main, /this\.load\.image\(model\.spriteKey, getFixedBuildingModelLoadPath\(model\)\)/);
  assert.match(save, /migrateAirportBuildingRecord\(record\)[\s\S]*?deriveLoadedSpriteKey\(record\)/);
  assert.match(save, /isLegacy6x6[\s\S]*?isLegacy8x8[\s\S]*?targetModel[\s\S]*?record\.spriteKey = targetModel\.spriteKey[\s\S]*?record\.footprintCols = targetModel\.footprintCols[\s\S]*?record\.footprintRows = targetModel\.footprintRows/);
});

test('world mask expands dynamically for tall building sprites', () => {
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const start = main.indexOf('const WORLD_MASK_BASE_EDGE_BLEED');
  const end = main.indexOf('function drawWorldMask', start);
  assert.ok(start >= 0 && end > start);

  const context = vm.createContext({ Math, Number });
  vm.runInContext(main.slice(start, end), context);
  const normalBleed = vm.runInContext(`getBuildingWorldMaskBleed({
    displayWidth: 128, displayHeight: 100, originX: 0.5, originY: 1,
    scaleX: 1, scaleY: 1,
  })`, context);
  const towerBleed = vm.runInContext(`getBuildingWorldMaskBleed({
    displayWidth: 180, displayHeight: 640, originX: 0.5, originY: 1,
    scaleX: 1, scaleY: 1,
  })`, context);

  assert.equal(normalBleed, 196);
  assert.equal(towerBleed, 736);
  assert.match(main, /building\.setMask\(scene\.worldMask\);\s*ensureWorldMaskContainsBuilding\(scene, building\);/);
  assert.match(main, /scene\.worldMaskRequiredBleed\s*=\s*requiredBleed;[\s\S]*?drawWorldMask\(scene\)/);

  const growth = fs.readFileSync(path.join(ROOT, 'sim-growth.js'), 'utf8');
  assert.match(growth, /sprite\.setTexture\(newModel\.key\)[\s\S]*?ensureWorldMaskContainsBuilding\(scene, sprite\)/);
});
