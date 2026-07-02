# Brainstorm · APP-030: Terminal Side Chat

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Terminal agents are long-running, context-heavy sessions. Users often want to ask a side question, validate a tangent, or continue a lightweight chat from the current terminal output without adding that tangent to the main terminal agent's prompt history. Atmos already has a floating terminal AI Input and tmux-backed terminal persistence, so the natural product shape is a slash-command-driven side chat that captures visible terminal context and opens a separate, temporary terminal conversation.

The feature should exist only inside an existing terminal context. The New Workspace welcome composer intentionally has no source terminal pane to fork from, so it should not surface `/side`.

## Goals (draft)

- Let users start a side chat from the current terminal agent without sending the prompt into the current terminal.
- Make the fork explicit: the side chat is seeded by a bounded tmux transcript, not by hidden agent memory.
- Keep the side chat UI lightweight: one terminal panel, no split/tab/grid management.
- Let users hide and restore side chats as small colored dots near the collapsed AI Input handle.
- Avoid adding a new REST path for an interactive terminal workflow.

## Options

### Option A — Terminal AI Input `/side` mode with side terminal modal

The user types `/side`, selects it from the terminal AI Input slash menu, sees a `/side` chip, then types the side prompt. Submit captures the current tmux pane transcript, builds a side-chat prompt, launches a new tmux-backed terminal for the same agent, and shows it in a modal with only Hide and Close controls.

**Pros**: matches the user's mental model; keeps side chats close to the source pane; reuses existing terminal transport; no main-agent pollution.
**Cons**: needs careful capture bounds and prompt construction; requires a custom single-panel terminal shell instead of the full TerminalGrid.
**Unknown**: how large the byte budget should be by default; whether users need a preview before sending.

### Option B — Agent Chat modal seeded from terminal transcript

Instead of launching a terminal, Atmos opens the existing Agent Chat modal and sends a transcript-backed first message into ACP/native chat.

**Pros**: likely easier UI lifecycle; existing chat history concepts may help persistence.
**Cons**: does not give "all agent CLIs get side chat" behavior; may bypass terminal-agent-specific prompt delivery and auth; weaker fit for custom CLI agents.
**Unknown**: whether every terminal agent has a compatible non-terminal chat channel.

### Option C — Side pane inside the main terminal grid

`/side` creates another split pane in the current terminal grid, runs the side chat there, and optionally collapses it later.

**Pros**: uses existing grid/split lifecycle; no modal surface.
**Cons**: side chat is visually mixed with productive terminal work; split controls stay too available; hidden/minimized side chats become harder to discover; more likely to disturb existing layout.
**Unknown**: whether users want side chats to participate in normal terminal layout history.

## Key forks in the road

- **Slash command source**: Terminal AI Input only vs shared welcome slash commands — decide in PRD. Current direction: terminal only.
- **Capture source**: backend tmux capture vs frontend xterm buffer — decide in TECH. Current direction: backend tmux capture, because it survives scrollback and detached panes.
- **Capture shape**: raw ANSI snapshot vs plain text transcript — decide in TECH. Current direction: plain text, with byte budgets as the canonical limit and line counts as metadata only.
- **Terminal shell**: reuse full `TerminalGrid` vs single `Terminal` wrapper — decide in TECH. Current direction: single `Terminal` wrapper with no mosaic/grid controls.
- **Overlay scope**: global app modal vs source-surface-scoped modal — decide in PRD / TECH. Current direction: scoped to the source terminal surface; Canvas terminals cannot move the modal outside the terminal card/shape.
- **Hidden lifecycle**: keep terminal mounted while hidden vs detach and reattach by tmux window name — decide in TECH. Current direction: detach visual component and reattach on restore using tmux snapshot.
- **Persistence**: restore side-chat dots after page reload and context switches. Current direction: persist active side-chat metadata in the local Atmos Server backend registry, with tmux window options as the runtime discovery fallback. Browser storage is not the source of truth.

## Resolved decisions from review

