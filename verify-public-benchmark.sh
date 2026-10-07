#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
python3 "$ROOT/tools/prepare-public-benchmarks.py"
bash "$ROOT/verify-benchmark.sh"
javac --release 17 -encoding UTF-8 -cp "$ROOT/.benchmark-build" -d "$ROOT/.benchmark-build" "$ROOT/tools/PublicSourceBenchmark.java"
java -Dfile.encoding=UTF-8 -cp "$ROOT/.benchmark-build" PublicSourceBenchmark "$ROOT"
