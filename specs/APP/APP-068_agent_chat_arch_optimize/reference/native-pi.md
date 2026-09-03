# TECH · APP-068 slice: Native Pi (`--mode rpc`)

> Implementer HOW for Chat `provider_id` `pi`. Parent: [../TECH.md](../TECH.md) § Pi + capability matrix. Addresses **M15–M16**. Domain contracts: [runtime.md](./runtime.md), [events.md](./events.md), [tools.md](./tools.md), [descriptor.md](./descriptor.md). APP-067 product behavior unchanged (M13). Do not implement production code in this pass.

## Scope

This slice is the **Rust Pi RPC client + Atmos mapper**. Spawn `pi --mode rpc`, speak official JSONL, emit tagged Atmos events/tools. One long-lived process per live Chat. Terminal APP-024 keeps catalog `params: "-p"`; Chat **overrides** argv.

**Not this slice:** ACP façade, Node `@earendil-works/pi-coding-agent` SDK, `pi-acp`, community `--adapter pi`, Terminal parsers, jsonl/WS DTO shapes, composer chrome.

Locked (do not reopen): `capabilities.steer = Supported` via vendor `steer` (not queue, not interrupt+resend). Atmos `queue.json` is the follow-up SOT — do **not** also `follow_up` / `clear_queue` for Atmos queue. Do **not** inject an ACP-style permission gate extension. Permission is **only** answering `extension_ui_request` dialogs.

## Sources (research, then pin)

