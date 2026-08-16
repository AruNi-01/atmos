# TECH · APP-062: Terminal tmux pipe-pane live path

<!-- updated 2026-08-15: live loops live in PaneIoRegistry (io.rs), not a runtime.rs `run_pipe_pane_session` thread; mouse_mode_watch.rs is deleted -->

> HOW. Implements [PRD.md](./PRD.md). Amends the **live transport** in [ADR-004](../../../docs/adr/004-terminal-tmux-control-mode.md). Does **not** replace tmux as the session daemon.

Addresses M1–M11. N2 deferred. Client **ByteStreamPort** (N1 Phase 0–1) is [ADR-006](../../../docs/adr/006-terminal-client-byte-stream-port.md): desktop local renderer uses IPC; API still serves `/ws/terminal/:id`.

---

## Scope summary

Keep the APP-002 master session + named windows. Stop using a per-browser `tmux -C` client as the byte pipe.

```text
  KEEP                              REMOVE FROM LIVE PATH
  ────                              ─────────────────────
  tmux server / master window       send-keys -H  (hex)
  window name identity              %output octal decode
  capture-pane snapshot             atmos_client_* per WS
  resize-window + SIGWINCH          refresh-client -C / -r
  APP-043 opacity keep-alive        atmos_mousewatch_* -C
                                    run_control_mode_tmux_session
                                    ATMOS_TERMINAL_IO / IoMode
```

Desktop main↔API UDS is a later hop. Desktop **renderer** local attach uses Electron IPC (`ByteStreamPort`, ADR-006); API still serves the same `/ws/terminal/:id`. Control mode is not retained as a second transport.

---

## Architecture overview

Layers: `apps/web` (ByteStreamPort: WS or desktop IPC) → `apps/api` `/ws/terminal/:id` → `crates/core-service` pane I/O registry → `crates/core-engine` tmux `pipe-pane` + `resize-window`.

### Today (control mode)

```text
  ┌──────────┐   JSON+bin WS    ┌──────────┐   text proto    ┌──────────┐
  │  xterm   │ ◄──────────────► │ Atmos API│ ◄─────────────► │ tmux -C  │
  │  (N of)  │                  │  (N of)  │  send-keys -H   │  (N of)  │
  └──────────┘                  └──────────┘  %output \033   └────┬─────┘
                                                                  │ grouped
                                                                  ▼
                                                           ┌────────────┐
                                                           │ master pane│
                                                           │   PTY  ●   │
                                                           └────────────┘
```

Each browser pays a hex/octal codec and a control client. Two clients can fight `refresh-client -C`.

### Target (one pipe, N viewers)

```text
  ┌──────────┐                  ┌─────────────────────────┐
  │ xterm #1 │◄── WS binary ───►│                         │
  ├──────────┤                  │   Atmos API             │
  │ xterm #2 │◄── WS binary ───►│   PaneIoRegistry        │
  ├──────────┤                  │   (1 attachment / pane) │
  │ mobile   │◄── WS binary ───►│                         │
  └──────────┘                  └────────────┬────────────┘
                                             │ raw bytes
                                             │ pipe-pane -I -O
                                             ▼
                                    ┌────────────────┐
                                    │  helper (UDS)  │
                                    │  ┌──────────┐  │
                                    │  │  ← out   │  │
                                    │  │  → in    │  │
                                    │  └──────────┘  │
                                    └────────┬───────┘
                                             │
                                    ┌────────▼───────┐
                                    │  tmux pane     │
                                    │  PTY master ●  │  ← still only tmux
                                    │  window name   │
                                    └────────────────┘
```

```text
  legend
  ──────
  ●   PTY master (exclusive, lives in tmux)
  ○   PTY slave  (#{pane_tty}, not an I/O entry)
  ═   raw byte stream
  ─   JSON control (create / attach / resize / destroy)
```

tmux still `fdforkpty`s the pane. `pipe-pane` is a **copy after tmux reads**, plus a **write into the pane master**. It is not a second PTY.

---

## Decisions

