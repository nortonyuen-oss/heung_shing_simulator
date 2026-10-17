// 一格 20m (docs/world-scale.md): buildings whose art is drawn for another lot size move to the
// right footprint, while those already standing in saved cities keep their old one.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function sliceFunctions(file, first, last) {
  const text = source(file);
  const start = text.indexOf(`function ${first}(`);
  const end = text.indexOf('\n}\n', text.indexOf(`function ${last}(`, start)) + 3;
  assert.ok(start >= 0 && end > start, `${first}..${last} in ${file}`);
  return text.slice(start, end);
}

function houseSets() {
  const context = vm.createContext({});
  vm.runInContext(source('model-catalog.js'), context, { filename: 'model-catalog.js' });
  vm.runInContext(sliceFunctions('model-assets.js', 'sortModelFiles', 'createModelEntries'), context);
  Object.assign(context, {
    DEFAULT_BUILDING_ANCHOR_MODE: 'bottom',
    resolveModelAssetPath: (value) => value,
    getManifestZoneModelMetadata: () => null,
  });
  return vm.runInContext(`Object.fromEntries(Object.entries(HOUSE_MODEL_SETS).map(([key, config]) => [
    key, createModelEntries(key, sortModelFiles(config.preferredFiles, config), config),
  ]))`, context);
}

test('moved residential models keep their old slot as legacy and join the new set at its footprint', () => {
  const sets = houseSets();
  const find = (set, file) => sets[set].filter((model) => model.sourceFileName === file);
  const moves = [
    ['residential2-02-M-HD.png', 'house2x2', 'house3x3', 3],
    ['residential2-10-H-MD.png', 'house2x2', 'house3x3', 3],
    ['residential4-01-M-MD.png', 'house4x4', 'house3x3', 3],
    ['residential3-07-M-MD.png', 'house3x3', 'house4x4', 4],
    ['residential3-08-M-MD.png', 'house3x3', 'house4x4', 4],
  ];
  moves.forEach(([file, from, to, size]) => {
    const [legacy] = find(from, file);
    assert.ok(legacy?.legacy, `${file} stays in ${from} as legacy`);
    assert.equal(legacy.spawnWeight, 0);
    const [moved] = find(to, file);
    assert.ok(moved && !moved.legacy, `${file} is offered in ${to}`);
    assert.equal(moved.footprintCols, size);
    assert.equal(moved.logicalPath, legacy.logicalPath, 'the art stays where it was');
    assert.notEqual(moved.assetId, legacy.assetId, 'saved buildings tell the two apart');
    assert.equal(moved.anchorMode, legacy.anchorMode, 'anchored as its art was');
  });
  // slot keys of the folder's own models do not move: borrowed models come after them
  ['house2x2', 'house3x3', 'house4x4'].forEach((set) => {
    const own = sets[set].filter((model) => !model.borrowedFrom);
    own.forEach((model, index) => assert.equal(model.key, `${set}_${index}`));
    sets[set].filter((model) => model.borrowedFrom).forEach((model) => {
      assert.ok(Number(model.key.split('_').pop()) >= own.length);
    });
  });
  // 2-02 was dialed down for looking like 3x3 art on a 2x2 lot; on the 3x3 lot it spawns normally
  assert.equal(find('house3x3', 'residential2-02-M-HD.png')[0].spawnWeight, 1);
});

