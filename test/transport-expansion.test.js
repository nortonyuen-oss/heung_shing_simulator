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

test('old cities default to a disabled schema-v2 state with no routes or vehicles', () => {
  const oldCity = transport.normalizeTransportExpansionState(undefined);
  assert.equal(oldCity.schemaVersion, 2);
  assert.equal(oldCity.enabled, false);
  assert.equal(oldCity.unlocked, false);
  assert.deepEqual(oldCity.routes, []);
  assert.deepEqual(oldCity.vehicles, []);
  assert.equal(oldCity.company.cash, 0);
});

test('v1 saves migrate to schema v2: route bus counts become grandfathered vehicles, startup credit becomes company cash', () => {
  const history = Array.from({ length: 30 }, (_, index) => ({
    year: 1900 + Math.floor(index / 12),
    month: index % 12 + 1,
    passengers: index,
  }));
  const restored = transport.normalizeTransportExpansionState({
    enabled: true,
    unlocked: true,
    lastSettledMonthIndex: 0,
    startupCreditRemaining: 1500,
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
  assert.equal(restored.schemaVersion, 2);
  assert.equal(restored.lastSettledMonthIndex, 0);
  // raw fare 9 is below the new TRANSPORT_FARE_MIN (15) and clamps up to it.
  assert.equal(restored.routes[0].fare, 15);
  assert.equal(restored.routes[0].vehicleClassId, 'future-electric-bus');
  assert.equal(restored.routes[0].servicePlan.vehicleClassId, 'future-electric-bus');
  assert.equal(restored.routes[0].history.length, 24);
  assert.equal(restored.routes[0].buses, undefined);

  // 99 buses clamps to TRANSPORT_ROUTE_BUS_MAX (8), each grandfathered in for free.
  assert.equal(restored.vehicles.length, 8);
  for (const vehicle of restored.vehicles) {
    assert.equal(vehicle.routeId, 'route-1');
    assert.equal(vehicle.classId, 'future-electric-bus');
    assert.equal(vehicle.purchasePrice, 0);
  }
  assert.equal(restored.nextVehicleId, 9);
  assert.equal(restored.company.cash, 1500);
});

test('route metrics use the planned frequency, fare, capacity and operating formulas', () => {
  const balanced = transport.computeTransportRouteMetrics({
    potentialPassengers: 540,
    outboundTiles: 7,
    stopCount: 2,
    effectiveBuses: 2,
    fare: 35,
    averageTraffic: 0,
    weatherAvailability: 1,
  });
  assert.equal(balanced.roundTripMinutes, 16.5);
  assert.equal(balanced.headwayMinutes, 8.25);
  assert.equal(balanced.waitMinutes, 4.125);
  assert.equal(balanced.monthlyPassengers, 540);
  assert.equal(balanced.revenue, 18900);
  assert.equal(balanced.cost, 2136);
  assert.equal(balanced.net, 16764);

  const doubleDeckerCap = transport.TRANSPORT_VEHICLE_CLASSES.standard_double_decker.monthlyRidershipCap;
  const capped = transport.computeTransportRouteMetrics({
    potentialPassengers: 100000,
    outboundTiles: 1,
    stopCount: 2,
    effectiveBuses: 2,
    fare: 15,
    averageTraffic: 0,
    weatherAvailability: 1,
  });
  assert.equal(capped.monthlyPassengers, 2 * doubleDeckerCap);

  const expressCap = transport.TRANSPORT_VEHICLE_CLASSES.express_single_deck.monthlyRidershipCap;
  const cappedExpress = transport.computeTransportRouteMetrics({
    potentialPassengers: 100000,
    outboundTiles: 1,
    stopCount: 2,
    effectiveBuses: 2,
    fare: 15,
    classId: 'express_single_deck',
    averageTraffic: 0,
    weatherAvailability: 1,
  });
  assert.equal(cappedExpress.monthlyPassengers, 2 * expressCap);
  assert.ok(expressCap < doubleDeckerCap);

  assert.ok(transport.getTransportFareDemandFactor(15) > transport.getTransportFareDemandFactor(60));
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
      name: 'Cross-town', color: '#e53935', fare: 35,
      stopIds: listTransportStopSites().map((stop) => stop.id),
    });
    depotId = getConnectedCommissionedTransportDepots()[0].id;
    vehicleA = buyTransportVehicle(depotId, 'standard_double_decker');
    vehicleB = buyTransportVehicle(depotId, 'standard_double_decker');
    cashAfterPurchase = getTransportExpansionState().company.cash;
    assignTransportVehicleToRoute(vehicleA.id, createdRoute.id);
    assignTransportVehicleToRoute(vehicleB.id, createdRoute.id);
    updateTransportSimulation();
    activeResult = {
      unlocked: getTransportExpansionState().unlocked,
      cash: getTransportExpansionState().company.cash,
      depotCapacity: getTransportFleetCapacity(),
      status: getTransportRouteRuntime(createdRoute.id).status,
      assignedVehicles: getTransportRouteVehicles(createdRoute.id).length,
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
    cashAfterFirstSettlement = getTransportExpansionState().company.cash;
    repeatedSettlement = settleTransportMonth();
    cashAfterRepeatedSettlement = getTransportExpansionState().company.cash;

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
      vehiclesPreserved: getTransportExpansionState().vehicles.length,
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
      vehicleCount: getTransportExpansionState().vehicles.length,
      fare: getTransportExpansionState().routes[0].fare,
      savedHasNoPath: Object.hasOwn(savedExpansion.transport.routes[0], 'path'),
    };
  `, context);

  const active = JSON.parse(JSON.stringify(context.activeResult));
  assert.equal(active.unlocked, true);
  assert.equal(active.cash, transport.TRANSPORT_STARTUP_CAPITAL - 2 * 2800000);
  assert.equal(context.cashAfterPurchase, active.cash);
  assert.equal(active.depotCapacity, transport.TRANSPORT_DEPOT_CAPACITY);
  assert.equal(active.status, 'active');
  assert.equal(active.assignedVehicles, 2);
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
  assert.equal(context.cashAfterFirstSettlement, context.cashAfterRepeatedSettlement);
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
  assert.equal(disabled.vehiclesPreserved, 2);
  assert.equal(disabled.relief, 0);
  assert.equal(disabled.happiness, 0);
  assert.equal(disabled.commercial, 0);
  assert.equal(disabled.land, 0);
  assert.deepEqual(disabled.finance, {
    revenue: 0,
    routeOperations: 0,
    depotUpkeep: 0,
    cost: 0,
    net: 0,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(context.roundTripResult)), {
    enabled: true,
    routeName: 'Cross-town',
    vehicleCount: 2,
    fare: 35,
    savedHasNoPath: false,
  });
});

test('one-click platform pairing still costs $20, drawn from company.cash', () => {
  const context = createTransportVm();
  context.busStopMap[5][9] = ['w'];
  vm.runInContext(`
    setExpansionEnabled('transport', true, { notify: false, autosave: false });
    stopIds = listTransportStopSites().map((stop) => stop.id);
    pairingCost = getTransportStopPairingCost(stopIds);
    cashBeforePairing = getTransportExpansionState().company.cash;
    paired = ensureTransportStopPairs(stopIds, null);
    cashAfterPairing = getTransportExpansionState().company.cash;
  `, context);
  assert.equal(context.pairingCost, 20);
  assert.equal(context.paired, true);
  assert.deepEqual(context.busStopMap[5][9], ['w', 'e']);
  assert.equal(context.cashBeforePairing - context.cashAfterPairing, 20);
});

test('depot capacity rejects a 13th vehicle at the same depot', () => {
  const context = createTransportVm();
  vm.runInContext(`
    setExpansionEnabled('transport', true, { notify: false, autosave: false });
    stopIds = listTransportStopSites().map((stop) => stop.id);
    ensureTransportStopPairs(stopIds, null);
    createTransportRoute({ stopIds, fare: 35 });
    depotId = getConnectedCommissionedTransportDepots()[0].id;
    getTransportExpansionState().company.cash = 1000000000;
    bought = [];
    for (let i = 0; i < 12; i++) {
      bought.push(buyTransportVehicle(depotId, 'standard_double_decker'));
    }
    depotVehicleCount = getTransportDepotVehicleCount(depotId);
    overflowError = '';
    try {
      buyTransportVehicle(depotId, 'standard_double_decker');
    } catch (error) {
      overflowError = error.code;
    }
  `, context);
  assert.equal(context.bought.length, 12);
  assert.equal(context.depotVehicleCount, 12);
  assert.equal(context.overflowError, 'depotFull');
});

test('buying a vehicle debits company.cash and rejects insufficient funds', () => {
  const context = createTransportVm();
  vm.runInContext(`
    setExpansionEnabled('transport', true, { notify: false, autosave: false });
    stopIds = listTransportStopSites().map((stop) => stop.id);
    ensureTransportStopPairs(stopIds, null);
    createTransportRoute({ stopIds, fare: 35 });
    depotId = getConnectedCommissionedTransportDepots()[0].id;
    cashBefore = getTransportExpansionState().company.cash;
    vehicle = buyTransportVehicle(depotId, 'standard_double_decker');
    cashAfter = getTransportExpansionState().company.cash;
    getTransportExpansionState().company.cash = 100;
    brokeError = '';
    try {
      buyTransportVehicle(depotId, 'standard_double_decker');
    } catch (error) {
      brokeError = error.code;
    }
    invalidClassError = '';
    try {
      buyTransportVehicle(depotId, 'flying_saucer');
    } catch (error) {
      invalidClassError = error.code;
    }
  `, context);
  assert.equal(context.vehicle.status, 'depot');
  assert.equal(context.vehicle.purchasePrice, 2800000);
  assert.equal(context.cashBefore - context.cashAfter, 2800000);
  assert.equal(context.brokeError, 'insufficientFunds');
  assert.equal(context.invalidClassError, 'invalidClass');
});

test('selling a vehicle out on a route requires it to return to depot first', () => {
  const context = createTransportVm();
  vm.runInContext(`
    setExpansionEnabled('transport', true, { notify: false, autosave: false });
    stopIds = listTransportStopSites().map((stop) => stop.id);
    ensureTransportStopPairs(stopIds, null);
    route = createTransportRoute({ stopIds, fare: 35 });
    depotId = getConnectedCommissionedTransportDepots()[0].id;
    vehicle = buyTransportVehicle(depotId, 'standard_double_decker');
    assignTransportVehicleToRoute(vehicle.id, route.id);
    cashBeforeSell = getTransportExpansionState().company.cash;
    firstSellAttempt = sellTransportVehicle(vehicle.id);
    statusAfterFirstAttempt = getTransportExpansionState().vehicles[0].status;
    advanceTransportVehiclesDaily();
    statusAfterOneDay = getTransportExpansionState().vehicles[0].status;
    conditionBeforeSell = getTransportExpansionState().vehicles[0].condition;
    secondSellAttempt = sellTransportVehicle(vehicle.id);
    cashAfterSell = getTransportExpansionState().company.cash;
    vehiclesRemaining = getTransportExpansionState().vehicles.length;
  `, context);
  assert.equal(context.firstSellAttempt, false);
  assert.equal(context.statusAfterFirstAttempt, 'delivering_to_depot');
  assert.equal(context.statusAfterOneDay, 'depot');
  assert.equal(context.secondSellAttempt, true);
  assert.equal(context.vehiclesRemaining, 0);
  // resale = purchasePrice * condition (decayed by the one day spent
  // returning to depot) * TRANSPORT_VEHICLE_RESALE_FACTOR
  assert.equal(
    context.cashAfterSell - context.cashBeforeSell,
    Math.round(2800000 * context.conditionBeforeSell * transport.TRANSPORT_VEHICLE_RESALE_FACTOR),
  );
});

test('mandatory periodic service recalls, services and resumes a vehicle', () => {
  const context = createTransportVm();
  context.TRANSPORT_SERVICE_INTERVAL_DAYS = transport.TRANSPORT_SERVICE_INTERVAL_DAYS;
  context.TRANSPORT_SERVICE_DURATION_DAYS = transport.TRANSPORT_SERVICE_DURATION_DAYS;
  vm.runInContext(`
    setExpansionEnabled('transport', true, { notify: false, autosave: false });
    stopIds = listTransportStopSites().map((stop) => stop.id);
    ensureTransportStopPairs(stopIds, null);
    route = createTransportRoute({ stopIds, fare: 35 });
    depotId = getConnectedCommissionedTransportDepots()[0].id;
    vehicle = buyTransportVehicle(depotId, 'standard_double_decker');
    assignTransportVehicleToRoute(vehicle.id, route.id);
    const stored = () => getTransportExpansionState().vehicles.find((entry) => entry.id === vehicle.id);
    stored().daysSinceService = TRANSPORT_SERVICE_INTERVAL_DAYS;
    stored().condition = 0.4;
    advanceTransportVehiclesDaily();
    statusAfterOverdueDay = stored().status;
    advanceTransportVehiclesDaily();
    statusAfterReturnDay = stored().status;
    serviceDaysRemainingAtStart = stored().serviceDaysRemaining;
    for (let i = 0; i < TRANSPORT_SERVICE_DURATION_DAYS - 1; i++) advanceTransportVehiclesDaily();
    statusMidService = stored().status;
    advanceTransportVehiclesDaily();
    statusAfterService = stored().status;
    conditionAfterService = stored().condition;
    daysSinceServiceAfterService = stored().daysSinceService;
  `, context);
  assert.equal(context.statusAfterOverdueDay, 'returning_for_service');
  assert.equal(context.statusAfterReturnDay, 'servicing');
  assert.equal(context.serviceDaysRemainingAtStart, transport.TRANSPORT_SERVICE_DURATION_DAYS);
  assert.equal(context.statusMidService, 'servicing');
  assert.equal(context.statusAfterService, 'active');
  assert.equal(context.conditionAfterService, 1);
  assert.equal(context.daysSinceServiceAfterService, 0);
});

test('a route past TRANSPORT_MAX_ROUTES is rejected, editing/deleting existing routes is not', () => {
  const context = createTransportVm();
  context.TRANSPORT_MAX_ROUTES = transport.TRANSPORT_MAX_ROUTES;
  vm.runInContext(`
    setExpansionEnabled('transport', true, { notify: false, autosave: false });
    stopIds = listTransportStopSites().map((stop) => stop.id);
    ensureTransportStopPairs(stopIds, null);
    createdRoutes = [];
    for (let i = 0; i < TRANSPORT_MAX_ROUTES; i++) {
      createdRoutes.push(createTransportRoute({ stopIds, fare: 35 }));
    }
    limitError = '';
    try {
      createTransportRoute({ stopIds, fare: 35 });
    } catch (error) {
      limitError = error.code;
    }
    routeCountAtLimit = getTransportExpansionState().routes.length;
    updated = updateTransportRoute(createdRoutes[0].id, { fare: 60 });
    deleteTransportRoute(createdRoutes[0].id);
    routeCountAfterDelete = getTransportExpansionState().routes.length;
    recreated = createTransportRoute({ stopIds, fare: 35 });
  `, context);
  assert.equal(context.createdRoutes.length, transport.TRANSPORT_MAX_ROUTES);
  assert.equal(context.limitError, 'routeLimit');
  assert.equal(context.routeCountAtLimit, transport.TRANSPORT_MAX_ROUTES);
  assert.equal(context.updated.fare, 60);
  assert.equal(context.routeCountAfterDelete, transport.TRANSPORT_MAX_ROUTES - 1);
  assert.ok(context.recreated.id);
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
