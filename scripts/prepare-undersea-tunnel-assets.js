#!/usr/bin/env node
'use strict';

// Register the generated artwork to the actual road grid. This is asset preparation;
// generation/editing is done by imagegen, with the prompts and originals retained.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const ART = 'scripts/source-art/underseaTunnel/v1';
const OUTPUT = 'Models/underseaTunnel';
const WIDTH = 1200;
const HEIGHT = 800;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const specs = [
  { axis: 'NS', facing: 'SE', tiles: { rows: 2, cols: 3 }, origin: [480, 200],
    ranges: [[180, 820], [1000, 1340]], targets: [[160, 328], [640, 568], [960, 408]] },
  { axis: 'EW', facing: 'SW', tiles: { rows: 3, cols: 2 }, origin: [660, 200],
    ranges: [[140, 500], [670, 1280]], targets: [[180, 408], [500, 568], [980, 328]] },
];

function bottomProfile(data, width, height) {
  const profile = new Int32Array(width).fill(-1);
  for (let x = 0; x < width; x++) {
    for (let y = height - 1; y >= 0; y--) {
      if (data[(y * width + x) * 4 + 3] >= 220) { profile[x] = y; break; }
    }
  }
  return profile;
}

function fitLine(profile, start, end) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let x = start; x < end; x++) {
    const y = profile[x];
    if (y < 0) continue;
    n++; sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  assert(n > 50, 'Not enough silhouette samples');
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { slope, intercept: (sy - slope * sx) / n };
}

function barycentric(point, triangle) {
  const [[ax, ay], [bx, by], [cx, cy]] = triangle;
  const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  assert(Math.abs(det) > 1e-6, 'Degenerate registration');
  const u = ((by - cy) * (point[0] - cx) + (cx - bx) * (point[1] - cy)) / det;
  const v = ((cy - ay) * (point[0] - cx) + (ax - cx) * (point[1] - cy)) / det;
  return [u, v, 1 - u - v];
}

function register(data, width, height, source, target) {
  const out = Buffer.alloc(WIDTH * HEIGHT * 4);
  const at = (x, y) => {
    const weights = barycentric([x, y], target);
    return [0, 1].map(j => weights.reduce((sum, w, i) => sum + w * source[i][j], 0));
  };
  const start = at(0.5, 0.5), stepX = at(1.5, 0.5), stepY = at(0.5, 1.5);
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const sx = start[0] + x * (stepX[0] - start[0]) + y * (stepY[0] - start[0]);
    const sy = start[1] + x * (stepX[1] - start[1]) + y * (stepY[1] - start[1]);
    const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    let alpha = 0, red = 0, green = 0, blue = 0;
    for (let yy = 0; yy <= 1; yy++) for (let xx = 0; xx <= 1; xx++) {
      const px = ix + xx, py = iy + yy;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const p = (py * width + px) * 4;
      // Premultiplied interpolation prevents invisible background RGB from bleeding
      // into the edge. Preserve the generated alpha, including its antialiasing.
      const w = (xx ? fx : 1 - fx) * (yy ? fy : 1 - fy) * data[p + 3];
      alpha += w; red += data[p] * w; green += data[p + 1] * w; blue += data[p + 2] * w;
    }
    const p = (y * WIDTH + x) * 4;
    if (Math.round(alpha) === 0) continue;
    out[p] = Math.round(red / alpha); out[p + 1] = Math.round(green / alpha);
    out[p + 2] = Math.round(blue / alpha); out[p + 3] = Math.round(alpha);
  }
  return out;
}

