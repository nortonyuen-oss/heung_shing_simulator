#!/usr/bin/env node
// Real desktop/mobile zoning and save reload, using an isolated temporary database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { startGameServer } = require('../server');
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'science-park-'));
  const staged = path.join(ROOT, '.data/package-assets');
  let browser, server;
  const errors = [];
  try {
    server = await startGameServer({ port: 0, dbPath: path.join(temporary, 'game.sqlite'),
      ...(fs.existsSync(path.join(staged, 'Models/model-assets.json')) ? { modelAssetRootDir: staged } : {}) });
    browser = await chromium.launch({ headless: true, ...(process.env.CI ? {} : { channel: 'chrome' }) });
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && message.text().includes('[GameClock] listener')) errors.push(message.text());
    });
    await page.route('https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.js', route => route.fulfill({
      path: require.resolve('phaser/dist/phaser.js'), contentType: 'text/javascript',
    }));
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof gameReady !== 'undefined' && gameReady, null, { timeout: 120000 });
    await page.evaluate(async () => {
      setLanguage('zhHant');
      await startNewGame('科學園測試', { transportExpansion: true, terrain: { width: 32, height: 32,
        mapData: Array.from({ length: 32 }, () => Array(32).fill(GROUND)),
        heightMap: Array.from({ length: 32 }, () => Array(32).fill(0)) } });
      setGameSpeed(GAME_SPEEDS.PAUSED);
      city.budget = 100000;
      city.educationBasicIndex = 0.65;
      city.educationHigherIndex = 0.55;
      if (!placeInfraBuilding(activeScene, 8, 5, 'power_plant_coal')) throw Error('Power fixture failed');
      selectedTool = 'road';
      for (let col = 5; col <= 25; col++) applyToolAt(activeScene, 10, col);
      selectedTool = 'zone-ind';
      openZoneDensityMenu('zone-ind', document.querySelector('[data-tool="zone-ind"]'));
    });
    await page.locator('[data-industry="science"]').click();
    assert.equal(await page.locator('#zone-ind-badge').textContent(), 'S1');
    const desktop = await page.evaluate(() => {
      fillZoneRect(activeScene, { row: 11, col: 10 }, { row: 15, col: 14 });
      updatePowerGrid(activeScene);
      // Seed the market independently of the visual fixture's handful of buildings.
      city.population = 10000;
      updateDemand();
      const demandBeforeConstruction = city.demandScienceI;
      if (!spawnZoneBuilding(activeScene, 11, 10, ZONE_IND, 1, DENSITY_LOW, { forceFootprint: 3 })) throw Error('Research building failed');
      const record = buildingData['11:10'];
      if (!isScienceParkIndustrialRecord(record)) throw Error('Factory grew on science land');
      const save = JSON.parse(JSON.stringify(buildSavePayload().save_data));
      applySaveData(activeScene, decodeSaveDataForLoad(save));
      setGameSpeed(GAME_SPEEDS.PAUSED);
      return { type: getIndustrialZoneType(11, 10), model: buildingData['11:10'].sourceFileName,
        science: isScienceParkIndustrialRecord(buildingData['11:10']), unlocked: city.scienceParkUnlocked,
        demandBeforeConstruction, powered: !!powerMap[11][10], savedTiles: Object.keys(city.industrialZones).length };
    });
    assert.equal(desktop.type, 'science'); assert(desktop.science); assert(!desktop.unlocked);
    assert(desktop.demandBeforeConstruction > 0); assert(desktop.powered); assert.equal(desktop.savedTiles, 25);
    console.log('desktop zoning and save reload', desktop);
    await page.evaluate(() => {
      openZoneDensityMenu('zone-ind', document.querySelector('[data-tool="zone-ind"]'));
    });
    await page.screenshot({ path: path.join(temporary, 'desktop.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(async () => {
      closeZoneDensityMenu(); setUiProfilePreference('touch');
      // The orientation-change handler cancels drafts; let that event settle first.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      mobileSelectTool('zone-ind');
    });
    await page.locator('#mobile-industry-select').selectOption('regular');
    await page.locator('#mobile-industry-select').selectOption('science');
    assert.match(await page.locator('#mobile-build-name').textContent(), /科學園/);
    await page.evaluate(() => {
      mobileBuildSession.select({ row: 11, col: 18 }, true);
      mobileBuildSession.select({ row: 14, col: 21 }, true);
    });
    assert.equal(await page.locator('#mobile-confirm').isEnabled(), true);
    assert.equal(await page.locator('[data-mobile-density]').evaluateAll(buttons =>
      new Set(buttons.map(button => Math.round(button.getBoundingClientRect().top))).size), 1, 'density choices remain on one scrollable row');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'phone layout fits the screen');
    await page.screenshot({ path: path.join(temporary, 'mobile.png') });
    await page.locator('#mobile-confirm').click();
    const mobile = await page.evaluate(() => {
      const zoned = getIndustrialZoneType(11, 18);
      if (!spawnZoneBuilding(activeScene, 11, 18, ZONE_IND, 1)) throw Error('Mobile research building failed');
      const science = isScienceParkIndustrialRecord(buildingData['11:18']);
      const oldSave = JSON.parse(JSON.stringify(buildSavePayload().save_data));
      delete oldSave.city.industrialZones;
      applySaveData(activeScene, decodeSaveDataForLoad(oldSave));
      setGameSpeed(GAME_SPEEDS.PAUSED);
      return { zoned, science, oldSaveType: getIndustrialZoneType(11, 18),
        oldSaveScience: isScienceParkIndustrialRecord(buildingData['11:18']) };
    });
    assert.equal(mobile.zoned, 'science'); assert(mobile.science);
    assert.equal(mobile.oldSaveType, 'regular'); assert(mobile.oldSaveScience);
    const chapter = await page.evaluate(() => {
      city.population = 10000;
      city.budget = 100000;
      updateTransportUnlockState({ notify: false });
      if (!placeInfraBuilding(activeScene, 20, 5, 'legislative_council')) throw Error('Chapter 02 council fixture failed');
      if (!isPolicyAvailable('scienceDevelopment')) throw Error('Science Development Act is unavailable at 10,000 people with a council');
      if (!placeInfraBuilding(activeScene, 20, 10, 'secondary_school')) throw Error('Chapter 02 school fixture failed');
      city.activePolicies.scienceDevelopment = true;
      const run = createCampaignRun('ch02', getCityMonthIndex() - 18);
      run.stars = 1;
      run.eventsShown.loNeiMeng3000 = true; // the research story is separate from awarding stars
      city.campaign = run;
      const transport = getTransportExpansionState();
      transport.lastModeTotals = { ...(transport.lastModeTotals || {}), bus: 1499 };
      const monthlyPayload = { day: city.day, month: city.month, year: city.year, speed: getGameSpeed() };
      emitGameClockEvent('gameclock:month', monthlyPayload);
      if (city.campaign.stars !== 1) throw Error('Chapter 02 awarded star two below 1,500 bus riders');
      transport.lastModeTotals.bus = 1500;
      const snapshot = buildCampaignSnapshot();
      const evaluation = evaluateCampaignStar(CAMPAIGN_CHAPTER_SPECS.ch02, 1, snapshot, city.campaign);
      if (!evaluation.done) throw Error(`Chapter 02 unmet objectives: ${JSON.stringify(evaluation.items.filter(item => !item.done))}`);
      emitGameClockEvent('gameclock:month', monthlyPayload);
      return { parks: snapshot.buildings.science_park, jobs: snapshot.scienceParkJobs, busRiders: snapshot.transit.bus,
        scienceUnlocked: city.scienceParkUnlocked, stars: city.campaign.stars,
        profileStars: getCampaignProfile().chapters.ch02?.stars };
    });
    assert(chapter.parks >= 1); assert(chapter.jobs >= 300); assert.equal(chapter.busRiders, 1500);
    assert.equal(chapter.scienceUnlocked, false, 'chapter two does not require the natural-conversion unlock');
    assert.equal(chapter.stars, 2); assert.equal(chapter.profileStars, 2);
    console.log('chapter 02 real snapshots and month-turn award', chapter);
    assert.deepEqual(errors, [], 'no uncaught browser errors');
    console.log('mobile confirmation and old-save compatibility', mobile);
    console.log(`Screenshots: ${temporary}`);
  } finally {
    await browser?.close();
    await server?.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
