const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function loadMetro() {
  return new Function(`
    ${read('metro.js')}
    return { METRO, metroLineSchedule, metroTrainPointAt, metroArrivalsAt, metroCall, metroTunnelBetween,
      whyNotMetroStationAt, normalizeMetroState, isMetroRunning };
  `)();
}

test('a line runs out to its last station and back, a minute at each', () => {
  const { METRO, metroLineSchedule } = loadMetro();
  const s = metroLineSchedule([{ row: 0, col: 0 }, { row: 0, col: 40 }, { row: 30, col: 40 }]);
  assert.deepEqual(s.legs.map((l) => [l.fromIndex, l.toIndex]), [[0, 1], [1, 2], [2, 1], [1, 0]]);
  assert.equal(s.cycle, 4 * METRO.dwellMinutes + (40 + 30 + 30 + 40) / METRO.speedTilesPerMinute);
});

test('a train is at the station for the dwell, then runs straight to the next', () => {
  const { METRO, metroLineSchedule, metroTrainPointAt } = loadMetro();
  const s = metroLineSchedule([{ row: 0, col: 0 }, { row: 0, col: 40 }]);
  assert.equal(metroTrainPointAt(s, 0.5).state, 'atStation');
  const halfway = metroTrainPointAt(s, METRO.dwellMinutes + 20 / METRO.speedTilesPerMinute);
  assert.equal(halfway.state, 'running');
  assert.equal(halfway.c, 20);
  // a second train half a round trip ahead is at the far end then
  assert.equal(metroTrainPointAt(s, 0.5, 0.5).station, 1);
});

test('calls at stations come in time order, one per leg per round trip', () => {
  const { metroLineSchedule, metroArrivalsAt } = loadMetro();
  const s = metroLineSchedule([{ row: 0, col: 0 }, { row: 0, col: 40 }, { row: 0, col: 80 }]);
  const calls = metroArrivalsAt(s, -0.001, s.cycle - 0.001, [0]);
  assert.deepEqual(calls.map((c) => c.leg), [0, 1, 2, 3]);
  assert.ok(calls.every((c, i) => i === 0 || c.t >= calls[i - 1].t));
  assert.equal(metroArrivalsAt(s, 0, s.cycle * 3, [0, 0.5]).length, 4 * 2 * 3);
});

test('fares by distance: everyone off at the end of the line, the queue on the way it leaves', () => {
  const { METRO, metroCall } = loadMetro();
  const end = metroCall({ aboard: 1000, waiting: 300, rodeTiles: 50, arrivingAhead: 1, share: 1 });
  assert.equal(end.alighting, 1000, 'the terminus empties the train');
  assert.equal(end.boarding, 300);
  assert.equal(end.revenue, 1000 * 50 * METRO.farePerTile + 300 * METRO.fareBase);
  const middle = metroCall({ aboard: 900, waiting: 1000, rodeTiles: 20, arrivingAhead: 3, share: 0.5 });
  assert.equal(middle.alighting, 300, 'a third get off with three stations ahead');
  assert.equal(middle.boarding, 500, 'half the queue goes this way');
  const full = metroCall({ aboard: METRO.trainCapacity, waiting: 5000, rodeTiles: 10, arrivingAhead: 4, share: 1 });
  assert.equal(METRO.trainCapacity - full.alighting + full.boarding, METRO.trainCapacity, 'no more than the train holds');
});

test('a tunnel under the sea costs more than under the land', () => {
  const { METRO, metroTunnelBetween } = loadMetro();
  const land = metroTunnelBetween({ row: 0, col: 0 }, { row: 0, col: 20 }, () => false);
  const sea = metroTunnelBetween({ row: 0, col: 0 }, { row: 0, col: 20 }, (r, c) => c >= 5 && c < 15);
  assert.equal(land.length, 20);
  assert.equal(land.cost, 19 * METRO.tunnelCostPerLandTile);
  assert.equal(sea.sea, 10);
  assert.ok(sea.cost > land.cost);
});

