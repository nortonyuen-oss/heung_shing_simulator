#!/usr/bin/env node

const { execFileSync } = require('child_process');
const { openGameDatabase } = require('../db');

const pgHost = process.env.PGHOST || 'localhost';
const pgPort = process.env.PGPORT || '5432';
const pgDatabase = process.env.PGDATABASE || 'citybuilder';
const pgUser = process.env.PGUSER || process.env.USER;

const sql = `
  SELECT COALESCE(json_agg(row_to_json(rows)), '[]'::json)
  FROM (
    SELECT
      id,
      city_name,
      population,
      year,
      month,
      budget::text AS budget,
      save_data,
      created_at,
      updated_at
    FROM game_saves
    ORDER BY id
  ) rows
`;

function readPostgresRows() {
  const args = [
    '-X',
    '--no-psqlrc',
    '-h', pgHost,
    '-p', pgPort,
    '-d', pgDatabase,
    '-t',
    '-A',
    '-c', sql,
  ];

  if (pgUser) args.splice(8, 0, '-U', pgUser);

  const stdout = execFileSync('psql', args, {
    encoding: 'utf8',
    maxBuffer: 200 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();

  return JSON.parse(stdout || '[]');
}

function normalizeTimestamp(value) {
  if (!value) return new Date().toISOString();
  return new Date(value).toISOString();
}

function main() {
  const rows = readPostgresRows();
  const store = openGameDatabase();

  try {
    for (const row of rows) {
      store.upsertMigratedSave({
        ...row,
        created_at: normalizeTimestamp(row.created_at),
        updated_at: normalizeTimestamp(row.updated_at),
      });
    }

    console.log(`Migrated ${rows.length} save${rows.length === 1 ? '' : 's'} to ${store.path}`);
  } finally {
    store.close();
  }
}

main();
