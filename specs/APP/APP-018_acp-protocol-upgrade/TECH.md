# TECH · APP-018: ACP Protocol Upgrade

## 1. Goal

Upgrade Atmos's ACP integration from the current `agent-client-protocol 0.9.4` plus patched `agent-client-protocol-schema 0.10.8` baseline to the latest compatible ACP baseline, then align Agent Chat with the protocol-owned session lifecycle.

As of the May 26, 2026 review, the version situation is split:

- Latest published protocol/schema crate: `agent-client-protocol-schema 0.13.3`.
- Latest published Rust SDK crate: `agent-client-protocol 0.12.1`.
- SDK `0.12.1` pins `agent-client-protocol-schema = 0.13.2`, so Atmos cannot reach schema `0.13.3` through that SDK without a newer SDK release, a compatible git revision, or a deliberate fork/patch.

The important product shift is that ACP sessions become agent-owned resources. Atmos should keep only ephemeral runtime state for currently connected chats. It should not maintain a persistent local ACP session catalog in `AgentChatSessionRepo` or equivalent database tables.

This design covers PRD Must Haves M1-M18:

- SDK upgrade and schema compatibility.
- `clientInfo` plus `agentInfo` consumption.
- Registry and generic config options preservation.
- ACP-native `session/list`, `session/resume`, `session/close`, `session_info_update`, and `logout`.
- Session history sourced from ACP, scoped by agent identity.
- No silent fallback from failed resume/load to unrelated new sessions.
- Nullable or missing usage fields must not break streaming.
- Local ACP chat rows can be ignored, cleaned up, or removed because there are no users yet.

## 2. Current State

### 2.1 Dependency Baseline

Current implementation:

- `crates/agent/Cargo.toml` depends on `agent-client-protocol = "0.9"` with `unstable_session_model` and `unstable_session_usage`.
- `Cargo.lock` resolves `agent-client-protocol 0.9.4`.
- `Cargo.lock` resolves `agent-client-protocol-schema 0.10.8`.
- Root `Cargo.toml` patches `agent-client-protocol-schema` to `vendor/agent-client-protocol-schema` so Atmos tolerates Claude ACP `usage_update.used = null`.

Target implementation:

- Preferred target: use the latest compatible Rust SDK/schema pair available at implementation start. If `agent-client-protocol 0.13.x` exists and is compatible, target that SDK and `agent-client-protocol-schema 0.13.3` or newer.
- Current known fallback: use `agent-client-protocol 0.12.1`, which pins `agent-client-protocol-schema = 0.13.2`.
- Keep the `0.13.3` schema gap explicit if the fallback is used. Do not claim Atmos is on schema `0.13.3` while the SDK still pins `0.13.2`.
- Preserve a nullable-usage compatibility strategy because schema `0.13.x` still needs verification before removing the local Claude ACP tolerance.

### 2.2 Implemented ACP Features

Already implemented and must be preserved:

- ACP Registry install/list flow through the official registry CDN.
- Generic session config options through `configOptions` and `config_options_update`, with compatibility for legacy mode/model controls.
- `clientInfo` during initialize.
- Streaming updates, tool calls, permission prompts, cancellation, plan updates, and usage updates.

Partially implemented:

- Resume currently uses `session/load` and falls back to `session/new` if loading fails. This violates the new PRD requirement because a failed resume must stay failed.
- Session titles are currently generated and stored locally instead of being driven by `session_info_update`.

Not implemented:

- `agentInfo` consumption.
- ACP `session/list`.
- ACP `session_info_update`.
- ACP `session/resume`.
- ACP `session/close`.
- ACP `logout`.

## 3. Architecture

### 3.1 Layering

```text
apps/web
  Agent Chat UI, history panel, capability states, logout affordance

apps/api
  REST bootstrap/catalog endpoints
  /ws/agent/{runtime_session_id} active session transport

crates/core-service
  Runtime-only AgentSessionService
  Agent registry lookup and launch policy
  No persistent ACP chat session catalog

crates/agent
  ACP Rust SDK adapter
  Process lifecycle, initialize, capability probing
  list/resume/close/logout/session updates

ACP agent process
  Owns persistent sessions and authentication state
```

