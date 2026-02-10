# Project Wiki Skill

A lightweight, file-system-based project documentation generator for ATMOS. Empowers any Code Agent (Claude Code, Codex, Cursor, etc.) to generate structured Project Wikis, with all content stored as Markdown files in the project's `.atmos/wiki/` directory.

## Key Features

- **Local First** -- Wiki lives alongside code, no external database or service required
- **Agent-Driven** -- Any Code Agent can generate high-quality documentation using this skill
- **Structured Navigation** -- JSON-based catalog ensures consistency and explorability
- **Git-Friendly** -- Entire Wiki can be committed, versioned, and shared
- **Frontend-Friendly** -- Pure JSON + Markdown, easy to parse and render
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

The skill generates:

```
.atmos/wiki/
├── _catalog.json          # Navigation structure (required)
├── _mindmap.md            # Project architecture mindmap (optional)
├── overview/
│   ├── index.md
│   └── quick-start.md
├── core/
│   ├── index.md
│   └── authentication.md
└── api/
    ├── index.md
    └── endpoints.md
```

### 3. Validate the Output

Both scripts are zero-dependency -- no `pip install` or `npm install` required.

```bash
# Bash + jq (recommended, most portable)
bash scripts/validate_catalog.sh .atmos/wiki/_catalog.json

# Python3 stdlib only
python3 scripts/validate_catalog.py .atmos/wiki/_catalog.json
```

Example output:
```
✅ Catalog is valid!
   Version: 1.0
   Project: ATMOS
   Catalog items: 3
```

## Skill Package Contents

```
project-wiki/
├── SKILL.md                          # Core skill instructions (for the Agent)
├── README.md                         # This file (for humans)
├── references/
│   ├── output_structure.md           # Output format specification
│   ├── catalog.schema.json           # JSON Schema for _catalog.json
│   └── frontend-integration.md       # Frontend rendering guide
├── examples/
│   ├── sample_catalog.json           # A minimal valid catalog example
│   └── sample_document.md            # A well-formatted wiki page example
└── scripts/
    ├── validate_catalog.sh           # Bash + jq validation (zero dependencies)
    └── validate_catalog.py           # Python3 stdlib validation (zero dependencies)
```

## Design Advantages

| Feature | Description |
|---------|-------------|
| **Simple & Direct** | Pure file system, no database required |
| **Git-Friendly** | Full version control support |
| **Frontend-Friendly** | JSON + Markdown, easy to parse and render |
| **Agent-Friendly** | Clear structure, easy for agents to generate |
| **Extensible** | Supports arbitrary hierarchy levels |
| **Traceable** | Track source files via `sources` field |
| **Validated** | JSON Schema ensures correctness |
| **Parallel** | Efficient generation via subagents |

## Comparison with OpenDeepWiki

| Dimension | OpenDeepWiki | ATMOS Project Wiki |
|-----------|--------------|-------------------|
| **Storage** | Database | File System |
| **Generation** | Built-in AI Agent | User's Code Agent + Skill |
| **Catalog Format** | Database Table | JSON File |
| **Document Format** | Database Field | Markdown File |
| **Version Control** | Database Versioning | Git Version Control |
| **Frontend Complexity** | Requires API Calls | Direct File Reading |
| **Flexibility** | Fixed Process | Agent Freedom |
| **Validation** | Custom Code | JSON Schema |

## Troubleshooting

### Agent generates invalid `_catalog.json`

Run the validation script to see detailed errors:
```bash
bash scripts/validate_catalog.sh .atmos/wiki/_catalog.json
# or
python3 scripts/validate_catalog.py .atmos/wiki/_catalog.json
```

### Code examples lack source links

Re-run the generation with emphasis on the "MUST provide a source file link" rule, or manually review and add links after generation.

### Mermaid diagrams don't render in frontend

Ensure the frontend uses a Mermaid rendering library and correctly handles `language-mermaid` code blocks. See `references/frontend-integration.md` for setup details.

### Parallel generation causes file conflicts

Ensure each subagent writes to a unique file path. The skill's workflow guarantees non-overlapping paths when the catalog is generated first.

## Best Practices

1. **Organize by business function** -- Structure catalog by logical domain, not file structure
2. **Maintain appropriate granularity** -- Focus on module level, avoid one document per function
3. **Enforce code traceability** -- All code examples must link to source files
4. **Use Mermaid diagrams** -- Architecture and flow diagrams significantly improve quality
5. **Regenerate on change** -- Re-run affected documents when code changes
6. **Always validate** -- Run the validation scripts before committing the Wiki

## Future Enhancements

- **Incremental Updates** -- Monitor Git changes and regenerate only affected documents
- **Multi-language Support** -- Generate multiple language versions of the Wiki
- **Search Index** -- Build full-text search based on Markdown content
- **AI Q&A** -- Combine with RAG technology for intelligent Q&A on top of the Wiki

---

**Version**: 1.0
**Last Updated**: 2026-02-10
