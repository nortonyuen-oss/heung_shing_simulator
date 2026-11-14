const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { test } = require('node:test');
const { WORLD, createWorldConfig, chunkBounds, requiredDetailChunks, parseChunkId } = require('../world/world-config');
const { WorldModeAdapter } = require('../world/world-coordinates');
const { WorldTerrainProvider } = require('../world/world-terrain-provider');
const { WorldChunkManager } = require('../world/world-chunk-manager');
const { WorldChunkRenderer } = require('../world/world-chunk-renderer');
const ROOT = path.resolve(__dirname, '..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const immediate = () => new Promise(resolve => setImmediate(resolve));

function makeTerrainFixture(width = 256, height = 256) {
  const world = createWorldConfig({ width, height });
  const manifest = { format: 'heung-shing-world-terrain', schemaVersion: 1, channels: 3, world,
    baseTerrainVersion: world.baseTerrainVersion, chunks: {}, packs: {} };
  const files = new Map();
  for (let py = 0; py < Math.ceil(height / 256); py++) for (let px = 0; px < Math.ceil(width / 256); px++) {
    const parts = [], pack = `p:${px}:${py}`, url = `packs/p-${px}-${py}.bin`;
    let offset = 0;
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
      const bounds = chunkBounds(world, 's', px * 4 + dx, py * 4 + dy);
      if (!bounds) continue;
      const bytes = new Uint8Array(bounds.width * bounds.height * 3);
      for (let r = 0; r < bounds.height; r++) for (let c = 0; c < bounds.width; c++) {
        const at = (r * bounds.width + c) * 3, level = (bounds.col + c + bounds.row + r) % 9;
        bytes[at] = level + 2; bytes[at + 1] = level ? 6 : 1; bytes[at + 2] = level;
      }
      manifest.chunks[bounds.id] = { pack, offset, length: bytes.length, width: bounds.width, height: bounds.height };
      parts.push(Buffer.from(bytes)); offset += bytes.length;
    }
    const bytes = Buffer.concat(parts); files.set(url, bytes);
    manifest.packs[pack] = { url, bytes: bytes.length, sha256: digest(bytes) };
  }
  return { manifest, files, world };
}

function fakeRenderer(clock = { value: 1 }) {
  const live = new Set(), mounted = [], removed = [];
  return { live, mounted, removed, maxLive: 0,
    beginMount(data) { const job = { id: data.id }; live.add(job); this.maxLive = Math.max(this.maxLive, live.size); return job; },
    stepMount(job) { clock.value += .1; mounted.push(job.id); return true; },
    beginUnmount() {},
    stepUnmount(job) { clock.value += .1; live.delete(job); removed.push(job.id); return true; },
    destroyJob(job) { live.delete(job); removed.push(job.id); },
    snapshot() { return { chunks: live.size }; },
  };
}

async function settle(manager, turns = 200) {
  for (let i = 0; i < turns; i++) {
    manager.pump(); await immediate();
    const stats = manager.snapshot();
    if (stats.states.ACTIVE === stats.wanted && Object.keys(stats.states).length === 1) return stats;
  }
  throw new Error(`Manager did not settle: ${JSON.stringify(manager.snapshot())}`);
}

test('C01-C03: full-world grids and partial right/bottom edges have exact bounds', () => {
  assert.equal(Math.ceil(WORLD.width / 32) * Math.ceil(WORLD.height / 32), 7500);
  assert.equal(Math.ceil(WORLD.width / 64) * Math.ceil(WORLD.height / 64), 1900);
  assert.equal(chunkBounds(WORLD, 'r', 99, 74).width, 19);
  assert.equal(chunkBounds(WORLD, 'r', 99, 74).height, 32);
  assert.equal(chunkBounds(WORLD, 's', 49, 37).width, 51);
  assert.equal(chunkBounds(WORLD, 's', 49, 37).height, 32);
  assert.equal(chunkBounds(WORLD, 'r', 100, 0), null);
  assert.equal(chunkBounds(WORLD, 's', 0, 38), null);
  assert.equal(requiredDetailChunks(WORLD, 0, 0).length, 4);
  assert.equal(requiredDetailChunks(WORLD, 3186, 2399).length, 4);
  assert.throws(() => parseChunkId('32:32'), /Invalid/);
  assert.throws(() => createWorldConfig({ detailRadiusChunks: 2 }), /3x3/);
});

