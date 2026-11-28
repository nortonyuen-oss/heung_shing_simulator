// Bake the 中央分隔帶's planters (road-medians.js) from Norton's art.
//
//   node scripts/bake-median-planter-textures.js [--preview <png>]
//
// Two sheets in scripts/source-art/roadMedian/original/ (Norton, 2026-11-28):
//   medianPlanters.png (畀埋綠化帶你轉) - six kerbed planters of shrubs, red flowers and palms: the
//     'palms' set, scaled so a palm stands about 12 m (the kerb lamps' 10 m posts are ~30 px at zoom 1)
//   medianFlowerbeds.png (畀多款綠化帶你做基礎) - seven kerbed beds of hedge and flowers, five
//     square-ended lengths and an oval (the curved one is left out: a reservation here is straight):
//     the 'flowers' set, each scaled to the palms' planters' width (their sheet draws them at
//     different sizes and slopes)
// Their sides do not lie at the game's isometric slopes, so each is squared the way the buildings'
// art is (art-isometric-squaring): a vertical skew and an x scale fitted to its two edges (plants stay
// upright - never perspective), then laid on a power-of-two canvas.
// Writes Models/roadAssessories/<prefix>_<piece>_A|B.png and road-median-art.js: each set's pieces, with
// their canvas, anchor (the middle of the near end, on the ground) and length and width in tiles, for
// road-medians.js to lay along a reservation.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'scripts', 'source-art', 'roadMedian', 'original');
const OUT_DIR = path.join(ROOT, 'Models', 'roadAssessories');
const ART_JS = path.join(ROOT, 'road-median-art.js');
const args = process.argv.slice(2);
const PREVIEW = (() => { const i = args.indexOf('--preview'); return i >= 0 ? args[i + 1] : null; })();