| Fork | Pick | Why |
|------|------|-----|
| Live bytes | `pipe-pane -I -O` | Binary; one official pipe per pane |
| Who holds the pipe | API `PaneIoRegistry`, keyed by `{tmux_session}:{window_index}` | Frontends must not each call `pipe-pane` |
| Helper | `atmos` (or API exe) `--internal tmux-pipe-bridge <uds>` | No `socat` / `nc` dependency |
| UDS path | `~/.atmos/state/tmux-pipes/<safe-session>_w<index>.sock` | Fits [atmos-home-layout](../../../agents/references/runtime/atmos-home-layout.md) `state/` |
| Resize | `resize-window -t session:idx -x C -y R` only | No control client → no `refresh-client -C` |
| Reports | Write report bytes into the pipe as PTY input | Same as Athas; never `send-keys -H` or `refresh-client -r` |
| Mouse observe | APP-054 observer on every pipe chunk | Delete `atmos_mousewatch_*`; the pipe is the observer (stays after last WS, M4) |
| Fallback | **None** | M9: fail + retry re-pipe; window stays |
| Surfaces | Local, Computer / relay, mobile, canvas | Same `PaneIoRegistry` everywhere |
| WS | Keep `/ws/terminal/:id` | M10 |

---

## Module-by-module design

### crates/core-engine

New module `crates/core-engine/src/tmux/pipe.rs` (re-export from `tmux/mod.rs`).

```text
TmuxEngine
  attach_pane_pipe(session, window_index) -> PanePipeSpec
  detach_pane_pipe(session, window_index)   # pipe-pane with no command
  resize_window(...)                        # already exists
```

`attach_pane_pipe`:

1. Ensure `~/.atmos/state/tmux-pipes/` exists (mode 0700).
2. Build UDS path; unlink stale socket.
3. Bind + listen.
4. Run:

```text
tmux -S <atmos.sock> pipe-pane -t <session>:<idx>.0 -o -I -O -- \
  <current_exe> --internal tmux-pipe-bridge --uds <path>
```

`-o` = only open if none is open (lose the race → treat as “already attached”).

5. Accept exactly one UDS connection from the helper.
6. Return duplex: `AsyncRead` (pane output) + `AsyncWrite` (pane input).

Helper process (`--internal tmux-pipe-bridge`):

```text
  tmux --stdin(-O)══╗                    ╔══ UDS ══ Atmos API
                    ║  helper threads    ║
  tmux ◄──stdout(-I)╚════════════════════╝
```

- stdin → UDS (output)
- UDS → stdout (input), unbuffered
- exit when either side EOF

Unit-test the **framing-free copy** and the path sanitizer. Do not spawn tmux in unit tests; integration tests may if the runner has tmux.

Reuse: `resize_pane` / `resize-window` in `tmux/mod.rs`, `capture_pane_*` in `tmux/capture.rs`, mouse observe in `tmux/mouse_modes.rs`.

### crates/core-service

Extend `crates/core-service/src/service/terminal/`:

| Piece | Role |
|-------|------|
| `io.rs` (new) | `PaneIoRegistry`: one live pipe per key; tokio read/write on the UDS; mouse observe + run-log tee + fan-out |
| `runtime.rs` | Keep `run_simple_pty_session` for `mode=shell` only. Control-mode runner removed (no `run_pipe_pane_session` thread — the registry owns the live loops). |
| `types.rs` | Tmux sessions do not grow an `IoMode`. `SessionType::Tmux` means pipe I/O. |
| `mouse_mode_watch.rs` | Deleted. Pipe read loop owns DEC observation. |

`PaneIo` lifecycle:

```text
                  attach / first WS
                         │
                         ▼
                   ┌───────────┐
          ┌───────►│  opening  │
          │        └─────┬─────┘
          │ fail         │ UDS accepted
          │ (error to    ▼
          │  client, ┌───────────┐
          │  retry)  │   live    │── last observer gone ──► stay live (M4)
          │          └─────┬─────┘   (N2 may idle-tear later)
          │                │ destroy / pipe EOF + window gone
          │                ▼
          │          ┌───────────┐
          └──────────│  closed   │
                     └───────────┘
```

