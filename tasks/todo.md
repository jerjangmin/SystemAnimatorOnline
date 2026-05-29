# XR Animator React/Vite 리팩토링 계획

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

- [ ] VRM 파일 로드
- [ ] 3D 아바타 렌더링
- [ ] 마우스 드래그/줌/리셋 카메라 조작
- [ ] 웹캠 입력 선택
- [ ] 얼굴/상반신/손 트래킹
- [ ] 표정 프리셋과 기본 립싱크
- [ ] 투명/그린/블랙 배경 전환
- [ ] OBS 캡처용 단일 Electron 창 설정

## 구현 계획

### 1. Electron 단일 창 전환

- [ ] `electron/main.js`의 `avatarWindow`/`controlWindow` 이중 구조를 `appWindow` 단일 구조로 바꾼다.
- [ ] `createControlWindow()`와 `CONTROL_PRELOAD` 의존성을 제거한다.
- [ ] `appWindow`가 `ui-dist/index.html`을 로드하게 한다.
- [ ] 기존 설정 저장은 `windowBounds` 중심으로 정리하되 기존 설정 파일 호환은 유지한다.
- [ ] `window-all-closed`, `activate`, always-on-top, 투명 배경 설정을 단일 창 기준으로 재정리한다.

### 2. React 앱 셸 재구성

- [ ] `ui/src/main.jsx`를 XR Animator 단일 앱 셸로 교체한다.
- [ ] 3D 뷰포트 영역, 오른쪽 디버그/컨트롤 패널, 하단 로그/상태 바 컴포넌트를 분리한다.
- [ ] 기존 Control UI 문구와 흐름은 제거한다.
- [ ] 상태 모델을 `engine`, `model`, `tracking`, `camera`, `background`, `logs` 단위로 정리한다.

### 3. Legacy Runtime 호환 레이어 추가

- [ ] `ui/src/legacy-runtime/` 아래에 레거시 스크립트 로더를 만든다.
- [ ] React 앱이 `js/core.js`, `js/core_extra.js`, `SA_load_scripts()`, `SA_load_body()`, `SA_load_body2()`, `init()` 순서를 제어하게 한다.
- [ ] 레거시 엔진 DOM을 React 뷰포트 내부 컨테이너에 붙인다.
- [ ] 레거시 전역 객체 준비 상태를 감지하고 React 상태로 반영한다.
- [ ] 레거시 UI 요소는 CSS/DOM 패치로 숨긴다.

### 4. 기존 기능 포팅

- [ ] VRM 로드는 기존 `SA_DragDropEMU()` 흐름을 React 명령에서 호출한다.
- [ ] 카메라 선택은 기존 `MMD_SA_options.user_camera.streamer_mode.camera_preference` 흐름을 유지한다.
- [ ] 트래킹 시작은 기존 `System._browser.camera.streamer_mode.init_mocap()` 흐름을 유지한다.
- [ ] 표정 프리셋은 기존 `avatar-adapter.js`의 expression manager 탐색 로직을 React 명령 모듈로 옮긴다.
- [ ] 배경 전환은 단일 창 body/뷰포트 배경 상태로 처리한다.
- [ ] 로그/오류는 React 하단 상태 바에 누적 표시한다.

### 5. 테스트와 검증

- [ ] 기존 `tests/e2e/somiland-app.spec.js`를 단일 창 기준으로 다시 작성한다.
- [ ] `tests/e2e/avatar-mock.html` 의존성을 React 단일 앱 테스트용 mock runtime으로 교체하거나 축소한다.
- [ ] `npm run build:ui`로 UI 빌드를 검증한다.
- [ ] `npm run test:e2e`로 Electron 단일 창과 핵심 명령 흐름을 검증한다.
- [ ] 실제 `npm run dev`로 창이 하나만 열리고, 3D 뷰포트와 디버그 패널이 표시되는지 확인한다.

## 검토 섹션

- 구현 전 사용자 승인 필요.
- 1차에서는 레거시 엔진 내부 생성 로직을 제거하지 않는다.
- 1차에서는 패키지명, productName, appId 변경을 하지 않는다.
- 브라우저 호환성은 목표에서 제외한다.
