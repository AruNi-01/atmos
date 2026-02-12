#!/usr/bin/env bash
#
# Validate _todo.md for Project Wiki generation (Bash version, no Python).
# Checks that file exists and all checklist items are checked [x].
#
# Usage:
#   bash scripts/validate_todo.sh <path-to-_todo.md>
#   bash scripts/validate_todo.sh .atmos/wiki/_todo.md

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

TODO_FILE="${1:-}"
if [[ -z "$TODO_FILE" ]]; then
  echo -e "${RED}Error: Missing _todo.md path${NC}" >&2
  echo "Usage: bash validate_todo.sh <path-to-_todo.md>" >&2
  echo "Example: bash validate_todo.sh .atmos/wiki/_todo.md" >&2
  exit 1
fi

if [[ ! -f "$TODO_FILE" ]]; then
  echo -e "${RED}Error: File not found: $TODO_FILE${NC}" >&2
  exit 1
fi

ERRORS=()

# Must contain checklist header
if ! grep -q "Project Wiki Generation Checklist" "$TODO_FILE"; then
  ERRORS+=("Missing 'Project Wiki Generation Checklist' header")
fi

# Count unchecked items: - [ ] (space in brackets)
UNCHECKED=$(grep -c "^- \[ \]" "$TODO_FILE" 2>/dev/null || true)
if [[ "${UNCHECKED:-0}" -gt 0 ]]; then
  ERRORS+=("Found $UNCHECKED unchecked item(s). All must be [x] before completion.")
fi

# Must have at least 7 checked items (full checklist has 8)
CHECKED=$(grep -c "^- \[[xX]\]" "$TODO_FILE" 2>/dev/null || true)
if [[ "${CHECKED:-0}" -lt 7 ]]; then
  ERRORS+=("Too few items checked (found $CHECKED). Expected at least 7 for a complete wiki.")
fi

# Report
if [[ ${#ERRORS[@]} -eq 0 ]]; then
  echo -e "${GREEN}✅ _todo.md is valid! All items checked.${NC}"
  exit 0
else
  echo -e "${RED}❌ _todo.md validation failed:${NC}" >&2
  for e in "${ERRORS[@]}"; do
    echo "  - $e" >&2
  done
  exit 1
fi
