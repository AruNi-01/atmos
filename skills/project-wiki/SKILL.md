---
name: project-wiki
version: "2.3.0"
description: Generate or regenerate a project wiki as an evidence-driven knowledge base in `./.atmos/wiki/`. Produces deep, how/why-focused documentation by running parallel research agents that investigate code mechanisms and design rationale, not just list what exists. Uses AST, source, and git history as evidence through a structured pipeline of page plans, evidence bundles, and final Markdown pages.
---

# Project Wiki

You are building a **codebase knowledge base** — a wiki that helps developers understand how a project works, why it was designed this way, and how to navigate and modify it. This is not a summary or a README. It is a deep, evidence-backed research artifact.

The goal of every page is to answer: **How does this work? Why is it built this way? How do I work with it?** — not merely "what exists."

Generate a project wiki as a research pipeline, not as a Markdown templating task.

## Core Rules

- Treat `./.atmos/wiki/page_registry.json` as the primary output contract.
- Treat `./.atmos/wiki/pages/` as the human-readable output layer.
- Treat `./.atmos/wiki/_index/`, `./.atmos/wiki/_plans/`, `./.atmos/wiki/_evidence/`, and `./.atmos/wiki/_coverage/` as first-class artifacts, not temporary scratch files.
- Prefer AST, source, and Git metadata as evidence. Never invent AST-backed claims.
- Do not optimize for fixed word counts, fixed heading counts, or fixed Mermaid counts.
- Do not force every page into the same section layout. Let page structure follow the topic.
- Keep compatibility exports optional. If a legacy consumer still needs `_catalog.json`, derive it from `page_registry.json`; do not design the workflow around `_catalog.json`.
- **Focus on how and why, not what.** A page that lists classes without explaining how they collaborate or why they are structured this way is a failed page. Every section should teach the reader something they cannot learn from a file listing alone.

Read these references before doing substantial work:

- `references/workflow.md`
- `references/output_structure.md`
- `references/page-quality.md`
- `references/page-registry.schema.json`
- `references/page-plan.schema.json`
- `references/evidence-bundle.schema.json`

## Subagent Usage

**You MUST attempt to spawn subagents for the research, evidence, and writing phases.** Try the Task tool, subagent tool, or any equivalent multi-agent mechanism available in your runtime. Only fall back to serial execution after confirming that no subagent mechanism is available.

When subagents are available, use the role briefs in `agents/` as independent subagent invocations:

- `agents/repo-analyst.md`
- `agents/domain-researcher.md`
- `agents/workflow-researcher.md`
- `agents/integration-researcher.md`
- `agents/boundary-researcher.md`
- `agents/evidence-curator.md`
- `agents/wiki-planner.md`
- `agents/wiki-writer.md`
- `agents/wiki-auditor.md`

**Serial fallback discipline:** If subagent spawning is truly unavailable, you must still treat each role as a separate, focused pass. Complete one research report fully — reading AST shards, opening source files, writing the investigation log — before starting the next. Do not compress multiple roles into a single scan. The depth of each role's output must be the same whether it runs as a subagent or serially.

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
    { "name": "domain",      "role": "domain-researcher",      "prompt_template": "You are a codebase researcher. Read agents/domain-researcher.md for your full brief. Deeply research domain modules for {task}. Focus on HOW modules are structured internally and WHY boundaries are drawn where they are. You must open AST shards and source files, and include an Investigation Log listing every file you examined." },
    { "name": "workflows",   "role": "workflow-researcher",    "prompt_template": "You are a codebase researcher. Read agents/workflow-researcher.md for your full brief. Deeply trace runtime workflows for {task}. Focus on HOW requests flow step-by-step through the code and WHY certain flows are async. Trace complete paths from entry point to storage. Include an Investigation Log." },
    { "name": "integrations","role": "integration-researcher", "prompt_template": "You are a codebase researcher. Read agents/integration-researcher.md for your full brief. Deeply research external integrations for {task}. Focus on HOW each integration is wired (config → auth → request → response → error handling) not just what systems exist. Include an Investigation Log." },
    { "name": "boundaries",  "role": "boundary-researcher",    "prompt_template": "You are a codebase researcher. Read agents/boundary-researcher.md for your full brief. Deeply research API surface and cross-cutting concerns for {task}. Focus on HOW aspects intercept requests and WHY certain cross-cutting patterns were chosen. Include an Investigation Log." }
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
bash ~/.atmos/skills/.system/project-wiki/scripts/validate_page_registry.sh .atmos/wiki/page_registry.json
bash ~/.atmos/skills/.system/project-wiki/scripts/validate_frontmatter.sh .atmos/wiki
bash ~/.atmos/skills/.system/project-wiki/scripts/validate_evidence.sh .atmos/wiki
bash ~/.atmos/skills/.system/project-wiki/scripts/validate_page_quality.sh .atmos/wiki
bash ~/.atmos/skills/.system/project-wiki/scripts/validate_phase_gate.sh .atmos/wiki
bash ~/.atmos/skills/.system/project-wiki/scripts/validate_todo.sh .atmos/wiki/_todo.md
```

**No Python? No problem.** Each `.sh` script auto-detects the runtime:

- If `python3` is available → delegates to the `.py` script for full-fidelity validation.
- If `python3` is **not** installed → runs a built-in pure bash implementation (no `jq` or other dependencies required).

Always call the `.sh` wrappers above, never the `.py` files directly.

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
- `validate_evidence.sh`, `validate_frontmatter.sh`, `validate_page_quality.sh`, `validate_phase_gate.sh`, and `validate_todo.sh` all pass

If a legacy consumer explicitly requires `_catalog.json`, generate it as a derived compatibility artifact after the primary outputs are valid.
