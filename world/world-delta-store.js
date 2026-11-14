(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./world-config') : root.HeungShingWorld,
    typeof module !== 'undefined' && module.exports ? require('./world-save-format') : root.HeungShingWorld);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function (configApi, formatApi) {
  'use strict';
  const { WorldSaveFormat: f } = formatApi;
  class WorldDeltaStore {
    constructor(world = configApi.WORLD) {
      this.world = world; this.header = f.emptyWorldSnapshot(world);
      this.chunks = new Map(); this.entities = new Map(); this.occupancy = new Map(); this.renderRefs = new Map();
      this.dirtyChunks = new Map(); this.dirtyEntities = new Map(); this.listeners = new Set(); this.metaDirty = false; this.constructionRevision = 0;
    }
    get revision() { return this.header.revision; }
    get dirty() { return this.metaDirty || this.dirtyChunks.size > 0 || this.dirtyEntities.size > 0; }
    chunk(col, row) { return this.chunks.get(f.storageId(col, row)); }
    terrainAt(col, row) { return this.chunk(col, row)?.terrain.get(f.tileId(col, row)); }
    roadAt(col, row) { return this.chunk(col, row)?.roads.get(f.tileId(col, row)); }
    zoneAt(col, row) { return this.chunk(col, row)?.zones.get(f.tileId(col, row)); }
    entityAt(col, row) { return this.entities.get(this.occupancy.get(f.tileId(col, row))); }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    blankChunk(id) { return { id, revision: this.revision, terrain: new Map(), zones: new Map(), roads: new Map(), refs: new Set() }; }
    serializeChunk(chunk) { return { chunkId: chunk.id, revision: chunk.revision,
      terrainEdits: [...chunk.terrain.values()].map(f.clone), zones: [...chunk.zones.values()].map(f.clone), roads: [...chunk.roads.values()].map(f.clone), entityIds: [...chunk.refs].sort() }; }
    snapshot() { const { chunks: _c, entities: _e, ...header } = this.header;
      return { ...f.clone(header), chunks: [...this.chunks.values()].map(chunk => this.serializeChunk(chunk)).sort((a, b) => a.chunkId.localeCompare(b.chunkId)),
        entities: [...this.entities.values()].map(f.clone).sort((a, b) => a.id.localeCompare(b.id)) }; }
    checkpoint(all = false) {
      const snapshot = this.snapshot(), { chunks, entities, ...header } = snapshot;
      return { header, chunks: chunks.filter(chunk => all || this.dirtyChunks.has(chunk.chunkId)),
        entities: all ? entities.map(value => ({ id: value.id, value })) : [...this.dirtyEntities.keys()].map(id => ({ id, value: f.clone(this.entities.get(id) || null) })),
        token: { revision: this.revision, chunks: [...this.dirtyChunks], entities: [...this.dirtyEntities] } };
    }
    acknowledge(checkpoint) {
      for (const [id, revision] of checkpoint.token.chunks) if (this.dirtyChunks.get(id) === revision) this.dirtyChunks.delete(id);
      for (const [id, revision] of checkpoint.token.entities) if (this.dirtyEntities.get(id) === revision) this.dirtyEntities.delete(id);
      if (this.revision === checkpoint.token.revision) this.metaDirty = false;
    }
    transact(operations, { cost = 0 } = {}) {
      f.check(Array.isArray(operations) && operations.length <= 10000 && Number.isSafeInteger(cost) && cost >= 0, 'Invalid construction transaction');
      f.check(this.header.city.budget >= cost, '資金不足。');
      const touched = new Map(), changes = new Map(), changedTiles = new Map(), terrainTiles = [];
      let networkChanged = false;
      const edit = id => {
        if (!touched.has(id)) {
          const old = this.chunks.get(id) || this.blankChunk(id);
          touched.set(id, { ...old, terrain: new Map(old.terrain), roads: new Map(old.roads), zones: new Map(old.zones), refs: new Set(old.refs) });
        }
        return touched.get(id);
      };
      const mark = cell => changedTiles.set(f.tileId(cell.col, cell.row), { col: cell.col, row: cell.row });
      for (const operation of operations) {
        if (operation.kind === 'entity') {
          f.check(typeof operation.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(operation.id), 'Invalid entity ID');
          const old = changes.has(operation.id) ? changes.get(operation.id) : this.entities.get(operation.id);
          if (old) for (const id of f.entityStorageIds(old)) edit(id).refs.delete(old.id);
          if (old) f.entityCells(old).forEach(mark);
          const entity = operation.value ? f.clone(operation.value) : null;
          if (['bridge', 'rail'].includes(old?.kind) || ['bridge', 'rail'].includes(entity?.kind)) networkChanged = true;
          if (entity) { f.validateEntity(entity, this.world); f.check(entity.id === operation.id, 'Entity ID mismatch');
            for (const id of f.entityStorageIds(entity)) edit(id).refs.add(entity.id); f.entityCells(entity).forEach(mark); }
          changes.set(operation.id, entity);
        } else {
          f.check(['terrain', 'roads', 'zones'].includes(operation.kind) && f.point(operation, this.world), 'Invalid tile transaction');
          if (operation.kind === 'roads') networkChanged = true;
          const chunk = edit(f.storageId(operation.col, operation.row)), key = f.tileId(operation.col, operation.row);
          if (operation.value === null) chunk[operation.kind].delete(key);
          else chunk[operation.kind].set(key, { ...f.clone(operation.value), col: operation.col, row: operation.row });
          mark(operation);
          if (operation.kind === 'terrain') terrainTiles.push({ col: operation.col, row: operation.row });
        }
      }
      // Validate all affected references and collisions before publishing ANY change.
      const projectedEntities = new Map(this.entities);
      for (const [id, entity] of changes) if (entity) projectedEntities.set(id, entity); else projectedEntities.delete(id);
      const projectedChunks = new Map(this.chunks);
      const revision = this.revision + 1;
      for (const [id, chunk] of touched) { chunk.revision = revision; projectedChunks.set(id, chunk); }
      const { chunks: _c, entities: _e, ...head } = this.header;
      const snapshot = { ...head, revision, city: { ...head.city, budget: head.city.budget - cost },
        chunks: [...projectedChunks.values()].map(chunk => this.serializeChunk(chunk)), entities: [...projectedEntities.values()] };
      f.validateWorldSnapshot(snapshot, this.world);
      for (const [id, chunk] of touched) { this.chunks.set(id, chunk); this.dirtyChunks.set(id, revision); }
      for (const [id, entity] of changes) {
        if (entity) this.entities.set(id, entity); else this.entities.delete(id);
        this.dirtyEntities.set(id, revision);
      }
      this.header = { ...head, city: snapshot.city, revision }; this.constructionRevision = revision; this.metaDirty = true; this.rebuildEntityIndexes();
      const event = { revision, tiles: [...changedTiles.values()], terrainTiles, storageChunks: [...touched.keys()], entityIds: [...changes.keys()], networkChanged };
      this.listeners.forEach(listener => listener(event)); return event;
    }
    commitSimulation(simulation, budget, { routesChanged = false } = {}) {
      // Metadata-only transactions leave chunk dirtiness, construction drafts and sprites alone.
      const snapshot = { ...this.header, simulation: f.clone(simulation), city: { ...this.header.city, budget }, revision: this.revision + 1, chunks: [], entities: [] };
      f.validateWorldSnapshot(snapshot, this.world);
      const { chunks, entities, ...header } = snapshot; this.header = header; this.metaDirty = true;
      this.listeners.forEach(listener => listener({ revision: this.revision, simulation: true, routesChanged }));
    }
    rebuildEntityIndexes() {
      this.occupancy.clear(); this.renderRefs.clear();
      for (const entity of this.entities.values()) {
        for (const cell of f.entityCells(entity)) this.occupancy.set(f.tileId(cell.col, cell.row), entity.id);
        // Ghost references cover model overhang as well as footprint ownership. They are
        // rendering indexes only; persisted storage references use the actual footprint.
        const cells = f.entityCells(entity), halo = entity.kind === 'building' ? 16 : 1;
        const left = Math.max(0, Math.min(...cells.map(c => c.col)) - halo), right = Math.min(this.world.width - 1, Math.max(...cells.map(c => c.col)) + halo);
        const top = Math.max(0, Math.min(...cells.map(c => c.row)) - halo), bottom = Math.min(this.world.height - 1, Math.max(...cells.map(c => c.row)) + halo);
        for (let ry = Math.floor(top / 32); ry <= Math.floor(bottom / 32); ry++) for (let rx = Math.floor(left / 32); rx <= Math.floor(right / 32); rx++) {
          const id = `r:${rx}:${ry}`; if (!this.renderRefs.has(id)) this.renderRefs.set(id, new Set()); this.renderRefs.get(id).add(entity.id);
        }
      }
    }
    entitiesForChunks(ids) { const entities = new Set(); for (const id of ids) for (const entity of this.renderRefs.get(id) || []) entities.add(entity);
      return [...entities].map(id => this.entities.get(id)); }
    replace(snapshot, { dirty = false } = {}) {
      f.validateWorldSnapshot(snapshot, this.world);
      const clean = f.clone(snapshot); this.header = clean; this.constructionRevision = clean.revision; this.chunks.clear(); this.entities.clear(); this.dirtyChunks.clear(); this.dirtyEntities.clear();
      for (const entry of clean.chunks) this.chunks.set(entry.chunkId, { id: entry.chunkId, revision: entry.revision,
        terrain: new Map(entry.terrainEdits.map(record => [f.tileId(record.col, record.row), record])),
        roads: new Map(entry.roads.map(record => [f.tileId(record.col, record.row), record])),
        zones: new Map(entry.zones.map(record => [f.tileId(record.col, record.row), record])), refs: new Set(entry.entityIds) });
      for (const entity of clean.entities) this.entities.set(entity.id, entity);
      if (dirty) { for (const id of this.chunks.keys()) this.dirtyChunks.set(id, this.revision); for (const id of this.entities.keys()) this.dirtyEntities.set(id, this.revision); }
      this.metaDirty = dirty; this.rebuildEntityIndexes(); this.listeners.forEach(listener => listener({ all: true, revision: this.revision }));
    }
  }
  return { WorldDeltaStore };
});
