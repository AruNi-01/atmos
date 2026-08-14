---
name: atmos-browser-use
version: "2.3.0"
description: >
  Control web pages via Browser Use (`atmos browser-use`), separate from Desktop Use.
  Prefer for Chrome/Chromium page DOM or Atmos in-app browser (embedded). Do not use for
  OS window chrome or non-browser apps (Slack/VS Code). No MCP. External path requires
  Desktop Use control engine 0.19.2+ (extension-free browser tools).
---

# Atmos Browser Use

**Page / tab control** — not Desktop Use. **No MCP.**
External engine pin: **0.19.2** (`semantic_v2`, pointer, dialog, download, upload).
Embedded snapshot contract: **`embedded_dom_v1`**.

`atmos browser-use` always prints JSON. Do **not** pass `--json` (it is a no-op on this command).

## Backends

| `--backend` | Meaning |
|-------------|---------|
| omitted | Reuse the scoped binding; otherwise `external` |
| `external` | System Chrome/Chromium via Desktop Use control engine |
| `embedded` | Atmos in-app browser via Desktop host control plane |

On Atmos Desktop, prefer **embedded** when a Browser tab is already open. `/browser-use` is not blocked on Desktop Use TCC in that case.

## Binding (omit target / tab after the first success)

Scope (first match wins): `--binding-id` → `ATMOS_BROWSER_USE_BINDING_ID` → `ATMOS_SIDE_CHAT_ID` → `ATMOS_PANE_ID`.

After a successful `prepare` / `state` / act, later calls in the same scope may omit `--backend`, `--target-id`, and `--tab-id`. If several surfaces match, the CLI returns `browser_ambiguous_target` — pass the ids from `state`. Bindings store `{backend,target_id,tab_id}` only. **Never persist refs.**

`end` clears the scoped binding. `tabs --action close` clears it only when the closed `target_id` is the stored current target. `tabs --action list` does not rewrite the binding.

## System Chrome loop (external)

```bash
# 0) Engine ready (external only)
atmos desktop-use status
# if needed: atmos desktop-use driver ensure

# 1) Find Chrome window
atmos desktop-use drive verify

# 2) Prepare — default isolated_new (does not mutate the user profile)
atmos browser-use prepare --pid <chrome_pid>
# isolated_new may start a NEW process. Bind with prepared_pid / prepared_window_id
# from the prepare response — do not reuse the original --pid.

# 3) Bind native window → target_id / tab_ids
atmos browser-use state --pid <prepared_pid> --window-id <prepared_window_id>

# 4) Snapshot (semantic_v2). Refs die after the next snapshot / navigate.
atmos browser-use state --target-id <target> --tab-id <tab> --include-screenshot
# Narrow a large page:
atmos browser-use state --target-id <target> --tab-id <tab> --query "Sign in"
# Continue a truncated semantic_v2 page:
atmos browser-use state --target-id <target> --tab-id <tab> --continuation <token>

# 5) Act
atmos browser-use click --ref …
atmos browser-use type --ref … --text "…"
atmos browser-use navigate --url https://…
atmos browser-use pointer --action hover --ref …
atmos browser-use dialog --action inspect
atmos browser-use download --ref … --dir "$HOME/.atmos/data/browser-use/downloads"
atmos browser-use upload --ref … --file /path/to/file
atmos browser-use end
```

`existing_profile` is **not granted** on this host. Do not use it unless the user has enabled that grant. Default remains `isolated_new`.

### Notes (0.19)

- Snapshot default: `semantic_v2`. Use `--snapshot-format dom_refs_v1` only if needed.
- Click accepts `--ref` **or** `--x`/`--y` (viewport CSS px).
- `--input-route trusted` (default) vs `dom_event` (page JS listeners only; weaker, use when trusted click is refused).
- Type requires `--ref`; optional `--mode insert_text|keystrokes`, `--replace`.
- Always re-`state` after navigate or mutation. Do **not** click `e0` after a failed lookup or a missing snapshot — that is `browser_ref_stale`.
- Window chrome / OS dialogs / file pickers → **`atmos-desktop-use`**, not Browser Use.
- `press-key` is **embedded only**.

