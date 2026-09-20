# PROGRESS · APP-068: Agent Chat Architecture Optimize

> Implementation Progress · current state, handoff notes, blockers, and verification status. This file is not a requirements source.

## Status

- **State**: long-task Done (slices S0–S14 + TEST.md Must Have)
- **Branch**: main (uncommitted)
- **Last updated**: 2026-09-01
- **Current owner**: 主 Agent
- **Current phase**: Planned slices all `done`. Architecture REV-001–005 verified. TEST.md Must Have S1–S24 executable owners green after Wave 11 re-run. Live CLI / dual-agent visual / Playwright / agent-browser remain TEST.md manual/optional, not a Must Have gate.

## Snapshot

- **Done**: S0–S14 (slice review pass) + TEST.md S1–S24 unit mapping + architecture review + Wave 11 fixes + Wave 11 regression re-run.
- **Not done (HUMAN / optional)**: commit; Live CLI spawn; dual-agent visual; agent-browser; Playwright optional smoke.
- **Blocked**: none
- **Must not touch from parent**: `crates/`, `apps/`, `packages/` feature code. Only this kanban.

## Implementation Checklist

- [x] Wave 0 — agent domain types on disk (`cargo test -p agent`)
- [x] Wave 1 — trait migration + ACP adapter (agent crate)
- [x] Wave 2 — core-service persist / meta.descriptor / fold
- [x] Wave 3 — WS DTOs (`agent_chat_*` names unchanged)
- [x] Wave 4 — web composer + tool cards; delete client classifiers
- [x] Wave 5–8 — native Codex, Claude, Pi, OpenCode (fixtures then spawn)
- [x] Wave 9 — provider routing glue
- [x] Wave 10 — packages/ui thinking control visible when one option (M3)
- [x] Hand off `atmos-specs-test-run`
- [x] `atmos-specs-test-run` executed (TEST.md Coverage Status 2026-09-01)
- [x] Wave 11 — REVIEW.md REV-001–005 (alias capabilities, crate-root natives, WS turn_id, dead probes)

## Slice Kanban

> Orchestration board for `atmos-long-task-impl`. Not a requirements source.

| ID | Wave | Owns | Forbids | Depends | Status | Impl | Review | Verify |
|----|------|------|---------|---------|--------|------|--------|--------|
| S0 | 0 | `crates/agent/src/domain/**`, `crates/agent/src/lib.rs` | ACP adapter, core-service, api-types, web, natives, `PROGRESS.md` | — | done | ok | pass | `cargo test -p agent` |
| S1 | 1 | `session.rs`, `event.rs`, `testing.rs`, `lib.rs`, `providers/acp/**`, plus barrel `domain/mod.rs` and `descriptor.rs` crate-root caps test (parent D2) | core-service, api-types, web, natives, acp_client JSON-RPC, `PROGRESS.md` | S0 | done | ok | pass | `cargo test -p agent` |
| S2 | 2 | `crates/core-service/src/service/agent_chat/**` + `service/agent.rs` imports only (D3) | agent domain writes, api-types, apps/api, web, natives, `PROGRESS.md` | S1 | done | ok | pass | `cargo test -p core-service --lib agent_chat` |
| S3 | 3 | api-types agent-chat dto/contract + apps/api agent_chat message/router | web, natives, acp_factory | S2 | done | ok | pass | extract + bun test |
| S9 | 7 | `providers/mod.rs` + `acp_factory.rs` | native codecs, api-types, web | S2,S5–S8 | done | ok | pass | `cargo test -p core-service --lib agent_chat::acp_factory` |
| S4 | 4 | `apps/web/src/features/agent/**` | api-types, rust, acp_factory | S3 | done | ok | pass | bun test spec subset 112 |
| S5 | 5 | `crates/agent/src/providers/codex/**` + flock-append `pub mod codex;` | routing/`chat_provider_kind`, other natives, `lib.rs`, core-service | S1 | done | ok | pass | `cargo test -p agent --lib providers::codex` |
| S6 | 5 | `crates/agent/src/providers/claude/**` + flock-append `pub mod claude;` | routing, other natives, `lib.rs`, core-service | S1 | done | ok | pass | `cargo test -p agent --lib providers::claude` |
| S7 | 5 | `crates/agent/src/providers/pi/**` + flock-append `pub mod pi;` | routing, other natives, `lib.rs`, core-service | S1 | done | ok | pass | `cargo test -p agent --lib providers::pi` |
| S8 | 5 | `crates/agent/src/providers/opencode/**` + flock-append `pub mod opencode;` | routing, other natives, `lib.rs`, core-service | S1 | done | ok | pass | `cargo test -p agent --lib providers::opencode` |
| S10 | 8 | `packages/ui/src/components/agents/prompt-input.tsx` + `prompt-input-view.test.ts` | apps/web, rust, api-types, other ui | S4 | done | ok | pass | bun test prompt-input-view.test.ts |
| S11 | 11 | `domain/descriptor.rs` + `domain/mod.rs` + `providers/mod.rs` | native codecs, lib.rs, web, api-types | S9 | done | ok | pass | `cargo test -p agent --lib domain::descriptor` |
| S12 | 11 | `crates/agent/src/lib.rs` | native codecs, descriptor.rs | S5–S8 | done | ok | pass | `cargo check -p agent` |
| S13 | 11 | `packages/api-types/src/ws/dto/agent-chat.ts` (+ test) | rust, web | S3 | done | ok | pass | bun api-types test |
| S14 | 11 | web background-command remnants + `chat-helpers.ts` + `no-acp-schema.test.ts` | rust, api-types | S4 | done | ok | pass | bun no-acp-schema + background-command tests |

