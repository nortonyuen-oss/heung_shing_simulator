const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));

function setup() {
  const grid = value => Array.from({ length: 24 }, () => Array(24).fill(value));
  const c = vm.createContext({ console, Math, Date });
  const load = file => vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), c, { filename: file });
  load('constants.js'); load('map-utils.js');
  Object.assign(c, {
    GROUND: 1, ROAD: 2, DIRT: 3, BEACH: 4, WATER: 5, HILL: 6,
    city: { budget: 10000, tick: 0, districtSigns: [] }, buildingData: {},
    mapData: grid(1), zoneMap: grid(0), zoneDensityMap: grid(1), treeMap: grid(null),
    roadUnderlayMap: grid(null), bridgeMap: grid(null), powerLineSet: new Set(), lowDensityLockSet: new Set(),
    scene: { buildingSprites: new Map(), treeSprites: new Map(), debrisSprites: new Map(), zoneOverlays: new Map() },
    isInsideMap: (r, col) => r >= 0 && col >= 0 && r < 24 && col < 24,
    isTerrainCreatorMode: false, getTileHeight: () => 0, isSlopeTile: () => false, isBridgeTile: () => false,
    t: key => key, showToast() {}, updateHUD() {}, saves: 0,
    queueCityChangeAutosave: () => { c.saves++; },
    removeDebris: (scene, r, col) => scene.debrisSprites.delete(`${r}:${col}`),
    markPowerGridDirty: () => { c.dirtyCount++; }, dirtyCount: 0,
    updatePowerGrid: () => { c.powerUpdates++; }, powerUpdates: 0,
  });
  c.activeScene = c.scene;
  load('building-placement.js'); load('tools.js'); load('trees.js'); load('district-signs.js');
  c.refreshTreeSprite = (scene, r, col) => scene.treeSprites.set(`${r}:${col}`, []);
  c.drawPowerLineSprite = () => {};
  c.drawDistrictSignSprite = () => {};
  c.refreshInfrastructureEffects = () => {};
  c.placeSpriteBuilding = (scene, row, col, key, options) => {
    const sprite = { mapRow: row, mapCol: col };
    for (let r = row; r < row + options.footprintRows; r++) for (let cc = col; cc < col + options.footprintCols; cc++) {
      scene.buildingSprites.set(`${r}:${cc}`, sprite);
      c.removeTree(scene, r, cc); c.removeZoneOverlay(scene, r, cc);
    }
  };
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  vm.runInContext(main.slice(main.indexOf('const PARK_OPTIONS ='), main.indexOf('function getTerrainLabel(')), c);
  const straight = main.indexOf('function getStraightDragPath(');
  vm.runInContext(main.slice(straight, main.indexOf('\n}\n', straight) + 3), c);
  const catalog = fs.readFileSync(path.join(ROOT, 'model-catalog.js'), 'utf8');
  const species = catalog.indexOf('const TREE_SPECIES =');
  vm.runInContext(catalog.slice(species, catalog.indexOf('\n];', species) + 3), c);
  load('tool-actions.js'); load('build-session.js');
  return c;
}
function session(c, tool, start, end = start, options = {}) {
  const s = c.createBuildSession({ preview: draft => c.previewTouchToolAction(c.scene, draft), commit: (draft, plan) => c.commitTouchToolAction(c.scene, draft, plan) });
  s.begin(tool, { ...c.getTouchToolOptions(tool), ...options }, 'city');
  const range = c.isTouchRangeDraft(s.getState());
  s.select(start, range); if (range) s.select(end, true);
  return s;
}
function confirm(s) { const draft = s.getState(); return s.confirm(draft.id, draft.owner); }
function snapshot(c) { return JSON.stringify([c.city, c.mapData, c.zoneMap, c.zoneDensityMap, c.treeMap, c.buildingData, [...c.powerLineSet], [...c.lowDensityLockSet], c.saves]); }

