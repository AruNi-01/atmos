# TECH · APP-048: API Types

> Technical design · HOW. `@atmos/api-types` for main-app `/ws` wire types; Rust `WsAction` enum is action authority; enum-backed drift gate.

## 1. Summary

Introduce `packages/api-types` (`@atmos/api-types`) as the **TypeScript view** of main-app WebSocket wire types:

- Canonical frames matching Rust envelopes
- Complete action catalog from `apps/api` `WsAction` enum (snake_case wire names)
- Multi-client DTOs under an explicit merge rule
- **Action-name** drift check extracted from that enum

Do **not** put transport, auth, URL building, terminal PTY, desktop IPC, or business logic here. APP-049 depends on Phase 1 (frames + actions).

## 2. Architecture

```text
apps/api  (runtime authority)
  message.rs  WsMessage / WsRequest / WsAction / WsEvent / …
        │ extract wire names (M7)
        ▼
packages/api-types  (@atmos/api-types)
  ws/frames · ws/actions · ws/dto/*
        │
   ┌────┴────┐
 apps/web  apps/mobile  (desktop webview inherits web)
        │
        ▼
packages/api-client  (APP-049; request/session only)
```

**Dependency**: apps → `@atmos/api-types`. Package depends on nothing app-specific.

## 3. Channel boundaries

| Channel | Location |
|---------|----------|
| Main `/ws` | This package |
| Terminal stream | `@atmos/shared/terminal` |
| Relay REST DTOs | Optional `@atmos/api-types/relay` (N1) |
| Desktop IPC | `apps/desktop-electron` only |
| Auth / URL | Apps (see APP-049) |

## 4. Package layout

```text
packages/api-types/
  package.json                 # name: @atmos/api-types
  src/
    ws/
      frames.ts
      actions.ts               # WsAction + WS_ACTIONS
      dto/
        fs.ts
        git.ts
        project.ts
        workspace.ts
        group.ts
        github.ts              # if multi-client
      index.ts                 # optional: frames + actions only
    relay/                     # N1 only
  scripts/ or tests/
    check-ws-actions.ts        # compares WS_ACTIONS to extracted server list
  fixtures/
    actions.server.json        # generated/updated by extract step (committed cache OK)
  AGENTS.md
```

### Exports (recommended)

| Subpath | Contents |
|---------|----------|
| `@atmos/api-types/ws` | Re-export frames + actions |
| `@atmos/api-types/ws/frames` | Frame types |
| `@atmos/api-types/ws/actions` | `WsAction`, `WS_ACTIONS` |
| `@atmos/api-types/ws/dto/*` | Domain DTOs |
| `@atmos/api-types/relay` | N1 |

DTO modules: subpath-only (no mega-barrel of all DTOs required).

## 5. Canonical frames (M2)

### 5.1 Authority

Implement field optionality from **Rust** `WsRequest` / `WsResponse` / `WsError` / `WsNotification` (and parent `WsMessage` if exported) in `apps/api/src/api/ws/message.rs`.

At design time, web and mobile already diverge (e.g. response `success` required vs optional, error `code` closed union vs string). **Public package types follow Rust wire**, not the loosest client.

### 5.2 Conceptual shapes (adjust to match current serde exactly at implement time)

```ts
// Illustrative — implement from Rust, not from web alone
export type WsRequest = {
  type: "request";
  payload: { request_id: string; action: WsAction; data?: unknown };
};
export type WsResponse = {
  type: "response";
  payload: { request_id: string; success: boolean; data?: unknown };
};
export type WsError = {
  type: "error";
  payload: { request_id: string; code: string; message: string };
};
export type WsNotification = {
  type: "notification";
  payload: { event: string; data?: unknown }; // event may narrow to WsEvent when N2 lands
};
export type WsMessage = WsRequest | WsResponse | WsError | WsNotification;
```

### 5.3 Explicit exclusions (default MVP)

- **Terminal** messages: not here.
- **App-level `ping`/`pong`**: web intentionally avoids app-level ping (relay DO cost). Unless a live client still depends on typed ping/pong, **omit** from public union or document legacy inclusion. Prefer not to reintroduce product pings via types alone.
- Loose client parse types: if needed, `LooseWsMessage` lives next to parsers in api-client—not as the exported truth.

## 6. Action catalog (M3 / M7)

### 6.1 Authority

**Source of truth**: `pub enum WsAction` in `apps/api/src/api/ws/message.rs` with `#[serde(rename_all = "snake_case")]`.

Wire name for variant `FooBar` → `foo_bar` (confirm against existing Rust serde tests such as batch wire-name tests).

### 6.2 TS surface

