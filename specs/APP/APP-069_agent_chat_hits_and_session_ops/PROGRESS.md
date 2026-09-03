# PROGRESS · APP-069: Agent Chat hits, Grok, fork/rewind

> Implementation Progress · current state, handoff notes, blockers, and verification status. This file is not a requirements source.

## Status

- **State**: implemented
- **Branch**: (working tree)
- **Last updated**: 2026-09-01
- **Current owner**: review-fix session
- **Current phase**: REVIEW.md REV-001–008 verified

## Snapshot

- Specs: PRD M14 (native composer probe), TECH, TEST written.
- Wave 0 S0 done. Wave 1 S1 done (review pass).
- Wave 0–5 slices done (S7 review pass: Grok live `_x.ai/*` ExtMethod).
- TEST.md Coverage Status filled 2026-09-01; review-fix re-verify same day: agent 23, core-service 20 `app069_` tests. agent-browser exploratory `not_run` (no local web/api). Full `just test` / `just lint` not run. Live CLI still manual.
- REVIEW.md REV-001–008 verified (checkpoint persist, phase-two file-change chrome, Pi fork entries, rewind_view Applied test, session-op error on WS, picker i18n, execution-map Status).
- Blocked: none.

## Implementation Checklist

- [x] Wave 0 domain contract (`support`, SearchHits, Native strategy stub)
- [x] Wave 1 WS contract (`support` DTO, `search_hits`, `agent_chat_session_op_respond`)
- [x] M14 catalog probe + Grok thinking overlay + web pickers
- [x] M1 search hits extract + UI
- [x] Grok native host spawn/map
- [x] Session-op kernel + web chrome
- [x] i18n / glue
- [x] Native fork/rewind verbs (S7: Grok live `_x.ai/*`)
- [x] atmos-specs-test-run

## Slice Kanban

> Orchestration board for `atmos-long-task-impl`. Not a requirements source.

