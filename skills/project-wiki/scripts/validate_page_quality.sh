#!/usr/bin/env bash
# Validate evidence-driven wiki page quality without template quotas.
# Tries python3 first; falls back to pure bash.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v python3 &>/dev/null && [[ -f "$SCRIPT_DIR/validate_page_quality.py" ]]; then
  exec python3 "$SCRIPT_DIR/validate_page_quality.py" "$@"
fi

# ── Pure bash fallback ──────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

WIKI_DIR="${1:-}"
if [[ -z "$WIKI_DIR" ]]; then
  echo "Usage: bash validate_page_quality.sh <wiki-directory>" >&2; exit 1
fi

REGISTRY="$WIKI_DIR/page_registry.json"
if [[ ! -f "$REGISTRY" ]]; then
  echo -e "${RED}Error: page_registry.json not found${NC}" >&2; exit 1
fi

PAGES_DIR="$WIKI_DIR/pages"
if [[ ! -d "$PAGES_DIR" ]]; then
  echo -e "${RED}Error: pages/ directory not found${NC}" >&2; exit 1
fi

# ── Collect registry page ids ──────────────────────────────────────
# Simple extraction: grep all "id" values inside pages array
REGISTRY_IDS=$(grep -oE '"id"\s*:\s*"[^"]+"' "$REGISTRY" | sed 's/"id"\s*:\s*"//;s/"$//' | sort -u)

# ── Parse frontmatter ──────────────────────────────────────────────
parse_fm() {
  local file="$1"
  FM_PAGE_ID="" FM_SOURCES="" FM_EVIDENCE_REFS=""
  local in_fm=0 cur_key=""
  while IFS= read -r line; do
    if [[ $in_fm -eq 0 ]]; then [[ "$line" =~ ^--- ]] && in_fm=1; continue; fi
    [[ "$line" =~ ^--- ]] && return 0
    if [[ -n "$cur_key" ]] && [[ "$line" =~ ^[[:space:]]*-[[:space:]]+(.*) ]]; then
      local item="${BASH_REMATCH[1]}"; item="${item%\"}"; item="${item#\"}"; item="${item%\'}"; item="${item#\'}"
      eval "FM_${cur_key}=\"\${FM_${cur_key}}|${item}\""
      continue
    fi
    cur_key=""
    if [[ "$line" =~ ^([a-z_]+):[[:space:]]*(.*) ]]; then
      local key="${BASH_REMATCH[1]}" val="${BASH_REMATCH[2]}"
      val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
      case "$key" in
        page_id) FM_PAGE_ID="$val" ;;
        sources|evidence_refs)
          if [[ "$val" =~ ^\[(.+)\]$ ]]; then
            local items=""
            IFS=',' read -ra parts <<< "${BASH_REMATCH[1]}"
            for p in "${parts[@]}"; do p="${p## }"; p="${p%% }"; p="${p%\"}"; p="${p#\"}"; items="${items}|${p}"; done
            eval "FM_${key}='${items}'"
          elif [[ -z "$val" ]]; then
            eval "FM_${key}=''"
            cur_key="$key"
          else
            eval "FM_${key}='|${val}'"
          fi ;;
      esac
    fi
  done < "$file"
}

count_paragraphs() {
  local file="$1"
  # Get body after frontmatter, count non-empty blocks separated by blank lines
  # Exclude code blocks and tables
  sed -n '/^---/,/^---/{d};p' "$file" | \
    awk 'BEGIN{c=0; inblock=0; buf=""}
    /^```/{inblock=!inblock; next}
    inblock{next}
    /^\|/{next}
    /^[[:space:]]*$/{if(buf!=""){c++; buf=""}; next}
    {buf=buf $0}
    END{if(buf!="") c++; print c}'
}

FAILURES=()
CHECKED=0

while IFS= read -r md_path; do
  CHECKED=$((CHECKED + 1))
  rel="${md_path#$WIKI_DIR/}"
  errs=""

  parse_fm "$md_path"

  if [[ -z "$FM_PAGE_ID" ]]; then
    fname=$(basename "$md_path")
    [[ "$fname" == "index.md" ]] && continue
    errs="Missing 'page_id' in frontmatter"
    FAILURES+=("$rel:$errs"); continue
  fi

  # Check page_id in registry
  if ! echo "$REGISTRY_IDS" | grep -qxF "$FM_PAGE_ID"; then
    errs="${errs}page_id '$FM_PAGE_ID' not found in page_registry.json\n"
  fi

  # Check sources non-empty
  if [[ -z "$FM_SOURCES" ]]; then
    errs="${errs}Frontmatter 'sources' must be a non-empty array\n"
  fi

  # Check evidence_refs non-empty + files exist
  if [[ -z "$FM_EVIDENCE_REFS" ]]; then
    errs="${errs}Frontmatter 'evidence_refs' must be a non-empty array\n"
  else
    IFS='|' read -ra refs <<< "$FM_EVIDENCE_REFS"
    for ref in "${refs[@]}"; do
      [[ -z "$ref" ]] && continue
      ref_path="$WIKI_DIR/$ref"
      if [[ ! -f "$ref_path" ]]; then
        errs="${errs}Missing evidence ref file: $ref\n"
      else
        # Check evidence bundle has non-empty files[]
        if ! grep -q '"files"' "$ref_path" || grep -qE '"files"\s*:\s*\[\s*\]' "$ref_path"; then
          errs="${errs}Evidence bundle $ref has empty files[] — evidence was not assembled from AST\n"
        fi
      fi
    done
  fi

  # Check plan exists
  plan_path="$WIKI_DIR/_plans/${FM_PAGE_ID}.json"
  if [[ ! -f "$plan_path" ]]; then
    errs="${errs}Missing page plan: _plans/${FM_PAGE_ID}.json\n"
  fi

  # Check paragraph count
  para_count=$(count_paragraphs "$md_path")
  if [[ "$para_count" -lt 2 ]]; then
    errs="${errs}Page body is too thin; expected at least 2 non-empty paragraphs\n"
  fi

  # Check body length
  body_len=$(sed -n '/^---/,/^---/{d};p' "$md_path" | wc -c | tr -d ' ')
  if [[ "$body_len" -lt 300 ]]; then
    errs="${errs}Page body is too short to be meaningful\n"
  fi

  [[ -n "$errs" ]] && FAILURES+=("$rel:$(echo -e "$errs")")
done < <(find "$PAGES_DIR" -name '*.md' -type f | sort)

if [[ ${#FAILURES[@]} -gt 0 ]]; then
  echo -e "${RED}❌ Page quality validation failed (${#FAILURES[@]} file(s)):${NC}" >&2
  for entry in "${FAILURES[@]}"; do
    rel="${entry%%:*}"
    errs="${entry#*:}"
    echo "  $rel:" >&2
    while IFS= read -r e; do
      [[ -n "$e" ]] && echo "    - $e" >&2
    done <<< "$errs"
  done
  exit 1
fi

echo -e "${GREEN}✅ All wiki pages passed quality checks.${NC}"
echo "   Checked $CHECKED file(s)"
