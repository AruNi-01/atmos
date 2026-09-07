---
name: atmos-device-preview
version: "1.0.0"
description: >
  Control Atmos Device Preview (iOS Simulator / Android emulator) via
  `atmos simulator` (screenshot, tap, swipe, type, press) without MCP. Use
  whenever the user or task needs to tap the simulator, drive an android
  emulator, interact with device preview, or take a phone screenshot in Atmos.
  Do not use for macOS desktop capture (atmos-desktop-use) or in-page browser
  DOM (atmos-browser-use). Not folded into atmos-cli.
---

# Atmos Device Preview

Drive a **claimed** iOS Simulator / Android emulator in the Atmos Simulator tab
via `atmos simulator`. **No MCP.** Separate product from Desktop Use and
Browser Use — **not** `atmos-cli`.

Details: [`references/cli.md`](references/cli.md).

## Prerequisites

1. `atmos` on `PATH`.
2. Workspace sticky: `atmos context set --workspace <id>` (or `--workspace` on
   the command). Missing workspace → `CONTEXT_REQUIRED`.
3. A **live claim**. v1 tap/screenshot/swipe/type/press never start preview.

## Decision tree

1. If the message already contains a Device Preview chip / pasted prompt /
   explicit `udid` → use that `udid`.
2. Else `atmos simulator list`. If **one** live claim **in this workspace**,
   use it and say so.
3. If **several** live claims on the Computer (or none in this workspace but
   others exist): print `name · platform · project · workspace` (flag the
   current workspace) and **ask which `udid`**. Do not pick.
4. If zero claims: ask the user to Start the Simulator tab, click Agent, or
   run `/device-preview`. Do **not** auto-boot.
5. Then screenshot → tap/swipe/type/press **with `--udid`**.

| Intent | Command |
|--------|---------|
| Ready / inventory | `list` then `status` |
| Capture | `screenshot --udid …` |
| Tap / swipe / type / press | `tap` / `swipe` / `type` / `press` **with `--udid`** |
| Probe / start / stop | only if the user asked to open or close preview |
| macOS desktop GUI | **other skill** — `atmos-desktop-use` |
| Page DOM | **other skill** — `atmos-browser-use` |

## Critical rules (read this — most failures are here)

### 1) Coordinate space (not Desktop Use)

`screenshot` writes a PNG and returns `{ path, width, height, … }`. Read that
PNG. Then:

```text
--x = px / width     # normalized 0..1
--y = py / height    # normalized 0..1
```

Top-left origin. Outside `0..1` → `INVALID_COORDS`.

**Wrong:** Desktop Use `--coord-space png` / `--coord-space points` on these
commands. **Wrong:** raw PNG pixels as `--x 240 --y 400`.

### 2) `--udid` is the device handle

`--platform` is a filter, not a unique id. Never pick “any Android on the
machine.” Never curl a helper port. Never use `url` / `port`.

Pass `--udid` on every screenshot/tap/swipe/type/press once you have one.

### 3) Live claim required

Tap must **not** start the preview. `NO_CLAIM` → ask the user to Start.
Do not run `atmos simulator start` unless they asked to open preview.

### 4) iOS keys

`press --key home` only. `back` / `recents` → `UNSUPPORTED_ON_PLATFORM`.
Do **not** retry those as Android.

## Default loop

```bash
atmos simulator list
# one live claim in this workspace → use its udid (and say so)
atmos simulator screenshot --udid <udid>
# Read result.path; use result.width / result.height
atmos simulator tap --udid <udid> --x <px/width> --y <py/height>
atmos simulator screenshot --udid <udid>
```

`status` for agents is `{ udid, name, platform, helper, workspace_id }`.
Do **not** tell yourself to use url/port.

Always JSON stdout. Do not pass `--json`. Do not teach `atmos call simulator_*`.

## Anti-patterns

- curl helper, `npx serve-sim`, or any port
- Desktop Use on Simulator.app / emulator window
- Browser Use for the phone iframe
- Auto-`start` because tap returned `NO_CLAIM`
- Choosing a device by `--platform` alone
- Desktop Use `--coord-space png` here
- Folding this into `atmos-cli` as the primary skill
- MCP

## Errors

| Code | Recovery |
|------|----------|
| `NO_CLAIM` | Ask user to Start Simulator / Agent / `/device-preview`. Do not auto-start. |
| `DEVICE_UNKNOWN` | Re-`list`; use a udid from the table |
| `CLAIMED_BY_OTHER_WORKSPACE` | Stop. Ask which workspace; do not drive that udid from here |
| `PLATFORM_MISMATCH` | Stay on this claim; do not switch devices |
| `UNSUPPORTED_ON_PLATFORM` | iOS `back`/`recents` — do not retry as Android |
| `INVALID_COORDS` | Recompute `px/width`, `py/height` from the latest PNG size |
| `HELPER_UNREACHABLE` | Report; do not curl a port |
| `CONTEXT_REQUIRED` | `atmos context set --workspace <id>` or pass `--workspace` |
| `AMBIGUOUS_DEVICE` | `list` and ask which `udid` |
| `EMPTY_TEXT` | Pass `--text` |

Branch on `error.code`. Follow `fix` / `next_actions` when present.

## Reporting

- Commands + ok / `error.code`
- `udid` used (say when you inferred the single workspace claim)
- Screenshot paths + PNG width/height
- Normalized coords (`px/width`, `py/height`) — never Desktop Use coord-space
