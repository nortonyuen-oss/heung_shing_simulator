'use strict';

// 九龍城寨文化園區同拍戲、天壇大佛 (docs/campaign-p4-design.md §14): the park's visitors, fire cover
// and films; the Buddha up a hill and by bus; their wiring into the game and chapters 10 and 14.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const wc = require('../walled-city.js');
const bb = require('../big-buddha.js');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');
const T = wc.WALLED_CITY_TUNING;

test('城寨 park: visitors by the appeal, none without a road, half without fire cover, fewer while shooting', () => {
  const v = (appeal, opts) => wc.getWalledCityVisitors(appeal, opts);
  assert.equal(v(60), T.baseVisitors + 60 * T.visitorsPerAppeal);
  assert.ok(v(80) > v(60));
  assert.equal(v(60, { road: false }), 0);
  assert.equal(v(60, { fireCover: false }), Math.round(v(60) * T.noFireCapacity));
  assert.equal(v(60, { shooting: true }), Math.round(v(60) * T.shootCapacity));
  assert.equal(v(500), v(100), 'the appeal tops out at 100');
});

test('城寨 films: titles in order then numbered, a luck of their own, box office by the appeal', () => {
  assert.equal(wc.getWalledCityFilmTitle(0).zhHant, '九龍城寨之圍揪', 'the chapter\'s first film is the event\'s');
  wc.WALLED_CITY_FILMS.forEach((title) => ['zhHant', 'en', 'ja'].forEach((lang) => assert.ok(title[lang], lang)));
  assert.equal(wc.getWalledCityFilmTitle(wc.WALLED_CITY_FILMS.length).zhHant, '城寨宇宙 2');
  const lucks = Array.from({ length: 40 }, (_, i) => wc.getWalledCityFilmLuck(i, 300 + i));
  lucks.forEach((luck) => assert.ok(luck >= T.luckMin && luck <= T.luckMax));
  assert.ok(Math.max(...lucks) - Math.min(...lucks) > 0.4, 'hits and flops');
  assert.equal(wc.getWalledCityFilmLuck(3, 400), wc.getWalledCityFilmLuck(3, 400), 'the same film, the same luck');
  const even = wc.computeWalledCityFilmGross(70, 1);
  assert.equal(even.gross, T.grossBase + 70 * T.grossPerAppeal);
  assert.equal(even.levy, Math.round(even.gross * T.levy));
  assert.ok(wc.computeWalledCityFilmGross(80, 1).gross > even.gross);
  // even a flop at a middling appeal pays back the subsidy, a little
  assert.ok(wc.computeWalledCityFilmGross(50, T.luckMin).levy > 0);
  assert.equal(wc.getWalledCityBuzzAppeal({ buzzUntil: 10 }, 9), T.buzzAppeal);
  assert.equal(wc.getWalledCityBuzzAppeal({ buzzUntil: 10 }, 10), 0);
});

test('城寨 state: a saved record is cleaned and keeps its counts', () => {
  assert.deepEqual(wc.normalizeWalledCityState(null), { shooting: null, started: 0, made: 0, films: [], buzzUntil: 0 });
  const raw = { shooting: { titleIndex: 2, startMonthIndex: 10, endMonthIndex: 13 }, made: 2, films: [{ titleIndex: 0, monthIndex: 5, gross: 100, levy: 20 }, null], buzzUntil: 'x' };
  const state = wc.normalizeWalledCityState(raw);
  assert.equal(state.started, 3, 'the films made and the one shooting');
  assert.equal(state.films.length, 1);
  assert.equal(state.buzzUntil, 0);
  assert.equal(wc.normalizeWalledCityState({ films: Array.from({ length: 20 }, () => ({})) }).films.length, T.filmHistory);
});

