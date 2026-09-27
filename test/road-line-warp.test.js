const assert = require('node:assert/strict');
const test = require('node:test');
const {
  computeQuadWarpCoefficients,
  invertQuadWarpPoint,
  warpQuadImageOnto,
} = require('../road-line-warp.js');

function forwardMap(coef, u, v) {
  const denom = coef.g * u + coef.h * v + 1;
  return { x: (coef.a * u + coef.b * v + coef.c) / denom, y: (coef.d * u + coef.e * v + coef.f) / denom };
}

test('the four unit-square corners round-trip through the forward and inverse map', () => {
  // A genuine (non-parallelogram) quad: the bottom edge is wider than the top, like a road
  // marking laid flat and viewed with the near edge closer to camera.
  const corners = [[20, 10], [80, 10], [95, 60], [5, 60]];
  const coef = computeQuadWarpCoefficients(corners);
  const unitCorners = [[0, 0], [1, 0], [1, 1], [0, 1]];
  unitCorners.forEach(([u, v], i) => {
    const { x, y } = forwardMap(coef, u, v);
    assert.ok(Math.abs(x - corners[i][0]) < 1e-6, `corner ${i} x`);
    assert.ok(Math.abs(y - corners[i][1]) < 1e-6, `corner ${i} y`);
    const inv = invertQuadWarpPoint(coef, x, y);
    assert.ok(Math.abs(inv.u - u) < 1e-6, `corner ${i} inverted u`);
    assert.ok(Math.abs(inv.v - v) < 1e-6, `corner ${i} inverted v`);
  });
});

test('a parallelogram quad reduces to a plain affine map (g = h = 0)', () => {
  // Bottom edge is a pure translation of the top edge - already a parallelogram.
  const corners = [[10, 10], [50, 10], [60, 40], [20, 40]];
  const coef = computeQuadWarpCoefficients(corners);
  assert.ok(Math.abs(coef.g) < 1e-9);
  assert.ok(Math.abs(coef.h) < 1e-9);
});

test('warpQuadImageOnto paints a solid source flush into an axis-aligned square', () => {
  const srcWidth = 4;
  const srcHeight = 4;
  const src = new Uint8ClampedArray(srcWidth * srcHeight * 4);
  for (let i = 0; i < src.length; i += 4) { src[i] = 200; src[i + 1] = 40; src[i + 2] = 40; src[i + 3] = 255; }

  const dstWidth = 10;
  const dstHeight = 10;
  const dst = new Uint8ClampedArray(dstWidth * dstHeight * 4); // starts fully transparent black

  warpQuadImageOnto({
    src, srcWidth, srcHeight, dst, dstWidth, dstHeight,
    corners: [[2, 2], [8, 2], [8, 8], [2, 8]],
  });

  const at = (x, y) => {
    const i = (y * dstWidth + x) * 4;
    return { r: dst[i], g: dst[i + 1], b: dst[i + 2], a: dst[i + 3] };
  };
  assert.deepEqual(at(5, 5), { r: 200, g: 40, b: 40, a: 255 }, 'centre of the quad should be fully painted');
  assert.equal(at(0, 0).a, 0, 'well outside the quad should stay untouched');
  assert.equal(at(9, 9).a, 0, 'well outside the quad should stay untouched');
});

test('opacity fades a full-alpha source instead of painting it flush over the destination', () => {
  const srcWidth = 4;
  const srcHeight = 4;
  const src = new Uint8ClampedArray(srcWidth * srcHeight * 4);
  for (let i = 0; i < src.length; i += 4) { src[i] = 255; src[i + 1] = 255; src[i + 2] = 255; src[i + 3] = 255; }
  const dstWidth = 10;
  const dstHeight = 10;
  const dst = new Uint8ClampedArray(dstWidth * dstHeight * 4);
  for (let i = 0; i < dst.length; i += 4) { dst[i + 3] = 255; } // opaque black road

  warpQuadImageOnto({
    src, srcWidth, srcHeight, dst, dstWidth, dstHeight,
    corners: [[2, 2], [8, 2], [8, 8], [2, 8]],
    opacity: 0.5,
  });

  const i = (5 * dstWidth + 5) * 4;
  // half-strength white over black should land mid-grey, not the source's own pure white.
  assert.ok(dst[i] > 100 && dst[i] < 155, `expected faded mid-grey, got ${dst[i]}`);
  assert.equal(dst[i + 3], 255);
});

test('warpQuadImageOnto blends a semi-transparent source over existing pixels', () => {
  const src = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < src.length; i += 4) { src[i] = 255; src[i + 1] = 255; src[i + 2] = 255; src[i + 3] = 128; }
  const dstWidth = 6;
  const dstHeight = 6;
  const dst = new Uint8ClampedArray(dstWidth * dstHeight * 4);
  for (let i = 0; i < dst.length; i += 4) { dst[i] = 0; dst[i + 1] = 0; dst[i + 2] = 0; dst[i + 3] = 255; } // opaque black bg

  warpQuadImageOnto({
    src, srcWidth: 4, srcHeight: 4, dst, dstWidth, dstHeight,
    corners: [[1, 1], [5, 1], [5, 5], [1, 5]],
  });

  const i = (3 * dstWidth + 3) * 4;
  // ~50% white over black should land roughly mid-grey, fully opaque (both layers were opaque).
  assert.ok(dst[i] > 100 && dst[i] < 155, `expected mid-grey, got ${dst[i]}`);
  assert.equal(dst[i + 3], 255);
});
