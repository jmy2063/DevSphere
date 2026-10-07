# DevSphere AX 5.0 — Zero-Known-Defect Quality-Hardened Release

**Software Knowledge Graph + AI Agent 기반 엔터프라이즈 SW 변경 리스크 분석 플랫폼**

DevSphere AX는 Java/Spring Boot 프로젝트와 GitHub Commit/PR 변경정보를 분석하여 **변경 Method → Software Knowledge Graph → LOCAL/FEATURE/SYSTEM 영향 범위 → Change Risk Index(CRI) → Evidence Path → AI 설명**으로 연결하는 변경 리스크 분석 플랫폼입니다.

> 핵심 원칙: **Graph가 영향 사실과 경로를 찾고, AI는 그 근거를 설명합니다.**

## 개발 중 개선 사항 (2026-10-06)

전체 영향 후보 검색/유형 필터, 테스트 근거 위치, Node ID 복사, 근거 경로별 그래프 탐색을 추가했습니다.
3개 합성 fixture의 30개 시나리오 평가는 `verify-benchmark.ps1` 또는 `bash verify-benchmark.sh`로 반복 실행합니다.
합성 평가 수치는 실제 서비스의 정확도를 의미하지 않습니다.
변경 내용과 검증 범위는 `docs/IMPROVEMENT_REPORT_2026_10_06.md`, 데이터 설명은 `benchmarks/README.md`를 참고합니다.

후속 개선에서는 공식 Spring 예제 3개를 고정한 30개 소스 검증 항목을 추가하고,
Spring Data 저장소·상속 메소드·패키지 타입 해석과 Windows UTF-8 분석을 보완했습니다.
실제 HTTP/브라우저/GitHub 커밋 검증과 빌드 결과는 `docs/IMPROVEMENT_REPORT_2026_10_07.md`를 참고합니다.

PR 주소를 붙여 넣으면 base/head, 파일별 매핑 사유, 중복 제거 영향과 테스트 후보를 함께 표시합니다.
ZIP 커밋 SHA가 base/head와 다르면 분석을 중단하며, SHA는 사용자 선언으로 표시합니다.
실제 Petclinic PR 검증과 사용법은 `docs/PR_WORKFLOW_REPORT_2026_10_07.md`를 참고합니다.

## 4.0에서 강화된 품질 항목

- Core regression **62 assertions PASS**
- Backend 전체 Java source syntax parse PASS
- Backend 전체 main source **dependency API stub 기반 semantic compile PASS**
- Frontend TS/TSX syntax parse PASS
- Frontend **strict semantic typecheck PASS**
- Java 17 `--release 17` 호환 검증
- `this.method()` receiver 해석 보강
- local variable receiver method call 해석 보강
- Generic type 내부 domain dependency 보존 (`List<OrderEntity>` 등)
- overload Method를 parameter signature로 구분 표시
- GitHub Unified Diff OLD/NEW line 분리
- PR rename/base/head Method 매핑 보강
- GitHub API response bounded-read / timeout / pagination
- AI response bounded-read + 최소 Subgraph 전송 + deterministic fallback
- Graph data defensive copy / confidence validation
- Neo4j project identity 격리 + 삭제/eviction 시 best-effort cleanup
- ZIP Slip / duplicate path / expanded-size / single-file-size / path-depth 제한
- Backend 기본 bind 주소 `127.0.0.1`
- Method 노드를 포함하는 균형형 Knowledge Graph UI
- 발표 PC용 JDK-only standalone HTML fallback demo
- `verify-final-strict.ps1` 최종 Hard Quality Gate 추가

## 핵심 기능

- Java 17 / Spring Boot AST static analysis
- Controller / Service / Repository / Entity / Method / API / Test / Table 추출
- Method start/end line 및 readable signature
- Software Knowledge Graph
- Method Call / Dependency / API / Entity / Table / Test 관계
- LOCAL(2-hop) / FEATURE(4-hop) / SYSTEM(6-hop)
- Confidence-weighted traversal + cycle guard + hard node cap + pruning
- UPSTREAM / DOWNSTREAM
- source path + line range Impact Path
- CRI 0–100 + LOW / MEDIUM / HIGH / CRITICAL
- CRI Breakdown: Blast Radius / Critical Surface / Propagation / Coupling / Test Gap
- Evidence Confidence
- LOCAL / FEATURE / SYSTEM 3단계 비교
- GitHub PR/Commit Diff → 변경 Method 자동 매핑
- Ground Truth Precision / Recall / F1 / Top-k 평가
- Grounded AI explanation + deterministic fallback
- Optional Neo4j persistence
- React + TypeScript Dashboard
- JSON report export


