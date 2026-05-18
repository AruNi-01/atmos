---
name: atmos-canvas-agent
version: "1.0.1"
description: 'Drive the user''s open Atmos Canvas (tldraw whiteboard) via the `atmos canvas` CLI. Use whenever the user asks to sketch, draw, diagram, lay out, arrange, label, move, resize, recolor, or delete anything on the canvas — including architecture/flow diagrams, sticky notes, frames, geo shapes, arrows, grids of cards, or viewport changes.'
license: MIT
---

# Atmos Canvas Agent Skill

This skill teaches agent that can run the `atmos` CLI **how** to drive the Atmos Canvas.

---

## Prerequisites the agent must check

Always probe in this order (cheaper checks first):

1. **`atmos` CLI** is on `PATH` (`atmos --version`).
2. **A live Canvas tab is registered** — run `atmos canvas status`. This works even without the bridge enabled and is the single source of truth for "is the user on canvas right now" and "which `client_id`s exist".
3. **Bridge is enabled** in that tab — Bot button (top-right of canvas) → popover → **Enable bridge** switch ON. Mutating commands fail with `BRIDGE_DISABLED` until this is on; `status` and `skill-dir` do not need it.

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
| `--api-url <url>` | Override Atmos API base (else env / client-session / runtime manifest). |
| `--api-token <token>` | Bearer token for the API (else env vars or relay `gateway_token` in client-session). |
| `--client-id <uuid>` | Target a specific Canvas tab when multiple are registered (from `status`). |
| `--timeout-ms <ms>` | HTTP deadline in milliseconds (default 45000). |

### Diagnostics & read

| Verb | Args | Notes |
|------|------|-------|
| `status` | — | Reports bridge enabled/disabled, registered tabs, ambiguity. Works even when no bridge is connected — use this first if uncertain. The `clients[].client_id` values feed `--client-id`. |
| `get-state` | `--page-id <id>` (optional) | Returns `canvas_agent_state.v1`: page, camera, viewport, selection, shape inventory. Requires bridge enabled. |

`get-state` response shape (everything under `data`):

```json
{
  "schema": "canvas_agent_state.v1",
  "page_id": "page:abc",
  "camera":   { "x": 0,   "y": 0,   "z": 1 },
  "viewport": { "x": 0,   "y": 0,   "w": 1280, "h": 720 },
  "selection": ["shape:abc"],
  "shapes": [
    {
      "id": "shape:abc",
      "type": "note",
      "x": 80, "y": 80, "rotation": 0,
      "props": { "color": "yellow", "scale": 1 },
      "text_preview": "API",
      "parent_id": "page:abc"
    }
  ]
}
```

- `camera.z` is zoom factor; `viewport` is page-space rect of what's currently visible.
- `props` is shallow-filtered (only commonly useful keys); `text_preview` is the plain-text rendering of any `richText` prop.
- Shape ids are stable across the session — cache them after a `create-*` call rather than re-querying.

### Discoverability

| Verb | Notes |
|------|-------|
| `skill-dir` (alias `skill-path`) | Prints the canonical clipboard blurb + the absolute skill directory. Local-only (does NOT touch the API). |

### Create

| Verb | Required args | Optional args |
|------|---------------|---------------|
| `create-note` | `--text <text>` | `--x --y --w --h --color` |
| `create-frame` | `--w --h` | `--title --x --y --color` |
| `create-geo` | `--kind <kind>` `--w --h` | `--x --y --text --color --fill --size` |
| `create-arrow` | `--x1 --y1 --x2 --y2` | `--color --size --text` |
| `create-draw` | `--points '[[x,y],…]'` or `--points-file path` | `--color --size --closed` |

Valid `--kind` values (pass straight through to tldraw, unknown values render as the default `rectangle`): `rectangle`, `ellipse`, `triangle`, `diamond`, `rhombus`, `rhombus-2`, `pentagon`, `hexagon`, `octagon`, `star`, `oval`, `trapezoid`, `cloud`, `heart`, `x-box`, `check-box`, `arrow-right`, `arrow-left`, `arrow-up`, `arrow-down`.

> For plain-text labels use `create-note`. There is no separate `create-text` verb.

**Every `create-*` response includes the new shape id** in `data`, e.g. `{ "ok": true, "data": { "id": "shape:abc…", "type": "note" } }`. Cache that id for follow-up `select` / `move` / `update-shape` / arrow endpoints — do not re-run `get-state` just to discover it.

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

- `--gap` is in page-space units (defaults to `24`).
- `layout-row` keeps the **first** shape in `--ids` anchored at its current `(x, y)` and chains the rest to its right, each at `prev.x + prev.w + gap`.
  - `--y <pin>`: force every shape's `y` to this absolute page-y (horizontal alignment). Omit to let each keep its own `y`.
- `layout-column` is the same but vertical, with `--x <pin>` for vertical alignment.
- `layout-grid` lays the ids row-major into a `cols × rows` block using each shape's own width/height as the cell size (uneven sizes ⇒ uneven rows).

