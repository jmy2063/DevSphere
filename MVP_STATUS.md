# DevSphere AX 4.0 — Implementation Status

## 구현 완료
- [x] Java/Spring AST static analysis
- [x] Controller / Service / Repository / Entity / Method / API / Test / Table
- [x] Method start/end line + readable overload signature
- [x] Generic domain dependency extraction
- [x] Field / parameter / local-variable receiver call resolution
- [x] `this.method()` call resolution
- [x] Software Knowledge Graph
- [x] LOCAL / FEATURE / SYSTEM impact analysis
- [x] SYSTEM 6-hop wide-scope traversal
- [x] Confidence decay / pruning / cycle guard / hard node cap
- [x] UPSTREAM / DOWNSTREAM
- [x] CRI 0–100 + explainable breakdown
- [x] Evidence Confidence
- [x] source path + line range Impact Path
- [x] GitHub PR/Commit OLD/NEW Diff → changed Method mapping
- [x] Ground Truth evaluation
- [x] AI grounded explanation + deterministic fallback
- [x] Optional project-isolated Neo4j synchronization
- [x] React dashboard incl. Method graph visualization
- [x] JSON report export
- [x] Secure ZIP extraction
- [x] JDK-only standalone HTML fallback
- [x] 62 core regression assertions
- [x] backend semantic compile gate
- [x] frontend semantic typecheck gate
- [x] strict final-release verification script

## 의도적 후속 확장
- [ ] Multi-language analyzers
- [ ] Runtime tracing / distributed tracing fusion
- [ ] Incremental cache for very large monorepos
- [ ] Full CI/CD bot integration
- [ ] Enterprise auth/RBAC/organization tenancy

위 항목은 현재 3인·1학기 MVP 범위 밖의 확장 기능이며, 현재 핵심 동작의 결함으로 분류하지 않습니다.
