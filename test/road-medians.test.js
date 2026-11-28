// 雙線來回 roads and their 中央分隔帶 (Norton, 2026-11-28).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const medians = require('../road-medians.js');

// a north-south road two tiles wide (columns 5 and 6) from row 2 to row 14, a cross street at row 8
function dualRoad({ blocked = new Set(), crossAt = 8 } = {}) {
  const road = (r, c) => (c === 5 || c === 6) && r >= 2 && r <= 14;
  const roadKeyAt = (r, c) => {
    if (!road(r, c)) return null;
    if (r === 2 || r === 14 || r === crossAt) return 'road_corner_or_junction';
    return 'road_straight_v';
  };
  const bandAt = (r, c) => (road(r, c) ? { orientation: 'v', width: 2, index: c - 5 } : null);
  return medians.computeRoadMedianRuns({ mapWidth: 20, mapHeight: 20, roadKeyAt, bandAt, blockedAt: (r, c) => blocked.has(`${r}:${c}`) });
}

test('the reservation runs down the middle, a tile short of every end and junction', () => {
  const runs = dualRoad();
  assert.deepEqual(runs.map(({ orientation, line, from, to }) => ({ orientation, line, from, to })), [
    { orientation: 'v', line: 5, from: 4, to: 6 },
    { orientation: 'v', line: 5, from: 10, to: 12 },
  ]);
});

test('none where tram or light rail track runs on the road; it comes back when the track goes', () => {
  const tracked = dualRoad({ blocked: new Set(['4:6', '5:6', '6:6', '7:6', '10:5', '11:5', '12:5']) });
  assert.equal(tracked.length, 0);
  assert.equal(dualRoad().length, 2);
});

test('its kind from what stands along it', () => {
  assert.equal(medians.roadMedianStyleFor({ tiles: 40, built: 30, commercialHigh: 10, residentialHigh: 12, green: 0 }), 'palms');
  assert.equal(medians.roadMedianStyleFor({ tiles: 40, built: 30, commercialHigh: 2, residentialHigh: 12, green: 0 }), 'rail');
  assert.equal(medians.roadMedianStyleFor({ tiles: 40, built: 2, commercialHigh: 0, residentialHigh: 0, green: 1 }), 'trees');
  assert.equal(medians.roadMedianStyleFor({ tiles: 40, built: 20, commercialHigh: 0, residentialHigh: 2, green: 2 }), 'hedge');
  // 調低門檻: a tenth of the lots shops and offices is enough for palms
  assert.equal(medians.roadMedianStyleFor({ tiles: 40, built: 30, commercialHigh: 4, residentialHigh: 12, green: 0 }), 'palms');
  const src = fs.readFileSync(path.join(__dirname, '..', 'road-medians.js'), 'utf8');
  assert.match(src, /type === 'commercial' && \(density >= 2/, 'medium-density shops count');
});

test('T lamps on the line, every 1.5 tiles, the arm across the road', () => {
  const lamps = medians.roadMedianLampPlacements([{ orientation: 'v', line: 5, from: 3, to: 8 }]);
  // rows 3..8: slots 0, 1, 2, 0, 1, 2 -> rows 3, 4, 6, 7 have a lamp
  assert.deepEqual(lamps.map((l) => l.row), [3, 4, 6, 7]);
  assert.ok(lamps.every((l) => l.kind === 'median' && l.col + l.offsetCol === 5.5 && l.arm === 'e'));
  const lampSource = fs.readFileSync(path.join(__dirname, '..', 'street-lamps.js'), 'utf8');
  assert.match(lampSource, /lightPost_T_\$\{variant\}\.png/);
  for (const f of ['lightPost_T_A.png', 'lightPost_T_A__lit.png', 'lightPost_T_B.png', 'lightPost_T_B__lit.png']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'Models', 'traffic', 'lightPost', f)), f);
  }
});

