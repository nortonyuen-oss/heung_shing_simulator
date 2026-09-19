const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');
const mainSource = source('main.js');

// Slice a top-level `function name(...) {...}` out of main.js so the placement logic runs
// against the real helpers it depends on in the browser.
function sliceFunction(name) {
  const start = mainSource.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `${name} must remain extractable from main.js`);
  const end = mainSource.indexOf('\n}\n', start) + 3;
  return mainSource.slice(start, end);
}

// traffic-signals.js and traffic-signal-calibrator.js share browser globals with constants.js,
// main.js and visual-route-calibrator.js, so load them into one vm context like the other
// calibrator tests do.
function createContext({ withCalibrator = false } = {}) {
  const context = vm.createContext({ console, setTimeout, clearTimeout });
  vm.runInContext(source('constants.js'), context, { filename: 'constants.js' });
  vm.runInContext(sliceFunction('rotateDirection'), context, { filename: 'main.js#rotateDirection' });
  vm.runInContext('let modelAssetManifest = { version: "test", entries: {} };', context);
  vm.runInContext(sliceFunction('normalizeModelLogicalPath'), context, { filename: 'main.js#normalizeModelLogicalPath' });
  vm.runInContext(sliceFunction('getPropTextureAnchor'), context, { filename: 'main.js#getPropTextureAnchor' });
  vm.runInContext(source('traffic-signals.js'), context, { filename: 'traffic-signals.js' });
  if (withCalibrator) {
    vm.runInContext(source('visual-route-calibrator.js'), context, { filename: 'visual-route-calibrator.js' });
    vm.runInContext(source('street-prop-calibrator.js'), context, { filename: 'street-prop-calibrator.js' });
    vm.runInContext(source('traffic-signal-calibrator.js'), context, { filename: 'traffic-signal-calibrator.js' });
  }
  return (expr) => vm.runInContext(expr, context);
}

