// Moderator login for the web dashboard (docs/moderate.html). No accounts, no cookies (this
// service follows the same "no cookies, no third-party tracking" line the feedback board's
// maintenance doc states) — a single shared password checked against a Worker secret
// (MODERATOR_PASSWORD, set via `wrangler secret put`, same idiom as this service's IP_SALT), on
// success a signed, time-limited bearer token the dashboard page keeps in sessionStorage and
// resends as `Authorization: Bearer <token>` on every admin call. Stateless — nothing about a
// session is stored in D1, so there's nothing to clean up or for a login to race against.
import { ApiError, clientId } from './http-kit.mjs';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const LOGIN_ATTEMPTS_PER_HOUR = 5;

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}
// Constant-time over equal-length inputs; callers pad both sides to the same length first so an
// early exit here never leaks a length difference (and thus a password-length oracle).
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password, env) {
  const expected = String(env.MODERATOR_PASSWORD || '');
  const given = String(password || '');
  if (!expected || !given) return false;
  const length = Math.max(expected.length, given.length);
  const paddedGiven = given.padEnd(length, '\0'), paddedExpected = expected.padEnd(length, '\0');
  return given.length === expected.length && timingSafeEqual(paddedGiven, paddedExpected);
}

export async function signSessionToken(env) {
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS })));
  const signatureB64 = toBase64Url(await hmacSha256(env.SESSION_SECRET || '', payloadB64));
  return `${payloadB64}.${signatureB64}`;
}

export async function verifySessionToken(token, env) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, signatureB64] = parts;
  const expectedB64 = toBase64Url(await hmacSha256(env.SESSION_SECRET || '', payloadB64));
  if (signatureB64.length !== expectedB64.length || !timingSafeEqual(signatureB64, expectedB64)) return false;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64))); } catch { return false; }
  return Number.isFinite(payload?.exp) && payload.exp > Date.now();
}

export async function requireAdmin(request, env) {
  const match = (request.headers.get('Authorization') || '').match(/^Bearer (.+)$/);
  if (!match || !(await verifySessionToken(match[1], env))) throw new ApiError(401, 'unauthorized');
}

// Independent of recordWrite()'s content-posting budget: a wrong-password guess must never spend
// (or be blocked by) the same allowance a legitimate visitor's post/comment uses, and needs a
// tighter cap since it's the thing standing between the internet and the moderator queue.
export async function checkLoginRate(request, env) {
  const now = Date.now();
  const hourAgo = new Date(now - 3600e3).toISOString();
  const client = await clientId(request, env);
  await env.DB.prepare('DELETE FROM login_attempts WHERE created_at < ?').bind(hourAgo).run();
  const usage = await env.DB.prepare('SELECT COUNT(*) AS hour FROM login_attempts WHERE client = ? AND created_at > ?').bind(client, hourAgo).first();
  if (Number(usage.hour) >= LOGIN_ATTEMPTS_PER_HOUR) throw new ApiError(429, 'limited');
  await env.DB.prepare('INSERT INTO login_attempts (client, created_at) VALUES (?, ?)').bind(client, new Date(now).toISOString()).run();
}
