const assert = require('node:assert/strict');
const test = require('node:test');
const {
  resolveRoadLineBusStopVariant,
  resolveRoadLineApproachVariant,
  getRoadLineVariantAt,
} = require('../road-line-variants.js');

// A small grid from ASCII: '+' a cross junction, 'T' a T-junction missing its north arm,
// '-' a horizontal straight, '|' a vertical straight, '.' not a road.
function gridFromRows(rows) {
  const keyFor = { '+': 'road_cross', 'T': 'road_t_n', '-': 'road_straight_h', '|': 'road_straight_v', '.': null };
  const roadKeyAt = (row, col) => {
    if (row < 0 || row >= rows.length || col < 0 || col >= rows[0].length) return null;
    return keyFor[rows[row][col]];
  };
  return roadKeyAt;
}

function withMarkings(calibrated, fn) {
  global.roadTileVariantHasLineMarkings = (logicalKey, variantId) => (
    (calibrated[logicalKey] || []).includes(variantId)
  );
  try {
    return fn();
  } finally {
    delete global.roadTileVariantHasLineMarkings;
  }
}

test('resolveRoadLineBusStopVariant maps rotation-resolved corners to the calibrated ids', () => {
  assert.equal(resolveRoadLineBusStopVariant('road_straight_v', ['ur']), 'busStopNE');
  assert.equal(resolveRoadLineBusStopVariant('road_straight_v', ['ll']), 'busStopSW');
  assert.equal(resolveRoadLineBusStopVariant('road_straight_v', ['ur', 'll']), 'busStopBoth2');
  assert.equal(resolveRoadLineBusStopVariant('road_straight_h', ['ul']), 'busStopNW');
  assert.equal(resolveRoadLineBusStopVariant('road_straight_h', ['lr']), 'busStopSE');
  assert.equal(resolveRoadLineBusStopVariant('road_straight_h', ['ul', 'lr']), 'busStopBoth1');
  assert.equal(resolveRoadLineBusStopVariant('road_straight_v', null), null);
  assert.equal(resolveRoadLineBusStopVariant('road_straight_v', ['ul']), null, 'a corner from the wrong axis is not a road_straight_v stop');
});

test('resolveRoadLineApproachVariant names the approach after the junction side the tile is on', () => {
  // towardJunction is where the junction lies from this tile; the tile sits on the opposite side.
  assert.equal(resolveRoadLineApproachVariant('road_straight_v', 'north', true), 'dualLaneStopS');
  assert.equal(resolveRoadLineApproachVariant('road_straight_v', 'south', true), 'dualLaneStopN');
  assert.equal(resolveRoadLineApproachVariant('road_straight_h', 'east', true), 'dualLaneStopW');
  assert.equal(resolveRoadLineApproachVariant('road_straight_h', 'west', true), 'dualLaneStopE');
  assert.equal(resolveRoadLineApproachVariant('road_straight_v', 'south', false), 'singleCrossStopN');
  assert.equal(resolveRoadLineApproachVariant('road_straight_h', 'west', false), 'singleCrossStopE');
  assert.equal(resolveRoadLineApproachVariant('road_straight_v', 'east', true), null, 'cross-axis direction is never an approach');
});

const APPROACHES = {
  road_straight_v: ['dualLaneStopN', 'dualLaneStopS', 'singleCrossStopN', 'singleCrossStopS', 'busStopNE', 'zebraCrossingNS'],
  road_straight_h: ['dualLaneStopE', 'dualLaneStopW', 'singleCrossStopE', 'singleCrossStopW', 'zebraCrossing'],
};

test('a bus stop wins the tile outright, even on a junction approach', () => {
  const roadKeyAt = gridFromRows(['.+.', '.|.', '.|.', '.|.', '.|.']);
  withMarkings(APPROACHES, () => {
    const variant = getRoadLineVariantAt(1, 1, {
      roadKeyAt,
      busStopVisualCornersAt: (row, col) => (row === 1 && col === 1 ? ['ur'] : null),
      carriagewayBandAt: (row, col) => (row === 1 && col === 1 ? { orientation: 'v', direction: 'north', width: 2, index: 0 } : null),
    });
    assert.equal(variant, 'busStopNE');
  });
});

test('dual carriageway: the carriageway entering the junction gets dualLaneStop for its side', () => {
  // row0: junction; row1: band tile south of it. Northbound = entering -> it is the S approach.
  const roadKeyAt = gridFromRows(['.+.', '.|.']);
  withMarkings(APPROACHES, () => {
    const northbound = { orientation: 'v', direction: 'north', width: 2, index: 0 };
    assert.equal(getRoadLineVariantAt(1, 1, { roadKeyAt, carriagewayBandAt: () => northbound }), 'dualLaneStopS');
    const southbound = { orientation: 'v', direction: 'south', width: 2, index: 1 };
    assert.equal(getRoadLineVariantAt(1, 1, { roadKeyAt, carriagewayBandAt: () => southbound }), null, 'leaving the junction stays plain');
    const shared = { orientation: 'v', direction: 'shared', width: 3, index: 1 };
    assert.equal(getRoadLineVariantAt(1, 1, { roadKeyAt, carriagewayBandAt: () => shared }), null, 'a shared middle lane stays plain');
  });
});

