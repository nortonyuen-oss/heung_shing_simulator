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

// street-lamps.js shares browser globals with constants.js, main.js (rotateDirection) and
// traffic-signals.js (signal placements it keeps clear of); load them into one vm context.
function createContext({ withCalibrator = false } = {}) {
  const context = vm.createContext({ console, setTimeout, clearTimeout });
  vm.runInContext(source('constants.js'), context, { filename: 'constants.js' });
  vm.runInContext(sliceFunction('rotateDirection'), context, { filename: 'main.js#rotateDirection' });
  vm.runInContext(source('traffic-signals.js'), context, { filename: 'traffic-signals.js' });
  vm.runInContext(source('street-lamps.js'), context, { filename: 'street-lamps.js' });
  if (withCalibrator) {
    vm.runInContext(source('visual-route-calibrator.js'), context, { filename: 'visual-route-calibrator.js' });
    vm.runInContext(source('street-prop-calibrator.js'), context, { filename: 'street-prop-calibrator.js' });
    vm.runInContext(source('street-lamp-calibrator.js'), context, { filename: 'street-lamp-calibrator.js' });
  }
  return (expr) => vm.runInContext(expr, context);
}

const toPlain = (value) => JSON.parse(JSON.stringify(value));

// Road keys from a character map, the way getRoadKey derives them ('.' = not road, 'B' = bridge).
function roadKeyAtFor(rows) {
  const isRoad = (r, c) => r >= 0 && c >= 0 && r < rows.length && c < rows[r].length && rows[r][c] !== '.';
  return (row, col) => {
    if (!isRoad(row, col)) return null;
    if (rows[row][col] === 'B') return 'road_bridge_v';
    const n = isRoad(row - 1, col); const e = isRoad(row, col + 1); const s = isRoad(row + 1, col); const w = isRoad(row, col - 1);
    const count = n + e + s + w;
    if (count === 4) return 'road_cross';
    if (count === 3) return !s ? 'road_t_n' : !w ? 'road_t_e' : !n ? 'road_t_s' : 'road_t_w';
    if (count === 2) {
      if (n && s) return 'road_straight_v';
      if (e && w) return 'road_straight_h';
      if (n && e) return 'road_corner_ne';
      if (s && e) return 'road_corner_se';
      if (s && w) return 'road_corner_sw';
      return 'road_corner_nw';
    }
    if (count === 1) return n ? 'road_end_n' : e ? 'road_end_e' : s ? 'road_end_s' : 'road_end_w';
    return 'road_isolated';
  };
}

function placementsFor(run, rows, withSignals = true) {
  const roadKeyAt = roadKeyAtFor(rows);
  const size = { mapWidth: rows[0].length, mapHeight: rows.length, roadKeyAt };
  const signalPlacements = withSignals ? run('computeTrafficSignalPlacements')(size) : [];
  return toPlain(run('computeStreetLampPlacements')({ ...size, signalPlacements }));
}

test('a straight road gets the Hong Kong staggered pattern: 30 m between consecutive lamps', () => {
  const run = createContext();
  // A long vertical road (col 1, rows 0..11) with ends at both tips.
  const rows = Array.from({ length: 12 }, () => '.|.');
  const lamps = placementsFor(run, rows);
  const inset = toPlain(run('STREET_LAMP_LOGICAL_INSET'));
  // Rows 1..10 are straights; ends carry nothing. Pattern by row%3: 0 -> side w back, 1 -> side e forward, 2 -> none.
  const byRow = Object.fromEntries(lamps.map((l) => [l.row, l]));
  assert.ok(!byRow[0] && !byRow[11], 'road ends carry no lamp');
  for (let row = 1; row <= 10; row++) {
    const slot = row % 3;
    if (slot === 2) { assert.ok(!byRow[row], `row ${row} has no lamp`); continue; }
    const lamp = byRow[row];
    assert.ok(lamp, `row ${row} has a lamp`);
    assert.equal(lamp.kind, 'straight');
    assert.equal(lamp.side, slot === 0 ? 'w' : 'e');
    assert.equal(lamp.arm, slot === 0 ? 'e' : 'w', 'the arm points across the road');
    assert.ok(Math.abs(lamp.offsetCol - (slot === 0 ? -inset.side : inset.side)) < 1e-9, 'stands on the kerb');
    assert.ok(Math.abs(lamp.offsetRow - (slot === 0 ? -inset.along : inset.along)) < 1e-9, 'pulled back / pushed forward a quarter tile');
  }
  // Consecutive lamps: (row 3, -0.25) -> (row 4, +0.25) = 1.5 tiles, (row 4, +0.25) -> (row 6, -0.25) = 1.5 tiles.
  const along = lamps.map((l) => l.row + l.offsetRow).sort((a, b) => a - b);
  for (let i = 1; i < along.length; i++) assert.ok(Math.abs(along[i] - along[i - 1] - 1.5) < 1e-9, `gap ${i} is 1.5 tiles (30 m)`);
  // Two lamps per three tiles.
  assert.equal(lamps.length, 7);
});

