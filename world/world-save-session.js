(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./world-save-format') : root.HeungShingWorld);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function (formatApi) {
  'use strict';
  const { WorldSaveFormat: f } = formatApi;
  class WorldSaveSession {
    constructor({ delta, storage, id = 'world-trial-v1', autosaveMs = 1200, onStatus = () => {}, captureView = () => null }) {
      Object.assign(this, { delta, storage, id, autosaveMs, onStatus, captureView });
      this.storageRevision = 0; this.saving = null; this.timer = null; this.closed = false; this.lastError = null;
      this.flushDurations = [];
      this.unsubscribe = delta.subscribe(event => { if (delta.dirty) {
        onStatus({ kind: 'dirty' }); if (!event.simulation || !this.timer && !this.saving) this.schedule(event.simulation ? 15000 : this.autosaveMs);
      } });
    }
    schedule(delay = this.autosaveMs) { clearTimeout(this.timer); if (!this.closed) this.timer = setTimeout(() => { this.timer = null; this.flush().catch(() => {}); }, delay); }
    async request(url, options) {
      if (options?.body) options = { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } };
      const response = await this.storage.worldRequest(url, options), value = await response.json();
      if (!response.ok) throw f.worldSaveError(value.error || '儲存失敗；修改仍然保留，請匯出備份。', response.status);
      return value;
    }
    async list() { return this.request('/api/world-saves'); }
    async load(id = this.id) {
      if (this.saving) await this.saving;
      if (this.delta.dirty) await this.flush();
      if (this.delta.dirty) throw f.worldSaveError('仍有未儲存修改，請先儲存或匯出備份。');
      const revision = this.delta.revision;
      let value;
      try { value = await this.request(`/api/world-saves/${id}`); }
      catch (error) { if (error.status !== 404) throw error; value = { storageRevision: 0, snapshot: f.emptyWorldSnapshot(this.delta.world) }; }
      if (this.delta.revision !== revision || this.delta.dirty) throw f.worldSaveError('載入期間有新修改，已保留目前世界。', 409);
      f.validateWorldSnapshot(value.snapshot, this.delta.world);
      this.id = id; this.storageRevision = value.storageRevision; this.delta.replace(value.snapshot); this.lastError = null;
      this.onStatus({ kind: 'loaded', id, storageRevision: this.storageRevision }); return value;
    }
    flush() {
      clearTimeout(this.timer); this.timer = null;
      if (this.saving) return this.saving;
      if (!this.delta.dirty && this.storageRevision > 0) return Promise.resolve({ storageRevision: this.storageRevision });
      const viewpoint = this.captureView(); if (viewpoint) this.delta.header.viewpoint = f.clone(viewpoint);
      const checkpoint = this.delta.checkpoint(this.storageRevision === 0), id = this.id;
      this.onStatus({ kind: 'saving' });
      const started = performance.now();
      let success = false;
      this.saving = this.request(`/api/world-saves/${id}`, { method: 'PUT', body: JSON.stringify({ expectedRevision: this.storageRevision, checkpoint }) })
        .then(value => { this.storageRevision = value.storageRevision; this.delta.acknowledge(checkpoint); this.lastError = null; success = true;
          this.onStatus({ kind: this.delta.dirty ? 'dirty' : 'saved', storageRevision: value.storageRevision }); return value; })
        .catch(error => { this.lastError = error; this.onStatus({ kind: 'error', error: error.message }); throw error; })
        .finally(() => { this.flushDurations.push(performance.now() - started); if (this.flushDurations.length > 64) this.flushDurations.shift(); this.saving = null; if (success && this.delta.dirty) this.schedule(); });
      return this.saving;
    }
    async restoreBackup() {
      if (this.saving) await this.saving;
      if (this.delta.dirty) await this.flush();
      if (this.delta.dirty) throw f.worldSaveError('仍有未儲存修改，請先儲存或匯出備份。');
      const revision = this.delta.revision;
      const value = await this.request(`/api/world-saves/${this.id}/restore`, { method: 'POST', body: JSON.stringify({ expectedRevision: this.storageRevision }) });
      if (this.delta.revision !== revision || this.delta.dirty) throw f.worldSaveError('還原期間有新修改，已保留目前世界；請先匯出備份。', 409);
      f.validateWorldSnapshot(value.snapshot, this.delta.world); this.storageRevision = value.storageRevision; this.delta.replace(value.snapshot);
      this.onStatus({ kind: 'loaded', id: this.id, storageRevision: this.storageRevision }); return value;
    }
    async importBackup(text, id) {
      const snapshot = f.importWorldSave(text, this.delta.world);
      if (this.saving) await this.saving;
      if (this.delta.dirty) await this.flush();
      if (this.delta.dirty) throw f.worldSaveError('請先儲存或匯出目前修改。');
      const { chunks, entities, ...header } = snapshot;
      const checkpoint = { header, chunks, entities: entities.map(value => ({ id: value.id, value })) };
      const value = await this.request(`/api/world-saves/${id}`, { method: 'PUT', body: JSON.stringify({ expectedRevision: 0, checkpoint }) });
      this.id = id; this.storageRevision = value.storageRevision; this.delta.replace(snapshot); this.lastError = null;
      this.onStatus({ kind: 'loaded', id, storageRevision: this.storageRevision }); return { ...value, snapshot: f.clone(snapshot) };
    }
    exportBackup() { return f.exportWorldSave(this.delta.snapshot(), this.delta.world); }
    diagnostics() { const sorted = [...this.flushDurations].sort((a, b) => a - b); return { lastFlushMs: this.flushDurations.at(-1) ?? null, flushP95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] ?? null, flushSamples: sorted.length }; }
    destroy() { this.closed = true; clearTimeout(this.timer); this.unsubscribe(); }
  }
  return { WorldSaveSession };
});
