#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/.benchmark-build"
mkdir -p "$OUT"
javac --release 17 -encoding UTF-8 -d "$OUT" \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/model/*.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/analyzer/JavaStaticAnalyzer.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/graph/{SoftwareGraph,GraphBuilder}.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/impact/ImpactAnalyzer.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/risk/RiskScoreCalculator.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/evaluation/GroundTruthEvaluator.java \
  "$ROOT"/tools/{ImpactBenchmark,EvaluationRegression}.java
java -Dfile.encoding=UTF-8 -cp "$OUT" EvaluationRegression
java -Dfile.encoding=UTF-8 -cp "$OUT" ImpactBenchmark "$ROOT"
