const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');
// vm contexts have their own Array/Object constructors, so a value built inside one is never
// deepEqual to a same-realm literal by Node's strict structural check; round-tripping through
// JSON (as test/bridge-parapets.test.js's toPlain does) strips the foreign realm away.
const toPlain = (value) => JSON.parse(JSON.stringify(value));

// road-line-markings.js calls getRoadTileTextureKey/getRoadTileAssetPath (road-tile-sets.js)
// as bare globals, the same cross-file-globals arrangement bridge-parapets.js has with
// constants.js/street-lamps.js - so both load into one vm context, mirroring
// test/bridge-parapets.test.js's createContext.
function createContext() {
  const context = vm.createContext({ console });
  vm.runInContext(source('road-tile-sets.js'), context, { filename: 'road-tile-sets.js' });
  vm.runInContext(source('road-line-markings.js'), context, { filename: 'road-line-markings.js' });
  return (expr) => vm.runInContext(expr, context);
}

test('getRoadLineTextureKey suffixes the base road-tile-set texture key with the variant id', () => {
  const run = createContext();
  assert.equal(
    run("getRoadLineTextureKey('road_straight_h', 'busStop', 'newRoadTiles')"),
    'roads_new_road_straight_h__lines_busStop',
  );
  assert.equal(
    run("getRoadLineTextureKey('road_cross', 'stopLine', 'classic')"),
    'roads_classic_road_cross__lines_stopLine',
  );
  assert.equal(run("getRoadLineTextureKey('road_cross', null, 'classic')"), null);
});

test('getRoadLineBakedAssetPath points at the sibling __lines_<variant> file', () => {
  const run = createContext();
  assert.equal(
    run("getRoadLineBakedAssetPath('road_straight_h', 'parkingBay', 'newRoadTiles')"),
    'newRoadTiles/roadNS_fixed__lines_parkingBay.png',
  );
});

test('a tile with no calibrated variants reports none, and an uncalibrated variant is empty', () => {
  const run = createContext();
  // road_end_n has no calibrated profile at all; road_straight_h/_v do (real calibrated data
  // below), so this deliberately picks a tile shape that's still genuinely untouched.
  assert.deepEqual(toPlain(run("getRoadLineVariantIds('road_end_n')")), []);
  assert.equal(run("roadTileVariantHasLineMarkings('road_end_n', 'busStop')"), false);
  assert.deepEqual(toPlain(run("getRoadLinePlacements('road_end_n', 'busStop')")), []);
});

test('every marking referenced by ROAD_LINE_TILE_PROFILES exists in ROAD_LINE_MARKING_FILES', () => {
  const run = createContext();
  const profiles = run('ROAD_LINE_TILE_PROFILES');
  const markingKeys = new Set(run('Object.keys(ROAD_LINE_MARKING_FILES)'));
  Object.entries(profiles).forEach(([tileKey, variants]) => {
    Object.entries(variants).forEach(([variantId, placements]) => {
      placements.forEach((p) => {
        assert.ok(markingKeys.has(p.marking), `${tileKey}/${variantId} references unknown marking '${p.marking}'`);
      });
    });
  });
});

test('every marking file this module registers exists on disk', () => {
  const run = createContext();
  const files = run('ROAD_LINE_MARKING_FILES');
  Object.entries(files).forEach(([key, entry]) => {
    assert.ok(fs.existsSync(path.join(ROOT, entry.file)), `${key} -> ${entry.file} is missing`);
  });
});

test('every variant label is for a plausible variant id (no stray "plain" entry)', () => {
  const run = createContext();
  const labels = run('ROAD_LINE_VARIANT_LABELS');
  assert.ok(!('plain' in labels), "'plain' is an implicit no-variant state, not a labelled one");
});

test('applyRoadLineTexture restores the base texture when no variant applies', () => {
  const run = createContext();
  const scene = { textures: { exists: () => false } };
  const sprite = {
    texture: { key: 'roads_new_road_straight_h__lines_busStop' },
    __roadLineBaseTextureKey: 'roads_new_road_straight_h',
    setTexture(key) { this.texture = { key }; },
  };
  const context = vm.createContext({ console, scene, sprite });
  vm.runInContext(source('road-tile-sets.js'), context, { filename: 'road-tile-sets.js' });
  vm.runInContext(source('road-line-markings.js'), context, { filename: 'road-line-markings.js' });
  const changed = vm.runInContext("applyRoadLineTexture(scene, sprite, 'road_straight_h', null, 'newRoadTiles')", context);
  assert.equal(changed, true);
  assert.equal(sprite.texture.key, 'roads_new_road_straight_h');
});

test('applyRoadLineTexture is a no-op when the requested variant has no baked texture', () => {
  const run = createContext();
  const scene = { textures: { exists: () => false } };
  const sprite = { texture: { key: 'roads_new_road_straight_h' }, setTexture(key) { this.texture = { key }; } };
  const context = vm.createContext({ console, scene, sprite });
  vm.runInContext(source('road-tile-sets.js'), context, { filename: 'road-tile-sets.js' });
  vm.runInContext(source('road-line-markings.js'), context, { filename: 'road-line-markings.js' });
  const changed = vm.runInContext("applyRoadLineTexture(scene, sprite, 'road_straight_h', 'busStop', 'newRoadTiles')", context);
  assert.equal(changed, false);
  assert.equal(sprite.texture.key, 'roads_new_road_straight_h');
});