test('trial uses absolute world coordinates and never changes entity/chunk IDs to local coordinates', () => {
  const region = { col: 1536, row: 1536, width: 256, height: 256 };
  const ids = requiredDetailChunks(WORLD, 1600, 1600, region).map(chunk => chunk.id);
  assert.equal(ids.length, 9);
  assert(ids.includes('r:50:50'));
  assert(!ids.includes('r:2:2'));
  const edge = requiredDetailChunks(WORLD, 1536, 1536, region);
  assert.equal(edge.length, 4);
});

test('C04: crossing one render boundary preserves six chunks and replaces three', async () => {
  const world = createWorldConfig({ width: 256, height: 256 }), clock = { value: 1 }, renderer = fakeRenderer(clock);
  const events = [], provider = { getRenderChunk: async id => ({ id, byteLength: 100 }) };
  const manager = new WorldChunkManager({ world, provider, renderer, now: () => clock.value, onEvent: event => events.push(event) });
  manager.setFocus(80, 80); const before = await settle(manager);
  manager.setFocus(112, 80); const after = await settle(manager);
  assert.equal(before.activeIds.filter(id => after.activeIds.includes(id)).length, 6);
  assert.equal(after.mounted - before.mounted, 3);
  assert.equal(after.unmounted - before.unmounted, 3);
  assert.equal(renderer.maxLive, 9);
  assert.equal(events.filter(event => event.type === 'CHUNK_UNMOUNTED').length, 3);
  const epoch = manager.epoch; manager.setFocus(114, 81); assert.equal(manager.epoch, epoch, 'movement inside a chunk schedules no I/O');
  manager.destroy(); assert.equal(renderer.live.size, 0);
});

test('C06: obsolete async results cannot mount, including a jump away and back', async () => {
  const world = createWorldConfig({ width: 256, height: 256 }), clock = { value: 1 }, renderer = fakeRenderer(clock);
  const pending = []; let deferred = true;
  const provider = { getRenderChunk(id) { return deferred ? new Promise(resolve => pending.push({ id, resolve })) : Promise.resolve({ id }); } };
  const manager = new WorldChunkManager({ world, provider, renderer, now: () => clock.value });
  manager.setFocus(48, 48); manager.pump(); await immediate();
  assert.equal(pending.length, 3);
  manager.setFocus(208, 208); manager.pump();
  deferred = false; pending.forEach(job => job.resolve({ id: job.id }));
  const after = await settle(manager);
  assert(renderer.mounted.every(id => !pending.some(old => old.id === id)));
  assert(after.activeIds.every(id => manager.wanted.has(id)));
  manager.setFocus(48, 48); await settle(manager);
  assert.equal(renderer.live.size, 9);
  assert(renderer.maxLive <= 9);
});

test('C15: long-distance exploration reaches a stable mounted object count and destroys old jobs', async () => {
  const world = createWorldConfig({ width: 512, height: 512 }), clock = { value: 1 }, renderer = fakeRenderer(clock);
  const manager = new WorldChunkManager({ world, provider: { getRenderChunk: async id => ({ id }) }, renderer, now: () => clock.value });
  for (let n = 0; n < 40; n++) {
    manager.setFocus(n % 2 ? 432 : 80, (n % 5) * 64 + 64);
    const stats = await settle(manager);
    assert.equal(stats.states.ACTIVE, 9);
    assert.equal(manager.records.size, 9);
    assert.equal(renderer.live.size, 9);
  }
  assert(renderer.removed.length > 250);
  assert.equal(renderer.maxLive, 9);
});

test('a terrain edit remounts only affected render chunks and their one-tile halo', async () => {
  const world = createWorldConfig({ width: 256, height: 256 }), clock = { value: 1 }, renderer = fakeRenderer(clock);
  const manager = new WorldChunkManager({ world, provider: { getRenderChunk: async id => ({ id }) }, renderer, now: () => clock.value });
  manager.setFocus(80, 80); let before = await settle(manager);
  manager.invalidateTiles([{ col: 79, row: 79 }]); let after = await settle(manager);
  assert.equal(after.mounted - before.mounted, 1); assert.equal(after.unmounted - before.unmounted, 1);
  before = after; manager.invalidateTiles([{ col: 63, row: 63 }]); after = await settle(manager);
  assert.equal(after.mounted - before.mounted, 4); assert.equal(after.unmounted - before.unmounted, 4);
  assert.equal(renderer.maxLive, 9);
});

