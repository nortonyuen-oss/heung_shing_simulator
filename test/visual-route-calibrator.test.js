const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const calibrator = require('../visual-route-calibrator.js');

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

test('calibration records persist and collect independently by visual slot', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const records = {
    'vessel-berth:ll': { slot: 'll', worldX: 10 },
    'vessel-berth:ur': { slot: 'ur', worldX: 20 },
    'aircraft-taxi:north': { slot: 'north', worldX: 30 },
  };
  assert.equal(calibrator.persistVisualRouteCalibrationRecords(records, storage), true);
  assert.deepEqual(calibrator.loadVisualRouteCalibrationRecords(storage), records);
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
});

test('browser script loads generic calibrator before domain adapters', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  assert.match(
    html,
    /traffic-visuals\.js[\s\S]*vessel-route-metadata\.js[\s\S]*visual-route-calibrator\.js[\s\S]*vessel-visuals\.js[\s\S]*main\.js/,
  );
  assert.match(main, /pointerdown[\s\S]*isVisualRouteCalibrationInputCaptured\(this\)/);
});
