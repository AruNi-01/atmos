# REVIEW · APP-066: Resource Monitor - Implementation Review

> Post-implementation review log for functional completeness, architecture, reliability, performance, and testability. Complements the planning quartet; does not replace it.

**Review date**: 2026-08-25
**Review scope**: functional + quality + performance + reliability
**Related code**: `crates/core-engine/src/resource_metrics`, `crates/core-service/src/service/resource_monitor`, `apps/api/src/api/ws`, `apps/web/src/features/resource-monitor`, `apps/desktop-electron/src/metrics`

---

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-001 | P1 | api | Subscription generation could be reused after unsubscribe | verified |
| REV-002 | P1 | api | Relay app close leaked virtual subscriptions | verified |
| REV-003 | P2 | backend | Attribution performed blocking path work on async workers | verified |
| REV-004 | P2 | frontend | Malformed nested metrics and stale states were unsafe | verified |
| REV-005 | P2 | api | `send_to` held the connection lock across backpressure | verified |
| REV-006 | P2 | test | Structural checks did not prove the user-visible lifecycle | verified |
| REV-007 | P1 | backend | macOS Host memory used the wrong accounting definition | verified |
| REV-008 | P2 | frontend | Session rows displayed numeric tmux identities as titles | verified |
| REV-009 | P1 | frontend | Resource hierarchy was visually flat and terminal rows were not actionable | verified |
| REV-010 | P1 | frontend | Cross-host locate deep links could be stripped as leftover chrome | verified |
| REV-011 | P1 | full-stack | Project and Workspace totals lacked explainable process leaves | verified |
| REV-012 | P1 | full-stack | Host and Atmos lacked compact summaries and diagnostic detail | verified |
| REV-013 | P1 | full-stack | Resource charts lacked a unified pressure language and disk capacity | verified |

---

## REV-001 · Subscription generation could be reused after unsubscribe

| Field | Value |
|-------|-------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | api |
| **Reported by** | internal review |
| **Owner** | APP-066 implementation |

### Finding

Removing a connection task also removed its generation counter. A concurrent subscribe/unsubscribe/subscribe sequence could reuse generation `1`, allowing stale cleanup to delete the replacement task while the subscribe request still returned success.

### Evidence

- Pre-fix lifecycle: `apps/api/src/api/ws/subscription.rs`.
- Subscribe commits after awaiting the immediate snapshot: `apps/api/src/api/ws/router/resource_monitor.rs`.

### Required fix

Use non-reusable generations and return an error when a pending subscription was replaced or cancelled before commit.

### Acceptance

- [x] Generations remain unique after remove/abort.
- [x] Stale cleanup cannot remove a newer reserved slot.
- [x] A stale commit cannot return a successful subscription.

### Fix log

- 2026-08-24 — Added process-wide `AtomicU64` generations, generation-safe take/remove paths, and commit error handling.
- Verified by `cargo test -p api resource_monitor`.

---

## REV-002 · Relay app close leaked virtual subscriptions

| Field | Value |
|-------|-------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | api |
| **Reported by** | internal review |
| **Owner** | APP-066 implementation |

### Finding

Relay ingest handled terminal close envelopes but ignored app-stream close envelopes. A closed Relay client therefore remained registered and its 2.5-second monitor loop could continue until the whole upstream Relay connection ended.

### Evidence

- Relay virtual sessions: `apps/api/src/relay/ingest.rs`.
- Resource subscription disconnect cleanup: `apps/api/src/api/ws/router/mod.rs`.

### Required fix

Classify app-stream close envelopes, remove only the matching virtual session, and call the normal WS unregister lifecycle.

### Acceptance

- [x] App close unregisters the target virtual connection.
- [x] `on_disconnect` aborts its Resource Monitor task.
- [x] Other app and terminal sessions remain active.

### Fix log

- 2026-08-24 — Added app-close classification and targeted virtual-session cleanup through `ws_service.unregister`.
- Verified by `cargo test -p api app_close`.

---

## REV-003 · Attribution performed blocking path work on async workers

| Field | Value |
|-------|-------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | APP-066 implementation |

### Finding

Process and root canonicalization plus the full attribution pass originally ran after returning from `spawn_blocking`, potentially blocking a Tokio worker on large process tables or slow filesystem paths. Active archived Workspaces also required the existing all-workspace lenient listing path.

### Required fix

Keep database reads async, then perform process sampling, tmux discovery, path normalization, and attribution inside one blocking task. Reuse `WorkspaceService::list_all_by_project`.

