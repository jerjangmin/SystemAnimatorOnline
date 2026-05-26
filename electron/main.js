const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, dialog, ipcMain, nativeImage } = require('electron');
const remoteMain = require('@electron/remote/main');
const { createSettingsStore } = require('./settings-store');

remoteMain.initialize();

const APP_ROOT = path.resolve(__dirname, '..');
const AVATAR_PRELOAD = path.join(__dirname, 'preload.js');
const CONTROL_PRELOAD = path.join(__dirname, 'control-preload.js');
const settingsStore = createSettingsStore(app);
const isTestMode = process.env.SOMILAND_TEST_MODE === '1' || process.argv.includes('--test-mode');

let avatarWindow = null;
let controlWindow = null;
let avatarStatus = {
  engineReady: false,
  modelLoaded: false,
  trackingMode: '',
  backgroundMode: 'transparent',
  message: '아바타 엔진 시작 전입니다.',
  level: 'loading',
};
let commandSeq = 0;
const pendingAvatarCommands = new Map();

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
    if (avatarWindow && !avatarWindow.isDestroyed()) {
      avatarWindow.webContents.send('DragDrop', dropPath);
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

function createAvatarWindow() {
  const settings = settingsStore.read();
  const bounds = settings.avatarWindowBounds || settings.windowBounds || {};

  avatarWindow = new BrowserWindow({
    width: bounds.width || 1280,
    height: bounds.height || 720,
    x: bounds.x,
    y: bounds.y,
    minWidth: 640,
    minHeight: 360,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    show: false,
    title: 'Somiland VTuber Avatar',
    icon: path.join(APP_ROOT, 'icon_SA_512x512.png'),
    alwaysOnTop: Boolean(settings.alwaysOnTop),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      backgroundThrottling: false,
      preload: AVATAR_PRELOAD,
    },
  });

  remoteMain.enable(avatarWindow.webContents);

  avatarWindow.once('ready-to-show', () => avatarWindow.show());
  avatarWindow.on('close', () => {
    if (!avatarWindow) return;
    settingsStore.update({ avatarWindowBounds: avatarWindow.getBounds(), windowBounds: avatarWindow.getBounds() });
  });
  avatarWindow.on('closed', () => {
    avatarWindow = null;
  });

  const avatarFile = isTestMode
    ? path.join(APP_ROOT, 'tests', 'e2e', 'avatar-mock.html')
    : path.join(APP_ROOT, 'somiland-avatar.html');
  avatarWindow.loadFile(avatarFile);
}

function createControlWindow() {
  const settings = settingsStore.read();
  const bounds = settings.controlWindowBounds || {};

  controlWindow = new BrowserWindow({
    width: bounds.width || 460,
    height: bounds.height || 760,
    x: bounds.x,
    y: bounds.y,
    minWidth: 380,
    minHeight: 560,
    frame: true,
    transparent: false,
    backgroundColor: '#f8fafc',
    resizable: true,
    show: false,
    title: 'Somiland VTuber Control',
    icon: path.join(APP_ROOT, 'icon_SA_512x512.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      preload: CONTROL_PRELOAD,
    },
  });

  controlWindow.once('ready-to-show', () => controlWindow.show());
  controlWindow.on('close', () => {
    if (!controlWindow) return;
    settingsStore.update({ controlWindowBounds: controlWindow.getBounds() });
  });
  controlWindow.on('closed', () => {
    controlWindow = null;
  });

  const controlUrl = process.env.SOMILAND_CONTROL_URL;
  if (controlUrl) {
    controlWindow.loadURL(controlUrl);
  } else {
    controlWindow.loadFile(path.join(APP_ROOT, 'ui-dist', 'index.html'));
  }
}

function broadcastStatus() {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.webContents.send('somiland:status', avatarStatus);
  }
}

function sendAvatarCommand(command, payload = {}, options = {}) {
  if (!avatarWindow || avatarWindow.isDestroyed()) {
    return Promise.reject(new Error('아바타 창이 준비되지 않았습니다.'));
  }

  const id = ++commandSeq;
  const timeoutMs = options.timeoutMs || 45000;
  const request = { id, command, payload };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingAvatarCommands.delete(id);
      reject(new Error(`아바타 명령 시간이 초과되었습니다: ${command}`));
    }, timeoutMs);

    pendingAvatarCommands.set(id, { resolve, reject, timer });
    avatarWindow.webContents.send('somiland:avatar-command', request);
  });
}

function applyAlwaysOnTop(enabled) {
  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.setAlwaysOnTop(Boolean(enabled));
  }
}

