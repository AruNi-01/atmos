# Agents Reference - AGENTS.md

This directory contains cross-cutting references and guidelines that apply across the entire codebase.

## Usage

- Do not load all reference files by default.
- When working on a specific area, only read the relevant reference file.
- Reference files are loaded on-demand based on the task at hand.

## Reference Files

| File | When to Load |
|------|--------------|
| `references/agents-md-authoring.md` | Creating/editing any `AGENTS.md`, or deciding whether a new constraint should become agent docs (progressive disclosure) |
| `references/desktop-floating-ui.md` | Dialogs/modals/sheets/popovers/menus/tooltips or other portaled UI that can cover **desktop native preview** (`WebContentsView`); preview occlusion / portal roots / overlay IPC |
| `references/keyboard-shortcuts.md` | When implementing keyboard shortcuts, global hotkeys, or overlay focus management |
| `references/debug-logging.md` | When adding debug logging or instrumenting lifecycle flows |
| `references/compact-instructions.md` | When compressing context or creating coding handoff summaries |
| `references/mobile/dev-setup.md` | When setting up or debugging the Expo mobile native dev environment |
| `references/mobile/native-navigation.md` | When changing mobile page titles, headers, navigation bars, or header buttons |
| `references/design/AGENTS.md` | When changing UI design, visual language, component styling, or platform-specific app chrome |
| `references/runtime/AGENTS.md` | When changing local runtime discovery, startup, relay identity, or Atmos Computer routing |

## Directory Structure

```
agents/
├── AGENTS.md              # This file - index and usage guide
└── references/            # Cross-cutting references (load on demand)
    ├── agents-md-authoring.md   # How to write AGENTS.md (progressive disclosure)
    ├── desktop-floating-ui.md   # Desktop overlay / native preview stacking (APP-052)
    ├── keyboard-shortcuts.md
    ├── debug-logging.md
    ├── compact-instructions.md
    ├── mobile/
    ├── design/
    └── runtime/
```

## Architecture pointers (not loaded by default)

For **local runtime**, **Desktop/CLI ensure**, or **Atmos Computer / relay**, start with the runtime reference, then load area-specific files as needed:

- [references/runtime/AGENTS.md](references/runtime/AGENTS.md) — unified runtime overview
- [../crates/runtime-manager/AGENTS.md](../crates/runtime-manager/AGENTS.md)
- [../packages/relay/AGENTS.md](../packages/relay/AGENTS.md)
- [../specs/APP/APP-016_atmos-computer/TECH.md](../specs/APP/APP-016_atmos-computer/TECH.md)

## Adding New References

When adding a new reference file:

1. Create the file in `agents/references/` or a focused subdirectory such as `agents/references/mobile/`
2. Add a clear "When to load" / "Do not load" section at the top
3. Update this index file with the new entry
4. Link from the root `Agents.md` **only if** the topic is commonly hit
5. Add a **short pointer** from the package AGENTS that owns the code — do not paste the full checklist there

Full progressive-disclosure rules and “ask the user before documenting learnings”:

→ **[agents-md-authoring.md](references/agents-md-authoring.md)**

## Authoring Guidelines (summary)

- Keep reference files focused on a single topic
- Include practical examples, real paths, and checklists
- Prefer **links down** over copy-paste across root / package / reference
- After a non-obvious constraint ships, **ask** before adding long AGENTS prose
