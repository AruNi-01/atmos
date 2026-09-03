# TEST · APP-068: Agent Chat Architecture Optimize

> Test Plan · verify Atmos descriptor, small runtime, event envelope, tool contract, and native protocol adapters for Claude Code, Codex, OpenCode, and Pi. References PRD APP-068, TECH APP-068, and [reference/](./reference/README.md).

## Test strategy

- **Rust unit** owns descriptor merge, `AgentAction` unsupported behavior, ACP/generic `tool_map` (execute, web_search, fetch, other fallback), native codec/event/tool maps from recorded vendor fixtures, and new jsonl fold. No old-jsonl reader tests.
- **Rust service** (`cargo test -p core-service --lib agent_chat`) owns persist/fold of `AgentTool` params/result, meta.descriptor, steer still gated by capability, restore without spawn, provider routing (`claude`/`codex`/`opencode`/`pi` → native).
- **api-types extract** owns DTO/contract rows for `descriptor` / tool `params`/`result`.
- **Bun tests** own composer visibility (thinking/steer/modes from descriptor), tool cards rendering params (no vendor classifier on live fixtures), and “no ACP schema in client”.
- **Playwright** is optional smoke: two catalog stubs is enough in unit/bun; live dual-agent tool cards stay manual.
- **agent-browser** explores composer empty-option groups and a generic `other` tool card. Not a substitute for mapper tests.
- **Manual**: Claude Code + Codex native turns — execute + read + web_search + fetch cards; Pi steer visible; Claude Code steer hidden; unknown tool still visible.
- **Live CLI spawn** is manual. Native correctness is gated by recorded-fixture unit tests (S17–S23), not by requiring `claude`/`codex`/`opencode`/`pi` on CI agents.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2 |
| M2 | S3, S4 |
| M3 | S2, S5 |
| M4 | S6 |
| M5 | S3, S7 |
| M6 | S8 |
| M7 | S8, S9 |
| M8 | S10, S11, S16 |
| M9 | S10, S16 |
| M10 | S12 |
| M11 | S9 |
| M12 | S13 |
| M13 | S14 |
| M14 | S15 |
| M15 | S17, S18, S19, S20, S24 |
| M16 | S17, S18, S19, S20, S21, S22, S23 |
| N1–N5 | deferred |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Rust | `cargo test` | `cargo test -p agent descriptor` | catalog + live configOptions | one `AgentDescriptor`; no ACP snapshot on the struct | planned |
| S2 | Bun | `bun test` | composer option tests | descriptor with/without thinking and modes | thinking control omitted when `thinking: none` | planned |
| S3 | Rust | `cargo test` | `AgentAction::Steer` on unsupported ACP | generic ACP `steer: Unsupported` | `Unsupported`; no second `session/prompt` | planned |
| S4 | Rust | `cargo test` | capabilities struct | fixture | no fork/compact fields | planned |
| S5 | Rust | `cargo test` | catalog merge | models without thinking | `supported_options.thinking` is `None` | planned |
| S6 | Rust + WS | `cargo test` | configure + meta | set model | `current_config.model` matches; picker not reading raw options list | planned |
| S7 | Rust | `cargo test` | send/cancel still on core trait | runtime stub | send/cancel work without capability flags | planned |
| S8 | Rust | `cargo test` | event_map | ACP tool_use fixture | Atmos `ToolCall*`; no `source` sidecar | planned |
| S9 | Rust + Bun | `cargo test`, `bun test` | unknown tool name | weird vendor JSON | `kind: other`, params/result = vendor values, one generic card | planned |
| S10 | Rust | `cargo test` | tool_map Claude bash + Codex command | two fixtures | both `params: Execute { command }` | planned |
| S11 | Rust | `cargo test` | think/todo fold | think tool + TodoWrite | thinking/plan events, not tool kind | planned |
| S12 | Bun | `bun test` | import/lint guard | `apps/web/src/features/agent` live path | no vendor `classifyTool` / background-command adapters as SOT | planned |
| S13 | Rust | `cargo test` | get new jsonl | envelope with `params`/`result` | snapshot has those fields; no `input`/`output`/`native`; no spawn | planned |
| S14 | Rust | `cargo test` | APP-067 gates | restore, queue, steer match, permission | existing agent_chat tests still pass | planned |
| S15 | api-types | `bun test` | `@atmos/api-types` | extract + contract | still `agent_chat_*`; no new REST | planned |
| S16 | Rust + Bun | `cargo test`, `bun test` | web_search + fetch maps | vendor web_search / webfetch fixtures | `kind: web_search` with links; `kind: fetch` with url/body; UI renders from result | planned |
| S17 | Rust | `cargo test` | `providers/codex` codec + maps | recorded app-server JSONL (turn/start, item/commandExecution, webSearch, requestApproval, turn/steer) | execute/web_search/fetch/edit; steer supported; omit `jsonrpc` | planned |
| S18 | Rust | `cargo test` | `providers/claude` codec + maps | recorded stream-json + `can_use_tool` | Bash→execute; WebSearch/WebFetch; permission event; steer unsupported | planned |
| S19 | Rust | `cargo test` | `providers/pi` codec + maps | recorded `--mode rpc` JSONL | `steer` maps; tools from `tool_execution_*`; no Atmos queue via `follow_up` | planned |
| S20 | Rust | `cargo test` | `providers/opencode` codec + maps | recorded SSE + `/doc` shapes | prompt_async path; permission.asked; steer unsupported; HTTP/1.1 note in spawn | planned |
| S21 | Rust | `cargo test` | Codex/Claude/OpenCode/Pi permission answer | matching request fixtures | adapter emits Atmos permission then writes the vendor response dialect | planned |
| S22 | Rust | `cargo test` | unknown vendor method/event | extra frame in fixture | session continues; skip or one Unknown; no panic | planned |
| S23 | Rust | `cargo test` | framing | Codex without jsonrpc; Pi LF-only; Claude mixed control; OpenCode SSE `data:` | parse succeeds; Node-readline split is not used for Pi | planned |
| S24 | Rust | `cargo test` | provider routing | ids claude/codex/opencode/pi vs grok | four native; grok ACP; Terminal builtin params unused by Chat spawn | planned |
| S17 | Rust | `cargo test` | `providers/codex` codec + maps | recorded app-server JSONL | execute/fileChange/webSearch; steer requires `expectedTurnId`; approvals are server requests | planned |
| S18 | Rust | `cargo test` | `providers/claude` codec + maps | recorded stream-json | Bash/Read/WebSearch/WebFetch; `can_use_tool` → permission; steer unsupported | planned |
| S19 | Rust | `cargo test` | `providers/pi` codec + maps | recorded `--mode rpc` JSONL | prompt/steer/abort; tool_execution → execute; no Atmos queue via `follow_up` | planned |
| S20 | Rust | `cargo test` | `providers/opencode` maps | recorded SSE + `/doc` shapes | prompt_async + part.updated; permission.asked; steer unsupported | planned |
| S21 | Rust | `cargo test` | Codex approval reply | `item/commandExecution/requestApproval` fixture | adapter answers JSON-RPC request; turn does not stall | planned |
| S22 | Rust | `cargo test` | unknown vendor method/event | extra frame in each fixture set | session continues; skip or one `Unknown`; no panic | planned |
| S23 | Rust | `cargo test` | framing | Codex without `jsonrpc`; Pi LF-only; Claude mixed control | parsers accept official wire, reject wrong framing | planned |
| S24 | Rust | `cargo test` | spawn routing | provider_id claude/codex/opencode/pi vs grok | native vs ACP; Terminal catalog argv unchanged | planned |

