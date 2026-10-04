const assert = require('node:assert/strict');
const test = require('node:test');
const shelter = require('../typhoon-shelter.js');
// the works normaliser is a browser global next to typhoon-shelter.js
const works = require('../typhoon-shelter-works.js');
globalThis.normalizeTyphoonShelterWorks = works.normalizeTyphoonShelterWorks;
const {
  TYPHOON_SHELTER_WORK_KINDS,
  layoutTyphoonShelterWorks,
  createTyphoonShelterWorks,
  reconcileTyphoonShelterWorks,
  completeTyphoonShelterWorks,
  summarizeTyphoonShelterWorks,
} = works;

function fixture(rows) {
  const grid = rows.map((row) => [...row]);
  const basin = new Set();
  grid.forEach((row, r) => row.forEach((ch, c) => { if (ch === '.') basin.add(`${r}:${c}`); }));
  const kinds = { '#': 'land', R: 'land', b: 'land', '~': 'water', '.': 'water' };
  const map = { width: grid[0].length, height: grid.length, kind: (r, c) => (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length ? null : kinds[grid[r][c]]) };
  const roads = [];
  grid.forEach((row, r) => row.forEach((ch, c) => { if (ch === 'R') roads.push([r, c]); }));
  const roadDistance = (r, c) => Math.min(Infinity, ...roads.map(([rr, cc]) => Math.abs(rr - r) + Math.abs(cc - c)));
  const isOpenWater = (r, c) => map.kind(r, c) === 'water' && !basin.has(`${r}:${c}`);
  const isFreeBeach = (r, c) => grid[r]?.[c] === 'b';
  return { map, basin, roadDistance, isOpenWater, isFreeBeach };
}

// a bay with a road reaching the shore near its east end
const BAY = [
  '#############R##',
  '##..........##R#',
  '##..........####',
  '##..........####',
  '##..........####',
  '##..........####',
  '##..........####',
  '~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~',
];

function setup() {
  const f = fixture(BAY);
  const plan = { id: 'ts1', seed: 42, basin: shelter.encodeTyphoonShelterBasin(f.basin), entrances: [], reservePct: 20 };
  plan.entrances = shelter.suggestTyphoonShelterEntrances(plan, f.map);
  const analysis = shelter.analyzeTyphoonShelter(plan, f.map);
  return { f, plan, analysis };
}

test('layout: breakwater on the line, lit heads at the entrance, a pier by the road, buoys', () => {
  const { f, plan, analysis } = setup();
  assert.ok(analysis.legal);
  const layout = layoutTyphoonShelterWorks(plan, analysis, f);
  const of = (kind) => layout.filter((w) => w.kind === kind);
  assert.equal(of('breakwater').length + of('head').length, analysis.breakwater.size);
  assert.equal(of('head').length, 2, 'one either side of the single entrance');
  assert.equal(of('pier').length, 1);
  // the pier sits on the shore tile closest to the road (top right)
  const pier = of('pier')[0];
  assert.ok(pier.col >= 9 && pier.row <= 2, JSON.stringify(pier));
  assert.equal(of('navBuoyRed').length, 1);
  assert.equal(of('navBuoyGreen').length, 1);
  // entering northward from the south, red (port) is to the west of green
  assert.ok(of('navBuoyRed')[0].col < of('navBuoyGreen')[0].col);
  // mooring buoys only on water no boat uses: never a lane or a big boat's berth
  const mooring = works.planTyphoonShelterMooring(analysis, layout.filter((w) => w.kind !== 'mooringBuoy'));
  const bigBerths = new Set(mooring.slots.filter((sl) => sl.size === 2).flatMap((sl) => sl.tiles));
  of('mooringBuoy').forEach((w) => {
    assert.ok(!mooring.lanes.has(`${w.row}:${w.col}`) && !bigBerths.has(`${w.row}:${w.col}`), `buoy ${w.key} is in the boats' way`);
  });
  // the entrance buoys flank the way out: the tiles straight out from the entrance are clear
  const entrance = analysis.entrances[0];
  const out = { n: [-1, 0], s: [1, 0], e: [0, 1], w: [0, -1] }[entrance.side];
  const navTiles = new Set([...of('navBuoyRed'), ...of('navBuoyGreen')].map((w) => `${w.row}:${w.col}`));
  entrance.tiles.forEach((k) => { const [r, c] = k.split(':').map(Number); assert.ok(!navTiles.has(`${r + out[0]}:${c + out[1]}`)); });
  layout.filter((w) => w.kind === 'mooringBuoy').forEach((w) => assert.ok(!analysis.channel.has(`${w.row}:${w.col}`)));
  // the same plan always lays out the same works
  assert.deepEqual(layoutTyphoonShelterWorks(plan, analysis, f), layout);
});