The existing WebSocket-first rule still applies to active chat. REST remains appropriate for bootstrap-style request/response operations that already exist in Agent Chat: creating a runtime session, listing native history, resuming a selected native session, logging out, and attachment upload. All streaming, prompt submission, permission responses, cancellation, config changes, and close notifications continue through `/ws/agent/{runtime_session_id}`.

### 3.2 Session Identity Model

Use two distinct IDs:

- `runtime_session_id`: Atmos-generated UUID for one in-memory connection attempt. This is the path parameter for `/ws/agent/{runtime_session_id}`.
- `acp_session_id`: Agent-owned durable ACP session id returned by `session/new`, `session/list`, or `session/resume`.

Rules:

- UI history rows use `acp_session_id`.
- Active WebSocket routes use `runtime_session_id`.
- Runtime state may map `runtime_session_id -> acp_session_id` after the ACP session is established.
- Atmos does not persist this mapping across process restarts.
- Reloading the app recovers history by calling ACP `session/list` again.

## 4. Crate-Level Design

### 4.1 `crates/agent`: ACP Adapter

Upgrade dependency:

Before implementation, re-run the dependency check:

```bash
cargo info agent-client-protocol
cargo info agent-client-protocol-schema
```

If a compatible `agent-client-protocol 0.13.x` SDK exists, use it and align the local schema patch to `0.13.3` or newer. If the Rust SDK is still `0.12.1`, use the current fallback:

```toml
agent-client-protocol = { version = "0.12.1", features = [
  "unstable_session_model",
  "unstable_session_usage",
  "unstable_logout",
] }
```

Do not enable broad `unstable` or unrelated experimental features such as MCP-over-ACP or session delete for this spec.

Refresh the local schema patch strategy:

- Because `agent-client-protocol 0.12.1` pins schema `0.13.2`, any `[patch.crates-io]` override used with that SDK must target package version `0.13.2`. A patch package versioned `0.13.3` will not satisfy the SDK's exact `=0.13.2` dependency.
- If a newer SDK accepts schema `0.13.3`, move the local patch target to `0.13.3`.
- Keep the patch minimal: only tolerate `usage_update.used` and `usage_update.size` being `null` or missing.
- Add tests in implementation that feed `used: null`, `size: null`, and missing usage counters through the ACP notification decoder.
- Remove the patch only after upstream schema supports nullable usage or the SDK exposes a tolerant raw-notification hook before typed decode.

Replace the old `ClientSideConnection::new(...)` integration with the SDK 0.12 builder/connection model behind a local adapter. The rest of Atmos should not depend directly on SDK connection construction details.

New internal adapter boundaries:

```rust
pub struct AcpControlClient {
    // Short-lived initialize/list/logout/control connection.
}

pub struct AcpSessionRunner {
    // Long-lived active session connection and event pump.
}

pub struct AcpSessionHandle {
    pub runtime_session_id: Uuid,
    pub acp_session_id: Option<String>,
    pub tx: mpsc::Sender<SessionCommand>,
}
```

Public crate-facing operations:

```rust
pub async fn list_acp_sessions(
    launch: AcpLaunchSpec,
    request: AcpListSessionsRequest,
) -> Result<AcpListSessionsResult>;

pub async fn run_acp_session(
    launch: AcpLaunchSpec,
    request: AcpRunSessionRequest,
    event_tx: mpsc::Sender<AcpClientEvent>,
) -> Result<AcpSessionHandle>;

pub async fn logout_acp_agent(
    launch: AcpLaunchSpec,
    request: AcpLogoutRequest,
) -> Result<AcpLogoutResult>;
```

Core request/response types:

