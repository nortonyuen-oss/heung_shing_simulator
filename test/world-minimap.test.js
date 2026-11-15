const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { WORLD } = require('../world/world-config');
const { WorldModeAdapter } = require('../world/world-coordinates');
const { WorldDeltaStore } = require('../world/world-delta-store');
const { WorldMinimapTransform, WorldOverviewCache, WorldGameMinimap, projectedRegion, localRegion, sparseMinimapData } = require('../world/world-minimap');
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

async function gameMinimap() {
  const a = await adapter(), manifest = { lod: [], localLod: { size: 256, regions: {} } };
  for (let rotation = 0; rotation < 4; rotation++) { a.setRotation(rotation); manifest.lod.push({ ...projectedRegion(a, { col: 0, row: 0, width: WORLD.width, height: WORLD.height }), rotation }); }
  for (let y = 0; y < Math.ceil(WORLD.height / 256); y++) for (let x = 0; x < Math.ceil(WORLD.width / 256); x++) {
    const region = { col: x * 256, row: y * 256, width: Math.min(256, WORLD.width - x * 256), height: Math.min(256, WORLD.height - y * 256), views: [] };
    for (let rotation = 0; rotation < 4; rotation++) { a.setRotation(rotation); region.views.push({ ...projectedRegion(a, region), url: `${x}:${y}:${rotation}` }); }
    manifest.localLod.regions[`${x}:${y}`] = region;
  }
  a.setRotation(0);
  const camera = { width: 1280, height: 900, zoom: .8, centerOn(x, y) { this.scrollX = x - this.width / 2; this.scrollY = y - this.height / 2; } };
  const scene = { offsetX: 0, offsetY: 0, cameras: { main: camera }, textures: { get: () => ({ getSourceImage: () => ({ width: 1024, height: 512 }) }) } };
  a.centreCamera(camera, 1716, 1821);
  const map = new WorldGameMinimap({ scene, adapter: a, manifest, load: async () => ({ width: 512, height: 256, close() {} }) });
  const draws = [], ctx = { canvas: { width: 512, height: 256 }, clearRect() {}, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {}, drawImage(...args) { draws.push(args); } };
  return { a, camera, scene, map, ctx, draws, manifest };
}

test('original-game minimap clicks use the exact painted landmark positions in both scopes and four rotations', async () => {
  const fs = require('node:fs'), { a, scene, map, ctx, draws, manifest } = await gameMinimap();
  const context = vm.createContext({ isWorldGameActive: () => true, __worldGameHost: { adapter: a, minimap: map }, MAP_WIDTH: WORLD.width, MAP_HEIGHT: WORLD.height, mapRotation: 0 });
  vm.runInContext(fs.readFileSync(require.resolve('../city-minimap'), 'utf8'), context);
  for (let rotation = 0; rotation < 4; rotation++) for (const mode of ['world', 'local']) for (const tile of [{ col: 1697, row: 1832 }, { col: 1980, row: 1450 }]) {
    a.setRotation(rotation); context.mapRotation = rotation; a.centreCamera(scene.cameras.main, tile.col, tile.row); map.setMode(mode);
    draws.length = 0; map.drawBase(ctx);
    // Independently locate the landmark using the ACTUAL drawImage placement,
    // then send that canvas fraction through the original game's click handler.
    const [, x, y, width, height] = draws[0], view = manifest.lod[rotation], p = a.project(tile.col, tile.row);
    const px = x + (p.x - view.x) / view.width * width, py = y + (p.y - 40 - view.y) / view.height * height;
    const world = context.cityMinimapFractionToWorld(scene, px / 512, py / 256), actual = a.unproject(world.x, world.y);
    closeTo(actual.col, tile.col); closeTo(actual.row, tile.row);
    const fraction = context.cityMinimapWorldToFraction(scene, p.x, p.y); closeTo(fraction.x, px / 512); closeTo(fraction.y, py / 256);
  }
  map.destroy();
});

test('ordinary 256 cities retain their original minimap geometry and inverse navigation', async () => {
  const fs = require('node:fs'), { legacyAdapterSource } = await import('../world/terrain-pack-builder.mjs');
  const context = vm.createContext({ isWorldGameActive: () => false, MAP_WIDTH: 256, MAP_HEIGHT: 256, mapRotation: 0 });
  vm.runInContext(legacyAdapterSource(), context);
  const p = context.HeungShingWorld.createLegacyWorldProjection({ width: 256, height: 256 });
  context.isoToScreen = p.project; context.screenToIso = p.unproject;
  vm.runInContext(fs.readFileSync(require.resolve('../city-minimap'), 'utf8'), context);
  const scene = { offsetX: -1000, offsetY: 400 };
  for (let rotation = 0; rotation < 4; rotation++) {
    context.mapRotation = rotation; p.setRotation(rotation);
    for (const [col, row] of [[0, 0], [80, 40], [255, 255]]) {
      const point = p.project(col, row), fraction = context.cityMinimapWorldToFraction(scene, point.x + scene.offsetX, point.y + scene.offsetY);
      const result = context.cityMinimapFractionToWorld(scene, fraction.x, fraction.y);
      closeTo(result.x, point.x + scene.offsetX); closeTo(result.y, point.y + scene.offsetY);
    }
  }
});

test('local minimap freezes the painted region during dragging, then follows the camera after release', async () => {
  const { a, camera, map, ctx } = await gameMinimap(); map.drawBase(ctx);
  const before = { ...map.region }; map.beginNavigation(); const point = map.tileToPoint(1790, 1870);
  for (let i = 0; i < 8; i++) {
    const tile = map.fractionToTile(point.x / 512, point.y / 256); closeTo(tile.col, 1790); closeTo(tile.row, 1870);
    a.centreCamera(camera, tile.col, tile.row); map.layout(); assert.deepEqual(map.region, before);
  }
  map.endNavigation(); map.layout(); assert.notDeepEqual(map.region, before); map.destroy();
});

test('minimap terrain is not repainted every frame and local image decodes stay bounded during travel', async () => {
  const { a, camera, map, ctx } = await gameMinimap();
  for (let n = 0; n < 12; n++) {
    a.centreCamera(camera, 300 + n * 210, 300 + n % 6 * 260); map.drawBase(ctx);
    for (let i = 0; i < 12 && map.cache.pending.size; i++) await tick(); map.drawBase(ctx);
    for (let i = 0; i < 60; i++) assert.equal(map.needsRedraw(512, 256), false);
    assert(map.snapshot().cache.bytes <= 4 * 1024 * 1024); assert.equal(map.snapshot().cache.errors, 0);
  }
  map.setMode('world'); map.drawBase(ctx); assert.equal(map.cache.wanted.size, 0); map.destroy(); assert.equal(map.snapshot().cache.bytes, 0);
});
