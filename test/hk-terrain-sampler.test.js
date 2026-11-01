const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function pickFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next >= 0 ? next : source.length);
}

// The sampler with the terrain helpers it calls, as one plain script (vm global lookups make the
// generator's loops very slow, so they run as locals of a single function).
function loadSampler() {
  const presets = read('terrain-presets.js');
  const source = `
    const MAP_WIDTH = 256, MAP_HEIGHT = 256, MAX_TERRAIN_HEIGHT = 8;
    const GROUND = 1, ROAD = 2, DIRT = 3, BEACH = 4, WATER = 5, HILL = 6;
    ${pickFunction(read('constants.js'), 'createFilledMap')}
    ${pickFunction(read('main.js'), 'isInsideMap')}
    ${pickFunction(read('tile-keys.js'), 'areOppositeDirs')}
    ${read('terrain-generation.js')}
    ${read('hk-district-maps.js')}
    ${read('hk-terrain-tiles.js')}
    ${presets.slice(presets.indexOf('// Hong Kong district maps'))}
    return { HK_TERRAIN_TILES, HK_TERRAIN_WINDOWS, HK_TERRAIN_LANDFORMS, listHkTerrainWindows, decodeHkTerrainRow, sampleHkTerrain };
  `;
  return vm.runInNewContext(`(function () { ${source} })()`, { Math, Set, Map, Array, Number, Object, JSON });
}

const sampler = loadSampler();

test('every 香港實景 landform has a pool of real windows inside Hong Kong', () => {
  const { HK_TERRAIN_TILES: tiles, HK_TERRAIN_LANDFORMS: landforms, listHkTerrainWindows } = sampler;
  Object.keys(landforms).forEach((landform) => {
    const windows = listHkTerrainWindows(landform);
    assert.ok(windows.length >= 100, `${landform} has only ${windows.length} windows`);
    windows.forEach((w) => {
      assert.ok(w.col >= 0 && w.col + 256 <= tiles.width, `${landform} window col ${w.col}`);
      assert.ok(w.row >= 0 && w.row + 256 <= tiles.height, `${landform} window row ${w.row}`);
      // Shenzhen is stored as sea: windows stay south of 841000 N (build-hk-district-maps.py)
      assert.ok(tiles.northN - w.row * tiles.tileMetres <= 841000, `${landform} window reaches Shenzhen`);
    });
  });
});

test('decoding part of a row matches decoding the whole row', () => {
  const { HK_TERRAIN_TILES: tiles, decodeHkTerrainRow } = sampler;
  const encoded = tiles.rows[1200];
  const full = decodeHkTerrainRow(encoded, 0, tiles.width);
  assert.equal(full.filter(Boolean).length, tiles.width, 'the row covers the full width');
  [0, 1, 777, tiles.width - 256].forEach((from) => {
    assert.deepEqual(Array.from(decodeHkTerrainRow(encoded, from, 256)), full.slice(from, from + 256));
  });
});

test('the same seed always samples the same map', () => {
  const { sampleHkTerrain } = sampler;
  const a = sampleHkTerrain('hk-harbour', 'test-seed');
  const b = sampleHkTerrain('hk-harbour', 'test-seed');
  const c = sampleHkTerrain('hk-harbour', 'other-seed');
  assert.equal(JSON.stringify(a.mapData), JSON.stringify(b.mapData));
  assert.equal(a.features[1], b.features[1]);
  assert.notEqual(a.features[1], c.features[1]);
  assert.ok(a.mapData.some((row) => row.includes(5)) && a.mapData.some((row) => row.includes(1)), 'a harbour has land and sea');
});
