# TEST · APP-062: Terminal tmux pipe-pane live path

> Test Plan · prove pipe-pane live I/O while tmux still owns the pane. References [PRD.md](./PRD.md) and [TECH.md](./TECH.md).

## Test strategy

Deterministic coverage lives in `core-engine` (pipe helper / path / resize dedup helpers) and `core-service` (registry lifecycle, fan-out, destroy vs close). API/WS tests cover attach and **pipe-fail-as-error** (no control fallback). Frontend keep-alive is already APP-043; this spec does not re-test opacity stacking except as a regression check.

Playwright is optional for one attach/type/resize journey if a tmux-capable e2e fixture exists; do not block the spec on a full TUI dogfood harness.

Agent-browser can smoke the visible terminal, but cannot prove UDS/pipe ownership.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 tmux still owns process | S3, S8, S9 |
| M2 pipe is the only live path | S1, S2, S12, S21 |
| M3 one pipe, N observers | S4, S5 |
| M4 WS close keeps window + pipe | S6 |
| M5 destroy kills window + pipe | S7 |
| M6 resize-window + same-size skip | S10, S11 |
| M7 raw input, no send-keys -H | S2, S13 |
| M8 mouse observe on pipe; no mousewatch | S14, S15 |
| M9 no control fallback | S16 |
| M10 existing WS shapes | S1, S17 |
| M11 snapshot on remount only | S8, S18 |
| N1 Desktop UDS | non-coverage |
| N2 idle tear | non-coverage |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Service / WS | `cargo test -p core-service` / `cargo test -p api` | `TBD by test-run` | fake/real tmux socket | attach succeeds; `PaneIo` live | planned |
| S2 | Rust unit | `cargo test -p core-engine` | encode/copy helpers | bytes with NUL / ESC | copy is identity; no `send-keys` / no octal | planned |
| S3 | Service | `cargo test -p core-service` | `TBD by test-run` | tmux window + fake API drop | window still `has-session` / listed | planned |
| S4 | Service | `cargo test -p core-service` | PaneIoRegistry | two observers one key | one `pipe-pane` invoke | planned |
| S5 | Service | `cargo test -p core-service` | fan-out | one write to pipe | both observers receive same bytes | planned |
| S6 | Service | `cargo test -p core-service` | close_session | live pipe + observer | observer gone; pipe key remains; window lives | planned |
| S7 | Service | `cargo test -p core-service` | destroy_session | live pipe | window gone; registry key gone; pipe-pane cleared | planned |
| S8 | Service | `cargo test -p core-service` | re-attach after API handle drop | existing window name | new pipe; snapshot present; process pid same if measurable | planned |
| S9 | Integration | `cargo test -p core-engine` or service | `TBD by test-run` | real tmux if available | `#{pane_pid}` unchanged across re-pipe | planned |
| S10 | Rust unit | `cargo test -p core-service` | resize dedup | same cols/rows twice | second call does not invoke tmux | planned |
| S11 | Service | `cargo test -p core-service` | resize | 80x24 → 120x40 | `resize-window` once; no `refresh-client -C` | planned |
| S12 | Structural | grep / unit | runtime write path | tmux create/attach | Write path does not call `encode_send_keys_hex_commands` | planned |
| S13 | Structural | grep / unit | report path | tmux session | Report is pipe write, not `refresh-client -r` | planned |
| S14 | Rust unit | `cargo test -p core-engine` | mouse observe on chunk | DECSET in pipe bytes | `@atmos` persist hook fired / state active | planned |
| S15 | Service | `cargo test -p core-service` | mouse watch skip | pipe live | no `atmos_mousewatch_*` started | planned |
| S16 | Service | `cargo test -p core-service` or api | pipe attach fail | bind fail / tmux error | `TerminalError`; no `tmux -C`; window still listed | planned |
| S17 | Bun / structural | `bun test` or read | protocol types | shared protocol | no new REST; existing message tags remain | planned |
| S18 | Bun / structural | read Terminal.tsx | keep-alive | n/a | hide path does not dispose xterm (APP-043 still true) | planned |
| S19 | E2E | Playwright | `just test-e2e -- tests/specs/APP-062_terminal-tmux-pipe-live-path.e2e.ts` | local app + tmux | type echo; resize; no crash | planned |
| S20 | agent-browser | `agent-browser` | exploratory | local app + tmux | type, split drag, no console WS errors | planned |
| S21 | Structural | grep | create/attach/relay | `terminal.rs` / `runtime.rs` / relay | no live call to `run_control_mode_tmux_session` | planned |

## Scenarios

### S1 — Happy path: create uses pipe

- **Level**: Service / WS
- **Given**: tmux available (or a stub that records `pipe-pane`).
- **When**: the API creates a workspace terminal session with a fitted cols/rows.
- **Then**: the session is `SessionType::Tmux`; a `PaneIo` exists for that window; client receives attach and binary output, not `%output` text lines.
- **Signals**: registry key present; no `atmos_client_*` session created.

