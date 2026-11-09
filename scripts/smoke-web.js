#!/usr/bin/env node
// Run against a static server. No local save/weather/model APIs may be present.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium, firefox } = require('playwright-core');
let browser, diagnosticPage;
const browserErrors = [];
(async () => {
  const isFirefox = process.env.WEB_TEST_BROWSER === 'firefox';
  browser = await (isFirefox ? firefox.launch({ headless: true })
    : chromium.launch({ headless: true, ...(process.env.WEB_TEST_BROWSER ? { channel: process.env.WEB_TEST_BROWSER }
      : process.env.CI ? {} : { channel: 'chrome' }) }));
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  context.setDefaultTimeout(120000);
  const page = await context.newPage();
  diagnosticPage = page;
  await page.addInitScript(() => { globalThis.HEUNG_SHING_SMOKE_TEST = true; });
  const failures = [], requests = [];
  let bytes = 0;
  if (!isFirefox) {
    const network = await context.newCDPSession(page);
    await network.send('Network.enable');
    network.on('Network.loadingFinished', event => { bytes += event.encodedDataLength; });
  }
  page.on('pageerror', error => { failures.push(error.message); browserErrors.push(error.message); });
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('response', response => {
    requests.push(response.url());
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(process.env.WEB_TEST_URL || 'http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('typeof gameReady !== "undefined" && gameReady', null, { timeout: 120000 });
  for (const [language, main, sub] of [['en', 'Import City', 'Restore Backup'], ['zhHant', 'Import City', '匯入城市存檔'], ['ja', '都市を読み込む', 'Import City']]) {
    await page.evaluate(language => setLanguage(language), language);
    const labels = await page.locator('#btn-import-city').evaluate(button => ({
      main: button.querySelector('.landing-btn-main')?.textContent,
      sub: button.querySelector('.landing-btn-sub')?.textContent,
      textLayer: Number(getComputedStyle(button.querySelector('.landing-btn-main')).zIndex),
      backgroundLayer: Number(getComputedStyle(button, '::before').zIndex),
    }));
    assert.equal(labels.main, main); assert.equal(labels.sub, sub);
    assert(labels.textLayer > labels.backgroundLayer, 'the import label must appear above its white background');
  }
  await page.evaluate(() => setLanguage('zhHant'));
  const titleChooser = page.waitForEvent('filechooser');
  await page.locator('#btn-import-city').click();
  await (await titleChooser).setFiles([]);
  console.log(JSON.stringify({ stage: 'title', MiB: +(bytes / 1048576).toFixed(2), failures: failures.slice(0, 15) }));
  assert.equal(await page.evaluate('HeungShingStorage.writable'), true);
  await page.evaluate(async () => { await startNewGame('網頁驗收城市'); setGameSpeed(GAME_SPEEDS.PAUSED); });
  assert.equal(await page.evaluate('saveGame()'), true);
  const rows = await page.evaluate('listSaves()');
  assert.equal(rows.filter(row => row.save_type === 'manual').length, 1);
  const downloadPromise = page.waitForEvent('download');
  const before = await page.evaluate(() => { const snapshot = JSON.parse(JSON.stringify(buildSavePayload())); exportCurrentCity(); return snapshot; });
  const download = await downloadPromise;
  const filename = process.env.WEB_SAVE_PATH || '/private/tmp/heung-shing-web-smoke.heungshing';
  await download.saveAs(filename);
  const exported = JSON.parse(fs.readFileSync(filename, 'utf8'));
  assert.equal(exported.format, 'heung-shing-city-save');
  assert.deepEqual(exported.payload.save_data.city, before.save_data.city);
  const downloadBytes = fs.statSync(filename).size;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('typeof gameReady !== "undefined" && gameReady', null, { timeout: 120000 });
  const reopened = await page.evaluate('listSaves()');
  assert.equal(reopened.find(row => row.id === rows[0].id).city_name, '網頁驗收城市');
  assert.equal(await page.evaluate(id => loadSaveById(id, activeScene), rows[0].id), true);
  await page.evaluate('hideLandingScreen(); setGameSpeed(GAME_SPEEDS.PAUSED)');
  page.on('dialog', dialog => dialog.accept());
  const importedMessage = await page.evaluate(() => platformText('imported'));
  const importedDialog = page.waitForEvent('dialog', {
    predicate: dialog => dialog.message().includes(importedMessage), timeout: 30000,
  });
  const chooserPromise = page.waitForEvent('filechooser');
  await page.evaluate('chooseCityImport()');
  const chooser = await chooserPromise;
  await chooser.setFiles(filename);
  await importedDialog;
  assert.equal((await page.evaluate('listSaves()')).filter(row => row.save_type === 'manual').length, 2);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('typeof gameReady !== "undefined" && gameReady', null, { timeout: 120000 });
  assert.equal((await page.evaluate('listSaves()')).filter(row => row.save_type === 'manual').length, 2);
  assert.equal(await page.evaluate(id => loadSaveById(id, activeScene), rows[0].id), true);
  await page.evaluate('hideLandingScreen(); setGameSpeed(GAME_SPEEDS.PAUSED)');
  assert.equal(requests.some(url => /\/api\/(saves|terrains)/.test(url)), false, 'city data must stay local');
  await page.screenshot({ path: process.env.WEB_SCREENSHOT_PATH || '/private/tmp/heung-shing-web-smoke.png' });
  console.log(JSON.stringify({ stage: 'saved-reopened-exported-imported-offline', downloadBytes, MiB: +(bytes / 1048576).toFixed(2), failures: failures.slice(0, 30) }));
  await browser.close();
  assert.deepEqual(failures, [], 'browser must not have missing assets or uncaught errors');
})().catch(async error => {
  console.error(error);
  console.error(JSON.stringify({ browserErrors, state: await diagnosticPage?.evaluate(() => ({
    ready: typeof gameReady === 'undefined' ? null : gameReady,
    status: document.getElementById('landing-load-status')?.textContent,
  })).catch(() => null) }));
  await browser?.close(); process.exitCode = 1;
});
