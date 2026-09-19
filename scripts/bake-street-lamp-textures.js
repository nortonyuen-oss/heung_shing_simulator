// Bake the street lamp post textures from the 2x2 source sheet.
//
//   node scripts/bake-street-lamp-textures.js [--out <dir>] [--preview <png>]
//
// scripts/source-art/lightPost_sheet.png holds one post in four arm directions. In the
// isometric view a horizontal arm pointing towards the camera drops on screen and one pointing
// away rises, so the top row (arms sloping down and out) points SW / SE and the bottom row
// (arms rising) points NW / NE. For each direction this writes a day
// texture and a night texture: the lantern lit in the orange of Hong Kong's high-pressure
// sodium street lights, with a halo, a soft cone down to the road and a pool of light on the
// ground under the lantern. Night is baked so a lamp at night is one setTexture, not extra
// sprites (street-lamps.js). The lit variant is named __lit, not __night: the release pipeline
// reserves __night* for the building night bakes it manages itself.
//
// The post is placed on a canvas wide enough for the ground pool, so each output's foot pixel
// (the anchor, printed at the end) is found from the art, not assumed.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'scripts', 'source-art', 'lightPost_sheet.png');
const args = process.argv.slice(2);
const argValue = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const OUT_DIR = path.resolve(argValue('--out') || path.join(ROOT, 'Models', 'traffic', 'lightPost'));
const PREVIEW = argValue('--preview');

const QUADRANTS = [
  { facing: 'SW', col: 0, row: 0 },
  { facing: 'SE', col: 1, row: 0 },
  { facing: 'NW', col: 0, row: 1 },
  { facing: 'NE', col: 1, row: 1 },
];
// Output canvas: the post sits at FOOT_X/FOOT_Y with room around it for the halo and the pool.
const CANVAS_W = 960;
const CANVAS_H = 880;
const FOOT_X = 480;
const FOOT_Y = 600;

// Hong Kong's classic high-pressure sodium orange.
const SODIUM = { lens: [255, 214, 150], glow: [255, 168, 72], pool: [255, 156, 60] };

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

function opaqueBounds(data, W, H, x0 = 0, y0 = 0, x1 = W, y1 = H, threshold = 40) {
  let minX = W; let maxX = -1; let minY = H; let maxY = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (data[(y * W + x) * 4 + 3] < threshold) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { minX, maxX, minY, maxY };
}

// The foot: centre of the opaque pixels on the lowest opaque row band (the base plate).
function findFoot(data, W, H) {
  const bounds = opaqueBounds(data, W, H);
  const band = opaqueBounds(data, W, H, 0, bounds.maxY - 6, W, bounds.maxY + 1);
  return { x: (band.minX + band.maxX) / 2, y: bounds.maxY + 1, bounds };
}

// The lantern: opaque pixels in the top part of the art that sit well away from the pole.
function findLantern(data, W, H, foot) {
  const top = foot.bounds.minY;
  const height = foot.bounds.maxY - top;
  const region = opaqueBounds(data, W, H, 0, top, W, top + Math.round(height * 0.3));
  let best = null;
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 0 : Math.round(foot.x + 40);
    const x1 = side < 0 ? Math.round(foot.x - 40) : W;
    const b = opaqueBounds(data, W, H, Math.max(0, x0), region.minY, Math.min(W, x1), region.maxY + 1);
    if (!b) continue;
    const area = (b.maxX - b.minX) * (b.maxY - b.minY);
    if (!best || area > best.area) best = { ...b, area, side };
  }
  // The lantern is the outer 55% of that arm-side blob (the rest is the arm itself).
  const width = best.maxX - best.minX;
  const lanternMinX = best.side < 0 ? best.minX : best.maxX - width * 0.55;
  const lanternMaxX = best.side < 0 ? best.minX + width * 0.55 : best.maxX;
  return {
    side: best.side,
    minX: lanternMinX, maxX: lanternMaxX, minY: best.minY, maxY: best.maxY,
    cx: (lanternMinX + lanternMaxX) / 2,
    // The lens is the lower face of the lantern.
    lensX: (lanternMinX + lanternMaxX) / 2,
    lensY: best.maxY - (best.maxY - best.minY) * 0.28,
    rx: (lanternMaxX - lanternMinX) / 2,
    ry: (best.maxY - best.minY) * 0.3,
  };
}

// Premultiplied additive paint of `colour` at `alpha` into a straight-alpha RGBA buffer.
function addLight(out, i, colour, alpha) {
  if (alpha <= 0.002) return;
  const a = out[i + 3] / 255;
  const pr = out[i] * a + colour[0] * alpha;
  const pg = out[i + 1] * a + colour[1] * alpha;
  const pb = out[i + 2] * a + colour[2] * alpha;
  const na = a + alpha * (1 - a);
  out[i] = clamp255(pr / na);
  out[i + 1] = clamp255(pg / na);
  out[i + 2] = clamp255(pb / na);
  out[i + 3] = clamp255(Math.round(na * 255));
}

