# Brainstorm · APP-064: API Contract Hardening

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos already has a working three-plane client stack: Hub (`@atmos/hub-client`), Relay (`@atmos/relay-client`), and Computer main `/ws` (`@atmos/api-types` + `@atmos/api-client`). APP-048/049/050 landed that split and explicitly **deferred** a per-action request/response TypeScript map (APP-048 M12).

A later architecture review asked whether to introduce **oRPC** (or another RPC framework) for type-safe procedures. The useful question is no longer “replace the API with oRPC”, but which remaining contract holes are real, and which proposed refactors would duplicate a stack we already have.

Trigger: internal design discussion, not a user-facing bug. Pain is on maintainers: `request<T>(action, data?: unknown)` is name-safe only; payload and result types are caller-chosen; a few shared DTOs still drift.

## Goals (draft)

- Primary: keep the current planes and packages; do **not** add a second RPC framework.
- Primary: make main `/ws` `action → input → output` (and later `event → payload`) a real TypeScript contract.
- Secondary: finish leftover type hygiene without inventing `@atmos/api-sdk` or merging control-plane clients.

## What already holds (do not relitigate)

These are already true in tree and in APP-048/049/050 / `packages/AGENTS.md`:

- `@atmos/api-types` owns main `/ws` frames, `WsAction` catalog, multi-client DTOs, and a Rust-enum extract/check.
- `@atmos/api-client` is a non-UI session kernel (connect/reconnect/pending/notifications). Web and mobile both use it; mobile only adapts RN WebSocket.
- Hub vs Relay vs Computer is the correct split. Feature APIs live in `apps/*/api/` until a second consumer appears.
- Terminal stream protocol stays in `@atmos/shared/terminal`. Desktop IPC stays in `apps/desktop-electron`.
- REST is the exception transport (bootstrap, binary, CLI/hooks, diagnostics), not the product RPC.

Current numbers (2026-08-24): **273** `WsAction` names; **30** `WsEvent` variants; DTOs in api-types only for `fs` / `git` / `github` / `group` / `linear` / `project` / `workspace`.

## Review of the oRPC-era recommendations

| Claim | Verdict | Note |
|-------|---------|------|
| Do not introduce oRPC | **Hold** | Would add a second contract + client over an existing WS kernel with reconnect, computer-scope, no-queue, and token-in-URL semantics oRPC does not own. |
| Three planes (Hub / Relay / Computer) | **Hold** | Already the package map. |
| `api-types` + `api-client` *is* the Computer RPC SDK | **Hold** | Missing piece is payload mapping, not a new framework. |
| Mobile already reuses the kernel | **Hold** | `MobileWsClient` → `createWsSession()` + `adaptSocket()`. |
| `request()` is only name-safe | **Hold** | Also still accepts `WsAction \| string`, which weakens the catalog. |
| Keep api-client a kernel, not `gitApi` | **Hold** | Web already has `apps/web/src/api/ws/*-api.ts`; mobile has `ws-actions.ts`. |
| Do not create `@atmos/api-sdk` now | **Hold** | APP-050 “second consumer” rule. |
| Do not merge hub-client + relay-client | **Hold** | Different planes and auth. |
| P0: migrate `ws-api-types.ts` / mobile `ws-actions.ts` as dual catalogs | **Partial / overstated** | Action catalog is already one `WsAction`. Web `ws-api-types.ts` is mostly a re-export shim. Mobile `ws-actions.ts` is a **feature wrapper**, which we want to keep. Remaining work is DTO completeness + a few drifted shapes. |
| P1: split `WS_ACTIONS` into domain files / `client.git.getStatus()` | **Demote** | File split is organization, not type safety. Namespaced methods on the kernel mix layers we just separated. Domain modules already exist on the Rust side (`message/*.rs`) and in web feature APIs. |
| P2: REST OpenAPI / schema export | **Hold as later, recast** | REST is multi-plane (Computer `/api/system/*`, Hub, Relay, hooks). One OpenAPI for “REST” would smear planes. Do not OpenAPI-ify the product. |
| Continue “one catalog, one frame, one DTO” | **Hold with nuance** | Frames + action *names* are already unified. DTOs and notifications are not. |

Concrete drift that the review under-named: `WorkspaceAttachmentPayload` in `@atmos/api-types` (`name` / `path` / `content_type`) does **not** match the Rust wire (`filename` / `mime` / `data_base64`). Web maps camelCase locally. Mobile still has a transitional `GitFileDiffResponse`. These are contract bugs, not a reason for oRPC.

QUALITY-004 F-02 wanted full `ts-rs`/`typeshare` codegen into `@atmos/protocol`. APP-048 rejected that as MVP and chose handwritten types + enum extract. This spec continues **that** path, not a jump to codegen or oRPC.

