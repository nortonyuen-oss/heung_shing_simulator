#!/usr/bin/env node
// Bake a night variant of every building model that has a calibrated light
// profile: dark facade, lit windows, lamp pools.
//
// WHY OFFLINE
// Night render cost is ~0.34ms per visible additive object and is essentially
// independent of what is drawn into it - measured on one fixed dense view, 400
// glow objects rendered in 165ms and 48 in 46ms with the same drawn geometry.
// The only way to reach zero is to have no extra object at all, which means the
// glow has to be pixels in the building's own texture.
//
// RUNS AFTER prepare-release-assets.js, ON THE STAGED TEXTURES
// The calibrator ran against the texture the game actually shows, which is the
// packaged one: prepare-release-assets trims each source to its alpha bounds and
// re-pads it to a power of two. Baking onto the raw PNG puts the same 0..1
// coordinates somewhere else entirely - windows land visibly off the real ones.
// So this reads the staged WebP, writes its night variants beside it, and adds
// manifest entries for them.
//
// HOW THE GLOW IS DRAWN
// Not by painting solid quads. The source art already draws windows, and the
// calibrated grid does not line up with them, so painted quads read as white
// bands smeared down the facade. Instead each lit cell is used as a MASK and the
// artwork underneath it is brightened and pushed warm - so what lights up is the
// real window in the art, keeping frames, mullions and balconies intact.
//
// Contrast comes from darkening the facade, not from raw brightness: the window
// pixels are already bright, so a brightness multiplier saturates almost
// immediately. DIM and WARM_MIX are the knobs that matter.
//
//   node scripts/bake-night-textures.js                  # write __night.webp next to sources
//   BAKE_SAMPLES=slug1,slug2 node scripts/...            # PNG samples to .data/night-samples
//   BAKE_DIM=0.65 BAKE_WARM_MIX=0.85 node scripts/...    # stronger, moodier

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const bl = require(path.join(ROOT, 'building-lighting.js'));

// Facade darkening baked into the texture. Buildings using a baked night
// texture set `skipNightTint` so main.js does not darken them a second time.
// Deliberately deeper than the runtime building tint (~0.18): lit windows can
// only reach 255, so the wall has to come down for the contrast to exist.
const DIM = Number(process.env.BAKE_DIM || 0.55);
const DIM_TINT = [0x8f, 0x99, 0xb0];
// Lit-window treatment. BOOST saturates quickly because window pixels start
// bright; WARM_MIX is what actually separates a lit window from a grey one.
const BOOST = Number(process.env.BAKE_BOOST || 3.0);
const WARM_MIX = Number(process.env.BAKE_WARM_MIX || 0.70);
const WARM = [0xff, 0xcf, 0x82];
const HALO_RADIUS = Number(process.env.BAKE_HALO_RADIUS || 3.2);
const HALO_ALPHA = Number(process.env.BAKE_HALO_ALPHA || 0.55);
const HALO_COLOR = [0xff, 0xc8, 0x78];
// Two tiers of night. Evening is the busy one; deep night has far fewer lit
// windows (the schedule in building-lighting.js already thins them) and a
// darker facade, so a city visibly settles down in the small hours.
const VARIANTS = [
  { suffix: '__night', bucket: 'eveningPeak', dim: Number(process.env.BAKE_DIM || 0.55) },
  { suffix: '__nightdeep', bucket: 'deepNight', dim: Number(process.env.BAKE_DIM_DEEP || 0.68) },
];
const SAMPLE_DIR = path.join(ROOT, '.data', 'night-samples');
const STAGE_ROOT = path.join(ROOT, '.data', 'package-assets');
const MANIFEST_PATH = path.join(STAGE_ROOT, 'Models', 'model-assets.json');

