# Prototype Design command reference (on-demand)

Full tool list, HTTP envelope, errors, and the offline file path. Default PTX workflow stays in the parent `SKILL.md`.

---

## HTTP envelope (live board)

```
POST http://127.0.0.1:<port>/api/pt-design/agent/invoke
Content-Type: application/json
```

```json
{ "request_id": "<uuid>", "tool": "pt_ptx_get", "args": { }, "client_id": "global" }
```

```json
{ "ok": true,  "request_id": "<uuid>", "data": { … } }
{ "ok": false, "request_id": "<uuid>", "error": { "code": "…", "message": "…", "recoverable": true } }
```

Mint a new `request_id` every call. `client_id` from the copied prompt when multiple tabs are open.

Do not start MCP. Do not join a collaboration room.

---

## Tools

| Tool | Args | Notes |
|------|------|--------|
| `pt_ptx_get` | — | Pretty XML string |
| `pt_ptx_apply` | `ptx` | Complete `<page>` document |
| `pt_catalog_list` | — | `type`, `xmlExample`, `agentDescription`, `defaultBBox` |
| `pt_screenshot` | `nodeIds?`, `maxEdge?` | Open tab only |
| `pt_doc_init` | `path` | `.ptd` / `document.ptx` |
| `pt_doc_open` | `path`, `create?` | Returns `{ ptx }` |
| `pt_doc_save` | `path?` | Writes `document.ptx` |
| `pt_tools_list` | — | |

---

## Errors

| Code | Recovery |
|------|----------|
| `PT_DESIGN_BRIDGE_OFFLINE` | Open Prototype Design |
| `PT_DESIGN_CLIENT_AMBIGUOUS` | Pass `client_id` |
| `PT_DESIGN_CLIENT_NOT_FOUND` | Open the matching tab |
| `unknown_tool` | `pt_tools_list`. Old APP-062 names are not registered |
| `unknown_type` | `pt_catalog_list` |
| `invalid_ptx` / `invalid_option` | Previous document unchanged |
| `missing_file` | `--file` a `.ptd` directory |
| `path_denied` | Screenshot is live-tab only; doc tools need a `.ptd` path |
| `RELAY_TIMEOUT` | Retry with a new `request_id` |

---

## Offline file (CLI / MCP)

Only for a `.ptd` bundle (`document.ptx`) that is **not** the open tab.

```bash
pt-design doc init --file ./app.ptd --json
pt-design-mcp --file ./app.ptd
```

`.ptdesign.json` is not the Agent API.
