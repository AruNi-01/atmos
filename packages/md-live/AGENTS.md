# `@atmos/md-live` (APP-067)

Two layers in one package:

- **Codec** (`.`) — `:md-live` / `::md-live` directives, `<!--atmos-md-live-->` fence extractor, AgentRequest prompt rendering, Canvas-style `Untitled.md` names. No React.
- **UI** (`./ui`) — Milkdown live editor engine, slash catalog, emoji-mart picker, GFM commands, heading ids. Host supplies `/` menu and selection toolbar with `@workspace/ui` Popover/Command/DropdownMenu. Do not import `@workspace/ui` here.

**Must not** import `api-*`, `apps/*`, `@workspace/ui`, or `@atmos/shared`.

Host business UI (Agent dock, Save as, Atmos GitHub embeds, PTY) lives in `apps/web/src/features/md-live`.
