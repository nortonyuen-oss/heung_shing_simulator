const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
function setup({ company = true } = {}) {
  const grid = value => Array.from({ length: 20 }, () => Array(20).fill(value));
  const c = vm.createContext({ console, Math, Date });
  const load = file => vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), c, { filename: file });
  load('constants.js'); load('map-utils.js');
  Object.assign(c, {
    GROUND: 1, ROAD: 2, DIRT: 3, BEACH: 4, WATER: 5, HILL: 6,
    city: { budget: 5000, population: 3000, year: 1900, month: 1, tick: 0, weather: { typhoonStage: 'none' } },
    mapData: grid(1), zoneMap: grid(0), zoneDensityMap: grid(1), busStopMap: grid(null), buildingData: {},
    scene: { buildingSprites: new Map(), treeSprites: new Map(), debrisSprites: new Map() },
    isTerrainCreatorMode: false, baseRoadKey: 'road_straight_h', mapRotation: 0,
    isInsideMap: (r, col) => r >= 0 && col >= 0 && r < 20 && col < 20,
    getBaseTileKey: (r, col) => c.mapData[r]?.[col] === 2 ? c.baseRoadKey : 'grass',
    getTileHeight: () => 0, isSlopeTile: () => false, isBridgeTile: () => false,
    isRoadTile: (r, col) => c.mapData[r]?.[col] === 2,
    isUnderseaTunnelTile: () => false, hasDistrictSignAt: () => false,
    t: key => key, showToast: () => {}, updateHUD: () => {},
    saves: 0, queueCityChangeAutosave: () => { c.saves++; },
    refreshTransportUi: () => {}, busDepotModelMetadata: {},
    rotateDirection: (side, steps) => ['n', 'e', 's', 'w'][(['n', 'e', 's', 'w'].indexOf(side) + steps % 4 + 4) % 4],
    getBuildingJobCapacity: record => record.type === 'commercial' ? 1000 : 0,
  });
  c.activeScene = c.scene;
  for (let col = 1; col < 19; col++) c.mapData[10][col] = c.ROAD;
  load('building-placement.js'); load('bus-stops.js'); load('tools.js'); load('transport-expansion.js');
  c.refreshBusStopSpriteAt = () => {};
  c.placeSpriteBuilding = (scene, row, col) => {
    const sprite = { mapRow: row, mapCol: col };
    for (let r = row; r < row + 3; r++) for (let cc = col; cc < col + 3; cc++) scene.buildingSprites.set(`${r}:${cc}`, sprite);
  };
  c.applyBusDepotVisualKey = (_scene, id, record, key) => { record.spriteKey = key; };
  // Real rotation helpers, using the same view-independent raw sides as the game.
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const from = main.indexOf('function getBusDepotVisualCorner(rawSide) {');
  const to = main.indexOf('// Shared by both refresh triggers:', from);
  vm.runInContext(main.slice(from, to), c);
  load('tool-actions.js'); load('build-session.js');
  c.setExpansionEnabled('transport', company, { notify: false, autosave: false });
  c.saves = 0;
  return c;
}
function session(c, tool, tile, options = {}) {
  const s = c.createBuildSession({ preview: draft => c.previewTouchToolAction(c.scene, draft), commit: (draft, plan) => c.commitTouchToolAction(c.scene, draft, plan) });
  s.begin(tool, { ...c.getTouchToolOptions(tool), ...options }, 1); s.select(tile);
  return s;
}
function confirm(s) { const draft = s.getState(); return s.confirm(draft.id, draft.owner); }
function snapshot(c) { return JSON.stringify({ city: c.city, map: c.mapData, stops: c.busStopMap, buildings: c.buildingData, expansion: c.getExpansionSaveState(), saves: c.saves }); }

