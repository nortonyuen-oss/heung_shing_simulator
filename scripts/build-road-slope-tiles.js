// Build the four hill-slope road tiles of the newRoadTiles set from its straight tiles.
//
//   node scripts/build-road-slope-tiles.js [--out <dir>] [--preview <png>]
//
// The shipped roadHill{N,E,S,W}_fixed.png were re-rendered from 100x80 sources whose road
// surface climbs ~15 px across the tile, but the engine raises terrain by HEIGHT_STEP_PIXELS
// (13 px) per level. Every slope tile therefore ended ~2 px above the tile that continues it,
// and its lane markings and kerbs sat a pixel or two off those of the straight tiles, so a
// climbing road showed a jog and a stray pavement end-cap at every seam.
//
// This projects the straight tile's surface onto a plane that rises exactly 13 px from the low
// edge to the high edge, then adds the retaining walls under the raised edges and keeps the
// straight tile's own earth base, so the profile at each seam is the straight tile's profile.
//
// Tile canvas: 160x80 with the 100x50 ground diamond at x 30..130, y 15..65 (N vertex at
// (80,15)) and a 15 px earth base below it. Tile-local coordinates (c, r) in [-0.5, 0.5] run
// along screen SE (map east) and screen SW (map south): x = 80 + (c - r) * 50,
// y = 40 + (c + r) * 25 - z.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const argValue = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const TILE_DIR = path.join(ROOT, 'newRoadTiles');
const OUT_DIR = path.resolve(argValue('--out') || TILE_DIR);
const PREVIEW = argValue('--preview');

const CANVAS_W = 160;
const CANVAS_H = 80;
const CENTER_X = 80;
const CENTER_Y = 40;      // ground diamond centre
const HALF_W = 50;
const HALF_H = 25;
const BASE_HEIGHT = 15;   // earth base below the ground diamond
const RISE = 13;          // HEIGHT_STEP_PIXELS
const SUPERSAMPLE = 3;
const EDGE_INSET = 0.03;  // tile units (~1.5 px) kept clear of the straight tile's feathered edge
const EDGE_OVERLAP = 0.02; // tile units (1 px) the surface overruns the low and high edges

// Which ground-diamond edge each slope tile raises, which straight tile carries its road, and
// the wall shades the shipped art used for the faces under the raised edges (SE face / SW face).
const SLOPES = [
  { file: 'roadHillN_fixed.png', high: 'SE', straight: 'roadNS_fixed.png', wallSE: 81,  wallSW: 159 },
  { file: 'roadHillE_fixed.png', high: 'SW', straight: 'roadEW_fixed.png', wallSE: 147, wallSW: 90 },
  { file: 'roadHillS_fixed.png', high: 'NW', straight: 'roadNS_fixed.png', wallSE: 147, wallSW: 159 },
  { file: 'roadHillW_fixed.png', high: 'NE', straight: 'roadEW_fixed.png', wallSE: 147, wallSW: 159 },
];

// Height of the slope plane at tile-local (c, r).
function riseAt(high, c, r) {
  switch (high) {
    case 'SE': return RISE * (c + 0.5);
    case 'NW': return RISE * (0.5 - c);
    case 'SW': return RISE * (r + 0.5);
    case 'NE': return RISE * (0.5 - r);
    default: throw new Error(`unknown high edge ${high}`);
  }
}

// Tile-local (c, r) of the slope-plane point drawn at screen (x, y). The plane is linear, so
// this is a 2x2 solve: x fixes c - r, and y = 40 + (c + r) * 25 - rise(c, r).
function slopePointAt(high, x, y) {
  const diff = (x - CENTER_X) / HALF_W;               // c - r
  const yFlat = y - CENTER_Y;
  let sum;                                           // c + r
  switch (high) {
    case 'SE': sum = (yFlat + RISE * (diff / 2 + 0.5)) / (HALF_H - RISE / 2); break;
    case 'NW': sum = (yFlat + RISE * (0.5 - diff / 2)) / (HALF_H + RISE / 2); break;
    case 'SW': sum = (yFlat + RISE * (0.5 - diff / 2)) / (HALF_H - RISE / 2); break;
    case 'NE': sum = (yFlat + RISE * (diff / 2 + 0.5)) / (HALF_H + RISE / 2); break;
    default: throw new Error(`unknown high edge ${high}`);
  }
  return { c: (sum + diff) / 2, r: (sum - diff) / 2 };
}

function sampleBilinear(img, x, y) {
  const { data, width, height } = img;
  const x0 = Math.floor(x - 0.5), y0 = Math.floor(y - 0.5);
  const fx = x - 0.5 - x0, fy = y - 0.5 - y0;
  const out = [0, 0, 0, 0];
  let weight = 0;
  for (let j = 0; j <= 1; j++) {
    for (let i = 0; i <= 1; i++) {
      const px = x0 + i, py = y0 + j;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
      const o = (py * width + px) * 4;
      const a = data[o + 3] / 255;
      out[0] += data[o] * a * w; out[1] += data[o + 1] * a * w; out[2] += data[o + 2] * a * w;
      out[3] += a * w;
      weight += w;
    }
  }
  if (weight <= 0 || out[3] <= 0) return [0, 0, 0, 0];
  return [out[0] / out[3], out[1] / out[3], out[2] / out[3], (out[3] / weight) * 255];
}

