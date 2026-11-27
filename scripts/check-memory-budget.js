#!/usr/bin/env node
// Release check: the game's own memory on a phone stays within budget (memory-budget.js
// MEMORY_BUDGET_MB.check - Norton 2026-11-28: 運作時耗用的資源全部壓到500MB以下).
//
//   npm run build:web && npm run test:memory
//
// Plays the built browser game (release/web) in a phone-sized Chrome: the 太子 showcase city - the
// biggest bundled one - with a 懸索橋 over its longest stretch of sea and a 天橋, at speed through
// several days and nights, the camera moving about the city as a player's does. Samples what the
// game holds: its textures (the texture manager's sizes, four bytes a pixel and the mip chains) and
// its JavaScript heap after a garbage collection. Fails when a peak passes the budget.
//
// The browser's own share (its processes, the compositor) is not the game's to budget and is not
// measured: it cannot be read on a phone either.
//
// Options (environment): MEMORY_TEST_URL (default: serve release/web here), MEMORY_TEST_DAYS (4),
// MEMORY_TEST_REPORT (.data/memory-check/report.json), MEMORY_TEST_GPU_TEXTURES (on; off: the WebP
// fallback of a phone without ASTC).
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright-core');
const { MEMORY_BUDGET_MB } = require('../memory-budget.js');

const ROOT = path.resolve(__dirname, '..');
const DAYS = Number(process.env.MEMORY_TEST_DAYS || 4);
const REPORT = path.resolve(ROOT, process.env.MEMORY_TEST_REPORT || '.data/memory-check/report.json');

const freePort = () => new Promise((resolve) => {
  const server = net.createServer().listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
});

// In the page: what the game holds now, by kind.
function probeInPage() {
  const s = activeScene;
  const zoneKeys = new Set(typeof getAllZoneModels === 'function' ? getAllZoneModels().map((m) => m.key) : []);
  const groups = {};
  let total = 0;
  const seen = new Set();
  const gpu = { count: 0 };
  Object.entries(s.textures.list).forEach(([key, texture]) => {
    if (['__DEFAULT', '__MISSING', '__WHITE', '__NORMAL'].includes(key)) return;
    (texture.source || []).forEach((source) => {
      if (seen.has(source)) return;
      seen.add(source);
      // (the picture held, not the size it is drawn at)
      const w = source.image?.width || source.width || 0, h = source.image?.height || source.height || 0;
      const pot = (v) => v > 0 && (v & (v - 1)) === 0;
      // (a GPU-compressed picture: its blocks - gpu-texture-compression.js)
      const bytes = source.compressionAlgorithm ? Number(source.hsGpuBytes) || 0 : w * h * 4 * (pot(w) && pot(h) ? 4 / 3 : 1);
      if (source.compressionAlgorithm) gpu.count += 1;
      const group = key.startsWith('bl_night__') ? 'buildingNight' : zoneKeys.has(key) ? 'zoneBuildings'
        : key.startsWith('hb_') ? 'bridges' : key.startsWith('roads_') ? 'roads' : key.startsWith('festival') ? 'festivals'
          : key.startsWith('traffic_') ? 'vehicles' : 'other';
      groups[group] = (groups[group] || 0) + bytes / 1048576;
      total += bytes;
    });
  });
  Object.keys(groups).forEach((k) => { groups[k] = Math.round(groups[k]); });
  return {
    textures: Math.round(total / 1048576), groups, gpuTextures: gpu.count,
    hour: Math.floor((city.timeOfDayMinutes || 0) / 60), day: city.day, sprites: s.children.list.length,
  };
}

