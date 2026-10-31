const assert = require('node:assert/strict');
const test = require('node:test');
const {
  VICTORIA_LNY_MODULES,
  VICTORIA_LNY_STALL_SPECS,
  getVictoriaParkLnyVenues,
  getVictoriaLnyFieldSize,
  layoutLunarNewYear,
} = require('../festival-venues.js');

const EPSILON = 1e-7;
// canopy heights at the 20 m tile's true vertical rate (Norton 2026-10-31: 檔口大小需要再調整)
const EXPECTED_SPECS = {
  wet: { width: 4, depth: 5, maxHeightM: 3 },
  dry: { width: 3, depth: 1.5, maxHeightM: 2.6 },
  dryLarge: { width: 4.5, depth: 2, maxHeightM: 2.6 },
  food: { width: 5, depth: 4, maxHeightM: 3 },
};

function fullPark(row = 20, col = 30, height = 2) {
  return Array.from({ length: 6 }, (_, i) => {
    const r = row + Math.floor(i / 2) * 4, c = col + (i % 2) * 4;
    return { id: `${r}:${c}`, row: r, col: c, height, cols: 4, rows: 4,
      textureKey: i === 0 ? 'park_flagship_victoria' : `park_flagship_victoria_module0${i + 1}` };
  });
}

function fair(parks, overrides = {}) {
  return layoutLunarNewYear({ parks, tier: 'standard', phase: 'open', seed: 'Victoria:2027', soldShare: 1, ...overrides });
}

const stalls = (placements) => placements.filter((p) => p.stall);
const stallGeometry = (placements) => stalls(placements).map((p) => ({
  id: p.id, buildingId: p.buildingId, point: p.point, slot: p.marketSlot,
  footprintM: p.footprintM, stallType: p.stallType, maxHeightM: p.maxHeightM,
}));

function bounds(stall) {
  return { u0: stall.marketSlot.u - stall.footprintM.depth / 2,
    u1: stall.marketSlot.u + stall.footprintM.depth / 2,
    v0: stall.marketSlot.v - stall.footprintM.width / 2,
    v1: stall.marketSlot.v + stall.footprintM.width / 2 };
}

function overlaps(a, b) {
  return Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0) > EPSILON
    && Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0) > EPSILON;
}

function verifyGeometry(parks, placements) {
  const byId = new Map(parks.map((park) => [park.id, park]));
  const byField = new Map();
  for (const p of placements) {
    assert.equal(p.mode, 'building');
    const park = byId.get(p.buildingId);
    assert.ok(park, `${p.id}: source building exists`);
    assert.ok(VICTORIA_LNY_MODULES[park.textureKey], `${p.id}: no market prop on garden/lawn/tennis modules`);
    assert.ok(Array.isArray(p.point) && p.point.length === 2 && p.point.every(Number.isFinite));
    const [x, y] = p.point;
    assert.ok(x >= 0 && x < 1024 && y >= 0 && y < 1024, `${p.id}: source coordinates remain in its own asset`);
    assert.ok(y >= 464 + Math.abs(x - 512) / 2 - 1 && y <= 968 - Math.abs(x - 512) / 2 + 1,
      `${p.id}: prop stays on the source ground diamond`);
    if (!p.stall) continue;
    const spec = EXPECTED_SPECS[p.stallType];
    assert.ok(spec, `${p.id}: known physical stall type`);
    assert.deepEqual(p.footprintM, { width: spec.width, depth: spec.depth });
    assert.equal(p.maxHeightM, spec.maxHeightM);
    assert.equal(p.anchorMode, 'ground-center');
    const field = VICTORIA_LNY_MODULES[park.textureKey].fields[p.marketSlot.field];
    assert.ok(field, `${p.id}: valid pitch`);
    const size = getVictoriaLnyFieldSize(field), b = bounds(p);
    assert.ok(b.u0 >= 0.5 - EPSILON && b.u1 <= size.u - 0.5 + EPSILON,
      `${p.id}: both physical depth edges retain the 0.5m pitch margin`);
    assert.ok(b.v0 >= 0.5 - EPSILON && b.v1 <= size.v - 0.5 + EPSILON,
      `${p.id}: both physical width edges retain the 0.5m pitch margin`);
    const bottom = field.left.map((value, i) => value + field.right[i] - field.top[i]);
    const source = field.left.map((value, i) => value
      + p.marketSlot.u / size.u * (field.top[i] - value)
      + p.marketSlot.v / size.v * (bottom[i] - value));
    assert.ok(Math.hypot(p.point[0] - source[0], p.point[1] - source[1]) <= Math.SQRT1_2 + EPSILON,
      `${p.id}: physical metre slot matches its rounded source point`);
    const key = `${p.buildingId}:${p.marketSlot.field}`;
    if (!byField.has(key)) byField.set(key, []);
    byField.get(key).push(p);
  }
  for (const fieldStalls of byField.values()) {
    for (let i = 0; i < fieldStalls.length; i++) {
      for (let j = i + 1; j < fieldStalls.length; j++) {
        assert.equal(overlaps(bounds(fieldStalls[i]), bounds(fieldStalls[j])), false,
          `${fieldStalls[i].id} overlaps ${fieldStalls[j].id}`);
      }
    }
  }
}

