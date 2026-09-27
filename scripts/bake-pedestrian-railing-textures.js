// Bake the pedestrian railing (行人路方柱欄杆) textures from the two source renders.
//
//   node scripts/bake-pedestrian-railing-textures.js [--out <dir>] [--preview <png>]
//
// Models/roadAssessories/railing_squareBaluster_orientationA.png is one set of square-baluster
// railing (two panels, ~5 m) along the screen NW-SE axis; orientationB.png the same along SW-NE.
// A placement is two sets end to end (~10 m, half a tile edge), so the bake lays each source
// down twice along its own base line and centres the pair on one anchor - the base-line
// midpoint - on a fixed power-of-two canvas (Phaser only mipmaps power-of-two textures, and
// the run is drawn at ~1/18 of its baked size), the way the bridge parapets are baked.
// Outputs pedestrianRailing_h.png (NW-SE) and pedestrianRailing_v.png (SW-NE).
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'Models', 'roadAssessories');
const args = process.argv.slice(2);
const argValue = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const OUT_DIR = path.resolve(argValue('--out') || SOURCE_DIR);
const PREVIEW = argValue('--preview');

// Keep in step with PEDESTRIAN_RAILING_SOURCE_CANVAS / _SOURCE_ANCHOR (pedestrian-railings.js).
const CANVAS_W = 512;
const CANVAS_H = 512;
const ANCHOR = { x: 256, y: 300 };
// Horizontal canvas px one set's base spans; two sets = 440 px = half a tile edge (25 screen
// px at zoom 1) at PEDESTRIAN_RAILING_SCALE 25/440.
const SET_SPAN = 220;
// Pixels this faint are the renderer's dark halo, not the railing.
const FRINGE_ALPHA = 96;

const SOURCES = [
  { file: 'railing_squareBaluster_orientationA.png', out: 'pedestrianRailing_h.png', slope: 0.5 },
  { file: 'railing_squareBaluster_orientationB.png', out: 'pedestrianRailing_v.png', slope: -0.5 },
];

async function loadRaw(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// Solid bounds plus the base line: the lowest solid pixel per column across the middle half
// of the run, least-squares fitted.
function measure(img) {
  const { data, width, height } = img;
  let minX = width; let maxX = -1; let minY = height; let maxY = -1;
  const bottom = new Array(width).fill(-1);
  for (let x = 0; x < width; x++) {
    for (let y = height - 1; y >= 0; y--) {
      if (data[(y * width + x) * 4 + 3] < FRINGE_ALPHA) continue;
      if (bottom[x] < 0) bottom[x] = y;
      if (y < minY) minY = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    if (bottom[x] > maxY) maxY = bottom[x];
  }
  if (maxX < 0) throw new Error('no solid pixels');
  const span = maxX - minX;
  let n = 0; let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
  for (let x = Math.round(minX + span * 0.25); x <= Math.round(minX + span * 0.75); x++) {
    if (bottom[x] < 0) continue;
    n++; sx += x; sy += bottom[x]; sxx += x * x; sxy += x * bottom[x];
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  return { minX, maxX, minY, maxY, base: (x) => slope * x + intercept, slope };
}

async function bake(source) {
  const img = await loadRaw(path.join(SOURCE_DIR, source.file));
  for (let i = 0; i < img.width * img.height; i++) {
    if (img.data[i * 4 + 3] < FRINGE_ALPHA) img.data[i * 4 + 3] = 0;
  }
  const m = measure(img);
  if (Math.sign(m.slope) !== Math.sign(source.slope)) {
    throw new Error(`${source.file}: base slope ${m.slope.toFixed(2)} is not along the expected axis`);
  }
  const k = SET_SPAN / (m.maxX - m.minX);
  const cropW = m.maxX - m.minX + 1;
  const cropH = m.maxY - m.minY + 1;
  const width = Math.round(cropW * k);
  const height = Math.round(cropH * k);
  const set = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
    .extract({ left: m.minX, top: m.minY, width: cropW, height: cropH })
    .resize(width, height, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  // Base-line ends of one set, in its own resized pixels.
  const left = { x: 0, y: (m.base(m.minX) - m.minY) * k };
  const right = { x: (m.maxX - m.minX) * k, y: (m.base(m.maxX) - m.minY) * k };
  // First set ends at the anchor, second starts there. The lower (nearer) set draws last.
  const first = { input: set, left: Math.round(ANCHOR.x - right.x), top: Math.round(ANCHOR.y - right.y) };
  const second = { input: set, left: Math.round(ANCHOR.x - left.x), top: Math.round(ANCHOR.y - left.y) };
  const layers = source.slope > 0 ? [first, second] : [second, first];
  for (const layer of layers) {
    if (layer.left < 0 || layer.top < 0 || layer.left + width > CANVAS_W || layer.top + height > CANVAS_H) {
      throw new Error(`${source.file}: a set falls outside the ${CANVAS_W}x${CANVAS_H} canvas`);
    }
  }
  const composed = await sharp({ create: { width: CANVAS_W, height: CANVAS_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    .raw()
    .toBuffer();
  const sheared = shearToIsometric(composed, source.slope - m.slope);
  const out = await sharp(sheared, { raw: { width: CANVAS_W, height: CANVAS_H, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await sharp(out).toFile(path.join(OUT_DIR, source.out));
  console.log(`${source.out}: two sets of ${source.file} at ${k.toFixed(4)}x, base slope ${m.slope.toFixed(3)} sheared to ${source.slope}`);
  return out;
}

// The renders sit a little flatter than the 2:1 isometric axis (slope ~0.44, not 0.5), so a
// run would drift off the kerb line towards its ends. A vertical shear about the anchor puts the
// base on the true axis and keeps every post vertical. Premultiplied so edges don't darken.
function shearToIsometric(raw, slopeChange) {
  const out = Buffer.alloc(raw.length);
  for (let x = 0; x < CANVAS_W; x++) {
    const shift = slopeChange * (x - ANCHOR.x);
    for (let y = 0; y < CANVAS_H; y++) {
      const sy = y - shift;
      const y0 = Math.floor(sy);
      const f = sy - y0;
      let r = 0; let g = 0; let b = 0; let a = 0;
      [[y0, 1 - f], [y0 + 1, f]].forEach(([row, w]) => {
        if (row < 0 || row >= CANVAS_H || w <= 0) return;
        const o = (row * CANVAS_W + x) * 4;
        const alpha = (raw[o + 3] / 255) * w;
        r += raw[o] * alpha; g += raw[o + 1] * alpha; b += raw[o + 2] * alpha; a += alpha;
      });
      const o = (y * CANVAS_W + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round(a * 255);
      }
    }
  }
  return out;
}

async function main() {
  const outputs = [];
  for (const source of SOURCES) outputs.push(await bake(source));
  if (PREVIEW) {
    const marker = Buffer.from(`<svg width="${CANVAS_W}" height="${CANVAS_H}"><circle cx="${ANCHOR.x}" cy="${ANCHOR.y}" r="4" fill="red"/></svg>`);
    const tiles = await Promise.all(outputs.map((png) => sharp(png).composite([{ input: marker }]).png().toBuffer()));
    await sharp({ create: { width: CANVAS_W * 2, height: CANVAS_H, channels: 4, background: '#8a9a7a' } })
      .composite(tiles.map((input, i) => ({ input, left: i * CANVAS_W, top: 0 })))
      .png()
      .toFile(PREVIEW);
    console.log(`preview: ${PREVIEW}`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
