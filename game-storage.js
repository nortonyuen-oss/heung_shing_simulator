// The renderer's storage boundary. A web build never sends cities to a server.
(function (root) {
  'use strict';
  const isWeb = () => root.HEUNG_SHING_CONFIG?.platform === 'web';
  const DB_NAME = 'heung-shing-game';
  const stores = ['saves', 'payloads', 'terrains', 'terrainPayloads', 'migrationBackups', 'settings'];
  const revisions = new Map();
  let db, opening, writable = false, memoryOnly = false, leaseTimer, unlock;
  const owner = root.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const memory = Object.fromEntries(stores.map(name => [name, new Map()]));
  let memoryId = 0;
  function req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function transaction(names, mode, operation) {
    if (memoryOnly) {
      const access = name => ({
        get: key => Promise.resolve(structuredClone(memory[name].get(key))),
        getAll: () => Promise.resolve(structuredClone([...memory[name].values()])),
        put: (value, key) => {
          const id = key ?? value.id ?? ++memoryId;
          memory[name].set(id, structuredClone(['saves', 'terrains'].includes(name) ? { ...value, id } : value));
          return Promise.resolve(id);
        },
        delete: key => { memory[name].delete(key); return Promise.resolve(); },
      });
      return operation(access);
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode);
      let value, failure;
      const access = name => ({
        get: key => req(tx.objectStore(name).get(key)),
        getAll: () => req(tx.objectStore(name).getAll()),
        put: (data, key) => req(key === undefined
          ? tx.objectStore(name).put(data) : tx.objectStore(name).put(data, key)),
        delete: key => req(tx.objectStore(name).delete(key)),
      });
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(failure || tx.error);
      tx.onabort = () => reject(failure || tx.error || new Error('Storage transaction aborted'));
      Promise.resolve(operation(access)).then(result => { value = result; }, error => {
        failure = error;
        try { tx.abort(); } catch { reject(error); }
      });
    });
  }
  async function acquireLease() {
    const now = Date.now();
    writable = await transaction(['settings'], 'readwrite', async access => {
      const store = access('settings');
      const lease = await store.get('writer');
      if (lease && lease.owner !== owner && lease.expires > now) return false;
      await store.put({ owner, expires: now + 30000 }, 'writer');
      return true;
    });
    return writable;
  }
  async function initialize() {
    if (!isWeb()) return;
    if (opening) return opening;
    opening = (async () => {
      try {
        db = await new Promise((resolve, reject) => {
          const request = root.indexedDB.open(DB_NAME, 1);
          request.onupgradeneeded = () => {
            for (const name of stores) {
              if (!request.result.objectStoreNames.contains(name)) {
                request.result.createObjectStore(name,
                  ['saves', 'terrains'].includes(name) ? { keyPath: 'id', autoIncrement: true } : undefined);
              }
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error('Storage upgrade blocked by another tab'));
        });
        db.onversionchange = () => { writable = false; db.close(); };
      } catch (error) {
        memoryOnly = true;
        writable = true;
        console.warn('[Storage] Memory-only session; download a backup.', error.message);
        return;
      }
      if (root.navigator?.locks?.request) {
        await new Promise(resolve => {
          root.navigator.locks.request('heung-shing-game-writer', { ifAvailable: true }, async lock => {
            writable = !!lock;
            resolve();
            if (lock) await new Promise(release => { unlock = release; });
          }).catch(() => { writable = false; resolve(); });
        });
      } else {
        await acquireLease();
        leaseTimer = root.setInterval(() => acquireLease().catch(() => { writable = false; }), 10000);
      }
      root.addEventListener?.('pagehide', () => {
        unlock?.();
        root.clearInterval(leaseTimer);
        writable = false;
        if (!root.navigator?.locks?.request) transaction(['settings'], 'readwrite', async access => {
          const lease = await access('settings').get('writer');
          if (lease?.owner === owner) await access('settings').delete('writer');
        }).catch(() => {});
      }, { once: true });
    })();
    return opening;
  }
  function assertWriter() {
    if (!writable) throw Object.assign(new Error('Another game tab has write access. Close it and reload this tab.'), { status: 409 });
  }
  async function verifyLease(access) {
    assertWriter();
    if (!memoryOnly && !root.navigator?.locks?.request) {
      const lease = await access('settings').get('writer');
      if (lease?.owner !== owner || lease.expires <= Date.now()) {
        writable = false;
        assertWriter();
      }
    }
  }
  function metadata(payload, type, old) {
    const now = new Date().toISOString();
    return { ...(old || {}), city_name: String(payload.city_name || 'My City').slice(0, 60),
      population: Number(payload.population) || 0, year: Number(payload.year) || 1900,
      month: Number(payload.month) || 1, budget: Number(payload.budget) || 0,
      save_type: type, version: payload.save_data.version,
      created_at: old?.created_at || now, updated_at: now, revision: (old?.revision || 0) + 1 };
  }
  async function list(kind = 'saves') {
    await initialize();
    return transaction([kind], 'readonly', async access => {
      const rows = await access(kind).getAll();
      rows.forEach(row => revisions.set(`${kind}:${row.id}`, row.revision));
      return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    });
  }
  async function get(id, kind = 'saves') {
    await initialize();
    const payloadStore = kind === 'saves' ? 'payloads' : 'terrainPayloads';
    return transaction([kind, payloadStore], 'readonly', async access => {
      const row = await access(kind).get(id);
      if (!row) throw Object.assign(new Error('Save not found'), { status: 404 });
      revisions.set(`${kind}:${id}`, row.revision);
      return { ...row, [kind === 'saves' ? 'save_data' : 'terrain_data']: await access(payloadStore).get(id) };
    });
  }
  async function write(payload, id, autosave = false, kind = 'saves') {
    await initialize();
    assertWriter();
    const payloadStore = kind === 'saves' ? 'payloads' : 'terrainPayloads';
    const data = payload[kind === 'saves' ? 'save_data' : 'terrain_data'];
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid save payload');
    const result = await transaction([kind, payloadStore, 'migrationBackups', 'settings'], 'readwrite', async access => {
      await verifyLease(access);
      const store = access(kind);
      if (autosave) id = (await store.getAll()).find(row => row.save_type === 'autosave')?.id;
      const old = id ? await store.get(id) : null;
      if (id && !old) throw Object.assign(new Error('Save not found'), { status: 404 });
      if (old && !autosave && revisions.has(`${kind}:${id}`)
        && old.revision !== revisions.get(`${kind}:${id}`)) {
        throw Object.assign(new Error('Save changed; reload before overwriting.'), { status: 409 });
      }
      if (old && old.version !== undefined && old.version !== data.version) {
        const key = `${kind}:${id}`;
        if (!await access('migrationBackups').get(key)) {
          await access('migrationBackups').put({ metadata: old, data: await access(payloadStore).get(id) }, key);
        }
      }
      const row = kind === 'saves' ? metadata(payload, autosave ? 'autosave' : 'manual', old) : {
        ...(old || {}), name: String(payload.name || 'My Map').slice(0, 60),
        profile_type: payload.profile_type || 'custom', seed: String(payload.seed || ''),
        created_at: old?.created_at || new Date().toISOString(), updated_at: new Date().toISOString(),
        revision: (old?.revision || 0) + 1,
      };
      if (kind === 'saves' && old && old.version !== undefined && old.version !== data.version) row.has_backup = true;
      if (id) row.id = id;
      const nextId = await store.put(row);
      await access(payloadStore).put(data, nextId);
      return { ...row, id: nextId };
    });
    revisions.set(`${kind}:${result.id}`, result.revision);
    if (!memoryOnly && !autosave) root.navigator?.storage?.persist?.().catch(() => {});
    return result;
  }
  async function remove(id, kind = 'saves') {
    await initialize();
    assertWriter();
    const payloadStore = kind === 'saves' ? 'payloads' : 'terrainPayloads';
    await transaction([kind, payloadStore, 'settings'], 'readwrite', async access => {
      await verifyLease(access);
      await access(kind).delete(id);
      await access(payloadStore).delete(id);
    });
    revisions.delete(`${kind}:${id}`);
  }
  async function request(url, options = {}) {
    if (!isWeb()) return root.fetch(url, options);
    const match = String(url).match(/^\/api\/(saves|terrains)(?:\/(autosave|\d+))?(\/backup)?$/);
    if (!match) throw new Error('Unsupported storage operation');
    const [, kind, key, backup] = match;
    const method = options.method || 'GET';
    try {
      let value;
      if (method === 'GET' && backup) {
        await initialize();
        const original = await transaction(['migrationBackups'], 'readonly', access => access('migrationBackups').get(`${kind}:${key}`));
        if (!original) throw Object.assign(new Error('No original backup'), { status: 404 });
        value = { ...original.metadata, save_data: original.data };
      } else if (method === 'GET') value = key ? await get(Number(key), kind) : await list(kind);
      else if (method === 'DELETE') { await remove(Number(key), kind); value = { ok: true }; }
      else value = await write(JSON.parse(options.body), key === 'autosave' ? undefined : Number(key) || undefined, key === 'autosave', kind);
      return { ok: true, status: 200, json: async () => value };
    } catch (error) {
      if (error.name === 'QuotaExceededError' && !options.storageRetried && root.caches) {
        for (const key of await root.caches.keys()) if (key.startsWith('hs-assets-')) await root.caches.delete(key);
        return request(url, { ...options, storageRetried: true });
      }
      return { ok: false, status: error.status || 507, json: async () => ({ error: error.message }) };
    }
  }
  root.HeungShingStorage = { initialize, request, list, get, write, remove,
    get memoryOnly() { return memoryOnly; }, get writable() { return !isWeb() || writable; } };
  if (typeof module !== 'undefined') module.exports = root.HeungShingStorage;
})(globalThis);
