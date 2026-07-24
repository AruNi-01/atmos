# PRD · APP-043: Workspace Surface Cache

> Product Requirements · WHAT and WHY. Make Workspace/Project switching in the workbench feel like session switching — warm contexts restore instantly under memory budgets.

## Context

- **Problem:** Users who switch among Workspaces and Projects still wait roughly 1–2 seconds for the center stage (and often the surrounding workbench surfaces) to become usable again. Terminal keep-alive (APP-034) reduces one failure mode but does not deliver session-style continuity across the full center surface set.
- **Why now:** Multi-workspace agentic workflows are the common path; competitors (Cursor sessions, Codex sessions, IDE warm editors) train users to expect instant return to recent contexts. Partial terminal caching has already proven keep-alive works; the product needs the full model.
- **Related specs:**
  - [APP-034 Terminal Workspace Caching](../APP-034_terminal_caching/PRD.md) — **superseded** by this spec (behavior absorbed and expanded; no dual maintenance).
  - [APP-035 TanStack Query Data Layer](../APP-035_tanstack-query-data-layer/PRD.md) — server-state snapshots remain Query-owned; this spec owns client surface/DOM/view lifecycle.
  - [APP-002 Terminal Multiplexing](../APP-002_terminal-multiplexing/) — terminal runtime semantics unchanged at the product level.

## Goals

1. **Primary:** Switching among a small set of recently used Workspaces/Projects feels seamless: the previous surface reappears without a full reload experience.
2. Preserve scroll, terminal buffers, open-tab identity, and in-progress editor content for warm contexts.
3. Bound memory and CPU when many workspaces or many center tabs exist, via explicit budgets and freeze tiers.
4. Never block first paint of a switched context on terminal hydration, network, or secondary panels.
5. Replace the terminal-only cache product story with one coherent “workspace surface” story (settings, behavior, docs for maintainers).

## Users & Scenarios

- **Primary persona:** Agentic Builder hopping between several workspaces (feature branch / review / fix) in one workbench session.
- **Secondary persona:** Power user with many open center tabs (terminals, files, browsers) who still needs predictable performance.

### Key scenarios

1. User works in Workspace A (terminal + files), switches to B, then back to A within minutes — A looks exactly as left, instantly interactive.
2. User opens eight workspaces over an hour — only a bounded warm set stays fully alive; older ones reopen from frozen state without OOM.
3. User has twenty file tabs in one workspace — the tab strip stays complete; only a bounded number of heavy editors stay mounted.
4. User switches while a terminal agent is still running in the previous workspace — that workspace is protected from aggressive freeze while work is live.
5. User switches before terminal backend hydrate finishes — chrome and last tab identity appear immediately; content fills in without blanking the whole stage.

## User Stories

- As an Agentic Builder, I want recent workspaces to return instantly so that context-switching does not break my flow.
- As a user with many open tabs, I want the product to keep my tab list and content identity even when heavy views are released under memory pressure.
- As a user with a long-running agent, I want that workspace retained preferentially so that I do not lose live output UX when I glance elsewhere.
- As a user on a constrained machine, I want configurable warm limits so that Atmos stays responsive.
- As a maintainer, I want one surface-cache model instead of a terminal-only side path so that new center tabs plug into the same rules.

## Functional Requirements

### Must Have

- **M1 — Warm multi-context center.** The workbench keeps a bounded set of recent Workspace/Project contexts as **warm** center frames (DOM retained, not visible) so returning to them does not rebuild the center from scratch.
- **M2 — Three-tier lifecycle.** Every tracked context is exactly one of: **Active**, **Warm**, or **Frozen**. Active is fully live; Warm is hidden but retained per surface policy; Frozen releases heavy DOM while retaining **tab-strip and surface identity** (terminal tab list/layout identity, open files, browser/GitHub tab meta, last active tab) so chrome can repaint without waiting on backend hydrate.
- **M3 — Surface-specific keep policy.** Terminals, file editors, browsers, and light panels (overview/wiki/GitHub) follow distinct keep rules; unlimited keep-mounted for all surfaces is not allowed.
- **M4 — Global and per-workspace budgets.** Hard caps exist for: warm contexts, mounted terminal panes (global), mounted editors (global and/or per context), mounted browser surfaces (global). Exceeding caps freezes or demounts the least-valuable surfaces first.
- **M5 — Non-blocking switch.** Switching context paints the target shell and last-active tab identity from local state without waiting on terminal hydrate, file content network, git, or sidebar queries. Secondary work loads after first interactive frame.
- **M6 — Continuity of warm state.** For **Warm** contexts, terminal scroll/buffer, open center tabs, active tab, dirty editor buffers, and browser tab identity remain as the user left them when returning (DOM keep-alive path).
- **M6b — Continuity of frozen identity.** For **Frozen** contexts, full xterm/editor DOM continuity is not required; **identity** required for ≤150ms chrome is: last center tab, terminal tab strip meta/layout identity, open file list (including dirty buffers in the editor model), and browser/GitHub tab meta. Returning from Frozen remounts heavy views and may reattach terminals.
- **M7 — Protection rules.** Contexts with live agent runs, dirty editors, or other explicit protect signals are not frozen before safer candidates. Active context is never frozen.
- **M8 — Visibility restore correctness.** Returning a warm heavy surface to visible state refits/relayouts correctly (especially terminals and editors) without a second long blank.
- **M9 — Prefetch on intent.** Hovering or otherwise clearly intending a workspace switch may prime that context (data + optional frame) without forcing it to stay warm forever.
- **M10 — Settings.** Users can configure warm workspace capacity and key heavy-surface caps from existing Function/Settings surfaces (replacing APP-034 terminal-only cache settings).
- **M11 — Single model cutover.** APP-034 terminal cache behavior and APIs are fully replaced by this model in the same delivery. No dual-path “old cache + new cache” in production code.
- **M12 — Isolation.** Surface cache is scoped to the active Atmos Computer / connection identity; switching computer clears warm/frozen client surface state for the previous target.

