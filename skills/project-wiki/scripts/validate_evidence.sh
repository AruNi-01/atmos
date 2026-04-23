#!/usr/bin/env bash
# Validate evidence bundle authenticity for each wiki page.
# Tries python3 first; falls back to pure bash.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v python3 &>/dev/null && [[ -f "$SCRIPT_DIR/validate_evidence.py" ]]; then
  exec python3 "$SCRIPT_DIR/validate_evidence.py" "$@"
fi

# ── Pure bash fallback ──────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

WIKI_DIR="${1:-}"
if [[ -z "$WIKI_DIR" ]]; then
  echo "Usage: bash validate_evidence.sh <wiki-directory>" >&2; exit 1
fi

REGISTRY="$WIKI_DIR/page_registry.json"
if [[ ! -f "$REGISTRY" ]]; then
  echo -e "${RED}Error: page_registry.json not found${NC}" >&2; exit 1
fi

SPARSE_KINDS="overview topic decision"

# ── Minimal JSON helpers ────────────────────────────────────────────
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
          n2 = split(astack, ap, ",")
          aidx = ap[n2]; astack = ""; for (j = 1; j < n2; j++) astack = astack (j>1?",":"") ap[j]
        }
        sub(/\.[^.]*$/, "", path)
        continue
      }
      if (c == ",") {
        if (buf != "" || key != "") {
          val = (buf != "") ? buf : key
          if (aidx != "" && key == "") { printf "%s[%s]\t%s\n", path, aidx, val; aidx = aidx + 1 }
          else if (key != "") printf "%s.%s\t%s\n", path, key, val
          buf = ""; key = ""
        } else if (aidx != "") { aidx = aidx + 1 }
        continue
      }
      if (c ~ /[0-9a-zA-Z_\-.]/) { buf = buf c; continue }
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

jval() { echo "$1" | awk -F'\t' -v p="$2" '$1==p{print $2; exit}'; }
jvals_arr() { echo "$1" | awk -F'\t' -v p="$2" 'index($1,p)==1 && $1 ~ /\[[0-9]+\]$/{print $2}'; }

# ── Load AST hierarchy paths (if available) ─────────────────────────
HIERARCHY="$WIKI_DIR/_ast/hierarchy.json"
AST_PATHS=""
if [[ -f "$HIERARCHY" ]]; then
  # Extract all file paths from hierarchy.json
  AST_PATHS=$(grep -oE '"[^"]+\.[a-zA-Z0-9]+' "$HIERARCHY" | sed 's/^"//' | sort -u)
fi

# ── Parse frontmatter from a page ──────────────────────────────────
parse_fm_sources() {
  local file="$1"
  local in_fm=0 in_sources=0
  local sources=""
  while IFS= read -r line; do
    if [[ $in_fm -eq 0 ]]; then [[ "$line" =~ ^--- ]] && in_fm=1; continue; fi
    [[ "$line" =~ ^--- ]] && break
    if [[ "$line" =~ ^sources: ]]; then
      in_sources=1
      local val="${line#sources:}"; val="${val## }"
      if [[ "$val" =~ ^\[(.+)\]$ ]]; then
        IFS=',' read -ra parts <<< "${BASH_REMATCH[1]}"
        for p in "${parts[@]}"; do p="${p## }"; p="${p%% }"; p="${p%\"}"; p="${p#\"}"; sources="$sources|$p"; done
        in_sources=0
      fi
      continue
    fi
    if [[ $in_sources -eq 1 ]]; then
      if [[ "$line" =~ ^[[:space:]]*-[[:space:]]+(.*) ]]; then
        local item="${BASH_REMATCH[1]}"; item="${item%\"}"; item="${item#\"}"; sources="$sources|$item"
      else
        in_sources=0
      fi
    fi
  done < "$file"
  echo "$sources"
}

