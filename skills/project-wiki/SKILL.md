---
name: project-wiki
description: This skill should be used when the user asks to "generate project wiki", "create project documentation", "document the codebase", "generate a wiki for this project", "create docs from code", or wants to produce a comprehensive, navigable documentation set from source code stored locally as Markdown files in `.atmos/wiki/`.
---

# Project Wiki Generation Skill

This skill guides a Code Agent to generate a structured, file-based Project Wiki from a given codebase. The entire Wiki is stored as Markdown files in the `./.atmos/wiki/` directory, making it portable, version-controllable, and easy for a frontend to render.

## Core Philosophy

- **Local First**: The Wiki lives with the code. No external databases or services required.
- **Agent-Driven**: Empowers any Code Agent to perform high-quality documentation generation.
- **Structured & Navigable**: A JSON-based catalog ensures a consistent and explorable documentation structure.
- **Git-Friendly**: The entire Wiki can be committed to the repository, versioned, and shared.

## Generation Workflow

Follow this multi-step process sequentially to generate a complete and accurate Project Wiki.

### Step 1: Understand the Project & Create Output Directory

1. Thoroughly analyze the entire codebase to understand its purpose, architecture, and key components. Pay close attention to:
   - The project's entry points (e.g., `main.rs`, `main.py`, `index.ts`).
   - The primary dependencies and frameworks used.
   - The overall directory structure and module organization.
2. Create the output directory: `mkdir -p ./.atmos/wiki/`.

### Step 2: Generate the Project Mindmap (Optional but Recommended)

- **Action**: Create a file named `_mindmap.md` in the `./.atmos/wiki/` directory.
- **Content**: Generate a Mermaid `mindmap` that provides a high-level visual overview of the project's architecture, core modules, and key technologies.
- **Reference**: Consult `references/output_structure.md` for the `_mindmap.md` specification and format details.

### Step 3: Generate the Catalog (`_catalog.json`)

This is the most critical step. A master JSON file defines the entire structure of the Wiki.

1. **Action**: Create a file named `_catalog.json` in the `./.atmos/wiki/` directory.
2. **Task**: Based on the codebase analysis, design a hierarchical documentation structure organized by **business function or logical domain**, not merely by file structure.
3. **Output Format**: The JSON object MUST conform to the JSON Schema defined in `references/catalog.schema.json`. Read this schema file to understand the exact structure and validation rules.
   - For each entry, define its `id`, `title`, `path`, `order`, `file`, and `children`.
   - The `path` should correspond to the directory structure to be created in the next step.
   - Use dot notation for hierarchical `id` values (e.g., `core.authentication`).
   - Refer to `examples/sample_catalog.json` for a concrete example.
4. **Validation**: After generating `_catalog.json`, validate it against the JSON Schema to ensure correctness. Use the validation scripts in `scripts/` if available in the runtime environment.

### Step 4: Generate Markdown Content for Each Catalog Entry

Iterate through every entry in the `catalog` array and generate the corresponding Markdown file.

#### Parallel Generation (Recommended)

For improved efficiency, spawn multiple subagents to generate documentation in parallel:

1. **Identify Parallelizable Items**: Extract all leaf-level catalog items (items with no children or items that can be documented independently).
2. **Spawn Subagents**: For each item, spawn a subagent with the following context:
   - The catalog item metadata (`id`, `title`, `path`, `file`)
   - The project's overall context (architecture, tech stack)
   - The content generation rules (see below)
3. **Coordinate Output**: Each subagent writes its output to the specified file path.
4. **Parallelization Strategy**:
   - Process top-level sections sequentially to establish context.
   - Parallelize all child items within each section.
   - Recommended parallelism: 3-5 concurrent subagents depending on system resources.

#### Content Generation Rules

Whether generating sequentially or in parallel, each Markdown file MUST adhere to the following:

1. **Create Directories**: For each top-level and nested entry in `_catalog.json`, create the corresponding subdirectories inside `./.atmos/wiki/` (e.g., `./.atmos/wiki/overview/`, `./.atmos/wiki/core/`).
2. **Generate Files**: For each entry, create the specified Markdown file (e.g., `./.atmos/wiki/overview/quick-start.md`).
3. **Content Rules**: Each Markdown file MUST be well-structured. Consult `references/output_structure.md` for the full Markdown document specification, and `examples/sample_document.md` for a concrete example. Key rules:
   - **MUST include an `## Overview` section.**
   - **MUST include an `## Architecture` section with a Mermaid diagram** that accurately reflects the component's relationships.
   - **MUST include code snippets from the actual source code.** Do not invent code.
   - **MUST provide a source file link** for every code snippet, using a relative path from the project root (e.g., `> **Source**: [src/main.rs](../../../src/main.rs)`).
   - **MUST use relative links** for cross-referencing other Wiki documents (e.g., `[See Authentication](../core/authentication.md)`).
   - **SHOULD use Frontmatter** to specify `title`, `path`, and `sources`.

## Final Verification

Before finishing, perform a quick check:

1. Does `./.atmos/wiki/_catalog.json` exist and is it valid JSON?
2. Does it validate against the JSON Schema in `references/catalog.schema.json`?
3. Does every entry in `_catalog.json` have a corresponding Markdown file on disk?
4. Do all Markdown files use relative links for navigation?
5. Do all code snippets have a valid source file link?

## Additional Resources

### Reference Files

For detailed specifications and formats, consult:
- **`references/output_structure.md`** - Complete output structure specification (catalog format, Markdown document rules, mindmap format)
- **`references/catalog.schema.json`** - JSON Schema for `_catalog.json` validation
- **`references/frontend-integration.md`** - Frontend rendering guide (React components, library recommendations)

### Examples

Working examples in `examples/`:
- **`examples/sample_catalog.json`** - A minimal valid `_catalog.json` example
- **`examples/sample_document.md`** - A well-formatted wiki document example

### Scripts

Zero-dependency validation utilities in `scripts/`:
- **`scripts/validate_catalog.sh`** - Bash + jq validation (`bash scripts/validate_catalog.sh .atmos/wiki/_catalog.json`)
- **`scripts/validate_catalog.py`** - Python3 stdlib validation (`python3 scripts/validate_catalog.py .atmos/wiki/_catalog.json`)

By following this skill, a high-quality, maintainable, and valuable Project Wiki will be produced as an integral part of the codebase itself.
