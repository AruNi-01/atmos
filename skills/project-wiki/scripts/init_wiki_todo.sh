#!/usr/bin/env bash
#
# Pre-create _todo.md for Project Wiki generation.
# Run from project root. Creates .atmos/wiki/_todo.md.
#
# Usage (run from project root; script lives in the skill dir):
#   bash ~/.atmos/skills/.system/project-wiki/scripts/init_wiki_todo.sh
#
# Creates ./.atmos/wiki/_todo.md relative to current directory.

set -euo pipefail

WIKI_DIR="${1:-.atmos/wiki}"
mkdir -p "$WIKI_DIR"

cat > "$WIKI_DIR/_todo.md" << 'TODOMD'
# Project Wiki Generation Checklist

- [ ] Deep codebase research done
- [ ] _catalog.json created (schema-compliant)
- [ ] validate_catalog passes (~/.atmos/skills/.system/project-wiki/scripts/)
- [ ] _mindmap.md created
- [ ] All Markdown articles generated
- [ ] validate_frontmatter passes (~/.atmos/skills/.system/project-wiki/scripts/)
- [ ] validate_todo passes (~/.atmos/skills/.system/project-wiki/scripts/)
- [ ] Final verification complete
TODOMD

echo "Created $WIKI_DIR/_todo.md"
