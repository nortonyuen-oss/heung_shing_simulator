'use strict';

// 區外交通 phase 1 (docs/region-transit-design.md): the districts a line can run to off each side
// of the map, and bus routes that end at a 區外站 - the leg off the map, its riders and fares, the
// region flows they join, and what a save keeps.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// ── the districts off each side, on the real Hong Kong maps ──────────────────────────────────

function loadGeography(cityState = {}) {
  const source = `
    const MAP_WIDTH = 256, MAP_HEIGHT = 256;
    const city = cityState;
    const t = (key) => key;
    ${read('hk-district-maps.js')}
    ${read('hk-terrain-tiles.js')}
    ${read('hk-district-info.js')}
    ${read('region-connections.js')}
    return { computeRegionDestinations, getRegionDestinations, getRegionTransitLegTiles, getRegionDestinationName };
  `;
  return new Function('cityState', 'document', source)(cityState, undefined);
}

test('each side offers the districts that way, nearest first, never 維港兩岸', () => {
  const geo = loadGeography();
  const tuenMun = geo.computeRegionDestinations({ districtId: 'tuen-mun' });
  assert.equal(tuenMun.e[0].id, 'yuen-long', '屯門 east: 元朗 first');
  assert.equal(tuenMun.n[0].id, 'tin-shui-wai', '屯門 north: 天水圍 first');
  const tsuenWan = geo.computeRegionDestinations({ districtId: 'tsuen-wan' });
  const central = tsuenWan.s.find((entry) => entry.id === 'central-western');
  assert.ok(central, '荃灣 south reaches 中環');
  assert.equal(geo.getRegionTransitLegTiles(central.km), Math.round(central.km * 4));
  assert.ok(Math.abs(geo.getRegionTransitLegTiles(central.km) - 34) <= 4, `荃灣 to 中環 about 34 tiles (${central.km} km)`);
  const aberdeen = geo.computeRegionDestinations({ districtId: 'aberdeen' });
  assert.equal(aberdeen.n[0].id, 'central-western', '南區 north: 中環 (金鐘) first');
  assert.equal(geo.getRegionTransitLegTiles(aberdeen.n[0].km), 12, 'a short leg is 12 tiles at least');
  const lantau = geo.computeRegionDestinations({ districtId: 'lantau' });
  assert.ok(lantau.e.some((entry) => entry.id === 'tsing-yi'), '東涌 east reaches 青衣');
  const far = lantau.e.find((entry) => entry.id === 'central-western');
  assert.equal(geo.getRegionTransitLegTiles(far.km), 60, 'a long leg is 60 tiles at most');
  Object.values({ ...tuenMun, ...tsuenWan, ...aberdeen, ...lantau }).flat()
    .forEach((entry) => assert.notEqual(entry.id, 'victoria-harbour'));
  [tuenMun, tsuenWan, aberdeen, lantau].forEach((sides) => Object.values(sides).forEach((list) => {
    assert.ok(list.length <= 6);
    list.slice(1).forEach((entry, index) => assert.ok(entry.km >= list[index].km, 'nearest first'));
  }));
});

test('a city keeps its destinations; a district map works them out; elsewhere a 鄰區 on each side', () => {
  const district = loadGeography({ districtProfileId: 'tuen-mun' });
  assert.equal(district.getRegionDestinations().e[0].id, 'yuen-long');
  const plain = loadGeography({});
  Object.values(plain.getRegionDestinations()).forEach((list) => assert.deepEqual(list, [{ id: 'generic', km: 0 }]));
  assert.equal(plain.getRegionDestinationName('central-western', 'zhHant'), '中環');
  assert.equal(plain.getRegionDestinationName('yuen-long', 'zhHant'), '元朗');
  assert.equal(plain.getRegionDestinationName('lantau', 'en'), 'Tung Chung');
});

