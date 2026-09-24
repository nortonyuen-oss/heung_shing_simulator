// Small HTTP helpers shared by every route in this Worker. Originally lived inline in worker.mjs
// (duplicated from services/forum/worker.mjs, same as that file duplicates from this one — no
// shared build step across the two services) — split into this module once member-auth.mjs also
// needed ApiError/clientId, mirroring services/forum/lib/http-kit.mjs's shape without importing it.

export class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}

// Field restrictions. Every value reaches SQL only through bound parameters, so these rules are about
// keeping stored text well-formed: no control characters, single-line where the form is single-line,
// closed lists where the form offers a choice, and the same length caps the form enforces.
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

export async function jsonBody(request) {
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

export async function recordWrite(request, env) {
  const now = Date.now();
  const hourAgo = new Date(now - 3600e3).toISOString(), minuteAgo = new Date(now - 60e3).toISOString();
  const client = await clientId(request, env);
  await env.DB.prepare('DELETE FROM write_log WHERE created_at < ?').bind(hourAgo).run();
  const usage = await env.DB.prepare('SELECT COUNT(*) AS hour, SUM(created_at > ?) AS minute FROM write_log WHERE client = ? AND created_at > ?').bind(minuteAgo, client, hourAgo).first();
  if (Number(usage.minute) >= Number(env.WRITES_PER_MINUTE || 1) || Number(usage.hour) >= Number(env.WRITES_PER_HOUR || 5)) throw new ApiError(429, 'limited');
  await env.DB.prepare('INSERT INTO write_log (client, created_at) VALUES (?, ?)').bind(client, new Date(now).toISOString()).run();
}

export function pageNumber(url) {
  const value = url.searchParams.get('page') || '1';
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 10000) throw new ApiError(400, 'invalid');
  return Number(value);
}
