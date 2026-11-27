const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const build = require('../scripts/compressed-textures.js');

// A KTX the way the build writes one: three 6x6 levels of made-up blocks and an alpha mask.
function sampleKtx() {
  const rgba = Buffer.alloc(8 * 4 * 4);
  rgba[(1 * 8 + 6) * 4 + 3] = 200; // one opaque pixel at (6, 1)
  const mask = build.alphaMask(rgba, 8, 4, 4);
  const levels = [Buffer.alloc(32, 1), Buffer.alloc(16, 2), Buffer.alloc(16, 3), Buffer.alloc(16, 4)];
  return build.writeKtx({ internalFormat: build.ASTC_INTERNAL_FORMATS['6x6'], width: 8, height: 4, levels,
    keyValues: [build.keyValue(build.ALPHA_MASK_KEY, build.encodeAlphaMask(mask))] });
}

const loadRuntime = (globals = {}) => {
  const context = vm.createContext({ URLSearchParams, Blob, Response, DataView, Uint8Array, String, Math, Map, Set, ...globals });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'gpu-texture-compression.js'), 'utf8'), context);
  return context;
};

test('the build compresses building art and the night art a phone uses, nothing whose pixels are read', () => {
  const yes = ['Models/commercial/4x4/commercialBuilding4-01-H.png', 'Models/specialSites/4x4/exhibitionCentre4-01__night.png',
    'Models/residential/house2x2/residential2-01-M-HD__nightdeep.png', 'Models/government/4x4/a__nightchristmas.png'];
  const no = ['Models/specialSites/4x4/exhibitionCentre4-01__nighthalf.png', 'Models/residential/house2x2/x__nightlamps.png',
    'Models/metroViaduct/a.png', 'Models/festivals/a.png', 'Models/typhoonShelter/a.png', 'UI/a.png'];
  yes.forEach((p) => assert.ok(build.isCompressedModelTexture(p), p));
  no.forEach((p) => assert.ok(!build.isCompressedModelTexture(p), p));
});

test('a KTX holds its levels and alpha mask; the game reads the mask back', () => {
  const ktx = sampleKtx();
  const read = build.readKtx(ktx);
  assert.equal(read.width, 8);
  assert.equal(read.height, 4);
  assert.equal(read.internalFormat, 0x93B4);
  assert.deepEqual(read.levels.map((l) => l.length), [32, 16, 16, 16]);
  const runtime = loadRuntime();
  const buffer = ktx.buffer.slice(ktx.byteOffset, ktx.byteOffset + ktx.length);
  const mask = runtime.readGpuTextureAlphaMask(buffer);
  assert.deepEqual([mask.w, mask.h, mask.scale], [2, 1, 4]);
  assert.deepEqual([...mask.data], [0, 200], 'each cell keeps the most opaque pixel under it');
  assert.notEqual(mask.data.buffer, buffer, 'a copy, so the file can be let go');
});

test('compressed art loads on a phone browser with ASTC, and nowhere else', () => {
  const ctx = (config, profile, astc, extra = {}) => loadRuntime({
    HEUNG_SHING_CONFIG: config, getMemoryProfile: () => profile, DecompressionStream: function DecompressionStream() {}, ...extra,
    renderer: { gl: {}, compression: { ASTC: astc } },
  });
  const enabled = (c) => vm.runInContext('gpuTexturesEnabled(renderer)', c);
  assert.equal(enabled(ctx({ platform: 'web' }, 'low', {})), true);
  assert.equal(enabled(ctx({ platform: 'web' }, 'low', false)), false, 'no ASTC: the WebP');
  assert.equal(enabled(ctx({ platform: 'web' }, 'web', {})), false, "a computer's browser keeps the WebP");
  assert.equal(enabled(ctx({ platform: 'desktop' }, 'desktop', {})), false, 'the Electron app is unchanged');
  assert.equal(enabled(ctx({ platform: 'web' }, 'low', {}, { location: { search: '?gpuTextures=off' } })), false);
  assert.equal(enabled(ctx({ platform: 'web' }, 'web', {}, { location: { search: '?gpuTextures=on' } })), true);
  assert.equal(enabled(ctx({ platform: 'web' }, 'low', {}, { DecompressionStream: undefined })), false);
});

