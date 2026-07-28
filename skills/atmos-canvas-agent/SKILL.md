---
name: atmos-canvas-agent
version: "2.3.0"
description: "Drive the user's open Atmos Canvas via `atmos canvas` CLI: diagrams, layout, screenshots, local .atmos.tldr documents, and (when needed) durable document scripts or one-shot exec. Use for sketch/draw/diagram/layout requests, and for interactive surfaces or clickable UI only when the user asks for that behavior."
license: MIT
---

# Atmos Canvas Agent Skill

Operate the **live Atmos Canvas** with `atmos canvas`. Most requests are **static
diagrams** — use structured drawing commands only. Load deeper references only
when the task needs documents or interactive scripts.

```text
Default path:  create / layout / lint / screenshot / idle
Only if needed: documents CLI · document scripts · exec
```

---

## Prerequisites

1. `atmos` on `PATH` (`atmos --version`).
2. Canvas open against local Atmos Server.
3. `atmos canvas status` — for **live editor** work: `bridge.accepting_count >= 1` and bridge **enabled** (Canvas Bot). Document-only `docs` / `doc-*` do **not** need the bridge.
4. **Check client capabilities** before `script-*` / `exec`:
   - Supported: `document-scripts.1` and/or `exec.1` in `bridge.clients[].capabilities`
   - Stale UI (Desktop static build / old web): often only `canvas.v1` → **do not** call `script-put` / `exec`; tell the user to rebuild/restart Canvas on the APP-037 branch so the bridge advertises script support.

Fresh shell per tool call — re-run full commands; do not rely on exported env vars.

---

## Decision tree (load references on demand)

| User intent | What to do | Load reference |
|-------------|------------|----------------|
| Diagram, architecture, cards, labels, arrange | Structured verbs below | *(this file only)* |
| List / save-as style file ops / rename boards | `docs` / `doc-*` | [`references/documents.md`](references/documents.md) |
| Clickable UI, keyboard surface, animation, run-on-open | Durable **document script** | [`references/document-scripts.md`](references/document-scripts.md) |
| One-shot JS probe on live editor | `exec` | [`references/document-scripts.md`](references/document-scripts.md) |
| Full flag tables / error codes | — | [`references/command-reference.md`](references/command-reference.md) |

**Do not** start with `script-put` or `exec` for a normal “draw a flowchart” request.

---

## Default workflow — static diagram

1. `atmos canvas status` (bridge accepting).
2. `set-agent-view --x --y --w --h` for the drawing board.
3. Create at **final coordinates** (gutter ≥ 24). Prefer `apply` for multi-shape boards.
4. Bound arrows: `create-arrow --from-id --to-id` (not free-floating for diagrams).
5. `lint --fix-suggestions` → fix → lint until `error_count = 0`.
6. `screenshot --use-agent-view --out /tmp/canvas-verify.jpg`.
7. `set-status --status idle` **once** at the end of the whole turn.

### Quick create / layout

| Verb | Notes |
|------|--------|
| `create-geo` | Fixed cards: `--kind rectangle --w --h --text --x --y --color --fill` |
| `create-note` | Sticky; **no** `--h` |
| `create-frame` | Section box |
| `create-arrow` | Prefer `--from-id` / `--to-id` |
| `move` / `align` / `stack` / `distribute` / `place` | Polish |
| `layout-row` / `layout-column` / `layout-grid` | Packing |
| `apply` | Batch ≤ 64 steps |
| `update-shape` | Patch props |
| `get-state` / `extract-text` / `lint` / `screenshot` | Read / verify |

Always pass **both** `--x` and `--y`, or omit both (collision spawn).

Colors: `black`, `grey`, `light-violet`, `violet`, `blue`, `light-blue`, `yellow`, `orange`, `green`, `light-green`, `light-red`, `red`, `white`.  
Fill: `none`, `semi`, `solid`, `pattern`, `fill`, `lined-fill`. Size: `s` `m` `l` `xl`.

---

## When the user wants interaction

Only then:

1. Read [`references/document-scripts.md`](references/document-scripts.md) **before writing any durable script**.
2. `script-get` first if a script may already exist — **extend, don’t clobber**.
3. **Interactive system rules (general):**
   - Put related interactive shapes in a **tldraw `frame`** (`parentId: surfaceId`).
   - **Keyboard** → only `helpers.claimInputScope({ surfaceId, … })` (never bare `window` keydown / focus hacks).
   - **Pointer-only** → `editor.on('event')` hit-tests are OK; upgrade to frame + scope if keys are added later.
   - Do **not** use `canvas-terminal` / Agent chat as the script input target; skip chrome with `isAtmosChromeShape`.
4. `script-put --file …` or `--code …` → `script-status` → screenshot if useful.
5. Remind the user to **Save** the document so the script lands on disk in the `.atmos.tldr`.

One-shot probes: `atmos canvas exec --code 'return editor.getCurrentPageShapes().length'` (not durable).

---

## Documents (optional)

Local boards: `~/.atmos/canvas/*.atmos.tldr`.  
`status` includes `documents.dir`, `items`, `active_document`.  
Full verbs: [`references/documents.md`](references/documents.md).

Never hex-edit an **open** document file; use live CLI or `doc-*` on closed files.

---

## Anti-patterns (default path)

- ❌ `script-put` for plain diagram asks  
- ❌ Same `(x,y)` for many shapes then “layout later”  
- ❌ Unbound diagram arrows  
- ❌ `set-status idle` mid-turn after a partial lint  
- ❌ Screenshot full page with terminals when verifying a diagram  
- ❌ Inventing color tokens  
- ❌ Assuming `config.js` / custom ShapeUtil exists (not shipped)  
- ❌ Interactive system as free-floating shapes with no **frame** surface  
- ❌ Keyboard via bare `window`/`container` keydown or focus stealing instead of **`claimInputScope`**  
- ❌ Using product chrome (`canvas-terminal` / chat) as the script’s input surface

---

## Errors (short)

| Code | Recovery |
|------|----------|
| `CANVAS_BRIDGE_OFFLINE` | Open Canvas |
| `BRIDGE_DISABLED` | Enable bridge in Canvas Bot |
| `STALE_SHAPE_ID` | `get-state` |
| `RELAY_TIMEOUT` | `get-state`, careful retry |

More codes: [`references/command-reference.md`](references/command-reference.md).

---

## Reporting

- What changed (shape ids or “script installed”).  
- One verification (`lint` / screenshot path / `script-status`).  
- If a script was installed: whether user still needs to **Save**.

---

## References (on-demand)

| File | Load when |
|------|-----------|
| [`references/document-scripts.md`](references/document-scripts.md) | Interactive surfaces, keyboard scope, animation, `exec`, script API/helpers |
| [`references/documents.md`](references/documents.md) | Multi-board files, `docs` / `doc-*` |
| [`references/command-reference.md`](references/command-reference.md) | Full flag tables, lint semantics, full error list |

Skill directory after sync: `~/.atmos/skills/.system/atmos-canvas-agent/`  
(`atmos canvas skill-dir` prints the path).
