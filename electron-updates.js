const { app, dialog, shell } = require('electron');

const UPDATE_REPOSITORY = 'nortonyuen-oss/heung_shing_simulator';
const LATEST_RELEASE_API = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`;
const LATEST_RELEASE_URL = `https://github.com/${UPDATE_REPOSITORY}/releases/latest`;
const UPDATE_CHECK_DELAY_MS = 12000;

let didScheduleUpdateCheck = false;

function getVersionParts(version) {
  return String(version)
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(candidate, current) {
  const candidateParts = getVersionParts(candidate);
  const currentParts = getVersionParts(current);
  const length = Math.max(candidateParts.length, currentParts.length);

  for (let index = 0; index < length; index += 1) {
    const candidatePart = candidateParts[index] || 0;
    const currentPart = currentParts[index] || 0;

    if (candidatePart > currentPart) return true;
    if (candidatePart < currentPart) return false;
  }

  return false;
}

function shouldCheckForUpdates() {
  return app.isPackaged && process.env.ELECTRON_DISABLE_UPDATES !== '1';
}

function isWindowUsable(window) {
  return window && !window.isDestroyed();
}

async function promptForManualMacUpdate(mainWindow) {
  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub release check failed with ${response.status}`);
    }

    const release = await response.json();
    const latestVersion = release.tag_name || '';
    const currentVersion = app.getVersion();

    if (!isNewerVersion(latestVersion, currentVersion)) return;
    if (!isWindowUsable(mainWindow)) return;

    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['開啟下載頁', '稍後'],
      defaultId: 0,
      cancelId: 1,
      title: '有新版本可以下載',
      message: `香城模擬器 ${latestVersion} 已經可以下載。`,
      detail: 'macOS 版本暫時未有簽章，所以更新會先打開下載頁，讓你手動下載新版 DMG。',
    });

    if (result.response === 0) {
      await shell.openExternal(release.html_url || LATEST_RELEASE_URL);
    }
  } catch (err) {
    console.warn('[electron update mac prompt]', err);
  }
}

function setupWindowsAutoUpdater(mainWindow) {
  let autoUpdater;

  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    console.warn('[electron update load]', err);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    console.info('[electron update] checking');
  });

  autoUpdater.on('update-available', (info) => {
    console.info('[electron update] available', info?.version || '');
  });

  autoUpdater.on('update-not-available', (info) => {
    console.info('[electron update] not available', info?.version || '');
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Number(progress?.percent || 0).toFixed(1);
    console.info(`[electron update] downloading ${percent}%`);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    if (!isWindowUsable(mainWindow)) return;

    const version = info?.version ? ` ${info.version}` : '';
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['重開並更新', '稍後'],
      defaultId: 0,
      cancelId: 1,
      title: '更新已下載',
      message: `香城模擬器${version} 已經下載完成。`,
      detail: '你可以立即重開遊戲套用更新，或者稍後關閉遊戲時自動安裝。',
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  autoUpdater.on('error', (err) => {
    console.warn('[electron update]', err);
  });

  autoUpdater.checkForUpdates().catch((err) => {
    console.warn('[electron update check]', err);
  });
}

function scheduleUpdateChecks(mainWindow) {
  if (didScheduleUpdateCheck || !shouldCheckForUpdates()) return;

  didScheduleUpdateCheck = true;
  setTimeout(() => {
    if (!isWindowUsable(mainWindow)) return;

    if (process.platform === 'win32') {
      setupWindowsAutoUpdater(mainWindow);
      return;
    }

    if (process.platform === 'darwin') {
      promptForManualMacUpdate(mainWindow);
    }
  }, UPDATE_CHECK_DELAY_MS);
}

module.exports = {
  isNewerVersion,
  scheduleUpdateChecks,
};
