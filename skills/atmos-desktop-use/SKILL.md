---
name: atmos-desktop-use
version: "1.4.2"
description: >
  Capture and control the local macOS desktop via `atmos desktop-use` (screenshot,
  click, type, window list) without MCP. Use whenever the user or task needs local
  screen capture, UI automation, AppShot-style screenshots, verifying on-screen UI,
  desktop click/type, or checking Desktop Use install/permissions — even if they say
  "screenshot the app", "click the button on screen", "drive the UI", or "computer use"
  on this machine. Do not use for remote machines (Atmos Computer / Relay) or for
  in-repo file/git/terminal work.
---

# Atmos Desktop Use

Local desktop capture + control via `atmos desktop-use`. **No MCP.** Brand: **Desktop Use** / **Atmos Desktop Use** only.

Details: [`references/cli.md`](references/cli.md).

## Prerequisites

1. `atmos` on `PATH`.
2. Engine installed + **Accessibility** + **Screen Recording** for **Atmos Desktop Use** (Settings → Desktop Use). Agents cannot complete TCC.

## Decision tree

| Intent | Commands |
|--------|----------|
| Ready? | `status` + `doctor` |
| List windows | `drive verify` (**not** `drive windows`) |
| Full-display screenshot | `drive screenshot --out …` (preferred for click loops) |
| Frontmost window only | `capture --out …` |
| Click / type | `drive click` / `drive type` (see **Critical rules**) |
| Install engine | `driver ensure` |

## Critical click rules (read this — most failures are here)

### 1) Coordinate space (Retina trap)

`drive screenshot` returns a **native PNG** that is often **2×** logical screen size (e.g. screen 1512×982, PNG 3024×1964).

| Source of (x, y) | Flag | Example |
|------------------|------|---------|
| Pixel you read on the **drive screenshot PNG** | default `--coord-space png` | button at image (200, 322) → `--x 200 --y 322` |
| `drive verify` bounds / AX `position` / System Events | `--coord-space points` | AX says (100, 161) → `--x 100 --y 161 --coord-space points` |

**Wrong:** treating logical points (bounds/AX) as default PNG coords → click lands at ~half offset (looks like hover / miss).

### 2) Do not mix addressing modes

| Mode | How | Background? |
|------|-----|-------------|
| **Desktop PNG** (default CLI) | `--x --y` only, **no** `--pid` | Needs window **on-screen** for pixel path |
| **Window-local** | `--window-id` + optional `--pid`, coords from **that** window image | Same |
| **AX element** | engine `element_token` (not fully on CLI yet) | Yes, even hidden — **when AX tree exists** |

```bash
# GOOD — PNG pixels from drive screenshot (no --pid)
atmos desktop-use --json drive screenshot --out /tmp/du.png
# read (x,y) from that PNG, then:
atmos desktop-use --json drive click --x <png_x> --y <png_y>

# GOOD — logical points from window bounds / AX
atmos desktop-use --json drive click --x 100 --y 161 --coord-space points

# Electron stubborn UI (last resort — brief focus steal):
atmos desktop-use --json drive click --x <png_x> --y <png_y> \
  --delivery-mode foreground --window-id <id>

# BAD
atmos desktop-use --json drive click --x 100 --y 161 --pid 12345   # bare pid + screen coords
# BAD — logical y=161 without --coord-space points on Retina → lands ~y=80
```

### 3) Electron / custom UI (e.g. Orca)

Many Electron apps return an **empty AX tree** for the main window (`ax_window_unresolved`). Then:

- Pixel path is the only option
- Prefer `drive screenshot` + PNG coords
- If click `ok` but UI unchanged: retry `--delivery-mode foreground --window-id <main>`
- Do **not** thrash with AppleScript/Swift CGEvent until addressing is fixed

### 4) After every click

Take a new screenshot and confirm the UI changed. If not: drop `--pid`, fix coord space, check `is_on_screen`, try `foreground`.

## Default loop