function paintNight(out, W, H, lantern, foot, facing) {
  // 1. Lit lens: pull the glass towards sodium white.
  for (let y = Math.floor(lantern.lensY - lantern.ry * 1.2); y <= Math.ceil(lantern.lensY + lantern.ry * 1.2); y++) {
    for (let x = Math.floor(lantern.lensX - lantern.rx * 1.05); x <= Math.ceil(lantern.lensX + lantern.rx * 1.05); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot((x - lantern.lensX) / lantern.rx, (y - lantern.lensY) / lantern.ry);
      if (d > 1) continue;
      const i = (y * W + x) * 4;
      if (out[i + 3] < 40) continue;
      const w = 0.85 * (1 - d * d * 0.5);
      out[i] = clamp255(out[i] + (SODIUM.lens[0] - out[i]) * w);
      out[i + 1] = clamp255(out[i + 1] + (SODIUM.lens[1] - out[i + 1]) * w);
      out[i + 2] = clamp255(out[i + 2] + (SODIUM.lens[2] - out[i + 2]) * w);
    }
  }
  // 2. Halo around the lantern.
  const haloR = Math.max(lantern.rx, lantern.ry) * 2.4;
  for (let y = Math.floor(lantern.lensY - haloR); y <= Math.ceil(lantern.lensY + haloR); y++) {
    for (let x = Math.floor(lantern.lensX - haloR); x <= Math.ceil(lantern.lensX + haloR); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot(x - lantern.lensX, (y - lantern.lensY) * 1.15) / haloR;
      if (d > 1) continue;
      addLight(out, (y * W + x) * 4, SODIUM.glow, 0.8 * (1 - d) ** 2.0);
    }
  }
  // 3. Cone from the lens down to the ground under the lantern, and 4. the pool there. The
  // ground under the lantern is offset from the foot along the arm: in the isometric view an
  // arm pointing away from the camera (NW/NE) reaches ground higher on screen, one pointing
  // towards it (SW/SE) lower.
  const towardsCamera = facing === 'SW' || facing === 'SE';
  const groundX = lantern.lensX;
  const groundY = foot.y + (towardsCamera ? 1 : -1) * Math.abs(lantern.lensX - foot.x) * 0.5;
  const coneTop = lantern.lensY + lantern.ry * 0.6;
  const coneHeight = groundY - coneTop;
  const topHalfWidth = lantern.rx * 0.9;
  const bottomHalfWidth = lantern.rx * 4.2;
  for (let y = Math.floor(coneTop); y <= Math.ceil(groundY); y++) {
    const t = (y - coneTop) / Math.max(1, coneHeight);
    const halfWidth = topHalfWidth + (bottomHalfWidth - topHalfWidth) * t;
    // Strong enough to read through the night darkness overlay the whole scene sits under.
    const rowAlpha = 0.42 * (1 - t) ** 1.1 + 0.06;
    for (let x = Math.floor(groundX - halfWidth); x <= Math.ceil(groundX + halfWidth); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const u = Math.abs(x - groundX) / halfWidth;
      addLight(out, (y * W + x) * 4, SODIUM.glow, rowAlpha * (1 - u * u));
    }
  }
  const poolRx = lantern.rx * 5.2;
  const poolRy = poolRx * 0.5;
  for (let y = Math.floor(groundY - poolRy); y <= Math.ceil(groundY + poolRy); y++) {
    for (let x = Math.floor(groundX - poolRx); x <= Math.ceil(groundX + poolRx); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot((x - groundX) / poolRx, (y - groundY) / poolRy);
      if (d > 1) continue;
      addLight(out, (y * W + x) * 4, SODIUM.pool, 0.6 * (1 - d) ** 1.5);
    }
  }
  return { groundX, groundY };
}

