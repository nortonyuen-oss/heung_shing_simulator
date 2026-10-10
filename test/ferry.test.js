const assert = require('node:assert/strict');
const test = require('node:test');
const ferry = require('../ferry.js');

const { FERRY, whyNotFerryPierAt, findFerryPath, ferryLeg, ferryVesselPoint, ferryBerthPoint, normalizeFerryState } = ferry;

// A map from rows of characters: '~' water, '.' land, '=' road, '#' blocked water.
function grid(rows) {
  const m = rows.map((r) => r.split(''));
  return {
    m,
    height: m.length,
    width: m[0].length,
    ctx: {
      isInside: (r, c) => r >= 0 && c >= 0 && r < m.length && c < m[0].length,
      isWater: (r, c) => m[r][c] === '~' || m[r][c] === '#',
      isShore: (r, c) => m[r][c] === '.',
      isRoad: (r, c) => m[r][c] === '=',
      isBlocked: (r, c) => m[r][c] === '#',
    },
  };
}

test('渡輪碼頭: a 2 x 2 straddling the shore - half sand or flat ground, half water - open water beyond, a road near', () => {
  const g = grid([
    '..=....',
    '.......',
    '~~~~~~~',
    '~~~~~~~',
    '~~~~~~~',
    '~~~~~~~',
  ]);
  assert.deepEqual(whyNotFerryPierAt(1, 2, g.ctx), { land: 'n' });
  // all on land, all on the water, half on the road
  assert.equal(whyNotFerryPierAt(0, 2, g.ctx).code, 'notShore');
  assert.equal(whyNotFerryPierAt(2, 2, g.ctx).code, 'notShore');
  assert.equal(whyNotFerryPierAt(0, 1, g.ctx).code, 'notShore');
  // no road within reach
  const far = grid(['.......', '.......', '.......', '~~~~~~~', '~~~~~~~', '~~~~~~~', '~~~~~~~']);
  assert.equal(whyNotFerryPierAt(2, 2, far.ctx).code, 'noRoad');
  // the water beyond taken (a shelter): nowhere for the ferry to lie
  const shut = grid(['..=....', '.......', '~~~~~~~', '~~###~~', '~~~~~~~']);
  assert.equal(whyNotFerryPierAt(1, 2, shut.ctx).code, 'noSea');
  assert.equal(whyNotFerryPierAt(2, 3, shut.ctx).code, 'occupied');
  // a bridge (or anything) over the berths, two or three tiles out: no
  const spanned = grid(['..=....', '.......', '~~~~~~~', '~~~~~~~', '~~~~~~~', '#######', '~~~~~~~']);
  assert.equal(whyNotFerryPierAt(1, 2, spanned.ctx).code, 'noSea');
  // a bridge within two tiles of the lot, either side: no
  const bridged = grid(['..=....', '.......', '~~~~~~~', '~~~~~~~', '~~~~~~~', '~~~~~~~']);
  const withBridge = (br, bc) => ({ ...bridged.ctx, isBridge: (r, c) => r === br && c === bc });
  assert.equal(whyNotFerryPierAt(1, 2, withBridge(2, 5)).code, 'nearBridge');
  assert.equal(whyNotFerryPierAt(1, 2, withBridge(2, 6)).code, undefined, 'three tiles off is clear');
  assert.deepEqual(whyNotFerryPierAt(1, 2, withBridge(2, 6)), { land: 'n' });
});

test('a ferry route sails the water in long straight runs, round the land between', () => {
  const g = grid([
    '..=.......=..',
    '.............',
    '~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~',
  ]);
  const a = { id: 'a', row: 1, col: 1, land: 'n' };
  const b = { id: 'b', row: 1, col: 10, land: 'n' };
  const path = findFerryPath(a, b, (r, c) => g.ctx.isWater(r, c) && !g.ctx.isBlocked(r, c)
    && !(r === 2 && (c === 1 || c === 2 || c === 10 || c === 11)), g.height, g.width);
  assert.ok(path && path.length > 0);
  // out from one end of A's face, in at one end of B's
  const ends = (p) => ferry.ferryBerthEnds(p).map((e) => e.tile.join(','));
  assert.ok(ends(a).includes(path[0].join(',')), path[0]);
  assert.ok(ends(b).includes(path[path.length - 1].join(',')), path[path.length - 1]);
  // between them it keeps along the shore, out of the piers' lots
  // along one row: no zig-zag
  const turns = path.slice(2).filter((p, i) => (p[0] - path[i + 1][0]) !== (path[i + 1][0] - path[i][0])).length;
  assert.ok(turns <= 2, `${turns} turns`);
  // walled off: no route
  assert.equal(findFerryPath(a, b, (r, c) => g.ctx.isWater(r, c) && c !== 6, g.height, g.width), null);
});

