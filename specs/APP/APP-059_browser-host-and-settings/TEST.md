# TEST · APP-059: Browser Use experience kernel

> Verification for unify, first success, handoff, and host+settings. All four pillars required.

## Test strategy

- **Rust** for envelope fill, capability flags, empty-`state` snapshot-now vs ambiguous, no `--surface`.
- **Bun structural / store** for ensure, Settings IA, pick-prepend, last-active on pick, skill text.
- **Agent-browser** for Settings copy/casing.
- No live CUA. No Playwright required for v1.

## Coverage map

| PRD | Scenario |
|-----|----------|
| U1–U3 | S11 unified envelope; S12 skill one-loop, no `user_picks` workflow, no prepare-first |
| F1–F3 | S13 `state` without prepare when host exists; S14 empty `state` snapshots last-active; S15 zero hosts ensure+snapshot |
| P1–P3 | S16 picks prepended to `elements`; S17 pick marks last-active / refreshes cache |
| H1–H7 | S1–S10 (surface, ensure, settings, no `--surface`) |

## Execution map

| ID | Level | Tool | Target | Status |
|----|-------|------|--------|--------|
| S1 | bun | `bun test` | `browser-settings-store` persist/default | pending |
| S2 | bun | `bun test` | `tabs open` + zero hosts → `ensureSurface` | pending |
| S3 | structural | `bun test` | zero-guest `state` ensure, not bind-only fail | pending |
| S4 | bun | `bun test` | open with `targetId` skips ensure | pending |
| S5 | bun | `bun test` | panels>0 and ambiguous → no ensure | pending |
| S6 | bun | `bun test` | sidebar default ⇒ `rsShowBrowser` | pending |
| S7 | structural | `bun test` | Settings tab `browser`; Layout has no Browser row | pending |
| S8 | structural | `bun test` | human open reads `default_surface` | pending |
| S9 | rust + structural | `cargo test -p browser-use --lib`; skill | `capability_flags` | pending |
| S10 | rust | `cargo test -p atmos --bin atmos` | no `--surface` | pending |
| S11 | rust | `cargo test -p browser-use --lib` | envelope fields on embedded+external `state` | pending |
| S12 | structural | skill file | one loop; no `user_picks` section; Desktop starts at `state` | pending |
| S13 | rust / structural | crate + control | `state` does not require prior `prepare` | pending |
| S14 | structural | control plane | no target + last-active → `snapshot(`, not bind-only `mode: "bind"` success | pending |
| S15 | structural + bun | control + bridge | zero guests → ensure then snapshot | pending |
| S16 | structural | control plane | user picks mapped before DOM `eN` in `elements` | pending |
| S17 | structural | surface-manager + picks IPC | pick → `markLastActive` + snapshot refresh | pending |

## Scenarios

### S1 — Default surface persist
Given a fresh store, When the user selects Center tabs, Then `browser.default_surface === "center"` after reload.

### S2 — Empty desktop, tabs open
Given zero panels, When `tabAction: open` has a URL, Then `ensureSurface(default_surface)` and ack `ok` + `target_id`.

### S3 — Zero-guest state ensures
Given zero bound guests, When `/v1/state` has no `target_id`, Then renderer ensure runs; response is a snapshot (or ensure failure), not `ok: true` bind-only with `elements` missing.

### S4 — Bound target stays
Given sidebar guest `sess-1`, When `tabs open` includes that `targetId`, Then no new center chrome.

### S5 — Hosts exist, no silent ensure
Given two panels and no last-active uniqueness, When `tabs open` has no target, Then `browser_ambiguous_target` and `ensureSurface` is not called.

### S6 — Sidebar default shows module
Given `rsShowBrowser === false`, When default surface is set to Sidebar or sidebar ensure runs, Then `rsShowBrowser` is true.

### S7 — Settings page
Given Settings, When opening Browser, Then Placement / Sidebar / New tab / Agent / Downloads render; Layout has no Browser module row.

### S8 — Human open
Given default surface center, When the user opens Browser from Welcome / slash / empty state, Then center chrome is used or reused.

### S9 — Flags
Given a successful embedded `state` or `prepare`, Then `capability_flags.ensure_surface === true` and `tabs === true`.

### S10 — No `--surface`
Given `atmos browser-use --help`, Then there is no `--surface`.

### S11 — Unified envelope
Given crate `fill_result_envelope`, When building embedded and external `state` results, Then both include `elements`, `truncated`, `total_candidates`, `capability_flags`.

### S12 — Skill
Given `skills/atmos-browser-use/SKILL.md`, Then there is one loop, Desktop first command is `state`, and there is no “read `user_picks`” workflow.

### S13 — No prepare ritual
Given control.json present and a bound guest, When CLI `state` runs, Then it does not call `/v1/prepare` first.

### S14 — Snapshot now
Given last-active session `A`, When `/v1/state` has no `target_id`, Then the handler snapshots `A` and returns `elements`.

### S15 — Empty ensure+snapshot
Given zero guests, When `/v1/state` has no `target_id`, Then ensure-bind then snapshot of the new target.

### S16 — Picks first
Given two user picks and DOM nodes, When snapshot is built, Then `elements[0]` / `[1]` are the pick refs (`:u`) and DOM `eN` follow.

### S17 — Pick routes next state
Given a pick on session `B` while last-active was `A`, When pick IPC lands, Then last-active is `B` and the snapshot cache for `B` is rebuilt.

## Exploratory agent-browser checks

- Settings → Browser: `Sidebar`, `Center tabs` sentence case; zh prose around the name Browser.
- Default surface toggle matches the chrome that actually opens.
- Dense settings console, not marketing layout.

## Regression checklist

- Hardening: stale refs, last-active window routing, query/truncated, binding end/close, no auto-click `e0`.
- APP-053: renderer owns tabs; main does not create in-panel webviews.
- External `prepare` / `isolated_new` unchanged.

## Acceptance criteria

- U*, F*, P*, H* each have an automated signal except exploratory casing.
- `cargo test -p browser-use --lib` and targeted bun tests green after impl.

## Non-coverage

- Live CUA window attach.
- Function-settings multi-machine sync beyond existing behavior.
- Mobile.

## Coverage Status

Not run. Implementation has not started.
