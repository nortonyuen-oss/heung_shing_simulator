'use strict';

// 車仔檔模型要做2方向既mirror (Norton 2026-10-18) and the display-scale derivation this unlocked:
// scripts/prepare-street-food-assets.js turns the rectified carts/furniture into display-ready
// sprites. These tests exercise its pure helpers plus the shape of the rebuilt manifest, not the
// sharp/file-system pipeline (that is covered by `node scripts/prepare-street-food-assets.js
// --check`, run separately since it touches disk).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  groundAnchorFromAlpha, displayScaleFor, pointsSpanX,
  STREET_FOOD_PX_PER_METRE_ALONG, STREET_FOOD_PX_PER_METRE_UP, CART_COUNTER_HEIGHT_M, FURNITURE_IDS,
} = require('../scripts/prepare-street-food-assets.js');

const ROOT = path.resolve(__dirname, '..');

test('the convention matches the festival people/prop scale, so a cart reads true beside a citizen', () => {
  assert.equal(STREET_FOOD_PX_PER_METRE_ALONG, 2.5);
  assert.equal(STREET_FOOD_PX_PER_METRE_UP, 5);
  assert.equal(CART_COUNTER_HEIGHT_M, 0.65);
  assert.deepEqual(FURNITURE_IDS, ['roundTableCream', 'roundTableMint', 'foldingStoolRed', 'foldingStoolGreen', 'roundTableFolded', 'foldingStoolsPacked']);
});

test('pointsSpanX reads the x-extent regardless of point order or grouping', () => {
  assert.equal(pointsSpanX([[5, 1], [30, 9], [12, 4]]), 25);
  assert.equal(pointsSpanX([[-4, 0], [4, 0]]), 8);
});

test('groundAnchorFromAlpha averages the lowest visible row, ignoring faint and off-row pixels', () => {
  const w = 10, h = 10, data = new Uint8Array(w * h * 4);
  const set = (x, y, a) => { data[(y * w + x) * 4 + 3] = a; };
  // a wedge: solid alpha widening toward the bottom, plus one faint stray pixel lower still
  for (let y = 4; y < 8; y++) for (let x = 3; x <= 6; x++) set(x, y, 255);
  set(1, 9, 50); // below alpha>=128, must not move the bottom row or the mean
  assert.deepEqual(groundAnchorFromAlpha(data, w, h), [4.5, 7]);
  assert.equal(groundAnchorFromAlpha(new Uint8Array(w * h * 4), w, h), null, 'fully transparent has no anchor');
});

test('displayScaleFor anchors a body-cage cart to counter height, a table to its diameter, by id for the rest', () => {
  const bodyCage = displayScaleFor({ kind: 'body-cage' }, { targetDropAtFront: 100 });
  assert.equal(bodyCage.scale, (0.65 * 5) / 100);
  assert.match(bodyCage.anchorAxis, /counter height/);

  const roastChestnut = displayScaleFor({ kind: 'axes', id: 'roastChestnut' }, {});
  near(roastChestnut.scale, (0.65 * 5) / 104.85);

  const table = displayScaleFor({ kind: 'ellipse', ellipse: { width: 280 } }, {});
  assert.equal(table.scale, (1.0 * 2.5) / 280);

  const folded = displayScaleFor({ kind: 'single-axis', id: 'roundTableFolded', axis: [[10, 0], [60, 20]] }, {});
  assert.equal(folded.scale, (0.25 * 2.5) / 50);

  const stool = displayScaleFor({ kind: 'axes', id: 'foldingStoolRed', axes: { down: [[0, 0], [100, 50]], up: [[0, 50], [120, 0]] } }, {});
  assert.equal(stool.scale, (0.32 * 2.5) / 120);

  function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`); }
});

test('the rebuilt geometry gives every cart a mirror and a ground anchor, furniture neither mirror', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/street-food-geometry.json'), 'utf8'));
  assert.equal(manifest.assets.length, 18);
  for (const asset of manifest.assets) {
    assert.ok(Array.isArray(asset.groundAnchor) && asset.groundAnchor.length === 2, `${asset.id}: groundAnchor`);
    assert.ok(asset.groundAnchor[0] >= 0 && asset.groundAnchor[0] < asset.outputSize[0], `${asset.id}: groundAnchor.x in bounds`);
    assert.ok(Number.isFinite(asset.display?.scale) && asset.display.scale > 0, `${asset.id}: display.scale`);
    if (FURNITURE_IDS.includes(asset.id)) {
      assert.equal(asset.mirror, undefined, `${asset.id}: furniture is not mirrored`);
    } else {
      assert.ok(asset.mirror, `${asset.id}: cart must have a mirror`);
      assert.ok(fs.existsSync(path.join(ROOT, asset.mirror.outputPath)), `${asset.id}: mirror file exists`);
      const [w] = asset.outputSize;
      assert.deepEqual(asset.mirror.groundAnchor, [w - 1 - asset.groundAnchor[0], asset.groundAnchor[1]]);
    }
  }
  // every cart lands near the same waist-height counter, not a mix of toy and giant carts
  const cartScales = manifest.assets.filter((a) => !FURNITURE_IDS.includes(a.id)).map((a) => a.display.scale * a.outputSize[1]);
  const displayHeights = cartScales; // screen px at zoom 1
  const min = Math.min(...displayHeights), max = Math.max(...displayHeights);
  assert.ok(max / min < 2, `cart display heights should stay within 2x of each other, got ${min}..${max}`);
});

test('a mirrored PNG is the true horizontal flip of its cart, same size, non-trivial content', async () => {
  const sharp = require('sharp');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/street-food-geometry.json'), 'utf8'));
  const asset = manifest.assets.find((a) => a.id === 'curryFishball');
  const [a, b] = await Promise.all([
    sharp(path.join(ROOT, asset.outputPath)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(path.join(ROOT, asset.mirror.outputPath)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  assert.equal(a.info.width, b.info.width);
  assert.equal(a.info.height, b.info.height);
  let differingPixels = 0, opaquePixels = 0;
  for (let y = 0; y < a.info.height; y++) {
    for (let x = 0; x < a.info.width; x++) {
      const p = (y * a.info.width + x) * 4, q = (y * a.info.width + (a.info.width - 1 - x)) * 4;
      if (a.data[p + 3] >= 128) opaquePixels++;
      for (let c = 0; c < 4; c++) if (a.data[p + c] !== b.data[q + c]) { differingPixels++; break; }
    }
  }
  assert.equal(differingPixels, 0, 'mirror must be an exact column-reversal, not a re-render');
  assert.ok(opaquePixels > 1000, 'sanity: the source cart has real content');
});
