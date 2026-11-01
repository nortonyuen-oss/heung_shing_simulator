const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function getFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.ok(start >= 0, `missing function ${functionName}`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, nextFunction >= 0 ? nextFunction : source.length);
}

test('terrain previews cannot overwrite the active city elevation state', () => {
  const main = require('./main-source').mainSource;
  const landing = fs.readFileSync(path.join(ROOT, 'landing-screen.js'), 'utf8');
  const generator = getFunctionSource(main, 'generateRealisticTerrainMap');
  const defaultWorldGenerator = getFunctionSource(main, 'generateTerrainMap');
  const profileWorldGenerator = getFunctionSource(main, 'generateTerrainMapByProfile');

  // Map previews (map-sources.js) call generateRealisticTerrainMap directly.
  // It must remain pure; only explicit world-generation wrappers may commit
  // the returned height and metadata to the live city globals.
  assert.doesNotMatch(generator, /\bheightMap\s*=/);
  assert.doesNotMatch(generator, /\bcurrentTerrainMetadata\s*=/);
  assert.match(defaultWorldGenerator, /commitGeneratedTerrainState\(generated\)/);
  assert.match(profileWorldGenerator, /commitGeneratedTerrainState\(generated\)/);
  const mapSources = fs.readFileSync(path.join(ROOT, 'map-sources.js'), 'utf8');
  assert.doesNotMatch(mapSources, /\bgenerateTerrainMap(ByProfile)?\(/, 'map previews must not commit terrain to the live city');

  // Language changes during gameplay must not rebuild the hidden landing-page
  // terrain previews at all.
  assert.match(landing, /languagechange[\s\S]*?if \(screen\.style\.display === 'none'\) return;[\s\S]*?renderSetupScreen\(\)/);
});
