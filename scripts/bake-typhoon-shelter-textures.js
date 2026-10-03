// Bake the 避風塘 textures from the isometric-corrected source sheets.
//
//   node scripts/bake-typhoon-shelter-textures.js [--only <id,id>] [--preview <png>] [--apply-warps]
//
// A part calibrated with an art warp (避風塘素材校準: 上下伸縮 / 上下斜 / 左右斜) is drawn through
// it at runtime from a non-power-of-two canvas. --apply-warps bakes those warps into the textures:
// each such part is re-baked through its warp, its ground corners and top are converted into the
// new texture's pixels, and the warp moves from part.warp (runtime) to part.bake (applied by every
// later bake, so a re-bake from the sheets gives the same art) in data/typhoon-shelter-placement.json.
//
// For every part in typhoon-shelter-assets.js this cuts the object out of its sheet (only the
// pixels of the object itself - neighbouring props on a sheet overlap each other's rectangles),
// scales it, and stands it on a power-of-two canvas with room around it for night light: a little
// at the sides and top for lamp blooms, more below for the reflections on the water. It writes
//   Models/typhoonShelter/ts_<id>.png      day
//   Models/typhoonShelter/ts_<id>_m.png    the mirror image, for the other diagonal (part.mirror)
// and, for parts with a sea light profile (scripts/source-art/typhoonShelter/sea-lights.json,
// edited with the 海上燈光校正 tool), the two twinkle frames of the night art:
//   ..._<id>[_m]__lit.png, ..._<id>[_m]__litb.png
// The night art is drawn by sea-lighting.js, the same code the calibrator previews with. A
// mirrored texture uses the profile mirrored, so each view is calibrated once.
//
// data/typhoon-shelter-textures.json records each texture's size and anchor (the bottom centre
// of the object - its keel or footing - in texture pixels) for the runtime.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const assets = require(path.join(ROOT, 'typhoon-shelter-assets.js'));
const seaLighting = require(path.join(ROOT, 'sea-lighting.js'));

const SOURCE_DIR = path.join(ROOT, assets.TYPHOON_SHELTER_SOURCE_DIR);
const OUT_DIR = path.join(ROOT, assets.TYPHOON_SHELTER_TEXTURE_DIR);
const LIGHTS_FILE = path.join(SOURCE_DIR, 'sea-lights.json');
const META_FILE = path.join(ROOT, 'data', 'typhoon-shelter-textures.json');
const PLACEMENT_FILE = path.join(ROOT, 'data', 'typhoon-shelter-placement.json');
const args = process.argv.slice(2);
const argValue = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const ONLY = (argValue('--only') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PREVIEW = argValue('--preview');
const APPLY_WARPS = args.includes('--apply-warps');

// The sheets are drawn ~2x the size anything is shown in game; the release pipeline caps model
// textures at 512 px anyway (prepare-release-assets.js).
const SCALE = 0.5;
const SOLID_ALPHA = 30;
const MARGIN_SIDE = 0.08;   // of the object's width
const MARGIN_TOP = 0.06;    // of its height
const MARGIN_BOTTOM = 0.24; // of its height: the reflections hang below the hull
const MARGIN_MIN = 16;

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

// 2x3 affine maps { a, b, c, d, e, f }: X = a x + b y + e, Y = c x + d y + f.
const IDENTITY_LINEAR = Object.freeze([1, 0, 0, 1]);
const affine = (m, [x, y]) => [m.a * x + m.b * y + m.e, m.c * x + m.d * y + m.f];
function invertAffine(m) {
  const det = m.a * m.d - m.b * m.c;
  const a = m.d / det; const b = -m.b / det; const c = -m.c / det; const d = m.a / det;
  return { a, b, c, d, e: -(a * m.e + b * m.f), f: -(c * m.e + d * m.f) };
}
const isIdentityLinear = (L) => L.every((v, i) => Math.abs(v - IDENTITY_LINEAR[i]) < 1e-9);

// RGBA through the linear map L = [a, b, c, d] (X = a x + b y, Y = c x + d y), sampled bilinearly
// on premultiplied colour so transparent pixels never bleed a fringe into the edges. Returns the
// image, its size, and where the source origin landed ({ minX, minY }: X_out = L(x) - min).
function warpRGBA(src, W, H, L) {
  const [a, b, c, d] = L;
  const pts = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => [a * x + b * y, c * x + d * y]);
  const minX = Math.floor(Math.min(...pts.map((p) => p[0])));
  const minY = Math.floor(Math.min(...pts.map((p) => p[1])));
  const OW = Math.ceil(Math.max(...pts.map((p) => p[0]))) - minX;
  const OH = Math.ceil(Math.max(...pts.map((p) => p[1]))) - minY;
  const det = a * d - b * c;
  const ia = d / det; const ib = -b / det; const ic = -c / det; const id = a / det;
  const out = Buffer.alloc(OW * OH * 4);
  const px = (x, y, ch) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : src[(y * W + x) * 4 + ch]);
  for (let Y = 0; Y < OH; Y++) {
    for (let X = 0; X < OW; X++) {
      const gx = X + 0.5 + minX;
      const gy = Y + 0.5 + minY;
      const sx = ia * gx + ib * gy - 0.5;
      const sy = ic * gx + id * gy - 0.5;
      const x0 = Math.floor(sx); const y0 = Math.floor(sy);
      if (x0 < -1 || y0 < -1 || x0 >= W || y0 >= H) continue;
      const fx = sx - x0; const fy = sy - y0;
      const w = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      const taps = [[x0, y0], [x0 + 1, y0], [x0, y0 + 1], [x0 + 1, y0 + 1]];
      let A = 0; let R = 0; let G = 0; let B = 0;
      taps.forEach(([tx, ty], i) => {
        const al = px(tx, ty, 3) * w[i];
        A += al; R += px(tx, ty, 0) * al; G += px(tx, ty, 1) * al; B += px(tx, ty, 2) * al;
      });
      if (A < 0.5) continue;
      const o = (Y * OW + X) * 4;
      out[o] = Math.round(R / A); out[o + 1] = Math.round(G / A); out[o + 2] = Math.round(B / A);
      out[o + 3] = Math.round(A);
    }
  }
  return { data: out, width: OW, height: OH, minX, minY };
}

