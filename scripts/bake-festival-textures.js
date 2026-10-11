// Bake the festival props (節慶素材) from the isometric-corrected sheets.
//
//   node scripts/bake-festival-textures.js [--only <id,id>] [--preview <png>]
//
// For every part in festival-assets.js this cuts the object out of its sheet (the whole sheet, or
// the solid pixels inside its rectangle), tones it (part.saturation), scales it and stands it on a
// power-of-two canvas, bottom-centred, with a little room round it for the night glow. It writes
//   Models/festivals/fx_<id>.png        day
//   Models/festivals/fx_<id>_m.png      the mirror image, for the other diagonal (part.mirror)
//   ..._<id>[_m]__lit.png, __litb.png   night, two twinkle frames (part.lit, renderFestivalNightPixels)
// and data/festival-textures.json: each texture's size and anchor (the bottom centre of the
// object, texture px) and the part's real size, for the runtime.
//
// A full bake owns the fx_*.png files in Models/festivals (Christmas/buildingDeco there is the
// building night bake's, not this one's). Re-stage after baking: npm run prepare:release-assets.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { nextPow2, loadRaw, labelComponents, cutPart, solidBounds, mirrorRGBA } = require('./lib/sheet-parts');

const ROOT = path.resolve(__dirname, '..');
const assets = require(path.join(ROOT, 'festival-assets.js'));

const SOURCE_DIR = path.join(ROOT, assets.FESTIVAL_SOURCE_DIR);
const OUT_DIR = path.join(ROOT, assets.FESTIVAL_TEXTURE_DIR);
const META_FILE = path.join(ROOT, 'data', 'festival-textures.json');
const args = process.argv.slice(2);
const argValue = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const ONLY = (argValue('--only') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PREVIEW = argValue('--preview');

// The corrected sheets are ~1000 px an object, about twice what any prop shows at in game; the
// release pipeline caps model textures at 512 px anyway (prepare-release-assets.js).
const SCALE = 0.5;
const MARGIN_SIDE = 0.04;
const MARGIN_TOP = 0.04;
const MARGIN_BOTTOM = 0.02;
const MARGIN_MIN = 8;
const POW2_FIT_SLACK = 1.25;

function cutWhole(img) {
  // the corrected sheets hold one object; drop the faint haze the renders leave round it
  const out = Buffer.from(img.data);
  for (let i = 3; i < out.length; i += 4) if (out[i] <= 20) out[i - 3] = out[i - 2] = out[i - 1] = out[i] = 0;
  return { data: out, width: img.width, height: img.height };
}

// The canvas a scaled object of sw x sh needs, margins included.
function canvasFor(sw, sh) {
  const side = Math.max(MARGIN_MIN, Math.round(sw * MARGIN_SIDE));
  const mTop = Math.max(MARGIN_MIN, Math.round(sh * MARGIN_TOP));
  const mBottom = Math.max(MARGIN_MIN, Math.round(sh * MARGIN_BOTTOM));
  return { side, mTop, mBottom, needW: sw + side * 2, needH: sh + mTop + mBottom };
}

async function layoutPart(cut, saturation) {
  const b = solidBounds(cut.data, cut.width, cut.height);
  if (b.maxX < 0) throw new Error('nothing solid to bake');
  const pad = 2;
  const left = Math.max(0, b.minX - pad);
  const top = Math.max(0, b.minY - pad);
  const cw = Math.min(cut.width, b.maxX + pad + 1) - left;
  const ch = Math.min(cut.height, b.maxY + pad + 1) - top;
  // a canvas side just over a power of two (up to POW2_FIT_SLACK) shrinks the object a little to
  // fit, instead of doubling the texture - the same rule as prepare-release-assets.js
  let scale = SCALE;
  for (let tries = 0; tries < 12; tries++) {
    const { needW, needH } = canvasFor(Math.round(cw * scale), Math.round(ch * scale));
    let k = 1;
    [needW, needH].forEach((v) => {
      const half = nextPow2(v) / 2;
      if (v > half && v <= half * POW2_FIT_SLACK) k = Math.min(k, half / v);
    });
    if (k === 1) break;
    scale *= Math.min(k, 0.995);
  }
  const sw = Math.max(1, Math.round(cw * scale));
  const sh = Math.max(1, Math.round(ch * scale));
  const scaled = await sharp(cut.data, { raw: { width: cut.width, height: cut.height, channels: 4, premultiplied: false } })
    .extract({ left, top, width: cw, height: ch })
    .resize(sw, sh, { kernel: 'lanczos3', fit: 'fill' })
    .raw().toBuffer();
  assets.applyFestivalSaturation(scaled, saturation);
  const { side, mTop, mBottom } = canvasFor(sw, sh);
  const W = nextPow2(sw + side * 2);
  const H = nextPow2(sh + mTop + mBottom);
  const ox = Math.round((W - sw) / 2);
  const oy = H - mBottom - sh; // spare power-of-two room goes on top, like the release padding
  const day = Buffer.alloc(W * H * 4);
  for (let y = 0; y < sh; y++) scaled.copy(day, ((y + oy) * W + ox) * 4, y * sw * 4, (y + 1) * sw * 4);
  const sb = solidBounds(day, W, H);
  return { day, W, H, anchor: { x: Math.round((sb.minX + sb.maxX + 1) / 2), y: sb.maxY + 1 }, top: sb.minY, left: sb.minX, right: sb.maxX + 1, sourceMapping: { left, top, sx: sw / cw, sy: sh / ch, ox, oy } };
}

async function writePng(data, W, H, rel) {
  await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width: W, height: H, channels: 4, premultiplied: false } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(ROOT, rel));
}

