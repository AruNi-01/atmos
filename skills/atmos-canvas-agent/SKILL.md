---
name: atmos-canvas-agent
version: "1.2.1"
description: 'Drive the user''s open Atmos Canvas (tldraw whiteboard) via the `atmos canvas` CLI. Use whenever the user asks to sketch, draw, diagram, lay out, arrange, label, move, resize, recolor, or delete anything on the canvas — including architecture/flow diagrams, sticky notes, frames, geo shapes, arrows, grids of cards, or viewport changes.'
license: MIT
---

# Atmos Canvas Agent Skill

This skill teaches agents that can run the `atmos` CLI **how** to drive the Atmos Canvas with layouts that stay stable (page-bounds math + tldraw native align/stack).

---

## Prerequisites the agent must check

Always probe in this order (cheaper checks first):

1. **`atmos` CLI** is on `PATH` (`atmos --version`).
2. **A live Canvas tab is registered** — run `atmos canvas status`.
3. **Bridge is enabled** — Canvas Bot popover → **Enable bridge** ON. Mutating commands fail with `BRIDGE_DISABLED` until this is on.

---

## Diagram workflow (read this before drawing)

For multi-shape diagrams (feature grids, architecture maps, slide-like layouts):

1. **`get-state`** — note `viewport`, shape ids/types/bounds (no terminal pane text).
2. **Plan regions** — title band, card grid, footer. Prefer explicit `--x --y` or `place` over blind stacking.
3. **Containers first** — `create-frame` for sections; fixed-size cards use **`create-geo`** (`rectangle`) with `--w --h --text`, not `create-note`.
4. **Create content** — always pass coordinates, or omit **both** `x` and `y` to get staggered auto-placement (never one without the other).
5. **Layout with native tools** (preferred over hand-tuned coordinates):
   - `align` — line up edges/centers (`top`, `bottom`, `left`, `right`, `center-horizontal`, `center-vertical`).
   - `stack` — horizontal/vertical row with gap.
   - `distribute` — even spacing (needs ≥3 shapes).
   - `layout-grid` / `layout-row` / `layout-column` — uses **page bounds**, not raw `props.w/h`.
   - `place` — put shape B beside shape A (`--side top|bottom|left|right`, `--align start|center|end`).
6. **Arrows last** — `create-arrow --from-id … --to-id …` so bindings survive moves.
7. **`lint` anytime** — run after layout batches or risky edits to catch overlaps /
   unbound arrows; fix issues and **keep working**. Do **not** send `set-status idle`
   right after `lint` — you will call `lint` many times per turn.
8. **`set-status --status idle`** — once, only when you are completely done with **all**
   canvas commands for this turn (no more mutating/layout/lint planned).

Use **`apply`** to batch up to 32 mutating steps in one HTTP round-trip when building many shapes.

---

## Command reference

CLI form: `atmos canvas <verb> [--flags…]`

```json
{ "ok": true,  "request_id": "<uuid>", "data": { … } }
{ "ok": false, "request_id": "<uuid>", "error": { "code": "STABLE_CODE", "message": "human text", "recoverable": true } }
```

### Diagnostics & read

| Verb | Args | Notes |
|------|------|-------|
| `status` | — | Registered tabs + bridge state. |
| `get-state` | `--page-id` (optional) | `canvas_agent_state.v1` + per-shape `bounds` + `lints` (no terminal pane text). |
| `extract-text` | `--ids` (optional), `--older-offset` (terminals) | On-demand text for any shape (notes, geo, **terminals via tmux capture**, …). Uses selection when `--ids` omitted. |
| `lint` | — | Overlap + unbound-arrow report only. Safe to call repeatedly mid-turn. |

**Do not expect shape text in `get-state`.** When you need content, call `extract-text --ids <id>` (comma-separated) or select shapes and run `extract-text` with no args. Terminal shapes return metadata plus a tmux pane snapshot; line count is capped by the user’s Canvas setting **Terminal context lines** (default 300).

**Terminal pagination:** Each terminal entry may include `terminal_page`:

```json
"terminal_page": {
  "skip_lines": 0,
  "lines_returned": 300,
  "has_more_older": true,
  "next_older_offset": 300
}
```