## Scenarios

### S1 — Descriptor is the merged product surface

- **Level**: Rust
- **Given**: catalog models/thinking and an ACP session that advertises config options.
- **When**: the provider builds `AgentDescriptor`.
- **Then**: identity, capabilities, supported_options, and current_config are populated. ACP `AgentCapabilitiesSnapshot` is not on the descriptor.
- **Signals**: struct fields; test asserts no `session_list` leak.
- **Coverage Status**: ✅ `crates/agent/src/domain/descriptor.rs::s1_descriptor_is_merged_product_surface` (+ `config_changed_emits_atmos_current_config`)

### S2 — Composer omits unsupported options

- **Level**: Bun
- **Given**: descriptor A with enum thinking; descriptor B with `thinking: none` and empty modes.
- **When**: the composer renders.
- **Then**: A shows thinking; B does not show thinking or mode controls.
- **Signals**: component tests; no fake defaults.
- **Coverage Status**: ✅ bun `agent-chat-thread.test.ts` S2/S6, `agent-prompt-composer.test.ts` S2, `packages/ui` `prompt-input-view.test.ts` S2

### S3 — Steer is capability-gated

- **Level**: Rust
- **Given**: runtime with `capabilities.steer = Unsupported`.
- **When**: host dispatches `AgentAction::Steer`.
- **Then**: `Unsupported`; adapter does not send a prompt. Queue/cancel still succeed.
- **Signals**: error type; no ACP prompt call.
- **Coverage Status**: ✅ `testing.rs::s3_s7_fake_send_and_cancel_without_steer_prompt`, `acp/adapter.rs::steer_action_is_unsupported_without_second_prompt`, `tests.rs::s11_steer_unsupported_or_stale_does_not_cancel`

