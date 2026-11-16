const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const { IDBFactory, IDBObjectStore } = require('fake-indexeddb');
const { webcrypto } = require('node:crypto');
const { WORLD } = require('../world/world-config');
const { WorldSaveFormat: f } = require('../world/world-save-format');
const { WorldDeltaStore } = require('../world/world-delta-store');
const { WorldConstruction } = require('../world/world-construction');
const { WorldSaveSession } = require('../world/world-save-session');
const { WorldDataAccess } = require('../world/world-data-access');
const { createWorldSqliteStore } = require('../world/world-sqlite-store');
const region = { col: 0, row: 0, width: 256, height: 256 };
function fixture(sample = () => ({ terrainType: 1, height: 0 })) {
  const delta = new WorldDeltaStore(); let next = 0;
  const data = { async getTile(col, row) { return delta.terrainAt(col, row) || sample(col, row); } };
  return { delta, data, build: new WorldConstruction({ world: WORLD, region, data, delta, makeId: () => `entity-${++next}` }) };
}
function browserStorage(factory = new IDBFactory()) {
  const context = vm.createContext({ HEUNG_SHING_CONFIG: { platform: 'web' }, indexedDB: factory, crypto: webcrypto,
    HeungShingWorld: { WorldSaveFormat: f }, console, structuredClone, navigator: {},
    setInterval: (...args) => { const timer = setInterval(...args); timer.unref(); return timer; }, clearInterval });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../game-storage.js'), 'utf8'), context);
  return context.HeungShingStorage;
}
const plain = value => JSON.parse(JSON.stringify(value));
async function commitBuilding(subject, tool = 'park4', col = 63, row = 63) { const plan = await subject.build.plan(tool, { col, row }); subject.build.confirm(plan); return plan; }

test('cross-32/64 buildings have one authority and every affected storage reference; demolition is atomic', async () => {
  const subject = fixture(), plan = await commitBuilding(subject);
  assert.equal(subject.delta.entities.size, 1); assert.equal(subject.delta.dirtyChunks.size, 4);
  const snapshot = subject.delta.snapshot(); f.validateWorldSnapshot(snapshot);
  assert(snapshot.chunks.every(chunk => chunk.entityIds.length === 1 && chunk.entityIds[0] === plan.entityId));
  assert.equal(subject.delta.entityAt(66, 66).id, plan.entityId);
  assert.equal(subject.delta.entitiesForChunks(['r:1:1', 'r:2:2']).length, 1);
  subject.build.confirm(await subject.build.plan('bulldoze', { col: 65, row: 65 }));
  assert.equal(subject.delta.entities.size, 0); assert.equal(subject.delta.occupancy.size, 0);
  assert(subject.delta.snapshot().chunks.every(chunk => chunk.entityIds.length === 0));
});

test('invalid overlaps and stale drafts cannot partially mutate a world or spend money', async () => {
  const subject = fixture(); await commitBuilding(subject, 'market2');
  const before = subject.delta.snapshot();
  assert.throws(() => subject.delta.transact([{ kind: 'roads', col: 64, row: 64, value: {} }], { cost: 10 }), /overlaps/);
  assert.deepEqual(subject.delta.snapshot(), before);
  const plan = await subject.build.plan('road', { col: 20, row: 20 }, { col: 80, row: 20 });
  subject.build.confirm(await subject.build.plan('zoneR', { col: 10, row: 10 }));
  assert.throws(() => subject.build.confirm(plan), /新修改/);
  assert.equal(subject.delta.roadAt(20, 20), undefined);
});

test('long roads, bridges and rail spans retain complete world topology across chunks', async () => {
  const subject = fixture((col, row) => ({ terrainType: row === 130 && col >= 40 && col <= 70 ? 5 : 1, height: 0 }));
  subject.build.confirm(await subject.build.plan('road', { col: 20, row: 20 }, { col: 100, row: 20 }));
  const bridge = await subject.build.plan('bridge', { col: 20, row: 130 }, { col: 95, row: 130 }); subject.build.confirm(bridge);
  const rail = await subject.build.plan('rail', { col: 10, row: 180 }, { col: 180, row: 180 }); subject.build.confirm(rail);
  const loaded = new WorldDeltaStore(); loaded.replace(f.importWorldSave(f.exportWorldSave(subject.delta.snapshot())));
  assert.equal(loaded.entities.get(bridge.entityId).cells.length, 76);
  assert.equal(loaded.entities.get(rail.entityId).cells.length, 171);
  assert.equal(loaded.roadAt(100, 20).col, 100);
  assert.equal(f.entityStorageIds(loaded.entities.get(rail.entityId)).size, 3);
  assert.equal(loaded.entitiesForChunks(['r:0:5', 'r:5:5']).filter(entity => entity.id === rail.entityId).length, 1);
});

