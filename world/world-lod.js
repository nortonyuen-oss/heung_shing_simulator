(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function () {
  'use strict';
  class WorldLod {
    constructor(scene, views, prefix = 'world-lod') {
      this.scene = scene; this.views = views; this.prefix = prefix;
      this.image = scene.add.image(0, 0, `${prefix}-0`).setOrigin(0, 0).setDepth(-1000000);
      this.setRotation(0);
    }
    setRotation(rotation) {
      const view = this.views[rotation];
      this.image.setTexture(`${this.prefix}-${rotation}`).setPosition(view.x, view.y).setDisplaySize(view.width, view.height);
    }
    destroy() { this.image.destroy(); }
  }
  return { WorldLod };
});
