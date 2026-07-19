#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(ROOT, 'Models');
const DATA_ROOT = path.join(ROOT, '.data');
const STAGE_ROOT = path.join(DATA_ROOT, 'package-assets');
const NEXT_STAGE_ROOT = path.join(DATA_ROOT, 'package-assets.next');
const CACHE_ROOT = path.join(DATA_ROOT, 'webp-cache');
const MAX_DIMENSION = Number(process.env.ASSET_MAX_DIMENSION || 1024);
// Bump whenever pixel processing changes so cached WebP files cannot retain an
// older matte-removal, resize, padding, or encoder result.
const SETTINGS_VERSION = 5;
const SOURCE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    const fullPath = path.join(root, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function nextPowerOfTwo(value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError('Texture dimensions must be positive integers.');
  }
  return 2 ** Math.ceil(Math.log2(value));
}

function getPowerOfTwoPadding(width, height) {
  const outputWidth = nextPowerOfTwo(width);
  const outputHeight = nextPowerOfTwo(height);
  const horizontal = outputWidth - width;
  const vertical = outputHeight - height;
  const left = Math.floor(horizontal / 2);
  const right = horizontal - left;

  // Keep the old bottom-centre sprite origin stable. Zone-model anchors are
  // read from the padded geometry, while fixed models and trees commonly use
  // setOrigin(0.5, 1) and therefore also remain aligned.
  return {
    left,
    top: vertical,
    right,
    bottom: 0,
    outputWidth,
    outputHeight,
  };
}

function findAlphaBounds(data, width, height, threshold = 1) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < threshold) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < left || bottom < top) return { left: 0, top: 0, width, height };
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function findGeometry(data, width, height, threshold = 20) {
  let minX = width;
  let maxX = -1;
  let bottomY = -1;
  const rows = [];
  for (let y = 0; y < height; y++) {
    let count = 0;
    let xTotal = 0;
    let rowMinX = width;
    let rowMaxX = -1;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= threshold) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      bottomY = y;
      count++;
      xTotal += x;
      rowMinX = Math.min(rowMinX, x);
      rowMaxX = Math.max(rowMaxX, x);
    }
    if (count > 0) rows.push({ y, count, xTotal, minX: rowMinX, maxX: rowMaxX });
  }
  if (bottomY < 0) return null;
  const maxCount = Math.max(...rows.map((row) => row.count));
  const baseThreshold = Math.max(6, Math.floor(maxCount * 0.08));
  const stableBaseY = rows.filter((row) => row.count >= baseThreshold).at(-1)?.y ?? bottomY;
  const baseRows = rows.filter((row) => row.y >= stableBaseY - 3 && row.y <= stableBaseY && row.count >= baseThreshold);
  const bottomXCount = baseRows.reduce((sum, row) => sum + row.count, 0);
  const bottomXTotal = baseRows.reduce((sum, row) => sum + row.xTotal, 0);
  const lowestRows = rows.filter((row) => row.y === bottomY);
  const lowestCount = lowestRows.reduce((sum, row) => sum + row.count, 0);
  return {
    minX,
    maxX,
    bottomY,
    stableBaseY,
    bottomX: bottomXCount ? bottomXTotal / bottomXCount : (minX + maxX) / 2,
    leftBaseX: baseRows.reduce((value, row) => Math.min(value, row.minX), width),
    lowestCornerX: lowestCount
      ? lowestRows.reduce((sum, row) => sum + row.xTotal, 0) / lowestCount
      : (minX + maxX) / 2,
  };
}

