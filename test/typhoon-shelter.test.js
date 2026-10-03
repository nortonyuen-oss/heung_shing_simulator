const assert = require('node:assert/strict');
const test = require('node:test');
const {
  encodeTyphoonShelterBasin,
  decodeTyphoonShelterBasin,
  normalizeTyphoonShelterBasin,
  analyzeTyphoonShelter,
  suggestTyphoonShelterEntrances,
  editTyphoonShelterBasin,
  toggleTyphoonShelterEntrance,
  createTyphoonShelterPlan,
  normalizeTyphoonShelterState,
} = require('../typhoon-shelter.js');

// '#' land, '~' open water, '.' water inside the planned basin, 'B' bridge, 'X' occupied water.
function fixture(rows) {
  const grid = rows.map((row) => [...row]);
  const height = grid.length;
  const width = grid[0].length;
  const basin = new Set();
  grid.forEach((row, r) => row.forEach((ch, c) => { if (ch === '.') basin.add(`${r}:${c}`); }));
  const kinds = { '#': 'land', '~': 'water', '.': 'water', B: 'bridge', X: 'blocked' };
  const map = {
    width,
    height,
    kind: (r, c) => (r < 0 || c < 0 || r >= height || c >= width ? null : kinds[grid[r][c]]),
  };
  return { map, basin };
}
const plan = (basin, entrances = []) => ({ id: 'ts1', basin: encodeTyphoonShelterBasin(basin), entrances, reservePct: 20 });
const codes = (a) => a.problems.map((p) => p.code).sort();

// 香港仔式 峽灣: land north and south, the channel closed at both ends by breakwaters.
const FJORD = [
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~#######################~~',
  '~~#######################~~',
  '~~~.....................~~~',
  '~~~.....................~~~',
  '~~~.....................~~~',
  '~~~.....................~~~',
  '~~~.....................~~~',
  '~~~.....................~~~',
  '~~#######################~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~',
];

const BAY = [
  '##############',
  '###........###',
  '###........###',
  '###........###',
  '###........###',
  '###........###',
  '###........###',
  '~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~',
];

const U_SHAPE = [
  '################',
  '##............##',
  '~~............~~',
  '~~............~~',
  '~~............~~',
  '~~............~~',
  '~~............~~',
  '~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~',
];

test('basins round-trip through their compact encoding', () => {
  const basin = new Set(['3:4', '3:5', '3:6', '3:9', '4:4']);
  assert.equal(encodeTyphoonShelterBasin(basin), '3:4-6,9;4:4');
  assert.deepEqual([...decodeTyphoonShelterBasin('3:4-6,9;4:4')].sort(), [...basin].sort());
});

test('fjord: breakwaters only at the two ends, two entrances suggested end to end', () => {
  const { map, basin } = fixture(FJORD);
  const entrances = suggestTyphoonShelterEntrances(plan(basin), map);
  assert.deepEqual(entrances.map((e) => e.side).sort(), ['e', 'w']);
  entrances.forEach((e) => assert.equal(e.width, 2));
  const a = analyzeTyphoonShelter(plan(basin, entrances), map);
  assert.deepEqual(codes(a), []);
  assert.ok(a.legal);
  assert.equal(a.ring.size, 12, 'one 6-tile breakwater at each end');
  assert.equal(a.breakwater.size, 8, 'minus two 2-tile entrances');
  assert.ok(a.channel.size >= 21 * 2 - 2, 'a 2-wide channel the whole length');
  // land on both long sides; but the two entrances face each other, so the straight line
  // between them is open to waves from outside
  assert.deepEqual(a.protection.parts, { shore: 31, breakwater: 27, exposure: 13 });
  assert.equal(a.protection.score, 71);
  assert.equal(a.berths.total, Math.floor((a.basin.size - a.channel.size) / 2));
  assert.equal(a.berths.reserved, Math.ceil(a.berths.total * 0.2));
  // heads: each side of both entrances, plus the four ends where the breakwater meets the shore
  assert.equal(a.heads.size, 8);
});

test('bay: one breakwater, one entrance - legal, with a warning to open a second', () => {
  const { map, basin } = fixture(BAY);
  const entrances = suggestTyphoonShelterEntrances(plan(basin), map);
  assert.equal(entrances.length, 1);
  assert.equal(entrances[0].side, 's');
  const a = analyzeTyphoonShelter(plan(basin, entrances), map);
  assert.ok(a.legal, JSON.stringify(codes(a)));
  assert.deepEqual(a.warnings.map((w) => w.code), ['oneEntrance']);
  assert.equal(a.ring.size, 8);
});

