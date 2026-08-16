# PT Design

Prototype Design — wireframe board + Agent IR. Not live shadcn. Not Atmos Canvas.

## CLI

```bash
bun packages/pt-design/bin/pt-design.mjs doc init --file ./app.ptdesign.json --json
bun packages/pt-design/bin/pt-design.mjs place button --at 10,10 --file ./app.ptdesign.json --json
bun packages/pt-design/bin/pt-design.mjs ir get --file ./app.ptdesign.json --json
```

## Playground

```bash
bun --cwd packages/pt-design playground
```

Opens a standalone host that mounts `PtDesignApp` (Excalidraw board) without Atmos API/Hub.

## MCP

```json
{
  "mcpServers": {
    "pt-design": {
      "command": "bun",
      "args": ["packages/pt-design/bin/pt-design-mcp.mjs", "--file", "./app.ptdesign.json"]
    }
  }
}
```

Copyright for Excalidraw-compatible scene shapes: MIT Excalidraw (if used). Ink MIT if used.
