(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function () {
  'use strict';
  class WorldDiagnostics {
    constructor(limit = 1200) { this.limit = limit; this.frames = []; this.mounts = []; this.loads = []; this.requests = new Map(); this.events = []; }
    frame(ms) { if (Number.isFinite(ms) && ms > 0) { this.frames.push(ms); if (this.frames.length > this.limit) this.frames.shift(); } }
    event(event) {
      const key = `${event.chunkId}:${event.generation}`;
      if (event.type === 'CHUNK_REQUEST') this.requests.set(key, performance.now());
      if (event.type === 'CHUNK_REQUEST_OBSOLETE' || event.type === 'CHUNK_UNMOUNTED') this.requests.delete(key);
      if (event.type === 'CHUNK_MOUNTED' && this.requests.has(key)) { this.loads.push(performance.now() - this.requests.get(key)); this.requests.delete(key); if (this.loads.length > 200) this.loads.shift(); }
      this.events.push(event); if (this.events.length > 200) this.events.shift();
      if (event.type === 'CHUNK_MOUNTED') { this.mounts.push(event.ms); if (this.mounts.length > 200) this.mounts.shift(); }
    }
    percentile(values, fraction) { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] : null; }
    snapshot() {
      return { frameP95Ms: this.percentile(this.frames, .95), frameP99Ms: this.percentile(this.frames, .99),
        mountP95Ms: this.percentile(this.mounts, .95), samples: this.frames.length,
        detailLoadP95Ms: this.percentile(this.loads, .95),
        jsHeapBytes: globalThis.performance?.memory?.usedJSHeapSize ?? null };
    }
  }
  return { WorldDiagnostics };
});
