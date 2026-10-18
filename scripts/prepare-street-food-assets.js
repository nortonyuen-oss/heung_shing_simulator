#!/usr/bin/env node
'use strict';

// Deterministic model projection calibration. Source paintings remain unchanged.
// node scripts/prepare-street-food-assets.js [--check]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { fitAxes, fitEllipse, fitBodyCage, mapPoint, planCanvas, transformRgba } = require('./street-food-projection.js');

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'scripts/source-art/streetFood');
const OUTPUT = path.join(ROOT, 'Models/streetFood');
const PREVIEWS = path.join(ART, 'previews');
const MANIFEST = path.join(ROOT, 'data/street-food-geometry.json');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const slope = ([a, b]) => (b[1] - a[1]) / (b[0] - a[0]);
const escapeXml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

// Display scale (Norton 2026-10-18: the paintings' own proportions are not distorted, so each
// asset is sized from ONE real-world reference dimension - not forced to a uniform footprint).
//
// ALONG is the TILE GRID'S OWN rate: a 20 m tile's ground diamond is TILE_WIDTH=100px wide (main.js),
// two ground edges each contributing half, so 1 edge-metre = 100/(20*2) = 2.5 px - exactly
// FESTIVAL_PX_PER_METRE_ALONG. UP=5 is NOT that same true rate carried onto the vertical axis; it is
// festival-sprites.js's deliberate ~1.63x exaggeration (true vertical is ALONG * cos30/cos45 =
// 2.5*1.2247 = 3.06 px/m - game-height-exaggeration memory, BUILDING_SCALE_TRUE_UP_RATIO in
// building-scale-survey.js), kept only so a thin, mostly-vertical prop like a person or a lamppost
// still reads at this tiny a scale. A cart is not that kind of object - it is a ground footprint,
// like a building or a festival stall, so it is anchored to LENGTH at the tile-true ALONG rate, one
// uniform scale (matching model-metadata.js's own footprint-width building scale), not to a height.
// 架手推車起碼大左1倍 (Norton): the earlier UP-anchored counter height was never a true-to-tile
// measurement to begin with, however uniformly it was applied.
const STREET_FOOD_PX_PER_METRE_ALONG = 2.5; // FESTIVAL_PX_PER_METRE_ALONG - true tile-grid rate
const STREET_FOOD_TRUE_PX_PER_METRE_UP = STREET_FOOD_PX_PER_METRE_ALONG * (Math.cos(Math.PI / 6) / Math.cos(Math.PI / 4)); // ~3.0619
// 然後大小應該縮成圖片既30%試試，你睇吓1:20既比例應該要架手推車（紅色線）多長 (Norton): a real dai
// pai dong cart's counter is about 2.3 m long on its LONG side - the fishball cart's very first
// calibration measured that same long edge. The counter's two rail lines run along the two
// different ground axes (top.down one side, top.up the other); a side's length is the X run from
// their meeting front corner to that line's far end, at 2.5 px a metre (a tile edge is 20 m over
// 50 px of X). X is never rescaled by this pipeline's rectification (mapPoint returns x unchanged),
// so source and output agree. 你邏輯都有些少問題 (Norton, 2026-10-18): the first cut took the X
// span across BOTH lines - long side plus short side - as the length, drawing every cart at ~70%.
// With the long side at 2.3 m the counters land 0.64-1.02 m off the ground (mean ~0.8 m), which is
// Norton's 0.8-0.9 m front-wheel-to-counter figure.
const CART_LENGTH_M = 2.3;
// roastChestnut (kind: axes): its two measured lines are short segments on the stove frame, not
// the counter's sides (they read a 0.38 m "short side"), so its corner cannot be trusted for a
// length. It was painted on the same sheet as these two at the same zoom, so it takes their mean.
const ROAST_CHESTNUT_BATCH_MATES = ['curryFishball', 'friedSnacks'];
// 檯凳 (street-food-market-design.md "街邊圓檯與摺凳"): a small hawker folding table and the
// stools/packed stacks that go with it - already anchored to a ground-plane span at the true ALONG
// rate, unaffected by the cart height mistake above.
const TABLE_DIAMETER_M = 1.0;
const STOOL_WIDTH_M = 0.32;
const FOLDED_TABLE_WIDTH_M = 0.25;
const FURNITURE_IDS = ['roundTableCream', 'roundTableMint', 'foldingStoolRed', 'foldingStoolGreen', 'roundTableFolded', 'foldingStoolsPacked'];

