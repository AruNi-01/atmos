# PRD · APP-059: Browser Use experience kernel

> WHAT & WHY. Domain: **browser**. Builds on APP-052 / APP-053. Includes the new host+settings capability **and** the three experience lifts (unify, first success, handoff). None of the four is optional.

## Context

- **Problem**: Browser Use is operable but not a product. Agents run a three-step ritual (`prepare` → bind `state` → snapshot `state`), learn two backends, and must be taught a side channel for user highlights. They also cannot open sidebar vs center chrome; humans hunt Browser prefs across Layout.
- **Why now**: Reliability work is done. The next layer is **one contract, one first call, one handoff, one Settings page**.
- **Related**: APP-052, APP-053, APP-041. Desktop Use TCC/engine stay on their own page.

## Goals

1. **Unify** — One agent-facing `state` shape and one skill loop. CLI publishes `capability_flags`; it does not pretend embedded is `semantic_v2`.
2. **First success** — On Desktop with embedded, the first command is `state` (or `tabs open`). If a Browser is already open and resolvable, that call **returns the snapshot**. No `prepare`. No second `state` just to bind.
3. **Handoff** — After the user picks/annotates, the next `state` shows those nodes as the **first `elements[]`**. The agent is not taught `user_picks`.
4. **Host** — User setting chooses Sidebar vs Center tabs. If no chrome exists, the agent’s `state` / `tabs open` creates it there.

## Users & Scenarios

- **Primary persona**: Desktop builder + `/browser-use` / `atmos browser-use --backend embedded`.
- **Key scenarios**:
  1. Browser already open in the sidebar. Agent runs only `atmos browser-use state`. JSON has `target_id` **and** `elements`. Binding is committed. No `prepare`.
  2. No Browser open. Same `state` (or `tabs open --url …`) creates chrome in Settings → Browser → Default surface, then snapshots / binds.
  3. User highlights a button. Agent’s next `state` lists that node first (`gN:u0` or equivalent). Skill never mentions `user_picks`.
  4. External Chrome path uses the **same** `state` fields; `capability_flags.continuation` / `upload` are true; `tabs` / `ensure_surface` are false. One skill loop.
  5. User changes Default surface to Center tabs; the next ensure opens center, not sidebar.
  6. Settings → Browser is the only place for surface, sidebar visibility, homepage, agent chrome, download root copy.

## User Stories

- As an agent, I want one `state` call to mean “here is the page I should act on”.
- As an agent, I want user highlights to show up as normal refs so I do not learn a second API.
- As a builder, I want the agent to open pages in the chrome I configured.
- As a builder, I want one Settings page named Browser.

## Functional Requirements

### Must Have — Unify (agent contract)

- **U1: One `state` envelope** — Both backends return the same top-level fields: `ok`, `backend`, `target_id`, `tab_id`, `snapshot_format`, `elements` (`ref`, `name`, `role`, `tag`, `href?`, `visible`, `rect?`), `truncated`, `total_candidates`, `capability_flags`, `pending_dialog?`. Honest `snapshot_format` (`embedded_dom_v1` vs `semantic_v2`). CLI fills missing fields (e.g. embedded `truncated`) so the skill never branches on “is this bind or snapshot”.
- **U2: `capability_flags` on every success** — At least `tabs`, `query`, `continuation`, `upload`, `press_key`, `ensure_surface`, `snapshot_format`. Not only on `prepare`.
- **U3: One skill loop** — `skills/atmos-browser-use` is a single procedure: `state` → act → re-`state` after navigate/mutation. Branch only on flags (`if continuation`, `if upload`, `if tabs`). Delete the two full backend tutorials. Do not document `user_picks` as a workflow. Do not require `prepare` on Desktop embedded.

### Must Have — First success

- **F1: No mandatory prepare (embedded Desktop)** — Host already running ⇒ `state` / `tabs` / click work without a prior `prepare`. `prepare` stays for external engine setup and as an optional capability probe.
- **F2: Resolvable host ⇒ snapshot now** — `state` without `--target-id`:
  - last-active or exactly one bound guest → **snapshot that guest** (elements in the same response);
  - several guests and no last-active → `browser_ambiguous_target`;
  - zero guests → **ensure** default surface (H2), then snapshot (homepage / `new_tab_url` / `about:blank`).
  Bind-only `state` (sessions list, `target_id`, no elements) is **not** the success path.
- **F3: Binding after first success** — That `state` commits `{backend,target_id,tab_id}` so later calls omit the ids.

### Must Have — Handoff

- **P1: Picks are elements** — Live user pick/annotate nodes are prepended to `elements[]` with snapshot-scoped refs. `user_picks` may remain as a duplicate array for old clients; the skill and CLI help do not mention it.
- **P2: Pick focuses the route** — A pick marks that guest last-active and refreshes the snapshot cache (old refs stale). The next `state` without `--target-id` lands on that tab and shows highlights first.
- **P3: No extra agent step** — The agent does not call a pick API. After the user highlights, one `state` is enough.

### Must Have — Host & Settings (new capability)

- **H1: Default surface** — `Sidebar` | `Center tabs`. Existing users default **Sidebar**. Sentence case. Persisted via function settings.
- **H2: Ensure-then-act** — Zero hosts only. `tabs open` and F2’s empty `state` create the default surface, then bind/snapshot. Wrong `--target-id` does **not** ensure a different surface.
- **H3: Bound target stays** — Existing `target_id` opens/selects/closes in that panel.
- **H4: Sidebar default shows the module** — Saving Sidebar or ensuring sidebar sets `rsShowBrowser` true and focuses the sidebar Browser tab. Center default does not hide the module.
- **H5: Settings → Browser** — Interface group. Owns: default surface, show-in-sidebar (moved from Layout, same key), new-tab URL, agent chrome, download-root copy, links to Desktop Use and in-browser cookie/site-data (APP-041 not rebuilt).
- **H6: Human open follows H1** — Welcome / slash / empty-state “open Browser” uses the same default. “Move to center” stays an explicit move.
- **H7: No `--surface`** — User setting is the only placement authority.

### Nice to Have

- “Follow last used” as a third default-surface option.
- Per-workspace default surface.
- `highlight_count` on `state` as a redundant hint (P1 already sufficient).

## Non-Goals

- MCP / first-class `browser_*` tools.
- Faking `semantic_v2` on embedded; auto-snapshot then click `e0`.
- Moving Desktop Use driver / TCC / AppShot into Browser settings.
- Web (non-Desktop) embedded control plane.
- Changing external CUA `start_session`.
- Teaching agents a `--surface` flag.
- Mobile.

## Success

- Desktop, Browser already open: one `atmos browser-use state` returns elements + `target_id`. Zero `prepare` in the trace.
- Desktop, no Browser: the same command (or `tabs open`) creates the configured chrome and returns a snapshot / bind.
- After a user pick, the next `state` has that node as `elements[0]` (or first highlight ref). Skill source has no `user_picks` workflow.
- External and embedded `state` JSON share the U1 field set; flags differ.
- Settings search finds Browser / sidebar / center tabs / homepage / agent chrome. Layout no longer owns the only Browser toggle.

## Copy

English: `Sidebar`, `Center tabs`, `Browser` — not all-caps.
