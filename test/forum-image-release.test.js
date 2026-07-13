const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

test('city-state preserves current forum WebP paths and migrates legacy PNG paths', () => {
  const source = fs.readFileSync(path.join(ROOT, 'city-state.js'), 'utf8');
  const start = source.indexOf('function normalizeForumImagePath');
  const end = source.indexOf('\nfunction normalizeCityFinanceState', start);
  assert.ok(start >= 0 && end > start, 'forum image sanitizer must be defined in city-state.js');

  const context = vm.createContext({});
  vm.runInContext(source.slice(start, end), context);
  assert.equal(
    vm.runInContext("normalizeForumImagePath('UI/news/rainstorm.webp')", context),
    'UI/news/rainstorm.webp',
  );
  assert.equal(
    vm.runInContext("normalizeForumImagePath('UI/News/rainstorm.png')", context),
    'UI/news/rainstorm.webp',
  );
  assert.equal(vm.runInContext("normalizeForumImagePath('../rainstorm.webp')", context), '');
  assert.match(source, /image: normalizeForumImagePath\(post\?\.image\)/);
});
