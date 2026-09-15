const PAGE_SIZE = 20;
const TYPES = ['bug', 'question', 'suggestion', 'comment'];
const MESSAGE_COLUMNS = 'm.number, m.type, m.title, m.body, m.nickname, m.version, m.platform, m.state, m.color, m.created_at, m.source';
const MESSAGE_QUERY = `SELECT ${MESSAGE_COLUMNS}, (SELECT COUNT(*) FROM replies r WHERE r.message_number = m.number) AS comments FROM messages m`;

class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}
// Field restrictions. Every value reaches SQL only through bound parameters, so these rules are about
// keeping stored text well-formed: no control characters, single-line where the form is single-line,
// closed lists where the form offers a choice, and the same length caps the form enforces.
const PLATFORMS = ['', 'Windows', 'macOS (Apple Silicon)', 'macOS (Intel)', 'Other'];
const VERSION = /^[0-9A-Za-z][0-9A-Za-z .+_-]{0,39}$/;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/;
const LINE = /[\t\r\n]/;
const FIELDS = {
  message: { type: { max: 20, required: true, list: TYPES }, title: { max: 120, required: true }, details: { max: 6000, required: true, multiline: true }, nickname: { max: 40 }, version: { max: 40, pattern: VERSION }, platform: { max: 40, list: PLATFORMS }, requestKey: { max: 80, required: true, pattern: /^[a-zA-Z0-9-]{16,80}$/ } },
  reply: { details: { max: 6000, required: true, multiline: true }, nickname: { max: 40 }, requestKey: { max: 80, required: true, pattern: /^[a-zA-Z0-9-]{16,80}$/ } },
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
      if (origin && !allowed.includes(origin)) throw new ApiError(403, 'origin');
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
      }
      const url = new URL(request.url);
      if (url.pathname === '/health' && request.method === 'GET') {
        await env.DB.prepare('SELECT number FROM messages LIMIT 1').all();
        return json({ ok: true });
      }
      const replyRoute = url.pathname.match(/^\/messages\/([1-9]\d*)\/replies$/);
      const number = replyRoute ? Number(replyRoute[1]) : null;
      if (number !== null && !Number.isSafeInteger(number)) throw new ApiError(400, 'invalid');
      if (url.pathname !== '/messages' && !replyRoute) throw new ApiError(404, 'notFound');
      if (!['GET', 'POST'].includes(request.method)) throw new ApiError(405, 'method');
      if (replyRoute && !await env.DB.prepare('SELECT number FROM messages WHERE number = ?').bind(number).first()) throw new ApiError(404, 'notFound');
      if (request.method === 'GET') {
        const page = pageNumber(url), offset = (page - 1) * PAGE_SIZE;
        let result;
        if (replyRoute) {
          result = await env.DB.prepare('SELECT id, body, nickname, created_at, source FROM replies WHERE message_number = ? ORDER BY id ASC LIMIT ? OFFSET ?').bind(number, PAGE_SIZE + 1, offset).all();
        } else {
          const state = url.searchParams.get('state') || 'all';
          if (!['all','open','closed'].includes(state)) throw new ApiError(400, 'invalid');
          result = state === 'all'
            ? await env.DB.prepare(`${MESSAGE_QUERY} ORDER BY m.number DESC LIMIT ? OFFSET ?`).bind(PAGE_SIZE + 1, offset).all()
            : await env.DB.prepare(`${MESSAGE_QUERY} WHERE m.state = ? ORDER BY m.number DESC LIMIT ? OFFSET ?`).bind(state, PAGE_SIZE + 1, offset).all();
        }
        return json({ items: result.results.slice(0, PAGE_SIZE), hasNext: result.results.length > PAGE_SIZE });
      }
      // Edge flood shield only; the per-minute and per-hour policy is enforced precisely below.
      if (env.POST_LIMIT && !(await env.POST_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' })).success) throw new ApiError(429, 'limited');
      const data = await jsonBody(request);
      const { requestKey: key, details: body, nickname, title, type, version, platform } = { title: '', type: '', version: '', platform: '', ...restrict(data, replyRoute ? FIELDS.reply : FIELDS.message) };
      const stored = replyRoute
        ? () => env.DB.prepare('SELECT id, message_number, body, nickname, created_at, source FROM replies WHERE request_key = ?').bind(key).first()
        : () => env.DB.prepare(`${MESSAGE_QUERY} WHERE m.request_key = ?`).bind(key).first();
      const matches = row => replyRoute
        ? row.message_number === number && row.body === body && row.nickname === nickname
        : row.title === title && row.body === body && row.nickname === nickname && row.type === type && row.version === version && row.platform === platform;
      // A retry of an already-stored request returns the stored row and never counts as a new write.
      const existing = await stored();
      if (existing) {
        if (!matches(existing)) throw new ApiError(409, 'conflict');
        return json({ item: existing }, 201);
      }
      await recordWrite(request, env);
      if (replyRoute) {
        await env.DB.prepare('INSERT INTO replies (message_number, body, nickname, created_at, request_key) VALUES (?, ?, ?, ?, ?) ON CONFLICT(request_key) DO NOTHING').bind(number, body, nickname, new Date().toISOString(), key).run();
      } else {
        const color = Math.floor(Math.random() * 6);
        await env.DB.prepare('INSERT INTO messages (type, title, body, nickname, version, platform, color, created_at, request_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(request_key) DO NOTHING').bind(type, title, body, nickname, version, platform, color, new Date().toISOString(), key).run();
      }
      const row = await stored();
      if (!matches(row)) throw new ApiError(409, 'conflict');
      return json({ item: row }, 201);
    } catch (error) {
      return json({ error: error instanceof ApiError ? error.message : 'unavailable' }, error instanceof ApiError ? error.status : 503);
    }
  },
};
