# DevSphere AX 3.0 Final — Release Notes

## 핵심 완성 기능
- Java/Spring 정적 분석
- Method line range와 overload-aware call mapping
- Software Knowledge Graph
- LOCAL / FEATURE / SYSTEM 광역 영향 분석
- Confidence decay / pruning / cycle guard / node limit
- Change Risk Index 0~100 및 Breakdown
- Evidence Confidence
- UPSTREAM / DOWNSTREAM
- Source path + line range Impact Path
- GitHub PR/Commit Diff → changed Method mapping
- Ground Truth evaluation
- AI grounded explanation + deterministic fallback
- Optional Neo4j sync
- React Dashboard + JSON Export
- Secure ZIP extraction

## 3.0 보강점
- Core regression assertions 50개
- Java source syntax 전체 parse
- TS/TSX source syntax 전체 parse
- JDK-only Standalone HTML Report 추가
- Windows release verification script 추가
- 실행/검증 문서와 최종 시연 절차 통합

## 품질 원칙
“어떠한 환경에서도 오류가 절대 없다”는 보장은 하지 않습니다. 대신 릴리스에서 통제 가능한 분석 로직, 입력 방어, 경로 추적, 위험 산정, 회귀 테스트, fallback을 검증하고, 외부 의존성은 사전 점검 대상으로 명확히 분리합니다.
