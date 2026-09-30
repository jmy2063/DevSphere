# DevSphere AX 4.0 — Quality Gate

## Gate A — Core deterministic regression

```bat
verify-core.bat
```

Required:

```text
ALL CORE TESTS PASSED: 62
```

## Gate B — Semantic source verification

```powershell
powershell -ExecutionPolicy Bypass -File .\verify-semantic.ps1
```

Required:

```text
SEMANTIC_BACKEND_COMPILE_OK
SEMANTIC_FRONTEND_TYPECHECK_OK
```

Backend semantic compile은 Spring/Jackson/Neo4j 외부 API 최소 stub을 이용해 모든 main Java source의 내부 타입 연결 오류까지 검사합니다. 실제 dependency-resolved Gradle build를 대체하지는 않습니다.

## Gate C — Standalone smoke test

```bat
report-demo.bat
```

`demo-output/DevSphere_AX_Report.html` 생성 필수.

## Gate D — Final target-PC strict gate

```powershell
powershell -ExecutionPolicy Bypass -File .\verify-final-strict.ps1
```

필수 확인:
- Core regression PASS
- semantic checks PASS
- Standalone report PASS
- Gradle `clean test bootJar` PASS
- npm `typecheck` PASS
- npm `build` PASS
- Backend JAR / Frontend dist 산출물 존재

마지막 문자열:

```text
=== STRICT QUALITY GATE PASSED ===
```

이 상태를 최종 발표/제출 승인 상태로 정의합니다.
