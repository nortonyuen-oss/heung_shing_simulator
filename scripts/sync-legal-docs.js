#!/usr/bin/env node
'use strict';

// Publish byte-identical canonical legal text for GitHub Pages.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(arg => arg !== '--check')) {
  throw new Error('Usage: node scripts/sync-legal-docs.js [--check]');
}
let stale = false;
for (const [source, destination] of [
  ['LICENSE', 'docs/LICENSE.txt'],
  ['THIRD_PARTY_NOTICES.md', 'docs/THIRD_PARTY_NOTICES.txt'],
]) {
  const bytes = fs.readFileSync(path.join(root, source));
  const target = path.join(root, destination);
  if (check) {
    if (!fs.existsSync(target) || !fs.readFileSync(target).equals(bytes)) {
      console.error(`Out of date: ${destination}. Run node scripts/sync-legal-docs.js.`);
      stale = true;
    }
  } else fs.writeFileSync(target, bytes);
}
if (stale) process.exitCode = 1;
else console.log(check ? 'Published legal text matches the canonical files.' : 'Updated website legal text.');
