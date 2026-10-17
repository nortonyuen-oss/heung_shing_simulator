const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildFestivalStallGeometry } = require('../festival-stall-geometry');
const calibration = require('../data/festival-stall-geometry.json').assets;

const STALL_TYPES = {
  wet: { width: 4, depth: 5, heightM: 4 },
  dry: { width: 3, depth: 1.5, heightM: 3 },
  dryLarge: { width: 4.5, depth: 2, heightM: 3 },
  food: { width: 5, depth: 4, heightM: 4 },
};

function near(actual, expected, label, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}

function sourceArea(a, b, c) {
  return ((b.sourceX - a.sourceX) * (c.sourceY - a.sourceY)
    - (b.sourceY - a.sourceY) * (c.sourceX - a.sourceX)) / 2;
}

function targetArea(a, b, c) {
  return ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
}

function triangles(geometry) {
  const result = [];
  for (let i = 0; i < geometry.indices.length; i += 3) {
    result.push(geometry.indices.slice(i, i + 3).map((index) => geometry.vertices[index]));
  }
  return result;
}

function mapSourcePoint(geometry, point) {
  for (const [a, b, c] of triangles(geometry)) {
    const denominator = (b.sourceY - c.sourceY) * (a.sourceX - c.sourceX)
      + (c.sourceX - b.sourceX) * (a.sourceY - c.sourceY);
    const u = ((b.sourceY - c.sourceY) * (point.x - c.sourceX)
      + (c.sourceX - b.sourceX) * (point.y - c.sourceY)) / denominator;
    const v = ((c.sourceY - a.sourceY) * (point.x - c.sourceX)
      + (a.sourceX - c.sourceX) * (point.y - c.sourceY)) / denominator;
    const w = 1 - u - v;
    if (Math.min(u, v, w) >= -1e-9) return {
      x: u * a.x + v * b.x + w * c.x,
      y: u * a.y + v * b.y + w * c.y,
    };
  }
  return null;
}

function eachProductionGeometry(callback) {
  for (const [id, asset] of Object.entries(calibration)) {
    for (const [type, footprint] of Object.entries(STALL_TYPES)) {
      for (const mirrored of [false, true]) {
        const label = `${id}/${type}/${mirrored ? 'mirrored' : 'original'}`;
        const geometry = buildFestivalStallGeometry(asset, footprint, { heightM: footprint.heightM, mirrored });
        callback(geometry, asset, footprint, label);
      }
    }
  }
}

test('all production booth textures use exact independent metre dimensions and a 2:1 ground projection', () => {
  assert.equal(Object.keys(calibration).length, 14);
  eachProductionGeometry((geometry, _asset, footprint, label) => {
    const { left, front, right, back } = geometry.groundCorners;
    near(front.x - left.x, footprint.width * 2.5, `${label} width`);
    near(right.x - front.x, footprint.depth * 2.5, `${label} depth`);
    near((front.y - left.y) / (front.x - left.x), 0.5, `${label} first ground axis`);
    near((right.y - front.y) / (right.x - front.x), -0.5, `${label} second ground axis`);
    near((front.x + back.x) / 2, 0, `${label} front/back centre X`);
    near((front.y + back.y) / 2, 0, `${label} front/back centre Y`);
    near((left.x + right.x) / 2, 0, `${label} left/right centre X`);
    near((left.y + right.y) / 2, 0, `${label} left/right centre Y`);
  });
});

test('three complete support lines stay upright at the calibrated height, including their interiors', () => {
  eachProductionGeometry((geometry, _asset, footprint, label) => {
    for (const side of ['left', 'front', 'right']) {
      const foot = geometry.sourceLandmarks.feet[side], eave = geometry.sourceLandmarks.eaves[side];
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const point = mapSourcePoint(geometry, {
          x: foot.x + (eave.x - foot.x) * fraction,
          y: foot.y + (eave.y - foot.y) * fraction,
        });
        assert.ok(point, `${label} ${side} support is covered`);
        near(point.x, geometry.groundCorners[side].x, `${label} ${side} upright`);
        near(point.y, geometry.groundCorners[side].y - footprint.heightM * 0.8 * 5 * fraction,
          `${label} ${side} support height`);
      }
    }
    const roof = mapSourcePoint(geometry, geometry.sourceLandmarks.roof);
    if (geometry.roofKind === 'pyramid') {
      near(roof.x, 0, `${label} apex centre X`);
      near(roof.y, -footprint.heightM * 5, `${label} apex height`);
    } else {
      near(roof.x, geometry.groundCorners.back.x, `${label} rear roof X`);
      near(roof.y, geometry.groundCorners.back.y - footprint.heightM * 5, `${label} rear roof height`);
    }
  });
});

