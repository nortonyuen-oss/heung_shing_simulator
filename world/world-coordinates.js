(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function () {
  'use strict';
  // Projection is compiled from main.js's existing isoToScreen/screenToIso by the pack builder.
  // Nothing here changes MAP_WIDTH/MAP_HEIGHT or substitutes chunk-local entity coordinates.
  class WorldModeAdapter {
    constructor(world, projection, region = { col: 0, row: 0, width: world.width, height: world.height }) {
      this.world = world;
      this.projection = projection;
      this.region = region;
      this.rotation = 0;
    }
    setRotation(rotation) {
      this.rotation = ((Math.round(rotation) % 4) + 4) % 4;
      this.projection.setRotation(this.rotation);
    }
    project(col, row) { return this.projection.project(col, row); }
    buildingAnchor(entity) { return this.projection.buildingAnchor(entity.row, entity.col, entity.width, entity.height); }
    unproject(x, y) {
      const tile = this.projection.unproject(x, y);
      return { col: tile.x, row: tile.y };
    }
    clamp(col, row) {
      return { col: Math.max(this.region.col, Math.min(this.region.col + this.region.width - 1, col)),
        row: Math.max(this.region.row, Math.min(this.region.row + this.region.height - 1, row)) };
    }
    cameraFocus(camera) {
      const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
      const ox = camera.width * (Number.isFinite(camera.originX) ? camera.originX : 0.5);
      const oy = camera.height * (Number.isFinite(camera.originY) ? camera.originY : 0.5);
      return this.unproject(camera.scrollX + ox + (camera.width / 2 - ox) / zoom,
        camera.scrollY + oy + (camera.height / 2 - oy) / zoom);
    }
    centreCamera(camera, col, row) {
      const point = this.project(col, row);
      camera.centerOn(point.x, point.y);
    }
  }
  return { WorldModeAdapter };
});
