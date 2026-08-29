const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const hkoAstronomySeed = require('./data/hko-astronomy-2026.json');

const DEFAULT_DB_PATH = path.join(__dirname, '.data', 'citybuilder.sqlite');

function resolveDbPath() {
  return process.env.CITY_DB_PATH || DEFAULT_DB_PATH;
}

function openGameDatabase(dbPath = resolveDbPath()) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

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

  // Older databases predate dedicated autosave slots. Keep the migration
  // additive so existing manual saves remain untouched.
  const saveColumns = db.prepare('PRAGMA table_info(game_saves)').all();
  if (!saveColumns.some((column) => column.name === 'save_type')) {
    db.exec("ALTER TABLE game_saves ADD COLUMN save_type TEXT NOT NULL DEFAULT 'manual'");
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS game_saves_single_autosave
    ON game_saves(save_type)
    WHERE save_type = 'autosave'
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS terrain_presets (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      profile_type  TEXT    NOT NULL DEFAULT 'custom',
      seed          TEXT    NOT NULL DEFAULT '',
      terrain_data  TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS astronomy_sources (
      source_version  TEXT PRIMARY KEY,
      source_year     INTEGER NOT NULL,
      timezone        TEXT NOT NULL,
      latitude        REAL NOT NULL,
      longitude       REAL NOT NULL,
      sources_json    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS astronomy_calendar (
      source_version          TEXT NOT NULL,
      month                   INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
      day                     INTEGER NOT NULL CHECK(day BETWEEN 1 AND 31),
      sunrise_minute          INTEGER NOT NULL,
      solar_transit_minute    INTEGER NOT NULL,
      sunset_minute           INTEGER NOT NULL,
      moonrise_minute         INTEGER,
      moon_transit_minute     INTEGER,
      moonset_minute          INTEGER,
      moon_phase              REAL,
      civil_twilight_minutes  INTEGER NOT NULL,
      nautical_twilight_minutes INTEGER NOT NULL,
      astronomical_twilight_minutes INTEGER NOT NULL,
      PRIMARY KEY (source_version, month, day),
      FOREIGN KEY (source_version) REFERENCES astronomy_sources(source_version) ON DELETE CASCADE
    );
  `);

  seedAstronomyCalendar(db, hkoAstronomySeed);

  const getSaveMetadataById = db.prepare(`
    SELECT id, city_name, population, year, month, budget, save_type, created_at, updated_at
    FROM game_saves
    WHERE id = ?
  `);

  const getTerrainMetadataById = db.prepare(`
    SELECT id, name, profile_type, seed, created_at, updated_at
    FROM terrain_presets
    WHERE id = ?
  `);

  return {
    path: dbPath,

    listSaves() {
      return db.prepare(`
        SELECT id, city_name, population, year, month, budget, save_type, created_at, updated_at
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

    upsertAutosave(payload) {
      const values = serializePayload({ ...payload, city_name: 'autosave' });
      db.prepare(`
        INSERT INTO game_saves
          (city_name, population, year, month, budget, save_data, save_type, updated_at)
        VALUES
          (@city_name, @population, @year, @month, @budget, @save_data, 'autosave', CURRENT_TIMESTAMP)
        ON CONFLICT(save_type) WHERE save_type = 'autosave' DO UPDATE SET
          city_name = excluded.city_name,
          population = excluded.population,
          year = excluded.year,
          month = excluded.month,
          budget = excluded.budget,
          save_data = excluded.save_data,
          updated_at = CURRENT_TIMESTAMP
      `).run(values);

      return db.prepare(`
        SELECT id, city_name, population, year, month, budget, save_type, created_at, updated_at
        FROM game_saves WHERE save_type = 'autosave'
      `).get();
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
        save_data: stringifyMigratedSaveData(row.save_data),
      });
    },

    listTerrainPresets() {
      return db.prepare(`
        SELECT id, name, profile_type, seed, created_at, updated_at
        FROM terrain_presets
        ORDER BY updated_at DESC
      `).all();
    },

    getTerrainPreset(id) {
      const row = db.prepare('SELECT * FROM terrain_presets WHERE id = ?').get(id);
      if (!row) return null;
      return {
        ...row,
        terrain_data: JSON.parse(row.terrain_data),
      };
    },

    createTerrainPreset(payload) {
      const result = db.prepare(`
        INSERT INTO terrain_presets (name, profile_type, seed, terrain_data, updated_at)
        VALUES (@name, @profile_type, @seed, @terrain_data, CURRENT_TIMESTAMP)
      `).run(serializeTerrainPayload(payload));

      return getTerrainMetadataById.get(result.lastInsertRowid);
    },

    updateTerrainPreset(id, payload) {
      const result = db.prepare(`
        UPDATE terrain_presets
        SET name = @name,
            profile_type = @profile_type,
            seed = @seed,
            terrain_data = @terrain_data,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `).run({ id, ...serializeTerrainPayload(payload) });

      if (result.changes === 0) return null;
      return getTerrainMetadataById.get(id);
    },

    deleteTerrainPreset(id) {
      db.prepare('DELETE FROM terrain_presets WHERE id = ?').run(id);
    },

    getAstronomyDay(month, day, sourceVersion = hkoAstronomySeed.sourceVersion) {
      const safeMonth = Math.max(1, Math.min(12, Math.floor(Number(month) || 1)));
      const safeDay = Math.max(1, Math.min(31, Math.floor(Number(day) || 1)));
      // The simulator uses 30-day months. February 29/30 therefore reuses the
      // latest real HKO February row instead of failing the lookup.
      return db.prepare(`
        SELECT
          source_version AS sourceVersion,
          month,
          day,
          sunrise_minute AS sunriseMinutes,
          solar_transit_minute AS solarTransitMinutes,
          sunset_minute AS sunsetMinutes,
          moonrise_minute AS moonriseMinutes,
          moon_transit_minute AS moonTransitMinutes,
          moonset_minute AS moonsetMinutes,
          moon_phase AS moonPhase,
          civil_twilight_minutes AS civilTwilightMinutes,
          nautical_twilight_minutes AS nauticalTwilightMinutes,
          astronomical_twilight_minutes AS astronomicalTwilightMinutes
        FROM astronomy_calendar
        WHERE source_version = ? AND month = ? AND day <= ?
        ORDER BY day DESC
        LIMIT 1
      `).get(sourceVersion, safeMonth, safeDay) ?? null;
    },

    getAstronomyMetadata(sourceVersion = hkoAstronomySeed.sourceVersion) {
      const row = db.prepare(`
        SELECT source_version AS sourceVersion, source_year AS sourceYear,
               timezone, latitude, longitude, sources_json AS sourcesJson
        FROM astronomy_sources WHERE source_version = ?
      `).get(sourceVersion);
      if (!row) return null;
      const { sourcesJson, ...metadata } = row;
      return { ...metadata, sources: JSON.parse(sourcesJson) };
    },

    close() {
      db.close();
    },
  };
}

