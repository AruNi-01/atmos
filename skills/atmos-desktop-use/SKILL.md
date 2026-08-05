---
name: atmos-desktop-use
version: "1.6.1"
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
| Click / type / full desktop shell | `drive click|type|double-click|scroll|hotkey|…` (Phase 1–2; see cli.md) |
| **Page / Chrome DOM** | **`atmos browser-use`** (separate product — not Desktop Use) |
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
| **AX element_token** (**preferred**) | `window-state` → `click --element-token` | **Yes** — even hidden / off-Space when tree exists |
| **Desktop PNG** | `--x --y` only, **no** `--pid` | Needs window **on-screen** |
| **Window-local** | `--window-id` + optional `--pid`, coords from **that** window image | Same |

```bash
# BEST — AX token (true background) when window-state has elements
atmos desktop-use --json drive window-state --pid <pid> --window-id <id>
# read result.atmos_surface + elements[].element_token, then:
atmos desktop-use --json drive click --element-token '<token>' --pid <pid> --window-id <id>
atmos desktop-use --json drive type --text "…" --element-token '<token>' --pid <pid> --window-id <id>

# GOOD — PNG pixels from drive screenshot (no --pid)
atmos desktop-use --json drive screenshot --out /tmp/du.png
atmos desktop-use --json drive click --x <png_x> --y <png_y>

# GOOD — logical points from window bounds / AX
atmos desktop-use --json drive click --x 100 --y 161 --coord-space points

# Electron stubborn UI (last resort — brief focus steal):
atmos desktop-use --json drive click --x <png_x> --y <png_y> \
  --delivery-mode foreground --window-id <id>

# BAD
atmos desktop-use --json drive click --x 100 --y 161 --pid 12345   # bare pid + screen coords
# BAD — logical y=161 without --coord-space points on Retina → lands ~y=80
# BAD — thrashing element_token when atmos_surface.kind is ax_empty
```

### 3) Electron / Chromium shells (Slack, VS Code, Discord, Orca, …)

These are **Desktop Use**, not Browser Use. OS AX is often empty or shell-only.

**Always start with window-state** and read `result.atmos_surface`:

| `atmos_surface.kind` | Meaning | Do this |
|----------------------|---------|---------|
| `ax_ok` | Actionable tree | **Only** `element_token` until it fails |
| `ax_sparse` | Few nodes (chrome) | Token if matches; else pixel for content |
| `ax_heavy` | Huge tree | `--max-elements` / `--max-depth` / `--query`; still prefer token |
| `ax_empty` | Empty / `ax_window_unresolved` | **Stop AX retries** → screenshot + pixel ladder |

```bash
atmos desktop-use --json drive window-state --pid <pid> --window-id <id>
# optional bounds for heavy apps:
atmos desktop-use --json drive window-state --pid <pid> --window-id <id> \
  --max-elements 400 --max-depth 15 --query "Send"

# ax_empty / electron_likely:true → pixel path only
atmos desktop-use --json drive screenshot --out /tmp/du.png
atmos desktop-use --json drive click --x <png_x> --y <png_y>          # background first
# only if UI unchanged:
atmos desktop-use --json drive click --x <png_x> --y <png_y> \
  --delivery-mode foreground --window-id <id>
```

**Action ladder (hard rule):**  
`background AX token` → re-snapshot → `background pixel` → re-screenshot → `foreground + window_id`.  
Do **not** use `atmos browser-use` for Slack/VS Code/Discord (no CDP for ordinary Electron shells).

### 4) After every click

Take a new screenshot and confirm the UI changed. If not: drop bare `--pid`, fix coord space, check `is_on_screen`, advance one step on the ladder.

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
| **AX `element_token`** (preferred) | **Yes** — backgrounded / minimized / off-Space when tree exists | `window-state` → `click/type --element-token` |
| **Pixel click** (`--x --y`) | **Partial** — window must be **on-screen** | Pixel clicks annotate `atmos_addressing`. Use `foreground` only after background fails |
| `bring_to_front` | **Never default** | Explicit `drive front` only |

```bash
# True background (AX ok):
atmos desktop-use --json drive window-state --pid <pid> --window-id <id>
# use atmos_surface.sample_element_token or elements[].element_token
atmos desktop-use --json drive click --element-token '<token>' --pid <pid> --window-id <id>

# Pixel path (ax_empty / Electron) — window on-screen, background first:
atmos desktop-use --json drive click --x <png_x> --y <png_y>
atmos desktop-use --json drive click --x <png_x> --y <png_y> \
  --delivery-mode foreground --window-id <id>
```

## Visibility chrome

| Expectation | Reality |
|-------------|---------|
| See where agent points | Session + `move_cursor`; idle hide extended to ~1h for drive session |
| App / desktop **border highlight** | **Yes, blinking** — blue window / green desktop. Auto-clears after idle (~8s) or `drive session-end`. Toggle in Settings → Desktop Use → Operation border |
| **Under-arrow status text** | **`{Agent} - {operation}`** under the pointer only. Explicit: `--status "…"`. Auto: `Clicking Orca` / `Operating`. No free-floating capsule without a cursor position. |
| **Border z-order** | Window border sits just above the target; **hides** when another app covers the target (does not paint over your work). No full-desktop fallback for window-scoped actions. |
| Must activate target app | **No** for default background path — avoid `drive front` every turn |

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
# Caption: "Claude - Opening 智能体仪表盘" (under pointer only)
# Auto without --status: "Claude - Clicking Orca" when window_id resolves

# Empty-AX type (QQ Music / custom UI): pixel-focus then type at same coords
atmos desktop-use --json drive click --x <png_x> --y <png_y>
atmos desktop-use --json drive type --text "周杰伦" --x <png_x> --y <png_y>
# logical screen points + window (auto-normalized to window-local PNG):
atmos desktop-use --json drive type --text "周杰伦" --x 780 --y 78 \
  --coord-space points --window-id <id> --pid <pid>
```

## Desktop vs page CDP

| Target | Command family |
|--------|----------------|
| Any app shell, keys, AX, pixels | **`atmos desktop-use drive …`** (this skill) |
| Chrome/Chromium **page** DOM | **`atmos browser-use …`** (separate skill surface; **no MCP**) |
| Atmos in-app browser (webview) | `atmos browser-use --backend embedded` |

Do **not** use Desktop Use for deep webpage automation when Browser Use is available.

## Anti-patterns

- `drive windows` — use `drive verify`
- `click --pid` + screen/PNG coordinates (no `window_id`)
- Logical points without `--coord-space points` on Retina
- `osascript activate` every turn (use `delivery_mode foreground` only when needed)
- Endless coordinate spam without after-screenshot
- Raw AppleScript/Swift before fixing coord space / bare pid
- MCP for desktop or browser control

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
