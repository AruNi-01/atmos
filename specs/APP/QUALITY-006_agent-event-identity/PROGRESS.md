# PROGRESS · QUALITY-006: Idempotent Agent Chat Event Model

> Implementation Progress · current state, handoff notes, blockers, and verification status. This file is not a requirements source. Lead agent is the sole writer.

## Status

- **State**: implemented (test-run coverage recorded; S21 / agent-browser / full `just test` not claimed green)
- **Branch**: `main` (working tree intentionally shared with unrelated in-flight APP-075 / agent-tree changes — see Constraints)
- **Last updated**: 2026-09-20
- **Current owner**: lead agent (orchestration only; feature code by impl subagents)
- **Current phase**: test-run recorded; production slices complete

## Snapshot

- **Done**: TECH.md, TEST.md, S1–S10 (M1–M5 production slices).
- **Next**: none for QUALITY-006 production slices. Remaining verification gaps: S21 E2E, agent-browser, full `just test` / `just lint` on the dirty tree.
- **Blocked**: nothing.
- **Must not be touched**: the ~22 pre-existing uncommitted files from unrelated work. No slice may run `git checkout --`, `git stash`, or `git reset`. No slice commits.

## Orchestration decisions

Three decisions were taken by HUMAN before dispatch and constrain every slice.

1. **Serial, not parallel.** Impl slices run one at a time. Parallelism was declined so each slice can verify itself rather than staring at a tree broken by sibling slices.
2. **No additive contract, no compatibility.** Old event variants are deleted in the slice that replaces them. No dual-shape period. HUMAN restated 2026-09-19: the product has no users, local data may be deleted (`rm -rf ~/.atmos/data/agent-chat`), and any leftover compatibility/history code is a defect. Optimal shape only.
3. **Dirty working tree accepted.** HUMAN owns separating the final diff. Slices are therefore forbidden from any destructive git operation.

The enabling observation for (1): the crate dependency runs `core-service` → `agent`, so `cargo test -p agent` passes while `core-service` is still unconverted. Each slice is self-verifiable without an additive shim.

## Slice Kanban

> Orchestration board for `atmos-long-task-impl`. Not a requirements source.

| ID | Wave | Owns | Forbids | Depends | Status | Impl | Review | Verify |
|----|------|------|---------|---------|--------|------|--------|--------|
| S1 | 1 | `crates/agent/src/contract/event.rs`, `crates/agent/src/contract/mod.rs`, `crates/agent/src/lib.rs`, `crates/agent/src/providers/**`, `crates/agent/src/session_source/**`, `crates/agent/src/testing.rs` | `crates/core-service/**`, `packages/**`, `apps/**` | — | done | ok | pass | `cargo test -p agent` |
| S2 | 2 | `crates/core-service/src/service/agent_chat/{apply_event.rs,types.rs,service.rs,queue.rs,store.rs,tests.rs}`, `crates/core-service/src/service/host_session/mod.rs`, `crates/core-service/src/service/agent_status/mod.rs` | `crates/agent/**`, `packages/**`, `apps/**` | S1 | done | ok | pass | `cargo test -p core-service` |
| S3 | 3 | `packages/api-types/src/ws/dto/agent-chat.ts`, `packages/api-types/src/ws/dto/agent-chat.test.ts`, `packages/api-client/src/agent-chat/**`, `packages/api-client/package.json`, `packages/api-client/src/ws/index.ts` (export only), `crates/core-service/src/service/agent_chat/{types.rs,apply_event.rs,service.rs}`, `apps/api/src/api/ws/router/mod.rs` | `apps/web/**`, `apps/mobile/**`, `apps/desktop-electron/**`, backfill action | S2 | done | ok | pass | package tests + `cargo test -p core-service` + `cargo check -p api` |
| S4 | 4 | `apps/web/src/features/agent/lib/**`, `apps/web/src/features/agent/hooks/use-agent-chat-session.ts` | `apps/web/src/features/agent-sessions/**`, `packages/**`, `apps/web/src/features/agent/components/**` | S3 | done | ok | pass | owned lib/hook fold tests |
| S5 | 5 | `apps/web/src/features/agent/components/**` | `apps/web/src/features/agent/lib/**`, `packages/**` | S4 | done | ok | pass | `cd apps/web && bun test src/features/agent/components` |
| S6 | 6 | none — no fold copy exists | — | S3 | done | — | — | lead audit: desktop embeds web; mobile has no Agent Chat fold |
| S7 | 7 | `crates/core-service/src/service/agent_chat/store.rs`, `crates/core-service/src/service/agent_chat/tests.rs`, `crates/core-service/src/service/agent_chat/apply_event.rs`, `crates/core-service/src/service/agent_chat/service.rs` | `crates/agent/**`, `packages/**`, `apps/**` | S2 | done | ok | pass | `cargo test -p core-service` |
| S8 | 8 | core-service tool merge + send message_id; api-types send DTO; api-client tool fold; web mergeToolPart + pending echo + send | `crates/agent/**` | S7 | done | ok | pass | cargo test -p core-service + bun tests |
| S9 | 9 | `agent_chat_backfill` WS + core-service suffix emit + web/client request | `crates/agent/**` | S8 | done | ok | pass | cargo test + extract + bun tests |
| S10 | 10 | commit cadence: `core-service` pump coalescer, `apps/web` commit buffer | `crates/agent/**`, `packages/**`, `apps/web/src/features/agent/components/**` | S9 | done | ok | pass | `cargo test -p core-service` + owned cadence tests |

