const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
function verifyPackedCoordinates(manifest, packId, bytes, codes) {
  assert.equal(codes.length, manifest.world.width * manifest.world.height);
  for (const [id, entry] of Object.entries(manifest.chunks)) {
    if (entry.pack !== packId) continue;
    const [, x, y] = id.split(':').map(Number);
    for (let row = 0; row < entry.height; row++) for (let col = 0; col < entry.width; col++) {
      const worldCol = x * 64 + col, worldRow = y * 64 + row;
      if (bytes[entry.offset + (row * entry.width + col) * 3] !== codes[worldRow * manifest.world.width + worldCol]) {
        throw new Error(`Terrain geography mismatch at ${worldCol},${worldRow}`);
      }
    }
  }
}
async function verifyWorldTerrain(root = ROOT) {
  const base = path.join(root, 'data/world-terrain'), manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
  const { WorldTerrainProvider } = require('../world/world-terrain-provider');
  const provider = new WorldTerrainProvider(manifest, { fetchBytes: async () => { throw Error('Verification must not fetch'); } }); provider.destroy();
  const { legacyAdapterSource, decodeTerrainRows } = await import('../world/terrain-pack-builder.mjs');
  const source = fs.readFileSync(path.join(root, 'hk-terrain-tiles.js'), 'utf8'), context = vm.createContext({});
  vm.runInContext(`${source}\nglobalThis.terrain=HK_TERRAIN_TILES;`, context);
  const terrain = context.terrain, codes = decodeTerrainRows(terrain.rows, terrain.width, terrain.height);
  assert.equal(manifest.sourceSha256, sha(source), 'World terrain source is stale');
  assert.equal(manifest.rawTerrainSha256, sha(codes), 'World terrain coordinates are stale');
  assert.deepEqual(manifest.geography, { westE: terrain.westE, northN: terrain.northN, tileMetres: terrain.tileMetres });
  assert.equal(manifest.adapterSha256, sha(legacyAdapterSource()), 'World projection adapter is stale');
  assert.equal(manifest.adapterSha256, sha(fs.readFileSync(path.join(base, 'legacy-terrain-adapter.js'))));
  assert.equal(Object.keys(manifest.chunks).length, 1900); assert.equal(Object.keys(manifest.packs).length, 130);
  const required = [manifest.art.image, manifest.art.atlas, ...manifest.lod.map(v => v.url), ...Object.values(manifest.construction).map(v => v.url)];
  assert.equal(Object.keys(manifest.localLod.regions).length, 130);
  for (const region of Object.values(manifest.localLod.regions)) { assert.equal(region.views.length, 4); required.push(...region.views.map(v => v.url)); }
  assert.equal(manifest.regionalLod?.version, 1, 'Main-camera coastline backdrops are stale');
  assert.equal(manifest.regionalLod.size, 256); assert.equal(Object.keys(manifest.regionalLod.regions).length, 130);
  for (const region of Object.values(manifest.regionalLod.regions)) { assert.equal(region.views.length, 4); required.push(...region.views.map(v => v.url)); }
  for (const relative of required) assert(fs.statSync(path.join(base, relative)).isFile(), `Missing world asset ${relative}`);
  for (const [id, pack] of Object.entries(manifest.packs)) {
    const bytes = fs.readFileSync(path.join(base, pack.url)); assert.equal(bytes.length, pack.bytes); assert.equal(sha(bytes), pack.sha256, `Corrupt pack ${pack.url}`);
    verifyPackedCoordinates(manifest, id, bytes, codes);
  }
  return { manifest, files: walk(base) };
}
async function ensureWorldTerrain() {
  try { return await verifyWorldTerrain(); } catch (error) {
    console.log(`Rebuilding world assets: ${error.message}`);
    const { buildTerrainPacks } = await import('../world/terrain-pack-builder.mjs'); await buildTerrainPacks({ progress: console.log }); return verifyWorldTerrain();
  }
}
async function bundleWorldWeb({ output, add }) {
  const { manifest, files } = await ensureWorldTerrain(), assets = {}, core = [];
  for (const file of files) {
    const logical = path.relative(ROOT, file).split(path.sep).join('/'), target = await add(logical, file); assets[`/${logical}`] = `/${target}`;
    if (!/\/(?:packs|local|regional)\//.test(logical) && !/\/trial-r\d/.test(logical)) core.push(target);
  }
  const roads = require('../road-tile-sets').ROAD_TILE_LOGICAL_FILES;
  for (const logical of [...new Set(Object.values(roads))].map(file => `kenney_isometric-roads/png/${file}`)
    .concat(['x', 'y', 'cross_xy'].map(axis => `Models/metroTrack/metro_track_${axis}.png`))) {
    const target = await add(logical, path.join(ROOT, logical)); assets[`/${logical}`] = `/${target}`; core.push(target);
  }
  let html = fs.readFileSync(path.join(ROOT, 'world/benchmark.html'), 'utf8');
  for (const [, src] of [...html.matchAll(/<script src="([^"]+)"/g)]) {
    const file = path.resolve(ROOT, 'world', src), target = await add(path.relative(ROOT, file), file); core.push(target); html = html.replace(`src="${src}"`, `src="../${target}"`);
  }
  const style = await add('world/preview.css', path.join(ROOT, 'world/preview.css')); core.push(style); html = html.replace('href="preview.css"', `href="../${style}"`);
  const config = `globalThis.HEUNG_SHING_WORLD_PLATFORM='web';globalThis.HEUNG_SHING_WORLD_ASSETS=${JSON.stringify(assets)};`;
  const configPath = `assets/${sha(config)}.js`; output(configPath, config); core.push(configPath);
  html = html.replace('<script ', `<script src="../${configPath}"></script>\n  <script `);
  output('world/benchmark.html', html);
  output('world/index.html', fs.readFileSync(path.join(ROOT, 'world/index.html'))); output('world/preview.html', fs.readFileSync(path.join(ROOT, 'world/preview.html')));
  output('data/world-web-assets.json', JSON.stringify({ assets, manifestHash: sha(JSON.stringify(manifest)) }));
  return { core: [...new Set(core)], files: files.length, packs: 130, storageChunks: 1900, renderChunkTiles: 32 };
}
module.exports = { verifyWorldTerrain, verifyPackedCoordinates, ensureWorldTerrain, bundleWorldWeb };
if (require.main === module) (process.argv.includes('--ensure') ? ensureWorldTerrain() : verifyWorldTerrain())
  .then(({ files }) => console.log(`Verified ${files.length} world assets, 1900 storage chunks and 130 packs.`)).catch(error => { console.error(error); process.exitCode = 1; });
