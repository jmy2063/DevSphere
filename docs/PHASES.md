# 개발 단계와 최종 구조

1. GitHub Repository·Commit·PR 정보 수집
2. Java AST 정적 분석
3. Spring 구조/Method line range 분류
4. Software Knowledge Graph 구축
5. PR changed line → Method 변경 시작점 식별
6. LOCAL / FEATURE / SYSTEM confidence-weighted Impact Analysis
7. Evidence Path / Blast Radius / Impact Area 계산
8. Change Risk Index 0~100 계산
9. React Dashboard 시각화
10. Grounded AI Explanation
11. Ground Truth 기반 Precision/Recall/Path/CRI 검증

## 현재 핵심 범위
Java 17 + Spring Boot + GitHub + Method-level Static Analysis + Knowledge Graph + Wide-Scope Risk + React.

## 이후 확장
런타임 Trace, Messaging, 다언어, GitLab, CI/CD, Observability, Private LLM 등은 핵심 엔진 검증 이후 단계적으로 연결합니다.
