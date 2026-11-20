'use strict';

// 貨櫃貨運 (docs/campaign-p4-design.md §4.1): container ports carry what the industry and the
// districts beyond send, up to their berths; the trucks take the cheapest road, and roads with
// homes beside them cost more.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const freight = require('../port-freight.js');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');
const T = freight.PORT_FREIGHT_TUNING;

// A 40x40 grid: a road along row 10 from the port gate (col 2) east to col 30, a factory south
// of its far end, and optionally homes along the middle of it and a bypass along row 14.
function grid({ homes = false, bypass = false, edgeRoad = false } = {}) {
  const roads = new Set();
  const key = (r, c) => `${r}:${c}`;
  for (let c = 2; c <= 30; c++) roads.add(key(10, c));
  if (bypass) {
    for (let r = 10; r <= 14; r++) { roads.add(key(r, 8)); roads.add(key(r, 24)); }
    for (let c = 8; c <= 24; c++) roads.add(key(14, c));
  }
  if (edgeRoad) for (let c = 30; c < 40; c++) roads.add(key(10, c));
  const homeRoads = (r, c) => homes && r === 10 && c >= 10 && c <= 22;
  return {
    width: 40, height: 40,
    isRoad: (r, c) => roads.has(key(r, c)),
    hasHomesBeside: homeRoads,
    // the port is a 4x4 lot just north of the road's west end; its gate is (10, 2..5)
    ports: [{ id: '6:2', row: 6, col: 2, rows: 4, cols: 4 }],
    industries: [{ row: 11, col: 29, rows: 2, cols: 2, jobs: 2000 }],
    connections: edgeRoad ? [{ row: 10, col: 39, lanes: 2 }] : [],
  };
}

test('port freight: a port carries its industry\'s cargo up to its berths, and pays dues and jobs', () => {
  const s = freight.computePortFreightState(grid());
  assert.equal(s.ports.length, 1);
  assert.ok(s.ports[0].roadConnected);
  assert.equal(s.local, 2000 * T.teuPerIndustrialJob);
  assert.equal(s.transit, 0);
  assert.equal(s.teu, Math.min(T.berthTeu, 2000 * T.teuPerIndustrialJob));
  assert.equal(s.trucks, s.teu * T.trucksPerTeu);
  assert.equal(s.dues, Math.round(s.teu * T.duesPerTeu));
  assert.equal(s.jobs, Math.round(s.teu / 1000 * T.jobsPerThousandTeu));
  // the trucks are on every tile between the factory and the gate, and nowhere else
  for (let c = 5; c <= 29; c++) assert.ok(s.tiles.get(10 * 40 + c) > 0, `truck on 10,${c}`);
  assert.ok(!s.tiles.has(10 * 40 + 30));
  assert.equal(s.residentialShare, 0);
});

test('port freight: an edge road brings through cargo; berths cap the total', () => {
  const s = freight.computePortFreightState({ ...grid({ edgeRoad: true }), industries: [{ row: 11, col: 29, rows: 2, cols: 2, jobs: 20000 }] });
  assert.equal(s.source, 20000 * T.teuPerIndustrialJob + 2 * T.transhipmentPerLane);
  assert.equal(s.teu, T.berthTeu, 'berths full');
  assert.ok(s.transit > 0 && s.local > 0);
  assert.ok(Math.abs(s.local + s.transit - T.berthTeu) <= 1, 'the cut falls on both');
});

test('port freight: trucks go round the housing when a way exists, and the city minds the ones that do not', () => {
  const through = freight.computePortFreightState(grid({ homes: true }));
  assert.ok(through.residentialShare > 0.3, `${through.residentialShare}`);
  const round = freight.computePortFreightState(grid({ homes: true, bypass: true }));
  assert.equal(round.teu, through.teu);
  assert.equal(round.residentialShare, 0, 'the bypass carries them');
  assert.ok(freight.getPortFreightHappinessPenalty(through) > 0);
  assert.equal(freight.getPortFreightHappinessPenalty(round), 0);
  assert.ok(freight.getPortFreightHappinessPenalty(through) <= T.maxHappinessPenalty);
});

test('port freight: no road at the gate, no cargo; no port, nothing', () => {
  const g = grid();
  const cut = freight.computePortFreightState({ ...g, isRoad: (r, c) => g.isRoad(r, c) && !(r === 10 && c <= 5) });
  assert.equal(cut.ports[0].roadConnected, false);
  assert.equal(cut.teu, 0);
  assert.equal(cut.trucks, 0);
  const none = freight.computePortFreightState({ ...g, ports: [] });
  assert.equal(none.teu, 0);
  assert.equal(freight.getPortFreightHappinessPenalty(none), 0);
  const abandoned = freight.computePortFreightState({ ...g, ports: [{ ...g.ports[0], active: false }] });
  assert.equal(abandoned.teu, 0);
});

test('port freight: two ports split the cargo by which gate is nearer', () => {
  const g = grid({ edgeRoad: true });
  const s = freight.computePortFreightState({ ...g, ports: [...g.ports, { id: '6:31', row: 6, col: 31, rows: 4, cols: 4 }] });
  const [west, east] = s.ports;
  assert.equal(west.source, 0, 'the factory and the edge road are nearer the east port');
  assert.ok(east.teu > 0);
});

test('port freight history: kept to a year and cleaned', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ monthIndex: i, teu: i * 10, residentialShare: 2 }));
  const out = freight.normalizePortFreightHistory(rows);
  assert.equal(out.length, T.historyMonths);
  assert.equal(out.at(-1).teu, 190);
  assert.equal(out.at(-1).residentialShare, 1);
  assert.deepEqual(freight.normalizePortFreightHistory('junk'), []);
});

test('port freight in the game: loaded, its jobs, dues, traffic, happiness, trucks and panel are wired', () => {
  const html = source('index.html');
  assert.ok(html.indexOf('src="region-connections.js"') < html.indexOf('src="port-freight.js"'));
  assert.ok(html.indexOf('src="port-freight.js"') < html.indexOf('src="inspect-panel.js"'));
  assert.match(source('simulation.js'), /regularIndJobCap \+= portFreight\?\.jobs/);
  assert.match(source('simulation.js'), /- portTruckPenalty/);
  assert.match(source('sim-infrastructure.js'), /addPortFreightTrafficLoad\(/);
  assert.match(source('city-state.js'), /revenue \+= getPortFreightMonthlyDues\(\)/);
  assert.match(source('city-state.js'), /city\.portFreightHistory = \[\]/);
  assert.match(source('traffic-visuals.js'), /chooseTrafficModelForSpawn\(scene, random, road\)/);
  assert.match(source('inspect-panel.js'), /buildContainerPortInspectHtml/);
  assert.match(source('campaign.js'), /portThroughput: Number\(city\.portFreight\?\.teu\)/);
  const i18n = source('i18n.js');
  ['port.throughput', 'port.sources', 'port.full', 'port.noTransit', 'port.trucks', 'port.dues', 'port.noRoad', 'port.showRoutes']
    .forEach((key) => assert.equal(i18n.split(`'${key}':`).length - 1, 3, `${key} in three languages`));
});