# ── Extract backtick code refs from body ────────────────────────────
extract_code_refs() {
  local file="$1"
  # Get body (after second ---)
  sed -n '/^---/,/^---/{/^---/d;d};p' "$file" | \
    grep -oE '`[^`]+`' | sed 's/^`//;s/`$//' | while read -r token; do
      # CamelCase class name (2+ uppercase letters)
      if [[ "$token" =~ ^[A-Z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$ ]]; then
        echo "$token"
      # File path (contains / or .)
      elif [[ "$token" == */* || "$token" == *.* ]] && [[ "$token" != *" "* ]]; then
        echo "$token"
      fi
    done | sort -u
}

# ── Main validation loop ───────────────────────────────────────────
REG_FLAT=$(flatten_json "$REGISTRY")
FAILURES=()
PAGE_COUNT=0
idx=0

while true; do
  pid=$(jval "$REG_FLAT" ".pages[${idx}].id")
  [[ -z "$pid" ]] && break
  PAGE_COUNT=$((idx + 1))
  kind=$(jval "$REG_FLAT" ".pages[${idx}].kind")
  kind="${kind:-module}"
  errs=""

  ev_file="$WIKI_DIR/_evidence/${pid}.json"
  if [[ ! -f "$ev_file" ]]; then
    errs="Missing evidence bundle: _evidence/${pid}.json"
    FAILURES+=("$pid:$errs")
    idx=$((idx + 1)); continue
  fi

  EV_FLAT=$(flatten_json "$ev_file" 2>/dev/null) || {
    FAILURES+=("$pid:Cannot parse evidence bundle")
    idx=$((idx + 1)); continue
  }

  # Collect evidence files[] and symbols[]
  ev_files=$(jvals_arr "$EV_FLAT" ".files[")
  ev_symbols=$(jvals_arr "$EV_FLAT" ".symbols[")

  # Check 1: files non-empty
  if [[ -z "$ev_files" ]]; then
    errs="${errs}evidence files[] is empty\n"
  elif [[ -n "$AST_PATHS" ]]; then
    untraced=""
    count=0
    while IFS= read -r f; do
      if ! echo "$AST_PATHS" | grep -qxF "$f"; then
        [[ $count -lt 3 ]] && untraced="${untraced} $f"
        count=$((count + 1))
      fi
    done <<< "$ev_files"
    [[ -n "$untraced" ]] && errs="${errs}evidence files[] contains entries not in _ast/hierarchy.json:${untraced}\n"
  fi

  # Check 2: symbols non-empty (except sparse kinds)
  if [[ -z "$ev_symbols" ]] && ! [[ " $SPARSE_KINDS " == *" $kind "* ]]; then
    errs="${errs}evidence symbols[] is empty (required for kind=${kind})\n"
  fi

  # Check 3 & 4: page-level checks
  page_file="$WIKI_DIR/pages/${pid}.md"
  if [[ -f "$page_file" ]]; then
    # Check 3: sources ⊆ evidence files
    fm_sources=$(parse_fm_sources "$page_file")
    if [[ -n "$fm_sources" ]]; then
      IFS='|' read -ra src_arr <<< "$fm_sources"
      outside=""
      for s in "${src_arr[@]}"; do
        [[ -z "$s" ]] && continue
        if ! echo "$ev_files" | grep -qxF "$s"; then
          outside="${outside} $s"
        fi
      done
      [[ -n "$outside" ]] && errs="${errs}frontmatter sources[] contains entries not in evidence files[]:${outside}\n"
    fi

    # Check 4: backtick code refs in body must appear in evidence
    refs=$(extract_code_refs "$page_file")
    if [[ -n "$refs" ]]; then
      missing=""
      mcount=0
      while IFS= read -r ref; do
        if ! echo "$ev_files" | grep -qxF "$ref" && ! echo "$ev_symbols" | grep -qxF "$ref"; then
          [[ $mcount -lt 5 ]] && missing="${missing} $ref"
          mcount=$((mcount + 1))
        fi
      done <<< "$refs"
      [[ -n "$missing" ]] && errs="${errs}prose references not found in evidence files[] or symbols[]:${missing}\n"
    fi
  fi

  [[ -n "$errs" ]] && FAILURES+=("$pid:$errs")
  idx=$((idx + 1))
done

if [[ ${#FAILURES[@]} -gt 0 ]]; then
  echo -e "${RED}❌ Evidence validation failed (${#FAILURES[@]} page(s)):${NC}" >&2
  for entry in "${FAILURES[@]}"; do
    pid="${entry%%:*}"
    errs="${entry#*:}"
    echo "  $pid:" >&2
    while IFS= read -r e; do
      [[ -n "$e" ]] && echo "    - $e" >&2
    done <<< "$(echo -e "$errs")"
  done
  exit 1
fi

echo -e "${GREEN}✅ All evidence bundles passed validation. (${PAGE_COUNT} page(s))${NC}"
