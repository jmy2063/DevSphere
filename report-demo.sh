#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/.report-build"
REPORT="$ROOT/demo-output/DevSphere_AX_Report.html"
rm -rf "$OUT" && mkdir -p "$OUT"
trap 'rm -rf "$OUT"' EXIT
javac --release 17 -encoding UTF-8 -d "$OUT" \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/model/*.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/analyzer/JavaStaticAnalyzer.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/graph/SoftwareGraph.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/graph/GraphBuilder.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/risk/RiskScoreCalculator.java \
  "$ROOT"/backend/src/main/java/com/devsphere/ax/impact/ImpactAnalyzer.java \
  "$ROOT"/tools/StandaloneReport.java
java -Dfile.encoding=UTF-8 -cp "$OUT" StandaloneReport "$ROOT/sample-project" "$REPORT"
echo "Open: $REPORT"
