---
name: project-wiki
version: "1.0.0"
description: This skill should be used when the user asks to "generate project wiki", "create project documentation", "document the codebase", "generate a wiki for this project", "create docs from code", or wants to produce a comprehensive, navigable documentation set from source code stored locally as Markdown files in `.atmos/wiki/`.
---

# Project Wiki Generation Skill

This skill guides a Code Agent to generate a **deep, research-grade** Project Wiki from a given codebase. The Wiki is stored as Markdown files in `./.atmos/wiki/`, making it portable, version-controllable, and easy for a frontend to render.

## Mandatory Checklist (Cannot Skip)

Before considering the wiki complete, ALL of the following must be true:

1. **Create/maintain `_todo.md`** — Run `~/.atmos/skills/.system/project-wiki/scripts/init_wiki_todo.sh` from project root (or create manually), update checkboxes as you progress.
2. **Git metadata collected** — Run `~/.atmos/skills/.system/project-wiki/scripts/collect_metadata.sh` (outputs to `.atmos/wiki/_metadata/`).
3. **validate_catalog passes** — Run `~/.atmos/skills/.system/project-wiki/scripts/validate_catalog.py` or `.sh`.
4. **validate_frontmatter passes** — Run `~/.atmos/skills/.system/project-wiki/scripts/validate_frontmatter.py`.
5. **validate_content passes** — Run `~/.atmos/skills/.system/project-wiki/scripts/validate_content.py` or `.sh`.
6. **validate_todo passes** — Run `~/.atmos/skills/.system/project-wiki/scripts/validate_todo.py` or `.sh`.
7. All `_todo.md` items checked `[x]` — Do not mark complete until every item is checked.

**Validation scripts**: `validate_catalog`, `validate_content`, and `validate_todo` each have `.py` and `.sh` variants. Use `.sh` on systems without Python when available.

## Core Philosophy

- **Concept Research, Not Code Summary**: Each article is produced by a research-type Agent that explores *why* and *how it evolved*, not just *what* the code does. Metadata (Git history, PRs, Issues) is as important as source code.
- **Deep Research**: Every article is produced by thoroughly reading actual source code and related metadata, not just skimming README files.
- **Two-Part Structure**: The Wiki is split into **Getting Started** (for newcomers) and **Deep Dive** (for contributors/maintainers).
- **Local First**: The Wiki lives with the code. No external databases or services required.
- **Agent-Driven**: Empowers any Code Agent to perform high-quality documentation generation.
- **Structured & Navigable**: A JSON-based catalog ensures a consistent and explorable documentation structure.
- **Prose-First, Not Code-First**: Readers come for business logic, implementation reasoning, and technical architecture — not to read code. **Translate code logic into natural language**. Use Mermaid diagrams (architecture, flow, sequence) liberally. Prefer structured prose and diagrams over code blocks.

## Generation Workflow

Follow this multi-step process sequentially to generate a complete and accurate Project Wiki. Use `_todo.md` to track progress and **validation gates** to ensure schema compliance before proceeding.

---

### Step 1: Create `_todo.md` (Mandatory First Step)

Before any other work, ensure `./.atmos/wiki/_todo.md` exists. Run from project root:

```bash
bash ~/.atmos/skills/.system/project-wiki/scripts/init_wiki_todo.sh
```

Or create manually. See the script for the full checklist. Update checkboxes as you complete each item. **Do not consider the wiki complete until all items are checked.** Use this file as your source of truth.

---

### Step 2: Collect Git Metadata

Run the metadata collection script from project root:

```bash
bash ~/.atmos/skills/.system/project-wiki/scripts/collect_metadata.sh
```

This creates `.atmos/wiki/_metadata/` with:
- `commit_graph.txt` — `git log --oneline --graph`
- `commit_details.txt` — Full commit log with file stats
- `contributors.txt` — `git shortlog`
- `prs.json`, `issues.json` — PR/Issue list (if `gh` CLI available)

**Critical**: Read these files before and during article generation. Git history and PR/Issue discussions reveal design intent and evolution — metadata often explains *why* better than code alone.

Update `_todo.md`: check `[x] Git metadata collected`.

---

### Step 3: Deep Codebase Research

