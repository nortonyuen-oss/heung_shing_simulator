(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./world-config') : root.HeungShingWorld,
    typeof module !== 'undefined' && module.exports ? require('./world-crypto') : root.HeungShingWorld);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function (configApi, cryptoApi) {
  'use strict';
  const { createWorldConfig, chunkBounds, parseChunkId } = configApi;
  const sha256 = cryptoApi.worldSha256;

  class WorldTerrainProvider {
    constructor(manifest, { fetchBytes, cacheBytes = 2 * 1024 * 1024, packCacheBytes = 1024 * 1024, concurrency = 3,
      digest = sha256, renderChunkTiles = 32, expectedWorld = configApi.WORLD, onEvent = () => {} } = {}) {
      if (manifest?.format !== 'heung-shing-world-terrain' || manifest.schemaVersion !== 1
        || manifest.channels !== 3 || !manifest.chunks || !manifest.packs) throw new Error('Unsupported terrain manifest');
      this.world = createWorldConfig(manifest.world);
      if (![32, 64].includes(renderChunkTiles)) throw new Error('Invalid benchmark render size');
      this.renderWorld = Object.freeze({ ...this.world, renderChunkTiles });
      if (['id', 'width', 'height', 'tileMetres', 'baseTerrainVersion'].some(key => manifest.world[key] !== expectedWorld[key])
        || manifest.baseTerrainVersion !== expectedWorld.baseTerrainVersion) throw new Error('Terrain identity mismatch');
      this.manifest = manifest;
      this.fetchBytes = fetchBytes;
      if (typeof fetchBytes !== 'function') throw new Error('Terrain byte reader required');
      this.cacheBudget = cacheBytes;
      this.packBudget = packCacheBytes;
      this.concurrency = concurrency;
      if (!Number.isSafeInteger(cacheBytes) || cacheBytes < 0 || !Number.isSafeInteger(packCacheBytes) || packCacheBytes < 0
        || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) throw new Error('Invalid terrain cache/concurrency budget');
      this.digest = digest;
      this.onEvent = onEvent;
      this.cache = new Map(); this.packs = new Map();
      this.pending = new Map(); this.packPending = new Map();
      this.queue = []; this.running = 0; this.closed = false;
      this.stats = { decodedBytes: 0, packBytes: 0, networkBytes: 0, hits: 0, misses: 0, requests: 0 };
      this.validateManifest();
    }
    validateManifest() {
      const expected = Math.ceil(this.world.width / 64) * Math.ceil(this.world.height / 64);
      if (Object.keys(this.manifest.chunks).length !== expected) throw new Error('Incomplete terrain chunk index');
      for (const [id, entry] of Object.entries(this.manifest.chunks)) {
        const { x, y } = parseChunkId(id, 's');
        const bounds = chunkBounds(this.world, 's', x, y), pack = this.manifest.packs[entry.pack];
        if (!bounds || bounds.id !== id || !pack || entry.width !== bounds.width || entry.height !== bounds.height
          || !Number.isInteger(entry.offset) || entry.offset < 0 || entry.length !== bounds.width * bounds.height * 3
          || !Number.isSafeInteger(pack.bytes) || pack.bytes <= 0 || pack.bytes > 256 * 256 * 3
          || entry.offset + entry.length > pack.bytes || !/^[a-f0-9]{64}$/.test(pack.sha256)
          || !/^packs\/p-\d+-\d+\.bin$/.test(pack.url)) throw new Error(`Invalid terrain index ${id}`);
      }
    }
    touch(map, id) { const value = map.get(id); if (value) { map.delete(id); map.set(id, value); } return value; }
    trim(map, stat, budget) {
      while (this.stats[stat] > budget && map.size) {
        const id = map.keys().next().value, value = map.get(id);
        map.delete(id); this.stats[stat] -= value.byteLength;
      }
    }
    schedule(action) {
      return new Promise((resolve, reject) => { this.queue.push({ action, resolve, reject }); this.pump(); });
    }
    pump() {
      while (!this.closed && this.running < this.concurrency && this.queue.length) {
        const job = this.queue.shift(); this.running++;
        Promise.resolve().then(job.action).then(job.resolve, job.reject).finally(() => { this.running--; this.pump(); });
      }
    }
    async getPack(id) {
      if (this.closed) throw new Error('Terrain provider closed');
      const cached = this.touch(this.packs, id);
      if (cached) return cached;
      if (this.packPending.has(id)) return this.packPending.get(id);
      const entry = this.manifest.packs[id];
      const promise = this.schedule(async () => {
        if (this.closed) throw new Error('Terrain provider closed');
        this.stats.requests++;
        const value = await this.fetchBytes(entry.url);
        const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
        this.stats.networkBytes += bytes.byteLength;
        if (bytes.byteLength !== entry.bytes || await this.digest(bytes) !== entry.sha256) throw new Error(`Terrain checksum mismatch ${id}`);
        if (this.closed) throw new Error('Terrain provider closed');
        this.packs.set(id, bytes); this.stats.packBytes += bytes.byteLength;
        this.trim(this.packs, 'packBytes', this.packBudget);
        return bytes;
      }).finally(() => this.packPending.delete(id));
      this.packPending.set(id, promise);
      return promise;
    }
    getStorageChunk(id) {
      if (this.closed) return Promise.reject(new Error('Terrain provider closed'));
      const cached = this.touch(this.cache, id);
      if (cached) { this.stats.hits++; return Promise.resolve(cached); }
      if (this.pending.has(id)) return this.pending.get(id);
      const entry = this.manifest.chunks[id];
      if (!entry) return Promise.reject(new Error(`Missing terrain chunk ${id}`));
      this.stats.misses++;
      const promise = this.getPack(entry.pack).then(pack => {
        const bytes = pack.slice(entry.offset, entry.offset + entry.length);
        for (let i = 0; i < bytes.length; i += 3) {
          if (bytes[i] > 10 || ![1, 4, 5, 6].includes(bytes[i + 1]) || bytes[i + 2] > 8) throw new Error(`Invalid terrain codes ${id}`);
        }
        if (this.closed) throw new Error('Terrain provider closed');
        this.cache.set(id, bytes); this.stats.decodedBytes += bytes.byteLength;
        this.trim(this.cache, 'decodedBytes', this.cacheBudget);
        return bytes;
      }).finally(() => this.pending.delete(id));
      this.pending.set(id, promise);
      return promise;
    }
    async getRenderChunk(id) {
      const { x, y } = parseChunkId(id, 'r');
      const bounds = chunkBounds(this.renderWorld, 'r', x, y);
      if (!bounds) throw new Error(`Out-of-world render chunk ${id}`);
      // A one-tile halo comes from neighbouring storage chunks, never from per-chunk smoothing.
      const left = Math.max(0, bounds.col - 1), top = Math.max(0, bounds.row - 1);
      const right = Math.min(this.world.width, bounds.col + bounds.width + 1), bottom = Math.min(this.world.height, bounds.row + bounds.height + 1);
      const storage = new Map();
      const reads = [];
      for (let sy = Math.floor(top / 64); sy <= Math.floor((bottom - 1) / 64); sy++) {
        for (let sx = Math.floor(left / 64); sx <= Math.floor((right - 1) / 64); sx++) {
          const sid = `s:${sx}:${sy}`;
          reads.push(this.getStorageChunk(sid).then(bytes => storage.set(sid, bytes)));
        }
      }
      await Promise.all(reads);
      const width = right - left, height = bottom - top, bytes = new Uint8Array(width * height * 3);
      for (let row = top; row < bottom; row++) for (let col = left; col < right; col++) {
        const sx = Math.floor(col / 64), sy = Math.floor(row / 64), sid = `s:${sx}:${sy}`;
        const sourceWidth = this.manifest.chunks[sid].width;
        const from = ((row - sy * 64) * sourceWidth + col - sx * 64) * 3;
        const to = ((row - top) * width + col - left) * 3;
        bytes.set(storage.get(sid).subarray(from, from + 3), to);
      }
      return { id, bounds, bytes, byteLength: bytes.byteLength, sample(col, row) {
        if (col < left || col >= right || row < top || row >= bottom) throw new Error(`Tile outside render halo ${id}`);
        const at = ((row - top) * width + col - left) * 3;
        return { code: bytes[at], terrainType: bytes[at + 1], height: bytes[at + 2] };
      } };
    }
    snapshot() { return { ...this.stats, pending: this.pending.size, queued: this.queue.length, reading: this.running }; }
    destroy() {
      this.closed = true;
      this.queue.splice(0).forEach(job => job.reject(new Error('Terrain provider closed')));
      this.cache.clear(); this.packs.clear(); this.stats.decodedBytes = 0; this.stats.packBytes = 0;
    }
  }
  return { WorldTerrainProvider, terrainSha256: sha256 };
});
