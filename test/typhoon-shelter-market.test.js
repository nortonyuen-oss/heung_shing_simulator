const assert = require('node:assert/strict');
const test = require('node:test');
const fleet = require('../typhoon-shelter-fleet.js');
const market = require('../typhoon-shelter-market.js');

const {
  TYPHOON_SHELTER_MARKET: M, chooseTyphoonShelterRoadSide, whyNotTyphoonShelterBuildingAt, assignTyphoonShelterMarkets,
  layoutTyphoonShelterBayPiles, planTyphoonShelterHaul, typhoonShelterMarketStock, typhoonShelterMarketPiles,
  getTyphoonShelterMarketNight, splitTyphoonShelterLandings,
} = market;

test('海事處 buildings go on a shelter\'s waterfront gravel, flat and free, with a road beside them', () => {
  const roads = new Set(['4:4', '4:5', '4:6', '4:7']);
  const gravel = new Set(['5:5', '5:6', '6:5', '6:6', '9:9']);
  const ctx = {
    isInside: (r, c) => r >= 0 && c >= 0 && r < 20 && c < 20,
    isRoad: (r, c) => roads.has(`${r}:${c}`),
    isWaterfront: (r, c) => gravel.has(`${r}:${c}`),
    isFree: (r, c) => !(r === 6 && c === 6),
    isFlat: () => true,
  };
  assert.equal(whyNotTyphoonShelterBuildingAt([[5, 5]], ctx), null);
  assert.equal(whyNotTyphoonShelterBuildingAt([[9, 9]], ctx), 'noRoad', 'gravel, but no road beside it');
  assert.equal(whyNotTyphoonShelterBuildingAt([[3, 3]], ctx), 'notWaterfront');
  assert.equal(whyNotTyphoonShelterBuildingAt([[5, 5], [5, 6], [6, 5], [6, 6]], ctx), 'occupied');
  assert.equal(whyNotTyphoonShelterBuildingAt([[5, 5]], { ...ctx, isFlat: () => false }), 'notFlat');
  // the road along the side: through both ways for the trucks, or a dead end
  assert.deepEqual(chooseTyphoonShelterRoadSide([[5, 5]], ctx.isRoad), { side: 'n', road: { row: 4, col: 5 }, through: 2 });
  assert.equal(chooseTyphoonShelterRoadSide([[5, 8]], (r, c) => r === 4 && c === 8).through, 0);
});

test('a market serves the nearest shelter in reach, and a loading bay beside it is its own', () => {
  const isRoad = (r, c) => r === 4;
  const markets = [{ id: '5:5', row: 5, col: 5 }, { id: '5:40', row: 5, col: 40 }];
  const bays = [{ id: '5:7', row: 5, col: 7 }, { id: '5:20', row: 5, col: 20 }];
  const shelters = [{ id: 'ts1', tiles: [{ row: 6, col: 4 }, { row: 6, col: 6 }] }, { id: 'ts2', tiles: [{ row: 30, col: 6 }] }];
  const assigned = assignTyphoonShelterMarkets({ markets, bays, shelters }, isRoad);
  const near = assigned.find((m) => m.id === '5:5');
  const far = assigned.find((m) => m.id === '5:40');
  assert.equal(near.shelterId, 'ts1');
  assert.equal(far.shelterId, null, 'no shelter within reach');
  assert.equal(near.bay?.id, '5:7', 'one tile away: its bay');
  assert.deepEqual(near.bay.road.side, 'n');
  assert.equal(far.bay, null, 'the other bay is too far from either');
  // a second market by the same bay does not get it too
  const both = assignTyphoonShelterMarkets({ markets: [...markets, { id: '6:9', row: 6, col: 9 }], bays, shelters }, isRoad);
  assert.equal(both.filter((m) => m.bay?.id === '5:7').length, 1);
});

test('a loading bay holds two dozen crate piles on its back half, the trucks on the half by the road', () => {
  const bay = { row: 5, col: 7, road: { side: 'n', road: { row: 4, col: 7 }, through: 2 } };
  const piles = layoutTyphoonShelterBayPiles(bay);
  assert.equal(piles.length, M.maxBayPiles);
  piles.forEach((p) => assert.equal(p.row, 6, 'the row away from the road'));
  assert.equal(new Set(piles.map((p) => `${p.row}:${p.col}:${p.offsets.map(([, m]) => m).join(',')}`)).size, piles.length);
  assert.ok(piles[0].offsets[0][1] > piles.at(-1).offsets[0][1], 'the cells nearest the trucks first');
});

