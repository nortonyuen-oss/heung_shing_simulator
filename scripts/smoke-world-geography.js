#!/usr/bin/env node
// Navigate using the actual original-game minimap. Inspect visible land/water,
// not just agreement between two generated files. Uses an isolated browser DB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const sharp = require('sharp');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'test-results/world-geography');
const landmarks = [
  { id: 'ap-lei-chau', col: 1697, row: 1832, sensors: [{ col: 1697, row: 1832, water: false }, { col: 1697, row: 1801, water: true }] },
  { id: 'kai-tak-runway', col: 1980, row: 1450, sensors: [{ col: 1980, row: 1450, water: false }, { col: 1992, row: 1438, water: true }, { col: 1968, row: 1462, water: true }] },
];
// A reload boots the whole game again: about 5 s on a desktop, but 15-20x that on a CI runner
// (software WebGL), so the settle after a reload gets RELOAD_SETTLE_MS.
const RELOAD_SETTLE_MS = 180000;
async function settle(page, timeout = 45000) {
  await page.waitForFunction(() => {
    const h = globalThis.__worldGameHost, s = h?.manager?.snapshot();
    return h?.ready && s.states.ACTIVE === s.wanted && !s.states.MOUNTING && !s.states.UNMOUNTING;
  }, null, { timeout });
}
async function clickLandmark(page, landmark, touch) {
  // Compute where the landmark is painted from the projected raster bounds,
  // independently of the click handler and its inverse transform.
  const point = await page.evaluate(({ col, row }) => {
    const h = __worldGameHost, map = h.minimap, canvas = document.getElementById('city-minimap-canvas'), region = map.region;
    const corners = [[region.col - .5, region.row - .5], [region.col + region.width - .5, region.row - .5],
      [region.col - .5, region.row + region.height - .5], [region.col + region.width - .5, region.row + region.height - .5]].map(([c, r]) => h.adapter.project(c, r));
    const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y)) - 40;
    const width = Math.max(...corners.map(p => p.x)) - x, height = Math.max(...corners.map(p => p.y)) - 40 - y;
    const scale = Math.min((canvas.width - 16) / width, (canvas.height - 16) / height), p = h.adapter.project(col, row);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + ((canvas.width - width * scale) / 2 + (p.x - x) * scale) / canvas.width * rect.width,
      y: rect.top + ((canvas.height - height * scale) / 2 + (p.y - 40 - y) * scale) / canvas.height * rect.height };
  }, landmark);
  if (touch) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y, id: 1 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else await page.mouse.click(point.x, point.y);
  await page.waitForFunction(({ col, row }) => { const p = __worldGameHost.viewpoint(); return Math.hypot(p.col - col, p.row - row) < 2; }, landmark, { timeout: 10000 });
  await settle(page);
  return page.evaluate(() => __worldGameHost.viewpoint());
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const app = express(); app.use(express.static(path.join(ROOT, 'release/web')));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); let browser;
  const report = [];
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CI ? {} : { channel: 'chrome' }) });
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile });
      const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
      const touch = mobile ? await context.newCDPSession(page) : null;
      await page.goto(`http://127.0.0.1:${server.address().port}/?world=1&new=world-geography-${Date.now()}&year=1900`);
      await settle(page); await page.evaluate(() => { setGameSpeed(GAME_SPEEDS.PAUSED); city.timeOfDayMinutes = 720; updateDynamicLighting(activeScene); updateHUD(); setMapZoom(activeScene, .4); });
      for (const rotation of mobile ? [0] : [0, 1, 2, 3]) {
        await page.evaluate(rotation => { while (mapRotation !== rotation) rotateMap(activeScene); }, rotation);
        for (const landmark of landmarks) {
          await page.click('[data-city-minimap-mode="world"]');
          const arrived = await clickLandmark(page, landmark, touch);
          await page.click('[data-city-minimap-mode="local"]');
          await page.waitForFunction(() => __worldGameHost.minimap.cache.pending.size === 0);
          await page.evaluate(() => drawCityMinimap());
          await clickLandmark(page, landmark, touch);
          const data = await page.evaluate(sensors => sensors.map(sensor => {
            const h = __worldGameHost, map = h.minimap, p = map.tileToPoint(sensor.col, sensor.row), ctx = document.getElementById('city-minimap-canvas').getContext('2d');
            const color = [...ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data], key = getTileKey(sensor.row, sensor.col);
            const projected = h.adapter.project(sensor.col, sensor.row), camera = activeScene.cameras.main, ox = camera.width * camera.originX, oy = camera.height * camera.originY;
            return { ...sensor, terrain: mapData[sensor.row][sensor.col], miniColor: color,
              x: (projected.x - (camera.scrollX + ox - ox / camera.zoom)) * camera.zoom,
              y: (projected.y + getTerrainTileVisualOffset(sensor.row, sensor.col, key) - 40 - (camera.scrollY + oy - oy / camera.zoom)) * camera.zoom };
          }), landmark.sensors);
          for (const sensor of data) {
            assert.equal(sensor.terrain === 5, sensor.water, `${landmark.id} land/water data`);
            assert.equal(sensor.miniColor[2] > sensor.miniColor[0], sensor.water, `${landmark.id} visible local minimap`);
          }
          const screenshot = await page.screenshot(), image = await sharp(screenshot).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
          if (!mobile && rotation === 0) for (const sensor of data) {
            assert(sensor.x > 224 && sensor.x < image.info.width && sensor.y > 95 && sensor.y < image.info.height - 90);
            const at = (Math.round(sensor.y) * image.info.width + Math.round(sensor.x)) * 4;
            assert.equal(image.data[at + 2] > image.data[at], sensor.water, `${landmark.id} rendered main-camera land/water`);
          }
          const filename = `${mobile ? 'phone' : 'desktop'}-${landmark.id}-r${rotation}.png`; fs.writeFileSync(path.join(OUT, filename), screenshot);
          const state = await page.evaluate(() => ({ stats: __worldGameHost.stats(), buildings: Object.keys(buildingData).length, budget: city.budget, frameErrors: window.__frameErrors || [] }));
          assert.equal(state.buildings, 0); assert.equal(state.budget, 10000); assert.equal(state.stats.summaryRecords, 0);
          assert(state.stats.maxMounted <= 9); assert(state.stats.minimap.cache.bytes <= 4194304); assert.equal(state.stats.minimap.cache.errors, 0); assert.deepEqual(state.frameErrors, []);
          report.push({ mobile, rotation, landmark: landmark.id, arrived, screenshot: filename });
          console.log('PASS', mobile ? 'phone' : 'desktop', landmark.id, 'rotation', rotation);
        }
      }
      await page.click('[data-city-minimap-mode="world"]'); await page.evaluate(() => saveGame()); await page.reload(); await settle(page, RELOAD_SETTLE_MS);
      assert.equal(await page.evaluate(() => __worldGameHost.minimap.mode), 'world'); assert.deepEqual(errors, []); await context.close();
    }
    fs.writeFileSync(path.join(OUT, 'minimap-navigation.json'), JSON.stringify(report, null, 2));
    console.log('PASS actual minimap clicks, visible islands/runway, four rotations, touch and scope persistence');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
