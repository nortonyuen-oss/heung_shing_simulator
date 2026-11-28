// Bake the 公屋邨's 冬菇亭 (housing-estates.js, park option food_pavilion) from Norton's art.
//
//   node scripts/bake-food-pavilion-texture.js [--preview <png>]
//
// scripts/source-art/foodPavilion/original/foodPavilion.png (Norton, 2026-11-28: 做屋村設施) is the
// pavilion on its raised plaza, railings, planters, globe lamps and diners. By the man at its door
// (92 px = 1.7 m) the plaza is about 16.6 x 13.2 m; its edges lie at 0.473 / -0.466 against the
// game's 0.5, so it is squared the buildings' way (art-isometric-squaring: an x scale and a hair of
// vertical skew, never perspective), scaled 1.09 so its long side is ~90% of the 20 m tile, centred on
// the lot and laid on the estates' own paving. Out at 512 x 512 (a power of two, the size the release
// staging gives a 1x1 anyway): Models/parks/park1x1/foodPavilion1-01.png. Prints the three globe lamps'
// heads in its pixels, for the light profile (building-lighting.js park_small_food_pavilion, sourcePixels:
// the night bake maps them onto the packaged texture).
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'scripts', 'source-art', 'foodPavilion', 'original', 'foodPavilion.png');
const OUT = path.join(ROOT, 'Models', 'parks', 'park1x1', 'foodPavilion1-01.png');
const args = process.argv.slice(2);
const PREVIEW = (() => { const i = args.indexOf('--preview'); return i >= 0 ? args[i + 1] : null; })();

const SIZE = 512;                                   // the texture, square
const WORK = 1254;                                  // drawn at this first, then reduced (no aliasing)
// the art: its plaza's front corner and edge slopes (the two lower edges, fitted), the man at the door
const F = { x: 680.8, y: 974.9 };
const SLOPE_LEFT = 0.473, SLOPE_RIGHT = -0.466;
const SIDE_LEFT_PX = 680.8 - 59, SIDE_RIGHT_PX = 1461 - 680.8;
const PX_PER_M_UP = 92 / 1.7;
const FIT = 1.09;                                   // x the art's own metres
// its globe lamps (the heads), art px
const LAMPS = [{ x: 141, y: 538 }, { x: 1262, y: 330 }, { x: 698, y: 739 }];

const k = -(SLOPE_LEFT + SLOPE_RIGHT) / 2;
const sx = (SLOPE_LEFT - SLOPE_RIGHT) / (2 * 0.5);
const ALONG_ART = PX_PER_M_UP / Math.sqrt(1.5);    // art px a metre along an axis, once squared
const sideR = SIDE_RIGHT_PX * sx / ALONG_ART, sideL = SIDE_LEFT_PX * sx / ALONG_ART;

// the lot on the work canvas: its diamond nearly the canvas wide, its front corner near the bottom
const hw = (WORK - 19) / 2;                         // half the diamond's width
const Ft = { x: WORK / 2, y: WORK - 8 };            // the lot's front corner
const perM = hw / 20;                               // work px a metre (along x)
const g = perM * FIT / ALONG_ART;                   // work px a squared-art px
const m1 = (20 - sideR * FIT) / 2, m2 = (20 - sideL * FIT) / 2;
const Fc = { x: Ft.x + (m1 - m2) * perM, y: Ft.y - (m1 + m2) * perM / 2 };
const toWork = (x, y) => ({ X: Fc.x + g * sx * (x - F.x), Y: Fc.y + g * ((y - F.y) + k * (x - F.x)) });

(async () => {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(WORK * WORK * 4);
  for (let Y = 0; Y < WORK; Y++) for (let X = 0; X < WORK; X++) {
    const x = F.x + (X - Fc.x) / (g * sx);
    const y = F.y + (Y - Fc.y) / g - k * (x - F.x);
    if (x < 0 || y < 0 || x >= info.width - 1 || y >= info.height - 1) continue;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    let r = 0, gg = 0, b = 0, a = 0;
    for (const [xx, yy, w] of [[x0, y0, (1 - fx) * (1 - fy)], [x0 + 1, y0, fx * (1 - fy)], [x0, y0 + 1, (1 - fx) * fy], [x0 + 1, y0 + 1, fx * fy]]) {
      const i = (yy * info.width + xx) * 4, al = data[i + 3] * w;
      r += data[i] * al; gg += data[i + 1] * al; b += data[i + 2] * al; a += al;
    }
    if (a < 1) continue;
    const o = (Y * WORK + X) * 4;
    out[o] = r / a; out[o + 1] = gg / a; out[o + 2] = b / a; out[o + 3] = Math.min(255, a);
  }
  // the lot's paving: the estates' pinkish beige (housing estate plazas), its joints on the iso grid
  const cx = Ft.x, cy = Ft.y - hw / 2;
  const joints = [];
  for (let n = -60; n <= 60; n++) {
    const o = n * 26;
    joints.push(`<line x1="${cx + o - 2 * hw}" y1="${cy - hw}" x2="${cx + o + 2 * hw}" y2="${cy + hw}"/>`, `<line x1="${cx + o - 2 * hw}" y1="${cy + hw}" x2="${cx + o + 2 * hw}" y2="${cy - hw}"/>`);
  }
  const lot = [[cx - hw, cy], [cx, cy - hw / 2], [cx + hw, cy], [cx, cy + hw / 2]].map((p) => p.join(',')).join(' ');
  const pad = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WORK}" height="${WORK}"><defs><clipPath id="l"><polygon points="${lot}"/></clipPath></defs>
    <polygon points="${lot}" fill="rgb(186,165,148)"/><g clip-path="url(#l)" stroke="rgb(160,140,124)" stroke-width="1.6" opacity="0.5">${joints.join('')}</g></svg>`);
  const pavilion = await sharp(out, { raw: { width: WORK, height: WORK, channels: 4 } }).png().toBuffer();
  const work = await sharp({ create: { width: WORK, height: WORK, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: pad }, { input: pavilion }]).png().toBuffer();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await sharp(work).resize(SIZE, SIZE, { kernel: 'lanczos3' }).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(OUT);
  const lamps = LAMPS.map((lamp) => { const p = toWork(lamp.x, lamp.y); return { x: +(p.X * SIZE / WORK).toFixed(1), y: +(p.Y * SIZE / WORK).toFixed(1) }; });
  console.log(`plaza ${sideR.toFixed(1)} x ${sideL.toFixed(1)} m -> ${(sideR * FIT).toFixed(1)} x ${(sideL * FIT).toFixed(1)} m on the lot; squared x${sx.toFixed(3)}, skew ${k.toFixed(4)}`);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${SIZE}x${SIZE}, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
  console.log(`lamps: ${JSON.stringify(lamps)}`);
  if (PREVIEW) {
    const marks = lamps.map((l) => `<circle cx="${l.x}" cy="${l.y}" r="8" fill="none" stroke="#ff0" stroke-width="1.5"/>`).join('');
    await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 70, g: 72, b: 76, alpha: 1 } } })
      .composite([{ input: OUT }, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">${marks}</svg>`) }]).png().toFile(path.resolve(PREVIEW));
  }
})().catch((e) => { console.error(e); process.exit(1); });
