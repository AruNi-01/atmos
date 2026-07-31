# PRD · APP-049: API Client

> Product Requirements · WHAT and WHY. Shared non-UI WebSocket **session kernel** for web and mobile, with app-owned URL/auth/bootstrap and injectable reconnect policy.

## Context

- **Problem**: Web (`use-websocket` ~784 lines) and mobile (`MobileWsClient`) each implement connect/reconnect, pending maps, and notification fan-out. Behavior and bugs drift; fixes ship twice.
- **Why now**: APP-048 removes protocol types from app hooks; the remaining transport blob is ready to extract. Mobile already has unit tests for a portable kernel seed.
- **Related specs**:
  - [APP-048 API Types](../APP-048_api-types/PRD.md) — **hard dependency** on Phase 1 (frames + `WsAction`) for typed `request`.
  - [APP-050 Shared Package Layering](../APP-050_shared-package-layering/PRD.md) — package role.
  - [APP-035](../APP-035_tanstack-query-data-layer/PRD.md) — Query owns cache; this package owns transport readiness + send.
  - [APP-016](../APP-016_atmos-computer/PRD.md) / [APP-025](../APP-025_mobile-app/PRD.md) — multi-target URLs stay app-owned in MVP.

## Goals

1. **Primary**: One package `@atmos/api-client` owns the non-UI main-app WS **session lifecycle** (socket, reconnect scheduling, pending correlation, notification fan-out).
2. **Primary**: Web and mobile use that kernel; apps inject platform + **resolved URL** + reconnect **policy**; UI bindings stay thin.
3. Preserve intentional product differences (e.g. web forever slow-retry vs mobile stop) as **first-class policy**, not silent forks.
4. Preserve computer-scope-safe request **semantics** for web/APP-035 without forcing mobile to invent epochs.
5. No second domain-state framework; no terminal PTY client in MVP; no desktop IPC in this package.

## Users & Scenarios

1. Flaky relay: both clients reconnect via the same algorithm with **injected** delays/max/exhausted behavior.
2. User switches Computer on web: in-flight/wait paths do not apply results under the wrong scope when using the scope-safe helper.
3. Maintainer changes **reconnect algorithm** once in api-client; numeric policies may still be per-surface defaults exported from the package.
4. Feature code calls `request(action, data)` without managing `request_id` or raw sockets.

## User Stories

- As a maintainer, I want one pending-map + reconnect implementation so connection bugs are not dual-maintained.
- As a mobile engineer, I inject RN WebSocket/timers without forking protocol logic.
- As a web engineer, Zustand/provider only bind the kernel; bootstrap and computer mode stay app-owned.
- As a multi-computer web user, I want scope-safe requests so Computer A work never hits Computer B.

## Functional Requirements

### Must Have

- **M1 — Package**: `@atmos/api-client` core has **no** React, React Native, Zustand, Next, or `@workspace/ui`.
- **M2 — Session kernel**: connect (single-flight), disconnect, state observation, `request` with correlation id + timeout, pending flush on close, notification subscribers, optional raw message subscribers.
- **M3 — Shared algorithm, injected policy**: Reconnect backoff is implemented once. Surfaces pass policy objects. Package **exports named defaults** (`DEFAULT_WEB_RECONNECT`, `DEFAULT_MOBILE_RECONNECT`, desktop wait helpers) so defaults can change in one place when apps import them. Do **not** claim identical user-visible recovery if policies differ.
- **M4 — Platform adapter**: Inject `createWebSocket(url)`, timers, optional logger. Apps normalize to a single `WebSocketLike` with **`onopen` / `onmessage` / `onclose` / `onerror`** (not dual event models inside the kernel).
- **M5 — Typed with APP-048**: `request(action: WsAction, data?: unknown): Promise<T>` with caller-supplied `T`. Frames from api-types. **Hard gate**: APP-048 Phase 1 (frames + actions) before 049 Phase 1.
- **M6 — Web cutover**: Main-app WS path uses kernel; store/provider is a thin binding. **Parity** means documented matrix (TECH), not accidental mobile defaults.
- **M7 — Mobile cutover**: `MobileWsClient` replaced by or thin façade over kernel; existing tests ported/green. Preserve raw message subscription used by mobile screens.
- **M8 — Scope-safe request (web-primary)**: Provide a **generic** helper: wait until connected (optional), re-check app predicate, then send—**semantic** equivalent of today’s `wsRequestForComputerScope`. Prefer `requestWhenReady({ isValid, … })` so APP-035 `ComputerQueryScope` can live in **web** (or a thin re-export) without encoding web store fields as the only package model. **Mobile not required** to implement multi-computer epochs in this spec.
- **M9 — Notification fan-out**: Multiple subscribers per event name; safe unsubscribe. Raw `onMessage` for mobile parity.
- **M10 — Types authority**: No local action unions; import APP-048.
- **M11 — URL & auth ownership (MVP)**:
  - Apps resolve the full WS URL (token query, `client_type`, relay session URL, bootstrap).
  - Kernel never sets `Authorization` headers on the socket.
  - Kernel accepts `url: string | (() => string)` evaluated at **each** open attempt when a function.
  - Logs must redact tokens (`token=` query etc.).
