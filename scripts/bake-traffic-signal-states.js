// Bake the junction traffic-signal state textures from the four source poles.
//
//   node scripts/bake-traffic-signal-states.js [--out <dir>] [--preview <png>]
//
// The source art (scripts/source-art/trafficLight_{SW,SE,NW,NE}.png, 320x600, pole foot at
// 160,600) shows every lamp lit at once: red, amber and green on the vehicle head and both the
// red and green man on the pedestrian head. The game needs one texture per lamp state, so this
// finds each lit lamp by hue, then writes a texture per state with the lamps that should be
// off darkened to an unlit lens and the lamps that are on given a soft glow halo, the same
// idea as the vehicle tail-lamp sprites in traffic-visuals.js.
//
// Only lamps the camera can see get states: the isometric view shows the SW and SE poles'
// vehicle heads and the SW and NW poles' pedestrian heads; NE shows its backs, so it keeps
// its single texture. Every output is finished on a 256x256 canvas (a power of two, so Phaser
// mipmaps it; the pole is ~20 px on screen) with the foot at (128, 256): the outputs go to
// Models/trafficLight/ (the release pipeline stages them like any other model art) and their
// names are the keys traffic-signals.js loads.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { finishOnPowerOfTwoCanvas } = require('./lib/pot-prop-canvas');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'scripts', 'source-art');
const args = process.argv.slice(2);
const argValue = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const OUT_DIR = path.resolve(argValue('--out') || path.join(ROOT, 'Models', 'trafficLight'));
const PREVIEW = argValue('--preview');

// Output canvas: the 320x600 source scaled to fit 256 px tall, foot (160, 600) -> (128, 256).
const OUT_SIZE = 256;
const OUT_SCALE = OUT_SIZE / 600;
const SOURCE_FOOT = { x: 160, y: 600 };
const OUT_FOOT = { x: 128, y: 256 };

// Vehicle lamps are on the head above y=330 of the 600px source; the pedestrian figures sit
// below it. Blobs of one colour within a region are merged (the red man splits into two).
const HEAD_SPLIT_Y = 330;
const GLOW = {
  red: [255, 64, 40],
  amber: [255, 190, 60],
  green: [80, 255, 120],
};
// Every state a facing needs: vehicle lamp on (r / ra / g / a) and pedestrian lamp on (pr /
// pg / px = flashing gap). A lamp not listed for a facing is not visible from the camera.
const STATES = {
  SW: [
    { name: 'r_pg', vehicle: ['red'], ped: ['green'] },
    { name: 'r_px', vehicle: ['red'], ped: [] },
    { name: 'r_pr', vehicle: ['red'], ped: ['red'] },
    { name: 'ra_pr', vehicle: ['red', 'amber'], ped: ['red'] },
    { name: 'g_pr', vehicle: ['green'], ped: ['red'] },
    { name: 'a_pr', vehicle: ['amber'], ped: ['red'] },
  ],
  SE: [
    { name: 'r', vehicle: ['red'], ped: [] },
    { name: 'ra', vehicle: ['red', 'amber'], ped: [] },
    { name: 'g', vehicle: ['green'], ped: [] },
    { name: 'a', vehicle: ['amber'], ped: [] },
  ],
  NW: [
    { name: 'pr', vehicle: [], ped: ['red'] },
    { name: 'pg', vehicle: [], ped: ['green'] },
    { name: 'px', vehicle: [], ped: [] },
  ],
  NE: [],
};

function hsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max / 255 };
}

function classifyLit(r, g, b) {
  const { h, s, v } = hsv(r, g, b);
  if (s > 0.55 && v > 0.45 && (h < 14 || h > 340)) return 'red';
  if (s > 0.6 && v > 0.5 && h >= 22 && h <= 58) return 'amber';
  if (s > 0.5 && v > 0.4 && h >= 95 && h <= 165) return 'green';
  return null;
}

