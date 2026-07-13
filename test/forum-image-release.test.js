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

test('resolution result news uses packaged WebP assets at generation and display boundaries', () => {
  const councilNews = fs.readFileSync(path.join(ROOT, 'council-news.js'), 'utf8');
  const newspaper = fs.readFileSync(path.join(ROOT, 'newspaper.js'), 'utf8');
  assert.doesNotMatch(councilNews, /['"`]UI\/News\/[a-zA-Z0-9_.-]+\.png['"`]/);
  assert.match(councilNews, /['"`]UI\/news\/footballStarVisit\.webp['"`]/);
  assert.match(newspaper, /const imagePath = normalizeForumImagePath\(article\.image\)/);
  assert.match(newspaper, /forumImage\.src = imagePath/);
});

test('startup does not request the removed legacy building tile set', () => {
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const catalog = fs.readFileSync(path.join(ROOT, 'model-catalog.js'), 'utf8');
  assert.doesNotMatch(main, /Models\/PNG\/buildingTiles_/);
  assert.doesNotMatch(main, /BUILDING_KEYS\.forEach/);
  assert.doesNotMatch(catalog, /const BUILDING_KEYS/);
  assert.doesNotMatch(catalog, /HOUSE_MODEL_SETS_LEGACY/);
  assert.doesNotMatch(catalog, /commercialBuilding3-02\.png/);
});
