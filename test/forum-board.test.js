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

// Minimal R2 surface (put/get/delete) over an in-memory Map.
function fakeR2() {
  const store = new Map();
  return {
    async put(key, bytes, options) { store.set(key, { body: bytes, httpMetadata: options?.httpMetadata || {} }); },
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async delete(key) { store.delete(key); },
    size: () => store.size,
  };
}

async function worker(env = {}) {
  const { default: handler } = await import('../services/forum/worker.mjs');
  const bindings = { DB: fakeD1(), IMAGES: fakeR2(), ALLOWED_ORIGINS: ORIGIN, IP_SALT: 'test-salt', MODERATOR_PASSWORD: PASSWORD, SESSION_SECRET: 'test-session-secret', MEMBER_SESSION_SECRET: 'test-member-session-secret', ...env };
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
  return { category: '城中熱話', headline: '存檔 & 載入 #問題', body: '第一行\n<img src=x onerror=alert(1)>', requestKey: KEY, ...overrides };
}
// Named newsPayload, not news, because most call sites bind their own `const news = await api(...)`
// result right after calling this — same name would shadow the helper before its own initializer runs.
function newsPayload(overrides = {}) {
  return { headline: '香城地鐵通車', body: '今日正式通車。', imageKey: '', category: '城中熱話', ...overrides };
}
async function login(api, headers = fresh()) {
  const result = await api('POST', '/admin/login', { password: PASSWORD }, headers);
  assert.equal(result.status, 200, 'test setup: login must succeed');
  return result.data.token;
}
function bearer(token) { return { Authorization: `Bearer ${token}` }; }
// 留言權: every write route now needs a member token — this registers a fresh member (on its own
// address, so it never eats into the caller's own write_log/member_login_attempts budget unless the
// same headers are reused on purpose) and returns ready-to-spread Authorization headers.
async function member(api, headers = fresh()) {
  const username = `m${Math.random().toString(36).slice(2, 10)}`;
  const result = await api('POST', '/members/register', { username, password: 'correcthorsebattery' }, headers);
  assert.equal(result.status, 201, 'test setup: member registration must succeed');
  return { username, token: result.data.token, headers: bearer(result.data.token) };
}
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

// ── 留言權: every write route requires a member token ─────────────────────────────────

test('posting, commenting, reacting and submitting an ad all require a member token; browsing never does', async () => {
  const api = await worker();
  assert.equal((await api('POST', '/posts', post())).status, 401, 'posting with no token');
  assert.equal((await api('POST', '/posts', post(), { Authorization: 'Bearer not-a-real-token' })).status, 401, 'tampered/fake token');
  const { headers: auth } = await member(api);
  const posted = await api('POST', '/posts', post(), auth);
  assert.equal(posted.status, 201);
  assert.equal((await api('POST', `/posts/${posted.data.item.id}/comments`, { body: 'hi', requestKey: `${KEY}r` })).status, 401, 'commenting with no token');
  assert.equal((await api('POST', `/posts/${posted.data.item.id}/react`, { reaction: 'like' })).status, 401, 'reacting with no token');
  assert.equal((await api('POST', '/ads', { adText: 'ad', requestKey: `${KEY}d` })).status, 401, 'ad submission with no token');
  // Reading is never gated.
  assert.equal((await api('GET', '/posts')).status, 200);
  assert.equal((await api('GET', `/posts/${posted.data.item.id}/comments`)).status, 200);
  assert.equal((await api('GET', '/ads')).status, 200);
});

