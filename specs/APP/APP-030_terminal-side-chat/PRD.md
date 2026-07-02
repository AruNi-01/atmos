# PRD · APP-030: Terminal Side Chat

> Product Requirements · WHAT and WHY. Settled direction for `/side` side chats from terminal AI Input.

## Context

- **Problem**: Terminal-agent users need a way to ask side questions or continue a tangent from the current terminal output without polluting the main terminal agent's conversation.
- **Why now**: Atmos already has tmux-backed terminal persistence and a floating AI Input overlay. That makes a lightweight side-chat fork possible without introducing a separate chat product.
- **Product direction**: `/side` is a terminal-only slash command. It captures a bounded transcript from the current tmux pane, creates a separate terminal-agent session, and keeps the side chat visually separate from the main terminal.
- **Related specs**:
  - [APP-002 Terminal Multiplexing System](../APP-002_terminal-multiplexing/TECH.md)
  - [APP-015 Canvas Terminal Agent Integration](../APP-015_canvas-terminal-agent-integration/TECH.md)
  - [APP-024 Terminal Agent Run Config](../APP-024_terminal-agent-run-config/PRD.md)

## Goals

1. Let users start a side conversation from a terminal pane without sending anything into the current terminal agent.
2. Make the side chat's seed context explicit, bounded, and derived from tmux-visible terminal output.
3. Keep the side chat terminal intentionally constrained: one panel, Hide and Close only.
4. Preserve the current terminal layout and agent context while allowing multiple temporary side chats.
5. Keep agent hook notifications and status-panel navigation correct for side chat terminals.
6. Restore side chat handles after route changes and page reloads when their tmux windows still exist.

## Users & Scenarios

- **Primary persona**: Agentic Builder working in a terminal-agent session who wants to ask a quick tangent or explore an explanation without changing the main agent's thread.
- **Secondary persona**: Workspace reviewer who wants to discuss terminal output, errors, or agent suggestions in a separate temporary chat.

### Key scenarios

1. A user sees a confusing build error in a terminal agent, opens AI Input, selects `/side`, asks "explain this error", and gets a separate side chat terminal seeded with the recent terminal transcript.
2. A user wants to brainstorm an alternative implementation while the main agent continues its current work. The side chat opens separately and never receives input through the main terminal.
3. A user hides two side chats while returning to the main terminal. Each hidden chat becomes a distinct bright colored dot near the collapsed AI Input handle and can be restored later.
4. A user opens the New Workspace welcome composer. `/side` does not appear because there is no source terminal context to fork.
5. A user starts `/side` from a Canvas terminal card. The side chat appears inside that terminal card and cannot be moved outside the card onto the broader canvas.
6. A side chat agent emits an Atmos hook notification. The agent status panel recognizes it as a side chat and can restore or focus the matching side chat instead of trying to jump to a normal terminal pane.
7. A user refreshes the page or switches away from a workspace and returns later. Side chat dots are restored for side chat tmux windows that still exist, without replaying the original `/side` prompt.

## User Stories

- As a terminal-agent user, I want `/side` to create a separate chat from my current terminal context, so that tangents do not enter the main agent conversation.
- As a user, I want a visible `/side` chip before submitting, so that I can tell the composer is in side-chat mode.
- As a user, I want hidden side chats to become small restore points, so that I can keep them alive without covering the terminal.
- As a user, I want the side terminal to be constrained, so that I do not accidentally split or manage it like a full workspace terminal.
- As a Canvas terminal user, I want side chat to stay inside the terminal card, so that it does not become an unrelated floating canvas object.
- As a New Workspace user, I should not see `/side`, because no terminal context exists yet.
- As a user following agent hook notifications, I want side chat sessions to navigate back to the correct side chat, so that status panel actions do not lose the terminal I was using.
- As a user returning to a workspace after reload or navigation, I want existing side chats to remain discoverable, so that long-running side conversations are not lost from the UI.

## Functional Requirements

### Must Have

- **M1 · Terminal-only slash command**: `/side` appears in the terminal AI Input slash menu and does not appear in the New Workspace welcome composer slash menu.

- **M2 · Chip-based mode selection**: Selecting `/side` removes the slash query from the editor, shows a `/side` chip in the terminal AI Input, and lets the user continue typing the side prompt before pressing Enter. Hovering or focusing the chip shows a compact popover with source terminal metadata, detected agent state, and capture byte budget. The popover does not show the full transcript.

- **M3 · Side submit behavior**: Submitting a non-empty prompt while `/side` is selected:
  - uses the source terminal's detected agent when available,
  - opens the existing terminal-agent picker/menu when no source agent is detected, then continues after the user chooses an agent,
  - captures bounded context from the source terminal pane,
  - creates a new side chat terminal,
  - sends the side prompt plus captured context to the side chat agent,
  - does not send the prompt to the source terminal pane.

- **M4 · Explicit captured context**: The side chat prompt clearly states that the context is a bounded terminal transcript, not hidden agent memory. It includes source metadata such as project/workspace, tmux window, captured bytes, prompt byte budget, optional line count metadata, and truncation state.

- **M5 · Single-panel side terminal**: The side chat terminal reuses the existing terminal renderer but has exactly one terminal panel. It does not expose split controls, terminal tab creation, maximize controls, pin-to-canvas, or the normal terminal grid context menu.

- **M6 · Source-surface scope**: The side chat modal is scoped to the source terminal surface:
  - In center-stage terminals, it stays inside the current terminal pane area.
  - In Canvas terminals, it stays inside the current canvas terminal card/shape and cannot be dragged, resized, or otherwise moved onto the broader canvas.

