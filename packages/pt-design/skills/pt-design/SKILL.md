# PT Design Skill

## When to use

Sketch UI structure as wireframes Agents can read and edit. Not live components. Not Atmos Canvas.

## Install / run

On Atmos (Desktop / local Server): do **not** install a binary. After the user opens Prototype Design, `POST` the open board:

`POST http://127.0.0.1:<atmos-port>/api/pt-design/agent/invoke`

```json
{ "request_id": "<uuid>", "tool": "pt_ir_get", "args": {}, "client_id": "global" }
```

Use `client_id` from the Give to Agent payload when more than one tab is open. `/pt-design` is `global`. Do not start MCP. Do not join a collaboration room. Do not edit a separate `.ptdesign.json`.

From the Atmos monorepo only (dev / offline files):

```bash
bun packages/pt-design/bin/pt-design.mjs --help
```

## File workflow

Design files are `.ptdesign.json`. They are **not** the open tab.

1. `pt-design doc init --file ./app.ptdesign.json --json`
2. Mutate with `--file` on every command
3. `pt-design ir get --file ./app.ptdesign.json --json`

Prefer MCP/CLI tools over hand-editing the JSON.

## Live board (Atmos Prototype Design)

The user's open board is the tab's session, not a local `.ptdesign.json` copy.

1. Ask the user to open Prototype Design if no tab is live.
2. `POST` invoke. Opening the tab is enough. Share is only for other humans.
3. Call `pt_catalog_list` and `pt_ir_get` first, then mutate.
4. Offline `.ptdesign.json` files are only for documents that are not the open live board.

## Tool ↔ CLI table

| Tool | CLI |
|------|-----|
| pt_catalog_list | catalog list |
| pt_ir_get | ir get |
| pt_scene_get | scene get |
| pt_place | place |
| pt_update | update |
| pt_delete | delete |
| pt_frame_create | frame create |
| pt_frame_rename | frame rename |
| pt_frames_list | frame list |
| pt_apply_ir | apply-ir |
| pt_export | export |
| pt_handoff | handoff |
| pt_doc_init | doc init |
| pt_doc_open | doc open |
| pt_doc_save | doc save |

## JSON I/O

Use `--json`. Success: `{ "ok": true, "data": ... }`. Errors: `{ "ok": false, "error": { "code", "message" } }` on stdout; details on stderr. Exit 0 ok, 1 usage, 2 not found, 3 conflict, 4 internal.

## Get-before-set

Always `catalog list` and `ir get` before place/update/apply-ir.

## Handoff → implement

`pt-design handoff --scope frame --frame Login --file ./app.ptdesign.json --json`

Implement with real shadcn/other UI libraries outside the canvas. Prefer IR over screenshots. Do not invent major sections missing from IR. Do not pixel-chase.

## MCP

Optional for external agents only, and only against `--file`. Atmos does not ask the user to paste MCP JSON. Official `@modelcontextprotocol/sdk` stdio server (`pt-design-mcp-server`). After publish: `npx -y -p @atmos/pt-design pt-design-mcp`. Do not connect to the playground HTTP port. See `packages/pt-design/README.md`.

## Non-goals

No live components. No Atmos Rust `atmos` CLI. No codegen requirement.
