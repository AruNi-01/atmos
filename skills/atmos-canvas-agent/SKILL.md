---
name: atmos-canvas-agent
version: "1.0.0"
description: 'Drive the open Atmos Canvas from an agent via the `atmos canvas` CLI. Use whenever the user asks the agent to sketch, draw, lay out, label, or otherwise manipulate the Atmos Canvas surface (sticky notes, frames, geo shapes, arrows, freehand strokes, layout grids, viewport changes) and the Canvas overlay is open in the browser. Operates intent-level commands (no raw tldraw store JSON, no driver primitives). Reuses the existing `atmos` CLI authentication — no separate Canvas API key.'
license: MIT
---

# Atmos Canvas Agent Skill

This skill teaches code agents running inside an Atmos terminal **when** and **how** to drive the Atmos Canvas via the `atmos canvas` CLI. Commands go through the same Atmos server as the open Web/Desktop session and relay into the live tldraw `Editor` in the browser tab where the user has Canvas open.

> **Skill location**: `~/.atmos/skills/.system/atmos-canvas-agent/SKILL.md` (synced by Atmos on API startup).

---

## When to use this skill

Use **only** when the user asks the agent to manipulate the Atmos Canvas. Examples:

- "Sketch the architecture on the canvas."
- "Put a 3×2 grid of feature cards on the canvas with these titles."
- "Add a frame called 'Backlog' on the canvas."
- "Draw an arrow from the API box to the DB box."
- "Style that sticky red and move it to (200, 200)."
- "Zoom out to show the whole diagram."

Do **not** use this skill for:

- Generic git, terminal, or filesystem work.
- Pin-to-canvas terminal cards (M1 does not include `add-terminal`).
- Anything when Canvas is **not** open in the browser — the CLI will fail fast.

---

## Prerequisites the agent must check

1. **Atmos Web or Desktop is open** (same session the user is working in).
2. **Canvas overlay is open** with **"Allow terminal/CLI control"** enabled (bridge toggle). Mutating commands fail with `BRIDGE_DISABLED` otherwise; `status` works without the bridge.
3. **`atmos` CLI** is available in the terminal.

When uncertain, run `atmos canvas status` first.

---

## Command reference

CLI form: `atmos canvas <verb> [--flags…]`

All commands print structured JSON to stdout in the shape:

```json
{ "ok": true,  "request_id": "<uuid>", "data": { … } }
{ "ok": false, "request_id": "<uuid>", "error": { "code": "STABLE_CODE", "message": "human text", "recoverable": true } }
```

Exit code is `0` on success and non-zero on failure.

### Global flags

| Flag | Meaning |
|------|---------|
| `--client-id <uuid>` | Target a specific Canvas tab when multiple are registered (from `status`). |
| `--actor-id <id>` | Stable Agent presence id (Follow Agent). |
| `--actor-name <name>` | Agent presence display name. |
| `--actor-color <css>` | Agent presence color. |
| `--timeout-ms <ms>` | HTTP deadline (default 45000). |

### Diagnostics & read

| Verb | Args | Notes |
|------|------|-------|
| `status` | — | Reports bridge enabled/disabled, registered tabs, ambiguity. Works even when no bridge is connected — use this first if uncertain. |
| `get-state` | `--page-id <id>` (optional) | Returns `canvas_agent_state.v1`: page, viewport, selection, shape inventory. Includes terminal card fields. Requires bridge enabled. |

### Discoverability

| Verb | Notes |
|------|-------|
| `skill-dir` (alias `skill-path`) | Prints the canonical clipboard blurb + the absolute skill directory. Local-only (does NOT touch the API). |

### Create

| Verb | Required args | Optional args |
|------|---------------|---------------|
| `create-note` | `--text <text>` | `--x --y --w --h --color` |
| `create-frame` | `--w --h` | `--title --x --y --color` |
| `create-geo` | `--kind <rectangle\|ellipse\|triangle\|diamond\|...>` `--w --h` | `--x --y --text --color --fill --size` |
| `create-arrow` | `--x1 --y1 --x2 --y2` | `--color --size --text` |
| `create-draw` | `--points '[[x,y],…]'` or `--points-file path` | `--color --size --closed` |

> M1 documents **only** `create-note` for plain text diagrams — there is no separate `create-text` in M1.

### Selection & transform

| Verb | Args |
|------|------|
| `select` | `--ids <id,id,…>` |
| `clear-selection` | — |
| `move` | `--ids <id,…> --dx <number> --dy <number>` |
| `delete` | `--ids <id,…> --confirm` (without `--confirm` the server refuses) |

### Layout

| Verb | Args |
|------|------|
| `layout-row` | `--ids <id,…> [--gap 24] [--y <pin>]` |
| `layout-column` | `--ids <id,…> [--gap 24] [--x <pin>]` |
| `layout-grid` | `--ids <id,…> --cols <n> --rows <n> [--gap 24]` — max **24×24**, max **256** ids. |

### Update existing shape

`update-shape --id <id> --patch '<json>'`

Allow-listed patch keys only (color, fill, text, size, font, geo kind, w, h, x, y). Unknown keys are rejected with `VALIDATION_ARG`. Use `get-state` first to discover ids and current props.

### Viewport

`viewport [--zoom <number>] [--pan-x <number>] [--pan-y <number>] [--center-ids <id,…>]`

Adjusts the camera without keyboard/pointer synthesis. Read-only operation that still requires the bridge.