**This is the most important step.** Do NOT just read README files. You must deeply explore the entire codebase. Also read `.atmos/wiki/_metadata/` (from Step 2) to understand how the project evolved.

#### 3.1 Initial Survey (Broad Scan)

1. Read the project's top-level files: `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`, `Cargo.toml`, `package.json`, `justfile`, `Makefile`, etc.
2. Map the full directory structure (all levels) to understand the project layout.
3. Identify the tech stack, frameworks, languages, and build tools.

#### 3.2 Deep Code Exploration (Source-Level)

For **each major module/package/crate** in the project:

1. **Read entry points**: `main.rs`, `lib.rs`, `mod.rs`, `index.ts`, `index.tsx`, etc.
2. **Read core types and structs**: Find the key data structures, traits, interfaces, and types that define the module's API.
3. **Read implementation files**: Understand how core functions work, not just their signatures.
4. **Read configuration**: Environment variables, config files, feature flags.
5. **Read tests**: Test files often reveal actual usage patterns and edge cases.
6. **Read error types**: Error handling reveals the failure modes and edge cases of a module.
7. **Trace data flow**: Follow how data moves from API entry points through business logic to storage.

#### 3.3 Research Notes

For each module, build mental notes covering:

- **Purpose**: What problem does this module solve?
- **Key Types**: What are the 3-5 most important types/structs/interfaces?
- **Public API**: What functions/methods are exposed to other modules?
- **Internal Flow**: How does a typical request/operation flow through this module?
- **Dependencies**: What does this module depend on? What depends on it?
- **Configuration**: What environment variables or config options affect behavior?
- **Error Handling**: What can go wrong and how is it handled?
- **Source Files**: Which files contain the code described? (Record precise file paths and line ranges.)

Update `_todo.md`: check `[x] Deep codebase research done`.

---

### Step 4: Extract Core Concepts

Based on the codebase research and metadata, extract 5–15 core concepts that define the project's architecture and design. Create `./.atmos/wiki/_concepts.json`:

```json
{
  "concepts": [
    {
      "id": "concept-id",
      "name": "Concept Name",
      "description": "1-2 sentence description",
      "importance": "high|medium|low",
      "related_files": ["path/to/file.rs", "..."],
      "related_commits": ["abc1234: commit message", "..."],
      "related_concepts": ["other-concept-id", "..."]
    }
  ]
}
```

**What counts as a concept**: Recurring design patterns, technical decisions (e.g. "Worktree isolation", "RwLock connection registry"), business abstractions (e.g. "Workspace lifecycle"). Use metadata to identify how the team talks about these ideas (PR titles, commit messages).

Update `_todo.md`: check `[x] Core concepts extracted`.

---

### Step 5: Design the Two-Part Catalog Structure

Create the output directory if not already done:

```bash
mkdir -p ./.atmos/wiki/
```

Ensure `_todo.md` exists from Step 1 and concepts from Step 4.

The Wiki MUST be organized into **two major sections**:

#### Part 1: Getting Started (入门指南)

Target audience: **New users and developers** who want to understand what the project does and get it running.

Required articles (adapt to the specific project):

| Article | Content Focus | Level |
|---------|---------------|-------|
| Overview | What the project is, what it provides, key features, who it's for | Beginner |
| Quick Start | Install, configure, and run in 5 minutes | Beginner |
| Installation & Setup | Detailed setup for all environments, prerequisites, troubleshooting | Beginner |
| Architecture Overview | High-level architecture with diagrams, module relationships, tech stack | Beginner |
| Key Concepts | Core terminology, design patterns, mental models needed to work with the project | Beginner |
| Configuration Guide | All configuration options, environment variables, feature flags | Intermediate |

#### Part 2: Deep Dive (深入探索)

Target audience: **Contributors, maintainers, and advanced users** who need to understand implementation details.

Required articles (adapt to the specific project):

| Article | Content Focus | Level |
|---------|---------------|-------|
| Module/Package deep dives | One article per major module with full implementation details | Intermediate-Advanced |
| Data Flow & Lifecycle | How data moves through the system end-to-end | Advanced |
| API Reference | Complete endpoint documentation with request/response examples | Intermediate |
| Database & Storage | Schema design, migrations, query patterns | Advanced |
| Build System & Tooling | Build pipeline, CI/CD, development workflow details | Intermediate |
| Testing Strategy | Test architecture, how to write tests, coverage approach | Intermediate |
| Design Decisions | Why key architectural choices were made, trade-offs considered | Advanced |

