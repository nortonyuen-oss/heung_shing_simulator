const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function createSaveVm(rows) {
  const source = fs.readFileSync(path.join(ROOT, 'save.js'), 'utf8');
  const context = vm.createContext({
    AbortController, Array, console, JSON, Math, Number, Object, Promise, Set, String,
    MAP_HEIGHT: 3, MAP_WIDTH: 4, ROAD_TILE_SET_DEFAULT_ID: 'default', TREE_SYSTEM_VERSION: 1, BARE_LAND_VERSION: 1,
    clearTimeout, setTimeout,
    fetch: async (url) => {
      if (url !== '/api/saves') throw new Error(`Unexpected fetch ${url}`);
      return { ok: true, json: async () => rows };
    },
  });
  vm.runInContext(source, context, { filename: 'save.js' });
  return context;
}

const rows = [
  { id: 5, city_name: 'autosave', save_type: 'autosave' },
  { id: 14395, city_name: '太子', save_type: 'manual' },
  { id: 97, city_name: '旺角', save_type: 'manual' },
  { id: 3, city_name: '香港', save_type: 'manual' },
  { id: 4, city_name: '香港-backup', save_type: 'manual' },
];

test('an unlinked autosave adopts the one manual save with the same city name', async () => {
  const context = createSaveVm(rows);
  context.save = { city: { name: '太子' } };
  assert.equal(await vm.runInContext('resolveAutosaveManualSlot(save)', context), 14395);
  context.save = { city: { name: ' 香港 ' } };
  assert.equal(await vm.runInContext('resolveAutosaveManualSlot(save)', context), 3, 'exact name, not the -backup variant');
});

test('ambiguous or unknown names leave the autosave unlinked', async () => {
  const context = createSaveVm([...rows, { id: 15431, city_name: '太子', save_type: 'manual' }]);
  context.save = { city: { name: '太子' } };
  assert.equal(await vm.runInContext('resolveAutosaveManualSlot(save)', context), null, 'two 太子 slots: do not guess');
  context.save = { city: { name: '深水埗2' } };
  assert.equal(await vm.runInContext('resolveAutosaveManualSlot(save)', context), null);
  context.save = { city: {} };
  assert.equal(await vm.runInContext('resolveAutosaveManualSlot(save)', context), null);
});

test('a failing save list never breaks loading', async () => {
  const context = createSaveVm(rows);
  context.fetch = async () => { throw new Error('offline'); };
  context.save = { city: { name: '太子' } };
  assert.equal(await vm.runInContext('resolveAutosaveManualSlot(save)', context), null);
});

test('a new city clears every sprite a previous city could leave behind', () => {
  const source = fs.readFileSync(path.join(ROOT, 'landing-screen.js'), 'utf8');
  const body = source.slice(source.indexOf('function rebuildFreshMapSession('), source.indexOf('function startTerrainCreatorMode('));
  for (const call of ['clearTrafficVisuals', 'clearTransportVisuals', 'clearVesselVisuals', 'clearAircraftVisuals', 'clearAllOverlays', 'clearBuildings', 'resetGameState', 'rebuildBusStopSprites', 'syncWeatherVisuals']) {
    assert.match(body, new RegExp(`${call}\\(`), `rebuildFreshMapSession must call ${call}`);
  }
});
