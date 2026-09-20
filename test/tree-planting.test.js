const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const source = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const mainSource = source('main.js');
const growthSource = source('sim-growth.js');

function sliceFunction(text, name) {
  const start = text.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `${name} must remain extractable`);
  return text.slice(start, text.indexOf('\n}\n', start) + 3);
}

// A 5x5 map: row 2 is a road across the middle, (0,0) is water, (4,4) is a zoned lot,
// (0,4) has a building, (4,0) a pylon.
const GROUND = 1; const WATER = 2; const ROAD = 3; const HILL = 4;
function createRulesContext() {
  const mapData = [
    [WATER, GROUND, GROUND, GROUND, GROUND],
    [GROUND, GROUND, GROUND, GROUND, GROUND],
    [ROAD, ROAD, ROAD, ROAD, ROAD],
    [GROUND, GROUND, HILL, GROUND, GROUND],
    [GROUND, GROUND, GROUND, GROUND, GROUND],
  ];
  const empty = () => Array.from({ length: 5 }, () => Array(5).fill(null));
  const context = vm.createContext({
    Math, Number, Set,
    GROUND, WATER, ROAD, HILL, ZONE_NONE: 0, MAP_WIDTH: 5, MAP_HEIGHT: 5,
    mapData, treeMap: empty(), roadUnderlayMap: empty(), bridgeMap: empty(),
    zoneMap: Array.from({ length: 5 }, () => Array(5).fill(0)),
    buildingData: { '0:4': { type: 'house' } },
    powerLineSet: new Set(['4:0']),
    hasDistrictSignAt: () => false,
    isInsideMap: (r, c) => r >= 0 && c >= 0 && r < 5 && c < 5,
    getTileId: (r, c) => `${r}:${c}`,
  });
  context.zoneMap[4][4] = 1;
  const defs = ['isTreeTerrainEligible', 'canTreeGrowAt', 'canPlantTreeAt', 'getTreePlantingBlockReason', 'isAdjacentToRoad', 'canTreeOccupyAt']
    .map((name) => sliceFunction(mainSource, name)).join('\n');
  vm.runInContext(defs, context);
  return context;
}

test('the tree tool plants beside roads and on empty zoned lots, where wild trees never sprout', () => {
  const context = createRulesContext();
  const scene = { buildingSprites: new Map() };
  const plant = vm.runInContext('canPlantTreeAt', context);
  const wild = vm.runInContext('canTreeGrowAt', context);
  const reason = vm.runInContext('getTreePlantingBlockReason', context);
  // Grass next to the road: the tool may plant, the forest may not spread there.
  assert.equal(plant(scene, 1, 2), true);
  assert.equal(wild(scene, 1, 2), false, 'wild trees keep a tile clear of the road');
  assert.equal(plant(scene, 3, 2), true, 'hillside beside the road too');
  // An empty zoned lot: the tool may plant (the lot's building will clear it), the forest may not.
  assert.equal(plant(scene, 4, 4), true);
  assert.equal(wild(scene, 4, 4), false);
  // Hard refusals, with the reason the toast shows.
  assert.equal(reason(scene, 2, 2), 'road');
  assert.equal(reason(scene, 0, 0), 'terrain');
  assert.equal(reason(scene, 0, 4), 'building');
  assert.equal(reason(scene, 4, 0), 'powerLine');
  assert.equal(reason(scene, 4, 4), null);
  context.treeMap[4][3] = { species: 'banyan', age: 1, variant: 0.2 };
  assert.equal(reason(scene, 4, 3), 'tree');
  assert.equal(plant(scene, 4, 3), false);
  // A road with an underlay (a bridge ramp) or a bridge deck refuses too.
  context.roadUnderlayMap[1][0] = GROUND; context.bridgeMap[3][0] = 'deck:row';
  assert.equal(reason(scene, 1, 0), 'road');
  assert.equal(reason(scene, 3, 0), 'road');
  // The occupancy rule that loads and the sim apply: a planted tree keeps a roadside/zoned tile.
  const occupy = vm.runInContext('canTreeOccupyAt', context);
  assert.equal(occupy(scene, 1, 2, null, { planted: true }), true);
  assert.equal(occupy(scene, 1, 2, null, { planted: false }), false);
  assert.equal(occupy(scene, 4, 4, null, { planted: true }), true);
  assert.equal(occupy(scene, 2, 2, null, { planted: true }), false, 'but never a road');
});

