# TEST · QUALITY-013: Agent Chat EventGate

> Test Plan · how we verify the shared EventGate / EventPump and the mobile/web consumers. References TECH QUALITY-013. Quality targets Q1–Q7 stand in for PRD Must Haves.

## Test strategy

Deterministic Bun tests own the gate. Mobile and web hooks are exercised with the real fold where cheap, and with ordered source assertions where the hook is not isolated. No Playwright, no mobile e2e, no iOS Simulator in this spec. Agent-browser is omitted: there is no new UI surface.

- Unit: `packages/api-client/src/agent-chat/event-gate.test.ts`, `event-pump.test.ts`.
- Integration: mobile `event-gate-probes.test.ts` (gate + `applyChatEvent`), `hydrate-recovery.test.ts`, `session-resume.test.ts`, `use-agent-chat-thread.test.ts`.
- Web: `agent-chat-transcript-window.test.ts` structural order; existing `agent-chat-events` / stream-wiring stay green.
- Manual: iOS Simulator — **not run** on this Linux agent.

## Coverage map

| Quality target               | Scenario IDs            |
| ---------------------------- | ----------------------- |
| Q1 emission identity         | S1, S2, S3              |
| Q2 state anti-rollback       | S4, S5, S6, S7, S8, S8b |
| Q3 snapshot then incremental | S9, S10, S16, S19       |
| Q4 gap catch_up / resync     | S11, S12, S12b          |
| Q5 resync failure recovery   | S13, S14                |
| Q6 mobile cursor resume      | S15, S16                |
| Q7 web admit                 | S17, S18                |

## Execution map

| Scenario | Level      | Expected tool | Target command / method                    | Fixture / data                                              | Signals                     | Status  |
| -------- | ---------- | ------------- | ------------------------------------------ | ----------------------------------------------------------- | --------------------------- | ------- |
| S1       | Unit       | `bun test`    | `packages/api-client` EventGate duplicates | shared adapter `event_id`, distinct payload types           | both apply                  | planned |
| S2       | Unit       | `bun test`    | same                                       | `part_closed` then `turn_completed`, same id                | `turn_completed` applies    | planned |
| S3       | Unit       | `bun test`    | Lagged replay                              | same id+type+instance                                       | `duplicate_event_id`        | planned |
| S4       | Unit       | `bun test`    | probe `turn_started` replay                | completed then started                                      | `runningTurnId` null        | planned |
| S5       | Unit       | `bun test`    | probe permission                           | resolved then requested                                     | pending null                | planned |
| S6       | Unit       | `bun test`    | probe queue                                | cleared then old items                                      | queue empty                 | planned |
| S7       | Unit       | `bun test`    | probe snapshot                             | long text then short                                        | text stays long             | planned |
| S8       | Unit       | `bun test`    | snapshot floor vs key map                  | queue@10, snapshot@50, queue@20                             | `stale_state`               | planned |
| S8b      | Unit       | `bun test`    | snapshot floor monotonic                   | snapshot@50 then snapshot@20 then queue@25                  | `stale_state`               | planned |
| S9       | Unit       | `bun test`    | EventPump hydrate                          | live during get                                             | buffer then drain           | planned |
| S10      | Unit       | `bun test`    | hydrate generation                         | stale `finishHydrate`                                       | empty drain; later gen wins | planned |
| S11      | Unit       | `bun test`    | one-event hole / next seq                  | snapshot 10 then rev 12; also rev 11                        | `catch_up`; next seq no gap | planned |
| S12      | Unit       | `bun test`    | jump `ahead >= 32`                         | `recommend: "resync"` and apply                             | `gap.recommend`             | planned |
| S12b     | Unit       | `bun test`    | ahead 31 vs 32                             | cursor 10, rev 41 catch_up, rev 42 resync                   | live gap matches subscribe  | planned |
| S13      | Unit       | `bun test`    | `abandonHydrate` after start               | buffer drains as apply; later ingest applies                | drain decisions             | planned |
| S14      | Unit       | `bun test`    | `nextAgentChatResyncDelayMs`               | 3 retries then null                                         | 400, 800, 1600, null        | planned |
| S15      | Unit       | `bun test`    | `canResumeAgentChatSession`                | same chat+client only                                       | boolean                     | planned |
| S16      | Unit       | `bun test`    | thread source order                        | get before subscribe from `pump.cursor`; abandon on fail    | source strings              | planned |
| S17      | Unit       | `bun test`    | web session source                         | `finishHydrate` index < subscribe; `shouldResyncFromServer` | `indexOf` order             | planned |
| S18      | Regression | `bun test`    | web `agent-chat-events`                    | existing corpus                                             | pass                        | planned |
| S19      | Unit       | `bun test`    | façade `agent_chat_resync`                 | finishHydrate / observeSnapshot; floor does not recede      | source + pump               | planned |

## Scenarios

### S1 — Shared adapter `event_id`, distinct payloads

