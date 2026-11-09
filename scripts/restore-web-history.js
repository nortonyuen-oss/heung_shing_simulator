#!/usr/bin/env node
// Restore only a previously published release from this repository.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const cwd = path.resolve(__dirname, '..');
const repository = 'nortonyuen-oss/heung_shing_simulator';
const release = JSON.parse(execFileSync('gh', ['release', 'view', '--repo', repository, '--json', 'tagName,assets'], { cwd, encoding: 'utf8' }));
if (!release.assets.some(asset => asset.name === 'web-assets.tar.gz')) {
  if (release.assets.some(asset => asset.name === 'release-manifest.json')) throw new Error('Published web history is missing');
  console.log('No previous browser release to retain.');
} else {
  const directory = path.join(cwd, '.data/previous-web');
  fs.mkdirSync(directory, { recursive: true });
  execFileSync('gh', ['release', 'download', release.tagName, '--repo', repository, '--pattern', 'web-assets.tar.gz', '--dir', directory, '--clobber'], { cwd, stdio: 'inherit' });
  execFileSync('tar', ['-xzf', path.join(directory, 'web-assets.tar.gz'), '-C', directory, 'web/assets', 'web/asset-retention.json'], { cwd, stdio: 'inherit' });
  console.log(`Retained immutable assets from ${release.tagName}.`);
}
