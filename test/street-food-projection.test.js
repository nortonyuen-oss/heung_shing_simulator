'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { fitAxes, fitEllipse, fitBodyCage, mapPoint, planCanvas, transformRgba } = require('../scripts/street-food-projection');

function near(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

function slope(line) {
  return (line[1][1] - line[0][1]) / (line[1][0] - line[0][0]);
}

function pixel(data, width, x, y) {
  return [...data.subarray((y * width + x) * 4, (y * width + x + 1) * 4)];
}

test('two measured ground directions become +/- 0.5 with endpoints in either order', () => {
  const axes = { down: [[10, 20], [110, 90]], up: [[20, 100], [220, 40]] };
  for (const reverseDown of [false, true]) {
    for (const reverseUp of [false, true]) {
      const down = reverseDown ? [...axes.down].reverse() : axes.down;
      const up = reverseUp ? [...axes.up].reverse() : axes.up;
      const projection = fitAxes({ down, up });
      near(projection.c, -0.2); near(projection.d, 1);
      assert.deepEqual(projection.sourceSlopes, [0.7, -0.3]);
      near(slope(down.map((p) => mapPoint(p, projection))), 0.5);
      near(slope(up.map((p) => mapPoint(p, projection))), -0.5);
      // A separate line of the same direction checks translation independence.
      near(slope([[91, 32], [291, 172]].map((p) => mapPoint(p, projection))), 0.5);
    }
  }
});

test('malformed, vertical, horizontal and incorrectly labelled axes fail clearly', () => {
  const validUp = [[0, 10], [10, 0]], validDown = [[0, 0], [10, 10]];
  for (const down of [null, [[0, 0]], [[0, 0], [0, 1]], [[0, 0], [10, 0]], validUp, [[0, 0], [Infinity, 1]]]) {
    assert.throws(() => fitAxes({ down, up: validUp }));
  }
  assert.throws(() => fitAxes({ down: validDown, up: validDown }));
  assert.throws(() => fitAxes({ down: validDown, up: [[0, 0], [10, 0]] }));
});

test('a horizontal oval becomes half as high as wide, including a tilted centreline', () => {
  const projection = fitEllipse({ width: 120, height: 40, tiltSlope: 0.2 });
  near(projection.d, 1.5); near(projection.c, -0.3);
  const centreline = [[0, 20], [120, 44]].map((p) => mapPoint(p, projection));
  near(slope(centreline), 0);
  near(mapPoint([60, 52], projection)[1] - mapPoint([60, 12], projection)[1], 60);
  for (const spec of [{ width: 0, height: 4 }, { width: 4, height: -1 }, { width: 4, height: NaN }, { width: 4, height: 2, tiltSlope: Infinity }]) {
    assert.throws(() => fitEllipse(spec));
  }
});

test('canvas planning includes all source centres and the interpolation halo with either skew sign', () => {
  for (const c of [-1.4, 0, 0.7]) {
    for (const d of [0.2, 1, 3.5]) {
      const projection = planCanvas(7, 9, { c, d }, 4);
      for (const p of [[0, 0], [6, 0], [0, 8], [6, 8]]) {
        const [x, y] = mapPoint(p, projection);
        assert.ok(x >= 4 && y >= 4);
        assert.ok(x <= projection.width - 1 - 4 && y <= projection.height - 1 - 4);
      }
      const source = Buffer.alloc(7 * 9 * 4, 255);
      const result = transformRgba(source, 7, 9, projection);
      for (let x = 0; x < projection.width; x++) {
        assert.equal(pixel(result, projection.width, x, 0)[3], 0);
        assert.equal(pixel(result, projection.width, x, projection.height - 1)[3], 0);
      }
      for (let y = 0; y < projection.height; y++) {
        assert.equal(pixel(result, projection.width, 0, y)[3], 0);
        assert.equal(pixel(result, projection.width, projection.width - 1, y)[3], 0);
      }
    }
  }
});

test('calibration retains vertical direction and maps landmarks with the planned translation', () => {
  const projection = planCanvas(100, 60, fitAxes({ down: [[0, 0], [40, 30]], up: [[0, 20], [40, 10]] }));
  const lower = mapPoint([30, 50], projection), upper = mapPoint([30, 10], projection);
  near(lower[0], upper[0]); near(lower[1] - upper[1], 40 * projection.d);
  assert.deepEqual(mapPoint([0, 0], projection), [projection.tx, projection.ty]);
  assert.deepEqual(mapPoint([2, 3], { c: 0.5, d: 2 }), [2, 7]);
});

test('inverse interpolation premultiplies alpha so transparent coloured pixels cannot bleed', () => {
  // The transparent neighbour deliberately contains blue RGB.
  const source = Buffer.from([255, 20, 0, 255, 0, 0, 255, 0]);
  const projection = { width: 4, height: 3, c: 0, d: 1, tx: 0.5, ty: 1 };
  const result = transformRgba(source, 2, 1, projection);
  assert.deepEqual(pixel(result, 4, 1, 1), [255, 20, 0, 128]);
  for (let offset = 0; offset < result.length; offset += 4) {
    if (result[offset + 3] === 0) assert.deepEqual([...result.subarray(offset, offset + 3)], [0, 0, 0]);
  }
});

test('identity keeps alpha=1 details without thresholding and never mutates source bytes', () => {
  const source = Buffer.from([90, 120, 30, 1, 8, 9, 10, 17, 55, 60, 65, 255, 1, 2, 3, 0]);
  const original = Buffer.from(source), projection = planCanvas(2, 2, { c: 0, d: 1 }, 0);
  const result = transformRgba(source, 2, 2, projection);
  assert.deepEqual(pixel(result, projection.width, projection.tx, projection.ty), [90, 120, 30, 1]);
  assert.deepEqual(pixel(result, projection.width, projection.tx + 1, projection.ty), [8, 9, 10, 17]);
  assert.deepEqual(pixel(result, projection.width, projection.tx, projection.ty + 1), [55, 60, 65, 255]);
  assert.deepEqual(source, original);
});

test('invalid dimensions, coefficients, input lengths and canvases that clip alpha are rejected', () => {
  assert.throws(() => planCanvas(0, 10, { c: 0, d: 1 }));
  assert.throws(() => planCanvas(4, 10, { c: NaN, d: 1 }));
  assert.throws(() => planCanvas(4, 10, { c: 0, d: 0 }));
  assert.throws(() => planCanvas(4, 10, { c: 0, d: 1 }, -1));
  assert.throws(() => mapPoint([NaN, 1], { c: 0, d: 1 }));
  assert.throws(() => transformRgba(Buffer.alloc(3), 1, 1, planCanvas(1, 1, { c: 0, d: 1 })));
  assert.throws(() => transformRgba(Buffer.from([1, 2, 3, 1]), 1, 1,
    { width: 1, height: 1, c: 0, d: 3, tx: 0, ty: 0 }), /clips nonzero source alpha/);
  assert.throws(() => transformRgba(Buffer.from([1, 2, 3, 255]), 1, 1,
    { width: 2, height: 2, c: 0, d: 1, tx: 5, ty: 0 }), /clips nonzero source alpha/);
  assert.deepEqual(transformRgba(Buffer.from([255, 255, 255, 0]), 1, 1,
    { width: 1, height: 1, c: 0, d: 3, tx: 0, ty: 0 }), Buffer.alloc(4));
});

const TAPERED_BOX = {
  top: { down: [[2, 4], [10, 8]], up: [[10, 8], [18, 4]] },
  lower: { down: [[2, 14], [10, 21]], up: [[10, 21], [18, 14]] },
};

test('a body cage corrects independently tapered upper and lower rails to the same two ground axes', () => {
  const affine = fitAxes(TAPERED_BOX.top);
  near(slope(TAPERED_BOX.lower.down.map((p) => mapPoint(p, affine))), 0.875);
  const cage = fitBodyCage(TAPERED_BOX, 21, 26, 3);
  assert.equal(cage.kind, 'body-cage'); near(cage.frontX, 10); near(cage.targetDropAtFront, 13 / 1.75);
  for (const rail of [TAPERED_BOX.top, TAPERED_BOX.lower]) {
    near(slope(rail.down.map((p) => mapPoint(p, cage))), 0.5);
    near(slope(rail.up.map((p) => mapPoint(p, cage))), -0.5);
  }
  // Extra samples lie away from the three fitting columns.
  near(slope([[4, 15.75], [8, 19.25]].map((p) => mapPoint(p, cage))), 0.5);
  near(slope([[12, 19.25], [16, 15.75]].map((p) => mapPoint(p, cage))), -0.5);
  for (const x of [2, 5.25, 10, 14.75, 18]) {
    const top = Math.min(0.5 * x + 3, -0.5 * x + 13);
    const lower = Math.min(0.875 * x + 12.25, -0.875 * x + 29.75);
    near(mapPoint([x, lower], cage)[1] - mapPoint([x, top], cage)[1], cage.targetDropAtFront);
    near(mapPoint([x, (top + lower) / 2], cage)[1] - mapPoint([x, top], cage)[1], cage.targetDropAtFront / 2);
  }
  const reversed = Object.fromEntries(Object.entries(TAPERED_BOX).map(([name, rail]) =>
    [name, { down: [...rail.down].reverse(), up: [...rail.up].reverse() }]));
  near(fitBodyCage(reversed, 21, 26, 3).targetDropAtFront, cage.targetDropAtFront);
});

test('body-cage columns stay straight and vertical even when their individual scales differ', () => {
  const cage = fitBodyCage(TAPERED_BOX, 21, 26);
  assert.notEqual(cage.columnParameters(2).d, cage.columnParameters(10).d);
  for (const x of [0, 2.5, 10, 17.75, 20]) {
    const points = [0, 7, 14, 21].map((y) => mapPoint([x, y], cage));
    for (const p of points) near(p[0], x + cage.tx);
    for (let i = 1; i < points.length; i++) assert.ok(points[i][1] > points[i - 1][1]);
    const column = cage.columnParameters(x), mid = (column.sourceTop + column.sourceLower) / 2;
    near(mapPoint([x, mid + 1], cage)[1] - mapPoint([x, mid - 1], cage)[1], 2 * column.d);
  }
  const replanned = planCanvas(21, 26, cage, 0);
  near(mapPoint([6, 8], cage)[0] - mapPoint([6, 8], replanned)[0], 16);
  near(mapPoint([6, 8], cage)[1] - mapPoint([6, 8], replanned)[1], 16);
});

test('a rendered tapered box has parallel corrected upper/lower rails and retains transparent padding', () => {
  const width = 21, height = 26, source = Buffer.alloc(width * height * 4);
  for (let x = 2; x <= 18; x++) {
    const top = Math.ceil(Math.min(0.5 * x + 3, -0.5 * x + 13));
    const lower = Math.floor(Math.min(0.875 * x + 12.25, -0.875 * x + 29.75));
    for (let y = top; y <= lower; y++) source.set([160, 90, 20, 255], (y * width + x) * 4);
  }
  const cage = fitBodyCage(TAPERED_BOX, width, height, 4), result = transformRgba(source, width, height, cage);
  for (let x = 2; x <= 18; x++) {
    const outputX = x + cage.tx, rows = [];
    for (let y = 0; y < cage.height; y++) if (pixel(result, cage.width, outputX, y)[3] >= 128) rows.push(y);
    const targetTop = mapPoint([x, Math.min(0.5 * x + 3, -0.5 * x + 13)], cage)[1];
    assert.ok(Math.abs(rows[0] - targetTop) <= 1);
    assert.ok(Math.abs(rows.at(-1) - (targetTop + cage.targetDropAtFront)) <= 1);
  }
  for (let x = 0; x < cage.width; x++) {
    assert.equal(pixel(result, cage.width, x, 0)[3], 0);
    assert.equal(pixel(result, cage.width, x, cage.height - 1)[3], 0);
  }
  for (let y = 0; y < cage.height; y++) {
    assert.equal(pixel(result, cage.width, 0, y)[3], 0);
    assert.equal(pixel(result, cage.width, cage.width - 1, y)[3], 0);
  }
});

test('cage interpolation ignores hidden RGB and retains faint source support', () => {
  const width = 21, height = 26, source = Buffer.alloc(width * height * 4);
  for (let i = 0; i < source.length; i += 4) source.set([0, 0, 255, 0], i);
  for (const y of [9, 10, 11]) source.set([255, 30, 0, 1], (y * width + 2) * 4);
  for (const y of [14, 15, 16]) source.set([255, 30, 0, 255], (y * width + 10) * 4);
  const cage = fitBodyCage(TAPERED_BOX, width, height), result = transformRgba(source, width, height, cage);
  let faintSeen = false, opaqueSeen = false;
  for (let offset = 0; offset < result.length; offset += 4) {
    if (result[offset + 3] > 0) {
      assert.deepEqual([...result.subarray(offset, offset + 3)], [255, 30, 0]);
      if ((offset / 4) % cage.width === 2 + cage.tx) faintSeen = true;
      if (result[offset + 3] > 100) opaqueSeen = true;
    } else assert.deepEqual([...result.subarray(offset, offset + 3)], [0, 0, 0]);
  }
  assert.ok(faintSeen); assert.ok(opaqueSeen);
});

test('independent rail corners each retain exact +/- 0.5 slopes without moving X', () => {
  const offsetBox = {
    top: TAPERED_BOX.top,
    lower: { down: [[2, 14], [12, 22]], up: [[12, 22], [18, 14]] },
  };
  const cage = fitBodyCage(offsetBox, 21, 26, 4);
  near(cage.top.frontX, 10); near(cage.lower.frontX, 12);
  assert.ok(Number.isFinite(cage.lowerShift));
  for (const rail of [offsetBox.top, offsetBox.lower]) {
    near(slope(rail.down.map((p) => mapPoint(p, cage))), 0.5);
    near(slope(rail.up.map((p) => mapPoint(p, cage))), -0.5);
    for (const p of [...rail.down, ...rail.up]) near(mapPoint(p, cage)[0], p[0] + cage.tx);
  }
  const topAtFront = mapPoint([10, 8], cage)[1];
  const lowerAtFront = mapPoint([10, 20.4], cage)[1];
  near(lowerAtFront - topAtFront, cage.targetDropAtFront);
  // The different corners legitimately create slightly different body heights.
  const leftDrop = mapPoint([2, 14], cage)[1] - mapPoint([2, 4], cage)[1];
  const rightDrop = mapPoint([18, 14], cage)[1] - mapPoint([18, 4], cage)[1];
  near(Math.abs(leftDrop - rightDrop), 2);
  const replanned = planCanvas(21, 26, cage, 3), source = Buffer.alloc(21 * 26 * 4, 255);
  assert.doesNotThrow(() => transformRgba(source, 21, 26, replanned));
});

test('above the tabletop and below the box retain their own affine projection with continuous boundaries', () => {
  const cage = fitBodyCage(TAPERED_BOX, 21, 26, 4);
  for (const x of [0, 2, 7.5, 10, 15, 20]) {
    const column = cage.columnParameters(x);
    const above = column.sourceTop - 3, below = column.sourceLower + 3;
    near(mapPoint([x, above], cage)[1], cage.c * x + cage.d * above + cage.ty);
    near(mapPoint([x, below], cage)[1], cage.lowerFit.c * x + cage.lowerFit.d * below + cage.lowerShift + cage.ty);
    near(mapPoint([x, column.sourceTop], cage)[1], column.targetTop + cage.ty);
    near(mapPoint([x, column.sourceLower], cage)[1], column.targetLower + cage.ty);
    const epsilon = 1e-6;
    assert.ok(Math.abs(mapPoint([x, column.sourceTop - epsilon], cage)[1] -
      mapPoint([x, column.sourceTop + epsilon], cage)[1]) < 1e-4);
    assert.ok(Math.abs(mapPoint([x, column.sourceLower - epsilon], cage)[1] -
      mapPoint([x, column.sourceLower + epsilon], cage)[1]) < 1e-4);
  }
  // The cooking plane's own direction must not be replaced by the body scale.
  near(slope([[2, 2], [10, 6]].map((p) => mapPoint(p, cage))), 0.5);
  // A painted rail below the body follows the separately calibrated lower fit.
  near(slope([[2, 16], [10, 23]].map((p) => mapPoint(p, cage))), 0.5);
});

test('the inverse sampler chooses the matching top, body and lower branch', () => {
  const width = 21, height = 26, source = Buffer.alloc(width * height * 4);
  const bands = [
    { rows: [0, 1, 2, 3], point: [2, 2], color: [230, 20, 10, 255] },
    { rows: [9, 10, 11], point: [2, 10], color: [10, 210, 20, 255] },
    { rows: [23, 24, 25], point: [2, 24], color: [20, 30, 220, 255] },
  ];
  for (const band of bands) {
    for (const y of band.rows) for (let x = 0; x < width; x++) source.set(band.color, (y * width + x) * 4);
  }
  const cage = fitBodyCage(TAPERED_BOX, width, height, 4), output = transformRgba(source, width, height, cage);
  for (const band of bands) {
    const [x, y] = mapPoint(band.point, cage);
    assert.deepEqual(pixel(output, cage.width, Math.round(x), Math.round(y)), band.color);
  }
});

test('cages reject inverted or crossing rails and a target canvas that clips alpha', () => {
  assert.throws(() => fitBodyCage({ top: TAPERED_BOX.lower, lower: TAPERED_BOX.top }, 21, 26), /positive/);
  assert.throws(() => fitBodyCage(TAPERED_BOX, 100, 26), /positive/);
  const cage = fitBodyCage(TAPERED_BOX, 21, 26), source = Buffer.alloc(21 * 26 * 4, 255);
  assert.throws(() => transformRgba(source, 21, 26, { ...cage, height: 1 }), /clips nonzero source alpha/);
  assert.throws(() => mapPoint([0, 0], JSON.parse(JSON.stringify(cage))), /rebuild it with fitBodyCage/);
});
