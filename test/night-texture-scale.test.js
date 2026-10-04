const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// fitNightTextureToDay (day-night-lighting.js), run against a stand-in for Phaser's texture
// manager: a Frame maps its cut onto the source by cut / source size (Frame#updateUVs).
const source = fs.readFileSync(path.join(__dirname, '..', 'day-night-lighting.js'), 'utf8');
const start = source.indexOf('function fitNightTextureToDay(');
const end = source.indexOf('\n}\n', start) + 3;
// eslint-disable-next-line no-new-func
const fitNightTextureToDay = new Function(`${source.slice(start, end)}; return fitNightTextureToDay;`)();

function texture(width, height) {
  const src = { width, height };
  const frame = {
    source: src, width, height, u1: 1, v1: 1,
    setSize(w, h) { this.width = w; this.height = h; this.u1 = w / src.width; this.v1 = h / src.height; return this; },
  };
  return { source: [src], get: () => frame };
}

test('night art shipped at half size is drawn over the whole day frame', () => {
  const textures = { day: texture(256, 512), night: texture(128, 256) };
  const scene = { textures: { get: (k) => textures[k], exists: (k) => !!textures[k] } };
  fitNightTextureToDay(scene, 'night', 'day');
  const frame = textures.night.get();
  assert.deepEqual([frame.width, frame.height], [256, 512], 'the sprite keeps its size');
  assert.deepEqual([frame.u1, frame.v1], [1, 1], 'and samples the whole (small) image');
  // full-size night art is left as it is
  const same = { day: texture(256, 256), night: texture(256, 256) };
  fitNightTextureToDay({ textures: { get: (k) => same[k], exists: (k) => !!same[k] } }, 'night', 'day');
  assert.equal(same.night.get().width, 256);
});
