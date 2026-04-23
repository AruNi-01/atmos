#!/usr/bin/env bash
# Validate wiki Markdown frontmatter.
# Tries python3 first; falls back to pure bash.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v python3 &>/dev/null && [[ -f "$SCRIPT_DIR/validate_frontmatter.py" ]]; then
  exec python3 "$SCRIPT_DIR/validate_frontmatter.py" "$@"
fi

# ── Pure bash fallback ──────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

WIKI_DIR="${1:-}"
if [[ -z "$WIKI_DIR" ]]; then
  echo "Usage: bash validate_frontmatter.sh <wiki-directory>" >&2; exit 1
fi
if [[ ! -d "$WIKI_DIR" ]]; then
  echo -e "${RED}Error: Not a directory: $WIKI_DIR${NC}" >&2; exit 1
fi

MODERN_REQUIRED="page_id title kind audience sources evidence_refs updated_at"
LEGACY_REQUIRED="title section level path sources updated_at"
FAILED=()
CHECKED=0

# Parse YAML frontmatter from a markdown file.
# Sets FM_KEYS (space-separated list of keys found) and FM_<key> variables.
parse_frontmatter() {
  local file="$1"
  FM_KEYS=""
  local in_fm=0 cur_array_key="" line key val

  while IFS= read -r line; do
    if [[ $in_fm -eq 0 ]]; then
      [[ "$line" =~ ^---[[:space:]]*$ ]] && in_fm=1
      continue
    fi
    [[ "$line" =~ ^---[[:space:]]*$ ]] && return 0

    # Array continuation
    if [[ -n "$cur_array_key" ]] && [[ "$line" =~ ^[[:space:]]*-[[:space:]]+(.*) ]]; then
      local item="${BASH_REMATCH[1]}"
      item="${item%\"}" ; item="${item#\"}" ; item="${item%\'}" ; item="${item#\'}"
      eval "FM_${cur_array_key}=\"\${FM_${cur_array_key}:-}|${item}\""
      continue
    fi
    cur_array_key=""

    if [[ "$line" =~ ^([a-z_]+):[[:space:]]*(.*) ]]; then
      key="${BASH_REMATCH[1]}"
      val="${BASH_REMATCH[2]}"
      val="${val%\"}" ; val="${val#\"}" ; val="${val%\'}" ; val="${val#\'}"
      FM_KEYS="$FM_KEYS $key"

      if [[ "$key" == "sources" || "$key" == "evidence_refs" ]]; then
        if [[ -z "$val" ]]; then
          eval "FM_${key}=''"
          cur_array_key="$key"
          continue
        fi
        # Inline array [a, b]
        if [[ "$val" =~ ^\[(.+)\]$ ]]; then
          local inner="${BASH_REMATCH[1]}"
          local items=""
          IFS=',' read -ra parts <<< "$inner"
          for p in "${parts[@]}"; do
            p="${p## }"; p="${p%% }"; p="${p%\"}"; p="${p#\"}"; p="${p%\'}"; p="${p#\'}"
            items="${items}|${p}"
          done
          eval "FM_${key}='${items}'"
          continue
        fi
      fi
      eval "FM_${key}='${val}'"
    fi
  done < "$file"
  return 1  # no closing ---
}

has_key() { [[ " $FM_KEYS " == *" $1 "* ]]; }
get_val() { eval "echo \"\${FM_${1}:-}\""; }

validate_file() {
  local file="$1" rel="$2"
  local errs=""

  # Check starts with ---
  local first_line
  first_line=$(head -1 "$file")
  if ! [[ "$first_line" =~ ^---[[:space:]]*$ ]]; then
    echo "File does not start with '---' (YAML frontmatter required)"
    return
  fi

  FM_KEYS=""
  if ! parse_frontmatter "$file"; then
    echo "No complete YAML frontmatter block found"
    return
  fi

  # Determine modern vs legacy
  local required
  if has_key "page_id" || has_key "evidence_refs"; then
    required=$MODERN_REQUIRED
  else
    required=$LEGACY_REQUIRED
  fi

  for key in $required; do
    if ! has_key "$key"; then
      errs="${errs}Missing required key: '${key}'\n"
    else
      local v
      v=$(get_val "$key")
      if [[ -z "$v" ]]; then
        errs="${errs}Missing required key: '${key}'\n"
      fi
    fi
  done

  # Check body for forbidden patterns
  local body
  body=$(sed -n '/^---/,/^---/!p' "$file" | tail -n +1)
  if echo "$body" | grep -qiE '>\s*\*\*Reading\s+Time'; then
    errs="${errs}Forbidden in body: Blockquote-style Reading Time\n"
  fi
  if echo "$body" | grep -qiE '>\s*\*\*Source\s+Files'; then
    errs="${errs}Forbidden in body: Blockquote-style Source Files\n"
  fi

  [[ -n "$errs" ]] && echo -e "$errs"
}

# Find all .md files under wiki dir, skip _-prefixed files
while IFS= read -r md_file; do
  fname=$(basename "$md_file")
  [[ "$fname" == _* ]] && continue
  CHECKED=$((CHECKED + 1))

  rel="${md_file#$WIKI_DIR/}"
  result=$(validate_file "$md_file" "$rel")
  if [[ -n "$result" ]]; then
    FAILED+=("$rel:$result")
  fi
done < <(find "$WIKI_DIR" -name '*.md' -type f | sort)

if [[ ${#FAILED[@]} -eq 0 ]]; then
  echo -e "${GREEN}✅ All wiki Markdown files have valid frontmatter.${NC}"
  echo "   Checked $CHECKED file(s)"
  exit 0
fi

echo -e "${RED}❌ Frontmatter validation failed (${#FAILED[@]} file(s)):${NC}" >&2
for entry in "${FAILED[@]}"; do
  rel="${entry%%:*}"
  errs="${entry#*:}"
  echo "  $rel:" >&2
  while IFS= read -r e; do
    [[ -n "$e" ]] && echo "    - $e" >&2
  done <<< "$errs"
done
exit 1
