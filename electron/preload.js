const { ipcRenderer } = require('electron');

try {
  // Legacy System Animator expects `require('electron').remote` or
  // `require('node_modules.asar/@electron/remote')` from the renderer.
  const electron = require('electron');
  if (!electron.remote) {
    electron.remote = require('@electron/remote');
  }
} catch (error) {
  console.warn('[preload] @electron/remote bridge failed:', error);
}

window.somilandVTuber = {
  getSettings: () => ipcRenderer.invoke('somiland:settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('somiland:settings:update', patch),
  selectVrm: () => ipcRenderer.invoke('somiland:dialog:select-vrm'),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.invoke('somiland:window:set-ignore-mouse-events', Boolean(ignore)),
};
