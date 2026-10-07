# DevSphere 개선 기록 — 2026-10-06

## 변경 결과

1. 3개 합성 Java fixture와 30개 정답 시나리오를 추가했습니다. AST부터 영향 평가까지 반복 실행하고 TSV로 오탐/누락을 기록합니다. CI에 평가 실행을 추가했습니다.
2. 동일한 표시 이름을 가진 영향 노드를 Ground Truth에 입력하면 첫 번째 노드를 임의로 고르던 문제를 수정했습니다. 모호한 이름은 사용할 수 있는 Node ID와 함께 오류로 반환합니다. 정확한 ID가 표시 이름보다 우선합니다.
3. 분석 결과를 넓은 독립 영역에 표시합니다. 테스트 후보와 근거 위치를 먼저 보여주고, 전체 영향 후보를 검색/유형 필터/더 보기로 탐색할 수 있습니다. 평가에 사용할 Node ID를 복사할 수 있습니다.
4. 대표 근거 경로를 검색하고 모두 펼칠 수 있습니다. 경로 단계의 관계/방향/전체 파일 경로/줄 범위를 표시합니다. 선택한 경로는 그래프에서 별도로 볼 수 있으며 요약 노드 수 제한을 적용하지 않습니다. CLASS도 그래프에 표시합니다.
5. 그래프의 표시 노드 수와 전체 노드 수를 구분합니다. 그래프 노드는 키보드로 선택할 수 있습니다.
6. 재분석 실패 시 이전 결과를 지웁니다. 분석 중에는 변경 시작점/범위 변경과 추가 업로드를 막아 결과와 입력이 어긋나는 것을 줄였습니다.

CRI 가중치는 이번에 변경하지 않았습니다. 실제 위험 순위 정답 없이 가중치를 조정하는 대신,
근거 신뢰도가 측정된 정확도가 아니라는 점과 테스트 후보가 커버리지를 보장하지 않는다는 점을 화면에 표시합니다.

## 실행 검증

- 기존 CoreTestSuite: 62 assertions PASS, Java 17 타깃 컴파일.
- 새 평가 회귀: 모호한 이름 거부 / 정확한 ID 평가 / 미탐 대상 보존 PASS. 수정 전에는 모호한 이름 테스트 실패를 확인했습니다.
- 합성 영향 평가: 3 fixtures / 30 scenarios, macro Precision 1.0000 / Recall 1.0000 / F1 1.0000, FP/FN이 있는 시나리오 0개.
- Backend 전체 main 소스: 기존 dependency API stub 기반 semantic compile PASS.
- Frontend: 실제 npm 의존성으로 strict typecheck 및 Vite production build PASS.
- 현재 소스와 추가 평가 파일의 SHA256 manifest를 갱신하고 로컬 파일 무결성을 확인했습니다. 이는 새 설치 프로그램의 릴리스 승인을 의미하지 않습니다.
- Chrome headless: 전체 후보 펼치기 / 검색 / 유형 필터 / Node ID 복사 / 15개 METHOD가 포함된 전체 경로 표시 / 경로 밖 연결 숨김 / 390px 모바일 가로 넘침 / 재분석 오류 시 이전 결과 제거 PASS. API는 고정 응답으로 대체했습니다.

이 결과는 실제 Spring 서비스의 정확도, 실서버 E2E, 실제 GitHub 연결, 실제 의존성을 사용한 Backend Gradle test/bootJar 통과를 의미하지 않습니다.
이번 로컬 검증에서는 Gradle CLI가 없어 Backend 의존성 빌드는 실행하지 않았습니다.
설치 프로그램과 기존 EXE는 다시 빌드하지 않았습니다.

## 재실행

```powershell
.\verify-benchmark.ps1
cd frontend
npm ci
npm run build
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

브라우저 검증은 별도 터미널의 프로젝트 루트에서 `node tools/ui-smoke.cjs`로 실행합니다.
Node에서 `playwright` 패키지를 찾을 수 있어야 하며 로컬 Chrome이 필요합니다.
Codex에서 제공하는 Playwright를 사용하려면 bundled node_modules 경로를 NODE_PATH에 지정합니다.
다른 브라우저 설치를 사용할 때는 `BROWSER_CHANNEL`, 다른 프런트엔드 주소는 `UI_URL`로 지정합니다.
스크린샷과 평가 출력은 git에 포함하지 않는 `benchmark-output/`에 생성됩니다.

## 다음 평가 데이터

실제 Spring 프로젝트 2~3개에서 버전이 고정된 변경 사례를 수집하고,
API/DB/메소드/테스트 영향과 사람이 정한 위험 순위를 독립적으로 기록합니다.
그 결과에 따라 타입/호출 해석과 테스트 연결을 보완한 뒤 CRI 보정을 판단합니다.
