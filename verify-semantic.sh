#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
TMP="$ROOT/.semantic-check"
rm -rf "$TMP" && mkdir -p "$TMP/backend-out"
trap 'rm -rf "$TMP"' EXIT

command -v javac >/dev/null 2>&1 || { echo 'ERROR: javac (JDK 17+) is required.' >&2; exit 1; }
find "$ROOT/tools/compile-stubs/src" "$ROOT/backend/src/main/java" -name '*.java' -print | sort > "$TMP/backend-sources.txt"
javac --release 17 -encoding UTF-8 -Xlint:all,-serial -d "$TMP/backend-out" @"$TMP/backend-sources.txt"
echo 'SEMANTIC_BACKEND_COMPILE_OK'

TSC=""
if [ -x "$ROOT/frontend/node_modules/.bin/tsc" ]; then
  TSC="$ROOT/frontend/node_modules/.bin/tsc"
elif command -v tsc >/dev/null 2>&1; then
  TSC="$(command -v tsc)"
fi
if [ -z "$TSC" ]; then
  echo 'ERROR: TypeScript compiler not found. Run npm install in frontend or install tsc.' >&2
  exit 1
fi
(cd "$ROOT/tools" && "$TSC" -p tsconfig.semantic.json)
echo 'SEMANTIC_FRONTEND_TYPECHECK_OK'
