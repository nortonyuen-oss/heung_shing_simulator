const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');

// Phase C3: metro/tram track, stations, ferry piers, the undersea tunnel, typhoon-shelter basins,
// terrain and the waterfront promenade, plus the floating restaurant's pre-placement rotate. Each
// already has its own domain test file (metro.test.js, tram.test.js, ferry.test.js, undersea-
// tunnel.test.js, typhoon-shelter.test.js, promenade.test.js, ...); this file is about the touch
// adapter only - previewTouchToolAction/commitTouchToolAction routing the right options to the
// real desktop writer, with the real funding rules (company cash, the metro grant, tram's no-
// city-fallback) and never spending on a read-only preview.
function setup() {
  const grid = (value, n = 60) => Array.from({ length: n }, () => Array(n).fill(value));
  const c = vm.createContext({ console, Math, Date, JSON });
  const load = (file) => vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), c, { filename: file });
  load('constants.js'); load('map-utils.js');
  const noopGfx = () => ({
    clear() { return this; }, lineStyle() { return this; }, fillStyle() { return this; }, beginPath() { return this; },
    moveTo() { return this; }, lineTo() { return this; }, closePath() { return this; }, fillPath() { return this; },
    strokePath() { return this; }, setDepth() { return this; }, setMask() { return this; }, setVisible() { return this; },
    strokePoints() {}, setPosition() { return this; },
  });
  Object.assign(c, {
    GROUND: 1, ROAD: 2, DIRT: 3, BEACH: 4, WATER: 5, HILL: 6, MAP_WIDTH: 256, MAP_HEIGHT: 256, MAX_TERRAIN_HEIGHT: 8,
    busStopMap: grid(null), treeMap: grid(null),
    city: { budget: 1000000, population: 50000, year: 1900, month: 1, tick: 0, weather: { typhoonStage: 'none' }, underseaTunnels: [], districtSigns: [] },
    mapData: grid(1), zoneMap: grid(0), zoneDensityMap: grid(1), heightMap: grid(0),
    buildingData: {}, roadUnderlayMap: grid(null), bridgeMap: grid(null), powerLineSet: new Set(), lowDensityLockSet: new Set(),
    scene: {
      buildingSprites: new Map(), treeSprites: new Map(), debrisSprites: new Map(), zoneOverlays: new Map(),
      add: {
        image: () => ({ setOrigin() { return this; }, setScale() { return this; }, setPosition() { return this; }, setDepth() { return this; }, destroy() {}, setVisible() { return this; }, setMask() { return this; } }),
        graphics: noopGfx,
        text: () => ({ setOrigin() { return this; }, setResolution() { return this; }, setPosition() { return this; }, setText() { return this; }, setBackgroundColor() { return this; }, setScale() { return this; }, setDepth() { return this; }, setVisible() { return this; } }),
      },
      // Textures always "exist": every domain file's lazy asset loader (loadMetroViaductTextures,
      // loadUnderseaTunnelTextures, ...) then resolves without ever touching scene.load, which this
      // sandbox does not model.
      textures: { exists: () => true, get: () => ({ getSourceImage: () => ({ width: 1, height: 1 }) }), addCanvas: () => {}, remove: () => {} },
      cameras: { main: { zoom: 1 } },
    },
    isInsideMap: (r, col) => r >= 0 && col >= 0 && r < 60 && col < 60,
    isTerrainCreatorMode: false, mapRotation: 0, getTileHeight: (r, cc) => c.heightMap[r]?.[cc] || 0, isSlopeTile: () => false, isBridgeTile: () => false,
    t: (key) => key, showToast() {}, updateHUD() {}, saves: 0, queueCityChangeAutosave() { c.saves++; },
    getTileId: (r, col) => `${r}:${col}`,
    canPlaceBuilding: () => true,
    getBaseTileKey: (r, col) => (c.mapData[r]?.[col] === 2 ? 'road_straight_h' : 'grass'),
    setTileType: (scene, row, col, type) => { c.mapData[row][col] = type; },
    TOOL_TERRAIN: { grass: 1, road: 2, dirt: 3, beach: 4, water: 5, hill: 6, raise: 6, lower: 6, flatten: 6, bulldoze: 1 },
    addToRenderLayer: () => {},
    isoToScreen: (col, row) => ({ x: col * 100, y: row * 50 }),
    getTileFaceGeometry: () => ({ center: { x: 0, y: 0 } }),
    setTimeout: () => {},
    removeTree: (scene, row, col) => { scene.treeSprites.delete(`${row}:${col}`); if (c.treeMap[row]) c.treeMap[row][col] = null; },
    removeDebris: () => false,
    canPlaceRoad: () => true,
    refreshTileArea: () => {},
    reconcileSurfaceTerrainFromHeight: () => {},
    enforceLocalSlopeConstraints: () => {},
    refreshTreeSprite: () => {},
    invalidateOverlayCache: () => {},
  });
  c.activeScene = c.scene;
  const mainSrc = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const dragStart = mainSrc.indexOf('function getStraightDragPath(');
  vm.runInContext(mainSrc.slice(dragStart, mainSrc.indexOf('\n}\n', dragStart) + 3), c);
  load('building-placement.js'); load('bus-stops.js'); load('tools.js'); load('transport-expansion.js');
  load('metro.js'); load('metro-surface.js'); load('metro-surface-lines.js');
  load('tram.js'); load('tram-lines.js'); load('ferry.js'); load('undersea-tunnel.js');
  load('promenade.js'); load('typhoon-shelter.js'); load('typhoon-shelter-planning.js'); load('typhoon-shelter-fishery.js');
  load('terrain-editing.js');
  load('tool-actions.js'); load('build-session.js');
  // Sprite placement for a new station/track/portal reaches deep into Phaser's texture atlas,
  // which this sandbox does not model; the adapter's job (plan, spend, write city state) is what
  // these tests cover, so the pure-rendering tail of each commit is a no-op here.
  c.syncMetroStations = () => {};
  c.syncMetroTracks = () => {};
  c.drawUnderseaTunnel = () => {};
  for (let col = 0; col < 60; col++) c.mapData[10][col] = c.ROAD;
  return c;
}
function session(c, tool, start, end = start, options = {}) {
  const s = c.createBuildSession({ preview: (draft) => c.previewTouchToolAction(c.scene, draft), commit: (draft, plan) => c.commitTouchToolAction(c.scene, draft, plan) });
  s.begin(tool, { ...c.getTouchToolOptions(tool), ...options }, 1);
  const range = c.isTouchRangeDraft(s.getState());
  s.select(start, range); if (range) s.select(end, true);
  return s;
}
function confirm(s) { const draft = s.getState(); return s.confirm(draft.id, draft.owner); }