```rust
pub struct AcpListSessionsRequest {
    pub cwd: Option<PathBuf>,
    pub cursor: Option<String>,
}

pub struct AcpListSessionsResult {
    pub agent_info: Option<AcpImplementationInfo>,
    pub capabilities: AcpAgentCapabilities,
    pub sessions: Vec<AcpNativeSession>,
    pub next_cursor: Option<String>,
}

pub struct AcpNativeSession {
    pub acp_session_id: String,
    pub title: Option<String>,
    pub cwd: Option<PathBuf>,
    pub updated_at: Option<DateTime<Utc>>,
    pub raw: serde_json::Value,
}

pub enum AcpRunSessionMode {
    New,
    Resume {
        acp_session_id: String,
        cwd: Option<PathBuf>,
    },
}
```

Event additions:

```rust
pub enum AcpClientEvent {
    AgentInfoUpdated(AcpImplementationInfo),
    CapabilitiesUpdated(AcpAgentCapabilities),
    SessionInfoUpdated(AcpSessionInfo),
    SessionClosed { reason: Option<String> },
    // Existing stream/tool/permission/plan/config/usage/error events remain.
}
```

Command additions:

```rust
pub enum SessionCommand {
    Prompt(AgentMessage),
    PermissionResponse(PermissionResponse),
    Cancel,
    CloseSession,
    SetConfigOption { option_id: String, value: serde_json::Value },
}
```

Behavior requirements:

- Initialize must send Atmos `clientInfo`.
- Initialize response must preserve and expose `agentInfo`.
- `session/list` must be called only when the initialized agent advertises support or the SDK method exists for the current negotiated protocol. Unsupported agents return an explicit unsupported result.
- `session/list` is cursor-paginated by ACP: request `cursor`, response `nextCursor`. ACP does not define a client-supplied `limit`/`pageSize` field, so Atmos must never auto-follow `nextCursor` to collect all pages. The UI asks for one page at a time; "Load more" sends the previous `nextCursor`.
- Agents own upstream page size and should enforce reasonable limits internally. Atmos may cap an oversized unpaginated response before returning it to the browser, but this is a defensive UI bound, not an ACP pagination parameter.
- `session/resume` must be preferred for native resume. `session/load` is only allowed as a compatibility fallback when the target agent does not support resume but explicitly supports load-style replay. A resume/load failure must return an error to the UI and must not create a new session.
- `session/close` should be sent for active sessions before dropping the handle. If close fails because the process has already exited, log at debug level and complete local cleanup.
- `logout` should be implemented as a control operation, not tied to a chat runtime session.

### 4.2 `crates/core-service`: Runtime-Only Agent Sessions

Refactor `AgentSessionService` so ACP chat sessions are runtime resources, not database rows.

Remove from the ACP chat path:

- `AgentChatSessionRepo::create`.
- `AgentChatSessionRepo::list_*`.
- `AgentChatSessionRepo::update_title`.
- `AgentChatSessionRepo::set_acp_session_id`.
- `AgentChatSessionRepo::mark_closed`.
- DB-backed resume by Atmos session id.

Keep:

- Agent registry and custom agent lookup through `AgentService`.
- Workspace/project cwd resolution and file-access policy.
- Attachment handling where it is not session-catalog persistence.
- In-memory handles for currently active sessions.

Runtime state:

```rust
pub struct AgentSessionRuntimeRegistry {
    pending: HashMap<Uuid, LazySessionSpec>,
    active: HashMap<Uuid, ActiveAgentSession>,
    by_acp_session: HashMap<(String, String), Uuid>,
}

pub struct LazySessionSpec {
    pub runtime_session_id: Uuid,
    pub registry_id: String,
    pub launch: AcpLaunchSpec,
    pub cwd: PathBuf,
    pub context: AgentSessionContext,
    pub allow_file_access: bool,
    pub mode: LazySessionMode,
}

pub enum LazySessionMode {
    New,
    Resume { acp_session_id: String },
}
```

New service methods:

