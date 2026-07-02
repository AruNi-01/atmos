# TEST · APP-030: Terminal Side Chat

> Test Plan · how we verify terminal-only `/side` side chats. References PRD APP-030 and TECH APP-030.

## Test strategy

- **Rust unit / integration**: prove tmux side-context capture resolves only workspace-owned windows, strips ANSI, applies byte bounds, and backend side-chat registry cleanup reconciles with tmux.
- **Bun unit / component tests**: prove slash visibility, chip mode, chip popover, prompt construction, bright color allocation, agent picker fallback, side-chat identity propagation, backend registry sync, agent-status navigation, and side-chat submit validation.
- **WebSocket/API-level**: prove `terminal_side_context_capture` and `terminal_side_chat_*` request/response routing and validation through the app WS router.
- **End-to-end (Playwright)**: cover the critical user journey in `e2e/tests/specs/APP-030_terminal-side-chat.e2e.ts` when the harness can provide a seeded tmux terminal and test agent command.
- **Exploratory agent-browser**: verify visual and interaction quality for modal, hidden dots, keyboard focus, and narrow viewport behavior.
- **Manual-only**: real terminal-agent CLI prompt delivery across every custom agent is manual in M1 because user-installed CLIs and credentials vary by machine.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2 |
| M2 | S1, S3 |
| M3 | S3, S4, S6 |
| M4 | S4, S8 |
| M5 | S5 |
| M6 | S13 |
| M7 | S5 |
| M8 | S6, S7 |
| M9 | S7 |
| M10 | S9, S10 |
| M11 | S11 |
| M12 | S14 |
| M13 | S15 |
| M14 | S16 |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Bun component | `bun test` | `bun test apps/web/src/features/terminal` | terminal AI Input rendered with `/side` extra command | slash popover shows `/side`; selecting it renders chip; chip hover/focus shows compact metadata popover; composer focus remains | planned |
| S2 | Bun component | `bun test` | `bun test apps/web/src/features/welcome` | New Workspace welcome composer | slash popover does not include `/side` | planned |
| S3 | Bun integration | `bun test` | `bun test apps/web/src/features/terminal` | fake source pane with known agent and tmux window | side submit calls capture API and does not call source `sendText` / `sendEnter` | planned |
| S4 | Rust + Bun | `cargo test`, `bun test` | `cargo test -p core-service terminal_side_context`; `bun test apps/web/src/features/terminal` | tmux capture fixture with ANSI and long output | response text has no ANSI; prompt includes source metadata, captured bytes, prompt byte budget, truncation state, and user prompt | planned |
| S5 | Bun component | `bun test` | `bun test apps/web/src/features/terminal` | side modal record with one terminal | header shows Hide and Close only; no split/maximize/context-menu controls rendered | planned |
| S6 | Bun component | `bun test` | `bun test apps/web/src/features/terminal` | side modal hidden after launch | modal unmounts; hidden dot appears next to collapsed AI Input handle; clicking restores modal | planned |
| S7 | Bun unit | `bun test` | `bun test apps/web/src/features/terminal` | multiple side chat records | active side chats get unique random bright colors; allocator rejects used and dark colors | planned |
| S8 | WebSocket/API-level | `cargo test` or API harness | `TBD by test-run` | workspace tmux session with source window | `terminal_side_context_capture` returns bounded context and never accepts arbitrary tmux session names | planned |
| S9 | Bun component | `bun test` | `bun test apps/web/src/features/terminal` | source pane without detected agent and with available terminal agents | agent picker/menu opens; selecting an agent continues side launch; cancelling keeps composer recoverable; source terminal untouched | planned |
| S10 | WebSocket/API-level + Bun | `cargo test`, `bun test` | `TBD by test-run` | capture failure / missing tmux window | recoverable error response maps to inline composer feedback; no side terminal launches | planned |
| S11 | Static/i18n | `bun test` or lint | `bun test apps/web/src/features/terminal apps/web/src/features/agent` | `en.json` and `zh.json` | all side-chat copy keys, including optional agent status label, exist in both locales; no hardcoded user-facing side-chat strings in components | planned |
| S12 | E2E | Playwright | `just test-e2e -- tests/specs/APP-030_terminal-side-chat.e2e.ts` | local app, seeded workspace, tmux available, deterministic test agent command | selecting `/side` opens side modal; Hide creates dot; restore works; source terminal output does not receive prompt | planned |
| S13 | Bun component + E2E | `bun test`, Playwright | `bun test apps/web/src/features/canvas`; `just test-e2e -- tests/specs/APP-030_terminal-side-chat.e2e.ts` | Canvas terminal card with AI Input | side modal and hidden dots are clipped to the terminal card; no drag or movement outside the card | planned |
| S14 | Rust + Bun integration | `cargo test`, `bun test` | `cargo test -p core-service terminal_side_identity`; `bun test apps/web/src/features/terminal apps/web/src/features/agent` | side chat creation request and fake agent hook update | side terminal receives side-chat env metadata; hook DTO/store carries `terminal_kind` and `side_chat_id`; status navigation restores/focuses side chat by id | planned |
| S15 | Rust + Bun integration + E2E | `cargo test`, `bun test`, Playwright | `cargo test -p core-service terminal_side_chat_registry`; `bun test apps/web/src/features/terminal`; `just test-e2e -- tests/specs/APP-030_terminal-side-chat.e2e.ts` | backend side-chat registry plus terminal discovery response with live/missing side tmux windows | reload/context remount restores live side chats as hidden dots; stale backend records are removed; no prompt/transcript content is persisted | planned |
| S16 | Rust integration + Bun + E2E | `cargo test`, `bun test`, Playwright | `cargo test -p core-service terminal_side_chat_cleanup`; `bun test apps/web/src/features/terminal`; `just test-e2e -- tests/specs/APP-030_terminal-side-chat.e2e.ts` | source terminal with one open and one hidden child side chat | closing child side chat removes backend record and tmux window; closing parent source terminal cascades cleanup to all child side chats and dots | planned |

