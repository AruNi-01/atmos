# TECH · APP-049: API Client

> Technical design · HOW. Framework-agnostic main-app WS session kernel; app-owned URL/auth/bootstrap; injectable reconnect policies.

## 1. Summary

Add `packages/api-client` (`@atmos/api-client`) implementing a **WS session kernel** for main-app `/ws` only. Depend on `@atmos/api-types` for frames and `WsAction`. Apps inject platform adapters, **resolved URLs**, and reconnect policy. Do not move feature stores, Query, terminal PTY, or desktop IPC here.

**Hard dependency**: APP-048 Phase 1 (canonical frames + server-based `WsAction`).

## 2. Architecture

```text
┌─ apps/web binding ─────────────────────────────────────────┐
│ bootstrap · computer mode · buildWsUrl / relay URL         │
│ Zustand façade · Query scope isValid · visibility kick     │
└──────────────────────────┬─────────────────────────────────┘
┌─ apps/mobile binding ──────────────────────────────────────┐
│ RelayClient session.ws_url · RN WebSocket · UI state names │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
              @atmos/api-client/ws  (WsSession)
                           │
                           ▼
              @atmos/api-types/ws  (frames, WsAction)
                           │
                           ▼
                     apps/api /ws
```

## 3. Package layout

```text
packages/api-client/
  src/
    ws/
      session.ts
      reconnect.ts          # pure delay math + exhausted policy
      request.ts            # request + requestWhenReady + waitUntilConnected
      types.ts
      defaults.ts           # DEFAULT_WEB_*, DEFAULT_MOBILE_*
      index.ts
    platform/
      types.ts              # WebSocketLike, timers, logger
  AGENTS.md
```

### Exports

| Subpath | Role |
|---------|------|
| `@atmos/api-client/ws` | Public session API |
| `@atmos/api-client/platform` | Adapter types only |

### Dependencies

- **Required**: `@atmos/api-types`
- **Allowed**: pure `@atmos/shared` helpers (e.g. future shared redact) — prefer zero first
- **Forbidden**: react, react-native, zustand, next, `@workspace/ui`, app stores, Query client

## 4. Platform adapter

```ts
export type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason: string; wasClean: boolean }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
};

export type WsSessionPlatform = {
  createWebSocket(url: string): WebSocketLike;
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
  now?: () => number;
  log?: (level: "debug" | "warn" | "error", msg: string, meta?: Record<string, unknown>) => void;
};
```

- Kernel uses **only** `on*` handlers.
- Browser/RN differences: **app wrapper** adapts to `WebSocketLike` (including synthesizing `wasClean` if RN is unreliable—document fallback: intentional disconnect uses internal flag, not wasClean alone).
- `OPEN` readyState = `1` before send when state is connected.

## 5. Session API

```ts
type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "closed"
  | "error";

type ExhaustedBehavior =
  | { type: "stop" }
  | { type: "slow_retry"; delayMs: number };

type ReconnectPolicy = {
  enabled: boolean;
  initialDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  /** exponential: min(initial * 2^attempt, maxDelay) unless TECH documents otherwise */
  exhausted: ExhaustedBehavior;
  /** if false, clean close (wasClean) does not schedule reconnect */
  reconnectOnCleanClose: boolean;
};

type WsSessionOptions = {
  /** Resolved URL or factory re-evaluated each open attempt */
  url: string | (() => string);
  platform: WsSessionPlatform;
  reconnect?: Partial<ReconnectPolicy>;
  /** 0 / undefined = no per-request timeout (mobile historical) */
  requestTimeoutMs?: number;
  connectWaitMs?: number;
};

interface WsSession {
  readonly state: ConnectionState;
  connect(): Promise<void>;           // single-flight
  disconnect(): void;                 // intentional; no auto-reconnect
  waitUntilConnected(timeoutMs?: number): Promise<void>;
  request<T>(action: WsAction, data?: unknown, opts?: { timeoutMs?: number }): Promise<T>;
  requestWhenReady<T>(opts: {
    action: WsAction;
    data?: unknown;
    timeoutMs?: number;
    waitMs?: number;
    isValid: () => boolean;           // e.g. computer scope equality
  }): Promise<T>;
  onState(cb: (s: ConnectionState) => void): () => void;
  onNotification(event: string, cb: (data: unknown) => void): () => void;
  onMessage(cb: (msg: unknown) => void): () => void; // raw envelopes for mobile
}
```