- **Level**: Unit
- **Given**: one `event_id` on `runtime_status` rev 1 and `available_commands_updated` rev 2.
- **When**: both go through `admit`.
- **Then**: both `apply`. A third `runtime_status` with the same id is `duplicate_event_id`.
- **Signals**: `action` on each decision.

### S2 — `finish_turn` reuses the adapter id

- **Level**: Unit
- **Given**: `part_closed` and `turn_completed` share `event_id`, different revisions and instance keys.
- **When**: both go through `admit`.
- **Then**: both `apply`. Replay of `turn_completed` with the same id is dropped.
- **Signals**: second apply, third drop.

### S3 — Lagged / reconnect replay

- **Level**: Unit
- **Given**: a live sequence already admitted.
- **When**: the same events are admitted again (same id, type, instance).
- **Then**: each is `duplicate_event_id`. Fresh ids with older state revisions are `stale_state`.
- **Signals**: drop reason; probe state unchanged.

### S4–S7 — Probe regressions

- **Level**: Unit (toy reducer and mobile `applyChatEvent`)
- **Given / When / Then**: turn busy, permission card, cleared queue, assistant text — replay must not resurrect older chrome.
- **Signals**: `runningTurnId`, `pendingPermission`, `queue`, concatenated answer text.

### S8 — Snapshot floor beats an older key entry

- **Level**: Unit
- **Given**: `queue_updated` at 10 applied; `observeSnapshot(50)`.
- **When**: unseen `queue_updated` at 20 arrives.
- **Then**: `stale_state`. Queue from the snapshot stays empty if the fold reset on snapshot.
- **Signals**: drop reason.

### S8b — Snapshot floor does not recede

- **Level**: Unit
- **Given**: `observeSnapshot(50)` then `observeSnapshot(20)`.
- **When**: unseen `queue_updated` at 25 arrives.
- **Then**: still `stale_state`. A lower seq must not lower the floor.
- **Signals**: drop reason.

### S9 — Hydrate buffer

- **Level**: Unit
- **Given**: `startHydrate`; live turn events buffered.
- **When**: `finishHydrate(6)`.
- **Then**: stale started drops; completed at the floor may apply; `hydrating` is false.
- **Signals**: drain decisions, `pump.hydrating`.

### S10 — Stale hydrate finish

- **Level**: Unit
- **Given**: gen A then gen B without finishing A.
- **When**: `finishHydrate(seq, A)` then `finishHydrate(seq, B)`.
- **Then**: A returns `[]` and leaves hydrating true; B observes the snapshot and drains.
- **Signals**: drain lengths, `hydrating`.

### S11–S12 — Gaps

- **Level**: Unit
- **Then**: next seq (`cursor + 1`) has no gap. Hole of 1 is `catch_up`. `ahead = revision - cursor`; `ahead` 31 is `catch_up`, `ahead` 32 is `resync` and still `apply`. `shouldResyncFromServer` uses the same `ahead`. Cursor stays on the contiguous prefix.
- **Signals**: `gap` undefined / `gap.recommend`, `cursor`, `maxRevision`.

### S13–S14 — Failed resync does not freeze

- **Level**: Unit
- **Given**: pump hydrating; buffered `turn_started` then `turn_completed`; `abandonHydrate`.
- **When**: the buffer drains; a later live event arrives; retry helper is queried for attempts 0..3.
- **Then**: the buffered events `apply` (no new snapshot floor); later ingest applies; delays are 400, 800, 1600, then `null`.
- **Signals**: drain decisions; ingest action; delay values.

### S15–S16 — Mobile resume

- **Level**: Unit
- **Then**: resume only same chat on same client. Hook source calls `drainAbandonedHydrate` on resync catch/cancel, `clearResyncRetry` before a new resync, `pump.shouldResyncFromServer` after the resync subscribe, and subscribes at `pump.cursor` after snapshot.
- **Signals**: boolean resume; source order and strings.

### S17–S18 — Web

- **Level**: Unit
- **Then**: `eventPump.startHydrate` before get; `finishHydrate` before `subscribe(id, eventPump.cursor)`; `shouldResyncFromServer` on subscribe `last_event_seq`. Hydrate continuation uses `hydrateStale` (`cancelled` or `id !== activeIdRef.current`). Same-chat `load()` from rewind/queue does not bump the hydrate epoch; an aborted hydrate `load()` drains via `abandonHydrate`. Fold corpus still passes.
- **Signals**: `indexOf` order; bun test pass.

### S19 — Façade `agent_chat_resync` reuses the EventGate floor

