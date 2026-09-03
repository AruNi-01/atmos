# Native Claude Code Chat fixtures

PINNED_CLI: `2.1.252` (2.1.x family: `tool_use_id` on `can_use_tool`, nested `control_response.response.request_id`, allow requires `updatedInput`).

Recorded against live `/Users/aarynlu/.local/bin/claude` (`2.1.252 (Claude Code)`):

- Duplex `--input-format stream-json --output-format stream-json` emits NDJSON with piped stdio **without** `--print`. `--help` still says those flags "only work with --print"; that text is wrong for non-TTY stdout. Chat spawn keeps omitting `--print`.
- `--permission-prompt-tool stdio` is accepted but **not listed** in `--help`.
- `--replay-user-messages` re-emits stdin user turns on stdout with top-level `uuid` + `isReplay: true` (required for rewind `checkpoint_id`).
- New omit frames: `command_lifecycle` (`queued`/`started`/`cancelled`), `system`/`status`, `system`/`api_retry`, `system`/`hook_started`, `system`/`hook_response`.
- `rewind_files` success payload includes `canRewind`, `filesChanged`, `insertions`, `deletions`. `rewind_conversation` success includes `rewound`, `targetMessageUuid`, `prefillText`, `precedingAssistantUuid`. Bare `subtype: "rewind"` is rejected (`Unsupported control request subtype: rewind`).
- Initialize `models[]` use `value` + `displayName` + per-model `supportedEffortLevels` (no top-level `effortLevels`). `current_permission_mode` is `"default"`; `--permission-mode` help lists `acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk`, `plan`. Live `set_permission_mode` `{mode:"manual"}` can succeed while echoing `{mode:"default"}`.
- Live 2.1.252 (2026-09-02, main `/ws`): read-only `echo` Bash auto-completes with **no** `can_use_tool`. A write (`printf 'hi' > atmos-perm-probe.txt`) emits `control_request`/`can_use_tool` → WS `permission_requested` with `allow_once` / `allow_always` / `reject_once` / `reject_always`. Allow stdin is still `behavior` + `updatedInput` (`permission_allow.stdin.json`). Adapter `respond_permission` does **not** emit `PermissionResolved` (service does); after that fix, `/ws` has one `permission_resolved` (`ws-claude-perm-2.log`).

Agent SDK cross-check (same wire window):

- Python `SDKControlResponse` / `PermissionResultAllow|Deny` (`behavior`, not `allowed`)
- TypeScript `PermissionResult` `{ behavior: "allow"|"deny", updatedInput? }`
- Host → CLI `control_request` keeps `request_id` top-level; CLI → host `control_response` nests `request_id` inside `response`

CI does not need a live `claude` binary. Frames follow the published stream-json + stdio control protocol (Agent SDK `_build_command`: **no `--print`**). Chat spawn is duplex `--input-format stream-json` plus `--replay-user-messages`.

Rewind control (host → CLI): `testdata/rewind_files.stdin.json` (`subtype: rewind_files`, `user_message_id`, `dry_run`) and `testdata/rewind_conversation.stdin.json` (`subtype: rewind_conversation`, `target_message_uuid`, `interrupt_if_running: false`). Fork is `--resume=<id> --fork-session` on a new child, not a live control subtype. Live 2.1.252 keeps stdin open (EOF exits before any session frames). `--fork-session` first emits `system/hook_started` `SessionStart:fork` with the new `session_id` and answers host `initialize`; it may never emit `system/init`.
