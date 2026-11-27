#!/usr/bin/env node
// GPU-compressed building art for phones (Norton 2026-11-28: 可以點樣再減 texture).
//
// A phone holds every picture it draws as a texture: an RGBA picture is four bytes a pixel on the
// GPU whatever the file it came in. A big city's day art alone was ~280 MB of that. ASTC keeps the
// picture compressed on the GPU - 6x6 blocks are 16 bytes for 36 pixels, 3.56 bits a pixel, a ninth
// of RGBA - and the phone's GPU reads it as it draws. Almost every phone since 2015 has ASTC; a
// browser without it loads the WebP as before (compressed-textures-runtime.js decides).
//
// For each building picture this writes a KTX 1 file (what Phaser 3.60's KTX parser reads) that
// holds:
//   - the full mip chain down to 1x1, each level encoded on its own (WebGL 1 can only filter a
//     compressed texture with mipmaps when every level is there; it cannot make them itself);
//   - colours premultiplied by alpha, as Phaser draws (an image is premultiplied when it is
//     uploaded; compressed data cannot be, so it is done here);
//   - a quarter-size alpha mask (key/value "HSAlphaMask"): the game tests clicks and a few placements
//     against a picture's pixels, and a compressed texture's pixels cannot be read back;
// and gzips it (the host does not compress unknown types; ASTC of a sprite with clear corners shrinks
// to ~40%, smaller than the lossless WebP it replaces).
//
// The encoder is ARM's astcenc (Apache-2.0), fetched once per machine at a pinned version and
// checked against its published SHA-256. Results are cached by source hash in .data/astc-cache.
//
//   node scripts/compressed-textures.js <in.webp|png> <out.ktxz> [6x6]   (one picture, for checks)

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { execFileSync, execFile } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ASTCENC_VERSION = '5.7.1';
const ASTCENC_RELEASES = {
  'darwin-arm64': { zip: 'macos-universal', sha256: 'cb2dd75e33fcc12ebaae9e2230649e30da10c152b029a6d2f3440f6d45ed5c45', bins: ['astcenc'] },
  'darwin-x64': { zip: 'macos-universal', sha256: 'cb2dd75e33fcc12ebaae9e2230649e30da10c152b029a6d2f3440f6d45ed5c45', bins: ['astcenc'] },
  'linux-x64': { zip: 'linux-x64', sha256: 'f1d576f0801e7701548da78d782f4bf70dfde3673a238d1a2ac0ebd3511b2f37', bins: ['astcenc-avx2', 'astcenc-sse4.1', 'astcenc-sse2'] },
  'linux-arm64': { zip: 'linux-arm64', sha256: 'd87287e02e3fd335334dace5a6a1ffcb705ed5aa9d5a5c5624fa50860f665fde', bins: ['astcenc'] },
  'win32-x64': { zip: 'windows-x64', sha256: '117ed7cc2b0cc4f3d5774eaa1bde3a2ba75695c2f490e84e4a08d1726c963db8', bins: ['astcenc-avx2.exe', 'astcenc-sse4.1.exe', 'astcenc-sse2.exe'] },
};

// The block size and effort every compressed picture is made with. 6x6 looks like the original at
// the size the game draws a building, a ninth of the memory (Norton 2026-11-28 comparison sheet).
const COMPRESSED_TEXTURE_SETTINGS = Object.freeze({ format: 'astc', block: '6x6', quality: '-medium', maskScale: 4 });
// (bump when the file layout or the way it is made changes: cached results are keyed by it)
const COMPRESSED_TEXTURE_LAYOUT = 1;
const ASTC_INTERNAL_FORMATS = { '4x4': 0x93B0, '5x5': 0x93B2, '6x6': 0x93B4, '8x8': 0x93B7 };
const GL_RGBA = 0x1908;
const KTX_IDENTIFIER = Buffer.from([0xAB, 0x4B, 0x54, 0x58, 0x20, 0x31, 0x31, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A]);
const ALPHA_MASK_KEY = 'HSAlphaMask';

// The building pictures a phone draws compressed: zone buildings, landmarks and public buildings,
// and the night art a phone uses (day-night-lighting.js resolveBuildingNightVariantForDevice).
// Anything whose pixels the game reads to draw something else (bridge, metro, tram, festival and
// shelter art) stays an image.
const COMPRESSED_MODEL_FOLDERS = new Set([
  'airPort', 'busDepot', 'commercial', 'containerPort', 'government', 'industrial', 'parks',
  'powerStation', 'publicMarket', 'residential', 'specialSites',
]);
function isCompressedModelTexture(logicalPath) {
  const parts = String(logicalPath).split('/');
  if (parts[0] !== 'Models' || !COMPRESSED_MODEL_FOLDERS.has(parts[1])) return false;
  const variant = /__night([a-z]*)\.[^.]+$/.exec(logicalPath);
  return !variant || ['', 'deep', 'christmas'].includes(variant[1]);
}

