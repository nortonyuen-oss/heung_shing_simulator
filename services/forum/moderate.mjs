#!/usr/bin/env node
// Moderation helper for the citizen forum. Runs SQL against the production D1 database through wrangler.
//   node moderate.mjs list [visible|hidden]    recent posts with comment counts
//   node moderate.mjs show <id>                one post with all its comments
//   node moderate.mjs hide <id>                pull a post off the public feed (state stays in the row)
//   node moderate.mjs unhide <id>
//   node moderate.mjs delete <id>               remove a post and its comments
//   node moderate.mjs delete-comment <id>
import { spawnSync } from 'node:child_process';

const [command, argument] = process.argv.slice(2);
const id = Number(argument);
const needsId = ['show', 'hide', 'unhide', 'delete', 'delete-comment'];
if (!command || (needsId.includes(command) && !(Number.isSafeInteger(id) && id > 0))) {
  console.error('usage: node moderate.mjs <list [visible|hidden] | show N | hide N | unhide N | delete N | delete-comment ID>');
  process.exit(2);
}
// Every command is a fixed statement with the id inlined as a checked integer; no user text reaches the SQL.
const sql = {
  list: () => `SELECT p.id, p.state, p.category, p.nickname, substr(p.headline, 1, 60) AS headline, p.created_at, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comments FROM posts p ${argument === 'visible' || argument === 'hidden' ? `WHERE p.state = '${argument}'` : ''} ORDER BY p.id DESC LIMIT 40`,
  show: () => `SELECT id, state, category, nickname, headline, body, created_at FROM posts WHERE id = ${id}; SELECT id, nickname, body, created_at FROM comments WHERE post_id = ${id} ORDER BY id`,
  hide: () => `UPDATE posts SET state = 'hidden' WHERE id = ${id}`,
  unhide: () => `UPDATE posts SET state = 'visible' WHERE id = ${id}`,
  delete: () => `DELETE FROM comments WHERE post_id = ${id}; DELETE FROM posts WHERE id = ${id}`,
  'delete-comment': () => `DELETE FROM comments WHERE id = ${id}`,
}[command];
if (!sql) { console.error(`unknown command: ${command}`); process.exit(2); }
const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'heung-shing-forum', '--remote', '--command', sql()], { cwd: import.meta.dirname, stdio: 'inherit' });
process.exit(result.status ?? 1);