// White where a window is lit, feathered a little so the boost does not clip to
// a hard polygon edge over the artwork.
function litWindowMaskSvg(profile, W, H, bucket) {
  const cells = bl.computeLitBuildingWindows(
    profile, 0, bucket, 0, bl.getBuildingLightPersonality(0),
  );
  const pts = (q) => q.map((p) => `${(p[0] * W).toFixed(1)},${(p[1] * H).toFixed(1)}`).join(' ');
  const parts = [];
  let lit = 0;
  for (const c of cells) {
    if (!c.on) continue;
    lit += 1;
    parts.push(`<polygon points="${pts(c.quad)}" fill="#ffffff" fill-opacity="${Math.min(1, c.alpha).toFixed(3)}"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
    + `<g filter="url(#soften)">${parts.join('')}</g>`
    + '<defs><filter id="soften"><feGaussianBlur stdDeviation="0.6"/></filter></defs></svg>';
  // A much wider, weaker copy of the same shapes. Screened over the facade it
  // restores the halo the additive runtime glow used to give: without it the lit
  // windows read as flat colour blocks pasted onto the wall.
  const halo = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
    + `<g filter="url(#bloom)">${parts.join('')}</g>`
    + `<defs><filter id="bloom" x="-30%" y="-30%" width="160%" height="160%">`
    + `<feGaussianBlur stdDeviation="${HALO_RADIUS}"/></filter></defs></svg>`;
  return { svg, halo, lit };
}

function lampSvg(profile, W, H) {
  const parts = [];
  for (const l of (profile.lamps || [])) {
    const x = (l.x * W).toFixed(1);
    const y = (l.y * H).toFixed(1);
    const r = l.r * W;
    parts.push(`<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="#ffdca8" fill-opacity="0.12"/>`);
    parts.push(`<circle cx="${x}" cy="${y}" r="${(r * 0.5).toFixed(1)}" fill="#ffe6bf" fill-opacity="0.34"/>`);
    parts.push(`<circle cx="${x}" cy="${y}" r="${(r * 0.18).toFixed(1)}" fill="#fff3df" fill-opacity="0.78"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`;
}

async function bakeOne(sourcePath, profile, variant) {
  // No resize: the staged texture is already the exact image the game shows,
  // which is what the calibration coordinates were authored against.
  const day = await sharp(sourcePath)
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = day.info;

  const { svg, halo, lit } = litWindowMaskSvg(profile, W, H, variant.bucket);
  const mask = (await sharp(Buffer.from(svg)).resize(W, H).ensureAlpha()
    .raw().toBuffer({ resolveWithObject: true })).data;
  const bloom = (await sharp(Buffer.from(halo)).resize(W, H).ensureAlpha()
    .raw().toBuffer({ resolveWithObject: true })).data;
  const lamps = (await sharp(Buffer.from(lampSvg(profile, W, H))).resize(W, H).ensureAlpha()
    .raw().toBuffer({ resolveWithObject: true })).data;

  const D = day.data;
  const N = Buffer.alloc(D.length);
  for (let i = 0; i < D.length; i += 4) {
    const m = mask[i + 3] / 255;
    for (let c = 0; c < 3; c++) {
      // night facade: multiply toward the cool tint
      let v = D[i + c] * (1 - variant.dim) + D[i + c] * (DIM_TINT[c] / 255) * variant.dim;
      if (m > 0) {
        const boosted = Math.min(255, D[i + c] * BOOST);
        const warmed = boosted * (1 - WARM_MIX) + WARM[c] * WARM_MIX;
        v = v * (1 - m) + warmed * m;
      }
      // soft halo, then lamp pools, both screened over the result
      const ha = (bloom[i + 3] / 255) * HALO_ALPHA;
      if (ha > 0) v = 255 - ((255 - v) * (255 - HALO_COLOR[c] * ha)) / 255;
      const la = lamps[i + 3] / 255;
      const g = lamps[i + c] * la;
      N[i + c] = Math.min(255, 255 - ((255 - v) * (255 - g)) / 255);
    }
    // silhouette must stay byte-identical to the day art
    N[i + 3] = D[i + 3];
  }
  return { raw: N, width: W, height: H, lit };
}

// Map model slug -> staged texture, using the manifest the game itself reads.
function buildStagedIndex(manifest) {
  const bySlug = new Map();
  Object.entries(manifest.entries || {}).forEach(([logicalPath, entry]) => {
    if (!entry?.packagedPath) return;
    const file = logicalPath.split('/').pop() || '';
    if (file.includes('__night')) return;
    bySlug.set(file.replace(/\.[^.]+$/, ''), { logicalPath, entry });
  });
  // service/park/special profiles are keyed by hand-authored sprite keys
  const sources = ['constants.js', 'main.js']
    .map((f) => path.join(ROOT, f))
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
  const re = /spriteKey:\s*'([^']+)'[\s\S]{0,240}?path:\s*'(Models\/[^']+)'/g;
  let m;
  while ((m = re.exec(sources)) !== null) {
    const [, spriteKey, relPath] = m;
    if (bySlug.has(spriteKey)) continue;
    const entry = manifest.entries?.[relPath];
    if (entry?.packagedPath) bySlug.set(spriteKey, { logicalPath: relPath, entry });
  }
  return bySlug;
}

async function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error('No staged manifest. Run `npm run prepare:release-assets` first.');
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const profiles = bl.BUILDING_LIGHT_HERO_PROFILES;
  const staged = buildStagedIndex(manifest);
  const sampleOnly = (process.env.BAKE_SAMPLES || '').split(',').map((s) => s.trim()).filter(Boolean);
  const slugs = Object.keys(profiles).filter((s) => staged.has(s));
  const targets = sampleOnly.length ? slugs.filter((s) => sampleOnly.includes(s)) : slugs;

  const missing = Object.keys(profiles).filter((s) => !staged.has(s));
  if (missing.length) console.warn(`No staged art for ${missing.length} profile(s): ${missing.join(', ')}`);
  if (sampleOnly.length) fs.mkdirSync(SAMPLE_DIR, { recursive: true });

  let written = 0;
  for (const slug of targets) {
    const { logicalPath, entry } = staged.get(slug);
    const src = path.join(STAGE_ROOT, entry.packagedPath);
    if (!fs.existsSync(src)) continue;
    if (sampleOnly.length) {
      fs.copyFileSync(src, path.join(SAMPLE_DIR, `${slug}--day.webp`));
    }
    const counts = [];
    for (const variant of VARIANTS) {
      const { raw, width, height, lit } = await bakeOne(src, profiles[slug], variant);
      const img = sharp(raw, { raw: { width, height, channels: 4 } });
      if (sampleOnly.length) {
        await img.png().toFile(path.join(SAMPLE_DIR, `${slug}${variant.suffix}.png`));
      } else {
        const packagedPath = entry.packagedPath.replace(/\.webp$/, `${variant.suffix}.webp`);
        await img.webp({ lossless: true }).toFile(path.join(STAGE_ROOT, packagedPath));
        manifest.entries[logicalPath.replace(/\.[^.]+$/, `${variant.suffix}.png`)] = {
          logicalPath: logicalPath.replace(/\.[^.]+$/, `${variant.suffix}.png`),
          packagedPath,
          hash: `${entry.hash}${variant.suffix}`,
          outputWidth: width,
          outputHeight: height,
        };
      }
      counts.push(`${variant.bucket} ${lit}`);
      written += 1;
    }
    console.log(`${slug}: ${counts.join(', ')} lit windows`);
  }
  if (!sampleOnly.length && written) {
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(`\n${written} texture(s)${sampleOnly.length ? ` -> ${path.relative(ROOT, SAMPLE_DIR)}` : ' baked into the staged tree + manifest'}.`);
  console.log(`dim=${VARIANTS.map((v) => v.dim).join('/')} boost=${BOOST} warm=${WARM_MIX} halo=${HALO_RADIUS}@${HALO_ALPHA}`);
}

main().catch((error) => {
  console.error('Night texture bake failed:', error);
  process.exitCode = 1;
});
