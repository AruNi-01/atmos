# PT Design (`@atmos/pt-design`)

Interactive canvas package (APP-073). PTX is the Agent/file source. Live board SoT is the Excalidraw scene (LiveBoard). Not Atmos Canvas.

## Public API

- `@atmos/pt-design` — `PtDesignApp` embed (official Excalidraw board) + re-exports
- `@atmos/pt-design/headless` — `createHeadlessSession`, file, CLI/MCP helpers (no browser Excalidraw)
- `@atmos/pt-design/catalog` — local persist library (list/pin/rename/delete, no Excalidraw)

`@excalidraw/excalidraw` may be imported only under `src/embed/`. Headless, CLI, and MCP must stay free of that import.

## Binaries

- `pt-design` — Ink-compatible Agent CLI (`--json`)
- `pt-design-mcp` — MCP stdio for **external** agents only

Atmos in-app Agents call `POST /api/pt-design/agent/invoke` on the local Server after the board tab is open. Share is not required. CLI/MCP only edit `--file` (`.ptd` / `document.ptx`). Do not tell users to put `pt-design-mcp` on PATH or paste MCP JSON.

Live-board tools: `pt_ptx_get`, `pt_ptx_apply`, `pt_catalog_list` (XML snippet per type), `pt_screenshot` (open tab only), `pt_tools_list`. File tools: `pt_doc_init` / `pt_doc_open` / `pt_doc_save`. Human palette inserts the same PTX nodes an Agent would type. Agent activity island UI lives in `apps/web` (`AgentSurfaceIsland`).

Live session vs Excalidraw: `embed/live-board.ts`. Overlay, inspector, and `pt_ptx_get` extract from the scene. Agent/palette writes project with `updateScene`. Do not reintroduce `createPtDesignSession` as a parallel store.

## Forbidden imports

Do not import `@atmos/api-types`, `@atmos/api-client`, `@atmos/hub-client`, `@atmos/relay-client`, `@atmos/shared`, `@workspace/ui`, or `apps/*` (including `apps/cli`) from this package.

Keep `catalog/shadcn-list.ts` as the frozen id list. New catalog entry is `src/components/registry.ts`.

Overview cards are static screenshots (`PtPersistV2.meta.preview`: PNG/JPEG/WebP data URL or `idb:pt-preview/{id}`). Capture from the **open** board on save / Back (`captureLiveScreenshot`). Do not mount Excalidraw or OverlayHost per card.

## Skill

Canonical: `skills/atmos-pt-design-agent/` (synced to `~/.atmos/skills/.system/atmos-pt-design-agent/`). Copy prompt points Agents at that path. Package stub: `skills/pt-design/SKILL.md`.
