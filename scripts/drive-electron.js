// Drive the Electron app over the Chrome DevTools Protocol for scripted checks and screenshots.
//
//   node scripts/drive-electron.js <steps.js> [--keep]
//
// steps.js exports `async ({ evaluate, screenshot, sleep, waitFor, consoleLines }) => {}`:
//   evaluate(expr)      runs `expr` in the renderer and returns its (awaited) value
//   screenshot(file)    saves a PNG of the window (Page.captureScreenshot; hangs when unfocused)
//   snapshot(file)      saves a PNG of the game canvas via Phaser's renderer.snapshot, fetched in
//                       1 MB slices because a DevTools message over ~4 MB drops the socket
//   waitFor(expr, ms)   polls `expr` until truthy
//   bringToFront()      raises the window again (Phaser pauses its loop while it is occluded)
//   cdp(method, params) sends any raw DevTools Protocol command (e.g. Browser.setWindowBounds)
//   consoleLines        renderer console output collected so far
// The app is closed when the steps finish unless --keep is given. Launch from a normal login
// session: a Safe Mode boot or a GPU-less sandbox renders through SwiftShader at 1–2 fps, which
// says nothing about real performance (check `activeScene.game.renderer.gl` reports ANGLE Metal).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.DRIVE_PORT || 9223);
const stepsFile = process.argv[2];
if (!stepsFile) {
  console.error('usage: node scripts/drive-electron.js <steps.js> [--keep]');
  process.exit(2);
}
const keep = process.argv.includes('--keep');
const steps = require(path.resolve(stepsFile));
const electronPath = require('electron');
// DRIVE_USER_DATA=<dir> runs against a separate profile (its own saves database and single-
// instance lock), so a check can run while the real game is open.
const userDataArgs = process.env.DRIVE_USER_DATA ? [`--user-data-dir=${path.resolve(process.env.DRIVE_USER_DATA)}`] : [];
const child = spawn(electronPath, ['.', `--remote-debugging-port=${PORT}`, ...userDataArgs], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  // No background throttling, so the renderer keeps stepping (and answering the protocol) while
  // another window covers it during a long check.
  env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, ELECTRON_DISABLE_UPDATES: '1', ELECTRON_NO_BACKGROUND_THROTTLING: '1' },
});
const logs = [];
child.stdout.on('data', (d) => logs.push(String(d)));
child.stderr.on('data', (d) => logs.push(String(d)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let targets = [];
  for (let i = 0; i < 80 && !targets.length; i++) {
    await sleep(500);
    try {
      targets = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).filter((t) => t.type === 'page');
    } catch {}
  }
  if (!targets.length) {
    console.error('no page target — is another instance already running (single-instance lock)?');
    console.error(logs.join(''));
    child.kill();
    process.exit(1);
  }
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const consoleLines = [];
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  ws.onclose = (e) => {
    pending.forEach((p) => p.rej(new Error(`DevTools socket closed (${e.code}) - a reply over ~4 MB does this; fetch big values in slices`)));
    pending.clear();
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.rej(m.error) : p.res(m.result);
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      consoleLines.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleLines.push(`EXCEPTION: ${m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text}`);
    }
  };
  await new Promise((r) => { ws.onopen = r; });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.bringToFront').catch(() => {});
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  const screenshot = async (file) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  };
  const snapshot = async (file) => {
    const length = await evaluate(`new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('renderer.snapshot produced no frame in 8s')), 8000);
      activeScene.game.renderer.snapshot((img) => {
        clearTimeout(t);
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        window.__driveSnapshot = c.toDataURL('image/png').split(',')[1];
        res(window.__driveSnapshot.length);
      });
    })`);
    const SLICE = 1000000;
    let base64 = '';
    for (let offset = 0; offset < length; offset += SLICE) {
      base64 += await evaluate(`window.__driveSnapshot.slice(${offset}, ${offset + SLICE})`);
    }
    await evaluate('delete window.__driveSnapshot; true');
    fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  };
  const waitFor = async (expression, timeoutMs = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await evaluate(expression)) return true;
      await sleep(250);
    }
    throw new Error(`timeout waiting for ${expression}`);
  };
  // Page.bringToFront can hang when the app is not the active application, so never wait on it
  // for more than a moment.
  const bringToFront = () => Promise.race([send('Page.bringToFront').catch(() => {}), sleep(1500)]);
  try {
    await steps({ evaluate, screenshot, snapshot, sleep, waitFor, consoleLines, bringToFront, cdp: send });
  } catch (e) {
    console.error('STEP FAILED:', e.message);
    process.exitCode = 1;
  }
  ws.close();
  if (!keep) child.kill();
  await sleep(300);
  process.exit();
})();
