const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('somilandControl', {
  getSettings: () => ipcRenderer.invoke('somiland:settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('somiland:settings:update', patch),
  getStatus: () => ipcRenderer.invoke('somiland:status:get'),
  command: (command, payload) => ipcRenderer.invoke('somiland:command', command, payload || {}),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('somiland:status', listener);
    return () => ipcRenderer.removeListener('somiland:status', listener);
  },
});
