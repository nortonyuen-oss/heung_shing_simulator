#!/usr/bin/env node
'use strict';

// Separate already-isolated generated figures. No repainting, warping or scaling.
// Detection uses alpha>=128; every RGBA pixel inside each final rectangle is retained.
// node scripts/prepare-street-food-people.js [--check]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'scripts/source-art/streetFood/people-v1');
const OUTPUT = path.join(ROOT, 'Models/streetFoodPeople');
const MANIFEST = path.join(ROOT, 'data/street-food-people.json');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const assert = (value, message) => { if (!value) throw new Error(message); };

function components(data, width, height) {
  const seen = new Uint8Array(width * height), stack = new Int32Array(width * height), found = [];
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || data[start * 4 + 3] < 128) continue;
    let size = 1, area = 0, left = width, right = 0, top = height, bottom = 0;
    stack[0] = start; seen[start] = 1;
    while (size) {
      const index = stack[--size], x = index % width, y = Math.floor(index / width);
      area++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || x + dx < 0 || y + dy < 0 || x + dx >= width || y + dy >= height) continue;
        const next = (y + dy) * width + x + dx;
        if (seen[next] || data[next * 4 + 3] < 128) continue;
        seen[next] = 1; stack[size++] = next;
      }
    }
    if (area >= width * height * 0.003) found.push({ area, left, top, right: right + 1, bottom: bottom + 1, centerX: (left + right) / 2, centerY: (top + bottom) / 2 });
  }
  return found;
}

function cropRectangles(found, width, height, cols, rows) {
  assert(found.length === cols * rows, `Expected ${cols * rows} independent people, detected ${found.length}`);
  const byY = [...found].sort((a, b) => a.centerY - b.centerY);
  const groups = Array.from({ length: rows }, (_, row) => byY.slice(row * cols, (row + 1) * cols).sort((a, b) => a.centerX - b.centerX));
  return groups.flatMap((group, row) => {
    const xCuts = [0];
    for (let col = 1; col < cols; col++) {
      assert(group[col - 1].right <= group[col].left, 'People overlap within a row; manual extraction needed');
      xCuts.push(Math.floor((group[col - 1].right + group[col].left) / 2));
    }
    xCuts.push(width);
    return group.map((component, col) => {
      // Main silhouette plus 20px clearance, never crossing its neighbours' gap.
      const left = Math.max(xCuts[col], component.left - 20), right = Math.min(xCuts[col + 1], component.right + 20);
      let top = Math.max(0, component.top - 20), bottom = Math.min(height, component.bottom + 20);
      // Generated rows are not ruler-straight: compare only neighbours sharing
      // this horizontal span, so one person's shoes cannot crop another column.
      for (const other of found) {
        if (other === component || other.right <= left || other.left >= right || group.includes(other)) continue;
        if (other.bottom <= component.top) top = Math.max(top, Math.floor((other.bottom + component.top) / 2));
        else if (component.bottom <= other.top) bottom = Math.min(bottom, Math.ceil((component.bottom + other.top) / 2));
        else throw new Error('Neighbouring silhouettes interlock; manual extraction needed');
      }
      assert(left <= component.left && top <= component.top && right >= component.right && bottom >= component.bottom, 'Crop clips a main body');
      return { crop: [left, top, right - left, bottom - top], component };
    });
  });
}

async function main() {
  const check = process.argv.includes('--check'), plan = JSON.parse(fs.readFileSync(path.join(SOURCE, 'people-plan.json'), 'utf8'));
  const prepared = [], sources = [];
  for (const pack of plan.packs) {
    const sourceBytes = fs.readFileSync(path.join(ROOT, pack.sourcePath));
    const { data, info } = await sharp(sourceBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const found = components(data, info.width, info.height);
    const crops = cropRectangles(found, info.width, info.height, ...pack.grid);
    assert(crops.length === pack.people.length, `${pack.id}: role count mismatch`);
    sources.push({ id: pack.id, path: pack.sourcePath, sha256: sha(sourceBytes), size: [info.width, info.height], figures: crops.length, promptPath: pack.promptPath });
    for (let i = 0; i < crops.length; i++) {
      const person = pack.people[i], { crop, component } = crops[i], [left, top, width, height] = crop;
      const png = await sharp(sourceBytes).extract({ left, top, width, height }).extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#00000000' }).png({ compressionLevel: 9 }).toBuffer();
      let footX = 0, footSamples = 0;
      for (let y = Math.max(component.top, component.bottom - 5); y < component.bottom; y++) for (let x = component.left; x < component.right; x++) {
        if (data[(y * info.width + x) * 4 + 3] < 128) continue;
        footX += x; footSamples++;
      }
      const footY = component.bottom - 1 - top + 8;
      // the figure's own head-to-foot span in output px (its alpha>=128 silhouette, not the padded
      // canvas): what a real height is measured against
      const figureTop = component.top - top + 8;
      const record = { ...person, pack: pack.id, sourcePath: pack.sourcePath, sourceRect: crop, outputPath: `Models/streetFoodPeople/sp_${person.id}.png`, size: [width + 16, height + 16], footAnchor: [((footSamples ? footX / footSamples : component.centerX) - left) + 8, footY], figureTop, figureHeightPx: footY - figureTop, anchorMethod: 'Approximate lowest visible foot contour: mean x of alpha>=128 pixels in the final five silhouette rows. Seated poses use proposed seatAnchor instead of a floor contact.', pngSha256: sha(png) };
      if (plan.seatedSourceAnchors[person.id]) {
        const anchor = plan.seatedSourceAnchors[person.id];
        assert(anchor[0] >= left && anchor[0] < left + width && anchor[1] >= top && anchor[1] < top + height, `${person.id}: seat anchor outside person crop`);
        record.seatAnchor = [anchor[0] - left + 8, anchor[1] - top + 8];
        record.seatAnchorMethod = plan.seatedAnchorMethod;
      }
      prepared.push({ record, png });
      console.log(`${pack.id}/${person.id}: ${width + 16}×${height + 16}`);
    }
  }
  assert(prepared.length === 24, 'Expected 24 people');
  const manifest = { version: 1, tool: plan.tool, projectionTarget: plan.projectionTarget, poseSet: plan.poseSet, runtimeIntegrated: false, actualScaleCalibration: 'pending', sourceLayout: 'Four preserved atlases; 24 independent PNGs extracted without repainting or scaling.', sources, people: prepared.map((p) => p.record) };
  if (check) {
    assert(JSON.stringify(JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))) === JSON.stringify(manifest), 'Metadata differs from rebuild');
    for (const { record } of prepared) assert(sha(fs.readFileSync(path.join(ROOT, record.outputPath))) === record.pngSha256, `Output changed: ${record.id}`);
  } else {
    fs.mkdirSync(OUTPUT, { recursive: true });
    for (const { record, png } of prepared) fs.writeFileSync(path.join(ROOT, record.outputPath), png);
    fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  for (const source of sources) assert(sha(fs.readFileSync(path.join(ROOT, source.path))) === source.sha256, 'Source PNG changed');
  console.log(`${check ? 'Verified' : 'Prepared'} 24 individual people; 4 original atlases unchanged.`);
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { components, cropRectangles };
