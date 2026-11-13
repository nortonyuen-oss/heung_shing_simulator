#!/usr/bin/env node
// Disposable city: touch UI builds metro/tram track and stations, draws a metro and a tram line
// station by station, opens a ferry pier and route, drags an undersea tunnel, plans a typhoon-
// shelter basin and toggles an entrance, paints terrain and a promenade with a pier, and rotates
// the floating restaurant's pre-placement orientation (Phase C3).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const out = path.resolve('.data/mobile-rail');
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
    await page.evaluate(() => {
      setSimSpeed(0); setFestivalsEnabled(false);
      for (let row = 60; row < 140; row++) for (let col = 60; col < 140; col++) {
        removeTree(activeScene, row, col); removeDebris(activeScene, row, col);
        mapData[row][col] = GROUND; heightMap[row][col] = 0; refreshTileArea(activeScene, row, col);
      }
      for (let col = 70; col < 130; col++) { mapData[90][col] = ROAD; roadTileCount++; refreshTileArea(activeScene, 90, col); }
      for (let col = 70; col < 100; col++) { mapData[98][col] = ROAD; roadTileCount++; refreshTileArea(activeScene, 98, col); }
      for (let r = 100; r <= 103; r++) for (let col = 70; col < 100; col++) { mapData[r][col] = WATER; refreshTileArea(activeScene, r, col); }
      for (let r = 70; r <= 80; r++) for (let col = 110; col < 120; col++) { mapData[r][col] = WATER; refreshTileArea(activeScene, r, col); }
      city.population = 50000; city.budget = 2000000;
      setExpansionEnabled('transport', true, { notify: false }); updateHUD();
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, left: 0, right: 0, bottom: 34 } });
    await page.evaluate(() => {
      window.mobileRailTapCount = 0;
      document.addEventListener('heungshing:maptap', () => window.mobileRailTapCount++);
    });
    const tapTile = async (row, col) => {
      const point = await page.evaluate(async ([row, col]) => {
        const camera = activeScene.cameras.main;
        const geom = getTileFaceGeometry(row, col, activeScene.offsetX, activeScene.offsetY);
        const x = innerHeight > innerWidth ? 150 : 330, y = innerHeight > innerWidth ? 330 : 150;
        camera.setZoom(.4);
        const scroll = mapCameraScrollForAnchor(camera, .4, x, y, geom.center.x, geom.center.y);
        camera.scrollX = scroll.x; camera.scrollY = scroll.y; onMapViewChanged(activeScene);
        await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
        return { x, y, count: window.mobileRailTapCount };
      }, [row, col]);
      await cdp.send('Input.synthesizeTapGesture', { x: point.x, y: point.y, duration: 40, gestureSourceType: 'touch' });
      await page.waitForFunction(count => window.mobileRailTapCount > count, point.count, { timeout: 10000 });
    };
    const nav = async name => {
      if (await page.locator('#mobile-nav-toggle').isVisible()) await page.click('#mobile-nav-toggle');
      await page.click(`#mobile-nav [data-mobile-page="${name}"]`);
    };
    const choose = async tool => { await nav('transport'); await page.click(`[data-mobile-tool="${tool}"]`); };
    const draft = () => page.evaluate(() => mobileBuildSession.getState());
    const confirmBuild = async () => { await page.waitForFunction(() => document.getElementById('mobile-confirm') && !document.getElementById('mobile-confirm').disabled, null, { timeout: 10000 }); await page.click('#mobile-confirm'); };

    // ── undersea tunnel (roads category) ──────────────────────────────────────
    await nav('build'); await page.click('[data-mobile-category="roads"]'); await page.click('[data-mobile-tool="undersea-tunnel"]');
    await tapTile(70, 112); await tapTile(80, 112);
    check('undersea tunnel previews two bores across the planned channel', (await draft()).plan.ok && (await draft()).plan.cost > 30000);
    await confirmBuild();
    check('undersea tunnel is built once', await page.evaluate(() => city.underseaTunnels.length === 1));

    // ── metro: height picker, track, station, surface station, line ──────────
    await choose('metro-track');
    await page.click('[data-mobile-metro-height="ground"]');
    await tapTile(95, 75); await tapTile(95, 85);
    const groundTrack = (await draft()).plan;
    check('metro track preview reflects the ground height option', groundTrack.ok && groundTrack.kinds.ground === 11);
    await confirmBuild();
    await choose('metro-station'); await tapTile(89, 75);
    check('metro station preview quotes the real $15,000 cost before building', (await draft()).plan.cost === 15000);
    await confirmBuild();
    await choose('metro-station'); await tapTile(89, 85);
    await confirmBuild();
    check('two metro stations exist after both confirms', await page.evaluate(() => getMetroState().stations.length === 2));
    await choose('metro-line');
    await tapTile(89, 75); await tapTile(89, 85);
    check('tapping two stations opens a metro line without a build-session draft', await page.evaluate(() => getMetroState().lines.length === 1 && !mobileBuildSession.getState()));

    // ── tram: track, stop, line ────────────────────────────────────────────────
    await choose('tram-track'); await tapTile(90, 75); await tapTile(90, 85);
    check('tram track previews on the existing road and is company-funded', (await draft()).plan.ok && (await draft()).plan.funding.payer === 'company');
    await confirmBuild();
    await choose('tram-stop'); await tapTile(90, 77);
    await confirmBuild();
    await choose('tram-stop'); await tapTile(90, 83);
    await confirmBuild();
    check('two tram stops exist after both confirms', await page.evaluate(() => getTramState().stops.length === 2));
    await choose('tram-line'); await tapTile(90, 77); await tapTile(90, 83);
    check('tapping two tram stops opens a tram line directly', await page.evaluate(() => getTramState().lines.length === 1));

    // ── ferry: pier, route ───────────────────────────────────────────────────
    await choose('ferry-pier'); await tapTile(99, 75);
    check('ferry pier preview straddles the planned shore', (await draft()).plan.ok && (await draft()).plan.cost === 2500);
    await confirmBuild();
    await choose('ferry-pier'); await tapTile(99, 90);
    await confirmBuild();
    check('two ferry piers exist after both confirms', await page.evaluate(() => getFerryState().piers.length === 2));
    const piers = await page.evaluate(() => getFerryState().piers.map(p => ({ row: p.row, col: p.col })));
    await choose('ferry-route'); await tapTile(piers[0].row, piers[0].col); await tapTile(piers[1].row, piers[1].col);
    check('tapping two piers opens a ferry route directly', await page.evaluate(() => getFerryState().routes.length === 1));

    // ── typhoon shelter: basin add, entrance toggle, subtract ─────────────────
    await nav('build'); await page.click('[data-mobile-category="marine"]'); await page.click('[data-mobile-tool="typhoon-shelter"]');
    await tapTile(101, 71); await tapTile(102, 95);
    check('a fresh basin drag is a free, unapproved draft', (await draft()).plan.ok && (await draft()).plan.cost === 0);
    await confirmBuild();
    check('the typhoon shelter exists after confirming the basin', await page.evaluate(() => getTyphoonShelterState().shelters.length === 1));
    await nav('build'); await page.click('[data-mobile-category="marine"]'); await page.click('[data-mobile-tool="typhoon-shelter"]');
    await page.click('[data-mobile-shelter-mode="entrance"]');
    check('switching to entrance mode drops the build-session draft', !(await draft()));
    await tapTile(101, 71);
    await page.click('#mobile-route-picker-done');
    check('leaving entrance mode through the route-picker strip returns to a basin draft', (await draft())?.tool === 'typhoon-shelter');
    await page.click('[data-mobile-shelter-subtract="true"]');
    await tapTile(101, 71); await tapTile(101, 75);
    check('the subtract toggle plans a cut instead of an addition', (await draft()).options.subtract === true);
    await page.click('#mobile-cancel');

    // ── terrain brush ─────────────────────────────────────────────────────────
    await nav('build'); await page.click('[data-mobile-category="terrain"]'); await page.click('[data-mobile-tool="terrain"]');
    await page.selectOption('#mobile-terrain-select', 'dirt');
    await tapTile(120, 75); await tapTile(121, 76);
    check('terrain preview is free and uses the selected brush', (await draft()).plan.ok && (await draft()).plan.cost === 0 && (await draft()).options.terrainType === 'dirt');
    await confirmBuild();
    check('the painted tiles became dirt', await page.evaluate(() => mapData[120][75] === DIRT && mapData[121][76] === DIRT));

    // ── promenade: paint, then a free pier toggle on the built tile ───────────
    await nav('build'); await page.click('[data-mobile-category="parks"]'); await page.click('[data-mobile-tool="promenade"]');
    await tapTile(99, 70); await tapTile(99, 71);
    check('promenade previews a real per-tile cost', (await draft()).plan.ok && (await draft()).plan.cost === 800);
    await confirmBuild();
    await nav('build'); await page.click('[data-mobile-category="parks"]'); await page.click('[data-mobile-tool="promenade"]');
    await tapTile(99, 70); await tapTile(99, 70);
    check('re-selecting a built promenade tile offers a free pier toggle', (await draft()).plan.pierToggle === true && (await draft()).plan.cost === 0);
    await confirmBuild();

    // ── floating restaurant: refusal reason and the rotate option ────────────
    await nav('build'); await page.click('[data-mobile-category="marine"]'); await page.click('[data-mobile-tool="floating-restaurant"]');
    await tapTile(101, 80);
    const beforeTurn = await draft();
    check('floating restaurant surfaces its real refusal until the shelter is operational', !beforeTurn.plan.ok && typeof beforeTurn.plan.reason === 'string');
    await page.click('#mobile-restaurant-rotate');
    check('the rotate option flips the shared orientation flag', (await draft()).options.turn !== beforeTurn.options.turn);
    await page.click('#mobile-cancel');

    check('all C3 tools are present in the touch catalog', await page.evaluate(() =>
      ['metro-track', 'metro-station', 'metro-surface-station', 'tram-track', 'tram-stop', 'ferry-pier',
        'undersea-tunnel', 'typhoon-shelter', 'terrain', 'promenade', 'floating-restaurant'].every(tool => TOUCH_SUPPORTED_TOOLS.includes(tool))
      && ['metro-line', 'tram-line', 'ferry-route'].every(tool => MOBILE_DIRECT_TAP_TOOLS.includes(tool))));
    check('no uncaught browser errors', errors.length === 0, errors);
  } finally {
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
    await page?.screenshot({ path: path.join(out, 'last-state.png') }).catch(() => {});
    await browser.close();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
