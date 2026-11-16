(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function () {
  'use strict';
  class WorldDataAccess {
    constructor(base, delta) { this.base = base; this.delta = delta; this.world = base.world; }
    async getTile(col, row) {
      if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= this.world.width || row >= this.world.height) throw new Error('Tile outside world');
      const edit = this.delta.terrainAt(col, row);
      if (edit) return { ...edit };
      return this.getBaseTile(col, row);
    }
    async getBaseTile(col, row) {
      const sx = Math.floor(col / 64), sy = Math.floor(row / 64), id = `s:${sx}:${sy}`;
      const bytes = await this.base.getStorageChunk(id), width = this.base.manifest.chunks[id].width;
      const at = ((row - sy * 64) * width + col - sx * 64) * 3;
      return { code: bytes[at], terrainType: bytes[at + 1], height: bytes[at + 2] };
    }
    async getRenderChunk(id) {
      const data = await this.base.getRenderChunk(id), delta = this.delta;
      const sample = (col, row) => delta.terrainAt(col, row) || data.sample(col, row);
      return { ...data, sample };
    }
    snapshot() { return this.base.snapshot(); }
  }
  return { WorldDataAccess };
});