test('horizontal straights use the column as the along-road coordinate and the n/s kerbs', () => {
  const run = createContext();
  const lamps = placementsFor(run, ['............', '............', '------------', '............']).filter((l) => l.kind === 'straight');
  assert.ok(lamps.length > 0);
  lamps.forEach((lamp) => {
    const slot = lamp.col % 3;
    assert.notEqual(slot, 2);
    assert.equal(lamp.side, slot === 0 ? 'n' : 's');
    assert.equal(lamp.offsetRow < 0, slot === 0, 'n side is row-');
    assert.equal(Math.sign(lamp.offsetCol), slot === 0 ? -1 : 1);
  });
});

test('bends get one lamp on the outside; junctions, ends and isolated tiles get none', () => {
  const run = createContext();
  const lamps = placementsFor(run, [
    '.....',
    '.#--.',   // (1,1) connects e and s -> road_corner_se
    '.|...',
    '.|...',
    '.....',
  ], false);
  const corner = lamps.find((l) => l.kind === 'corner');
  assert.ok(corner, 'the bend has a lamp');
  assert.deepEqual([corner.row, corner.col], [1, 1]);
  // road_corner_se connects s and e; the outside is the n+w corner.
  assert.equal(corner.side, 'nw');
  assert.ok(corner.offsetRow < 0 && corner.offsetCol < 0, 'outer corner is up-left in map space');
  assert.equal(corner.arm, 's', 'the arm points along one connected arm, towards the road');

  const withJunctions = placementsFor(run, [
    '..|..',
    '..|..',
    '--+--',
    '..B..',
    '..|..',
    '..|..',
  ]);
  assert.ok(!withJunctions.some((l) => l.row === 2 && l.col === 2), 'the junction carries the signal poles, not a lamp');
  assert.ok(!withJunctions.some((l) => l.kind !== 'straight' && l.kind !== 'corner'));
  const isolated = placementsFor(run, ['...', '.|.', '...']);
  assert.equal(isolated.length, 0);
});

test('a lamp on a signal approach tile keeps clear of the pole at the junction end of its kerb', () => {
  const run = createContext();
  const inset = toPlain(run('STREET_LAMP_LOGICAL_INSET'));
  // Vertical road into a cross at row 6 (approach tile row 5: slot 5%3=2 -> no lamp; use row 4 -> slot 1).
  // Shift the map so the approach tile lands on a slot-1 row: cross at row 5, approach at row 4.
  const rows = ['..|..', '..|..', '..|..', '..|..', '..|..', '--+--', '..|..', '..|..'];
  const withSignals = placementsFor(run, rows, true);
  const without = placementsFor(run, rows, false);
  const approachWith = withSignals.find((l) => l.row === 4 && l.col === 2);
  const approachWithout = without.find((l) => l.row === 4 && l.col === 2);
  assert.ok(approachWith && approachWithout);
  // Row 4 is slot 1: side e, pushed forward (+along, towards row 5 = the junction). Traffic into the
  // junction from row 4 travels 's', whose driver's left is 'e' - the same kerb - so the lamp moves back.
  assert.equal(approachWithout.side, 'e');
  assert.ok(approachWithout.offsetRow > 0, 'without signals the pattern pushes it towards the junction');
  assert.ok(Math.abs(approachWith.offsetRow + inset.along) < 1e-9, 'with a signal pole there it retreats to the far half');
  // The other approach on row 6 (slot 0: side w, pulled back towards row 5 = junction; travel 'n', left = 'w'): also flips.
  const south = withSignals.find((l) => l.row === 6 && l.col === 2);
  assert.equal(south.side, 'w');
  assert.ok(south.offsetRow > 0, 'pulled away from the junction instead');
});