// Only the module with the three big pitches holds the fair (Norton 2026-10-31: 維園既花市，只放最大的3個
// 球場既款式就好) - module06, with its smaller pitches beside the basketball courts, no longer does.
test('six correctly spaced modules form one fair, on the three big pitches of module05 only', () => {
  const parks = fullPark(), venues = getVictoriaParkLnyVenues(parks);
  assert.equal(venues.length, 1);
  assert.equal(venues[0].members.length, 6);
  assert.equal(venues[0].markets.length, 1);
  assert.deepEqual(venues[0].markets.map((p) => p.id), [parks[4].id]);
  const placements = fair(parks), market = stalls(placements);
  assert.ok(market.length > 0);
  const fields = new Set(market.map((p) => `${p.buildingId}:${p.marketSlot.field}`));
  assert.equal(fields.size, 3, 'all three big pitches host stalls');
  assert.ok(placements.every((p) => p.buildingId === parks[4].id));
  assert.ok(placements.every((p) => !/Stage|Dragon|LionPoles/.test(p.partId)), 'performance pieces do not occupy market pitches');
  assert.deepEqual(fair(parks.slice(0, 4)), [], 'garden, bowling, lawn and tennis modules alone are not a fair');
  verifyGeometry(parks, placements);
});

test('official booth footprints and caps fit without overlap through every tier and setup phase', () => {
  for (const [kind, expected] of Object.entries(EXPECTED_SPECS)) {
    const actual = VICTORIA_LNY_STALL_SPECS[kind];
    assert.deepEqual({ width: actual.width, depth: actual.depth, maxHeightM: actual.maxHeightM }, expected);
  }
  const parks = fullPark();
  assert.deepEqual(new Set(stalls(fair(parks)).map((p) => p.stallType)), new Set(Object.keys(EXPECTED_SPECS)));
  for (const tier of ['basic', 'standard', 'grand']) {
    for (const phase of ['setup', 'open', 'peak']) verifyGeometry(parks, fair(parks, { tier, phase }));
  }
});

test('the food stalls use a separate queue bay kept clear of ordinary market booths', () => {
  const parks = fullPark(), placements = fair(parks), market = stalls(placements);
  const food = market.filter((p) => p.stallType === 'food');
  assert.equal(food.length, 2);
  for (const park of parks.slice(4, 5)) {
    assert.equal(food.filter((p) => p.buildingId === park.id).length, 2);
    const config = VICTORIA_LNY_MODULES[park.textureKey], size = getVictoriaLnyFieldSize(config.fields[0]);
    const bay = { u0: 0, u1: 11, v0: config.side === 'west' ? 0 : size.v - 8, v1: config.side === 'west' ? 8 : size.v };
    for (const p of market.filter((p) => p.buildingId === park.id && p.marketSlot.field === 0)) {
      if (p.stallType !== 'food') assert.equal(overlaps(bounds(p), bay), false, `${p.id}: queue bay remains clear`);
    }
  }
});

test('separate parks make separate fairs; module05 alone is a fair, module06 alone is not', () => {
  const parks = fullPark(), other = fullPark(60, 70);
  const pair = [parks[4], other[4]];
  const venues = getVictoriaParkLnyVenues(pair);
  assert.equal(venues.length, 2);
  assert.ok(venues.every((v) => v.markets.length === 1));
  verifyGeometry(pair, fair(pair));
  const alone = getVictoriaParkLnyVenues([parks[4]]);
  assert.equal(alone.length, 1);
  const placements = fair([parks[4]]);
  assert.equal(new Set(stalls(placements).map((p) => p.marketSlot.field)).size, 3);
  verifyGeometry([parks[4]], placements);
  assert.deepEqual(getVictoriaParkLnyVenues([parks[5]]), []);
  assert.deepEqual(stalls(fair([parks[5]])), []);
});

test('selecting any group member selects the whole main fair and leaves other parks smaller', () => {
  const first = fullPark(), second = fullPark(80, 90), parks = [...first, ...second];
  const venues = getVictoriaParkLnyVenues(parks);
  assert.equal(venues.length, 2);
  const count = (placements, venue) => stalls(placements).filter((p) => p.marketVenueId === venue.id).length;
  const initial = fair(parks);
  assert.ok(count(initial, venues[0]) > count(initial, venues[1]));
  const fullCount = count(initial, venues[0]);
  for (const member of second) {
    const chosen = fair(parks, { mainVenue: member.id });
    assert.equal(count(chosen, venues[1]), fullCount, `${member.textureKey}: choose complete group`);
    assert.ok(count(chosen, venues[0]) < fullCount);
    assert.equal(stalls(chosen).filter((p) => p.marketVenueId === venues[1].id && p.stallType === 'food').length, 2);
    verifyGeometry(parks, chosen);
  }
});

test('setup, sold shares and repeated layout retain deterministic slots and tier ordering', () => {
  const parks = fullPark();
  const open = fair(parks), setup = fair(parks, { phase: 'setup' });
  assert.deepEqual(fair(parks), open);
  assert.deepEqual(fair([...parks].reverse()), open, 'source enumeration order does not alter the fair');
  assert.deepEqual(stallGeometry(setup), stallGeometry(open));
  assert.ok(stalls(setup).every((p) => p.partId === 'lnyStallEmpty'));
  assert.ok(stalls(open).every((p) => p.sold && p.partId !== 'lnyStallEmpty'));
  assert.ok(new Set(stalls(open).map((p) => p.partId)).size > 3, 'open market carries assorted goods');
  const empty = fair(parks, { soldShare: 0 });
  assert.deepEqual(stallGeometry(empty), stallGeometry(open));
  assert.ok(stalls(empty).every((p) => !p.sold && p.partId === 'lnyStallEmpty'));
  const sizes = ['basic', 'standard', 'grand'].map((tier) => stalls(fair(parks, { tier })).length);
  assert.ok(sizes[0] < sizes[1] && sizes[1] <= sizes[2], `tier counts ${sizes.join(', ')}`);
});
