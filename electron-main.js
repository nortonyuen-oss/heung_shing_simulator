const path = require('path');
const { app, BrowserWindow, shell } = require('electron');
const { scheduleUpdateChecks } = require('./electron-updates');

const emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...args) => {
  if (String(warning).includes('SQLite is an experimental feature')) return;
  emitWarning(warning, ...args);
};

const { startGameServer } = require('./server');

let mainWindow = null;
let gameServer = null;

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

  gameServer = await startGameServer({
    port: 0,
    host: '127.0.0.1',
    dbPath,
    rootDir: __dirname,
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