### S4 — Capability set stays closed

- **Level**: Rust
- **Given**: `AgentCapabilities`.
- **When**: inspected by test.
- **Then**: fields are steer, resume, permission, configure only.
- **Signals**: compile-time / explicit field list assertion.
- **Coverage Status**: ✅ `descriptor.rs::s4_capabilities_serde_is_exactly_four_snake_case_fields`

### S5 — Options honesty

- **Level**: Rust
- **Given**: catalog with models and no thinking support.
- **When**: descriptor is built.
- **Then**: models present; thinking is `None`.
- **Signals**: `AgentThinkingSupport::None`.
- **Coverage Status**: ✅ `crates/agent/src/domain/descriptor.rs::s5_supported_options_omits_thinking_when_none`

### S6 — Current config is explicit

- **Level**: Rust + WS
- **Given**: a chat; user configures model.
- **When**: `agent_chat_configure` succeeds.
- **Then**: `meta.descriptor.current_config.model` updates. Client picker is not driven by `session_config_options`.
- **Signals**: meta JSON; web test does not read leaked option bags.
- **Coverage Status**: ✅ `core-service .../tests.rs::s6_configure_sets_model_before_spawn` + `apps/api .../agent_chat.rs::meta_wire_omits_persist_only_and_legacy_keys` + web S2/S6 helper

### S7 — Core runtime stays small

- **Level**: Rust
- **Given**: a stub runtime.
- **When**: `send` and `cancel` are called.
- **Then**: they work without capability flags.
- **Signals**: trait methods exist; test does not check `capabilities.send`.
- **Coverage Status**: ✅ `crates/agent/src/testing.rs::s3_s7_fake_send_and_cancel_without_steer_prompt` (send + cancel; no `capabilities.send`)

### S8 — Events are Atmos kinds only

- **Level**: Rust
- **Given**: an ACP `tool_call` update.
- **When**: `event_map` runs.
- **Then**: envelope `event` is Atmos `ToolCallStarted/Completed`. There is no parallel native `source` payload on that event.
- **Signals**: mapped fixture.
- **Coverage Status**: ✅ `crates/agent/src/providers/acp/event_map.rs::s8_tool_call_maps_to_agent_tool_envelope` (no `source` sidecar)

### S9 — Unknown tool is one generic card

