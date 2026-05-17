#!/usr/bin/env bash
# Lay out Desktop / shared local runtime: binaries/runtime/current/{bin,web,system-skills}
#
# Implementation: layout-runtime-bundle.mjs (cross-platform).
# Usage: layout-runtime-bundle.sh <rootDir> <targetTriple> [binExt]
#   or:  source this file and call layout_runtime_bundle ...

ROOT_DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

layout_runtime_bundle() {
  set -euo pipefail
  node "$ROOT_DIR_SCRIPT/scripts/desktop/layout-runtime-bundle.mjs" "$@"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  layout_runtime_bundle "$@"
fi
