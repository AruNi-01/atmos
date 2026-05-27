# TEST · APP-018: ACP Protocol Upgrade

> Test Plan · how we verify Atmos uses the latest compatible ACP baseline and makes ACP, not local session persistence, the source of truth for Agent Chat sessions. References PRD APP-018 and TECH APP-018.

## Test strategy

- **Unit / integration**: Cover ACP DTO decoding, capability mapping, nullable usage tolerance, resume failure behavior, and runtime-only service state with Rust tests near `crates/agent` and `crates/core-service`.
- **API / WebSocket service-level**: Cover the native list/resume/logout REST surfaces and `/ws/agent/{runtime_session_id}` message mapping with stubbed ACP runner behavior.
- **Frontend component/hook tests**: Cover native history rendering, registry-scoped session catalogs, session metadata updates, unsupported states, and resume error handling in Agent Chat hooks/components.
- **Manual-only**: Real ACP agent compatibility, real logout auth-state reset, and process resource cleanup require a concrete agent binary and are verified with a local ACP agent smoke pass.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2 |
| M2 | S2, S3, S4, S5, S6, S7, S8 |
| M3 | S3 |
| M4 | S4 |
| M5 | S5 |
| M6 | S6, S6a, S6b, S6c, S7 |
| M7 | S6 |
| M8 | S6, S9 |
| M9 | S10 |
| M10 | S11, S12 |
| M11 | S12 |
| M12 | S9 |
| M13 | S13 |
| M14 | S14 |
| M15 | S15 |
| M16 | S16 |
| M17 | S7, S10 |
| M18 | S7, S17 |
| N1 | S15 (deferred UI polish) |
| N3 | S6 (manual refresh if implemented) |
| N6 | S3, S15 (diagnostic surfaces if implemented) |

## Scenarios

### S1 - Dependency baseline upgrade

- **Level**: Integration
- **Given**: the workspace dependency graph after implementation.
- **When**: `cargo tree -p agent-client-protocol` and `cargo tree -p agent-client-protocol-schema` are inspected.
- **Then**: Atmos no longer resolves `agent-client-protocol 0.9.4` for `crates/agent`; it resolves the highest compatible ACP Rust SDK selected in TECH, with the schema version and any local patch target documented.
- **Signals**: `cargo tree` output; `crates/agent/Cargo.toml`; root `[patch.crates-io]` if present.

### S2 - Stable ACP capability surface remains wired

- **Level**: Rust integration
- **Given**: a stub ACP connection that advertises implementation info, config options, registry-backed launch metadata, session list, resume, close, logout, and session info update support.
- **When**: Atmos initializes and opens the agent through `crates/agent`.
- **Then**: the adapter exposes capability states for each supported method and preserves existing prompt/tool/permission/plan/config/usage streaming behavior.
- **Signals**: emitted `AcpClientEvent` values; no regression in existing stream/tool/permission tests.

### S3 - clientInfo and agentInfo

- **Level**: Rust unit / API integration
- **Given**: an ACP agent initialize response with `agentInfo` name, title, and version.
- **When**: Atmos initializes the connection.
- **Then**: Atmos sends `clientInfo` and surfaces `agentInfo` through API/WS DTOs without dropping missing optional fields.
- **Signals**: captured initialize request; `agent_info_update` or list response `agent_info` payload.

### S4 - Generic config options remain agent-driven

- **Level**: Rust integration plus frontend hook test
- **Given**: an agent that sends `config_options_update` with model, mode, and one non-model custom option.
- **When**: the user changes the custom option.
- **Then**: Atmos sends `set_config_option` with the generic option id/value and the UI reflects agent-reported selected values.
- **Signals**: outgoing ACP command; frontend config option state.

### S5 - Registry-backed agents still launch

- **Level**: Service-level integration
- **Given**: a registry-backed agent installed through the existing registry flow.
- **When**: the user starts a new Agent Chat.
- **Then**: Atmos resolves launch metadata from registry/custom agent records and starts the selected ACP agent without requiring duplicate integration metadata.
- **Signals**: service launch spec; successful `POST /api/agent/session` response.

### S6 - Native ACP session list replaces local history

- **Level**: API integration plus frontend hook test
- **Given**: selected `registry_id = codex` and a stub ACP `session/list` response with two sessions, titles, cwd values, and timestamps.
- **When**: the UI calls `GET /api/agent/sessions?registry_id=codex`.
- **Then**: the response contains native `items` keyed by `acp_session_id`, and the Agent Chat history renders only those items for that registry id.
- **Signals**: API response `items`; frontend history rows; no call to `AgentChatSessionRepo::list_*`.