const ISO = 0.5;
const RES = 3;                      // texture px a game px: sharp up to zoom 3
const TILE_X = 50;                  // TILE_WIDTH / 2: screen x a tile along either axis
// The sets: their sheet, file prefix, and pieces (their boxes on the sheet), named by use. A set is
// scaled by `gamePxPerSource`, or each piece to `widthTiles` across. A rounded piece's ends give no
// straight short side: `like` names the piece whose short side's slope and scale it takes.
const SETS = [
  {
    name: 'palms', sheet: 'medianPlanters.png', prefix: 'medianPlanter',
    gamePxPerSource: 0.088,           // a palm ~36 px (12 m) at zoom 1
    pieces: [
      { name: 'double', box: [404, 43, 800, 466] },
      { name: 'triple', box: [904, 18, 1464, 478] },
      { name: 'quad', box: [360, 473, 1173, 1001] },
      { name: 'island', box: [1227, 498, 1516, 919] },
      { name: 'nose', box: [26, 535, 363, 959] },
    ],
  },
  {
    name: 'flowers', sheet: 'medianFlowerbeds.png', prefix: 'medianFlowerbed',
    widthTiles: 0.16,
    isolate: true,                    // its pieces' boxes overlap: each takes only its own blot
    pieces: [
      { name: 'short', box: [76, 98, 330, 269] },
      { name: 'medium', box: [414, 75, 776, 278] },
      { name: 'long', box: [849, 51, 1412, 299] },
      { name: 'longer', box: [422, 333, 1132, 722] },
      { name: 'longest', box: [36, 680, 1422, 1050] },
      { name: 'oval', box: [1060, 423, 1412, 658], like: 'medium' },
    ],
  },
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

// The piece in a box: all of it, or (isolate) the sheet's biggest blot within it and the specks
// about it, a neighbour's edge in the box left out.
function cropPiece(sheet, info, box, isolate) {
  const [x0, y0, x1, y1] = box;
  const W = x1 - x0, H = y1 - y0;
  if (!isolate) {
    const crop = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) sheet.copy(crop, y * W * 4, ((y + y0) * info.width + x0) * 4, ((y + y0) * info.width + x1) * 4);
    return { data: crop, W, H };
  }
  const label = new Int32Array(W * H);
  const sizes = [0];
  for (let i = 0; i < W * H; i++) {
    if (label[i]) continue;
    const sx0 = i % W, sy0 = (i - sx0) / W;
    if (sheet[((sy0 + y0) * info.width + sx0 + x0) * 4 + 3] <= 8) continue;
    const id = sizes.length; let n = 0;
    const stack = [i]; label[i] = id;
    while (stack.length) {
      const j = stack.pop(); n++;
      const jx = j % W, jy = (j - jx) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = jx + dx, yy = jy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const k = yy * W + xx;
        if (label[k] || sheet[((yy + y0) * info.width + xx + x0) * 4 + 3] <= 8) continue;
        label[k] = id; stack.push(k);
      }
    }
    sizes.push(n);
  }
  let main = 1;
  sizes.forEach((n, id) => { if (n > sizes[main]) main = id; });
  // the main blot's bounds, a few px out: a speck beyond them is a neighbour's
  let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (label[y * W + x] === main) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
  const near = (x, y) => x >= bx0 - 6 && x <= bx1 + 6 && y >= by0 - 6 && y <= by1 + 6;
  const crop = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = label[y * W + x];
    if (!id || (id !== main && (sizes[id] > 400 || !near(x, y)))) continue;
    sheet.copy(crop, (y * W + x) * 4, ((y + y0) * info.width + x + x0) * 4, ((y + y0) * info.width + x + x0) * 4 + 4);
  }
  return { data: crop, W, H };
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
  const sets = {};
  const previews = [];
  for (const set of SETS) {
    const { data: sheet, info } = await sharp(path.join(SOURCE_DIR, set.sheet)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const results = {};
    const fitted = {};
    let setWidth = null;   // the palms' width (x across the short side), from their first square-cornered one
    for (const piece of set.pieces) {
      const crop = cropPiece(sheet, info, piece.box, set.isolate);
      const before = footprint(crop.data, crop.W, crop.H);
      const sLong = slopeFit(before.env, before.F.x + (before.R.x - before.F.x) * 0.2, before.R.x - (before.R.x - before.F.x) * 0.2);
      const sShort = piece.like ? fitted[piece.like].sShort
        : slopeFit(before.env, before.L.x + (before.F.x - before.L.x) * 0.25, before.F.x - (before.F.x - before.L.x) * 0.25);
      // (s + k) / sx = +ISO on the short side, -ISO on the long one
      const k = -(sShort + sLong) / 2;
      const sx = (sShort - sLong) / (2 * ISO);
      const sq = square(crop.data, crop.W, crop.H, before.F.x, k, sx);
      const t = trim(sq.data, sq.W, sq.H);
      const fp = footprint(t.data, t.W, t.H);
      const ownWidth = piece.like ? fitted[piece.like].width * sx / fitted[piece.like].sx : fp.F.x - fp.L.x;
      if (setWidth === null) setWidth = ownWidth;
      const width = set.widthTiles ? ownWidth : setWidth;
      const gamePxPerSource = set.widthTiles ? (set.widthTiles * TILE_X) / width : set.gamePxPerSource;
      fitted[piece.name] = { sShort, sx, width: ownWidth };
      const span = planterSpan(t.data, t.W, t.H, width);
      // to game px x RES, on a power-of-two canvas, its content bottom-centred
      const scale = gamePxPerSource * RES;
      const w = Math.max(1, Math.round(t.W * scale)), h = Math.max(1, Math.round(t.H * scale));
      const resized = await sharp(t.data, { raw: { width: t.W, height: t.H, channels: 4 } }).resize(w, h, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
      const CW = pot(w + 4), CH = pot(h + 4);
      const left = Math.floor((CW - w) / 2), top = CH - h - 2;
      const canvas = Buffer.alloc(CW * CH * 4);
      for (let y = 0; y < h; y++) resized.copy(canvas, ((y + top) * CW + left) * 4, y * w * 4, (y + 1) * w * 4);
      // A runs SW-NE on screen (its near end lower left); B, the mirror, NW-SE (near end lower right)
      const rel = (v) => `Models/roadAssessories/${set.prefix}_${piece.name}_${v}.png`;
      await sharp(canvas, { raw: { width: CW, height: CH, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(ROOT, rel('A')));
      await sharp(canvas, { raw: { width: CW, height: CH, channels: 4 } }).flop().png({ compressionLevel: 9 }).toFile(path.join(ROOT, rel('B')));
      const S = span.near;
      results[piece.name] = {
        files: { A: rel('A'), B: rel('B') },
        canvas: { width: CW, height: CH },
        anchor: { x: +(left + S.x * scale).toFixed(1), y: +(top + S.y * scale).toFixed(1) },
        lengthTiles: +(span.length * gamePxPerSource / TILE_X).toFixed(3),
        widthTiles: +(width * gamePxPerSource / TILE_X).toFixed(3),
        res: RES,
      };
      previews.push(rel('A'), rel('B'));
      console.log(`${set.name}/${piece.name}: edges ${sShort.toFixed(3)} / ${sLong.toFixed(3)} -> skew ${k.toFixed(3)}, x ${sx.toFixed(3)}, ${gamePxPerSource.toFixed(4)} game px a px; ${CW}x${CH}; ${results[piece.name].lengthTiles} x ${results[piece.name].widthTiles} tiles`);
    }
    sets[set.name] = results;
  }
  const js = `// Generated by scripts/bake-median-planter-textures.js from Norton's planter art - do not edit.
// Each set's pieces: their files (A runs SW-NE on screen, B is its mirror) and canvas, the anchor in A
// (the middle of its near end on the ground, canvas px; in B at canvas width - x), their length and
// width in tiles and their texture px a game px (road-medians.js).
const ROAD_MEDIAN_PLANTERS = Object.freeze(${JSON.stringify(sets, null, 2)});

if (typeof module !== 'undefined' && module.exports) module.exports = { ROAD_MEDIAN_PLANTERS };
`;
  fs.writeFileSync(ART_JS, js);
  console.log(`wrote ${path.relative(ROOT, ART_JS)}`);
  if (PREVIEW) {
    const tiles = await Promise.all(previews.map((f) => sharp(path.join(ROOT, f)).png().toBuffer()));
    const metas = await Promise.all(tiles.map((b) => sharp(b).metadata()));
    const rowWidth = 1600;
    let x = 8, y = 8, rowH = 0; const comps = [];
    tiles.forEach((input, i) => {
      if (x + metas[i].width > rowWidth) { x = 8; y += rowH + 8; rowH = 0; }
      comps.push({ input, left: x, top: y }); x += metas[i].width + 8; rowH = Math.max(rowH, metas[i].height);
    });
    await sharp({ create: { width: rowWidth, height: y + rowH + 8, channels: 4, background: { r: 70, g: 72, b: 76, alpha: 1 } } }).composite(comps).png().toFile(path.resolve(PREVIEW));
  }
})().catch((e) => { console.error(e); process.exit(1); });