test('floating walkways run straight out from the shore, landing stage on the beach', () => {
  // the bay's north shore is a beach strip (row 1); the road is behind it
  const f = fixture([
    '#####R#########',
    '##bbbbbbbbbbb##',
    '##...........##',
    '##...........##',
    '##...........##',
    '##...........##',
    '##...........##',
    '##...........##',
    '~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~',
  ]);
  const plan = { id: 'ts1', seed: 3, basin: shelter.encodeTyphoonShelterBasin(f.basin), entrances: [], reservePct: 20 };
  plan.entrances = shelter.suggestTyphoonShelterEntrances(plan, f.map);
  const analysis = shelter.analyzeTyphoonShelter(plan, f.map);
  assert.ok(analysis.legal, JSON.stringify(analysis.problems.map((p) => p.code)));
  const layout = layoutTyphoonShelterWorks(plan, analysis, f);
  const of = (kind) => layout.filter((w) => w.kind === kind);
  assert.equal(of('pier')[0].row, 1, 'the pier stands on the beach');
  const landings = of('floatingPier');
  assert.ok(landings.length >= 1);
  landings.forEach((l) => {
    assert.equal(l.row, 1, `${l.key}: landing stage on the beach`);
    assert.equal(l.facing, 'n', 'its steps lead up onto the land');
    // the walkway runs straight out to sea from the landing: same column, rows 1, 2, 3...
    const walk = of('pontoon').filter((p) => p.col === l.col).map((p) => p.row).sort((a, b) => a - b);
    assert.ok(walk.length >= 3, `${l.key}: walkway ${walk}`);
    walk.forEach((row, i) => assert.equal(row, 1 + i));
    // it stops a tile short of the breakwater (basin ends at row 7, breakwater on row 8)
    assert.ok(walk[walk.length - 1] <= 6);
  });
  // never alongside the breakwater (the bay's side walls are land here; its mouth wall is row 8)
  of('pontoon').forEach((p) => [[0, 1], [0, -1]].forEach(([dr, dc]) => assert.ok(!analysis.ring.has(`${p.row + dr}:${p.col + dc}`))));
  // walkways are spaced apart along the shore, and the pier keeps its own spot
  const cols = landings.map((l) => l.col).sort((a, b) => a - b);
  cols.slice(1).forEach((c, i) => assert.ok(c - cols[i] >= 3));
  assert.ok(cols.every((c) => Math.abs(c - of('pier')[0].col) >= 2));
  // mooring buoys keep clear of the walkways
  const walkTiles = new Set(of('pontoon').map((p) => `${p.row}:${p.col}`));
  of('mooringBuoy').forEach((b) => [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dr, dc]) => assert.ok(!walkTiles.has(`${b.row + dr}:${b.col + dc}`))));
  // a fairway close in to the shore still leaves room: walkways run up to its edge, never onto it
  const fairway = new Set([...analysis.basin].filter((k) => ['4', '5'].includes(k.split(':')[0])));
  const nearWalks = layoutTyphoonShelterWorks(plan, { ...analysis, channel: fairway }, f).filter((w) => w.kind === 'pontoon');
  assert.ok(nearWalks.length >= 3);
  nearWalks.forEach((w) => assert.ok(w.row <= 3, `${w.key} stops at the fairway's edge`));
  assert.ok(nearWalks.some((w) => w.row === 3), 'and reaches it');
  // without a beach, the walkways start on the water's edge
  const plain = layoutTyphoonShelterWorks(plan, analysis, { ...f, isFreeBeach: () => false });
  plain.filter((w) => w.kind === 'floatingPier').forEach((w) => assert.equal(w.row, 2));
});

