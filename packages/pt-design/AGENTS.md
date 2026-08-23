# PT Design (`@atmos/pt-design`)

Agent-first prototype wireframe package (APP-062).

## Public API

- `@atmos/pt-design` — `PtDesignApp` embed (official Excalidraw board) + re-exports
- `@atmos/pt-design/headless` — session, IR, file, CLI/MCP helpers (no browser Excalidraw)

`@excalidraw/excalidraw` may be imported only under `src/embed/`. Headless, CLI, and MCP must stay free of that import.

## Binaries

- `pt-design` — Ink-compatible Agent CLI (`--json`)
- `pt-design-mcp` — MCP stdio for **external** agents only

Atmos in-app Agents call `POST /api/pt-design/agent/invoke` on the local Server after the board tab is open. Share is not required. CLI/MCP only edit `--file`. Do not tell users to put `pt-design-mcp` on PATH or paste MCP JSON.

Live-board drawing: `pt_tools_list` / `pt_catalog_list` (includes `defaultBBox` + `propKeys`), `pt_frame_create` presets, `pt_place` (one instance; `at` is frame-relative when `frameId` is set), `pt_batch`, `pt_layout_*`, `pt_lint`, `pt_screenshot` (open tab only). Human catalog clicks may still dump a variant showcase; the Agent path does not. Agent activity island UI lives in `apps/web` (`AgentSurfaceIsland`), shared with Canvas.

## Forbidden imports

Do not import `@atmos/api-types`, `@atmos/api-client`, `@atmos/hub-client`, `@atmos/relay-client`, `@atmos/shared`, `@workspace/ui`, or `apps/*` (including `apps/cli`) from this package.

Do not put Design IR types in api-types.

## Skill

Canonical: `skills/atmos-pt-design-agent/` (synced to `~/.atmos/skills/.system/atmos-pt-design-agent/`). Copy prompt points Agents at that path. Package stub: `skills/pt-design/SKILL.md`.
