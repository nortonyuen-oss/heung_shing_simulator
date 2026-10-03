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
// WORKFLOW FOR A MODEL THAT IS NOT CALIBRATED YET
// Nothing here touches it: with no profile there is no baked art, and
// building-lighting.js falls back to its live glow (one dim street lamp from
// BUILDING_LIGHT_MINIMAL_PROFILE), subject to the camera LOD. Calibrate it in
// game, then re-run `npm run prepare:release-assets` to bake it in. While the
// calibrator is open the live glow is used even for already-baked models, so
// edits are visible instead of being hidden behind stale baked art.
//
//   node scripts/bake-night-textures.js                  # write __night.webp next to sources
//   BAKE_SAMPLES=slug1,slug2 node scripts/...            # PNG samples to .data/night-samples
//   BAKE_DIM=0.65 BAKE_WARM_MIX=0.85 node scripts/...    # stronger, moodier

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { normalizeChristmasWalls, compositeChristmasWall } = require('../christmas-wall.js');
const { DatabaseSync } = require('node:sqlite');
const vm = require('node:vm');

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
const HALO_RADIUS = Number(process.env.BAKE_HALO_RADIUS || 3.2);
const HALO_ALPHA = Number(process.env.BAKE_HALO_ALPHA || 0.55);
// The lit-window colour is the profile's own class colour, the same one the
// live glow uses (BUILDING_LIGHT_CLASS_COLOR): homes are warm, offices are a
// cool white, industry amber, services pale blue. Baking one fixed warm tone
// turned every calibrated office block yellow.
function lightColor(profile) {
  const rgb = Number.isFinite(profile?.color) ? profile.color : 0xffcf87;
  return [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff];
}
// The halo is the same hue, lifted toward white so the bloom reads as light
// spilling rather than as a coloured wash.
function haloColor(profile) {
  return lightColor(profile).map((c) => Math.round(c + (255 - c) * 0.25));
}
const LAMP_ALPHA = Number(process.env.BAKE_LAMP_ALPHA || 1);
// A calibrated lamp point is the lamp HEAD (the top of a post or pillar lamp, a
// sign's spotlight), and r its reach. It is drawn as a light, not a disc:
//  - the head: a small hot core with a soft bloom, falling off smoothly;
//  - the pool it throws: an isometric ellipse (2:1, lying on the ground) a
//    little below the head, which brightens and warms the art underneath -
//    paving, grass and walls read as lit - instead of pasting colour over it.
// Every falloff is continuous, so there are no rings.
const LAMP_POOL_DROP = Number(process.env.BAKE_LAMP_POOL_DROP || 0.45);   // pool centre below the head, in r
const LAMP_POOL_GAIN = Number(process.env.BAKE_LAMP_POOL_GAIN || 1.5);    // brightening of the lit art
const LAMP_POOL_HAZE = Number(process.env.BAKE_LAMP_POOL_HAZE || 0.1);    // light in the air over it
const LAMP_HEAD_CORE = Number(process.env.BAKE_LAMP_HEAD_CORE || 0.07);   // core radius, in r
const LAMP_HEAD_BLOOM = Number(process.env.BAKE_LAMP_HEAD_BLOOM || 0.28); // bloom radius, in r
const LAMP_POOL_COLOR = [0xff, 0xc4, 0x82]; // sodium/warm LED on the ground
const LAMP_HEAD_COLOR = [0xff, 0xf0, 0xd2];
// Fraction of a lamp pool allowed to fall outside the model before the lamp is
// dropped rather than baked with its glow clipped off.
const LAMP_SPILL_TOLERANCE = Number(process.env.BAKE_LAMP_SPILL || 0.10);
// Four tiers of night. Evening is the busy one; half-lit is exactly half of
// peak in every class, worn on the way up at dusk and on the way down after
// 23:00; deep night has far fewer lit windows (the schedule in
// building-lighting.js already thins them) and a darker facade; lamps-only is
// the deep facade with no lit windows at all, just the street lamps - the
// building has gone to bed. Which of the four a building wears at a given
// minute is decided per building at runtime (getBuildingNightVariant,
// building-lighting.js), so the city lights up and settles down block by
// block rather than all at once.
const VARIANTS = [
  { suffix: '__night', bucket: 'eveningPeak', dim: Number(process.env.BAKE_DIM || 0.55), windows: true },
  { suffix: '__nighthalf', bucket: 'halfPeak', dim: Number(process.env.BAKE_DIM || 0.55), windows: true },
  { suffix: '__nightdeep', bucket: 'deepNight', dim: Number(process.env.BAKE_DIM_DEEP || 0.68), windows: true },
  { suffix: '__nightlamps', bucket: 'deepNight', dim: Number(process.env.BAKE_DIM_DEEP || 0.68), windows: false },
];
const SAMPLE_DIR = path.join(ROOT, '.data', 'night-samples');
const STAGE_ROOT = path.join(ROOT, '.data', 'package-assets');
const MANIFEST_PATH = path.join(STAGE_ROOT, 'Models', 'model-assets.json');

