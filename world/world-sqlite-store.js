const { WorldSaveFormat: f } = require('./world-save-format');

function createWorldSqliteStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_saves (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, header TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS world_chunks (save_id TEXT NOT NULL REFERENCES world_saves(id) ON DELETE CASCADE,
      chunk_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(save_id,chunk_id));
    CREATE TABLE IF NOT EXISTS world_entities (save_id TEXT NOT NULL REFERENCES world_saves(id) ON DELETE CASCADE,
      entity_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(save_id,entity_id));
    CREATE TABLE IF NOT EXISTS world_save_backups (save_id TEXT PRIMARY KEY REFERENCES world_saves(id) ON DELETE CASCADE, snapshot TEXT NOT NULL);
  `);
  function validId(id) { f.check(typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id), 'Invalid world save ID'); }
  function load(id) {
    validId(id); const row = db.prepare('SELECT * FROM world_saves WHERE id=?').get(id);
    if (!row) return null;
    const snapshot = { ...JSON.parse(row.header),
      chunks: db.prepare('SELECT data FROM world_chunks WHERE save_id=? ORDER BY chunk_id').all(id).map(row => JSON.parse(row.data)),
      entities: db.prepare('SELECT data FROM world_entities WHERE save_id=? ORDER BY entity_id').all(id).map(row => JSON.parse(row.data)) };
    f.validateWorldSnapshot(snapshot);
    return { saveId: id, storageRevision: row.revision, snapshot };
  }
  function atomic(operation) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function requireRevision(old, expectedRevision) {
    f.check(Number.isSafeInteger(expectedRevision) && expectedRevision >= 0, 'Invalid save revision');
    if ((old?.storageRevision || 0) !== expectedRevision) throw f.worldSaveError('存檔已由另一個視窗更新，請先匯出目前修改再載入。', 409);
  }
  function put(id, snapshot, checkpoint, revision) {
    const { chunks, entities, ...header } = snapshot;
    db.prepare('INSERT INTO world_saves(id,revision,header) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,header=excluded.header')
      .run(id, revision, JSON.stringify(header));
    const insertChunk = db.prepare('INSERT INTO world_chunks(save_id,chunk_id,data) VALUES(?,?,?) ON CONFLICT(save_id,chunk_id) DO UPDATE SET data=excluded.data');
    const insertEntity = db.prepare('INSERT INTO world_entities(save_id,entity_id,data) VALUES(?,?,?) ON CONFLICT(save_id,entity_id) DO UPDATE SET data=excluded.data');
    for (const chunk of checkpoint.chunks) insertChunk.run(id, chunk.chunkId, JSON.stringify(chunk));
    for (const entity of checkpoint.entities) {
      if (entity.value === null) db.prepare('DELETE FROM world_entities WHERE save_id=? AND entity_id=?').run(id, entity.id);
      else insertEntity.run(id, entity.id, JSON.stringify(entity.value));
    }
  }
  function backup(id, snapshot) {
    db.prepare('INSERT INTO world_save_backups(save_id,snapshot) VALUES(?,?) ON CONFLICT(save_id) DO UPDATE SET snapshot=excluded.snapshot').run(id, JSON.stringify(snapshot));
  }
  return {
    listWorldSaves() { return db.prepare('SELECT id,revision,header FROM world_saves').all().map(row => ({ id: row.id, storageRevision: row.revision, city: JSON.parse(row.header).city })); },
    getWorldSave: load,
    commitWorldSave(id, { expectedRevision, checkpoint }) {
      validId(id);
      return atomic(() => {
        const old = load(id); requireRevision(old, expectedRevision);
        const snapshot = f.mergeWorldCheckpoint(old?.snapshot, checkpoint), revision = (old?.storageRevision || 0) + 1;
        put(id, snapshot, checkpoint, revision);
        if (old) backup(id, old.snapshot);
        return { saveId: id, storageRevision: revision, localRevision: snapshot.revision };
      });
    },
    getWorldBackup(id) { validId(id); const row = db.prepare('SELECT snapshot FROM world_save_backups WHERE save_id=?').get(id);
      return row ? f.validateWorldSnapshot(JSON.parse(row.snapshot)) : null; },
    restoreWorldBackup(id, { expectedRevision }) {
      validId(id);
      return atomic(() => {
        const old = load(id); requireRevision(old, expectedRevision);
        const row = db.prepare('SELECT snapshot FROM world_save_backups WHERE save_id=?').get(id);
        if (!row) throw f.worldSaveError('沒有上一個儲存版本。', 404);
        const snapshot = f.validateWorldSnapshot(JSON.parse(row.snapshot));
        db.prepare('DELETE FROM world_chunks WHERE save_id=?').run(id); db.prepare('DELETE FROM world_entities WHERE save_id=?').run(id);
        put(id, snapshot, { chunks: snapshot.chunks, entities: snapshot.entities.map(value => ({ id: value.id, value })) }, old.storageRevision + 1);
        backup(id, old.snapshot);
        return { saveId: id, storageRevision: old.storageRevision + 1, snapshot };
      });
    },
  };
}
module.exports = { createWorldSqliteStore };
