#!/usr/bin/env node
// Bake road surface line markings (馬路劃線) onto the road tiles that have a calibrated
// placement list (road-line-calibrator.js -> road-line-markings.js ROAD_LINE_TILE_PROFILES).
//
// ONE TILE SHAPE -> SEVERAL BAKED FILES
// A logical tile shape is a catalogue of printed variants (plain/busStop/stopLine/parkingBay/
// ...), each its own bake: newRoadTiles/roadNS_fixed.png yields roadNS_fixed__lines_busStop.png,
// roadNS_fixed__lines_stopLine.png, etc, one per calibrated variant id. Nothing here decides
// which variant a placed map tile actually shows - see road-line-markings.js's header comment.
//
// WHY OFFLINE (same reasoning as scripts/bake-night-textures.js, more so)
// A road tile is the single densest thing on this map - one measured city (旺角) carries 2,439
// of them (docs/performance-notes.md), against a few hundred street lamps or bridge parapet
// segments. Those few hundred lamps alone already cost 24ms/frame as separate draw batches
// before the ANGLE/Metal bufferSubData stall fix; giving every road tile a second overlay
// sprite for its lane markings would dwarf that. So markings are baked into a second, pre-
// composited copy of the tile texture instead: at runtime it's one `sprite.setTexture()` swap,
// exactly like applyBuildingNightTexture in main.js - zero extra draw calls, unchanged from
// today's one-sprite-per-tile cost.
//
// UNLIKE THE NIGHT BAKE, THIS DOES NOT TOUCH THE STAGED MANIFEST
// prepare-release-assets.js only walks Models/ (SOURCE_ROOT). newRoadTiles/ is a sibling
// top-level folder loaded at its own raw path (road-tile-sets.js NEW_ROAD_TILE_LOGICAL_FILES +
// `folder: 'newRoadTiles/'`) with no trim/repad/webp staging step. So this script reads and
// writes plain PNGs directly under newRoadTiles/, in place - no manifest to consult or update,
// and no "packaged vs raw" coordinate mismatch to worry about the way building night baking
// has to (see that script's header comment).
//
// WORKFLOW FOR A TILE THAT IS NOT CALIBRATED YET
// Nothing here touches it: with no placements, no `__lines` file is written, and
// getRoadLineTextureKey's caller (road-line-markings.js applyRoadLineTexture) finds no such
// texture and leaves the tile showing its plain art. Calibrate it with road-line-calibrator.js
// (dev-mode "馬路劃線位置校正" panel button), paste the exported literal into
// ROAD_LINE_TILE_PROFILES in road-line-markings.js, then re-run this script.
//
//   node scripts/bake-road-line-textures.js                 # write *_fixed__lines_<variant>.png next to sources
//   BAKE_SAMPLES=road_cross,road_straight_h node scripts/... # only these logical tiles (every variant)
//   BAKE_PREVIEW=1 node scripts/...                          # write everything to .data/road-line-samples/ instead

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const rlm = require(path.join(ROOT, 'road-line-markings.js'));
const rts = require(path.join(ROOT, 'road-tile-sets.js'));
const { warpQuadImageOnto } = require(path.join(ROOT, 'road-line-warp.js'));

const SAMPLE_DIR = path.join(ROOT, '.data', 'road-line-samples');
const SAMPLE_ONLY = (process.env.BAKE_SAMPLES || '').split(',').map((s) => s.trim()).filter(Boolean);
const PREVIEW = /^1|true$/i.test(process.env.BAKE_PREVIEW || '');