test('founding stores the destinations, a save keeps them, a new city clears them', () => {
  assert.match(read('landing-screen.js'), /city\.regionDestinations = typeof computeRegionDestinations === 'function'\s*\?\s*computeRegionDestinations\(\{ districtId: city\.districtProfileId, features: terrain\?\.features \}\)/);
  assert.match(read('save.js'), /city\.regionDestinations = savedCityState\.regionDestinations/);
  assert.match(read('city-state.js'), /regionDestinations: null,/);
  assert.match(read('city-state.js'), /city\.regionDestinations = null;/);
});

// ── a bus route to a 區外站 ─────────────────────────────────────────────────────────────────
// A 12x12 world: one road along row 5 from the west edge (5,0) to (5,10), stops at (5,2) and
// (5,9), a depot; the west exit leads to 中環, 8.6 km off (34 tiles).

function createOffMapVm({ shares = null } = {}) {
  const mapSize = 12;
  const roadCells = new Set(Array.from({ length: 11 }, (_, index) => `5:${index}`));
  const context = vm.createContext({
    console,
    COST_BUS_STOP: 20,
    MAP_WIDTH: mapSize,
    MAP_HEIGHT: mapSize,
    roadTileCount: roadCells.size,
    city: {
      population: 3000, budget: 5000, year: 1900, month: 1, day: 1, tick: 0, commercialCount: 1,
      weather: { typhoonStage: 'none' },
      regionDestinations: { n: [], e: [], s: [], w: [{ id: 'central-western', km: 8.6 }] },
      regionNeighbours: { n: null, e: null, s: null, w: 'central-western' },
    },
    buildingData: {
      '2:1': { type: 'bus_depot', footprintRows: 3, footprintCols: 3, busDepotRawSide: 's' },
      '4:2': { type: 'residential', population: 3000, footprintRows: 1, footprintCols: 1 },
      '4:9': { type: 'commercial', level: 3, footprintRows: 3, footprintCols: 3 },
    },
    trafficMap: Array.from({ length: mapSize }, () => Array(mapSize).fill(0)),
    getBusStopEligibleSides: () => ['w', 'e'],
    getBuildingJobCapacity: (record) => (record.type === 'commercial' ? 1000 : 0),
    getTrafficRoadNeighbours: (row, col) => [[-1, 0], [0, 1], [1, 0], [0, -1]]
      .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
      .filter((tile) => roadCells.has(`${tile.row}:${tile.col}`)),
    isInsideMap: (row, col) => row >= 0 && row < mapSize && col >= 0 && col < mapSize,
    isRoadTile: (row, col) => roadCells.has(`${row}:${col}`),
    getRoadEdgeExitSide: (row, col) => (row === 5 && col === 0 ? 'w' : null),
    t: (key, params = {}) => `${key}${JSON.stringify(params)}`,
  });
  vm.runInContext("busStopMap = new Map([['5:2', ['w', 'e']], ['5:9', ['w', 'e']]]);", context);
  const busStopMap = context.busStopMap;
  context.getBusStopSides = (row, col) => busStopMap.get(`${row}:${col}`) ?? null;
  context.setBusStopSides = (row, col, sides) => {
    if (sides.length) busStopMap.set(`${row}:${col}`, Array.from(sides)); else busStopMap.delete(`${row}:${col}`);
  };
  vm.runInContext(read('traffic-demand.js'), context, { filename: 'traffic-demand.js' });
  vm.runInContext(read('transport-expansion.js'), context, { filename: 'transport-expansion.js' });
  vm.runInContext(read('region-connections.js'), context, { filename: 'region-connections.js' });
  if (shares) context.getRegionTransitRiderShares = () => shares;
  vm.runInContext(`
    setExpansionEnabled('transport', true, { notify: false, autosave: false });
    var [westStop, eastStop] = listTransportStopSites().map((stop) => stop.id);
    ensureTransportStopPairs([westStop, eastStop], null);
    var centralStop = getOrCreateTransportOffMapStop({ row: 5, col: 0, side: 'w', destination: 'central-western' });
    var depotId = commissionAllConnectedTransportDepots()[0].id;
  `, context);
  return context;
}

