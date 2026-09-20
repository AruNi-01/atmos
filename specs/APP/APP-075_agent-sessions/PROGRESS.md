# PROGRESS · APP-075: Agent Sessions

> Implementation Progress · current state, handoff notes, blockers, and verification status. This file is not a requirements source.

## Status

- **State**: ready_for_review
- **Branch**: local working tree
- **Last updated**: 2026-09-17
- **Current owner**: lead agent (atmos-long-task-impl)
- **Current phase**: verification complete

## Snapshot

- Done: spec quartet (BRAINSTORM/PRD/TECH/TEST).
- Next: Wave 0 compile contracts (session_source trait, v1 path table, roster ids, `imported` origin).
- Blocked: none.
- Must not: parent session writing feature code; citing third-party session-browser product names; converting on preview; REST.

## Implementation Checklist

- [ ] Infra / domain contracts (session_source + imported origin)
- [ ] Core service logic (HostSessionService)
- [ ] API / WebSocket routing (`host_session_*`)
- [ ] Web UI (Launchpad + left sidebar swap)
- [ ] Resume Chat / TUI
- [ ] Tests + live home scan

## Progress Log

### 2026-09-17

- Started long-task orchestration from TECH rollout.
- Dispatching Wave 0 serial slice S0.

## Decisions Since TECH

| ID | Decision | Why | Source update |
|----|----------|-----|---------------|
| D1 | Add `rusqlite` (bundled) on `crates/agent` in Wave 0 | OpenCode cheap list needs sqlite; Cargo.toml is a hot file | pending TECH note if used |
| D2 | Watcher/`notify` deferred unless Wave 6 needs it | not in workspace; mtime+size skip + scan gate satisfy M10 | pending |
| D3 | Implement resume WS (S5) before UI (S4) | `wsRequest` needs `host_session_resume_*` in the contract for typecheck | this file |

## Verification Status

| Area | Command / Method | Last result | Notes |
|------|------------------|-------------|-------|
| Rust tests | `cargo test -p agent --lib session_source` | pass 40 | |
| Rust tests | `cargo test -p core-service --lib host_session` | pass 11 | |
| Rust tests | `cargo test -p agent --lib` | pass 736 | |
| Web tests | bun agent-sessions host + filters + launchpad | pass 21 | |
| Live homes | ATMOS_LIVE_HOST_SESSIONS=1 | pass 1683 listed | all 6 v1 hosts |
| WS | host_session_list to :30303 | fail handshake | stale API pid |

## Known Blockers

- [ ] none

## Handoff Notes

### Task goal

Implement APP-075 Agent Sessions per TECH: scan v1 hosts, preview without persist, lazy Chat import, TUI resume, dedicated sidebar.

### Current progress

Wave 0 in dispatch.

### Completed work

Specs only.

### Key decisions

See Decisions Since TECH.

## Slice Kanban

> Orchestration board for `atmos-long-task-impl`. Not a requirements source.

