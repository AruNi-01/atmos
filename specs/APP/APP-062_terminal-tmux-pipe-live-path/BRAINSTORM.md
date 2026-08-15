# BRAINSTORM · APP-062: Terminal tmux pipe-pane live path

> Locked from the Athas comparison thread. Keep **tmux** as the session daemon. Do **not** dual-own the PTY.

## Problem

Control mode is the live path today:

```text
key  →  send-keys -H (hex text)  →  tmux
out  ←  %output (octal text)     ←  tmux
size →  resize-window + refresh-client -C
```

That codec + one `tmux -C` client per browser is why resize / typing / TUI wheels feel worse than Athas, even after frontend keep-alive, input coalesce, and resize dedup.

## Rejected

| Idea | Why not |
|------|---------|
| Drop tmux, API-owned `portable-pty` | Loses API-restart survival, `capture-pane`, multi-client attach by window name |
| Direct PTY + async tmux replica | UNIX 98 master is exclusive; `#{pane_tty}` is the slave |
| Steal `/proc/.../fd` of tmux's master | Second reader consumes the stream |
| Ghostty / `ghostty-web` first | Paint quality, not I/O latency |
| More coalesce on `send-keys` | Ceiling of the current protocol |

## Chosen direction

**tmux keeps the pane PTY. Live bytes move through one `pipe-pane -I -O` held by the API. Frontends are subscribers.**

Control mode is **not** a fallback. `tmux -C`, `send-keys -H`, `%output`, and per-browser `atmos_client_*` leave the live path entirely. Pipe attach failure is an error + retry, not a silent return to control.

See [PRD.md](./PRD.md) and [TECH.md](./TECH.md).