### S6a - Native ACP session list is page-at-a-time

- **Level**: API integration plus frontend hook test
- **Given**: a stub ACP `session/list` response with `nextCursor = cursor-2`.
- **When**: the UI opens history for the selected agent.
- **Then**: Atmos sends exactly one ACP `session/list` request without recursively following `nextCursor`; the "Load more" action sends the next request with `cursor = cursor-2`.
- **Signals**: ACP list mock call count; outgoing request cursor values; frontend load-more control.

### S6b - Contextual history is cwd-scoped

- **Level**: Frontend hook test plus API request assertion
- **Given**: the Agent Chat panel is opened inside a Project or Workspace with a resolved local path.
- **When**: the user opens Agent Chat history.
- **Then**: the frontend calls `GET /api/agent/sessions` with `cwd` set to the current Project/Workspace path, and the agent receives an ACP `session/list` request scoped to that cwd.
- **Signals**: REST query contains `cwd`; ACP mock receives `ListSessionsRequest.cwd`; unrelated-directory sessions are not rendered in contextual history.

### S6c - Global session management can be cwd-scoped

- **Level**: Frontend component test plus API request assertion
- **Given**: the `/agents` session management view has loaded projects, workspaces, and a selected ACP agent.
- **When**: the context selector is set to All.
- **Then**: the frontend calls `GET /api/agent/sessions` without `cwd`, preserving the global catalog view.
- **When**: the context selector is set to a Project or Workspace.
- **Then**: the frontend reloads the first ACP list page with `cwd` set to that context's local path.
- **And**: if the agent returns rows from sibling workspaces or unrelated paths, Atmos filters those rows out before rendering.
- **Signals**: REST query contains no `cwd` for All and contains the selected project/workspace path after filtering; old rows are replaced rather than appended; sibling workspace cwd rows are absent.

### S7 - No durable local ACP session catalog

- **Level**: Core-service integration
- **Given**: old rows exist in the local Agent Chat session table.
- **When**: the user opens Agent Chat history or reloads the app.
- **Then**: Atmos does not read those rows as ACP history; it asks the selected agent through `session/list`.
- **Signals**: repository mock receives no list call; ACP list mock receives one call.

### S8 - Registry-scoped catalogs do not bleed across agents

- **Level**: Frontend hook test
- **Given**: agent A and agent B return different native sessions.
- **When**: the selected `registry_id` changes from A to B.
- **Then**: the history panel replaces A's rows with B's rows and resume actions target B's `registry_id`.
- **Signals**: rendered rows; API request query/body.

### S9 - session_info_update refreshes active metadata

- **Level**: WebSocket integration plus frontend hook test
- **Given**: an active runtime session mapped to `acp_session_id = s1`.
- **When**: the agent sends `session_info_update` with a new title and updated time.
- **Then**: Atmos emits a `session_info_update` WS message and the visible active chat/history title updates without manual refresh.
- **Signals**: WS message payload; frontend title state.

### S10 - New chat uses ACP session id as durable identity

- **Level**: WebSocket integration
- **Given**: a new runtime session spec.
- **When**: the client connects to `/ws/agent/{runtime_session_id}` and the agent creates a session.
- **Then**: Atmos emits `session_ready` with both `runtime_session_id` and the returned `acp_session_id`; only ephemeral runtime maps are updated locally.
- **Signals**: `session_ready` WS message; no local session row creation.

### S11 - Existing session resumes by ACP id

- **Level**: API plus WebSocket integration
- **Given**: the history row `acp_session_id = native-123`.
- **When**: the UI calls `POST /api/agent/session/resume` and connects to the returned runtime session.
- **Then**: Atmos calls ACP `session/resume` for `native-123` and does not require an Atmos DB session id.
- **Signals**: resume request body; ACP resume mock invocation; `session_ready` payload.

### S12 - Failed resume does not create a new session

- **Level**: Rust integration
- **Given**: ACP `session/resume` returns not found or another failure.
- **When**: Atmos attempts to resume the selected history row.
- **Then**: the error is surfaced and Atmos does not call `session/new` or present a blank chat as the selected history session.
- **Signals**: error response/WS error; ACP mock call count shows no `session/new`.

### S13 - session/close cleanup

