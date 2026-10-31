const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
function fn(file, name) {
  const s = source(file), start = s.indexOf(`function ${name}(`), end = s.indexOf('\n}\n', start) + 3;
  assert.ok(start >= 0 && end > start, name);
  return s.slice(start, end);
}
function context() {
  const c = vm.createContext({ console, Math });
  vm.runInContext(source('constants.js'), c);
  return c;
}

test('approved pool and court replace the original paths without changing saved sprite identities or lots', () => {
  const c = context();
  const models = vm.runInContext('({court:SERVICE_BUILDING_MODELS.sports_ground_small,pool:PARK_MODELS.park_large_pool})', c);
  const pairs = [
    [models.court, 'Models/basketballCourt/bc_estateFullCourt_v2.png', 'sports_ground_2x2', 2],
    [models.pool, 'Models/swimmingPool/sp_simple3x3_v2.png', 'park_large_pool', 3],
  ];
  for (const [model, approved, key, size] of pairs) {
    assert.equal(model.spriteKey, key);
    assert.equal(model.footprintCols, size);
    assert.equal(model.footprintRows, size);
    assert.deepEqual(fs.readFileSync(path.join(ROOT, model.path)), fs.readFileSync(path.join(ROOT, approved)));
    assert.ok(model.cacheVersion);
  }
});

test('market tool places a repeatable 2x2 market, charges once and refuses occupied or unaffordable lots', () => {
  const c = context(), placed = [];
  Object.assign(c, {
    selectedTool: 'public-market', buildingData: {}, city: { budget: 10000 },
    powerPlantModelMetadata: {}, serviceBuildingModelMetadata: {}, specialBuildingModelMetadata: {},
    isInsideMap: () => true, canPlaceBuildingFootprint: () => c.free,
    getTileId: (r, col) => `${r}:${col}`, free: true,
    spendBudget: (cost) => { if (c.city.budget < cost) return false; c.city.budget -= cost; return true; },
    placeSpriteBuilding: (_scene, row, col, key, opts) => placed.push({ row, col, key, opts: plain(opts) }),
    refreshInfrastructureEffects: () => {}, t: (key) => key, showToast: () => {},
  });
  vm.runInContext(source('tools.js'), c);
  c.refreshInfrastructureEffects = () => {};
  assert.equal(vm.runInContext('handleNewTool({}, {row:10,col:20})', c), true);
  assert.equal(c.city.budget, 6800);
  assert.deepEqual(plain(c.buildingData['10:20']), {
    type: 'public_market', level: 1, population: 0, age: 0, spriteKey: 'public_market_2x2',
    assetId: 'Models/publicMarket/pm_market3x3_style_v3.png', footprintCols: 2, footprintRows: 2,
  });
  c.free = false;
  assert.equal(vm.runInContext('handleNewTool({}, {row:10,col:20})', c), false);
  assert.equal(c.city.budget, 6800);
  c.free = true; c.city.budget = 3199;
  assert.equal(vm.runInContext('handleNewTool({}, {row:30,col:40})', c), false);
  assert.equal(c.city.budget, 3199);
  assert.equal(c.buildingData['30:40'], undefined);
  c.city.budget = 5000;
  assert.equal(vm.runInContext('handleNewTool({}, {row:30,col:40})', c), true);
  assert.equal(placed.length, 2, 'a neighbourhood market is repeatable');
  assert.equal(c.city.budget, 1800);
  for (const p of placed) {
    assert.equal(p.key, 'public_market_2x2');
    assert.equal(p.opts.footprintCols, 2);
    assert.equal(p.opts.footprintRows, 2);
  }
});

