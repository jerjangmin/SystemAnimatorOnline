import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const TRACKING_MODES = [
  { value: 'Face', label: '얼굴', description: '표정과 머리 움직임 중심' },
  { value: 'Face+Body', label: '얼굴+상반신', description: '방송 기본 추천' },
  { value: 'Body+Hands', label: '상반신+손', description: '손 제스처 포함' },
];

const BACKGROUNDS = [
  { value: 'transparent', label: '투명' },
  { value: 'green', label: '크로마 그린' },
  { value: 'black', label: '검정' },
];

const EXPRESSIONS = [
  { value: 'neutral', label: '기본' },
  { value: 'happy', label: '웃음' },
  { value: 'surprised', label: '놀람' },
  { value: 'angry', label: '화남' },
  { value: 'sad', label: '슬픔' },
];

const DEFAULT_SETTINGS = {
  lastVrmPath: '',
  cameraDeviceId: '',
  cameraLabel: '',
  trackingMode: 'Face+Body',
  backgroundMode: 'transparent',
  alwaysOnTop: true,
};

function bridge() {
  return window.somilandControl;
}

function basename(filePath) {
  return (filePath || '').split(/[\\/]/).pop() || '';
}

function StatusBadge({ level, children }) {
  return <span className={`status-badge status-badge--${level || 'loading'}`}>{children}</span>;
}

function Section({ title, description, children, error }) {
  return (
    <section className="card" aria-labelledby={`${title}-title`}>
      <div className="card__header">
        <h2 id={`${title}-title`}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="card__body">{children}</div>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
    </section>
  );
}

