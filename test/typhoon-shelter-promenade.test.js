const assert = require('node:assert/strict');
const test = require('node:test');
require('../typhoon-shelter-assets.js');
require('../typhoon-shelter-sprites.js');
const { layTyphoonShelterPromenade } = require('../typhoon-shelter-planning.js');

test('the promenade is laid cell by cell: brick, the coping toward the sea, the kerb toward the land', () => {
  // a stepped coast: land tile (1, 1) faces the sea west and south, (1, 2) is a corner fill, (2, 2)
  // faces it west - the steps of a diagonal shore
  const L = 1; const W = 5;
  globalThis.WATER = W;
  globalThis.mapData = [
    [W, L, L, L],
    [W, L, L, L],
    [W, W, L, L],
    [W, W, W, L],
  ];
  const plan = {
    id: 'ts1',
    works: { items: [
      { kind: 'quay', row: 1, col: 1, facing: 'w', state: 'done' },
      { kind: 'quay', row: 1, col: 1, facing: 's', state: 'done' },
      { kind: 'quay', row: 2, col: 2, facing: 'w', state: 'done' },
      { kind: 'quayFill', row: 1, col: 2, corner: 'sw', state: 'done' },
    ] },
  };
  const wanted = new Map();
  layTyphoonShelterPromenade(plan, wanted);
  const pieces = [...wanted.values()];
  const cellOf = (w) => w.offsets.map(([d]) => d).join('');
  const at = (row, col, cell) => pieces.filter((w) => w.item.row === row && w.item.col === col && cellOf(w) === cell);
  const sides = (row, col, cell, objectId) => at(row, col, cell).filter((w) => w.objectId === objectId).map((w) => w.item.facing).sort();
  // the outer corner tile: three cells of brick (the west pair and the south pair share the corner)
  assert.equal(pieces.filter((w) => w.objectId === 'quayDeckSquare' && w.item.row === 1 && w.item.col === 1).length, 3);
  // its corner cell wraps the coping round both sea sides, and has no kerb
  assert.deepEqual(sides(1, 1, 'sw', 'promenadeEdge'), ['s', 'w']);
  assert.deepEqual(sides(1, 1, 'sw', 'promenadeKerb'), []);
  // the inland cell is not promenade; the cells beside it close with a kerb toward it
  assert.equal(at(1, 1, 'ne').length, 0);
  assert.deepEqual(sides(1, 1, 'nw', 'promenadeKerb'), ['e', 'n']);
  assert.deepEqual(sides(1, 1, 'se', 'promenadeKerb'), ['n']);
  // the run goes on through the fill into the next step: no kerb or coping between promenade cells
  assert.deepEqual(sides(1, 1, 'se', 'promenadeEdge'), ['s']);
  assert.deepEqual([...sides(1, 2, 'sw', 'promenadeKerb'), ...sides(1, 2, 'sw', 'promenadeEdge')], ['e', 'n']);
  assert.deepEqual(sides(2, 2, 'nw', 'promenadeEdge'), ['w']);
  pieces.forEach((w) => assert.ok(w.sectioned && w.offsets.length === 2, 'every piece sorts by its cell'));
});