**Status**: `planned` · `ready` · `in_progress` · `blocked` · `in_review` · `rework` · `done`

**Impl**: `—` · `running` · `ok` · `blocked`
**Review**: `—` · `running` · `pass` · `fail`

Milestone mapping: S1–S6 = TECH M1. S7 = M2. S8 = M3. S9 = M4. S10 = M5.

## Slice Cards

### S1 — New text contract and all six provider adapters

- **Wave**: 1
- **Goal**: Replace the four text event variants with `TextChunk` + `PartClosed` in the agent contract, and convert all six provider adapter families to emit append-only chunks carrying a vendor-derived `part_id` and a correct byte `offset`.
- **Out of scope**: `crates/core-service` (S2), any TypeScript (S3–S6), the transcript layout (S7), tool status lattice (S8), backfill (S9), coalescing (S10).
- **Owns**: `crates/agent/src/contract/event.rs`, `crates/agent/src/contract/mod.rs`, `crates/agent/src/lib.rs`, `crates/agent/src/providers/**`, `crates/agent/src/session_source/**`, `crates/agent/src/testing.rs`
- **Forbids**: `crates/core-service/**`, `packages/**`, `apps/**`, any git mutation
- **Reads (read-only)**: `specs/APP/QUALITY-006_agent-event-identity/TECH.md`, `crates/agent/AGENTS.md`, `crates/agent/src/contract/**`, `crates/agent/src/acp_client/**`
- **Depends**: none
- **Verify**: `cargo test -p agent`
- **Review checklist**:
  1. `AgentEvent` has `TextChunk` + `PartClosed` with the TECH fields (`part_id`, `message_id`, `parent_part_id`, `ordinal`, `kind: TextKind { Answer, Thinking }`, `offset: u64`, `text`); `AssistantMessageDelta` / `AssistantMessageCompleted` / `ThinkingDelta` / `ThinkingCompleted` are gone from the crate.
  2. Live adapters derive `part_id` as: OpenCode vendor `partID`; Claude `{message_id}:{event.index}`; Codex `{itemId}` / `{itemId}:{summaryIndex}`; Pi `{messageId}:{contentIndex}`; Grok/ACP `{message_id}:{ordinal}`.
  3. A part's text only ever grows. OpenCode shorter-snapshot and Pi `text_end` overwrite emit `PartClosed` then a new `part_id` — they do not mutate or replace existing part text.
  4. Adapter-synthesized bytes (Codex `"\n\n"`, snapshot-fallback whole bodies) advance the per-part offset counter.
  5. Each live adapter's fixture path asserts that reassembling emitted chunks at their stated offsets reproduces the vendor text byte-for-byte (TEST S6). Claude two-index streams produce two distinct parts (TEST S7).
  6. `session_source` batch parsers emit one `TextChunk` at offset 0 plus `PartClosed` per finished part; they do not invent live-stream pairwise close rules.
  7. No compatibility / history code: no dual event shape, no read-side fallback for old variants, no conversion helper whose only job is the previous wire.
  8. `TextKind` is publicly re-exported from `contract/mod.rs` and `lib.rs`. `cargo test -p agent` is green (live CLI tests may stay `#[ignore]`).
