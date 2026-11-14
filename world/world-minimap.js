(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function () {
  'use strict';
  const GROUND_OFFSET = 40;
  function projectedRegion(adapter, region) {
    const points = [[region.col - .5, region.row - .5], [region.col + region.width - .5, region.row - .5],
      [region.col - .5, region.row + region.height - .5], [region.col + region.width - .5, region.row + region.height - .5]]
      .map(([col, row]) => adapter.project(col, row));
    const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y)) - GROUND_OFFSET;
    return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - GROUND_OFFSET - y };
  }
  function localRegion(world, focus, span = 256) {
    const width = Math.min(span, world.width), height = Math.min(span, world.height);
    return { col: Math.max(0, Math.min(world.width - width, Math.floor(focus.col / 32) * 32 + 16 - width / 2)),
      row: Math.max(0, Math.min(world.height - height, Math.floor(focus.row / 32) * 32 + 16 - height / 2)), width, height };
  }
  // The image, sparse overlays, clicks and viewport all share this single affine transform.
  class WorldMinimapTransform {
    constructor(adapter, bounds, width, height, padding = 8) {
      this.adapter = adapter; this.bounds = bounds;
      this.scale = Math.min((width - padding * 2) / bounds.width, (height - padding * 2) / bounds.height);
      this.x = (width - bounds.width * this.scale) / 2; this.y = (height - bounds.height * this.scale) / 2;
    }
    projectedToMinimap(x, y) { return { x: this.x + (x - this.bounds.x) * this.scale, y: this.y + (y - this.bounds.y) * this.scale }; }
    worldToMinimap(col, row) { const p = this.adapter.project(col, row); return this.projectedToMinimap(p.x, p.y - GROUND_OFFSET); }
    minimapToWorldTile(x, y) {
      const tile = this.adapter.unproject(this.bounds.x + (x - this.x) / this.scale, this.bounds.y + (y - this.y) / this.scale + GROUND_OFFSET);
      return this.adapter.clamp(tile.col, tile.row);
    }
    viewport(camera) {
      const ox = camera.width * (camera.originX ?? .5), oy = camera.height * (camera.originY ?? .5);
      return [[0, 0], [camera.width, 0], [camera.width, camera.height], [0, camera.height]].map(([x, y]) =>
        this.projectedToMinimap(camera.scrollX + ox + (x - ox) / camera.zoom, camera.scrollY + oy + (y - oy) / camera.zoom));
    }
  }
  // At most two image decodes and 4 MiB of retained local rasters. Obsolete requests are
  // aborted; late bitmaps are closed, and a failed raster leaves the overview underneath.
  class WorldOverviewCache {
    constructor({ load, onChange = () => {}, budgetBytes = 4 * 1024 * 1024, concurrency = 2, now = () => Date.now() }) {
      this.load = load; this.onChange = onChange; this.budgetBytes = budgetBytes; this.concurrency = concurrency; this.now = now;
      this.entries = new Map(); this.pending = new Map(); this.failures = new Map(); this.wanted = new Map();
      this.bytes = 0; this.requests = 0; this.errors = 0; this.destroyed = false;
    }
    setWanted(views) {
      if (this.destroyed) return;
      this.wanted = new Map(views.map(view => [view.url, view]));
      for (const [url, request] of this.pending) if (!this.wanted.has(url)) request.controller.abort();
      for (const url of this.failures.keys()) if (!this.wanted.has(url)) this.failures.delete(url);
      this.pump();
    }
    get(view) { const entry = this.entries.get(view.url); if (!entry) return null;
      this.entries.delete(view.url); this.entries.set(view.url, entry); return entry.image; }
    pump() {
      if (this.destroyed) return;
      for (const [url, view] of this.wanted) {
        if (this.pending.size >= this.concurrency) break;
        if (this.entries.has(url) || this.pending.has(url) || (this.failures.get(url) || 0) > this.now()) continue;
        const request = { controller: new AbortController() }; this.pending.set(url, request); this.requests++;
        Promise.resolve().then(() => this.load(view, request.controller.signal)).then(image => {
          if (this.destroyed || request.controller.signal.aborted || !this.wanted.has(url)) { image.close?.(); return; }
          const bytes = image.width * image.height * 4;
          if (bytes > this.budgetBytes) { image.close?.(); throw new Error('Local overview exceeds cache budget'); }
          while (this.bytes + bytes > this.budgetBytes && this.entries.size) {
            const candidate = [...this.entries].find(([key]) => !this.wanted.has(key));
            if (!candidate) { image.close?.(); throw new Error('Visible local overviews exceed cache budget'); }
            const [oldUrl, old] = candidate; this.entries.delete(oldUrl); this.bytes -= old.bytes; old.image.close?.();
          }
          this.entries.set(url, { image, bytes }); this.bytes += bytes; this.onChange();
        }).catch(() => {
          if (!request.controller.signal.aborted && !this.destroyed) { this.errors++; this.failures.set(url, this.now() + 5000); this.onChange(); }
        }).finally(() => { this.pending.delete(url); this.pump(); });
      }
    }
    snapshot() { return { bytes: this.bytes, images: this.entries.size, pending: this.pending.size, requests: this.requests, errors: this.errors }; }
    destroy() {
      this.destroyed = true; this.pending.forEach(request => request.controller.abort());
      this.entries.forEach(entry => entry.image.close?.()); this.entries.clear(); this.wanted.clear(); this.failures.clear(); this.bytes = 0;
    }
  }
  function sparseMinimapData(delta, region = null) {
    const chunks = [], ids = new Set();
    if (region) {
      for (let y = Math.floor(region.row / 64); y <= Math.floor((region.row + region.height - 1) / 64); y++)
        for (let x = Math.floor(region.col / 64); x <= Math.floor((region.col + region.width - 1) / 64); x++) {
          const chunk = delta.chunks.get(`s:${x}:${y}`); if (chunk) chunks.push(chunk);
        }
    } else chunks.push(...delta.chunks.values());
    for (const chunk of chunks) for (const id of chunk.refs) ids.add(id);
    return { chunks, entities: [...ids].map(id => delta.entities.get(id)).filter(Boolean) };
  }
  class WorldMinimap {
    constructor({ scene, adapter, delta, simulation, manifest, rootUrl, navigate, element = document.getElementById('world-minimap') }) {
      this.scene = scene; this.adapter = adapter; this.delta = delta; this.simulation = simulation; this.manifest = manifest; this.rootUrl = rootUrl; this.navigate = navigate; this.element = element;
      this.base = element.querySelector('[data-map-base]'); this.city = element.querySelector('[data-map-city]'); this.view = element.querySelector('[data-map-view]');
      this.surface = element.querySelector('.minimap-surface'); this.label = element.querySelector('[data-map-position]');
      this.mode = 'local'; this.collapsed = false; this.baseDirty = true; this.cityDirty = true; this.viewKey = ''; this.layoutKey = '';
      this.draws = { base: 0, city: 0, viewport: 0 }; this.abort = new AbortController(); this.gesture = null;
      this.cache = new WorldOverviewCache({ load: async (view, signal) => {
        const response = await fetch(new URL(view.url, rootUrl), { signal });
        if (!response.ok) throw new Error(`Local overview HTTP ${response.status}`);
        return createImageBitmap(await response.blob());
      }, onChange: () => { this.baseDirty = true; } });
      this.unsubscribe = delta.subscribe(event => { if (!event.simulation || event.routesChanged) this.cityDirty = true; if (event.all || event.routesChanged) this.viewKey = ''; });
      this.installUi();
      this.resize = new ResizeObserver(() => { this.layoutKey = ''; this.constrainPosition(); }); this.resize.observe(this.surface);
      try {
        const prefs = JSON.parse(localStorage.getItem('heung-shing.world-minimap') || '{}');
        if (Number.isFinite(prefs.left) && Number.isFinite(prefs.top)) this.position(prefs.left, prefs.top);
        this.setCollapsed(prefs.collapsed === true);
      } catch {}
    }
    listen(target, name, callback) { target.addEventListener(name, callback, { signal: this.abort.signal }); }
    setMode(mode) {
      this.mode = mode === 'world' ? 'world' : 'local'; this.gesture = null; this.element.dataset.mode = this.mode; this.layoutKey = '';
      this.element.querySelector('[data-map-mode]').textContent = this.mode === 'world' ? '附近' : '全港總覽';
      this.element.querySelector('[data-map-title]').textContent = this.mode === 'world' ? '香港全境' : '附近地圖';
      this.element.querySelector('[data-map-mode]').setAttribute('aria-pressed', String(this.mode === 'world')); this.constrainPosition();
    }
    setCollapsed(value) {
      this.collapsed = value; this.element.dataset.collapsed = String(value);
      const button = this.element.querySelector('[data-map-collapse]'); button.textContent = value ? '展開' : '收起'; button.setAttribute('aria-expanded', String(!value));
      if (value) { this.gesture = null; this.cache.setWanted([]); } else this.layoutKey = '';
      this.persist();
    }
    persist() { try { localStorage.setItem('heung-shing.world-minimap', JSON.stringify({ collapsed: this.collapsed, left: this.left, top: this.top })); } catch {} }
    position(left, top) {
      this.left = Math.max(4, Math.min(innerWidth - this.element.offsetWidth - 4, left));
      this.top = Math.max(document.getElementById('construction-controls').getBoundingClientRect().bottom + 4,
        Math.min(innerHeight - this.element.offsetHeight - 4, top));
      Object.assign(this.element.style, { left: `${this.left}px`, top: `${this.top}px`, right: 'auto', bottom: 'auto' });
    }
    constrainPosition() { if (Number.isFinite(this.left)) this.position(this.left, this.top); }
    installUi() {
      this.listen(this.element.querySelector('[data-map-mode]'), 'click', () => this.setMode(this.mode === 'world' ? 'local' : 'world'));
      this.listen(this.element.querySelector('[data-map-collapse]'), 'click', () => this.setCollapsed(!this.collapsed));
      const handle = this.element.querySelector('.minimap-heading'); let drag = null;
      this.listen(handle, 'pointerdown', event => {
        if (event.target.closest('button') || event.button !== 0) return;
        const rect = this.element.getBoundingClientRect(); drag = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
        handle.setPointerCapture(event.pointerId); event.preventDefault();
      });
      this.listen(handle, 'pointermove', event => { if (drag?.id === event.pointerId) this.position(event.clientX - drag.x, event.clientY - drag.y); });
      const endDrag = () => { if (drag) { drag = null; this.persist(); } };
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) this.listen(handle, name, endDrag);
      const move = event => {
        const rect = this.surface.getBoundingClientRect(), transform = this.gesture?.transform;
        if (!transform) return;
        const tile = transform.minimapToWorldTile((event.clientX - rect.left) * this.view.width / rect.width, (event.clientY - rect.top) * this.view.height / rect.height);
        this.navigate(tile.col, tile.row);
      };
      this.listen(this.surface, 'pointerdown', event => {
        if (event.button !== 0 || !this.transform || this.gesture) return;
        event.preventDefault(); this.surface.setPointerCapture(event.pointerId);
        this.gesture = { id: event.pointerId, transform: this.transform, region: this.region }; move(event);
      });
      this.listen(this.surface, 'pointermove', event => { if (this.gesture?.id === event.pointerId) move(event); });
      const end = event => { if (this.gesture?.id === event.pointerId) { this.gesture = null; this.layoutKey = ''; } };
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) this.listen(this.surface, name, end);
      this.listen(this.surface, 'keydown', event => {
        const offsets = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }, offset = offsets[event.key];
        if (!offset || !this.transform) return;
        event.preventDefault(); const focus = this.adapter.cameraFocus(this.scene.cameras.main), p = this.transform.worldToMinimap(focus.col, focus.row);
        const tile = this.transform.minimapToWorldTile(p.x + offset[0] * (event.shiftKey ? 4 : 1), p.y + offset[1] * (event.shiftKey ? 4 : 1)); this.navigate(tile.col, tile.row);
      });
      this.listen(window, 'resize', () => this.constrainPosition());
      this.listen(window, 'blur', () => { this.gesture = null; drag = null; this.layoutKey = ''; });
    }
    update() {
      if (this.collapsed) return;
      const camera = this.scene.cameras.main, focus = this.adapter.cameraFocus(camera), rotation = this.adapter.rotation;
      this.region = this.gesture?.region || (this.mode === 'local' ? localRegion(this.adapter.world, focus) : { col: 0, row: 0, width: this.adapter.world.width, height: this.adapter.world.height });
      const width = Math.min(1024, Math.max(256, Math.round(this.surface.clientWidth * Math.min(devicePixelRatio || 1, 2)))), height = Math.round(width / 2);
      const key = `${this.mode}:${rotation}:${this.region.col}:${this.region.row}:${width}`;
      if (key !== this.layoutKey) {
        this.layoutKey = key; for (const canvas of [this.base, this.city, this.view]) { canvas.width = width; canvas.height = height; }
        this.transform = new WorldMinimapTransform(this.adapter, this.mode === 'world' ? this.manifest.lod[rotation] : projectedRegion(this.adapter, this.region), width, height);
        this.baseDirty = this.cityDirty = true; this.viewKey = '';
      }
      const views = [], cache = this.manifest.localLod;
      if (this.mode === 'local' && cache) {
        for (let y = Math.floor(this.region.row / cache.size); y <= Math.floor((this.region.row + this.region.height - 1) / cache.size); y++)
          for (let x = Math.floor(this.region.col / cache.size); x <= Math.floor((this.region.col + this.region.width - 1) / cache.size); x++) {
            const entry = cache.regions[`${x}:${y}`]; if (entry) views.push(entry.views[rotation]);
          }
      }
      this.cache.setWanted(views);
      if (this.baseDirty) {
        const ctx = this.base.getContext('2d'); ctx.clearRect(0, 0, width, height); ctx.imageSmoothingEnabled = false;
        this.clip(ctx); this.paintRaster(ctx, this.scene.textures.get(`world-lod-${rotation}`).getSourceImage(), this.manifest.lod[rotation]);
        for (const view of views) { const image = this.cache.get(view); if (image) this.paintRaster(ctx, image, view); }
        ctx.restore(); this.baseDirty = false; this.draws.base++;
      }
      if (this.cityDirty) { this.drawCity(); this.cityDirty = false; this.draws.city++; }
      const viewKey = `${camera.scrollX}:${camera.scrollY}:${camera.zoom}:${camera.width}:${camera.height}:${camera.originX}:${camera.originY}:${this.delta.header.simulation?.elapsedMs || 0}`;
      if (viewKey !== this.viewKey) {
        this.viewKey = viewKey; const ctx = this.view.getContext('2d'); ctx.clearRect(0, 0, width, height); this.clip(ctx);
        const points = this.transform.viewport(camera); ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
        ctx.fillStyle = '#fff7d51a'; ctx.fill(); ctx.strokeStyle = '#fff4cb'; ctx.lineWidth = Math.max(1.5, width / this.surface.clientWidth); ctx.stroke();
        const p = this.transform.worldToMinimap(focus.col, focus.row); ctx.fillStyle = '#fff4cb'; ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
        for (const entry of this.simulation?.positions() || []) { const p = this.transform.worldToMinimap(entry.position.col, entry.position.row); ctx.fillStyle = entry.mode === 'road' ? '#f2cd71' : '#e1bab4'; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
        ctx.restore();
        this.label.textContent = `${Math.round(focus.col)}, ${Math.round(focus.row)} · R${rotation} · ${this.mode === 'local' ? '附近 256 格' : '20 米／格'}`; this.draws.viewport++;
      }
    }
    clip(ctx) {
      // Clip to the actual geographic quadrilateral, including rectangular world rotations.
      const r = this.region, points = [[r.col - .5, r.row - .5], [r.col + r.width - .5, r.row - .5], [r.col + r.width - .5, r.row + r.height - .5], [r.col - .5, r.row + r.height - .5]];
      ctx.save(); ctx.beginPath(); points.forEach(([col, row], i) => { const p = this.transform.worldToMinimap(col, row); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.closePath(); ctx.clip();
    }
    paintRaster(ctx, image, view) {
      const p = this.transform.projectedToMinimap(view.x, view.y), scale = this.transform.scale;
      ctx.drawImage(image, p.x, p.y, view.width * scale, view.height * scale);
    }
    drawCity() {
      const ctx = this.city.getContext('2d'); ctx.clearRect(0, 0, this.city.width, this.city.height); this.clip(ctx);
      const data = sparseMinimapData(this.delta, this.mode === 'local' ? this.region : null), tileWidth = 100 * this.transform.scale;
      const inside = cell => cell.col >= this.region.col && cell.col < this.region.col + this.region.width && cell.row >= this.region.row && cell.row < this.region.row + this.region.height;
      const paint = (cell, color, size = 1) => {
        if (!inside(cell)) return; const p = this.transform.worldToMinimap(cell.col, cell.row); ctx.fillStyle = color;
        const width = Math.max(size, tileWidth); ctx.beginPath(); ctx.moveTo(p.x, p.y - width / 4); ctx.lineTo(p.x + width / 2, p.y); ctx.lineTo(p.x, p.y + width / 4); ctx.lineTo(p.x - width / 2, p.y); ctx.closePath(); ctx.fill();
      };
      for (const chunk of data.chunks) {
        for (const cell of chunk.terrain.values()) paint(cell, cell.terrainType === 5 ? '#626861' : cell.terrainType === 4 ? '#bdaf87' : '#7d8963');
        for (const cell of chunk.zones.values()) paint(cell, { 1: '#85af7b', 2: '#83a9c4', 3: '#cbb47b' }[cell.type] || '#b9ac95', 2);
        for (const cell of chunk.roads.values()) paint(cell, '#d3ccc0', this.mode === 'world' ? 2 : 1);
      }
      for (const entity of data.entities) {
        if (entity.kind === 'building') {
          for (let row = entity.row; row < entity.row + entity.height; row++) for (let col = entity.col; col < entity.col + entity.width; col++) paint({ col, row }, '#e1d8c4', this.mode === 'world' ? 4 : 2);
        } else {
          const cells = entity.cells || [], points = cells.map(cell => this.transform.worldToMinimap(cell.col, cell.row));
          ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.strokeStyle = entity.kind === 'rail' ? '#d1b7b1bb' : '#d3ccc0bb';
          ctx.lineWidth = this.mode === 'world' ? 1.5 : Math.max(1.5, tileWidth * .35); ctx.stroke();
        }
      }
      for (const service of this.delta.header.simulation?.services || []) if (service.status === 'active') {
        ctx.beginPath(); service.path.forEach((cell, i) => { const p = this.transform.worldToMinimap(cell.col, cell.row); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
        ctx.strokeStyle = service.mode === 'road' ? '#ddca8f77' : '#dbb5b177'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.restore();
    }
    snapshot() { return { mode: this.mode, collapsed: this.collapsed, region: this.region, draws: { ...this.draws }, cache: this.cache.snapshot() }; }
    destroy() { this.unsubscribe(); this.abort.abort(); this.resize.disconnect(); this.cache.destroy(); }
  }
  return { WorldMinimapTransform, WorldOverviewCache, WorldMinimap, projectedRegion, localRegion, sparseMinimapData };
});
