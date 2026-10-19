# TEST · QUALITY-012: Mobile WebSocket lifecycle

> Test plan for timeout, heartbeat, reconnect, AppState/network pause, `retryNow`, `relay_ctrl` resubscribe, and chat resync. References TECH QUALITY-012. Coverage Status is filled after the commands actually run.

## Test strategy

Proof is **fake-socket unit tests** that drive `WsSession` and `MobileWsClient` (open, close, ping, `relay_ctrl`, replies). Do not assert by scanning source strings for kernel behavior.

Layers:

- **Package unit** (`packages/api-client`): timeout slot release, slow_retry 59999/1, heartbeat generation, pause vs `connect()`, `retryNow` vs connect `finally`.
- **Mobile unit** (`apps/mobile/src/api`): façade mapping, lifecycle-gated resubscribe, snapshot fallback, network generation gate, ping-less heartbeat loop.
- **Hook / fold**: in-place snapshot helper; hook listens for `agent_chat_resync` without remounting.
- **Typecheck / lint** on touched packages. oxlint cap is zero slack (`--max-warnings=455`).
- **Manual / not run:** iOS Simulator, Android device, real relay. Record the gap; do not push screenshots or logs into the repo.

No Playwright mobile journey. `apps/mobile/e2e` is frozen.

## Coverage map

| Requirement                                                | Scenario IDs  |
| ---------------------------------------------------------- | ------------- |
| 30s request timeout releases the pending slot              | S1            |
| Exhausted mobile reconnect is 60s `slow_retry`             | S2            |
| Heartbeat ping timeout reconnects                          | S3            |
| Late pong must not cancel the current watchdog             | S4            |
| Ping-less sockets keep the interval looping                | S5            |
| `pauseReconnect` blocks backoff **and** direct `connect`   | S6            |
| `retryNow` is generation-safe vs connect `finally`         | S7            |
| Disabled reconnect maps to `closed`, not `reconnecting`    | S8            |
| Background/offline pauses reconnect                        | S9            |
| Foreground / network recovery `retryNow`                   | S9, S10       |
| Stale `getNetworkStateAsync` cannot overwrite a live event | S11           |
| `relay_ctrl` keeps socket `open` and resubscribes          | S12           |
| Resubscribe loop honors lifecycle pause                    | S13           |
| Subscribe success with seq gap triggers snapshot resync    | S14           |
| Equal `last_event_seq` does not snapshot                   | S15           |
| Hook applies resync in place (no empty flash)              | S16           |
| iOS receive failure uses real close code / defers          | S17           |
| APP-049 defaults match code                                | S18           |
| Lint / typecheck / format gates                            | S19           |
| iOS Simulator / device                                     | S20 (not run) |
| Failed snapshot fetch keeps cursor / pending marker        | S21           |
| Resync replays events newer than snapshot seq              | S22           |
| Snapshot restores `meta.available_commands`                | S23           |
| Ring overflow keeps transcript until replacement get       | S24           |
| Overflow follow-up get is generation-guarded               | S25           |
| Replaced-socket late error must not error the new socket   | S26           |
| Overlapping resubscribe must not clear catching-up early   | S27           |

## Execution map