test('C2 adds exactly six tools; quotes and option changes never write to the city', () => {
  const c = setup();
  assert.equal(vm.runInContext('TOUCH_DAILY_TOOLS.length', c), 6);
  assert.equal(vm.runInContext('new Set(TOUCH_SUPPORTED_TOOLS).size', c), 57);
  const before = snapshot(c);
  for (const tool of ['power-line', 'tree', 'dezone', 'park', 'sports-ground', 'district-sign']) {
    const s = session(c, tool, { row: 5, col: 5 }, { row: 6, col: 6 }); s.cancel();
  }
  const park = session(c, 'park', { row: 5, col: 5 }); park.setOptions({ variant: 'victoria_park' });
  assert.equal(park.getState().plan.tiles.length, 16);
  assert.equal(snapshot(c), before);
});

test('power line quotes skip existing lines and water, charge once and invalidate the actual grid', () => {
  const c = setup(); c.powerLineSet.add('5:5'); c.mapData[5][7] = c.WATER;
  c.placeTree(c.scene, 5, 6, { planted: true }); c.city.budget = 100;
  const s = session(c, 'power-line', { row: 5, col: 5 }, { row: 5, col: 8 });
  const draft = s.getState();
  assert.equal(draft.plan.cost, 10); assert.equal(draft.plan.skipped, 2); assert.equal(draft.plan.clearedTrees, 1);
  assert.equal(confirm(s).cost, 10); assert.equal(c.city.budget, 90);
  assert.deepEqual([...c.powerLineSet].sort(), ['5:5', '5:6', '5:8']);
  assert.equal(c.treeMap[5][6], null); assert.equal(c.dirtyCount, 2); assert.equal(c.powerUpdates, 1);
  assert.equal(s.confirm(draft.id, draft.owner).reason, 'stale');
});

test('power line and tree range approval rechecks changed targets and the whole live cost', () => {
  const c = setup();
  const s = session(c, 'power-line', { row: 5, col: 5 }, { row: 5, col: 8 });
  c.powerLineSet.add('5:6');
  assert.equal(confirm(s).reason, 'changed'); assert.equal(c.city.budget, 10000);
  c.city.budget = 14;
  assert.equal(confirm(s).ok, false); assert.equal(c.powerLineSet.size, 1);
  const trees = session(c, 'tree', { row: 8, col: 8 }, { row: 9, col: 9 });
  assert.equal(trees.getState().plan.cost, 60); assert.equal(confirm(trees).ok, false);
  assert.equal(c.treeMap.flat().filter(Boolean).length, 0);
});

test('tree rectangles use the native roadside/zoned-lot rules and preserve occupied tiles', () => {
  const c = setup();
  c.zoneMap[5][5] = 1; c.mapData[5][6] = c.ROAD;
  c.powerLineSet.add('6:5'); c.buildingData['6:6'] = { type: 'library' };
  const s = session(c, 'tree', { row: 5, col: 5 }, { row: 6, col: 6 });
  assert.equal(s.getState().plan.skipped, 3); assert.equal(confirm(s).cost, 15);
  assert.equal(c.treeMap[5][5].planted, true); assert.equal(c.zoneMap[5][5], 1);
  assert.equal(c.treeMap.flat().filter(Boolean).length, 1);
  const duplicate = session(c, 'tree', { row: 5, col: 5 }); assert.equal(duplicate.getState().plan.ok, false);
});

test('de-zoning is free in debt, keeps buildings and preserves the permanent low-density designation', () => {
  const c = setup(), sprite = { mapRow: 5, mapCol: 5 };
  const record = { type: 'residential', population: 40 };
  c.buildingData['5:5'] = record;
  for (let r = 5; r < 7; r++) for (let col = 5; col < 7; col++) { c.zoneMap[r][col] = 1; c.scene.buildingSprites.set(`${r}:${col}`, sprite); }
  c.lowDensityLockSet.add('5:5'); c.city.budget = -100;
  const s = session(c, 'dezone', { row: 5, col: 5 }, { row: 6, col: 7 });
  assert.equal(s.getState().plan.keptBuildings, 1); assert.equal(s.getState().plan.skipped, 2);
  assert.equal(confirm(s).cost, 0); assert.equal(c.city.budget, -100);
  assert.equal(c.zoneMap[5][5], 0); assert.equal(c.buildingData['5:5'], record);
  assert.equal(c.scene.buildingSprites.size, 4); assert.equal(c.lowDensityLockSet.has('5:5'), true);
});