test('dual carriageway: all four sides of a junction', () => {
  //   . | .        a band tile on each side of the junction at (2,2), each entering it
  //   . | .
  //   - + -
  //   . | .
  const roadKeyAt = gridFromRows(['..|..', '..|..', '--+--', '..|..', '..|..']);
  const bandAt = { '1,2': 'south', '3,2': 'north', '2,1': 'east', '2,3': 'west' };
  const carriagewayBandAt = (r, c) => (bandAt[`${r},${c}`] ? { orientation: 'x', direction: bandAt[`${r},${c}`], width: 2, index: 0 } : null);
  withMarkings(APPROACHES, () => {
    const at = (r, c) => getRoadLineVariantAt(r, c, { roadKeyAt, carriagewayBandAt });
    assert.equal(at(1, 2), 'dualLaneStopN');
    assert.equal(at(3, 2), 'dualLaneStopS');
    assert.equal(at(2, 1), 'dualLaneStopW');
    assert.equal(at(2, 3), 'dualLaneStopE');
  });
});

test('single carriageway: the straight on each side of a junction gets singleCrossStop for its side', () => {
  const roadKeyAt = gridFromRows(['..|..', '..|..', '--+--', '..|..', '..|..']);
  withMarkings(APPROACHES, () => {
    const at = (r, c) => getRoadLineVariantAt(r, c, { roadKeyAt });
    assert.equal(at(1, 2), 'singleCrossStopN');
    assert.equal(at(3, 2), 'singleCrossStopS');
    assert.equal(at(2, 1), 'singleCrossStopW');
    assert.equal(at(2, 3), 'singleCrossStopE');
    assert.equal(at(0, 2), null, 'two tiles away is not an approach');
  });
});

test('a T-junction counts; a corner or a dead end does not', () => {
  withMarkings(APPROACHES, () => {
    assert.equal(getRoadLineVariantAt(1, 1, { roadKeyAt: gridFromRows(['.T.', '.|.']) }), 'singleCrossStopS');
    const corner = gridFromRows(['.+.', '.|.']);
    const cornerAt = (r, c) => (r === 0 && c === 1 ? 'road_corner_ne' : corner(r, c));
    assert.equal(getRoadLineVariantAt(1, 1, { roadKeyAt: cornerAt }), null);
  });
});

test('a one-tile stub between two junctions shows one approach, not a mix', () => {
  withMarkings(APPROACHES, () => {
    assert.equal(getRoadLineVariantAt(1, 0, { roadKeyAt: gridFromRows(['+', '|', '+']) }), 'singleCrossStopS');
  });
});

test('a junction approach is not plain, so zebras keep 3 plain tiles clear of it', () => {
  // junction, then an 8-tile straight: approach at row 1, plain run rows 2..8 (7 tiles) -> zebra at row 5.
  const roadKeyAt = gridFromRows(['+', '|', '|', '|', '|', '|', '|', '|', '|']);
  withMarkings(APPROACHES, () => {
    const zebras = [1, 2, 3, 4, 5, 6, 7, 8].filter((r) => getRoadLineVariantAt(r, 0, { roadKeyAt }) === 'zebraCrossingNS');
    assert.deepEqual(zebras, [5]);
  });
});

test('a single-lane straight tile with 3 plain tiles on both sides is eligible for a zebra crossing', () => {
  // 7-tile straight run (indices 0..6); the middle tile (3) has 3 plain tiles each side.
  const vColumn = gridFromRows(['|', '|', '|', '|', '|', '|', '|']);
  withMarkings({ road_straight_v: ['zebraCrossingNS'] }, () => {
    assert.equal(getRoadLineVariantAt(3, 0, { roadKeyAt: vColumn }), 'zebraCrossingNS');
  });
});

test('a zebra crossing needs the full 3-tile clearance on BOTH sides, not just one', () => {
  const vColumn = gridFromRows(['|', '|', '|', '+', '|', '|', '|', '|']); // junction 3 tiles from the top
  withMarkings({ road_straight_v: ['zebraCrossingNS'] }, () => {
    // Tile at row 6: 3 plain above (5,4,... wait check below) -- pick a tile too close to row3.
    assert.equal(getRoadLineVariantAt(5, 0, { roadKeyAt: vColumn }), null, 'only 1 plain tile above before the junction');
    assert.equal(getRoadLineVariantAt(4, 0, { roadKeyAt: vColumn }), null, 'directly next to the junction');
  });
});

test('a zebra crossing does not appear on a band tile, nor where a neighbour in the run is a band tile', () => {
  const vColumn = gridFromRows(['|', '|', '|', '|', '|', '|', '|']);
  withMarkings({ road_straight_v: ['zebraCrossingNS'] }, () => {
    assert.equal(
      getRoadLineVariantAt(3, 0, { roadKeyAt: vColumn, carriagewayBandAt: (row) => (row === 3 ? { direction: 'north' } : null) }),
      null,
      'the tile itself is a band tile',
    );
    assert.equal(
      getRoadLineVariantAt(3, 0, { roadKeyAt: vColumn, carriagewayBandAt: (row) => (row === 1 ? { direction: 'north' } : null) }),
      null,
      'a tile within the required clearance is a band tile',
    );
  });
});