test('the arm facing follows the kerb and the map rotation', () => {
  const run = createContext();
  const facing = run('streetLampFacing');
  // A post on the w (screen NW) kerb has its arm pointing e (screen SE).
  assert.equal(facing({ arm: 'e' }, 0), 'se');
  assert.equal(facing({ arm: 'w' }, 0), 'nw');
  assert.equal(facing({ arm: 'n' }, 0), 'ne');
  assert.equal(facing({ arm: 's' }, 0), 'sw');
  assert.equal(facing({ arm: 'e' }, 1), 'sw', 'a quarter turn rotates the arm');
  assert.equal(facing({ arm: 'e' }, 2), 'nw');
  const key = run('streetLampTextureKey');
  assert.equal(key('ne', false), 'street_lamp_ne');
  assert.equal(key('ne', true), 'street_lamp_ne__lit');
});

test('day and night textures exist for every facing and the sheet is not shipped', () => {
  const run = createContext();
  const files = toPlain(run('STREET_LAMP_TEXTURE_FILES'));
  assert.equal(Object.keys(files).length, 8);
  Object.values(files).forEach((file) => assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} exists`));
  assert.ok(!fs.existsSync(path.join(ROOT, 'Models/traffic/lightPost/lightPost.png')), 'the 2x2 sheet lives under scripts/source-art');
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts/source-art/lightPost_sheet.png')));
});

test('lamps light up past the ON strength, stay lit until OFF, and obey the lights toggle', () => {
  const run = createContext();
  const on = run('STREET_LAMP_NIGHT_ON');
  const off = run('STREET_LAMP_NIGHT_OFF');
  const lit = run('streetLampsShouldBeLit');
  assert.equal(lit({ trafficLightStrength: on - 0.01, streetLampsLit: false }), false);
  assert.equal(lit({ trafficLightStrength: on + 0.01, streetLampsLit: false }), true);
  assert.equal(lit({ trafficLightStrength: on - 0.01, streetLampsLit: true }), true, 'hysteresis: still lit between OFF and ON');
  assert.equal(lit({ trafficLightStrength: off - 0.01, streetLampsLit: true }), false);
  assert.equal(lit({}), false);
  run('globalThis.isBuildingLightsEnabled = () => false');
  assert.equal(lit({ trafficLightStrength: 1, streetLampsLit: true }), false, 'View-menu lights off');
  run('globalThis.isBuildingLightsEnabled = () => true; globalThis.isAttractLightsSuppressed = () => true');
  assert.equal(lit({ trafficLightStrength: 1, streetLampsLit: true }), false, 'attract mode lights off');
});

test('the visual pass swaps every post once when the lit state flips and is idle otherwise', () => {
  const run = createContext();
  const result = toPlain(run(`(() => {
    const makePost = (x, y) => ({
      x, y, streetLampFacing: 'ne', texture: { key: 'street_lamp_ne' }, streetLamp: { row: 0, col: 0 }, swaps: 0,
      setTexture(key) { this.texture = { key }; this.swaps++; }, setOrigin() {}, setScale() {},
    });
    const near = makePost(10, 10); const far = makePost(9000, 9000);
    const scene = {
      streetLampSprites: new Map([['a', near], ['b', far]]), trafficLightStrength: 0,
      cameras: { main: { worldView: { x: 0, y: 0, right: 100, bottom: 100 } } },
      textures: { exists: () => true, get: () => ({ getSourceImage: () => ({ width: 256, height: 235 }) }) },
    };
    updateStreetLampVisuals(scene, 0);
    const day = { near: near.texture.key, lit: scene.streetLampsLit };
    scene.trafficLightStrength = 0.9;
    updateStreetLampVisuals(scene, 50);            // throttled: nothing yet
    const throttled = { near: near.texture.key };
    updateStreetLampVisuals(scene, 150);
    const night = { near: near.texture.key, far: far.texture.key, lit: scene.streetLampsLit, swaps: near.swaps };
    updateStreetLampVisuals(scene, 300);
    updateStreetLampVisuals(scene, 450);
    return { day, throttled, night, swapsAfterRepeat: near.swaps + far.swaps };
  })()`));
  assert.deepEqual(result.day, { near: 'street_lamp_ne', lit: false });
  assert.equal(result.throttled.near, 'street_lamp_ne');
  assert.deepEqual(result.night, { near: 'street_lamp_ne__lit', far: 'street_lamp_ne__lit', lit: true, swaps: 1 }, 'every post, in view or not, flips together');
  assert.equal(result.swapsAfterRepeat, 2, 'no swap while the state holds');
});

test('the lamp calibrator is a street-prop calibrator instance over the lamp sprites', () => {
  const run = createContext({ withCalibrator: true });
  run('setVisualRouteCalibrationTestModeEnabled(true)');
  assert.equal(run(`getStreetLampCalibrationOffset('ne')`), null);
  assert.equal(run('isStreetLampPickerActive()'), false);
  const shipped = toPlain(run('STREET_LAMP_ANCHOR_OFFSETS.ne'));
  const moved = toPlain(run(`(() => {
    const listeners = {};
    const sprite = { x: 50, y: 60, streetLampFacing: 'ne', setInteractive() {}, disableInteractive() {}, on(n, f) { listeners[n] = f; }, off() {} };
    const scene = { input: { setDraggable() {} }, streetLampSprites: new Map([['a', sprite]]) };
    streetLampCalibratorTestApi.calibrator.setPickerActive(true);
    streetLampCalibratorTestApi.makeStreetLampSpriteDraggable(scene, sprite);
    listeners.dragstart(); listeners.drag(null, 52, 57); listeners.dragend();
    const record = streetLampCalibratorTestApi.calibrator.buildRecord();
    return { offset: getStreetLampCalibrationOffset('ne'), kind: record.kind, keys: Object.keys(record.facings).sort(), inset: record.logicalInset };
  })()`));
  assert.ok(Math.abs(moved.offset.dx - (shipped.dx + 2)) < 1e-9 && Math.abs(moved.offset.dy - (shipped.dy - 3)) < 1e-9);
  assert.equal(moved.kind, 'street-lamp-anchor-offset');
  assert.deepEqual(moved.keys, ['ne', 'nw', 'se', 'sw']);
  assert.deepEqual(moved.inset, toPlain(run('STREET_LAMP_LOGICAL_INSET')));
  assert.equal(run('isStreetLampPickerActive()'), true);
  run('teardownStreetLampCalibrator()');
  assert.equal(run('isStreetLampPickerActive()'), false);
  assert.equal(run('isStreetLampCalibrationActive()'), false);
});

test('main.js, index.html and the performance panel are wired for the lamps', () => {
  const body = (name) => { const from = mainSource.slice(mainSource.indexOf(`\nfunction ${name}(`)); return from.slice(0, from.indexOf('\n}\n')); };
  assert.ok(mainSource.includes('STREET_LAMP_TEXTURE_FILES'), 'preload registers day and night textures');
  assert.ok(mainSource.includes('updateStreetLampVisuals(this, time)'), 'the scene update runs the night swap');
  assert.ok(body('refreshTileArea').includes('scheduleStreetLampRefresh(scene)'), 'road edits schedule a lamp rebuild');
  assert.ok(body('refreshAllTiles').includes('rebuildStreetLampSprites(scene)'), 'full rebuilds recreate every lamp');
  assert.ok(body('positionAllTiles').includes('refreshAllStreetLampSprites(scene)'), 'resize and rotation re-anchor every lamp');
  assert.ok(body('updateSpriteViewportCulling').includes('scene.streetLampSprites'), 'lamps are viewport-culled');
  const html = source('index.html');
  const factory = html.indexOf('street-prop-calibrator.js');
  const lamps = html.indexOf('<script src="street-lamps.js"></script>');
  const calibrator = html.indexOf('<script src="street-lamp-calibrator.js"></script>');
  const main = html.indexOf('<script src="main.js"></script>');
  assert.ok(factory >= 0 && lamps > factory && calibrator > lamps && main > calibrator);
  const panel = source('visual-route-calibrator.js');
  assert.ok(panel.includes('toggleStreetLampCalibrator(scene)') && panel.includes('teardownStreetLampCalibrator()') && panel.includes('isStreetLampPickerActive()'));
});

test('bridge decks, ramps and hill slopes carry lamps that stand on the raised surface', () => {
  const run = createContext();
  const lamps = placementsFor(run, ['.....', '..B..', '..B..', '..B..', '..B..', '.....'], false);
  // Rows 1-4 of column 2 are bridge decks (road_bridge_v): lamps follow the same 30 m pattern.
  const decks = lamps.filter((l) => l.col === 2);
  assert.ok(decks.length >= 2, 'bridge decks are lamp-worthy');
  decks.forEach((l) => assert.equal(l.kind, 'straight'));
  const straights = run('STREET_LAMP_STRAIGHTS');
  ['road_bridge_v', 'road_bridge_h', 'road_hill_n', 'road_hill_e', 'road_hill2_s', 'road_hill2_w'].forEach((key) => {
    assert.ok(straights[key], `${key} is treated as a straight run`);
  });

  // Surface lift: a deck sits BRIDGE_DECK_VISUAL_LIFT above its (unlifted) water tile; a ramp
  // rises along its axis; a flat road adds nothing.
  run(`globalThis.getTrafficRuntimeLayers = () => ({});
       globalThis.getTerrainTileVisualOffset = () => 0;
       globalThis.getTrafficRoadSurface = (row, col) => {
         if (row === 0) return { kind: 'bridge-deck', directions: ['n', 's'], centerLift: 15, endpointLifts: { n: 15, s: 15 } };
         if (row === 1) return { kind: 'bridge-ramp', directions: ['n', 's'], centerLift: 7.5, endpointLifts: { n: 15, s: 0 } };
         return { kind: 'flat', directions: ['n', 'e', 's', 'w'], centerLift: 0, endpointLifts: { n: 0, e: 0, s: 0, w: 0 } };
       };`);
  const lift = run('streetLampSurfaceLift');
  assert.equal(lift({ row: 0, col: 0, offsetRow: -0.25, offsetCol: 0.42 }), 15, 'deck: the full lift everywhere');
  assert.ok(Math.abs(lift({ row: 1, col: 0, offsetRow: -0.25, offsetCol: 0.42 }) - 11.25) < 1e-9, 'ramp: a quarter tile towards the high end');
  assert.ok(Math.abs(lift({ row: 1, col: 0, offsetRow: 0.25, offsetCol: -0.42 }) - 3.75) < 1e-9, 'ramp: a quarter tile towards the low end');
  assert.equal(lift({ row: 1, col: 0, offsetRow: 0, offsetCol: 0.42 }), 7.5, 'ramp centre');
  assert.equal(lift({ row: 2, col: 0, offsetRow: 0.25, offsetCol: 0.42 }), 0, 'flat road');
  // A hill slope whose tile face is already drawn at its base height: only the rise above that counts.
  run(`globalThis.getTerrainTileVisualOffset = () => -12;
       globalThis.getTrafficRoadSurface = () => ({ kind: 'terrain-slope', directions: ['n', 's'], centerLift: 18, endpointLifts: { n: 24, s: 12 } });`);
  assert.equal(lift({ row: 5, col: 5, offsetRow: 0.25, offsetCol: 0 }), 3, 'slope: low end = 12 (base) + rise');
  assert.equal(lift({ row: 5, col: 5, offsetRow: -0.25, offsetCol: 0 }), 9, 'slope: towards the high end');
});

test('rotation and resize re-anchor every tile-anchored sprite family, debris included', () => {
  const body = mainSource.slice(mainSource.indexOf('\nfunction positionAllTiles('));
  const positionAllTiles = body.slice(0, body.indexOf('\n}\n'));
  ['positionBuilding(scene, building)', 'positionTree(scene, sprite)', 'positionDebrisSprite(scene, sprite)', 'positionBusStopSprite(scene, sprite)',
    'refreshAllTrafficSignalSprites(scene)', 'refreshAllStreetLampSprites(scene)', 'refreshAllBridgeParapetSprites(scene)',
    'repositionDistrictSignSprites(scene)', 'repositionBridgeSprites(scene)'].forEach((call) => {
    assert.ok(positionAllTiles.includes(call), `positionAllTiles repositions via ${call}`);
  });
  const place = mainSource.slice(mainSource.indexOf('\nfunction placeDebrisSprite('));
  assert.ok(place.slice(0, place.indexOf('\n}\n')).includes('positionDebrisSprite(scene, sprite)'), 'placement and repositioning share one anchor formula');
});
