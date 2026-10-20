# TECH · QUALITY-013: Agent Chat EventGate

> Technical Design · HOW. Shared live-event sync engine for Agent Chat on web and mobile. Complements [QUALITY-006](../QUALITY-006_agent-event-identity/TECH.md) (part fold) and [QUALITY-008](../QUALITY-008_agent-chat-ui-optimization/TECH.md) (paint). Transport reliability is QUALITY-012 (#324, mobile WS lifecycle). Server `event_id` uniqueness is PR5, not this spec.

## Scope summary

QUALITY-006 makes **text/tool parts** idempotent. It does not admit, order, or drop **live** `agent_chat_event` frames. Web (~2k-line session hook) and mobile (`useAgentChatThread`) each owned subscribe / hydrate / reconnect. Live paths had no `event_id` dedup and no state revision gate. Mobile hydrate drain used `revision <= after`, which also dropped legitimate text/tool whose seq is not greater than the snapshot.

This spec is the shared **sync engine**:

1. `EventGate` — emission identity + per-key state revision + contiguous subscribe cursor + gap recommendation.
2. `EventPump` — hydrate buffer in front of the gate.
3. Mobile session hook as a thin consumer (resume from cursor; abandon hydrate on failure; retry resync).
4. Web live/hydrate admit through the same pump. Full web reconnect-from-cursor stays deferred (composer / history / chrome share that effect).

Out of scope: `apps/mobile/e2e`, agent-chat UI under `apps/mobile/src/features/agent-chat` (except the session hook / helpers), `WsSession` / relay transport (#324 / QUALITY-012), Rust emit uniqueness (PR5).

Quality targets: Q1 emission identity, Q2 state anti-rollback vs snapshot, Q3 snapshot then incremental, Q4 gap catch_up/resync, Q5 resync failure recovery, Q6 mobile cursor resume, Q7 web admit.

## Architecture overview

```
                    agent_chat_get snapshot
                              │
                              ▼
 live agent_chat_event ──► EventPump (hydrate buffer)
                              │ finishHydrate(last_event_seq)
                              ▼
                         EventGate
                    ┌─────────┴─────────┐
                    │ identity window   │  drop duplicate emission
                    │ state key + rev   │  drop revision < max(key, snapshotFloor)
                    │ contiguous cursor │  subscribe after_sequence
                    └─────────┬─────────┘
                              │ apply
                              ▼
              app fold (web agent-chat-events / mobile fold-transcript)
                              │
                     QUALITY-006 part store
```

Touched:

- `packages/api-client/src/agent-chat/event-gate.ts`
- `packages/api-client/src/agent-chat/event-pump.ts`
- `apps/mobile/src/features/agent-chat/use-agent-chat-thread.ts`
- `apps/mobile/src/features/agent-chat/session-resume.ts`
- `apps/mobile/src/features/agent-chat/hydrate-recovery.ts`
- `apps/web/src/features/agent/hooks/use-agent-chat-session.ts` (admit + subscribe `last_event_seq` check only)

Relay still only forwards. Ordering and recovery stay on the chat event (`revision` / `after_sequence` / snapshot).

## Emission identity (Q1)

Server `emit_live_ids` (`crates/core-service/src/service/agent_chat/apply_event.rs`) copies the **adapter** `event_id` onto every payload from one envelope. `SessionStarted` emits `runtime_status` then `available_commands_updated` with the same id. `finish_turn` emits one `part_closed` per open part then `turn_completed` through the same `emit` closure, again the same id. Each emit still gets a **new** `revision` via `store.next_seq`.

A gate that keys duplicates on `event_id` alone drops the second payload. That leaves the turn busy (`turn_completed` lost) or slash commands empty.

Until PR5 assigns a unique id per emitted payload, the client duplicate key is:

```text
event_id + "\0" + payload.type + "\0" + instanceKey(payload)
```

`instanceKey` distinguishes same-type multi-emits from one adapter id (`part_closed.part_id`, `text_chunk` `part_id:offset`, `tool_call_id`, `turn_id`, permission/session-op request ids). Empty `event_id` is not a duplicate.

Lagged `events_after` replay and subscribe replay still drop: same id, type, and instance. A later revision of the **same** emission is still a duplicate. Distinct types with a shared adapter id both apply; state keys then prevent chrome rollback.

Window size: `AGENT_CHAT_EVENT_ID_WINDOW = 4096` (server recent-event cap is 2048).

Do **not** drop on absolute `revision <= snapshotSeq` for text/tool. Seq assignment vs broadcast is not proven atomic (PR5). QUALITY-006 already makes those folds idempotent.

## State revision (Q2)

Last-write-wins chrome uses `agentChatEventStateKey`:

| Payload                                                                     | Key                                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `turn_started` / `turn_completed`                                           | `turn`                                                                                |
| `permission_*`                                                              | `permission`                                                                          |
| `session_op_*`                                                              | `session_op`                                                                          |
| `queue_updated`                                                             | `queue`                                                                               |
| `turn_snapshot`                                                             | `turn_snapshot:{turn_id}`                                                             |
| `session_lifecycle`                                                         | `session_lifecycle:{turn_id}` (not `action`; fold stores one lifecycle part per turn) |
| `session_config_change`                                                     | `session_config_change:{turn_id}`                                                     |
| `session_hint`                                                              | `session_hint:{message_id}:{kind}`                                                    |
| plan / usage / runtime / title / commands / grok / config / rewind          | singleton keys                                                                        |
| text / tool / `part_closed` / `user_message` / `session_forked` / `unknown` | `null` (ungated)                                                                      |

Admit state when `revision >= last`. Drop when `revision < last` (`stale_state`).

```ts
last = max(stateRevision.get(key) ?? 0, snapshotFloor);
```

A key written at 10, then a snapshot at 50, then a delayed unseen queue at 20 must drop. Using only the map entry (10) would resurrect the old queue over the snapshot. `observeSnapshot` is monotonic: a later call with a lower seq must not lower `snapshotFloor`.

Equal revision after the floor is allowed so a unique payload at `last_event_seq` is not discarded if seq and broadcast race.

## Snapshot then incremental (Q3)

```
startHydrate() → buffer live ingest
agent_chat_get → fold snapshot into app state
finishHydrate(meta.last_event_seq) → observeSnapshot, drain buffer through the gate
agent_chat_subscribe({ after_sequence: pump.cursor })
```

`cursor` is the **contiguous prefix**, not `maxRevision`. Subscribe from `maxRevision` would skip holes.

Hydrate generations: `startHydrate()` returns a token. `finishHydrate(seq, token)` / `abandonHydrate(token)` no-op when the token is stale. A nested `startHydrate` while already hydrating does **not** wipe the live buffer; the later finish owns the drain.

## Gaps, backfill, resync (Q4)

`revision > cursor + 1` attaches `gap: { from, to, size, recommend }`.

- `size < AGENT_CHAT_REVISION_GAP_RESYNC` (32) → `catch_up` (keep subscribing from `cursor`).
- otherwise → `resync` (snapshot).

Text holes inside a part still use QUALITY-006 `BackfillRequest` / `agent_chat_backfill`. That is independent of revision gaps.

After subscribe, if `shouldResyncFromServer(last_event_seq)` the consumer loads **one extra snapshot per burst**. Mobile does this on the initial subscribe **and** on the subscribe that closes a snapshot resync. Web does it on the initial hydrate subscribe (reconnect-from-cursor remains deferred).

`last_event_seq` is the watermark the subscribe **response** reports. It cannot close a server race where the handler snapshots/replays before registering the connection (apps/api `handle_agent_chat_subscribe`). Atomic subscribe+watermark is PR5 / server, not this spec.

## resyncFromSnapshot failure (Q5)

Failure modes: `agent_chat_get` throws, socket closes, effect cancelled.

Rules:

1. Every non-success exit calls `abandonHydrate(token)` so `hydrating` is false. The live buffer is **drained through the gate without a new snapshot floor** (no `observeSnapshot`). A buffered `turn_completed` applies against the last known transcript instead of being deleted. Callers fold those `apply` decisions.
2. **Mobile** cleanup of the session effect also abandons if still hydrating (`pumpRef` survives resume). Drain+fold keeps the events on `transcriptRef`. Web creates a **new** pump per effect; failed `load` drains in `catch`.
3. Retry: `nextAgentChatResyncDelayMs(failedAttemptCount)` — 400 ms × 2^n, max 3 attempts. Starting a resync **cancels** any armed backoff timer. Success resets the counter and may still replace the transcript with a later snapshot. Exhaustion leaves live apply + an error string; a later `gap.recommend === "resync"` or reconnect subscribe can try again.

Do not require `action === "apply"` to start another resync after a failed hydrate: the failed path must leave the pump in live mode first.

## Mobile and web consumers (Q6, Q7)

**Mobile** `useAgentChatThread`:

- Same chat + same WS client → `canResumeAgentChatSession`; keep pump and transcript; `subscribe(after_sequence: pump.cursor)`.
- Chat or client change → new pump, snapshot hydrate, then subscribe.
- `wsState !== "open"` during resume does not wipe the transcript.

**Web** `use-agent-chat-session`:

- `createAgentChatEventPump`, `startHydrate` before `get`, `finishHydrate` then `subscribe(eventPump.cursor)`.
- If subscribe `last_event_seq` recommends resync, one extra snapshot + resubscribe.
- `wsConnected` still reloads the whole effect (composer / history / chrome). Cursor resume is a follow-up, not this PR.

## Data model

```ts
type AgentChatGateDecision = {
  action: "apply" | "drop";
  event: AgentChatEvent;
  reason?: "duplicate_event_id" | "stale_state";
  gap?: { from: number; to: number; size: number; recommend: "catch_up" | "resync" };
};
```

No new `WsAction`. Existing: `agent_chat_get`, `agent_chat_subscribe` (`after_sequence`, `last_event_seq`), `agent_chat_backfill`, `agent_chat_unsubscribe`.

## Transport

Unchanged. EventGate sits above the session kernel. QUALITY-012 owns timeouts, long reconnect, `relay_ctrl` resubscribe, AppState.

## Security & permissions

Chat id scoping stays in the app (`eventsForChat` / `agentChatEventFor`). The gate does not authorize.

## Rollout plan

1. Pure TS gate + pump + tests in `@atmos/api-client/agent-chat`.
2. Mobile hook thin shell + hydrate recovery.
3. Web admit + subscribe `last_event_seq` check.
4. This spec (`TECH.md` / `TEST.md`) and README row.
5. PR5: unique `event_id` per emit; then the composite key can collapse to `event_id`.
6. Follow-up: web reconnect-from-cursor without tearing composer/history.

## Risks & tradeoffs

- **Adapter `event_id` reuse.** Composite key is the client fix. PR5 should still unique-ify ids so Lagged logs and persistence match one payload per id.
- **Equal revision after snapshot.** May re-apply chrome the snapshot already contains. Folds are last-write-wins / idempotent.
- **Web reconnect.** Lagged/reconnect probes on web are only guaranteed while the tab stays connected.
- **Nested hydrate.** Generation tokens beat a global `hydrating` bool; nested start keeps the buffer so a stale `finishHydrate` cannot drain the newer snapshot's live events with the old seq.
- **Rollback:** revert the api-client module and the two hooks; no schema.

## Dependencies & compatibility

- Depends on: QUALITY-006 part fold, existing `agent_chat_*` WS.
- Sibling: QUALITY-012 (#324) transport. Merge order **#324 then #325**. README may contain both 012 and 013; keep both rows on conflict.
- Blocks: none. PR5 can land after.

## Open questions

- [x] Duplicate key vs unique server ids — client composite key now; PR5 unique ids later.
- [ ] Web cursor resume without splitting `use-agent-chat-session`.
- [ ] Confirm `next_seq` vs `broadcast::send` atomicity on the server (PR5).

## Implementation Delta · 2026-10-19

Commit: `618396a98` (behavior) + this note.

Q4 originally recommended resync when `size >= 32` (`size` = missing seqs in the hole). Live `gap.recommend` used that, while `shouldResyncFromServer` used `ahead = high - cursor >= 32`. Those disagree by one at the boundary.

Current code (keep Q4 above as the original decision):

- Measure the hole against the cursor **before** absorbing this revision. `revision === cursor + 1` is not a hole.
- `ahead = revision - cursor` (same number as `serverLastSeq - cursor`).
- `size = ahead - 1`.
- `ahead < 32` → `catch_up`; `ahead >= 32` → `resync`.
- Cursor 10: rev/subscribe 41 → catch_up; 42 → resync.

Files: `packages/api-client/src/agent-chat/event-gate.ts`, `event-gate.test.ts`. Verification: `bun run --filter @atmos/api-client test` (65 pass), including `live gap and shouldResyncFromServer share the ahead >= 32 boundary`.

Merge order (original: **#324 then #325**). Clarification: #325 is not stacked on #324. After #324 is on `main`, merge `main` into #325 and route `agent_chat_resync` through `finishHydrate` / `observeSnapshot`. Do not add a second snapshot floor. `observeSnapshot` is monotonic (`seq > snapshotFloor` only).

## Implementation Delta · 2026-10-20

#324 squash-merged to `main` as `ad35a233`. #325 is based on that commit (merge `origin/main`, no rebase).

`agent_chat_resync` (QUALITY-012 façade) now goes through the existing EventPump floor:

1. `parseAgentChatResync` in `useAgentChatThread` (`subscribeMessages`).
2. Overflow still uses `applyOpenThreadResync`; the replacement `agent_chat_get` calls `startHydrate` first.
3. `publish` → `applySnapshot` → `pump.finishHydrate(seq)` → `EventGate.observeSnapshot`. Fold replay of the get race stays in `applyAgentChatResync` using that same `last_event_seq`; it is not a second gate floor.

Merge-order copy: **#324 is already on main (`ad35a233`); #325 is based on it.**
