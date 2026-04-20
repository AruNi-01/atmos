# Project Wiki Skill

A deep, research-grade project documentation generator for ATMOS. Empowers any Code Agent (Claude Code, Codex, Cursor, etc.) to generate structured Project Wikis from **thorough source code analysis**, with all content stored as Markdown files in the project's `.atmos/wiki/` directory.

## What Makes This Different

Unlike documentation generators that skim README files, this skill instructs agents to **deeply explore all source code** — reading entry points, core types, implementations, tests, and configuration — before writing any documentation. The result is a Wiki that explains not just *what* the code does, but *how* it works and *why* it was designed that way.

## Key Features

- **Deep Research** -- Agents read actual source code, not just README files
- **AST-Aware (Optional but Recommended)** -- Agents can consume backend-generated AST artifacts (built by Atmos backend embedded Tree-sitter parser) in `.atmos/wiki/_ast/` with file-level shard indexes for progressive disclosure
- **Two-Part Structure** -- "Getting Started" for newcomers + "Deep Dive" for contributors
- **Content Depth Standards** -- Minimum word counts, source references, code snippets, and diagrams per article
- **Reading Time & Difficulty** -- Each article tagged with estimated reading time and difficulty level
- **Local First** -- Wiki lives alongside code, no external database or service required
- **Agent-Driven** -- Any Code Agent can generate high-quality documentation using this skill
- **Structured Navigation** -- JSON-based catalog with hierarchical navigation
- **Git-Friendly** -- Entire Wiki can be committed, versioned, and shared
- **Parallel Generation** -- Supports spawning multiple subagents for efficient generation
- **Schema Validated** -- JSON Schema ensures catalog correctness

## Quick Start

### 1. Invoke with Your Code Agent

```bash
# Using Claude Code
claude "Generate project wiki using the project-wiki skill"

# Using Codex
codex "Create a comprehensive wiki for this project with the project-wiki skill"

# Using Cursor (with skill loaded)
# Ask: "Generate project wiki for this codebase"
```

### 2. Output

The skill generates a two-part Wiki:

```
.atmos/wiki/
├── _catalog.json                    # Navigation structure (required)
├── _mindmap.md                      # Project architecture mindmap (optional)
├── getting-started/                 # Part 1: For newcomers
│   ├── index.md                     # Welcome & overview
│   ├── overview.md                  # What the project is & provides
│   ├── quick-start.md               # Install & run in 5 minutes
│   ├── installation.md              # Detailed setup guide
│   ├── architecture.md              # High-level architecture
│   ├── key-concepts.md              # Core terminology
│   └── configuration.md             # All config options
└── deep-dive/                       # Part 2: For contributors
    ├── index.md                     # Deep dive overview
    ├── infra/                       # Infrastructure layer
    │   ├── index.md
    │   ├── database.md              # ~12 min read, advanced
    │   └── websocket.md             # ~13 min read, advanced
    ├── core/                        # Core modules
    │   ├── index.md
    │   └── ...
    ├── api/                         # API layer
    │   └── ...
    ├── frontend/                    # Frontend
    │   └── ...
    ├── build-system/                # Build & tooling
    │   └── index.md
    └── design-decisions/            # Architecture decisions
        └── index.md
```

### 3. Validate the Output

All scripts are zero-dependency -- no `pip install` or `npm install` required.

```bash
# Catalog structure
bash scripts/validate_catalog.sh .atmos/wiki/_catalog.json
# or: python3 scripts/validate_catalog.py .atmos/wiki/_catalog.json

# Metadata format (YAML frontmatter) — required before considering wiki complete
python3 scripts/validate_frontmatter.py .atmos/wiki/
```

**Important:** Metadata MUST use strict YAML frontmatter. Never use markdown blockquotes (`> **Reading Time:**`) or inline text — the frontend parser requires YAML only.

Example output:
```
✅ Catalog is valid!
   Version: 2.0
   Project: ATMOS
   Total items: 24
   Sections: deep-dive, getting-started
   Levels: advanced: 8, beginner: 7, intermediate: 9
   Total reading time: ~185 minutes
```

## Content Depth Standards

Each article must meet minimum quality thresholds:

| Metric | Getting Started | Deep Dive |
|--------|----------------|-----------|
| **Word Count** | 800+ words | 1500+ words |
| **Source Files** | 3+ referenced | 5+ referenced |
| **Code Snippets** | 0–1 (only when essential) | 0–2 (only when essential) |
| **Mermaid Diagrams** | 2+ | 3+ |
| **Reading Time** | 5-8 minutes | 8-15 minutes |
| **Cross-references** | 2+ links | 4+ links |

