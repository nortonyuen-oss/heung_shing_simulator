(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function () {
  'use strict';
  const CHUNK_RENDER_TILES = 32;
  const CHUNK_STORAGE_TILES = 64;
  const WORLD = Object.freeze({
    id: 'hong-kong-full-3187x2400-v1', baseTerrainVersion: 'hk-dtm-v1',
    width: 3187, height: 2400, tileMetres: 20,
    storageChunkTiles: CHUNK_STORAGE_TILES, renderChunkTiles: CHUNK_RENDER_TILES,
    detailRadiusChunks: 1,
  });

  function createWorldConfig(options = {}) {
    const config = { ...WORLD, ...options };
    for (const key of ['width', 'height']) {
      if (!Number.isSafeInteger(config[key]) || config[key] < 1) throw new Error(`Invalid world ${key}`);
    }
    if (config.tileMetres !== 20 || config.renderChunkTiles !== 32 || config.storageChunkTiles !== 64 || config.detailRadiusChunks !== 1) {
      throw new Error('World v1 requires 32 render / 64 storage tiles and a 3x3 detail window');
    }
    return Object.freeze(config);
  }

  function chunkBounds(world, kind, x, y) {
    if (!['r', 's'].includes(kind)) throw new Error('Invalid chunk kind');
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return null;
    const size = kind === 'r' ? world.renderChunkTiles : world.storageChunkTiles;
    const col = x * size, row = y * size;
    if (col >= world.width || row >= world.height) return null;
    return { id: `${kind}:${x}:${y}`, col, row, width: Math.min(size, world.width - col), height: Math.min(size, world.height - row) };
  }

  function parseChunkId(id, kind) {
    const match = typeof id === 'string' && id.match(/^([rs]):(\d+):(\d+)$/);
    if (!match || (kind && match[1] !== kind)) throw new Error(`Invalid chunk id: ${id}`);
    return { kind: match[1], x: Number(match[2]), y: Number(match[3]) };
  }

  function intersectBounds(a, b) {
    const col = Math.max(a.col, b.col), row = Math.max(a.row, b.row);
    const right = Math.min(a.col + a.width, b.col + b.width), bottom = Math.min(a.row + a.height, b.row + b.height);
    return right > col && bottom > row ? { col, row, width: right - col, height: bottom - row } : null;
  }

  function requiredDetailChunks(world, col, row, region = { col: 0, row: 0, width: world.width, height: world.height }) {
    if (!Number.isFinite(col) || !Number.isFinite(row)) throw new Error('Invalid camera focus');
    col = Math.max(region.col, Math.min(region.col + region.width - 1, col));
    row = Math.max(region.row, Math.min(region.row + region.height - 1, row));
    const cx = Math.floor(col / 32), cy = Math.floor(row / 32);
    const chunks = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const bounds = chunkBounds(world, 'r', cx + dx, cy + dy);
      if (bounds && intersectBounds(bounds, region)) chunks.push({ ...bounds, distance: Math.abs(dx) + Math.abs(dy) });
    }
    return chunks.sort((a, b) => a.distance - b.distance);
  }
  return { WORLD, CHUNK_RENDER_TILES, CHUNK_STORAGE_TILES, createWorldConfig, chunkBounds, parseChunkId, intersectBounds, requiredDetailChunks };
});
