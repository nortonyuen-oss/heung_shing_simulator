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
  // a 2x2 needs a whole side on the waterfront, its back on flat ground: rows 5-6 gravel, 4 is road
  const half = { ...ctx, isFree: () => true, isWaterfront: (r, c) => r === 6 && (c === 5 || c === 6) };
  assert.equal(whyNotTyphoonShelterBuildingAt([[5, 5], [5, 6], [6, 5], [6, 6]], half), null, 'front on the water, back on land');
  assert.equal(whyNotTyphoonShelterBuildingAt([[5, 5], [5, 6], [6, 5], [6, 6]], { ...half, isWaterfront: (r, c) => r === 6 && c === 6 }), 'notWaterfront', 'a corner is not a side');
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

test('the loading bay: piles on its hatched loading areas, trucks nose-in to its six parking bays', () => {
  const { typhoonShelterBayArtFrame, layoutTyphoonShelterBayStalls } = market;
  const toScreen = (col, row) => ({ x: (col - row) * 32, y: (col + row) * 16 });
  [[false, { side: 's', road: { row: 7, col: 7 }, through: 2 }], [true, { side: 'e', road: { row: 5, col: 9 }, through: 2 }]].forEach(([mirrored, road]) => {
    const bay = { row: 5, col: 7, road };
    const frame = typhoonShelterBayArtFrame(bay, toScreen, mirrored);
    // the map and the art agree both ways
    const back = frame.art(frame.toMap(0.3, 0.7).row, frame.toMap(0.3, 0.7).col);
    assert.ok(Math.abs(back.across - 0.3) < 1e-9 && Math.abs(back.along - 0.7) < 1e-9);
    const piles = layoutTyphoonShelterBayPiles(bay, toScreen, mirrored);
    assert.equal(piles.length, M.maxBayPiles);
    assert.equal(new Set(piles.map((p) => p.cell)).size, piles.length);
    piles.forEach((p) => {
      const at = frame.art(p.row + p.offsets[0][1] / 20, p.col + p.offsets[1][1] / 20);
      assert.ok(at.across < 0.27 || at.across > 0.73, `on a hatched area, not the driveway (${at.across.toFixed(2)})`);
      assert.ok(at.along < 0.17 || at.along > 0.8, `at an end of the rows, not a parking bay (${at.along.toFixed(2)})`);
    });
    const stalls = layoutTyphoonShelterBayStalls(bay, toScreen, mirrored);
    assert.equal(stalls.length, 6);
    stalls.forEach((st) => {
      const at = frame.art(st.row, st.col);
      assert.ok(at.across < 0.3 || at.across > 0.7, 'in a row of parking bays');
      assert.ok(at.along > 0.25 && at.along < 0.8, 'between the hatched areas');
      // the truck faces the lot's edge on its side
      const ahead = frame.art(st.row + st.heading.row * 0.2, st.col + st.heading.col * 0.2);
      assert.ok(at.across < 0.5 ? ahead.across < at.across : ahead.across > at.across);
      assert.ok(Math.abs(Math.hypot(st.heading.row, st.heading.col) - 1) < 1e-9);
    });
    // furthest from the road first
    const fromRoad = (st) => (road.side === 's' ? bay.row + 1.5 - st.row : bay.col + 1.5 - st.col);
    for (let i = 1; i < stalls.length; i++) assert.ok(fromRoad(stalls[i - 1]) >= fromRoad(stalls[i]) - 1e-9);
  });
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
    // a bay with its parking bays laid out: a truck to each, nose in, then the curb
    const bay = { row: 10, col: 11, road: { side: 'n', road: { row: 9, col: 11 }, through: 2 } };
    bay.stalls = [{ row: 11.2, col: 11.1, heading: { row: 0, col: -1 } }, { row: 10.6, col: 12.2, heading: { row: 0, col: 1 } }];
    const withBay = { ...market, bay };
    const in0 = getTyphoonShelterTruckParking(withBay, 0, isRoad);
    const in1 = getTyphoonShelterTruckParking(withBay, 1, isRoad);
    const at = (p) => [p.road.row + p.buildingSide.row * 0.42 + p.shift.row, p.road.col + p.buildingSide.col * 0.42 + p.shift.col].map((v) => Math.round(v * 100) / 100);
    assert.deepEqual(at(in0), [11.2, 11.1], 'in its parking bay');
    assert.deepEqual(at(in1), [10.6, 12.2]);
    assert.deepEqual(in0.heading, { row: 0, col: -1 }, 'nose in');
    assert.deepEqual(in1.road, { row: 9, col: 12 }, 'from the road tile nearest its bay');
    // no bays laid out: the first two up the driveway, as before
    const noStalls = { ...market, bay: { ...bay, stalls: [] } };
    const d0 = getTyphoonShelterTruckParking(noStalls, 0, isRoad);
    assert.equal(d0.road.col + d0.shift.col, 11.5, 'in the driveway');
    const queued = getTyphoonShelterTruckParking(withBay, 2, isRoad);
    assert.ok(queued.road.col >= 12 && Math.abs(queued.shift.row) < 1e-9, 'at the curb');
  } finally {
    delete globalThis.getIceCreamArrivalDirectionForBuildingSide;
    delete globalThis.ICE_CREAM_EVENT_CONFIG;
  }
});

