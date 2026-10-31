const test = require('node:test');
const assert = require('node:assert/strict');

const calendar = require('../festival-calendar.js');
global.getFestivalsInMonth = calendar.getFestivalsInMonth;
const festivals = require('../festivals.js');
Object.assign(global, festivals);
const { getLnyFireworksState, lnyFireworksWeatherBad } = require('../festival-fireworks.js');

test('年初二煙花 is held on the evening of 正月初二, the month it falls in', () => {
  assert.deepEqual(calendar.getFestivalDate('lnyFireworks', 2026), { year: 2026, month: 2, day: 18, approximate: false });
  // 除夕 and 初二 can fall either side of a month's end
  assert.equal(calendar.getFestivalMonth('lnyFireworks', 2025), 1);
  assert.ok(calendar.getFestivalsInMonth(2026, 2).includes('lnyFireworks'));
});

test('the show: 20:00 to 20:30, the finale in the last five minutes, only once held', () => {
  const month = calendar.getFestivalMonth('lnyFireworks', 2026);
  const at = (minuteOfDay, extra = {}) => getLnyFireworksState({ year: 2026, month, minuteOfDay, weather: {}, held: true, isEnabled: () => true, ...extra });
  assert.equal(at(19 * 60 + 59), null);
  assert.deepEqual(at(20 * 60), { tier: 'standard', finale: false, cancelled: false });
  assert.equal(at(20 * 60 + 26).finale, true);
  assert.equal(at(20 * 60 + 30), null);
  assert.equal(at(20 * 60 + 5, { held: false }), null);
  assert.equal(at(20 * 60 + 5, { tier: 'skip' }), null);
  assert.equal(getLnyFireworksState({ year: 2026, month: month === 12 ? 1 : month + 1, minuteOfDay: 20 * 60 + 5, weather: {}, held: true, isEnabled: () => true }), null);
  assert.equal(at(20 * 60 + 5, { weather: { typhoonStage: 'signal3' } }).cancelled, true);
});

test('bad weather calls it off; money and effects scale with the tier', () => {
  assert.equal(lnyFireworksWeatherBad({ rainWarning: 'black' }), true);
  assert.equal(lnyFireworksWeatherBad({ rainWarning: 'amber', typhoonStage: 'signal1' }), false);
  assert.deepEqual(festivals.getFestivalEffects('lnyFireworks', 'standard'), { attractiveness: 2, tourism: 2, happiness: 0.015 });
  assert.ok(festivals.getFestivalCost('lnyFireworks', 'grand', 100000) > festivals.getFestivalCost('lnyFireworks', 'basic', 100000));
});
