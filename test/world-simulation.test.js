const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { WORLD } = require('../world/world-config');
const { WorldSaveFormat: f } = require('../world/world-save-format');
const { WorldDeltaStore } = require('../world/world-delta-store');
const { WorldConstruction } = require('../world/world-construction');
const { WorldSaveSession } = require('../world/world-save-session');
const { createWorldSqliteStore } = require('../world/world-sqlite-store');
const { WorldTransportNetwork } = require('../world/world-transport-network');
const { WorldSimulation } = require('../world/world-simulation');
const { servicePosition, WORLD_DAY_MS } = require('../world/world-simulation-format');
function fixture(delta = new WorldDeltaStore()) {
  let wall = 1000, writable = true, next = 0;
  const network = new WorldTransportNetwork(delta), simulation = new WorldSimulation({ delta, network, now: () => wall, writable: () => writable, makeId: () => `service-${++next}` });
  const build = new WorldConstruction({ world: WORLD, region: { col: 0, row: 0, width: WORLD.width, height: WORLD.height }, delta,
    data: { getTile: async () => ({ terrainType: 1, height: 0 }) }, makeId: () => `entity-${++next}` });
  return { delta, network, simulation, build, setWall: value => { wall = value; }, setWritable: value => { writable = value; },
    close() { simulation.destroy(); network.destroy(); } };
}
function roads(delta, from, to, row, height = 0) {
  delta.transact(Array.from({ length: to - from + 1 }, (_, i) => ({ kind: 'roads', col: from + i, row, value: { height } })));
}
function entity(delta, id, kind, from, to, row, elevation = 0) {
  delta.transact([{ kind: 'entity', id, value: { id, kind, col: from, row, elevation, ownerChunk: f.storageId(from, row),
    cells: Array.from({ length: to - from + 1 }, (_, i) => ({ col: from + i, row })) } }]);
}
function service(s, mode, a, b) { const plan = s.simulation.planService(mode, a, b); s.simulation.confirmService(plan); return plan.service.id; }
function town(s) {
  roads(s.delta, 20, 30, 20);
  s.delta.transact([
    ...[20, 21, 22, 23].map(col => ({ kind: 'zones', col, row: 19, value: { type: 1, density: 1, height: 0 } })),
    ...[28, 29, 30].map(col => ({ kind: 'zones', col, row: 19, value: { type: 2, density: 1, height: 0 } })),
  ]);
}
test('world topology connects roads, bridge endpoints and rails across 32/64 boundaries without any render chunks', () => {
  const s = fixture(); roads(s.delta, 20, 39, 64); entity(s.delta, 'bridge', 'bridge', 40, 70, 64, 1); roads(s.delta, 71, 160, 64);
  entity(s.delta, 'rail', 'rail', 20, 200, 100);
  assert.equal(s.network.findRoute('road', { col: 20, row: 64 }, { col: 160, row: 64 }).length, 141);
  assert.equal(s.network.findRoute('rail', { col: 20, row: 100 }, { col: 200, row: 100 }).length, 181);
  assert.equal(s.network.snapshot().roadComponents, 1); assert.equal(s.network.snapshot().railComponents, 1);
  assert.equal(s.network.findRoute('road', { col: 20, row: 64 }, { col: 160, row: 64 })[44].elevation, 1);
  assert.throws(() => s.network.findRoute('road', { col: 0, row: 0 }, { col: 160, row: 64 }), /起點/); s.close();
});
test('height-separated rail/road pieces and the middle of a bridge do not create false connections', () => {
  const s = fixture(); roads(s.delta, 20, 30, 20); roads(s.delta, 31, 40, 20, 4);
  assert.equal(s.network.findRoute('road', { col: 20, row: 20 }, { col: 40, row: 20 }), null);
  entity(s.delta, 'a', 'rail', 20, 30, 50); entity(s.delta, 'b', 'rail', 31, 40, 50, 1);
  assert.equal(s.network.findRoute('rail', { col: 20, row: 50 }, { col: 40, row: 50 }), null);
  entity(s.delta, 'bridge', 'bridge', 20, 50, 80, 1); roads(s.delta, 32, 32, 79);
  assert.equal(s.network.findRoute('road', { col: 20, row: 80 }, { col: 32, row: 79 }), null); s.close();
});
test('service progress interpolates over chunk boundaries, persists, and completes legs without sprites', () => {
  const s = fixture(); roads(s.delta, 63, 67, 40); service(s, 'road', { col: 63, row: 40 }, { col: 67, row: 40 });
  s.simulation.advance(3750); const saved = s.delta.snapshot();
  assert.equal(s.simulation.positions()[0].position.col, 64.5);
  const loaded = fixture(); loaded.delta.replace(f.importWorldSave(f.exportWorldSave(saved)));
  assert.deepEqual(loaded.simulation.positions(), s.simulation.positions());
  loaded.simulation.advance(12000); assert.equal(loaded.delta.header.simulation.services[0].completedLegs, 1);
  assert.equal(loaded.delta.header.simulation.services[0].progressMs, 15750);
  assert.equal(servicePosition(loaded.delta.header.simulation.services[0]).col, 65.5); s.close(); loaded.close();
});
test('demolition blocks a service, repair resumes it, and running ticks never rebuild unchanged topology', () => {
  const s = fixture(); roads(s.delta, 20, 160, 20); service(s, 'road', { col: 20, row: 20 }, { col: 160, row: 20 });
  s.simulation.advance(400000); const completed = s.delta.header.simulation.services[0].completedLegs;
  s.delta.transact([{ kind: 'roads', col: 64, row: 20, value: null }]); s.simulation.advance(10000);
  assert.equal(s.delta.header.simulation.services[0].status, 'blocked'); assert.equal(s.simulation.positions().length, 0);
  assert.equal(s.delta.header.simulation.services[0].completedLegs, completed);
  roads(s.delta, 64, 64, 20); s.simulation.advance(0); assert.equal(s.delta.header.simulation.services[0].status, 'active');
  const rebuilds = s.network.rebuilds, aggregates = s.simulation.stats.aggregateRebuilds;
  s.simulation.setPaused(false); for (let i = 1; i <= 20; i++) { s.setWall(1000 + i * 1000); s.simulation.tick(); }
  assert.equal(s.network.rebuilds, rebuilds); assert.equal(s.simulation.stats.aggregateRebuilds, aggregates); s.close();
});
test('paused, accelerated, offline and backwards wall-clock updates preserve authoritative elapsed time', () => {
  const s = fixture(); s.simulation.tick(); assert.equal(s.delta.header.simulation, undefined, 'loading an old save does not start its economy');
  s.simulation.setPaused(false); s.setWall(2000); s.simulation.tick(); assert.equal(s.delta.header.simulation.elapsedMs, 1000);
  s.simulation.setSpeed(4); s.setWall(3000); s.simulation.tick(); assert.equal(s.delta.header.simulation.elapsedMs, 5000);
  s.simulation.setPaused(true); s.setWall(100000); s.simulation.tick(); assert.equal(s.delta.header.simulation.elapsedMs, 5000);
  s.simulation.setPaused(false); s.setWall(101000); s.simulation.tick(); assert.equal(s.delta.header.simulation.elapsedMs, 9000);
  const loaded = fixture(); loaded.delta.replace(s.delta.snapshot()); loaded.setWall(161000); loaded.simulation.tick(); assert.equal(loaded.delta.header.simulation.elapsedMs, 249000);
  loaded.setWall(160000); loaded.simulation.tick(); loaded.setWall(162000); loaded.simulation.tick(); assert.equal(loaded.delta.header.simulation.elapsedMs, 253000);
  loaded.setWall(160000); loaded.simulation.setSpeed(16); loaded.setWall(163000); loaded.simulation.tick(); assert.equal(loaded.delta.header.simulation.elapsedMs, 269000);
  const before = loaded.delta.snapshot(); loaded.setWritable(false); loaded.setWall(200000); loaded.simulation.tick(); assert.deepEqual(loaded.delta.snapshot(), before);
  assert.throws(() => loaded.simulation.advance(60000), /另一個遊戲分頁/); s.close(); loaded.close();
});
test('employment and residential growth use the entire connected road component across storage regions', () => {
  const s = fixture(); roads(s.delta, 60, 160, 64);
  s.delta.transact([...Array.from({ length: 8 }, (_, i) => ({ kind: 'zones', col: 60 + i, row: 63, value: { type: 1, density: 1 } })),
    ...[158, 159, 160].map(col => ({ kind: 'zones', col, row: 63, value: { type: 2, density: 3 } }))]);
  s.simulation.advance(10 * WORLD_DAY_MS); assert.equal(s.simulation.snapshot().population, 64);
  s.delta.transact([{ kind: 'roads', col: 100, row: 64, value: null }]); s.simulation.advance(20 * WORLD_DAY_MS);
  assert.equal(s.simulation.snapshot().population, 0); assert.equal(s.simulation.snapshot().jobs, 54); s.close();
});
test('long offline aggregation matches daily settlement exactly, including depleted funds and rounding', () => {
  const fast = fixture(), daily = fixture(); town(fast); town(daily); fast.delta.header.city.budget = daily.delta.header.city.budget = 0;
  fast.simulation.advance(1000 * WORLD_DAY_MS); for (let i = 0; i < 1000; i++) daily.simulation.advance(WORLD_DAY_MS);
  assert.equal(fast.delta.header.city.budget, daily.delta.header.city.budget);
  assert.deepEqual(fast.delta.header.simulation, daily.delta.header.simulation);
  assert(fast.simulation.stats.dailyPasses < 30); assert(fast.simulation.stats.batchedDays > 900); assert(fast.delta.header.simulation.ledger.unpaid > 0);
  fast.close(); daily.close();
});
test('simulation-only updates retain construction drafts and do not dirty or remount world chunks', async () => {
  const s = fixture(); const plan = await s.build.plan('market2', { col: 63, row: 63 });
  s.delta.acknowledge(s.delta.checkpoint(true)); const dataRevision = s.delta.constructionRevision;
  s.simulation.advance(1000); assert.equal(s.delta.constructionRevision, dataRevision); assert.equal(s.delta.dirtyChunks.size, 0);
  s.build.confirm(plan); assert.equal(s.delta.entities.size, 1); assert(s.delta.dirtyChunks.size > 0); s.close();
});
test('simulation header and treasury commit atomically, roll back, and preserve changes made during saving', async () => {
  const s = fixture(), db = new DatabaseSync(':memory:'), repo = createWorldSqliteStore(db); town(s); s.simulation.advance(WORLD_DAY_MS);
  const cp = s.delta.checkpoint(true); repo.commitWorldSave('test', { expectedRevision: 0, checkpoint: cp }); s.delta.acknowledge(cp);
  const before = repo.getWorldSave('test'); s.simulation.advance(WORLD_DAY_MS);
  db.exec("CREATE TRIGGER fail_sim BEFORE UPDATE ON world_saves BEGIN SELECT RAISE(ABORT,'failed simulation write'); END");
  assert.throws(() => repo.commitWorldSave('test', { expectedRevision: 1, checkpoint: s.delta.checkpoint() }), /failed simulation write/);
  assert.deepEqual(repo.getWorldSave('test'), before); assert(s.delta.dirty); db.exec('DROP TRIGGER fail_sim');
  const pending = s.delta.checkpoint(); s.simulation.advance(WORLD_DAY_MS); s.delta.acknowledge(pending); assert(s.delta.dirty);
  repo.commitWorldSave('test', { expectedRevision: 1, checkpoint: s.delta.checkpoint() });
  assert.equal(repo.getWorldSave('test').snapshot.simulation.elapsedMs, 3 * WORLD_DAY_MS);
  assert.deepEqual(repo.restoreWorldBackup('test', { expectedRevision: 2 }).snapshot.simulation, before.snapshot.simulation); db.close(); s.close();
});
test('malformed simulation clocks, versions, regions and service paths are rejected before replacing a world', () => {
  const s = fixture(); roads(s.delta, 63, 67, 40); service(s, 'road', { col: 63, row: 40 }, { col: 67, row: 40 }); const snapshot = s.delta.snapshot();
  for (const edit of [v => { v.simulation.version = 2; }, v => { v.simulation.elapsedMs = Infinity; }, v => { v.simulation.speed = 100; },
    v => { v.simulation.regions = [{ chunkId: 's:50:0', population: 1 }]; }, v => { v.simulation.regions = [null]; },
    v => { v.simulation.regions = [{ chunkId: 's:00:0', population: 1 }]; }, v => { v.simulation.services[0].path[2].col += 20; },
    v => { v.simulation.services[0].progressMs = 999999; }, v => { v.simulation.ledger.income = -1; }]) {
    const bad = f.clone(snapshot); edit(bad); assert.throws(() => s.delta.replace(bad)); assert.deepEqual(s.delta.snapshot(), snapshot);
  }
  s.close();
});
test('continuous simulation ticks cannot indefinitely postpone the periodic save', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); const s = fixture(); let saved = 0;
  const session = new WorldSaveSession({ delta: s.delta, storage: { worldRequest: async () => { saved++; return { ok: true, json: async () => ({ storageRevision: saved }) }; } } });
  s.simulation.setPaused(false);
  for (let i = 1; i <= 15; i++) { s.setWall(1000 + i * 1000); s.simulation.tick(); t.mock.timers.tick(1000); }
  await new Promise(resolve => setImmediate(resolve)); assert.equal(saved, 1); assert.equal(s.delta.dirty, false);
  session.destroy(); s.close();
});

