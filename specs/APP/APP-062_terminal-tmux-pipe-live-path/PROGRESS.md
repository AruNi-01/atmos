# PROGRESS · APP-062: Terminal tmux pipe-pane live path

> Implementation Progress · current state, handoff notes, blockers, and verification status. This file is not a requirements source.

## Status

- **State**: ready_for_review
- **Branch**: `aarynlu/app-062-terminal-tmux-pipe-live-path-39ca`
- **Last updated**: 2026-08-16
- **Current owner**: cloud agent
- **Current phase**: review

## Snapshot

- Production live path is `pipe-pane -I -O` via `PaneIoRegistry`; control-mode runner and `atmos_mousewatch_*` are gone.
- Desktop local renderer terminal stream uses `ByteStreamPort` IPC (ADR-006); API still `/ws/terminal/:id`.
- Do not restore `tmux -C`, `send-keys -H`, `ATMOS_TERMINAL_IO`, or `IoMode`.

## Implementation Checklist

- [x] Engine `pipe.rs` helper + attach/detach
- [x] Service `PaneIoRegistry` + create/attach/close/destroy
- [x] API `--internal` helper; relay uses the same service path
- [x] ADR-004 note + `~/.atmos/state/tmux-pipes/` layout
- [ ] Regression gate (`cargo test` / clippy on touched crates)
- [ ] TEST.md Coverage Status (`atmos-specs-test-run`)

## Progress Log

### 2026-08-15

- Engine: UDS helper, sanitize, copy_raw, attach with `-o` + one retry.
- Service: one pipe per pane, observer watermark, DEC observe on pipe, no mousewatch.
- API: `--internal tmux-pipe-bridge` before clap/Tokio.
- Docs: ADR-004 live-path note; home layout `state/tmux-pipes/`.

## Decisions Since TECH

| ID | Decision | Why | Source update |
|----|----------|-----|---------------|
| D1 | Live loops live in `PaneIoRegistry` tokio tasks, not `run_pipe_pane_session` | Matches “one attachment / pane” better than a per-session OS thread | TECH.md module table |
| D2 | Desktop local renderer uses `ByteStreamPort` IPC; API remains `/ws/terminal/:id` | N1 Phase 0–1 from known-debt; Web/remote stay on WS | ADR-006 |

## Verification Status

| Area | Command / Method | Last result | Notes |
|------|------------------|-------------|-------|
| Rust tests | `cargo test -p core-engine --lib`; `cargo test -p core-service --lib`; `cargo test -p core-service --test app062_terminal_live_path`; `cargo test -p api`; `cargo test -p runtime-manager --lib` | pass | 2026-08-15 |
| Clippy | `cargo clippy -p core-engine -p core-service -p api -p runtime-manager --tests -- -D warnings` | pass | |
| Web tests | `bun test apps/web/src/app-shell/__tests__/workspace-surface-policies.test.ts` | pass | APP-043 keep-alive |
| E2E / agent-browser | S19 / S20 | not_run | no local TUI dogfood in this run |

## Known Blockers

- [ ] S9 needs a real tmux; skip and record if missing.

## Handoff Notes

### Task goal

Ship APP-062 M1–M11: tmux still owns the pane; live I/O is one `pipe-pane`.

### Constraints

- No control-mode fallback. No new REST. No frontend protocol change. No APP-043 keep-alive change.
- Helper is API `current_exe --internal tmux-pipe-bridge --uds <path>`.
- `tmux/control.rs` parser stays this PR (delete follow-up allowed).

### Relevant files/symbols

- `crates/core-engine/src/tmux/pipe.rs`
- `crates/core-service/src/service/terminal/io.rs`
- `apps/api/src/main.rs` (`try_run_internal_from_env`)
