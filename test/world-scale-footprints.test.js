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
    ['residential4-02-M-MD.png', 'house4x4', 'house3x3', 3],
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
  assert.equal(values.models.primary_school[0].path, 'Models/government/3x3/primarySchool3-01.png', 'the old art shrunk onto a plinth');
  assert.ok(fs.existsSync(path.join(ROOT, values.models.primary_school[0].path)));
  assert.deepEqual(sizes(values.models.secondary_school), ['secondary_school_3x3:3x3', 'secondary_school_3x3_alt:3x3'],
    'both designs are the same school: the preview footprint matches whichever is built');
  assert.deepEqual(sizes(values.models.hospital), ['hospital_5x5:5x5']);
  Object.entries(values.all).forEach(([type, models]) => {
    const current = values.models[type];
    const legacy = models.filter((model) => model.legacy);
    assert.ok(legacy.length > 0, `${type} keeps its old lot for saved cities`);
    legacy.forEach((model) => {
      const twin = current.find((candidate) => candidate.path === model.path);
      // the same art shares its texture; the primary school's old lot keeps its own (unshrunk) art
      if (twin) assert.equal(values.textureKey(model), twin.spriteKey, `${model.spriteKey} shares the texture`);
      else assert.equal(values.textureKey(model), model.spriteKey, `${model.spriteKey} has its own texture`);
    });
    assert.deepEqual(sizes(legacy.filter((model) => model.spriteKey.startsWith('secondary'))).sort(),
      type === 'secondary_school' ? ['secondary_school_2x2:2x2', 'secondary_school_2x2_alt:2x2', 'secondary_school_4x4:4x4', 'secondary_school_4x4_alt:4x4'] : []);
    assert.ok(current.every((model) => !model.legacy), 'legacy lots are never chosen for a new building');
  });
  const placement = source('building-placement.js');
  assert.equal((placement.match(/flatMap\(getServiceBuildingModelsWithLegacy\)|getServiceBuildingModelsWithLegacy\(type\)/g) || []).length, 3);
  assert.match(source('model-metadata.js'), /getServiceBuildingModelsWithLegacy\(type\)/);
  assert.match(source('main.js'), /flatMap\(getServiceBuildingModelsWithLegacy\)/);
  assert.doesNotMatch(source('save.js'), /'primary_school_3x3'\) return 'primary_school_2x2'/);
  assert.doesNotMatch(source('save.js'), /'secondary_school_3x3'\) return 'secondary_school_2x2'/);
});

