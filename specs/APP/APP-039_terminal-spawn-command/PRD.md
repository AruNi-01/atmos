# PRD · APP-039: Terminal `/spawn` Command

> Product Requirements · WHAT and WHY. A terminal AI Input slash command that spawns a
> new terminal panel seeded with the current terminal agent's context.

## Context

- **Problem**: `/side` (APP-030) forks terminal context into an ephemeral side-chat modal.
  Users also want to continue from the same context in a **durable, first-class terminal
  panel** that behaves like any other pane in the grid.
- **Why now**: The `/side` capture + prompt-building + agent-selection pipeline already
  exists and can be reused with a different delivery target.
- **Product direction**: `/spawn` is a terminal-only slash command. It captures a bounded
  transcript from the current tmux pane (same rules as `/side`), then opens a new terminal
  pane in the mosaic grid running the selected agent with that context.
- **Related specs**:
  - [APP-030 Terminal Side Chat](../APP-030_terminal-side-chat/PRD.md) — the sibling command it mirrors.
  - [APP-002 Terminal Multiplexing](../APP-002_terminal-multiplexing/TECH.md) — the mosaic grid / pane model.
  - [APP-024 Terminal Agent Run Config](../APP-024_terminal-agent-run-config/TECH.md) — the run-plan builder reused here.
  - [APP-033 Terminal Custom Naming](../APP-033_terminal-custom-naming/TECH.md) — the custom-label title mechanism reused for the pane title.

## Users & Scenarios

1. A user is running an agent in a terminal. They open AI Input, select `/spawn`, type
   "investigate the failing migration", and press Enter. A **new terminal pane** appears in
   the grid, running the same agent, seeded with the recent terminal transcript. The pane is
   titled `investigate the failing mig · By Spawn`.
2. A user runs `/spawn` from a terminal that has no detected agent. The agent picker appears;
   after they pick an agent, the new pane spawns.
3. A user opens the New Workspace welcome composer. `/spawn` does not appear, because there is
   no source terminal to fork from.
4. A user runs `/spawn` from a project-wiki / code-review scoped terminal. `/spawn` is not
   offered there (default terminal grid only).

## Must Haves

| ID | Requirement |
|----|-------------|
| M1 | `/spawn` appears in the terminal AI Input slash menu alongside `/side`, only when a source terminal agent surface can provide it. |
| M2 | Selecting `/spawn` inserts a distinct chip (labeled "Spawn") in the composer, backed by an `atmos://spawn/<contextId>` protocol token — not raw `/spawn` text. |
| M3 | Submitting captures the source terminal context using the **same rules/budgets as `/side`** and builds the same style of prompt. |
| M4 | Submitting opens a **new terminal pane** in the current mosaic grid (never a modal, never reuse of an existing pane) running the selected agent with the captured-context prompt. |
| M5 | Agent selection matches `/side`: follow the source terminal's detected agent; if none, show the agent picker before spawning. |
| M6 | The spawned pane title uses the first **24** characters of the user's prompt (whitespace-collapsed) followed by ` · By Spawn` as its **custom label**, and — like Rename terminal — keeps the Agent-name and current-directory suffixes on by default, so the display reads `<head> · By Spawn · <agent>` (or `· <cwd>` when no agent is running). The custom-label portion stays pinned regardless of the agent's dynamic OSC title. |
| M7 | Pasting or typing prose that merely contains the text `/spawn` does not trigger the command; only the resolved protocol token does. |

## Non-Goals

- No hidden-dot / restore / persistence UI (that is `/side` modal behavior; a spawned pane
  is just a normal pane and persists via the existing pane lifecycle).
- No backend schema or REST changes. Context capture reuses the existing side-chat capture WS API.
- No `/spawn` support inside project-wiki / code-review scoped grids, canvas terminal cards, or mobile.
- No localized re-wording of the reused capture prompt for spawn (rules intentionally match `/side`).

## Success

- A user can go from "I have context in this terminal" to "a new titled terminal pane
  continuing that context" in one slash command, with the same feel as `/side`.