Commands from each WS session thread:

```text
Write(bytes)   →  write_all on the shared pipe (no hex)
Resize{c,r}    →  TmuxEngine::resize_window if grid changed
Report(bytes)  →  same write path as Write (PTY input)
Close          →  drop this observer; do not detach pipe
Destroy        →  detach pipe + kill-window (existing destroy)
```

Fan-out:

```text
  pipe read loop
       │
       ├─ observe_bytes (mouse) ─ persist @atmos_mouse_tracking
       ├─ maybe_bridge_run_log_output (APP-055)
       └─ broadcast to observer mpsc channels  ═► each WS
```

If broadcast lag exceeds a high watermark, drop that observer (kick the slow client) rather than stalling the pane. Same idea as Athas pause, but per subscriber.

`create_session` / `attach_session` in `terminal.rs`:

1. Resolve/create master window as today (names, `ATMOS_PANE_ID`, shims).
2. `registry.ensure(key)` — start pipe if missing.
3. Register this `session_id` as an observer; return that observer’s `output_rx`.
4. Snapshot via existing `capture_snapshot_after_attach` for remounts only.

Do **not** create `atmos_client_*` grouped sessions. Do not start a control client for I/O, reports, or mouse watch.

### apps/api

`apps/api/src/api/ws/terminal_handler.rs` and `apps/api/src/relay/terminal.rs`:

- No mode query param. Tmux-backed create/attach always uses the registry + pipe.
- On pipe failure: `TerminalError` (or equivalent). Do **not** spawn `tmux -C`. Retry is another attach, which `registry.ensure`s again.
- WS close → `close_session` (observer only).
- `terminal_destroy` → `destroy_session` (window + pipe).
- Input / resize / report handlers stay; service implementation changes.

No REST.

### apps/web / apps/mobile

Wire shapes in `packages/shared/src/terminal/protocol.ts` stay.

Frontend already:

- keep-alive via `atmos-terminal-panel-keepalive` (do not change)
- binary writes, input coalesce (APP-054)
- resize dedup before `terminal_resize`

No `io_mode` field. There is only pipe for tmux-backed sessions.

### crates/infra

No schema. No new `WsAction` on the main `/ws` kernel — terminal already has its own socket.

---

## Data model

```rust
pub struct PaneIoKey {
    pub tmux_session: String,
    pub window_index: u32,
}
```

`SessionType::Tmux` implies pipe I/O. `SessionType::Simple` is unchanged (`mode=shell`). No `TerminalIoMode` enum.

In-memory only. Durability is still the tmux window + `@atmos_mouse_tracking`.

---

## Transport

Unchanged client messages (`packages/shared` / `apps/web` types):

```text
  → terminal_input     { session_id, data }          // keys / paste
  → terminal_report    { session_id, data }          // OSC/DA/DSR replies
  → terminal_resize    { session_id, cols, rows }
  → terminal_destroy   { session_id }
  ← binary frame                                  // pane output
  ← terminal_attached  { ..., snapshot? }
```

Backend mapping:

```text
  terminal_input   ═►  UDS → helper stdout → pipe-pane -I → pane PTY
  terminal_report  ═►  same as input (not refresh-client -r)
  terminal_resize  ─►  resize-window (dedup)
  pane output      ═►  pipe-pane -O → helper stdin → UDS → WS binary
```

### Sequence: first attach

```text
  xterm          API              Registry           tmux
    │              │                  │                │
    │  WS open     │                  │                │
    │─────────────►│  ensure window   │                │
    │              │─────────────────►│  new-window?   │
    │              │                  │───────────────►│
    │              │  ensure pipe     │                │
    │              │─────────────────►│  pipe-pane -IO │
    │              │                  │───────────────►│
    │              │                  │◄══ UDS up ═════│
    │              │  capture-pane    │                │
    │              │─────────────────►│───────────────►│
    │  attached +  │                  │                │
    │  snapshot    │                  │                │
    │◄─────────────│                  │                │
    │              │                  │                │
    │  keys ═══════│══════════════════│═══════════════►│
    │  bytes ◄═════│◄═════════════════│◄═══════════════│
```