| Scenario | Level     | Tool      | Command / method                                                         | Signals                                                                                                      | Status  |
| -------- | --------- | --------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------- |
| S1       | Unit      | Bun       | `bun test src/ws/session.test.ts` in `packages/api-client`               | timeout reject; late response ignored; next request still correlates                                         | pass    |
| S2       | Unit      | Bun       | same                                                                     | after exhaust, 59_999 ms no new socket; +1 ms creates one                                                    | pass    |
| S3       | Unit      | Bun       | same                                                                     | ping watchdog close → reconnect                                                                              | pass    |
| S4       | Unit      | Bun       | same                                                                     | old-socket pong then current watchdog still fires                                                            | pass    |
| S5       | Unit      | Bun       | same                                                                     | no `ping`; two intervals later still `connected` and a timer remains                                         | pass    |
| S6       | Unit      | Bun       | same                                                                     | `pauseReconnect` then `connect()` does not create a socket; resume does                                      | pass    |
| S7       | Unit      | Bun       | same                                                                     | close + `retryNow` + `connect()` in one turn; after microtask open, promise settles                          | pass    |
| S8       | Unit      | Bun       | `bun test apps/mobile/src/api/mobile-ws-client.test.ts`                  | `reconnect: false` + unclean close → `closed`                                                                | pass    |
| S9       | Unit      | Bun       | same                                                                     | background close: no timer; foreground creates a socket                                                      | pass    |
| S10      | Unit      | Bun       | same                                                                     | network offline pause; online retries                                                                        | pass    |
| S11      | Unit      | Bun       | `bun test apps/mobile/src/api/mobile-ws-transport.test.ts`               | `NetworkUpdateGate`: live event then stale async id is ignored                                               | pass    |
| S12      | Unit      | Bun       | mobile-ws-client test                                                    | `relay_ctrl` keeps one socket `open`; subscribe from cursor                                                  | pass    |
| S13      | Unit      | Bun       | same                                                                     | `relay_ctrl` then `setForeground(false)` clears timer; foreground re-arms                                    | pass    |
| S14      | Unit      | Bun       | same                                                                     | subscribe `last_event_seq` > cursor → `agent_chat_get` + `agent_chat_resync`                                 | pass    |
| S15      | Unit      | Bun       | same                                                                     | equal seq → no `agent_chat_get`; alert clears                                                                | pass    |
| S16      | Unit      | Bun       | fold-transcript + hook source                                            | `applyAgentChatResync` + hook `parseAgentChatResync` in `subscribeMessages`                                  | pass    |
| S17      | Review    | File read | Swift `receiveNext`                                                      | closeCode `0` defers; non-zero used; 1000 not forced as 1006                                                 | pass    |
| S18      | Review    | File read | `defaults.ts` + APP-049 TECH §6                                          | mobile exhausted `slow_retry` 60s; timeout 30s; `reconnectBeforeOpen` on the type                            | pass    |
| S19      | Toolchain | bun/oxc   | api-client + mobile typecheck; `bun lint`; `bunx oxfmt` on touched paths | typecheck 0; lint 0 errors at cap 455; oxfmt writes/check on touched files                                   | pass    |
| S20      | Manual    | Simulator | `just mobile-ios*`                                                       | **not run** (no iOS Simulator in this environment)                                                           | not run |
| S21      | Unit      | Bun       | mobile-ws-client test                                                    | failed `agent_chat_get` → retry subscribe still uses old cursor and gets again                               | pass    |
| S22      | Unit      | Bun       | fold-transcript test                                                     | snapshot seq 40 + live revision 41 kept; revision 39 dropped                                                 | pass    |
| S23      | Unit      | Bun       | fold-transcript test                                                     | `meta.available_commands` → `state.commands`                                                                 | pass    |
| S24      | Unit      | Bun       | open-thread-resync test                                                  | overflow + failed get publishes nothing; overflowed stays true                                               | pass    |
| S25      | Unit      | Bun       | same                                                                     | stale overlapping get held; newer replacement publishes; cancelled get holds; overflow during get keeps flag | pass    |
| S26      | Unit      | Bun       | session + mobile-ws-client tests                                         | replaced-socket late `onerror` leaves kernel `connected` / client `open`                                     | pass    |
| S27      | Unit      | Bun       | mobile-ws-client test                                                    | overlapping `resubscribeNow` keeps catching-up alert until the latest round finishes                         | pass    |

## Scenarios

### S1 — Timeout releases the pending slot

- **Level**: Unit
- **Given**: connected `WsSession` with `requestTimeoutMs = 50`.
- **When**: a request is sent, the timer fires, then a response for that `request_id` arrives, then a second request is sent and answered with its own id.
- **Then**: the first promise rejects with `timeout`; the stale response does not resolve anything; the second promise resolves.
- **Signals**: bun expects.

### S2 — Slow retry is 60s, not “any flush of 60s”

- **Level**: Unit
- **Given**: mobile policy `maxAttempts: 1`, fast delay 100ms, default exhausted 60s.
- **When**: two unclean closes exhaust the fast window, then fake time advances 59_999 ms, then 1 ms.
- **Then**: no new socket at 59_999; the next millisecond creates the slow-retry socket.
- **Signals**: `created` counts.

### S3 — Ping timeout

- **Level**: Unit
- **Given**: heartbeat 40ms / watchdog 10ms.
- **When**: interval fires and no pong arrives before the watchdog.
- **Then**: socket closes with ping timeout and reconnect is scheduled.
- **Signals**: new `createWebSocket` call.

