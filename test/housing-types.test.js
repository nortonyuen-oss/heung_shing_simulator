'use strict';

// 公屋、居屋 (docs/campaign-p4-design.md §2): residential zones painted 公屋 or 居屋 grow by
// themselves from the residential art that looks like Hong Kong public housing; a home's housing
// type is its art's.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const housing = require('../housing-types.js');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');

function catalog() {
  const context = vm.createContext({});
  vm.runInContext(source('model-catalog.js'), context, { filename: 'model-catalog.js' });
  return vm.runInContext('HOUSE_MODEL_SETS', context);
}

// The lot sizes a set places new buildings at: its own files less its legacy ones, plus borrowed.
function placeableFilesBySize() {
  const sets = catalog();
  const bySize = new Map();
  Object.values(sets).forEach((config) => {
    const own = (config.preferredFiles || []).filter((file) => !(config.legacyFiles || []).includes(file));
    const borrowed = (config.borrowedFiles || []).map((entry) => entry.file);
    bySize.set(config.footprintCols, [...(bySize.get(config.footprintCols) || []), ...own, ...borrowed]);
  });
  return bySize;
}

test('housing types: eight residential models are tagged, 公屋 on L art and 居屋 on M art', () => {
  const tags = housing.RESIDENTIAL_HOUSING_TYPE_BY_MODEL;
  const sets = catalog();
  const catalogued = Object.values(sets).flatMap((config) => config.preferredFiles || []);
  assert.equal(Object.keys(tags).length, 8);
  Object.entries(tags).forEach(([model, type]) => {
    assert.ok(catalogued.includes(`${model}.png`), `${model} is a residential model`);
    const set = Object.values(sets).find((config) => (config.preferredFiles || []).includes(`${model}.png`));
    assert.ok(fs.existsSync(path.join(ROOT, set.folder, `${model}.png`)), model);
    assert.equal(type === 'public' ? '-L-' : '-M-', model.match(/-(L|M)-/)[0], `${model} tier`);
  });
  // estates are whole blocks: every type has lot sizes to grow in, and no 1x1
  const bySize = placeableFilesBySize();
  const sizesOf = (type) => [...bySize.entries()]
    .filter(([, files]) => files.some((file) => housing.getResidentialHousingTypeFromFileName(file) === type))
    .map(([size]) => size).sort((a, b) => a - b);
  assert.deepEqual(sizesOf('public'), [2, 3, 8]);
  assert.deepEqual(sizesOf('hos'), [3, 4]);
});

test('housing types: a home is typed by its art, by file name, path or asset id', () => {
  assert.equal(housing.getResidentialHousingTypeFromFileName('residential3-14-M-MD.png'), 'hos');
  assert.equal(housing.getResidentialHousingTypeFromFileName('residential5-03-L-HD.webp'), 'public');
  assert.equal(housing.getResidentialHousingTypeFromFileName('zone:residential/house8x8/residential5-03-L-HD.png'), 'public');
  assert.equal(housing.getResidentialHousingTypeFromFileName('residential2-05-L-MD.png'), 'private');
  assert.equal(housing.getBuildingHousingType({ type: 'residential', sourceFileName: 'residential3-07-M-MD.png' }), 'hos');
  assert.equal(housing.getBuildingHousingType({ type: 'residential', assetId: 'zone:residential/house3x3/residential3-02-L-MD.png' }), 'public');
  assert.equal(housing.getBuildingHousingType({ type: 'residential', sourceFileName: 'residential2-17-H-HD.png' }), 'private');
  assert.equal(housing.getBuildingHousingType({ type: 'commercial', sourceFileName: 'residential3-02-L-MD.png' }), null);
  assert.equal(housing.normalizeHousingType('hos'), 'hos');
  assert.equal(housing.normalizeHousingType('junk'), 'private');
});

test('housing types: residents are counted by type, with the district density the population uses', () => {
  const records = {
    '1:1': { type: 'residential', population: 1000, sourceFileName: 'residential3-01-L-MD.png' },
    '5:5': { type: 'residential', population: 600, sourceFileName: 'residential3-14-M-MD.png' },
    '9:9': { type: 'residential', population: 400, sourceFileName: 'residential2-15-H-HD.png' },
    '9:1': { type: 'commercial', population: 999, sourceFileName: 'residential3-01-L-MD.png' },
  };
  const counts = housing.countHousingTypeResidents(records, 1.5);
  assert.equal(counts.public, 1500);
  assert.equal(counts.hos, 900);
  assert.equal(counts.private, 600);
  assert.equal(counts.total, 3000);
  assert.equal(counts.publicShare, 0.5);
  assert.equal(counts.privateShare, 0.2);
  assert.deepEqual({ ...housing.countHousingTypeResidents(null) }, { public: 0, hos: 0, private: 0, total: 0, publicShare: 0, privateShare: 0 });
});

