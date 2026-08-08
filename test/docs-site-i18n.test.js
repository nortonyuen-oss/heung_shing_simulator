const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');

function loadSiteI18n() {
  const context = vm.createContext({
    window: { localStorage: { getItem() { return null; }, setItem() {} } },
    navigator: { languages: ['zh-HK'], language: 'zh-HK' },
    document: { addEventListener() {}, querySelectorAll: () => [] },
    console,
  });
  vm.runInContext(fs.readFileSync(path.join(DOCS, 'i18n.js'), 'utf8'), context, { filename: 'i18n.js' });
  return context;
}

function resolvePath(obj, key) {
  return key.split('.').reduce((node, part) => (node == null ? node : node[part]), obj);
}

test('every data-i18n key used in the public site resolves to a real string in all languages', () => {
  const context = loadSiteI18n();
  const SITE_TEXT = vm.runInContext('SITE_TEXT', context);
  const SITE_LANGUAGES = vm.runInContext('SITE_LANGUAGES', context);

  const usedKeys = new Set();
  ['index.html', 'guide.html'].forEach((file) => {
    const html = fs.readFileSync(path.join(DOCS, file), 'utf8');
    const regex = /data-i18n="([^"]+)"/g;
    let match;
    while ((match = regex.exec(html))) usedKeys.add(match[1]);
  });
  assert.ok(usedKeys.size > 0, 'expected to find at least one data-i18n attribute');

  const broken = [];
  usedKeys.forEach((key) => {
    SITE_LANGUAGES.forEach((lang) => {
      const value = resolvePath(SITE_TEXT[lang], key);
      if (value === undefined || typeof value === 'object') broken.push(`${lang}: ${key}`);
    });
  });
  assert.deepEqual(broken, [], `unresolved data-i18n keys:\n${broken.join('\n')}`);
});

test('gallery, manual table/notes, feature list and download cards stay the same length across languages', () => {
  const context = loadSiteI18n();
  const SITE_LANGUAGES = vm.runInContext('SITE_LANGUAGES', context);
  const sourcesLength = vm.runInContext('SITE_GALLERY_SOURCES.length', context);

  SITE_LANGUAGES.forEach((lang) => {
    const galleryLength = vm.runInContext(`SITE_GALLERY['${lang}'].length`, context);
    const manualRowsLength = vm.runInContext(`SITE_MANUAL_ROWS['${lang}'].length`, context);
    const manualNotesLength = vm.runInContext(`SITE_MANUAL_NOTES['${lang}'].length`, context);
    const featureListLength = vm.runInContext(`SITE_FEATURE_LIST['${lang}'].length`, context);
    const downloadCardsLength = vm.runInContext(`SITE_TEXT['${lang}'].downloads.cards.length`, context);

    assert.equal(galleryLength, sourcesLength, `${lang}: gallery caption count must match SITE_GALLERY_SOURCES`);
    assert.equal(manualRowsLength, vm.runInContext("SITE_MANUAL_ROWS['zh-HK'].length", context), `${lang}: manual table row count`);
    assert.equal(manualNotesLength, vm.runInContext("SITE_MANUAL_NOTES['zh-HK'].length", context), `${lang}: manual notes count`);
    assert.equal(featureListLength, vm.runInContext("SITE_FEATURE_LIST['zh-HK'].length", context), `${lang}: feature list count`);
    assert.equal(downloadCardsLength, 4, `${lang}: download cards count`);
  });
});

test('every changelog release has a translation for zh-TW, en and ja', () => {
  const context = loadSiteI18n();
  const baseVersions = Array.from(vm.runInContext("SITE_CHANGELOG['zh-HK'].map((entry) => entry.version)", context));
  ['zh-TW', 'en', 'ja'].forEach((lang) => {
    const translatedVersions = Array.from(
      vm.runInContext(`Object.keys(SITE_CHANGELOG_TRANSLATIONS['${lang}'])`, context),
    );
    const missing = baseVersions.filter((version) => !translatedVersions.includes(version));
    assert.deepEqual(missing, [], `${lang} is missing changelog translations for: ${missing.join(', ')}`);
  });
});

test('the game guide has the same section ids and block counts in every language', () => {
  const context = loadSiteI18n();
  const SITE_LANGUAGES = Array.from(vm.runInContext('SITE_LANGUAGES', context));
  const baseIds = Array.from(vm.runInContext("SITE_GUIDE['zh-HK'].sections.map((section) => section.id)", context));
  const baseBlockCounts = Array.from(vm.runInContext(
    "SITE_GUIDE['zh-HK'].sections.map((section) => section.blocks.length)",
    context,
  ));

  SITE_LANGUAGES.forEach((lang) => {
    const ids = Array.from(vm.runInContext(`SITE_GUIDE['${lang}'].sections.map((section) => section.id)`, context));
    const blockCounts = Array.from(vm.runInContext(
      `SITE_GUIDE['${lang}'].sections.map((section) => section.blocks.length)`,
      context,
    ));
    assert.deepEqual(ids, baseIds, `${lang}: guide section ids/order must match`);
    assert.deepEqual(blockCounts, baseBlockCounts, `${lang}: guide section block counts must match`);
  });
});

test('every gallery image source referenced by the site exists on disk', () => {
  const context = loadSiteI18n();
  const sources = vm.runInContext('SITE_GALLERY_SOURCES', context);
  sources.forEach((relativePath) => {
    const fullPath = path.join(DOCS, relativePath);
    assert.ok(fs.existsSync(fullPath), `missing gallery asset: ${relativePath}`);
  });
});
