const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const fly = require('../road-flyovers.js');

// A map for planHighBridgePure: open flat ground at level `base` unless told otherwise.
const env = ({ water = [], roads = [], rail = {}, heights = {}, slopes = [], blocked = [], base = 0 } = {}) => {
  const has = (list) => (r, c) => list.includes(`${r}:${c}`);
  return {
    inside: (r, c) => r >= 0 && c >= 0 && r < 100 && c < 100,
    height: (r, c) => (heights[`${r}:${c}`] ?? (has(water)(r, c) ? 0 : base)),
    isWater: has(water),
    isSlope: has(slopes),
    isRoad: has(roads),
    blocked: has(blocked),
    rail: (r, c) => rail[`${r}:${c}`] || null,
    shelter: () => false,
    nearPier: () => false,
  };
};
const rowPath = (r, c0, c1) => Array.from({ length: c1 - c0 + 1 }, (_, i) => ({ row: r, col: c0 + i }));

test('a 天橋 climbs four ramp tiles a level each, runs its deck four levels up, and comes down', () => {
  const plan = fly.planHighBridgePure(rowPath(5, 0, 12), 'row', 'flyover', env({ rail: { '5:6': 'under' } }));
  assert.equal(plan.ok, true, plan.reason);
  assert.deepEqual(plan.tiles.map((t) => t.value), [
    'ramp:e:0', 'ramp:e:1', 'ramp:e:2', 'ramp:e:3',
    'deck:row:4', 'deck:row:4', 'deck:row:4', 'deck:row:4', 'deck:row:4',
    'ramp:w:3', 'ramp:w:2', 'ramp:w:1', 'ramp:w:0',
  ]);
  assert.equal(plan.level, 4, 'four levels: clear of a double-decker (Norton: 巴士好高)');
  assert.equal(plan.cost, 13 * 10 + 8 * fly.FLYOVER.rampCostPerTile + 5 * fly.FLYOVER.deckCostPerTile);
  // dragged the other way, and down a column
  const back = fly.planHighBridgePure(rowPath(5, 0, 12).reverse(), 'row', 'flyover', env());
  assert.equal(back.tiles[0].value, 'ramp:w:0');
  const col = fly.planHighBridgePure(Array.from({ length: 9 }, (_, i) => ({ row: i, col: 3 })), 'col', 'flyover', env());
  assert.deepEqual(col.tiles.map((t) => t.value), ['ramp:s:0', 'ramp:s:1', 'ramp:s:2', 'ramp:s:3', 'deck:col:4', 'ramp:n:3', 'ramp:n:2', 'ramp:n:1', 'ramp:n:0']);
  // from a plateau: its levels from there
  const high = fly.planHighBridgePure(rowPath(5, 0, 8), 'row', 'flyover', env({ base: 2 }));
  assert.equal(high.tiles[4].value, 'deck:row:6');
});

test('what a 天橋 may not do', () => {
  const plan = (path, opts, style = 'flyover') => fly.planHighBridgePure(path, 'row', style, env(opts));
  assert.equal(plan(rowPath(5, 0, 7)).reason, 'tooShort', 'nine tiles at least');
  assert.equal(plan(rowPath(5, 0, 10), { rail: { '5:1': 'under' } }).reason, 'rampRail', 'no ramp on the track');
  // a road under it: a 立交 (the traffic has a layer for the deck over it)
  const over = plan(rowPath(5, 0, 10), { roads: ['5:5'] });
  assert.equal(over.ok, true, over.reason);
  assert.equal(over.roads, 1);
  assert.equal(over.tiles[5].value, 'deck:row:4');
  assert.equal(plan(rowPath(5, 0, 10), { rail: { '5:5': 'no' } }).reason, 'rail', 'no station, viaduct or ramp under it');
  assert.equal(plan(rowPath(5, 0, 10), { water: ['5:1'] }).reason, 'rampWater');
  assert.equal(plan(rowPath(5, 0, 10), { heights: { '5:9': 1 } }).reason, 'rampGround', 'both ends at one level');
  assert.equal(plan(rowPath(5, 0, 10), { heights: { '5:5': 1 } }).reason, 'deckGround', 'nothing under the deck higher than the ends');
  assert.equal(plan(rowPath(5, 0, 10), { slopes: ['5:5'] }).reason, 'deckGround');
  assert.equal(plan(rowPath(5, 0, 10), { blocked: ['5:5'] }).reason, 'blocked');
  assert.equal(plan(rowPath(5, 0, 10), { base: 6 }).reason, 'tooHigh');
  // water and ground track under the deck are fine; a road at the ends becomes the ramp
  assert.equal(plan(rowPath(5, 0, 10), { water: ['5:4', '5:5'], rail: { '5:6': 'under' }, roads: ['5:0'] }).ok, true);
});

