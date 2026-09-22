const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SERVICE = path.resolve(__dirname, '..', 'services', 'forum');
const ORIGIN = 'https://nortonyuen-oss.github.io';
const KEY = 'a'.repeat(20);
const PASSWORD = 'correct horse battery staple';

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
        async run() { const info = statement.run(...args); return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } }; },
      };
    },
  };
}

// Minimal R2 surface (put/get) over an in-memory Map.
function fakeR2() {
  const store = new Map();
  return {
    async put(key, bytes, options) { store.set(key, { body: bytes, httpMetadata: options?.httpMetadata || {} }); },
    async get(key) { return store.has(key) ? store.get(key) : null; },
    size: () => store.size,
  };
}

async function worker(env = {}) {
  const { default: handler } = await import('../services/forum/worker.mjs');
  const bindings = { DB: fakeD1(), IMAGES: fakeR2(), ALLOWED_ORIGINS: ORIGIN, IP_SALT: 'test-salt', MODERATOR_PASSWORD: PASSWORD, SESSION_SECRET: 'test-session-secret', ...env };
  const api = async (method, route, body, headers = {}) => {
    const isBinary = body instanceof Uint8Array;
    const request = new Request(`https://forum.example${route}`, {
      method, headers: { Origin: ORIGIN, ...(body && !isBinary ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : (isBinary || typeof body === 'string' ? body : JSON.stringify(body)),
    });
    const response = await handler.fetch(request, bindings);
    const contentType = response.headers.get('Content-Type') || '';
    const data = response.status === 204 ? null : contentType.includes('application/json') ? await response.json() : await response.arrayBuffer();
    return { status: response.status, headers: response.headers, data };
  };
  api.db = bindings.DB.raw;
  api.images = bindings.IMAGES;
  return api;
}
// Every write in these tests comes from a distinct address unless a test is about the write windows.
let addresses = 0;
function fresh() { return { 'CF-Connecting-IP': `203.0.113.${++addresses % 250}` }; }
function backdate(db, minutes) { db.prepare("UPDATE write_log SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)").run(`-${minutes} minutes`); }

function post(overrides = {}) {
  return { category: '城中熱話', headline: '存檔 & 載入 #問題', body: '第一行\n<img src=x onerror=alert(1)>', nickname: '市民', requestKey: KEY, ...overrides };
}
async function login(api, headers = fresh()) {
  const result = await api('POST', '/admin/login', { password: PASSWORD }, headers);
  assert.equal(result.status, 200, 'test setup: login must succeed');
  return result.data.token;
}
function bearer(token) { return { Authorization: `Bearer ${token}` }; }
function approveDirect(api, table, id) { api.db.prepare(`UPDATE ${table} SET approved_for_game = 1 WHERE id = ?`).run(id); }

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
  assert.equal(preflight.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Authorization');
});

test('a request with no Origin header (the game client) is never rejected by the allowlist', async () => {
  const api = await worker();
  const response = await api('GET', '/posts', undefined, { Origin: '' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('a post is stored immediately but stays out of the game feed until the moderator approves it', async () => {
  const api = await worker();
  const first = await api('POST', '/posts', post());
  assert.equal(first.status, 201);
  assert.equal(first.data.item.id, 1);
  assert.equal(first.data.item.headline, '存檔 & 載入 #問題');
  assert.equal(first.data.item.request_key, undefined, 'request keys never leave the server');
  assert.deepEqual((await api('GET', '/posts')).data, { items: [], hasNext: false }, 'not approved for the game yet');
  const replay = await api('POST', '/posts', post());
  assert.equal(replay.status, 201);
  assert.equal(replay.data.item.id, 1, 'idempotent replay never double-counts, approved or not');
  const conflict = await api('POST', '/posts', post({ headline: 'changed' }));
  assert.equal(conflict.status, 409);
  approveDirect(api, 'posts', 1);
  const list = await api('GET', '/posts');
  assert.equal(list.data.items.length, 1);
  assert.equal(list.data.items[0].id, 1);
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
  assert.equal(comment.status, 201, 'commenting does not require the parent post to be approved yet');
  assert.equal(tables(), before);
  approveDirect(api, 'posts', 1);
  approveDirect(api, 'comments', comment.data.item.id);
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
  assert.throws(() => api.db.prepare("UPDATE posts SET approved_for_game = 2 WHERE id = 1").run(), /field restriction/);
  assert.throws(() => api.db.prepare("INSERT INTO comments (post_id, body, nickname, created_at, request_key) VALUES (1, '', '', 'now', ?)").run(`${KEY}r`), /field restriction/);
  api.db.prepare("UPDATE posts SET state = 'hidden' WHERE id = 1").run();
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM posts').get().n, 1);
});

test('a hidden post disappears from the public feed even if it was already approved for the game', async () => {
  const api = await worker();
  await api('POST', '/posts', post());
  approveDirect(api, 'posts', 1);
  assert.equal((await api('GET', '/posts')).data.items.length, 1);
  api.db.prepare("UPDATE posts SET state = 'hidden' WHERE id = 1").run();
  assert.deepEqual((await api('GET', '/posts')).data, { items: [], hasNext: false });
  assert.equal((await api('POST', '/posts/1/comments', { body: 'hi', requestKey: `${KEY}r` }, fresh())).status, 404);
  assert.equal((await api('GET', '/posts/1/comments')).status, 404);
});

test('the feed pages 20 at a time, newest first, and filters by category', async () => {
  const api = await worker();
  for (let i = 1; i <= 21; i++) {
    await api('POST', '/posts', post({ headline: `memo ${i}`, requestKey: `${KEY}${i}` }), fresh());
    approveDirect(api, 'posts', i);
  }
  const page1 = await api('GET', '/posts');
  assert.equal(page1.data.items.length, 20);
  assert.equal(page1.data.hasNext, true);
  assert.equal(page1.data.items[0].headline, 'memo 21');
  const page2 = await api('GET', '/posts?page=2');
  assert.deepEqual(page2.data.items.map((item) => item.headline), ['memo 1']);
  assert.equal(page2.data.hasNext, false);
  assert.deepEqual((await api('GET', '/posts?category=交通台')).data, { items: [], hasNext: false });
  assert.equal((await api('GET', '/posts?category=deleted')).status, 400);
  assert.equal((await api('GET', '/posts?page=0')).status, 400);
  assert.equal((await api('GET', '/posts?page=abc')).status, 400);
});

test('comments attach to an existing post, bump its comment count once approved, and are independent of the post\'s own approval', async () => {
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
  approveDirect(api, 'posts', 1);
  assert.deepEqual((await api('GET', '/posts/1/comments')).data, { items: [], hasNext: false }, 'the comment itself is still pending');
  approveDirect(api, 'comments', comment.data.item.id);
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

// ── 宣傳2-零速傳播 (ads) ───────────────────────────────────────────────────────────────

test('ads show on the website wall immediately but need approval to reach the ticker', async () => {
  const api = await worker();
  const posted = await api('POST', '/ads', { adText: '[時代迷你昌] 有平嘢賣', nickname: '街坊', requestKey: KEY });
  assert.equal(posted.status, 201);
  const wall = await api('GET', '/ads');
  assert.equal(wall.data.items.length, 1, 'the website wall shows everything visible, approved or not');
  assert.deepEqual((await api('GET', '/ads?approved=1')).data, { items: [], hasNext: false }, 'the game feed only shows approved ads');
  approveDirect(api, 'ads', posted.data.item.id);
  const approved = await api('GET', '/ads?approved=1');
  assert.equal(approved.data.items.length, 1);
  assert.equal(approved.data.items[0].ad_text, '[時代迷你昌] 有平嘢賣');
});

test('ad text is capped shorter than a forum post body, matching the ticker\'s one-line format', async () => {
  const api = await worker();
  assert.equal((await api('POST', '/ads', { adText: 'x'.repeat(121), nickname: '', requestKey: KEY })).status, 400);
  assert.equal((await api('POST', '/ads', { adText: 'x'.repeat(120), nickname: '', requestKey: KEY })).status, 201);
});

// ── News posts (moderator-authored) + comments ────────────────────────────────────────

test('only a logged-in moderator can publish news; publishing is itself the approval (no queue for the post)', async () => {
  const api = await worker();
  assert.deepEqual((await api('GET', '/news')).data, { items: [], hasNext: false });
  const anonymous = await api('POST', '/admin/news', { headline: '香城地鐵通車', body: '今日正式通車。' });
  assert.equal(anonymous.status, 401);
  const token = await login(api);
  const published = await api('POST', '/admin/news', { headline: '香城地鐵通車', body: '今日正式通車。', imageKey: '' }, bearer(token));
  assert.equal(published.status, 201);
  assert.equal(published.data.item.headline, '香城地鐵通車');
  const listed = await api('GET', '/news');
  assert.equal(listed.data.items.length, 1, 'no separate approval step — writing it published it');
});

test('news comments show on the article immediately but only reach the game feed once approved', async () => {
  const api = await worker();
  const token = await login(api);
  const news = await api('POST', '/admin/news', { headline: '停水通告', body: '維修期間停水。' }, bearer(token));
  const newsId = news.data.item.id;
  const comment = await api('POST', `/news/${newsId}/comments`, { body: '幾時再有水？', nickname: '住戶', requestKey: KEY }, fresh());
  assert.equal(comment.status, 201);
  const thread = await api('GET', `/news/${newsId}/comments`);
  assert.equal(thread.data.items.length, 1, 'visible on the article right away');
  assert.deepEqual((await api('GET', '/news-comments')).data, { items: [], hasNext: false }, 'not yet approved for the game');
  approveDirect(api, 'news_comments', comment.data.item.id);
  const gameFeed = await api('GET', '/news-comments');
  assert.equal(gameFeed.data.items.length, 1);
  assert.equal(gameFeed.data.items[0].news_headline, '停水通告');
  assert.equal(gameFeed.data.items[0].body, '幾時再有水？');
});

test('news comments can only be posted on a visible news post', async () => {
  const api = await worker();
  assert.equal((await api('POST', '/news/999/comments', { body: 'x', requestKey: KEY })).status, 404);
  const token = await login(api);
  const news = await api('POST', '/admin/news', { headline: 'h', body: 'b' }, bearer(token));
  await api('POST', `/admin/news/${news.data.item.id}/hide`, undefined, bearer(token));
  assert.equal((await api('POST', `/news/${news.data.item.id}/comments`, { body: 'x', requestKey: KEY })).status, 404);
});

// ── Uploaded news photos ────────────────────────────────────────────────────────────────

test('image upload requires login, an accepted content type, and a size under the cap', async () => {
  const api = await worker();
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]);
  const anonymous = await api('POST', '/admin/upload', bytes, { 'Content-Type': 'image/jpeg' });
  assert.equal(anonymous.status, 401);
  const token = await login(api);
  const wrongType = await api('POST', '/admin/upload', bytes, { ...bearer(token), 'Content-Type': 'image/gif' });
  assert.equal(wrongType.status, 400);
  const tooBig = await api('POST', '/admin/upload', new Uint8Array(5 * 1024 * 1024 + 1), { ...bearer(token), 'Content-Type': 'image/jpeg' });
  assert.equal(tooBig.status, 413);
  const uploaded = await api('POST', '/admin/upload', bytes, { ...bearer(token), 'Content-Type': 'image/jpeg' });
  assert.equal(uploaded.status, 201);
  assert.match(uploaded.data.key, /^[a-f0-9-]{36}\.jpg$/);
  assert.equal(api.images.size(), 1);
});

test('an uploaded image is served back with a long cache header and referenced from a published news post', async () => {
  const api = await worker();
  const token = await login(api);
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const uploaded = await api('POST', '/admin/upload', bytes, { ...bearer(token), 'Content-Type': 'image/png' });
  const served = await api('GET', `/images/${uploaded.data.key}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('Content-Type'), 'image/png');
  assert.match(served.headers.get('Cache-Control'), /immutable/);
  assert.deepEqual(new Uint8Array(served.data), bytes);
  assert.equal((await api('GET', '/images/does-not-exist.png')).status, 404);
  assert.equal((await api('GET', '/images/../../etc/passwd')).status, 404, 'a non-UUID key is refused before touching R2');
  const news = await api('POST', '/admin/news', { headline: '有相', body: '見附圖', imageKey: uploaded.data.key }, bearer(token));
  assert.equal(news.data.item.image_key, uploaded.data.key);
});

// ── Moderator login ────────────────────────────────────────────────────────────────────

test('login needs the right password and returns a bearer token admin routes accept', async () => {
  const api = await worker();
  const wrong = await api('POST', '/admin/login', { password: 'nope' }, fresh());
  assert.equal(wrong.status, 401);
  const malformed = await api('POST', '/admin/login', { password: 'x', extra: 'y' }, fresh());
  assert.equal(malformed.status, 400);
  const token = await login(api);
  assert.equal(typeof token, 'string');
  assert.ok(token.length > 20);
  assert.equal((await api('GET', '/admin/queue/posts', undefined, bearer(token))).status, 200);
  assert.equal((await api('GET', '/admin/queue/posts')).status, 401, 'no token at all');
  assert.equal((await api('GET', '/admin/queue/posts', undefined, { Authorization: 'Bearer not-a-real-token' })).status, 401);
  assert.equal((await api('GET', '/admin/queue/posts', undefined, { Authorization: `Bearer ${token}x` })).status, 401, 'tampered token');
});

test('five wrong-password attempts in an hour lock out further login tries from that address, independent of content rate limits', async () => {
  const api = await worker();
  const attacker = { 'CF-Connecting-IP': '192.0.2.50' };
  for (let i = 0; i < 5; i++) assert.equal((await api('POST', '/admin/login', { password: 'nope' }, attacker)).status, 401);
  const sixth = await api('POST', '/admin/login', { password: PASSWORD }, attacker);
  assert.equal(sixth.status, 429, 'even the correct password is locked out once the attempt budget is spent');
  // A normal content post from the same address is unaffected — logins have their own budget.
  assert.equal((await api('POST', '/posts', post(), attacker)).status, 201);
});

// ── Moderator queues and approve/hide actions ─────────────────────────────────────────

test('the moderator queue lists pending posts, comments, news comments and ads with context, and approve/hide act on exactly one row', async () => {
  const api = await worker();
  const token = await login(api);
  await api('POST', '/posts', post());
  const comment = await api('POST', '/posts/1/comments', { body: 'c', requestKey: `${KEY}c` }, fresh());
  await api('POST', '/ads', { adText: 'ad', nickname: '', requestKey: `${KEY}d` }, fresh());
  const news = await api('POST', '/admin/news', { headline: 'n', body: 'b' }, bearer(token));
  const newsComment = await api('POST', `/news/${news.data.item.id}/comments`, { body: 'nc', requestKey: `${KEY}e` }, fresh());

  const postsQueue = await api('GET', '/admin/queue/posts', undefined, bearer(token));
  assert.equal(postsQueue.data.items.length, 1);
  const commentsQueue = await api('GET', '/admin/queue/comments', undefined, bearer(token));
  assert.equal(commentsQueue.data.items[0].post_headline, '存檔 & 載入 #問題', 'comment queue carries its parent post headline for context');
  const newsCommentsQueue = await api('GET', '/admin/queue/news-comments', undefined, bearer(token));
  assert.equal(newsCommentsQueue.data.items[0].news_headline, 'n');
  const adsQueue = await api('GET', '/admin/queue/ads', undefined, bearer(token));
  assert.equal(adsQueue.data.items.length, 1);

  assert.equal((await api('POST', '/admin/posts/1/approve', undefined, bearer(token))).status, 200);
  assert.equal((await api('GET', '/posts')).data.items.length, 1);
  assert.deepEqual((await api('GET', '/admin/queue/posts', undefined, bearer(token))).data, { items: [] }, 'approved item leaves the queue');

  assert.equal((await api('POST', `/admin/comments/${comment.data.item.id}/approve`, undefined, bearer(token))).status, 200);
  assert.equal((await api('POST', '/admin/ads/1/hide', undefined, bearer(token))).status, 200);
  assert.deepEqual((await api('GET', '/ads')).data, { items: [], hasNext: false }, 'hidden ad drops off the public wall too');
  assert.equal((await api('POST', '/admin/posts/999/approve', undefined, bearer(token))).status, 404, 'approving a non-existent row 404s');

  assert.equal((await api('POST', `/admin/news-comments/${newsComment.data.item.id}/approve`, undefined, bearer(token))).status, 200);
  assert.equal((await api('GET', '/news-comments')).data.items.length, 1);
});
