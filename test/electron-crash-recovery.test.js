const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// electron-main.js can't be required under plain `node --test`: outside an
// Electron process, require('electron') resolves to a path string rather
// than the { app, BrowserWindow, ... } API, so touching app.* at module
// scope throws immediately. These checks confirm the crash-recovery wiring
// exists and is shaped correctly by reading the source, the same way
// runtime-regressions.test.js and visual-route-calibrator.test.js verify
// code that isn't practical to execute directly in this suite.
const ROOT = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(ROOT, 'electron-main.js'), 'utf8');

test('dialog and IPC modules are imported for recovery and native window controls', () => {
  assert.match(mainSource, /const \{ app, BrowserWindow, dialog, ipcMain, safeStorage, shell \} = require\('electron'\);/);
});

test('fullscreen controls use an isolated preload bridge and native BrowserWindow state', () => {
  const preloadSource = fs.readFileSync(path.join(ROOT, 'electron-preload.js'), 'utf8');
  const topbarSource = fs.readFileSync(path.join(ROOT, 'topbar.js'), 'utf8');
  assert.match(mainSource, /preload: path\.join\(__dirname, 'electron-preload\.js'\)/);
  assert.match(mainSource, /ipcMain\.handle\(WINDOW_FULLSCREEN_GET_CHANNEL/);
  assert.match(mainSource, /targetWindow\.isFullScreen\(\)/);
  assert.match(mainSource, /targetWindow\.setFullScreen\(requestedState === true\)/);
  assert.match(mainSource, /mainWindow\.on\('enter-full-screen'/);
  assert.match(mainSource, /mainWindow\.on\('leave-full-screen'/);
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld\('heungShingDesktop'/);
  assert.match(preloadSource, /ipcRenderer\.invoke\(WINDOW_FULLSCREEN_SET_CHANNEL/);
  assert.match(topbarSource, /desktopWindow\.setFullscreen\(false\)/);
  assert.match(topbarSource, /desktopFullscreenState === true/);
});

test('renderer fullscreen controls send both enter and exit requests through the desktop bridge', async () => {
  const topbarSource = fs.readFileSync(path.join(ROOT, 'topbar.js'), 'utf8');
  const blockStart = topbarSource.indexOf('function getDesktopWindowApi()');
  const blockEnd = topbarSource.indexOf('// ── Speed button highlight', blockStart);
  const requestedStates = [];
  let stateListener = null;
  const context = vm.createContext({
    console,
    document: {
      addEventListener: () => {},
      documentElement: {},
      fullscreenElement: null,
      getElementById: () => null,
      webkitFullscreenElement: null,
    },
    window: {
      heungShingDesktop: {
        getFullscreen: () => Promise.resolve(false),
        onFullscreenChange: (listener) => { stateListener = listener; },
        setFullscreen: (state) => {
          requestedStates.push(state);
          return Promise.resolve(state);
        },
      },
    },
  });
  vm.runInContext(`let desktopFullscreenState = null;\n${topbarSource.slice(blockStart, blockEnd)}`, context);
  vm.runInContext('setupDesktopFullscreenState()', context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(vm.runInContext('isFullscreen()', context), false);

  vm.runInContext('enterFullscreen()', context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(vm.runInContext('isFullscreen()', context), true);
  stateListener(true);
  vm.runInContext('exitFullscreen()', context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(vm.runInContext('isFullscreen()', context), false);
  assert.deepEqual(requestedStates, [true, false]);
});

test('a dead renderer process gets offered a reload instead of staying frozen forever', () => {
  assert.match(mainSource, /webContents\.on\('render-process-gone', \(event, details\) => \{/);
  const section = mainSource.slice(mainSource.indexOf("webContents.on('render-process-gone'"));
  const handlerBody = section.slice(0, section.indexOf("mainWindow.webContents.on('unresponsive'"));
  // A deliberate process end ('clean-exit') must not trigger a recovery prompt.
  assert.match(handlerBody, /if \(details\.reason === 'clean-exit'\) return;/);
  assert.match(handlerBody, /offerRendererRecovery\('crashed'\)/);
});

test('a wedged (but not crashed) renderer gets a grace period before offering recovery', () => {
  assert.match(mainSource, /webContents\.on\('unresponsive', \(\) => \{/);
  assert.match(mainSource, /webContents\.on\('responsive', \(\) => \{/);
  assert.match(mainSource, /unresponsiveRecoveryTimer = setTimeout\(\(\) => \{[\s\S]*?offerRendererRecovery\('unresponsive'\)/);
  assert.match(mainSource, /const UNRESPONSIVE_RECOVERY_DELAY_MS = 8000;/);
  // 'responsive' firing before the grace period elapses must cancel the prompt.
  const responsiveHandler = mainSource.slice(
    mainSource.indexOf("webContents.on('responsive'"),
    mainSource.indexOf("await mainWindow.loadURL(getGameWindowUrl());\n  if (!performanceModeEnabled)"),
  );
  assert.match(responsiveHandler, /clearUnresponsiveRecoveryTimer\(\);/);
});

test('recovery reloads the existing window/server instead of tearing down and recreating them', () => {
  const start = mainSource.indexOf('async function offerRendererRecovery');
  const end = mainSource.indexOf('function createEncryptedAiNewsCredentialStore');
  const body = mainSource.slice(start, end);
  assert.match(body, /dialog\.showMessageBox\(mainWindow, \{/);
  assert.match(body, /response !== 0[\s\S]*?return;/);
  assert.match(body, /await mainWindow\.loadURL\(getGameWindowUrl\(\)\);/);
  assert.doesNotMatch(body, /new BrowserWindow/);
  assert.doesNotMatch(body, /startGameServer/);
});

test('explicit Electron performance mode adds the profiler query and suppresses updater noise', () => {
  const runnerSource = fs.readFileSync(path.join(ROOT, 'scripts', 'run-electron.js'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.match(mainSource, /process\.env\.ELECTRON_PERFORMANCE_MODE === '1'/);
  assert.match(mainSource, /url\.searchParams\.set\('performance', '1'\)/);
  assert.match(mainSource, /backgroundThrottling: !performanceModeEnabled/);
  assert.match(mainSource, /modelAssetRootDir: getGameModelAssetRootDir\(\)/);
  assert.match(mainSource, /\.data', 'package-assets'/);
  assert.match(mainSource, /if \(!performanceModeEnabled\) scheduleUpdateChecks\(mainWindow\);/);
  assert.match(runnerSource, /process\.argv\.includes\('--performance'\)/);
  assert.match(packageJson.scripts['electron:perf'], /prepare:release-assets/);
  assert.match(packageJson.scripts['electron:perf'], /run-electron\.js --performance/);
});

test('the recovery timer is cleared when the window closes so it cannot fire on a destroyed window', () => {
  const closedHandler = mainSource.slice(
    mainSource.indexOf("mainWindow.on('closed'"),
    mainSource.indexOf("mainWindow.webContents.setWindowOpenHandler"),
  );
  assert.match(closedHandler, /clearUnresponsiveRecoveryTimer\(\);/);
});