test('a member\'s post/comment/ad always displays their fixed username, never a free-text nickname', async () => {
  const api = await worker();
  const { headers: auth, username } = await member(api);
  const posted = await api('POST', '/posts', post(), auth);
  assert.equal(posted.status, 201);
  assert.equal(posted.data.item.nickname, username);
  assert.equal(posted.data.item.isGuest, false);
  const comment = await api('POST', `/posts/${posted.data.item.id}/comments`, { body: 'hi', requestKey: `${KEY}r` }, { ...fresh(), ...auth });
  assert.equal(comment.data.item.nickname, username);
  assert.equal(comment.data.item.isGuest, false);
  const ad = await api('POST', '/ads', { adText: 'ad', requestKey: `${KEY}d` }, { ...fresh(), ...auth });
  assert.equal(ad.data.item.nickname, username);
  assert.equal(ad.data.item.isGuest, false);
  // Sending a nickname field at all is now an unknown-key rejection, same as any other stray field.
  assert.equal((await api('POST', '/posts', post({ nickname: 'x', requestKey: `${KEY}n` }), auth)).status, 400);
});

test('a guest/legacy row (posted before 留言權, member_id NULL) keeps its original nickname and is tagged isGuest', async () => {
  const api = await worker();
  api.db.prepare('INSERT INTO posts (category, headline, body, nickname, created_at, request_key) VALUES (?, ?, ?, ?, ?, ?)')
    .run('城中熱話', '舊街坊貼文', 'b', '油尖旺 金毛玲', 'now', KEY);
  api.db.prepare('INSERT INTO posts (category, headline, body, nickname, created_at, request_key) VALUES (?, ?, ?, ?, ?, ?)')
    .run('城中熱話', '冇名嘅舊貼文', 'b', '', 'now', `${KEY}2`);
  const list = (await api('GET', '/posts')).data.items;
  const named = list.find((item) => item.headline === '舊街坊貼文');
  const unnamed = list.find((item) => item.headline === '冇名嘅舊貼文');
  assert.equal(named.isGuest, true);
  assert.equal(named.nickname, '油尖旺 金毛玲', 'an existing guest nickname is preserved as-is');
  assert.equal(unnamed.isGuest, true);
  assert.equal(unnamed.nickname, '訪客', 'a blank legacy nickname falls back to a guest label');
});

test('a post shows on the website discussion board immediately but stays out of the game feed until the moderator approves it', async () => {
  const api = await worker();
  const { headers: auth } = await member(api);
  const first = await api('POST', '/posts', post(), auth);
  assert.equal(first.status, 201);
  assert.equal(first.data.item.id, 1);
  assert.equal(first.data.item.headline, '存檔 & 載入 #問題');
  assert.equal(first.data.item.request_key, undefined, 'request keys never leave the server');
  const wall = await api('GET', '/posts');
  assert.equal(wall.data.items.length, 1, 'the website board shows a post immediately, so the author sees their own post');
  assert.deepEqual((await api('GET', '/posts?approved=1')).data, { items: [], hasNext: false }, 'the game feed only shows approved posts');
  const replay = await api('POST', '/posts', post(), auth);
  assert.equal(replay.status, 201);
  assert.equal(replay.data.item.id, 1, 'idempotent replay never double-counts, approved or not');
  const conflict = await api('POST', '/posts', post({ headline: 'changed' }), auth);
  assert.equal(conflict.status, 409);
  approveDirect(api, 'posts', 1);
  const list = await api('GET', '/posts?approved=1');
  assert.equal(list.data.items.length, 1);
  assert.equal(list.data.items[0].id, 1);
});

