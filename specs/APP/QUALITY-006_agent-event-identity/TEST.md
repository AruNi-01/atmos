# TEST · QUALITY-006: Idempotent Agent Chat Event Model

> Test Plan · how we verify that Agent Chat event application is idempotent, that text reassembles byte-exactly across every provider, and that the render rate stays bounded. References [TECH.md](./TECH.md).

This is a `QUALITY-*` spec with no `PRD.md`, so the coverage map is keyed to TECH milestones (M1–M5) and to the defects named in TECH's "Why the current model cannot be patched into correctness" rather than to PRD Must Haves.

## Test strategy

The governing invariant — *every event is idempotent by construction* — is a **property**, not an example. So the backbone of this plan is property tests over generated event sequences, plus fixture replays of real vendor streams. Example-based tests cover the specific defects that motivated the spec, so a regression reproduces as a named failure rather than as a probabilistic one.

- **Rust property tests** (`crates/core-service`): duplicate, reorder, and truncate-replay a generated event sequence and assert the folded state is identical. This is the only level that can prove the invariant rather than sample it.
- **Rust fixture tests** (`crates/agent`): each provider's committed `testdata/*.jsonl` replays a real vendor stream. The load-bearing assertion is that reassembling emitted chunks at their stated offsets reproduces the vendor's text byte-for-byte — this is what catches an adapter forgetting to count synthesized bytes.
- **Rust integration** (`crates/core-service`): transcript round-trip, turn-boundary compaction, crash recovery from `live.jsonl`, and the part lifecycle rules.
- **Bun tests** (`packages/api-client`): the shared fold, exercised by the same fixture corpus the Rust host fold uses, so drift between the two surfaces fails a test rather than a user report.
- **Bun tests** (`apps/web`): commit-buffer cadence and the classification that every high-frequency event kind lands on the batched schedule.
- **Playwright E2E** (`e2e/tests/specs/`): one critical journey — stream a turn, reload mid-stream, confirm the transcript is complete and unduplicated. Reserved for the cross-layer path only.
- **Exploratory agent-browser**: streaming feel, thinking/answer interleaving, and the newly visible part boundary where a provider revises text.
- **Manual-only**: nothing. Every scenario here is automatable.

No backward-compatibility scenarios exist by design — TECH forbids compatibility code, so there is nothing to test against old records. Local chat data is disposable; fixtures create their own directories.

## Coverage map

