---
name: project-wiki-specify
description: This skill should be used when the user wants to add a specified topic to the Project Wiki. It generates a focused wiki article on a user-provided theme (e.g., "explore how X feature works", "research why X technology was chosen"), placing it in a dedicated Specify Wiki section separate from Getting Started and Deep Dive.
---

# Project Wiki Specify Skill

This skill guides a Code Agent to **add a specified topic** to an existing Project Wiki. The user provides a topic or question; the agent generates a focused, research-grade article and places it in the **Specify Wiki** section (separate from Getting Started and Deep Dive).

## Prerequisites

1. An existing wiki must exist at `./.atmos/wiki/` with a valid `_catalog.json`.
2. Read these shared references in this skill directory before making any changes:
   - **Content & formatting guidelines**: `references/content-guidelines.md` (if it exists; otherwise follow project-wiki conventions)
   - **Catalog schema**: `references/catalog.schema.json`
   - **Output structure**: `references/output_structure.md`

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

1. Deep-dive into the codebase to answer the user's topic/question.
2. Identify the relevant source files (modules, types, functions).
3. Understand the implementation, design decisions, and data flow.

### Step 3: Generate the Article

1. Create a new Markdown file under `./.atmos/wiki/specify-wiki/` using kebab-case (e.g., `websocket-lifecycle.md`, `why-rust-backend.md`).
2. Follow the same content conventions as project-wiki:
   - YAML frontmatter: `title`, `section: "specify-wiki"`, `level`, `reading_time`, `path`, `sources` (array), `updated_at`
   - Prose-first, minimal code, prefer Mermaid diagrams
   - Required sections: Introduction, Overview, Architecture (with diagrams), Content sections, Key Source Files, Next Steps
3. Add the new article to `_catalog.json` under the `specify-wiki` section with correct `order`.

### Step 4: Update Catalog and Validate

1. Update `_catalog.json` with the new catalog entry.
2. Run validation scripts **from this skill's own directory** (do NOT modify scripts in other skill directories):
   ```bash
   python3 ~/.atmos/skills/.system/project-wiki-specify/scripts/validate_frontmatter.py .atmos/wiki/
   python3 ~/.atmos/skills/.system/project-wiki-specify/scripts/validate_catalog.py .atmos/wiki/_catalog.json
   ```

## Alignment with project-wiki

All generated content MUST follow the same conventions as the full project-wiki skill:
- Same frontmatter schema (with `section: "specify-wiki"`)
- Same content style (prose-first, minimal code, prefer Mermaid)
- Same file naming (kebab-case under `.atmos/wiki/specify-wiki/`)
- Same catalog item structure (id, title, path, order, file, section, level, reading_time, children)

## Edge Cases

- **Topic too broad**: Suggest a more focused topic or split into multiple articles.
- **Topic not applicable**: If the codebase has no relevant code, explain that to the user and suggest an alternative.
- **Duplicate content**: If a similar article already exists, consider updating it instead of creating a duplicate.
