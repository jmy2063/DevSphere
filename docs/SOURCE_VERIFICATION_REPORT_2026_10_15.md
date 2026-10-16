# Java 소스 버전 자동 판별과 브라우저 회귀 검사 · 2026-10-15

PR 주소를 입력할 때 ZIP의 커밋 SHA를 몰라도 분석 대상 Java 전체를 비교해 분석 방향을 결정합니다.
기존 검증 구현에 자동 BASE 판별, 불일치 복구 경로, 브라우저 CI 실행을 추가했습니다.

## 사용 흐름

1. Java/Spring 프로젝트 ZIP을 업로드합니다.
2. GitHub PR 주소를 붙여 넣고 분석합니다. Java 내용 검증은 기본으로 켜져 있습니다.
3. HEAD와 일치하면 NEW 줄로 분석합니다. 다르면 BASE도 비교하고, BASE와 일치하면 OLD 줄로 분석합니다.
4. 양쪽과 다르거나 전체 검증이 불가능하면 영향을 계산하지 않고 이유를 표시합니다.
5. 불일치 보고서의 HEAD/BASE 원본 ZIP 다운로드 링크로 해당 소스를 받아 다시 업로드할 수 있습니다.

고급 옵션에 SHA를 입력하면 해당 버전만 검증하며 다른 쪽으로 바꾸지 않습니다.
SHA 입력 없이 BASE가 확인되어도 `declaredRevision`은 빈 값으로 유지합니다.
같은 Java 소스를 가진 커밋이 여러 개일 수 있으므로, HEAD 우선 선택을 특정 커밋의 유일한 식별로 해석하지 않습니다.

## 검증 범위

업로드 시 분석기와 같은 선택 규칙으로 Java 파일 해시를 보관합니다. 생성 폴더는 제외하며,
노드를 만들지 않는 `package-info.java` 등은 포함합니다. ZIP 최상위 포장 폴더는 유일하게 결정되는 경우 제거합니다.
저장소 전체의 분석 대상 Java와 비교하므로 부분 소스만 담은 ZIP을 전체 일치로 인정하지 않습니다.

파일 내용 변경·누락·추가를 구분하고 원본 바이트를 비교합니다. 줄바꿈 차이도 불일치입니다.
설정·리소스·외부 의존성·실행 환경은 범위 밖입니다. 전체 트리를 얻지 못했거나,
모호한 폴더 경로·서브모듈·지원하지 않는 Java 항목 때문에 완전한 비교가 불가능하면 검증 완료로 표시하지 않습니다.
해시는 그래프와 같은 최대 20개 레지스트리 항목에 보관하며 삭제·퇴출 시 함께 제거합니다.

Git 트리 조회와 blob 해시 형식은 [GitHub Git trees 문서](https://docs.github.com/en/rest/git/trees)와
[Git 객체 문서](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)를 따릅니다.

## 이번 실행에서 확인한 결과

| 검사 | 결과 |
|---|---|
| 실제 Gradle 의존성 기반 test + bootJar | 35 tests, failures/errors/skips 0 |
| 기존 핵심 회귀 검사 | 62 assertions 통과 |
| 합성 fixture | 30/30 |
| 고정 공식 Spring 소스 항목 | 30/30, 3개 프로젝트 |
| 실제 frontend TypeScript + Vite 빌드 | 통과 |
| backend/frontend semantic 검사 | 통과 |
| PR URL 검증 | 통과 |
| Chromium 브라우저 회귀 실행기 | 통과, 자체 Vite 시작·종료 |
| 실제 PR HEAD ZIP, SHA 미입력 | Java 47개 일치, HEAD 선택, 시작점 6개 |
| 실제 PR BASE ZIP, SHA 미입력 | Java 50개 일치, BASE 선택, 시작점 5개 |
| 최상위 폴더로 감싼 HEAD ZIP | Java 47개 일치, 포장 폴더 제거 |
| 수정한 ZIP, SHA 미입력 | 내용 변경 1개·누락 1개·추가 1개 구분, 양쪽 불일치로 분석 중단 |
| 실제 PR 데스크톱·모바일 | 1440px/390px, 브라우저 오류·가로 넘침 없음 |

실제 PR은 [Spring Petclinic #2672](https://github.com/spring-projects/spring-petclinic/pull/2672)입니다.
HEAD `f9df3a1ee82d5b6a8b6867a1bac1df5523bf5259`, BASE `818c4136ea971c21674525f9053de0d9c7ad8cfe`를 고정한 ZIP을 사용했습니다.
실제 PR 검사는 응답을 가로채지 않았습니다. 별도의 UI 회귀 검사는 고정 API 응답을 사용하므로 백엔드 통합 검증과 구분합니다.
이 수치는 소스 일치와 흐름 검증이며, 영향 후보 전체의 정확도나 CRI 보정 결과를 의미하지 않습니다.

## 브라우저 회귀 검사 재현

```text
cd frontend
npm ci --no-audit --no-fund
npx playwright install chromium
cd ..
```

PowerShell:

```powershell
$env:BROWSER_CHANNEL='chromium'
node tools/run-ui-smoke.cjs
```

검사 실행기는 빈 로컬 포트에 Vite를 시작하고, 최대 120초 동안 브라우저 검사를 실행한 뒤 자신이 시작한 자식 프로세스를 종료합니다.
Playwright `1.64.1`은 dev dependency와 lockfile에 고정했습니다.
CI는 [공식 Playwright 안내](https://playwright.dev/docs/ci)에 따라 Chromium과 Linux 의존성을 설치합니다.
`.github/workflows/ci.yml`에 같은 실행기를 연결하고 화면 캡처를 artifact로 보관하도록 했습니다.
이번에 원격 Actions를 실행하거나 배포하지는 않았으며, Windows에서 해당 Chromium 실행 경로를 검증했습니다.

실제 PR 재현은 `python tools/prepare-public-benchmarks.py`, `python tools/prepare-pr-smoke.py`로 ZIP을 준비하고,
외부 AI·Neo4j가 없는 검증 환경에서 backend 8080과 frontend 5173을 시작한 뒤 아래를 실행합니다.

```powershell
$env:NODE_PATH=(Resolve-Path 'frontend/node_modules').Path
node tools/source-verification-smoke.cjs
node tools/github-report-smoke.cjs
```

JSON과 화면 캡처는 Git에서 제외된 `benchmark-output/`에 남습니다.
기존 제출 체크리스트의 독립 정답 검토·설치본 재빌드·발표 PC 시연 완료를 이번 결과로 대체하지 않습니다.
