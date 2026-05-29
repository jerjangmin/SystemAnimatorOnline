const path = require('path');
const fs = require('fs');
const { fileURLToPath } = require('url');
const { app, BrowserWindow, dialog, ipcMain, nativeImage } = require('electron');
const remoteMain = require('@electron/remote/main');
const { createSettingsStore } = require('./settings-store');

remoteMain.initialize();

const APP_ROOT = path.resolve(__dirname, '..');
const APP_PRELOAD = path.join(__dirname, 'preload.js');
const settingsStore = createSettingsStore(app);
const isTestMode = process.env.SOMILAND_TEST_MODE === '1' || process.argv.includes('--test-mode');

let appWindow = null;

function isAllowedNavigation(targetUrl) {
  if (!targetUrl || targetUrl === 'about:blank') return true;
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'file:') return false;
  try {
    const filePath = path.resolve(fileURLToPath(parsed));
    return filePath === APP_ROOT || filePath.startsWith(`${APP_ROOT}${path.sep}`);
  } catch {
    return false;
  }
}

function toLocalPath(value) {
  return decodeURIComponent(
    String(value)
      .replace(/^file:\/+/i, process.platform === 'win32' ? '' : '/')
      .replace(/^(\w)[|:]/i, '$1:')
      .replace(/[\\/]/g, path.sep)
      .replace(/\?.+$/, '')
  );
}

function installLegacyGlobals() {
  global.is_transparent = true;
  global.is_natural_opaque = false;
  global.WallpaperEngine_mode = false;
  global.electron_as_wallpaper = () => false;
  global.update_tray = () => {};
  global.DropArea_drop = (dropPath) => {
    if (appWindow && !appWindow.isDestroyed()) {
      appWindow.webContents.send('xr-animator:legacy-drop', dropPath);
    }
  };
  global.GetImageSize = (filename) => {
    const image = nativeImage.createFromPath(toLocalPath(filename));
    if (image.isEmpty()) return null;
    const size = image.getSize();
    return [size.width, size.height];
  };
  global.HASH_SHA256 = {
    _hash_cache: {},
    hash(str) {
      if (this._hash_cache[str]) return this._hash_cache[str];
      const crypto = require('crypto');
      this._hash_cache[str] = crypto.createHash('sha256').update(str).digest('hex');
      return this._hash_cache[str];
    },
  };
  global.mainWindow_handle = {
    get self_handle() { return ''; },
    parent_handle: null,
  };

  global.path_demo = (() => {
    let cached;
    return () => {
      if (cached) return cached;
      const demoFile = path.join(APP_ROOT, 'js', 'path_demo.json');
      const pathDemo = JSON.parse(fs.readFileSync(demoFile, 'utf8'));
      const pathDemoByUrl = {};
      for (const demoName of Object.keys(pathDemo)) {
        pathDemo[demoName] = path.join(APP_ROOT, 'images', pathDemo[demoName]);
        pathDemoByUrl[pathDemo[demoName]] = demoName;
      }
      cached = { path_demo: pathDemo, path_demo_by_url: pathDemoByUrl };
      return cached;
    };
  })();
}

function applyAlwaysOnTop(enabled) {
  if (appWindow && !appWindow.isDestroyed()) {
    appWindow.setAlwaysOnTop(Boolean(enabled));
  }
}

function createAppWindow() {
  const settings = settingsStore.read();
  const bounds = settings.windowBounds || settings.avatarWindowBounds || {};

  appWindow = new BrowserWindow({
    width: bounds.width || 1440,
    height: bounds.height || 900,
    x: bounds.x,
    y: bounds.y,
    minWidth: 960,
    minHeight: 640,
    frame: true,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    show: false,
    title: 'XR Animator',
    icon: path.join(APP_ROOT, 'icon_SA_512x512.png'),
    alwaysOnTop: Boolean(settings.alwaysOnTop),
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      enableRemoteModule: true,
      backgroundThrottling: false,
      preload: APP_PRELOAD,
    },
  });

  remoteMain.enable(appWindow.webContents);

  appWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  appWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedNavigation(targetUrl)) event.preventDefault();
  });
  appWindow.webContents.on('will-frame-navigate', (event, ...args) => {
    const targetUrl = args.find((value) => typeof value === 'string');
    if (!isAllowedNavigation(targetUrl)) event.preventDefault();
  });

  appWindow.once('ready-to-show', () => appWindow.show());
  appWindow.on('close', () => {
    if (!appWindow) return;
    const nextBounds = appWindow.getBounds();
    settingsStore.update({
      windowBounds: nextBounds,
      avatarWindowBounds: nextBounds,
    });
  });
  appWindow.on('closed', () => {
    appWindow = null;
  });

  appWindow.loadFile(path.join(APP_ROOT, 'ui-dist', 'index.html'));
}

function installIpc() {
  ipcMain.handle('xr-animator:env', () => ({
    appRoot: APP_ROOT,
    isTestMode,
    legacyEntry: isTestMode ? '../tests/e2e/avatar-mock.html' : '../XR_Animator.html',
  }));

  ipcMain.handle('xr-animator:settings:get', () => settingsStore.read());
  ipcMain.handle('xr-animator:settings:update', (_event, patch) => settingsStore.update(patch || {}));

  ipcMain.handle('xr-animator:dialog:select-vrm', async () => {
    const result = await dialog.showOpenDialog(appWindow, {
      title: 'VRM 모델 선택',
      properties: ['openFile'],
      filters: [{ name: 'VRM model', extensions: ['vrm'] }],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const filePath = result.filePaths[0];
    settingsStore.update({ lastVrmPath: filePath });
    return { canceled: false, filePath };
  });

  ipcMain.handle('xr-animator:window:set-always-on-top', (_event, enabled) => {
    const alwaysOnTop = Boolean(enabled);
    settingsStore.update({ alwaysOnTop });
    applyAlwaysOnTop(alwaysOnTop);
    return { alwaysOnTop };
  });

  ipcMain.handle('xr-animator:window:set-size', (_event, payload = {}) => {
    if (!appWindow || appWindow.isDestroyed()) return { ok: false };
    const width = Math.max(960, Number(payload.width) || 1440);
    const height = Math.max(640, Number(payload.height) || 900);
    if (payload.contentSize) {
      appWindow.setContentSize(width, height, true);
    } else {
      appWindow.setSize(width, height, true);
    }
    if (payload.center !== false) appWindow.center();
    const bounds = appWindow.getBounds();
    settingsStore.update({ windowBounds: bounds, avatarWindowBounds: bounds });
    return { ok: true, bounds };
  });

  ipcMain.handle('xr-animator:window:center', () => {
    if (!appWindow || appWindow.isDestroyed()) return { ok: false };
    appWindow.center();
    const bounds = appWindow.getBounds();
    settingsStore.update({ windowBounds: bounds, avatarWindowBounds: bounds });
    return { ok: true, bounds };
  });

  ipcMain.handle('xr-animator:window:set-ignore-mouse-events', (_event, ignore) => {
    if (!appWindow || appWindow.isDestroyed()) return { ok: false };
    appWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
    return { ok: true, ignore: Boolean(ignore) };
  });
}

app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('force_high_performance_gpu');

app.whenReady().then(() => {
  installLegacyGlobals();
  installIpc();
  createAppWindow();

  app.on('activate', () => {
    if (!appWindow) createAppWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
