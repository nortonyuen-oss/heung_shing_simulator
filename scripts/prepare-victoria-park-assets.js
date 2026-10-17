#!/usr/bin/env node
// Normalize six generated park modules to the existing 4x4 lot, without painting or diamond clipping.
// node scripts/prepare-victoria-park-assets.js [--detect-only]
// geometry.json: { "modules": { "module01": { "left": [x,y], "front": [x,y], "right": [x,y] } } }
// A back corner is optional. Missing measurements use alpha-edge detection; inspect its proposals.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { detectBuildingGroundCorners } = require('../building-ground-fit.js');

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'scripts/source-art/victoriaPark');
const OUTPUT = path.join(ROOT, 'Models/parks/park4x4');
const PREVIEWS = path.join(ART, 'previews');
const SIZE = 1024;
const CORNERS = { left: [8, 716], front: [512, 968], right: [1016, 716], back: [512, 464] };
const MAX_ERROR_PX = 3;
const MODULES = [
  ['module01', 'Boat pond and wooded garden'],
  ['module02', 'Bowling greens and playground'],
  ['module03', 'Central lawn and fountain'],
  ['module04', 'Tennis courts and swimming pool'],
  ['module05', 'Football pitches, west'],
  ['module06', 'Football, statue and basketball'],
].map(([id, label], i) => ({ id, label, row: Math.floor(i / 2), col: i % 2 }));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function point(value, name) {
  assert(Array.isArray(value) && value.length === 2 && value.every(Number.isFinite), `Invalid ${name} corner.`);
  return value;
}

function readCorners(value, name) {
  const c = value?.corners ?? value;
  const left = point(c?.left, `${name}.left`);
  const front = point(c?.front, `${name}.front`);
  const right = point(c?.right, `${name}.right`);
  const back = c.back ? point(c.back, `${name}.back`) : left.map((v, i) => v + right[i] - front[i]);
  assert(left[0] < front[0] && front[0] < right[0], `${name}: ground corners must run left, front, right.`);
  return { left, front, right, back };
}

// One affine projection maps the three measured ground corners exactly to the canonical lot.
// A slight horizontal shear corrects generated ground whose front is off the side midpoint.
function projectionFor(corners) {
  const { left: l, front: f, right: r } = corners;
  const ux = f[0] - l[0], uy = f[1] - l[1];
  const vx = r[0] - l[0], vy = r[1] - l[1];
  const det = ux * vy - vx * uy;
  assert(vx > 0 && det < -1, 'Ground must have positive width and front depth.');
  const a = (504 * vy - 1008 * uy) / det;
  const b = (-504 * vx + 1008 * ux) / det;
  const c = 252 * vy / det;
  const d = -252 * vx / det;
  return { a, b, c, d, tx: 8 - a * l[0] - b * l[1], ty: 716 - c * l[0] - d * l[1],
    tiltDegrees: Math.atan2(b, d) * 180 / Math.PI };
}

function mapPoint([x, y], p) {
  return [p.a * x + p.b * y + p.tx, p.c * x + p.d * y + p.ty];
}

function validateProjection(corners, projection, name) {
  const mapped = Object.fromEntries(Object.entries(corners).map(([key, p]) => [key, mapPoint(p, projection)]));
  const residuals = Object.fromEntries(Object.entries(mapped).map(([key, p]) => [key, Math.hypot(p[0] - CORNERS[key][0], p[1] - CORNERS[key][1])]));
  const maxError = Math.max(...Object.values(residuals));
  const leftSlope = (mapped.front[1] - mapped.left[1]) / (mapped.front[0] - mapped.left[0]);
  const rightSlope = (mapped.front[1] - mapped.right[1]) / (mapped.right[0] - mapped.front[0]);
  console.log(`${name}: corner residual ${maxError.toFixed(3)} px; front slopes ${leftSlope.toFixed(4)}, ${rightSlope.toFixed(4)}; vertical tilt ${projection.tiltDegrees.toFixed(3)}°.`);
  assert(maxError <= MAX_ERROR_PX, `${name}: corner residual ${maxError.toFixed(3)} px exceeds ${MAX_ERROR_PX} px. Inspect geometry.json; back must complete the measured ground parallelogram.`);
  assert(Math.abs(leftSlope - 0.5) < 0.01 && Math.abs(rightSlope - 0.5) < 0.01, `${name}: ground must have 2:1 projection.`);
  return { mappedCorners: mapped, cornerResidualsPx: residuals, maxCornerResidualPx: maxError, frontSlopes: [leftSlope, rightSlope], tiltDegrees: projection.tiltDegrees };
}

