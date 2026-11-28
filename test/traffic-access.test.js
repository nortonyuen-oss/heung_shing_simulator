// Traffic leaves a lot by the roads nearest it (Norton, 2026-11-28: 公屋居屋既交通需求係咪有問題,
// 點解屋村附近既交通咁少). Until then only roads within two steps of a building's first tile counted:
// every 公屋 block, set in its estate's gardens, and about a fifth of a city's people gave no traffic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const infrastructure = fs.readFileSync(path.join(ROOT, 'sim-infrastructure.js'), 'utf8');
const { getHousingEstateLand } = require('../housing-estates.js');

// The traffic section of sim-infrastructure.js on a small map: roads where `roads` says.
function trafficWorld({ size = 20, roads = [], estates = [] } = {}) {
  const start = infrastructure.indexOf('// ── Traffic map');
  const end = infrastructure.indexOf('\n}\n', infrastructure.indexOf('function updateTrafficMap')) + 3;
  assert.ok(start > 0 && end > start, 'the traffic section must stay extractable');
  const ROAD = 2;
  const mapData = Array.from({ length: size }, () => Array(size).fill(1));
  roads.forEach(([r, c]) => { mapData[r][c] = ROAD; });
  const index = new Map();
  estates.forEach((estate) => estate.slots.forEach((slot) => {
    for (let r = 0; r < slot.size; r++) for (let c = 0; c < slot.size; c++) index.set(`${slot.row + r}:${slot.col + c}`, { estate, slot });
  }));
  const context = vm.createContext({
    Map, Set, Math, Number, Array, Object,
    MAP_WIDTH: size, MAP_HEIGHT: size, ROAD, ZONE_NONE: 0, DENSITY_LOW: 1, ZONE_ROAD_ACCESS_TILES: 5,
    mapData,
    zoneMap: Array.from({ length: size }, () => Array(size).fill(0)),
    zoneDensityMap: Array.from({ length: size }, () => Array(size).fill(3)),
    trafficMap: Array.from({ length: size }, () => Array(size).fill(0)),
    buildingData: {},
    roadUnderlayMap: new Map(),
    bridgeMap: new Map(),
    city: {},
    getTileId: (r, c) => `${r}:${c}`,
    isInsideMap: (r, c) => r >= 0 && c >= 0 && r < size && c < size,
    getCardinalNeighbors: (r, c) => [[r - 1, c], [r, c + 1], [r + 1, c], [r, c - 1]],
    *iterateGameTiles() { for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) yield { row, col }; },
    isPolicyActive: () => false,
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    getHousingEstateAt: (r, c) => index.get(`${r}:${c}`) ?? null,
    getHousingEstateLand,
  });
  vm.runInContext(infrastructure.slice(start, end), context, { filename: 'sim-infrastructure.js' });
  return context;
}

// (arrays made in the map's context come back as plain arrays of this one)
const run = (world, code) => JSON.parse(JSON.stringify(vm.runInContext(code, world)));
const roadsAlong = (fixed, from, to, axis) => Array.from({ length: to - from + 1 }, (_, k) => (axis === 'row' ? [fixed, from + k] : [from + k, fixed]));

test('a lot whose road runs along its far side, or a few tiles off, loads that road', () => {
  // a 3x3 tower at (5,5)-(7,7); the road runs below it along row 8 - nowhere near its first tile
  const world = trafficWorld({ roads: roadsAlong(8, 0, 19, 'row') });
  const routes = run(world, 'getTrafficRoadRoutes(5, 5, 3, 3)');
  assert.ok(routes.length > 0, 'the tower reaches the road along its side');
  assert.deepEqual(routes.filter(([, , d]) => d === 1).map(([r, c]) => `${r}:${c}`).sort(), ['8:5', '8:6', '8:7']);
  // a lot four tiles from the road (it grows: ZONE_ROAD_ACCESS_TILES) comes out at that distance
  const off = run(world, 'getTrafficRoadRoutes(4, 10, 1, 1)');
  assert.equal(Math.min(...off.map(([, , d]) => d)), 4);
  // six tiles off is past the reach: no traffic, as no growth
  assert.equal(run(world, 'getTrafficRoadRoutes(2, 10, 1, 1)').length, 0);
});

test('a lot on a road comes out by that road only, not also by one further off', () => {
  const world = trafficWorld({ roads: [...roadsAlong(5, 0, 19, 'row'), ...roadsAlong(9, 0, 19, 'row')] });
  const entries = run(world, 'getTrafficRoadRoutes(6, 10, 1, 1)').filter(([, , d]) => d === 1).map(([r, c]) => `${r}:${c}`);
  assert.deepEqual(entries, ['5:10']);
  // a road touching only at a corner still serves a lot with nothing nearer
  const corner = trafficWorld({ roads: [[4, 4]] });
  assert.deepEqual(run(corner, 'getTrafficRoadRoutes(5, 5, 1, 1)').map(([r, c, d]) => `${r}:${c}:${d}`), ['4:4:1']);
});

test('a 公屋 block deep in its estate sends its residents out by the roads round the estate', () => {
  // an estate on (2,2)-(9,13), a road along its front (row 10); a block in the back row at (2,2)
  const estate = { id: 'estate-1', slots: [
    { kind: 'block', row: 2, col: 2, size: 3 }, { kind: 'block', row: 7, col: 11, size: 3 }, { kind: 'park1', row: 9, col: 2, size: 1 },
  ] };
  const world = trafficWorld({ roads: roadsAlong(10, 0, 19, 'row'), estates: [estate] });
  world.buildingData['2:2'] = { type: 'residential', density: 3, footprintRows: 3, footprintCols: 3 };
  world.buildingData['15:15'] = { type: 'residential', density: 3 };
  assert.deepEqual(run(world, 'getTrafficSourceLot(2, 2, buildingData["2:2"])'), { row: 2, col: 2, rows: 8, cols: 12 }, "the estate's land");
  assert.deepEqual(run(world, 'getTrafficSourceLot(15, 15, buildingData["15:15"])'), { row: 15, col: 15, rows: 1, cols: 1 });
  vm.runInContext('updateTrafficMap()', world);
  assert.ok(world.trafficMap[10][5] > 0, 'the road in front of the estate carries its residents');
});

test("a city's traffic stays at the level the campaign's goals were set for", () => {
  assert.match(infrastructure, /const TRAFFIC_ZONE_DEMAND_SCALE = 80 \/ 105;/);
  assert.match(infrastructure, /TRAFFIC_DEMAND_WEIGHTS\[zoneType\]\?\.\[level\] \?\? 1\)\s*\* TRAFFIC_ZONE_DEMAND_SCALE/);
  assert.match(infrastructure, /const TRAFFIC_ROAD_CAP\s+= 80;/, 'region, port and cruise loads keep their scale');
});