const run = (context, code) => vm.runInContext(code, context);

test('a 區外站 stands on the exit, is no bus stop on the map, and is shared per exit and district', () => {
  const context = createOffMapVm();
  assert.deepEqual({ ...run(context, 'centralStop.offMap') }, { side: 'w', destination: 'central-western' });
  assert.equal(run(context, 'isTransportStopPresent(centralStop)'), true);
  assert.equal(run(context, 'getTransportStopAt(5, 0)'), null, 'not a stop to click on the map');
  assert.equal(run(context, 'listTransportStopSites().some((stop) => stop.offMap)'), false);
  assert.equal(run(context, "getOrCreateTransportOffMapStop({ row: 5, col: 0, side: 'w', destination: 'central-western' }).id === centralStop.id"), true);
  assert.notEqual(run(context, "getOrCreateTransportOffMapStop({ row: 5, col: 0, side: 'w', destination: 'tsing-yi' }).id"), run(context, 'centralStop.id'));
  assert.equal(run(context, 'getTransportOffMapLegTiles(centralStop)'), 34);
  assert.equal(run(context, 'getTransportStopDisplayName(centralStop)'), 'transport.offMap.stopName{"place":"Central"}');
  // pairing the shelters skips it
  assert.equal(run(context, 'getTransportStopPairingCost([centralStop.id])'), 0);
  // the road cut: the exit is gone, so is the stop
  run(context, 'getRoadEdgeExitSide = () => null; regionConnectionCache = { key: "", connections: [] };');
  assert.equal(run(context, 'isTransportStopPresent(centralStop)'), false);
});

test('a route may end at one 區外站, first or last - never in the middle, never two', () => {
  const context = createOffMapVm();
  const route = run(context, 'createTransportRoute({ stopIds: [eastStop, westStop, centralStop.id], fare: 35 })');
  assert.ok(route.id);
  const runtime = run(context, `getTransportRouteRuntime('${route.id}')`);
  assert.deepEqual({ ...runtime.path.at(-1) }, { row: 5, col: 0 }, 'the bus drives out to the edge');
  assert.equal(run(context, `getTransportRouteCycleStopPathIndices(getTransportExpansionState().routes[0], getTransportRouteRuntime('${route.id}')).length`), 4);
  assert.ok(run(context, 'createTransportRoute({ stopIds: [centralStop.id, westStop, eastStop], fare: 35 }).id'), 'first is fine too');
  const code = (stops) => run(context, `(() => { try { createTransportRoute({ stopIds: ${stops}, fare: 35 }); return 'ok'; } catch (error) { return error.code; } })()`);
  assert.equal(code('[westStop, centralStop.id, eastStop]'), 'offMapEnds');
  run(context, "var tsingYiStop = getOrCreateTransportOffMapStop({ row: 5, col: 0, side: 'w', destination: 'tsing-yi' });");
  assert.equal(code('[centralStop.id, eastStop, tsingYiStop.id]'), 'offMapOne');
  // unused 區外站 go when routes are saved or deleted
  run(context, 'pruneTransportOffMapStops()');
  assert.equal(run(context, 'getTransportExpansionState().stops.some((stop) => stop.id === tsingYiStop.id)'), false);
  assert.equal(run(context, 'getTransportExpansionState().stops.some((stop) => stop.id === centralStop.id)'), true);
  run(context, 'getTransportExpansionState().routes.map((r) => r.id).forEach(deleteTransportRoute)');
  assert.equal(run(context, 'getTransportExpansionState().stops.some((stop) => stop.offMap)'), false);
});