async function bake() {
  const sheet = sharp(SOURCE).ensureAlpha();
  const meta = await sheet.metadata();
  const qw = Math.floor(meta.width / 2);
  const qh = Math.floor(meta.height / 2);
  const results = [];
  for (const quadrant of QUADRANTS) {
    const { data, info } = await sharp(SOURCE).ensureAlpha()
      .extract({ left: quadrant.col * qw, top: quadrant.row * qh, width: qw, height: qh })
      .raw().toBuffer({ resolveWithObject: true });
    const foot = findFoot(data, info.width, info.height);
    // Place the post on the output canvas with its foot at FOOT_X/FOOT_Y.
    const dx = Math.round(FOOT_X - foot.x);
    const dy = Math.round(FOOT_Y - foot.y);
    const day = Buffer.alloc(CANVAS_W * CANVAS_H * 4);
    for (let y = 0; y < info.height; y++) {
      const ty = y + dy;
      if (ty < 0 || ty >= CANVAS_H) continue;
      for (let x = 0; x < info.width; x++) {
        const tx = x + dx;
        if (tx < 0 || tx >= CANVAS_W) continue;
        const si = (y * info.width + x) * 4;
        const di = (ty * CANVAS_W + tx) * 4;
        day[di] = data[si]; day[di + 1] = data[si + 1]; day[di + 2] = data[si + 2]; day[di + 3] = data[si + 3];
      }
    }
    const footOut = { x: FOOT_X, y: FOOT_Y, bounds: { minX: foot.bounds.minX + dx, maxX: foot.bounds.maxX + dx, minY: foot.bounds.minY + dy, maxY: foot.bounds.maxY + dy } };
    const lantern = findLantern(day, CANVAS_W, CANVAS_H, footOut);
    const night = Buffer.from(day);
    const ground = paintNight(night, CANVAS_W, CANVAS_H, lantern, footOut, quadrant.facing);
    const dayFile = path.join(OUT_DIR, `lightPost_${quadrant.facing}.png`);
    const nightFile = path.join(OUT_DIR, `lightPost_${quadrant.facing}__lit.png`);
    await sharp(day, { raw: { width: CANVAS_W, height: CANVAS_H, channels: 4 } }).png().toFile(dayFile);
    await sharp(night, { raw: { width: CANVAS_W, height: CANVAS_H, channels: 4 } }).png().toFile(nightFile);
    results.push({ facing: quadrant.facing, dayFile, nightFile, foot: footOut, lantern, ground, postHeight: footOut.bounds.maxY - footOut.bounds.minY });
  }
  return results;
}

async function writePreview(results, file) {
  const scale = 0.32;
  const tileW = Math.round(CANVAS_W * scale); const tileH = Math.round(CANVAS_H * scale);
  const labelH = 18;
  const width = 4 * (tileW + 8) + 8;
  const height = 2 * (tileH + labelH + 8) + 8;
  const composites = [];
  for (let i = 0; i < results.length; i++) {
    for (const [rowIndex, kind] of [[0, 'dayFile'], [1, 'nightFile']]) {
      const x = 8 + i * (tileW + 8);
      const y = 8 + rowIndex * (tileH + labelH + 8);
      composites.push({ input: await sharp(results[i][kind]).resize(tileW, tileH).png().toBuffer(), left: x, top: y + labelH });
      const label = Buffer.from(`<svg width="${tileW}" height="${labelH}"><text x="2" y="13" font-family="Menlo, monospace" font-size="12" fill="#ffd27a">${results[i].facing} ${kind === 'dayFile' ? 'day' : 'night'}</text></svg>`);
      composites.push({ input: label, left: x, top: y });
    }
  }
  const background = { r: 52, g: 58, b: 48, alpha: 1 };
  await sharp({ create: { width, height, channels: 4, background } }).composite(composites).png().toFile(file);
  // A second strip on a dark road grey, at roughly the in-game night size.
  const nightBg = { r: 38, g: 40, b: 44, alpha: 1 };
  const gameScale = 0.07 * 3; // zoom 3
  const gw = Math.round(CANVAS_W * gameScale); const gh = Math.round(CANVAS_H * gameScale);
  const strip = [];
  for (let i = 0; i < results.length; i++) {
    strip.push({ input: await sharp(results[i].nightFile).resize(gw, gh).png().toBuffer(), left: 8 + i * (gw + 8), top: 8 });
  }
  await sharp({ create: { width: 4 * (gw + 8) + 8, height: gh + 16, channels: 4, background: nightBg } })
    .composite(strip).png().toFile(file.replace(/\.png$/, '-night-zoom3.png'));
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = await bake();
  results.forEach((r) => {
    console.log(`${r.facing}: foot (${r.foot.x}, ${r.foot.y}) post height ${r.postHeight}px lantern lens (${Math.round(r.lantern.lensX)}, ${Math.round(r.lantern.lensY)}) ground (${Math.round(r.ground.groundX)}, ${Math.round(r.ground.groundY)})`);
  });
  console.log('Lantern lens from the foot (source px) - STREET_LAMP_LANTERN_ANCHORS:');
  results.forEach((r) => console.log(`  ${r.facing.toLowerCase()}: [${Math.round(r.lantern.lensX - r.foot.x)}, ${Math.round(r.lantern.lensY - r.foot.y)}],`));
  if (PREVIEW) {
    await writePreview(results, path.resolve(PREVIEW));
    console.log(`Preview: ${PREVIEW}`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