test('ferries keep one timetable: alongside A, across, alongside B, back - evenly apart', () => {
  const a = { row: 0, col: 0, land: 'n' };
  const b = { row: 0, col: 10, land: 'n' };
  const path = [[3, 0], [3, 5], [3, 10]];
  const legs = { out: ferryLeg(a, b, path), back: ferryLeg(b, a, [...path].reverse()) };
  const berth = ferryBerthPoint(a);
  // side-on along the pier's flank, square to the shore: its inner end at the shoreline, beside
  // the pier (pierLengthM across the lot's middle)
  assert.deepEqual([berth.r, berth.c], [0.5 + FERRY.lengthTiles / 2 + FERRY.berthGapTiles,
    0.5 - (FERRY.pierLengthM / 40 + FERRY.beamTiles / 2 + FERRY.berthGapTiles)]);
  const at0 = ferryVesselPoint(legs, 0);
  assert.equal(at0.state, 'alongside');
  assert.equal(at0.dir, 's', 'alongside, square to the shore, the way it will leave');
  // and the way back is the same view: it sails the other way, never turning round
  assert.equal(ferry.FERRY_DRAW_HEADING.s, ferry.FERRY_DRAW_HEADING.n);
  assert.equal(ferry.FERRY_DRAW_HEADING.w, ferry.FERRY_DRAW_HEADING.e);
  assert.equal(at0.pier, 0);
  const sailing = ferryVesselPoint(legs, FERRY.dwellMinutes + 3);
  assert.equal(sailing.state, 'sailing');
  const outT = legs.out.total / FERRY.speedTilesPerMinute;
  assert.equal(ferryVesselPoint(legs, FERRY.dwellMinutes + outT + 1).pier, 1);
  // two ferries half a round trip apart: one at each end at the start
  const cycle = 2 * FERRY.dwellMinutes + outT + legs.back.total / FERRY.speedTilesPerMinute;
  const second = ferryVesselPoint(legs, 0, 1, 2);
  assert.deepEqual(second, ferryVesselPoint(legs, cycle / 2));
  // one heading per segment, along the way it goes
  assert.equal(ferryVesselPoint(legs, FERRY.dwellMinutes + outT / 2).dir, 'e');
});

test('the ferry state keeps only what is whole: piers with a shore side, routes between two of them', () => {
  const s = normalizeFerryState({
    piers: [{ id: 'pier-1', row: 3, col: 4, land: 'w' }, { id: 'pier-2', row: 9, col: 9, land: 'x' }, { id: 'pier-3', row: 1, col: 1, land: 'n' }],
    routes: [{ id: 'f1', pierIds: ['pier-1', 'pier-3'] }, { id: 'f2', pierIds: ['pier-1', 'pier-2'] }],
    nextId: 7,
  });
  assert.deepEqual(s.piers.map((p) => p.id), ['pier-1', 'pier-3']);
  assert.deepEqual(s.routes.map((r) => r.id), ['f1']);
  // a save from before the fleet: the route's one ferry becomes a ferry of the company's
  assert.equal(s.vessels.length, 1);
  assert.equal(s.vessels[0].routeId, 'f1');
  assert.equal(s.nextId, 7);
  assert.deepEqual(normalizeFerryState(undefined), { piers: [], routes: [], vessels: [], nextId: 1, nextVesselId: 1, stormSurgeHour: null });
});

test('the fleet: two ferries of a legacy route spaced evenly, their passengers kept; ferries of a lost route dropped', () => {
  const s = normalizeFerryState({
    piers: [{ id: 'a', row: 1, col: 1, land: 'n' }, { id: 'b', row: 1, col: 9, land: 'n' }],
    routes: [{ id: 'r', pierIds: ['a', 'b'], vessels: 2, aboard: [12, 30] }],
  });
  assert.deepEqual(s.vessels.map((v) => [v.phase, v.aboard]), [[0, 12], [0.5, 30]]);
  const later = normalizeFerryState({ ...s, routes: [] });
  assert.equal(later.vessels.length, 0);
});

