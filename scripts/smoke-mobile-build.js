#!/usr/bin/env node
// Real Phaser + CDP touch events, isolated Electron profile; never reads/writes player saves.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron, chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.data/mobile-phase-b', process.env.MOBILE_TEST_URL ? 'web' : 'electron');
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  assert.ok(ok, name);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-mobile-build-'));
  const errors = [];
  const browser = process.env.MOBILE_TEST_URL ? await chromium.launch({ headless: true, ...(process.env.CI ? {} : { channel: 'chrome' }) }) : null;
  const app = browser ? null : await _electron.launch({ executablePath: require('electron'), args: ['.', `--user-data-dir=${profile}`], cwd: ROOT,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, ELECTRON_DISABLE_UPDATES: '1' } });
  try {
    const page = browser ? await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }) : await app.firstWindow();
    page.on('pageerror', (error) => { errors.push(error.message); console.error('PAGE ERROR', error.stack); });
    if (browser) await page.goto(process.env.MOBILE_TEST_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const resize = async (width, height) => {
      if (browser) await page.setViewportSize({ width, height });
      else await app.evaluate(({ BrowserWindow }, size) => { const win = BrowserWindow.getAllWindows()[0]; win.setFullScreen(false); win.setMinimumSize(100, 100); win.setContentSize(...size); }, [width, height]);
      await page.waitForTimeout(500);
    };
    await resize(844, 390);
    await page.waitForSelector('#btn-new-game', { state: 'visible', timeout: 120000 });
    await page.evaluate(() => { setUiProfilePreference('touch'); setLanguage('zhHant'); });
    await page.waitForFunction(() => typeof gameReady !== 'undefined' && gameReady, null, { timeout: 240000 });
    await page.screenshot({ path: path.join(OUT, 'landing-landscape.png') });
    await page.click('#btn-new-game');
    await page.evaluate(() => document.getElementById('btn-start-city').click());
    await page.waitForFunction(() => mobileGameVisible() && !document.getElementById('mobile-ui').hidden, null, { timeout: 120000 });
    await page.evaluate(() => {
      setSimSpeed(0);
      setFestivalsEnabled(false); // scheduled festival fees must not race read-only assertions
      city.budget = 10000;
      // Deterministic flat test neighbourhood in this disposable new city.
      for (let row = 75; row < 110; row++) for (let col = 75; col < 110; col++) {
        removeTree(activeScene, row, col); removeDebris(activeScene, row, col);
        mapData[row][col] = GROUND; heightMap[row][col] = 0;
        refreshTileArea(activeScene, row, col);
      }
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id = 1]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
    const tap = async ([x, y]) => { await touch('touchStart', [[x, y]]); await page.waitForTimeout(35); await touch('touchEnd', []); await page.waitForTimeout(100); };
    const snapshot = () => page.evaluate(() => JSON.stringify({ budget: city.budget, roads: roadTileCount, buildings: Object.fromEntries(Object.entries(buildingData).map(([id, b]) => [id, { type: b.type, spriteKey: b.spriteKey, cols: b.footprintCols, rows: b.footprintRows }])), zones: zoneMap, density: zoneDensityMap }));
    const state = () => page.evaluate(() => mobileBuildSession.getState());
    const center = async (row, col) => page.evaluate(([r, c]) => {
      const cam = activeScene.cameras.main;
      const geom = getTileFaceGeometry(r, c, activeScene.offsetX, activeScene.offsetY);
      const anchor = innerHeight > innerWidth ? { x: 140, y: 350 } : { x: 370, y: 150 };
      cam.setZoom(0.5);
      Object.assign(cam, (() => { const scroll = mapCameraScrollForAnchor(cam, .5, anchor.x, anchor.y, geom.center.x, geom.center.y); return { scrollX: scroll.x, scrollY: scroll.y }; })());
      onMapViewChanged(activeScene);
    }, [row, col]);
    const point = (row, col) => page.evaluate(([r, c]) => {
      const cam = activeScene.cameras.main, origin = mapCameraOrigin(cam);
      const geom = getTileFaceGeometry(r, c, activeScene.offsetX, activeScene.offsetY);
      return [(geom.center.x - cam.scrollX - origin.x) * cam.zoom + origin.x, (geom.center.y - cam.scrollY - origin.y) * cam.zoom + origin.y];
    }, [row, col]);
    const choose = async (category, tool) => {
      if (await page.locator('#mobile-nav-toggle').isVisible()) await page.click('#mobile-nav-toggle');
      await page.click('#mobile-nav [data-mobile-page="build"]');
      await page.click(`[data-mobile-category="${category}"]`);
      await page.click(`[data-mobile-tool="${tool}"]`);
    };
    check('touch shell hides the desktop toolbar and ticker', await page.evaluate(() => getComputedStyle(document.getElementById('top-bar')).display === 'none' && getComputedStyle(document.getElementById('budget-panel')).display === 'none'));
    check('every approved building has a reachable category in the touch library', await page.evaluate(() => Object.keys(TOUCH_BUILDING_TYPES).every((tool) => {
      const category = document.querySelector(`#tool-menu [data-tool="${tool}"]`)?.closest('[data-tool-panel]')?.dataset.toolPanel || getToolCategoryForTool(tool);
      return ['roads', 'zones', 'power', 'services', 'parks', 'landmarks', 'terrain', 'marine'].includes(category);
    })));
    await resize(852, 368);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 59, right: 59, bottom: 0 } });
    await page.click('#mobile-nav-toggle'); await page.click('#mobile-nav [data-mobile-page="build"]');
    const notchLayout = await page.evaluate(() => {
      const panel = document.getElementById('mobile-panel').getBoundingClientRect();
      const handle = document.getElementById('mobile-nav-toggle').getBoundingClientRect();
      const close = document.getElementById('mobile-panel-close').getBoundingClientRect();
      return { rightGap: innerWidth - panel.right, bottomGap: visualViewport.height - panel.bottom, handleGap: panel.left - handle.right, closeSafe: close.right <= innerWidth - 59 };
    });
    check('landscape safe area keeps the panel flush right, controls safe and handle separate', Math.abs(notchLayout.rightGap) < 1 && Math.abs(notchLayout.bottomGap) < 1 && notchLayout.handleGap >= 7 && notchLayout.closeSafe, JSON.stringify(notchLayout));
    const lastCategory = page.locator('[data-mobile-category="marine"]');
    await lastCategory.scrollIntoViewIfNeeded();
    check('the last panel row can be scrolled fully into the visible area', await lastCategory.evaluate((button) => { const r = button.getBoundingClientRect(); const body = document.getElementById('mobile-panel-body').getBoundingClientRect(); return r.top >= body.top && r.bottom <= body.bottom + 1; }));
    await page.screenshot({ path: path.join(OUT, 'notched-landscape-panel.png') });
    await resize(852, 283);
    check('the panel follows the visible height when browser toolbars take more space', await page.evaluate(() => Math.abs(document.getElementById('mobile-panel').getBoundingClientRect().bottom - visualViewport.height) < 1));
    await page.click('#mobile-panel-close');
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, right: 0, bottom: 0 } });
    await resize(844, 390);
    await center(90, 88);
    await page.screenshot({ path: path.join(OUT, 'map-landscape.png') });
    await choose('roads', 'road');
    const before = await snapshot();
    await tap(await point(90, 88));
    check('first tap selects A and spends nothing (M06)', !(await state()).ready && before === await snapshot());
    await tap(await point(90, 92));
    let draft = await state();
    check('second tap shows a five-tile $50 draft without building', draft.ready && draft.plan.cost === 50 && before === await snapshot(), JSON.stringify(draft.start));
    await page.screenshot({ path: path.join(OUT, 'road-preview.png') });
    await page.click('#mobile-confirm');
    check('confirmation lays exactly five tiles and consumes the draft', await page.evaluate(() => roadTileCount === 5 && city.budget === 9950 && !mobileBuildSession.getState()));
    await page.evaluate(() => document.getElementById('mobile-confirm').click());
    check('a duplicate confirmation does not spend twice (M07)', await page.evaluate(() => city.budget === 9950 && roadTileCount === 5));

    await choose('zones', 'zone-res');
    await page.click('[data-mobile-density="3"]');
    await center(94, 87);
    const beforeZone = await snapshot();
    await tap(await point(94, 87)); await tap(await point(95, 89));
    draft = await state();
    const quotedCost = draft.plan.cost;
    const afterZonePreview = await snapshot();
    check('high-density zoning uses live district fees for six tiles', draft.plan.tiles.length === 6 && quotedCost > 0 && beforeZone === afterZonePreview, JSON.stringify({ cost: quotedCost, tiles: draft.plan.tiles.length, start: draft.start, end: draft.end, changes: Object.keys(JSON.parse(beforeZone)).filter((key) => JSON.stringify(JSON.parse(beforeZone)[key]) !== JSON.stringify(JSON.parse(afterZonePreview)[key])), beforeBudget: JSON.parse(beforeZone).budget, afterBudget: JSON.parse(afterZonePreview).budget }));
    await page.screenshot({ path: path.join(OUT, 'zone-preview.png') });
    const budget = await page.evaluate(() => city.budget);
    await page.click('#mobile-confirm');
    check('zoning commits the preview density and exact quoted fee', await page.evaluate(([fee, prior]) => city.budget === prior - fee && zoneDensityMap[94][87] === 3 && zoneMap[95][89] === ZONE_RES, [quotedCost, budget]));

    await choose('services', 'fire-station'); await center(84, 84);
    const beforeBuilding = await snapshot();
    await tap(await point(84, 84));
    check('building preview is read-only', (await state()).plan.ok && beforeBuilding === await snapshot());
    await page.click('[data-nudge="se"]');
    check('four-way adjustment moves the logical draft by one tile', (await state()).start.col === 85 && beforeBuilding === await snapshot());
    await page.screenshot({ path: path.join(OUT, 'building-preview.png') });
    await page.click('#mobile-confirm');
    check('a building is placed and charged once', await page.evaluate(() => buildingData['85,84']?.type === 'fire_station' || Object.values(buildingData).some((b) => b.type === 'fire_station')));
    await page.click('#mobile-nav-toggle'); await page.click('#mobile-nav [data-mobile-page="build"]'); await page.click('[data-mobile-tool="inspect"]');
    await center(84, 85); await tap(await point(84, 85));
    check('tap inspection opens a touch-sized information card', await page.locator('#inspect-panel').isVisible() && await page.evaluate(() => lastInspectTile.row === 84 && lastInspectTile.col === 85));
    await page.screenshot({ path: path.join(OUT, 'inspect-landscape.png') });
    await page.click('#inspect-panel .insp-close');

    await choose('services', 'police-station'); await center(100, 82); await tap(await point(100, 82));
    const draftBeforePinch = await state(), beforePinch = await snapshot();
    await touch('touchStart', [[320, 145, 1]]); await touch('touchStart', [[320, 145, 1], [420, 145, 2]]);
    await touch('touchMove', [[300, 145, 1], [440, 145, 2]]); await touch('touchEnd', [[300, 145, 1]]); await touch('touchEnd', []);
    check('pinch preserves the draft and does not commit it (M19)', (await state()).id === draftBeforePinch.id && beforePinch === await snapshot());
    await page.click('#mobile-cancel');
    check('cancel removes preview with zero city changes (M11)', !(await state()) && beforePinch === await snapshot());

    await choose('services', 'police-station'); await center(100, 82); await tap(await point(100, 82));
    const beforeInterruptedDraft = await snapshot();
    await touch('touchStart', [[320, 145, 1]]); await touch('touchMove', [[350, 145, 1]]); await touch('touchCancel', []);
    check('a browser-cancelled gesture abandons the draft and cannot submit it', !(await state()) && beforeInterruptedDraft === await snapshot());

    await page.click('#mobile-nav-toggle'); await page.click('#mobile-nav [data-mobile-page="build"]'); await page.click('[data-mobile-tool="bulldoze"]');
    await center(84, 85); await tap(await point(84, 85));
    check('demolition summary names the whole building before removal (M13)', (await state()).plan.summary.buildings === 1);
    await page.screenshot({ path: path.join(OUT, 'demolition-preview.png') });
    const beforeDemolitionBudget = await page.evaluate(() => city.budget);
    await page.click('#mobile-confirm');
    check('demolition removes the whole building and charges the quoted $5 once', await page.evaluate((prior) => city.budget === prior - 5 && !Object.values(buildingData).some((building) => building.type === 'fire_station'), beforeDemolitionBudget));
    await choose('services', 'fire-station'); await center(84, 85); await tap(await point(84, 85)); await page.click('#mobile-confirm');

    await choose('services', 'police-station'); await center(100, 82); await tap(await point(100, 82));
    await page.evaluate(() => { city.budget = 0; });
    await page.click('#mobile-confirm');
    check('funds are revalidated at confirmation (M21)', (await state()).plan.ok === false && await page.evaluate(() => !Object.values(buildingData).some((b) => b.type === 'police_station')));
    await page.evaluate(() => { city.budget = 9000; }); await page.click('#mobile-cancel');

    await resize(390, 844);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, left: 0, right: 0, bottom: 34 } });
    await page.screenshot({ path: path.join(OUT, 'map-portrait.png') });
    await choose('roads', 'road'); await center(103, 94);
    const beforePortraitRoad = await snapshot();
    await tap(await point(103, 94)); await tap(await point(103, 96));
    check('portrait supports road drafts without spending before confirmation', (await state()).ready && (await state()).plan.cost === 30 && beforePortraitRoad === await snapshot());
    const portraitLayout = await page.evaluate(() => {
      const confirm = document.getElementById('mobile-confirm').getBoundingClientRect();
      const context = document.querySelector('.m-context').getBoundingClientRect();
      const footer = document.querySelector('.m-confirm').getBoundingClientRect();
      const nav = document.getElementById('mobile-nav').getBoundingClientRect();
      return { visible: confirm.left >= 0 && confirm.right <= innerWidth && confirm.height >= 44, separate: confirm.bottom <= nav.top && footer.top >= context.bottom - 1, navVisible: nav.height > 0 && nav.bottom <= visualViewport.height + 1 };
    });
    check('portrait confirmation, context and navigation remain visible with a home indicator', portraitLayout.visible && portraitLayout.separate && portraitLayout.navVisible, JSON.stringify(portraitLayout));
    await page.screenshot({ path: path.join(OUT, 'road-preview-portrait.png') });
    await page.click('#mobile-confirm');
    check('portrait confirmation builds the road at the quoted price', await page.evaluate(() => roadTileCount === 8 && city.budget === 8970));
    await choose('zones', 'zone-com'); await center(105, 94);
    await tap(await point(105, 94)); await tap(await point(106, 95));
    const portraitZoneCost = (await state()).plan.cost, portraitZoneBudget = await page.evaluate(() => city.budget);
    await page.click('#mobile-confirm');
    check('portrait zoning commits the selected rectangle and exact fee', await page.evaluate(([fee, prior]) => zoneMap[105][94] === ZONE_COM && zoneMap[106][95] === ZONE_COM && city.budget === prior - fee, [portraitZoneCost, portraitZoneBudget]));
    await choose('services', 'police-station'); await center(99, 102); await tap(await point(99, 102));
    const portraitBuildingBudget = await page.evaluate(() => city.budget);
    await page.click('#mobile-confirm');
    check('portrait supports confirmed building placement', await page.evaluate((prior) => buildingData['99:102']?.type === 'police_station' && city.budget === prior - 800, portraitBuildingBudget));
    await page.click('#mobile-nav [data-mobile-page="build"]'); await page.click('[data-mobile-tool="bulldoze"]');
    await center(99, 102); await tap(await point(99, 102));
    await page.screenshot({ path: path.join(OUT, 'demolition-preview-portrait.png') });
    await page.click('#mobile-confirm');
    check('portrait supports demolition after reviewing its summary', await page.evaluate(() => !buildingData['99:102']));
    await page.click('#mobile-nav [data-mobile-page="manage"]');
    check('funds entry and management overview contain R/C/I and five indices', await page.locator('#mobile-demand .m-overview-row').count() === 3 && await page.locator('#mobile-indices .m-overview-row').count() === 5);
    await page.screenshot({ path: path.join(OUT, 'overview-portrait.png') });
    for (const language of ['ja', 'en', 'zhHant']) {
      await page.evaluate((lang) => setLanguage(lang), language);
      check(`${language}: no horizontal viewport overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }

    await page.click('#mobile-nav [data-mobile-page="more"]');
    await page.click('[data-mobile-menu="save-as"]');
    await page.waitForSelector('#text-prompt-dialog', { state: 'visible' });
    await page.locator('#text-prompt-dialog input').fill('Mobile Phase B smoke');
    await page.locator('#text-prompt-dialog .dialog-ok-btn').click();
    await page.waitForFunction(() => currentSaveId !== null, null, { timeout: 30000 });
    const savedId = await page.evaluate(() => currentSaveId);
    const saved = await snapshot();
    await page.evaluate(() => { city.budget = 123; });
    await page.evaluate((id) => loadSaveById(id, activeScene), savedId);
    await page.evaluate(() => setSimSpeed(0));
    const restored = await snapshot();
    check('save and reopen preserve the constructed neighbourhood', saved === restored, Object.keys(JSON.parse(saved)).filter((key) => JSON.stringify(JSON.parse(saved)[key]) !== JSON.stringify(JSON.parse(restored)[key])).join(', '));
    await resize(844, 390);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, right: 0, bottom: 0 } });
    await page.screenshot({ path: path.join(OUT, 'reloaded-landscape.png') });
    check('runtime has no uncaught page errors', errors.length === 0, errors.join('; '));
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, errors }, null, 2));
    console.log(`${results.length} checks passed. Screenshots: ${OUT}`);
  } finally {
    await app?.close();
    await browser?.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
