# Project Wiki Output Structure

The evidence-driven wiki stores both machine-oriented and human-oriented artifacts.

## Layout

```text
.atmos/wiki/
├── page_registry.json
├── _todo.md
├── _metadata/
├── _ast/
├── _index/
│   ├── repo_index.json
│   └── concept_graph.json
├── _research/
│   ├── domain.md
│   ├── workflows.md
│   ├── integrations.md
│   └── boundaries.md
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

## Primary Artifacts

### `page_registry.json`

Single source of truth for:

- project metadata
- navigation tree (must use `children` for grouping when page count ≥ 8)
- page inventory
- recorded commit hash for incremental updates

### `_research/`

Shared research layer produced by the four parallel research agents before any page writing starts. All files are required before `evidence-curator` runs.

| File | Produced by | Contents |
|------|-------------|----------|
| `domain.md` | domain-researcher | modules, domain concepts, data models, inter-module dependencies |
| `workflows.md` | workflow-researcher | runtime flows, entry points, async patterns |
| `integrations.md` | integration-researcher | external systems, connection types, config keys |
| `boundaries.md` | boundary-researcher | API endpoints, cross-cutting concerns (auth, rate-limit, cache, AOP) |

`evidence-curator` reads all four files as its primary source when assembling `_evidence/<page-id>.json`.

### `_plans/<page-id>.json`

Page plan describing:

- intended audience
- page kind
- questions to answer
- required evidence
- scope and exclusions

### `_evidence/<page-id>.json`

Page evidence bundle containing:

- `files` — **must be non-empty**; every entry must be traceable to `_ast/hierarchy.json` or the file system
- `symbols` — **must be non-empty** unless page `kind` is `overview`, `topic`, or `decision`
- `relations`
- `commits`
- `issues` / `prs`
- `inferences`

The page's frontmatter `sources` must be a subset of `files`. Page prose that references class names or file paths (backtick-quoted) must have those names present in `files` or `symbols`.

### `_phase_done/<page-id>.<phase>.json`

Phase gate record written after each processing phase. Required fields:

```json
{
  "page_id": "<page-id>",
  "phase": "plan | evidence | write",
  "completed_at": "<iso8601>",
  "outputs": ["<path-to-produced-artifact>"]
}
```

Three files are required per page: `<page-id>.plan.json`, `<page-id>.evidence.json`, `<page-id>.write.json`. The `completed_at` timestamps must be non-decreasing across phases.

### `_coverage/coverage_map.json`

Maps files, symbols, and relation hubs back to page ids. Use this for incremental update planning.

### `pages/*.md`

Reader-facing final pages. These should be grounded in plans and evidence but optimized for human comprehension.
