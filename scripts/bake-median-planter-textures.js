// Bake the 中央分隔帶's palm planters (road-medians.js) from Norton's art.
//
//   node scripts/bake-median-planter-textures.js [--preview <png>]
//
// scripts/source-art/roadMedian/original/medianPlanters.png (Norton, 2026-11-28: 畀埋綠化帶你轉) holds
// six kerbed planters of shrubs, red flowers and palms. Their short sides are at the game's isometric
// slope but their long sides lie flatter (about 1:2.8 against 1:2), so each is squared the way the
// buildings' art is (art-isometric-squaring): a vertical skew and an x scale fitted to its two edges
// (palms stay upright - never perspective). Each is then scaled so a palm stands about 12 m (the
// kerb lamps' 10 m posts are ~30 px at zoom 1: STREET_LAMP_SCALE) and laid on a power-of-two canvas.
// Writes Models/roadAssessories/medianPlanter_<piece>_A|B.png and road-median-art.js: each piece's
// canvas, its anchor (the middle of its near end, on the ground) and its length and width in tiles,
// for road-medians.js to lay along a reservation (the near end's nose first, the island last).
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'scripts', 'source-art', 'roadMedian', 'original', 'medianPlanters.png');
const OUT_DIR = path.join(ROOT, 'Models', 'roadAssessories');
const ART_JS = path.join(ROOT, 'road-median-art.js');
const args = process.argv.slice(2);
const PREVIEW = (() => { const i = args.indexOf('--preview'); return i >= 0 ? args[i + 1] : null; })();

const ISO = 0.5;
const GAME_PX_PER_SOURCE = 0.088;   // a palm ~36 px (12 m) at zoom 1
const RES = 3;                      // texture px a game px: sharp up to zoom 3
const TILE_X = 50;                  // TILE_WIDTH / 2: screen x a tile along either axis
// the pieces on the sheet (their boxes), named by use
const PIECES = [
  { name: 'double', box: [404, 43, 800, 466] },
  { name: 'triple', box: [904, 18, 1464, 478] },
  { name: 'quad', box: [360, 473, 1173, 1001] },
  { name: 'island', box: [1227, 498, 1516, 919] },
  { name: 'nose', box: [26, 535, 363, 959] },
];

const pot = (n) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

function envelope(data, W, H) {
  const env = new Array(W).fill(-1);
  for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) if (data[(y * W + x) * 4 + 3] > 60) { env[x] = y; break; }
  return env;
}

// The planter's ground outline from its lower edge: the front corner (lowest), and the left and right
// corners where the edge runs out going each way from it (a palm frond beyond is not the kerb).
function footprint(data, W, H) {
  const env = envelope(data, W, H);
  let fx = 0;
  env.forEach((y, x) => { if (y > env[fx]) fx = x; });
  const walk = (step) => {
    let x = fx;
    while (x + step >= 0 && x + step < W && env[x + step] >= 0 && Math.abs(env[x + step] - env[x]) <= 3) x += step;
    return { x, y: env[x] };
  };
  return { F: { x: fx, y: env[fx] }, L: walk(-1), R: walk(1), env };
}

function slopeFit(env, x0, x1) {
  const xs = [], ys = [];
  for (let x = Math.round(x0); x <= Math.round(x1); x++) if (env[x] >= 0) { xs.push(x); ys.push(env[x]); }
  const n = xs.length; const mx = xs.reduce((a, b) => a + b, 0) / n; const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return num / den;
}

// y' = y + k (x - px); x' = px + sx (x - px), sampled back (bilinear) into a canvas with room.
function square(data, W, H, px, k, sx) {
  const margin = Math.ceil(Math.abs(k) * W) + 4;
  const OW = Math.ceil(W * sx) + 8, OH = H + margin * 2;
  const out = Buffer.alloc(OW * OH * 4);
  const ox = px * sx + 4 - px * sx;   // x' origin: px maps to px * sx + 4
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    const sxp = px + (x - 4 - px * sx) / sx;
    const syp = (y - margin) - k * (sxp - px);
    if (sxp < 0 || syp < 0 || sxp >= W - 1 || syp >= H - 1) continue;
    const x0 = Math.floor(sxp), y0 = Math.floor(syp), fx = sxp - x0, fy = syp - y0;
    let r = 0, g = 0, b = 0, a = 0;
    [[x0, y0, (1 - fx) * (1 - fy)], [x0 + 1, y0, fx * (1 - fy)], [x0, y0 + 1, (1 - fx) * fy], [x0 + 1, y0 + 1, fx * fy]].forEach(([xx, yy, w]) => {
      const i = (yy * W + xx) * 4, al = data[i + 3] * w;
      r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al;
    });
    if (a < 0.5) continue;
    const o = (y * OW + x) * 4;
    out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; out[o + 3] = Math.min(255, a);
  }
  void ox;
  return { data: out, W: OW, H: OH };
}

function trim(data, W, H) {
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 8) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) data.copy(out, y * w * 4, ((y + minY) * W + minX) * 4, ((y + minY) * W + maxX + 1) * 4);
  return { data: out, W: w, H: h, minX, minY };
}