function astcenc() {
  if (process.env.ASTCENC) return process.env.ASTCENC;
  const release = ASTCENC_RELEASES[`${process.platform}-${process.arch}`];
  if (!release) throw new Error(`No astcenc ${ASTCENC_VERSION} build for ${process.platform}-${process.arch}: set ASTCENC to one`);
  const dir = path.join(ROOT, '.data', 'tools', `astcenc-${ASTCENC_VERSION}-${release.zip}`);
  const usable = () => release.bins.map((bin) => path.join(dir, 'bin', bin)).find((bin) => {
    if (!fs.existsSync(bin)) return false;
    try { execFileSync(bin, ['-help'], { stdio: 'ignore' }); return true; } catch { return false; }
  });
  let bin = usable();
  if (bin) return bin;
  const name = `astcenc-${ASTCENC_VERSION}-${release.zip}.zip`;
  const url = `https://github.com/ARM-software/astc-encoder/releases/download/${ASTCENC_VERSION}/${name}`;
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, name);
  execFileSync('curl', ['-fsSL', '--retry', '3', '-o', zip, url], { stdio: 'inherit' });
  const digest = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
  if (digest !== release.sha256) { fs.rmSync(zip, { force: true }); throw new Error(`${name}: SHA-256 ${digest} is not the published one`); }
  if (process.platform === 'win32') execFileSync('tar', ['-xf', zip, '-C', dir]);
  else execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
  fs.rmSync(zip, { force: true });
  release.bins.forEach((b) => { try { fs.chmodSync(path.join(dir, 'bin', b), 0o755); } catch {} });
  bin = usable();
  if (!bin) throw new Error(`astcenc ${ASTCENC_VERSION} does not run here`);
  return bin;
}

// A quarter-size map of the picture's alpha, each cell the most opaque pixel under it: a click
// test at a cell answers "is any of this picture here".
function alphaMask(rgba, width, height, scale) {
  const w = Math.max(1, Math.ceil(width / scale)), h = Math.max(1, Math.ceil(height / scale));
  const mask = Buffer.alloc(w * h);
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / scale) * w;
    for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3];
      const cell = row + Math.floor(x / scale);
      if (a > mask[cell]) mask[cell] = a;
    }
  }
  return { w, h, scale, data: mask };
}

function keyValue(key, value) {
  const body = Buffer.concat([Buffer.from(`${key}\0`, 'utf8'), value]);
  const pad = (4 - (body.length % 4)) % 4;
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  return Buffer.concat([size, body, Buffer.alloc(pad)]);
}

function writeKtx({ internalFormat, width, height, levels, keyValues = [] }) {
  const kv = Buffer.concat(keyValues);
  const header = Buffer.alloc(52);
  [0x04030201, 0, 1, 0, internalFormat, GL_RGBA, width, height, 0, 0, 1, levels.length, kv.length]
    .forEach((v, i) => header.writeUInt32LE(v, i * 4));
  const parts = [KTX_IDENTIFIER, header, kv];
  levels.forEach((data) => {
    const size = Buffer.alloc(4);
    size.writeUInt32LE(data.length);
    parts.push(size, data, Buffer.alloc((4 - (data.length % 4)) % 4));
  });
  return Buffer.concat(parts);
}

// What a KTX file says (for tests and checks): its size, format, levels and the alpha mask.
function readKtx(buffer) {
  if (!buffer.subarray(0, 12).equals(KTX_IDENTIFIER)) throw new Error('not a KTX 1 file');
  const u32 = (i) => buffer.readUInt32LE(12 + i * 4);
  const out = { internalFormat: u32(4), width: u32(6), height: u32(7), levels: [], keyValues: {} };
  const levelCount = u32(11), kvBytes = u32(12);
  let at = 64;
  const kvEnd = at + kvBytes;
  while (at < kvEnd) {
    const size = buffer.readUInt32LE(at);
    const body = buffer.subarray(at + 4, at + 4 + size);
    const nul = body.indexOf(0);
    out.keyValues[body.subarray(0, nul).toString('utf8')] = body.subarray(nul + 1);
    at += 4 + size + ((4 - (size % 4)) % 4);
  }
  at = kvEnd;
  for (let i = 0; i < levelCount; i++) {
    const size = buffer.readUInt32LE(at);
    out.levels.push(buffer.subarray(at + 4, at + 4 + size));
    at += 4 + size + ((4 - (size % 4)) % 4);
  }
  return out;
}

function encodeAlphaMask(mask) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(mask.w, 0);
  head.writeUInt16LE(mask.h, 2);
  head.writeUInt16LE(mask.scale, 4);
  return Buffer.concat([head, mask.data]);
}

