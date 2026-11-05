const assert = require('node:assert/strict');
const { test } = require('node:test');
const { railDragPath, addRailPathBits } = require('../metro-surface');
const {
  METRO_SURFACE, surfaceStationTiles, whyNotSurfaceStationAt, findSurfacePath, surfaceLineGeometry,
  surfaceTrainCars, surfaceCarView,
} = require('../metro-surface-lines');

const lay = (bits, a, b) => addRailPathBits(bits, railDragPath(a, b));
// east along row 5, a 45-degree corner, south down column 20
const bits = lay(lay({}, { row: 5, col: 0 }, { row: 5, col: 20 }), { row: 5, col: 20 }, { row: 15, col: 20 });
const A = { row: 5, col: 4, axis: 'we' }, B = { row: 5, col: 14, axis: 'we' }, C = { row: 12, col: 20, axis: 'ns' };

test('a surface station stands on five straight tiles of one line', () => {
  assert.deepEqual(surfaceStationTiles(A), [[5, 2], [5, 3], [5, 4], [5, 5], [5, 6]]);
  assert.deepEqual(whyNotSurfaceStationAt(5, 4, bits), { axis: 'we' });
  assert.equal(whyNotSurfaceStationAt(5, 19, bits).code, 'notStraight', 'the corner is two tiles on');
  assert.equal(whyNotSurfaceStationAt(9, 9, bits).code, 'notStraight', 'no track');
  assert.equal(whyNotSurfaceStationAt(5, 4, bits, (r, c) => r === 5 && c === 6).code, 'notStraight', 'another station');
});

test('the way between two stations follows the track, round the corner', () => {
  const p = findSurfacePath(bits, B, C);
  assert.deepEqual([p[0].row, p[0].col, p[0].exit], [5, 14, 'e']);
  const corner = p.find((s) => s.row === 5 && s.col === 20);
  assert.deepEqual([corner.entry, corner.exit], ['w', 's']);
  assert.deepEqual([p.at(-1).row, p.at(-1).col], [12, 20]);
  assert.equal(findSurfacePath(bits, A, { row: 30, col: 30, axis: 'ns' }), null);
});

test('a line runs on past its end stations; trains keep left and the cab leads', () => {
  const g = surfaceLineGeometry([A, B, C], bits);
  assert.equal(g.stationAt[0], METRO_SURFACE.endRunTiles);
  assert.equal(g.stationAt[1] - g.stationAt[0], 10);
  // at the middle station going east: on the north track (left of east, the row a little less)
  const cars = surfaceTrainCars(g, g.stationAt[1], 1);
  assert.ok(cars.every((c) => Math.abs(c.pos[1] - (5.5 - METRO_SURFACE.trackOffsetTiles)) < 1e-9));
  assert.ok(cars[0].pos[0] > cars[3].pos[0], 'the lead car is ahead, east');
  assert.deepEqual(cars.map((c) => c.role), ['lead', 'mid', 'mid', 'trail']);
  assert.equal(surfaceCarView(cars[0].heading[0], cars[0].heading[1], 'lead'), 'fall_cabNear', 'east is down-right: its cab near');
  // going back west: on the south track
  const back = surfaceTrainCars(g, g.stationAt[1], -1);
  assert.ok(back.every((c) => Math.abs(c.pos[1] - (5.5 + METRO_SURFACE.trackOffsetTiles)) < 1e-9));
  assert.equal(surfaceCarView(back[0].heading[0], back[0].heading[1], 'lead'), 'fall_cabFar', 'west is up-left: the cab far');
});

test('a car on a diagonal shows the side or end-on view; the map turned turns it', () => {
  assert.equal(surfaceCarView(1, -1, 'mid'), 'horiz_mid');
  assert.equal(surfaceCarView(1, 1, 'mid'), 'vert_mid');
  assert.equal(surfaceCarView(1, 0, 'mid', 1), 'rise_mid', 'east, the map turned once, runs down-left on screen');
});

test('at a terminus a train stands on the platform it is given and crosses back to the left outside it', () => {
  const { surfaceTrackSide } = require('../metro-surface-lines');
  const g = surfaceLineGeometry([A, B], lay({}, { row: 5, col: 0 }, { row: 5, col: 20 }));
  const picks = { first: 1, last: -1 };
  const end = g.stationAt.at(-1), half = METRO_SURFACE.platformTiles / 2, cross = METRO_SURFACE.crossoverTiles;
  assert.equal(surfaceTrackSide(g, end, 1, picks), -1, 'in the platform: the one given');
  assert.equal(surfaceTrackSide(g, end - half - cross - 0.01, 1, picks), 1, 'before the crossover: keeping left');
  const mid = surfaceTrackSide(g, end - half - cross / 2, 1, picks);
  assert.ok(mid > -1 && mid < 1, 'on the crossover: between the two');
  assert.equal(surfaceTrackSide(g, g.stationAt[0], -1, picks), 1, 'the other terminus: its own platform');
  assert.equal(surfaceTrackSide(g, (g.stationAt[0] + end) / 2, -1, picks), -1, 'between: left of the way back');
  // the cars at the platform all on the given track
  const cars = surfaceTrainCars(g, end, -1, picks);
  assert.ok(cars.every((c) => Math.abs(c.pos[1] - (5.5 + METRO_SURFACE.trackOffsetTiles)) < 1e-9));
});

test('避車: trains on one track keep a tile and a half apart; the other way, on the other track, pass', () => {
  const { surfaceSegmentKeys, resolveSurfaceBlocking } = require('../metro-surface-lines');
  const straight = lay({}, { row: 5, col: 0 }, { row: 5, col: 40 });
  const S1 = { row: 5, col: 4, axis: 'we' }, S2 = { row: 5, col: 34, axis: 'we' };
  const g = surfaceLineGeometry([S1, S2], straight);
  const half = 2.35;
  const keys = (x, dir, from, to) => surfaceSegmentKeys(g, x + dir * from, x + dir * to, dir, straight);
  const train = (id, x, dir) => ({ id, occupied: keys(x, dir, -half, half), ahead: keys(x, dir, half, half + 1.5) });
  // A at 15 going east; B behind it at 10.5, its nose a tile from A's tail: B waits, A goes
  assert.deepEqual([...resolveSurfaceBlocking([train('A', 15, 1), train('B', 10.5, 1)])], ['B']);
  // far apart: neither waits
  assert.equal(resolveSurfaceBlocking([train('A', 20, 1), train('B', 10, 1)]).size, 0);
  // the other way, side by side: on the other track
  assert.equal(resolveSurfaceBlocking([train('A', 15, 1), train('B', 15.5, -1)]).size, 0);
  // two trains making for the same free tile: the first in order goes, the second waits
  const a = { id: 'A', occupied: new Set(['1:1|1']), ahead: new Set(['1:2|*']) };
  const b = { id: 'B', occupied: new Set(['3:3|1']), ahead: new Set(['1:2|1']) };
  assert.deepEqual([...resolveSurfaceBlocking([a, b])], ['B']);
});

test('避車: two trains started on top of each other do not wait on each other for ever', () => {
  const { resolveSurfaceBlocking } = require('../metro-surface-lines');
  const a = { id: 'A', occupied: new Set(['5:5|1', '5:6|1']), ahead: new Set(['5:6|1', '5:7|1']) };
  const b = { id: 'B', occupied: new Set(['5:5|1', '5:6|1']), ahead: new Set(['5:6|1', '5:7|1']) };
  assert.deepEqual([...resolveSurfaceBlocking([a, b])], ['B'], 'the first goes');
});
