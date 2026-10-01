const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

// index.html loads the game as classic <script>s that share one global scope. A second
// top-level `function foo` silently replaces the first (whichever file loads later wins,
// even if the copies have drifted apart), and a second top-level const/let/class throws
// at load time - so every top-level name must be declared by exactly one game script.
function listGameScripts() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script\s+src="([\w./-]+\.js)"/g)]
    .map((match) => match[1])
    .filter((file) => !/^https?:/.test(file));
}

function listTopLevelNames(source) {
  const pattern = /^(?:async\s+)?function\s*\*?\s*([\w$]+)|^(?:const|let|var|class)\s+([\w$]+)/gm;
  return [...source.matchAll(pattern)].map((match) => match[1] || match[2]);
}

test('no two game scripts declare the same top-level name', () => {
  const scripts = listGameScripts();
  assert.ok(scripts.length > 50, 'index.html script list must remain discoverable');

  const declaredIn = new Map();
  for (const file of scripts) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const name of listTopLevelNames(source)) {
      if (!declaredIn.has(name)) declaredIn.set(name, []);
      declaredIn.get(name).push(file);
    }
  }

  const collisions = [...declaredIn]
    .filter(([, files]) => files.length > 1)
    .map(([name, files]) => `${name}: ${files.join(', ')}`);
  assert.deepEqual(collisions, [], `top-level names declared more than once:\n${collisions.join('\n')}`);
});
