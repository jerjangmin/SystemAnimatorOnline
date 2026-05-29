# XR Animator React/Vite 리팩토링 계획

## 현재 작업: macOS 일반 창 UI 복구

- [x] Electron 창 설정에서 이동 불편 원인 확인
- [x] 투명 창을 일반 macOS native frame/titlebar 창으로 변경
- [x] Always on top 기본값을 끄고 기존 기본 설정을 마이그레이션
- [x] 빌드와 테스트로 검증
- [x] 새 앱 번들을 `/Applications`에 덮어쓰기 설치

### 검토

- 원인: Electron 창은 `frame: true`였지만 `transparent: true`와 투명 배경, Always on top 기본값 때문에 일반 macOS 앱 창처럼 보이지 않았다.
- 조치: `titleBarStyle: 'default'`, 불투명 배경, 명시적 movable/minimize/maximize 설정을 적용했다.
- 조치: Always on top 기본값을 껐고, 구버전 설정은 새 기본값으로 마이그레이션한다.
- 검증: `npm run build:ui`, 주요 e2e 2개, `npm run package:mac`, `/Applications` 설치 및 codesign 검증을 통과했다.

## 목표

XR Animator를 Electron 단일 창 기반 React/Vite 앱으로 전면 리팩토링한다. 기존 별도 Control 창은 제거하고, 기존 `js/`, `MMD.js/`, `three.js/`, `images/`, `css/` 레거시 자산은 유지한 채 React 쪽에 `legacy-runtime` 호환 레이어를 추가한다.

## 확정된 방향

- [x] Electron 단일 앱만 지원한다. 브라우저 실행은 계획하지 않는다.
- [x] 기존 Control 창을 완전히 제거하고 하나의 `appWindow`만 만든다.
- [x] 개발/프로덕션 모두 우선 빌드된 `ui-dist/index.html`을 로드한다.
- [x] 기존 레거시 자산은 이동하지 않고 유지한다.
- [x] React/Vite 앱에 XR Animator 호환 레이어를 추가한다.
- [x] 기존 모캡 로직은 새로 갈아엎지 않고 최대한 포팅한다.
- [x] 레거시 UI는 CSS/DOM 패치로 숨기고, 생성 로직은 1차에서 건드리지 않는다.
- [x] UI는 개발/디버깅 중심으로 구성한다.
- [x] 레이아웃은 3D 뷰포트 + 오른쪽 디버그/컨트롤 패널 + 하단 로그/상태 바 구조로 간다.
- [x] 내부 UI/코드 이름은 XR Animator 중심으로 정리하되, 패키지명/productName/appId는 1차에서 유지한다.

## 1차 필수 기능

- [x] VRM 파일 로드
- [x] 3D 아바타 렌더링
- [x] 마우스 드래그/줌/리셋 카메라 조작
- [x] 웹캠 입력 선택
- [x] 얼굴/상반신/손 트래킹
- [x] 표정 프리셋과 기본 립싱크
- [x] 투명/그린/블랙 배경 전환
- [x] OBS 캡처용 단일 Electron 창 설정

## 구현 계획

### 1. Electron 단일 창 전환

- [x] `electron/main.js`의 `avatarWindow`/`controlWindow` 이중 구조를 `appWindow` 단일 구조로 바꾼다.
- [x] `createControlWindow()`와 `CONTROL_PRELOAD` 의존성을 제거한다.
- [x] `appWindow`가 `ui-dist/index.html`을 로드하게 한다.
- [x] 기존 설정 저장은 `windowBounds` 중심으로 정리하되 기존 설정 파일 호환은 유지한다.
- [x] `window-all-closed`, `activate`, always-on-top, 투명 배경 설정을 단일 창 기준으로 재정리한다.

### 2. React 앱 셸 재구성

- [x] `ui/src/main.jsx`를 XR Animator 단일 앱 셸로 교체한다.
- [x] 3D 뷰포트 영역, 오른쪽 디버그/컨트롤 패널, 하단 로그/상태 바 컴포넌트를 분리한다.
- [x] 기존 Control UI 문구와 흐름은 제거한다.
- [x] 상태 모델을 `engine`, `model`, `tracking`, `camera`, `background`, `logs` 단위로 정리한다.

### 3. Legacy Runtime 호환 레이어 추가

