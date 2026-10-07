# GitHub PR 작업 흐름 개선 · 2026-10-07

PR 주소를 붙여 넣어 변경 시작점을 찾고, 영향과 테스트 후보를 검토하는 흐름을 구현했습니다.
기존 ZIP 업로드 후 GitHub 영역에 PR 주소를 입력하면 됩니다. ZIP의 전체 커밋 SHA는 선택 입력입니다.

## 변경 내용

- `https://github.com/owner/repo/pull/번호` 및 files/commits/checks 주소를 해석합니다.
- 보고서에 base/head SHA, 선언한 ZIP 버전, 매핑 방향, 파일별 성공·실패 이유를 표시합니다.
- HEAD는 NEW 줄, BASE는 OLD 줄을 사용합니다. BASE의 rename은 이전 경로를 사용합니다.
- 선언 SHA 불일치는 분석을 중단합니다. 미입력은 HEAD 가정을 경고합니다.
- 여러 소스 경로가 매칭되면 경로 중복으로 표시합니다. patch가 없거나 변경 줄이 메소드 밖이면 파일의 클래스들을 후보로 표시합니다.
- 영향 후보는 Node ID로 합치고 변경 시작점은 제외합니다. 테스트는 가까운 경로, 높은 신뢰도 순으로 정렬합니다.
- PR 파일을 읽은 뒤 base/head를 재조회합니다. 읽는 동안 버전이 바뀌면 재분석을 요청합니다.
- 새 ZIP을 업로드하면 기존 SHA 선언을 초기화합니다. Token은 요청 헤더로만 전달하며 결과 JSON에 포함하지 않습니다.
- 기존 `github-pr-impact` / `github-commit-impact` 응답은 유지하고 새 보고서 API를 추가했습니다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| Gradle 실제 의존성 test + bootJar | 22 tests, failures/errors/skips 0 |
| 기존 CoreTestSuite | 62 assertions 통과 |
| 합성 fixture | 30/30 |
| 고정 공식 Spring 소스 검증 | 30/30 |
| 실제 frontend TypeScript + Vite 빌드 | 통과 |
| dependency stub semantic 검사 | backend/frontend 통과 |
| PR URL 검증 | 정상 주소 및 호스트·인증정보·경로·번호 거부 통과 |
| Mock API 브라우저 | 파일 검색, 0개 시작점 보고서, 토큰 없는 JSON 저장, 모바일, 실패 시 이전 결과 제거 통과 |
| 실제 HTTP/브라우저 | 공식 예제 3개 ZIP, 기존 커밋 API, 새 커밋 보고서/불일치 차단 통과 |
| 실제 GitHub PR 브라우저 | Petclinic #2672, 변경 4파일, 시작점 6개, 중복 제거 영향 144개, 테스트 후보 12개 |

실제 PR 검증은 다음 고정 HEAD를 `git archive`한 ZIP으로 수행했습니다.

- PR: https://github.com/spring-projects/spring-petclinic/pull/2672
- HEAD: `f9df3a1ee82d5b6a8b6867a1bac1df5523bf5259`
- BASE: `818c4136ea971c21674525f9053de0d9c7ad8cfe`
- 실제 서버·브라우저 응답을 사용했으며 API interception을 사용하지 않았습니다.
- 데스크톱 1440px, 모바일 390px에서 브라우저 오류 및 가로 넘침이 없었습니다.

## 재현

JDK 17로 `backend/gradlew.bat -p backend test bootJar --no-daemon`을 실행하고 frontend에서 `npm.cmd run build`를 실행합니다.
`python tools/prepare-public-benchmarks.py` 다음 `python tools/prepare-pr-smoke.py`로 ZIP을 준비합니다.
백엔드 8080과 Vite 5173을 시작하고 Playwright/Chrome이 준비된 환경에서 아래 스크립트를 실행합니다.
외부 AI/Neo4j가 필요 없는 검증 환경을 사용합니다.

```text
node tools/frontend-unit.cjs
node tools/ui-smoke.cjs
node tools/live-server-smoke.cjs
node tools/github-report-smoke.cjs
```

출력 JSON 및 화면 캡처는 Git에서 제외된 `benchmark-output/`에 저장됩니다.

## 해석 범위

ZIP SHA는 사용자 선언입니다. 제품이 ZIP 내용과 GitHub 커밋 파일을 비교한 것은 아닙니다.
최고 CRI는 개별 시작점 점수의 최댓값이며 PR 전체 위험도나 장애 확률을 의미하지 않습니다.
추천 테스트는 정적 그래프의 후보이고 실제 테스트 실행·커버리지 검증 결과가 아닙니다.
144개 영향 후보는 전체 영향의 정답 검증 수치가 아닙니다. 공식 소스 30개 항목 역시 전체 precision/recall을 증명하지 않습니다.
Merge commit의 BASE는 첫 번째 부모입니다. 기존 목록 API의 버전 가정은 유지되므로 신규 흐름에서는 보고서 API를 사용합니다.
이번 단계는 소스·JAR·frontend 빌드까지이며 Windows 설치 프로그램은 재생성하지 않았습니다.
