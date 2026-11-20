'use strict';

// 航班 (docs/campaign-p4-design.md §4.3, §12): the airport's routes, their demand and seats, the fees
// and costs, the curfew and the night noise; the 赤鱲角 map (§4.4); B07.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const air = require('../airport-routes.js');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');
const T = air.AIRPORT_TUNING;
const city = { population: 150000, visitors: 30000, appeal: 60 };

test('airport: eleven destinations, near and far, in three languages', () => {
  assert.ok(air.AIRPORT_DESTINATIONS.length >= 8 && air.AIRPORT_DESTINATIONS.length <= 12);
  air.AIRPORT_DESTINATIONS.forEach((d) => ['zhHant', 'en', 'ja'].forEach((lang) => assert.ok(d.name[lang], `${d.id} ${lang}`)));
  assert.deepEqual(air.AIRPORT_DESTINATIONS.filter((d) => d.haul === 'long').map((d) => d.id), ['dubai', 'sydney', 'london', 'vancouver']);
  Object.keys(T.defaultRoutes).forEach((id) => assert.ok(air.AIRPORT_DESTINATIONS_BY_ID[id], id));
});

test('airport: demand grows with the city, its visitors and its appeal, and falls with distance', () => {
  const taipei = air.AIRPORT_DESTINATIONS_BY_ID.taipei;
  const london = air.AIRPORT_DESTINATIONS_BY_ID.london;
  const d = (dest, inputs) => air.getAirportRouteDemand(dest, inputs);
  assert.ok(d(taipei, city) > d(london, city), 'Taipei is nearer');
  assert.ok(d(taipei, { ...city, population: 300000 }) > d(taipei, city));
  assert.ok(d(taipei, { ...city, appeal: 90 }) > d(taipei, city));
  assert.equal(d(taipei, { population: 0, visitors: 0, appeal: 50 }), 0);
});

test('airport: a route fills its seats as far as its demand goes; fees, costs, visitors', () => {
  const s = air.computeAirportState({ routes: { taipei: 2, london: 6 }, curfew: false }, city);
  const taipei = s.routes.find((r) => r.id === 'taipei');
  const london = s.routes.find((r) => r.id === 'london');
  assert.equal(taipei.seats, 2 * 2 * T.daysPerMonth * T.seats.short);
  assert.ok(taipei.passengers <= taipei.seats * T.maxLoad && taipei.passengers <= taipei.demand);
  assert.ok(london.load < 0.3, 'six daily flights to London fly mostly empty');
  assert.equal(london.cost, 6 * T.dailyFlightCost.long);
  assert.equal(s.dailyFlights, 8);
  assert.equal(s.routes.length, 2);
  assert.equal(s.routesFlying, 2);
  assert.equal(s.fees, Math.round(taipei.passengers * T.feePerPassenger) + Math.round(london.passengers * T.feePerPassenger));
  assert.equal(s.visitors, Math.round(s.passengers * T.visitorShare));
  assert.ok(s.nightFlights > 0);
  // the curfew: no night flights and fewer seats
  const curfew = air.computeAirportState({ routes: { taipei: 2, london: 6 }, curfew: true }, city);
  assert.equal(curfew.nightFlights, 0);
  assert.equal(curfew.routes[0].seats, Math.round(taipei.seats * T.curfewSeats));
  // no airport: nothing flies
  assert.equal(air.computeAirportState({ routes: { taipei: 2 } }, city, false).passengers, 0);
  // routes are kept within bounds and to known cities
  assert.deepEqual(air.normalizeAirportRoutes({ routes: { taipei: 9, atlantis: 2, manila: 0 }, curfew: 'yes' }), { routes: { taipei: T.maxDaily }, curfew: false });
});

test('airport: the gates in use follow the timetable, the curfew holds 23:00-06:00, the night noise', () => {
  assert.equal(air.getAirportGateCapForFlights(0), 0, 'no routes, no aircraft');
  assert.equal(air.getAirportGateCapForFlights(1), 1);
  assert.equal(air.getAirportGateCapForFlights(7), 3);
  assert.equal(air.getAirportGateCapForFlights(60), T.gates);
  assert.equal(air.isAirportCurfewMinute(23 * 60), true);
  assert.equal(air.isAirportCurfewMinute(3 * 60), true);
  assert.equal(air.isAirportCurfewMinute(6 * 60), false);
  assert.equal(air.isAirportCurfewMinute(22 * 60 + 59), false);
  assert.equal(air.getAirportNightPenalty(0.5, 0), 0);
  assert.ok(Math.abs(air.getAirportNightPenalty(1, 100) - T.nightPenaltyMax) < 1e-9);
  assert.ok(air.getAirportNightPenalty(0.2, 3) < air.getAirportNightPenalty(0.4, 3));
});

