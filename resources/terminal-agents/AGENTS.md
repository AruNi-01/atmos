# Terminal Agent Resources

This directory owns repo-level terminal-agent manifests that are consumed by both Rust services and TypeScript app code.

## Files

- `builtin_agents.json`: Atmos built-in terminal agent defaults: stable ids, display labels, executable names, default launch flags, and prompt delivery strategy hints.

## Rules

- Keep this directory limited to terminal-agent manifest data. Do not add frontend components, runtime user settings, generated artifacts, or tests here.
- User overrides and custom agents belong in `~/.atmos/agent/terminal_code_agent.json`, not in `builtin_agents.json`.
- When changing `builtin_agents.json`, verify both consumers:
  - Web Agent Select adapter: `apps/web/src/features/agent/lib/terminal-agent-definitions.ts`
  - Automation resolver: `crates/core-service/src/service/automation/agents.rs`
- Preserve existing agent `id` values unless a migration plan is documented; user settings and persisted automation definitions refer to these ids.
- Use `promptStrategy` for automation prompt delivery. Supported values are `arg`, `stdin`, `prompt_flag`, and `file_flag`; keep `useEcho` only for existing interactive UI compatibility.
- Keep the JSON plain and cross-runtime friendly. Avoid comments, trailing commas, or TypeScript/Rust-specific fields.
