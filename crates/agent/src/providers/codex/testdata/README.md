# Codex native Chat fixtures

Pinned CLI: **`codex-cli 0.144.5`** (released). Binary used for live capture:

`/Users/aarynlu/.npm/_npx/18dd321ac7067500/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`

Spawn argv: `codex app-server` (default `--listen stdio://`). Codec is JSON-RPC lite: **no `"jsonrpc":"2.0"`** on stdin or stdout. Official docs agree; live frames confirm.

Also probed `/Users/aarynlu/.codex/plugins/.plugin-appserver/codex` (`codex-cli 0.150.0-alpha.12.2`). Same kebab-case enums and omitted `jsonrpc`. Differences vs 0.144.5: default `historyMode` is `"paginated"`; `thread/revert` exists; `thread/rollback` is rejected on paginated threads; notifications may carry sibling `emittedAtMs`. Adapter follows `historyMode` from `thread/start` (legacy → `thread/rollback`, paginated → `thread/revert`).

Do **not** substitute another binary when PATH `codex` is the Homebrew OpenCodex shim (`codex.opencodex-real` missing). Fail with that path so the user can repair or reinstall the official CLI.

Live PATH on 2026-09-03: `/opt/homebrew/bin/codex` → `codex-cli 0.153.0`. `codex app-server` spawn, slash inject (`fork`/`rewind`), and session-op `/fork` `/rewind` work on main `/ws`. Chat `thread/start` still sends kebab-case `approvalPolicy` / `sandbox: workspace-write` (not the user’s `config.toml` `never` / `danger-full-access`) so Atmos can show permission chrome when a turn actually reaches tools. Auto ("Approve for me") is `approvalPolicy: on-request` + `approvalsReviewer: auto_review`; Ask always keeps `approvalsReviewer: user`. `turn/start` (and `thread/start` when the CLI validates it) require `model`; handshake fills sticky `model` / first listed effort from `model/list` when spawn config omitted them.

`initialize` sends `capabilities.experimentalApi: true` so `collaborationMode/list` is allowed (`collaborationMode/list requires experimentalApi capability` otherwise). Live list (0.152.1+): Default (`default`) + Plan (`plan`). Mode is **not** on `thread/start`; it is sticky on `turn/start.collaborationMode`. 0.153 `CollaborationMode.settings` **requires** `model` (`Invalid request: missing field \`model\`` if omitted). Shape: `{ "mode": "plan"|"default", "settings": { "model": "<sticky>", "developer_instructions": null, "reasoning_effort": "<sticky effort>" } }`. `reasoning_effort` is omitted when sticky effort is empty. Switching Plan → Default must send `mode: "default"` explicitly. If the host rejects the field (older CLIs), retry that turn without it and stamp Default/Plan from catalog.

Chat spawn `-c` list (session argv only; never write `~/.codex/config.toml`):

```text
codex app-server -c openai_base_url=""
```

Pinned in `spawn.rs` `CHAT_CONFIG_OVERRIDES`. Empty `openai_base_url` is what proved `codex exec -c 'openai_base_url=""' -m gpt-5.4-mini` completes via ChatGPT login. Chat does **not** inherit the user’s `openai_base_url` gateway (this machine: ocx `http://127.0.0.1:10100/v1`). Do not search PATH for a substitute `codex` binary.

This machine’s `~/.codex/config.toml` has `openai_base_url = "http://127.0.0.1:10100/v1"` (opencodex). `codex login status` is **Logged in using ChatGPT**. ocx `GET /api/providers` lists **only** `xai` (`hasApiKey: false`, `authMode: oauth`, `discovery.status: failed reason: blocked`) — **no enabled OpenAI provider**. Before the Chat `-c` overlay, live main `/ws` turns inherited ocx:

- `gpt-5.6-sol` / `gpt-5.3-codex-spark` → `404 No enabled OpenAI provider for model: …` at `http://127.0.0.1:10100/v1/responses`
- `xai/grok-composer-2.5-fast` → `403 personal-team-blocked:spending-limit`

Do **not** treat those pre-overlay 404/403 as protocol success.

Live main `/ws` after Chat `-c openai_base_url=""` (2026-09-02, PATH `codex-cli 0.152.1`, model `gpt-5.4-mini`, ChatGPT login). Probe: `scripts/dev/agent-chat-ws-probe.mjs` against `127.0.0.1:30303`. Logs under `/tmp/atmos-ws-probes/codex-*.log`.