### S2 — Input/output are raw bytes

- **Level**: Rust unit
- **Given**: a helper copy loop and a buffer containing `a`, `0x00`, `ESC[?1000h`.
- **When**: bytes are copied stdin→UDS and UDS→stdout.
- **Then**: output equals input; nothing is hex-encoded or octal-escaped.
- **Signals**: byte-equal assert.

### S3 — API handle death does not kill the window

- **Level**: Service
- **Given**: a live pipe session on window `3`.
- **When**: the `PaneIo` / helper is dropped without `kill-window` (simulates API crash).
- **Then**: `list_windows` still contains `3`.
- **Signals**: tmux list or engine stub `kill_window` not called.

### S4 — Second attach does not open a second pipe

- **Level**: Service
- **Given**: observer A already holds `PaneIo` for `{session, idx}`.
- **When**: observer B attaches the same `tmux_window_name`.
- **Then**: `attach_pane_pipe` / `pipe-pane` is not invoked again; B is added as observer.
- **Signals**: invoke counter == 1.

### S5 — Fan-out

- **Level**: Service
- **Given**: two observers on one `PaneIo`.
- **When**: the pipe read loop emits `hello`.
- **Then**: both `output_rx` channels receive `hello`.
- **Signals**: both recvs.

### S6 — WS close is observer-only

- **Level**: Service
- **Given**: one pipe, one observer.
- **When**: `close_session(session_id)`.
- **Then**: registry still has the key; tmux window still exists; helper not required to exit (may stay).
- **Signals**: `close` did not call `kill_window`; key present.

### S7 — Destroy tears pipe and window

- **Level**: Service
- **Given**: live pipe + window.
- **When**: `destroy_session`.
- **Then**: window is gone; registry key gone; `pipe-pane` detached (empty command) or helper EOF.
- **Signals**: kill_window called; key absent.

### S8 — Reattach after remount hydrates from capture-pane

- **Level**: Service
- **Given**: window still exists; frontend session id is new (page remount).
- **When**: attach by `tmux_window_name`.
- **Then**: pipe is ensured; snapshot is produced via existing capture helper; live bytes follow.
- **Signals**: snapshot `Some`; no new window name minted.

### S9 — Pane pid survives re-pipe

- **Level**: Integration (skip if no tmux)
- **Given**: a real tmux window running `sleep 600` or a login shell.
- **When**: detach pipe and attach again.
- **Then**: `#{pane_pid}` is unchanged.
- **Signals**: pid equality.

### S10 — Same-size resize is a no-op

- **Level**: Rust unit
- **Given**: last pinned 120x40.
- **When**: `Resize { 120, 40 }` arrives again.
- **Then**: engine resize is not called.
- **Signals**: call count 0.

### S11 — Grid change uses resize-window only

- **Level**: Service
- **Given**: last pin 80x24.
- **When**: resize to 120x40.
- **Then**: one `resize-window`; **no** `refresh-client -C`.
- **Signals**: recorded tmux argv.

### S12 — Pipe write path never hex-encodes

- **Level**: Structural / unit
- **Given**: the tmux live Write arm.
- **When**: inspect or unit-drive Write(`abc`).
- **Then**: `encode_send_keys_hex_commands` is not used.
- **Signals**: grep / mock write_all of `abc`.

### S13 — Reports are not send-keys -H

- **Level**: Structural / unit
- **Given**: a tmux-backed Report command.
- **When**: OSC-11-style reply bytes are sent.
- **Then**: they are written to the pipe; not `refresh-client -r` and not hex send-keys.
- **Signals**: recorded write.

### S14 — DECSET on pipe updates mouse state

- **Level**: Rust unit
- **Given**: APP-054 observer.
- **When**: pipe chunk contains a complete `CSI ? 1000;1003;1006 h`.
- **Then**: observed state is active Any+Sgr (or current equivalent).
- **Signals**: existing mouse unit asserts reused on the pipe feed.

### S15 — No mouse-watch control client

- **Level**: Service
- **Given**: a pipe-backed window; last WS closes (M4).
- **When**: the old `ensure_mouse_mode_watch_if_unattached` site would have run.
- **Then**: no `atmos_mousewatch_*` session is created. DEC observation continues on the still-live pipe.
- **Signals**: watch spawn count 0; pipe key still present.

### S16 — Pipe failure does not start control mode

- **Level**: Service
- **Given**: `attach_pane_pipe` returns error (socket bind fail or tmux reject).
- **When**: create/attach proceeds.
- **Then**: the client receives a recoverable terminal error; `run_control_mode_tmux_session` is not called; the tmux window (if already created) still exists.
- **Signals**: error DTO/log; control-spawn count 0; `list_windows` still has the name when the window was created first.

