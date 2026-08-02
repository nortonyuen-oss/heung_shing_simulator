const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');
const calibratorSource = source('visual-route-calibrator.js');
const airportSource = source('airport-route-calibrator.js');
const htmlSource = source('index.html');

// airport-route-calibrator.js deliberately reuses generic, non-vessel-specific
// helpers (rounding, storage lookup) declared in visual-route-calibrator.js as
// plain browser globals. Under `node --test` those two files are separate
// CommonJS modules with no shared global scope, so — matching how every other
// cross-file pure-logic test in this suite handles it (see
// test/residential-wealth.test.js, test/power-shortage-demand.test.js) — load
// both sources into one vm context to reproduce the browser's shared-<script>
// global scope.
function createAirportCalibratorContext() {
  const context = vm.createContext({});
  vm.runInContext(calibratorSource, context, { filename: 'visual-route-calibrator.js' });
  vm.runInContext(airportSource, context, { filename: 'airport-route-calibrator.js' });
  return context;
}

// Plain objects returned from vm.runInContext belong to that sandbox's own
// realm (its own Object.prototype), so assert.deepEqual against an
// outer-realm literal fails on prototype identity even when every field
// matches. Round-tripping through JSON normalizes it back into this realm —
// fine here since every value under test is already plain JSON data.
function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertClose(actual, expected, message = '') {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message} expected ${expected}, got ${actual}`);
}

test('default layout gives all 14 points a finite, non-degenerate starting position', () => {
  const context = createAirportCalibratorContext();
  const points = vm.runInContext(
    'getDefaultAirportRoutePoints({ row: 0, col: 0, footprintCols: 12, footprintRows: 12 })',
    context,
  );
  const keys = vm.runInContext('AIRPORT_ROUTE_POINT_DEFS.map((def) => def.key)', context);
  assert.deepEqual(Object.keys(points).sort(), [...keys].sort());
  // approachSpawn/departureDespawn are deliberately out in open sky, outside
  // the footprint - every other point stays within it.
  const groundKeys = [...keys].filter((key) => key !== 'approachSpawn' && key !== 'departureDespawn');
  groundKeys.forEach((key) => {
    assert.ok(Number.isFinite(points[key].dRow), `${key}.dRow`);
    assert.ok(Number.isFinite(points[key].dCol), `${key}.dCol`);
    assert.ok(points[key].dRow >= 0 && points[key].dRow <= 11, `${key}.dRow in range`);
    assert.ok(points[key].dCol >= 0 && points[key].dCol <= 11, `${key}.dCol in range`);
  });
  [points.approachSpawn, points.departureDespawn].forEach((point, i) => {
    assert.ok(Number.isFinite(point.dRow), `sky point ${i}.dRow`);
    assert.ok(Number.isFinite(point.dCol), `sky point ${i}.dCol`);
  });
  assert.notEqual(points.landStart.dCol, points.landEnd.dCol, 'landing runway must not be a single point');
  assert.notEqual(points.takeoffStart.dCol, points.liftoff.dCol, 'takeoff runway must not be a single point');
});

test('the point list is the L0-L3/T0-T3 arc plus 6 gates', () => {
  const context = createAirportCalibratorContext();
  const short = vm.runInContext('AIRPORT_ROUTE_POINT_DEFS.map((def) => def.short)', context);
  assert.deepEqual(
    toPlain(short),
    ['L0', 'L1', 'L2', 'L3', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'T0', 'T1', 'T2', 'T3'],
  );
});

test('a marker\'s world position is pixel-identical to where the real aircraft renders for that logical point', () => {
  // Regression test: this used to reimplement isoToScreen + offsetX/Y by
  // hand, missing the vertical "surface" correction aircraft-visuals.js
  // applies (and the fixed-rotation/anchor projection from the rotation
  // fix) - so every calibrated point was visibly off from where the plane
  // actually landed/parked in real gameplay. Delegating straight to
  // getAircraftGroundPoint makes drift like that structurally impossible.
  const context = createAirportCalibratorContext();
  const calls = [];
  context.getAircraftGroundPoint = (scene, anchor, row, col) => {
    calls.push({ scene, anchor, row, col });
    return { x: 1234, y: 5678 };
  };
  context.testSession = { scene: { offsetX: 1, offsetY: 2 }, anchor: { row: 10, col: 20 } };
  const world = vm.runInContext('getAirportCalibrationWorldPoint(testSession, 15, 25)', context);
  assert.deepEqual(toPlain(world), { x: 1234, y: 5678 });
  assert.equal(calls.length, 1);
  assert.deepEqual(toPlain(calls[0].anchor), { row: 10, col: 20 });
  assert.equal(calls[0].row, 15);
  assert.equal(calls[0].col, 25);
});

test('a marker\'s screen position and its drag-back-to-logical conversion are exact inverses (round-trips through the surface offset)', () => {
  const context = createAirportCalibratorContext();
  // No getAircraftGroundPoint stub - exercises getAirportCalibrationWorldPoint's
  // own fallback formula, the same one getAirportCalibrationLogicalPoint must invert.
  context.isoToScreen = (col, row) => ({ x: (col - row) * 50, y: (col + row) * 25 });
  context.screenToIso = (x, y) => ({ x: (x / 50 + y / 25) / 2, y: (y / 25 - x / 50) / 2 });
  context.BUILDING_SURFACE_Y_OFFSET = 32;
  context.TILE_HEIGHT = 50;
  context.testSession = { scene: { offsetX: 400, offsetY: 300 }, anchor: null };

  const row = 12.5;
  const col = 34.25;
  context.testRow = row;
  context.testCol = col;
  const world = vm.runInContext('getAirportCalibrationWorldPoint(testSession, testRow, testCol)', context);
  context.testWorld = world;
  const logical = vm.runInContext(
    'getAirportCalibrationLogicalPoint(testSession.scene, testWorld.x, testWorld.y)',
    context,
  );
  assertClose(logical.row, row, 'row');
  assertClose(logical.col, col, 'col');
});

test('exported record captures absolute and anchor-relative coordinates for all 7 points', () => {
  const context = createAirportCalibratorContext();
  const session = {
    anchor: { row: 50, col: 60, footprintCols: 12, footprintRows: 12 },
    mapRotation: 2,
    points: {
      landStart: { row: 51, col: 61, direction: 'nw' },
      landEnd: { row: 51, col: 69 },
      gate1: { row: 55, col: 63, direction: 'not-a-real-direction' },
      gate2: { row: 55, col: 65, direction: 'sw' },
      gate3: { row: 55, col: 67 },
      takeoffStart: { row: 59, col: 69 },
      liftoff: { row: 59, col: 61 },
    },
  };
  context.testSession = session;
  const record = vm.runInContext(
    "buildAirportRouteCalibrationRecord(testSession, '2026-08-02T00:00:00.000Z')",
    context,
  );

  assert.equal(record.schemaVersion, 1);
  assert.equal(record.kind, 'airport-flight-route');
  assert.deepEqual(toPlain(record.airportAnchor), { row: 50, col: 60 });
  assert.equal(record.footprintCols, 12);
  assert.equal(record.footprintRows, 12);
  assert.equal(record.mapRotation, 2);
  assert.equal(record.recordedAt, '2026-08-02T00:00:00.000Z');
  assert.deepEqual(toPlain(record.points.landStart), { row: 51, col: 61, dRow: 1, dCol: 1, direction: 'nw' });
  assert.deepEqual(toPlain(record.points.landEnd), { row: 51, col: 69, dRow: 1, dCol: 9, direction: 'se' });
  assert.deepEqual(toPlain(record.points.gate1), { row: 55, col: 63, dRow: 5, dCol: 3, direction: 'se' });
  assert.deepEqual(toPlain(record.points.gate2), { row: 55, col: 65, dRow: 5, dCol: 5, direction: 'sw' });
  assert.deepEqual(toPlain(record.points.takeoffStart), { row: 59, col: 69, dRow: 9, dCol: 9, direction: 'se' });
  assert.deepEqual(toPlain(record.points.liftoff), { row: 59, col: 61, dRow: 9, dCol: 1, direction: 'se' });
});

test('missing anchor produces no record instead of a partially-garbage one', () => {
  const context = createAirportCalibratorContext();
  context.testSession = { anchor: null, points: {} };
  const record = vm.runInContext('buildAirportRouteCalibrationRecord(testSession)', context);
  assert.equal(record, null);
});

test('resolving points from a saved record reuses saved offsets and falls back per-point for missing ones', () => {
  const context = createAirportCalibratorContext();
  const anchor = { row: 0, col: 0, footprintCols: 12, footprintRows: 12 };
  context.testAnchor = anchor;
  context.savedRecord = {
    points: {
      landStart: { dRow: 2, dCol: 3, direction: 'nw' },
      // gate1 intentionally omitted — must fall back to the default layout and direction.
    },
  };
  const defaults = vm.runInContext('getDefaultAirportRoutePoints(testAnchor)', context);
  const resolved = vm.runInContext(
    'resolveAirportRoutePointsFromRecord(testAnchor, savedRecord)',
    context,
  );

  assert.deepEqual(toPlain(resolved.landStart), { row: 2, col: 3, direction: 'nw' });
  assert.deepEqual(
    toPlain(resolved.gate1),
    { row: defaults.gate1.dRow, col: defaults.gate1.dCol, direction: 'se' },
  );
});

test('the shipped route (aircraft-route-metadata.js) is what the calibrator falls back to, not the generic starting layout', () => {
  const context = createAirportCalibratorContext();
  const anchor = { row: 0, col: 0, footprintCols: 12, footprintRows: 12 };
  context.testAnchor = anchor;
  context.getAircraftRouteMetadata = () => ({
    pointsByKey: {
      landStart: { dRow: 5.5, dCol: 6.5, direction: 'nw' },
      // gate1 intentionally omitted from the stub - must fall back further,
      // to the generic default layout, not throw or drop the point.
    },
  });

  const shipped = vm.runInContext('getShippedAirportRoutePoints(testAnchor)', context);
  const generic = vm.runInContext('getDefaultAirportRoutePoints(testAnchor)', context);
  assert.deepEqual(toPlain(shipped.landStart), { dRow: 5.5, dCol: 6.5, direction: 'nw' });
  assert.deepEqual(toPlain(shipped.gate1), { dRow: generic.gate1.dRow, dCol: generic.gate1.dCol, direction: 'se' });

  // resolveAirportRoutePointsFromRecord must prefer this shipped route over
  // the generic layout whenever a point isn't in the (possibly stale or
  // absent) saved record passed in - this is what makes opening the
  // calibrator show the route actually flying right now.
  const resolvedWithNoRecord = vm.runInContext('resolveAirportRoutePointsFromRecord(testAnchor, null)', context);
  assert.deepEqual(
    toPlain(resolvedWithNoRecord.landStart),
    { row: anchor.row + 5.5, col: anchor.col + 6.5, direction: 'nw' },
  );

  context.partialRecord = { points: { landStart: { dRow: 1, dCol: 1, direction: 'sw' } } };
  const resolvedWithPartialRecord = vm.runInContext(
    'resolveAirportRoutePointsFromRecord(testAnchor, partialRecord)',
    context,
  );
  // landStart: the record wins over the shipped route (an in-progress drag beats it).
  assert.deepEqual(toPlain(resolvedWithPartialRecord.landStart), { row: 1, col: 1, direction: 'sw' });
  // gate1: not in the record, so it falls all the way through to the generic layout (shipped had no gate1 either).
  assert.deepEqual(
    toPlain(resolvedWithPartialRecord.gate1),
    { row: anchor.row + generic.gate1.dRow, col: anchor.col + generic.gate1.dCol, direction: 'se' },
  );
});

test('an airport already on the map anchors the calibrator to its footprint', () => {
  const context = createAirportCalibratorContext();
  context.getBuildingFacilityEntries = (type) => (
    type === 'airport'
      ? [{ row: 30, col: 40, record: { footprintCols: 12, footprintRows: 12 } }]
      : []
  );
  const anchor = vm.runInContext('resolveAirportRouteCalibrationAnchor({})', context);
  assert.deepEqual(toPlain(anchor), { row: 30, col: 40, footprintCols: 12, footprintRows: 12 });
});

test('toggling is a no-op outside the hidden test mode', () => {
  const context = createAirportCalibratorContext();
  vm.runInContext('setVisualRouteCalibrationTestModeEnabled(false)', context);
  const result = vm.runInContext("toggleAirportRouteCalibrator({})", context);
  assert.equal(result, false);
});

test('the performance panel exposes an airport calibrator button wired to toggleAirportRouteCalibrator', () => {
  assert.match(calibratorSource, /class="vrp-airport-btn">機場路線校正<\/button>/);
  const handlerStart = calibratorSource.indexOf("querySelector('.vrp-airport-btn')");
  assert.ok(handlerStart >= 0);
  const handler = calibratorSource.slice(handlerStart, calibratorSource.indexOf('document.body.appendChild(root)', handlerStart));
  assert.match(handler, /toggleAirportRouteCalibrator\(scene\)/);
});

test('airport-route-calibrator.js loads after visual-route-calibrator.js and before vessel-visuals.js', () => {
  assert.match(
    htmlSource,
    /visual-route-calibrator\.js[\s\S]*?airport-route-calibrator\.js[\s\S]*?vessel-visuals\.js/,
  );
});

test('markers reuse the shared calibration input depth instead of a magic number', () => {
  assert.match(airportSource, /visual\.setDepth\(VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH\)/);
  assert.match(airportSource, /text\.setDepth\(VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH\)/);
});

test('a marker cycles through all 4 directions and returns to the start', () => {
  const context = createAirportCalibratorContext();
  let direction = 'se';
  const seen = [direction];
  for (let i = 0; i < 4; i++) {
    context.testDirection = direction;
    direction = vm.runInContext('getNextAirportMarkerDirection(testDirection)', context);
    seen.push(direction);
  }
  assert.deepEqual(seen, ['se', 'sw', 'nw', 'ne', 'se']);
});

test('marker preview falls back to a circle until the aircraft bundle is ready, then prefers the real sprite', () => {
  const context = createAirportCalibratorContext();
  context.notReadyScene = {};
  context.readyScene = {};
  context.aircraftBundleIsReady = (scene) => scene === context.readyScene;
  context.getAircraftTextureKey = (livery, direction) => `aircraft_${livery}_${direction}`;

  assert.equal(
    vm.runInContext('airportRouteAircraftPreviewIsReady(notReadyScene)', context),
    false,
  );
  assert.equal(
    vm.runInContext('airportRouteAircraftPreviewIsReady(readyScene)', context),
    true,
  );
  assert.equal(
    vm.runInContext("getAirportRouteAircraftTextureKey('ne')", context),
    `aircraft_${vm.runInContext('AIRPORT_ROUTE_PREVIEW_LIVERY', context)}_ne`,
  );
});
