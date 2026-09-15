const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { memoColor, payload } = require('../docs/feedback.js');

const SERVICE = path.resolve(__dirname, '..', 'services', 'feedback');
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
  const { default: handler } = await import('../services/feedback/worker.mjs');
  const bindings = { DB: fakeD1(), ALLOWED_ORIGINS: ORIGIN, IP_SALT: 'test-salt', ...env };
  const api = async (method, route, body, headers = {}) => {
    const request = new Request(`https://feedback.example${route}`, {
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

function message(overrides = {}) {
  return { type: 'comment', title: '存檔 & 載入 #問題', details: '第一行\n<img src=x onerror=alert(1)>', nickname: '市民', requestKey: KEY, ...overrides };
}

test('memo colours come from the record when valid, otherwise a random paper index', () => {
  assert.equal(memoColor(3), 3);
  assert.equal(memoColor(0), 0);
  assert.equal(memoColor(6, () => 0.99), 5);
  assert.equal(memoColor('2', () => 0), 0);
  assert.equal(memoColor(undefined, () => 0.5), 3);
});

test('a visitor payload is trimmed, typed and carries its idempotency key', () => {
  const body = payload({ type: 'hack', title: '  Title ', details: ' body ', nickname: undefined, version: '4.9.0 ', platform: 'Windows' }, KEY);
  assert.deepEqual(body, { type: 'comment', title: 'Title', details: 'body', nickname: '', version: '4.9.0', platform: 'Windows', requestKey: KEY });
});

test('the API only answers the official site and reports health', async () => {
  const api = await worker();
  const health = await api('GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(health.headers.get('Cache-Control'), 'no-store');
  const foreign = await api('GET', '/messages', undefined, { Origin: 'https://evil.example' });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await api('GET', '/nope')).status, 404);
  assert.equal((await api('DELETE', '/messages')).status, 405);
  const preflight = await api('OPTIONS', '/messages');
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
});

test('posting stores unicode as-is, assigns a paper colour and is idempotent per request key', async () => {
  const api = await worker();
  const first = await api('POST', '/messages', message());
  assert.equal(first.status, 201);
  assert.equal(first.data.item.number, 1);
  assert.equal(first.data.item.title, '存檔 & 載入 #問題');
  assert.equal(first.data.item.body, '第一行\n<img src=x onerror=alert(1)>');
  assert.equal(first.data.item.state, 'open');
  assert.ok(first.data.item.color >= 0 && first.data.item.color <= 5);
  assert.equal(first.data.item.comments, 0);
  assert.equal(first.data.item.request_key, undefined, 'request keys never leave the server');
  const replay = await api('POST', '/messages', message());
  assert.equal(replay.status, 201);
  assert.equal(replay.data.item.number, 1);
  const conflict = await api('POST', '/messages', message({ title: 'changed' }));
  assert.equal(conflict.status, 409);
  const list = await api('GET', '/messages');
  assert.equal(list.data.items.length, 1);
});

test('malformed posts are rejected before they reach the database', async () => {
  const api = await worker();
  assert.equal((await api('POST', '/messages', message({ type: 'hack' }))).status, 400);
  assert.equal((await api('POST', '/messages', message({ title: '   ' }))).status, 400);
  assert.equal((await api('POST', '/messages', message({ details: 'x'.repeat(6001) }))).status, 400);
  assert.equal((await api('POST', '/messages', message({ requestKey: 'short' }))).status, 400);
  assert.equal((await api('POST', '/messages', message({ nickname: 42 }))).status, 400);
  assert.equal((await api('POST', '/messages', '[1,2]')).status, 400);
  assert.equal((await api('POST', '/messages', 'not json')).status, 400);
  assert.equal((await api('POST', '/messages', 'x', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await api('POST', '/messages', message({ details: 'x'.repeat(40000) }))).status, 413);
  assert.deepEqual((await api('GET', '/messages')).data, { items: [], hasNext: false });
});

test('SQL and HTML payloads in every field are stored inert as text and never executed', async () => {
  const api = await worker();
  const attack = "x'; DROP TABLE messages; --";
  const tables = () => api.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get().n;
  const before = tables();
  const posted = await api('POST', '/messages', message({ title: attack, details: `${attack}\n<script>alert(1)</script>\n" OR 1=1 --`, nickname: "Robert'); DELETE FROM replies; --", version: '4.9.0-beta', platform: 'Windows' }));
  assert.equal(posted.status, 201);
  assert.equal(posted.data.item.title, attack);
  assert.equal(posted.data.item.nickname, "Robert'); DELETE FROM replies; --");
  const reply = await api('POST', '/messages/1/replies', { details: "'); DROP TABLE replies; --", nickname: '\\x00', requestKey: `${KEY}r` }, fresh());
  assert.equal(reply.status, 201);
  assert.equal(tables(), before);
  assert.equal((await api('GET', '/messages')).data.items[0].comments, 1);
  assert.equal((await api('GET', "/messages?state=open' OR '1'='1")).status, 400);
  assert.equal((await api('GET', '/messages/1 OR 1=1/replies')).status, 404);
  assert.equal((await api('GET', "/messages?page=1;DROP")).status, 400);
});

test('field restrictions: closed lists, single-line fields, control characters and unknown keys', async () => {
  const api = await worker();
  const reject = async (patch, why) => assert.equal((await api('POST', '/messages', message(patch), fresh())).status, 400, why);
  await reject({ platform: 'Linux' }, 'platform must come from the form list');
  await reject({ platform: 'Windows; DROP' }, 'platform is exact-match');
  await reject({ version: '4.9.0 <b>' }, 'version allows only version-like characters');
  await reject({ version: "1' OR 1=1" }, 'version rejects quotes');
  await reject({ title: 'line one\nline two' }, 'title is single-line');
  await reject({ nickname: 'tab\tname' }, 'nickname has no tabs');
  await reject({ title: 'null\u0000byte' }, 'no NUL');
  await reject({ details: 'esc\u001b[31m' }, 'no C0 control characters');
  await reject({ details: 'sep\u2028line' }, 'no unicode line separators');
  await reject({ details: 'x', extra: 'field' }, 'unknown keys are refused');
  await reject({ __proto__: { polluted: true }, ['__proto__']: 'x' }, 'prototype keys are refused');
  await reject({ type: 'Bug' }, 'type is case-sensitive exact');
  const ok = await api('POST', '/messages', message({ version: 'v4.9.0 build 12', platform: 'macOS (Intel)', details: 'crlf\r\nlines\ttabbed', nickname: 'e\u0301' }), fresh());
  assert.equal(ok.status, 201);
  assert.equal(ok.data.item.body, 'crlf\nlines\ttabbed', 'CRLF is normalised to LF; tabs stay in the body');
  assert.equal(ok.data.item.nickname, '\u00e9', 'text is NFC-normalised');
  const reply = await api('POST', '/messages/1/replies', { details: 'ok', requestKey: `${KEY}r`, title: 'not a reply field' }, fresh());
  assert.equal(reply.status, 400, 'replies accept only reply fields');
});

test('the database refuses out-of-policy rows even when the Worker is bypassed', async () => {
  const api = await worker();
  const insert = (title, platform, key = KEY) => api.db.prepare('INSERT INTO messages (type, title, body, nickname, version, platform, color, created_at, request_key) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)').run('bug', title, 'b', '', '', platform, 'now', key);
  insert('fine', 'Windows');
  assert.throws(() => insert('x'.repeat(121), 'Windows', `${KEY}2`), /field restriction/);
  assert.throws(() => insert('t', 'Linux', `${KEY}3`), /field restriction/);
  assert.throws(() => insert('t', 'Other', "abc'; DROP TABLE messages; --"), /field restriction/);
  assert.throws(() => api.db.prepare("UPDATE messages SET nickname = ? WHERE number = 1").run('n'.repeat(41)), /field restriction/);
  assert.throws(() => api.db.prepare("INSERT INTO replies (message_number, body, nickname, created_at, request_key) VALUES (1, '', '', 'now', ?)").run(`${KEY}r`), /field restriction/);
  api.db.prepare("UPDATE messages SET state = 'closed' WHERE number = 1").run();
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 1);
});

test('the feed pages 20 at a time, newest first, and filters by state', async () => {
  const api = await worker();
  for (let i = 1; i <= 21; i++) await api('POST', '/messages', message({ title: `memo ${i}`, requestKey: `${KEY}${i}` }), fresh());
  const page1 = await api('GET', '/messages');
  assert.equal(page1.data.items.length, 20);
  assert.equal(page1.data.hasNext, true);
  assert.equal(page1.data.items[0].title, 'memo 21');
  const page2 = await api('GET', '/messages?page=2');
  assert.deepEqual(page2.data.items.map(item => item.title), ['memo 1']);
  assert.equal(page2.data.hasNext, false);
  assert.deepEqual((await api('GET', '/messages?state=closed')).data, { items: [], hasNext: false });
  assert.equal((await api('GET', '/messages?state=deleted')).status, 400);
  assert.equal((await api('GET', '/messages?page=0')).status, 400);
  assert.equal((await api('GET', '/messages?page=abc')).status, 400);
});

test('replies attach to an existing memo and bump its reply count', async () => {
  const api = await worker();
  await api('POST', '/messages', message());
  const missing = await api('POST', '/messages/999/replies', { details: 'hello', requestKey: `${KEY}r` });
  assert.equal(missing.status, 404);
  const reply = await api('POST', '/messages/1/replies', { details: ' 回覆 ', nickname: '', requestKey: `${KEY}r` }, fresh());
  assert.equal(reply.status, 201);
  assert.equal(reply.data.item.body, '回覆');
  assert.equal(reply.data.item.message_number, 1);
  const replay = await api('POST', '/messages/1/replies', { details: '回覆', nickname: '', requestKey: `${KEY}r` });
  assert.equal(replay.data.item.id, reply.data.item.id);
  assert.equal((await api('POST', '/messages/1/replies', { details: 'other', requestKey: `${KEY}r` })).status, 409);
  const thread = await api('GET', '/messages/1/replies');
  assert.equal(thread.data.items.length, 1);
  assert.equal((await api('GET', '/messages')).data.items[0].comments, 1);
  assert.equal((await api('GET', '/messages/999/replies')).status, 404);
});

test('the edge flood shield refuses writes before the body is read', async () => {
  const seen = [];
  const api = await worker({ POST_LIMIT: { async limit({ key }) { seen.push(key); return { success: seen.length > 1 }; } } });
  const limited = await api('POST', '/messages', message(), { 'CF-Connecting-IP': '203.0.113.9' });
  assert.equal(limited.status, 429);
  assert.equal(limited.data.error, 'limited');
  assert.equal((await api('POST', '/messages', message())).status, 201);
  assert.equal((await api('GET', '/messages')).status, 200, 'reads are never rate limited');
  assert.deepEqual(seen, ['203.0.113.9', 'unknown']);
});

test('one address may write once a minute and five times an hour; retries of a stored request are free', async () => {
  const api = await worker();
  const me = { 'CF-Connecting-IP': '198.51.100.7' }, other = { 'CF-Connecting-IP': '198.51.100.8' };
  assert.equal((await api('POST', '/messages', message(), me)).status, 201);
  const second = await api('POST', '/messages', message({ requestKey: `${KEY}2` }), me);
  assert.equal(second.status, 429);
  assert.equal(second.data.error, 'limited');
  assert.equal((await api('POST', '/messages', message(), me)).status, 201, 'same request key replays without counting');
  assert.equal((await api('POST', '/messages/1/replies', { details: 'hi', requestKey: `${KEY}r` }, me)).status, 429, 'replies share the window');
  assert.equal((await api('POST', '/messages', message({ requestKey: `${KEY}o` }), other)).status, 201, 'another address is unaffected');
  backdate(api.db, 2);
  assert.equal((await api('POST', '/messages', message({ requestKey: `${KEY}2` }), me)).status, 201);
  backdate(api.db, 2);
  assert.equal((await api('POST', '/messages/1/replies', { details: 'hi', requestKey: `${KEY}r` }, me)).status, 201);
  backdate(api.db, 2);
  assert.equal((await api('POST', '/messages', message({ requestKey: `${KEY}4` }), me)).status, 201);
  backdate(api.db, 2);
  assert.equal((await api('POST', '/messages', message({ requestKey: `${KEY}5` }), me)).status, 201);
  backdate(api.db, 2);
  assert.equal(api.db.prepare("SELECT COUNT(*) AS n FROM write_log WHERE client = (SELECT client FROM write_log LIMIT 1)").get().n, 5);
  assert.equal((await api('POST', '/messages', message({ requestKey: `${KEY}6` }), me)).status, 429, 'fifth write in the hour closes the window');
  backdate(api.db, 61);
  assert.equal((await api('POST', '/messages', message({ requestKey: `${KEY}6` }), me)).status, 201, 'entries older than an hour are pruned');
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM write_log').get().n, 1);
  assert.equal(api.db.prepare("SELECT COUNT(*) AS n FROM write_log WHERE client LIKE '198.%' OR client LIKE '%.%'").get().n, 0, 'no raw address is stored');
});