test('terrain edits remain independent of base data and propagate slopes across storage boundaries', async () => {
  const subject = fixture((col, row) => ({ terrainType: col >= 62 && col <= 68 && row >= 62 && row <= 68 ? 6 : 1,
    height: Math.max(0, 4 - Math.max(Math.abs(col - 65), Math.abs(row - 65))) }));
  // Use a naturally smooth hill fixture, including its full extent.
  subject.data.getTile = async (col, row) => subject.delta.terrainAt(col, row) || (() => { const height = Math.max(0, 4 - Math.max(Math.abs(col - 65), Math.abs(row - 65))); return { terrainType: height ? 6 : 1, height }; })();
  const plan = await subject.build.plan('flatten4', { col: 63, row: 63 }); subject.build.confirm(plan);
  assert(subject.delta.dirtyChunks.size >= 4);
  for (const chunk of subject.delta.chunks.values()) for (const tile of chunk.terrain.values()) {
    for (const [dc, dr] of [[1, 0], [0, 1]]) {
      const neighbor = await subject.data.getTile(tile.col + dc, tile.row + dr);
      assert(Math.abs(tile.height - neighbor.height) <= 1);
    }
  }
});

test('saving an older immutable checkpoint does not clear edits made while the write is pending', async () => {
  const subject = fixture(); await commitBuilding(subject, 'market2');
  let resolve;
  const storage = { worldRequest: async () => new Promise(done => { resolve = done; }) };
  const session = new WorldSaveSession({ delta: subject.delta, storage, autosaveMs: 100000 });
  const saving = session.flush(); await new Promise(done => setImmediate(done));
  subject.build.confirm(await subject.build.plan('road', { col: 65, row: 68 }));
  resolve({ ok: true, json: async () => ({ storageRevision: 1 }) }); await saving;
  assert.equal(subject.delta.dirty, true); assert(subject.delta.dirtyChunks.has('s:1:1'));
  assert.equal(subject.delta.dirtyChunks.has('s:0:0'), false);
  session.destroy();
});

test('SQLite transaction rolls back every affected chunk and revision after an entity write fails', async () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON'); const repo = createWorldSqliteStore(db), subject = fixture();
  await commitBuilding(subject, 'market2'); const first = subject.delta.checkpoint(true);
  repo.commitWorldSave('test', { expectedRevision: 0, checkpoint: first }); subject.delta.acknowledge(first);
  const before = repo.getWorldSave('test'); await commitBuilding(subject, 'park4', 127, 127);
  db.exec("CREATE TRIGGER reject_world BEFORE INSERT ON world_entities BEGIN SELECT RAISE(ABORT,'write failed'); END");
  assert.throws(() => repo.commitWorldSave('test', { expectedRevision: 1, checkpoint: subject.delta.checkpoint() }), /write failed/);
  assert.deepEqual(repo.getWorldSave('test'), before); assert.equal(subject.delta.dirtyChunks.size, 4);
  db.exec('DROP TRIGGER reject_world'); repo.commitWorldSave('test', { expectedRevision: 1, checkpoint: subject.delta.checkpoint() });
  assert.equal(repo.getWorldSave('test').snapshot.entities.length, 2);
  const restored = repo.restoreWorldBackup('test', { expectedRevision: 2 });
  assert.equal(restored.snapshot.entities.length, 1); assert.equal(repo.getWorldBackup('test').entities.length, 2);
  assert.throws(() => repo.commitWorldSave('test', { expectedRevision: 1, checkpoint: subject.delta.checkpoint() }), /另一個視窗/);
  db.close();
});

test('IndexedDB persists all off-screen chunks, supports rollback and preserves a single writer', async () => {
  const factory = new IDBFactory(), storage = browserStorage(factory), subject = fixture(); await storage.initialize();
  const session = new WorldSaveSession({ delta: subject.delta, storage, id: 'browser-test', autosaveMs: 100000 });
  await commitBuilding(subject, 'park4'); await session.flush();
  await commitBuilding(subject, 'market2', 127, 127); await session.flush();
  const second = browserStorage(factory); await second.initialize();
  const loaded = await (await second.worldRequest('/api/world-saves/browser-test')).json();
  assert.equal(loaded.snapshot.entities.length, 2); assert.equal(loaded.snapshot.chunks.length, 7);
  assert.equal(second.writable, false);
  const rejected = await second.worldRequest('/api/world-saves/browser-test', { method: 'PUT', body: JSON.stringify({ expectedRevision: 2, checkpoint: subject.delta.checkpoint() }) });
  assert.equal(rejected.ok, false);
  await session.restoreBackup(); assert.equal(subject.delta.entities.size, 1);
  assert.equal((await (await storage.worldRequest('/api/world-saves/browser-test/backup')).json()).entities.length, 2);
  session.destroy();
});

