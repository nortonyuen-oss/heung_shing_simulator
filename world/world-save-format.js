(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./world-config') : root.HeungShingWorld,
    typeof module !== 'undefined' && module.exports ? require('./world-construction-catalog') : root.HeungShingWorld);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function (configApi, catalog) {
  'use strict';
  const { WORLD, chunkBounds, parseChunkId } = configApi, { WORLD_BUILDINGS } = catalog;
  const MAX_WORLD_SAVE_BYTES = 20 * 1024 * 1024;
  const clone = value => JSON.parse(JSON.stringify(value));
  function worldSaveError(message, status = 400) { return Object.assign(new Error(message), { status, code: 'INVALID_WORLD_SAVE' }); }
  function check(value, message) { if (!value) throw worldSaveError(message); }
  function integer(value, min, max) { return Number.isSafeInteger(value) && value >= min && value <= max; }
  function point(value, world = WORLD) { return value && integer(value.col, 0, world.width - 1) && integer(value.row, 0, world.height - 1); }
  function storageId(col, row) { return `s:${Math.floor(col / 64)}:${Math.floor(row / 64)}`; }
  function tileId(col, row) { return `${row}:${col}`; }
  function entityCells(entity) {
    if (entity.kind !== 'building') return entity.cells;
    const cells = [];
    for (let r = 0; r < entity.height; r++) for (let c = 0; c < entity.width; c++) cells.push({ col: entity.col + c, row: entity.row + r });
    return cells;
  }
  function entityStorageIds(entity) { return new Set(entityCells(entity).map(cell => storageId(cell.col, cell.row))); }
  function validateEntity(entity, world = WORLD) {
    check(entity && typeof entity.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(entity.id), 'Invalid entity ID');
    check(point(entity, world) && ['building', 'bridge', 'rail'].includes(entity.kind), 'Invalid entity location/type');
    check(integer(entity.elevation, 0, 8), 'Invalid entity elevation');
    check(entity.ownerChunk === storageId(entity.col, entity.row), 'Invalid entity owner');
    if (entity.kind === 'building') {
      const model = WORLD_BUILDINGS[entity.modelId];
      check(model && entity.width === model.width && entity.height === model.height
        && entity.col + entity.width <= world.width && entity.row + entity.height <= world.height, 'Invalid building footprint/model');
    } else {
      check(Array.isArray(entity.cells) && entity.cells.length > 0 && entity.cells.length <= 2048, 'Invalid network span');
      const seen = new Set();
      for (let index = 0; index < entity.cells.length; index++) {
        const cell = entity.cells[index], previous = entity.cells[index - 1];
        check(point(cell, world), 'Invalid network cell'); const id = tileId(cell.col, cell.row);
        check(!seen.has(id), 'Invalid network cell'); seen.add(id);
        if (previous) check(Math.abs(cell.col - previous.col) + Math.abs(cell.row - previous.row) === 1, 'Disconnected network span');
      }
      check(entity.cells[0].col === entity.col && entity.cells[0].row === entity.row, 'Invalid network anchor');
    }
    return entity;
  }
  function emptyWorldSnapshot(world = WORLD) {
    return { format: 'heung-shing-world-state', schemaVersion: 2, worldId: world.id, baseTerrainVersion: world.baseTerrainVersion,
      worldSize: { width: world.width, height: world.height }, chunkSize: 64, revision: 0,
      city: { name: '世界建設試驗', budget: 100000 }, chunks: [], entities: [] };
  }
  function validateWorldSnapshot(snapshot, world = WORLD) {
    check(snapshot?.format === 'heung-shing-world-state' && snapshot.schemaVersion === 2, 'Unsupported world save version');
    check(snapshot.worldId === world.id && snapshot.baseTerrainVersion === world.baseTerrainVersion
      && snapshot.worldSize?.width === world.width && snapshot.worldSize?.height === world.height && snapshot.chunkSize === 64, 'World/base terrain identity mismatch');
    check(integer(snapshot.revision, 0, Number.MAX_SAFE_INTEGER) && typeof snapshot.city?.name === 'string'
      && snapshot.city.name.length <= 120 && integer(snapshot.city.budget, 0, Number.MAX_SAFE_INTEGER), 'Invalid world metadata');
    if (snapshot.viewpoint) check(Number.isFinite(snapshot.viewpoint.col) && Number.isFinite(snapshot.viewpoint.row)
      && snapshot.viewpoint.col >= 0 && snapshot.viewpoint.col < world.width && snapshot.viewpoint.row >= 0 && snapshot.viewpoint.row < world.height
      && integer(snapshot.viewpoint.rotation, 0, 3) && Number.isFinite(snapshot.viewpoint.zoom) && snapshot.viewpoint.zoom >= .4 && snapshot.viewpoint.zoom <= 3, 'Invalid world viewpoint');
    check(Array.isArray(snapshot.chunks) && snapshot.chunks.length <= Math.ceil(world.width / 64) * Math.ceil(world.height / 64)
      && Array.isArray(snapshot.entities) && snapshot.entities.length <= world.width * world.height, 'Invalid world records');
    const chunks = new Map(), entities = new Map(), occupied = new Map();
    for (const entity of snapshot.entities) {
      validateEntity(entity, world); check(!entities.has(entity.id), 'Duplicate entity'); entities.set(entity.id, entity);
      for (const cell of entityCells(entity)) {
        const id = tileId(cell.col, cell.row); check(!occupied.has(id), 'Overlapping world entities'); occupied.set(id, entity.id);
      }
    }
    for (const chunk of snapshot.chunks) {
      const pos = parseChunkId(chunk.chunkId, 's'), bounds = chunkBounds(world, 's', pos.x, pos.y);
      check(bounds && bounds.id === chunk.chunkId && !chunks.has(chunk.chunkId) && integer(chunk.revision, 0, snapshot.revision), 'Invalid storage chunk');
      chunks.set(chunk.chunkId, chunk);
      for (const name of ['terrainEdits', 'zones', 'roads']) {
        check(Array.isArray(chunk[name]) && chunk[name].length <= bounds.width * bounds.height, `Invalid ${name}`);
        const seen = new Set();
        for (const record of chunk[name]) {
          check(point(record, world), 'Invalid chunk tile');
          const id = tileId(record.col, record.row);
          check(point(record, world) && storageId(record.col, record.row) === chunk.chunkId && !seen.has(id), 'Invalid chunk tile'); seen.add(id);
          if (name === 'terrainEdits') check([1, 3, 4, 5, 6].includes(record.terrainType) && integer(record.height, 0, 8)
            && (record.terrainType === 6 ? record.height > 0 : record.height === 0), 'Invalid terrain edit');
          if (name === 'zones') check(integer(record.type, 1, 3) && integer(record.density, 1, 3), 'Invalid zoning');
          if (name !== 'terrainEdits' && record.height !== undefined) check(integer(record.height, 0, 8), 'Invalid surface height');
          if (name === 'roads') check(!occupied.has(id), 'Road overlaps an entity');
        }
      }
      check(Array.isArray(chunk.entityIds) && new Set(chunk.entityIds).size === chunk.entityIds.length, 'Invalid entity references');
      for (const id of chunk.entityIds) check(entities.has(id) && entityStorageIds(entities.get(id)).has(chunk.chunkId), 'Dangling entity reference');
    }
    for (const entity of entities.values()) for (const id of entityStorageIds(entity)) {
      check(chunks.get(id)?.entityIds.includes(entity.id), 'Incomplete cross-chunk entity references');
    }
    return snapshot;
  }
  function mergeWorldCheckpoint(previous, checkpoint, world = WORLD) {
    check(checkpoint?.header && Array.isArray(checkpoint.chunks) && Array.isArray(checkpoint.entities), 'Invalid checkpoint');
    const next = { ...clone(checkpoint.header), chunks: [], entities: [] };
    const chunks = new Map((previous?.chunks || []).map(value => [value.chunkId, value]));
    const entities = new Map((previous?.entities || []).map(value => [value.id, value]));
    for (const value of checkpoint.chunks) chunks.set(value.chunkId, clone(value));
    for (const entry of checkpoint.entities) {
      check(typeof entry?.id === 'string', 'Invalid entity checkpoint');
      if (entry.value === null) entities.delete(entry.id);
      else { check(entry.value?.id === entry.id, 'Entity identity mismatch'); entities.set(entry.id, clone(entry.value)); }
    }
    next.chunks = [...chunks.values()].sort((a, b) => a.chunkId.localeCompare(b.chunkId));
    next.entities = [...entities.values()].sort((a, b) => a.id.localeCompare(b.id));
    return validateWorldSnapshot(next, world);
  }
  function exportWorldSave(snapshot, world = WORLD) {
    validateWorldSnapshot(snapshot, world);
    const text = JSON.stringify({ format: 'heung-shing-world-save', formatVersion: 1, exportedAt: new Date().toISOString(), snapshot });
    check(new TextEncoder().encode(text).byteLength <= MAX_WORLD_SAVE_BYTES, 'World backup exceeds 20 MiB');
    return text;
  }
  function importWorldSave(text, world = WORLD) {
    check(typeof text === 'string' && new TextEncoder().encode(text).byteLength <= MAX_WORLD_SAVE_BYTES, 'World backup exceeds 20 MiB');
    const data = JSON.parse(text, (key, value) => { check(!['__proto__', 'constructor', 'prototype'].includes(key), 'Invalid world property'); return value; });
    check(data?.format === 'heung-shing-world-save' && data.formatVersion === 1, '請喺城市主選單匯入舊城存檔；此處接受世界建設備份。');
    return validateWorldSnapshot(data.snapshot, world);
  }
  const WorldSaveFormat = { MAX_WORLD_SAVE_BYTES, clone, check, point, storageId, tileId, entityCells, entityStorageIds,
    validateEntity, emptyWorldSnapshot, validateWorldSnapshot, mergeWorldCheckpoint, exportWorldSave, importWorldSave, worldSaveError };
  return { WorldSaveFormat };
});