- Ping turn `status: completed` (not ocx 404).
- In-cwd write: `fileChange`/`edit` → `atmos-codex-write-probe.txt` (`hi`). No `permission_requested` (workspace-write auto-allows in-cwd edits).
- In-cwd shell write: `commandExecution`/`execute` `printf 'hi' > atmos-codex-bash-probe.txt`. No `permission_requested`.
- Out-of-cwd write: `permission_requested` `tool: commandExecution`, options `accept` (`allow_once`) + `cancel` (`reject_once`) — not the full acceptForSession set. `permission_resolved` `accept`, then `tool_call_completed`. File written. First attempt failed until `mkdir -p`.
- `/fork` after a seeded turn: `session_op_requested` `{fork, Never mind}` → `session_op_resolved` `applied` + `session_forked`. Empty-thread `/fork` apply fails vendor `no rollout found` (chrome still intercepts).
- `/rewind` after a **completed** seed on the same `-c openai_base_url=""` spawn (2026-09-02, `gpt-5.4-mini`, `/tmp/atmos-ws-probes/codex-rewind.log`): one-phase chrome `{turn:<seed_turn_id>, Never mind}` → `rewind_view_updated` + `session_op_resolved` `applied`. Not two-phase `rewind_conversation`. Pre-overlay rewind on a 404 seed (`/tmp/atmos-calib/ws-codex-rewind.log`, `gpt-5.6-sol`) is not this proof.

`writeStdin` / `acceptWithExecpolicyAmendment` were not on this live turn; they stay on `request-approval.jsonl`.

`codex app-server generate-json-schema` from **0.152.1** keeps the 0.144.5 methods (`item/commandExecution|fileChange|permissions/requestApproval`) and string decisions `accept` / `acceptForSession` / `decline` / `cancel`. New on command execution: nullable `command`, `kind: command|writeStdin`, `proposedExecpolicyAmendment` → object decision `{acceptWithExecpolicyAmendment:{execpolicy_amendment}}` (snake_case field). `applyNetworkPolicyAmendment` exists on the same enum; Atmos does not invent per-host allow/deny chrome for it. File-change params still have `grantRoot` and **no** `changes[]`. Fixtures stay 0.144.5 handshake/turn shapes plus the 0.152.1 approval extras in `request-approval.jsonl`.

**Plan-mode Ask** (experimental, needs `capabilities.experimentalApi: true`): server request `item/tool/requestUserInput` for the built-in `request_user_input` tool (TUI only in Plan / `collaborationMode: plan`). Params `ToolRequestUserInputParams`: `{ threadId, turnId, itemId, isBlocking, questions: [{ id, header, question, options: [{ label, description }], isOther?, isSecret? }] }`. Response `ToolRequestUserInputResponse`: `{ answers: { <questionId>: { answers: string[] } } }`. Empty `{ answers: {} }` = Skip / no answers (Plan docs: continue with best judgment). Atmos maps to `PermissionRequested` with `tool: request_user_input` + `questions[]` (labels) and option-description markdown when present; ApprovalCard Continue sends `answers:{…}` keyed by question id. Fixture: `request-user-input.jsonl`.

CI must not require a live `codex` binary.

| File | Source | Covers |
|------|--------|--------|
| `handshake.jsonl` | Live 0.144.5 initialize / initialized / thread/start | kebab-case `approvalPolicy: on-request`, `sandbox: workspace-write`, `approvalsReviewer: user`; initialize result `{userAgent,codexHome,platformFamily,platformOs}` (no method list) |
| `steer.jsonl` | Live 0.144.5 | `turn/steer` `{threadId,input,expectedTurnId}` → `{turnId}` |
| `framing-no-jsonrpc.jsonl` | Live shapes + inbound extra `jsonrpc` | classify: notification, response, server request, extra jsonrpc, malformed |
| `turn-tools.jsonl` | Live `turn/started` + `userMessage`; remaining items from `codex app-server generate-ts` of the same 0.144.5 binary (tool turn 401'd without auth in an isolated `CODEX_HOME`) | commandExecution, fileChange `{kind:{type:update}}`, webSearch search+openPage, reasoning `summary: string[]`, plan, unknown notify, `turn/completed` |
| `collaboration-mode-list.json` | Live 0.152.1 `collaborationMode/list` (experimentalApi initialize) | `{ data: [{ name, mode, model, reasoning_effort }] }`. Adapter id = `mode`, label = `name`, `default` first |
| `request-user-input.jsonl` | Schema 0.153.4 `item/tool/requestUserInput` (Plan Ask) | Multi-question `questions[]` with `label`+`description`; reply `{ answers: { id: { answers: [label] } } }` |

Live enum trap: `approvalPolicy: "onRequest"` is rejected (`expected one of untrusted, on-request, granular, never`). `learn.chatgpt.com` camelCase examples are wrong for this CLI.

`thread/rollback` requires `{threadId, numTurns}` (`numTurns >= 1`). `thread/revert` is **not** a 0.144.5 method; it is 0.150 paginated-only `{threadId, beforeTurnId}` and does not restore files.