- **Level**: Rust + Bun
- **Given**: tool name `vendor_mystery` with opaque JSON input/output.
- **When**: mapped and rendered.
- **Then**: `kind: other`, `params`/`result` are those vendor values (once), transcript shows one tool-call card with params and result. Not hidden. No extra `native` field.
- **Signals**: mapper test + part view test.
- **Coverage Status**: ✅ `providers/acp/tool_map.rs::s9_unknown_tool_is_other_with_vendor_value_once` + `apps/web/.../agent-tool-other-card.test.ts`

### S10 — Execute params unify across vendors

- **Level**: Rust
- **Given**: Claude `bash` input and Codex/Grok command-style input with the same command string.
- **When**: `tool_map` runs.
- **Then**: both yield `AgentToolParams::Execute { command, .. }`.
- **Signals**: fixture equality on `command`.
- **Coverage Status**: ✅ `providers/acp/tool_map.rs::s10_execute_unifies_bash_shapes` + Claude `exact_claude_names_map_kinds` + Codex `maps_execute_edit_web_search_and_fetch`

### S11 — Think/plan are not tools

- **Level**: Rust
- **Given**: ACP think tool and todo-write payload.
- **When**: adapter maps the session update.
- **Then**: thinking/plan events (or hide), not `AgentToolKind::Other` cards for those names.
- **Signals**: `AgentEvent::ThinkingDelta` / `PlanUpdated`.
- **Coverage Status**: ✅ `providers/acp/tool_map.rs::s11_think_and_plan_fold_before_tool_event`

### S12 — Web live path does not classify vendors

- **Level**: Bun
- **Given**: agent-chat live modules after rollout step 5.
- **When**: tests/guards run.
- **Then**: no ACP schema imports; live tool rendering does not call vendor `classifyTool` or `background-command/adapters/*` as SOT.
- **Signals**: existing ACP-import guard plus a fixture part with only `params`.
- **Coverage Status**: ✅ `apps/web/.../no-acp-schema.test.ts` (bans `classifyTool(` and `background-command/adapters`)

### S13 — New history has no untyped Atmos input/output

- **Level**: Rust
- **Given**: a chat whose transcript is the new envelope.
- **When**: `agent_chat_get` runs.
- **Then**: tool parts expose `params` / `result`; they do not expose `input`/`output`/`content`/`native`. Provider spawn is not called.
- **Signals**: snapshot JSON; runtime map empty.
- **Coverage Status**: ✅ `core-service .../tests.rs::s13_get_new_jsonl_exposes_params_result_without_spawn` + `s4_get_does_not_spawn_provider`

### S14 — APP-067 behavior still holds

- **Level**: Rust
- **Given**: existing `agent_chat` tests (restore, queue, steer turn match, permission vs queue).
- **When**: this spec's domain types ship.
- **Then**: those tests remain green.
- **Signals**: `cargo test -p core-service --lib agent_chat`.
- **Coverage Status**: ✅ `cargo test -p core-service --lib agent_chat` — 94 passed (2026-09-01)

### S15 — Wire stays main `/ws`

- **Level**: api-types
- **Given**: extract catalog.
- **When**: contract is updated.
- **Then**: actions remain `agent_chat_*` + `agent_model_catalog_get`; no REST conversation API.
- **Signals**: `WsContract` rows; check-actions.
- **Coverage Status**: ✅ `packages/api-types/src/ws/dto/agent-chat.test.ts` + `bun run --filter @atmos/api-types test`

### S16 — Web search and web fetch are first-class

- **Level**: Rust + Bun
- **Given**: vendor payloads for web search (query + links) and web fetch (url + body), plus a workspace grep that must stay `search`.
- **When**: `tool_map` runs and the tool card renders.
- **Then**: web search is `web_search` with `params.query` and `result.links`; fetch is `fetch` with `params.url` and `result` title/body; grep is not classified as `web_search`.
- **Signals**: fixture equality; card test reads `result`.
- **Coverage Status**: ✅ ACP `s16_web_search_is_not_workspace_search` / `s16_web_fetch_maps_url` + `parse-tool-result.test.ts` S16

