#!/usr/bin/env node
// Exercise real zoning and calendar-driven development in an isolated browser
// database. Never place houses directly or override growth probabilities.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');

async function settled(page) {
  await page.waitForFunction(() => {
    const h = globalThis.__worldGameHost, s = h?.manager?.snapshot();
    return h?.ready && !h.pendingTerrain.size && s.states.ACTIVE === s.wanted
      && s.activeIds.every(id => h.manager.wanted.has(id)) && !s.states.MOUNTING && !s.states.UNMOUNTING;
  }, null, { timeout: 90000 });
}

(async () => {
  const app = express(); app.use(express.static(path.join(ROOT, 'release/web')));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${origin}/?world=1&new=world-growth-${Date.now()}&year=1900`);
    await settled(page);
    await page.evaluate(() => {
      setGameSpeed(GAME_SPEEDS.PAUSED);
      const h = __worldGameHost;
      h.adapter.centreCamera(activeScene.cameras.main, 1697, 1832);
      h.manager.setFocus(1697, 1832);
    });
    await settled(page);
    await page.evaluate(() => {
      // A small flat fixture lets this test focus on city rules, not slopes.
      for (let row = 1826; row <= 1840; row++) for (let col = 1680; col <= 1708; col++) {
        mapData[row][col] = GROUND; heightMap[row][col] = 0;
      }
    });
    await settled(page);
    const before = await page.evaluate(() => {
      const scene = activeScene;
      city.budget = 20000;
      selectedTool = 'road';
      for (let col = 1681; col <= 1702; col++) {
        const result = applyToolAt(scene, 1830, col);
        if (!result.changed) throw Error(`Road fixture failed at ${col}: ${JSON.stringify(result)}`);
      }
      selectedTool = 'power-coal';
      if (!applyToolAt(scene, 1828, 1681).changed) throw Error('Plant fixture failed');
      updatePowerGrid(scene);
      if (!powerMap[1830][1690] || city.totalPowerDemand !== 0) throw Error('Existing grid must be settled before zoning');
      Object.assign(selectedZoneDensity, { res: DENSITY_LOW, com: DENSITY_LOW, ind: DENSITY_LOW });
      for (let row = 1831; row <= 1833; row++) for (let col = 1681; col <= 1700; col++) {
        selectedTool = col < 1689 ? 'zone-res' : col < 1695 ? 'zone-com' : 'zone-ind';
        if (!applyToolAt(scene, row, col).changed) throw Error('Zone fixture failed');
      }
      // This is the real next power pass: no forced dirty flag or new road.
      updatePowerGrid(scene);
      return { demand: city.totalPowerDemand, supply: city.totalPowerSupply, powered: !!powerMap[1831][1690],
        zoned: getZoneGrowthTiles().length, buildings: Object.keys(buildingData).length, tick: city.tick };
    });
    console.log('before growth', before);
    assert.equal(before.zoned, 60); assert.equal(before.buildings, 1);
    assert.equal(before.demand, 270); assert.equal(before.supply, 600); assert(before.powered);
    await settled(page);
    await page.evaluate(() => { setGameSpeed(GAME_SPEEDS.FAST); });
    await page.waitForFunction(() => {
      const types = new Set(Object.values(buildingData).map(record => record.type));
      return city.population > 0 && ['residential', 'commercial', 'industrial'].every(type => types.has(type));
    }, null, { timeout: 150000 });
    const grown = await page.evaluate(() => {
      setGameSpeed(GAME_SPEEDS.PAUSED); flushCitySimulationPulses(); updateHUD();
      return { population: city.population, tick: city.tick, buildings: Object.keys(buildingData),
        types: [...new Set(Object.values(buildingData).map(record => record.type))],
        supply: city.totalPowerSupply, demand: city.totalPowerDemand, fullTerrain: typeof HK_TERRAIN_TILES,
        stats: __worldGameHost.stats(), frameErrors: window.__frameErrors || [] };
    });
    assert(grown.tick > before.tick); assert.equal(grown.fullTerrain, 'undefined'); assert(grown.stats.maxMounted <= 9);
    assert(grown.stats.summaryRecords < 4); assert.deepEqual(grown.frameErrors, []); assert.deepEqual(errors, []);
    console.log('calendar-driven growth', { population: grown.population, tick: grown.tick, buildings: grown.buildings.length, types: grown.types });
    assert(await page.evaluate(() => saveGame()));
    await page.reload(); await settled(page);
    const restored = await page.evaluate(() => {
      setGameSpeed(GAME_SPEEDS.PAUSED); updatePowerGrid(activeScene); updatePopulationAndPollution();
      return { population: city.population, buildings: Object.keys(buildingData), powered: !!powerMap[1831][1690],
        types: [...new Set(Object.values(buildingData).map(record => record.type))], frames: window.__frameErrors || [] };
    });
    for (const id of grown.buildings) assert(restored.buildings.includes(id), 'automatic buildings survive reload');
    assert(restored.population > 0); assert(restored.powered); assert.deepEqual(restored.frames, []); assert.deepEqual(errors, []);
    const output = path.join(ROOT, 'test-results/world-growth'); fs.mkdirSync(output, { recursive: true });
    await page.evaluate(() => {
      city.timeOfDayMinutes = 720; updateDynamicLighting(activeScene); setMapZoom(activeScene, .8);
      const h = __worldGameHost; h.adapter.centreCamera(activeScene.cameras.main, 1690, 1831); h.manager.setFocus(1690, 1831);
    });
    await settled(page);
    await page.waitForFunction(() => [...activeScene.buildingSprites.values()].every(sprite => !sprite.__artPending), null, { timeout: 60000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(output, 'automatic-development.png') });
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ before, grown, restored }, null, 2));
    console.log('PASS existing roads/plant → zoning → real calendar growth for R/C/I → populated save/reload');
    await context.close();
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
