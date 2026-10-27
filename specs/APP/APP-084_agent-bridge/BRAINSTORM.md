# Brainstorm · APP-084: Agent Bridge

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos already has Agent Chat (human↔one agent), a Computer catalog (native / ACP registry / custom / terminal install), session occupancy, and a Relay tunnel for remote Computers. Agents still cannot address each other. Workarounds today are paste, extra Chat tabs, or inventing MCP — Atmos has **no MCP**. Canvas/PT Design already use the word “AgentBridge” for a **tab dispatch CLI** (`canvas_agent_relay` / `pt_design_bridge_*`). That is a different product surface.

Who feels it: Agentic Builders running more than one Chat/session on a Computer (and later across Computers) who need a directory + bus, not a new panel.

## Goals (draft)

- Primary: a built-in **agent directory / addressing / collaboration bus** that agents can use through `atmos agent-bridge` + a system skill + Composer slash.
- Primary: same address space from day one (`{ server_id, provider_id, chat_id?, workspace_id? }`), even if delivery starts on the connected Computer.
- Secondary: reuse the existing Computer/Relay **client session** so the same verbs work after the user picks another Computer. Relay stays passthrough.

## Options

### Option A — CLI + system skill + slash (no panel)

Agents load `atmos-agent-bridge` (slash inserts the skill). All verbs talk to Atmos Server via `POST /api/cli/invoke` (same `WsAction` handlers as `/ws`). Core lives in `crates/agent-bridge`; `core-service` only looks up catalog/status/auth and injects.

**Pros**: Matches Desktop Use / Device Preview delivery; no MCP; no new route; agents already speak `atmos`.
**Cons**: Humans without an agent do not get a directory UI.
**Unknown**: none that blocks MVP — this is the locked delivery shape.

### Option B — Standalone Bridge Web panel / Settings page

A first-class inbox and directory in the web app.

**Pros**: Visible to humans.
**Cons**: Explicitly banned. Duplicates Session inbox / Agent Manager. Pulls product attention away from agent-first CLI.
**Unknown**: —

### Option C — MCP server for the bus

Expose list/send as MCP tools.

**Pros**: Some hosts already speak MCP.
**Cons**: Atmos has no MCP. Conflicts with APP-052 / APP-071 delivery. Banned.
**Unknown**: —

### Option D — Put mailbox logic in `packages/relay` or `crates/agent`

Relay would list agents and hold mailboxes; or each Chat host would implement the bus.

**Pros**: Might feel “closer to the wire.”
**Cons**: Relay must stay routing/auth/presence. `crates/agent` is Chat hosts (native + ACP), not a bus. Banned scatter.
**Unknown**: —

## Key forks in the road

- **Fork 1 — Delivery surface**: CLI + skill + slash vs panel vs MCP. **PRD: Option A.**
- **Fork 2 — Package split**: independent `crates/agent-bridge` (pure) + L3 orchestration vs logic in `core-service` / `crates/agent`. **PRD/TECH: independent crate.**
- **Fork 3 — Busy default**: queue vs fail-fast vs wait. **PRD: default `queue`, per-message override.**
- **Fork 4 — Cross-Computer**: new Relay Bridge protocol vs reuse existing Computer/Relay **client session** and run the same actions on that Server. **PRD V1: reuse session; each Server owns its crate + mailbox; Relay never lists agents or stores mailboxes.**
- **Fork 5 — Remote context bag**: peer push vs puller requests another bag. **PRD: puller fetches. No push.**
- **Fork 6 — Broadcast**: mesh / topic vs same-Computer **explicit target list**. **PRD MVP: explicit list only. Richer broadcast is V2.**
- **Fork 7 — Task/claim**: include in V1 vs later. **PRD: V2 / out of scope.**

## Open questions

- [x] Spec number — **APP-084** (APP-083 is latest on main). Decide in PRD: locked.
- [x] Same-machine vs cross-machine in the first ship — Decide in PRD: MVP same-Computer delivery on the **connected** Server; V1 adds “pick Computer (existing session) then the same verbs,” plus read-only remote presence/status and context_ref pull.
- [x] How `provider_id` relates to install `AgentId` — Decide in TECH: use Chat/registry/custom **provider_id** (`claude`, `codex-acp`, …), never the terminal install enum (`claude_code`).

## References

- EM assignment (APP-084 Agent Bridge MVP / V1 lock)
- Notion final design (condensed in the implementation brief)
- Existing code: `crates/desktop-use/`, `apps/cli/src/commands/simulator.rs`, `apps/cli/src/server_invoke.rs`, `apps/api/src/api/cli/invoke.rs`, `apps/api/src/api/ws/router/agents.rs`, `crates/core-service/src/service/agent.rs`, `crates/core-service/src/service/agent_status/`, `skills/system-skills-manifest.json`, `crates/infra/src/utils/system_skill_sync.rs` (`ALL_SYSTEM_SKILL_NAMES`), `apps/web/src/features/welcome/lib/slash-desktop-use.ts`
- Related specs: [APP-052](../APP-052_desktop-use/TECH.md) (independent crate + no MCP), [APP-063](../APP-063_agent-first-product-cli/TECH.md) (`POST /api/cli/invoke`), [APP-016](../APP-016_atmos-computer/TECH.md) (Computer + Relay), [APP-071](../APP-071_device-preview-agent-control/PRD.md) (CLI + skill + slash)
- Confusable names: Canvas `canvas_agent_relay`, PT Design `pt_design_bridge_*` — **not** this bus

## Ready to promote

- Promote to PRD: Option A delivery; address tuple; busy default queue; V1 Computer-session reuse; puller-fetched context_ref; no MCP / no panel / no task-claim; naming Relay vs Bridge
- Promote to TECH: `crates/agent-bridge` module map; catalog facade over `agent_list` / `native_agent_list` / `agent_registry_list` / `custom_agent_list` / chat index + occupancy; `WsAction` `agent_bridge_*`; CLI kebab file; skill + slash wiring paths
