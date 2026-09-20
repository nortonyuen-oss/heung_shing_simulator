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

const fs = require('node:fs');
const vm = require('node:vm');
const mainSource = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const sliceFunction = (name) => {
  const start = mainSource.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `${name} must remain extractable from main.js`);
  return mainSource.slice(start, mainSource.indexOf('\n}\n', start) + 3);
};

// The staged tree can lag a bake (change the canvas, launch before re-staging): the manifest
// then describes the old canvas and the anchor/scale mapping would put every pole in the
// wrong place at the wrong size. A prop whose staged source size disagrees with the code's
// canvas loads its source PNG instead, like a prop that was never staged.
test('a staged prop whose canvas disagrees with the code falls back to the source PNG', () => {
  const context = vm.createContext({
    modelAssetManifest: { entries: {} },
    modelAssetVersion: 'v1',
    normalizeModelLogicalPath: (p) => p,
    encodeURI, encodeURIComponent,
  });
  vm.runInContext(sliceFunction('resolveModelAssetPath') + sliceFunction('resolvePropAssetPath'), context);
  const resolve = vm.runInContext('resolvePropAssetPath', context);
  const canvas = { width: 256, height: 256 };
  const file = 'Models/traffic/lightPost/lightPost_SW.png';
  assert.equal(resolve(file, canvas), file, 'not staged: the source PNG');
  context.modelAssetManifest.entries[file] = { packagedPath: 'Models/traffic/lightPost/lightPost_SW.webp', hash: 'abc', sourceWidth: 960, sourceHeight: 880 };
  assert.equal(resolve(file, canvas), file, 'stale staging from the 960x880 bake: the source PNG');
  context.modelAssetManifest.entries[file] = { packagedPath: 'Models/traffic/lightPost/lightPost_SW.webp', hash: 'abc', sourceWidth: 256, sourceHeight: 256 };
  assert.equal(resolve(file, canvas), 'Models/traffic/lightPost/lightPost_SW.webp?asset=abc', 'current staging: the packaged file');
  assert.equal(resolve(file, null), 'Models/traffic/lightPost/lightPost_SW.webp?asset=abc', 'no canvas to check against: the packaged file');
  // The preload passes each family's canvas.
  assert.match(mainSource, /resolvePropAssetPath\(file, TRAFFIC_SIGNAL_SOURCE_CANVAS\)/);
  assert.match(mainSource, /resolvePropAssetPath\(file, STREET_LAMP_SOURCE_CANVAS\)/);
  assert.match(mainSource, /resolvePropAssetPath\(file, BRIDGE_PARAPET_SOURCE_CANVAS\)/);
});
