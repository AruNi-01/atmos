# Brainstorm · APP-043: Workspace Surface Cache

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Switching between Workspaces and Projects in the web workbench still feels like a reload: roughly 1–2 seconds of empty or rebuilding UI even when the user just left that context. APP-034 already keep-alives **terminal DOM** for a small LRU of contexts, but the Center Stage shell, non-terminal tabs (files, wiki, overview, GitHub, browser), tab restore, and right-sidebar consumers still rebind to a single `effectiveContextId`. Terminal-only warm cache is not enough for session-style switching (Cursor chat sessions, Codex sessions, VS Code warm editors).

Users frequently hop across several workspaces in one sitting. They expect recent contexts to return instantly with scroll, buffers, and open tabs intact — without unbounded memory growth when many center tabs exist.

## Goals (draft)

- Primary: switching among a small **warm set** of recent workspaces feels seamless (sub-150ms interactive shell).
- Keep heavy surfaces (xterm, CodeMirror, browser) under explicit global and per-workspace budgets.
- Prefer freeze tiers over “never unmount anything.”
- Single-cut redesign: no compatibility shims for the previous terminal-only cache API.

## Options

### Option A — Extend APP-034 only (terminal LRU polish)
Fix restore blocking, fit-on-show, and prefetch; leave files/wiki/sidebar single-context.

**Pros**: small diff.  
**Cons**: does not fix non-terminal remounts or shell rebuild; user still perceives load when not on a warm terminal tab.  
**Unknown**: how much of the 1–2s is restore vs remount.

### Option B — Full Workspace Surface Cache (chosen)
Multi-instance **WorkspaceFrame** pool for Center content; Active / Warm / Frozen tiers; surface-specific keep policies; global budgets; non-blocking restore; supersede APP-034 store with a unified surface cache.

**Pros**: matches multi-session tools; one coherent model for terminals + editors + browsers; memory bounded by design.  
**Cons**: larger frontend refactor of CenterStage ownership.  
**Unknown**: exact default budget numbers on low-RAM machines.

### Option C — Multi-window only (Desktop)
Each workspace is a separate window/process; no in-window warm pool.

**Pros**: strong isolation.  
**Cons**: wrong product model for web; Desktop still needs in-window hop; does not help Relay/browser users.

## Key forks in the road

- **Fork 1**: Terminal-only vs full surface cache — **decide in PRD: full surface cache**.
- **Fork 2**: Unlimited keep-mounted vs budgeted tiers — **decide in PRD: budgeted Active/Warm/Frozen**.
- **Fork 3**: Multi-mount entire AppShell vs Center Frame pool only — **decide in TECH: Frame host under singleton shell**.
- **Fork 4**: Phased migration vs single cutover — **decide in PRD: single delivery, no legacy dual-path**.
- **Fork 5**: Right sidebar multi-mount vs model + query cache — **decide in TECH: model/viewState + TanStack, not multi-DOM**.

## Open questions

- [x] Default warm workspace count — promote to TECH defaults (3–5).
- [x] Whether backend PTY is destroyed on Frozen — promote to TECH (frontend detach; backend lifecycle unchanged unless eviction).
- [x] Settings surface for budgets — promote to PRD Must Have.

## References

- Existing: `apps/web/src/app-shell/CenterStage.tsx`, `CenterStagePanels.tsx`, `center-stage-support.tsx`
- Existing: `apps/web/src/features/terminal/store/use-terminal-cache-store.ts` (APP-034)
- Related: [APP-034 Terminal Workspace Caching](../APP-034_terminal_caching/PRD.md) — **superseded by this spec**
- Related: [APP-035 TanStack Query Data Layer](../APP-035_tanstack-query-data-layer/PRD.md) — server snapshots remain Query-owned
- Industry analogues: VS Code open-editor widget limits, browser tab discard, Cursor/Codex session list without full shell remount

## Ready to promote

- Promote to PRD: seamless warm switch UX; budgets; Must Haves for tiers, non-blocking restore, settings; Out of Scope multi-window and persistent cross-reload DOM.
- Promote to TECH: WorkspaceFrameHost, surface cache store, per-surface mount policies, eviction, fit-on-visible, telemetry marks, replacement of APP-034 store.

## Post-review locks (design review → specs)

Design review items accepted and locked in PRD/TECH/TEST:

1. Per-frame `frameActiveTab` vs URL ownership table (Warm never uses global URL tab).
2. Frozen = identity-preserving `detachWorkspaceFrontend` (not full `evictWorkspaceRuntime`).
3. Budget coordinator: `computeMountPlan` + `enforceMountBudgets` triggers and demount vs freeze boundary.
4. Warm pause matrix (fit, polling, hotkeys, focus).
5. Host vs Frame ownership table.
6. `isProtected` minimum set + hard-cap last resort.
7. project-wiki / code-review per-frame.
8. Settings semantic rename without silent key migration.
9. Named `clearAll` hooks on computer-switch chain.
10. Narrow light-panel warm mount default.
11. TEST S18–S23 for multi-frame URL/focus/agent, freeze identity, light plan, clearAll wiring.
