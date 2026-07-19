const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, safeStorage, shell } = require('electron');
const { scheduleUpdateChecks } = require('./electron-updates');

const emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...args) => {
  if (String(warning).includes('SQLite is an experimental feature')) return;
  emitWarning(warning, ...args);
};

const { startGameServer } = require('./server');

let mainWindow = null;
let gameServer = null;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

function createEncryptedAiNewsCredentialStore(filePath) {
  let sessionPayload = {
    apiKey: String(process.env.OLLAMA_API_KEY || '').trim(),
    config: null,
  };

  function normalizeConfig(value = {}) {
    return {
      enabled: value.enabled === true,
      provider: 'cloud',
      models: { local: '', cloud: String(value.models?.cloud || '').trim().slice(0, 120) },
    };
  }

  function readPayload() {
    if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(filePath)) return sessionPayload;
    try {
      const cleartext = safeStorage.decryptString(fs.readFileSync(filePath));
      try {
        const parsed = JSON.parse(cleartext);
        if (parsed && typeof parsed === 'object') {
          return {
            apiKey: String(parsed.apiKey || '').trim(),
            config: parsed.config && typeof parsed.config === 'object' ? normalizeConfig(parsed.config) : null,
          };
        }
      } catch {}
      return { apiKey: cleartext.trim(), config: null };
    } catch (error) {
      console.error('[AI News settings read]', error.message);
      return sessionPayload;
    }
  }

  function writePayload(payload) {
    sessionPayload = payload;
    if (!safeStorage.isEncryptionAvailable()) return;
    const encrypted = safeStorage.encryptString(JSON.stringify(payload));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, encrypted, { mode: 0o600 });
  }

  return {
    get persistent() {
      return safeStorage.isEncryptionAvailable();
    },
    get() {
      return sessionPayload.apiKey || readPayload().apiKey;
    },
    set(value) {
      const payload = readPayload();
      payload.apiKey = String(value || '').trim();
      writePayload(payload);
    },
    clear() {
      const payload = readPayload();
      payload.apiKey = '';
      writePayload(payload);
    },
    getConfig() { return normalizeConfig(readPayload().config || {}); },
    hasConfig() { return !!readPayload().config; },
    setConfig(value) {
      const payload = readPayload();
      payload.config = normalizeConfig(value);
      writePayload(payload);
    },
  };
}

async function stopGameServer() {
  if (!gameServer) return;

  const serverToClose = gameServer;
  gameServer = null;
  try {
    await serverToClose.close();
  } catch (err) {
    console.error('[electron close server]', err);
  }
}

async function createWindow() {
  await stopGameServer();

  const dbPath = path.join(app.getPath('userData'), 'citybuilder.sqlite');
  const aiNewsCredentialStore = createEncryptedAiNewsCredentialStore(
    path.join(app.getPath('userData'), 'ollama-api-key.bin'),
  );

  gameServer = await startGameServer({
    port: 0,
    host: '127.0.0.1',
    dbPath,
    rootDir: __dirname,
    aiNewsCredentialStore,
  });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0b1118',
    title: 'The City of Heung Shing',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopGameServer();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(gameServer.url);
  scheduleUpdateChecks(mainWindow);
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(createWindow).catch((err) => {
    console.error('[electron]', err);
    app.quit();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((err) => {
        console.error('[electron activate]', err);
        app.quit();
      });
    }
  });

  app.on('before-quit', () => {
    stopGameServer();
  });
}
