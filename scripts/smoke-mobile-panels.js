#!/usr/bin/env node
// Real browser, disposable city and storage. Never attaches to the player's tab.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const url = process.env.MOBILE_TEST_URL || 'http://127.0.0.1:4187/?ui=touch';
const out = path.resolve('.data/mobile-panels', process.env.MOBILE_PANEL_LAYOUT_ONLY === '1' ? 'layouts' : '.');
const results = [], errors = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${JSON.stringify(detail)}` : ''}`);
  assert.ok(ok, name);
}
async function checkPanelLayouts(page, cdp) {
  await page.evaluate(() => { city.population = 40000; setExpansionEnabled('transport', true); updateTransportUnlockState({ notify: false }); });
  const keys = ['finance', 'budget', 'council', 'stocks', 'charts', 'overlay', 'jukebox', 'roads', 'transport-routes', 'transport-fleet', 'transport-demand', 'transport-finances'];
  for (const [orientation, width, height, insets] of [
    ['portrait', 393, 700, { top: 0, left: 0, right: 0, bottom: 0 }],
    ['landscape', 852, 368, { top: 0, left: 59, right: 59, bottom: 0 }],
  ]) {
    await page.setViewportSize({ width, height });
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
    for (const language of ['en', 'zhHant', 'ja']) {
      await page.evaluate(language => setLanguage(language), language);
      const failures = [];
      for (const key of keys) {
        await page.evaluate(key => { mobileClosePanel(); if (key === 'overlay') activeOverlay = 'pollution'; mobileShowNative(key); }, key);
        const variants = key === 'council' ? ['people', 'laws', 'history'] : key === 'stocks' ? ['market', 'trading']
          : key === 'transport-routes' ? ['bus', 'ferry', 'metro', 'tram'] : key === 'transport-fleet' ? ['list', 'buy']
            : key === 'transport-finances' ? ['overview', 'history', 'company'] : [''];
        for (const tab of variants) {
          const layout = await page.evaluate(async ({ key, tab }) => {
            const selector = key === 'council' ? `[data-council-tab="${tab}"]` : key === 'stocks' ? `[data-stock-tab="${tab}"]` : `[data-transport-action="panel-tab"][data-tab="${tab}"]`;
            if (tab) document.querySelector(selector)?.click();
            await new Promise(requestAnimationFrame);
            const panel = document.getElementById('mobile-panel').getBoundingClientRect();
            const close = document.getElementById('mobile-panel-close').getBoundingClientRect();
            const body = document.getElementById('mobile-panel-body');
            return { right: panel.right, bottom: panel.bottom, closeRight: close.right, overflow: body.scrollWidth - body.clientWidth };
          }, { key, tab });
          if (layout.right > width || layout.bottom > height || layout.closeRight > width - insets.right || layout.overflow > 1) failures.push({ key, tab, ...layout });
        }
      }
      check(`${orientation}/${language}: all 12 windows and their tabs fit`, failures.length === 0, failures);
    }
  }
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CI ? {} : { channel: 'chrome' }) });
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
    page.on('pageerror', error => { errors.push(error.message); console.error(error.stack); });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => typeof gameReady !== 'undefined' && gameReady, null, { timeout: 180000 });
    await page.evaluate(() => setLanguage('zhHant'));
    await page.click('#btn-new-game');
    await page.evaluate(() => document.getElementById('btn-start-city').click());
    await page.waitForFunction(() => mobileGameVisible() && !document.getElementById('mobile-ui').hidden, null, { timeout: 120000 });
    await page.evaluate(() => { setSimSpeed(0); setFestivalsEnabled(false); city.budget = 200000; });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, left: 0, right: 0, bottom: 34 } });
    if (process.env.MOBILE_PANEL_LAYOUT_ONLY === '1') { await checkPanelLayouts(page, cdp); check('no uncaught browser errors', errors.length === 0, errors); return; }
    const native = key => page.click(`[data-mobile-native="${key}"]`);
    const back = () => page.click('#mobile-panel-back');
    const open = name => page.evaluate(name => mobileOpenPage(name), name);
    await page.evaluate(() => {
      window.mobileOriginalTaxSlider = document.getElementById('tax-slider');
      window.mobileOriginalBudgetNext = document.getElementById('budget-detail').nextSibling;
    });
    await open('manage');
    await native('finance');
    check('finance reuses the original slider and mounts one window', await page.evaluate(() => document.getElementById('tax-slider') === window.mobileOriginalTaxSlider && document.querySelectorAll('#mobile-panel-body .m-native').length === 1));
    await page.locator('#tax-slider').evaluate(el => { el.value = '12'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    check('tax slider changes the simulation through its original handler', await page.evaluate(() => city.taxRate === .12 && document.getElementById('tax-rate-display').textContent === '12%'));
    await page.locator('#budget-roads').evaluate(el => { el.value = '125'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    check('department funding changes the actual city budget setting', await page.evaluate(() => city.departmentBudgets.roads === 125));
    const beforeLoan = await page.evaluate(() => city.budget);
    await page.click('[data-loan-option="0"]');
    check('a loan button applies exactly one loan', await page.evaluate(before => city.budget === before + 5000, beforeLoan));
    check('notifications remain above an open management panel', await page.evaluate(() => Number(getComputedStyle(document.getElementById('toast-container')).zIndex) > Number(getComputedStyle(mobileUi).zIndex)));
    await page.click('#budget-open-window');
    check('native links open a nested panel and keep IDs unique', await page.evaluate(() => mobileNative.key === 'budget' && [...document.querySelectorAll('[id]')].every((el, i, all) => all.findIndex(other => other.id === el.id) === i)));
    await back();
    check('back restores finance with the updated settings', await page.evaluate(() => mobileNative.key === 'finance' && document.getElementById('tax-slider').value === '12'));
    await page.locator('#mobile-panel-body').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: path.join(out, 'finance-portrait.png') });
    await back();
    check('leaving finance restores its exact original DOM location', await page.evaluate(() => document.getElementById('budget-detail').parentElement.id === 'budget-panel' && document.getElementById('budget-detail').nextSibling === window.mobileOriginalBudgetNext));
    await page.evaluate(() => { document.getElementById('mobile-panel-body').scrollTop = 100; });
    const scroll = await page.locator('#mobile-panel-body').evaluate(el => el.scrollTop);
    await native('budget'); await back();
    check('back restores the previous menu scroll position', await page.locator('#mobile-panel-body').evaluate((el, expected) => Math.abs(el.scrollTop - expected) < 1, scroll));
    await page.evaluate(() => { city.population = 12000; mobileRenderPage(); });
    await native('council');
    await page.click('[data-council-tab="laws"]');
    check('council tabs show the existing acts and ordinances', await page.locator('[data-council-panel="laws"]').isVisible());
    await page.screenshot({ path: path.join(out, 'council-portrait.png') });
    await back(); await native('stocks');
    await page.click('[data-stock-tab="trading"]');
    check('stock trading tab is reachable in portrait', await page.locator('[data-stock-panel="trading"]').isVisible());
    await back(); await native('charts');
    await page.locator('[data-chart-series="crime"]').uncheck();
    await page.evaluate(() => setLanguage('en'));
    check('language changes preserve the native chart and selection', await page.evaluate(() => mobileNative.key === 'charts' && !document.querySelector('[data-chart-series="crime"]').checked && document.querySelector('#mobile-panel-body #city-chart-canvas').width > 0));
    await page.screenshot({ path: path.join(out, 'charts-portrait.png') });
    await open('layers'); await page.click('[data-mobile-overlay="pollution"]');
    check('layer map fits the phone panel and has no plus/minus controls', await page.evaluate(() => {
      const map = document.getElementById('overlay-win-body').getBoundingClientRect();
      return mobileNative.key === 'overlay' && map.width <= innerWidth && map.height === 280 && getComputedStyle(document.getElementById('overlay-zoom-in')).display === 'none';
    }));
    const mapBox = await page.locator('#overlay-win-body').boundingBox();
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
    const start = await page.evaluate(() => ({ zoom: mapViewZoom, cityZoom: activeScene.cameras.main.zoom, budget: city.budget }));
    const cx = mapBox.x + mapBox.width / 2, cy = mapBox.y + mapBox.height / 2;
    await touch('touchStart', [[cx - 40, cy, 1], [cx + 40, cy, 2]]);
    await touch('touchMove', [[cx - 70, cy, 1], [cx + 70, cy, 2]]); await touch('touchEnd', []);
    check('pinching the layer map zooms only that map', await page.evaluate(start => mapViewZoom > start.zoom && activeScene.cameras.main.zoom === start.cityZoom && city.budget === start.budget, start));
    await page.screenshot({ path: path.join(out, 'layers-portrait.png') });
    await back();
    check('back from a layer returns to all layer choices', await page.locator('[data-mobile-overlay]').count() === 11);
    await open('more');
    const setting = page.locator('[data-mobile-setting="toggle-weather-effects"]');
    const previousSetting = await setting.getAttribute('aria-pressed');
    await setting.click();
    check('settings toggle updates and remains on the same page', await setting.getAttribute('aria-pressed') !== previousSetting && await page.evaluate(() => mobilePage === 'more'));
    await page.click('[data-mobile-dialog="open-forum-history"]');
    check('forum opens above the mobile UI', await page.evaluate(() => getComputedStyle(document.getElementById('forum-history-dialog')).display !== 'none' && Number(getComputedStyle(document.getElementById('forum-history-dialog')).zIndex) > Number(getComputedStyle(mobileUi).zIndex)));
    await page.click('#forum-history-dialog .newspaper-close-btn');
    await native('jukebox');
    check('jukebox controls are reachable and touch sized', await page.locator('[data-music-action="toggle"]').evaluate(el => el.getBoundingClientRect().height >= 44));
    await back(); await native('roads');
    check('road appearance options are in the mobile panel', await page.locator('#mobile-panel-body #road-tile-set-options').isVisible());
    await open('transport'); await native('transport-routes');
    check('transport opens the existing routes window', await page.evaluate(() => mobileNative.key === 'transport-routes' && !transportPanels.get('routes').root.hidden));
    // A disposable fixture for the existing expansion, without running a simulation month.
    await page.evaluate(() => { setExpansionEnabled('transport', true); city.population = 40000; updateTransportUnlockState({ notify: false }); refreshTransportUi(); });
    await page.click('[data-transport-action="new-route"]');
    await page.locator('[data-transport-field="name"]').fill('Phone draft');
    await page.click('[data-transport-action="pick-stops"]');
    check('stop picking exposes the map and preserves the editor', await page.evaluate(() => mobileUi.classList.contains('is-picking-route') && transportUiState.editor.name === 'Phone draft' && getComputedStyle(document.getElementById('mobile-panel')).visibility === 'hidden'));
    const stopFixture = await page.evaluate(() => {
      for (let row = 86; row < 96; row++) for (let col = 86; col < 100; col++) {
        mapData[row][col] = GROUND; heightMap[row][col] = 0;
      }
      setBusStopSides(90, 90, ['w', 'e']); setBusStopSides(90, 96, ['w', 'e']); syncTransportStops();
      const camera = activeScene.cameras.main;
      const tile = getTileFaceGeometry(90, 90, activeScene.offsetX, activeScene.offsetY);
      camera.setZoom(.5);
      const scroll = mapCameraScrollForAnchor(camera, .5, 180, 340, tile.center.x, tile.center.y);
      camera.scrollX = scroll.x; camera.scrollY = scroll.y;
      onMapViewChanged(activeScene);
      return { budget: city.budget, routes: getTransportExpansionState().routes.length };
    });
    await page.waitForTimeout(100);
    await cdp.send('Input.synthesizeTapGesture', { x: 180, y: 340, duration: 40, gestureSourceType: 'touch' });
    await page.waitForFunction(() => transportUiState.editor.stopIds.length === 1);
    const pickDiagnostic = await page.evaluate(() => {
      const world = mapCameraWorldPoint(activeScene.cameras.main, 180, 340);
      return { stops: transportUiState.editor.stopIds, tile: screenPointToTile(activeScene, world.x, world.y), target: document.elementFromPoint(180, 340)?.tagName, input: activeScene.mapTouchInput.controller.getState(), modal: mobileModalOpen() };
    });
    check('a map tap selects an actual bus stop without committing a route', await page.evaluate(before => transportUiState.editor.stopIds.length === 1 && getTransportExpansionState().routes.length === before.routes && city.budget === before.budget, stopFixture), pickDiagnostic);
    await touch('touchStart', [[150, 390, 1], [230, 390, 2]]);
    await touch('touchMove', [[130, 390, 1], [250, 390, 2]]); await touch('touchEnd', []);
    check('pinching while picking stops never adds another stop', await page.evaluate(() => transportUiState.editor.stopIds.length === 1));
    await page.click('#mobile-route-picker-done');
    check('done selecting returns to the same unsaved route', await page.evaluate(() => !isTransportRoutePicking() && transportUiState.editor.name === 'Phone draft' && transportUiState.editor.stopIds.length === 1 && !mobileUi.classList.contains('is-picking-route')));
    await page.click('[data-transport-action="cancel-editor"]');
    await page.click('[data-transport-action="panel-tab"][data-tab="metro"]');
    check('C3 metro construction is no longer disabled', !(await page.locator('[data-transport-action="metro-new-line"]').isDisabled()));
    await back(); await native('transport-finances');
    await page.click('[data-transport-action="panel-tab"][data-tab="company"]');
    await page.locator('[data-transport-field="companyName"]').fill('Phone Transit');
    await page.evaluate(() => { refreshTransportUi({ passive: true }); setLanguage('ja'); });
    check('unsaved company text survives passive updates and translation', await page.locator('[data-transport-field="companyName"]').inputValue() === 'Phone Transit');
    await page.click('[data-transport-action="save-company"]');
    check('company form saves through the existing handler', await page.evaluate(() => getTransportExpansionState().company.name === 'Phone Transit'));
    await page.evaluate(() => { openVehicleTrackingWindow('transport', 'missing-test-vehicle'); });
    check('vehicle tracking uses the mobile panel', await page.evaluate(() => mobileNative.key.startsWith('tracker:') && !!document.querySelector('#mobile-panel-body .vehicle-tracker-window')));
    await back();
    check('returning from tracking cleans up its camera and DOM', await page.evaluate(() => mobileNative.key === 'transport-finances' && vehicleTrackerManager.trackers.size === 0 && !document.querySelector('.vehicle-tracker-window')));
    for (const [orientation, width, height, insets] of [
      ['portrait', 393, 700, { top: 0, left: 0, right: 0, bottom: 0 }],
      ['landscape', 852, 368, { top: 0, left: 59, right: 59, bottom: 0 }],
    ]) {
      await page.setViewportSize({ width, height });
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
      for (const language of ['en', 'zhHant', 'ja']) {
        await page.evaluate(language => setLanguage(language), language);
        const geom = await page.evaluate(() => {
          const panel = document.getElementById('mobile-panel').getBoundingClientRect();
          const close = document.getElementById('mobile-panel-close').getBoundingClientRect();
          const body = document.getElementById('mobile-panel-body');
          return { right: panel.right, bottom: panel.bottom, closeRight: close.right, overflow: body.scrollWidth - body.clientWidth, height: innerHeight };
        });
        check(`${orientation}/${language}: panel and controls fit the safe viewport`, geom.right <= width && geom.bottom <= height && geom.closeRight <= width - insets.right && geom.overflow < 2, geom);
      }
      await page.screenshot({ path: path.join(out, `transport-${orientation}.png`) });
    }
    await page.evaluate(() => setUiProfilePreference('desktop'));
    check('desktop restores native DOM, roles and independent windows', await page.evaluate(() => {
      openBudgetWindow();
      return !document.querySelector('.m-native') && document.getElementById('budget-window').parentElement === document.body && document.getElementById('budget-window').getAttribute('role') === 'dialog' && getComputedStyle(document.getElementById('budget-window')).position === 'fixed';
    }));
    await page.evaluate(() => { closeBudgetWindow(); setUiProfilePreference('touch'); mobileOpenPage('manage'); mobileShowNative('finance'); document.dispatchEvent(new Event('heungshing:citywillchange')); });
    check('city change releases panels and restores their original parents', await page.evaluate(() => !mobileNative && !mobilePage && document.getElementById('budget-detail').parentElement.id === 'budget-panel'));
    check('no uncaught browser errors', errors.length === 0, errors);
  } finally {
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
    if (page) await page.screenshot({ path: path.join(out, 'last-state.png') }).catch(() => {});
    await browser.close();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
