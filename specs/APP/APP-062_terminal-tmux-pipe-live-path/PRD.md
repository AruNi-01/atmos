# PRD · APP-062: Terminal tmux pipe-pane live path

> WHAT & WHY. Keep tmux persistence. Make the live byte path feel like a direct PTY.

## Problem

Users want Athas-like typing / resize / TUI feel **without** giving up tmux windows (refresh, API restart, `capture-pane`, canvas / side-chat / mobile attach by name).

Frontend keep-alive (opacity stack) is already shipped. The remaining gap is **tmux control-mode codec and per-browser clients**.

## Goals

1. Live input/output are raw bytes, not `send-keys -H` / `%output` octal.
2. One I/O attachment per tmux pane; N frontends fan out in Atmos API.
3. tmux remains the process owner. Close WS ≠ kill the window.
4. Existing attach identity (`tmux_window_name`) and capture APIs keep working.

## Must Have

| ID | Requirement |
|----|-------------|
| M1 | Master tmux session/window still owns the shell/TUI process. API restart can reattach by window name. |
| M2 | Every tmux-backed terminal (local, Computer / relay, mobile, canvas) uses `pipe-pane -I -O` as the **only** live I/O path. No `send-keys -H`, `%output`, or per-browser `tmux -C`. |
| M3 | At most one pipe per pane. Additional browser / mobile clients subscribe through the API, not a second `pipe-pane`. |
| M4 | WebSocket close or frontend hide detaches the observer only. The pipe and tmux window stay until destroy or last-idle policy. |
| M5 | Destroy still kills the tmux window, tears the pipe, and clears side-chat / agent-hook keys as today. |
| M6 | Resize pins the master window with `resize-window` and existing same-size dedup. No extra SIGWINCH when the grid is unchanged. |
| M7 | Keyboard / mouse / paste bytes go to the pane as PTY input (pipe stdin→pane). Emulator reports use the same pipe write, never `send-keys -H` or `refresh-client -r`. |
| M8 | DEC mouse observation runs on the pipe byte stream (APP-046 / APP-054 rules). Do not spawn `atmos_mousewatch_*` control clients. |
| M9 | Pipe attach failure does **not** fall back to control mode. The tmux window stays; the client gets a recoverable error and retry re-pipes. |
| M10 | Existing `/ws/terminal/:id` JSON control + binary output shapes stay. No new REST terminal API. |
| M11 | Snapshot / `capture-pane` still hydrates a remounted xterm. Hidden keep-alive panes do not remount. |

## Nice to Have

| ID | Requirement |
|----|-------------|
| N1 | Desktop local `ByteStreamPort` (UDS/IPC) instead of loopback WS — tracked in `docs/architecture/known-debt-client-transport.md`. Out of this ship. |
| N2 | Idle timeout that tears a pipe after no observers (window stays). |

## Non-scope

- Replacing tmux with `portable-pty` as the default persist layer.
- Dual live PTY + async tmux replica.
- Keeping a control-mode live path, `ATMOS_TERMINAL_IO` kill-switch, or `IoMode::{Pipe,Control}`.
- Switching the renderer to Ghostty / `ghostty-web`.
- Changing opacity keep-alive / warm frame policy (APP-043).
- Rewriting terminal chrome, agent overlay, or side chat UI.
- `mode=shell` simple PTY (install dialogs) stays as today; it is not control mode.

## Success

Dragging a split with an inline mouse TUI (Grok-class) or alt-screen agent updates size without hex/octal control-mode chatter; typing and wheel reports stay on the raw pipe; refresh-after-API-up still attaches the same tmux window.
