# PRD · APP-018: ACP Protocol Upgrade

> Product Requirements · WHAT and WHY. Settled direction for upgrading Atmos ACP integration to the current stable protocol surface and making ACP, not Atmos-local persistence, the source of truth for agent session lifecycle.

## Context

- **Problem**: Atmos ACP integration is behind the current protocol surface. Some ACP capabilities are partially supported, some are missing, and Agent Chat session history is still modeled as Atmos-owned durable state instead of agent-owned protocol state.
- **Why now**: ACP has stabilized a set of client-facing capabilities that matter directly to Atmos: implementation info, session config options, ACP Registry, `session/list`, `session_info_update`, `session/resume`, `session/close`, and `logout`.
- **Current version**: Atmos is currently built on `agent-client-protocol 0.9.4` with `agent-client-protocol-schema 0.10.8` patched locally for nullable Claude ACP usage fields.
- **Target version**: This spec targets the latest compatible ACP baseline identified during the May 26, 2026 protocol review: `agent-client-protocol-schema 0.13.3` is the latest published schema crate, while `agent-client-protocol 0.12.1` is the latest published Rust SDK crate and currently pins schema `0.13.2`. TECH must select the highest compatible Rust SDK/schema pair at implementation time; if no Rust SDK `0.13.x` is available, use SDK `0.12.1` with its pinned schema and keep the `0.13.3` schema gap explicit.
- **Product direction**: Atmos should become a protocol-aligned ACP client. It should negotiate and use ACP capabilities directly instead of maintaining parallel local semantics where ACP now defines standard behavior.
- **Session-list direction**: Agent Chat history must be refactored to use ACP `session/list` as the durable source of truth. Atmos should not store its own persistent ACP session catalog.
- **Compatibility posture**: There are no users to preserve for this feature. Existing Atmos-local Agent Chat session rows may be discarded, ignored, or cleaned up without a backwards-compatible migration path.
- **Related specs**: Builds on `APP-004_local-agent-integration-acp`; informs future TECH/TEST work for ACP SDK upgrade, Agent Chat UI, and agent lifecycle cleanup.

## Goals

1. **Primary**: Upgrade Atmos to the current stable ACP feature set needed for first-class ACP Agent Chat.
2. **Primary**: Replace Atmos-owned ACP session history with agent-native `session/list` and agent-native resume/close semantics.
3. **Primary**: Make ACP capability support visible and honest in the product, so users know which features each agent can provide.
4. **Secondary**: Preserve Atmos's existing strengths around registry browsing, config option controls, permission handling, tool display, streaming, and usage display while aligning them with the latest protocol.
5. **Secondary**: Reduce long-term maintenance by removing duplicate local session models where ACP now has standard primitives.

## Users & Scenarios

- **Primary persona**: Agentic Builder using the floating ACP Agent Chat panel or Agent Management Center to start, resume, configure, close, and authenticate ACP agent sessions.
- **Secondary persona**: Developer evaluating multiple ACP-compatible agents and expecting Atmos to reflect each agent's real capabilities rather than a one-size-fits-all local model.

### Key scenarios

1. A user opens an ACP agent in Atmos and sees the agent's real identity, version when available, auth state, session capabilities, and configurable options.
2. A user opens Agent Chat history for the selected agent and sees sessions reported by ACP `session/list`, not stale Atmos-local rows.
3. A user selects an existing agent-native session and Atmos reconnects through `session/resume` or `session/load` behavior supported by that agent.
4. A user archives a workspace or closes a chat and Atmos asks the agent to close/free session resources when that capability is available.
5. A user logs out of an authenticated ACP agent from Atmos and can authenticate again without restarting the whole app.
6. A user switches to an agent that does not support one of the newer ACP capabilities and sees a clear capability-specific state, not a misleading local fallback.

## User Stories

