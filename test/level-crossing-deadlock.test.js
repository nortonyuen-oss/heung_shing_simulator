// Norton, 2026-11-28: 系統有平交道之後，有陣時路口比較複雜，啲車會卡住. A car waiting at a 輕鐵
// crossing's red had its middle a hair into the crossing's tile and counted as on the track: the set
// waited for it, the light stayed red for the set, the car waited for the light - for good.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const tram = require('../tram.js');
Object.assign(global, tram);
const lines = require('../tram-lines.js');
global.tramRoutePointAt = lines.tramRoutePointAt;
const lrt = require('../light-rail-lines.js');

const crossing = new Set(['5:6']);
const going = (progress, lengthTiles) => ({ current: { row: 5, col: 5 }, next: { row: 5, col: 6 }, progress, model: { lengthTiles } });
const leaving = (progress, lengthTiles) => ({ current: { row: 5, col: 6 }, next: { row: 5, col: 7 }, progress, model: { lengthTiles } });

test('a vehicle waiting at a crossing\'s stop line is not on the track; one going over it, or still clearing it, is', () => {
  // at the red: a car's middle at 0.52 (lightRailCrossingStopProgress), a bus's at 0.27
  assert.equal(lrt.lrtVehicleOnCrossing(going(0.52, 0.22), crossing), null, 'a car at its stop line');
  assert.equal(lrt.lrtVehicleOnCrossing(going(0.27, 0.76), crossing), null, 'a bus at its stop line');
  assert.equal(lrt.lrtVehicleOnCrossing(going(0.65, 0.22), crossing), '5:6', 'a car going over');
  assert.equal(lrt.lrtVehicleOnCrossing(leaving(0.3, 0.76), crossing), '5:6', 'a bus whose tail is still over the track');
  assert.equal(lrt.lrtVehicleOnCrossing(leaving(0.8, 0.76), crossing), null, 'clear of it');
  assert.equal(lrt.lrtVehicleOnCrossing({ ...going(0.9, 0.22), next: { row: 5, col: 6, layer: 'deck' } }, crossing), null, 'up on a 天橋 deck');
});

test('traffic keeps a crossing clear: it holds at the stop line without room beyond the track', () => {
  const visuals = fs.readFileSync(path.join(__dirname, '..', 'traffic-visuals.js'), 'utf8');
  assert.match(visuals, /function getTrafficCrossingKeepClearHold\(scene, vehicle, leaderBuckets\)/);
  assert.match(visuals, /const hold = getTrafficCrossingKeepClearHold\(scene, vehicle, leaderBuckets\);/);
  const fleet = fs.readFileSync(path.join(__dirname, '..', 'light-rail-lines.js'), 'utf8');
  assert.match(fleet, /const k = lrtVehicleOnCrossing\(o, crossings\);/);
  assert.doesNotMatch(fleet, /occupied\.add\(k\); \}\);\n/, 'not by the tile its middle is in');
});
