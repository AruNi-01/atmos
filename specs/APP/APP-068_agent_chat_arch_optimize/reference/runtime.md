# TECH · APP-068 slice: Runtime + AgentAction + provider routing

> Implementer-depth HOW. Sibling of [../TECH.md](../TECH.md). Addresses **M5** and **M15 routing**. Does not specify vendor codecs (`native-*.md`, `acp-adapter.md`), events (`events.md`), or Chat files (`persistence.md`).

## Scope summary

Shrink `AgentRuntimeCommands` to four core verbs. Put product extras on a closed `AgentAction`. Route Chat spawn by exact `provider_id`. Override Chat argv for the four natives; leave Terminal catalog argv alone.

Today (`crates/agent/src/domain/session.rs`) the trait still has `prompt` / `steer` / `set_config` / `respond_permission` as peers. Target replaces that width. WS names stay `agent_chat_*`.

## Architecture

```text
apps/web  composer (hide Steer unless capabilities.steer)
    │  /ws  agent_chat_send | _cancel | _steer | _permission_respond | configure
    ▼
apps/api/src/api/ws/router/agent_chat.rs     # thin; no vendor spawn
    ▼
crates/core-service/.../agent_chat/service.rs
    send / cancel / steer / permission_respond / configure
    get / list / create  → files only (APP-067 M5)
    ensure_runtime → spawn_runtime  (send / continue only)
    queue.rs         → send() after idle; never vendor follow_up
    ▼
crates/agent
    domain/session.rs   AgentProvider, AgentRuntime, AgentPrompt, handles
    domain/action.rs    AgentAction, AgentActionKind, AgentActionError  (new)
    providers/mod.rs    chat_provider_kind(id)
    providers/{claude,codex,opencode,pi}/spawn.rs   Chat argv OVERRIDE
    providers/acp/adapter.rs                        everyone else
```

`AgentChatService.runtimes: HashMap<chat_id, LiveRuntime>` holds at most **one** live process per conversation. `control: AgentRuntimeControl` is `Clone` (`Arc<dyn AgentRuntimeCommands>`). The pump owns `Box<dyn AgentRuntime>` and is the only caller of `next_event`.

## Trait signatures (locked)

Files: `crates/agent/src/domain/session.rs`, new `crates/agent/src/domain/action.rs`. Re-export from `crates/agent/src/domain/mod.rs`. `crates/agent/src/lib.rs` Chat surface stays `domain::*` (parent crate-root rule).

```rust
pub enum AgentAction {
    Steer { input: AgentPrompt },
    RespondPermission { request_id: String, option_id: String },
    SetConfig { update: AgentRuntimeConfigUpdate },
}

pub enum AgentActionKind { Steer, RespondPermission, SetConfig }

#[derive(Debug, Error)]
pub enum AgentActionError {
    #[error("unsupported action {action:?}")]
    Unsupported { action: AgentActionKind },
    #[error("steer requires a matching running turn")]
    SteerTurnMismatch,
    #[error("not found: {0}")]
    NotFound(String),
}

impl From<AgentActionError> for AgentProviderError {
    // Unsupported → AgentProviderError::Unsupported
    // SteerTurnMismatch → AgentProviderError::SteerTurnMismatch
    // NotFound → AgentProviderError::NotFound
}

#[async_trait]
pub trait AgentRuntimeCommands: Send + Sync {
    async fn send(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle>;
    async fn cancel(&self) -> AgentResult<()>;
    async fn close(&self) -> AgentResult<()>;
    async fn action(&self, action: AgentAction) -> Result<(), AgentActionError>;
}

#[async_trait]
pub trait AgentRuntime: Send {
    fn control(&self) -> AgentRuntimeControl;
    fn persistence_handle(&self) -> Option<AgentPersistenceHandle>;
    fn descriptor(&self) -> AgentDescriptor; // live capabilities/options; see descriptor.md
    async fn next_event(&mut self) -> Option<AgentEventEnvelope>; // envelope: events.md
}

#[async_trait]
pub trait AgentProvider: Send + Sync {
    fn id(&self) -> &str;
    async fn descriptor(&self, ctx: &AgentCatalogContext) -> AgentResult<AgentDescriptor>;
    async fn create_runtime(&self, cfg: AgentRuntimeConfig) -> AgentResult<Box<dyn AgentRuntime>>;
    async fn resume_runtime(
        &self,
        handle: AgentPersistenceHandle,
        cfg: AgentRuntimeConfig,
    ) -> AgentResult<Box<dyn AgentRuntime>>;
}
```

