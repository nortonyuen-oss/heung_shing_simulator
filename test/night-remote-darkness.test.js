const assert = require('node:assert/strict');
const test = require('node:test');

const {
  NIGHT_REMOTE_DARKNESS_DEFAULTS,
  computeNightRemoteExtraAlpha,
  computeNightRemoteField,
  scaleNightTint,
} = require('../night-remote-darkness.js');

// main.js's city passes at the ordinary night peak and in the small hours
const CITY_PEAK_TOTAL = 0.62;
const CITY_DEEP_TOTAL = 0.71;

test('far from the city the ground lands on the calibrated brightness', () => {
  const settings = NIGHT_REMOTE_DARKNESS_DEFAULTS;
  const peak = computeNightRemoteExtraAlpha(0.54, 0, CITY_PEAK_TOTAL, settings);
  assert.ok(Math.abs((1 - CITY_PEAK_TOTAL) * (1 - peak) - settings.farBrightness) < 1e-9);
  const deep = computeNightRemoteExtraAlpha(0.54, 1, CITY_DEEP_TOTAL, settings);
  assert.ok(Math.abs((1 - CITY_DEEP_TOTAL) * (1 - deep) - settings.deepFarBrightness) < 1e-9);
});

test('the extra pass is off in daylight and ramps smoothly through dusk', () => {
  assert.equal(computeNightRemoteExtraAlpha(0, 0, 0), 0);
  let previous = 0;
  for (let step = 1; step <= 54; step++) {
    const raw = step / 100;
    const total = (raw / 0.54) * CITY_PEAK_TOTAL;
    const extra = computeNightRemoteExtraAlpha(raw, 0, total);
    assert.ok(extra >= previous, `raw ${raw}: ${extra} < ${previous}`);
    assert.ok(extra - previous < 0.02, `raw ${raw}: jumped ${extra - previous}`);
    previous = extra;
  }
});

test('a far brightness at or above the city adds nothing', () => {
  const settings = { ...NIGHT_REMOTE_DARKNESS_DEFAULTS, farBrightness: 0.5 };
  assert.equal(computeNightRemoteExtraAlpha(0.54, 0, CITY_PEAK_TOTAL, settings), 0);
});

test('the field is clear on lit tiles, eases out and saturates far away', () => {
  const width = 40;
  const height = 1;
  const lit = new Uint8Array(width * height);
  lit[0] = 1;
  const field = computeNightRemoteField(lit, width, height, 2, 8);
  assert.equal(field[0], 0);
  assert.equal(field[2], 0);
  assert.ok(field[6] > 0 && field[6] < 1);
  assert.equal(field[10], 1);
  assert.equal(field[39], 1);
  for (let i = 1; i < width; i++) assert.ok(field[i] >= field[i - 1]);
});

test('the field measures distance in every direction', () => {
  const size = 21;
  const lit = new Uint8Array(size * size);
  lit[10 * size + 10] = 1;
  const field = computeNightRemoteField(lit, size, size, 0, 10);
  const at = (r, c) => field[r * size + c];
  assert.equal(at(10, 15), at(10, 5));
  assert.equal(at(15, 10), at(5, 10));
  // a diagonal step counts as sqrt 2, not 1
  assert.ok(at(13, 13) > at(10, 13));
  assert.ok(at(13, 13) < at(10, 16));
});

test('an empty map is dark everywhere', () => {
  const field = computeNightRemoteField(new Uint8Array(16), 4, 4, 2, 8);
  assert.ok(field.every((value) => value === 1));
});

test('scaleNightTint darkens each channel', () => {
  assert.equal(scaleNightTint(0xffffff, 0.5), 0x808080);
  assert.equal(scaleNightTint(0x9aa3b4, 1), 0x9aa3b4);
  assert.equal(scaleNightTint(0x9aa3b4, 0), 0);
});
