---
name: atmos-browser-use
version: "2.0.0"
description: >
  Control web pages via Browser Use (`atmos browser-use`), separate from Desktop Use.
  Prefer for Chrome/Chromium page DOM or Atmos in-app browser (embedded). Do not use for
  OS window chrome or non-browser apps (Slack/VS Code). No MCP. External path requires
  Desktop Use control engine 0.19.2+ (extension-free browser tools).
---

# Atmos Browser Use

**Page / tab control** — not Desktop Use. **No MCP.**  
External engine pin: **0.19.2** (`semantic_v2`, pointer, dialog, download).

## Backends

| `--backend` | Meaning |
|-------------|---------|
| `external` (default) | System Chrome/Chromium via Desktop Use control engine |
| `embedded` | Atmos in-app browser via Desktop host control plane |

## System Chrome loop (external) — canonical

```bash
# 0) Engine ready
atmos desktop-use --json status
# if needed: atmos desktop-use --json driver ensure

# 1) Find Chrome window
atmos desktop-use --json drive verify

# 2) Prepare — default is driver-owned isolated_new (does not mutate user profile)
atmos browser-use --json prepare --backend external --pid <chrome_pid>
# authenticated profile (opt-in only):
# atmos browser-use --json prepare --backend external --pid <pid> --window-id <wid> \
#   --strategy existing_profile

# 3) Bind native window → target_id / tab_ids
atmos browser-use --json state --backend external --pid <pid> --window-id <wid>

# 4) Snapshot page (semantic_v2 by default)
atmos browser-use --json state --backend external \
  --target-id <target> --tab-id <tab> --include-screenshot

# 5) Act (refs invalidate after navigate / newer snapshot — re-state)
atmos browser-use --json click --backend external --target-id … --tab-id … --ref …
atmos browser-use --json type --backend external --target-id … --tab-id … --ref … --text "…"
atmos browser-use --json navigate --backend external --target-id … --tab-id … --url https://…
atmos browser-use --json pointer --backend external --target-id … --tab-id … \
  --action hover --ref …
atmos browser-use --json dialog --backend external --target-id … --tab-id … --action inspect
```

### Notes (0.19)

- Prefer **isolated** prepare; only use `existing_profile` when cookies/login are required.
- Snapshot default: `semantic_v2` (outline + typed action refs). Use `--snapshot-format dom_refs_v1` only if needed.
- Click accepts `--ref` **or** `--x`/`--y` (viewport CSS px). Convert from PNG with engine scale fields when using screenshots.
- Type requires `--ref`; optional `--mode insert_text|keystrokes`, `--replace`.
- Always re-`state` after navigate or mutation when refs may be stale.
- Window chrome / OS dialogs / file pickers → **`atmos-desktop-use`**, not Browser Use.

## Atmos embedded loop (in-app browser)

Requires **Atmos Desktop** with at least one Browser tab open.  
Same CLI surface as external (click / type / navigate / pointer / dialog / download); execution is Electron guest CDP, not system Chrome.

```bash
# 1) List / bind sessions (target_id = in-app browser session id)
atmos browser-use --json prepare --backend embedded
atmos browser-use --json state --backend embedded

# 2) Snapshot DOM refs
atmos browser-use --json state --backend embedded --target-id <session_id>

# 3) Act (full surface)
atmos browser-use --json click --backend embedded --target-id <session_id> --tab-id main --ref e0
atmos browser-use --json type --backend embedded --target-id <session_id> --tab-id main --ref e3 --text "hello"
atmos browser-use --json navigate --backend embedded --target-id <session_id> --tab-id main --url https://example.com
atmos browser-use --json pointer --backend embedded --target-id <session_id> --tab-id main \
  --action hover --ref e0
atmos browser-use --json dialog --backend embedded --target-id <session_id> --tab-id main --action inspect
atmos browser-use --json download --backend embedded --target-id <session_id> --tab-id main \
  --ref e5 --dir "$HOME/Downloads/atmos-browser"
```

Notes:

- Refs come from embedded snapshot (`e0`, `e1`, …); re-`state` after navigate.
- `dialog inspect` arms CDP `Page.javascriptDialogOpening`; accept/dismiss needs `dialog_id`.
- `download` clicks the ref and saves via the guest session `will-download` into `--dir`.

## Decision

| Target | Surface |
|--------|---------|
| Atmos in-app browser page | `--backend embedded` (full CLI; host control plane) |
| User Chrome/Chromium page | `--backend external` (engine 0.19.2+) |
| Window chrome / Slack / VS Code / any non-browser app | **`atmos-desktop-use`** |

## Errors

| Code | Meaning |
|------|---------|
| `embedded_browser_host_unavailable` | Desktop Browser Use host not running |
| `control_engine_not_installed` / `browser_engine_failed` | Install/update Desktop Use engine (0.19.2+) |
| `invalid_args` | Missing target_id / ref / url / bind ids |