test('C3 adds exactly eleven tools to the touch catalog', () => {
  const c = setup();
  assert.equal(vm.runInContext('TOUCH_RAIL_TOOLS.length', c), 6);
  assert.equal(vm.runInContext('TOUCH_TERRAIN_MARINE_TOOLS.length', c), 5);
  assert.equal(vm.runInContext('new Set(TOUCH_SUPPORTED_TOOLS).size', c), 57);
});

test('undersea tunnel: a drag across open sea prices both bores and the two portals, built once', () => {
  const c = setup();
  c.mapData[20].fill(c.WATER, 10, 20); c.mapData[21].fill(c.WATER, 10, 20);
  const s = session(c, 'undersea-tunnel', { row: 20, col: 8 }, { row: 20, col: 22 });
  const plan = s.getState().plan;
  assert.equal(plan.ok, true); assert.equal(plan.cost, 30000 + 10 * 150);
  const result = confirm(s);
  assert.equal(result.ok, true); assert.equal(c.city.budget, 1000000 - plan.cost);
  assert.equal(c.city.underseaTunnels.length, 1);
  assert.equal(s.confirm(s.getState()?.id, 1).ok, false, 'the consumed draft cannot commit twice');
});

test('undersea tunnel: a single row of sea with no parallel lane is refused before any spend', () => {
  const c = setup(); c.mapData[20].fill(c.WATER, 10, 20);
  const s = session(c, 'undersea-tunnel', { row: 20, col: 8 }, { row: 20, col: 22 });
  assert.equal(s.getState().plan.ok, false);
  assert.equal(confirm(s).ok, false); assert.equal(c.city.budget, 1000000);
});

