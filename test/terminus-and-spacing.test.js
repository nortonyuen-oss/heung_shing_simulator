// Norton, 2026-11-28: 巴士行走時都疊在一起了 / 所有交通都唔好疊埋一齊 / 車與車之間留少少空隙 /
// 停站時車身請與站頭保持平行…停完之後再行前少少掉頭 / 輕鐵係兩卡一卡一邊站…唔要咁 / 條橋穿模.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const tram = require('../tram.js');
Object.assign(global, tram);
const lines = require('../tram-lines.js');
global.tramRoutePointAt = lines.tramRoutePointAt;
const lrt = require('../light-rail-lines.js');

const ROOT = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const span = (r0, c0, r1, c1) => { const s = new Set(); for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) s.add(`${r}:${c}`); return s; };
const straightLine = (turnBack) => {
  const tiles = span(2, 5, 12, 5);
  const plan = tram.planTramTrack({ row: 12, col: 5 }, { row: 2, col: 5 }, {}, (r, c) => tiles.has(`${r}:${c}`));
  const tracks = {};
  plan.adds.forEach(({ row, col, bit }) => { const k = `${row}:${col}`; tracks[k] = (tracks[k] || 0) | bit; });
  const stop = (row, col) => ({ row, col, axis: 'ns', band: false });
  return lines.buildTramLineRoute(tram.buildTramTrackGeometry(tracks), [stop(10, 5), stop(4, 5)], { turnBack });
};

test('every vehicle keeps its length and a gap behind the one in front', () => {
  const visuals = source('traffic-visuals.js');
  const models = [...visuals.matchAll(/id: '([^']+)'[^\n]*\n\s*scale: [0-9.]+, weight: [0-9.]+, speedFactor: [0-9.]+, headwayFactor: ([0-9.]+), lengthTiles: ([0-9.]+),/g)];
  assert.ok(models.length >= 18, 'every ambient model has its drawn length');
  models.forEach(([, id, factor, length]) => {
    assert.ok(Number(factor) * 0.65 >= Number(length) + 0.15 - 0.006, `${id}: ${factor} x 0.65 is its length ${length} and a gap`);
  });
  assert.match(visuals, /const TRAFFIC_FOLLOW_GAP_TILES = 0\.15;/);
  // the junction kept clear, vehicles parting at a junction, and round a corner by the straight line
  assert.match(visuals, /function trafficJunctionOccupiedAcross\(/);
  assert.match(visuals, /One that left the same tile just ahead of it by another way/);
  assert.match(visuals, /Math\.hypot\(ar - br, ac - bc\) < trafficHeadwayFor\(vehicle, leader\) \+ margin/);
  // a turn back pulls forward from along the way it came, as a cubic
  assert.match(visuals, /if \(turn === 'uturn'\) \{[\s\S]*?cubic: true,[\s\S]*?control1: pulled\(start\)/);
});

test('buses of one route keep apart, wait for the traffic in front, and leave a passthrough stop', () => {
  const transport = source('transport-expansion.js');
  assert.match(transport, /const TRANSPORT_BUS_MIN_GAP_TILES = 1\.25;/);
  assert.match(transport, /function getTransportRouteGapAhead\(/);
  assert.match(transport, /function getTransportTrafficAheadLimit\(/);
  assert.match(transport, /const TRANSPORT_TRAFFIC_PATIENCE_MINUTES = 3;/);
  // (it stood at 26.9999999 and found the stop it was at again, for ever)
  assert.match(transport, /Math\.floor\(fromTiles \+ 1e-6\) \+ 1/);
  const visuals = source('transport-visuals.js');
  assert.match(visuals, /and one already on the tile this leg ends at \(not oncoming\)/);
});

test('a tram stands along its track at a terminus, then pulls forward and swings round onto the other', () => {
  const route = straightLine('uturn');
  assert.equal(route.code, undefined);
  assert.deepEqual(route.folds, [], 'it never goes back on itself');
  const end = route.calls[1].at;
  // standing at the far stop: along the track (north), not across it
  const at = lines.tramRoutePointAt(route, end);
  assert.ok(Math.abs(at.heading[1]) > 0.95 && at.heading[1] < 0, JSON.stringify(at.heading));
  // a little after: further north than the stop (pulled forward), then heading south on the other track
  const pulled = Math.min(...route.pts.map(([, y]) => y));
  assert.ok(pulled < route.pts[route.calls.length ? route.pts.findIndex((p, i) => route.cum[i] >= end) : 0][1] - 0.2, 'pulls forward past the stop');
  const later = lines.tramRoutePointAt(route, end + 1.5);
  assert.ok(later.heading[1] > 0.9, 'then back the other way');
  assert.ok(later.pos[0] > 5.5, 'on the east track');
});

test("a light rail set reverses at a terminus with both cars on the track it came in on", () => {
  const route = straightLine('reverse');
  assert.equal(route.folds.length, 2, 'it folds back at each end');
  const fold = route.folds.find((f) => f.index > 0);
  const v = { dist: fold.at, cars: 2 };
  const front = lrt.lrtCarPointAt(route, v, 0);
  const back = lrt.lrtCarPointAt(route, v, 1);
  // both on the west track, one each side of the stop, along the track
  assert.ok(Math.abs(front.pos[0] - back.pos[0]) < 0.01, `same track: ${front.pos} / ${back.pos}`);
  assert.ok(front.pos[1] < back.pos[1], 'the front car past the stop, northward');
  assert.ok(Math.abs(front.heading[1]) > 0.95);
  // just after it reverses: still one line, the other way
  const after = { dist: fold.at + 0.1, cars: 2 };
  const a0 = lrt.lrtCarPointAt(route, after, 0), a1 = lrt.lrtCarPointAt(route, after, 1);
  assert.ok(a1.heading[1] < -0.95 || a1.heading[1] > 0.95);
  assert.ok(Math.hypot(a0.pos[0] - a1.pos[0], a0.pos[1] - a1.pos[1]) > 0.7, 'not side by side');
});

test('bridges and tunnels carry the traffic between their ends; nothing at ground level on a high bridge; anchorages sort by the tiles they span', () => {
  const infra = source('sim-infrastructure.js');
  assert.match(infra, /function getTrafficThroughChains\(/);
  assert.match(infra, /applyTrafficThroughChains\(roadTiles\);/);
  assert.match(infra, /trafficThroughChainsCache = null;/);
  assert.match(source('street-furniture.js'), /filter\(\(placement\) => !onHighBridge\(placement\)\)/);
  assert.match(source('pedestrian-railings.js'), /filter\(\(p\) => !\(typeof isHighBridgeTile === 'function' && isHighBridgeTile\(p\.row, p\.col\)\)\)/);
  assert.match(source('road-flyovers.js'), /Math\.min\(\.\.\.spanned\) - own \+ HIGH_BRIDGE_DEPTH\.towerFarLow/);
});