function pointsSpanX(points) {
  const xs = points.map(([x]) => x);
  return Math.max(...xs) - Math.min(...xs);
}

// The two ground-axis sides of a corner drawn by two measured lines (each [[x,y],[x,y]], one with a
// positive slope, one negative): where they meet, and how far each runs in X from there.
function cornerEdgesPx(lineA, lineB) {
  const fit = ([[x1, y1], [x2, y2]]) => { const m = (y2 - y1) / (x2 - x1); return { m, c: y1 - m * x1 }; };
  const a = fit(lineA), b = fit(lineB);
  const frontX = (b.c - a.c) / (a.m - b.m);
  const run = (line) => Math.max(...line.map(([x]) => Math.abs(x - frontX)));
  const edges = [run(lineA), run(lineB)].sort((p, q) => q - p);
  return { frontX, longPx: edges[0], shortPx: edges[1] };
}

// A cart/furniture piece's own ground-contact point in OUTPUT pixels: the mean X of alpha>=128
// pixels in the lowest 5 rows that have any, same method as street-food-people.json's footAnchor.
function groundAnchorFromAlpha(data, width, height) {
  let bottom = -1;
  for (let y = height - 1; y >= 0 && bottom < 0; y--) {
    for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] >= 128) { bottom = y; break; }
  }
  if (bottom < 0) return null;
  let sumX = 0, count = 0;
  for (let y = Math.max(0, bottom - 4); y <= bottom; y++) {
    for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] >= 128) { sumX += x; count++; }
  }
  return [count ? sumX / count : width / 2, bottom];
}

// scale: output px -> screen px at zoom 1, one scalar for both axes (model-metadata.js's building
// scale and festival-sprites.js's part scale are both a single number this same way).
function displayScaleFor(asset, projection, allAssets = []) {
  if (asset.kind === 'body-cage') {
    const { longPx } = cornerEdgesPx(asset.top.down, asset.top.up);
    return { scale: (CART_LENGTH_M * STREET_FOOD_PX_PER_METRE_ALONG) / longPx, anchorM: CART_LENGTH_M, anchorAxis: 'along (counter long side)' };
  }
  if (asset.id === 'roastChestnut') {
    const mates = ROAST_CHESTNUT_BATCH_MATES.map((id) => allAssets.find((a) => a.id === id)).filter(Boolean);
    if (mates.length !== ROAST_CHESTNUT_BATCH_MATES.length) throw new Error('roastChestnut: batch mates missing');
    const scale = mates.reduce((sum, mate) => sum + displayScaleFor(mate, null).scale, 0) / mates.length;
    return { scale, anchorM: CART_LENGTH_M, anchorAxis: 'along (batch mates\' counter long side)' };
  }
  if (asset.kind === 'ellipse') {
    return { scale: (TABLE_DIAMETER_M * STREET_FOOD_PX_PER_METRE_ALONG) / asset.ellipse.width, anchorM: TABLE_DIAMETER_M, anchorAxis: 'along (tabletop diameter)' };
  }
  if (asset.id === 'roundTableFolded') {
    return { scale: (FOLDED_TABLE_WIDTH_M * STREET_FOOD_PX_PER_METRE_ALONG) / pointsSpanX(asset.axis), anchorM: FOLDED_TABLE_WIDTH_M, anchorAxis: 'along (folded width)' };
  }
  // the remaining axes-kind assets are the stools / packed stack
  return { scale: (STOOL_WIDTH_M * STREET_FOOD_PX_PER_METRE_ALONG) / pointsSpanX(Object.values(asset.axes).flat()), anchorM: STOOL_WIDTH_M, anchorAxis: 'along (stool width)' };
}

function cropPixels(data, width, crop) {
  const [left, top, w, h] = crop;
  const output = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) data.copy(output, y * w * 4, ((y + top) * width + left) * 4, ((y + top) * width + left + w) * 4);
  return output;
}

function localAxes(axes, local) {
  return Object.fromEntries(Object.entries(axes).map(([key, line]) => [key, line.map(local)]));
}