// Inverse affine bilinear sampling in premultiplied alpha space avoids light fringes.
// No ground mask is applied: foliage above the back edges stays in the asset.
function normalizePixels(data, width, height, p, name) {
  let clipped = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= 16) continue;
      const [dx, dy] = mapPoint([x, y], p);
      if (dx < -0.5 || dx > SIZE - 0.5 || dy < -0.5 || dy > SIZE - 0.5) clipped++;
    }
  }
  assert(clipped === 0, `${name}: normalization would clip ${clipped} visible source pixels. Inspect corners/canvas; do not trim trees to the ground diamond.`);
  const out = Buffer.alloc(SIZE * SIZE * 4);
  const det = p.a * p.d - p.b * p.c;
  assert(Math.abs(det) > 1e-12, `${name}: singular projection.`);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - p.tx, dy = y - p.ty;
      const ix = (p.d * dx - p.b * dy) / det;
      const iy = (-p.c * dx + p.a * dy) / det;
      const x0 = Math.floor(ix), y0 = Math.floor(iy), fx = ix - x0, fy = iy - y0;
      let a = 0, red = 0, green = 0, blue = 0;
      for (let oy = 0; oy < 2; oy++) {
        for (let ox = 0; ox < 2; ox++) {
          const px = x0 + ox, py = y0 + oy;
          if (px < 0 || px >= width || py < 0 || py >= height) continue;
          const si = (py * width + px) * 4;
          const alphaWeight = data[si + 3] * (ox ? fx : 1 - fx) * (oy ? fy : 1 - fy);
          a += alphaWeight;
          red += data[si] * alphaWeight;
          green += data[si + 1] * alphaWeight;
          blue += data[si + 2] * alphaWeight;
        }
      }
      if (a <= 0) continue;
      const di = (y * SIZE + x) * 4;
      out[di] = Math.round(red / a);
      out[di + 1] = Math.round(green / a);
      out[di + 2] = Math.round(blue / a);
      out[di + 3] = Math.round(a);
    }
  }
  return out;
}

