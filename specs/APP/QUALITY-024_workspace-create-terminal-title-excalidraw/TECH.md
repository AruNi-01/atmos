# TECH · QUALITY-024: Workspace Create Overlay, Terminal Title Merge, PT Design Drawer

> Technical Design · HOW. Quality spec. No BRAINSTORM or PRD.
> As-built backfill of [PR #348](https://github.com/AruNi-01/atmos/pull/348) (`aarynlu/local-wip-workspace-terminal-title`).
> Continues [APP-003](../APP-003_web-terminal-dynamic-title/TECH.md), [APP-047](../APP-047_terminal-native-osc-title/TECH.md), and [APP-075](../APP-075_pt-design-interactive-canvas/TECH.md). Product identity for those features stays there. This file records the three slices that shipped in #348.

## Scope summary

PR #348 is local WIP already on the branch: 17 files, `+541/-90` versus `origin/main`. This spec documents that diff only. Three independent slices share a PR, not a data model:

1. **Workspace create flow** — Welcome stays behind a modal until the worktree exists; New Workspace on top of another view does not block. Auto-enter on a blocking job waits for `isWorkspaceCreateReadyToEnter`.
2. **Terminal dynamic title** — a new shell command, or an idle directory with no session topic, must not keep the previous OSC suffix. Reattach and same-command replay still keep a topic so Agent Observer does not fall back to `"Terminal"`. Server side is `reduce_title` in `crates/core-service/src/service/terminal/title_hub.rs`. Client merge is `mergeServerTerminalTitle`.
3. **PT Design Excalidraw chrome** — drawer enter uses `translate3d` + `backwards`; `overflow: clip` instead of `hidden`; dark-theme library/search contrast; `restoreScrollChain` / `armSidebarScrollPin` so focusing the sliding search field does not shove toolbar/zoom.

Out of scope: new `WsAction` / REST routes, i18n JSON (overlay copy already lives in `apps/web/messages/{en,zh}.json` on `main`), `extract_command_name`, `isPathLikeTitle` implementation, mobile/desktop create overlays, raising `oxlint --max-warnings` above 455.

Id selection: `origin/main` has QUALITY-001…021. Open PRs hold QUALITY-022 (#343) and QUALITY-023 (#346). 019–023 are reserved. QUALITY-024 is the next free id.

## Quality target

| Item                                      | Before #348                                                                          | After (this diff)                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Welcome create `blocking`                 | Always `true`                                                                        | `workspaceCreateBlocksUntilWorktree(currentView)` — `true` only when `currentView === "welcome"`              |
| Create dialog `blocking`                  | Always `true`                                                                        | Same helper as Welcome                                                                                        |
| Blocking overlay chrome                   | Center-stage `WorkspaceSetupProgressView`, inset around the left sidebar             | Non-dismissible `@workspace/ui` `Dialog` + `TextShimmer`; namespace `appShell.workspaceCreationOverlay`       |
| Overlay visibility                        | Latest blocking job + `isWorkspaceSetupBlocking(progress)`                           | Same origin and not yet in that workspace, and `progress?.status !== "error"`                                 |
| Overlay copy                              | Progress view / `"creating"`                                                         | Creating vs opening via `isWorkspaceCreateReadyToEnter`                                                       |
| Auto-enter when `latestJob.blocking`      | `!isWorkspaceSetupBlocking`                                                          | `isWorkspaceCreateReadyToEnter`; countdown `durationMs` is `0`                                                |
| Welcome after bind                        | Stay on the page                                                                     | `if (!blocksUntilWorktree) onClose?.()`                                                                       |
| Computer title snapshot → pane/cache      | `titlesFromServerSnapshot`; empty `session_title` omitted so the previous OSC stayed | `mergeServerTerminalTitle`; a command switch or idle directory with no topic clears OSC, including cache      |
| `reduce_title` on a new `ShimKind::Shell` | Wrote `dynamic_title` only                                                           | If the extracted command differs from the previous dynamic title, also clears `osc_title` and `session_title` |
| Excalidraw board overflow                 | `hidden`                                                                             | `clip` on the board wrapper and `.excalidraw`                                                                 |
| Drawer enter                              | `translateX` + opacity, ease `cubic-bezier(0.16, 1, 0.3, 1)`                         | `translate3d` only, `cubic-bezier(0.32, 0.72, 0, 1) backwards`                                                |
| Search-open chrome                        | Wrapper width could shrink for one frame                                             | `.layer-ui__wrapper` forced `width: 100%` / `transition: none`                                                |
| Dark library / search                     | Light-on-light browse link and search field                                          | Foreground/background remap, search field, placeholder, skeleton gradient                                     |
| Drawer focus scroll                       | Focusing the off-screen search field scrolled overflow ancestors                     | `captureScrollChain` / `restoreScrollChain` / `armSidebarScrollPin` in `observeSidebarExit`                   |

## Architecture overview

```
WelcomePage / CreateWorkspaceDialog
  workspaceCreateBlocksUntilWorktree(currentView)
    → useWorkspaceCreationStore.startCreating({ blocking })
        → WorkspaceSetupBlockingOverlay (Dialog, same origin, not failed)
        → useWorkspaceCreateAutoOpen
             enterImmediately = latestJob.blocking
             isEnterable = enterImmediately
               ? isWorkspaceCreateReadyToEnter
               : !isWorkspaceSetupBlocking

PTY bytes → title_hub::reduce_title
  OscHit::Shim { kind: Shell, start: true } + extracted command ≠ previous
    → osc_title = None, session_title = None, dynamic_title = command
  existing terminal_title_updated
    → applyServerTerminalTitle
         matchingPaneTitles + mergeServerTerminalTitle
         writeCachedDynamicTitle / writeCachedOscTitle (OSC may be cleared)

ExcalidrawBoard overflow: clip
  excalidraw-theme.css drawer + dark tokens
  observeSidebarExit → armSidebarScrollPin → restoreScrollChain
```

No new crate, table, or wire message. The oxlint cap in `package.json` stays `--max-warnings=455`.

## Module-by-module design

### Workspace create — web

**`apps/web/src/features/workspace/store/workspace-creation-store.ts`**

```ts
export function workspaceCreateBlocksUntilWorktree(currentView: string): boolean {
  return currentView === "welcome";
}
```

`WorkspaceCreateJob.blocking` meaning: Welcome is the New Workspace page itself, so creation stays on that page behind a dialog until the worktree exists, then enters. A New Workspace overlay on workspace / tasks / automations / project does not block; setup continues in the header.

**`apps/web/src/features/welcome/components/WelcomePage.tsx`** and **`apps/web/src/features/workspace/components/CreateWorkspaceDialog.tsx`** pass `blocking: workspaceCreateBlocksUntilWorktree(currentView)` into `startCreating`. After `bindWorkspace`, Welcome calls `onClose?.()` only when `!blocksUntilWorktree`.

**`apps/web/src/features/workspace/lib/workspace-setup.ts`**

```ts
export function isWorkspaceCreateReadyToEnter(
  progress: WorkspaceSetupProgress | null | undefined,
): boolean {
  if (!progress) return false;
  if (progress.status === "error" || progress.status === "completed") return true;
  return !isWorkspaceSetupBlocking(progress);
}
```

`isWorkspaceSetupBlocking` is unchanged: missing/`completed` is not blocking; current step `create_worktree` is blocking. Ready-to-enter is therefore: a snapshot exists, and it is `error`, `completed`, or past `create_worktree` (for example `setting_up` / `run_setup_script`). A missing snapshot stays not enterable.

**`apps/web/src/app-shell/use-workspace-create-auto-open.ts`**

- `enterImmediately = latestJob?.blocking === true`.
- `isEnterable`: blocking jobs use `isWorkspaceCreateReadyToEnter`; non-blocking jobs still use `!isWorkspaceSetupBlocking`.
- Countdown: `durationMs: enterImmediately ? 0 : WORKSPACE_AUTO_ENTER_DELAY_MS`. Blocking jobs are not paused by `input.paused`.

**`apps/web/src/app-shell/WorkspaceSetupBlockingOverlay.tsx`**

Replaces the center-stage progress panel with `Dialog` / `DialogContent` (`showCloseButton={false}`). Escape, pointer-down-outside, and interact-outside are `preventDefault`. `onOpenChange` is a no-op.

Show when:

- there is a `blocking` job (latest if it is blocking, else the most recent blocking job)
- `originKey` matches `getWorkspaceCreateOriginKey` for the current view
- `blockingJob.workspaceId !== currentWorkspaceId`
- `progress?.status !== "error"`

Copy: `openingTitle` / `openingDescription` when `blockingJob.workspaceId` is set, not failed, and `isWorkspaceCreateReadyToEnter(progress)`; otherwise `creatingTitle` / `creatingDescription`. Keys already exist under `appShell.workspaceCreationOverlay`. Attribute `data-workspace-setup-blocking-overlay` is kept.

The overlay is still mounted from `PanelLayout.tsx` (that file is not in the diff; the source-scan test still requires the import).

### Terminal titles — `core-service`

**`crates/core-service/src/service/terminal/title_hub.rs`**, `reduce_title`, `OscHit::Shim` with `start: true`:

After `extract_command_name` and the existing allow/`is_tmux_index` gates, a `ShimKind::Shell` whose previous `dynamic_title` is `Some` and **not equal to the new extracted command** sets `osc_title = None` and `session_title = None`, then writes `dynamic_title`. `ShimKind::Reattach` does not take this branch (reattach can still skip a dynamic downgrade via the existing `allow` flag).

`extract_command_name` is unchanged: `grok --always-approve` and `grok` both become `"grok"`, so that pair is not a switch. `ls` after `grok` is a switch.

Existing `ShimKind::Shell` `start: false` (CMD_END) already cleared topic and set a shortened path. The existing test `shell_cmd_end_clears_topic_and_reattach_keeps_it` now also asserts `osc_title` is `None`.

New unit: `shell_command_switch_clears_topic_and_reattach_keeps_it`.

No new persist schema. `TerminalTitleUpdate` fields are unchanged. Broadcast is still the existing `terminal_title_updated` path.

### Terminal titles — web

**`apps/web/src/features/terminal/store/terminal-store-helpers.ts`**

`titlesFromServerSnapshot` still omits empty fields. Callers that merge onto a live pane or cache must use `mergeServerTerminalTitle`:

```ts
export function mergeServerTerminalTitle(
  previous: { dynamicTitle?: string; oscTitle?: string },
  update: { dynamic_title?: string | null; session_title?: string | null },
): { dynamicTitle?: string; oscTitle?: string };
```

Rules in this function:

- `incomingDynamic` is `normalizeStoredDynamicTitle` of the snapshot `dynamic_title`.
- `incomingOsc` is trimmed `session_title` or omitted.
- `dynamicSwitched`: both previous and incoming dynamic titles are present and differ.
- `idleDirectory`: incoming dynamic title passes existing `@atmos/shared/terminal` `isPathLikeTitle` (this PR does not change that helper).
- Dynamic title: incoming, else previous.
- OSC: if there is no incoming topic **and** (`dynamicSwitched` or `idleDirectory`), drop OSC; else incoming, else previous.

That matches: first command title keeps a topic; same-command replay with `session_title: null` keeps a topic; command → path or command → other command with no topic clears; a snapshot that still carries `session_title` keeps it.

**`apps/web/src/features/terminal/lib/terminal-server-title.ts`**

`applyServerTerminalTitle` still returns when `workspace_id` or `tmux_window_name` is empty. It now:

1. Reads cache (`readCachedDynamicTitle` / `readCachedOscTitle`).
2. Collects matching live panes (`matchingPaneTitles`: same `workspaceId`, `windowMatches` on `tmuxWindowName || label`).
3. Picks `cacheBase`: first live pane whose current `oscTitle` is set and whose merge would drop it; else `livePanes[0]`; else the cache. This prefers a pane that still has the previous command when the cache already shows a later path.
4. Merges that base, writes dynamic title if present, and **always** `writeCachedOscTitle` (including `undefined`, which is the clear).
5. Applies `mergeServerTerminalTitle` per matching pane in `workspacePanes`.

Event name is unchanged: `onEvent("terminal_title_updated", …)` in existing `initServerTerminalTitles`.

### PT Design embed

**`packages/pt-design/src/embed/ExcalidrawBoard.tsx`** — wrapper style `overflow: "hidden"` → `"clip"`.

**`packages/pt-design/src/embed/excalidraw-theme.css`**

- `.excalidraw { overflow: clip }` so a sliding drawer cannot focus-scroll the board (`hidden` still accepted that scroll).
- Drawer enter: `animation: pt-design-drawer-in 280ms cubic-bezier(0.32, 0.72, 0, 1) backwards`. `backwards` paints the off-screen pose on frame one.
- `@keyframes pt-design-drawer-in` uses `translate3d(100%, 0, 0)` → `translate3d(0, 0, 0)` (opacity keyframes removed).
- `.layer-ui__wrapper` / `.layer-ui__wrapper.animate` stay `width: 100% !important` with `transition: none` so Search docking does not shrink chrome for one frame.
- Dark board (`[data-testid="pt-design-board"][data-theme="dark"]`): browse link, search field, placeholder, caret, and `.library-unit--skeleton` gradient. Editor theme stays light, so Excalidraw `.theme--dark` text colors do not apply.

**`packages/pt-design/src/embed/sidebar-motion.ts`**

New types/functions: `ScrollBox`, `ScrollMark`, `captureScrollChain`, `restoreScrollChain`. `armSidebarScrollPin` (not exported) captures the ancestor scroll chain from the board root, restores on capturing `scroll` and `focusin`, and drops listeners after `SIDEBAR_SCROLL_PIN_MS` (`SIDEBAR_ENTER_MS + 160`). `observeSidebarExit` pins on open and on close, and clears the pin in its teardown. Existing exit clone / `isClosingToggle` / `commitStyles` stay.

## Data model

No new wire DTO. `TerminalTitleUpdatedNotification` remains `{ workspace_id, tmux_window_name, dynamic_title, session_title, … }`.

`WorkspaceCreateJob.blocking` is still a boolean; only the assignment sites and comment changed.

No migration.

## Transport

No new WebSocket action or REST route. Title updates stay `terminal_title_updated`. Workspace setup progress stays the existing project-store snapshot (`setupProgress`).

## Security & permissions

- Overlay cannot be closed with Escape or an outside click while `show` is true. That is a UX lock, not auth.
- Title hub still sanitizes OSC strings with the existing `sanitize_title` path (unchanged).
- PT Design CSS does not introduce network or eval.

## Rollout plan

1. Code already lives on PR #348 (`cba363c32` and follow-ups). Do not rewrite those files in the spec-only commit.
2. Land this spec directory and the `specs/README.md` QUALITY-024 row on the same branch.
3. Keep oxlint `--max-warnings=455`.
4. Draft PR stays #348. Do not merge, force-push, or amend.

## Risks & tradeoffs

- **Risk**: `isWorkspaceCreateReadyToEnter` is `true` on `status === "error"`. The overlay hides (`!failed`), and a blocking auto-open may treat that workspace as enterable. There is no new test for auto-enter-on-error. Do not read this as a designed recovery flow.
- **Tradeoff**: client clear uses `isPathLikeTitle` (any `/` or `\` in the title). Server clear on CMD_START uses extracted command inequality, not path-likeness. An idle directory is cleared on the client even when the same path is replayed (`idleDirectory`). That is intentional in `mergeServerTerminalTitle` tests.
- **Tradeoff**: overlay no longer shows `WorkspaceSetupProgressView` or tracks sidebar insets. Setup detail stays in the header jobs UI for non-welcome creates.
- **Tradeoff**: `writeCachedOscTitle` is now unconditional so a clear reaches the cache. Same-command replay with `session_title: null` still keeps the previous topic via `mergeServerTerminalTitle`.
- **If this breaks titles**: revert `mergeServerTerminalTitle` callers to `titlesFromServerSnapshot` and drop the `ShimKind::Shell` clear in `reduce_title`. Observer `"Terminal"` is the known failure of wiping OSC on every empty snapshot.
- **If this breaks create UX**: restore `blocking: true` at the Welcome/dialog call sites and the previous overlay. oxlint cap must stay 455.

## Dependencies & compatibility

- Depends on existing APP-003 / APP-047 title fields and APP-075 Excalidraw embed.
- Blocks: none.
- Lint cap stays `oxlint --max-warnings=455` in `package.json`.
- Does not edit `packages/shared/src/terminal/title.ts`.

## Open questions

None. The three slices are the #348 diff; unused product ideas stay out.