When `has_more_older` is true and you still need earlier output, call again with `--older-offset <next_older_offset>` (same `--ids`). Repeat until `has_more_older` is false.

Each shape in `get-state` may include:

```json
"bounds": { "min_x": 80, "min_y": 80, "w": 200, "h": 120 }
```

Use **`bounds`** for spacing math — not `props.w/h` on notes or arrows.

### Create

| Verb | Required | Optional |
|------|----------|----------|
| `create-note` | `--text` | `--x --y --w --color` (**no `--h`**) |
| `create-frame` | `--w --h` | `--title --x --y` |
| `create-geo` | `--kind --w --h` | `--x --y --text --color --fill --size` |
| `create-arrow` | coords **or** bindings | `--x1 --y1 --x2 --y2 --from-id --to-id --color --size --text` |
| `create-draw` | `--points` or `--points-file` | `--color --size --closed` |

- **Sticky notes** (`create-note`): auto-height; width via `--w` → internal `scale`. For fixed card boxes with labels, use **`create-geo --kind rectangle`**.
- **Readable text / code blocks**: prefer **`create-geo --text`** or **`create-note --text`** (selectable, wraps). `create-draw` is for strokes/sketches only.
- **Colors** (geo/arrow/draw): `black`, `grey`, `light-violet`, `violet`, `blue`, `light-blue`, `yellow`, `orange`, `green`, `light-green`, `light-red`, `red`, `white`. Do **not** invent tokens like `light-orange` (use `orange`).
- **Arrows**: For diagrams, always pass `--from-id` and `--to-id`. Coordinates are optional when bindings resolve shape centers.

### Selection & transform

| Verb | Args |
|------|------|
| `select` | `--ids <id,…>` |
| `clear-selection` | — |
| `move` | `--ids … --dx --dy` |
| `delete` | `--ids … --confirm` |

### Layout (prefer these over manual x/y)

| Verb | Args |
|------|------|
| `align` | `--ids … --alignment top\|bottom\|left\|right\|center-horizontal\|center-vertical` |
| `stack` | `--ids … --direction horizontal\|vertical [--gap 24]` |
| `distribute` | `--ids … --direction horizontal\|vertical` (≥3 ids) |
| `place` | `--id … --reference-id … --side … [--align center] [--side-offset 0] [--align-offset 0]` |
| `layout-row` | `--ids … [--gap 24] [--y pin]` |
| `layout-column` | `--ids … [--gap 24] [--x pin]` |
| `layout-grid` | `--ids … --cols n --rows n [--gap 24]` |

`layout-*` commands position shapes by **visible page bounds** (works for notes, geo, frames).

### Agent view frame

| Verb | Args |
|------|------|
| `set-agent-view` | `--x --y --w --h` **or** `--center-ids <id,…>` `[--padding 48]` `[--zoom]` |

Sets the dashed **Agent view** rectangle precisely (like official `setMyView`). Prefer this before laying out a diagram region, then `apply` creates inside that area.

```bash
atmos canvas set-agent-view --x 0 --y 0 --w 900 --h 520 --padding 32
atmos canvas set-agent-view --center-ids "$TITLE_ID,$CARD1,$CARD2" --zoom
```

### Session status

| Verb | Args |
|------|------|
| `set-status` | `--status idle\|active` (default `idle`) |

Send **`set-status --status idle` exactly once** at the end of the turn — after
you have finished every canvas command (including any final `lint` / `get-state`
you choose to run). Never pair `idle` with an intermediate `lint`.

Use `--status active` only when you are waiting on the user and have no further
canvas commands until they reply; follow with `idle` when you resume or finish.

```bash
# … create, layout, lint (as needed), more edits …
atmos canvas set-status --status idle
```

### Batch

| Verb | Args |
|------|------|
| `apply` | `--commands '<json array>'` or `--commands-file path` |

Example:

```json
[
  { "command": "create_geo", "args": { "kind": "rectangle", "w": 220, "h": 140, "text": "API", "x": 0, "y": 0 } },
  { "command": "create_geo", "args": { "kind": "rectangle", "w": 220, "h": 140, "text": "DB", "x": 280, "y": 0 } },
  { "command": "align", "args": { "ids": ["shape:a", "shape:b"], "alignment": "top" } }
]
```

