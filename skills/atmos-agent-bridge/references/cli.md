# `atmos agent-bridge` CLI

Thin client. `list` invokes `agent_session_status_list`. The other verbs except `skill-dir` are `POST /api/cli/invoke` with `agent_bridge_*`.

JSON envelope: `ok`, `command`, `result` or `error.code`.

## Verbs

```text
atmos agent-bridge list [--provider <id>] [--agent <id>] [--workspace <id>]
    [--limit N] [--cursor <next_cursor>]
atmos agent-bridge send --to-provider <id> [--to-chat <id>] --body <text>
    [--from-provider <id>] [--from-chat <id>]
    [--busy wait|queue|fail_fast] [--ttl-ms <n>]
    [--bag '{"goals":[],"paths":[],"refs":[],"artifacts":[],"danger":[]}']
    [--to '<json address>']   # repeat for an explicit same-Computer list
atmos agent-bridge request   # same flags as send
atmos agent-bridge reply --to-provider <id> --correlation-id <id> --body <text>
atmos agent-bridge status [--message-id <id>] [--context-ref <ref>]
    [--to-provider <id>] [--to-chat <id>]
atmos agent-bridge skill-dir
```

## List (session directory)

`list` calls `agent_session_status_list`. It does not have its own Bridge action.

`--provider` / `--agent` become `provider_ids`. `--workspace` becomes `context_id`. `--limit` and `--cursor` are the session list page (`updated_at` + newline + `session_id`). The response includes `sessions`, `counts`, `total`, `next_cursor`, and `agents` (enabled terminal agents, not limited to this page).

## Acks

`delivered` | `queued_busy` | `offline` | `timeout` | `rejected` | `accepted`

## Errors

| code                    | meaning                                     |
| ----------------------- | ------------------------------------------- |
| `AMBIGUOUS_TARGET`      | several live chats; pass `--to-chat`        |
| `CROSS_MACHINE_CONNECT` | connect to that Computer, then retry        |
| `CONTEXT_REF_REMOTE`    | pull the bag on the Computer that stored it |
| `UNKNOWN_PROVIDER`      | not a known chat or installed provider      |
| `BUSY`                  | `fail_fast` while the target is mid-turn    |

## V1 cross-Computer

CLI already resolves `--api-url` / `ATMOS_API_URL` / `~/.atmos/client-session.json` / runtime manifest. Same verbs. Each Server owns its mailbox. No push of context bags.