```rust
pub async fn create_session_lazy(
    &self,
    request: CreateAgentSessionRequest,
) -> Result<LazyAgentSession>;

pub async fn resume_native_session_lazy(
    &self,
    request: ResumeNativeAgentSessionRequest,
) -> Result<LazyAgentSession>;

pub async fn list_native_sessions(
    &self,
    request: ListNativeAgentSessionsRequest,
) -> Result<ListNativeAgentSessionsResponse>;

pub async fn logout_agent(
    &self,
    request: LogoutAgentRequest,
) -> Result<LogoutAgentResponse>;

pub async fn close_runtime_session(
    &self,
    runtime_session_id: Uuid,
) -> Result<()>;
```

No persistent migrations are required for the new model. During implementation, verify whether the existing ACP chat session table is only used by this flow. If so, add a cleanup migration or leave the table unused until a broader schema cleanup pass. Because there are no users, old rows do not need migration or display.

### 4.3 `apps/api`: HTTP and WebSocket Surface

Keep `/ws/agent/{runtime_session_id}` as the active chat channel.

Replace old DB-session REST semantics with ACP-native semantics:

```text
POST /api/agent/session
  Create a new runtime session spec.
  Returns { runtime_session_id, registry_id, cwd, status }.

POST /api/agent/session/resume
  Create a runtime session spec for an ACP session returned by session/list.
  Body includes { registry_id, acp_session_id, cwd? }.
  Returns { runtime_session_id, registry_id, acp_session_id, cwd, status }.

GET /api/agent/sessions?registry_id=...&cwd=...&cursor=...&limit=...
  Calls one ACP session/list page for the selected agent.
  cursor is forwarded to ACP; limit is an Atmos response cap only for unpaginated oversized agent results because ACP has no page-size request field.
  Returns native ACP sessions, capability metadata, next_cursor, and truncated.

POST /api/agent/logout
  Calls ACP logout for the selected agent/auth method.
  Returns logout status and any re-auth requirement.

POST /api/agent/upload-attachments
  Existing attachment upload path remains.
```

Retire old local-session routes from the ACP Agent Chat UI:

```text
GET    /api/agent/sessions/{session_id}
PATCH  /api/agent/sessions/{session_id}
DELETE /api/agent/sessions/{session_id}
POST   /api/agent/sessions/{session_id}/resume
```

If keeping route handlers temporarily is cheaper during implementation, they must either call the new native methods or return `410 Gone`/structured unsupported responses. They must not read the old local ACP session catalog.

REST DTOs:

```ts
export interface NativeAgentSessionItem {
  registry_id: string;
  acp_session_id: string;
  title: string | null;
  cwd: string | null;
  updated_at: string | null;
  capabilities?: AgentSessionCapabilities;
}

export interface ListNativeAgentSessionsResponse {
  registry_id: string;
  agent_info: AgentImplementationInfo | null;
  capabilities: AgentCapabilities;
  items: NativeAgentSessionItem[];
  next_cursor: string | null;
  truncated: boolean;
  unsupported_reason: string | null;
}

export interface ResumeNativeAgentSessionRequest {
  registry_id: string;
  acp_session_id: string;
  cwd?: string | null;
  workspace_id?: string | null;
  project_id?: string | null;
}
```

WebSocket client messages:

```ts
type AgentClientMessage =
  | { type: "prompt"; content: string; attachments?: AttachmentRef[] }
  | { type: "permission_response"; request_id: string; outcome: PermissionOutcome }
  | { type: "cancel" }
  | { type: "close_session" }
  | { type: "set_config_option"; option_id: string; value: unknown }
  | { type: "set_agent_default_config"; registry_id: string; values: Record<string, unknown> };
```

WebSocket server message additions:

<!-- updated 2026-05-27: session_info_update fields remain optional on the WS DTO so Atmos can preserve ACP's undefined/null/value distinction for partial metadata updates. -->

```ts
type AgentServerMessage =
  | { type: "agent_info_update"; agent_info: AgentImplementationInfo }
  | { type: "capabilities_update"; capabilities: AgentCapabilities }
  | { type: "session_info_update"; acp_session_id: string; title?: string | null; cwd?: string | null; updated_at?: string | null }
  | { type: "session_closed"; reason?: string | null }
  // Existing stream/tool/permission/error/turn_end/load_completed/config/plan/usage messages remain.
```

