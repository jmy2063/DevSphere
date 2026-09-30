#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
[ -f RELEASE_MANIFEST_SHA256.txt ] || { echo 'ERROR: RELEASE_MANIFEST_SHA256.txt missing.' >&2; exit 1; }
sha256sum -c RELEASE_MANIFEST_SHA256.txt
echo 'RELEASE_INTEGRITY_OK'
