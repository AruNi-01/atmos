# APP-054 · Terminal TUI Scroll Stability — BRAINSTORM

> Keep wheel ownership on interactive TUIs after reattach, and make in-TUI scrolling feel proportional to gesture distance under Atmos’s tmux control-mode + xterm.js stack.

Related: [APP-046 Terminal TUI Mouse Tracking](../APP-046_terminal-tui-mouse-tracking/TECH.md), [ADR-004](../../../docs/adr/004-terminal-tmux-control-mode.md).

---

## 1. Problem

Atmos terminals use **tmux control mode** as the live byte transport and **xterm.js** as the client emulator. Reattach hydrates cells via `capture-pane` (or equivalent snapshot), which does **not** restore DEC mouse modes. APP-046 added stream observation + snapshot restore, but users still see:

1. **Intermittent wheel → local xterm scrollback** while a TUI is active (fullscreen or known inline mouse TUI).
2. **Sticky / tiny in-TUI scrolls** when mouse reporting *is* active (one report per coarse event; trackpad distance ignored).
3. **Misleading scrollbar motion** when local scrollback and TUI internal scroll diverge (especially non-alt-screen TUIs).

Root causes under consideration:

| Cause | Why it bites |
|-------|----------------|
| CSI private-mode enable split across `%output` chunks | Observer drops incomplete `ESC[?…h` → wrong persisted mode |
| Persisted inactive (`none`) overrides alt / inline heuristic | Reattach refuses to restore mouse even when the pane still needs it |
| Frontend `CMD_END` always disables mouse | Synthetic or mistimed end titles wipe restore |
| xterm default wheel under mouse report | Small pixel deltas → 0–1 reports; no cell-distance scaling |
| Control client lifecycle tied to browser | Modes stop updating while the pane still runs (phased; not required for A-tier) |

## 2. Goals

1. After reattach/refresh, active TUIs keep **wheel → app** (not local scrollback) when mouse reporting is required.
2. Idle shells and non-mouse processes **keep** local wheel scrollback.
3. When mouse tracking is on, wheel/trackpad distance maps to **more reports** (bounded, cell-aware).
4. Spec and code stay **Atmos-native** (tmux control mode, existing snapshot contract). No foreign product naming in docs or comments.

## 3. Options

| Option | Idea | Pros | Cons |
|--------|------|------|------|
| A | Frontend-only: always force full mouse DECSET on any non-shell | Simple | Steals scrollback; wrong encoding/mode |
| B | Fix observe (cross-chunk) + restore policy + gated CMD_END + wheel distance reports | Targeted; builds on APP-046 | Does not alone keep observation while no browser is attached |
| C | Pane-scoped always-on control observer (bridge) | Modes always fresh | Larger lifecycle change |

**Choice: B for this ship** (Must Have). Document C as phased follow-up in TECH if multi-attach bridge is not landed here.

## 4. Key design choices

| Decision | Choice |
|----------|--------|
| Cross-chunk CSI | Residual private-mode buffer on the live observer |
| Inactive observation vs TUI still needs mouse | Do **not** let bare `none` suppress restore when alternate or inline mouse TUI whitelist matches |
| CMD_END | Disable mouse only when **not** on alternate buffer (fullscreen TUI keeps mouse) |
| Wheel | Custom wheel handler only while `mouseTrackingMode !== 'none'`; inactive path unchanged |
| Transport | Stay on tmux control mode; no bare-PTY rewrite |

## 5. Non-goals

- Desktop UDS / local hop latency redesign.
- Expanding agent name whitelist as the primary fix.
- Pixel-subcell scrollbar animation for TUI-internal state.
- Mobile-specific wheel UI beyond shared snapshot helpers.

## 6. Open questions (resolved in TECH)

- ~~Residual buffer ownership~~ → live observer state next to `MouseModeState`.
- ~~Inactive override~~ → heuristic wins for alt + inline whitelist when observed inactive.
- ~~CMD_END gate~~ → skip disable on alternate buffer.
