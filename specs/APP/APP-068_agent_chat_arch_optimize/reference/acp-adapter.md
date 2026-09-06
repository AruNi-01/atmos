# TECH · APP-068 slice: ACP adapter

> Implementer HOW for remaining Chat-capable registry agents. Parent contract: [../TECH.md](../TECH.md) § “crates/agent — ACP adapter”. Addresses **M10** plus remaining-agent **M6–M9 / M11** and **M15 spawn routing**. Chat domain is Atmos. APP-004 is process/registry context only.

## Scope

This slice is the **ACP → Atmos mapper**. It is used when Chat `provider_id` (after alias) is **not** `claude` / `codex` / `opencode` / `pi`. Gemini, Cursor, Grok, Droid, custom registry agents, and similar stay here. N3 native Grok/Gemini is out of scope.

ACP stdio JSON-RPC stays in `crates/agent/src/acp_client/` (APP-004 spawn, `initialize`, `session/*`, `fs.*`, `terminal/*`). Chat never sees ACP frames. `core-service` Agent Chat talks only to `AgentProvider`.

**Not this slice:** native codecs, web classifiers, jsonl schema, `agent_chat_*` names, Terminal APP-024 argv.

## MUST / MUST NOT

| MUST | MUST NOT |
|------|----------|
| Route only non-native ids through `AcpAgentProvider` | Keep a parallel ACP Chat path for `claude` / `codex` / `opencode` / `pi` (including `claude-acp`, `codex-acp`, `pi-acp`, `@agentclientprotocol/claude-agent-acp`) |
| Map `AcpSessionEvent` → tagged `AgentEventEnvelope` in `event_map.rs` | Put `AcpSessionEvent` / `AgentCapabilitiesSnapshot` on crate-root Chat API or `AgentChatMeta` |
| Map tools to `AgentTool` (`kind` + `params` + `result` only) in `tool_map.rs` | Dual-write typed params and `raw_input` / `_meta.claudeCode` / `detail` |
| Prefer ACP `ToolKind`, then generic extractors, then `provider_id` overlays | Use name heuristics as the only classifier; map `web_search` to workspace `Search` |
| Fold Think / plan / hide **before** emitting a tool event | Emit thinking/plan as `AgentToolKind` |
| Answer `session/request_permission` via `AgentAction::RespondPermission` | Convert options to a boolean `allowed` / `remember` Chat API |
| Persist ACP session id; resume via `session/load` then `session/resume` | Treat Chat `get` as resume; re-apply host `default_config` on resume |
| `SetConfig` alias writes (`model`/`models`, …) inside the adapter | Put ACP `configOptions` bags on meta as SOT |
| Unmapped tool → `kind: other`, params/result = vendor values; unknown `session/update` → drop or one `Unknown` | Crash the session; hide the turn |
| `AgentAction::Steer` → `Unsupported` | Fake steer with a second `session/prompt` |

## Architecture

```text
AgentChatService  →  AgentProviderFactory.provider_for(id)
                         │
                         ├─ claude|codex|opencode|pi  →  native slices (not here)
                         └─ everyone else             →  AcpAgentProvider
                                                           │
                              acp_client/  stdio JSON-RPC (private)
                              providers/acp/event_map.rs  AcpSessionEvent → envelope
                              providers/acp/tool_map.rs   ToolCallUpdate → AgentTool
                              domain/tool_map.rs          generic JSON extractors
```

