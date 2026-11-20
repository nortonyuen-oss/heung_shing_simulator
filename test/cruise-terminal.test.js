'use strict';

// 郵輪碼頭 (docs/campaign-p4-design.md §4.2, §11): a terminal on the shore, its calls by the tourism
// appeal, the passengers into town by the transport within reach, the call-day traffic, and the art
// turned to the sea.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cruise = require('../cruise-terminal.js');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');
const T = cruise.CRUISE_TUNING;

test('cruise: 2-6 calls a month by the tourism appeal', () => {
  assert.equal(cruise.getCruiseCallsForAppeal(0), 2);
  assert.equal(cruise.getCruiseCallsForAppeal(T.appealForMin), 2);
  assert.equal(cruise.getCruiseCallsForAppeal(55), 4);
  assert.equal(cruise.getCruiseCallsForAppeal(T.appealForMax), 6);
  assert.equal(cruise.getCruiseCallsForAppeal(100), 6);
});

test('cruise: the passengers get into town by the transport within reach, and by taxi and coach', () => {
  const none = cruise.computeCruiseTerminalMonth({ roadAccess: true, modes: {} }, 4);
  assert.equal(none.passengers, 4 * T.passengersPerCall);
  assert.equal(none.transitShare, 0);
  assert.equal(none.intoTown, Math.round(none.passengers * T.roadShare), 'by road only');
  const metroBus = cruise.computeCruiseTerminalMonth({ roadAccess: true, modes: { metro: true, bus: true } }, 4);
  assert.ok(Math.abs(metroBus.transitShare - (T.modeShares.metro + T.modeShares.bus)) < 1e-9);
  assert.ok(metroBus.intoTown > none.intoTown);
  assert.ok(metroBus.townSpend + metroBus.quaySpend > none.townSpend + none.quaySpend, 'into town they spend more');
  // every mode at once: the public transport share is capped, and all of them reach town
  const all = cruise.computeCruiseTerminalMonth({ roadAccess: true, modes: { metro: true, bus: true, tram: true, lightRail: true, ferry: true } }, 2);
  assert.equal(all.transitShare, T.maxTransitShare);
  assert.equal(all.intoTown, all.passengers);
  assert.equal(all.dues, Math.round(all.passengers * T.duesPerPassenger));
  // no road to the terminal: no ship calls
  const cutOff = cruise.computeCruiseTerminalMonth({ roadAccess: false, modes: { metro: true } }, 6);
  assert.deepEqual([cutOff.calls, cutOff.passengers, cutOff.transitShare], [0, 0, 0]);
  const total = cruise.sumCruiseMonths([metroBus, none]);
  assert.equal(total.passengers, metroBus.passengers + none.passengers);
  assert.ok(Math.abs(total.transitShare - metroBus.transitShare / 2) < 1e-9, 'weighted by passengers');
});

test('cruise: the calls spread evenly over the month, the ship in, alongside and out on the clock', () => {
  const dwell = 90;
  const schedule = cruise.getCruiseSchedule(4, dwell);
  assert.deepEqual(schedule.map((call) => call.arrive + dwell / 2), [180, 540, 900, 1260]);
  const staggered = cruise.getCruiseSchedule(4, dwell, 0.5);
  assert.equal(staggered[0].arrive + dwell / 2, 360, 'a second terminal half a slot on');
  assert.deepEqual(cruise.getCruiseSchedule(0, dwell), []);
  const first = schedule[0];
  assert.equal(cruise.getCruiseShipPhase(first.arrive - 31, schedule, 30, 30), null, 'at sea');
  assert.equal(cruise.getCruiseShipPhase(first.arrive - 10, schedule, 30, 30).state, 'in');
  assert.equal(cruise.getCruiseShipPhase(first.arrive + 10, schedule, 30, 30).state, 'alongside');
  assert.equal(cruise.getCruiseShipPhase(first.depart + 10, schedule, 30, 30).state, 'out');
  assert.equal(cruise.getCruiseShipPhase(first.depart + 31, schedule, 30, 30), null);
});

test('cruise: a call day doubles the roads near the terminal and adds the coaches and taxis', () => {
  const cap = 10;
  assert.equal(cruise.computeCruisePeakTraffic([], 1000, cap), 0);
  const quiet = cruise.computeCruisePeakTraffic([1, 1], 0, cap);
  assert.ok(Math.abs(quiet - 2 / cap) < 1e-9, 'doubled');
  const coaches = cruise.computeCruisePeakTraffic([1, 1], 1000, cap);
  assert.ok(Math.abs(coaches - (2 + T.coachLoadPerThousand) / cap) < 1e-9);
  assert.equal(cruise.computeCruisePeakTraffic([20], 0, cap), 1, 'a road can only be full');
  const history = cruise.normalizeCruiseHistory(Array.from({ length: 14 }, (_, i) => ({ monthIndex: i, calls: 3, transitShare: 2 })));
  assert.equal(history.length, T.historyMonths);
  assert.equal(history[0].transitShare, 1);
});