| ID | Wave | Owns | Forbids | Depends | Status | Impl | Review | Verify |
|----|------|------|---------|---------|--------|------|--------|--------|
| S0 | 0 | `crates/agent/src/session_source/**`, `crates/agent/src/lib.rs`, `crates/agent/Cargo.toml`, `crates/core-service/src/service/agent_chat/types.rs`, `packages/api-types/src/ws/dto/agent-chat.ts` | adapters' full parsers (stubs only); WS; UI; HostSessionService | — | done | ok | pass | `cargo test -p agent session_source` |
| S1a | 1 | `crates/agent/src/session_source/adapters/claude.rs`, `crates/agent/src/session_source/adapters/codex.rs`, `crates/agent/src/session_source/testdata/claude/**`, `crates/agent/src/session_source/testdata/codex/**` | roster/mod.rs, Cargo.toml, other adapters | S0 | done | ok | pass | `cargo test -p agent session_source` |
| S1b | 1 | `crates/agent/src/session_source/adapters/opencode.rs`, `crates/agent/src/session_source/adapters/pi.rs`, `crates/agent/src/session_source/testdata/opencode/**`, `crates/agent/src/session_source/testdata/pi/**` | roster/mod.rs, Cargo.toml, other adapters | S0 | done | ok | pass | `cargo test -p agent session_source` |
| S1c | 1 | `crates/agent/src/session_source/adapters/grok.rs`, `crates/agent/src/session_source/adapters/cursor.rs`, `crates/agent/src/session_source/testdata/grok/**`, `crates/agent/src/session_source/testdata/cursor/**` | roster/mod.rs, Cargo.toml, other adapters | S0 | done | ok | pass | `cargo test -p agent session_source` |
| S2 | 2 | `crates/core-service/src/service/host_session/**`, `crates/core-service/src/service/mod.rs`, `crates/core-service/src/lib.rs`, `crates/core-service/src/service/agent_chat/store.rs` (fold extract only) | WS, UI, resume | S0, S1a-c | done | ok | pass | `cargo test -p core-service host_session` |
| S3 | 3 | `apps/api/src/api/ws/message.rs`, `apps/api/src/api/ws/message/host_session.rs`, `apps/api/src/api/ws/router/mod.rs`, `apps/api/src/api/ws/router/host_session.rs`, `packages/api-types/src/ws/**` | UI, resume impl | S2 | done | ok | pass | extract-actions/events + check |
| S4 | 4 | `apps/web/src/features/agent-sessions/**`, left sidebar/launchpad/center/i18n | Rust crates | S3, S5 | done | ok | pass | bun agent-sessions tests |
| S5 | 5 | host-session resume_chat/resume_tui + WS | UI | S3 | done | ok | pass | `cargo test -p core-service host_session` |
| S6 | 6 | watcher | — | S5 | done | skipped | — | cheap list each request; no notify crate |

## Slice Cards

### S1a — Claude + Codex disk adapters

- **Wave**: 1
- **Goal**: Real cheap `list` + `parse` for Claude jsonl and Codex rollout jsonl; in-tree sanitised fixtures; tests for native ids, missing root `[]`, unknown line does not Err, list of large jsonl does not parse every line, Codex skips internal threads.
- **Out of scope**: other hosts; service; WS; UI.
- **Owns**:
  - `crates/agent/src/session_source/adapters/claude.rs`
  - `crates/agent/src/session_source/adapters/codex.rs`
  - `crates/agent/src/session_source/testdata/claude/**`
  - `crates/agent/src/session_source/testdata/codex/**`
- **Forbids**: `adapters/mod.rs`, `Cargo.toml`, other adapter files, `lib.rs`
- **Reads**: `session_source/mod.rs`, `paths.rs`, `scan.rs`, `crates/agent/src/map/**`, `contract/event.rs`, `contract/tool.rs`
- **Depends**: S0
- **Invariants**: list cheap; parse → AgentEventEnvelope; classify_tool; emit Claude nested `subagents/` jsonl with `parent_native_id`; keep Codex `thread_source=subagent` with parent, skip guardian_review/memory_consolidation; unknown types omit or Unknown; no third-party product names in fixtures.
- **Verify**: `cargo test -p agent session_source`
- **Review checklist**: cheap list; Codex internal skip; Claude user/assistant/tool_result mapped; fixtures original.

### S1b — OpenCode + Pi disk adapters

- **Wave**: 1
- **Goal**: OpenCode sqlite cheap list (`session` table) + parse from `message.data`; Pi jsonl `{type:session}` then `{type:message}`. Fixtures + tests.
- **Out of scope**: other hosts; service.
- **Owns**:
  - `crates/agent/src/session_source/adapters/opencode.rs`
  - `crates/agent/src/session_source/adapters/pi.rs`
  - `crates/agent/src/session_source/testdata/opencode/**`
  - `crates/agent/src/session_source/testdata/pi/**`