- As an Agentic Builder, I want Atmos to support current ACP capabilities, so that ACP agents behave consistently with other modern ACP clients.
- As a user resuming work, I want Agent Chat history to come from the selected ACP agent, so that the sessions I see are the sessions the agent can actually continue.
- As a user switching agents, I want each ACP agent to show its own native sessions and supported actions, so that histories and capabilities do not bleed across agents.
- As a user managing resources, I want Atmos to close active ACP sessions through protocol-supported cleanup, so that old sessions do not accumulate hidden agent-side processes or memory.
- As a user managing authentication, I want to log out and re-authenticate an ACP agent from Atmos, so that auth recovery does not require restarting the ACP connection or Atmos.
- As a product maintainer, I want Atmos to stop owning duplicate ACP session state, so that future protocol improvements can be adopted with less local special-case behavior.

## Functional Requirements

### Must Have

- **M1**: Atmos upgrades from `agent-client-protocol 0.9.4` plus patched `agent-client-protocol-schema 0.10.8` to the latest compatible ACP baseline: target schema line `0.13.3`, using the latest compatible Rust SDK (`agent-client-protocol 0.12.1` unless a compatible `0.13.x` SDK is available before implementation).
- **M2**: Atmos supports the current stable ACP client-facing capability set needed for Agent Chat: implementation info, session config options, ACP Registry, `session/list`, `session_info_update`, `session/resume`, `session/close`, and `logout`.
- **M3**: Atmos sends client implementation information during initialization and surfaces agent implementation information when the agent provides it, so users and maintainers can identify the connected agent and version.
- **M4**: Session-level configuration remains generic and agent-driven. Atmos renders supported ACP config options without hard-coding only a fixed model/mode/reasoning list, and keeps the visible selection in sync when the agent reports changes.
- **M5**: ACP Registry remains the standard discovery and installation entry point for registry-backed agents, with Atmos using registry metadata instead of custom integration metadata wherever ACP provides the needed shape.
- **M6**: Agent Chat history is sourced from ACP `session/list` for the selected agent. Atmos must not use its own persisted Agent Chat session table as a durable history source, and it must fetch session history one ACP cursor page at a time instead of recursively loading every page. When Agent Chat is opened inside a Project or Workspace with a resolved path, history must pass that path as the ACP `cwd` filter. Global agent session management defaults to an unfiltered All view, with an explicit Project filter that queries the Project root plus selected Workspace roots. The Project view defaults to the 10 most recently visited Workspaces and lets the user choose multiple Workspaces.
- **M7**: Session history is scoped by ACP agent identity. Switching the selected ACP agent changes the visible session catalog to that agent's native sessions.
- **M8**: Listed sessions expose the user-relevant metadata returned by the agent, including session id, title when available, cwd when available, and last-updated time when available.
- **M9**: Starting a new Agent Chat creates an agent-owned ACP session and treats the returned ACP session id as the durable identity for future history, metadata updates, resume, and close actions.
- **M10**: Selecting an existing session uses the agent-native reconnect path. Atmos supports `session/resume` when available and may use history replay only when the agent's supported behavior requires it.
- **M11**: Atmos must not silently fall back from a failed native resume/load to creating an unrelated new session while presenting it as the selected historical session.
- **M12**: Agent-reported `session_info_update` metadata updates refresh visible session titles and updated times without requiring the user to manually reload the session list.
- **M13**: Active session cleanup uses ACP `session/close` when the agent advertises support, including cleanup triggered by user close actions and workspace archival behavior.
- **M14**: Authentication UX supports ACP `logout` when advertised by the agent, returning the connection to a state where authentication-gated actions require authentication again.
- **M15**: Capability-specific unavailable states are first-class. If an agent does not support `session/list`, `session/resume`, `session/close`, `logout`, or config options, Atmos explains what is unavailable for that agent and avoids local fake behavior.
- **M16**: Usage and streaming updates remain robust when optional or agent-specific usage fields are missing. Missing usage details must not crash the ACP connection or end the user session.
- **M17**: Atmos stores only ephemeral runtime connection state for currently attached Agent Chat UI. Reloading the app recovers durable ACP session history from the agent, not from Atmos-local session rows.
- **M18**: Existing Atmos-local ACP session records are not part of the product contract after this change. The product may discard, ignore, or clean them up as part of implementation.

