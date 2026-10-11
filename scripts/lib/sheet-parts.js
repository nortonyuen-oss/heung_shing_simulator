// Cutting objects out of art sheets: shared by the typhoon shelter and festival bakes.
//
// A sheet holds props on a transparent background; neighbouring props can overlap each other's
// crop rectangles, so a part is the solid (alpha >= SOLID_ALPHA) 8-connected components that lie
// inside its rectangle, plus their faint antialiased rim.
const sharp = require('sharp');

const SOLID_ALPHA = 30;

const nextPow2 = (v) => 2 ** Math.ceil(Math.log2(Math.max(1, v)));

async function loadRaw(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// 8-connected components of the solid pixels: Int32Array of labels plus each label's bounds.
function labelComponents(img) {
  const { data, width: W, height: H } = img;
  const labels = new Int32Array(W * H);
  const bounds = [null];
  const stack = new Int32Array(W * H);
  let next = 0;
  for (let start = 0; start < W * H; start++) {
    if (labels[start] || data[start * 4 + 3] < SOLID_ALPHA) continue;
    next += 1;
    const b = { minX: W, minY: H, maxX: -1, maxY: -1 };
    let top = 0;
    stack[top++] = start;
    labels[start] = next;
    while (top) {
      const i = stack[--top];
      const x = i % W;
      const y = (i - x) / W;
      if (x < b.minX) b.minX = x;
      if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y;
      if (y > b.maxY) b.maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const j = yy * W + xx;
          if (labels[j] || data[j * 4 + 3] < SOLID_ALPHA) continue;
          labels[j] = next;
          stack[top++] = j;
        }
      }
    }
    bounds.push(b);
  }
  return { labels, bounds };
}

// The part's own pixels: every component that lies inside its rectangle, plus the faint
// antialiased rim (alpha below SOLID_ALPHA) within 2 px of them.
function cutPart(img, comps, rect) {
  const { data, width: W } = img;
  const [rx, ry, rw, rh] = rect;
  const tol = 4;
  const keep = new Set();
  comps.bounds.forEach((b, label) => {
    if (b && b.minX >= rx - tol && b.minY >= ry - tol && b.maxX <= rx + rw + tol && b.maxY <= ry + rh + tol) keep.add(label);
  });
  if (!keep.size) throw new Error(`no object inside rect ${rect.join(',')}`);
  const x0 = Math.max(0, rx - tol);
  const y0 = Math.max(0, ry - tol);
  const x1 = Math.min(W - 1, rx + rw + tol);
  const y1 = Math.min(img.height - 1, ry + rh + tol);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const solid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (keep.has(comps.labels[(y + y0) * W + x + x0])) solid[y * w + x] = 1;
    }
  }
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let near = solid[y * w + x];
      for (let dy = -2; dy <= 2 && !near; dy++) {
        for (let dx = -2; dx <= 2 && !near; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < h && xx >= 0 && xx < w && solid[yy * w + xx]) near = 1;
        }
      }
      if (!near) continue;
      const s = ((y + y0) * W + x + x0) * 4;
      // a faint rim pixel next to the object, but itself part of another component, is not ours
      const label = comps.labels[(y + y0) * W + x + x0];
      if (label && !keep.has(label)) continue;
      data.copy(out, (y * w + x) * 4, s, s + 4);
    }
  }
  return { data: out, width: w, height: h };
}

function solidBounds(data, W, H) {
  let minX = W; let maxX = -1; let minY = H; let maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] < SOLID_ALPHA) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, maxX, minY, maxY };
}

function mirrorRGBA(data, W, H) {
  const out = Buffer.alloc(data.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) data.copy(out, (y * W + (W - 1 - x)) * 4, (y * W + x) * 4, (y * W + x) * 4 + 4);
  }
  return out;
}

module.exports = { SOLID_ALPHA, nextPow2, loadRaw, labelComponents, cutPart, solidBounds, mirrorRGBA };
