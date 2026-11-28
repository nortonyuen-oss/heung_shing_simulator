// Bake the 中央分隔帶's double-headed T lamp (road-medians.js) from Norton's art.
//
//   node scripts/bake-median-lamp-textures.js [--out <dir>] [--preview <png>]
//
// scripts/source-art/streetLamp/original/doubleHeadLamp.png (Norton, 2026-11-28) is a post on a
// concrete footing seen corner-on, the footing in the game's isometric view but its arm sloping too
// gently (about 1:5 against the view's 1:2 - 你幫我扭扭佢添，好似角度唔一致). The arm and heads are
// twisted onto the view's axis by a vertical skew either side of the post (the post and its footing
// untouched, as art-isometric-squaring does - never perspective), giving the arm running SW-NE on
// screen ('a'); its mirror runs NW-SE ('b'). Each gets a night texture as the kerb lamps' bake does
// (scripts/bake-street-lamp-textures.js): the lenses lit sodium orange, a halo, a cone down to the
// road under each head and a pool there - both carriageways lit. Output 256x256 with the foot at
// (128, 160), as the kerb lamps (STREET_LAMP_SOURCE_ANCHOR), the post about as tall as theirs.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { finishOnPowerOfTwoCanvas } = require('./lib/pot-prop-canvas');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'scripts', 'source-art', 'streetLamp', 'original', 'doubleHeadLamp.png');
const args = process.argv.slice(2);
const argValue = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const OUT_DIR = path.resolve(argValue('--out') || path.join(ROOT, 'Models', 'traffic', 'lightPost'));
const PREVIEW = argValue('--preview');

const ISO_SLOPE = 0.5;            // TILE_HEIGHT / TILE_WIDTH (the night pools' ground)
const ARM_ROWS = 340;             // source rows above this are the arm and heads (the post below)
const PAD = { top: 220, side: 420, bottom: 420 };   // room for the raised head, the cones and pools
const OUT_SIZE = 256;
const OUT_FOOT = { x: 128, y: 160 };
const OUT_HEIGHT = 156;           // foot to the top of the higher head, output px (kerb lamps ~150)
const SODIUM = { lens: [255, 214, 140], glow: [255, 158, 48], pool: [236, 130, 38] };
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

function bounds(data, W, H, x0 = 0, y0 = 0, x1 = W, y1 = H, t = 40) {
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (data[(y * W + x) * 4 + 3] < t) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return maxX < 0 ? null : { minX, maxX, minY, maxY };
}

// the post: its columns at a row well down it
function postColumns(data, W, H) {
  const y = Math.round(H * 0.55);
  let minX = W, maxX = -1;
  for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] >= 40) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  return { minX, maxX, cx: (minX + maxX) / 2 };
}

// the two heads' centres in the arm rows: the left and right blobs beyond the post
function heads(data, W, H, post, rows) {
  const left = bounds(data, W, H, 0, 0, post.minX - 40, rows);
  const right = bounds(data, W, H, post.maxX + 40, 0, W, rows);
  const centre = (b) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, b });
  return { left: centre(left), right: centre(right) };
}

async function load() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width + PAD.side * 2, H = info.height + PAD.top + PAD.bottom;
  const src = Buffer.alloc(W * H * 4);
  for (let y = 0; y < info.height; y++) data.copy(src, ((y + PAD.top) * W + PAD.side) * 4, y * info.width * 4, (y + 1) * info.width * 4);
  return { src, W, H };
}

// The footing's own slope (Norton: 底座同T字好似唔係平行): its lower edges, from its bottom corner up
// to the side corners - the arm is twisted to run parallel to them.
function footingSlope(data, W, H, post) {
  const all = bounds(data, W, H);
  let bottomY = all.maxY;
  let widest = 0, cornerY = bottomY;
  for (let y = all.maxY; y > all.maxY - 400; y--) {
    const row = bounds(data, W, H, 0, y, W, y + 1);
    if (!row) continue;
    const width = row.maxX - row.minX;
    if (width > widest + 2) { widest = width; cornerY = y; }
  }
  return (bottomY - cornerY) / (widest / 2);
}

