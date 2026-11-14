#!/usr/bin/env node
// Read-only terrain slice smoke test. No city database or real player profile is opened.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'test-results/world-streaming');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function settled(page) {
  await page.waitForFunction(() => {
    const preview = globalThis.__worldStreamingPreview;
    if (!preview?.ready) return false;
    const s = preview.stats();
    return s.states.ACTIVE === s.wanted && !s.states.UNMOUNTING && !s.states.MOUNTING && !s.states.DECODING;
  }, null, { timeout: 30000 });
  return page.evaluate(() => globalThis.__worldStreamingPreview.stats());
}

(async () => {
  if (!fs.existsSync(path.join(ROOT, 'data/world-terrain/manifest.json'))) throw new Error('Run npm run prepare:world-terrain first');
  fs.mkdirSync(OUT, { recursive: true });
  const app = express(); app.use(express.static(ROOT));
  const server = http.createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.WORLD_TEST_BROWSER || 'chrome', headless: true,
      args: ['--enable-precise-memory-info'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    const url = `http://127.0.0.1:${server.address().port}/world/preview.html`;
    await page.goto(url);
    const initial = await settled(page);
    assert.equal(initial.wanted, 9); assert.equal(initial.states.ACTIVE, 9);
    assert(initial.renderer.gameObjects < 9216);
    assert(!requests.some(request => request.endsWith('/hk-terrain-tiles.js')), 'the full RLE source must not enter the preview bundle');
    assert.equal(await page.evaluate(() => typeof city), 'undefined', 'preview must not boot the legacy simulation');
    await page.evaluate(() => { const p = __worldStreamingPreview, f = p.stats().focus; p.setFocus(f.col + 32, f.row); });
    const crossed = await settled(page);
    console.log(JSON.stringify({ stage: 'crossing', before: { mounted: initial.mounted, focus: initial.focus, states: initial.states },
      after: { mounted: crossed.mounted, unmounted: crossed.unmounted, focus: crossed.focus, states: crossed.states } }));
    assert.equal(crossed.activeIds.filter(id => initial.activeIds.includes(id)).length, 6);
    assert.equal(crossed.mounted - initial.mounted, 3);
    assert.equal(crossed.unmounted - initial.unmounted, 3);
    assert(crossed.renderer.destroyedObjects > 0);
    const start = Date.now();
    let peakObjects = crossed.renderer.gameObjects;
    for (let index = 0; index < 20; index++) {
      await page.evaluate(index => {
        const p = __worldStreamingPreview, region = p.manifest.trial;
        p.setFocus(region.col + (index % 2 ? 48 : 208), region.row + (index % 2 ? 48 : 208));
      }, index);
      const stats = await settled(page); peakObjects = Math.max(peakObjects, stats.renderer.gameObjects);
      assert(stats.maxMounted <= 9); assert(stats.terrain.decodedBytes <= 2097152); assert(stats.terrain.packBytes <= 1048576);
    }
    await page.click('#home'); await settled(page);
    await page.evaluate(() => __worldStreamingPreview.scene.cameras.main.setZoom(.4));
    const rotations = [];
    for (let rotation = 0; rotation < 4; rotation++) {
      if (rotation) await page.click('#rotate');
      const stats = await settled(page); assert.equal(stats.rotation, rotation);
      assert(stats.maxMounted <= 9);
      const roundTrip = await page.evaluate(() => {
        const p = __worldStreamingPreview, tile = p.stats().focus, point = p.adapter.project(tile.col, tile.row);
        return p.adapter.unproject(point.x, point.y);
      });
      assert(Math.abs(roundTrip.col - stats.focus.col) < 1e-6);
      assert(Math.abs(roundTrip.row - stats.focus.row) < 1e-6);
      await page.screenshot({ path: path.join(OUT, `rotation-${rotation}.png`) });
      rotations.push({ rotation, gameObjects: stats.renderer.gameObjects, active: stats.states.ACTIVE });
    }
    // A deliberately wide 0.4x viewport extends past the nine detail chunks: LOD must cover it.
    await page.setViewportSize({ width: 2560, height: 1600 }); await pause(100);
    await settled(page);
    const wide = await page.evaluate(() => {
      const p = __worldStreamingPreview, camera = p.scene.cameras.main, focus = p.stats().focus;
      const origin = { x: camera.width / 2, y: camera.height / 2 };
      const corner = p.adapter.unproject(camera.scrollX + origin.x - origin.x / camera.zoom,
        camera.scrollY + origin.y - origin.y / camera.zoom);
      return { extendsPastDetail: Math.abs(corner.col - focus.col) > 48 || Math.abs(corner.row - focus.row) > 48,
        lodVisible: p.scene.children.list.some(object => /^world-lod-/.test(object.texture?.key || '') && object.visible), maxMounted: p.stats().maxMounted };
    });
    assert(wide.extendsPastDetail && wide.lodVisible); assert(wide.maxMounted <= 9);
    await page.screenshot({ path: path.join(OUT, 'wide-lod.png') });
    const cdp = await context.newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage');
    const final = await page.evaluate(() => __worldStreamingPreview.stats());
    assert.equal(final.errors, 0); assert.equal(errors.length, 0, errors.join('\n'));
    console.log(JSON.stringify({ stage: 'desktop', active: final.states.ACTIVE, maxMounted: final.maxMounted,
      destroyedObjects: final.renderer.destroyedObjects, gameObjects: final.renderer.gameObjects, elapsedMs: Date.now() - start }));

    // Asset failure leaves the independent LOD mounted, and a later retry can complete.
    const failed = await context.newPage(); let failures = 0;
    await failed.route('**/packs/p-6-6.bin', route => ++failures === 1 ? route.fulfill({ status: 404, body: 'not found' }) : route.continue());
    await failed.goto(url);
    await failed.waitForFunction(() => globalThis.__worldStreamingPreview?.ready && __worldStreamingPreview.stats().errors > 0);
    assert(await failed.evaluate(() => __worldStreamingPreview.scene.children.list.some(object => object.texture?.key === 'world-lod-0' && object.visible)));
    const recovered = await settled(failed); assert.equal(recovered.states.ACTIVE, 9);
    await failed.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const touchPage = await mobile.newPage(); await touchPage.goto(url); await settled(touchPage);
    const touchCdp = await mobile.newCDPSession(touchPage);
    const beforeTouch = await touchPage.evaluate(() => __worldStreamingPreview.stats());
    const touch = (type, points) => touchCdp.send('Input.dispatchTouchEvent', { type,
      touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
    await touch('touchStart', [[190, 330, 1]]);
    await touch('touchMove', [[230, 350, 1]]); await touch('touchEnd', []);
    await pause(100);
    const panned = await touchPage.evaluate(() => __worldStreamingPreview.stats());
    assert(Math.abs(panned.focus.col - beforeTouch.focus.col) > 0.05 || Math.abs(panned.focus.row - beforeTouch.focus.row) > .05);
    await touch('touchStart', [[140, 350, 1], [240, 350, 2]]);
    await touch('touchMove', [[100, 350, 1], [280, 350, 2]]); await touch('touchEnd', []);
    await pause(100);
    const pinched = await touchPage.evaluate(() => __worldStreamingPreview.stats());
    assert(pinched.zoom > panned.zoom);
    await settled(touchPage); await touchPage.screenshot({ path: path.join(OUT, 'mobile.png') });
    const report = { recordedAt: new Date().toISOString(), browser: await browser.version(),
      note: 'Headless desktop Chromium measurements; not an iPhone Safari or production FPS benchmark.',
      initial, crossed, final, peakObjects, rotations, wide, recoveryErrors: recovered.errors,
      touch: { panChangedFocus: true, zoomBefore: panned.zoom, zoomAfter: pinched.zoom },
      requests: requests.filter(request => request.includes('/packs/')).length, errors };
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`PASS world streaming: ${path.join(OUT, 'report.json')}`);
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
