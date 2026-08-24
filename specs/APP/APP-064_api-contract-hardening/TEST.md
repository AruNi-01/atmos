# TEST · APP-064: API Contract Hardening

> Test Plan · how we verify the typed `/ws` contract and the “no second RPC framework” freeze. References PRD APP-064 and TECH APP-064.

## Test strategy

This is a TypeScript contract and package-boundary change with **no product wire change**. Proof is package tests, type tests, static bans, and existing web/mobile unit tests. No Playwright journey and no agent-browser UI pass — there is no user-facing surface.

- Unit / type: `@atmos/api-types` contract assignability; `@atmos/api-client` overload behavior at runtime still matches today’s JSON.
- Static: no `orpc` / `@trpc` dependency; no new `api-sdk` package; kernel has no `gitApi`.
- App: web + mobile typecheck; mapped wrappers compile without redundant `T`.
- E2E / agent-browser: **not used** (Non-coverage).

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2 |
| M2 | S2 |
| M3 | S3 |
| M4 | S4, S5 |
| M5 | S6, S7, S8 |
| M6 | S5, S9 |
| M7 | S7, S10 |
| M8 | S8, S11 |
| M9 | S12, S13 |
| M10 | S14, S15 |
| M11 | S16 |
| N1 | S4, S5, S9 |
| N2 | S14, S15 |
| N3–N5 | S17 (deferred) |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Static | rg / bun | `rg -l '"orpc"\\|@orpc\\|@trpc' package.json packages/*/package.json apps/*/package.json` | lockfiles | zero product deps | planned |
| S2 | Static | rg + `scripts/check-package-boundaries.ts` | existing boundary script | monorepo | hub/relay/api-client edges unchanged | planned |
| S3 | Static | rg | `rg "gitApi\\|workspaceApi" packages/api-client/src` | api-client src | no domain APIs on kernel | planned |
| S4 | Bun type test | `bun test` | `@atmos/api-types` contract tests | sample mapped action | `WsContract` keys ⊆ `WsAction` | planned |
| S5 | Bun type test | `bun test` | v1 domain completeness vs `WS_ACTIONS` prefixes | actions.ts + contract/* | fs/git/github/group/linear/project/workspace actions all mapped | planned |
| S6 | Bun test | `bun test` | `@atmos/api-client` session.test.ts | mock socket | request still sends `{ type: request, payload: { action, data } }` | planned |
| S7 | Typecheck | `bun run --filter @atmos/api-client typecheck` plus a `// @ts-expect-error` fixture | contract-assignability file | bad field / unknown action literal | mapped call infers output; bad input fails | planned |
| S8 | Typecheck | `just typecheck` or web+mobile typecheck | apps using mapped `request` | workspace_create / git_get_status call sites | no required caller `T` | planned |
| S9 | Typecheck | `bun run --filter @atmos/api-client typecheck` | `UnmappedWsAction` is `never`; `requestUnchecked` is the escape hatch | request-types.ts | no leftover `request<T>` | implemented |
| S10 | Typecheck | ts-expect-error fixture | `request("not_an_action", {})` | string literal | type error; `requestUnchecked` allowed | planned |
| S11 | Static | rg | `apps/mobile/src/api/ws-actions.ts` still exports wrappers | mobile | file exists; imports `request` not a second `WS_ACTIONS` | planned |
| S12 | Typecheck + unit | `bun test` / typecheck | `WorkspaceAttachmentPayload` assignable to Rust JSON shape | filename/mime/data_base64 | web mapper still sends snake_case | planned |
| S13 | Static | rg | `export type GitFileDiffResponse` under mobile | mobile types.ts | no local authoritative duplicate | planned |
| S14 | Bun test | `bun run --filter @atmos/api-types check-events` (name TBD) | fixture vs `WS_EVENTS` | `events.server.json` | sets equal | planned |
| S15 | Bun test | same as APP-048 drift-mismatch | drop one event from TS or fixture | non-zero exit naming the event | planned |
| S16 | Review | rg + existing WS tests | no serde/JSON field renames in `message.rs` for this spec | git diff | wire structs unchanged | planned |
| S17 | n/a | deferred | N3–N5 | — | OpenAPI / ts-rs / catalog derivation | planned |

## Scenarios

### S1 — No oRPC/tRPC client dependency

- **Level**: Static
- **Given**: the workspace after APP-064 implementation
- **When**: searching app and package `package.json` files for oRPC/tRPC/ts-rest runtime deps
- **Then**: no matches in product packages (`packages/api-*`, `hub-client`, `relay-client`, `apps/web`, `apps/mobile`)
- **Signals**: rg empty; M1

### S2 — Package planes unchanged

- **Level**: Static
- **Given**: `packages/AGENTS.md` forbidden edges
- **When**: `scripts/check-package-boundaries.ts` runs
- **Then**: still green; hub-client does not import api-client/relay-client; relay-client does not import api-client; no new `packages/api-sdk`
- **Signals**: script exit 0; `ls packages` has no api-sdk

### S3 — Kernel has no domain SDK

- **Level**: Static
- **Given**: `packages/api-client/src`
- **When**: searching for feature API objects (`gitApi`, `workspaceApi`, `fsApi`)
- **Then**: zero; public API is still session/request/reconnect
- **Signals**: rg empty

### S4 — Contract keys are real actions

- **Level**: Bun type/unit
- **Given**: `WsContract`
- **When**: package test assigns `keyof WsContract` to `WsAction` (or equivalent expect-type)
- **Then**: compile/test fails if a contract key is not in `WS_ACTIONS`
- **Signals**: failing fixture with `"not_a_real_action"` in the map

### S5 — v1 domains are fully mapped

- **Level**: Bun unit
- **Given**: `WS_ACTIONS` and `WsContract`
- **When**: filtering actions by v1 prefixes (`fs_`, `git_`, `github_`, `group_`, `linear_`, `project_`, `workspace_`) plus the exact `script_*` / other names TECH lists under those dto modules
- **Then**: every such action is a `keyof WsContract`; extra mapped actions are allowed
- **Signals**: set difference empty for the TECH v1 set (`fs_` / `git_` / `github_` / `group_` / `linear_` / `project_` / `workspace_` prefixes plus `script_get` / `script_save`)

### S6 — Runtime envelope unchanged

- **Level**: Bun unit (`packages/api-client`)
- **Given**: mock socket connected
- **When**: `request("git_get_status", { … })` (or unmapped equivalent in existing tests)
- **Then**: sent JSON is still `{ type: "request", payload: { request_id, action, data } }`
- **Signals**: existing `session.test.ts` assertions plus one mapped-action send

### S7 — Inference and rejection at the type level

- **Level**: Typecheck fixture
- **Given**: a file that is typechecked but not shipped
- **When**:
  1. `const out = await session.request("git_get_status", validInput)`
  2. `session.request("git_get_status", { not_a_field: true })`
  3. `session.request("workspace_createe", {})`
- **Then**: (1) `out` is `GitStatusResponse` (or contract output) without `T`; (2) and (3) `@ts-expect-error`
- **Signals**: `tsc` / native typecheck on the fixture

### S8 — App wrappers use inference

- **Level**: Typecheck
- **Given**: mapped helpers in web `ws-api.ts` / mobile `ws-actions.ts`
- **When**: typecheck web and mobile
- **Then**: mapped helpers compile; wrappers do not pass `request<Explicit>()` for catalog actions
- **Signals**: typecheck exit 0 for mapped wrappers. No `wsRequest<T>` / `request<T>` on a compile-time `WsAction`.

### S9 — Escape hatch is `requestUnchecked` only

- **Level**: Typecheck
- **Given**: every `WsAction` is on `WsContract` (`UnmappedWsAction` is `never`)
- **When**: a caller has a runtime-dynamic action name
- **Then**: `session.requestUnchecked(name, data)` compiles; `request("not_an_action")` does not
- **Signals**: `packages/api-client/src/ws/request-types.ts`

### S10 — String literals are not a backdoor

- **Level**: Typecheck fixture
- **Given**: public `request`
- **When**: `request("totally_fake", {})`
- **Then**: type error. `requestUnchecked("totally_fake", {})` type-checks.
- **Signals**: `@ts-expect-error` on the first; the second assigned to `Promise<unknown>`

### S11 — Mobile wrapper is not a second catalog

- **Level**: Static
- **Given**: `apps/mobile/src/api/ws-actions.ts`
- **When**: inspecting exports
- **Then**: it imports `WsAction` / mapped `request` from packages; it does **not** export its own `WS_ACTIONS` array or `export type WsAction`
- **Signals**: rg; file still present (M8)

### S12 — Attachment wire type matches Rust

- **Level**: Typecheck + review of mapper
- **Given**: `@atmos/api-types` `WorkspaceAttachmentPayload` and web `workspace.create` mapper
- **When**: building the WS payload
- **Then**: payload fields are `filename`, optional `mime`, `data_base64`. api-types does not use `name` / `content_type` / `path` for this struct.
- **Signals**: type fields; `ws-api.ts` mapper keys

### S13 — Mobile git diff uses the shared DTO

- **Level**: Static + typecheck
- **Given**: git mapped in v1
- **When**: searching mobile for a local `GitFileDiffResponse` interface body
- **Then**: none (re-export only, or deleted)
- **Signals**: rg; mobile typecheck

### S14 — Event catalog matches Rust extract

- **Level**: Bun unit
- **Given**: `fixtures/events.server.json` generated from `WsEvent`
- **When**: check-events runs
- **Then**: exit 0 iff `WS_EVENTS` equals the fixture set (~30 names)
- **Signals**: same pattern as APP-048 `check-actions`

### S15 — Event mismatch fails

- **Level**: Bun unit
- **Given**: one extra or missing event name
- **When**: check runs
- **Then**: non-zero exit that names the event
- **Signals**: test that mutates a copy of the set

### S16 — No intentional wire reshape

- **Level**: Review / git diff
- **Given**: APP-064 implementation PRs
- **When**: reviewing `apps/api/src/api/ws/message.rs` and `message/*.rs`
- **Then**: no serde rename or field drop “to make TS easier”
- **Signals**: empty protocol diff, or an explicit exception recorded in TECH

### S17 — Deferred N3–N5

- **Level**: n/a
- **Given**: N1/N2 shipped (full `WsContract` + `WsEventContract`)
- **When**: considering module-derived catalogs, OpenAPI, ts-rs
- **Then**: still Nice; not merge-blocking
- **Signals**: none required for APP-064

## Performance & load budgets

Not applicable. No new runtime work on the hot path beyond identical `JSON.stringify` of the same envelope.

## Regression checklist

- [ ] APP-048 `check-actions` / extract still green; `WS_ACTIONS` count does not shrink accidentally.
- [ ] `packages/api-client` reconnect / pending / no-queue tests still pass.
- [ ] Web computer-scope helper still rejects when scope changes (`wsRequestForComputerScope`).
- [ ] Mobile `MobileWsClient` tests still pass (adapter, not a new client).
- [ ] `scripts/check-package-boundaries.ts` green.
- [ ] Attachment upload/create workspace still sends `data_base64` (mapper, not the old api-types `name/path` shape).
- [ ] Logs still redact `token=` in WS URLs.

## Exploratory agent-browser checks

None. No UI. If a wrapper bug surfaces as a runtime 4xx/WS error, that is a TEST-run / manual API check, not a browser visual pass.

## Acceptance criteria

- [ ] All Must Have PRD items have at least one passing scenario (S1–S16).
- [ ] No oRPC/tRPC/ts-rest product dependency (S1).
- [ ] Mapped `request` infers input/output (S7) and v1 domains are complete (S5).
- [ ] `request("not_an_action")` is a type error (S10).
- [ ] Kernel has no domain API object (S3); mobile feature wrapper remains (S11).
- [ ] Event extract/check exists and fails on mismatch (S14, S15).
- [ ] `WorkspaceAttachmentPayload` matches Rust wire (S12).
- [ ] No new unconditional REST endpoints.
- [ ] `just typecheck` (or scoped package + web + mobile typecheck) and `@atmos/api-types` / `@atmos/api-client` tests pass.
- [ ] `atmos-specs-test-run` has updated Coverage Status after implementation.

## Manual verification steps

1. Optional: in a scratch TS file, call `request("workspace_create", {` and confirm the editor suggests snake_case wire fields.
2. No UI walkthrough required for merge.

## Non-coverage

- Playwright / agent-browser (no UI).
- Computer REST OpenAPI (N4).
- Rust DTO codegen (N5).
- Hub and Relay client redesign.
- Terminal stream protocol.

## Coverage Status

Commands (2026-08-24):

```bash
bun run --filter @atmos/api-types test        # 13 pass
bun run --filter @atmos/api-types typecheck
bun run --filter @atmos/api-client test       # 14 pass
bun run --filter @atmos/api-client typecheck
bun run --filter web typecheck                # contract-related errors 0; remaining: @zumer/snapdom (pre-existing)
bun run --filter @atmos/mobile typecheck      # contract-related errors 0; remaining: settings route paths (pre-existing)
```

N1/N2: `keyof WsContract` = `WsAction`; `keyof WsEventContract` = `WsEvent`. Remaining `unknown` outputs are GitHub-relay proxy JSON and `function_settings_get` (app view model).
