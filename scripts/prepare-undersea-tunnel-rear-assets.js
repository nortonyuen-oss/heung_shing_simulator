#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { bottomProfile, fitLine, register } = require('./prepare-undersea-tunnel-assets.js');

const ROOT = path.resolve(__dirname, '..');
const ART = 'scripts/source-art/underseaTunnel/rear-v1';
const OUTPUT = 'Models/underseaTunnel';
const WIDTH = 1200, HEIGHT = 800;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const specs = [
  { axis: 'NS', facing: 'NW', tiles: { rows: 2, cols: 3 },
    ranges: [[240, 820], [960, 1320]], targets: [[160, 328], [640, 568], [960, 408]] },
  { axis: 'EW', facing: 'NE', tiles: { rows: 3, cols: 2 },
    ranges: [[300, 570], [700, 1260]], targets: [[180, 408], [500, 568], [980, 328]] },
];

async function main() {
  const check = process.argv.includes('--check');
  const metadata = { version: 1, view: 'rear', runtimeIntegrated: false,
    generation: 'built-in imagegen', canvas: [WIDTH, HEIGHT],
    displayScaleFor100x50Tiles: 0.3125, bores: 2, roads: 2, lanesPerBore: 2,
    registration: 'Affine alignment of the three lower slab corners to the front-view footprints; interior road heights are not calibrated',
    assets: [] };
  const layers = [];
  for (const [i, spec] of specs.entries()) {
    const source = `${ART}/generated-${spec.axis}-rear.png`;
    const bytes = fs.readFileSync(path.join(ROOT, source));
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const profile = bottomProfile(data, info.width, info.height);
    const min = profile.findIndex(y => y >= 0);
    let max = info.width - 1; while (profile[max] < 0) max--;
    const left = fitLine(profile, ...spec.ranges[0]), right = fitLine(profile, ...spec.ranges[1]);
    const crossX = (right.intercept - left.intercept) / (left.slope - right.slope);
    const anchors = [[min, left.slope * min + left.intercept],
      [crossX, left.slope * crossX + left.intercept], [max, right.slope * max + right.intercept]];
    const pixels = register(data, info.width, info.height, anchors, spec.targets);
    const registered = bottomProfile(pixels, WIDTH, HEIGHT);
    const leftFit = fitLine(registered, spec.targets[0][0] + 40, spec.targets[1][0] - 40);
    const rightFit = fitLine(registered, spec.targets[1][0] + 40, spec.targets[2][0] - 40);
    assert(Math.abs(leftFit.slope - 0.5) < 0.005, `${spec.axis}: left ground edge`);
    assert(Math.abs(rightFit.slope + 0.5) < 0.005, `${spec.axis}: right ground edge`);
    let borderMaxAlpha = 0;
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      if (x < 16 || y < 16 || x >= WIDTH - 16 || y >= HEIGHT - 16)
        borderMaxAlpha = Math.max(borderMaxAlpha, pixels[(y * WIDTH + x) * 4 + 3]);
    }
    assert.equal(borderMaxAlpha, 0, `${spec.axis}: transparent safety margin`);
    const png = await sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png().toBuffer();
    const output = `${OUTPUT}/tunnel_${spec.axis}_rear_v1.png`;
    if (check) assert.equal(hash(fs.readFileSync(path.join(ROOT, output))), hash(png), output);
    else fs.writeFileSync(path.join(ROOT, output), png);
    const front = `${OUTPUT}/tunnel_${spec.axis}_v1.png`;
    const frontBytes = fs.readFileSync(path.join(ROOT, front));
    metadata.assets.push({ axis: spec.axis, mouthsFace: spec.facing, footprintTiles: spec.tiles,
      output, outputSha256: hash(png), source, sourceSha256: hash(bytes),
      frontReference: front, frontReferenceSha256: hash(frontBytes),
      sourceBaseAnchors: anchors, targetBaseAnchors: spec.targets,
      rasterBaseSlopes: [leftFit.slope, rightFit.slope], borderMaxAlpha });
    layers.push({ input: await sharp(frontBytes).resize(660, 440).toBuffer(), left: 20, top: 190 + i * 470 });
    layers.push({ input: await sharp(png).resize(660, 440).toBuffer(), left: 740, top: 190 + i * 470 });
  }
  const metadataFile = path.join(ROOT, 'data/undersea-tunnel-rear-assets.json');
  if (check) assert.deepEqual(JSON.parse(fs.readFileSync(metadataFile)), metadata);
  else fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2) + '\n');

  const header = Buffer.from(`<svg width="1440" height="1100" xmlns="http://www.w3.org/2000/svg">
    <rect width="1440" height="1100" fill="#eef1ef"/>
    <g font-family="sans-serif" fill="#263b39">
      <text x="40" y="49" font-size="26" font-weight="bold">Twin-bore undersea tunnel / four views</text>
      <text x="40" y="83" font-size="17">Two road axes, each with front and reverse-facing rear views</text>
      <text x="40" y="129" font-size="20">Front views</text>
      <text x="760" y="129" font-size="20">Rear views · mouths face away</text>
      <text x="40" y="177" font-size="17">NS road axis · SE / NW</text>
      <text x="40" y="659" font-size="17">EW road axis · SW / NE</text>
      <text x="40" y="1070" font-size="15">Same footprint scale · transparent PNG sprites · two parallel roads per entrance</text>
    </g>
  </svg>`);
  const preview = await sharp(header).composite(layers).png().toBuffer();
  const previewFile = path.join(ROOT, ART, 'four-views.png');
  if (check) assert.equal(hash(fs.readFileSync(previewFile)), hash(preview), 'four-views.png');
  else fs.writeFileSync(previewFile, preview);
  console.log(JSON.stringify({ mode: check ? 'verified' : 'prepared', assets: metadata.assets.map(a => ({
    output: a.output, slopes: a.rasterBaseSlopes, borderMaxAlpha: a.borderMaxAlpha,
  })) }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
