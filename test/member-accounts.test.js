const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SERVICE = path.resolve(__dirname, '..', 'services', 'forum');
const ORIGIN = 'https://nortonyuen-oss.github.io';

// Minimal D1 surface (prepare/bind/all/first/run) over the in-process SQLite that ships with Node —
// same harness shape as test/forum-board.test.js, kept as its own copy rather than shared/imported
// (no shared build step between test files in this repo, same as the services themselves).
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

async function worker(env = {}) {
  const { default: handler } = await import('../services/forum/worker.mjs');
  const bindings = { DB: fakeD1(), ALLOWED_ORIGINS: ORIGIN, IP_SALT: 'test-salt', MEMBER_SESSION_SECRET: 'test-member-session-secret', ...env };
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
// Every registration/login in these tests comes from a distinct address unless a test is about the
// member_login_attempts window itself.
let addresses = 0;
function fresh() { return { 'CF-Connecting-IP': `203.0.113.${++addresses % 250}` }; }
function bearer(token) { return { Authorization: `Bearer ${token}` }; }

test('registering creates a member and signs them in immediately', async () => {
  const api = await worker();
  const result = await api('POST', '/members/register', { username: '英秀', password: 'correcthorsebattery' }, fresh());
  assert.equal(result.status, 201);
  assert.equal(result.data.username, '英秀');
  assert.equal(typeof result.data.token, 'string');
  assert.ok(result.data.token.length > 20);
  const me = await api('GET', '/members/me', undefined, bearer(result.data.token));
  assert.equal(me.status, 200);
  assert.equal(me.data.username, '英秀');
  assert.equal(typeof me.data.createdAt, 'string');
});

test('a duplicate username is rejected regardless of case, but distinct usernames are fine', async () => {
  const api = await worker();
  assert.equal((await api('POST', '/members/register', { username: 'Norton', password: 'correcthorsebattery' }, fresh())).status, 201);
  const clash = await api('POST', '/members/register', { username: 'norton', password: 'differentpassword' }, fresh());
  assert.equal(clash.status, 409);
  assert.equal((await api('POST', '/members/register', { username: 'NortonYuen', password: 'correcthorsebattery' }, fresh())).status, 201, 'a different username is unaffected');
});

test('registration validates username shape and password length before touching the database', async () => {
  const api = await worker();
  const reject = async (patch, why) => assert.equal((await api('POST', '/members/register', { username: '英秀', password: 'correcthorsebattery', ...patch }, fresh())).status, 400, why);
  await reject({ username: 'x' }, 'too short');
  await reject({ username: 'x'.repeat(25) }, 'too long');
  await reject({ username: 'has space' }, 'no spaces');
  await reject({ username: 'has/slash' }, 'no punctuation outside _-');
  await reject({ password: 'short1' }, 'password under 8 chars');
  await reject({ password: 'x'.repeat(201) }, 'password absurdly long');
  await reject({ username: '好名', password: 42 }, 'password must be a string');
  const ok = await api('POST', '/members/register', { username: 'under_score-ok', password: 'correcthorsebattery' }, fresh());
  assert.equal(ok.status, 201);
});

test('logging in needs the right password, and returns a token that authenticates /members/me', async () => {
  const api = await worker();
  await api('POST', '/members/register', { username: '思賢', password: 'correcthorsebattery' }, fresh());
  const wrongPassword = await api('POST', '/members/login', { username: '思賢', password: 'nope' }, fresh());
  assert.equal(wrongPassword.status, 401);
  const wrongUsername = await api('POST', '/members/login', { username: 'nobody', password: 'correcthorsebattery' }, fresh());
  assert.equal(wrongUsername.status, 401);
  const loggedIn = await api('POST', '/members/login', { username: '思賢', password: 'correcthorsebattery' }, fresh());
  assert.equal(loggedIn.status, 200);
  assert.equal(loggedIn.data.username, '思賢');
  const me = await api('GET', '/members/me', undefined, bearer(loggedIn.data.token));
  assert.equal(me.data.username, '思賢');
  // Login is case-insensitive on username, same as the uniqueness check at registration.
  const loggedInDifferentCase = await api('POST', '/members/login', { username: '思賢'.toUpperCase(), password: 'correcthorsebattery' }, fresh());
  assert.equal(loggedInDifferentCase.status, 200, 'Chinese has no case, this just exercises the same lowercase path a Latin username would');
});

test('/members/me needs a valid bearer token', async () => {
  const api = await worker();
  assert.equal((await api('GET', '/members/me')).status, 401, 'no token at all');
  assert.equal((await api('GET', '/members/me', undefined, { Authorization: 'Bearer not-a-real-token' })).status, 401);
  const registered = await api('POST', '/members/register', { username: '允行', password: 'correcthorsebattery' }, fresh());
  assert.equal((await api('GET', '/members/me', undefined, { Authorization: `Bearer ${registered.data.token}x` })).status, 401, 'tampered token');
  // A moderator token must not authenticate a member route, and vice versa — they're signed with
  // different secrets and carry different payload shapes ({exp} vs {sub, exp}).
  const { signSessionToken } = await import('../services/forum/lib/admin-auth.mjs');
  const adminToken = await signSessionToken({ SESSION_SECRET: 'unused-in-this-test' });
  assert.equal((await api('GET', '/members/me', undefined, bearer(adminToken))).status, 401);
});

test('member_login_attempts is independent of login_attempts and write_log', async () => {
  const api = await worker();
  const attacker = { 'CF-Connecting-IP': '192.0.2.60' };
  await api('POST', '/members/register', { username: '有容', password: 'correcthorsebattery' }, attacker);
  for (let i = 0; i < 4; i++) assert.equal((await api('POST', '/members/login', { username: '有容', password: 'nope' }, attacker)).status, 401, `attempt ${i}`);
  const sixth = await api('POST', '/members/login', { username: '有容', password: 'correcthorsebattery' }, attacker);
  assert.equal(sixth.status, 429, 'the budget is spent even though this attempt had the right password');
  // The moderator's own login_attempts table is untouched by any of this.
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM login_attempts').get().n, 0);
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM member_login_attempts').get().n, 5);
  // Posting content from the same address is unaffected — member login has its own ledger.
  assert.equal((await api('POST', '/posts', { category: '城中熱話', headline: 'h', body: 'b', nickname: '', requestKey: 'a'.repeat(20) }, attacker)).status, 201);
});
