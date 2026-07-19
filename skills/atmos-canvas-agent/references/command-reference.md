# Canvas CLI command reference (on-demand)

Full tables for structured drawing, lint, colors, and errors.  
Default diagram workflow stays in the parent `SKILL.md`.

---

## Response envelope (bridge verbs)

```json
{ "ok": true,  "request_id": "<uuid>", "data": { … } }
{ "ok": false, "request_id": "<uuid>", "error": { "code": "…", "message": "…", "recoverable": true } }
```

Document REST verbs return unwrapped `data` when success envelope is used.

Pin disambiguation: `--client-id` from `status` when multiple tabs accept commands.

---

## Diagnostics

| Verb | Args | Notes |
|------|------|-------|
| `status` | — | Bridge + `documents` |
| `get-state` | `--page-id`? | shapes, bounds, text_preview, lints |
| `extract-text` | `--ids`? | Full text / tmux capture for terminals |
| `lint` | `--fix-suggestions` | Smart lints + optional CLI-ready fixes |
| `screenshot` | see below | JPEG; Island thumb |
| `skill-dir` / `skill-path` | — | Skill install directory |

### Screenshot / agent view

```bash
atmos canvas set-agent-view --x 0 --y 0 --w 1100 --h 900 --padding 32
atmos canvas screenshot --use-agent-view --size medium --out /tmp/verify.jpg
# or --ids id1,id2  or  --x --y --w --h
# --include-widgets to include canvas-terminal / canvas-widget
```

Sizes: `small` \| `medium` \| `large`.

---

## Create

| Verb | Required | Optional |
|------|----------|----------|
| `create-note` | `--text` | `--x --y --w --color` (**no `--h`**) |
| `create-frame` | `--w --h` | `--title --x --y` |
| `create-geo` | `--kind --w --h` | `--x --y --text --color --fill --size` |
| `create-arrow` | coords **or** bindings | `--from-id --to-id --x1 --y1 --x2 --y2 --color --size --text` |
| `create-draw` | `--points` | `--color --size --closed` |

Create may return `warnings: ["text_may_overflow"]` — grow box or shorten text.

---

## Selection / transform / layout

| Verb | Args |
|------|------|
| `select` | `--ids` |
| `clear-selection` | — |
| `move` | `--ids --dx --dy` |
| `delete` | `--ids --confirm` |
| `align` | `--ids --alignment top\|bottom\|left\|right\|center-horizontal\|center-vertical` |
| `stack` | `--ids --direction horizontal\|vertical [--gap 24]` |
| `distribute` | `--ids --direction` (≥3) |
| `place` | `--id --reference-id --side …` |
| `layout-row` / `layout-column` / `layout-grid` | packing |
| `update-shape` | allow-listed prop patch |
| `viewport` | pan / zoom / center |
| `apply` | `--commands` JSON array or `--commands-file` · max 64 |

---

## Session

| Verb | Args |
|------|------|
| `set-status` | `--status idle\|active` |

Send **`idle` once** at end of the full canvas turn (after final lint/screenshot). Never after an intermediate lint only.

---

## Documents & scripts (summaries)

| Area | Verbs | Detail |
|------|-------|--------|
| Files | `docs`, `doc-get`, `doc-put`, `doc-delete`, `doc-rename`, `doc-duplicate`, `doc-sanitize` | [`documents.md`](documents.md) |
| Scripts | `script-get`, `script-status`, `script-put`, `script-clear`, `exec` | [`document-scripts.md`](document-scripts.md) |

---

## Lint semantics

| type | severity | Meaning |
|------|----------|---------|
| `overlap` | error | Two content shapes collide (not parent/child/containment; chrome ignored) |
| `text_overflow` | error if collides else warn | Geo label likely exceeds box |
| `unbound_arrow` | warn | Missing binding — fix for diagrams; OK decorative |

`summary.clean === true` ⇔ zero errors (warns OK).

---

## Colors / style

- `--color`: `black`, `grey`, `light-violet`, `violet`, `blue`, `light-blue`, `yellow`, `orange`, `green`, `light-green`, `light-red`, `red`, `white`
- `--fill`: `none`, `semi`, `solid`, `pattern`, `fill`, `lined-fill`
- `--size`: `s`, `m`, `l`, `xl`

Do not invent tokens (e.g. no `light-orange`).

---

## Errors

| Code | Recovery |
|------|----------|
| `CANVAS_BRIDGE_OFFLINE` | Open Canvas |
| `BRIDGE_DISABLED` | Enable bridge |
| `STALE_SHAPE_ID` | `get-state` |
| `VALIDATION_ARG` | Fix args |
| `RELAY_TIMEOUT` | `get-state`, careful retry |
| `EDITOR_NOT_READY` | Wait for Canvas mount |
| `UNSUPPORTED_COMMAND` | Check verb spelling |

---

## Example: title + 3×2 grid

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
atmos canvas screenshot --use-agent-view --out /tmp/grid.jpg
atmos canvas set-status --status idle
```
