const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { measureBuildingScale, summarizeBuildingScaleSurvey, BUILDING_SCALE_TRUE_UP_RATIO } = require('../building-scale-survey.js');
const { buildBuildingScaleReport, formatBuildingScaleReport, listBuildingModelPaths } = require('../scripts/building-scale-report.js');

const ROOT = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} versus ${expected}`);

test('a span drawn at the people\'s 5 px a metre implies a ~12 m tile; half that size, ~24 m', () => {
  near(BUILDING_SCALE_TRUE_UP_RATIO, 1.2247, 1e-4, 'cos 30 / cos 45');
  const same = measureBuildingScale(300, 3, 0.05, 100);
  near(same.screenPx, 15, 1e-9, '300 source px at 0.05');
  near(same.upPxPerM, 5, 1e-9, 'px a metre');
  near(same.vsPeople, 1, 1e-9, 'as the people');
  near(same.tileM, 12.247, 1e-3, 'tile metres');
  near(measureBuildingScale(150, 3, 0.05, 100).tileM, 24.495, 1e-3, 'a building drawn half as big');
  assert.equal(measureBuildingScale(0, 3, 0.05), null);
  assert.equal(measureBuildingScale(100, 0, 0.05), null);
});

test('the summary sorts by tile metres and buckets the spread', () => {
  const summary = summarizeBuildingScaleSurvey({
    'Models/a.png': { tileM: 20 },
    'Models/b.png': { tileM: 12 },
    'Models/c.png': { tileM: 40 },
    'Models/d.png': null,
  });
  assert.deepEqual(summary.rows.map((row) => row.path), ['Models/b.png', 'Models/a.png', 'Models/c.png']);
  assert.equal(summary.median, 20);
  assert.deepEqual(summary.buckets.map((b) => b.count), [0, 1, 1, 0, 1]);
});

test('the page loads the survey after the ground calibrator, and the test menu opens it', () => {
  const html = source('index.html');
  const groundAt = html.indexOf('building-ground-calibrator.js');
  const surveyAt = html.indexOf('building-scale-survey.js');
  assert.ok(groundAt > 0 && surveyAt > groundAt && html.indexOf('<script src="main.js">') > surveyAt);
  const menu = source('visual-route-calibrator.js');
  assert.match(menu, /vrp-buildingscale-btn">建築比例量度</);
  assert.match(menu, /toggleBuildingScaleSurvey\(scene\)/);
  assert.match(menu, /teardownBuildingScaleSurvey\(\)/);
  const shipped = JSON.parse(source('data/building-scale-survey.json'));
  assert.equal(shipped.kind, 'building-scale-survey');
  assert.equal(typeof shipped.measurements, 'object');
});

test('the tool picks a building, records a dragged span and re-measures with the storey count', () => {
  const store = new Map();
  const context = vm.createContext({
    console,
    localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) },
    isVisualRouteCalibrationTestModeEnabled: () => true,
    copyVisualRouteCalibrationText: () => Promise.resolve(),
  });
  vm.runInContext(source('constants.js'), context, { filename: 'constants.js' });
  vm.runInContext(source('street-prop-calibrator.js'), context, { filename: 'street-prop-calibrator.js' });
  vm.runInContext(source('building-scale-survey.js'), context, { filename: 'building-scale-survey.js' });
  const modelPath = 'Models/residential/test.png';
  const building = {
    x: 500, y: 400, displayOriginX: 0, displayOriginY: 0, scaleX: 0.05, scaleY: 0.05, width: 1024, height: 1024,
    depth: 3, visible: true, active: true, scene: {}, footprintCols: 1, footprintRows: 1,
    modelLogicalPath: modelPath, logicalSpriteKey: 'res_1', texture: { key: 'res_1', getSourceImage: () => ({ width: 1024, height: 1024 }) },
  };
  const handlers = {};
  const graphics = new Proxy({}, { get: (target, name) => (name === 'setDepth' ? () => graphics : () => {}) });
  const scene = {
    cameras: { main: { zoom: 1 } },
    add: { graphics: () => graphics },
    input: { manager: { defaultCursor: '' }, on: (event, fn) => { handlers[event] = fn; }, off: (event) => { delete handlers[event]; }, setDefaultCursor() {} },
    buildingSprites: new Map([['1,1', building]]),
  };
  const survey = vm.runInContext('buildingScaleSurvey', context);
  const entryOf = () => vm.runInContext(`getBuildingScaleSurveyEntry('${modelPath}')`, context);
  const capturing = () => vm.runInContext('isAnyStreetPropCalibratorCapturing()', context);
  assert.equal(context.toggleBuildingScaleSurvey(scene), true);
  assert.equal(capturing(), true, 'the game tools stand down');

  handlers.pointerdown({ button: 0, worldX: 520, worldY: 440 }); // pick
  assert.equal(entryOf(), null, 'a pick alone records nothing');
  // drag up 15 world px from source (400, 800): 300 source px, one 3 m storey
  handlers.pointerdown({ button: 0, worldX: 520, worldY: 440 });
  handlers.pointermove({ isDown: true, worldX: 523, worldY: 432 });
  handlers.pointermove({ isDown: true, worldX: 524, worldY: 425 });
  handlers.pointerup({ button: 0 });
  assert.equal(entryOf(), null, 'a drawn span waits for confirmation');
  assert.equal(store.get('building-scale-survey:v1'), undefined);
  const entry = survey.confirm();
  assert.deepEqual(Array.from(entry.a), [400, 800]);
  assert.deepEqual(Array.from(entry.b), [400, 500], 'the span stays vertical under its foot');
  assert.equal(entry.storeys, 1);
  near(entry.upPxPerM, 5, 1e-9, 'px a metre');
  near(entry.tileM, 12.2, 1e-9, 'tile metres');
  assert.equal(entryOf().tileM, entry.tileM, 'recorded on confirmation');
  assert.ok(store.get('building-scale-survey:v1').includes(modelPath), 'kept across reloads');

  // a new reference re-measures the span but records nothing until confirmed
  survey.setStoreys(2);
  near(entryOf().tileM, 12.2, 1e-9, 'the record is unchanged before confirmation');
  near(survey.confirm().vsPeople, 0.5, 1e-9, 'the same span as two storeys: half the people\'s scale');
  near(entryOf().tileM, 24.5, 1e-9, 'tile metres follow');

  survey.setActiveEnd('b');
  survey.nudge(0, -60);
  assert.deepEqual(Array.from(entryOf().b), [400, 500], 'a nudge is a preview');
  assert.equal(survey.cancel(), true, 'Esc drops it');
  assert.deepEqual(Array.from(entryOf().b), [400, 500]);
  survey.nudge(0, -60);
  survey.confirm();
  assert.deepEqual(Array.from(entryOf().b), [400, 440], 'arrow keys move the chosen end once confirmed');

  // two clicks (foot, then top) draw a span as well
  survey.removeModel();
  handlers.pointerdown({ button: 0, worldX: 520, worldY: 440 });
  handlers.pointerup({ button: 0 });
  assert.equal(survey.confirm(), null, 'the foot alone cannot be recorded');
  handlers.pointerdown({ button: 0, worldX: 530, worldY: 410 });
  handlers.pointerup({ button: 0 });
  const clicked = survey.confirm();
  assert.deepEqual(Array.from(clicked.b), [400, 200], 'the top sits over the foot');
  near(clicked.tileM, 12.2, 1e-9, 'two storeys over 30 world px');

  const record = survey.buildRecord();
  assert.equal(record.kind, 'building-scale-survey');
  assert.ok(record.measurements[modelPath]);

  survey.removeModel();
  assert.equal(entryOf(), null);
  context.toggleBuildingScaleSurvey(scene);
  assert.equal(capturing(), false);
  assert.deepEqual(Object.keys(handlers), [], 'input handlers removed on close');
});

test('the report lists measured models by tile size and the building models still to measure', () => {
  const paths = listBuildingModelPaths();
  assert.ok(paths.length > 100, 'every building model under Models/');
  assert.ok(paths.every((p) => !p.includes('__')), 'night and other variants left out');
  const report = buildBuildingScaleReport({ measurements: { [paths[0]]: { tileM: 18.4, vsPeople: 0.66, footprint: [1, 1] } } }, paths);
  assert.equal(report.count, 1);
  assert.equal(report.unmeasured.length, paths.length - 1);
  const text = formatBuildingScaleReport(report);
  assert.match(text, /已量 1 \/ \d+ 個模型/);
  assert.match(text, /18\.4/);
});
