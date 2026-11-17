(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function () {
  'use strict';
  // Blitter batches use the original terrain atlas, grouped by WORLD foot depth. There is no
  // chunk Container depth, no 1024-Sprite default, and no large per-chunk RenderTexture.
  class WorldChunkRenderer {
    constructor({ scene, adapter, visuals, atlasKey = 'world-terrain', now = () => performance.now() }) {
      Object.assign(this, { scene, adapter, visuals, atlasKey, now });
      this.jobs = new Set(); this.objects = 0; this.tiles = 0; this.destroyedObjects = 0; this.visibilityVersion = 0;
    }
    beginMount(data) {
      const job = { data, cursor: 0, groups: new Map(), active: false, removing: false, rotation: this.adapter.rotation };
      this.jobs.add(job); return job;
    }
    stepMount(job, deadline) {
      const { bounds } = job.data, total = bounds.width * bounds.height;
      while (job.cursor < total && this.now() < deadline) {
        const col = bounds.col + job.cursor % bounds.width, row = bounds.row + Math.floor(job.cursor / bounds.width);
        // (a cell the original renderer draws whole - a plain road - has no ground of its own drawn)
        if (job.data.sample(col, row)?.noGround) { job.cursor++; continue; }
        const style = this.visuals.describe(col, row, job.rotation, job.data.sample);
        const point = this.adapter.project(col, row), depth = point.y + style.offset;
        let group = job.groups.get(depth);
        if (!group) {
          const object = this.scene.add.blitter(0, 0, this.atlasKey).setDepth(depth).setVisible(false);
          // Terrain and original road/building Images must share one stencil mask.
          // Alternating masked roads with unmasked terrain breaks GPU batching.
          if (this.scene.worldMask) object.setMask(this.scene.worldMask);
          group = { object, count: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
          job.groups.set(depth, group); this.objects++;
        }
        const key = style.key === 'hill_plateau' ? 'ground_full' : style.key;
        const frame = `${key}@${style.shade}`;
        if (!this.scene.textures.get(this.atlasKey).has(frame)) throw new Error(`Missing world terrain frame ${frame}`);
        const frameHeight = this.scene.textures.get(this.atlasKey).get(frame).height;
        const x = point.x - 50, y = point.y + style.offset - frameHeight;
        group.object.create(x, y, frame); group.count++; this.tiles++;
        group.minX = Math.min(group.minX, x); group.maxX = Math.max(group.maxX, x + 100);
        group.minY = Math.min(group.minY, y); group.maxY = Math.max(group.maxY, y + frameHeight);
        job.cursor++;
      }
      if (job.cursor < total) return false;
      job.active = true;
      this.visibilityVersion++;
      for (const group of job.groups.values()) group.object.setVisible(true);
      return true;
    }
    beginUnmount(job) { job.removing = true; job.active = false; this.visibilityVersion++; for (const group of job.groups.values()) group.object.setVisible(false); }
    stepUnmount(job, deadline) {
      for (const [depth, group] of job.groups) {
        if (this.now() >= deadline) return false;
        group.object.destroy(); this.objects--; this.tiles -= group.count; this.destroyedObjects++;
        job.groups.delete(depth);
      }
      this.jobs.delete(job); job.data = null; return true;
    }
    destroyJob(job) {
      if (!this.jobs.has(job)) return;
      this.beginUnmount(job);
      this.stepUnmount(job, Infinity);
    }
    cull(camera) {
      const state = [camera.scrollX,camera.scrollY,camera.zoom,camera.width,camera.height,camera.originX,camera.originY,this.visibilityVersion];
      if (this.lastCullState && state.every((value,index) => value === this.lastCullState[index])) return;
      this.lastCullState = state;
      const zoom = camera.zoom || 1, ox = camera.width * (camera.originX ?? .5), oy = camera.height * (camera.originY ?? .5);
      const left = camera.scrollX + ox - ox / zoom, top = camera.scrollY + oy - oy / zoom;
      const right = left + camera.width / zoom, bottom = top + camera.height / zoom;
      for (const job of this.jobs) for (const group of job.groups.values()) {
        group.object.setVisible(job.active && !job.removing && group.maxX >= left && group.minX <= right && group.maxY >= top && group.minY <= bottom);
      }
    }
    snapshot() { return { chunks: this.jobs.size, gameObjects: this.objects, terrainTiles: this.tiles,
      renderDataBytes: [...this.jobs].reduce((bytes, job) => bytes + (job.data?.byteLength || 0), 0), destroyedObjects: this.destroyedObjects }; }
    destroy() { for (const job of [...this.jobs]) this.destroyJob(job); }
  }
  return { WorldChunkRenderer };
});