function fitAsset(spec, crop) {
  const [x, y, width, height] = crop;
  const local = ([px, py]) => [px - x, py - y];
  if (spec.kind === 'body-cage') return fitBodyCage({ top: localAxes(spec.top, local), lower: localAxes(spec.lower, local) }, width, height, 16);
  if (spec.kind === 'axes') return planCanvas(width, height, fitAxes(localAxes(spec.axes, local)), 16);
  if (spec.kind === 'ellipse') return planCanvas(width, height, fitEllipse(spec.ellipse), 16);
  if (spec.kind === 'single-axis') return planCanvas(width, height, { c: 0.5 - slope(spec.axis), d: 1 }, 16);
  throw new Error(`Unknown projection kind: ${spec.kind}`);
}

function guidesFor(spec, crop, projection) {
  const local = ([x, y]) => [x - crop[0], y - crop[1]];
  const source = [];
  const append = (label, line, color) => source.push({ label, color, points: line.map(local) });
  if (spec.kind === 'body-cage') {
    for (const [key, line] of Object.entries(spec.top)) append(`檯面 ${key}`, line, '#29d9e6');
    for (const [key, line] of Object.entries(spec.lower)) append(`木箱 ${key}`, line, '#d6a2ff');
  } else if (spec.kind === 'axes') {
    for (const [key, line] of Object.entries(spec.axes)) append(key, line, '#29d9e6');
  } else if (spec.kind === 'single-axis') append('摺腳橫桿', spec.axis, '#29d9e6');
  else {
    const { center: [cx, cy], width, height, tiltSlope } = spec.ellipse;
    const points = Array.from({ length: 97 }, (_, index) => {
      const angle = 2 * Math.PI * index / 96;
      const dx = width / 2 * Math.cos(angle);
      return local([cx + dx, cy + tiltSlope * dx + height / 2 * Math.sin(angle)]);
    });
    source.push({ label: '水平圓檯面', color: '#ffcf68', points });
  }
  for (const check of spec.checks || []) append(check.label, check.line, '#a6ed89');
  return { source, output: source.map((guide) => ({ ...guide, points: guide.points.map((p) => mapPoint(p, projection)) })) };
}

function alphaAudit(data, width, height) {
  let transparent = 0, maxAlpha = 0, borderMaxAlpha = 0;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = data[(y * width + x) * 4 + 3];
    if (!alpha) transparent++;
    maxAlpha = Math.max(maxAlpha, alpha);
    if (x < 8 || y < 8 || x >= width - 8 || y >= height - 8) borderMaxAlpha = Math.max(borderMaxAlpha, alpha);
    if (alpha >= 200) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  }
  assert(transparent > 0 && maxAlpha >= 200, 'Missing transparency or visible content');
  assert(borderMaxAlpha === 0, 'Visible pixels touch the output safety margin');
  return { transparentPercent: Number((100 * transparent / (width * height)).toFixed(2)), maxAlpha, borderMaxAlpha, contentBoundsAlpha200: [left, top, right + 1, bottom + 1] };
}

function validate(spec, crop, projection, guides, data) {
  const axes = [];
  for (const guide of guides.output) {
    if (guide.points.length !== 2 || guide.color === '#a6ed89') continue;
    const value = slope(guide.points);
    const target = guide.label.includes('up') ? -0.5 : 0.5;
    axes.push({ reference: guide.label, slope: value, target, error: Math.abs(value - target) });
  }
  assert(axes.every((axis) => axis.error < 1e-8), `${spec.id}: reference axes failed 1:2 calibration`);
  const centerX = crop[2] / 2;
  const v0 = mapPoint([centerX, 0], projection), v1 = mapPoint([centerX, crop[3] - 1], projection);
  assert(Math.abs(v0[0] - v1[0]) < 1e-9 && v1[1] > v0[1], `${spec.id}: inverted or tilted projected vertical`);
  const result = { axes, verticalDeltaX: v1[0] - v0[0], alpha: alphaAudit(data, projection.width, projection.height) };
  if (spec.kind === 'ellipse') {
    const [cx, cy] = spec.ellipse.center.map((p, i) => p - crop[i]);
    const halfW = spec.ellipse.width / 2, halfH = spec.ellipse.height / 2, tilt = spec.ellipse.tiltSlope;
    const l = mapPoint([cx - halfW, cy - tilt * halfW], projection), r = mapPoint([cx + halfW, cy + tilt * halfW], projection);
    const t = mapPoint([cx, cy - halfH], projection), b = mapPoint([cx, cy + halfH], projection);
    result.ellipseWidthHeight = (r[0] - l[0]) / (b[1] - t[1]);
    assert(Math.abs(result.ellipseWidthHeight - 2) < 1e-8 && Math.abs(l[1] - r[1]) < 1e-8, `${spec.id}: tabletop ellipse failed 2:1 calibration`);
  }
  result.independentChecks = (spec.checks || []).map((check) => {
    const points = check.line.map(([x, y]) => mapPoint([x - crop[0], y - crop[1]], projection));
    return { label: check.label, sourceSlope: slope(check.line), outputSlope: slope(points), target: check.target };
  });
  return result;
}

