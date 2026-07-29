# Terminal Agent Resources

This directory owns repo-level terminal-agent manifests that are consumed by both Rust services and TypeScript app code.

## Files

- `builtin_agents.json`: Atmos built-in terminal agent defaults: stable ids, display labels, executable names, default launch flags (safe + YOLO), and prompt delivery strategy hints.
- `builtin_agents.meta.json`: Ship-time **manifest version**. Used for smart upgrade of non-customized user agent entries.
- `tui_follow_up_agents.json`: Web terminal agents that must launch interactively first, then wait for a TUI-ready pattern before auto-sending the initial prompt. Each entry maps `agentId` to `readyPattern` (regex against accumulated terminal output).

---

## Changing built-in agent commands (required checklist)

**Whenever you change default launch commands or flags in this folder, do both steps:**

1. **Edit** `builtin_agents.json` (or add/remove agents there).
2. **Bump** `builtin_agents.meta.json` → `version` by **+1**.

Skipping step 2 means existing users who only use defaults may **never** pick up the new flags (their machine still has the previous applied version).

### What counts as a version bump

Bump when any of these change in `builtin_agents.json`:

- `cmd`, `params`, `interactiveParams`
- `yoloParams`, `yoloInteractiveParams`
- Adding or removing a built-in agent that should appear for existing installs

No bump needed for: comments/docs only, typo fixes in `label` that do not affect launch, or pure `AGENTS.md` edits.

### Smart upgrade behavior (for context)

On settings / code-agent read, Atmos compares:

| | |
|--|--|
| Shipped version | `builtin_agents.meta.json` → `version` (baked into Server) |
| Applied on machine | `~/.atmos/function_settings.json` → `agent_cli.builtin_manifest_version` |

If shipped > applied:

- **User-customized** `cmd` / flags / interactiveFlags (not equal to either YOLO-on or YOLO-off built-in defaults) → **never rewritten**.
- Entries that only match built-in defaults (including YOLO-on/off variants) → flag overrides stripped so new defaults apply.
- **YOLO mode** (`agent_cli.yolo_mode`) is global and **does not** count as a per-agent command edit.
- Custom (non-built-in) agents are never touched.

---

## Rules

- Keep this directory limited to terminal-agent manifest data. Do not add frontend components, runtime user settings, generated artifacts, or tests here.
- User overrides and custom agents belong in `~/.atmos/agent/terminal_code_agent.json`, not in `builtin_agents.json`.
- When changing `builtin_agents.json`, verify both consumers:
  - Web Agent Select adapter: `apps/web/src/features/agent/lib/terminal-agent-definitions.ts`
  - Automation resolver + upgrade: `crates/core-service/src/service/automation/agents.rs`, `builtin_agent_upgrade.rs`
- When changing `tui_follow_up_agents.json`, verify the web loader in `apps/web/src/features/agent/lib/terminal-agent-tui-follow-up.ts`.
- Preserve existing agent `id` values unless a migration plan is documented; user settings and persisted automation definitions refer to these ids.
- Use `promptStrategy` for automation prompt delivery. Supported values are `arg`, `stdin`, `prompt_flag`, and `file_flag`; keep `useEcho` only for existing interactive UI compatibility.
- Permission-skip / auto-approve flags live in optional `yoloParams` / `yoloInteractiveParams` (full flag strings when YOLO mode is on). Base `params` / `interactiveParams` are the safe (non-YOLO) variants. Global toggle: `function_settings.json` → `agent_cli.yolo_mode` (default `true`).
- Keep the JSON plain and cross-runtime friendly. Avoid comments, trailing commas, or TypeScript/Rust-specific fields.