Rename **trait** `prompt` → `send` only. `apps/api/src/api/ws/router/agent_chat.rs` `handle_agent_chat_send` and `packages/api-types` action `agent_chat_send` do not rename.

`AgentRuntimeControl` keeps thin wrappers so `service.rs` / `queue.rs` / `apply_event.rs` can migrate without a flag day:

| Wrapper | Dispatches |
|---------|------------|
| `send` | core `send` |
| `cancel` / `close` | core |
| `steer` / `respond_permission` / `set_config` | `action(...)` then `Into<AgentProviderError>` |
| `action` | pass-through |

Remove `prompt`, `steer`, `set_config`, `respond_permission` from the **trait** once wrappers exist. Do not leave both a trait method and an `AgentAction` variant for the same verb.

`send` / `cancel` / `close` / `next_event` are **not** capability flags (M2). A process that cannot cancel is a provider bug.

## AgentActionError::Unsupported (fail closed)

`action()` **must** return `AgentActionError::Unsupported { action }` when the live `descriptor().capabilities` field for that verb is `Unsupported`, and when the vendor wire has no same-turn inject (Claude Code, OpenCode → Steer).

Host still hides the control (`apps/web` reads `descriptor.capabilities.steer`). Adapter honesty is the backstop: a stale client or a missed gate must not invent `session/prompt`, queue, interrupt+resend, or Pi `follow_up` as “steer”.

`crates/core-service/src/service/agent_chat/service.rs` `steer()`:

1. Reject empty text (`ServiceError::Validation`).
2. If `descriptor.capabilities.steer != Supported` → Validation, **do not** call the adapter.
3. Require a live `runtimes` entry and `state.current_turn_id == expected_turn_id`.
4. `control.action(AgentAction::Steer { input })`. Map `Unsupported` and `SteerTurnMismatch` to Validation.

`permission_respond` requires a live runtime (today: `"no live runtime"`). `configure` while live becomes `SetConfig`; pre-spawn still writes `meta` / `descriptor.current_config` only (`service.rs` `configure` already does that).

## Forbidden API

| MUST NOT | Why |
|----------|-----|
| `execute(name: &str, json: Value)` or `AgentAction::Execute { .. }` | M5 closed set. Tools are observations (`tools.md`), not host RPCs. |
| `AgentAction::Fork` / `Compact` / `Rewind` | PRD N4. Codex `thread/fork`, Pi `fork`/`compact`, Claude `rewind_files`, OpenCode summarize stay adapter-private. |
| Method-union trait (`prompt` + `steer` + `set_config` as required peers) | That is today’s `session.rs`; it grows a control per vendor. |
| Capability flags for send/cancel/subscribe | Core runtime. |
| Routing by binary name or `stdoutParser` | Exact `provider_id` only. Custom agent `my-claude` → ACP. |

## Provider routing (M15)

`crates/agent/src/providers/mod.rs` today: `pub mod acp`. Add natives when those slices land. Own the match **here**:

```rust
pub enum ChatProviderKind {
    NativeClaude, NativeCodex, NativeOpenCode, NativePi, Acp,
}

/// Fold ACP/catalog aliases first (`claude-acp` → `claude`, `codex-acp` → `codex`,
/// `pi-acp` → `pi`). Unknown ids including `my-claude` stay ACP.
pub fn chat_provider_kind(provider_id: &str) -> ChatProviderKind { /* match canonical id */ }
```