`load_completed` should be renamed or supplemented in implementation if it no longer represents `session/load`. The new neutral event should be `session_ready`, carrying both `runtime_session_id` and `acp_session_id`.

### 4.4 `apps/web`: Agent Chat UX

Update the Agent Chat data model so history is native ACP history:

- History panel requires a selected `registry_id`.
- `agentRestApi.listSessions` calls `GET /api/agent/sessions` with `registry_id`.
- History rows use `acp_session_id`, not a local Atmos DB id.
- Opening a history row calls `POST /api/agent/session/resume`, then connects to `/ws/agent/{runtime_session_id}`.
- New chat calls `POST /api/agent/session`, then connects to `/ws/agent/{runtime_session_id}`.
- Titles update from `session_info_update`.
- Local rename/delete actions are removed unless a future ACP method supports them.
- Logout is shown at the agent-auth boundary and calls `POST /api/agent/logout`.

Capability states:

- If `session/list` is unavailable, show an empty history state explaining that the selected agent does not expose ACP history.
- If `session/resume` is unavailable for a listed session, disable resume for that row.
- If `session/close` is unavailable, closing the tab only tears down the local connection and the UI should not imply remote cleanup.
- If `logout` is unavailable, hide or disable the logout action.

Do not store ACP sessions in local browser storage as a fallback catalog. Browser state may keep the currently selected runtime session only.

### 4.5 `infra`

No new persistent storage is needed.

Implementation may remove or stop wiring old ACP chat session repository methods once all callers are gone. If the table is shared with non-ACP functionality, leave it in place and make ACP Agent Chat ignore it.

## 5. Data and Capability Model

### 5.1 Agent Capability Snapshot

```rust
pub struct AcpAgentCapabilities {
    pub session_list: CapabilityState,
    pub session_resume: CapabilityState,
    pub session_close: CapabilityState,
    pub logout: CapabilityState,
    pub config_options: CapabilityState,
    pub session_info_update: CapabilityState,
}

pub enum CapabilityState {
    Supported,
    Unsupported { reason: Option<String> },
    Unknown,
}
```

Capabilities should come from initialize response and SDK feature availability where possible. If the protocol does not expose a clean boolean for a method, Atmos should probe conservatively and cache only for the current control/session connection.

### 5.2 Session Metadata

```rust
pub struct AcpSessionInfo {
    pub acp_session_id: String,
    pub title: Option<String>,
    pub cwd: Option<PathBuf>,
    pub updated_at: Option<DateTime<Utc>>,
}
```

Merge rules:

- `session_info_update` is authoritative for active sessions.
- `session/list` is authoritative for history.
- If the agent omits `updated_at`, UI ordering falls back to response order and then title/id for deterministic rendering.
- Atmos-generated placeholder titles may be used only for display of an active session before the agent provides a title. They must not be persisted.

## 6. Error Handling

Resume:

- If `session/resume` returns not found, show a not-found resume error.
- If the agent requires authentication, trigger the existing auth flow and retry only after the user completes auth.
- If resume fails for any other reason, keep the current UI on the previous state and surface the error.
- Never fall back to `session/new` after a failed resume.

List:

- If unsupported, return `unsupported_reason` and an empty list.
- If authentication is required, return a structured auth-required response that the UI can route into the existing ACP auth flow.
- If the agent process cannot start, return a launch error scoped to that agent.

Close:

- Send `session/close` first when supported.
- Always clean local runtime maps after close or process exit.
- Do not close the whole ACP process if the SDK supports closing a single session without killing the process.

Usage updates:

- `used`, `size`, and cost-like fields are optional in Atmos DTOs.
- A malformed usage update should be logged and skipped, not terminate the ACP session.

## 7. Security and Privacy