test('shared mesh edges cover each whole source canvas once without holes, folds or clipped artwork', () => {
  eachProductionGeometry((geometry, asset, _footprint, label) => {
    let area = 0;
    const edges = new Map();
    for (let i = 0; i < geometry.indices.length; i += 3) {
      const indices = geometry.indices.slice(i, i + 3);
      const [a, b, c] = indices.map((index) => geometry.vertices[index]);
      assert.ok(sourceArea(a, b, c) > 0, `${label} source triangle has positive area`);
      assert.ok(targetArea(a, b, c) > 0, `${label} target triangle has positive area`);
      area += sourceArea(a, b, c);
      for (let edge = 0; edge < 3; edge++) {
        const pair = [indices[edge], indices[(edge + 1) % 3]].sort((x, y) => x - y);
        const key = pair.join(':');
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    near(area, asset.width * asset.height, `${label} full source area`, asset.width * asset.height * 1e-10);
    for (const [edge, count] of edges) {
      const [a, b] = edge.split(':').map((index) => geometry.vertices[Number(index)]);
      const boundary = (a.sourceX === 0 && b.sourceX === 0)
        || (a.sourceX === asset.width && b.sourceX === asset.width)
        || (a.sourceY === 0 && b.sourceY === 0)
        || (a.sourceY === asset.height && b.sourceY === asset.height);
      assert.equal(count, boundary ? 1 : 2, `${label} shared edge ${edge}`);
    }
    const sourceKeys = geometry.vertices.map((vertex) => `${vertex.sourceX.toFixed(6)}:${vertex.sourceY.toFixed(6)}`);
    assert.equal(new Set(sourceKeys).size, sourceKeys.length, `${label} shared source vertices are reused`);
    for (const corner of [[0, 0], [asset.width, 0], [asset.width, asset.height], [0, asset.height]]) {
      assert.ok(geometry.vertices.some((vertex) => vertex.sourceX === corner[0] && vertex.sourceY === corner[1]),
        `${label} canvas corner ${corner} retained`);
    }
    // Sample beyond the support polygon as well as within it: plants, signs and lanterns
    // must all have a valid texture-to-world map even when they protrude past the canopy.
    for (let row = 0; row < 17; row++) for (let col = 0; col < 17; col++) {
      assert.ok(mapSourcePoint(geometry, {
        x: asset.width * (col + 0.37) / 17,
        y: asset.height * (row + 0.61) / 17,
      }), `${label} source pixel region ${row}:${col} covered`);
    }
    for (const vertex of geometry.vertices) {
      assert.ok(Number.isFinite(vertex.x) && Number.isFinite(vertex.y), `${label} finite target`);
      assert.ok(vertex.u >= 0 && vertex.u <= 1 && vertex.v >= 0 && vertex.v <= 1, `${label} valid texture UV`);
      near(vertex.u, vertex.sourceX / asset.width, `${label} source U`);
      near(vertex.v, vertex.sourceY / asset.height, `${label} source V`);
    }
  });
});

test('mirrored texture coordinates reflect and exchange side landmarks without exchanging physical dimensions', () => {
  for (const [id, asset] of Object.entries(calibration)) {
    const original = buildFestivalStallGeometry(asset, STALL_TYPES.dryLarge);
    const mirrored = buildFestivalStallGeometry(asset, STALL_TYPES.dryLarge, { mirrored: true });
    assert.deepEqual(mirrored.groundCorners, original.groundCorners, `${id} retains exact physical footprint`);
    assert.deepEqual(mirrored.controlPoints, original.controlPoints, `${id} retains support heights and roof`);
    for (const group of ['feet', 'eaves']) for (const side of ['left', 'front', 'right']) {
      const opposite = side === 'front' ? 'front' : side === 'left' ? 'right' : 'left';
      near(mirrored.sourceLandmarks[group][side].x, asset.width - original.sourceLandmarks[group][opposite].x,
        `${id} ${group}.${side} reflected source X`);
      near(mirrored.sourceLandmarks[group][side].y, original.sourceLandmarks[group][opposite].y,
        `${id} ${group}.${side} source Y`);
    }
  }
});

test('geometry generation is deterministic, leaves calibration untouched and supports explicit projection scales', () => {
  const asset = structuredClone(calibration.lnyStallToys), before = JSON.stringify(asset);
  const options = { heightM: 3, eaveM: 2.1, pxPerMetreAlong: 10, pxPerMetreUp: 20 };
  const a = buildFestivalStallGeometry(asset, STALL_TYPES.dry, options);
  assert.deepEqual(buildFestivalStallGeometry(asset, STALL_TYPES.dry, options), a);
  assert.equal(JSON.stringify(asset), before);
  near(a.groundCorners.front.x - a.groundCorners.left.x, 30, 'custom horizontal scale');
  near(a.controlPoints.feet.front.y - a.controlPoints.eaves.front.y, 42, 'custom support height');
  assert.ok(a.bounds.width > 0 && a.bounds.height > 0);
  for (const point of a.vertices) {
    assert.ok(point.x >= a.bounds.minX && point.x <= a.bounds.maxX);
    assert.ok(point.y >= a.bounds.minY && point.y <= a.bounds.maxY);
  }
});

test('invalid dimensions and folded calibrations fail explicitly instead of yielding an invalid renderer mesh', () => {
  const asset = calibration.lnyStallToys;
  assert.throws(() => buildFestivalStallGeometry(asset, { width: 0, depth: 2 }), /footprint width/);
  assert.throws(() => buildFestivalStallGeometry(asset, { width: 3, depth: NaN }), /footprint depth/);
  assert.throws(() => buildFestivalStallGeometry(asset, STALL_TYPES.dry, { eaveM: 4 }), /exceed/);
  const folded = structuredClone(asset);
  folded.feet.front = folded.eaves.front;
  assert.throws(() => buildFestivalStallGeometry(folded, STALL_TYPES.dry), /degenerate sector/);
  const outside = structuredClone(asset);
  outside.eaves.left[0] = -1;
  assert.throws(() => buildFestivalStallGeometry(outside, STALL_TYPES.dry), /calibration point/);
});

test('the pure geometry module also loads as a browser script without CommonJS', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'festival-stall-geometry.js'), 'utf8'), context);
  assert.equal(typeof context.buildFestivalStallGeometry, 'function');
});