test('riders at a 區外站: a share of the trips along the route get off there; residents come back; outsiders come in', () => {
  const context = createOffMapVm({ shares: { out: 0.3, in: 0.2 } });
  run(context, 'createTransportRoute({ stopIds: [eastStop, westStop, centralStop.id], fare: 35 })');
  const units = run(context, `(() => {
    const draw = (id) => getTransportStopAlightingDraw(getTransportStopById(id));
    const along = getTransportStopCatchmentUnits(getTransportStopById(westStop));
    const along2 = getTransportStopCatchmentUnits(getTransportStopById(eastStop));
    const off = getTransportStopCatchmentUnits(centralStop);
    return { share: draw(centralStop.id) / (draw(centralStop.id) + draw(westStop) + draw(eastStop)),
      off, origin: along.originUnits + along2.originUnits, jobs: along.destinationUnits + along2.destinationUnits };
  })()`);
  assert.ok(Math.abs(units.share - 0.3) < 1e-9, `getting off there: ${units.share}`);
  assert.ok(Math.abs(units.off.returnUnits - units.origin * 0.3) < 1e-9, 'residents coming home');
  assert.ok(Math.abs(units.off.originUnits - units.jobs * 0.18 * 0.2) < 1e-9, 'outsiders riding in to the jobs');
  assert.ok(run(context, 'getTransportStopDailyRiders(centralStop)') > 0);
});

test('a bus spends the leg off the map out of sight, and fares and riders count it', () => {
  const context = createOffMapVm({ shares: { out: 0.3, in: 0.2 } });
  run(context, `
    var route = createTransportRoute({ stopIds: [eastStop, westStop, centralStop.id], fare: 35 });
    var bought = buyTransportVehicle(depotId, 'standard_double_decker');
    assignTransportVehicleToRoute(bought.id, route.id);
    var bus = getTransportExpansionState().vehicles.find((entry) => entry.id === bought.id);
    bus.status = 'active';
  `);
  assert.equal(run(context, 'getTransportRouteFareDistanceCap(route)'), 9 + 34, 'the fare reaches 中環 too');
  // drive the bus up to the 區外站 at the west edge, with riders aboard and waiting there
  run(context, `
    bus.orderIndex = 1; bus.progress = 0; bus.dwellMinutesRemaining = 0;
    bus.passengersAboard = 20; bus.passengerDistanceTiles = 20 * 2;
    centralStop.waitingPassengers = 12;
    var before = bus.odometerTiles || 0;
    advanceTransportVehiclesByDisplayMinutes(2 * 0.75 + 0.01);
  `);
  const atEdge = run(context, '({ order: bus.orderIndex, dwell: bus.dwellMinutesRemaining, odometer: bus.odometerTiles - before, alpha: getTransportVehicleOffMapAlpha(bus), offMap: route.monthToDateOffMapPassengers, aboard: bus.passengersAboard })');
  assert.equal(atEdge.order, 2, 'standing at the 區外站');
  assert.ok(atEdge.dwell > 34 * 2 * 0.75, `the leg out and back: ${atEdge.dwell} min`);
  assert.ok(atEdge.odometer >= 34 * 2, 'the leg counts on the clock');
  assert.equal(atEdge.alpha, 0, 'out of sight off the map');
  assert.ok(atEdge.offMap > 12, `riders off and on there: ${atEdge.offMap}`);
  const fares = run(context, 'route.monthToDatePassengerTiles / Math.max(1, route.monthToDatePassengers)');
  assert.ok(fares > 34, `the riders who got off paid for the leg (${fares} tiles each)`);
  // back on the map: fading in over two tiles, then fully seen
  run(context, 'advanceTransportVehiclesByDisplayMinutes(bus.dwellMinutesRemaining + 0.75)');
  const back = run(context, 'getTransportVehicleOffMapAlpha(bus)');
  assert.ok(back > 0 && back < 1, `fading back in: ${back}`);
  run(context, 'advanceTransportVehiclesByDisplayMinutes(3 * 0.75)');
  assert.equal(run(context, 'getTransportVehicleOffMapAlpha(bus)'), 1);
});