async function handleCommand(command, payload = {}) {
  switch (command) {
    case 'selectAndLoadVrm': {
      const result = await dialog.showOpenDialog(controlWindow || avatarWindow, {
        title: 'VRM 모델 선택',
        properties: ['openFile'],
        filters: [{ name: 'VRM model', extensions: ['vrm'] }],
      });
      if (result.canceled || !result.filePaths.length) return { canceled: true };
      const filePath = result.filePaths[0];
      const value = await sendAvatarCommand('loadVrm', { filePath }, { timeoutMs: 90000 });
      settingsStore.update({ lastVrmPath: filePath });
      return { ...value, filePath };
    }
    case 'loadLastVrm': {
      const settings = settingsStore.read();
      if (!settings.lastVrmPath) return { skipped: true, message: '저장된 VRM이 없습니다.' };
      return sendAvatarCommand('loadVrm', { filePath: settings.lastVrmPath }, { timeoutMs: 90000 });
    }
    case 'setCamera': {
      const patch = {
        cameraDeviceId: payload.cameraDeviceId || '',
        cameraLabel: payload.cameraLabel || '',
      };
      settingsStore.update(patch);
      return sendAvatarCommand('setCamera', patch);
    }
    case 'startTracking': {
      const trackingMode = payload.mode || 'Face+Body';
      const value = await sendAvatarCommand('startTracking', { mode: trackingMode }, { timeoutMs: 90000 });
      settingsStore.update({ trackingMode });
      return value;
    }
    case 'setBackground': {
      const backgroundMode = payload.mode || 'transparent';
      const value = await sendAvatarCommand('setBackground', { mode: backgroundMode });
      settingsStore.update({ backgroundMode, transparentBackground: backgroundMode === 'transparent' });
      return value;
    }
    case 'setAlwaysOnTop': {
      const alwaysOnTop = Boolean(payload.enabled);
      settingsStore.update({ alwaysOnTop });
      applyAlwaysOnTop(alwaysOnTop);
      return { alwaysOnTop };
    }
    case 'setAvatarSize': {
      if (!avatarWindow || avatarWindow.isDestroyed()) return { ok: false };
      const width = Math.max(640, Number(payload.width) || 1280);
      const height = Math.max(360, Number(payload.height) || 720);
      avatarWindow.setSize(width, height, true);
      if (payload.center !== false) avatarWindow.center();
      settingsStore.update({ avatarWindowBounds: avatarWindow.getBounds(), windowBounds: avatarWindow.getBounds() });
      return { ok: true, bounds: avatarWindow.getBounds() };
    }
    case 'centerAvatar': {
      if (!avatarWindow || avatarWindow.isDestroyed()) return { ok: false };
      avatarWindow.center();
      settingsStore.update({ avatarWindowBounds: avatarWindow.getBounds(), windowBounds: avatarWindow.getBounds() });
      return { ok: true, bounds: avatarWindow.getBounds() };
    }
    case 'setIgnoreMouseEvents': {
      if (!avatarWindow || avatarWindow.isDestroyed()) return { ok: false };
      avatarWindow.setIgnoreMouseEvents(Boolean(payload.ignore), { forward: true });
      return { ok: true, ignore: Boolean(payload.ignore) };
    }
    case 'setExpressionPreset':
      return sendAvatarCommand('setExpressionPreset', { preset: payload.preset || 'neutral' });
    case 'resetPose':
      return sendAvatarCommand('resetPose', {});
    case 'showAvatar':
      if (avatarWindow && !avatarWindow.isDestroyed()) avatarWindow.show();
      return { ok: true };
    default:
      throw new Error(`알 수 없는 명령입니다: ${command}`);
  }
}

function installIpc() {
  ipcMain.handle('somiland:settings:get', () => settingsStore.read());
  ipcMain.handle('somiland:settings:update', (_event, patch) => settingsStore.update(patch || {}));
  ipcMain.handle('somiland:status:get', () => avatarStatus);
  ipcMain.handle('somiland:command', (_event, command, payload) => handleCommand(command, payload || {}));

  ipcMain.on('somiland:avatar-status', (_event, nextStatus) => {
    avatarStatus = { ...avatarStatus, ...(nextStatus || {}) };
    broadcastStatus();
  });

  ipcMain.on('somiland:avatar-command-result', (_event, result) => {
    const pending = pendingAvatarCommands.get(result.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingAvatarCommands.delete(result.id);
    if (result.ok) pending.resolve(result.value || {});
    else pending.reject(new Error(result.error || '아바타 명령이 실패했습니다.'));
  });
}

app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('force_high_performance_gpu');

app.whenReady().then(() => {
  installLegacyGlobals();
  installIpc();
  createAvatarWindow();
  createControlWindow();
  applyAlwaysOnTop(settingsStore.read().alwaysOnTop);

  app.on('activate', () => {
    if (!avatarWindow) createAvatarWindow();
    if (!controlWindow) createControlWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
