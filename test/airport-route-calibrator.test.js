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

function createMockStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('default layout gives all 7 points a finite, non-degenerate starting position', () => {
  const context = createAirportCalibratorContext();
  const points = vm.runInContext(
    'getDefaultAirportRoutePoints({ row: 0, col: 0, footprintCols: 12, footprintRows: 12 })',
    context,
  );
  const keys = vm.runInContext('AIRPORT_ROUTE_POINT_DEFS.map((def) => def.key)', context);
  assert.deepEqual(Object.keys(points).sort(), [...keys].sort());
  keys.forEach((key) => {
    assert.ok(Number.isFinite(points[key].dRow), `${key}.dRow`);
    assert.ok(Number.isFinite(points[key].dCol), `${key}.dCol`);
    assert.ok(points[key].dRow >= 0 && points[key].dRow <= 11, `${key}.dRow in range`);
    assert.ok(points[key].dCol >= 0 && points[key].dCol <= 11, `${key}.dCol in range`);
  });
  assert.notEqual(points.landStart.dCol, points.landEnd.dCol, 'landing runway must not be a single point');
  assert.notEqual(points.takeoffStart.dCol, points.liftoff.dCol, 'takeoff runway must not be a single point');
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

test('persisted record round-trips exactly through the dedicated storage key', () => {
  const context = createAirportCalibratorContext();
  context.mockStorage = createMockStorage();
  const record = vm.runInContext(
    'buildAirportRouteCalibrationRecord({ anchor: { row: 10, col: 20, footprintCols: 12, footprintRows: 12 }, points: { landStart: { row: 11, col: 21 } } })',
    context,
  );
  context.testRecord = record;

  const saved = vm.runInContext('persistAirportRouteCalibrationRecord(testRecord, mockStorage)', context);
  assert.equal(saved, true);
  const storedRaw = vm.runInContext(
    "mockStorage.getItem(AIRPORT_ROUTE_CALIBRATION_STORAGE_KEY)",
    context,
  );
  assert.equal(storedRaw, JSON.stringify(record));

  const loaded = vm.runInContext('loadAirportRouteCalibrationRecord(mockStorage)', context);
  assert.deepEqual(loaded, record);
});

test('loading with no stored record and a corrupt one both fail safe to null', () => {
  const context = createAirportCalibratorContext();
  context.emptyStorage = createMockStorage();
  assert.equal(vm.runInContext('loadAirportRouteCalibrationRecord(emptyStorage)', context), null);

  context.corruptStorage = createMockStorage();
  vm.runInContext("corruptStorage.setItem(AIRPORT_ROUTE_CALIBRATION_STORAGE_KEY, '{not json')", context);
  assert.equal(vm.runInContext('loadAirportRouteCalibrationRecord(corruptStorage)', context), null);
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
