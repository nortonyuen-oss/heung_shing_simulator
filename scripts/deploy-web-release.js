#!/usr/bin/env node
// Promotion with compensation. No local or browser city data is involved.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const wrangler = args => execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], { encoding: 'utf8' });
let previous = null;
try {
  const data = JSON.parse(wrangler(['deployments', 'list', '--config', 'wrangler.web.jsonc', '--json']));
  const rows = Array.isArray(data) ? data : data.deployments;
  const latest = rows?.sort((a, b) => String(b.created_on || b.created_at).localeCompare(String(a.created_on || a.created_at)))[0];
  previous = latest?.versions?.find(version => version.percentage === 100)?.version_id || null;
} catch (error) {
  const diagnostic = String(error.stderr || error.stdout || error.message);
  if (!/10007|not found|does not exist/i.test(diagnostic)) throw error;
}
fs.mkdirSync('release', { recursive: true });
fs.writeFileSync('release/previous-web-version.json', JSON.stringify({ versionId: previous }));
try {
  process.stdout.write(wrangler(['deploy', '--config', 'wrangler.web.jsonc']));
  execFileSync(process.execPath, ['scripts/verify-published-web.js'], { stdio: 'inherit' });
} catch (error) {
  if (previous) process.stdout.write(wrangler(['rollback', previous, '--config', 'wrangler.web.jsonc', '--yes', '--message', 'Release verification failed']));
  else console.error('First deployment failed verification; official browser entry remains unpublished.');
  throw error;
}
