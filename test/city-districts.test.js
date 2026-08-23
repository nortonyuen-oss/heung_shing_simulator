const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function createRandom(seedText) {
  const seedString = String(seedText ?? '');
  let hash = 2166136261;
  for (let index = 0; index < seedString.length; index++) {
    hash ^= seedString.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createDistrictsVm(overrides = {}) {
  const context = vm.createContext({
    console,
    currentSeed: 'seed-a',
    MAP_WIDTH: 256,
    MAP_HEIGHT: 256,
    createRandom,
    getDistrictSignForTile: () => null,
    ...overrides,
  });
  const source = fs.readFileSync(path.join(ROOT, 'city-districts.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'city-districts.js' });
  return context;
}

test('every tile resolves to one of the 18 HK districts when no sign covers it', () => {
  const context = createDistrictsVm();
  const samples = [[0, 0], [0, 255], [255, 0], [255, 255], [128, 128], [40, 200], [200, 40]];
  const zhNames = new Set(context.getBaseCityDistricts().map((d) => d.zh));
  samples.forEach(([row, col]) => {
    const result = context.getDistrictNameForTile(row, col);
    assert.ok(zhNames.has(result.zh), `${result.zh} should be one of the 18 HK districts`);
    assert.ok(result.sourceId.startsWith('base:'));
    assert.equal(result.zh.endsWith('區'), true);
  });
});

test('the 18 base districts are scattered as distinct, non-overlapping seed points', () => {
  const context = createDistrictsVm();
  const districts = context.getBaseCityDistricts();
  assert.equal(districts.length, 18);
  const uniquePositions = new Set(districts.map((d) => `${d.row}:${d.col}`));
  assert.equal(uniquePositions.size, 18);
  const uniqueNames = new Set(districts.map((d) => d.zh));
  assert.equal(uniqueNames.size, 18);
});

test('zhRoot strips the trailing 區 for compounding into place names', () => {
  const context = createDistrictsVm();
  context.getBaseCityDistricts().forEach((district) => {
    assert.equal(district.zhRoot, district.zh.replace(/區$/, ''));
    assert.equal(district.zhRoot.endsWith('區'), false);
  });
});

test('the same seed always reproduces the same district layout', () => {
  const a = createDistrictsVm({ currentSeed: 'same-seed' });
  const b = createDistrictsVm({ currentSeed: 'same-seed' });
  assert.equal(JSON.stringify(a.getBaseCityDistricts()), JSON.stringify(b.getBaseCityDistricts()));
});

test('a different seed reshuffles the district layout', () => {
  const a = createDistrictsVm({ currentSeed: 'seed-one' });
  const b = createDistrictsVm({ currentSeed: 'seed-two' });
  assert.notEqual(JSON.stringify(a.getBaseCityDistricts()), JSON.stringify(b.getBaseCityDistricts()));
});

test('a district sign overrides the base HK district for tiles within its radius', () => {
  const sign = { id: 'sign-1', name: '自定義新市鎮', englishName: 'Custom New Town', row: 50, col: 50, radius: 10 };
  const context = createDistrictsVm({
    getDistrictSignForTile: (row, col) => (
      Math.hypot(row - sign.row, col - sign.col) <= sign.radius ? sign : null
    ),
  });
  const covered = context.getDistrictNameForTile(52, 51);
  assert.equal(covered.zh, '自定義新市鎮');
  assert.equal(covered.en, 'Custom New Town');
  assert.equal(covered.zhRoot, '自定義新市鎮');
  assert.equal(covered.sourceId, 'sign:sign-1');
  assert.equal(JSON.stringify(covered.center), JSON.stringify({ row: 50, col: 50 }));

  const outside = context.getDistrictNameForTile(200, 200);
  assert.equal(outside.sourceId.startsWith('base:'), true);
});