// Scale the cut-out (and warp it through the part's baked linear map L, if any) and stand it on
// its canvas. Returns the day RGBA, the anchor, and `toTexture` - the affine map from the scaled
// cut-out's pixels to the texture's, which --apply-warps converts calibration points with.
async function layoutPart(cut, L = IDENTITY_LINEAR) {
  const b = solidBounds(cut.data, cut.width, cut.height);
  const pad = 2;
  const left = Math.max(0, b.minX - pad);
  const top = Math.max(0, b.minY - pad);
  const cw = Math.min(cut.width, b.maxX + pad + 1) - left;
  const ch = Math.min(cut.height, b.maxY + pad + 1) - top;
  const sw0 = Math.max(1, Math.round(cw * SCALE));
  const sh0 = Math.max(1, Math.round(ch * SCALE));
  let scaled = await sharp(cut.data, { raw: { width: cut.width, height: cut.height, channels: 4, premultiplied: false } })
    .extract({ left, top, width: cw, height: ch })
    .resize(sw0, sh0, { kernel: 'lanczos3', fit: 'fill' })
    .raw().toBuffer();
  let sw = sw0;
  let sh = sh0;
  let toScaled = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  if (!isIdentityLinear(L)) {
    const warped = warpRGBA(scaled, sw0, sh0, L);
    // trim the empty corners a skew leaves
    const wb = solidBounds(warped.data, warped.width, warped.height);
    const tl = Math.max(0, wb.minX - pad);
    const tt = Math.max(0, wb.minY - pad);
    sw = Math.min(warped.width, wb.maxX + pad + 1) - tl;
    sh = Math.min(warped.height, wb.maxY + pad + 1) - tt;
    scaled = Buffer.alloc(sw * sh * 4);
    for (let y = 0; y < sh; y++) warped.data.copy(scaled, y * sw * 4, ((y + tt) * warped.width + tl) * 4, ((y + tt) * warped.width + tl + sw) * 4);
    toScaled = { a: L[0], b: L[1], c: L[2], d: L[3], e: -warped.minX - tl, f: -warped.minY - tt };
  }
  const side = Math.max(MARGIN_MIN, Math.round(sw * MARGIN_SIDE));
  const mTop = Math.max(MARGIN_MIN, Math.round(sh * MARGIN_TOP));
  const mBottom = Math.max(MARGIN_MIN, Math.round(sh * MARGIN_BOTTOM));
  const W = nextPow2(sw + side * 2);
  const H = nextPow2(sh + mTop + mBottom);
  const ox = Math.round((W - sw) / 2);
  const oy = H - mBottom - sh; // spare power-of-two room goes on top, like the release padding
  const day = Buffer.alloc(W * H * 4);
  for (let y = 0; y < sh; y++) scaled.copy(day, ((y + oy) * W + ox) * 4, y * sw * 4, (y + 1) * sw * 4);
  const sb = solidBounds(day, W, H);
  const toTexture = { ...toScaled, e: toScaled.e + ox, f: toScaled.f + oy };
  return { day, W, H, anchor: { x: Math.round((sb.minX + sb.maxX + 1) / 2), y: sb.maxY + 1 }, toTexture };
}