- `/side` chip hover/focus shows a compact popover with source terminal metadata, detected agent state, and capture byte budget. It does not render the full transcript because the transcript can be long and sensitive.
- `/side` follows the source terminal's detected agent, reusing the same detection path used by the terminal header. If no agent is detected at submit time, Atmos opens the existing terminal-agent picker/menu before launching the side chat.
- Capture budgets use standard byte counts as the public/API contract. tmux can still be read through line-oriented commands internally, but the final prompt payload is bounded by bytes.
- Hidden side-chat dots use random bright/light colors and remain unique among active side chats.
- Hidden dots do not need their own running/unread indicator in M1. Agent hooks already drive notifications and status state when a CLI has hook integration.
- Side chat terminals need explicit identity metadata so agent hook notifications, the agent status panel, and jump-to-terminal behavior can distinguish a side chat from a normal terminal pane.
- Side chat terminals should persist as discoverable UI handles across route/context changes, browser/Desktop WebView reloads, and client switches while their tmux windows still exist. Persist metadata only in the local backend runtime; never persist captured transcript or user prompt text.
- Closing a side chat removes its backend registry record and destroys its side tmux window. Closing the source parent terminal cascades to every side chat created from that source and cleans those registry records as part of the parent terminal lifecycle.

## Open questions

- [ ] Should Phase 2 add a full capture preview/trim flow for security-sensitive workflows?
- [ ] What is the maximum simultaneous side-chat count before the UI should force cleanup or reuse color families?

## References

- Existing AI Input: `apps/web/src/features/terminal/components/TerminalAgentInputOverlay.tsx`
- Shared composer slash infra: `apps/web/src/features/welcome/components/PromptComposer.tsx`, `apps/web/src/features/welcome/hooks/use-welcome-slash-search.ts`
- Terminal rendering: `apps/web/src/features/terminal/components/Terminal.tsx`
- Full terminal grid to avoid for side chat controls: `apps/web/src/features/terminal/components/TerminalGrid.tsx`
- Terminal websocket handler: `apps/api/src/api/ws/terminal_handler.rs`
- Terminal app WS router: `apps/api/src/api/ws/router/terminal.rs`
- Terminal service: `crates/core-service/src/service/terminal.rs`
- Tmux capture: `crates/core-engine/src/tmux/capture.rs`
- Related specs: `APP-002_terminal-multiplexing`, `APP-015_canvas-terminal-agent-integration`, `APP-024_terminal-agent-run-config`

## Ready to promote

- Promote to PRD: `/side` is available only from terminal AI Input, not from New Workspace welcome composer.
- Promote to PRD: selecting `/side` shows a chip, then submit creates a separate side chat terminal instead of sending the prompt to the source terminal.
- Promote to PRD: side chat modal has one terminal panel, Hide and Close controls only, no split/tab/context-menu/hotkey management.
- Promote to PRD: Canvas terminal side chat is constrained to the current terminal card/shape and cannot be moved outside that source terminal area.
- Promote to PRD: hidden side chats become unique random bright colored dots next to the collapsed AI Input handle.
- Promote to PRD: if the source terminal agent is unknown, submit opens the existing agent picker/menu instead of guessing.
- Promote to PRD: side-chat dots restore after reload/context switch when the side tmux window still exists, using backend local registry metadata rather than browser-only persistence.
- Promote to PRD: closing the source parent terminal closes and cleans every child side chat created from that source.
- Promote to TECH: use backend tmux capture with byte-bounded plain text transcript and source metadata.
- Promote to TECH: side chat should use the existing `Terminal` component directly, not the full `TerminalGrid`.
- Promote to TECH: side chat terminal creation injects side-chat identity env such as side-chat kind and a unique side-chat id, then agent hook status/navigation carries that id through to the UI.
- Promote to TECH: persist side-chat metadata through a backend local registry plus tmux window options; do not persist prompts/transcripts.
- Promote to TECH: reconciliation treats tmux windows as the live-process source of truth and removes backend registry records for missing side tmux windows.
