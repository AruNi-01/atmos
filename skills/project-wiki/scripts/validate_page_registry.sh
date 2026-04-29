#!/usr/bin/env bash
# Validate page_registry.json for the evidence-driven wiki format.
# Tries python3 first; falls back to pure bash.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v python3 &>/dev/null && [[ -f "$SCRIPT_DIR/validate_page_registry.py" ]]; then
  exec python3 "$SCRIPT_DIR/validate_page_registry.py" "$@"
fi

# ── Pure bash fallback ──────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'

REGISTRY="${1:-}"
if [[ -z "$REGISTRY" ]]; then
  echo "Usage: bash validate_page_registry.sh <page_registry.json>" >&2; exit 1
fi
if [[ ! -f "$REGISTRY" ]]; then
  echo -e "${RED}Error: File not found: $REGISTRY${NC}" >&2; exit 1
fi

ERRORS=()
WARNINGS=()

# ── Minimal JSON helpers (no jq) ────────────────────────────────────
# Flatten JSON to one key-value per line using awk.
# Output: path<TAB>value   e.g.  .pages[0].id<TAB>overview
flatten_json() {
  awk '
  BEGIN { depth=0; path=""; instr=0; key=""; astack=""; aidx="" }
  {
    n = split($0, chars, "")
    for (i = 1; i <= n; i++) {
      c = chars[i]
      if (instr) {
        if (c == "\\" && i < n) { buf = buf c chars[++i]; continue }
        if (c == "\"") { instr = 0 }
        else { buf = buf c }
        continue
      }
      if (c == "\"") { instr = 1; buf = ""; continue }
      if (c == ":") { key = buf; continue }
      if (c == "{") {
        if (key != "") path = path "." key
        depth++; key = ""; continue
      }
      if (c == "[") {
        if (key != "") path = path "." key
        astack = astack "," aidx
        aidx = 0; depth++; key = ""; continue
      }
      if (c == "}" || c == "]") {
        depth--
        if (c == "]") {
          # pop aidx
          n2 = split(astack, ap, ",")
          aidx = ap[n2]; astack = ""; for (j = 1; j < n2; j++) astack = astack (j>1?",":"") ap[j]
        }
        sub(/\.[^.]*$/, "", path)
        continue
      }
      if (c == ",") {
        if (buf != "" || key != "") {
          val = (buf != "") ? buf : key
          if (aidx != "" && key == "") {
            printf "%s[%s]\t%s\n", path, aidx, val
            aidx = aidx + 1
          } else if (key != "") {
            printf "%s.%s\t%s\n", path, key, val
          }
          buf = ""; key = ""
        } else if (aidx != "") {
          aidx = aidx + 1
        }
        continue
      }
      if (c ~ /[0-9a-zA-Z_\-.]/) { buf = buf c; continue }
      if (c ~ /[ \t\r\n]/) continue
    }
  }
  END {
    if (buf != "" || key != "") {
      val = (buf != "") ? buf : key
      if (aidx != "" && key == "") printf "%s[%s]\t%s\n", path, aidx, val
      else if (key != "") printf "%s.%s\t%s\n", path, key, val
    }
  }
  ' "$1"
}

FLAT=$(flatten_json "$REGISTRY") || { echo -e "${RED}Error: invalid JSON${NC}" >&2; exit 1; }

# Helper: get value by exact path
jval() { echo "$FLAT" | awk -F'\t' -v p="$1" '$1==p{print $2; exit}'; }
# Helper: get all values matching prefix
jvals() { echo "$FLAT" | awk -F'\t' -v p="$1" 'index($1,p)==1{print $2}'; }
# Helper: get all paths matching prefix
jpaths() { echo "$FLAT" | awk -F'\t' -v p="$1" 'index($1,p)==1{print $1}'; }

# ── Top-level required fields ──────────────────────────────────────
for field in version generated_at commit_hash project navigation pages; do
  if ! echo "$FLAT" | grep -q "^\\.${field}"; then
    ERRORS+=("Missing required top-level field: '$field'")
  fi
done

# version format
VERSION=$(jval ".version")
if [[ -n "$VERSION" ]] && ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+$ ]]; then
  ERRORS+=("Invalid version '$VERSION'")
