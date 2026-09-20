// Bake the bridge parapet (護欄) textures from the two source renders.
//
//   node scripts/bake-bridge-parapet-textures.js [--out <dir>] [--preview <png>] [--height <k>]
//
// scripts/source-art/bridgeA.png is one concrete-and-rail parapet segment drawn along the
// screen NW-SE axis (visible face SW), bridgeB.png the same segment along SW-NE (face SE).
// Both already sit on the 2:1 isometric axis and each is about one tile edge long. The bake
// cleans the dark AI fringe, finds the base line, and lays the segment on a fixed canvas with
// the base-line midpoint at one anchor (BRIDGE_PARAPET_SOURCE_ANCHOR in bridge-parapets.js),
// the way the lamp posts are.
//
// A segment is made to read as one run of parapet rather than a row of loose barriers: the
// angled end faces are cropped off wherever the run continues into the next tile, the body is
// stretched along its base to span a tile edge plus a pixel of overlap, and its height is
// squashed (--height, default 0.5: the art is ~4 m tall for its 20 m length, a Hong Kong
// parapet is ~1.3 m). Deck segments lose both end faces; a ramp segment keeps the face at the
// ramp's foot, where the run ends, and is vertically sheared so its base follows the ramp -
// the 15 px deck lift (BRIDGE_DECK_VISUAL_LIFT) over the edge's 50 px changes the base slope
// by 0.3, up at the high end. Posts stay vertical under a vertical shear. Six textures:
// parapet_h (NW-SE) with high_se / high_nw, parapet_v (SW-NE) with high_ne / high_sw.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'scripts', 'source-art');
const args = process.argv.slice(2);
const argValue = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const OUT_DIR = path.resolve(argValue('--out') || path.join(ROOT, 'Models', 'roadAssessories'));
const PREVIEW = argValue('--preview');

// Output canvas with the base-line midpoint at ANCHOR. It is a power of two on purpose:
// Phaser only builds mipmaps (render.mipmapFilter, main.js) for power-of-two textures, and
// without them a segment drawn at ~50 px from a 440 px one is point-sampled into jaggies.
// The release pipeline pads to a power of two anyway; this keeps a dev launch, which loads
// these PNGs as they are, looking the same.
const SOURCE_SCALE = 0.5;
const CANVAS_W = 512;
const CANVAS_H = 512;
const ANCHOR = { x: 256, y: 280 };
// The base spans this many canvas px: a 50 px tile edge at BRIDGE_PARAPET_SCALE ~0.114 plus
// a pixel of overlap at each end so two anti-aliased cuts never show water through a seam.
const TARGET_SPAN = 440;
const HEIGHT_SCALE = Number(argValue('--height') || 0.5);
// Samples per output pixel per axis: the body is drawn at about a third of the source's
// density, so it needs more than a bilinear tap or the bake itself aliases.
const SUPERSAMPLE = 4;
// Ramp shear: the 15 px deck lift over a 50 px edge, in canvas terms (slope change).
const RAMP_SHEAR = 15 / 50;
// Pixels this faint are the renderer's dark halo, not the parapet.
const FRINGE_ALPHA = 128;

const SOURCES = [
  {
    file: 'bridgeA.png', axis: 'h', baseSlope: 0.5,
    // Fraction of the solid span taken by the angled end face at each end (NW end left, SE right).
    caps: { left: 0.08, right: 0.07 },
    variants: [
      { name: 'parapet_h', shear: 0, keep: {} },
      { name: 'parapet_h_high_se', shear: -RAMP_SHEAR, keep: { left: true } },  // foot at NW
      { name: 'parapet_h_high_nw', shear: RAMP_SHEAR, keep: { right: true } },  // foot at SE
    ],
  },
  {
    file: 'bridgeB.png', axis: 'v', baseSlope: -0.5,
    caps: { left: 0.08, right: 0.06 },
    variants: [
      { name: 'parapet_v', shear: 0, keep: {} },
      { name: 'parapet_v_high_ne', shear: -RAMP_SHEAR, keep: { left: true } },  // foot at SW
      { name: 'parapet_v_high_sw', shear: RAMP_SHEAR, keep: { right: true } },  // foot at NE
    ],
  },
];

async function loadRaw(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function stripFringe(img) {
  const { data, width, height } = img;
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] < FRINGE_ALPHA) data[i * 4 + 3] = 0;
  }
}

