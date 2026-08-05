# TECH · APP-054: Terminal TUI Scroll Stability

> Technical design for cross-chunk DEC mouse observation, restore policy, gated CMD_END, and proportional TUI wheel reports.

Implements [PRD.md](./PRD.md). Extends APP-046; does not replace ADR-004.

---

## 1. Architecture

```text
TUI ──DECSET──► tmux pane ──%output──► control reader
                                      │
                                      ├─ residual CSI buffer + MouseModeState
                                      ├─ persist @atmos_mouse_tracking (on change)
                                      └─ WS binary ──► xterm.js
                                                        │
                                                        ├─ hydrate: cells + rehydrate DECSET
                                                        ├─ CMD_END: disable only if not alt-screen
                                                        └─ custom wheel: multi-report when tracking on
```

**Live path remains the sole continuous truth.** Snapshot still hydrates cells; modes come from observed state + resolve policy.

## 2. Backend (`core-engine`)

### 2.1 Cross-chunk observation

Extend observation so incomplete private CSI sequences carry across chunks:

- Keep a **residual buffer** (bounded, e.g. 4 KiB) of a trailing incomplete `ESC[?…` / `C1 CSI ?…` prefix.
- Next `observe_bytes` prepends residual, then scans for complete `?params h|l` terminators.
- Incomplete trailer becomes the new residual; complete sequences update `MouseModeState` as today (exclusive event modes, independent format).

API shape (implementation may nest residual inside a small tracker type, or on the observer used by the control reader):

```text
observe_bytes(chunk) -> changed: bool
// residual is private to the observer instance for that pane reader
```

Persist format (`any+sgr`, `none`, …) and pane option key unchanged (`@atmos_mouse_tracking`).

### 2.2 Restore resolution

```text
resolve_mouse_tracking_restore(observed, alternate, current_command)
  → (restore: bool, sequence: Option<String>)
```

| Observed | Result |
|----------|--------|
| `Some(active)` | `restore=true`, exact `restore_sequence()` |
| `Some(inactive)` | If `should_restore_tui_mouse_tracking(alternate, cmd)` → default sequence **with 1003+1006**; else no restore |
| `None` | Same heuristic as today → default or none |

**Policy change vs APP-046:** bare inactive must **not** suppress restore when the pane is still alternate-screen or a known inline mouse TUI. Inactive is treated as **stale or incomplete observation** in those cases.

Heuristic true when:

- `alternate`, or
- `is_inline_mouse_tui_command` (`grok` / `grok-*` basename) — keep list tight.

### 2.3 Control reader (`core-service`)

- Seed observer from `get_pane_mouse_tracking_by_id` as today.
- Call `observe_bytes` on every pane `%output` (including suppress window).
- Persist only on change.

### 2.4 Detached pane mouse-mode watch (shipped)

When the last browser control client detaches from a master window, `TerminalService` starts a lightweight control client (`atmos_mousewatch_*`) that:

- Observes pane `%output` with the same residual CSI parser
- Persists `@atmos_mouse_tracking` on change
- Does **not** forward bytes to any WebSocket
- Stops when a live browser attaches again or the window is destroyed

Key: `{tmux_session}:{window_index}`. Registry lives on `TerminalService`.

## 3. Shared (`packages/shared`)

- Keep `ENABLE_TUI_MOUSE_TRACKING` / `DISABLE_TUI_MOUSE_TRACKING` and `mouseTrackingRestoreSequence`.
- Snapshot still prefers `mouse_tracking_sequence`, then `restore_mouse_tracking`, then alternate fallback.
- No foreign product names in comments.

## 4. Frontend (`apps/web` terminal)

### 4.1 Hydration

Unchanged order conceptually:

```text
reset → optional resize → clear/screen + cells + cursor + mouse restore sequence
```

### 4.2 Title OSC: shell vs reattach (root-cause race fix)

| OSC | Source | Mouse side-effects |
|-----|--------|--------------------|
| **9999** | Shell shim preexec/precmd | CMD_START may ENABLE for alt/inline; CMD_END may DISABLE when not alternate |
| **9998** | Server `inject_initial_title` on attach | **Title only for disable path** — never DISABLE mouse; may ENABLE if snapshot/whitelist wants TUI mouse |

**Root cause of “refresh → 100% xterm scroll”:** reattach inject used **9999** `CMD_END`, which raced after snapshot mouse hydrate and cleared DEC mouse modes. Fixed by splitting inject onto **9998**.

Do **not** rely on fixed-time reassert/suppress windows as the primary fix.

### 4.3 Proportional TUI wheel

Pure helper module (unit-tested):

```text
resolveTuiWheelReportCount(event, state, metrics) -> number
// metrics: cellHeight, rows
// state: pending fractional rows, direction
```

Attach via `terminal.attachCustomWheelEventHandler`:

- If `terminal.modes.mouseTrackingMode === 'none'` → return `true` (xterm local scroll).
- Else compute report count from delta mode / pixel distance / cell height; accumulate fractions; cap per-event reports to a safe bound.
- Replay that many line-delta wheel events into xterm’s path (or equivalent) so each becomes a mouse report to the PTY; mark replays so the custom handler does not recurse.

Shift+wheel and non-vertical events: do not multiply (pass through).

### 4.4 Scrollbar while mouse tracking active (shipped)

Host element toggles class `atmos-tui-mouse-active` when `mouseTrackingMode !== 'none'` (or xterm `.enable-mouse-events`). CSS hides the local overlay vertical scrollbar so users do not drag scrollback while the TUI owns the wheel.

### 4.5 Input coalesce + interactive output fast path (shipped)

- `createTerminalInputCoalesceQueue`: merges consecutive small / mouse-report input chunks in one microtask before `sendInput`.
- Output: chunks ≤ 512 bytes write immediately when the rAF pipeline is empty; larger or concurrent bursts still use rAF batching.

## 5. Layer rules

| Layer | Responsibility |
|-------|----------------|
| `core-engine` | Residual observe, resolve policy, persist encode/decode |
| `core-service` | Feed live stream; seed/persist pane option |
| `packages/shared` | Client restore payload contract |
| `apps/web` | CMD_END gate; wheel multi-report |

## 6. Rollout

1. Land engine observe + resolve + tests.
2. Shared snapshot tests stay green.
3. Frontend gate + wheel + tests.
4. Dogfood reattach mid-TUI when environment allows.

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Residual grows unbounded | Cap residual size; drop if over limit |
| Inactive override keeps mouse too long | Only when alt or tight inline whitelist |
| Wheel multi-report floods input | Per-event cap + fractional accumulate |
| CMD_END on alt never clears mouse | Live stream disable / CMD_END after leave alt still clears |

## 8. Verification

See [TEST.md](./TEST.md). Primary gates:

- `cargo test -p core-engine` (mouse_modes / resolve)
- `bun test packages/shared/src/terminal/snapshot.test.ts`
- `bun test` wheel mapping tests under `apps/web` terminal lib
