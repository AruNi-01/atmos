#!/usr/bin/env bash
#
# Pre-create _todo.md for evidence-driven Project Wiki generation.

set -euo pipefail

WIKI_DIR="${1:-.atmos/wiki}"
mkdir -p "$WIKI_DIR"

cat > "$WIKI_DIR/_todo.md" << 'TODOMD'
# Project Wiki Generation Checklist

- [ ] Git metadata collected (_metadata/)
- [ ] AST artifacts loaded/verified (_ast/)
- [ ] Repository index created (_index/repo_index.json)
- [ ] Concept graph created (_index/concept_graph.json)
- [ ] Page registry created (page_registry.json)
- [ ] Page plans created (_plans/)
- [ ] Evidence bundles created (_evidence/)
- [ ] Coverage map created (_coverage/coverage_map.json)
- [ ] Final Markdown pages generated (pages/)
- [ ] validate_page_registry passes
- [ ] validate_frontmatter passes
- [ ] validate_page_quality passes
- [ ] validate_todo passes
- [ ] Final verification complete
TODOMD

echo "Created $WIKI_DIR/_todo.md"