- **Level**: Unit
- **Given**: QUALITY-012 `agent_chat_resync` after #324 (`ad35a233`) is on `main`.
- **When**: the open-thread hook receives the façade message.
- **Then**: it parses `chat_id`, publishes through `applyOpenThreadResync`, and `applySnapshot` calls `pump.finishHydrate(seq)` → `observeSnapshot`. A later lower seq cannot recede the floor. Live events buffered during that hydrate drain through the same gate; drain `apply` decisions are remembered for the next snapshot replay.
- **Signals**: hook source strings; `event-pump.test.ts` façade snapshot tests; `open-thread-resync.test.ts` `keeps overflowed when publish does not apply`; `facade-hydrate.test.ts` fail-then-success interleave and stale generation.

## Performance & load budgets

- Gate admit is O(1) besides the id ring (cap 4096).
- Hydrate buffer is the live events during one `get()`, not the transcript.

## Regression checklist

- [ ] `turn_completed` is not dropped when it shares an adapter `event_id` with `part_closed`.
- [ ] Failed `agentChatGet` during resync does not leave `hydrating === true`.
- [ ] Failed resync drains a buffered `turn_completed` through the gate instead of deleting it.
- [ ] Snapshot seq 50 then queue rev 20 does not refill a cleared queue.
- [ ] `observeSnapshot(50)` then `observeSnapshot(20)` still drops queue rev 25.
- [ ] `ahead` 31 is `catch_up`; `ahead` 32 is `resync` for both live `gap` and `shouldResyncFromServer`.
- [ ] Text/tool behind the snapshot floor still apply.
- [ ] Subscribe cursor is contiguous, not `maxRevision`.
- [ ] `session_lifecycle` create/resume share one revision floor per `turn_id`.
- [ ] No change under `apps/mobile/e2e` or agent-chat UI files besides the session hook/helpers.
- [ ] `agent_chat_resync` raises the existing snapshot floor via `finishHydrate` / `observeSnapshot`.

## Exploratory agent-browser checks

Omitted. No new user-facing chrome.

## Acceptance criteria

- [ ] Q1–Q7 each have a passing scenario at the declared level.
- [ ] Four original probes pass in api-client and mobile fold tests.
- [ ] `bun run --filter @atmos/api-client test` and the listed mobile/web bun tests pass.
- [ ] `bun run --filter @atmos/api-client typecheck` and `bun --filter web typecheck` pass.
- [ ] `bun lint` stays at `--max-warnings=455` with no new warnings.
- [ ] iOS Simulator recorded as **not run** when the agent has no Simulator.
- [ ] No evidence screenshots/logs committed to the feature branch.

## Manual verification steps

1. iOS Simulator / `just mobile-e2e-*`: **not run** on the Linux cloud agent. Record in Coverage Status.

## Non-coverage

- Unique server `event_id` per emit (PR5).
- Web reconnect-from-cursor (hook also owns composer/history/chrome).
- `apps/mobile/e2e` and visual chat UI (#323).
- Transport timeouts / `relay_ctrl` (QUALITY-012 / #324).

## Coverage Status

Implemented on `aarynlu/agent-chat-event-gate-1212`. iOS Simulator: **not run**.

| Scenario | Status | Proof                                                                                                      |
| -------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| S1       | pass   | `event-gate.test.ts` SessionStarted shared `event_id`                                                      |
| S2       | pass   | `event-gate.test.ts` + mobile `event-gate-probes.test.ts` `part_closed` then `turn_completed`              |
| S3       | pass   | Lagged replay tests in `event-gate.test.ts`                                                                |
| S4–S7    | pass   | probe regressions in api-client and mobile fold                                                            |
| S8       | pass   | snapshot floor test; mobile delayed queue                                                                  |
| S8b      | pass   | `event-gate.test.ts` `observeSnapshot cannot lower the snapshot floor`                                     |
| S9–S10   | pass   | `event-pump.test.ts` hydrate + generation                                                                  |
| S11–S12  | pass   | catch_up / resync gap tests; next seq is not a gap                                                         |
| S12b     | pass   | `event-gate.test.ts` `live gap and shouldResyncFromServer share the ahead >= 32 boundary`                  |
| S13–S14  | pass   | `abandonHydrate` drain + live apply; `hydrate-recovery.test.ts`                                            |
| S15–S16  | pass   | `session-resume.test.ts`; `use-agent-chat-thread.test.ts`                                                  |
| S17–S18  | pass   | transcript-window structural order; `agent-chat-events` 73 pass                                            |
| S19      | pass   | hook finishHydrate wiring; `facade-hydrate.test.ts` interleave + stale gen; publish-false keeps overflowed |

Commands:

```bash
bun run --filter @atmos/api-client test   # 83 pass
bun test apps/mobile/src/features/agent-chat/{event-gate-probes,hydrate-recovery,session-resume,use-agent-chat-thread,open-thread-resync,facade-hydrate,fold-transcript,fold-cards,commit-buffer-wire}.test.ts
bun test apps/web/src/features/agent/lib/__tests__/agent-chat-{events,stream-wiring,transcript-window}.test.ts
bun run --filter @atmos/api-client typecheck
bun --filter web typecheck
bun run typecheck
bun lint   # oxlint --max-warnings=455
```
