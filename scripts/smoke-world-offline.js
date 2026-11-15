#!/usr/bin/env node
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright-core');
const origin = process.env.WORLD_TEST_URL || 'http://127.0.0.1:4183', OUT = path.resolve(__dirname, '../test-results/world-phase5');
async function settled(page) {
  await page.waitForFunction(() => { const p = globalThis.__worldStreamingPreview; if (!p?.ready) return false; const s = p.manager.snapshot(); return s.states.ACTIVE === s.wanted && !s.states.UNMOUNTING && !s.states.DECODING && !s.states.MOUNTING; }, null, { timeout: 90000 });
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }), page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin); await page.waitForFunction(() => typeof gameReady !== 'undefined' && gameReady, null, { timeout: 150000 });
    await page.evaluate(() => navigator.serviceWorker.ready); console.log('Offline test: service worker installed');
    await page.evaluate(async () => { await HeungShingWorldEntry.enterWorld(HeungShingWorldEntry.createWorldUrl({ name: '離線驗收', startYear: 1900 })); }); await settled(page);
    await page.evaluate(async () => { const p = __worldStreamingPreview; for (const tool of ['flatten4', 'market2']) p.construction.confirm(await p.construction.plan(tool, { col: 1599, row: 1791 })); await p.session.flush(); }); await settled(page);
    const before = await page.evaluate(() => ({ slot: __worldStreamingPreview.session.id, entities: __worldStreamingPreview.delta.entities.size }));
    await context.setOffline(true); await page.reload(); await settled(page); assert.equal(await page.evaluate(() => __worldStreamingPreview.delta.entities.size), before.entities);
    await page.evaluate(() => __worldStreamingPreview.setFocus(3000, 2200));
    await page.waitForFunction(() => __worldStreamingPreview.manager.snapshot().errors > 0);
    const fallback = await page.evaluate(() => ({ lod: __worldStreamingPreview.scene.children.list.some(o => /^world-lod-/.test(o.texture?.key || '') && o.visible), entities: __worldStreamingPreview.delta.entities.size, maxMounted: __worldStreamingPreview.manager.snapshot().maxMounted }));
    assert(fallback.lod); assert.equal(fallback.entities, before.entities); assert(fallback.maxMounted <= 9);
    await context.setOffline(false); await settled(page); const resumed = await page.evaluate(() => __worldStreamingPreview.delta.entities.size); assert.equal(resumed, before.entities);
    await page.screenshot({ path: path.join(OUT, 'offline-recovered.png') }); await context.close();
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), phone = await phoneContext.newPage();
    const lanOrigin = process.env.WORLD_LAN_URL || 'http://192.168.212.106:4183';
    await phone.goto(`${lanOrigin}/world/index.html?new=world-lan-${Date.now()}&name=LAN驗收&year=1980`); await settled(phone);
    assert.equal(await phone.evaluate(() => isSecureContext), false); assert.equal(await phone.evaluate(() => HeungShingStorage.writable), true);
    await phone.evaluate(async () => { const p = __worldStreamingPreview; for (const tool of ['flatten4', 'market2']) p.construction.confirm(await p.construction.plan(tool, { col: 1599, row: 1791 })); await p.session.flush(); });
    await phone.reload(); await settled(phone); assert.equal(await phone.evaluate(() => __worldStreamingPreview.delta.entities.size), 1); assert.equal(await phone.evaluate(() => HeungShingStorage.writable), true);
    await phone.locator('[data-map-mode]').tap(); await phone.waitForFunction(() => __worldStreamingPreview.minimap.layoutKey.startsWith('world:'));
    await phone.setViewportSize({ width: 844, height: 390 }); await settled(phone); await phone.setViewportSize({ width: 390, height: 844 });
    await phone.screenshot({ path: path.join(OUT, 'mobile-lan.png') }); await phoneContext.close();
    assert.equal(errors.length, 0); fs.writeFileSync(path.join(OUT, 'offline-report.json'), JSON.stringify({ before, offlineReload: true, fallback, resumed, lanHttpSaveReload: true, errors }, null, 2));
    console.log('PASS offline reload, uncached-region LOD fallback, recovery and LAN HTTP save/reload.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
