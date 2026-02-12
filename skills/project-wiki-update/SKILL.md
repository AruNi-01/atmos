---
name: project-wiki-update
description: This skill should be used when the user wants to incrementally update an existing Project Wiki. It detects code changes since the wiki was generated, identifies affected wiki pages, and only regenerates those pages while preserving unchanged content.
---

# Project Wiki Incremental Update Skill

This skill guides a Code Agent to **incrementally update** an existing Project Wiki when the codebase has changed since the wiki was last generated. It follows the same formatting and content conventions as the full generation skill.

## Prerequisites

1. An existing wiki must exist at `./.atmos/wiki/` with a valid `_catalog.json` that includes `commit_hash`.
2. Read these shared references from **project-wiki** (installed at `~/.atmos/skills/.system/project-wiki/`) before making any changes:
   - **Content & formatting**: `~/.atmos/skills/.system/project-wiki/references/output_structure.md`
   - **Research briefing template**: `~/.atmos/skills/.system/project-wiki/references/briefing_template.md`
   - **Catalog schema**: `~/.atmos/skills/.system/project-wiki/references/catalog.schema.json`

All updated content MUST meet the same **content depth requirements** as project-wiki: 800+ words (Getting Started), 1500+ words (Deep Dive), 2–3+ Mermaid diagrams, 4–6+ H2 sections, sufficient sources and cross-references. Run `~/.atmos/skills/.system/project-wiki/scripts/validate_content.py` to verify.

## Input Context

The user prompt will provide:
- `catalog_commit`: The git commit hash when the wiki was generated (from `_catalog.json`)
- `current_commit`: The current HEAD commit hash

## Three-Phase Hybrid Strategy

### Phase 1: Source-Matched Pages (Automatic)

1. Read `_catalog.json` to get `commit_hash` and the full catalog structure.
2. Parse every wiki page's frontmatter to collect all `sources` fields → build a "covered files" set.
3. Run `git diff --name-only <catalog_commit>..HEAD` to get all changed files.
4. Partition changed files:
   - **Covered**: Files that appear in at least one page's `sources` → those pages are "definitely needs update".
   - **Uncovered**: Files not referenced by any page's `sources`.

### Phase 2: Uncovered Changes Analysis (AI Reasoning)

For each uncovered changed file, reason about it:
- **Add to existing page**: The change is conceptually related to an existing wiki topic (e.g., a new helper in `crates/infra/src/websocket/`) → update that page's content and add the file to its `sources` frontmatter.
- **Create new page**: A new module, feature, or API was introduced that deserves its own documentation → create a new wiki page, add it to `_catalog.json`.
- **Skip**: Trivial changes (config files, formatting, test-only, CI scripts, `.gitignore`, lock files) that do not warrant documentation updates.

### Phase 3: Cross-Cutting Impact Check

Review whether any changed file is a widely-used shared utility, base type, or core abstraction. If so, update wiki pages that describe behavior depending on it, even if they do not directly list it in `sources`.

## Execution Steps

### Step 0 (Optional): Refresh Metadata

If the update spans many commits or significant changes, run `bash ~/.atmos/skills/.system/project-wiki/scripts/collect_metadata.sh .atmos/wiki` to refresh `_metadata/`. This gives the Agent access to the latest Git history when regenerating pages.

### Step 1: Gather Changed Files

```bash
git diff --name-only <catalog_commit>..HEAD
```

If the old commit is no longer in history (force push/rebase), fall back to suggesting a full regeneration via the project-wiki skill.

### Step 2: Map Sources to Pages

For each leaf item in the catalog, read its Markdown file and extract the `sources` frontmatter. Build a mapping: `file_path -> [wiki_page_paths]`.

### Step 3: Identify Affected Pages

- Pages whose `sources` overlap with changed files → **must update**
- For uncovered changed files, use AI reasoning to decide: add to existing, create new, or skip.

### Step 4: Regenerate Affected Pages Only

For each affected page, act as a **research-type Agent** (not a document summarizer):

1. **Refresh context** (if available): Read `_metadata/commit_details.txt` and any related `_briefings/{path}.md` to understand evolution and research questions.
2. **Update research briefing** (for Deep Dive pages): If `_briefings/` exists, update the briefing for this page to reflect changed files and new commits. Add any new research questions raised by the code changes.
3. **Re-read source files** — they may have changed; trace the new data flow.
4. **Regenerate the article** using the same conventions as project-wiki:
   - Prose-first, minimal code, 2–3+ Mermaid diagrams
   - **Word count**: Getting Started 800+, Deep Dive 1500+
   - Answer all research questions in the briefing (if it exists)
   - Preserve frontmatter structure; update `sources` and `updated_at` if needed

**Do NOT modify** wiki pages that are not affected. **Do NOT** produce shallow summaries — each updated page must pass `validate_content`.

### Step 5: Update Catalog Metadata

1. Update `commit_hash` in `_catalog.json` to the current HEAD: `git rev-parse HEAD`
2. Update `generated_at` to the current ISO 8601 timestamp.
3. If you added new catalog items, insert them in the correct order and update the catalog structure.

### Step 6: Validate

Run all validation scripts from **project-wiki** (same as full generation). All must pass before the update is complete:

```bash
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_catalog.py .atmos/wiki/_catalog.json
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_frontmatter.py .atmos/wiki/
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_content.py .atmos/wiki/
```

If `validate_content` fails for any updated page, expand the content (add more prose, diagrams, cross-references) until it passes. Do NOT consider the update complete until all three validations succeed.

## Edge Cases

- **Massive diff**: If hundreds of files changed, use `git diff --stat` first. If too many files changed (>50 meaningful source files), suggest full regeneration instead.
- **New files with no existing page**: Create new wiki pages and add them to the appropriate section. For Deep Dive pages, create a research briefing in `_briefings/` first, then generate the article. Ensure the new page meets content depth requirements and passes `validate_content`.
- **Deleted files**: If a source file was deleted, remove it from the page's `sources` and update the content to reflect the change.

## Alignment with project-wiki

All generated or updated content MUST follow the same conventions as the full project-wiki skill:
- Same frontmatter schema (title, section, level, reading_time, path, sources, updated_at)
- Same content style (prose-first, minimal code, prefer Mermaid)
- **Same content depth** — must pass `validate_content` (word count, diagrams, H2 sections, sources, cross-references)
- Same file naming (kebab-case under `.atmos/wiki/`)
- Same catalog structure (Getting Started / Deep Dive, CatalogItem fields)
- Research-type Agent role — explain *why* and *how it evolved*, not just *what*
