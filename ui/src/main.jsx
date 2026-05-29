import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createLegacyRuntime } from './legacy-runtime/legacyRuntime';
import './styles.css';

const TRACKING_MODES = [
  { value: 'Face', label: 'Face' },
  { value: 'Face+Body', label: 'Face + Body' },
  { value: 'Body+Hands', label: 'Body + Hands' },
];

const BACKGROUNDS = [
  { value: 'transparent', label: 'Transparent' },
  { value: 'green', label: 'Green' },
  { value: 'black', label: 'Black' },
];

const EXPRESSIONS = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'angry', label: 'Angry' },
  { value: 'sad', label: 'Sad' },
];

const DEFAULT_SETTINGS = {
  lastVrmPath: '',
  cameraDeviceId: '',
  cameraLabel: '',
  trackingMode: 'Face+Body',
  backgroundMode: 'transparent',
  alwaysOnTop: true,
};

const DEFAULT_RUNTIME = {
  frameLoaded: false,
  engineReady: false,
  rendererReady: false,
  hasStreamerMode: false,
  hasAvatar: false,
  modelLoaded: false,
  currentModel: '',
  trackingMode: '',
  backgroundMode: 'transparent',
  expressionPreset: 'neutral',
};

const LOG_LIMIT = 160;

function bridge() {
  return window.xrAnimatorElectron;
}

function basename(filePath) {
  return (filePath || '').split(/[\\/]/).pop() || '';
}

function statusText(runtime) {
  if (!runtime.frameLoaded) return 'Legacy frame loading';
  if (!runtime.engineReady) return 'Waiting for XR engine';
  if (!runtime.rendererReady) return 'Engine ready';
  return 'Renderer ready';
}

function PanelSection({ title, children }) {
  return (
    <section className="debug-section" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function serializeError(error) {
  if (!error) return {};
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || '',
      cause: error.cause ? serializeError(error.cause) : undefined,
    };
  }
  if (typeof error === 'object') {
    try {
      return JSON.parse(JSON.stringify(error));
    } catch {
      return { message: String(error) };
    }
  }
  return { message: String(error) };
}

