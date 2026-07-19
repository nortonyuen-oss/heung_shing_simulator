const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONSERVATIVE_DEFRINGE_OPTIONS,
  defringeWhiteMatteRgba,
  recoverWhiteMatteColor,
} = require('../scripts/lib/defringe-model');

function rgba(...pixels) {
  return Buffer.from(pixels.flat());
}

test('white matte recovery reconstructs the foreground colour', () => {
  const recovered = recoverWhiteMatteColor([155, 165, 175], 128);
  assert.deepEqual(recovered, [56, 76, 96]);
});

test('defringe replaces white-matted edge RGB while preserving alpha and silhouette', () => {
  const input = rgba(
    [0, 0, 0, 0],
    [155, 165, 175, 128],
    [55, 75, 95, 255],
  );
  const result = defringeWhiteMatteRgba(input, 3, 1);

  assert.equal(result.stats.changedPixels, 1);
  assert.deepEqual([...result.data.subarray(0, 4)], [0, 0, 0, 0]);
  assert.deepEqual([...result.data.subarray(4, 8)], [56, 76, 96, 128]);
  assert.deepEqual([...result.data.subarray(8, 12)], [55, 75, 95, 255]);
});

test('defringe leaves correct dark antialiasing and legitimate white edges alone', () => {
  const dark = rgba(
    [0, 0, 0, 0],
    [55, 75, 95, 128],
    [55, 75, 95, 255],
  );
  const white = rgba(
    [0, 0, 0, 0],
    [255, 255, 255, 128],
    [255, 255, 255, 255],
  );

  assert.deepEqual(defringeWhiteMatteRgba(dark, 3, 1).data, dark);
  assert.deepEqual(defringeWhiteMatteRgba(white, 3, 1).data, white);
});

test('defringe looks through a five-pixel generated white feather', () => {
  const pixels = [
    [0, 0, 0, 0],
    [250, 250, 250, 35],
    [245, 245, 245, 70],
    [235, 235, 235, 105],
    [225, 225, 225, 140],
    [210, 210, 210, 175],
    [45, 65, 85, 255],
  ];
  const input = rgba(...pixels);
  const result = defringeWhiteMatteRgba(input, pixels.length, 1);

  assert.equal(result.stats.changedPixels, 5);
  assert.deepEqual(
    [...result.data].filter((_, index) => index % 4 === 3),
    pixels.map((pixel) => pixel[3]),
    'alpha values must not change',
  );
  assert.ok(result.data[4] < input[4], 'outer white edge should inherit an interior colour');
});

test('defringe rejects malformed raw image input', () => {
  assert.throws(() => defringeWhiteMatteRgba(Buffer.alloc(3), 1, 1), /Expected 4 RGBA bytes/);
});

test('manual conservative preset protects fine antialiasing', () => {
  const input = rgba(
    [0, 0, 0, 0],
    [205, 210, 215, 210],
    [160, 170, 180, 245],
    [70, 80, 90, 255],
  );
  const diagnostic = defringeWhiteMatteRgba(input, 4, 1);
  const conservative = defringeWhiteMatteRgba(input, 4, 1, CONSERVATIVE_DEFRINGE_OPTIONS);

  assert.ok(conservative.stats.changedPixels < diagnostic.stats.changedPixels);
  assert.deepEqual(
    [...conservative.data].filter((_, index) => index % 4 === 3),
    [0, 210, 245, 255],
    'manual correction must preserve the complete alpha silhouette',
  );
});
