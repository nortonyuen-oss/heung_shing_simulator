const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const transport = require('../transport-expansion.js');
const trafficVisuals = require('../traffic-visuals.js');

function countTurns(route) {
  let turns = 0;
  let previousDirection = '';
  for (let index = 1; index < route.length; index++) {
    const direction = `${route[index].row - route[index - 1].row}:${route[index].col - route[index - 1].col}`;
    if (previousDirection && direction !== previousDirection) turns++;
    previousDirection = direction;
  }
  return turns;
}

function createTransportVm() {
  const mapSize = 12;
  const busStopMap = Array.from({ length: mapSize }, () => Array(mapSize).fill(null));
  busStopMap[5][2] = ['w', 'e'];
  busStopMap[5][9] = ['w', 'e'];
  const roadCells = new Set(Array.from({ length: 10 }, (_, index) => `5:${index + 1}`));
  const context = vm.createContext({
    console,
    COST_BUS_STOP: 20,
    city: {
      population: 3000,
      budget: 5000,
      year: 1900,
      month: 1,
      day: 1,
      tick: 0,
      commercialCount: 1,
      weather: { typhoonStage: 'none' },
    },
    busStopMap,
    buildingData: {
      '2:1': {
        type: 'bus_depot',
        footprintRows: 3,
        footprintCols: 3,
        busDepotRawSide: 's',
      },
      '4:2': { type: 'residential', population: 3000, footprintRows: 1, footprintCols: 1 },
      '4:9': { type: 'commercial', level: 3, footprintRows: 3, footprintCols: 3 },
    },
    trafficMap: Array.from({ length: mapSize }, () => Array(mapSize).fill(0)),
    getBusStopSides: (row, col) => busStopMap[row]?.[col] ?? null,
    getBusStopEligibleSides: () => ['w', 'e'],
    setBusStopSides: (row, col, sides) => { busStopMap[row][col] = Array.from(sides); },
    getBuildingJobCapacity: (record) => record.type === 'commercial' ? 1000 : 0,
    getTrafficRoadNeighbours: (row, col) => [[-1, 0], [0, 1], [1, 0], [0, -1]]
      .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
      .filter((tile) => roadCells.has(`${tile.row}:${tile.col}`)),
    isInsideMap: (row, col) => row >= 0 && row < mapSize && col >= 0 && col < mapSize,
    isRoadTile: (row, col) => roadCells.has(`${row}:${col}`),
    t: (key) => key,
  });
  const source = fs.readFileSync(path.join(ROOT, 'transport-expansion.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'transport-expansion.js' });
  return context;
}

test('old cities default to a disabled additive schema and retain v2 reservation fields', () => {
  const oldCity = transport.normalizeTransportExpansionState(undefined);
  assert.equal(oldCity.schemaVersion, 1);
  assert.equal(oldCity.enabled, false);
  assert.equal(oldCity.unlocked, false);
  assert.deepEqual(oldCity.routes, []);

  const history = Array.from({ length: 30 }, (_, index) => ({
    year: 1900 + Math.floor(index / 12),
    month: index % 12 + 1,
    passengers: index,
  }));
  const restored = transport.normalizeTransportExpansionState({
    enabled: true,
    unlocked: true,
    lastSettledMonthIndex: 0,
    stops: [{ id: 'central', row: 2, col: 3 }],
    routes: [{
      id: 'route-1',
      name: '1A',
      stopIds: ['central'],
      buses: 99,
      fare: 9,
      servicePlan: { vehicleClassId: 'future-electric-bus' },
      history,
    }],
  });
  assert.equal(restored.lastSettledMonthIndex, 0);
  assert.equal(restored.routes[0].buses, 8);
  assert.equal(restored.routes[0].fare, 5);
  assert.equal(restored.routes[0].vehicleClassId, 'future-electric-bus');
  assert.equal(restored.routes[0].servicePlan.vehicleClassId, 'future-electric-bus');
  assert.equal(restored.routes[0].history.length, 24);
});

test('route metrics use the planned frequency, fare, capacity and operating formulas', () => {
  const balanced = transport.computeTransportRouteMetrics({
    potentialPassengers: 540,
    outboundTiles: 7,
    stopCount: 2,
    effectiveBuses: 2,
    fare: 2.5,
    averageTraffic: 0,
    weatherAvailability: 1,
  });
  assert.equal(balanced.roundTripMinutes, 16.5);
  assert.equal(balanced.headwayMinutes, 8.25);
  assert.equal(balanced.waitMinutes, 4.125);
  assert.equal(balanced.monthlyPassengers, 540);
  assert.equal(balanced.revenue, 270);
  assert.equal(balanced.cost, 262);
  assert.equal(balanced.net, 8);

  const capped = transport.computeTransportRouteMetrics({
    potentialPassengers: 100000,
    outboundTiles: 1,
    stopCount: 2,
    effectiveBuses: 2,
    fare: 1,
    averageTraffic: 0,
    weatherAvailability: 1,
  });
  assert.equal(capped.monthlyPassengers, 2 * transport.TRANSPORT_CAPACITY_PER_BUS_MONTH);
  assert.ok(transport.getTransportFareDemandFactor(1) > transport.getTransportFareDemandFactor(5));
});

test('road routing is shortest-first, then fewest-turns, and scales to 50 full maps', () => {
  const smoother = [
    [0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [1, 4], [0, 4],
  ];
  const zigzag = [
    [0, 0], [0, 1], [1, 1], [1, 2], [0, 2], [0, 3], [1, 3], [1, 4], [0, 4],
  ];
  const edges = new Map();
  const addPath = (points) => points.forEach((point, index) => {
    if (index === 0) return;
    const previous = points[index - 1];
    const left = `${previous[0]}:${previous[1]}`;
    const right = `${point[0]}:${point[1]}`;
    if (!edges.has(left)) edges.set(left, []);
    if (!edges.has(right)) edges.set(right, []);
    edges.get(left).push({ row: point[0], col: point[1] });
    edges.get(right).push({ row: previous[0], col: previous[1] });
  });
  addPath(smoother);
  addPath(zigzag);
  const chosen = transport.findTransportPath(
    { row: 0, col: 0 },
    { row: 0, col: 4 },
    (row, col) => edges.get(`${row}:${col}`) ?? [],
  );
  assert.equal(chosen.length, 9);
  assert.equal(countTurns(chosen), 2);

  let neighbourReads = 0;
  const fullMapNeighbours = (row, col) => {
    neighbourReads++;
    return [[-1, 0], [0, 1], [1, 0], [0, -1]]
      .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
      .filter((tile) => tile.row >= 0 && tile.row < 256 && tile.col >= 0 && tile.col < 256);
  };
  for (let index = 0; index < 50; index++) {
    const route = transport.findTransportPath(
      { row: 0, col: 0 },
      { row: 255, col: 255 },
      fullMapNeighbours,
    );
    assert.equal(route.length, 511);
  }
  assert.ok(neighbourReads < 50000, `expected bounded A* work, got ${neighbourReads} neighbour reads`);
});

test('live expansion unlocks, routes, breaks, settles and restores without affecting disabled cities', () => {
  const context = createTransportVm();
  vm.runInContext(`
    setExpansionEnabled('transport', true, { notify: false, autosave: false });
    createdRoute = createTransportRoute({
      name: 'Cross-town', color: '#e53935', buses: 2, fare: 2.5,
      stopIds: listTransportStopSites().map((stop) => stop.id),
    });
    updateTransportSimulation();
    activeResult = {
      unlocked: getTransportExpansionState().unlocked,
      credit: getTransportExpansionState().startupCreditRemaining,
      depotCapacity: getTransportFleetCapacity(),
      status: getTransportRouteRuntime(createdRoute.id).status,
      passengers: createdRoute.lastStats.monthlyPassengers,
      cost: createdRoute.lastStats.cost,
      relief: getBuildingTransportModeShare('4:2'),
      happiness: getTransportHappinessBonus(),
      commercial: getTransportCommercialDemandBonus(),
      land: getTransportLandValueBonus(5, 2),
    };
    savedExpansion = getExpansionSaveState();

    busStopMap[5][9] = null;
    markTransportStopsDirty();
    updateTransportSimulation();
    brokenResult = {
      status: getTransportRouteRuntime(createdRoute.id).status,
      reason: getTransportRouteRuntime(createdRoute.id).brokenReason,
      routeCost: createdRoute.lastStats.cost,
      finance: settleTransportMonth(),
    };
    creditAfterFirstSettlement = getTransportExpansionState().startupCreditRemaining;
    repeatedSettlement = settleTransportMonth();
    creditAfterRepeatedSettlement = getTransportExpansionState().startupCreditRemaining;

    busStopMap[5][9] = ['w', 'e'];
    markTransportStopsDirty();
    updateTransportSimulation();
    restoredStatus = getTransportRouteRuntime(createdRoute.id).status;

    city.day = 2;
    city.weather.typhoonStage = 'signal8';
    recordTransportDailyAvailability();
    severeResult = {
      weatherDays: getTransportExpansionState().weatherSuspendedDaysThisMonth,
      relief: getBuildingTransportModeShare('4:2'),
      visibleRoutes: getTransportRoutesForVisuals().length,
    };

    city.weather.typhoonStage = 'none';
    setExpansionEnabled('transport', false, { notify: false, autosave: false });
    disabledResult = {
      routesPreserved: getTransportExpansionState().routes.length,
      relief: getBuildingTransportModeShare('4:2'),
      happiness: getTransportHappinessBonus(),
      commercial: getTransportCommercialDemandBonus(),
      land: getTransportLandValueBonus(5, 2),
      finance: getTransportFinancials(),
    };

    restoreExpansionState(savedExpansion);
    roundTripResult = {
      enabled: isExpansionEnabled('transport'),
      routeName: getTransportExpansionState().routes[0].name,
      buses: getTransportExpansionState().routes[0].buses,
      fare: getTransportExpansionState().routes[0].fare,
      savedHasNoPath: Object.hasOwn(savedExpansion.transport.routes[0], 'path'),
    };
  `, context);

  const active = JSON.parse(JSON.stringify(context.activeResult));
  assert.equal(active.unlocked, true);
  assert.equal(active.credit, transport.TRANSPORT_STARTUP_CREDIT);
  assert.equal(active.depotCapacity, transport.TRANSPORT_DEPOT_CAPACITY);
  assert.equal(active.status, 'active');
  assert.ok(active.passengers > 0);
  assert.ok(active.cost > 0);
  assert.ok(active.relief > 0 && active.relief <= transport.TRANSPORT_TRAFFIC_RELIEF_MAX);
  assert.ok(active.happiness > 0 && active.happiness <= transport.TRANSPORT_HAPPINESS_BONUS_MAX);
  assert.ok(active.commercial > 0 && active.commercial <= transport.TRANSPORT_COMMERCIAL_DEMAND_BONUS_MAX);
  assert.ok(active.land > 0 && active.land <= transport.TRANSPORT_LAND_VALUE_BONUS_MAX);

  const broken = JSON.parse(JSON.stringify(context.brokenResult));
  assert.equal(broken.status, 'broken');
  assert.equal(broken.reason, 'missingStop');
  assert.equal(broken.routeCost, 0);
  assert.equal(broken.finance.routeOperations, 0);
  assert.equal(broken.finance.depotUpkeep, transport.TRANSPORT_DEPOT_MONTHLY_UPKEEP);
  assert.equal(context.creditAfterFirstSettlement, context.creditAfterRepeatedSettlement);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.repeatedSettlement)),
    broken.finance,
  );
  assert.equal(context.restoredStatus, 'active');

  assert.deepEqual(JSON.parse(JSON.stringify(context.severeResult)), {
    weatherDays: 1,
    relief: 0,
    visibleRoutes: 0,
  });
  const disabled = JSON.parse(JSON.stringify(context.disabledResult));
  assert.equal(disabled.routesPreserved, 1);
  assert.equal(disabled.relief, 0);
  assert.equal(disabled.happiness, 0);
  assert.equal(disabled.commercial, 0);
  assert.equal(disabled.land, 0);
  assert.deepEqual(disabled.finance, {
    revenue: 0,
    routeOperations: 0,
    depotUpkeep: 0,
    grossCost: 0,
    creditApplied: 0,
    cost: 0,
    net: 0,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(context.roundTripResult)), {
    enabled: true,
    routeName: 'Cross-town',
    buses: 2,
    fare: 2.5,
    savedHasNoPath: false,
  });
});

