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
  advanceTyphoonShelterWorks,
  summarizeTyphoonShelterWorks,
} = works;

function fixture(rows) {
  const grid = rows.map((row) => [...row]);
  const basin = new Set();
  grid.forEach((row, r) => row.forEach((ch, c) => { if (ch === '.') basin.add(`${r}:${c}`); }));
  const kinds = { '#': 'land', R: 'land', '~': 'water', '.': 'water' };
  const map = { width: grid[0].length, height: grid.length, kind: (r, c) => (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length ? null : kinds[grid[r][c]]) };
  const roads = [];
  grid.forEach((row, r) => row.forEach((ch, c) => { if (ch === 'R') roads.push([r, c]); }));
  const roadDistance = (r, c) => Math.min(Infinity, ...roads.map(([rr, cc]) => Math.abs(rr - r) + Math.abs(cc - c)));
  const isOpenWater = (r, c) => map.kind(r, c) === 'water' && !basin.has(`${r}:${c}`);
  return { map, basin, roadDistance, isOpenWater };
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
  assert.ok(of('mooringBuoy').length >= 3);
  layout.filter((w) => w.kind === 'mooringBuoy').forEach((w) => assert.ok(!analysis.channel.has(`${w.row}:${w.col}`)));
  // the same plan always lays out the same works
  assert.deepEqual(layoutTyphoonShelterWorks(plan, analysis, f), layout);
});

function run(worksState, days, { funds = Infinity, legal = true, month = '1900-1' } = {}) {
  let w = worksState;
  let money = funds;
  let spentTotal = 0;
  const blocked = [];
  for (let d = 0; d < days; d++) {
    const res = advanceTyphoonShelterWorks(w, {
      monthKey: typeof month === 'function' ? month(d) : month,
      legal,
      spend: (cost) => { if (cost > money) return false; money -= cost; spentTotal += cost; return true; },
    });
    w = res.works;
    if (res.blocked) blocked.push(res.blocked);
  }
  return { w, spentTotal, blocked };
}

test('nothing is built or paid until the plan is approved', () => {
  const { f, plan, analysis } = setup();
  const w = reconcileTyphoonShelterWorks(createTyphoonShelterWorks(1e6), layoutTyphoonShelterWorks(plan, analysis, f));
  const { spentTotal } = run(w, 30);
  assert.equal(spentTotal, 0);
});

test('works start one a day, three at a time, pier first, each paid exactly once', () => {
  const { f, plan, analysis } = setup();
  const layout = layoutTyphoonShelterWorks(plan, analysis, f);
  const w = { ...reconcileTyphoonShelterWorks(createTyphoonShelterWorks(1e6), layout), approved: true };
  const first = run(w, 1).w;
  assert.equal(first.items.find((i) => i.state === 'building').kind, 'pier');
  const after3 = run(w, 3).w;
  assert.equal(after3.items.filter((i) => i.state === 'building').length, 3);
  const done = run(w, 400);
  assert.ok(done.w.items.every((i) => i.state === 'done'));
  const expected = layout.reduce((sum, i) => sum + TYPHOON_SHELTER_WORK_KINDS[i.kind].cost, 0);
  assert.equal(done.spentTotal, expected, 'every work charged once');
  const summary = summarizeTyphoonShelterWorks(done.w, analysis, { pierConnected: true });
  assert.ok(summary.operational);
  assert.ok(summary.upkeep > 0);
  assert.ok(summary.berths.total > 0 && summary.berths.total < analysis.berths.total + 1);
  assert.ok(!summarizeTyphoonShelterWorks(done.w, analysis, { pierConnected: false }).operational, 'no road, no shelter');
});

test('the monthly quota and the treasury hold starts back', () => {
  const { f, plan, analysis } = setup();
  const w = { ...reconcileTyphoonShelterWorks(createTyphoonShelterWorks(4000), layoutTyphoonShelterWorks(plan, analysis, f)), approved: true };
  const capped = run(w, 20);
  assert.ok(capped.spentTotal <= 4000);
  assert.ok(capped.blocked.includes('quota'));
  // a new month frees the quota again
  const twoMonths = run(w, 40, { month: (d) => (d < 20 ? '1900-1' : '1900-2') });
  assert.ok(twoMonths.spentTotal > 4000 && twoMonths.spentTotal <= 8000);
  const broke = run({ ...w, quota: 1e6 }, 10, { funds: 1000 });
  assert.equal(broke.spentTotal, 0);
  assert.ok(broke.blocked.includes('funds'));
  const illegal = run({ ...w, quota: 1e6 }, 10, { legal: false });
  assert.equal(illegal.spentTotal, 0);
});

test('expanding after construction tears down the old line and builds the new one', () => {
  const { f, plan, analysis } = setup();
  const built = run({ ...reconcileTyphoonShelterWorks(createTyphoonShelterWorks(1e6), layoutTyphoonShelterWorks(plan, analysis, f)), approved: true }, 400).w;
  // two rows further out to sea (one row would leave 1-tile breakwater stubs at the sides)
  const bigger = fixture(BAY.concat(['~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~']).map((row, r) => (r === 7 || r === 8 ? '~~..........~~~~' : row)));
  const res = shelter.editTyphoonShelterBasin(plan, bigger.map, { r0: 7, c0: 2, r1: 8, c1: 11 }, 'add');
  assert.ok(res.plan, res.rejected);
  const a2 = shelter.analyzeTyphoonShelter(res.plan, bigger.map);
  assert.ok(a2.legal, JSON.stringify(a2.problems.map((p) => p.code)));
  const w2 = reconcileTyphoonShelterWorks(built, layoutTyphoonShelterWorks(res.plan, a2, bigger));
  const old = w2.items.filter((i) => i.state === 'demolishing');
  assert.ok(old.some((i) => i.kind === 'breakwater' && i.row === 7), 'the old row-7 breakwater comes down');
  assert.ok(w2.items.some((i) => i.state === 'queued' && i.row === 9), 'the new row-9 breakwater is queued');
  const finished = run(w2, 400, { legal: a2.legal });
  assert.ok(finished.w.items.every((i) => i.state === 'done'));
  // the old line across the bay mouth is gone (the new side walls also reach row 7, at cols 1 and 12)
  assert.ok(!finished.w.items.some((i) => i.row === 7 && i.col >= 2 && i.col <= 11 && i.kind === 'breakwater'));
});

test('works survive the save normaliser', () => {
  const { f, plan, analysis } = setup();
  const w = run({ ...reconcileTyphoonShelterWorks(createTyphoonShelterWorks(1e6), layoutTyphoonShelterWorks(plan, analysis, f)), approved: true }, 5).w;
  const saved = JSON.parse(JSON.stringify({ shelters: [{ ...plan, works: w }], nextId: 2 }));
  const loaded = shelter.normalizeTyphoonShelterState(saved).shelters[0].works;
  assert.deepEqual(loaded.items, w.items);
  assert.equal(loaded.approved, true);
});
