(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./world-save-format') : root.HeungShingWorld,
    typeof module !== 'undefined' && module.exports ? require('./world-construction-catalog') : root.HeungShingWorld);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function (formatApi, catalog) {
  'use strict';
  const { WorldSaveFormat: f } = formatApi, { WORLD_BUILDINGS } = catalog;
  class WorldEntityRenderer {
    constructor({ scene, adapter, delta, visuals, fitGround, sampleForTile }) {
      Object.assign(this, { scene, adapter, delta, visuals, fitGround, sampleForTile });
      this.objects = new Map(); this.entitySprites = new Map(); this.key = null; this.destroyed = 0;
    }
    clear() { for (const object of this.objects.values()) { object.destroy(); this.destroyed++; } this.objects.clear(); this.entitySprites.clear(); }
    sync(activeIds) {
      const key = `${this.delta.constructionRevision}:${this.adapter.rotation}:${activeIds.slice().sort().join('|')}`;
      if (key === this.key) return;
      this.key = key;
      const previous = this.objects; this.objects = new Map(); this.entitySprites = new Map();
      const image = (id, x, y, texture) => {
        const object = previous.get(id) || this.scene.add.image(x, y, texture);
        object.setTexture(texture).setPosition(x, y); this.objects.set(id, object); return object;
      };
      const active = new Set(activeIds), visible = cell => active.has(`r:${Math.floor(cell.col / 32)}:${Math.floor(cell.row / 32)}`);
      const roadRead = (col, row) => !!this.delta.roadAt(col, row) || this.delta.entityAt(col, row)?.kind === 'bridge';
      for (const chunk of this.delta.chunks.values()) {
        for (const cell of chunk.roads.values()) if (visible(cell)) {
          const point = this.adapter.project(cell.col, cell.row), style = this.visuals.describeRoadStyle(cell.col, cell.row, this.adapter.rotation, roadRead, this.sampleForTile(cell.col, cell.row));
          image(`road:${f.tileId(cell.col, cell.row)}`, point.x, point.y + style.offset, `world-${style.key}`).setOrigin(.5, 1).setDepth(point.y + style.offset + 1);
        }
        for (const cell of chunk.zones.values()) if (visible(cell)) {
          const id = `zone:${f.tileId(cell.col, cell.row)}`, point = this.adapter.project(cell.col, cell.row), object = previous.get(id) || this.scene.add.graphics();
          object.clear().setDepth(point.y + 2);
          point.y -= (cell.height || 0) * 13;
          object.fillStyle({ 1: 0x58ba72, 2: 0x578fdd, 3: 0xe1bf54 }[cell.type], .55);
          object.fillPoints([{ x: point.x, y: point.y - 65 }, { x: point.x + 50, y: point.y - 40 }, { x: point.x, y: point.y - 15 }, { x: point.x - 50, y: point.y - 40 }], true);
          this.objects.set(id, object);
        }
      }
      for (const entity of this.delta.entitiesForChunks(activeIds)) {
        if (entity.kind === 'building') {
          const model = WORLD_BUILDINGS[entity.modelId], anchor = this.adapter.buildingAnchor(entity);
          const object = image(entity.id, anchor.x, anchor.y - 15 - entity.elevation * 13, model.texture);
          const sourceImage = object.texture.getSourceImage(), fit = this.fitGround(model.corners, model.width * 100);
          object.setOrigin(fit.originX / model.sourceWidth, fit.originY / model.sourceHeight);
          object.setScale(fit.scale * model.sourceWidth / sourceImage.width).setDepth(anchor.y - entity.elevation * 13 + 5);
          object.worldEntityId = entity.id; this.objects.set(entity.id, object); this.entitySprites.set(entity.id, object);
        } else {
          const items = [];
          entity.cells.forEach((cell, index) => {
            if (!visible(cell)) return;
            const before = entity.cells[Math.max(0, index - 1)], after = entity.cells[Math.min(entity.cells.length - 1, index + 1)];
            const point = this.adapter.project(cell.col, cell.row);
            let texture;
            if (entity.kind === 'bridge') {
              texture = this.visuals.describeRoad(cell.col, cell.row, this.adapter.rotation, roadRead);
              if (texture.startsWith('road_straight_')) texture = texture.replace('straight', 'bridge');
              texture = `world-${texture}`;
            } else {
              const corner = before.col !== after.col && before.row !== after.row;
              const alongCol = before.col !== after.col;
              texture = corner ? 'world-rail-cross' : (alongCol !== !!(this.adapter.rotation % 2) ? 'world-rail-y' : 'world-rail-x');
            }
            const object = image(`${entity.id}:${index}`, point.x, point.y - entity.elevation * 13 - (entity.kind === 'rail' ? 15 : 0), texture).setOrigin(.5, 1).setDepth(point.y - entity.elevation * 13 + 3);
            if (entity.kind === 'rail') object.setDisplaySize(100, 50);
            this.objects.set(`${entity.id}:${index}`, object); items.push(object);
          });
          this.entitySprites.set(entity.id, items);
        }
      }
      for (const [id, object] of previous) if (!this.objects.has(id)) { object.destroy(); this.destroyed++; }
    }
    snapshot() { return { objects: this.objects.size, entities: this.entitySprites.size, destroyed: this.destroyed }; }
    destroy() { this.clear(); }
  }
  return { WorldEntityRenderer };
});