test('one-click platform pairing costs $20 and depot capacity rejects over-allocation', () => {
  const context = createTransportVm();
  context.busStopMap[5][9] = ['w'];
  vm.runInContext(`
    setExpansionEnabled('transport', true, { notify: false, autosave: false });
    stopIds = listTransportStopSites().map((stop) => stop.id);
    pairingCost = getTransportStopPairingCost(stopIds);
    paired = ensureTransportStopPairs(stopIds, null);
    creditAfterPairing = getTransportExpansionState().startupCreditRemaining;
    firstCapacityRoute = createTransportRoute({ stopIds, buses: 8, fare: 2.5 });
    capacityError = '';
    try {
      createTransportRoute({ stopIds, buses: 5, fare: 2.5 });
    } catch (error) {
      capacityError = error.code;
    }
  `, context);
  assert.equal(context.pairingCost, 20);
  assert.equal(context.paired, true);
  assert.deepEqual(context.busStopMap[5][9], ['w', 'e']);
  assert.equal(context.creditAfterPairing, transport.TRANSPORT_STARTUP_CREDIT - 20);
  assert.equal(context.capacityError, 'fleetCapacity');
});

test('enabling managed transport immediately removes fake ambient buses only', () => {
  const originalGate = global.isTransportExpansionActive;
  global.isTransportExpansionActive = () => true;
  try {
    const destroyed = [];
    const vehicle = (category) => ({
      model: { category },
      sprite: { destroy: () => destroyed.push(category) },
    });
    const state = {
      vehicles: [vehicle('bus'), vehicle('minibus'), vehicle('private')],
      dirty: false,
    };
    trafficVisuals.purgeAmbientBusesForTransportExpansion(state);
    assert.deepEqual(state.vehicles.map((entry) => entry.model.category), ['minibus', 'private']);
    assert.deepEqual(destroyed, ['bus']);
    assert.equal(state.dirty, true);
  } finally {
    if (originalGate === undefined) delete global.isTransportExpansionActive;
    else global.isTransportExpansionActive = originalGate;
  }
});

test('browser wiring keeps simulation state out of the visual frame loop', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const simulation = fs.readFileSync(path.join(ROOT, 'simulation.js'), 'utf8');
  const economy = fs.readFileSync(path.join(ROOT, 'sim-economy.js'), 'utf8');
  const visuals = fs.readFileSync(path.join(ROOT, 'transport-visuals.js'), 'utf8');
  assert.ok(html.indexOf('traffic-visuals.js') < html.indexOf('transport-expansion.js'));
  assert.ok(html.indexOf('transport-expansion.js') < html.indexOf('transport-visuals.js'));
  assert.ok(html.indexOf('transport-visuals.js') < html.indexOf('main.js'));
  assert.match(simulation, /updateTransportSimulation\(\)[\s\S]*updateTrafficMap\(\)/);
  assert.match(economy, /settleTransportMonth\(\)/);
  assert.doesNotMatch(visuals, /Object\.entries\(buildingData\)|for\s*\([^)]*MAP_(?:WIDTH|HEIGHT)/);
});
