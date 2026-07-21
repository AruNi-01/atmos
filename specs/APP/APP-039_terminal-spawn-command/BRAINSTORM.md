# BRAINSTORM · APP-039: Terminal `/spawn` Command

## Problem

The terminal AI Input already has a `/side` command (APP-030) that forks the current
terminal's captured context into an isolated **side-chat modal**. Sometimes the user
does not want an ephemeral side conversation — they want a **first-class terminal panel**
that starts from the same context and lives in the normal terminal grid, so it can be
split, maximized, pinned, and kept around like any other pane.

## Goal (draft)

Add a `/spawn` slash command to the terminal AI Input that:

- Reuses the source terminal agent's captured context, using the same capture rules as `/side`.
- Opens a **new terminal panel** in the mosaic grid (not a modal) and runs the chosen agent there.
- Names the spawned pane after the user's prompt: first fixed number of characters + ` · By Spawn`.

## Options

### Option A — Reuse the `/side` pipeline, redirect delivery to a new pane (chosen)

Add `/spawn` next to `/side` in the same slash menu. It shares the protocol-token +
context-capture + prompt-building + agent-selection machinery, but instead of creating a
side-chat record + modal, it hands the built `PendingTerminalRun` to the terminal grid's
existing "add pane and run" path.

**Pros**: maximum reuse; identical UX/rules to `/side`; no new transport; no backend change.
**Cons**: `/spawn` and `/side` share overlay state, so the agent selector code must branch on command kind.

### Option B — Standalone command with its own hook and protocol

A fully separate `useTerminalSpawn` hook and `atmos://spawn/` protocol with duplicated
capture/prompt logic.

**Pros**: clean separation.
**Cons**: duplicates ~200 lines of capture/prompt/agent logic; drifts from `/side` over time.

## Decision

Option A. The user explicitly asked for the rules to match `/side`, so sharing the
capture + prompt pipeline is the right call. Only the delivery target differs
(new mosaic pane vs side-chat modal).

## Open questions (resolved)

- **Title length** → fixed `24` characters of the prompt head, then ` · By Spawn`
  (fits within the 40-char custom-label cap).
- **Which agent** → same as `/side`: follow the source terminal's detected agent, and
  fall back to the agent picker when none is detected.
- **Scope** → default-scope terminal grid only. Project-wiki / code-review scoped panes
  do not surface `/spawn` (their pane windows do not pass `onSpawn`).