// Connected blobs of lit pixels, by colour.
function findLitBlobs(data, W, H) {
  const cls = new Array(W * H).fill(null);
  for (let i = 0; i < W * H; i++) {
    if (data[i * 4 + 3] < 200) continue;
    cls[i] = classifyLit(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  }
  const seen = new Uint8Array(W * H);
  const blobs = [];
  for (let i = 0; i < W * H; i++) {
    if (!cls[i] || seen[i]) continue;
    const colour = cls[i];
    const stack = [i];
    seen[i] = 1;
    let area = 0;
    let minX = W; let maxX = 0; let minY = H; let maxY = 0;
    while (stack.length) {
      const p = stack.pop();
      const x = p % W;
      const y = (p / W) | 0;
      area++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (seen[q] || cls[q] !== colour) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    if (area >= 40) blobs.push({ colour, area, minX, maxX, minY, maxY });
  }
  return blobs;
}

// One lamp = the merged box of every blob of that colour in the region, as an ellipse. The
// lens centre (for the night glow anchor) is the largest blob's box centre, so a glow spill
// that got classified as the same colour does not pull it sideways.
function lampsFrom(blobs, region) {
  const lamps = {};
  for (const blob of blobs) {
    const cy = (blob.minY + blob.maxY) / 2;
    if (region === 'vehicle' ? cy >= HEAD_SPLIT_Y : cy < HEAD_SPLIT_Y) continue;
    const lamp = lamps[blob.colour] ??= { colour: blob.colour, minX: blob.minX, maxX: blob.maxX, minY: blob.minY, maxY: blob.maxY, largest: blob };
    lamp.minX = Math.min(lamp.minX, blob.minX); lamp.maxX = Math.max(lamp.maxX, blob.maxX);
    lamp.minY = Math.min(lamp.minY, blob.minY); lamp.maxY = Math.max(lamp.maxY, blob.maxY);
    if (blob.area > lamp.largest.area) lamp.largest = blob;
  }
  return Object.values(lamps).map((lamp) => ({
    colour: lamp.colour,
    cx: (lamp.minX + lamp.maxX) / 2,
    cy: (lamp.minY + lamp.maxY) / 2,
    rx: (lamp.maxX - lamp.minX) / 2 + 1,
    ry: (lamp.maxY - lamp.minY) / 2 + 1,
    lensX: (lamp.largest.minX + lamp.largest.maxX) / 2,
    lensY: (lamp.largest.minY + lamp.largest.maxY) / 2,
  }));
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

// Darken a lamp to an unlit lens: desaturated, ~30% brightness, soft edge just past the lens.
function paintOff(out, W, H, lamp, strength = 0.32) {
  const margin = 5;
  const x0 = Math.max(0, Math.floor(lamp.cx - lamp.rx - margin));
  const x1 = Math.min(W - 1, Math.ceil(lamp.cx + lamp.rx + margin));
  const y0 = Math.max(0, Math.floor(lamp.cy - lamp.ry - margin));
  const y1 = Math.min(H - 1, Math.ceil(lamp.cy + lamp.ry + margin));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot((x - lamp.cx) / (lamp.rx + margin), (y - lamp.cy) / (lamp.ry + margin));
      if (d > 1) continue;
      const inner = Math.hypot((x - lamp.cx) / lamp.rx, (y - lamp.cy) / lamp.ry);
      // Full effect inside the lens, easing out over the margin so the housing keeps its look.
      const w = inner <= 1 ? 1 : 1 - Math.min(1, (inner - 1) / ((lamp.rx + margin) / lamp.rx - 1));
      if (w <= 0) continue;
      const i = (y * W + x) * 4;
      const r = out[i]; const g = out[i + 1]; const b = out[i + 2];
      const grey = 0.3 * r + 0.59 * g + 0.11 * b;
      const dr = (grey * 0.7 + r * 0.3) * strength;
      const dg = (grey * 0.7 + g * 0.3) * strength;
      const db = (grey * 0.7 + b * 0.3) * strength;
      out[i] = clamp255(r + (dr - r) * w);
      out[i + 1] = clamp255(g + (dg - g) * w);
      out[i + 2] = clamp255(b + (db - b) * w);
    }
  }
}

// Give a lit lamp a glow halo like the vehicle tail lamps: a soft bloom past the lens edge that
// also spills into transparent pixels, plus a slightly brighter core.
function paintGlow(out, W, H, lamp, colour, { reach = 0.75, halo = 0.55, core = 0.16 } = {}) {
  const spread = 1 + reach;
  const x0 = Math.max(0, Math.floor(lamp.cx - lamp.rx * spread - 1));
  const x1 = Math.min(W - 1, Math.ceil(lamp.cx + lamp.rx * spread + 1));
  const y0 = Math.max(0, Math.floor(lamp.cy - lamp.ry * spread - 1));
  const y1 = Math.min(H - 1, Math.ceil(lamp.cy + lamp.ry * spread + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot((x - lamp.cx) / lamp.rx, (y - lamp.cy) / lamp.ry);
      if (d > spread) continue;
      const alpha = d <= 1 ? core * (1 - d) : halo * ((spread - d) / reach) ** 1.7;
      if (alpha <= 0.003) continue;
      const i = (y * W + x) * 4;
      const a = out[i + 3] / 255;
      // Premultiplied add, then back to straight alpha so the halo reads over transparency.
      const pr = out[i] * a + colour[0] * alpha;
      const pg = out[i + 1] * a + colour[1] * alpha;
      const pb = out[i + 2] * a + colour[2] * alpha;
      const na = a + alpha * (1 - a);
      out[i] = clamp255(pr / na);
      out[i + 1] = clamp255(pg / na);
      out[i + 2] = clamp255(pb / na);
      out[i + 3] = clamp255(Math.round(na * 255));
    }
  }
}

async function bakeFacing(facing) {
  const sourcePath = path.join(SOURCE_DIR, `trafficLight_${facing}.png`);
  const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width; const H = info.height;
  const blobs = findLitBlobs(data, W, H);
  const vehicleLamps = lampsFrom(blobs, 'vehicle');
  const pedLamps = lampsFrom(blobs, 'ped');
  const outputs = [];
  for (const state of STATES[facing]) {
    const out = Buffer.from(data);
    for (const lamp of vehicleLamps) {
      if (state.vehicle.includes(lamp.colour)) paintGlow(out, W, H, lamp, GLOW[lamp.colour]);
      else paintOff(out, W, H, lamp);
    }
    for (const lamp of pedLamps) {
      if (state.ped.includes(lamp.colour)) paintGlow(out, W, H, lamp, GLOW[lamp.colour], { reach: 0.45, halo: 0.35, core: 0.1 });
      else paintOff(out, W, H, lamp, 0.22);
    }
    const file = path.join(OUT_DIR, `trafficLight_${facing}__${state.name}.png`);
    await writeOutput(out, W, H, file);
    outputs.push({ file, label: `${facing} ${state.name}` });
  }
  if (!STATES[facing].length) {
    // Nothing visible changes on this facing: ship the source as its only texture.
    const file = path.join(OUT_DIR, `trafficLight_${facing}.png`);
    await writeOutput(Buffer.from(data), W, H, file);
    outputs.push({ file, label: `${facing} (static)` });
  }
  return { facing, vehicleLamps, pedLamps, outputs };
}

async function writeOutput(pixels, W, H, file) {
  const canvas = await finishOnPowerOfTwoCanvas(pixels, W, H, { scale: OUT_SCALE, size: OUT_SIZE, sourceAnchor: SOURCE_FOOT, anchor: OUT_FOOT });
  await sharp(canvas, { raw: { width: OUT_SIZE, height: OUT_SIZE, channels: 4, premultiplied: false } })
    .png({ compressionLevel: 9 }).toFile(file);
}

async function writePreview(results, file) {
  const tiles = results.flatMap((r) => r.outputs);
  const scale = 0.9;
  const tileW = Math.round(OUT_SIZE * scale); const tileH = Math.round(OUT_SIZE * scale);
  const gameH = 64; const gameW = gameH;
  const cols = 7;
  const rows = Math.ceil(tiles.length / cols);
  const labelH = 18;
  const width = cols * (tileW + 8) + 8;
  const height = rows * (tileH + labelH + 8) + 8 + gameH + 24;
  const composites = [];
  for (let i = 0; i < tiles.length; i++) {
    const x = 8 + (i % cols) * (tileW + 8);
    const y = 8 + Math.floor(i / cols) * (tileH + labelH + 8);
    composites.push({ input: await sharp(tiles[i].file).resize(tileW, tileH).png().toBuffer(), left: x, top: y + labelH });
    const label = Buffer.from(`<svg width="${tileW}" height="${labelH}"><text x="2" y="13" font-family="Menlo, monospace" font-size="12" fill="#ffd27a">${tiles[i].label}</text></svg>`);
    composites.push({ input: label, left: x, top: y });
    // Game-size strip along the bottom (~64px tall = roughly max zoom in game).
    composites.push({ input: await sharp(tiles[i].file).resize(gameW, gameH).png().toBuffer(), left: 8 + i * (gameW + 6), top: height - gameH - 8 });
  }
  await sharp({ create: { width, height, channels: 4, background: { r: 52, g: 58, b: 48, alpha: 1 } } })
    .composite(composites).png().toFile(file);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = [];
  for (const facing of ['SW', 'SE', 'NW', 'NE']) {
    const result = await bakeFacing(facing);
    results.push(result);
    const describe = (lamps) => lamps.map((l) => `${l.colour}@${Math.round(l.cx)},${Math.round(l.cy)}`).join(' ') || '-';
    console.log(`${facing}: vehicle [${describe(result.vehicleLamps)}] ped [${describe(result.pedLamps)}] -> ${result.outputs.length} texture(s)`);
  }
  // Lens centres relative to the pole foot, in output-canvas pixels: paste into
  // TRAFFIC_SIGNAL_LAMP_ANCHORS (traffic-signals.js) for the night glow sprites.
  const rel = (v, origin) => ((v - origin) * OUT_SCALE).toFixed(1);
  console.log(`Lamp anchors (${OUT_SIZE}px canvas px from the foot at ${OUT_FOOT.x},${OUT_FOOT.y}):`);
  results.forEach((result) => {
    const entries = [
      ...result.vehicleLamps.map((l) => `${l.colour}: [${rel(l.lensX, SOURCE_FOOT.x)}, ${rel(l.lensY, SOURCE_FOOT.y)}]`),
      ...result.pedLamps.map((l) => `ped${l.colour[0].toUpperCase()}${l.colour.slice(1)}: [${rel(l.lensX, SOURCE_FOOT.x)}, ${rel(l.lensY, SOURCE_FOOT.y)}]`),
    ];
    console.log(`  ${result.facing.toLowerCase()}: { ${entries.join(', ')} },`);
  });
  if (PREVIEW) {
    await writePreview(results, path.resolve(PREVIEW));
    console.log(`Preview: ${PREVIEW}`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