### S17 — Codex app-server native map

- **Level**: Rust
- **Given**: recorded `codex app-server` frames: `initialize` handshake, `turn/start`, `item/started` `commandExecution` / `fileChange` / `webSearch`, `item/commandExecution/requestApproval`, `turn/steer`.
- **When**: `providers/codex` codec + event/tool maps run.
- **Then**: execute/edit/web_search (search) / fetch (openPage) are Atmos tools; `capabilities.steer` is supported; wire messages omit `"jsonrpc":"2.0"`; server requests are classified as requests (have `id` + `method`).
- **Signals**: fixture equality; steer action encodes `expectedTurnId` from the vendor turn, not Atmos `turn_id`.
- **Coverage Status**: ✅ `cargo test -p agent` `providers/codex` codec/event_map/tool_map/rpc/permission (recorded JSONL)

### S18 — Claude Code stream-json native map

- **Level**: Rust
- **Given**: recorded duplex stream-json including `system/init`, `assistant` `tool_use` Bash/Read/WebSearch/WebFetch, `tool_result`, `control_request` `can_use_tool`.
- **When**: `providers/claude` maps run.
- **Then**: tools match the matrix; permission is emitted; `capabilities.steer` is supported (Steer writes a second stdin user line on the same turn).
- **Signals**: fixture equality; no Codex-style steer RPC invented.
- **Coverage Status**: ✅ `cargo test -p agent` `providers/claude` event_map/tool_map/rpc (`turn_bash_web`, `can_use_tool`, steer stdin user)

### S19 — Pi `--mode rpc` native map

- **Level**: Rust
- **Given**: recorded Pi RPC `prompt` / `steer` / `abort` responses plus `message_update` and `tool_execution_*` events.
- **When**: `providers/pi` maps run.
- **Then**: steer is supported and encodes `{type:"steer"}` (or prompt + `streamingBehavior`); tools map from `toolName`/`args`; Atmos queue is not written as Pi `follow_up`.
- **Signals**: fixture equality; framing splits on `\n` only.
- **Coverage Status**: ✅ `cargo test -p agent` `providers/pi` codec/event_map/rpc (`framing_lf`, steer, no `follow_up`)

### S20 — OpenCode serve HTTP+SSE native map

- **Level**: Rust
- **Given**: recorded `GET /event` SSE (`server.connected`, `message.part.updated`, `permission.asked`, `session.idle`) and OpenAPI prompt_async/permission shapes.
- **When**: `providers/opencode` maps run.
- **Then**: parts become Atmos events/tools; permission reply path is session-scoped; `capabilities.steer` is supported (`delivery:"steer"`).
- **Signals**: fixture equality; spawn helper uses HTTP/1.1 and `127.0.0.1`.
- **Coverage Status**: ✅ `cargo test -p agent` `providers/opencode` (`s20_maps_text_tool_permission_and_idle`, spawn HTTP/1.1)

### S21 — Permission dialects stay in the adapter

- **Level**: Rust
- **Given**: one permission fixture per native protocol (Claude `can_use_tool`, Codex `requestApproval`, OpenCode `permission.asked`, Pi `extension_ui_request` confirm).
- **When**: host `RespondPermission` runs.
- **Then**: each adapter writes that vendor’s response shape. Chat still has one permission control.
- **Signals**: golden stdin/HTTP bodies.
- **Coverage Status**: ✅ Claude `permission_allow_matches_golden_and_rejects_allowed`; Codex `command_approval_accept_writes_decision_without_jsonrpc`; OpenCode `permission_once_posts_session_scoped_response_once`; Pi `permission_confirm_writes_extension_ui_response`

### S22 — Unknown vendor frames do not kill the session