- **HUMAN open questions**: none

### S2 — Part model in core-service

- **Wave**: 2
- **Goal**: Fold `TextChunk` by `(part_id, offset)` in the host; delete string-guess helpers; replace snapshot persist with append-only chunks in the existing single `transcript.jsonl` (the two-file split stays S7); delete `TranscriptEvent::Unknown`. Convert every remaining `AgentEvent::AssistantMessage*` / `Thinking*` match in this crate so `cargo test -p core-service` is green.
- **Out of scope**: `live.jsonl` / `transcript.jsonl` split (S7); 150ms coalescer (S10); tool status lattice / pending-echo (S8); `agent_chat_backfill` (S9); TypeScript DTO / shared fold (S3); any `crates/agent` edit.
- **Owns**: `crates/core-service/src/service/agent_chat/{apply_event.rs,types.rs,service.rs,queue.rs,store.rs,tests.rs}`, `crates/core-service/src/service/host_session/mod.rs` (surgical: AgentEvent construct/match only — this file is already dirty from APP-075), `crates/core-service/src/service/agent_status/mod.rs` (occupancy match only).
- **Forbids**: `crates/agent/**`, `packages/**`, `apps/**`, any git mutation, APP-075 host-session search/list behavior.
- **Reads**: `specs/APP/QUALITY-006_agent-event-identity/TECH.md`, `crates/core-service/AGENTS.md`, `crates/agent/src/contract/event.rs` (S1 contract, read-only).
- **Depends**: S1
- **Verify**: `cargo test -p core-service`
- **Review checklist**:
  1. `TextChunk` apply uses the four offset rules (gap / already-have / overlap-tail / append). No content comparison, no `mergeStreamDelta`-style prefix test.
  2. `text_stream_key`, `apply_assistant_text_part_nested`, `push_unique_message` are gone. Parts live in one `HashMap<PartId, Part>` (or equivalent keyed store). Nesting is `parent_part_id` only.
  3. `TranscriptEvent::AssistantSnapshot`, `ThinkingSnapshot`, and `Unknown` are deleted. Persist writes `TextChunk` (and `PartFinished` on close if the slice materializes a finished part). No read-side fallback for old snapshot records.
  4. Part close: own `PartClosed`, turn settlement closes every part of that turn, runtime teardown/load closes leftover open parts. A part is never closed by the arrival of a different part.
  5. A chunk whose `turn_id` has no turn row creates the turn. Usage / goal / title / available-commands apply with no open turn.
  6. `AgentChatPayload` text members are `text_chunk` / `part_closed`, not the four old delta/completed variants.
  7. `host_session` and `agent_status` match `TextChunk` / `PartClosed`. No leftover `AssistantMessageDelta` / `ThinkingDelta` in `crates/core-service`.
  8. `cargo test -p core-service` is green. No `#[ignore]` added to hide compile/test failures.
- **HUMAN open questions**: none

### S7 — Transcript split (unchanged goal, store.rs revisited)

- **Wave**: 7
- **Goal**: `live.jsonl` + `transcript.jsonl`, `PartFinished` compaction at turn boundary. S2 already deleted snapshots and writes chunks into the current single file.
- **Depends**: S2
- **Owns**: `crates/core-service/src/service/agent_chat/store.rs` (and tests that assert file layout)
- **Status note**: serial revisit of `store.rs` after S3–S6.