test('a 懸索橋 is a 天橋 hung over the sea, its tiles marked', () => {
  const water = Array.from({ length: 10 }, (_, i) => `5:${5 + i}`);
  const plan = fly.planHighBridgePure(rowPath(5, 0, 19), 'row', 'suspension', env({ water }));
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.water, 10, 'ten tiles of sea at least: a shorter span had stumpy towers');
  assert.ok(plan.tiles.every((t) => t.value.endsWith(':s')));
  assert.equal(plan.tiles[0].value, 'ramp:e:0:s');
  assert.equal(plan.tiles[6].value, 'deck:row:4:s');
  const short = fly.planHighBridgePure(rowPath(5, 0, 18), 'row', 'suspension', env({ water: Array.from({ length: 9 }, (_, i) => `5:${5 + i}`) }));
  assert.equal(short.reason, 'suspensionWater');
});

test('bridge values: the low bridge\'s as before, the high ones with their level', () => {
  const context = vm.createContext({});
  vm.runInContext(source('bridges.js'), context, { filename: 'bridges.js' });
  const parse = (v) => JSON.parse(JSON.stringify(vm.runInContext(`parseBridgeValue(${JSON.stringify(v)})`, context)));
  const normal = (v) => vm.runInContext(`normalizeBridgeMapValue(${JSON.stringify(v)})`, context);
  assert.deepEqual(parse('deck:row'), { kind: 'deck', axis: 'row', dir: null, level: null, high: false, suspension: false });
  assert.deepEqual(parse('ramp:n'), { kind: 'ramp', axis: 'col', dir: 'n', level: null, high: false, suspension: false });
  assert.deepEqual(parse('deck:col:3'), { kind: 'deck', axis: 'col', dir: null, level: 3, high: true, suspension: false });
  assert.deepEqual(parse('ramp:w:2:s'), { kind: 'ramp', axis: 'row', dir: 'w', level: 2, high: true, suspension: true });
  assert.equal(parse('deck:row:s'), null);
  assert.equal(normal('row'), 'deck:row', 'an old save spelling');
  assert.equal(normal('ramp:e:1'), 'ramp:e:1');
  assert.equal(normal('ramp:x:1'), null);
  // the save's own check takes them too
  const pattern = new RegExp(source('save.js').match(/const COMPACT_BRIDGE_VALUE_PATTERN = \/(.+)\/;/)[1]);
  ['deck:row', 'ramp:s', 'deck:row:3', 'ramp:e:0:s'].forEach((v) => assert.ok(pattern.test(v), v));
  assert.ok(!pattern.test('deck:row:x'));
});