// After squaring, along the planter's long side: b = y + ISO x is the same down a line parallel to it,
// largest on its front kerb. The planter (not the palms over it) is what lies within its width of the
// front: from it, the near and far ends along, and the line down its middle.
function planterSpan(data, W, H, width) {
  let bmax = -Infinity;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 60) bmax = Math.max(bmax, y + ISO * x);
  let a0 = W, a1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] <= 60) continue;
    const b = y + ISO * x;
    if (b < bmax - width - 2) continue;
    a0 = Math.min(a0, x); a1 = Math.max(a1, x);
  }
  // the near end's middle: on the middle line (b = bmax - width / 2), the planter's start plus half its
  // width (its short side runs across at the view's other slope)
  const bc = bmax - width / 2;
  const nearX = a0 + width / 2, farX = a1 - width / 2;
  return { near: { x: nearX, y: bc - ISO * nearX }, length: farX - nearX, a0, a1 };
}

(async () => {
  const { data: sheet, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const results = {};
  let width = null;   // the planters' width (x across the short side), from the first square-cornered one
  for (const piece of PIECES) {
    const [x0, y0, x1, y1] = piece.box;
    const W = x1 - x0, H = y1 - y0;
    const crop = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) sheet.copy(crop, y * W * 4, ((y + y0) * info.width + x0) * 4, ((y + y0) * info.width + x1) * 4);
    const before = footprint(crop, W, H);
    const sShort = slopeFit(before.env, before.L.x + (before.F.x - before.L.x) * 0.25, before.F.x - (before.F.x - before.L.x) * 0.25);
    const sLong = slopeFit(before.env, before.F.x + (before.R.x - before.F.x) * 0.2, before.R.x - (before.R.x - before.F.x) * 0.2);
    // (s + k) / sx = +ISO on the short side, -ISO on the long one
    const k = -(sShort + sLong) / 2;
    const sx = (sShort - sLong) / (2 * ISO);
    const sq = square(crop, W, H, before.F.x, k, sx);
    const t = trim(sq.data, sq.W, sq.H);
    const fp = footprint(t.data, t.W, t.H);
    if (width === null) width = fp.F.x - fp.L.x;
    const span = planterSpan(t.data, t.W, t.H, width);
    // to game px x RES, on a power-of-two canvas, its content bottom-centred
    const scale = GAME_PX_PER_SOURCE * RES;
    const w = Math.max(1, Math.round(t.W * scale)), h = Math.max(1, Math.round(t.H * scale));
    const resized = await sharp(t.data, { raw: { width: t.W, height: t.H, channels: 4 } }).resize(w, h, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
    const CW = pot(w + 4), CH = pot(h + 4);
    const left = Math.floor((CW - w) / 2), top = CH - h - 2;
    const canvas = Buffer.alloc(CW * CH * 4);
    for (let y = 0; y < h; y++) resized.copy(canvas, ((y + top) * CW + left) * 4, y * w * 4, (y + 1) * w * 4);
    // A runs SW-NE on screen (its near end lower left); B, the mirror, NW-SE (near end lower right)
    const fileA = path.join(OUT_DIR, `medianPlanter_${piece.name}_A.png`);
    const fileB = path.join(OUT_DIR, `medianPlanter_${piece.name}_B.png`);
    await sharp(canvas, { raw: { width: CW, height: CH, channels: 4 } }).png({ compressionLevel: 9 }).toFile(fileA);
    await sharp(canvas, { raw: { width: CW, height: CH, channels: 4 } }).flop().png({ compressionLevel: 9 }).toFile(fileB);
    const S = span.near;
    results[piece.name] = {
      files: { A: `Models/roadAssessories/medianPlanter_${piece.name}_A.png`, B: `Models/roadAssessories/medianPlanter_${piece.name}_B.png` },
      canvas: { width: CW, height: CH },
      anchor: { x: +(left + S.x * scale).toFixed(1), y: +(top + S.y * scale).toFixed(1) },
      lengthTiles: +(span.length * GAME_PX_PER_SOURCE / TILE_X).toFixed(3),
      widthTiles: +(width * GAME_PX_PER_SOURCE / TILE_X).toFixed(3),
      res: RES,
    };
    console.log(`${piece.name}: edges ${sShort.toFixed(3)} / ${sLong.toFixed(3)} -> skew ${k.toFixed(3)}, x ${sx.toFixed(3)}; ${CW}x${CH}; ${results[piece.name].lengthTiles} x ${results[piece.name].widthTiles} tiles`);
  }
  const js = `// Generated by scripts/bake-median-planter-textures.js from Norton's planter art - do not edit.
// Each piece: its files (A runs SW-NE on screen, B is its mirror) and canvas, the anchor in A (the middle
// of its near end on the ground, canvas px; in B at canvas width - x), its length and width in tiles and
// its texture px a game px (road-medians.js).
const ROAD_MEDIAN_PLANTERS = Object.freeze(${JSON.stringify(results, null, 2)});

if (typeof module !== 'undefined' && module.exports) module.exports = { ROAD_MEDIAN_PLANTERS };
`;
  fs.writeFileSync(ART_JS, js);
  console.log(`wrote ${path.relative(ROOT, ART_JS)}`);
  if (PREVIEW) {
    const tiles = await Promise.all(Object.values(results).flatMap((r) => [r.files.A, r.files.B]).map((f) => sharp(path.join(ROOT, f)).png().toBuffer()));
    const metas = await Promise.all(tiles.map((b) => sharp(b).metadata()));
    let x = 8; const comps = [];
    tiles.forEach((input, i) => { comps.push({ input, left: x, top: 8 }); x += metas[i].width + 8; });
    await sharp({ create: { width: x, height: Math.max(...metas.map((m) => m.height)) + 16, channels: 4, background: { r: 70, g: 72, b: 76, alpha: 1 } } }).composite(comps).png().toFile(path.resolve(PREVIEW));
  }
})().catch((e) => { console.error(e); process.exit(1); });