## Atmos embedded loop (in-app browser)

Requires **Atmos Desktop** with at least one Browser tab open.

```bash
atmos browser-use prepare --backend embedded
atmos browser-use state --backend embedded
atmos browser-use state --backend embedded --target-id <session_id>
atmos browser-use state --backend embedded --target-id <session_id> --query "Sign in"
atmos browser-use click --backend embedded --target-id <session_id> --ref g1:e0
atmos browser-use type --backend embedded --target-id <session_id> --ref g1:e3 --text "hello"
atmos browser-use press-key --backend embedded --target-id <session_id> --key Enter
atmos browser-use navigate --backend embedded --target-id <session_id> --url https://example.com
atmos browser-use tabs --backend embedded --action list
atmos browser-use tabs --backend embedded --action open --url https://example.com
atmos browser-use tabs --backend embedded --action select --target-id <session_id>
atmos browser-use tabs --backend embedded --action close --target-id <session_id>
atmos browser-use end --backend embedded
```

Notes:

- Snapshot format is `embedded_dom_v1` (visible nodes, generation-scoped refs like `g1:e0`). `semantic_v2` is unsupported here (`browser_unsupported`).
- `--query` filters embedded snapshots by name / role / tag / href. The response includes `truncated` and `total_candidates` when more than 200 matches exist. Re-`state` with a narrower query instead of inventing refs.
- Do not invent a ref. If cache is empty, `state` first — the host will **not** auto-snapshot and then click `e0`.
- User pick / annotate in the Desktop Browser is included on the next `state` as `user_picks` with snapshot-scoped refs (`g1:u0`). Click those refs — do not paste clipboard selectors. If the selector is gone, the pick is not clickable (`browser_ref_stale`); do not reuse an old rectangle.
- `tabs` is **embedded only**. The web renderer owns open/close/select. The host does not create webviews itself. `open` returns a new `target_id` (session id); bind that before acting.
- Tab routing: pass `--target-id` of a tab in the desired panel. The host sends the command to that guest's window, or to the last-active Browser window. It does **not** silently pick the main window or guess among several panels (`browser_ambiguous_target` / `browser_route_unavailable`).
- `tabs --action list` includes `focused` for the last-active guest.
- `download` on **embedded** writes under `~/.atmos/data/browser-use/downloads` when `--dir` is omitted; if you pass `--dir`, it must stay inside that root. On **external**, `--dir` is required.
- `upload` is external-only.

## Decision

| Target | Surface |
|--------|---------|
| Atmos in-app browser page | `--backend embedded` |
| User Chrome/Chromium page | `--backend external` (engine 0.19.2+) |
| Window chrome / Slack / VS Code / any non-browser app | **`atmos-desktop-use`** |

## Errors

| Code | Meaning |
|------|---------|
| `embedded_browser_host_unavailable` | Desktop Browser Use host not running |
| `browser_control_auth_failed` | Restart Atmos Desktop (control-plane token) |
| `control_engine_not_installed` / `browser_engine_failed` | Install/update Desktop Use engine (0.19.2+) |
| `browser_ref_stale` | Re-run `state`; use a ref from that snapshot |
| `browser_ambiguous_target` | Pass `--target-id` / `--tab-id` of the intended panel |
| `browser_route_unavailable` | No bound guest / unknown `--target-id` / no host window for the tab command |
| `browser_unsupported` | Action or snapshot format is not available on this backend |
| `browser_untrusted_content` | Page refused a trusted input; ask the user or use a trusted snapshot |
| `browser_setup_required` | Desktop Use / system permissions are missing |
| `browser_profile_grant_required` | Use `isolated_new`, not `existing_profile` |
| `browser_download_denied` | `--dir` outside the approved downloads root |
| `browser_navigate_denied` | Only http / https / about:blank |
| `invalid_args` | Missing target_id / ref / url / bind ids / unknown `--strategy` |
