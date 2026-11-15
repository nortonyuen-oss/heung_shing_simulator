const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const { createWorldUrl, parseWorldLaunch } = require('../world/world-entry');
const { sha256Fallback } = require('../world/world-crypto');
test('world launch preserves encoded city name, chosen year and stable save identity', () => {
  const url = new URL(createWorldUrl({ name: '海港 & 世界 <新>', startYear: 1900, id: 'world-test' }, 'https://example.test/'));
  assert.equal(url.pathname, '/world/index.html'); assert.deepEqual(parseWorldLaunch(url.search), { slot: 'world-test', fresh: true, name: '海港 & 世界 <新>', startYear: 1900 });
  assert.equal(parseWorldLaunch('?slot=world-trial-v1').fresh, false); assert.equal(parseWorldLaunch('?year=-1', 2026).startYear, 2026);
  assert.throws(() => parseWorldLaunch('?slot=../../saves')); assert.throws(() => createWorldUrl({ id: '../x' }, 'https://example.test/'));
});
test('LAN SHA-256 handles padding boundaries and a full terrain pack, matching native crypto', () => {
  for (const size of [0, 1, 55, 56, 63, 64, 65, 196608]) { const bytes = crypto.randomBytes(size); assert.equal(sha256Fallback(bytes), crypto.createHash('sha256').update(bytes).digest('hex')); }
});
test('LAN IDs remain valid random UUIDs when secure-context randomUUID is unavailable', () => {
  const context = vm.createContext({ crypto: { getRandomValues: buffer => crypto.webcrypto.getRandomValues(buffer) } });
  vm.runInContext(fs.readFileSync(require.resolve('../world/world-crypto'), 'utf8'), context);
  const ids = Array.from({ length: 100 }, () => context.HeungShingWorld.worldUuid()); assert.equal(new Set(ids).size, 100);
  ids.forEach(id => assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/));
});
test('stress workload is a complete portable world within the existing file limit', () => {
  const { makeWorldWorkload } = require('../scripts/world-phase5-workload'); const snapshot = makeWorldWorkload();
  assert.equal(snapshot.simulation.services.length, 64); assert(snapshot.entities.length > 1500); assert.equal(snapshot.chunks.reduce((n, c) => n + c.roads.length, 0), 48000);
});
test('metadata-only saves do not serialize unrelated world chunks', () => {
  const { WorldDeltaStore } = require('../world/world-delta-store'); const { emptyWorldSimulation } = require('../world/world-simulation-format');
  const delta = new WorldDeltaStore(); delta.transact([{ kind: 'roads', col: 64, row: 64, value: {} }]); delta.acknowledge(delta.checkpoint(true));
  let serialized = 0; const original = delta.serializeChunk.bind(delta); delta.serializeChunk = value => { serialized++; return original(value); };
  delta.commitSimulation(emptyWorldSimulation(), delta.header.city.budget); assert.equal(delta.checkpoint().chunks.length, 0); assert.equal(serialized, 0);
  delta.transact([{ kind: 'roads', col: 128, row: 128, value: {} }]); serialized = 0; assert.equal(delta.checkpoint().chunks.length, 1); assert.equal(serialized, 1);
});
test('same-tab navigation and bfcache handoff keep one fallback writer while copied tabs stay read-only', async () => {
  const { IDBFactory } = require('fake-indexeddb'), { WorldSaveFormat } = require('../world/world-save-format'), factory = new IDBFactory();
  const session = new Map();
  function instance(values) {
    const events = {}, context = vm.createContext({ HEUNG_SHING_CONFIG: { platform: 'web' }, indexedDB: factory, crypto: crypto.webcrypto, HeungShingWorld: { WorldSaveFormat }, navigator: {}, structuredClone,
      sessionStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
      addEventListener: (name, fn) => { (events[name] ||= []).push(fn); },
      setInterval: (...args) => { const timer = setInterval(...args); timer.unref(); return timer; }, clearInterval, console });
    vm.runInContext(fs.readFileSync(require.resolve('../game-storage'), 'utf8'), context); return { storage: context.HeungShingStorage, events };
  }
  const first = instance(session); await first.storage.initialize(); assert(first.storage.writable);
  const other = instance(new Map(session)); await other.storage.initialize(); assert.equal(other.storage.writable, false);
  first.events.pagehide.forEach(fn => fn()); const next = instance(session); await next.storage.initialize(); assert(next.storage.writable);
  const copied = instance(new Map(session)); await copied.storage.initialize(); assert.equal(copied.storage.writable, false);
  next.events.pagehide.forEach(fn => fn()); first.events.pageshow.forEach(fn => fn({ persisted: true })); await first.storage.initialize(); assert(first.storage.writable);
  await first.storage.releaseForNavigation(); await other.storage.releaseForNavigation(); await copied.storage.releaseForNavigation();
});
