const PAGE_SIZE = 20;
const CATEGORIES = ['城市發展', '城中熱話', '交通台', '吹水台'];
const POST_COLUMNS = 'p.id, p.category, p.headline, p.body, p.nickname, p.created_at';
const POST_QUERY = `SELECT ${POST_COLUMNS}, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.state = 'visible') AS comments FROM posts p`;

class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}
// Field restrictions. Every value reaches SQL only through bound parameters, so these rules are about
// keeping stored text well-formed: no control characters, single-line where the form is single-line,
// closed lists where the form offers a choice, and the same length caps the form enforces. Mirrors
// services/feedback/worker.mjs's restrict()/FIELDS pattern.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/;
const LINE = /[\t\r\n]/;
const FIELDS = {
  post: { category: { max: 20, required: true, list: CATEGORIES }, headline: { max: 220, required: true }, body: { max: 1500, required: true, multiline: true }, nickname: { max: 40 }, requestKey: { max: 80, required: true, pattern: /^[a-zA-Z0-9-]{16,80}$/ } },
  comment: { body: { max: 1500, required: true, multiline: true }, nickname: { max: 40 }, requestKey: { max: 80, required: true, pattern: /^[a-zA-Z0-9-]{16,80}$/ } },
};
function restrict(data, shape) {
  for (const key of Object.keys(data)) if (!Object.hasOwn(shape, key)) throw new ApiError(400, 'invalid');
  const out = {};
  for (const [key, rule] of Object.entries(shape)) {
    if (data[key] === undefined && !rule.required) { out[key] = ''; continue; }
    if (typeof data[key] !== 'string') throw new ApiError(400, 'invalid');
    const value = data[key].normalize('NFC').replace(/\r\n?/g, '\n').trim();
    if ((rule.required && !value) || value.length > rule.max || CONTROL.test(value)) throw new ApiError(400, 'invalid');
    if (!rule.multiline && LINE.test(value)) throw new ApiError(400, 'invalid');
    if (rule.list && !rule.list.includes(value)) throw new ApiError(400, 'invalid');
    if (rule.pattern && value && !rule.pattern.test(value)) throw new ApiError(400, 'invalid');
    out[key] = value;
  }
  return out;
}
async function jsonBody(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new ApiError(415, 'invalid');
  // Bound the stream as well as Content-Length: clients may omit the header.
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'invalid');
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32768) { await reader.cancel(); throw new ApiError(413, 'tooLong'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const result = JSON.parse(new TextDecoder().decode(bytes));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch { throw new ApiError(400, 'invalid'); }
}
async function clientId(request, env) {
  // Only a salted hash of the address is ever stored, and only for the length of the hour window.
  const bytes = new TextEncoder().encode(`${env.IP_SALT || ''}|${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function recordWrite(request, env) {
  const now = Date.now();
  const hourAgo = new Date(now - 3600e3).toISOString(), minuteAgo = new Date(now - 60e3).toISOString();
  const client = await clientId(request, env);
  await env.DB.prepare('DELETE FROM write_log WHERE created_at < ?').bind(hourAgo).run();
  const usage = await env.DB.prepare('SELECT COUNT(*) AS hour, SUM(created_at > ?) AS minute FROM write_log WHERE client = ? AND created_at > ?').bind(minuteAgo, client, hourAgo).first();
  if (Number(usage.minute) >= Number(env.WRITES_PER_MINUTE || 1) || Number(usage.hour) >= Number(env.WRITES_PER_HOUR || 5)) throw new ApiError(429, 'limited');
  await env.DB.prepare('INSERT INTO write_log (client, created_at) VALUES (?, ?)').bind(client, new Date(now).toISOString()).run();
}
function pageNumber(url) {
  const value = url.searchParams.get('page') || '1';
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 10000) throw new ApiError(400, 'invalid');
  return Number(value);
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin' };
    if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    try {
      // Requests with no Origin header (the game's own Electron main-process fetch, curl, moderate.mjs)
      // are never rejected here — CORS is a browser-only mechanism. Only a browser request from a
      // disallowed origin is refused, matching services/feedback/worker.mjs's posture.
      if (origin && !allowed.includes(origin)) throw new ApiError(403, 'origin');
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
      }
      const url = new URL(request.url);
      if (url.pathname === '/health' && request.method === 'GET') {
        await env.DB.prepare('SELECT id FROM posts LIMIT 1').all();
        return json({ ok: true });
      }
      const commentRoute = url.pathname.match(/^\/posts\/([1-9]\d*)\/comments$/);
      const postId = commentRoute ? Number(commentRoute[1]) : null;
      if (postId !== null && !Number.isSafeInteger(postId)) throw new ApiError(400, 'invalid');
      if (url.pathname !== '/posts' && !commentRoute) throw new ApiError(404, 'notFound');
      if (!['GET', 'POST'].includes(request.method)) throw new ApiError(405, 'method');
      // Comments only ever attach to a post that is itself publicly visible.
      if (commentRoute && !await env.DB.prepare("SELECT id FROM posts WHERE id = ? AND state = 'visible'").bind(postId).first()) throw new ApiError(404, 'notFound');
      if (request.method === 'GET') {
        const page = pageNumber(url), offset = (page - 1) * PAGE_SIZE;
        let result;
        if (commentRoute) {
          result = await env.DB.prepare("SELECT id, body, nickname, created_at FROM comments WHERE post_id = ? AND state = 'visible' ORDER BY id ASC LIMIT ? OFFSET ?").bind(postId, PAGE_SIZE + 1, offset).all();
        } else {
          const category = url.searchParams.get('category') || 'all';
          if (category !== 'all' && !CATEGORIES.includes(category)) throw new ApiError(400, 'invalid');
          // Only ever the public, moderator-approved feed: hidden posts never reach this route.
          result = category === 'all'
            ? await env.DB.prepare(`${POST_QUERY} WHERE p.state = 'visible' ORDER BY p.id DESC LIMIT ? OFFSET ?`).bind(PAGE_SIZE + 1, offset).all()
            : await env.DB.prepare(`${POST_QUERY} WHERE p.state = 'visible' AND p.category = ? ORDER BY p.id DESC LIMIT ? OFFSET ?`).bind(category, PAGE_SIZE + 1, offset).all();
        }
        return json({ items: result.results.slice(0, PAGE_SIZE), hasNext: result.results.length > PAGE_SIZE });
      }
      // Edge flood shield only; the per-minute and per-hour policy is enforced precisely below.
      if (env.POST_LIMIT && !(await env.POST_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' })).success) throw new ApiError(429, 'limited');
      const data = await jsonBody(request);
      const { requestKey: key, body, nickname, category, headline } = { category: '', headline: '', ...restrict(data, commentRoute ? FIELDS.comment : FIELDS.post) };
      const stored = commentRoute
        ? () => env.DB.prepare('SELECT id, post_id, body, nickname, created_at FROM comments WHERE request_key = ?').bind(key).first()
        : () => env.DB.prepare(`${POST_QUERY} WHERE p.request_key = ?`).bind(key).first();
      const matches = row => commentRoute
        ? row.post_id === postId && row.body === body && row.nickname === nickname
        : row.category === category && row.headline === headline && row.body === body && row.nickname === nickname;
      // A retry of an already-stored request returns the stored row and never counts as a new write.
      const existing = await stored();
      if (existing) {
        if (!matches(existing)) throw new ApiError(409, 'conflict');
        return json({ item: existing }, 201);
      }
      await recordWrite(request, env);
      if (commentRoute) {
        await env.DB.prepare('INSERT INTO comments (post_id, body, nickname, created_at, request_key) VALUES (?, ?, ?, ?, ?) ON CONFLICT(request_key) DO NOTHING').bind(postId, body, nickname, new Date().toISOString(), key).run();
      } else {
        await env.DB.prepare('INSERT INTO posts (category, headline, body, nickname, created_at, request_key) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(request_key) DO NOTHING').bind(category, headline, body, nickname, new Date().toISOString(), key).run();
      }
      const row = await stored();
      if (!matches(row)) throw new ApiError(409, 'conflict');
      return json({ item: row }, 201);
    } catch (error) {
      return json({ error: error instanceof ApiError ? error.message : 'unavailable' }, error instanceof ApiError ? error.status : 503);
    }
  },
};