async function main() {
  const check = process.argv.includes('--check');
  const metadata = {
    version: 1, runtimeIntegrated: false, generation: 'built-in imagegen',
    projection: 'screenX = originX + 160*(col-row); screenY = originY + 80*(col+row)-z',
    canvas: [WIDTH, HEIGHT], footprintPerTile: [320, 160], earthBasePixels: 48,
    displayScaleFor100x50Tiles: 0.3125, bores: 2, roads: 2, lanesPerBore: 2,
    sourceRoadTileSet: 'newRoadTiles', assets: [],
  };
  const images = {};
  for (const spec of specs) {
    const sourceFile = `${ART}/generated-${spec.axis}.png`;
    const bytes = fs.readFileSync(path.join(ROOT, sourceFile));
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const profile = bottomProfile(data, info.width, info.height);
    const min = profile.findIndex(y => y >= 0);
    let max = info.width - 1; while (profile[max] < 0) max--;
    const left = fitLine(profile, ...spec.ranges[0]), right = fitLine(profile, ...spec.ranges[1]);
    const crossX = (right.intercept - left.intercept) / (left.slope - right.slope);
    const anchors = [[min, left.slope * min + left.intercept],
      [crossX, left.slope * crossX + left.intercept], [max, right.slope * max + right.intercept]];
    const pixels = register(data, info.width, info.height, anchors, spec.targets);
    const registered = bottomProfile(pixels, WIDTH, HEIGHT);
    const leftFit = fitLine(registered, spec.targets[0][0] + 40, spec.targets[1][0] - 40);
    const rightFit = fitLine(registered, spec.targets[1][0] + 40, spec.targets[2][0] - 40);
    assert(Math.abs(leftFit.slope - 0.5) < 0.005, `${spec.axis}: left ground edge`);
    assert(Math.abs(rightFit.slope + 0.5) < 0.005, `${spec.axis}: right ground edge`);
    let borderMaxAlpha = 0;
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      if (x < 16 || y < 16 || x >= WIDTH - 16 || y >= HEIGHT - 16)
        borderMaxAlpha = Math.max(borderMaxAlpha, pixels[(y * WIDTH + x) * 4 + 3]);
    }
    assert.equal(borderMaxAlpha, 0, `${spec.axis}: transparent safety margin`);
    const png = await sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png().toBuffer();
    const output = `${OUTPUT}/tunnel_${spec.axis}_v1.png`;
    if (check) assert.equal(hash(fs.readFileSync(path.join(ROOT, output))), hash(png), output);
    else fs.writeFileSync(path.join(ROOT, output), png);
    images[spec.axis] = png;
    const road = `newRoadTiles/road${spec.axis}_fixed.png`;
    metadata.assets.push({ axis: spec.axis, mouthsFace: spec.facing, footprintTiles: spec.tiles,
      output, outputSha256: hash(png), source: sourceFile, sourceSha256: hash(bytes),
      referenceRoad: road, referenceRoadSha256: hash(fs.readFileSync(path.join(ROOT, road))),
      groundCentreOfTile00: spec.origin, sourceBaseAnchors: anchors, targetBaseAnchors: spec.targets,
      rasterBaseSlopes: [leftFit.slope, rightFit.slope], borderMaxAlpha });
  }
  const metadataFile = path.join(ROOT, 'data/undersea-tunnel-assets.json');
  if (check) assert.deepEqual(JSON.parse(fs.readFileSync(metadataFile)), metadata);
  else fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2) + '\n');

  const header = Buffer.from(`<svg width="1440" height="1100" xmlns="http://www.w3.org/2000/svg">
    <rect width="1440" height="1100" fill="#eef1ef"/>
    <g font-family="sans-serif" fill="#263b39">
      <text x="40" y="49" font-size="26" font-weight="bold">Twin-bore undersea tunnel / v1</text>
      <text x="40" y="83" font-size="17">Existing straight-road tiles → two separate parallel bores · 2:1 isometric ground grid</text>
      <text x="40" y="129" font-size="20">Existing roads</text>
      <text x="760" y="129" font-size="20">Tunnel entrances / exits</text>
      <text x="40" y="177" font-size="17">NS tile axis · mouths face SE</text>
      <text x="40" y="659" font-size="17">EW tile axis · mouths face SW</text>
      <text x="40" y="1070" font-size="15">Art assets only · each bore joins one existing road · no vehicles or water baked into sprites</text>
    </g>
  </svg>`);
  const layers = [];
  for (const [i, axis] of ['NS', 'EW'].entries()) {
    const reference = await sharp(path.join(ROOT, ART, `road-pair-${axis}-reference.png`))
      .extract({ left: 100, top: 80, width: WIDTH, height: HEIGHT }).resize(660, 440).toBuffer();
    const model = await sharp(images[axis]).resize(660, 440).toBuffer();
    layers.push({ input: reference, left: 20, top: 190 + i * 470 });
    layers.push({ input: model, left: 740, top: 190 + i * 470 });
  }
  const preview = await sharp(header).composite(layers).png().toBuffer();
  const previewFile = path.join(ROOT, ART, 'comparison.png');
  if (check) assert.equal(hash(fs.readFileSync(previewFile)), hash(preview), 'comparison.png');
  else fs.writeFileSync(previewFile, preview);
  console.log(JSON.stringify({ mode: check ? 'verified' : 'prepared', assets: metadata.assets.map(a => ({
    output: a.output, slopes: a.rasterBaseSlopes, borderMaxAlpha: a.borderMaxAlpha,
  })) }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { bottomProfile, fitLine, register };
