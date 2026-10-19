# TECH · QUALITY-012: Mobile WebSocket lifecycle

> Technical Design · HOW. Mobile `/ws` over relay stalls after jitter: requests never time out, reconnect stops after the fast window, `relay_ctrl` is ignored, and iOS sockets cannot ping. This spec is the as-built contract for PR `#324`. Sister spec QUALITY-013 (`#325`, EventGate) must merge after this one.

## Scope summary

Harden the **transport and process lifecycle** of Atmos mobile WebSocket so a phone can recover from delay, reorder, duplicate frames, disconnect, backgrounding, and Computer restart **without adding seq/ack to relay**.

In scope:

- `@atmos/api-client` `WsSession` kernel: request timeout, exhausted `slow_retry`, protocol heartbeat, `pauseReconnect` / `resumeReconnect` / `retryNow` / `failPending`.
- `apps/mobile` façade `MobileWsClient` + `MobileWsProvider`: AppState, `expo-network`, `relay_ctrl` resubscribe, snapshot/incremental chat catch-up (`agent_chat_resync`).
- iOS `AtmosUrlSessionSocket`: send errors, 16 MB cap, `sendPing` / pong, receive-failure close codes.
- Spec correction of APP-049 mobile defaults (request timeout and exhausted behavior).

Out of scope:

- Relay Durable Object seq/ack (`packages/relay`).
- Shared EventGate / chat append identity (`#325` / QUALITY-013).
- Rust Computer `/ws` handlers (`#` PR5).
- `apps/mobile/e2e` and Agent Chat **UI** files under `apps/mobile/src/features/agent-chat` (screens, chrome). The thread hook may apply an in-place snapshot so the open transcript does not stay stale.
- Relaxing oxlint `--max-warnings`.

## Quality target

| Surface                     | Before                             | After                                                                                                                                          |
| --------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile request timeout      | `0` (never)                        | `DEFAULT_MOBILE_REQUEST_TIMEOUT_MS = 30_000`                                                                                                   |
| Exhausted reconnect         | `stop` after 5 fast attempts       | `slow_retry` every 60s while foreground + online                                                                                               |
| Heartbeat                   | none                               | 20s interval / 10s pong watchdog when `WebSocketLike.ping` exists; ping-less sockets keep looping the interval without inventing an idle close |
| `relay_ctrl`                | dropped                            | fail in-flight requests; keep `wsState === "open"`; resubscribe; snapshot fallback                                                             |
| App background / offline    | reconnect timers keep firing       | pause kernel reconnect **and** resubscribe timers; resume + `retryNow` on foreground / network                                                 |
| Chat after Computer restart | subscribe 200 treated as caught up | subscribe then snapshot when `last_event_seq !== after_sequence`; emit `agent_chat_resync`                                                     |

## Architecture

```text
AppState / expo-network
        │
        ▼
MobileWsProvider  ── setForeground / setNetworkOnline
        │              NetworkUpdateGate (ignore stale getNetworkStateAsync)
        ▼
MobileWsClient
  ├─ AgentChatCursorTracker (subscribe + live revision)
  ├─ relay_ctrl → failPending + scheduleResubscribe (lifecycle-gated)
  ├─ resubscribeNow → agent_chat_subscribe then maybe agent_chat_get
  └─ emit { type: "agent_chat_resync", chat_id, snapshot }  (not a WsEvent)
        │
        ▼
WsSession  (packages/api-client)
  timeout / heartbeat generation / pause / retryNow generation-safe connect
        │
        ▼
iOS URLSession ping  |  Android RN WebSocket (no protocol ping)
```

Relay still only forwards bytes and may inject `{ type: "relay_ctrl", code: "server_offline" }`. Recovery identity is agent-chat `revision` / `after_sequence` / `meta.last_event_seq`.

## Kernel: timeout, heartbeat, reconnect

### Request timeout

`sendRequest` stores a pending slot keyed by `request_id`. When `requestTimeoutMs > 0`, the timer **deletes the slot then rejects**. A late response for that id is ignored. A later request with a new id must still work. Default for mobile is 30s so backfill in-flight keys cannot leak forever.

### Heartbeat ping-pong

- `heartbeatIntervalMs` (mobile 20s) schedules `beat()`.
- If `sock.ping` exists: send protocol ping, arm `heartbeatTimeoutMs` (10s) watchdog, close `4008` on timeout or ping error.
- **Generation / socket identity:** `clearHeartbeat()` increments `heartbeatGeneration`. Pong callbacks and watchdogs no-op when the generation or `this.socket !== sock`. A late pong from pause/resume or from a replaced socket must not clear the current watchdog.
- If `sock.ping` is missing (Android RN): reschedule the interval so the heartbeat does not die after one timer. Do **not** close a quiet chat for lack of application messages. Half-open recovery on ping-less stacks is OS close + AppState/network + `slow_retry`.

### Reconnect

`DEFAULT_MOBILE_RECONNECT`: 5 fast attempts (500ms…5s), then `exhausted: { type: "slow_retry", delayMs: 60_000 }`. `reconnectBeforeOpen: true`. Intentional `disconnect()` sets `closedByClient` and must not resume on `retryNow`.

`pauseReconnect()` sets `reconnectPaused`, clears reconnect + heartbeat timers, and does not close an open socket. `connect()` while paused is a no-op (does not open a new handshake). `resumeReconnect()` restarts heartbeat if already open, otherwise `retryNow()`.

