const assert = require('node:assert/strict');
const test = require('node:test');
const { createStreetPropCalibrator } = require('../street-prop-calibrator.js');

function calibratorWithGroups() {
  let refreshed = 0;
  const calibrator = createStreetPropCalibrator({
    id: 'test-props',
    title: 'test',
    facings: ['bin_sw', 'bin_se', 'postbox_sw'],
    facingOf: (sprite) => sprite.facing,
    sprites: () => new Map(),
    shippedOffsets: () => ({}),
    shippedScale: (group) => ({ bin: 1, postbox: 2 })[group],
    scaleGroupOf: (facing) => facing.split('_')[0],
    refresh: () => { refreshed++; },
    scaleStep: 0.05,
    minScale: 0.2,
    maxScale: 5,
  });
  const drag = (facing) => {
    const listeners = {};
    const sprite = { x: 0, y: 0, facing, setInteractive() {}, disableInteractive() {}, on(name, fn) { listeners[name] = fn; }, off() {} };
    calibrator.makeSpriteDraggable({ input: { setDraggable() {} } }, sprite);
    listeners.dragstart();
  };
  return { calibrator, drag, refreshes: () => refreshed };
}

test('a grouped calibrator sizes each group on its own, through the last-dragged prop', () => {
  const { calibrator, drag } = calibratorWithGroups();
  calibrator.adjustScale(0.5);
  assert.equal(calibrator.getScale('bin'), null, 'nothing selected yet: no change');

  drag('bin_se');
  calibrator.adjustScale(0.5);
  assert.equal(calibrator.getScale('bin'), 1.5);
  assert.equal(calibrator.getScale('postbox'), null, 'other groups untouched');

  drag('postbox_sw');
  calibrator.adjustScale(-10);
  assert.equal(calibrator.getScale('postbox'), 0.2, 'clamped to minScale');
  assert.equal(calibrator.getScale('bin'), 1.5);

  const record = calibrator.buildRecord();
  assert.deepEqual(record.scales, { bin: 1.5, postbox: 0.2 });
  assert.equal(record.scale, undefined);

  calibrator.reset();
  assert.equal(calibrator.getScale('bin'), null);
  assert.deepEqual(calibrator.buildRecord().scales, { bin: 1, postbox: 2 }, 'reset reports the shipped sizes');
});

test('a calibrator without groups keeps its single size', () => {
  const calibrator = createStreetPropCalibrator({
    id: 'single', title: 'single', facings: ['sw'], facingOf: () => 'sw', sprites: () => new Map(),
    shippedOffsets: () => ({}), shippedScale: () => 0.1, refresh: () => {},
  });
  calibrator.adjustScale(0.002);
  assert.ok(Math.abs(calibrator.getScale() - 0.102) < 1e-9);
  assert.equal(calibrator.buildRecord().scale, 0.102);
});

function fakeSceneWithInput(spriteMap) {
  const handlers = {};
  const cursors = [];
  const graphics = { clear() {}, fillStyle() {}, fillRect() {}, lineStyle() {}, strokeRect() {}, setDepth() { return this; }, destroy() {} };
  return {
    handlers,
    cursors,
    scene: {
      cameras: { main: { zoom: 2, worldView: { x: -1e6, y: -1e6, right: 1e6, bottom: 1e6 } } },
      add: { graphics: () => graphics },
      textures: { get: () => null },
      input: {
        manager: { defaultCursor: 'crosshair' },
        on(event, fn) { handlers[event] = fn; },
        off(event, fn) { if (handlers[event] === fn) delete handlers[event]; },
        setDefaultCursor(value) { cursors.push(value); },
      },
      props: spriteMap,
    },
  };
}

test('an open calibrator owns the mouse: a click picks the prop under it, a miss clears the pick', () => {
  global.isVisualRouteCalibrationTestModeEnabled = () => true;
  const { createStreetPropCalibrator: create, isAnyStreetPropCalibratorCapturing } = require('../street-prop-calibrator.js');
  const prop = (x, y, facing, depth) => ({
    x, y, facing, depth, visible: true, active: true, scene: {},
    scaleX: 0.1, scaleY: 0.1, width: 200, height: 200, displayOriginX: 100, displayOriginY: 200, texture: { key: facing },
  });
  const a = prop(100, 100, 'sw', 5);   // drawn over x 90..110, y 80..100
  const b = prop(300, 100, 'se', 5);
  const { scene, handlers, cursors } = fakeSceneWithInput(new Map([['a', a], ['b', b]]));
  let refreshed = 0;
  const calibrator = create({
    id: 'picker-test', title: 'picker', facings: ['sw', 'se'], facingOf: (s) => s.facing,
    sprites: (sc) => sc?.props, shippedOffsets: () => ({}), shippedScale: () => 0.1, refresh: () => { refreshed++; },
  });
  try {
    assert.equal(isAnyStreetPropCalibratorCapturing(), false);
    assert.equal(calibrator.toggle(scene), true);
    assert.equal(isAnyStreetPropCalibratorCapturing(), true, 'the game tools stand down while it is open');
    assert.deepEqual(cursors, ['pointer'], 'hand cursor');

    handlers.pointerdown({ button: 0, worldX: 100, worldY: 90 });
    handlers.pointermove({ isDown: true, worldX: 103, worldY: 88 });
    handlers.pointerup({ button: 0 });
    const offset = calibrator.getOffset('sw');
    assert.ok(Math.abs(offset.dx - 3) < 1e-9 && Math.abs(offset.dy + 2) < 1e-9, 'dragging the picked prop records its facing\'s nudge');
    assert.equal(calibrator.getOffset('se'), null);
    assert.ok(refreshed > 0);

    handlers.pointerdown({ button: 0, worldX: 5000, worldY: 5000 });
    handlers.pointermove({ isDown: true, worldX: 5010, worldY: 5000 });
    assert.equal(calibrator.getOffset('se'), null, 'a click on empty ground picks nothing and drags nothing');
    assert.equal(calibrator.pickSpriteAt(300, 95), b);

    calibrator.toggle(scene);
    assert.equal(isAnyStreetPropCalibratorCapturing(), false);
    assert.deepEqual(Object.keys(handlers), [], 'its input handlers are removed on close');
    assert.deepEqual(cursors, ['pointer', 'crosshair'], 'the previous cursor comes back');
  } finally {
    delete global.isVisualRouteCalibrationTestModeEnabled;
  }
});

test('while a calibrator owns the mouse, right-drag still pans the camera', () => {
  const main = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(main, /this\.input\.on\('pointerdown',[\s\S]{0,200}isVisualRouteCalibrationInputCaptured\(this\) && pointer\.button !== 2\) return;/);
  assert.match(main, /this\.input\.on\('pointermove',[\s\S]{0,200}isVisualRouteCalibrationInputCaptured\(this\) && !this\.isPanning\) return;/);
  const guard = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'visual-route-calibrator.js'), 'utf8');
  assert.match(guard, /isAnyStreetPropCalibratorCapturing\(\)\) return true;/);
});
