# `atmos agent-bridge` CLI

Thin client. Every verb except `skill-dir` is `POST /api/cli/invoke` with `agent_bridge_*`.

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

`list` returns **Chat sessions** on the connected Computer, newest activity first. It does **not** emit Native / Registry / Custom / Terminal provider install rows. Send addressing still uses `provider_id`; unknown ids still fail `UNKNOWN_PROVIDER` against known chats or installed providers.

Default `--limit` is **20**. Values above **100** are clamped. Response includes `entries`, `has_more`, and `next_cursor` (opaque: last activity timestamp + newline + `chat_id`). Pass `--cursor` to load the next page.

Each entry includes `chat_id`, `provider_id`, real `title` (untitled falls back to `provider_id`, never `chat {id}`), `workspace_id`, optional `project_id`, `occupancy` (`idle` / `running` / `permission_request`), and `updated_at` / `last_activity_at` from the chat index.

`--provider` and `--agent` are the same filter. Combine with `--workspace`.

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