test('赤鱲角: a district map cut from the territory, with its profile, its name and chapter 10 on it', () => {
  const context = vm.createContext({ city: {}, DENSITY_LOW: 1, DENSITY_MED: 2, DENSITY_HIGH: 3 });
  ['hk-district-maps.js', 'hk-district-info.js', 'district-profiles.js'].forEach((file) => vm.runInContext(source(file), context));
  const map = vm.runInContext("HK_DISTRICT_MAPS.find((d) => d.id === 'chek-lap-kok')", context);
  assert.ok(map, 'the map');
  assert.equal(map.rows.length, 256);
  const decode = (row) => [...row.matchAll(/([A-Za-z])(\d*)/g)].flatMap(([, c, n]) => Array(Number(n || 1)).fill(c));
  map.rows.forEach((row) => assert.equal(decode(row).length, 256));
  const tiles = map.rows.flatMap(decode);
  const land = tiles.filter((c) => c !== 'W').length / tiles.length;
  assert.ok(land > 0.6 && land < 0.8, `${Math.round(land * 100)}% land: the airport island, the bay and 東涌`);
  // the airport island is one great flat: level 0 land is most of the north half
  const northFlat = map.rows.slice(20, 120).flatMap(decode).filter((c) => c === 'a').length / (100 * 256);
  assert.ok(northFlat > 0.5, `${Math.round(northFlat * 100)}% flat in the north`);
  assert.equal(vm.runInContext("HK_DISTRICT_INFO['chek-lap-kok'].names.zhHant", context), '赤鱲角');
  const score = vm.runInContext("getDistrictProfileScore(DISTRICT_PROFILES['chek-lap-kok'])", context);
  assert.ok(score >= 0 && score <= 2);
  assert.match(source('scripts/build-hk-district-maps.py'), /\('chek-lap-kok', 22\.302, 113\.930\)/);
  assert.match(source('scripts/build-hk-district-maps.py'), /--from-territory/);
  assert.equal(require('../campaign-chapters.js').CAMPAIGN_CHAPTERS_BY_ID.ch10.mapId, 'chek-lap-kok');
  assert.match(source('region-connections.js'), /'chek-lap-kok': \{ zhHant: '機場'/);
});

test('airport in the game: panel, aircraft, takings, happiness, chapter facts and B07', () => {
  const html = source('index.html');
  assert.ok(html.indexOf('src="cruise-terminal.js"') < html.indexOf('src="airport-routes.js"'));
  assert.ok(html.indexOf('src="airport-routes.js"') < html.indexOf('src="inspect-panel.js"'));
  assert.match(source('aircraft-visuals.js'), /airportState\.events\.length >= getAirportGateCap\(\)/);
  assert.match(source('aircraft-visuals.js'), /isAirportCurfewNow\(\)/);
  assert.match(source('council-effects.js'), /city\.baseVisitors = visitors/);
  assert.match(source('council-effects.js'), /getAirportMonthlyVisitors\(\)/);
  assert.match(source('city-state.js'), /getAirportRouteFinancials\(\)/);
  assert.match(source('simulation.js'), /- airportNightPenalty/);
  assert.match(source('inspect-panel.js'), /buildAirportInspectHtml\(\)/);
  assert.match(source('campaign.js'), /\.\.\.collectAirportFacts\(\)/);
  const medals = require('../medal-definitions.js');
  const list = medals.MEDAL_DEFINITIONS || medals.MEDALS || Object.values(medals).find((v) => Array.isArray(v));
  const b07 = list.find((m) => m.id === 'B07');
  assert.equal(b07.status, 'active');
  assert.equal(b07.live({ buildings: { airport: 1 }, airportRoutes: 5 }), true);
  assert.equal(b07.live({ buildings: { airport: 1 }, airportRoutes: 4 }), false);
  assert.equal(b07.live({ buildings: {}, airportRoutes: 9 }), false);
  const i18n = source('i18n.js');
  ['airport.summary', 'airport.money', 'airport.routeDetail', 'airport.night', 'airport.curfewOn', 'airport.curfewSet', 'airport.curfewLift']
    .forEach((key) => assert.equal(i18n.split(`'${key}':`).length - 1, 3, `${key} in three languages`));
});