| TECH item | Scenario IDs |
|-----------|--------------|
| Idempotency invariant (all milestones) | S1, S2, S3 |
| Append-only text + byte offsets (M1) | S4, S5, S6 |
| Part identity recovered from vendor index (M1) | S6, S7 |
| Part lifecycle and turn edge cases (M1) | S8, S9, S10 |
| One shared fold, no drift (M1) | S11 |
| Log equals wire, O(n) persistence (M2) | S12, S13 |
| Non-text idempotency, tool status lattice (M3) | S14, S15 |
| Optimistic user echo by id (M3) | S16 |
| Precise per-part backfill (M4) | S17, S18 |
| Commit cadence, bounded render rate (M5) | S19, S20 |
| Cross-layer reload during stream | S21 |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Rust property | `cargo test` | `cargo test -p core-service idempotent_` | generated event sequence | folded state equal under duplication | covered |
| S2 | Rust property | `cargo test` | `cargo test -p core-service idempotent_` | generated sequence, shuffled | folded state equal under reorder | covered |
| S3 | Rust property | `cargo test` | `cargo test -p core-service idempotent_` | generated sequence, replayed from arbitrary prefix | folded state equal under partial replay | covered |
| S4 | Rust unit | `cargo test` | `cargo test -p core-service offset_` | two chunks of identical text | both applied; text is the concatenation | covered |
| S5 | Rust unit | `cargo test` | `cargo test -p core-service offset_` | overlapping and contained chunks | only the tail beyond current length is appended | covered |
| S6 | Rust fixture | `cargo test` | `cargo test -p agent` | every `providers/*/testdata/*.jsonl` | reassembled part text equals vendor text, byte-exact | covered |
| S7 | Rust fixture | `cargo test` | `cargo test -p agent claude` | Claude stream with two content blocks | two parts, distinct `part_id` from `event.index` | covered |
| S8 | Rust integration | `cargo test` | `cargo test -p core-service lifecycle_` | turn settled with open parts | every part of the turn has `closed_at` | covered |
| S9 | Rust integration | `cargo test` | `cargo test -p core-service lifecycle_` | chunk whose `turn_id` has no turn row | turn is created; chunk lands | covered |
| S10 | Rust integration | `cargo test` | `cargo test -p core-service lifecycle_` | usage/goal event with no open turn | event applies; not dropped | covered |
| S11 | Bun + Rust | `bun test`, `cargo test` | `bun test packages/api-client`, `cargo test -p core-service fold_corpus` | shared fixture corpus | both folds produce the same part map | covered |
| S12 | Rust integration | `cargo test` | `cargo test -p core-service transcript_` | streamed turn then completion | one `PartFinished` per part; `live.jsonl` truncated | covered |
| S13 | Rust integration | `cargo test` | `cargo test -p core-service transcript_` | 10 KB answer streamed in many chunks | durable bytes are O(n), not O(n²) | covered |
| S14 | Rust unit | `cargo test` | `cargo test -p core-service tool_status` | `Completed` then replayed `Running` | status stays `Completed` | covered |
| S15 | Rust unit | `cargo test` | `cargo test -p core-service tool_upsert` | patch with absent optional fields | absent fields keep prior values | covered |
| S16 | Bun test | `bun test` | `bun test apps/web/src/features/agent` | same prompt sent twice | each optimistic row settles against its own id | covered |
| S17 | Rust integration | `cargo test` | `cargo test -p core-service backfill_` | client cursor behind part length | server streams exactly the missing suffix | covered |
| S18 | Bun test | `bun test` | `bun test packages/api-client` | chunk arriving at offset beyond current length | one backfill request, no duplicate text | covered |
| S19 | Bun test | `bun test` | `bun test apps/web/src/features/agent` | 200 events inside one flush window | commit count bounded by the interval | covered |
| S20 | Bun test | `bun test` | `bun test apps/web/src/features/agent` | every event kind, one at a time | each high-frequency kind marks the buffer, none flushes immediately | covered |
| S21 | E2E | Playwright | `just test-e2e -- tests/specs/QUALITY-006_agent-event-identity.e2e.ts` | local API + web, scripted fake provider | transcript complete, no duplicate or missing text after reload | deferred |

## Scenarios

### S1 — Duplicate delivery changes nothing

- **Level**: Rust property test
- **Given**: a generated sequence of `TextChunk`, `PartClosed`, tool-state, and turn events for one chat.
- **When**: the sequence is folded once, then folded again with every event delivered a second time.
- **Then**: the resulting part map is equal to the single-delivery result.
- **Signals**: deep equality of the folded `Part` map, including `text`, `ordinal`, and `closed_at`.

### S2 — Reordered delivery changes nothing

- **Level**: Rust property test
- **Given**: the same generated sequence.
- **When**: events are shuffled within a window that can legitimately reorder on a network, then folded.
- **Then**: the folded part map equals the in-order result, or a backfill request is raised for a genuine gap and the state converges once it is served.
- **Signals**: equality after convergence; no silently missing bytes.

### S3 — Replay from an arbitrary prefix converges

- **Level**: Rust property test
- **Given**: a folded state built from the first *k* events.
- **When**: the full sequence is replayed from event zero onto that state, simulating a runtime that restarted and re-sent.
- **Then**: the final state equals the full-sequence result.
- **Signals**: equality; no duplicated text. This is the property that makes `epoch` unnecessary.

