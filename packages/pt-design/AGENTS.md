# PT Design (`@atmos/pt-design`)

Agent-first prototype wireframe package (APP-062).

## Public API

- `@atmos/pt-design` — `PtDesignApp` embed (official Excalidraw board) + re-exports
- `@atmos/pt-design/headless` — session, IR, file, CLI/MCP helpers (no browser Excalidraw)

`@excalidraw/excalidraw` may be imported only under `src/embed/`. Headless, CLI, and MCP must stay free of that import.

## Binaries

- `pt-design` — Ink-compatible Agent CLI (`--json`)
- `pt-design-mcp` — MCP stdio server

## Forbidden imports

Do not import `@atmos/api-types`, `@atmos/api-client`, `@atmos/hub-client`, `@atmos/relay-client`, `@atmos/shared`, `@workspace/ui`, or `apps/*` (including `apps/cli`) from this package.

Do not put Design IR types in api-types.

## Skill

`skills/pt-design/SKILL.md`