## Windows 설치형 실행 파일

최종 배포본에는 `DevSphere_AX_Setup.exe`가 함께 제공됩니다. 설치 후 `DevSphere_AX.exe` 런처에서 Standalone Demo, Full Web 실행, Core Verification, Strict Quality Gate를 선택할 수 있습니다. 상세 내용은 `docs/WINDOWS_INSTALLER.md`를 참고합니다.

## 가장 먼저 실행

Windows:

```bat
verify-core.bat
```

macOS/Linux:

```bash
./verify-core.sh
```

정상 기준:

```text
ALL CORE TESTS PASSED: 62
```

JDK-only 발표 안전 데모:

```bat
report-demo.bat
```

출력: `demo-output/DevSphere_AX_Report.html`

## 정식 Web 실행

### Backend
JDK 17+에서 IntelliJ IDEA로 `backend`를 Gradle Project로 열고:

```text
Gradle Sync → test → bootRun
```

별도 Gradle 설치 없이 포함된 Wrapper로 빌드할 수 있습니다. JDK 17을 설치하고 JAVA_HOME에 지정하세요.
처음 실행할 때 Gradle 배포본과 Maven 의존성을 다운로드합니다.

```powershell
cd backend
.\gradlew.bat clean test bootJar --no-daemon
.\gradlew.bat bootRun --no-daemon
```

Windows 실행 스크립트:

```bat
run-backend.bat
```

기본 Backend: `http://127.0.0.1:8080`

### Frontend
Node.js 20+:

```bash
cd frontend
npm install
npm run typecheck
npm run build
npm run dev
```

필요 시 `.env`:

```env
VITE_API_URL=http://127.0.0.1:8080
```

## 최종 발표 PC Hard Quality Gate

의존성까지 설치한 최종 PC에서는 다음을 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\verify-final-strict.ps1
```

성공 기준:

```text
=== STRICT QUALITY GATE PASSED ===
```

이 Strict Gate는 Core regression, semantic checks, standalone smoke demo, Backend `clean test bootJar`, Frontend `typecheck + build`, 최종 산출물 존재를 모두 확인합니다.

## 시연 권장 흐름

1. `sample-spring-project.zip` 업로드
2. `OrderService.createOrder()` 선택
3. `3단계 비교` → LOCAL / FEATURE / SYSTEM 차이 확인
4. SYSTEM 분석 → Payment / Inventory / Audit / Repository / Entity / Table / API / Test 광역 경로 확인
5. Impact Path에서 실제 파일/라인 확인
6. CRI Breakdown + Evidence Confidence 설명
7. GitHub PR/Commit 연결 시 changed line → changed Method 자동 분석
8. Ground Truth 평가 또는 JSON Export

## CRI의 정확한 의미

CRI는 **장애 발생 확률이 아닙니다.**
Software Knowledge Graph에서 관찰된 변경 범위, 중요 영향 표면, 전파 깊이, 결합도, 테스트 공백을 조합한 **상대 변경 위험지수**입니다.

## 품질 표현

DevSphere AX 5.0은 **현재 정의한 MVP 및 실행 검증 범위에서 알려진 결함이 남지 않도록 반복 검증한 Zero-Known-Defect Release Candidate**를 목표로 합니다.

모든 OS·네트워크·외부 API·미래 입력까지 포함한 수학적 의미의 “오류 0%”는 어떤 일반 소프트웨어도 정직하게 보장할 수 없습니다. 최종 발표 PC에서 `verify-final-strict.ps1`까지 통과한 상태를 최종 릴리스 승인 기준으로 사용합니다.

자세한 문서:
- `docs/QUALITY_GATE.md`
- `docs/KNOWN_LIMITATIONS.md`
- `docs/WIDE_SCOPE_RISK_DESIGN.md`
- `docs/FINAL_DEMO_CHECKLIST.md`