// The base line: lowest solid pixel per column across the middle half of the solid columns
// (the angled end faces are left out), least-squares fitted. Returns its midpoint and slope.
function findBaseLine(img) {
  const { data, width, height } = img;
  let minX = width; let maxX = -1;
  const bottom = new Array(width).fill(-1);
  for (let x = 0; x < width; x++) {
    for (let y = height - 1; y >= 0; y--) {
      if (data[(y * width + x) * 4 + 3] < FRINGE_ALPHA) continue;
      bottom[x] = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      break;
    }
  }
  if (maxX < 0) throw new Error('no solid pixels');
  const span = maxX - minX;
  const x0 = Math.round(minX + span * 0.25);
  const x1 = Math.round(minX + span * 0.75);
  let n = 0; let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
  for (let x = x0; x <= x1; x++) {
    if (bottom[x] < 0) continue;
    n++; sx += x; sy += bottom[x]; sxx += x * x; sxy += x * bottom[x];
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  const cx = (minX + maxX) / 2;
  return { x: cx, y: slope * cx + intercept, slope, minX, maxX };
}

function sampleBilinear(img, x, y) {
  const { data, width, height } = img;
  const x0 = Math.floor(x); const y0 = Math.floor(y);
  const fx = x - x0; const fy = y - y0;
  const out = [0, 0, 0, 0];
  for (let j = 0; j <= 1; j++) {
    for (let i = 0; i <= 1; i++) {
      const px = x0 + i; const py = y0 + j;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
      const o = (py * width + px) * 4;
      const a = data[o + 3] / 255;
      out[0] += data[o] * a * w; out[1] += data[o + 1] * a * w; out[2] += data[o + 2] * a * w; out[3] += a * w;
    }
  }
  if (out[3] <= 0) return [0, 0, 0, 0];
  return [out[0] / out[3], out[1] / out[3], out[2] / out[3], out[3] * 255];
}

// Draw one variant: the source cropped to [cropL, cropR] along its base, stretched so that
// span covers TARGET_SPAN canvas px (the base keeps its 2:1 slope), squashed by HEIGHT_SCALE
// above the base line, anchored at the cropped base's midpoint and sheared about the anchor
// (y' = y + shear * (x - anchor.x)).
function renderVariant(img, base, spec, variant) {
  const span = base.maxX - base.minX;
  const cropL = base.minX + (variant.keep.left ? 0 : span * spec.caps.left);
  const cropR = base.maxX - (variant.keep.right ? 0 : span * spec.caps.right);
  const midX = (cropL + cropR) / 2;
  const baseAt = (sx) => base.y + base.slope * (sx - base.x);
  const midY = baseAt(midX);
  const stretch = TARGET_SPAN / ((cropR - cropL) * SOURCE_SCALE);
  const out = Buffer.alloc(CANVAS_W * CANVAS_H * 4);
  const n = SUPERSAMPLE;
  for (let py = 0; py < CANVAS_H; py++) {
    for (let px = 0; px < CANVAS_W; px++) {
      let rr = 0; let gg = 0; let bb = 0; let aa = 0;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const dx = px + (i + 0.5) / n - ANCHOR.x;
          const dy = py + (j + 0.5) / n - ANCHOR.y - variant.shear * dx;
          const sx = midX + dx / (SOURCE_SCALE * stretch);
          if (sx < cropL || sx > cropR) continue;
          const sy = baseAt(sx) + (dy - base.slope * dx) / (SOURCE_SCALE * HEIGHT_SCALE);
          const [r, g, b, a] = sampleBilinear(img, sx - 0.5, sy - 0.5);
          rr += r * a; gg += g * a; bb += b * a; aa += a;
        }
      }
      if (aa <= 0) continue;
      const o = (py * CANVAS_W + px) * 4;
      out[o] = Math.round(rr / aa); out[o + 1] = Math.round(gg / aa); out[o + 2] = Math.round(bb / aa);
      out[o + 3] = Math.round(aa / (n * n));
    }
  }
  return { pixels: out, stretch, midX, midY };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const previews = [];
  for (const spec of SOURCES) {
    const img = await loadRaw(path.join(SOURCE_DIR, spec.file));
    stripFringe(img);
    const base = findBaseLine(img);
    if (Math.abs(base.slope - spec.baseSlope) > 0.05) {
      throw new Error(`${spec.file}: base line slope ${base.slope.toFixed(3)}, expected ${spec.baseSlope} (2:1 isometric)`);
    }
    console.log(`${spec.file}: base midpoint (${base.x.toFixed(1)}, ${base.y.toFixed(1)}) slope ${base.slope.toFixed(3)}, `
      + `solid span ${base.maxX - base.minX} px; body -> ${TARGET_SPAN} canvas px (one 50 px tile edge at scale ${(50 / TARGET_SPAN).toFixed(4)}), height x${HEIGHT_SCALE}`);
    for (const variant of spec.variants) {
      const { pixels, stretch } = renderVariant(img, base, spec, variant);
      await sharp(pixels, { raw: { width: CANVAS_W, height: CANVAS_H, channels: 4, premultiplied: false } })
        .png({ compressionLevel: 9 })
        .toFile(path.join(OUT_DIR, `${variant.name}.png`));
      console.log(`  ${variant.name}.png (${CANVAS_W}x${CANVAS_H}, anchor ${ANCHOR.x},${ANCHOR.y}, stretch x${stretch.toFixed(2)}, shear ${variant.shear})`);
      previews.push({ name: variant.name, pixels });
    }
  }
  if (PREVIEW) {
    const scale = 0.7;
    const w = Math.round(CANVAS_W * scale); const h = Math.round(CANVAS_H * scale);
    const tiles = [];
    for (let i = 0; i < previews.length; i++) {
      const input = await sharp(previews[i].pixels, { raw: { width: CANVAS_W, height: CANVAS_H, channels: 4, premultiplied: false } })
        .resize(w, h).png().toBuffer();
      tiles.push({ input, left: (i % 3) * w, top: Math.floor(i / 3) * h });
    }
    await sharp({ create: { width: w * 3, height: h * 2, channels: 4, background: '#5a7a5a' } })
      .composite(tiles).png().toFile(PREVIEW);
    console.log(`preview: ${PREVIEW}`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
