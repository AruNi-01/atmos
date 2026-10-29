# TECH · APP-084: Agent Bridge

> Technical Design · HOW. Implements PRD APP-084. Addresses M1–M10. N1/N2 and all V2 items are Out of scope / Future.

## Scope summary

Ship an independent protocol crate `crates/agent-bridge` plus L3 orchestration in `core-service`, thin `WsAction` handlers, thin CLI kebab, system skill, and Composer slash. Same-Computer send/request/reply/ack. V1 cross-Computer = reuse the existing Computer/Relay **client session** and run the same actions on that Server. No MCP, no panel, no Relay mailbox, no task/claim, no richer broadcast.

## Architecture overview

```
agent / human
  atmos agent-bridge (apps/cli, invoke-only)
       │  POST /api/cli/invoke   (same handlers as /ws)
       ▼
apps/api  WsAction agent_bridge_*
       ▼
core-service AgentBridgeService   (session directory, busy, inject, drain)
       ▼
crates/agent-bridge               (envelope, address, mailbox, bag, plan)
       ├── AgentChatService.list  (Chat sessions; title, workspace, activity)
       ├── AgentChatService.send  (idle inject)
       ├── AgentService lists     (UNKNOWN_PROVIDER only; not list output)
       └── AgentStatusService     (occupancy on the current page)

V1 remote Computer: CLI already resolves --api-url / client-session.json /
runtime_manifest.json. That HTTP hits the other Server. Relay stays
passthrough. Each Server has its own crate + mailbox. No server-to-server
Bridge protocol.
```

External: none. No new REST product API. CLI invoke is the existing APP-063 exception for agents.

## Module-by-module design

### crates/agent-bridge (new, workspace auto-member via `crates/*`)

Pure protocol. **No DB, no tokio runtime, no mutex inside types, no HTTP, no `crates/agent`.**

| Module     | Owns                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| `address`  | `AgentAddress { server_id, provider_id, chat_id?, workspace_id? }`, `server_ids_match` |
| `envelope` | `BridgeMessage` kind `send` / `request` / `reply` / `ack`, ids, ttl, busy override     |
| `busy`     | `BusyPolicy { Wait, Queue, FailFast }`, default **Queue**                              |
| `delivery` | `plan_delivery` → `DeliverNow` / `Queue` / `FailFast` / `Wait`, `DeliveryAck`          |
| `mailbox`  | `Mailbox` in-memory vec; enqueue / `pop_matching` / insert-back; **no internal Mutex** |
| `context`  | `ContextBag` slices + `ContextStore`; get-or-`None` (pull). **No push-to-peer API**    |
| `catalog`  | Pure DTOs `CatalogEntry`, occupancy enum; merge/dedupe helpers. No I/O                 |
| `format`   | Render inject text for Chat send                                                       |
| `error`    | `BridgeError` codes used by L3                                                         |
| `state`    | `BridgeState { mailbox, bags }` — two instances prove isolation (V1 pull-vs-push)      |

`server_ids_match(to, local)`: empty / `"local"` is a wildcard **only on the client-filled `to.server_id`**. The Server's own identity is never a wildcard — identity `"local"` plus an explicit other `to.server_id` is foreign (`CROSS_MACHINE_CONNECT` / `CONTEXT_REF_REMOTE`).

### crates/core-service

New `service/agent_bridge/`:

- `AgentBridgeService` holds `Arc<AgentService>`, `Arc<AgentChatService>`, `Arc<AgentStatusService>`, `Mutex<BridgeState>`, local `server_id`.
- Local `server_id`: `runtime_manager::read_server_identity()?.map(|i| i.server_id)` else `"local"`.
- Catalog gather (M1) — **Chat sessions only**:
  - `agent_chat.list(None, None, None, true, None)` live index: `id` → `chat_id`, `provider_id`, real `title` (untitled → `provider_id`, never `chat {id}`), `workspace_id`, `project_id`, `updated_at`, `last_message_at` as `last_activity_at`
  - Do **not** emit Native / Registry / Custom / Terminal install rows from `list`
  - Filter: `workspace_id` and `provider_id` (wire alias `agent`)
  - Page: `limit` default 20, max 100; `cursor` is previous page last `{last_activity_at}\n{chat_id}`; response `next_cursor` / `has_more`. Occupancy is resolved **only for the page**
  - occupancy: `AgentStatusService::get_all_sessions()` keyed `chat:{chat_id}` mapped to `idle` / `running` / `permission_request` (never flatten busy → `running`); folded `WaitingPermission` counts as `permission_request`; live-turn busy counts as `running`
  - `UNKNOWN_PROVIDER` on send still checks live chats plus internal AgentService native/registry/custom/terminal ids (`registry_id`, never `claude_code`)
