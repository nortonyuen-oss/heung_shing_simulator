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
  // a diagonal across a straight: the straight and a diagonal on one tile would be points
  const branch = lay(lay({}, { row: 3, col: 0 }, { row: 3, col: 6 }), { row: 2, col: 2 }, { row: 4, col: 4 });
  assert.deepEqual(railBadTiles(branch), ['3:3', '3:4'], 'it crosses the straight over two tiles');
});

test('the map turned: each bit drawn as the bit joining its sides turned', () => {
  assert.equal(railVisualMask(X, 1), Y);
  assert.equal(railVisualMask(Y, 1), X);
  assert.equal(railVisualMask(UPPER, 1), RIGHT, 'west-north turned once is north-east');
  assert.equal(railVisualMask(UPPER, 2), LOWER);
  assert.equal(railVisualMask(X | Y, 3), X | Y);
  assert.equal(railVisualMask(UPPER | LOWER, 1), LEFT | RIGHT);
});
