# DevSphere AX 5.0 — START HERE

## 0. 설치형 배포본

배포 ZIP에 포함된 `DevSphere_AX_Setup.exe`를 실행하면 `%LOCALAPPDATA%\DevSphereAX\5.0.0`에 설치됩니다. 설치 후 Desktop/Start Menu의 `DevSphere AX` 바로가기를 사용합니다.

## 1. JDK-only 핵심 검증

```bat
verify-core.bat
```

성공:

```text
ALL CORE TESTS PASSED: 62
```

## 2. Standalone 실동작 데모

```bat
report-demo.bat
```

생성 파일:

```text
demo-output/DevSphere_AX_Report.html
```

Gradle/npm/Neo4j/AI API가 없어도 실제 Static Analysis → Graph → SYSTEM Traversal → CRI → Evidence Path를 보여줍니다.

## 3. Web 프로그램

Backend: IntelliJ에서 `backend` Gradle Sync → `test` → `bootRun`

Frontend:

```bat
cd frontend
npm install
npm run typecheck
npm run build
npm run dev
```

## 4. 발표 전 최종 승인

의존성을 설치한 발표 PC에서:

```powershell
powershell -ExecutionPolicy Bypass -File .\verify-final-strict.ps1
```

반드시 마지막에:

```text
=== STRICT QUALITY GATE PASSED ===
```

가 나오는지 확인합니다.

## 5. 발표 데모

1. `sample-spring-project.zip` 업로드
2. `OrderService.createOrder()` 선택
3. LOCAL / FEATURE / SYSTEM 3단계 비교
4. SYSTEM 광역 Blast Radius
5. source file + line Evidence Path
6. CRI Breakdown / Evidence Confidence
7. Regression Test 후보
8. 필요 시 GitHub PR/Commit 분석

## 6. 반드시 통일할 표현

- CRI = 장애확률 X
- CRI = Graph 근거 기반 상대 변경 위험지수 O
- LLM이 영향 범위를 추측 X
- Static Analysis + Knowledge Graph + Traversal이 계산하고 AI는 설명 O
