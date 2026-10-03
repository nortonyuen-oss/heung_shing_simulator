// Propose ground corners (and, where the asset table has none, a facing) for every 避風塘 texture,
// and record each texture's topmost opaque row (`top`, for props sized by height),
// into data/typhoon-shelter-placement.json - the starting point the 避風塘素材校準 tool refines.
//
//   node scripts/propose-typhoon-shelter-placement.js [--force]
//
// Entries already calibrated by hand (auto: false) are kept; --force re-proposes those too.
// Corners come from the building lot detector when it is confident (straight lot edges: piers,
// platforms, restaurants) and otherwise from the bottom outline's isometric bounds (boats). A part
// without a facing in the table gets one along its longer side for a deep object (depth >= width)
// or its shorter side for a wide one (the restaurants' entrances are on a long side).
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const assets = require(path.join(ROOT, 'typhoon-shelter-assets.js'));
const { detectBuildingGroundCorners } = require(path.join(ROOT, 'building-ground-fit.js'));

const OUT = path.join(ROOT, 'data', 'typhoon-shelter-placement.json');
const FORCE = process.argv.includes('--force');

async function main() {
  const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const parts = { ...(existing.parts || {}) };
  let proposed = 0;
  for (const object of assets.TYPHOON_SHELTER_OBJECTS) {
    for (const [partId, tableFacing] of Object.entries(object.parts)) {
      const file = path.join(ROOT, assets.getTyphoonShelterTexturePath(partId));
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      // the art's topmost opaque row: what a prop sized by height is measured to
      let top = 0;
      while (top < info.height && !data.subarray(top * info.width * 4, (top + 1) * info.width * 4).some((v, i) => i % 4 === 3 && v > 48)) top++;
      if (parts[partId] && parts[partId].auto === false && !FORCE) {
        parts[partId] = { ...parts[partId], top };
        continue;
      }
      const lot = detectBuildingGroundCorners(data, info.width, info.height, { channels: 4 });
      // The lot detector stops at the first thing breaking a straight edge; on a breakwater's
      // rock apron that is often well short of the end, so it only wins when it spans most of
      // what the outline does.
      const outline = assets.proposeTyphoonShelterGroundCorners(data, info.width, info.height);
      const useLot = lot?.confident && (lot.right[0] - lot.left[0]) >= 0.75 * (outline.right[0] - outline.left[0]);
      const ground = useLot ? { left: lot.left, front: lot.front, right: lot.right } : outline;
      let facing = tableFacing;
      if (!facing) {
        const seExtent = ground.front[0] - ground.left[0];
        const swExtent = ground.right[0] - ground.front[0];
        const alongSe = object.depth >= object.width ? seExtent >= swExtent : seExtent < swExtent;
        facing = object.depth === object.width ? 'se' : (alongSe ? 'se' : 'sw');
      }
      parts[partId] = { ground, top, facing, auto: true, method: useLot ? 'lot' : 'outline' };
      proposed += 1;
    }
  }
  const sorted = Object.fromEntries(Object.keys(parts).sort().map((k) => [k, parts[k]]));
  const out = { schemaVersion: 1, parts: sorted, objects: existing.objects || {} };
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`${proposed} part(s) proposed, ${Object.keys(sorted).length - proposed} kept -> ${path.relative(ROOT, OUT)}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
