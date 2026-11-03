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