- **Level**: Rust
- **Given**: a valid turn fixture plus one unknown method/event.
- **When**: the codec reads the stream.
- **Then**: mapped events still apply; unknown is skipped or one `Unknown`; no panic / session error.
- **Signals**: remaining events parsed.
- **Coverage Status**: ✅ Claude `mixed_control_unknown_and_error_do_not_abort`; Codex `fixture_maps_tools_thinking_plan_and_omits_unknown`; OpenCode `s22_unknown_frame_does_not_kill_the_turn`; Pi `unknown_and_queue_update_do_not_kill_session`

### S23 — Framing must match the published wire

- **Level**: Rust
- **Given**: Codex JSON-RPC without `jsonrpc`; Pi JSONL commands; Claude NDJSON with interleaved `control_request`; OpenCode SSE `data:` lines.
- **When**: each codec parses.
- **Then**: classification matches TECH (Codex server-request vs notification; Pi is not JSON-RPC).
- **Signals**: unit tests on raw bytes.
- **Coverage Status**: ✅ Codex `framing-no-jsonrpc` + `encoder_omits_jsonrpc_key`; Pi `framing_lf_*`; Claude `mixed_control_*`; OpenCode SSE `fixture_sse_yields_one_envelope_per_event`

### S24 — Chat spawn routing vs Terminal catalog

- **Level**: Rust
- **Given**: provider ids `claude`, `codex`, `opencode`, `pi`, and one ACP agent (e.g. Grok).
- **When**: Chat starts a runtime.
- **Then**: the four use native providers; the other uses ACP. Builtin Terminal `params` (`claude --print`, `codex exec --json`, …) are not the Chat spawn argv.
- **Signals**: provider type assertion; Terminal catalog tests still pass.
- **Coverage Status**: ✅ `providers/mod.rs::s24_*` + `core-service .../acp_factory.rs::s24_*`; Chat argv tests omit Terminal `--print` / `exec --json`. Terminal catalog suite not re-run in this targeted pass.

## Exploratory agent-browser checks

- New Chat composer: agent without thinking — no thinking control; agent with thinking — control present.
- Transcript: generic `other` tool is one card with vendor params + result; execute card shows command from params; web search shows links; fetch shows URL.
- No obvious console errors while a stub event stream paints tools.

If `agent-browser` is unavailable, record `not_run` in Coverage Status.

## Regression checklist

- APP-067 restore ≠ spawn.
- Queue / steer / stop / permission rules.
- Catalog prefetch worker still not an APP-051 interval.
- Terminal APP-024 catalog façade still functions (shared engine). Chat native spawn must not rewrite Terminal argv.

## Acceptance criteria

- All Must Have scenarios S1–S24 have an executable owner (Rust/Bun/api-types) except dual-live-agent visual smoke (manual).
- Web live path no longer owns vendor tool classification.
- Descriptor-driven composer never fakes thinking or steer.
- Claude / Codex / OpenCode / Pi Chat path is native-mapped from fixtures, not ACP.

## Manual verification steps

1. New Chat with an agent that has no thinking probe — control absent.
2. New Chat with an agent that has thinking — control present; first send uses it.
3. Run execute / web_search / fetch on Claude Code and Codex native chats — cards show command, links, or URL from Atmos params/result. Pi shows Steer; Claude Code does not.
4. Force an unknown tool (fixture or odd agent) — one generic tool-call card with params and result as sent.
5. Permission prompt on Codex command approval and Claude `can_use_tool` — one Atmos permission chrome; answering continues the vendor turn.

## Non-coverage

- Pixel parity with Claude/Codex official UIs.
- N1 workspace grep hit lists / file trees.
- Additional native providers beyond Claude / Codex / OpenCode / Pi (N3: Gemini, Cursor, Grok, …).
- Fork/rewind/compact (N4).
- Mobile / CLI clients (N5).

## Coverage Status

_Last run: 2026-09-01 (Wave 11 re-run) · targeted Rust/Bun green. Playwright optional smoke not run. Live CLI spawn manual. agent-browser not_run._