#### Catalog Design Rules

1. **Organize by concern, not by file structure** -- Group articles by what readers need to understand, not by where files live in the repo.
2. **Every section needs an index** -- Each directory must have an `index.md` that provides an overview and links to child articles.
3. **Cross-link aggressively** -- Every article should link to related articles in both Getting Started and Deep Dive sections.

---

### Step 6: Generate the Catalog (`_catalog.json`)

**CRITICAL**: The frontend and validation scripts expect an exact schema. Deviations cause rendering failure or validation errors. Read `references/catalog.schema.json` and `examples/catalog.template.json` before writing.

#### 3.1 Required Root-Level Structure

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `version` | string | `"2.0"` | Must match pattern `^\d+\.\d+$` |
| `generated_at` | string | `"2026-02-11T12:00:00Z"` | ISO 8601 |
| `commit_hash` | string | `"abc1234"` | From `git rev-parse HEAD` — **required** |
| `project` | **object** | See below | **NEVER a string** |
| `catalog` | array | See below | Hierarchical tree |

**`project` MUST be an object:**
```json
"project": {
  "name": "Project Name",
  "description": "Brief project description",
  "repository": "https://github.com/org/repo"
}
```

#### 3.2 Catalog Must Be Hierarchical

- Top-level `catalog` array contains **section nodes** (getting-started, deep-dive), NOT flat articles.
- Each section has `children: [...]` containing the articles for that section.
- Every item (section or article) MUST have: `id`, `title`, `path`, `order` (integer), `file`, `children` (array; `[]` for leaf articles).
- Use `examples/catalog.template.json` as the minimal skeleton — copy it, then populate `project` and expand `children` arrays with your articles.

#### 3.3 COMMON MISTAKES — DO NOT

| Mistake | Correct |
|---------|---------|
| `"project": "my-project"` (string) | `"project": { "name": "...", "description": "..." }` (object) |
| Flat `catalog: [{id:"overview",...},{id:"quick-start",...}]` | Nested: `catalog: [{id:"getting-started", children:[...]}, {id:"deep-dive", children:[...]}]` |
| Missing `order` or `children` on items | Every item: `"order": 0`, `"children": []` (or array of children) |
| Missing `commit_hash` | Run `git rev-parse HEAD`, add to root |
| `version`: `"1.0.0"` | Use `"2.0"` (pattern is X.Y) |
| Adding `description` to catalog items | Not in schema — omit or use only schema fields |

#### 3.4 Validation Gate (Blocking Loop)

```bash
# Scripts are in the skill dir; use .py if Python available, else .sh (no Python required)
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_catalog.py .atmos/wiki/_catalog.json
# OR: bash ~/.atmos/skills/.system/project-wiki/scripts/validate_catalog.sh .atmos/wiki/_catalog.json
```

- If it fails: read the error output, fix `_catalog.json`, run again.
- Repeat until the script exits with success (✅).
- **Do NOT proceed to Step 7 until validation passes.** Update `_todo.md` to check `[x] validate_catalog passes` only after success.

---

### Step 7: Generate the Mindmap (`_mindmap.md`)

- **Action**: Create `_mindmap.md` in `./.atmos/wiki/`.
- **Content**: Generate a Mermaid `mindmap` showing the project's architecture, organized by the two-part structure.
- **Reference**: See `references/output_structure.md` for format details.

---

### Step 8: Generate Research Briefings

For each **Deep Dive** catalog entry (leaf article, not index), generate a research briefing in `.atmos/wiki/_briefings/`. Use `references/briefing_template.md` and `examples/sample_briefing.md` as templates.

Each briefing MUST include:
- **Involved concepts** (from `_concepts.json`)
- **Role in the project** (2–4 sentences)
- **Relevant Git history** (3–5 commits from `_metadata/commit_details.txt`)
- **Related PRs/Issues** (if any)
- **Research questions** (see template)
- **Required source files** (at least 5 for Deep Dive)

File path: `_briefings/{path}.md` (e.g. `_briefings/deep-dive/infra/websocket.md`).

