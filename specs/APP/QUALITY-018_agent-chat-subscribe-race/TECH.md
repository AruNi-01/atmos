# TECH · QUALITY-018: Agent Chat Subscribe Race

> Technical Design · HOW. Closes the server gap in `handle_agent_chat_subscribe` that [QUALITY-013](../QUALITY-013_agent-chat-event-gate/TECH.md) left as a server follow-up (issue #330). No BRAINSTORM or PRD (quality spec).

## Scope summary

`apps/api/src/api/ws/router/agent_chat.rs` `handle_agent_chat_subscribe` currently:

1. `agent_chat().get()` for a snapshot
2. `events_after(after_sequence)` and replays those events to `conn_id`
3. inserts `conn_id` into `agent_chat_subs`
4. returns `snapshot.meta.last_event_seq` from step 1

A live event persisted after step 2 and fanned out before step 3 is in none of those three places. The client watermark matches the pre-gap snapshot, so EventGate does not `shouldResyncFromServer`, and the missed `turn_completed` / `part_closed` / queue event never arrives.

This spec changes only that handler. It does not change EventGate, the wire shape, or add a server-side dedupe pass.

## Quality target

| Item                                       | Before                                        | After                                                                            |
| ------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------- |
| Subscriber registration                    | After snapshot and replay                     | Before snapshot and replay                                                       |
| `last_event_seq` in the subscribe response | Snapshot taken before registration            | `AgentChatStore::get_meta` after registration and after replay                   |
| Event that lands in the old gap            | Dropped, watermark stays behind it            | Live fan-out sees `conn_id`, and the watermark is at least that revision         |
| Overlap of replay and live                 | Not possible for the gap event                | Allowed. Client EventGate drops the duplicate `event_id`. Server does not filter |
| Unknown chat                               | `get` fails before insert                     | Insert is rolled back when `get` or the post-replay meta read fails              |
| Wire / clients                             | `agent_chat_subscribe` → `{ last_event_seq }` | Same fields. No compatibility shim                                               |

## Decision

Register first, then snapshot and replay. Do not hold `agent_chat_subs` across `get().await` or `send_to`.

Why this and not one write-lock critical section:

- `emit_with_seq` pushes the recent ring, then `broadcast::send`, then `persist_seq`. A receiver that is already in `agent_chat_subs` cannot miss the broadcast.
- An event whose broadcast ran before insert is already in the recent ring, so the replay after insert still contains it.
- Holding the write lock across transcript `get()` would stall fan-out for every chat for a disk read. The issue allows that critical section; this spec does not take it.
- Overlap (live send plus replay of the same `AgentChatEvent`) is the intended cost. `agentChatEventDuplicateKey` is `event_id + type + instance`. The server must not drop one of the copies.

The returned watermark is not the pre-register snapshot. After replay, read `store().get_meta(chat_id).last_event_seq` (this applies the in-memory seq overlay). That read is after insert. Events appended during replay are included. They were also live-delivered because the connection was already registered. The client dedupes.

## Architecture overview

```
WsMessageService::handle_agent_chat_subscribe
  register conn_id in agent_chat_subs
  AgentChatService::get          // existence + leftover-part close; seq discarded
  events_after(after_sequence)   // replay list
  [cfg(test) pause]              // race test only
  WsManager::send_to             // replay, no server dedupe
  AgentChatStore::get_meta       // last_event_seq after registration
  on get/meta error: remove conn_id

spawn_agent_chat_fanout          // unchanged; reads agent_chat_subs then send_to
```

No new crate, table, `WsAction`, or REST route.

## Module-by-module design

### `apps/api/src/api/ws/router/agent_chat.rs`

```rust
async fn register_agent_chat_sub(&self, chat_id: &str, conn_id: &str)
async fn unregister_agent_chat_sub(&self, chat_id: &str, conn_id: &str)

pub(super) async fn handle_agent_chat_subscribe(...) -> Result<Value>
```

Order inside `handle_agent_chat_subscribe`:

1. `register_agent_chat_sub`.
2. `agent_chat().get`. On error, `unregister_agent_chat_sub` and return the error. The snapshot seq is not the response.
3. `events_after`.
4. Test-only pause (`subscribe_race_pause::pause`) so a unit test can emit while the replay list is already captured and the connection is already registered. Absent from release builds.
5. Replay via `WsManager::send_to` when a manager is set. Send every missed event, including ones fan-out may also deliver.
6. `store().get_meta` for `last_event_seq`. On error, unregister and return the error.
7. `Ok({ "last_event_seq": last_event_seq })`.

`handle_agent_chat_unsubscribe` stays as it is.

### `apps/api/src/api/ws/router/mod.rs`

`WsMessageService::new` keeps today's paths (`default_chats_dir()`, `default_agent_data_dir()`, `options_probe_dir()`).

A private `assemble(..., chats_dir, agent_data_dir, options_probe_dir)` is what `new` calls. Production passes `options_probe_dir()`. `#[cfg(test)] new_with_agent_data_dir` points the chat store, host-session store, and options probe at a temp directory so the race test does not write `~/.atmos/data/agent/chats`.

Fan-out in `spawn_agent_chat_fanout` is unchanged.

### Clients

No edits. Web `use-agent-chat-session` and mobile `use-agent-chat-thread` already pass `last_event_seq` to `shouldResyncFromServer` and admit live events through EventGate.

## Data model

No new type. Response stays:

```json
{ "last_event_seq": 12 }
```

`last_event_seq` is a `u64` sampled after the connection is in `agent_chat_subs` and after the replay sends for this call have been attempted.

## Transport

Existing `agent_chat_subscribe` (`after_sequence` in, `last_event_seq` out). No new `WsAction` or REST route.

## Security & permissions

Unchanged. Subscribe still does not authorize the chat id; the local API trust model is unchanged. The test temp directory is not the user chat directory.

## Rollout plan

1. This spec and the `specs/README.md` row.
2. Register-first handler, rollback on `get` / meta failure, watermark re-read. No client change.
3. `subscribe_delivers_event_emitted_in_the_pre_register_gap` plus the unknown-chat rollback test. `cargo test -p api` and `cargo clippy -p api --all-targets --all-features -- -D warnings`.

One PR. No feature flag. No backward-compatible response field.

## Risks & tradeoffs

- **Risk**: Register-then-fail leaks `conn_id` if a later error path forgets `unregister_agent_chat_sub`. The unknown-chat test locks the `get` failure path.
- **Risk**: Watermark can be one or more revisions ahead of what the client has applied, when the event was also live-sent. EventGate applies that event once and ignores the duplicate. A gap under 32 does not resync; the event must actually be sent. Register-first is what makes the send happen.
- **Tradeoff**: A single `agent_chat_subs` write guard around snapshot, replay, and the watermark read would also close the gap, and would block every chat's fan-out on transcript IO. Register-first does not.
- **Tradeoff**: Two reads (`get` for the leftover-part close, `get_meta` for the watermark) instead of returning the first snapshot. Subscribe is not the token stream.
- **If this breaks in production**: revert the handler to snapshot-then-register. The race returns; clients behave as they do on `main` today.

## Dependencies & compatibility

- Depends on QUALITY-013 EventGate for overlap dedupe. This spec does not change that package.
- Issue #330. Cubic note on PR #325: register and watermark before relying on cursor recovery.
- No minimum client version. The response shape is unchanged.
- `package.json` `lint` stays `oxlint --max-warnings=455`.

## Open questions

None. Overlap dedupe stays on the client. No compatibility shim.
