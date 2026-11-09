#!/usr/bin/env node
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
(async () => {
  const base = process.env.PLAY_URL || 'https://heung-shing-play.nortonyuen.workers.dev';
  const response = await fetch(`${base}/data/app-info.json`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  assert(response.ok, `Web app metadata: HTTP ${response.status}`);
  const info = await response.json();
  assert.equal(info.version, require('../package.json').version);
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(info.commitSha, commit, 'Deployment is not this release commit');
  const index = await fetch(base, { signal: AbortSignal.timeout(15000) }); assert(index.ok);
  const html = await index.text();
  for (const match of html.matchAll(/<script src="([^"]+)"/g)) {
    const script = await fetch(new URL(match[1], base), { method: 'HEAD', signal: AbortSignal.timeout(15000) });
    assert(script.ok, `Missing deployed script ${match[1]}`);
  }
  console.log(`Verified deployed web v${info.version} at ${base}, commit ${commit}.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
