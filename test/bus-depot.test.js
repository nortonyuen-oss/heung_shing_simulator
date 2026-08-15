const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');

// Pulls the real getBusDepotVisualCorner/getBusDepotVisualKey/
// getBusDepotRawSideForCorner bodies straight out of main.js (rather than
// reimplementing them here) so the test tracks the actual rotation math,
// exercised against the real rotateDirection() it depends on.
function createBusDepotContext(mapRotation = 0) {
  const start = mainSource.indexOf('function getBusDepotVisualCorner(rawSide) {');
  const end = mainSource.indexOf('\nfunction refreshBusDepotSprites(scene) {');
  assert.ok(start >= 0 && end > start, 'bus depot orientation helpers must remain extractable from main.js');
  const rotateDirectionStart = mainSource.indexOf('function rotateDirection(direction, steps) {');
  const rotateDirectionEnd = mainSource.indexOf('\n}\n', rotateDirectionStart) + 2;

  const context = vm.createContext({
    BUS_DEPOT_RAW_SIDE_TO_VISUAL_CORNER: { n: 'ur', e: 'lr', s: 'll', w: 'ul' },
    BUS_DEPOT_VISUAL_CORNER_TO_RAW_SIDE: { ur: 'n', lr: 'e', ll: 's', ul: 'w' },
    BUS_DEPOT_MODELS: {
      bus_depot_ll: {}, bus_depot_lr: {}, bus_depot_ur: {}, bus_depot_ul: {},
    },
    mapRotation,
  });
  vm.runInContext(mainSource.slice(rotateDirectionStart, rotateDirectionEnd), context);
  vm.runInContext(mainSource.slice(start, end), context);
  return context;
}

test('at no rotation, a fresh depot defaults to the LL corner', () => {
  const context = createBusDepotContext(0);
  const rawSide = vm.runInContext("getBusDepotRawSideForCorner('ll')", context);
  assert.equal(rawSide, 's');
  assert.equal(vm.runInContext(`getBusDepotVisualCorner('${rawSide}')`, context), 'll');
  assert.equal(vm.runInContext(`getBusDepotVisualKey('${rawSide}')`, context), 'bus_depot_ll');
});

test('cycling LL -> LR -> UR -> UL -> LL round-trips back to the raw side it started from', () => {
  const context = createBusDepotContext(0);
  const order = ['ll', 'lr', 'ur', 'ul'];
  let rawSide = vm.runInContext("getBusDepotRawSideForCorner('ll')", context);
  order.forEach((corner) => {
    const nextRaw = vm.runInContext(`getBusDepotRawSideForCorner('${corner}')`, context);
    assert.equal(vm.runInContext(`getBusDepotVisualCorner('${nextRaw}')`, context), corner);
    rawSide = nextRaw;
  });
  // A full cycle of all 4 corners must use 4 distinct raw sides (n/e/s/w).
  const rawSides = new Set(order.map((corner) => vm.runInContext(`getBusDepotRawSideForCorner('${corner}')`, context)));
  assert.equal(rawSides.size, 4);
  void rawSide;
});

test('a placed depot keeps its true orientation across every map rotation', () => {
  // Place at rotation 0, displaying as UR.
  const placeContext = createBusDepotContext(0);
  const rawSide = vm.runInContext("getBusDepotRawSideForCorner('ur')", placeContext);
  assert.equal(rawSide, 'n');

  // The same raw side, re-resolved at each of the 4 map rotations, must
  // cycle predictably through the 4 corners (rotateDirection's n->e->s->w
  // order) rather than jumping arbitrarily or staying fixed.
  const cornersByRotation = [0, 1, 2, 3].map((mapRotation) => {
    const context = createBusDepotContext(mapRotation);
    return vm.runInContext(`getBusDepotVisualCorner('${rawSide}')`, context);
  });
  assert.deepEqual(cornersByRotation, ['ur', 'lr', 'll', 'ul']);
  // Rotating a full 360 degrees (4 steps) must return to the original corner.
  const fullTurnContext = createBusDepotContext(4);
  assert.equal(vm.runInContext(`getBusDepotVisualCorner('${rawSide}')`, fullTurnContext), 'ur');
});
