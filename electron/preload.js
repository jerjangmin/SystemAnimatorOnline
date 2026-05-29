const { ipcRenderer } = require('electron');

try {
  const electron = require('electron');
  if (!electron.remote) {
    electron.remote = require('@electron/remote');
  }
  if (electron.remote?.getCurrentWindow) {
    const getCurrentWindow = electron.remote.getCurrentWindow.bind(electron.remote);
    electron.remote.getCurrentWindow = () => {
      const currentWindow = getCurrentWindow();
      return new Proxy(currentWindow, {
        get(target, prop) {
          if ([
            'setIgnoreMouseEvents',
            'setFocusable',
            'setAlwaysOnTop',
            'setContentSize',
            'setSize',
            'setBounds',
            'setPosition',
            'center',
          ].includes(prop)) {
            return () => {};
          }
          const value = target[prop];
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
    if (window.top === window) {
      window.__xrAnimatorHostWindowShim = true;
    } else {
      window.__xrAnimatorLegacyWindowShim = true;
    }
  }
} catch (error) {
  console.warn('[preload] @electron/remote bridge failed:', error);
}

if (window.top === window) {
  window.xrAnimatorElectron = {
    getEnv: () => ipcRenderer.invoke('xr-animator:env'),
    getSettings: () => ipcRenderer.invoke('xr-animator:settings:get'),
    updateSettings: (patch) => ipcRenderer.invoke('xr-animator:settings:update', patch),
    selectVrmFile: () => ipcRenderer.invoke('xr-animator:dialog:select-vrm'),
    setAlwaysOnTop: (enabled) => ipcRenderer.invoke('xr-animator:window:set-always-on-top', Boolean(enabled)),
    setWindowSize: (payload) => ipcRenderer.invoke('xr-animator:window:set-size', payload || {}),
    centerWindow: () => ipcRenderer.invoke('xr-animator:window:center'),
    setIgnoreMouseEvents: (ignore) => ipcRenderer.invoke('xr-animator:window:set-ignore-mouse-events', Boolean(ignore)),
    onLegacyDrop: (callback) => {
      const listener = (_event, filePath) => callback(filePath);
      ipcRenderer.on('xr-animator:legacy-drop', listener);
      return () => ipcRenderer.removeListener('xr-animator:legacy-drop', listener);
    },
  };
}
