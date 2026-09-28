const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function sliceFunction(name) {
  const start = mainSource.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `${name} must remain extractable from main.js`);
  const end = mainSource.indexOf('\n}\n', start) + 3;
  return mainSource.slice(start, end);
}

function createContext() {
  const context = vm.createContext({});
  vm.runInContext('const PROP_ATLAS_WIDTH = 2048; const PROP_ATLAS_PADDING = 4;', context);
  vm.runInContext(sliceFunction('layoutPropAtlas'), context, { filename: 'main.js#layoutPropAtlas' });
  return context;
}

test('the prop atlas layout keeps every frame apart, inside the atlas, with a power-of-two height', () => {
  const { layoutPropAtlas } = createContext();
  // The real mix: 22 furniture 256x256, 4 railings 512x512, lamps/signals 128x256, parapets, bus stops.
  const items = [];
  const add = (prefix, count, width, height) => {
    for (let i = 0; i < count; i++) items.push({ key: `${prefix}${i}`, width, height });
  };
  add('furniture', 22, 256, 256);
  add('railing', 4, 512, 512);
  add('lamp', 6, 128, 256);
  add('lampLit', 2, 256, 256);
  add('signal', 14, 128, 256);
  add('parapet', 4, 256, 256);
  add('parapetLow', 2, 256, 128);
  add('busStop', 2, 256, 256);
  add('busStopNarrow', 2, 128, 256);
  const layout = layoutPropAtlas(items);
  assert.ok(layout, 'fits');
  assert.equal(layout.width, 2048);
  assert.equal(layout.height & (layout.height - 1), 0, 'power of two');
  assert.ok(layout.height <= 4096, `height ${layout.height}`);
  const rects = items.map((item) => ({ ...layout.placed.get(item.key), w: item.width, h: item.height, key: item.key }));
  rects.forEach((r) => {
    assert.ok(r.x >= 4 && r.y >= 4, `${r.key} keeps its padding from the edge`);
    assert.ok(r.x + r.w + 4 <= layout.width && r.y + r.h + 4 <= layout.height, `${r.key} inside`);
  });
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const apart = a.x + a.w + 8 <= b.x || b.x + b.w + 8 <= a.x || a.y + a.h + 8 <= b.y || b.y + b.h + 8 <= a.y;
      assert.ok(apart, `${a.key} and ${b.key} stay 8 px apart`);
    }
  }
  assert.equal(layoutPropAtlas([{ key: 'huge', width: 4000, height: 10 }]), null, 'a frame wider than the atlas does not fit');
});

test('props read their size off the base frame, so a frame of the atlas anchors like its own texture', () => {
  for (const file of ['street-furniture.js', 'street-lamps.js', 'traffic-signals.js', 'bridge-parapets.js', 'pedestrian-railings.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.match(source, /const texture = scene\.textures\.get\(textureKey\)\?\.get\?\.\(\);/, file);
    assert.doesNotMatch(source, /textures\.get\(textureKey\)\?\.getSourceImage/, file);
  }
  assert.match(mainSource, /textures\?\.get\?\.\(`bus_stop_\$\{corner\}`\)\?\.get\?\.\(\)/);
  assert.match(mainSource, /installAdaptiveDepthSort\(this\.sys\?\.displayList\);\n  packStreetPropTextures\(this\);/, 'packed at create, before any prop is placed');
});
