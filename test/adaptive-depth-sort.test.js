const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function sliceFunction(name) {
  const start = mainSource.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `${name} must remain extractable from main.js`);
  const end = mainSource.indexOf('\n}\n', start) + 3;
  return mainSource.slice(start, end);
}

function createContext() {
  const context = vm.createContext({});
  vm.runInContext('const ADAPTIVE_DEPTH_SORT_MAX_DESCENTS = 128; const ADAPTIVE_DEPTH_SORT_MAX_MOVED = 256; const ADAPTIVE_DEPTH_SORT_SEARCH_MOVED = 24;', context);
  ['sortNearlySortedByDepth', 'reinsertMovedByDepth', 'installAdaptiveDepthSort'].forEach((name) => {
    vm.runInContext(sliceFunction(name), context, { filename: `main.js#${name}` });
  });
  return context;
}

// What Phaser does: a stable sort by _depth.
const referenceSort = (items) => items
  .map((item, index) => ({ item, index }))
  .sort((a, b) => a.item._depth - b.item._depth || a.index - b.index)
  .map(({ item }) => item);

// A seeded generator so failures reproduce.
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('a nearly sorted list comes out exactly as Phaser\'s stable sort would order it', () => {
  const { sortNearlySortedByDepth } = createContext();
  const rand = random(7);
  for (let round = 0; round < 50; round++) {
    // A sorted city with plenty of equal depths, then a few objects moved like vehicles do.
    const items = Array.from({ length: 2000 }, (_, id) => ({ id, _depth: Math.floor(id / 3) }));
    for (let moves = 0; moves < 40; moves++) {
      const item = items[Math.floor(rand() * items.length)];
      item._depth += (rand() - 0.5) * 12;
    }
    const expected = referenceSort(items).map((item) => item.id);
    assert.equal(sortNearlySortedByDepth(items, 128), true);
    assert.deepEqual(items.map((item) => item.id), expected);
  }
});

test('an already sorted list is left alone; a scrambled one is handed back untouched', () => {
  const { sortNearlySortedByDepth } = createContext();
  const sorted = Array.from({ length: 100 }, (_, id) => ({ id, _depth: id }));
  assert.equal(sortNearlySortedByDepth(sorted, 128), true);
  assert.deepEqual(sorted.map((item) => item.id), Array.from({ length: 100 }, (_, id) => id));

  const scrambled = Array.from({ length: 1000 }, (_, id) => ({ id, _depth: (id * 7919) % 1000 }));
  const before = scrambled.map((item) => item.id);
  assert.equal(sortNearlySortedByDepth(scrambled, 128), false, 'too far from sorted to pay');
  assert.deepEqual(scrambled.map((item) => item.id), before, 'nothing moved');
});

test('the installed depthSort sorts adaptively and falls back to Phaser\'s full sort', () => {
  const { installAdaptiveDepthSort } = createContext();
  let fullSorts = 0;
  const displayList = {
    list: [{ _depth: 1 }, { _depth: 3 }, { _depth: 2 }],
    sortChildrenFlag: true,
    depthSort() {
      fullSorts++;
      this.list.sort((a, b) => a._depth - b._depth);
      this.sortChildrenFlag = false;
    },
  };
  assert.equal(installAdaptiveDepthSort(displayList), true);
  assert.equal(installAdaptiveDepthSort(displayList), false, 'installed once');
  displayList.depthSort();
  assert.deepEqual(displayList.list.map((item) => item._depth), [1, 2, 3]);
  assert.equal(displayList.sortChildrenFlag, false);
  assert.equal(fullSorts, 0, 'a nearly sorted list never reaches the merge sort');

  displayList.list = Array.from({ length: 1000 }, (_, id) => ({ _depth: (id * 7919) % 1000 }));
  displayList.sortChildrenFlag = true;
  displayList.depthSort();
  assert.equal(fullSorts, 1, 'a scrambled list does');
  assert.equal(displayList.sortChildrenFlag, false);

  displayList.depthSort();
  assert.equal(fullSorts, 1, 'no flag, no work');
});