### Sequence: second client (same window)

```text
  xterm B         API              existing PaneIo
    │              │                    │
    │  attach name │                    │
    │─────────────►│  registry.get      │
    │              │───────────────────►│  already live
    │              │  add observer      │
    │  snapshot    │                    │
    │◄─────────────│                    │
    │  live ═══════│◄═══════════════════│  (no second pipe-pane)
```

### Sequence: hide / WS close / destroy

```text
  hide tab     : frontend opacity keep-alive; WS stays; pipe stays
  WS close     : observer removed; pipe stays; window stays
  destroy tab  : detach pipe-pane; kill-window; drop registry row
  API crash    : pipe dies; window + process stay; next attach re-pipes
```

```text
  API process                    tmux server
  ┌──────────────────┐           ┌─────────────────────┐
  │  PaneIo (RAM)    │  dies     │  master window      │
  │  helper          │  dies     │  shell / TUI  ●     │  lives
  └──────────────────┘           └─────────────────────┘
         next attach ── pipe-pane again ── snapshot ── live
```

---

## Security & permissions

- UDS under `~/.atmos/state/tmux-pipes/`, dir 0700, socket only accepts the helper we spawned.
- Helper is the Atmos binary with `--internal`; do not put the UDS path on a CLI users run by hand in docs as a shell.
- Terminal bytes may contain secrets; do not log payload. Log pane key and byte counts.
- Same workspace auth as today’s terminal WS.

---

## Rollout plan

1. **Engine**: `pipe.rs` + helper + unit tests for path sanitize / copy loop (no tmux).
2. **Service**: `PaneIoRegistry` + `run_pipe_pane_session`; mouse observe on pipe; stop `atmos_mousewatch_*`; create/attach never starts a control client.
3. **API + relay**: same pipe path for local and Computer. Pipe failure → error, not control.
4. **Delete live control path**: no callers of `run_control_mode_tmux_session` / grouped `atmos_client_*`. Parser/encoder in `tmux/control.rs` can be deleted in the same ship if unused, or in a tight follow-up cleanup — not kept as a transport.
5. Follow-up ADR note: ADR-004 live path replaced by pipe-pane; persistence model (master window + snapshot) unchanged.

Each step is mergeable. Do not ship a dual-stack “dark control” period.

---

## Risks & tradeoffs

| Risk | Mitigation |
|------|------------|
| `pipe-pane` already open (user, stale helper) | `-o`; on failure `pipe-pane` with empty command then retry once |
| Helper dies | Treat as pipe EOF; last observers get error; next attach re-pipes; window stays |
| Slow subscriber stalls the pane | Per-observer watermark; drop that WS |
| tmux intercepts OSC/DA so report-as-pipe-input is wrong | Dogfood; fix in-pipe (or a later IMP). Do **not** revive `tmux -C` as a sidecar |
| Multi-client resize tug | Last `terminal_resize` wins (same as today’s last `refresh-client -C`) |
| Pipe attach fails | Error + retry `registry.ensure`; window and process stay |

**Tradeoff:** one pipe means the API is the multiplexer. That is the point (M3). No second live protocol to compare against in production.

**Rollback:** revert the change-set. tmux windows are unchanged; next build re-pipes. There is no env kill-switch back to control.

---

## Dependencies & compatibility

- Depends on: APP-002 (window model), ADR-004 (snapshot + binary WS), APP-043 (keep-alive), APP-046 / APP-054 (mouse), APP-055 (run log tee).
- Blocks: none.
- External: tmux (already required). Needs `pipe-pane -I -O` (tmux 2.4+; Atmos already pins modern tmux).
- Does not require a new CLI feature-version pin unless the helper is invoked from a packaged desktop binary that is not the API — helper runs **in the API process tree**.

---

## Open questions

- [ ] N2 idle pipe tear timeout (suggested 15m, window stays). Not required to ship M1–M11.
- [ ] Whether leftover `tmux/control.rs` parser tests stay one PR or a delete-follow-up. Not a product fork.