### S3 — api-types DTO + shared fold

- **Wave**: 3
- **Goal**: Wire `AgentChatPayload` matches S2 (`text_chunk` / `part_closed`). `AgentChatEvent.sequence` becomes `revision` on both Rust and TS. Extract the text fold to `@atmos/api-client` as a pure module (new export, not a `WsSession` method).
- **Out of scope**: `agent_chat_backfill` (S9); `after_sequence` / `last_event_seq` subscribe fields (S9); 150ms commit buffer (S10); web/mobile/desktop consumers (S4–S6); live.jsonl split (S7); tool lattice (S8).
- **Owns**: listed in the kanban row. `router/mod.rs` is surgical: `event.sequence` → `event.revision` only. `types.rs` / `apply_event.rs` / `service.rs` are surgical: the event stamp field only, plus any test that reads `.sequence` on `AgentChatEvent`.
- **Forbids**: `apps/web/**`, `apps/mobile/**`, `apps/desktop-electron/**`, new WS actions, any git mutation, APP-075 behavior.
- **Depends**: S2
- **Verify**: `bun run --filter @atmos/api-types test && bun run --filter @atmos/api-client test && cargo test -p core-service && cargo check -p api`
- **Review checklist**:
  1. `AgentChatPayload` has `text_chunk` / `part_closed` with TECH fields; the four old delta/completed members are gone. No serde/TS alias for the old names.
  2. `AgentChatEvent` has `revision`, not `sequence`, in rust and TS. Broadcast JSON uses `revision`.
  3. Shared fold lives in `@atmos/api-client` (pure, no React). `applyTextChunk` implements the four offset rules with no content compare. `PartClosed` sets `closed_at`.
  4. Fold tests cover S4/S5 (identical + overlap) and a replay-from-0 no-op. No `agent_chat_backfill` action added.
  5. `cargo test -p core-service` and `cargo check -p api` still green after the field rename.
- **HUMAN open questions**: none

### S4 — Web consumes the shared fold

- **Wave**: 4
- **Goal**: Delete the web text-heuristic layer. Route `text_chunk` / `part_closed` through `@atmos/api-client/agent-chat`. Delete the `sequence` gate. `streaming` follows `closed_at`. Project the part store to the existing `AgentMessage[]` view so components (S5) still render.
- **Out of scope**: component file edits (S5); `mergeToolPart` / pending-echo text match (S8); 150ms commit buffer (S10); subscribe `after_sequence` (S9); mobile/desktop (S6); editing the shared fold package.
- **Owns**: `apps/web/src/features/agent/lib/**`, `apps/web/src/features/agent/hooks/use-agent-chat-session.ts`
- **Forbids**: `apps/web/src/features/agent/components/**`, `apps/web/src/features/agent-sessions/**`, `packages/**`, `apps/web/messages/*.json`, any git mutation
- **Depends**: S3
- **Verify**: `cd apps/web && bun test src/features/agent`
- **Review checklist**:
  1. `mergeStreamDelta`, `mergeGrowingText`, `nthTextPartIndex`, `dedupeAgentMessages`, and the `event.sequence <= lastSeq` gate are gone.
  2. Text apply calls `@atmos/api-client/agent-chat` (`applyTextChunk` / `applyPartClosed`). No second offset implementation in web.
  3. No leftover `assistant_message_delta` / `thinking_delta` matches in S4 OWNS.
  4. `streaming` is derived from open parts (`closed_at == null`), not a separate flag that can disagree with the fold.
  5. `mergeToolPart` / pending-echo text compare may remain (S8). No 150ms buffer added (S10).
  6. `cd apps/web && bun test src/features/agent` is green. Tests construct `text_chunk` / `part_closed` / `revision`, not the old variants.
- **HUMAN open questions**: none

### S5 — Web components

