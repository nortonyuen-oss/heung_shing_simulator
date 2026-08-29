const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const source = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// building-light-calibrator.js reads plain browser globals from building-lighting.js
// (makeBuildingLightProfile, getBuildingLightClass, …) and visual-route-calibrator.js
// (visualRouteCalibrationRound, isVisualRouteCalibrationTestModeEnabled). Match the
// other calibrator tests: one shared vm context reproduces the <script> global scope.
function createContext() {
  const ctx = vm.createContext({ console });
  vm.runInContext(source('building-lighting.js'), ctx, { filename: 'building-lighting.js' });
  vm.runInContext(source('visual-route-calibrator.js'), ctx, { filename: 'visual-route-calibrator.js' });
  vm.runInContext(source('building-light-calibrator.js'), ctx, { filename: 'building-light-calibrator.js' });
  const run = (expr) => vm.runInContext(expr, ctx);
  run('setVisualRouteCalibrationTestModeEnabled(true)'); // overrides only apply in test mode
  return run;
}

test('no override without an entry; runtime falls through to the class default', () => {
  const run = createContext();
  assert.equal(run(`getBuildingLightCalibrationOverride('anything', 'commercial3')`), null);
  assert.equal(
    run(`resolveBuildingLightProfile({ type: 'commercial', footprintCols: 3 }, 'k')
      === BUILDING_LIGHT_CLASS_DEFAULTS.off`),
    true,
  );
});

test('a family entry drives resolveBuildingLightProfile for every model in that family', () => {
  const run = createContext();
  run(`buildingLightCalibratorTestApi._setEntryForTest('commercial3',
    { class: 'off', x: 0.1, y: 0.1, w: 0.5, h: 0.5, rows: 4, cols: 4, entrance: true, ex: 0.5, ey: 0.9, er: 0.1 })`);
  assert.equal(run(`resolveBuildingLightProfile({ type: 'commercial', footprintCols: 3 }, 'anyKey').rows`), 4);
  assert.equal(run(`resolveBuildingLightProfile({ type: 'commercial', footprintCols: 3 }, 'anyKey').cols`), 4);
});

test('a hero @spriteKey entry beats the family entry', () => {
  const run = createContext();
  run(`buildingLightCalibratorTestApi._setEntryForTest('commercial3',
    { class: 'off', x: 0, y: 0, w: 1, h: 1, rows: 4, cols: 4, entrance: false })`);
  run(`buildingLightCalibratorTestApi._setEntryForTest('@sogo_5x5',
    { class: 'off', x: 0, y: 0, w: 1, h: 1, rows: 12, cols: 9, entrance: true, ex: 0.5, ey: 0.95, er: 0.14, hasSignage: true })`);
  assert.equal(run(`resolveBuildingLightProfile({ type: 'commercial', footprintCols: 3 }, 'sogo_5x5').cols`), 9);
  assert.equal(run(`resolveBuildingLightProfile({ type: 'commercial', footprintCols: 3 }, 'other').cols`), 4);
});

test('the export splits families from hero overrides', () => {
  const run = createContext();
  run(`buildingLightCalibratorTestApi._setEntryForTest('residential2',
    { class: 'res', x: 0.15, y: 0.06, w: 0.7, h: 0.6, rows: 8, cols: 5, entrance: false })`);
  run(`buildingLightCalibratorTestApi._setEntryForTest('@hotel_grand',
    { class: 'off', x: 0.1, y: 0.03, w: 0.8, h: 0.8, rows: 14, cols: 8, entrance: true, ex: 0.5, ey: 0.94, er: 0.12 })`);
  const out = run(`buildingLightCalibratorTestApi.buildBuildingLightCalibrationRecord()`);
  assert.match(out, /Object\.assign\(BUILDING_LIGHT_PROFILES, \{/);
  assert.match(out, /residential2: makeBuildingLightProfile\(\{ class: 'res'/);
  assert.match(out, /BUILDING_LIGHT_HERO_PROFILES = \{/);
  assert.match(out, /'hotel_grand': makeBuildingLightProfile\(\{[^}]*rows: 14/);
});

test('index.html loads building-lighting before its calibrator, both before main.js', () => {
  const html = source('index.html');
  const lit = html.indexOf('src="building-lighting.js"');
  const cal = html.indexOf('src="building-light-calibrator.js"');
  const main = html.indexOf('src="main.js"');
  assert.ok(lit > 0 && cal > lit && main > cal);
});