test('housing zones: saved as row:col codes; junk and tiles off the map are dropped', () => {
  const zones = housing.normalizeHousingZones({ '1:2': 1, '3:4': 2, '5:6': 3, 'x:1': 1, '300:1': 1, '1:300': 2 }, 256, 256);
  assert.deepEqual({ ...zones }, { '1:2': 1, '3:4': 2 });
  assert.deepEqual({ ...housing.normalizeHousingZones([1, 2]) }, {});
  assert.deepEqual({ ...housing.normalizeHousingZones(null) }, {});
});

// A 6x6 residential grid: columns 3-5 公屋, rows 3-5 of columns 0-2 居屋, the rest private;
// models for 2x2 and 3x3 lots.
function makeGrowthContext({ random = 0.99 } = {}) {
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => random;
  const model = (key, file, size) => ({
    key, sourceFileName: file, fileName: file, footprintCols: size, footprintRows: size,
    wealthTier: file.match(/-(UH|H|M|L)-/)[1], massingTier: file.match(/-(LD|MD|HD)\./)[1],
    housingType: housing.getResidentialHousingTypeFromFileName(file), metadata: { scale: 1 },
  });
  const context = vm.createContext({
    Math: deterministicMath,
    city: { tick: 0, healthIndex: 0.5, housingZones: {} },
    houseModelSets: {
      house2x2: [model('h2_public', 'residential2-04-L-MD.png', 2), model('h2_private', 'residential2-05-L-MD.png', 2)],
      house3x3: [model('h3_public', 'residential3-01-L-MD.png', 3), model('h3_hos', 'residential3-14-M-MD.png', 3), model('h3_private', 'residential3-03-H-MD.png', 3)],
    },
    modelUsageCounts: new Map(),
    modelRecentHistory: new Map(),
    MODEL_VARIATION_USAGE_WEIGHT: 0.7,
    MODEL_VARIATION_RECENT_PENALTY: 0.18,
    MODEL_VARIATION_MIN_WEIGHT: 0.04,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    getTileId: (r, c) => `${r}:${c}`,
    isInsideMap: (r, c) => r >= 0 && r < 6 && c >= 0 && c < 6,
    canPlaceBuilding: () => true,
    getTileHeight: () => 0,
  });
  vm.runInContext(source('constants.js'), context, { filename: 'constants.js' });
  vm.runInContext(source('housing-types.js'), context, { filename: 'housing-types.js' });
  vm.runInContext(source('sim-growth.js'), context, { filename: 'sim-growth.js' });
  vm.runInContext(source('sim-wealth-districts.js'), context, { filename: 'sim-wealth-districts.js' });
  vm.runInContext(`
    zoneMap = Array.from({ length: 6 }, () => Array(6).fill(ZONE_RES));
    for (let r = 0; r < 6; r++) for (let c = 3; c < 6; c++) setHousingZoneType(r, c, 'public');
    for (let r = 3; r < 6; r++) for (let c = 0; c < 3; c++) setHousingZoneType(r, c, 'hos');
    var scene = { buildingSprites: new Map() };
  `, context);
  return context;
}

