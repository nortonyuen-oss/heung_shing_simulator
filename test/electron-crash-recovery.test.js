const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// electron-main.js can't be required under plain `node --test`: outside an
// Electron process, require('electron') resolves to a path string rather
// than the { app, BrowserWindow, ... } API, so touching app.* at module
// scope throws immediately. These checks confirm the crash-recovery wiring
// exists and is shaped correctly by reading the source, the same way
// runtime-regressions.test.js and visual-route-calibrator.test.js verify
// code that isn't practical to execute directly in this suite.
const ROOT = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(ROOT, 'electron-main.js'), 'utf8');

test('dialog module is imported for crash/unresponsive recovery prompts', () => {
  assert.match(mainSource, /const \{ app, BrowserWindow, dialog, safeStorage, shell \} = require\('electron'\);/);
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
    mainSource.indexOf("await mainWindow.loadURL(gameServer.url);\n  scheduleUpdateChecks"),
  );
  assert.match(responsiveHandler, /clearUnresponsiveRecoveryTimer\(\);/);
});

test('recovery reloads the existing window/server instead of tearing down and recreating them', () => {
  const start = mainSource.indexOf('async function offerRendererRecovery');
  const end = mainSource.indexOf('function createEncryptedAiNewsCredentialStore');
  const body = mainSource.slice(start, end);
  assert.match(body, /dialog\.showMessageBox\(mainWindow, \{/);
  assert.match(body, /response !== 0[\s\S]*?return;/);
  assert.match(body, /await mainWindow\.loadURL\(gameServer\.url\);/);
  assert.doesNotMatch(body, /new BrowserWindow/);
  assert.doesNotMatch(body, /startGameServer/);
});

test('the recovery timer is cleared when the window closes so it cannot fire on a destroyed window', () => {
  const closedHandler = mainSource.slice(
    mainSource.indexOf("mainWindow.on('closed'"),
    mainSource.indexOf("mainWindow.webContents.setWindowOpenHandler"),
  );
  assert.match(closedHandler, /clearUnresponsiveRecoveryTimer\(\);/);
});
