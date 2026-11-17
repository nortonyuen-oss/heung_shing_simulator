const assert = require('node:assert/strict');
const { test } = require('node:test');

// light-rail.js runs on the metro's rail planner and the tram's street planner (globals in the game)
global.rotateDirection = (d, steps) => { const o = ['n', 'e', 's', 'w']; return o[(o.indexOf(d) + ((steps % 4) + 4)) % 4]; };
Object.assign(global, require('../metro-surface.js'), require('../tram.js'));
Object.assign(global, require('../tram-lines.js'));
const lr = require('../light-rail.js');

const X = 1, Y = 2;
// A map: `roads` a set of 'row:col', `hills` { 'row:col': level }; open ground elsewhere.
const env = (opts = {}) => withGround(baseEnv(opts));
const baseEnv = ({ roads = new Set(), hills = {}, bands = {} } = {}) => {
  const isRoad = (r, c) => roads.has(`${r}:${c}`);
  return {
    isRoad,
    bandAt: (r, c) => bands[`${r}:${c}`] || null,
    canStreet: isRoad,
    canCross: isRoad,
    canGround: (r, c) => !isRoad(r, c) && r >= 0 && c >= 0,
    rail: {
      level: (r, c) => hills[`${r}:${c}`] || 0,
      // (a hill tile falls away to its lower neighbours, as tile-keys.js getHillOpenEdges)
      openEdges: (r, c) => {
        const h = hills[`${r}:${c}`] || 0;
        if (h <= 0) return [];
        return [['n', -1, 0], ['e', 0, 1], ['s', 1, 0], ['w', 0, -1]].filter(([, dr, dc]) => (hills[`${r + dr}:${c + dc}`] || 0) < h).map(([d]) => d);
      },
      inside: (r, c) => r >= 0 && c >= 0 && r < 100 && c < 100,
      canDeck: (r, c) => r >= 0 && c >= 0,
    },
  };
};
const withGround = (e) => {
  const lvlOf = (r, c) => lr.lightRailCornersFrom(e.rail.level(r, c), e.rail.openEdges(r, c));
  e.rail.groundAt = (k, side = null) => { const [r, c] = k.split(':').map(Number); return lr.lightRailGroundMetres(lvlOf(r, c), side); };
  return e;
};
const row = (r, c0, c1) => { const s = new Set(); for (let c = c0; c <= c1; c++) s.add(`${r}:${c}`); return s; };
const col = (c, r0, r1) => { const s = new Set(); for (let r = r0; r <= r1; r++) s.add(`${r}:${c}`); return s; };
const empty = () => ({ tracks: {}, trackElev: {} });

test('a road runs north-south or east-west by its neighbours, a dual carriageway by its band', () => {
  const e = env({ roads: row(5, 0, 9) });
  assert.equal(lr.lightRailRoadAxis(5, 4, e), 'ew');
  assert.equal(lr.lightRailRoadAxis(5, 4, env({ roads: col(4, 0, 9) })), 'ns');
  assert.equal(lr.lightRailRoadAxis(5, 4, env({ roads: row(5, 0, 9), bands: { '5:4': { orientation: 'v' } } })), 'ns');
  assert.equal(lr.lightRailCrossesRoad(X, 'ew'), true, 'X runs north-south: across an east-west road');
  assert.equal(lr.lightRailCrossesRoad(Y, 'ew'), false, 'Y runs along it');
});

test('open ground: ballasted track, at the light rail costs', () => {
  const plan = lr.planLightRailTrackPure({ row: 2, col: 2 }, { row: 2, col: 6 }, 'ground', empty(), env());
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.mode, 'rail');
  assert.deepEqual(plan.kinds, { ground: 5 });
  assert.equal(plan.cost, 5 * lr.LIGHT_RAIL.groundCostPerTile);
  assert.equal(plan.bits['2:4'], Y);
});

