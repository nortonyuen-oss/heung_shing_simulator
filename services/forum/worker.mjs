import { ApiError, restrict, jsonBody, readBoundedBytes, recordWrite, recordReaction, pageNumber, resolveCors } from './lib/http-kit.mjs';
import { verifyPassword, signSessionToken, requireAdmin, checkLoginRate } from './lib/admin-auth.mjs';
import { hashPassword, verifyPasswordHash, signMemberToken, requireMember, checkMemberLoginRate } from './lib/member-auth.mjs';

const PAGE_SIZE = 20;
const ADMIN_QUEUE_SIZE = 50;
const CATEGORIES = ['城市發展', '城中熱話', '交通台', '吹水台'];
const KEY_PATTERN = /^[a-zA-Z0-9-]{16,80}$/;
const IMAGE_KEY_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|jpeg|png|webp)$/;
const IMAGE_CONTENT_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const REACTIONS = ['like', 'laugh', 'angry', 'share', 'clown'];
const REACTION_COLUMNS = { like: 'likes', laugh: 'laughs', angry: 'angry', share: 'shares', clown: 'clowns' };
const REACTION_SELECT = 'id, likes, laughs, angry, shares, clowns';
// Chinese/Japanese/Korean names plus Latin letters, digits, underscore and hyphen — a member's
// username is a public display identity, not a technical handle, so it needs to allow non-Latin
// scripts the same as every nickname field elsewhere in this service.
const USERNAME_PATTERN = /^[\p{L}\p{N}_-]{2,24}$/u;

const POST_COLUMNS = 'p.id, p.category, p.headline, p.body, p.nickname, p.created_at, p.likes, p.laughs, p.angry, p.shares, p.clowns';
const POST_QUERY = `SELECT ${POST_COLUMNS}, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.state = 'visible') AS comments FROM posts p`;
const NEWS_COLUMNS = 'n.id, n.headline, n.body, n.image_key, n.category, n.created_at, n.likes, n.laughs, n.angry, n.shares, n.clowns';
const NEWS_QUERY = `SELECT ${NEWS_COLUMNS}, (SELECT COUNT(*) FROM news_comments nc WHERE nc.news_post_id = n.id AND nc.state = 'visible') AS comments FROM news_posts n`;

// FIELDS.login is deliberately NOT run through restrict() in handleLogin: that helper
// trims/NFC-normalizes/rejects control characters for stored CONTENT, but a password is a
// credential — it must compare exactly against what `wrangler secret put` stored, not a "cleaned
// up" version of what was typed.
const FIELDS = {
  post: { category: { max: 20, required: true, list: CATEGORIES }, headline: { max: 220, required: true }, body: { max: 1500, required: true, multiline: true }, nickname: { max: 40 }, requestKey: { max: 80, required: true, pattern: KEY_PATTERN } },
  comment: { body: { max: 1500, required: true, multiline: true }, nickname: { max: 40 }, requestKey: { max: 80, required: true, pattern: KEY_PATTERN } },
  ad: { adText: { max: 120, required: true }, nickname: { max: 40 }, requestKey: { max: 80, required: true, pattern: KEY_PATTERN } },
  news: { headline: { max: 220, required: true }, body: { max: 3000, required: true, multiline: true }, imageKey: { max: 100, pattern: IMAGE_KEY_PATTERN }, category: { max: 20, required: true, list: CATEGORIES } },
  reaction: { reaction: { max: 10, required: true, list: REACTIONS } },
  // password is deliberately NOT here, same reasoning as the login comment above — restrict()'s
  // NFC-normalize/trim would silently change what a member actually typed as their password.
  member: { username: { max: 24, required: true, pattern: USERNAME_PATTERN } },
};

// Tables an /admin/<resource>/:id/approve|hide route may touch — a fixed, hardcoded whitelist, so
// interpolating the matched value into SQL is safe (it can only ever be one of these four literals,
// never raw request content).
const ADMIN_TABLES = { posts: 'posts', comments: 'comments', 'news-comments': 'news_comments', ads: 'ads' };

function jsonResponse(corsAllowOrigin, data, status = 200) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin' };
  if (corsAllowOrigin) headers['Access-Control-Allow-Origin'] = corsAllowOrigin;
  return new Response(JSON.stringify(data), { status, headers });
}