test('bus previews are read-only and quote the actual company account even when the city has no money', () => {
  const c = setup(); c.city.budget = 0;
  const before = snapshot(c);
  const stop = session(c, 'bus-stop', { row: 10, col: 4 });
  const depot = session(c, 'bus-depot', { row: 7, col: 4 }, { depotSide: 's' });
  assert.equal(stop.getState().plan.ok, true); assert.equal(stop.getState().plan.cost, 40);
  assert.equal(depot.getState().plan.ok, true); assert.equal(depot.getState().plan.cost, 4000);
  assert.equal(depot.getState().plan.connected, true);
  assert.equal(stop.getState().plan.funding.payer, 'company');
  assert.equal(snapshot(c), before);
});

test('confirm spends only company funds, applies the selected shoulders once, and rejects duplicate confirmation', () => {
  const c = setup(); c.city.budget = 0;
  const s = session(c, 'bus-stop', { row: 10, col: 4 }, { stopSide: 'second' });
  const draft = s.getState();
  assert.equal(confirm(s).cost, 20);
  assert.deepEqual(plain(c.getBusStopSides(10, 4)), ['e']);
  assert.equal(c.getTransportExpansionState().company.cash, 5980); assert.equal(c.city.budget, 0);
  assert.equal(s.confirm(draft.id, draft.owner).reason, 'stale');
  assert.equal(c.getTransportExpansionState().company.cash, 5980);
});

test('city funds are used before the expansion, with no fallback from an empty company account', () => {
  const base = setup({ company: false });
  const s = session(base, 'bus-stop', { row: 10, col: 4 });
  assert.equal(s.getState().plan.funding.payer, 'city'); confirm(s); assert.equal(base.city.budget, 4960);
  const managed = setup(); managed.getTransportExpansionState().company.cash = 0;
  const blocked = session(managed, 'bus-depot', { row: 7, col: 4 });
  assert.equal(blocked.getState().plan.ok, false); assert.equal(confirm(blocked).reason, 'mobile.companyFundsLow');
  assert.equal(managed.city.budget, 5000); assert.equal(Object.keys(managed.buildingData).length, 0);
});

test('a changed funding source needs review before confirmation can spend city money', () => {
  const c = setup(), s = session(c, 'bus-stop', { row: 10, col: 4 });
  c.setExpansionEnabled('transport', false, { notify: false, autosave: false });
  assert.equal(confirm(s).reason, 'changed'); assert.equal(c.city.budget, 5000); assert.equal(c.getBusStopSides(10, 4), null);
  assert.equal(confirm(s).ok, true); assert.equal(c.city.budget, 4960);
  assert.equal(c.getTransportExpansionState().company.cash, 6000);
});

test('insufficient live funds or a changed road cannot be committed', () => {
  const c = setup(), s = session(c, 'bus-stop', { row: 10, col: 4 });
  c.getTransportExpansionState().company.cash = 39;
  assert.equal(confirm(s).reason, 'mobile.companyFundsLow'); assert.equal(c.getBusStopSides(10, 4), null);
  c.getTransportExpansionState().company.cash = 100;
  c.baseRoadKey = 'road_corner_ne';
  assert.equal(confirm(s).reason, 'toast.busStopBlocked'); assert.equal(c.getBusStopSides(10, 4), null);
});

test('explicit sides are idempotent and the desktop four-step cycle retains its original prices', () => {
  const c = setup({ company: false });
  const states = [['w'], ['e'], ['w', 'e'], []], costs = [20, 0, 20, 0];
  states.forEach((expected, index) => {
    const before = c.city.budget; assert.equal(c.placeBusStop(c.scene, 10, 4), true);
    assert.deepEqual(plain(c.getBusStopSides(10, 4) || []), expected); assert.equal(before - c.city.budget, costs[index]);
  });
  const s = session(c, 'bus-stop', { row: 10, col: 4 }); confirm(s);
  const noop = session(c, 'bus-stop', { row: 10, col: 4 });
  assert.equal(noop.getState().plan.noop, true); assert.equal(noop.getState().plan.ok, false);
});