- Do not log auth tokens, auth method payloads, or raw environment variables.
- `logout` must clear agent authentication state through the ACP method only; Atmos should not delete unrelated local files unless a specific agent contract says so.
- `cwd` accepted from API requests must resolve through the existing workspace/project/temp cwd policy.
- `session/resume` grants Atmos file-tool access only when the request carries a valid `workspace_id` or `project_id` and the selected ACP `cwd` is inside that context root. Agent-native sessions resumed without context may still pass `cwd` to ACP, but Atmos client-side file tools remain disabled.
- `allow_file_access` remains false unless the session is attached to an approved workspace/project path or explicit current context.
- Native session list results may contain paths. Only expose them to the same local authenticated browser context that can already start that agent.
- Attachment upload paths continue to use existing validation and should not become a persistence path for session metadata.

## 8. Rollout Plan

1. Re-check published ACP crates, then upgrade to the highest compatible Rust SDK/schema pair. Current fallback is SDK `0.12.1` with schema patch target `0.13.2`; preferred target is SDK `0.13.x` with schema `0.13.3` or newer if available.
2. Add crate-level DTOs for `agentInfo`, capabilities, native sessions, session info updates, close, and logout.
3. Refactor `AgentSessionService` to use runtime-only pending/active maps for ACP Agent Chat and stop creating/listing/updating local session rows.
4. Replace API session list/resume semantics with ACP-native list and resume endpoints.
5. Update `/ws/agent/{runtime_session_id}` message mapping for `session_ready`, `session_info_update`, `session_closed`, close command, and capability metadata.
6. Update web history, resume, title display, close behavior, and logout UI to consume ACP-native state.
7. Remove or isolate unused `AgentChatSessionRepo` methods and add cleanup migration only if the table is exclusively ACP Agent Chat.
8. Add targeted Rust and frontend tests from `TEST.md`, including nullable usage, unsupported capability states, and failed resume without new-session fallback.

## 9. Testing Notes

Unit tests:

- `crates/agent`: decode nullable/missing usage updates.
- `crates/agent`: map initialize `agentInfo` and capabilities.
- `crates/agent`: failed resume does not call new session.
- `crates/core-service`: create/resume lazy specs do not write session rows.
- `crates/core-service`: close removes runtime maps and sends close when supported.

API tests:

- `GET /api/agent/sessions` returns ACP-native rows and unsupported states.
- `POST /api/agent/session/resume` returns a runtime id for an ACP id.
- Old local-session resume/list paths do not read the old DB catalog.
- `POST /api/agent/logout` handles supported and unsupported agents.

Frontend tests:

- History renders from ACP `items`.
- Clicking a history row resumes by `acp_session_id`.
- `session_info_update` changes the visible title.
- Unsupported list/resume/close/logout states render as disabled or empty states.
- Resume error does not open a new blank chat.

Manual verification:

- Start a known ACP agent, create a chat, reload web, verify history comes from `session/list`.
- Resume the listed chat and verify the agent context is restored.
- Close the chat and verify the ACP process/session cleanup path.
- Logout, then verify the next action enters the authentication flow.

## 10. Risks and Tradeoffs

Short-lived control connections for list/logout are simpler and avoid keeping a background controller process alive. They may add latency for history views. If this becomes visible, add a small in-memory per-agent control connection cache later.

Keeping REST for catalog operations is an intentional exception to the WebSocket-first default. These are bounded request/response operations and match the existing Agent Chat bootstrap flow. Active chat remains WebSocket-only.

The schema patch is technical debt, but removing it now risks reintroducing the known Claude ACP decode failure. Keep it narrow, tested, and documented.

Some ACP agents may advertise sessions but omit titles, cwd, or timestamps. The UI must treat those fields as optional and avoid inventing persistent metadata.

The exact DB cleanup depends on whether the existing session table is shared outside ACP Agent Chat. The product requirement allows discarding old rows, but implementation should verify ownership before dropping schema.

## 11. Open Questions

- Should logout be shown only in Agent Management, or also inside the active Agent Chat header?
- Should list default to the current workspace cwd filter, or show all sessions for the selected agent by default?
- If an agent supports list but not resume, should history rows be read-only or hidden?
- Should session close be sent automatically on browser tab close, or only on explicit user close/workspace archive events?
