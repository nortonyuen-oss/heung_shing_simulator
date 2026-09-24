import { ApiError, restrict, jsonBody, recordWrite, pageNumber } from './lib/http-kit.mjs';
import { requireMember } from './lib/member-auth.mjs';

const PAGE_SIZE = 20;
const TYPES = ['bug', 'question', 'suggestion', 'comment'];
const MESSAGE_COLUMNS = 'm.number, m.type, m.title, m.body, m.nickname, m.member_id, m.member_username, m.version, m.platform, m.state, m.color, m.created_at, m.source';
const MESSAGE_QUERY = `SELECT ${MESSAGE_COLUMNS}, (SELECT COUNT(*) FROM replies r WHERE r.message_number = m.number) AS comments FROM messages m`;

// Field restrictions. Every value reaches SQL only through bound parameters, so these rules are about
// keeping stored text well-formed: no control characters, single-line where the form is single-line,
// closed lists where the form offers a choice, and the same length caps the form enforces.
const PLATFORMS = ['', 'Windows', 'macOS (Apple Silicon)', 'macOS (Intel)', 'Other'];
const VERSION = /^[0-9A-Za-z][0-9A-Za-z .+_-]{0,39}$/;
const KEY_PATTERN = /^[a-zA-Z0-9-]{16,80}$/;
// No more client-supplied nickname \u2014 \u7559\u8a00\u6b0a requires login to post, and a member's display name is
// always their fixed username (from the verified token), never free text.
const FIELDS = {
  message: { type: { max: 20, required: true, list: TYPES }, title: { max: 120, required: true }, details: { max: 6000, required: true, multiline: true }, version: { max: 40, pattern: VERSION }, platform: { max: 40, list: PLATFORMS }, requestKey: { max: 80, required: true, pattern: KEY_PATTERN } },
  reply: { details: { max: 6000, required: true, multiline: true }, requestKey: { max: 80, required: true, pattern: KEY_PATTERN } },
};

// A guest/legacy row (member_id NULL, from before \u7559\u8a00\u6b0a) keeps its original nickname, falling back
// to a literal "\u8a2a\u5ba2" label if that was blank; a member row always shows the username snapshotted
// onto it at write time (see the requireMember() calls below \u2014 member_username comes straight from
// the verified token's payload, never a live lookup, since this service has no access to the
// members table itself). `nickname` stays the field name for backward compatibility.
function withAuthor(row) {
  if (!row) return row;
  const { member_id, member_username, nickname, ...rest } = row;
  return { ...rest, nickname: member_id ? member_username : (nickname || '\u8a2a\u5ba2'), isGuest: member_id == null };
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
      // 留言權: submitting a memo/reply requires login; reading the wall stays fully public. Checked
      // before any DB work, same posture as recordWrite() below it.
      const member = request.method === 'POST' ? await requireMember(request, env) : null;
      if (replyRoute && !await env.DB.prepare('SELECT number FROM messages WHERE number = ?').bind(number).first()) throw new ApiError(404, 'notFound');
      if (request.method === 'GET') {
        const page = pageNumber(url), offset = (page - 1) * PAGE_SIZE;
        let result;
        if (replyRoute) {
          result = await env.DB.prepare('SELECT id, body, nickname, member_id, member_username, created_at, source FROM replies WHERE message_number = ? ORDER BY id ASC LIMIT ? OFFSET ?').bind(number, PAGE_SIZE + 1, offset).all();
        } else {
          const state = url.searchParams.get('state') || 'all';
          if (!['all','open','closed'].includes(state)) throw new ApiError(400, 'invalid');
          result = state === 'all'
            ? await env.DB.prepare(`${MESSAGE_QUERY} ORDER BY m.number DESC LIMIT ? OFFSET ?`).bind(PAGE_SIZE + 1, offset).all()
            : await env.DB.prepare(`${MESSAGE_QUERY} WHERE m.state = ? ORDER BY m.number DESC LIMIT ? OFFSET ?`).bind(state, PAGE_SIZE + 1, offset).all();
        }
        return json({ items: result.results.slice(0, PAGE_SIZE).map(withAuthor), hasNext: result.results.length > PAGE_SIZE });
      }
      // Edge flood shield only; the per-minute and per-hour policy is enforced precisely below.
      if (env.POST_LIMIT && !(await env.POST_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' })).success) throw new ApiError(429, 'limited');
      const { memberId, username } = member;
      const data = await jsonBody(request);
      const { requestKey: key, details: body, title, type, version, platform } = { title: '', type: '', version: '', platform: '', ...restrict(data, replyRoute ? FIELDS.reply : FIELDS.message) };
      const stored = replyRoute
        ? () => env.DB.prepare('SELECT id, message_number, body, nickname, member_id, member_username, created_at, source FROM replies WHERE request_key = ?').bind(key).first()
        : () => env.DB.prepare(`${MESSAGE_QUERY} WHERE m.request_key = ?`).bind(key).first();
      const matches = row => replyRoute
        ? row.message_number === number && row.body === body && row.member_id === memberId
        : row.title === title && row.body === body && row.member_id === memberId && row.type === type && row.version === version && row.platform === platform;
      // A retry of an already-stored request returns the stored row and never counts as a new write.
      const existing = await stored();
      if (existing) {
        if (!matches(existing)) throw new ApiError(409, 'conflict');
        return json({ item: withAuthor(existing) }, 201);
      }
      await recordWrite(request, env);
      if (replyRoute) {
        await env.DB.prepare("INSERT INTO replies (message_number, body, nickname, member_id, member_username, created_at, request_key, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'member') ON CONFLICT(request_key) DO NOTHING").bind(number, body, '', memberId, username, new Date().toISOString(), key).run();
      } else {
        const color = Math.floor(Math.random() * 6);
        await env.DB.prepare("INSERT INTO messages (type, title, body, nickname, member_id, member_username, version, platform, color, created_at, request_key, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'member') ON CONFLICT(request_key) DO NOTHING").bind(type, title, body, '', memberId, username, version, platform, color, new Date().toISOString(), key).run();
      }
      const row = await stored();
      if (!matches(row)) throw new ApiError(409, 'conflict');
      return json({ item: withAuthor(row) }, 201);
    } catch (error) {
      return json({ error: error instanceof ApiError ? error.message : 'unavailable' }, error instanceof ApiError ? error.status : 503);
    }
  },
};