S5 and S6 are parallel only after S1 is `done` and `Owns` stay on disjoint `providers/<id>/` trees. S7/S8 same. HUMAN (2026-09-01): run all four native impls in one wave (D4). `providers/mod.rs` routing/`chat_provider_kind` stays S9. D5: each native may flock-append only `pub mod <id>;`.

**Status**: `planned` · `ready` · `in_progress` · `blocked` · `in_review` · `rework` · `done`

## Slice Cards

### S0 — Additive agent domain types

- **Wave**: 0 (serial)
- **Goal**: Put APP-068 domain types on disk so later slices can import them. Fix `classify_tool` so `web_search` is not workspace `search`. Keep `core-service` compiling (do not change `AgentCapabilities` fields, `AgentRuntimeCommands`, or `AgentToolCall` `input`/`output` yet).
- **Out of scope**: ACP event/tool mapper rewrite; jsonl; WS DTOs; web; native spawn; deleting `capabilities()`; renaming `prompt` → `send`.
- **Owns**:
  - `crates/agent/src/domain/descriptor.rs` (new)
  - `crates/agent/src/domain/action.rs` (new)
  - `crates/agent/src/domain/tool.rs` (new)
  - `crates/agent/src/domain/tool_map.rs` (new)
  - `crates/agent/src/domain/tool_kind.rs`
  - `crates/agent/src/domain/mod.rs`
  - `crates/agent/src/lib.rs`
- **Forbids**: `crates/agent/src/providers/**`, `crates/agent/src/testing.rs`, `crates/agent/src/domain/session.rs`, `crates/agent/src/domain/event.rs`, `crates/core-service/**`, `apps/**`, `packages/**`, `specs/**/PROGRESS.md`
- **Reads**: `specs/APP/APP-068_agent_chat_arch_optimize/reference/{descriptor,runtime,tools,events}.md`, `session.rs` (do not edit)
- **Depends**: —
- **Invariants**:
  - Closed capabilities on the **new** descriptor type: `steer`, `resume`, `permission`, `configure` as `Capability` (`supported` / `unsupported`). Send/cancel are not flags.
  - `web_search` ≠ `search`. Add `AgentToolKind::WebSearch`.
  - Tools: `kind` + `params` + `result` on **new** `AgentTool`. Do not dual-write a `native` bag on that type.
  - Do not re-export new `descriptor::AgentCapabilities` as crate-root `AgentCapabilities` (old session struct still uses that name).
  - Stop re-exporting ACP session types from `lib.rs` **only if** it does not break in-crate callers this slice; prefer leaving ACP re-exports for S1 (`reference/acp-adapter.md`). **S0 must not remove ACP re-exports** (would break `core-service`).
- **Verify**: `cargo test -p agent`
- **Review checklist**:
  1. `classify_tool("web_search")` / `"websearch"` / `"Web search"` → `WebSearch`; `"grep"` / `"glob"` still `Search`.
  2. Crate-root still exports old `AgentCapabilities` `{ supports_steer, … }` so `core-service` compiles.
  3. New `AgentDescriptor` serde uses snake_case capability tags `supported`/`unsupported`; all four fields present.
  4. No files outside Owns.
- **HUMAN open questions**: none

### S1 — Agent traits + ACP adapter compile

