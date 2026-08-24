# @atmos/api-types — AGENTS.md

> Main-app `/ws` wire types and `WsContract` map (APP-048 / APP-064). Plain TypeScript only. This is the Computer RPC contract — do not add oRPC/tRPC/ts-rest.

## Build And Test

```bash
bun run --filter @atmos/api-types test
bun run --filter @atmos/api-types typecheck
bun run --filter @atmos/api-types extract-actions   # fixtures/actions.server.json from Rust
bun run --filter @atmos/api-types check-actions
bun run --filter @atmos/api-types extract-events    # fixtures/events.server.json from Rust
bun run --filter @atmos/api-types check-events
```

## Ownership

- **Owns**: frames, `WsAction`, `WsEvent`, `WsContract` (`action → { input, output }`), `WsEventContract` (`event → payload`), DTOs under `src/ws/dto/*`
- **Does not own**: transport (`@atmos/api-client`), terminal PTY (`@atmos/shared/terminal`), desktop IPC, feature wrappers (`fsApi`, mobile `ws-actions.ts`)

Every `WsAction` must have a `WsContract` row. Every `WsEvent` must have a `WsEventContract` row. `UnmappedWsAction` is `never`.

## Adding a `WsAction` (same PR as Rust)

1. Rust: variant on `pub enum WsAction` in `apps/api/src/api/ws/message.rs`, request/response structs in `message.rs` or `message/<domain>.rs`, router arm under `apps/api/src/api/ws/router/`.
2. `bun run --filter @atmos/api-types extract-actions` → commit `fixtures/actions.server.json` → add the wire name to `src/ws/actions.ts`.
3. DTO: server JSON in `src/ws/dto/<domain>.ts` (snake_case, match serde nullability). Empty body = `WsEmpty` from `dto/common.ts`.
4. Contract: `{ input, output }` entry in `src/ws/contract/<domain>.ts`. Create that module and merge it in `src/ws/contract.ts` if the domain is new.
5. App wrapper only: `wsRequest("the_action", { ...wire })` or mobile `client.request("the_action", { ...wire })`. **No** `wsRequest<T>(...)`. CamelCase / defaults stay in the wrapper. Do not duplicate the DTO in the app — re-export from `@atmos/api-types/ws/dto/<domain>` when the wrapper needs a name.
6. `bun run --filter @atmos/api-types test` and typecheck web/mobile as touched.

`git_commit_skill_system_status` is a skills action (not git). Do not put it in `contract/git.ts`.

## Adding a `WsEvent`

1. Rust `pub enum WsEvent` → `extract-events` → `src/ws/events.ts`.
2. Payload DTO in `src/ws/dto/<domain>.ts` or `dto/events.ts`.
3. `{ payload }` row in `src/ws/event-contract.ts`.
4. Listeners: `session.onNotification("the_event", (payload) => …)` / web `onEvent(...)`. No `data as Foo` when the payload is already mapped.

Events that only mean “refetch” may use `RefreshNotification` (`unknown`).

## Call-site rules (apps)

```ts
await wsRequest("git_get_status", { path });           // inferred input + output
session.requestUnchecked(dynamicName, data);           // runtime-dynamic name only
session.onNotification("agent_notification", (p) => p.session_id);
```

Do not build `client.git.getStatus()` on `@atmos/api-client`. Do not declare a second `WsAction` union in an app.

## NEVER

- React, reconnect, or server handlers
- Hand-edit `fixtures/*.server.json` without re-running extract
- Terminal PTY types here
- oRPC / tRPC / ts-rest / OpenAPI-first rewrite of main `/ws`
- Hub / Relay / Computer REST DTOs (those are `@atmos/hub-client`, `@atmos/relay-client`, or the owning app — see [packages/AGENTS.md](../AGENTS.md) “HTTP contracts”)
- New unmapped actions or `request<T>` leftovers

## ALWAYS

- Prefer server wire when a TS type disagrees with Rust JSON
- Subpath imports: `@atmos/api-types/ws`, `.../ws/actions`, `.../ws/events`, `.../ws/contract`, `.../ws/event-contract`, `.../ws/dto/<domain>`

## Related

- [APP-048](../../specs/APP/APP-048_api-types/) · [APP-064](../../specs/APP/APP-064_api-contract-hardening/)
- [packages/AGENTS.md](../AGENTS.md) · [api-client/AGENTS.md](../api-client/AGENTS.md)
