// Bake the roadside furniture textures (垃圾桶 / 電箱 / 郵筒 / 咪錶) from the source renders in
// Models/roadAssessories/.
//
//   node scripts/bake-street-furniture-textures.js [--out <dir>] [--preview <png>]
//
// Each prop needs two screen views: `sw` (front towards the camera's lower left, for kerbs along
// a road running NW-SE on screen) and `se` (front to the lower right, for roads running SW-NE),
// so its front always shows. The renders give one or two objects side by side; which object is
// which view (or which gets mirrored for the other) is spelled out per source below. Every view
// is trimmed, scaled to a common height and stood on a fixed power-of-two canvas with its base
// (bottom centre of the solid bounds) on one anchor, the way the lamp posts and signal poles are.
// The in-game size per prop is STREET_FURNITURE_KINDS[kind].heightM (street-furniture.js).
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'Models', 'roadAssessories');
const args = process.argv.slice(2);
const argValue = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const OUT_DIR = path.resolve(argValue('--out') || SOURCE_DIR);
const PREVIEW = argValue('--preview');

// Keep in step with STREET_FURNITURE_SOURCE_CANVAS / _ANCHOR / _BAKED_HEIGHT (street-furniture.js).
const CANVAS = 256;
const ANCHOR = { x: 128, y: 248 };
const BAKED_HEIGHT = 200;
const SOLID_ALPHA = 96;

// part: which object of a two-object render (0 = left, 1 = right, null = the whole image).
const VIEWS = [
  { out: 'streetFurniture_bin_se.png', file: 'trashBin_retroRusty.png', part: null, flip: false },
  { out: 'streetFurniture_bin_sw.png', file: 'trashBin_retroRusty.png', part: null, flip: true },
  { out: 'streetFurniture_cabinet_se.png', file: 'utilityCabinet_dualView.png', part: 0, flip: false },
  { out: 'streetFurniture_cabinet_sw.png', file: 'utilityCabinet_dualView.png', part: 0, flip: true },
  { out: 'streetFurniture_signalCabinet_se.png', file: 'utilityCabinet_dualView.png', part: 1, flip: false },
  { out: 'streetFurniture_signalCabinet_sw.png', file: 'utilityCabinet_dualView.png', part: 1, flip: true },
  { out: 'streetFurniture_postbox_sw.png', file: 'postbox_red_dualView.png', part: 0, flip: false },
  { out: 'streetFurniture_postbox_se.png', file: 'postbox_red_dualView.png', part: 1, flip: false },
  { out: 'streetFurniture_parkingMeter_sw.png', file: 'parkingMeter_dualView.png', part: 1, flip: false },
  { out: 'streetFurniture_parkingMeter_se.png', file: 'parkingMeter_dualView.png', part: 1, flip: true },
];

async function loadRaw(file) {
  const { data, info } = await sharp(path.join(SOURCE_DIR, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function solidBounds(img, x0 = 0, x1 = img.width - 1) {
  let minX = Infinity; let maxX = -1; let minY = Infinity; let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = x0; x <= x1; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] < SOLID_ALPHA) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('no solid pixels');
  return { minX, maxX, minY, maxY };
}

// The two objects of a side-by-side render: split at the middle of the widest fully clear run
// of columns inside the solid span.
function splitColumn(img) {
  const all = solidBounds(img);
  let best = { start: -1, length: 0 };
  let run = null;
  for (let x = all.minX; x <= all.maxX; x++) {
    let clear = true;
    for (let y = 0; y < img.height && clear; y++) {
      if (img.data[(y * img.width + x) * 4 + 3] >= SOLID_ALPHA) clear = false;
    }
    if (clear) {
      if (!run) run = { start: x, length: 0 };
      run.length++;
      if (run.length > best.length) best = { ...run };
    } else {
      run = null;
    }
  }
  if (best.length < 4) throw new Error('no clear gap between the two objects');
  return best.start + Math.floor(best.length / 2);
}

async function bakeView(view, cache) {
  if (!cache.has(view.file)) cache.set(view.file, await loadRaw(view.file));
  const img = cache.get(view.file);
  let x0 = 0;
  let x1 = img.width - 1;
  if (view.part !== null) {
    const split = splitColumn(img);
    if (view.part === 0) x1 = split; else x0 = split;
  }
  const b = solidBounds(img, x0, x1);
  const w = b.maxX - b.minX + 1;
  const h = b.maxY - b.minY + 1;
  const scale = BAKED_HEIGHT / h;
  const outW = Math.round(w * scale);
  if (outW > CANVAS) throw new Error(`${view.out}: ${outW}px wide at ${BAKED_HEIGHT}px tall does not fit the canvas`);
  let pipeline = sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
    .extract({ left: b.minX, top: b.minY, width: w, height: h })
    .resize(outW, BAKED_HEIGHT, { kernel: 'lanczos3' });
  if (view.flip) pipeline = pipeline.flop();
  const object = await pipeline.png().toBuffer();
  const out = await sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: object, left: Math.round(ANCHOR.x - outW / 2), top: ANCHOR.y - BAKED_HEIGHT }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await sharp(out).toFile(path.join(OUT_DIR, view.out));
  console.log(`${view.out}: ${view.file}${view.part === null ? '' : ` part ${view.part}`}${view.flip ? ' mirrored' : ''} -> ${outW}x${BAKED_HEIGHT}`);
  return out;
}

async function main() {
  const cache = new Map();
  const outputs = [];
  for (const view of VIEWS) outputs.push(await bakeView(view, cache));
  if (PREVIEW) {
    const marker = Buffer.from(`<svg width="${CANVAS}" height="${CANVAS}"><circle cx="${ANCHOR.x}" cy="${ANCHOR.y}" r="3" fill="red"/></svg>`);
    const tiles = await Promise.all(outputs.map((png) => sharp(png).composite([{ input: marker }]).png().toBuffer()));
    await sharp({ create: { width: CANVAS * 5, height: CANVAS * 2, channels: 4, background: '#8a9a7a' } })
      .composite(tiles.map((input, i) => ({ input, left: Math.floor(i / 2) * CANVAS, top: (i % 2) * CANVAS })))
      .png()
      .toFile(PREVIEW);
    console.log(`preview: ${PREVIEW}`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