test('a road crossed straight on the way is a level crossing; one met at an angle stops the drag', () => {
  const e = env({ roads: row(5, 0, 9) });
  const plan = lr.planLightRailTrackPure({ row: 2, col: 4 }, { row: 8, col: 4 }, 'ground', empty(), e);
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.kinds.crossing, 1);
  assert.equal(plan.bits['5:4'], X, 'straight across');
  assert.ok(!plan.clearTiles.includes('5:4'), 'the road stays');
  assert.equal(lr.lightRailTileKind(5, 4, X, null, e), 'crossing');
  // turning on the road: no crossing
  const turned = lr.planLightRailTrackPure({ row: 2, col: 2 }, { row: 5, col: 6 }, 'ground', empty(), env({ roads: row(5, 0, 9) }));
  assert.equal(turned.ok, false);
  assert.equal(turned.reason, 'crossing');
});

test('along a road: street track, laid by the tram planner on the light rail track', () => {
  const e = env({ roads: row(5, 0, 9) });
  const plan = lr.planLightRailTrackPure({ row: 5, col: 1 }, { row: 5, col: 6 }, 'ground', empty(), e);
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.mode, 'street');
  assert.equal(plan.kinds.street, 6);
  assert.equal(plan.bits['5:3'], Y);
  assert.equal(lr.lightRailTileKind(5, 3, Y, null, e), 'street');
});

test('a street station, as a tram stop: on a narrow road\'s straight, or a dual carriageway\'s reservation', () => {
  // a narrow road (row 5) and a dual carriageway (rows 10-11, its band two wide)
  const roads = new Set([...row(5, 0, 9), ...row(10, 0, 9), ...row(11, 0, 9)]);
  const bands = {};
  for (let c = 0; c <= 9; c++) {
    bands[`10:${c}`] = { orientation: 'h', width: 2, index: 0 };
    bands[`11:${c}`] = { orientation: 'h', width: 2, index: 1 };
  }
  const e = env({ roads, bands });
  const state = { tracks: {}, trackElev: {}, stations: [] };
  for (let c = 1; c <= 8; c++) { state.tracks[`5:${c}`] = Y; state.tracks[`10:${c}`] = Y; state.tracks[`11:${c}`] = Y; }
  const narrow = lr.whyNotLightRailStationAt(5, 4, state, e);
  assert.equal(narrow.code, null);
  assert.deepEqual(narrow.site, { row: 5, col: 4, axis: 'ew', band: false, street: true });
  // either half of the reservation: the band's pair, its first row
  const far = lr.whyNotLightRailStationAt(11, 4, state, e);
  assert.equal(far.code, null);
  assert.deepEqual(far.site, { row: 10, col: 4, axis: 'ew', band: true, street: true });
  assert.deepEqual(lr.lightRailStationTiles(far.site), [[10, 4], [11, 4]]);
  // not right beside another, nor on its tiles
  state.stations.push({ id: 'a', ...far.site });
  assert.equal(lr.whyNotLightRailStationAt(10, 5, state, e).code, 'taken');
  assert.equal(lr.whyNotLightRailStationAt(10, 7, state, e).code, null);
  // a bend on the road is no place for one
  state.tracks['5:4'] = Y | 4;
  assert.equal(lr.whyNotLightRailStationAt(5, 4, state, e).code, 'notStraight');
});

test('elevated: a two-level deck over the road, four-tile ramps from the ground each end', () => {
  const e = env({ roads: row(8, 0, 19) });
  const state = empty();
  // ground track at each end, then the deck between them
  for (const [a, b] of [[{ row: 0, col: 10 }, { row: 1, col: 10 }], [{ row: 14, col: 10 }, { row: 15, col: 10 }]]) {
    const p = lr.planLightRailTrackPure(a, b, 'ground', state, e);
    assert.equal(p.ok, true, p.reason);
    state.tracks = p.bits; state.trackElev = p.elev;
  }
  const plan = lr.planLightRailTrackPure({ row: 1, col: 10 }, { row: 14, col: 10 }, 'deck', state, e);
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.kinds.ramp, 8, 'four tiles up, four down');
  assert.equal(plan.elev['2:10'], '1s', 'the first step, rising south');
  assert.equal(plan.elev['5:10'], '4s');
  assert.equal(plan.elev['6:10'], 'd2', 'two levels up');
  assert.equal(plan.elev['13:10'], '1n');
  assert.equal(plan.elev['8:10'], 'd2', 'over the road');
  assert.ok(!plan.clearTiles.includes('8:10'), 'the road runs on under it');
  assert.equal(railSideHeight('4s', 's', 0, lr.LIGHT_RAIL_SPEC), 2 * METRO_RAIL.hillLevelMetres, 'the ramp tops out at the deck');
  assert.equal(railSideHeight('5s', 's', 0), METRO_RAIL.deckMetres, 'the metro\'s ramps unchanged');
});