### S4 — Identical consecutive chunks both apply

- **Level**: Rust unit
- **Given**: a part with no text.
- **When**: `TextChunk{offset: 0, text: "hello"}` then `TextChunk{offset: 5, text: "hello"}` are applied.
- **Then**: the part text is `"hellohello"`.
- **Signals**: exact string equality. This is the defect `mergeStreamDelta`'s `delta === existing` branch caused.

### S5 — Overlapping and contained chunks

- **Level**: Rust unit
- **Given**: a part holding `"abcd"`.
- **When**: a chunk at offset 2 carrying `"cdef"` is applied, then the same chunk again, then a chunk at offset 0 carrying `"ab"`.
- **Then**: text is `"abcdef"` after the first, unchanged by the second and third.
- **Signals**: exact string equality at each step.

### S6 — Every provider reassembles byte-exactly

- **Level**: Rust fixture test
- **Given**: each committed `crates/agent/src/providers/*/testdata/*.jsonl` vendor stream.
- **When**: the adapter is driven through the fixture and its emitted chunks are reassembled by placing each `text` at its stated `offset`.
- **Then**: the reassembled text for every part equals the text the vendor actually sent, byte-for-byte, including adapter-synthesized separators such as Codex's reasoning `"\n\n"`.
- **Signals**: byte equality per part; no gaps and no overlaps in the offset sequence. **This is the highest-value test in the spec** — it is the only thing standing between a miscounted synthesized byte and a permanent false gap in production.

### S7 — Claude content blocks become separate parts

- **Level**: Rust fixture test
- **Given**: a Claude stream whose `content_block_delta` events carry two distinct `event.index` values.
- **When**: the adapter maps them.
- **Then**: two parts exist with distinct `part_id`, each carrying only its own block's text, ordered by `ordinal`.
- **Signals**: part count, ids derived from the vendor index, per-part text. Today these collapse into one part.

### S8 — Turn settlement closes every part

- **Level**: Rust integration
- **Given**: a turn with an open answer part, an open thinking part, and a running tool.
- **When**: `TurnCompleted` arrives, or the runtime is torn down without one.
- **Then**: every part of that turn has `closed_at` set, so no surface can derive `streaming` as true.
- **Signals**: `closed_at` present on all parts; the coalescer is empty.

### S9 — A provider-started turn is not dropped

- **Level**: Rust integration
- **Given**: no open turn and no user message.
- **When**: a `TextChunk` arrives with a `turn_id` that has no turn row, as Codex goal continuation and Claude Code re-entry produce.
- **Then**: the turn is created and the chunk lands in it.
- **Signals**: a turn row exists; the part is reachable from it.

### S10 — Conversation-scoped events bypass turn gating

- **Level**: Rust integration
- **Given**: a chat with no open turn.
- **When**: usage, goal, title, and available-command updates arrive.
- **Then**: each is applied to the chat.
- **Signals**: the corresponding field changed. These are precisely the events that arrive between turns, so gating them drops them.

### S11 — The two folds cannot drift

- **Level**: Bun test plus Rust test over a shared corpus
- **Given**: one committed corpus of event sequences with expected folded part maps.
- **When**: the corpus is run through the Rust host fold and through the shared TypeScript fold.
- **Then**: both produce the expected part map.
- **Signals**: per-case equality. A change to one implementation without the other fails here rather than in a user's transcript.

### S12 — Turn completion compacts the log

- **Level**: Rust integration
- **Given**: a turn streamed as many chunks into `live.jsonl`.
- **When**: the turn completes.
- **Then**: `transcript.jsonl` gains exactly one `PartFinished` record per part with the full text, and `live.jsonl` is truncated.
- **Signals**: record counts, reassembled text equality, `live.jsonl` length zero.

### S13 — Durable bytes are linear in content

