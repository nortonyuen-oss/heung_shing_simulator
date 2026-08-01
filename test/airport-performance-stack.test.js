const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function getFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}') depth--;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

test('all airport footprint profiles resolve to one canonical texture key', () => {
  const constants = fs.readFileSync(path.join(ROOT, 'constants.js'), 'utf8');
  const context = vm.createContext({});
  const values = vm.runInContext(`${constants}\n;({
    models: getAllSpecialBuildingModels('airport'),
    textureKeys: getAllSpecialBuildingModels('airport').map(getFixedBuildingTextureKey),
  })`, context);
  assert.deepEqual([...values.models].map((model) => model.footprintCols), [12, 6, 8]);
  assert.deepEqual([...new Set(values.textureKeys)], ['airport_12x12']);
  assert.equal(new Set([...values.models].map((model) => model.path)).size, 1);
});

test('fixed-building manifest geometry produces footprint-specific metadata without image scans', () => {
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const source = getFunctionSource(main, 'getManifestFixedBuildingModelMetadata');
  const context = vm.createContext({
    modelAssetManifest: {
      entries: {
        'Models/airPort/6x6/airport6-01.png': {
          outputWidth: 1024,
          outputHeight: 512,
          geometry: {
            minX: 16,
            maxX: 1007,
            bottomY: 509,
            stableBaseY: 491,
            bottomX: 507.5,
            leftBaseX: 462,
            lowestCornerX: 507.5,
          },
        },
      },
    },
    normalizeModelLogicalPath: (value) => value,
    getFootprintScreenWidth: (cols, rows) => (cols + rows) * 50,
    applySpriteAnchorMode: (metadata, anchorMode) => ({ ...metadata, anchorMode }),
    DEFAULT_BUILDING_ANCHOR_MODE: 'effective-bottom-to-map-bottom',
    spriteMetadataProfileStats: { manifestHits: 0 },
  });
  vm.runInContext(source, context);
  const metadata = vm.runInContext(`getManifestFixedBuildingModelMetadata({
    path: 'Models/airPort/6x6/airport6-01.png',
    footprintCols: 12,
    footprintRows: 12,
  })`, context);
  assert.equal(metadata.footprintCols, 12);
  assert.equal(metadata.footprintRows, 12);
  assert.equal(metadata.scale, 1200 / 992);
  assert.equal(metadata.originX, 507.5 / 1024);
  assert.equal(metadata.originY, 491 / 512);
  assert.equal(context.spriteMetadataProfileStats.manifestHits, 1);
});

test('facility cache rebuilds only after a real building mutation', () => {
  const cityState = fs.readFileSync(path.join(ROOT, 'city-state.js'), 'utf8');
  const start = cityState.indexOf('let _buildingCountCache = null;');
  const end = cityState.indexOf('\nfunction markPowerGridDirty()', start);
  assert.ok(start >= 0 && end > start);
  const buildingData = {
    '10:20': { type: 'airport', footprintCols: 12, footprintRows: 12 },
    '2:3': { type: 'residential', footprintCols: 1, footprintRows: 1 },
  };
  const context = vm.createContext({ buildingData, Map, Object, Number, String, Math });
  vm.runInContext(cityState.slice(start, end), context);

  let airports = vm.runInContext("getBuildingFacilityEntries('airport')", context);
  assert.equal(airports.length, 1);
  assert.equal(airports[0].centerRow, 15.5);
  assert.equal(airports[0].centerCol, 25.5);
  vm.runInContext("getBuildingFacilityEntries('airport')", context);
  let stats = vm.runInContext('getBuildingFacilityCacheStats()', context);
  assert.equal(stats.rebuilds, 1);
  assert.equal(stats.misses, 1);
  assert.equal(stats.hits, 1);

  buildingData['30:40'] = { type: 'airport', footprintCols: 6, footprintRows: 6 };
  vm.runInContext('invalidateBuildingCountCache({ facilities: false })', context);
  airports = vm.runInContext("getBuildingFacilityEntries('airport')", context);
  assert.equal(airports.length, 1, 'simulation count refresh must keep the hot facility cache');

  vm.runInContext('invalidateBuildingCountCache()', context);
  airports = vm.runInContext("getBuildingFacilityEntries('airport')", context);
  stats = vm.runInContext('getBuildingFacilityCacheStats()', context);
  assert.equal(airports.length, 2);
  assert.equal(stats.rebuilds, 2);
});