// The twist: a vertical skew of the arm rows either side of the post, by k a pixel out from it.
function twist(src, W, H) {
  const post = postColumns(src, W, H);
  const rows = ARM_ROWS + PAD.top;
  const h = heads(src, W, H, post, rows);
  const before = (h.right.y - h.left.y) / (h.right.x - h.left.x);   // negative: rising to the right
  const target = footingSlope(src, W, H, post);
  // the drop wanted between the heads (the footing's slope), against what the skew can add: it
  // works only outside the post's columns
  const reach = (h.right.x - post.maxX) + (post.minX - h.left.x);
  const k = (target * (h.right.x - h.left.x) + before * (h.right.x - h.left.x)) / reach;
  const off = (x) => (x > post.maxX ? -k * (x - post.maxX) : x < post.minX ? k * (post.minX - x) : 0);
  const out = Buffer.from(src);
  // clear the arm rows outside the post, then draw them moved
  for (let y = 0; y < rows; y++) for (let x = 0; x < W; x++) {
    if (x >= post.minX && x <= post.maxX) continue;
    out.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4);
  }
  for (let x = 0; x < W; x++) {
    if (x >= post.minX && x <= post.maxX) continue;
    const d = off(x);
    for (let y = 0; y < H; y++) {
      const sy = y - d;                      // the source row that lands here
      if (sy < 0 || sy >= rows - 1) continue;
      const y0 = Math.floor(sy), f = sy - y0;
      const i0 = (y0 * W + x) * 4, i1 = ((y0 + 1) * W + x) * 4, o = (y * W + x) * 4;
      const a0 = src[i0 + 3] * (1 - f), a1 = src[i1 + 3] * f, a = a0 + a1;
      if (a < 1) continue;
      for (let c = 0; c < 3; c++) out[o + c] = clamp255((src[i0 + c] * a0 + src[i1 + c] * a1) / a);
      out[o + 3] = clamp255(Math.max(out[o + 3], a));
    }
  }
  const after = heads(out, W, H, post, rows + Math.ceil(k * W));
  return { out, post, k, before, target, after: (after.right.y - after.left.y) / (after.right.x - after.left.x) };
}

function mirror(buf, W, H) {
  const out = Buffer.alloc(buf.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) buf.copy(out, (y * W + (W - 1 - x)) * 4, (y * W + x) * 4, (y * W + x) * 4 + 4);
  return out;
}

function addLight(out, i, colour, alpha) {
  if (alpha <= 0.002) return;
  const a = out[i + 3] / 255;
  const na = a + alpha * (1 - a);
  for (let c = 0; c < 3; c++) out[i + c] = clamp255((out[i + c] * a + colour[c] * alpha) / na);
  out[i + 3] = clamp255(Math.round(na * 255));
}

// Night: each head's lens lit, a halo, a cone to the road under it and a pool there. The road under
// a head is along the arm on the ground: as far across as the head is, at the view's slope from the
// foot (the arm rises to the right in 'a': the ground under its right head is higher on screen).
function paintNight(buf, W, H, foot, post, slopeSign) {
  const out = Buffer.from(buf);
  const top = bounds(buf, W, H).minY;
  const armRows = Math.round(top + (foot.y - top) * 0.32);
  const blobs = [bounds(buf, W, H, 0, 0, post.minX - 40, armRows), bounds(buf, W, H, post.maxX + 40, 0, W, armRows)].filter(Boolean);
  blobs.forEach((b) => {
    const rx = (b.maxX - b.minX) * 0.32, ry = (b.maxY - b.minY) * 0.22;
    const lensX = (b.minX + b.maxX) / 2, lensY = b.maxY - (b.maxY - b.minY) * 0.3;
    for (let y = Math.floor(lensY - ry * 1.3); y <= lensY + ry * 1.3; y++) for (let x = Math.floor(lensX - rx * 1.2); x <= lensX + rx * 1.2; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot((x - lensX) / (rx * 1.2), (y - lensY) / (ry * 1.3));
      const i = (y * W + x) * 4;
      if (d > 1 || out[i + 3] < 40) continue;
      const w = 0.9 * (1 - d * d * 0.4);
      for (let c = 0; c < 3; c++) out[i + c] = clamp255(out[i + c] + (SODIUM.lens[c] - out[i + c]) * w);
    }
    const haloR = Math.max(rx, ry) * 2.6;
    for (let y = Math.floor(lensY - haloR); y <= lensY + haloR; y++) for (let x = Math.floor(lensX - haloR); x <= lensX + haloR; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot(x - lensX, (y - lensY) * 1.15) / haloR;
      if (d <= 1) addLight(out, (y * W + x) * 4, SODIUM.glow, 0.8 * (1 - d) ** 2.2);
    }
    const groundX = lensX;
    const groundY = foot.y + slopeSign * ISO_SLOPE * (lensX - foot.x);
    const coneTop = lensY + ry * 0.6;
    const coneH = groundY - coneTop;
    for (let y = Math.floor(coneTop); y <= groundY; y++) {
      const t = (y - coneTop) / Math.max(1, coneH);
      const half = rx * 0.9 + (rx * 3.6 - rx * 0.9) * t;
      const rowAlpha = 0.4 * (1 - t) ** 1.1 + 0.05;
      for (let x = Math.floor(groundX - half); x <= groundX + half; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const u = Math.abs(x - groundX) / half;
        addLight(out, (y * W + x) * 4, SODIUM.glow, rowAlpha * (1 - u * u));
      }
    }
    const poolRx = rx * 4.6, poolRy = poolRx * 0.5;
    for (let y = Math.floor(groundY - poolRy); y <= groundY + poolRy; y++) for (let x = Math.floor(groundX - poolRx); x <= groundX + poolRx; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot((x - groundX) / poolRx, (y - groundY) / poolRy);
      if (d <= 1) addLight(out, (y * W + x) * 4, SODIUM.pool, 0.55 * (1 - d) ** 1.5);
    }
  });
  return out;
}

