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
  groundAnchorFromAlpha, displayScaleFor, pointsSpanX, cornerEdgesPx, cartLongLine, ROAST_CHESTNUT_BATCH_MATES,
  STREET_FOOD_PX_PER_METRE_ALONG, STREET_FOOD_TRUE_PX_PER_METRE_UP, CART_LENGTH_M, TABLE_DIAMETER_M, FURNITURE_IDS,
} = require('../scripts/prepare-street-food-assets.js');

const ROOT = path.resolve(__dirname, '..');
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} vs ${expected}`);

test('carts are sized at the 20 m tile\'s own rate: a ground length at ALONG, the true vertical 1.2247x it', () => {
  // TILE_WIDTH 100 px over a 20 m tile's two ground edges: 100 / 40 = 2.5 px a metre
  assert.equal(STREET_FOOD_PX_PER_METRE_ALONG, 100 / (20 * 2));
  near(STREET_FOOD_TRUE_PX_PER_METRE_UP, 2.5 * Math.cos(Math.PI / 6) / Math.cos(Math.PI / 4));
  near(STREET_FOOD_TRUE_PX_PER_METRE_UP, 3.0619, 1e-4);
  near(CART_LENGTH_M, 2.3); // 你睇吓1:20既比例應該要架手推車（紅色線）多長
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

test('cornerEdgesPx splits a corner into its long and short sides, not the span across both', () => {
  // 你邏輯都有些少問題: the X span over both lines is long + short side, not the length
  const edges = cornerEdgesPx([[10, 50], [110, 100]], [[110, 100], [410, -50]]);
  near(edges.frontX, 110);
  near(edges.longPx, 300);
  near(edges.shortPx, 100);
  // segments that stop short of the corner still meet at it
  const partial = cornerEdgesPx([[20, 55], [60, 75]], [[200, 55], [410, -50]]);
  near(partial.frontX, 110);
  near(partial.longPx, 300);
  near(partial.shortPx, 90);
});

test('cartLongLine names the screen diagonal the counter long side runs on, so the renderer can pick art or mirror', () => {
  // long side on the 'up' line (toward the upper right), like every cart in this batch
  assert.equal(cartLongLine({ kind: 'body-cage', top: { down: [[10, 50], [110, 100]], up: [[110, 100], [410, -50]] } }), 'up');
  assert.equal(cartLongLine({ kind: 'body-cage', top: { down: [[-190, -50], [110, 100]], up: [[110, 100], [210, 50]] } }), 'down');
  assert.equal(cartLongLine({ kind: 'axes', axes: {} }), null, 'no lines, no answer');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/street-food-geometry.json'), 'utf8'));
  manifest.assets.filter((a) => a.mirror).forEach((a) => assert.ok(['up', 'down'].includes(a.display.longLine), a.id));
});

test('displayScaleFor anchors a cart to its counter long side, a table to its diameter, by id for the rest - one scale each', () => {
  const fishball = { kind: 'body-cage', id: 'curryFishball', top: { down: [[10, 50], [110, 100]], up: [[110, 100], [410, -50]] } };
  const bodyCage = displayScaleFor(fishball, {});
  assert.equal(bodyCage.scale, (CART_LENGTH_M * 2.5) / 300);
  assert.match(bodyCage.anchorAxis, /long side/);
  assert.equal(bodyCage.scaleX, undefined, 'one uniform scale: a raster scaled unevenly is no longer isometric');

  // roastChestnut's own lines sit on its stove frame: it takes its batch mates' mean scale
  assert.deepEqual(ROAST_CHESTNUT_BATCH_MATES, ['curryFishball', 'friedSnacks']);
  const friedSnacks = { kind: 'body-cage', id: 'friedSnacks', top: { down: [[0, 0], [100, 50]], up: [[100, 50], [300, -50]] } };
  const roastChestnut = displayScaleFor({ kind: 'axes', id: 'roastChestnut', axes: {} }, {}, [fishball, friedSnacks]);
  near(roastChestnut.scale, ((CART_LENGTH_M * 2.5) / 300 + (CART_LENGTH_M * 2.5) / 200) / 2);
  assert.throws(() => displayScaleFor({ kind: 'axes', id: 'roastChestnut', axes: {} }, {}, [fishball]), /batch mates/);

  const table = displayScaleFor({ kind: 'ellipse', id: 'roundTableCream', ellipse: { width: 280 } }, {});
  near(TABLE_DIAMETER_M, 1.5); // 啲檯試試放大50%: from 1.0 m
  assert.equal(table.scale, (TABLE_DIAMETER_M * 2.5) / 280);

  const folded = displayScaleFor({ kind: 'single-axis', id: 'roundTableFolded', axis: [[10, 0], [60, 20]] }, {});
  assert.equal(folded.scale, (0.25 * 2.5) / 50);

  const stool = displayScaleFor({ kind: 'axes', id: 'foldingStoolRed', axes: { down: [[0, 0], [100, 50]], up: [[0, 50], [120, 0]] } }, {});
  assert.equal(stool.scale, (0.32 * 2.5) / 120);
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
  // every body-cage cart's counter long side draws exactly 2.3 m at the tile's ALONG rate
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/source-art/streetFood/isometric-calibration.json'), 'utf8'));
  for (const asset of manifest.assets.filter((a) => a.kind === 'body-cage')) {
    const source = spec.assets.find((a) => a.id === asset.id);
    near(cornerEdgesPx(source.top.down, source.top.up).longPx * asset.display.scale, CART_LENGTH_M * STREET_FOOD_PX_PER_METRE_ALONG, 1e-9);
  }
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
