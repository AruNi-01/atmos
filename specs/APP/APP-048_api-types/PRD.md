# PRD · APP-048: API Types

> Product Requirements · WHAT and WHY. One TypeScript package for **main-app WebSocket wire types** so multi-client apps stop re-declaring frames, actions, and shared DTOs.

## Context

- **Problem**: Web and mobile each hand-maintain WS action names and DTOs against a Rust server. Drift produces missing actions, duplicate union members, and silent field skew.
- **Why now**: Mobile is a second client (APP-025); web carries a large action surface; QUALITY-004 already flagged the contract-mirror gap. Terminal already has a shared type home (`@atmos/shared/terminal`); main `/ws` does not.
- **Related specs**:
  - [APP-049 API Client](../APP-049_api-client/PRD.md) — transport kernel; **depends on** this package for frames/actions.
  - [APP-050 Shared Package Layering](../APP-050_shared-package-layering/PRD.md) — package roles and forbidden edges.
  - [APP-025 Mobile](../APP-025_mobile-app/PRD.md), [APP-016 Atmos Computer](../APP-016_atmos-computer/PRD.md), [APP-035 TanStack Query](../APP-035_tanstack-query-data-layer/PRD.md).

## Channel matrix (scope of “unify”)

| Channel | In APP-048 MVP? | Home |
|---------|-----------------|------|
| Main app `/ws` frames, `WsAction`, multi-client DTOs | **Yes** | `@atmos/api-types` (`ws/*`) |
| Main `/ws` notification **event** name catalog | Nice (N2) | same package later |
| Terminal stream protocol | **No** | `@atmos/shared/terminal` |
| Relay REST multi-client DTOs | Nice (N1) | `@atmos/api-types/relay` when needed |
| Desktop Electron IPC | **No** | `apps/desktop-electron` only |
| Auth / WS URL construction | **No** | apps + APP-049 (URL injected) |

**“Single TypeScript wire truth” means main `/ws` types only**, not every Atmos network surface.

## Goals

1. **Primary**: TypeScript clients import main-app WS frames, action wire names, and multi-client DTOs from `@atmos/api-types`.
2. **Primary**: Action catalog is **checkable** against the Rust server `WsAction` enum (serde snake_case wire names).
3. **Secondary**: Shared DTO field skew between web and mobile is resolved under an explicit merge rule (typecheck-enforced, not action-drift-enforced).
4. **Secondary**: Reduce app-local protocol ownership so transport/UI stop defining the wire catalog.

## Users & Scenarios

- **Primary persona**: Maintainer adding or renaming a WS action.
- **Key scenarios**:
  1. Server adds `WsAction` variant → api-types action list updates (via extract/check) → clients typecheck.
  2. Action removed/renamed → drift check fails until TS catalog and call sites update.
  3. Mobile uses a subset of actions, all assignable to the shared `WsAction` union.
  4. A multi-client DTO field is added once in api-types; web and mobile both import it (process discipline; M7 does not prove fields).

## User Stories

- As a maintainer, I want one TS home for main `/ws` types so I do not edit three apps by memory.
- As a mobile engineer, I want action names constrained to the server catalog so typos fail at compile time.
- As a reviewer, I want CI to fail when the TS action set ≠ server `WsAction` wire names.

## Functional Requirements

### Must Have