- **Level**: Rust integration
- **Given**: a 10 KB answer streamed in many small chunks.
- **When**: the turn completes and the transcript is measured.
- **Then**: durable bytes are within a small constant factor of the content size, not quadratic in it.
- **Signals**: `transcript.jsonl` size. The current periodic-full-snapshot path writes roughly two orders of magnitude more.

### S14 — Tool status cannot regress

- **Level**: Rust unit
- **Given**: a tool call recorded as `Completed`.
- **When**: a replayed or reordered `Running` state for the same `tool_call_id` is applied.
- **Then**: the status stays `Completed`.
- **Signals**: status value. Today `status: incoming.status ?? existing.status` regresses it.

### S15 — Absent optional fields mean "no opinion"

- **Level**: Rust unit
- **Given**: a tool call with a known `name`, `params`, and `result`.
- **When**: a later state event omits those fields.
- **Then**: the prior values are kept, and no placeholder heuristic is consulted.
- **Signals**: field values unchanged; `isGenericToolLabel` and friends no longer exist.

### S16 — Duplicate prompts settle their own echoes

- **Level**: Bun test
- **Given**: the same prompt text submitted twice in a row, producing two optimistic rows.
- **When**: both persisted user messages arrive.
- **Then**: each optimistic row settles against the message carrying its own pending id, and neither is dropped or double-settled.
- **Signals**: two distinct user rows, in order, with no `pending:` prefix remaining.

### S17 — Backfill serves exactly the missing suffix

- **Level**: Rust integration
- **Given**: a part whose server text is 4096 bytes and a client that has 1024.
- **When**: the client requests backfill from offset 1024.
- **Then**: the server emits chunks covering exactly bytes 1024–4096, and nothing earlier.
- **Signals**: emitted offsets and lengths; client text equals server text afterwards.

### S18 — A gap is detected precisely, not probabilistically

- **Level**: Bun test
- **Given**: a client whose part holds 100 bytes.
- **When**: a chunk arrives stating offset 300.
- **Then**: exactly one backfill request for that part from offset 100 is raised, the chunk is not applied out of place, and no text is duplicated once the backfill is served.
- **Signals**: one request, correct `fromOffset`, final text equality.

### S19 — Commit count is bounded by the flush interval

- **Level**: Bun test
- **Given**: a fake clock and 200 events delivered inside one flush window.
- **When**: the commit buffer runs.
- **Then**: the number of committed state updates is bounded by the window count, not by the event count.
- **Signals**: commit counter. Render rate follows commit rate.

### S20 — No event kind escapes the batched schedule

- **Level**: Bun test
- **Given**: the full set of event kinds.
- **When**: each is delivered alone.
- **Then**: every high-frequency kind marks the buffer rather than flushing immediately.
- **Signals**: per-kind classification asserted explicitly. A single unmarked kind is enough to make the render rate equal the provider's chunk rate, so this is asserted per kind rather than in aggregate.

### S21 — Reload mid-stream yields a complete, unduplicated transcript

- **Level**: E2E (Playwright)
- **Given**: the local API and web app with a scripted provider that streams a long multi-part answer with interleaved thinking and tool calls.
- **When**: the page is reloaded partway through the turn and the turn is allowed to finish.
- **Then**: the final transcript matches the provider's script exactly — no duplicated sentence, no missing segment, no second assistant row for the same content.
- **Signals**: transcript text equality against the script; part count; no console error.

## Performance & load budgets

- Sustained streaming commits stay at or below the flush rate implied by the 150 ms interval, measured by the S19 counter rather than by feel.
- Durable transcript bytes stay within a small constant factor of content bytes (S13).
- Backfill after a reload transfers only the missing suffix, not the whole part (S17).

## Regression checklist

Fragile places, each already broken once or structurally easy to break.

