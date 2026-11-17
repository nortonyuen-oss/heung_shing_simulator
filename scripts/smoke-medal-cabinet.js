#!/usr/bin/env node
'use strict';
// Exercise the actual cabinet and production styles in a disposable browser/profile.
// No game server, real city, player database, or external service is touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { MEDAL_DEFS } = require('../medal-definitions');
const { renderBauhiniaMedalSvg } = require('../medal-art');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.data/medal-cabinet');
const stamp = (city = '堅尼地城', month = 12) => ({ city, year: 1913, month, at: `2026-11-${String(month).padStart(2, '0')}T00:00:00Z` });
const earnedIds = ['A01', 'A02', 'A04', 'A08', 'A09', 'A10', 'A11', 'A12', 'A13', 'A14', 'A16', 'A17'];
const profile = { schemaVersion: 1, earned: {}, parts: { A03: { region: stamp(), port: stamp('太子') }, A07: { nightBazaar: stamp() } }, facts: {} };
earnedIds.forEach((id, index) => {
  profile.earned[id] = stamp('堅尼地城', index + 1);
  if (MEDAL_DEFS.find((def) => def.id === id).parts) profile.parts[id] = Object.fromEntries(MEDAL_DEFS.find((def) => def.id === id).parts.map((part) => [part.id, stamp()]));
});
const styles = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[0]).join('\n');
const fixture = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">${styles}<link rel="stylesheet" href="mobile-ui.css"><link rel="stylesheet" href="medal-cabinet.css"><style>body{background:linear-gradient(#07101b66,#07101b66),url('UI/backgroundTitle.webp') center/cover}#fixture-open{position:fixed;top:0;left:0}</style></head><body><button id="fixture-open" onclick="openMedalCabinet()">勳章</button><script>
window.fixtureLanguage='zhHant';window.fixtureProfile=${JSON.stringify(profile)};
window.getCurrentLanguage=()=>window.fixtureLanguage;
window.HeungShingStorage={request:async()=>window.fixtureFail?{ok:false,status:500}:{ok:true,json:async()=>({data:window.fixtureProfile})}};
</script><script src="medal-art.js"></script><script src="medal-definitions.js"></script><script src="medals.js"></script></body></html>`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CI ? {} : { channel: 'chrome' }) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  await context.route('http://medals.test/**', async (route) => {
    const name = new URL(route.request().url()).pathname;
    if (name === '/') return route.fulfill({ contentType: 'text/html', body: fixture });
    const file = path.resolve(ROOT, `.${name}`);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' };
    return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const card = (id) => page.locator(`[data-medal-id="${id}"]`);
  const cards = () => page.locator('[data-medal-id]');
  const search = () => page.locator('[data-medal-search]');
  const chooseSeries = (id) => page.locator(`[data-medal-series="${id}"]`).click();
  const filter = (id) => page.locator(`[data-medal-filter="${id}"]`).click();
  async function checkLayout(name) {
    const failures = await page.evaluate(() => {
      const dialog = document.querySelector('#medal-cabinet-dialog .dialog-box');
      const bounds = dialog.getBoundingClientRect();
      const failures = [];
      if (bounds.left < 0 || bounds.top < 0 || bounds.right > innerWidth + 1 || bounds.bottom > innerHeight + 1) failures.push('dialog outside viewport');
      for (const selector of ['.dialog-body', '.mc-nav', '.mc-gallery', '.mc-detail', '.medal-grid', '.mc-header']) {
        const el = dialog.querySelector(selector);
        if (selector === '.mc-nav' && innerWidth <= 760) continue; // The mobile category strip scrolls horizontally.
        if (el.getClientRects().length && el.scrollWidth > el.clientWidth + 1) failures.push(`${selector}: horizontal overflow ${el.scrollWidth - el.clientWidth}`);
      }
      const footer = dialog.querySelector('.mc-footer').getBoundingClientRect();
      if (footer.bottom > bounds.bottom + 1) failures.push('footer outside dialog');
      return failures;
    });
    assert.deepEqual(failures, [], name);
  }
  try {
    await page.goto('http://medals.test/');
    await page.locator('#fixture-open').click();
    assert.equal(await cards().count(), 36);
    assert.equal(await page.locator('[data-medal-completion] strong').textContent(), '12');
    await card('A03').click();
    assert.match(await page.locator('.mc-detail').textContent(), /已完成 2 \/ 3/);
    assert.match(await page.locator('.mc-detail').textContent(), /太子/);
    await checkLayout('desktop');
    await page.screenshot({ path: path.join(OUT, 'desktop.png') });
    await chooseSeries('B');
    assert.equal(await cards().count(), 14);
    await filter('earned');
    assert.equal(await cards().count(), 0);
    await filter('unearned');
    assert.equal(await cards().count(), 14);
    await chooseSeries('all');
    assert.equal(await cards().count(), 24);
    await filter('all');
    await search().fill('超級');
    assert.equal(await cards().count(), 1);
    assert.equal(await card('A03').count(), 1);
    assert.equal(await search().evaluate((el) => el === document.activeElement), true);
    // A newly recorded objective must update the open cabinet even before a medal is earned.
    await search().fill('A07');
    await search().focus();
    await page.evaluate(() => {
      window.city = { name: '測試城', year: 1914, month: 1, activePolicies: {}, council: {} };
      window.buildingData = { stadium: { type: 'football_stadium' } };
      runMedalEvaluation();
    });
    assert.match(await card('A07').textContent(), /2 \/ 8/);
    assert.equal(await search().evaluate((el) => el === document.activeElement), true, 'live progress refresh keeps search focused');
    await page.evaluate(() => { delete window.city; delete window.buildingData; });
    await search().fill('荒謬之都');
    assert.equal(await cards().count(), 0, 'secret names cannot be searched');
    await search().fill('C01');
    await card('C01').click();
    assert.doesNotMatch(await page.locator('.mc-detail').textContent(), /荒謬之都|麒麟|黑紫荊/);
    await page.evaluate(() => { getMedalProfile().earned.C01 = { at: '2026-11-17', city: '<img src=x onerror=alert(1)>', year: 1914, month: 1 }; });
    await page.evaluate(() => openMedalCabinet());
    assert.match(await page.locator('.mc-detail').textContent(), /荒謬之都/);
    assert.equal(await page.locator('.mc-detail img').count(), 0, 'city names are escaped');
    await search().fill('');
    await page.locator('[data-medal-sort]').selectOption('recent');
    assert.equal(await cards().first().getAttribute('data-medal-id'), 'C01');
    await page.locator('[data-medal-sort]').selectOption('progress');
    assert.equal(await cards().first().getAttribute('data-medal-id'), 'A03');
    await page.locator('[data-medal-sort]').selectOption('catalogue');
    // A fresh browser context/profile is not needed to verify all three shipped languages.
    for (const language of ['zhHant', 'en', 'ja']) {
      await page.evaluate((language) => { window.fixtureLanguage = language; return openMedalCabinet(); }, language);
      for (const [name, width, height, touch] of [['desktop', 1280, 800, false], ['tablet', 768, 1024, true], ['phone', 393, 852, true], ['small-phone', 320, 568, true], ['landscape', 852, 393, true]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate((touch) => { document.documentElement.dataset.uiProfile = touch ? 'touch' : 'desktop'; }, touch);
        if (await page.locator('[data-medal-back]').isVisible()) await page.locator('[data-medal-back]').click();
        await checkLayout(`${language}/${name}`);
        await card('A07').click();
        await checkLayout(`${language}/${name}/long checklist`);
        if (width <= 760) {
          assert.equal(await page.locator('[data-medal-back]').isVisible(), true);
          if (language === 'zhHant' && name === 'phone') await page.screenshot({ path: path.join(OUT, 'phone-detail.png') });
          await page.locator('[data-medal-back]').click();
          assert.equal(await card('A07').evaluate((el) => el === document.activeElement), true);
          if (language === 'zhHant' && name === 'phone') await page.screenshot({ path: path.join(OUT, 'phone.png') });
        }
      }
    }
    // Focus stays inside the modal, and returns to the invoking control on close.
    await page.locator('[data-medal-close]').focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('.mc-detail').evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('[data-medal-close]').evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#medal-cabinet-dialog').isVisible(), false);
    assert.equal(await page.locator('#fixture-open').evaluate((el) => el === document.activeElement), true);
    // Empty player collection, failed load and a successful retry.
    await page.reload();
    await page.evaluate(() => { window.fixtureProfile = null; });
    // Initial load might have finished: clear the in-memory data for the empty collection case.
    await page.evaluate(() => { const p = getMedalProfile(); p.earned = {}; p.parts = {}; return openMedalCabinet(); });
    assert.equal(await page.locator('[data-medal-completion] strong').textContent(), '0');
    await filter('earned');
    assert.equal(await cards().count(), 0);
    const failed = await context.newPage();
    await failed.addInitScript(() => { window.fixtureFail = true; });
    await failed.goto('http://medals.test/');
    await failed.evaluate(() => openMedalCabinet());
    assert.equal(await failed.locator('[data-medal-retry]').count(), 1);
    assert.equal(await failed.locator('[data-medal-completion] strong').textContent(), '—');
    await failed.evaluate(() => { window.fixtureFail = false; });
    await failed.locator('[data-medal-retry]').click();
    await failed.waitForFunction(() => document.querySelector('[data-medal-completion] strong').textContent === '12');
    await failed.close();
    assert.deepEqual(errors, []);
    const art = await context.newPage();
    await art.setViewportSize({ width: 1120, height: 820 });
    const tiers = [['bronze', '銅紫荊', 'BRONZE'], ['silver', '銀紫荊', 'SILVER'], ['gold', '金紫荊', 'GOLD'], ['bauhinia', '洋紫荊', 'BAUHINIA'], ['black', '黑紫荊', 'BLACK'], ['memorial', '紀念勳章', 'MEMORIAL'], ['grand', '香城大紫荊', 'GRAND BAUHINIA'], ['secret', '未揭曉', 'UNDISCOVERED']];
    await art.setContent(`<html lang="zh-Hant"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:42px 48px;background:#111d2c;color:#eeeae1;font-family:'Noto Sans TC','Segoe UI',sans-serif}header{border-bottom:1px solid #2c3c4d;padding-bottom:24px}small{font-size:10px;letter-spacing:3px;color:#dec18a}h1{font-size:28px;font-weight:500;letter-spacing:4px;margin:10px 0 8px}p{font-size:12px;color:#9aa9ba;margin:0}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;margin-top:28px}.medal{text-align:center;border:1px solid #2c3c4d;border-radius:8px;padding:18px;background:radial-gradient(ellipse at 50% 30%,#dec18a09,transparent 80%)}svg{width:166px;height:178px;display:block;margin:0 auto 12px}h2{font-size:15px;font-weight:500;letter-spacing:2px;margin:0 0 7px}.medal small{font-size:8px;letter-spacing:2px;color:#9aa9ba}</style></head><body><header><small>HEUNG SHING · HONOURS COLLECTION</small><h1>洋紫荊勳章</h1><p>五瓣琺瑯洋紫荊 · 金屬雕邊 · 紫色綬帶</p></header><div class="grid">${tiers.map(([tier, label, en]) => `<div class="medal">${renderBauhiniaMedalSvg(tier)}<h2>${label}</h2><small>${en}</small></div>`).join('')}</div></body></html>`);
    await art.screenshot({ path: path.join(OUT, 'artwork.png') });
    await art.close();
    console.log('PASS: collection, filters, search, secrecy, escaping, sorting, focus, empty/error/retry; 3 languages × 5 viewports; no browser errors.');
    console.log(`Screenshots: ${OUT}`);
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