test('a ferry joins its timetable in the widest gap: nobody moves', () => {
  assert.equal(ferry.ferryJoiningPhase([]), 0);
  assert.equal(ferry.ferryJoiningPhase([0]), 0.5);
  assert.equal(ferry.ferryJoiningPhase([0, 0.5]), 0.25);
  assert.ok(Math.abs(ferry.ferryJoiningPhase([0.1, 0.2]) - 0.65) < 1e-9);
});

test('a pier serves its own shore within five tiles: never across the water', () => {
  // land rows 0-3, sea row 4-5, the far shore rows 6-9; the pier on the near shore facing south
  const rows = ['..........', '..........', '..........', '..........', '~~~~~~~~~~', '~~~~~~~~~~', '..........', '..........', '..........', '..........'];
  const isLand = (r, c) => r >= 0 && c >= 0 && r < rows.length && c < 10 && rows[r][c] === '.';
  const land = ferry.ferryPierCatchmentLand({ row: 3, col: 4, land: 'n' }, isLand);
  assert.ok(land.has('3:4') && land.has('0:4'));
  assert.ok(![...land].some((k) => Number(k.split(':')[0]) >= 4), 'nothing on the water or across it');
  assert.ok(![...land].some((k) => { const [r, c] = k.split(':').map(Number); return Math.abs(r - 2.5) + Math.abs(c - 4.5) > FERRY.catchmentRadius; }));
});

test('a ferry broken down carries on from where it stopped', () => {
  const legs = { out: ferryLeg({ row: 0, col: 0, land: 'n' }, { row: 0, col: 10, land: 'n' }, [[3, 0], [3, 5], [3, 10]]),
    back: ferryLeg({ row: 0, col: 10, land: 'n' }, { row: 0, col: 0, land: 'n' }, [[3, 10], [3, 5], [3, 0]]) };
  const cycle = ferry.ferryCycleMinutes(legs);
  const phase = 0.1;
  const stopped = 40;
  const away = 120;
  const before = ferry.ferryVesselPointAt(legs, stopped, phase);
  // put back by the time away: at its return it is where it stopped
  const resumed = (((phase - away / cycle) % 1) + 1) % 1;
  const after = ferry.ferryVesselPointAt(legs, stopped + away, resumed);
  assert.ok(Math.abs(after.r - before.r) < 1e-9 && Math.abs(after.c - before.c) < 1e-9);
});

test('berthings: each ferry at A at the start of its round trip, at B as the outward leg ends; fares on landing', () => {
  const a = { row: 0, col: 0, land: 'n' };
  const b = { row: 0, col: 10, land: 'n' };
  const path = [[3, 0], [3, 5], [3, 10]];
  const legs = { out: ferryLeg(a, b, path), back: ferryLeg(b, a, [...path].reverse()) };
  const outT = legs.out.total / FERRY.speedTilesPerMinute;
  const cycle = 2 * FERRY.dwellMinutes + outT + legs.back.total / FERRY.speedTilesPerMinute;
  // one round trip from just before 0: A at 0, B at dwell + out
  const one = ferry.ferryArrivals(legs, -0.5, cycle - 1, 1);
  assert.deepEqual(one.map((e) => e.pier), [0, 1]);
  assert.ok(Math.abs(one[1].t - (FERRY.dwellMinutes + outT)) < 1e-9);
  // the berthings agree with where the timetable puts the ferry
  assert.equal(ferryVesselPoint(legs, one[1].t + 0.01).pier, 1);
  // two ferries: twice the berthings, half a round trip apart
  assert.equal(ferry.ferryArrivals(legs, 0, cycle * 3, 2).length, 12);
  // landing: everyone aboard pays, the queue boards up to the capacity
  assert.deepEqual(ferry.ferryBerthing(120, 50), { alighting: 120, boarding: 50, revenue: 120 * FERRY.fare });
  assert.equal(ferry.ferryBerthing(0, 9999).boarding, FERRY.capacity);
});