test('the month keeps the riders at the 區外站, the region flows take them off the edge roads, a save keeps it all', () => {
  const context = createOffMapVm();
  run(context, `
    var route = createTransportRoute({ stopIds: [eastStop, westStop, centralStop.id], fare: 35 });
    var bought = buyTransportVehicle(depotId, 'standard_double_decker');
    assignTransportVehicleToRoute(bought.id, route.id);
    route.monthToDatePassengers = 900; route.monthToDateOffMapPassengers = 600;
    city.month = 2;
    settleTransportMonth();
  `);
  assert.equal(run(context, 'route.history.at(-1).offMapPassengers'), 600);
  assert.equal(run(context, 'route.monthToDateOffMapPassengers'), 0);
  const summary = run(context, 'getTransportOffMapSummary()');
  assert.equal(summary.lines, 1);
  assert.equal(summary.riders, 600);
  assert.equal(summary.capacity, run(context, 'getTransportRouteRuntime(route.id).effectiveBuses') * 4200);
  assert.deepEqual({ ...summary.byDestination }, { 'central-western': 600 });
  // 3,000 jobs short (6,000 workers): out-commuting beyond the one-lane road's 1,200 rides the
  // line - 100 riders a month are 370 commuters - and the edge road carries less
  run(context, 'route.history.at(-1).offMapPassengers = 100');
  const flows = run(context, 'computeRegionFlows({ labourForce: 6000, jobs: 3000, industrialCount: 0 })');
  const roadOnly = run(context, 'var lineSummary = getTransportOffMapSummary; getTransportOffMapSummary = () => null; computeRegionFlows({ labourForce: 6000, jobs: 3000, industrialCount: 0 })');
  run(context, 'getTransportOffMapSummary = lineSummary');
  assert.equal(flows.transit.lines, 1);
  assert.equal(flows.transit.carried, 370, 'a rider a month stands for 3.7 commuters');
  assert.equal(flows.capacity, 1200 + 370, 'the line adds what it carried, not what its buses could');
  assert.equal(roadOnly.capacity, 1200);
  assert.equal(flows.out, 1200 + 370);
  assert.equal(flows.utilisation, 1, 'the road still full');
  assert.ok(Math.abs(flows.transitShare - 370 / 1570) < 1e-9);
  assert.equal(roadOnly.transitShare, 0);
  // with fewer commuters than the line carries, the road is spared
  const light = run(context, 'computeRegionFlows({ labourForce: 3500, jobs: 3000, industrialCount: 0 })');
  assert.equal(light.out, 300);
  assert.equal(light.transit.carried, 300);
  assert.equal(light.utilisation, 0, 'all of them by the line');
  assert.equal(light.transitShare, 1);
  // a save round trip
  const saved = run(context, 'JSON.stringify(getExpansionSaveState())');
  run(context, `restoreExpansionState(JSON.parse(${JSON.stringify(saved)}))`);
  const stop = run(context, 'getTransportExpansionState().stops.find((entry) => entry.offMap)');
  assert.deepEqual({ ...stop.offMap }, { side: 'w', destination: 'central-western' });
  assert.equal(run(context, 'getTransportExpansionState().routes[0].history.at(-1).offMapPassengers'), 100);
});

test('the route editor adds the 區外站 at an exit, keeps it last, and picks the district', () => {
  const ui = read('transport-ui.js');
  assert.match(ui, /if \(handleTransportOffMapStopClick\(row, col\)\) return true;/);
  assert.match(ui, /if \(last\?\.offMap && stopIds\.length > 0\) stopIds\.splice\(stopIds\.length - 1, 0, stop\.id\);/);
  assert.match(ui, /data-transport-offmap-index="\$\{index\}"/);
  assert.match(ui, /pruneTransportOffMapStops\(\)/);
  const visuals = read('transport-visuals.js');
  assert.match(visuals, /getTransportVehicleOffMapAlpha\(backing, vehicle\.route, vehicle\.runtime\)/);
  const i18n = read('i18n.js');
  ['transport.offMap.stopName', 'transport.offMap.destination', 'transport.offMap.leg', 'transport.toast.offMapAdded',
    'transport.error.offMapOne', 'transport.error.offMapEnds', 'transport.metric.offMap',
    'region.transit.title', 'region.transit.line', 'region.transit.carried', 'region.transit.mode.bus'].forEach((key) => {
    assert.equal(i18n.split(`'${key}':`).length - 1, 3, `${key} in three languages`);
  });
});