function mirrorRGBA(data, W, H) {
  const out = Buffer.alloc(data.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) data.copy(out, (y * W + (W - 1 - x)) * 4, (y * W + x) * 4, (y * W + x) * 4 + 4);
  }
  return out;
}

async function writePng(data, W, H, rel) {
  await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width: W, height: H, channels: 4, premultiplied: false } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(ROOT, rel));
}

function readPlacement() {
  return fs.existsSync(PLACEMENT_FILE) ? JSON.parse(fs.readFileSync(PLACEMENT_FILE, 'utf8')) : { parts: {}, objects: {} };
}

// Same layout as the calibrator's save (server.js /api/dev/typhoon-shelter-placement).
function writePlacement(data) {
  const sort = (o) => Object.fromEntries(Object.keys(o || {}).sort().map((k) => [k, o[k]]));
  fs.writeFileSync(PLACEMENT_FILE, `${JSON.stringify({ schemaVersion: 1, parts: sort(data.parts), objects: sort(data.objects) }, null, 1)}\n`);
}

// The part's baked linear map: the warps applied by earlier --apply-warps runs.
function getBakedLinear(part) {
  const m = part?.bake?.m;
  return Array.isArray(m) && m.length === 4 && m.every(Number.isFinite) ? m : IDENTITY_LINEAR;
}

function readLightProfiles() {
  if (!fs.existsSync(LIGHTS_FILE)) return {};
  const parsed = JSON.parse(fs.readFileSync(LIGHTS_FILE, 'utf8'));
  return parsed?.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
}