### S4 — Late pong / old socket

- **Level**: Unit
- **Given**: a ping is in flight; the socket is replaced (timeout close + reconnect) or heartbeat is paused and resumed so a second ping starts.
- **When**: the **old** pong callback runs, then the current watchdog delay elapses with no current pong.
- **Then**: the current socket still times out. The late pong must not `clearTimeout` the new watchdog.
- **Signals**: current `readyState === 3` or session `reconnecting`.

### S5 — Ping-less loop

- **Level**: Unit
- **Given**: a socket **without** `ping`.
- **When**: two heartbeat intervals elapse with no inbound messages.
- **Then**: state stays `connected`; a heartbeat timer is still pending. The session must not close the quiet socket.
- **Signals**: `state === "connected"`, `pending() > 0`.

### S6 — Pause gates `connect()`

- **Level**: Unit
- **Given**: `pauseReconnect()` on a fresh session.
- **When**: `connect()` is called.
- **Then**: no socket is created. `resumeReconnect()` creates one.
- **Signals**: `created` 0 then 1.

### S7 — `retryNow` vs connect `finally`

- **Level**: Unit
- **Given**: `connect()` opens then unclean-closes in the same turn, then `retryNow()` then `connect()` before microtasks.
- **When**: one microtask (old `finally`) runs, then the replacement socket opens.
- **Then**: the in-flight connect promise settles and state is `connected`. It must not hang.
- **Signals**: `await` of the second connect resolves.

### S8 — Disabled reconnect

- **Level**: Unit
- **Given**: `MobileWsClient` with `reconnect: false`.
- **When**: the server closes uncleanly.
- **Then**: façade state is `closed`, not `reconnecting`; no reconnect timer.
- **Signals**: `client.state`, timer list.

### S9 / S10 — AppState and network

- **Level**: Unit
- **Given**: an open client.
- **When**: `setForeground(false)` or `setNetworkOnline(false)` then server close; then the matching resume.
- **Then**: no reconnect while paused; resume opens a new socket. Offline sets the network alert; online clears it.
- **Signals**: instance count, `transportAlert`.

### S11 — Network generation gate

- **Level**: Unit
- **Given**: `NetworkUpdateGate`.
- **When**: `nextAsync()` then `live()` then `isCurrent(id)`.
- **Then**: `false`. A live listener wins over a stale snapshot.
- **Signals**: boolean asserts.

### S12 — `relay_ctrl` resubscribe

- **Level**: Unit
- **Given**: subscribed chat, cursor advanced by a live event to 12.
- **When**: `{ type: "relay_ctrl", code: "server_offline" }` then the delay-0 timer.
- **Then**: still one socket, state `open`, subscribe `after_sequence: 12`. Equal `last_event_seq` clears the alert (S15).
- **Signals**: sent payload, `transportAlert`.

### S13 — Background cancels resubscribe

- **Level**: Unit
- **Given**: `relay_ctrl` has armed a timer.
- **When**: `setForeground(false)` before the timer fires, then `setForeground(true)`.
- **Then**: the paused client sends no subscribe; resume re-arms a timer and a later fire sends subscribe.
- **Signals**: `sent.length`, timer list.

### S14 — Snapshot fallback (P1)

- **Level**: Unit
- **Given**: cursor 12, subscribe reply `{ last_event_seq: 40 }` with **no** replayed `agent_chat_event` notifications.
- **When**: resubscribe timer fires and both replies are delivered.
- **Then**: client sends `agent_chat_get` for that `chat_id`, then `subscribeMessages` observers receive `{ type: "agent_chat_resync", chat_id, snapshot }`. Alert clears only after the snapshot round-trip. State stays `open`.
- **Signals**: request actions in order; resync message; alert null.

### S15 — No snapshot when seq matches

- **Level**: Unit
- **Given**: cursor 12, subscribe reply `{ last_event_seq: 12 }`.
- **When**: resubscribe completes.
- **Then**: no `agent_chat_get`; alert clears.
- **Signals**: sent actions.

### S16 — In-place apply