## Scenarios

### S1 — Terminal AI Input offers `/side` and renders chip

- **Level**: Bun component
- **Given**: a terminal pane with AI Input available.
- **When**: the user opens slash commands, selects `/side`, and resumes typing.
- **Then**: the slash query is removed, a `/side` chip is visible, focus stays in the composer, and the typed prompt remains editable.
- **When**: the user hovers or focuses the `/side` chip.
- **Then**: a compact popover appears with source terminal metadata, detected-agent state, and capture byte budget, without showing the full transcript.
- **Signals**: `/side` command row visible before selection; chip visible after selection; composer text excludes the slash query; chip popover has no transcript body.

### S2 — Welcome composer does not offer `/side`

- **Level**: Bun component
- **Given**: the New Workspace welcome composer.
- **When**: the user opens slash commands and searches `side`.
- **Then**: `/side` is not present.
- **Signals**: slash popover contains normal welcome commands/skills only; no terminal-only side command row exists.

### S3 — Side submit does not write to source terminal

- **Level**: Bun integration
- **Given**: a source terminal pane with `tmuxWindowName`, detected agent metadata, and a typed side prompt.
- **When**: the user submits while `/side` mode is selected.
- **Then**: the source terminal `sendText` and `sendEnter` callbacks are not called; a side-chat create flow starts after capture succeeds.
- **Signals**: capture API mock called once; side-chat store receives one record; source terminal input spies remain untouched.

### S4 — Captured context is bounded and explicit

- **Level**: Rust + Bun
- **Given**: a tmux pane with ANSI-colored output and more content than the configured capture budget.
- **When**: Atmos captures side context and builds the side prompt.
- **Then**: the returned text is plain text, bounded, and the prompt states that it is a terminal transcript rather than hidden memory.
- **Signals**: no ANSI escape sequences in response; returned UTF-8 text is at or below `prompt_budget_bytes`; truncation flag and omitted-byte counts are set when applicable; prompt contains source project/workspace/window metadata and user prompt.

### S5 — Side terminal has constrained controls

- **Level**: Bun component
- **Given**: an open side chat modal.
- **When**: the header and terminal surface render.
- **Then**: only Hide and Close actions are visible in the header; normal terminal split/maximize/tab/pin controls and right-click menu are unavailable.
- **Signals**: no split/maximize/pin/new-tab controls in DOM; context menu action does not open `TerminalGridContextMenu`.

