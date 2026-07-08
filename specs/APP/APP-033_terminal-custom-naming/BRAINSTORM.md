# APP-033 · Terminal Custom Naming — BRAINSTORM

> Scope: let users manually name terminal **tabs** and terminal **panes**, with the custom name taking top display priority and persisting across refresh.

---

## 1. Problem

Terminal tabs and panes are named automatically today:

- **Tab** title comes from `getNextTerminalTabTitle` / `getUniqueTerminalTabTitle` (`Term`, `Terminal 2`, ...) or the fixed tab label `Term`.
- **Pane** title is derived by `getTerminalDisplayMeta` from three signals: the detected agent label, the dynamic OSC title (running command / CWD), or the base `label`.

When a user runs several agents/panes in parallel, the auto names are ambiguous ("which pane is my review agent?"). There is no way to pin a human-friendly name, and any manual mental mapping is lost on refresh.

## 2. Goal

- Custom name is the highest-priority display source for both tabs and panes.
- Empty custom name == "no override" == fall back to today's behavior (also the way to *delete* a custom name).
- For panes, the user can optionally still surface the auto agent icon/name and/or the CWD **after** the custom name, via two toggles.
- Everything persists to the existing terminal layout document so a browser refresh restores it.

## 3. Key design choices

| Decision | Choice | Why |
|----------|--------|-----|
| Store custom name separately from the auto name? | **Yes.** Add `customTitle` (tab) and `customLabel` (pane) alongside existing `title` / `label`. | `label`/`title` are load-bearing: `label` derives the tmux window name and pane-name uniqueness; `title` drives tab dedup. Custom naming must be display-only and never touch tmux identity. |
| Where does the pane display decision live? | Extend `useTerminalToolbarTitle`, keep `getTerminalDisplayMeta` unchanged for the auto path. | The hook already has the pane's live fields; custom-name composition is a UI concern, not a shared-title-algorithm concern. |
| Toggle semantics | `keepAgentName` and `keepCwd` only matter **when a custom name is set**. Without a custom name, the auto path already shows agent/CWD. | Avoids a confusing no-op state. |
| Toggle defaults | Default **on**: when the user opens the rename input, both Keep Agent Name and Keep CWD are checked. | A named pane should still keep its familiar agent/CWD context by default; users opt out per pane if they want a pure custom name. |
| Agent vs CWD | **Mutually exclusive** — agent wins over CWD, matching today's `getTerminalDisplayMeta`. Never show both. | Consistency with the existing auto title (agent label already suppresses the dynamic CWD/command title). |
| Empty string | Saving `""` (after trim) clears the override. | Matches the workspace rename UX ("empty == unset") the user already expects. |

## 4. Open questions

- OQ-1: When `keepAgentName` is on, do we show the agent **icon + label** or just the icon next to the custom name? Leaning icon + label to match today's toolbar. (Resolved in PRD: icon + label.)
- OQ-2: Should a custom **tab** name also get a "keep agent/CWD" style toggle? No — tabs have no single agent/CWD; keep tab naming to a pure override. (Resolved: tab = pure override.)
- OQ-3: Length cap for custom names? Reuse the existing tab cap (40 chars, see `getUniqueTerminalTabTitle`). (Resolved: 40 chars, trimmed, collapse whitespace.)

## 5. Non-goals

- No server/tmux window rename — custom naming is display-only.
- No sync of custom names into the shell prompt or OSC title.
- No custom naming for Project Wiki / Code Review scoped panes in v1 (only the main workspace terminal grid + tabs).
