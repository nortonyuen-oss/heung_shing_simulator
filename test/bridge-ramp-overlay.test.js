const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const slice = (name) => {
  const start = main.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `${name} must remain extractable`);
  return main.slice(start, main.indexOf('\n}\n', start) + 3);
};

function createContext() {
  const context = vm.createContext({ Uint8Array });
  ['createBridgeRampSurfaceMask', 'isBridgeRampEarthPixel', 'isInsideBridgeRampDeckHalf'].forEach((name) => vm.runInContext(slice(name), context));
  return (expr) => vm.runInContext(expr, context);
}

// A 16x16 ramp facsimile: opaque everywhere, grey structure with a brown earth base along the
// bottom rows and a grass strip at the left; the deck lies to the visual north (up-right).
function makeImage() {
  const width = 16; const height = 16;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let rgb = [160, 160, 160];               // concrete shoulder / asphalt-ish grey
      if (y >= 14) rgb = [160, 120, 88];        // brown earth base (the road art's muted brown)
      if (x <= 1) rgb = [60, 140, 60];          // grass strip
      if (x >= 6 && x <= 9) rgb = [90, 90, 90]; // asphalt band
      data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

test('the ramp overlay carries the whole deck-side half of the structure, minus earth and grass', () => {
  const run = createContext();
  const image = makeImage();
  const mask = run('createBridgeRampSurfaceMask')(image, image.width, image.height, { minX: 0, maxX: 15, minY: 0, maxY: 15 }, 'n');
  const at = (x, y) => mask[y * image.width + x];
  // Deck side for 'n' is up-right (xNorm - yNorm >= -0.05): the top-right corner is in, bottom-left out.
  assert.equal(at(14, 1), 1, 'top-right structure is fronted');
  assert.equal(at(12, 3), 1, 'a light shoulder pixel is fronted too (not only asphalt)');
  assert.equal(at(8, 4), 1, 'asphalt in the deck half');
  assert.equal(at(2, 13), 0, 'far side of the ramp stays in the body');
  assert.equal(at(14, 14), 0, 'the brown earth base is never fronted');
  assert.equal(at(1, 1), 0, 'grass is never fronted');
  assert.equal(at(8, 12), 0, 'the low half stays in the body');
  // The other visual directions mirror the test.
  const east = run('createBridgeRampSurfaceMask')(image, image.width, image.height, { minX: 0, maxX: 15, minY: 0, maxY: 15 }, 'e');
  assert.equal(east[14 * image.width + 13], 0, 'bottom-right earth row is never fronted');
  assert.equal(east[12 * image.width + 13], 1, 'bottom-right structure fronts an east deck');
  assert.equal(east[1 * image.width + 3], 0, 'top-left is the far side for east');
  assert.equal(run('isBridgeRampEarthPixel')(160, 120, 88), true);
  assert.equal(run('isBridgeRampEarthPixel')(184, 144, 96), true);
  assert.equal(run('isBridgeRampEarthPixel')(208, 176, 88), false, 'antialiased yellow kerb paint is structure');
  assert.equal(run('isBridgeRampEarthPixel')(60, 140, 60), true);
  assert.equal(run('isBridgeRampEarthPixel')(160, 160, 160), false);
  assert.equal(run('isBridgeRampEarthPixel')(220, 180, 60), false, 'yellow kerb paint is structure');
});