`retryNow()` is a no-op when paused, client-closed, or already open. It must not join an **unsettled** handshake. After the previous connect promise has **settled** but its `.finally` has not run, a new handshake is allowed; the old `finally` must not null the new `connectWaiters` (connect generation).

Disabled reconnect (`policy.enabled === false`) maps kernel `disconnected` to façade `closed`, not a forever “reconnecting” banner.

## Provider lifecycle

| Input                           | Client                                                              |
| ------------------------------- | ------------------------------------------------------------------- |
| `AppState !== "active"`         | `setForeground(false)` → pause reconnect + cancel resubscribe       |
| `AppState === "active"`         | `setForeground(true)` + re-query `Network.getNetworkStateAsync()`   |
| network `isConnected === false` | `setNetworkOnline(false)` + alert `No network connection.`          |
| network recovered               | `setNetworkOnline(true)` → resume + `retryNow` + re-arm resubscribe |

`NetworkUpdateGate`: every listener event bumps a generation. In-flight `getNetworkStateAsync()` applies only if its generation is still current, so a stale snapshot cannot pause retries after a newer live event.

Initial `client.connect()` runs after applying current AppState. If the app is already backgrounded, pause wins and `connect()` does not open a socket until foreground + online.

## `relay_ctrl` resubscribe and chat resync

`relay_ctrl` must **not** change `wsState` off `open`. `useAgentChatThread` remounts and wipes the transcript when `wsState !== "open"`. Full TCP drop still remounts; in-place persistence across a dropped socket is QUALITY-013.

### Cursor

`AgentChatCursorTracker` records `agent_chat_subscribe` / unsubscribe and advances `after_sequence` from live `agent_chat_event.revision` for tracked chats only.

### Resubscribe loop

On `relay_ctrl` with at least one tracked chat:

1. `failPending` (in-flight requests die; socket stays open).
2. Set alert `Atmos Computer went offline. Catching up this chat.`
3. Mark `resubscribeNeeded` and `scheduleResubscribe` (0, 250ms, 500ms, … cap 15s).

`scheduleResubscribe` / `resubscribeNow` **no-op while backgrounded or offline**, and pause **clears** a pending timer. When both flags allow live work again, if `resubscribeNeeded` is still set, re-arm the loop.

### Catch-up semantics (P1)

Subscribe HTTP/WS **success is not catch-up**. Server `events_after` is an in-memory capped buffer. After Computer restart it is empty; `agent_chat_subscribe` still returns `{ last_event_seq }` from persisted snapshot.

For each tracked chat:

1. `agent_chat_subscribe({ chat_id, after_sequence: cursor })`.
2. Read `last_event_seq` from the response.
3. If `last_event_seq === cursor`, incremental path is done (nothing missed, or replay already landed as notifications).
4. If `last_event_seq == null` **or** `last_event_seq !== cursor`, call `agent_chat_get({ chat_id })` and emit a **façade** message:

```ts
{
  type: ("agent_chat_resync", chat_id, snapshot);
}
```

This is **not** a `WsEvent` and must not be added to the Rust enum / `@atmos/api-types` contract in this spec.

5. Advance the cursor to `max(cursor, snapshot.meta.last_event_seq, last_event_seq)`.
6. Clear the catching-up alert only after **every** tracked chat finished subscribe + optional snapshot without throwing. Failures back off and keep the alert.

The open thread hook applies the snapshot **in place** (`transcriptFromAgentChatSnapshot`) without setting `loading` or replacing the effect deps. The user must not see an empty flash. Permission / queue / running turn come from the snapshot. QUALITY-013 may later fold this through EventGate.

## iOS socket

- `send` throws if not open; async send error emits `error`.
- `maximumMessageSize = 16 MiB`.
- `sendPing` + `pong` event for kernel heartbeat.
- Receive `.failure`: if `task.closeCode` is still `invalid` (0), **defer** to `urlSession(_:task:didCompleteWithError:)`. If a close code is present, complete with that code. A normal close (`1000`) must not emit `error` / `wasClean: false`.

## APP-049 correction

APP-049 TECH table still listed mobile exhausted `stop` and no request timeout. Those rows are now historical. Named defaults in `packages/api-client/src/ws/defaults.ts` are the source of truth; APP-049 TECH §6 is updated to match this spec.

## Risks / follow-ups

| Risk                                                 | Handling                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Android has no protocol ping                         | Interval keeps looping; OS + lifecycle recover half-open. Device 待验证.   |
| Relay has no `server_online`                         | Subscribe backoff until Computer is back.                                  |
| 16 MiB cap vs large tool payloads                    | Device 待验证.                                                             |
| Full WS drop still remounts the thread               | QUALITY-013 EventGate.                                                     |
| Snapshot vs events that land during `agent_chat_get` | Same race as initial load; snapshot is server truth.                       |
| `#325` touches the same hook                         | Keep hook change to applying `agent_chat_resync` only. Merge `#324` first. |

## Verification

See `TEST.md`. Commands: `bun test` on `packages/api-client/src/ws/session.test.ts` and `apps/mobile/src/api`; package + mobile typecheck; oxlint/oxfmt on touched files; `bun lint` must stay at the QUALITY-010 cap (`--max-warnings=455`). iOS Simulator is **not run** in the Linux agent environment.
