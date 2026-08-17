# PT Design Skill

## When to use

Sketch UI structure as wireframes Agents can read and edit. Not live components. Not Atmos Canvas.

## Install / run

On Atmos (Desktop / local Server): do **not** install a binary. After the user starts **Local** collaboration, `POST` the open board:

`POST http://127.0.0.1:<atmos-port>/api/pt-design/agent/invoke`

```json
{ "request_id": "<uuid>", "tool": "pt_ir_get", "args": {}, "room": "id,key" }
```

From the Atmos monorepo only (dev / offline files):

```bash
bun packages/pt-design/bin/pt-design.mjs --help
```

## File workflow

Design files are `.ptdesign.json`.

1. `pt-design doc init --file ./app.ptdesign.json --json`
2. Mutate with `--file` on every command
3. `pt-design ir get --file ./app.ptdesign.json --json`

Prefer MCP/CLI tools over hand-editing the JSON.

## Live board (Atmos Prototype Design)

The user's open board is **not** a local `.ptdesign.json` copy. It lives in the collaboration room.

1. The user must click **Share** first. If they have not, ask them to start live collaboration. Do not invent a second canvas file.
2. Join the same room: `PT_DESIGN_COLLAB_ROOM=id,key` from the share link or the Give to Agent payload `collab` field.
3. Pull the live scene (`pt_scene_get` / `pt_ir_get` after joining) then mutate. Publishing a stale file overwrites their board.
4. Your cursor name is `PT_DESIGN_AGENT_NAME` / `AGENT_NAME`, otherwise `Agent`. The user should see that name on the canvas.

Offline `.ptdesign.json` files are only for documents that are not the open live board.

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

Optional for external agents only. Atmos does not ask the user to paste MCP JSON. Official `@modelcontextprotocol/sdk` stdio server (`pt-design-mcp-server`). After publish: `npx -y -p @atmos/pt-design pt-design-mcp`. Do not connect to the playground HTTP port. See `packages/pt-design/README.md`.

## Non-goals

No live components. No Atmos Rust `atmos` CLI. No codegen requirement.
