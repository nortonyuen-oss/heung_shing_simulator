(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./world-save-format') : root.HeungShingWorld);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function (formatApi) {
  'use strict';
  const { WorldSaveFormat: f } = formatApi;
  const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  class WorldTransportNetwork {
    constructor(delta) {
      this.delta = delta; this.dirty = true; this.version = 0; this.rebuilds = 0;
      this.graphs = { road: new Map(), rail: new Map() }; this.components = { road: new Map(), rail: new Map() };
      this.unsubscribe = delta.subscribe(event => { if (event.all || event.networkChanged) this.dirty = true; });
    }
    ensure() {
      if (!this.dirty) return;
      const graphs = { road: new Map(), rail: new Map() };
      for (const chunk of this.delta.chunks.values()) for (const cell of chunk.roads.values())
        graphs.road.set(f.tileId(cell.col, cell.row), { ...cell, elevation: cell.height || 0, kind: 'road' });
      for (const entity of this.delta.entities.values()) if (['rail', 'bridge'].includes(entity.kind)) {
        const graph = graphs[entity.kind === 'rail' ? 'rail' : 'road'];
        entity.cells.forEach((cell, index) => graph.set(f.tileId(cell.col, cell.row), { ...cell, elevation: entity.elevation, kind: entity.kind,
          entityId: entity.id, endpoint: index === 0 || index === entity.cells.length - 1 }));
      }
      this.graphs = graphs; this.components = { road: new Map(), rail: new Map() }; this.componentCounts = {};
      for (const mode of ['road', 'rail']) {
        const components = this.components[mode]; let next = 0;
        for (const [id, node] of graphs[mode]) {
          if (components.has(id)) continue;
          const queue = [node], component = next++; components.set(id, component);
          for (let at = 0; at < queue.length; at++) for (const neighbor of this.neighbors(mode, queue[at])) {
            const key = f.tileId(neighbor.col, neighbor.row);
            if (!components.has(key)) { components.set(key, component); queue.push(neighbor); }
          }
          // Canonical component IDs survive save/reload and construction insertion order.
          const canonical = queue.reduce((id, cell) => Math.min(id, cell.row * this.delta.world.width + cell.col), Infinity);
          for (const cell of queue) components.set(f.tileId(cell.col, cell.row), canonical);
        }
        this.componentCounts[mode] = next;
      }
      this.dirty = false; this.version++; this.rebuilds++;
    }
    neighbors(mode, node) {
      const graph = this.graphs[mode], result = [];
      for (const [dc, dr] of directions) {
        const other = graph.get(f.tileId(node.col + dc, node.row + dr)); if (!other) continue;
        if (mode === 'rail' ? node.elevation !== other.elevation : Math.abs(node.elevation - other.elevation) > 1) continue;
        // A bridge connects to land roads at its ends, never through the middle of a span.
        if (node.kind === 'bridge' && other.kind !== 'bridge' && !node.endpoint || other.kind === 'bridge' && node.kind !== 'bridge' && !other.endpoint) continue;
        result.push(other);
      }
      return result;
    }
    nodeAt(mode, cell) { this.ensure(); return this.graphs[mode]?.get(f.tileId(cell.col, cell.row)); }
    componentAt(mode, cell) { this.ensure(); return this.components[mode]?.get(f.tileId(cell.col, cell.row)); }
    roadAccess(cells) {
      this.ensure();
      let result = null;
      for (const cell of cells) for (const [dc, dr] of directions) {
        const component = this.components.road.get(f.tileId(cell.col + dc, cell.row + dr));
        if (component !== undefined && (result === null || component < result)) result = component;
      }
      return result;
    }
    findRoute(mode, from, to, { maxVisited = 100000, maxLength = 8192 } = {}) {
      f.check(['road', 'rail'].includes(mode) && f.point(from, this.delta.world) && f.point(to, this.delta.world), '路線座標無效。');
      this.ensure(); const graph = this.graphs[mode], start = f.tileId(from.col, from.row), end = f.tileId(to.col, to.row);
      f.check(graph.has(start) && graph.has(end), mode === 'road' ? '起點及終點都需要道路或橋樑。' : '起點及終點都需要地面路軌。');
      if (this.components[mode].get(start) !== this.components[mode].get(end)) return null;
      const queue = [start], previous = new Map([[start, null]]);
      for (let at = 0; at < queue.length && !previous.has(end); at++) {
        for (const neighbor of this.neighbors(mode, graph.get(queue[at]))) {
          const id = f.tileId(neighbor.col, neighbor.row); if (previous.has(id)) continue;
          f.check(previous.size < maxVisited, '路網查詢超出上限，請選擇較近終點。'); previous.set(id, queue[at]); queue.push(id);
        }
      }
      if (!previous.has(end)) return null;
      const path = []; let current = end;
      while (current !== null) {
        f.check(path.length < maxLength, '班次路線太長，請分段設定。');
        const node = graph.get(current); path.push({ col: node.col, row: node.row, elevation: node.elevation }); current = previous.get(current);
      }
      return path.reverse();
    }
    snapshot() { this.ensure(); return { roadNodes: this.graphs.road.size, railNodes: this.graphs.rail.size, roadComponents: this.componentCounts.road,
      railComponents: this.componentCounts.rail, version: this.version, rebuilds: this.rebuilds }; }
    destroy() { this.unsubscribe(); this.graphs.road.clear(); this.graphs.rail.clear(); this.components.road.clear(); this.components.rail.clear(); }
  }
  return { WorldTransportNetwork };
});
