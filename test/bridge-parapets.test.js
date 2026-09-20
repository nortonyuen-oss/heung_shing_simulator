const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');
const mainSource = source('main.js');

function sliceFunction(name) {
  const start = mainSource.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `${name} must remain extractable from main.js`);
  const end = mainSource.indexOf('\n}\n', start) + 3;
  return mainSource.slice(start, end);
}

// bridge-parapets.js shares browser globals with constants.js, main.js (rotateDirection) and
// street-lamps.js (the surface lift); load them into one vm context.
function createContext({ withCalibrator = false } = {}) {
  const context = vm.createContext({ console, setTimeout, clearTimeout });
  vm.runInContext(source('constants.js'), context, { filename: 'constants.js' });
  vm.runInContext(sliceFunction('rotateDirection'), context, { filename: 'main.js#rotateDirection' });
  vm.runInContext(source('traffic-signals.js'), context, { filename: 'traffic-signals.js' });
  vm.runInContext(source('street-lamps.js'), context, { filename: 'street-lamps.js' });
  vm.runInContext(source('bridge-parapets.js'), context, { filename: 'bridge-parapets.js' });
  if (withCalibrator) {
    vm.runInContext(source('visual-route-calibrator.js'), context, { filename: 'visual-route-calibrator.js' });
    vm.runInContext(source('street-prop-calibrator.js'), context, { filename: 'street-prop-calibrator.js' });
    vm.runInContext(source('bridge-parapet-calibrator.js'), context, { filename: 'bridge-parapet-calibrator.js' });
  }
  return (expr) => vm.runInContext(expr, context);
}

const toPlain = (value) => JSON.parse(JSON.stringify(value));

// A bridge map from characters: '-' deck:row, '|' deck:col, n/e/s/w ramp climbing that way.
function placementsFor(run, rows) {
  const values = { '-': 'deck:row', '|': 'deck:col', n: 'ramp:n', e: 'ramp:e', s: 'ramp:s', w: 'ramp:w' };
  const bridgeValueAt = (row, col) => values[rows[row]?.[col]] ?? null;
  return toPlain(run('computeBridgeParapetPlacements')({ mapWidth: rows[0].length, mapHeight: rows.length, bridgeValueAt }));
}

test('every deck and ramp tile carries a barrier on each of its two long edges', () => {
  const run = createContext();
  const placements = placementsFor(run, [
    '.....',
    '.s...',   // ramp climbing south (into the deck below): runs n-s, edged e and w
    '.|...',
    '.n...',
    '.....',
    'w--e.',   // a row bridge: ramps climb w and e, decks run e-w, edged n and s
  ]);
  const byTile = {};
  placements.forEach((p) => { (byTile[`${p.row}:${p.col}`] ??= []).push(p); });
  assert.deepEqual(Object.keys(byTile).sort(), ['1:1', '2:1', '3:1', '5:0', '5:1', '5:2', '5:3']);
  assert.deepEqual(byTile['2:1'].map((p) => p.side), ['e', 'w'], 'a column deck is edged e and w');
  assert.deepEqual(byTile['5:1'].map((p) => p.side), ['n', 's'], 'a row deck is edged n and s');
  assert.deepEqual(byTile['1:1'].map((p) => [p.side, p.high]), [['e', 's'], ['w', 's']], 'a ramp keeps its high end');
  assert.deepEqual(byTile['5:0'].map((p) => [p.side, p.high]), [['n', 'w'], ['s', 'w']]);
  assert.ok(byTile['2:1'].every((p) => p.high === null), 'a deck is level');
  assert.equal(placements.length, 14);
  assert.equal(new Set(placements.map(run('bridgeParapetId'))).size, 14, 'ids are unique per tile edge');
});