// Straight-RGBA raw buffer for one marking source PNG, cached across placements/variants/tiles
// that reuse the same marking (a bus-stop text mark, say, on several tile shapes).
const markingBufferCache = new Map();
async function loadMarkingBuffer(markingPath) {
  if (markingBufferCache.has(markingPath)) return markingBufferCache.get(markingPath);
  const { data, info } = await sharp(markingPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const entry = { data, width: info.width, height: info.height };
  markingBufferCache.set(markingPath, entry);
  return entry;
}

async function bakeTileVariant(logicalKey, variantId, basePath) {
  const placements = rlm.getRoadLinePlacements(logicalKey, variantId);
  const { data, info } = await sharp(basePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const tileW = info.width;
  const tileH = info.height;

  let painted = 0;
  for (const placement of placements) {
    const markingFile = rlm.getRoadLineMarkingFile(placement.marking);
    if (!markingFile) {
      console.warn(`  ! unknown marking '${placement.marking}' on ${logicalKey}/${variantId}, skipped`);
      continue;
    }
    const markingPath = path.join(ROOT, markingFile.file);
    if (!fs.existsSync(markingPath)) {
      console.warn(`  ! missing marking art ${markingFile.file} on ${logicalKey}/${variantId}, skipped`);
      continue;
    }
    if (!Array.isArray(placement.corners) || placement.corners.length !== 4) {
      console.warn(`  ! '${placement.marking}' on ${logicalKey}/${variantId} has no four-corner quad, skipped`);
      continue;
    }
    const src = await loadMarkingBuffer(markingPath);
    // Normalized (0..1) corners -> this tile's own pixel space - the exact inverse of what
    // road-line-calibrator.js's roadLineCalibrationNormToCanvas does for its preview canvas.
    const corners = placement.corners.map(([x, y]) => [x * tileW, y * tileH]);
    warpQuadImageOnto({
      src: src.data, srcWidth: src.width, srcHeight: src.height,
      dst: data, dstWidth: tileW, dstHeight: tileH,
      corners,
      opacity: placement.opacity ?? 1,
    });
    painted += 1;
  }
  if (!painted) return null;

  const image = sharp(data, { raw: { width: tileW, height: tileH, channels: 4 } }).png();
  return { image, placementCount: painted };
}

async function main() {
  const files = rts.NEW_ROAD_TILE_LOGICAL_FILES || {};
  const logicalKeys = Object.keys(files).filter((k) => rlm.getRoadLineVariantIds(k).length);
  const targets = SAMPLE_ONLY.length ? logicalKeys.filter((k) => SAMPLE_ONLY.includes(k)) : logicalKeys;

  if (!logicalKeys.length) {
    console.log('No calibrated ROAD_LINE_TILE_PROFILES yet - nothing to bake. '
      + 'Calibrate with road-line-calibrator.js first (dev-mode 馬路劃線位置校正 panel), '
      + 'paste the exported literal into road-line-markings.js, then re-run this script.');
    return;
  }
  if (PREVIEW) fs.mkdirSync(SAMPLE_DIR, { recursive: true });

  let written = 0;
  for (const logicalKey of targets) {
    const basePath = path.join(ROOT, 'newRoadTiles', files[logicalKey]);
    if (!fs.existsSync(basePath)) {
      console.warn(`${logicalKey}: no base tile at newRoadTiles/${files[logicalKey]}, skipped`);
      continue;
    }
    for (const variantId of rlm.getRoadLineVariantIds(logicalKey)) {
      const result = await bakeTileVariant(logicalKey, variantId, basePath);
      if (!result) continue;
      const outFile = files[logicalKey].replace(/\.png$/i, `${rlm.ROAD_LINE_TEXTURE_SUFFIX}_${variantId}.png`);
      const outPath = PREVIEW
        ? path.join(SAMPLE_DIR, outFile)
        : path.join(ROOT, 'newRoadTiles', outFile);
      await result.image.toFile(outPath);
      console.log(`${logicalKey}/${variantId}: ${result.placementCount} marking(s) -> ${path.relative(ROOT, outPath)}`);
      written += 1;
    }
  }
  console.log(`\n${written} texture(s) baked${PREVIEW ? ` -> ${path.relative(ROOT, SAMPLE_DIR)}` : ' into newRoadTiles/ in place'}.`);
}

main().catch((error) => {
  console.error('Road line texture bake failed:', error);
  process.exitCode = 1;
});