test('the forest sweep keeps a planted roadside tree and culls a wild one', () => {
  const removed = [];
  const context = vm.createContext({
    Math: { random: () => 0.99 }, // no growth, death or spread this tick
    GROUND, ROAD, ZONE_NONE: 0, TREE_MATURE_AGE: 6, TREE_GROW_CHANCE_PER_TICK: 0, TREE_DEATH_CHANCE_PER_TICK: 0,
    TREE_SPREAD_CHANCE_GROUND: 0, TREE_SPREAD_CHANCE_HILL: 0, TREE_SPREAD_NEIGHBOR_CAP: 3, HILL,
    mapData: [[GROUND, GROUND, GROUND], [ROAD, ROAD, ROAD], [GROUND, GROUND, GROUND]],
    treeMap: [[{ species: 'banyan', age: 6, variant: 0.1, planted: true }, { species: 'banyan', age: 6, variant: 0.1 }, null], [null, null, null], [null, null, { species: 'banyan', age: 6, variant: 0.1 }]],
    zoneMap: [[0, 0, 0], [0, 0, 0], [0, 0, 1]],
    roadUnderlayMap: [[null, null, null], [null, null, null], [null, null, null]],
    bridgeMap: [[null, null, null], [null, null, null], [null, null, null]],
    getTreeSimulationTiles: () => [[0, 0], [0, 1], [2, 2]],
    isTreeTerrainEligible: (r, c) => [GROUND, HILL].includes([[GROUND, GROUND, GROUND], [ROAD, ROAD, ROAD], [GROUND, GROUND, GROUND]][r][c]),
    isAdjacentToRoad: (r) => r === 0 || r === 2,
    getTileId: (r, c) => `${r}:${c}`,
    getCardinalNeighbors: () => [],
    removeTree: (scene, r, c) => removed.push(`${r}:${c}`),
    refreshTreeSprite() {}, placeTree() {}, canTreeGrowAt: () => false,
  });
  vm.runInContext(sliceFunction(growthSource, 'updateTrees'), context);
  vm.runInContext('updateTrees', context)({ buildingSprites: new Map() });
  assert.deepEqual(removed.sort(), ['0:1', '2:2'], 'the wild roadside tree and the wild tree on a zoned lot go; the planted one stays');
});

test('the compact save keeps the planted flag and still reads five-element wild entries', () => {
  const context = vm.createContext({ Array, JSON, MAP_HEIGHT: 2, MAP_WIDTH: 2, Math, Number, Object, Set, String, console, TREE_SYSTEM_VERSION: 1, BARE_LAND_VERSION: 1, ROAD_TILE_SET_DEFAULT_ID: 'default', clearTimeout, setTimeout, fetch: async () => { throw new Error('no'); }, AbortController, Promise });
  vm.runInContext(source('save.js'), context, { filename: 'save.js' });
  const encode = vm.runInContext('encodeCompactTreeMap', context);
  const decode = vm.runInContext('decodeCompactTreeMap', context);
  const trees = [[{ species: 'banyan', age: 2, variant: 0.5, count: 1, planted: true }, null], [null, { species: 'palmLeaf', age: 6, variant: 0.25, count: 2 }]];
  const encoded = JSON.parse(JSON.stringify(encode(trees)));
  assert.deepEqual(encoded.entries, [[0, 'banyan', 2, 0.5, 1, 1], [3, 'palmLeaf', 6, 0.25, 2]], 'six elements only for a planted tree');
  const decoded = JSON.parse(JSON.stringify(decode(encoded)));
  assert.deepEqual(decoded, [[{ species: 'banyan', age: 2, variant: 0.5, count: 1, planted: true }, null], [null, { species: 'palmLeaf', age: 6, variant: 0.25, count: 2 }]]);
  // The normaliser main.js runs on load carries the flag through.
  const normalizerContext = vm.createContext({ Math, Number, TREE_SPECIES: [{ id: 'banyan' }, { id: 'palmLeaf' }], TREE_MATURE_AGE: 6, chooseTreeSpeciesForTile: () => ({ id: 'banyan' }) });
  vm.runInContext(sliceFunction(mainSource, 'normalizeTreeRecord'), normalizerContext);
  const normalize = vm.runInContext('normalizeTreeRecord', normalizerContext);
  assert.equal(normalize(decoded[0][0], 0, 0).planted, true);
  assert.equal(normalize(decoded[1][1], 1, 1).planted, false);
});

test('the tree tool shows a hover guide, plants as planted and explains a refusal', () => {
  assert.match(mainSource, /if \(selectedTool === 'tree'\) return \{ footprintCols: 1, footprintRows: 1 \};/);
  assert.match(mainSource, /selectedTool === 'tree'\s*\? canPlantTreeAt\(scene, tile\.row, tile\.col\)/);
  const tools = source('tools.js');
  assert.match(tools, /placeTree\(scene, row, col, \{ planted: true \}\)/);
  assert.match(tools, /toast\.treeBlocked\.\$\{reason\}/);
  const i18n = source('i18n.js');
  for (const reason of ['terrain', 'road', 'building', 'powerLine']) {
    assert.equal((i18n.match(new RegExp(`'toast\\.treeBlocked\\.${reason}'`, 'g')) || []).length, 3, `${reason} is translated in all three languages`);
  }
  // A load keeps a planted tree on its roadside tile.
  assert.match(mainSource, /canTreeOccupyAt\(scene, row, col, null, \{ planted: tree\.planted \}\)/);
});
