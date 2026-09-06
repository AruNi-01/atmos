# Pi native RPC fixtures

Pinned CLI: `/opt/homebrew/bin/pi` → `@earendil-works/pi-coding-agent` **0.84.2** (live `pi --version` on 2026-09-02).

Frames follow the published RPC page (`pi.dev/docs/latest/rpc`) and `dist/modes/rpc/rpc-types.d.ts` in that install. Protocol is **JSONL, not JSON-RPC 2.0** (`type` + optional `id`; responses are `type: "response"`).

Live notes from `pi --mode rpc` (no `-p` / `--print` / `--mode json` / `--extension`):

- Commands: `prompt`, `steer`, `abort`, `get_state`, `get_available_models`, `get_available_thinking_levels`, `get_commands`, `get_fork_messages`, `fork` `{entryId}`, `clone`, `switch_session`, …
- `rewind` → `success: false`, `error: "Unknown command: rewind"`
- `clear_queue` → `success: false`, `error: "Unknown command: clear_queue"` (docs/latest has it; 0.84.2 does not)
- JSON-RPC `{jsonrpc, method}` → `error: "Unknown command: undefined"` (no `command` field)
- `id` is echoed as sent: string stays string, number stays number
- `data` is omitted on prompt/steer/abort success; present on get_state / get_fork_messages / clone / fork
- `get_fork_messages.data.messages[]` is `{entryId, text}`
- `fork` / `clone` success `data` is `{text?, cancelled}` — new path comes from a following `get_state.sessionFile`
- `agent_settled` completes the host turn; abort response is written **after** settled events
- User `message_start` / `message_end` frames are emitted around each prompt

Live main `/ws` (2026-09-02): spawn/handshake/turn/`tool_call` (bash/execute **and write/edit**) and `/fork` pass. `/rewind` is **not** intercepted (user turn). This machine: `pi list` → no packages; `~/.pi/agent/extensions/` does not call `ui.confirm`.

`tool-edit.jsonl` (2026-09-05, DeepSeek): live `edit` end frame with `details.patch` / `details.diff`. Mapper must prefer `details.patch` as Atmos `Text` (existing edit card presents patch) — not the `content[]` summary alone.

## Permission honesty

CLI 0.84.2 has **no built-in tool-permission chrome**. `--approve` / `-na` is project-local file trust, not a mapper gap. RPC `extension_ui_request` `confirm` is extension UI (`ctx.ui.confirm`), not write/edit/bash. Live main `/ws` write + bash complete with **no** `permission_requested` when no extension calls `ui.confirm`. Pin mapping on `extension-ui-confirm.jsonl` (`allow`/`deny`). `extension-ui-select.jsonl` pins Ask-style ApprovalCard `questions[]` from `method: select` (reply → `extension_ui_response` `{ value }`). `tool-write.jsonl` pins write→edit with no UI confirm.

CI does not spawn a live `pi` binary. Re-record these files when the published RPC command/event shapes change; note `pi --version` beside the pin.