## Options

### Option A — Adopt oRPC (or tRPC-class) as the Computer API

Replace or wrap main `/ws` (and maybe Hub/Relay HTTP) with oRPC procedures.

**Pros**: procedure-level input/output inference; ecosystem.
**Cons**: second contract; fights Rust-enum SOT and extract/check; does not replace reconnect / computer-scope / PTY stream / Relay session; HTTP-first bias vs WS-first runtime.
**Unknown**: WS adapter cost vs custom kernel semantics.
**Outcome**: **rejected**.

### Option B — Typed `WsContract` map on the existing stack

Keep packages and transport. Add `action → { input, output }` (and later `event → payload`) in `@atmos/api-types`. Tighten `api-client` `request` generics. Incremental coverage; unmapped actions keep today’s `request<T>`.

**Pros**: uses the stack we have; matches APP-048 deferred M12; no new runtime; web/mobile feature APIs just drop explicit `T`.
**Cons**: map is still handwritten; 273 actions will take phases.
**Unknown**: when (if ever) ts-rs becomes cheaper than the map.
**Outcome**: **chosen**.

### Option C — Full Rust→TS codegen (`ts-rs` / specta / OpenAPI)

Generate DTOs and maybe the action map from Rust structs.

**Pros**: closes field drift mechanically.
**Cons**: requires a clean DTO layer (QUALITY-004 F-06 still relevant); large one-shot; does not give reconnect/kernel; easy to over-generate REST.
**Outcome**: **deferred** (same as APP-048 N4). Revisit if contract-map maintenance dominates.

### Option D — Namespaced kernel SDK (`client.git.getStatus()`)

Put domain methods on `@atmos/api-client` or a new `@atmos/api-sdk`.

**Pros**: nicer call sites.
**Cons**: kernel becomes a business SDK; duplicates `apps/web/src/api/ws/*` and mobile `ws-actions.ts`; forces mobile onto web’s API surface.
**Outcome**: **rejected for now**. Feature wrappers stay app-owned.

### Option E — Status quo

Action names stay gated; callers keep `request<T>(action, unknown)`.

**Pros**: zero work.
**Cons**: payload drift stays a review problem; `| string` hole remains.
**Outcome**: **rejected** as the end state; acceptable only as the unmapped-action fallback during Option B.

## Key forks in the road

- **Fork 1**: oRPC vs typed map vs codegen — **Option B**. Decide remaining codegen in TECH only as a later escape hatch.
- **Fork 2**: Contract map covers **all** `WsAction` wire types in api-types, or only multi-client DTOs? — lean **all wire input/output in api-types** (subpath imports keep mobile from loading unused domains). App-only **view models** stay in apps. This slightly extends APP-048 M4 for *wire* types.
- **Fork 3**: Namespaced `client.git.*` on the kernel vs keep app feature APIs — **keep app feature APIs**.
- **Fork 4**: REST OpenAPI now vs later vs never for the whole surface — **not now**; per-plane inventory only if a second Computer-REST consumer appears.
- **Fork 5**: Domain-split `WS_ACTIONS.ts` as a P1 vs derived later — **later**, and only if the contract modules are already split.

## Open questions

- [x] oRPC? — no. (PRD)
- [x] New `api-sdk` package? — no until a second consumer of a feature wrapper. (PRD)
- [ ] Empty-input calling convention (`request("project_list")` vs always `{}`) — TECH.
- [ ] How long the untyped `request<T>` overload stays — TECH (until mapped coverage hits the Must Have set).
- [ ] Notification payload map in the same phases as request map, or strictly after — PRD (events catalog with request map; payload map can lag).

## References

- Existing: `packages/{api-types,api-client,hub-client,relay-client,AGENTS.md}`, `apps/web/src/api/{ws-api.ts,ws-api-types.ts,ws/*,rest-api.ts}`, `apps/mobile/src/api/{mobile-ws-client.ts,ws-actions.ts,types.ts}`, `apps/api/src/api/ws/message.rs`
- Related specs: [APP-048](../APP-048_api-types/), [APP-049](../APP-049_api-client/), [APP-050](../APP-050_shared-package-layering/), [QUALITY-004](../QUALITY-004_architecture-review/) F-02
- External: oRPC as a rejected alternative only

## Ready to promote

- Promote to PRD: reject oRPC / api-sdk / hub+relay merge / namespaced kernel; Must Have typed `WsContract` + tighter `request`; notification catalog; leftover DTO hygiene; REST stays P2.
- Promote to TECH: contract map shape, incremental overloads, extract pipeline reuse, what not to touch, rollout phases.
