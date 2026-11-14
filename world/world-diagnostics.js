(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function () {
  'use strict';
  class WorldDiagnostics {
    constructor(limit = 1200) { this.limit = limit; this.frames = []; this.mounts = []; this.events = []; }
    frame(ms) { if (Number.isFinite(ms) && ms > 0) { this.frames.push(ms); if (this.frames.length > this.limit) this.frames.shift(); } }
    event(event) {
      this.events.push(event); if (this.events.length > 200) this.events.shift();
      if (event.type === 'CHUNK_MOUNTED') { this.mounts.push(event.ms); if (this.mounts.length > 200) this.mounts.shift(); }
    }
    percentile(values, fraction) { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] : null; }
    snapshot() {
      return { frameP95Ms: this.percentile(this.frames, .95), frameP99Ms: this.percentile(this.frames, .99),
        mountP95Ms: this.percentile(this.mounts, .95), samples: this.frames.length,
        jsHeapBytes: globalThis.performance?.memory?.usedJSHeapSize ?? null };
    }
  }
  return { WorldDiagnostics };
});
