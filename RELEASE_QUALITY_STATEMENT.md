# DevSphere AX 5.0 Release Quality Statement

DevSphere AX 5.0은 정의된 **Java 17 / Spring Boot / GitHub MVP 범위**에서 알려진 결함을 제거하는 것을 목표로 한 **Zero-Known-Defect Quality-Hardened Release**입니다.

## 현재 자동 검증 범위

- Core regression assertions
- Java 17 syntax/semantic compatibility
- Frontend TypeScript semantic typecheck
- LOCAL / FEATURE / SYSTEM graph traversal
- 6-hop wide-scope path preservation
- Confidence pruning / cycle guard / hard node cap
- Method overload and call resolution
- Unified Diff old/new line mapping
- PR/Commit changed method location
- CRI normalization and breakdown
- Ground Truth evaluation bounds
- ZIP Slip / duplicate path / archive limit security tests
- Standalone deterministic report generation
- Release manifest SHA-256 integrity
- Windows launcher Go unit test and cross compilation
- Windows x64 PE validation
- Self-contained installer payload SHA-256 and manifest verification logic
- Transactional installer staging / rollback design

## 정확한 품질 표현

'오류가 절대 0%다'라는 수학적 보증 대신 다음 표현을 사용합니다.

> 현재 정의한 MVP와 자동 검증 범위에서는 알려진 결함이 남지 않도록 반복 검증한 Zero-Known-Defect Release이며, 최종 실행 PC에서도 Strict Quality Gate를 통과한 상태를 릴리스 승인 기준으로 사용합니다.

외부 네트워크, GitHub API 정책, OS 보안정책, 사용자 JDK/Node/Gradle 설치상태처럼 프로젝트가 통제하지 못하는 환경까지 오류 0%를 보장하지는 않습니다.
