const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');
const toPlain = (value) => JSON.parse(JSON.stringify(value));

// road-line-calibrator.js calls getRoadLineMarkingFile (road-line-markings.js), which itself
// calls getRoadTileTextureKey/getRoadTileAssetPath (road-tile-sets.js) as bare globals - the
// same arrangement test/road-line-markings.test.js already loads into one vm context. None of
// the functions this file exercises touch document/window/Image, so no DOM shim is needed.
function createContext() {
  const context = vm.createContext({ console });
  vm.runInContext(source('road-tile-sets.js'), context, { filename: 'road-tile-sets.js' });
  vm.runInContext(source('road-line-markings.js'), context, { filename: 'road-line-markings.js' });
  vm.runInContext(source('road-line-calibrator.js'), context, { filename: 'road-line-calibrator.js' });
  return context;
}

// This is the exact bug DevTools surfaced: a placement saved by the tool before it moved from
// centre+rotation+scale to four corners has no `corners` field, and every render/list call
// crashed on `p.corners.map`/`.reduce` of undefined - which (since the keyboard listener used
// to be wired up *after* those render calls) silently took keyboard input down with it too.
test('migrateRoadLinePlacement upgrades an old centre/rotation/scale placement to a corners quad', () => {
  const context = createContext();
  context.old = { marking: 'busStopText_bilingual', x: 0.5, y: 0.5, rotation: 0, scale: 1 };
  const migrated = toPlain(vm.runInContext('migrateRoadLinePlacement(old)', context));
  assert.equal(migrated.marking, 'busStopText_bilingual');
  assert.equal(migrated.corners.length, 4);
  const cx = migrated.corners.reduce((s, c) => s + c[0], 0) / 4;
  const cy = migrated.corners.reduce((s, c) => s + c[1], 0) / 4;
  assert.ok(Math.abs(cx - 0.5) < 1e-6, `expected centroid x near 0.5, got ${cx}`);
  assert.ok(Math.abs(cy - 0.5) < 1e-6, `expected centroid y near 0.5, got ${cy}`);
  // a real, non-degenerate quad (not four coincident points)
  const xs = new Set(migrated.corners.map((c) => c[0].toFixed(4)));
  assert.ok(xs.size > 1, 'expected the reconstructed quad to have width');
});

test('migrateRoadLinePlacement leaves an already-current placement untouched', () => {
  const context = createContext();
  context.current = {
    marking: 'arrowStraight',
    corners: [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]],
    opacity: 0.8,
  };
  const result = toPlain(vm.runInContext('migrateRoadLinePlacement(current)', context));
  assert.deepEqual(result, toPlain(context.current));
});

test('migrateRoadLinePlacement drops anything it cannot make sense of', () => {
  const context = createContext();
  assert.equal(vm.runInContext('migrateRoadLinePlacement(null)', context), null);
  assert.equal(vm.runInContext("migrateRoadLinePlacement({ marking: 'arrowStraight' })", context), null);
  assert.equal(vm.runInContext('migrateRoadLinePlacement({})', context), null);
});

test('setRoadLineCalibrationOverrides migrates old placements and drops unrecognizable ones in bulk', () => {
  const context = createContext();
  vm.runInContext(`
    setRoadLineCalibrationOverrides({
      'road_straight_h::busStop': [{ marking: 'busStopText_bilingual', x: 0.5, y: 0.5, rotation: 0, scale: 1 }],
      'road_cross::stopLine': [{ marking: 'arrowStraight', corners: [[0.2,0.2],[0.8,0.2],[0.8,0.8],[0.2,0.8]] }],
      'road_t_n::parkingBay': [{ marking: 'unknown!' }],
    });
  `, context);
  const overrides = toPlain(vm.runInContext('roadLineCalibrationOverrides', context));
  assert.equal(overrides['road_straight_h::busStop'].length, 1);
  assert.equal(overrides['road_straight_h::busStop'][0].corners.length, 4);
  assert.equal(overrides['road_cross::stopLine'][0].corners.length, 4);
  assert.deepEqual(overrides['road_t_n::parkingBay'], []);
});

// The actual bug report this fixed: "I set up two variants but the dropdown doesn't show
// them" - a freshly-created variant has no placements yet (you add its first marking
// afterwards), and requiring a non-empty list to "count" as an existing variant made it vanish
// from the picker the moment you looked at anything else.
test('roadLineCalibrationVariantIdsFor lists a variant that exists but has no placements yet', () => {
  const context = createContext();
  vm.runInContext(`
    setRoadLineCalibrationOverrides({
      'road_straight_h::busStop': [{ marking: 'busStopText_bilingual', corners: [[0.3,0.3],[0.7,0.3],[0.7,0.7],[0.3,0.7]] }],
      'road_straight_h::parkingBay': [],
    });
  `, context);
  const ids = toPlain(vm.runInContext("roadLineCalibrationVariantIdsFor('road_straight_h')", context));
  assert.deepEqual([...ids].sort(), ['busStop', 'parkingBay']);
});

test("roadLineCalibrationVariantIdsFor falls back to ['plain'] when the tile has no variants at all", () => {
  const context = createContext();
  const ids = toPlain(vm.runInContext("roadLineCalibrationVariantIdsFor('road_straight_h')", context));
  assert.deepEqual(ids, ['plain']);
});