function seedAstronomyCalendar(db, seed) {
  if (!seed?.sourceVersion || !Array.isArray(seed.records) || seed.records.length < 365) {
    throw new Error('Invalid bundled HKO astronomy seed');
  }
  const existingCount = Number(db.prepare(`
    SELECT COUNT(*) AS count FROM astronomy_calendar WHERE source_version = ?
  `).get(seed.sourceVersion)?.count ?? 0);
  if (existingCount === seed.records.length) return;

  const insertSource = db.prepare(`
    INSERT INTO astronomy_sources
      (source_version, source_year, timezone, latitude, longitude, sources_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_version) DO UPDATE SET
      source_year = excluded.source_year,
      timezone = excluded.timezone,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      sources_json = excluded.sources_json
  `);
  const insertDay = db.prepare(`
    INSERT INTO astronomy_calendar (
      source_version, month, day, sunrise_minute, solar_transit_minute, sunset_minute,
      moonrise_minute, moon_transit_minute, moonset_minute, moon_phase,
      civil_twilight_minutes, nautical_twilight_minutes, astronomical_twilight_minutes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN IMMEDIATE');
  try {
    insertSource.run(
      seed.sourceVersion,
      seed.sourceYear,
      seed.timezone,
      seed.latitude,
      seed.longitude,
      JSON.stringify(seed.sources),
    );
    db.prepare('DELETE FROM astronomy_calendar WHERE source_version = ?').run(seed.sourceVersion);
    seed.records.forEach((record) => {
      insertDay.run(
        seed.sourceVersion,
        record.month,
        record.day,
        record.sunrise,
        record.solarTransit,
        record.sunset,
        record.moonrise,
        record.moonTransit,
        record.moonset,
        record.moonPhase,
        record.civilTwilight,
        record.nauticalTwilight,
        record.astronomicalTwilight,
      );
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function serializePayload(payload) {
  assertJsonObject(payload, 'Save payload');
  return {
    city_name: payload.city_name || 'Unknown City',
    population: Number(payload.population ?? 0),
    year: Number(payload.year ?? 1900),
    month: Number(payload.month ?? 1),
    budget: payload.budget ?? 10000,
    save_data: stringifyJsonObject(payload.save_data, 'save_data'),
  };
}

function createInvalidPayloadError(message) {
  const error = new TypeError(message);
  error.code = 'INVALID_PAYLOAD';
  return error;
}

function assertJsonObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createInvalidPayloadError(`${fieldName} must be a JSON object`);
  }
}

function stringifyJsonObject(value, fieldName) {
  assertJsonObject(value, fieldName);
  try {
    return JSON.stringify(value);
  } catch {
    throw createInvalidPayloadError(`${fieldName} must be JSON serializable`);
  }
}

function stringifyMigratedSaveData(value) {
  if (typeof value !== 'string') return stringifyJsonObject(value, 'save_data');
  try {
    return stringifyJsonObject(JSON.parse(value), 'save_data');
  } catch (error) {
    if (error?.code === 'INVALID_PAYLOAD') throw error;
    throw createInvalidPayloadError('save_data must contain a valid JSON object');
  }
}

function serializeTerrainPayload(payload) {
  assertJsonObject(payload, 'Terrain payload');
  return {
    name: (payload.name || 'Untitled Terrain').toString().slice(0, 60),
    profile_type: (payload.profile_type || 'custom').toString().slice(0, 40),
    seed: (payload.seed || '').toString().slice(0, 120),
    terrain_data: stringifyJsonObject(payload.terrain_data, 'terrain_data'),
  };
}

module.exports = {
  openGameDatabase,
  resolveDbPath,
};
