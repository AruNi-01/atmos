# TEST · QUALITY-008: Agent Chat UI Optimization

> Test Plan · how we verify the shipped Agent Chat live-wire and transcript UI. References [TECH.md](./TECH.md).
> As-built backfill for [PR #305](https://github.com/AruNi-01/atmos/pull/305) (`6c58811b6`) plus the #307 recorded-ordinal slot-sort.

This is a `QUALITY-*` spec with no `PRD.md`. Coverage is keyed to the TECH quality table and the defects in TECH "Motivation / problems", not to product Must Haves. The product code is already on `main`; this file records the gates that exist and the device runs that already happened.

## Test strategy

The load-bearing invariants are **properties of fold / emit / scroll helpers**, so the backbone is named Rust and Bun tests. Device runs cover feel (stick-to-bottom, flush at turn end, Cursor ACP streaming) that unit tests cannot see.

- **Rust unit / integration** (`crates/core-service`): `TurnSnapshot` emit, 56 ms coalesce window, get-then-seq restore, per-turn `push_recent`, `opened_at` timestamps, recorded-ordinal slot-sort (live overlay + disk reload).
- **Rust unit** (`crates/agent`): `retry_transient_spawn` named `libc` errnos, including the Darwin `EDEADLK` ≠ Linux `EAGAIN` trap.
- **Bun unit** (`apps/web`): fold / `applyTurnSnapshot` / `pendingEventsAfterSeq`, commit-buffer cadence, scroll-window helpers, expand store, message keys, source-scan of the virtual list.
- **Bun DOM** (`apps/web`): display-buffer flush, process auto-collapse via `useLayoutEffect`, user-bubble remount, scroll-follow.
- **Bun unit** (`apps/mobile`, `packages/ui`): same snapshot adopt rule on mobile; `MessageResponse` reduced-motion + stop/error flush (source-scan).
- **Bench** (`scripts/agent-chat-stream-perf/`): Chromium + React Profiler. Authoritative numbers live in `RESULTS.md`.
- **Manual / device**: mock-backend web pass and official `cursor-agent` ACP pass recorded below. No dedicated Playwright file for this spec.
- **Not run**: Chinese IME composition on a real IME (no IME on the verification VM). Composer already guards Enter.

No backward-compat scenarios: live clients that ignore `turn_snapshot` are out of scope (TECH).

## Coverage map

| TECH item                                                           | Scenario IDs    |
| ------------------------------------------------------------------- | --------------- |
| Virtual list + bottom anchoring; scroll-up does not jump            | S1, S2, S3, S20 |
| Stick-to-bottom while streaming; back-to-bottom control             | S4, S21         |
| Server `TurnSnapshot` on `COALESCE_FLUSH` (56 ms)                   | S5, S6          |
| Get then subscribe; drop `revision <= last_event_seq`               | S7              |
| `push_recent` keeps latest snapshot per `turn_id`                   | S8              |
| Snapshot `created_at` from first part `opened_at`                   | S9              |
| Slot-sort only numbered parts; unmapped text keeps its slot         | S10, S11, S21   |
| Display pacing + flush on turn end / stop / error / reduced motion  | S12, S13, S21   |
| Expand store outside the list; reconnect keeps keys                 | S14, S20        |
| Process auto-collapse in `useLayoutEffect`; remount does not reopen | S15             |
| Blank `tool_call_id` not stored                                     | S16             |
| `shouldAdoptSnapshotAssistant` (incl. tool-only fallback risk)      | S17             |
| Spawn retry via named `libc` errnos                                 | S18             |
| Chromium stream bench                                               | S19             |
| Mock-backend device pass                                            | S20             |
| Official Cursor ACP device pass                                     | S21             |
| Chinese IME (code exists; device not run)                           | S22             |
| Expand not persisted across refresh (documented non-goal)           | S23             |
| Cursor mid-session permission (existing ACP; not a #305 regression) | S24             |

## Execution map

| Scenario | Level            | Expected tool | Target command / method                                                                                                                                                  | Fixture / data                                     | Signals                                                                 | Status   |
| -------- | ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| S1       | Bun unit         | `bun test`    | `agent-chat-transcript-window.test.ts` virtual-list wiring + scroll helpers                                                                                              | source of `AgentChatTranscriptList`                | `anchorTo: "end"`; `shouldAdjustTranscriptScrollOnItemSizeChange`       | covered  |
| S2       | Bun unit         | `bun test`    | `shouldAdjustTranscriptScrollOnItemSizeChange` cases                                                                                                                     | first-measure / visible expand / above-fold / back | no shift for visible expand or backward scroll                          | covered  |
| S3       | Bun DOM          | `bun test`    | `agent-chat-scroll-follow.dom.test.ts`                                                                                                                                   | growing scroller                                   | scrolled-up position does not jump                                      | covered  |
| S4       | Bun + device     | `bun test`    | `agent-chat-stream-wiring.test.ts` below-count; `agent-chat-scroll-to-bottom.test.ts`                                                                                    | mock + Cursor ACP                                  | follow-end then below-count; device back-to-bottom                      | covered  |
| S5       | Rust integration | `cargo test`  | `live_stream_emits_turn_snapshot_not_text_chunk`; `coalesce_flush_stays_in_merge_window`                                                                                 | `FakeAgentProvider`                                | live WS is `TurnSnapshot`; `COALESCE_FLUSH` in 50–60 ms                 | covered  |
| S6       | Rust integration | `cargo test`  | `text_snapshot_is_emitted_before_tool_call_started`; `turn_snapshot_is_emitted_before_turn_completed`                                                                    | fake stream                                        | snapshot precedes discrete events                                       | covered  |
| S7       | Rust + Bun       | both          | `snapshot_then_seq_restore_matches_live_get`; `snapshot then seq restore skips already-applied revisions`                                                                | subscribe after `last_event_seq`                   | pending `revision > snapshotSeq`                                        | covered  |
| S8       | Rust unit        | `cargo test`  | `push_recent_keeps_latest_snapshot_per_turn`                                                                                                                             | two turns in the ring                              | latest snapshot per `turn_id` retained                                  | covered  |
| S9       | Rust unit        | `cargo test`  | `live_turn_snapshot_keeps_first_part_opened_at`                                                                                                                          | two flushes                                        | `created_at` stays first `opened_at`                                    | covered  |
| S10      | Rust unit        | `cargo test`  | `recorded_ordinals_restore_text_tool_text_thinking_tool`; `turn_snapshot_orders_parts_by_recorded_ordinals`; `live_turn_snapshot_keeps_text_tool_thinking_ordinal_order` | live + overlay                                     | part kinds match recorded ordinals                                      | covered  |
| S11      | Rust unit        | `cargo test`  | `unmapped_text_keeps_its_slot_while_thinking_and_tools_reorder`; `overlay_does_not_dump_disk_text_when_live_ordinals_omit_it`; disk-reload tests                         | jsonl + overlay                                    | unmapped body text stays in its slot                                    | covered  |
| S12      | Bun unit / DOM   | `bun test`    | commit-buffer turn_end / stop / error; `smooth-stream-text.dom.test.tsx`; `folded-agent-part.test.ts` tail                                                               | fake clock                                         | pending commit + display buffer flush                                   | covered  |
| S13      | Bun unit         | `bun test`    | `packages/ui/.../message-response.test.ts`                                                                                                                               | source-scan                                        | `streaming = !reducedMotion && isAnimating`                             | covered  |
| S14      | Bun unit         | `bun test`    | `agent-chat-expand-store.test.ts`; stream-wiring expand cases                                                                                                            | remount + reconnect                                | keys survive remount / WS reconnect; reset on chat change               | covered  |
| S15      | Bun DOM          | `bun test`    | `assistant-message-process-collapse.dom.test.tsx`                                                                                                                        | settle + remount                                   | `useLayoutEffect`; remount does not reopen                              | covered  |
| S16      | Bun unit         | `bun test`    | `does not persist blank tool ids into the shared expand store`                                                                                                           | blank `tool_call_id`                               | no `tool:` key                                                          | covered  |
| S17      | Bun unit         | `bun test`    | `applyTurnSnapshot adopts a tool-first provisional row`; mobile `turn_snapshot adopts a tool-first provisional row`                                                      | `assistant:<id>` + shared tool id                  | one row after adopt                                                     | covered  |
| S18      | Rust unit        | `cargo test`  | `crates/agent` `spawn_retry` tests                                                                                                                                       | fake `io::Error`                                   | retries `EAGAIN` / `ETXTBSY`; does not retry `EDEADLK`                  | covered  |
| S19      | Bench            | Chromium      | `bun scripts/agent-chat-stream-perf/run.ts`                                                                                                                              | 500×8 tools × 40 tokens                            | numbers in `RESULTS.md`                                                 | covered  |
| S20      | Manual           | browser       | mock-backend web run (PR #305)                                                                                                                                           | local mock provider                                | see Coverage Status                                                     | covered  |
| S21      | Manual           | browser       | official `cursor-agent` ACP, `composer-2.5`                                                                                                                              | real Cursor backend                                | see Coverage Status                                                     | covered  |
| S22      | Manual           | real IME      | none on the verification VM                                                                                                                                              | Chinese IME                                        | Enter must not send mid-composition                                     | not_run  |
| S23      | Documented       | —             | expand store is process memory                                                                                                                                           | refresh                                            | process rail collapses; not a defect                                    | accepted |
| S24      | Manual           | Cursor ACP    | write under Ask always                                                                                                                                                   | official `cursor-agent`                            | no mid-session `session/request_permission`; Plan Approve still appears | accepted |

## Scenarios

### S1 — Transcript is a bottom-anchored virtual list

- **Level**: Bun unit (source-scan + helpers)
- **Given**: `AgentChatTranscriptList` and `use-agent-chat-session.ts` as shipped.
- **When**: `transcript virtual list wiring` reads the sources.
- **Then**: the list uses `@tanstack/react-virtual` `useVirtualizer` with `anchorTo: "end"`, `measureElement`, `useFlushSync: false`, `getItemKey` → `stableAgentMessageKey`, and `shouldAdjustScrollPositionOnItemSizeChange` → `shouldAdjustTranscriptScrollOnItemSizeChange`. Session `load()` calls `pendingEventsAfterSeq` then `agentChatApi.subscribe(id, after)` and does **not** call `hydrateAgentChatMessages`.
- **Signals**: assertions in `apps/web/src/features/agent/lib/__tests__/agent-chat-transcript-window.test.ts` (`virtualizes messages inside StickToBottom…`).

### S2 — Size changes do not shove the reading line

- **Level**: Bun unit
- **Given**: `shouldAdjustTranscriptScrollOnItemSizeChange` in `agent-chat-transcript-window.ts`.
- **When**: first measure; a visible user row expands; a row entirely above the fold grows after first measure; the user is scrolling backward.
- **Then**: first measure may compensate a row whose top is above the fold; a visible expand does not shift; an above-fold grow after first measure does shift; backward scroll never shifts.
- **Signals**:
  - `on first measure compensates any row whose top sits above the fold`
  - `does not shove the reading line when a visible user row expands`
  - `shifts when a row entirely above the fold grows after the first measure`
  - `does not shift while scrolling backward even for rows above the fold`

### S3 — Growing content does not jump a scrolled-up position

- **Level**: Bun DOM
- **Given**: a scroller that is not pinned to the end.
- **When**: new rows grow the content.
- **Then**: a scrolled-up reading position stays put; a pinned scroller stays at the end.
- **Signals**: `agent-chat-scroll-follow.dom.test.ts` — `does not jump a scrolled-up reading position when content grows`; `stays pinned to the end when new rows grow the scroller`.

### S4 — Follow-end, then back-to-bottom

- **Level**: Bun unit + device
- **Given**: the user is at the end, then scrolls away during a stream.
- **When**: new messages arrive; the user clicks the below-count control.
- **Then**: the list follows the end until scroll-away; the below-count control appears; clicking it returns to the end.
- **Signals**: `follows the end until the user scrolls away, then shows the below-count control`; `agent-chat-scroll-to-bottom.test.ts` copy. Device: S20 / S21.

### S5 — Live path emits `TurnSnapshot`, not per-token `TextChunk`

- **Level**: Rust integration
- **Given**: `FakeAgentProvider` streaming text.
- **When**: `pump_session` runs with `COALESCE_FLUSH`.
- **Then**: subscribers see `AgentChatPayload::TurnSnapshot`, not a `text_chunk` flood. `COALESCE_FLUSH` is in `[50ms, 60ms]` (shipped 56 ms).
- **Signals**: `live_stream_emits_turn_snapshot_not_text_chunk`; `coalesce_flush_stays_in_merge_window`; also `coalesce_same_part_concat`, `coalesce_different_part_isolation`, `coalesce_gap_does_not_invent_bytes`, `coalesce_non_text_forces_flush`.

### S6 — Discrete events are preceded by a snapshot

- **Level**: Rust integration
- **Given**: a turn that starts a tool, then completes.
- **When**: the pump dispatches those discrete events.
- **Then**: a `TurnSnapshot` is emitted **before** `ToolCallStarted` and **before** `TurnCompleted`.
- **Signals**: `text_snapshot_is_emitted_before_tool_call_started`; `turn_snapshot_is_emitted_before_turn_completed`.

### S7 — Restore is get, then subscribe after `last_event_seq`

- **Level**: Rust integration + Bun unit
- **Given**: a live chat with snapshots in the ring.
- **When**: the client `get()`s (seq N) and applies pending events with `revision > N`, then `subscribe({ after_sequence: N })`.
- **Then**: the restored transcript matches live `get()`; already-applied revisions are dropped.
- **Signals**: `snapshot_then_seq_restore_matches_live_get`; `snapshot then seq restore skips already-applied revisions`. Production session source-scan asserts `pendingEventsAfterSeq` + `subscribe(id, after)`.

### S8 — Reconnect ring keeps one snapshot per turn

- **Level**: Rust unit
- **Given**: `recent_events` with snapshots for turn A then turn B.
- **When**: `push_recent` inserts a newer snapshot for B.
- **Then**: A's latest snapshot is still in the ring; B keeps only its latest snapshot. Raw `TextChunk` is not stored.
- **Signals**: `push_recent_keeps_latest_snapshot_per_turn` in `apply_event.rs`.

### S9 — Assistant `created_at` is the first part open time

- **Level**: Rust unit
- **Given**: a new overlay assistant built from the first `TrackedPart`.
- **When**: a later flush upserts more text into that row.
- **Then**: `created_at` stays the first part's `opened_at` (`overlay_tracked_part`).
- **Signals**: `live_turn_snapshot_keeps_first_part_opened_at`.

### S10 — Recorded ordinals restore interleaved part order

- **Level**: Rust unit / integration
- **Given**: host ordinals text → tool → text → thinking → tool (or the live equivalent).
- **When**: jsonl fold (`sort_parts_by_recorded_ordinals`), live overlay (`apply_recorded_ordinal_order`), or `flush_turn_snapshot` runs.
- **Then**: part kinds match that order.
- **Signals**:
  - `recorded_ordinals_restore_text_tool_text_thinking_tool` (`types.rs`)
  - `overlay_restores_text_tool_text_thinking_tool_from_live_ordinals`
  - `turn_snapshot_orders_parts_by_recorded_ordinals`
  - `live_turn_snapshot_keeps_text_tool_thinking_ordinal_order`

### S11 — Unmapped body text keeps its slot

- **Level**: Rust unit / integration
- **Given**: a text part whose fold id is **not** in the ordinal map, plus numbered thinking/tools.
- **When**: the slot-sort runs (overlay or disk reload).
- **Then**: numbered parts reorder inside their slots; the unmapped text stays where fold put it (not dumped after tools).
- **Signals**: `unmapped_text_keeps_its_slot_while_thinking_and_tools_reorder`; `overlay_does_not_dump_disk_text_when_live_ordinals_omit_it`; `interleaved_thinking_and_tools_survive_disk_reload`; `interleaved_text_tool_text_thinking_tool_survives_disk_reload`.

### S12 — Display / commit buffers flush on turn end, stop, and error

- **Level**: Bun unit + DOM
- **Given**: a pending `turn_snapshot` inside `AGENT_CHAT_COMMIT_FLUSH_MS` (56) and a `useSmoothStreamText` backlog.
- **When**: `turn_completed` / stop / error arrives, or the last open answer part closes.
- **Then**: the commit buffer force-flushes; the display hook paints the full target on the same commit (`enabled === false`).
- **Signals**:
  - `turn_end flushes a pending turn_snapshot commit immediately`
  - `stop flushes a pending display commit immediately`
  - `error flushes a pending display commit immediately`
  - `stop (enabled=false) paints the full target on the same commit`
  - `error (enabled=false after a longer target) also flushes immediately`
  - `buffers only the last open answer text` / `stops buffering when the tail closes (turn_end flush)`
  - `stop and error turn isAnimating off so the buffer returns the full source immediately`

### S13 — Reduced motion shows source text immediately

- **Level**: Bun unit (source-scan)
- **Given**: `MessageResponse` in `packages/ui/src/components/ai-elements/message.tsx`.
- **When**: `useReducedMotion()` is true.
- **Then**: `streaming = !reducedMotion && isAnimating` is false; `useSmoothStreamText` returns the source.
- **Signals**: `smooth-releases tokens only while animating, and prefers-reduced-motion shows the source immediately`.

### S14 — Expand state lives outside the virtual list

- **Level**: Bun unit
- **Given**: `useAgentChatExpandStore` keyed by `process:` / `tool:` / `user-body:` / `user-meta:` (and the other helpers in TECH).
- **When**: a virtual row remounts; the websocket reconnects; `activeChatId` changes.
- **Then**: remount and reconnect keep keys; chat change / session unmount calls `reset()`.
- **Signals**:
  - `keeps tool/plan/process open state after a virtual-row remount of the same key`
  - `keeps user body expand and selected time after a virtual-row remount of the same entry id`
  - `does not reset on a websocket reconnect of the same chat`
  - `clears every expand key when the bound chat closes`
  - `keeps expand state when the websocket reconnects`
  - `clears the expand store when the bound chat changes or the session unmounts`
  - `restores expanded body after a virtual-row remount when expandKey is set`

### S15 — Process auto-collapse is a layout effect

- **Level**: Bun DOM
- **Given**: an assistant that becomes collapsible on settle.
- **When**: the first settle runs; the user had collapsed the rail; the row remounts.
- **Then**: auto-collapse writes the store in `useLayoutEffect`, not during render, and **skips** if `process:${id}` is already stored.
- **Signals**: `auto-collapses process after settle via layout effect, not during render`; `does not reopen a collapsed process panel after a virtual-row remount`; `keeps process open on settle when tools were expanded during the stream`.

### S16 — Blank tool ids stay out of the store

- **Level**: Bun unit
- **Given**: a tool card with a blank `tool_call_id`.
- **When**: the card toggles.
- **Then**: `useAgentToolExpandId()?.trim() || null` keeps the card uncontrolled; the store has no `tool:` key.
- **Signals**: `does not persist blank tool ids into the shared expand store`.

### S17 — Snapshot adopt (and the tool-only fallback)

- **Level**: Bun unit
- **Given**: a provisional `assistant:<user-id>` tool-first row, then a snapshot with a different id sharing `tool_call_id`.
- **When**: `applyTurnSnapshot` / mobile `applyChatEvent` runs.
- **Then**: one assistant row remains (adopt). The last fallback also adopts when `prev` has no `text` or `thinking` parts — two **tool-only** assistants in the same turn can merge (`currentTurnAssistant`). That fallback is a known limitation (TECH); no test currently fails it.
- **Signals**: `applyTurnSnapshot adopts a tool-first provisional row instead of duplicating it`; mobile `turn_snapshot adopts a tool-first provisional row instead of duplicating it`; `applyTurnSnapshot keeps historical identity and stamps open_part_ids`; `applyTurnSnapshot keeps prior-turn history while replacing the live assistant`.

### S18 — Transient spawn retries named errnos

- **Level**: Rust unit
- **Given**: `retry_transient_spawn` in `crates/agent/src/providers/spawn_retry.rs`.
- **When**: the op fails with `EAGAIN` / `ETXTBSY` / `EDEADLK`.
- **Then**: `EAGAIN` and `ETXTBSY` retry (up to 8); `EDEADLK` does not (Darwin 11 ≠ Linux `EAGAIN` 11). Matcher also includes `EINTR`, `EWOULDBLOCK`, `ENFILE`, `EMFILE`.
- **Signals**: `transient_spawn_uses_named_errnos_not_linux_numbers`; `retry_transient_spawn_retries_eagain_then_succeeds`; `retry_transient_spawn_retries_etxtbsy_then_succeeds`; `retry_transient_spawn_does_not_retry_edeadlk`.

### S19 — Chromium stream bench

- **Level**: Bench
- **Given**: `bun scripts/agent-chat-stream-perf/run.ts` on the verification VM (Playwright Chromium / HeadlessChrome 148). Fixture: 500 turns × 8 completed Read tools × 40 tokens. Renderer is a product-shaped virtual list, **not** full `AgentChatMessageView`.
- **When**: unbatched per-token (`main` mode) vs 56 ms snapshots + `useSmoothStreamText` (`branch` mode).
- **Then**: numbers match `scripts/agent-chat-stream-perf/RESULTS.md` (authoritative; do not copy from memory).
- **Signals** (2026-10-13 VM run):

|                                       | unbatched per-token | 56 ms snapshots |
| ------------------------------------- | ------------------: | --------------: |
| Scroll FPS                            |              55.043 |          55.003 |
| Per-token `actualDuration` (total/40) |            1.795 ms |        1.092 ms |
| Profiler commits (40 tokens)          |                  81 |              55 |
| Total `actualDuration`                |             71.8 ms |         43.7 ms |

Scroll FPS is the same within noise (virtual list already existed on `main` before #305). Token cost dropped because the branch commits less often.

Also: `public-file.test.ts` — whitelist `/` `/index.html` `/bench.js`; traversal → 403.

### S20 — Mock-backend web run (PR #305)

- **Level**: Manual (recorded)
- **Given**: local web against the mock agent backend.
- **When**: the reviewer exercises the transcript while a turn streams and after it settles.
- **Then** (passed):
  - scroll-up while reading does not jump
  - user bubble expand + timestamp row
  - expand state survives virtual-row recycle / scroll
  - timeline navigation lands on the target row
  - refresh restores the transcript from `get()` (expand keys do **not** survive refresh — S23)
  - `MessageQueueDock` still works
  - permission prompt appears on the **mock** backend
  - plan mode still works
- **Signals**: recorded on the #305 verification pass. Not re-run as part of this documentation PR.

### S21 — Official Cursor ACP (`composer-2.5`)

- **Level**: Manual (recorded)
- **Given**: official `cursor-agent` ACP, model `composer-2.5`.
- **When**: a real turn streams tokens, tools, and (where used) plan mode; the page is refreshed after the turn.
- **Then** (passed):
  - per-token-feel smooth streaming (56 ms snapshots + display buffer)
  - stick-to-bottom while streaming
  - back-to-bottom control after scroll-away
  - flush at turn end (full text, no leftover caret backlog)
  - tool blocks render
  - plan mode works
  - part order after refresh matches the live turn
- **Signals**: recorded on the #305 / follow-up Cursor pass. Not re-run as part of this documentation PR.

### S22 — Chinese IME composition (not verified)

- **Level**: Manual / real IME
- **Given**: `PromptInputTextarea` (`packages/ui/src/components/ai-elements/prompt-input.tsx`) ignores Enter when `isComposing` or `e.nativeEvent.isComposing` (`onCompositionStart` / `onCompositionEnd`).
- **When**: a Chinese IME is composing a character and the user presses Enter.
- **Then**: the composer must not send. **Not verified** — the verification VM has no IME. No Bun test drives a real composition event.
- **Signals**: code-present; device `not_run`.

### S23 — Expand state is not persisted across refresh

- **Level**: Documented non-goal
- **Given**: `useAgentChatExpandStore` is in-memory.
- **When**: the user refreshes.
- **Then**: process rail uses the default (collapsed). WS reconnect of the same `activeChatId` keeps keys (S14). Do not file this as data loss.
- **Signals**: TECH known limitation; S20 refresh restore is transcript content, not expand flags.

### S24 — Cursor has no mid-session permission prompt

- **Level**: Manual / existing ACP
- **Given**: official `cursor-agent` + Ask always, write to `/tmp`.
- **When**: the agent writes a file mid-turn.
- **Then**: Cursor does not emit ACP `session/request_permission` for that write (existing Cursor wiring, `crates/agent/AGENTS.md`). Plan **Approve** is the confirmation chrome that does appear. Mock backend **does** show a permission prompt (S20).
- **Signals**: accepted existing behavior; not a QUALITY-008 / #305 regression.

## Named automated tests (index)

Real names only. Run together via TECH "Verification commands".

### Rust — `crates/core-service`

| Test                                                                                                                                        | File             |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `live_stream_emits_turn_snapshot_not_text_chunk`                                                                                            | `tests.rs`       |
| `snapshot_then_seq_restore_matches_live_get`                                                                                                | `tests.rs`       |
| `text_snapshot_is_emitted_before_tool_call_started`                                                                                         | `tests.rs`       |
| `turn_snapshot_is_emitted_before_turn_completed`                                                                                            | `tests.rs`       |
| `coalesce_flush_stays_in_merge_window`                                                                                                      | `tests.rs`       |
| `coalesce_same_part_concat` / `coalesce_different_part_isolation` / `coalesce_gap_does_not_invent_bytes` / `coalesce_non_text_forces_flush` | `tests.rs`       |
| `interleaved_thinking_and_tools_survive_disk_reload`                                                                                        | `tests.rs`       |
| `interleaved_text_tool_text_thinking_tool_survives_disk_reload`                                                                             | `tests.rs`       |
| `live_turn_snapshot_keeps_text_tool_thinking_ordinal_order`                                                                                 | `tests.rs`       |
| `push_recent_keeps_latest_snapshot_per_turn`                                                                                                | `apply_event.rs` |
| `live_turn_snapshot_keeps_first_part_opened_at`                                                                                             | `apply_event.rs` |
| `turn_snapshot_orders_parts_by_recorded_ordinals`                                                                                           | `apply_event.rs` |
| `overlay_restores_text_tool_text_thinking_tool_from_live_ordinals`                                                                          | `apply_event.rs` |
| `overlay_does_not_dump_disk_text_when_live_ordinals_omit_it`                                                                                | `apply_event.rs` |
| `recorded_ordinals_restore_text_tool_text_thinking_tool`                                                                                    | `types.rs`       |
| `unmapped_text_keeps_its_slot_while_thinking_and_tools_reorder`                                                                             | `types.rs`       |

### Rust — `crates/agent`

| Test                                                  | File             |
| ----------------------------------------------------- | ---------------- |
| `transient_spawn_uses_named_errnos_not_linux_numbers` | `spawn_retry.rs` |
| `retry_transient_spawn_retries_eagain_then_succeeds`  | `spawn_retry.rs` |
| `retry_transient_spawn_retries_etxtbsy_then_succeeds` | `spawn_retry.rs` |
| `retry_transient_spawn_does_not_retry_edeadlk`        | `spawn_retry.rs` |

### Bun — web / ui / mobile / bench

| File                                                                                               | Representative names                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/agent/lib/__tests__/agent-chat-events.test.ts`                              | `applyTurnSnapshot keeps historical identity and stamps open_part_ids`; `snapshot then seq restore skips already-applied revisions`; `applyTurnSnapshot adopts a tool-first provisional row instead of duplicating it` |
| `apps/web/src/features/agent/lib/__tests__/agent-chat-stream-wiring.test.ts`                       | expand lifted out of the list; reconnect keeps expand; timeline `scrollToIndex`; follow-end / below-count                                                                                                              |
| `apps/web/src/features/agent/lib/__tests__/agent-chat-transcript-window.test.ts`                   | `shouldAdjustTranscriptScrollOnItemSizeChange` cases; virtual-list wiring (incl. no `hydrateAgentChatMessages`)                                                                                                        |
| `apps/web/src/features/agent/lib/__tests__/agent-chat-scroll-follow.dom.test.ts`                   | pin vs scrolled-up grow                                                                                                                                                                                                |
| `apps/web/src/features/agent/lib/__tests__/agent-chat-commit-buffer.test.ts`                       | S19/S20 cadence (QUALITY-006 ids); turn_end / stop / error flush; `AGENT_CHAT_COMMIT_FLUSH_MS` in 50–60                                                                                                                |
| `apps/web/src/features/agent/lib/__tests__/smooth-stream-text.dom.test.tsx`                        | stop / error paint full target                                                                                                                                                                                         |
| `apps/web/src/features/agent/lib/__tests__/agent-chat-message-key.test.ts`                         | stable id / legacy fingerprint / collision `#2`                                                                                                                                                                        |
| `apps/web/src/features/agent/store/__tests__/agent-chat-expand-store.test.ts`                      | remount / reconnect / reset                                                                                                                                                                                            |
| `apps/web/src/features/agent/components/__tests__/assistant-message-process-collapse.test.ts`      | blank tool id; inspect-open on settle                                                                                                                                                                                  |
| `apps/web/src/features/agent/components/__tests__/assistant-message-process-collapse.dom.test.tsx` | layout-effect auto-collapse; remount does not reopen                                                                                                                                                                   |
| `apps/web/src/features/agent/components/__tests__/folded-agent-part.test.ts`                       | last-open-answer display tail                                                                                                                                                                                          |
| `apps/web/src/features/agent/components/__tests__/user-message-body.dom.test.tsx`                  | remount restore when `expandKey` is set                                                                                                                                                                                |
| `apps/web/src/features/agent/components/__tests__/agent-chat-scroll-to-bottom.test.ts`             | below-count chrome                                                                                                                                                                                                     |
| `packages/ui/src/components/ai-elements/message-response.test.ts`                                  | reduced-motion + stop/error                                                                                                                                                                                            |
| `apps/mobile/src/features/agent-chat/fold-transcript.test.ts`                                      | `turn_snapshot replaces the current turn without dropping history`; tool-first adopt                                                                                                                                   |
| `scripts/agent-chat-stream-perf/public-file.test.ts`                                               | whitelist + 403 traversal                                                                                                                                                                                              |

QUALITY-006 S19/S20 commit-buffer tests still apply; this spec only changes the live event kind (`turn_snapshot`) and the shipped 56 ms interval.

## Performance & load budgets

- Server live merge: `COALESCE_FLUSH` ∈ [50, 60] ms (asserted).
- Client commits: `AGENT_CHAT_COMMIT_FLUSH_MS` ∈ [50, 60] ms (asserted). QUALITY-006's designed **150 ms** did **not** ship.
- Chromium bench (`RESULTS.md`): scroll FPS ~55 both sides; per-token `actualDuration` 1.795 ms → 1.092 ms on the recorded VM.
- Reconnect ring: `RECENT_EVENT_CAP = 2048` plus one latest `TurnSnapshot` per `turn_id` (no new cap constant).

## Regression checklist

Fragile places that have already broken, or will break if someone "simplifies" the helpers:

- [ ] `shouldAdjustTranscriptScrollOnItemSizeChange` always returns true (reading line jumps on expand).
- [ ] `useVirtualizer` loses `anchorTo: "end"` or sets `useFlushSync: true` (React 19 warning + measure jank).
- [ ] Session `load()` subscribes before `get()`, or replays `revision <= last_event_seq`.
- [ ] `push_recent` keeps only one global snapshot (turn N+1 evicts turn N).
- [ ] Slot-sort compares **every** part (unmapped text compares as `None` and parks at the end) — the #307 defect.
- [ ] Process auto-collapse writes the expand store during render.
- [ ] Blank `tool_call_id` hashed as `tool:` (one card toggles every id-less card).
- [ ] `created_at: Utc::now()` on each snapshot flush.
- [ ] Spawn retry matches Linux errno **numbers** (retries Darwin `EDEADLK`).
- [ ] Production session path calls `hydrateAgentChatMessages` again.
- [ ] Display buffer still draining after `turn_completed` / stop / error.

## Exploratory agent-browser checks

Optional after a future UI change in this area. Load the installed `agent-browser` skill, or `agent-browser skills get core --full`. If the CLI is unavailable, see [`specs/references/agent-browser-setup.md`](../../references/agent-browser-setup.md) and mark `not_run`.

1. Stream a long turn; scroll up mid-stream; confirm the reading line does not jump when a user bubble or tool card resizes.
2. Stay at the bottom; confirm tokens appear smoothly and the list sticks; scroll away and use back-to-bottom.
3. Expand a tool / user bubble, scroll it off and back; confirm it stays open. Refresh and confirm expand resets (S23) while text/order remain.
4. Stop or error a turn; confirm the last answer paints in full with no leftover caret.
5. Prefer-reduced-motion: answer text appears without the display drain.

The #305 / Cursor device runs (S20, S21) already cover 1–4 on web. Agent-browser was not required for this backfill.

## Acceptance criteria

Already shipped on `main`. This documentation PR is green when:

- [x] S1–S19 automated names above exist and are the tests TECH cites (no invented names).
- [x] S20 mock-backend device results recorded (pass).
- [x] S21 official Cursor ACP device results recorded (pass).
- [x] S22 marked `not_run` with the IME-on-VM reason.
- [x] S23 / S24 recorded as accepted limitations, not new bugs.
- [x] `RESULTS.md` numbers are the bench source of truth.
- [x] TECH audit commands still describe the shipped symbols (`COALESCE_FLUSH`, `sort_parts_by_recorded_ordinals`, `anchorTo: "end"`, `useAgentChatExpandStore`, `retry_transient_spawn`).
- [ ] This spec's CI (doc lint) is green.

## Manual verification steps

Recorded device passes (do not re-require for this docs PR):

1. **Mock backend (S20)** — local web; scroll-up-no-jump; user expand/timestamp; expand survives scroll; timeline; refresh restore; `MessageQueueDock`; mock permission prompt; plan mode.
2. **Cursor ACP (S21)** — official `cursor-agent`, `composer-2.5`; smooth stream; stick-to-bottom; back-to-bottom; flush at turn end; tools; plan; order after refresh.
3. **IME (S22)** — still to do on a machine with a real Chinese IME.
4. **Reduced motion** — covered by source-scan (S13); optional eyeball via OS setting.

## Non-coverage

- APP-067 conversation identity, QUALITY-006 offset arithmetic, new `WsAction`s / REST.
- Persisting expand state across refresh (explicit non-goal).
- Changing Cursor ACP so it emits mid-session `session/request_permission` (existing host behavior).
- Tightening `shouldAdoptSnapshotAssistant`'s tool-only fallback (follow-up; S17).
- Full `AgentChatMessageView` (Streamdown / next-intl / tool chrome) inside the Chromium bench — the bench is a product-shaped list on purpose.
- Mobile virtual list / expand store (mobile folds snapshots only).
- A Playwright `e2e/tests/specs/QUALITY-008_*.e2e.ts` — not written; device runs stand in.

## Tests still to add

1. **Real IME** — drive `PromptInputTextarea` with `compositionstart` / `compositionend` (or a device IME) so Enter during composition cannot send.
2. **Adopt fallback** — two tool-only assistants in one turn must **not** merge. Today the last `shouldAdoptSnapshotAssistant` branch would merge them; add a failing-then-fixed case when the heuristic is tightened.
3. **Optional Playwright** — one journey: stream → scroll up → expand user bubble → refresh → assert text/order (not expand flags). Needs a scripted provider; QUALITY-006 S21 has the same gap.
4. **Reduced-motion DOM** — `MessageResponse` with mocked `useReducedMotion() === true` paints `source` (today is source-scan only).

## Coverage Status

_Last product verification: 2026-10-13 · PR #305 / Cursor ACP pass. This file is a 2026-10-14 documentation backfill; device runs were not repeated._

### Commands (automated)

```bash
cargo test -p core-service --lib service::agent_chat
cargo test -p agent --lib spawn_retry
cd apps/web && bun test src/features/agent/lib/__tests__/agent-chat-events.test.ts \
  src/features/agent/lib/__tests__/agent-chat-stream-wiring.test.ts \
  src/features/agent/lib/__tests__/agent-chat-transcript-window.test.ts \
  src/features/agent/lib/__tests__/agent-chat-commit-buffer.test.ts \
  src/features/agent/lib/__tests__/smooth-stream-text.dom.test.tsx \
  src/features/agent/lib/__tests__/agent-chat-message-key.test.ts \
  src/features/agent/lib/__tests__/agent-chat-scroll-follow.dom.test.ts \
  src/features/agent/store/__tests__/agent-chat-expand-store.test.ts \
  src/features/agent/components/__tests__/assistant-message-process-collapse.test.ts \
  src/features/agent/components/__tests__/assistant-message-process-collapse.dom.test.tsx \
  src/features/agent/components/__tests__/folded-agent-part.test.ts \
  src/features/agent/components/__tests__/user-message-body.dom.test.tsx
bun test scripts/agent-chat-stream-perf/public-file.test.ts
bun test apps/mobile/src/features/agent-chat/fold-transcript.test.ts
bun test packages/ui/src/components/ai-elements/message-response.test.ts
```

Re-bench: `bun scripts/agent-chat-stream-perf/run.ts` → `scripts/agent-chat-stream-perf/RESULTS.md`.

### Device / bench

- **S20 mock-backend web** — pass (scroll-up-no-jump, user expand/timestamp, expand survives scroll, timeline, refresh restore, `MessageQueueDock`, mock permission, plan mode).
- **S21 official `cursor-agent` ACP, `composer-2.5`** — pass (smooth stream, stick-to-bottom, back-to-bottom, flush at turn end, tools, plan, order after refresh).
- **S22 Chinese IME** — `not_run` (no IME on the VM). Composer guard is present.
- **S19 bench** — `RESULTS.md`: scroll FPS 55.043 → 55.003; per-token 1.795 ms → 1.092 ms; commits 81 → 55; total `actualDuration` 71.8 ms → 43.7 ms.

### Remaining gaps

- S22 real-IME verification.
- S17 failing test for two tool-only assistants (follow-up when adopt is tightened).
- No `e2e/tests/specs/QUALITY-008_*.e2e.ts` (same harness gap as QUALITY-006 S21).
- Reduced-motion is source-scan, not a DOM assertion.