function overlaySvg(width, height, guides) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${guides.map((g) => `<polyline points="${g.points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${g.color}" stroke-width="3" stroke-linecap="round"/>${g.points.length === 2 ? g.points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${g.color}" stroke="#15202a" stroke-width="1"/>`).join('') : ''}`).join('')}</svg>`);
}

async function contactSheet(items, file, withGuides) {
  const cols = 3, cellW = 480, cellH = 390, rows = Math.ceil(items.length / cols);
  const layers = [];
  for (let i = 0; i < items.length; i++) {
    const { record, png } = items[i];
    let input = png;
    if (withGuides) input = await sharp(png).composite([{ input: overlaySvg(record.outputSize[0], record.outputSize[1], record.guideLines.output) }]).png().toBuffer();
    const thumb = await sharp(input).resize(cellW - 36, cellH - 68, { fit: 'contain', background: '#00000000' }).png().toBuffer();
    const left = i % cols * cellW, top = Math.floor(i / cols) * cellH;
    layers.push({ input: thumb, left: left + 18, top: top + 10 });
    const note = record.kind === 'ellipse' ? '圓檯面 2:1' : record.kind === 'single-axis' ? '可見框架 +0.5' : '結構軸線 ±0.5';
    layers.push({ input: Buffer.from(`<svg width="${cellW}" height="48"><text x="24" y="19" fill="#f1f5f7" font-size="18" font-family="sans-serif">${escapeXml(record.label)}</text><text x="24" y="41" fill="#9eb3c2" font-size="13" font-family="sans-serif">${escapeXml(note)}</text></svg>`), left, top: top + cellH - 55 });
  }
  await sharp({ create: { width: cellW * cols, height: cellH * rows, channels: 4, background: '#17232b' } }).composite(layers).png().toFile(file);
}

