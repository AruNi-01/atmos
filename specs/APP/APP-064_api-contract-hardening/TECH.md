# TECH · APP-064: API Contract Hardening

<!-- updated 2026-08-24: N1/N2 landed — every WsAction has a WsContract row; every WsEvent has a payload map -->

> Technical Design · HOW. Implements PRD APP-064: API Contract Hardening. Addresses M1–M11. N1 (remaining action map) and N2 (event payloads) are implemented. N3–N5 remain deferred.

## Scope summary

Harden the existing Computer `/ws` TypeScript contract on top of APP-048/049/050. No new RPC runtime, no new package, no wire JSON change.

Out of this TECH: oRPC, `@atmos/api-sdk`, Hub/Relay merge, terminal PTY, desktop IPC, OpenAPI-for-all-REST, Query cache.

## Architecture overview

```text
apps/web  apps/mobile  (desktop webview inherits web)
   │  feature wrappers: ws-api.ts / ws/*-api.ts / ws-actions.ts
   │  (camelCase UX, defaults, Query)          ← stay in apps (M3, M8)
   ▼
@atmos/api-client     session kernel
   request(action, data)  ← infer from WsContract (M5, M7)
   ▼
@atmos/api-types      contract
   frames + WS_ACTIONS + WsContract + (M10) WsEvent
   ▼
apps/api  message.rs  WsAction / WsEvent / DTO structs   ← runtime SOT
```

Control plane is untouched:

```text
apps/* ──► @atmos/hub-client     Hub HTTPS
apps/* ──► @atmos/relay-client   Relay HTTPS
         ──► gateway_url + client_token ──► Computer /ws (above)
```

**External dependency**: none. Do not add `orpc`, `@orpc/*`, `@trpc/*`, `ts-rest`, or OpenAPI generators in v1.

## Frozen decisions (M1–M3)

| Decision | Rule |
|----------|------|
| No oRPC / tRPC / ts-rest | If a PR adds one “for type safety”, reject and point here. |
| No `@atmos/api-sdk` | Second consumer of a feature wrapper still follows APP-050. |
| No namespaced kernel | `WsSession.request` stays the Computer RPC primitive. |
| No hub+relay merge | Keep APP-056 / APP-016 clients. |
| Computer REST after session | Still app-owned (`apps/web/src/api/rest-api.ts`, mobile as needed). Not relay-client. |
| `WS_ACTIONS` array split | Not a v1 deliverable (PRD N3). Contract **modules** may split by domain; the public catalog stays one union + one extract gate. |

Update `packages/AGENTS.md` decision tree with one row: **main `/ws` input/output map → `@atmos/api-types` (APP-064); do not add an RPC framework.**

## Module-by-module design

### `packages/api-types` (M4, M6, M9, M10)

Keep frames and the extract pipeline. Add a contract map beside existing DTOs.

```text
packages/api-types/src/ws/
  frames.ts
  actions.ts                 # WS_ACTIONS + WsAction (APP-048; still extract-checked)
  events.ts                  # NEW: WS_EVENTS + WsEvent (M10)
  contract.ts                # NEW: merge domain maps → WsContract
  contract/                  # NEW, v1 domains only
    fs.ts
    git.ts
    github.ts
    group.ts
    linear.ts
    project.ts
    workspace.ts
  dto/                       # existing; request types join here when missing
  index.ts
```

Exports:

| Subpath | Contents |
|---------|----------|
| `@atmos/api-types/ws` | frames + actions + events + `WsContract` |
| `@atmos/api-types/ws/actions` | unchanged role |
| `@atmos/api-types/ws/events` | `WsEvent`, `WS_EVENTS`, `isWsEvent` |
| `@atmos/api-types/ws/contract` | `WsContract`, helpers |
| `@atmos/api-types/ws/dto/*` | existing + any new request structs |

Do **not** put `request()` here.

#### Contract shape

```ts
export type WsContract = {
  git_get_status: {
    input: GitStatusRequest;
    output: GitStatusResponse;
  };
  workspace_create: {
    input: WorkspaceCreateRequest;
    output: WorkspaceModel;
  };
  fs_get_home_dir: {
    input: Record<string, never>;
    output: { path: string };
  };
  // …v1 domains only
};

export type MappedWsAction = keyof WsContract & WsAction;
export type UnmappedWsAction = Exclude<WsAction, MappedWsAction>;
```

Rules:

- Keys are **wire names** (`git_get_status`), not camelCase methods.
- `input` / `output` are server JSON (snake_case). Prefer existing `dto/*` types; add `*Request` types where only responses exist today.
- Empty body: `Record<string, never>` (runtime still sends `{}`, matching current `data = {}`).
- Every key in `WsContract` **must** be a `WsAction`. Type-level check: `MappedWsAction` / assignability test so a typo key fails package tests.
- `WsContract` does **not** have to list every `WsAction` in v1 (M6).

#### v1 mapped set (M6)

An action is in v1 iff it is in `WS_ACTIONS` and either:

