#!/usr/bin/env node
// Compare a named district's sea/land at every world tile centre against the
// main-camera regional backdrops, in all four rotations. No city data is opened.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { verifyWorldTerrain } = require('./world-release-assets');
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const districtId = process.argv[2] || 'aberdeen', { manifest } = await verifyWorldTerrain();
  const base = path.join(ROOT, 'data/world-terrain'), context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'hk-district-maps.js'), 'utf8') + '\nglobalThis.districts=HK_DISTRICT_MAPS;', context);
  vm.runInContext(fs.readFileSync(path.join(base, 'legacy-terrain-adapter.js'), 'utf8'), context);
  const district = context.districts.find(value => value.id === districtId); assert(district, 'Unknown district');
  const geography = manifest.geography, span = 256;
  const col0 = Math.round((district.centre.e - geography.westE - span * geography.tileMetres / 2) / geography.tileMetres);
  const row0 = Math.round((geography.northN - district.centre.n - span * geography.tileMetres / 2) / geography.tileMetres);
  const projection = context.HeungShingWorld.createLegacyWorldProjection(manifest.world), packs = new Map(), rotations = [];
  for (let rotation = 0; rotation < 4; rotation++) {
    projection.setRotation(rotation); const images = new Map(); let mismatches = 0;
    for (let row = row0; row < row0 + span; row++) for (let col = col0; col < col0 + span; col++) {
      const chunk = manifest.chunks[`s:${Math.floor(col / 64)}:${Math.floor(row / 64)}`];
      if (!packs.has(chunk.pack)) packs.set(chunk.pack, fs.readFileSync(path.join(base, manifest.packs[chunk.pack].url)));
      const at = chunk.offset + ((row % 64) * chunk.width + col % 64) * 3;
      const water = packs.get(chunk.pack)[at + 1] === 5;
      const view = manifest.regionalLod.regions[`${Math.floor(col / 256)}:${Math.floor(row / 256)}`].views[rotation];
      if (!images.has(view.url)) images.set(view.url, await sharp(path.join(base, view.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
      const image = images.get(view.url), point = projection.project(col, row);
      const x = Math.max(0, Math.min(image.info.width - 1, Math.floor((point.x - view.x) / view.width * image.info.width)));
      const y = Math.max(0, Math.min(image.info.height - 1, Math.floor((point.y - 40 - view.y) / view.height * image.info.height)));
      const pixel = (y * image.info.width + x) * 4;
      // The canonical terrain palette distinguishes blue water from grass/sand
      // at every altitude; checking centres also catches shifted/rotated rasters.
      const depictedWater = image.data[pixel + 2] > image.data[pixel];
      if (water !== depictedWater || image.data[pixel + 3] !== 255) mismatches++;
    }
    rotations.push({ rotation, checkedTiles: span * span, seaLandMismatches: mismatches });
  }
  const report = { district: districtId, bounds: { col: col0, row: row0, width: span, height: span },
    sourceSha256: manifest.sourceSha256, allPackedCoordinatesVerified: manifest.world.width * manifest.world.height, rotations,
    note: 'Verifies 20 m full-territory tile centres; district crops can have a different 5 m sampling origin. Does not assert sub-tile or real-world survey accuracy.' };
  const output = path.join(ROOT, 'test-results/world-geography'); fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, `${districtId}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert(rotations.every(result => result.seaLandMismatches === 0), 'Regional backdrop changes the coastline');
})().catch(error => { console.error(error); process.exitCode = 1; });