test('a 雙線來回 drag lays its second line on the side with room, south / east first', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const start = src.indexOf('function chooseDualRoadOffset');
  const end = src.indexOf('\n}\n', start) + 3;
  const ctx = vm.createContext({});
  vm.runInContext(src.slice(start, end), ctx);
  const path0 = { axis: 'row', path: [{ row: 5, col: 1 }, { row: 5, col: 2 }, { row: 5, col: 3 }] };
  const plain = JSON.parse(JSON.stringify(vm.runInContext('chooseDualRoadOffset', ctx)(path0, () => true)));
  assert.deepEqual([plain.dr, plain.dc], [1, 0], 'south when both sides are free');
  const blockedSouth = JSON.parse(JSON.stringify(vm.runInContext('chooseDualRoadOffset', ctx)(path0, (r) => r !== 6)));
  assert.deepEqual([blockedSouth.dr, blockedSouth.dc], [-1, 0], 'north when the south is built on');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /data-bridge-style="dual"/);
  assert.ok(html.indexOf('pedestrian-railings.js') < html.indexOf('road-medians.js'));
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'road-flyovers.js'), 'utf8'), /ROAD_BRIDGE_STYLES = Object\.freeze\(\['ground', 'dual', 'flyover', 'suspension'\]\)/);
});

test("Norton's flower beds: ovals at the ends, a mix of lengths between, the same mix every time", () => {
  const { ROAD_MEDIAN_PLANTERS } = require('../road-median-art.js');
  const art = ROAD_MEDIAN_PLANTERS.flowers;
  for (const set of Object.values(ROAD_MEDIAN_PLANTERS)) {
    for (const piece of Object.values(set)) {
      for (const f of Object.values(piece.files)) assert.ok(fs.existsSync(path.join(__dirname, '..', f)), f);
    }
  }
  assert.ok(['short', 'medium', 'long', 'longer', 'longest', 'oval'].every((name) => art[name]));
  const gap = medians.ROAD_MEDIAN.planterSets.flowers.gap;
  const mixes = new Set();
  for (let length = 2; length <= 12; length++) {
    for (let seed = 1; seed <= 6; seed++) {
      const lays = medians.layRoadMedianPlanters(length, 'flowers', seed * 7919, art);
      assert.deepEqual(lays, medians.layRoadMedianPlanters(length, 'flowers', seed * 7919, art), 'the same seed lays the same');
      assert.equal(lays[0].piece, 'oval');
      assert.equal(lays[lays.length - 1].piece, 'oval');
      lays.forEach((lay, i) => {
        const end = lay.at + art[lay.piece].lengthTiles;
        assert.ok(lay.at >= -1e-6 && end <= length + 1e-3, `inside the run (${length}, ${lay.piece} ${lay.at})`);
        if (i > 0) {
          const prev = lays[i - 1];
          assert.ok(lay.at - (prev.at + art[prev.piece].lengthTiles) >= gap - 1e-3, 'a gap between beds');
        }
      });
      if (length === 10) mixes.add(lays.map((l) => l.piece).join(','));
    }
  }
  assert.ok(mixes.size >= 3, `runs differ (${mixes.size} mixes)`);
  // too short for both ends: one oval in the middle
  assert.deepEqual(medians.layRoadMedianPlanters(0.8, 'flowers', 1, art).map((l) => l.piece), ['oval']);
  // the palms keep their nose-first order
  const palms = medians.layRoadMedianPlanters(5, 'palms', 1, ROAD_MEDIAN_PLANTERS.palms);
  assert.equal(palms[0].piece, 'nose');
  assert.equal(palms[palms.length - 1].piece, 'island');
});

test('a tree on a flower-bed run stands in a bed, never in a gap', () => {
  const beds = [{ from: 3.5, to: 4.0 }, { from: 4.04, to: 6.2 }];
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ~ ${b}`);
  near(medians.roadMedianTreeSpot(5, beds), 5);
  near(medians.roadMedianTreeSpot(4.03, beds), 4.14);
  near(medians.roadMedianTreeSpot(7, beds), 6.1);
  assert.equal(medians.roadMedianTreeSpot(5, []), null);
});