- [x] `ui/src/legacy-runtime/` 아래에 레거시 스크립트 로더를 만든다.
- [x] React 앱이 iframe으로 `XR_Animator.html`을 로드하고 START 자동 실행을 제어한다.
- [x] 레거시 엔진 DOM을 React 뷰포트 내부 컨테이너에 붙인다.
- [x] 레거시 전역 객체 준비 상태를 감지하고 React 상태로 반영한다.
- [x] 레거시 UI 요소는 CSS/DOM 패치와 SpeechBubble 런타임 비활성화로 숨긴다.

### 4. 기존 기능 포팅

- [x] VRM 로드는 기존 `SA_DragDropEMU()` 흐름을 React 명령에서 호출한다.
- [x] 카메라 선택은 기존 `MMD_SA_options.user_camera.streamer_mode.camera_preference` 흐름을 유지한다.
- [x] 트래킹 시작은 기존 `System._browser.camera.streamer_mode.init_mocap()` 흐름을 유지한다.
- [x] 표정 프리셋은 기존 `avatar-adapter.js`의 expression manager 탐색 로직을 React 명령 모듈로 옮긴다.
- [x] 배경 전환은 단일 창 body/뷰포트 배경 상태로 처리한다.
- [x] 로그/오류는 React 하단 상태 바에 누적 표시한다.

### 5. 테스트와 검증

- [x] 기존 `tests/e2e/somiland-app.spec.js`를 단일 창 기준으로 다시 작성한다.
- [x] `tests/e2e/avatar-mock.html` 의존성을 React 단일 앱 테스트용 mock runtime으로 교체하거나 축소한다.
- [x] `npm run build:ui`로 UI 빌드를 검증한다.
- [x] `npm run test:e2e`로 Electron 단일 창과 핵심 명령 흐름을 검증한다.
- [x] 실제 `npm run dev`로 창이 하나만 열리고, 3D 뷰포트와 디버그 패널이 표시되는지 확인한다.
- [x] `--background-debug` 모드로 실제 창을 표시하지 않고 Electron을 실행한다.
- [x] 백그라운드 상태에서 실제 `XR_Animator.html` 런타임을 로드하고 주요 버튼 조작 후 오류 로그를 검증한다.
- [x] 백그라운드 상태에서 모든 주요 UI 컨트롤을 직접 조작한다: VRM 선택 취소, Load Last disabled 상태, 카메라 새로고침/선택, 배경, 표정, 트래킹, Always on top, Capture view only, 캡처 해상도, Center, Reset Camera.

## 검토 섹션

- 사용자 승인 후 구현 진행.
- 1차에서는 레거시 엔진 내부 생성 로직을 제거하지 않았다.
- 1차에서는 패키지명, productName, appId 변경을 하지 않았다.
- 브라우저 호환성은 목표에서 제외했다.
- 기본 립싱크는 기존 XR Animator의 얼굴/입 트래킹 흐름을 유지하는 방식으로 포함했다. 마이크 기반 별도 립싱크 제어 UI는 1차 범위에 추가하지 않았다.
- 리뷰에서 나온 P1은 보완했다: 캡처 해상도 버튼은 실제 viewport 크기를 검증하고, 배경 적용은 viewport로 제한했으며, legacy click-through mutator는 shim 처리했고, Electron frame navigation/window-open allowlist를 추가했다.
- 백그라운드 디버깅 검증을 추가했다: 실제 앱 창은 표시하지 않고 hidden `BrowserWindow`에서 실제 XR 런타임을 로드한 뒤 배경, 표정, 트래킹, 카메라 리셋, 창 중앙 정렬, 캡처 해상도 조작을 자동 실행한다.
- React 셸에 CSP meta를 추가해 Electron의 Insecure Content-Security-Policy 경고를 제거했다. 레거시 iframe은 `eval` 의존이 있어 1차에서는 별도 CSP를 강제하지 않는다.
- 직접 조작 중 `Capture view only`에서 빠져나올 수 없는 문제가 발견되어 Escape로 캡처 모드를 종료하는 복구 경로를 추가했다.
- 직접 조작 중 레거시 iframe이 host window size를 되돌리는 문제가 발견되어 remote shim과 캡처 크기 안정화 재적용을 추가했다.
- 현재 macOS workArea에서 `Capture 1920x1080`은 1920 폭은 적용되지만 1080 높이는 제한될 수 있다. 이 경우 React 로그에 실제 적용된 capture size warning을 남긴다.