Stops on first failure; response includes `partial: true` and `failed_at` index.

### Update & viewport

- `update-shape --id … --patch '<json>'` — allow-listed keys only; notes reject `h`.
- `viewport [--zoom] [--pan-x] [--pan-y] [--center-ids …]`

---

## Argument value conventions

tldraw **named tokens** only (no hex/CSS):

- `--color`: `black`, `grey`, `light-violet`, `violet`, `blue`, `light-blue`, `yellow`, `orange`, `green`, `light-green`, `light-red`, `red`, `white`
- `--fill`: `none`, `semi`, `solid`, `pattern`, `fill`, `lined-fill`
- `--size`: `s`, `m`, `l`, `xl`
- `--font` (`update-shape`): `draw`, `sans`, `serif`, `mono`

---

## Example: title + 3×2 feature grid (geo cards)

```bash
atmos canvas apply --commands '[
  {"command":"create_geo","args":{"kind":"rectangle","w":720,"h":64,"text":"tldraw 5.0","x":0,"y":0,"color":"blue","fill":"solid"}},
  {"command":"create_geo","args":{"kind":"rectangle","w":220,"h":120,"text":"Feature 1","x":0,"y":96,"color":"light-blue","fill":"semi"}},
  {"command":"create_geo","args":{"kind":"rectangle","w":220,"h":120,"text":"Feature 2","x":0,"y":96,"color":"light-green","fill":"semi"}},
  {"command":"create_geo","args":{"kind":"rectangle","w":220,"h":120,"text":"Feature 3","x":0,"y":96,"color":"yellow","fill":"semi"}},
  {"command":"create_geo","args":{"kind":"rectangle","w":220,"h":120,"text":"Feature 4","x":0,"y":96,"color":"orange","fill":"semi"}},
  {"command":"create_geo","args":{"kind":"rectangle","w":220,"h":120,"text":"Feature 5","x":0,"y":96,"color":"violet","fill":"semi"}},
  {"command":"create_geo","args":{"kind":"rectangle","w":220,"h":120,"text":"Feature 6","x":0,"y":96,"color":"light-red","fill":"semi"}}
]'
# Then layout-grid with ids from the apply response, or cache ids from a follow-up get-state:
atmos canvas layout-grid --ids "$IDS" --cols 3 --rows 2 --gap 24
atmos canvas align --ids "$IDS" --alignment center-horizontal
atmos canvas lint
# … fix any lints, then when the whole turn is done:
atmos canvas set-status --status idle
```

---

## Idempotency

| Verb | Safe to retry? |
|------|----------------|
| `create-*` | ❌ duplicates — check `get-state` after timeout |
| `move` | ❌ deltas stack |
| `update-shape`, `layout-*`, `align`, `stack`, `distribute`, `place` | ✅ |
| `apply` | ❌ if partial — inspect `failed_at` before retrying whole batch |

---

## Anti-patterns

- ❌ Guessing pixel coordinates for every card when `layout-grid` + `align` exist.
- ❌ `create-note` for fixed-size labeled boxes (use `create-geo`).
- ❌ `create-note --h` (rejected).
- ❌ Free-floating arrows in diagrams (use `--from-id` / `--to-id`).
- ❌ Ignoring `lints` / overlaps when `lint` reports them.
- ❌ `set-status --status idle` immediately after `lint` (lint is mid-turn; `idle` is turn-end only).
- ❌ CSS / hex colors.
- ❌ Retrying `create-*` or `move` blindly after `RELAY_TIMEOUT`.

---

## Error codes

| Code | Recovery |
|------|----------|
| `CANVAS_BRIDGE_OFFLINE` | Open Canvas tab |
| `BRIDGE_DISABLED` | Enable bridge in Bot popover |
| `STALE_SHAPE_ID` | `get-state` and refresh ids |
| `VALIDATION_ARG` | Fix args (see error message) |
| `RELAY_TIMEOUT` | Retry after `get-state` |
