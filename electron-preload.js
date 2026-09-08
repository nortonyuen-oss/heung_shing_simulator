const { contextBridge, ipcRenderer } = require('electron');

const WINDOW_FULLSCREEN_GET_CHANNEL = 'window-fullscreen:get';
const WINDOW_FULLSCREEN_SET_CHANNEL = 'window-fullscreen:set';
const WINDOW_FULLSCREEN_CHANGED_CHANNEL = 'window-fullscreen:changed';

contextBridge.exposeInMainWorld('heungShingDesktop', {
  getFullscreen: () => ipcRenderer.invoke(WINDOW_FULLSCREEN_GET_CHANNEL),
  setFullscreen: (isFullscreen) => ipcRenderer.invoke(WINDOW_FULLSCREEN_SET_CHANNEL, isFullscreen === true),
  onFullscreenChange: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on(WINDOW_FULLSCREEN_CHANGED_CHANNEL, (_event, isFullscreen) => {
      callback(isFullscreen === true);
    });
  },
});
