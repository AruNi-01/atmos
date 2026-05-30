# Web Features

Feature folders own business-specific UI, hooks, stores, local helpers, and
types. Keep files near the workflow they serve, but keep each feature internally
layered.

## Rules

- Put feature-only components, hooks, stores, and utilities inside the owning
  feature.
- Use these subfolders when present:
  - `components/` for React views and feature UI.
  - `hooks/` for React hooks and `use-*` orchestration.
  - `store/` for Zustand stores and store helper modules.
  - `lib/` for pure helpers, adapters, transport helpers, and domain utilities.
  - `types/` for feature-level shared types.
- Keep the feature root thin. It should usually contain only `AGENTS.md` and
  intentional public barrels such as `index.ts`.
- Promote code to `src/shared/` only when multiple unrelated features use it.
- Keep `src/api/` as the transport boundary. Feature code should call the
  existing WS/REST client modules instead of raw `fetch`.
- Do not import from another feature's private implementation unless that file
  is intentionally part of its public surface, such as an exported view,
  provider, or typed model helper.

## Current Feature Areas

- `agent/` — agent chat UI, agent manager, agent session hooks, agent thread
  helpers.
- `canvas/` — canvas/tldraw runtime, canvas agent bridge, canvas settings.
- `code-review/` and `diff/` — review workflows and diff/code viewing.
- `connection/`, `atmos-computer/`, and `tunnel-connector/` — local/relay
  connection state, Atmos Computer setup, tunnel connector UI.
- `project/` and `workspace/` — project/workspace state, management views, and
  CRUD dialogs.
- `settings/` — settings modal sections and settings-backed stores.
- `terminal/` — terminal UI, terminal store, terminal settings helpers.
