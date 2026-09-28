#!/usr/bin/env node
// Proposes ground corners (building-ground-fit.js) for every building model and draws a review
// sheet: red = the lot the default whole-width fit gives, green = the lot the ground corners give,
// dots = the detected left / front / right corners.
//
//   node scripts/detect-building-ground-corners.js [--out dir] [--only a,b,...] [--thumb px]
//          [--json [--min-change 0.01] [--exclude a,b,...]]
//
// Writes <out>/ground-corners-N.png sheets and prints, per model, how far the two fits disagree.
// With --json it prints a BUILDING_GROUND_CORNERS-shaped object of the confident detections
// instead (--min-change: only models the corners would move or resize by at least that share of
// the lot; --exclude: models whose detection was reviewed and rejected). Detections are proposals: review the sheet, then fix any in the in-game calibrator.

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { detectBuildingGroundCorners, fitBuildingToGroundCorners } = require('../building-ground-fit.js');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOTS = ['residential', 'commercial', 'industrial', 'government', 'parks', 'powerStation', 'specialSites', 'busDepot', 'containerPort', 'airPort'];
const TILE_WIDTH = 100;
const THUMB = Number(argValue('--thumb', 300));

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) return [];
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.png$/i.test(entry.name) ? [full] : [];
  });
}

// The default fit, as main.js getSpriteFootprintMetadata computes it: whole visible width, lowest
// pixel as the front corner.
function defaultFit(alpha, width, height, threshold = 16) {
  let minX = width; let maxX = -1; let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[(y * width + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        bottom = y;
      }
    }
  }
  let total = 0; let count = 0;
  for (let x = 0; x < width; x++) {
    if (alpha[(bottom * width + x) * 4 + 3] > threshold) { total += x; count++; }
  }
  return { originX: total / count, originY: bottom, groundWidth: maxX - minX + 1 };
}

function diamond(originX, originY, groundWidth) {
  const half = groundWidth / 2;
  return [[originX, originY], [originX - half, originY - half / 2], [originX, originY - half], [originX + half, originY - half / 2]]
    .map((point) => point.map((value) => value.toFixed(1)).join(',')).join(' ');
}

async function main() {
  const outDir = path.resolve(argValue('--out', path.join(ROOT, '.data', 'ground-corners')));
  const only = argValue('--only', '');
  const asJson = process.argv.includes('--json');
  const files = SOURCE_ROOTS.flatMap((dir) => walk(path.join(ROOT, 'Models', dir)))
    .filter((file) => !only || only.split(',').some((part) => file.includes(part)))
    .sort();

  const results = [];
  const tiles = [];
  for (const file of files) {
    const logicalPath = path.relative(ROOT, file).split(path.sep).join('/');
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const corners = detectBuildingGroundCorners(data, info.width, info.height, { channels: 4 });
    const current = defaultFit(data, info.width, info.height);
    const fit = corners && fitBuildingToGroundCorners(corners, TILE_WIDTH);
    const groundWidth = corners ? corners.right[0] - corners.left[0] : current.groundWidth;
    // How much the ground-corner fit would change the model: size and anchor shift, both as a
    // share of the lot's width on screen.
    const sizeChange = current.groundWidth / groundWidth - 1;
    const shiftX = fit ? (fit.originX - current.originX) / groundWidth : 0;
    const shiftY = fit ? (fit.originY - current.originY) / groundWidth : 0;
    results.push({ logicalPath, corners, sizeChange, shiftX, shiftY });

    if (!asJson) {
      const stroke = Math.max(3, info.width / 250);
      const dots = corners
        ? [corners.left, corners.front, corners.right].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${stroke * 3}" fill="#00c060" stroke="white" stroke-width="${stroke / 2}"/>`).join('')
        : '';
      const svg = `<svg width="${info.width}" height="${info.height}" xmlns="http://www.w3.org/2000/svg">
        <polygon points="${diamond(current.originX, current.originY, current.groundWidth)}" fill="none" stroke="red" stroke-width="${stroke}"/>
        ${fit ? `<polygon points="${diamond(fit.originX, fit.originY, groundWidth)}" fill="rgba(0,200,90,0.15)" stroke="#00c060" stroke-width="${stroke}"/>` : ''}
        ${dots}
        <text x="10" y="${info.width / 18}" font-size="${info.width / 20}" fill="black">${path.basename(file)}${corners && !corners.confident ? ' (?)' : ''}</text>
        <text x="10" y="${info.width / 9}" font-size="${info.width / 24}" fill="#333">size ${(sizeChange * 100).toFixed(1)}%  dx ${(shiftX * 100).toFixed(1)}%  dy ${(shiftY * 100).toFixed(1)}%</text>
      </svg>`;
      const composed = await sharp({ create: { width: info.width, height: info.height, channels: 4, background: '#dfe7df' } })
        .composite([{ input: file }, { input: Buffer.from(svg) }]).png().toBuffer();
      const thumbWidth = THUMB;
      const thumbHeight = Math.round(thumbWidth * info.height / info.width);
      tiles.push({ buffer: await sharp(composed).resize(thumbWidth, thumbHeight).png().toBuffer(), height: thumbHeight });
    }
  }

  if (asJson) {
    const table = {};
    const minChange = Number(argValue('--min-change', 0));
    const excluded = argValue('--exclude', '').split(',').filter(Boolean);
    results
      .filter((result) => result.corners?.confident)
      .filter((result) => Math.max(Math.abs(result.sizeChange), Math.abs(result.shiftX), Math.abs(result.shiftY)) >= minChange)
      .filter((result) => !excluded.some((part) => result.logicalPath.includes(part)))
      .forEach(({ logicalPath, corners }) => {
        table[logicalPath] = { left: corners.left, front: corners.front, right: corners.right };
      });
    process.stdout.write(`${JSON.stringify(table, null, 2)}\n`);
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const columns = Math.max(1, Math.floor(2100 / THUMB));
  const perSheet = columns * 5;
  for (let sheet = 0; sheet * perSheet < tiles.length; sheet++) {
    const chunk = tiles.slice(sheet * perSheet, (sheet + 1) * perSheet);
    const cellHeight = Math.max(...chunk.map((tile) => tile.height));
    const rows = Math.ceil(chunk.length / columns);
    await sharp({ create: { width: THUMB * columns, height: cellHeight * rows, channels: 4, background: '#ffffff' } })
      .composite(chunk.map((tile, index) => ({ input: tile.buffer, left: (index % columns) * THUMB, top: Math.floor(index / columns) * cellHeight })))
      .png()
      .toFile(path.join(outDir, `ground-corners-${sheet + 1}.png`));
  }
  results
    .sort((a, b) => Math.max(Math.abs(b.sizeChange), Math.abs(b.shiftX)) - Math.max(Math.abs(a.sizeChange), Math.abs(a.shiftX)))
    .forEach(({ logicalPath, corners, sizeChange, shiftX, shiftY }) => {
      console.log(`${logicalPath.padEnd(64)} size ${(sizeChange * 100).toFixed(1).padStart(6)}%  dx ${(shiftX * 100).toFixed(1).padStart(6)}%  dy ${(shiftY * 100).toFixed(1).padStart(6)}%${corners?.confident ? '' : '  (not confident)'}`);
    });
  console.log(`\nSheets: ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