// The film runs in the game: started from the panel, paid for, wrapped at the month, the share banked.
test('城寨 films in a city: start, shoot, wrap, the levy, the buzz; one at a time; the park gone', () => {
  const handlers = [];
  const city = { budget: 20000, tourismAppeal: 70, tick: 1, year: 2030, month: 1 };
  const context = vm.createContext({
    city, console, Map, Math, Object, Number, String, Array,
    buildingData: { '10:10': { type: 'walled_city_park', footprintRows: 6, footprintCols: 6 } },
    mapData: [], ROAD: 2, isRoadTile: (r, c) => r === 8 && c === 12, isInsideMap: () => true,
    serviceMap: new Map([['12:12', { fire: 1 }]]),
    getCityMonthIndex: () => city.year * 12 + city.month,
    onGameClockEvent: (name, fn) => handlers.push([name, fn]),
    spendBudget: (amount) => { if (city.budget < amount) return false; city.budget -= amount; return true; },
    toasts: [],
  });
  context.showToast = (message) => context.toasts.push(message);
  vm.runInContext(source('walled-city.js'), context);
  const run = (code) => vm.runInContext(code, context);
  const month = () => { city.month += 1; city.tick += 1; handlers.forEach(([, fn]) => fn()); };
  assert.equal(handlers[0][0], 'gameclock:month');
  assert.equal(run('getWalledCityState().fireCover'), true);
  assert.equal(run('getWalledCityState().road'), true);
  assert.equal(run('getWalledCityMonthlyVisitors()'), T.baseVisitors + 70 * T.visitorsPerAppeal);
  assert.equal(run('startWalledCityFilm()'), true);
  assert.equal(city.budget, 20000 - T.filmCost);
  assert.equal(run('startWalledCityFilm()'), false, 'one at a time');
  city.tick += 1;
  assert.equal(run('getWalledCityState().shooting.titleIndex'), 0);
  assert.equal(run('getWalledCityMonthlyVisitors()'), Math.round((T.baseVisitors + 70 * T.visitorsPerAppeal) * T.shootCapacity), 'the alleys closed');
  month(); month();
  assert.equal(city.walledCity.made, 0, 'still shooting');
  const before = city.budget;
  month();
  assert.equal(city.walledCity.made, 1);
  assert.equal(city.walledCity.shooting, null);
  assert.equal(city.budget - before, city.walledCity.films[0].levy);
  assert.ok(city.walledCity.films[0].levy > 0);
  assert.ok(context.toasts.some((m) => m.includes('九龍城寨之圍揪') && m.includes('票房')));
  city.tick += 1;
  assert.equal(run('getWalledCityFilmBuzz()'), T.buzzAppeal);
  // the next film; the park bulldozed while it shoots: dropped, no wrap
  assert.equal(run('startWalledCityFilm()'), true);
  assert.equal(city.walledCity.shooting.titleIndex, 1);
  delete context.buildingData['10:10'];
  month();
  assert.equal(city.walledCity.shooting, null);
  assert.equal(city.walledCity.made, 1);
  // no money, no film
  context.buildingData['10:10'] = { type: 'walled_city_park', footprintRows: 6, footprintCols: 6 };
  city.budget = 100; city.tick += 1;
  assert.match(run('whyNotWalledCityFilm()'), /唔夠錢/);
  assert.equal(run('startWalledCityFilm()'), false);
  // no fire station: half the crowd
  context.serviceMap = new Map(); city.tick += 1;
  run('invalidateWalledCityState()');
  assert.equal(run('getWalledCityState().fireCover'), false);
});

test('天壇大佛: up a hill and by bus, the pilgrims; only ever adds', () => {
  const BT = bb.BIG_BUDDHA_TUNING;
  assert.equal(bb.isBigBuddhaHill(BT.hillLevel), true);
  assert.equal(bb.isBigBuddhaHill(BT.hillLevel - 1), false);
  const v = (opts) => bb.getBigBuddhaVisitors(60, opts);
  const full = v({ onHill: true, bus: true });
  assert.equal(full, BT.baseVisitors + 60 * BT.visitorsPerAppeal);
  assert.equal(v({ onHill: false, bus: true }), Math.round(full * BT.flatShare));
  assert.equal(v({ onHill: true, bus: false }), Math.round(full * BT.noBusShare));
  assert.equal(v({ road: false, onHill: true, bus: true }), 0);
  assert.ok(v({}) > 0, 'flat, coaches only: still some pilgrims');
});

