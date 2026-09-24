// 香城街坊福利會 member accounts — additive identity layer, entirely separate from the anonymous
// nickname system every other table in this service uses. Unlike admin-auth.mjs's single shared
// moderator password, each member picks their own, so passwords are hashed (not compared against
// one Worker secret) and the bearer token payload carries a member id, not just an expiry.
//
// Token shape mirrors admin-auth.mjs's moderator token exactly (base64url payload + HMAC-SHA256
// signature, stateless, nothing stored in D1) but signs with its own secret (MEMBER_SESSION_SECRET,
// separate from SESSION_SECRET — a leak of one can't be used to forge the other) and a much longer
// TTL: a moderator logs in occasionally and only from sessionStorage, but a member wants to stay
// signed in across visits, so the website keeps this token in localStorage instead.
import { ApiError, clientId, toBase64Url, fromBase64Url, hmacSha256, timingSafeEqual } from './http-kit.mjs';

const MEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MEMBER_LOGIN_ATTEMPTS_PER_HOUR = 5;
const PBKDF2_ITERATIONS = 100000;

// Self-describing stored format ("pbkdf2:<iterations>:<saltB64url>:<hashB64url>") so a future
// change to the iteration count doesn't need a schema/migration — old hashes still verify with the
// iteration count they were written with.
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${toBase64Url(salt)}:${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPasswordHash(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 1) return false;
  let salt, expected;
  try { salt = fromBase64Url(parts[2]); expected = fromBase64Url(parts[3]); } catch { return false; }
  const bits = new Uint8Array(await deriveBits(password, salt, iterations));
  const givenB64 = toBase64Url(bits), expectedB64 = toBase64Url(expected);
  return givenB64.length === expectedB64.length && timingSafeEqual(givenB64, expectedB64);
}

async function deriveBits(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password || '')), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
}

// username rides along in the payload (not just looked up from `sub` at verify time) so that a
// sibling service with no access to the members table — services/feedback, which has its own D1
// and cannot cross-database join into this one — can still resolve a poster's display name from
// the token alone, as long as it holds the same MEMBER_SESSION_SECRET. Safe to trust indefinitely
// since there is no rename feature: a member's username never changes after registration.
export async function signMemberToken(memberId, username, env) {
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify({ sub: memberId, username, exp: Date.now() + MEMBER_SESSION_TTL_MS })));
  const signatureB64 = toBase64Url(await hmacSha256(env.MEMBER_SESSION_SECRET || '', payloadB64));
  return `${payloadB64}.${signatureB64}`;
}

// Returns { memberId, username } on success, or null — never throws, so callers decide whether a
// missing/expired token is a hard failure (requireMember) or just "not logged in" (an optional check).
export async function verifyMemberToken(token, env) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signatureB64] = parts;
  const expectedB64 = toBase64Url(await hmacSha256(env.MEMBER_SESSION_SECRET || '', payloadB64));
  if (signatureB64.length !== expectedB64.length || !timingSafeEqual(signatureB64, expectedB64)) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64))); } catch { return null; }
  if (!Number.isSafeInteger(payload?.sub) || typeof payload?.username !== 'string' || !payload.username || !Number.isFinite(payload?.exp) || payload.exp <= Date.now()) return null;
  return { memberId: payload.sub, username: payload.username };
}

export async function requireMember(request, env) {
  const match = (request.headers.get('Authorization') || '').match(/^Bearer (.+)$/);
  const member = match && await verifyMemberToken(match[1], env);
  if (!member) throw new ApiError(401, 'unauthorized');
  return member;
}

// Independent of both recordWrite()'s content budget and admin-auth.mjs's checkLoginRate(): real
// member-login traffic could be frequent, and must never be capped by (or itself exhaust) the
// moderator's own tight login budget.
export async function checkMemberLoginRate(request, env) {
  const now = Date.now();
  const hourAgo = new Date(now - 3600e3).toISOString();
  const client = await clientId(request, env);
  await env.DB.prepare('DELETE FROM member_login_attempts WHERE created_at < ?').bind(hourAgo).run();
  const usage = await env.DB.prepare('SELECT COUNT(*) AS hour FROM member_login_attempts WHERE client = ? AND created_at > ?').bind(client, hourAgo).first();
  if (Number(usage.hour) >= MEMBER_LOGIN_ATTEMPTS_PER_HOUR) throw new ApiError(429, 'limited');
  await env.DB.prepare('INSERT INTO member_login_attempts (client, created_at) VALUES (?, ?)').bind(client, new Date(now).toISOString()).run();
}
