'use strict';

// 空地資料面板「自動／停用」(Norton 2026-10-31): a player can keep the 大排檔 off one event-ground
// lot. The choice lives on the lot's event_ground building records (saved with them) and covers
// the whole connected lot; the panel says why a lot has no market right now.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');

function load() {
  const lot = { id: 'eventGround:4:4', tiles: [[4, 4], [4, 5]] };
  const context = vm.createContext({
    console,
    buildingData: { '4:4': { type: 'event_ground' }, '4:5': { type: 'event_ground' } },
    city: { timeOfDayMinutes: 19 * 60, weather: { condition: 'clear' }, activePolicies: { nightBazaarWeekend: true } },
    saves: 0,
  });
  vm.runInContext(`
    function isPolicyActive(id) { return !!city.activePolicies[id]; }
    function queueCityChangeAutosave() { saves++; }
    function t(key, params = {}) { return key + JSON.stringify(params); }
  `, context);
  context.lot = lot;
  vm.runInContext(`function getFestivalVenueContext() { return { eventGrounds: [lot] }; }`, context);
  vm.runInContext(source('street-food-market.js'), context, { filename: 'street-food-market.js' });
  vm.runInContext(source('street-food-sprites.js'), context, { filename: 'street-food-sprites.js' });
  return context;
}

test('a lot is auto until switched off; switching covers every tile of it and saves', () => {
  const c = load();
  const run = (code) => vm.runInContext(code, c);
  assert.equal(run('isStreetFoodVenueDisabled(lot)'), false);
  assert.equal(run('getStreetFoodVenueStatus({}, 4, 5).status'), 'open');
  run('setStreetFoodVenueDisabled({}, lot, true)');
  assert.deepEqual([c.buildingData['4:4'].streetFood, c.buildingData['4:5'].streetFood], ['off', 'off']);
  assert.equal(c.saves, 1, 'queued an autosave');
  assert.equal(run('getStreetFoodVenueStatus({}, 4, 4).status'), 'off');
  // a tile joining an off lot keeps the lot off
  delete c.buildingData['4:5'].streetFood;
  assert.equal(run('isStreetFoodVenueDisabled(lot)'), true);
  run('setStreetFoodVenueDisabled({}, lot, false)');
  assert.equal('streetFood' in c.buildingData['4:4'], false, 'auto leaves no field behind');
  assert.equal(run('getStreetFoodVenueStatus({}, 9, 9)'), null, 'not an event ground');
});

test('the panel names why a lot has no market: no act, off, storm, before opening', () => {
  const c = load();
  const status = () => vm.runInContext('getStreetFoodVenueStatus({}, 4, 4).status', c);
  c.city.activePolicies.nightBazaarWeekend = false;
  assert.equal(status(), 'noAct');
  c.city.activePolicies.nightBazaarWeekend = true;
  c.city.weather = { typhoonStage: 'signal8' };
  assert.equal(status(), 'weather');
  c.city.weather = { condition: 'clear' };
  c.city.timeOfDayMinutes = 11 * 60;
  assert.equal(status(), 'waiting');
  c.city.timeOfDayMinutes = 23 * 60 + 45;
  assert.equal(status(), 'lateNight');
  const html = vm.runInContext('buildStreetFoodInspectHtml({}, 4, 4)', c);
  assert.match(html, /toggleInspectedStreetFoodVenue\(\)/);
  assert.match(html, /streetFood\.disable/);
});

test('every status and the panel copy exist in all three languages', () => {
  const i18n = source('i18n.js');
  for (const key of ['inspectTitle', 'modeAuto', 'modeOff', 'mode', 'disable', 'enable', 'size',
    ...['noAct', 'off', 'festival', 'weather', 'waiting', 'opening', 'open', 'lateNight', 'closing'].map((s) => `status.${s}`)]) {
    assert.equal(i18n.split(`'streetFood.${key}':`).length - 1, 3, `streetFood.${key}`);
  }
  assert.match(source('inspect-panel.js'), /bData\.type === 'event_ground' \? \(typeof buildStreetFoodInspectHtml === 'function' \? buildStreetFoodInspectHtml\(activeScene, row, col\)/);
});
