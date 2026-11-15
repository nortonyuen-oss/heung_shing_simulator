(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./world-save-format') : root.HeungShingWorld,
    typeof module !== 'undefined' && module.exports ? require('./world-construction-catalog') : root.HeungShingWorld,
    typeof module !== 'undefined' && module.exports ? require('./world-crypto') : root.HeungShingWorld);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function (formatApi, catalog, cryptoApi) {
  'use strict';
  const { WorldSaveFormat: f } = formatApi, { WORLD_BUILDINGS } = catalog;
  function worldLine(a, b) {
    // Manhattan path keeps a single connected road/rail topology, including diagonal drags.
    const cells = [{ ...a }]; let col = a.col, row = a.row;
    while (col !== b.col || row !== b.row) {
      if (col !== b.col) { col += Math.sign(b.col - col); cells.push({ col, row }); }
      if (row !== b.row) { row += Math.sign(b.row - row); cells.push({ col, row }); }
    }
    return cells;
  }
  class WorldConstruction {
    constructor({ world, region, data, delta, makeId = () => `entity-${cryptoApi.worldUuid()}` }) { Object.assign(this, { world, region, data, delta, makeId }); }
    inside(cell) { return f.point(cell, this.world) && cell.col >= this.region.col && cell.row >= this.region.row
      && cell.col < this.region.col + this.region.width && cell.row < this.region.row + this.region.height; }
    async plan(tool, a, b = a) {
      const revision = this.delta.constructionRevision, operations = [], cells = [], push = (kind, cell, value) => operations.push({ kind, ...cell, value });
      f.check(this.inside(a) && this.inside(b), '請喺世界範圍內建設。');
      let cost = 0, id;
      if (WORLD_BUILDINGS[tool]) {
        const model = WORLD_BUILDINGS[tool];
        for (let r = 0; r < model.height; r++) for (let c = 0; c < model.width; c++) cells.push({ col: a.col + c, row: a.row + r });
        f.check(cells.every(cell => this.inside(cell)), '建築超出世界邊界。');
        const ground = await Promise.all(cells.map(cell => this.data.getTile(cell.col, cell.row)));
        f.check(ground.every(tile => [1, 3, 6].includes(tile.terrainType) && tile.height === ground[0].height), '建築需要同一高度嘅陸地；可先整平地形。');
        f.check(cells.every(cell => !this.delta.entityAt(cell.col, cell.row) && !this.delta.roadAt(cell.col, cell.row)), '地段已經有建設。');
        id = this.makeId(); cost = model.cost;
        push('entity', { id }, { id, kind: 'building', modelId: tool, ...a, width: model.width, height: model.height,
          elevation: ground[0].height, ownerChunk: f.storageId(a.col, a.row) });
      } else if (['road', 'bridge', 'rail'].includes(tool)) {
        cells.push(...worldLine(a, b)); f.check(cells.length <= 2048, '路線太長。');
        f.check(cells.every(cell => this.inside(cell) && !this.delta.entityAt(cell.col, cell.row)), '路線碰到現有建設或超出範圍。');
        const ground = await Promise.all(cells.map(cell => this.data.getTile(cell.col, cell.row)));
        if (tool === 'road') {
          f.check(ground.every(tile => tile.terrainType !== 5), '道路遇到海水；請選擇橋樑。');
          for (let i = 1; i < ground.length; i++) f.check(Math.abs(ground[i].height - ground[i - 1].height) <= 1, '道路坡度太陡。');
          for (let index = 0; index < cells.length; index++) {
            const cell = cells[index], heights = await Promise.all([[0, -1], [1, 0], [0, 1], [-1, 0]].map(async ([dc, dr]) => {
              const neighbor = { col: cell.col + dc, row: cell.row + dr };
              return f.point(neighbor, this.world) ? (await this.data.getTile(neighbor.col, neighbor.row)).height : ground[index].height;
            }));
            const drops = heights.map((height, direction) => height < ground[index].height ? direction : -1).filter(direction => direction >= 0);
            f.check(drops.length < 2 || drops.length === 2 && Math.abs(drops[0] - drops[1]) === 2, '呢段山坡未能鋪路，請先整平。');
          }
          cells.forEach((cell, index) => { if (!this.delta.roadAt(cell.col, cell.row)) { push('roads', cell, { height: ground[index].height }); cost += 10; } });
        } else {
          f.check(cells.every(cell => !this.delta.roadAt(cell.col, cell.row)), '請先拆除重疊道路。');
          if (tool === 'rail') f.check(ground.every(tile => tile.terrainType !== 5 && tile.height === ground[0].height), '地面路軌需要同一高度嘅陸地。');
          if (tool === 'bridge') f.check(ground[0].terrainType !== 5 && ground.at(-1).terrainType !== 5 && ground.some(tile => tile.terrainType === 5), '橋樑兩端要落喺陸地，並跨越水域。');
          id = this.makeId(); cost = cells.length * (tool === 'bridge' ? 100 : 80);
          push('entity', { id }, { id, kind: tool, ...a, cells, elevation: tool === 'bridge' ? Math.min(8, Math.max(...ground.map(tile => tile.height)) + 1) : ground[0].height,
            ownerChunk: f.storageId(a.col, a.row) });
        }
      } else if (['raise', 'lower', 'flatten4', 'water4'].includes(tool)) {
        const size = ['flatten4', 'water4'].includes(tool) ? 4 : 1, targets = new Map(), initial = await this.data.getTile(a.col, a.row);
        const target = tool === 'raise' ? Math.min(8, initial.height + 1) : tool === 'lower' ? Math.max(0, initial.height - 1) : 0;
        const left = Math.max(0, a.col - 9), top = Math.max(0, a.row - 9);
        const right = Math.min(this.world.width, a.col + size + 9), bottom = Math.min(this.world.height, a.row + size + 9);
        const samples = new Map();
        await Promise.all(Array.from({ length: bottom - top }, (_, r) => Array.from({ length: right - left }, (_, c) => {
          const cell = { col: left + c, row: top + r }; return this.data.getTile(cell.col, cell.row).then(tile => samples.set(f.tileId(cell.col, cell.row), { ...tile, ...cell }));
        })).flat());
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
          const cell = { col: a.col + c, row: a.row + r }; f.check(this.inside(cell), '整平範圍超出世界邊界。');
          targets.set(f.tileId(cell.col, cell.row), { ...cell, height: target, terrainType: tool === 'water4' ? 5 : target > 0 ? 6 : 1 });
        }
        const queue = [...targets.values()];
        for (let index = 0; index < queue.length; index++) {
          f.check(queue.length < 10000, '整地範圍太大。');
          const current = queue[index];
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const col = current.col + dc, row = current.row + dr, key = f.tileId(col, row), old = targets.get(key) || samples.get(key);
            if (!old || Math.abs(old.height - current.height) <= 1) continue;
            f.check(![4, 5].includes(old.terrainType), '水岸旁高度變化太大。');
            const value = { col, row, height: current.height + Math.sign(old.height - current.height), terrainType: 6 };
            if (!value.height) value.terrainType = 1;
            targets.set(key, value); queue.push(value);
          }
        }
        for (const value of targets.values()) {
          f.check(this.inside(value), '整地影響到世界邊界以外，請選擇較內側位置。');
          f.check(!this.delta.entityAt(value.col, value.row) && !this.delta.roadAt(value.col, value.row), '整地範圍有建設，請先拆除。');
          const old = samples.get(f.tileId(value.col, value.row));
          if (old.height !== value.height || old.terrainType !== value.terrainType) {
            const base = this.data.getBaseTile ? await this.data.getBaseTile(value.col, value.row) : null;
            push('terrain', value, base && base.height === value.height && base.terrainType === value.terrainType ? null : value);
            cells.push(value); cost += 10;
            if (value.terrainType === 5 && this.delta.zoneAt(value.col, value.row)) push('zones', value, null);
          }
        }
      } else if (tool === 'bulldoze') {
        cells.push(a); const entity = this.delta.entityAt(a.col, a.row);
        if (entity) { id = entity.id; push('entity', { id }, null); cells.push(...f.entityCells(entity)); }
        else { push('roads', a, null); push('zones', a, null); }
        cost = 5;
      } else if (['zoneR', 'zoneC', 'zoneI'].includes(tool)) {
        cells.push(...worldLine(a, b));
        const tiles = await Promise.all(cells.map(cell => this.data.getTile(cell.col, cell.row)));
        f.check(cells.every(cell => !this.delta.entityAt(cell.col, cell.row) && !this.delta.roadAt(cell.col, cell.row)) && tiles.every(tile => tile.terrainType !== 5), '分區需要未被佔用嘅陸地。');
        cells.forEach((cell, index) => push('zones', cell, { type: { zoneR: 1, zoneC: 2, zoneI: 3 }[tool], density: 1, height: tiles[index].height })); cost = cells.length * 50;
      } else throw new Error('Unknown construction tool');
      f.check(this.delta.constructionRevision === revision, '地圖已有新修改，請重新預覽。');
      f.check(this.delta.header.city.budget >= cost, '資金不足。');
      return { tool, revision, operations, cells, cost, entityId: id };
    }
    confirm(plan) { f.check(plan && plan.revision === this.delta.constructionRevision, '地圖已有新修改，請重新預覽。'); return this.delta.transact(plan.operations, { cost: plan.cost }); }
  }
  return { WorldConstruction, worldLine };
});
