// Small HTTP helpers shared by every route in this Worker. Originally lived inline in worker.mjs
// (duplicated from services/feedback/worker.mjs, same as that file duplicates from this one — no
// shared build step across the two services) — split into this module once the route count grew
// past what a single readable file could hold.

export class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}

// Field restrictions. Every value reaches SQL only through bound parameters, so these rules are
// about keeping stored text well-formed: no control characters, single-line where the form is
// single-line, closed lists where the form offers a choice, and the same length caps the form
// enforces.
export const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/;
export const LINE = /[\t\r\n]/;

export function restrict(data, shape) {
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

// Bounds the stream as well as Content-Length: clients may omit or lie about the header.
export async function readBoundedBytes(request, maxBytes) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'invalid');
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new ApiError(413, 'tooLong'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function jsonBody(request, maxBytes = 32768) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new ApiError(415, 'invalid');
  const bytes = await readBoundedBytes(request, maxBytes);
  try {
    const result = JSON.parse(new TextDecoder().decode(bytes));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'invalid');
  }
}

export async function clientId(request, env) {
  // Only a salted hash of the address is ever stored, and only for the length of the hour window.
  const bytes = new TextEncoder().encode(`${env.IP_SALT || ''}|${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Shared by recordWrite() and recordReaction() below: a sliding minute/hour budget against a
// per-client ledger table. `table` is always one of a fixed set of literals from this file, never
// request content, so interpolating it into SQL is safe — same posture as ADMIN_TABLES in worker.mjs.
async function recordToLedger(request, env, { table, minuteLimit, hourLimit }) {
  // Edge flood shield only; the per-minute and per-hour policy is enforced precisely below.
  if (env.POST_LIMIT && !(await env.POST_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' })).success) throw new ApiError(429, 'limited');
  const now = Date.now();
  const hourAgo = new Date(now - 3600e3).toISOString(), minuteAgo = new Date(now - 60e3).toISOString();
  const client = await clientId(request, env);
  await env.DB.prepare(`DELETE FROM ${table} WHERE created_at < ?`).bind(hourAgo).run();
  const usage = await env.DB.prepare(`SELECT COUNT(*) AS hour, SUM(created_at > ?) AS minute FROM ${table} WHERE client = ? AND created_at > ?`).bind(minuteAgo, client, hourAgo).first();
  if (Number(usage.minute) >= minuteLimit || Number(usage.hour) >= hourLimit) throw new ApiError(429, 'limited');
  await env.DB.prepare(`INSERT INTO ${table} (client, created_at) VALUES (?, ?)`).bind(client, new Date(now).toISOString()).run();
}

export async function recordWrite(request, env) {
  return recordToLedger(request, env, { table: 'write_log', minuteLimit: Number(env.WRITES_PER_MINUTE || 1), hourLimit: Number(env.WRITES_PER_HOUR || 5) });
}

// A single emoji click is far lower-risk than posting text, so it gets its own, much looser budget
// (env-tunable without a redeploy of the limit values themselves) instead of sharing write_log's
// strict 1/minute-5/hour — reacting a lot shouldn't burn the same budget as spamming comments.
export async function recordReaction(request, env) {
  return recordToLedger(request, env, { table: 'reaction_log', minuteLimit: Number(env.REACTIONS_PER_MINUTE || 20), hourLimit: Number(env.REACTIONS_PER_HOUR || 300) });
}

export function pageNumber(url) {
  const value = url.searchParams.get('page') || '1';
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 10000) throw new ApiError(400, 'invalid');
  return Number(value);
}

// CORS is a browser-only mechanism: a request with no Origin header (the game's own Electron
// main-process fetch, curl, moderate.mjs) is never rejected — only a browser request from a
// disallowed origin is. Callers build their own Response headers around this so a JSON route and
// the binary /images/:key route don't have to share one Content-Type.
export function resolveCors(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  const corsAllowOrigin = origin && allowed.includes(origin) ? origin : null;
  const originRejected = !!origin && !allowed.includes(origin);
  return { corsAllowOrigin, originRejected };
}
