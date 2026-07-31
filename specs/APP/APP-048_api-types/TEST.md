# TEST · APP-048: API Types

> Verification for `@atmos/api-types` and multi-client cutover.

## Test strategy

| Level | Why |
|-------|-----|
| Package unit | Action uniqueness, frame structure, enum-backed drift |
| Typecheck | contracts package + web + mobile |
| Static rg | No dual authorities for frames/WsAction |
| App unit | Existing mobile/web tests still pass after import path change |
| Joint smoke | Owned by APP-049 after both land; not required for 048-alone done |

## Coverage map

| PRD | Scenarios |
|-----|-----------|
| M1, M9, M10 | T-PKG-01, T-DEP-01 |
| M2 | T-FRAME-01, T-FRAME-02 |
| M3, M7, M13 | T-ACT-01, T-ACT-02, T-DRIFT-01, T-DRIFT-02 |
| M4 | T-DTO-01, T-DTO-02 |
| M5, M6 | T-WEB-01, T-MOB-01 |
| M11 | T-HAND-01 |
| M12 | T-SCOPE-01 |

## Execution map

| ID | Level | Command / method | Status |
|----|-------|------------------|--------|
| T-PKG-01 | unit | package typecheck | pending |
| T-DEP-01 | static | package.json no react/transport | pending |
| T-FRAME-01 | unit | frames discriminants exist | pending |
| T-FRAME-02 | unit | required fields match TECH canon (or golden JSON) | pending |
| T-ACT-01 | unit | WS_ACTIONS unique + covers union | pending |
| T-ACT-02 | unit | includes server-known actions (e.g. any enum-only names found at seed) | pending |
| T-DRIFT-01 | unit | extract fixture == WS_ACTIONS | pending |
| T-DRIFT-02 | unit | intentional mismatch fails | pending |
| T-DTO-01 | typecheck | both apps import shared DTOs from package | pending |
| T-DTO-02 | static | one interface body per moved type name | pending |
| T-WEB-01 | static+typecheck | no authoritative WsAction/frames under apps/web | pending |
| T-MOB-01 | typecheck+bun | mobile tests green; no local frame authorities | pending |
| T-HAND-01 | process | 049 can depend on Phase 1 only | pending |
| T-SCOPE-01 | review | no action→response map; no UI/transport in package | pending |

## Scenarios

### T-DRIFT-01 — Enum-backed alignment

- **Given** fixture generated/updated from Rust `WsAction`
- **When** package drift test runs
- **Then** exit 0 iff sets equal
- **Signals**: test output; fixture path documented in AGENTS.md

### T-DRIFT-02 — Mismatch fails

- **Given** one name only on one side
- **When** drift test runs
- **Then** non-zero exit naming the action

### T-ACT-02 — Server completeness

- **Given** extraction from current `message.rs`
- **When** comparing to pre-migration web-only union
- **Then** package catalog includes server wire names even if web previously omitted them
- **Signals**: set difference empty against extract

### T-FRAME-02 — Canonical required fields

- **Given** package frames
- **When** structural test or assignability against golden fixtures runs
- **Then** required fields match TECH §5 (Rust-aligned), not mobile’s looser historical types

### T-WEB-01 / T-MOB-01 — No dual authority

- **Given** cutover complete for frames/actions
- **When** `rg 'export type WsAction'` (and frame interface definitions) under apps
- **Then** zero authoritative definitions (allow documented re-export-only shims if any)

### T-DTO-02 — Single-homed shared types

- **Given** inventory of moved types
- **When** searching monorepo for duplicate `export (type|interface) ProjectModel` bodies
- **Then** only api-types defines the body (apps may re-export)

### T-HAND-01 — Phase 1 handoff

- **Given** Phase 1 merged
- **When** APP-049 Phase 1 starts
- **Then** it can import frames + `WsAction` without waiting for all DTOs

## Exploratory agent-browser

Only if a cutover PR changes runtime encoding. Otherwise N/A.

## Regression checklist

- [ ] Package typecheck + drift tests green
- [ ] Web typecheck green; one manual or smoke WS request still works
- [ ] Mobile typecheck + existing client tests green
- [ ] `apps/api` AGENTS DTO sync note updated
- [ ] No intentional wire JSON change without explicit exception

## Acceptance criteria

1. `@atmos/api-types` owns main `/ws` frames + full server-based `WsAction` + migrated multi-client DTOs.
2. Drift gate is **enum-extracted**, not hand-only.
3. Apps no longer own authoritative frames/actions.
4. Channel matrix respected (no terminal/IPC forced in).
5. M7/M13 honesty: action-only automated gate.
6. Phase 1 is a valid APP-049 start gate.

## Manual steps

1. Run package tests including drift.
2. Add a throwaway action name to fixture only → test fails → revert.
3. Web: bootstrap path still loads.
4. Mobile: existing project/workspace WS path if available.

## Non-coverage

- APP-049 reconnect/auth
- DTO field vs Rust automated equality (beyond typecheck)
- Notification event catalog (N2)
- Relay Worker, desktop IPC, terminal PTY
- Full behavioral tests for all actions

## Joint smoke

After APP-049 lands: see APP-049 TEST joint cutover scenario (imports api-types + real request).

## Coverage Status

_Not run — pre-implementation._
