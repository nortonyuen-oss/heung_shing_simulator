#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const target = path.join(ROOT, 'release/site');
const source = process.argv[2];
const manifest = source ? JSON.parse(fs.readFileSync(path.resolve(source), 'utf8'))
  : { available: false, version: require('../package.json').version };
if (manifest.available === true && (!manifest.commitSha || !/^https:\/\//.test(manifest.playUrl)
  || !manifest.webDeploymentId || !manifest.desktopAssets?.length)) throw new Error('Incomplete verified release manifest');
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'docs'), target, { recursive: true, filter: file => !file.endsWith('.md') });
fs.writeFileSync(path.join(target, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Official site prepared for ${manifest.version}; browser play ${manifest.available ? 'published' : 'pending'}`);
