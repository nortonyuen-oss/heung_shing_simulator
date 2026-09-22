const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SERVICE = path.resolve(__dirname, '..', 'services', 'forum');
const ORIGIN = 'https://nortonyuen-oss.github.io';
const KEY = 'a'.repeat(20);

// Minimal D1 surface (prepare/bind/all/first/run) over the in-process SQLite that ships with Node.
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  for (const file of fs.readdirSync(path.join(SERVICE, 'migrations')).sort()) {
    db.exec(fs.readFileSync(path.join(SERVICE, 'migrations', file), 'utf8'));
  }
  return {
    raw: db,
    prepare(sql) {
      const statement = db.prepare(sql);
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async all() { return { results: statement.all(...args) }; },
        async first() { return statement.get(...args) ?? null; },
        async run() { statement.run(...args); return { success: true }; },
      };
    },
  };
}

async function worker(env = {}) {
  const { default: handler } = await import('../services/forum/worker.mjs');
  const bindings = { DB: fakeD1(), ALLOWED_ORIGINS: ORIGIN, IP_SALT: 'test-salt', ...env };
  const api = async (method, route, body, headers = {}) => {
    const request = new Request(`https://forum.example${route}`, {
      method, headers: { Origin: ORIGIN, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    const response = await handler.fetch(request, bindings);
    return { status: response.status, headers: response.headers, data: response.status === 204 ? null : await response.json() };
  };
  api.db = bindings.DB.raw;
  return api;
}
// Every write in these tests comes from a distinct address unless a test is about the write windows.
let addresses = 0;
function fresh() { return { 'CF-Connecting-IP': `203.0.113.${++addresses % 250}` }; }
function backdate(db, minutes) { db.prepare("UPDATE write_log SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)").run(`-${minutes} minutes`); }

function post(overrides = {}) {
  return { category: '城中熱話', headline: '存檔 & 載入 #問題', body: '第一行\n<img src=x onerror=alert(1)>', nickname: '市民', requestKey: KEY, ...overrides };
}

test('the API only answers the official site and reports health', async () => {
  const api = await worker();
  const health = await api('GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(health.headers.get('Cache-Control'), 'no-store');
  const foreign = await api('GET', '/posts', undefined, { Origin: 'https://evil.example' });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await api('GET', '/nope')).status, 404);
  assert.equal((await api('DELETE', '/posts')).status, 405);
  const preflight = await api('OPTIONS', '/posts');
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
});

test('a request with no Origin header (the game client) is never rejected by the allowlist', async () => {
  const api = await worker();
  const response = await api('GET', '/posts', undefined, { Origin: '' });
  // fetch()/Request strips an empty Origin header, so this exercises the "no Origin at all" path.
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('posting is visible immediately (post-then-moderate) and idempotent per request key', async () => {
  const api = await worker();
  const first = await api('POST', '/posts', post());
  assert.equal(first.status, 201);
  assert.equal(first.data.item.id, 1);
  assert.equal(first.data.item.headline, '存檔 & 載入 #問題');
  assert.equal(first.data.item.body, '第一行\n<img src=x onerror=alert(1)>');
  assert.equal(first.data.item.comments, 0);
  assert.equal(first.data.item.request_key, undefined, 'request keys never leave the server');
  const replay = await api('POST', '/posts', post());
  assert.equal(replay.status, 201);
  assert.equal(replay.data.item.id, 1);
  const conflict = await api('POST', '/posts', post({ headline: 'changed' }));
  assert.equal(conflict.status, 409);
  const list = await api('GET', '/posts');
  assert.equal(list.data.items.length, 1);
});

test('malformed posts are rejected before they reach the database', async () => {
  const api = await worker();
  assert.equal((await api('POST', '/posts', post({ category: '未知台' }))).status, 400);
  assert.equal((await api('POST', '/posts', post({ headline: '   ' }))).status, 400);
  assert.equal((await api('POST', '/posts', post({ body: 'x'.repeat(1501) }))).status, 400);
  assert.equal((await api('POST', '/posts', post({ requestKey: 'short' }))).status, 400);
  assert.equal((await api('POST', '/posts', post({ nickname: 42 }))).status, 400);
  assert.equal((await api('POST', '/posts', '[1,2]')).status, 400);
  assert.equal((await api('POST', '/posts', 'not json')).status, 400);
  assert.equal((await api('POST', '/posts', 'x', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await api('POST', '/posts', post({ body: 'x'.repeat(40000) }))).status, 413);
  assert.deepEqual((await api('GET', '/posts')).data, { items: [], hasNext: false });
});

test('SQL and HTML payloads in every field are stored inert as text and never executed', async () => {
  const api = await worker();
  const attack = "x'; DROP TABLE posts; --";
  const tables = () => api.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get().n;
  const before = tables();
  const posted = await api('POST', '/posts', post({ headline: attack, body: `${attack}\n<script>alert(1)</script>\n" OR 1=1 --`, nickname: "Robert'); DELETE FROM comments; --" }));
  assert.equal(posted.status, 201);
  assert.equal(posted.data.item.headline, attack);
  assert.equal(posted.data.item.nickname, "Robert'); DELETE FROM comments; --");
  const comment = await api('POST', '/posts/1/comments', { body: "'); DROP TABLE comments; --", nickname: '\\x00', requestKey: `${KEY}r` }, fresh());
  assert.equal(comment.status, 201);
  assert.equal(tables(), before);
  assert.equal((await api('GET', '/posts')).data.items[0].comments, 1);
  assert.equal((await api('GET', "/posts?category=城中熱話' OR '1'='1")).status, 400);
  assert.equal((await api('GET', '/posts/1 OR 1=1/comments')).status, 404);
  assert.equal((await api('GET', "/posts?page=1;DROP")).status, 400);
});

test('field restrictions: closed category list, single-line headline, control characters and unknown keys', async () => {
  const api = await worker();
  const reject = async (patch, why) => assert.equal((await api('POST', '/posts', post(patch), fresh())).status, 400, why);
  await reject({ category: '吹水台; DROP' }, 'category is exact-match against the closed list');
  await reject({ headline: 'line one\nline two' }, 'headline is single-line');
  await reject({ nickname: 'tab\tname' }, 'nickname has no tabs');
  await reject({ headline: 'null\u0000byte' }, 'no NUL');
  await reject({ body: 'esc\u001b[31m' }, 'no C0 control characters');
  await reject({ body: 'sep line' }, 'no unicode line separators');
  await reject({ body: 'x', extra: 'field' }, 'unknown keys are refused');
  await reject({ __proto__: { polluted: true }, ['__proto__']: 'x' }, 'prototype keys are refused');
  const ok = await api('POST', '/posts', post({ body: 'crlf\r\nlines\ttabbed', nickname: 'é' }), fresh());
  assert.equal(ok.status, 201);
  assert.equal(ok.data.item.body, 'crlf\nlines\ttabbed', 'CRLF is normalised to LF; tabs stay in the body');
  assert.equal(ok.data.item.nickname, 'é', 'text is NFC-normalised');
  const comment = await api('POST', '/posts/1/comments', { body: 'ok', requestKey: `${KEY}r`, headline: 'not a comment field' }, fresh());
  assert.equal(comment.status, 400, 'comments accept only comment fields');
});

test('the database refuses out-of-policy rows even when the Worker is bypassed', async () => {
  const api = await worker();
  const insert = (headline, category, key = KEY) => api.db.prepare('INSERT INTO posts (category, headline, body, nickname, created_at, request_key) VALUES (?, ?, ?, ?, ?, ?)').run(category, headline, 'b', '', 'now', key);
  insert('fine', '城中熱話');
  assert.throws(() => insert('x'.repeat(221), '城中熱話', `${KEY}2`), /field restriction/);
  assert.throws(() => insert('t', '未知台', `${KEY}3`), /field restriction/);
  assert.throws(() => api.db.prepare("UPDATE posts SET nickname = ? WHERE id = 1").run('n'.repeat(41)), /field restriction/);
  assert.throws(() => api.db.prepare("INSERT INTO comments (post_id, body, nickname, created_at, request_key) VALUES (1, '', '', 'now', ?)").run(`${KEY}r`), /field restriction/);
  api.db.prepare("UPDATE posts SET state = 'hidden' WHERE id = 1").run();
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM posts').get().n, 1);
});

test('a hidden post disappears from the public feed and its comment route 404s', async () => {
  const api = await worker();
  await api('POST', '/posts', post());
  api.db.prepare("UPDATE posts SET state = 'hidden' WHERE id = 1").run();
  assert.deepEqual((await api('GET', '/posts')).data, { items: [], hasNext: false });
  assert.equal((await api('POST', '/posts/1/comments', { body: 'hi', requestKey: `${KEY}r` }, fresh())).status, 404);
  assert.equal((await api('GET', '/posts/1/comments')).status, 404);
});

test('the feed pages 20 at a time, newest first, and filters by category', async () => {
  const api = await worker();
  for (let i = 1; i <= 21; i++) await api('POST', '/posts', post({ headline: `memo ${i}`, requestKey: `${KEY}${i}` }), fresh());
  const page1 = await api('GET', '/posts');
  assert.equal(page1.data.items.length, 20);
  assert.equal(page1.data.hasNext, true);
  assert.equal(page1.data.items[0].headline, 'memo 21');
  const page2 = await api('GET', '/posts?page=2');
  assert.deepEqual(page2.data.items.map(item => item.headline), ['memo 1']);
  assert.equal(page2.data.hasNext, false);
  assert.deepEqual((await api('GET', '/posts?category=交通台')).data, { items: [], hasNext: false });
  assert.equal((await api('GET', '/posts?category=deleted')).status, 400);
  assert.equal((await api('GET', '/posts?page=0')).status, 400);
  assert.equal((await api('GET', '/posts?page=abc')).status, 400);
});

test('comments attach to an existing post and bump its comment count', async () => {
  const api = await worker();
  await api('POST', '/posts', post());
  const missing = await api('POST', '/posts/999/comments', { body: 'hello', requestKey: `${KEY}r` });
  assert.equal(missing.status, 404);
  const comment = await api('POST', '/posts/1/comments', { body: ' 回覆 ', nickname: '', requestKey: `${KEY}r` }, fresh());
  assert.equal(comment.status, 201);
  assert.equal(comment.data.item.body, '回覆');
  assert.equal(comment.data.item.post_id, 1);
  const replay = await api('POST', '/posts/1/comments', { body: '回覆', nickname: '', requestKey: `${KEY}r` });
  assert.equal(replay.data.item.id, comment.data.item.id);
  assert.equal((await api('POST', '/posts/1/comments', { body: 'other', requestKey: `${KEY}r` })).status, 409);
  const thread = await api('GET', '/posts/1/comments');
  assert.equal(thread.data.items.length, 1);
  assert.equal((await api('GET', '/posts')).data.items[0].comments, 1);
  assert.equal((await api('GET', '/posts/999/comments')).status, 404);
});

test('the edge flood shield refuses writes before the body is read', async () => {
  const seen = [];
  const api = await worker({ POST_LIMIT: { async limit({ key }) { seen.push(key); return { success: seen.length > 1 }; } } });
  const limited = await api('POST', '/posts', post(), { 'CF-Connecting-IP': '203.0.113.9' });
  assert.equal(limited.status, 429);
  assert.equal(limited.data.error, 'limited');
  assert.equal((await api('POST', '/posts', post())).status, 201);
  assert.equal((await api('GET', '/posts')).status, 200, 'reads are never rate limited');
  assert.deepEqual(seen, ['203.0.113.9', 'unknown']);
});

test('one address may write once a minute and five times an hour; retries of a stored request are free', async () => {
  const api = await worker();
  const me = { 'CF-Connecting-IP': '198.51.100.7' }, other = { 'CF-Connecting-IP': '198.51.100.8' };
  assert.equal((await api('POST', '/posts', post(), me)).status, 201);
  const second = await api('POST', '/posts', post({ requestKey: `${KEY}2` }), me);
  assert.equal(second.status, 429);
  assert.equal(second.data.error, 'limited');
  assert.equal((await api('POST', '/posts', post(), me)).status, 201, 'same request key replays without counting');
  assert.equal((await api('POST', '/posts/1/comments', { body: 'hi', requestKey: `${KEY}r` }, me)).status, 429, 'comments share the window');
  assert.equal((await api('POST', '/posts', post({ requestKey: `${KEY}o` }), other)).status, 201, 'another address is unaffected');
  backdate(api.db, 2);
  assert.equal((await api('POST', '/posts', post({ requestKey: `${KEY}2` }), me)).status, 201);
  backdate(api.db, 2);
  assert.equal((await api('POST', '/posts/1/comments', { body: 'hi', requestKey: `${KEY}r` }, me)).status, 201);
  backdate(api.db, 2);
  assert.equal((await api('POST', '/posts', post({ requestKey: `${KEY}4` }), me)).status, 201);
  backdate(api.db, 2);
  assert.equal((await api('POST', '/posts', post({ requestKey: `${KEY}5` }), me)).status, 201);
  backdate(api.db, 2);
  assert.equal(api.db.prepare("SELECT COUNT(*) AS n FROM write_log WHERE client = (SELECT client FROM write_log LIMIT 1)").get().n, 5);
  assert.equal((await api('POST', '/posts', post({ requestKey: `${KEY}6` }), me)).status, 429, 'sixth write in the hour closes the window');
  backdate(api.db, 61);
  assert.equal((await api('POST', '/posts', post({ requestKey: `${KEY}6` }), me)).status, 201, 'entries older than an hour are pruned');
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM write_log').get().n, 1);
  assert.equal(api.db.prepare("SELECT COUNT(*) AS n FROM write_log WHERE client LIKE '198.%' OR client LIKE '%.%'").get().n, 0, 'no raw address is stored');
});