- **M1 — Package**: `packages/api-types` / `@atmos/api-types` is the TS home for main-app `/ws` wire types. No React, no transport, no business logic.
- **M2 — Canonical frames**: Export request/response/error/notification (and overall message union as needed) whose **required/optional fields match the Rust wire envelope** in `apps/api/src/api/ws/message.rs`. Client-only defensive looseness, if needed, is a **separate** type (e.g. parse helpers in api-client/apps)—not the public canonical frame.
- **M3 — Action catalog from server**: Export complete `WsAction` string union + iterable `WS_ACTIONS` for **all** main-app action **wire names** corresponding to Rust `pub enum WsAction` (`rename_all = "snake_case"`). **Web’s current union is migration input, not authority.** Gaps (e.g. missing server-only actions) and duplicate members are fixed as part of M3.
- **M4 — Shared DTO cutover**: DTOs used by **more than one** TS client move into `dto/*`. **Merge rule**: when web ≠ mobile, resolve to **one** shape preferring **server JSON semantics + production web usage**; document optionality changes in the PR. Single-client DTOs stay app-local until a second consumer appears.
- **M5 — Mobile cutover**: Mobile imports frames/actions/shared DTOs from api-types; no parallel frame authorities.
- **M6 — Web cutover**: Web imports frames/actions/migrated DTOs from api-types; no `export type WsAction` / frame authorities remain as sources of truth under `apps/web` (re-export shims only if temporary and documented).
- **M7 — Action drift gate**: Runnable check fails when TS `WS_ACTIONS` ≠ **extracted** server `WsAction` wire names. Primary SOT = Rust enum in `message.rs` (extract via small Rust test/bin or equivalent). Hand-edited snapshot alone is **not** sufficient as the only server source. Router exhaustiveness remains a Rust concern, not the primary TS gate.
- **M8 — Authority**: Runtime acceptance stays in `apps/api`. api-types does not replace server validation.
- **M9 — Stack**: Plain TypeScript types only. No parallel protocol stack, no alternate server runtime required for this package.
- **M10 — Subpath exports**: Prefer `@atmos/api-types/ws`, `.../ws/actions`, `.../ws/dto/*` (exact paths in TECH). Avoid forcing every consumer to import all DTOs.
- **M11 — Incremental ship**: PR-sized slices; **APP-049 may start after Phase 1 (frames + actions)** without waiting for full DTO migration.
- **M12 — Explicit non-goals in-package**: No per-action request/response TypeScript map (`Record<WsAction, …>`) in MVP. Callers use `request<T>(action, data?)` with caller-chosen `T` (APP-049).
- **M13 — Honest gate coverage**: Document that M7 covers **action names only**; DTO field fidelity is merge rule + typecheck + review (optional golden JSON later).

### Nice to Have

- **N1 — Relay REST DTO subpath** (`ComputerRow`, client session, register token, …) when multi-client and not blocking MVP.
- **N2 — Notification event catalog** extracted from Rust `WsEvent` (same pipeline as actions).
- **N3 — Runtime parsers** (e.g. Zod) for high-risk payloads.
- **N4 — DTO codegen** from Rust if manual DTO cost dominates.
- **N5 — `ping`/`pong`/legacy `message` in exported message union** only if product paths still need them; default TECH decision may exclude app-level ping.

## Out of Scope

- Changing on-wire JSON for product features (mirror-first).
- APP-049 transport/reconnect.
- Terminal stream protocol (shared/terminal).
- Desktop Electron IPC redesign or types package.
- Auth headers / URL builders.
- Full mobile parity with every action.
- OpenAPI for all REST.
- Per-provider agent CLI types (`crates/agent`).

## Success Metrics

- Web and mobile typecheck importing `@atmos/api-types` for frames + actions.
- Zero parallel **authoritative** frame / `WsAction` definitions in apps after cutover.
- Drift check green and **enum-backed**.
- Lagging: new server actions land with api-types + at least one client in the same change set.
- Qualitative: “Main `/ws` types live in api-types; apps wrap UX and transport.”

## Risks & Open Questions

- **Risk**: Action gate does not prove DTO correctness — accepted; stated in M13.
- **Risk**: Merge rule may require mobile call-site adjustments — acceptable.
- **Settled**: Package name `@atmos/api-types`; server enum is action authority; frames canonical = Rust wire; relay/desktop/terminal as channel matrix.

## Milestones

| Phase | Deliverables |
|-------|----------------|
| **1** | Package + canonical frames + server-based action catalog; web imports frames/actions; **extract-based action check runnable** (warn or hard-fail in package tests) |
| **2** | Shared DTO modules + merge inventory; web + mobile import overlaps |
| **3** | Mobile deletes local frame/action authorities; web finishes migrated DTOs |
| **4** | Action drift hard-fail in CI on main |
| **5 (optional)** | N1–N4 |

**Handoff**: Phase 1 is the hard gate for APP-049 typed `request`.
