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

// laying, as the game does: removes, then adds
const layAll = (tracks, plan) => {
  plan.removes.forEach(({ row, col, bit }) => { const k = `${row}:${col}`; tracks[k] &= ~bit; if (!tracks[k]) delete tracks[k]; });
  plan.adds.forEach(({ row, col, bit }) => { const k = `${row}:${col}`; tracks[k] = (tracks[k] || 0) | bit; });
  return tracks;
};

test('two drags round a block close a loop: each end of the second turns in', () => {
  const tiles = new Set([...line(2, 2, 2, 6), ...line(6, 2, 6, 6), ...line(2, 2, 6, 2), ...line(2, 6, 6, 6)]);
  const tracks = {};
  // north side then down the east side; back along the south side and up the west
  layAll(tracks, tram.planTramTrack({ row: 2, col: 2 }, { row: 6, col: 6 }, tracks, road(tiles)));
  layAll(tracks, tram.planTramTrack({ row: 6, col: 6 }, { row: 2, col: 2 }, tracks, road(tiles)));
  assert.equal(tracks['2:2'], 8, 'north-west corner: s-e');
  assert.equal(tracks['2:6'], 16, 'north-east: w-s');
  assert.equal(tracks['6:6'], 4, 'south-east: w-n');
  assert.equal(tracks['6:2'], 32, 'south-west: n-e');
  assert.equal(tracks['4:2'], 1);
  assert.equal(tracks['2:4'], 2);
});

test('a branch meeting a line passing through makes a T both ways; crossing it, a crossing', () => {
  const tiles = new Set([...line(1, 5, 9, 5), ...line(5, 1, 5, 9)]);
  const tracks = {};
  layAll(tracks, tram.planTramTrack({ row: 1, col: 5 }, { row: 9, col: 5 }, tracks, road(tiles)));
  const t = layAll({ ...tracks }, tram.planTramTrack({ row: 5, col: 1 }, { row: 5, col: 5 }, tracks, road(tiles)));
  assert.equal(t['5:5'], 1 | 4 | 16, 'the straight, and w-n and w-s');
  const x = layAll({ ...tracks }, tram.planTramTrack({ row: 5, col: 1 }, { row: 5, col: 9 }, tracks, road(tiles)));
  assert.equal(x['5:5'], 1 | 2, 'straight over: X and Y');
});

test('end-of-line rules: carried on round a corner; already joined, nothing', () => {
  const joined = (sides) => (s) => sides.includes(s);
  assert.deepEqual(tram.tramEndChange(1, 'e', joined(['s'])), { add: 8, remove: 1 }, 'a line ending north, carried on east: s-e');
  assert.deepEqual(tram.tramEndChange(1, 'n', joined(['s'])), { add: 0, remove: 0 });
  assert.deepEqual(tram.tramEndChange(0, 'w', joined(['n', 's'])), { add: 4 | 16, remove: 0 }, 'beside a line both ways: a T');
  assert.deepEqual(tram.tramEndChange(0, 'w', joined(['e', 'n'])), { add: 2, remove: 0 }, 'straight on first');
});

// a dual carriageway up columns 5-6, rows 2..8, row 5 a junction (not a band); a narrow road up column 5
// from row 9 (the band's end, a T)
const bandAt = (r, c) => (r >= 2 && r <= 8 && r !== 5 && (c === 5 || c === 6)) ? { orientation: 'v', width: 2, index: c - 5 } : null;
const mainLine = () => {
  const tracks = {};
  for (let r = 2; r <= 14; r++) tracks[`${r}:5`] = 1;
  for (let r = 2; r <= 8; r++) if (r !== 5) tracks[`${r}:6`] = 1;
  return tracks;
};
const xsAt = (geo, tile, y) => geo.tracks.filter((t) => t.link.tile === tile)
  .map((t) => t.pts.find(([, py]) => Math.abs(py - y) < 1e-9)[0]).sort((a, b) => a - b);
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

test('narrow road into a reservation: the tracks shift across over two tiles, eased as the MTR does', () => {
  const geo = tram.buildTramTrackGeometry(mainLine(), bandAt);
  assert.ok(near(xsAt(geo, '9:5', 10), [5.38, 5.62]), 'in the lanes');
  assert.ok(near(xsAt(geo, '9:5', 9), [5.65, 5.85]), 'half way, between the two tiles');
  assert.ok(near(xsAt(geo, '8:5', 8), [5.92, 6.08]), 'in the reservation, 1.6 m off its middle');
  // eased: square on at each end (no kink), steepest half way
  const [west] = geo.tracks.filter((t) => t.link.tile === '9:5');
  const p = west.pts;
  assert.ok(Math.abs(p[1][0] - p[0][0]) > Math.abs(p.at(-1)[0] - p.at(-2)[0]), 'leaves the lane gently');
  // the band's two halves' bits are the one double track
  assert.equal(geo.links.filter((l) => l.tile === '3:5' || l.tile === '3:6').length, 1);
});

test("a junction across a dual carriageway: the reservation's line carried straight over", () => {
  const geo = tram.buildTramTrackGeometry(mainLine(), bandAt);
  assert.ok(near(xsAt(geo, '5:5', 5.5), [5.92, 6.08]));
  // the far track lies on the other half's tile, track or not: drawn there
  assert.ok(geo.tiles.get('5:6').tracks.length > 0);
  assert.equal(geo.tiles.get('5:6').paving, null, 'no reservation paving on a junction');
  assert.equal(geo.tiles.get('3:5').paving, 'e');
  assert.equal(geo.tiles.get('3:6').paving, 'w');
});

test('turning off a reservation: left-hand running, and toward its far half the turn takes in the tile beyond', () => {
  const tracks = mainLine();
  tracks['5:5'] |= 16;      // w-s: north up the reservation, then west
  tracks['5:4'] = 2;
  tracks['5:5'] |= 8;       // s-e: then east, over the other half's tile
  tracks['5:6'] = 2;
  tracks['5:7'] = 2;
  const geo = tram.buildTramTrackGeometry(tracks, bandAt);
  const west = geo.links.find((l) => l.tile === '5:5' && l.bit === 16);
  const curves = geo.tracks.filter((t) => t.link === west).map((t) => t.pts);
  // the inner track (the west one, northbound, keeping left) comes out on the south side going west
  const inner = curves.find((pts) => Math.abs(pts[0][1] - 6) < 1e-9 ? pts[0][0] < 6 : pts.at(-1)[0] < 6);
  const westEnd = [inner[0], inner.at(-1)].find(([x]) => Math.abs(x - 5) < 1e-9);
  assert.ok(Math.abs(westEnd[1] - 5.62) < 1e-6, 'west track turns onto the south track');
  const east = geo.links.find((l) => l.tile === '5:5' && l.bit === 8);
  assert.equal(east.to.key, 'V7:5', 'the turn reaches the far side of the other half');
  assert.equal(geo.links.find((l) => l.tile === '5:6').consumed, true);
});

test("a tile's own frame turns with the map as its sides do (n to e)", () => {
  assert.deepEqual(tram.tramTileLocal(3.5, 7, 7, 3, 1), [1, 0.5], 'the north edge middle to the east');
  assert.deepEqual(tram.tramTileLocal(3.5, 7, 7, 3, 0), [0.5, 0]);
  assert.deepEqual(tram.tramTileLocal(3.5, 7, 7, 3, 4), [0.5, 0]);
});