test('IndexedDB quota failure aborts the entire multi-chunk transaction and retains dirty data for export', async () => {
  const storage = browserStorage(), subject = fixture(); await storage.initialize();
  const session = new WorldSaveSession({ delta: subject.delta, storage, id: 'quota-test', autosaveMs: 100000 });
  await commitBuilding(subject, 'market2'); await session.flush();
  const before = await (await storage.worldRequest('/api/world-saves/quota-test')).json();
  await commitBuilding(subject, 'park4', 127, 127);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) { if (this.name === 'worldEntities') throw new DOMException('quota full', 'QuotaExceededError'); return put.apply(this, args); };
  try { await assert.rejects(session.flush(), /quota full/); }
  finally { IDBObjectStore.prototype.put = put; }
  const after = await (await storage.worldRequest('/api/world-saves/quota-test')).json();
  assert.deepEqual(plain(after), plain(before)); assert.equal(subject.delta.dirty, true);
  assert.equal(f.importWorldSave(session.exportBackup()).entities.length, 2);
  await session.flush(); assert.equal(subject.delta.dirty, false); session.destroy();
});

test('unsupported, corrupt, incomplete and legacy backups fail before replacing current world data', async () => {
  const subject = fixture(); await commitBuilding(subject); const snapshot = subject.delta.snapshot();
  const text = f.exportWorldSave(snapshot), imported = f.importWorldSave(text);
  assert.deepEqual(imported, snapshot);
  const corrupt = plain(snapshot); corrupt.chunks[0].entityIds = [];
  assert.throws(() => subject.delta.replace(corrupt), /Incomplete/); assert.equal(subject.delta.entities.size, 1);
  const wrong = plain(snapshot); wrong.baseTerrainVersion = 'other'; assert.throws(() => f.validateWorldSnapshot(wrong), /identity mismatch/);
  assert.throws(() => f.importWorldSave('{"format":"heung-shing-city-save"}'), /城市主選單/);
  assert.throws(() => f.importWorldSave('{"__proto__":{}}'), /property/);
});

test('IndexedDB v1 cities survive the additive v2 world-store upgrade unchanged', async () => {
  const factory = new IDBFactory();
  const db = await new Promise((resolve, reject) => {
    const request = factory.open('heung-shing-game', 1);
    request.onupgradeneeded = () => {
      for (const name of ['saves', 'payloads', 'terrains', 'terrainPayloads', 'migrationBackups', 'settings']) request.result.createObjectStore(name,
        ['saves', 'terrains'].includes(name) ? { keyPath: 'id', autoIncrement: true } : undefined);
    };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['saves', 'payloads'], 'readwrite');
    tx.objectStore('saves').put({ id: 17, city_name: '原有城市', revision: 1, version: 14 });
    tx.objectStore('payloads').put({ version: 14, city: { name: '原有城市' }, mapData: [[1, 5]] }, 17);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  db.close();
  const upgraded = browserStorage(factory); await upgraded.initialize();
  assert.deepEqual(plain((await upgraded.get(17)).save_data), { version: 14, city: { name: '原有城市' }, mapData: [[1, 5]] });
  const worlds = await upgraded.worldRequest('/api/world-saves'); assert.deepEqual(plain(await worlds.json()), []);
});

test('terrain overlay never mutates cached base bytes and reverting an edit removes the delta', async () => {
  const bytes = new Uint8Array(64 * 64 * 3); for (let i = 0; i < bytes.length; i += 3) { bytes[i] = 2; bytes[i + 1] = 1; }
  const original = bytes.slice(), delta = new WorldDeltaStore();
  const base = { world: WORLD, manifest: { chunks: new Proxy({}, { get: () => ({ width: 64 }) }) }, getStorageChunk: async () => bytes,
    getRenderChunk: async id => ({ id, bounds: { col: 32, row: 32, width: 32, height: 32 }, sample: () => ({ terrainType: 1, height: 0 }) }) };
  const data = new WorldDataAccess(base, delta), build = new WorldConstruction({ world: WORLD, region, data, delta });
  build.confirm(await build.plan('raise', { col: 63, row: 63 }));
  assert.equal((await data.getTile(63, 63)).height, 1); assert.equal((await data.getBaseTile(63, 63)).height, 0);
  assert.equal((await data.getRenderChunk('r:1:1')).sample(63, 63).height, 1);
  build.confirm(await build.plan('lower', { col: 63, row: 63 }));
  assert.equal(delta.terrainAt(63, 63), undefined); assert.equal((await data.getTile(63, 63)).height, 0);
  assert.deepEqual(bytes, original);
});

test('exported snapshots cannot mutate authoritative chunk data', async () => {
  const subject = fixture(); subject.build.confirm(await subject.build.plan('road', { col: 63, row: 63 }));
  const snapshot = subject.delta.snapshot(); snapshot.chunks[0].roads[0].height = 8;
  assert.equal(subject.delta.roadAt(63, 63).height, 0);
});
