const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { detectBuildingGroundCorners, fitBuildingToGroundCorners } = require('../building-ground-fit.js');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');
const { mainSource } = require('./main-source');

function sliceFunction(name) {
  const start = mainSource.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `${name} must remain extractable from main.js`);
  const end = mainSource.indexOf('\n}\n', start) + 3;
  return mainSource.slice(start, end);
}

// An alpha image of a lot: the quad left-front-right-back filled, plus whatever else is drawn.
function drawLot(width, height, { left, front, right }, extras = []) {
  const alpha = new Uint8Array(width * height);
  const back = [left[0] + right[0] - front[0], left[1] + right[1] - front[1]];
  const quad = [front, left, back, right];
  const inside = (x, y) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = quad[i];
      const [bx, by] = quad[(i + 1) % 4];
      const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (cross === 0) continue;
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
    return true;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (inside(x + 0.5, y + 0.5)) alpha[y * width + x] = 255;
    }
  }
  extras.forEach(([x0, y0, x1, y1]) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) alpha[y * width + x] = 255;
  });
  return alpha;
}

const near = (actual, expected, tolerance, message) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
};

test('a sign sticking out past the lot does not widen the detected ground', () => {
  const lot = { left: [50, 200], front: [250, 300], right: [450, 200] };
  // A tall block on the lot and a shop sign hanging off its left side, above the lot's edge.
  const alpha = drawLot(500, 320, lot, [[180, 40, 320, 250], [10, 90, 60, 170]]);
  const corners = detectBuildingGroundCorners(alpha, 500, 320);
  assert.ok(corners.confident);
  near(corners.left[0], 50, 3, 'left x');
  near(corners.right[0], 450, 3, 'right x');
  near(corners.front[0], 250, 2, 'front x');
  near(corners.front[1], 300, 2, 'front y');
  near(corners.visibleWidth, 440, 1, 'the whole picture is wider than the lot');

  const fit = fitBuildingToGroundCorners(corners, 100);
  near(fit.scale, 100 / 400, 0.003, 'the lot, not the picture, spans the footprint');
  near(fit.originX, 250, 2, 'origin on the lot centre line');
});

test('a clipped tip or chamfered corner puts the front corner where the two edges meet', () => {
  const lot = { left: [50, 200], front: [250, 300], right: [450, 200] };
  // Canvas ends 10px above the tip: the bottom row is flat.
  const alpha = drawLot(500, 290, lot);
  const corners = detectBuildingGroundCorners(alpha, 500, 290);
  assert.ok(corners.confident);
  near(corners.front[0], 250, 2, 'front x');
  near(corners.front[1], 300, 2.5, 'front y lies below the canvas');
});

test('art whose front corner is off-centre is centred between its side corners', () => {
  const lot = { left: [50, 230], front: [200, 305], right: [450, 205] };
  const alpha = drawLot(500, 320, lot);
  const corners = detectBuildingGroundCorners(alpha, 500, 320);
  assert.ok(corners.confident);
  near(corners.front[0], 200, 3, 'the real front corner is found');
  const fit = fitBuildingToGroundCorners(corners, 100);
  near(fit.originX, 250, 3, 'but the anchor sits midway between left and right');
  near(fit.originY, 305, 2.5, 'at the front corner\'s height');
});

test('nothing to detect, nothing to fit', () => {
  assert.equal(detectBuildingGroundCorners(new Uint8Array(100), 10, 10), null);
  assert.equal(fitBuildingToGroundCorners(null, 100), null);
  assert.equal(fitBuildingToGroundCorners({ left: [10, 0], front: [10, 5], right: [10, 0] }, 100), null);
});

test('every shipped ground-corner entry names a real model and a lot running left to right', () => {
  const context = vm.createContext({});
  vm.runInContext(source('constants.js'), context, { filename: 'constants.js' });
  const table = vm.runInContext('BUILDING_GROUND_CORNERS', context);
  assert.ok(Object.keys(table).length > 0);
  Object.entries(table).forEach(([logicalPath, corners]) => {
    assert.ok(fs.existsSync(path.join(ROOT, logicalPath)), `${logicalPath} exists`);
    assert.ok(corners.left[0] < corners.front[0] && corners.front[0] < corners.right[0], `${logicalPath} corners run left to right`);
    assert.ok(corners.front[1] > corners.left[1] && corners.front[1] > corners.right[1], `${logicalPath} front is the lowest corner`);
  });
});

