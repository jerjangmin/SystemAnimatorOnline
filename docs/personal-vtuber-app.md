# Somiland VTuber 개인용 앱 메모

이 브랜치는 원본 XR Animator/System Animator Online을 개인용 macOS VTuber 앱으로 쓰기 위한 리팩토링 작업이다. 기존 엔진은 유지하되, 화면에 보이는 레거시 UI는 숨기고 새 컨트롤 UI에서 필요한 기능만 조작한다.

## 목표

- macOS Electron `.app`로 실행한다.
- OBS에는 아바타 창만 캡처되도록 `아바타 창`과 `컨트롤 창`을 분리한다.
- 컨트롤 창은 React/Vite 기반의 밝고 간단한 한국어 UI로 제공한다.
- VRM 0.x/VRM 1.0 모델을 중심으로 사용한다.
- 웹캠 기반 얼굴, 상반신, 손 트래킹 프리셋만 노출한다.
- OBS 캡처를 위해 투명 배경, 크로마 그린, 검정 배경을 전환할 수 있게 한다.
- 마지막 VRM, 카메라, 트래킹 모드, 창 크기, 배경 설정을 별도 JSON으로 저장한다.

## 창 구조

- `Somiland VTuber Avatar`
  - 투명 프레임리스 창이다.
  - XR Animator 엔진과 VRM 렌더링이 동작한다.
  - OBS에서 이 창만 캡처한다.
  - 기존 퀵메뉴, 툴팁, 리사이즈 핸들 등 레거시 UI는 CSS로 숨긴다.
- `Somiland VTuber Control`
  - React 컨트롤 창이다.
  - 모델, 카메라, 트래킹, 표정/포즈, OBS 배경, 창 설정을 조작한다.
  - Electron IPC 어댑터를 통해서만 아바타 창에 명령을 전달한다.

## 1차로 숨기는 기능

다음 기능은 1차 앱 UI에서 노출하지 않는다. 단, XR Animator 내부 의존성이 있어 즉시 삭제하지 않는다.

- AR/WebXR
- MMD 모델/모션/데모 UI
- RPG/게임/전투 데모
- 음악 비주얼라이저/BPM
- 멀티플레이/PeerJS 데모
- 월페이퍼/desktop gadget 기능
- IE/XUL/NW.js 레거시 실행 모드

## 실행

```bash
npm install
npm run app
```

`npm run app`은 먼저 React UI를 `ui-dist/`로 빌드한 뒤 Electron을 실행한다.

## macOS 앱 패키징

```bash
npm run package:mac
```

산출물은 `dist/mac*/Somiland VTuber.app` 아래에 생성된다. 현재는 개발/개인용 패키징이며 notarization은 설정하지 않았다.

## E2E 검증

```bash
npm run test:e2e
```

E2E는 하드웨어 의존성을 줄이기 위해 mock 아바타 창으로 실행한다. 자동 검증 범위는 다음과 같다.

- 아바타 창과 컨트롤 창이 함께 뜨는지
- React 컨트롤 UI가 렌더링되는지
- 트래킹/OBS 배경/표정 명령이 IPC 어댑터를 통해 아바타 창까지 전달되는지

실제 카메라 권한, 실제 VRM 렌더링, OBS 캡처 상태는 수동으로 확인해야 한다.

## 설정 저장 위치

Electron `app.getPath('userData')` 아래의 다음 파일에 저장된다.

```text
somiland-vtuber-settings.json
```

저장 항목:

- `lastVrmPath`
- `cameraDeviceId`
- `cameraLabel`
- `trackingMode`
- `backgroundMode`
- `transparentBackground`
- `alwaysOnTop`
- `avatarWindowBounds`
- `controlWindowBounds`

컨트롤 창의 `창` 섹션에서 아바타 창을 720p, Full HD, 세로 9:16 크기로 맞추거나 화면 중앙으로 이동할 수 있다.

## OBS 사용

1. `npm run app` 또는 패키징된 앱을 실행한다.
2. OBS에서 `Somiland VTuber Avatar` 창을 캡처한다.
3. `Somiland VTuber Control` 창은 캡처하지 않는다.
4. `OBS` 섹션에서 `투명`을 기본으로 사용한다.
5. OBS가 알파를 제대로 잡지 못하면 `크로마 그린`으로 바꾸고 Chroma Key 필터를 적용한다.

## 라이선스 주의

원본 README의 일반 라이선스는 `CC BY-NC-SA 4.0`이다. 개인용 수정/사용은 이 목표와 맞지만, 수정본 공개 배포나 상업적 재사용은 별도 검토가 필요하다.

또한 원본 번들에는 제3자 모델, 모션, 배경, 사운드가 섞여 있다. 방송/수익화에는 본인이 권리를 가진 VRM 모델과 에셋을 사용하는 것이 안전하다.
