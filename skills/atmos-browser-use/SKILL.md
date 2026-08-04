---
name: atmos-browser-use
version: "1.1.0"
description: >
  Control web pages via Browser Use (`atmos browser-use`), separate from Desktop Use.
  Prefer for Chrome/Chromium page DOM or Atmos in-app browser (embedded). Do not use for
  OS window chrome or non-browser apps (Slack/VS Code). No MCP.
---

# Atmos Browser Use

**Page / tab control** — not Desktop Use. **No MCP.**

## Backends

| `--backend` | Meaning |
|-------------|---------|
| `cua` (default) | System Chromium via managed control engine (`browser_*` tools) |
| `embedded` | Atmos in-app browser (APP-053 `<webview>`, partition `persist:atmos-browser`) via Desktop host control plane |

## Atmos embedded loop (in-app browser)

Requires **Atmos Desktop** running with at least one Browser tab open (so a webview guest is bound).

```bash
# 1) Host readiness + list sessions (target_id = APP-053 session id)
atmos browser-use --json prepare --backend embedded

# 2) Bind list (omit target) or snapshot DOM refs for a session
atmos browser-use --json state --backend embedded
atmos browser-use --json state --backend embedded --target-id <session_id>

# 3) Act
atmos browser-use --json click --backend embedded --target-id <session_id> --tab-id main --ref e0
atmos browser-use --json type --backend embedded --target-id <session_id> --tab-id main --ref e3 --text "hello"
atmos browser-use --json navigate --backend embedded --target-id <session_id> --tab-id main --url https://example.com
```

Host writes `~/.atmos/browser-use/control.json` with a loopback `base_url`. CLI talks only to that plane — **never** user-Chrome `browser_prepare`.

## System Chrome loop (CUA)

```bash
# Find Chrome pid + window_id via Desktop Use
atmos desktop-use --json drive verify

atmos browser-use --json prepare --backend cua --pid <chrome_pid>
atmos browser-use --json state --backend cua --pid <pid> --window-id <wid>
atmos browser-use --json state --backend cua --target-id … --tab-id …
atmos browser-use --json click --backend cua --target-id … --tab-id … --ref …
```

## Decision

| Target | Surface |
|--------|---------|
| Atmos in-app browser page | `--backend embedded` |
| User Chrome/Chromium page | `--backend cua` |
| Window chrome / Slack / VS Code / any non-browser app | **`atmos-desktop-use`** (AX / pixel) |

## Errors

| Code | Meaning |
|------|---------|
| `embedded_browser_host_unavailable` | Desktop control plane not running / no control.json |
| `control_engine_not_installed` / `browser_engine_failed` | CUA path needs Desktop Use engine install |
| `invalid_args` | Missing target_id / ref / url |
