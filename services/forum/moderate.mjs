#!/usr/bin/env node
// Moderation helper for the citizen forum. Runs SQL against the production D1 database through wrangler.
//   node moderate.mjs list [visible|hidden]         recent posts with comment counts
//   node moderate.mjs show <id>                     one post with all its comments
//   node moderate.mjs hide <id>                      pull a post off the public feed (state stays in the row)
//   node moderate.mjs unhide <id>
//   node moderate.mjs delete <id>                    remove a post and its comments
//   node moderate.mjs delete-comment <id>
//   node moderate.mjs queue <table>                  pending items (posted, not yet approved for the game)
//                                                     table: posts | comments | news-comments | ads
//   node moderate.mjs approve <table> <id>           let an item into the game feed (approved_for_game = 1)
//   node moderate.mjs news-list [visible|hidden]      recent news posts with comment counts
//   node moderate.mjs news-show <id>                  one news post with all its comments
//   node moderate.mjs news-hide <id> / news-unhide <id>
//   node moderate.mjs news-delete <id>                remove a news post and its comments
//   node moderate.mjs list-avatars                    recently-updated member avatars (show-then-review)
//   node moderate.mjs hide-avatar <memberId>          pull an avatar off the site (member row stays)
//   node moderate.mjs unhide-avatar <memberId>
//
// Day-to-day moderation is expected to happen through docs/moderate.html (the web dashboard, same
// login); this CLI stays as the fast/scriptable fallback the way it always has been.
import { spawnSync } from 'node:child_process';

const TABLES = { posts: 'posts', comments: 'comments', 'news-comments': 'news_comments', ads: 'ads' };
const [command, ...rest] = process.argv.slice(2);

function usage() {
  console.error('usage: node moderate.mjs <list [visible|hidden] | show N | hide N | unhide N | delete N | delete-comment ID | queue TABLE | approve TABLE N | news-list [visible|hidden] | news-show N | news-hide N | news-unhide N | news-delete N | list-avatars | hide-avatar N | unhide-avatar N>');
  process.exit(2);
}

function checkedId(value) {
  const id = Number(value);
  if (!(Number.isSafeInteger(id) && id > 0)) usage();
  return id;
}

// Every command below is a fixed statement with checked-integer ids and a whitelisted table name
// inlined; no user text reaches the SQL.
let sql;
if (command === 'list') {
  const [state] = rest;
  sql = `SELECT p.id, p.state, p.approved_for_game, p.category, p.nickname, substr(p.headline, 1, 60) AS headline, p.created_at, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comments FROM posts p ${state === 'visible' || state === 'hidden' ? `WHERE p.state = '${state}'` : ''} ORDER BY p.id DESC LIMIT 40`;
} else if (command === 'show') {
  const id = checkedId(rest[0]);
  sql = `SELECT id, state, approved_for_game, category, nickname, headline, body, created_at FROM posts WHERE id = ${id}; SELECT id, nickname, body, created_at FROM comments WHERE post_id = ${id} ORDER BY id`;
} else if (command === 'hide') {
  sql = `UPDATE posts SET state = 'hidden' WHERE id = ${checkedId(rest[0])}`;
} else if (command === 'unhide') {
  sql = `UPDATE posts SET state = 'visible' WHERE id = ${checkedId(rest[0])}`;
} else if (command === 'delete') {
  const id = checkedId(rest[0]);
  sql = `DELETE FROM comments WHERE post_id = ${id}; DELETE FROM posts WHERE id = ${id}`;
} else if (command === 'delete-comment') {
  sql = `DELETE FROM comments WHERE id = ${checkedId(rest[0])}`;
} else if (command === 'queue') {
  const table = TABLES[rest[0]];
  if (!table) usage();
  sql = table === 'comments'
    ? "SELECT c.id, c.post_id, c.nickname, substr(c.body, 1, 80) AS body, c.created_at FROM comments c WHERE c.state = 'visible' AND c.approved_for_game = 0 ORDER BY c.id DESC LIMIT 40"
    : table === 'news_comments'
    ? "SELECT nc.id, nc.news_post_id, nc.nickname, substr(nc.body, 1, 80) AS body, nc.created_at FROM news_comments nc WHERE nc.state = 'visible' AND nc.approved_for_game = 0 ORDER BY nc.id DESC LIMIT 40"
    : table === 'ads'
    ? "SELECT id, nickname, ad_text, created_at FROM ads WHERE state = 'visible' AND approved_for_game = 0 ORDER BY id DESC LIMIT 40"
    : "SELECT p.id, p.category, p.nickname, substr(p.headline, 1, 60) AS headline, p.created_at FROM posts p WHERE p.state = 'visible' AND p.approved_for_game = 0 ORDER BY p.id DESC LIMIT 40";
} else if (command === 'approve') {
  const table = TABLES[rest[0]];
  if (!table) usage();
  sql = `UPDATE ${table} SET approved_for_game = 1 WHERE id = ${checkedId(rest[1])}`;
} else if (command === 'news-list') {
  const [state] = rest;
  sql = `SELECT n.id, n.state, substr(n.headline, 1, 60) AS headline, n.image_key, n.created_at, (SELECT COUNT(*) FROM news_comments nc WHERE nc.news_post_id = n.id) AS comments FROM news_posts n ${state === 'visible' || state === 'hidden' ? `WHERE n.state = '${state}'` : ''} ORDER BY n.id DESC LIMIT 40`;
} else if (command === 'news-show') {
  const id = checkedId(rest[0]);
  sql = `SELECT id, state, headline, body, image_key, created_at FROM news_posts WHERE id = ${id}; SELECT id, nickname, body, approved_for_game, created_at FROM news_comments WHERE news_post_id = ${id} ORDER BY id`;
} else if (command === 'news-hide') {
  sql = `UPDATE news_posts SET state = 'hidden' WHERE id = ${checkedId(rest[0])}`;
} else if (command === 'news-unhide') {
  sql = `UPDATE news_posts SET state = 'visible' WHERE id = ${checkedId(rest[0])}`;
} else if (command === 'news-delete') {
  const id = checkedId(rest[0]);
  sql = `DELETE FROM news_comments WHERE news_post_id = ${id}; DELETE FROM news_posts WHERE id = ${id}`;
} else if (command === 'list-avatars') {
  sql = "SELECT id, username, avatar_state, avatar_updated_at FROM members WHERE avatar_key IS NOT NULL ORDER BY avatar_updated_at DESC LIMIT 40";
} else if (command === 'hide-avatar') {
  sql = `UPDATE members SET avatar_state = 'hidden' WHERE id = ${checkedId(rest[0])}`;
} else if (command === 'unhide-avatar') {
  sql = `UPDATE members SET avatar_state = 'visible' WHERE id = ${checkedId(rest[0])}`;
} else {
  usage();
}

const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'heung-shing-forum', '--remote', '--command', sql], { cwd: import.meta.dirname, stdio: 'inherit' });
process.exit(result.status ?? 1);
