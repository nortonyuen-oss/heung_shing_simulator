'use strict';

// 節慶實際預留 > 平日小食墟: the 大排檔 must keep off the Bun Hill venue for that festival's whole
// day (Norton 2026-10-31: 搶包山活動係咪被大排檔override) - it used to give way only while the
// run was 'running', so from the 00:15 result ('held') to 02:00 its stalls stood on the bun towers'
// awards and teardown, and on the day it opened at 15:00 on the lot the 18:00 setup then took.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const context = vm.createContext({
    console,
    city: { year: 2027, month: 6, timeOfDayMinutes: 16 * 60 },
    festivalState: { bunHill: null, venues: {} },
    picks: 0,
    held: false,
  });
  vm.runInContext(`
    function getCityFestivalState() { return festivalState; }
    function getFestivalMonth(id) { return id === 'bunHill' ? 6 : 0; }
    function isFestivalEnabled() { return true; }
    function getFestivalTier() { return 'standard'; }
    function getFestivalHistoryEntry() { return held ? { outcome: 'held' } : null; }
    function getBunHillMapVenueContext() { return {}; }
    function selectBunHillVenue() { picks++; return { id: 'eventGround:10:10' }; }
    function getActiveFestivals() { return []; }
  `, context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'street-food-market.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'street-food-sprites.js'), 'utf8'), context);
  return context;
}

test('the Bun Hill lot is off-limits to the market all day: before setup, running, and after its result', () => {
  const c = load();
  const scene = { time: { now: 0 } };
  c.scene = scene;
  const claims = (id) => vm.runInContext(`getStreetFoodClaimedPredicate(scene)({ id: '${id}' })`, c);
  // its day, 16:00, before the 18:00 setup: the lot it will pick is already kept clear
  assert.equal(claims('eventGround:10:10'), true);
  assert.equal(claims('eventGround:30:30'), false, 'other lots run as usual');
  claims('eventGround:10:10');
  assert.equal(c.picks, 1, 'the venue pick is cached, not redone every update');
  scene.time.now = 2500;
  claims('eventGround:10:10');
  assert.equal(c.picks, 2, 'refreshed after two seconds');
  // the edition runs, then is held at 00:15 while its set stands until 02:00
  for (const status of ['running', 'held']) {
    c.festivalState.bunHill = { year: 2027, month: 6, status, venue: { id: 'eventGround:10:10' } };
    assert.equal(claims('eventGround:10:10'), true, status);
  }
  c.festivalState.bunHill.status = 'cancelled';
  assert.equal(claims('eventGround:10:10'), false, 'a cancelled edition hands the lot back');
  // next month the old edition no longer counts
  c.city.month = 7;
  c.festivalState.bunHill = { year: 2027, month: 6, status: 'held', venue: { id: 'eventGround:10:10' } };
  assert.equal(claims('eventGround:10:10'), false);
  // the rehearsal owns every ground
  scene.bunHillEventSession = {};
  assert.equal(claims('eventGround:30:30'), true);
});
