(() => {
  const DEFAULT_SETTINGS = {
    lastVrmPath: '',
    cameraDeviceId: '',
    cameraLabel: '',
    trackingMode: 'Face+Body',
    backgroundMode: 'transparent',
    transparentBackground: true,
    obsMode: true,
  };

  const state = { settings: { ...DEFAULT_SETTINGS }, engineReady: false };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function api() {
    return window.somilandVTuber || null;
  }

  function setStatus(message, status = 'ready') {
    const el = $('#sv-status');
    if (!el) return;
    el.textContent = message;
    el.dataset.state = status;
  }

  function basename(filePath) {
    return (filePath || '').split(/[\\/]/).pop() || '';
  }

  async function persist(patch) {
    state.settings = { ...state.settings, ...patch };
    if (api()) {
      state.settings = await api().updateSettings(patch);
    }
    renderSettings();
  }

  function renderSettings() {
    const vrm = $('#sv-current-vrm');
    if (vrm) {
      vrm.textContent = state.settings.lastVrmPath
        ? `마지막 VRM: ${basename(state.settings.lastVrmPath)}`
        : '마지막 VRM 없음';
    }

    $$('.sv-tracking').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === state.settings.trackingMode));
    });

    $$('.sv-background').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.background === state.settings.backgroundMode));
    });

    const cameraSelect = $('#sv-camera-select');
    if (cameraSelect && state.settings.cameraDeviceId) {
      cameraSelect.value = state.settings.cameraDeviceId;
    }

    applyBackground(state.settings.backgroundMode || 'transparent', false);
  }

  function waitForEngine(timeoutMs = 45000) {
    if (window.SA_DragDropEMU && window.System && window.MMD_SA) {
      state.engineReady = true;
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (window.SA_DragDropEMU && window.System && window.MMD_SA) {
          clearInterval(timer);
          state.engineReady = true;
          resolve();
          return;
        }
        if (Date.now() - startedAt > timeoutMs) {
          clearInterval(timer);
          reject(new Error('XR Animator 엔진 준비 시간이 초과되었습니다.'));
        }
      }, 250);
    });
  }

  function waitForXraReady(callback) {
    const run = () => callback();
    if (typeof window.on_XRA_loaded === 'function') {
      window.on_XRA_loaded(run, -1);
      return;
    }
    if (window.MMD_SA && window.MMD_SA.MMD_started) {
      run();
      return;
    }
    window.addEventListener('MMDStarted', run, { once: true });
  }

  async function loadVrmPath(filePath, save = true) {
    if (!filePath) return;
    setStatus('VRM 로딩 준비 중…');
    await waitForEngine();

    waitForXraReady(async () => {
      try {
        await window.SA_DragDropEMU(filePath);
        setStatus(`VRM 로드 요청 완료: ${basename(filePath)}`);
        if (save) await persist({ lastVrmPath: filePath });
      } catch (error) {
        console.error(error);
        setStatus(`VRM 로드 실패: ${error.message}`, 'error');
      }
    });
  }

  async function selectVrm() {
    if (!api()) {
      setStatus('Electron API를 찾을 수 없습니다.', 'error');
      return;
    }
    const filePath = await api().selectVrm();
    if (filePath) await loadVrmPath(filePath, true);
  }

  async function refreshCameras() {
    const select = $('#sv-camera-select');
    if (!select || !navigator.mediaDevices?.enumerateDevices) {
      setStatus('카메라 목록 API를 사용할 수 없습니다.', 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach((track) => track.stop());
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');

      select.innerHTML = '<option value="">기본 카메라</option>';
      devices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `카메라 ${index + 1}`;
        option.dataset.label = device.label || '';
        select.appendChild(option);
      });

      if (state.settings.cameraDeviceId) select.value = state.settings.cameraDeviceId;
      setStatus(`카메라 ${devices.length}개를 찾았습니다.`);
    } catch (error) {
      console.error(error);
      setStatus('카메라 권한을 허용해야 목록을 볼 수 있습니다.', 'error');
    }
  }

  async function chooseCamera(event) {
    const option = event.target.selectedOptions[0];
    const cameraDeviceId = event.target.value;
    const cameraLabel = cameraDeviceId ? (option?.dataset.label || option?.textContent || '') : '';

    if (window.MMD_SA_options?.user_camera?.streamer_mode) {
      window.MMD_SA_options.user_camera.streamer_mode.camera_preference = {
        label: cameraLabel ? { test: (label) => label.indexOf(cameraLabel) !== -1 } : null,
      };
    }

    await persist({ cameraDeviceId, cameraLabel });
    setStatus(cameraLabel ? `카메라 선택: ${cameraLabel}` : '기본 카메라를 사용합니다.');
  }

  async function startTracking(mode) {
    try {
      await waitForEngine();
      const streamerMode = window.System?._browser?.camera?.streamer_mode;
      if (!streamerMode?.init_mocap) {
        setStatus('트래킹 엔진이 아직 준비되지 않았습니다.', 'error');
        return;
      }
      streamerMode.init_mocap(mode);
      await persist({ trackingMode: mode });
      setStatus(`트래킹 시작 요청: ${trackingLabel(mode)}`);
    } catch (error) {
      console.error(error);
      setStatus(`트래킹 시작 실패: ${error.message}`, 'error');
    }
  }

  function trackingLabel(mode) {
    return {
      Face: '얼굴',
      'Face+Body': '얼굴+상반신',
      'Body+Hands': '상반신+손',
    }[mode] || mode;
  }

  async function applyBackground(mode, save = true) {
    const nextMode = mode || 'transparent';
    document.body.classList.remove('sv-bg-transparent', 'sv-bg-green', 'sv-bg-black');
    document.body.classList.add(`sv-bg-${nextMode}`);

    const bg = document.getElementById('LBG_dummy');
    if (bg) {
      bg.style.display = nextMode === 'transparent' ? 'none' : 'block';
      bg.style.width = '100vw';
      bg.style.height = '100dvh';
      bg.style.backgroundColor = nextMode === 'green' ? '#00b140' : '#000000';
    }

    if (save) {
      await persist({ backgroundMode: nextMode, transparentBackground: nextMode === 'transparent' });
      setStatus(`OBS 배경: ${nextMode === 'transparent' ? '투명' : nextMode === 'green' ? '크로마 그린' : '검정'}`);
    }
  }

  function hidePanel() {
    $('#somiland-vtuber-panel').hidden = true;
    $('#sv-show-panel').hidden = false;
  }

  function showPanel() {
    $('#somiland-vtuber-panel').hidden = false;
    $('#sv-show-panel').hidden = true;
  }

  async function restoreLastSession() {
    try {
      if (api()) {
        state.settings = { ...DEFAULT_SETTINGS, ...(await api().getSettings()) };
      }
      renderSettings();
      await waitForEngine();
      setStatus('엔진 준비 완료. 필요한 기능만 노출합니다.');

      if (state.settings.cameraLabel && window.MMD_SA_options?.user_camera?.streamer_mode) {
        const label = state.settings.cameraLabel;
        window.MMD_SA_options.user_camera.streamer_mode.camera_preference = {
          label: { test: (value) => value.indexOf(label) !== -1 },
        };
      }

      if (state.settings.lastVrmPath) {
        await loadVrmPath(state.settings.lastVrmPath, false);
      }
    } catch (error) {
      console.error(error);
      setStatus(error.message, 'error');
    }
  }

  function bindEvents() {
    $('#sv-load-vrm')?.addEventListener('click', selectVrm);
    $('#sv-refresh-cameras')?.addEventListener('click', refreshCameras);
    $('#sv-camera-select')?.addEventListener('change', chooseCamera);
    $('#sv-toggle-panel')?.addEventListener('click', hidePanel);
    $('#sv-show-panel')?.addEventListener('click', showPanel);

    $$('.sv-tracking').forEach((button) => {
      button.addEventListener('click', () => startTracking(button.dataset.mode));
    });

    $$('.sv-background').forEach((button) => {
      button.addEventListener('click', () => applyBackground(button.dataset.background));
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    restoreLastSession();
  });
})();