- [ ] An adapter emits synthesized text without advancing its offset counter (S6 is the guard).
- [ ] Thinking and answer paths diverge again — they are one event kind with a `kind` field precisely so they cannot.
- [ ] A new event kind is added without classifying it for the commit buffer (S20).
- [ ] A new part kind is added without a closing path, leaving a permanent spinner (S8).
- [ ] The shared fold is copied into an app instead of imported (audit commands in TECH).
- [ ] A string comparison reappears as an identity check anywhere in the fold (audit commands in TECH).
- [ ] Backfill loops because a false gap is reported every chunk.

## Exploratory agent-browser checks

Run after the first implementation pass of M1 and again after M5. Load the installed `agent-browser` skill first, or run `agent-browser skills get core --full`; if the CLI is unavailable, see [`specs/references/agent-browser-setup.md`](../../references/agent-browser-setup.md) and record the check as `not_run` with the reason.

1. Send a prompt that produces long prose with interleaved thinking and several tool calls; watch for text appearing out of order, thinking rendering after its own completion, or tool cards landing ahead of the prose that introduced them.
2. Trigger a provider that revises text (OpenCode shorter snapshot, or Pi `text_end`) and confirm the new part renders as continuous prose without a visual seam, since this boundary is newly visible.
3. Reload during an active turn and confirm the transcript converges with no duplicate paragraph and no spinner left running.
4. Watch the streaming cadence at 150 ms commits and judge whether it reads as smooth or steppy; the interval is the single tuning knob if it does not.
5. Check for console errors, repeated backfill requests in the network panel, or a part stuck in streaming state after the turn ends.

## Acceptance criteria

Binary and merge-blocking.

- [ ] S1–S3 pass: folding is provably idempotent under duplication, reorder, and replay.
- [ ] S6 passes for **every** provider in `crates/agent/src/providers/`, with no provider skipped or marked expected-fail.
- [ ] S4 and S5 pass, proving the identical-chunk defect cannot recur.
- [ ] S11 passes, proving the Rust and TypeScript folds agree on a shared corpus.
- [ ] S20 passes per event kind, not in aggregate.
- [ ] Every audit command in TECH returns no hits.
- [ ] No compatibility code exists: no version field, no read-side fallback for old records, no dual-shape branch.
- [ ] `just lint` and `just test` pass, or scoped alternatives are recorded with a reason.
- [ ] `atmos-specs-test-run` has updated Coverage Status with exact commands and remaining gaps.

## Manual verification steps

None. Every scenario is automatable, and the exploratory agent-browser checks above cover the judgement calls that automation cannot make.

## Non-coverage

- Old on-disk records and old wire shapes. TECH forbids compatibility code, so there is nothing to verify.
- Streaming tool-call arguments. No provider sends partial JSON, so the offset model is deliberately not applied there.
- Multi-Computer concurrent writes to one chat. A chat is owned by one machine.
- SQLite as a transcript backend. Out of scope in TECH.

## Coverage Status

_Last run: 2026-09-20 · QUALITY-006 coverage pass. S1–S20 executable and green; S21 deferred._

### Commands

- `cargo test -p agent s6_` — 14 passed (claude / codex / opencode / pi / grok / acp reassembly).
- `cargo test -p agent s7_two_content_block` — 1 passed.
- `cargo test -p core-service -- idempotent_ offset_ lifecycle_ transcript_ coalesce_ tool_ fold_corpus backfill_` — 42 passed (libtest substring filter also matches a few unrelated `tool_*` / `fold_*` names).
- `cargo test -p core-service` — 707 passed.
- `bun run --filter @atmos/api-client test` — 32 passed.
- `bun run --filter @atmos/api-types test` — 24 passed.
- `cd apps/web && bun test src/features/agent/lib/__tests__/agent-chat-commit-buffer.test.ts src/features/agent/lib/__tests__/agent-chat-pending-echo.test.ts src/features/agent/lib/__tests__/agent-chat-events.test.ts` — 53 passed.
- `just test-e2e -- tests/specs/QUALITY-006_agent-event-identity.e2e.ts` — not run; spec file does not exist.
- `just lint` / `cargo clippy -p core-service --tests -- -D warnings` — not claimed green. Clippy dies on pre-existing dirty-tree `crates/agent` (`grok/chrome.rs` `if_same_then_else`, `session_source/adapters/cursor.rs` `too_many_arguments`). New test files have no IDE lints.
- Official `cd apps/web && bun test src/features/agent` — not run; known dirty (composer DOM segfault / APP-075 source-scan), out of scope.