async function write(buf, W, H, foot, scale, file) {
  const canvas = await finishOnPowerOfTwoCanvas(buf, W, H, { scale, size: OUT_SIZE, sourceAnchor: foot, anchor: OUT_FOOT });
  await sharp(canvas, { raw: { width: OUT_SIZE, height: OUT_SIZE, channels: 4, premultiplied: false } }).png({ compressionLevel: 9 }).toFile(file);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { src, W, H } = await load();
  const twisted = twist(src, W, H);
  const { k, before, target, after } = twisted;
  // and an x scale so the footing and the arm both run at the view's slope (art-isometric-squaring)
  const sx = target / ISO_SLOPE;
  const W2 = Math.round(W * sx);
  const a = await sharp(twisted.out, { raw: { width: W, height: H, channels: 4 } }).resize(W2, H, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
  const post = { minX: Math.round(twisted.post.minX * sx), maxX: Math.round(twisted.post.maxX * sx), cx: Math.round(twisted.post.cx * sx) };
  const all = bounds(a, W2, H);
  const foot = { x: post.cx, y: all.maxY + 1 };
  const scale = OUT_HEIGHT / (foot.y - all.minY);
  const b = mirror(a, W2, H);
  const footB = { x: W2 - 1 - foot.x, y: foot.y };
  const postB = { minX: W2 - 1 - post.maxX, maxX: W2 - 1 - post.minX, cx: W2 - 1 - post.cx };
  const files = [];
  for (const [variant, buf, f, p, slopeSign] of [['A', a, foot, post, -1], ['B', b, footB, postB, 1]]) {
    const day = path.join(OUT_DIR, `lightPost_T_${variant}.png`);
    const night = path.join(OUT_DIR, `lightPost_T_${variant}__lit.png`);
    await write(buf, W2, H, f, scale, day);
    await write(paintNight(buf, W2, H, f, p, slopeSign), W2, H, f, scale, night);
    files.push(day, night);
  }
  console.log(`arm slope ${before.toFixed(3)} -> ${after.toFixed(3)} (footing ${target.toFixed(3)}, skew ${k.toFixed(3)}), x ${sx.toFixed(3)}: both ${ISO_SLOPE}; scale ${scale.toFixed(4)}; foot (${foot.x.toFixed(0)}, ${foot.y})`);
  files.forEach((f) => console.log(`  ${path.relative(ROOT, f)}`));
  if (PREVIEW) {
    const tiles = await Promise.all(files.map((f) => sharp(f).resize(384, 384).png().toBuffer()));
    await sharp({ create: { width: 4 * 392 + 8, height: 400, channels: 4, background: { r: 46, g: 50, b: 54, alpha: 1 } } })
      .composite(tiles.map((input, i) => ({ input, left: 8 + i * 392, top: 8 }))).png().toFile(path.resolve(PREVIEW));
    console.log(`Preview: ${PREVIEW}`);
  }
})().catch((error) => { console.error(error); process.exit(1); });
