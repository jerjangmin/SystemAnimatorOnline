# Somiland VTuber 개인용 앱 메모

이 브랜치는 원본 XR Animator/System Animator Online을 개인용 macOS VTuber 앱으로 쓰기 위한 보수적 리팩토링 작업이다.

## 목표

- macOS Electron `.app`로 실행한다.
- VRM 0.x/VRM 1.0 모델을 중심으로 사용한다.
- 웹캠 기반 얼굴, 상반신, 손 트래킹 프리셋만 한국어 런처에서 노출한다.
- OBS 캡처를 위해 투명 배경, 크로마 그린, 검정 배경을 전환할 수 있게 한다.
- 마지막 VRM, 카메라, 트래킹 모드, 창 크기, 배경 설정을 별도 JSON으로 저장한다.

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

## macOS 앱 패키징

```bash
npm run package:mac
```

산출물은 `dist/mac*/Somiland VTuber.app` 아래에 생성된다. 현재는 개발/개인용 패키징이며 notarization은 설정하지 않았다.

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
- `windowBounds`

## OBS 사용

1. `npm run app` 또는 패키징된 앱을 실행한다.
2. `OBS 배경`에서 `투명`을 기본으로 사용한다.
3. OBS가 알파를 제대로 잡지 못하면 `크로마 그린`으로 바꾸고 Chroma Key 필터를 적용한다.
4. 컨트롤 패널은 우측 상단 `−` 버튼으로 접을 수 있다.

## 라이선스 주의

원본 README의 일반 라이선스는 `CC BY-NC-SA 4.0`이다. 개인용 수정/사용은 이 목표와 맞지만, 수정본 공개 배포나 상업적 재사용은 별도 검토가 필요하다.

또한 원본 번들에는 제3자 모델, 모션, 배경, 사운드가 섞여 있다. 방송/수익화에는 본인이 권리를 가진 VRM 모델과 에셋을 사용하는 것이 안전하다.
