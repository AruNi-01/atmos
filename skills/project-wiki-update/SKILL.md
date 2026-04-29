---
name: project-wiki-update
version: "2.0.0"
description: Incrementally update an evidence-driven project wiki in `./.atmos/wiki/` by using `page_registry.json`, `_coverage/coverage_map.json`, Git diff, and AST hints to refresh only affected page plans, evidence bundles, and pages. Use when an existing wiki exists and code has changed since the recorded commit hash.
---

# Project Wiki Update

Incrementally update an existing evidence-driven wiki. Do not regenerate everything by default.

Read these shared references from `project-wiki` first:

- `~/.atmos/skills/.system/project-wiki/references/workflow.md`
- `~/.atmos/skills/.system/project-wiki/references/output_structure.md`
- `~/.atmos/skills/.system/project-wiki/references/page-quality.md`
- `~/.atmos/skills/.system/project-wiki/references/page-registry.schema.json`
- `~/.atmos/skills/.system/project-wiki/references/page-plan.schema.json`
- `~/.atmos/skills/.system/project-wiki/references/evidence-bundle.schema.json`

If multi-agent work is available, reuse these role briefs:

- `~/.atmos/skills/.system/project-wiki/agents/repo-analyst.md`
- `~/.atmos/skills/.system/project-wiki/agents/evidence-curator.md`
- `~/.atmos/skills/.system/project-wiki/agents/wiki-planner.md`
- `~/.atmos/skills/.system/project-wiki/agents/wiki-writer.md`
- `~/.atmos/skills/.system/project-wiki/agents/wiki-auditor.md`

## Inputs

Assume:

- `./.atmos/wiki/page_registry.json` exists
- `./.atmos/wiki/_coverage/coverage_map.json` exists or can be rebuilt
- the user or caller provides the wiki commit and current `HEAD`, or they can be derived from `page_registry.json` and `git rev-parse HEAD`

## Update Strategy

### 1. Detect Change Set

Build `_coverage/change_set.json` from:

- `git diff --name-only <registry_commit>..HEAD`
- AST relation hints when available
- missing or stale AST status

### 2. Expand Impact

Classify each changed file or symbol as one of:

- direct page hit via `coverage_map.json`
- indirect page hit via AST relations or shared abstractions
- no-doc impact
- requires a new page

### 3. Refresh Only Affected Artifacts

For affected pages only:

- update the page plan in `_plans/<page-id>.json`
- update the evidence bundle in `_evidence/<page-id>.json`
- rewrite the final page in `pages/...`

If a new concept or module deserves a new page:

- add a page plan
- add an evidence bundle
- add a page record to `page_registry.json`
- update navigation and coverage map

### 4. Preserve Stable Artifacts

Do not rewrite unaffected pages just to normalize style. Preserve existing good pages when they are still valid.

## Validation

Run:

```bash
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_page_registry.py .atmos/wiki/page_registry.json
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_frontmatter.py .atmos/wiki
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_page_quality.py .atmos/wiki
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_todo.py .atmos/wiki/_todo.md
```

Update `page_registry.json.generated_at` and `commit_hash` to the current run when the update is complete.