### Acceptance

- [x] Filesystem path operations and attribution run in `spawn_blocking`.
- [x] Archived Workspaces remain available as attribution identities.
- [x] Invalid optional GitHub JSON does not drop the Project's Workspace roots.
- [x] Windows path comparison handles verbatim prefixes and case.

### Fix log

- 2026-08-24 — Moved the blocking pipeline and added Windows path normalization.
- Verified by `cargo test -p core-service resource_monitor`, `cargo test -p core-service terminal`, and strict Clippy.

---

## REV-004 · Malformed nested metrics and stale states were unsafe

| Field | Value |
|-------|-------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | APP-066 implementation |

### Finding

The event validator accepted any `projects` array, so malformed nested rows could enter Query and crash the hierarchy. Stale state only recalculated on unrelated renders, stale could hide partial-attribution copy, and disconnected state could continue rendering old metrics.

### Required fix

Validate the complete nested DTO, run a visible-only local stale clock, allow stale and partial banners together, and hide cached numeric data while disconnected.

### Acceptance

- [x] Invalid nested Project/Workspace/session payloads do not update Query.
- [x] Stale appears without an incoming event.
- [x] Stale and partial states remain simultaneously visible.
- [x] Disconnected state does not present cached values as current.
- [x] Status copy is announced through an accessible live region.

### Fix log

- 2026-08-24 — Added recursive validation, an 8-second interactive clock, composable banners, responsive sizing, and accessibility labels.
- Verified by 61 APP-066 Web tests, Web typecheck/lint, and the targeted Playwright test.

---

## REV-005 · `send_to` held the connection lock across backpressure

| Field | Value |
|-------|-------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | api |
| **Reported by** | internal review |
| **Owner** | APP-066 implementation |

### Finding

`WsManager::send_to` awaited a bounded channel while retaining the connections read lock. One backed-up resource subscriber could delay unrelated connection registration and removal.

### Required fix

Clone the target sender under the lock, release the lock, then await the send. Prevent interval catch-up bursts after a slow collection.

### Acceptance

- [x] Backpressure on one target does not block register/unregister.
- [x] Resource updates use delayed missed-tick behavior rather than burst.

### Fix log

- 2026-08-24 — Released the lock before send and set `MissedTickBehavior::Delay`.
- Verified by `cargo test -p api send_to_does_not_hold_lock` and `cargo test -p api resource_monitor`.

---

## REV-006 · Structural checks did not prove the user-visible lifecycle

| Field | Value |
|-------|-------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | test |
| **Reported by** | internal review |
| **Owner** | APP-066 test run |

### Finding

Several initial Web tests asserted source strings rather than behavior. They could not prove scoped cache updates, subscription ordering, malformed-payload rejection, or that the Footer and popover actually rendered.

### Required fix

Use behavioral pure tests for Query/controller/state invariants and the existing Playwright harness for the critical hosted workflow. Treat remaining structural tests only as support.

### Acceptance

- [x] Query scope, subscription order, nested validation, and stale clock have behavioral tests.
- [x] Playwright opens the real Footer popover and verifies Host/Atmos content and narrow-width overflow.
- [x] `TEST.md` distinguishes covered, partial, structural-only, and manual gaps.

### Fix log

- 2026-08-24 — Added targeted API connection tests and `e2e/tests/specs/APP-066_resource-monitor.e2e.ts`.
- Verified by `E2E_REUSE_SERVER=1 bun run --cwd e2e test tests/specs/APP-066_resource-monitor.e2e.ts` (Chromium + mobile Chromium).

---

## REV-007 · macOS Host memory used the wrong accounting definition

| Field | Value |
|-------|-------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | user review |
| **Owner** | APP-066 implementation |

### Finding

The initial Host row used `sysinfo.used_memory()`. On macOS that includes internal, wired, and compressed memory and displayed about 25 GiB while btop showed about 12–13 GiB. A first correction using `total − available` only matched numerically by accident because sysinfo's macOS available value includes active pages.

### Required fix

Use the same Mach VM formula as btop on macOS: `(active_count + wire_count) × page_size`. Keep process rows as RSS estimates.

### Acceptance

- [x] Host memory tracks the btop accounting definition on macOS.
- [x] Mach failure has a bounded fallback and Host used never exceeds total.
- [x] Process RSS collection is unchanged.

### Fix log