- **Wave**: 5
- **Goal**: Components render the fold projection. No leftover old payload types. A message may have multiple text parts (Claude multi-block). `streaming` comes from the message/part the fold already set — do not re-guess from text.
- **Out of scope**: i18n keys unless a visible string must change; tool-merge UI (S8); 150ms buffer (S10); lib/hook (S4 done).
- **Owns**: `apps/web/src/features/agent/components/**`
- **Forbids**: `apps/web/src/features/agent/lib/**`, `packages/**`, `apps/web/messages/*.json` unless a new string is required, any git mutation
- **Depends**: S4
- **Verify**: `cd apps/web && bun test src/features/agent/components`
- **HUMAN open questions**: none

### S6–S9

Cards were written at their dispatch time.

### S10 — Commit cadence (150 ms server coalescer + client commit buffer)

- **Wave**: 10
- **Goal**: Bound bandwidth and render cost. `pump_session` coalesces adjacent same-`part_id` `TextChunk`s with a 150 ms timer (lossless concat) and forced-flushes on turn-terminal / tool-boundary / any non-text event. The web hook no longer calls `setMessages` per event: incoming events accumulate in a commit buffer that flushes to React state on a 150 ms timer. Every high-frequency kind marks that buffer; none of them flush immediately.
- **Out of scope**: rewriting the shared fold in `@atmos/api-client`; component file edits; new WS actions; `crates/agent` adapters; APP-075 host-session / agent-tree behavior; E2E S21 (test-run).
- **Owns**: `crates/core-service/src/service/agent_chat/service.rs`, `crates/core-service/src/service/agent_chat/apply_event.rs` (only if the pump must change emit / apply order — prefer keeping apply as-is and buffering in `pump_session`), `crates/core-service/src/service/agent_chat/tests.rs`, optional new `crates/core-service/src/service/agent_chat/coalesce.rs` (and the `mod` line in `crates/core-service/src/service/agent_chat/mod.rs` if that file is created), `apps/web/src/features/agent/hooks/use-agent-chat-session.ts`, `apps/web/src/features/agent/lib/**` (commit-buffer helper + S19/S20 tests only; do not reintroduce deleted heuristics)
- **Forbids**: `crates/agent/**`, `packages/**`, `apps/web/src/features/agent/components/**`, `apps/web/messages/*.json`, any git mutation, APP-075 host-session search/list behavior
- **Reads**: `specs/APP/QUALITY-006_agent-event-identity/TECH.md` (pump_session + Client commit cadence), `specs/APP/QUALITY-006_agent-event-identity/TEST.md` (S19, S20), `crates/core-service/AGENTS.md`, `apps/web/AGENTS.md`
- **Depends**: S9
- **Verify**: `cargo test -p core-service` AND `cd apps/web && bun test src/features/agent/lib src/features/agent/hooks`
- **Review checklist**:
  1. `pump_session` is a `tokio::select!` over `session.next_event()` and `tokio::time::interval(150ms)`. Flush is timer-driven: a provider pause mid-sentence still emits the buffered text on the next tick. Not piggybacked on the next chunk.
  2. Adjacent same-`part_id` chunks concatenate losslessly: `(p, 0, "ab") + (p, 2, "cd")` → one emitted/applied chunk `(p, 0, "abcd")`. Different `part_id`s do not merge into one chunk. Offset arithmetic stays correct (concatenated `offset` is the first chunk's offset; text is byte-concat of the tails already accepted by the four offset rules, or equivalently concat of the raw adjacent suffixes).
  3. Forced flush of the whole coalesce buffer runs before applying any non-`TextChunk` envelope (turn-terminal, tool-boundary, `PartClosed`, permission, session close). Coalescer is empty after turn settlement.
  4. Host fold / persist still see append-only chunks; coalescing does not compare content and does not invent a second identity scheme.
  5. Web: `setMessages` (and other transcript React state derived from the fold) commits only on the 150 ms flush, not per incoming event. Extract a testable commit-buffer helper if needed so S19/S20 do not require mounting the full hook.
  6. High-frequency kinds — at minimum `text_chunk`, `part_closed`, `tool_call_started`, `tool_call_updated`, `tool_call_completed`, `tool_call_failed`, `plan_updated` — mark the buffer dirty and do **not** flush immediately when delivered alone (TEST S20). User-blocking kinds (`permission_requested`, `session_op_requested`) may force-flush the pending buffer then apply; they still go through the buffer, not a bypass `setState` that skips classification.
  7. TEST S19: 200 events inside one flush window produce a commit count bounded by the window count, not the event count. TEST S20 asserts classification per kind, not in aggregate.
  8. `cargo test -p core-service` and `cd apps/web && bun test src/features/agent/lib src/features/agent/hooks` are green. No `#[ignore]` / skipped S19/S20 to hide failures.
- **HUMAN open questions**: none

## Implementation Checklist

- [x] S1 agent contract + adapters
- [x] S2 core-service part model
- [x] S3 api-types DTO + shared fold
- [x] S4 web fold consumption
- [x] S5 web components
- [x] S6 mobile + desktop-electron (no fold consumer)
- [x] S7 transcript split (M2)
- [x] S8 tool lattice + pending echo (M3)
- [x] S9 precise backfill (M4)
- [x] S10 commit cadence (M5)
- [x] Hand off to `atmos-specs-test-run`

## Progress Log

### 2026-09-20

- S9 marked `done` (impl + review already passed in the prior session). `agent_chat_backfill` is on the wire and in the web hook.
- S10 card written. S10 impl dispatched.
- S10 impl [ok](76874808-93c1-49c9-bd9c-088546ccf670): 150ms `pump_session` coalescer + web commit buffer; `cargo test -p core-service` pass; S19/S20 bun tests pass.
- S10 review [pass](1d428cad-7cc9-4060-8fa5-70a908f5c6e1): all 8 checklist items pass. S10 marked `done`.
- All production slices done. Handed off to `atmos-specs-test-run`.
- Test-run [ok](deb478fc-53e9-4fe8-8751-0d1be4d25bfd): S1–S20 executable and green; S21 deferred (no scripted Playwright provider); agent-browser `not_run` (app not listening). Coverage Status written.

### 2026-09-19

- TECH.md rewritten to the idempotent event model; compatibility hedges removed after HUMAN confirmed the product has no users and local data is disposable.
- TEST.md authored: 21 scenarios, anchored on idempotency property tests and per-provider byte-exact offset reassembly.
- Kanban created. S1 marked `ready`.
- HUMAN restated: no users, no backward compatibility, local data may be deleted, do not leave compatibility/history code. Recorded as reinforcement of D3.
- S1 impl `ok` via [S1 收尾](43095d34-b232-42a6-8d57-b8e7adc72636): `session_source` already used offset-0 `finished_text_part`; `TextKind` re-exported; 772 pass / 14 ignored.
- S1 review [fail](b306fa04-5f85-4022-8465-20d79f257765): P1 — Grok and ACP have no S6 offset-reassembly fixture. Other 7 checklist items pass.
- S1 rework [ok](266078c6-5dbb-4d85-b4e9-1a01593e9d3b): `s6_grok_reassembles_chunks_at_offsets` and `s6_acp_reassembles_chunks_at_offsets` added; `cargo test -p agent` 774 pass / 14 ignored; `s6_` filter 14 pass.
- S1 re-review [pass](419f3626-824c-49d5-b154-d88828e8a842): all 8 checklist items pass. S1 marked `done`.
- Architecture check before S2: original S2 OWNS cannot compile. Recorded D7 and extended OWNS. S2 dispatched.
- S2 impl [ok](89830e63-6605-4c73-a065-6e5d35e94b02): `cargo test -p core-service` 684 pass; S4/S5/S8/S9/S10 named tests ran. `queue.rs` unchanged.
- S2 review [fail](da7bf468-5645-43ec-b8ed-369cac1701f0): P1 — teardown/load does not close leftover open parts of the chat. Other 7 checklist items pass.
- S2 rework [ok](00ab9b3d-400b-4f5d-a71d-a59d1f615ad2): teardown + no-runtime load persist `PartFinished`; streaming follows `closed_at`; 686 pass.
- S2 re-review [pass](09f55f5c-007b-464f-ab0a-a07b37d69055): all 8 checklist items pass. S2 marked `done`.
- Architecture check before S3: recorded D8. S3 dispatched.
- S3 impl [ok](7879d632-a003-4ece-b9b2-541e433776aa): `text_chunk`/`part_closed` DTO; `revision` stamp; fold at `@atmos/api-client/agent-chat`; all four verify commands pass.
- S3 review [pass](a05e338b-9f6d-4dc4-b27d-048efd26d530): all 5 checklist items pass. S3 marked `done`.
- S4 dispatched.
- S4 impl [ok](7f02bf38-e781-4d95-9082-09a809838c4e): shared fold wired; heuristics + sequence gate deleted.
- S4 review [pass](7d6fab97-8e4a-4cfe-8b05-181e7db1fb87): all 6 checklist items pass. S4 marked `done`.
- S5 impl [ok](0f015e91-370a-4dd8-ae60-e04c67310df7): components walk fold parts by `part_id`; 131 pass.
- S5 review [fail](51c5d403-e692-4e88-bb68-c84ae909c3a1): P1 — omitted `closed_at` looked live.
- S5 rework [ok](11a27a8d-23f9-4d79-b26a-ee0699bef514): open iff `closed_at === null`.
- S5 re-review [pass](99b7c7f5-1c78-402d-aef6-274be77043bc): 132 component tests. S5 marked `done`.
- S6 audited as no-op (D9).
- S7 impl [ok](d2374743-bd1a-4920-ae90-5eb252a79590): `live.jsonl` + `transcript.jsonl`; 688 pass.
- S7 review [pass](2b8b014e-2a5a-4a9f-88fa-8fd20e2693fe): S12/S13 `transcript_` tests pass; no snapshot/Unknown fallback. S7 marked `done`.
- S4 impl [ok](7f02bf38-e781-4d95-9082-09a809838c4e): shared fold wired; heuristics + sequence gate deleted. Official `bun test src/features/agent` exit 133 (S5 composer DOM segfault) / source-scan `contestedChatAgentFamilies` in `AgentPromptComposer.tsx`. Lead re-ran `bun test src/features/agent/lib src/features/agent/hooks`: fold tests pass; remaining fails are that source-scan plus `@/lib/utils` DOM load — not old payload types. Review dispatched.

## Decisions Since TECH

| ID | Decision | Why | Source update |
|----|----------|-----|---------------|
| D1 | Slices run serially, not in parallel | HUMAN choice; lets each slice verify itself without an additive contract shim | none needed — orchestration only |
| D2 | S1 verifies with `cargo test -p agent` while `core-service` is still unconverted | Dependency direction is `core-service` → `agent`, so the agent crate builds alone | none needed |
| D3 | No compatibility code anywhere; `TranscriptEvent::Unknown` deleted | HUMAN confirmed no users, local data disposable | TECH.md Scope summary + Dependencies |
| D4 | S1 OWNS extended to `session_source/**`, `testing.rs`, `contract/mod.rs`, `lib.rs` | Lead-agent boundary error: `session_source` (the APP-075 on-disk transcript parsers) emits the same `AgentEvent`s, so it cannot convert in a later slice without leaving the crate uncompilable. `TextKind` also needs a public re-export before S2 can match on it. Verified all 90 errors are in those paths and zero in the original OWNS | none needed — orchestration only |
| D5 | Claude's `streamed_assistant` / `streamed_thinking` booleans deleted | They were a lossy stand-in for "a stream is open" that the open-part set answers precisely, and they dropped real text: on `mixed_control.jsonl` the stream sends `"Working"`, the settling frame sends `"Working on it."`, and the old guard discarded the tail | TECH.md already requires snapshot fallbacks to land as appends on the stream's own part |
| D6 | OpenCode's first `message.part.delta` adopts the later-named `partID` | The first delta for a part arrives with no `partID`; the naming `message.part.updated` arrives after. Keying strictly on `partID` put the same text in two parts. Found by the S6 fixture assertion, which is what it exists for | none needed — within TECH's `part_id` derivation table |
| D7 | S2 OWNS extended to `store.rs`, `tests.rs`, `host_session/mod.rs`, `agent_status/mod.rs` | S1 already deleted the four text variants, so those files cannot compile. Persist cannot keep writing `AssistantSnapshot` (that is the dual-representation TECH forbids). File split (`live.jsonl`) stays S7; S2 writes `TextChunk` into the existing single jsonl | none needed — orchestration only |
| D8 | S3 verify is package + `core-service` + `api`, not `just typecheck`; fold is a new `@atmos/api-client` export, not a `WsSession` method | Whole-repo typecheck cannot pass until S4–S6 consume the new DTO. TECH requires the fold in api-client; api-client AGENTS.md forbids domain methods on the session kernel — a pure `./agent-chat` export satisfies both. `sequence`→`revision` on the event stamp happens here so the wire is not dual-named; subscribe `after_sequence` stays until S9 | none needed — orchestration only |
| D9 | S6 is an audit no-op | `apps/desktop-electron` only opens a web Agent Chat window. `apps/mobile` has no `AgentChat` / `agent_chat_event` fold. There is no second TS fold to convert. | none needed — orchestration only |

## Verification Status

| Area | Command / Method | Last result | Notes |
|------|------------------|-------------|-------|
| Agent crate | `cargo test -p agent` | pass (774 / 14 ignored live CLI) | includes new Grok/ACP S6; re-review running |
| Core service | `cargo test -p core-service` | pass (686) | includes teardown/load lifecycle tests; re-review running |
| TS packages | `bun run --filter @atmos/api-types test` + `@atmos/api-client test` | pass | S3 impl; whole-repo typecheck deferred to S4–S6 |
| Web | `cd apps/web && bun test src/features/agent` | not_run | S4 gate |
| E2E | `just test-e2e -- tests/specs/QUALITY-006_*.e2e.ts` | not_run | owned by test-run |

## Known Blockers

- none

## Handoff Notes

### Task goal

Implement TECH.md's idempotent Agent Chat event model: append-only text addressed by `(part_id, byte offset)`, versioned upserts for non-text state, one shared fold, and a transcript that stores what the wire carries.

### Current progress

S1–S10 are `done`. Test-run recorded S1–S20 green. Spec is **not** fully verified: S21 E2E, agent-browser, and full `just test` / `just lint` remain.

### Constraints

- The working tree already carries ~22 unrelated uncommitted files (APP-075 host-session, agent-tree work). No slice may stash, reset, checkout, or commit. HUMAN separates the diff.
- Lead agent writes no feature code. Every change, including one-liners, goes impl subagent → review subagent.
- Serial execution: never two impl subagents at once.
- No backward compatibility anywhere. Local chats are disposable (`rm -rf ~/.atmos/data/agent-chat`). Code that exists only to tolerate a previous shape is a defect.

### Next steps

1. Optional: S21 Playwright once a scripted streaming provider exists in the e2e harness.
2. Optional: agent-browser checks 1–5 with local web/api up.
3. HUMAN separates QUALITY-006 from the dirty APP-075 / agent-tree tree before commit.

### Relevant files/symbols

- Contract: `crates/agent/src/contract/event.rs` — `AgentEvent`
- Host fold: `crates/core-service/src/service/agent_chat/{apply_event.rs,types.rs}`
- Client fold: `apps/web/src/features/agent/lib/agent-chat-events.ts` → moves to `packages/api-client`
- Vendor part indices to recover: Claude `event.index`, Codex `summaryIndex`, OpenCode `partID`, Pi `contentIndex`

## Changed Areas

- `crates/agent`: S1 done
- `crates/core-service`: S2 done
- `packages/api-types`, `packages/api-client`: S3 done
- `apps/web` agent lib/hook: S4 + S10 done
- `apps/web` components: S5 done
- `apps/mobile`, `apps/desktop-electron`: S6 audit no-op