async function main() {
  const parts = assets.TYPHOON_SHELTER_PARTS.filter((p) => !ONLY.length || ONLY.includes(p.id));
  if (ONLY.length && parts.length !== ONLY.length) {
    const unknown = ONLY.filter((id) => !assets.TYPHOON_SHELTER_PARTS_BY_ID[id]);
    throw new Error(`unknown part id(s): ${unknown.join(', ')}`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // the textures the calibration was done on, measured before a full bake clears the folder
  const onDiskSize = new Map();
  if (APPLY_WARPS) {
    for (const p of parts) {
      const file = path.join(ROOT, assets.getTyphoonShelterTexturePath(p.id));
      if (fs.existsSync(file)) { const m = await sharp(file).metadata(); onDiskSize.set(p.id, [m.width, m.height]); }
    }
  }
  if (!ONLY.length) {
    // a full bake owns the folder: drop textures of parts or light profiles that are gone
    fs.readdirSync(OUT_DIR).filter((f) => /^ts_.*\.png$/.test(f)).forEach((f) => fs.unlinkSync(path.join(OUT_DIR, f)));
  }
  const profiles = readLightProfiles();
  const placement = readPlacement();
  const applied = [];
  if (APPLY_WARPS && Object.keys(profiles).length) {
    throw new Error('--apply-warps does not convert sea light profiles yet; bake the warps before calibrating lights');
  }
  const meta = fs.existsSync(META_FILE) && ONLY.length ? JSON.parse(fs.readFileSync(META_FILE, 'utf8')) : { textures: {} };
  meta.formatVersion = 1;
  meta.scale = SCALE;
  const sheets = new Map();
  const preview = [];
  let lit = 0;
  for (const p of parts) {
    if (!sheets.has(p.sheet)) {
      const img = await loadRaw(path.join(SOURCE_DIR, p.sheet));
      sheets.set(p.sheet, { img, comps: labelComponents(img) });
    }
    const { img, comps } = sheets.get(p.sheet);
    const cut = cutPart(img, comps, p.rect);
    const part = placement.parts[p.id];
    let linear = getBakedLinear(part);
    const warp = APPLY_WARPS && part?.warp ? assets.normalizeTyphoonShelterWarp(part.warp) : null;
    let convert = null;
    if (warp && !assets.isTyphoonShelterWarpIdentity(warp)) {
      // the art as calibrated (the texture on disk, through `linear`) and as it will be
      const before = await layoutPart(cut, linear);
      const [dw, dh] = onDiskSize.get(p.id) || [];
      if (dw !== before.W || dh !== before.H) {
        throw new Error(`${p.id}: the texture on disk (${dw}x${dh}) is not this bake's (${before.W}x${before.H}); bake once without --apply-warps first`);
      }
      // the runtime warp's linear part, [[1, -h], [s, k]], after what is baked already
      const M = [1, -warp.h, warp.s, warp.k];
      linear = [
        M[0] * linear[0] + M[1] * linear[2], M[0] * linear[1] + M[1] * linear[3],
        M[2] * linear[0] + M[3] * linear[2], M[2] * linear[1] + M[3] * linear[3],
      ];
      convert = before.toTexture;
    }
    const { day, W, H, anchor, toTexture } = await layoutPart(cut, linear);
    if (convert) {
      const map = (pt) => affine(toTexture, affine(invertAffine(convert), pt));
      const r1 = ([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
      const next = { ...part };
      if (part.ground) next.ground = { left: r1(map(part.ground.left)), front: r1(map(part.ground.front)), right: r1(map(part.ground.right)) };
      if (Number.isFinite(part.top) && part.ground) next.top = r1(map([part.ground.front[0], part.top]))[1];
      delete next.warp;
      next.bake = { m: linear.map((v) => Math.round(v * 1e6) / 1e6) };
      placement.parts[p.id] = next;
      applied.push(p.id);
    }
    const profile = profiles[p.id] ? seaLighting.normalizeSeaLightProfile(profiles[p.id]) : null;
    const hasLights = profile && !seaLighting.isSeaLightProfileEmpty(profile);
    for (const tex of assets.getTyphoonShelterPartTextures(p)) {
      const dayData = tex.mirrored ? mirrorRGBA(day, W, H) : day;
      const texAnchor = tex.mirrored ? { x: W - anchor.x, y: anchor.y } : anchor;
      await writePng(dayData, W, H, tex.file);
      const key = path.basename(tex.file, '.png');
      const nightFiles = [];
      ['__lit', '__litb'].forEach((suffix) => {
        const f = path.join(ROOT, tex.file.replace(/\.png$/, `${suffix}.png`));
        if (fs.existsSync(f)) fs.unlinkSync(f);
      });
      if (hasLights) {
        const texProfile = tex.mirrored ? seaLighting.mirrorSeaLightProfile(profile) : profile;
        for (const frame of [0, 1]) {
          const night = seaLighting.renderSeaNightPixels(dayData, W, H, texProfile, { frame });
          const file = tex.file.replace(/\.png$/, frame ? '__litb.png' : '__lit.png');
          await writePng(night, W, H, file);
          nightFiles.push(file);
        }
        lit += 1;
        if (!tex.mirrored) preview.push({ day: tex.file, night: nightFiles[0], W, H });
      }
      meta.textures[key] = {
        file: tex.file,
        part: p.id,
        width: W,
        height: H,
        anchor: texAnchor,
        mirrored: tex.mirrored,
        ...(tex.facing ? { facing: tex.facing } : {}),
        ...(nightFiles.length ? { night: nightFiles } : {}),
      };
    }
    console.log(`${p.id}: ${W}x${H}${p.mirror ? ' +mirror' : ''}${hasLights ? ` · ${profile.lamps.length} lamp(s), ${profile.areas.length} area(s)` : ''}`);
  }
  if (applied.length) {
    writePlacement(placement);
    console.log(`\nbaked the warps of ${applied.length} part(s) into their textures: ${applied.join(', ')}`);
  }
  const pending = Object.entries(placement.parts).filter(([, pt]) => pt?.warp && !assets.isTyphoonShelterWarpIdentity(pt.warp)).map(([id]) => id);
  if (pending.length) console.log(`runtime warps not baked (run with --apply-warps): ${pending.join(', ')}`);
  fs.mkdirSync(path.dirname(META_FILE), { recursive: true });
  meta.textures = Object.fromEntries(Object.entries(meta.textures).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(META_FILE, `${JSON.stringify(meta, null, 1)}\n`);
  console.log(`\n${parts.length} part(s) -> ${path.relative(ROOT, OUT_DIR)}; ${lit} lit texture(s); metadata ${path.relative(ROOT, META_FILE)}`);
  const missing = [...new Set(assets.TYPHOON_SHELTER_PARTS.filter((p) => p.facing).map((p) => p.sheet.replace(/\.png$/, '')))]
    .map((sheet) => [sheet, assets.getTyphoonShelterMissingHeadings(sheet)])
    .filter(([, m]) => m.length);
  if (missing.length) console.log(`boats without art for some headings: ${missing.map(([s, m]) => `${s} (${m.join('/')})`).join(', ')}`);

  if (PREVIEW && preview.length) {
    const tile = 256;
    const tiles = [];
    for (const [i, item] of preview.entries()) {
      for (const [j, file] of [item.day, item.night].entries()) {
        const input = await sharp(path.join(ROOT, file)).resize(tile, tile, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
        tiles.push({ input, left: j * tile, top: i * tile });
      }
    }
    await sharp({ create: { width: tile * 2, height: tile * preview.length, channels: 4, background: '#1b3550' } })
      .composite(tiles).png().toFile(PREVIEW);
    console.log(`preview: ${PREVIEW}`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