- **M7 · Minimal side terminal header**: The side chat header contains only:
  - a title identifying it as a side chat,
  - a Hide action,
  - a Close action.

  Close destroys the side chat terminal using the existing terminal destroy/close path for tmux-backed terminal windows.

- **M8 · Hide and restore dots**: Hiding a side chat removes the modal and creates a small random bright colored dot next to the collapsed AI Input handle for that same source terminal surface. Clicking the dot restores that side chat. Each active side chat dot uses a unique color while it exists.

- **M9 · Multiple side chats**: Users can create more than one side chat from the same source pane. Active and hidden side chats remain independent from each other and from the source terminal.

- **M10 · Failure handling**: If Atmos cannot capture source context, cannot identify or select a runnable terminal agent, or cannot create the side terminal, it shows inline recoverable feedback near the composer and does not send partial input to the source terminal.

- **M11 · Localization**: All new user-facing labels, tooltips, inline errors, and descriptions are localized in every web locale file.

- **M12 · Side chat terminal identity**: Every side chat terminal has a stable unique side chat id and is identifiable as a side chat by Atmos agent hooks/status surfaces. Agent status panel rows and hook notifications can distinguish side chats from normal terminal panes and navigate to the matching open, hidden, or restorable side chat when its tmux window still exists.

- **M13 · Backend side chat registry persistence**: Atmos Server persists enough side chat metadata in the local runtime to restore side chat dots after route/context changes, browser/Desktop WebView reloads, and client switches when the side chat tmux window still exists. Browser storage may cache current UI state, but it is not the source of truth. Restoration must not store or replay captured transcript text, user prompts, or hidden agent memory. Full reload restoration should default surviving side chats to hidden dots rather than automatically opening modals.

- **M14 · Cleanup and parent cascade**: Closing a side chat destroys its side terminal, removes its persisted registry record, and removes its dot/modal UI. Closing or destroying the source parent terminal also closes and cleans up every side chat created from that source terminal. Startup and workspace reconciliation must remove stale side chat registry records whose side tmux window no longer exists, and must not retain closed side chats as history.

### Nice to Have

- **N1 · Capture preview**: Let users inspect or trim captured transcript before launching the side chat.
- **N2 · Agent override**: Let users pick a different terminal agent for the side chat even when the source pane agent is already detected.

## Out of Scope

- **Welcome composer support** — `/side` is intentionally absent before a workspace or terminal exists.
- **Forking hidden agent memory** — M1 only captures terminal-visible/tmux-retained output, not an agent's private conversation state or tool state.
- **Full terminal-grid management** — side chat terminals do not split, create tabs, pin to canvas, or participate in terminal layout preferences.
- **Canvas-global floating side chats** — Canvas terminal side chats are local to the source terminal card/shape, not free-floating canvas objects or app-level modals.
- **Hidden-dot activity badges** — running, unread, and permission states are already surfaced through agent hooks and the agent status panel. Side-chat dots are restore handles in M1, not a second status system.
- **Mobile UI** — M1 is web/desktop only.
- **Cloud history sync** — side chat registry metadata is local to the connected Atmos Server/runtime and backed by tmux, not synced user chat history.

## Success Metrics

- **Leading**: Users can launch a side chat from terminal AI Input without any text appearing in the source terminal.
- **Leading**: `/side` is discoverable in terminal AI Input and absent from New Workspace welcome composer.
- **Leading**: Hidden side chats can be restored from bright colored dots, with no duplicate dot colors among active side chats.
- **Leading**: Agent status panel navigation for a side chat restores or focuses the matching side chat while its tmux window still exists.
- **Leading**: Refreshing a workspace restores hidden dots for side chat tmux windows that still exist.
- **Reliability**: Closing a source terminal leaves no child side chat dots, backend registry records, or tmux windows behind.
- **Quality**: Internal dogfood reports fewer cases of "I accidentally polluted the main agent thread with a tangent."
- **Reliability**: Capture failures are recoverable and do not create empty or half-started side terminals.

## Risks & Open Questions

- **Risk**: Captured terminal output can contain secrets or noisy logs. The feature must bound capture size, avoid logging transcript content, and make the capture source explicit.
- **Risk**: Some terminal panes may not have a detected agent. M1 should open the existing terminal-agent picker/menu instead of guessing a wrong command, and only fail inline if no runnable agent can be selected.
- **Risk**: Hidden terminals can keep long-running processes alive. Close must be obvious and destructive enough to stop the side chat, and parent terminal close must cascade to all child side chats.
- **Risk**: Agent hook status rows currently navigate by normal terminal pane identity. Side chats need explicit identity metadata so status panel navigation does not route to a missing normal pane.
- **Risk**: Persisting too much side chat data can leak sensitive transcript or prompt content. M1 should persist backend metadata only and use tmux as the live process/source of terminal content.
- **Risk**: Backend registry records can grow without cleanup if close/cascade paths miss hidden side chats. M1 should keep the registry to active side chats only, remove records on close, and sweep stale records during reconciliation.
- **Open**: What is the maximum simultaneous side-chat count before the UI should force cleanup or reuse color families?
- **Open**: Should Phase 2 add capture preview/trim or selected-range capture for security-sensitive workflows?

## Milestones

- **Phase 1 · Terminal-only side chat**: `/side` slash entry, chip mode with compact popover, detected-agent reuse with picker fallback, byte-bounded tmux context capture, side-chat terminal identity, backend side-chat registry persistence, cleanup cascade, single-panel modal, Hide/Close lifecycle, hidden dots, localized copy, and core tests.
- **Phase 2 · Ergonomics**: Capture preview and agent override if dogfood shows the need.
