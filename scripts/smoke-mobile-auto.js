#!/usr/bin/env node
// Fresh browser contexts: phones must select Mobile Beta without a query or saved preference.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const url = new URL(process.env.MOBILE_TEST_URL || 'http://127.0.0.1:4187/');
url.searchParams.delete('ui');
const out = path.resolve('.data/mobile-auto');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CI ? {} : { channel: 'chrome' }) });
  const errors = [];
  try {
    fs.mkdirSync(out, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120000 });
    assert.deepEqual(await page.evaluate(() => [getUiProfilePreference(), getUiProfile(), new URL(location.href).searchParams.has('ui')]), ['auto', 'touch', false]);
    assert(await page.locator('#mobile-beta-notice').isVisible());
    assert.match(await page.locator('#mobile-beta-notice').textContent(), /Beta|ベータ/);
    console.log('PASS fresh phone automatically selects Mobile Beta without a URL override');
    await page.waitForFunction(() => typeof gameReady !== 'undefined' && gameReady, null, { timeout: 180000 });
    await page.click('#btn-new-game');
    await page.evaluate(() => document.getElementById('btn-start-city').click());
    await page.waitForFunction(() => mobileGameVisible() && !document.getElementById('mobile-ui').hidden, null, { timeout: 120000 });
    await page.evaluate(() => { setSimSpeed(0); setFestivalsEnabled(false); });
    const cdp = await context.newCDPSession(page);
    for (const [label, width, height, insets] of [
      ['portrait', 393, 852, { top: 59, left: 0, right: 0, bottom: 34 }],
      ['landscape', 852, 393, { top: 0, left: 59, right: 59, bottom: 0 }],
    ]) {
      await page.setViewportSize({ width, height });
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
      for (const language of ['en', 'zhHant', 'ja']) {
        const layout = await page.evaluate(language => {
          setLanguage(language); mobileUpdateStatus();
          const rects = selector => [...document.querySelectorAll(selector)].map(el => el.getBoundingClientRect()).filter(rect => rect.height > 0);
          const labels = rects('.m-top .m-kpi small').map(rect => rect.top);
          const values = rects('.m-top .m-kpi strong').map(rect => rect.top);
          const beta = document.querySelector('.m-top .m-beta').getBoundingClientRect();
          const top = document.querySelector('.m-top').getBoundingClientRect();
          return { profile: getUiProfile(), preference: getUiProfilePreference(), labels, values, betaVisible: beta.height > 0 && beta.top >= top.top && beta.bottom <= top.bottom };
        }, language);
        assert.equal(layout.profile, 'touch'); assert.equal(layout.preference, 'auto');
        assert(layout.betaVisible);
        assert(Math.max(...layout.labels) - Math.min(...layout.labels) < 1);
        assert(Math.max(...layout.values) - Math.min(...layout.values) < 1);
        console.log(`PASS ${label}/${language}: Beta stays visible, KPI rows align, rotation keeps touch`);
      }
      await page.screenshot({ path: path.join(out, `${label}.png`) });
    }
    await context.close();
    const desktop = await browser.newContext({ viewport: { width: 600, height: 800 }, hasTouch: false });
    const desktopPage = await desktop.newPage();
    await desktopPage.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120000 });
    assert.deepEqual(await desktopPage.evaluate(() => [getUiProfilePreference(), getUiProfile()]), ['auto', 'desktop']);
    assert.equal(await desktopPage.locator('#mobile-beta-notice').isVisible(), false);
    console.log('PASS narrow mouse desktop automatically keeps the desktop interface');
    await desktop.close();
    assert.deepEqual(errors, []);
    console.log('PASS automatic selection has no uncaught browser errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