test('a breakwater that meets the shore gets a root section reaching onto the land', () => {
  const { f, plan, analysis } = setup();
  const kindAt = (r, c) => f.map.kind(r, c);
  const layout = layoutTyphoonShelterWorks(plan, analysis, { ...f, isLand: (r, c) => kindAt(r, c) === 'land' });
  const roots = layout.filter((w) => w.kind === 'breakwaterRoot');
  // the bay's mouth wall (row 7) ends at both headlands, which sit just round the corner (row 6)
  assert.deepEqual(roots.map((w) => [w.row, w.col, w.facing]).sort(), [[7, 11, 'e'], [7, 2, 'w']]);
  roots.forEach((w) => {
    const step = { e: [0, 1], w: [0, -1] }[w.facing];
    assert.equal(kindAt(w.row - 1, w.col + step[1]), 'land', `${w.key} reaches the headland`);
  });
  // without the land test, no roots
  assert.equal(layoutTyphoonShelterWorks(plan, analysis, f).filter((w) => w.kind === 'breakwaterRoot').length, 0);
});

test('building a plan builds every work at once and charges the whole bill', () => {
  const { f, plan, analysis } = setup();
  const layout = layoutTyphoonShelterWorks(plan, analysis, f);
  const bill = completeTyphoonShelterWorks(reconcileTyphoonShelterWorks(createTyphoonShelterWorks(), layout));
  assert.ok(bill.works.items.every((i) => i.state === 'done'));
  assert.equal(bill.built, layout.length);
  assert.equal(bill.cost, layout.reduce((sum, w) => sum + TYPHOON_SHELTER_WORK_KINDS[w.kind].cost, 0));
  // cheap enough for a young city: a small bay shelter costs about as much as a school
  assert.ok(bill.cost < 2000, `bill ${bill.cost}`);
  // building the same plan again costs nothing
  assert.equal(completeTyphoonShelterWorks(reconcileTyphoonShelterWorks(bill.works, layout)).cost, 0);
  const summary = summarizeTyphoonShelterWorks(bill.works, analysis, { pierConnected: true });
  assert.ok(summary.operational);
  assert.ok(summary.upkeep > 0 && summary.upkeep < 60);
  assert.ok(summary.berths.total > 0 && summary.berths.total <= analysis.berths.total);
  assert.ok(!summarizeTyphoonShelterWorks(bill.works, analysis, { pierConnected: false }).operational, 'no road, no shelter');
});

test('expanding a built shelter tears down the old line and builds the new one, for the difference', () => {
  const { f, plan, analysis } = setup();
  const built = completeTyphoonShelterWorks(reconcileTyphoonShelterWorks(createTyphoonShelterWorks(), layoutTyphoonShelterWorks(plan, analysis, f))).works;
  // two rows further out to sea (one row would leave 1-tile breakwater stubs at the sides)
  const bigger = fixture(BAY.concat(['~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~']).map((row, r) => (r === 7 || r === 8 ? '~~..........~~~~' : row)));
  const res = shelter.editTyphoonShelterBasin(plan, bigger.map, { r0: 7, c0: 2, r1: 8, c1: 11 }, 'add');
  assert.ok(res.plan, res.rejected);
  const a2 = shelter.analyzeTyphoonShelter(res.plan, bigger.map);
  assert.ok(a2.legal, JSON.stringify(a2.problems.map((p) => p.code)));
  const pending = reconcileTyphoonShelterWorks(built, layoutTyphoonShelterWorks(res.plan, a2, bigger));
  assert.ok(pending.items.some((i) => i.state === 'demolishing' && i.kind === 'breakwater' && i.row === 7), 'the old row-7 breakwater comes down');
  assert.ok(pending.items.some((i) => i.state === 'queued' && i.row === 9), 'the new row-9 breakwater goes up');
  const bill = completeTyphoonShelterWorks(pending);
  assert.ok(bill.removed > 0 && bill.built > 0);
  const fresh = completeTyphoonShelterWorks(reconcileTyphoonShelterWorks(createTyphoonShelterWorks(), layoutTyphoonShelterWorks(res.plan, a2, bigger)));
  assert.ok(bill.cost < fresh.cost, 'only the difference is charged');
  // the old line across the bay mouth is gone (the new side walls also reach row 7, at cols 1 and 12)
  assert.ok(!bill.works.items.some((i) => i.row === 7 && i.col >= 2 && i.col <= 11 && i.kind === 'breakwater'));
});

