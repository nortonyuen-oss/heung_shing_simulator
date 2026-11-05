const assert = require('node:assert/strict');
const { test } = require('node:test');
const { railDragPath, addRailPathBits, railBadTiles, railVisualMask } = require('../metro-surface');

// metro-surface.js uses the game's rotateDirection (tile-keys.js)
global.rotateDirection = (d, steps) => { const o = ['n', 'e', 's', 'w']; return o[(o.indexOf(d) + ((steps % 4) + 4)) % 4]; };

const X = 1, Y = 2, UPPER = 4, LOWER = 8, LEFT = 16, RIGHT = 32;
const lay = (bits, a, b) => addRailPathBits(bits, railDragPath(a, b));
const tiles = (path) => path.map((p) => [p.row, p.col]);

test('a drag is a straight, an L with a diagonal at the corner, or a diagonal staircase', () => {
  assert.deepEqual(tiles(railDragPath({ row: 5, col: 5 }, { row: 5, col: 8 })), [[5, 5], [5, 6], [5, 7], [5, 8]]);
  assert.deepEqual(tiles(railDragPath({ row: 5, col: 5 }, { row: 3, col: 5 })), [[5, 5], [4, 5], [3, 5]]);
  assert.deepEqual(tiles(railDragPath({ row: 0, col: 0 }, { row: 3, col: 5 })), [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 5], [2, 5], [3, 5]]);
  assert.deepEqual(tiles(railDragPath({ row: 0, col: 0 }, { row: 3, col: 3 })), [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [2, 3], [3, 3]]);
});

test('each tile gets the bit joining the sides it is entered and left by: a 90-degree turn is two 45s', () => {
  const bits = lay({}, { row: 0, col: 0 }, { row: 3, col: 5 });
  assert.equal(bits['0:0'], Y, 'the start: the straight it leaves by');
  assert.equal(bits['0:3'], Y);
  assert.equal(bits['0:5'], LEFT, 'the corner: west to south, a diagonal');
  assert.equal(bits['2:5'], X);
  // all four ways round
  assert.equal(lay({}, { row: 5, col: 0 }, { row: 0, col: 8 })['5:8'], UPPER, 'east then north: west to north');
  assert.equal(lay({}, { row: 5, col: 8 }, { row: 0, col: 0 })['5:0'], RIGHT, 'west then north: east to north');
  assert.equal(lay({}, { row: 0, col: 8 }, { row: 5, col: 0 })['0:0'], LOWER, 'west then south: east to south');
});

test('a diagonal drag is a staircase of diagonals, straight on screen', () => {
  const bits = lay({}, { row: 0, col: 0 }, { row: 3, col: 3 });
  assert.deepEqual([bits['0:1'], bits['1:1'], bits['1:2'], bits['2:2'], bits['2:3']], [LEFT, RIGHT, LEFT, RIGHT, LEFT]);
  assert.deepEqual(railBadTiles(bits), []);
});

test('crossing another line makes a diamond; joining its end needs no new bit; points are refused', () => {
  const across = lay(lay({}, { row: 3, col: 0 }, { row: 3, col: 6 }), { row: 0, col: 3 }, { row: 6, col: 3 });
  assert.equal(across['3:3'], X | Y);
  assert.deepEqual(railBadTiles(across), []);
  // carry a line on from its end: the end tile keeps its straight
  const on = lay(lay({}, { row: 0, col: 0 }, { row: 0, col: 3 }), { row: 0, col: 3 }, { row: 0, col: 6 });
  assert.equal(on['0:3'], Y);
  // a diagonal across a straight: points where it meets it (phase 4), a straight and a diagonal on a tile
  const branch = lay(lay({}, { row: 3, col: 0 }, { row: 3, col: 6 }), { row: 2, col: 2 }, { row: 4, col: 4 });
  assert.deepEqual(railBadTiles(branch), []);
  assert.deepEqual([branch['3:3'], branch['3:4']], [Y | RIGHT, Y | LEFT], 'two points, OpenTTD switch_c2 and switch_a2');
  // two diagonals crossing on one tile have no layout
  assert.deepEqual(railBadTiles({ '0:0': UPPER | LEFT | RIGHT | LOWER }), ['0:0']);
});

test('the map turned: each bit drawn as the bit joining its sides turned', () => {
  assert.equal(railVisualMask(X, 1), Y);
  assert.equal(railVisualMask(Y, 1), X);
  assert.equal(railVisualMask(UPPER, 1), RIGHT, 'west-north turned once is north-east');
  assert.equal(railVisualMask(UPPER, 2), LOWER);
  assert.equal(railVisualMask(X | Y, 3), X | Y);
  assert.equal(railVisualMask(UPPER | LOWER, 1), LEFT | RIGHT);
});

test('高架: a ramp of five tiles at each end, the deck between; carried on from a deck end without one', () => {
  const { planRailElevated, railSideHeight, railElevatedRun, METRO_RAIL } = require('../metro-surface');
  const yes = () => true;
  const path = railDragPath({ row: 0, col: 0 }, { row: 0, col: 13 });
  const plan = planRailElevated(path, {}, {}, yes, yes);
  assert.ok(plan.ok);
  assert.deepEqual([0, 1, 4, 5, 8, 9, 12, 13].map((c) => plan.assign[`0:${c}`]), ['1e', '2e', '5e', 'd', 'd', '5w', '2w', '1w']);
  assert.equal(plan.decks, 4);
  assert.equal(plan.ramps, 10);
  // the track's height across each side: the ground at a ramp's foot, the deck at its head
  assert.equal(railSideHeight('1e', 'w'), 0);
  assert.equal(railSideHeight('5e', 'e'), METRO_RAIL.deckMetres);
  assert.equal(railSideHeight('d', 'n'), METRO_RAIL.deckMetres);
  assert.equal(railSideHeight(undefined, 'n'), 0);
  // carried on from the deck's end: no ramp that end
  const bits = addRailPathBits({}, path);
  const on = planRailElevated(railDragPath({ row: 0, col: 7 }, { row: 0, col: 20 }), bits, plan.assign, yes, yes);
  assert.ok(on.ok, on.reason);
  assert.equal(on.assign['0:8'], undefined, 'the deck it runs on stays');
  assert.deepEqual(['0:9', '0:11', '0:13'].map((k) => on.assign[k]), ['d', 'd', 'd'], 'the old ramp built up into deck');
  assert.deepEqual(['0:16', '0:18', '0:20'].map((k) => on.assign[k]), ['5w', '3w', '1w'], 'a new ramp at the new end');
  // a whole viaduct goes with any tile of it
  assert.equal(railElevatedRun(bits, plan.assign, '0:6').length, 14);
});

test('高架 refusals: too short, ramps round a corner, ramps on a road, a pier on a building', () => {
  const { planRailElevated } = require('../metro-surface');
  const yes = () => true;
  assert.equal(planRailElevated(railDragPath({ row: 0, col: 0 }, { row: 0, col: 9 }), {}, {}, yes, yes).reason, 'tooShort');
  assert.equal(planRailElevated(railDragPath({ row: 0, col: 0 }, { row: 11, col: 3 }), {}, {}, yes, yes).reason, 'rampStraight');
  assert.equal(planRailElevated(railDragPath({ row: 0, col: 0 }, { row: 0, col: 13 }), {}, {}, yes, (r, c) => c !== 1).reason, 'rampGround');
  assert.equal(planRailElevated(railDragPath({ row: 0, col: 0 }, { row: 0, col: 13 }), {}, {}, (r, c) => c !== 6, yes).reason, 'deckGround');
});
