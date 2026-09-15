#!/usr/bin/env node
// Moderation helper for the memo wall. Runs SQL against the production D1 database through wrangler.
//   node moderate.mjs list [open|closed]      recent memos with reply counts
//   node moderate.mjs show <number>           one memo with all replies
//   node moderate.mjs close <number>          mark handled (stays visible under "closed")
//   node moderate.mjs reopen <number>
//   node moderate.mjs delete <number>         remove a memo and its replies
//   node moderate.mjs delete-reply <id>
import { spawnSync } from 'node:child_process';

const [command, argument] = process.argv.slice(2);
const id = Number(argument);
const needsId = ['show', 'close', 'reopen', 'delete', 'delete-reply'];
if (!command || (needsId.includes(command) && !(Number.isSafeInteger(id) && id > 0))) {
  console.error('usage: node moderate.mjs <list [open|closed] | show N | close N | reopen N | delete N | delete-reply ID>');
  process.exit(2);
}
// Every command is a fixed statement with the id inlined as a checked integer; no user text reaches the SQL.
const sql = {
  list: () => `SELECT m.number, m.state, m.type, m.nickname, substr(m.title, 1, 60) AS title, m.created_at, (SELECT COUNT(*) FROM replies r WHERE r.message_number = m.number) AS replies FROM messages m ${argument === 'open' || argument === 'closed' ? `WHERE m.state = '${argument}'` : ''} ORDER BY m.number DESC LIMIT 40`,
  show: () => `SELECT number, state, type, nickname, title, body, version, platform, created_at FROM messages WHERE number = ${id}; SELECT id, nickname, body, created_at FROM replies WHERE message_number = ${id} ORDER BY id`,
  close: () => `UPDATE messages SET state = 'closed' WHERE number = ${id}`,
  reopen: () => `UPDATE messages SET state = 'open' WHERE number = ${id}`,
  delete: () => `DELETE FROM replies WHERE message_number = ${id}; DELETE FROM messages WHERE number = ${id}`,
  'delete-reply': () => `DELETE FROM replies WHERE id = ${id}`,
}[command];
if (!sql) { console.error(`unknown command: ${command}`); process.exit(2); }
const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'heung-shing-feedback', '--remote', '--command', sql()], { cwd: import.meta.dirname, stdio: 'inherit' });
process.exit(result.status ?? 1);