test('import returns the loaded snapshot so the UI can restore the view and remember the new slot', async () => {
  const s = fixture(); town(s); s.simulation.advance(WORLD_DAY_MS); const source = f.exportWorldSave(s.delta.snapshot());
  const target = new WorldDeltaStore(), session = new WorldSaveSession({ delta: target, storage: { worldRequest: async () => ({ ok: true, json: async () => ({ storageRevision: 1 }) }) } });
  const imported = await session.importBackup(source, 'imported-world');
  assert.deepEqual(imported.snapshot, s.delta.snapshot()); assert.equal(session.id, 'imported-world'); assert.equal(target.dirty, false); session.destroy(); s.close();
});

test('component identity and residential road access are stable after reloading sorted chunks', () => {
  const s = fixture(); roads(s.delta, 150, 160, 20); roads(s.delta, 20, 30, 20); roads(s.delta, 35, 40, 70);
  const first = s.network.componentAt('road', { col: 150, row: 20 });
  const loaded = fixture(); loaded.delta.replace(s.delta.snapshot()); assert.equal(loaded.network.componentAt('road', { col: 150, row: 20 }), first);
  const rebuilds = s.network.rebuilds; s.delta.transact([{ kind: 'zones', col: 20, row: 19, value: { type: 1, density: 1 } }]); s.network.ensure();
  assert.equal(s.network.rebuilds, rebuilds, 'zoning does not rebuild an unchanged road graph'); s.close(); loaded.close();
});
