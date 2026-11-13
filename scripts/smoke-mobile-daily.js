#!/usr/bin/env node
// Disposable browser and city; validates C2 with real map taps and native writers/storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const out = path.resolve('.data/mobile-daily');
const url = process.env.MOBILE_TEST_URL || 'http://127.0.0.1:4187/';
const results = [], errors = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${JSON.stringify(detail)}` : ''}`);
  assert.ok(ok, name);
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
    const fixture = await page.evaluate(() => {
      setSimSpeed(0); setFestivalsEnabled(false); city.budget = 100000;
      for (let row = 75; row < 112; row++) for (let col = 75; col < 112; col++) {
        removeTree(activeScene, row, col); removeDebris(activeScene, row, col);
        mapData[row][col] = GROUND; heightMap[row][col] = 0; refreshTileArea(activeScene, row, col);
      }
      placeInfraBuilding(activeScene, 90, 80, 'power_plant_coal', selectInfraPlacementModel('power_plant_coal'));
      placeInfraBuilding(activeScene, 90, 96, 'library', selectInfraPlacementModel('library'));
      placeInfraBuilding(activeScene, 99, 88, 'library', selectInfraPlacementModel('library'));
      const kept = buildingData['99:88'];
      for (let r = 99; r < 99 + kept.footprintRows; r++) for (let c = 88; c < 88 + kept.footprintCols; c++) placeZone(activeScene, r, c, ZONE_RES, DENSITY_LOW);
      commitRoadDrag(activeScene, { row: 95, col: 81 }, { row: 95, col: 81 });
      mapData[96][81] = WATER; refreshTileArea(activeScene, 96, 81);
      placeTree(activeScene, 95, 80, { planted: true }); placeTree(activeScene, 90, 90, { planted: true });
      placePowerLine(activeScene, 96, 82); placePowerLine(activeScene, 90, 89);
      markPowerGridDirty(); updatePowerGrid(activeScene); city.budget = 10000; updateHUD();
      window.mobileDailyTapCount = 0;
      document.addEventListener('heungshing:maptap', () => window.mobileDailyTapCount++);
      return { lineStart: 80 + buildingData['90:80'].footprintCols - 1, libraryPowered: powerMap[90][96], keptCols: kept.footprintCols, keptRows: kept.footprintRows };
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, left: 0, right: 0, bottom: 34 } });
    const draft = () => page.evaluate(() => mobileBuildSession.getState());
    const snapshot = () => page.evaluate(() => JSON.stringify({ budget: city.budget, lines: [...powerLineSet].sort(), trees: treeMap,
      zones: zoneMap, locks: [...lowDensityLockSet].sort(), buildings: buildingData, signs: getDistrictSigns() }));
    const nav = async name => {
      if (await page.locator('#mobile-nav-toggle').isVisible()) await page.click('#mobile-nav-toggle');
      await page.click(`#mobile-nav [data-mobile-page="${name}"]`);
    };
    const choose = async (category, tool) => {
      if (await page.locator('#mobile-cancel').isVisible()) await page.click('#mobile-cancel');
      await nav('build'); await page.click(`[data-mobile-category="${category}"]`); await page.click(`[data-mobile-tool="${tool}"]`);
    };
    const tapAt = async (x, y) => {
      const count = await page.evaluate(() => window.mobileDailyTapCount);
      await cdp.send('Input.synthesizeTapGesture', { x, y, duration: 40, gestureSourceType: 'touch' });
      await page.waitForFunction(count => window.mobileDailyTapCount > count, count, { timeout: 10000 });
    };
    const tapTile = async (row, col) => {
      const point = await page.evaluate(async ([row, col]) => {
        const camera = activeScene.cameras.main;
        const geom = getTileFaceGeometry(row, col, activeScene.offsetX, activeScene.offsetY);
        const x = innerHeight > innerWidth ? 150 : 330, y = innerHeight > innerWidth ? 330 : 150;
        camera.setZoom(.5);
        const scroll = mapCameraScrollForAnchor(camera, .5, x, y, geom.center.x, geom.center.y);
        camera.scrollX = scroll.x; camera.scrollY = scroll.y; onMapViewChanged(activeScene);
        await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
        return { x, y };
      }, [row, col]);
      await tapAt(point.x, point.y);
    };
    const photo = async name => { await page.waitForFunction(() => !document.querySelector('#toast-container .toast'), null, { timeout: 10000 }); await page.screenshot({ path: path.join(out, name + '.png') }); };
    check('automatic Mobile Beta exposes all six C2 tools', await page.evaluate(() => getUiProfile() === 'touch' && getUiProfilePreference() === 'auto' && TOUCH_DAILY_TOOLS.length === 6 && new Set(TOUCH_SUPPORTED_TOOLS).size === 57));
    await choose('parks', 'tree'); const beforeTrees = await snapshot();
    await tapTile(95, 80);
    check('first tree tap selects A without placing or spending', !(await draft()).ready && beforeTrees === await snapshot());
    await tapTile(96, 82);
    check('tree rectangle quotes only two eligible tiles and skips four occupied or invalid tiles', (await draft()).plan.tiles.length === 2 && (await draft()).plan.skipped === 4 && (await draft()).plan.cost === 30 && beforeTrees === await snapshot());
    await page.click('[data-nudge="se"]');
    check('nudging tree endpoint B leaves A fixed', (await draft()).start.row === 95 && (await draft()).start.col === 80 && (await draft()).end.col === 83);
    await page.click('[data-nudge="nw"]');
    await photo('tree-portrait');
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
    await touch('touchStart', [[100, 300, 1], [200, 300, 2]]); await touch('touchMove', [[75, 300, 1], [225, 300, 2]]); await touch('touchEnd', []);
    check('pinching a tree draft never plants or spends', beforeTrees === await snapshot());
    await page.click('#mobile-cancel');
    check('cancelling a tree range leaves the city unchanged', beforeTrees === await snapshot());
    await choose('parks', 'tree'); await tapTile(95, 80); await tapTile(96, 82); await page.click('#mobile-confirm');
    check('confirmed trees charge $30 and retain the native planted flag', await page.evaluate(() => city.budget === 9970 && treeMap[95][82]?.planted && treeMap[96][80]?.planted && !treeMap[95][81] && !treeMap[96][81] && !treeMap[96][82]));
    await choose('zones', 'dezone'); await tapTile(99, 88); await tapTile(99 + fixture.keptRows - 1, 88 + fixture.keptCols - 1);
    check('de-zoning previews the retained building and a free price', (await draft()).plan.keptBuildings === 1 && (await draft()).plan.cost === 0 && await page.locator('#mobile-confirm').textContent() === '確認取消分區');
    await page.evaluate(() => { city.budget = -50; }); await page.click('#mobile-confirm');
    check('de-zoning works in debt and preserves the building and permanent low-density lock', await page.evaluate(() => city.budget === -50 && zoneMap[99][88] === ZONE_NONE && buildingData['99:88']?.type === 'library' && lowDensityLockSet.has('99:88')));
    await page.evaluate(() => { city.budget = 9970; updateHUD(); });
    await choose('power', 'power-line'); const beforeLines = await snapshot();
    await tapTile(90, fixture.lineStart); await tapTile(90, 95);
    const line = (await draft()).plan;
    check('power line preview skips its existing conductor and discloses tree removal', !fixture.libraryPowered && line.skipped === 1 && line.clearedTrees === 1 && line.cost === line.tiles.length * 5 && beforeLines === await snapshot());
    await page.click('#mobile-confirm');
    check('confirming conductors immediately powers the disconnected library', await page.evaluate(cost => powerMap[90][96] && city.budget === 9970 - cost && !treeMap[90][90], line.cost));
    await choose('parks', 'park'); await page.locator('#mobile-recreation-select').selectOption('palm_court'); await tapTile(80, 90);
    const beforePark = await snapshot();
    check('the explicit park picker quotes the selected 2x2 palm court at $500', (await draft()).plan.tiles.length === 4 && (await draft()).plan.cost === 500);
    await page.setViewportSize({ width: 852, height: 393 });
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 59, right: 59, bottom: 0 } });
    check('orientation changes cancel the park draft without building or spending', await page.evaluate(() => !mobileBuildSession.getState()) && beforePark === await snapshot());
    await choose('parks', 'park'); await page.locator('#mobile-recreation-select').selectOption('palm_court'); await tapTile(80, 90);
    await photo('park-landscape'); await page.click('#mobile-confirm');
    check('the palm court uses its selected model, footprint and exact displayed price', await page.evaluate(before => { const record = buildingData['80:90']; return record?.parkVariant === 'palm_court' && record.footprintCols === 2 && record.footprintRows === 2 && city.budget === JSON.parse(before).budget - 500; }, beforePark));
    const moduleKeys = [];
    for (const row of [80, 84]) {
      await choose('parks', 'park'); await page.locator('#mobile-recreation-select').selectOption('victoria_park'); await tapTile(row, 95);
      const plan = (await draft()).plan; moduleKeys.push(plan.spriteKey); await page.click('#mobile-confirm');
      check(`Victoria Park at row ${row} builds the reviewed 4x4 module`, await page.evaluate(({ row, key }) => buildingData[`${row}:95`]?.spriteKey === key && buildingData[`${row}:95`].footprintCols === 4, { row, key: plan.spriteKey }));
    }
    check('repeated park placement retains the native module cycle', moduleKeys[0] !== moduleKeys[1]);
    for (const [variant, row] of [['sports_ground_small', 80], ['sports_ground_large', 84]]) {
      await choose('parks', 'sports-ground'); await page.locator('#mobile-recreation-select').selectOption(variant); await tapTile(row, 85);
      const plan = (await draft()).plan, before = await page.evaluate(() => city.budget); await page.click('#mobile-confirm');
      check(`${variant} builds its selected footprint and charges once`, await page.evaluate(({ variant, row, plan, before }) => buildingData[`${row}:85`]?.type === variant && buildingData[`${row}:85`].footprintCols === plan.footprintCols && city.budget === before - plan.cost, { variant, row, plan, before }));
    }
    for (const [orientation, width, height, insets] of [['portrait', 393, 852, { top: 59, left: 0, right: 0, bottom: 34 }], ['landscape', 852, 393, { top: 0, left: 59, right: 59, bottom: 0 }]]) {
      await page.setViewportSize({ width, height }); await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
      for (const language of ['en', 'zhHant', 'ja']) {
        await page.evaluate(language => setLanguage(language), language);
        for (const tool of ['park', 'district-sign']) {
          await choose(tool === 'park' ? 'parks' : 'maps', tool); await tapTile(105, 100);
          if (tool === 'district-sign') await page.evaluate(() => mobileBuildSession.setOptions({ name: '最長地區名稱'.repeat(5), englishName: 'Long bilingual district name for layout checking 123456' }));
          const layout = await page.evaluate(() => {
            const context = document.querySelector('.m-context').getBoundingClientRect(), footer = document.querySelector('.m-confirm').getBoundingClientRect(), confirm = document.getElementById('mobile-confirm').getBoundingClientRect();
            return { overlap: context.bottom - footer.top, right: confirm.right, bottom: confirm.bottom, overflow: document.documentElement.scrollWidth - innerWidth };
          });
          check(`${orientation}/${language}/${tool}: choices, long labels and confirmation fit`, layout.overlap <= 1 && layout.right <= width - insets.right && layout.bottom <= height - insets.bottom && layout.overflow < 1, layout);
        }
      }
    }
    await page.setViewportSize({ width: 393, height: 852 }); await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, left: 0, right: 0, bottom: 34 } });
    await page.evaluate(() => setLanguage('zhHant'));
    await choose('maps', 'district-sign'); await tapTile(105, 100);
    const beforeSign = await snapshot();
    check('an unnamed district sign cannot be confirmed', await page.locator('#mobile-confirm').isDisabled());
    await page.click('#mobile-district-names'); await page.locator('#text-prompt-dialog input').fill('取消測試'); await page.click('#text-prompt-dialog .dialog-ok-btn');
    await page.waitForFunction(() => document.querySelector('#text-prompt-dialog input').value !== '取消測試');
    check('the English prompt accepts the existing 48-character naming limit', await page.locator('#text-prompt-dialog input').getAttribute('maxlength') === '48');
    await page.click('#text-prompt-dialog .dialog-cancel-btn');
    check('cancelling the second name leaves both draft names and the city unchanged', !(await draft()).options.name && beforeSign === await snapshot());
    await page.click('#mobile-district-names'); await page.locator('#text-prompt-dialog input').fill('測試西灣'); await page.click('#text-prompt-dialog .dialog-ok-btn');
    await page.waitForFunction(() => document.querySelector('#text-prompt-dialog input').value !== '測試西灣');
    await page.locator('#text-prompt-dialog input').fill('  Test   Sai Wan  '); await page.click('#text-prompt-dialog .dialog-ok-btn');
    check('bilingual naming only updates the draft before confirmation', (await draft()).plan.name === '測試西灣' && (await draft()).plan.englishName === 'Test Sai Wan' && beforeSign === await snapshot());
    await photo('district-portrait'); await page.click('#mobile-confirm');
    check('confirm places one bilingual sign and charges $250 once', await page.evaluate(before => getDistrictSigns().length === 1 && getDistrictSigns()[0].name === '測試西灣' && city.budget === JSON.parse(before).budget - 250, beforeSign));
    await choose('maps', 'district-sign'); await tapTile(105, 102);
    await page.evaluate(() => mobileBuildSession.setOptions({ name: '測試西灣', englishName: 'Duplicate' }));
    check('duplicate names are rejected without charging', await page.locator('#mobile-confirm').isDisabled() && await page.evaluate(() => getDistrictSigns().length === 1));
    await page.click('#mobile-cancel'); await choose('maps', 'inspect');
    const centerLabel = () => page.evaluate(async () => {
      const sign = getDistrictSigns()[0], camera = activeScene.cameras.main;
      const bounds = activeScene.districtSignSprites.get(sign.id).getBounds();
      const scroll = mapCameraScrollForAnchor(camera, camera.zoom, 150, 330, bounds.centerX, bounds.centerY);
      camera.scrollX = scroll.x; camera.scrollY = scroll.y; onMapViewChanged(activeScene); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return { x: 150, y: 330 };
    });
    let labelPoint = await centerLabel();
    await touch('touchStart', [[150, 330, 1], [210, 330, 2]]); await touch('touchMove', [[130, 330, 1], [230, 330, 2]]); await touch('touchEnd', []);
    check('starting a pinch on the sign label never opens the name editor', await page.evaluate(() => !mobileModalOpen() && getDistrictSigns()[0].name === '測試西灣'));
    labelPoint = await centerLabel();
    const beforeRename = await page.evaluate(() => city.budget);
    await tapAt(labelPoint.x, labelPoint.y); await page.waitForSelector('#text-prompt-dialog', { state: 'visible' });
    await page.locator('#text-prompt-dialog input').fill('測試東灣'); await page.click('#text-prompt-dialog .dialog-ok-btn');
    await page.waitForFunction(() => document.querySelector('#text-prompt-dialog input').value !== '測試東灣');
    await page.locator('#text-prompt-dialog input').fill('Test East Bay'); await page.click('#text-prompt-dialog .dialog-ok-btn');
    check('a completed touch on the visible sign label edits both names for free', await page.evaluate(before => getDistrictSigns()[0].name === '測試東灣' && getDistrictSigns()[0].englishName === 'Test East Bay' && city.budget === before, beforeRename));
    await nav('more'); await page.click('[data-mobile-menu="save-as"]');
    await page.locator('#text-prompt-dialog input').fill('Mobile Daily C2 smoke'); await page.click('#text-prompt-dialog .dialog-ok-btn');
    await page.waitForFunction(() => currentSaveId !== null, null, { timeout: 30000 });
    const saved = await snapshot(); await page.evaluate(() => loadSaveById(currentSaveId, activeScene)); await page.evaluate(() => setSimSpeed(0));
    const reloaded = await snapshot();
    // Simulation refresh may update derived building metrics, so compare persisted C2 fields.
    const before = JSON.parse(saved), after = JSON.parse(reloaded);
    const lots = value => Object.entries(value.buildings).map(([id, b]) => [id, b.type, b.spriteKey, b.parkVariant, b.footprintCols, b.footprintRows]);
    // Compact saves explicitly restore count=1 and planted=false on ordinary trees.
    // Compare every tree's meaningful data, including its exact position and random variant.
    const trees = value => value.trees.map(row => row.map(tree => tree ? [tree.species, tree.age, tree.variant, tree.count ?? 1, !!tree.planted] : null));
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const persistence = { budget: before.budget === after.budget, lines: same(before.lines, after.lines), trees: same(trees(before), trees(after)),
      zones: same(before.zones, after.zones), locks: same(before.locks, after.locks), signs: same(before.signs, after.signs), lots: same(lots(before), lots(after)) };
    fs.writeFileSync(path.join(out, 'save-comparison.json'), JSON.stringify({ before, after, persistence }));
    check('save/reload preserves trees, power lines, cleared zoning, density locks, parks, sports grounds and bilingual signs', Object.values(persistence).every(Boolean), persistence);
    check('no uncaught browser errors', errors.length === 0, errors);
  } finally {
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
    await page?.screenshot({ path: path.join(out, 'last-state.png') }).catch(() => {});
    await browser.close();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
