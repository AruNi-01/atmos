# @atmos/api-client — AGENTS.md

> Non-UI main-app WebSocket session kernel (APP-049).

## Build And Test

```bash
bun run --filter @atmos/api-client test
bun run --filter @atmos/api-client typecheck
```

## Ownership

- **Owns**: connect/disconnect/reconnect scheduling, pending map, `request` / `requestWhenReady`, notification fan-out
- **Does not own**: URL/auth/bootstrap (apps), Query cache (APP-035), terminal PTY client, desktop IPC, wire type definitions (`@atmos/api-types`)

## NEVER

- Depend on React, React Native, Zustand, Next, or `@workspace/ui`
- Import app stores or Query clients
- Set WebSocket Authorization headers (apps pass ready URL)
- Queue requests while disconnected

## ALWAYS

- Import actions/frames from `@atmos/api-types`
- Export reconnect defaults (`DEFAULT_WEB_RECONNECT`, `DEFAULT_MOBILE_RECONNECT`)
- Redact tokens in logs

## Related

- [specs/APP/APP-049_api-client](../../specs/APP/APP-049_api-client/)
- [packages/AGENTS.md](../AGENTS.md)