---

## Error codes (machine-friendly)

| Code | Meaning | Recovery |
|------|---------|----------|
| `CANVAS_BRIDGE_OFFLINE` | No Canvas tab registered. | Ask the user to open Atmos Canvas. |
| `CANVAS_CLIENT_AMBIGUOUS` | Multiple registered tabs. | Re-run with `--client-id <id>` from the `status` output. |
| `BRIDGE_DISABLED` | Canvas open but the user has not toggled bridge on. | Ask the user to enable "Allow terminal/CLI control" on Canvas. |
| `EDITOR_NOT_READY` | Editor not mounted in the target tab. | Retry shortly. |
| `STALE_SHAPE_ID` | Referenced shape id does not exist. | Re-run `get-state` and retry with the current ids. |
| `VALIDATION_ARG` | Bad CLI args (out-of-range, unknown patch key, etc.). | Fix args. |
| `PERMISSION_DENIED` | Cannot reach the Atmos API. | Ask the user to confirm Atmos is open and connected. |
| `UNSUPPORTED_COMMAND` | Browser does not recognize the command (version skew). | Upgrade Atmos. |
| `RELAY_TIMEOUT` | Browser never answered within deadline. | Retry, or raise `--timeout-ms`. |

---

## Safe destructive contract

`delete` is destructive. The CLI requires `--confirm` and the API additionally requires `args.confirm: true` in the payload. Agents must never silently delete without the human user asking for it. Prefer `move` or `clear-selection` to "make room" before deleting.

---

## Coordinate conventions

- All coordinates are tldraw **page-space** units (not screen pixels).
- Viewport `pan-x` / `pan-y` are page-space camera offsets; `zoom` is the camera zoom factor.
- `create-draw` accepts `points` as a list of `[x, y]` pairs in page space.

---

## Persistence model (what the agent persists vs. ephemeral)

Atmos Canvas already persists its document server-side via the existing
APP-014 save path (`getSnapshot(editor.store).document` → `canvasWsApi
.updateDefaultBoard`). Agent commands mutate the **same live tldraw
`Editor`** (`createShape` / `updateShapes` / `deleteShapes`), so:

- ✅ Every accepted **create / update / delete / layout / move** writes
  through `editor.store` and is picked up by the next autosave tick.
- ✅ Manual save (`Cmd/Ctrl+S`) immediately flushes whatever the agent
  just produced.
- ⚠️ tldraw's built-in **`persistenceKey`** IndexedDB sync is intentionally
  not used — Atmos persists the canvas server-side per workspace, not
  per browser. Agents should not rely on the document still being on
  disk after the tab closes; the server is the source of truth.
- ⚠️ The Agent presence record itself is **ephemeral** (presence scope,
  not document scope). It exists only while the Canvas tab is open and
  is not saved with the board, by design.

---

## Follow Agent (M20)

When you pass `--actor-id <id>` (and optionally `--actor-name` /
`--actor-color`), each accepted command writes a virtual
`TLInstancePresence` record into the target tab's `editor.store` with
`userId = "agent:<actor-id>"`. The user can then:

- **Follow Agent** — Canvas calls `editor.startFollowingUser("agent:<id>")`.
  The follower viewport pans/zooms to whatever bounds the agent most
  recently touched. Manual pan/zoom cancels following (tldraw default).
- **Jump to Agent** — Canvas calls `editor.zoomToUser("agent:<id>")` so
  the user lands on the agent's last command bounds without entering
  follow mode.

Best practice for sustained sessions: **always** pass `--actor-id` so the
user gets a stable presence to follow across many commands instead of a
new "Agent" actor per invocation. The presence record auto-evicts
after 60 s of inactivity.

---

## Recommended diagnostic workflow

```bash
# 1. Confirm we have a live Canvas tab (status works even without bridge).
atmos canvas status

# 2. Confirm what's on the canvas already.
atmos canvas get-state

# 3. Plan and run mutations.
atmos canvas create-frame --title "Architecture" --x 0 --y 0 --w 800 --h 600
atmos canvas create-note  --text "API" --x 80  --y 80
atmos canvas create-note  --text "DB"  --x 480 --y 80
atmos canvas create-arrow --x1 200 --y1 110 --x2 470 --y2 110
```

Always re-run `get-state` after layout-heavy mutations before referencing fresh shape ids.

---

## Examples

### Title + 2×2 feature grid

```bash
atmos canvas create-note --text "Title"  --x 0    --y 0    --w 400 --h 60
atmos canvas create-note --text "Speed"  --x 0    --y 80   --w 180 --h 100
atmos canvas create-note --text "Safety" --x 220  --y 80   --w 180 --h 100
atmos canvas create-note --text "Polish" --x 0    --y 200  --w 180 --h 100
atmos canvas create-note --text "Scale"  --x 220  --y 200  --w 180 --h 100
```

To programmatically arrange instead, run `select` then `layout-grid`:

```bash
atmos canvas select --ids "$IDS"
atmos canvas layout-grid --ids "$IDS" --rows 2 --cols 2 --gap 24
```

### Adjusting one shape's color

```bash
atmos canvas update-shape --id "$ID" --patch '{"color":"red"}'
```

---

## Anti-patterns

- Do not edit canvas document JSON directly — use `atmos canvas` verbs only.
- Do not invent commands or pass raw tldraw store payloads.
- Do not ignore structured errors in stdout — read `error.code` and recover or ask the user.
