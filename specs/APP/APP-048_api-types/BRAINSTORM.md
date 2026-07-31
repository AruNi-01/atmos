# Brainstorm · APP-048: API Types

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos multi-client surfaces talk to `apps/api` over a hand-rolled WebSocket request/response/notification protocol. Rust owns runtime authority (`message.rs`); TypeScript clients re-declare the surface and drift (missing actions, duplicate union members, field skew). Terminal already has `@atmos/shared/terminal`; main `/ws` does not.

## Goals (draft → settled in PRD)

- One TS package for main `/ws` frames, actions, multi-client DTOs.
- Checkable action catalog against server enum.
- No transport/auth/URL in this package.

## Options considered

| Option | Outcome |
|--------|---------|
| A Hand-written api-types + drift | **Chosen for DTOs**; actions use **enum extract** gate |
| B Full codegen from Rust | Deferred N4 |
| C Zod runtime schemas | Deferred N3 |
| D Expand shared only | Rejected (APP-050) |

## Settled decisions (post-review)

- Package: `@atmos/api-types` / `packages/api-types`.
- Action authority: Rust `WsAction` enum wire names — **not** web union as SOT.
- Frames: canonical = Rust wire envelope.
- Drift: extract from enum; hand snapshot not primary.
- Channel matrix: main `/ws` only in MVP; terminal/shared; relay N1; desktop IPC never.
- No per-action payload map in MVP.
- APP-049 may start after Phase 1 (frames + actions).

## References

- `apps/api/src/api/ws/message.rs`, web `use-websocket.ts`, mobile `types.ts` / `ws-actions.ts`
- APP-049, APP-050, APP-025, QUALITY-004

## Ready to promote

- All material promoted to PRD/TECH/TEST (revised after critical+important review).