test('both range endpoints remain independent when nudged in all three daily range tools', () => {
  const c = setup();
  for (const tool of ['tree', 'power-line', 'dezone']) {
    const s = session(c, tool, { row: 5, col: 5 }, { row: 5, col: 8 });
    s.nudge(1, 0); assert.deepEqual(plain(s.getState().end), { row: 6, col: 8 });
    assert.deepEqual(plain(s.getState().start), { row: 5, col: 5 });
    s.setActiveEnd('start'); s.nudge(-1, 0);
    assert.deepEqual(plain(s.getState().start), { row: 4, col: 5 });
    assert.deepEqual(plain(s.getState().end), { row: 6, col: 8 });
  }
});

test('every park and sports option uses its real footprint and quote, including the advertised $500 palm court', () => {
  for (const tool of ['park', 'sports-ground']) {
    const source = setup();
    for (const option of source.getTouchRecreationOptions(tool)) {
      const c = setup(), s = session(c, tool, { row: 5, col: 5 }, undefined, { variant: option.id });
      assert.equal(s.getState().plan.cost, option.cost);
      assert.equal(s.getState().plan.tiles.length, option.footprintCols * option.footprintRows);
      assert.equal(confirm(s).cost, option.cost);
      const record = c.buildingData['5:5'];
      assert.equal(record.type, option.type); assert.equal(record.footprintCols, option.footprintCols);
      assert.equal(record.footprintRows, option.footprintRows);
    }
  }
});

test('recreation quotes reject edges, water, occupied lots and unknown styles without spending', () => {
  const c = setup();
  for (const [tool, tile, options] of [['park', { row: 23, col: 23 }, { variant: 'large_park' }], ['sports-ground', { row: 23, col: 23 }, {}], ['park', { row: 5, col: 5 }, { variant: 'unknown' }]]) {
    const s = session(c, tool, tile, undefined, options); assert.equal(confirm(s).ok, false);
  }
  c.mapData[5][5] = c.WATER; assert.equal(confirm(session(c, 'park', { row: 5, col: 5 })).ok, false);
  c.mapData[5][5] = c.GROUND; const s = session(c, 'sports-ground', { row: 5, col: 5 });
  c.buildingData['6:6'] = { type: 'library' }; assert.equal(confirm(s).ok, false);
  assert.equal(c.city.budget, 10000);
});

test('park module cycling requires a fresh review when another park changes the chosen model', () => {
  const c = setup(), s = session(c, 'park', { row: 5, col: 5 }, undefined, { variant: 'victoria_park' });
  const first = s.getState().plan.spriteKey;
  c.placePark(c.scene, 12, 12, c.getTouchRecreationOptions('park').find(o => o.id === 'victoria_park'));
  assert.equal(confirm(s).reason, 'changed'); assert.notEqual(s.getState().plan.spriteKey, first);
  const reviewedKey = s.getState().plan.spriteKey;
  assert.equal(confirm(s).ok, true); assert.equal(c.buildingData['5:5'].spriteKey, reviewedKey);
});

test('district sign names are trimmed before a single paid commit; duplicates and the limit cannot be confirmed', () => {
  const c = setup();
  const s = session(c, 'district-sign', { row: 5, col: 5 });
  assert.equal(s.getState().plan.reason, 'mobile.signNeedsNames');
  s.setOptions({ name: '  西灣  ', englishName: '  Sai   Wan  ' });
  assert.equal(confirm(s).cost, 250);
  assert.equal(c.city.districtSigns[0].name, '西灣'); assert.equal(c.city.districtSigns[0].englishName, 'Sai Wan');
  const duplicate = session(c, 'district-sign', { row: 6, col: 6 }, undefined, { name: '西灣', englishName: 'Other' });
  assert.equal(confirm(duplicate).reason, 'toast.districtSignDuplicate');
  while (c.city.districtSigns.length < 16) c.city.districtSigns.push({ id: `other-${c.city.districtSigns.length}`, name: `other-${c.city.districtSigns.length}` });
  const limited = session(c, 'district-sign', { row: 6, col: 6 }, undefined, { name: '東灣', englishName: 'East Bay' });
  assert.equal(confirm(limited).reason, 'toast.districtSignLimit'); assert.equal(c.city.budget, 9750);
});

