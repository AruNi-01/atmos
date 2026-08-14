# TECH · APP-059: Browser Use experience kernel

> HOW. No new REST. No MCP. Settings via existing `functionSettingsApi`.

<!-- updated 2026-08-14: four pillars — unify, first success, handoff, host+settings -->

## Scope

| Area | Change |
|------|--------|
| CLI + `crates/browser-use` | Unified `state` envelope; `capability_flags` on every success; bind-mode no longer the empty-`state` success path |
| Embedded control plane | `/v1/state` without target snapshots last-active / unique guest; zero guests → renderer ensure |
| Renderer | `ensureSurface`; pick marks last-active + asks host to refresh snapshot cache |
| Skill | One loop; no `prepare`-first; no `user_picks` workflow |
| Settings | `browser` tab + store; move Layout Browser row |

## Locked decisions

1. Unify by **envelope + flags**, not by faking `semantic_v2`.
2. Empty `state` that can resolve a host returns a **snapshot**, not a session list.
3. Picks are **prepended `elements`**. `user_picks` is a compatibility alias only.
4. User owns placement. No `--surface`.
5. Ensure only when **zero** hosts. Bound `target_id` never relocates chrome.
6. Sidebar default / sidebar ensure ⇒ `rsShowBrowser = true`.
7. Desktop Use stays on its own Settings page.
8. Binding persists under pane/chat env, or default scope `atmos-browser-use` when none is injected — so `click --ref` can omit `--target-id`.
9. Atmos Desktop up (`control.json`) ⇒ Embedded unless the caller passed `--backend external`. A stored `external` binding does not win.
10. External bind-mode `state` follows through to a snapshot in the same call. Bind-only (`ok: true`, no `elements`) is not a successful page read.
11. Human `/browser-use` (Welcome **and** terminal slash) ensures the Settings default surface. Center `+` stays an explicit new tab.
12. `tabs open` without `--target-id` follows the Browser the user is using (unique UI `isActive`), then last-active as a tie-break / fallback.

## Unified `state` envelope (U1–U3)

CLI / crate normalize every successful `state` (and `prepare` for flags) to:

```json
{
  "ok": true,
  "action": "state",
  "backend": "embedded",
  "target_id": "…",
  "tab_id": "main",
  "snapshot_format": "embedded_dom_v1",
  "elements": [],
  "element_count": 0,
  "truncated": false,
  "total_candidates": 0,
  "capability_flags": {
    "tabs": true,
    "query": true,
    "continuation": false,
    "upload": false,
    "press_key": true,
    "ensure_surface": true,
    "snapshot_format": "embedded_dom_v1"
  },
  "pending_dialog": null
}
```

Implementation: `fill_result_envelope(&mut BrowserResult, backend)` in `crates/browser-use` after each backend returns. Embedded host already has `truncated` / `total_candidates`; external maps engine fields into the same names (missing ⇒ `false` / `elements.len()`).

Skill: one loop in `skills/atmos-browser-use` (bump version). Desktop embedded starts at `state`. `prepare` is documented only as “external engine / optional probe”.

## First success (F1–F3)

Today `/v1/state` without `target_id` is bind-only (list + maybe one id). That is the extra round-trip.

**New host behavior:**

```text
POST /v1/state  { target_id?, query? }
  if target_id:
      snapshot(target_id, query)           # unchanged
  else if last-active bound guest:
      snapshot(last-active, query)         # NEW — snapshot now
  else if exactly one bound guest:
      snapshot(that guest, query)          # NEW
  else if several bound guests:
      200 { ok:false, error_code: browser_ambiguous_target, sessions }
  else if hosts exist but none bound:
      200 { ok:false, error_code: browser_route_unavailable }  # do not ensure a second surface
  else: # zero hosts
      renderer ensure-bind (default surface, new_tab_url)
      snapshot(new target, query)
```

`prepare` does **not** run in this path. Embedded backend already talks to the control plane if `control.json` exists.

CLI: omitted `--backend` defaults to **embedded** when `control.json` exists. `execute(State)` on embedded **does not inject** a stored `target_id` (so last-active / pick handoff can run); it commits the snapshot ids afterward. Click/type still reuse the stored target. Binding merge never writes `None` over a live `tab_id`. `fill_result_envelope` stamps `capability_flags` on every success but lifts `elements[]` only for `state` / `prepare`.

