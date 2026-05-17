const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(__dirname, '.data', 'citybuilder.sqlite');

function resolveDbPath() {
  return process.env.CITY_DB_PATH || DEFAULT_DB_PATH;
}

function openGameDatabase(dbPath = resolveDbPath()) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS game_saves (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      city_name   TEXT    NOT NULL DEFAULT 'Unknown City',
      population  INTEGER NOT NULL DEFAULT 0,
      year        INTEGER NOT NULL DEFAULT 1900,
      month       INTEGER NOT NULL DEFAULT 1,
      budget      NUMERIC NOT NULL DEFAULT 10000,
      save_data   TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const getSaveMetadataById = db.prepare(`
    SELECT id, city_name, population, year, month, budget, created_at, updated_at
    FROM game_saves
    WHERE id = ?
  `);

  return {
    path: dbPath,

    listSaves() {
      return db.prepare(`
        SELECT id, city_name, population, year, month, budget, created_at, updated_at
        FROM game_saves
        ORDER BY updated_at DESC
      `).all();
    },

    getSave(id) {
      const row = db.prepare('SELECT * FROM game_saves WHERE id = ?').get(id);
      if (!row) return null;
      return {
        ...row,
        save_data: JSON.parse(row.save_data),
      };
    },

    createSave(payload) {
      const result = db.prepare(`
        INSERT INTO game_saves (city_name, population, year, month, budget, save_data, updated_at)
        VALUES (@city_name, @population, @year, @month, @budget, @save_data, CURRENT_TIMESTAMP)
      `).run(serializePayload(payload));

      return getSaveMetadataById.get(result.lastInsertRowid);
    },

    updateSave(id, payload) {
      const result = db.prepare(`
        UPDATE game_saves
        SET city_name = @city_name,
            population = @population,
            year = @year,
            month = @month,
            budget = @budget,
            save_data = @save_data,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `).run({ id, ...serializePayload(payload) });

      if (result.changes === 0) return null;
      return getSaveMetadataById.get(id);
    },

    deleteSave(id) {
      db.prepare('DELETE FROM game_saves WHERE id = ?').run(id);
    },

    upsertMigratedSave(row) {
      db.prepare(`
        INSERT INTO game_saves (
          id, city_name, population, year, month, budget, save_data, created_at, updated_at
        )
        VALUES (
          @id, @city_name, @population, @year, @month, @budget, @save_data, @created_at, @updated_at
        )
        ON CONFLICT(id) DO UPDATE SET
          city_name = excluded.city_name,
          population = excluded.population,
          year = excluded.year,
          month = excluded.month,
          budget = excluded.budget,
          save_data = excluded.save_data,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `).run({
        ...row,
        save_data: stringifySaveData(row.save_data),
      });
    },

    close() {
      db.close();
    },
  };
}

function serializePayload(payload) {
  return {
    city_name: payload.city_name || 'Unknown City',
    population: Number(payload.population ?? 0),
    year: Number(payload.year ?? 1900),
    month: Number(payload.month ?? 1),
    budget: payload.budget ?? 10000,
    save_data: stringifySaveData(payload.save_data),
  };
}

function stringifySaveData(saveData) {
  return typeof saveData === 'string' ? saveData : JSON.stringify(saveData);
}

module.exports = {
  openGameDatabase,
  resolveDbPath,
};