### Nice to Have

- **N1**: A compact capability summary per agent showing support for list, resume, close, logout, config options, metadata updates, and usage updates.
- **N2**: Search across the selected agent's native session list using title, cwd, or session id when metadata is available.
- **N3**: Manual "refresh from agent" control for reloading the native session catalog.
- **N4**: Context grouping that uses agent-returned cwd values to organize sessions without creating Atmos-owned history.
- **N5**: Developer-only cleanup tooling for old local ACP session rows during pre-release builds.
- **N6**: Product diagnostics that expose negotiated ACP capabilities and implementation info for support/debugging.

## Out of Scope

- **Backward-compatible migration of old Atmos Agent Chat history** — there are no users to preserve; the best architecture is to remove the parallel source of truth.
- **Implementing ACP agents** — Atmos is the client in this spec. Agent-side support gaps should be surfaced honestly, not patched by pretending support exists.
- **ACP remote transport standardization** — this spec is about the local ACP client integration and protocol feature surface, not the Transports Working Group's future WebSocket/HTTP transport design.
- **Protocol v2 prompting or draft RFDs** — only current stable capabilities and required compatibility work are in scope for this PRD.
- **Atmos-owned cross-agent unified history** — each ACP agent owns its catalog. A merged global ACP history would reintroduce local semantics and is not part of v1.
- **Offline browsing of prior ACP sessions** — if the selected agent cannot be reached, Atmos does not show a cached session catalog in v1.
- **Changing non-ACP session models** — terminal sessions, review sessions, workspace records, and Canvas persistence are not part of this PRD.

## Success Metrics

- **Leading**: Atmos Agent Chat history requests native sessions from the selected ACP agent and no longer reads Atmos-local Agent Chat session records for history.
- **Leading**: Users can start, list, resume, close, configure, and log out of supported ACP agents through protocol-backed flows.
- **Leading**: Capability-specific unsupported states are visible for agents that lack newer ACP features.
- **Lagging**: Fewer ACP mismatch bugs, such as stale local titles, missing agent sessions, false resume success, or Atmos showing actions the agent cannot perform.
- **Qualitative**: Users and maintainers describe Atmos ACP support as "protocol-aligned" and "agent-native" rather than "Atmos-maintained".

## Risks & Open Questions

- **Risk**: Some ACP agents may lag on newer capabilities, leaving users with partial functionality until those agents catch up.
- **Risk**: Removing local session history makes offline ACP history unavailable, which is architecturally clean but may feel limiting if users later expect cached browsing.
- **Risk**: Agent metadata quality varies. Atmos needs strong empty states when titles, cwd, timestamps, or implementation info are missing.
- **Risk**: The ACP Rust SDK upgrade may require a meaningful internal refactor, which could temporarily affect streaming, permissions, tool rendering, or usage display.
- **Open**: Should Atmos require `session/list` support for full Agent Chat history UI, or allow chat creation while showing no history for unsupported agents?
- **Open**: How should Atmos order sessions when the agent omits `updatedAt` or returns incomplete metadata?
- **Open**: Should logout be exposed in the main Agent Chat UI, Agent Management Center, or both?
- **Open**: Which capability diagnostics belong in user-facing UI versus developer/support tooling?

## Milestones

- **Phase 1** — Upgrade the ACP client baseline while preserving existing chat, streaming, permission, registry, config option, and usage behavior.
- **Phase 2** — Replace Atmos-local ACP session history with native `session/list`, agent-native session identity, and capability-aware unsupported states.
- **Phase 3** — Add native `session/resume`, `session_info_update`, and robust metadata refresh across Agent Chat history and active sessions.
- **Phase 4** — Add `session/close`, logout UX, capability summaries, and cleanup of legacy local ACP session records.