test('a station needs open ground with a road beside it, and faces the road', () => {
  const { whyNotMetroStationAt } = loadMetro();
  const roads = new Set(['10,11']);
  const ctx = {
    isInside: (r, c) => r >= 0 && c >= 0 && r < 64 && c < 64,
    isOpenGround: (r, c) => !roads.has(`${r},${c}`) && !(r === 20 && c === 20),
    isRoad: (r, c) => roads.has(`${r},${c}`),
  };
  assert.deepEqual(whyNotMetroStationAt(10, 10, ctx), { facing: 'e' });
  assert.equal(whyNotMetroStationAt(30, 30, ctx).code, 'noRoad');
  assert.equal(whyNotMetroStationAt(20, 20, ctx).code, 'ground');
  assert.equal(whyNotMetroStationAt(-1, 3, ctx).code, 'outside');
});

test('saved metro state is kept to what makes sense', () => {
  const { normalizeMetroState } = loadMetro();
  const state = normalizeMetroState({
    stations: [{ id: 'station-1', row: 5, col: 6, facing: 'n' }, { id: 'station-2', row: 9, col: 9 }, { row: 1 }],
    lines: [{ id: 'line-1', stationIds: ['station-1', 'station-2', 'gone'] }, { id: 'line-2', stationIds: ['station-1'] }],
    trains: [{ id: 'train-4', lineId: 'line-1', phase: 1.25 }, { id: 'train-5', lineId: 'nowhere' }],
    unlocked: true,
  });
  assert.equal(state.stations.length, 2);
  assert.equal(state.stations[1].facing, 's');
  assert.deepEqual(state.lines.map((l) => l.stationIds), [['station-1', 'station-2']]);
  assert.equal(state.trains.length, 1);
  assert.equal(state.trains[0].phase, 0.25);
  assert.equal(state.nextTrainId, 5);
  assert.ok(state.unlocked);
});

test('trains run from six in the morning to one at night', () => {
  const { isMetroRunning } = loadMetro();
  assert.ok(isMetroRunning(6 * 60));
  assert.ok(isMetroRunning(23 * 60 + 59));
  assert.ok(isMetroRunning(30));
  assert.ok(!isMetroRunning(3 * 60));
});

test('the metro spends the government grant first, the company cash for the rest, nothing when short', () => {
  const company = { cash: 1000 };
  const metro = new Function('company', `
    const getTransportExpansionState = () => ({ company, metro: state });
    const spendTransportConstruction = (n) => { if (company.cash < n) return false; company.cash -= n; return true; };
    ${read('metro.js')}
    const state = normalizeMetroState({ grantBalance: 5000 });
    return { state, spendMetroFunds, grantMetroFunding };
  `)(company);
  assert.ok(metro.spendMetroFunds(3000));
  assert.equal(metro.state.grantBalance, 2000, 'from the grant');
  assert.equal(company.cash, 1000);
  assert.ok(metro.spendMetroFunds(2500));
  assert.equal(metro.state.grantBalance, 0);
  assert.equal(company.cash, 500, 'the rest from the company');
  assert.ok(!metro.spendMetroFunds(600), 'not enough between them');
  assert.equal(company.cash, 500, 'and nothing spent');
  metro.grantMetroFunding(40000);
  assert.equal(metro.state.grantBalance, 40000);
});

// ── 第二期 (docs/metro-phase2-design.md) ───────────────────────────────────────

function loadMetroPhase2() {
  return new Function(`
    ${read('metro.js')}
    return { METRO, normalizeMetroState, metroStationReach, metroNetworkBoost, metroTransferSplit, metroCall, metroPropertyIncome };
  `)();
}

test('a phase-1 save: the station queue goes to its line, nothing kept for lines that are gone', () => {
  const { normalizeMetroState } = loadMetroPhase2();
  const state = normalizeMetroState({
    stations: [
      { id: 'a', row: 0, col: 0, waiting: 120 },
      { id: 'b', row: 0, col: 9, waitingByLine: { 'line-1': 40, gone: 9 }, transferByLine: { 'line-1': 90 } },
    ],
    lines: [{ id: 'line-1', stationIds: ['a', 'b'] }],
  });
  assert.deepEqual(state.stations[0].waitingByLine, { 'line-1': 120 });
  assert.equal('waiting' in state.stations[0], false);
  assert.deepEqual(state.stations[1].waitingByLine, { 'line-1': 40 });
  assert.equal(state.stations[1].transferByLine['line-1'], 40, 'no more changing than waiting');
  assert.equal(state.stations[0].servedMonths, 0);
  assert.equal(state.lastPropertyIncome, 0);
});