test('cruise terminal art: four facings by where the sea lies on screen, the art squared from Norton\'s render', () => {
  assert.equal(cruise.getCruiseTerminalFacingKey('e'), 'cruise_terminal_6x6', 'the render: its berth to the lower right');
  assert.equal(cruise.getCruiseTerminalFacingKey('s'), 'cruise_terminal_6x6_m');
  assert.equal(cruise.getCruiseTerminalFacingKey('w'), 'cruise_terminal_6x6_back');
  assert.equal(cruise.getCruiseTerminalFacingKey('n'), 'cruise_terminal_6x6_back_m');
  ['cruiseTerminal6-01', 'cruiseTerminal6-01_m', 'cruiseTerminal6-01_back', 'cruiseTerminal6-01_back_m'].forEach((name) => {
    assert.ok(fs.existsSync(path.join(ROOT, 'Models/specialSites/6x6', `${name}.png`)), name);
  });
  // Norton's two views (2026-11-20): the sea side and the land side, each with its quay over the whole sea edge
  ['cruiseTerminal6-02-sea-source.png', 'cruiseTerminal6-02-land-source.png'].forEach((name) =>
    assert.ok(fs.existsSync(path.join(ROOT, 'scripts/source-art/cruiseTerminal', name)), name));
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts/source-art/cruiseTerminal/fit.py'), 'utf8'), /LAND_VIEW_SCALE = 1\.0/);
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts/source-art/cruiseTerminal/fit.py')));
  const constants = source('constants.js');
  assert.match(constants, /SPECIAL_BUILDING_MODELS\.cruise_terminal = \{\s*spriteKey: 'cruise_terminal_6x6',\s*path: 'Models\/specialSites\/6x6\/cruiseTerminal6-01\.png',\s*footprintCols: 6,\s*footprintRows: 6/);
  Object.values(cruise.CRUISE_TERMINAL_FACING_KEYS).filter((key) => key !== 'cruise_terminal_6x6')
    .forEach((key) => assert.match(constants, new RegExp(`\\['${key}', 'Models/specialSites/6x6/`), key));
  assert.match(constants, /if \(buildingType === 'cruise_terminal'\) return \[\.\.\.models, \.\.\.CRUISE_TERMINAL_FACING_MODELS\]/);
});

test('cruise terminal in the game: tool, placement on the shore, takings, traffic, panel and chapter facts', () => {
  const html = source('index.html');
  assert.match(html, /data-tool="cruise-terminal"/);
  assert.ok(html.indexOf('src="welfare.js"') < html.indexOf('src="cruise-terminal.js"'));
  assert.ok(html.indexOf('src="cruise-terminal.js"') < html.indexOf('src="inspect-panel.js"'));
  const constants = source('constants.js');
  ['SPECIAL_BUILDING_UNLOCKS', 'SPECIAL_BUILDING_EFFECTS', 'SPECIAL_BUILDING_COSTS'].forEach((table) => {
    const body = constants.slice(constants.indexOf(`const ${table}`));
    assert.match(body.slice(0, body.indexOf('\n};')), /cruise_terminal:/, table);
  });
  assert.match(source('tools.js'), /'cruise-terminal':\s+'cruise_terminal'/);
  assert.match(source('tools.js'), /buildingType === 'cruise_terminal' && typeof whyNotCruiseTerminal === 'function'/);
  assert.match(source('placement-previews.js'), /selectedTool === 'cruise-terminal'/);
  assert.match(source('council-effects.js'), /getCruiseMonthlyVisitors\(\)/);
  assert.match(source('council-effects.js'), /getCruiseTourismRevenue\(\)/);
  assert.match(source('city-state.js'), /revenue \+= getCruiseMonthlyDues\(\)/);
  assert.match(source('sim-infrastructure.js'), /applyCruiseTerminalTrafficPeak\(trafficMap, roadTiles, TRAFFIC_ROAD_CAP\)/);
  assert.match(source('main.js'), /updateCruiseShips\(this\)/);
  assert.match(source('ferry.js'), /from\?\.startTiles/);
  assert.match(source('inspect-panel.js'), /buildCruiseTerminalInspectHtml\(/);
  assert.match(source('campaign.js'), /\.\.\.collectCruiseFacts\(\)/);
  const i18n = source('i18n.js');
  ['toolRow.cruiseTerminal', 'toolRow.cruiseTerminalDesc', 'building.cruiseTerminal', 'cruise.place.coast', 'cruise.place.blocked',
    'cruise.noRoad', 'cruise.alongside', 'cruise.next', 'cruise.none', 'cruise.calls', 'cruise.passengers', 'cruise.transit',
    'cruise.peak', 'cruise.takings', 'cruise.lastMonth', 'cruise.transitTip']
    .forEach((key) => assert.equal(i18n.split(`'${key}':`).length - 1, 3, `${key} in three languages`));
});