- **Forbids**: `adapters/mod.rs`, `Cargo.toml`, other adapters
- **Reads**: rusqlite already on agent crate from S0; session table columns id, directory, title, time_created, time_updated, parent_id, model; message.data JSON; emit parent_id children with `parent_native_id`.
- **Depends**: S0
- **Invariants**: OpenCode list is SQL not full message parse; Pi native id from filename uuid suffix; missing db → []; degrade host to empty on error not panic.
- **Verify**: `cargo test -p agent session_source`
- **Review checklist**: sqlite read-only; Pi first-line session cwd; unknown lines don't abort.

### S1c — Grok + Cursor Agent disk adapters

- **Wave**: 1
- **Goal**: Grok `summary.json` cheap list + `updates.jsonl` parse (ACP-shaped session/update chunks); Cursor Agent CLI transcripts under agent-transcripts. Skip turn_ended-only Cursor files. Nested Grok `subagents/` dirs are child rows with `parent_native_id`.
- **Out of scope**: Cursor IDE state.vscdb (N2).
- **Owns**:
  - `crates/agent/src/session_source/adapters/grok.rs`
  - `crates/agent/src/session_source/adapters/cursor.rs`
  - `crates/agent/src/session_source/testdata/grok/**`
  - `crates/agent/src/session_source/testdata/cursor/**`
- **Forbids**: `adapters/mod.rs`, `Cargo.toml`, other adapters
- **Reads**: live grok event_map only as read-only hint for sessionUpdate names; do not call live mapper on files.
- **Depends**: S0
- **Invariants**: do not treat chat_history.jsonl as full log; require summary.json for list; merge user_message_chunk / agent_message_chunk; skip turn_ended-only Cursor; unknown sessionUpdate omit/Unknown.
- **Verify**: `cargo test -p agent session_source`
- **Review checklist**: Grok list uses summary only; Cursor CLI path only; no IDE vscdb.

### S0 — disk-ingest contract + imported origin

- **Wave**: 0
- **Goal**: Compilable `session_source` module: `SessionSource` trait, `HostSessionRef`/`TuiResumePlan` types, v1 path table (env as candidate), roster of exactly six ids, stub adapters (empty list/parse, real `data_roots` + TUI argv table), `rusqlite` bundled dep on agent crate, `AgentChatOrigin::Imported` (`imported`) on Rust + api-types chat origin union.
- **Out of scope**: full jsonl/sqlite parsers; HostSessionService; WS; UI; watcher; resume convert.
- **Owns**:
  - `crates/agent/src/session_source/` (new; including stub adapter files so `mod claude;` compiles)
  - `crates/agent/src/lib.rs`
  - `crates/agent/Cargo.toml`
  - `crates/core-service/src/service/agent_chat/types.rs`
  - `packages/api-types/src/ws/dto/agent-chat.ts`
- **Forbids**: `apps/**` except nothing; `crates/core-service/src/service/host_session/**`; live `providers/*/event_map.rs`; copying research-clone product names into comments/fixtures.
- **Reads (read-only)**: `crates/agent/src/contract/**`, `crates/agent/src/map/classify.rs`, `specs/APP/APP-075_agent-sessions/TECH.md`
- **Depends**: —
- **Invariants**:
  - Canonical ids only: `claude`, `codex`, `opencode`, `pi`, `grok`, `cursor`.
  - Env override roots are candidates only when they contain real session files; otherwise default home.
  - `list` on stubs returns `[]` (missing homes empty, not error).
  - Chat origin serde `imported`; `chat_id` still Atmos UUID later.
  - No third-party session-browser product names.
- **Verify**: `cargo check -p agent -p core-service`
- **Review checklist**:
  1. Roster function returns exactly the six ids, no extras.
  2. Path table matches TECH default roots; env is candidate-gated.
  3. `AgentChatOrigin` has `Imported` / TS `"imported"`; existing `normal`/`quick` still deserialize.
  4. Stub `list` never errors on missing root.
  5. `lib.rs` exports needed types without leaking live event_map.
- **HUMAN open questions**: none