// A lamp is only baked if its whole pool falls inside the model's silhouette.
// One that spills onto the pavement or road cannot be baked at all: the texture
// is clipped to the building's own alpha, so the overhanging part would simply
// be cut off, and drawing those few lamps as separate objects costs a batch
// flush each (measured: ~5 fps for 220 of them). Dropping them is the honest
// trade - every lamp you see is one that actually fits.
function lampFitsInsideSilhouette(alphaAt, W, H, lamp) {
  const cx = lamp.x * W;
  const cy = lamp.y * H;
  const r = lamp.r * W;
  if (r <= 0) return false;
  let outside = 0;
  let total = 0;
  // sample the pool's disc on a coarse polar grid
  for (let ring = 1; ring <= 3; ring++) {
    const rr = (r * ring) / 3;
    for (let step = 0; step < 16; step++) {
      const a = (step / 16) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * rr);
      const y = Math.round(cy + Math.sin(a) * rr);
      total += 1;
      if (x < 0 || y < 0 || x >= W || y >= H || alphaAt(x, y) < 8) outside += 1;
    }
  }
  return total > 0 && outside / total <= LAMP_SPILL_TOLERANCE;
}

// Per-pixel light from every lamp that fits: `pool` (0..1, how lit the ground
// under it is) and `head` (0..1, the lamp's own glow).
function lampLightField(profile, W, H, alphaAt) {
  const pool = new Float32Array(W * H);
  const head = new Float32Array(W * H);
  let kept = 0;
  let dropped = 0;
  for (const l of (profile.lamps || [])) {
    if (!lampFitsInsideSilhouette(alphaAt, W, H, l)) { dropped += 1; continue; }
    kept += 1;
    const hx = l.x * W;
    const hy = l.y * H;
    const r = Math.max(2, l.r * W);
    const px = hx;
    const py = hy + r * LAMP_POOL_DROP;
    const core = Math.max(0.9, r * LAMP_HEAD_CORE);
    const bloom = Math.max(2, r * LAMP_HEAD_BLOOM);
    const x0 = Math.max(0, Math.floor(hx - r - 1));
    const x1 = Math.min(W - 1, Math.ceil(hx + r + 1));
    const y0 = Math.max(0, Math.floor(hy - bloom * 2));
    const y1 = Math.min(H - 1, Math.ceil(py + r * 0.5 + 1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        // Pool: smooth 2:1 ellipse, (1 - d^2)^2 so it fades to nothing at its rim.
        const ex = (x - px) / r;
        const ey = (y - py) / (r * 0.5);
        const d2 = ex * ex + ey * ey;
        if (d2 < 1) {
          const f = (1 - d2) * (1 - d2);
          pool[i] = 1 - (1 - pool[i]) * (1 - f * LAMP_ALPHA);
        }
        // Head: a gaussian core plus a wider, weaker bloom.
        const dx = x - hx;
        const dy = y - hy;
        const q = dx * dx + dy * dy;
        const g = Math.exp(-q / (core * core)) + 0.45 * Math.exp(-q / (bloom * bloom));
        if (g > 0.004) head[i] = Math.min(1, head[i] + g * LAMP_ALPHA);
      }
    }
  }
  return { pool, head, kept, dropped };
}

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

