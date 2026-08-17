# PT Design Skill

## When to use

Sketch UI structure as wireframes Agents can read and edit. Not live components. Not Atmos Canvas.

## Install / run

From the Atmos monorepo:

```bash
bun packages/pt-design/bin/pt-design.mjs --help
```

## File workflow

Design files are `.ptdesign.json`.

1. `pt-design doc init --file ./app.ptdesign.json --json`
2. Mutate with `--file` on every command
3. `pt-design ir get --file ./app.ptdesign.json --json`

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

Official `@modelcontextprotocol/sdk` stdio server (`pt-design-mcp-server`). Spawn `pt-design-mcp --file ./app.ptdesign.json`. Do not connect to the playground HTTP port. Tools use Zod schemas; resources are `pt-design://catalog` and `pt-design://ir`. See `packages/pt-design/README.md`.

## Non-goals

No live components. No Atmos Rust `atmos` CLI. No codegen requirement.
