# Agents Reference - AGENTS.md

This directory contains cross-cutting references and guidelines that apply across the entire codebase.

## Usage

- Do not load all reference files by default.
- When working on a specific area, only read the relevant reference file.
- Reference files are loaded on-demand based on the task at hand.

## Reference Files

| File | When to Load |
|------|--------------|
| `references/keyboard-shortcuts.md` | When implementing keyboard shortcuts, global hotkeys, or overlay focus management |
| `references/debug-logging.md` | When adding debug logging or instrumenting lifecycle flows |
| `references/compact-instructions.md` | When compressing context or creating coding handoff summaries |

## Directory Structure

```
agents/
├── AGENTS.md              # This file - index and usage guide
└── references/            # Cross-cutting references
    ├── keyboard-shortcuts.md  # Keyboard shortcuts and overlay focus
    ├── debug-logging.md        # Debug logging infrastructure
    └── compact-instructions.md # Context compression and handoff summaries
```

## Architecture pointers (not loaded by default)

For **local runtime**, **Desktop/CLI ensure**, or **Atmos Computer / relay**, read the area `AGENTS.md` instead of adding duplicate docs here:

- [../AGENTS.md](../AGENTS.md) — unified runtime overview
- [../crates/runtime-manager/AGENTS.md](../crates/runtime-manager/AGENTS.md)
- [../packages/relay/AGENTS.md](../packages/relay/AGENTS.md)
- [../specs/APP/APP-016_atmos-computer/TECH.md](../specs/APP/APP-016_atmos-computer/TECH.md)

## Adding New References

When adding a new reference file:

1. Create the file in `agents/references/`
2. Add a clear "When to load" section at the top
3. Update this index file with the new entry
4. Link to it from the root `AGENTS.md` if it's a commonly-used reference

## Authoring Guidelines

- Keep reference files focused on a single topic
- Include practical examples and code patterns
- Provide checklists for verification
- Link to related files where appropriate
- Use clear section headers for navigation
