# PRD · APP-084: Agent Bridge

> Product Requirements · WHAT and WHY. Built-in agent directory and collaboration bus for same-Computer delivery, plus V1 reuse of an existing Computer/Relay client session. No MCP. No standalone panel.

## Context

- **Problem**: Agents on one Atmos Computer (and later on another Computer the user already connected to) cannot address each other. Workarounds are paste, extra Chat tabs, or inventing MCP — Atmos has no MCP.
- **Why now**: Agent Chat, the Computer catalog, session occupancy, CLI invoke (`POST /api/cli/invoke`), and Relay client sessions already exist. The missing piece is a bus with a stable address tuple, not a new surface.
- **Related specs**: [APP-052](../APP-052_desktop-use/PRD.md) (independent capability crate, no MCP), [APP-063](../APP-063_agent-first-product-cli/PRD.md) (`atmos` invoke), [APP-016](../APP-016_atmos-computer/PRD.md) (Computer + Relay passthrough), [APP-071](../APP-071_device-preview-agent-control/PRD.md) (CLI + system skill + slash). Canvas `canvas_agent_relay` and PT Design `pt_design_bridge_*` are **tab dispatch CLIs**, not this bus.

Naming lock: **Relay** = remote tunnel passthrough. **Bridge** = agent↔agent directory/bus.

## Goals

1. Primary — agents can list peers and send / request / reply / ack on the **connected** Computer through `atmos agent-bridge` plus a system skill and Composer slash `/agent-bridge`.
2. Primary — one address space from day one: `{ server_id, provider_id, chat_id?, workspace_id? }`.
3. Secondary — after the user (or CLI session) already points at another Computer via the existing client session, the **same verbs** run on that Server. Relay does not list agents or store mailboxes.

## Users & Scenarios

- **Primary persona**: Agentic Builder running more than one Agent Chat / session on a Computer.
- **Key scenarios**:
  1. Two Chats on the same Computer: agent A lists peers, sends a structured note to agent B; B is idle and receives it as an injected Chat turn.
  2. B is mid-turn: the message queues (default) or fails fast / waits per override; A sees `queued_busy` / `rejected` / `timeout`.
  3. The CLI session already targets a remote Computer (`--api-url` / `client-session.json`): the same `list` / `send` run on that Computer’s Server. Addressing a _different_ `server_id` without connecting first fails with a connect hint.
  4. A holds a context bag ref created on Computer B: the puller connects to B and asks for that bag. B never pushes.

## User Stories

- As an agent, I want a paginated directory of Chat sessions on this Computer, so I can pick a `chat_id` / `provider_id` instead of guessing or dumping every installed provider.
- As an agent, I want to send or request with a busy policy, so a busy peer does not drop work by default.
- As an agent, I want to reply and ack with a correlation id, so a request is not a fire-and-forget paste.
- As an agent, I want `/agent-bridge` to insert the system skill, so I do not need MCP or a Settings page.
- As an operator, I want the same CLI verbs after I already connected to another Computer, so I do not learn a second protocol.

## Functional Requirements

### Must Have

- **M1 Directory**: `atmos agent-bridge list` calls `agent_session_status_list`. It does not add `agent_bridge_list`. The response is the session page (`sessions`, `counts`, `total`, `next_cursor`) plus `agents`, the enabled terminal agents (`id` + `label`), which does not depend on the page. `--provider` / `--agent` set `provider_ids` and narrow the page and counts. `--workspace` sets `context_id`. Send addressing still uses `provider_id`.
- **M2 Send / request / reply**: Same-Computer delivery of a structured envelope (kind, from, to, body, optional correlation, optional context bag). Inject into an idle matching Agent Chat via the existing Chat send path. No live Chat → park in an in-memory mailbox and ack `offline`. Several matching live Chats without `chat_id` → `AMBIGUOUS_TARGET`.
- **M3 Busy policy**: Default `queue`. Per-message override `wait` | `queue` | `fail_fast`. Acks: `delivered` | `queued_busy` | `offline` | `timeout` | `rejected` | `accepted`.
- **M4 Status**: `atmos agent-bridge status` is read-only presence plus optional lookup of a message id or `context_ref`. Send/request/reply/status may drain queued mail for now-idle targets; `list` does not drain.
- **M5 Context bag**: Structured slices only (goals, paths, PR/commit refs, artifacts, danger). Never full transcript, chain-of-thought, or secrets. Remote ref: **puller requests another bag** on the Computer that holds it. Peer does not push. Missing local bag whose ref names another `server_id` → `CONTEXT_REF_REMOTE`.
- **M6 Broadcast (MVP)**: Explicit same-Computer target list only (repeat `--to` / `--to-provider`). No topics, no mesh.
- **M7 CLI**: Thin `atmos agent-bridge` kebab: `list` | `send` | `request` | `reply` | `status` | `skill-dir`. JSON envelope. No `core-service` / `agent-bridge` crate deps in CLI. Verbs go through `POST /api/cli/invoke`.
- **M8 Skill**: `skills/atmos-agent-bridge/` teaching the CLI. Explicit **No MCP**. Registered in `skills/system-skills-manifest.json` **and** `ALL_SYSTEM_SKILL_NAMES`. GitHub fallback `repo_skill_root` includes this skill.
- **M9 Slash**: Composer slash id `agent-bridge` inserts that system skill (same pattern as `/desktop-use`), on Welcome, Agent Chat, and terminal overlay. No readiness gate. Desktop Electron has no separate slash table.
- **M10 V1 cross-Computer**: Reuse the existing Computer/Relay **client session**. Each Server owns crate + orchestration + mailbox. Relay never lists agents or stores mailboxes. Foreign `to.server_id` (not this Computer, not the `local` wildcard) → `CROSS_MACHINE_CONNECT`. Cross-machine presence/status is the read-only catalog of whichever Computer the session already targets.

### Nice to Have

- **N1** Persist mailbox across Server restart. **Deferred** — in-memory for this ship.
- **N2** Human-visible directory in Session inbox. **Out of scope** (no panel).

## Out of Scope

V2 / Future — do not implement in this spec:

- Lightweight `task` / `claim` workflow.
- Richer broadcast (topics, mesh, cross-Computer fan-out).
- Flows / visual orchestration.
- MCP server or MCP tools for the bus.
- Standalone Bridge Web panel, new route, or Settings → Bridge page.
- Bridge business logic in `packages/relay`, `apps/cli`, or `crates/agent`.
- Confusing this bus with Canvas/PT Design “AgentBridge” tab dispatch.
- Pushing context bags to a remote peer.
- Federated write from Server A’s mailbox into Server B without connecting.

## Success Metrics

- Leading: `atmos agent-bridge list` and `send` succeed against a local Server in CI/unit proof.
- Leading: slash `/agent-bridge` is wired in Welcome + Agent Chat + terminal overlay tests.
- Lagging (aspirational): agents use the skill instead of paste between Chats.
- Qualitative: a reviewer can tell Relay (tunnel) from Bridge (bus) from the skill and CLI help.

## Risks & Open Questions

- **Risk**: injecting via Chat send starts a real turn; a noisy Bridge message can interrupt the human. Mitigation: skill tells agents to keep bodies short; occupancy + queue default.
- **Risk**: in-memory mailbox is lost on Server restart. Accepted for V1.
- **Open**: none that block V1. Task/claim and richer broadcast stay Future.

## Milestones

- Phase 1 (this ship) — M1–M10: crate + core-service orchestration + WS/CLI/skill/slash. Same-Computer bus + V1 session reuse.
- Phase 2 (Future / V2) — N1 persistence, task/claim, richer broadcast, optional human directory. Not this PR.
