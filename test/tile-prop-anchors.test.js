const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');

function sliceFunction(name) {
  const start = mainSource.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `${name} must remain extractable from main.js`);
  return mainSource.slice(start, mainSource.indexOf('\n}\n', start) + 3);
}
const constant = (name) => {
  const match = mainSource.match(new RegExp(`\\nconst ${name} = ([^;]+);`));
  assert.ok(match, `${name} must remain a top-level const in main.js`);
  return match[1];
};

// A tile's screen y (isoToScreen) is the bottom of its 65 px image; the diamond centre is 40 px
// above it and its bottom vertex 15 px above. Trees and debris stand on the centre of their own
// tile and sort with the same basis as a building, lamp or vehicle there (tile y + TILE_HEIGHT).
// They used to stand at +25 - on the tile diagonally in front - while sorting half a tile behind.
function createContext() {
  const context = vm.createContext({
    Math, Number,
    mapRotation: 0,
    treeMap: {}, debrisMap: {},
    isoToScreen: (col, row) => ({ x: (col - row) * 50, y: (col + row) * 25 }),
    getTileHeight: () => 0,
    getWorldDepth: (layer, local) => 200000 + local,
    getObjectTileDepth: (row, col, local) => 200000 + local,
    sortRenderLayer() {},
    getTreeVisualOffset: () => ({ x: 0, y: 0 }),
    getDebrisVisualOffset: () => ({ x: 0, y: 0 }),
    getTreeSubOffset: () => ({ x: 0, y: 0 }),
  });
  const defs = ['TILE_WIDTH', 'TILE_HEIGHT', 'TILE_IMAGE_HEIGHT', 'HEIGHT_STEP_PIXELS', 'BUILDING_SURFACE_Y_OFFSET', 'TILE_PROP_FOOT_OFFSET_Y']
    .map((name) => `const ${name} = ${constant(name)};`).join('\n');
  vm.runInContext(defs + sliceFunction('getElevationVisualOffset') + sliceFunction('positionTree') + sliceFunction('positionDebrisSprite')
    + sliceFunction('getBuildingSortDepth') + sliceFunction('getBuildingAnchor'), context);
  return context;
}

function fakeSprite(row, col, extra = {}) {
  return { mapRow: row, mapCol: col, x: 0, y: 0, depth: 0, setPosition(x, y) { this.x = x; this.y = y; }, setDepth(d) { this.depth = d; }, ...extra };
}

test('a tree stands on the centre of its own tile, not the tile diagonally in front', () => {
  const context = createContext();
  context.treeMap = { 4: { 6: { variant: 0.3, count: 1 } } };
  const sprite = fakeSprite(4, 6, { treeCount: 1, treeSubIndex: 0 });
  vm.runInContext('positionTree', context)({ offsetX: 1000, offsetY: 2000 }, sprite);
  const tileY = (6 + 4) * 25;                       // isoToScreen y: bottom of the tile image
  const centreY = tileY - 65 + 25;                  // diamond centre, 40 px above it
  assert.equal(sprite.x, 1000 + (6 - 4) * 50);
  assert.equal(sprite.y, 2000 + centreY + 4, 'foot a few px below the diamond centre (the art\'s ground patch)');
  assert.ok(sprite.y < 2000 + tileY - 15, 'and above the diamond\'s bottom vertex');
  // The old +25 put the foot 40 px below the bottom vertex, on the next diagonal tile.
  assert.equal(2000 + tileY + 25 - sprite.y, 61);
});

test('trees and debris sort with the buildings, lamps and traffic around them', () => {
  const context = createContext();
  context.treeMap = { 4: { 6: { variant: 0.3, count: 1 } }, 3: { 6: { variant: 0.3, count: 1 } }, 5: { 6: { variant: 0.3, count: 1 } } };
  context.debrisMap = { 4: { 7: { kind: 'sedanWreck', variant: 0.2 } } };
  const scene = { offsetX: 0, offsetY: 0 };
  const positionTree = vm.runInContext('positionTree', context);
  const positionDebris = vm.runInContext('positionDebrisSprite', context);
  const buildingDepth = vm.runInContext('getBuildingSortDepth', context);
  const anchor = vm.runInContext('getBuildingAnchor', context);
  const depthOf = (row, col) => { const s = fakeSprite(row, col, { treeCount: 1, treeSubIndex: 0 }); positionTree(scene, s); return s.depth; };
  const houseAt = (row, col) => buildingDepth(anchor(row, col, 1, 1).y, 1, 1, 0);
  // A house on the tile in front (row + 1) draws over the tree; one on the tile behind does not.
  assert.ok(depthOf(4, 6) < houseAt(5, 6), 'house in front covers the tree');
  assert.ok(depthOf(4, 6) > houseAt(3, 6), 'tree covers the house behind');
  assert.ok(depthOf(4, 6) > houseAt(4, 5) && depthOf(4, 6) < houseAt(4, 7), 'likewise along the other axis');
  // Same basis as a house on the same tile would have (tile y + TILE_HEIGHT).
  assert.equal(depthOf(4, 6), houseAt(4, 6));
  // Trees on consecutive tiles sort front to back, and debris the same way as trees.
  assert.ok(depthOf(3, 6) < depthOf(4, 6) && depthOf(4, 6) < depthOf(5, 6));
  const wreck = fakeSprite(4, 7); positionDebris(scene, wreck);
  assert.equal(wreck.depth, houseAt(4, 7));
  assert.equal(wreck.y, (7 + 4) * 25 - 65 + 25 + 4, 'debris stands on its tile centre too');
});
