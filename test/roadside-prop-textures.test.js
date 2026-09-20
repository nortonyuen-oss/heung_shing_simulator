const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const signals = require(path.join(ROOT, 'traffic-signals.js'));
const lamps = require(path.join(ROOT, 'street-lamps.js'));

// Phaser only mipmaps power-of-two textures (render.mipmapFilter, main.js). The roadside props
// are drawn at a small fraction of their art (a signal pole ~20 px, a lamp post ~40 px at
// zoom 1), so their bakes finish on a 256x256 canvas: mipmapped in a dev launch exactly as
// the release pipeline's (also power-of-two, <=256) staging is, with no jaggies either way.
const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;

for (const [family, files, anchor] of [
  ['traffic signal', signals.TRAFFIC_SIGNAL_TEXTURE_FILES, signals.TRAFFIC_SIGNAL_SOURCE_ANCHOR],
  ['street lamp', lamps.STREET_LAMP_TEXTURE_FILES, lamps.STREET_LAMP_SOURCE_ANCHOR],
]) {
  test(`${family} textures are 256x256 power-of-two canvases with the anchor inside`, async () => {
    const entries = Object.values(files);
    assert.ok(entries.length > 0);
    for (const file of entries) {
      const { width, height } = await sharp(path.join(ROOT, file)).metadata();
      assert.ok(isPow2(width) && isPow2(height) && width <= 256 && height <= 256, `${file} is ${width}x${height}`);
      assert.ok(anchor.x <= width && anchor.y <= height, `${file}: anchor (${anchor.x}, ${anchor.y}) inside`);
    }
  });
}
