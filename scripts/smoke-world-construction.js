#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { chromium } = require('playwright-core');
const { createGameApp, createMemoryAiNewsCredentialStore } = require('../server');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'test-results/world-construction');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function settle(page) {
  await page.waitForFunction(() => {
    const p = globalThis.__worldStreamingPreview;
    if (!p?.ready) return false;
    const s = p.stats(); return s.states.ACTIVE === s.wanted && !s.states.MOUNTING && !s.states.UNMOUNTING && !s.states.DECODING;
  }, null, { timeout: 60000 });
}
async function buildViaUi(page, tool, a, b = a) {
  await page.selectOption('#build-tool', tool);
  await page.evaluate(async ({ a, b }) => {
    const p = __worldStreamingPreview;
    p.setFocus(a.col + 2, a.row + 2);
    await p.buildUi.planAt(a);
    if (a.col !== b.col || a.row !== b.row) await p.buildUi.planAt(b);
  }, { a, b });
  await page.click('#confirm-build'); await settle(page);
}
async function runScenario(browser, backend, origin) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage(), errors = []; page.on('pageerror', error => { errors.push(error.message); console.error(`[${backend} browser] ${error.message}`); });
  const url = `${origin}/world/benchmark.html?storage=${backend}`;
  await page.goto(url); await settle(page);
  assert.equal(await page.evaluate(() => HEUNG_SHING_CONFIG.platform), backend === 'browser' ? 'web' : 'desktop');
  for (const [tool, anchor] of [['market2', { col: 1599, row: 1791 }], ['park4', { col: 1663, row: 1727 }]]) {
    await buildViaUi(page, 'flatten4', anchor);
    if (tool === 'market2') {
      // Exercise actual mouse picking and confirmation, not just the programmatic planner.
      await page.selectOption('#build-tool', tool);
      const point = await page.evaluate(anchor => {
        const p = __worldStreamingPreview, camera = p.scene.cameras.main, world = p.adapter.project(anchor.col, anchor.row), rect = p.game.canvas.getBoundingClientRect();
        return { x: rect.left + (world.x - camera.scrollX - camera.width / 2) * camera.zoom + camera.width / 2,
          y: rect.top + (world.y - 40 - camera.scrollY - camera.height / 2) * camera.zoom + camera.height / 2 };
      }, anchor);
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(() => __worldStreamingPreview.buildUi.draft?.tool === 'market2');
      const picked = await page.evaluate(() => __worldStreamingPreview.buildUi.draft.operations.find(operation => operation.kind === 'entity').value);
      assert.equal(picked.col, anchor.col); assert.equal(picked.row, anchor.row);
      await page.click('#confirm-build'); await settle(page);
    } else await buildViaUi(page, tool, anchor);
  }
  // Lay a flat rail corridor over a storage boundary using the actual terrain tool.
  for (const col of [1592, 1596, 1600, 1604]) await buildViaUi(page, 'flatten4', { col, row: 1820 });
  await buildViaUi(page, 'rail', { col: 1593, row: 1821 }, { col: 1607, row: 1821 });
  // Build both banks, then excavate a narrow channel; the bridge crosses s:23 -> s:24.
  for (const col of [1528, 1532, 1536, 1540]) await buildViaUi(page, 'flatten4', { col, row: 1704 });
  await buildViaUi(page, 'water4', { col: 1534, row: 1704 });
  await buildViaUi(page, 'bridge', { col: 1530, row: 1706 }, { col: 1542, row: 1706 });
  await buildViaUi(page, 'road', { col: 1599, row: 1794 }, { col: 1602, row: 1794 });
  await buildViaUi(page, 'zoneR', { col: 1600, row: 1793 }, { col: 1602, row: 1793 });
  const original = await page.evaluate(() => __worldStreamingPreview.delta.snapshot());
  assert.equal(original.entities.length, 4);
  assert(original.chunks.some(chunk => chunk.entityIds.length > 0));
  // Move away so the first building's visuals are genuinely destroyed before saving.
  await page.evaluate(() => { const p = __worldStreamingPreview, r = p.manifest.trial; p.setFocus(r.col + 48, r.row + 48); });
  await settle(page);
  assert.equal(await page.evaluate(() => __worldStreamingPreview.delta.entities.size), 4);
  await page.click('#world-save');
  await page.waitForFunction(() => !__worldStreamingPreview.delta.dirty && !__worldStreamingPreview.session.saving);
  const savedRevision = await page.evaluate(() => __worldStreamingPreview.session.storageRevision);
  assert(savedRevision > 0);
  await page.reload(); await settle(page);
  const reloaded = await page.evaluate(() => __worldStreamingPreview.delta.snapshot());
  assert.deepEqual(reloaded.entities, original.entities);
  assert.deepEqual(reloaded.chunks, original.chunks);
  const market = original.entities.find(entity => entity.modelId === 'market2');
  await page.evaluate(entity => __worldStreamingPreview.setFocus(entity.col, entity.row), market); await settle(page);
  assert.equal(await page.evaluate(id => [...__worldStreamingPreview.entityRenderer.objects.values()].filter(object => object.worldEntityId === id).length, market.id), 1);
  for (let n = 0; n < 4; n++) {
    if (n) { await page.click('#rotate'); await settle(page); }
    assert.equal(await page.evaluate(id => __worldStreamingPreview.delta.entityAt(1600, 1792).id === id, market.id), true);
    assert.equal(await page.evaluate(id => [...__worldStreamingPreview.entityRenderer.objects.values()].filter(object => object.worldEntityId === id).length, market.id), 1);
  }
  await page.screenshot({ path: path.join(OUT, `${backend}-building.png`) });
  const downloadPromise = page.waitForEvent('download'); await page.click('#world-export'); const download = await downloadPromise;
  const backupPath = path.join(OUT, `${backend}.heungshing`); await download.saveAs(backupPath);
  const exported = JSON.parse(fs.readFileSync(backupPath, 'utf8')); assert.equal(exported.snapshot.entities.length, 4);
  // Demolish through a non-anchor footprint tile, save, and roll back the previous revision.
  await buildViaUi(page, 'bulldoze', { col: 1600, row: 1792 }); await page.click('#world-save');
  await page.waitForFunction(() => !__worldStreamingPreview.delta.dirty);
  assert.equal(await page.evaluate(() => __worldStreamingPreview.delta.entities.size), 3);
  await page.click('#world-rollback'); await page.waitForFunction(() => __worldStreamingPreview.delta.entities.size === 4); await settle(page);
  const slotBefore = await page.evaluate(() => __worldStreamingPreview.session.id);
  await page.setInputFiles('#world-file', backupPath);
  await page.waitForFunction(id => __worldStreamingPreview.session.id !== id && __worldStreamingPreview.delta.entities.size === 4, slotBefore);
  await settle(page);
  const report = await page.evaluate(() => ({ stats: __worldStreamingPreview.stats(), snapshot: __worldStreamingPreview.delta.snapshot(), slot: __worldStreamingPreview.session.id }));
  assert(report.stats.maxMounted <= 9); assert.equal(errors.length, 0, errors.join('\n'));
  if (backend === 'desktop') {
    const metadata = await page.evaluate(async () => (await (await fetch('/api/world-saves')).json()));
    assert.equal(metadata.length, 2);
  }
  fs.writeFileSync(path.join(OUT, `${backend}-report.json`), JSON.stringify({ ...report, errors }, null, 2));
  console.log(JSON.stringify({ backend, entities: report.snapshot.entities.length, chunks: report.snapshot.chunks.length, maxMounted: report.stats.maxMounted, revision: report.stats.construction.storageRevision }));
  await context.close();
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'heung-world-build-'));
  const staticApp = express(); staticApp.use(express.static(ROOT));
  const desktop = createGameApp({ rootDir: ROOT, dbPath: path.join(temporary, 'city.sqlite'), aiNewsCredentialStore: createMemoryAiNewsCredentialStore() });
  const servers = [http.createServer(staticApp), http.createServer(desktop.app)];
  let browser;
  try {
    for (const server of servers) await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const [index, backend] of ['browser', 'desktop'].entries()) await runScenario(browser, backend, `http://127.0.0.1:${servers[index].address().port}`);
    console.log(`PASS construction/save/reload/export/rollback: ${OUT}`);
  } finally { await browser?.close(); await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve)))); desktop.store.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