### S6 — Hide and restore preserves side chat

- **Level**: Bun component
- **Given**: an open side chat modal with a known side tmux window name.
- **When**: the user clicks Hide.
- **Then**: the modal disappears and a bright colored dot appears next to the collapsed AI Input handle.
- **When**: the user clicks the dot.
- **Then**: the modal returns and attaches to the same side tmux window name.
- **Signals**: side-chat status changes `open -> hidden -> open`; restore uses `tmuxWindowName`, not `isNewPane`.

### S7 — Multiple hidden side chats use unique colors

- **Level**: Bun unit
- **Given**: several active side chat records.
- **When**: each side chat is assigned a dot color.
- **Then**: no active side chat shares a color, and all assigned colors are bright enough to read on terminal surfaces.
- **Signals**: color allocator samples random bright/light colors, rejects colors already assigned to active side chats, rejects dark colors, and returns a typed failure only if it cannot find a unique color within the retry limit.

### S8 — Capture cannot escape workspace tmux session

- **Level**: WebSocket/API-level
- **Given**: a request for a source tmux window name under one workspace.
- **When**: the backend resolves the capture request.
- **Then**: it only searches the workspace's resolved tmux session names and rejects empty or missing windows.
- **Signals**: success for a valid workspace window; validation/not-found error for an arbitrary or missing window; logs do not include transcript text.

### S9 — Missing detected agent opens picker fallback

- **Level**: Bun component
- **Given**: a source pane with terminal output but no detected/source agent metadata, and a non-empty list of runnable terminal agents.
- **When**: the user submits `/side`.
- **Then**: Atmos opens the existing terminal-agent picker/menu before launching the side chat.
- **When**: the user selects an agent.
- **Then**: side-chat launch continues with that agent and the source terminal stays untouched.
- **When**: the user cancels the picker.
- **Then**: no side-chat terminal is created, and the `/side` chip plus prompt remain recoverable.
- **Signals**: picker/menu opened; selected agent becomes the side chat agent; cancellation opens no terminal websocket URL and sends no source terminal input.

### S10 — Capture failure is recoverable

- **Level**: WebSocket/API-level + Bun
- **Given**: tmux is unavailable or the source window no longer exists.
- **When**: the user submits `/side`.
- **Then**: the capture failure maps to inline composer feedback and no side terminal is created.
- **Signals**: API returns typed error; frontend renders recoverable error; modal layer remains empty.

### S11 — Side chat copy is localized

- **Level**: Static/i18n
- **Given**: the English and Chinese message files.
- **When**: side-chat components render labels, descriptions, tooltips, and errors.
- **Then**: every string is read from i18n keys available in both locales.
- **Signals**: missing-key tests pass; component source has no hardcoded user-facing side-chat prose, including any agent status side-chat label/badge.

### S12 — E2E happy path

- **Level**: E2E (Playwright)
- **Given**: a local workspace with a terminal pane running a deterministic test agent command and tmux available.
- **When**: the user selects `/side`, types a prompt, submits, hides the modal, and restores it from the dot.
- **Then**: a side terminal modal opens and restores correctly, while the source terminal does not receive the side prompt.
- **Signals**: modal title visible, side terminal output visible, hidden dot visible with unique color, source pane output unchanged except pre-existing content.

### S13 — Canvas terminal side chat stays inside the terminal card

- **Level**: Bun component + E2E
- **Given**: a Canvas terminal card with terminal AI Input available.
- **When**: the user starts `/side` from that card.
- **Then**: the side chat modal is rendered inside the terminal card/shape, clipped by that terminal surface, and cannot be dragged or moved onto the broader canvas.
- **Signals**: side chat layer DOM is inside the Canvas terminal card subtree; modal bounding box stays within the card bounding box; no app-level portal root contains the side modal; hidden dots appear beside the card's collapsed AI Input handle.

### S14 — Side chat terminal identity reaches hooks and status navigation