- **Wave**: 1 serial after S0 review pass
- **Goal**: `descriptor()` / `send` / `action`; ACP mapper emits `AgentTool` + envelope; `testing.rs` stubs; crate-root Chat API is domain types; ACP types not the Chat surface.
- **Owns**:
  - `crates/agent/src/domain/session.rs`
  - `crates/agent/src/domain/event.rs`
  - `crates/agent/src/testing.rs`
  - `crates/agent/src/lib.rs`
  - `crates/agent/src/providers/acp/**`
  - `crates/agent/src/domain/mod.rs` (barrel only)
  - `crates/agent/src/domain/descriptor.rs` (crate-root `AgentCapabilities` switch only; D2)
- **Forbids**: `crates/core-service/**`, `crates/agent/src/acp_client/**` writes, native provider trees, `apps/**`, `packages/**`, `PROGRESS.md`
- **Depends**: S0
- **Verify**: `cargo test -p agent`
- **Note**: `cargo check -p core-service` may go red until S2. Do not merge S1 alone.
- **Review checklist**: see dispatch prompt (traits, envelope, Steer=Unsupported, AgentTool, crate-root, web_search≠search).

### S2 — core-service persist

- **Wave**: 2 serial after S1 review pass
- **Goal**: `meta.descriptor`; jsonl new envelope; drop SOT `supports_steer` / `session_config_options` / `selected_*`; `MessagePart::ToolCall` is params/result; `get` still no spawn; traits `send`/`action`/`descriptor`; factory still ACP for all ids (S9 routes natives).
- **Owns**: `crates/core-service/src/service/agent_chat/**` plus `crates/core-service/src/service/agent.rs` (D3: ACP logout imports only)
- **Forbids**: `crates/agent/src/**` writes, `apps/**`, `packages/**`, native provider trees, `PROGRESS.md`
- **Depends**: S1
- **Verify**: `cargo test -p core-service --lib agent_chat`
- **Note**: `cargo check -p` api/web may fail until S3/S4. Do not “fix” that by editing api-types.

### S3 — WS DTOs

- **Wave**: 3 serial (hot files)
- **Goal**: Keep `agent_chat_*` names; evolve DTO; extract catalog.
- **Depends**: S2

### S4 — web live path

- **Wave**: 4
- **Goal**: Composer reads descriptor; cards read params/result; delete `classifyTool` / background-command vendor adapters as SOT.
- **Depends**: S3

### S5–S8 — native providers

- Fixtures first. One tree per id. No `providers/mod.rs` until S9.

### S9 — routing glue

- Wire `claude`/`codex`/`opencode`/`pi` → native; else ACP. Terminal `builtin_agents.json` `params` unchanged.
- **Rework (review 2)**: `provider_for` tests must call `.program()` on a constructed `PiNativeProvider`, not `last_program()` side channel.

### S10 — packages/ui one-option thinking (M3)

- **Wave**: 8 serial-small, parallel with S9 rework (disjoint)
- **Goal**: `thinkingLevels.length > 0` so a real one-option thinking enum is visible. Empty array still omits.
- **Owns**: `packages/ui/src/components/agents/prompt-input.tsx` and colocated tests only if they already exist or must be added next to it.
- **Forbids**: `apps/web/**`, rust, api-types, native codecs, `PROGRESS.md`
- **Depends**: S4 (composer already feeds descriptor thinking options)
- **Invariants**: web.md Composer rules: Change `thinkingLevels.length > 1` to `length > 0`. Empty array omits the control.
- **Verify**: targeted bun test for prompt-input / AgentsPromptInput
- **Review checklist**: both `length > 1` sites become `> 0`; empty still hidden; no unrelated prompt-input refactors.

## Progress Log

### 2026-09-01