test('metro track: the height option changes what a drag would lay and its cost', () => {
  const c = setup();
  c.setExpansionEnabled('transport', true, { notify: false, autosave: false });
  const ground = session(c, 'metro-track', { row: 30, col: 5 }, { row: 30, col: 10 }, { height: 'ground' });
  assert.equal(ground.getState().plan.kinds.ground, 6);
  const underDraft = session(c, 'metro-track', { row: 40, col: 5 }, { row: 40, col: 10 }, { height: 'under' });
  assert.notEqual(underDraft.getState().plan.cost, ground.getState().plan.cost);
  const result = confirm(ground);
  assert.equal(result.ok, true);
  assert.equal(Object.keys(c.getMetroState().tracks).length > 0, true);
});

test('metro station and track draw first from the grant, then company cash, never city budget', () => {
  const c = setup();
  const locked = session(c, 'metro-station', { row: 11, col: 30 });
  assert.equal(locked.getState().plan.ok, false, 'population alone does not unlock metro - the transport company must be running');
  c.setExpansionEnabled('transport', true, { notify: false, autosave: false });
  c.getMetroState().grantBalance = 10000;
  const budget = c.city.budget;
  const s = session(c, 'metro-station', { row: 11, col: 30 });
  assert.equal(s.getState().plan.funding.payer, 'company');
  assert.equal(s.getState().plan.funding.balance, 10000 + c.getTransportExpansionState().company.cash);
  const companyCashBefore = c.getTransportExpansionState().company.cash;
  confirm(s);
  assert.equal(c.city.budget, budget, 'the city treasury never pays for metro construction once a grant exists');
  assert.equal(c.getMetroState().grantBalance, 0, 'the $10,000 grant is spent first');
  assert.equal(c.getTransportExpansionState().company.cash, companyCashBefore - 5000, 'the remaining $5,000 comes from company cash');
  assert.equal(c.getMetroState().stations.length, 1);
});

test('tram construction refuses outright while the transport company is not running, with no city fallback', () => {
  const c = setup();
  const s = session(c, 'tram-track', { row: 10, col: 5 }, { row: 10, col: 9 });
  assert.equal(s.getState().plan.ok, false);
  assert.equal(confirm(s).ok, false); assert.equal(c.city.budget, 1000000);
  c.setExpansionEnabled('transport', true, { notify: false, autosave: false });
  const active = session(c, 'tram-track', { row: 10, col: 5 }, { row: 10, col: 9 });
  assert.equal(active.getState().plan.ok, true);
  assert.equal(confirm(active).ok, true);
  assert.equal(Object.keys(c.getTramState().tracks).length > 0, true);
});

test('tram stop needs straight track already laid, and is paid from the company account', () => {
  const c = setup();
  c.setExpansionEnabled('transport', true, { notify: false, autosave: false });
  const track = session(c, 'tram-track', { row: 10, col: 5 }, { row: 10, col: 9 }); confirm(track);
  const cash = c.getTransportExpansionState().company.cash;
  const s = session(c, 'tram-stop', { row: 10, col: 6 });
  assert.equal(s.getState().plan.cost, 150);
  assert.equal(confirm(s).ok, true);
  assert.equal(c.getTransportExpansionState().company.cash, cash - 150);
  assert.equal(c.getTramState().stops.length, 1);
});

