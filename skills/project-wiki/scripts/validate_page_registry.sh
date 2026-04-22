#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v python3 &>/dev/null && [[ -f "$SCRIPT_DIR/validate_page_registry.py" ]]; then
  exec python3 "$SCRIPT_DIR/validate_page_registry.py" "$@"
fi

echo "python3 is required for validate_page_registry.sh" >&2
exit 1
