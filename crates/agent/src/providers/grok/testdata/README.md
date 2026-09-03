# Native Grok Chat fixtures

Pinned CLI: `grok 1.0.17 (a549186d9d39)` (`grok --version`, 2026-09-02). Handshake re-checked live; rewind/fork fixtures still match 1.0.16 bodies.

Grok Chat host is ACP JSON-RPC 2.0 NDJSON over stdio (`grok agent stdio`) plus `x.ai/*` extensions. **Wire `method` is `_x.ai/...`** (ACP extension methods must start with `_`). Docs’ logical names `x.ai/*` without the underscore return JSON-RPC `-32601`.

CI does not spawn a live `grok` binary. Re-record these files when the published stdio tool envelopes change; note `grok --version` beside the pin.

Live 1.0.17 handshake that works (same as 1.0.16):

1. `initialize` `{ protocolVersion: 1, clientCapabilities: { fs, terminal }, clientInfo }`
2. `session/new` `{ cwd, mcpServers: [] }` → `sessionId`, `models`, `configOptions`, `_meta`

Inbound `_x.ai/announcements|mcp|models|settings|session_notification` frames are **notifications** (`id` omitted). Skip them; do not JSON-RPC-error. Live main `/ws` turns (2026-09-02, `grok 1.0.17`). Do **not** treat these as handshake/spawn failures or protocol success:

- default / `--model grok-4.6` → `402 Payment Required: Grok Build usage balance exhausted` (no `tool_call`)
- `--model grok-4.5` → same `402` Grok Build exhausted
- `--model ocx-xai-grok-composer-2-5-fast` → `403 personal-team-blocked:spending-limit` via ocx `127.0.0.1:10100`
- `--model ocx-gpt-5-6-sol` → ocx `404 No enabled OpenAI provider for model: gpt-5.6-sol`

`grok models` on this machine lists only `grok-4.6` (default), `grok-4.5`, and `ocx-*` shims.

Chat spawn overlay (session argv + env only; never write `~/.grok/config.toml`):

```text
GROK_CURSOR_MCPS_ENABLED=0 GROK_CLAUDE_MCPS_ENABLED=0 \
  grok --permission-mode <selected|default> agent [--model <id>] stdio
```

`--permission-mode` is a **parent** flag. `grok agent --permission-mode default stdio` is rejected (`unexpected argument '--permission-mode'`). Composer-selected ids: `default` / `plan` / `auto` / `bypassPermissions`. Still omit `--always-approve` / `--yolo`. User `[ui] permission_mode = "always-approve"` would otherwise auto-eat tool permission. Do not add Grok `session/new` `yoloMode` to the generic ACP mapper.

Empty `session/new` `mcpServers: []` does **not** stop Grok ingesting Cursor `~/.cursor/mcp.json` / Claude MCP via default `compat.cursor.mcps` / `compat.claude.mcps`. Names confirmed on grok 1.0.17 (`~/.grok/docs/user-guide/07-mcp-servers.md`, `26-config-reference.md`, binary strings). Env `0` disables for this process (same boolean convention as `GROK_MEMORY` / `GROK_WORKFLOWS`). HTTP MCP Connection refused and Cloudflare-plugin OAuth `AuthRequired` previously made stdio `worker quit with fatal` even when `session/new` RPC succeeded. Catalog probe uses the same overlay.

Live permission chrome (main `/ws` `:30303`, 2026-09-02, `grok 1.0.17`): three hyphenated `optionId`s, **not** Claude’s four underscored ACP ids and **not** Codex `accept`/`cancel`.

| optionId | name | kind |
| --- | --- | --- |
| `allow-edits-session` | Yes, allow all edits during this session | `allow_always` |
| `allow-once` | Yes | `allow_once` |
| `reject-once` | No, and tell Grok what to do differently | `reject_once` |

Probe chose `allow-once`. Frontend `AgentPermissionCard` already responds with `opt.option_id`. Do not rewrite these ids to underscored ACP names.