test('depot direction and footprint are explicit, and rotating an existing depot never buys another', () => {
  const c = setup();
  const s = session(c, 'bus-depot', { row: 7, col: 4 }, { depotSide: 's' });
  assert.equal(s.getState().plan.tiles.length, 9); assert.equal(confirm(s).cost, 4000);
  const record = c.buildingData['7:4'];
  assert.equal(record.busDepotRawSide, 's');
  const rotate = session(c, 'bus-depot', { row: 8, col: 5 }, { depotSide: 'n' });
  assert.equal(rotate.getState().plan.rotating, true); assert.equal(rotate.getState().plan.cost, 0);
  assert.equal(rotate.getState().plan.connected, false); assert.equal(confirm(rotate).cost, 0);
  assert.equal(c.buildingData['7:4'], record); assert.equal(record.busDepotRawSide, 'n');
  assert.equal(Object.keys(c.buildingData).length, 1); assert.equal(c.getTransportExpansionState().company.cash, 2000);
});

test('frontage changes require review and an unconnected depot does not become operational', () => {
  const c = setup(), s = session(c, 'bus-depot', { row: 7, col: 4 }, { depotSide: 's' });
  for (let col = 4; col < 7; col++) c.mapData[10][col] = c.GROUND;
  assert.equal(confirm(s).reason, 'changed'); assert.equal(c.getTransportExpansionState().company.cash, 6000);
  assert.equal(s.getState().plan.connected, false); assert.equal(confirm(s).ok, true);
  assert.equal(c.listTransportDepots({ connectedOnly: true }).length, 0);
  assert.throws(() => c.buyTransportVehicle('7:4', 'standard_double_decker'), { code: 'needsDepot' });
});

test('occupied footprints, map edges and cancelled drafts never place or spend', () => {
  const c = setup(); c.mapData[8][5] = c.WATER;
  const blocked = session(c, 'bus-depot', { row: 7, col: 4 });
  assert.equal(blocked.getState().plan.ok, false); assert.equal(confirm(blocked).ok, false);
  const edge = session(c, 'bus-depot', { row: 19, col: 19 }); assert.equal(edge.getState().plan.ok, false);
  const stop = session(c, 'bus-stop', { row: 10, col: 4 }); stop.cancel();
  assert.equal(c.getBusStopSides(10, 4), null); assert.equal(c.getTransportExpansionState().company.cash, 6000);
  assert.equal(Object.keys(c.buildingData).length, 0);
});

test('free shoulder changes and depot rotations remain available when the company is in debt', () => {
  const c = setup();
  c.placeBusStop(c.scene, 10, 4, { sides: ['w'] });
  confirm(session(c, 'bus-depot', { row: 7, col: 4 }, { depotSide: 's' }));
  c.getTransportExpansionState().company.cash = -10;
  const stop = session(c, 'bus-stop', { row: 10, col: 4 }, { stopSide: 'second' });
  assert.equal(stop.getState().plan.cost, 0); assert.equal(confirm(stop).ok, true);
  const rotate = session(c, 'bus-depot', { row: 7, col: 4 }, { depotSide: 'n' });
  assert.equal(confirm(rotate).ok, true); assert.equal(c.getTransportExpansionState().company.cash, -10);
});

test('depot reorientation quotes fleet impact and rechecks changed route assignments', () => {
  const c = setup(); confirm(session(c, 'bus-depot', { row: 7, col: 4 }, { depotSide: 's' }));
  const state = c.getTransportExpansionState();
  state.vehicles.push({ id: 'bus-1', depotId: '7:4', routeId: 'route-1' });
  const rotate = session(c, 'bus-depot', { row: 7, col: 4 }, { depotSide: 'n' });
  assert.equal(rotate.getState().plan.vehicleCount, 1); assert.equal(rotate.getState().plan.routeCount, 1);
  state.vehicles[0].routeId = 'route-2';
  assert.equal(confirm(rotate).reason, 'changed'); assert.equal(c.buildingData['7:4'].busDepotRawSide, 's');
});