- **Level**: Unit
- **Given**: `applyAgentChatResync` / `transcriptFromAgentChatSnapshot` with messages and `pending_permission`.
- **When**: the helper runs, and the hook source is scanned.
- **Then**: messages and permission are present; the hook source calls `parseAgentChatResync` then `applyOpenThreadResync` inside `subscribeMessages` and publishes `applied.state`. Composer `sendFailed` is not cleared.
- **Signals**: fold-transcript expect; **hook coverage is a source scan**, not a runtime `useAgentChatThread` drive (no jsdom here). Do not read S16 as a mounted-hook proof.

### S21 — Failed snapshot keeps the cursor

- **Level**: Unit
- **Given**: cursor 10, subscribe reply `{ last_event_seq: 40 }`, then `agent_chat_get` fails.
- **When**: the resubscribe timer fires again.
- **Then**: subscribe still uses `after_sequence: 10` and `agent_chat_get` is sent again (`pendingSnapshots`).
- **Signals**: last request action + data.

### S22 — Replay newer than snapshot

- **Level**: Unit
- **Given**: snapshot `last_event_seq: 40` and a live `user_message` at revision 41 plus an older one at 39.
- **When**: `applyAgentChatResync` runs.
- **Then**: the transcript has the snapshot messages plus the revision-41 message only.
- **Signals**: message ids.

### S23 — Snapshot slash commands

- **Level**: Unit
- **Given**: snapshot `meta.available_commands`.
- **When**: `transcriptFromAgentChatSnapshot` runs.
- **Then**: `state.commands` is the normalized list (not `[]`).
- **Signals**: fold-transcript expect.

### S24 — Overflow keeps the current transcript

- **Level**: Unit
- **Given**: `applyOpenThreadResync` with `overflowed === true`.
- **When**: the replacement get rejects, or succeeds.
- **Then**: a failed get publishes nothing and leaves `overflowed` true. A successful get publishes the **replacement** snapshot, not the incoming one. Non-overflow publishes incoming and does not fetch.
- **Signals**: `open-thread-resync.test.ts` published array + result `"held"` / `"applied-replacement"` / `"applied-incoming"`.

### S25 — Overflow follow-up get is generation-guarded

- **Level**: Unit
- **Given**: an overflow follow-up get is in flight, then a newer resync starts — or the ring overflows again (`overflowGen` bumps) while that get is in flight.
- **When**: the older get resolves after the newer replacement has published; or the in-flight get succeeds after another overflow.
- **Then**: the stale get returns `"held"` and does not publish. Only the newer replacement is published. Setting `ctrl.cancelled` while a replacement get is in flight (hook unmount) also returns `"held"` and does not publish. Overflow during the get still publishes the replacement but **leaves `overflowed` true**.
- **Signals**: overlapping promises, cancelled-during-get, and overflow-during-get in `open-thread-resync.test.ts`.

### S26 — Replaced socket late error

- **Level**: Unit
- **Given**: a connected `WsSession` / `MobileWsClient` whose current socket is replaced (old `readyState !== OPEN`, then `retryNow` / foreground resume).
- **When**: the previous socket's captured `onerror` fires after the new socket is open.
- **Then**: kernel stays `connected`, client stays `open`, old handlers are unbound, and an in-flight request on the new socket still resolves. The open-thread hook therefore does not take the `wsState !== "open"` remount path that would clear transcript.
- **Signals**: `late error from a replaced socket does not error the new connection`; `late error from a replaced socket does not mark the client error`.

### S27 — Overlapping resubscribe alert

- **Level**: Unit
- **Given**: catching-up alert is showing and the first `resubscribeNow` is waiting on `agent_chat_get`.
- **When**: `setForeground(true)` arms a second delay-0 round; the stale get then succeeds.
- **Then**: the catching-up alert stays until the **latest** round finishes subscribe + snapshot. Client stays `open`.
- **Signals**: `overlapping resubscribe keeps the catching-up alert until the latest round finishes`.

### S17 — Swift close code

- **Level**: Review
- **Given**: `AtmosUrlSessionSocketModule.swift` `receiveNext`.
- **When**: receive fails.
- **Then**: `closeCode == 0` returns without `complete`; non-zero uses that code; normal closure does not force 1006.
- **Signals**: source read during implementation review.

### S18 — APP-049

- **Level**: Review
- **Given**: APP-049 TECH §6 and `defaults.ts`.
- **When**: compared.
- **Then**: mobile exhausted is `slow_retry` 60s; request timeout 30s; `ReconnectPolicy` includes `reconnectBeforeOpen`. QUALITY-012 owns the product change.