test('ferry pier needs its shore half, open water and a nearby road; it is never free', () => {
  const c = setup();
  for (let r = 12; r <= 20; r++) c.mapData[r].fill(c.WATER, 18, 26);
  const s = session(c, 'ferry-pier', { row: 11, col: 20 });
  assert.equal(s.getState().plan.cost, 2500);
  assert.equal(confirm(s).ok, true);
  assert.equal(c.getFerryState().piers.length, 1);
  const blocked = session(c, 'ferry-pier', { row: 40, col: 40 });
  assert.equal(blocked.getState().plan.ok, false);
});

test('typhoon shelter basin: a fresh rectangle is a free, unapproved draft; the subtract option cuts instead of adding', () => {
  const c = setup();
  c.mapData[35].fill(c.WATER, 5, 15); c.mapData[36].fill(c.WATER, 5, 15); c.mapData[37].fill(c.WATER, 5, 15);
  const add = session(c, 'typhoon-shelter', { row: 35, col: 5 }, { row: 37, col: 14 });
  assert.equal(add.getState().plan.cost, 0);
  assert.equal(confirm(add).ok, true);
  assert.equal(c.getTyphoonShelterState().shelters.length, 1);
  assert.equal(c.getTyphoonShelterState().shelters[0].works, undefined, 'drawing a basin never builds or charges it');
  const cut = session(c, 'typhoon-shelter', { row: 35, col: 5 }, { row: 35, col: 14 }, { subtract: true });
  assert.equal(cut.getState().plan.ok, true);
  confirm(cut);
  assert.ok(!c.decodeTyphoonShelterBasin(c.getTyphoonShelterState().shelters[0].basin).has('35:10'));
});

test('terrain: the brush option picks which type a rectangle paints, and raise/lower/flatten dispatch to the real tools', () => {
  const c = setup();
  const dirt = session(c, 'terrain', { row: 30, col: 30 }, { row: 31, col: 31 }, { terrainType: 'dirt' });
  assert.equal(confirm(dirt).ok, true);
  assert.deepEqual([c.mapData[30][30], c.mapData[31][31]], [c.DIRT, c.DIRT]);
  const raise = session(c, 'terrain', { row: 32, col: 32 }, { row: 32, col: 32 }, { terrainType: 'raise' });
  confirm(raise);
  assert.equal(c.mapData[32][32], c.HILL);
  assert.equal(c.heightMap[32][32], 1);
});

test('promenade: a new rectangle is charged per tile; re-selecting a built tile offers a free pier toggle instead', () => {
  const c = setup();
  c.mapData[46].fill(c.WATER, 15, 17);
  const built = session(c, 'promenade', { row: 45, col: 15 }, { row: 45, col: 16 });
  assert.equal(built.getState().plan.cost, 800);
  assert.equal(confirm(built).ok, true);
  assert.equal(c.getPromenadeState().tiles['45:15'], 0);
  const toggle = session(c, 'promenade', { row: 45, col: 15 });
  assert.equal(toggle.getState().plan.pierToggle, true);
  assert.equal(toggle.getState().plan.cost, 0);
  assert.equal(confirm(toggle).ok, true);
  assert.notEqual(c.getPromenadeState().tiles['45:15'], 0);
});

test('floating restaurant: refused with the real reason until its shelter is operational; the rotate option flips the shared orientation flag', () => {
  const c = setup();
  const s = session(c, 'floating-restaurant', { row: 20, col: 20 });
  assert.equal(s.getState().plan.ok, false);
  assert.equal(typeof s.getState().plan.reason, 'string');
  assert.equal(c.city.budget, 1000000);
  const before = vm.runInContext('typhoonShelterFloatingRestaurantTurn', c);
  s.setOptions({ turn: c.turnTyphoonShelterFloatingRestaurant() });
  assert.notEqual(vm.runInContext('typhoonShelterFloatingRestaurantTurn', c), before);
});
