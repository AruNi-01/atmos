# Brainstorm · APP-049: API Client

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Web and mobile each implement WS connect/reconnect and pending maps. Extract a framework-agnostic session kernel; keep feature stores and Query in apps.

## Options considered

| Option | Outcome |
|--------|---------|
| A Minimal shared WS kernel | **Chosen** |
| B Full shared domain state in package | Rejected |
| C Docs only | Rejected |
| D Kernel inside shared | Rejected (APP-050) |

## Settled decisions (post-review)

- Package: `@atmos/api-client`.
- URL/auth/bootstrap: **app-owned**; kernel socket-only; token in URL; redact logs.
- Reconnect: shared algorithm + **injected policy** + exported `DEFAULT_WEB_*` / `DEFAULT_MOBILE_*` (web slow_retry 60s vs mobile stop).
- No request queue; explicit wait/requestWhenReady.
- Scope: generic `isValid` helper; web/APP-035 primary; mobile not forced.
- Phase 1 implements **union of hard behaviors** as options before mobile-first cutover.
- Hard gate: APP-048 Phase 1 first.
- Desktop: longer connectWait only; no Electron IPC here.

## References

- `use-websocket.ts`, `ws/request.ts`, `mobile-ws-client.ts`
- APP-048, APP-050, APP-035, APP-016

## Ready to promote

- All material promoted to PRD/TECH/TEST (revised after critical+important review).