// A tiny road map: '+' cross, 'T' any T (computed), '-' / '|' straight, 'L' corner, '.' nothing.
// Road keys are derived the same way getRoadKey does (by which neighbours are road), so the
// map only needs to say which tiles are road.
function roadKeyAtFor(rows) {
  const isRoad = (r, c) => r >= 0 && c >= 0 && r < rows.length && c < rows[r].length && rows[r][c] !== '.';
  return (row, col) => {
    if (!isRoad(row, col)) return null;
    if (rows[row][col] === 'B') return 'road_bridge_v';
    const n = isRoad(row - 1, col);
    const e = isRoad(row, col + 1);
    const s = isRoad(row + 1, col);
    const w = isRoad(row, col - 1);
    const count = n + e + s + w;
    if (count === 4) return 'road_cross';
    if (count === 3) {
      if (!s) return 'road_t_n';
      if (!w) return 'road_t_e';
      if (!n) return 'road_t_s';
      return 'road_t_w';
    }
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

function placementsFor(run, rows) {
  const roadKeyAt = roadKeyAtFor(rows);
  const compute = run('computeTrafficSignalPlacements');
  return compute({ mapWidth: rows[0].length, mapHeight: rows.length, roadKeyAt });
}

const byId = (placements) => Object.fromEntries(placements.map((p) => [`${p.row}:${p.col}:${p.travel}`, p]));
// vm-context objects have their own Object prototype (and -0 from negated zeros), so compare
// them as plain JSON.
const toPlain = (value) => JSON.parse(JSON.stringify(value));

test('a cross junction gets one pole on each of its four approach tiles, facing incoming traffic', () => {
  const run = createContext();
  const placements = placementsFor(run, [
    '..|..',
    '..|..',
    '--+--',
    '..|..',
    '..|..',
  ]);
  assert.equal(placements.length, 4);
  const ids = byId(placements);
  // Approach north of the junction (row 1) carries traffic travelling south into it, and so on.
  assert.ok(ids['1:2:s'], 'north approach, travel s');
  assert.ok(ids['3:2:n'], 'south approach, travel n');
  assert.ok(ids['2:1:e'], 'west approach, travel e');
  assert.ok(ids['2:3:w'], 'east approach, travel w');
  placements.forEach((p) => {
    assert.equal(p.junctionRow, 2);
    assert.equal(p.junctionCol, 2);
  });
});

test('a T junction only signals its three arms; the end tiles carry no pole', () => {
  const run = createContext();
  // road_t_n: arms n, e, w (no 's').
  const placements = placementsFor(run, [
    '..|..',
    '..|..',
    '--T--',
    '.....',
  ]);
  const ids = byId(placements);
  assert.deepEqual(Object.keys(ids).sort(), ['1:2:s', '2:1:e', '2:3:w']);
});

test('junctions, road ends and bridges are never used as the approach tile', () => {
  const run = createContext();
  // Two crosses side by side: each is the other's neighbour along the shared row, and a
  // junction has no kerb to spare for the other's pole.
  const adjacent = placementsFor(run, [
    '..||..',
    '..||..',
    '--++--',
    '..||..',
    '..||..',
  ]);
  const adjacentIds = byId(adjacent);
  assert.ok(!adjacentIds['2:3:w'] && !adjacentIds['2:2:e'], 'a junction does not host the pole of its neighbour junction');
  assert.equal(adjacent.length, 6, 'the six outer approaches (3 per cross) still get poles');

  // A cross whose north arm is a one-tile stub: road_end has no through traffic.
  const stub = placementsFor(run, [
    '..|..',
    '--+--',
    '..|..',
    '..|..',
  ]);
  assert.ok(!byId(stub)['0:2:s'], 'a road end is not an approach');

  // A bridge tile next to the junction keeps its own art.
  const bridge = placementsFor(run, [
    '..B..',
    '..B..',
    '--+--',
    '..|..',
    '..|..',
  ]);
  assert.ok(!byId(bridge)['1:2:s'], 'a bridge tile is not an approach');
});

test('the pole stands on the driver\'s left (Hong Kong keeps left) near the junction end', () => {
  const run = createContext();
  const leftOf = run('trafficSignalLeftOf');
  // Travel 'n' is row-1; the driver's left is col-1 ('w'), matching getTrafficLeftLaneOffset.
  assert.deepEqual(toPlain(leftOf('n')), { row: 0, col: -1 });
  assert.deepEqual(toPlain(leftOf('s')), { row: 0, col: 1 });
  assert.deepEqual(toPlain(leftOf('e')), { row: -1, col: 0 });
  assert.deepEqual(toPlain(leftOf('w')), { row: 1, col: 0 });

  const point = run('trafficSignalLogicalPoint')({ row: 3, col: 2, travel: 'n' }, { forward: 0.4, left: 0.42 });
  assert.equal(point.row, 3 - 0.4, 'pushed forward towards the junction');
  assert.equal(point.col, 2 - 0.42, 'pushed to the left kerb');
});

test('the pole faces against the visual direction of travel and follows map rotation', () => {
  const run = createContext();
  const facing = run('trafficSignalFacing');
  assert.equal(facing({ travel: 'n' }, 0), 'sw', 'traffic heading NE on screen meets a SW-facing head');
  assert.equal(facing({ travel: 's' }, 0), 'ne');
  assert.equal(facing({ travel: 'e' }, 0), 'nw');
  assert.equal(facing({ travel: 'w' }, 0), 'se');
  // A quarter turn of the map rotates the visual travel, so the same pole needs different art.
  assert.equal(facing({ travel: 'n' }, 1), 'nw');
  assert.equal(facing({ travel: 'n' }, 2), 'ne');
  assert.equal(facing({ travel: 'n' }, 3), 'se');
  const facings = run('TRAFFIC_SIGNAL_FACINGS');
  ['n', 'e', 's', 'w'].forEach((travel) => {
    for (let rotation = 0; rotation < 4; rotation++) assert.ok(facings.includes(facing({ travel }, rotation)));
  });
});

test('every state texture exists on disk and the bake sources stay out of Models', () => {
  const run = createContext();
  const files = toPlain(run('TRAFFIC_SIGNAL_TEXTURE_FILES'));
  assert.equal(Object.keys(files).length, 14, '6 SW + 4 SE + 3 NW + 1 NE');
  Object.entries(files).forEach(([key, file]) => {
    assert.ok(key.startsWith('traffic_signal_'), key);
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} exists`);
  });
  ['SW', 'SE', 'NW'].forEach((facing) => {
    assert.ok(!fs.existsSync(path.join(ROOT, `Models/trafficLight/trafficLight_${facing}.png`)), `${facing} all-lit source is not shipped`);
    assert.ok(fs.existsSync(path.join(ROOT, `scripts/source-art/trafficLight_${facing}.png`)), `${facing} source kept for baking`);
  });
  assert.ok(!fs.existsSync(path.join(ROOT, 'Models/trafficLight/trafficLight_sheet.png')), 'the source sheet lives under scripts/source-art');

  // Texture keys per facing and phase: only combinations that were baked.
  const key = run('trafficSignalTextureKey');
  assert.equal(key('sw', { vehicle: 'red', ped: 'green' }), 'traffic_signal_sw__r_pg');
  assert.equal(key('sw', { vehicle: 'green', ped: 'red' }), 'traffic_signal_sw__g_pr');
  assert.equal(key('se', { vehicle: 'redAmber', ped: 'red' }), 'traffic_signal_se__ra');
  assert.equal(key('nw', { vehicle: 'red', ped: 'off' }), 'traffic_signal_nw__px');
  assert.equal(key('ne', { vehicle: 'green', ped: 'red' }), 'traffic_signal_ne');
  assert.equal(key('sw', null), 'traffic_signal_sw__r_pr', 'no phase yet reads as all-red');
  const phases = [
    { vehicle: 'red', ped: 'green' }, { vehicle: 'red', ped: 'off' }, { vehicle: 'red', ped: 'red' },
    { vehicle: 'redAmber', ped: 'red' }, { vehicle: 'green', ped: 'red' }, { vehicle: 'amber', ped: 'red' },
  ];
  ['sw', 'se', 'nw', 'ne'].forEach((facing) => phases.forEach((phase) => {
    assert.ok(files[key(facing, phase)], `${facing} ${phase.vehicle}/${phase.ped} has a texture`);
  }));
});

test('a cross junction alternates two equal stages in the Hong Kong sequence', () => {
  const run = createContext();
  const timing = toPlain(run('TRAFFIC_SIGNAL_TIMING'));
  const junction = run('describeTrafficSignalJunction')(0, 0, 'road_cross');
  const phase = run('getTrafficSignalPhase');
  assert.equal(junction.cycleMs, 2 * (timing.redAmberMs + timing.crossGreenMs + timing.amberMs + timing.allRedMs));
  assert.equal(junction.offsetMs, 0, 'junction 0:0 starts the cycle at clock 0');
  const at = (ms, arm) => phase(junction, arm, ms);
  // Stage 1 = {n, s}: red+amber, green, amber, all-red; {e, w} red throughout.
  assert.equal(at(0, 'n').vehicle, 'redAmber');
  assert.equal(at(timing.redAmberMs, 'n').vehicle, 'green');
  assert.equal(at(timing.redAmberMs + timing.crossGreenMs - 1, 's').vehicle, 'green');
  assert.equal(at(timing.redAmberMs + timing.crossGreenMs, 'n').vehicle, 'amber');
  assert.equal(at(timing.redAmberMs + timing.crossGreenMs + timing.amberMs, 'n').vehicle, 'red', 'all-red intergreen');
  [0, timing.redAmberMs, timing.redAmberMs + timing.crossGreenMs].forEach((ms) => {
    assert.equal(at(ms, 'e').vehicle, 'red');
    assert.equal(at(ms, 'w').vehicle, 'red');
  });
  // Stage 2 = {e, w}.
  const stage2 = junction.starts[1];
  assert.equal(at(stage2, 'e').vehicle, 'redAmber');
  assert.equal(at(stage2 + timing.redAmberMs, 'w').vehicle, 'green');
  assert.equal(at(stage2 + timing.redAmberMs, 'n').vehicle, 'red');
  // Wraps around.
  assert.equal(at(junction.cycleMs, 'n').vehicle, 'redAmber');
  assert.equal(at(-1, 'n').vehicle, 'red', 'negative clock wraps into the last all-red');
  // Pedestrians: green man on the red arms while the other stage is green, flashing at the end.
  const greenStart = timing.redAmberMs;
  assert.equal(at(greenStart, 'e').ped, 'green');
  assert.equal(at(greenStart, 'n').ped, 'red', 'the arm with green shows a red man');
  const flashStart = greenStart + timing.crossGreenMs - timing.pedFlashMs;
  assert.equal(at(flashStart - 1, 'e').ped, 'green');
  assert.equal(at(flashStart + 1, 'e').ped, 'off', 'flash gap first');
  assert.equal(at(flashStart + timing.pedFlashPeriodMs + 1, 'e').ped, 'green');
  assert.equal(at(greenStart + timing.crossGreenMs, 'e').ped, 'red', 'red man from amber on');
  assert.equal(at(0, 'e').ped, 'red', 'red man during red+amber');
  assert.equal(phase(junction, 'x', 0), null, 'not an arm');
});

test('a T junction favours its through road and never signals the missing arm', () => {
  const run = createContext();
  const timing = toPlain(run('TRAFFIC_SIGNAL_TIMING'));
  const describe = run('describeTrafficSignalJunction');
  const phase = run('getTrafficSignalPhase');
  // road_t_n: arms n, e, w -> through {e, w}, side {n}.
  const tee = describe(3, 4, 'road_t_n');
  assert.deepEqual(toPlain(tee.groups), [['e', 'w'], ['n']]);
  assert.deepEqual(toPlain(tee.greens), [timing.teeThroughGreenMs, timing.teeSideGreenMs]);
  assert.equal(phase(tee, 's', 0), null, 'the missing arm has no signal');
  const clock = (ms) => ms - tee.offsetMs;
  assert.equal(phase(tee, 'e', clock(timing.redAmberMs)).vehicle, 'green');
  assert.equal(phase(tee, 'w', clock(timing.redAmberMs)).vehicle, 'green');
  assert.equal(phase(tee, 'n', clock(timing.redAmberMs)).vehicle, 'red');
  assert.equal(phase(tee, 'n', clock(timing.redAmberMs)).ped, 'green');
  assert.equal(phase(tee, 'n', clock(tee.starts[1] + timing.redAmberMs)).vehicle, 'green');
  assert.equal(phase(tee, 'e', clock(tee.starts[1] + timing.redAmberMs)).ped, 'green');
  // road_t_e (n, e, s): through {n, s}, side {e}.
  assert.deepEqual(toPlain(describe(0, 0, 'road_t_e').groups), [['n', 's'], ['e']]);
  assert.equal(describe(0, 0, 'road_straight_v'), null);
  // Offsets differ between neighbouring junctions along a road (green wave, not lockstep).
  assert.notEqual(describe(3, 5, 'road_t_n').offsetMs, tee.offsetMs);
  assert.ok(tee.offsetMs >= 0 && tee.offsetMs < tee.cycleMs);
});

test('a vehicle waits at the stop line on red, drives through on green, and commits on late amber', () => {
  const run = createContext();
  const timing = toPlain(run('TRAFFIC_SIGNAL_TIMING'));
  const stop = run('TRAFFIC_SIGNAL_STOP_PROGRESS');
  const commit = run('TRAFFIC_SIGNAL_AMBER_COMMIT_TILES');
  const hold = run('getTrafficSignalHoldProgress');
  // Stop lines by vehicle length: a car at the constant (8 m short of the junction mouth at 0.5),
  // a minibus a little further back, a bus at the approach tile's centre, never below the floor.
  const stopFor = run('trafficSignalStopProgressFor');
  assert.equal(stopFor(0.55), stop, 'car');
  assert.equal(stopFor(undefined), stopFor(1), 'unknown length is treated as bus-length (the safe end)');
  assert.ok(stopFor(0.72) < stop && stopFor(0.72) > stopFor(1), 'minibus between car and bus');
  assert.ok(Math.abs(stopFor(1) - Math.max(run('TRAFFIC_SIGNAL_STOP_MIN_PROGRESS'), stop - run('TRAFFIC_SIGNAL_STOP_LONG_VEHICLE_SETBACK'))) < 1e-9, 'bus');
  assert.ok(stop <= 0.5 - 0.4 + 1e-9, 'a car waits at least 8 m (0.4 tile) short of the junction edge');
  const junction = run('describeTrafficSignalJunction')(5, 5, 'road_cross');
  const scene = { trafficSignalJunctions: new Map([['5:5', junction]]), trafficSignalClockMs: 0 };
  const car = 0.55;
  const junctionTile = { row: 5, col: 5 };
  const fromNorth = { row: 4, col: 5 }; // arm n (stage 1)
  const fromWest = { row: 5, col: 4 };  // arm w (stage 2)
  const clock = (ms) => ms - junction.offsetMs; // cycle-relative time for this junction

  scene.trafficSignalClockMs = clock(timing.redAmberMs + 1000); // stage 1 green
  assert.equal(hold(scene, fromNorth, junctionTile, 0.1, car), null, 'green: no hold');
  assert.equal(hold(scene, fromWest, junctionTile, 0.1, car), stop, 'red: hold at the stop line');
  assert.equal(hold(scene, fromWest, junctionTile, stop, car), stop, 'a vehicle already waiting keeps waiting');
  assert.equal(hold(scene, fromWest, junctionTile, stop + 0.05, car), null, 'past the line: already in the junction');
  assert.equal(hold(scene, fromWest, junctionTile, 0.01, 1), stopFor(1), 'a bus holds at its own, earlier line');
  assert.equal(hold(scene, fromWest, junctionTile, stop - 0.01, 1), null, 'a bus already past its line rolls on');
  scene.trafficSignalClockMs = clock(0); // stage 1 red+amber
  assert.equal(hold(scene, fromNorth, junctionTile, 0.1, car), stop, 'red+amber still holds');
  scene.trafficSignalClockMs = clock(timing.redAmberMs + timing.crossGreenMs + 500); // stage 1 amber
  assert.equal(hold(scene, fromNorth, junctionTile, stop - commit - 0.05, car), stop, 'far from the line on amber: stop');
  assert.equal(hold(scene, fromNorth, junctionTile, stop - commit + 0.05, car), null, 'close to the line on amber: go');
  // Legs not ending on a signalised junction, and junction-less scenes, are never held.
  assert.equal(hold(scene, { row: 8, col: 8 }, { row: 8, col: 9 }, 0.1, car), null);
  assert.equal(hold({ trafficSignalJunctions: new Map() }, fromWest, junctionTile, 0.1, car), null);
  assert.equal(hold(null, fromWest, junctionTile, 0.1, car), null);
});

function createIceCreamSignalContext() {
  const run = createContext();
  run(source('traffic-visuals.js'));
  run(`
    // Keep movement and signals real; replace only sprite/audio rendering.
    setIceCreamTruckPosition = (event, position) => { event.lastPosition = position; };
    const junction = describeTrafficSignalJunction(5, 5, 'road_cross');
    const scene = { trafficSignalJunctions: new Map([['5:5', junction]]) };
    const state = { vehicles: [] };
    function signalTime(ms) { scene.trafficSignalClockMs = ms - junction.offsetMs; }
    function roadLeg(col, kind = 'road') {
      return {
        kind, current: { row: 5, col }, next: { row: 5, col: col + 1 },
        leg: {
          start: { x: col, y: 0, depthY: 0 },
          control: { x: col + 0.5, y: 0, depthY: 0 },
          end: { x: col + 1, y: 0, depthY: 0 },
        },
      };
    }
    function truck(legs, progress = 0.3, phase = 'drivingToTarget') {
      return { model: { speedFactor: 0.85, headwayFactor: 0.62 },
        movementLegs: legs, movementIndex: 0, progress, phase };
    }
  `);
  return run;
}

test('ice cream trucks obey red, red-amber and green on roads and parking approaches/departures', () => {
  const run = createIceCreamSignalContext();
  const stop = run('trafficSignalStopProgressFor()'); // no length given: the bus-length line
  for (const kind of ['road', 'parkingApproach', 'parkingDeparture']) {
    const result = toPlain(run(`(() => {
      const event = truck([roadLeg(4, '${kind}')], 0.005, '${kind === 'parkingDeparture' ? 'leaving' : 'drivingToTarget'}');
      signalTime(TRAFFIC_SIGNAL_TIMING.redAmberMs + 1000);
      for (let i = 0; i < 100; i++) advanceIceCreamMovement(scene, state, event, 50, 1);
      const red = event.progress;
      signalTime(junction.starts[1]);
      advanceIceCreamMovement(scene, state, event, 50, 1);
      const redAmber = event.progress;
      signalTime(junction.starts[1] + TRAFFIC_SIGNAL_TIMING.redAmberMs + 1000);
      advanceIceCreamMovement(scene, state, event, 50, 1);
      return { red, redAmber, green: event.progress, index: event.movementIndex };
    })()`));
    assert.equal(result.red, stop, kind);
    assert.equal(result.redAmber, stop, kind);
    assert.ok(result.green > stop, kind);
    assert.equal(result.index, 0);
  }
});

test('ice cream carry-over cannot skip a red on the next leg; committed trucks can clear the junction', () => {
  const run = createIceCreamSignalContext();
  const result = toPlain(run(`(() => {
    signalTime(TRAFFIC_SIGNAL_TIMING.redAmberMs + 1000);
    const event = truck([roadLeg(3), roadLeg(4), roadLeg(5)], 0.9);
    advanceIceCreamMovement(scene, state, event, 50, 20);
    const stopped = { index: event.movementIndex, progress: event.progress };
    const committed = truck([roadLeg(4), roadLeg(5)], 0.9);
    advanceIceCreamMovement(scene, state, committed, 50, 20);
    return { stopped, cleared: committed.movementIndex };
  })()`));
  assert.equal(result.stopped.index, 1);
  assert.equal(result.stopped.progress, run('trafficSignalStopProgressFor()'));
  assert.equal(result.cleared, 1);
});

test('ice cream trucks queue behind managed buses and finish at the final movement leg', () => {
  const run = createIceCreamSignalContext();
  const result = toPlain(run(`(() => {
    const event = truck([roadLeg(3), roadLeg(4)], 0.9, 'leaving');
    scene.trafficSignalJunctions.clear();
    scene.transportVisualState = { vehicles: [{ ...roadLeg(3), progress: 0.95,
      renderedProgress: 0.95, model: { headwayFactor: 1 } }] };
    advanceIceCreamMovement(scene, state, event, 50, 1);
    const queued = event.progress;
    scene.transportVisualState.vehicles = [];
    advanceIceCreamMovement(scene, state, event, 50, 40);
    return { queued, phase: event.phase, x: event.lastPosition.x };
  })()`));
  assert.equal(result.queued, 0.9);
  assert.equal(result.phase, 'finished');
  assert.equal(result.x, 5);
});

test('the signal clock follows the traffic speed multiplier and only visible poles change texture', () => {
  const run = createContext();
  run('globalThis.getVehicleVisualSpeedMultiplier = () => 2');
  const timing = toPlain(run('TRAFFIC_SIGNAL_TIMING'));
  const result = toPlain(run(`(() => {
    const junction = describeTrafficSignalJunction(0, 0, 'road_cross');
    const swaps = [];
    const makeSprite = (x, y, travel) => ({
      x, y, trafficSignalFacing: 'sw', texture: { key: 'traffic_signal_sw__r_pr' },
      trafficSignal: { row: 0, col: 0, travel, junctionRow: 0, junctionCol: 0 },
      setTexture(key) { this.texture = { key }; swaps.push(key); }, setOrigin() {}, setScale() {},
    });
    const inView = makeSprite(10, 10, 's');      // arm n
    const offScreen = makeSprite(5000, 5000, 's');
    const scene = {
      trafficSignalSprites: new Map([['a', inView], ['b', offScreen]]),
      trafficSignalJunctions: new Map([['0:0', junction]]),
      cameras: { main: { worldView: { x: 0, y: 0, right: 100, bottom: 100 } } },
      textures: { exists: () => true, get: () => ({ getSourceImage: () => ({ width: 256, height: 512 }) }) },
    };
    // 16 ms frames at 2x: the clock gains 32 ms per frame; the texture pass runs at most every 100 ms.
    updateTrafficSignalVisuals(scene, 0, 16);
    const afterFirst = { clock: scene.trafficSignalClockMs, key: inView.texture.key };
    let time = 0;
    while (scene.trafficSignalClockMs < ${timing.redAmberMs} + 500) { time += 16; updateTrafficSignalVisuals(scene, time, 16); }
    return { afterFirst, clock: scene.trafficSignalClockMs, key: inView.texture.key, offScreenKey: offScreen.texture.key, swaps };
  })()`));
  assert.equal(result.afterFirst.clock, 32);
  assert.equal(result.afterFirst.key, 'traffic_signal_sw__ra_pr', 'first pass shows red+amber at clock 0');
  assert.equal(result.key, 'traffic_signal_sw__g_pr', 'green once the clock passed red+amber');
  assert.equal(result.offScreenKey, 'traffic_signal_sw__r_pr', 'off-screen poles are left alone');
  assert.deepEqual(result.swaps, ['traffic_signal_sw__ra_pr', 'traffic_signal_sw__g_pr'], 'a texture is only swapped when the phase changes');

  run('globalThis.getVehicleVisualSpeedMultiplier = () => 0');
  const frozen = toPlain(run(`(() => {
    const scene = { trafficSignalSprites: new Map([['a', { x: 0, y: 0 }]]), trafficSignalClockMs: 1234, trafficSignalJunctions: new Map(), cameras: { main: { worldView: { x: 0, y: 0, right: 1, bottom: 1 } } }, textures: { exists: () => false } };
    updateTrafficSignalVisuals(scene, 0, 500);
    return scene.trafficSignalClockMs;
  })()`));
  assert.equal(frozen, 1234, 'paused: the clock does not move');
});

test('night glows sit on the lit lamps the camera can see, follow the lights toggle, and reuse one pool', () => {
  const run = createContext();
  const lit = run('trafficSignalLitLamps');
  assert.deepEqual(toPlain(lit('sw', { vehicle: 'redAmber', ped: 'red' })), ['red', 'amber', 'pedRed']);
  assert.deepEqual(toPlain(lit('sw', { vehicle: 'red', ped: 'green' })), ['red', 'pedGreen']);
  assert.deepEqual(toPlain(lit('sw', { vehicle: 'red', ped: 'off' })), ['red'], 'a flashing gap has no ped glow');
  assert.deepEqual(toPlain(lit('se', { vehicle: 'green', ped: 'green' })), ['green'], 'SE shows no pedestrian head');
  assert.deepEqual(toPlain(lit('nw', { vehicle: 'green', ped: 'red' })), ['pedRed'], 'NW shows no vehicle head');
  assert.deepEqual(toPlain(lit('ne', { vehicle: 'green', ped: 'red' })), [], 'NE shows only backs');
  assert.deepEqual(toPlain(lit('sw', null)), []);

  const strength = run('trafficSignalGlowStrength');
  assert.equal(strength({ trafficLightStrength: 0.6 }), 0.6);
  assert.equal(strength({ trafficLightStrength: 0 }), 0, 'daylight');
  assert.equal(strength({}), 0);
  run('globalThis.isBuildingLightsEnabled = () => false');
  assert.equal(strength({ trafficLightStrength: 0.6 }), 0, 'the View-menu lights toggle switches the halos off');
  run('globalThis.isBuildingLightsEnabled = () => true');
  run('globalThis.isAttractLightsSuppressed = () => true');
  assert.equal(strength({ trafficLightStrength: 0.6 }), 0, 'attract mode lights-off also drops them');
  run('globalThis.isAttractLightsSuppressed = () => false');

  run('globalThis.getVehicleVisualSpeedMultiplier = () => 1');
  const result = toPlain(run(`(() => {
    const junction = describeTrafficSignalJunction(0, 0, 'road_cross');
    const created = [];
    const makeGlow = () => {
      const g = { visible: true, calls: [] };
      ['setOrigin', 'setBlendMode', 'setMask', 'setPosition', 'setScale', 'setTint', 'setAlpha', 'setDepth'].forEach((m) => { g[m] = (...a) => { g[m + 'Args'] = a; return g; }; });
      g.setVisible = (v) => { g.visible = v; return g; };
      g.destroy = () => { g.destroyed = true; };
      created.push(g);
      return g;
    };
    const makePole = (x, y, travel, facing) => ({
      x, y, depth: 500, trafficSignalFacing: facing, texture: { key: 'traffic_signal_' + facing + '__r_pr' },
      trafficSignal: { row: 0, col: 0, travel, junctionRow: 0, junctionCol: 0 },
      setTexture(key) { this.texture = { key }; }, setOrigin() {}, setScale() {}, destroy() {},
    });
    const swPole = makePole(10, 10, 's', 'sw');   // arm n: stage 1
    const nePole = makePole(20, 20, 'n', 'ne');   // backs only
    const farPole = makePole(9000, 9000, 'e', 'sw');
    const scene = {
      trafficSignalSprites: new Map([['a', swPole], ['b', nePole], ['c', farPole]]),
      trafficSignalJunctions: new Map([['0:0', junction]]),
      trafficSignalClockMs: ${'TRAFFIC_SIGNAL_TIMING'}.redAmberMs + 1000, // stage 1 green
      trafficLightStrength: 0.5,
      cameras: { main: { worldView: { x: 0, y: 0, right: 100, bottom: 100 } } },
      textures: { exists: () => true, get: () => ({ getSourceImage: () => ({ width: 128, height: 256 }) }) },
      make: { graphics: () => ({ fillStyle() {}, fillCircle() {}, generateTexture() {}, destroy() {} }) },
      add: { image: () => makeGlow() },
      worldMask: {},
    };
    updateTrafficSignalVisuals(scene, 1000, 16);
    const night = { created: created.length, visible: created.filter((g) => g.visible).length,
      tint: created[0].setTintArgs, alpha: created[0].setAlphaArgs, pos: created[0].setPositionArgs, depth: created[0].setDepthArgs };
    // Stage 1 red+amber for the SW pole (arm n): two vehicle lamps + red man = 3 glows.
    scene.trafficSignalClockMs = 0;
    updateTrafficSignalVisuals(scene, 1200, 16);
    const redAmber = { created: created.length, visible: created.filter((g) => g.visible).length };
    // Daylight: the same pool is hidden, nothing destroyed.
    scene.trafficLightStrength = 0;
    updateTrafficSignalVisuals(scene, 1400, 16);
    const day = { created: created.length, visible: created.filter((g) => g.visible).length, destroyed: created.filter((g) => g.destroyed).length };
    clearTrafficSignalSprites(scene);
    return { night, redAmber, day, afterClear: { destroyed: created.filter((g) => g.destroyed).length, pool: scene.trafficSignalGlowPool.length } };
  })()`));
  // Stage 1 green on the SW pole: green lamp + red man; the NE pole and the far pole add nothing.
  assert.equal(result.night.created, 2);
  assert.equal(result.night.visible, 2);
  assert.deepEqual(result.night.tint, [0x5cff8a], 'green halo');
  assert.ok(Math.abs(result.night.alpha[0] - 0.5 * 0.85) < 1e-9, 'alpha follows the night strength');
  const scale = run('TRAFFIC_SIGNAL_SCALE');
  assert.ok(Math.abs(result.night.pos[0] - (10 + -84 * scale)) < 1e-9 && Math.abs(result.night.pos[1] - (10 + -315 * scale)) < 1e-9, 'halo sits on the green lens');
  assert.deepEqual(result.night.depth, [500.1], 'drawn just above its pole');
  assert.equal(result.redAmber.created, 3, 'red+amber adds one more glow to the pool');
  assert.equal(result.redAmber.visible, 3);
  assert.deepEqual(result.day, { created: 3, visible: 0, destroyed: 0 });
  assert.deepEqual(result.afterClear, { destroyed: 3, pool: 0 });
});

test('ambient traffic queues across legs behind a stopped leader but not behind oncoming traffic', () => {
  const { buildTrafficLegBuckets, trafficVehicleHasBlockingLeader, TRAFFIC_VISUAL_CONFIG } = require('../traffic-visuals');
  const model = { headwayFactor: 1 };
  const headway = TRAFFIC_VISUAL_CONFIG.minimumHeadwayTiles;
  const leader = { model, current: { row: 1, col: 1 }, next: { row: 1, col: 2 }, progress: 0.34 }; // waiting at a stop line
  const follower = { model, current: { row: 1, col: 0 }, next: { row: 1, col: 1 }, progress: 0.9 };
  const farFollower = { model, current: { row: 1, col: 0 }, next: { row: 1, col: 1 }, progress: 1 - headway - 0.34 - 0.05 };
  const oncoming = { model, current: { row: 1, col: 1 }, next: { row: 1, col: 0 }, progress: 0.05 };
  const buckets = buildTrafficLegBuckets([leader, follower, farFollower, oncoming]);
  assert.equal(trafficVehicleHasBlockingLeader(follower, buckets), true, 'gap 0.1 + 0.34 < headway');
  assert.equal(trafficVehicleHasBlockingLeader(farFollower, buckets), false, 'far enough back');
  const onlyOncoming = buildTrafficLegBuckets([follower, oncoming]);
  assert.equal(trafficVehicleHasBlockingLeader(follower, onlyOncoming), false, 'a vehicle coming the other way is not a leader');
  // Same-leg following is unchanged.
  const sameLeg = { model, current: { row: 1, col: 1 }, next: { row: 1, col: 2 }, progress: 0.1 };
  assert.equal(trafficVehicleHasBlockingLeader(sameLeg, buildTrafficLegBuckets([leader, sameLeg])), true);
});

test('getPropTextureAnchor maps a source-pixel anchor through the release trim/pad/resize', () => {
  const run = createContext();
  const anchor = run('getPropTextureAnchor');
  // Unstaged (dev source art): plain proportional origin.
  assert.deepEqual(toPlain(anchor('Models/trafficLight/trafficLight_SW.png', 160, 600, { width: 320, height: 600 })),
    { originX: 0.5, originY: 1, scaleMultiplier: 1 });

  // Staged like the bus stop LL art: 1024 source resized to 512, trimmed, padded to a power of two.
  run(`modelAssetManifest = { entries: { 'Models/busStop/busStop_LL.png': {
    sourceWidth: 1024, sourceHeight: 1024, maxDimension: 512,
    trim: { left: 192, top: 308, width: 128, height: 176 },
    padding: { left: 0, top: 80 },
    outputWidth: 128, outputHeight: 256,
  } } }`);
  const staged = anchor('Models/busStop/busStop_LL.png', 512, 1024, { width: 128, height: 256 });
  // 512 → 256 in the resized image, minus trim.left 192 = 64 → origin 0.5 of the 128 output.
  assert.equal(staged.originX, 0.5);
  // 1024 → 512, minus trim.top 308 = 204, plus padding.top 80 = 284 → 284 / 256.
  assert.equal(staged.originY, 284 / 256);
  assert.equal(staged.scaleMultiplier, 2, 'the sprite scale doubles to undo the 512 resize');

  // A texture whose size does not match the manifest entry (source art with a stale manifest)
  // falls back to the unstaged reading rather than mis-anchoring.
  const mismatch = toPlain(anchor('Models/busStop/busStop_LL.png', 512, 1024, { width: 1024, height: 1024 }));
  assert.deepEqual(mismatch, { originX: 0.5, originY: 1, scaleMultiplier: 1 });
});

test('calibrator overrides win over the shipped offsets and scale, and reset restores them', () => {
  const run = createContext({ withCalibrator: true });
  run('setVisualRouteCalibrationTestModeEnabled(true)');
  assert.equal(run(`getTrafficSignalCalibrationOffset('sw')`), null);
  assert.equal(run('getTrafficSignalCalibrationScale()'), null);
  assert.equal(run('isTrafficSignalPickerActive()'), false);

  // Nudging needs a selected facing; select by wiring a fake sprite drag. The sprite sits at
  // its geometric anchor plus the shipped nudge, so a drag of (+3, -2) lands 3 right and 2 up
  // of that shipped value.
  const shippedNe = toPlain(run('TRAFFIC_SIGNAL_ANCHOR_OFFSETS.ne'));
  run(`trafficSignalCalibratorTestApi.setTrafficSignalPickerActive(true)`);
  assert.equal(run('isTrafficSignalPickerActive()'), true);
  run(`(() => {
    const listeners = {};
    const sprite = {
      x: 100, y: 200, trafficSignalFacing: 'ne',
      setInteractive() {}, disableInteractive() {},
      on(name, fn) { listeners[name] = fn; }, off() {},
    };
    const scene = { input: { setDraggable() {} }, trafficSignalSprites: new Map([['a', sprite]]) };
    trafficSignalCalibratorTestApi.makeTrafficSignalSpriteDraggable(scene, sprite);
    listeners.dragstart();
    listeners.drag(null, 103, 198);
    listeners.dragend();
  })()`);
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);
  let ne = toPlain(run(`getTrafficSignalCalibrationOffset('ne')`));
  near(ne.dx, shippedNe.dx + 3);
  near(ne.dy, shippedNe.dy - 2);
  run(`trafficSignalCalibratorTestApi.nudgeTrafficSignalCalibration(-1, 5)`);
  ne = toPlain(run(`getTrafficSignalCalibrationOffset('ne')`));
  near(ne.dx, shippedNe.dx + 2);
  near(ne.dy, shippedNe.dy + 3);
  assert.equal(run(`getTrafficSignalCalibrationOffset('sw')`), null, 'other facings untouched');

  run(`trafficSignalCalibratorTestApi.adjustTrafficSignalCalibrationScale(0.01)`);
  const shipped = run('TRAFFIC_SIGNAL_SCALE');
  assert.ok(Math.abs(run('getTrafficSignalCalibrationScale()') - (shipped + 0.01)) < 1e-9);

  const record = toPlain(run('trafficSignalCalibratorTestApi.buildTrafficSignalCalibrationRecord()'));
  assert.equal(record.kind, 'traffic-signal-anchor-offset');
  assert.deepEqual(Object.keys(record.facings).sort(), ['ne', 'nw', 'se', 'sw']);
  near(record.facings.ne.dx, Math.round((shippedNe.dx + 2) * 1000) / 1000);
  near(record.facings.ne.dy, Math.round((shippedNe.dy + 3) * 1000) / 1000);
  assert.deepEqual(record.facings.sw, toPlain(run('TRAFFIC_SIGNAL_ANCHOR_OFFSETS.sw')), 'untouched facings report the shipped value');
  assert.deepEqual(record.logicalInset, toPlain(run('TRAFFIC_SIGNAL_LOGICAL_INSET')));

  run('teardownTrafficSignalCalibrator()');
  assert.equal(run('isTrafficSignalPickerActive()'), false, 'teardown drops the input capture');
});

test('the calibrator refuses to open outside test mode', () => {
  const run = createContext({ withCalibrator: true });
  assert.equal(run('toggleTrafficSignalCalibrator({ trafficSignalSprites: new Map() })'), false);
  assert.equal(run('isTrafficSignalCalibrationActive()'), false);
});

test('main.js rebuilds the poles with the road tiles and index.html loads the modules', () => {
  const refreshTileArea = mainSource.slice(mainSource.indexOf('\nfunction refreshTileArea('));
  const refreshTileAreaBody = refreshTileArea.slice(0, refreshTileArea.indexOf('\n}\n'));
  assert.ok(refreshTileAreaBody.includes('scheduleTrafficSignalRefresh(scene)'), 'road edits schedule a signal refresh');
  const refreshAllTiles = mainSource.slice(mainSource.indexOf('\nfunction refreshAllTiles('));
  const refreshAllTilesBody = refreshAllTiles.slice(0, refreshAllTiles.indexOf('\n}\n'));
  assert.ok(refreshAllTilesBody.includes('rebuildTrafficSignalSprites(scene)'), 'full rebuilds recreate every pole');
  const positionAllTiles = mainSource.slice(mainSource.indexOf('\nfunction positionAllTiles('));
  const positionAllTilesBody = positionAllTiles.slice(0, positionAllTiles.indexOf('\n}\n'));
  assert.ok(positionAllTilesBody.includes('refreshAllTrafficSignalSprites(scene)'), 'a window resize (new map offsets) re-anchors every pole');
  assert.ok(mainSource.includes('TRAFFIC_SIGNAL_TEXTURE_FILES'), 'preload registers every state texture');
  assert.ok(mainSource.includes('updateTrafficSignalVisuals(this, time, delta)'), 'the scene update advances the signals');
  const trafficSource = source('traffic-visuals.js');
  assert.ok(trafficSource.includes('getTrafficSignalHoldProgress(scene, vehicle.current, vehicle.next, vehicle.progress, vehicle.model?.headwayFactor)'), 'ambient traffic asks the signals before advancing, by vehicle length');

  const html = source('index.html');
  const factory = html.indexOf('<script src="street-prop-calibrator.js"></script>');
  const signals = html.indexOf('<script src="traffic-signals.js"></script>');
  const calibrator = html.indexOf('<script src="traffic-signal-calibrator.js"></script>');
  const main = html.indexOf('<script src="main.js"></script>');
  assert.ok(factory >= 0 && signals > factory && calibrator > signals && main > calibrator, 'calibrator factory, signals and their calibrator load before main.js');

  const panel = source('visual-route-calibrator.js');
  assert.ok(panel.includes('toggleTrafficSignalCalibrator(scene)'), 'the performance panel opens the calibrator');
  assert.ok(panel.includes('teardownTrafficSignalCalibrator()'), 'leaving test mode closes it');
  assert.ok(panel.includes('isTrafficSignalPickerActive()'), 'the picker captures tool input');
});
