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

- [ ] Git metadata collected (_metadata/)
- [ ] AST artifacts loaded/verified (_ast/)
- [ ] Deep codebase research done
- [ ] Core concepts extracted (_concepts.json)
- [ ] _catalog.json created (schema-compliant)
- [ ] validate_catalog passes
- [ ] _mindmap.md created
- [ ] Research briefings generated (_briefings/)
- [ ] All Markdown articles generated
- [ ] validate_frontmatter passes
- [ ] validate_content passes
- [ ] validate_todo passes
- [ ] Final verification complete
TODOMD

echo "Created $WIKI_DIR/_todo.md"
