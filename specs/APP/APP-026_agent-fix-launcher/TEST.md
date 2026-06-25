# TEST · APP-026: Agent Fix Launcher

> Test Plan · how we verify reusable Copy Prompt and Agent Fix actions. References PRD APP-026 and TECH APP-026.

## Test strategy

- **Unit / integration**: Prompt normalization, title de-duplication, command-building wrapper inputs, source prompt helpers.
- **Component tests**: Toolbar/button rendering, disabled states, settings popover wiring, hover/focus replacement behavior.
- **Store / app-shell integration**: Generic launcher registration and new terminal tab creation with source-specific titles.
- **Manual smoke**: End-to-end terminal-agent launch across diff annotations, PR reviewer comments, and failed CI job rows because it crosses modal UI, Center Stage tabs, and tmux-backed terminal grids.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1       | S1, S2, S6 |
| M2       | S1, S3, S9 |
| M3       | S4, S9 |
| M4       | S1, S4 |
| M5       | S2, S6 |
| M6       | S2, S5, S8 |
| M7       | S5 |
| M8       | S6, S7 |
| M9       | S3, S4, S6, S7, S11 |
| M10      | S8 |
| M11      | S9 |
| M12      | S10 |

## Scenarios

### S1 · Toolbar renders shared actions and settings

- **Level**: Component test
- **Given**: an enabled `AgentFixPromptSource` with workspace context and a non-empty prompt.
- **When**: `AgentFixToolbar` renders.
- **Then**: settings, Copy Prompt, and Agent Fix controls are present; the settings control opens the terminal-agent selector/run-config UI; button text truncates without overflowing narrow width.
- **Signals**: DOM controls, popover content, no layout overflow in test viewport.

### S2 · Copy Prompt copies resolved prompt without launching

- **Level**: Unit/component test
- **Given**: a prompt source whose `getPrompt` returns structured `{ prompt, clipboardText }`.
- **When**: the user clicks Copy Prompt.
- **Then**: `navigator.clipboard.writeText` receives `clipboardText`; the terminal launcher store is not called; `onCopied` fires once.
- **Signals**: clipboard mock call, launcher mock call count, callback invocation.

### S3 · Diff annotation launches Agent Fix

- **Level**: Integration/manual smoke
- **Given**: a diff inline prompt annotation with a selected range and note.
- **When**: the user clicks Agent Fix from the annotation.
- **Then**: Atmos resolves the same prompt used by Copy Prompt, creates a new terminal tab, titles it from the file/range source, and sends the selected agent command to the terminal grid.
- **Signals**: visible terminal tab title, selected tab route param, terminal pane label/agent indicator, command sent to `TerminalGrid.createAndRunTerminal`.

### S4 · Failed CI job exposes compact action on hover and focus

- **Level**: Component test + manual smoke
- **Given**: `ActionsDetailModal` shows a completed job with `conclusion === "failure"`.
- **When**: the job row is hovered or keyboard-focused.
- **Then**: the time/status affordance reveals an Agent Fix action button; clicking it launches a prompt with workflow, run, job, branch/SHA, and failed step metadata.
- **Signals**: button visible on hover/focus, accessible label, prompt helper output.

### S5 · Terminal tab title is source-specific and unique

- **Level**: Unit/store test
- **Given**: existing tabs titled `Fix CI: test` and `Term - 1`.
- **When**: Agent Fix requests a new tab with preferred title `Fix CI: test`.
- **Then**: `createTerminalTab` creates a tab titled `Fix CI: test 2`; default tab creation without a preferred title still uses `Term - N`.
- **Signals**: terminal store state after create, existing terminal-store regression tests.

### S6 · PR reviewer comment prompt is source-owned

- **Level**: Unit/component test
- **Given**: a PR review thread with file path, line, diff hunk, and reviewer comments.
- **When**: the PR modal creates the Agent Fix source for that thread.
- **Then**: the prompt includes PR number/repo, file path, line, diff hunk, and comments; the shared Agent Fix component receives only `getPrompt` and labels, not PR-specific internals.
- **Signals**: prompt helper output snapshot/contains checks, component props boundary.

### S7 · Review Session lifecycle is preserved

- **Level**: Integration/manual smoke
- **Given**: an active review session with open comments and no active fix run.
- **When**: the user starts a review fix after APP-026 is implemented.
- **Then**: existing review behavior still creates a tracked fix run, updates active-run status, supports Mark failed, and can finalize artifacts.
- **Signals**: `ReviewAgentRunModel` status updates in UI, existing review WS events, artifact/finalize controls.

### S8 · Failure paths do not launch in the wrong context

- **Level**: Unit/integration test
- **Given**: a prompt source with missing context, empty prompt, or a context id that no longer matches active Center Stage.
- **When**: Agent Fix is clicked.
- **Then**: no terminal tab is created; the user sees a disabled reason or error toast; Copy Prompt remains available when the prompt can still be resolved.
- **Signals**: terminal store unchanged, toast mock, button disabled reason.

### S9 · Accessibility and dense layout behavior

- **Level**: Component test + manual visual check
- **Given**: toolbar and action-button variants in narrow modal/sidebar containers.
- **When**: the user tabs through controls and opens settings.
- **Then**: focus order is logical; hover-only actions also show on focus; icon buttons have accessible labels/tooltips; text does not overlap adjacent content.
- **Signals**: keyboard navigation, aria labels, screenshot/manual check in light and dark mode.

### S10 · Global last-used Agent Fix agent is reused

