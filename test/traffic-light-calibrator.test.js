const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');

// traffic-light-calibrator.js reuses plain browser globals declared in
// traffic-visuals.js (TRAFFIC_MODEL_REGISTRY, getTrafficLightProfile, …) and
// visual-route-calibrator.js (visualRouteCalibrationRound). Under `node --test`
// those are separate CommonJS modules with no shared scope, so - matching
// test/airport-route-calibrator.test.js - load every source into one vm context
// to reproduce the browser's shared-<script> global scope, and read values back
// with vm.runInContext since top-level `const`s never land on the context object.
function createContext() {
  const context = vm.createContext({ console });
  vm.runInContext(source('traffic-visuals.js'), context, { filename: 'traffic-visuals.js' });
  vm.runInContext(source('visual-route-calibrator.js'), context, { filename: 'visual-route-calibrator.js' });
  vm.runInContext(source('traffic-light-calibrator.js'), context, { filename: 'traffic-light-calibrator.js' });
  const run = (expr) => vm.runInContext(expr, context);
  // Calibrated overrides only apply while the shared test mode is on.
  run('setVisualRouteCalibrationTestModeEnabled(true)');
  return run;
}

const toPlain = (value) => JSON.parse(JSON.stringify(value));
const NE_LAMPS = '{ headL: [11, -9], headR: [15, -7, 0], tailL: [-6, -4], tailR: [-2, -2] }';

test('an uncalibrated model has no override and falls through to the category default', () => {
  const run = createContext();
  assert.equal(run(`getTrafficLightCalibrationOverride('car_hrv')`), null);
  // Registry models now ship baked lightAnchors, so probe with a synthetic model.
  assert.equal(
    run(`getTrafficVehicleLightAnchors({ category: 'car', id: 'synthetic_probe' })
      === getTrafficLightProfile({ category: 'car' }).anchors`),
    true,
  );
});

test('touching one view yields a complete set; untouched lamps come from the default, off flags survive', () => {
  const run = createContext();
  run(`trafficLightCalibratorTestApi._setOverrideForTest('car_hrv', 'ne', ${NE_LAMPS})`);

  const complete = toPlain(run(`getTrafficLightCalibrationOverride('car_hrv')`));
  assert.deepEqual(Object.keys(complete).sort(), ['ne', 'nw', 'se', 'sw']);
  assert.deepEqual(Object.keys(complete.ne).sort(), ['headL', 'headR', 'tailL', 'tailR']);
  assert.deepEqual(complete.ne.headL, [11, -9, 1]);
  assert.deepEqual(complete.ne.headR, [15, -7, 0], 'the off flag is kept');

  // car_hrv now ships baked anchors, so an untouched view starts from those.
  const bakedSw = toPlain(run(`(() => {
    const a = TRAFFIC_MODEL_BY_ID.get('car_hrv').lightAnchors.sw;
    const t = (v) => [v[0], v[1], v.length < 3 ? 1 : (v[2] ? 1 : 0)];
    return { headL: t(a.headL), headR: t(a.headR), tailL: t(a.tailL), tailR: t(a.tailR) };
  })()`));
  assert.deepEqual(complete.sw, bakedSw);

  // The runtime resolver returns the calibrated set, and the pose carries the flag.
  assert.equal(
    run(`getTrafficVehicleLightPose({ x: 0, y: 0 },
      getTrafficVehicleLightAnchors(TRAFFIC_MODEL_BY_ID.get('car_hrv')), 'ne').pts.headR.on`),
    false,
  );
});

test('a bus override completes all eight lamps including the deck-tube endpoints', () => {
  const run = createContext();
  run(`trafficLightCalibratorTestApi._setOverrideForTest('bus_kmb', 'ne', { headL: [1, 2] })`);
  const complete = toPlain(run(`getTrafficLightCalibrationOverride('bus_kmb')`));
  assert.deepEqual(
    Object.keys(complete.ne).sort(),
    ['deckLoL', 'deckLoR', 'deckUpL', 'deckUpR', 'headL', 'headR', 'tailL', 'tailR'],
  );
  assert.deepEqual(complete.ne.headL, [1, 2, 1]);
  assert.ok(Array.isArray(complete.ne.deckUpL) && complete.ne.deckUpL.length === 3);
});

test('the exported record carries only touched models', () => {
  const run = createContext();
  run(`trafficLightCalibratorTestApi._setOverrideForTest('taxi_red', 'se', { headL: [8, -2], tailR: [-1, -1] })`);
  const record = toPlain(run(`trafficLightCalibratorTestApi.buildTrafficLightCalibrationRecord()`));
  assert.equal(record.kind, 'traffic-vehicle-lamp-anchors');
  assert.deepEqual(Object.keys(record.models), ['taxi_red']);
  assert.deepEqual(record.models.taxi_red.se.headL, [8, -2, 1]);
});

test('the pasteable snippet lists every lamp for every view and marks off lamps', () => {
  const run = createContext();
  const firstId = run('TRAFFIC_MODEL_REGISTRY[0].id'); // registry cursor starts at 0
  run(`trafficLightCalibratorTestApi._setOverrideForTest('${firstId}', 'ne', ${NE_LAMPS})`);
  const snippet = run('buildTrafficLightCalibrationCurrentSnippet()');
  assert.match(snippet, new RegExp(`// ${firstId}`));
  assert.match(snippet, /lightAnchors: \{/);
  for (const view of ['ne', 'nw', 'se', 'sw']) {
    assert.match(snippet, new RegExp(`${view}: \\{ headL: \\[.*tailR: \\[`));
  }
  assert.match(snippet, /headL: \[11, -9\], headR: \[15, -7, 0\]/, 'an off lamp keeps its 3rd element');
});

test('index.html loads the calibrator after traffic-visuals.js', () => {
  const html = source('index.html');
  const visualsAt = html.indexOf('src="traffic-visuals.js"');
  const calibratorAt = html.indexOf('src="traffic-light-calibrator.js"');
  assert.ok(visualsAt > 0 && calibratorAt > visualsAt);
});
