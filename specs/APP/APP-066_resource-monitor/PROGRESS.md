# PROGRESS · APP-066: Resource Monitor

> Implementation Progress · current state, handoff notes, blockers, and verification status. This file is not a requirements source.

## Status

- **State**: in_progress
- **Branch**: `aarynlu/resource-monitor-8c97`
- **Last updated**: 2026-08-24
- **Current owner**: coordinator with Grok 4.6 implementation workers
- **Current phase**: service

## Snapshot

- Product scope and technical contract are frozen in the APP-066 quartet.
- Next: implement engine/terminal roots and the service attribution layer.
- No known blocker.
- Do not add a crate, REST endpoint, database migration, global WS broadcast, or public PID field.

## Implementation Checklist

- [ ] Core engine sampler and tmux pane roots
- [ ] Terminal simple-PTY root capture
- [ ] Core service attribution and coalescing
- [ ] API / WebSocket routing
- [ ] `@atmos/api-types` action/event contracts
- [ ] Electron shell metrics IPC
- [ ] Web Query, Footer, popover, settings, and i18n
- [ ] Automated tests
- [ ] Agent Browser / manual verification
- [ ] Architecture and implementation review

## Progress Log

### 2026-08-24

- Completed BRAINSTORM, PRD, TECH, and TEST design.
- Chose Server-primary attribution with independent Electron shell collection and frontend composition.
- Verified current main has no reusable resource sampler, no terminal root PID registry, and no connection-scoped resource subscription.

## Decisions Since TECH

No implementation deltas.

## Verification Status

| Area | Command / Method | Last result | Notes |
|------|------------------|-------------|-------|
| Rust tests | targeted `cargo test` | not_run | implementation pending |
| API types | extract/check/test/typecheck | not_run | implementation pending |
| Web tests | targeted `bun test` + typecheck | not_run | implementation pending |
| Electron | `bun test` + router smoke | not_run | implementation pending |
| E2E / manual | Agent Browser/manual | not_run | implementation pending |

## Known Blockers

- None.

## Handoff Notes

### Task goal

Ship live host, Atmos, Project, Workspace, terminal-session, and local Electron CPU/memory visibility.

### Current progress

Design complete; production code not started.

### Completed work

- APP-066 planning quartet.
- Current-code seam review for Rust, WebSocket, Query, Footer, and Electron.

### Key decisions

- One process-table sample per coalesced snapshot.
- API owns connection-scoped subscription tasks.
- `core-service` owns attribution but no WS identities or background broadcaster.
- Frontend merges Server and Electron only for the local Computer.

### Constraints

- Follow layer order: engine → service → API/types → Electron/Web.
- Keep wire aggregates private-safe; no process identity.
- Use WebSocket, not REST.

### Open issues

- Validate `sysinfo` latest API during implementation.
- Validate first-sample CPU priming and portable-pty child ownership.

### Next steps

1. Implement engine sampler and terminal root projection.
2. Implement deterministic attribution and service cache.
3. Add WS subscription, Desktop IPC, and web UI.
4. Run test-plan scenarios and review.

### Relevant files/symbols

- `crates/core-engine/src/local_services/process.rs`
- `crates/core-service/src/service/terminal/`
- `apps/api/src/api/ws/router/mod.rs`
- `apps/web/src/providers/app/server-state-event-bridge.tsx`
- `apps/desktop-electron/src/ipc/handlers.ts`

## Changed Areas

- `specs/APP/APP-066_resource-monitor`: design and progress documents.
