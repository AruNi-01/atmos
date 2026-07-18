---
name: atmos-canvas-agent
version: "1.4.0"
description: 'Drive the user''s open Atmos Canvas (tldraw whiteboard) via the `atmos canvas` CLI. Use whenever the user asks to sketch, draw, diagram, lay out, arrange, label, move, resize, recolor, or delete anything on the canvas — including architecture/flow diagrams, sticky notes, frames, geo shapes, arrows, grids of cards, or viewport changes.'
license: MIT
---

# Atmos Canvas Agent Skill

Drive the open Atmos Canvas with **stable layouts** (absolute coordinates first,
page-bounds math, smart lint, region screenshots).

---

## Prerequisites (always, in order)

1. **`atmos` CLI** on `PATH` (`atmos --version`).
2. **Live Canvas tab** — `atmos canvas status` (at least one accepting client).
3. **Bridge ON** — Canvas Bot popover → **Enable bridge**. Mutating verbs fail with `BRIDGE_DISABLED` until enabled.

---

## Quality bar (why diagrams look good)

Atmos agents produce clean diagrams when they follow this contract:

| Rule | Why |
|------|-----|
| **Create at final coordinates** | Never pile shapes at the same `(x,y)` hoping a later layout will fix it |
| **Gutters ≥ 24px** | Avoid edge kissing / visual collision |
| **Arrows use `--from-id` / `--to-id`** | Bindings survive moves |
| **`lint` error_count = 0 before idle** | Smart lint only reports *real* card-on-card problems |
| **Screenshot the agent region** | Verify without Atmos terminals/widgets polluting the crop |

---

## Diagram workflow

### 1. Plan regions (page space)

Example bands for a product intro / architecture slide:

```text
title:   y = 0    .. 80     full width
body:    y = 120  .. …      cards, gap 24, col_w ~ 300–340
footer:  y = body_bottom+48
gutter:  24–40 between cards
```

Prefer **`set-agent-view --x --y --w --h`** once at the start so later `screenshot --use-agent-view` crops exactly that board.

### 2. Create content (absolute coords preferred)

- Fixed cards / labels → **`create-geo`** (`rectangle`) with `--w --h --text --x --y`
- Sticky notes → **`create-note`** (auto height; no `--h`)
- Section boxes → **`create-frame`**
- **Always pass both `--x` and `--y`, or omit both** (never only one)
- If you omit both, the bus **collision-spawns** (non-overlapping). Still prefer explicit coords for multi-shape diagrams.

### 3. Layout polish (optional)

After creates with real positions, refine with:

- `align` / `stack` / `distribute`
- `layout-row` / `layout-column` / `layout-grid` (page bounds)
- `place` (relative to another shape)

### 4. Arrows last

```bash
atmos canvas create-arrow --from-id "$A" --to-id "$B" --text "next"
```

### 5. Lint → fix → lint

```bash
atmos canvas lint --fix-suggestions
# Apply every remediable error via suggested `move` / `update_shape` commands
# warn unbound_arrow: fix for diagrams; OK for decorative strokes
```

`fix_suggestions[]` entries are CLI-ready:

```json
{
  "command": "move",
  "args": { "ids": ["shape:…"], "dx": 48, "dy": 0 },
  "reason": "Separate shape:a and shape:b by moving the latter (dx=48)."
}
```

Replay with `atmos canvas move --ids … --dx … --dy …` or batch via `apply`.

### 6. Screenshot verify (agent region only)

```bash
# After set-agent-view for the drawing board:
atmos canvas screenshot --use-agent-view --out /tmp/canvas-verify.jpg

# Or crop to specific shapes you created:
atmos canvas screenshot --ids "$ID1,$ID2,$ID3" --out /tmp/canvas-verify.jpg
```

A successful `screenshot` also shows a **thumbnail on the Canvas Agent Island**
(bottom-right). Click it to enlarge. Prefer `--use-agent-view` so the island
preview matches the agent board.

**Chrome exclusion (default):** `canvas-terminal` and `canvas-widget` are **not** included, so remote terminals / workspace widgets do not pollute the JPEG. Pass `--include-widgets` only if you truly need them.

### 7. End the turn

```bash
atmos canvas set-status --status idle
```

`set-status idle` returns `lints_summary` and `ready_to_idle`.  
**If `ready_to_idle` is false / `error_count > 0`, keep fixing — do not stop.**

---

## Command reference

CLI: `atmos canvas <verb> [--flags…]`

```json
{ "ok": true,  "request_id": "<uuid>", "data": { … } }
{ "ok": false, "request_id": "<uuid>", "error": { "code": "…", "message": "…", "recoverable": true } }
```

### Diagnostics & read

| Verb | Args | Notes |
|------|------|-------|
| `status` | — | Registered tabs + bridge state |
| `get-state` | `--page-id` optional | Shapes + **`bounds`** + **`text_preview`** + `lints` + `lints_summary` |
| `extract-text` | `--ids` optional | Full text / terminal tmux capture |
| `lint` | `--fix-suggestions` | Smart lints + `summary`; with flag, also `fix_suggestions[]` |
| `screenshot` | see below | JPEG of agent region (excludes Atmos chrome); Island thumb preview |

`get-state` **includes** `text_preview` for notes/geo/frames (not terminal pane text). Use it for layout math. Use `extract-text` for full terminal scrollback.

### Create

| Verb | Required | Optional |
|------|----------|----------|
| `create-note` | `--text` | `--x --y --w --color` (**no `--h`**) |
| `create-frame` | `--w --h` | `--title --x --y` |
| `create-geo` | `--kind --w --h` | `--x --y --text --color --fill --size` |
| `create-arrow` | coords **or** bindings | `--from-id --to-id --x1 --y1 --x2 --y2 --color --size --text` |
| `create-draw` | `--points` | `--color --size --closed` |

