# Changelog

## 4.0.0 Quality-Assured RC
- Core regression assertions: 50 → 62
- Java 17 `--release 17` verification
- Full backend semantic compile using dependency API stubs
- Strict frontend semantic typecheck using React/lucide API stubs
- Added `verify-semantic.sh/.ps1`
- Added `verify-final-strict.ps1`
- Added parameter-aware readable Method signatures
- Added generic domain-type dependency extraction
- Added explicit `this.method()` resolution
- Added method-local receiver resolution regression
- Hardened Unified Diff base/head line handling
- Hardened GitHub API with bounded response reads and explicit pagination caps
- Hardened optional AI response size and evidence payload limits
- Hardened GraphNode/GraphEdge/model immutability and validation
- Neo4j project-scoped identity + best-effort cleanup on removal/eviction
- Backend binds to 127.0.0.1 by default
- Graph UI now includes Method nodes with balanced type sampling
- Added additional JUnit regression tests
- Frontend version updated to 4.0.0 with Node/npm engines

## 3.0.0 Final Verified
- 50 core regression assertions
- JDK-only Standalone HTML Report
- START_HERE / release verification tooling

## 2.0.0 Production Final
- Wide-scope LOCAL/FEATURE/SYSTEM analysis
- Method-level Evidence Path
- CRI and Evidence Confidence
- GitHub PR/Commit changed-method mapping

## 5.0.0 — Zero-Known-Defect Quality Hardening
- Windows x64 one-click self-contained installer added
- Installed Windows launcher EXE added
- Transactional installer staging/rollback + manifest verification
- Installer safe extraction and payload SHA-256 validation
- Backend launch environment version checks
- Frontend Node 20+ version checks and pre-launch typecheck
- run-all backend health readiness polling
- Frontend API default unified to 127.0.0.1
- Release quality statement and installer documentation added
