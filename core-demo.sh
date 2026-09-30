#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/.core-demo-build"
rm -rf "$OUT" && mkdir -p "$OUT"
javac --release 17 -encoding UTF-8 -d "$OUT" \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/model/*.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/analyzer/JavaStaticAnalyzer.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/graph/SoftwareGraph.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/graph/GraphBuilder.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/risk/RiskScoreCalculator.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/impact/ImpactAnalyzer.java \
  "$ROOT"/tools/CoreSmoke.java
java -Dfile.encoding=UTF-8 -cp "$OUT" CoreSmoke "$ROOT/sample-project"