- **Level**: WebSocket/service integration
- **Given**: an active runtime session and an agent that supports `session/close`.
- **When**: the user closes the chat or workspace archival closes active sessions.
- **Then**: Atmos sends ACP `session/close`, removes runtime state, and emits `session_closed` when applicable.
- **Signals**: ACP close mock invocation; runtime registry maps are empty for that session; WS `session_closed`.

### S14 - logout

- **Level**: API integration plus manual ACP agent smoke
- **Given**: an authenticated ACP agent that advertises logout.
- **When**: the user triggers logout.
- **Then**: Atmos calls ACP `logout`, returns a structured success/reauth-required state, and the next auth-gated action requires authentication again.
- **Signals**: `POST /api/agent/logout` response; ACP logout mock invocation; manual auth prompt after logout.

### S15 - Unsupported capability states

- **Level**: Frontend component/hook test
- **Given**: an agent that lacks `session/list`, `session/resume`, `session/close`, or `logout`.
- **When**: the user opens history, selects a row, closes a chat, or opens the auth action.
- **Then**: Atmos shows capability-specific empty/disabled states and does not fake unsupported behavior with local data.
- **Signals**: disabled controls or empty-state text; no local DB fallback request.

### S16 - Nullable or missing usage fields do not break streaming

- **Level**: Rust unit
- **Given**: ACP `usage_update` notifications where `used`, `size`, or cost-like fields are `null` or missing.
- **When**: the notification decoder handles the updates.
- **Then**: Atmos emits a usage event with optional counters or skips malformed usage without closing the ACP stream.
- **Signals**: decoded `AgentUsage` values; connection remains active.

### S17 - Old local session routes do not expose stale ACP rows

- **Level**: API integration
- **Given**: old local ACP session rows exist.
- **When**: legacy local-session routes are called, if they still exist during implementation.
- **Then**: they return the new native behavior or a structured gone/unsupported response; they never read stale rows as current ACP history.
- **Signals**: HTTP status and response body; repository mock call count.

## Performance & load budgets

- `GET /api/agent/sessions` should complete in under 2s p50 and under 5s p95 for one ACP list page from an installed local agent. Atmos must not auto-fetch every page.
- Opening a listed session should reach `session_ready` within 5s p95 after the ACP process is started on a typical local dev machine.
- Metadata updates should appear in the active UI within one WebSocket message turn; no polling is required for active sessions.

## Regression checklist

- [ ] Existing prompt streaming, tool calls, permission requests, cancellation, plan updates, config option updates, and usage display still work.
- [ ] ACP Registry install/list/start flows still work.
- [ ] Failed resume does not call `session/new`.
- [ ] History reload does not read Atmos-local Agent Chat rows.
- [ ] Project/Workspace Agent Chat history passes current context `cwd`; global `/agents` session management defaults to All and can explicitly filter by Project/Workspace.
- [ ] Capability unsupported states do not hide real launch/auth errors.
- [ ] Auth tokens, environment values, and raw agent auth payloads are not logged.
- [ ] Browser reload recovers history from ACP `session/list`, not local storage or DB rows.

## Acceptance criteria

- [ ] All Must Have PRD items M1-M18 are covered by at least one passing automated or manual scenario.
- [ ] `crates/agent` compiles against the selected ACP SDK/schema pair.
- [ ] `crates/core-service` no longer creates or lists local ACP chat session rows for Agent Chat history.
- [ ] `apps/api` exposes native list/resume/logout surfaces and active session WS messages from TECH.
- [ ] `apps/web` uses `registry_id` and `acp_session_id` for history/resume.
- [ ] `just lint` or the closest changed-surface lint/typecheck gate passes.
- [ ] Targeted Rust and frontend tests for touched areas pass.

## Manual verification steps

1. Install or configure a known ACP-compatible agent through Atmos Registry.
2. Start a new Agent Chat and send a prompt; confirm streaming, tools, permissions, config options, and usage still render.
3. Reload the web app; confirm history comes from ACP `session/list`.
4. Resume a listed session; confirm the UI attaches to the agent-native session instead of creating a new blank session.
5. Trigger session close; confirm local UI closes and the agent no longer treats the session as active.
6. Trigger logout; confirm the next auth-gated action asks for authentication again.

## Non-coverage

- Real behavior of every third-party ACP agent. Automated coverage uses stubs; manual smoke uses one known compatible agent.
- ACP remote transport working-group behavior. This spec stays on the local ACP process transport.
- Protocol v2 and draft/experimental features not selected in TECH.
