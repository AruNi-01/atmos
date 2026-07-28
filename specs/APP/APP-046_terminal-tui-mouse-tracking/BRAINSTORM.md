# APP-046 · Terminal TUI Mouse Tracking — BRAINSTORM

> Restore full mouse interaction (click **and hover**) for fullscreen / inline TUI apps (Claude, Grok, …) inside Atmos’s xterm.js + tmux terminal after reattach.

Related: [APP-002 Terminal Multiplexing](../APP-002_terminal-multiplexing/TECH.md), [APP-003 Dynamic Title](../APP-003_web-terminal-dynamic-title/TECH.md), [APP-025 Mobile App](../APP-025_mobile-app/TECH.md) (shared snapshot helpers), [APP-036 Grok Build](../APP-036_grok-build-cli-support/PRD.md).

---

## 1. Problem

Atmos terminals are **not** a continuous native emulator like Ghostty:

```
browser xterm.js  ←WS→  API control client  ←→  tmux pane  ←→  TUI
```

`capture-pane` hydrates **cells only**. DEC private modes (mouse tracking) are lost on reattach / refresh. Earlier Atmos re-injected a fixed sequence:

```text
CSI ? 1000 h  +  1002 h  +  1006 h
```

In xterm.js, `1000` / `1002` / `1003` are **exclusive** (last enable wins). That sequence leaves the protocol in **DRAG**:

| Mode | Protocol | Click | Drag | Hover (no button) |
|------|----------|-------|------|-------------------|
| 1000 | VT200 | ✓ | — | — |
| 1002 | DRAG | ✓ | ✓ | — |
| 1003 | ANY | ✓ | ✓ | ✓ |

Result: users could click TUI menus, but **hover popovers / row highlight never fired**. Ghostty never hits this because it keeps terminal mode state for the life of the PTY.

Shell choice (zsh / fish / bash) is irrelevant — only the TUI’s DECSET and reattach restore matter.

## 2. Goals

1. Click **and** hover work in Claude / Grok-class TUIs after first open and after reattach.
2. Prefer **what the app actually enabled**, not a permanent “always full mouse” guess.
3. Do **not** steal wheel scrollback from idle shells or non-mouse processes (`npm run dev`, …).
4. Independent of user shell; mobile/web share the same restore payload rules.

## 3. Options

| Option | Idea | Pros | Cons |
|--------|------|------|------|
| A | Always inject `1000+1002+1003+1006` on alt-screen / Grok whitelist | Simple; fixes hover | Over-enables for apps that only used 1002; wrong if app disabled mouse |
| B | Track DEC mouse modes on the live stream; persist on the pane; restore exact sequence; heuristic only when never observed | Closest to Ghostty fidelity under tmux reattach | More code; first attach still needs heuristic |
| C | Frontend-only track via xterm `onProtocolChange` | Accurate while tab open | Lost on full refresh unless also persisted |

**Choice: B** (with full default including 1003 as the unobserved fallback = A as fallback only).

## 4. Key design choices

| Decision | Choice | Why |
|----------|--------|-----|
| Where to observe | Control-mode `%output` after DCS passthrough unwrap | Same bytes the TUI sends; survives as long as a client is attached long enough to see DECSET |
| Where to persist | tmux pane option `@atmos_mouse_tracking` (`any+sgr`, `button+sgr`, `none`, …) | Survives WS close / new control client; same pattern as `@atmos_*` metadata |
| First attach never observed | Heuristic: alternate screen **or** inline mouse TUI whitelist (`grok` / `grok-*`) → default sequence **with 1003** | Best effort without DECRQM to a dead xterm |
| Observed `none` | Do **not** restore, even on alt-screen | App intentionally disabled mouse |
| Init suppress window | Still observe mouse modes while suppressing visual `%output` | Apps often re-DECSET on SIGWINCH from attach resize |
| CMD_START inject (Grok) | Keep belt-and-suspenders full ENABLE including 1003 | Reattach title inject path; must not reintroduce DRAG-only |
| Shell shim | Unchanged; not required for mouse restore main path | Titles still use OSC 9999 |

## 5. Non-goals

- Pixel mouse (`1016`) as a first-class product requirement (supported if observed, not required).
- Emulating Ghostty’s full VT state machine beyond mouse modes.
- Enabling mouse for every non-shell process.
- Querying the TUI over a new REST API.

## 6. Open questions (resolved in TECH)

- ~~Persist format~~ → compact string `event[+format][+focus]` (`any+sgr`, `none`).
- ~~Default sequence contents~~ → `1000h 1002h 1003h 1006h`.
- ~~Inline whitelist~~ → keep Grok-only (versioned basenames).
