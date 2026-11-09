const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { IDBFactory } = require('fake-indexeddb');
const { webcrypto } = require('node:crypto');
function storage(factory = new IDBFactory()) {
  const context = vm.createContext({ HEUNG_SHING_CONFIG: { platform: 'web' }, indexedDB: factory,
    crypto: webcrypto, console, structuredClone, navigator: {},
    setInterval: (...args) => { const timer = setInterval(...args); timer.unref(); return timer; }, clearInterval });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../game-storage.js'), 'utf8'), context);
  return context.HeungShingStorage;
}
const payload = name => ({ city_name: name, population: 100, year: 1997, month: 7, budget: 10000,
  save_data: { version: 15, city: { name }, mapData: { runs: [1, 65536] } } });
test('browser storage persists cities across instances and separates metadata from payloads', async () => {
  const factory = new IDBFactory(), store = storage(factory);
  const saved = await store.write(payload('香城'));
  const rows = await store.list();
  assert.equal(rows.length, 1); assert.equal(rows[0].save_data, undefined);
  const second = storage(factory);
  assert.equal((await second.get(saved.id)).save_data.city.name, '香城');
  assert.equal(second.writable, false, 'another tab cannot overwrite the active writer');
  await assert.rejects(second.write(payload('wrong'), saved.id), /Another game tab/);
  assert.equal((await store.get(saved.id)).city_name, '香城');
});
test('autosaves never overwrite manual slots; deletion and new same-name imports stay distinct', async () => {
  const store = storage();
  const one = await store.write(payload('same'));
  const two = await store.write(payload('same'));
  await store.write(payload('auto'), undefined, true);
  await store.write(payload('next auto'), undefined, true);
  assert.equal((await store.list()).length, 3);
  assert.equal((await store.get(one.id)).city_name, 'same');
  await store.remove(one.id);
  await assert.rejects(store.get(one.id), /not found/);
  assert.equal((await store.get(two.id)).city_name, 'same');
});
test('terrain maps use IndexedDB and storage errors are not silently changed to success', async () => {
  const store = storage();
  const row = await store.write({ name: 'map', terrain_data: { mapData: [[1]] } }, undefined, false, 'terrains');
  assert.deepEqual(JSON.parse(JSON.stringify((await store.get(row.id, 'terrains')).terrain_data)), { mapData: [[1]] });
  const result = await store.request('/api/saves', { method: 'POST', body: '{}' });
  assert.equal(result.ok, false);
  assert.equal((await store.list()).length, 0);
});
test('IndexedDB schema is stable and data-version replacement preserves the original backup', async () => {
  const factory = new IDBFactory(), store = storage(factory);
  const old = payload('old'); old.save_data.version = 14;
  const row = await store.write(old);
  await store.write(payload('upgraded'), row.id);
  const db = await new Promise((resolve, reject) => {
    const request = factory.open('heung-shing-game', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const backup = await new Promise(resolve => {
    const request = db.transaction('migrationBackups').objectStore('migrationBackups').get(`saves:${row.id}`);
    request.onsuccess = () => resolve(request.result);
  });
  assert.equal(backup.data.version, 14); assert.equal(backup.metadata.city_name, 'old'); db.close();
});