// ── phase 2: ferry routes to a district off the map ──────────────────────────────────────────

const ferry = require('../ferry.js');

test('a ferry route off the map: out over the water to the edge, the leg off the map out of sight, back', () => {
  const { FERRY, findFerryPath, ferryOffMapLegs, ferryVesselPointAt, ferryCycleMinutes, ferryArrivalsAt, getFerryOffMapAlpha } = ferry;
  // a pier on the north shore (rows 0-1 land), open sea to the south edge (row 9)
  const H = 10; const W = 10;
  const water = (r, c) => r >= 2 && r < H && c >= 0 && c < W;
  const pier = { row: 1, col: 4, land: 'n' };
  const goalTiles = Array.from({ length: W }, (_, c) => [H - 1, c]).filter(([, c]) => Math.abs(c - 5) <= 6);
  const path = findFerryPath(pier, { goalTiles }, water, H, W);
  assert.ok(path, 'a way out to the edge');
  assert.equal(path.at(-1)[0], H - 1, 'it ends on the edge');
  const legs = ferryOffMapLegs(pier, path, 's', 34);
  assert.deepEqual(legs.out.points.at(-1), [H - 1 + 1.5, path.at(-1)[1]], 'out past the edge, out of sight');
  assert.deepEqual(legs.back.points[0], legs.out.points.at(-1));
  assert.equal(legs.offMapMinutes, (2 * 34) / FERRY.speedTilesPerMinute, 'out and back off the map');
  const dwell = FERRY.dwellMinutes;
  const outT = legs.out.total / FERRY.speedTilesPerMinute;
  assert.equal(ferryCycleMinutes(legs), 2 * dwell + (legs.out.total + legs.back.total) / FERRY.speedTilesPerMinute + legs.offMapMinutes);
  assert.equal(ferryVesselPointAt(legs, 1, 0).state, 'alongside');
  assert.equal(ferryVesselPointAt(legs, dwell + 1, 0).state, 'sailing');
  const away = ferryVesselPointAt(legs, dwell + outT + 10, 0);
  assert.equal(away.state, 'offMap', 'off the map for the leg out there');
  assert.equal(away.pier, 1);
  assert.equal(ferryVesselPointAt(legs, dwell + outT + dwell + legs.offMapMinutes + 1, 0).state, 'sailing', 'back again');
  // it reaches the far end half way through its time off the map
  const arrivals = ferryArrivalsAt(legs, 0, ferryCycleMinutes(legs) - 0.01, [0]);
  assert.deepEqual(arrivals.map((a) => a.pier), [1]);
  assert.ok(Math.abs(arrivals[0].t - (dwell + outT + legs.offMapMinutes / 2)) < 1e-9);
  // fading over the last two tiles before the edge
  assert.equal(getFerryOffMapAlpha({ r: 5, c: 5 }, 's', H, W), 1);
  assert.equal(getFerryOffMapAlpha({ r: H - 1.5, c: 5 }, 's', H, W), 0.5);
  assert.equal(getFerryOffMapAlpha({ r: H + 1, c: 5 }, 's', H, W), 0);
});

test('a save keeps a ferry route off the map with its one pier; a route of one pier without it goes', () => {
  const state = ferry.normalizeFerryState({
    piers: [{ id: 'p1', row: 1, col: 4, land: 'n' }],
    routes: [
      { id: 'r1', pierIds: ['p1'], offMap: { side: 's', destination: 'central-western', row: 9, col: 5, waiting: 12.5 } },
      { id: 'r2', pierIds: ['p1'] },
      { id: 'r3', pierIds: ['p1'], offMap: { side: 'x', destination: 'central-western', row: 9, col: 5 } },
    ],
    vessels: [],
  });
  assert.deepEqual(state.routes.map((r) => r.id), ['r1']);
  assert.deepEqual({ ...state.routes[0].offMap }, { side: 's', destination: 'central-western', row: 9, col: 5, waiting: 12.5, stormBacklog: 0 });
  assert.deepEqual([...state.routes[0].pierIds], ['p1']);
});

