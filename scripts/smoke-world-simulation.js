#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { chromium } = require('playwright-core');
const { createGameApp, createMemoryAiNewsCredentialStore } = require('../server');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'test-results/world-simulation');
async function settle(page) {
  await page.waitForFunction(() => {
    const p = globalThis.__worldStreamingPreview; if (!p?.ready) return false;
    const s = p.stats(); return s.states.ACTIVE === s.wanted && !s.states.MOUNTING && !s.states.UNMOUNTING && !s.states.DECODING;
  }, null, { timeout: 60000 });
}
async function build(page, tool, a, b = a) {
  await page.selectOption('#build-tool', tool);
  await page.evaluate(async ({ a, b }) => {
    const p = __worldStreamingPreview; p.setFocus(a.col + 1, a.row + 1); await p.buildUi.planAt(a);
    if (a.col !== b.col || a.row !== b.row) await p.buildUi.planAt(b);
  }, { a, b }); await page.click('#confirm-build'); await settle(page);
}
async function tapTile(page, cell) {
  const point = await page.evaluate(cell => {
    const p = __worldStreamingPreview, camera = p.scene.cameras.main, point = p.adapter.project(cell.col, cell.row), rect = p.game.canvas.getBoundingClientRect();
    return { x: rect.left + (point.x - camera.scrollX - camera.width / 2) * camera.zoom + camera.width / 2,
      y: rect.top + (point.y - 40 - camera.scrollY - camera.height / 2) * camera.zoom + camera.height / 2 };
  }, cell); await page.mouse.click(point.x, point.y);
}
async function scenario(browser, backend, origin) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }), page = await context.newPage(), errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(`[${backend}] ${error.message}`); });
  const url = `${origin}/world/preview.html?storage=${backend}`; await page.goto(url); await settle(page);
  assert.equal(await page.evaluate(() => __worldStreamingPreview.delta.header.simulation), undefined);
  for (const col of [1592, 1596, 1600, 1604]) await build(page, 'flatten4', { col, row: 1820 });
  await build(page, 'road', { col: 1593, row: 1821 }, { col: 1607, row: 1821 });
  await build(page, 'rail', { col: 1593, row: 1822 }, { col: 1607, row: 1822 });
  await build(page, 'zoneR', { col: 1593, row: 1820 }, { col: 1598, row: 1820 });
  await build(page, 'zoneC', { col: 1603, row: 1820 }, { col: 1607, row: 1820 });
  await page.evaluate(() => __worldStreamingPreview.setFocus(1600, 1821)); await settle(page);
  // Real pointer picking, first endpoint prompt and second endpoint confirmation for both modes.
  for (const [mode, row] of [['road', 1821], ['rail', 1822]]) {
    await page.selectOption('#build-tool', `route-${mode}`); await tapTile(page, { col: 1593, row });
    await page.waitForFunction(() => __worldStreamingPreview.buildUi.start?.col === 1593);
    assert(await page.locator('#confirm-build').isDisabled()); await tapTile(page, { col: 1607, row });
    await page.waitForFunction(() => !!__worldStreamingPreview.buildUi.draft?.service); await page.click('#confirm-build');
  }
  await page.waitForFunction(() => __worldStreamingPreview.trafficRenderer.objects.size === 2);
  const setup = await page.evaluate(() => __worldStreamingPreview.stats()); assert.equal(setup.simulation.network.roadNodes, 15); assert.equal(setup.simulation.network.railNodes, 15);
  await page.selectOption('#simulation-speed', '4'); await page.click('#simulation-toggle');
  await page.waitForFunction(() => __worldStreamingPreview.simulation.snapshot().elapsedMs >= 2000);
  await page.click('#simulation-toggle'); assert.equal(await page.evaluate(() => __worldStreamingPreview.simulation.snapshot().paused), true);
  await page.click('#simulation-step'); await page.evaluate(() => __worldStreamingPreview.simulation.advance(19 * 60000));
  const economy = await page.evaluate(() => __worldStreamingPreview.stats()); assert.equal(economy.simulation.population, 48); assert(economy.simulation.lastDay.income > economy.simulation.lastDay.expense);
  await page.waitForFunction(() => document.getElementById('simulation-summary').textContent.includes('48 人'));
  await page.screenshot({ path: path.join(OUT, `${backend}-traffic.png`) });
  const rendererKey = await page.evaluate(() => __worldStreamingPreview.entityRenderer.key);
  await page.click('#simulation-step'); assert.equal(await page.evaluate(() => __worldStreamingPreview.entityRenderer.key), rendererKey, 'clock ticks must not rebuild construction sprites');
  await page.evaluate(() => __worldStreamingPreview.setFocus(2864, 336)); await settle(page);
  assert.equal(await page.evaluate(() => __worldStreamingPreview.trafficRenderer.objects.size), 0);
  const away = await page.evaluate(() => __worldStreamingPreview.simulation.snapshot()); await page.click('#simulation-toggle');
  await page.waitForFunction(time => __worldStreamingPreview.simulation.snapshot().elapsedMs > time + 4000, away.elapsedMs);
  await page.click('#simulation-toggle'); await page.click('#simulation-step');
  const distant = await page.evaluate(() => __worldStreamingPreview.stats()); assert(distant.simulation.services.every(service => service.completedLegs > 0)); assert.equal(distant.simulation.population, 48);
  assert(distant.simulation.elapsedMs > away.elapsedMs + 60000); assert.equal(distant.traffic.vehicles, 0);
  await page.click('#world-save'); await page.waitForFunction(() => !__worldStreamingPreview.delta.dirty && !__worldStreamingPreview.session.saving);
  const saved = await page.evaluate(() => __worldStreamingPreview.delta.snapshot()); await page.reload(); await settle(page);
  assert.deepEqual(await page.evaluate(() => __worldStreamingPreview.delta.header.simulation), saved.simulation);
  assert.equal(await page.evaluate(() => __worldStreamingPreview.delta.header.city.budget), saved.city.budget);
  await page.click('#service-follow'); await settle(page); await page.waitForFunction(() => __worldStreamingPreview.trafficRenderer.objects.size === 2);
  // Breaking just the road suspends the bus while the separate rail service survives.
  await build(page, 'bulldoze', { col: 1600, row: 1821 });
  await page.waitForFunction(() => __worldStreamingPreview.delta.header.simulation.services.find(s => s.mode === 'road').status === 'blocked');
  assert.equal(await page.evaluate(() => __worldStreamingPreview.delta.header.simulation.services.find(s => s.mode === 'rail').status), 'active');
  await build(page, 'road', { col: 1600, row: 1821 });
  await page.waitForFunction(() => __worldStreamingPreview.delta.header.simulation.services.every(s => s.status === 'active'));
  for (let i = 0; i < 4; i++) { await page.click('#rotate'); await settle(page); await page.waitForFunction(() => __worldStreamingPreview.trafficRenderer.objects.size === 2); }
  const downloadPromise = page.waitForEvent('download'); await page.click('#world-export'); const download = await downloadPromise;
  const backup = path.join(OUT, `${backend}.heungshing`); await download.saveAs(backup);
  assert.equal(JSON.parse(fs.readFileSync(backup, 'utf8')).snapshot.simulation.services.length, 2);
  await page.click('#service-remove'); await page.waitForFunction(() => __worldStreamingPreview.delta.header.simulation.services.length === 1);
  const oldSlot = await page.evaluate(() => __worldStreamingPreview.session.id); await page.setInputFiles('#world-file', backup);
  await page.waitForFunction(id => __worldStreamingPreview.session.id !== id && __worldStreamingPreview.delta.header.simulation.services.length === 2 && !__worldStreamingPreview.buildUi.busy, oldSlot); await settle(page);
  // Simulate a saved running clock from two minutes ago: reload catches up in one batch.
  const beforeOffline = await page.evaluate(async () => {
    const p = __worldStreamingPreview, state = structuredClone(p.delta.header.simulation); state.paused = false; state.lastWallMs = Date.now() - 120000;
    p.delta.commitSimulation(state, p.delta.header.city.budget); await p.session.flush(); return state.elapsedMs;
  });
  await page.reload(); await settle(page);
  await page.waitForFunction(before => __worldStreamingPreview.simulation.snapshot().elapsedMs >= before + 480000, beforeOffline);
  await page.click('#simulation-toggle');
  if (backend === 'browser') {
    const reader = await context.newPage(); await reader.goto(url); await settle(reader);
    assert(await reader.locator('#simulation-step').isDisabled()); assert.equal(await reader.evaluate(() => HeungShingStorage.writable), false); await reader.close();
  }
  const report = await page.evaluate(() => ({ stats: __worldStreamingPreview.stats(), snapshot: __worldStreamingPreview.delta.snapshot() }));
  assert(report.stats.maxMounted <= 9); assert.equal(errors.length, 0, errors.join('\n'));
  fs.writeFileSync(path.join(OUT, `${backend}-report.json`), JSON.stringify({ setup, economy, distant, ...report, errors }, null, 2));
  console.log(JSON.stringify({ backend, population: report.stats.simulation.population, services: report.stats.simulation.services.length, elapsedMs: report.stats.simulation.elapsedMs, maxMounted: report.stats.maxMounted }));
  await context.close();
  return url;
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'heung-world-sim-'));
  const staticApp = express(); staticApp.use(express.static(ROOT));
  const desktop = createGameApp({ rootDir: ROOT, dbPath: path.join(temporary, 'city.sqlite'), aiNewsCredentialStore: createMemoryAiNewsCredentialStore() });
  const servers = [http.createServer(staticApp), http.createServer(desktop.app)]; let browser;
  try {
    for (const server of servers) await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ channel: process.env.WORLD_TEST_BROWSER || 'chrome', headless: true });
    for (const [i, backend] of ['browser', 'desktop'].entries()) await scenario(browser, backend, `http://127.0.0.1:${servers[i].address().port}`);
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), phone = await phoneContext.newPage();
    await phone.goto(`http://127.0.0.1:${servers[0].address().port}/world/preview.html?storage=browser`); await settle(phone);
    await phone.locator('#simulation-summary').tap(); await phone.locator('#simulation-step').tap();
    assert.equal(await phone.evaluate(() => __worldStreamingPreview.simulation.snapshot().day), 2);
    await phone.screenshot({ path: path.join(OUT, 'mobile.png') }); await phoneContext.close(); console.log(`PASS world simulation: ${OUT}`);
  } finally { await browser?.close(); await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve)))); desktop.store.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
