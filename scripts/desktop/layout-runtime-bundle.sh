#!/usr/bin/env bash
# Lay out Desktop / shared local runtime: binaries/runtime/current/{bin,web,system-skills}
#
# Implementation: layout-runtime-bundle.mjs (cross-platform).
# Usage: layout-runtime-bundle.sh <rootDir> <targetTriple> [binExt]

set -euo pipefail

ROOT_DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec node "$ROOT_DIR_SCRIPT/scripts/desktop/layout-runtime-bundle.mjs" "$@"
