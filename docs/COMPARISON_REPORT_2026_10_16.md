# 저장 결과 비교 HTML 보고서

검증일: 2026-10-16. 두 분석 결과의 차이를 화면 밖에서도 검토·공유할 수 있도록 독립 HTML 저장 기능을 추가했습니다.

## 사용 방법

1. `저장된 JSON 검토·비교`에서 기준·비교 결과를 불러오거나 현재 결과를 보관합니다.
2. 필요한 프로젝트 비교 키를 지정하고 비교할 분석 범위를 선택합니다.
3. 증감 결과가 표시되면 `비교 HTML 보고서 저장`을 누릅니다.
4. 다운로드한 `DevSphere_comparison_FEATURE.html` 등의 파일을 브라우저에서 엽니다. 서버나 네트워크 연결이 필요하지 않습니다.

비교 조건이 맞지 않으면 저장 버튼을 표시하지 않습니다. 저장 시에도 같은 비교 조건으로 증감을 다시 계산하며, 화면에서 계산한 숫자를 별도로 전달하지 않습니다. 파일을 읽는 중에는 저장 버튼이 비활성화됩니다.

## 보고서에 남기는 내용

- 선택한 분석 범위·깊이·시작점과 기준 → 비교 방향
- 영향 후보 추가·제외·근거 및 위치 변경·유지 수, 테스트 후보 증감, CRI 차이
- 기준·비교 파일 이름, 프로젝트 ID, 생성·불러온 시각, 사용자 프로젝트 비교 키, 그래프 크기
- GitHub 보고서의 저장소·변경 대상, BASE/HEAD, 매핑 방향·revision 상태·Java 소스 검증 기록
- 추가·제외된 영향 및 테스트 후보 전체와 이전·이후 위치·타입·이름·ID·깊이·신뢰도·관계·방향

화면에서 처음 50개로 제한한 근거·위치 변경도 HTML에는 모두 포함합니다. 유지된 후보는 개수만 기록하며 원본 그래프와 대표 경로 전체는 포함하지 않습니다. 이 HTML을 JSON 불러오기로 복원할 수 없으므로 재비교할 때 사용할 양쪽 원본 JSON도 보관해야 합니다.

프로젝트 키와 소스 검증 상태는 원본 파일의 기록입니다. HTML 저장은 파일 출처·변조 여부·소스·분석기 버전을 재검증하지 않습니다. CRI는 상대 위험지수이며 장애 확률이 아닙니다. 후보 증감은 실제 기능 변경이나 테스트 성공 여부의 판정이 아닙니다.

보고서에는 스크립트·외부 자산·외부 링크·원본 JSON을 넣지 않습니다. 사용자 텍스트를 이스케이프하고 CSP를 적용합니다. 기본 분석 HTML과 모바일·인쇄 스타일을 공유합니다.

## 검증 결과

- 프런트엔드 strict 타입 검사 및 production 빌드 통과.
- backend/frontend semantic 검사 통과. 이번 변경은 프런트엔드와 검증 도구에 한정됩니다.
- 기존 분석 HTML 단위 및 오프라인 브라우저 회귀 검사 통과.
- 비교 HTML 단위 검사: 추가 61개·제외 61개·변경 62개에서 마지막 후보까지 포함, 이전·이후 근거, 선택 범위, PR의 서로 다른 HEAD 기록, 사용자 텍스트 이스케이프 확인. 프로젝트 키 불일치·존재하지 않는 분석·모호한 식별자는 저장 거부.
- 저장 JSON 브라우저 검사: 실제 버튼으로 내려받은 HTML을 오프라인으로 열어 추가/제외/변경 각 1개와 CRI 42→50 확인. 양쪽 파일 정보·이전/이후 위치·활성 콘텐츠 없음·네트워크 요청 없음·390px 모바일 폭 검사 통과.
- 이전 단계에서 실제 서버로 생성한 Petclinic JSON 두 파일을 사용해 비교 HTML을 생성하고 오프라인으로 열었습니다. 241개 노드, FEATURE 영향 후보 41개 유지, 증감 0개, CRI 82→82를 확인했습니다. 이번 단계에서 해당 분석을 서버로 재실행한 것은 아닙니다.

반복 실행:

```powershell
node tools/report-unit.cjs
node tools/snapshot-unit.cjs
node tools/snapshot-report-unit.cjs
$env:BROWSER_CHANNEL='chromium'
node tools/report-browser-smoke.cjs
node tools/run-ui-smoke.cjs snapshot-browser-smoke.cjs
npm.cmd --prefix frontend run build
```

CI 단위 검사에 비교 HTML 검사를 추가했고 기존 저장 JSON 브라우저 검사에서 다운로드까지 확인합니다. 원격 Actions, 배포, 설치본 재생성은 이번 실행에 포함하지 않았습니다.

로컬 검증 산출물은 Git에서 제외된 `benchmark-output/saved-comparison-report.html`, `saved-comparison-desktop.png`, `saved-comparison-mobile.png`, `live-saved-comparison-report.html`에 있습니다.