Update `_todo.md`: check `[x] Research briefings generated`.

---

### Step 9: Generate Markdown Content for Each Catalog Entry

Iterate through every entry in the `catalog` array and generate the corresponding Markdown file.

#### Agent Role: Research-Type, Not Document Generator

**Critical**: Subagents must act as **technical researchers**, not document writers. Their task is to *research a concept* and produce findings, not to "summarize code." Include the research briefing (from Step 8) for Deep Dive articles, and instruct the Agent to answer every research question in the briefing.

#### Parallel Generation (Recommended)

1. **Identify Parallelizable Items**: Extract all leaf-level catalog items.
2. **Spawn Subagents**: For each item, spawn a subagent with:
   - The catalog item metadata (`id`, `title`, `path`, `file`, `level`, `section`)
   - **For Deep Dive**: The research briefing from `_briefings/{path}.md` and instruction to answer all research questions
   - The project's overall context (architecture, tech stack)
   - **Specific source files to read** — the subagent MUST read these before writing
   - The content generation rules (see below)
   - **CRITICAL: Metadata format** — Copy into the subagent prompt:

     > **Metadata MUST use YAML frontmatter ONLY.** The file MUST start with `---` on the first line, followed by valid YAML (title, section, level, reading_time, path, sources as array, updated_at), then `---` on a line by itself, then a blank line, then the H1 title and body. Do NOT use markdown blockquotes (`> **Reading Time:**`), do NOT put metadata anywhere except in the YAML block.

   - **CRITICAL: Research-type role** — Copy into the subagent prompt:

     > **You are a technical researcher, not a document summarizer.** Your task is to *research* this topic. Read the research briefing (if provided) and answer every research question. Read the source files and metadata (Git history). Explain *why* and *how it evolved*, not just *what*. If your article is under the word minimum, expand by adding more detail to each section — do not add filler.

3. **Parallelization Strategy**:
   - Process index/overview pages first to establish context.
   - Parallelize all child articles within each section.
   - Recommended: 3-5 concurrent subagents.

#### Content Depth Requirements

**This is what differentiates a great Wiki from a mediocre one.** Each article MUST meet these depth standards:

| Metric | Getting Started Articles | Deep Dive Articles |
|--------|------------------------|-------------------|
| **Minimum Word Count** | 800+ words | 1500+ words |
| **Source Files Referenced** | 3+ files | 5+ files |
| **Code Snippets** | 0–1 (only when essential) | 0–2 (only when essential) |
| **Mermaid Diagrams** | 2+ diagrams | 3+ diagrams |
| **Estimated Reading Time** | 5-8 minutes | 8-15 minutes |

**Important:** Readers come to understand **business logic, implementation reasoning, and technical architecture** — not to read code. Do NOT fill articles with code blocks. **Translate code logic into natural language**. Use architecture diagrams, flowcharts, and sequence diagrams instead of quoting source code.

#### Content Generation Rules

Each Markdown file MUST adhere to the following. Consult `references/output_structure.md` for the full specification and `examples/sample_document.md` for a detailed example.

##### Frontmatter (Required) — YAML Only, Strict Format

**CRITICAL:** Metadata MUST use YAML frontmatter. The frontend parser expects this exact format. Any other format (markdown blockquotes, inline text, etc.) will cause rendering failure.

**Correct format** — file must start like this, nothing before the first `---`:

```yaml
---
title: Article Title
section: getting-started
level: intermediate
reading_time: 12
path: section/article-name
sources:
  - src/module/file1.rs
  - src/module/file2.rs
  - src/module/file3.rs
updated_at: 2026-02-10T12:00:00Z
---

# Article Title

First paragraph of content...
```

**FORBIDDEN** — never use these:

- `> **Reading Time:** 13 minutes` (markdown blockquote)
- `> **Source Files:** 8+ referenced` (markdown blockquote)
- Any metadata placed in the document body
- Metadata before the first `---` delimiter

##### Required Sections for Every Article

1. **Introduction paragraph** (no heading) -- A 2-4 sentence summary that immediately tells the reader what this article covers and why it matters. This goes right after the H1 title.