test('C16: decode errors retain a retryable state and recover after backoff', async () => {
  const world = createWorldConfig({ width: 64, height: 64 }), clock = { value: 1 }, renderer = fakeRenderer(clock);
  let calls = 0;
  const provider = { async getRenderChunk(id) { if (++calls === 1) throw new Error('HTTP 404'); return { id }; } };
  const events = [], manager = new WorldChunkManager({ world, provider, renderer, now: () => clock.value, onEvent: event => events.push(event) });
  manager.setFocus(16, 16); manager.pump(); await immediate();
  assert.equal(manager.snapshot().states.ERROR, 1);
  assert(events.some(event => event.type === 'CHUNK_ERROR' && event.error === 'HTTP 404'));
  clock.value += 300; await settle(manager);
  assert.equal(manager.snapshot().states.ERROR, undefined);
});

test('provider deduplicates concurrent I/O, validates bytes, and bounds both caches by bytes', async () => {
  const fixture = makeTerrainFixture(); let requests = 0;
  const provider = new WorldTerrainProvider(fixture.manifest, { digest, expectedWorld: fixture.world, cacheBytes: 24576, packCacheBytes: 196608,
    fetchBytes: async url => { requests++; await immediate(); return fixture.files.get(url); } });
  const a = provider.getStorageChunk('s:0:0'), b = provider.getStorageChunk('s:0:0');
  assert.equal(a, b);
  await Promise.all([a, b, provider.getStorageChunk('s:1:0')]);
  assert.equal(requests, 1);
  for (const id of Object.keys(fixture.manifest.chunks)) await provider.getStorageChunk(id);
  assert(provider.stats.decodedBytes <= 24576);
  assert(provider.stats.packBytes <= 196608);
  provider.destroy(); assert.equal(provider.stats.decodedBytes, 0);
});

test('C05: a render halo reads adjacent storage chunks with matching world heights and terrain', async () => {
  const fixture = makeTerrainFixture(147, 128);
  const provider = new WorldTerrainProvider(fixture.manifest, { digest, expectedWorld: fixture.world, fetchBytes: async url => fixture.files.get(url) });
  const [left, right] = await Promise.all([provider.getRenderChunk('r:1:1'), provider.getRenderChunk('r:2:1')]);
  assert.deepEqual(left.sample(64, 45), right.sample(64, 45));
  assert.deepEqual(right.sample(63, 45), left.sample(63, 45));
  assert.equal(left.sample(64, 45).height, (64 + 45) % 9);
  assert.throws(() => left.sample(66, 45), /outside render halo/);
  const edge = await provider.getRenderChunk('r:4:3');
  assert.equal(edge.bounds.width, 19); assert.equal(edge.bounds.height, 32);
  assert.equal(edge.sample(146, 127).height, (146 + 127) % 9);
});

test('corrupt packs and wrong manifests are rejected, and failed reads can be retried', async () => {
  const fixture = makeTerrainFixture(64, 64); let corrupt = true;
  const provider = new WorldTerrainProvider(fixture.manifest, { digest, expectedWorld: fixture.world, fetchBytes: async url => {
    const bytes = Buffer.from(fixture.files.get(url)); if (corrupt) bytes[0] ^= 1; return bytes;
  } });
  await assert.rejects(provider.getStorageChunk('s:0:0'), /checksum/);
  assert.equal(provider.cache.size, 0); assert.equal(provider.pending.size, 0);
  corrupt = false; assert.equal((await provider.getStorageChunk('s:0:0')).byteLength, 12288);
  const bad = JSON.parse(JSON.stringify(fixture.manifest)); bad.chunks['s:0:0'].width = 63;
  assert.throws(() => new WorldTerrainProvider(bad, { expectedWorld: fixture.world, fetchBytes: async () => [] }), /Invalid terrain index/);
  assert.throws(() => new WorldTerrainProvider(fixture.manifest, { fetchBytes: async () => [] }), /identity mismatch/);
});

