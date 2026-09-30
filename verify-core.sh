#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/.verify-build"
rm -rf "$OUT" && mkdir -p "$OUT"
trap 'rm -rf "$OUT"' EXIT
javac --release 17 -encoding UTF-8 -d "$OUT" \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/model/*.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/analyzer/JavaStaticAnalyzer.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/graph/SoftwareGraph.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/graph/GraphBuilder.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/risk/RiskScoreCalculator.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/evaluation/GroundTruthEvaluator.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/impact/ImpactAnalyzer.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/impact/ChangedNodeLocator.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/util/SafeZip.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/util/UnifiedDiffParser.java \
  "$ROOT"/tools/CoreTestSuite.java
java -Dfile.encoding=UTF-8 -cp "$OUT" CoreTestSuite "$ROOT/sample-project"
