const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, dialog, ipcMain, nativeImage } = require('electron');
const remoteMain = require('@electron/remote/main');
const { createSettingsStore } = require('./settings-store');

remoteMain.initialize();

const APP_ROOT = path.resolve(__dirname, '..');
const PRELOAD = path.join(__dirname, 'preload.js');
const settingsStore = createSettingsStore(app);

let mainWindow = null;

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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('DragDrop', dropPath);
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

function createWindow() {
  const settings = settingsStore.read();
  const bounds = settings.windowBounds || {};

  mainWindow = new BrowserWindow({
    width: bounds.width || 1280,
    height: bounds.height || 720,
    x: bounds.x,
    y: bounds.y,
    minWidth: 960,
    minHeight: 540,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    show: false,
    title: 'Somiland VTuber',
    icon: path.join(APP_ROOT, 'icon_SA_512x512.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      backgroundThrottling: false,
      preload: PRELOAD,
    },
  });

  remoteMain.enable(mainWindow.webContents);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', () => {
    if (!mainWindow) return;
    settingsStore.update({ windowBounds: mainWindow.getBounds() });
  });

  mainWindow.loadFile(path.join(APP_ROOT, 'somiland-vtuber.html'));
}

function installIpc() {
  ipcMain.handle('somiland:settings:get', () => settingsStore.read());
  ipcMain.handle('somiland:settings:update', (_event, patch) => settingsStore.update(patch || {}));
  ipcMain.handle('somiland:dialog:select-vrm', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'VRM 모델 선택',
      properties: ['openFile'],
      filters: [{ name: 'VRM model', extensions: ['vrm'] }],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
  ipcMain.handle('somiland:window:set-ignore-mouse-events', (_event, ignore) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    mainWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
    return true;
  });
}

app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('force_high_performance_gpu');

app.whenReady().then(() => {
  installLegacyGlobals();
  installIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
