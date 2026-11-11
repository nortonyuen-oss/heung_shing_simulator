#!/usr/bin/env node
// Touch smoke test for the touch UI profile (docs/mobile-ui-work-plan.md, Phase A).
//
// Launches the real Electron game with an isolated profile (your saves are not touched), starts a
// new city, switches to the touch profile, and drives genuine touch events through the Chromium
// DevTools protocol. It checks, against the real Phaser camera:
//   - one-finger pan follows the finger; two-finger pinch keeps the world point under the fingers
//     (<= 2 CSS px) and stays inside the 0.4-3 zoom range;
//   - pan / pinch / tap / pointercancel / panel touches never change money, roads or buildings,
//     even with a build tool selected (M01, M03, M05);
//   - the desktop profile and mouse building are unchanged (M17).
// It also prints how far the existing wheel zoom drifts from its anchor (informational).
//
// Run:  ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/smoke-touch.js
//       (or any Node >= 22: node scripts/smoke-touch.js)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

(async () => {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-touch-smoke-'));
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: ['.', `--user-data-dir=${profileDir}`],
    cwd: ROOT,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, ELECTRON_DISABLE_UPDATES: '1' },
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setFullScreen(false);
      win.setMinimumSize(100, 100);
      win.setContentSize(1280, 800);
    });
    await page.waitForSelector('#btn-new-game', { state: 'visible', timeout: 120000 });
    await page.waitForFunction(() => typeof gameReady !== 'undefined' && gameReady === true, null, { timeout: 240000 });
    await page.click('#btn-new-game');
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.getElementById('btn-start-city').click());
    await page.waitForFunction(() => getComputedStyle(document.getElementById('landing-screen')).display === 'none', null, { timeout: 120000 });
    await page.waitForTimeout(4000);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })),
    });
    const frame = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const snapshot = () => page.evaluate(() => {
      const cam = activeScene.cameras.main;
      return {
        zoom: cam.zoom, scrollX: cam.scrollX, scrollY: cam.scrollY,
        budget: city.budget, roads: roadTileCount, buildings: Object.keys(buildingData).length,
        painting: isPainting, profile: getUiProfile(),
      };
    });
    const worldAt = (x, y) => page.evaluate(([px, py]) => {
      const p = activeScene.cameras.main.getWorldPoint(px, py);
      return { x: p.x, y: p.y, zoom: activeScene.cameras.main.zoom };
    }, [x, y]);
    const cityState = (s) => JSON.stringify({ budget: s.budget, roads: s.roads, buildings: s.buildings });

    // ── touch profile on, a build tool selected ───────────────────────────────
    await page.evaluate(() => { setUiProfilePreference('touch'); selectedTool = 'road'; });
    await frame();
    const meta = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.content || '');
    check('touch profile adds a device-width viewport meta', /width=device-width/.test(meta), meta);
    const taps = [];
    await page.exposeFunction('__recordTap', (detail) => taps.push(detail));
    await page.evaluate(() => document.addEventListener('heungshing:maptap', (e) => window.__recordTap(e.detail)));

    const before = await snapshot();
    check('profile is touch and no stroke is in progress', before.profile === 'touch' && before.painting === false);

    // one-finger pan: the map follows the finger
    await touch('touchStart', [[700, 400, 1]]);
    for (let i = 1; i <= 10; i += 1) { await touch('touchMove', [[700 + i * 10, 400 + i * 3, 1]]); await wait(16); }
    await touch('touchEnd', []);
    await frame();
    const panned = await snapshot();
    const expectDx = -100 / before.zoom;
    const expectDy = -30 / before.zoom;
    check('one-finger pan moves the map by the finger distance',
      Math.abs((panned.scrollX - before.scrollX) - expectDx) < 1 && Math.abs((panned.scrollY - before.scrollY) - expectDy) < 1,
      `scroll d=(${(panned.scrollX - before.scrollX).toFixed(1)}, ${(panned.scrollY - before.scrollY).toFixed(1)}) want (${expectDx.toFixed(1)}, ${expectDy.toFixed(1)})`);
    check('pan with the road tool selected changes no money, road or building',
      cityState(before) === cityState(panned) && panned.painting === false, cityState(panned));

    // two-finger pinch out: anchor stays under the fingers
    const cx = 760;
    const cy = 420;
    const wBefore = await worldAt(cx, cy);
    const z0 = (await snapshot()).zoom;
    await touch('touchStart', [[cx - 50, cy, 1]]);
    await touch('touchStart', [[cx - 50, cy, 1], [cx + 50, cy, 2]]);
    let worstAnchorPx = 0;
    for (let i = 1; i <= 12; i += 1) {
      const half = 50 + i * 8;
      await touch('touchMove', [[cx - half, cy, 1], [cx + half, cy, 2]]);
      await wait(24);
      if (i % 4 === 0) {
        await frame();
        const w = await worldAt(cx, cy);
        worstAnchorPx = Math.max(worstAnchorPx, Math.hypot(w.x - wBefore.x, w.y - wBefore.y) * w.zoom);
      }
    }
    await touch('touchEnd', [[cx - 146, cy, 1]]);
    await touch('touchEnd', []);
    await frame();
    const pinched = await snapshot();
    const wAfter = await worldAt(cx, cy);
    const anchorPx = Math.hypot(wAfter.x - wBefore.x, wAfter.y - wBefore.y) * wAfter.zoom;
    const expectedScale = (2 * 146) / 100; // fingers end 292px apart, started 100px apart
    check('pinch out zooms in by the finger spread ratio',
      Math.abs(pinched.zoom / z0 - expectedScale) / expectedScale < 0.03, `zoom ${z0.toFixed(2)} -> ${pinched.zoom.toFixed(2)}, want x${expectedScale.toFixed(2)}`);
    check('pinch keeps the world point under the fingers within 2px', Math.max(anchorPx, worstAnchorPx) <= 2, `final ${anchorPx.toFixed(2)}px, worst during ${worstAnchorPx.toFixed(2)}px`);
    check('pinch changed no money, road or building', cityState(pinched) === cityState(before));

    // zoom limits
    for (const [from, to, label] of [[40, 400, 'in'], [400, 3, 'out']]) {
      await touch('touchStart', [[cx - from, cy, 1]]);
      await touch('touchStart', [[cx - from, cy, 1], [cx + from, cy, 2]]);
      for (let i = 1; i <= 20; i += 1) {
        const half = from + ((to - from) * i) / 20;
        await touch('touchMove', [[cx - half, cy, 1], [cx + half, cy, 2]]);
        await wait(16);
      }
      await touch('touchEnd', [[cx - to, cy, 1]]);
      await touch('touchEnd', []);
      await frame();
      const z = (await snapshot()).zoom;
      check(`pinch ${label} stops inside 0.4-3`, z >= 0.4 - 1e-6 && z <= 3 + 1e-6, `zoom ${z.toFixed(3)}`);
    }

    // a pinch that drops to one finger leaves the survivor inert (M02)
    const beforeSettle = await snapshot();
    await touch('touchStart', [[600, 400, 1]]);
    await touch('touchStart', [[600, 400, 1], [700, 400, 2]]);
    await touch('touchEnd', [[600, 400, 1]]);
    for (let i = 1; i <= 6; i += 1) { await touch('touchMove', [[600 + i * 15, 400 + i * 10, 1]]); await wait(16); }
    await touch('touchEnd', []);
    await frame();
    const settled = await snapshot();
    check('the finger left after a pinch does not pan or tap', Math.abs(settled.scrollX - beforeSettle.scrollX) < 0.5 && Math.abs(settled.scrollY - beforeSettle.scrollY) < 0.5 && taps.length === 0);

    // tap: an event, never a build (M06 groundwork)
    await touch('touchStart', [[820, 480, 1]]);
    await wait(40);
    await touch('touchEnd', []);
    await frame();
    const tapped = await snapshot();
    check('a tap is announced but builds nothing', taps.length === 1 && cityState(tapped) === cityState(before), `taps ${taps.length}, ${cityState(tapped)}`);

    // switching profiles over and over must not stack listeners: one tap stays one event (M12)
    for (let i = 0; i < 10; i += 1) await page.evaluate(() => { setUiProfilePreference('desktop'); setUiProfilePreference('touch'); });
    taps.length = 0;
    await touch('touchStart', [[820, 480, 1]]);
    await wait(40);
    await touch('touchEnd', []);
    await frame();
    check('after 10 profile switches a tap is still exactly one event', taps.length === 1, `taps ${taps.length}`);

    // pointercancel / rotation / blur drop the gesture without a commit (M03)
    const beforeCancel = await snapshot();
    await touch('touchStart', [[700, 450, 1]]);
    for (let i = 1; i <= 4; i += 1) { await touch('touchMove', [[700 + i * 12, 450, 1]]); await wait(16); }
    await touch('touchCancel', []);
    await frame();
    const cancelled = await snapshot();
    check('touchcancel mid-drag changes no city data and leaves no stroke', cityState(cancelled) === cityState(beforeCancel) && cancelled.painting === false);
    await touch('touchStart', [[700, 450, 1]]);
    for (let i = 1; i <= 5; i += 1) { await touch('touchMove', [[700 - i * 10, 450, 1]]); await wait(16); }
    await touch('touchEnd', []);
    await frame();
    const afterCancel = await snapshot();
    check('panning works again straight after a cancel', Math.abs(afterCancel.scrollX - cancelled.scrollX) > 5);

    // a drag that starts on a panel does not move the map (M05)
    const panelRect = await page.evaluate(() => { const r = document.querySelector('#tool-menu')?.getBoundingClientRect(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; });
    if (panelRect) {
      const beforePanel = await snapshot();
      await touch('touchStart', [[panelRect[0], panelRect[1], 1]]);
      for (let i = 1; i <= 6; i += 1) { await touch('touchMove', [[panelRect[0] + i * 20, panelRect[1] + i * 5, 1]]); await wait(16); }
      await touch('touchEnd', []);
      await frame();
      const afterPanel = await snapshot();
      check('a touch that starts on a panel does not pan the map', Math.abs(afterPanel.scrollX - beforePanel.scrollX) < 0.5 && Math.abs(afterPanel.scrollY - beforePanel.scrollY) < 0.5);
    }

    // ── desktop profile: mouse building is unchanged (M17) ────────────────────
    // (the gestures above left the camera zoomed out; put it back where the city starts)
    await page.evaluate((start) => {
      const cam = activeScene.cameras.main;
      cam.setZoom(start.zoom);
      cam.scrollX = start.scrollX;
      cam.scrollY = start.scrollY;
      onMapViewChanged(activeScene);
      setUiProfilePreference('desktop');
      selectedTool = 'road';
    }, before);
    await frame();
    await wait(300);
    check('desktop profile removes the viewport meta', await page.evaluate(() => !document.querySelector('meta[name="viewport"]')));
    // A run of five flat ground tiles, found in the city data; the camera is centred on it and its
    // ends are projected to screen pixels, so the drag does not depend on the random terrain.
    const findLandRun = (skipRow) => page.evaluate((skip) => {
      const cam = activeScene.cameras.main;
      const ox = cam.width * 0.5;
      const oy = cam.height * 0.5;
      const centre = (r, c) => getTileFaceGeometry(r, c, activeScene.offsetX, activeScene.offsetY).center;
      const view = { x: cam.scrollX + ox + (640 - ox) / cam.zoom, y: cam.scrollY + oy + (440 - oy) / cam.zoom };
      let best = null;
      for (let r = 0; r < mapData.length; r += 1) {
        if (r === skip) continue;
        for (let c = 0; c + 4 < mapData[r].length; c += 1) {
          let flat = true;
          for (let k = 0; k <= 4 && flat; k += 1) flat = mapData[r][c + k] === GROUND && getTileHeight(r, c + k) === 0;
          if (!flat) continue;
          const a = centre(r, c);
          const b = centre(r, c + 4);
          const score = Math.hypot((a.x + b.x) / 2 - view.x, (a.y + b.y) / 2 - view.y);
          if (!best || score < best.score) best = { score, row: r, c, a, b };
        }
      }
      if (!best) return null;
      // zoom 1, run centred at screen (640, 440)
      cam.setZoom(1);
      const mid = { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 };
      cam.scrollX = mid.x - ox - (640 - ox);
      cam.scrollY = mid.y - oy - (440 - oy);
      onMapViewChanged(activeScene);
      const project = (p) => [(p.x - cam.scrollX - ox) + ox, (p.y - cam.scrollY - oy) + oy];
      return { row: best.row, from: project(best.a), to: project(best.b) };
    }, skipRow);
    const run = await findLandRun(-1);
    check('found flat ground on screen for the mouse test', !!run, run ? `row ${run.row}` : '');
    const beforeMouse = await snapshot();
    await page.mouse.move(run.from[0], run.from[1]);
    await page.mouse.down();
    await page.mouse.move(run.to[0], run.to[1], { steps: 8 });
    await page.mouse.up();
    await frame();
    const afterMouse = await snapshot();
    check('desktop: a mouse drag still lays road and spends money', afterMouse.roads > beforeMouse.roads && afterMouse.budget < beforeMouse.budget, `roads ${beforeMouse.roads}->${afterMouse.roads}, budget ${beforeMouse.budget}->${afterMouse.budget}`);

    // pointercancel abandons a stroke without committing it
    const cancelRun = await findLandRun(run.row);
    await page.mouse.move(cancelRun.from[0], cancelRun.from[1]);
    await page.mouse.down();
    await page.mouse.move(cancelRun.to[0], cancelRun.to[1], { steps: 6 });
    // Phaser handles its own pointer events one frame late; let it see the stroke before it is cancelled
    await frame();
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' })));
    await page.mouse.up();
    await frame();
    const afterCancelStroke = await snapshot();
    check('a pointercancel mid-stroke commits nothing and clears the stroke',
      afterCancelStroke.roads === afterMouse.roads && afterCancelStroke.budget === afterMouse.budget && afterCancelStroke.painting === false,
      `roads ${afterMouse.roads}->${afterCancelStroke.roads}, budget ${afterMouse.budget}->${afterCancelStroke.budget}, painting ${afterCancelStroke.painting}`);

    // informational: how far does the existing wheel zoom drift from its anchor?
    await page.evaluate(() => { selectedTool = 'inspect'; });
    const ax = 300;
    const ay = 300;
    const wheelBefore = await worldAt(ax, ay);
    await page.mouse.move(ax, ay);
    await page.mouse.wheel(0, -120);
    await frame();
    await wait(100);
    const wheelAfter = await worldAt(ax, ay);
    const drift = Math.hypot(wheelAfter.x - wheelBefore.x, wheelAfter.y - wheelBefore.y) * wheelAfter.zoom;
    console.log(`INFO  existing wheel zoom anchor drift: ${drift.toFixed(1)}px (zoom ${wheelBefore.zoom.toFixed(2)} -> ${wheelAfter.zoom.toFixed(2)}, anchor ${ax},${ay})`);
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  assert.equal(failed.length, 0, `failed: ${failed.map((f) => f.name).join('; ')}`);
})().catch((error) => { console.error(error); process.exit(1); });
