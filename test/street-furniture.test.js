const assert = require('node:assert/strict');
const test = require('node:test');
const {
  STREET_FURNITURE_RATES,
  computeStreetFurniturePlacements,
  streetFurnitureDensity,
  streetFurnitureHash,
  streetFurnitureId,
  streetFurnitureView,
  STREET_FURNITURE_STRAIGHTS,
} = require('../street-furniture.js');

const ALL_OFF = Object.freeze(Object.fromEntries(Object.keys(STREET_FURNITURE_RATES).map((key) => [key, 0])));
const rates = (overrides) => ({ ...STREET_FURNITURE_RATES, ...ALL_OFF, meterLowTraffic: 0.15, meterNoTraffic: 0.35, postboxMax: 1, ...overrides });

// A long n-s street at col 5 (rows 0..size-1), buildings in cols 4 and 6 wherever `built` says.
function street({ size = 30, built = () => null, extra = {} } = {}) {
  const roadKeyAt = (r, c) => (c === 5 && r >= 0 && r < size ? 'road_straight_v' : null);
  const frontageAt = (r, c) => ((c === 4 || c === 6) && r >= 0 && r < size ? built(r, c) : null);
  return { mapWidth: 12, mapHeight: size, roadKeyAt, frontageAt, ...extra };
}

const slotOf = (p) => `${p.row}:${p.col}:${p.side}:${p.half}`;

test('the chance hash is fixed per tile and purpose, and spread over [0, 1)', () => {
  assert.equal(streetFurnitureHash(3, 7, 1), streetFurnitureHash(3, 7, 1));
  assert.notEqual(streetFurnitureHash(3, 7, 1), streetFurnitureHash(3, 7, 2));
  const values = Array.from({ length: 2000 }, (_, i) => streetFurnitureHash(i, i * 3, 1));
  assert.ok(values.every((v) => v >= 0 && v < 1));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  assert.ok(Math.abs(mean - 0.5) < 0.03, `mean ${mean}`);
});

test('street density: 0 with nothing built, 1 with tall buildings along both sides', () => {
  const straight = STREET_FURNITURE_STRAIGHTS.road_straight_v;
  assert.equal(streetFurnitureDensity(5, 5, straight, () => null), 0);
  assert.equal(streetFurnitureDensity(5, 5, straight, () => ({ type: 'residential', level: 3 })), 1);
  const oneSide = streetFurnitureDensity(5, 5, straight, (r, c) => (c === 4 ? { level: 3 } : null));
  assert.equal(oneSide, 0.5);
});

test('bins and cabinets come far more often on a built-up street than an empty one', () => {
  const count = (built) => computeStreetFurniturePlacements({
    ...street({ size: 400, built }),
    rates: rates({ binBase: 0.03, binDense: 0.2, cabinetBase: 0.01, cabinetDense: 0.05 }),
  }).reduce((acc, p) => { acc[p.kind] = (acc[p.kind] || 0) + 1; return acc; }, {});
  const empty = count(() => null);
  const dense = count(() => ({ type: 'commercial', level: 3 }));
  assert.ok((dense.bin || 0) > 3 * (empty.bin || 1), `bins dense ${dense.bin} vs empty ${empty.bin}`);
  assert.ok((dense.cabinet || 0) > 2 * (empty.cabinet || 1), `cabinets dense ${dense.cabinet} vs empty ${empty.cabinet}`);
  // ~0.23 bins per tile on a full street: 400 tiles -> roughly 90.
  assert.ok(dense.bin > 60 && dense.bin < 130, `dense bins ${dense.bin}`);
});

test('a residential street gets at most one posting box, near its middle; a commercial one none', () => {
  const home = computeStreetFurniturePlacements({ ...street({ built: () => ({ type: 'residential', level: 2 }) }), rates: rates({ postboxAtHalfDensity: 5, postboxMin: 1 }) });
  const boxes = home.filter((p) => p.kind === 'postbox');
  assert.equal(boxes.length, 1);
  assert.ok(Math.abs(boxes[0].row - 14.5) <= 1, `postbox at row ${boxes[0].row}`);
  const shops = computeStreetFurniturePlacements({ ...street({ built: () => ({ type: 'commercial', level: 2 }) }), rates: rates({ postboxAtHalfDensity: 5, postboxMin: 1 }) });
  assert.equal(shops.filter((p) => p.kind === 'postbox').length, 0);
});

test('about 40% of residential streets at medium density get a posting box', () => {
  let streets = 0; let withBox = 0;
  for (let s = 0; s < 300; s++) {
    // Separate 8-tile n-s streets, one per column pair, buildings on both sides at half height.
    const col = 2 + s * 3;
    const map = {
      mapWidth: 2 + 300 * 3,
      mapHeight: 8,
      roadKeyAt: (r, c) => (c === col && r >= 0 && r < 8 ? 'road_straight_v' : null),
      // level 1 on one side only -> density ~0.35; level mix gives ~0.5 on average
      frontageAt: (r, c) => ((c === col - 1 || (c === col + 1 && r % 2 === 0)) ? { type: 'residential', level: 3 } : null),
      rates: rates({ postboxAtHalfDensity: 0.4, postboxMin: 0.1, postboxMax: 0.6 }),
    };
    streets++;
    if (computeStreetFurniturePlacements(map).some((p) => p.kind === 'postbox')) withBox++;
  }
  const share = withBox / streets;
  assert.ok(share > 0.3 && share < 0.5, `share ${share}`);
});