test('the network: what a station reaches, and half as many riders again where it reaches twice as far', () => {
  const { metroStationReach, metroNetworkBoost } = loadMetroPhase2();
  const lines = [
    { id: 'A', stationIds: ['a', 'b', 'c'], status: 'active' },
    { id: 'B', stationIds: ['c', 'd', 'e', 'f'], status: 'active' },
    { id: 'C', stationIds: ['x', 'y'], status: 'suspended' },
  ];
  const a = metroStationReach('a', lines);
  assert.deepEqual([a.own, a.network], [2, 5]);
  assert.equal(metroNetworkBoost(a), 1.5, 'reaches more than twice its own line: the most');
  const c = metroStationReach('c', lines);
  assert.deepEqual([...c.byLine], [['A', 2], ['B', 3]]);
  assert.equal(metroNetworkBoost(c), 1 + 0.5 * (2 / 3));
  assert.equal(metroNetworkBoost(metroStationReach('x', lines)), 1, 'a suspended line reaches nowhere');
  assert.equal(metroNetworkBoost(metroStationReach('a', [lines[0]])), 1, 'one line alone: no more');
});

test('at a 轉車站 a share of those off change line, by what the other lines reach', () => {
  const { metroTransferSplit } = loadMetroPhase2();
  const lines = [
    { id: 'A', stationIds: ['a', 'b', 'c'], status: 'active' },
    { id: 'B', stationIds: ['c', 'd', 'e', 'f'], status: 'active' },
    { id: 'C', stationIds: ['c', 'g'], status: 'active' },
  ];
  const fromA = metroTransferSplit('c', 'A', lines);
  assert.equal(fromA.share, 4 / (4 + 2), 'd, e, f and g past A\'s own a and b');
  assert.deepEqual(fromA.to, [['B', 3 / 4], ['C', 1 / 4]]);
  assert.equal(metroTransferSplit('b', 'A', lines).share, 0, 'no other line at b');
});

test('those changing line pay by the tile but not to board again', () => {
  const { METRO, metroCall } = loadMetroPhase2();
  const call = metroCall({ aboard: 0, waiting: 200, rodeTiles: 0, arrivingAhead: 2, share: 1, transferShare: 0.25 });
  assert.equal(call.boarding, 200);
  assert.equal(call.revenue, 150 * METRO.fareBase);
});

test('鐵路加物業: a share of the rise in land value round a station, counted once, rising over a year, capped', () => {
  const { METRO, metroPropertyIncome } = loadMetroPhase2();
  const station = { id: 's', row: 0, col: 0, quality: 1, ramp: 1 };
  const home = { row: 0, col: 0, level: 2, tiles: 4 };
  const full = 1 * 1 * METRO.landValueBonusMax * 2 * 4 * METRO.propertyRatePerTile;
  assert.equal(metroPropertyIncome([station], [home]).get('s'), Math.round(full));
  assert.equal(metroPropertyIncome([{ ...station, ramp: 0.5 }], [home]).get('s'), Math.round(full / 2), 'half way into its first year');
  const near = { id: 'near', row: 0, col: 1, quality: 1, ramp: 1 };
  const both = metroPropertyIncome([{ ...station, quality: 0.5 }, near], [home]);
  assert.equal(both.get('s'), undefined, 'the building counts once, for the station that raises it most');
  assert.ok(both.get('near') > 0);
  assert.equal(metroPropertyIncome([station], [{ row: 0, col: METRO.catchmentRadius + 1, level: 3, tiles: 9 }]).size, 0, 'out of reach');
  assert.equal(metroPropertyIncome([{ ...station, quality: 0 }], [home]).size, 0, 'no trains, no rise');
  const crowd = Array.from({ length: 500 }, () => ({ ...home, level: 3, tiles: 9 }));
  assert.equal(metroPropertyIncome([station], crowd).get('s'), METRO.propertyStationCap);
});