function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [status, setStatus] = useState({ level: 'loading', message: '컨트롤러 시작 중…' });
  const [busy, setBusy] = useState('');
  const [errors, setErrors] = useState({});
  const [cameras, setCameras] = useState([]);

  const currentModel = useMemo(() => basename(settings.lastVrmPath), [settings.lastVrmPath]);
  const isBusy = Boolean(busy);

  async function refreshAll() {
    if (!bridge()) {
      setStatus({ level: 'error', message: 'Electron 제어 브리지를 찾지 못했습니다.' });
      return;
    }
    const [nextSettings, nextStatus] = await Promise.all([
      bridge().getSettings(),
      bridge().getStatus(),
    ]);
    setSettings({ ...DEFAULT_SETTINGS, ...nextSettings });
    setStatus(nextStatus || { level: 'loading', message: '상태 대기 중…' });
  }

  useEffect(() => {
    refreshAll().catch((error) => setStatus({ level: 'error', message: error.message }));
    const unsubscribe = bridge()?.onStatus((nextStatus) => setStatus(nextStatus));
    return () => unsubscribe?.();
  }, []);

  async function run(key, action, successMessage) {
    setBusy(key);
    setErrors((prev) => ({ ...prev, [key]: '' }));
    try {
      const result = await action();
      const nextSettings = await bridge().getSettings();
      setSettings({ ...DEFAULT_SETTINGS, ...nextSettings });
      if (successMessage) setStatus({ level: 'ready', message: successMessage(result) });
      return result;
    } catch (error) {
      setErrors((prev) => ({ ...prev, [key]: error.message }));
      setStatus({ level: 'error', message: error.message });
      return null;
    } finally {
      setBusy('');
    }
  }

  async function loadVrm() {
    await run('model', () => bridge().command('selectAndLoadVrm'), (result) => (
      result?.canceled ? 'VRM 선택을 취소했습니다.' : `모델 로드 요청 완료: ${basename(result?.filePath)}`
    ));
  }

  async function loadLastVrm() {
    await run('model', () => bridge().command('loadLastVrm'), () => '마지막 모델 로드 요청 완료');
  }

  async function refreshCameras() {
    await run('camera', async () => {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error('이 환경에서는 카메라 목록 API를 사용할 수 없습니다.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach((track) => track.stop());
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
      setCameras(devices);
      return devices;
    }, (devices) => `카메라 ${devices.length}개를 찾았습니다.`);
  }

  async function chooseCamera(event) {
    const cameraDeviceId = event.target.value;
    const selected = cameras.find((camera) => camera.deviceId === cameraDeviceId);
    const cameraLabel = cameraDeviceId ? (selected?.label || '') : '';
    setSettings((prev) => ({ ...prev, cameraDeviceId, cameraLabel }));
    await run('camera', () => bridge().command('setCamera', { cameraDeviceId, cameraLabel }), () => (
      cameraLabel ? `카메라 선택: ${cameraLabel}` : '기본 카메라를 사용합니다.'
    ));
  }

  async function startTracking(mode) {
    setSettings((prev) => ({ ...prev, trackingMode: mode }));
    await run('tracking', () => bridge().command('startTracking', { mode }), () => `트래킹 시작 요청: ${mode}`);
  }

  async function setBackground(mode) {
    setSettings((prev) => ({ ...prev, backgroundMode: mode }));
    await run('obs', () => bridge().command('setBackground', { mode }), () => `OBS 배경: ${mode}`);
  }

  async function setExpression(preset) {
    await run('expression', () => bridge().command('setExpressionPreset', { preset }), (result) => (
      result?.unsupported ? '현재 모델은 이 표정 프리셋을 지원하지 않습니다.' : `표정 적용: ${preset}`
    ));
  }

  async function resetPose() {
    await run('expression', () => bridge().command('resetPose'), () => '포즈/표정 리셋 요청 완료');
  }

  async function toggleAlwaysOnTop(event) {
    const enabled = event.target.checked;
    setSettings((prev) => ({ ...prev, alwaysOnTop: enabled }));
    await run('window', () => bridge().command('setAlwaysOnTop', { enabled }), () => (
      enabled ? '아바타 창을 항상 위에 고정했습니다.' : '항상 위 고정을 해제했습니다.'
    ));
  }

  async function setAvatarSize(width, height) {
    await run('window', () => bridge().command('setAvatarSize', { width, height }), () => `아바타 창 크기: ${width}×${height}`);
  }

  async function centerAvatar() {
    await run('window', () => bridge().command('centerAvatar'), () => '아바타 창을 화면 중앙으로 이동했습니다.');
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">macOS 개인용 VTuber</p>
          <h1>Somiland VTuber</h1>
        </div>
        <StatusBadge level={status.level}>{status.engineReady ? '엔진 준비' : '준비 중'}</StatusBadge>
      </header>

      <section className="status-panel" aria-live="polite" aria-busy={isBusy}>
        <p>{busy ? '처리 중… ' : ''}{status.message || '상태 대기 중…'}</p>
      </section>

      <Section title="모델" description="VRM 0.x/1.0 모델을 불러오고 마지막 세션을 복원합니다." error={errors.model}>
        <div className="button-row">
          <button type="button" className="button button--primary" onClick={loadVrm} disabled={isBusy}>VRM 불러오기</button>
          <button type="button" className="button" onClick={loadLastVrm} disabled={isBusy || !settings.lastVrmPath}>마지막 모델</button>
        </div>
        <p className="meta">{currentModel ? `현재 저장된 모델: ${currentModel}` : '저장된 모델 없음'}</p>
      </Section>

      <Section title="카메라" description="권한을 허용한 뒤 방송에 사용할 입력 카메라를 선택합니다." error={errors.camera}>
        <button type="button" className="button" onClick={refreshCameras} disabled={isBusy}>카메라 권한/목록 갱신</button>
        <label className="field-label" htmlFor="camera-select">입력 카메라</label>
        <select id="camera-select" className="select" value={settings.cameraDeviceId || ''} onChange={chooseCamera} disabled={isBusy}>
          <option value="">기본 카메라</option>
          {cameras.map((camera, index) => (
            <option key={camera.deviceId || index} value={camera.deviceId}>{camera.label || `카메라 ${index + 1}`}</option>
          ))}
        </select>
      </Section>

      <Section title="트래킹" description="방송 중 자주 쓰는 추적 범위만 간단하게 노출합니다." error={errors.tracking}>
        <div className="choice-grid" role="group" aria-label="트래킹 모드">
          {TRACKING_MODES.map((mode) => (
            <button key={mode.value} type="button" className="choice" aria-pressed={settings.trackingMode === mode.value} onClick={() => startTracking(mode.value)} disabled={isBusy}>
              <strong>{mode.label}</strong>
              <span>{mode.description}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="표정과 포즈" description="모델 호환성이 높은 안전 프리셋만 제공합니다." error={errors.expression}>
        <div className="button-row button-row--wrap" role="group" aria-label="표정 프리셋">
          {EXPRESSIONS.map((expression) => (
            <button key={expression.value} type="button" className="button" onClick={() => setExpression(expression.value)} disabled={isBusy}>{expression.label}</button>
          ))}
          <button type="button" className="button" onClick={resetPose} disabled={isBusy}>리셋</button>
        </div>
      </Section>

      <Section title="OBS" description="아바타 창만 캡처하세요. 컨트롤 창은 OBS에 잡히지 않습니다." error={errors.obs}>
        <div className="segmented" role="group" aria-label="OBS 배경">
          {BACKGROUNDS.map((background) => (
            <button key={background.value} type="button" aria-pressed={settings.backgroundMode === background.value} onClick={() => setBackground(background.value)} disabled={isBusy}>{background.label}</button>
          ))}
        </div>
      </Section>

      <Section title="창" description="아바타 창은 OBS용, 이 창은 조작용입니다." error={errors.window}>
        <label className="switch-row">
          <input type="checkbox" checked={settings.alwaysOnTop !== false} onChange={toggleAlwaysOnTop} disabled={isBusy} />
          <span>아바타 창 항상 위에 고정</span>
        </label>
        <div className="button-row button-row--wrap" role="group" aria-label="아바타 창 크기">
          <button type="button" className="button" onClick={() => setAvatarSize(1280, 720)} disabled={isBusy}>HD 720p</button>
          <button type="button" className="button" onClick={() => setAvatarSize(1920, 1080)} disabled={isBusy}>Full HD</button>
          <button type="button" className="button" onClick={() => setAvatarSize(1080, 1920)} disabled={isBusy}>세로 9:16</button>
        </div>
        <div className="button-row">
          <button type="button" className="button" onClick={centerAvatar} disabled={isBusy}>가운데 정렬</button>
          <button type="button" className="button" onClick={() => bridge().command('showAvatar')} disabled={isBusy}>아바타 창 보이기</button>
        </div>
      </Section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
