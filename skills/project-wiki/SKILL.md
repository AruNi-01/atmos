---
name: project-wiki
version: "2.2.0"
description: Generate or regenerate a project wiki as an evidence-driven knowledge base in `./.atmos/wiki/`. Use when Codex needs to document a codebase, build repo wiki pages from source, AST, and git history, or create a structured wiki pipeline with page plans, evidence bundles, page registry, and final Markdown pages instead of template-driven articles.
---

# Project Wiki

Generate a project wiki as a research pipeline, not as a Markdown templating task.

## Core Rules

- Treat `./.atmos/wiki/page_registry.json` as the primary output contract.
- Treat `./.atmos/wiki/pages/` as the human-readable output layer.
- Treat `./.atmos/wiki/_index/`, `./.atmos/wiki/_plans/`, `./.atmos/wiki/_evidence/`, and `./.atmos/wiki/_coverage/` as first-class artifacts, not temporary scratch files.
- Prefer AST, source, and Git metadata as evidence. Never invent AST-backed claims.
- Do not optimize for fixed word counts, fixed heading counts, or fixed Mermaid counts.
- Do not force every page into the same section layout. Let page structure follow the topic.
- Keep compatibility exports optional. If a legacy consumer still needs `_catalog.json`, derive it from `page_registry.json`; do not design the workflow around `_catalog.json`.

Read these references before doing substantial work:

- `references/workflow.md`
- `references/output_structure.md`
- `references/page-quality.md`
- `references/page-registry.schema.json`
- `references/page-plan.schema.json`
- `references/evidence-bundle.schema.json`

If the runtime supports spawning subagents (e.g., a Task tool is available), you MUST use the role briefs in `agents/` as independent subagent invocations. Serial execution is only allowed when subagent spawning is technically unavailable.

- `agents/repo-analyst.md`
- `agents/domain-researcher.md`
- `agents/workflow-researcher.md`
- `agents/integration-researcher.md`
- `agents/boundary-researcher.md`
- `agents/evidence-curator.md`
- `agents/wiki-planner.md`
- `agents/wiki-writer.md`
- `agents/wiki-auditor.md`

If subagent spawning is unavailable, execute the same roles serially yourself, but still produce all phase gate artifacts as if each role were a separate agent.

## Required Output

Create or update this structure under `./.atmos/wiki/`:

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
    └── ...
```

## Workflow

### 1. Initialize

Run:

```bash
bash ~/.atmos/skills/.system/project-wiki/scripts/init_wiki_todo.sh
bash ~/.atmos/skills/.system/project-wiki/scripts/collect_metadata.sh
```

If `./.atmos/wiki/_ast/` exists, read `_status.json`, `hierarchy.json`, and `index.json` first. Open per-file shards only on demand.

### 2. Build Repository Index

Create:

- `_index/repo_index.json`
- `_index/concept_graph.json`

The repository index must capture:

- repo identity and current `HEAD`
- major directories, modules, packages, crates, apps, and entrypoints
- notable configuration/build files
- AST availability and drift status
- candidate architectural boundaries
- high-signal Git history references

The concept graph must capture:

- concepts or subsystems
- related files
- related symbols
- related commits / PRs / issues when available
- concept-to-concept edges

### 3. Research (Parallel Subagents)

Spawn the four research agents in parallel. Each reads `_index/` and `_ast/` independently and writes its findings to `_research/`. All four must complete before proceeding.

Each research agent must follow an **AST-first** approach:
- Use `_ast/symbols.jsonl` and `_ast/relations.jsonl` to locate relevant classes and dependencies before opening any source file.
- Open `_ast/files/<shard>` for targeted file-level detail.
- Open source files only when AST data cannot answer the question (e.g. understanding business logic, configuration wiring).

**Subagent DAG:**

```
repo-analyst (already done in step 2)
    │
    ├──► domain-researcher      → .atmos/wiki/_research/domain.md
    ├──► workflow-researcher    → .atmos/wiki/_research/workflows.md
    ├──► integration-researcher → .atmos/wiki/_research/integrations.md
    └──► boundary-researcher    → .atmos/wiki/_research/boundaries.md
                                        │
                                        ▼ (all four complete)
                                  evidence-curator (step 4)
