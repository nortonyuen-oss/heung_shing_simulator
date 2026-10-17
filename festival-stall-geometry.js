// Calibrated booth geometry. The original PNG is used as a texture: no pixels are rewritten.
// A shared triangular mesh maps the three support contacts, the eaves and the roof onto a
// metre-sized booth. Extending each triangle's affine map to the canvas boundary preserves
// flowers, lanterns and other artwork outside the main supports without trimming the texture.
const FESTIVAL_STALL_GEOMETRY_EPSILON = 1e-8;
const FESTIVAL_STALL_GEOMETRY_PX_PER_METRE_ALONG = 2.5;
const FESTIVAL_STALL_GEOMETRY_PX_PER_METRE_UP = 5;

function festivalStallGeometryCross(a, b) {
  return a.x * b.y - a.y * b.x;
}

function festivalStallGeometrySubtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function festivalStallGeometryPoint(value, label, width, height) {
  const point = Array.isArray(value) ? { x: value[0], y: value[1] } : value;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || point.x < 0 || point.x > width || point.y < 0 || point.y > height) {
    throw new TypeError(`Invalid festival stall calibration point: ${label}`);
  }
  return { x: point.x, y: point.y };
}

function festivalStallGeometryPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`Invalid festival stall ${label}`);
  return value;
}

function festivalStallGeometryRayBoundary(centre, point, width, height) {
  const dx = point.x - centre.x, dy = point.y - centre.y;
  const tx = dx > 0 ? (width - centre.x) / dx : dx < 0 ? -centre.x / dx : Infinity;
  const ty = dy > 0 ? (height - centre.y) / dy : dy < 0 ? -centre.y / dy : Infinity;
  const distance = Math.min(tx, ty);
  const snap = (value, limit) => Math.abs(value) < FESTIVAL_STALL_GEOMETRY_EPSILON ? 0
    : Math.abs(value - limit) < FESTIVAL_STALL_GEOMETRY_EPSILON ? limit : value;
  return {
    x: snap(Math.max(0, Math.min(width, centre.x + dx * distance)), width),
    y: snap(Math.max(0, Math.min(height, centre.y + dy * distance)), height),
  };
}

/**
 * @param {object} calibration Original, unmirrored baked PNG landmarks in source pixels.
 * @param {{width:number,depth:number}} footprintM Logical booth dimensions, in metres.
 * @param {object} options heightM/eaveM, mirrored and optional projection pixel scales.
 * @returns {object} World-pixel vertices relative to the floor centre, and original texture UVs.
 *
 * For mirrored:true the input calibration remains unmirrored. Source coordinates are reflected
 * and the left/right landmark names exchanged; returned UVs address the existing _m texture
 * directly. The target's width and depth stay on the same world axes for either orientation.
 */
