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

---

## Atmos embed

Open Prototype Design from the Launchpad or the `pt-design` center tab. The web app lazy-loads `PtDesignApp`. Scene state lives in `localStorage` (`pt-design:scene:<contextId>`). No extra daemon or port.

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

---

## MCP

Standard local MCP server: `@modelcontextprotocol/sdk` `McpServer` + `StdioServerTransport` + Zod input schemas. Server name: `pt-design-mcp-server`.

Starting the playground does **not** start MCP. MCP is not an HTTP URL. The client **spawns** this process and speaks MCP over stdin/stdout (`StdioServerTransport`).

```bash
bun packages/pt-design/bin/pt-design-mcp.mjs --file ./app.ptdesign.json
# or: PT_DESIGN_FILE=./app.ptdesign.json bun packages/pt-design/bin/pt-design-mcp.mjs
```

Cursor / Claude Desktop / Claude Code / Inspector:

```json
{
  "mcpServers": {
    "pt-design": {
      "command": "bun",
      "args": [
        "/ABS/PATH/TO/atmos/packages/pt-design/bin/pt-design-mcp.mjs",
        "--file",
        "/ABS/PATH/TO/app.ptdesign.json"
      ]
    }
  }
}
```

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

## Package layout

- `@atmos/pt-design` — `PtDesignApp` (browser Excalidraw)
- `@atmos/pt-design/headless` — session, IR, CLI/MCP helpers (no Excalidraw)

Do not import Atmos API/Hub/Relay clients or `@workspace/ui` from this package.

Copyright for Excalidraw-compatible scene shapes: MIT Excalidraw (if used). Ink MIT if used.