test('公屋區 grow only from 公屋 art, private land never from it, and no lot spans the two', () => {
  const context = makeGrowthContext();
  const run = (code) => vm.runInContext(code, context);
  for (let i = 0; i < 12; i++) {
    assert.equal(run(`getRandomHouseModel('house3x3', 0.5, false, DENSITY_HIGH, { housingType: 'public' }).key`), 'h3_public');
    assert.equal(run(`getRandomHouseModel('house3x3', 0.5, false, DENSITY_HIGH, { housingType: 'hos' }).key`), 'h3_hos');
  }
  assert.equal(run(`getRandomHouseModel('house2x2', 0.5, false, DENSITY_HIGH, { housingType: 'hos' })`), null, 'no 居屋 art at 2x2');
  assert.equal(run(`getRandomHouseModel('house2x2', 0.5, false, DENSITY_HIGH, null, null, 'public').key`), 'h2_public', 'renewal passes the type itself');
  // and private land grows only the rest: art and housing type always agree
  for (let i = 0; i < 12; i++) {
    assert.equal(run(`getRandomHouseModel('house3x3', 0.5, false, DENSITY_HIGH, { housingType: 'private', wealthDistrictTier: 'commoner', quality: 0.5 }).key`), 'h3_private');
    assert.equal(run(`getRandomHouseModel('house2x2', 0.5, false, DENSITY_HIGH, { housingType: 'private', wealthDistrictTier: 'commoner', quality: 0.5 }).key`), 'h2_private');
  }
  assert.equal(run(`hasResidentialModelForFootprint(2, 'hos')`), false);
  assert.equal(run(`hasResidentialModelForFootprint(3, 'hos')`), true);
  assert.equal(run(`hasResidentialModelForFootprint(2)`), true);

  // the zone layer reads only on residential land
  assert.equal(run(`getHousingZoneType(0, 4)`), 'public');
  assert.equal(run(`getHousingZoneType(0, 1)`), 'private');
  assert.equal(run(`zoneMap[0][4] = ZONE_COM; const t = getHousingZoneType(0, 4); zoneMap[0][4] = ZONE_RES; t`), 'private');

  // a lot never spans private, 公屋 and 居屋 land
  assert.equal(run(`canPlaceZoneBuildingFootprint(scene, 0, 3, ZONE_RES, 3, 3)`), true);
  assert.equal(run(`canPlaceZoneBuildingFootprint(scene, 0, 2, ZONE_RES, 3, 3)`), false);
  assert.equal(run(`canPlaceZoneBuildingFootprint(scene, 0, 0, ZONE_RES, 3, 3)`), true);
  assert.equal(run(`canPlaceZoneBuildingFootprint(scene, 0, 1, ZONE_RES, 3, 3)`), false);
  assert.equal(run(`canPlaceZoneBuildingFootprint(scene, 1, 0, ZONE_RES, 3, 3)`), false);
  assert.equal(run(`canPlaceZoneBuildingFootprint(scene, 3, 0, ZONE_RES, 3, 3)`), true);

  // the estate footprint: a size its art comes in, the smallest that fits on a losing roll, none on 1x1
  assert.equal(run(`chooseHousingEstateFootprint(scene, 0, 3, 'public', DENSITY_HIGH).size`), 2);
  assert.equal(run(`chooseHousingEstateFootprint(scene, 0, 3, 'public', DENSITY_HIGH, { forceFootprint: 3 }).size`), 3);
  assert.equal(run(`chooseHousingEstateFootprint(scene, 3, 0, 'hos', DENSITY_HIGH).size`), 3, '居屋 art starts at 3x3');
  assert.equal(run(`chooseHousingEstateFootprint(scene, 3, 1, 'hos', DENSITY_HIGH).size`), 0, 'and does not fit beside the 公屋');
  assert.equal(run(`chooseHousingEstateFootprint(scene, 5, 5, 'public', DENSITY_HIGH).size`), 0, 'a corner tile fits no block');
  assert.equal(run(`chooseResidentialFootprint(scene, 0, 3, DENSITY_HIGH, {}, { housingType: 'public' }).size`), 2);
});

test('housing zones in the game: loaded, painted, saved, drawn, grown, counted and judged', () => {
  const html = source('index.html');
  assert.ok(html.indexOf('src="model-catalog.js"') < html.indexOf('src="housing-types.js"'));
  assert.ok(html.indexOf('src="housing-types.js"') < html.indexOf('src="sim-growth.js"'));
  assert.ok(html.indexOf('src="housing-types.js"') < html.indexOf('src="model-assets.js"'));
  assert.match(source('tools.js'), /placeZone\(scene, row, col, ZONE_RES, selectedZoneDensity\.res, getSelectedHousingType\(\)\)/);
  assert.match(source('tools.js'), /setHousingZoneType\(row, col, housingType\)/);
  assert.match(source('tools.js'), /setHousingZoneType\(row, col, 'private'\)/, 'de-zoning clears the type');
  assert.match(source('tool-actions.js'), /placeZone\(scene, row, col, zone, draft\.options\.density, draft\.options\.housingType\)/);
  assert.match(source('save.js'), /city\.housingZones = normalizeHousingZones\(city\.housingZones, MAP_WIDTH, MAP_HEIGHT\)/);
  assert.match(source('save.js'), /getZoneOverlayCode\(zone, r, c\)/);
  assert.match(source('city-state.js'), /city\.housingZones = \{\};/);
  ['pub', 'hos'].forEach((code) => [1, 2, 3].forEach((density) => {
    assert.match(source('main.js'), new RegExp(`'zone_overlay_${code}_${density}'`));
  }));
  assert.match(source('main.js'), /model\.housingType === 'public' \|\| model\.housingType === 'hos'/, 'their art is preloaded');
  assert.match(source('model-assets.js'), /housingType: config\.modelKind === 'residential'/);
  assert.match(source('simulation.js'), /city\.housingResidents = typeof countHousingTypeResidents === 'function'/);
  assert.match(source('medals.js'), /publicHousingResidents: Number\(city\.housingResidents\?\.public\)/);
  assert.match(source('tool-menu.js'), /data-housing|dataset\.housing/);
  const i18n = source('i18n.js');
  ['zone.housingType', 'zone.housing.private', 'zone.housing.public', 'zone.housing.hos', 'zone.housingTip.private',
    'zone.housingTip.public', 'zone.housingTip.hos', 'zone.housingMinDensityTip', 'zone.publicLetter', 'zone.hosLetter',
    'building.hosCourt', 'building.lowRentResidence', 'zone.housingLotTip.public', 'zone.housingLotTip.hos']
    .forEach((key) => assert.equal(i18n.split(`'${key}':`).length - 1, 3, `${key} in three languages`));
});
