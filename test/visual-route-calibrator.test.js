const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const calibrator = require('../visual-route-calibrator.js');

test('hidden test mode requires five rapid icon clicks and one more click disables it', () => {
  calibrator.setVisualRouteCalibrationTestModeEnabled(false);
  assert.equal(calibrator.isVisualRouteCalibrationTestModeEnabled(), false);
  [1000, 1200, 1400, 1600].forEach((timestamp) => {
    assert.equal(calibrator.handleVisualRouteCalibrationUnlockClick(timestamp), false);
  });
  assert.equal(calibrator.isVisualRouteCalibrationTestModeEnabled(), false);
  assert.equal(calibrator.handleVisualRouteCalibrationUnlockClick(1800), true);
  assert.equal(calibrator.isVisualRouteCalibrationTestModeEnabled(), true);
  assert.equal(calibrator.handleVisualRouteCalibrationUnlockClick(2000), false);
  assert.equal(calibrator.isVisualRouteCalibrationTestModeEnabled(), false);
});

test('slow icon clicks do not unlock test mode', () => {
  calibrator.setVisualRouteCalibrationTestModeEnabled(false);
  [0, 3000, 6000, 9000, 12000].forEach((timestamp) => {
    assert.equal(calibrator.handleVisualRouteCalibrationUnlockClick(timestamp), false);
  });
  assert.equal(calibrator.isVisualRouteCalibrationTestModeEnabled(), false);
});

test('the performance panel has a close button that disables test mode without retriggering the icon gesture', () => {
  const source = fs.readFileSync(path.join(ROOT, 'visual-route-calibrator.js'), 'utf8');
  assert.match(source, /class="vrp-close-btn"[^>]*>✕<\/button>/);
  const closeHandlerStart = source.indexOf("querySelector('.vrp-close-btn')");
  const closeHandler = source.slice(closeHandlerStart, source.indexOf("querySelector('.vrp-copy-btn')", closeHandlerStart));
  assert.match(closeHandler, /setVisualRouteCalibrationTestModeEnabled\(false\);/);
});

test('calibration record captures absolute, route-relative and adapter measurements', () => {
  const target = {
    id: 'ship-7',
    kind: 'vessel-berth',
    label: 'Vessel berth',
    slot: 'ur',
    visualVariant: 'ur',
    logicalSide: 'n',
    rotation: 2,
    sprite: { x: 140.25, y: 84.5 },
    referenceSprite: { x: 100, y: 60 },
    baselineWorld: { x: 135.25, y: 86.5 },
    originalLogical: { row: 8, col: 12 },
    worldToLogical: (x, y) => ({ row: y / 10, col: x / 10 }),
    measure: (logical) => ({ normalFromQuayTiles: logical.row - 4, ignored: { nested: true } }),
  };
  const record = calibrator.buildVisualRouteCalibrationRecord(target, '2026-08-01T00:00:00.000Z');
  assert.deepEqual(record, {
    schemaVersion: 1,
    targetKind: 'vessel-berth',
    slot: 'ur',
    subjectId: 'ship-7',
    label: 'Vessel berth',
    visualVariant: 'ur',
    logicalSide: 'n',
    mapRotation: 2,
    worldX: 140.25,
    worldY: 84.5,
    referenceWorldX: 100,
    referenceWorldY: 60,
    baselineWorldX: 135.25,
    baselineWorldY: 86.5,
    routeOffsetX: 5,
    routeOffsetY: -2,
    renderOffsetX: 40.25,
    renderOffsetY: 24.5,
    logicalRow: 8.45,
    logicalCol: 14.025,
    originalLogicalRow: 8,
    originalLogicalCol: 12,
    normalFromQuayTiles: 4.45,
    recordedAt: '2026-08-01T00:00:00.000Z',
  });
});

test('calibration records collect independently by visual slot, in-memory for the session only', () => {
  // Deliberately no localStorage anywhere in this path (see
  // saveVisualRouteCalibrationCurrent) - a record only ever exists in
  // state.records (this session) until it's baked into the relevant
  // *-route-metadata.js file, never left living solely in browser storage.
  const records = {
    'vessel-berth:ll': { slot: 'll', worldX: 10 },
    'vessel-berth:ur': { slot: 'ur', worldX: 20 },
    'aircraft-taxi:north': { slot: 'north', worldX: 30 },
  };
  assert.deepEqual(
    calibrator.getVisualRouteCalibrationCollection(
      { records },
      { kind: 'vessel-berth', slots: ['ll', 'lr', 'ul', 'ur'] },
    ),
    {
      schemaVersion: 1,
      targetKind: 'vessel-berth',
      records: {
        ll: records['vessel-berth:ll'],
        ur: records['vessel-berth:ur'],
      },
    },
  );
});