### S17 — No new REST terminal API

- **Level**: Structural
- **Given**: this spec’s API surface.
- **When**: inspect `apps/api` routes touched by the impl.
- **Then**: terminal I/O remains `/ws/terminal/:id`; no new REST path.
- **Signals**: review / route list.

### S18 — Hidden keep-alive does not remount

- **Level**: Structural
- **Given**: APP-043 panel classes.
- **When**: user switches center tab away from terminal.
- **Then**: `Terminal` effect deps do not dispose; class is keepalive not `hidden`.
- **Signals**: existing APP-043 tests still pass.

### S19 — E2E smoke (if harness can see tmux)

- **Level**: E2E
- **Given**: local app + tmux, one workspace terminal.
- **When**: type `echo pipe-ok` and Enter; drag split if the fixture has a splitter.
- **Then**: `pipe-ok` appears; session stays connected; no attach error toast.
- **Signals**: xterm text or snapshot; WS stays OPEN.

### S20 — Exploratory agent-browser

- **Level**: agent-browser
- **Given**: `just dev-api` + `just dev-web`.
- **When**: open a workspace terminal, type, switch tab away and back, drag a mosaic split.
- **Then**: no blank WebGL; TUI/shell still usable; no flood of WS errors in console.
- **Signals**: notes in Coverage Status. Not a pass/fail oracle.

### S21 — Control runner is not on the live path

- **Level**: Structural
- **Given**: implemented create/attach for tmux windows (local API + relay).
- **When**: inspect call graph / grep.
- **Then**: no live caller of `run_control_mode_tmux_session`; no `atmos_client_*` name builder on attach.
- **Signals**: grep / review.

## Performance & load budgets

These are **dogfood budgets**, not CI gates unless a bench exists:

- Key-to-PTY write on loopback: no hex expansion (3× text) on the tmux stdin path.
- Resize to a new grid: one `resize-window`, zero `refresh-client -C`.
- Two subscribers: one `pipe-pane`, two WS binary fans.

## Regression checklist

- [ ] `mode=shell` simple PTY (install dialogs) unchanged.
- [ ] Tmux create/attach never starts `tmux -C` or `atmos_client_*`.
- [ ] APP-043 warmup / opacity keep-alive unchanged.
- [ ] APP-046 / APP-054 mouse restore still applies on remount snapshot.
- [ ] APP-055 run-log tee still sees live bytes on `run-*` windows.
- [ ] Side chat / `/spawn` `capture-pane` still works with no live xterm.
- [ ] Destroy still clears agent hooks keyed by pane name.
- [ ] Same-size pin does not SIGWINCH Grok-class TUIs.
- [ ] Second browser on the same window does not print `pipe-pane` already-open loops.
- [ ] No `send-keys -H` in the pipe write path.

## Exploratory agent-browser checks

Load the installed `agent-browser` skill (or `agent-browser skills get core --full`) before running.

1. Local workspace terminal: type a short command, confirm echo.
2. Switch to Files (or another center tab) and back: terminal should not show Connecting if keep-alive held.
3. Drag a mosaic split quickly: grid should track without a long blank/flash.
4. Narrow viewport: terminal still usable, no overlay eating clicks.
5. One expected failure: kill the pipe helper mid-session — expect a recoverable error or reconnect that re-pipes, **not** a silent return to control-mode feel, and **not** a killed tmux window.

## Acceptance criteria

- [ ] Every Must Have M1–M11 has at least one scenario above.
- [ ] S2, S4, S6, S7, S10, S12, S16, S21 are automated or structurally checked at unit/service level.
- [ ] S9 may skip when tmux is missing; skip is recorded, not silent pass.
- [ ] No new unconditional REST terminal endpoint.
- [ ] No `ATMOS_TERMINAL_IO` kill-switch and no control-mode live fallback.
- [ ] `just lint` and scoped `cargo test -p core-engine` / `cargo test -p core-service` (and api if touched) pass, or TEST Coverage Status names the scoped command.
- [ ] `atmos-specs-test-run` fills Coverage Status after implementation.

## Manual verification steps

1. `just dev-api` + web: open Claude or Grok in a pane, drag the split — expect Athas-like tracking without control-mode flash.
2. Restart **only** the API: window still listed; re-open tab attaches the same process.
3. Restart tmux server (rare): expect a new shell — document as expected (tmux durability is gone if tmux itself dies).

## Non-coverage

- Desktop UDS `ByteStreamPort` (N1).
- Idle pipe teardown (N2).
- Ghostty renderer.
- Full VT snapshot fidelity (still `capture-pane` cells + mouse option, ADR-004).
- Multi-user authorization (single-operator product).

## Coverage Status

> Filled after implementation by `atmos-specs-test-run`. Include exact tests, commands, agent-browser notes, and remaining gaps.
