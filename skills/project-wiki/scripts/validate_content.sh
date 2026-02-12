#!/usr/bin/env bash
#
# Validate content depth of Project Wiki Markdown files.
# Uses Python if available; otherwise runs simplified checks (word count, mermaid).
#
# Usage:
#   bash validate_content.sh <wiki-directory>
#
# Example:
#   bash validate_content.sh .atmos/wiki/

set -euo pipefail

WIKI_DIR="${1:-}"
if [[ -z "$WIKI_DIR" ]]; then
  echo "Usage: bash validate_content.sh <wiki-directory>" >&2
  exit 1
fi

if [[ ! -d "$WIKI_DIR" ]]; then
  echo "Error: Not a directory: $WIKI_DIR" >&2
  exit 1
fi

# Prefer Python implementation (full validation)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if command -v python3 &>/dev/null && [[ -f "$SCRIPT_DIR/validate_content.py" ]]; then
  exec python3 "$SCRIPT_DIR/validate_content.py" "$WIKI_DIR"
fi

# Fallback: simplified bash/awk validation (word count + mermaid only)
FAILED=0

while IFS= read -r -d '' f; do
  base=$(basename "$f")
  [[ "$base" == "index.md" ]] && continue
  [[ "$base" == "_mindmap.md" ]] && continue
  [[ "$base" == _* ]] && continue

  # Extract body (after second ---)
  body=$(awk '/^---$/{c++;next} c>=2{print}' "$f" 2>/dev/null || true)

  # Word count (exclude mermaid, code blocks)
  clean=$(echo "$body" | sed '/^```/,/^```/d' 2>/dev/null || true)
  words=$(echo "$clean" | wc -w | tr -d ' ')
  mermaid=$(echo "$body" | grep -c '```mermaid' 2>/dev/null || echo 0)

  # Get section from frontmatter
  section=$(awk '/^---$/{c++;next} c==1 && /^section:/{print $2; exit}' "$f" 2>/dev/null | tr -d '"' | tr -d "'" || echo "")

  if [[ "$section" == "getting-started" ]]; then
    min_words=800
    min_mermaid=2
  elif [[ "$section" == "deep-dive" ]] || [[ "$section" == "specify-wiki" ]]; then
    min_words=1500
    min_mermaid=3
  else
    continue
  fi

  rel="${f#$WIKI_DIR/}"
  rel="${rel#/}"
  errs=""

  if [[ "$words" -lt "$min_words" ]]; then
    errs="${errs}Word count $words < $min_words required. "
  fi
  if [[ "$mermaid" -lt "$min_mermaid" ]]; then
    errs="${errs}Mermaid diagrams $mermaid < $min_mermaid required. "
  fi

  if [[ -n "$errs" ]]; then
    echo "  $rel:" >&2
    echo "    - $errs" >&2
    FAILED=1
  fi
done < <(find "$WIKI_DIR" -name "*.md" -print0 2>/dev/null)

if [[ $FAILED -eq 0 ]]; then
  echo "✅ Content depth check passed (simplified mode)"
  exit 0
else
  echo "" >&2
  echo "❌ Content depth validation failed. Install Python for full validation." >&2
  exit 1
fi
