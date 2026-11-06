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

// A strip of terrain along the rows (every row the same): levels[col], a hill's sides falling to
// the lower columns beside it, as the game's open edges.
function terrain(levels, opts = {}) {
  const { railGroundAt } = require('../metro-surface');
  const level = (r, c) => levels[c] || 0;
  const openEdges = (r, c) => {
    const h = level(r, c);
    if (h <= 0) return [];
    return [['w', c - 1], ['e', c + 1]].filter(([, cc]) => (levels[cc] || 0) < h).map(([s]) => s);
  };
  return {
    level, openEdges, inside: () => true,
    canGround: opts.canGround || (() => true), canDeck: opts.canDeck || (() => true),
    groundAt: (k, side) => { const [r, c] = k.split(':').map(Number); return railGroundAt(level(r, c), openEdges(r, c), side); },
  };
}

// A drag at a height, and the track it leaves (the old and the new) joined at one height throughout.
function atHeight(height, a, b, bits = {}, elev = {}, env = terrain({})) {
  const { planRailAtHeight, railLevelMismatch } = require('../metro-surface');
  const plan = planRailAtHeight(height, railDragPath(a, b), bits, elev, env);
  if (plan.ok) {
    const next = addRailPathBits(bits, plan.path);
    const nextElev = { ...elev };
    Object.entries(plan.assign).forEach(([k, code]) => { if (code) nextElev[k] = code; else delete nextElev[k]; });
    plan.mismatch = railLevelMismatch(next, nextElev, Object.keys(next), env.groundAt);
    plan.bits = next;
    plan.elev = nextElev;
  }
  return plan;
}
const codesAt = (plan, cols, row = 0) => cols.map((c) => plan.assign[`${row}:${c}`]);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test('A列車: 地面 between two ends at one level stays level - a hill on the way tunnelled, mouth to mouth', () => {
  const env = terrain({ 4: 1, 5: 2, 6: 2, 7: 1 });
  const p = atHeight('ground', { row: 0, col: 0 }, { row: 0, col: 10 }, {}, {}, env);
  assert.ok(p.ok, p.reason);
  assert.deepEqual(codesAt(p, range(0, 10)), ['', '', '', '', 'T0w', 't0', 't0', 'T0e', '', '', '']);
  assert.equal(p.mismatch, null);
  // dragged onto the hill (an end at another level): up it, not through
  assert.equal(atHeight('ground', { row: 0, col: 0 }, { row: 0, col: 5 }, {}, {}, env).follow, true);
  // a level run stopped inside a hill: carried on through to its far side
  const short = atHeight('deck', { row: 0, col: 0 }, { row: 0, col: 8 }, {}, {}, terrain({ 5: 1, 6: 2, 7: 3, 8: 4, 9: 4, 10: 3 }));
  assert.ok(short.ok, short.reason);
  assert.deepEqual(short.path.map((q) => q.col), range(0, 9));
  assert.deepEqual(codesAt(short, [7, 8, 9]), ['d', 'T3w', 'T3e']);
  // a bump one tile wide has no hillside to face the track
  assert.equal(atHeight('ground', { row: 0, col: 0 }, { row: 0, col: 8 }, {}, {}, terrain({ 4: 1 })).reason, 'hillMouth');
});

test('A列車: 地面 from one level to another follows the ground, up the hillside', () => {
  const p = atHeight('ground', { row: 0, col: 0 }, { row: 0, col: 6 }, {}, {}, terrain({ 3: 1, 4: 1, 5: 1, 6: 1 }));
  assert.ok(p.ok, p.reason);
  assert.equal(p.follow, true);
  assert.deepEqual(codesAt(p, range(0, 6)), Array(7).fill(''));
  assert.equal(p.mismatch, null);
});

test('A列車: 高架 three levels up - over lower ground, onto a hilltop at its level, through a higher hill', () => {
  const env = terrain({ 5: 1, 6: 2, 7: 3, 8: 3, 9: 4, 10: 4, 11: 3, 12: 2, 13: 1 });
  const p = atHeight('deck', { row: 0, col: 0 }, { row: 0, col: 15 }, {}, {}, env);
  assert.ok(p.ok, p.reason);
  assert.equal(p.level, 3);
  assert.deepEqual(codesAt(p, [0, 5, 7, 8, 9, 10, 11, 14]), ['d', 'd', 'd', '', 'T3w', 'T3e', 'd', 'd']);
  assert.equal(p.mismatch, null);
  // off a hilltop's track over the lower ground: level with the hilltop, no ramp
  const hilltop = terrain({ 0: 2, 1: 2, 2: 2, 3: 2, 4: 1 });
  const bits = lay({}, { row: 0, col: 0 }, { row: 0, col: 2 });
  const off = atHeight('deck', { row: 0, col: 2 }, { row: 0, col: 10 }, bits, {}, hilltop);
  assert.ok(off.ok, off.reason);
  assert.deepEqual(codesAt(off, [3, 4, 10]), ['d2', 'd2', 'd2']);
  assert.equal(off.mismatch, null);
});

