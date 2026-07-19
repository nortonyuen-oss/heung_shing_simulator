#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { defringeWhiteMatteRgba } = require('./lib/defringe-model');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(ROOT, 'Models');
const DATA_ROOT = path.join(ROOT, '.data');
const STAGE_ROOT = path.join(DATA_ROOT, 'package-assets');
const NEXT_STAGE_ROOT = path.join(DATA_ROOT, 'package-assets.next');
const CACHE_ROOT = path.join(DATA_ROOT, 'webp-cache');
const QUALITY = Number(process.env.ASSET_WEBP_QUALITY || 88);
const MAX_DIMENSION = Number(process.env.ASSET_MAX_DIMENSION || 1024);
// Bump whenever pixel processing changes so cached WebP files cannot retain an
// older matte-removal or resize result.
const SETTINGS_VERSION = 3;
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
      QUALITY,
      MAX_DIMENSION,
      shouldTrim,
      defringe: 'white-matte-v2-3pass',
    })),
  ]));
  const cacheImage = path.join(CACHE_ROOT, `${cacheKey}.webp`);
  const cacheMetadata = path.join(CACHE_ROOT, `${cacheKey}.json`);
  let metadata;

  if (fs.existsSync(cacheImage) && fs.existsSync(cacheMetadata)) {
    metadata = JSON.parse(fs.readFileSync(cacheMetadata, 'utf8'));
  } else {
    // Remove generated white matte RGB while the original pixels are still
    // intact. Doing this after resize would allow the matte colour to bleed
    // through the interpolation kernel into otherwise clean edge pixels.
    const decoded = await sharp(sourceBuffer, { animated: false })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const defringed = defringeWhiteMatteRgba(
      decoded.data,
      decoded.info.width,
      decoded.info.height,
    );
    // Sharp automatically premultiplies alpha for resize operations and
    // unpremultiplies afterwards, preventing transparent RGB from creating a
    // second halo during resampling.
    let pipeline = sharp(defringed.data, {
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
    const defringePasses = [defringed.stats];
    let processedData = resized.data;
    // Resampling and lossy colour conversion can reveal a smaller second ring
    // of matte pixels. Two conservative finishing passes clean that ring while
    // avoiding the cumulative darkening seen with five or more passes.
    for (let pass = 0; pass < 2; pass++) {
      const result = defringeWhiteMatteRgba(
        processedData,
        resized.info.width,
        resized.info.height,
      );
      processedData = result.data;
      defringePasses.push(result.stats);
    }
    const trim = shouldTrim
      ? findAlphaBounds(processedData, resized.info.width, resized.info.height)
      : { left: 0, top: 0, width: resized.info.width, height: resized.info.height };
    const trimmedRaw = await sharp(processedData, { raw: resized.info })
      .extract(trim)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const webp = await sharp(trimmedRaw.data, { raw: trimmedRaw.info })
      .webp({
        quality: QUALITY,
        alphaQuality: 100,
        smartSubsample: true,
        smartDeblock: true,
        preset: 'drawing',
        effort: 5,
      })
      .toBuffer();
    fs.mkdirSync(CACHE_ROOT, { recursive: true });
    fs.writeFileSync(cacheImage, webp);
    metadata = {
      sourceWidth: decoded.info.width,
      sourceHeight: decoded.info.height,
      outputWidth: trimmedRaw.info.width,
      outputHeight: trimmedRaw.info.height,
      trim,
      geometry: findGeometry(trimmedRaw.data, trimmedRaw.info.width, trimmedRaw.info.height),
      defringe: {
        algorithm: 'white-matte-v2-3pass',
        passes: defringePasses,
        changedPixels: defringePasses.reduce((sum, stats) => sum + stats.changedPixels, 0),
      },
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
      quality: QUALITY,
      alphaQuality: 100,
      maxDimension: MAX_DIMENSION,
      defringe: 'white-matte-v2-3pass',
      alphaResize: 'premultiplied',
      webpPreset: 'drawing',
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
  console.log(`Prepared ${entries.length} model assets: ${toMiB(sourceBytes)} MiB -> ${toMiB(outputBytes)} MiB (${(100 - outputBytes / sourceBytes * 100).toFixed(1)}% smaller)`);
  console.log(`Manifest: ${path.relative(ROOT, path.join(STAGE_ROOT, 'Models', 'model-assets.json'))}`);
}

main().catch((error) => {
  console.error('Release asset preparation failed:', error);
  process.exitCode = 1;
});
