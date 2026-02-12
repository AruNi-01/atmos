#!/usr/bin/env bash
#
# Collect Git metadata for Project Wiki generation.
# Run from project root. Outputs to .atmos/wiki/_metadata/
#
# Usage (run from project root):
#   bash ~/.atmos/skills/.system/project-wiki/scripts/collect_metadata.sh
#   # optionally: bash ~/.atmos/skills/.system/project-wiki/scripts/collect_metadata.sh .atmos/wiki
#
# Creates:
#   .atmos/wiki/_metadata/commit_graph.txt   - git log --oneline --graph
#   .atmos/wiki/_metadata/commit_details.txt - full commit log with numstat
#   .atmos/wiki/_metadata/contributors.txt   - git shortlog
#   .atmos/wiki/_metadata/prs.json           - PR list (if gh CLI available)
#   .atmos/wiki/_metadata/issues.json        - Issue list (if gh CLI available)

set -euo pipefail

WIKI_DIR="${1:-.atmos/wiki}"
METADATA_DIR="$WIKI_DIR/_metadata"
LIMIT="${METADATA_LIMIT:-200}"

mkdir -p "$METADATA_DIR"

echo "Collecting Git metadata into $METADATA_DIR..."

echo "  - Commit graph..."
git log --all --oneline --graph -n "$LIMIT" > "$METADATA_DIR/commit_graph.txt" 2>/dev/null || true

echo "  - Commit details with file stats..."
git log --all --pretty=format:"%h|%an|%ar|%s" --numstat -n "$LIMIT" > "$METADATA_DIR/commit_details.txt" 2>/dev/null || true

echo "  - Contributors (shortlog)..."
git shortlog -sn --all -n 20 > "$METADATA_DIR/contributors.txt" 2>/dev/null || true

echo "  - File creation history..."
git log --all --diff-filter=A --name-only --pretty=format:"%h %ai %s" -n 50 > "$METADATA_DIR/file_creation.txt" 2>/dev/null || true

# PR/Issue via gh CLI (optional; fails silently if not installed or no remote)
if command -v gh &>/dev/null; then
  echo "  - PR list..."
  if gh pr list --state all --limit 100 --json number,title,author,createdAt,mergedAt,body 2>/dev/null > "$METADATA_DIR/prs.json"; then
    echo "    PR list saved"
  else
    echo "{}" > "$METADATA_DIR/prs.json"
    echo "    (gh pr list skipped: no repo or not authenticated)"
  fi

  echo "  - Issue list..."
  if gh issue list --state all --limit 100 --json number,title,author,createdAt,closedAt,body 2>/dev/null > "$METADATA_DIR/issues.json"; then
    echo "    Issue list saved"
  else
    echo "{}" > "$METADATA_DIR/issues.json"
    echo "    (gh issue list skipped: no repo or not authenticated)"
  fi
else
  echo "{}" > "$METADATA_DIR/prs.json"
  echo "{}" > "$METADATA_DIR/issues.json"
  echo "  - PR/Issue: gh CLI not found, skipping"
fi

echo "Metadata collection complete."