test('never underground: a hill higher than the deck stops it', () => {
  const hills = {};
  for (let c = 4; c <= 6; c++) hills[`3:${c}`] = 3;
  const plan = lr.planLightRailTrackPure({ row: 3, col: 0 }, { row: 3, col: 10 }, 'deck', empty(), env({ hills }));
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'hillHigh');
});

test('the saved state keeps only what it should', () => {
  const s = lr.normalizeLightRailState({ tracks: { '1:2': 2, bad: 3, '3:4': 99 }, trackElev: { '1:2': 'd2', '5:5': 'd2', '1:3': 'u' } });
  assert.deepEqual(s.tracks, { '1:2': 2 });
  assert.deepEqual(s.trackElev, { '1:2': 'd2' });
});

// lays a drag on `state` (it must succeed)
const layOn = (state, e, a, b, h = 'ground') => {
  const p = lr.planLightRailTrackPure(a, b, h, state, e);
  assert.equal(p.ok, true, `${JSON.stringify(a)}-${JSON.stringify(b)} ${h}: ${p.reason}`);
  state.tracks = p.bits; state.trackElev = p.elev;
};

test('one route from street track on a road, off it over open ground, up a ramp and along a deck', () => {
  const e = env({ roads: row(5, 0, 12) });
  const state = { ...empty(), stations: [] };
  layOn(state, e, { row: 5, col: 1 }, { row: 5, col: 8 });                // along the road
  layOn(state, e, { row: 5, col: 8 }, { row: 12, col: 8 });               // off it, south over the ground
  layOn(state, e, { row: 12, col: 8 }, { row: 22, col: 8 }, 'deck');      // up onto a viaduct
  layOn(state, e, { row: 22, col: 8 }, { row: 26, col: 8 }, 'deck');
  const geo = lr.buildLightRailGeometry(state, e);
  // stations: one on the ground (the middle of three straight tiles), one up on the deck's far end? no -
  // stations stand on the ground: one at 9:8, and a stop on the street to route to
  assert.equal(lr.whyNotLightRailStationAt(9, 8, state, e).code, null);
  // (and on the street, as a tram stop: Norton 2026-11-17)
  assert.equal(lr.whyNotLightRailStationAt(5, 4, state, e).site?.street, true, 'a street station on the road');
  assert.equal(lr.whyNotLightRailStationAt(18, 8, state, e).code, 'notGround', 'not on the viaduct');
  const route = buildTramLineRoute(geo, [{ row: 5, col: 3, axis: 'ew', band: false }, { row: 9, col: 8, axis: 'ns', band: false }]);
  assert.ok(!route.code, `route: ${route.code}`);
  // it runs from the road onto the ground: a point on each
  assert.ok(route.pts.some(([x, y]) => Math.floor(y) === 5 && Math.floor(x) === 3));
  assert.ok(route.pts.some(([x, y]) => Math.floor(y) === 8 && Math.floor(x) === 8));
  // heights: the ground at 0, the deck two levels up, the ramp half way at its second step's end
  assert.equal(lr.lightRailHeightAt(8.5, 9.5, state, e), 0);
  assert.equal(lr.lightRailHeightAt(8.4, 20.5, state, e), 2 * METRO_RAIL.hillLevelMetres);
  assert.ok(Math.abs(lr.lightRailHeightAt(8.5, 15, state, e) - METRO_RAIL.hillLevelMetres) < 1e-9, 'half way up the ramp');
  // the traffic: on the narrow road's street track, not on the ground
  assert.equal(lr.lightRailInTrafficAt(3.5, 5.4, state, e), true);
  assert.equal(lr.lightRailInTrafficAt(8.4, 9.5, state, e), false);
});