async function main() {
  const check = process.argv.includes('--check');
  const spec = JSON.parse(fs.readFileSync(path.join(ART, 'isometric-calibration.json'), 'utf8'));
  assert(spec.assets.length === 18, 'Expected all 12 carts and 6 furniture assets');
  const sources = new Map(), items = [];
  for (const asset of spec.assets) {
    if (!sources.has(asset.source)) {
      const bytes = fs.readFileSync(path.join(ROOT, asset.source));
      const image = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      sources.set(asset.source, { bytes, hash: hash(bytes), ...image });
    }
    const source = sources.get(asset.source);
    const crop = asset.crop || [0, 0, source.info.width, source.info.height];
    assert(crop.every(Number.isInteger) && crop[0] >= 0 && crop[1] >= 0 && crop[2] > 0 && crop[3] > 0 && crop[0] + crop[2] <= source.info.width && crop[1] + crop[3] <= source.info.height, `${asset.id}: invalid crop`);
    const raw = cropPixels(source.data, source.info.width, crop);
    const projection = fitAsset(asset, crop);
    const output = transformRgba(raw, crop[2], crop[3], projection);
    const guides = guidesFor(asset, crop, projection);
    const validation = validate(asset, crop, projection, guides, output);
    const png = await sharp(output, { raw: { width: projection.width, height: projection.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
    const groundAnchor = groundAnchorFromAlpha(output, projection.width, projection.height);
    assert(groundAnchor, `${asset.id}: no visible ground contact found`);
    const display = displayScaleFor(asset, projection, spec.assets);
    const record = { id: asset.id, label: asset.label, kind: asset.kind, reference: asset.reference, confidence: asset.confidence, note: asset.note || '', sourcePath: asset.source, sourceSha256: source.hash, sourceCrop: crop, outputPath: `Models/streetFood/sf_${asset.id}.png`, outputSize: [projection.width, projection.height], outputSha256: hash(png), groundAnchor, display, projection: JSON.parse(JSON.stringify(projection)), guideLines: guides, validation };
    // 車仔檔模型要做2方向既mirror (Norton 2026-10-18): the 12 carts get a horizontally flopped
    // twin for the stall facing the other way along a venue edge; furniture does not need one
    // (a round table and a folded stool read the same either way).
    if (!FURNITURE_IDS.includes(asset.id)) {
      const mirroredPng = await sharp(png).flop().png({ compressionLevel: 9 }).toBuffer();
      record.mirror = {
        outputPath: `Models/streetFood/sf_${asset.id}_m.png`,
        outputSha256: hash(mirroredPng),
        groundAnchor: [projection.width - 1 - groundAnchor[0], groundAnchor[1]],
      };
      items.push({ record, png, mirroredPng });
    } else {
      items.push({ record, png });
    }
    console.log(`${asset.id}: ${crop[2]}×${crop[3]} → ${projection.width}×${projection.height}, ${asset.kind}, references ${validation.axes.map((a) => a.slope.toFixed(5)).join(' / ') || 'ellipse 2:1'}, scale ${display.scale.toFixed(5)} (${display.anchorM}m ${display.anchorAxis})`);
  }
  for (const [name, source] of sources) assert(hash(fs.readFileSync(path.join(ROOT, name))) === source.hash, `Source changed during calibration: ${name}`);
  const manifest = { version: 1, projection: 'Ground height:width 1:2, visible ground axes +/-0.5', sourceMeasurements: 'scripts/source-art/streetFood/isometric-calibration.json', method: 'Measured structure axes; continuous vertical piecewise calibration for disagreeing top/body planes; premultiplied alpha bilinear resampling', runtimeIntegrated: false, assets: items.map((i) => i.record) };
  if (check) {
    const saved = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    assert(JSON.stringify(saved) === JSON.stringify(manifest), 'Saved geometry manifest differs from rebuilt geometry');
    for (const { record, mirroredPng } of items) {
      assert(hash(fs.readFileSync(path.join(ROOT, record.outputPath))) === record.outputSha256, `Output differs from rebuild: ${record.outputPath}`);
      if (record.mirror) assert(hash(fs.readFileSync(path.join(ROOT, record.mirror.outputPath))) === record.mirror.outputSha256, `Mirrored output differs from rebuild: ${record.mirror.outputPath}`);
    }
    console.log(`Verified ${items.length} deterministic outputs (${items.filter((i) => i.record.mirror).length} mirrored); ${sources.size} original PNGs unchanged.`);
    return;
  }
  fs.mkdirSync(OUTPUT, { recursive: true }); fs.mkdirSync(PREVIEWS, { recursive: true });
  for (const { record, png, mirroredPng } of items) {
    fs.writeFileSync(path.join(ROOT, record.outputPath), png);
    if (record.mirror) fs.writeFileSync(path.join(ROOT, record.mirror.outputPath), mirroredPng);
  }
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  const carts = items.filter(({ record }) => !FURNITURE_IDS.includes(record.id));
  const furniture = items.filter((item) => !carts.includes(item));
  await contactSheet(carts, path.join(PREVIEWS, 'street-food-carts-isometric.png'), false);
  await contactSheet(carts, path.join(PREVIEWS, 'street-food-carts-calibration.png'), true);
  await contactSheet(furniture, path.join(PREVIEWS, 'street-food-furniture-isometric.png'), true);
  const { writeStreetFoodReview } = require('./street-food-review.js');
  await writeStreetFoodReview({ root: ROOT, previewDir: PREVIEWS, records: manifest.assets });
  console.log(`Prepared ${items.length} corrected sprites, contact sheets, and interactive review.`);
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

module.exports = {
  cropPixels, fitAsset, guidesFor, validate, groundAnchorFromAlpha, displayScaleFor, pointsSpanX, cornerEdgesPx,
  ROAST_CHESTNUT_BATCH_MATES,
  STREET_FOOD_PX_PER_METRE_ALONG, STREET_FOOD_TRUE_PX_PER_METRE_UP, CART_LENGTH_M, FURNITURE_IDS,
};
