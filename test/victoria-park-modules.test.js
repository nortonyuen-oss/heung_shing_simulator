const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const sharp = require('sharp');
const { fitBuildingToGroundCorners } = require('../building-ground-fit');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
function functionSource(file, name) {
  const source = read(file), start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}\n', start) + 3);
}

function sandbox(records = {}) {
  const occupied = new Set(), drawn = [];
  const c = vm.createContext({ console, buildingData: records, city: { budget: 100000 },
    window: {}, document: { addEventListener() {} }, setTimeout, clearTimeout,
    houseModelSets: {}, commercialBuildingModels: [], industrialBuildingModels: [], parkModelMetadata: {},
    isInsideMap: (r, col) => r >= 0 && col >= 0 && r < 64 && col < 64,
    getTileId: (r, col) => `${r}:${col}`, showToast() {}, t: (key) => key,
  });
  for (const file of ['constants.js', 'tools.js', 'building-placement.js', 'save.js']) {
    vm.runInContext(read(file), c, { filename: file });
  }
  const main = read('main.js'), start = main.indexOf('const PARK_OPTIONS =');
  vm.runInContext(main.slice(start, main.indexOf('\nconst SPORT_GROUND_OPTIONS', start)), c);
  vm.runInContext(functionSource('tool-menu.js', 'getParkOptionBySpriteKey'), c);
  c.refreshInfrastructureEffects = () => {};
  c.getSaveModelForRecord = () => null;
  const tiles = (row, col) => Array.from({ length: 16 }, (_, i) => `${row + Math.floor(i / 4)}:${col + i % 4}`);
  Object.keys(records).forEach((id) => tiles(...id.split(':').map(Number)).forEach((id) => occupied.add(id)));
  c.canPlaceBuildingFootprint = (row, col, cols, rows) => cols === 4 && rows === 4
    && tiles(row, col).every((id) => !occupied.has(id));
  c.placeSpriteBuilding = (scene, row, col, key, options) => {
    drawn.push({ row, col, key, options });
    tiles(row, col).forEach((id) => occupied.add(id));
  };
  const option = vm.runInContext("PARK_OPTIONS.find(o => o.id === 'victoria_park')", c);
  return { c, option, drawn, occupied, place: (row, col) => c.placePark({}, row, col, option) };
}

test('one Victoria Park picker cycles six modules, rejects failed placements and resumes after save/load', () => {
  const s = sandbox();
  const keys = Array.from(vm.runInContext('PARK_MODEL_VARIANTS.park_flagship_victoria', s.c), (m) => m.spriteKey);
  assert.equal(vm.runInContext("PARK_OPTIONS.filter(o => o.spriteKey.startsWith('park_flagship_victoria')).length", s.c), 1);
  assert.equal(keys.length, 6);
  // Place in row-major order: precisely an 8x12-tile (160x240m) park.
  for (let i = 0; i < 6; i++) assert.equal(s.place(10 + Math.floor(i / 2) * 4, 10 + i % 2 * 4), true);
  assert.deepEqual(s.drawn.map((d) => d.key), keys);
  assert.equal(s.occupied.size, 96);
  s.drawn.forEach((d) => {
    assert.equal(d.options.footprintCols, 4);
    assert.equal(d.options.footprintRows, 4);
    assert.equal(s.c.isParkSpriteKey(d.key), true);
    assert.equal(s.c.getParkOptionBySpriteKey(d.key).footprintCols, 4);
  });
  const budget = s.c.city.budget;
  assert.equal(s.place(10, 10), false, 'occupied lot');
  assert.equal(s.c.city.budget, budget);
  assert.equal(Object.keys(s.c.buildingData).length, 6);

  const saved = JSON.parse(JSON.stringify(s.c.buildingData));
  const loaded = sandbox(saved);
  Object.values(saved).forEach((record, i) => assert.equal(loaded.c.deriveLoadedSpriteKey(record), keys[i]));
  assert.equal(loaded.c.deriveLoadedSpriteKey({ type: 'park_flagship' }), keys[0], 'old saves without sprite keys');
  loaded.c.city.budget = 0;
  assert.equal(loaded.place(30, 30), false, 'insufficient funds must not consume a variant');
  loaded.c.city.budget = 10000;
  assert.equal(loaded.place(30, 30), true);
  assert.equal(loaded.drawn[0].key, keys[0], 'wraps after module06');
  assert.equal(loaded.place(30, 34), true);
  assert.equal(loaded.drawn[1].key, keys[1]);
});

test('replacement sources are power-of-two RGBA textures and all six use the same exact ground fit', async () => {
  const { c } = sandbox();
  c.TILE_WIDTH = 100;
  c.fitBuildingToGroundCorners = fitBuildingToGroundCorners;
  c.getBuildingModelLogicalPath = (key) => vm.runInContext(`PARK_MODELS[${JSON.stringify(key)}].path`, c);
  c.getSpriteBuildingTextureKey = (key) => key;
  c.getModelTexturePixelMapping = () => ({ resize: 1, offsetX: 0, offsetY: 0 });
  const models = vm.runInContext('PARK_MODEL_VARIANTS.park_flagship_victoria', c);
  const scene = { textures: { exists: () => true, get: () => ({ getSourceImage: () => ({ width: 1024, height: 1024 }) }) } };
  for (const model of models) {
    const meta = await sharp(path.join(ROOT, model.path)).metadata();
    assert.equal(meta.width, 1024);
    assert.equal(meta.height, 1024);
    assert.equal(meta.hasAlpha, true);
    const fitted = c.applyBuildingGroundFit(scene, model.spriteKey, { footprintCols: 4, footprintRows: 4 });
    assert.equal(fitted.groundFit, true);
    assert.equal(fitted.scale, 400 / 1008);
    assert.equal(fitted.originX, 0.5);
    assert.equal(fitted.originY, 968 / 1024);
  }
  assert.deepEqual(fs.readFileSync(path.join(ROOT, models[0].path)),
    fs.readFileSync(path.join(ROOT, 'Models/parks/park4x4/victoriaPark4-module01.png')),
    'the original filename must actually contain the replacement art');
});
