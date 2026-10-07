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

test('the two kerbs of one road share a baked view but are calibrated separately', () => {
  const { streetFurnitureFacing, streetFurnitureView } = require('../street-furniture.js');
  const far = { kind: 'bin', side: 'n' };  // NE kerb of an e-w road
  const near = { kind: 'bin', side: 's' }; // SW kerb of the same road
  assert.equal(streetFurnitureView(far, 0), streetFurnitureView(near, 0), 'same art');
  assert.equal(streetFurnitureFacing(far, 0), 'bin_ne');
  assert.equal(streetFurnitureFacing(near, 0), 'bin_sw');
  assert.equal(streetFurnitureFacing({ kind: 'postbox', side: 'e' }, 0), 'postbox_se');
  assert.equal(streetFurnitureFacing({ kind: 'postbox', side: 'w' }, 0), 'postbox_nw');
});

test('fire hydrants: about every 100 m (5 tiles) along a built street, sparser when thinly built, none on empty land', () => {
  const hydrants = (built, size = 60) => computeStreetFurniturePlacements({
    ...street({ size, built }),
    rates: rates({ hydrantEvery: 5, hydrantEverySparse: 8, hydrantDenseDensity: 0.4, hydrantMinBuiltShare: 0.2 }),
  }).filter((p) => p.kind === 'hydrant');
  const dense = hydrants(() => ({ type: 'commercial', level: 3 }));
  assert.equal(dense.length, 12, '60 tiles / 5');
  const rows = dense.map((p) => p.row).sort((a, b) => a - b);
  rows.slice(1).forEach((row, i) => assert.equal(row - rows[i], 5, 'evenly spaced'));
  // One kerb built at level 1 in every other cell: density ~0.18, the sparse spacing.
  const sparse = hydrants((r, c) => (c === 6 && r % 2 === 0 ? { type: 'residential', level: 1 } : null));
  assert.ok(sparse.length >= 7 && sparse.length <= 8, `sparse ${sparse.length}`);
  assert.ok(sparse.every((p) => p.side === 'e'), 'on the built-up kerb');
  assert.equal(hydrants(() => null).length, 0);
});

test('phone booths: beside some bus stops, and a few along dense streets', () => {
  const atStop = computeStreetFurniturePlacements({
    ...street({ extra: { busStopAt: (r) => r === 12 } }),
    rates: rates({ phoneAtBusStop: 1, binAtBusStop: 1 }),
  });
  const phone = atStop.filter((p) => p.kind === 'phoneBooth');
  const bin = atStop.filter((p) => p.kind === 'bin');
  assert.equal(phone.length, 1);
  assert.equal(bin.length, 1);
  assert.notEqual(phone[0].row, bin[0].row, 'the booth and the bin flank the stop on opposite sides');
  assert.ok([11, 13].includes(phone[0].row));
  const count = (built) => computeStreetFurniturePlacements({ ...street({ size: 1000, built }), rates: rates({ phoneDense: 0.03 }) })
    .filter((p) => p.kind === 'phoneBooth').length;
  const dense = count(() => ({ type: 'commercial', level: 3 }));
  assert.ok(dense >= 15 && dense <= 50, `~3% of dense tiles: ${dense}`);
  assert.equal(count(() => null), 0);
});

// A cross junction at (10, 5) with approaches on all four sides; frontage by type around it.
function junction(type, extra = {}) {
  const roadKeyAt = (r, c) => {
    if (r === 10 && c === 5) return 'road_cross';
    if (c === 5 && r >= 0 && r < 21) return 'road_straight_v';
    if (r === 10 && c >= 0 && c < 11) return 'road_straight_h';
    return null;
  };
  const frontageAt = (r, c) => (roadKeyAt(r, c) ? null : { type, level: 3 });
  return { mapWidth: 11, mapHeight: 21, roadKeyAt, frontageAt, ...extra };
}

test('newspaper stalls: at a shopping junction on a shop kerb next to it, never at a residential one', () => {
  const on = rates({ newsstandMax: 1, newsstandMinCommercial: 0.25, newsstandMinDensity: 0.4, newsstandSpacing: 4 });
  const shops = computeStreetFurniturePlacements({ ...junction('commercial'), rates: on }).filter((p) => p.kind === 'newsstand');
  assert.equal(shops.length, 1);
  const distance = Math.abs(shops[0].row - 10) + Math.abs(shops[0].col - 5);
  assert.ok(distance <= 2, `beside the junction: ${JSON.stringify(shops[0])}`);
  const homes = computeStreetFurniturePlacements({ ...junction('residential'), rates: on }).filter((p) => p.kind === 'newsstand');
  assert.equal(homes.length, 0);
  // Railings take the tile next to the junction: the stall moves one tile out.
  const railed = computeStreetFurniturePlacements({
    ...junction('commercial', { occupiedAt: (r, c) => Math.abs(r - 10) + Math.abs(c - 5) === 1 }),
    rates: on,
  }).filter((p) => p.kind === 'newsstand');
  assert.equal(railed.length, 1);
  assert.equal(Math.abs(railed[0].row - 10) + Math.abs(railed[0].col - 5), 2);
});

