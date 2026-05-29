# Lessons

- 사용자가 아키텍처 목표를 정교하게 잡으라고 요청하면 바로 구현하지 말고 `grill-me` 방식으로 핵심 결정을 하나씩 확정한 뒤 계획을 제시한다.
- 디버깅 UI의 로그는 단순 문자열만 남기지 말고 error stack, source, detail, runtime snapshot을 같이 보존해야 실제 원인 추적이 가능하다.
- 사용자가 실제 앱 창을 띄우지 말고 디버깅하라고 하면 Electron에 명시적인 background-debug 실행 경로를 두고 hidden `BrowserWindow`에서 Playwright 조작과 로그 검증을 수행한다.
- 백그라운드 디버깅 테스트는 React 로그 패널만 보지 말고 Playwright `pageerror`와 `console.error/warning`도 함께 수집해서 경고와 런타임 오류를 분리한다.