function formatDetail(detail) {
  if (!detail) return '';
  if (typeof detail === 'string') return detail;
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

function App() {
  const frameRef = useRef(null);
  const runtimeRef = useRef(null);
  const [env, setEnv] = useState({ legacyEntry: '', isTestMode: false });
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [runtime, setRuntime] = useState(DEFAULT_RUNTIME);
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState('');
  const [cameras, setCameras] = useState([]);
  const [error, setError] = useState('');
  const [captureMode, setCaptureMode] = useState(false);

  const legacySrc = env.legacyEntry;
  const isBusy = Boolean(busy);
  const currentModel = useMemo(
    () => runtime.currentModel || basename(settings.lastVrmPath) || 'None',
    [runtime.currentModel, settings.lastVrmPath]
  );
  const errorLogs = useMemo(() => logs.filter((entry) => entry.level === 'error'), [logs]);

  function addLog(scope, message, options = {}) {
    const errorDetail = message instanceof Error ? serializeError(message) : null;
    const text = errorDetail?.message || String(message);
    const level = options.level || (scope === 'error' || message instanceof Error ? 'error' : 'info');
    setLogs((prev) => [
      (() => {
        const fingerprint = [
          level,
          scope,
          options.source || 'react-shell',
          text,
          options.stack || errorDetail?.stack || '',
        ].join('|');
        if (prev[0]?.fingerprint === fingerprint) {
          return {
            ...prev[0],
            at: new Date().toISOString(),
            time: new Date().toLocaleTimeString(),
            count: (prev[0].count || 1) + 1,
            detail: options.detail || errorDetail || prev[0].detail,
          };
        }
        return {
          id: `${Date.now()}-${Math.random()}`,
          at: new Date().toISOString(),
          time: new Date().toLocaleTimeString(),
          count: 1,
          fingerprint,
          level,
          scope,
          source: options.source || 'react-shell',
          message: text,
          detail: options.detail || errorDetail || null,
          stack: options.stack || errorDetail?.stack || '',
          runtime: options.runtime || null,
        };
      })(),
      ...(
        prev[0]?.fingerprint === [
          level,
          scope,
          options.source || 'react-shell',
          text,
          options.stack || errorDetail?.stack || '',
        ].join('|') ? prev.slice(1) : prev
      ),
    ].slice(0, LOG_LIMIT));
  }

  function updateRuntime(patch) {
    setRuntime((prev) => ({ ...prev, ...patch }));
  }

  async function refreshSettings() {
    if (!bridge()) {
      setError('Electron preload bridge not found.');
      return;
    }
    const nextSettings = await bridge().getSettings();
    setSettings({ ...DEFAULT_SETTINGS, ...nextSettings });
  }

  useEffect(() => {
    if (!bridge()) {
      setError('Electron preload bridge not found.');
      return undefined;
    }

    let cleanupDrop = () => {};
    Promise.all([bridge().getEnv(), bridge().getSettings()])
      .then(([nextEnv, nextSettings]) => {
        setEnv(nextEnv || {});
        setSettings({ ...DEFAULT_SETTINGS, ...nextSettings });
        addLog('app', nextEnv?.isTestMode ? 'Test mode enabled.' : 'Electron app initialized.');
      })
      .catch((nextError) => {
        setError(nextError.message);
        addLog('error', nextError, { source: 'bootstrap' });
      });

    cleanupDrop = bridge().onLegacyDrop?.((filePath) => {
      runtimeRef.current?.loadVrm(filePath).catch((nextError) => {
        setError(nextError.message);
        addLog('error', nextError, { source: 'legacy-drop', runtime });
      });
    }) || cleanupDrop;

    return () => cleanupDrop();
  }, []);

  useEffect(() => {
    runtimeRef.current = createLegacyRuntime({
      frame: frameRef,
      log: addLog,
      setSnapshot: updateRuntime,
    });
  }, []);

  async function run(key, action) {
    setBusy(key);
    setError('');
    try {
      const result = await action();
      await refreshSettings();
      return result;
    } catch (nextError) {
      setError(nextError.message);
      addLog('error', nextError, { source: key, runtime });
      return null;
    } finally {
      setBusy('');
    }
  }

  async function loadVrm() {
    await run('model', async () => {
      const result = await bridge().selectVrmFile();
      if (result?.canceled) {
        addLog('model', 'VRM selection canceled.');
        return result;
      }
      return runtimeRef.current.loadVrm(result.filePath);
    });
  }

  async function loadLastVrm() {
    await run('model', async () => {
      if (!settings.lastVrmPath) throw new Error('No saved VRM path.');
      return runtimeRef.current.loadVrm(settings.lastVrmPath);
    });
  }

  async function refreshCameras() {
    await run('camera', async () => {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error('MediaDevices API is unavailable.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach((track) => track.stop());
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
      setCameras(devices);
      addLog('camera', `Found ${devices.length} camera(s).`);
      return devices;
    });
  }

  async function chooseCamera(event) {
    const cameraDeviceId = event.target.value;
    const selected = cameras.find((camera) => camera.deviceId === cameraDeviceId);
    const cameraLabel = cameraDeviceId ? (selected?.label || '') : '';
    setSettings((prev) => ({ ...prev, cameraDeviceId, cameraLabel }));
    await run('camera', async () => {
      await bridge().updateSettings({ cameraDeviceId, cameraLabel });
      return runtimeRef.current.setCamera({ cameraLabel });
    });
  }

  async function startTracking(mode) {
    setSettings((prev) => ({ ...prev, trackingMode: mode }));
    await run('tracking', async () => {
      await bridge().updateSettings({ trackingMode: mode });
      return runtimeRef.current.startTracking(mode);
    });
  }

  async function setBackground(mode) {
    setSettings((prev) => ({ ...prev, backgroundMode: mode }));
    await run('background', async () => {
      await bridge().updateSettings({ backgroundMode: mode, transparentBackground: mode === 'transparent' });
      return runtimeRef.current.setBackground(mode);
    });
  }

  async function setExpression(preset) {
    await run('expression', async () => runtimeRef.current.setExpressionPreset(preset));
  }

  async function resetPose() {
    await run('expression', async () => runtimeRef.current.resetPose());
  }

  async function setAlwaysOnTop(event) {
    const enabled = event.target.checked;
    setSettings((prev) => ({ ...prev, alwaysOnTop: enabled }));
    await run('window', async () => bridge().setAlwaysOnTop(enabled));
  }

  async function setCaptureViewportSize(width, height) {
    setCaptureMode(true);
    await run('window', async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      return bridge().setWindowSize({ width, height, contentSize: true });
    });
  }

  async function centerWindow() {
    await run('window', async () => bridge().centerWindow());
  }

  async function resetCamera() {
    await run('viewport', async () => runtimeRef.current.resetCamera());
  }

  return (
    <main className={`xr-shell${captureMode ? ' xr-shell--capture' : ''}`}>
      <section className="viewport-pane" aria-label="XR Animator viewport">
        <div className="viewport-toolbar">
          <div>
            <p className="eyebrow">Electron Single Window</p>
            <h1>XR Animator</h1>
          </div>
          <div className="runtime-badges" aria-label="runtime status">
            <span className={runtime.frameLoaded ? 'badge badge--ready' : 'badge'}>Frame</span>
            <span className={runtime.engineReady ? 'badge badge--ready' : 'badge'}>Engine</span>
            <span className={runtime.rendererReady ? 'badge badge--ready' : 'badge'}>Renderer</span>
          </div>
        </div>
        <div className="viewport-frame-wrap" data-testid="legacy-viewport" data-background-mode={settings.backgroundMode}>
          {legacySrc ? (
            <iframe
              ref={frameRef}
              title="XR Animator legacy runtime"
              className="legacy-frame"
              src={legacySrc}
              onLoad={() => runtimeRef.current?.onFrameLoad()}
            />
          ) : (
            <div className="viewport-loading">Loading XR Animator runtime...</div>
          )}
        </div>
      </section>

      <aside className="debug-panel" aria-label="XR Animator debug controls">
        <header className="debug-header">
          <p className="eyebrow">Debug Console</p>
          <h2>{statusText(runtime)}</h2>
          {error ? <p className="error-text" role="alert">{error}</p> : null}
          {errorLogs.length ? (
            <div className="error-summary" role="status">
              <strong>{errorLogs.length} error log(s)</strong>
              <span>{errorLogs[0].message}</span>
            </div>
          ) : null}
        </header>

        <PanelSection title="Runtime">
          <dl className="kv-grid">
            <div><dt>Mode</dt><dd>{env.isTestMode ? 'Test' : 'App'}</dd></div>
            <div><dt>Model</dt><dd>{currentModel}</dd></div>
            <div><dt>Tracking</dt><dd>{runtime.trackingMode || settings.trackingMode || 'Idle'}</dd></div>
            <div><dt>Background</dt><dd>{runtime.backgroundMode || settings.backgroundMode}</dd></div>
          </dl>
        </PanelSection>

        <PanelSection title="Model">
          <div className="button-row">
            <button type="button" className="button button--primary" onClick={loadVrm} disabled={isBusy}>Load VRM</button>
            <button type="button" className="button" onClick={loadLastVrm} disabled={isBusy || !settings.lastVrmPath}>Load Last</button>
          </div>
        </PanelSection>

        <PanelSection title="Camera">
          <button type="button" className="button" onClick={refreshCameras} disabled={isBusy}>Refresh Cameras</button>
          <select className="select" value={settings.cameraDeviceId || ''} onChange={chooseCamera} disabled={isBusy}>
            <option value="">Default camera</option>
            {cameras.map((camera, index) => (
              <option key={camera.deviceId || index} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>
            ))}
          </select>
        </PanelSection>

        <PanelSection title="Tracking">
          <div className="segmented" role="group" aria-label="tracking mode">
            {TRACKING_MODES.map((mode) => (
              <button key={mode.value} type="button" aria-pressed={settings.trackingMode === mode.value} onClick={() => startTracking(mode.value)} disabled={isBusy}>
                {mode.label}
              </button>
            ))}
          </div>
        </PanelSection>

        <PanelSection title="Expression">
          <div className="button-grid" role="group" aria-label="expression presets">
            {EXPRESSIONS.map((expression) => (
              <button key={expression.value} type="button" className="button" onClick={() => setExpression(expression.value)} disabled={isBusy}>
                {expression.label}
              </button>
            ))}
            <button type="button" className="button" onClick={resetPose} disabled={isBusy}>Reset Pose</button>
          </div>
        </PanelSection>

        <PanelSection title="Background">
          <div className="segmented" role="group" aria-label="background mode">
            {BACKGROUNDS.map((background) => (
              <button key={background.value} type="button" aria-pressed={settings.backgroundMode === background.value} onClick={() => setBackground(background.value)} disabled={isBusy}>
                {background.label}
              </button>
            ))}
          </div>
        </PanelSection>

        <PanelSection title="Window">
          <label className="switch-row">
            <input type="checkbox" checked={settings.alwaysOnTop !== false} onChange={setAlwaysOnTop} disabled={isBusy} />
            <span>Always on top</span>
          </label>
          <label className="switch-row">
            <input type="checkbox" checked={captureMode} onChange={(event) => setCaptureMode(event.target.checked)} disabled={isBusy} />
            <span>Capture view only</span>
          </label>
          <div className="button-grid">
            <button type="button" className="button" onClick={() => setCaptureViewportSize(1280, 720)} disabled={isBusy}>Capture 1280x720</button>
            <button type="button" className="button" onClick={() => setCaptureViewportSize(1920, 1080)} disabled={isBusy}>Capture 1920x1080</button>
            <button type="button" className="button" onClick={centerWindow} disabled={isBusy}>Center</button>
            <button type="button" className="button" onClick={resetCamera} disabled={isBusy}>Reset Camera</button>
          </div>
        </PanelSection>
      </aside>

      <section className="log-panel" aria-label="runtime log">
        <div className="log-status">
          <strong>{busy ? `Running: ${busy}` : 'Idle'}</strong>
          <span>{logs.length} entries / {errorLogs.length} errors</span>
        </div>
        <div className="log-list">
          {logs.length ? logs.map((entry) => (
            <details key={entry.id} className={`log-entry log-entry--${entry.level}`} open={entry.level === 'error'}>
              <summary>
                <time>{entry.time}</time>
                <code>{entry.level}</code>
                <span>{entry.scope}</span>
                <strong>{entry.count > 1 ? `${entry.message} (x${entry.count})` : entry.message}</strong>
              </summary>
              <dl>
                <div><dt>source</dt><dd>{entry.source}</dd></div>
                <div><dt>timestamp</dt><dd>{entry.at}</dd></div>
                {entry.detail ? <div><dt>detail</dt><dd><pre>{formatDetail(entry.detail)}</pre></dd></div> : null}
                {entry.stack ? <div><dt>stack</dt><dd><pre>{entry.stack}</pre></dd></div> : null}
                {entry.runtime ? <div><dt>runtime</dt><dd><pre>{formatDetail(entry.runtime)}</pre></dd></div> : null}
              </dl>
            </details>
          )) : <p>No logs yet.</p>}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