### 5.1 Non-negotiable semantics

| Rule | Behavior |
|------|----------|
| Single-flight connect | Concurrent `connect()` shares one Promise |
| `request` if not connected | **Reject** immediately — **no queue** |
| Wait for connect | `waitUntilConnected` / `requestWhenReady` only |
| Pending timeout | Default from options; mobile default may be `0` (none) |
| Socket close | Reject all pending; clear map |
| `disconnect()` | `shouldReconnect=false`, clear timers, close socket, reject pending |
| Reconnect schedule | Only if policy enabled and internal shouldReconnect |
| URL factory | Invoked at start of each `openSocket` attempt |
| Auth | Never set WS headers; URL already contains credentials if any |
| Logging | Redact `token=` (and similar) in any logged URL |

### 5.2 `requestWhenReady` (M8)

Semantic port of web `wsRequestForComputerScope`:

1. If `!isValid()` → reject (scope changed).
2. If not connected → `waitUntilConnected(waitMs ?? connectWaitMs)`.
3. If `!isValid()` again → reject.
4. `request(...)`.

Web:

```ts
// apps/web — APP-035 fields stay app-owned
export type ComputerQueryScope = { … }; // existing query-scope.ts
requestWhenReady({
  isValid: () => scopesEqual(getComputerQueryScope(), expected),
  action, data, timeoutMs,
});
```

Package does **not** import connection stores. Mobile may ignore `requestWhenReady` until multi-computer epochs exist.

### 5.3 State vocabulary

Canonical kernel states as above. Bindings map:

| Kernel | Web store (today) | Mobile (today) |
|--------|-------------------|----------------|
| connected | connected | open |
| connecting | connecting | connecting |
| reconnecting | reconnecting | reconnecting |
| disconnected / closed / error | map explicitly in façade | map explicitly |

Document mapping in web/mobile façade once to avoid Query `enabled` regressions.

## 6. Reconnect policy matrix (M13)

### 6.1 Current product behavior (source of defaults)

| Field | Web today | Mobile today |
|-------|-----------|--------------|
| initialDelayMs | 1000 | 500 |
| maxDelayMs | 30000 | 5000 |
| maxAttempts | 10 | 5 |
| delay curve | `min(1000 * 2^attempt, 30000)` | similar mobile caps |
| exhausted | reset attempts; retry every **60000** ms forever | **stop** → closed |
| reconnect on unclean close | yes (`!wasClean`) | yes if shouldReconnect |
| reconnect on clean close | no | treat carefully via disconnect flag |
| requestTimeoutMs | 30000 | none |
| connectWaitMs | 15000; **30000** desktop runtime | n/a (provider auto-connect) |

### 6.2 Exported defaults

```ts
// conceptual
export const DEFAULT_WEB_RECONNECT: ReconnectPolicy = {
  enabled: true,
  initialDelayMs: 1000,
  maxDelayMs: 30_000,
  maxAttempts: 10,
  exhausted: { type: "slow_retry", delayMs: 60_000 },
  reconnectOnCleanClose: false,
};

export const DEFAULT_MOBILE_RECONNECT: ReconnectPolicy = {
  enabled: true,
  initialDelayMs: 500,
  maxDelayMs: 5_000,
  maxAttempts: 5,
  exhausted: { type: "stop" },
  reconnectOnCleanClose: false, // intentional disconnect uses disconnect()
};

export const DEFAULT_WEB_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_WEB_CONNECT_WAIT_MS = 15_000;
export const DEFAULT_DESKTOP_CONNECT_WAIT_MS = 30_000;
```

Changing algorithm (e.g. jitter) = one code path. Changing web vs mobile product recovery = edit named defaults apps already import.