test('district signs recheck live budget and occupation; cancelling a named draft is free', () => {
  const c = setup(), names = { name: '西灣', englishName: 'Sai Wan' };
  let s = session(c, 'district-sign', { row: 5, col: 5 }, undefined, names);
  c.city.budget = 249; assert.equal(confirm(s).ok, false); assert.equal(c.city.districtSigns.length, 0);
  c.city.budget = 1000; c.zoneMap[5][5] = 1; assert.equal(confirm(s).ok, false);
  s = session(c, 'district-sign', { row: 6, col: 6 }, undefined, names); s.cancel();
  assert.equal(c.city.budget, 1000); assert.equal(c.city.districtSigns.length, 0);
});

test('desktop sign prompts share the same writer and never write after cancellation or switching cities', async () => {
  const c = setup(); let answers = ['舊區', 'Old District'];
  c.showTextPromptDialog = async () => answers.shift();
  assert.equal(await c.placeDistrictSign(c.scene, 5, 5), true); assert.equal(c.city.budget, 9750);
  answers = ['新區', null]; assert.equal(await c.placeDistrictSign(c.scene, 6, 6), false); assert.equal(c.city.districtSigns.length, 1);
  const sign = c.city.districtSigns[0]; answers = ['西區', 'Western'];
  assert.equal(await c.editDistrictSign(c.scene, sign), true); assert.equal(sign.name, '西區'); assert.equal(c.city.budget, 9750);
  c.showTextPromptDialog = async () => { c.city = { budget: 10, districtSigns: [] }; return 'Other'; };
  assert.equal(await c.editDistrictSign(c.scene, sign), false); assert.equal(sign.name, '西區');
});

test('late mobile name answers cannot revive a cancelled draft or write into a different map', async () => {
  for (const change of ['cancel', 'map']) {
    const c = setup(), s = session(c, 'district-sign', { row: 5, col: 5 });
    c.mobileBuildSession = s;
    const source = fs.readFileSync(path.join(ROOT, 'mobile-ui.js'), 'utf8');
    const start = source.indexOf('async function mobilePromptDistrictNames(');
    vm.runInContext(source.slice(start, source.indexOf('\n}\n', start) + 3), c);
    let prompts = 0;
    c.showTextPromptDialog = async () => {
      if (++prompts === 1) return '西灣';
      if (change === 'cancel') s.cancel(); else c.mapData = c.mapData.map(row => [...row]);
      return 'Sai Wan';
    };
    await c.mobilePromptDistrictNames();
    assert.equal(s.getState()?.options.name || '', '');
    assert.equal(c.city.districtSigns.length, 0); assert.equal(c.city.budget, 10000);
  }
});

test('cancelling a mobile name prompt retains the previous uncommitted names', async () => {
  const c = setup(), s = session(c, 'district-sign', { row: 5, col: 5 }, undefined, { name: '西灣', englishName: 'Sai Wan' });
  c.mobileBuildSession = s;
  const source = fs.readFileSync(path.join(ROOT, 'mobile-ui.js'), 'utf8');
  const start = source.indexOf('async function mobilePromptDistrictNames(');
  vm.runInContext(source.slice(start, source.indexOf('\n}\n', start) + 3), c);
  let prompts = 0;
  c.showTextPromptDialog = async () => ++prompts === 1 ? '東灣' : null;
  await c.mobilePromptDistrictNames();
  assert.equal(s.getState().options.name, '西灣'); assert.equal(s.getState().options.englishName, 'Sai Wan');
  assert.equal(c.city.districtSigns.length, 0); assert.equal(c.city.budget, 10000);
});