- S1 — ✅ `crates/agent/src/domain/descriptor.rs::s1_descriptor_is_merged_product_surface`
- S2 — ✅ bun composer/thread/prompt-input (descriptor A enum thinking vs B `none` + empty modes)
- S3 — ✅ `testing.rs::s3_s7_fake_send_and_cancel_without_steer_prompt` + ACP `steer_action_is_unsupported_without_second_prompt`
- S4 — ✅ `descriptor.rs::s4_capabilities_serde_is_exactly_four_snake_case_fields`
- S5 — ✅ `descriptor.rs::s5_supported_options_omits_thinking_when_none`
- S6 — ✅ `tests.rs::s6_configure_sets_model_before_spawn` + `api .../agent_chat.rs::meta_wire_omits_persist_only_and_legacy_keys` + web S2/S6
- S7 — ✅ same fake runtime: send + cancel without capability flags
- S8 — ✅ `providers/acp/event_map.rs::s8_tool_call_maps_to_agent_tool_envelope`
- S9 — ✅ ACP `s9_unknown_tool_is_other_with_vendor_value_once` + `agent-tool-other-card.test.ts`
- S10 — ✅ ACP `s10_execute_unifies_bash_shapes` + Claude Bash + Codex commandExecution
- S11 — ✅ ACP `s11_think_and_plan_fold_before_tool_event`
- S12 — ✅ `no-acp-schema.test.ts`
- S13 — ✅ `tests.rs::s13_get_new_jsonl_exposes_params_result_without_spawn` (no spawn)
- S14 — ✅ `cargo test -p core-service --lib agent_chat` — 94 passed
- S15 — ✅ `packages/api-types/src/ws/dto/agent-chat.test.ts` via `bun run --filter @atmos/api-types test`
- S16 — ✅ ACP s16 web_search/fetch + `parse-tool-result.test.ts` S16
- S17 — ✅ `cargo test -p agent` `providers/codex` recorded fixtures
- S18 — ✅ `cargo test -p agent` `providers/claude` recorded fixtures
- S19 — ✅ `cargo test -p agent` `providers/pi` recorded fixtures
- S20 — ✅ `cargo test -p agent` `providers/opencode` recorded fixtures
- S21 — ✅ permission goldens (Claude stdin, Codex JSON-RPC result, OpenCode HTTP body, Pi `extension_ui_response`)
- S22 — ✅ unknown-frame tests per native + ACP
- S23 — ✅ Codex no-`jsonrpc`, Pi LF, Claude mixed control, OpenCode SSE `data:`
- S24 — ✅ `chat_provider_kind` + `acp_factory` native vs ACP; Chat spawn argv ≠ Terminal catalog. Terminal APP-024 suite not re-run here.
- Dual-live-agent visual smoke — ⏸ manual (TEST.md)
- Live CLI spawn (`claude`/`codex`/`opencode`/`pi`) — ⏸ manual
- Playwright optional smoke — ⏸ not run (TEST.md optional; unit/bun sufficient)
- Exploratory agent-browser — ⏸ `not_run`: CLI 0.26.0 is installed (`agent-browser doctor --offline --quick` 7 pass), but local Chat UI (`just dev-web` / API) was not running, so composer/transcript exploratory checks were not executed.
- Known flake (did not reproduce this run): `get_projects_live_turn_timing_from_server_clock` — do not change production for clock flake.

Commands this run:

```bash
cargo test -p agent --offline                         # 195 passed (Wave 11 re-run)
cargo test -p core-service --lib agent_chat --offline # 94 passed
cargo test -p api --bin api meta_wire --offline       # 1 passed
bun run --filter @atmos/api-types test                # 22 passed (includes AgentChatEvent.turn_id)
cd apps/web && bun test <S4 file list + other-card>   # 85 passed
cd packages/ui && bun test src/components/agents/prompt-input-view.test.ts  # 14 passed
```