`capabilities_for_provider_id` in `domain/descriptor.rs` must canonicalize with the same alias table before the steer honesty matrix.

`crates/core-service/src/service/agent_chat/acp_factory.rs` `DefaultAgentProviderFactory::provider_for` currently always returns `LazyAcpProvider`. Change it to `match chat_provider_kind(id)` and construct `ClaudeNativeProvider` / `CodexNativeProvider` / `OpenCodeNativeProvider` / `PiNativeProvider` / `AcpAgentProvider` (`LazyAcpProvider` wrap stays valid for ACP so launch_spec is resolved at spawn).

Do not consult `resources/terminal-agents/builtin_agents.json` `params` when choosing the provider. Catalog still supplies **binary name** (`cmd`) and model lists.

## Chat spawn OVERRIDE vs Terminal argv

Terminal APP-024 keeps `resources/terminal-agents/builtin_agents.json` unchanged:

| `id` | Terminal `params` (do not edit for Chat) | Chat native spawn (adapter `spawn.rs`) |
|------|------------------------------------------|----------------------------------------|
| `claude` | `--print --output-format stream-json --verbose --include-partial-messages` | `claude --input-format stream-json --output-format stream-json --verbose --include-partial-messages` (duplex, not `--print`) |
| `codex` | `exec --json` | `codex app-server` (stdio JSONL) |
| `opencode` | `run --format json` | `opencode serve --hostname 127.0.0.1 --port 0` (own process; not the user’s TUI) |
| `pi` | `-p` | `pi --mode rpc` |