### Scenarios

- S1 — covered by `crates/core-service/src/service/agent_chat/types.rs::idempotent_tests::idempotent_duplicate_delivery_changes_nothing`
- S2 — covered by `...::idempotent_reordered_delivery_converges` (gap → suffix from in-order map; early `PartClosed` held until the part exists)
- S3 — covered by `...::idempotent_prefix_replay_converges`
- S4 — covered by `...::offset_identical_chunks_both_apply` and `packages/api-client/src/agent-chat/fold.test.ts` S4
- S5 — covered by `...::offset_overlapping_and_contained_chunks` and `fold.test.ts` S5
- S6 — covered by `cargo test -p agent s6_` on every adapter family (cursor via ACP)
- S7 — covered by `providers::claude::event_map::tests::s7_two_content_block_indexes_become_two_answer_parts`
- S8 — covered by `lifecycle_turn_settlement_closes_every_part`, `lifecycle_teardown_closes_every_open_part`, `lifecycle_load_without_runtime_closes_leftover_open_parts`
- S9 — covered by `lifecycle_chunk_creates_missing_turn`
- S10 — covered by `lifecycle_usage_and_goal_apply_without_open_turn`
- S11 — covered by shared `packages/api-client/src/agent-chat/fixtures/fold-corpus.json` via `fold_corpus_rust_matches_expected_part_map` and `packages/api-client/src/agent-chat/fold-corpus.test.ts`
- S12 — covered by `transcript_turn_completion_compacts_the_log`
- S13 — covered by `transcript_durable_bytes_are_linear_in_content`
- S14 — covered by `tool_status_completed_does_not_regress_to_running`
- S15 — covered by `tool_upsert_absent_optionals_keep_prior`
- S16 — covered by `apps/web/src/features/agent/lib/__tests__/agent-chat-pending-echo.test.ts` `S16 settles duplicate prompts against their own pending ids`
- S17 — covered by `backfill_serves_exactly_the_missing_suffix`
- S18 — covered by `packages/api-client/src/agent-chat/fold.test.ts` S18 and `apps/web/src/features/agent/lib/__tests__/agent-chat-events.test.ts` S18
- S19 — covered by `agent-chat-commit-buffer.test.ts` S19
- S20 — covered by `agent-chat-commit-buffer.test.ts` S20 (per high-frequency kind, plus remaining kinds flush)
- S21 — deferred / `not_run`: no `e2e/tests/specs/QUALITY-006_agent-event-identity.e2e.ts`. `FakeAgentProvider` is a Rust unit double only. A Playwright scripted provider that streams a long multi-part answer would need a production/test-harness hook; not invented here.

### Exploratory agent-browser

- `not_run`: CLI is installed (`/opt/homebrew/bin/agent-browser`) and the skill file exists, but local web (`:3030`) and API (`:30303`) were not listening. Did not stand up the full app for this coverage pass.

### Remaining gaps

- S21 Playwright journey needs a harness-level scripted provider (impl / e2e fixture work).
- Agent-browser checks 1–5 once a local app is up.
- `just lint` and full `just test` / `cd apps/web && bun test src/features/agent` are not claimed green (dirty tree + known web noise).
- TECH audit greps: heuristic symbols absent except a negative test mention of `mergeStreamDelta`. One `applyTextChunk` implementation in `@atmos/api-client`; web imports it. Claude `event.index`, Codex `summaryIndex`, OpenCode `partID`, Pi `contentIndex` are present.
