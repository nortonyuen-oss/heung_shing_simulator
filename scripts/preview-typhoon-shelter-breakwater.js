// Render breakwater layouts (typhoon-shelter-assets.js layoutTyphoonShelterBreakwater) to a PNG,
// to check the 防波堤組件 numbers by eye.
//
//   node scripts/preview-typhoon-shelter-breakwater.js <out.png> ['<layout json>']
//
// Without a layout it draws the reference set: straight runs on both diagonals with a head at
// each end, the V turn, a head behind a run, and a run of the shorter section.
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const assets = require(path.join(ROOT, 'typhoon-shelter-assets.js'));

const REFERENCE = [
  { legs: [{ dir: 'se', count: 4 }], start: 'causeway3_a', end: 'causeway2_a' },
  { legs: [{ dir: 'ne', count: 4 }], start: 'causeway2_a', end: { id: 'causeway3_a', mirrored: true } },
  { legs: [{ dir: 'se', count: 3 }, { dir: 'ne', count: 3 }], corner: 'causeway2_a' },
  { legs: [{ dir: 'nw', count: 3 }], end: 'causeway2_a' },
  { legs: [{ dir: 'ne', count: 4 }], segment: 'causeway1_b', end: 'causeway2_a' },
];

async function renderLayout(spec) {
  const { pieces, ends } = assets.layoutTyphoonShelterBreakwater(spec);
  const images = await Promise.all(pieces.map(async (p) => {
    const file = path.join(ROOT, p.texture);
    const meta = await sharp(file).metadata();
    const w = Math.round(meta.width * p.scale);
    const h = Math.round(meta.height * p.scale);
    const input = p.scale === 1 ? await sharp(file).png().toBuffer() : await sharp(file).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
    return { input, x: Math.round(p.x), y: Math.round(p.y), w, h };
  }));
  const minX = Math.min(...images.map((i) => i.x));
  const minY = Math.min(...images.map((i) => i.y));
  const maxX = Math.max(...images.map((i) => i.x + i.w));
  const maxY = Math.max(...images.map((i) => i.y + i.h));
  const W = maxX - minX;
  const H = maxY - minY;
  const dot = (p, color) => ({
    input: Buffer.from(`<svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="${color}"/></svg>`),
    left: Math.round(p[0] - minX - 5),
    top: Math.round(p[1] - minY - 5),
  });
  const canvas = await sharp({ create: { width: W, height: H, channels: 4, background: '#1e3a58' } })
    .composite([
      ...images.map((i) => ({ input: i.input, left: i.x - minX, top: i.y - minY })),
      dot(ends.start, '#39d353'),
      dot(ends.end, '#ff3b30'),
    ])
    .png().toBuffer();
  // trim the empty texture margins
  return sharp(canvas).trim({ background: '#1e3a58', threshold: 4 }).png().toBuffer();
}

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error('usage: node scripts/preview-typhoon-shelter-breakwater.js <out.png> [layout json]');
  const layouts = process.argv[3] ? [JSON.parse(process.argv[3])] : REFERENCE;
  const renders = [];
  for (const spec of layouts) renders.push(await renderLayout(spec));
  const metas = await Promise.all(renders.map((r) => sharp(r).metadata()));
  const pad = 24;
  const W = Math.max(...metas.map((m) => m.width)) + pad * 2;
  const H = metas.reduce((sum, m) => sum + m.height + pad, pad);
  let y = pad;
  const composites = renders.map((input, i) => {
    const c = { input, left: pad, top: y };
    y += metas[i].height + pad;
    return c;
  });
  await sharp({ create: { width: W, height: H, channels: 4, background: '#1e3a58' } }).composite(composites).png().toFile(out);
  console.log(`${layouts.length} layout(s) -> ${out} (green dot: start, red dot: end of the run)`);
}

main().catch((error) => { console.error(error); process.exit(1); });
