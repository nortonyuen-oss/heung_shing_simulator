#!/usr/bin/env node
// Disposable city: touch UI builds roads, stops and a depot, opens a route,
// purchases/assigns a bus, runs the shared simulation and reloads the save.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const out = path.resolve('.data/mobile-bus');
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
      for (let row = 75; row < 110; row++) for (let col = 75; col < 110; col++) {
        removeTree(activeScene, row, col); removeDebris(activeScene, row, col);
        mapData[row][col] = GROUND; heightMap[row][col] = 0; refreshTileArea(activeScene, row, col);
      }
      // Demand fixture, using valid building models so the whole city can be reloaded.
      const entry = Object.entries(houseModelSets).flatMap(([set, models]) => models.map(model => ({ set, model })))
        .find(({ model }) => !model.legacy && model.footprintCols <= 3 && model.footprintRows <= 3 && activeScene.textures.exists(model.key));
      if (!entry) throw new Error('No loaded house model for the passenger fixture');
      placeHouseModel(activeScene, 86, 84, entry.set, entry.model.key);
      buildingData['86:84'].population = 3000;
      city.budget = 100000;
      placeInfraBuilding(activeScene, 87, 95, 'library', selectInfraPlacementModel('library'));
      city.population = 3000; city.budget = 10000;
      setExpansionEnabled('transport', true, { notify: false }); updateHUD();
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, left: 0, right: 0, bottom: 34 } });
    await page.evaluate(() => {
      window.mobileBusTapCount = 0;
      document.addEventListener('heungshing:maptap', () => window.mobileBusTapCount++);
    });
    const snapshot = () => page.evaluate(() => JSON.stringify({ city: city.budget, cash: getTransportExpansionState().company.cash,
      sides: busStopMap, depots: Object.entries(buildingData).filter(([, b]) => b.type === 'bus_depot'), routes: getTransportExpansionState().routes, roads: roadTileCount }));
    const tapTile = async (row, col) => {
      const point = await page.evaluate(async ([row, col]) => {
        const camera = activeScene.cameras.main;
        const geom = getTileFaceGeometry(row, col, activeScene.offsetX, activeScene.offsetY);
        const x = innerHeight > innerWidth ? 150 : 330, y = innerHeight > innerWidth ? 330 : 150;
        camera.setZoom(.5);
        const scroll = mapCameraScrollForAnchor(camera, .5, x, y, geom.center.x, geom.center.y);
        camera.scrollX = scroll.x; camera.scrollY = scroll.y; onMapViewChanged(activeScene);
        await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
        return { x, y, count: window.mobileBusTapCount };
      }, [row, col]);
      // Browser-timed gesture: Node/CI scheduling must not turn 35ms into a long press.
      await cdp.send('Input.synthesizeTapGesture', { x: point.x, y: point.y, duration: 40, gestureSourceType: 'touch' });
      await page.waitForFunction(count => window.mobileBusTapCount > count, point.count, { timeout: 10000 });
    };
    const nav = async name => {
      if (await page.locator('#mobile-nav-toggle').isVisible()) await page.click('#mobile-nav-toggle');
      await page.click(`#mobile-nav [data-mobile-page="${name}"]`);
    };
    const choose = async tool => { await nav('transport'); await page.click(`[data-mobile-tool="${tool}"]`); };
    const draft = () => page.evaluate(() => mobileBuildSession.getState());
    check('a fresh phone automatically uses Mobile Beta', await page.evaluate(() => getUiProfile() === 'touch' && getUiProfilePreference() === 'auto'));
    check('the company starts with its existing $6000 grant', await page.evaluate(() => getTransportExpansionState().company.cash === 6000));
    await nav('build'); await page.click('[data-mobile-category="roads"]'); await page.click('[data-mobile-tool="road"]');
    await tapTile(90, 80); await tapTile(90, 98); await page.click('#mobile-confirm');
    check('the connecting road uses city funds', await page.evaluate(() => roadTileCount === 19 && city.budget === 9810 && getTransportExpansionState().company.cash === 6000));
    await nav('transport'); await page.click('[data-mobile-native="transport-routes"]');
    const depotCTA = page.locator('[data-transport-action="select-tool"][data-tool="bus-depot"]');
    check('the existing transport issue can launch mobile depot construction', await depotCTA.isEnabled());
    await depotCTA.click(); await tapTile(87, 80);
    let state = await draft();
    check('depot preview shows nine tiles, road frontage and company funding', state.plan.tiles.length === 9 && state.plan.connected && state.plan.funding.payer === 'company' && state.plan.cost === 4000);
    const beforeRotate = await snapshot();
    await page.click('#mobile-depot-rotate');
    check('entrance rotation updates the connection preview without spending', !(await draft()).plan.connected && beforeRotate === await snapshot());
    for (let i = 0; i < 3; i++) await page.click('#mobile-depot-rotate');
    check('four rotations return the entrance to the road', (await draft()).plan.connected && (await draft()).options.depotSide === state.options.depotSide);
    await page.waitForFunction(() => !document.querySelector('#toast-container .toast'), null, { timeout: 10000 });
    await page.screenshot({ path: path.join(out, 'depot-portrait.png') });
    await page.click('#mobile-cancel');
    check('cancel leaves no depot and no charge', beforeRotate === await snapshot());
    await choose('bus-depot'); await tapTile(87, 80); await page.click('#mobile-confirm');
    check('confirm builds one connected depot and charges company funds once', await page.evaluate(() => buildingData['87:80']?.busDepotRawSide === 's' && isTransportDepotConnected('87:80') && getTransportExpansionState().company.cash === 2000 && city.budget === 9810));
    await nav('build'); await page.click('[data-mobile-category="transport"]'); await page.click('[data-mobile-tool="bus-stop"]');
    await tapTile(90, 84);
    state = await draft();
    check('stop preview shows both shoulders and walking coverage without placing', state.plan.cost === 40 && state.plan.sides.length === 2 && await page.evaluate(() => !getBusStopSides(90, 84) && activeScene.busStopHighlightGraphic.commandBuffer.length > 0 && activeScene.mobileBusPlacementLabels.every(label => label.visible)));
    for (const language of ['en', 'zhHant', 'ja']) {
      await page.evaluate(language => setLanguage(language), language);
      const layout = await page.evaluate(() => {
        const footer = document.querySelector('.m-confirm').getBoundingClientRect();
        const context = document.querySelector('.m-context').getBoundingClientRect();
        const confirm = document.getElementById('mobile-confirm').getBoundingClientRect();
        const nav = document.getElementById('mobile-nav').getBoundingClientRect();
        return { overlap: context.bottom - footer.top, belowNav: confirm.bottom - nav.top, right: confirm.right, overflow: document.documentElement.scrollWidth - innerWidth };
      });
      check(`portrait/${language}: stop options, funding and confirmation fit`, layout.overlap < 1 && layout.belowNav <= 0 && layout.right <= 393 && layout.overflow < 1, layout);
    }
    await page.click('[data-mobile-stop-side="first"]');
    state = await draft(); const firstSide = state.plan.sides[0];
    check('side A has an explicit single-stop price', state.plan.cost === 20 && state.plan.sides.length === 1);
    await page.click('#mobile-confirm');
    check('side A confirmation changes only the selected shoulder', await page.evaluate(side => getBusStopSides(90, 84).length === 1 && getBusStopSides(90, 84)[0] === side && getTransportExpansionState().company.cash === 1980, firstSide));
    await choose('bus-stop'); await tapTile(90, 84);
    check('adding the other side quotes only its additional cost', (await draft()).plan.cost === 20);
    await page.click('#mobile-confirm');
    check('the optional second shelter is added without charging twice', await page.evaluate(() => getBusStopSides(90, 84).length === 2 && getTransportExpansionState().company.cash === 1960));
    const normalCash = await page.evaluate(() => getTransportExpansionState().company.cash);
    await page.evaluate(() => { getTransportExpansionState().company.cash = 10; });
    await choose('bus-stop'); await tapTile(90, 92);
    check('low company funds disable confirmation despite a rich city treasury', await page.locator('#mobile-confirm').isDisabled() && (await draft()).plan.reason === await page.evaluate(() => t('mobile.companyFundsLow')));
    await page.click('#mobile-cancel');
    await page.evaluate(cash => { getTransportExpansionState().company.cash = cash; }, normalCash);
    await choose('bus-stop'); await tapTile(90, 92);
    const beforeBlur = await snapshot();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    check('losing focus cancels a stop draft without placing or spending', !(await draft()) && beforeBlur === await snapshot());
    await choose('bus-stop'); await tapTile(90, 96);
    const beforeRotation = await snapshot();
    await page.setViewportSize({ width: 852, height: 393 });
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 59, right: 59, bottom: 0 } });
    await page.waitForFunction(() => !mobileBuildSession.getState());
    check('rotation cancels the unconfirmed stop without spending', beforeRotation === await snapshot());
    await choose('bus-stop'); await tapTile(90, 96);
    for (const language of ['en', 'zhHant', 'ja']) {
      await page.evaluate(language => setLanguage(language), language);
      const layout = await page.evaluate(() => {
        const footer = document.querySelector('.m-confirm').getBoundingClientRect();
        const options = document.querySelector('.m-context').getBoundingClientRect();
        const confirm = document.getElementById('mobile-confirm').getBoundingClientRect();
        return { overlap: options.bottom - footer.top, right: confirm.right, overflow: document.documentElement.scrollWidth - innerWidth };
      });
      check(`landscape/${language}: bus controls fit and avoid the footer`, layout.overlap < 1 && layout.right <= 852 - 59 && layout.overflow < 1, layout);
    }
    await page.waitForFunction(() => !document.querySelector('#toast-container .toast'), null, { timeout: 10000 });
    await page.screenshot({ path: path.join(out, 'stop-landscape.png') });
    await page.click('#mobile-confirm');
    check('landscape stop construction keeps the city and company accounts separate', await page.evaluate(() => getBusStopSides(90, 96).length === 2 && getTransportExpansionState().company.cash === 1920 && city.budget === 9810));
    await nav('transport'); await page.click('[data-mobile-native="transport-routes"]');
    await page.click('[data-transport-action="new-route"]');
    await page.locator('[data-transport-field="name"]').fill('Mobile Bus C1');
    await page.click('[data-transport-action="pick-stops"]');
    await tapTile(90, 84); await tapTile(90, 96);
    check('route picking selects the two newly built stops', await page.evaluate(() => transportUiState.editor.stopIds.length === 2));
    await page.click('#mobile-route-picker-done'); await page.click('[data-transport-action="save-route"]');
    check('the existing validator saves a connected route awaiting its first bus', await page.evaluate(() => { const state = getTransportExpansionState(), runtime = getTransportRouteRuntime('route-1'); return state.routes.length === 1 && state.routes[0].status === 'active' && runtime?.path.length === 13 && runtime.brokenReason === 'fleetCapacity'; }));
    await nav('transport'); await page.click('[data-mobile-native="transport-fleet"]');
    await page.click('[data-transport-action="panel-tab"][data-tab="buy"]');
    await page.click('[data-transport-action="buy-vehicle"][data-class-id="standard_double_decker"]');
    check('buying a bus uses company funds and opens its tracker', await page.evaluate(() => getTransportExpansionState().vehicles.length === 1 && getTransportExpansionState().company.cash === 1640 && mobileNative.key.startsWith('tracker:')));
    await page.click('#mobile-panel-back');
    const vehicleId = await page.evaluate(() => getTransportExpansionState().vehicles[0].id);
    await page.locator(`[data-transport-assign-vehicle="${vehicleId}"]`).selectOption('route-1');
    check('the purchased bus can be assigned to the new route', await page.evaluate(() => { const bus = getTransportExpansionState().vehicles[0]; return bus.routeId === 'route-1' && bus.status === 'active'; }));
    const operation = await page.evaluate(() => {
      mobileClosePanel();
      const state = getTransportExpansionState();
      const before = state.company.cash + state.company.cashFraction;
      for (let minute = 360; minute < 540; minute++) { advanceTransportClock(minute, minute + 1); advanceTransportVehiclesByDisplayMinutes(1, activeScene); }
      updateTransportSimulation();
      const bus = state.vehicles[0], route = state.routes[0];
      return { travelled: bus.odometerTiles, passengers: route.monthToDatePassengers, revenue: route.monthToDateRevenue, cashChange: state.company.cash + state.company.cashFraction - before, city: city.budget };
    });
    check('the shared simulation drives the bus, carries passengers and earns fares', operation.travelled > 0 && operation.passengers > 0 && operation.revenue > 0 && operation.cashChange > 0 && operation.city === 9810, operation);
    await page.setViewportSize({ width: 393, height: 852 });
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, left: 0, right: 0, bottom: 34 } });
    await nav('transport'); await page.click('[data-mobile-native="transport-routes"]');
    await page.waitForFunction(() => !document.querySelector('#toast-container .toast'), null, { timeout: 10000 });
    await page.screenshot({ path: path.join(out, 'operating-route.png') });
    await choose('bus-depot'); await tapTile(88, 81); await page.click('#mobile-depot-rotate');
    const depotImpact = (await draft()).plan;
    const beforeDepotCancel = await snapshot();
    check('reorienting an operating depot previews its affected bus and route', depotImpact.rotating && depotImpact.cost === 0 && !depotImpact.connected && depotImpact.vehicleCount === 1 && depotImpact.routeCount === 1);
    await page.click('#mobile-cancel');
    check('cancelling depot reorientation preserves the running fleet and its funding', beforeDepotCancel === await snapshot());
    await nav('more'); await page.click('[data-mobile-menu="save-as"]');
    await page.waitForSelector('#text-prompt-dialog', { state: 'visible' });
    await page.locator('#text-prompt-dialog input').fill('Mobile Bus C1 smoke');
    await page.click('#text-prompt-dialog .dialog-ok-btn');
    await page.waitForFunction(() => currentSaveId !== null, null, { timeout: 30000 });
    const saved = await page.evaluate(() => ({ id: currentSaveId, cash: getTransportExpansionState().company.cash, sides: [getBusStopSides(90, 84), getBusStopSides(90, 96)] }));
    await page.evaluate(id => loadSaveById(id, activeScene), saved.id);
    await page.evaluate(() => setSimSpeed(0));
    check('save and reload preserve stops, depot direction, route, fleet and company funds', await page.evaluate(saved => {
      const state = getTransportExpansionState();
      return buildingData['87:80']?.busDepotRawSide === 's' && state.routes.length === 1 && state.routes[0].name === 'Mobile Bus C1'
        && state.vehicles.length === 1 && state.vehicles[0].routeId === state.routes[0].id && state.company.cash === saved.cash
        && JSON.stringify([getBusStopSides(90,84), getBusStopSides(90,96)]) === JSON.stringify(saved.sides);
    }, saved));
    check('all bus tools are available and the C3 transport builders are no longer pending', await page.evaluate(() => TOUCH_BUS_TOOLS.every(tool => TOUCH_SUPPORTED_TOOLS.includes(tool)) && !mobileIsPendingTransportAction('select-tool','bus-stop') && !mobileIsPendingTransportAction('metro-new-line')));
    check('no uncaught browser errors', errors.length === 0, errors);
  } finally {
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
    await page?.screenshot({ path: path.join(out, 'last-state.png') }).catch(() => {});
    await browser.close();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
