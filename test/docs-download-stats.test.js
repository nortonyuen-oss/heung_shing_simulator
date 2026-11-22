const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function release(id, downloads = 0, extra = {}) {
  return { id, tag_name: `v${id}.0.0`, html_url: `https://github.com/example/releases/tag/v${id}.0.0`,
    assets: [{ name: `The.City.of.Heung.Shing-${id}.0.0-arm64.dmg`, download_count: downloads,
      browser_download_url: `https://example.com/${id}.dmg` }], ...extra };
}

function setup(fetch) {
  const elements = new Map(['[data-total-downloads]', '[data-latest-version]', '[data-latest-published]']
    .map(selector => [selector, [{ textContent: 'loading' }]]));
  elements.set('[data-release-link]', [{}]);
  elements.set('[data-download-link]', [{ dataset: { downloadLink: 'mac-arm64' } }]);
  const events = new Map();
  const context = vm.createContext({ fetch, Intl,
    SITE_INTL_LOCALE: { en: 'en-US', ja: 'ja-JP' }, siteCurrentLanguage: 'en',
    SITE_TEXT: { en: { stats: { notAvailable: 'unavailable', downloadsUnit: 'downloads' } },
      ja: { stats: { notAvailable: 'unavailable', downloadsUnit: 'ダウンロード' } } },
    document: { querySelectorAll: selector => elements.get(selector) || [],
      addEventListener: (name, handler) => events.set(name, handler) },
    console: { warn() {} },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/site.js'), 'utf8'), context);
  return { context, events, elements, count: () => elements.get('[data-total-downloads]')[0].textContent };
}

const ok = data => ({ ok: true, json: async () => data });

test('download counter includes releases beyond the first 100, and keeps the latest download links', async () => {
  const requests = [];
  const firstPage = Array.from({ length: 100 }, (_, i) => release(110 - i, i === 0 ? 1398 : 0));
  const fixture = setup(async (url, options) => {
    requests.push(new URL(url));
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Accept, 'application/vnd.github+json');
    assert.equal(fixture.count(), 'loading', 'never show the incomplete first-page total');
    return ok(requests.length === 1 ? firstPage : [firstPage[0], release(10, 82)]);
  });
  await fixture.context.loadReleaseStats();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].searchParams.get('page'), '2');
  assert.equal(fixture.count(), '1,480 downloads');
  assert.equal(fixture.elements.get('[data-latest-version]')[0].textContent, 'v110.0.0');
  assert.equal(fixture.elements.get('[data-download-link]')[0].href, 'https://example.com/110.dmg');
  fixture.context.siteCurrentLanguage = 'ja';
  fixture.events.get('sitelanguagechange')();
  assert.equal(fixture.count(), '1,480 ダウンロード');
  assert.equal(requests.length, 2, 'switching language uses the complete cached result');
});

test('exactly 100 releases fetch the following empty page before finalizing the count', async () => {
  let requests = 0;
  const fixture = setup(async () => ok(++requests === 1
    ? Array.from({ length: 100 }, (_, i) => release(100 - i, 1)) : []));
  await fixture.context.loadReleaseStats();
  assert.equal(requests, 2);
  assert.equal(fixture.count(), '100 downloads');
});

test('drafts, prereleases and updater metadata do not inflate public downloads', async () => {
  const stable = release(3, 2);
  stable.assets.push({ name: 'latest.yml', download_count: 900 },
    { name: 'The.City.of.Heung.Shing.Setup.3.0.0.exe.blockmap', download_count: 900 },
    { name: 'The.City.of.Heung.Shing.Setup.3.0.0.exe', download_count: 3 },
    { name: 'The.City.of.Heung.Shing.3.0.0.exe', download_count: 4 },
    { name: 'The.City.of.Heung.Shing-3.0.0-x64.dmg', download_count: 5 },
    { name: 'The.City.of.Heung.Shing-3.0.0-android.apk', download_count: 6 });
  const fixture = setup(async () => ok([release(5, 500, { draft: true }),
    release(4, 400, { prerelease: true }), stable]));
  await fixture.context.loadReleaseStats();
  assert.equal(fixture.count(), '20 downloads');
  assert.equal(fixture.elements.get('[data-latest-version]')[0].textContent, 'v3.0.0');
});

test('a failed later page shows unavailable instead of a misleading partial download count', async () => {
  let requests = 0;
  const fixture = setup(async () => ++requests === 1
    ? ok(Array.from({ length: 100 }, (_, i) => release(110 - i, 1)))
    : { ok: false, status: 503 });
  await fixture.context.loadReleaseStats();
  assert.equal(requests, 2);
  assert.equal(fixture.count(), 'unavailable');
});

test('a malformed release response shows unavailable instead of zero downloads', async () => {
  const fixture = setup(async () => ok({ message: 'API unavailable' }));
  await fixture.context.loadReleaseStats();
  assert.equal(fixture.count(), 'unavailable');
});
