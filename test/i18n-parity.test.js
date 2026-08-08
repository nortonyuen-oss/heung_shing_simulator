const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadI18N() {
  const context = vm.createContext({
    console,
    document: { addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    navigator: { language: 'en' },
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8'), context, { filename: 'i18n.js' });
  return vm.runInContext('I18N', context);
}

test('every translation key is defined in all three languages', () => {
  const I18N = loadI18N();
  const languages = Object.keys(I18N);
  const allKeys = new Set(languages.flatMap((lang) => Object.keys(I18N[lang])));

  languages.forEach((lang) => {
    const keys = new Set(Object.keys(I18N[lang]));
    const missing = [...allKeys].filter((key) => !keys.has(key));
    assert.deepEqual(missing, [], `${lang} is missing translations for: ${missing.join(', ')}`);
  });
});

test('every literal t() call site in the codebase resolves to a defined key', () => {
  const I18N = loadI18N();
  const enKeys = new Set(Object.keys(I18N.en));

  const SKIP_DIRS = new Set(['node_modules', '.git', 'test', 'release', '.data', 'Models']);
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
        continue;
      }
      if (entry.name.endsWith('.js') && entry.name !== 'i18n.js') files.push(path.join(dir, entry.name));
    }
  }(ROOT));

  const missingCalls = [];
  files.forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    const regex = /\bt\(\s*(['"])([a-zA-Z0-9_.]+)\1/g;
    let match;
    while ((match = regex.exec(source))) {
      const key = match[2];
      if (!enKeys.has(key)) missingCalls.push(`${path.relative(ROOT, file)}: ${key}`);
    }
  });

  assert.deepEqual(missingCalls, [], `t() called with undefined keys:\n${missingCalls.join('\n')}`);
});
