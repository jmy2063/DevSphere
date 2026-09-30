# 최종 시연 PC 점검표

## 필수 버전
- JDK 17 이상
- Node.js 20 이상 권장
- npm
- IntelliJ IDEA 권장

## 1. Core 엔진
- `verify-core.bat`
- 마지막 줄 `ALL CORE TESTS PASSED: 62` 확인
- `core-demo.bat` 실행 결과 확인

## 2. Backend
- `backend`를 IntelliJ Gradle project로 Open
- Gradle Sync 성공
- `test` 성공
- `bootRun` 성공
- `http://127.0.0.1:8080/api/health` 응답 확인

## 3. Frontend
- `cd frontend`
- `npm install`
- `npm run build`
- `npm run dev`
- 브라우저 화면 정상 표시 확인

## 4. 기본 데모
- `sample-spring-project.zip` 업로드
- Graph node/edge 표시 확인
- `OrderService.createOrder()` 선택
- LOCAL 분석
- FEATURE 분석
- SYSTEM 분석
- `3단계 비교` 확인
- Impact Path의 source path/line range 확인
- CRI / Evidence / Blast Radius 확인

## 5. GitHub PR 데모
- 업로드한 Source와 GitHub Repository branch의 파일 경로가 일치하는지 확인
- owner / repository / PR 번호 입력
- Private Repository인 경우 token 입력
- 여러 changed Method 결과 표시 확인

## 6. 네트워크 장애 대비
- GitHub API가 막히면 ZIP 기반 수동 Method 분석으로 시연
- AI API가 막혀도 deterministic explanation으로 시연 가능
- Neo4j가 없어도 in-memory graph로 core 기능 시연 가능

## 7. 발표 시 정확한 표현
- CRI = 장애 확률 X
- CRI = Graph evidence 기반 상대 변경 위험지수
- 넓은 범위 = 단순 Depth 증가 X
- 넓은 범위 = relation filtering + confidence decay + pruning + cycle protection + node cap
- AI = 영향 탐색 엔진 X / 근거 설명 계층 O

## 8. 최종 Hard Quality Gate
- `powershell -ExecutionPolicy Bypass -File .\verify-final-strict.ps1` 실행
- `=== STRICT QUALITY GATE PASSED ===` 확인
- 이 Gate가 통과하지 않으면 발표용 최종 승인 상태로 간주하지 않음
