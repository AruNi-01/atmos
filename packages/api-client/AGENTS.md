# @atmos/api-client — AGENTS.md

> Non-UI main-app WebSocket session kernel (APP-049 / APP-064). Transport only — not a domain SDK.

## Build And Test

```bash
bun run --filter @atmos/api-client test
bun run --filter @atmos/api-client typecheck
```

## Ownership

- **Owns**: connect/disconnect/reconnect, pending map, `request` / `requestWhenReady` / `requestUnchecked`, notification fan-out
- **Does not own**: URL/auth/bootstrap (apps), Query (APP-035), terminal PTY, desktop IPC, wire types (`@atmos/api-types`), `gitApi` / `workspaceApi`

`request()` infers input/output from `@atmos/api-types` `WsContract`. New Computer RPC methods belong in app wrappers (`apps/web/src/api/ws/*`, `apps/mobile/src/api/ws-actions.ts`), not on `WsSession`.

## NEVER

- Depend on React, React Native, Zustand, Next, or `@workspace/ui`
- Import app stores or Query clients
- Set WebSocket Authorization headers (apps pass a ready URL)
- Queue requests while disconnected
- Add domain methods (`session.git.getStatus()`) or a second RPC framework

## ALWAYS

- Import frames/actions/contract from `@atmos/api-types`
- Mapped calls: `session.request("git_get_status", { path })` — no caller `T`. Every `WsAction` is mapped.
- `onNotification("agent_notification", cb)` infers `cb`’s payload from `WsEventContract`
- `requestUnchecked` only when the action **name** is not a compile-time `WsAction`
- Export reconnect defaults (`DEFAULT_WEB_RECONNECT`, `DEFAULT_MOBILE_RECONNECT`)
- Redact tokens in logs

## Related

- [APP-049](../../specs/APP/APP-049_api-client/) · [APP-064](../../specs/APP/APP-064_api-contract-hardening/)
- [api-types/AGENTS.md](../api-types/AGENTS.md) · [packages/AGENTS.md](../AGENTS.md)
