#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
TMP="$ROOT/.syntax-check"
rm -rf "$TMP" && mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT
javac -encoding UTF-8 -d "$TMP" "$ROOT/tools/JavaSyntaxCheck.java"
java -cp "$TMP" JavaSyntaxCheck "$ROOT/backend/src"
node "$ROOT/tools/ts-syntax-check.cjs" "$ROOT/frontend/src"
echo "SOURCE SYNTAX CHECK PASSED"