test('a picture is found by its logical path or its shipped one, with or without a query', () => {
  const c = loadRuntime({ modelAssetManifest: { entries: {
    'Models/commercial/4x4/a.png': { packagedPath: 'assets/aaa.webp', compressed: { astc: 'assets/bbb.ktxz' } },
    'Models/roads/x.png': { packagedPath: 'assets/ccc.webp' },
  } } });
  const url = (u) => vm.runInContext(`getGpuTextureUrl(${JSON.stringify(u)})`, c);
  assert.equal(url('Models/commercial/4x4/a.png'), 'assets/bbb.ktxz');
  assert.equal(url('assets/aaa.webp?asset=123'), 'assets/bbb.ktxz');
  assert.equal(url('/Models/commercial/4x4/a.png?v=2'), 'assets/bbb.ktxz');
  assert.equal(url('assets/ccc.webp'), null);
});

test("a compressed texture's pixel alpha comes from its mask; other textures ask Phaser as before", () => {
  class File {}
  const textures = {};
  function TextureManager() {}
  TextureManager.prototype.getFrame = (key) => textures[key];
  TextureManager.prototype.getPixelAlpha = () => 'phaser';
  function LoaderPlugin() {}
  const types = { image() { return 'image'; } };
  const FileTypesManager = { install(loader) { Object.assign(loader, types); }, register(key, fn) { types[key] = fn; } };
  const c = loadRuntime({ Phaser: { Loader: { File, LoaderPlugin, FileTypesManager, FILE_PROCESSING: 14 }, Textures: { TextureManager, Parsers: {} } } });
  const mask = { w: 2, h: 1, scale: 4, data: new Uint8Array([0, 200]) };
  const cut = { x: 0, y: 0, r: 8, b: 4 };
  textures.astc = { x: 0, y: 0, data: { cut }, source: { compressionAlgorithm: 0x93B4, texture: { hsAlphaMask: mask } } };
  textures.webp = { x: 0, y: 0, data: { cut }, source: {} };
  const manager = new TextureManager();
  assert.equal(manager.getPixelAlpha(6, 1, 'astc'), 200);
  assert.equal(manager.getPixelAlpha(1, 1, 'astc'), 0);
  assert.equal(manager.getPixelAlpha(9, 1, 'astc'), null, 'outside the frame');
  assert.equal(manager.getPixelAlpha(6, 1, 'webp'), 'phaser');
  assert.ok(c.Phaser.Loader.LoaderPlugin.prototype.__hsGpuTextures);
  // the image file type every new loader gets is the one that can pick the compressed copy
  const loader = {};
  FileTypesManager.install(loader);
  assert.notEqual(loader.image, undefined);
  assert.equal(loader.image.call({ systems: { game: { renderer: null } } }, 'k', 'Models/a.png'), 'image', 'not a phone: the WebP');
});

test('a compressed texture counts its blocks, not four bytes a pixel', () => {
  const context = vm.createContext({ HEUNG_SHING_CONFIG: { platform: 'web' } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'memory-budget.js'), 'utf8'), context);
  const bytes = vm.runInContext('estimateTextureBytes({ source: [{ width: 1024, height: 1024, compressionAlgorithm: 0x93B4, hsGpuBytes: 626688 }] })', context);
  assert.equal(bytes, 626688);
});

test('the web build makes the compressed copies and index.html loads the runtime', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('memory-budget.js') < html.indexOf('gpu-texture-compression.js'));
  assert.ok(html.indexOf('phaser@3.60.0') < html.indexOf('gpu-texture-compression.js'));
  const web = fs.readFileSync(path.join(ROOT, 'scripts/build-web.js'), 'utf8');
  assert.match(web, /isCompressedModelTexture/);
  assert.match(web, /compressed = \{ astc: name/);
});
