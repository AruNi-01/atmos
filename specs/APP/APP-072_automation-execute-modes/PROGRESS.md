# PROGRESS · APP-072 Automation execute modes

Lead kanban. Implementing agent writes feature code in serial waves.

## Waves

| Wave | Owns | Status |
|------|------|--------|
| 0 | `TECH.md` / `TEST.md` / PRD locks | done |
| 1 | infra migration + entities + repo | done |
| 2 | core-service execute modes, runner, complete/paths/stale | done |
| 3 | core-engine tmux metadata + terminal/chat origin fields | done |
| 4 | apps/api WsAction + handlers + agent_chat cwd | done |
| 5 | `@atmos/api-types` extract + contract | done |
| 6 | CLI + `atmos-automation` skill + registry | done |
| 7 | apps/web setup, sidebar, landing, chips, banner, i18n | done |
| 8 | TEST.md scenarios → cargo/bun until green | done |

## Notes

- Do not commit.
- Do not touch unrelated dirty files.
- Interactive stale >1h: notify only; dismiss does not change status.

## Review fixes (P1 + listed P2)

- **M4 / P1**: Chat and terminal agent ids are stored separately. Chat mode never autofills from the terminal-agent list. Server `validate_agent_for_mode(Chat)` requires a real chat provider id.
- **M10 / P1**: Tab Automation mark is per-tab (tmux window / chat id / origin metadata), not `surface_scope_id === contextId`. Files/GitHub/etc. no longer inherit the mark.
- **M11 / P1**: Standalone tree, kanban, shortcuts, and landing open `/automation?id={guid}`. Synthetic workspace `localPath` is the definition dir. Git/PR chrome is hidden. No Project or git worktree is created.
- **M12/M13 / P2**: `runLandingHref` includes `tab=terminal-tab:auto-{short}` (new extra tab, not Term split) or `tab=agent-chat:{chatId}`.
- **i18n / P2**: `zh` `standaloneGroup` → 独立自动化; memory labels → 记忆.
- **TUI wait / P2**: `wait_for_tui_ready` now runs in `tokio::spawn` after `update_run_surface`, so the start claim is not held for up to 30s.
