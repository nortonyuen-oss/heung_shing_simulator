const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { WORLD } = require('../world/world-config');
const { WorldModeAdapter } = require('../world/world-coordinates');
const { WorldDeltaStore } = require('../world/world-delta-store');
const { WorldMinimapTransform, WorldOverviewCache, projectedRegion, localRegion, sparseMinimapData } = require('../world/world-minimap');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function adapter() {
  const { legacyAdapterSource } = await import('../world/terrain-pack-builder.mjs');
  const context = vm.createContext({}); vm.runInContext(legacyAdapterSource(), context);
  return new WorldModeAdapter(WORLD, context.HeungShingWorld.createLegacyWorldProjection(WORLD));
}
const closeTo = (actual, expected) => assert(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test('minimap uses the real rectangular-world projection for four rotations, local and global clicks', async () => {
  const a = await adapter(), worldRegion = { col: 0, row: 0, width: WORLD.width, height: WORLD.height };
  for (let rotation = 0; rotation < 4; rotation++) {
    a.setRotation(rotation);
    for (const region of [worldRegion, localRegion(WORLD, { col: 1599, row: 1791 }), localRegion(WORLD, { col: 3186, row: 2399 })]) {
      const transform = new WorldMinimapTransform(a, projectedRegion(a, region), 680, 340);
      for (const tile of [{ col: region.col, row: region.row }, { col: region.col + region.width - 1, row: region.row + region.height - 1 },
        { col: region.col + region.width / 3, row: region.row + region.height / 3 }]) {
        const p = transform.worldToMinimap(tile.col, tile.row), result = transform.minimapToWorldTile(p.x, p.y);
        assert(p.x >= 0 && p.x <= 680 && p.y >= 0 && p.y <= 340);
        closeTo(result.col, tile.col); closeTo(result.row, tile.row);
      }
      const far = transform.minimapToWorldTile(-1000000, 1000000);
      assert(far.col >= 0 && far.col < WORLD.width && far.row >= 0 && far.row < WORLD.height);
    }
  }
});

test('viewport follows live camera zoom/origin even before Phaser updates its worldView cache', async () => {
  const a = await adapter(); a.setRotation(3);
  const bounds = projectedRegion(a, localRegion(WORLD, { col: 1000, row: 1700 })), t = new WorldMinimapTransform(a, bounds, 512, 256);
  const camera = { scrollX: 4000, scrollY: -5000, width: 1280, height: 800, originX: .25, originY: .75, zoom: .4, worldView: { x: 0, y: 0 } };
  const points = t.viewport(camera), first = t.projectedToMinimap(4000 + 320 - 320 / .4, -5000 + 600 - 600 / .4);
  assert.deepEqual(points[0], first);
  closeTo(points[1].x - points[0].x, camera.width / camera.zoom * t.scale);
  closeTo(points[3].y - points[0].y, camera.height / camera.zoom * t.scale);
  const centre = t.projectedToMinimap(4000 + 320 + 320 / .4, -5000 + 600 - 200 / .4);
  closeTo((points[0].x + points[2].x) / 2, centre.x); closeTo((points[0].y + points[2].y) / 2, centre.y);
});

test('local map stays within world edges and only changes its centre at a 32-tile threshold', () => {
  assert.deepEqual(localRegion(WORLD, { col: -1, row: 0 }), { col: 0, row: 0, width: 256, height: 256 });
  assert.deepEqual(localRegion(WORLD, { col: 3186, row: 2399 }), { col: 2931, row: 2144, width: 256, height: 256 });
  assert.deepEqual(localRegion(WORLD, { col: 1600, row: 1760 }), localRegion(WORLD, { col: 1631, row: 1791 }));
});

test('sparse overlay queries include unloaded cross-chunk entities once and omit remote chunks locally', () => {
  const delta = new WorldDeltaStore(), building = { id: 'cross-boundary', kind: 'building', modelId: 'park4', col: 255, row: 255, width: 4, height: 4, elevation: 0, ownerChunk: 's:3:3' };
  delta.transact([{ kind: 'entity', id: building.id, value: building }, { kind: 'roads', col: 3000, row: 2300, value: { height: 0 } }]);
  const local = sparseMinimapData(delta, { col: 256, row: 256, width: 128, height: 128 });
  assert.equal(local.entities.length, 1); assert.equal(local.entities[0].id, building.id); assert.equal(local.chunks.length, 1);
  const global = sparseMinimapData(delta); assert.equal(global.entities.length, 1); assert.equal(global.chunks.length, 5);
});

test('local raster cache bounds retained bytes and decodes, releases evicted bitmaps', async () => {
  let inflight = 0, peak = 0, closed = 0;
  const cache = new WorldOverviewCache({ budgetBytes: 8, concurrency: 2, load: async () => {
    peak = Math.max(peak, ++inflight); await tick(); inflight--; return { width: 1, height: 1, close() { closed++; } };
  } });
  // Real local windows require at most four rasters; visit separate windows to exercise LRU.
  for (let i = 0; i < 6; i++) { cache.setWanted([{ url: `image-${i}` }]); await tick(); await tick(); await tick(); }
  assert(peak <= 2); assert.equal(cache.snapshot().bytes, 8); assert.equal(cache.snapshot().images, 2); assert.equal(closed, 4);
  cache.destroy(); assert.equal(closed, 6); assert.equal(cache.snapshot().bytes, 0);
});

test('obsolete raster completions are closed rather than drawing an old location', async () => {
  const pending = [], closed = [];
  const cache = new WorldOverviewCache({ load: (view, signal) => new Promise(resolve => pending.push({ view, signal, resolve })) });
  cache.setWanted([{ url: 'old' }]); await tick(); cache.setWanted([{ url: 'new' }]); await tick();
  assert(pending[0].signal.aborted);
  pending[0].resolve({ width: 1, height: 1, close() { closed.push('old'); } });
  pending[1].resolve({ width: 1, height: 1, close() { closed.push('new'); } }); await tick();
  assert.equal(cache.get({ url: 'old' }), null); assert(cache.get({ url: 'new' })); assert.deepEqual(closed, ['old']);
  cache.destroy(); assert.deepEqual(closed, ['old', 'new']);
});

test('failed local raster uses a retry cooldown instead of retrying every animation frame', async () => {
  let time = 100, changes = 0;
  const cache = new WorldOverviewCache({ now: () => time, onChange: () => changes++, load: async () => { throw new Error('404'); } });
  cache.setWanted([{ url: 'bad' }]); await tick();
  for (let i = 0; i < 60; i++) cache.setWanted([{ url: 'bad' }]);
  assert.equal(cache.snapshot().requests, 1); assert.equal(cache.snapshot().errors, 1); assert.equal(changes, 1);
  time += 5001; cache.setWanted([{ url: 'bad' }]); await tick(); assert.equal(cache.snapshot().requests, 2); cache.destroy();
});

test('raster cache caps simultaneous decodes and does not churn if the visible set exceeds its byte budget', async () => {
  let active = 0, peak = 0, closed = 0;
  const cache = new WorldOverviewCache({ budgetBytes: 8, concurrency: 2, load: async () => {
    peak = Math.max(peak, ++active); await tick(); active--; return { width: 1, height: 1, close() { closed++; } };
  } });
  cache.setWanted([{ url: 'one' }, { url: 'two' }, { url: 'three' }]);
  for (let i = 0; i < 10; i++) await tick();
  assert.equal(peak, 2); assert.equal(cache.snapshot().bytes, 8); assert.equal(cache.snapshot().requests, 3); assert.equal(cache.snapshot().errors, 1);
  assert.equal(closed, 1); cache.destroy(); assert.equal(closed, 3);
});