test('U shape: breakwater round three sides with two convex corners', () => {
  const { map, basin } = fixture(U_SHAPE);
  const a = analyzeTyphoonShelter(plan(basin), map);
  assert.equal(a.corners.size, 2);
  assert.deepEqual(codes(a), ['noEntrance']);
  const entrances = suggestTyphoonShelterEntrances(plan(basin), map);
  assert.equal(entrances.length, 2);
  const b = analyzeTyphoonShelter(plan(basin, entrances), map);
  assert.ok(b.legal, JSON.stringify(codes(b)));
  const fjord = analyzeTyphoonShelter(plan(fixture(FJORD).basin, suggestTyphoonShelterEntrances(plan(fixture(FJORD).basin), fixture(FJORD).map)), fixture(FJORD).map);
  assert.ok(b.protection.score < fjord.protection.score, 'less land round it, less protection');
});

test('too small, no shore, inland lake and map edge each say why', () => {
  const small = fixture([
    '##########',
    '##.....###',
    '##.....###',
    '##.....###',
    '~~~~~~~~~~',
    '~~~~~~~~~~',
  ]);
  assert.ok(codes(analyzeTyphoonShelter(plan(small.basin), small.map)).includes('basinTooSmall'));

  const offshore = fixture([
    '~~~~~~~~~~~~',
    '~~~~~~~~~~~~',
    '~~........~~',
    '~~........~~',
    '~~........~~',
    '~~........~~',
    '~~........~~',
    '~~........~~',
    '~~~~~~~~~~~~',
    '~~~~~~~~~~~~',
  ]);
  assert.ok(codes(analyzeTyphoonShelter(plan(offshore.basin), offshore.map)).includes('noShore'));

  const lake = fixture([
    '##############',
    '##############',
    '###........###',
    '###........###',
    '###........###',
    '###........###',
    '###........###',
    '###........###',
    '###~~~~~~~~###',
    '###~~~~~~~~###',
    '##############',
  ]);
  const lakeEntrances = [{ side: 's', along: 6, width: 2 }];
  assert.ok(codes(analyzeTyphoonShelter(plan(lake.basin, lakeEntrances), lake.map)).includes('entranceNoSea'));
  assert.deepEqual(suggestTyphoonShelterEntrances(plan(lake.basin), lake.map), []);

  const edge = fixture([
    '###########',
    '##........~',
    '##........~',
    '##........~',
    '##........~',
    '##........~',
    '##........~',
    '###########',
  ]);
  assert.ok(codes(analyzeTyphoonShelter(plan(edge.basin), edge.map)).includes('nearMapEdge'));
});

test('entrances: near a corner, too wide for a short side, and blocked by a bridge', () => {
  const { map, basin } = fixture(BAY);
  // the bay's breakwater runs along columns 3..10 on row 7
  assert.ok(codes(analyzeTyphoonShelter(plan(basin, [{ side: 's', along: 3, width: 2 }]), map)).includes('entranceNearCorner'));
  assert.ok(codes(analyzeTyphoonShelter(plan(basin, [{ side: 's', along: 5, width: 3 }]), map)).includes('entranceTooWide'));
  // a long side allows 3
  const fjord = fixture(FJORD);
  const wide = fixture([
    '#################',
    '##.............##',
    '##.............##',
    '##.............##',
    '##.............##',
    '##.............##',
    '##.............##',
    '~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~',
  ]);
  assert.ok(analyzeTyphoonShelter(plan(wide.basin, [{ side: 's', along: 7, width: 3 }]), wide.map).legal);
  assert.ok(fjord);
  const bridged = fixture([
    '##############',
    '###........###',
    '###........###',
    '###........###',
    '###........###',
    '###........###',
    '###........###',
    '~~~~~~~~~~~~~~',
    'BBBBBBBBBBBBBB',
    '~~~~~~~~~~~~~~',
  ]);
  // the sea beyond the bridge is the only way out; boats cannot pass under it
  assert.ok(codes(analyzeTyphoonShelter(plan(bridged.basin, [{ side: 's', along: 6, width: 2 }]), bridged.map)).includes('entranceNoSea'));
});