test('built works survive the save normaliser', () => {
  const { f, plan, analysis } = setup();
  const works = { ...completeTyphoonShelterWorks(reconcileTyphoonShelterWorks(createTyphoonShelterWorks(), layoutTyphoonShelterWorks(plan, analysis, f))).works, approved: true };
  const saved = JSON.parse(JSON.stringify({ shelters: [{ ...plan, status: 'built', works }], nextId: 2 }));
  const loaded = shelter.normalizeTyphoonShelterState(saved).shelters[0];
  assert.deepEqual(loaded.works.items, works.items);
  assert.equal(loaded.works.approved, true);
  assert.equal(loaded.status, 'built');
});

test('a beach pier may face the fairway when the fairway hugs the whole shore', () => {
  // a sandy shore with the road behind it; the fairway is made to run along every shore tile,
  // as it does on a diagonal coast between two entrances
  const f = fixture([
    '######R#########',
    '#bbbbbbbbbbbbbb#',
    '##..........####',
    '##..........####',
    '##..........####',
    '##..........####',
    '##..........####',
    '##..........####',
    '~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~',
  ]);
  const plan = { id: 'ts1', seed: 42, basin: shelter.encodeTyphoonShelterBasin(f.basin), entrances: [], reservePct: 20 };
  plan.entrances = shelter.suggestTyphoonShelterEntrances(plan, f.map);
  const analysis = shelter.analyzeTyphoonShelter(plan, f.map);
  analysis.shoreEdges.forEach((e) => analysis.channel.add(`${e.r}:${e.c}`));
  const pier = layoutTyphoonShelterWorks(plan, analysis, f).find((w) => w.kind === 'pier');
  assert.ok(pier, 'a pier on the beach');
  assert.equal(pier.row, 1, 'standing on the sand, clear of the fairway');
  // a pier out in the water would block the fairway: none
  assert.equal(layoutTyphoonShelterWorks(plan, analysis, { ...f, isFreeBeach: () => false }).filter((w) => w.kind === 'pier').length, 0);
});

test('海堤: a quay along every shore edge, corner fills, piers off the quay, keys that survive a save', () => {
  const { f, plan, analysis } = setup();
  const land = (r, c) => f.map.kind(r, c) === 'land';
  const ctx = { ...f, isFreeBeach: land, isQuaySite: land };
  const layout = layoutTyphoonShelterWorks(plan, analysis, ctx);
  const quays = layout.filter((w) => w.kind === 'quay');
  // one per edge where the basin meets land, on the land tile, its wall toward the water...
  const step = { n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] };
  const faces = (q) => `${q.row + step[q.facing][0]}:${q.col + step[q.facing][1]}`;
  const inner = quays.filter((q) => analysis.basin.has(faces(q)));
  assert.equal(inner.length, analysis.shoreEdges.filter((e) => land(...e.out)).length);
  quays.forEach((q) => assert.ok(land(q.row, q.col), q.key));
  // ...and on along the coast past the breakwater's ends, facing the open sea (the land either side
  // of the bay's mouth, row 6, looks south onto the sea beyond the breakwater)
  const outer = quays.filter((q) => !analysis.basin.has(faces(q)));
  assert.ok(outer.length > 0);
  outer.forEach((q) => {
    assert.ok(f.isOpenWater(...faces(q).split(':').map(Number)), `${q.key} faces open sea`);
    assert.ok(!analysis.ring.has(faces(q)), `${q.key} does not face the breakwater`);
  });
  assert.deepEqual(outer.map((q) => [q.row, q.facing]).sort(), [[6, 's'], [6, 's'], [6, 's'], [6, 's']]);
  assert.equal(new Set(layout.map((w) => w.key)).size, layout.length, 'keys are unique');
  // the bay's two inner corners (north-west and north-east) are filled on the diagonal land tile
  const fills = layout.filter((w) => w.kind === 'quayFill').map((w) => [w.row, w.col, w.corner]);
  assert.deepEqual(fills.sort(), [[0, 1, 'se'], [0, 12, 'sw']]);
  // the quay faces the shore: piers and landing stages stand in the water
  layout.filter((w) => w.kind === 'pier' || w.kind === 'floatingPier').forEach((w) => assert.ok(analysis.basin.has(`${w.row}:${w.col}`), w.key));
  // built, saved and loaded: nothing to build again
  const built = completeTyphoonShelterWorks(reconcileTyphoonShelterWorks(createTyphoonShelterWorks(), layout)).works;
  const loaded = works.normalizeTyphoonShelterWorks(JSON.parse(JSON.stringify({ ...built, approved: true })));
  assert.deepEqual(loaded.items.map((i) => i.key).sort(), built.items.map((i) => i.key).sort());
  const again = completeTyphoonShelterWorks(reconcileTyphoonShelterWorks(loaded, layout));
  assert.equal(again.cost, 0);
  assert.equal(again.built, 0);
});

