(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./world-minimap') : root.HeungShingWorld);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function (cacheApi) {
  'use strict';
  class WorldLod {
    constructor(scene, views, prefix = 'world-lod') {
      this.scene = scene; this.views = views; this.prefix = prefix;
      this.image = scene.add.image(0, 0, `${prefix}-0`).setOrigin(0, 0).setDepth(-1000000);
      this.setRotation(0);
    }
    setRotation(rotation) {
      const view = this.views[rotation];
      this.image.setTexture(`${this.prefix}-${rotation}`).setPosition(view.x, view.y).setDisplaySize(view.width, view.height);
    }
    destroy() { this.image.destroy(); }
  }
  function regionalLodViews(adapter, camera, lod, rotation, limit = 4) {
    if (!lod) return [];
    const zoom = camera.zoom || 1, ox = camera.width * (camera.originX ?? .5), oy = camera.height * (camera.originY ?? .5);
    const left = camera.scrollX + ox - ox / zoom, top = camera.scrollY + oy - oy / zoom;
    const right = left + camera.width / zoom, bottom = top + camera.height / zoom;
    const corners = [[left, top], [right, top], [right, bottom], [left, bottom]].map(([x, y]) => adapter.unproject(x, y + 40));
    const minCol = Math.max(0, Math.floor(Math.min(...corners.map(p => p.col)) / lod.size));
    const minRow = Math.max(0, Math.floor(Math.min(...corners.map(p => p.row)) / lod.size));
    const maxCol = Math.min(Math.ceil(adapter.world.width / lod.size) - 1, Math.floor(Math.max(...corners.map(p => p.col)) / lod.size));
    const maxRow = Math.min(Math.ceil(adapter.world.height / lod.size) - 1, Math.floor(Math.max(...corners.map(p => p.row)) / lod.size));
    const focus = adapter.cameraFocus(camera), candidates = [];
    for (let y = minRow; y <= maxRow; y++) for (let x = minCol; x <= maxCol; x++) {
      const region = lod.regions[`${x}:${y}`], view = region?.views[rotation]; if (!view) continue;
      if (view.x > right || view.x + view.width < left || view.y > bottom || view.y + view.height < top) continue;
      const distance = (region.col + region.width / 2 - focus.col) ** 2 + (region.row + region.height / 2 - focus.row) ** 2;
      candidates.push({ view, distance });
    }
    return candidates.sort((a, b) => a.distance - b.distance).slice(0, limit).map(item => item.view);
  }
  let backdropSequence = 0;
  class WorldRegionalLod {
    constructor({ scene, adapter, lod, resolveAsset, load, budgetBytes = 8 * 1024 * 1024 }) {
      Object.assign(this, { scene, adapter, lod });
      this.prefix = `world-regional-${++backdropSequence}`; this.objects = new Map(); this.views = []; this.key = ''; this.destroyed = false;
      this.cache = new cacheApi.WorldOverviewCache({ budgetBytes, concurrency: 2, load: load || (async (view, signal) => {
        const response = await fetch(resolveAsset(view.url), { signal });
        if (!response.ok) throw new Error(`Regional terrain HTTP ${response.status}`);
        return createImageBitmap(await response.blob());
      }), onChange: () => this.sync() });
    }
    update(camera, rotation) {
      const state = [camera.scrollX,camera.scrollY,camera.zoom,camera.width,camera.height,camera.originX,camera.originY,rotation];
      if (this.lastCameraState && state.every((value,index) => value === this.lastCameraState[index])) { this.cache.pump(); return; }
      this.lastCameraState = state;
      const views = regionalLodViews(this.adapter, camera, this.lod, rotation), key = views.map(view => view.url).join('|');
      if (key !== this.key) { this.key = key; this.views = views; this.cache.setWanted(views); this.sync(); }
      else this.cache.pump();
    }
    sync() {
      if (this.destroyed) return;
      const wanted = new Set(this.views.map(view => view.url));
      for (const [url, entry] of this.objects) if (!wanted.has(url) || !this.cache.entries.has(url)) {
        entry.image.destroy(); this.scene.textures.remove(entry.texture); this.objects.delete(url);
      }
      for (const view of this.views) {
        if (this.objects.has(view.url)) continue;
        const source = this.cache.get(view); if (!source) continue;
        const texture = `${this.prefix}-${view.url}`;
        this.scene.textures.addImage(texture, source);
        const image = this.scene.add.image(view.x, view.y, texture).setOrigin(0, 0).setDisplaySize(view.width, view.height).setDepth(-.5);
        this.objects.set(view.url, { image, texture, bytes: source.width * source.height * 4 });
      }
    }
    snapshot() { return { ...this.cache.snapshot(), textures: this.objects.size,
      textureBytes: [...this.objects.values()].reduce((sum, entry) => sum + entry.bytes, 0) }; }
    destroy() {
      this.destroyed = true;
      for (const entry of this.objects.values()) { entry.image.destroy(); this.scene.textures.remove(entry.texture); }
      this.objects.clear(); this.cache.destroy();
    }
  }
  return { WorldLod, WorldRegionalLod, regionalLodViews };
});