async function bakeOne(sourcePath, profile, variant) {
  // No resize: the staged texture is already the exact image the game shows,
  // which is what the calibration coordinates were authored against.
  const day = await sharp(sourcePath)
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = day.info;
  const LIGHT = lightColor(profile);
  const HALO = haloColor(profile);

  // The lamps-only variant bakes no windows at all: an empty mask and halo
  // rather than a schedule row that happens to light nothing.
  const emptySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"></svg>`;
  const { svg, halo, lit } = variant.windows === false
    ? { svg: emptySvg, halo: emptySvg, lit: 0 }
    : litWindowMaskSvg(profile, W, H, variant.bucket);
  const mask = (await sharp(Buffer.from(svg)).resize(W, H).ensureAlpha()
    .raw().toBuffer({ resolveWithObject: true })).data;
  const bloom = (await sharp(Buffer.from(halo)).resize(W, H).ensureAlpha()
    .raw().toBuffer({ resolveWithObject: true })).data;
  const D0 = day.data;
  const alphaAt = (x, y) => D0[(y * W + x) * 4 + 3];
  const { pool, head, kept, dropped } = lampLightField(profile, W, H, alphaAt);

  const D = day.data;
  const N = Buffer.alloc(D.length);
  for (let i = 0; i < D.length; i += 4) {
    const m = mask[i + 3] / 255;
    for (let c = 0; c < 3; c++) {
      // night facade: multiply toward the cool tint
      let v = D[i + c] * (1 - variant.dim) + D[i + c] * (DIM_TINT[c] / 255) * variant.dim;
      if (m > 0) {
        const boosted = Math.min(255, D[i + c] * BOOST);
        const tinted = boosted * (1 - WARM_MIX) + LIGHT[c] * WARM_MIX;
        v = v * (1 - m) + tinted * m;
      }
      // soft halo, then any lamp that fits inside the silhouette, screened over
      const ha = (bloom[i + 3] / 255) * HALO_ALPHA;
      if (ha > 0) v = 255 - ((255 - v) * (255 - HALO[c] * ha)) / 255;
      // Lamp pool: the art under it is brightened and warmed, plus a little haze.
      const p = pool[i / 4];
      if (p > 0) {
        v = Math.min(255, v * (1 + LAMP_POOL_GAIN * p * (LAMP_POOL_COLOR[c] / 255)));
        const haze = LAMP_POOL_COLOR[c] * p * LAMP_POOL_HAZE;
        v = 255 - ((255 - v) * (255 - haze)) / 255;
      }
      // Lamp head: screened on top, so the core goes near white.
      const h = head[i / 4];
      if (h > 0) v = 255 - ((255 - v) * (255 - LAMP_HEAD_COLOR[c] * h)) / 255;
      N[i + c] = Math.min(255, Math.round(v));
    }
    // silhouette must stay byte-identical to the day art
    N[i + 3] = D[i + 3];
  }
  return { raw: N, width: W, height: H, lit, kept, dropped };
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
  // Zone calibrations use discovery slot keys; textures use source filenames.
  // Reuse the game's sorter so preferred files, aliases and disabled art agree.
  const context = vm.createContext({ console, window: {} });
  for (const file of ['model-catalog.js', 'model-assets.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  }
  const configs = vm.runInContext('[...Object.entries(HOUSE_MODEL_SETS).map(([keyPrefix, config]) => ({ ...config, keyPrefix })), ...COMMERCIAL_BUILDING_MODEL_SETS, ...INDUSTRIAL_BUILDING_MODEL_SETS]', context);
  for (const config of configs) {
    const files = Object.keys(manifest.entries || {}).filter(p => p.startsWith(config.folder))
      .map(p => p.slice(config.folder.length)).filter(f => !f.includes('/') && !f.includes('__night'));
    context.bakeFiles = files; context.bakeConfig = config;
    const models = vm.runInContext('sortModelFiles(bakeFiles, bakeConfig)', context).map((file, index) => ({ key: `${config.keyPrefix}_${index}`, logicalPath: `${config.folder}${file.sourceFileName}` }));
    for (const model of models) {
      const entry = manifest.entries[model.logicalPath];
      if(entry?.packagedPath) bySlug.set(model.key, { logicalPath: model.logicalPath, entry });
    }
  }
  return bySlug;
}

async function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error('No staged manifest. Run `npm run prepare:release-assets` first.');
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const profiles = { ...bl.BUILDING_LIGHT_HERO_PROFILES };
  const wallProfiles = {};
  const dbPath = process.env.CITY_DB_PATH || path.join(ROOT, '.data', 'citybuilder.sqlite');
  const profileJsonPath = process.env.BAKE_PROFILE_JSON;
  const christmasOnly = process.env.BAKE_CHRISTMAS_ONLY === '1';
  if (profileJsonPath) {
    const parsed = JSON.parse(fs.readFileSync(profileJsonPath, 'utf8'));
    for (const [key, data] of Object.entries(parsed.entries || parsed)) {
      profiles[key.replace(/^@/, '')] = bl.makeBuildingLightProfile(data);
      wallProfiles[key.replace(/^@/, '')] = normalizeChristmasWalls(data.christmasWalls);
    }
  } else if (fs.existsSync(dbPath)) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      if(db.prepare("SELECT name FROM sqlite_master WHERE name='building_light_profiles'").get()) {
        for(const row of db.prepare('SELECT sprite_key, data FROM building_light_profiles').all()) {
          const data = JSON.parse(row.data), key = row.sprite_key.replace(/^@/, '');
          profiles[key] = bl.makeBuildingLightProfile(data);
          wallProfiles[key] = normalizeChristmasWalls(data.christmasWalls);
        }
      }
    } finally { db.close(); }
  }
  const staged = buildStagedIndex(manifest);
  const sampleOnly = (process.env.BAKE_SAMPLES || '').split(',').map((s) => s.trim()).filter(Boolean);
  const slugs = Object.keys(profiles).filter((s) => staged.has(s));
  const selected = sampleOnly.length ? slugs.filter((s) => sampleOnly.includes(s)) : slugs;
  const targets = christmasOnly ? selected.filter(s => wallProfiles[s]?.length) : selected;
  if(christmasOnly) {
    for(const [key,walls] of Object.entries(wallProfiles)) {
      if(walls.length && !staged.has(key)) throw new Error(`No staged model for Christmas calibration: ${key}`);
    }
    for(const key of targets) {
      const source = staged.get(key).entry.packagedPath.replace(/\.webp$/, '__nightdeep.webp');
      if(!fs.existsSync(path.join(STAGE_ROOT,source))) throw new Error(`Missing existing deep-night texture: ${source}`);
    }
  }

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
    const walls = wallProfiles[slug] || normalizeChristmasWalls(profiles[slug].christmasWalls);
    const christmasLogical = logicalPath.replace(/\.[^.]+$/, '__nightchristmas.png');
    // A removed calibration must also remove stale seasonal art from the manifest.
    if (!walls.length && manifest.entries[christmasLogical]) {
      const old = manifest.entries[christmasLogical];
      if(!sampleOnly.length) { fs.rmSync(path.join(STAGE_ROOT, old.packagedPath), { force: true }); delete manifest.entries[christmasLogical]; }
    }
    for (const variant of christmasOnly ? [] : VARIANTS) {
      const { raw, width, height, lit, kept, dropped } = await bakeOne(src, profiles[slug], variant);
      // Straight alpha: without the flag sharp unpremultiplies on encode and the glow halos
      // (semi-transparent) come out brighter and paler than baked.
      const img = sharp(raw, { raw: { width, height, channels: 4, premultiplied: false } });
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
      counts.push(`${variant.bucket} ${lit}w/${kept}L` + (dropped ? ` (${dropped} lamp(s) spill, dropped)` : ''));
      written += 1;
    }
    if(walls.length) {
      const deep = sampleOnly.length && !christmasOnly ? path.join(SAMPLE_DIR, `${slug}__nightdeep.png`) : path.join(STAGE_ROOT, entry.packagedPath.replace(/\.webp$/, '__nightdeep.webp'));
      const base = await sharp(deep).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const { width, height } = base.info;
      for(const wall of walls) {
        const packaged = manifest.entries[wall.asset]?.packagedPath;
        const art = await sharp(packaged ? path.join(STAGE_ROOT, packaged) : path.join(ROOT,wall.asset)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        compositeChristmasWall(base.data,width,height,art.data,art.info.width,art.info.height,wall.c);
      }
      const img = sharp(base.data,{ raw: { width,height,channels:4 } });
      if(sampleOnly.length) await img.png().toFile(path.join(SAMPLE_DIR,`${slug}__nightchristmas.png`));
      else {
        const packagedPath = entry.packagedPath.replace(/\.webp$/, '__nightchristmas.webp');
        await img.webp({ lossless:true }).toFile(path.join(STAGE_ROOT,packagedPath));
        manifest.entries[christmasLogical] = { logicalPath:christmasLogical,packagedPath,hash: require('crypto').createHash('sha256').update(base.data).digest('hex'),outputWidth:width,outputHeight:height };
      }
      written++;
    }
    console.log(`${slug}: ${christmasOnly ? `${walls.length} Christmas wall(s)` : counts.join(', ') + ' lit windows'}`);
  }
  if (!sampleOnly.length && written) {
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(`\n${written} texture(s)${sampleOnly.length ? ` -> ${path.relative(ROOT, SAMPLE_DIR)}` : ' baked into the staged tree + manifest'}.`);
  console.log(`dim=${VARIANTS.map((v) => v.dim).join('/')} boost=${BOOST} mix=${WARM_MIX} halo=${HALO_RADIUS}@${HALO_ALPHA} (window colour follows each profile's class)`);
}

main().catch((error) => {
  console.error('Night texture bake failed:', error);
  process.exitCode = 1;
});