function run(bin, args) {
  return new Promise((resolve, reject) => execFile(bin, args, { maxBuffer: 1 << 20 }, (error, stdout, stderr) => (
    error ? reject(new Error(`${path.basename(bin)} ${args.slice(0, 3).join(' ')}: ${stderr || error.message}`)) : resolve()
  )));
}

// One picture (any format sharp reads) to a gzipped KTX of ASTC blocks.
async function compressTexture(input, settings = COMPRESSED_TEXTURE_SETTINGS, options = {}) {
  const sharp = require('sharp');
  const bin = options.astcenc || astcenc();
  const internalFormat = ASTC_INTERNAL_FORMATS[settings.block];
  if (!internalFormat) throw new Error(`Unsupported ASTC block ${settings.block}`);
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const mask = alphaMask(data, width, height, settings.maskScale);
  const work = fs.mkdtempSync(path.join(options.tmpDir || os.tmpdir(), 'hs-astc-'));
  try {
    const levels = [];
    let level = { data, w: width, h: height };
    for (let i = 0; ; i++) {
      const png = path.join(work, `${i}.png`), astc = path.join(work, `${i}.astc`);
      await sharp(level.data, { raw: { width: level.w, height: level.h, channels: 4 } }).png({ compressionLevel: 1 }).toFile(png);
      await run(bin, ['-cl', png, astc, settings.block, settings.quality, '-pp-premultiply', '-silent', '-j', String(options.threads || 2)]);
      levels.push(fs.readFileSync(astc).subarray(16)); // (the .astc header: magic, block, size)
      if (level.w === 1 && level.h === 1) break;
      const w = Math.max(1, level.w >> 1), h = Math.max(1, level.h >> 1);
      // (sharp resizes in premultiplied space, as a GPU's mipmaps are)
      const next = await sharp(level.data, { raw: { width: level.w, height: level.h, channels: 4 } })
        .resize(w, h, { kernel: 'mitchell', fit: 'fill' }).raw().toBuffer();
      level = { data: next, w, h };
    }
    const ktx = writeKtx({ internalFormat, width, height, levels, keyValues: [keyValue(ALPHA_MASK_KEY, encodeAlphaMask(mask))] });
    return zlib.gzipSync(ktx, { level: 9 });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// compressTexture with a cache by the source's bytes, the settings and the file layout.
async function compressTextureCached(file, settings = COMPRESSED_TEXTURE_SETTINGS, options = {}) {
  const cacheDir = options.cacheDir || path.join(ROOT, '.data', 'astc-cache');
  const source = fs.readFileSync(file);
  const key = crypto.createHash('sha256').update(source)
    .update(JSON.stringify([COMPRESSED_TEXTURE_LAYOUT, ASTCENC_VERSION, settings])).digest('hex');
  const cached = path.join(cacheDir, `${key}.ktxz`);
  if (fs.existsSync(cached)) return { data: fs.readFileSync(cached), cached: true };
  const data = await compressTexture(source, settings, options);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(`${cached}.tmp`, data);
  fs.renameSync(`${cached}.tmp`, cached);
  return { data, cached: false };
}

// Many pictures, a few at a time (astcenc uses threads of its own too).
async function compressTextures(files, onDone, options = {}) {
  const bin = astcenc();
  const parallel = options.parallel || Math.max(1, Math.floor(os.cpus().length / 2));
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const index = next++;
      const result = await compressTextureCached(files[index], COMPRESSED_TEXTURE_SETTINGS, { ...options, astcenc: bin });
      await onDone(files[index], result, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, files.length) }, worker));
}

module.exports = {
  COMPRESSED_TEXTURE_SETTINGS, COMPRESSED_MODEL_FOLDERS, ALPHA_MASK_KEY, ASTC_INTERNAL_FORMATS,
  isCompressedModelTexture, astcenc, alphaMask, writeKtx, readKtx, keyValue, encodeAlphaMask,
  compressTexture, compressTextureCached, compressTextures,
};

if (require.main === module) {
  const [input, output, block] = process.argv.slice(2);
  if (!input || !output) { console.error('usage: node scripts/compressed-textures.js <in> <out.ktxz> [6x6]'); process.exit(2); }
  const settings = { ...COMPRESSED_TEXTURE_SETTINGS, ...(block ? { block } : {}) };
  compressTexture(input, settings).then((data) => {
    fs.writeFileSync(output, data);
    const ktx = readKtx(zlib.gunzipSync(data));
    console.log(`${output}: ${ktx.width}x${ktx.height}, ${ktx.levels.length} levels, ${(ktx.levels.reduce((s, l) => s + l.length, 0) / 1024).toFixed(0)} KB on the GPU, ${(data.length / 1024).toFixed(0)} KB to download`);
  }).catch((error) => { console.error(error); process.exit(1); });
}