test('an uncalibrated variant never gets assigned, even where its condition holds', () => {
  const vColumn = gridFromRows(['|', '|', '|', '|', '|', '|', '|']);
  withMarkings({}, () => {
    assert.equal(getRoadLineVariantAt(3, 0, { roadKeyAt: vColumn }), null);
  });
});

test('a non-straight tile (junction, corner, non-road) never gets a variant', () => {
  const roadKeyAt = gridFromRows(['.+.']);
  withMarkings({ road_cross: ['busStopNE'] }, () => {
    assert.equal(getRoadLineVariantAt(0, 1, { roadKeyAt }), null);
    assert.equal(getRoadLineVariantAt(0, 0, { roadKeyAt }), null);
  });
});

// What getTileKey reports at an odd mapRotation: straights swap v/h (rotateTileKey, main.js).
function renderedAtOddRotation(baseRoadKeyAt) {
  const swap = { road_straight_v: 'road_straight_h', road_straight_h: 'road_straight_v' };
  return (row, col) => {
    const key = baseRoadKeyAt(row, col);
    return swap[key] ?? key;
  };
}

test('zebra geometry is read in the map frame, so a rotated view (v/h swapped) still finds it', () => {
  const base = gridFromRows(['|', '|', '|', '|', '|', '|', '|']);
  withMarkings({ road_straight_h: ['zebraCrossing'], road_straight_v: ['zebraCrossingNS'] }, () => {
    for (const rotation of [1, 3]) {
      const variant = getRoadLineVariantAt(3, 0, {
        roadKeyAt: renderedAtOddRotation(base),
        baseRoadKeyAt: base,
        rotation,
      });
      assert.equal(variant, 'zebraCrossing', `rotation ${rotation}: texture follows the rendered (h) key`);
    }
  });
});

test('junction approaches follow the view rotation: geometry in map frame, texture on screen', () => {
  // Band tile south of a junction, northbound (entering). On screen after N turns the junction
  // lies map-north rotated; the texture is picked against the rendered key.
  const base = gridFromRows(['.+.', '.|.']);
  const northbound = { orientation: 'v', direction: 'north', width: 2, index: 0 };
  withMarkings(APPROACHES, () => {
    const at = (rotation, roadKeyAt, band) => getRoadLineVariantAt(1, 1, {
      roadKeyAt, baseRoadKeyAt: base, rotation, carriagewayBandAt: () => band,
    });
    assert.equal(at(1, renderedAtOddRotation(base), northbound), 'dualLaneStopW', 'junction shows screen-east of the tile');
    assert.equal(at(2, base, northbound), 'dualLaneStopN', 'junction shows screen-south');
    assert.equal(at(3, renderedAtOddRotation(base), northbound), 'dualLaneStopE', 'junction shows screen-west');
    assert.equal(at(1, renderedAtOddRotation(base), null), 'singleCrossStopW', 'single carriageway rotates the same way');
  });
});

function zebraRowsInColumn(length, extra = {}) {
  const column = gridFromRows(Array.from({ length }, () => '|'));
  return withMarkings({ road_straight_v: ['zebraCrossingNS'] }, () => (
    Array.from({ length }, (_, row) => row).filter((row) => (
      getRoadLineVariantAt(row, 0, { roadKeyAt: column, ...extra }) === 'zebraCrossingNS'
    ))
  ));
}

test('zebras along one straight are spaced so no zebra sits within 3 tiles of another', () => {
  assert.deepEqual(zebraRowsInColumn(7), [3]);
  assert.deepEqual(zebraRowsInColumn(10), [4], 'one zebra, centred (not two back to back)');
  assert.deepEqual(zebraRowsInColumn(11), [3, 7]);
  assert.deepEqual(zebraRowsInColumn(14), [4, 8], 'slack split between both ends');
  for (let length = 1; length <= 40; length++) {
    const rows = zebraRowsInColumn(length);
    rows.forEach((row, i) => {
      assert.ok(row >= 3 && row <= length - 4, `length ${length}: row ${row} keeps 3 plain tiles to each end`);
      if (i > 0) assert.ok(row - rows[i - 1] >= 4, `length ${length}: 3 non-zebra tiles between zebras`);
    });
    if (length >= 7) assert.ok(rows.length > 0, `length ${length}: a long enough run gets at least one zebra`);
  }
});

test('a bus stop breaks the plain run a zebra needs, like a junction would', () => {
  const busStopAtRow5 = { busStopVisualCornersAt: (row) => (row === 5 ? ['ur'] : null) };
  assert.deepEqual(zebraRowsInColumn(11, busStopAtRow5), [], 'neither side of the stop has 7 plain tiles');
  assert.deepEqual(zebraRowsInColumn(16, busStopAtRow5), [10], 'rows 6..15 are a 10-tile run of their own, centred at index 4');
});