test('a high bridge\'s traffic surface: the deck a terrain level each, its ramps a level a tile', () => {
  const { getTrafficRoadSurface } = require('../traffic-visuals.js');
  const layers = {
    mapData: [[2, 2, 1, 2]],
    heightMap: [[0, 0, 0, 0]],
    bridgeMap: new Map([['0:1', 'ramp:e:2'], ['0:2', 'deck:row:3'], ['0:3', 'ramp:w:2:s']]),
    roadSlopeKeyMap: [[null, null, null, null]],
    roadValue: 2,
    heightStepPixels: 13,
  };
  const ramp = getTrafficRoadSurface(0, 1, layers);
  assert.equal(ramp.kind, 'bridge-ramp');
  assert.deepEqual(ramp.endpointLifts, { e: 39, w: 26 });
  const deck = getTrafficRoadSurface(0, 2, layers);
  assert.equal(deck.kind, 'bridge-deck');
  assert.deepEqual(deck.endpointLifts, { e: 39, w: 39 });
  assert.deepEqual(getTrafficRoadSurface(0, 3, layers).endpointLifts, { w: 39, e: 26 });
});

test('railway ramps and portals never go under a 天橋, ground track may', () => {
  global.rotateDirection = (d, steps) => { const o = ['n', 'e', 's', 'w']; return o[(o.indexOf(d) + ((steps % 4) + 4)) % 4]; };
  Object.assign(global, require('../metro-surface.js'), require('../tram.js'), require('../tram-lines.js'));
  const lr = require('../light-rail.js');
  const base = {
    isRoad: () => false, bandAt: () => null, canStreet: () => false, canCross: () => false,
    canGround: (r, c) => r >= 0 && c >= 0,
    rail: {
      level: () => 0, openEdges: () => [], inside: (r, c) => r >= 0 && c >= 0 && r < 100 && c < 100, canDeck: () => true,
      corners: () => ({ nw: 0, ne: 0, se: 0, sw: 0 }), groundAt: () => 0,
    },
  };
  const under = new Set(['2:4', '3:4']);
  const e = { ...base, underBridge: (r, c) => under.has(`${r}:${c}`) };
  const state = { tracks: {}, trackElev: {} };
  const ground = lr.planLightRailTrackPure({ row: 0, col: 4 }, { row: 8, col: 4 }, 'ground', state, e);
  assert.equal(ground.ok, true, ground.reason);
  // ground track first, then a viaduct off its end: the four-tile ramp would climb into the deck
  const start = lr.planLightRailTrackPure({ row: 0, col: 4 }, { row: 1, col: 4 }, 'ground', state, e);
  assert.equal(start.ok, true, start.reason);
  const laid = { tracks: start.bits, trackElev: start.elev };
  const ramped = lr.planLightRailTrackPure({ row: 1, col: 4 }, { row: 14, col: 4 }, 'deck', laid, e);
  assert.equal(ramped.ok, false, 'its ramp would climb into the deck');
  assert.equal(ramped.reason, 'rampGround');
  // the same with no 天橋 there
  const clear = lr.planLightRailTrackPure({ row: 1, col: 4 }, { row: 14, col: 4 }, 'deck', laid, { ...base });
  assert.equal(clear.ok, true, clear.reason);
});

