# PT Design

Prototype Design — Agent-first wireframe board + Design IR. Not live shadcn. Not Atmos Canvas.

`@atmos/pt-design` is a **library**, not one long-running product server. The playground, MCP, CLI, and Atmos embed are separate entry points that share the same session/IR code.

| Entry | What it is | Starts a process? | Talks to the others? |
|-------|------------|-------------------|----------------------|
| Atmos center tab | React embed of `PtDesignApp` | No — mounts inside web/desktop | No |
| Playground | Local HTML host for the same React app | Yes — `Bun.serve` on `:4173` | No |
| CLI `pt-design` | One-shot tool runner | Exits after the command | Only via `--file` |
| MCP `pt-design-mcp` | Stdio JSON-RPC tool server | Yes — stays up on stdin/stdout | Only via `--file` |

Starting the playground does **not** start MCP. Starting MCP does **not** serve a web UI.

Live edits go through **Excalidraw collaboration**. The open Atmos board is the room, not a second file. Click **Share** first. Agents join that same room (`PT_DESIGN_COLLAB_ROOM=id,key` or the file `collab` field) as `Agent`, pull the live scene, then publish. Offline `.ptdesign.json` is only for documents that are not the live board.

---

## Atmos embed

Open Prototype Design from the Launchpad or the `pt-design` center tab. The web app lazy-loads `PtDesignApp`. The working draft stays in `localStorage`. **Save** / **Open** write `*.ptdesign.json` under `~/.atmos/data/pt-design/` via the local Atmos Server.

---

## Standalone playground (human UI)

```bash
bun --cwd packages/pt-design playground
# http://127.0.0.1:4173
# PT_DESIGN_PLAYGROUND_PORT=5174 bun --cwd packages/pt-design playground
```

This is **not Vite**. `playground/server.ts` uses `Bun.build` + `Bun.serve`. Port `4173` is only a default; it happens to match `vite preview`.

The playground is a thin host: it mounts `PtDesignApp` with no Atmos API/Hub. Use it to draw without launching the full app.

---

## CLI (scripts / agents, no UI)

```bash
bun packages/pt-design/bin/pt-design.mjs doc init --file ./app.ptdesign.json --json
bun packages/pt-design/bin/pt-design.mjs place button --at 10,10 --file ./app.ptdesign.json --json
bun packages/pt-design/bin/pt-design.mjs ir get --file ./app.ptdesign.json --json
```

Every mutating command needs `--file`. Success: `{ "ok": true, "data": ... }`. Errors: `{ "ok": false, "error": { "code", "message" } }`.

Mutating CLI/MCP commands publish the new scene into the collaboration room when `PT_DESIGN_COLLAB_ROOM` or the file's `collab` field is set. The Agent cursor uses `PT_DESIGN_AGENT_NAME` / `AGENT_NAME`, otherwise `Agent`.

---

## MCP

Standard local MCP server: `@modelcontextprotocol/sdk` `McpServer` + `StdioServerTransport` + Zod input schemas. Server name: `pt-design-mcp-server`.

Starting the playground does **not** start MCP. MCP is not an HTTP URL. The client **spawns** this process and speaks MCP over stdin/stdout (`StdioServerTransport`).

```bash
bun packages/pt-design/bin/pt-design-mcp.mjs --file ./app.ptdesign.json
# or: PT_DESIGN_FILE=./app.ptdesign.json bun packages/pt-design/bin/pt-design-mcp.mjs
```

Atmos in-app Agents should **not** use this. They call `POST /api/pt-design/agent/invoke` on the local Atmos Server (see Live collaboration).

For an **external** MCP client (Cursor / Claude Desktop) after `@atmos/pt-design` is published:

```json
{
  "mcpServers": {
    "pt-design": {
      "command": "npx",
      "args": ["-y", "-p", "@atmos/pt-design", "pt-design-mcp"],
      "env": {
        "PT_DESIGN_COLLAB_ROOM": "id,key"
      }
    }
  }
}
```

`npx @atmos/pt-design` alone starts the Ink CLI, not MCP. From this repo in development you can still spawn `bun packages/pt-design/bin/pt-design-mcp.mjs`. The package is private today — `npx` will not resolve it until it is published.

Inspect:

```bash
npx @modelcontextprotocol/inspector bun packages/pt-design/bin/pt-design-mcp.mjs --file ./app.ptdesign.json
```

Do not point an MCP client at `:4173`. Logs go to stderr only.

### What you get

- Tools: `pt_catalog_list`, `pt_ir_get`, `pt_place`, … (same names as the CLI). Each has a Zod schema, title, description, and annotations (`readOnlyHint` / `destructiveHint` / `idempotentHint`).
- Resources: `pt-design://catalog`, `pt-design://ir`
- Prompt: `pt_design_handoff`
- List tools support `limit` / `offset` / `response_format` (`json` | `markdown`)

### Sharing state with the UI

MCP and playground do **not** share memory. Pass the same `--file` to CLI and MCP. The Atmos embed currently persists localStorage, not that file.

Without `--file`, the server keeps an in-memory document for the process lifetime.

---

## Live collaboration

The share popover has two tabs. **Local** (default) is this computer only: copy an Agent prompt — no public URL. **Invite** publishes a `https://app.atmos.land/?tab=pt-design#room=…` link over Atmos Relay (official oss-collab fallback). Local fan-out is `ws://127.0.0.1:<port>/ws/pt-design/:roomId`.

**Atmos Agent on this machine** does not use MCP or a PATH binary. Start **Local** collaboration, copy the prompt, and the Agent `POST`s `http://127.0.0.1:<port>/api/pt-design/agent/invoke`. Atmos Server forwards the tool to the open board. No user MCP config.

Copied share links always point at the hosted app (`https://app.atmos.land/?tab=pt-design#room=id,key`), even when you started the session from Desktop or `localhost`. The local address bar can stay on loopback — only the copied link is rewritten. Override with `PT_DESIGN_SHARE_ORIGIN` / `NEXT_PUBLIC_PT_DESIGN_SHARE_ORIGIN`.

1. Open the board and click the collab / **Share** control. That copies a link.
2. Anyone with the link joins the same scene and sees cursors.
3. An Agent joins as its own name (`PT_DESIGN_AGENT_NAME` / `AGENT_NAME`, otherwise `Agent`) when MCP/CLI mutate a file that already has `collab`, or when `PT_DESIGN_COLLAB_ROOM=id,key` is set.

```bash
bun --cwd packages/pt-design playground
PT_DESIGN_COLLAB_ROOM=id,key PT_DESIGN_AGENT_NAME=Codex \
  bun packages/pt-design/bin/pt-design.mjs place button --at 80,80 --file ./app.ptdesign.json --json
```

---

## Package layout

- `@atmos/pt-design` — `PtDesignApp` (browser Excalidraw)
- `@atmos/pt-design/headless` — session, IR, CLI/MCP helpers (no Excalidraw)

Do not import Atmos API/Hub/Relay clients or `@workspace/ui` from this package.

Copyright for Excalidraw-compatible scene shapes: MIT Excalidraw (if used). Ink MIT if used.