test('C12: legacy projection adapter round-trips rectangular worlds in all four rotations', async () => {
  const { legacyAdapterSource } = await import('../world/terrain-pack-builder.mjs');
  const context = vm.createContext({}); vm.runInContext(legacyAdapterSource(), context);
  const projection = context.HeungShingWorld.createLegacyWorldProjection(WORLD), adapter = new WorldModeAdapter(WORLD, projection);
  for (let rotation = 0; rotation < 4; rotation++) {
    adapter.setRotation(rotation);
    for (const [col, row] of [[0, 0], [3186, 2399], [1634.25, 1198.75]]) {
      const point = adapter.project(col, row), tile = adapter.unproject(point.x, point.y);
      assert(Math.abs(tile.col - col) < 1e-9 && Math.abs(tile.row - row) < 1e-9);
      const camera = { width: 1280, height: 800, zoom: .4, originX: .5, originY: .5, scrollX: point.x - 640, scrollY: point.y - 400 };
      const focus = adapter.cameraFocus(camera);
      assert(Math.abs(focus.col - col) < 1e-9 && Math.abs(focus.row - row) < 1e-9);
    }
  }
});

test('renderer batches by world depth, mounts incrementally, and really destroys Phaser objects', () => {
  let ticks = 0; const now = () => ticks += .01, objects = [];
  const scene = { textures: { get: () => ({ has: () => true, get: () => ({ height: 80 }) }) }, add: { blitter() {
    const object = { visible: false, bobs: [], setDepth(value) { this.depth = value; return this; }, setVisible(value) { this.visible = value; return this; },
      create(x, y, frame) { this.bobs.push({ x, y, frame }); }, destroy() { this.destroyed = true; this.bobs.length = 0; } };
    objects.push(object); return object;
  } } };
  const renderer = new WorldChunkRenderer({ scene, now, adapter: { rotation: 0, project: (c, r) => ({ x: (c - r) * 50, y: (c + r) * 25 }) },
    visuals: { describe: () => ({ key: 'ground_full', offset: 0, shade: 0 }) } });
  const job = renderer.beginMount({ bounds: { col: 32, row: 64, width: 32, height: 32 }, sample: () => ({ terrainType: 1, height: 0 }) });
  assert.equal(renderer.stepMount(job, now() + 3), false);
  assert(objects.every(object => !object.visible));
  while (!renderer.stepMount(job, now() + 3)) {}
  assert.equal(renderer.snapshot().terrainTiles, 1024);
  assert.equal(renderer.snapshot().gameObjects, 63, 'one depth batch per diagonal, not 1024 Images');
  assert.equal(Math.min(...objects.map(object => object.depth)), (32 + 64) * 25);
  renderer.beginUnmount(job); while (!renderer.stepUnmount(job, now() + .2)) {}
  assert.equal(renderer.snapshot().gameObjects, 0); assert.equal(renderer.snapshot().terrainTiles, 0);
  assert(objects.every(object => object.destroyed));
});

test('RLE preprocessing validates full rows and preserves the legacy finishing result', async () => {
  const { decodeTerrainRows, prepareTerrain } = await import('../world/terrain-pack-builder.mjs');
  assert.deepEqual([...decodeTerrainRows(['W2Ba2', 'i5'], 5, 2)], [0, 0, 1, 2, 2, 10, 10, 10, 10, 10]);
  for (const rows of [['W0'], ['W4!'], ['?W4'], ['W5'], ['W3']]) assert.throws(() => decodeTerrainRows(rows, 4, 1), /terrain/);
  const width = 16, height = 16, codes = Uint8Array.from({ length: width * height }, (_, i) => (i * 17 + Math.floor(i / 7)) % 11);
  const result = prepareTerrain(codes, width, height);
  const terrain = Array.from({ length: height }, (_, r) => Array.from(codes.subarray(r * width, (r + 1) * width), code => code === 0 ? 5 : code === 1 ? 4 : code === 2 ? 1 : 6));
  const elevations = Array.from({ length: height }, (_, r) => Array.from(codes.subarray(r * width, (r + 1) * width), code => code > 2 ? code - 2 : 0));
  const context = vm.createContext({ MAP_WIDTH: width, MAP_HEIGHT: height, GROUND: 1, ROAD: 2, DIRT: 3, BEACH: 4, WATER: 5, HILL: 6, MAX_TERRAIN_HEIGHT: 8,
    isInsideMap: (r, c) => r >= 0 && r < height && c >= 0 && c < width,
    areOppositeDirs: (a, b) => ({ n: 's', s: 'n', e: 'w', w: 'e' }[a] === b), terrain, elevations });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'terrain-generation.js'), 'utf8'), context);
  vm.runInContext('finishHkTerrain(terrain,elevations)', context);
  assert.deepEqual([...result.terrain], terrain.flat()); assert.deepEqual([...result.elevations], elevations.flat());
});
