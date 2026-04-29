# Project Wiki Skill

An evidence-driven project documentation generator for ATMOS. Instructs any Code Agent to build a structured wiki from AST artifacts, source code, and Git history — not from README skimming.

## What Makes This Different

Content is grounded in evidence bundles assembled from real AST data, not inferred from file names or README files. Page structure follows the topic; there is no fixed section template.

## Quick Start

```bash
# Claude Code / Codex / Cursor — invoke the skill
"Generate project wiki using the project-wiki skill"
```

The skill produces:

```
.atmos/wiki/
├── page_registry.json        # navigation + page inventory
├── _todo.md
├── _metadata/
├── _ast/
├── _index/
│   ├── repo_index.json
│   └── concept_graph.json
├── _plans/
│   └── <page-id>.json
├── _evidence/
│   └── <page-id>.json
├── _coverage/
│   ├── coverage_map.json
│   └── change_set.json
├── _phase_done/
│   └── <page-id>.<phase>.json
└── pages/
    └── <page>.md
```

## Validate the Output

```bash
python3 scripts/validate_page_registry.py .atmos/wiki/page_registry.json
python3 scripts/validate_frontmatter.py .atmos/wiki
python3 scripts/validate_evidence.py .atmos/wiki
python3 scripts/validate_page_quality.py .atmos/wiki
python3 scripts/validate_phase_gate.py .atmos/wiki
python3 scripts/validate_todo.py .atmos/wiki/_todo.md
```

## Skill Package Contents

```
project-wiki/
├── SKILL.md                              # Agent instructions
├── README.md                             # This file
├── references/
│   ├── workflow.md
│   ├── output_structure.md
│   ├── page-quality.md
│   ├── page-registry.schema.json
│   ├── page-plan.schema.json
│   ├── evidence-bundle.schema.json
│   └── frontend-integration.md
├── agents/
│   ├── repo-analyst.md
│   ├── evidence-curator.md
│   ├── wiki-planner.md
│   ├── wiki-writer.md
│   └── wiki-auditor.md
├── examples/
│   ├── sample_evidence_bundle.json
│   ├── sample_page_plan.json
│   ├── page_registry.template.json
│   └── sample_document.md
└── scripts/
    ├── validate_page_registry.py
    ├── validate_frontmatter.py
    ├── validate_evidence.py
    ├── validate_page_quality.py
    ├── validate_phase_gate.py
    └── validate_todo.py
```

## Page Quality

A page is good when it answers the questions in its page plan, grounds claims in its evidence bundle, and teaches a reader something non-obvious. See `references/page-quality.md` for the full standard.

## Navigation

Navigation structure is derived from `_index/concept_graph.json` concept boundaries. When a project has 8 or more pages, the planner must organize navigation into at least one level of groups using `navigationItem.children`. Group names are not prescribed — they follow the project's natural subsystem boundaries.

## Compatibility

If a legacy consumer requires `_catalog.json`, generate it as a derived artifact from `page_registry.json` after all primary outputs are valid. Do not design the workflow around `_catalog.json`.
