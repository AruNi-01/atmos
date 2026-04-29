---
name: project-wiki-specify
version: "2.0.0"
description: Research and add a focused topic page to an existing evidence-driven project wiki in `./.atmos/wiki/`. Use when the user wants a new wiki page for a specific feature, decision, mechanism, module, or architecture question, and the page should be planned, evidenced, registered, and linked into the wiki instead of being appended as a template article.
---

# Project Wiki Specify

Add one focused topic page to an existing evidence-driven wiki.

Read these shared references from `project-wiki` first:

- `~/.atmos/skills/.system/project-wiki/references/workflow.md`
- `~/.atmos/skills/.system/project-wiki/references/output_structure.md`
- `~/.atmos/skills/.system/project-wiki/references/page-quality.md`
- `~/.atmos/skills/.system/project-wiki/references/page-registry.schema.json`
- `~/.atmos/skills/.system/project-wiki/references/page-plan.schema.json`
- `~/.atmos/skills/.system/project-wiki/references/evidence-bundle.schema.json`

## Workflow

### 1. Locate the Topic

Determine whether the requested topic should:

- become a new `topic` page
- extend an existing page plan and page
- split an overloaded existing page into a more focused topic page

### 2. Plan Before Writing

Create or update:

- `page_registry.json`
- `_plans/<page-id>.json`
- `_evidence/<page-id>.json`
- `_coverage/coverage_map.json`

Do not jump directly to final prose.

### 3. Write the Page

Write the final Markdown page under `pages/` with frontmatter:

- `page_id`
- `title`
- `kind`
- `audience`
- `sources`
- `evidence_refs`
- `updated_at`

Default `kind` to `topic` unless another kind fits better.

### 4. Link It In

Update navigation inside `page_registry.json` so the page is reachable.

Default placement:

- put the page under an existing relevant group if there is one
- otherwise create a `Topics` navigation group

## Validation

Run:

```bash
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_page_registry.py .atmos/wiki/page_registry.json
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_frontmatter.py .atmos/wiki
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_page_quality.py .atmos/wiki
```