test('against a quay, the pier may stand on a fairway that hugs the whole shore', () => {
  const { f, plan, analysis } = setup();
  analysis.shoreEdges.forEach((e) => analysis.channel.add(`${e.r}:${e.c}`));
  const land = (r, c) => f.map.kind(r, c) === 'land';
  const pier = layoutTyphoonShelterWorks(plan, analysis, { ...f, isFreeBeach: () => false, isQuaySite: land }).find((w) => w.kind === 'pier');
  assert.ok(pier && analysis.basin.has(`${pier.row}:${pier.col}`), 'a pier in the water at the quay');
  assert.equal(layoutTyphoonShelterWorks(plan, analysis, { ...f, isFreeBeach: () => false }).filter((w) => w.kind === 'pier').length, 0, 'not without one');
});

test('a beach by the shelter that faces no sea is paved over too, at no cost', () => {
  const { f, plan, analysis } = setup();
  const land = (r, c) => f.map.kind(r, c) === 'land';
  // (5, 0): land two tiles from the breakwater, with no water beside it
  const layout = layoutTyphoonShelterWorks(plan, analysis, { ...f, isQuaySite: land, isBeach: (r, c) => r === 5 && c === 0 });
  const paved = layout.filter((w) => w.kind === 'quayGround');
  assert.deepEqual(paved.map((w) => [w.row, w.col]), [[5, 0]]);
  assert.equal(TYPHOON_SHELTER_WORK_KINDS.quayGround.cost, 0);
  assert.equal(TYPHOON_SHELTER_WORK_KINDS.quayGround.objectId, null, 'drawn by the terrain, not a sprite');
  const built = completeTyphoonShelterWorks(reconcileTyphoonShelterWorks(createTyphoonShelterWorks(), layout)).works;
  const loaded = works.normalizeTyphoonShelterWorks(JSON.parse(JSON.stringify({ ...built, approved: true })));
  assert.ok(loaded.items.some((i) => i.kind === 'quayGround' && i.row === 5 && i.col === 0));
});

test('the promenade runs on past a breakwater that meets the shore, the breakwater against its wall', () => {
  // the bay's mouth wall (row 7) runs into land at both ends: the headlands reach down to row 7
  const f = fixture([
    '#############R##',
    '##..........##R#',
    '##..........####',
    '##..........####',
    '##..........####',
    '##..........####',
    '##..........####',
    '##~~~~~~~~~~####',
    '~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~',
  ]);
  const plan = { id: 'ts1', seed: 42, basin: shelter.encodeTyphoonShelterBasin(f.basin), entrances: [], reservePct: 20 };
  plan.entrances = shelter.suggestTyphoonShelterEntrances(plan, f.map);
  const analysis = shelter.analyzeTyphoonShelter(plan, f.map);
  const land = (r, c) => f.map.kind(r, c) === 'land';
  const layout = layoutTyphoonShelterWorks(plan, analysis, { ...f, isLand: land, isQuaySite: land });
  const quays = new Set(layout.filter((w) => w.kind === 'quay').map((w) => `${w.row}:${w.col}:${w.facing}`));
  const step = { n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] };
  const opposite = { n: 's', s: 'n', e: 'w', w: 'e' };
  let met = 0;
  analysis.ring.forEach((k) => {
    const [r, c] = k.split(':').map(Number);
    Object.entries(step).forEach(([d, [dr, dc]]) => {
      if (!land(r + dr, c + dc) || analysis.basin.has(`${r + dr}:${c + dc}`)) return;
      met += 1;
      assert.ok(quays.has(`${r + dr}:${c + dc}:${opposite[d]}`), `the shore at ${r + dr}:${c + dc} faces the breakwater at ${k}`);
    });
  });
  assert.ok(met >= 2, 'the wall meets the shore at both ends');
});