function createFitContext({ manifest = {}, corners = {}, calibrated } = {}) {
  const context = vm.createContext({
    TILE_WIDTH: 100,
    modelAssetManifest: { entries: manifest },
    BUILDING_GROUND_CORNERS: corners,
    fitBuildingToGroundCorners,
    getBuildingModelLogicalPath: (key) => `Models/test/${key}.png`,
    getSpriteBuildingTextureKey: (key) => `tex_${key}`,
  });
  if (calibrated) context.getBuildingGroundCalibrationCorners = calibrated;
  ['normalizeModelLogicalPath', 'getModelTexturePixelMapping', 'getBuildingGroundCorners', 'applyBuildingGroundFit', 'getFootprintScreenWidth']
    .forEach((name) => vm.runInContext(sliceFunction(name), context, { filename: `main.js#${name}` }));
  return context;
}

function sceneWithTexture(width, height) {
  return { textures: { exists: () => true, get: () => ({ getSourceImage: () => ({ width, height }) }) } };
}

test('a listed model is sized by its ground span and anchored on its lot, in the loaded texture', () => {
  const corners = { 'Models/test/a.png': { left: [100, 700], front: [500, 900], right: [900, 700] } };
  const context = createFitContext({ corners });
  const options = { footprintCols: 2, footprintRows: 2, originX: 0.1, originY: 0.2, scale: 0.3, scaleX: 0.3, scaleY: 0.33, offsetY: 4 };
  const fitted = context.applyBuildingGroundFit(sceneWithTexture(1000, 1000), 'a', options);
  near(fitted.scale, 200 / 800, 1e-9, '2x2 footprint is 200px wide');
  near(fitted.scaleY / fitted.scaleX, 1.1, 1e-9, 'a model\'s own vertical stretch is kept');
  near(fitted.originX, 0.5, 1e-9, 'origin x');
  near(fitted.originY, 0.9, 1e-9, 'origin y');
  assert.equal(fitted.offsetY, 4);

  // The staged copy: halved, trimmed 40/100 and padded 12/6.
  const staged = createFitContext({
    corners,
    manifest: { 'Models/test/a.png': { sourceWidth: 1000, sourceHeight: 1000, maxDimension: 500, trim: { left: 40, top: 100 }, padding: { left: 12, top: 6 }, outputWidth: 512, outputHeight: 512 } },
  }).applyBuildingGroundFit(sceneWithTexture(512, 512), 'a', options);
  near(staged.scale, 200 / 400, 1e-9, 'scale follows the resize');
  near(staged.originX, (250 - 40 + 12) / 512, 1e-9, 'origin x through trim and padding');
  near(staged.originY, (450 - 100 + 6) / 512, 1e-9, 'origin y through trim and padding');
});

test('unlisted, non-square or calibrated-back-to-default models keep the default fit', () => {
  const options = { footprintCols: 2, footprintRows: 2, originX: 0.1, scale: 0.3 };
  const scene = sceneWithTexture(1000, 1000);
  assert.equal(createFitContext().applyBuildingGroundFit(scene, 'a', options), options);
  const corners = { 'Models/test/a.png': { left: [100, 700], front: [500, 900], right: [900, 700] } };
  assert.equal(createFitContext({ corners }).applyBuildingGroundFit(scene, 'a', { ...options, footprintRows: 3 }).originX, 0.1);
  assert.equal(createFitContext({ corners, calibrated: () => null }).applyBuildingGroundFit(scene, 'a', options), options);
  const moved = createFitContext({ corners, calibrated: () => ({ left: [0, 700], front: [500, 900], right: [1000, 700] }) })
    .applyBuildingGroundFit(scene, 'a', options);
  near(moved.scale, 0.2, 1e-9, 'a calibrator value wins over the shipped one');
});

test('every building placement goes through the ground fit, and the page loads it before main.js', () => {
  assert.match(mainSource, /options = applyBuildingGroundFit\(scene, key, normalizeSpriteBuildingOptions\(key, options\)\);/);
  assert.match(mainSource, /building\.modelLogicalPath = getBuildingModelLogicalPath\(key\);/);
  const html = source('index.html');
  const fitAt = html.indexOf('building-ground-fit.js');
  const calibratorAt = html.indexOf('building-ground-calibrator.js');
  const mainAt = html.indexOf('<script src="main.js">');
  assert.ok(fitAt > 0 && calibratorAt > fitAt && mainAt > calibratorAt);
  assert.ok(html.indexOf('street-prop-calibrator.js') < calibratorAt, 'the calibrator registers with the street-prop capture list');
});

