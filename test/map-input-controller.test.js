const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'map-input-controller.js'), 'utf8');

function loadModule() {
  const context = { Math, Number, Map, Set, Date };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

const mod = loadModule();

// A controller that records every callback in order; `clock.t` is the fake time in ms.
function makeController(options = {}) {
  const log = [];
  const clock = { t: 0 };
  const names = ['onPanStart', 'onPan', 'onPanEnd', 'onPinchStart', 'onPinch', 'onPinchEnd', 'onTap', 'onCancel'];
  const callbacks = {};
  names.forEach((name) => { callbacks[name] = (payload) => log.push({ name, payload }); });
  const controller = mod.createMapInputController(callbacks, { now: () => clock.t, ...options });
  const names_ = () => log.map((entry) => entry.name);
  return { controller, log, clock, names: names_, count: (name) => log.filter((e) => e.name === name).length };
}

test('a short still touch is a tap and nothing else', () => {
  const { controller, log, clock, names } = makeController();
  controller.pointerDown(1, 100, 100);
  clock.t = 120;
  controller.pointerUp(1, 102, 101);
  assert.deepEqual(names(), ['onTap']);
  assert.deepEqual({ ...log[0].payload }, { x: 102, y: 101 });
  assert.equal(controller.getState(), 'idle');
});

test('holding still past 300ms is not a tap and is not a long-press pan either', () => {
  const { controller, names, clock } = makeController();
  controller.pointerDown(1, 100, 100);
  clock.t = 900;
  controller.pointerMove(1, 103, 100); // inside the tap slop
  controller.pointerUp(1, 103, 100);
  assert.deepEqual(names(), []);
  assert.equal(controller.getState(), 'idle');
});

test('moving past 8px starts a pan that catches up to the finger, then follows it exactly', () => {
  const { controller, log, names } = makeController();
  controller.pointerDown(1, 100, 100);
  controller.pointerMove(1, 105, 100); // still within slop: nothing yet
  assert.deepEqual(names(), []);
  controller.pointerMove(1, 112, 100);
  controller.pointerMove(1, 112, 130);
  controller.pointerUp(1);
  assert.deepEqual(names(), ['onPanStart', 'onPan', 'onPan', 'onPanEnd']);
  const pans = log.filter((e) => e.name === 'onPan').map((e) => e.payload);
  assert.deepEqual([pans[0].dx, pans[0].dy], [12, 0], 'first pan covers the whole displacement so far');
  assert.deepEqual([pans[1].dx, pans[1].dy], [0, 30]);
  const total = pans.reduce((sum, p) => [sum[0] + p.dx, sum[1] + p.dy], [0, 0]);
  assert.deepEqual(total, [12, 30], 'the map moves exactly as far as the finger');
});

test('two fingers pinch: centre and scale follow them, and it is never a tap or a pan (M01)', () => {
  const { controller, log, names } = makeController();
  controller.pointerDown(1, 100, 200);
  controller.pointerDown(2, 200, 200);
  assert.deepEqual(names(), ['onPinchStart']);
  assert.deepEqual({ ...log[0].payload }, { x: 150, y: 200 });
  controller.pointerMove(2, 300, 200); // distance 100 -> 200
  const pinch = log.find((e) => e.name === 'onPinch').payload;
  assert.equal(pinch.scale, 2);
  assert.deepEqual([pinch.x, pinch.y], [200, 200]);
  controller.pointerUp(2);
  controller.pointerUp(1);
  assert.equal(names().includes('onTap'), false);
  assert.equal(names().includes('onPan'), false);
  assert.equal(controller.getState(), 'idle');
});

test('after a pinch, the finger left behind is inert until every finger lifts (M02)', () => {
  const { controller, names, clock } = makeController();
  controller.pointerDown(1, 100, 200);
  controller.pointerDown(2, 200, 200);
  controller.pointerUp(2);
  assert.equal(controller.getState(), 'settling');
  controller.pointerMove(1, 160, 260);       // would be a pan if it were a fresh gesture
  controller.pointerUp(1, 160, 260);         // would be a tap if it were a fresh gesture
  assert.deepEqual(names(), ['onPinchStart', 'onPinchEnd']);
  assert.equal(controller.getState(), 'idle');
  // the next touch works normally
  clock.t = 1000;
  controller.pointerDown(3, 50, 50);
  clock.t = 1050;
  controller.pointerUp(3, 50, 50);
  assert.equal(names().at(-1), 'onTap');
});

test('a second finger during a pan hands over to a pinch without a stray tap', () => {
  const { controller, names } = makeController();
  controller.pointerDown(1, 100, 100);
  controller.pointerMove(1, 140, 100);
  controller.pointerDown(2, 300, 100);
  assert.deepEqual(names(), ['onPanStart', 'onPan', 'onPanEnd', 'onPinchStart']);
});

test('a third finger or its release re-bases the pinch so the view cannot jump', () => {
  const { controller, log, names } = makeController();
  controller.pointerDown(1, 100, 200);
  controller.pointerDown(2, 200, 200);
  controller.pointerMove(2, 260, 200);
  controller.pointerDown(3, 180, 400);
  assert.deepEqual(names().slice(-2), ['onPinchEnd', 'onPinchStart']);
  const rebase = log.at(-1).payload; // new anchor at the new centroid
  assert.deepEqual([rebase.x, rebase.y], [(100 + 260 + 180) / 3, (200 + 200 + 400) / 3]);
  controller.pointerMove(3, 180, 400); // no movement: scale must read 1 from the new base
  assert.equal(log.at(-1).name, 'onPinch');
  assert.ok(Math.abs(log.at(-1).payload.scale - 1) < 1e-9);
  controller.pointerUp(3);
  assert.deepEqual(names().slice(-2), ['onPinchEnd', 'onPinchStart'], 'back to two fingers: re-based again');
  assert.equal(controller.getState(), 'pinch');
});

test('pointercancel drops the gesture, never commits, and waits for other fingers (M03)', () => {
  const { controller, names } = makeController();
  controller.pointerDown(1, 100, 100);
  controller.pointerDown(2, 200, 100);
  controller.pointerCancel(1);
  assert.deepEqual(names(), ['onPinchStart', 'onPinchEnd', 'onCancel']);
  assert.equal(controller.getState(), 'settling');
  controller.pointerUp(2, 200, 100);
  assert.equal(names().includes('onTap'), false);
  assert.equal(controller.getState(), 'idle');
});

test('cancelAll (blur, hidden page, rotation, profile switch) forgets every finger', () => {
  const { controller, names, clock } = makeController();
  controller.pointerDown(1, 100, 100);
  controller.pointerMove(1, 150, 100);
  controller.cancelAll('blur');
  assert.deepEqual(names(), ['onPanStart', 'onPan', 'onPanEnd', 'onCancel']);
  assert.equal(controller.getPointerCount(), 0);
  // late events for the forgotten finger are ignored
  assert.equal(controller.pointerMove(1, 200, 100), false);
  assert.equal(controller.pointerUp(1, 200, 100), false);
  assert.equal(names().includes('onTap'), false);
  // and the next gesture starts clean
  clock.t = 5000;
  controller.pointerDown(2, 10, 10);
  clock.t = 5040;
  controller.pointerUp(2, 10, 10);
  assert.equal(names().at(-1), 'onTap');
});

test('cancelAll with nothing happening is silent', () => {
  const { controller, names } = makeController();
  controller.cancelAll('blur');
  assert.deepEqual(names(), []);
});

test('a panel that takes input cancels the gesture and shields the map until released (M05)', () => {
  const { controller, names, clock } = makeController();
  controller.pointerDown(1, 100, 100);
  controller.pointerMove(1, 160, 100);
  controller.setUiCaptured(true);
  assert.equal(controller.getState(), 'uiCaptured');
  assert.equal(controller.pointerDown(2, 10, 10), false);
  assert.equal(controller.pointerMove(1, 200, 100), false);
  assert.equal(names().at(-1), 'onCancel');
  controller.setUiCaptured(false);
  clock.t = 100;
  controller.pointerDown(3, 10, 10);
  clock.t = 140;
  controller.pointerUp(3, 10, 10);
  assert.equal(names().at(-1), 'onTap');
});

test('events for pointers the controller never saw are ignored', () => {
  const { controller, names } = makeController();
  assert.equal(controller.pointerMove(9, 1, 1), false);
  assert.equal(controller.pointerUp(9, 1, 1), false);
  assert.equal(controller.pointerCancel(9), false);
  assert.deepEqual(names(), []);
});

// ── Camera maths ─────────────────────────────────────────────────────────────

// The reference is Phaser 3.60 BaseCamera.getWorldPoint (matrix = T(o)·S(zoom)·T(-o), camera at 0,0,
// no rotation), written out independently of the implementation under test.
function phaserWorldPoint(camera, x, y) {
  const ox = camera.width * 0.5;
  const oy = camera.height * 0.5;
  const matrix = { a: camera.zoom, d: camera.zoom, e: ox - ox * camera.zoom, f: oy - oy * camera.zoom };
  const sx = x + camera.scrollX * camera.zoom;
  const sy = y + camera.scrollY * camera.zoom;
  return { x: (sx - matrix.e) / matrix.a, y: (sy - matrix.f) / matrix.d };
}

test('mapCameraWorldPoint agrees with the Phaser camera transform', () => {
  const cases = [
    { width: 844, height: 390, zoom: 1, scrollX: 0, scrollY: 0 },
    { width: 844, height: 390, zoom: 2.35, scrollX: -140, scrollY: 380 },
    { width: 1280, height: 800, zoom: 0.4, scrollX: 2200, scrollY: -50 },
    { width: 390, height: 844, zoom: 3, scrollX: 15, scrollY: 12 },
  ];
  cases.forEach((camera) => [[0, 0], [100, 50], [camera.width, camera.height], [123.4, 321.5]].forEach(([x, y]) => {
    const got = mod.mapCameraWorldPoint(camera, x, y);
    const want = phaserWorldPoint(camera, x, y);
    assert.ok(Math.abs(got.x - want.x) < 1e-9 && Math.abs(got.y - want.y) < 1e-9, JSON.stringify({ camera, x, y, got, want }));
  }));
});

test('a pinch keeps the world point under the fingers while the zoom changes (anchor error 0px)', () => {
  const camera = { width: 844, height: 390, zoom: 1.3, scrollX: 220, scrollY: -90 };
  const start = { x: 410, y: 150 };
  const anchor = mod.mapCameraWorldPoint(camera, start.x, start.y);
  [0.4, 0.55, 1, 1.7, 3].forEach((zoom) => {
    // fingers also drift while zooming: pan and zoom at once
    const fingers = { x: start.x + (zoom - 1) * 25, y: start.y - (zoom - 1) * 10 };
    const scroll = mod.mapCameraScrollForAnchor(camera, zoom, fingers.x, fingers.y, anchor.x, anchor.y);
    const after = { ...camera, zoom, scrollX: scroll.x, scrollY: scroll.y };
    const seen = phaserWorldPoint(after, fingers.x, fingers.y);
    assert.ok(Math.hypot(seen.x - anchor.x, seen.y - anchor.y) * zoom < 1e-6, `zoom ${zoom}`);
  });
});

test('the old scroll + screen/zoom rule drifts by origin * (1/z0 - 1/z1); the Phaser rule does not', () => {
  // Documents why the pinch uses the camera-origin formula rather than setMapZoom's shortcut.
  const camera = { width: 1280, height: 800, zoom: 1, scrollX: 0, scrollY: 0 };
  const anchorX = 300;
  const world = phaserWorldPoint(camera, anchorX, 200);
  const nextZoom = 1.1;
  const oldScrollX = (camera.scrollX + anchorX / camera.zoom) - anchorX / nextZoom;
  const after = { ...camera, zoom: nextZoom, scrollX: oldScrollX };
  const driftPx = (phaserWorldPoint(after, anchorX, 200).x - world.x) * nextZoom;
  assert.ok(Math.abs(driftPx) > 50, `expected visible drift, got ${driftPx}`);
  const fixed = mod.mapCameraScrollForAnchor(camera, nextZoom, anchorX, 200, world.x, world.y);
  const fixedAfter = { ...camera, zoom: nextZoom, scrollX: fixed.x, scrollY: fixed.y };
  assert.ok(Math.abs(phaserWorldPoint(fixedAfter, anchorX, 200).x - world.x) < 1e-9);
});

test('metrics: centroid and spread, and two fingers give their distance', () => {
  const two = mod.mapTouchMetrics([{ x: 0, y: 0 }, { x: 30, y: 40 }]);
  assert.deepEqual([two.x, two.y, two.distance], [15, 20, 50]);
  const three = mod.mapTouchMetrics([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 3, y: 9 }]);
  assert.equal(three.x, 3);
  assert.equal(three.y, 3);
});