Sources for Chat argv (protocol detail in native slices): Claude Agent SDK stream-json; [Codex app-server](https://learn.chatgpt.com/docs/app-server); [OpenCode serve](https://opencode.ai/docs/server/); [Pi RPC](https://pi.dev/docs/latest/rpc). Pin CLI versions in each adapter `testdata/` README, not here.

ACP path (`gemini`, `grok`, `cursor`, `factory-droid`, registry ids, …) still uses `AgentLaunchSpec` from `AgentService::get_registry_agent_launch_spec` / custom spec (`acp_factory.rs` `resolve_launch`). Native path **ignores** launch_spec.args / builtin `params`. Resolve the executable the same way as today (`cmd` / PATH / provisioned binary).

## Spawn lifecycle — one process per live Chat

```text
create / list / get / rename     → store only. factory.provider_for NOT called.
send / queue dispatch / continue → ensure_runtime → spawn_runtime
  persistence_handle is None  → AgentProvider::create_runtime(cfg)
  persistence_handle is Some  → AgentProvider::resume_runtime(handle, cfg)
idle unload / workspace close / delete → close() then drop child
```

`ensure_runtime` / `spawn_runtime` in `service.rs` (~711–844) stay the only Chat spawn gate. Reuse an alive map entry; do not start a second process for the same `chat_id`.

**create_runtime:** spawn vendor host, handshake, persist vendor session id onto `AgentPersistenceHandle` when the vendor emits it (Claude `session_id`, Codex thread id, OpenCode `ses_…`, Pi session id, ACP `session/new` id). Atmos `chat_id` is never that string (APP-067).

**resume_runtime:** spawn a **new** process (or OpenCode serve) and attach to that vendor id. Not a no-op. Not `get()`.

**Restore without spawn (APP-067 M5 / APP-068 M12–M13):** `AgentChatService::get` reads `store.get_snapshot` and overlays in-memory pump state **if** a LiveRuntime already exists. Opening a tab, `agent_chat_get`, list, or replay must not call `provider_for`, `create_runtime`, or `resume_runtime`. Tests already in `crates/core-service/src/service/agent_chat/tests.rs` must keep proving the runtime map stays empty.

**close / kill:**

1. `close()` is the graceful verb: ACP `session/close` (`acp_client/runner.rs` `send_close`); natives send vendor shutdown if the protocol has one, then drop stdio.
2. Child processes use `kill_on_drop(true)` like `crates/agent/src/acp_client/process.rs`. Dropping `Box<dyn AgentRuntime>` after `close()` is the force-kill.
3. After close, `next_event` yields `SessionClosed` (or envelope equivalent) then `None`. Pump in `service.rs` `pump_session` already treats `SessionClosed` as clean exit.
4. `delete` spawns `control.close()` then deletes files. `unload_idle` / `close_workspace` call `close_runtime` (remove map entry, `alive=false`, `close()`, meta `Detached` unless already `Closed`).
5. OpenCode: kill **that Chat’s** `serve`. Never attach to a user TUI server. Bind `127.0.0.1` only.

Unknown vendor methods on an **open** session must not panic the pump (M16; codecs in native slices). `close()` itself must still terminate the process.

## Host call map (do not grow)

| Product | Service today | Target runtime |
|---------|---------------|----------------|
| Send | `send` → `control.prompt` (`service.rs` ~394, `queue.rs` ~100) | `control.send` |
| Stop | `cancel` → `control.cancel` | `cancel` (core) |
| Steer | `steer` → `control.steer` | `action(Steer)` after capability + turn match |
| Permission | `permission_respond` → `control.respond_permission` | `action(RespondPermission)` |
| Model/thinking/mode live | `apply_event.rs` `apply_live_session_config` → `set_config` | `action(SetConfig)` |
| Follow-up | `queue.json` → `maybe_dispatch_queue` → `prompt` | `send` only |

WS stays `agent_chat_send` / `agent_chat_cancel` / `agent_chat_steer` / `agent_chat_permission_respond` (`apps/api/src/api/ws/router/mod.rs`). No new REST chat API. OpenCode HTTP is adapter-private.

## Atmos `turn_id` vs vendor turn ids

Host epoch: `service.rs` `send` allocates `turn_id = Uuid` **before** `ensure_runtime`, writes `TurnStarted`, then passes `AgentPrompt { turn_id: Some(turn_id), kind: Normal, ... }`. `send()` **must** return `AgentTurnHandle { turn_id }` equal to that id. Adapters must not replace it with a vendor id.

Adapters keep a private map `atmos_turn_id → vendor_turn_id` (Codex turn id for `turn/steer` `expectedTurnId`; Pi `turn_start` id; others as needed). Codex steer **must** send the vendor id, not the Atmos UUID (parent TECH). Envelope `turn_id` on events stays the Atmos epoch (`events.md`).

## Queue.json is Atmos SOT

`~/.atmos/data/agent/chats/{chat_id}/queue.json` (APP-067) remains the only follow-up queue. `maybe_dispatch_queue` starts a **new** host turn and calls `send`.

MUST NOT enqueue the same item on Pi `follow_up` / `clear_queue` ([Pi RPC](https://pi.dev/docs/latest/rpc)). Ignore vendor `queue_update` for Atmos queue SOT. When `capabilities.steer == Supported` **and** the user chose Steer (`followup_policy=steer`, or a one-shot steer), call `action(Steer)` — that is same-turn inject (Codex `turn/steer`, Pi `steer`, Claude stdin user NDJSON, OpenCode `prompt_async` `delivery:"steer"`, Grok `_x.ai/interject`). It is not a queue write.

## Steer honesty (locked)

<!-- updated: Claude / OpenCode / Grok now inject into the running turn. Generic ACP is still Unsupported. -->

| Provider | `capabilities.steer` | `action(Steer)` |
|----------|----------------------|-----------------|
| `codex` | Supported | Vendor `turn/steer` + `expectedTurnId` from adapter map |
| `pi` | Supported | Vendor `steer` (not `follow_up`) |
| `claude` | Supported | Second stdin user NDJSON; do not change `running_turn`; overlapping `send` still `turn in flight` |
| `opencode` | Supported | Second `POST /session/{id}/prompt_async` with `delivery:"steer"`; keep the same Atmos `turn_id` |
| `grok` | Supported | `_x.ai/interject` `{sessionId,text}` while `session/prompt` is in flight. Not a second `session/prompt`. |
| ACP (v1 Chat) | Unsupported | `AgentActionError::Unsupported { Steer }`. Do not use a second `session/prompt` as steer. |

## MUST implement vs MUST NOT

| MUST | MUST NOT |
|------|----------|
| Core: `send`, `cancel`, `close`, `next_event` | Extra required trait methods |
| `AgentAction` = Steer, RespondPermission, SetConfig | `execute(name, json)`, Fork, Compact, Rewind |
| `AgentActionError::Unsupported` fail closed | Fake steer via queue, interrupt+resend, or Pi `follow_up` |
| `chat_provider_kind`: four natives, else ACP | Route by argv, parser, or fuzzy name |
| Chat spawn override in `providers/<id>/spawn.rs` | Edit Terminal `builtin_agents.json` `params` to ship Chat |
| One process per live `chat_id`; `kill_on_drop` | Spawn on `get` / list / restore |
| `resume_runtime` only from `spawn_runtime` when handle exists | Treat restore as resume |
| Host `turn_id` as control epoch; vendor ids private | Persist vendor turn id as Atmos `turn_id` |
| Queue dispatch → `send` | Dual-write Atmos queue + vendor queue |

## Tests (this slice)

| Id | Where | Signal |
|----|-------|--------|
| S3 | `crates/agent` action + Claude/OpenCode stub | `action(Steer)` → `Unsupported`; no second send |
| S7 | trait stub | `send`/`cancel` work with no capability flags |
| S14 | `cargo test -p core-service --lib agent_chat` | existing restore / queue / steer-match / permission tests stay green |
| S24 | `chat_provider_kind` + factory | `claude`/`codex`/`opencode`/`pi` native; `grok` ACP; Chat argv ≠ builtin `params` |

Fixture frames for vendor codecs live under `crates/agent/src/providers/<id>/testdata/` (native slices). Routing tests do not need live CLIs.

`crates/agent/src/testing.rs` `FakeSessionInner`: rename `prompt` → `send`; implement `action`; keep counters for service tests.

## Rollout (domain first)

1. Add `domain/action.rs`. Change `AgentRuntimeCommands` to `send` + `action`. Update ACP adapter + `testing.rs`. Service/queue call `send` / wrappers. No native spawn yet.
2. Add `chat_provider_kind`. Factory still ACP for all ids until a native constructor exists.
3. Per native slice: `spawn.rs` override + wire that arm in `provider_for`.
4. Delete leftover trait methods. Assert `builtin_agents.json` four `params` strings unchanged.

## Risks

- **Trait rename churn:** `prompt` → `send` touches `service.rs`, `queue.rs`, `testing.rs`, ACP adapter in one cut. Wrappers on `AgentRuntimeControl` keep the service diff small; do not keep `prompt` on the trait.
- **Factory always-ACP today:** forgetting the match leaves M15 as dead code. S24 must fail if `claude` still constructs `LazyAcpProvider` after natives exist.
- **Restore vs resume confusion:** `resume_runtime` *does* spawn. The APP-067 invariant is “get does not call it”, not “resume_runtime is a file read”.
- **OpenCode process leak:** one `serve` per Chat; close must kill it. Sharing a TUI server is a product bug.
- **If this breaks:** Terminal one-shot parsers still read builtin argv. Chat can fall back only by routing a given id to ACP — not by rewriting Terminal params.

## Dependencies

- APP-067 host (`AgentChatService` spawn gate, `queue.json`, restore ≠ spawn).
- Descriptor slice for `AgentDescriptor` / `Capability` shapes `descriptor()` returns.
- Native / ACP slices for codecs. This slice does not pin CLI versions.
- Does not block APP-024. Does not add `/ws` actions.
