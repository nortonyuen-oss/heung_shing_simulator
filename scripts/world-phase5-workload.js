const { WorldSaveFormat: f } = require('../world/world-save-format');
const { emptyWorldSimulation } = require('../world/world-simulation-format');
function makeWorldWorkload() {
  const snapshot = f.emptyWorldSnapshot(), chunks = new Map(); snapshot.revision = 1; snapshot.city = { name: 'Phase 5 壓力測試', budget: 10000000, startYear: 1980 };
  const chunk = (col, row) => { const id = f.storageId(col, row); if (!chunks.has(id)) chunks.set(id, { chunkId: id, revision: 1, terrainEdits: [], zones: [], roads: [], entityIds: [] }); return chunks.get(id); };
  const terrain = new Set();
  const flat = cell => { const key = f.tileId(cell.col, cell.row); if (!terrain.has(key)) { terrain.add(key); chunk(cell.col, cell.row).terrainEdits.push({ ...cell, terrainType: 1, height: 0 }); } };
  const addEntity = entity => { snapshot.entities.push(entity); for (const cell of f.entityCells(entity)) flat(cell); for (const id of f.entityStorageIds(entity)) chunks.get(id).entityIds.push(entity.id); };
  for (let group = 0; group < 16; group++) {
    const row = 128 + group * 128;
    for (let col = 96; col < 3096; col++) { const cell = { col, row }; flat(cell); chunk(col, row).roads.push({ ...cell, height: 0 }); }
    for (let col = 96; col < 3096; col += 3) { const cell = { col, row: row - 1 }; flat(cell); chunk(cell.col, cell.row).zones.push({ ...cell, type: col % 6 ? 2 : 1, density: 1, height: 0 }); }
    const rail = { id: `rail-${group}`, kind: 'rail', col: 96, row: row + 2, elevation: 0, ownerChunk: f.storageId(96, row + 2), cells: Array.from({ length: 1504 }, (_, i) => ({ col: 96 + i, row: row + 2 })) }; addEntity(rail);
  }
  for (let row = 72; row + 4 < 2400; row += 64) for (let col = 72; col + 4 < 3187; col += 64)
    addEntity({ id: `building-${col}-${row}`, kind: 'building', modelId: 'park4', col, row, width: 4, height: 4, elevation: 0, ownerChunk: f.storageId(col, row) });
  snapshot.simulation = emptyWorldSimulation(0);
  for (let i = 0; i < 64; i++) {
    const group = Math.floor(i / 4), mode = i % 4 === 3 ? 'rail' : 'road', row = 128 + group * 128 + (mode === 'rail' ? 2 : 0), col = 96 + (i % 3) * 384;
    const from = { col, row }, to = { col: col + 255, row }, path = Array.from({ length: 256 }, (_, n) => ({ col: col + n, row, elevation: 0 }));
    snapshot.simulation.services.push({ id: `service-${i}`, name: `測試班次 ${i}`, mode, from, to, path, status: 'active', progressMs: i * 200, completedLegs: 0 });
  }
  snapshot.chunks = [...chunks.values()]; f.validateWorldSnapshot(snapshot); f.exportWorldSave(snapshot);
  return snapshot;
}
module.exports = { makeWorldWorkload };
