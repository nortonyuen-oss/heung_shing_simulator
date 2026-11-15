#!/usr/bin/env node
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const express = require('express'), { chromium } = require('playwright-core');
const { createGameApp, createMemoryAiNewsCredentialStore } = require('../server');
const { makeWorldWorkload } = require('./world-phase5-workload');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'test-results/world-phase5');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function settled(page) {
  await page.waitForFunction(() => {
    const p = globalThis.__worldStreamingPreview; if (p?.errors.length && !p.ready) return true; if (!p?.ready) return false;
    const s = p.manager.snapshot(); return s.states.ACTIVE === s.wanted && !s.states.MOUNTING && !s.states.UNMOUNTING && !s.states.DECODING;
  }, null, { timeout: 120000 });
  assert(await page.evaluate(() => __worldStreamingPreview.ready), await page.locator('#status').textContent());
}
function smallStats() {
  const p = __worldStreamingPreview, s = p.stats(), gl = p.game.renderer.gl, info = gl?.getExtension('WEBGL_debug_renderer_info');
  return { frameP95Ms: s.frameP95Ms, frameP99Ms: s.frameP99Ms, detailLoadP95Ms: s.detailLoadP95Ms, mountP95Ms: s.mountP95Ms,
    heapBytes: performance.memory?.usedJSHeapSize ?? null, renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl ? 'WebGL' : 'Canvas',
    gameObjects: s.renderer.gameObjects + s.construction.visuals.objects + s.traffic.vehicles, terrainTiles: s.renderer.terrainTiles, maxMounted: s.maxMounted,
    cache: s.terrain, minimap: s.minimap.cache, save: s.save, network: s.simulation.network, elapsedMs: s.simulation.elapsedMs,
    population: s.simulation.population, entities: p.delta.entities.size, services: s.simulation.services.length, errors: p.errors };
}
async function frames(page, samples = 120) {
  return page.evaluate(samples => new Promise(resolve => {
    const values = []; let previous;
    function frame(time) { if (previous !== undefined) values.push(time - previous); previous = time;
      if (values.length < samples) { requestAnimationFrame(frame); return; }
      values.sort((a, b) => a - b); resolve({ samples, p95Ms: values[Math.floor(samples * .95)], p99Ms: values[Math.floor(samples * .99)] });
    } requestAnimationFrame(frame);
  }), samples);
}
async function menuScenario(browser, origin, backend) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.log(backend, 'PAGE ERROR', error.message); }); page.on('console', message => { if(message.type()==='error') console.log(backend,'CONSOLE',message.text().slice(0,400)); }); page.on('dialog', dialog => dialog.accept());
  if (backend === 'desktop') await page.route('**/phaser@3.60.0/**', route => route.fulfill({ path: require.resolve('phaser/dist/phaser.min.js'), contentType: 'application/javascript' }));
  await page.goto(origin); await page.waitForFunction(() => typeof gameReady !== 'undefined' && gameReady, null, { timeout: 150000 });
  assert.equal(await page.locator('#btn-world-saves').count(), 0);
  await page.click('#btn-new-game'); await page.click('[data-source-id="hk-territory"]'); await page.fill('#city-name-input', `${backend} 全港整合`);
  await page.click('#btn-start-city');
  const sharedReady = () => globalThis.__worldGameHost?.ready && __worldGameHost.manager.snapshot().states.ACTIVE === 9;
  try { await page.waitForFunction(sharedReady, null, { timeout: 90000 }); } catch(error) { console.log(backend, await page.evaluate(()=>({host:!!globalThis.__worldGameHost,ready:globalThis.__worldGameHost?.ready,stats:globalThis.__worldGameHost?.manager?.snapshot(),frames:window.__frameErrors,toasts:document.getElementById('toast-container')?.innerText}))); throw error; }
  const original = await page.evaluate(async () => {
    setGameSpeed(GAME_SPEEDS.PAUSED); const host = __worldGameHost;
    mapData[1760][1584] = GROUND; heightMap[1760][1584] = 0;
    selectedTool = 'road'; const result = applyToolAt(activeScene,1760,1584);
    if (!await saveGame()) throw Error('World save failed'); return { slot: host.session.id, result, budget: city.budget };
  }); assert(original.result.changed);
  await page.reload(); await page.waitForFunction(sharedReady, null, { timeout: 150000 });
  assert.equal(await page.evaluate(() => mapData[1760][1584]), 2);
  await page.evaluate(() => returnToMainMenu()); await page.click('#btn-continue');
  await page.locator(`[data-world-slot="${original.slot}"]`).click(); await page.waitForFunction(sharedReady, null, { timeout: 90000 });
  assert.equal(await page.evaluate(() => city.budget), original.budget); assert.deepEqual(errors, []);
  await context.close(); console.log(JSON.stringify({ stage: 'shared-menu', backend, slot: original.slot }));
}
async function compareRender(browser, origin) {
  const results = [];
  for (const size of [32, 64]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage();
    await page.goto(`${origin}/world/benchmark.html?benchmark=1&render=${size}`); await settled(page); await frames(page, 60);
    const steady = await frames(page); const loads = [];
    for (let i = 0; i < 16; i++) {
      const start = Date.now(); await page.evaluate(i => __worldStreamingPreview.setFocus(1456 + (i % 4) * 64, 1664 + Math.floor(i / 4) * 64), i); await settled(page); loads.push(Date.now() - start);
    }
    const stats = await page.evaluate(smallStats); assert(stats.maxMounted <= 9); assert(stats.terrainTiles <= 9 * size * size);
    results.push({ renderChunkTiles: size, viewport: '1280x900', zoom: .8, focus: 'same 256x256 HK trial area', steady, loadsMs: loads, stats }); await context.close();
  }
  fs.writeFileSync(path.join(OUT, 'render-comparison.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ stage: 'render-comparison', results: results.map(r => ({ size: r.renderChunkTiles, steady: r.steady, objects: r.stats.gameObjects })) })); return results;
}
async function pressure(browser, origin, backend, seconds) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); await page.goto(`${origin}/world/benchmark.html?storage=${backend}`); await settled(page);
  const installed = await page.evaluate(async () => {
    const p = __worldStreamingPreview, state = await (await fetch('/__test/world-workload.json')).json();
    p.session.autosaveMs = 1e9; state.simulation.lastWallMs = Date.now(); const start = performance.now(); p.delta.replace(state, { dirty: true });
    p.simulation.setPaused(false); p.simulation.setSpeed(16); const installMs = performance.now() - start;
    const write = performance.now(); await p.session.flush(); return { installMs, initialSaveMs: performance.now() - write, exportBytes: new Blob([p.session.exportBackup()]).size };
  }); await settled(page); await frames(page, 60);
  const cdp = await context.newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage');
  const initial = await page.evaluate(smallStats), steady = await frames(page), checkpoints = [], started = Date.now(); let moves = 0, peakObjects = initial.gameObjects;
  while (Date.now() - started < seconds * 1000) {
    await page.evaluate(i => { const p = __worldStreamingPreview; if (i % 12 === 0) { p.rotate(); p.scene.cameras.main.setZoom(i % 24 ? .4 : .8); } p.setFocus(112 + (i * 127) % 2800, 128 + i % 16 * 128); }, moves++);
    await settled(page); const s = await page.evaluate(smallStats); peakObjects = Math.max(peakObjects, s.gameObjects);
    assert(s.maxMounted <= 9); assert(s.terrainTiles <= 9216); assert(s.cache.decodedBytes <= 2097152); assert(s.cache.packBytes <= 1048576); assert(s.minimap.bytes <= 4194304);
    if (moves % 20 === 0) { await cdp.send('HeapProfiler.collectGarbage'); checkpoints.push({ elapsedMs: Date.now() - started, ...await page.evaluate(smallStats) }); console.log(JSON.stringify({ stage: 'soak', backend, seconds: Math.round((Date.now() - started) / 1000), moves })); }
    await pause(80);
  }
  await page.evaluate(() => { const p = __worldStreamingPreview; while (p.adapter.rotation) p.rotate(); p.scene.cameras.main.setZoom(.8); p.setFocus(1584, 1760); p.simulation.setPaused(true); }); await settled(page);
  const catchup = await page.evaluate(async () => {
    const p = __worldStreamingPreview, start = performance.now(); p.simulation.advance(36500 * 60000); const catchupMs = performance.now() - start;
    const write = performance.now(); await p.session.flush(); return { catchupMs, saveMs: performance.now() - write, entities: p.delta.entities.size, serviceLegs: p.delta.header.simulation.services.reduce((n, r) => n + r.completedLegs, 0) };
  }); await cdp.send('HeapProfiler.collectGarbage'); await pause(100); const final = await page.evaluate(smallStats);
  assert.equal(final.entities, initial.entities); assert.equal(final.services, 64); assert(final.heapBytes < initial.heapBytes * 1.5 + 32 * 1048576, 'post-GC retained heap grew without settling');
  await page.reload(); await settled(page); assert.equal(await page.evaluate(() => __worldStreamingPreview.delta.entities.size), initial.entities);
  const exportPromise = page.waitForEvent('download'); await page.click('#world-export'); await (await exportPromise).saveAs(path.join(OUT, `${backend}-stress.heungshing`));
  assert.equal(errors.length, 0, errors.join('\n'));
  const report = { backend, browser: await browser.version(), renderer: initial.renderer, seconds: (Date.now() - started) / 1000, moves, installed, initial, steady, checkpoints, peakObjects, catchup, final,
    gpuPeakBytes: null, gpuNote: 'Actual GPU allocation is not exposed; heap and logical renderer counts are reported separately.', errors };
  fs.writeFileSync(path.join(OUT, `${backend}-pressure.json`), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ stage: 'pressure-complete', backend, moves, installed, catchup, heapBefore: initial.heapBytes, heapAfter: final.heapBytes })); await context.close(); return report;
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); const workload = makeWorldWorkload(); fs.writeFileSync(path.join(OUT, 'workload.json'), JSON.stringify(workload));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-world-phase5-')), desktop = createGameApp({ rootDir: ROOT, dbPath: path.join(temporary, 'city.sqlite'), aiNewsCredentialStore: createMemoryAiNewsCredentialStore() });
  const apps = [express(), express()]; for (const app of apps) app.get('/__test/world-workload.json', (_req, res) => res.json(workload));
  apps[0].use(express.static(path.join(ROOT, 'release/web'))); apps[1].use(desktop.app); const servers = apps.map(app => http.createServer(app)); let browser;
  try {
    for (const server of servers) await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-precise-memory-info'] }); const origins = servers.map(s => `http://127.0.0.1:${s.address().port}`);
    if (process.env.WORLD_PHASE5_MENU_ONLY !== '0') for (const [i, backend] of ['browser', 'desktop'].entries()) if (!process.env.WORLD_MENU_BACKEND || process.env.WORLD_MENU_BACKEND === backend) await menuScenario(browser, origins[i], backend);
    if (process.env.WORLD_PHASE5_MENU_ONLY === '1') return;
    await compareRender(browser, origins[0]); for (const [i, backend] of ['browser', 'desktop'].entries()) await pressure(browser, origins[i], backend, Number(process.env.WORLD_SOAK_SECONDS || 120));
    console.log(`PASS world release: ${OUT}`);
  } finally { await browser?.close(); await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve)))); desktop.store.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
