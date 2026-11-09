const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const portable = require('../portable-save');
const context = vm.createContext({ console, Map, Set, TextEncoder, MAP_WIDTH: 256, MAP_HEIGHT: 256,
  ROAD_TILE_SET_DEFAULT_ID: 'newRoadTiles', TREE_SYSTEM_VERSION: 1, BARE_LAND_VERSION: 1 });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../save.js'), 'utf8'), context);
const decode = data => { context.inputSave = data; return vm.runInContext('decodeSaveDataForLoad(inputSave)', context); };
function fixture() {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../UI/attract-city.json'), 'utf8'));
  return { city_name: raw.save_data.city.name, population: Number(raw.save_data.city.population),
    year: raw.save_data.city.year, month: raw.save_data.city.month, budget: raw.save_data.city.budget, save_data: raw.save_data };
}
test('a real city round-trips between portable files without local autosave identity', () => {
  const payload = fixture(); payload.save_data.autosave = { manualSaveId: 1234 };
  const envelope = portable.make(payload, '5.5.0');
  const parsed = portable.parse(JSON.stringify(envelope), decode, 256, 256);
  assert.equal(parsed.payload.save_data.autosave, undefined);
  assert.equal(payload.save_data.autosave.manualSaveId, 1234, 'export cannot mutate the active city');
  assert.deepEqual(parsed.payload.save_data.buildingData, payload.save_data.buildingData);
  assert.deepEqual(parsed.payload.save_data.city, payload.save_data.city);
});
test('invalid, future, corrupt RLE and malicious dimensions fail before applying any state', () => {
  const envelope = portable.make(fixture(), '5.5.0');
  assert.throws(() => portable.parse('{', decode, 256, 256));
  envelope.saveDataVersion = envelope.payload.save_data.version = 999;
  assert.throws(() => portable.parse(JSON.stringify(envelope), decode, 256, 256), /not supported/);
  const corrupt = portable.make(fixture(), '5.5.0'); corrupt.payload.save_data.mapData.width = 1000000000;
  assert.throws(() => portable.parse(JSON.stringify(corrupt), decode, 256, 256), /dimensions/);
  corrupt.payload.save_data.mapData.width = 256; corrupt.payload.save_data.mapData.runs = [1, 999999999];
  assert.throws(() => portable.parse(JSON.stringify(corrupt), decode, 256, 256), /length/);
  assert.throws(() => portable.parse('{"__proto__":{}}', decode, 256, 256), /property/);
});
test('portable filenames cannot introduce paths', () => {
  assert.match(portable.filename('../../bad\\city:*?'), /^香城_[^/\\:*?]+_\d{4}-\d{2}-\d{2}_\d{4}\.heungshing$/);
});
test('a legacy v14 uncompressed city can be imported without changing its original data', () => {
  const payload = fixture();
  payload.save_data = JSON.parse(JSON.stringify(decode(payload.save_data)));
  payload.save_data.version = 14;
  const envelope = portable.make(payload, '5.4.0');
  const parsed = portable.parse(JSON.stringify(envelope), decode, 256, 256);
  assert.equal(parsed.payload.save_data.version, 14);
  assert.deepEqual(parsed.payload.save_data.mapData, payload.save_data.mapData);
});

test('desktop SQLite accepts browser exports and preserves the original city before migration', () => {
  const os = require('node:os');
  const { openGameDatabase } = require('../db');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'heung-shing-portable-'));
  const database = openGameDatabase(path.join(directory, 'city.sqlite'));
  try {
    const browserExport = portable.make(fixture(), '5.5.0');
    const imported = portable.parse(JSON.stringify(browserExport), decode, 256, 256);
    const row = database.createSave(imported.payload);
    const desktopCity = database.getSave(row.id);
    const desktopExport = portable.make(desktopCity, '5.5.0');
    const browserImport = portable.parse(JSON.stringify(desktopExport), decode, 256, 256);
    assert.deepEqual(browserImport.payload.save_data, imported.payload.save_data);

    const legacy = fixture(); legacy.save_data.version = 14;
    const old = database.createSave(legacy);
    database.updateSave(old.id, fixture());
    assert.equal(database.getSave(old.id).save_data.version, 15);
    assert.equal(database.getSaveBackup(old.id).save_data.version, 14);
    assert(database.listSaves().find(item => item.id === old.id).has_backup);
    assert.equal(legacy.save_data.version, 14);
  } finally {
    database.close(); fs.rmSync(directory, { recursive: true, force: true });
  }
});
