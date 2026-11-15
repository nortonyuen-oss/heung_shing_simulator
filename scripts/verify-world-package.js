#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict'), asar = require('@electron/asar');
const app = path.resolve(process.argv[2] || 'release/world-phase5/mac/The City of Heung Shing.app');
const archive = app.endsWith('.asar') ? app : path.join(app, 'Contents/Resources/app.asar');
const files = new Set(asar.listPackage(archive).map(file => file.replace(/\\/g, '/').replace(/^\/+/, '')));
const read = file => asar.extractFile(archive, file);
const html = read('world/index.html').toString();
for (const [, src] of html.matchAll(/<script src="([^"]+)"/g)) assert(files.has(path.posix.normalize(`world/${src}`)), `Missing world script ${src}`);
const manifest = JSON.parse(read('data/world-terrain/manifest.json'));
assert.equal(Object.keys(manifest.chunks).length, 1900); assert.equal(Object.keys(manifest.packs).length, 130);
for (const pack of Object.values(manifest.packs)) { const bytes = read(`data/world-terrain/${pack.url}`); assert.equal(bytes.length, pack.bytes); assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), pack.sha256); }
const terrainArt = [manifest.art.image, manifest.art.atlas, ...manifest.lod.map(view => view.url)];
for (const layer of [manifest.localLod, manifest.regionalLod]) for (const region of Object.values(layer.regions)) terrainArt.push(...region.views.map(view => view.url));
for (const file of terrainArt) assert(files.has(`data/world-terrain/${file}`), `Missing terrain art ${file}`);
assert(files.has('node_modules/phaser/dist/phaser.min.js'), 'Runtime Phaser missing from installer');
const models = JSON.parse(read('Models/model-assets.json'));
for (const axis of ['x', 'y', 'cross_xy']) { const entry = models.entries[`Models/metroTrack/metro_track_${axis}.png`]; assert(entry && files.has(entry.packagedPath), `Missing rail ${axis}`); }
for (const file of files) assert(!/^\.(?:git|aws|codex|agents|data)\/|^test-results\/|\.sqlite(?:$|-)|^\.env/.test(file), `Private/test file shipped: ${file}`);
console.log(`Verified desktop package: 1900 storage chunks, 130 checksummed packs, world runtime scripts and local Phaser (${files.size} entries).`);
fs.mkdirSync('test-results/world-phase5', { recursive: true }); fs.writeFileSync('test-results/world-phase5/package-report.json', JSON.stringify({ app, entries: files.size, storageChunks: 1900, packs: 130, localPhaser: true, signed: false, published: false }, null, 2));