`tabs open` with zero hosts: renderer `ensureSurface` then in-panel open (H2). With no `--target-id`: open in the **UI-active** Browser the user is using. If none or several panels are UI-active, use the last-active session's panel. Do not ensure a second chrome.

## Handoff (P1–P3)

On `browser_bridge_user_picks`:

1. `setUserPicks(sessionId, picks)` (already).
2. `markLastActive(sessionId)` on the surface manager.
3. `refreshSnapshotCache(sessionId)` — rebuild cache with picks **prepended** as `g{gen}:u0…`, then remaining DOM `eN`. Bump generation so prior refs stale.
4. Do not require the agent to call anything else.

`/v1/state` snapshot builder already merges picks; change order to **picks first**, and stop treating missing selector as a clickable rect (hardening). Skill: “Highlighted nodes are the first elements. Re-`state` after the user points at something.”

`user_picks` key may still be emitted as `elements.filter(source)` for one release; skill and `--help` omit it.

## Host & Settings (H1–H7)

Unchanged from the previous TECH draft, summarized:

- Function settings group `browser`: `default_surface` (`sidebar`|`center`, default `sidebar`), `new_tab_url`, `show_agent_chrome`.
- `rsShowBrowser` stays on **layout** group; Browser page is the only editor.
- `ensureSurface({ contextId, placement, url? })` on the renderer FIFO.
  - Sidebar: show module, expand, select `browser`, optional `openTab`.
  - Center: reuse last center Browser for the workspace, else `openBrowser`, then optional `openTab`.
- Agent tab actions: `open` | `select` | `close` | `ensure-bind`.
- Ack may include `surface`.
- Settings tab `browser` in Interface; Layout card drops the Browser row.
- i18n en+zh, sentence case.

```text
User setting default_surface
        │
Agent: state | tabs open
        │
Control plane
        ├─ host resolvable → snapshot / open-in-panel
        └─ zero hosts → emitAgentTab(ensure-bind|open)
                │
         Renderer ensureSurface(placement)
                │
         bind session → ack target_id
                │
         snapshot (state) or done (tabs open)
```

Main process still does not create in-panel webviews or write React tab state.

## Skill loop (canonical)

```text
# Desktop / embedded (host up or will ensure)
atmos browser-use state
# → elements, target_id, capability_flags
# act with refs from THIS snapshot only
atmos browser-use click --ref …
# after navigate, user pick, or mutation:
atmos browser-use state

# only if capability_flags.tabs
atmos browser-use tabs --action open --url …

# only if capability_flags.upload / continuation / …
```

External: if `prepare` is required by the engine, the skill does it **once** when `capability_flags` from a failed `state` say setup is needed — not as the default first line on Desktop. A pid/window `state` must return `elements[]` (crate auto-snapshots after bind). Inside Atmos, omitted `--backend` is always the in-app Browser.

## Rollout (implementation chunks, one ship)

These are engineering slices, not product phases. All Must Haves land in the same PR train:

1. Envelope + `capability_flags` + skill one-loop (U*, F1 documentation).
2. `/v1/state` snapshot-now + pick prepend + last-active on pick (F2, P*).
3. Settings page + `ensureSurface` + empty-host ensure (H*, F2 zero-guest).
4. TEST.md scenarios green.

Do not ship Settings/ensure without U/F/P — that is the failure mode of the first draft of this spec.

## Risks

| Risk | Mitigation |
|------|------------|
| Snapshot-now on the wrong tab | Only last-active or unique guest; else ambiguous |
| Ensure in the wrong window | Ensure only at zero hosts; otherwise last-active host |
| Models still call `prepare` | Skill + CLI help; `prepare` remains harmless |
| Old clients read `user_picks` | Keep alias one release |
| Center ensure spawns many tabs | Reuse last center Browser per workspace |

## Non-goals (tech)

- New public REST.
- Main-process tab store.
- Broadcast `agent-tab` to every window.
- `--surface` clap flag.