- Delivery (M2–M3): crate `plan_delivery`; idle → inject only when occupancy is idle (do not call `agent_chat.send` on `WaitingPermission`); inject `Err` / `Rejected` re-enqueues; busy+queue → mailbox; busy+fail_fast → `rejected`; busy+wait → poll occupancy until idle or `ttl_ms` (default 30_000, poll 200ms) then `delivered` or `timeout`. Drain pops **one** matching message; failure inserts it back.
- No `chat_id`: exactly one matching live Chat on this Computer → deliver; zero → `offline` + mailbox; many → `AMBIGUOUS_TARGET`.
- Foreign `to.server_id` that does not `server_ids_match` local → `CROSS_MACHINE_CONNECT` (do not enqueue locally).
- Drain queued mail on send/request/reply/status when that target is now idle. **Not** on list.
- Context bag: store on send/request when body includes a bag; `status { context_ref }` returns it. If ref encodes another `server_id` and is missing locally → `CONTEXT_REF_REMOTE`. Never push to a remote `BridgeState`.
- Broadcast: loop `plan_delivery` per explicit target on this Computer; return per-target acks.

`ServiceError::AgentBridge(AgentBridgeError)` with `code()` like `DeviceControlError`.

### apps/api

- `WsAction` variants (serde snake_case) at end of enum in `apps/api/src/api/ws/message.rs`:
  - `AgentBridgeSend`
  - `AgentBridgeRequest`
  - `AgentBridgeReply`
  - `AgentBridgeStatus`
- Request/response structs in `apps/api/src/api/ws/message/agent_bridge.rs`.
- Router `apps/api/src/api/ws/router/agent_bridge.rs`; arms in `handle_action`.
- Construct `AgentBridgeService` inside `WsMessageService::assemble` (has chat + agent + status).
- `service_error_parts` maps `ServiceError::AgentBridge(e)` → `(e.code(), e.to_string())`.
- **No new REST route.** CLI uses existing `POST /api/cli/invoke`.

### packages/api-types

Same PR: `extract-actions` → `WS_ACTIONS` + `src/ws/dto/agent-bridge.ts` + `contract/agent-bridge.ts` merged in `contract.ts` + `package.json` export `./ws/dto/agent-bridge`.

### apps/cli

`apps/cli/src/commands/agent_bridge.rs` — clap kebab `atmos agent-bridge`, invoke-only (copy `simulator.rs` `invoke` / `wrap_ok`). **Do not** depend on `agent-bridge` or `core-service`.

`skill-dir` is local FS like Canvas: `~/.atmos/skills/.system/atmos-agent-bridge` (no invoke).

### skills / infra sync

- `skills/atmos-agent-bridge/SKILL.md` + `references/cli.md`
- `skills/system-skills-manifest.json` entry
- `ALL_SYSTEM_SKILL_NAMES` += `"atmos-agent-bridge"`
- `repo_skill_root` arm for GitHub fallback

### Composer slash

Mirror `/desktop-use` **without** Desktop Use readiness gate (insert skill immediately unless disabled):

- `apps/web/src/features/welcome/lib/slash-agent-bridge.ts` — id `agent-bridge`, skill `atmos-agent-bridge`
- Wire Welcome, `use-agent-composer-popovers.tsx`, `TerminalAgentInputOverlay.tsx`
- Glyph in `SlashCommandPopover.tsx` (lucide `Waypoints`; no new Settings icon)
- i18n `en.json` + `zh.json`: `Welcome.components.slashPopover.agentBridge` and `terminal.agentInput.agentBridgeCommand`
- Structural bun tests next to existing slash tests

Desktop Electron: **no extra slash table** (loads the web app).

### crates/agent, packages/relay

**Untouched** for Bridge business.

## Data model