## Skill Package Contents

```
project-wiki/
├── SKILL.md                          # Core skill instructions (for the Agent)
├── README.md                         # This file (for humans)
├── references/
│   ├── output_structure.md           # Output format specification (v2.0)
│   ├── catalog.schema.json           # JSON Schema with section/level/reading_time
│   └── frontend-integration.md       # Frontend rendering guide
├── examples/
│   ├── sample_catalog.json           # Two-part catalog structure example
│   └── sample_document.md            # Deep, well-researched wiki article example
└── scripts/
    ├── validate_catalog.sh           # Bash + jq validation (zero dependencies)
    └── validate_catalog.py           # Python3 stdlib validation with v2.0 stats
```

## Article Metadata

Each article includes frontmatter with:

```yaml
---
title: WebSocket Service Architecture
section: deep-dive          # getting-started or deep-dive
level: advanced             # beginner, intermediate, or advanced
reading_time: 13            # estimated minutes
path: deep-dive/infra/websocket
sources:                    # actual source files researched
  - crates/infra/src/websocket/manager.rs
  - crates/infra/src/websocket/connection.rs
  - apps/api/src/api/ws/handlers.rs
updated_at: 2026-02-10T12:00:00Z
---
```

## Research Methodology

The skill instructs agents to follow a three-phase research process:

1. **Broad Scan** -- Read top-level files, map directory structure, identify tech stack
2. **Deep Exploration** -- For each module: read entry points, core types, implementations, tests, error types, and configuration
3. **Flow Tracing** -- Follow data flow from API entry points through business logic to storage

This produces documentation that reflects actual code behavior, not just surface-level descriptions.

## Design Advantages

| Feature | Description |
|---------|-------------|
| **Research-Grade** | Agents read source code, not just README files |
| **Two-Part Structure** | Progressive disclosure from beginner to advanced |
| **Depth Enforced** | Minimum quality standards per article type |
| **Traceable** | Key Source Files table; any code snippet must link to its source |
| **Connected** | Cross-references and "Next Steps" link articles together |
| **Git-Friendly** | Full version control support |
| **Frontend-Friendly** | JSON + Markdown with rich metadata |
| **Validated** | JSON Schema with v2.0 field support |

## Comparison with Alternatives

| Dimension | Zread/OpenDeepWiki | ATMOS Project Wiki |
|-----------|-------------------|-------------------|
| **Storage** | Database / Cloud | Local File System |
| **Generation** | Built-in AI | User's Code Agent + Skill |
| **Research Depth** | README-focused | Full source code exploration |
| **Structure** | Auto-generated chapters | Two-part: Getting Started + Deep Dive |
| **Metadata** | Basic | Section, level, reading_time, sources |
| **Version Control** | Cloud versioning | Git |
| **Flexibility** | Fixed process | Agent freedom with quality guardrails |

## Troubleshooting

### Articles are too shallow

The skill enforces minimum depth standards. If articles don't meet them, re-run with emphasis on the "Deep Codebase Research" step in SKILL.md. Ensure the agent reads actual source files (`.rs`, `.ts`, `.tsx`) not just documentation files.

### Agent generates invalid `_catalog.json`

Run the validation script to see detailed errors:
```bash
python3 scripts/validate_catalog.py .atmos/wiki/_catalog.json
```

### Missing section/level/reading_time fields

These are new in v2.0. The validation script will show warnings for missing optional fields. Re-run generation with the updated SKILL.md to include all metadata.

### Code examples lack source links

Every code block must have a `> **Source**: [path](relative-link)` line. Re-run with emphasis on the source file link rule.

## Best Practices

1. **Research before writing** -- Ensure the agent completes Step 1 (Deep Codebase Research) thoroughly before any writing
2. **Organize by concern** -- Structure by what readers need to understand, not by file layout
3. **Progressive disclosure** -- Getting Started gives mental models, Deep Dive fills in details
4. **Source traceability** -- Key Source Files table; any code snippet must link to its source file
5. **Connect the dots** -- Every article must link to related articles via "Next Steps"
6. **Validate before committing** -- Always run the validation scripts

## Future Enhancements

- **Incremental Updates** -- Monitor Git changes and regenerate only affected documents
- **Multi-language Support** -- Generate multiple language versions of the Wiki
- **Search Index** -- Build full-text search based on Markdown content
- **AI Q&A** -- Combine with RAG technology for intelligent Q&A on top of the Wiki
- **Quality Scoring** -- Automated quality assessment of generated articles

---

**Version**: 2.0
**Last Updated**: 2026-02-11