- its wire name starts with `fs_`, `git_`, `github_`, `group_`, `linear_`, `project_`, or `workspace_`, or
- it is `script_get` or `script_save` (project scripts; live next to `dto/project.ts`).

Do not include `app_open`, canvas/pt-design, quota, review, etc. in v1 even if they sit near those files in `actions.ts`.

**Exclude** `git_commit_skill_system_status` from the `git_` prefix cut — it is a skills action, not git domain. Implemented as `isV1MappedAction()` in `packages/api-types/src/ws/v1-actions.ts`.

Request structs that do not exist yet in `dto/*` are added from Rust `message.rs` / `message/*.rs` in the same domain PR. Response types already in `dto/*` are reused.

Domain PRs may merge in any order after contract infrastructure. Suggested order: fs → git → project/group/workspace → linear → github (largest).

#### Domain files vs one blob

v1: one file per existing dto domain under `contract/`, merged in `contract.ts`. This is **not** `client.git.getStatus()`. It is only so `git` request/response live next to `dto/git.ts`.

`WS_ACTIONS` remains the extract-backed full list (names). `keyof WsContract` equals `WsAction` at compile time; do not replace the extract list with `keyof WsContract` as the drift gate — extract still catches a missing catalog row.

#### Notification catalog (M10)

Copy the action extract pattern:

1. Walk Rust `pub enum WsEvent` in `apps/api/src/api/ws/message.rs` (`rename_all = "snake_case"`).
2. Write `packages/api-types/fixtures/events.server.json`.
3. `WS_EVENTS` must match. `bun run --filter @atmos/api-types extract-events` / `check-events` (names can share the action scripts with a flag).

`WsNotification` stays `{ event: string; data?: unknown }` at the frame layer. Listener typing uses `WsEventContract` (N2, landed):

```ts
export type WsEventContract = {
  workspace_setup_progress: { payload: WorkspaceSetupProgressNotification };
  agent_notification: { payload: AgentNotificationPayload };
  // …one row per WsEvent
};
```

#### DTO hygiene in the same PR as the matching map (M9)

| Type | Today | Fix |
|------|--------|-----|
| `WorkspaceAttachmentPayload` in `dto/workspace.ts` | `{ name, path?, content_type?, size? }` | Match `crates/core-service/src/types.rs`: `{ filename: string; mime?: string \| null; data_base64: string }` |
| Web `ws-api-types.ts` `WorkspaceAttachmentPayload` | `{ filename, mime, dataBase64 }` | App **view** type; rename if needed (`WorkspaceAttachmentView`) so it does not shadow the wire type |
| Mobile `GitFileDiffResponse` in `apps/mobile/src/api/types.ts` | Transitional optional `old_content` | Use `@atmos/api-types/ws/dto/git` once `git_file_diff` is mapped; adapt call sites |

`ArchivedWorkspace` in web (`project_name` extra field) stays **web-local**. api-types may keep `ArchivedWorkspace = WorkspaceModel` only if that is what the server returns on the shared action; do not force web’s extra field into the wire type.

### `packages/api-client` (M5, M7)

Landed (`packages/api-client/src/ws/session.ts`):

```ts
request<A extends MappedWsAction>(
  action: A,
  data?: WsContract[A]["input"],
): Promise<WsContract[A]["output"]>;
```

Empty input: `data?` so `request("fs_get_home_dir")` works; implementation default remains `{}`.

**String hole:** delete `WsAction | string` from the public mapped overload. Do **not** allow arbitrary `string` literals to satisfy `action`.

Escape hatch (migration / dynamic names):

```ts
requestUnchecked<T = unknown>(action: string, data?: unknown): Promise<T>;
```

Use only when the action name is not a compile-time `WsAction`. Feature code in mapped domains must not call it.

`requestWhenReady` gets the same overloads (`action` + `data` from `WsContract` when mapped).

`packages/api-client/src/ws/types.ts` `RequestWhenReadyOptions` should become a discriminated / generic options type so `action` and `data` stay paired.

No other kernel behavior changes (reconnect, pending map, no-queue, URL ownership).

### `apps/web`

- `apps/web/src/api/ws/request.ts`: `wsRequest` / `wsRequestForComputerScope` re-export the same overloads. Stop importing `WsAction` from `use-websocket` for this helper; import from `@atmos/api-types/ws/actions` (the hook already re-exports; this just avoids a UI-layer import for types).
- Mapped call sites in `ws-api.ts` and `ws/*-api.ts`: drop redundant `<T>` when the contract already specifies `output`. Do **not** rewrite those files into a package.
- `send` in `use-websocket.ts` should match `WsSession.request` overloads.

### `apps/mobile`

- Keep `ws-actions.ts` as the feature wrapper (`M8`). Type internals via `client.request("workspace_create", wirePayload)` without a second `T` once mapped.
- Keep `MobileWsClient` as the RN adapter over `createWsSession`. Do not replace it with oRPC or a generated client.
- Delete duplicate wire interfaces covered by M9.

### `apps/api` / Rust

