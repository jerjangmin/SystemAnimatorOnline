# Lessons

- 사용자가 아키텍처 목표를 정교하게 잡으라고 요청하면 바로 구현하지 말고 `grill-me` 방식으로 핵심 결정을 하나씩 확정한 뒤 계획을 제시한다.
- 디버깅 UI의 로그는 단순 문자열만 남기지 말고 error stack, source, detail, runtime snapshot을 같이 보존해야 실제 원인 추적이 가능하다.
- 사용자가 실제 앱 창을 띄우지 말고 디버깅하라고 하면 Electron에 명시적인 background-debug 실행 경로를 두고 hidden `BrowserWindow`에서 Playwright 조작과 로그 검증을 수행한다.
- 백그라운드 디버깅 테스트는 React 로그 패널만 보지 말고 Playwright `pageerror`와 `console.error/warning`도 함께 수집해서 경고와 런타임 오류를 분리한다.
- OBS/capture 모드처럼 UI를 숨기는 기능에는 키보드나 별도 경로로 빠져나올 수 있는 복구 동작을 반드시 검증한다.
- 레거시 iframe을 React shell에 임베드할 때는 iframe이 `remote.getCurrentWindow()`로 host window size/position을 바꾸지 못하게 막고, 창 크기 변경은 React/Electron IPC 한 곳에서만 처리한다.
- 일반 앱으로 쓰는 Electron 창은 투명/항상위 기본값을 피하고 native frame/titlebar를 유지해야 한다. OBS용 capture 모드가 있어도 창 이동·닫기·최소화는 macOS 표준 UI로 가능해야 한다.
