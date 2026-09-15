const PAGE_SIZE = 20;
const TYPES = ['bug', 'question', 'suggestion', 'comment'];
const MESSAGE_COLUMNS = 'm.number, m.type, m.title, m.body, m.nickname, m.version, m.platform, m.state, m.color, m.created_at, m.source';
const MESSAGE_QUERY = `SELECT ${MESSAGE_COLUMNS}, (SELECT COUNT(*) FROM replies r WHERE r.message_number = m.number) AS comments FROM messages m`;

class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}
function field(data, key, max, required = false) {
  if (data[key] === undefined && !required) return '';
  if (typeof data[key] !== 'string') throw new ApiError(400, 'invalid');
  const value = data[key].trim();
  if ((required && !value) || value.length > max) throw new ApiError(400, 'invalid');
  return value;
}
function requestKey(data) {
  if (typeof data.requestKey !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(data.requestKey)) throw new ApiError(400, 'invalid');
  return data.requestKey;
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
      // Anonymous writes are capped per client IP; the binding is optional so `wrangler dev` and tests run without it.
      if (env.POST_LIMIT) {
        const { success } = await env.POST_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
        if (!success) throw new ApiError(429, 'limited');
      }
      const data = await jsonBody(request);
      const key = requestKey(data), body = field(data, 'details', 6000, true), nickname = field(data, 'nickname', 40);
      if (replyRoute) {
        await env.DB.prepare('INSERT INTO replies (message_number, body, nickname, created_at, request_key) VALUES (?, ?, ?, ?, ?) ON CONFLICT(request_key) DO NOTHING').bind(number, body, nickname, new Date().toISOString(), key).run();
        const row = await env.DB.prepare('SELECT id, message_number, body, nickname, created_at, source FROM replies WHERE request_key = ?').bind(key).first();
        if (row.message_number !== number || row.body !== body || row.nickname !== nickname) throw new ApiError(409, 'conflict');
        return json({ item: row }, 201);
      }
      const title = field(data, 'title', 120, true), type = field(data, 'type', 20, true);
      const version = field(data, 'version', 40), platform = field(data, 'platform', 80);
      if (!TYPES.includes(type)) throw new ApiError(400, 'invalid');
      const color = Math.floor(Math.random() * 6);
      await env.DB.prepare('INSERT INTO messages (type, title, body, nickname, version, platform, color, created_at, request_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(request_key) DO NOTHING').bind(type, title, body, nickname, version, platform, color, new Date().toISOString(), key).run();
      const row = await env.DB.prepare(`${MESSAGE_QUERY} WHERE m.request_key = ?`).bind(key).first();
      if (row.title !== title || row.body !== body || row.nickname !== nickname || row.type !== type || row.version !== version || row.platform !== platform) throw new ApiError(409, 'conflict');
      return json({ item: row }, 201);
    } catch (error) {
      return json({ error: error instanceof ApiError ? error.message : 'unavailable' }, error instanceof ApiError ? error.status : 503);
    }
  },
};
