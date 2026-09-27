const assert = require('node:assert/strict');
const test = require('node:test');
const {
  computePedestrianRailingPlacements,
  pedestrianRailingFacing,
  pedestrianRailingTextureKey,
  pedestrianRailingId,
} = require('../pedestrian-railings.js');

// ASCII map: '+' cross, 'T' T-junction, '|' / '-' straight (n-s / e-w), 'Z' a straight showing a
// zebra crossing whose stripe-free half is `zebraFarSide`, '.' not road.
function mapFrom(rows, { zebraAxis = 'v', zebraFarSide = 's' } = {}) {
  const at = (r, c) => (r >= 0 && c >= 0 && r < rows.length && c < rows[0].length ? rows[r][c] : '.');
  const roadKeyAt = (r, c) => {
    const ch = at(r, c);
    if (ch === '+') return 'road_cross';
    if (ch === 'T') return 'road_t_n';
    if (ch === '|') return 'road_straight_v';
    if (ch === '-') return 'road_straight_h';
    if (ch === 'Z') return zebraAxis === 'v' ? 'road_straight_v' : 'road_straight_h';
    return null;
  };
  return { mapWidth: rows[0].length, mapHeight: rows.length, roadKeyAt, zebraFarSideAt: (r, c) => (at(r, c) === 'Z' ? zebraFarSide : null) };
}

const ids = (placements) => placements.map(pedestrianRailingId).sort();

test('the straight tile before each arm of a cross junction gets both kerbs, over its half nearest the junction', () => {
  const placements = computePedestrianRailingPlacements(mapFrom([
    '..|..',
    '..|..',
    '--+--',
    '..|..',
    '..|..',
  ]));
  assert.deepEqual(ids(placements), [
    '1:2:e:s', '1:2:w:s', // north approach: both kerbs, the half towards the junction (south)
    '2:1:n:e', '2:1:s:e',
    '2:3:n:w', '2:3:s:w',
    '3:2:e:n', '3:2:w:n',
  ]);
});

test('a T junction fences its three approaches; tiles two away from the junction get nothing', () => {
  const placements = computePedestrianRailingPlacements(mapFrom([
    '..|..',
    '..|..',
    '--T--',
    '.....',
  ]));
  assert.equal(placements.length, 6);
  assert.ok(placements.every((p) => Math.abs(p.row - 2) + Math.abs(p.col - 2) === 1));
});

test('a zebra crossing is fenced on both kerbs: the straights either side, and its own stripe-free half', () => {
  const placements = computePedestrianRailingPlacements(mapFrom(['.|.', '.|.', '.Z.', '.|.', '.|.']));
  assert.deepEqual(ids(placements), [
    '1:1:e:s', '1:1:w:s', // before it, towards the crossing
    '2:1:e:s', '2:1:w:s', // the zebra tile, over its half clear of the stripes
    '3:1:e:n', '3:1:w:n', // after it, towards the crossing
  ]);
  const other = computePedestrianRailingPlacements(mapFrom(['.|.', '.|.', '.Z.', '.|.', '.|.'], { zebraFarSide: 'n' }));
  assert.ok(ids(other).includes('2:1:e:n') && !ids(other).includes('2:1:e:s'), 'follows whichever half is clear');
});

test('no railing on a kerb that faces more road (a dual carriageway median), nor on a bus stop tile', () => {
  // Two parallel n-s carriageways (cols 1-2) crossing an e-w pair (rows 2-3) - a 2x2 junction block.
  const rows = ['.||.', '.||.', '-++-', '-++-', '.||.', '.||.'];
  const map = mapFrom(rows);
  const placements = computePedestrianRailingPlacements(map);
  const across = { n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] };
  placements.forEach((p) => {
    const [dr, dc] = across[p.side];
    assert.equal(map.roadKeyAt(p.row + dr, p.col + dc), null, `${pedestrianRailingId(p)} stands on a pavement kerb`);
  });
  assert.equal(placements.length, 8, 'one outer kerb per carriageway, per side of the junction');
  const withStop = computePedestrianRailingPlacements({ ...map, hasBusStopAt: (r, c) => r === 1 && c === 1 });
  assert.equal(withStop.length, 7);
  assert.ok(!withStop.some((p) => p.row === 1 && p.col === 1));
});

test('a run faces the screen edge of its kerb and follows the view rotation', () => {
  const placement = { row: 5, col: 5, side: 'n', toward: 'e' };
  assert.equal(pedestrianRailingFacing(placement, 0), 'ne');
  assert.equal(pedestrianRailingTextureKey('ne'), 'pedestrian_railing_h', 'NE/SW kerbs run NW-SE');
  assert.equal(pedestrianRailingTextureKey('se'), 'pedestrian_railing_v', 'SE/NW kerbs run SW-NE');
  global.rotateDirection = (d, steps) => ['n', 'e', 's', 'w'][(['n', 'e', 's', 'w'].indexOf(d) + steps) % 4];
  try {
    assert.equal(pedestrianRailingFacing(placement, 1), 'se');
    assert.equal(pedestrianRailingFacing(placement, 2), 'sw');
  } finally {
    delete global.rotateDirection;
  }
});
