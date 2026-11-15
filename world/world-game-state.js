(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function () {
  'use strict';
  class SparseChunkCells extends Map {
    constructor() { super(); this.chunks = new Map(); }
    chunkId(id) { const [row, col] = id.split(':').map(Number); return `r:${Math.floor(col / 32)}:${Math.floor(row / 32)}`; }
    set(id, value) {
      const key = this.chunkId(id); let chunk = this.chunks.get(key);
      if (!chunk) { chunk = new Map(); chunk.counts = new Map(); this.chunks.set(key, chunk); }
      if (chunk.has(id)) { const old = chunk.get(id), count = chunk.counts.get(old) - 1; count ? chunk.counts.set(old, count) : chunk.counts.delete(old); }
      chunk.set(id, value); chunk.counts.set(value, (chunk.counts.get(value) || 0) + 1);
      return super.set(id, value);
    }
    delete(id) {
      if (!this.has(id)) return false;
      const key = this.chunkId(id), chunk = this.chunks.get(key), old = this.get(id), count = chunk.counts.get(old) - 1;
      count ? chunk.counts.set(old, count) : chunk.counts.delete(old); chunk.delete(id);
      if (!chunk.size) this.chunks.delete(key);
      return super.delete(id);
    }
    clear() { super.clear(); this.chunks.clear(); }
  }
  function* sparseGameChunkEntries(grid, chunkIds) {
    for (const id of chunkIds) { const chunk = grid.sparseChunkCells.get(id); if (chunk) yield* chunk; }
  }
  // Array-compatible access for the existing game rules. Only written cells are owned;
  // reading an unmodified terrain cell never allocates a tile or a full map row.
  function createSparseGameGrid(width, height, fallback = 0, changed = () => {}) {
    const cells = new SparseChunkCells(), rows = new Map();
    const numeric = key => typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key);
    const readDefault = (row, col) => typeof fallback === 'function' ? fallback(row, col) : fallback;
    const grid = new Proxy(new Array(height), {
      get(target, key) {
        if (key === 'sparseCells') return cells;
        if (key === 'sparseChunkCells') return cells.chunks;
        if (key === 'clearSparse') return () => cells.clear();
        if (!numeric(key)) return Reflect.get(target, key);
        const row = Number(key); if (row >= height) return undefined;
        if (!rows.has(row)) rows.set(row, new Proxy([], {
          get(line, column) {
            if (column === 'length') return width;
            if (!numeric(column)) return Reflect.get(line, column);
            const col = Number(column); if (col >= width) return undefined;
            const id = `${row}:${col}`;
            return cells.has(id) ? cells.get(id) : readDefault(row, col);
          },
          set(line, column, value) {
            if (!numeric(column)) return Reflect.set(line, column, value);
            const col = Number(column); if (col >= width) throw new Error('World cell outside map');
            const id = `${row}:${col}`, old = cells.has(id) ? cells.get(id) : readDefault(row, col);
            if (Object.is(old, value) && (cells.has(id) || typeof fallback !== 'function')) return true;
            // Keep explicit zeroes: clearing a tile must override migrated base data too.
            cells.set(id, value); changed(row, col, value, old); return true;
          },
        }));
        return rows.get(row);
      },
      set(target, key, value) {
        if (!numeric(key)) return Reflect.set(target, key, value);
        throw new Error('World grids accept cell writes, not replacement rows');
      },
    });
    return grid;
  }
  function serializeSparseGameGrid(grid) { return [...grid.sparseCells].map(([id, value]) => [...id.split(':').map(Number), value]); }
  function restoreSparseGameGrid(grid, records) { for (const [row, col, value] of records || []) grid[row][col] = value; return grid; }
  function validateGameState(game, world, check) {
    check(game && game.version === 1 && game.city && typeof game.city === 'object'
      && typeof game.city.name === 'string' && Number.isFinite(game.city.budget), 'Invalid integrated city state');
    check(game.layers && typeof game.layers === 'object' && game.buildingData && typeof game.buildingData === 'object', 'Invalid integrated city layers');
    const allowed = new Set(['mapData', 'heightMap', 'zoneMap', 'zoneDensityMap']);
    for (const [name, records] of Object.entries(game.layers)) {
      check(allowed.has(name) && Array.isArray(records) && records.length <= world.width * world.height, 'Invalid sparse layer');
      const seen = new Set();
      for (const record of records) {
        check(Array.isArray(record) && record.length === 3, 'Invalid sparse cell');
        const [row, col, value] = record, id = `${row}:${col}`;
        check(Number.isInteger(row) && row >= 0 && row < world.height && Number.isInteger(col) && col >= 0 && col < world.width
          && Number.isInteger(value) && value >= 0 && value <= (name === 'heightMap' ? 8 : name === 'mapData' ? 6 : 3) && !seen.has(id), 'Invalid sparse cell');
        seen.add(id);
      }
    }
    for (const [id, record] of Object.entries(game.buildingData)) {
      const parts = /^(\d+):(\d+)$/.exec(id);
      check(parts && Number(parts[1]) < world.height && Number(parts[2]) < world.width && record && typeof record.type === 'string', 'Invalid city building');
      const w = record.footprintCols ?? 1, h = record.footprintRows ?? 1;
      check(Number.isInteger(w) && w > 0 && w <= 64 && Number.isInteger(h) && h > 0 && h <= 64
        && Number(parts[2]) + w <= world.width && Number(parts[1]) + h <= world.height, 'Invalid city building footprint');
    }
    if(game.chunkTable!==undefined){
      check(Array.isArray(game.chunkTable)&&game.chunkTable.length<=Math.ceil(world.width/64)*Math.ceil(world.height/64),'Invalid chunk summary table');
      const seen=new Set(), fields=['population','powerSupply','powerDemand','taxIncome','expenses','demandR','demandC','demandI'];
      for(const row of game.chunkTable){const match=/^s:(\d+):(\d+)$/.exec(row.chunkId||'');check(match&&Number(match[1])*64<world.width&&Number(match[2])*64<world.height&&!seen.has(row.chunkId),'Invalid summary chunk');seen.add(row.chunkId);
        check(Object.keys(row).length===fields.length+1&&fields.every(field=>Number.isFinite(row[field])),'Invalid chunk summary fields');}
    }
    for (const name of ['bridgeMap', 'roadUnderlayMap', 'treeMap', 'debrisMap', 'busStopMap']) {
      check(Array.isArray(game[name]), `Invalid ${name}`);
      for (const entry of game[name]) check(Array.isArray(entry) && /^(\d+):(\d+)$/.test(entry[0])
        && Number(entry[0].split(':')[0]) < world.height && Number(entry[0].split(':')[1]) < world.width, 'Invalid city map entry');
    }
    for (const name of ['powerSources', 'powerLineSet', 'lowDensityLockSet']) check(Array.isArray(game[name])
      && game[name].every(id => /^(\d+):(\d+)$/.test(id) && Number(id.split(':')[0]) < world.height && Number(id.split(':')[1]) < world.width), 'Invalid city tile set');
    return game;
  }
  return { createSparseGameGrid, sparseGameChunkEntries, serializeSparseGameGrid, restoreSparseGameGrid, validateGameState };
});