### 6.3 Provider kicks (web)

`WebSocketProvider` may call `session.connect()` on `visibilitychange` / `online` when state is terminal disconnected—**must not** start a second independent backoff timer. Only kernel schedules delayed reconnects.

## 7. URL & auth (M11)

### v1 rules

1. **App resolves URL** before/at each connect:
   - Web: hydrate settings → computer mode → `relayWebSocketUrl` or `await buildWsUrl("/ws", { client_type })` (async bootstrap stays in binding).
   - Mobile: `session.ws_url` from Relay client session (token already embedded).
2. Binding may call `connect()` only after async URL ready, passing `url: () => latestResolvedUrl` or recreate session when session URL changes.
3. **Do not** recommend `buildWsUrlSync` as the primary web path for production connect.
4. Kernel: `createWebSocket(url)` only.
5. Token rotation / computer switch: app updates URL factory or rebuilds session; kernel does not store secrets.

### N1 later

`ConnectionTarget` resolution may move into package; still outputs a string URL for the kernel.

## 8. Message handling

1. Parse JSON; on failure log + skip (parity: prefer not to throw through onmessage).
2. `response` / `error` → match `request_id`, clear timeout, resolve/reject (error formatting: prefer `[code] message` when code present).
3. `notification` → fan-out by `event` string + optional raw `onMessage`.
4. Never handle terminal PTY protocol here.

Request id: generate UUID (or compatible unique string); wire-compatible with server.

## 9. App bindings

### 9.1 Mobile (Phase 2 preferred operationally after Phase 1 union-complete)

- Façade keeps existing public methods used by tests where cheap.
- Map `open` ↔ `connected` for UI if needed.
- Wire `onMessage` for screens that parse envelopes.
- Inject `DEFAULT_MOBILE_RECONNECT` and no request timeout unless product changes.

### 9.2 Web (Phase 3)

**Stays in binding:**

- `ensureComputerClientSettingsHydrated` / `ensureLocalAppConnectionBootstrap`
- `syncActiveInstanceFromComputer`
- Relay vs local URL selection + `client_type`
- `syncClientSessionFromStore` on open
- Hosted `shouldConnect` gate
- Zustand API surface (`send`, `onEvent`, `connectionState`, …)
- Visibility/online connect kicks
- `ComputerQueryScope` + equality for `requestWhenReady`

**Moves to kernel:**

- Pending map, timeouts, reconnect timers, frame parse dispatch, single-flight connect once URL known

### 9.3 Desktop

- Same as web binding with `connectWaitMs: 30_000`.
- No Electron main work for this package.

## 10. Testing

| Area | Tests |
|------|-------|
| Backoff + exhausted stop/slow_retry | package unit (fake timers) |
| No queue / reject when reconnecting | package unit |
| Pending flush on close | package unit |
| Intentional disconnect no reconnect | package unit |
| Clean close no reconnect when policy false | package unit |
| requestWhenReady before/after wait | package unit |
| URL factory called each attempt | package unit |
| Token redaction in log spy | package unit |
| Single-flight connect | package unit |
| Mobile façade | port existing mobile-ws-client tests |
| Web | store-level tests for disconnect + single-flight; smoke path |

Port valuable cases from `apps/mobile/src/api/mobile-ws-client.test.ts` into the package.

## 11. Rollout

| PR | Content |
|----|---------|
| PR0 | Confirm APP-048 Phase 1 on main |
| PR1 | Package + full policy options + unit tests |
| PR2 | Mobile cutover |
| PR3 | Web cutover + requestWhenReady wiring for `ws/request.ts` |
| PR4 | N* |

## 12. Risks

| Risk | Mitigation |
|------|------------|
| Web bootstrap still large | Explicit split; ROI = pending+reconnect single-home |
| RN wasClean | Internal disconnect flag |
| Double reconnect | Kernel-only timers |
| Async URL | Binding prepares URL; factory re-eval |

## 13. Out of scope

- Effect-style domain atoms, DrainableWorker ports, terminal client (N2), relay HTTP client (N3), changing server auth scheme