function createCalibratorContext() {
  const refits = [];
  const store = new Map();
  const context = vm.createContext({
    console,
    localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) },
    isVisualRouteCalibrationTestModeEnabled: () => true,
    refitBuildingSprites: (scene, logicalPath) => { refits.push(logicalPath); return 1; },
    copyVisualRouteCalibrationText: () => Promise.resolve(),
  });
  vm.runInContext(source('constants.js'), context, { filename: 'constants.js' });
  vm.runInContext(source('building-ground-fit.js'), context, { filename: 'building-ground-fit.js' });
  vm.runInContext(source('street-prop-calibrator.js'), context, { filename: 'street-prop-calibrator.js' });
  vm.runInContext(source('building-ground-calibrator.js'), context, { filename: 'building-ground-calibrator.js' });
  return { context, refits, store };
}

test('the calibrator owns the mouse, picks a building and drags its ground corners', () => {
  const { context, refits, store } = createCalibratorContext();
  const shippedPath = 'Models/commercial/1x1/commercialBuilding1-03-L.png';
  const shipped = vm.runInContext(`BUILDING_GROUND_CORNERS['${shippedPath}']`, context);
  const building = {
    x: 500, y: 400, displayOriginX: 0, displayOriginY: 0, scaleX: 0.1, scaleY: 0.1, width: 1024, height: 1024,
    depth: 3, visible: true, active: true, scene: {}, footprintCols: 1, footprintRows: 1,
    modelLogicalPath: shippedPath, logicalSpriteKey: 'commercial_1', texture: { key: 'commercial_1', getSourceImage: () => ({ width: 1024, height: 1024 }) },
  };
  const handlers = {};
  const graphics = new Proxy({}, { get: (target, name) => (name === 'setDepth' ? () => graphics : () => {}) });
  const scene = {
    cameras: { main: { zoom: 1 } },
    add: { graphics: () => graphics },
    input: { manager: { defaultCursor: '' }, on: (event, fn) => { handlers[event] = fn; }, off: (event) => { delete handlers[event]; }, setDefaultCursor() {} },
    buildingSprites: new Map([['1,1', building]]),
  };
  const calibrator = vm.runInContext('buildingGroundCalibrator', context);
  const capturing = () => vm.runInContext('isAnyStreetPropCalibratorCapturing()', context);
  assert.equal(capturing(), false);
  assert.equal(context.toggleBuildingGroundCalibrator(scene), true);
  assert.equal(capturing(), true, 'the game tools stand down');

  // Click on the building (no alpha mask in the test: its drawn bounds count).
  handlers.pointerdown({ button: 0, worldX: 550, worldY: 450 });
  // Grab the front handle and pull it 3 world px right = 30 source px at scale 0.1.
  const frontWorld = { x: 500 + shipped.front[0] * 0.1, y: 400 + shipped.front[1] * 0.1 };
  handlers.pointerdown({ button: 0, worldX: frontWorld.x + 1, worldY: frontWorld.y });
  handlers.pointermove({ isDown: true, worldX: frontWorld.x + 3, worldY: frontWorld.y });
  handlers.pointerup({ button: 0 });
  const edited = context.getBuildingGroundCalibrationCorners(shippedPath);
  near(edited.front[0], shipped.front[0] + 30, 0.11, 'front moved by the drag');
  assert.deepEqual(edited.left, shipped.left);
  assert.deepEqual(refits, [shippedPath], 'the model re-fits once, on release');
  assert.ok(store.get('building-ground-calibration:v1').includes(shippedPath), 'kept across reloads');

  calibrator.setActiveCorner('left');
  calibrator.nudge(-5, 0);
  near(context.getBuildingGroundCalibrationCorners(shippedPath).left[0], shipped.left[0] - 5, 1e-9, 'arrow keys move the chosen corner');

  const record = calibrator.buildRecord();
  near(record.BUILDING_GROUND_CORNERS[shippedPath].left[0], shipped.left[0] - 5, 1e-9, 'the copied table carries the edit');
  assert.ok(Object.keys(record.BUILDING_GROUND_CORNERS).length >= 30, 'and every shipped entry');

  calibrator.useDefaultFit();
  assert.equal(context.getBuildingGroundCalibrationCorners(shippedPath), null);
  assert.equal(calibrator.buildRecord().BUILDING_GROUND_CORNERS[shippedPath], undefined, 'default fit drops it from the table');
  calibrator.revertModel();
  assert.equal(context.getBuildingGroundCalibrationCorners(shippedPath), undefined, 'revert returns to the shipped corners');

  context.toggleBuildingGroundCalibrator(scene);
  assert.equal(capturing(), false);
  assert.deepEqual(Object.keys(handlers), [], 'input handlers removed on close');
});