```rust
pub struct AgentAddress {
    pub server_id: String,
    pub provider_id: String,
    pub chat_id: Option<String>,
    pub workspace_id: Option<String>,
}

pub enum BusyPolicy { Wait, Queue, FailFast } // default Queue; serde snake_case

pub enum MessageKind { Send, Request, Reply, Ack }

pub struct BridgeMessage {
    pub id: String,
    pub kind: MessageKind,
    pub from: AgentAddress,
    pub to: AgentAddress,
    pub body: String,
    pub correlation_id: Option<String>,
    pub context_ref: Option<String>,
    pub busy: BusyPolicy,
    pub ttl_ms: u64, // default 30_000
}

pub enum DeliveryStatus {
    Accepted, QueuedBusy, Offline, Timeout, Rejected, Delivered,
}

pub struct ContextBag {
    pub id: String,
    pub server_id: String,
    pub goals: Vec<String>,
    pub paths: Vec<String>,
    pub refs: Vec<String>,      // PR / commit
    pub artifacts: Vec<String>,
    pub danger: Vec<String>,
}
```

No SQL table. Mailbox + bags are process memory on that Server.

`context_ref` wire: `bag:{uuid}` on this Computer, or `{server_id}/bag:{uuid}` when the creator wants to name the holder. Puller on the wrong Server gets `CONTEXT_REF_REMOTE`.

## Transport

### WebSocket / CLI invoke

```text
agent_session_status_list
                      input: { limit?, cursor?, group_key?, context_id?, provider_ids?: string[] }
                      output: { sessions, next_cursor, total, counts, agents }
                      `agents` is the enabled terminal-agent catalog (id + label), not this page.
                      `provider_ids` narrows the page and counts. Bridge `list` calls this action.
                      There is no `agent_bridge_list`.

agent_bridge_send     input: { to: AgentAddress | AgentAddress[], from?: AgentAddress,
                               body: string, busy?: BusyPolicy, ttl_ms?: number,
                               bag?: ContextBagSlices }
                      output: { acks: DeliveryAck[] }

agent_bridge_request  same as send + optional correlation_id (server fills if omitted)
agent_bridge_reply    input: { to, from?, body, correlation_id, busy?, ttl_ms? }
agent_bridge_status   input: { message_id?: string, context_ref?: string,
                               to?: AgentAddress, workspace_id?: string }
                      output: presence and/or message and/or bag
```

List is read-only presence (M4, M10). Status is read-only except it may **drain** queued mail for idle targets.

### REST

None new. `POST /api/cli/invoke` already exists (APP-063). Justification: agents cannot hold a browser `/ws`; invoke dispatches the same `WsAction` handlers.

## Security & permissions

- Same Computer auth as other CLI invoke / `/ws` actions (local token / session).
- Context bags must not include secrets, tokens, or transcripts. Skill + crate `ContextBag` fields enforce the slice shape; L3 does not scrape Chat jsonl into a bag.
- Injected Chat text is visible in that Chat’s transcript (intentional).

## Rollout plan

1. Specs APP-084 (this directory) + `specs/README.md` row.
2. `crates/agent-bridge` + unit tests (address, busy, mailbox, two-state bag pull, broadcast list).
3. `core-service` `AgentBridgeService` + `ServiceError::AgentBridge` + tests (ambiguous, cross-machine, queue, context_ref remote).
4. `apps/api` WsAction + router + invoke error map; `@atmos/api-types` extract + contract.
5. `apps/cli` kebab + clap tests.
6. Skill + manifest + `ALL_SYSTEM_SKILL_NAMES` + `repo_skill_root`.
7. Slash wiring + bun tests + i18n.

## Risks & tradeoffs

- **Tradeoff**: in-memory mailbox vs SQLite. In-memory keeps the crate DB-free and matches “no infra table” for V1. Restart drops queued mail (N1 Future).
- **Tradeoff**: inject via `AgentChatService.send` (real turn) vs silent jsonl append. Send is what the receiving agent actually sees. Risk: noisy interrupt — skill keeps bodies short.
- **Tradeoff**: V1 remote = client session reuse, not Relay federation. Avoids a second protocol and keeps Relay ignorant of agents.
- **If this breaks**: CLI/skill are additive; disable by not inserting the skill. No Settings flag required.

## Dependencies & compatibility

- Depends on: APP-063 invoke, APP-016 Computer session resolution, Agent Chat send, Agent Status occupancy.
- Blocks: nothing.
- Minimum Atmos: this Server build (CLI talks to the connected Server’s actions).
- Explicitly **not** a CLI feature-version pin (no extra binary). Feature works when Server understands `agent_bridge_*`.

## Open questions

- [x] Cross-Computer wire — **V1: session reuse, not Relay Bridge protocol.**
- [x] Remote bag — **puller fetches; no push.**
- [x] Task/claim — **V2 / Out of scope.**