test('parapets on a high bridge: marked raised, its ramps on the 13 px rise art', () => {
  const context = vm.createContext({ console, setTimeout, clearTimeout });
  vm.runInContext(source('bridge-parapets.js'), context, { filename: 'bridge-parapets.js' });
  const values = { '0:0': 'ramp:e:0', '0:1': 'deck:row:3:s', '0:2': 'deck:row' };
  const placements = JSON.parse(JSON.stringify(vm.runInContext('computeBridgeParapetPlacements', context)({
    mapWidth: 3, mapHeight: 1, bridgeValueAt: (r, c) => values[`${r}:${c}`] ?? null,
  })));
  assert.deepEqual(placements.filter((p) => p.col === 0).map((p) => [p.side, p.high, p.raised]), [['n', 'e', true], ['s', 'e', true]]);
  assert.ok(placements.filter((p) => p.col === 1).every((p) => p.raised && p.high === null));
  assert.ok(placements.filter((p) => p.col === 2).every((p) => !p.raised));
  const key = vm.runInContext('bridgeParapetTextureKey', context);
  assert.equal(key('ne', 'e', true), 'bridge_parapet_h_rise_se');
  assert.equal(key('ne', 'e', false), 'bridge_parapet_h_high_se');
  const files = vm.runInContext('BRIDGE_PARAPET_TEXTURE_FILES', context);
  Object.values(files).forEach((file) => assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is baked`));
});

test('立交: a tile under a 天橋 has two roads, and neither runs into the other', () => {
  const tv = require('../traffic-visuals.js');
  // a north-south road down column 1, a 天橋 along row 1 over it
  const layers = {
    mapData: [[1, 2, 1], [1, 2, 1], [1, 2, 1]],
    heightMap: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    bridgeMap: new Map([['1:0', 'deck:row:4'], ['1:1', 'deck:row:4'], ['1:2', 'deck:row:4']]),
    roadSlopeKeyMap: [[null, null, null], [null, null, null], [null, null, null]],
    roadValue: 2,
    heightStepPixels: 13,
  };
  assert.equal(tv.isTrafficInterchangeTile(1, 1, layers), true);
  assert.equal(tv.isTrafficInterchangeTile(1, 0, layers), false, 'a deck over grass has the one road');
  assert.deepEqual(tv.getTrafficRoadSurfaces(1, 1, layers).map((x) => x.layer), [null, 'deck']);
  const ground = tv.getTrafficRoadSurface(1, 1, layers);
  const deck = tv.getTrafficRoadSurface(1, 1, layers, 'deck');
  assert.equal(ground.centerLift, 0);
  assert.equal(deck.centerLift, 52);
  const west = tv.getTrafficRoadSurface(1, 0, layers);
  const north = tv.getTrafficRoadSurface(0, 1, layers);
  assert.equal(tv.trafficRoadSurfacesConnect(deck, west, 'w'), true, 'the deck runs on along the 天橋');
  assert.equal(tv.trafficRoadSurfacesConnect(ground, west, 'w'), false, 'the road under it never climbs onto it');
  assert.equal(tv.trafficRoadSurfacesConnect(ground, north, 'n'), true, 'the road under it runs on');
  assert.equal(tv.trafficRoadSurfacesConnect(deck, north, 'n'), false, 'the deck never drops onto the road');
});

test('立交: the road under a 天橋 is drawn as the road it is, not a junction with the deck', () => {
  const context = vm.createContext({});
  const ROAD = 2;
  const bridge = new Map([['1:0', 'deck:row:4'], ['1:1', 'deck:row:4'], ['1:2', 'deck:row:4'], ['1:3', 'ramp:w:3']]);
  const mapData = [[1, 2, 1, 1], [1, 2, 1, 2], [1, 2, 1, 1]];
  Object.assign(context, {
    ROAD, mapData, MAP_WIDTH: 4, MAP_HEIGHT: 3,
    isRoadLikeTile: (r, c) => r >= 0 && c >= 0 && r < 3 && c < 4 && (mapData[r][c] === ROAD || bridge.get(`${r}:${c}`)?.startsWith('deck:')),
    getTileHeight: () => 0,
  });
  vm.runInContext(source('bridges.js'), context);
  context.bridgeMap = bridge;
  context.getTileId = (r, c) => `${r}:${c}`;
  const tk = source('tile-keys.js');
  const pick = (name) => { const a = tk.indexOf(`function ${name}(`); return tk.slice(a, tk.indexOf('\n}\n', a) + 3); };
  vm.runInContext(pick('roadTilesJoin') + pick('roadEdgeLevel'), context);
  const join = (a, b, c, d) => vm.runInContext(`roadTilesJoin(${a}, ${b}, ${c}, ${d})`, context);
  assert.equal(join(1, 1, 0, 1), true, 'the road under: on to the north');
  assert.equal(join(1, 1, 1, 0), false, 'not into the deck beside it');
  assert.equal(join(1, 0, 1, 1), false, 'the deck: not down into the road under its neighbour');
  assert.equal(join(1, 2, 1, 3), true, 'the deck runs onto its ramp (its top at the deck\'s level)');
  assert.equal(join(1, 2, 0, 2), false, 'a deck\'s side has no road');
});