2. **`## Overview`** -- Detailed description of the module's purpose, responsibilities, and where it fits in the overall architecture. For Getting Started articles, this should be approachable and explain "what" and "why". For Deep Dive articles, this should include technical details about "how".

3. **`## Architecture`** -- Mermaid diagram(s) showing the component's internal structure and its relationships to other modules. Must accurately reflect the actual code.

4. **Content Sections** (varies by article type) -- These are the meat of the article. Use H2 and H3 headings freely. Each section should:
   - **Translate code logic into natural language** — describe *what* the code does and *why*, not paste code
   - Use **Mermaid diagrams** (architecture, flowchart, sequence) to illustrate flow and structure
   - Explain concepts with context and reasoning in prose
   - Cover error cases and edge cases in text
   - Reference configuration options where relevant
   - **Use code snippets sparingly** — only when a brief 2–3 line example is genuinely clearer than prose

5. **`## Key Source Files`** -- A table listing the most important source files covered in this article:

   ```markdown
   | File | Purpose |
   |------|---------|
   | `src/auth/service.rs` | Core authentication logic |
   | `src/auth/middleware.rs` | Request authentication middleware |
   ```

6. **`## Next Steps`** -- 2-4 links to related articles the reader should explore next, with brief descriptions of what they'll learn.

##### Mandatory Content Rules

| Rule | Description |
|------|-------------|
| **Prose over code** | Prefer natural language and Mermaid diagrams over code blocks. Translate implementation logic into readable explanations. |
| **Diagram-heavy** | Use architecture diagrams, flowcharts, and sequence diagrams to illustrate structure and flow. At least 2–3 Mermaid diagrams per article. |
| **Minimal code** | Code snippets only when a short 2–3 line example is truly clearer than prose. Avoid long code blocks. |
| **Source file links** | If you include a code snippet, it MUST have a source file path. Prefer describing behavior in prose and citing the source file in the Key Source Files table. |
| **Mermaid accuracy** | Mermaid diagrams MUST reflect actual code architecture. |
| **Relative links** | Use relative paths for all cross-document references. |
| **Trace the flow** | For Deep Dive articles, trace how a request/operation flows — use sequence diagrams and numbered steps, not code. |
| **Cover error handling** | Explain what happens when things go wrong in prose, not just the happy path. |

##### Writing Quality Standards

- **Translate, don't quote**: Describe what the code does in natural language. "The connection manager maintains a thread-safe registry of active WebSocket connections, keyed by client ID" — not a 20-line code block.
- **Be specific, not generic**: Instead of "this module handles authentication", say "this module verifies JWT tokens extracted from the Authorization header, validates them against the signing key, and injects the decoded claims into the request context for downstream handlers".
- **Diagram first**: Use Mermaid to show architecture, flow, and sequences. Diagrams communicate structure faster than code.
- **Explain the "why"**: Explain design decisions and trade-offs in prose. Don't rely on code to speak for itself.
- **Connect the dots**: Show how each module connects to others. Use flowcharts and sequence diagrams to trace data flow.
- **Progressive disclosure**: Getting Started articles should give readers a working mental model. Deep Dive articles should fill in implementation details — in prose and diagrams, not code dumps.

---

### Step 10: Metadata Format Verification (Mandatory)

After all Markdown files are generated, validate metadata format. Use the validation script:

```bash
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_frontmatter.py .atmos/wiki/
```

**Validation rules** (see skill script for full logic):

1. File MUST start with `---` on the first line.
2. A complete YAML block must exist between the first `---` and the second `---`.
3. Required YAML keys: `title`, `section`, `level`, `reading_time`, `path`, `sources` (array), `updated_at`.
4. `sources` MUST be a YAML array (hyphen-prefixed list), not a string.
5. NO markdown blockquotes (`> **Reading Time:**`) or inline metadata in the body.

**If any file fails validation:**

1. Record the file path and the specific error.
2. Regenerate that file — spawn a subagent with the failed file path, the validation error message, and this instruction: "Fix the metadata format. Use strict YAML frontmatter only. The file must start with `---` and valid YAML. See examples/sample_document.md."
3. Re-run validation until all files pass.
4. Do NOT consider the Wiki complete until `validate_frontmatter.py` exits with success.
5. Update `_todo.md` to mark frontmatter validation as complete only after it passes.