test('drawing lines: through another line\'s station makes a 轉車站; a line never calls twice', () => {
  const toasts = [];
  const metro = new Function('toasts', `
    const company = { cash: 1e6 };
    let state;
    const getTransportExpansionState = () => ({ company, metro: state });
    const spendTransportConstruction = (n) => { company.cash -= n; return true; };
    const showToast = (text, kind) => toasts.push([kind, text]);
    const isInsideMap = () => true;
    const WATER = 2;
    const mapData = Array.from({ length: 64 }, () => new Array(64).fill(0));
    ${read('metro.js')}
    state = normalizeMetroState({ stations: ['s1', 's2', 's3', 's4'].map((id, i) => ({ id, name: id, row: 10, col: 10 + i * 8 })), unlocked: true });
    return { state, click: (col) => handleMetroLineClick(null, 10, col), draft: (d) => { metroLineDraft = d; }, getMetroStationLines };
  `)(toasts);
  [10, 18, 26, 26].forEach((col) => metro.click(col));   // A: s1 s2 s3, done
  assert.deepEqual(metro.state.lines.map((l) => l.stationIds), [['s1', 's2', 's3']]);
  metro.click(18);                                         // the middle of A: a new line from s2
  metro.click(34);                                         // B: s2 s4
  assert.deepEqual(metro.state.lines[1].stationIds, ['s2', 's4']);
  assert.equal(metro.getMetroStationLines(metro.state.stations[1], metro.state).length, 2, 's2 is a 轉車站');
  metro.click(26);                                         // B on to s3, A's end: another 轉車站
  assert.deepEqual(metro.state.lines[1].stationIds, ['s2', 's4', 's3']);
  assert.ok(toasts.some(([, text]) => text.includes('轉車站')));
  const before = metro.state.lines[1].stationIds.length;
  metro.click(18);                                         // back to s2: B calls there already
  assert.equal(metro.state.lines[1].stationIds.length, before);
  assert.equal(toasts.at(-1)[0], 'warning');
  metro.click(26);                                         // done
  metro.draft({ forceNew: true });                         // 新增地鐵綫, then A's end
  metro.click(10);
  metro.click(34);
  assert.deepEqual(metro.state.lines.map((l) => l.stationIds.length), [3, 3, 2], 'a third line, not A carried on');
});

test('a big city\'s stations: riders past the knee grow slowly; the land round them is worth more', () => {
  const { METRO, metroRidershipFactor, metroPropertyCityScale, metroPropertyIncome } = new Function(`
    ${read('metro.js')}
    return { METRO, metroRidershipFactor, metroPropertyCityScale, metroPropertyIncome };
  `)();
  const knee = METRO.ridershipKneePerDay;
  assert.equal(metroRidershipFactor(knee * 0.8), 1, 'a small city\'s station as it was');
  const big = knee * 14;
  assert.ok(big * metroRidershipFactor(big) > knee, 'more still ride from the busier station');
  assert.ok(big * metroRidershipFactor(big) < knee * 1.5, 'but not fourteen times as many');
  assert.equal(metroPropertyCityScale(20000), 1);
  assert.equal(metroPropertyCityScale(METRO.propertyCityScaleFrom * 4), 2);
  assert.equal(metroPropertyCityScale(5e6), METRO.propertyCityScaleMax);
  const station = { id: 's', row: 0, col: 0, quality: 1, ramp: 1 };
  const home = { row: 0, col: 0, level: 2, tiles: 4 };
  assert.equal(metroPropertyIncome([station], [home], 2).get('s'), 2 * metroPropertyIncome([station], [home]).get('s'));
  const crowd = Array.from({ length: 500 }, () => ({ ...home, level: 3, tiles: 9 }));
  assert.equal(metroPropertyIncome([station], crowd, 2).get('s'), METRO.propertyStationCap * 2, 'the cap grows with it');
});
