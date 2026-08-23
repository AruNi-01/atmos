# Prototype Design command reference (on-demand)

Full tool list, HTTP envelope, errors, and the offline file path. Default drawing workflow stays in the parent `SKILL.md`.

---

## HTTP envelope (live board)

```
POST http://127.0.0.1:<port>/api/pt-design/agent/invoke
Content-Type: application/json
```

```json
{ "request_id": "<uuid>", "tool": "pt_place", "args": { }, "client_id": "global" }
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
| `pt_tools_list` | — | name / args / whether live |
| `pt_catalog_list` | `kind?` basic\|block | `defaultBBox`, `propKeys`, `variants` |
| `pt_ir_get` | `frameId?`, `instanceIds?` | Scene coordinates |
| `pt_scene_get` | — | Raw scene; prefer IR |
| `pt_place` | `componentType`, `at?`, `below?`, `rightOf?`, `props?`, `variant?`, `size?`, `frameId?`, `mode?` | One instance by default |
| `pt_update` | `instanceId`, `props?`, `variant?`, `size?`, `bbox?`, `frameId?` | Scene bbox; `w/h` scales the instance |
| `pt_delete` | `instanceId` \| `instanceIds` | |
| `pt_frame_create` | `name?`, `x?`, `y?`, `w?`, `h?`, `preset?` | desktop\|tablet\|mobile |
| `pt_frame_rename` | `frameId`, `name` | |
| `pt_frame_update` | `frameId`, `name?`, `x?`, `y?`, `w?`, `h?` | Children follow origin |
| `pt_frame_delete` | `frameId`, `orphan?` | |
| `pt_frames_list` | — | |
| `pt_layout_row` | `instanceIds`, `gap?`, `align?` | |
| `pt_layout_column` | `instanceIds`, `gap?`, `align?` | |
| `pt_layout_grid` | `instanceIds`, `columns`, `gap?`, `rowGap?` | |
| `pt_lint` | `frameId?` | |
| `pt_screenshot` | `frameId?`, `instanceIds?`, `maxEdge?` | Open tab only |
| `pt_batch` | `ops[]`, `atomic?` | Max 200; no nested batch |
| `pt_export` | — | IR + scene; `image` is null here — use `pt_screenshot` |
| `pt_handoff` | `scope?`, `frameId?`, `instanceIds?` | Implementer payload |
| `pt_apply_ir` | `ir`, `mode?`, `dryRun?` | Import/replace — not drawing |
| `pt_doc_*` | — | **Rejected on the live board** |

Board geometry: [`board.md`](board.md). Catalog props: [`catalog.md`](catalog.md).

---

## Errors

| Code | Recovery |
|------|----------|
| `PT_DESIGN_BRIDGE_OFFLINE` | Open Prototype Design |
| `PT_DESIGN_CLIENT_AMBIGUOUS` | Pass `client_id` |
| `PT_DESIGN_CLIENT_NOT_FOUND` | Open the matching tab |
| `BRIDGE_DISABLED` | Tab is not accepting agent calls |
| `UNKNOWN_COMPONENT_TYPE` | `pt_catalog_list` |
| `NOT_FOUND` | `pt_ir_get` / `pt_frames_list` |
| `FRAME_AMBIGUOUS` | Use frame id, not a duplicate name |
| `USAGE` | `pt_tools_list`; unknown tool names list legal tools |
| `RELAY_TIMEOUT` | Retry with a new `request_id` |

---

## Offline file (CLI / MCP)

Only for a `.ptdesign.json` that is **not** the open tab.

```bash
bun packages/pt-design/bin/pt-design.mjs doc init --file ./app.ptdesign.json --json
bun packages/pt-design/bin/pt-design.mjs place button --at 10,10 --file ./app.ptdesign.json --json
```

MCP: `pt-design-mcp --file ./app.ptdesign.json`. Atmos in-app agents must **not** start MCP.

`pt_screenshot` does not work on this path.
