# PRD · APP-054: Terminal TUI Scroll Stability

> Product requirements for reliable TUI wheel ownership and proportional in-TUI scrolling after reattach.

Implements the direction in [BRAINSTORM.md](./BRAINSTORM.md). Builds on APP-046 mouse restore.

---

## 1. Problem statement

Users running interactive terminal UIs (fullscreen agents, editors, known inline mouse TUIs) sometimes find that after refresh, workspace switch, or reattach:

- The **mouse wheel scrolls xterm history** instead of the TUI’s own list/viewport.
- When TUI scrolling works, it feels **slow and laggy** (tiny steps per gesture).

Idle shell scrollback must remain usable.

## 2. Users & context

| User | Context |
|------|---------|
| Desktop / web Atmos user | Local or remote runtime, tmux-backed terminal panes |
| Agent / TUI users | Claude-class alt-screen apps; Grok-class inline mouse TUIs |

## 3. Goals

1. **Stable wheel ownership** for active mouse-reporting TUIs after attach and reattach.
2. **Proportional wheel distance** under active mouse tracking (trackpad and discrete wheel).
3. **No scrollback theft** for idle shells and ordinary non-mouse processes.

## 4. Must Have

| ID | Requirement |
|----|-------------|
| M1 | DEC mouse mode observation remains correct when enable/disable CSI sequences are **split across control-mode output chunks**. |
| M2 | Reattach restore **re-enables mouse** for alternate-screen panes and known inline mouse TUIs even if a previously persisted inactive observation would otherwise suppress restore. |
| M3 | Idle shell and non-mouse processes do **not** get forced mouse restore (wheel scrollback stays local). |
| M4 | Frontend does **not** unconditionally disable TUI mouse on title `CMD_END` while the terminal is still on the **alternate screen**. |
| M5 | Reattach/hydration continues to apply backend restore sequence (or default with hover) so wheel goes to the app for active TUIs. |
| M6 | When xterm mouse tracking is active, vertical wheel/trackpad distance converts to **proportionally more** mouse wheel reports (cell-height based, bounded accumulation). |
| M7 | When mouse tracking is inactive, default xterm local scrollback behavior is unchanged. |
| M8 | Deterministic unit tests cover M1–M3, M6 mapping, and shared snapshot restore rules. |

## 5. Nice to Have → promoted / remaining

| ID | Requirement | Status |
|----|-------------|--------|
| N1 | Pane-scoped always-on observation that outlives a single browser WebSocket. | **Shipped** (detached mouse-mode watch) |
| N2 | Hide or ignore vertical scrollbar interaction while mouse tracking is active. | **Shipped** |
| N3 | Desktop local hop reduction for lower wheel RTT. | Out of scope this ship; tracked in [known-debt-client-transport.md](../../../docs/architecture/known-debt-client-transport.md) |
| N4 | Coalesce high-frequency input reports; fast-path small interactive output. | **Shipped** |

## 6. Success metrics

- Dogfood: reattach mid-TUI → wheel stays in-app (manual).
- Unit: multi-chunk observe + restore policy + wheel report count all green under normal project runners.

## 7. Out of scope

- Replacing tmux control mode.
- Primary reliance on growing agent command name lists.
- Mobile-only wheel UI redesign.

## 8. Dependencies

- APP-046 snapshot fields (`restore_mouse_tracking`, `mouse_tracking_sequence`).
- ADR-004 control-mode transport.