test('a staircase along a diagonal coast counts as one continuous shore', () => {
  const { map, basin } = fixture([
    '~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~',
    '~~...........#####',
    '~~............####',
    '~~.............###',
    '~~..............##',
    '~~..............##',
    '~~.............###',
    '~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~',
  ]);
  const a = analyzeTyphoonShelter(plan(basin, suggestTyphoonShelterEntrances(plan(basin), map)), map);
  assert.ok(!codes(a).includes('noShore'), JSON.stringify(codes(a)));
  assert.ok(a.longestShore >= 6);
});

test('one-tile notches are filled and one-tile spurs shaved', () => {
  const { map, basin } = fixture([
    '##############',
    '###........###',
    '###........###',
    '###........###',
    '###...~....###',
    '###........###',
    '###........###',
    '~~~~~.~~~~~~~~',
    '~~~~~~~~~~~~~~',
  ]);
  const out = normalizeTyphoonShelterBasin(basin, map);
  assert.ok(out.has('4:6'), 'notch filled');
  assert.ok(!out.has('7:5'), 'spur shaved');
});

test('expanding pushes the breakwater out: old line demolished, new line built, entrance follows', () => {
  const { map } = fixture(BAY.concat(['~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~']));
  const { basin } = fixture(BAY);
  const start = plan(basin, [{ side: 's', along: 6, width: 2 }]);
  const res = editTyphoonShelterBasin(start, map, { r0: 7, c0: 3, r1: 8, c1: 10 }, 'add');
  assert.ok(res.plan, res.rejected);
  assert.ok(res.analysis.legal, JSON.stringify(codes(res.analysis)));
  // the entrance kept its place along the side, two rows further out
  const ent = res.analysis.entrances[0];
  assert.deepEqual(ent.tiles, ['9:6', '9:7']);
  assert.equal(res.diff.demolish.length, 6, 'the old breakwater on row 7 (8 tiles, minus the 2-tile entrance)');
  assert.equal(res.diff.build.length, 6 + 4 + 2, 'row 9, the two new 2-tile stretches up the sides and their corners');
  assert.ok(res.diff.cost > 0);
});

test('cuts that would split the basin or lose the shore are refused', () => {
  const { map, basin } = fixture(FJORD);
  const start = plan(basin, suggestTyphoonShelterEntrances(plan(basin), map));
  const split = editTyphoonShelterBasin(start, map, { r0: 3, c0: 12, r1: 8, c1: 13 }, 'subtract');
  assert.equal(split.rejected, '水域分成幾塊');
  const ok = editTyphoonShelterBasin(start, map, { r0: 3, c0: 20, r1: 8, c1: 23 }, 'subtract');
  assert.ok(ok.plan, ok.rejected);
  assert.ok(ok.analysis.legal, JSON.stringify(codes(ok.analysis)));
  assert.equal(ok.analysis.entrances.find((e) => e.side === 'e').tiles.length, 2, 'the east entrance moved in with its side');
});

test('clicking the breakwater opens, widens and closes entrances', () => {
  const { map } = fixture(U_SHAPE.map((row) => row.replace('##............##', '##............##')));
  const wide = fixture([
    '#################',
    '##.............##',
    '##.............##',
    '##.............##',
    '##.............##',
    '##.............##',
    '##.............##',
    '~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~',
  ]);
  let p = plan(wide.basin);
  let entrances = toggleTyphoonShelterEntrance(p, wide.map, 7, 8);
  assert.deepEqual(entrances, [{ side: 's', along: 8, width: 2 }]);
  p = { ...p, entrances };
  entrances = toggleTyphoonShelterEntrance(p, wide.map, 7, 10);
  assert.deepEqual(entrances, [{ side: 's', along: 8, width: 3 }], 'widened on a side over 10 tiles');
  p = { ...p, entrances };
  assert.deepEqual(toggleTyphoonShelterEntrance(p, wide.map, 7, 9), [], 'clicking inside removes it');
  assert.ok(toggleTyphoonShelterEntrance(p, wide.map, 3, 8).rejected, 'not on the breakwater');
  assert.ok(map);
});

test('new plans get suggested entrances; saved state is normalised', () => {
  const { map, basin } = fixture(FJORD);
  const p = createTyphoonShelterPlan('ts3', basin, map, { seed: 7 });
  assert.equal(p.entrances.length, 2);
  const state = normalizeTyphoonShelterState({ nextId: 1, shelters: [p, { id: 'bad' }, null] });
  assert.equal(state.shelters.length, 1);
  assert.equal(state.nextId, 4);
  assert.deepEqual(normalizeTyphoonShelterState(undefined), { version: 1, nextId: 1, shelters: [] });
});