test('the resized service buildings keep the lights calibrated under their old keys', () => {
  const lighting = source('building-lighting.js');
  const aliases = vm.runInContext(`(${lighting.match(/const BUILDING_LIGHT_KEY_ALIASES = Object\.freeze\((\{[\s\S]*?\})\);/)[1]})`, vm.createContext({}));
  assert.deepEqual({ ...aliases }, {
    secondary_school_3x3: 'secondary_school_2x2',
    secondary_school_3x3_alt: 'secondary_school_2x2_alt',
    secondary_school_4x4: 'secondary_school_2x2',
    secondary_school_4x4_alt: 'secondary_school_2x2_alt',
    hospital_5x5: 'hospital_4x4',
    power_plant_nuclear_12x12: 'power_plant_nuclear_4x4',
    space_museum_3x3: 'space_museum_2x2',
    cultural_center_6x6: 'cultural_center_4x4',
    indoor_coliseum_5x5: 'indoor_coliseum_3x3',
  });
  // the primary school's new art has its own profile, moved from the 2x2 one
  assert.match(lighting, /\bprimary_school_3x3: makeBuildingLightProfile/);
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

test('都市更新: a legacy-model building is now and then rebuilt as a current model of the same lot', () => {
  const growth = source('sim-growth.js');
  const start = growth.indexOf('const LEGACY_MODEL_RENEWAL_CHANCE_PER_MONTH');
  const end = growth.indexOf('\n}\n', growth.indexOf('function renewLegacyModelBuildings(')) + 3;
  const legacy2x2 = { key: 'house2x2_9', legacy: true, footprintCols: 2, footprintRows: 2 };
  const current2x2 = { key: 'house2x2_1', footprintCols: 2, footprintRows: 2, wealthTier: 'H' };
  const current3x3 = { key: 'house3x3_9', footprintCols: 3, footprintRows: 3 };
  const swaps = [];
  const context = vm.createContext({
    TICKS_PER_MONTH: 4, DENSITY_LOW: 1, city: { tick: 8 }, zoneDensityMap: [],
    buildingData: {
      '1:1': { type: 'residential', spriteKey: 'house2x2_9', footprintCols: 2, footprintRows: 2, wealthTier: 'H' },
      '5:5': { type: 'residential', spriteKey: 'house2x2_1', footprintCols: 2, footprintRows: 2 },
      '9:9': { type: 'primary_school', spriteKey: 'primary_school_2x2' },
    },
    getHouseModelBySpriteKey: (key) => ({ house2x2_9: legacy2x2, house2x2_1: current2x2 })[key] ?? null,
    getServiceBuildingModelBySpriteKey: (key) => (key === 'primary_school_2x2' ? { legacy: true } : null),
    getResidentialHouseSetForFootprint: (size) => `house${size}x${size}`,
    getRandomHouseModel: (setKey) => (setKey === 'house2x2' ? current2x2 : current3x3),
    swapZoneBuildingModel: (scene, id, record, model) => { swaps.push([id, model.key]); return true; },
  });
  vm.runInContext(growth.slice(start, end) + sliceFunctions('sim-growth.js', 'countLegacyFootprintBuildings', 'countLegacyFootprintBuildings'), context);
  assert.equal(vm.runInContext('LEGACY_MODEL_RENEWAL_CHANCE_PER_MONTH', context), 0.03);
  assert.deepEqual({ ...vm.runInContext('countLegacyFootprintBuildings()', context) }, { homes: 1, schools: 1, hospitals: 0 });
  assert.equal(vm.runInContext('renewLegacyModelBuildings({}, null, () => 0.5)', context), 0, 'the roll decides');
  assert.equal(vm.runInContext('renewLegacyModelBuildings({}, null, () => 0)', context), 1);
  assert.deepEqual(swaps.map((s) => Array.from(s)), [['1:1', 'house2x2_1']], 'only the legacy home, onto a model of its own lot size');
  context.city.tick = 9;
  assert.equal(vm.runInContext('renewLegacyModelBuildings({}, null, () => 0)', context), 0, 'once a month');
  assert.match(growth, /step\('legacyRenewal', \(\) => renewLegacyModelBuildings\(scene, ctx\.qualityContexts\)\);/);
  assert.match(growth, /function tryRedecoratePremiumBuilding[\s\S]*?swapZoneBuildingModel\(scene, id, record, newModel\);/, 'one swap routine');
});

test('the ticker suggests 都市更新 while old-plan buildings stand, in every language', () => {
  const ticker = source('hud-ticker.js');
  ['urbanRenewalHomes', 'urbanRenewalSchools', 'urbanRenewalHospitals'].forEach((key) => assert.match(ticker, new RegExp(`news\\.headline\\.${key}`)));
  assert.match(ticker, /countLegacyFootprintBuildings\(\)/);
  const i18n = source('i18n.js');
  ['urbanRenewalHomes', 'urbanRenewalSchools', 'urbanRenewalHospitals'].forEach((key) => {
    assert.equal((i18n.match(new RegExp(`'news\\.headline\\.${key}': '[^']*\\{count\\}[^']*'`, 'g')) || []).length, 3, `${key} in en, zhHant and ja`);
  });
  assert.match(i18n, /【市區重建】市建局/);
});

test('estate lots: every anchor scanned monthly, open blocks held, each estate in its own districts', () => {
  const growth = source('sim-growth.js');
  const scan = growth.slice(growth.indexOf('function scanForLargeResidentialLots('), growth.indexOf('\n}\n', growth.indexOf('function scanForLargeResidentialLots(')));
  assert.doesNotMatch(scan, /SHARD_COUNT/, 'no longer one tile in eight a month');
  assert.match(scan, /holdEstateLot\(r, c, size\)/);
  assert.match(scan, /isEstateLotDistrictAllowed\(size, tier\)/);
  assert.match(scan, /zone === ZONE_COM \? commercialSizes/, 'commercial large lots (none for now) share the scan');
  assert.match(growth, /if \(isEstateLotHeld\(id\)\) return;/, 'piecemeal growth waits on a held block');
  assert.match(growth, /isEstateLotDistrictAllowed\(footprintSize, siteFactors\?\.wealthDistrictTier\)/);
  assert.match(source('city-state.js'), /clearEstateLotHolds\(\)/, 'holds end with the city');

  const constants = vm.runInContext(`${source('constants.js')}\n;({ ESTATE_LOT_DISTRICTS, ESTATE_LOT_HOLD_MONTHS, ESTATE_LOT_HOLD_COOLDOWN_MONTHS, TICKS_PER_MONTH })`, vm.createContext({}));
  assert.deepEqual(Array.from(constants.ESTATE_LOT_DISTRICTS[8]), ['commoner', 'middleClass'], '公屋');
  assert.deepEqual(Array.from(constants.ESTATE_LOT_DISTRICTS[9]), ['middleClass', 'wealthy'], 'YOHO');

  const context = vm.createContext({ ...constants, city: { tick: 0 }, getTileId: (r, c) => `${r}:${c}` });
  // the helpers and the two Maps between them, as one slice
  vm.runInContext(sliceFunctions('sim-growth.js', 'isEstateLotDistrictAllowed', 'clearEstateLotHolds'), context);
  const allowed = (size, tier) => vm.runInContext(`isEstateLotDistrictAllowed(${size}, ${JSON.stringify(tier)})`, context);
  assert.equal(allowed(8, 'commoner'), true);
  assert.equal(allowed(8, 'wealthy'), false);
  assert.equal(allowed(9, 'commoner'), false);
  assert.equal(allowed(9, 'wealthy'), true);
  assert.equal(allowed(5, 'ultraRich'), true, 'other sizes untouched');
  const held = (id, tick) => vm.runInContext(`isEstateLotHeld('${id}', ${tick})`, context);
  vm.runInContext('holdEstateLot(10, 10, 8, 0)', context);
  assert.equal(held('17:17', 1), true, 'the whole block');
  assert.equal(held('18:18', 1), false);
  assert.equal(held('12:12', 8), false, 'two months, then piecemeal growth may go on');
  vm.runInContext('holdEstateLot(10, 10, 8, 12)', context);
  assert.equal(held('12:12', 13), false, 'not held again within the cooldown');
  vm.runInContext('holdEstateLot(10, 10, 8, 48)', context);
  assert.equal(held('12:12', 49), true, 'a year on it may be held again');
});

test('中銀 is the garden cut of its art at 5x5, as wide as its neighbours; 9x9 and the original stay for saved cities', () => {
  const context = vm.createContext({});
  vm.runInContext(source('model-catalog.js'), context, { filename: 'model-catalog.js' });
  vm.runInContext(sliceFunctions('model-assets.js', 'sortModelFiles', 'createModelEntries'), context);
  Object.assign(context, {
    DEFAULT_BUILDING_ANCHOR_MODE: 'bottom',
    resolveModelAssetPath: (value) => value,
    getManifestZoneModelMetadata: () => null,
    getCommercialTierFromFileName: () => 'UH',
  });
  const sets = vm.runInContext(`Object.fromEntries(COMMERCIAL_BUILDING_MODEL_SETS.map((config) => [
    config.footprintCols, createModelEntries(config.keyPrefix, sortModelFiles(config.preferredFiles, config), config),
  ]))`, context);
  const describe = (models) => Array.from(models, (m) => `${m.logicalPath}:${m.footprintCols}:${m.legacy ? 'legacy' : 'grows'}`);
  assert.deepEqual(describe(sets[5]), [
    'Models/commercial/5x5/commercialBuilding5-01-UH.png:5:legacy',
    'Models/commercial/9x9/commercialBuilding9-01-UH.png:5:grows',
  ]);
  assert.deepEqual(describe(sets[9]), ['Models/commercial/9x9/commercialBuilding9-01-UH.png:9:legacy']);
  assert.equal(sets[5][1].assetId, 'zone:commercial/5x5/commercialBuilding9-01-UH.png', 'saved by the lot it stands on');
  assert.match(source('sim-growth.js'), /if \(m\.legacy\) return false;/, 'the commercial picker skips legacy art');
  assert.match(source('sim-growth.js'), /LARGE_COMMERCIAL_LOT_SIZES = Object\.freeze\(\[\]\)/, 'no 9x9 commercial lots');
  assert.match(source('scripts/prepare-release-assets.js'), /LANDMARK_PREFIXES = \['commercial\/9x9\/'\]/, 'staged at 1024');
  const chances = vm.runInContext(`${source('constants.js')}\n;COM_LARGE_SPAWN_CHANCE`, vm.createContext({}));
  assert.ok([1, 2, 3].every((level) => chances[level][9] === undefined && chances[level][5] > 0));
  const venues = vm.runInContext(`${source('festival-venues.js')}\n;FESTIVAL_BUILDING_SPOTS`, vm.createContext({}));
  assert.ok(venues['commercialBuilding9-01-UH.png']?.spots.door, 'a Christmas tree before its entrance');
});

test('nuclear plant 12x12 with five times the output; plants built at 4x4 keep size, output and upkeep', () => {
  const c = vm.runInContext(`${source('constants.js')}\n;({ POWER_PLANT_MODELS, POWER_PLANT_STATS, LEGACY_POWER_PLANT_STATS, COST_NUCLEAR_PLANT,
    legacy: getPowerPlantModelBySpriteKey('power_plant_nuclear_4x4'), current: getPowerPlantModelBySpriteKey('power_plant_nuclear_12x12'),
    entries: getPowerPlantModelEntries().length, textureKey: getFixedBuildingTextureKey })`, vm.createContext({}));
  assert.equal(c.POWER_PLANT_MODELS.power_plant_nuclear.footprintCols, 12);
  assert.equal(c.current.type, 'power_plant_nuclear');
  assert.equal(c.legacy.type, 'power_plant_nuclear');
  assert.equal(c.legacy.model.footprintCols, 4);
  assert.equal(c.textureKey(c.legacy.model), 'power_plant_nuclear_12x12', 'one texture for both');
  assert.equal(c.POWER_PLANT_STATS.power_plant_nuclear.generationMW, 12000);
  assert.equal(c.POWER_PLANT_STATS.power_plant_nuclear.baseUpkeep, 4500);
  assert.deepEqual({ ...c.LEGACY_POWER_PLANT_STATS.power_plant_nuclear_4x4 }, { generationMW: 2400, baseUpkeep: 900 });
  assert.equal(c.COST_NUCLEAR_PLANT, 84000);

  const ctx = vm.createContext({ POWER_PLANT_STATS: c.POWER_PLANT_STATS, LEGACY_POWER_PLANT_STATS: c.LEGACY_POWER_PLANT_STATS });
  vm.runInContext(sliceFunctions('city-state.js', 'getPowerPlantStats', 'getPowerPlantStats'), ctx);
  const stats = (rec) => vm.runInContext(`getPowerPlantStats(${JSON.stringify(rec)})`, ctx);
  assert.equal(stats({ type: 'power_plant_nuclear', spriteKey: 'power_plant_nuclear_12x12' }).generationMW, 12000);
  assert.equal(stats({ type: 'power_plant_nuclear', spriteKey: 'power_plant_nuclear_4x4' }).generationMW, 2400);
  assert.equal(stats({ type: 'power_plant_nuclear', spriteKey: 'power_plant_nuclear_4x4' }).fireRadius, 22, 'the rest of the stats unchanged');
  assert.equal(vm.runInContext(`getPowerPlantStats('power_plant_coal').generationMW`, ctx), 600, 'a type still works');
  const cityState = source('city-state.js');
  assert.doesNotMatch(cityState, /getPowerPlantStats\(record\?\.type\)/, 'every caller passes the record');
  assert.match(cityState, /nuclearUpkeep = Object\.values\(buildingData/);
  assert.match(source('save.js'), /if \(saved\?\.type === record\.type\) return record\.spriteKey;/, 'a saved 4x4 plant keeps its key on load');
  assert.match(source('building-placement.js'), /model\.legacy \? powerPlantLegacyModelMetadata\[key\]/);
});

test('container port 6x6; ports built at 4x4 keep their lot and fit', () => {
  const c = vm.runInContext(`${source('constants.js')}\n;({ HARBOR_FOOTPRINT_COLS, HARBOR_FOOTPRINT_ROWS, LEGACY_HARBOR_FOOTPRINT })`, vm.createContext({}));
  assert.deepEqual([c.HARBOR_FOOTPRINT_COLS, c.HARBOR_FOOTPRINT_ROWS, c.LEGACY_HARBOR_FOOTPRINT], [6, 6, 4]);
  assert.match(source('building-placement.js'), /options\.footprintCols === LEGACY_HARBOR_FOOTPRINT[\s\S]{0,300}harborLegacyModelMetadata\[key\]/);
  assert.match(source('model-metadata.js'), /harborLegacyModelMetadata = Object\.fromEntries/);
});

test('science park: 5W and 金蛋 to 3x3, 19W to a 5x5 park merged from a block industry fills', () => {
  const context = vm.createContext({});
  vm.runInContext(source('model-catalog.js'), context, { filename: 'model-catalog.js' });
  vm.runInContext(sliceFunctions('model-assets.js', 'sortModelFiles', 'createModelEntries'), context);
  Object.assign(context, { DEFAULT_BUILDING_ANCHOR_MODE: 'bottom', resolveModelAssetPath: (v) => v, getManifestZoneModelMetadata: () => null });
  const sets = vm.runInContext(`Object.fromEntries(INDUSTRIAL_BUILDING_MODEL_SETS.map((config) => [config.footprintCols,
    createModelEntries(config.keyPrefix, sortModelFiles(config.fallbackSourceFiles, config), config)]))`, context);
  const files = (size, legacy) => Array.from(sets[size].filter((m) => !!m.legacy === legacy), (m) => m.sourceFileName).filter((f) => /ience|icence/.test(f)).sort();
  assert.deepEqual(files(2, true), ['sciencePark2-04.png', 'sicencePark2-03.png']);
  assert.deepEqual(files(3, false), ['sciencePark2-04.png', 'sciencePark3-01.png', 'sicencePark2-03.png']);
  assert.deepEqual(files(3, true), ['sciencePark3-02.png']);
  assert.deepEqual(files(5, false), ['sciencePark3-02.png']);
  assert.equal(sets[5][0].footprintCols, 5);
  assert.equal(sets[5][0].logicalPath, 'Models/industrial/3x3/sciencePark3-02.png', 'drawn from its folder');

  // the merge: a 5x5 block of level-3 industry inside the block
  const infra = source('sim-infrastructure.js');
  const ctx = vm.createContext({
    ZONE_IND: 3, DENSITY_LOW: 1, buildingData: {}, zoneMap: [], zoneDensityMap: [],
    isInsideMap: (r, c) => r >= 0 && c >= 0 && r < 20 && c < 20, canPlaceBuilding: () => true, getTileHeight: () => 0,
    getTileId: (r, c) => `${r}:${c}`,
    isBuildingInsideFootprint: (row, col, rec, tr, tc, fc, fr) => row >= tr && col >= tc && row + (rec.footprintRows ?? 1) <= tr + fr && col + (rec.footprintCols ?? 1) <= tc + fc,
  });
  vm.runInContext(infra.slice(infra.indexOf('const SCIENCE_PARK_LARGE_SIZE'), infra.indexOf('function tryMergeLargeSciencePark(')), ctx);
  const sprites = new Map();
  const scene = { buildingSprites: sprites };
  ctx.zoneMap = Array.from({ length: 20 }, () => new Array(20).fill(3));
  const build = (r, c, size, level = 3) => {
    ctx.buildingData[`${r}:${c}`] = { type: 'industrial', level, footprintCols: size, footprintRows: size };
    for (let dr = 0; dr < size; dr++) for (let dc = 0; dc < size; dc++) sprites.set(`${r + dr}:${c + dc}`, { mapRow: r, mapCol: c });
  };
  // a 5x5 block at (5,5): a 3x3, two 2x2 and the rest 1x1
  build(5, 5, 3); build(5, 8, 2); build(8, 5, 2);
  for (let r = 5; r < 10; r++) for (let c = 5; c < 10; c++) if (!sprites.has(`${r}:${c}`)) build(r, c, 1);
  const members = vm.runInContext('getScienceParkMergeBlockAt', ctx)(scene, 5, 5);
  assert.ok(members && members.length >= 3, 'the full block merges');
  assert.equal(vm.runInContext('getScienceParkMergeBlockAt', ctx)(scene, 4, 4), null, 'a block reaching off the industry does not');
  ctx.buildingData['9:9'].level = 2;
  assert.equal(vm.runInContext('getScienceParkMergeBlockAt', ctx)(scene, 5, 5), null, 'every building at level 3');
  assert.match(infra, /conversionChance \* SCIENCE_PARK_LARGE_MERGE_FACTOR && tryMergeLargeSciencePark\(scene\)/, 'once a month, with the conversion odds');
  assert.match(infra, /pickScienceParkIndustrialModel[\s\S]{0,200}!m\.legacy/, 'conversions skip legacy art');
});

test('太空館 3x3, 文化中心 6x6, 紅館 5x5; saved ones keep their lot', () => {
  const c = vm.runInContext(`${source('constants.js')}\n;({ SPECIAL_BUILDING_MODELS, all: (t) => getAllSpecialBuildingModels(t), plain: (t) => getSpecialBuildingModels(t), textureKey: getFixedBuildingTextureKey })`, vm.createContext({}));
  [['space_museum', 3, 'space_museum_2x2', 2], ['cultural_center', 6, 'cultural_center_4x4', 4], ['indoor_coliseum', 5, 'indoor_coliseum_3x3', 3]].forEach(([type, size, oldKey, oldSize]) => {
    const current = c.SPECIAL_BUILDING_MODELS[type];
    assert.equal(current.footprintCols, size);
    const legacy = Array.from(c.all(type)).find((m) => m.spriteKey === oldKey);
    assert.ok(legacy?.legacy, `${oldKey} kept for saved cities`);
    assert.equal(legacy.footprintCols, oldSize);
    assert.equal(c.textureKey(legacy), current.spriteKey, 'one texture');
    assert.ok(Array.from(c.plain(type)).every((m) => !m.legacy), 'never offered for a new one');
  });
});