async function handleLogin(request, env) {
  await checkLoginRate(request, env);
  const data = await jsonBody(request);
  if (Object.keys(data).some((key) => key !== 'password') || typeof data.password !== 'string' || data.password.length > 200) throw new ApiError(400, 'invalid');
  if (!(await verifyPassword(data.password, env))) throw new ApiError(401, 'unauthorized');
  return { token: await signSessionToken(env) };
}

// Shared by every public "create a post/comment/ad" route: dedupe on request_key (a retry of an
// already-stored request returns the stored row for free and never counts against the rate limit),
// otherwise record the write and insert. `insert()` runs only on a genuinely new key.
async function createWithIdempotency(env, request, { stored, matches, insert }) {
  const existing = await stored();
  if (existing) {
    if (!matches(existing)) throw new ApiError(409, 'conflict');
    return { item: existing, status: 201 };
  }
  await recordWrite(request, env);
  await insert();
  const row = await stored();
  if (!matches(row)) throw new ApiError(409, 'conflict');
  return { item: row, status: 201 };
}

export default {
  async fetch(request, env) {
    const { corsAllowOrigin, originRejected } = resolveCors(request, env);
    const json = (data, status = 200) => jsonResponse(corsAllowOrigin, data, status);
    try {
      if (originRejected) throw new ApiError(403, 'origin');
      if (request.method === 'OPTIONS') {
        const headers = { 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' };
        if (corsAllowOrigin) headers['Access-Control-Allow-Origin'] = corsAllowOrigin;
        return new Response(null, { status: 204, headers });
      }
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;

      if (path === '/health' && method === 'GET') {
        await env.DB.prepare('SELECT id FROM posts LIMIT 1').all();
        return json({ ok: true });
      }

      // ── Forum posts/comments (existing) ─────────────────────────────────────────────
      const commentRoute = path.match(/^\/posts\/([1-9]\d*)\/comments$/);
      if (path === '/posts' || commentRoute) {
        const postId = commentRoute ? Number(commentRoute[1]) : null;
        if (postId !== null && !Number.isSafeInteger(postId)) throw new ApiError(400, 'invalid');
        if (!['GET', 'POST'].includes(method)) throw new ApiError(405, 'method');
        // A comment's own approved_for_game gates what the game actually fetches (below); whether
        // the parent post itself is approved yet is unrelated — any visible post can be commented on.
        if (commentRoute && !await env.DB.prepare("SELECT id FROM posts WHERE id = ? AND state = 'visible'").bind(postId).first()) throw new ApiError(404, 'notFound');
        if (method === 'GET') {
          const page = pageNumber(url), offset = (page - 1) * PAGE_SIZE;
          // ?approved=1 is the game's feed; the plain list is the website's live discussion board
          // and includes anything not yet approved for the game — same split as ads/news-comments.
          const approvedOnly = url.searchParams.get('approved') === '1';
          let result;
          if (commentRoute) {
            const gameClause = approvedOnly ? 'AND approved_for_game = 1' : '';
            result = await env.DB.prepare(`SELECT id, body, nickname, created_at FROM comments WHERE post_id = ? AND state = 'visible' ${gameClause} ORDER BY id ASC LIMIT ? OFFSET ?`).bind(postId, PAGE_SIZE + 1, offset).all();
          } else {
            const category = url.searchParams.get('category') || 'all';
            if (category !== 'all' && !CATEGORIES.includes(category)) throw new ApiError(400, 'invalid');
            const gameClause = approvedOnly ? 'AND p.approved_for_game = 1' : '';
            result = category === 'all'
              ? await env.DB.prepare(`${POST_QUERY} WHERE p.state = 'visible' ${gameClause} ORDER BY p.id DESC LIMIT ? OFFSET ?`).bind(PAGE_SIZE + 1, offset).all()
              : await env.DB.prepare(`${POST_QUERY} WHERE p.state = 'visible' ${gameClause} AND p.category = ? ORDER BY p.id DESC LIMIT ? OFFSET ?`).bind(category, PAGE_SIZE + 1, offset).all();
          }
          return json({ items: result.results.slice(0, PAGE_SIZE), hasNext: result.results.length > PAGE_SIZE });
        }
        const data = await jsonBody(request);
        const { requestKey: key, body, nickname, category, headline } = { category: '', headline: '', ...restrict(data, commentRoute ? FIELDS.comment : FIELDS.post) };
        const stored = commentRoute
          ? () => env.DB.prepare('SELECT id, post_id, body, nickname, created_at FROM comments WHERE request_key = ?').bind(key).first()
          : () => env.DB.prepare(`${POST_QUERY} WHERE p.request_key = ?`).bind(key).first();
        const matches = (row) => commentRoute
          ? row.post_id === postId && row.body === body && row.nickname === nickname
          : row.category === category && row.headline === headline && row.body === body && row.nickname === nickname;
        const insert = () => commentRoute
          ? env.DB.prepare('INSERT INTO comments (post_id, body, nickname, created_at, request_key) VALUES (?, ?, ?, ?, ?) ON CONFLICT(request_key) DO NOTHING').bind(postId, body, nickname, new Date().toISOString(), key).run()
          : env.DB.prepare('INSERT INTO posts (category, headline, body, nickname, created_at, request_key) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(request_key) DO NOTHING').bind(category, headline, body, nickname, new Date().toISOString(), key).run();
        const { item, status } = await createWithIdempotency(env, request, { stored, matches, insert });
        return json({ item }, status);
      }

      // ── Emoji reactions — a much looser budget than text content (recordReaction(), not
      // recordWrite()); no requestKey/idempotency, these are plain increments, not stored content.
      const postReactRoute = path.match(/^\/posts\/([1-9]\d*)\/react$/);
      if (postReactRoute) {
        if (method !== 'POST') throw new ApiError(405, 'method');
        const postId = Number(postReactRoute[1]);
        const { reaction } = restrict(await jsonBody(request), FIELDS.reaction);
        await recordReaction(request, env);
        const column = REACTION_COLUMNS[reaction];
        const result = await env.DB.prepare(`UPDATE posts SET ${column} = ${column} + 1 WHERE id = ? AND state = 'visible'`).bind(postId).run();
        if (!result.success || !(result.meta?.changes ?? result.changes ?? 1)) throw new ApiError(404, 'notFound');
        const row = await env.DB.prepare(`SELECT ${REACTION_SELECT} FROM posts WHERE id = ?`).bind(postId).first();
        return json({ item: row });
      }

      // ── News posts (moderator-authored) + comments (public) ────────────────────────
      const newsCommentRoute = path.match(/^\/news\/([1-9]\d*)\/comments$/);
      if (path === '/news' || newsCommentRoute) {
        const newsId = newsCommentRoute ? Number(newsCommentRoute[1]) : null;
        if (newsId !== null && !Number.isSafeInteger(newsId)) throw new ApiError(400, 'invalid');
        if (newsCommentRoute && !await env.DB.prepare("SELECT id FROM news_posts WHERE id = ? AND state = 'visible'").bind(newsId).first()) throw new ApiError(404, 'notFound');
        if (path === '/news') {
          if (method !== 'GET') throw new ApiError(405, 'method');
          const page = pageNumber(url), offset = (page - 1) * PAGE_SIZE;
          const category = url.searchParams.get('category') || 'all';
          if (category !== 'all' && !CATEGORIES.includes(category)) throw new ApiError(400, 'invalid');
          const result = category === 'all'
            ? await env.DB.prepare(`${NEWS_QUERY} WHERE n.state = 'visible' ORDER BY n.id DESC LIMIT ? OFFSET ?`).bind(PAGE_SIZE + 1, offset).all()
            : await env.DB.prepare(`${NEWS_QUERY} WHERE n.state = 'visible' AND n.category = ? ORDER BY n.id DESC LIMIT ? OFFSET ?`).bind(category, PAGE_SIZE + 1, offset).all();
          return json({ items: result.results.slice(0, PAGE_SIZE), hasNext: result.results.length > PAGE_SIZE });
        }
        if (!['GET', 'POST'].includes(method)) throw new ApiError(405, 'method');
        if (method === 'GET') {
          const page = pageNumber(url), offset = (page - 1) * PAGE_SIZE;
          // Comments show on the website as soon as posted (state='visible'); approved_for_game
          // gates only the separate feed the game reads (see /posts above) — same split as forum.
          const result = await env.DB.prepare("SELECT id, body, nickname, created_at FROM news_comments WHERE news_post_id = ? AND state = 'visible' ORDER BY id ASC LIMIT ? OFFSET ?").bind(newsId, PAGE_SIZE + 1, offset).all();
          return json({ items: result.results.slice(0, PAGE_SIZE), hasNext: result.results.length > PAGE_SIZE });
        }
        const data = await jsonBody(request);
        const { requestKey: key, body, nickname } = restrict(data, FIELDS.comment);
        const stored = () => env.DB.prepare('SELECT id, news_post_id, body, nickname, created_at FROM news_comments WHERE request_key = ?').bind(key).first();
        const matches = (row) => row.news_post_id === newsId && row.body === body && row.nickname === nickname;
        const insert = () => env.DB.prepare('INSERT INTO news_comments (news_post_id, body, nickname, created_at, request_key) VALUES (?, ?, ?, ?, ?) ON CONFLICT(request_key) DO NOTHING').bind(newsId, body, nickname, new Date().toISOString(), key).run();
        const { item, status } = await createWithIdempotency(env, request, { stored, matches, insert });
        return json({ item }, status);
      }

      // ── Emoji reactions on a news article — same posture as /posts/:id/react above.
      const newsReactRoute = path.match(/^\/news\/([1-9]\d*)\/react$/);
      if (newsReactRoute) {
        if (method !== 'POST') throw new ApiError(405, 'method');
        const reactNewsId = Number(newsReactRoute[1]);
        const { reaction } = restrict(await jsonBody(request), FIELDS.reaction);
        await recordReaction(request, env);
        const column = REACTION_COLUMNS[reaction];
        const result = await env.DB.prepare(`UPDATE news_posts SET ${column} = ${column} + 1 WHERE id = ? AND state = 'visible'`).bind(reactNewsId).run();
        if (!result.success || !(result.meta?.changes ?? result.changes ?? 1)) throw new ApiError(404, 'notFound');
        const row = await env.DB.prepare(`SELECT ${REACTION_SELECT} FROM news_posts WHERE id = ?`).bind(reactNewsId).first();
        return json({ item: row });
      }

      // ── Flat, cross-article feed of approved news comments — this is what the game's
      // syncPlayerNewsComments() reads (see newspaper.js), never a specific article's thread
      // (GET /news/:id/comments above is the per-article website view and ignores approval).
      if (path === '/news-comments') {
        if (method !== 'GET') throw new ApiError(405, 'method');
        const page = pageNumber(url), offset = (page - 1) * PAGE_SIZE;
        const result = await env.DB.prepare("SELECT nc.id, nc.body, nc.nickname, nc.created_at, nc.news_post_id, n.headline AS news_headline FROM news_comments nc JOIN news_posts n ON n.id = nc.news_post_id WHERE nc.state = 'visible' AND nc.approved_for_game = 1 ORDER BY nc.id DESC LIMIT ? OFFSET ?").bind(PAGE_SIZE + 1, offset).all();
        return json({ items: result.results.slice(0, PAGE_SIZE), hasNext: result.results.length > PAGE_SIZE });
      }

      // ── 宣傳2-零速傳播 ────────────────────────────────────────────────────────────
      if (path === '/ads') {
        if (!['GET', 'POST'].includes(method)) throw new ApiError(405, 'method');
        if (method === 'GET') {
          const page = pageNumber(url), offset = (page - 1) * PAGE_SIZE;
          // ?approved=1 is the game's feed (hud-ticker.js); the plain list is the website's live
          // 宣傳2 wall and includes anything not yet approved for the game, same split as posts.
          const approvedOnly = url.searchParams.get('approved') === '1';
          const result = approvedOnly
            ? await env.DB.prepare("SELECT id, nickname, ad_text, created_at FROM ads WHERE state = 'visible' AND approved_for_game = 1 ORDER BY id DESC LIMIT ? OFFSET ?").bind(PAGE_SIZE + 1, offset).all()
            : await env.DB.prepare("SELECT id, nickname, ad_text, created_at FROM ads WHERE state = 'visible' ORDER BY id DESC LIMIT ? OFFSET ?").bind(PAGE_SIZE + 1, offset).all();
          return json({ items: result.results.slice(0, PAGE_SIZE), hasNext: result.results.length > PAGE_SIZE });
        }
        const data = await jsonBody(request);
        const { requestKey: key, adText, nickname } = restrict(data, FIELDS.ad);
        const stored = () => env.DB.prepare('SELECT id, nickname, ad_text, created_at FROM ads WHERE request_key = ?').bind(key).first();
        const matches = (row) => row.ad_text === adText && row.nickname === nickname;
        const insert = () => env.DB.prepare('INSERT INTO ads (nickname, ad_text, created_at, request_key) VALUES (?, ?, ?, ?) ON CONFLICT(request_key) DO NOTHING').bind(nickname, adText, new Date().toISOString(), key).run();
        const { item, status } = await createWithIdempotency(env, request, { stored, matches, insert });
        return json({ item }, status);
      }

      // ── 香城街坊福利會 member accounts ───────────────────────────────────────────────
      // Additive identity layer: nothing here gates posting/commenting/reacting, which all still
      // work fully anonymously. A member is just a persistent username+password a visitor can
      // optionally have — what that identity unlocks is future work.
      if (path === '/members/register' && method === 'POST') {
        await checkMemberLoginRate(request, env); // also guards against account-creation spam
        const data = await jsonBody(request);
        // password is checked by hand, not restrict(), same reasoning as FIELDS.member's comment —
        // and this also rejects any unexpected extra key, since restrict() below only ever sees
        // { username }, not the full body.
        if (Object.keys(data).some((key) => key !== 'username' && key !== 'password')) throw new ApiError(400, 'invalid');
        if (typeof data.password !== 'string' || data.password.length < 8 || data.password.length > 200) throw new ApiError(400, 'invalid');
        const { username } = restrict({ username: data.username }, FIELDS.member);
        const usernameLower = username.toLowerCase();
        if (await env.DB.prepare('SELECT id FROM members WHERE username_lower = ?').bind(usernameLower).first()) throw new ApiError(409, 'conflict');
        const passwordHash = await hashPassword(data.password);
        const result = await env.DB.prepare('INSERT INTO members (username, username_lower, password_hash, created_at) VALUES (?, ?, ?, ?)').bind(username, usernameLower, passwordHash, new Date().toISOString()).run();
        const memberId = result.meta?.last_row_id ?? result.lastInsertRowid;
        return json({ token: await signMemberToken(memberId, env), username }, 201);
      }

      if (path === '/members/login' && method === 'POST') {
        await checkMemberLoginRate(request, env);
        const data = await jsonBody(request);
        if (Object.keys(data).some((key) => key !== 'username' && key !== 'password')) throw new ApiError(400, 'invalid');
        if (typeof data.username !== 'string' || typeof data.password !== 'string') throw new ApiError(400, 'invalid');
        const member = await env.DB.prepare('SELECT id, username, password_hash FROM members WHERE username_lower = ?').bind(data.username.trim().toLowerCase()).first();
        if (!member || !(await verifyPasswordHash(data.password, member.password_hash))) throw new ApiError(401, 'unauthorized');
        return json({ token: await signMemberToken(member.id, env), username: member.username });
      }

      if (path === '/members/me' && method === 'GET') {
        const memberId = await requireMember(request, env);
        const member = await env.DB.prepare('SELECT username, created_at FROM members WHERE id = ?').bind(memberId).first();
        if (!member) throw new ApiError(401, 'unauthorized'); // account deleted after the token was issued
        return json({ username: member.username, createdAt: member.created_at });
      }

      // ── Uploaded news photos ────────────────────────────────────────────────────────
      const imageRoute = path.match(/^\/images\/([a-f0-9-]+\.(?:jpg|jpeg|png|webp))$/);
      if (imageRoute) {
        if (method !== 'GET') throw new ApiError(405, 'method');
        const key = imageRoute[1];
        if (!IMAGE_KEY_PATTERN.test(key)) throw new ApiError(404, 'notFound');
        const object = env.IMAGES && await env.IMAGES.get(key);
        if (!object) throw new ApiError(404, 'notFound');
        const headers = { 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable', 'Vary': 'Origin' };
        if (corsAllowOrigin) headers['Access-Control-Allow-Origin'] = corsAllowOrigin;
        return new Response(object.body, { status: 200, headers });
      }

      // ── Moderator admin surface ─────────────────────────────────────────────────────
      if (path === '/admin/login' && method === 'POST') return json(await handleLogin(request, env), 200);

      if (path.startsWith('/admin/')) {
        await requireAdmin(request, env);

        const queueRoute = path.match(/^\/admin\/queue\/(posts|comments|news-comments|ads)$/);
        if (queueRoute && method === 'GET') {
          const resource = queueRoute[1];
          let result;
          if (resource === 'posts') {
            result = await env.DB.prepare(`${POST_QUERY} WHERE p.state = 'visible' AND p.approved_for_game = 0 ORDER BY p.id DESC LIMIT ?`).bind(ADMIN_QUEUE_SIZE).all();
          } else if (resource === 'comments') {
            result = await env.DB.prepare("SELECT c.id, c.post_id, c.body, c.nickname, c.created_at, p.headline AS post_headline FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.state = 'visible' AND c.approved_for_game = 0 ORDER BY c.id DESC LIMIT ?").bind(ADMIN_QUEUE_SIZE).all();
          } else if (resource === 'news-comments') {
            result = await env.DB.prepare("SELECT nc.id, nc.news_post_id, nc.body, nc.nickname, nc.created_at, n.headline AS news_headline FROM news_comments nc JOIN news_posts n ON n.id = nc.news_post_id WHERE nc.state = 'visible' AND nc.approved_for_game = 0 ORDER BY nc.id DESC LIMIT ?").bind(ADMIN_QUEUE_SIZE).all();
          } else {
            result = await env.DB.prepare("SELECT id, nickname, ad_text, created_at FROM ads WHERE state = 'visible' AND approved_for_game = 0 ORDER BY id DESC LIMIT ?").bind(ADMIN_QUEUE_SIZE).all();
          }
          return json({ items: result.results });
        }

        const moderateRoute = path.match(/^\/admin\/(posts|comments|news-comments|ads)\/([1-9]\d*)\/(approve|hide)$/);
        if (moderateRoute && method === 'POST') {
          const [, resource, idText, action] = moderateRoute;
          const id = Number(idText);
          const table = ADMIN_TABLES[resource];
          const sql = action === 'approve' ? `UPDATE ${table} SET approved_for_game = 1 WHERE id = ?` : `UPDATE ${table} SET state = 'hidden' WHERE id = ?`;
          const result = await env.DB.prepare(sql).bind(id).run();
          if (!result.success || !(result.meta?.changes ?? result.changes ?? 1)) throw new ApiError(404, 'notFound');
          return json({ ok: true });
        }

        const newsHideRoute = path.match(/^\/admin\/news\/([1-9]\d*)\/hide$/);
        if (newsHideRoute && method === 'POST') {
          await env.DB.prepare("UPDATE news_posts SET state = 'hidden' WHERE id = ?").bind(Number(newsHideRoute[1])).run();
          return json({ ok: true });
        }

        if (path === '/admin/news' && method === 'POST') {
          const data = await jsonBody(request);
          const { headline, body, imageKey, category } = restrict(data, FIELDS.news);
          const result = await env.DB.prepare('INSERT INTO news_posts (headline, body, image_key, category, created_at) VALUES (?, ?, ?, ?, ?)').bind(headline, body, imageKey, category, new Date().toISOString()).run();
          const id = result.meta?.last_row_id ?? result.lastInsertRowid;
          const row = await env.DB.prepare(`${NEWS_QUERY} WHERE n.id = ?`).bind(id).first();
          return json({ item: row }, 201);
        }

        if (path === '/admin/upload' && method === 'POST') {
          const contentType = (request.headers.get('content-type') || '').toLowerCase();
          const extension = IMAGE_CONTENT_TYPES[contentType];
          if (!extension || !env.IMAGES) throw new ApiError(400, 'invalid');
          const bytes = await readBoundedBytes(request, MAX_IMAGE_BYTES);
          if (!bytes.length) throw new ApiError(400, 'invalid');
          const key = `${crypto.randomUUID()}.${extension}`;
          await env.IMAGES.put(key, bytes, { httpMetadata: { contentType } });
          return json({ key }, 201);
        }

        throw new ApiError(404, 'notFound');
      }

      throw new ApiError(404, 'notFound');
    } catch (error) {
      return json({ error: error instanceof ApiError ? error.message : 'unavailable' }, error instanceof ApiError ? error.status : 503);
    }
  },
};
