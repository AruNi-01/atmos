---
name: atmos-pt-design-agent
version: "2.0.0"
description: "Drive the user's open Atmos Prototype Design board via POST /api/pt-design/agent/invoke: read and edit document.ptx (PTX XML). Use for interactive canvas prototypes. Not Atmos Canvas. Not a wireframe layout engine."
license: MIT
---

# Atmos Prototype Design Agent

Operate the **live Prototype Design tab** with HTTP invoke. PTX is a source file. Read it, edit the XML, write the complete file back.

```text
Default path:  pt_ptx_get → edit XML → pt_ptx_apply → pt_screenshot
File path:     document.ptx in a .ptd directory (CLI/MCP --file only)
```

---

## Prerequisites

1. Prototype Design is open (Launchpad or `/pt-design`). Opening the tab is enough. Do **not** start MCP, install a CLI, join a collaboration room, or treat a `.ptdesign.json` as the Agent API.
2. `POST` the invoke URL from the copied prompt (loopback Atmos Server). Include `client_id` from that prompt when more than one tab is open. `/pt-design` is `global`.
3. Fresh `request_id` (UUID) on every call.

```json
{
  "request_id": "<uuid>",
  "tool": "pt_ptx_get",
  "args": {},
  "client_id": "global"
}
```

---

## Decision tree (load references on demand)

| User intent | What to do | Load reference |
|-------------|------------|----------------|
| Build or change the board | Workflow below | *(this file only)* |
| Which tags/attrs a type uses | `pt_catalog_list` (copy `xmlExample`) | [`references/catalog.md`](references/catalog.md) |
| Screenshot / live vs file | Workflow below | [`references/board.md`](references/board.md) |
| Full tool args / error codes / offline `.ptd` | — | [`references/command-reference.md`](references/command-reference.md) |

**Do not** invent Excalidraw JSON. **Do not** call APP-062 names (`pt_ir_get`, `pt_place`, `pt_layout_*`, `pt_batch`, …). They are unknown tools.

This is **not** Atmos Canvas (`atmos canvas`).

---

## Default workflow — edit PTX like source

1. `pt_tools_list` then `pt_catalog_list`. Each catalog row includes `xmlExample`, `agentDescription`, `defaultBBox`.
2. `pt_ptx_get` — pretty XML (`<page>…`).
3. Edit that XML (add/change tags, attrs, nested `<option>` / `<on>`). Surgical edits happen **inside** the full document text.
4. `pt_ptx_apply` with the **complete** new XML (like saving the file). An orphan snippet such as a lone `<option>` is `invalid_ptx`; the previous document is unchanged.
5. `pt_screenshot` to look at the open tab.

---

## Quick tools

| Tool | Notes |
|------|--------|
| `pt_ptx_get` | Pretty PTX string |
| `pt_ptx_apply` | Complete PTX source; parse/validate/project |
| `pt_catalog_list` | Tag names, attrs, XML snippets |
| `pt_screenshot` | PNG of the **open tab** |
| `pt_doc_open` / `pt_doc_save` / `pt_doc_init` | `.ptd` / `document.ptx` (offline CLI/MCP) |
| `pt_tools_list` | |

---

## Anti-patterns

- MCP / CLI `--file` against the open tab
- Collaboration room to mutate
- Excalidraw scene JSON as the Agent API
- Old tool names (`pt_ir_get`, `pt_layout_row`, `pt_place`, …)
- Applying a snippet that is not a full `<page>` document

---

## Errors (short)

| Code | Recovery |
|------|----------|
| `PT_DESIGN_BRIDGE_OFFLINE` | Open Prototype Design |
| `unknown_tool` | `pt_tools_list` — old names are not aliased |
| `unknown_type` | `pt_catalog_list` |
| `invalid_ptx` / `invalid_option` | Previous document unchanged |
| `missing_file` | `.ptd` / `document.ptx` on CLI/MCP |

More codes: [`references/command-reference.md`](references/command-reference.md).

---

## Reporting

- What changed in the PTX (ids, tags).
- One verification (`pt_ptx_get` and/or `pt_screenshot`).

---

## References (on-demand)

| File | Load when |
|------|-----------|
| [`references/catalog.md`](references/catalog.md) | XML tags, examples |
| [`references/board.md`](references/board.md) | Live vs file, screenshot |
| [`references/command-reference.md`](references/command-reference.md) | Full tool args, errors, offline `--file` |

Skill directory after sync: `~/.atmos/skills/.system/atmos-pt-design-agent/`