- **Level**: Unit/component test
- **Given**: the user selects `codex` in an Agent Fix settings popover and launches Agent Fix.
- **When**: the user opens another Agent Fix control from a different source family.
- **Then**: `codex` is selected by default if it is still available; no per-source family preference is read or written.
- **Signals**: `agentFix.lastAgentId` pref value, selected agent id in the next control, absence of per-family pref keys.

### S11 · Diff merged prompt chip supports Copy Prompt and Agent Fix

- **Level**: Integration/component test
- **Given**: multiple diff prompt annotations have been stashed into the existing merged prompt flow.
- **When**: the user opens the merged prompt action.
- **Then**: Copy Prompt copies the same merged prompt as the current copy-only chip, and Agent Fix launches a terminal agent with that merged prompt; successful copy or launch clears the stashed prompts using the current cleanup semantics.
- **Signals**: merged prompt text, clipboard mock, terminal launcher mock, stashed prompt state after success.

## Regression checklist

- [ ] Existing `DiffCopyAnnotation` Copy/Stash/Cancel behavior still works.
- [ ] Existing diff merged prompt copy behavior is preserved while adding Agent Fix.
- [ ] Existing Review Session fix run status, Mark failed, and finalize behavior still works.
- [ ] New terminal tabs created without preferred titles still use the current `Term - N` sequence.
- [ ] Agent settings popover uses APP-024 run-config behavior and does not fork a new model/reasoning UI.
- [ ] Agent Fix remembers only one global last-used agent id, not per-source preferences.
- [ ] No prompt bodies are logged to console or debug logs.
- [ ] Project route and workspace route both launch into the correct terminal context.

## Acceptance criteria

- [ ] All Must Have PRD items have at least one passing scenario or documented manual smoke.
- [ ] `bun test` covers prompt resolution, tab title de-duplication, and component states touched by the implementation.
- [ ] `bun typecheck` passes for `apps/web`.
- [ ] Existing review-session tests/manual smoke remain green.
- [ ] Manual smoke confirms Agent Fix launches from diff annotation, PR reviewer comment, and failed CI job.
- [ ] No new REST endpoints are introduced for Agent Fix.

## Manual verification steps

1. Open a workspace diff, create an inline prompt annotation, use Copy Prompt, then Agent Fix. Confirm a new source-titled terminal tab starts the selected agent.
2. Stash multiple diff prompt annotations, use Copy Prompt from the merged prompt action, then repeat with Agent Fix. Confirm both use the same merged prompt.
3. Open a PR modal with Files changed reviewer comments. Trigger Agent Fix on a thread and confirm the prompt includes PR/comment context.
4. Open a failed GitHub Actions run. Hover and keyboard-focus a failed job row; confirm Agent Fix appears and launches with CI context.
5. Change agent/model/reasoning in the Agent Fix settings popover and confirm the launched command includes the selected run config.
6. Trigger Agent Fix from another source and confirm the last-used Agent Fix agent is selected by default.
7. Repeat one launch on a project route and one on a workspace route to confirm context routing.

## Non-coverage

- Mobile Expo UI is out of scope.
- Full raw GitHub Actions logs are not required unless the modal already loads them.
- Generic batch prompts outside the existing diff merged prompt flow are out of scope.

## Coverage Status · 2026-06-25

### Automated checks run

- `cd apps/web && bun run typecheck` — passed.
- `bun test apps/web/src/features/terminal/store/__tests__/terminal-store-new-tab.test.ts` — passed.
- `bun test apps/web/src/features/github/lib/__tests__/agent-fix-prompts.test.ts` — passed.
- `bun test apps/web/src/features/github/lib/__tests__/pr-review-thread-agent-fix.test.tsx` — passed.
- `bun test apps/web/src/features/github/lib/__tests__/agent-fix-prompts.test.ts apps/web/src/features/github/lib/__tests__/pr-review-thread-agent-fix.test.tsx apps/web/src/features/terminal/store/__tests__/terminal-store-new-tab.test.ts apps/web/src/features/wiki/components/__tests__/agent-select.test.ts` — passed.
- `bun --filter web lint -- <APP-026 changed web files>` — passed.

### Browser smoke run

- Opened `http://localhost:3030/zh/workspace?id=a6cda58e-53e9-4c1f-8c42-cf85e32c747c`.
- Confirmed the workspace route loads Center Stage terminal tabs and right sidebar tabs.
- Opened PR modal for `#119`; Discussion loaded but did not include review comment threads, so PR reviewer-thread UI coverage is provided by `pr-review-thread-agent-fix.test.tsx`.
- Opened Actions tab, selected failed workflow run `CI - Backend (Rust)` (`#26155207224`), waited for jobs to load.
- Confirmed failed jobs `Format Check` and `Clippy` expose Agent Fix controls, while skipped jobs do not.
- Opened `Configure Agent Fix agent` from a failed job and confirmed the popover shows the reused terminal-agent selector options (`Claude Code`, `Codex`, `Gemini`, `Hermes Agent`, etc.).

### Known verification limits

- Full `bun --filter web lint` currently fails on unrelated pre-existing files (`HostedAppShellGate.tsx`, `LocalModelDownloadProgress.tsx`, `CanvasAgentIsland.tsx`, `DiffWorkerPoolProvider.tsx`, `HostedWelcomeGate.tsx`). APP-026 changed files pass targeted lint.
- Browser smoke intentionally did not click `Start Agent Fix` because that would start a real terminal agent session against the workspace. Terminal tab title creation and command-building are covered by focused automated tests and typecheck; the Actions modal UI and settings popover were verified in Browser.