function loadFerryOffMapWorld() {
  const context = vm.createContext({ console, severe: false });
  vm.runInContext(read('ferry.js'), context, { filename: 'ferry.js' });
  vm.runInContext(`
    function isTransportSevereWeather() { return severe; }
    var company = { cash: 0, cashFraction: 0 };
    function getTransportExpansionState() { return { company }; }
    function getRegionDestination(side, id) { return { id, km: 8.6 }; }
    function getRegionTransitLegTiles(km) { return Math.max(12, Math.min(60, Math.round(km * 4))); }
    var testLegs = ferryOffMapLegs({ row: 1, col: 4, land: 'n' }, [[3, 4], [9, 4]], 's', 34);
    getFerryRouteLegs = () => testLegs;
    var world = {
      routes: [{ id: 'r1', status: 'active', pierIds: ['p0'], offMap: { side: 's', destination: 'central-western', row: 9, col: 4, waiting: 50, stormBacklog: 0 } }],
      piers: [{ id: 'p0', waiting: 40 }],
      vessels: [{ id: 'f1', routeId: 'r1', phase: 0, status: 'active', aboard: 0, condition: 1, minutesSinceService: 0, tilesThisMonth: 0, monthToDateRevenue: 0 }],
    };
  `, context);
  return context;
}

test('a ferry off the map lands its riders at the far end, boards those waiting there, and charges for the longer crossing', () => {
  const c = loadFerryOffMapWorld();
  const ev = (code) => vm.runInContext(code, c);
  assert.equal(ev('getFerryRouteFareFactor(world.routes[0])'), 1 + 34 / 20);
  // sky 09:00 onwards (env 180): two round trips, so both ends land what they boarded
  ev('berthFerries(world, 180, 180 + 2 * ferryCycleMinutes(testLegs))');
  const route = ev('world.routes[0]');
  assert.equal(route.offMap.waiting, 0, 'the far end\'s queue boarded');
  assert.equal(route.monthToDatePassengers, 40 + 50, 'the pier\'s riders off at the far end, and the far end\'s back at the pier');
  assert.ok(Math.abs(route.monthToDateRevenue - 90 * ev('FERRY.fare') * 2.7) < 1e-9, 'at the longer crossing\'s fare');
});

// the whole of it in the game's modules: a pier on a sea that runs off the south edge
function createFerryOffMapVm() {
  const H = 12; const W = 12;
  const context = vm.createContext({
    console, MAP_WIDTH: W, MAP_HEIGHT: H, roadTileCount: 0,
    WATER: 5, GROUND: 1, BEACH: 4, DIRT: 3, ROAD: 2,
    city: {
      population: 3000, budget: 5000, year: 1900, month: 1, day: 1, tick: 0,
      weather: { typhoonStage: 'none' },
      regionDestinations: { n: [], e: [], s: [{ id: 'central-western', km: 8.6 }], w: [] },
    },
    buildingData: {
      '3:4': { type: 'residential', population: 2000, footprintRows: 1, footprintCols: 1 },
      '4:6': { type: 'commercial', level: 3, footprintRows: 1, footprintCols: 1 },
    },
    getBuildingJobCapacity: (record) => (record.type === 'commercial' ? 500 : 0),
    isInsideMap: (row, col) => row >= 0 && row < H && col >= 0 && col < W,
    isRoadTile: () => false,
    getRoadEdgeExitSide: () => null,
    t: (key, params = {}) => `${key}${JSON.stringify(params)}`,
  });
  vm.runInContext(`var mapData = Array.from({ length: ${H} }, (_, r) => Array.from({ length: ${W} }, () => (r >= 6 ? 5 : 1)));`, context);
  vm.runInContext(read('traffic-demand.js'), context, { filename: 'traffic-demand.js' });
  vm.runInContext(read('transport-expansion.js'), context, { filename: 'transport-expansion.js' });
  vm.runInContext(read('region-connections.js'), context, { filename: 'region-connections.js' });
  vm.runInContext(read('ferry.js'), context, { filename: 'ferry.js' });
  vm.runInContext(`
    setExpansionEnabled('transport', true, { notify: false, autosave: false });
    var ferryState = getFerryState();
    ferryState.piers.push({ id: 'pier-1', row: 5, col: 4, land: 'n', name: '荃灣碼頭', waiting: 0, stormBacklog: 0 });
  `, context);
  return context;
}