- No new `WsAction` / REST route for this spec.
- Extract scripts may grow an events walk next to `packages/api-types/scripts/extract-ws-actions.ts`.
- When adding a `WsAction` after this spec: same PR must update enum, extract fixture, `actions.ts`, DTO, **and** a `WsContract` row. Same for `WsEvent` + `WsEventContract`. Recipe: `packages/api-types/AGENTS.md`.

### REST (N4, not v1)

Computer REST remains the four `apps/api/AGENTS.md` categories. Types today:

- Computer: `apps/web/src/api/rest-api.ts` (handwritten) ↔ `apps/api/src/api/{system,dto,canvas,review,agent,hooks}`
- Hub: `@atmos/hub-client`
- Relay: `@atmos/relay-client`

Do **not** emit one OpenAPI for all three. If N4 happens: inventory Computer `/api/system/*` only, and only share a type when mobile/desktop-node is a second consumer. Mobile currently barely uses Computer REST.

## Data model

No DB tables. Types only.

v1 request examples (implement from Rust, not from this sketch):

```ts
// dto/git.ts (add)
export type GitStatusRequest = {
  project_id?: string;
  workspace_id?: string;
  // fields from apps/api/src/api/ws/message/git.rs — match serde
};

// dto/workspace.ts (fix)
export type WorkspaceAttachmentPayload = {
  filename: string;
  mime?: string | null;
  data_base64: string;
};

export type WorkspaceCreateRequest = {
  project_guid: string;
  name: string;
  display_name: string;
  branch: string;
  base_branch: string | null;
  sidebar_order: number;
  initial_requirement: string | null;
  attachments: WorkspaceAttachmentPayload[];
  github_issue: GithubIssuePayload | null;
  github_pr: GithubPrPayload | null;
  auto_extract_todos: boolean;
  priority: string | null;
  workflow_status: string | null;
  label_guids: string[] | null;
  // plus any other serde fields on the Rust struct
};
```

Authoritative field lists: `apps/api/src/api/ws/message.rs` and `message/*.rs`. If web’s helper uses camelCase, mapping stays in `ws-api.ts` (already does for attachments).

## Transport

No new WebSocket messages. No new REST.

Existing envelope unchanged (`frames.ts`). Contract types fill `payload.data`.

## Security & permissions

Unchanged. Kernel still does not set `Authorization` headers. Do not log request bodies that may contain `data_base64` / tokens; existing redaction for URL tokens stays.

## Rollout plan

1. **Docs freeze**: `packages/AGENTS.md` + api-types/api-client AGENTS — no oRPC, contract map home, kernel stays kernel.
2. **Contract infrastructure**: `WsContract` type, merge helper, “keys ⊆ WsAction” type test, `request` overloads + `requestUnchecked`, session unit tests still pass.
3. **v1 domain maps** (can be one PR or one PR per domain): fs, git, github, group, linear, project, workspace — including attachment + git diff hygiene.
4. **App wrappers**: web `wsRequest` + drop redundant `T` on mapped helpers; mobile `ws-actions` mapped methods.
5. **Events catalog**: extract/check `WsEvent` (may ship with step 2 if cheap).
6. **N1/N2 (landed)**: remaining `WsAction` domains mapped; `WsEventContract` payload map for all 30 events. GitHub-relay action outputs stay `unknown` (opaque proxy JSON). `function_settings_get` stays `unknown` (web `FunctionSettings` is an app view with feature imports).
7. **Still deferred**: N3 derive catalogs from modules; N4 Computer REST inventory; N5 ts-rs codegen.

Each of 2–5 is mergeable without a flag. No user-facing flag.

## Risks & tradeoffs

- **Tradeoff**: handwritten map vs ts-rs. Chose handwritten to match APP-048 and avoid a DTO-layer rewrite (QUALITY-004 F-06). Escape hatch is N5 if the map becomes the bottleneck.
- **Tradeoff**: incremental unmapped overload vs big-bang 273 actions. Chose incremental (M6) so the typed path ships.
- **Tradeoff**: wire types for future web-only domains in api-types (N1) vs second-consumer rule. Chose wire-in-api-types so `request()` can infer; view models stay in apps.
- **Risk**: people delete `ws-actions.ts` thinking it is a dual catalog. AGENTS one-liner: it is an app feature wrapper.
- **Risk**: `WorkspaceAttachmentPayload` rename/fix breaks web compile until view type is renamed. Do that in the same PR as the workspace map.
- **If this breaks in production**: revert the TS-only PRs; runtime JSON is unchanged. Rollback is git revert, not a flag.

## Dependencies & compatibility

- Depends on: APP-048 Phase 1+ (exists), APP-049 kernel (exists), APP-050 layering (exists).
- Blocks: none. Makes later multi-client WS features cheaper.
- Minimum Atmos version: current main.
- Does not require CLI, Hub, or Relay releases.

## Open questions (resolved here)

- Empty input: optional second arg; default `{}`.
- Escape hatch name: `requestUnchecked`.
- Untyped `request<T>` overload: removed once N1 covered 100%. Dynamic names use `requestUnchecked`.
- `WS_ACTIONS` derivation from `keyof WsContract`: extract list stays the name source; compile-time `UnmappedWsAction` is `never`.