test('yellow-black bollards stand only in front of industrial buildings', () => {
  const placements = computeStreetFurniturePlacements({
    ...street({ size: 200, built: (r, c) => (c === 4 ? { type: 'industrial', level: 2 } : { type: 'commercial', level: 2 }) }),
    rates: rates({ bollardIndustrial: 0.3 }),
  }).filter((p) => p.kind === 'bollard');
  assert.ok(placements.length > 40 && placements.length < 80, `~30% of 200 tiles: ${placements.length}`);
  assert.ok(placements.every((p) => p.side === 'w'), 'on the industrial (west) kerb only');
});

test('every kind has both baked views on a power-of-two canvas', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { STREET_FURNITURE_TEXTURE_FILES, STREET_FURNITURE_KINDS } = require('../street-furniture.js');
  const files = Object.values(STREET_FURNITURE_TEXTURE_FILES);
  assert.equal(files.length, Object.keys(STREET_FURNITURE_KINDS).length * 2);
  files.forEach((file) => {
    const png = fs.readFileSync(path.join(__dirname, '..', file));
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    assert.ok(width === 256 && height === 256, `${file} ${width}x${height}`);
  });
});

const plates = (opts) => computeStreetFurniturePlacements({ rates: rates({ streetSigns: 1, streetSignIntermediateFrom: 20, streetSignIntermediateEvery: 15, streetSignBusStopReach: 3 }), ...opts })
  .filter((p) => p.kind === 'streetSign' || p.kind === 'streetSignSingle');
// the corner a plate stands at, from the junction at (10, 5): its arm and kerb
const cornerOf = (p) => {
  const arm = p.col === 5 ? (p.row < 10 ? 'n' : 's') : (p.col < 5 ? 'w' : 'e');
  return arm === 'n' || arm === 's' ? `${arm}${p.side}` : `${p.side}${arm}`;
};

test('street name plates (HyD): a cross of narrow streets has them at two opposite corners, one for each street', () => {
  const signs = plates(junction('commercial'));
  assert.equal(signs.length, 4, JSON.stringify(signs));
  const corners = [...new Set(signs.map(cornerOf))].sort();
  assert.ok(JSON.stringify(corners) === '["ne","sw"]' || JSON.stringify(corners) === '["nw","se"]', `opposite corners: ${corners}`);
  signs.forEach((p) => {
    assert.equal(Math.abs(p.row - 10) + Math.abs(p.col - 5), 1, 'on the tile next to the junction');
    const towardJunction = p.col === 5 ? (p.row < 10 ? 's' : 'n') : (p.col < 5 ? 'e' : 'w');
    assert.equal(p.half, towardJunction, 'within 3 m of the corner');
    assert.equal(p.kind, 'streetSignSingle');
  });
  // each corner names both streets
  corners.forEach((k) => assert.equal(signs.filter((p) => cornerOf(p) === k).length, 2));
});

test('street name plates (HyD): a wide road\'s junction has them at every corner', () => {
  const signs = plates(junction('commercial', { bandAt: () => ({ direction: 'north' }) }));
  assert.equal(signs.length, 8);
  assert.deepEqual([...new Set(signs.map(cornerOf))].sort(), ['ne', 'nw', 'se', 'sw']);
  assert.ok(signs.every((p) => p.kind === 'streetSign'), 'the long two-post plate');
});

test('street name plates (HyD): a narrow T has one corner; a railing takes the plate, a lamp moves it a half out', () => {
  // a T: the e-w street through, the n-s one ending at it from the south
  const roadKeyAt = (r, c) => {
    if (r === 10 && c === 5) return 'road_t_n';
    if (c === 5 && r > 10 && r < 21) return 'road_straight_v';
    if (r === 10 && c >= 0 && c < 11) return 'road_straight_h';
    return null;
  };
  const t = { mapWidth: 11, mapHeight: 21, roadKeyAt, frontageAt: (r, c) => (roadKeyAt(r, c) ? null : { type: 'commercial', level: 3 }) };
  const signs = plates(t);
  assert.equal(signs.length, 2, JSON.stringify(signs));
  assert.equal(new Set(signs.map(cornerOf)).size, 1);
  assert.ok(['se', 'sw'].includes(cornerOf(signs[0])), 'a corner of the T, not its far side');
  // a railing in the slot: the plate is bolted to it
  const slot = signs[0];
  const railingRuns = [{ cells: [{ row: slot.row, col: slot.col, side: slot.side, toward: slot.half }] }];
  const occupiedAt = (r, c, side, half) => r === slot.row && c === slot.col && side === slot.side && half === slot.half;
  assert.ok(plates({ ...t, railingRuns, occupiedAt }).some((p) => slotOf(p) === slotOf(slot)));
  // a lamp there: one half further out
  const moved = plates({ ...t, occupiedAt }).find((p) => p.row === slot.row && p.col === slot.col && p.side === slot.side);
  assert.ok(moved && moved.half !== slot.half);
});