- **M12 — Request semantics (no queue)**:
  - `request()` **rejects** if not connected (does not queue).
  - Waiting for connection is explicit: `waitUntilConnected` and/or `requestWhenReady`.
  - On socket close: reject all pending; clear map.
  - Intentional `disconnect()`: stop reconnect, close socket, reject pending.
- **M13 — Behavioral matrix locked in TECH**: initial/max delay, max attempts, **exhausted behavior** (`stop` | `slow_retry` + delay), request timeout defaults, clean-close reconnect policy, connect wait defaults (incl. desktop 30s). Implement as options; defaults match current product unless TECH documents an intentional change.
- **M14 — Web connect responsibility split**: Kernel owns socket lifecycle only. App binding owns: hosted/local bootstrap, computer mode, URL selection, post-open client-session sync, visibility/online **kick** `connect()` without a second backoff loop.
- **M15 — Incremental**: Does not require porting all feature stores or terminal client.

### Nice to Have

- **N1 — ConnectionTarget** model (`primary` / `relay` / `bearer`) inside package.
- **N2 — Terminal WS client** sibling module (types still `@atmos/shared/terminal`).
- **N3 — Shared Relay REST client** (types from api-types N1 when present).
- **N4 — Network online/offline hints** into reconnect.
- **N5 — Structured debug metrics** for connection attempts.

## Out of Scope

- Shared domain-state framework for all features.
- Replacing TanStack Query.
- Running agents/PTY on the client.
- Changing relay Worker topology.
- Electron main IPC protocol.
- Full mobile feature parity with web.
- Inventing request queues.

## Success Metrics

- Single implementation of pending map + reconnect scheduling used by web and mobile.
- Package unit tests cover matrix policies (stop vs slow_retry), no-queue, scope-when-ready, redaction.
- Mobile suite green; web smoke connect + one request.
- Qualitative: “UI never owns request_id / reconnect timers.”

## Risks & Settled decisions

- **Settled D2/D3**: Auth-in-URL; app-owned URL; kernel socket-only.
- **Settled D4**: Dual exhausted policies via injection + exported defaults.
- **Settled D7**: Generic ready-guard; web-primary scope.
- **Settled D8**: Explicit web bind vs kernel split.
- **Risk**: Thin web binding still large due to bootstrap — accepted if kernel still owns pending+reconnect.

## Milestones

| Phase | Content |
|-------|---------|
| **0** | APP-048 Phase 1 available |
| **1** | Package + kernel implementing **union of hard behaviors** as options + unit tests (not mobile-minimal only) |
| **2** | Mobile cutover + port tests into package |
| **3** | Web thin store + `requestWhenReady` + provider no double-loop |
| **4** | Optional N1–N5 |

Joint global order with 048/050: see APP-050 TECH sequencing (050 docs → 048 P1 → 049 P1 → …).
