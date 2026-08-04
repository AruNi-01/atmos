---
name: atmos-browser-use
version: "1.0.1"
description: >
  Control web pages via CDP-style Browser Use (`atmos browser-use`), separate from
  Desktop Use. Prefer for Chrome/Chromium page DOM (click ref, type, navigate).
  Do not use for OS window chrome or non-browser apps. No MCP.
---

# Atmos Browser Use

**Page / tab control** — not Desktop Use. **No MCP.**

## Backends

| `--backend` | Meaning |
|-------------|---------|
| `cua` (default) | System Chromium via managed control engine (`browser_*` tools) |
| `embedded` | Atmos in-app browser (APP-053 webview) — **reserved stub** until PR #203 merges |

## Engine 0.17 loop (system Chrome)

```bash
# 1) Find Chrome pid + window_id (Desktop Use)
atmos desktop-use --json drive apps
atmos desktop-use --json drive verify   # note pid + window_id for Chrome

# 2) Prepare CDP endpoint
# Detect-only (no existing_profile unless you pass --window-id + --strategy):
atmos browser-use --json prepare --backend cua --pid <chrome_pid>

# Attach existing user profile (requires window_id + host grants):
atmos browser-use --json prepare --backend cua --pid <pid> --window-id <wid> \
  --strategy existing_profile

# 3) Bind → mint target_id + tab_ids  (requires pid + window_id)
atmos browser-use --json state --backend cua --pid <pid> --window-id <wid>
# read target_id / tab_id from JSON

# 4) Snapshot DOM refs for a tab
atmos browser-use --json state --backend cua --target-id <tid> --tab-id <tab>

# 5) Act (all require target_id + tab_id; type also requires --ref)
atmos browser-use --json click --backend cua --target-id <tid> --tab-id <tab> --ref <ref>
atmos browser-use --json type --backend cua --target-id <tid> --tab-id <tab> --ref <ref> --text "…"
atmos browser-use --json navigate --backend cua --target-id <tid> --tab-id <tab> --url https://…
```

**Do not** call bare `state` without bind or snapshot ids — engine needs `pid+window_id` or `target_id+tab_id`.

## Decision

- **Page content / DOM** → this skill  
- **Window chrome, other apps, global keys** → `atmos-desktop-use`  
- **Embedded Atmos browser** → `--backend embedded` only after APP-053; until then use `cua` or desktop path  

## Errors

| Code | Meaning |
|------|---------|
| `embedded_browser_not_implemented` | Stub; wait for APP-053 webview |
| `control_engine_not_installed` | `atmos desktop-use driver ensure` first |
| `invalid_args` | Missing pid / window_id / target_id / tab_id / ref |
| `browser_engine_failed` | Engine refusal (consent, setup, scope) — read `result` |
