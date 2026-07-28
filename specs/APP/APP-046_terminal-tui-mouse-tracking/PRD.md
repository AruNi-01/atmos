# PRD · APP-046: Terminal TUI Mouse Tracking

> Product Requirements · WHAT and WHY. Full mouse interaction (including hover) for agent / fullscreen TUIs in Atmos terminals across reattach.

## Context

- **Problem**: Users can click inside Claude / Grok-class fullscreen TUIs in Atmos, but hover-driven UI (row highlight, popovers, tooltips) does not work — especially after refresh or workspace reattach. Native terminals (e.g. Ghostty) do not show this gap.
- **Why now**: Click was partially restored via re-injected DEC mouse modes, but the restore sequence omitted any-motion (`1003`), so xterm stayed in drag-only protocol. Agent TUIs increasingly depend on hover.
- **Related specs**:
  - [APP-002 Terminal Multiplexing](../APP-002_terminal-multiplexing/TECH.md) — tmux + reattach model
  - [APP-003 Web Terminal Dynamic Title](../APP-003_web-terminal-dynamic-title/TECH.md) — OSC / CMD_START reattach path
  - [APP-025 Mobile App](../APP-025_mobile-app/TECH.md) — shared snapshot restore helpers
  - [APP-036 Grok Build CLI Support](../APP-036_grok-build-cli-support/PRD.md) — inline mouse TUI without always using alt-screen

## Goals

1. **Primary**: In Atmos web (and mobile terminal surfaces that share restore helpers), TUI hover and click behave like a native terminal for Claude / Grok-class apps after open and after reattach.
2. **Secondary**: Restore the modes the app actually enabled when known; avoid turning on mouse tracking for idle shells and non-mouse workloads so local scrollback stays usable.

## Users & Scenarios

- **Primary persona**: Agentic Builder running Claude Code / Grok Build / similar fullscreen TUI inside an Atmos terminal pane.
- **Key scenarios**:
  1. User opens Claude, hovers a list row or control, sees highlight / popover, clicks to activate.
  2. User refreshes the browser or switches workspace and reattaches; hover still works without restarting the TUI.
  3. User runs Grok (inline / non-alt-screen mouse TUI); mouse is available without enabling mouse for unrelated processes in other panes.
  4. User is at a shell prompt or runs `npm run dev`; wheel still scrolls xterm history, not “eaten” by phantom mouse mode.

## User Stories

- As a terminal-agent user, I want hover feedback in my TUI, so that menus and lists match the experience in Ghostty / iTerm.
- As a terminal-agent user, I want that behavior to survive refresh and reattach, so that I do not have to restart long-running agents.
- As a multi-pane user, I want mouse tracking only when a TUI needs it, so that normal scrollback remains available.

## Functional Requirements

### Must Have

- **M1 · Hover + click for alt-screen TUIs**: Fullscreen TUIs on the alternate screen support click and hover (any-motion) when the app enables them, including after snapshot hydrate.
- **M2 · Exact restore when observed**: When Atmos has observed the app’s DEC mouse modes on the live stream, reattach restores that effective protocol (event mode + encoding), not a weaker subset that drops hover.
- **M3 · Safe unobserved fallback**: When modes were never observed (first attach to an already-running TUI), restore uses a complete default that includes any-motion (`1003`) and SGR (`1006`) for alt-screen or known inline mouse TUIs (Grok family).
- **M4 · Inline mouse TUI (Grok)**: Grok / versioned `grok-*` binaries can get mouse restore even without alt-screen.
- **M5 · No false enable on idle / non-mouse processes**: Idle shells and arbitrary non-shell processes without observed mouse modes do not get mouse tracking forced on.
- **M6 · Observed disable respected**: If the stream showed the app disable mouse tracking, reattach does not force mouse back on solely because the pane is still on the alternate screen.
- **M7 · Shell-agnostic**: Behavior does not depend on the user’s login shell (zsh / fish / bash / …).
- **M8 · Shared restore contract**: Web and mobile share the same snapshot fields / restore payload rules for mouse tracking.

### Nice to Have

- **N1 · Focus events (`1004`)** when observed (already representable in persist/restore).
- **N2 · SGR-pixels (`1016`)** when observed.
- **N3 · Explicit user toggle** to force-disable TUI mouse reporting (Ghostty-style `mouse-reporting = false`) — not required for M1–M8.

## Out of Scope

- Replacing tmux with a single long-lived native emulator process.
- Full VT mode persistence beyond mouse-related DECSET (bracketed paste, etc. remain as today).
- Expanding the inline mouse TUI whitelist beyond Grok without a separate decision.
- New REST endpoints for mouse mode (WebSocket + snapshot only).

## Success Metrics

- Leading: After reattach to Claude/Grok, hover highlight / popover works without restarting the process.
- Lagging: No increase in “dead wheel scrollback” reports on idle panes.
- Qualitative: “Atmos mouse feels like Ghostty for agent TUIs.”

## Risks & Open Questions

- **Risk**: Unobserved first attach still uses a heuristic default; rare apps that only want 1002 may receive 1003 until observed. Acceptable; extra motion is usually ignored.
- **Risk**: Mode observation requires at least one control client to have seen DECSET; cold attach to a long-running TUI that never re-sends modes uses the heuristic (with 1003).
- **Open (N3)**: Product toggle to force-disable mouse reporting — defer.

## Milestones

- **Phase 1 (shipped with this spec)**: M1–M8 — observe, persist, exact + heuristic restore, shared client contract, tests.
- **Phase 2**: N1–N3 as needed.