| ID | Wave | Owns | Forbids | Depends | Status | Impl | Review | Verify |
|----|------|------|---------|---------|--------|------|--------|--------|
| S0 | 0 | see card: domain + catalog enum + descriptor construction sites | `apps/web/**`, grok provider tree, session-op intercept | — | done | ok | pass | `cargo test -p agent descriptor` |
| S1 | 1 | see card: api-types + apps/api WS + configure permission_mode + session_op_respond reject-if-none | web UI, grok/**, send intercept, native rewind verbs | S0 | done | ok | pass | `bun test packages/api-types/src/ws/dto/agent-chat.test.ts` |
| S2 | 2 | see card: Native catalog + catalog_spec_for + ACP permission_modes + Grok overlay | grok spawn, rewind verbs, tool_map.rs | S0,S1 | done | ok | pass | `cargo test -p agent catalog` + `cargo test -p core-service catalog` |
| S3 | 2 | see card: providers/grok + NativeGrok + strip ACP grok special-case | catalog.rs, web, rewind/fork RPC | S0 | done | ok | pass | `cargo test -p agent grok` |
| S4 | 2 | see card: claude/codex/opencode/pi tool_map SearchHits | grok/**, acp/tool_map.rs | S0 | done | ok | pass | `cargo test -p agent extract_search_hits` |
| S5 | 3 | see card: session-op kernel + events + send intercept + snapshot fold | web UI, native rewind RPC bodies, messages json | S1,S3 | done | ok | pass | `cargo test -p core-service --lib agent_chat` |
| S6 | 3 | see card: web session-op card + descriptorToConfigOptions + search card | messages json, rust crates | S1 | done | ok | pass | `bun test apps/web/src/features/agent` |
| S7 | 4 | see card: native rewind/fork verbs + acp_client ExtMethod | web, catalog, messages json | S3,S5 | done | ok | pass | provider fixture tests |
| S8 | 5 | `apps/web/messages/en.json` `zh.json` + leftover glue | crates | S6 | done | ok | pass | locale key grep |

**Status**: `planned` · `ready` · `in_progress` · `blocked` · `in_review` · `rework` · `done`

## Slice Cards

### S0 — Domain contract (descriptor.support, SearchHits, Native strategy)

- **Wave**: 0
- **Goal**: Land compile-safe domain types for APP-069: `AgentOptionSupport` on `AgentDescriptor` as `support`; `capabilities.fork`/`rewind`; `permission_modes` + `current_config.permission_mode`; `AgentRuntimeConfigUpdate.permission_mode`; `AgentToolResult::SearchHits` + `SearchHit` + `extract_search_hits`; `CatalogStrategyKind::Native` with engine arm (empty fragment OK). Update every `AgentDescriptor` / `AgentCapabilities` / `AgentSupportedOptions` / `AgentCurrentConfig` literal so the crate compiles. Serde missing fields → Unsupported / empty.
- **Out of scope**: Grok provider module; ACP-vs-native catalog_spec_for switch; actual CLI/RPC probes; session-op actions/events; web; WS action; rewind/fork RPC.
- **Owns**:
  - `crates/agent/src/domain/**`
  - `crates/agent/src/catalog/**`
  - `crates/agent/src/lib.rs`
  - `crates/agent/src/testing.rs` (descriptor construction only as needed)
  - Descriptor construction sites that fail to compile after the new fields:
    - `crates/agent/src/providers/claude/mod.rs`
    - `crates/agent/src/providers/claude/event_map.rs`
    - `crates/agent/src/providers/codex/mod.rs`
    - `crates/agent/src/providers/codex/event_map.rs`
    - `crates/agent/src/providers/codex/rpc.rs`
    - `crates/agent/src/providers/opencode/mod.rs`
    - `crates/agent/src/providers/opencode/event_map.rs`
    - `crates/agent/src/providers/opencode/rpc.rs`
    - `crates/agent/src/providers/pi/mod.rs`
    - `crates/agent/src/providers/acp/adapter.rs`
    - `crates/agent/src/providers/acp/event_map.rs`
    - `crates/core-service/src/service/agent_chat/types.rs`
    - `crates/core-service/src/service/agent_chat/store.rs` (only `AgentCurrentConfig` / descriptor literals)
    - `crates/core-service/src/service/agent_chat/acp_factory.rs`
    - `apps/api/src/api/ws/message/agent_chat.rs` (only descriptor/current_config literals)
- **Forbids**: `providers/grok/**` (does not exist yet — do not create); `apps/web/**`; `packages/api-types/**`; session-op intercept in `service.rs`; `resources/terminal-agents/builtin_agents.json`; new WS actions.
- **Reads (read-only)**: `specs/APP/APP-069_agent_chat_hits_and_session_ops/TECH.md` domain + M14 sections; `PRD.md` M12 M14.
- **Depends**: —
- **Invariants**:
  - `descriptor.support` has `models`, `thinking`, `modes`, `permission_modes` as `Capability`.
  - Claude `option_support_for_provider`: modes Unsupported, permission_modes Supported; others per TECH table (Grok thinking Supported).
  - `capabilities` grows `fork` and `rewind` (Grok/Claude/Codex/OpenCode/Pi per honesty table; ACP Unsupported).
  - Missing serde → Unsupported.
  - `extract_search_hits` parses `path:line:snippet` and `path:line:`; zero hits → empty vec (callers keep Text later).
  - `CatalogStrategyKind::Native` exists; engine may push empty/error fragment; do not call ACP from this arm.
  - Do not add `AgentAction::PrepareSessionOp` in this slice (exhaustive matches).
- **Verify**: `cargo test -p agent descriptor -- --test-threads=1` and `cargo test -p agent catalog` (or equivalent tests added in Owns). Also `cargo check -p agent -p core-service -p atmos-api` if those packages exist.
- **Review checklist**:
  1. Old meta JSON without `support` / fork / rewind deserializes.
  2. Claude support.modes is Unsupported.
  3. No `PrepareSessionOp` / WS / grok module.
  4. Construction sites compile without dummy/TODO descriptors.
- **HUMAN open questions**: none

### S1 — WS contract (support, search_hits, session_op_respond)

- **Wave**: 1
- **Goal**: Mirror S0 domain types on the Chat WS wire and land the one new action `agent_chat_session_op_respond`. Descriptor DTO grows `support` + capabilities `fork`/`rewind` + `permission_modes` / `current_config.permission_mode`. `AgentChatConfigureRequest` grows `permission_mode` and is threaded through the existing configure handler. `AgentToolResult` grows `type: "search_hits"`. Event payload union grows `session_op_requested` / `session_op_resolved` / `session_forked` / `rewind_view_updated`. Snapshot DTO may add optional `pending_session_op`. Same-PR: Rust `WsAction`, extract-actions, `actions.ts`, DTO, `WsContract` row. Handler → `AgentChatService::session_op_respond`; until S5 stores a pending op, the method verifies the chat exists and returns a validation error (must not fake `{ ok: true }` apply).
- **Out of scope**: web UI; Grok provider; send `/fork` `/rewind` intercept; vendor rewind/fork RPC; catalog Native probe; `extract_search_hits` call sites in tool_maps; i18n; REST; new `WsEvent`.
- **Owns**:
  - `packages/api-types/src/ws/dto/agent-chat.ts`
  - `packages/api-types/src/ws/dto/agent-chat.test.ts`
  - `packages/api-types/src/ws/contract/agent-chat.ts`
  - `packages/api-types/src/ws/actions.ts`
  - `packages/api-types/fixtures/actions.server.json` (via `extract-actions` only; do not hand-edit)
  - `apps/api/src/api/ws/message.rs` (add `AgentChatSessionOpRespond` only)
  - `apps/api/src/api/ws/message/agent_chat.rs`
  - `apps/api/src/api/ws/router/mod.rs` (exhaustive match arm only)
  - `apps/api/src/api/ws/router/agent_chat.rs` (configure `permission_mode` + session-op handler)
  - `crates/core-service/src/service/agent_chat/service.rs` (configure `permission_mode` plumbing + `session_op_respond` reject-if-none)
  - `crates/core-service/src/service/agent_chat/tests.rs` (only compile/arity fixes for the new configure argument; optional one test that session_op_respond errors with no pending op)
- **Forbids**: `apps/web/**`; `crates/agent/src/providers/grok/**`; `crates/agent/src/catalog/**`; native rewind/fork codecs; `resources/terminal-agents/builtin_agents.json`; new REST; `PROGRESS.md`.
- **Reads (read-only)**: `packages/api-types/AGENTS.md`; S0 `crates/agent/src/domain/descriptor.rs` + `tool.rs` serde shapes; `specs/APP/APP-069_agent_chat_hits_and_session_ops/TECH.md` apps/api + api-types + Data model + Transport; `PRD.md` M12.
- **Depends**: S0
- **Invariants**:
  - One new action: `AgentChatSessionOpRespond` → wire `agent_chat_session_op_respond`. Request `{ chat_id, request_id, option_id }`. Output `{ ok: true }` (`WsOk`) when the service succeeds.
  - No new REST. No second socket. No new `WsEvent`; session-op events ride `agent_chat_event` payload.
  - `search_hits` is `AgentToolResult` `type: "search_hits"`, not an event. Hits: `{ path, line?, snippet? }` matching domain `SearchHit`.
  - Closed `AgentCapabilities` keys: existing four plus `fork` | `rewind`. Closed descriptor keys include `support` (`models`, `thinking`, `modes`, `permission_modes` as `"supported" | "unsupported"`).
  - `supported_options.permission_modes` and `current_config.permission_mode` on the descriptor DTO.
  - Configure may send `permission_mode`. Claude: incoming `mode` is still accepted as a permission-mode alias when `permission_mode` is absent (TECH: old clients). If both are present, `permission_mode` wins. Do not also copy permission lists into `supported_options.modes`.
  - Event payload types: `session_op_requested` `{ request }`; `session_op_resolved` `{ request_id, option_id, outcome: "applied"|"canceled"|"failed" }`; `session_forked` `{ parent_chat_id, chat_id }`; `rewind_view_updated` `{ until_turn_id: string | null }`.
  - `session_op_respond` must not succeed as a fake apply when no pending session op exists. Do not implement vendor fork/rewind or send intercept.
  - Still `agent_chat_*` names. Catalog test count of `agent_chat_*` actions includes the new one.
- **Verify**: `bun run --filter @atmos/api-types extract-actions && bun run --filter @atmos/api-types check-actions && bun test packages/api-types/src/ws/dto/agent-chat.test.ts && cargo check -p api -p core-service`
- **Review checklist**:
  1. extract-actions + check-actions green; fixtures not hand-edited.
  2. Caps closed type includes `fork`/`rewind`; descriptor source contains `support`.
  3. `search_hits` is a tool result type, not an event name; no REST conversation action.
  4. Configure threads `permission_mode`; Claude `mode` alias only when permission_mode absent.
  5. Handler exists; service does not return ok on missing pending op.
  6. FILES ⊆ Owns.
- **HUMAN open questions**: none

### S2 — M14 catalog (Native spec, skip ACP for natives, Grok overlay, ACP permission_modes)

- **Wave**: 2 (parallel with S3, S4; Owns disjoint)
- **Goal**: Chat natives use Config+Cli+Native, never generic ACP `session/new` in catalog-probe. `catalog_spec_for` after alias fold: `acp: false`, drop `Acp`, add `Native`. Engine Native arm calls `NativeCatalogProbe` (not `AcpCatalogProbe`). Grok thinking stamped from the 4.5/4.6 table after CLI models. ACP mapper fills `permission_modes` from permission/permission_mode/approval.
- **Out of scope**: Grok stdio spawn; rewind/fork verbs; web pickers; tool_map SearchHits.
- **Owns**: `crates/agent/src/catalog/**`; `crates/agent/src/lib.rs` (re-exports only); `crates/agent/src/domain/descriptor.rs` + `crates/agent/src/domain/mod.rs` (only if `canonicalize_chat_provider_id` must become `pub`); `crates/core-service/src/service/agent_chat/catalog.rs`; new `crates/agent/src/providers/{claude,codex,opencode,pi}/catalog.rs`; those four `mod.rs` only to declare `mod catalog`.
- **Forbids**: `providers/grok/**`; `providers/mod.rs`; `acp_factory.rs`; `**/tool_map.rs`; `apps/web/**`; `packages/api-types/**`.
- **Depends**: S0, S1
- **Verify**: `cargo test -p agent catalog -- --test-threads=1` and `cargo test -p core-service --lib catalog`

### S3 — Grok native host (spawn + map, not ACP)

- **Wave**: 2
- **Goal**: Dedicated `providers/grok`. Spawn `grok agent stdio` (optional `--model` before `stdio`). `ChatProviderKind::NativeGrok` after alias fold. `session/new` + `session/load`. Map ACP frames; unmapped `x.ai/*` skip or one Unknown. Move grok special-case out of ACP tool_map. Do not implement rewind/fork RPC (S7).
- **Owns**: `crates/agent/src/providers/grok/**`; `crates/agent/src/providers/mod.rs`; `crates/core-service/src/service/agent_chat/acp_factory.rs`; `crates/agent/src/providers/acp/tool_map.rs`; `crates/agent/src/providers/acp/event_map.rs` (only grok_tasks removal / routing).
- **Forbids**: `crates/agent/src/catalog/**`; `apps/web/**`; `core-service/.../catalog.rs`; Cargo `xai-grok-*`; Terminal `builtin_agents.json`; `x.ai/rewind/*` / `x.ai/session/fork` execute paths.
- **Depends**: S0
- **Verify**: `cargo test -p agent grok -- --test-threads=1` and `cargo check -p agent -p core-service`

### S4 — SearchHits extract on existing native tool_maps

- **Wave**: 2
- **Goal**: `result_for_kind(Search)` uses `extract_search_hits`; zero hits keep `Text`; never treat `web_search` as workspace hits.
- **Owns**: `crates/agent/src/providers/claude/tool_map.rs`; `crates/agent/src/providers/codex/tool_map.rs`; `crates/agent/src/providers/opencode/tool_map.rs`; `crates/agent/src/providers/pi/tool_map.rs`.
- **Forbids**: `providers/grok/**`; `providers/acp/tool_map.rs`; catalog; web.
- **Depends**: S0
- **Verify**: `cargo test -p agent extract_search_hits -- --test-threads=1` plus targeted tool_map tests in Owns.

### S5 — Session-op kernel (intercept, events, fold, respond)

- **Wave**: 3 (parallel S6)
- **Goal**: Domain PrepareSessionOp/RespondSessionOp + events. `send` intercepts `/fork` `/rewind` (and `/undo` / OpenCode `/redo` per TECH) on natives with capability; do not persist those as user turns. `session_op_respond` cancel vs apply. `rewind_view` fold; fork creates new Atmos chat_id after vendor Applied. Inject `/fork` `/rewind` into native available_commands. Adapters may return Unsupported until S7 (then outcome Failed, no view change).
- **Owns**: domain action/event + provider exhaustive match arms (Unsupported); core-service agent_chat kernel files; api router handler body; api-types meta parent_chat_id/rewind_view if missing.
- **Forbids**: apps/web/**; messages json; implementing vendor rewind/fork RPC bodies (S7).
- **Depends**: S1, S3
- **Verify**: `cargo test -p core-service --lib agent_chat -- --test-threads=1` and `cargo test -p agent action -- --test-threads=1`

### S6 — Web chrome (session-op card, pickers, search hits)

- **Wave**: 3 (parallel S5)
- **Goal**: AgentSessionOpCard above the prompt (same slot as permission; permission wins). descriptorToConfigOptions fourth picker. presentAgentTool search_hits card. Do not intercept slash in composer. Do not edit locale JSON (S8).
- **Owns**: listed web feature files only.
- **Forbids**: `apps/web/messages/**`; crates/**; packages/api-types/**.
- **Depends**: S1
- **Verify**: `bun test apps/web/src/features/agent`

### S7 — Native rewind/fork verbs

- **Wave**: 4
- **Status**: done (review pass)
- **Goal**: Real RespondSessionOp on natives. Grok live send uses ACP extension wire `_x.ai/...` via `acp_client` ExtMethod. Worktree create `{ sessionId, sourcePath }`. Claude/Codex/OpenCode/Pi Applied already on disk — keep, do not regress.
- **Owns**:
  - `crates/agent/src/acp_client/**`
  - `crates/agent/src/providers/grok/**`
  - `crates/agent/src/providers/claude/**`
  - `crates/agent/src/providers/codex/**`
  - `crates/agent/src/providers/opencode/**`
  - `crates/agent/src/providers/pi/**`
  - `crates/core-service/src/service/agent_chat/service.rs` (only if RespondSessionOp target plumbing still missing)
  - `crates/agent/src/domain/action.rs` (only if target field still missing)
- **Forbids**: `apps/web/**`; `apps/web/messages/**`; `packages/api-types/**`; `resources/terminal-agents/builtin_agents.json`; Cargo `xai-grok-*`; inventing git worktree locally.
- **HUMAN open questions**: none (locked: wire `_x.ai/`; worktree `{ sessionId, sourcePath }`).

### S8 — Locales

- **Wave**: 5
- **Goal**: Add `sessionOpRequested` / `sessionOpFork` / `sessionOpRewind` (and any other missing APP-069 keys) to `en.json` and `zh.json`. Sentence case. Translate zh naturally.
- **Owns**: `apps/web/messages/en.json`, `apps/web/messages/zh.json`
- **Forbids**: crates; new UI components
- **Depends**: S6
- **Verify**: grep keys exist in both locales

## Progress Log

### 2026-09-01

- Wave 0–5 slices done. S7 review pass (wire `_x.ai/*`, ExtMethod, worktree `{ sessionId, sourcePath }`). Handed to atmos-specs-test-run.
- atmos-specs-test-run: S1–S19 covered and passing (`app069_s*` + listed bun files). Coverage Status appended to TEST.md. Production code unchanged. agent-browser `not_run`.
- atmos-specs-review (functional + quality): REVIEW.md REV-001–008. P1: Claude checkpoint persist/respawn (REV-001), phase-2 file options not vendor-gated (REV-002). No P0. Live CLI / full-repo lint still not run.

## Decisions Since TECH

| ID | Decision | Why | Source update |
|----|----------|-----|---------------|
| D1 | `descriptor.support` is a sibling of `capabilities`, not extra capability flags | HUMAN asked for support to declare what can be probed | TECH + PRD M14 |
| D2 | Grok thinking hardcoded 4.5 vs 4.6 | HUMAN | TECH overlay table |
| D3 | Grok extension wire is `_x.ai/...` | ACP reserves `_` for extensions; `agent-client-protocol` 2.0 drops non-underscore unknowns as `-32601` | TECH Grok framing |
| D4 | Worktree create `{ sessionId, sourcePath }` | Same shape as live ACP clients; optional `label` omitted | TECH fork+worktree |

## Verification Status

| Area | Command / Method | Last result | Notes |
|------|------------------|-------------|-------|
| Rust tests | `cargo test -p agent --lib app069_` | 23 passed, 2026-09-01 | plus `cargo test -p core-service --lib app069_` 20 passed |
| Web tests | listed bun files in TEST.md Coverage Status | 59 pass on review-fix subset, 2026-09-01 | not full `just test` |
| Clippy / eslint | targeted agent + core-service clippy; web lint on listed tests | exit 0 | full `just lint` not run |
| E2E / agent-browser | Playwright optional; exploratory 1–4 | not_run | no local `just dev-web` / `just dev-api` |
| Live CLI | Grok/Claude/Codex rewind | not_run | TEST.md Manual verification |

## Known Blockers

- none (S7 previously blocked on prefix/worktree; locked D3/D4).

## Handoff Notes

### Task goal

APP-069 production implementation via long-task waves.

### Current progress

S0–S8 `done`. REVIEW.md REV-001–008 `verified`. Remaining: full-repo `just test`/`just lint`, optional Playwright, live CLI, agent-browser after starting web+api.

### Completed work

Wave 0 domain; Wave 1 WS contract; Wave 2 catalog/Grok host/SearchHits; Wave 3 session-op kernel + web chrome; Wave 5 locales.

### Key decisions

See TECH honesty + probe tables. S2 rework: `permission_modes` on `AgentModelCatalog`. S5 rework: Applied fork creates sibling. S6 rework: composer `extraConfigOptions` = `permission_mode`.