test('malformed posts are rejected before they reach the database', async () => {
  const api = await worker();
  const { headers: auth } = await member(api);
  const submit = (overrides) => api('POST', '/posts', post(overrides), auth);
  assert.equal((await submit({ category: '未知台' })).status, 400);
  assert.equal((await submit({ headline: '   ' })).status, 400);
  assert.equal((await submit({ body: 'x'.repeat(1501) })).status, 400);
  assert.equal((await submit({ requestKey: 'short' })).status, 400);
  assert.equal((await api('POST', '/posts', '[1,2]', auth)).status, 400);
  assert.equal((await api('POST', '/posts', 'not json', auth)).status, 400);
  assert.equal((await api('POST', '/posts', 'x', { ...auth, 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await submit({ body: 'x'.repeat(40000) })).status, 413);
  assert.deepEqual((await api('GET', '/posts')).data, { items: [], hasNext: false });
});

test('SQL and HTML payloads in every field are stored inert as text and never executed', async () => {
  const api = await worker();
  const { headers: auth, username } = await member(api);
  const attack = "x'; DROP TABLE posts; --";
  const tables = () => api.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get().n;
  const before = tables();
  const posted = await api('POST', '/posts', post({ headline: attack, body: `${attack}\n<script>alert(1)</script>\n" OR 1=1 --` }), auth);
  assert.equal(posted.status, 201);
  assert.equal(posted.data.item.headline, attack);
  assert.equal(posted.data.item.nickname, username);
  const comment = await api('POST', '/posts/1/comments', { body: "'); DROP TABLE comments; --", requestKey: `${KEY}r` }, { ...fresh(), ...auth });
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
  const { headers: auth } = await member(api);
  const reject = async (patch, why) => assert.equal((await api('POST', '/posts', post(patch), { ...fresh(), ...auth })).status, 400, why);
  await reject({ category: '吹水台; DROP' }, 'category is exact-match against the closed list');
  await reject({ headline: 'line one\nline two' }, 'headline is single-line');
  await reject({ headline: 'null\u0000byte' }, 'no NUL');
  await reject({ body: 'esc\u001b[31m' }, 'no C0 control characters');
  await reject({ body: 'sep line' }, 'no unicode line separators');
  await reject({ body: 'x', extra: 'field' }, 'unknown keys are refused');
  await reject({ __proto__: { polluted: true }, ['__proto__']: 'x' }, 'prototype keys are refused');
  const ok = await api('POST', '/posts', post({ body: 'crlf\r\nlines\ttabbed' }), { ...fresh(), ...auth });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.item.body, 'crlf\nlines\ttabbed', 'CRLF is normalised to LF; tabs stay in the body');
  const comment = await api('POST', '/posts/1/comments', { body: 'ok', requestKey: `${KEY}r`, headline: 'not a comment field' }, { ...fresh(), ...auth });
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
  const { headers: auth } = await member(api);
  await api('POST', '/posts', post(), auth);
  approveDirect(api, 'posts', 1);
  assert.equal((await api('GET', '/posts')).data.items.length, 1);
  api.db.prepare("UPDATE posts SET state = 'hidden' WHERE id = 1").run();
  assert.deepEqual((await api('GET', '/posts')).data, { items: [], hasNext: false });
  assert.equal((await api('POST', '/posts/1/comments', { body: 'hi', requestKey: `${KEY}r` }, { ...fresh(), ...auth })).status, 404);
  assert.equal((await api('GET', '/posts/1/comments')).status, 404);
});

test('the feed pages 20 at a time, newest first, and filters by category', async () => {
  const api = await worker();
  const { headers: auth } = await member(api);
  for (let i = 1; i <= 21; i++) {
    await api('POST', '/posts', post({ headline: `memo ${i}`, requestKey: `${KEY}${i}` }), { ...fresh(), ...auth });
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

test('the ?approved=1 game feed paginates and filters the same way, over only the approved subset', async () => {
  const api = await worker();
  const { headers: auth } = await member(api);
  for (let i = 1; i <= 21; i++) {
    await api('POST', '/posts', post({ headline: `memo ${i}`, requestKey: `${KEY}${i}` }), { ...fresh(), ...auth });
    if (i !== 5) approveDirect(api, 'posts', i);
  }
  assert.equal((await api('GET', '/posts')).data.items.length, 20, 'the website board still shows every visible post, approved or not');
  const approved = await api('GET', '/posts?approved=1');
  assert.equal(approved.data.items.length, 20, '20 of the 21 are approved');
  assert.ok(!approved.data.items.some((item) => item.headline === 'memo 5'), 'the one unapproved post is excluded');
  const approvedPage2 = await api('GET', '/posts?approved=1&page=2');
  assert.equal(approvedPage2.data.items.length, 0, 'only 20 approved rows exist, so page 2 is empty');
  assert.deepEqual((await api('GET', '/posts?approved=1&category=交通台')).data, { items: [], hasNext: false });
});

test('comments attach to an existing post, bump its comment count once approved, and are independent of the post\'s own approval', async () => {
  const api = await worker();
  const { headers: auth } = await member(api);
  await api('POST', '/posts', post(), auth);
  const missing = await api('POST', '/posts/999/comments', { body: 'hello', requestKey: `${KEY}r` }, { ...fresh(), ...auth });
  assert.equal(missing.status, 404);
  const comment = await api('POST', '/posts/1/comments', { body: ' 回覆 ', requestKey: `${KEY}r` }, { ...fresh(), ...auth });
  assert.equal(comment.status, 201);
  assert.equal(comment.data.item.body, '回覆');
  assert.equal(comment.data.item.post_id, 1);
  const replay = await api('POST', '/posts/1/comments', { body: '回覆', requestKey: `${KEY}r` }, auth);
  assert.equal(replay.data.item.id, comment.data.item.id);
  assert.equal((await api('POST', '/posts/1/comments', { body: 'other', requestKey: `${KEY}r` }, auth)).status, 409);
  const websiteThread = await api('GET', '/posts/1/comments');
  assert.equal(websiteThread.data.items.length, 1, 'the website thread shows the comment immediately');
  assert.deepEqual((await api('GET', '/posts/1/comments?approved=1')).data, { items: [], hasNext: false }, 'the comment itself is still pending for the game feed');
  approveDirect(api, 'posts', 1);
  approveDirect(api, 'comments', comment.data.item.id);
  const gameThread = await api('GET', '/posts/1/comments?approved=1');
  assert.equal(gameThread.data.items.length, 1);
  assert.equal((await api('GET', '/posts')).data.items[0].comments, 1);
  assert.equal((await api('GET', '/posts/999/comments')).status, 404);
});

test('the edge flood shield refuses writes before the body is read', async () => {
  const seen = [];
  const api = await worker({ POST_LIMIT: { async limit({ key }) { seen.push(key); return { success: seen.length > 1 }; } } });
  const { headers: auth } = await member(api);
  const limited = await api('POST', '/posts', post(), { ...auth, 'CF-Connecting-IP': '203.0.113.9' });
  assert.equal(limited.status, 429);
  assert.equal(limited.data.error, 'limited');
  assert.equal((await api('POST', '/posts', post(), auth)).status, 201);
  assert.equal((await api('GET', '/posts')).status, 200, 'reads are never rate limited');
  assert.deepEqual(seen, ['203.0.113.9', 'unknown']);
});

test('one address may write once a minute and five times an hour; retries of a stored request are free', async () => {
  const api = await worker();
  const me = { 'CF-Connecting-IP': '198.51.100.7' }, other = { 'CF-Connecting-IP': '198.51.100.8' };
  const { headers: authMe } = await member(api, me);
  const { headers: authOther } = await member(api, other);
  assert.equal((await api('POST', '/posts', post(), { ...me, ...authMe })).status, 201);
  const second = await api('POST', '/posts', post({ requestKey: `${KEY}2` }), { ...me, ...authMe });
  assert.equal(second.status, 429);
  assert.equal(second.data.error, 'limited');
  assert.equal((await api('POST', '/posts', post(), { ...me, ...authMe })).status, 201, 'same request key replays without counting');
  assert.equal((await api('POST', '/posts/1/comments', { body: 'hi', requestKey: `${KEY}r` }, { ...me, ...authMe })).status, 429, 'comments share the window');
  assert.equal((await api('POST', '/posts', post({ requestKey: `${KEY}o` }), { ...other, ...authOther })).status, 201, 'another address is unaffected');
  backdate(api.db, 2);
  assert.equal((await api('POST', '/posts', post({ requestKey: `${KEY}2` }), { ...me, ...authMe })).status, 201);
  backdate(api.db, 2);
  assert.equal((await api('POST', '/posts/1/comments', { body: 'hi', requestKey: `${KEY}r` }, { ...me, ...authMe })).status, 201);
  backdate(api.db, 2);
  assert.equal((await api('POST', '/posts', post({ requestKey: `${KEY}4` }), { ...me, ...authMe })).status, 201);
  backdate(api.db, 2);
  assert.equal((await api('POST', '/posts', post({ requestKey: `${KEY}5` }), { ...me, ...authMe })).status, 201);
  backdate(api.db, 2);
  assert.equal(api.db.prepare("SELECT COUNT(*) AS n FROM write_log WHERE client = (SELECT client FROM write_log LIMIT 1)").get().n, 5);
  assert.equal((await api('POST', '/posts', post({ requestKey: `${KEY}6` }), { ...me, ...authMe })).status, 429, 'sixth write in the hour closes the window');
  backdate(api.db, 61);
  assert.equal((await api('POST', '/posts', post({ requestKey: `${KEY}6` }), { ...me, ...authMe })).status, 201, 'entries older than an hour are pruned');
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM write_log').get().n, 1);
  assert.equal(api.db.prepare("SELECT COUNT(*) AS n FROM write_log WHERE client LIKE '198.%' OR client LIKE '%.%'").get().n, 0, 'no raw address is stored');
});

// ── 宣傳2-零速傳播 (ads) ───────────────────────────────────────────────────────────────

test('ads show on the website wall immediately but need approval to reach the ticker', async () => {
  const api = await worker();
  const { headers: auth, username } = await member(api);
  const posted = await api('POST', '/ads', { adText: '[時代迷你昌] 有平嘢賣', requestKey: KEY }, auth);
  assert.equal(posted.status, 201);
  assert.equal(posted.data.item.nickname, username);
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
  const { headers: auth } = await member(api);
  assert.equal((await api('POST', '/ads', { adText: 'x'.repeat(121), requestKey: KEY }, auth)).status, 400);
  assert.equal((await api('POST', '/ads', { adText: 'x'.repeat(120), requestKey: KEY }, auth)).status, 201);
});

// ── News posts (moderator-authored) + comments ────────────────────────────────────────

test('only a logged-in moderator can publish news; publishing is itself the approval (no queue for the post)', async () => {
  const api = await worker();
  assert.deepEqual((await api('GET', '/news')).data, { items: [], hasNext: false });
  const anonymous = await api('POST', '/admin/news', newsPayload());
  assert.equal(anonymous.status, 401);
  const token = await login(api);
  const published = await api('POST', '/admin/news', newsPayload(), bearer(token));
  assert.equal(published.status, 201);
  assert.equal(published.data.item.headline, '香城地鐵通車');
  assert.equal(published.data.item.category, '城中熱話');
  const listed = await api('GET', '/news');
  assert.equal(listed.data.items.length, 1, 'no separate approval step — writing it published it');
  assert.equal((await api('POST', '/admin/news', { headline: 'h', body: 'b', imageKey: '' }, bearer(token))).status, 400, 'category is required');
});

test('news articles filter by category the same way posts do, for the unified discussion-board tabs', async () => {
  const api = await worker();
  const token = await login(api);
  await api('POST', '/admin/news', newsPayload({ headline: '交通消息', category: '交通台' }), bearer(token));
  await api('POST', '/admin/news', newsPayload({ headline: '吹水一下', category: '吹水台' }), bearer(token));
  assert.equal((await api('GET', '/news')).data.items.length, 2, 'no category param returns everything');
  const transport = await api('GET', '/news?category=交通台');
  assert.equal(transport.data.items.length, 1);
  assert.equal(transport.data.items[0].headline, '交通消息');
  assert.deepEqual((await api('GET', '/news?category=城市發展')).data, { items: [], hasNext: false });
  assert.equal((await api('GET', '/news?category=deleted')).status, 400);
});

test('news comments show on the article immediately but only reach the game feed once approved', async () => {
  const api = await worker();
  const token = await login(api);
  const { headers: auth } = await member(api);
  const news = await api('POST', '/admin/news', newsPayload({ headline: '停水通告', body: '維修期間停水。' }), bearer(token));
  const newsId = news.data.item.id;
  const comment = await api('POST', `/news/${newsId}/comments`, { body: '幾時再有水？', requestKey: KEY }, auth);
  assert.equal(comment.status, 201);
  const thread = await api('GET', `/news/${newsId}/comments`);
  assert.equal(thread.data.items.length, 1, 'visible on the article right away');
  assert.deepEqual((await api('GET', '/news-comments')).data, { items: [], hasNext: false }, 'not yet approved for the game');
  approveDirect(api, 'news_comments', comment.data.item.id);
  const gameFeed = await api('GET', '/news-comments');
  assert.equal(gameFeed.data.items.length, 1);
  assert.equal(gameFeed.data.items[0].news_headline, '停水通告');
  assert.equal(gameFeed.data.items[0].body, '幾時再有水？');
  assert.equal(gameFeed.data.items[0].news_post_id, newsId, 'lets the game attach the comment to its article post, not just quote the headline');
});

test('news comments can only be posted on a visible news post', async () => {
  const api = await worker();
  const { headers: auth } = await member(api);
  assert.equal((await api('POST', '/news/999/comments', { body: 'x', requestKey: KEY }, auth)).status, 404);
  const token = await login(api);
  const news = await api('POST', '/admin/news', newsPayload({ headline: 'h', body: 'b' }), bearer(token));
  await api('POST', `/admin/news/${news.data.item.id}/hide`, undefined, bearer(token));
  assert.equal((await api('POST', `/news/${news.data.item.id}/comments`, { body: 'x', requestKey: KEY }, auth)).status, 404);
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
  const news = await api('POST', '/admin/news', newsPayload({ headline: '有相', body: '見附圖', imageKey: uploaded.data.key }), bearer(token));
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
  const { headers: auth } = await member(api, fresh());
  assert.equal((await api('POST', '/posts', post(), { ...attacker, ...auth })).status, 201);
});

// ── Moderator queues and approve/hide actions ─────────────────────────────────────────

test('the moderator queue lists pending posts, comments, news comments and ads with context, and approve/hide act on exactly one row', async () => {
  const api = await worker();
  const token = await login(api);
  const { headers: auth, username } = await member(api);
  await api('POST', '/posts', post(), auth);
  const comment = await api('POST', '/posts/1/comments', { body: 'c', requestKey: `${KEY}c` }, { ...fresh(), ...auth });
  await api('POST', '/ads', { adText: 'ad', requestKey: `${KEY}d` }, { ...fresh(), ...auth });
  const news = await api('POST', '/admin/news', newsPayload({ headline: 'n', body: 'b' }), bearer(token));
  const newsComment = await api('POST', `/news/${news.data.item.id}/comments`, { body: 'nc', requestKey: `${KEY}e` }, { ...fresh(), ...auth });

  const postsQueue = await api('GET', '/admin/queue/posts', undefined, bearer(token));
  assert.equal(postsQueue.data.items.length, 1);
  assert.equal(postsQueue.data.items[0].nickname, username, 'the queue resolves the poster\'s username, not a raw member_id');
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

// ── Emoji reactions ────────────────────────────────────────────────────────────────────

test('reacting to a post increments exactly the matching counter and returns the fresh totals', async () => {
  const api = await worker();
  const { headers: auth } = await member(api);
  await api('POST', '/posts', post(), auth);
  const like = await api('POST', '/posts/1/react', { reaction: 'like' }, { ...fresh(), ...auth });
  assert.equal(like.status, 200);
  assert.deepEqual(like.data.item, { id: 1, likes: 1, laughs: 0, angry: 0, shares: 0, clowns: 0 });
  await api('POST', '/posts/1/react', { reaction: 'clown' }, { ...fresh(), ...auth });
  const clown = await api('POST', '/posts/1/react', { reaction: 'clown' }, { ...fresh(), ...auth });
  assert.deepEqual(clown.data.item, { id: 1, likes: 1, laughs: 0, angry: 0, shares: 0, clowns: 2 });
  // The counts ride along on the ordinary list/detail queries, no separate fetch needed.
  assert.equal((await api('GET', '/posts')).data.items[0].clowns, 2);
});

test('reacting rejects an unknown reaction name and 404s on a missing or hidden post', async () => {
  const api = await worker();
  const { headers: auth } = await member(api);
  await api('POST', '/posts', post(), auth);
  assert.equal((await api('POST', '/posts/1/react', { reaction: 'sad' }, { ...fresh(), ...auth })).status, 400);
  assert.equal((await api('POST', '/posts/1/react', { reaction: 'like', extra: 1 }, { ...fresh(), ...auth })).status, 400);
  assert.equal((await api('POST', '/posts/999/react', { reaction: 'like' }, { ...fresh(), ...auth })).status, 404);
  api.db.prepare("UPDATE posts SET state = 'hidden' WHERE id = 1").run();
  assert.equal((await api('POST', '/posts/1/react', { reaction: 'like' }, { ...fresh(), ...auth })).status, 404, 'a hidden post cannot be reacted to');
});

test('reacting to a news article works the same way as a post, independent of its own approval status', async () => {
  const api = await worker();
  const token = await login(api);
  const { headers: auth } = await member(api);
  const article = await api('POST', '/admin/news', newsPayload(), bearer(token));
  const angry = await api('POST', `/news/${article.data.item.id}/react`, { reaction: 'angry' }, auth);
  assert.equal(angry.status, 200);
  assert.equal(angry.data.item.angry, 1);
  assert.equal((await api('GET', '/news')).data.items[0].angry, 1);
  assert.equal((await api('POST', `/news/999/react`, { reaction: 'angry' }, auth)).status, 404);
});

test('reactions draw from their own loose budget, independent of the strict write_log used for text content', async () => {
  const api = await worker({ REACTIONS_PER_MINUTE: '2', REACTIONS_PER_HOUR: '10' });
  const me = { 'CF-Connecting-IP': '203.0.113.200' };
  const { headers: auth } = await member(api, me);
  await api('POST', '/posts', post(), { ...fresh(), ...auth });
  assert.equal((await api('POST', '/posts/1/react', { reaction: 'like' }, { ...me, ...auth })).status, 200);
  assert.equal((await api('POST', '/posts/1/react', { reaction: 'laugh' }, { ...me, ...auth })).status, 200);
  const third = await api('POST', '/posts/1/react', { reaction: 'angry' }, { ...me, ...auth });
  assert.equal(third.status, 429, 'reaction_log has its own per-minute budget, separate from write_log');
  // Posting text from the same address is unaffected — reacting never touches write_log's budget.
  assert.equal((await api('POST', '/posts', post({ requestKey: `${KEY}z` }), { ...me, ...auth })).status, 201);
  assert.equal(api.db.prepare("SELECT COUNT(*) AS n FROM write_log WHERE client = (SELECT client FROM reaction_log LIMIT 1)").get().n, 1, "me's own write_log entry: only the one text post, no reaction rows leaked in");
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM reaction_log').get().n, 2, 'the two successful reactions, not the rejected third');
});
