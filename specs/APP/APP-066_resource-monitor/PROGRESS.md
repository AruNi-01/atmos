# PROGRESS · APP-066: Resource Monitor

> Implementation Progress · current state, handoff notes, blockers, and verification status. This file is not a requirements source.

## Status

- **State**: ready_for_review
- **Branch**: `aarynlu/resource-monitor-8c97`
- **Last updated**: 2026-08-24
- **Current owner**: coordinator with Grok 4.6 implementation workers
- **Current phase**: review

## Snapshot

- Production implementation is complete across Rust, WebSocket, api-types, Electron, and Web.
- Functional and quality review findings are fixed and verified in `REVIEW.md`.
- Targeted Rust/Bun/Playwright gates pass.
- Remaining gaps are manual/host-specific: real Relay UI, Electron-local render, Windows sampling, light/dark and many-Workspace exploration.

## Implementation Checklist

- [x] Core engine sampler and tmux pane roots
- [x] Terminal simple-PTY root capture
- [x] Core service attribution and coalescing
- [x] API / WebSocket routing
- [x] `@atmos/api-types` action/event contracts
- [x] Electron shell metrics IPC
- [x] Web Query, Footer, popover, settings, and i18n
- [x] Automated tests
- [ ] Agent Browser / manual verification
- [x] Architecture and implementation review

## Progress Log

### 2026-08-24

- Completed BRAINSTORM, PRD, TECH, and TEST design.
- Chose Server-primary attribution with independent Electron shell collection and frontend composition.
- Verified current main has no reusable resource sampler, no terminal root PID registry, and no connection-scoped resource subscription.
- Implemented the full layered feature with no new crate, REST endpoint, migration, global resource broadcast, or public PID field.
- Fixed review findings covering subscription generation races, Relay app-close cleanup, WS backpressure, blocking path work, nested payload validation, and stale/partial UI states.
- Added targeted Rust/Bun tests and a real Playwright Footer/popover journey.

## Decisions Since TECH

No implementation deltas.

## Verification Status

| Area | Command / Method | Last result | Notes |
|------|------------------|-------------|-------|
| Rust tests | targeted `cargo test` + strict Clippy | passed | engine, service, terminal, API, Relay lifecycle |
| API types | extract/check/test/typecheck | passed | 280 actions, 31 events |
| Web tests | targeted `bun test` + typecheck + lint | passed | APP-066 Query/lifecycle/state coverage |
| Electron | full `bun test` + typecheck + build | passed | shell collector and IPC |
| E2E | targeted Playwright | passed | Chromium + mobile Chromium |
| Full repository | `just test` / `just typecheck` | unrelated failures | APP-066 surfaces pass; see `TEST.md` Coverage Status |
| Agent Browser/manual | exploratory | partial | Connect gate blocked Agent Browser; host-specific checks remain |

## Known Blockers

- None.

## Handoff Notes

### Task goal

Ship live host, Atmos, Project, Workspace, terminal-session, and local Electron CPU/memory visibility.

### Current progress

Implementation and review are complete; ready for human review with host-specific manual gaps documented in `TEST.md`.

### Completed work

- APP-066 planning quartet plus `PROGRESS.md` and `REVIEW.md`.
- Cross-platform resource sampler, terminal roots, exclusive attribution, scoped WS subscriptions, Electron shell collector, and localized Footer/popover.
- Targeted scenario tests and Playwright coverage.

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

- Real Relay UI and Electron-local Desktop section were not browser-tested.
- Windows sampler and path behavior were not run on a Windows host.
- Root `just typecheck` has two unrelated existing failures in `packages/ui` and `packages/relay`; all APP-066 packages pass.

### Next steps

1. Human review the draft PR.
2. Run the manual host matrix from `TEST.md` when macOS/Windows/Relay environments are available.
3. Decide separately whether to pursue N1 history/sparklines.

### Relevant files/symbols

- `crates/core-engine/src/resource_metrics/mod.rs`
- `crates/core-service/src/service/resource_monitor/`
- `apps/api/src/api/ws/router/resource_monitor.rs`
- `packages/api-types/src/ws/dto/resource-monitor.ts`
- `apps/web/src/features/resource-monitor/`
- `apps/desktop-electron/src/metrics/desktop-shell-metrics.ts`

## Changed Areas

- `crates/core-engine`: host/process sampling and tmux pane roots.
- `crates/core-service`: terminal roots, attribution, aggregation, coalescing.
- `apps/api` / `packages/api-types`: scoped WS actions/events and typed contract.
- `apps/desktop-electron`: local shell IPC metrics.
- `apps/web`: scoped Query lifecycle, localized Footer/popover, settings.
- `e2e`: APP-066 hosted workflow.
