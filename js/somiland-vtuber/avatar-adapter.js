(() => {
  const { ipcRenderer } = require('electron');

  const state = {
    engineReady: false,
    modelLoaded: false,
    trackingMode: '',
    backgroundMode: 'transparent',
    message: '아바타 창을 초기화하는 중입니다.',
    level: 'loading',
  };

  function basename(filePath) {
    return (filePath || '').split(/[\\/]/).pop() || '';
  }

  function publish(patch) {
    Object.assign(state, patch || {});
    ipcRenderer.send('somiland:avatar-status', { ...state, updatedAt: Date.now() });
  }

  function waitForEngine(timeoutMs = 45000) {
    if (window.SA_DragDropEMU && window.System && window.MMD_SA) {
      publish({ engineReady: true, message: '엔진 준비 완료', level: 'ready' });
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (window.SA_DragDropEMU && window.System && window.MMD_SA) {
          clearInterval(timer);
          publish({ engineReady: true, message: '엔진 준비 완료', level: 'ready' });
          resolve();
          return;
        }
        if (Date.now() - startedAt > timeoutMs) {
          clearInterval(timer);
          publish({ message: 'XR Animator 엔진 준비 시간이 초과되었습니다.', level: 'error' });
          reject(new Error('XR Animator 엔진 준비 시간이 초과되었습니다.'));
        }
      }, 250);
    });
  }

  function waitForXraReady() {
    return new Promise((resolve) => {
      const run = () => resolve();
      if (typeof window.on_XRA_loaded === 'function') {
        window.on_XRA_loaded(run, -1);
        return;
      }
      if (window.MMD_SA && window.MMD_SA.MMD_started) {
        run();
        return;
      }
      window.addEventListener('MMDStarted', run, { once: true });
    });
  }

  async function loadVrm({ filePath }) {
    if (!filePath) throw new Error('VRM 파일 경로가 비어 있습니다.');
    publish({ message: 'VRM 로딩 준비 중…', level: 'loading' });
    await waitForEngine();
    await waitForXraReady();
    await window.SA_DragDropEMU(filePath);
    publish({ modelLoaded: true, message: `VRM 로드 요청 완료: ${basename(filePath)}`, level: 'ready' });
    return { ok: true, filePath, label: basename(filePath) };
  }

  function setCamera({ cameraLabel = '' }) {
    if (window.MMD_SA_options?.user_camera?.streamer_mode) {
      window.MMD_SA_options.user_camera.streamer_mode.camera_preference = {
        label: cameraLabel ? { test: (label) => label.indexOf(cameraLabel) !== -1 } : null,
      };
    }
    publish({ message: cameraLabel ? `카메라 선택: ${cameraLabel}` : '기본 카메라 사용', level: 'ready' });
    return { ok: true, cameraLabel };
  }

  async function startTracking({ mode = 'Face+Body' }) {
    await waitForEngine();
    const streamerMode = window.System?._browser?.camera?.streamer_mode;
    if (!streamerMode?.init_mocap) {
      throw new Error('트래킹 엔진이 아직 준비되지 않았습니다.');
    }
    streamerMode.init_mocap(mode);
    publish({ trackingMode: mode, message: `트래킹 시작 요청: ${mode}`, level: 'ready' });
    return { ok: true, mode };
  }

  function setBackground({ mode = 'transparent' }) {
    const nextMode = ['transparent', 'green', 'black'].includes(mode) ? mode : 'transparent';
    document.body.classList.remove('sv-bg-transparent', 'sv-bg-green', 'sv-bg-black');
    document.body.classList.add(`sv-bg-${nextMode}`);

    const bg = document.getElementById('LBG_dummy');
    if (bg) {
      bg.style.display = nextMode === 'transparent' ? 'none' : 'block';
      bg.style.width = '100vw';
      bg.style.height = '100dvh';
      bg.style.backgroundColor = nextMode === 'green' ? '#00b140' : '#000000';
    }

    publish({ backgroundMode: nextMode, message: `OBS 배경: ${nextMode}`, level: 'ready' });
    return { ok: true, mode: nextMode };
  }

  function findExpressionManagers() {
    const managers = [];
    const seen = new Set();

    function add(candidate) {
      const manager = candidate?.expressionManager || candidate?.blendShapeProxy || candidate;
      if (!manager || typeof manager.setValue !== 'function' || seen.has(manager)) return;
      seen.add(manager);
      managers.push(manager);
    }

    function scanObject(object) {
      if (!object) return;
      add(object.userData?.vrm);
      add(object.vrm);
      add(object);
      if (typeof object.traverse === 'function') {
        object.traverse((child) => {
          add(child.userData?.vrm);
          add(child.vrm);
        });
      }
    }

    scanObject(window.MMD_SA?.THREEX?.scene);
    Object.values(window.MMD_SA_options?.mesh_obj_by_id || {}).forEach((entry) => {
      scanObject(entry?._obj || entry?.obj || entry);
      add(entry?.data?.model);
      add(entry?.data);
    });
    (window.MMD_SA_options?.mesh_obj || []).forEach((entry) => {
      scanObject(entry?._obj || entry?.obj || entry);
      add(entry?.data?.model);
      add(entry?.data);
    });
    (window.MMD_SA?.THREEX?.VRM?.obj_list || []).forEach((entry) => {
      scanObject(entry?._obj || entry?.obj || entry);
      add(entry?.data?.model);
      add(entry?.data);
    });
    (window.MMD_SA?.THREEX?.VRM?.models || []).forEach((model) => add(model?.model || model));
    return managers;
  }

  function setExpressionPreset({ preset = 'neutral' }) {
    const presetMap = {
      neutral: [],
      happy: ['happy', 'relaxed', 'fun', 'joy'],
      surprised: ['surprised', 'surprise'],
      angry: ['angry'],
      sad: ['sad', 'sorrow'],
    };
    const targetNames = presetMap[preset] || [];
    const managers = findExpressionManagers();

    if (!managers.length) {
      publish({ message: '현재 모델에서 표정 매니저를 찾지 못했습니다.', level: 'error' });
      return { ok: false, unsupported: true, reason: 'expression-manager-not-found' };
    }

    managers.forEach((manager) => {
      const maps = [manager.expressionMap, manager.presetExpressionMap, manager.customExpressionMap].filter(Boolean);
      const names = new Set();
      maps.forEach((map) => Object.keys(map).forEach((name) => names.add(name)));
      if (!names.size && manager._expressions) Object.keys(manager._expressions).forEach((name) => names.add(name));
      names.forEach((name) => manager.setValue(name, 0));
      targetNames.forEach((target) => {
        const matched = Array.from(names).find((name) => name.toLowerCase() === target.toLowerCase());
        if (matched) manager.setValue(matched, 1);
      });
      if (typeof manager.update === 'function') manager.update();
    });

    publish({ message: `표정 프리셋 적용: ${preset}`, level: 'ready' });
    return { ok: true, preset };
  }

  function resetPose() {
    try {
      if (window.MMD_SA?.MMD?.motionManager) {
        window.MMD_SA.MMD.motionManager.para_SA.motion_tracking = window.MMD_SA.MMD.motionManager.para_SA.motion_tracking || {};
      }
      setExpressionPreset({ preset: 'neutral' });
      publish({ message: '포즈/표정 리셋 요청 완료', level: 'ready' });
      return { ok: true };
    } catch (error) {
      publish({ message: `리셋 실패: ${error.message}`, level: 'error' });
      throw error;
    }
  }

  const handlers = {
    loadVrm,
    setCamera,
    startTracking,
    setBackground,
    setExpressionPreset,
    resetPose,
  };

  ipcRenderer.on('somiland:avatar-command', async (_event, request) => {
    try {
      const handler = handlers[request.command];
      if (!handler) throw new Error(`지원하지 않는 아바타 명령입니다: ${request.command}`);
      const value = await handler(request.payload || {});
      ipcRenderer.send('somiland:avatar-command-result', { id: request.id, ok: true, value });
    } catch (error) {
      console.error('[avatar-adapter]', error);
      publish({ message: error.message, level: 'error' });
      ipcRenderer.send('somiland:avatar-command-result', { id: request.id, ok: false, error: error.message });
    }
  });

  window.addEventListener('DOMContentLoaded', () => {
    publish({ message: '아바타 창 DOM 준비 완료', level: 'loading' });
    waitForEngine().catch(() => {});
  });

  window.addEventListener('MMDStarted', () => {
    publish({ engineReady: true, message: 'XR Animator 렌더러 시작 완료', level: 'ready' });
  });
})();
