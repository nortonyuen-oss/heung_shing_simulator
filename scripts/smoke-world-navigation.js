#!/usr/bin/env node
// Full-world UI tests use an isolated browser database and never open a player's profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'test-results/world-navigation');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function settled(page) {
  await page.waitForFunction(() => {
    const p = globalThis.__worldStreamingPreview; if (!p?.ready) return false;
    const s = p.stats(); return s.states.ACTIVE === s.wanted && !s.states.UNMOUNTING && !s.states.MOUNTING && !s.states.DECODING;
  }, null, { timeout: 60000 });
}
async function mapPoint(page, tile) {
  return page.evaluate(tile => {
    const m = __worldStreamingPreview.minimap, p = m.transform.worldToMinimap(tile.col, tile.row), rect = m.surface.getBoundingClientRect();
    return { x: rect.left + p.x / m.view.width * rect.width, y: rect.top + p.y / m.view.height * rect.height };
  }, tile);
}
async function clickMap(page, tile) {
  const point = await mapPoint(page, tile); await page.mouse.click(point.x, point.y);
  const focus = await page.evaluate(() => __worldStreamingPreview.stats().focus);
  assert(Math.abs(focus.col - tile.col) < 3 && Math.abs(focus.row - tile.row) < 3, JSON.stringify({ tile, focus }));
}
async function build(page, tool, a, b = a) {
  await page.selectOption('#build-tool', tool);
  await page.evaluate(async ({ a, b }) => {
    const p = __worldStreamingPreview; p.setFocus(a.col, a.row); await p.buildUi.planAt(a);
    if (a.col !== b.col || a.row !== b.row) await p.buildUi.planAt(b);
  }, { a, b });
  await page.click('#confirm-build'); await settled(page);
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const app = express(); app.use(express.static(ROOT)); const server = http.createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.WORLD_TEST_BROWSER || 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); }); page.on('request', request => requests.push(request.url()));
    const url = `http://127.0.0.1:${server.address().port}/world/benchmark.html?storage=browser`;
    await page.goto(url); await settled(page);
    await page.waitForFunction(() => __worldStreamingPreview.minimap.cache.snapshot().images > 0 && !__worldStreamingPreview.minimap.cache.snapshot().pending);
    assert.equal(await page.evaluate(() => __worldStreamingPreview.adapter.region.width), 3187);
    const stationary = await page.evaluate(() => __worldStreamingPreview.minimap.snapshot()); await pause(150);
    const idle = await page.evaluate(() => __worldStreamingPreview.minimap.snapshot());
    assert.equal(idle.draws.base, stationary.draws.base); assert.equal(idle.draws.city, stationary.draws.city);
    assert(idle.cache.bytes <= 4194304);
    await page.click('[data-map-mode]'); await page.waitForFunction(() => __worldStreamingPreview.minimap.layoutKey.startsWith('world:'));
    const rotationChecks = [];
    for (let rotation = 0; rotation < 4; rotation++) {
      if (rotation) { await page.click('#rotate'); await settled(page); }
      await clickMap(page, { col: 2864, row: 336 }); await settled(page);
      await clickMap(page, { col: 112, row: 2200 }); await settled(page);
      const snapshot = await page.evaluate(() => __worldStreamingPreview.stats()); assert(snapshot.maxMounted <= 9);
      rotationChecks.push({ rotation, focus: snapshot.focus });
      await page.screenshot({ path: path.join(OUT, `world-r${rotation}.png`) });
    }
    // A distant map click moves the camera while its pack reads are deliberately held.
    const held = []; let hold = true;
    await page.route('**/packs/**', route => hold ? held.push(route) : route.continue());
    await clickMap(page, { col: 3000, row: 2100 }); await pause(80);
    const pending = await page.evaluate(() => ({ stats: __worldStreamingPreview.stats(), lod: __worldStreamingPreview.scene.children.list.some(o => /^world-lod-/.test(o.texture?.key || '') && o.visible) }));
    assert(pending.lod); assert(pending.stats.states.ACTIVE !== pending.stats.wanted); assert(held.length > 0);
    hold = false; await Promise.all(held.map(route => route.continue())); await settled(page); await page.unroute('**/packs/**');
    // Exact world corners exercise the short final render/storage columns.
    for (const point of [{ col: 0, row: 0 }, { col: 3186, row: 0 }, { col: 3186, row: 2399 }, { col: 0, row: 2399 }]) {
      await page.evaluate(point => __worldStreamingPreview.setFocus(point.col, point.row), point); await settled(page);
      const stats = await page.evaluate(() => __worldStreamingPreview.stats()); assert.equal(stats.states.ACTIVE, 4); assert(stats.maxMounted <= 9);
      assert(Math.abs(stats.focus.col - point.col) < .001 && Math.abs(stats.focus.row - point.row) < .001);
    }
    // New construction well outside the previous trial remains visible in the overview
    // after every one of its detail sprites has been destroyed, and survives save/reload.
    await page.click('[data-map-mode]'); await page.waitForFunction(() => __worldStreamingPreview.minimap.layoutKey.startsWith('local:'));
    await build(page, 'flatten4', { col: 2863, row: 335 });
    await build(page, 'market2', { col: 2863, row: 335 });
    const entity = await page.evaluate(() => [...__worldStreamingPreview.delta.entities.values()][0]); assert(entity.col > 1728);
    await page.click('[data-map-mode]'); await page.waitForFunction(() => __worldStreamingPreview.minimap.layoutKey.startsWith('world:'));
    await clickMap(page, { col: 1584, row: 1760 }); await settled(page);
    assert.equal(await page.evaluate(id => [...__worldStreamingPreview.entityRenderer.objects.values()].filter(o => o.worldEntityId === id).length, entity.id), 0);
    const markerVisible = await page.evaluate(entity => {
      const m = __worldStreamingPreview.minimap, p = m.transform.worldToMinimap(entity.col, entity.row);
      return m.city.getContext('2d').getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data[3] > 0;
    }, entity); assert(markerVisible);
    await page.click('#world-save'); await page.waitForFunction(() => !__worldStreamingPreview.delta.dirty && !__worldStreamingPreview.session.saving);
    await page.reload(); await settled(page);
    assert.equal(await page.evaluate(id => __worldStreamingPreview.delta.entities.has(id), entity.id), true);
    await page.evaluate(entity => __worldStreamingPreview.setFocus(entity.col, entity.row), entity); await settled(page);
    assert.equal(await page.evaluate(id => [...__worldStreamingPreview.entityRenderer.objects.values()].filter(o => o.worldEntityId === id).length, entity.id), 1);
    // Moving inside one local cache cell only redraws the lightweight camera layer.
    await page.waitForFunction(() => __worldStreamingPreview.minimap.cache.snapshot().images > 0 && !__worldStreamingPreview.minimap.cache.snapshot().pending); await pause(50);
    const beforeMove = await page.evaluate(() => {
      const p = __worldStreamingPreview; p.setFocus(2865, 337); return p.minimap.snapshot();
    }); await pause(60);
    const afterMove = await page.evaluate(() => __worldStreamingPreview.minimap.snapshot());
    assert.equal(afterMove.draws.base, beforeMove.draws.base); assert.equal(afterMove.draws.city, beforeMove.draws.city); assert(afterMove.draws.viewport > beforeMove.draws.viewport);
    // Local map dragging keeps the initial map transform fixed until pointer release.
    const start = await mapPoint(page, { col: 2865, row: 337 }), end = await mapPoint(page, { col: 2880, row: 345 });
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 }); await page.mouse.up(); await settled(page);
    const dragged = await page.evaluate(() => __worldStreamingPreview.stats().focus); assert(Math.abs(dragged.col - 2880) < 1 && Math.abs(dragged.row - 345) < 1);
    // Header dragging moves the panel without moving the camera or creating a draft.
    const beforeDrag = await page.evaluate(() => __worldStreamingPreview.stats().focus), heading = await page.locator('[data-map-title]').boundingBox();
    await page.mouse.move(heading.x + 20, heading.y + 5); await page.mouse.down(); await page.mouse.move(heading.x - 120, heading.y - 90); await page.mouse.up();
    const afterDrag = await page.evaluate(() => __worldStreamingPreview.stats().focus); assert.deepEqual(afterDrag, beforeDrag);
    await page.click('[data-map-collapse]'); assert.equal(await page.locator('.minimap-surface').isVisible(), false);
    await page.click('[data-map-collapse]'); assert.equal(await page.locator('.minimap-surface').isVisible(), true);
    await page.screenshot({ path: path.join(OUT, 'local-building.png') });
    const stats = await page.evaluate(() => __worldStreamingPreview.stats()); assert(stats.maxMounted <= 9); assert(stats.terrain.decodedBytes <= 2097152); assert(stats.minimap.cache.bytes <= 4194304);
    assert(!requests.some(url => url.endsWith('/hk-terrain-tiles.js'))); assert.equal(errors.length, 0, errors.join('\n'));
    // Phone touch on the overview navigates without invoking the selected building tool.
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), phone = await mobile.newPage();
    phone.on('pageerror', error => errors.push(error.message)); await phone.goto(url); await settled(phone);
    await phone.selectOption('#build-tool', 'market2'); await phone.locator('[data-map-mode]').tap();
    await phone.waitForFunction(() => __worldStreamingPreview.minimap.layoutKey.startsWith('world:'));
    const target = { col: 2700, row: 600 }, touchPoint = await mapPoint(phone, target); await phone.touchscreen.tap(touchPoint.x, touchPoint.y); await settled(phone);
    const touchStats = await phone.evaluate(() => ({ focus: __worldStreamingPreview.stats().focus, entities: __worldStreamingPreview.delta.entities.size, draft: __worldStreamingPreview.buildUi.draft }));
    assert(Math.abs(touchStats.focus.col - target.col) < 20 && Math.abs(touchStats.focus.row - target.row) < 20); assert.equal(touchStats.entities, 0); assert.equal(touchStats.draft, null);
    await phone.screenshot({ path: path.join(OUT, 'mobile-world.png') }); await mobile.close(); assert.equal(errors.length, 0, errors.join('\n'));
    const report = { recordedAt: new Date().toISOString(), browser: await browser.version(), rotationChecks, immediateLod: true, markerVisible, persistedEntity: entity.id, stats, touchStats, errors };
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2)); console.log(`PASS world navigation: ${path.join(OUT, 'report.json')}`); await context.close();
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