fi

# commit_hash format
COMMIT=$(jval ".commit_hash")
if [[ -n "$COMMIT" ]] && ! [[ "$COMMIT" =~ ^[0-9a-f]{7,40}$ ]]; then
  ERRORS+=("Invalid commit_hash '$COMMIT'")
fi

# project.name / project.description
for pf in name description; do
  val=$(jval ".project.${pf}")
  if [[ -z "$val" ]]; then
    ERRORS+=("project.${pf} must be a non-empty string")
  fi
done

# ── Pages ──────────────────────────────────────────────────────────
# Collect page ids
declare -A PAGE_IDS=()
PAGE_COUNT=0
idx=0
while true; do
  pid=$(jval ".pages[${idx}].id")
  [[ -z "$pid" ]] && break
  if [[ -n "${PAGE_IDS[$pid]:-}" ]]; then
    ERRORS+=("Duplicate page id '$pid'")
  fi
  PAGE_IDS["$pid"]=1

  for key in title file kind audience updated_at; do
    v=$(jval ".pages[${idx}].${key}")
    if [[ -z "$v" ]]; then
      ERRORS+=("pages[${idx}].${key} must be a non-empty string")
    fi
  done

  for arr in sources evidence_refs; do
    first=$(jval ".pages[${idx}].${arr}[0]")
    if [[ -z "$first" ]]; then
      ERRORS+=("pages[${idx}].${arr} must be a non-empty array")
    fi
  done

  PAGE_COUNT=$((idx + 1))
  idx=$((idx + 1))
done

if [[ $PAGE_COUNT -eq 0 ]]; then
  ERRORS+=("'pages' must be a non-empty array")
fi

# ── Navigation ─────────────────────────────────────────────────────
first_nav=$(jval ".navigation[0].id")
if [[ -z "$first_nav" ]]; then
  ERRORS+=("'navigation' must be a non-empty array")
else
  declare -A SEEN_NAV=()
  # Validate nav items (flat scan — checks id, title, order exist)
  nav_paths=$(jpaths ".navigation[")
  while IFS=$'\t' read -r p v; do
    # Extract nav item id entries
    if [[ "$p" =~ \.id$ ]]; then
      if [[ -n "${SEEN_NAV[$v]:-}" ]]; then
        ERRORS+=("Duplicate navigation id '$v'")
      fi
      SEEN_NAV["$v"]=1
      # Check page_id reference
      base="${p%.id}"
      ref_pid=$(echo "$FLAT" | awk -F'\t' -v b="${base}.page_id" '$1==b{print $2; exit}')
      if [[ -n "$ref_pid" ]] && [[ -z "${PAGE_IDS[$ref_pid]:-}" ]]; then
        ERRORS+=("${base}: references unknown page_id '$ref_pid'")
      fi
    fi
  done <<< "$FLAT"
fi

# ── Warnings ───────────────────────────────────────────────────────
if [[ $PAGE_COUNT -ge 8 ]]; then
  has_children=$(echo "$FLAT" | grep -c '\.navigation\[.*\]\.children\[' || true)
  if [[ "$has_children" -eq 0 ]]; then
    WARNINGS+=("${PAGE_COUNT} pages found but navigation has no grouping. Consider organizing into groups.")
  fi
fi

# ── Report ─────────────────────────────────────────────────────────
if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo -e "${RED}❌ Page registry validation failed (${#ERRORS[@]} errors):${NC}" >&2
  for i in "${!ERRORS[@]}"; do
    echo "  $((i+1)). ${ERRORS[$i]}" >&2
  done
  if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    echo "" >&2
    echo -e "${YELLOW}⚠️  Also found ${#WARNINGS[@]} warning(s):${NC}" >&2
    for w in "${WARNINGS[@]}"; do echo "  - $w" >&2; done
  fi
  exit 1
fi

echo -e "${GREEN}✅ Page registry is valid!${NC}"
if [[ ${#WARNINGS[@]} -gt 0 ]]; then
  echo -e "${YELLOW}⚠️  ${#WARNINGS[@]} warning(s)${NC}"
  for w in "${WARNINGS[@]}"; do echo "  - $w"; done
fi
