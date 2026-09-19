const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function fixture() {
  const textures = new Map();
  const calls = { paints: 0, clears: 0, removes: 0, images: 0, sorts: 0 };
  const scene = {
    textures: {
      exists: (key) => textures.has(key),
      get: (key) => textures.get(key),
      remove(key) { calls.removes++; textures.delete(key); },
    },
    worldMask: {},
    add: { image(x, y, key) { calls.images++; return Object.assign(displayObject(), { x, y, key }); } },
  };
  function displayObject() {
    return {
      x: 123, y: 456, scaleX: 0.2, scaleY: 0.3, alpha: 0.4, depth: 5, visible: true, blendMode: 1,
      setPosition(x, y) { this.x = x; this.y = y; return this; },
      setScale(x, y = x) { this.scaleX = x; this.scaleY = y; return this; },
      setAlpha(value) { this.alpha = value; return this; },
      setDepth(value) { this.depth = value; calls.sorts++; return this; },
      setVisible(value) { this.visible = value; return this; },
      setOrigin(x, y) { this.originX = x; this.originY = y; return this; },
      setBlendMode(value) { this.blendMode = value; return this; },
      setMask(mask) { this.mask = mask; return this; },
      destroy() { this.destroyed = true; },
    };
  }
  const g = Object.assign(displayObject(), {
    commandBuffer: [99],
    translateCanvas(x, y) { this.commandBuffer.push('translate', x, y); return this; },
    generateTexture(key, width, height) {
      calls.paints++;
      calls.paint = { x: this.x, y: this.y, scale: this.scaleX, alpha: this.alpha, commands: [...this.commandBuffer] };
      textures.set(key, { width, height, context: { clearRect() { calls.clears++; } } });
    },
  });
  const glow = { gfx: g, image: null, windowsAllowed: true, textureManager: scene.textures };
  const context = vm.createContext({ scene, glow });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../building-lighting.js'), 'utf8'), context);
  return { scene, glow, g, textures, calls, run: (code) => vm.runInContext(code, context) };
}

test('glow cache crops geometry without moving the building anchor and reuses its texture', () => {
  const f = fixture();
  const commands = f.g.commandBuffer;
  const bounds = '{ minX: -40, minY: 20, maxX: 60, maxY: 140 }';
  f.run(`cacheBuildingLightBitmap(scene, glow, ${bounds})`);
  const image = f.glow.image;
  const texture = f.textures.get(f.glow.textureKeyForGlow);
  assert.equal(texture.width, 104);
  assert.equal(texture.height, 124);
  assert.equal(image.mask, f.scene.worldMask);
  assert.equal(image.blendMode, 1);
  assert.equal(image.alpha, 0.4);
  assert.equal(image.x + (42 - image.originX * texture.width) * image.scaleX, 123);
  assert.equal(image.y + (-18 - image.originY * texture.height) * image.scaleY, 456);
  assert.equal(f.g.commandBuffer, commands, 'painting restores the retained geometry');
  assert.deepEqual([f.g.x, f.g.y, f.g.scaleX, f.g.scaleY, f.g.alpha], [123, 456, 0.2, 0.3, 0.4]);
  assert.equal(f.calls.paint.alpha, 1, 'strength is applied to the cached image, not baked twice');
  f.run(`cacheBuildingLightBitmap(scene, glow, ${bounds})`);
  assert.equal(f.glow.image, image);
  assert.equal(f.textures.size, 1);
  assert.equal(f.calls.clears, 1, 'a relight clears old windows before painting the new pattern');
  const sorts = f.calls.sorts;
  for (let i = 0; i < 10; i++) f.run('syncBuildingLightBitmap(glow)');
  assert.equal(f.calls.paints, 2, 'ordinary frames do not repaint or upload the light texture');
  assert.equal(f.calls.sorts, sorts, 'unchanged depth must not schedule a sort each frame');
});

test('glow texture resolution is bounded and resizing, hiding and destruction release GPU textures', () => {
  const f = fixture();
  f.run('cacheBuildingLightBitmap(scene, glow, { minX: -1000, minY: -1000, maxX: 1000, maxY: 2000 })');
  const firstImage = f.glow.image;
  const texture = f.textures.get(f.glow.textureKeyForGlow);
  assert.ok(texture.width <= 512 && texture.height <= 512);
  assert.ok(f.glow.bitmapScale < 1);
  f.run('cacheBuildingLightBitmap(scene, glow, { minX: 0, minY: 0, maxX: 20, maxY: 20 })');
  assert.equal(firstImage.destroyed, true);
  assert.equal(f.textures.size, 1);
  f.run('glow.windowsAllowed = false; cacheBuildingLightBitmap(scene, glow, { minX: 0, minY: 0, maxX: 20, maxY: 20 })');
  assert.equal(f.textures.size, 0);
  assert.equal(f.glow.image, null);
  f.run('glow.windowsAllowed = true; cacheBuildingLightBitmap(scene, glow, { minX: 0, minY: 0, maxX: 20, maxY: 20 }); destroyBuildingLightGlow(glow)');
  assert.equal(f.textures.size, 0);
  assert.equal(f.g.destroyed, true);
});

test('beacon-only and empty glows never allocate a static bitmap', () => {
  const f = fixture();
  f.run('glow.beaconsOnly = true; cacheBuildingLightBitmap(scene, glow, { minX: 0, minY: 0, maxX: 20, maxY: 20 })');
  f.run('glow.beaconsOnly = false; cacheBuildingLightBitmap(scene, glow, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })');
  assert.equal(f.calls.images, 0);
  assert.equal(f.calls.paints, 0);
});
