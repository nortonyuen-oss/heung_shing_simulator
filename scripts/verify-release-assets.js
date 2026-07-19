#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(ROOT, 'Models');
const STAGE_ROOT = path.join(ROOT, '.data', 'package-assets', 'Models');
const MANIFEST_PATH = path.join(STAGE_ROOT, 'model-assets.json');
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(root, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

function portable(value) {
  return value.split(path.sep).join('/');
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
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= threshold) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      bottomY = y;
      count++;
      xTotal += x;
      rowMinX = Math.min(rowMinX, x);
    }
    if (count > 0) rows.push({ y, count, xTotal, minX: rowMinX });
  }
  if (bottomY < 0) return null;
  const maxCount = Math.max(...rows.map((row) => row.count));
  const baseThreshold = Math.max(6, Math.floor(maxCount * 0.08));
  const stableBaseY = rows.filter((row) => row.count >= baseThreshold).at(-1)?.y ?? bottomY;
  const baseRows = rows.filter((row) => (
    row.y >= stableBaseY - 3 && row.y <= stableBaseY && row.count >= baseThreshold
  ));
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

async function verify() {
  assert.ok(fs.existsSync(MANIFEST_PATH), 'release model manifest is missing; run prepare:release-assets');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  assert.ok(manifest.version && manifest.entries, 'release model manifest is invalid');

  const sourceLogicalPaths = walk(SOURCE_ROOT)
    .filter((filePath) => IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
    .map((filePath) => `Models/${portable(path.relative(SOURCE_ROOT, filePath))}`)
    .sort();
  const manifestLogicalPaths = Object.keys(manifest.entries).sort();
  assert.deepStrictEqual(manifestLogicalPaths, sourceLogicalPaths, 'manifest must exactly match source images');

  const stagedFiles = walk(STAGE_ROOT);
  stagedFiles.forEach((filePath) => {
    const relative = portable(path.relative(STAGE_ROOT, filePath));
    assert.ok(
      relative === 'model-assets.json' || path.extname(relative).toLowerCase() === '.webp',
      `unexpected staged file: ${relative}`,
    );
  });

  let maximumAnchorError = 0;
  for (const [logicalPath, entry] of Object.entries(manifest.entries)) {
    assert.equal(path.extname(entry.packagedPath).toLowerCase(), '.webp', `${logicalPath} is not mapped to WebP`);
    const stagedPath = path.join(ROOT, '.data', 'package-assets', ...entry.packagedPath.split('/'));
    assert.ok(fs.existsSync(stagedPath), `missing staged output for ${logicalPath}`);
    const decoded = await sharp(stagedPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(decoded.info.format, 'raw');
    assert.equal(decoded.info.width, entry.outputWidth, `${logicalPath} width mismatch`);
    assert.equal(decoded.info.height, entry.outputHeight, `${logicalPath} height mismatch`);
    const decodedGeometry = findGeometry(decoded.data, decoded.info.width, decoded.info.height);
    if (entry.geometry && decodedGeometry) {
      const errors = [
        Math.abs(decodedGeometry.bottomY - entry.geometry.bottomY),
        Math.abs(decodedGeometry.stableBaseY - entry.geometry.stableBaseY),
        Math.abs(decodedGeometry.bottomX - entry.geometry.bottomX),
        Math.abs(decodedGeometry.lowestCornerX - entry.geometry.lowestCornerX),
      ];
      maximumAnchorError = Math.max(maximumAnchorError, ...errors);
    }
  }
  assert.ok(maximumAnchorError <= 1, `maximum PNG/WebP anchor error is ${maximumAnchorError.toFixed(2)}px`);

  const registrySources = ['constants.js', 'main.js'];
  const referencedModels = new Set(registrySources.flatMap((fileName) => {
    const source = fs.readFileSync(path.join(ROOT, fileName), 'utf8');
    return [...source.matchAll(/Models\/[A-Za-z0-9_./ -]+\.(?:png|jpe?g)/gi)].map((match) => match[0]);
  }));
  referencedModels.forEach((logicalPath) => {
    assert.ok(manifest.entries[logicalPath], `fixed registry path is absent from manifest: ${logicalPath}`);
  });

  const ratio = manifest.totals.outputBytes / manifest.totals.sourceBytes;
  assert.ok(ratio <= 0.30, `model package ratio ${(ratio * 100).toFixed(1)}% exceeds 30% target`);
  const toMiB = (bytes) => (bytes / 1024 / 1024).toFixed(1);
  console.log(`Verified ${manifest.totals.files} WebP assets; ${toMiB(manifest.totals.sourceBytes)} MiB -> ${toMiB(manifest.totals.outputBytes)} MiB; max anchor error ${maximumAnchorError.toFixed(2)}px`);
}

verify().catch((error) => {
  console.error('Release asset audit failed:', error.message);
  process.exitCode = 1;
});
