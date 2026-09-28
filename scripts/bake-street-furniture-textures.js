// Bake the roadside furniture textures (垃圾桶 / 電箱 / 郵筒 / 咪錶 / 消防龍頭 / 電話亭 / 報紙檔 /
// 車柱 / 路牌) from the source renders in Models/roadAssessories/.
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
//
// Bollards stand in groups, so their views are a pair (`pair`): two copies of the post
// BOLLARD_SPACING_M apart along the kerb, i.e. along the road's screen direction for that view
// (sw: NW-SE, se: SW-NE), the far one drawn first. The pair is then baked like any single prop,
// so its heightM is the pair's drawn height: BOLLARD_PAIR_HEIGHT_RATIO post heights.
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
// Keep in step with STREET_FURNITURE_KINDS.bollard.heightM (street-furniture.js): a 1 m post
// (Highways Department standard bollard height), pairs 1.5 m apart. Along a road, one metre is
// 2.5 screen px across and 1.25 down at zoom 1, against 5 px per metre of height.
const BOLLARD_SPACING_M = 1.5;
const BOLLARD_PAIR_DX = BOLLARD_SPACING_M * 2.5 / 5;   // in post heights
const BOLLARD_PAIR_DY = BOLLARD_SPACING_M * 1.25 / 5;  // = BOLLARD_PAIR_HEIGHT_RATIO - 1

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
  { out: 'streetFurniture_hydrant_sw.png', file: 'fireHydrant_red_dualView.png', part: 1, flip: false },
  { out: 'streetFurniture_hydrant_se.png', file: 'fireHydrant_red_dualView.png', part: 1, flip: true },
  { out: 'streetFurniture_phoneBooth_sw.png', file: 'phoneBooth_red.png', part: null, flip: false },
  { out: 'streetFurniture_phoneBooth_se.png', file: 'phoneBooth_red.png', part: null, flip: true },
  { out: 'streetFurniture_newsstand_sw.png', file: 'newsstand_realistic_noUmbrella.png', part: 1, flip: false },
  { out: 'streetFurniture_newsstand_se.png', file: 'newsstand_realistic_noUmbrella.png', part: 1, flip: true },
  { out: 'streetFurniture_bollard_sw.png', file: 'bollard_yellowBlack_dualView.png', part: 0, flip: false, pair: 'sw' },
  { out: 'streetFurniture_bollard_se.png', file: 'bollard_yellowBlack_dualView.png', part: 0, flip: false, pair: 'se' },
  // Street name plates: the plate runs along the road, so each view is its own render - the
  // two-post sign has one per direction. The single-post sign has only the NW-SE render; its
  // SE view is the mirror (the lettering reads backwards, but is a few pixels tall in game).
  { out: 'streetFurniture_streetSign_sw.png', file: '香城道雙柱路牌(2).png', part: null, flip: false },
  { out: 'streetFurniture_streetSign_se.png', file: '香城道雙柱路牌(1).png', part: null, flip: false },
  { out: 'streetFurniture_streetSignSingle_sw.png', file: '香城道雙語加長路牌.png', part: null, flip: false },
  { out: 'streetFurniture_streetSignSingle_se.png', file: '香城道雙語加長路牌.png', part: null, flip: true },
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
  let w = b.maxX - b.minX + 1;
  let h = b.maxY - b.minY + 1;
  let object = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
    .extract({ left: b.minX, top: b.minY, width: w, height: h })
    .png()
    .toBuffer();
  if (view.pair) {
    const dx = Math.round(BOLLARD_PAIR_DX * h);
    const dy = Math.round(BOLLARD_PAIR_DY * h);
    // sw: the road runs NW-SE on screen, the far post up-left; se: SW-NE, the far post up-right.
    const far = view.pair === 'sw' ? { left: 0, top: 0 } : { left: dx, top: 0 };
    const near = view.pair === 'sw' ? { left: dx, top: dy } : { left: 0, top: dy };
    object = await sharp({ create: { width: w + dx, height: h + dy, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: object, ...far }, { input: object, ...near }])
      .png()
      .toBuffer();
    w += dx;
    h += dy;
  }
  const scale = BAKED_HEIGHT / h;
  const outW = Math.round(w * scale);
  if (outW > CANVAS) throw new Error(`${view.out}: ${outW}px wide at ${BAKED_HEIGHT}px tall does not fit the canvas`);
  let pipeline = sharp(object).resize(outW, BAKED_HEIGHT, { kernel: 'lanczos3' });
  if (view.flip) pipeline = pipeline.flop();
  const baked = await pipeline.png().toBuffer();
  const out = await sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: baked, left: Math.round(ANCHOR.x - outW / 2), top: ANCHOR.y - BAKED_HEIGHT }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await sharp(out).toFile(path.join(OUT_DIR, view.out));
  console.log(`${view.out}: ${view.file}${view.part === null ? '' : ` part ${view.part}`}${view.flip ? ' mirrored' : ''}${view.pair ? ` pair ${view.pair}` : ''} -> ${outW}x${BAKED_HEIGHT}`);
  return out;
}

async function main() {
  const cache = new Map();
  const outputs = [];
  for (const view of VIEWS) outputs.push(await bakeView(view, cache));
  if (PREVIEW) {
    const marker = Buffer.from(`<svg width="${CANVAS}" height="${CANVAS}"><circle cx="${ANCHOR.x}" cy="${ANCHOR.y}" r="3" fill="red"/></svg>`);
    const tiles = await Promise.all(outputs.map((png) => sharp(png).composite([{ input: marker }]).png().toBuffer()));
    await sharp({ create: { width: CANVAS * Math.ceil(outputs.length / 2), height: CANVAS * 2, channels: 4, background: '#8a9a7a' } })
      .composite(tiles.map((input, i) => ({ input, left: Math.floor(i / 2) * CANVAS, top: (i % 2) * CANVAS })))
      .png()
      .toFile(PREVIEW);
    console.log(`preview: ${PREVIEW}`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