| Source | Use |
|--------|-----|
| [pi.dev/docs/latest/rpc](https://pi.dev/docs/latest/rpc) | Normative wire. Same text as `packages/coding-agent/docs/rpc.md` in [earendil-works/pi](https://github.com/earendil-works/pi). |
| [pi.dev/docs/latest/sdk](https://pi.dev/docs/latest/sdk) | **RPC alternative for Node in-process.** Atmos Server is Rust → **do not** embed the SDK. Docs: prefer RPC when integrating from another language / process isolation. |
| Types | [rpc-types.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/modes/rpc/rpc-types.ts) |
| TS client (ideas only) | `packages/coding-agent/src/modes/rpc/rpc-client.ts` |
| Community RPC client | [beyond5959/acp-adapter](https://github.com/beyond5959/acp-adapter) `internal/pi/client.go` — **copy RPC client ideas, not** `pkg/piacp` or `gate_extension.go` |

Fixture pin: `@earendil-works/pi-coding-agent` **0.84.4** (2026-08-28). Record `pi --version` in `testdata/README.md`. Re-record when the published RPC page changes command/event shapes.

Third-party pages that call this “JSON-RPC” are wrong. Official protocol is **not** JSON-RPC 2.0: no `"jsonrpc"`, no `method`, no `{id, result|error}` RPC envelope.

## MUST / MUST NOT

| MUST | MUST NOT |
|------|----------|
| Spawn Chat as `pi --mode rpc` (cwd = chat cwd) | Chat-spawn `pi -p` / `--print` / `--mode json`; edit `builtin_agents.json` `params` |
| Frame JSONL: write `json + \n`; read split on `\n` only (strip trailing `\r`) | Node `readline` semantics; treat `U+2028`/`U+2029` as record breaks; parse as JSON-RPC |
| Commands: `prompt`, `steer`, `abort`, `get_state`, `set_model`, `get_available_models`, `set_thinking_level`, `get_available_thinking_levels`, `switch_session` | Chat actions: `compact`, `fork`, `clone`, `export_html`, `new_session`, `follow_up` (Atmos queue), `clear_queue` (Atmos queue), `cycle_*`, `get_messages` as transcript SOT |
| Execute card from `tool_execution_*` | Direct RPC `bash` / `abort_bash` / `bash_execution_update` as the execute card |
| Steer = `{type:"steer"}` (or idle-forbidden; see below) | Fake steer with `follow_up`, `prompt` without running turn, or Atmos queue |
| Host turn complete on `agent_settled` | Treat vendor `turn_end` / `agent_end` as Atmos `turn_completed` |
| Envelope `turn_id` = Atmos epoch | Persist Pi session/turn strings as Atmos `turn_id` |
| Answer dialog `extension_ui_request` with `extension_ui_response` | Inject `acp-adapter` `--extension` gate; invent ACP `session/request_permission` |
| Ignore `queue_update` for Atmos queue | Dual-write `queue.json` and Pi steering/follow-up arrays |
| Unknown `type` → skip or one `Unknown`; session continues | Panic / fail the Chat turn on extra frames |
| Unmapped `toolName` → `kind: other` | Hide the card; dual-write typed params + vendor sidecar |

## Architecture

```text
AgentChatService  →  PiNativeProvider
                       spawn.rs     pi --mode rpc   (NOT builtin -p)
                       codec.rs     LF JSONL  (not JSON-RPC)
                       rpc.rs       commands we send + pending id map
                       event_map.rs stdout event → AgentEventEnvelope
                       tool_map.rs  tool_execution_* → AgentTool
                       testdata/    recorded 0.84.4 frames (S19/S21/S23)

stdin  {type, id?, …}\n
stdout {type:"response", command, success, id?}  OR  async events
```

```mermaid
sequenceDiagram
  participant H as AgentChatService
  participant A as providers/pi
  participant P as pi --mode rpc
  H->>A: send(AgentPrompt)
  A->>P: {"id":"r1","type":"prompt","message":"..."}
  P-->>A: {"id":"r1","type":"response","command":"prompt","success":true}
  P-->>A: turn_start / message_* / tool_execution_*
  P-->>A: agent_settled
  A-->>H: envelopes (Atmos turn_id); TurnCompleted on settled
  H->>A: action(Steer)
  A->>P: {"id":"r2","type":"steer","message":"..."}
```

Copy from acp-adapter `client.go`: `pending: id → oneshot`, `writeJSON` = marshal + `'\n'`, read loop `ReadBytes('\n')` (not `Scanner` default / Node readline), classify `type=="response"` + `id` vs events, `get_state.sessionFile` as resume path, `set_model` split `provider`/`modelId`. **Do not copy:** `--extension` gate, ACP `session/*` remap, `follow_up` as queue, `new_session` as Chat create, host-initiated `bash`.

## Files

```text
crates/agent/src/providers/pi/
  mod.rs
  spawn.rs
  codec.rs
  rpc.rs
  event_map.rs
  tool_map.rs
  testdata/
    README.md          # CLI 0.84.4 + capture notes
    prompt-turn.jsonl
    steer.jsonl
    abort.jsonl
    tool-bash.jsonl
    extension-ui-confirm.jsonl
    framing-lf.jsonl
    unknown-event.jsonl
crates/core-service/.../acp_factory.rs   # "pi" → PiNativeProvider (runtime.md)
```

Public Chat API: `PiNativeProvider` via `providers::pi`. No Pi RPC types at `crates/agent/src/lib.rs` root.

## Spawn vs Terminal

| Path | Argv | Why |
|------|------|-----|
| Terminal APP-024 | `pi -p` (`resources/terminal-agents/builtin_agents.json` id `pi`) | One-shot print. **Do not change.** |
| Chat native | `pi --mode rpc` | Stateful host protocol. |

`spawn.rs`: resolve `cmd` the same way as today (PATH / provisioned binary). Ignore launch_spec.args and builtin `params`. `Command` cwd = chat cwd. `kill_on_drop(true)` like `acp_client/process.rs`. Stderr: debug log, not mixed into the JSONL codec.

Optional argv from `AgentRuntimeConfig` / descriptor `current_config`: `--provider`, `--model` (`provider/id` allowed per docs). Do **not** pass `--no-session` (resume needs a session file). Do **not** pass `--extension`. Do not start `--mode json` and “upgrade”.

After spawn, handshake (all with `id`):

1. `get_state` → `sessionFile` / `sessionId` / `model` / `thinkingLevel` / `isStreaming`
2. `get_available_models` → `supported_options.models`
3. `get_available_thinking_levels` → `supported_options.thinking` enum (docs: `["off"]` when the model has no reasoning)

`persistence_handle` = `sessionFile` (absolute jsonl path). Atmos `chat_id` is never that string. Emit `SessionStarted` once the handle is known.

`create_runtime`: spawn + handshake (no `switch_session`). `resume_runtime`: **new** process, then `switch_session` `{sessionPath}` from the handle. If `data.cancelled: true`, fail resume (do not pretend Chat `get` attached). Restore-without-spawn is the host (`get` must not call this).

`close`: drop stdin, then kill. Pi has no documented shutdown command. `next_event` yields `SessionClosed` then `None`.

## Framing (`codec.rs`) — S23

Protocol overview ([rpc](https://pi.dev/docs/latest/rpc)):

- Commands: JSON objects on **stdin**, one per line, required `type`, optional `id`.
- Responses: `{type:"response", command, success}` (+ `id` echo, `data` or `error`).
- Events: other JSON objects on **stdout**, generally **without** `id` (`bash_execution_update` is the exception and is unused by Chat).

```json
{"id":"r1","type":"prompt","message":"Hello"}
{"id":"r1","type":"response","command":"prompt","success":true}
{"type":"turn_start"}
```

Rules:

1. Write `serde_json::to_vec` + `b'\n'`. Mutex the stdin writer.
2. Read `read_until(b'\n')`. Strip one trailing `\r`. Skip empty lines. **Do not** use a Unicode line splitter.
3. Rust `BufRead::lines()` is acceptable (splits `\n` / `\r\n` only). Node `readline` is **not** a model — it also splits `U+2028`/`U+2029` inside JSON strings. Fixture S23 must include a JSON string containing `U+2028` that still parses as **one** record.
4. Always send `id` (`pi-rpc-{n}`). Correlate `type=="response"` by `id`. `success: false` → `error` string; do not wait for a second response for the same id (docs: post-accept failures are events).
5. `extension_ui_request` is **not** a response. Route it as an event even if it has `id`.
6. Unknown JSON / unknown `type`: log debug; omit or one `Unknown`; keep reading.

Stdout is a **mixed** stream. A correct classifier:

```text
parse object
  type == "response"  → complete pending[id]; if missing id, complete FIFO oldest pending whose command matches
  type == "extension_ui_request" → event_map (never pending)
  else → event_map
```

Do not treat `{id, method}` as a server JSON-RPC request. Pi never uses that shape.

## `rpc.rs` — pending map (copy this, not ACP)

Keep the same mechanics as acp-adapter `rpcSession`:

```rust
// conceptual — impl later
pending: HashMap<String, oneshot::Sender<RpcResponse>>;
next_id: AtomicU64;           // "pi-rpc-{n}"
write_lock: Mutex<()>;
is_streaming: AtomicBool;     // from get_state + events
steered_this_turn: AtomicBool;
pending_ui: HashMap<String, ExtensionUiKind>; // confirm | select | input | editor
```

`call(cmd)`: insert pending, write line, await response with a spawn-timeout (handshake 10s; prompt accept 5s). `prompt`/`steer`/`abort` **success means accepted**, not settled. Events continue on the read task → `next_event`.

Command bodies Chat actually writes (short):

```json
{"id":"pi-rpc-1","type":"get_state"}
{"id":"pi-rpc-2","type":"get_available_models"}
{"id":"pi-rpc-3","type":"get_available_thinking_levels"}
{"id":"pi-rpc-4","type":"set_model","provider":"anthropic","modelId":"claude-sonnet-4-20250514"}
{"id":"pi-rpc-5","type":"set_thinking_level","level":"high"}
{"id":"pi-rpc-6","type":"switch_session","sessionPath":"/Users/me/.pi/agent/sessions/abc.jsonl"}
{"id":"pi-rpc-7","type":"prompt","message":"list files","images":[{"type":"image","data":"<b64>","mimeType":"image/png"}]}
{"id":"pi-rpc-8","type":"steer","message":"only src/"}
{"id":"pi-rpc-9","type":"abort"}
```

`get_state` data we keep privately: `sessionFile`, `sessionId`, `model` (`id`/`provider`/`name`), `thinkingLevel`, `isStreaming`, `isCompacting`. Ignore `steeringMode` / `followUpMode` / `pendingMessageCount` for Atmos queue (do not sync them into `queue.json`).

Failed command:

```json
{"id":"pi-rpc-8","type":"response","command":"steer","success":false,"error":"Agent is not streaming"}
```

Map to `AgentActionError` / send error. Do not retry as `follow_up`.

## Runtime map

| Atmos | Pi RPC |
|-------|--------|
| `send` | `{type:"prompt", message, images?}`. Attachments → `ImageContent` `{type:"image", data, mimeType}`. If `isStreaming`, **do not** send `prompt` (host should have queued). Never set `streamingBehavior:"followUp"`. |
| `cancel` | `{type:"abort"}`. Stop means stop. If we already sent `steer` this host turn, send `{type:"clear_queue"}` **immediately before** `abort` so Pi does not continue leftover vendor steering (docs: abort continues queued messages). Discard `clear_queue.data` — **do not** write it to `queue.json`. |
| `action(Steer)` | `{type:"steer", message, images?}`. Not `prompt` + `streamingBehavior` unless `steer` fails closed and the process is streaming — then `{type:"prompt", streamingBehavior:"steer"}` is the documented equivalent. Never `follow_up`. |
| `action(SetConfig)` | `{type:"set_model", provider, modelId}` and/or `{type:"set_thinking_level", level}`. Split catalog id on first `/`. Refresh thinking levels after model change. No Chat `mode` picker (builtin `modes` empty). |
| `action(RespondPermission)` | `{type:"extension_ui_response", id, …}` matching the pending dialog (below). |
| `close` | kill process |

`send()` returns the **Atmos** `turn_id` from `AgentPrompt`. Official `turn_start` is `{"type":"turn_start"}` with **no** vendor turn id. Unlike Codex, Pi `steer` has no `expectedTurnId`. Do not invent a vendor turn map for steer. Store `atmos_turn_id` on the runtime for envelopes until `agent_settled`.

Prompt while streaming without `streamingBehavior` **errors** (docs). Host `send` is idle-only (`queue.json` → new turn). If `isStreaming` is true on `send`, return a provider error — do not auto-attach `streamingBehavior:"steer"` (that would steal Steer) and do not use `"followUp"`.

Images: only Chat image attachments. Read bytes from the APP-067 attachments dir; base64; `mimeType` from the file. Skip non-images (paths go in `message` text if the host already inlined them). Do not pass Atmos `chat_id` in the prompt.

## Events (`event_map.rs`)

Vendor turn ≠ Atmos turn. One `prompt` can emit several `turn_start`/`turn_end` (assistant + tools loops). Envelope `turn_id` stays the host epoch.

| Pi `type` | Atmos |
|-----------|--------|
| `turn_start` / `turn_end` | Omit as host turn boundaries. Optional: ignore. `turn_end.message` is not the live SOT. |
| `message_update` | Deltas only. `text_delta` → `AssistantMessageDelta`; `thinking_*` → `ThinkingDelta` / completed (fold; **not** a tool). `toolcall_*` = model proposing a call — **buffer args**, do not emit the execute card yet. Docs: no cumulative `message`; assemble with `contentIndex`; **`message_end.message` is authoritative**. |
| `message_start` | May open the assistant/thinking stream. |
| `message_end` | `AssistantMessageCompleted` (full text from `message`). Prefer this over concatenated deltas if they disagree. |
| `tool_execution_start\|update\|end` | `ToolCall*` via `tool_map.rs` |
| `agent_settled` | Host **turn complete** (`TurnCompleted`). Docs: no automatic retry, compaction retry, or queued continuation remains. |
| `agent_start` / `agent_end` | Omit (`agent_end` may precede retry/compaction). |
| `queue_update` | **Ignore** for Atmos queue SOT. Do not emit host `queue_updated`. |
| `extension_ui_request` | Dialog → `PermissionRequested`. Fire-and-forget → omit or status; **do not** wait for a response. |
| `compaction_*` / `auto_retry_*` / `summarization_*` | Status or omit. Not Chat actions. |
| `bash_execution_update` | Omit (host `bash` unused). |
| `extension_error` | One `Unknown` or `TurnFailed` if it kills the run; never panic. |
| other | Skip or `Unknown { event_type, payload }` |

Usage on `message_update.usage` → `UsageUpdated` when nonzero; do not dual-store on the assistant event.

`message_update` assembly (docs + `rpc-types.ts` `assistantMessageEvent`):

```json
{"type":"message_update","assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"Hello"}}
{"type":"message_update","assistantMessageEvent":{"type":"thinking_delta","contentIndex":1,"delta":"…"}}
{"type":"message_update","assistantMessageEvent":{"type":"toolcall_start","contentIndex":2,"id":"call_abc","toolName":"bash"}}
```

Per `contentIndex`, concatenate `*_delta`. On `text_end`, prefer `content` if present over the buffer. On `thinking_end`, emit `ThinkingCompleted`. On `toolcall_end`, keep `toolCall.{id,name,arguments}` until `tool_execution_start` with the same id. Host already throttles assistant snapshots (~100ms); adapter may still emit every delta.

Do **not** emit `TurnStarted` from Pi `turn_start` (host already wrote it on `send`). Do **not** emit `UserMessage` for the prompt we just sent.

## Tools (`tool_map.rs`)

Chat execute card = agent **tool** `bash` via `tool_execution_*`, not RPC `bash`.

`partialResult` is **accumulated** output (replace display; do not append). `toolCallId` correlates. Result text from `result.content[]` `type:text`. `isError` → `ToolCallFailed` / `result: Error`.

| `toolName` (case-insensitive) | Atmos `kind` | Params / result |
|-------------------------------|--------------|-----------------|
| `bash` | `execute` | `command` from `args`; output + optional exit from `details` if present else `Text`/`Execute.output` |
| `read` | `read` | `path` |
| `write` / `edit` | `edit` | `path`; diff stats if present else `Text` |
| `grep` / `find` / `ls` | `search` | `query` / `path` / `glob` via extractors; result `Text` (N1) |
| `web_search` / `websearch` | `web_search` | `query` + `extract_links` else `Text` |
| web fetch names (`web_fetch`, `webfetch`, `fetch` **url**) | `fetch` | `url` |
| skill / subagent names | `skill` / `subagent` | matching extractors |
| todo / plan | fold `PlanUpdated` | not a tool kind |
| thinking tool names | fold `Thinking*` | not a tool kind |
| else | `other` | `params`/`result` **are** `args` / `result` once |

`toolcall_end.toolCall` may prefill args; still start the card on `tool_execution_start` with the same `toolCallId` (one card). Drop unused vendor keys on mapped kinds.

Execute streaming example (S19):

```json
{"type":"tool_execution_start","toolCallId":"call_abc","toolName":"bash","args":{"command":"ls -la"}}
{"type":"tool_execution_update","toolCallId":"call_abc","toolName":"bash","args":{"command":"ls -la"},"partialResult":{"content":[{"type":"text","text":"total 48\n"}]}}
{"type":"tool_execution_end","toolCallId":"call_abc","toolName":"bash","isError":false,"result":{"content":[{"type":"text","text":"total 48\nREADME.md\n"}]}}
```

Maps to `ToolCallStarted { kind: execute, params.command: "ls -la" }` → `Updated` (replace output) → `Completed` `{ result: { type: "execute", output: "total 48\nREADME.md\n", exit_code: null } }`. Fill `exit_code` only when `details` has it.

`fetch` vs `search`: a tool named `fetch` **with** `args.url` is `fetch`; `find`/`grep` stay workspace `search` even if the query looks like a URL.

## Permission — extension UI only (S21)

Pi has **no** `can_use_tool`. Official RPC: extensions call `ctx.ui.confirm/select/input/editor` → stdout `extension_ui_request`, block until stdin `extension_ui_response` with the **same** `id`. Fire-and-forget (`notify`, `setStatus`, `setWidget`, `setTitle`, `set_editor_text`) do not expect a reply.

```json
{"type":"extension_ui_request","id":"uuid-2","method":"confirm","title":"Allow bash?","message":"ls -la"}
{"type":"extension_ui_response","id":"uuid-2","confirmed":true}
```

Map:

| `method` | Host | Response |
|----------|------|----------|
| `confirm` | permission (allow/deny) | `{confirmed: true\|false}` or `{cancelled: true}` |
| `select` | permission options = `options[]` | `{value: "<option>"}` or `{cancelled: true}` |
| `input` / `editor` | permission/question if Chat already has prompt chrome; else one `Unknown` **and still answer** (`cancelled` or empty `value`) so the process does not stall | `{value}` / `{cancelled:true}` |
| notify / setStatus / setWidget / setTitle / set_editor_text | omit or status | **no** stdin reply |

`RespondPermission.request_id` = request `id`. Do not translate to ACP option ids on the wire.

**MUST NOT** ship `gate_extension.go` behavior: writing a temp `--extension` that intercepts `bash`/`write`/`edit` and re-encodes ACP `session/request_permission`. That is the ACP façade. Native Chat only answers what Pi actually asks.

Timeouts: agent auto-resolves; client does not track them.

Pending UI state is adapter-private. If the process dies, drop pending; host already times out the permission card. If Chat deny maps to confirm, send `confirmed: false` (docs: cancel on confirm → extension sees `false`).

Select example:

```json
{"type":"extension_ui_request","id":"uuid-1","method":"select","title":"Permission","options":["Allow","Deny"]}
{"type":"extension_ui_response","id":"uuid-1","value":"Allow"}
```

`option_id` from the host is the option string itself (or `allow`/`deny` mapped onto `confirmed` for `confirm`).

## Descriptor honesty

`capabilities_for_provider("pi")`: steer **Supported**, resume **Supported**, permission **Supported**, configure **Supported**.

Thinking enum from RPC + catalog builtin (`off|minimal|low|medium|high|xhigh`); include `max` when `get_available_thinking_levels` returns it. Empty models → omit picker (M3), still `configure: Supported`.

## Queue vs vendor queue

`~/.atmos/data/agent/chats/{chat_id}/queue.json` is the only follow-up queue. Dispatch → new host turn → `send`/`prompt` while **idle**.

Pi `follow_up` / `set_follow_up_mode` / `queue_update.followUp` are **not** Atmos queue. Do not enqueue twice. Steer is `action(Steer)` while the host turn is running.

`queue_update` example — parse so S22 does not crash, then drop:

```json
{"type":"queue_update","steering":["Focus on error handling"],"followUp":["Summarize"]}
```

## Security

Stdio only (no vendor HTTP). Session jsonl under Pi’s `sessionFile` may contain prompts and tool output — do not log frames at info. Handshake must not print `images.data`. Catalog argv stays spec-owned; never interpolate user text into the spawn vector. `switch_session.sessionPath` is the handle we persisted, not a client-supplied path from the web app.

## Slice rollout

1. Codec + pending map + fixture README (S23 green; no spawn).
2. `event_map` / `tool_map` from recorded JSONL (S19/S22).
3. Permission dialect (S21) + descriptor handshake (`get_available_*`).
4. `spawn.rs` + factory route `pi` → native (S24). Kill ACP Chat path for `pi` / `pi-acp` aliases ([acp-adapter.md](./acp-adapter.md)).
5. Manual live: steer visible, queue follow-up still Atmos, Terminal `-p` unchanged.

## Tests (this slice)

`cargo test -p agent` under `providers/pi`. Live `pi` binary is **manual**; CI uses recorded JSONL.

| TEST.md | Fixture | Signals |
|---------|---------|---------|
| **S19** | `prompt` + `steer` + `abort` + `message_update` + `tool_execution_*` | `{type:"steer"}` encoded; bash → `execute` from `tool_execution_*`; **no** `follow_up` line on Atmos queue dispatch; `agent_settled` → turn complete; `turn_end` does not |
| **S21** | `extension_ui_request` `confirm` | `PermissionRequested`; `RespondPermission` writes `extension_ui_response` `{confirmed}` with matching `id`; no gate extension argv |
| **S23** | LF records; payload contains `U+2028` | one JSON value; not split. Classify `response` vs event. Reject a JSON-RPC `{jsonrpc,method,id}` as a command encoder output |
| S22 | extra unknown `type` | session continues |
| S24 | routing | `pi` → native; Terminal still `-p` |

Also: `set_model` splits `anthropic/claude-sonnet-4-20250514`; `switch_session` on resume; `queue_update` does not touch `queue.json`; RPC `bash` command is never emitted by `send`/`Steer`.

## Risks

- **Tradeoff: RPC CLI vs SDK.** SDK is the Node happy path ([sdk](https://pi.dev/docs/latest/sdk) “RPC Mode Alternative”). Atmos host is Rust and must not wrap TypeScript. RPC is the published subprocess protocol.
- **Tradeoff: no injected gate.** Fewer prompts than acp-adapter; honesty with the native wire. Users who need bash approval rely on Pi extensions / trust settings (`defaultProjectTrust`, `--approve`), not a Chat-invented ACP gate.
- **Risk: `abort` continues vendor queued steer.** Mitigate with `clear_queue` only as a cancel flush; never as Atmos queue API.
- **Risk: protocol drift.** Fixtures + pin 0.84.4; unknown `type` must not kill the session.
- **If this breaks:** Terminal `pi -p` unchanged; Chat `pi` can stay ACP only until fixtures are green — do not ship a hybrid ACP+RPC path for the same id.

## Dependencies

- User-installed `pi` binary. Not a Node SDK in Atmos Server. Not `beyond5959/acp-adapter` on the Chat path.
- Blocks nothing else in APP-068; lands after domain types (implementation order in [README.md](./README.md)).
- N4 (`fork` / `compact` as Chat actions) stays deferred.