test('天壇大佛 in a city: the lot\'s ground, the bus stop near it, its panel', () => {
  const city = { tourismAppeal: 50, tick: 1 };
  const heights = (r, c) => (r >= 20 && r < 23 && c >= 20 && c < 23 ? 4 : 0);
  const context = vm.createContext({
    city, Map, Math, Object, Number, String, Array,
    buildingData: { '20:20': { type: 'buddha_statue', footprintRows: 3, footprintCols: 3 } },
    getTileHeight: heights, isRoadTile: (r, c) => r === 23 && c === 21, isInsideMap: () => true, mapData: [], ROAD: 2,
    getTransportExpansionState: () => ({
      stops: [{ id: 's1', row: 24, col: 21 }, { id: 's2', row: 60, col: 60 }],
      routes: [{ status: 'active', stopIds: ['s2', 's1'], history: [{ passengers: 120 }] }],
    }),
  });
  vm.runInContext(source('big-buddha.js'), context);
  const state = vm.runInContext('getBigBuddhaState()', context);
  assert.equal(state.level, 4);
  assert.equal(state.onHill, true);
  assert.equal(state.bus, true);
  assert.equal(state.appeal, bb.BIG_BUDDHA_TUNING.hillAppeal);
  assert.equal(state.tourism, Math.round(state.visitors * bb.BIG_BUDDHA_TUNING.spend));
  assert.match(vm.runInContext('buildBigBuddhaInspectHtml()', context), /山上/);
  // the stop too far, or the route empty: coaches only
  context.getTransportExpansionState = () => ({ stops: [{ id: 's1', row: 40, col: 21 }], routes: [{ status: 'active', stopIds: ['s1'], history: [{ passengers: 9 }] }] });
  city.tick += 1;
  assert.equal(vm.runInContext('getBigBuddhaState().bus', context), false);
});

test('城寨 park and 天壇大佛 in the game: the landmark, its tool, panel, takings, tourism, facts, i18n', () => {
  const constants = source('constants.js');
  assert.match(constants, /SPECIAL_BUILDING_MODELS\.walled_city_park = \{[\s\S]*?walledCityPark6-01\.png[\s\S]*?footprintCols: 6/);
  assert.match(constants, /walled_city_park:\s+\{ unlockPopulation: 60000, maxCount: 1 \}/);
  assert.match(constants, /walled_city_park:\s+\{ attractivenessBonus: 6[^}]*upkeep: 900 \}/);
  assert.ok(fs.existsSync(path.join(ROOT, 'Models/specialSites/6x6/walledCityPark6-01.png')));
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts/source-art/walledCity/standin.py')));
  assert.match(source('tools.js'), /'walled-city-park':\s+'walled_city_park'/);
  assert.match(source('tool-menu.js'), /tool === 'walled-city-park'/);
  const html = source('index.html');
  assert.match(html, /data-tool="walled-city-park"[\s\S]*?\$30000/);
  assert.ok(html.indexOf('src="walled-city.js"') > html.indexOf('src="airport-routes.js"'));
  assert.ok(html.indexOf('src="big-buddha.js"') < html.indexOf('src="inspect-panel.js"'));
  assert.match(source('inspect-panel.js'), /buildWalledCityInspectHtml\(\)/);
  assert.match(source('inspect-panel.js'), /buildBigBuddhaInspectHtml\(\)/);
  assert.match(source('city-state.js'), /getWalledCityMonthlyTakings\(\)/);
  const council = source('council-effects.js');
  ['getWalledCityMonthlyVisitors()', 'getWalledCityFilmBuzz()', 'getBigBuddhaMonthlyVisitors()', 'getBigBuddhaTourismRevenue()', 'getBigBuddhaHillAppeal()']
    .forEach((call) => assert.ok(council.includes(call), call));
  assert.match(source('campaign.js'), /\.\.\.collectLandmarkFacts\(\)/);
  const i18n = source('i18n.js');
  ['toolRow.walledCityPark', 'building.walledCityPark', 'walledCity.start', 'walledCity.wrapped', 'walledCity.fireNo', 'bigBuddha.hill', 'bigBuddha.noBus']
    .forEach((key) => assert.equal(i18n.split(`'${key}':`).length - 1, 3, `${key} in three languages`));
});