test('the catch of a shelter with two markets is shared out between them', () => {
  const landings = [1, 2, 3, 4, 5].map((boat) => ({ at: boat, tonnes: 1.5, boat }));
  const a = splitTyphoonShelterLandings(landings, 0, 2);
  const b = splitTyphoonShelterLandings(landings, 1, 2);
  assert.equal(a.length + b.length, 5);
  assert.ok(a.every((l) => !b.includes(l)));
  assert.equal(splitTyphoonShelterLandings(landings, 0, 1), landings);
});

test('the trucks: from 04:00, the last after the last boat is in, never more than eight', () => {
  const day = 4;
  const t0 = day * 1440;
  const landings = [27 * 60, 27 * 60 + 40, 28 * 60, 28 * 60 + 50].map((m) => ({ at: t0 + m, tonnes: 1.5 }));
  const haul = planTyphoonShelterHaul(landings, day);
  assert.equal(haul.length, 1, '6 t: one truck');
  assert.ok(haul[0].at >= t0 + 28 * 60 + 50 + M.lastAfterLanding);
  const big = Array.from({ length: 40 }, (_, i) => ({ at: t0 + 27 * 60 + i * 3, tonnes: 1.5 }));
  const many = planTyphoonShelterHaul(big, day);
  assert.equal(many.length, M.maxTrucks);
  assert.equal(many[0].at, t0 + M.haulFrom);
  assert.ok(Math.abs(many.reduce((s, h) => s + h.tonnes, 0) - 60) < 1e-9, 'all of it goes');
  assert.deepEqual(planTyphoonShelterHaul([], day), []);
  // on the quay: it piles up as the boats come in and is gone once the last truck has loaded
  const stock = (m) => typhoonShelterMarketStock(big, many, t0 + m);
  assert.equal(stock(26 * 60), 0);
  assert.ok(stock(27 * 60 + 29) > 10);
  assert.equal(stock(31 * 60), 0);
  assert.equal(typhoonShelterMarketPiles(stock(27 * 60 + 29), 12), Math.min(12, Math.ceil(stock(27 * 60 + 29) / M.pileTonnes)));
  assert.equal(typhoonShelterMarketPiles(1000, 12), 12, 'a tile holds twelve');
  assert.equal(typhoonShelterMarketPiles(0, 12), 0);
});

test('the market reports last night until this evening\'s boats are out', () => {
  const day = 7;
  assert.equal(getTyphoonShelterMarketNight(day * 1440 + 10 * 60), day - 1);
  assert.equal(getTyphoonShelterMarketNight(day * 1440 + 27 * 60), day, '03:00 the next morning is still tonight');
});

test('a night\'s landings: each boat that sailed, alongside 03:00-05:00 with its catch', () => {
  const boats = [1, 2, 3, 4, 5, 6].map((id) => ({ id, model: ['fishingBoat1', 'fishingBoat3', 'fishingBoat4'][id % 3], slot: `s${id}` }));
  const plan = { seed: 7, fleet: { boats: [...boats, { id: 9, model: 'homeBoat1', slot: 's9' }] } };
  const geometry = { routeBySlot: new Map([...boats, { slot: 's9' }].map((b, i) => [b.slot, { length: 20 + i * 4 }])) };
  const day = 3;
  const landings = fleet.typhoonShelterNightLandings(plan, geometry, day);
  assert.ok(landings.length > 0 && landings.length <= 6, 'the house boat lands nothing');
  landings.forEach((l, i) => {
    assert.ok(l.at >= day * 1440 + 27 * 60 && l.at < day * 1440 + 29 * 60 + 1, `in at ${(l.at - day * 1440) / 60}h`);
    assert.equal(l.tonnes, fleet.TYPHOON_SHELTER_FLEET.catchTonnesPerTrip);
    if (i) assert.ok(l.at >= landings[i - 1].at);
  });
  // in the 休漁期 the trawlers land nothing
  const quiet = fleet.typhoonShelterNightLandings(plan, geometry, day, { moratorium: true });
  assert.ok(quiet.every((l) => boats.find((b) => b.id === l.boat).model !== 'fishingBoat4'));
  // turned back at 21:00 by a storm: in early, with less
  const storm = { holds: [{ from: day * 1440 + 21 * 60, until: null }], standbys: [] };
  const early = fleet.typhoonShelterNightLandings(plan, geometry, day, { storm });
  assert.ok(early.every((l) => l.at < day * 1440 + 24 * 60 && l.tonnes < fleet.TYPHOON_SHELTER_FLEET.catchTonnesPerTrip));
});

