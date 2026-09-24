// Verify-only counterpart to services/forum/lib/member-auth.mjs. This service has no members table
// of its own — accounts live entirely in services/forum's D1, a different database that D1 cannot
// cross-database join into — so registration/login/password hashing stay forum-only. All this
// service can do is check a token's signature and read the {memberId, username} already embedded
// in its payload by forum's signMemberToken(). That only works if both Workers hold the SAME
// MEMBER_SESSION_SECRET (`wrangler secret put`, run independently in each service — Cloudflare
// secrets are per-Worker and cannot be shared or read back once set).
import { ApiError } from './http-kit.mjs';

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
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Returns { memberId, username } on success, or null — never throws, so callers decide whether a
// missing/expired token is a hard failure (requireMember) or just "not logged in".
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
