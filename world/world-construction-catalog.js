(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function () {
  'use strict';
  // Existing assets and calibrated ground corners; city simulation/unlocks remain in the
  // legacy engine. These two parcels exercise 2x2 / 4x4 cross-chunk ownership in the trial.
  const WORLD_BUILDINGS = Object.freeze({
    market2: Object.freeze({ id: 'market2', name: '公共街市', width: 2, height: 2, cost: 3200,
      texture: 'world-market', path: 'Models/publicMarket/pm_market3x3_style_v3.png', sourceWidth: 1600, sourceHeight: 1400,
      corners: { left: [200, 800], front: [800, 1100], right: [1400, 800] } }),
    park4: Object.freeze({ id: 'park4', name: '維園地段', width: 4, height: 4, cost: 5000,
      texture: 'world-park', path: 'Models/parks/park4x4/victoriaPark4-01.png', sourceWidth: 1024, sourceHeight: 1024,
      corners: { left: [8, 716], front: [512, 968], right: [1016, 716] } }),
  });
  return { WORLD_BUILDINGS };
});
