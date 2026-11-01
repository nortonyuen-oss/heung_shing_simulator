const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function pickFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next >= 0 ? next : source.length);
}

// The generator and the helpers it calls as one plain function in this realm: a vm sandbox
// makes its typed-array loops cross realms and run many times slower.
function loadGenerator() {
  const source = `
    const MAP_WIDTH = 256, MAP_HEIGHT = 256, MAX_TERRAIN_HEIGHT = 8;
    const GROUND = 1, ROAD = 2, DIRT = 3, BEACH = 4, WATER = 5, HILL = 6;
    ${pickFunction(read('constants.js'), 'createFilledMap')}
    ${pickFunction(read('main.js'), 'isInsideMap')}
    ${pickFunction(read('tile-keys.js'), 'areOppositeDirs')}
    ${read('terrain-generation.js')}
    ${read('terrain-original.js')}
    return { ORIGINAL_TERRAIN_TARGETS, generateOriginalTerrain };
  `;
  return new Function(`let heightMap, currentTerrainMetadata; ${source}`)();
}

const { ORIGINAL_TERRAIN_TARGETS, generateOriginalTerrain } = loadGenerator();

function measure(terrain) {
  let water = 0;
  let dirt = 0;
  let cliffs = 0;
  const levels = new Array(9).fill(0);
  for (let row = 0; row < 256; row++) {
    for (let col = 0; col < 256; col++) {
      const tile = terrain.mapData[row][col];
      const height = terrain.heightMap[row][col];
      if (tile === 5) water++;
      else levels[height]++;
      if (tile === 3) dirt++;
      if (col < 255 && Math.abs(height - terrain.heightMap[row][col + 1]) > 1) cliffs++;
      if (row < 255 && Math.abs(height - terrain.heightMap[row + 1][col]) > 1) cliffs++;
    }
  }
  const land = 65536 - water;
  return { water: (water / 65536) * 100, dirt, cliffs, levels: levels.map((n) => n / Math.max(1, land)) };
}

test('原創地形 matches real Hong Kong for every landform', () => {
  Object.entries(ORIGINAL_TERRAIN_TARGETS).forEach(([landform, target]) => {
    ['a', 'b'].forEach((seed) => {
      const m = measure(generateOriginalTerrain(landform, `test-${seed}`));
      const [low, , high] = target.water;
      assert.ok(m.water >= low - 6 && m.water <= high + 6, `${landform}/${seed}: water ${m.water.toFixed(1)}% outside ${low}-${high}%`);
      assert.equal(m.dirt, 0, `${landform}/${seed}: no dirt dots`);
      assert.equal(m.cliffs, 0, `${landform}/${seed}: no step steeper than one level`);
      assert.ok(m.levels[8] < 0.05, `${landform}/${seed}: no table-top mountains (${(m.levels[8] * 100).toFixed(1)}% at level 8)`);
      const lowest = m.levels.indexOf(Math.max(...m.levels));
      if (landform !== 'hk-hillside') assert.equal(lowest, 0, `${landform}/${seed}: flat ground is the most common height`);
    });
  });
});

test('the same seed grows the same map, and another seed a different one', () => {
  const a = generateOriginalTerrain('hk-harbour', 'same');
  const b = generateOriginalTerrain('hk-harbour', 'same');
  const c = generateOriginalTerrain('hk-harbour', 'other');
  assert.equal(JSON.stringify(a.heightMap), JSON.stringify(b.heightMap));
  assert.notEqual(JSON.stringify(a.heightMap), JSON.stringify(c.heightMap));
});
