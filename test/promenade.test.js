const assert = require('node:assert/strict');
const test = require('node:test');
const { PROMENADE, normalizePromenadeState, whyNotPromenadeAt, getPromenadePiers } = require('../promenade.js');

// '~' water, '.' free land, '#' land taken (a road, a building)
function map(rows) {
  const m = rows.map((r) => r.split(''));
  return {
    isInside: (r, c) => r >= 0 && c >= 0 && r < m.length && c < m[0].length,
    isWater: (r, c) => m[r][c] === '~',
    isFree: (r, c) => m[r][c] === '.',
    isPromenade: () => false,
  };
}

test('a promenade tile goes on free land with a side on the sea', () => {
  const ctx = map(['....', '.#..', '~~~~']);
  assert.equal(whyNotPromenadeAt(1, 0, ctx), null);
  assert.equal(whyNotPromenadeAt(0, 0, ctx), 'notShore', 'a tile back from the water');
  assert.equal(whyNotPromenadeAt(1, 1, ctx), 'occupied');
  assert.equal(whyNotPromenadeAt(2, 0, ctx), 'water');
  assert.equal(whyNotPromenadeAt(1, 0, { ...ctx, isPromenade: () => true }), 'built');
});

test('a public pier in every few tiles of a run, near the middle of a short one; the player overrides', () => {
  const tiles = {};
  for (let c = 0; c < 14; c++) tiles[`5:${c}`] = 0;
  const seaSides = () => ['s'];
  const { piers, auto } = getPromenadePiers({ tiles }, seaSides);
  assert.equal(auto.size, Math.ceil((14 - PROMENADE.pierEvery / 2) / PROMENADE.pierEvery));
  assert.ok(piers.has(`5:${PROMENADE.pierEvery / 2}`));
  // a short run: one, in its middle
  assert.deepEqual([...getPromenadePiers({ tiles: { '1:1': 0, '1:2': 0, '1:3': 0 } }, seaSides).piers], ['1:2']);
  // turned off by hand, and one put in by hand
  const own = { ...tiles, [`5:${PROMENADE.pierEvery / 2}`]: 2, '5:1': 1 };
  const mine = getPromenadePiers({ tiles: own }, seaSides).piers;
  assert.equal(mine.has(`5:${PROMENADE.pierEvery / 2}`), false);
  assert.equal(mine.has('5:1'), true);
  // a tile with no side on the sea is never a pier
  assert.equal(getPromenadePiers({ tiles: { '0:0': 1 } }, () => []).piers.size, 0);
});

test('the saved state keeps only tiles and their pier choices', () => {
  assert.deepEqual(normalizePromenadeState({ tiles: { '3:4': 1, '5:6': 7, bad: 1 } }), { version: 1, tiles: { '3:4': 1, '5:6': 0 } });
  assert.deepEqual(normalizePromenadeState(undefined), { version: 1, tiles: {} });
});

test('the water under a bridge is not sea to a promenade: no shore there on its own', () => {
  const ctx = { ...map(['..', '~~']), isSea: (r, c) => r === 1 && c === 1 };
  assert.equal(whyNotPromenadeAt(0, 1, ctx), null, 'the open water beside it');
  assert.equal(whyNotPromenadeAt(0, 0, ctx), 'notShore', 'only the bridge\'s water in front');
});