test('in the game: a pier, then the sea at the map edge, opens a route off the map - riders queue at both ends', () => {
  const context = createFerryOffMapVm();
  const ev = (code) => vm.runInContext(code, context);
  assert.equal(ev('JSON.stringify(getFerrySeaExitNear(10, 5))'), JSON.stringify({ side: 's', row: 11, col: 5, distance: 1 }));
  assert.equal(ev('getFerrySeaExitNear(5, 5)'), null, 'not near an edge');
  const opened = ev('openFerryOffMapRoute(ferryState.piers[0], getFerrySeaExitNear(10, 5))');
  assert.equal(opened.ok, true);
  assert.deepEqual({ side: opened.route.offMap.side, destination: opened.route.offMap.destination }, { side: 's', destination: 'central-western' });
  assert.equal(ev('openFerryOffMapRoute(ferryState.piers[0], getFerrySeaExitNear(10, 5)).code'), 'exists');
  assert.equal(ev('getFerryRouteEndName(ferryState.routes[0], 1)'), 'transport.offMap.stopName{"place":"Central"}');
  const legs = ev('getFerryRouteLegs(ferryState.routes[0])');
  assert.ok(legs && legs.offMapMinutes === 2 * 34, 'a way out to the south edge, 34 tiles to 中環');
  // an hour of the morning: riders at the pier, and outsiders at the far end
  ev('accrueFerryPiersForHour(ferryState, 2)');
  assert.ok(ev('ferryState.piers[0].waiting') > 0);
  assert.ok(ev('ferryState.routes[0].offMap.waiting') > 0, 'outsiders coming in');
  // the month: riders off the map for the region flows
  ev(`ferryState.routes[0].history = [{ year: 1900, month: 1, passengers: 500 }]; ferryState.vessels.push(normalizeFerryVessel({ id: 'ferry-1', routeId: ferryState.routes[0].id }, new Set([ferryState.routes[0].id])));`);
  const summary = ev('getFerryOffMapSummary()');
  assert.equal(summary.lines, 1);
  assert.equal(summary.riders, 500);
  assert.deepEqual({ ...summary.byDestination }, { 'central-western': 500 });
  assert.ok(summary.capacity > 0);
  const transit = ev('getRegionTransitSummary()');
  assert.equal(transit.byModeDestination['ferry:central-western'], 500);
  assert.ok(ev('setFerryRouteOffMapDestination(ferryState.routes[0].id, "tsing-yi")'));
  assert.equal(ev('ferryState.routes[0].offMap.destination'), 'tsing-yi');
});

test('the ferry windows name the far end and pick its district', () => {
  const ui = read('ferry-ui.js');
  assert.match(ui, /data-ferry-offmap-route="\$\{ferryUiEscape\(route\.id\)\}"/);
  assert.match(ui, /point\.state === 'offMap' \? getFerryRouteEndName\(route, 1, state\)/);
  assert.match(read('transport-ui.js'), /handleFerryUiChange\(event\)\) return refreshTransportUi\(\);/);
  assert.match(read('transit-trackers.js'), /point\.state === 'offMap'/);
  const i18n = read('i18n.js');
  ['ferry.route.offMapOpened', 'ferry.route.offMapExists', 'ferry.route.noWaterOut', 'region.transit.mode.ferry'].forEach((key) => {
    assert.equal(i18n.split(`'${key}':`).length - 1, 3, `${key} in three languages`);
  });
});