function buildFestivalStallGeometry(calibration, footprintM, options = {}) {
  if (!calibration) throw new TypeError('Missing festival stall calibration');
  const width = festivalStallGeometryPositive(calibration.width, 'texture width');
  const height = festivalStallGeometryPositive(calibration.height, 'texture height');
  const widthM = festivalStallGeometryPositive(footprintM?.width, 'footprint width');
  const depthM = festivalStallGeometryPositive(footprintM?.depth, 'footprint depth');
  const heightM = festivalStallGeometryPositive(options.heightM ?? 3, 'height');
  const eaveM = festivalStallGeometryPositive(options.eaveM ?? heightM * 0.8, 'eave height');
  if (eaveM > heightM) throw new RangeError('Festival stall eaves exceed roof height');
  const along = festivalStallGeometryPositive(
    options.pxPerMetreAlong ?? FESTIVAL_STALL_GEOMETRY_PX_PER_METRE_ALONG, 'horizontal projection scale');
  const up = festivalStallGeometryPositive(
    options.pxPerMetreUp ?? FESTIVAL_STALL_GEOMETRY_PX_PER_METRE_UP, 'vertical projection scale');
  const mirrored = Boolean(options.mirrored);
  const roofKind = calibration.roof?.kind;
  if (!['pyramid', 'leanTo'].includes(roofKind)) throw new TypeError('Invalid festival stall roof kind');

  const sourceLandmarks = { feet: {}, eaves: {}, roof: null };
  for (const group of ['feet', 'eaves']) {
    for (const side of ['left', 'front', 'right']) {
      const sourceSide = mirrored && side !== 'front' ? (side === 'left' ? 'right' : 'left') : side;
      const point = festivalStallGeometryPoint(calibration[group]?.[sourceSide], `${group}.${sourceSide}`, width, height);
      sourceLandmarks[group][side] = { x: mirrored ? width - point.x : point.x, y: point.y };
    }
  }
  const roofPoint = festivalStallGeometryPoint(calibration.roof.point, 'roof.point', width, height);
  sourceLandmarks.roof = { x: mirrored ? width - roofPoint.x : roofPoint.x, y: roofPoint.y };

  const groundCorners = {
    left: { x: -along * (widthM + depthM) / 2, y: along * (depthM - widthM) / 4 },
    front: { x: along * (widthM - depthM) / 2, y: along * (widthM + depthM) / 4 },
    right: { x: along * (widthM + depthM) / 2, y: along * (widthM - depthM) / 4 },
    back: { x: -along * (widthM - depthM) / 2, y: -along * (widthM + depthM) / 4 },
  };
  const controlPoints = { feet: {}, eaves: {}, roof: null };
  for (const side of ['left', 'front', 'right']) {
    controlPoints.feet[side] = { ...groundCorners[side] };
    controlPoints.eaves[side] = { x: groundCorners[side].x, y: groundCorners[side].y - eaveM * up };
  }
  controlPoints.roof = roofKind === 'pyramid'
    ? { x: 0, y: -heightM * up }
    : { x: groundCorners.back.x, y: groundCorners.back.y - heightM * up };

  // Both the original and target outline are star-shaped about the front eave. The six fan
  // triangles share all their boundary vertices, including the full height of each support.
  const centre = sourceLandmarks.eaves.front;
  if (centre.x <= 0 || centre.x >= width || centre.y <= 0 || centre.y >= height) {
    throw new RangeError('Festival stall front eave must be inside the texture');
  }
  const targetCentre = controlPoints.eaves.front;
  const sourceRing = [sourceLandmarks.eaves.left, sourceLandmarks.roof, sourceLandmarks.eaves.right,
    sourceLandmarks.feet.right, sourceLandmarks.feet.front, sourceLandmarks.feet.left];
  const targetRing = [controlPoints.eaves.left, controlPoints.roof, controlPoints.eaves.right,
    controlPoints.feet.right, controlPoints.feet.front, controlPoints.feet.left];
  for (let i = 0; i < sourceRing.length; i++) {
    const next = (i + 1) % sourceRing.length;
    const sourceArea = festivalStallGeometryCross(festivalStallGeometrySubtract(sourceRing[i], centre),
      festivalStallGeometrySubtract(sourceRing[next], centre));
    const targetArea = festivalStallGeometryCross(festivalStallGeometrySubtract(targetRing[i], targetCentre),
      festivalStallGeometrySubtract(targetRing[next], targetCentre));
    if (sourceArea <= FESTIVAL_STALL_GEOMETRY_EPSILON || targetArea <= FESTIVAL_STALL_GEOMETRY_EPSILON) {
      throw new RangeError(`Festival stall calibration has a folded or degenerate sector ${i}`);
    }
  }

  const vertices = [], indices = [], vertexBySource = new Map();
  function vertex(source, target, landmark) {
    const key = `${source.x.toFixed(7)}:${source.y.toFixed(7)}`;
    if (vertexBySource.has(key)) {
      const index = vertexBySource.get(key), existing = vertices[index];
      if (Math.hypot(existing.x - target.x, existing.y - target.y) > 1e-6) {
        throw new RangeError('Festival stall mesh has inconsistent shared vertices');
      }
      return index;
    }
    const index = vertices.length;
    vertices.push({ x: target.x, y: target.y, u: source.x / width, v: source.y / height,
      sourceX: source.x, sourceY: source.y, ...(landmark ? { landmark } : {}) });
    vertexBySource.set(key, index);
    return index;
  }
  function triangle(a, b, c) {
    if (a === b || b === c || c === a) return;
    const pa = vertices[a], pb = vertices[b], pc = vertices[c];
    const area = (pb.sourceX - pa.sourceX) * (pc.sourceY - pa.sourceY)
      - (pb.sourceY - pa.sourceY) * (pc.sourceX - pa.sourceX);
    if (Math.abs(area) <= FESTIVAL_STALL_GEOMETRY_EPSILON) return;
    if (area < 0) throw new RangeError('Festival stall mesh has a reversed source triangle');
    indices.push(a, b, c);
  }
  const centreIndex = vertex(centre, targetCentre, 'eaves.front');
  const labels = ['eaves.left', 'roof', 'eaves.right', 'feet.right', 'feet.front', 'feet.left'];
  const ringIndices = sourceRing.map((point, i) => vertex(point, targetRing[i], labels[i]));
  const canvasCorners = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  const outerIntersections = sourceRing.map((point) => festivalStallGeometryRayBoundary(centre, point, width, height));

  for (let i = 0; i < sourceRing.length; i++) {
    const next = (i + 1) % sourceRing.length;
    const a = festivalStallGeometrySubtract(sourceRing[i], centre);
    const b = festivalStallGeometrySubtract(sourceRing[next], centre);
    const ta = festivalStallGeometrySubtract(targetRing[i], targetCentre);
    const tb = festivalStallGeometrySubtract(targetRing[next], targetCentre);
    const determinant = festivalStallGeometryCross(a, b);
    function mapPoint(source) {
      const p = festivalStallGeometrySubtract(source, centre);
      const u = festivalStallGeometryCross(p, b) / determinant;
      const v = festivalStallGeometryCross(a, p) / determinant;
      return { x: targetCentre.x + u * ta.x + v * tb.x, y: targetCentre.y + u * ta.y + v * tb.y };
    }
    const corners = canvasCorners.filter((point) => {
      const p = festivalStallGeometrySubtract(point, centre);
      return festivalStallGeometryCross(a, p) > FESTIVAL_STALL_GEOMETRY_EPSILON
        && festivalStallGeometryCross(p, b) > FESTIVAL_STALL_GEOMETRY_EPSILON;
    }).sort((p, q) => {
      const vp = festivalStallGeometrySubtract(p, centre), vq = festivalStallGeometrySubtract(q, centre);
      return Math.atan2(festivalStallGeometryCross(a, vp), a.x * vp.x + a.y * vp.y)
        - Math.atan2(festivalStallGeometryCross(a, vq), a.x * vq.x + a.y * vq.y);
    });
    const outer = [outerIntersections[i], ...corners, outerIntersections[next]];
    const outerIndices = outer.map((point) => vertex(point, mapPoint(point)));
    triangle(centreIndex, ringIndices[i], ringIndices[next]);
    for (let k = 0; k + 1 < outerIndices.length; k++) triangle(ringIndices[i], outerIndices[k], outerIndices[k + 1]);
    triangle(ringIndices[i], outerIndices[outerIndices.length - 1], ringIndices[next]);
  }

  const minX = Math.min(...vertices.map((point) => point.x));
  const minY = Math.min(...vertices.map((point) => point.y));
  const maxX = Math.max(...vertices.map((point) => point.x));
  const maxY = Math.max(...vertices.map((point) => point.y));
  return {
    vertices, indices, groundCorners, groundCenter: { x: 0, y: 0 }, controlPoints, sourceLandmarks,
    bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
    sourceSize: { width, height }, footprintM: { width: widthM, depth: depthM },
    heightM, eaveM, mirrored, roofKind,
    pxPerMetreAlong: along, pxPerMetreUp: up,
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  buildFestivalStallGeometry,
  FESTIVAL_STALL_GEOMETRY_PX_PER_METRE_ALONG,
  FESTIVAL_STALL_GEOMETRY_PX_PER_METRE_UP,
};