async function main() {
  let server = null;
  let url = process.env.MEMORY_TEST_URL;
  if (!url) {
    const web = path.join(ROOT, 'release', 'web');
    if (!fs.existsSync(path.join(web, 'index.html'))) throw new Error('No release/web: run npm run build:web first (or set MEMORY_TEST_URL)');
    const port = await freePort();
    server = spawn(process.execPath, [path.join(__dirname, 'static-web-server.js')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
    url = `http://127.0.0.1:${port}/`;
    await new Promise((r) => setTimeout(r, 800));
  }
  // A phone's GPU has ASTC, so by default the game loads its building art GPU-compressed
  // (gpu-texture-compression.js) and the browser draws with SwiftShader, which has ASTC as a phone
  // does (a Mac's GPU in Chrome does not). MEMORY_TEST_GPU_TEXTURES=off measures the WebP fallback
  // a phone without ASTC gets.
  const gpuTextures = process.env.MEMORY_TEST_GPU_TEXTURES !== 'off';
  if (!gpuTextures) url += `${url.includes('?') ? '&' : '?'}gpuTextures=off`;
  const browser = await chromium.launch({ headless: true, ...(process.env.CI ? {} : { channel: 'chrome' }),
    args: ['--js-flags=--expose-gc', ...(gpuTextures ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])] });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const cdp = await context.newCDPSession(page);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('typeof gameReady !== "undefined" && gameReady', null, { timeout: 240000 });
    const setup = await page.evaluate(async () => {
      if (typeof leaveAttractMode === 'function') { try { leaveAttractMode('player'); } catch {} }
      const file = await (await fetch(ATTRACT_CITY_URL)).json();
      const save = decodeSaveDataForLoad(file.save_data);
      const s = activeScene;
      await ensureSaveBuildingTextures(s, save);
      await ensureSaveNightTextures(s, save);
      beginNewCitySaveSession(null);
      applySaveData(s, save);
      if (typeof hideLandingScreen === 'function') hideLandingScreen();
      city.budget = 1e8;
      // a 懸索橋 over the longest stretch of sea a straight drag finds
      const land = (r, c) => isInsideMap(r, c) && mapData[r][c] !== WATER && !buildingData[getTileId(r, c)];
      let best = null;
      for (const axis of ['row', 'col']) for (let a = 8; a < MAP_HEIGHT - 8; a++) for (let b = 4; b < MAP_WIDTH - 60; b++) {
        const at = (k) => (axis === 'row' ? { row: a, col: b + k } : { row: b + k, col: a });
        let ok = true;
        for (let k = 0; k < 4 && ok; k++) if (!land(at(k).row, at(k).col)) ok = false;
        if (!ok || mapData[at(4).row]?.[at(4).col] !== WATER) continue;
        let w = 0;
        while (mapData[at(4 + w).row]?.[at(4 + w).col] === WATER && w < 40) w++;
        if (w < 10 || (best && w <= best.w)) continue;
        const plan = planHighBridge(s, getStraightDragPath(at(0), at(w + 7)), 'suspension');
        if (plan.ok) best = { start: at(0), end: at(w + 7), w };
      }
      if (best) commitRoadDrag(s, best.start, best.end, 'suspension');
      const high = [...(s.bridgeSprites?.values() || [])].filter((e) => e && e.high).length;
      setGameSpeed(GAME_SPEEDS.FAST);
      if (typeof simPaused !== 'undefined') simPaused = false;
      return { buildings: Object.keys(buildingData).length, bridgeTiles: high, sea: best?.w || 0 };
    });
    console.log(`city: ${setup.buildings} buildings; 懸索橋 ${setup.bridgeTiles} tiles over ${setup.sea} tiles of sea`);
    const samples = [];
    const peaks = { textures: 0, heap: 0, total: 0 };
    let peakAt = null;
    const startDay = await page.evaluate(() => city.day + city.month * 31);
    let k = 0;
    // run until DAYS game days have gone by (and two minutes at least, five at most)
    const t0 = Date.now();
    for (;;) {
      await cdp.send('HeapProfiler.collectGarbage');
      const heap = Math.round((await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576);
      const p = await page.evaluate(probeInPage);
      const sample = { t: Math.round((Date.now() - t0) / 1000), heap, ...p, total: heap + p.textures };
      samples.push(sample);
      if (sample.textures > peaks.textures) peaks.textures = sample.textures;
      if (sample.heap > peaks.heap) peaks.heap = sample.heap;
      if (sample.total > peaks.total) { peaks.total = sample.total; peakAt = sample; }
      console.log(`  ${String(sample.t).padStart(3)}s ${String(sample.hour).padStart(2)}:00  textures ${sample.textures} MB  heap ${heap} MB  ${JSON.stringify(p.groups)}${p.gpuTextures ? `  (${p.gpuTextures} compressed)` : ''}`);
      const days = (await page.evaluate(() => city.day + city.month * 31)) - startDay;
      const elapsed = Date.now() - t0;
      if ((days >= DAYS && elapsed > 120000) || elapsed > 300000) break;
      // the camera to another part of the city, at another zoom
      await page.evaluate((k) => {
        const ids = Object.keys(buildingData);
        if (!ids.length) return;
        const [r, c] = ids[(k * 97) % ids.length].split(':').map(Number);
        centerCameraOnTile(activeScene, r, c);
        activeScene.cameras.main.setZoom([1, 0.6, 1.5, 0.8][k % 4]);
      }, k++);
      await page.waitForTimeout(10000);
    }
    const budget = MEMORY_BUDGET_MB.check;
    const over = ['textures', 'heap', 'total'].filter((kind) => peaks[kind] > budget[kind]);
    const report = { url, setup, budget, peaks, peakAt, samples, errors, ok: over.length === 0 && errors.length === 0 };
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
    console.log(`peaks: textures ${peaks.textures}/${budget.textures} MB, heap ${peaks.heap}/${budget.heap} MB, total ${peaks.total}/${budget.total} MB`);
    if (peakAt) console.log(`at the peak (${peakAt.hour}:00): ${JSON.stringify(peakAt.groups)}`);
    if (errors.length) console.log(`page errors: ${errors.slice(0, 5).join(' | ')}`);
    console.log(report.ok ? 'PASS memory budget' : `FAIL memory budget: ${over.join(', ') || 'page errors'} (report: ${path.relative(ROOT, REPORT)})`);
    process.exitCode = report.ok ? 0 : 1;
  } finally {
    await browser.close();
    server?.kill();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