- **Level**: Rust + Bun integration
- **Given**: a side chat record with a generated `sideChatId`, source tmux window name, and selected agent.
- **When**: the side chat terminal is created.
- **Then**: the terminal WebSocket creation request includes side-chat identity metadata, and the backend creates the tmux window with the normal Atmos env plus `ATMOS_TERMINAL_KIND=side_chat` and `ATMOS_SIDE_CHAT_ID=<sideChatId>`.
- **When**: a fake agent hook update arrives with side-chat headers.
- **Then**: the hook DTO and frontend store retain `terminal_kind`, `side_chat_id`, and `source_pane_id`.
- **When**: the user clicks that row or notification in the agent status panel.
- **Then**: Atmos restores/focuses the matching side chat by id when the side chat record exists, attempts one tmux reconciliation when it does not, and only then falls back to existing `context_id` / `pane_id` navigation.
- **Signals**: URL-builder output has `terminal_kind=side_chat` and `side_chat_id`; service test observes side-chat env vars without transcript/prompt content; hook store row contains side metadata; navigation spy calls side-chat restore/focus or reconciliation before normal pane navigation.

### S15 — Backend side chat registry persists across reload and reconciles with tmux

- **Level**: Rust + Bun integration + E2E
- **Given**: a side chat has been created, hidden, and persisted in the backend local registry with `sideChatId`, source pane metadata, color, and side tmux window name.
- **When**: the user reloads the page or leaves and returns to the workspace context.
- **Then**: Atmos calls `terminal_side_chat_list`, reconciles backend registry records with terminal discovery, confirms the side tmux window still exists, and restores a hidden dot without replaying the original prompt.
- **When**: terminal discovery no longer reports the side tmux window.
- **Then**: Atmos removes the stale backend record and does not render a dead dot.
- **Signals**: backend `terminal_side_chat` row contains metadata only; no transcript text, resolved prompt, launch command, env value, or terminal snapshot is stored after launch; live side chat records restore as `hidden`; stale records are cleaned after reconciliation; clicking a restored dot attaches to `sideTmuxWindowName`.

### S16 — Side chat cleanup and parent terminal cascade

- **Level**: Rust integration + Bun + E2E
- **Given**: a source terminal has two child side chats, one open modal and one hidden dot, each with a backend registry record and live side tmux window.
- **When**: the user closes the hidden side chat from its restored modal or status/navigation surface.
- **Then**: Atmos destroys that side tmux window, soft-deletes its backend registry record, and removes its dot/modal UI.
- **When**: the user closes or destroys the source parent terminal.
- **Then**: Atmos calls `cleanup_side_chats_for_source`, destroys all remaining child side tmux windows, soft-deletes their backend registry records, and removes all side chat dots/modals for that source.
- **When**: the source tmux window disappears outside Atmos and the workspace later reconciles.
- **Then**: backend reconciliation closes/removes child side chat records instead of leaving non-rendered hidden handles.
- **Signals**: tmux window list no longer contains child side windows; backend list API returns no active child records for the source; UI has no side chat dots/modals; no transcript/prompt content appears in registry rows or logs.

## Performance & load budgets

- Capture request returns within 500 ms for the default 98,304-byte prompt budget and 524,288-byte raw capture budget on a local tmux session.
- Frontend side prompt construction does not block the main thread for more than one animation frame under the default 98,304-byte prompt transcript budget.
- Backend side-chat registry reconciliation for one workspace completes within 500 ms for 20 side chat records on a local tmux session and does not block first paint.
- Opening/hiding/restoring a side chat does not resize or remount the source terminal pane.

## Regression checklist

- [ ] `/side` never appears in New Workspace welcome composer.
- [ ] `/side` chip popover is compact and never displays the full transcript.
- [ ] Side submit never writes to the source terminal.
- [ ] Missing detected source agent opens the existing terminal-agent picker/menu before launch.
- [ ] Side chat terminal creation injects side-chat identity env without prompt or transcript content.
- [ ] Agent hook status/navigation recognizes side-chat sessions by `side_chat_id` when available.
- [ ] Backend side chat registry persistence stores metadata only and restores live side chats after reload/context remount.
- [ ] Closing a side chat removes its backend registry record and destroys its side tmux window.
- [ ] Closing a source parent terminal cascades cleanup to all child side chat tmux windows, registry records, and dots.
- [ ] Transcript text is not logged by backend or frontend debug output.
- [ ] Side modal cannot split, maximize, pin, create tabs, or open terminal grid context menu.
- [ ] Terminal grid hotkeys do not affect the side chat modal.
- [ ] Hidden dot colors are random, bright/light, and unique among active side chats.
- [ ] Close destroys the side chat tmux window and removes its backend registry record; Hide does not.
- [ ] All side-chat copy exists in every web locale.

