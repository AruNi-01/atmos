#!/usr/bin/env bash
#
# Validate _catalog.json structure using jq (zero dependencies).
#
# Usage:
#   bash scripts/validate_catalog.sh <path-to-catalog.json>
#
# Example:
#   bash scripts/validate_catalog.sh .atmos/wiki/_catalog.json
#
# Requirements: jq (pre-installed on most Linux/macOS/CI environments)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

CATALOG="${1:-}"
if [[ -z "$CATALOG" ]]; then
  echo -e "${RED}Error: Missing catalog file path${NC}" >&2
  echo "Usage: bash validate_catalog.sh <path-to-catalog.json>" >&2
  exit 1
fi

if [[ ! -f "$CATALOG" ]]; then
  echo -e "${RED}Error: File not found: $CATALOG${NC}" >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo -e "${RED}Error: jq is required but not installed.${NC}" >&2
  echo "Install: brew install jq / apt-get install jq / yum install jq" >&2
  exit 1
fi

# --- Validate JSON syntax ---
if ! jq empty "$CATALOG" 2>/dev/null; then
  echo -e "${RED}Error: Invalid JSON syntax${NC}" >&2
  exit 1
fi

ERRORS=()

# --- Helper: add error ---
err() { ERRORS+=("$1"); }

# --- Top-level required fields ---
for field in version generated_at project catalog; do
  if [[ "$(jq "has(\"$field\")" "$CATALOG")" != "true" ]]; then
    err "Missing required top-level field: '$field'"
  fi
done

# --- version format (X.Y) ---
VERSION=$(jq -r '.version // ""' "$CATALOG")
if [[ -n "$VERSION" ]] && ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+$ ]]; then
  err "Invalid version format: '$VERSION' (expected X.Y, e.g. '1.0')"
fi

# --- project required fields ---
for field in name description; do
  if [[ "$(jq ".project | has(\"$field\")" "$CATALOG")" != "true" ]]; then
    err "Missing required project field: '$field'"
  fi
done

# --- catalog must be non-empty array ---
CATALOG_LEN=$(jq '.catalog | length' "$CATALOG")
if [[ "$CATALOG_LEN" -eq 0 ]]; then
  err "Catalog array must contain at least 1 item"
fi

# --- Validate catalog items recursively via jq ---
# Extract all items (flattened) with their paths for validation
ITEMS=$(jq -r '
  def flatten_items(prefix):
    .[] | . as $item |
    "\(prefix)\(.id)|\(.title // "")|\(.path // "")|\(.order // -1)|\(.file // "")",
    if .children then (.children | flatten_items("\(prefix)\($item.id).")) else empty end;
  .catalog | flatten_items("")
' "$CATALOG" 2>/dev/null || true)

ID_PATTERN='^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$'
PATH_PATTERN='^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$'
FILE_PATTERN='^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*\.(md|markdown)$'

SEEN_IDS=()

while IFS='|' read -r id title item_path order file; do
  [[ -z "$id" ]] && continue

  # Required fields check
  [[ -z "$title" ]] && err "Item '$id': missing 'title'"
  [[ -z "$item_path" ]] && err "Item '$id': missing 'path'"
  [[ -z "$file" ]] && err "Item '$id': missing 'file'"
  [[ "$order" == "-1" ]] && err "Item '$id': missing 'order'"

  # Pattern checks
  if ! [[ "$id" =~ $ID_PATTERN ]]; then
    err "Item '$id': invalid id format (expected lowercase, dot-separated, e.g. 'core.auth')"
  fi
  if [[ -n "$item_path" ]] && ! [[ "$item_path" =~ $PATH_PATTERN ]]; then
    err "Item '$id': invalid path format '$item_path'"
  fi
  if [[ -n "$file" ]] && ! [[ "$file" =~ $FILE_PATTERN ]]; then
    err "Item '$id': invalid file format '$file' (must end with .md)"
  fi

  # Duplicate ID check
  for seen in "${SEEN_IDS[@]+"${SEEN_IDS[@]}"}"; do
    if [[ "$seen" == "$id" ]]; then
      err "Duplicate catalog item id: '$id'"
      break
    fi
  done
  SEEN_IDS+=("$id")

done <<< "$ITEMS"

# --- Report ---
if [[ ${#ERRORS[@]} -eq 0 ]]; then
  PROJECT_NAME=$(jq -r '.project.name' "$CATALOG")
  TOTAL_ITEMS=$(jq '[.. | .id? // empty] | length' "$CATALOG")
  echo -e "${GREEN}✅ Catalog is valid!${NC}"
  echo "   Version: $VERSION"
  echo "   Project: $PROJECT_NAME"
  echo "   Total items: $TOTAL_ITEMS"
  exit 0
else
  echo -e "${RED}❌ Catalog validation failed (${#ERRORS[@]} errors):${NC}" >&2
  echo "" >&2
  for i in "${!ERRORS[@]}"; do
    echo "  $((i+1)). ${ERRORS[$i]}" >&2
  done
  echo "" >&2
  exit 1
fi
