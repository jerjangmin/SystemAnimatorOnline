const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = Object.freeze({
  lastVrmPath: '',
  cameraDeviceId: '',
  trackingMode: 'Face+Body',
  transparentBackground: true,
  obsMode: true,
  windowBounds: { width: 1280, height: 720 },
});

function settingsPath(app) {
  return path.join(app.getPath('userData'), 'somiland-vtuber-settings.json');
}

function normalizeSettings(value = {}) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...value,
    windowBounds: {
      ...DEFAULT_SETTINGS.windowBounds,
      ...(value.windowBounds || {}),
    },
  };

  if (!['Face', 'Face+Body', 'Body+Hands'].includes(merged.trackingMode)) {
    merged.trackingMode = DEFAULT_SETTINGS.trackingMode;
  }

  merged.transparentBackground = merged.transparentBackground !== false;
  merged.obsMode = merged.obsMode !== false;

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