## Exploratory agent-browser checks

Use these after implementation. The test-run agent must load Agent Browser instructions before running them: prefer the installed `agent-browser` skill; otherwise run `agent-browser skills get core --full`. If Agent Browser is unavailable, use `specs/references/agent-browser-setup.md` and record the gap in Coverage Status.

1. In a normal terminal pane, open AI Input, select `/side`, hover/focus the chip, type a prompt, and confirm the chip, popover, and focus behavior feel clear.
2. Submit a side chat, then verify the modal visually reads as a constrained terminal, not another full terminal workspace.
3. Hide three side chats and check that dots sit to the right of the collapsed AI Input handle without overlapping the handle or terminal content.
4. Start `/side` from a Canvas terminal card and confirm the modal cannot leave that terminal card or cover unrelated canvas content.
5. With an agent that has Atmos hooks installed, trigger a side chat state update and confirm the agent status panel row can restore/focus the side chat.
6. Reload the page and confirm existing live side chats return as hidden dots without reopening modals.
7. Restore and close side chats in desktop and browser dev; watch for console errors, failed WS requests, clipped text, or stuck hidden dots.
8. Close the source parent terminal after creating multiple side chats and confirm no child side chat dots or tmux windows survive.
9. Repeat at a narrow viewport and verify the side modal header controls remain usable.

## Acceptance criteria

- [ ] All Must Have PRD items have at least one planned or passing scenario.
- [ ] Backend capture is byte-bounded, plain text, workspace-scoped, and does not log transcript content.
- [ ] `/side` is terminal-only and absent from New Workspace welcome composer.
- [ ] Side submit opens a separate terminal and leaves the source terminal input untouched.
- [ ] Unknown source agents use the existing terminal-agent picker/menu before launch.
- [ ] Side chat terminals carry side-chat identity through terminal env, agent hook DTOs, frontend hook store, and status-panel navigation.
- [ ] Side chat metadata persists in the backend local registry and reconciles against tmux discovery so page reload restores live side chat dots.
- [ ] Side chat close and source parent terminal close clean up backend registry records and child tmux windows.
- [ ] Side terminal exposes only one panel with Hide and Close controls.
- [ ] Canvas terminal side chats are scoped and clipped to the source terminal card/shape.
- [ ] Hidden side chats restore from unique random bright colored dots next to the collapsed AI Input handle.
- [ ] `atmos-specs-test-run` updates Coverage Status with exact automated commands and exploratory results.

## Manual verification steps

1. Start `just dev-api` and `just dev-web`, open a workspace with a terminal-agent pane, and confirm `/side` launches a side terminal with recent transcript context.
2. In Desktop via `just dev-desktop`, repeat Hide, restore, and Close to verify Tauri websocket/runtime behavior.
3. Create multiple side chats from one source terminal, close the source terminal, and confirm terminal manager/tmux no longer shows child side chat windows.
4. Try at least two real installed terminal agents, such as Claude Code and Codex, because prompt delivery strategies differ.

## Non-coverage

- Full matrix of custom terminal-agent CLIs is not automated in M1; custom user CLIs and credentials vary by machine.
- Capture preview is out of scope.
- Hidden-dot running/unread badges are out of scope; agent hooks and the agent status panel own running/permission notifications.
- Cross-device/cloud sync of side chat registry metadata is out of scope; registry metadata is local to the connected Atmos Server/runtime.
- Mobile behavior is out of scope.

## Coverage Status

> Filled after implementation by `atmos-specs-test-run`. Include exact automated tests, commands, agent-browser prompts/results when used, and remaining gaps.
