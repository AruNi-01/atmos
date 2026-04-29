#!/usr/bin/env bash
# Validate phase gate files exist and are well-formed for every wiki page.
# Tries python3 first; falls back to pure bash.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v python3 &>/dev/null && [[ -f "$SCRIPT_DIR/validate_phase_gate.py" ]]; then
  exec python3 "$SCRIPT_DIR/validate_phase_gate.py" "$@"
fi

# ── Pure bash fallback ──────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

WIKI_DIR="${1:-}"
if [[ -z "$WIKI_DIR" ]]; then
  echo "Usage: bash validate_phase_gate.sh <wiki-directory>" >&2; exit 1
fi

REGISTRY="$WIKI_DIR/page_registry.json"
if [[ ! -f "$REGISTRY" ]]; then
  echo -e "${RED}Error: page_registry.json not found${NC}" >&2; exit 1
fi

PHASE_DIR="$WIKI_DIR/_phase_done"
PHASES="plan evidence write"
REQUIRED_FIELDS="page_id phase completed_at outputs"

# Extract page ids from registry
PAGE_IDS=$(grep -oE '"id"\s*:\s*"[^"]+"' "$REGISTRY" | sed 's/"id"\s*:\s*"//;s/"$//')

# Helper: extract a JSON string field value
json_str() { grep -oE "\"$2\"\s*:\s*\"[^\"]*\"" "$1" 2>/dev/null | head -1 | sed "s/\"$2\"\s*:\s*\"//;s/\"$//" ; }
# Helper: check if field exists
json_has() { grep -qE "\"$2\"\s*:" "$1" 2>/dev/null; }

FAILURES=()
PAGE_COUNT=0

while IFS= read -r page_id; do
  [[ -z "$page_id" ]] && continue
  PAGE_COUNT=$((PAGE_COUNT + 1))
  errs=""
  timestamps=""

  for phase in $PHASES; do
    gate="$PHASE_DIR/${page_id}.${phase}.json"
    if [[ ! -f "$gate" ]]; then
      errs="${errs}Missing: ${page_id}.${phase}.json\n"
      continue
    fi

    # Validate JSON is parseable (basic check)
    if ! grep -q '{' "$gate"; then
      errs="${errs}${page_id}.${phase}.json: invalid JSON\n"
      continue
    fi

    # Check required fields
    for field in $REQUIRED_FIELDS; do
      if ! json_has "$gate" "$field"; then
        errs="${errs}${page_id}.${phase}.json: missing field '$field'\n"
      fi
    done

    # Check page_id match
    actual_pid=$(json_str "$gate" "page_id")
    if [[ "$actual_pid" != "$page_id" ]]; then
      errs="${errs}${page_id}.${phase}.json: page_id mismatch (expected '$page_id')\n"
    fi

    # Check phase match
    actual_phase=$(json_str "$gate" "phase")
    if [[ "$actual_phase" != "$phase" ]]; then
      errs="${errs}${page_id}.${phase}.json: phase mismatch (expected '$phase')\n"
    fi

    # Check outputs is array
    if ! grep -qE '"outputs"\s*:\s*\[' "$gate"; then
      errs="${errs}${page_id}.${phase}.json: 'outputs' must be an array\n"
    fi

    # Collect timestamp for ordering check
    ts=$(json_str "$gate" "completed_at")
    timestamps="${timestamps}${ts}|"
  done

  # Check non-decreasing timestamps
  IFS='|' read -ra ts_arr <<< "$timestamps"
  if [[ ${#ts_arr[@]} -ge 3 ]] && [[ -n "${ts_arr[0]}" ]] && [[ -n "${ts_arr[1]}" ]] && [[ -n "${ts_arr[2]}" ]]; then
    if [[ "${ts_arr[0]}" > "${ts_arr[1]}" ]] || [[ "${ts_arr[1]}" > "${ts_arr[2]}" ]]; then
      errs="${errs}completed_at timestamps are not non-decreasing: ${ts_arr[0]}, ${ts_arr[1]}, ${ts_arr[2]}\n"
    fi
  fi

  [[ -n "$errs" ]] && FAILURES+=("$page_id:$(echo -e "$errs")")
done <<< "$PAGE_IDS"

if [[ ${#FAILURES[@]} -gt 0 ]]; then
  echo -e "${RED}❌ Phase gate validation failed (${#FAILURES[@]} page(s)):${NC}" >&2
  for entry in "${FAILURES[@]}"; do
    pid="${entry%%:*}"
    errs="${entry#*:}"
    echo "  $pid:" >&2
    while IFS= read -r e; do
      [[ -n "$e" ]] && echo "    - $e" >&2
    done <<< "$errs"
  done
  exit 1
fi

GATE_COUNT=$((PAGE_COUNT * 3))
echo -e "${GREEN}✅ All phase gates valid. (${PAGE_COUNT} page(s), ${GATE_COUNT} gate files)${NC}"
