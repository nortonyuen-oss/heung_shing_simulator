#!/usr/bin/env node
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let browser, server;
(async () => {
  const root = path.resolve(__dirname, '../release/site');
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    try {
      if (!file.startsWith(root + path.sep)) throw new Error('path');
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
      response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); response.end(fs.readFileSync(file));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch(process.env.CI ? { headless: true } : { channel: 'chrome', headless: true });
  const page = await browser.newPage();
  let unavailable = false, playPosts = 0;
  await page.route('**/release-manifest.json', route => route.fulfill({ json: { available: true, version: '5.5.0',
    playUrl: 'https://play.example', statisticsUrl: 'https://statistics.example',
    desktopAssets: ['The.City.of.Heung.Shing-5.5.0-arm64.dmg', 'The.City.of.Heung.Shing-5.5.0-x64.dmg',
      'The.City.of.Heung.Shing.Setup.5.5.0.exe', 'The.City.of.Heung.Shing.5.5.0.exe'],
    mobileAssets: ['The.City.of.Heung.Shing-5.5.0-android.apk'] } }));
  await page.route('https://statistics.example/**', route => {
    if (route.request().method() === 'POST') playPosts += 1;
    return unavailable ? route.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Unavailable' })
      : route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json: { webPlaySessions: 12345,
        since: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T12:00:00Z', status: 'available' } });
  });
  await page.route('https://api.github.com/**', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction('document.querySelector("[data-web-play-total]").textContent.includes("12,345")');
  for (const language of ['zh-HK', 'zh-TW', 'en', 'ja']) {
    await page.evaluate(language => setSiteLanguage(language), language);
    await page.waitForFunction(() => document.querySelector('[data-web-copy="play"]').textContent.length > 0);
    assert.equal(await page.locator('[data-web-play-link]').first().getAttribute('href'), 'https://play.example');
    assert.match(await page.locator('[data-download-link="mac-arm64"]').getAttribute('href'), /5\.5\.0-arm64\.dmg$/);
    assert.match(await page.locator('[data-download-link="android"]').getAttribute('href'), /5\.5\.0-android\.apk$/);
  }
  // the 1999 site: the shell, the latest three orders, the chart, a panel's lightbox, the release history page
  await page.evaluate(() => setSiteLanguage('zh-HK'));
  assert.equal(await page.locator('.hs-nav > a').count(), 6, 'six places in the nav');
  assert.equal(await page.locator('[data-render="latest-orders"] li').count(), 3);
  assert.equal(await page.locator('.hs-pin').count(), 18);
  assert.equal(await page.locator('.hs-chip').count(), 18);
  await page.locator('.hs-chip').nth(4).click();
  assert.match(await page.locator('[data-render="campaign-chapter"] b').textContent(), /第 5 章/);
  assert.equal(await page.locator('.hs-pin.is-on').textContent(), '5');
  await page.locator('.hs-panel').first().click();
  await page.waitForFunction(() => document.querySelector('[data-gallery-dialog]').open);
  assert.ok((await page.locator('[data-gallery-dialog-title]').textContent()).length > 0);
  await page.locator('[data-gallery-close]').click();
  const version = require('../package.json').version;
  await page.goto(`http://127.0.0.1:${server.address().port}/changelog.html`);
  await page.waitForSelector('.hs-group[open] .hs-release.is-latest');
  assert.match(await page.locator('.hs-release.is-latest .v').textContent(), new RegExp(`^v${version.replace(/\./g, '\\.')}$`));
  assert.ok(await page.locator('.hs-group').count() >= 6, 'one group per major version');
  assert.equal(await page.locator('.hs-group[open]').count(), 1, 'only the newest group starts open');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const file of ['index.html', 'changelog.html', 'gallery.html', 'guide.html', 'news.html']) {
    await page.goto(`http://127.0.0.1:${server.address().port}/${file}`);
    await page.waitForSelector('.hs-bottom-nav');
    assert.ok(await page.locator('.hs-bottom-nav').isVisible(), `${file}: the phone has the bottom bar`);
    assert.equal(await page.locator('.hs-nav').isVisible(), false, `${file}: the phone hides the left nav`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), `${file}: no sideways scroll on a phone`);
    // the phone picks its language from the top bar's picker (the four buttons are desktop only)
    assert.ok(await page.locator('.hs-lang-select').isVisible(), `${file}: the phone has a language picker`);
  }
  await page.selectOption('.hs-lang-select', 'en');
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  assert.equal(await page.locator('.hs-footer-langs .lang-btn.active').textContent(), 'English');
  await page.selectOption('.hs-lang-select', 'zh-HK');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(() => setSiteLanguage('ja')); // the checks below read the Japanese fallbacks
  unavailable = true;
  await page.reload();
  await page.waitForFunction('document.querySelector("[data-web-play-time]").textContent.includes("未更新")');
  assert.equal(await page.locator('[data-web-play-total]').textContent(), '12,345');
  await page.evaluate(() => localStorage.removeItem('heung-shing.website-play-stats.v1'));
  await page.reload();
  await page.waitForFunction('document.querySelector("[data-web-play-total]").textContent === "現在利用できません"');
  assert.equal(playPosts, 0, 'viewing the website cannot add play sessions');
  console.log('Official website: four languages, published links, the 1999 shell, chart, lightbox, release history, phone layout, cached counts and unavailable fallback passed.');
  await browser.close(); await new Promise(resolve => server.close(resolve));
})().catch(async error => { console.error(error); await browser?.close(); server?.close(); process.exitCode = 1; });
