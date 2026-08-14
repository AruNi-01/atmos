---
name: atmos-browser-use
version: "3.2.0"
description: >
  Control web pages via Browser Use (`atmos browser-use`), separate from Desktop Use.
  Prefer for Chrome/Chromium page DOM or Atmos in-app browser (embedded). Do not use for
  OS window chrome or non-browser apps (Slack/VS Code). No MCP. External path requires
  Desktop Use control engine 0.19.2+ (extension-free browser tools).
---

# Atmos Browser Use

**Page / tab control** — not Desktop Use. **No MCP.**
External engine pin: **0.19.2**. Embedded snapshot: **`embedded_dom_v1`**.

`atmos browser-use` always prints JSON. Do **not** pass `--json`.

Successful **`state`** uses one envelope: `elements[]`, `truncated`,
`total_candidates`, `capability_flags`, honest `snapshot_format`.
Other verbs (click / type / tabs) do **not** include `elements[]`.
`capability_flags` is a **capability table**, not a per-call event.
Branch only on flags, not on two backend tutorials.

## One loop

```bash
# Desktop — first command. No prepare.
# If a Browser is already open, this returns target_id AND elements.
# If none exists, Desktop creates the user's default surface then snapshots.
# When Atmos Desktop is open, omitted --backend defaults to embedded.
atmos browser-use state

# Act with refs from THIS snapshot only
atmos browser-use click --ref …
atmos browser-use type --ref … --text "…"
atmos browser-use navigate --url https://…

# After navigate, a user highlight, or any mutation — state again
atmos browser-use state
```

Highlighted nodes are the **first** `elements[]` (refs like `g1:u0`). Click them
like any other ref. Skip nodes with `visible: false`. Do not look for a side channel.

## Flags

Read `capability_flags` on the last success. These say what the backend *can* do:

| Flag | When true |
|------|-----------|
| `tabs` | `atmos browser-use tabs --action list\|open\|select\|close` |
| `query` | `state --query "Sign in"` to narrow a large page |
| `continuation` | `state --continuation <token>` (external `semantic_v2` only) |
| `upload` | `upload --ref … --file …` (external only) |
| `press_key` | `press-key --key Enter` (embedded only) |
| `ensure_surface` | empty Desktop `state` / `tabs open` *may* create chrome |

`snapshot_format` is `embedded_dom_v1` or `semantic_v2`. Never invent the other.

## Binding

After the first successful `state`, later **act** calls in the same scope may omit
`--backend`, `--target-id`, and `--tab-id`. A later `state` without `--target-id`
follows the last-active tab (including a user highlight). Several surfaces →
`browser_ambiguous_target` — pass the ids from `state`. **Never persist refs.**

`end` clears the scoped binding.

## External (system Chrome)

Only when Atmos Desktop is **not** the host — `capability_flags.ensure_surface`
is false, or the user passed `--backend external` (Desktop Use operating a
system browser). Inside Atmos, omitted `--backend` is the in-app Browser.

If `state` has no `elements` and asks for setup, prepare **once**, then `state`
again. That second `state` must return `elements[]` (bind-only is not a page):

```bash
atmos desktop-use status
atmos browser-use prepare --pid <chrome_pid>
atmos browser-use state --pid <prepared_pid> --window-id <prepared_window_id>
```

Default prepare is `isolated_new`. Do not use `existing_profile` unless the user
enabled that grant.

## Do not

- Call `prepare` first on Desktop embedded.
- Treat a bind-only list (no `elements`) as a finished page snapshot.
- Treat click/tabs JSON as a snapshot — it has no `elements`.
- Click `e0` after a failed lookup or a missing snapshot (`browser_ref_stale`).
- Pass `--surface`. Placement is the user's Settings → Browser default.
- Use Browser Use for window chrome / Slack / VS Code → `atmos-desktop-use`.

## Errors

| Code | Meaning |
|------|---------|
| `embedded_browser_host_unavailable` | Desktop host not running |
| `browser_ambiguous_target` | Several tabs; pass `--target-id` |
| `browser_ref_stale` | Re-`state`, then use a ref from that snapshot |
| `browser_unsupported` | Flag is false for this backend |
| `control_engine_not_installed` / `browser_engine_failed` | Desktop Use engine 0.19.2+ |
