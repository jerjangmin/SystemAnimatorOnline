const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = Object.freeze({
  lastVrmPath: '',
  cameraDeviceId: '',
  cameraLabel: '',
  trackingMode: 'Face+Body',
  backgroundMode: 'transparent',
  transparentBackground: true,
  obsMode: true,
  alwaysOnTop: false,
  settingsVersion: 2,
  avatarWindowBounds: { width: 1280, height: 720 },
  windowBounds: { width: 1280, height: 720 },
});

function settingsPath(app) {
  return path.join(app.getPath('userData'), 'somiland-vtuber-settings.json');
}

function normalizeSettings(value = {}) {
  const isLegacySettings = !value.settingsVersion;
  const merged = {
    ...DEFAULT_SETTINGS,
    ...value,
    avatarWindowBounds: {
      ...DEFAULT_SETTINGS.avatarWindowBounds,
      ...(value.avatarWindowBounds || value.windowBounds || {}),
    },
    windowBounds: {
      ...DEFAULT_SETTINGS.windowBounds,
      ...(value.windowBounds || value.avatarWindowBounds || {}),
    },
  };

  if (!['Face', 'Face+Body', 'Body+Hands'].includes(merged.trackingMode)) {
    merged.trackingMode = DEFAULT_SETTINGS.trackingMode;
  }

  if (!['transparent', 'green', 'black'].includes(merged.backgroundMode)) {
    merged.backgroundMode = DEFAULT_SETTINGS.backgroundMode;
  }

  merged.transparentBackground = merged.backgroundMode === 'transparent' && merged.transparentBackground !== false;
  merged.obsMode = merged.obsMode !== false;
  merged.alwaysOnTop = isLegacySettings ? false : Boolean(merged.alwaysOnTop);
  merged.settingsVersion = DEFAULT_SETTINGS.settingsVersion;

  return merged;
}

function createSettingsStore(app) {
  const filePath = settingsPath(app);

  function read() {
    try {
      if (!fs.existsSync(filePath)) return normalizeSettings();
      return normalizeSettings(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch (error) {
      console.warn('[settings] failed to read settings:', error);
      return normalizeSettings();
    }
  }

  function write(nextSettings) {
    const normalized = normalizeSettings(nextSettings);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2));
    return normalized;
  }

  function update(patch) {
    return write({ ...read(), ...patch });
  }

  return { filePath, read, write, update };
}

module.exports = { DEFAULT_SETTINGS, createSettingsStore };
