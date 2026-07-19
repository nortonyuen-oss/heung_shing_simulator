const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

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

test('both road sets provide every logical road topology', () => {
  const roadSets = loadScriptValues('road-tile-sets.js', 'ROAD_TILE_SETS');
  roadSets.forEach((set) => {
    assert.equal(Object.keys(set.files).length, 26, set.id);
    Object.values(set.files).forEach((fileName) => assertAssetExists(`${set.folder}${fileName}`));
  });
});

test('new large transport assets use transparent PNG canvases', () => {
  const files = {
    'Models/airPort/6x6/airport6-01.png': 560,
    'Models/containerPort/4x4/containerPort3-LL.png': 600,
    'Models/containerPort/4x4/containerPort3-LR.png': 600,
    'Models/containerPort/4x4/containerPort3-UL.png': 600,
    'Models/containerPort/4x4/containerPort3-UR.png': 600,
  };

  Object.entries(files).forEach(([fileName, expectedHeight]) => {
    const png = fs.readFileSync(path.join(ROOT, fileName));
    assert.equal(png.toString('ascii', 1, 4), 'PNG', fileName);
    assert.equal(png.readUInt32BE(16), 1024, fileName);
    assert.equal(png.readUInt32BE(20), expectedHeight, fileName);
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
    mapRotation: 0,
    mapData: [],
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
  assert.match(tools, /specialModels\[Math\.floor\(Math\.random\(\) \* specialModels\.length\)\]/);
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
  assert.match(group('sports-facilities'), /sports-ground[\s\S]*data-park-shortcut="swimming_pool"/);
  assert.match(group('major-venues'), /indoor-coliseum[\s\S]*football-stadium/);
  assert.match(group('heritage-religion'), /buddha-statue[\s\S]*heritage-temple[\s\S]*heritage-church[\s\S]*murray-house/);
  assert.match(group('tourism-attractions'), /exhibition-center[\s\S]*ocean-park/);

  assert.match(menuScript, /PARK_OPTIONS\.filter\(\(opt\) => opt\.id !== 'swimming_pool'\)/);
  assert.match(menuScript, /function toggleToolGroup\(/);
  assert.match(html, /\.tool-flyout\s*\{[\s\S]*?max-height:\s*calc\(100vh - 16px\)[\s\S]*?overflow-y:\s*auto/);
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
