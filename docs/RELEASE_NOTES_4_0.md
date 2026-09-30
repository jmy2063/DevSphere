# DevSphere AX 4.0 Release Notes

4.0은 기능 수를 늘리는 버전보다 **정확성·보안·설명가능성·재현성**을 우선한 QA 릴리스입니다.

핵심 강화:
- 62개 deterministic core assertions
- Method signature/overload 가독성
- generic domain dependency
- `this.method()` / local receiver resolution
- OLD/NEW Git diff line 분리
- bounded Graph traversal 및 bounded remote responses
- immutable graph/model data
- Ground Truth metric alias normalization
- Neo4j project isolation/cleanup
- loopback network default
- frontend Method graph visibility
- backend semantic compile / frontend strict typecheck
- target-PC strict release gate

최종 승인: `verify-final-strict.ps1` 통과.