`request_permission.json` is the live `session/request_permission` shape (3 hyphenated `optionId`s + `kind`s above). Native grok 1.0.17 did **not** emit the published ACP four-id chrome (`allow_once` / `allow_always` / `reject_once` / `reject_always`) on this turn, so tests must not assert that chrome. `request_permission_response.json` is the client JSON-RPC **result** for the live choice (`outcome.selected` + `optionId: allow-once`). `request_permission_cancelled.json` is the `cancelled` result required on `session/cancel` while a permission is pending.

`tool_call_write_live.json` is the live Write jitter reconstructed from the perm-probe transcript (sanitized path `/tmp/atmos-grok-perm.txt`): first `kind: other` + `{file_path, content}` / title `write`, then `kind: edit` / title `Write \`path\``, then completed `kind: other` + empty input + `SearchReplace` / `EditsApplied`. Native `tool_map.rs` must keep that call as stable `edit` with path — not Other. `tool_call_write.json` is the older `type: Write` / `kind: edit` envelope (still mapped as edit). `tool_call_execute.json` is `kind: execute` / Grok `Bash`.

Live main `/ws` after the spawn overlay (2026-09-02, `grok 1.0.17`, default `grok-4.6`): ping/perm/fork probes `exit=0` on `:30303`. Spawn overlay is `grok --permission-mode default agent stdio` with `GROK_CURSOR_MCPS_ENABLED=0` `GROK_CLAUDE_MCPS_ENABLED=0`. Earlier same-day 402 Grok Build failures were quota, not protocol. Vendor slash list still includes `always-approve`; that is not Chat spawn `--always-approve`.

Exact extension methods that exist (underscore required):

| Wire method | Notes |
| --- | --- |
| `_x.ai/rewind/points` | params `{ sessionId }` (serde field is `session_id`; camelCase alias). Result `{ rewind_points: [{ prompt_index, created_at, num_file_snapshots, has_file_changes, prompt_preview }] }` |
| `_x.ai/rewind/execute` | params `{ sessionId, targetPromptIndex, force, mode }` (`conversation_only` \| `files_only` \| `all`). Omit `mode` defaults to `all` and restores files. Result is snake_case; `success: false` is still HTTP-level JSON-RPC `result` |
| `_x.ai/session/fork` | params `{ sourceSessionId, sourceCwd, newCwd }` plus optional `sessionKind: "worktree"`. Result `{ newSessionId, chatMessagesCopied, updatesCopied, planStateCopied, newCwd, parentSessionId }` |
| `_x.ai/git/worktree/create` | params `{ sessionId, sourcePath }` only. Result is wrapped `{ result: { status: "creating", sessionId, worktreePath, sourceGitRoot } }`. Completion is a **notification** `_x.ai/git/worktree/status` (`progress` then `created`). `_x.ai/git/worktree/status` as a request is `-32601` |
| `_x.ai/interject` | params `{ sessionId, text }`. Mid-turn inject; reply is immediate. Do not send a second `session/prompt`. |

`rewind_execute.json` pins `mode: conversation_only` (never omit). `fork_session.json` is no-worktree (`newCwd = sourceCwd`, no `sessionKind`). `worktree_create.json` pins `{ sessionId, sourcePath }` (cwd; no `label` / git fields). Response fixtures (`*_response.json`, `worktree_status_created.json`) match live 1.0.16 bodies with sanitized paths.

`grok_background.json` is the Bash / `taskoutput` envelope used by the mapper. A live prompt turn was not re-recorded (CLI chat proxy returned 401 in this environment).

Handshake-only stdio (no `session/prompt`, 2026-09-02): `grok --permission-mode default agent stdio` initialize + `session/new` `{ cwd, mcpServers }` succeed. `session/new` result has `sessionId` / `models` / `configOptions` / `_meta` and does **not** echo `yoloMode`. Debug has no `--always-approve`. User `~/.grok/config.toml` still has `[ui] permission_mode = "always-approve"`; published CLI says the `--permission-mode` flag overrides config for that process. Do not treat handshake as a successful turn.