test('market preview and translated menu are wired to the same tool and two-tile lot', () => {
  const c = context();
  vm.runInContext(source('tools.js'), c);
  c.selectedTool = 'public-market';
  vm.runInContext(fn('main.js', 'getSelectedPlacementFootprint'), c);
  vm.runInContext(fn('tool-menu.js', 'getToolCategoryForTool'), c);
  assert.deepEqual(plain(c.getSelectedPlacementFootprint()), { footprintCols: 2, footprintRows: 2 });
  assert.equal(c.getToolCategoryForTool('public-market'), 'services');
  assert.match(source('index.html'), /data-tool="public-market"[\s\S]*?data-i18n="toolRow.publicMarket"/);
  assert.equal((source('i18n.js').match(/'toolRow\.publicMarket':/g) || []).length, 3);
  assert.equal((source('i18n.js').match(/'building\.publicMarket':/g) || []).length, 3);
});

test('loading a market resolves its model, while pool and court discard obsolete saved scale and origin', () => {
  const c = context();
  Object.assign(c, {
    houseModelSets: {}, commercialBuildingModels: [], industrialBuildingModels: [],
    parkModelMetadata: { park_large_pool: { footprintCols: 3, footprintRows: 3, originX: .5, originY: .8, scale: .25 } },
    serviceBuildingModelMetadata: { sports_ground_2x2: { footprintCols: 2, footprintRows: 2, originX: .5, originY: .9, scale: .2 } },
    specialBuildingModelMetadata: { public_market_2x2: { footprintCols: 2, footprintRows: 2, originX: .5, originY: .95, scale: .3 } },
    getSaveModelForRecord: () => null,
    migrateServiceSpriteKey: (_record, key) => key,
    getLegacy2x2HouseFallbackSpriteKey: () => null,
    getLegacyCommercialFallbackSpriteKey: () => null,
    getParkOptionBySpriteKey: () => null,
    PARK_OPTIONS: [], SPORT_GROUND_OPTIONS: [],
  });
  vm.runInContext(source('building-placement.js'), c);
  for (const name of ['deriveLoadedSpriteKey', 'deriveFallbackSpriteKey', 'normalizeLoadedBuildingOptions']) vm.runInContext(fn('save.js', name), c);
  for (const [type, spriteKey, size] of [['public_market', 'public_market_2x2', 2], ['park_large', 'park_large_pool', 3], ['sports_ground_small', 'sports_ground_2x2', 2]]) {
    const saved = { type, spriteKey, footprintCols: size, footprintRows: size, originX: .01, originY: .02, scale: 999 };
    const record = JSON.parse(JSON.stringify(saved));
    assert.equal(c.deriveLoadedSpriteKey(record), spriteKey);
    const opts = c.normalizeLoadedBuildingOptions(spriteKey, record);
    assert.equal(opts.footprintCols, size);
    assert.equal(opts.footprintRows, size);
    assert.notEqual(opts.scale, 999);
    assert.equal(opts.originX, .5);
  }
  assert.equal(c.deriveLoadedSpriteKey({type:'public_market'}), 'public_market_2x2');
  const legacy = {type:'public_market', spriteKey:'public_market_3x3', footprintCols:3, footprintRows:3, originX:.01, originY:.02, scale:999};
  const key = c.deriveLoadedSpriteKey(legacy);
  assert.equal(key, 'public_market_2x2');
  const migrated = c.normalizeLoadedBuildingOptions(key, legacy);
  assert.equal(migrated.footprintCols, 2);
  assert.equal(migrated.footprintRows, 2);
  assert.notEqual(migrated.scale, 999);
});

test('market upkeep and power participate in the standard infrastructure economy', () => {
  const c = context();
  Object.assign(c, { getBuildingCount: (type) => type === 'public_market' ? 2 : 0 });
  vm.runInContext(fn('city-state.js', 'computeLandmarkFinancials'), c);
  assert.deepEqual(plain(c.computeLandmarkFinancials()), { revenue: 0, upkeep: 160 });
  assert.ok(vm.runInContext('BUILDING_POWER_DEMAND.public_market > 0', c));
  assert.ok(vm.runInContext('!SPECIAL_BUILDING_UNLOCKS.public_market', c), 'ordinary markets have no landmark gate');
});