test('paused target becomes draggable, records drag end and releases ownership on resume', () => {
  const handlers = new Map();
  const dragCalls = [];
  const moves = [];
  const sprite = {
    x: 20,
    y: 30,
    depth: 123,
    input: null,
    setInteractive() { this.input = {}; return this; },
    disableInteractive() { this.input = null; return this; },
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setDepth(value) { this.depth = value; return this; },
    on(name, handler) { handlers.set(name, handler); return this; },
    off(name, handler) { if (handlers.get(name) === handler) handlers.delete(name); return this; },
  };
  const scene = {
    input: { setDraggable: (target, enabled) => dragCalls.push([target, enabled]) },
  };
  const target = {
    id: 'ship-1',
    kind: 'vessel-berth',
    slot: 'll',
    slots: ['ll', 'lr', 'ul', 'ur'],
    sprite,
    eligible: true,
    paused: true,
    baselineWorld: { x: 20, y: 30 },
    worldToLogical: (x, y) => ({ row: y, col: x }),
    onMove: (x, y, logical) => moves.push({ x, y, logical }),
  };

  calibrator.setVisualRouteCalibrationTestModeEnabled(true);
  assert.equal(calibrator.syncVisualRouteCalibrationTarget(scene, target), true);
  assert.equal(calibrator.isVisualRouteCalibrationInputCaptured(scene), true);
  assert.equal(sprite.depth, calibrator.VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH);
  assert.equal(dragCalls.at(-1)[1], true);
  let propagationStopped = false;
  handlers.get('pointerdown')(null, 0, 0, { stopPropagation: () => { propagationStopped = true; } });
  assert.equal(propagationStopped, true);
  handlers.get('drag')(null, 26, 37);
  assert.deepEqual([sprite.x, sprite.y], [26, 37]);
  assert.deepEqual(moves.at(-1), { x: 26, y: 37, logical: { row: 37, col: 26 } });
  handlers.get('dragend')();
  const state = calibrator.getVisualRouteCalibrationState(scene);
  assert.equal(state.records['vessel-berth:ll'].routeOffsetX, 6);
  assert.equal(state.records['vessel-berth:ll'].routeOffsetY, 7);

  assert.equal(calibrator.syncVisualRouteCalibrationTarget(scene, { ...target, paused: false }), false);
  assert.equal(dragCalls.at(-1)[1], false);
  assert.equal(calibrator.isVisualRouteCalibrationInputCaptured(scene), false);
  assert.equal(sprite.depth, 123);
  assert.equal(sprite.input, null);
  assert.equal(handlers.size, 0);
  calibrator.clearVisualRouteCalibrationScene(scene);
  calibrator.setVisualRouteCalibrationTestModeEnabled(false);
});

test('browser script loads generic calibrator before domain adapters', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  assert.match(
    html,
    /traffic-visuals\.js[\s\S]*vessel-route-metadata\.js[\s\S]*visual-route-calibrator\.js[\s\S]*vessel-visuals\.js[\s\S]*main\.js/,
  );
  assert.match(main, /pointerdown[\s\S]*isVisualRouteCalibrationInputCaptured\(this\)/);
  assert.match(html, /id="about-app-icon"[\s\S]*id="visual-route-calibration-test-mode-label" hidden>【test mode】/);
  assert.match(main, /updateVisualRoutePerformanceProfiler\(this, time, delta\)/);
});

test('performance profiler summarizes frame time and deduplicates shared texture sources', () => {
  const summary = calibrator.summarizeVisualRoutePerformanceSamples([16, 17, 18, 40]);
  assert.equal(summary.currentMs, 40);
  assert.equal(summary.averageMs, 22.75);
  assert.equal(summary.p95Ms, 40);
  assert.equal(summary.maxMs, 40);
  assert.equal(summary.longFrames, 1);
  assert.ok(summary.fps > 43 && summary.fps < 44);

  const sharedAirportImage = { width: 1024, height: 512 };
  const otherImage = { width: 256, height: 256 };
  const list = {
    airport_12x12: { source: [{ image: sharedAirportImage, width: 1024, height: 512 }] },
    alias_for_test: { source: [{ image: sharedAirportImage, width: 1024, height: 512 }] },
    aircraft: { source: [{ image: otherImage, width: 256, height: 256 }] },
  };
  const scene = {
    textures: {
      list,
      exists: (key) => Object.hasOwn(list, key),
    },
  };
  const textures = calibrator.getVisualRouteTextureMemoryStats(scene);
  assert.equal(textures.textureCount, 3);
  assert.equal(textures.sourceCount, 2);
  assert.equal(textures.airportTextureCount, 1);
  assert.equal(textures.estimatedBytes, (1024 * 512 + 256 * 256) * 4 * (4 / 3));
});
