const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const ROAD = 2;
const GROUND = 1;

// Real traffic-visuals.js + the real carriageway block from main.js, over a synthetic map.
function createRoadContext(size, isRoad) {
  const mapData = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => (isRoad(r, c) ? ROAD : GROUND)));
  const blank = () => Array.from({ length: size }, () => Array(size).fill(null));
  const context = vm.createContext({
    console,
    TICKS_PER_MONTH: 4,
    ROAD,
    MAP_WIDTH: size,
    MAP_HEIGHT: size,
    mapData,
    heightMap: Array.from({ length: size }, () => Array(size).fill(0)),
    bridgeMap: blank(),
    roadUnderlayMap: blank(),
    isInsideMap: (row, col) => row >= 0 && row < size && col >= 0 && col < size,
    isBridgeDeckTile: () => false,
    getRoadSlopeKey: () => null,
  });
  context.isRoadLikeTile = (row, col) => context.isInsideMap(row, col) && mapData[row][col] === ROAD;
  for (const file of ['game-clock.js', 'traffic-visuals.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  }
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const start = main.indexOf('const CARRIAGEWAY_MAX_BAND_WIDTH');
  const end = main.indexOf('// Determine which road tile to use based on neighbouring roads');
  vm.runInContext(main.slice(start, end), context, { filename: 'main.js#carriageway' });
  return context;
}

// Array.from: results come from the vm realm, and deepStrictEqual compares prototypes.
const neighbours = (context, row, col) => Array.from(vm.runInContext(`getTrafficRoadNeighbours(${row}, ${col})`, context),
  (tile) => `${tile.row},${tile.col}`).sort();
const incoming = (context, row, col) => Array.from(vm.runInContext(`getTrafficRoadIncomingNeighbours(${row}, ${col})`, context),
  (tile) => `${tile.row},${tile.col}`).sort();

test('a 2-wide N-S road is one-way per lane: left (west) lane up, right (east) lane down, no lane hopping', () => {
  // cols 5,6 rows 2..12 — both ends are the plain bitmask's corners, joining the lanes.
  const context = createRoadContext(16, (r, c) => (c === 5 || c === 6) && r >= 2 && r <= 12);
  assert.deepEqual(neighbours(context, 7, 5), ['6,5'], 'west lane only continues north');
  assert.deepEqual(neighbours(context, 7, 6), ['8,6'], 'east lane only continues south');
  assert.deepEqual(incoming(context, 7, 5), ['8,5'], 'west lane is only entered from the south');
  assert.deepEqual(incoming(context, 7, 6), ['6,6'], 'east lane is only entered from the north');
});

test('the ends of a widened road stay free, and turn traffic round into the opposite lane', () => {
  const context = createRoadContext(16, (r, c) => (c === 5 || c === 6) && r >= 2 && r <= 12);
  // North end corners (not band tiles): arriving northbound on the west lane, the only
  // way on is across to the east corner, then down the southbound lane.
  assert.deepEqual(neighbours(context, 2, 5), ['2,6'], 'cannot drive back down the northbound lane');
  assert.deepEqual(neighbours(context, 2, 6), ['2,5', '3,6'], 'the east corner feeds the southbound lane');
  // South end mirrors it.
  assert.deepEqual(neighbours(context, 12, 6), ['12,5'], 'cannot drive back up the southbound lane');
  assert.deepEqual(neighbours(context, 12, 5), ['11,5', '12,6']);
});

test('a 2-wide E-W road: north lane eastbound, south lane westbound', () => {
  const context = createRoadContext(16, (r, c) => (r === 5 || r === 6) && c >= 2 && c <= 12);
  assert.deepEqual(neighbours(context, 5, 7), ['5,8'], 'north lane only continues east');
  assert.deepEqual(neighbours(context, 6, 7), ['6,6'], 'south lane only continues west');
});

test('single-lane roads and junctions keep two-way traffic in every direction', () => {
  const single = createRoadContext(12, (r, c) => c === 5 && r >= 1 && r <= 10);
  assert.deepEqual(neighbours(single, 5, 5), ['4,5', '6,5']);
  const cross = createRoadContext(12, (r, c) => (r === 5 && c >= 1 && c <= 10) || (c === 5 && r >= 1 && r <= 10));
  assert.deepEqual(neighbours(cross, 5, 5), ['4,5', '5,4', '5,6', '6,5']);
});

test('where a 1-lane road widens to 2, the old lane carries on north and southbound traffic merges back in', () => {
  // col 5 rows 1..12, plus col 6 rows 5..12 — the 1->2 transition is at row 5.
  const context = createRoadContext(16, (r, c) => (c === 5 && r >= 1 && r <= 12) || (c === 6 && r >= 5 && r <= 12));
  assert.deepEqual(neighbours(context, 7, 5), ['6,5'], 'widened section: west lane northbound');
  assert.deepEqual(neighbours(context, 7, 6), ['8,6'], 'widened section: east lane southbound');
  // The transition tile itself is a junction: it can go on up the single lane, or
  // across into the southbound lane; the single lane above it is two-way again.
  assert.deepEqual(neighbours(context, 5, 5), ['4,5', '5,6']);
  assert.deepEqual(neighbours(context, 3, 5), ['2,5', '4,5']);
});

test('a moving car on a lane that just became one-way the other way is recognised as disconnected', () => {
  const context = createRoadContext(16, (r, c) => (c === 5 || c === 6) && r >= 2 && r <= 12);
  assert.equal(vm.runInContext('runtimeTrafficTilesConnect({ row: 7, col: 5 }, { row: 6, col: 5 })', context), true);
  assert.equal(vm.runInContext('runtimeTrafficTilesConnect({ row: 7, col: 5 }, { row: 8, col: 5 })', context), false);
  assert.equal(vm.runInContext('runtimeTrafficTilesConnect({ row: 7, col: 5 }, { row: 7, col: 6 })', context), false);
});

test('both lanes of a one-way widened tile carry traffic, on either side of the centre line', () => {
  const context = createRoadContext(16, (r, c) => (c === 5 || c === 6) && r >= 2 && r <= 12);
  Object.assign(context, {
    isoToScreen: (col, row) => ({ x: (col - row) * 50, y: (col + row) * 25 }),
    BUILDING_SURFACE_Y_OFFSET: 0,
    TILE_HEIGHT: 50,
  });
  const point = (row, col, dr, dc, lane) => {
    const p = vm.runInContext(`getTrafficLanePoint({ offsetX: 0, offsetY: 0 }, { row: ${row}, col: ${col} }, ${dr}, ${dc}, '${lane}')`, context);
    return { x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 };
  };
  const centre = point(7, 5, 0, 0, 'outer'); // zero delta: no offset, the tile centre
  const outer = point(7, 5, -1, 0, 'outer');
  const inner = point(7, 5, -1, 0, 'inner');
  assert.notDeepEqual(outer, inner, 'the two lanes are different positions');
  // Calibrated per direction, so not exact mirror images - but always either side of the centre.
  const dot = (outer.x - centre.x) * (inner.x - centre.x) + (outer.y - centre.y) * (inner.y - centre.y);
  assert.ok(dot < 0, 'the two lanes sit on opposite sides of the tile centre');
  // Not a band tile (single lane above the road's end corners are junction tiles): inner is ignored.
  assert.deepEqual(point(2, 5, 0, 1, 'inner'), point(2, 5, 0, 1, 'outer'));
  // Moving against the tile's direction (never happens, but must not flip lanes): ignored.
  assert.deepEqual(point(7, 5, 1, 0, 'inner'), point(7, 5, 1, 0, 'outer'));
});

test('cars in different lanes of the same one-way tile do not queue behind each other', () => {
  const context = createRoadContext(16, (r, c) => (c === 5 || c === 6) && r >= 2 && r <= 12);
  const separate = (a, b, row, col) => vm.runInContext(
    `trafficVehiclesInSeparateBandLanes({ bandLane: '${a}' }, { bandLane: '${b}' }, { row: ${row}, col: ${col} })`,
    context,
  );
  assert.equal(separate('outer', 'inner', 7, 5), true);
  assert.equal(separate('inner', 'inner', 7, 5), false);
  assert.equal(separate('outer', 'inner', 2, 5), false, 'lanes merge at the junction tile');
});

test('a bus plans its way back separately instead of reversing up a one-way lane', () => {
  const mapSize = 12;
  const busStopMap = Array.from({ length: mapSize }, () => Array(mapSize).fill(null));
  busStopMap[5][2] = ['w', 'e'];
  busStopMap[5][9] = ['w', 'e'];
  // Row 5 cols 1..10 eastbound only, row 6 cols 1..10 westbound only, joined two-way at
  // both ends — the shape of a 2-wide E-W road with its end corners.
  const roadCells = new Set();
  for (let col = 1; col <= 10; col++) { roadCells.add(`5:${col}`); roadCells.add(`6:${col}`); }
  const oneWay = (row, col) => {
    const out = [];
    const add = (r, c) => { if (roadCells.has(`${r}:${c}`)) out.push({ row: r, col: c }); };
    if (col === 1 || col === 10) { add(row - 1, col); add(row + 1, col); }
    if (row === 5) add(row, col + 1);
    if (row === 6) add(row, col - 1);
    return out;
  };
  const context = vm.createContext({
    console,
    COST_BUS_STOP: 20,
    city: { population: 3000, budget: 5000, year: 1900, month: 1, day: 1, tick: 0, commercialCount: 1, weather: { typhoonStage: 'none' } },
    busStopMap,
    buildingData: {
      '2:1': { type: 'bus_depot', footprintRows: 3, footprintCols: 3, busDepotRawSide: 's' },
      '4:2': { type: 'residential', population: 3000, footprintRows: 1, footprintCols: 1 },
      '4:9': { type: 'commercial', level: 3, footprintRows: 3, footprintCols: 3 },
    },
    trafficMap: Array.from({ length: mapSize }, () => Array(mapSize).fill(0)),
    getBusStopSides: (row, col) => busStopMap[row]?.[col] ?? null,
    getBusStopEligibleSides: () => ['w', 'e'],
    setBusStopSides: (row, col, sides) => { busStopMap[row][col] = Array.from(sides); },
    getBuildingJobCapacity: (record) => (record.type === 'commercial' ? 1000 : 0),
    getTrafficRoadNeighbours: oneWay,
    isInsideMap: (row, col) => row >= 0 && row < mapSize && col >= 0 && col < mapSize,
    isRoadTile: (row, col) => roadCells.has(`${row}:${col}`),
    t: (key) => key,
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'traffic-demand.js'), 'utf8'), context, { filename: 'traffic-demand.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'transport-expansion.js'), 'utf8'), context, { filename: 'transport-expansion.js' });
  vm.runInContext(`
    setExpansionEnabled('transport', true, { notify: false, autosave: false });
    const stopIds = listTransportStopSites().map((stop) => stop.id);
    ensureTransportStopPairs(stopIds, null);
    var route = createTransportRoute({ stopIds, fare: 35 });
    ensureTransportRouteRuntime();
    var runtime = transportRuntime.routeRuntime.get(route.id);
  `, context);
  const cycle = context.runtime.roundTripPath;
  assert.ok(Array.isArray(cycle) && cycle.length > 0, 'route has a round trip');
  const steps = cycle.map((tile, i) => [tile, cycle[(i + 1) % cycle.length]]);
  for (const [from, to] of steps) {
    const legal = oneWay(from.row, from.col).some((tile) => tile.row === to.row && tile.col === to.col);
    assert.ok(legal, `every step of the loop is a legal move (${from.row},${from.col} -> ${to.row},${to.col})`);
  }
  assert.ok(cycle.some((tile) => tile.row === 6), 'the way back runs along the westbound lane');
  const stopIndices = vm.runInContext('getTransportRouteCycleStopPathIndices(route, runtime)', context);
  assert.equal(stopIndices.length, 2, 'both stops are found on the cycle in order');
});