// ── Wiring guards (source level; the real behaviour is checked by scripts/smoke-touch.js) ─────

test('the global pointerup ignores a lifting finger in the touch profile, and pointercancel only cancels', () => {
  const toolMenu = fs.readFileSync(path.join(ROOT, 'tool-menu.js'), 'utf8');
  assert.match(toolMenu, /window\.addEventListener\('pointercancel', cancelPaintStroke\)/);
  const pointerUp = toolMenu.slice(toolMenu.indexOf("window.addEventListener('pointerup'"));
  assert.match(pointerUp.slice(0, 600), /if \(typeof isTouchUiProfile === 'function' && isTouchUiProfile\(\)\) return;/);
  const cancel = toolMenu.slice(toolMenu.indexOf('function cancelPaintStroke()'), toolMenu.indexOf('function clearHousePressTimer()'));
  assert.ok(cancel.length > 0);
  assert.doesNotMatch(cancel, /fillZoneRect|commitRoadDrag|commitMetroTrackDrag|commitTramTrackDrag|placeUnderseaTunnel|commitTyphoonShelterDrag/,
    'cancelling a stroke must never commit it');
  assert.match(cancel, /isPainting\s*=\s*false/);
});

test('the touch controller is loaded before main.js and installed with the scene', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scripts.indexOf('ui-profile.js') >= 0 && scripts.indexOf('ui-profile.js') < scripts.indexOf('platform-config.js'),
    'the profile is resolved in <head>, before any UI script reads it');
  assert.ok(scripts.indexOf('map-input-controller.js') >= 0 && scripts.indexOf('map-input-controller.js') < scripts.indexOf('main.js'));
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  assert.match(main, /installMapTouchInput\(this\)/);
  assert.match(main, /function onMapViewChanged\(scene\)/);
  assert.match(main, /setMapZoom[\s\S]{0,900}onMapViewChanged\(scene\);\s+return nextZoom;/, 'wheel zoom still runs the shared view-changed path');
});