// Colour of the slope tile at screen point (x, y): surface, wall, earth base or nothing.
function shadeAt(spec, straight, x, y) {
  const { c, r } = slopePointAt(spec.high, x, y);
  // Along the road the surface runs a pixel past both the low and the high edge, so a seam is
  // fully covered by two opaque tiles instead of two anti-aliased edges over the terrain.
  const alongC = spec.high === 'SE' || spec.high === 'NW';
  const cLimit = 0.5 + (alongC ? EDGE_OVERLAP : 0);
  const rLimit = 0.5 + (alongC ? 0 : EDGE_OVERLAP);
  if (Math.abs(c) <= cLimit && Math.abs(r) <= rLimit) {
    // Read the straight tile just inside its silhouette so its feathered edge pixels never land
    // on a seam, and let the supersampling coverage anti-alias this tile's own outline.
    const cc = Math.max(-0.5 + EDGE_INSET, Math.min(0.5 - EDGE_INSET, c));
    const rr = Math.max(-0.5 + EDGE_INSET, Math.min(0.5 - EDGE_INSET, r));
    const [sr, sg, sb] = sampleBilinear(straight, CENTER_X + (cc - rr) * HALF_W, CENTER_Y + (cc + rr) * HALF_H);
    return [sr, sg, sb, 255];
  }
  // Faces under the SE edge (c = 0.5) and the SW edge (r = 0.5): a wall from the raised edge
  // down to the ground edge, then the straight tile's own base below the ground edge.
  if (x >= CENTER_X && x <= CENTER_X + HALF_W) {
    const edgeR = 0.5 - (x - CENTER_X) / HALF_W;
    const groundY = CENTER_Y + (0.5 + edgeR) * HALF_H;
    const wall = riseAt(spec.high, 0.5, edgeR);
    if (y >= groundY - wall && y < groundY) return [spec.wallSE, spec.wallSE, spec.wallSE, 255];
    if (y >= groundY && y < groundY + BASE_HEIGHT) return sampleBilinear(straight, x, y);
  }
  if (x >= CENTER_X - HALF_W && x < CENTER_X) {
    const edgeC = 0.5 + (x - CENTER_X) / HALF_W;
    const groundY = CENTER_Y + (edgeC + 0.5) * HALF_H;
    const wall = riseAt(spec.high, edgeC, 0.5);
    if (y >= groundY - wall && y < groundY) return [spec.wallSW, spec.wallSW, spec.wallSW, 255];
    if (y >= groundY && y < groundY + BASE_HEIGHT) return sampleBilinear(straight, x, y);
  }
  return [0, 0, 0, 0];
}

async function loadRaw(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function buildSlope(spec, straight) {
  const out = Buffer.alloc(CANVAS_W * CANVAS_H * 4);
  const n = SUPERSAMPLE;
  for (let py = 0; py < CANVAS_H; py++) {
    for (let px = 0; px < CANVAS_W; px++) {
      let rr = 0, gg = 0, bb = 0, aa = 0;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const [sr, sg, sb, sa] = shadeAt(spec, straight, px + (i + 0.5) / n, py + (j + 0.5) / n);
          rr += sr * sa; gg += sg * sa; bb += sb * sa; aa += sa;
        }
      }
      const o = (py * CANVAS_W + px) * 4;
      if (aa > 0) {
        out[o] = Math.round(rr / aa); out[o + 1] = Math.round(gg / aa); out[o + 2] = Math.round(bb / aa);
        out[o + 3] = Math.round(aa / (n * n));
      }
    }
  }
  return out;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const straights = {};
  const previews = [];
  for (const spec of SLOPES) {
    straights[spec.straight] ??= await loadRaw(path.join(TILE_DIR, spec.straight));
    const pixels = buildSlope(spec, straights[spec.straight]);
    const outFile = path.join(OUT_DIR, spec.file);
    await sharp(pixels, { raw: { width: CANVAS_W, height: CANVAS_H, channels: 4, premultiplied: false } })
      .png({ compressionLevel: 9 })
      .toFile(outFile);
    console.log(`${spec.file}: ${spec.high} edge raised ${RISE}px from ${spec.straight}`);
    previews.push(pixels);
  }
  if (PREVIEW) {
    const scale = 4;
    const composites = previews.map((pixels, i) => ({
      input: sharp(pixels, { raw: { width: CANVAS_W, height: CANVAS_H, channels: 4, premultiplied: false } })
        .resize(CANVAS_W * scale, CANVAS_H * scale, { kernel: 'nearest' }).png(),
      left: (i % 2) * CANVAS_W * scale,
      top: Math.floor(i / 2) * CANVAS_H * scale,
    }));
    for (const item of composites) item.input = await item.input.toBuffer();
    await sharp({ create: { width: CANVAS_W * scale * 2, height: CANVAS_H * scale * 2, channels: 4, background: '#2b2b33' } })
      .composite(composites).png().toFile(PREVIEW);
    console.log(`preview: ${PREVIEW}`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
