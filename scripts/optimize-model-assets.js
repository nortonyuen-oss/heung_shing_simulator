#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { defringeWhiteMatteRgba } = require('./lib/defringe-model');

const projectRoot = path.resolve(__dirname, '..');
const modelRoots = [
  path.join(projectRoot, 'Models', 'residential'),
  path.join(projectRoot, 'Models', 'commercial'),
  path.join(projectRoot, 'Models', 'industrial'),
  path.join(projectRoot, 'Models', 'government'),
  path.join(projectRoot, 'Models', 'parks'),
  path.join(projectRoot, 'Models', 'powerStation'),
  path.join(projectRoot, 'Models', 'specialSites'),
  path.join(projectRoot, 'Models', 'airPort'),
  path.join(projectRoot, 'Models', 'containerPort'),
  path.join(projectRoot, 'Models', 'trees'),
];

const MAX_DIMENSION = Number(process.env.ASSET_MAX_DIMENSION || 1024);
const WEBP_QUALITY = Number(process.env.ASSET_WEBP_QUALITY || 82);
const APPLY_DEFRINGE = process.env.ASSET_DEFRINGE === '1';
const SOURCE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

async function main() {
  const files = modelRoots.flatMap(collectImageFiles).filter((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    return SOURCE_EXTENSIONS.has(ext);
  });

  if (files.length === 0) {
    console.log('No source assets found to optimize.');
    return;
  }

  let converted = 0;
  let skipped = 0;

  for (const sourcePath of files) {
    const targetPath = sourcePath.replace(/\.[^.]+$/, '.webp');

    if (isUpToDate(sourcePath, targetPath)) {
      skipped += 1;
      continue;
    }

    const image = sharp(sourcePath, { animated: false });
    const metadata = await image.metadata();
    const width = metadata.width ?? MAX_DIMENSION;
    const height = metadata.height ?? MAX_DIMENSION;

    let pipeline = image;
    if (APPLY_DEFRINGE && metadata.hasAlpha) {
      const { data, info } = await image.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const result = defringeWhiteMatteRgba(data, info.width, info.height);
      pipeline = sharp(result.data, {
        raw: { width: info.width, height: info.height, channels: 4 },
      });
    }
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      pipeline = pipeline.resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    await pipeline.webp({ quality: WEBP_QUALITY }).toFile(targetPath);
    converted += 1;
    console.log(`Optimized: ${path.relative(projectRoot, sourcePath)} -> ${path.relative(projectRoot, targetPath)}`);
  }

  console.log(`Done. Converted ${converted} file(s), skipped ${skipped} up-to-date file(s).`);
}

function collectImageFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];

  const stack = [rootDir];
  const files = [];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.forEach((entry) => {
      if (entry.name.startsWith('.')) return;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else files.push(fullPath);
    });
  }

  return files;
}

function isUpToDate(sourcePath, targetPath) {
  if (!fs.existsSync(targetPath)) return false;
  const sourceStat = fs.statSync(sourcePath);
  const targetStat = fs.statSync(targetPath);
  return targetStat.mtimeMs >= sourceStat.mtimeMs;
}

main().catch((error) => {
  console.error('Asset optimization failed:', error);
  process.exitCode = 1;
});