test('growth, the house tool, preloading and the texture pool skip legacy models', () => {
  const growth = source('sim-growth.js');
  assert.equal((growth.match(/!m\.legacy/g) || []).length, 3, 'residential, commercial and industrial pickers');
  const main = source('main.js');
  assert.match(main, /function getPlaceableHouseModels\(tool\) \{\n\s+return \(houseModelSets\[tool\] \?\? \[\]\)\.filter\(\(model\) => !model\.legacy\);/);
  assert.doesNotMatch(main, /const models = houseModelSets\[(selectedHouseSet|tool)\] \?\? \[\];/);
  assert.match(main, /Object\.values\(houseModelSets\)\.flat\(\)\.filter\(\(model\) => !model\.legacy\)/);
  assert.match(source('model-assets.js'), /getAllZoneModels\(\)\.filter\(\(model\) => !model\.legacy && !scene\.textures\.exists/);
});

test('a saved building resolves to the copy of its file it was built from', () => {
  const context = vm.createContext({});
  vm.runInContext(sliceFunctions('save.js', 'findSaveModelByFileName', 'findSaveModelByFileName'), context);
  const legacy = { sourceFileName: 'a.png', assetId: 'zone:residential/house2x2/a.png', footprintCols: 2, footprintRows: 2, legacy: true };
  const moved = { sourceFileName: 'a.png', assetId: 'zone:residential/house3x3/a.png', footprintCols: 3, footprintRows: 3 };
  const other = { sourceFileName: 'b.png', assetId: 'zone:residential/house2x2/b.png', footprintCols: 2, footprintRows: 2 };
  const models = [legacy, other, moved];
  context.models = models;
  const pick = (record) => { context.record = record; return vm.runInContext('findSaveModelByFileName(models, "a.png", record)', context); };
  assert.equal(pick({ assetId: legacy.assetId, footprintCols: 2, footprintRows: 2 }), legacy, 'an old 2x2 keeps its lot');
  assert.equal(pick({ assetId: moved.assetId, footprintCols: 3, footprintRows: 3 }), moved, 'a new 3x3 stays 3x3');
  assert.equal(pick({ footprintCols: 2, footprintRows: 2 }), legacy, 'without an asset id, by footprint');
  assert.equal(pick({}), moved, 'otherwise the current model');
  context.record = {};
  assert.equal(vm.runInContext('findSaveModelByFileName(models, "b.png", record)', context), other);
  // every by-filename lookup in the save loader goes through it
  assert.doesNotMatch(source('save.js'), /models\.find\(\(model\) => model\.sourceFileName ===/);
});

test('schools and the hospital take their survey footprints; saved ones keep the old lot and art', () => {
  const values = vm.runInContext(`${source('constants.js')}
    ;({
      models: Object.fromEntries(['primary_school', 'secondary_school', 'hospital'].map((type) => [type, getServiceBuildingModels(type)])),
      all: Object.fromEntries(['primary_school', 'secondary_school', 'hospital'].map((type) => [type, getServiceBuildingModelsWithLegacy(type)])),
      textureKey: getFixedBuildingTextureKey,
    })`, vm.createContext({}), { filename: 'constants.js' });
  const sizes = (models) => Array.from(models, (model) => `${model.spriteKey}:${model.footprintCols}x${model.footprintRows}`);
  assert.deepEqual(sizes(values.models.primary_school), ['primary_school_3x3:3x3']);
  assert.deepEqual(sizes(values.models.secondary_school), ['secondary_school_4x4:4x4', 'secondary_school_4x4_alt:4x4'],
    'both designs are the same school: the preview footprint matches whichever is built');
  assert.deepEqual(sizes(values.models.hospital), ['hospital_5x5:5x5']);
  Object.entries(values.all).forEach(([type, models]) => {
    const current = values.models[type];
    const legacy = models.filter((model) => model.legacy);
    assert.ok(legacy.length > 0, `${type} keeps its old lot for saved cities`);
    legacy.forEach((model) => {
      const twin = current.find((candidate) => candidate.path === model.path);
      assert.ok(twin, `${model.spriteKey} draws current art`);
      assert.equal(values.textureKey(model), twin.spriteKey, `${model.spriteKey} shares the texture`);
    });
    assert.ok(current.every((model) => !model.legacy), 'legacy lots are never chosen for a new building');
  });
  const placement = source('building-placement.js');
  assert.equal((placement.match(/flatMap\(getServiceBuildingModelsWithLegacy\)|getServiceBuildingModelsWithLegacy\(type\)/g) || []).length, 3);
  assert.match(source('model-metadata.js'), /getServiceBuildingModelsWithLegacy\(type\)/);
  assert.match(source('main.js'), /flatMap\(getServiceBuildingModelsWithLegacy\)/);
  assert.doesNotMatch(source('save.js'), /'primary_school_3x3'\) return 'primary_school_2x2'/);
});

test('the resized service buildings keep the lights calibrated under their old keys', () => {
  const lighting = source('building-lighting.js');
  const aliases = vm.runInContext(`(${lighting.match(/const BUILDING_LIGHT_KEY_ALIASES = Object\.freeze\((\{[\s\S]*?\})\);/)[1]})`, vm.createContext({}));
  assert.deepEqual({ ...aliases }, {
    primary_school_3x3: 'primary_school_2x2',
    secondary_school_4x4: 'secondary_school_2x2',
    secondary_school_4x4_alt: 'secondary_school_2x2_alt',
    hospital_5x5: 'hospital_4x4',
  });
  Object.values(aliases).forEach((key) => assert.match(lighting, new RegExp(`\\b${key}: makeBuildingLightProfile`)));
  assert.match(lighting, /spriteKey = BUILDING_LIGHT_KEY_ALIASES\[spriteKey\] \?\? spriteKey;/);
});

test('the 5x5 estates move to the 8x8 (borrowed) and 9x9 (cut) estate lots', () => {
  const sets = houseSets();
  ['residential5-01-H-MD.png', 'residential5-02-H-MD.png', 'residential5-03-L-HD.png'].forEach((file) => {
    assert.ok(sets.house5x5.find((model) => model.sourceFileName === file)?.legacy, `${file} stays 5x5 for saved cities`);
  });
  assert.deepEqual(Array.from(sets.house9x9, (model) => `${model.sourceFileName}:${model.footprintCols}`),
    ['residential9-01-H-MD.png:9', 'residential9-02-H-MD.png:9'], 'the YOHO estates, front street cut off');
  assert.deepEqual(Array.from(sets.house8x8, (model) => `${model.sourceFileName}:${model.footprintCols}`),
    ['residential5-03-L-HD.png:8']);
  const catalog = vm.runInContext(`${source('model-catalog.js')}\n;HOUSE_MODEL_SETS`, vm.createContext({}));
  assert.equal(catalog.house8x8.borrowedOnly, true);
  assert.equal(catalog.house9x9.borrowedOnly, undefined, '9x9 has its own folder');
  assert.match(source('model-assets.js'), /if \(config\.borrowedOnly\) return createModelEntries\(keyPrefix, \[\], config\);/,
    'no folder listing is requested for a set with no folder');
  const growth = source('sim-growth.js');
  assert.match(growth, /if \(footprintSize === 9\) return 'house9x9';\n\s+if \(footprintSize === 8\) return 'house8x8';/);
  assert.match(growth, /RESIDENTIAL_LOT_SIZES_LARGEST_FIRST = Object\.freeze\(\[9, 8, 5, 4, 3, 2\]\)/);
  assert.match(growth, /LARGE_RESIDENTIAL_LOT_SIZES = Object\.freeze\(\[9, 8, 5\]\)/);
  assert.match(source('server.js'), /'residential\/house9x9'/);
  assert.match(growth, /hasResidentialModelForFootprint\(footprintSize\) \{[\s\S]*?!model\.legacy/);
  const chances = vm.runInContext(`${source('constants.js')}\n;RES_LARGE_SPAWN_CHANCE`, vm.createContext({}));
  assert.ok(chances[3][9] > 0 && chances[3][8] > 0, 'high density grows estates');
  assert.equal(chances[1][8], 0, 'low density never does');
});

test('zoned land builds up to 100 m (five tiles) from a road, a large lot from any of its tiles', () => {
  const ROAD = 1;
  const context = vm.createContext({ ROAD, ZONE_ROAD_ACCESS_TILES: 5 });
  vm.runInContext(sliceFunctions('simulation.js', 'isRoadAccessTile', 'hasRoadNearFootprint'), context);
  vm.runInContext(`
    var mapData = Array.from({ length: 40 }, () => new Array(40).fill(0));
    function isInsideMap(r, c) { return r >= 0 && c >= 0 && r < 40 && c < 40; }
    mapData[20][20] = ROAD;
  `, context);
  const near = (r, c) => vm.runInContext(`hasAdjacentRoad(${r}, ${c})`, context);
  assert.equal(near(25, 20), true, '5 tiles');
  assert.equal(near(15, 25), true, '5 tiles diagonally');
  assert.equal(near(26, 20), false, '6 tiles');
  assert.equal(near(20, 20), true);
  // a 10x10 lot whose far corner is the anchor: the road is 3 tiles off its other side
  assert.equal(vm.runInContext('hasRoadNearFootprint(8, 8, 10, 10)', context), true);
  assert.equal(vm.runInContext('hasRoadNearFootprint(0, 0, 10, 10)', context), false);
  assert.equal(vm.runInContext(`${source('constants.js')}\n;ZONE_ROAD_ACCESS_TILES`, vm.createContext({})), 5);
});