- Research/reference TECHs already in `reference/`.
- Armed long-task impl. Wrote kanban. Dispatching S0.
- S0 done (review pass). S1 done (review pass after Steer-test rework; `cargo test -p agent`). Dispatching S2.
- HUMAN: parallelize unrelated slices. S5–S8 impl + four reviews all pass. S5 P2: testdata README 未钉 `codex --version`（不返工）。S2 上次 review 未交出 VERDICT，重派。
- S3 WS DTOs review pass. S4 web review pass. S9 factory: 第一次 review fail（生产未传 program）；返工后第二次 fail（测试只断言 last_program）；第三次 pass（PiNativeProvider.program()）。S10 M3 thinking `length > 0` review pass.
- Architecture check (parent, 2026-09-01): live path no `classifyTool(`; `agent_chat_*` names kept; Terminal `builtin_agents.json` params unused by Chat routing; layers domain → persist → WS → web; natives in `providers/<id>`; factory program wiring via canonical catalog id. No dual schema on live path. Ready for test-run.
- Architecture review vs TECH (2026-09-01): layers match; wrote [REVIEW.md](./REVIEW.md). P1 = `capabilities_for_provider` misses `codex-acp`/`pi-acp`. P2 = TECH routing table, crate-root native exports, WS `turn_id` DTO, dead web probe helpers.
- Wave 11 re-run after REV fixes: `cargo test -p agent --offline` 195 pass; `agent_chat` 94; `meta_wire` 1; api-types 22. Parent TECH domain envelope aligned to events.md. Long-task Done.

## Decisions Since TECH

| ID | Decision | Why | Source update |
|----|----------|-----|---------------|
| D1 | S0 is additive types only; trait/`AgentToolCall`/`AgentCapabilities` replacement is S1+S2 | Keep `core-service` green after Wave 0; TECH dual-schema ban is wire/jsonl, not two Rust names for one release cut | This file |
| D2 | S1 Owns includes `domain/mod.rs` + `descriptor.rs` for crate-root closed `AgentCapabilities` | S1 brief required crate-root Chat API switch; barrel/test live outside original file list | This file |
| D3 | S2 Owns includes `core-service/src/service/agent.rs` import fix only | S1 removed crate-root `logout_acp_agent` / `AgentLogoutResult`; `acp-adapter.md` says non-Chat callers use `agent::acp_client::`. Needed for `cargo test -p core-service` | This file |
| D4 | Wave 5 runs S5–S8 in parallel (4 native trees) | HUMAN asked for more parallel impl/review; Owns remain disjoint except D5 append | This file |
| D5 | Native slices may flock-append `pub mod <id>;` to `providers/mod.rs`; must not rewrite routing or sibling mods | Needed so `cargo test -p agent --lib providers::<id>` actually compiles the tree; S9 still owns `chat_provider_kind` / factory routing | This file |
| D6 | S10 owns `packages/ui` thinking visibility (`length > 0`); not S4 | S4 Owns was `features/agent/**` only; web.md M3 lives in prompt-input.tsx | This file |
| D7 | Wave 11 fixes REVIEW.md REV-001–005; TECH routing table updated to alias fold | Architecture review 2026-09-01; P1 capabilities must share canonicalize | This file |

## Verification Status

| Area | Command / Method | Last result | Notes |
|------|------------------|-------------|-------|
| Rust `agent` | `cargo test -p agent --offline` | pass (195) | Wave 11 re-run 2026-09-01 |
| Rust `core-service` agent_chat | `cargo test -p core-service --lib agent_chat --offline` | pass (94) | clock flake did not reproduce |
| api `meta_wire` | `cargo test -p api --bin api meta_wire --offline` | pass (1) | persist-only keys stripped |
| api-types | `bun run --filter @atmos/api-types test` | pass (22) | S15 + S13 `turn_id` |
| Web S4 subset | bun test web.md file list + other-card | pass (85) | full `features/agent` dir may segfault `.dom.test.tsx` |
| UI thinking M3 | bun test prompt-input-view.test.ts | pass (14) | S10 / TEST S2 |
| TEST.md S1–S24 | mapping + targeted commands | covered | see TEST.md Coverage Status |
| Playwright / live CLI / agent-browser | optional / manual | not_run | Chat UI was not running |

## Known Blockers

- [ ] None

## Handoff Notes

### Task goal

Implement APP-068 per PRD/TECH/reference using long-task waves. Parent does not write feature code.

### Current progress

Impl slices S0–S14 `done`. Test-run recorded S1–S24 executable coverage in `TEST.md`. Wave 11 re-run: `agent` 195, `agent_chat` 94, `meta_wire` 1, api-types 22. Parent wrote no feature code. Work is uncommitted on `main`. Parent TECH domain envelope aligned to `events.md` (`payload`, no `timestamp`/`sequence`).

### Next steps

Commit if HUMAN asks. Manual: dual-agent visual smoke, Live CLI spawn. Optional: Playwright smoke, agent-browser with `just dev-web` + API. Do not treat fixture-green natives as live CLI verification.

### Relevant files/symbols

`specs/APP/APP-068_agent_chat_arch_optimize/reference/README.md`