async function main() {
  const parts = assets.FESTIVAL_PARTS.filter((p) => !ONLY.length || ONLY.includes(p.id));
  if (ONLY.length && parts.length !== ONLY.length) {
    const unknown = ONLY.filter((id) => !assets.FESTIVAL_PARTS_BY_ID[id]);
    throw new Error(`unknown part id(s): ${unknown.join(', ')}`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!ONLY.length) {
    // a full bake owns its files: drop textures of parts that are gone
    const own = new RegExp(`^${assets.FESTIVAL_TEXTURE_PREFIX}.*\\.png$`);
    fs.readdirSync(OUT_DIR).filter((f) => own.test(f)).forEach((f) => fs.unlinkSync(path.join(OUT_DIR, f)));
  }
  const meta = fs.existsSync(META_FILE) && ONLY.length ? JSON.parse(fs.readFileSync(META_FILE, 'utf8')) : { textures: {} };
  meta.formatVersion = 1;
  meta.scale = SCALE;
  const sheets = new Map();
  const preview = [];
  for (const p of parts) {
    const sheetFile = path.join(SOURCE_DIR, p.sheet);
    if (!fs.existsSync(sheetFile)) throw new Error(`${p.id}: no corrected sheet ${path.relative(ROOT, sheetFile)} (run tools/correct.py)`);
    if (!sheets.has(p.sheet)) {
      const img = await loadRaw(sheetFile);
      sheets.set(p.sheet, { img, comps: p.rect ? labelComponents(img) : null });
    }
    const sheet = sheets.get(p.sheet);
    if (p.rect && !sheet.comps) sheet.comps = labelComponents(sheet.img);
    const cut = p.rect ? cutPart(sheet.img, sheet.comps, p.rect) : cutWhole(sheet.img);
    const baked = await layoutPart(cut, p.saturation);
    const { day, W, H, top, left, right, sourceMapping: m } = baked;
    const point = ([x,y]) => ({ x: (x-m.left)*m.sx+m.ox, y: (y-m.top)*m.sy+m.oy });
    const anchor = p.geometry?.anchor ? point(p.geometry.anchor) : baked.anchor;
    const axis = p.geometry?.axisPoints?.map(point);
    const person = p.geometry?.personPoints?.map(point);
    const personHeightPx = person ? Math.abs(person[1].y-person[0].y) : null;
    const groundSpanX = axis ? Math.abs(axis[1].x-axis[0].x) : null;
    for (const tex of assets.getFestivalPartTextures(p)) {
      const dayData = tex.mirrored ? mirrorRGBA(day, W, H) : day;
      const texAnchor = tex.mirrored ? { x: W - anchor.x, y: anchor.y } : anchor;
      await writePng(dayData, W, H, tex.file);
      const nightFiles = [];
      if (p.lit) {
        for (const frame of [0, 1]) {
          const night = assets.renderFestivalNightPixels(dayData, W, H, { frame });
          const file = tex.file.replace(/\.png$/, frame ? '__litb.png' : '__lit.png');
          await writePng(night, W, H, file);
          nightFiles.push(file);
        }
      }
      if (!tex.mirrored) preview.push({ day: tex.file, night: nightFiles[0] || null });
      meta.textures[path.basename(tex.file, '.png')] = {
        file: tex.file,
        part: p.id,
        festival: p.festival,
        width: W,
        height: H,
        anchor: texAnchor,
        top,
        // the art's opaque columns (a mirror's are mirrored): its width, for parts sized by lengthM
        left: tex.mirrored ? W - right : left,
        right: tex.mirrored ? W - left : right,
        mirrored: tex.mirrored,
        ...(groundSpanX ? { groundSpanX } : {}),
        ...(personHeightPx ? { personHeightPx, footprintM:p.geometry.footprintM, people:p.geometry.people } : {}),
        ...(p.heightM ? { heightM: p.heightM } : {}),
        ...(p.lengthM ? { lengthM: p.lengthM } : {}),
        ...(nightFiles.length ? { night: nightFiles } : {}),
      };
    }
    console.log(`${p.id}: ${W}x${H}${p.mirror ? ' +mirror' : ''}${p.lit ? ' +lit' : ''}`);
  }
  fs.mkdirSync(path.dirname(META_FILE), { recursive: true });
  meta.textures = Object.fromEntries(Object.entries(meta.textures).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(META_FILE, `${JSON.stringify(meta, null, 1)}\n`);
  console.log(`\n${parts.length} part(s) -> ${path.relative(ROOT, OUT_DIR)}; metadata ${path.relative(ROOT, META_FILE)}`);

  if (PREVIEW && preview.length) {
    const tile = 320;
    const tiles = [];
    for (const [i, item] of preview.entries()) {
      for (const [j, file] of [item.day, item.night].entries()) {
        if (!file) continue;
        const input = await sharp(path.join(ROOT, file)).resize(tile, tile, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
        tiles.push({ input, left: i * tile, top: j * tile });
      }
    }
    // day on a daylight grey, night on a night blue
    const bands = [
      { input: { create: { width: tile * preview.length, height: tile, channels: 4, background: '#b9bdb6' } }, left: 0, top: 0 },
      { input: { create: { width: tile * preview.length, height: tile, channels: 4, background: '#14233a' } }, left: 0, top: tile },
    ];
    await sharp({ create: { width: tile * preview.length, height: tile * 2, channels: 4, background: '#000' } })
      .composite([...bands, ...tiles]).png().toFile(PREVIEW);
    console.log(`preview: ${PREVIEW}`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