---

### Step 11: Content Depth Validation (Blocking Gate)

Run the content depth validator:

```bash
python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_content.py .atmos/wiki/
# OR: bash ~/.atmos/skills/.system/project-wiki/scripts/validate_content.sh .atmos/wiki/
```

This checks each article for: word count (800+ / 1500+), Mermaid diagrams (2+ / 3+), H2 sections (4+ / 6+), source files (3+ / 5+), cross-reference links (2+ / 4+).

**For each failing article:**
1. Read the failure reasons.
2. Re-read the research briefing and source files.
3. Regenerate the article with explicit instructions to expand the weak areas.
4. Re-run validation until all pass.

Do NOT consider the wiki complete until `validate_content` exits with success. Update `_todo.md`: check `[x] validate_content passes`.

---

## Final Verification

Before finishing, you MUST run all validation scripts and fix any errors. The wiki is NOT complete until all pass. **Use `.sh` versions if Python is not available.**

1. **Catalog validation** (required):
   ```bash
   python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_catalog.py .atmos/wiki/_catalog.json
   # OR: bash ~/.atmos/skills/.system/project-wiki/scripts/validate_catalog.sh .atmos/wiki/_catalog.json
   ```
   Must exit with success. Fix catalog structure (hierarchy, `order`, `children`) if it fails.

2. **Frontmatter validation** (required):
   ```bash
   python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_frontmatter.py .atmos/wiki/
   ```
   Must exit with success. Regenerate any failing Markdown files.

3. **Content depth validation** (required):
   ```bash
   python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_content.py .atmos/wiki/
   # OR: bash ~/.atmos/skills/.system/project-wiki/scripts/validate_content.sh .atmos/wiki/
   ```
   Must exit with success. Expand and regenerate any failing articles.

4. **Todo checklist validation** (required):
   ```bash
   python3 ~/.atmos/skills/.system/project-wiki/scripts/validate_todo.py .atmos/wiki/_todo.md
   # OR: bash ~/.atmos/skills/.system/project-wiki/scripts/validate_todo.sh .atmos/wiki/_todo.md
   ```
   Must exit with success. Ensure all checklist items are checked `[x]`.

5. All `_todo.md` items checked? If any validation was skipped, go back and fix.

6. Additional checks:
   - Does every catalog entry have a corresponding Markdown file on disk?
   - Does every Markdown file have proper YAML frontmatter with `section`, `level`, `reading_time`?
   - Does every article meet the minimum depth requirements (word count, source references, diagrams)?
   - Are diagrams used liberally and code blocks kept minimal?
   - Do all cross-document links use relative paths?
   - Does the Wiki have both "Getting Started" and "Deep Dive" sections with appropriate articles?
   - Do all "Next Steps" sections link to valid articles?

7. Update `_todo.md` to mark "Final verification complete".

---

## Additional Resources

### Reference Files

- **`references/output_structure.md`** - Complete output structure specification
- **`references/briefing_template.md`** - Research briefing template
- **`references/catalog.schema.json`** - JSON Schema for `_catalog.json` validation
- **`references/frontend-integration.md`** - Frontend rendering guide

### Examples

- **`examples/catalog.template.json`** - Minimal catalog skeleton; copy and populate (project, children)
- **`examples/sample_catalog.json`** - Full two-part catalog structure example
- **`examples/sample_document.md`** - A deep, well-researched wiki document example
- **`examples/sample_briefing.md`** - Research briefing example

### Scripts (all in `~/.atmos/skills/.system/project-wiki/scripts/`)

- **`init_wiki_todo.sh`** - Pre-create `_todo.md` (run from project root)
- **`collect_metadata.sh`** - Collect Git metadata to `_metadata/`
- **`validate_catalog.sh`** / **`validate_catalog.py`** - Validate `_catalog.json`
- **`validate_frontmatter.py`** - Validate YAML frontmatter format
- **`validate_content.sh`** / **`validate_content.py`** - Validate content depth (word count, diagrams, etc.)
- **`validate_todo.sh`** / **`validate_todo.py`** - Validate `_todo.md`

By following this skill, a **deep, research-grade, truly useful** Project Wiki will be produced -- one that readers will actually want to read and learn from.
