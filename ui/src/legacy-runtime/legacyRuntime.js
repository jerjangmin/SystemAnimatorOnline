const ENGINE_TIMEOUT_MS = 45000;

function basename(filePath) {
  return (filePath || '').split(/[\\/]/).pop() || '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createHiddenBubbleMesh(win) {
  const Vector3 = win.THREE?.Vector3 || win.MMD_SA?.THREEX?.THREE?.Vector3;
  const position = Vector3 ? new Vector3() : { distanceToSquared: () => Number.POSITIVE_INFINITY };
  const scale = Vector3 ? new Vector3(1, 1, 1) : { x: 1, y: 1, z: 1, multiplyScalar() { return this; } };
  return {
    visible: false,
    position,
    scale,
  };
}

function getExpressionManagers(win) {
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

  scanObject(win.MMD_SA?.THREEX?.scene);
  Object.values(win.MMD_SA_options?.mesh_obj_by_id || {}).forEach((entry) => {
    scanObject(entry?._obj || entry?.obj || entry);
    add(entry?.data?.model);
    add(entry?.data);
  });
  (win.MMD_SA_options?.mesh_obj || []).forEach((entry) => {
    scanObject(entry?._obj || entry?.obj || entry);
    add(entry?.data?.model);
    add(entry?.data);
  });
  (win.MMD_SA?.THREEX?.VRM?.obj_list || []).forEach((entry) => {
    scanObject(entry?._obj || entry?.obj || entry);
    add(entry?.data?.model);
    add(entry?.data);
  });
  (win.MMD_SA?.THREEX?.VRM?.models || []).forEach((model) => add(model?.model || model));
  return managers;
}

