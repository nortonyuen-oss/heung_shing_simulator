const test = require('node:test');
const assert = require('node:assert/strict');
const tram = require('../tram.js');

const road = (tiles) => (row, col) => tiles.has(`${row}:${col}`);
const line = (r0, c0, r1, c1) => { const s = new Set(); for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) s.add(`${r}:${c}`); return s; };

test('a drag lays a track along the road, straight then round one corner', () => {
  const tiles = new Set([...line(5, 2, 5, 8), ...line(5, 8, 10, 8)]);
  const plan = tram.planTramTrack({ row: 5, col: 2 }, { row: 10, col: 8 }, {}, road(tiles));
  assert.equal(plan.ok, true);
  const bit = (r, c) => plan.adds.filter((a) => a.row === r && a.col === c).reduce((m, a) => m | a.bit, 0);
  // the longer way first: along the column (rows 5..10) - here the rows are 5, the cols 6: cols first
  assert.equal(bit(5, 4), 2, 'w-e along the row');
  assert.equal(bit(5, 8), 16, 'the corner joins w and s');
  assert.equal(bit(8, 8), 1, 's-n along the column');
  assert.equal(plan.cost, 12 * 120);
});

test('off the road, nothing is laid and the tile is named', () => {
  const tiles = line(5, 2, 5, 5);
  const plan = tram.planTramTrack({ row: 5, col: 2 }, { row: 5, col: 7 }, {}, road(tiles));
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'notRoad');
  assert.equal(plan.bad, '5:6');
});

test('a drag ending beside track joins it; track already laid costs nothing', () => {
  const tiles = new Set([...line(5, 2, 5, 8), ...line(2, 8, 5, 8)]);
  const tracks = { '4:8': 1, '3:8': 1 };
  const plan = tram.planTramTrack({ row: 5, col: 2 }, { row: 5, col: 8 }, tracks, road(tiles));
  const end = plan.adds.find((a) => a.row === 5 && a.col === 8);
  assert.equal(end.bit, 4, 'turns north into the track there (w-n)');
  const again = tram.planTramTrack({ row: 3, col: 8 }, { row: 4, col: 8 }, tracks, road(tiles));
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'nothing');
});

test("a dual carriageway's reservation is the kerb toward the band's middle", () => {
  assert.equal(tram.tramReservationSideOf({ orientation: 'h', width: 2, index: 0 }), 's');
  assert.equal(tram.tramReservationSideOf({ orientation: 'h', width: 2, index: 1 }), 'n');
  assert.equal(tram.tramReservationSideOf({ orientation: 'v', width: 4, index: 1 }), 'e');
  assert.equal(tram.tramReservationSideOf({ orientation: 'v', width: 4, index: 0 }), null);
  assert.equal(tram.tramReservationSideOf({ orientation: 'v', width: 3, index: 1 }), null, 'an odd band shares its middle lane');
  assert.equal(tram.tramReservationSideOf(null), null);
});

test('saved track is kept to what makes sense', () => {
  const s = tram.normalizeTramState({ tracks: { '3:4': 2, '3:5': 0, 'x:y': 1, '9:9': 99, '1:2': '16' } });
  assert.deepEqual(s.tracks, { '3:4': 2, '1:2': 16 });
});