- 2026-08-25 — Added a macOS Mach collector using `HOST_VM_INFO64`; Linux/Windows retain `total − available`.
- Verified by `cargo test -p core-engine resource_metrics` and strict core-engine Clippy.

---

## REV-008 · Session rows displayed numeric tmux identities as titles

| Field | Value |
|-------|-------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | user review |
| **Owner** | APP-066 implementation |

### Finding

`ResourceSessionMetrics.name` comes from the stable Server terminal name. For tmux this is commonly the window identity `1`, while the actual user-facing title is maintained locally from custom, dynamic, agent, and OSC title state.

### Required fix

Join active Resource Monitor session rows to terminal pane state by `session_id`, prefer the canonical live display title, and treat pure numeric tmux names as fallback identities rather than titles.

### Acceptance

- [x] A tmux session named `1` displays its live dynamic/agent/OSC title.
- [x] Custom terminal titles have highest priority.
- [x] Missing live state falls back to a meaningful non-numeric Server name or localized unnamed copy.
- [x] Local titles are not written into the shared WS snapshot.

### Fix log

- 2026-08-25 — Added a display-only session-title map sourced from `useTerminalStore.workspacePanes`.
- Verified by `bun test apps/web/src/features/resource-monitor`, Web typecheck, and feature lint.

---

## REV-009 · Resource hierarchy was visually flat and terminal rows were not actionable

| Field | Value |
|-------|-------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | user review |
| **Owner** | APP-066 implementation |

### Finding

The first popover rendered Host, Atmos, Projects, Workspaces, and sessions as nearly identical text rows. CPU and memory were hard to compare, the popover carried no trend context, and terminal rows did not communicate or provide navigation.

### Required fix

Use an Activity Monitor + Raycast hierarchy: compact Host summary and time-based CPU/memory chart, aligned sortable columns, one scrollable dense hierarchy, semantic status treatments, and clearly actionable terminal rows.

### Acceptance

- [x] Host CPU/memory and their existing-snapshot trend are immediately distinguishable.
- [x] Name/CPU/Memory columns align and sort without flattening hierarchy.
- [x] Only the hierarchy scrolls and 390px width does not overflow.
- [x] Terminal rows expose an accessible locate action when a live pane can be resolved.
- [x] The design remains dense, neutral, border-led, and localized.

### Fix log

- 2026-08-25 — Rebuilt the popover with existing UI primitives, Recharts, a 60-point Computer-scoped history ring, sortable table headers, and responsive hierarchy.
- Verified by 138 targeted Web/navigation tests, typecheck/lint, and APP-066 Playwright on Chromium/mobile Chromium.

---

## REV-010 · Cross-host locate deep links could be stripped as leftover chrome

| Field | Value |
|-------|-------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | APP-066 implementation |

### Finding

The ordinary app-router path sanitizes tab and terminal query parameters copied between hosts. A deliberate Resource Monitor jump to another Workspace with the same `tab=terminal` or tmux name could therefore lose the destination deep link and reopen the popover without locating the pane.

### Required fix

Provide a guarded app-router method for explicit Workspace deep links, commit the destination query before same-host Center Space switching, and clear pending locate state when URL commit fails.

### Acceptance

- [x] Same-host extra-Space jumps commit destination tab/tmux before switching.
- [x] Cross-host Project/Workspace jumps preserve intentional tab/tmux parameters.
- [x] Simple PTY jumps remove stale `terminalTmux`.
- [x] Failed/guarded navigation clears pending locate state and does not flash another pane.
- [x] The blue locate signal remains generation-safe and independent of agent attention.

### Fix log

- 2026-08-25 — Added `pushWorkspaceDeepLink`, bounded destination URL confirmation, exact Center Space/tab/pane resolution, and terminal-owned locate state/CSS.
- Verified by cross-host/extra-Space/simple-PTY behavior tests and a real default-Space terminal click/focus/blue-pulse Playwright journey.

---

## REV-011 · Project and Workspace totals lacked explainable process leaves

| Field | Value |
|-------|-------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | full-stack |
| **Reported by** | user review |
| **Owner** | APP-066 implementation |

### Finding

Project and Workspace aggregates already included cwd-attributed programs such as local API/Web servers, but the hierarchy only displayed terminal sessions and Workspaces. Parent memory therefore appeared not to equal visible children, and listening programs/ports were invisible.

### Required fix