export function createLegacyRuntime({ frame, log, setSnapshot }) {
  const getWindow = () => frame.current?.contentWindow || null;
  const getDocument = () => frame.current?.contentDocument || null;

  function logError(source, error, detail = {}) {
    log('error', error instanceof Error ? error : new Error(String(error)), {
      source,
      detail: {
        ...detail,
        runtime: snapshot(),
      },
    });
  }

  function snapshot(patch = {}) {
    const win = getWindow();
    const next = {
      engineReady: Boolean(win?.SA_DragDropEMU && win?.System && win?.MMD_SA),
      rendererReady: Boolean(win?.MMD_SA?.MMD_started),
      hasStreamerMode: Boolean(win?.System?._browser?.camera?.streamer_mode),
      hasAvatar: Boolean(win?.MMD_SA?.THREEX?.scene || win?.__somilandMock),
      ...patch,
    };
    setSnapshot(next);
    return next;
  }

  function patchLegacyUi() {
    const doc = getDocument();
    const win = getWindow();
    if (!doc || doc.getElementById('xr-animator-react-hide-legacy-ui')) return;

    const style = doc.createElement('style');
    style.id = 'xr-animator-react-hide-legacy-ui';
    style.textContent = `
      html, body {
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        overflow: hidden !important;
        background: transparent !important;
      }
      #Lquick_menu,
      #LbuttonTL,
      #LbuttonLR,
      #Lnumpad,
      #SB_tooltip,
      #Ldebug,
      #C_media_control,
      #Ldungeon_inventory,
      #Ldungeon_inventory_backpack,
      #Ldungeon_UI,
      #Ldungeon_map,
      #Cdungeon_status_bar,
      [id^="Ldungeon_inventory_item"],
      .Dungeon_inventory_item_info_short,
      .Dungeon_inventory_item_info,
      .QuickMenu_button,
      .Tooltip_LR::after,
      .Tooltip_TR::after,
      .MC_button_s::after {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      #LBG_dummy {
        position: fixed !important;
        inset: 0 !important;
      }
    `;
    doc.head.appendChild(style);

    const hideNodes = () => {
      [
        'Lquick_menu',
        'LbuttonTL',
        'LbuttonLR',
        'Lnumpad',
        'SB_tooltip',
        'Ldebug',
        'C_media_control',
        'Ldungeon_inventory',
        'Ldungeon_inventory_backpack',
        'Ldungeon_UI',
        'Ldungeon_map',
        'Cdungeon_status_bar',
      ].forEach((id) => {
        const node = doc.getElementById(id);
        if (node) {
          node.style.setProperty('display', 'none', 'important');
          node.style.setProperty('visibility', 'hidden', 'important');
          node.style.setProperty('pointer-events', 'none', 'important');
        }
      });
      doc.querySelectorAll('[id^="Ldungeon_inventory_item"]').forEach((node) => {
        node.style.setProperty('display', 'none', 'important');
        node.style.setProperty('visibility', 'hidden', 'important');
        node.style.setProperty('pointer-events', 'none', 'important');
      });
    };

    hideNodes();
    const observer = new MutationObserver(hideNodes);
    observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true });
    win.__xrAnimatorLegacyUiObserver = observer;
    log('legacy-ui', '레거시 UI 숨김 패치를 적용했습니다.');
  }

  function installDiagnostics() {
    const win = getWindow();
    if (!win || win.__xrAnimatorDiagnosticsInstalled) return;
    win.__xrAnimatorDiagnosticsInstalled = true;

    win.addEventListener('error', (event) => {
      logError('legacy-window-error', event.error || event.message, {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    win.addEventListener('unhandledrejection', (event) => {
      logError('legacy-unhandled-rejection', event.reason || 'Unhandled promise rejection', {
        reason: event.reason?.message || String(event.reason),
      });
    });

    ['error', 'warn'].forEach((level) => {
      const original = win.console?.[level];
      if (typeof original !== 'function') return;
      win.console[level] = (...args) => {
        original.apply(win.console, args);
        const message = args.map((arg) => {
          if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        }).join(' ');
        log(level === 'error' ? 'error' : 'legacy-warn', message, {
          level: level === 'error' ? 'error' : 'warn',
          source: `legacy-console.${level}`,
          detail: { args: args.map((arg) => (arg instanceof Error ? { name: arg.name, message: arg.message, stack: arg.stack } : String(arg))) },
          stack: args.find((arg) => arg instanceof Error)?.stack || '',
        });
      };
    });

    log('diagnostics', '레거시 iframe 오류/경고 수집기를 설치했습니다.');
  }

  function suppressSpeechBubbles() {
    const win = getWindow();
    if (!win) return;

    const hide = () => {
      try {
        const speechBubble = win.MMD_SA?.SpeechBubble;
        if (win.MMD_SA_options) win.MMD_SA_options.use_speech_bubble = false;
        if (win.MMD_SA_options?.SpeechBubble_branch) {
          win.MMD_SA_options.SpeechBubble_branch.use_cursor = false;
        }
        if (speechBubble && !speechBubble.__xrAnimatorSuppressed) {
          speechBubble.__xrAnimatorSuppressed = true;
          speechBubble.message = () => {};
          speechBubble.show = () => {};
          speechBubble.hide = () => {};
        }
        (speechBubble?.list || []).forEach((bubble) => {
          if (!bubble) return;
          bubble.visible = false;
          bubble.message = () => {};
          bubble.show = () => {};
          bubble.hide = () => {};
          bubble.update_placement = () => {};
          bubble._update_placement = () => {};
          bubble._branch_key_ = null;
          bubble._drag_key_ = null;
          if (!bubble._mesh) bubble._mesh = createHiddenBubbleMesh(win);
          else bubble._mesh.visible = false;
        });
        const meshObj = win.MMD_SA?.THREEX?.mesh_obj;
        ['SpeechBubbleMESH0', 'SpeechBubbleMESH1', 'SpeechBubbleMESH2', 'SpeechBubbleMESH3'].forEach((id) => {
          meshObj?.get?.(id)?.hide?.();
        });
      } catch (error) {
        // Speech bubble meshes appear late during legacy boot. Missing meshes are expected.
      }
    };

    hide();
    if (!win.__xrAnimatorSpeechBubbleSuppressTimer) {
      win.__xrAnimatorSpeechBubbleSuppressTimer = win.setInterval(hide, 500);
    }
  }

  function autoStartLegacy() {
    const doc = getDocument();
    const startButton = doc?.getElementById('LMMD_StartButton');
    if (startButton) {
      startButton.click();
      log('runtime', '레거시 START 버튼을 자동 실행했습니다.');
    }
  }

  async function waitForEngine(timeoutMs = ENGINE_TIMEOUT_MS) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const win = getWindow();
      if (win?.SA_DragDropEMU && win?.System && win?.MMD_SA) {
        suppressSpeechBubbles();
        snapshot({ engineReady: true });
        return win;
      }
      await sleep(250);
    }
    throw new Error('XR Animator 엔진 준비 시간이 초과되었습니다.');
  }

  async function waitForRenderer(timeoutMs = ENGINE_TIMEOUT_MS) {
    const win = await waitForEngine(timeoutMs);
    if (win.MMD_SA?.MMD_started || win.__somilandMock) {
      suppressSpeechBubbles();
      snapshot({ rendererReady: true });
      return win;
    }
    if (typeof win.on_XRA_loaded === 'function') {
      await Promise.race([
        new Promise((resolve) => win.on_XRA_loaded(resolve, -1)),
        sleep(timeoutMs).then(() => {
          throw new Error('XR Animator 렌더러 준비 시간이 초과되었습니다.');
        }),
      ]);
      suppressSpeechBubbles();
      snapshot({ rendererReady: true });
      return win;
    }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('XR Animator 렌더러 준비 시간이 초과되었습니다.')), timeoutMs);
      win.addEventListener('MMDStarted', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
    snapshot({ rendererReady: true });
    suppressSpeechBubbles();
    return win;
  }

  async function onFrameLoad() {
    installDiagnostics();
    patchLegacyUi();
    suppressSpeechBubbles();
    autoStartLegacy();
    snapshot({ frameLoaded: true });
    log('runtime', '레거시 XR Animator 문서를 로드했습니다.');
    try {
      await waitForEngine();
      log('runtime', 'XR Animator 엔진이 준비되었습니다.');
      await waitForRenderer();
      log('runtime', 'XR Animator 렌더러가 준비되었습니다.');
    } catch (error) {
      snapshot({ level: 'error', message: error.message });
      logError('legacy-runtime', error);
    }
  }

  async function loadVrm(filePath) {
    if (!filePath) throw new Error('VRM 파일 경로가 비어 있습니다.');
    const win = await waitForRenderer(90000);
    if (typeof win.SA_DragDropEMU !== 'function') {
      throw new Error('VRM 로드 함수(SA_DragDropEMU)를 찾지 못했습니다.');
    }
    await win.SA_DragDropEMU(filePath);
    snapshot({ modelLoaded: true, currentModel: basename(filePath) });
    log('model', `VRM 로드 요청 완료: ${basename(filePath)}`);
    return { ok: true, filePath };
  }

  function setCamera({ cameraLabel = '' }) {
    const win = getWindow();
    if (win?.MMD_SA_options?.user_camera?.streamer_mode) {
      win.MMD_SA_options.user_camera.streamer_mode.camera_preference = {
        label: cameraLabel ? { test: (label) => label.indexOf(cameraLabel) !== -1 } : null,
      };
    }
    snapshot({ cameraLabel });
    log('camera', cameraLabel ? `카메라 선택: ${cameraLabel}` : '기본 카메라를 사용합니다.');
    return { ok: true, cameraLabel };
  }

  async function startTracking(mode = 'Face+Body') {
    const win = await waitForEngine();
    const streamerMode = win.System?._browser?.camera?.streamer_mode;
    if (!streamerMode?.init_mocap) {
      throw new Error('트래킹 엔진이 아직 준비되지 않았습니다.');
    }
    streamerMode.init_mocap(mode);
    snapshot({ trackingMode: mode });
    log('tracking', `트래킹 시작 요청: ${mode}`);
    return { ok: true, mode };
  }

  function setBackground(mode = 'transparent') {
    const win = getWindow();
    const doc = getDocument();
    const nextMode = ['transparent', 'green', 'black'].includes(mode) ? mode : 'transparent';
    const colors = { transparent: 'transparent', green: '#00b140', black: '#000000' };

    if (doc?.body) {
      doc.body.classList.remove('sv-bg-transparent', 'sv-bg-green', 'sv-bg-black');
      doc.body.classList.add(`sv-bg-${nextMode}`);
      doc.body.style.background = colors[nextMode];
    }
    const bg = doc?.getElementById('LBG_dummy');
    if (bg) {
      bg.style.display = nextMode === 'transparent' ? 'none' : 'block';
      bg.style.width = '100vw';
      bg.style.height = '100vh';
      bg.style.backgroundColor = colors[nextMode];
    }
    if (win?.__somilandMock) {
      win.__somilandMock.backgroundMode = nextMode;
    }
    snapshot({ backgroundMode: nextMode });
    log('background', `배경 전환: ${nextMode}`);
    return { ok: true, mode: nextMode };
  }

  function setExpressionPreset(preset = 'neutral') {
    const win = getWindow();
    const presetMap = {
      neutral: [],
      happy: ['happy', 'relaxed', 'fun', 'joy'],
      surprised: ['surprised', 'surprise'],
      angry: ['angry'],
      sad: ['sad', 'sorrow'],
    };
    const targetNames = presetMap[preset] || [];
    const managers = getExpressionManagers(win);

    if (!managers.length) {
      log('expression', '현재 모델에서 표정 매니저를 찾지 못했습니다.');
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

    snapshot({ expressionPreset: preset });
    log('expression', `표정 프리셋 적용: ${preset}`);
    return { ok: true, preset };
  }

  function resetPose() {
    setExpressionPreset('neutral');
    log('expression', '포즈/표정 리셋 요청 완료');
    return { ok: true };
  }

  function resetCamera() {
    const win = getWindow();
    win?.MMD_SA?.THREEX?.camera?.position?.set?.(0, 0, 0);
    if (typeof win?.MMD_SA?.reset_camera === 'function') win.MMD_SA.reset_camera();
    log('viewport', '카메라 리셋을 요청했습니다.');
    return { ok: true };
  }

  return {
    getWindow,
    getDocument,
    onFrameLoad,
    loadVrm,
    setCamera,
    startTracking,
    setBackground,
    setExpressionPreset,
    resetPose,
    resetCamera,
    snapshot,
  };
}
