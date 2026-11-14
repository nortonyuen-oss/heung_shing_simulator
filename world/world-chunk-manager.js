(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./world-config') : root.HeungShingWorld);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function (configApi) {
  'use strict';
  const { requiredDetailChunks } = configApi;
  class WorldChunkManager {
    constructor({ world, region, provider, renderer, budgetMs = 3, concurrency = 3, now = () => performance.now(), onEvent = () => {} }) {
      Object.assign(this, { world, region, provider, renderer, budgetMs, concurrency, now, onEvent });
      this.records = new Map(); this.wanted = new Set(); this.epoch = 0; this.focusKey = null; this.closed = false;
      this.stats = { mounted: 0, unmounted: 0, obsolete: 0, errors: 0, maxMounted: 0, maxPumpMs: 0 };
    }
    event(type, record, extra = {}) {
      this.onEvent({ type, worldId: this.world.id, chunkId: record.id, generation: record.epoch, ...extra });
    }
    setFocus(col, row) {
      if (this.closed) return;
      const chunks = requiredDetailChunks(this.world, col, row, this.region);
      const key = chunks.map(chunk => chunk.id).join('|');
      if (key === this.focusKey) return;
      this.focusKey = key; this.epoch++;
      this.wanted = new Set(chunks.map(chunk => chunk.id));
      for (const [id, record] of this.records) {
        if (!this.wanted.has(id) && !['UNMOUNTING', 'EVICTED'].includes(record.state)) {
          record.obsolete = true;
          if (record.job) record.state = 'UNMOUNTING';
          else if (record.state !== 'DECODING') this.records.delete(id);
          this.stats.obsolete++; this.event('CHUNK_REQUEST_OBSOLETE', record);
        }
      }
      for (const chunk of chunks) {
        let record = this.records.get(chunk.id);
        if (record && !record.obsolete) continue;
        // An obsolete decode is allowed to finish; start a replacement only after its token
        // has gone away. Obsolete mounted jobs must be completely destroyed before remount.
        if (record) continue;
        record = { id: chunk.id, bounds: chunk, epoch: this.epoch, state: 'REQUESTED', obsolete: false, attempts: 0 };
        this.records.set(chunk.id, record);
        this.event('CHUNK_REQUEST', record);
      }
    }
    stillCurrent(record) { return !this.closed && this.records.get(record.id) === record && !record.obsolete && this.wanted.has(record.id); }
    beginDecode(record) {
      record.state = 'DECODING'; record.attempts++;
      const started = this.now();
      Promise.resolve().then(() => this.provider.getRenderChunk(record.id)).then(data => {
        if (!this.stillCurrent(record)) {
          if (this.records.get(record.id) === record) this.records.delete(record.id);
          return;
        }
        record.data = data; record.state = 'READY';
        this.event('CHUNK_DECODED', record, { bytes: data.byteLength, ms: this.now() - started });
      }).catch(error => {
        if (!this.stillCurrent(record)) {
          if (this.records.get(record.id) === record) this.records.delete(record.id);
          return;
        }
        record.state = 'ERROR'; record.error = String(error.message || error);
        record.retryAt = this.now() + Math.min(10000, 250 * 2 ** (record.attempts - 1));
        this.stats.errors++; this.event('CHUNK_ERROR', record, { error: record.error });
      });
    }
    ensureWantedRecords() {
      for (const id of this.wanted) if (!this.records.has(id)) {
        const record = { id, epoch: this.epoch, state: 'REQUESTED', obsolete: false, attempts: 0 };
        this.records.set(id, record); this.event('CHUNK_REQUEST', record);
      }
    }
    pump() {
      if (this.closed) return;
      const started = this.now(), deadline = started + this.budgetMs;
      // LOD remains in place while old detail is removed. Finish removals before mounting
      // replacements so both ACTIVE and partly-mounted high-detail chunks stay <= 9.
      for (const [id, record] of this.records) {
        if (record.state !== 'UNMOUNTING') continue;
        if (record.unmountStarted === undefined) { record.unmountStarted = this.now(); this.renderer.beginUnmount(record.job); }
        if (this.renderer.stepUnmount(record.job, deadline)) {
          this.records.delete(id); this.stats.unmounted++;
          this.event('CHUNK_UNMOUNTED', record, { ms: this.now() - record.unmountStarted });
        }
        if (this.now() >= deadline) break;
      }
      this.ensureWantedRecords();
      let decoding = [...this.records.values()].filter(record => record.state === 'DECODING').length;
      for (const record of this.records.values()) {
        if (!this.stillCurrent(record)) continue;
        if (record.state === 'ERROR' && this.now() >= record.retryAt) record.state = 'REQUESTED';
        if (record.state === 'REQUESTED' && decoding < this.concurrency) { this.beginDecode(record); decoding++; }
      }
      const removing = [...this.records.values()].some(record => record.state === 'UNMOUNTING');
      if (!removing) for (const record of this.records.values()) {
        if (this.now() >= deadline) break;
        if (!this.stillCurrent(record)) continue;
        try {
          if (record.state === 'READY') {
            record.mountStarted = this.now(); record.job = this.renderer.beginMount(record.data); record.data = null; record.state = 'MOUNTING';
          }
          if (record.state === 'MOUNTING' && this.renderer.stepMount(record.job, deadline)) {
            record.state = 'ACTIVE'; this.stats.mounted++;
            this.event('CHUNK_MOUNTED', record, { ms: this.now() - record.mountStarted });
          }
        } catch (error) {
          if (record.job) this.renderer.destroyJob(record.job);
          record.job = null; record.state = 'ERROR'; record.error = String(error.message || error);
          record.retryAt = this.now() + 1000; this.stats.errors++; this.event('CHUNK_ERROR', record, { error: record.error });
        }
      }
      const mounted = [...this.records.values()].filter(record => record.job).length;
      this.stats.maxMounted = Math.max(this.stats.maxMounted, mounted);
      this.stats.maxPumpMs = Math.max(this.stats.maxPumpMs, this.now() - started);
      if (mounted > 9) throw new Error('World detail chunk limit exceeded');
    }
    snapshot() {
      const states = {};
      for (const record of this.records.values()) states[record.state] = (states[record.state] || 0) + 1;
      return { ...this.stats, generation: this.epoch, wanted: this.wanted.size, states,
        activeIds: [...this.records.values()].filter(record => record.state === 'ACTIVE').map(record => record.id),
        renderer: this.renderer.snapshot?.(), terrain: this.provider.snapshot?.() };
    }
    invalidate() {
      this.focusKey = null; this.epoch++;
      for (const [id, record] of this.records) {
        record.obsolete = true;
        if (record.job) record.state = 'UNMOUNTING';
        else if (record.state !== 'DECODING') this.records.delete(id);
      }
    }
    destroy() {
      this.closed = true; this.wanted.clear();
      for (const record of this.records.values()) if (record.job) this.renderer.destroyJob(record.job);
      this.records.clear();
    }
  }
  return { WorldChunkManager };
});
