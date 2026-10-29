# Live markdown agent — command reference

```text
POST http://127.0.0.1:<port>/api/md-live/agent/invoke
```

Every call:

```json
{
  "request_id": "<uuid>",
  "tool": "<name>",
  "args": {},
  "client_id": "<from prompt>"
}
```

Optional `timeout_ms` (clamped by the server).

`GET /api/md-live/agent/status` lists registered Live tabs.

## Tools

| Tool                        | Args                    | Result                                     |
| --------------------------- | ----------------------- | ------------------------------------------ |
| `md_live_get`               | `{}`                    | `{ path, markdown, selection, client_id }` |
| `md_live_tools_list`        | `{}`                    | `{ tools: string[] }`                      |
| `md_live_replace_selection` | `{ "markdown": "..." }` | `{ path, markdown }` after stream          |
| `md_live_insert`            | `{ "markdown": "..." }` | `{ path, markdown }` after stream          |
| `md_live_replace_document`  | `{ "markdown": "..." }` | `{ path, markdown }` after stream          |

`command` is accepted as an alias of `tool`.

## Errors

| Code                       | When                                             | Recoverable |
| -------------------------- | ------------------------------------------------ | ----------- |
| `VALIDATION_ARG`           | Missing `request_id` / `tool`, or args too large | no          |
| `MD_LIVE_BRIDGE_OFFLINE`   | No Live tab registered                           | yes         |
| `MD_LIVE_CLIENT_AMBIGUOUS` | Several Live tabs; pass `client_id`              | yes         |
| `MD_LIVE_CLIENT_NOT_FOUND` | `client_id` does not match an open tab           | yes         |
| `BRIDGE_DISABLED`          | Tab is not accepting agent calls                 | yes         |
| `RELAY_TIMEOUT`            | Tab did not answer                               | yes         |
| `UNKNOWN_TOOL`             | Tool name is not in the Live allow-list          | no          |
| `STREAM_BUSY`              | Live is already streaming another edit           | yes         |

Do **not** use `fs_write` of the Live document path. The host applies mutating tools through Milkdown streaming.