Wire pin: crate `agent-client-protocol` **2.0.0** (`crates/agent/Cargo.toml`). Spec: [ACP v1 overview](https://agentclientprotocol.com/protocol/v1/overview), [session setup](https://github.com/agentclientprotocol/agent-client-protocol/blob/main/docs/protocol/v1/session-setup.mdx) (`session/new`, `session/load`, `session/resume`), client method `session/request_permission`. Chat spawn for Grok remains `grok agent stdio` (`crates/agent/src/manager/provision.rs`). Do not copy community ACP façades.

## Files

```text
crates/agent/src/providers/acp/
  mod.rs
  adapter.rs      # AcpAgentProvider, runtime, AgentAction, spawn/resume
  event_map.rs    # NEW: AcpSessionEvent → Option<AgentEventEnvelope>
  tool_map.rs     # NEW: ToolCallUpdate + provider_id → tool or fold
  testdata/       # recorded ACP session/update + request_permission frames
crates/agent/src/domain/tool_map.rs   # generic extractors (parent domain slice)
crates/agent/src/lib.rs               # Chat API without ACP type re-exports
crates/core-service/src/service/agent_chat/acp_factory.rs  # routing
```

Keep `acp_client/{client,runner,process,tools,types}.rs`. Do not move JSON-RPC into `providers/acp`.

`ToolCallUpdate` must carry ACP kind **and** vendor name. Today `client.rs` `format_tool_kind` stringifies to `"Read"` / `"Tool"` and overwrites `tool` with `raw_input.type`. Change the internal struct (not a Chat DTO):

```rust
pub struct ToolCallUpdate {
    pub tool_call_id: String,
    pub name: String,            // vendor title fallback
    pub title: String,
    pub acp_kind: Option<schema::ToolKind>,
    pub status: ToolCallStatus,
    pub raw_input: Option<Value>,
    pub raw_output: Option<Value>,
    pub content: Vec<AgentToolCallContentItem>,
}
```

Do not persist `detail` / `_meta.claudeCode`. `extract_claude_code_meta` may stay in `acp_client` for leftover ACP wrappers; Chat spawn never sends the four natives here, and `tool_map` must not copy that `_meta` onto `AgentTool`.

## Spawn routing

Canonicalize before construct (`acp_factory.rs` + tests S24):

| Incoming `provider_id` | Chat provider |
|------------------------|---------------|
| `claude`, `claude-code`, `claude_code`, `claude-acp`, `claude-code-acp`, `claude-agent-acp` | native `claude` |
| `codex`, `codex-acp` | native `codex` |
| `opencode` | native `opencode` |
| `pi`, `pi-acp` | native `pi` |
| anything else (`grok`, `grok-build`, `gemini`, `cursor`, custom, …) | `AcpAgentProvider` |

Catalog probe may still speak ACP for `claude-acp` (APP-024). That is **not** Chat spawn. `LazyAcpProvider` must not wrap the four natives.

## Crate public API

Today `crates/agent/src/lib.rs` re-exports `AcpSessionEvent`, `AgentCapabilitiesSnapshot`, `PermissionRequest`, `AtmosAcpClient`, `run_acp_session`, … as if they were Chat types. Stop.

**Crate-root Chat API:** `domain::*` (descriptor, runtime, `AgentAction`, envelope, `AgentTool`) + catalog + `AgentManager` / `models` + `providers::acp::{AcpAgentProvider, AcpProviderParams}` + the four native providers (other slices). Do **not** crate-root `pub use` `classify_tool` (adapter fallback only).

**Keep `pub mod acp_client`.** Non-Chat callers import the submodule:

- `crates/core-service/src/service/agent.rs` — `logout_acp_agent`, `AgentLogoutResult`
- catalog probe — `run_acp_session`, `AcpSessionEvent`
- `acp_factory.rs` — `AcpToolHandler` (fs read/write for ACP client methods)

`AcpProviderParams` may hold `Arc<dyn AcpToolHandler>`; that is adapter construction, not a Chat event. Chat `apply_event` imports `agent::{AgentEvent, …}` only.

## Runtime (`adapter.rs`)

Implement parent `AgentRuntime` / `AgentAction`. Rename `prompt` → `send`. Atmos `turn_id` is the control epoch on `AgentPrompt`; store it in `running_turn`. `send` → ACP `session/prompt`. `cancel` → `session/cancel`. `close` → `session/close` when advertised.

`AgentAction::Steer` always `Unsupported` for this adapter (do not send a second prompt). Delete `supports_steer` on `AcpProviderParams`.

`AgentAction::SetConfig` — alias writes below. JSON-RPC success is the success signal; do not second-guess `currentValue`.

`AgentAction::RespondPermission` — complete the oneshot (permission section). Missing `request_id` → `NotFound`.

`descriptor()`: identity from `provider_id` + launch/catalog name/version. Capabilities:

| Atmos | From ACP |
|-------|----------|
| `resume` | `sessionCapabilities.resume` **or** `loadSession` |
| `permission` | `Supported` (host implements `session/request_permission`) |
| `configure` | `Supported` when live `configOptions` or catalog models/thinking/modes exist |
| `steer` | `Unsupported` |

Never copy `AgentCapabilitiesSnapshot` onto descriptor. `AgentInfoUpdate` / `CapabilitiesUpdate` refresh adapter-internal snapshot only.

`next_event`: drain `pending`, else `recv_event`, register permission oneshots, `event_map`. Replay flag set when `resume_session_id` is `Some`.

## event_map.rs

Input: `AcpSessionEvent` (`crates/agent/src/acp_client/client.rs`). Output: zero or more Atmos envelopes (queue extras when closing an open thinking/assistant stream — keep `complete_stream_before`). Wrap every emit: `event_id` UUID, `turn_id` = `running_turn`, `timestamp` now, **no native sidecar**.

| ACP | Atmos |
|-----|--------|
| `SessionReady { acp_session_id }` | `SessionStarted { persistence_handle: Some(id) }`; store handle; `replaying = false` |
| `Stream` kind `thinking` | `ThinkingDelta` / `ThinkingCompleted` |
| `Stream` role `assistant` | `AssistantMessageDelta` / `AssistantMessageCompleted` |
| other stream (user replay, …) | drop |
| `ToolCall` | `tool_map`; if fold → thinking/plan/hide; else `ToolCallStarted` / `Updated` / `Completed` / `Failed` from ACP status |
| `PermissionRequest` | `PermissionRequested` (`request_id`, `tool`, `description`, `content_markdown`, `options` with `option_id`/`name`/`kind`). Drop ACP `risk_level` |
| `TurnEnd` | `TurnCompleted` / `TurnCanceled` / `TurnFailed` using Atmos `turn_id` (not ACP). Map `AcpTurnStop` as today |
| `Error` | `TurnFailed` if a turn is running; else drop or `Unknown` |
| `Plan` | `PlanUpdated` (JSON entries) |
| `Usage` / `TurnUsage` | `UsageUpdated` (JSON; good enough for v1) |
| `ConfigOptionsUpdate` | merge **known** option ids into `current_config` + `supported_options`; emit `ConfigChanged` with that Atmos config, not the raw option vec |
| `LoadCompleted` | clear `replaying`; no Chat event |
| `SessionClosed` / `SessionEnded` | `SessionClosed` |
| `SessionInfoUpdate` title | `SessionTitleUpdated` if non-empty |
| `AvailableCommandsUpdate` | `AvailableCommandsUpdated` |
| `AgentInfoUpdate` / `CapabilitiesUpdate` | no Chat event |
| unknown / `_` | drop (client already swallows unknown `session/update`). Do not fail the session |

Replay (`should_drop_replay`): while `replaying`, drop streams/tools/permissions/plans/usage. Keep `LoadCompleted`, `SessionReady`, close, `AvailableCommandsUpdate`. Atmos history is jsonl; ACP load replay is not a second transcript.

## tool_map.rs

```rust
enum ToolMapOut {
    FoldThinking { text: String, done: bool },
    FoldPlan { plan: Value },
    Hide,
    Tool(AgentTool),
    Replace { tool_call_id: String, tool: AgentTool }, // Grok taskoutput → original execute
}
fn map_tool_call(provider_id: &str, update: &ToolCallUpdate) -> ToolMapOut;
```

Pipeline:

1. **Fold** if ACP kind is `Think` or `classify_tool` says Thinking; if SwitchMode / todo / plan input → Plan; Hide (e.g. SwitchMode without plan) → no event.
2. **ACP kind → Atmos kind** when known: `read`/`edit`/`delete`/`move`/`execute`/`search`/`fetch`. `Think`/`SwitchMode` already folded. ACP `Search` is **workspace** search.
3. **Name overlay (all ACP agents):** `web_search` / `websearch` / name contains `web_search` → `WebSearch`, never `Search`. `web_fetch` / `webfetch` → `Fetch`.
4. **`domain/tool_map.rs` extractors** on `raw_input` / `raw_output` (and Grok nested `FileContent` / `Result` / `content` objects): path, `offset`/`limit`, command, cwd, url, query, glob, skill, link list (`url`+`title`+`snippet`). Unused vendor keys **dropped** on typed maps.
5. **`provider_id` overlay** (below).
6. **Else** `kind: Other`, `params: Other { value: raw_input or {} }`, `result: Other { value: raw_output }` or `Empty` while running. `name`/`title` stay vendor for the generic card.

Status: ACP InProgress → running; Completed / Failed as named. Result: Diff content → `DiffStats` when line counts exist, else `Text`; execute output/exit from vendor JSON; web_search **must** set `params.query` and `result: WebSearch { links }` when links parse, else same kind+params with `result: Text`. Same rule for fetch url/body. Only the **whole tool** falls through to `other` when kind cannot be classified (parent TECH).

`parent_tool_call_id` is adapter-internal (not on `AgentTool` v1). Subagent still maps to `kind: subagent` when name/input say so.

### Grok overlay (`grok`, `grok-build`)

Move the meaning of `apps/web/.../background-command/adapters/grok.ts` **into this mapper** (web slice deletes that SOT).

- Unwrap `type` / `variant` / `FileContent` / `Result`.
- Execute if ACP kind is execute **or** command-like name **or** `type` is execute/bash/shell **or** `backgroundtaskstarted`.
- `params: Execute { command, cwd, background, task_id }`. `background` if `is_background` / `background` / `run_in_background` or title `^[bg]` or `backgroundtaskstarted`. `task_id` from `output.task_id` / `Result.task_id`.
- `taskoutput` with the same `task_id`: `Replace` the original execute (`ToolCallUpdated` / `Completed` / `Failed`). Adapter state: `HashMap<task_id, execute_tool_call_id>`, dropped on `TurnEnd` / `close`. If it cannot correlate → `other` (still visible). Strip Grok poll footer (`Use timeout_ms to wait…`) from execute output text.
- Do not keep a Claude `_meta` overlay on this Chat path.

Other remaining agents: steps 1–4 + 6 until a product card needs a new overlay (N2). Fallback background flags (`is_background`, `[bg]`) apply to any ACP execute, not only Grok.

## Config option id aliases

Adapter-internal. Catalog probe already uses the same id classes (`crates/agent/src/catalog/acp_probe.rs`).

**Write** (`SetConfig` + new-session `default_config`): try ids in order until ACP `session/set_config_option` (or legacy `session/set_mode` when `uses_legacy_modes`) succeeds.

| Atmos field | ACP ids tried |
|-------------|---------------|
| `model` | `model`, `models` |
| `thinking` | `thought_level`, `thinking`, `think` |
| `mode` | `mode`, `modes` |
| `extra_config` | exact id |

New session: insert Atmos model/thinking/mode into the default map using **canonical** ACP ids `model` / `thought_level` / `mode` (today’s `open_acp_session`). Resume: **do not** apply host defaults (`resume_session_id_skips_host_config`).

**Read:** merge known ids into `supported_options` / `current_config`. Thinking ids also include `effort` and `*reason*` (catalog). Unknown option ids stay in adapter state until a product control exists. Delete `session_config_options` as Chat SOT.

## Permission (`session/request_permission` → Atmos)

ACP: agent → client `session/request_permission` with `toolCall` + `options` ([overview](https://agentclientprotocol.com/protocol/v1/overview)). Keep the existing oneshot in `AtmosAcpClient::request_permission` (`crates/agent/src/acp_client/client.rs`).

```text
agent  --session/request_permission-->  AtmosAcpClient
  allocate request_id = perm_{uuid}
  permission_tx + AcpSessionEvent::PermissionRequest
event_map  -->  AgentEvent::PermissionRequested
ws agent_chat_permission_respond
  --> AgentAction::RespondPermission { request_id, option_id }
  --> oneshot.send(option_id)
client  --RequestPermissionOutcome::Selected{optionId}-->  agent
```

Map option `kind` as today: `allow_once` / `allow_always` / `reject_once` / `reject_always` / `other`. Unknown option kinds must not crash; still show the option. `cancel` / `close` must complete outstanding oneshots (ACP cancelled outcome) so the JSON-RPC does not hang.

Do not expose `PermissionRequest` / `PermissionResponse` at crate root.

## Resume mapping

`AgentPersistenceHandle` = ACP session id from `SessionReady`. `resume_runtime` passes it to `run_acp_session`.

`select_session_restore_method` (keep): if `loadSession` → `session/load` (history replay, then `LoadCompleted`); else if `sessionCapabilities.resume` → `session/resume` (no history); else spawn error (honest `resume: Unsupported` should have hidden the control). Auth-required stays `ACP_AUTH_REQUIRED::` inside `acp_client`; Chat surfaces it as spawn/`TurnFailed` error string, not an ACP DTO.

Chat **restore ≠ spawn** remains core-service: `agent_chat_get` reads jsonl and does not call `resume_runtime`.

## Fixtures

`crates/agent/src/providers/acp/testdata/` recorded against `agent-client-protocol` 2.0.0. Cover: send (`session/prompt` + assistant stream + `TurnEnd`), cancel, `request_permission` round-trip, `SetConfig` alias success on `models` after `model` fails, `session/load` replay drop, execute / web_search / fetch typed maps, Grok background execute + `taskoutput` correlate, unknown tool → `other`, unknown `session/update` does not panic, steer is `Unsupported`. No live CLI required on CI.

## Rollout

1. Split `event_map` / `tool_map`; stop crate-root ACP re-exports; factory routing (natives never ACP).
2. Typed tool contract + Grok overlay; delete dual `input`/`output` on mapped tools.
3. Descriptor capabilities from ACP snapshot; steer fail-closed; permission/config unchanged product behavior (M13).

## Risks

- **Tradeoff: drop ACP load replay.** Jsonl is SOT; replaying ACP history would duplicate turns.
- **Tradeoff: no fake ACP steer.** Remaining agents lose in-turn inject until N3.
- **Rollback:** Chat of the four natives does not use this adapter. Remaining agents can keep ACP process spawn if the mapper is reverted, but jsonl is new-envelope-only (parent).
- **`classify_tool`:** last-resort name fold inside `tool_map` only. Web must not import it or duplicate alias tables (M10).
