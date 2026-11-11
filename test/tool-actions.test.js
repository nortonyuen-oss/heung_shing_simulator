const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const plain = (value) => JSON.parse(JSON.stringify(value));

function setup() {
  const grid = (value) => Array.from({ length: 12 }, () => Array(12).fill(value));
  const c = vm.createContext({ console, Math });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'constants.js'), 'utf8'), c);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'map-utils.js'), 'utf8'), c);
  Object.assign(c, {
    GROUND: 1, ROAD: 2, DIRT: 3, BEACH: 4, WATER: 5, HILL: 6,
    city: { budget: 100000, population: 100000 }, buildingData: {}, mapData: grid(1),
    zoneMap: grid(0), zoneDensityMap: grid(1), lowDensityLockSet: new Set(),
    scene: { buildingSprites: new Map(), treeSprites: new Map(), debrisSprites: new Map() },
    isTerrainCreatorMode: false, densityCap: 3,
    isInsideMap: (r, col) => r >= 0 && r < 12 && col >= 0 && col < 12,
    getTileHeight: () => 0, getDistrictMaxZoneDensity: () => c.densityCap,
    getDistrictZoningCost: (amount) => Math.round(amount * 1.3),
    canPlaceBuilding: (r, col) => c.mapData[r][col] === 1,
    canPlaceBuildingFootprint: (r, col, cols, rows) => r >= 0 && col >= 0 && r + rows <= 12 && col + cols <= 12 && !c.occupied,
    t: (key) => key, showToast: () => {}, hasBuildingType: () => false,
    getSpecialBuildingUnlockState: () => ({ unlocked: true }),
    describeSpecialBuildingLockReason: () => 'locked', isPolicyActive: () => true,
    getBusStopSides: () => null, hasDistrictSignAt: () => false, isBridgeTile: () => false,
    getTyphoonShelterState: () => ({ shelters: [] }), findTyphoonShelterFloatingRestaurantAt: () => null,
    getFerryPierAt: () => null, getFerryState: () => ({ routes: [] }), isPromenadeTile: () => false,
    getUnderseaTunnelTile: () => null, getMetroStationAt: () => null,
    getMetroTrackBits: () => ({}), getTramState: () => ({ tracks: {} }), getTramStopAt: () => null,
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'tools.js'), 'utf8'), c);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'tool-actions.js'), 'utf8'), c);
  return c;
}
function preview(c, tool, start, end = start, options = {}) {
  return c.previewTouchToolAction(c.scene, { tool, start, end, options });
}

test('Phase B covers exactly the approved 32 buildings and six other tools; legacy house stays desktop-only', () => {
  const c = setup();
  assert.equal(vm.runInContext('Object.keys(TOUCH_BUILDING_TYPES).length', c), 32);
  assert.equal(vm.runInContext('TOUCH_PHASE_B_TOOLS.length', c), 38);
  assert.equal(vm.runInContext("TOUCH_PHASE_B_TOOLS.includes('house')", c), false);
});

test('zoning quote accounts for density, district land prices, unchanged zones and permanent low-density locks without writing', () => {
  const c = setup();
  c.zoneMap[2][2] = 1; c.zoneDensityMap[2][2] = 3;
  c.lowDensityLockSet.add('2:3');
  c.mapData[3][3] = c.ROAD;
  const before = JSON.stringify([c.city, c.mapData, c.zoneMap, c.zoneDensityMap]);
  const plan = preview(c, 'zone-res', { row: 2, col: 2 }, { row: 3, col: 3 }, { density: 3 });
  assert.deepEqual(plain(plan.tiles), [{ row: 3, col: 2 }]);
  assert.equal(plan.cost, 163, '50 × 2.5 density × 1.3 district, rounded per tile');
  assert.equal(plan.skipped, 3);
  assert.equal(JSON.stringify([c.city, c.mapData, c.zoneMap, c.zoneDensityMap]), before);
  c.densityCap = 1;
  const capped = preview(c, 'zone-res', { row: 5, col: 5 }, { row: 5, col: 5 }, { density: 3 });
  assert.equal(capped.cost, 65);
  assert.equal(capped.density, 1);
});

test('building previews use a fixed model and recheck occupation and available funds', () => {
  const c = setup();
  const options = c.getTouchToolOptions('fire-station');
  const before = JSON.stringify([c.city, c.buildingData]);
  const first = preview(c, 'fire-station', { row: 3, col: 3 }, undefined, options);
  const second = preview(c, 'fire-station', { row: 3, col: 3 }, undefined, options);
  assert.equal(first.ok, true);
  assert.equal(first.signature, second.signature);
  assert.equal(first.cost, 1000);
  assert.equal(JSON.stringify([c.city, c.buildingData]), before);
  c.occupied = true;
  assert.equal(preview(c, 'fire-station', { row: 3, col: 3 }, undefined, options).ok, false);
  c.occupied = false; c.city.budget = 999;
  assert.equal(preview(c, 'fire-station', { row: 3, col: 3 }, undefined, options).ok, false);
});

test('demolition of a multi-tile pier is one operation with its linked route count and no writes', () => {
  const c = setup(), pier = { id: 'pier-a', row: 2, col: 2, name: 'Pier A' };
  c.getFerryPierAt = (r, col) => r === 2 && [2, 3].includes(col) ? pier : null;
  c.getFerryState = () => ({ routes: [{ id: 'route-1', pierIds: ['pier-a', 'pier-b'] }] });
  const before = JSON.stringify(c.city);
  const plan = preview(c, 'bulldoze', { row: 2, col: 2 }, { row: 2, col: 3 }, { range: true });
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.summary.facilities, 1);
  assert.equal(plan.summary.routes, 1);
  assert.equal(JSON.stringify(c.city), before);
  c.getFerryState = () => ({ routes: [] });
  assert.notEqual(preview(c, 'bulldoze', { row: 2, col: 2 }, { row: 2, col: 3 }, { range: true }).signature, plan.signature);
});

test('railway demolition and invalid map coordinates cannot be confirmed by the Phase B adapter', () => {
  const c = setup();
  c.getMetroTrackBits = () => ({ '2:2': 1 });
  assert.equal(preview(c, 'bulldoze', { row: 2, col: 2 }, undefined, {}).ok, false);
  assert.equal(preview(c, 'bulldoze', { row: -1, col: 2 }, undefined, {}).ok, false);
});

test('replacing a demolition target with an identical model still invalidates the approved signature', () => {
  const c = setup();
  c.buildingData['2:2'] = { type: 'fire_station', spriteKey: 'fire_station', footprintCols: 2, footprintRows: 2 };
  const first = preview(c, 'bulldoze', { row: 2, col: 2 }, undefined, {});
  c.buildingData['2:2'] = { ...c.buildingData['2:2'] };
  const next = preview(c, 'bulldoze', { row: 2, col: 2 }, undefined, {});
  assert.notEqual(first.signature, next.signature, 'a different building is a different demolition approval');
});