### Update existing shape

`update-shape --id <id> --patch '<json>'`

Allow-listed patch keys only (color, fill, text, size, font, geo kind, w, h, x, y). Unknown keys are rejected with `VALIDATION_ARG`. Use `get-state` first to discover ids and current props.

### Viewport

`viewport [--zoom <number>] [--pan-x <number>] [--pan-y <number>] [--center-ids <id,…>]`

Adjusts the camera without keyboard/pointer synthesis. Read-only operation that still requires the bridge.

---

## Argument value conventions

tldraw uses **named tokens**, not free-form CSS / hex. Pass the raw token string; the bus forwards it to tldraw without validation, so wrong values silently render with the default style.

- `--color` (every create-* + `update-shape`): `black`, `grey`, `light-violet`, `violet`, `blue`, `light-blue`, `yellow`, `orange`, `green`, `light-green`, `light-red`, `red`, `white`. **Hex / rgb / named CSS colours do not work.**
- `--fill` (`create-geo`, `update-shape`): `none`, `semi`, `solid`, `pattern`, `fill`, `lined-fill`.
- `--size` (`create-geo` / `create-arrow` / `create-draw` / `update-shape`): `s`, `m`, `l`, `xl`.
- `--font` (`update-shape` only): `draw`, `sans`, `serif`, `mono`.

---

## Idempotency

Important when retrying after `RELAY_TIMEOUT` or `EDITOR_NOT_READY`:

| Verb | Idempotent? | Retry safety |
|------|-------------|--------------|
| `create-*` | ❌ no | Each retry creates a **new** shape. Before retrying, run `get-state` and check whether the previous attempt actually landed (look for a shape at the requested `(x, y)` / text). |
| `move` | ❌ no | `--dx` / `--dy` are **additive deltas** — retrying doubles the movement. Compute the absolute target and `update-shape --patch '{"x":…,"y":…}'` instead if you need idempotency. |
| `update-shape` | ✅ yes | Same patch applied twice produces the same state. |
| `layout-row` / `layout-column` / `layout-grid` | ✅ yes | Given the same ids + gap, positions converge. |
| `select` / `clear-selection` / `viewport` | ✅ yes | Pure state assignment. |
| `delete` | ✅ yes (after first success) | Re-deleting an already-deleted id surfaces `STALE_SHAPE_ID`, not a duplicate-delete error. |
| `status` / `get-state` / `skill-dir` | ✅ yes | Read-only. |

---

## Error codes (machine-friendly)

| Code | Meaning | Recovery |
|------|---------|----------|
| `CANVAS_BRIDGE_OFFLINE` | No Canvas tab registered. | Ask the user to open Atmos Canvas. |
| `CANVAS_CLIENT_AMBIGUOUS` | Multiple registered tabs. | Re-run with `--client-id <id>` from the `status` output. |
| `BRIDGE_DISABLED` | Canvas open but the user has not toggled bridge on. | Ask the user to open the Canvas Bot popover and turn on **Enable bridge**. |
| `EDITOR_NOT_READY` | Editor not mounted in the target tab. | Retry shortly. |
| `STALE_SHAPE_ID` | Referenced shape id does not exist. | Re-run `get-state` and retry with the current ids. |
| `VALIDATION_ARG` | Bad CLI args (out-of-range, unknown patch key, etc.). | Fix args. |
| `PERMISSION_DENIED` | API rejected the request (often HTTP 401 — missing or wrong token). | Set `--api-token`, `ATMOS_API_TOKEN`, or `ATMOS_LOCAL_TOKEN`; on relay, ensure Settings synced `client-session.json`. |
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

Re-run `get-state` only when you need to learn about shapes you did **not** just create (e.g. before bulk `select` / `layout-*` / `update-shape` over user-authored content). For shapes the agent just created, reuse the ids returned by each `create-*` response.

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

- ❌ Do not edit canvas document JSON directly — use `atmos canvas` verbs only.
- ❌ Do not invent commands or pass raw tldraw store payloads.
- ❌ Do not ignore structured errors in stdout — read `error.code` and recover or ask the user.
- ❌ Do not pass CSS / hex colours (`#ff0000`, `crimson`, `rgb(...)`) — only the named tokens listed in *Argument value conventions* render correctly; anything else falls back to default.
- ❌ Do not call `update-shape` with multiple ids — `--id` is **singular**. Loop the verb once per shape, or use `layout-*` / `move` for bulk transforms.
- ❌ Do not re-run `get-state` to discover the id of a shape you just created — every `create-*` response already returns `data.id`. Cache and reuse it.
- ❌ Do not retry a failed `create-*` blindly after `RELAY_TIMEOUT` — the previous attempt may have actually landed (see *Idempotency*). Run `get-state` first and check.
- ❌ Do not retry `move` blindly either — `--dx` / `--dy` are additive; a double-fire doubles the displacement.