async function previews(modules) {
  const layers = [...modules].sort((a, b) => a.grid.row + a.grid.col - b.grid.row - b.grid.col).map((m) => ({
    input: path.join(ROOT, m.path), left: m.assemblyOffsetPx.x, top: m.assemblyOffsetPx.y,
  }));
  await sharp({ create: { width: 2536, height: 1780, channels: 4, background: '#00000000' } })
    .composite(layers).png().toFile(path.join(PREVIEWS, 'victoriaPark-assembled.png'));
  const sheetLayers = [];
  for (const m of modules) {
    const left = 16 + m.grid.col * 528, top = 16 + m.grid.row * 566;
    sheetLayers.push({ input: await sharp(path.join(ROOT, m.path)).resize(512, 512).png().toBuffer(), left, top });
    const label = `<svg width="512" height="38"><text x="8" y="15" fill="#ffffff" font-family="sans-serif" font-size="14">${m.id} · row ${m.grid.row + 1}, col ${m.grid.col + 1} · 80 × 80 m</text><text x="8" y="34" fill="#b9c8cf" font-family="sans-serif" font-size="13">${m.label}</text></svg>`;
    sheetLayers.push({ input: Buffer.from(label), left, top: top + 512 });
  }
  await sharp({ create: { width: 1072, height: 1730, channels: 4, background: '#172229' } })
    .composite(sheetLayers).png().toFile(path.join(PREVIEWS, 'victoriaPark-contact-sheet.png'));
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: node scripts/prepare-victoria-park-assets.js [--detect-only]\nReads original/module01.png ... module06.png and optional geometry.json under scripts/source-art/victoriaPark.\n--detect-only writes geometry-detected.json for manual review; it does not overwrite geometry.json.');
    return;
  }
  const sourceDir = path.join(ART, 'original');
  const actualFiles = fs.readdirSync(sourceDir).filter((file) => /^module\d+\.png$/i.test(file)).sort();
  const expectedFiles = MODULES.map((m) => `${m.id}.png`);
  assert(JSON.stringify(actualFiles) === JSON.stringify(expectedFiles), `Expected exactly six sources: ${expectedFiles.join(', ')}.`);
  const geometryPath = path.join(ART, 'geometry.json');
  const saved = fs.existsSync(geometryPath) ? JSON.parse(fs.readFileSync(geometryPath, 'utf8')) : {};
  const measurements = saved.modules ?? saved;
  const detected = { modules: {} };
  const prepared = [];
  const detectOnly = process.argv.includes('--detect-only');

  // Validate and normalize everything in memory before replacing any deliverable.
  for (const module of MODULES) {
    const sourcePath = path.join(sourceDir, `${module.id}.png`);
    const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert(info.channels === 4, `${module.id}: an RGBA source is required.`);
    const proposal = detectBuildingGroundCorners(data, info.width, info.height, { channels: 4 });
    const detectedCorners = proposal ? { left: proposal.left, front: proposal.front, right: proposal.right,
      back: proposal.left.map((v, i) => v + proposal.right[i] - proposal.front[i]) } : null;
    detected.modules[module.id] = { sourceSize: { width: info.width, height: info.height }, corners: detectedCorners, confident: proposal?.confident ?? false };
    if (detectOnly) continue;
    const measured = measurements[module.id];
    assert(measured || proposal?.confident, `${module.id}: no confident detected lot. Add measured corners to geometry.json.`);
    const corners = readCorners(measured ?? proposal, module.id);
    const projection = projectionFor(corners);
    const validation = validateProjection(corners, projection, module.id);
    const pixels = normalizePixels(data, info.width, info.height, projection, module.id);
    prepared.push({ module, sourceSize: { width: info.width, height: info.height }, sourceCorners: corners, projection, validation, pixels, geometrySource: measured ? 'geometry.json' : 'alpha-edge detection (review required)' });
  }
  fs.mkdirSync(ART, { recursive: true });
  fs.writeFileSync(path.join(ART, 'geometry-detected.json'), `${JSON.stringify(detected, null, 2)}\n`);
  if (detectOnly) {
    console.log('Wrote geometry-detected.json; inspect the proposed ground corners before preparation.');
    return;
  }
  assert(prepared.length === 6, 'Exactly six modules must be prepared.');
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.mkdirSync(PREVIEWS, { recursive: true });
  const modules = [];
  for (const item of prepared) {
    const { module, pixels, ...metadata } = item;
    const logicalPath = `Models/parks/park4x4/victoriaPark4-${module.id}.png`;
    await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 4, premultiplied: false } }).png().toFile(path.join(ROOT, logicalPath));
    // The first module also replaces the old path used by existing saves.
    if (module.id === 'module01') fs.copyFileSync(path.join(ROOT, logicalPath), path.join(OUTPUT, 'victoriaPark4-01.png'));
    modules.push({ id: module.id, label: module.label, path: logicalPath, width: SIZE, height: SIZE,
      footprintCols: 4, footprintRows: 4, metres: { width: 80, height: 80 }, groundCorners: CORNERS,
      grid: { row: module.row, col: module.col },
      assemblyOffsetPx: { x: 1008 + (module.col - module.row) * 504, y: (module.col + module.row) * 252 },
      engineOffsetPx: { x: (module.col - module.row) * 200, y: (module.col + module.row) * 100 },
      source: `scripts/source-art/victoriaPark/original/${module.id}.png`, ...metadata });
  }
  const manifest = { version: 1, projection: '2:1 isometric', metresPerTile: 20,
    grid: { cols: 2, rows: 3 }, footprint: { cols: 8, rows: 12 }, metres: { width: 160, height: 240 },
    canonicalGroundCorners: CORNERS, engineModuleSpanPx: { width: 400, height: 200 },
    assembly: { width: 2536, height: 1780, groundBoundsPx: { left: 8, top: 464, right: 2528, bottom: 1724 }, engineGroundSpanPx: { width: 1000, height: 500 } },
    normalization: { method: 'Affine projection through three measured ground corners; derived back completes the parallelogram; premultiplied-alpha bilinear resampling.', maxCornerResidualPx: MAX_ERROR_PX, tilt: 'The measured vertical tilt for each module is reported in projection.tiltDegrees.', foliage: 'Preserved above rear boundaries; no diamond clipping.' },
    modules };
  await previews(modules);
  fs.writeFileSync(path.join(OUTPUT, 'victoriaPark-modules.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('Prepared six 4x4 modules, assembly manifest, transparent assembly and labeled contact sheet.');
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { projectionFor, mapPoint, validateProjection, readCorners, normalizePixels, CORNERS };