test('street name plates (HyD): a junction block of several junction tiles is one junction', () => {
  // two cross junctions side by side at (10, 5) and (10, 6), narrow: two opposite corners
  const roadKeyAt = (r, c) => {
    if (r === 10 && (c === 5 || c === 6)) return 'road_cross';
    if ((c === 5 || c === 6) && r >= 0 && r < 21) return 'road_straight_v';
    if (r === 10 && c >= 0 && c < 12) return 'road_straight_h';
    return null;
  };
  const signs = plates({ mapWidth: 12, mapHeight: 21, roadKeyAt, frontageAt: () => null });
  assert.equal(signs.length, 4, JSON.stringify(signs));
  // never on the median between the two parallel arms
  signs.filter((p) => p.col === 5 || p.col === 6).forEach((p) => assert.equal(p.side, p.col === 5 ? 'w' : 'e'));
});

test('street name plates (HyD): at a dead end, and every 300 m along a long built-up street - by a bus stop if near', () => {
  // a n-s street from row 2 to row 37 at col 5: a dead end at the top, a junction at the bottom
  const roadKeyAt = (r, c) => {
    if (r === 38 && c === 5) return 'road_t_n';
    if (c === 5 && r >= 2 && r < 38) return 'road_straight_v';
    if (r === 38 && c >= 0 && c < 11) return 'road_straight_h';
    return null;
  };
  const built = (r, c) => (c === 6 && r >= 2 && r < 38 ? { type: 'residential', level: 2 } : null);
  const base = { mapWidth: 11, mapHeight: 45, roadKeyAt, frontageAt: built };
  const signs = plates(base).filter((p) => p.col === 5 && p.row < 37);
  assert.ok(signs.some((p) => p.row === 2), 'the end of the road');
  const middle = signs.filter((p) => p.row > 2);
  assert.equal(middle.length, 2, `36 tiles between the end and the junction: two intermediate plates (${JSON.stringify(middle)})`);
  assert.ok(middle.every((p) => p.side === 'e'), 'one side of a narrow street, the built-up one');
  // a bus stop near the first: the plate moves beside it
  const first = Math.min(...middle.map((p) => p.row));
  const withStop = plates({ ...base, busStopAt: (r, c) => c === 5 && r === first + 2 }).filter((p) => p.col === 5 && p.row > 2 && p.row < 37);
  assert.ok(withStop.some((p) => Math.abs(p.row - (first + 2)) === 1), JSON.stringify(withStop));
  // nothing built along it: no intermediate plates
  assert.equal(plates({ ...base, frontageAt: () => null }).filter((p) => p.col === 5 && p.row > 2 && p.row < 37).length, 0);
});

test('street name plates (HyD): never over a zebra crossing', () => {
  const zebraAt = (r, c) => Math.abs(r - 10) + Math.abs(c - 5) === 1;
  assert.equal(plates({ ...junction('commercial'), zebraAt }).filter((p) => zebraAt(p.row, p.col)).length, 0);
});

test('a calibrated nudge moves a prop\'s depth with its foot, so traffic behind it stays behind', () => {
  const { streetFurnitureAnchor } = require('../street-furniture.js');
  const saved = {};
  const stubs = {
    getTileFaceGeometry: () => ({ center: { x: 0, y: 0 } }),
    isoToScreen: (col, row) => ({ x: (col - row) * 50, y: (col + row) * 25 }),
    getWorldDepth: (layer, local) => local,
    TILE_HEIGHT: 50,
    STREET_FURNITURE_ANCHOR_OFFSETS: { streetSign_se: { dx: -17.8, dy: 6.767 } },
    STREET_FURNITURE_KIND_SCALES: {},
  };
  Object.keys(stubs).forEach((key) => { saved[key] = global[key]; global[key] = stubs[key]; });
  try {
    const placement = { kind: 'streetSign', row: 10, col: 10, side: 'e', half: 'n' };
    const nudged = streetFurnitureAnchor({ offsetX: 0, offsetY: 0 }, placement, 'streetSign_se');
    const plain = streetFurnitureAnchor({ offsetX: 0, offsetY: 0 }, placement, 'streetSign_ne');
    assert.ok(Math.abs((nudged.y - plain.y) - 6.767) < 1e-9, 'the foot moves down by the nudge');
    assert.ok(Math.abs((nudged.depth - plain.depth) - 6.767) < 1e-9, 'and the depth follows it');
  } finally {
    Object.keys(stubs).forEach((key) => { if (saved[key] === undefined) delete global[key]; else global[key] = saved[key]; });
  }
});