test('parking meters: kerbside of a low-traffic dual carriageway with buildings along it', () => {
  const band = { orientation: 'v', direction: 'south' };
  const shops = () => ({ type: 'commercial', level: 2 });
  const base = street({ built: shops, extra: { bandAt: () => band } });
  const empty = computeStreetFurniturePlacements({ ...street({ extra: { bandAt: () => band } }), trafficAt: () => 0, rates: rates({ meterMax: 1, meterMinDensity: 0.3 }) });
  assert.equal(empty.filter((p) => p.kind === 'parkingMeter').length, 0, 'a quiet road through empty land has no one to park for');
  const oneSide = computeStreetFurniturePlacements({
    ...street({ built: (r, c) => (c === 6 ? shops() : null), extra: { bandAt: () => band } }),
    trafficAt: () => 0, rates: rates({ meterMax: 1, meterMinDensity: 0.3 }),
  }).filter((p) => p.kind === 'parkingMeter');
  assert.ok(oneSide.length > 0 && oneSide.every((p) => p.side === 'e'), 'meters stand on the built-up kerb');
  const quiet = computeStreetFurniturePlacements({ ...base, trafficAt: () => 0.05, rates: rates({ meterMax: 1 }) });
  assert.ok(quiet.filter((p) => p.kind === 'parkingMeter').length >= 28, 'nearly every quiet tile');
  const busy = computeStreetFurniturePlacements({ ...base, trafficAt: () => 0.5, rates: rates({ meterMax: 1 }) });
  assert.equal(busy.filter((p) => p.kind === 'parkingMeter').length, 0, 'none on a busy road');
  const single = computeStreetFurniturePlacements({ ...street({ built: shops }), trafficAt: () => 0, rates: rates({ meterMax: 1 }) });
  assert.equal(single.filter((p) => p.kind === 'parkingMeter').length, 0, 'none on a single carriageway');
  const guarded = computeStreetFurniturePlacements({
    ...base, trafficAt: () => 0, rates: rates({ meterMax: 1 }),
    railingTileAt: (r) => r === 10, busStopAt: (r) => r === 20,
  }).filter((p) => p.kind === 'parkingMeter').map((p) => p.row);
  [10, 19, 20, 21].forEach((row) => assert.ok(!guarded.includes(row), `no meter at row ${row}`));
});

test('one traffic-signal cabinet per junction block, on the pole kerb away from the junction', () => {
  const signalPlacements = [
    { row: 9, col: 5, travel: 's', junctionRow: 10, junctionCol: 5, clusterRow: 10, clusterCol: 5 },
    { row: 11, col: 5, travel: 'n', junctionRow: 10, junctionCol: 5, clusterRow: 10, clusterCol: 5 },
  ];
  const roadKeyAt = (r, c) => (c === 5 && r !== 10 ? 'road_straight_v' : r === 10 && c === 5 ? 'road_cross' : null);
  const placements = computeStreetFurniturePlacements({ mapWidth: 12, mapHeight: 30, roadKeyAt, signalPlacements, rates: rates({}) });
  const cabinets = placements.filter((p) => p.kind === 'signalCabinet');
  assert.equal(cabinets.length, 1);
  assert.deepEqual({ ...cabinets[0] }, { kind: 'signalCabinet', row: 9, col: 5, side: 'e', half: 'n' },
    'southbound pole stands on its left (east) kerb; the cabinet goes in the half away from the junction');
});

test('bus stops: a bin on the next tile, and nothing on the stop tile itself', () => {
  const placements = computeStreetFurniturePlacements({
    ...street({ extra: { busStopAt: (r) => r === 12 } }),
    rates: rates({ binAtBusStop: 1, binBase: 1 }),
  });
  assert.ok(!placements.some((p) => p.row === 12), 'the stop tile stays clear');
  assert.ok(placements.some((p) => p.kind === 'bin' && (p.row === 11 || p.row === 13)));
});

test('never two props in one slot, never on a kerb facing more road, never in a taken slot', () => {
  const placements = computeStreetFurniturePlacements({
    ...street({ built: () => ({ type: 'residential', level: 3 }), extra: {
      bandAt: () => ({ direction: 'north' }),
      occupiedAt: (r, c, side, half) => r === 5 && side === 'e' && half === 'n',
    } }),
    // everything on at full chance
    rates: { ...STREET_FURNITURE_RATES, binBase: 1, cabinetBase: 1, meterMax: 1, postboxMin: 1, postboxMax: 1 },
    trafficAt: () => 0,
  });
  const slots = placements.map(slotOf);
  assert.equal(new Set(slots).size, slots.length);
  assert.ok(!slots.includes('5:5:e:n'));
  placements.forEach((p) => assert.equal(p.col, 5));
  assert.equal(new Set(placements.map(streetFurnitureId)).size, placements.length);
});

test('the view shown keeps the prop front towards the camera and follows rotation', () => {
  assert.equal(streetFurnitureView({ side: 'n' }, 0), 'sw', 'NE kerb of a NW-SE road');
  assert.equal(streetFurnitureView({ side: 's' }, 0), 'sw');
  assert.equal(streetFurnitureView({ side: 'e' }, 0), 'se', 'SE kerb of a SW-NE road');
  global.rotateDirection = (d, steps) => ['n', 'e', 's', 'w'][(['n', 'e', 's', 'w'].indexOf(d) + steps) % 4];
  try {
    assert.equal(streetFurnitureView({ side: 'n' }, 1), 'se');
  } finally {
    delete global.rotateDirection;
  }
});