test('pulling out the moved objects and putting them back matches the stable sort', () => {
  const { reinsertMovedByDepth } = createContext();
  const rand = random(11);
  for (let round = 0; round < 60; round++) {
    const items = Array.from({ length: 3000 }, (_, id) => ({ id, _depth: Math.floor(id / 3) }));
    const moved = new Set();
    // Alternate a few moves (found by indexOf) and many (one pass over the list).
    const moveCount = round % 2 ? 60 : 1 + (round % 20);
    for (let moves = 0; moves < moveCount; moves++) {
      const item = items[Math.floor(rand() * items.length)];
      item._depth += (rand() - 0.5) * 40;
      moved.add(item);
    }
    const expected = referenceSort(items).map((item) => item.id);
    reinsertMovedByDepth(items, moved);
    assert.deepEqual(items.map((item) => item.id), expected);
  }
});

// A stand-in for a Phaser Game Object class: the depth accessor queues a sort on its list.
function makeGameObjectClass() {
  function GameObject(depth) { this._depth = depth; this.displayList = null; }
  Object.defineProperty(GameObject.prototype, 'depth', {
    configurable: true,
    enumerable: true,
    get() { return this._depth; },
    set(value) { if (this.displayList) this.displayList.queueDepthSort(); this._depth = value; },
  });
  return GameObject;
}

function makeDisplayList() {
  let fullSorts = 0;
  const displayList = {
    list: [],
    sortChildrenFlag: false,
    queueDepthSort() { this.sortChildrenFlag = true; },
    add(child) { this.list.push(child); child.displayList = this; this.queueDepthSort(); return child; },
    depthSort() {
      if (!this.sortChildrenFlag) return;
      fullSorts++;
      const order = new Map(this.list.map((item, index) => [item, index]));
      this.list.sort((a, b) => (a._depth - b._depth) || (order.get(a) - order.get(b)));
      this.sortChildrenFlag = false;
    },
  };
  return { displayList, fullSorts: () => fullSorts };
}

test('only the objects whose depth changed are re-placed, and a same-value set sorts nothing', () => {
  const { installAdaptiveDepthSort } = createContext();
  const GameObject = makeGameObjectClass();
  const { displayList, fullSorts } = makeDisplayList();
  installAdaptiveDepthSort(displayList);
  const objects = Array.from({ length: 500 }, (_, i) => displayList.add(new GameObject(i)));
  displayList.depthSort();
  assert.equal(fullSorts(), 0, 'too many to re-place one by one, but already in order: one insertion-sort pass');

  objects[10].depth = 400.5;
  objects[450].depth = 3.5;
  assert.equal(displayList.sortChildrenFlag, true);
  displayList.depthSort();
  assert.equal(fullSorts(), 0, 'two moved objects never reach the full sort');
  assert.deepEqual(displayList.list.map((o) => o._depth), [...displayList.list.map((o) => o._depth)].sort((a, b) => a - b));
  assert.equal(displayList.list.indexOf(objects[450]), 4);
  assert.equal(displayList.list.indexOf(objects[10]), 401, 'after 0..400 less itself, plus the 3.5 moved in');

  objects[20].depth = objects[20]._depth;
  assert.equal(displayList.sortChildrenFlag, false, 'setting the same depth queues no sort');

  // A new object appended with a low depth is placed, not left at the end.
  const late = displayList.add(new GameObject(-1));
  displayList.depthSort();
  assert.equal(displayList.list[0], late);
  assert.equal(fullSorts(), 0);
});

test('the scene installs the adaptive sort on its display list at create', () => {
  assert.match(mainSource, /function create\(\) \{\n  installVertexUploadShim\(this\.game\?\.renderer\);\n  installAdaptiveDepthSort\(this\.sys\?\.displayList\);/);
});