Create responses include:

```json
{
  "id": "shape:…",
  "type": "geo",
  "bounds": { "min_x": 0, "min_y": 0, "w": 220, "h": 120 },
  "warnings": ["text_may_overflow"]
}
```

If `warnings` contains `text_may_overflow`, increase `--h`/`--w` or shorten text immediately.

### Selection & transform

| Verb | Args |
|------|------|
| `select` | `--ids <id,…>` |
| `clear-selection` | — |
| `move` | `--ids … --dx --dy` |
| `delete` | `--ids … --confirm` |

### Layout

| Verb | Args |
|------|------|
| `align` | `--ids … --alignment top\|bottom\|left\|right\|center-horizontal\|center-vertical` |
| `stack` | `--ids … --direction horizontal\|vertical [--gap 24]` |
| `distribute` | `--ids … --direction horizontal\|vertical` (≥3) |
| `place` | `--id … --reference-id … --side … [--align center]` |
| `layout-row` / `layout-column` / `layout-grid` | page-bounds packing |

### Agent view & screenshot

| Verb | Args |
|------|------|
| `set-agent-view` | `--x --y --w --h` **or** `--center-ids …` `[--padding 48]` `[--zoom]` |
| `screenshot` | `--use-agent-view` **or** `--ids …` **or** `--x --y --w --h` · `--size small\|medium\|large` · `--out path` · `--include-widgets` |

```bash
atmos canvas set-agent-view --x 0 --y 0 --w 1100 --h 900 --padding 32
# … create shapes inside that board …
atmos canvas screenshot --use-agent-view --size medium --out /tmp/verify.jpg
```

### Session

| Verb | Args |
|------|------|
| `set-status` | `--status idle\|active` |

Send **`idle` exactly once** when the whole canvas turn is finished (after final lint/screenshot). Never pair `idle` with a mid-turn lint.

### Batch

| Verb | Args |
|------|------|
| `apply` | `--commands '<json>'` or `--commands-file` · **max 64 steps** |

Collect ids from `data.results[i].data.id` after apply.

---

## Good example: title + 3×2 grid (final coords)

```bash
atmos canvas set-agent-view --x 0 --y 0 --w 760 --h 420 --padding 24

atmos canvas apply --commands '[
  {"command":"create_geo","args":{"kind":"rectangle","w":720,"h":64,"text":"Product","x":0,"y":0,"color":"black","fill":"semi"}},
  {"command":"create_geo","args":{"kind":"rectangle","w":220,"h":120,"text":"Feature 1","x":0,"y":96,"color":"light-blue","fill":"semi"}},
  {"command":"create_geo","args":{"kind":"rectangle","w":220,"h":120,"text":"Feature 2","x":244,"y":96,"color":"light-green","fill":"semi"}},
  {"command":"create_geo","args":{"kind":"rectangle","w":220,"h":120,"text":"Feature 3","x":488,"y":96,"color":"yellow","fill":"semi"}},
  {"command":"create_geo","args":{"kind":"rectangle","w":220,"h":120,"text":"Feature 4","x":0,"y":240,"color":"orange","fill":"semi"}},
  {"command":"create_geo","args":{"kind":"rectangle","w":220,"h":120,"text":"Feature 5","x":244,"y":240,"color":"violet","fill":"semi"}},
  {"command":"create_geo","args":{"kind":"rectangle","w":220,"h":120,"text":"Feature 6","x":488,"y":240,"color":"light-red","fill":"semi"}}
]'

atmos canvas lint --fix-suggestions
# optional: apply fix_suggestions via move / update-shape, then lint again
atmos canvas screenshot --use-agent-view --out /tmp/grid.jpg
atmos canvas set-status --status idle
```

**Do not** create six cards at the same `x,y` then rely on `layout-grid` alone — if id collection fails, the board stays piled.

---

## Lint semantics (smart)

| type | severity | Meaning |
|------|----------|---------|
| `overlap` | error | Two **content** shapes collide (not parent/child, not containment). Arrows / frames / Atmos chrome ignored. |
| `text_overflow` | error if collides, else warn | Geo label likely exceeds box |
| `unbound_arrow` | warn | Missing start/end binding |

`summary.clean === true` means **zero errors** (warns OK).

---

## Anti-patterns

- ❌ Same `(x,y)` for many shapes “then layout later”
- ❌ Ignoring `lints_summary.error_count` and still sending `idle`
- ❌ `create-note` for fixed-size labeled cards (use `create-geo`)
- ❌ Free-floating diagram arrows (use bindings)
- ❌ Guessing CSS/hex colors (tldraw tokens only)
- ❌ Retrying `create-*` after `RELAY_TIMEOUT` without `get-state`
- ❌ Screenshot of full page with terminals/widgets when verifying a diagram (use `--use-agent-view` / `--ids`)
- ❌ `set-status idle` right after an intermediate `lint`

---

## Colors / style tokens

- `--color`: `black`, `grey`, `light-violet`, `violet`, `blue`, `light-blue`, `yellow`, `orange`, `green`, `light-green`, `light-red`, `red`, `white`
- `--fill`: `none`, `semi`, `solid`, `pattern`, `fill`, `lined-fill`
- `--size`: `s`, `m`, `l`, `xl`

Do **not** invent tokens like `light-orange` (use `orange`).

---

## Error codes

| Code | Recovery |
|------|----------|
| `CANVAS_BRIDGE_OFFLINE` | Open Canvas tab |
| `BRIDGE_DISABLED` | Enable bridge in Bot popover |
| `STALE_SHAPE_ID` | `get-state` and refresh ids |
| `VALIDATION_ARG` | Fix args (see message) |
| `RELAY_TIMEOUT` | `get-state` then retry carefully |