test('the edge a barrier stands on turns with the map, and picks the matching art axis', () => {
  const run = createContext();
  const facing = run('bridgeParapetFacing');
  const textureKey = run('bridgeParapetTextureKey');
  // Default view: map n = screen NE, e = SE, s = SW, w = NW.
  assert.deepEqual(['n', 'e', 's', 'w'].map((side) => facing({ side }, 0)), ['ne', 'se', 'sw', 'nw']);
  // One clockwise turn: n -> e (SE), and so on round.
  assert.deepEqual(['n', 'e', 's', 'w'].map((side) => facing({ side }, 1)), ['se', 'sw', 'nw', 'ne']);
  // NE and SW edges lie along NW-SE -> parapet_h; SE and NW edges along SW-NE -> parapet_v.
  assert.equal(textureKey('ne'), 'bridge_parapet_h');
  assert.equal(textureKey('sw'), 'bridge_parapet_h');
  assert.equal(textureKey('se'), 'bridge_parapet_v');
  assert.equal(textureKey('nw'), 'bridge_parapet_v');
  // A ramp's barrier is sheared towards its (rotated) high end.
  assert.equal(textureKey('ne', 'e'), 'bridge_parapet_h_high_se');
  assert.equal(textureKey('sw', 'w'), 'bridge_parapet_h_high_nw');
  assert.equal(textureKey('se', 'n'), 'bridge_parapet_v_high_ne');
  assert.equal(textureKey('nw', 's'), 'bridge_parapet_v_high_sw');
  // A high end that is not along the edge's axis (never produced by the placements) falls back to level.
  assert.equal(textureKey('ne', 'n'), 'bridge_parapet_h');
  const files = toPlain(run('BRIDGE_PARAPET_TEXTURE_FILES'));
  Object.values(files).forEach((file) => assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is baked`));
  assert.equal(Object.keys(files).length, 6);
});

test('a barrier anchors on the edge midpoint of the lifted deck and sorts like a vehicle there', () => {
  const run = createContext();
  run(`globalThis.mapRotation = 0;
       globalThis.TILE_HEIGHT = 50;
       globalThis.getWorldDepth = (layer, local) => 200000 + local;
       globalThis.isoToScreen = (col, row) => ({ x: (col - row) * 50, y: (col + row) * 25 });
       globalThis.getTileFaceGeometry = (row, col, ox, oy) => ({ center: { x: (col - row) * 50 + ox, y: (col + row) * 25 + oy - 40 } });
       globalThis.getTrafficRuntimeLayers = () => ({});
       globalThis.getTerrainTileVisualOffset = () => 0;
       globalThis.getTrafficRoadSurface = (row) => (row === 1
         ? { kind: 'bridge-ramp', directions: ['n', 's'], centerLift: 7.5, endpointLifts: { n: 15, s: 0 } }
         : { kind: 'bridge-deck', directions: ['n', 's'], centerLift: 15, endpointLifts: { n: 15, s: 15 } });
       // Geometry only: the shipped per-edge nudges are checked separately below.
       globalThis.getBridgeParapetCalibrationOffset = () => ({ dx: 0, dy: 0 });`);
  const anchor = run('bridgeParapetAnchor');
  const scene = { offsetX: 1000, offsetY: 2000 };
  // Deck at (2, 4): centre (100, 150) -> face centre (1100, 2110). Its e edge midpoint is half
  // a tile towards +col: (+25, +12.5), then the 15 px deck lift. The edge's ends are 12.5 px
  // above and below that midpoint; a near edge sorts by its lower end, a far edge by its upper.
  const east = toPlain(anchor(scene, { row: 2, col: 4, side: 'e', high: null }, 'se'));
  assert.deepEqual(east, { x: 1125, y: 2110 + 12.5 - 15, depth: 200000 + 175 + 50 - 15 });
  const west = toPlain(anchor(scene, { row: 2, col: 4, side: 'w', high: null }, 'nw'));
  assert.deepEqual(west, { x: 1075, y: 2110 - 12.5 - 15, depth: 200000 + 125 + 50 - 15 });
  const vehicleAtCentre = 200000 + 150 + 25 - 15 + 25;
  assert.ok(west.depth < vehicleAtCentre && east.depth > vehicleAtCentre,
    'a vehicle at the tile centre draws between the far and the near barrier');
  // Ramp at (1, 4) climbing n: the edge midpoint is level with the ramp centre, half the lift.
  // Its near edge sorts as the ramp's foot end (lower on screen, lift 0), its far edge as the
  // top end (higher, lift 15), so nothing driving or standing on the ramp crosses either.
  const ramp = toPlain(anchor(scene, { row: 1, col: 4, side: 'e', high: 'n' }, 'se'));
  assert.equal(ramp.y, 2000 + 125 - 40 + 12.5 - 7.5);
  assert.equal(ramp.depth, 200000 + 150 + 50 - 0, 'near ramp edge: its foot end');
  const rampFar = toPlain(anchor(scene, { row: 1, col: 4, side: 'w', high: 'n' }, 'nw'));
  assert.equal(rampFar.depth, 200000 + 100 + 50 - 15, 'far ramp edge: its top end');
  // Calibration nudges apply per facing, on top of the geometry.
  run(`globalThis.getBridgeParapetCalibrationOffset = (facing) => (facing === 'se' ? { dx: 3, dy: -2 } : { dx: 0, dy: 0 });`);
  const nudged = toPlain(anchor(scene, { row: 2, col: 4, side: 'e', high: null }, 'se'));
  assert.deepEqual([nudged.x - east.x, nudged.y - east.y], [3, -2]);
  // Without a live calibration the shipped constants are the nudge.
  run(`globalThis.getBridgeParapetCalibrationOffset = () => null;`);
  const shipped = toPlain(run('BRIDGE_PARAPET_ANCHOR_OFFSETS.se'));
  const constant = toPlain(anchor(scene, { row: 2, col: 4, side: 'e', high: null }, 'se'));
  assert.ok(Math.abs(constant.x - east.x - shipped.dx) < 1e-9 && Math.abs(constant.y - east.y - shipped.dy) < 1e-9);
});

test('the parapet calibrator is a street-prop calibrator instance over the barrier sprites', () => {
  const run = createContext({ withCalibrator: true });
  run('setVisualRouteCalibrationTestModeEnabled(true)');
  assert.equal(run(`getBridgeParapetCalibrationOffset('se')`), null);
  assert.equal(run('isBridgeParapetPickerActive()'), false);
  const shipped = toPlain(run('BRIDGE_PARAPET_ANCHOR_OFFSETS.se'));
  const moved = toPlain(run(`(() => {
    const listeners = {};
    const sprite = { x: 50, y: 60, bridgeParapetFacing: 'se', setInteractive() {}, disableInteractive() {}, on(n, f) { listeners[n] = f; }, off() {} };
    const scene = { input: { setDraggable() {} }, bridgeParapetSprites: new Map([['a', sprite]]) };
    bridgeParapetCalibratorTestApi.calibrator.setPickerActive(true);
    bridgeParapetCalibratorTestApi.makeBridgeParapetSpriteDraggable(scene, sprite);
    listeners.dragstart(); listeners.drag(null, 52, 57); listeners.dragend();
    const record = bridgeParapetCalibratorTestApi.calibrator.buildRecord();
    return { offset: getBridgeParapetCalibrationOffset('se'), kind: record.kind, keys: Object.keys(record.facings).sort() };
  })()`));
  assert.ok(Math.abs(moved.offset.dx - (shipped.dx + 2)) < 1e-9 && Math.abs(moved.offset.dy - (shipped.dy - 3)) < 1e-9);
  assert.equal(moved.kind, 'bridge-parapet-anchor-offset');
  assert.deepEqual(moved.keys, ['ne', 'nw', 'se', 'sw']);
  assert.equal(run('isBridgeParapetPickerActive()'), true);
  run('teardownBridgeParapetCalibrator()');
  assert.equal(run('isBridgeParapetPickerActive()'), false);
  assert.equal(run('isBridgeParapetCalibrationActive()'), false);
});

test('main.js, index.html and the performance panel are wired for the parapets', () => {
  const body = (name) => { const from = mainSource.slice(mainSource.indexOf(`\nfunction ${name}(`)); return from.slice(0, from.indexOf('\n}\n')); };
  assert.ok(mainSource.includes('BRIDGE_PARAPET_TEXTURE_FILES'), 'preload registers the segment textures');
  assert.ok(body('create').includes('this.bridgeParapetSprites = new Map()'));
  assert.ok(body('refreshTileArea').includes('scheduleBridgeParapetRefresh(scene)'), 'bridge edits schedule a rebuild');
  assert.ok(body('refreshAllTiles').includes('rebuildBridgeParapetSprites(scene)'), 'full rebuilds recreate every barrier');
  assert.ok(body('positionAllTiles').includes('refreshAllBridgeParapetSprites(scene)'), 'resize and rotation re-anchor every barrier');
  assert.ok(body('updateSpriteViewportCulling').includes('scene.bridgeParapetSprites'), 'barriers are viewport-culled');
  assert.ok(body('applyNightObjectTint').includes('scene.bridgeParapetSprites?.forEach(apply)'), 'barriers darken at night with the trees');
  const html = source('index.html');
  const lamps = html.indexOf('<script src="street-lamps.js"></script>');
  const parapets = html.indexOf('<script src="bridge-parapets.js"></script>');
  const calibrator = html.indexOf('<script src="bridge-parapet-calibrator.js"></script>');
  const main = html.indexOf('<script src="main.js"></script>');
  assert.ok(lamps >= 0 && parapets > lamps && calibrator > parapets && main > calibrator);
  const panel = source('visual-route-calibrator.js');
  assert.ok(panel.includes('toggleBridgeParapetCalibrator(scene)') && panel.includes('teardownBridgeParapetCalibrator()') && panel.includes('isBridgeParapetPickerActive()'));
});

// The lamp posts stand on the pavement just inside the barrier (STREET_LAMP_LOGICAL_INSET.side
// 0.42 of the edge's 0.5), so the near barrier must draw over a post's foot and the far post
// over the far barrier - on a level deck and at both ends of a ramp.
test('street lamps on a bridge sort between the far and the near barrier', () => {
  const run = createContext();
  run(`globalThis.mapRotation = 0;
       globalThis.TILE_HEIGHT = 50;
       globalThis.getWorldDepth = (layer, local) => 200000 + local;
       globalThis.isoToScreen = (col, row) => ({ x: (col - row) * 50, y: (col + row) * 25 });
       globalThis.getTileFaceGeometry = (row, col, ox, oy) => ({ center: { x: (col - row) * 50 + ox, y: (col + row) * 25 + oy - 40 } });
       globalThis.getTrafficRuntimeLayers = () => ({});
       globalThis.getTerrainTileVisualOffset = () => 0;
       globalThis.getTrafficRoadSurface = (row) => (row === 1
         ? { kind: 'bridge-ramp', directions: ['n', 's'], centerLift: 7.5, endpointLifts: { n: 15, s: 0 } }
         : { kind: 'bridge-deck', directions: ['n', 's'], centerLift: 15, endpointLifts: { n: 15, s: 15 } });
       globalThis.getBridgeParapetCalibrationOffset = () => ({ dx: 0, dy: 0 });
       globalThis.getStreetLampCalibrationOffset = () => ({ dx: 0, dy: 0 });`);
  const parapet = run('bridgeParapetAnchor');
  const lamp = run('streetLampAnchor');
  const scene = { offsetX: 0, offsetY: 0 };
  const inset = toPlain(run('STREET_LAMP_LOGICAL_INSET'));
  for (const row of [1, 2]) {
    const near = parapet(scene, { row, col: 4, side: 'e', high: row === 1 ? 'n' : null }, 'se').depth;
    const far = parapet(scene, { row, col: 4, side: 'w', high: row === 1 ? 'n' : null }, 'nw').depth;
    for (const along of [-inset.along, inset.along]) {
      const nearLamp = lamp(scene, { row, col: 4, offsetRow: along, offsetCol: inset.side }, 'nw').depth;
      const farLamp = lamp(scene, { row, col: 4, offsetRow: along, offsetCol: -inset.side }, 'se').depth;
      assert.ok(nearLamp < near, `row ${row} along ${along}: the near barrier covers the near post (${nearLamp} < ${near})`);
      assert.ok(farLamp > far, `row ${row} along ${along}: the far post covers the far barrier (${farLamp} > ${far})`);
    }
    // Traffic (traffic-visuals.js: depthY = tile y + 25 + lane offset - surface lift, depth =
    // depthY + 25) anywhere along the tile, in either lane, stays between the two barriers.
    for (const along of [-0.5, 0, 0.5]) {
      for (const lane of [-0.25, 0.25]) {
        const y = 25 * (row + 4) + (along + lane) * 25;
        const lift = row === 1 ? 7.5 - along * 15 : 15;
        const vehicle = 200000 + y + 25 - lift + 25;
        assert.ok(vehicle < near && vehicle > far, `row ${row} along ${along} lane ${lane}: traffic between the barriers (${far} < ${vehicle} < ${near})`);
      }
    }
  }
});
