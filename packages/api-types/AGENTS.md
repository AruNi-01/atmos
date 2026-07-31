# @atmos/api-types — AGENTS.md

> Main-app `/ws` wire types for Atmos clients (APP-048). Plain TypeScript only.

## Build And Test

```bash
bun run --filter @atmos/api-types test
bun run --filter @atmos/api-types typecheck
bun run --filter @atmos/api-types extract-actions   # refresh fixtures/actions.server.json from Rust
bun run --filter @atmos/api-types check-actions     # TS catalog vs fixture
```

## Ownership

- **Owns**: frames, `WsAction` catalog, multi-client DTOs under `src/ws/dto/*`
- **Does not own**: transport/reconnect (→ `@atmos/api-client`), terminal stream protocol (→ `@atmos/shared/terminal`), desktop IPC, business rules

## NEVER

- React, reconnect logic, or server handlers
- Hand-edit `fixtures/actions.server.json` without re-running extract from `apps/api/src/api/ws/message.rs`
- Put terminal PTY message types here

## ALWAYS

- When adding a Rust `WsAction` variant: update enum → `bun run extract-actions` → update `src/ws/actions.ts` (or re-generate) in the same PR
- Prefer server wire nullability when merging multi-client DTOs
- Use subpath imports (`@atmos/api-types/ws`, `.../ws/dto/git`)

## Related

- [specs/APP/APP-048_api-types](../../specs/APP/APP-048_api-types/)
- [packages/AGENTS.md](../AGENTS.md) (APP-050 layer map)
