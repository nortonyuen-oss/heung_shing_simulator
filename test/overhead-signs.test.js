// 高架路牌 (Norton, 2026-11-28): where the TPDM (Vol 3 Ch 3) puts overhead direction signs, on our
// narrower roads (兩線就用得): the approaches to 天橋 / 懸索橋, 海底隧道 and 區外連線.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'overhead-signs.js'), 'utf8');

function world({ roads = [], districts = [], high = [] } = {}) {
  const size = 30;
  const ROAD = 2;
  const mapData = Array.from({ length: size }, () => Array(size).fill(1));
  roads.forEach(([r, c]) => { mapData[r][c] = ROAD; });
  const bridgeMap = new Map(high.map(([r, c]) => [`${r}:${c}`, 'deck']));
  const ctx = vm.createContext({
    Math, Number, String, Object, Array, Map, Set, JSON,
    MAP_WIDTH: size, MAP_HEIGHT: size, ROAD, mapData, bridgeMap,
    isInsideMap: (r, c) => r >= 0 && c >= 0 && r < size && c < size,
    getTileId: (r, c) => `${r}:${c}`,
    isRoadTile: (r, c) => mapData[r]?.[c] === ROAD || bridgeMap.has(`${r}:${c}`),
    isHighBridgeTile: (r, c) => bridgeMap.has(`${r}:${c}`),
    highBridgeRun: () => ({ tiles: high.map(([row, col]) => ({ row, col })), axis: 'col', suspension: true, level: 4 }),
    getDistrictSignForTile: (r) => districts.find((d) => r >= d.from && r <= d.to) || null,
  });
  vm.runInContext(source, ctx);
  return ctx;
}

test('a suspension bridge approach gets a gantry each way: green to the district across, blue the other way', () => {
  const road = []; for (let r = 0; r < 30; r++) road.push([r, 10]);
  const high = []; for (let r = 8; r <= 20; r++) high.push([r, 10]);
  const ctx = world({ roads: road.filter(([r]) => r < 8 || r > 20), high,
    districts: [{ from: 0, to: 12, name: '東涌', englishName: 'Tung Chung' }, { from: 13, to: 29, name: '青衣', englishName: 'Tsing Yi' }] });
  const list = JSON.parse(JSON.stringify(vm.runInContext('computeOverheadSignPlacements()', ctx)));
  assert.equal(list.length, 2, JSON.stringify(list));
  const north = list.find((g) => g.tiles[0][0] < 8);
  assert.deepEqual(north.tiles, [[6, 10]], 'two tiles before the ramp');
  assert.equal(north.panels.s.zh, '青衣', 'onto the bridge: the district across');
  assert.equal(north.panels.s.colour, 'green', 'a 懸索橋 is built to expressway standard (TPDM 3.2.7.8)');
  assert.equal(north.panels.n.colour, 'blue');
  const south = list.find((g) => g.tiles[0][0] > 20);
  assert.equal(south.panels.n.zh, '東涌');
});

test('a two-lane road gets a panel over each lane, keep left', () => {
  const ctx = world();
  const lanes = JSON.parse(JSON.stringify(vm.runInContext("overheadSignLanes({ tiles: [[5, 5]], travel: 'ns' })", ctx)));
  assert.equal(lanes.length, 2);
  // northbound keeps left: the west half of the road
  assert.deepEqual(lanes.find((l) => l.dir === 'n'), { dir: 'n', from: -0.5, to: 0 });
  assert.deepEqual(lanes.find((l) => l.dir === 's'), { dir: 's', from: 0, to: 0.5 });
});

test('with no named district ahead the sign says All Destinations, and the game wires the gantries in', () => {
  assert.match(source, /zh: '所有目的地', en: 'All Destinations'/);
  assert.match(source, /minSpacingTiles: 8/);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('street-furniture.js') < html.indexOf('overhead-signs.js'));
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  assert.equal((main.match(/scheduleOverheadSignRefresh\(scene\)/g) || []).length, 2);
  assert.match(main, /rebuildOverheadSignSprites\(scene\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'viewport-culling.js'), 'utf8'), /overheadSignFaceSprites/);
});
