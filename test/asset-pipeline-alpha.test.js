const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const source = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

// sharp 0.34 reports `premultiplied: true` in the info of a resize's raw output even though the
// bytes are straight alpha; feeding that info back as a raw input makes sharp unpremultiply a
// second time and brighten every semi-transparent pixel (edges, glows, light pools). The asset
// scripts therefore declare premultiplied: false on every raw input.
test('a semi-transparent colour survives resize -> raw -> encode only when the raw input is declared straight', async () => {
  const size = 64;
  const raw = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      raw[i] = 236; raw[i + 1] = 130; raw[i + 2] = 38; raw[i + 3] = 150; // sodium orange at 59% alpha
    }
  }
  const resized = await sharp(raw, { raw: { width: size, height: size, channels: 4, premultiplied: false } })
    .resize({ width: 32, height: 32 }).raw().toBuffer({ resolveWithObject: true });
  const centre = (buf, w) => Array.from(buf.subarray(((w / 2) * w + w / 2) * 4, ((w / 2) * w + w / 2) * 4 + 4));
  const afterResize = centre(resized.data, 32);
  // Premultiply/unpremultiply rounding inside the resize may move a channel by one.
  afterResize.slice(0, 3).forEach((v, i) => assert.ok(Math.abs(v - [236, 130, 38][i]) <= 2, `the resize itself keeps the colour (${afterResize})`));

  const declared = await sharp(resized.data, { raw: { ...resized.info, premultiplied: false } }).webp({ lossless: true }).toBuffer();
  const decoded = await sharp(declared).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual(centre(decoded.data, 32), afterResize, 'declared straight: bit-exact through lossless WebP');

  if (resized.info.premultiplied === true) {
    const undeclared = await sharp(resized.data, { raw: resized.info }).webp({ lossless: true }).toBuffer();
    const bad = await sharp(undeclared).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.notDeepEqual(centre(bad.data, 32).slice(0, 3), [236, 130, 38], 'passing the resize info back unpremultiplies again (the bug this guards)');
  }
});

test('every raw buffer in the asset scripts is declared straight alpha', () => {
  const prepare = source('scripts/prepare-release-assets.js');
  assert.match(prepare, /premultiplied: false/);
  assert.equal((prepare.match(/sharp\([^)]*\{ raw: [a-zA-Z.]+ \}\)/g) || []).length, 0, 'no bare `{ raw: info }` inputs remain in prepare-release-assets.js');
  assert.match(prepare, /const SETTINGS_VERSION = 6;/, 'the cache key changed with the fix');
  const verify = source('scripts/verify-release-assets.js');
  assert.equal((verify.match(/sharp\([^)]*\{ raw: [a-zA-Z.]+ \}\)/g) || []).length, 0, 'no bare `{ raw: info }` inputs remain in verify-release-assets.js');
  assert.match(verify, /premultiplied: false/);
  const bake = source('scripts/bake-night-textures.js');
  assert.match(bake, /sharp\(raw, \{ raw: \{ width, height, channels: 4, premultiplied: false \} \}\)/);
});