```

If using the `subagent` tool, the DAG looks like:

```json
{
  "stages": [
    { "name": "domain",      "role": "domain-researcher",      "prompt_template": "Research domain modules for {task}" },
    { "name": "workflows",   "role": "workflow-researcher",    "prompt_template": "Research runtime workflows for {task}" },
    { "name": "integrations","role": "integration-researcher", "prompt_template": "Research external integrations for {task}" },
    { "name": "boundaries",  "role": "boundary-researcher",    "prompt_template": "Research API surface and cross-cutting concerns for {task}" }
  ]
}
```

Do not proceed to step 4 until all four `_research/*.md` files exist and are non-empty.

### 4. Build Page Plans

Create `page_registry.json` plus one JSON page plan per final page under `_plans/`.

Use `references/page-plan.schema.json`.

Each page plan must answer:

- what user/job this page serves
- which questions the page must answer
- which evidence is required before writing
- what is explicitly out of scope
- whether the page should be `overview`, `architecture`, `module`, `workflow`, `decision`, `integration`, or `topic`

Do not write final page prose before the page plan exists.

After completing page plans for all pages, write a phase gate file for each page:

```json
// _phase_done/<page-id>.plan.json
{ "page_id": "<page-id>", "phase": "plan", "completed_at": "<iso8601>", "outputs": ["_plans/<page-id>.json"] }
```

### 5. Assemble Evidence

For each planned page, create `_evidence/<page-id>.json` using `references/evidence-bundle.schema.json`.

The `evidence-curator` agent reads `_research/*.md` as its primary source, then cross-references `_ast/` shards to verify and enrich. Evidence bundles should include:

- relevant files
- relevant symbols
- relevant relations
- relevant commits
- relevant PRs/issues when available
- explicit inferences, marked as inferences

Prefer page-specific evidence bundles over dumping global context into prompts.

After completing evidence bundles for all pages, write a phase gate file for each page:

```json
// _phase_done/<page-id>.evidence.json
{ "page_id": "<page-id>", "phase": "evidence", "completed_at": "<iso8601>", "outputs": ["_evidence/<page-id>.json"] }
```

### 6. Write Pages

Write final Markdown pages under `pages/`.

Every page must:

- include YAML frontmatter with `page_id`, `title`, `kind`, `audience`, `sources`, `evidence_refs`, and `updated_at`
- answer the page plan's questions
- ground claims in the page's evidence bundle
- explain architecture and behavior in prose
- use diagrams when they clarify a claim, not to satisfy quotas
- avoid filler introduced only to hit length or heading targets

After writing each page, write a phase gate file:

```json
// _phase_done/<page-id>.write.json
{ "page_id": "<page-id>", "phase": "write", "completed_at": "<iso8601>", "outputs": ["pages/<page-id>.md"] }
```

### 7. Audit

Audit each page against its plan and evidence bundle.

The audit standard is:

- coverage is sufficient for the page's scope
- claims are traceable to evidence
- page overlaps are intentional, not accidental duplication
- page registry and coverage map are internally consistent
- AST drift is noted if `_ast/_status.json.commit_hash` differs from current `HEAD`

## Validation

Run all of these before considering the wiki complete:

```bash
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_page_registry.py .atmos/wiki/page_registry.json
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_frontmatter.py .atmos/wiki
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_evidence.py .atmos/wiki
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_page_quality.py .atmos/wiki
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_phase_gate.py .atmos/wiki
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_todo.py .atmos/wiki/_todo.md
```

Compatibility wrappers also exist:

- `validate_catalog.py` / `.sh` delegates to page registry validation
- `validate_content.py` / `.sh` delegates to page quality validation

## Completion Checklist

Do not finish until all of the following are true:

- `page_registry.json` exists and validates
- `_index/repo_index.json` exists
- `_index/concept_graph.json` exists
- `_research/domain.md`, `_research/workflows.md`, `_research/integrations.md`, and `_research/boundaries.md` all exist and are non-empty
- `_plans/` contains a plan for every final page
- `_evidence/` contains an evidence bundle for every final page with non-empty `files` and `symbols`
- `_coverage/coverage_map.json` exists
- `_phase_done/` contains `<page-id>.plan.json`, `<page-id>.evidence.json`, and `<page-id>.write.json` for every page
- every page referenced by `page_registry.json` exists on disk
- `validate_evidence.py`, `validate_frontmatter.py`, `validate_page_quality.py`, `validate_phase_gate.py`, and `validate_todo.py` all pass

If a legacy consumer explicitly requires `_catalog.json`, generate it as a derived compatibility artifact after the primary outputs are valid.
