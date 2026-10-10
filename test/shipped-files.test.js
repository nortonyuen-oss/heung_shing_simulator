const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

// What git would ship: CI builds from a clean checkout, so a file the app loads that is only on
// this machine works here and is missing from the installers. (v4.18.0 shipped server.js asking
// for coastal-weather-service.js, which was never committed: the app could not start.)
function trackedFiles() {
  try {
    return new Set(execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean));
  } catch {
    return null;
  }
}

function localRequires(file) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const found = new Set();
  for (const m of source.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
    let target = path.normalize(path.join(path.dirname(file), m[1]));
    if (!/\.(js|json|cjs)$/.test(target)) target = fs.existsSync(path.join(ROOT, `${target}.js`)) ? `${target}.js` : path.join(target, 'index.js');
    found.add(target);
  }
  return found;
}

test('everything the Electron main process loads is committed', (t) => {
  const tracked = trackedFiles();
  if (!tracked) return t.skip('not a git checkout');
  const seen = new Set();
  const queue = ['electron-main.js', 'electron-preload.js', 'server.js'];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    assert.ok(tracked.has(file), `${file} is loaded at start-up but not committed`);
    localRequires(file).forEach((next) => queue.push(next));
  }
});

test('every script the page loads is committed', (t) => {
  const tracked = trackedFiles();
  if (!tracked) return t.skip('not a git checkout');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1].split('?')[0])
    .filter((src) => !/^(https?:)?\/\//.test(src));
  assert.ok(scripts.length > 50);
  const missing = scripts.filter((src) => !tracked.has(src));
  assert.deepEqual(missing, [], `loaded by index.html but not committed: ${missing.join(', ')}`);
});
