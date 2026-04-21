---
name: project-wiki-specify
version: "1.0.0"
description: This skill should be used when the user wants to add a specified topic to the Project Wiki. It generates a focused wiki article on a user-provided theme (e.g., "explore how X feature works", "research why X technology was chosen"), placing it in a dedicated Specify Wiki section separate from Getting Started and Deep Dive.
---

# Project Wiki Specify Skill

This skill guides a Code Agent to **add a specified topic** to an existing Project Wiki. The user provides a topic or question; the agent generates a focused, research-grade article and places it in the **Specify Wiki** section (separate from Getting Started and Deep Dive).

## Prerequisites

1. An existing wiki must exist at `./.atmos/wiki/` with a valid `_catalog.json`.
2. Read these shared references from **project-wiki** (installed at `~/.atmos/skills/.system/project-wiki/`) before making any changes:
   - **Content & formatting**: `~/.atmos/skills/.system/project-wiki/references/output_structure.md`
   - **Research briefing template**: `~/.atmos/skills/.system/project-wiki/references/briefing_template.md`
   - **Sample briefing**: `~/.atmos/skills/.system/project-wiki/examples/sample_briefing.md`
   - **Catalog schema**: `~/.atmos/skills/.system/project-wiki/references/catalog.schema.json`
3. If backend-generated AST artifacts exist at `./.atmos/wiki/_ast/`, load them first and use them as primary structural evidence (symbols/relations). Start from `hierarchy.json` + `index.json`, then fetch only needed per-file shards under `files/*.json` (progressive disclosure). If absent, continue in degraded mode with source-driven analysis.

The generated article MUST meet **specify-wiki** content depth requirements: 1500+ words, 3+ Mermaid diagrams, 6+ H2 sections, 5+ source files, 4+ cross-references. Run `~/.atmos/skills/.system/project-wiki/scripts/validate_content.py` to verify.

## Input Context

The user prompt will provide:
- **topic**: A string describing what wiki article to generate. Examples (user replaces bracketed parts for their project):
  - "Explore how [feature name] is implemented"
  - "Research why the project chose [technology] for [purpose]"
  - "Understand how [module/component] works"
  - "Document the [mechanism/flow] design"
  - "Explain the design decision behind [architecture choice]"

## Workflow

### Step 1: Ensure Specify Wiki Section Exists

1. Read `_catalog.json`.
2. If no top-level section with `id: "specify-wiki"` exists, create it:
   - Add a catalog item: `{ "id": "specify-wiki", "title": "Specify Wiki", "path": "specify-wiki", "order": 2, "file": "specify-wiki/index.md", "section": "specify-wiki", "level": "intermediate", "children": [] }`
   - Create the directory `./.atmos/wiki/specify-wiki/`.
   - Create `specify-wiki/index.md` as an index/overview for the Specify Wiki section if missing.

### Step 2: Research the Topic

1. **Read metadata** (if available): `_metadata/commit_details.txt`, `_concepts.json` — use these to understand evolution and existing concepts.
2. If AST artifacts are available under `./.atmos/wiki/_ast/`, load and verify them before broad source reading:
   - Read `_status.json` and compare `commit_hash` to current `git rev-parse HEAD`. If stale, note the drift and treat AST as partial guidance.
   - Read `hierarchy.json` and `index.json` first to locate likely relevant files.
   - Open only the needed `files/*.json` shards for the topic at hand; do NOT load all shards for large repos.
   - Use `relations.jsonl` / `symbols.jsonl` as fallback or debugging aids when shard-level evidence is insufficient.
   - Never fabricate AST-backed claims; if relation evidence is missing, explicitly mark it as source-read inference.
3. Deep-dive into the codebase to answer the user's topic/question.
4. Identify the relevant source files (at least 5 for specify-wiki).
5. Understand the implementation, design decisions, and data flow.
6. Extract relevant Git history and PR/Issue context for "why" and "how it evolved".

### Step 3: Create Research Briefing

Before writing the article, create a research briefing at `./.atmos/wiki/_briefings/specify-wiki/{topic-slug}.md` (e.g. `_briefings/specify-wiki/wiki-implementation.md`). Use `~/.atmos/skills/.system/project-wiki/references/briefing_template.md` as template. Include:
- Involved concepts (from `_concepts.json` or newly identified)
- Must-answer research questions (e.g. "Why was this approach chosen?", "How does it integrate with X?")
- Required source files and why each matters

### Step 4: Generate the Article (Research-Type)

1. Act as a **technical researcher**, not a document summarizer. Answer every research question from the briefing.
2. Create a new Markdown file under `./.atmos/wiki/specify-wiki/` using kebab-case (e.g., `websocket-lifecycle.md`, `why-rust-backend.md`).
3. Follow project-wiki conventions:
   - YAML frontmatter: `title`, `section: "specify-wiki"`, `level`, `reading_time`, `path`, `sources` (array, 5+), `updated_at`
   - **Minimum 1500 words** — expand by covering design decisions, evolution, and edge cases
   - 3+ Mermaid diagrams, 6+ H2 sections
   - Required sections: Introduction, Overview, Architecture, Design Decisions / Error Handling / Evolution (as relevant), Key Source Files, Next Steps (4+ cross-reference links)
   - Prefer AST-backed structural evidence for architecture, dependency, and call/data-flow claims when AST artifacts are available
4. Add the new article to `_catalog.json` under the `specify-wiki` section with correct `order`.

### Step 5: Update Catalog and Validate

1. Update `_catalog.json` with the new catalog entry.
2. Run all validation scripts from **project-wiki**. All must pass:
   ```bash
   python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_catalog.py .atmos/wiki/_catalog.json
   python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_frontmatter.py .atmos/wiki/
   python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_content.py .atmos/wiki/
   ```
3. If `validate_content` fails for the new article, expand the content until it passes.

## Alignment with project-wiki

All generated content MUST follow the same conventions as the full project-wiki skill:
- Same frontmatter schema (with `section: "specify-wiki"`)
- Same content style (prose-first, minimal code, prefer Mermaid)
- **Same content depth** — specify-wiki uses Deep Dive thresholds: 1500+ words, 3+ diagrams, 6+ H2s, 5+ sources, 4+ cross-refs; must pass `validate_content`
- Same file naming (kebab-case under `.atmos/wiki/specify-wiki/`)
- Same catalog item structure (id, title, path, order, file, section, level, reading_time, children)
- Research-type Agent role — explain *why* and *how it evolved*, not just *what*

## Edge Cases

- **Topic too broad**: Suggest a more focused topic or split into multiple articles.
- **Topic not applicable**: If the codebase has no relevant code, explain that to the user and suggest an alternative.
- **Duplicate content**: If a similar article already exists, consider updating it instead of creating a duplicate.
- **Shallow output**: If the first draft is under 1500 words, expand by adding Design Decisions, Error Handling, Evolution, or Configuration sections — do not consider the article complete until `validate_content` passes.
