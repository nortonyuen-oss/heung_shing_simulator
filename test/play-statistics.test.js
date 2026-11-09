const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
function environment() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '../services/statistics/migrations/0001_play_sessions.sql'), 'utf8'));
  return { db, env: { PLAY_ORIGINS: 'https://game.example', READ_ORIGINS: 'https://site.example', GAME_VERSIONS: '5.5.0',
    DB: { prepare(sql) {
      let values = [];
      const statement = { bind(...args) { values = args; return statement; },
        async first() { return db.prepare(sql).get(...values); }, async run() { return db.prepare(sql).run(...values); } };
      return statement;
    } } } };
}
test('play statistics atomically count once and expose only aggregate data', async () => {
  const worker = (await import('../services/statistics/worker.mjs')).default;
  const { db, env } = environment();
  const event = { eventId: crypto.randomUUID(), eventType: 'play_start', gameVersion: '5.5.0' };
  const send = () => worker.fetch(new Request('https://stats.example/v1/play', { method: 'POST',
    headers: { Origin: 'https://game.example', 'Content-Type': 'application/json' }, body: JSON.stringify(event) }), env, {});
  assert.equal((await send()).status, 200); assert.equal((await send()).status, 200);
  const response = await worker.fetch(new Request('https://stats.example/v1/stats', { headers: { Origin: 'https://site.example' } }), env, {});
  const value = await response.json(); assert.equal(value.webPlaySessions, 1);
  assert.deepEqual(Object.keys(value).sort(), ['since', 'status', 'updatedAt', 'webPlaySessions']); db.close();
});
test('daily limit and duplicate events cannot inflate the total; migrations preserve counts', async () => {
  const { db } = environment(); const now = new Date().toISOString(), day = now.slice(0, 10);
  const insert = db.prepare('INSERT OR IGNORE INTO play_events VALUES (?, ?, ?, ?)');
  for (let n = 0; n < 5002; n++) insert.run(String(n), day, now, '5.5.0');
  assert.equal(db.prepare('SELECT sessions FROM play_totals').get().sessions, 5000);
  db.exec(fs.readFileSync(path.join(__dirname, '../services/statistics/migrations/0001_play_sessions.sql'), 'utf8'));
  assert.equal(db.prepare('SELECT sessions FROM play_totals').get().sessions, 5000); db.close();
});
test('preview writes, identity fields and oversized input are rejected', async () => {
  const worker = (await import('../services/statistics/worker.mjs')).default;
  const { db, env } = environment();
  const send = (origin, data) => worker.fetch(new Request('https://stats.example/v1/play', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }), env, {});
  assert.equal((await send('https://preview.example', {})).status, 403);
  const event = { eventId: crypto.randomUUID(), eventType: 'play_start', gameVersion: '5.5.0', city: 'private' };
  assert.equal((await send('https://game.example', event)).status, 400);
  assert.equal((await send('https://game.example', { junk: 'x'.repeat(2000) })).status, 413);
  assert.equal(db.prepare('SELECT sessions FROM play_totals').get().sessions, 0); db.close();
});