### Nice to Have

- **N1 — Pin workspace.** User can pin a context so it stays Warm until unpinned (still subject to absolute safety caps if any).
- **N2 — Memory-pressure demotion.** Automatic extra freeze when the runtime signals high memory pressure.
- **N3 — Dev diagnostics.** Dev-only counters for warm count, mounted panes/editors/browsers, last eviction reason.

## Out of Scope

- **Persisting warm DOM across full browser reload or app restart** — process restart always cold-starts frames; only durable prefs/stores already persisted may survive.
- **Backend PTY hibernation redesign** — backend terminal lifetime remains existing product semantics; this feature is frontend surface lifecycle. (Frontend may detach/reattach; it does not invent a new server hibernation protocol.)
- **Multi-window-per-workspace as the primary solution** — Desktop multi-window may exist elsewhere; this PRD is in-window workbench switching.
- **Mobile workbench parity** — web/desktop workbench first; mobile is out unless it already shares the same shell (it does not for this surface).
- **Changing left-sidebar project tree product model** — selection and navigation stay; only performance of switch is in scope.
- **Reworking Canvas as a multi-workspace host** — Canvas keeps its own document model; optional future reuse of cache primitives is not required here.
- **Unlimited keep-alive of all open editors/browsers** — explicitly rejected for memory reasons.

## Success Metrics

- **Warm terminal return:** interactive terminal input possible within **100ms** of switch completion on a warm context (local, same session), with buffer/scroll continuity.
- **Warm non-terminal return:** last file/overview/wiki chrome interactive within **150ms** on a warm context.
- **Frozen return:** tab strip + correct last-tab identity visible within **150ms** from **local retained identity** (must not depend on terminal backend hydrate for strip correctness); primary heavy content usable within **500ms** typical after remount/reattach on a local machine.
- **Budget enforcement:** opening more contexts than the warm cap never leaves more than `maxWarmWorkspaces` warm frames; no unbounded growth of mounted xterm/CodeMirror/browser instances.
- **No blank-stage regression:** switch path does not clear the entire center to an empty loading shell while local last-tab state is already known.
- **Regression:** terminal agent runs, file dirty save, browser tabs, and existing center tab URL sync remain correct under multi-frame hosting.
- **Qualitative:** dogfooders describe switching as “session switch,” not “page reload.”

## Product Decisions

- Adopt the full **Workspace Surface Cache** model (BRAINSTORM Option B), not terminal-only polish.
- Use **Active / Warm / Frozen** tiers with hard budgets; reject unlimited keep-mounted.
- Deliver as **one cutover** that supersedes APP-034; no phased dual-stack requirement in the PRD.
- Keep **AppShell singleton** (left nav, global chrome); multi-instance only the center workspace frame (and not a full app clone).
- Prefer **data/viewState cache** for right sidebar and light panels over multi-mounted sidebar DOMs.
- Protect live work (agents, dirty editors) when choosing freeze victims.
- **Frozen detach, not full runtime wipe:** freezing a workspace must not delete terminal tab/layout identity from client stores (see TECH Option A). Full client runtime wipe is reserved for computer switch / logout / workspace deletion.
- **Per-frame active tab:** Warm frames use per-context last tab for panel visibility; only the Active frame reads/writes the URL tab.
- **Narrow light panels:** Overview/Wiki/GitHub stay mounted in a Warm frame only when they are the last active tab or recently opened light surfaces — not every light panel by default.

## Risks & Open Questions

- **Risk:** Multi-frame Center increases baseline memory; budgets and defaults must be conservative enough for 8GB-class machines.
- **Risk:** Hidden xterm/editor instances still cost CPU if not properly paused (timers, fit loops, overlays).
- **Risk:** URL-driven context and multi-frame active identity can desync if not owned by one controller.
- **Resolved in TECH:** Frozen = identity-preserving frontend detach (not full `evictWorkspaceRuntime`); right sidebar single instance; settings keys under `workspace_surface.*` with no migration from APP-034 keys.

## Delivery

Single delivery: design and ship the complete Workspace Surface Cache end-to-end (store, frame host, surface policies, settings replacement, tests). No product milestone that leaves APP-034 as a parallel path.