test('A列車: the ramp or portal to track at another height goes in for you', () => {
  const ground = lay({}, { row: 0, col: 0 }, { row: 0, col: 3 });
  // from ground track up to a viaduct: a ramp, then deck
  const up = atHeight('deck', { row: 0, col: 3 }, { row: 0, col: 12 }, ground);
  assert.ok(up.ok, up.reason);
  assert.deepEqual(codesAt(up, range(4, 10)), ['1e', '2e', '3e', '4e', '5e', 'd', 'd']);
  assert.equal(up.mismatch, null);
  // down into a tunnel: a portal
  const down = atHeight('under', { row: 0, col: 3 }, { row: 0, col: 12 }, ground);
  assert.deepEqual(codesAt(down, range(4, 9)), ['p1e', 'p2e', 'p3e', 'p4e', 'u', 'u']);
  assert.equal(down.mismatch, null);
  // from a viaduct's end: down a ramp to the ground; down a ramp and a portal to a tunnel
  const deckElev = { '0:0': 'd', '0:1': 'd', '0:2': 'd', '0:3': 'd' };
  const off = atHeight('ground', { row: 0, col: 3 }, { row: 0, col: 12 }, ground, deckElev);
  assert.deepEqual(codesAt(off, range(4, 9)), ['5w', '4w', '3w', '2w', '1w', '']);
  assert.equal(off.mismatch, null);
  const under = atHeight('under', { row: 0, col: 3 }, { row: 0, col: 14 }, ground, deckElev);
  assert.deepEqual(codesAt(under, range(4, 14)), ['5w', '4w', '3w', '2w', '1w', 'p1e', 'p2e', 'p3e', 'p4e', 'u', 'u']);
  assert.equal(under.mismatch, null);
  // the far end too: a viaduct dragged to ground track comes down to it
  const far = lay({}, { row: 0, col: 10 }, { row: 0, col: 12 });
  const toIt = atHeight('deck', { row: 0, col: 0 }, { row: 0, col: 10 }, far);
  assert.deepEqual(codesAt(toIt, range(3, 9)), ['d', 'd', '5w', '4w', '3w', '2w', '1w']);
  assert.equal(toIt.mismatch, null);
  // too short for it, or on a hillside
  assert.equal(atHeight('deck', { row: 0, col: 3 }, { row: 0, col: 6 }, ground).reason, 'rampShort');
  assert.equal(atHeight('deck', { row: 0, col: 3 }, { row: 0, col: 12 }, ground, {}, terrain({ 6: 1, 7: 1 })).reason, 'rampGround');
});

test('a whole viaduct goes with any tile of it', () => {
  const { railElevatedRun } = require('../metro-surface');
  const p = atHeight('deck', { row: 0, col: 0 }, { row: 0, col: 6 });
  assert.equal(railElevatedRun(p.bits, p.elev, '0:3').length, 7);
});

test('ramp and portal heights', () => {
  const { railSideHeight, railIsUp, railIsDown, METRO_RAIL } = require('../metro-surface');
  assert.equal(railSideHeight('5e', 'e'), METRO_RAIL.deckMetres);
  assert.equal(railSideHeight('1e', 'w'), 0);
  assert.equal(railSideHeight('p4e', 'e'), -METRO_RAIL.tunnelMetres);
  assert.equal(railSideHeight('p1e', 'w'), 0);
  assert.ok(railIsDown('u') && railIsDown('p2e') && !railIsDown('d') && !railIsDown('3e'));
  assert.ok(railIsUp('d') && railIsUp('3e') && !railIsUp('u') && !railIsUp('p1n'));
});

test('track meets track at one height: ground track into a deck\'s end is refused, a ramp\'s foot is not', () => {
  const { railLevelMismatch } = require('../metro-surface');
  const deckBits = lay({}, { row: 0, col: 10 }, { row: 0, col: 14 });
  const elev = { '0:10': 'd', '0:11': 'd', '0:12': 'd', '0:13': 'd', '0:14': 'd' };
  const ground = lay(deckBits, { row: 0, col: 4 }, { row: 0, col: 9 });
  assert.equal(railLevelMismatch(ground, elev, ['0:9']), '0:9', 'the ground track runs straight into the deck');
  const withRamp = { ...elev, '0:5': '1e', '0:6': '2e', '0:7': '3e', '0:8': '4e', '0:9': '5e' };
  assert.equal(railLevelMismatch(ground, withRamp, ['0:4', '0:5', '0:9']), null, 'ground, ramp, deck: one height at each join');
});

test('a hill\'s ground: a hillside a level lower at its open edge; deck levels', () => {
  const { railGroundAt, railDeckLevel, railSideHeight, railLevelMismatch, METRO_RAIL } = require('../metro-surface');
  const L = METRO_RAIL.hillLevelMetres;
  assert.equal(railGroundAt(2, ['n'], 'n'), L);
  assert.equal(railGroundAt(2, ['n'], 's'), 2 * L);
  assert.equal(railGroundAt(2, [], 'e'), 2 * L, 'a hilltop is level');
  assert.equal(railGroundAt(0, [], 'n'), 0);
  const bits = lay({}, { row: 0, col: 1 }, { row: 0, col: 6 });
  assert.equal(railLevelMismatch(bits, {}, ['0:3', '0:4', '0:5'], terrain({ 4: 1, 5: 1, 6: 1 }).groundAt), null);
  assert.equal(railDeckLevel('d'), 3);
  assert.equal(railDeckLevel('d5'), 5);
  assert.equal(railSideHeight('d5', 'n'), 5 * L);
});