```ts
export type WsAction = "fs_list_dir" | "project_create" | /* all extracted */ …;
export const WS_ACTIONS: readonly WsAction[] = [ /* same set, unique, sorted or enum order */ ];
```

Bootstrap may copy web’s list as a starting point, then **immediately** run extract+diff and fix gaps/duplicates (including server-only actions such as `terminal_workspace_candidates` if present on server).

### 6.3 Drift extraction (primary)

**Preferred pipeline**:

1. Small Rust unit test or `cargo` binary / build-script helper walks `WsAction` variants and writes `fixtures/actions.server.json` (sorted string array of wire names).
2. Package test loads `WS_ACTIONS` and `actions.server.json` and fails on set difference (missing / extra).
3. CI runs package test after Rust fixture is up to date (same PR as enum changes updates fixture via test or documented command).

**Fallback** (temporary): committed fixture hand-edited only if extract is blocked—must still be **derived from the enum**, not from web. Do not recommend hand-seed as the long-term path.

**Not primary**: grepping router match arms for action strings (brittle; secondary optional check only).

### 6.4 Phase policy

| Phase | Gate |
|-------|------|
| Phase 1 | Extract+diff **runnable** in package tests (hard-fail in package CI recommended) |
| Phase 4 | Wired into monorepo CI path used on main |
| After any server action add | Same PR: enum + fixture + `actions.ts` + at least one client if calling |

### 6.5 Non-goal

Per-action request/response mapped types in MVP.

## 7. Shared DTOs (M4)

### 7.1 Inventory (minimum move set)

Build a table in the implementation PR (not necessarily frozen here):

| Type | Web today | Mobile today | Target module |
|------|-----------|--------------|---------------|
| FsEntry, FsListDirResponse, … | ws-api-types | types.ts | dto/fs |
| Git* status/diff/commit | ws-api-types | types.ts | dto/git |
| ProjectModel, bootstrap | ws-api-types | types.ts | dto/project |
| WorkspaceModel, labels | ws-api-types | types.ts | dto/workspace |
| Group* if shared | … | … | dto/group |
| GithubIssue/Pr payloads if both | ws/github-api.ts | types.ts | dto/github |

Web-only review/automation/local-model DTOs **stay app-local** until a second consumer.

### 7.2 Merge rule

1. Prefer **server response JSON** field presence/nullability.
2. Break ties with **production web** shapes.
3. Mobile-only optional widening: either adopt package strictness and fix call sites, or temporary app-level type assertion—**do not** dual-export two models of the same name.
4. PR description lists optionality/renames.

### 7.3 Gate honesty

M7 does **not** check DTO fields. Optional later: golden JSON fixtures per DTO (Nice).

## 8. App migration

### Web

1. Depend on `@atmos/api-types`.
2. Replace local frames + `WsAction` in `use-websocket.ts` with imports.
3. Ban new authoritative definitions (`rg` in TEST).
4. Move shared DTOs out of `ws-api-types.ts` / `github-api.ts` incrementally.
5. Transport stays until APP-049.

### Mobile

1. Depend on package; import frames/actions.
2. Type helpers as `WsAction`.
3. Shared DTOs from package; delete duplicate interfaces.
4. Relay REST types stay until N1 unless already multi-client and moved deliberately.

### Desktop

- Shell does **not** import api-types for IPC.
- Webview inherits web cutover.

### Docs chore

Update `apps/api/AGENTS.md` (or equivalent) “keep DTOs in sync with web” → **sync action/DTO TS surface via `@atmos/api-types`**.

## 9. Relationship to APP-049 / APP-050

| Concern | Owner |
|---------|-------|
| Frames/actions/DTOs/drift | APP-048 |
| Session/reconnect/request | APP-049 |
| Package edges / AGENTS map | APP-050 |
| **Hard gate for 049 Phase 1** | APP-048 Phase 1 complete |

Notification fan-out may use `event: string` until N2; APP-049 must not invent a second event catalog package.

## 10. Rollout PRs

| PR | Scope |
|----|-------|
| PR1 | Package + frames + actions + extract fixture + web import actions/frames + package drift test |
| PR2 | Shared DTO modules + inventory table + dual imports |
| PR3 | Mobile cutover; delete local authorities |
| PR4 | Monorepo CI hard-fail wiring |
| PR5+ | N1–N4 |

## 11. Risks

| Risk | Mitigation |
|------|------------|
| False confidence on DTOs | M13; review inventory |
| Enum extract tooling friction | Start with test-written fixture; improve later |
| Mega-union TS cost | Subpath imports |
| Scope creep into terminal/relay/IPC | Channel matrix |

## 12. Out of scope (implementation)

- APP-049 kernel
- Full ts-rs DTO generation (N4)
- Changing product wire for convenience