test('a call: riders off spread over the stations ahead, the queue on up to the room, each paying the flat fare', () => {
  global.TRAM_SERVICE = require('../tram-lines.js').TRAM_SERVICE;
  const { lightRailCall, LIGHT_RAIL_SERVICE } = require('../light-rail-lines.js');
  const single = lightRailCall({ aboard: 120, waiting: 500, arrivingAhead: 2, share: 1, capacity: 200 });
  assert.equal(single.alighting, 60, 'half get off here, half at the last station');
  assert.equal(single.boarding, 140, 'as many on as there is room');
  assert.ok(Math.abs(single.revenue - 140 * LIGHT_RAIL_SERVICE.fare) < 1e-9);
  const pair = lightRailCall({ aboard: 120, waiting: 500, arrivingAhead: 2, share: 1, capacity: 400 });
  assert.equal(pair.boarding, 340, 'a coupled pair takes twice the room');
  assert.equal(lightRailCall({ aboard: 30, waiting: 80, arrivingAhead: 1, share: 0, capacity: 200 }).boarding, 0, 'the last station: everyone off, no one on');
});

test('the light rail opens only when the council passes 輕便鐵路撥款 (15,000 people), its grant spent first', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  // the resolution, as the council sees it
  const ctx = vm.createContext({});
  vm.runInContext(`${fs.readFileSync(path.join(__dirname, '..', 'council-definitions.js'), 'utf8')}; this.defs = COUNCIL_RESOLUTION_DEFS;`, ctx);
  const def = ctx.defs.find((d) => d.id === 'lightRailFunding');
  assert.ok(def, 'a lightRailFunding resolution');
  assert.equal(def.unlockPopulation, 15000);
  assert.equal(def.requiresTransportCompany, true);
  assert.equal(def.transportGrant, 'lightRail');
  // the company's side
  const transport = { company: { cash: 1000 }, lightRail: lr.normalizeLightRailState(null) };
  global.getTransportExpansionState = () => transport;
  global.isTransportExpansionActive = () => true;
  let spent = 0;
  global.spendTransportConstruction = (n) => { if (transport.company.cash < n) return false; transport.company.cash -= n; spent += n; return true; };
  try {
    assert.equal(lr.isLightRailUnlocked(), false, 'closed before the vote');
    assert.equal(lr.spendLightRailFunds(100), false, 'nothing built before the vote');
    assert.equal(lr.grantLightRailFunding(5000), 5000);
    assert.equal(lr.isLightRailUnlocked(), true, 'open once passed');
    assert.equal(lr.spendLightRailFunds(4000), true);
    assert.equal(transport.lightRail.grantBalance, 1000, 'the grant pays first');
    assert.equal(spent, 0, 'the company\'s cash untouched');
    assert.equal(lr.spendLightRailFunds(1500), true);
    assert.equal(transport.lightRail.grantBalance, 0);
    assert.equal(spent, 500, 'the rest from the company');
    assert.equal(lr.spendLightRailFunds(5000), false, 'not enough: nothing spent');
    assert.equal(spent, 500);
    assert.deepEqual(lr.normalizeLightRailState({ approved: true, grantBalance: 12.4 }).approved, true, 'kept through a save');
  } finally {
    delete global.getTransportExpansionState; delete global.isTransportExpansionActive; delete global.spendTransportConstruction;
  }
});