```bash
atmos desktop-use --json status
atmos desktop-use --json doctor
atmos desktop-use --json drive verify
atmos desktop-use --json drive screenshot --out "$HOME/.atmos/desktop-use/shots/before.png"

# Plan (x,y) from the PNG pixels (see screenshot JSON: screenshot_width vs screen_width)
atmos desktop-use --json drive click --x <png_x> --y <png_y>
atmos desktop-use --json drive screenshot --out "$HOME/.atmos/desktop-use/shots/after.png"
```

## Background control (you can keep working in another app)

**Default is background** — `delivery_mode=background`. The engine does **not** need the target app to stay frontmost.

| Path | Background? | Notes |
|------|-------------|-------|
| **AX `element_token`** (preferred) | **Yes** — works backgrounded / minimized / off-Space when AX tree exists | `drive window-state --pid --window-id` → `drive click --element-token …` |
| **Pixel click** (`--x --y`) | **Partial** — window must be **on-screen** (can be behind others) | No persistent activate. Only use `--delivery-mode foreground` if background pixel fails (brief front→act→**restore your app**) |
| `bring_to_front` | **Never default** | Not used by Atmos drive ladder |

```bash
# True background (native AX apps):
atmos desktop-use --json drive window-state --pid <pid> --window-id <id>
# pick element_token from elements[], then:
atmos desktop-use --json drive click --element-token '<token>' --pid <pid> --window-id <id>

# Pixel path (Electron / empty AX) — keep window on-screen, stay background first:
atmos desktop-use --json drive click --x <png_x> --y <png_y>
# only if needed:
atmos desktop-use --json drive click --x <png_x> --y <png_y> \
  --delivery-mode foreground --window-id <id>
```

Electron apps (e.g. Orca) often return an **empty AX tree** → pixel path only; keep the window visible on a Space, not necessarily focused.

## Visibility chrome

| Expectation | Reality |
|-------------|---------|
| See where agent points | Session + `move_cursor`; idle hide extended to ~1h for drive session |
| App / desktop **border highlight** | **Yes, blinking** — blue window / green desktop. Auto-clears after idle (~8s) or `drive session-end`. Toggle in Settings → Desktop Use → Operation border |
| **Under-arrow status text** | **Dynamic** — what is being operated now (e.g. `Clicking Orca`). Explicit: `--status "…"`. Fallback: `{agent} Operating` via `--agent-name` or env `ATMOS_DESKTOP_USE_AGENT_NAME` / `AGENT_NAME` |
| Must activate target app | **No** for default background path |

```bash
# End a drive run (clears border + engine session cursor)
atmos desktop-use --json drive session-end

# Prefs
atmos desktop-use --json prefs get
atmos desktop-use --json prefs set --operation-border false
```

```bash
# Agent should pass its own identity + live status when known:
export ATMOS_DESKTOP_USE_AGENT_NAME="Claude"
atmos desktop-use --json drive click --x … --y … --agent-name "Claude" --status "Opening 智能体仪表盘"
# Auto: "Clicking Orca" when window_id resolves; else "Claude Operating"
```

## Anti-patterns

- `drive windows` — use `drive verify`
- `click --pid` + screen/PNG coordinates (no `window_id`)
- Logical points without `--coord-space points` on Retina
- `osascript activate` every turn (use `delivery_mode foreground` only when needed)
- Endless coordinate spam without after-screenshot
- Raw AppleScript/Swift before fixing coord space / bare pid

## Errors

| Signal | Recovery |
|--------|----------|
| `control_engine_not_installed` | `driver ensure` / Settings Install |
| TCC denied | User grants Atmos Desktop Use AX + Screen Recording |
| ok click, no UI change | Drop `--pid`; fix png vs points; on-screen; `foreground` + `window_id` |
| empty PNG | doctor + permissions |

## Reporting

- Commands + ok/error  
- Screenshot paths before/after  
- Coord space used (`png` vs `points`) and whether `--pid` / `window_id` / `foreground`  
