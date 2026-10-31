'use strict';

// 香城夜繽週 (Norton 2026-10-31): the act the event grounds' 大排檔 night market runs under.
// Checks it is registered everywhere a policy has to be (definition, save defaults and whitelist,
// cost, council preview, three languages), and that the market honours it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { getStreetFoodVenueLayout } = require('../street-food-market.js');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');

test('香城夜繽週 is a full policy: definition, save defaults, whitelist, cost, preview, three languages', () => {
  const context = vm.createContext({});
  vm.runInContext(source('constants.js'), context);
  const policy = vm.runInContext(`CITY_POLICY_DEFS.find((p) => p.id === 'nightBazaarWeekend')`, context);
  assert.ok(policy, 'defined in CITY_POLICY_DEFS');
  assert.equal(policy.category, 'financeEconomy');
  assert.equal(policy.moverId, 'councillor_tourism');
  assert.equal(policy.titleKey, 'policy.nightBazaarWeekend.title');

  const i18n = source('i18n.js');
  const state = source('city-state.js');
  assert.equal(state.match(/nightBazaarWeekend: false,/g)?.length, 2, 'both default policy tables (new city, reset)');
  assert.match(state, /CITY_STATE_POLICY_IDS = Object\.freeze\(\[[^\]]*'nightBazaarWeekend'/);
  assert.match(state, /nightBazaarWeekend'\) cost \+= countNightBazaarGroundTiles\(\) \* 6/);
  const preview = source('council-policy-preview.js');
  assert.match(preview, /nightBazaarWeekend: \{ issues: \{ tourism:/);
  // lead officials need council.advice.<id>.* copy, which only the officials have (not councillors)
  const leads = preview.match(/nightBazaarWeekend: \{[^\n]*leadOfficialIds: \[([^\]]*)\]/)[1].match(/'([a-z_]+)'/g).map((id) => id.slice(1, -1));
  leads.forEach((id) => ['support', 'concern'].forEach((stance) => assert.match(i18n, new RegExp(`'council\\.advice\\.${id}\\.${stance}'`), `${id} ${stance} advice copy`)));
  assert.match(preview, /nightBazaarWeekend'\) cost \+= countNightBazaarGroundTiles\(\) \* 6/);

  assert.equal(i18n.match(/'policy\.nightBazaarWeekend\.title'/g)?.length, 3, 'en, zh, ja titles');
  assert.equal(i18n.match(/'policy\.nightBazaarWeekend\.desc'/g)?.length, 3, 'en, zh, ja descriptions');
  assert.match(i18n, /'policy\.nightBazaarWeekend\.title': '香城夜繽週'/);
});

test('the act\'s lift scales with the event grounds there are to hold the market, and is nothing without it', () => {
  const context = vm.createContext({ buildingData: {}, active: false });
  vm.runInContext(`function isPolicyActive(id) { return id === 'nightBazaarWeekend' && active; }`, context);
  const state = source('city-state.js');
  for (const name of ['countNightBazaarGroundTiles', 'getNightBazaarEffectShare']) {
    const start = state.indexOf(`function ${name}(`);
    vm.runInContext(state.slice(start, state.indexOf('\n}\n', start) + 2), context);
  }
  context.buildingData = { '1:1': { type: 'event_ground' }, '1:2': { type: 'event_ground' }, '5:5': { type: 'park_small' } };
  assert.equal(vm.runInContext('getNightBazaarEffectShare()', context), 0, 'no act, no lift');
  context.active = true;
  assert.equal(vm.runInContext('countNightBazaarGroundTiles()', context), 2);
  assert.equal(vm.runInContext('getNightBazaarEffectShare()', context), 0.5);
  for (let i = 0; i < 6; i++) context.buildingData[`9:${i}`] = { type: 'event_ground' };
  assert.equal(vm.runInContext('getNightBazaarEffectShare()', context), 1, 'capped at four tiles\' worth');
});

test('without the act the lot keeps its lamp posts and boxes, but no carts, tables or string lights', () => {
  const venue = { id: 'eventGround:2:2', tiles: [[2, 2]] };
  const roster = { carts: ['a'], hawkers: ['h'], queuers: ['q'], diners: ['d'], passersby: ['p'], tableFurniture: ['t'], stools: ['s'] };
  const off = getStreetFoodVenueLayout(venue, { minuteOfDay: 19 * 60, weather: {}, enabled: false, ...roster });
  assert.equal(off.phase, 'disabled');
  assert.deepEqual([off.stalls.length, off.tables.length, off.walkers.length, off.strings.length], [0, 0, 0, 0]);
  assert.ok(off.lamps.length > 0 && off.cabinets.length > 0);
  const on = getStreetFoodVenueLayout(venue, { minuteOfDay: 19 * 60, weather: {}, enabled: true, ...roster });
  assert.ok(on.stalls.length > 0 && on.strings.length > 0);
  assert.deepEqual(on.lamps, off.lamps);
});