test('markets and restaurants face the sea, and draw their lights-off day art only while shut in daylight', () => {
  const { getTyphoonShelterFacingKey, isTyphoonShelterBuildingOpen, getTyphoonShelterLightingKey } = market;
  assert.equal(getTyphoonShelterFacingKey('fish_market_1x1', 'sw', true), 'fish_market_1x1');
  assert.equal(getTyphoonShelterFacingKey('fish_market_1x1', 'nw', true), 'fish_market_1x1_m');
  assert.equal(getTyphoonShelterFacingKey('fish_market_1x1', 'nw', false), 'fish_market_1x1');
  // the market from the trucks' 03:00 queue to the morning's last loads; the restaurant lunch to late
  assert.equal(isTyphoonShelterBuildingOpen('fish_market', 3 * 60), true);
  assert.equal(isTyphoonShelterBuildingOpen('fish_market', 9 * 60 + 59), true);
  assert.equal(isTyphoonShelterBuildingOpen('fish_market', 10 * 60), false);
  assert.equal(isTyphoonShelterBuildingOpen('fish_market', 14 * 60 + 1440 * 3), false, 'any day');
  assert.equal(isTyphoonShelterBuildingOpen('seafood_restaurant', 9 * 60), false);
  assert.equal(isTyphoonShelterBuildingOpen('seafood_restaurant', 19 * 60), true);
  assert.equal(isTyphoonShelterBuildingOpen('fish_loading_bay', 14 * 60), true, 'the bay is an open lot: no lights to put out');
  assert.equal(isTyphoonShelterBuildingOpen('harbor', 14 * 60), true, 'no hours: always as drawn');
  assert.equal(getTyphoonShelterLightingKey('fish_market_1x1_m', true, true), 'fish_market_1x1_m_day');
  assert.equal(getTyphoonShelterLightingKey('fish_market_1x1_m', false, true), 'fish_market_1x1_m');
  assert.equal(getTyphoonShelterLightingKey('fish_market_1x1', true, false), 'fish_market_1x1', 'no day art: the lit art');
});

test('a loading bay turns its driveway to the road: the mirror for a road to the south-east or north-west', () => {
  const { isTyphoonShelterBayMirrored } = market;
  // plain art: the driveway opens bottom-left and top-right; the mirror bottom-right and top-left
  assert.equal(isTyphoonShelterBayMirrored('sw'), false);
  assert.equal(isTyphoonShelterBayMirrored('ne'), false);
  assert.equal(isTyphoonShelterBayMirrored('se'), true);
  assert.equal(isTyphoonShelterBayMirrored('nw'), true);
  assert.equal(isTyphoonShelterBayMirrored(null), false);
});

test('the 黃金海岸酒店 stands within reach of a yacht club', () => {
  const { goldCoastHotelClubGap } = market;
  const club = { row: 10, col: 10, cols: 2, rows: 2 };
  // a 4x4 lot right beside the club, then one 8 tiles off, then one too far
  assert.equal(goldCoastHotelClubGap(10, 12, 4, 4, [club]), 0);
  assert.equal(goldCoastHotelClubGap(10, 20, 4, 4, [club], 8), 8);
  assert.equal(goldCoastHotelClubGap(10, 21, 4, 4, [club], 8), null);
  assert.equal(goldCoastHotelClubGap(0, 0, 4, 4, [], 8), null);
});
