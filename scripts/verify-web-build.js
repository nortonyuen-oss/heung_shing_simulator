#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../release/web');
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const files = walk(root);
assert(files.length <= 20000, 'Cloudflare static asset file limit exceeded');
for (const file of files) {
  const relative = path.relative(root, file);
  assert(fs.statSync(file).size <= 25 * 1024 * 1024, `${relative} exceeds the static file size limit`);
  assert(!/\.sqlite|\.dev\.vars|node_modules|^server\.js|^db\.js|^electron-|^services\//.test(relative), `Private/server content: ${relative}`);
  const immutable = path.basename(file).match(/^([a-f0-9]{64})\./);
  if (immutable) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), immutable[1], `Hash mismatch: ${relative}`);
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(!html.includes('cdn.jsdelivr.net'), 'Phaser must be bundled');
for (const match of html.matchAll(/<script src="([^"]+)"/g)) assert(fs.existsSync(path.join(root, match[1])), match[1]);
const report = JSON.parse(fs.readFileSync(path.join(root, 'build-report.json'), 'utf8'));
assert.equal(report.version, require('../package.json').version);
assert.equal(report.saveDataVersion, 15);
console.log(`Verified ${files.length} static files for v${report.version}; no server or city database in web output.`);
