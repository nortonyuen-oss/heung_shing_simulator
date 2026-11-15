const assert = require('node:assert/strict');
const { test } = require('node:test');

// light-rail.js runs on the metro's rail planner and the tram's street planner (globals in the game)
global.rotateDirection = (d, steps) => { const o = ['n', 'e', 's', 'w']; return o[(o.indexOf(d) + ((steps % 4) + 4)) % 4]; };
Object.assign(global, require('../metro-surface.js'), require('../tram.js'));
Object.assign(global, require('../tram-lines.js'));
const lr = require('../light-rail.js');

const X = 1, Y = 2;
// A map: `roads` a set of 'row:col', `hills` { 'row:col': level }; open ground elsewhere.
const env = ({ roads = new Set(), hills = {}, bands = {} } = {}) => {
  const isRoad = (r, c) => roads.has(`${r}:${c}`);
  return {
    isRoad,
    bandAt: (r, c) => bands[`${r}:${c}`] || null,
    canStreet: isRoad,
    canCross: isRoad,
    canGround: (r, c) => !isRoad(r, c) && r >= 0 && c >= 0,
    rail: {
      level: (r, c) => hills[`${r}:${c}`] || 0,
      openEdges: () => [],
      inside: (r, c) => r >= 0 && c >= 0 && r < 100 && c < 100,
      canDeck: (r, c) => r >= 0 && c >= 0,
      groundAt: (k) => (hills[k] || 0) * 6.656,
    },
  };
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
  assert.equal(lr.whyNotLightRailStationAt(5, 4, state, e).code, 'notGround', 'not on the street');
  assert.equal(lr.whyNotLightRailStationAt(18, 8, state, e).code, 'notGround', 'not on the viaduct (phase 3: ground only)');
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
