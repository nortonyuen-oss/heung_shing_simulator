const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const {
  TRAFFIC_TIME_OF_DAY_KEYFRAMES,
  getTrafficTimeOfDayMultiplier,
  applyTrafficTimeOfDayMultiplier,
  getTimeAdjustedTrafficLoad,
  updateTrafficIndexForTimeOfDay,
} = require('../traffic-demand');

test('daily road demand has Hong Kong commute peaks and a low pre-dawn floor', () => {
  assert.equal(getTrafficTimeOfDayMultiplier(4.5 * 60), 0.10);
  assert.equal(getTrafficTimeOfDayMultiplier(8.5 * 60), 1.35);
  assert.equal(getTrafficTimeOfDayMultiplier(13 * 60), 1.00);
  assert.equal(getTrafficTimeOfDayMultiplier(18 * 60), 1.35);
  assert.equal(getTrafficTimeOfDayMultiplier(21 * 60), 0.78);
  assert.ok(getTrafficTimeOfDayMultiplier(8.5 * 60) >= getTrafficTimeOfDayMultiplier(4.5 * 60) * 13);
});

test('traffic demand eases between keyframes and loops continuously at midnight', () => {
  const morningStart = getTrafficTimeOfDayMultiplier(7.5 * 60);
  const morningMiddle = getTrafficTimeOfDayMultiplier(8 * 60);
  const morningPeak = getTrafficTimeOfDayMultiplier(8.5 * 60);
  assert.ok(morningStart < morningMiddle && morningMiddle < morningPeak);
  assert.equal(getTrafficTimeOfDayMultiplier(0), 0.22);
  assert.equal(getTrafficTimeOfDayMultiplier(24 * 60), 0.22);
  assert.ok(Math.abs(getTrafficTimeOfDayMultiplier(24 * 60 - 1) - 0.22) < 0.001);
  assert.equal(TRAFFIC_TIME_OF_DAY_KEYFRAMES.at(-1).minute, 24 * 60);
});

test('time multiplier scales and clamps individual road loads', () => {
  assert.ok(Math.abs(applyTrafficTimeOfDayMultiplier(0.8, 0.10) - 0.08) < 1e-12);
  assert.equal(applyTrafficTimeOfDayMultiplier(0.8, 1.35), 1);
  assert.ok(Math.abs(getTimeAdjustedTrafficLoad(0.8, 4.5 * 60) - 0.08) < 1e-12);
  assert.ok(Math.abs(getTimeAdjustedTrafficLoad(0.5, 18 * 60) - 0.675) < 1e-12);
});

test('live city congestion index follows the same clock curve', () => {
  const previousCity = global.city;
  const previousCouncilModifier = global.getCouncilTemporaryModifier;
  const previousPolicyActive = global.isPolicyActive;
  try {
    global.city = { trafficBaseIndex: 0.6, trafficIndex: 0 };
    global.getCouncilTemporaryModifier = () => 0;
    global.isPolicyActive = () => false;
    assert.ok(Math.abs(updateTrafficIndexForTimeOfDay(4.5 * 60) - 0.06) < 1e-12);
    assert.ok(Math.abs(updateTrafficIndexForTimeOfDay(8.5 * 60) - 0.81) < 1e-12);
    assert.ok(Math.abs(updateTrafficIndexForTimeOfDay(18 * 60) - 0.81) < 1e-12);
  } finally {
    if (previousCity === undefined) delete global.city;
    else global.city = previousCity;
    if (previousCouncilModifier === undefined) delete global.getCouncilTemporaryModifier;
    else global.getCouncilTemporaryModifier = previousCouncilModifier;
    if (previousPolicyActive === undefined) delete global.isPolicyActive;
    else global.isPolicyActive = previousPolicyActive;
  }
});

test('browser wiring applies one shared clock multiplier to simulation, visuals and overlay', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const infrastructure = fs.readFileSync(path.join(ROOT, 'sim-infrastructure.js'), 'utf8');
  const visuals = fs.readFileSync(path.join(ROOT, 'traffic-visuals.js'), 'utf8');
  const overlay = fs.readFileSync(path.join(ROOT, 'overlay-controls.js'), 'utf8');
  assert.ok(html.indexOf('traffic-demand.js') < html.indexOf('sim-infrastructure.js'));
  assert.ok(html.indexOf('traffic-demand.js') < html.indexOf('traffic-visuals.js'));
  assert.match(infrastructure, /city\.trafficBaseIndex[\s\S]*updateTrafficIndexForTimeOfDay\(\)/);
  assert.match(visuals, /getTrafficTimeOfDayMultiplier\(\)[\s\S]*applyTrafficTimeOfDayMultiplier/);
  assert.match(overlay, /getTrafficTimeOfDayMultiplier\(\)[\s\S]*applyTrafficTimeOfDayMultiplier/);
});