Project resources must appear before Workspaces and partition direct sessions from non-session processes. Workspaces require the same session/non-session partition. Session-owned processes must drill down inside their session. Cached Local Services ports may annotate matching attributed process groups without starting listener scans from the 2.5-second resource path.

### Acceptance

- [x] Project memory/process count reconciles as direct resources plus Workspaces.
- [x] Workspace memory/process count reconciles as sessions plus other processes.
- [x] Each assigned process appears in one session or cwd leaf only.
- [x] Process rows show basename, aggregate count/usage, and matching cached local ports.
- [x] Snapshot process detail contains no PID, command line, path, executable, user, or environment.
- [x] Resource Monitor performs no listener scan or HTTP probe.

### Fix log

- 2026-08-25 — Added exclusive process-name groups, `other_usage`, session process drilldown, a TTL'd Local Services all-projects cache, fail-closed PID/name port joins, and Project resources/Workspace UI sections.
- Verified by 30 Resource Monitor Rust tests, 22 Local Services tests, 17 api-types tests, 118 Web tests, strict touched Clippy, and real S18 HTTP-listener/port Playwright coverage.

---

## REV-012 · Host and Atmos lacked compact summaries and diagnostic detail

| Field | Value |
|-------|-------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | full-stack |
| **Reported by** | user review |
| **Owner** | APP-066 implementation |

### Finding

Host was always expanded and consumed most of the popover, Atmos was a flat section, metric changes jumped without easing, and there was no way to inspect logical-core utilization or btop-style memory categories.

### Required fix

Make Host and Atmos default-collapsed summary rows; remove adjacent separators; keep sticky sortable columns and inset rounded hover controls; animate bars/chart with reduced-motion support; add CPU and memory detail popovers backed by per-core and explicit platform memory accounting.

### Acceptance

- [x] Host and Atmos default to collapsed rows with CPU/memory summaries.
- [x] Host expansion reveals chart, bars, and CPU/Memory detail triggers.
- [x] CPU detail renders every sampled logical core.
- [x] Memory detail renders independent Used, Available, Cached, Free, and Swap meters with accounting context.
- [x] Internal adjacent section borders are removed and interactive rows use inset rounded hover.
- [x] Bar/chart changes ease between samples and disable animation under reduced motion.
- [x] Detail Escape/focus behavior does not close or steal focus from the parent monitor.

### Fix log

- 2026-08-25 — Added per-core and nested memory DTOs, Mach/Linux/Windows accounting, collapsed Host/Atmos sections, nested detail popovers, and motion tokens.
- Verified by 15 engine tests, 34 Resource Monitor service tests, 17 API tests, 18 api-types tests, 126 Web tests, strict touched Clippy, and S20 Playwright on Chromium/mobile Chromium.

---

## REV-013 · Resource charts lacked a unified pressure language and disk capacity

| Field | Value |
|-------|-------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | full-stack |
| **Reported by** | user review |
| **Owner** | APP-066 implementation |

### Finding

Resource Monitor used bespoke CSS bars and Recharts while Token Usage already provided the product Dither language. Pressure had no consistent low/medium/high color mapping, and users could not inspect local volume capacity without opening Disk Analyzer or an external btop session.

### Required fix

Reuse shared Dither canvases for Host history and every Resource Monitor meter, keep pressure thresholds feature-local, and add a default-collapsed local Disk capacity module backed by storage-only cached sampling.

### Acceptance

- [x] Host history uses compact fixed-domain shared Dither Area Growth.
- [x] Host/core/memory/disk meters use shared Dither morph and reduced-motion behavior.
- [x] Every meter retains a shallow full-length Dither track behind its pressure fill.
- [x] Pressure resolves to success below 60%, warning at 60–79%, and destructive at 80%+; informational available/cached/free remain neutral.
- [x] Disk defaults collapsed and displays exactly one primary system disk; APFS Data, mounted Atmos/Dray images, removable volumes, and duplicate mounts are absent.
- [x] Disk sampling is storage-only, cached for 2.5 seconds, and never invokes Disk Analyzer or I/O tracing.
- [x] Device path, filesystem, UUID, serial, and I/O data are absent from the wire.

### Fix log

- 2026-08-25 — Added full-track Dither Funnel support, compact fixed-domain Dither Growth, feature-local pressure tones, cached primary-system-disk sampling, and the Disk UI module.
- Verified by 45 shared UI tests, 27 engine tests, 36 service tests, 17 API tests, 19 api-types tests, 136 Web tests, strict touched Clippy, and APP-066 Playwright.