test('the trucks pull up from 03:00 and queue along the curb, loading in turn', () => {
  const { TYPHOON_SHELTER_TRUCKS: T, planTyphoonShelterFishTrucks, getTyphoonShelterTruckParking } = market;
  const day = 4;
  const t0 = day * 1440;
  const haul = [28 * 60, 28 * 60 + 25, 28 * 60 + 50, 29 * 60 + 15].map((m) => ({ at: t0 + m, tonnes: 6 }));
  const trucks = planTyphoonShelterFishTrucks(haul, day);
  assert.equal(trucks.length, 4);
  trucks.forEach((t, k) => {
    assert.equal(t.arriveAt, t0 + T.arriveFrom + k * T.arriveGap, 'queued before the market opens');
    assert.ok(t.arriveAt <= t.loadAt - T.earliestBeforeLoad);
    assert.equal(t.leaveAt, t.loadAt + M.loadMinutes);
  });
  // left-hand traffic: the curb on the truck's left (traffic-visuals.js)
  globalThis.getIceCreamArrivalDirectionForBuildingSide = ({ row, col }) => ({ row: col, col: -row });
  globalThis.ICE_CREAM_EVENT_CONFIG = { parkingOffsetTiles: 0.42 };
  try {
    const roads = new Set(['9:9', '9:10', '9:11', '9:12', '9:13']);
    const isRoad = (r, c) => roads.has(`${r}:${c}`);
    // no bay: at the curb by the market (road to its north), one behind another
    const market = { row: 10, col: 10, road: { side: 'n', road: { row: 9, col: 10 }, through: 2 }, bay: null };
    const first = getTyphoonShelterTruckParking(market, 0, isRoad);
    assert.deepEqual(first.road, { row: 9, col: 10 });
    assert.deepEqual(first.buildingSide, { row: 1, col: 0 });
    assert.equal(first.arrival.col, -1, 'travelling west: back is east');
    assert.deepEqual(getTyphoonShelterTruckParking(market, 2, isRoad).road, { row: 9, col: 11 });
    assert.equal(getTyphoonShelterTruckParking(market, 8, isRoad), null, 'not past the end of the road');
    assert.deepEqual(first.departure, first.arrival, 'on a through road it drives on');
    // up a dead end (the road stops at col 10, running on east only): in the only way, out the same way
    const stub = new Set(['9:10', '9:11', '9:12']);
    const dead = getTyphoonShelterTruckParking(market, 0, (r, c) => stub.has(`${r}:${c}`));
    assert.equal(dead.arrival.col, -1, 'comes from the east');
    assert.equal(dead.departure.col, 1, 'turns round and leaves east');
    // a bay: the first two drive in, the further one first; the third waits at the curb behind
    const withBay = { ...market, bay: { row: 10, col: 11, road: { side: 'n', road: { row: 9, col: 11 }, through: 2 } } };
    const in0 = getTyphoonShelterTruckParking(withBay, 0, isRoad);
    const in1 = getTyphoonShelterTruckParking(withBay, 1, isRoad);
    assert.deepEqual([in0.road.col, in1.road.col], [11, 12], 'travelling west, col 11 is further along');
    assert.ok(in0.shift.row > 0.5, 'in off the road');
    const queued = getTyphoonShelterTruckParking(withBay, 2, isRoad);
    assert.ok(queued.road.col >= 12 && Math.abs(queued.shift.row) < 1e-9, 'at the curb');
  } finally {
    delete globalThis.getIceCreamArrivalDirectionForBuildingSide;
    delete globalThis.ICE_CREAM_EVENT_CONFIG;
  }
});
