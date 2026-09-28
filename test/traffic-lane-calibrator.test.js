const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const visuals = require('../traffic-visuals');

// The calibrator reads traffic-visuals.js's table as a browser global.
Object.assign(global, {
  TRAFFIC_LANE_OFFSETS: visuals.TRAFFIC_LANE_OFFSETS,
  TRAFFIC_LANE_KINDS: visuals.TRAFFIC_LANE_KINDS,
  TRAFFIC_LANE_SCREEN_DIRECTIONS: visuals.TRAFFIC_LANE_SCREEN_DIRECTIONS,
});
const calibrator = require('../traffic-lane-calibrator');

test('shipped lane offsets are the 2026-09-28 calibration; the inner dual lane is across the centre line', () => {
  const { TRAFFIC_LANE_OFFSETS } = visuals;
  assert.deepEqual({ ...TRAFFIC_LANE_OFFSETS.single }, { ne: 0.12, se: 0.12, sw: 0.12, nw: 0.12 });
  assert.deepEqual({ ...TRAFFIC_LANE_OFFSETS.dualOuter }, { ne: 0.12, se: 0.11, sw: 0.13, nw: 0.125 });
  assert.deepEqual({ ...TRAFFIC_LANE_OFFSETS.dualInner }, { ne: -0.14, se: -0.12, sw: -0.11, nw: -0.12 });
  for (const direction of visuals.TRAFFIC_LANE_SCREEN_DIRECTIONS) {
    assert.ok(TRAFFIC_LANE_OFFSETS.dualOuter[direction] > 0 && TRAFFIC_LANE_OFFSETS.dualInner[direction] < 0, direction);
  }
  // Screen deltas of one iso step: NE (+,-), SE (+,+), SW (-,+), NW (-,-).
  assert.equal(visuals.getTrafficLaneOffsetAmount(50, -25, 'dualInner'), -0.14);
  assert.equal(visuals.getTrafficLaneOffsetAmount(-50, 25, 'dualOuter'), 0.13);
  assert.deepEqual(
    [[50, -25], [50, 25], [-50, 25], [-50, -25]].map(([dx, dy]) => visuals.getTrafficLaneScreenDirection(dx, dy)),
    ['ne', 'se', 'sw', 'nw'],
  );
});

test('lane kind: a band tile run its own way has two lanes; everything else is a single keep-left lane', () => {
  const bands = { '5:5': { orientation: 'v', direction: 'north' }, '5:9': { orientation: 'v', direction: 'shared' } };
  global.getRoadCarriagewayBand = (row, col) => bands[`${row}:${col}`] ?? null;
  try {
    const kind = visuals.getTrafficLaneKind;
    assert.equal(kind({ row: 5, col: 5 }, -1, 0, 'outer'), 'dualOuter');
    assert.equal(kind({ row: 5, col: 5 }, -1, 0, 'inner'), 'dualInner');
    assert.equal(kind({ row: 5, col: 5 }, 1, 0, 'inner'), 'single', 'against the band: never happens, stays single');
    assert.equal(kind({ row: 5, col: 9 }, -1, 0, 'inner'), 'single', 'a shared middle lane is two-way');
    assert.equal(kind({ row: 1, col: 1 }, 0, 1, 'inner'), 'single', 'not a band tile');
  } finally {
    delete global.getRoadCarriagewayBand;
  }
});

test('a calibrated value overrides the shipped one for that lane kind and direction only', () => {
  calibrator.resetTrafficLaneCalibration();
  assert.equal(calibrator.setTrafficLaneCalibrationValue('dualInner', 'sw', -0.155), -0.155);
  global.getTrafficLaneCalibrationOffset = calibrator.getTrafficLaneCalibrationOffset;
  try {
    assert.equal(visuals.getTrafficLaneOffsetAmount(-50, 25, 'dualInner'), -0.155);
    assert.equal(visuals.getTrafficLaneOffsetAmount(-50, 25, 'dualOuter'), 0.13, 'other kinds untouched');
    assert.equal(visuals.getTrafficLaneOffsetAmount(50, 25, 'dualInner'), -0.12, 'other directions untouched');
  } finally {
    delete global.getTrafficLaneCalibrationOffset;
  }
  assert.equal(calibrator.setTrafficLaneCalibrationValue('single', 'ne', 9), 0.45, 'clamped to a sane range');
  calibrator.setTrafficLaneCalibrationValue('single', 'ne', 0.12);
  assert.equal(calibrator.getTrafficLaneCalibrationOffset('single', 'ne'), null, 'back at the shipped value = no override');
  assert.equal(calibrator.hasTrafficLaneCalibrationChanges(), true, 'dualInner sw is still changed');
  calibrator.resetTrafficLaneCalibration('dualInner');
  assert.equal(calibrator.hasTrafficLaneCalibrationChanges(), false);
});

test('"複製 JS" produces a literal that evaluates to the full table with the session changes', () => {
  calibrator.resetTrafficLaneCalibration();
  calibrator.setTrafficLaneCalibrationValue('dualOuter', 'nw', 0.14);
  const source = calibrator.buildTrafficLaneCalibrationSource();
  assert.match(source, /^const TRAFFIC_LANE_OFFSETS = Object\.freeze\(\{/);
  const table = new Function(`${source}\nreturn TRAFFIC_LANE_OFFSETS;`)();
  assert.deepEqual(JSON.parse(JSON.stringify(table)), {
    single: { ne: 0.12, se: 0.12, sw: 0.12, nw: 0.12 },
    dualOuter: { ne: 0.12, se: 0.11, sw: 0.13, nw: 0.14 },
    dualInner: { ne: -0.14, se: -0.12, sw: -0.11, nw: -0.12 },
  });
  calibrator.resetTrafficLaneCalibration();
});

test('the test-mode panel keeps every calibration tool in one collapsible, grouped section', () => {
  const panel = fs.readFileSync(path.join(ROOT, 'visual-route-calibrator.js'), 'utf8');
  const start = panel.indexOf("'<details class=\"vrp-tools\">");
  const end = panel.indexOf("'</div></details>'", start);
  assert.ok(start > 0 && end > start, 'tool section exists');
  const section = panel.slice(start, end);
  for (const cls of ['trafficlane', 'trafficsignal', 'busstop', 'trafficlight', 'airport', 'roadline', 'streetlamp', 'bridgeparapet', 'pedestrianrailing', 'streetfurniture', 'buildinglight', 'livelights']) {
    assert.ok(section.includes(`class="vrp-${cls}-btn"`), `${cls} button lives in the tool section`);
  }
  const outside = panel.slice(panel.indexOf('root.innerHTML ='), start);
  assert.ok(!/vrp-(?!close|reset|copy)[a-z]+-btn/.test(outside), 'no tool buttons outside it');
  assert.match(panel, /toggleTrafficLaneCalibrator\(scene\)/);
  assert.match(panel, /teardownTrafficLaneCalibrator\(\)/, 'leaving test mode closes the lane calibrator');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /traffic-visuals\.js[\s\S]*visual-route-calibrator\.js[\s\S]*traffic-lane-calibrator\.js/);
});
