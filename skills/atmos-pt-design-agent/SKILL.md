---
name: atmos-pt-design-agent
version: "1.0.0"
description: "Drive the user's open Atmos Prototype Design board via POST /api/pt-design/agent/invoke: frames, catalog components, layout, lint, and screenshots. Use for wireframe / prototype / landing-page mock requests. Not Atmos Canvas. Not live shadcn."
license: MIT
---

# Atmos Prototype Design Agent

Operate the **live Prototype Design tab** with HTTP invoke. Most requests are **static wireframes** — place catalog components, then layout and lint. Load deeper references only when placing specific components or debugging a tool.

```text
Default path:  catalog / frame / batch place / layout / lint / screenshot
Only if needed: catalog props · tool flags · offline .ptdesign.json
```

---

## Prerequisites

1. Prototype Design is open (Launchpad or `/pt-design`). Opening the tab is enough. Do **not** start MCP, install a CLI, join a collaboration room, or edit a separate `.ptdesign.json`.
2. `POST` the invoke URL from the copied prompt (loopback Atmos Server). Include `client_id` from that prompt when more than one tab is open. `/pt-design` is `global`.
3. Fresh `request_id` (UUID) on every call.

```json
{
  "request_id": "<uuid>",
  "tool": "pt_ir_get",
  "args": {},
  "client_id": "global"
}
```

---

## Decision tree (load references on demand)

| User intent | What to do | Load reference |
|-------------|------------|----------------|
| Landing, settings, auth, nav mock | Workflow below | *(this file only)* |
| Which props/variants a type actually draws | `pt_catalog_list` first | [`references/catalog.md`](references/catalog.md) |
| Frames, coordinates, layout, lint, screenshot | Workflow below | [`references/board.md`](references/board.md) |
| Full tool args / error codes / offline file | — | [`references/command-reference.md`](references/command-reference.md) |

**Do not** write Excalidraw `exec` / JS. **Do not** use `pt_apply_ir` as the drawing API.

This is **not** Atmos Canvas (`atmos canvas`). Prototype Design uses stable `componentType` ids.

---

## Default workflow — draw a page

1. `pt_tools_list` then `pt_catalog_list`. Catalog rows include `defaultBBox`, `propKeys`, `variants`, `defaultVariant`.
2. `pt_frame_create` with `preset: "desktop"` (or `tablet` / `mobile`) before laying out a product page. The 400×300 default is a scratch tile.
3. `pt_batch` places. `at` is **relative to the frame origin** when `frameId` is set. Prefer `below` / `rightOf` over hand-computed pixels.
4. `pt_layout_row` / `pt_layout_column` / `pt_layout_grid` to pack groups.
5. `pt_lint` → `pt_update.bbox` or layout until overlaps / overflow are gone.
6. `pt_screenshot { frameId }` to check spacing. Structure still comes from IR.

Omit `variant` → **one** instance (overlays use `trigger`). `mode: "showcase"` dumps every variant — catalog UI only; do not do that on a page.

---

## Quick tools

| Tool | Notes |
|------|--------|
| `pt_catalog_list` | Truth for size and editable props |
| `pt_frame_create` | `preset` desktop 1440×1024 / tablet 768×1024 / mobile 390×844 |
| `pt_place` | One instance; `below` / `rightOf`; frame-relative `at` |
| `pt_update` | props / variant / size / scene `bbox` / reparent `frameId` |
| `pt_batch` | Atomic by default; max 200 ops |
| `pt_layout_row` / `column` / `grid` | Pack existing instances |
| `pt_lint` | overlap, outside frame, free nodes, text clip |
| `pt_screenshot` | PNG `dataUrl` of the **open tab** |
| `pt_ir_get` | Scene coordinates; read after layout |

IR `bbox` is scene-absolute. `pt_place.at` with `frameId` is frame-relative.

---

## Anti-patterns

- MCP / CLI `--file` against the open tab
- Collaboration room to mutate
- `pt_apply_ir` to draw
- Showcase-placing badge/dialog/accordion onto a landing
- Guessing `card` size instead of `defaultBBox`
- 70 single `pt_place` calls instead of `pt_batch` + layout

---

## Errors (short)

| Code | Recovery |
|------|----------|
| `PT_DESIGN_BRIDGE_OFFLINE` | Open Prototype Design |
| `UNKNOWN_COMPONENT_TYPE` | `pt_catalog_list` |
| `NOT_FOUND` / `FRAME_AMBIGUOUS` | `pt_ir_get` / `pt_frames_list` |
| `USAGE` | `pt_tools_list` |

More codes: [`references/command-reference.md`](references/command-reference.md).

---

## Reporting

- What changed (frame id, instance ids).
- One verification (`pt_lint` and/or `pt_screenshot`).

---

## References (on-demand)

| File | Load when |
|------|-----------|
| [`references/catalog.md`](references/catalog.md) | Props, variants, typography sizes, blocks |
| [`references/board.md`](references/board.md) | Coordinates, frames, layout, lint, screenshot, batch |
| [`references/command-reference.md`](references/command-reference.md) | Full tool args, errors, offline `--file` |

Skill directory after sync: `~/.atmos/skills/.system/atmos-pt-design-agent/`
