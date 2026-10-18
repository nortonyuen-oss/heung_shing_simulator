'use strict';

// The two ground axes become +/- 0.5 while projected verticals keep a constant X.
// Pixel centres, including source landmarks, use integer coordinates throughout.
const EPSILON = 1e-9;

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

function positive(value, name) {
  finite(value, name);
  if (value <= 0) throw new RangeError(`${name} must be positive`);
  return value;
}

function dimension(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`);
  return value;
}

function point(value, name) {
  if (!Array.isArray(value) || value.length !== 2) throw new TypeError(`${name} must be [x, y]`);
  return value.map((coordinate, index) => finite(coordinate, `${name}[${index}]`));
}

function lineSlope(line, name) {
  if (!Array.isArray(line) || line.length !== 2) throw new TypeError(`${name} must contain two endpoints`);
  const a = point(line[0], `${name}[0]`), b = point(line[1], `${name}[1]`);
  if (a[0] === b[0]) throw new RangeError(`${name} must have a nonzero horizontal span`);
  return finite((b[1] - a[1]) / (b[0] - a[0]), `${name} slope`);
}

function coefficients(projection) {
  if (!projection || typeof projection !== 'object') throw new TypeError('projection is required');
  if (projection.kind === 'body-cage' && typeof projection.columnParameters !== 'function') {
    throw new TypeError('a body cage requires columnParameters; rebuild it with fitBodyCage');
  }
  return {
    c: finite(projection.c, 'c'),
    d: positive(projection.d, 'd'),
    tx: finite(projection.tx ?? 0, 'tx'),
    ty: finite(projection.ty ?? 0, 'ty'),
  };
}

function fitAxes({ down, up }) {
  const downSlope = lineSlope(down, 'down'), upSlope = lineSlope(up, 'up');
  if (downSlope <= 0 || upSlope >= 0) throw new RangeError('down must slope right/down and up must slope right/up');
  const d = positive(1 / (downSlope - upSlope), 'fitted d');
  const c = finite(0.5 - d * downSlope, 'fitted c');
  return { c, d, sourceSlopes: [downSlope, upSlope] };
}

function fitEllipse({ width, height, tiltSlope = 0 }) {
  const d = positive(positive(width, 'ellipse width') / (2 * positive(height, 'ellipse height')), 'fitted d');
  return { c: finite(-d * finite(tiltSlope, 'ellipse tiltSlope'), 'fitted c'), d };
}

function railParameters(axes, name) {
  const fitted = fitAxes(axes);
  const line = (direction, slope) => ({ slope, intercept: axes[direction][0][1] - slope * axes[direction][0][0] });
  const down = line('down', fitted.sourceSlopes[0]), up = line('up', fitted.sourceSlopes[1]);
  const frontX = finite((up.intercept - down.intercept) / (down.slope - up.slope), `${name} frontX`);
  return { down, up, frontX, frontY: down.slope * frontX + down.intercept };
}

function railLine(rail, x) {
  return rail.down.slope * x + rail.down.intercept <= rail.up.slope * x + rail.up.intercept ? rail.down : rail.up;
}

function railY(rail, x) {
  const line = railLine(rail, x);
  return line.slope * x + line.intercept;
}

function fitBodyCage({ top, lower }, width, height, padding = 16) {
  const primary = fitAxes(top), lowerFit = fitAxes(lower);
  const topRail = railParameters(top, 'top'), lowerRail = railParameters(lower, 'lower');
  // Normalize endpoint order so reversing a measured segment changes no result.
  const referenceXs = [Math.min(...top.down.map((p) => p[0])), topRail.frontX, Math.max(...top.up.map((p) => p[0]))];
  const frontTop = railY(topRail, topRail.frontX), frontLower = railY(lowerRail, topRail.frontX);
  const targetDropAtFront = positive(lowerFit.d * positive(frontLower - frontTop, 'source body drop'), 'target body drop');
  const lowerShift = primary.c * topRail.frontX + primary.d * frontTop + targetDropAtFront -
    (lowerFit.c * topRail.frontX + lowerFit.d * frontLower);
  const cage = {
    kind: 'body-cage', ...primary,
    top: topRail, lower: lowerRail, topFit: primary, lowerFit,
    frontX: topRail.frontX, targetDropAtFront, lowerShift, referenceXs,
    columnParameters(x) {
      finite(x, 'column x');
      const t = railY(topRail, x), b = railY(lowerRail, x);
      const targetT = primary.c * x + primary.d * t;
      const targetB = lowerFit.c * x + lowerFit.d * b + lowerShift;
      const d = positive(positive(targetB - targetT, 'target column body height') /
        positive(b - t, 'source column body height'), 'column d');
      return {
        d, offset: finite(targetT - d * t, 'column offset'),
        sourceTop: t, sourceLower: b, targetTop: targetT, targetLower: targetB,
        top: { d: primary.d, offset: primary.c * x },
        lower: { d: lowerFit.d, offset: lowerFit.c * x + lowerShift },
      };
    },
  };
  // Both rails retain their own front X. Their target body drop can vary where
  // painted upper and lower corners differ, while every vertical stays vertical.
  return planCanvas(width, height, cage, padding);
}

function columnParameters(x, projection) {
  if (projection.kind !== 'body-cage') return { d: projection.d, offset: projection.c * x };
  const column = projection.columnParameters(x);
  return {
    ...column, d: positive(column.d, 'column d'), offset: finite(column.offset, 'column offset'),
    sourceTop: finite(column.sourceTop, 'column sourceTop'), sourceLower: finite(column.sourceLower, 'column sourceLower'),
    targetTop: finite(column.targetTop, 'column targetTop'), targetLower: finite(column.targetLower, 'column targetLower'),
    top: { d: positive(column.top.d, 'top column d'), offset: finite(column.top.offset, 'top column offset') },
    lower: { d: positive(column.lower.d, 'lower column d'), offset: finite(column.lower.offset, 'lower column offset') },
  };
}

function mapPoint(sourcePoint, projection) {
  const [x, y] = point(sourcePoint, 'point'), { c, d, tx, ty } = coefficients(projection);
  if (projection.kind === 'body-cage') {
    const column = columnParameters(x, projection);
    const branch = y <= column.sourceTop ? column.top : y >= column.sourceLower ? column.lower : column;
    return [x + tx, branch.d * y + branch.offset + ty];
  }
  return [x + tx, c * x + d * y + ty];
}

function quadraticRoots(a, b, c) {
  if (a === 0) return b === 0 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  if (discriminant === 0) return [-b / (2 * a)];
  // This form avoids losing the smaller root through subtractive cancellation.
  const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant));
  return [q / a, c / q];
}

function bounds(x0, y0, x1, y1, projection) {
  let xs = [x0, x1];
  if (projection.kind === 'body-cage') {
    const thresholdCrossings = [projection.top, projection.lower].flatMap((rail) =>
      [rail.down, rail.up].flatMap((line) => [y0, y1].map((y) => (y - line.intercept) / line.slope)));
    const breaks = [x0, projection.top.frontX, projection.lower.frontX, ...thresholdCrossings, x1]
      .filter((x) => x >= x0 && x <= x1).sort((a, b) => a - b);
    xs = [...breaks];
    // Include every sampled source column and the halo endpoints explicitly.
    for (let x = Math.ceil(x0); x <= Math.floor(x1); x++) xs.push(x);
    // Between rail corners Y(x) is a line plus a quadratic/linear ratio. Its exact
    // stationary points protect continuous bounds as well as integer samples.
    for (let index = 1; index < breaks.length; index++) {
      const a = breaks[index - 1], b = breaks[index];
      if (a === b) continue;
      const midpoint = (a + b) / 2, t = railLine(projection.top, midpoint), lower = railLine(projection.lower, midpoint);
      const v = lower.slope - t.slope, w = lower.intercept - t.intercept;
      const q = projection.c + projection.d * t.slope;
      const n = projection.lowerFit.c + projection.lowerFit.d * lower.slope - q;
      const h = projection.lowerFit.d * lower.intercept + projection.lowerShift - projection.d * t.intercept;
      for (const y of [y0, y1]) {
        // Outside the body this endpoint follows a single affine continuation;
        // its extrema are already included among the interval's endpoints.
        if (y <= t.slope * midpoint + t.intercept || y >= lower.slope * midpoint + lower.intercept) continue;
        const ratioA = -t.slope * n;
        const ratioB = (y - t.intercept) * n - t.slope * h;
        const ratioC = (y - t.intercept) * h;
        const derivativeA = q * v * v + ratioA * v;
        const derivativeB = 2 * q * v * w + 2 * ratioA * w;
        const derivativeC = q * w * w + ratioB * w - v * ratioC;
        for (const x of quadraticRoots(derivativeA, derivativeB, derivativeC)) {
          if (x > a && x < b) xs.push(x);
        }
      }
    }
  }
  const corners = xs.flatMap((x) => [[x, y0], [x, y1]]).map((p) => mapPoint(p, projection));
  return {
    minX: Math.min(...corners.map((p) => p[0])), maxX: Math.max(...corners.map((p) => p[0])),
    minY: Math.min(...corners.map((p) => p[1])), maxY: Math.max(...corners.map((p) => p[1])),
  };
}

function planCanvas(width, height, projection, padding = 16) {
  dimension(width, 'source width'); dimension(height, 'source height');
  if (!Number.isSafeInteger(padding) || padding < 0) throw new RangeError('padding must be a nonnegative integer');
  const { c, d } = coefficients(projection);
  // A bilinear sample can contribute up to one source pixel beyond an edge.
  // Include that transformed halo before padding, even for extreme d or skew.
  const support = bounds(-1, -1, width, height, { ...projection, c, d, tx: 0, ty: 0 });
  return {
    ...projection,
    width: dimension(Math.ceil(support.maxX - support.minX + 2 * padding) + 1, 'output width'),
    height: dimension(Math.ceil(support.maxY - support.minY + 2 * padding) + 1, 'output height'),
    c, d, tx: padding - support.minX, ty: padding - support.minY,
  };
}

function assertUnclipped(data, width, height, projection) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return;
  const support = bounds(x0 - 1, y0 - 1, x1 + 1, y1 + 1, projection);
  // At the halo's boundary the bilinear weight is zero. Outside canvas pixel
  // centres start at -1 and width/height, so those equalities remain safe.
  if (support.minX < -1 - EPSILON || support.minY < -1 - EPSILON ||
      support.maxX > projection.width + EPSILON || support.maxY > projection.height + EPSILON) {
    throw new RangeError('projection canvas clips nonzero source alpha support; use planCanvas');
  }
}

function transformRgba(data, width, height, projection) {
  dimension(width, 'source width'); dimension(height, 'source height');
  if (!(data instanceof Uint8Array) || data.length !== width * height * 4) {
    throw new TypeError('source must contain width * height * 4 RGBA bytes');
  }
  const { c, d, tx, ty } = coefficients(projection);
  const outWidth = dimension(projection.width, 'output width'), outHeight = dimension(projection.height, 'output height');
  assertUnclipped(data, width, height, projection);
  const output = Buffer.alloc(outWidth * outHeight * 4);
  const columns = Array.from({ length: outWidth }, (_, x) => {
    const sx = x - tx;
    return sx <= -1 || sx >= width ? null : { sx, ...columnParameters(sx, projection) };
  });
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const column = columns[x];
      if (!column) continue;
      const { sx } = column, targetY = y - ty;
      const branch = projection.kind !== 'body-cage' ? column :
        targetY <= column.targetTop ? column.top : targetY >= column.targetLower ? column.lower : column;
      const sy = (targetY - branch.offset) / branch.d;
      if (sy <= -1 || sy >= height) continue;
      const left = Math.floor(sx), top = Math.floor(sy), fx = sx - left, fy = sy - top;
      let alpha = 0, red = 0, green = 0, blue = 0;
      for (let yy = 0; yy < 2; yy++) {
        const sourceY = top + yy;
        if (sourceY < 0 || sourceY >= height) continue;
        const wy = yy ? fy : 1 - fy;
        for (let xx = 0; xx < 2; xx++) {
          const sourceX = left + xx;
          if (sourceX < 0 || sourceX >= width) continue;
          const offset = (sourceY * width + sourceX) * 4;
          const weightedAlpha = (xx ? fx : 1 - fx) * wy * data[offset + 3];
          alpha += weightedAlpha;
          red += weightedAlpha * data[offset];
          green += weightedAlpha * data[offset + 1];
          blue += weightedAlpha * data[offset + 2];
        }
      }
      const outputAlpha = Math.round(alpha);
      if (outputAlpha === 0) continue; // Buffer.alloc also clears hidden RGB.
      const offset = (y * outWidth + x) * 4;
      output[offset] = Math.round(red / alpha);
      output[offset + 1] = Math.round(green / alpha);
      output[offset + 2] = Math.round(blue / alpha);
      output[offset + 3] = outputAlpha;
    }
  }
  return output;
}

module.exports = { fitAxes, fitEllipse, fitBodyCage, mapPoint, planCanvas, transformRgba };