test('ground track follows the ground: over a rise, across a slope\'s corner, up onto a plateau', () => {
  // a rise of one level between two ends on the flat: on it, not a tunnel nor a refusal
  const bump = {};
  for (let c = 5; c <= 7; c++) bump[`3:${c}`] = 1;
  const over = lr.planLightRailTrackPure({ row: 3, col: 0 }, { row: 3, col: 12 }, 'ground', empty(), env({ hills: bump }));
  assert.equal(over.ok, true, over.reason);
  assert.deepEqual(over.elev, {}, 'no viaduct, no tunnel: ground track all the way');
  // a plateau (level 1, rows 0-5, cols 0-5): its corner tile falls away two ways
  const plateau = {};
  for (let r = 0; r <= 5; r++) for (let c = 0; c <= 5; c++) plateau[`${r}:${c}`] = 1;
  const e = env({ hills: plateau });
  assert.deepEqual(e.rail.openEdges(5, 5).sort(), ['e', 's'], 'a slope corner');
  const down = lr.planLightRailTrackPure({ row: 2, col: 2 }, { row: 9, col: 9 }, 'ground', empty(), e);
  assert.equal(down.ok, true, down.reason);
  // along the plateau's edge and off it sideways: no 'slope axis' rule any more
  const along = lr.planLightRailTrackPure({ row: 5, col: 0 }, { row: 5, col: 9 }, 'ground', empty(), e);
  assert.equal(along.ok, true, along.reason);
  // the height is continuous where the plateau meets its slope: one height at their shared side
  const state = { tracks: down.bits, trackElev: {} };
  const z1 = lr.lightRailHeightAt(4.5, 4.999, state, e), z2 = lr.lightRailHeightAt(4.5, 5.001, state, e);
  assert.ok(Math.abs(z1 - z2) < 0.05, `${z1} vs ${z2}`);
});

test('where the terrain\'s corners disagree, track meets track at one height (raised, never sunk)', () => {
  // 太子 147:104-106 as the terrain draws it: a slope's corner, a hillside, then a plateau whose
  // corner by the hillside's low one is a level higher (the terrain simplified there)
  const raw = { '0:0': { nw: 2, ne: 2, se: 3, sw: 2 }, '0:1': { nw: 2, ne: 2, se: 3, sw: 3 }, '0:2': { nw: 3, ne: 3, se: 3, sw: 3 } };
  const e = env();
  e.rail.corners = (r, c) => raw[`${r}:${c}`] || { nw: 0, ne: 0, se: 0, sw: 0 };
  const state = { tracks: { '0:0': Y, '0:1': Y, '0:2': Y }, trackElev: {} };
  assert.deepEqual(lr.lightRailTrackCorners(0, 1, state, e), { nw: 2, ne: 3, se: 3, sw: 3 }, 'its low corner raised to the plateau track\'s');
  assert.deepEqual(lr.lightRailTrackCorners(0, 2, state, e), raw['0:2'], 'the higher never lowered');
  for (const x of [1, 2]) {
    const z1 = lr.lightRailHeightAt(x - 0.001, 0.5, state, e), z2 = lr.lightRailHeightAt(x + 0.001, 0.5, state, e);
    assert.ok(Math.abs(z1 - z2) < 0.05, `at x ${x}: ${z1} vs ${z2}`);
  }
  // only ground track counts: not open ground, nor a viaduct
  assert.deepEqual(lr.lightRailTrackCorners(0, 1, { tracks: { '0:0': Y, '0:1': Y }, trackElev: {} }, e), raw['0:1']);
  assert.deepEqual(lr.lightRailTrackCorners(0, 1, { tracks: state.tracks, trackElev: { '0:2': 'd2' } }, e), raw['0:1']);
  // the fold is the same diagonal of the map whichever way it is turned
  const k = { nw: 2, ne: 3, se: 4, sw: 2 };
  assert.equal(lr.lightRailVisualFold(k, 0), 'lr', 'NE-SW (the nearer level): left to right as drawn');
  assert.equal(lr.lightRailVisualFold(k, 1), 'tb', 'turned once: top to bottom');
});

test('a slope corner\'s corners, and as drawn when the map is turned', () => {
  const k = lr.lightRailCornersFrom(1, ['e', 's']);
  assert.deepEqual(k, { nw: 1, ne: 0, se: 0, sw: 0 }, 'falls away east and south: only the far corner high');
  assert.equal(lr.lightRailSurfaceLevel(k, 0, 0), 1);
  assert.equal(lr.lightRailSurfaceLevel(k, 1, 1), 0);
  assert.ok(Math.abs(lr.lightRailSurfaceLevel(k, 0.5, 0.5) - 0) < 1e-9, 'the fold along the low diagonal');
  assert.deepEqual(lr.lightRailVisualCornerLifts(k, 0), { top: 1, right: 0, bottom: 0, left: 0 }, 'map north-west is the top corner');
  assert.deepEqual(lr.lightRailVisualCornerLifts(k, 1), { top: 0, right: 1, bottom: 0, left: 0 }, 'turned once it is on the right');
});