async function prepareFile(sourcePath) {
  const sourceBuffer = fs.readFileSync(sourcePath);
  const relativeFromModels = normalizePath(path.relative(SOURCE_ROOT, sourcePath));
  const logicalPath = `Models/${relativeFromModels}`;
  const packagedRelative = relativeFromModels.replace(/\.[^.]+$/, '.webp');
  const packagedPath = `Models/${packagedRelative}`;
  const shouldTrim = !relativeFromModels.startsWith('trees/');
  const cacheKey = sha256(Buffer.concat([
    sourceBuffer,
    Buffer.from(JSON.stringify({
      SETTINGS_VERSION,
      MAX_DIMENSION,
      shouldTrim,
      defringe: 'none-source-preserved',
      webp: 'lossless',
      mipmapLayout: 'power-of-two-bottom-center',
    })),
  ]));
  const cacheImage = path.join(CACHE_ROOT, `${cacheKey}.webp`);
  const cacheMetadata = path.join(CACHE_ROOT, `${cacheKey}.json`);
  let metadata;

  if (fs.existsSync(cacheImage) && fs.existsSync(cacheMetadata)) {
    metadata = JSON.parse(fs.readFileSync(cacheMetadata, 'utf8'));
  } else {
    // The checked-in PNG is the visual master. Do not reinterpret its
    // antialiased edge pixels during packaging: a lossless WebP must decode to
    // exactly the same RGBA values after the optional size cap.
    const decoded = await sharp(sourceBuffer, { animated: false })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let pipeline = sharp(decoded.data, {
      raw: {
        width: decoded.info.width,
        height: decoded.info.height,
        channels: 4,
      },
    });
    if (decoded.info.width > MAX_DIMENSION || decoded.info.height > MAX_DIMENSION) {
      pipeline = pipeline.resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    const resized = await pipeline.raw().toBuffer({ resolveWithObject: true });
    const processedData = resized.data;
    const trim = shouldTrim
      ? findAlphaBounds(processedData, resized.info.width, resized.info.height)
      : { left: 0, top: 0, width: resized.info.width, height: resized.info.height };
    const trimmedRaw = await sharp(processedData, { raw: resized.info })
      .extract(trim)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const padding = getPowerOfTwoPadding(trimmedRaw.info.width, trimmedRaw.info.height);
    const paddedRaw = await sharp(trimmedRaw.data, { raw: trimmedRaw.info })
      .extend({
        left: padding.left,
        top: padding.top,
        right: padding.right,
        bottom: padding.bottom,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const webp = await sharp(paddedRaw.data, { raw: paddedRaw.info })
      .webp({
        lossless: true,
        effort: 6,
      })
      .toBuffer();
    fs.mkdirSync(CACHE_ROOT, { recursive: true });
    fs.writeFileSync(cacheImage, webp);
    metadata = {
      sourceWidth: decoded.info.width,
      sourceHeight: decoded.info.height,
      contentWidth: trimmedRaw.info.width,
      contentHeight: trimmedRaw.info.height,
      outputWidth: paddedRaw.info.width,
      outputHeight: paddedRaw.info.height,
      trim,
      padding: {
        left: padding.left,
        top: padding.top,
        right: padding.right,
        bottom: padding.bottom,
      },
      geometry: findGeometry(paddedRaw.data, paddedRaw.info.width, paddedRaw.info.height),
      defringe: { algorithm: 'none-source-preserved', passes: [], changedPixels: 0 },
      mipmapEligible: true,
    };
    fs.writeFileSync(cacheMetadata, `${JSON.stringify(metadata)}\n`);
  }

  const stagedPath = path.join(NEXT_STAGE_ROOT, 'Models', ...packagedRelative.split('/'));
  fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
  fs.copyFileSync(cacheImage, stagedPath);
  return {
    logicalPath,
    packagedPath,
    hash: cacheKey,
    sourceBytes: sourceBuffer.length,
    outputBytes: fs.statSync(cacheImage).size,
    ...metadata,
  };
}

async function main() {
  const files = walk(SOURCE_ROOT)
    .filter((filePath) => SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0) throw new Error('No model source images found');

  fs.mkdirSync(DATA_ROOT, { recursive: true });
  fs.rmSync(NEXT_STAGE_ROOT, { recursive: true, force: true });
  // Sharp keeps decoded RGBA buffers alive while an operation is in flight.
  // Processing sequentially avoids a large transient RAM spike on the full
  // model library while the content-addressed cache keeps repeat builds fast.
  const entries = [];
  for (const filePath of files) {
    entries.push(await prepareFile(filePath));
  }
  const sourceBytes = entries.reduce((sum, entry) => sum + entry.sourceBytes, 0);
  const outputBytes = entries.reduce((sum, entry) => sum + entry.outputBytes, 0);
  const manifestVersion = sha256(entries.map((entry) => `${entry.logicalPath}:${entry.hash}`).join('\n'));
  const manifest = {
    formatVersion: 1,
    version: manifestVersion,
    settings: {
      maxDimension: MAX_DIMENSION,
      defringe: 'none-source-preserved',
      alphaResize: 'premultiplied',
      webpMode: 'lossless',
      mipmapLayout: 'power-of-two-bottom-center',
    },
    totals: { files: entries.length, sourceBytes, outputBytes },
    entries: Object.fromEntries(entries.map((entry) => [entry.logicalPath, entry])),
  };
  const manifestPath = path.join(NEXT_STAGE_ROOT, 'Models', 'model-assets.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.rmSync(STAGE_ROOT, { recursive: true, force: true });
  fs.renameSync(NEXT_STAGE_ROOT, STAGE_ROOT);

  const toMiB = (bytes) => (bytes / 1024 / 1024).toFixed(1);
  console.log(`Prepared ${entries.length} lossless mipmapped WebP assets: ${toMiB(sourceBytes)} MiB -> ${toMiB(outputBytes)} MiB (${(100 - outputBytes / sourceBytes * 100).toFixed(1)}% smaller)`);
  console.log(`Manifest: ${path.relative(ROOT, path.join(STAGE_ROOT, 'Models', 'model-assets.json'))}`);
}

main().catch((error) => {
  console.error('Release asset preparation failed:', error);
  process.exitCode = 1;
});