### S19 — Toolchain

- **Level**: Toolchain
- **When**: typecheck + lint on this branch.
- **Then**: no new tsc errors; oxlint at cap 455 with 0 errors; touched files formatted.

### S20 — iOS Simulator

- **Level**: Manual
- **Then**: **not run**. No iOS Simulator on the Linux agent. Do not commit simulator screenshots or logs.

## Regression checklist

- Web `DEFAULT_WEB_RECONNECT` exhausted `slow_retry` still covered by existing session tests.
- Mobile façade still rejects requests while reconnecting (no queue).
- Intentional `close()` / `disconnect()` does not resume.
- `apps/mobile/e2e` untouched.

## Non-coverage

- Real Cloudflare/relay idle timeout vs 20s ping (device).
- Android half-open without protocol ping (device).
- EventGate ordering across a full TCP drop (QUALITY-013).
- Playwright / agent-browser (no web UI change).

## Coverage Status

Recorded on `aarynlu/mobile-ws-lifecycle-d365` after review fixes (Linux cloud agent, no iOS Simulator).

| Scenario | Status  | Evidence                                                                                        |
| -------- | ------- | ----------------------------------------------------------------------------------------------- |
| S1       | pass    | `packages/api-client` `request times out and releases the pending slot`                         |
| S2       | pass    | `mobile exhausted slow_retry` flushes 59_999 then 1                                             |
| S3       | pass    | `heartbeat ping timeout closes the socket so reconnect can run`                                 |
| S4       | pass    | late pong after pause/resume **and** replaced-socket tests                                      |
| S5       | pass    | `ping-less sockets keep the heartbeat interval looping`                                         |
| S6       | pass    | `pauseReconnect blocks a direct connect until resume`                                           |
| S7       | pass    | `retryNow connect promise survives the previous finally`                                        |
| S8       | pass    | `disabled reconnect maps a drop to closed instead of reconnecting`                              |
| S9       | pass    | AppState background/foreground client test                                                      |
| S10      | pass    | network recovery client test                                                                    |
| S11      | pass    | `NetworkUpdateGate ignores a stale async snapshot`                                              |
| S12      | pass    | `relay_ctrl resubscribes from the current cursor`                                               |
| S13      | pass    | `background pause cancels relay_ctrl resubscribe until foreground`                              |
| S14      | pass    | `resubscribe with a seq gap fetches a snapshot and emits agent_chat_resync`                     |
| S15      | pass    | S12 reply `{ last_event_seq: 12 }` with cursor 12; no get                                       |
| S16      | pass    | `applyAgentChatResync` + hook source `parseAgentChatResync` then `applyAgentChatResync`         |
| S17      | pass    | Swift `receiveNext` defers `closeCode == 0`; uses real code otherwise                           |
| S18      | pass    | `defaults.ts` + APP-049 TECH §6 including `reconnectBeforeOpen`                                 |
| S19      | pass    | `@atmos/api-client` and `@atmos/mobile` typecheck 0; `bun lint` exit 0; `bunx oxfmt` on touched |
| S20      | not run | No iOS Simulator in this environment                                                            |
| S21      | pass    | `failed snapshot fetch keeps the old cursor so retry still gets`                                |
| S22      | pass    | `replays live events newer than the snapshot sequence`                                          |
| S23      | pass    | snapshot restores `/fork` into `state.commands`                                                 |
| S24      | pass    | `holds the current transcript when the replacement get fails` + apply-replacement test          |
| S25      | pass    | stale get held; newer replacement publishes; cancelled-during-get holds; overflow-during-get keeps flag |
| S26      | pass    | kernel + mobile replaced-socket late `onerror` stay `connected` / `open`                        |
| S27      | pass    | overlapping `resubscribeNow` keeps catching-up alert until the latest round                     |

Commands:

```bash
bun run --filter @atmos/api-client typecheck
bun run --filter @atmos/api-client test          # 50 pass
bun run --filter @atmos/mobile typecheck
bun test src/api src/features/agent-chat/fold-transcript.test.ts src/features/agent-chat/use-agent-chat-thread.test.ts src/features/agent-chat/open-thread-resync.test.ts
# in apps/mobile → 50 pass
bun lint                                         # oxlint --max-warnings=455, exit 0
bunx oxfmt <touched paths>
```
