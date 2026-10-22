# TECH · QUALITY-027: iOS URLSession socket bypasses Expo network inspector

> Technical Design · HOW. Debug iOS `expo-dev-client` with `EX_DEV_CLIENT_NETWORK_INSPECTOR=true` cannot complete the Computer/terminal WebSocket handshake to relay. Not a product feature. No BRAINSTORM or PRD (quality spec).

## Scope summary

Keep `AtmosUrlSessionSocket` on URLSession (Happy Eyeballs, QUALITY-012 ping) but stop creating that session from `URLSessionConfiguration.default`. Debug `expo-dev-launcher` swizzles that getter and the interceptor swallows HTTP 101. Release is already fine.

Addresses:

- **R1.** The socket session is not built from `URLSessionConfiguration.default`.
- **R2.** Prefer `URLSessionConfiguration.ephemeral`. If that factory is also intercepted, allocate a configuration that did not go through those class getters and strip Expo inspector `URLProtocol` classes.
- **R3.** Timeout, cookie, and header settings stay aligned with the previous `.default` session.
- **R4.** Do not disable the inspector, do not change `EX_DEV_CLIENT_NETWORK_INSPECTOR`, and do not switch the transport off URLSession.

Out of scope:

- Android (this Expo module is Apple-only).
- Release / parity preview (no interceptor; `expo-dev-client` is excluded from parity).
- QUALITY-012 lifecycle (timeout, heartbeat, pause, `relay_ctrl`).
- Raising `oxlint --max-warnings` above 455.
- Adding the `ios-parity` label, committing screenshots, evidence files, or hostnames.
- Patching `expo-dev-launcher` / `ExpoRequestInterceptorProtocol`.

Id selection: `origin/main` has QUALITY-001…024. Open PRs already hold QUALITY-025 (#350, #353, #354) and QUALITY-026 (#351, #352). QUALITY-027 is the next free id.

## Quality target

| Surface                                       | Before                                          | After                                                                                 |
| --------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| Debug + inspector, Computer/terminal WS       | `NSURLErrorDomain -1005` after 101 is swallowed | Handshake completes; socket opens                                                     |
| `URLSession` configuration factory            | `.default`                                      | `.ephemeral`, then a getter-free config if inspector protocols are still present      |
| Timeout / cookie / extra headers              | Implicit `.default` values                      | Copied from `.default` onto the unintercepted config; `protocolClasses` is not copied |
| Inspector / `EX_DEV_CLIENT_NETWORK_INSPECTOR` | Left on; the bug is that it breaks WS           | Left on. The fix is the session config, not turning the inspector off                 |
| Release                                       | Already works                                   | Unchanged                                                                             |

## Verified root cause

`AtmosUrlSessionSocket.connect` currently does:

```swift
let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
let task = session.webSocketTask(with: url)
```

When `DEBUG && EX_DEV_CLIENT_NETWORK_INSPECTOR`, `expo-dev-launcher` (`DevLauncherNetworkInterceptor.swift`) swizzles the `URLSessionConfiguration.default` getter and prepends `ExpoRequestInterceptorProtocol` (`@objc(EXRequestInterceptorProtocol)` in ExpoModulesCore).

That protocol:

1. `canInit` is true for `http` / `https`. URLSession's WebSocket handshake is an HTTP Upgrade on those schemes (`ws`/`wss` become `http`/`https` for the request).
2. Replays the request as a `URLSessionDataTask` on another session, not as a `URLSessionWebSocketTask`.
3. Treats the response as ordinary HTTP. **101 Switching Protocols** is not delivered as a WebSocket upgrade to the original task.
4. The `URLSessionWebSocketTask` then fails with `NSURLErrorDomain -1005` (network connection lost).

The interceptor is compiled out of Release, so TestFlight / parity Release builds never hit this path.

`URLSessionConfiguration.ephemeral` is **not** swizzled today (only the `default` getter is). A future inspector that also replaces `ephemeral` must not bring the bug back.

## Decision

Stay on URLSession. Change only the configuration object.

Rejected:

| Option                                                        | Why not                                                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Set `EX_DEV_CLIENT_NETWORK_INSPECTOR=false` / drop the plugin | Hides the inspector. The task forbids this workaround.                                               |
| Go back to RN `WebSocket` / SocketRocket on Debug             | Loses Happy Eyeballs; QUALITY-012 ping stays on this native module.                                  |
| Filter `protocolClasses` on `.default` and keep that factory  | Still depends on the swizzled getter returning a usable object. Prefer a factory Expo does not hook. |
| Patch Expo in `node_modules` / a config plugin                | Upstream churn; Debug REST inspection would still want the interceptor for `fetch`.                  |

## Architecture

```text
preferredComputerWebSocket (JS)
        │
        ▼
AtmosUrlSessionSocket.connect
        │
        ▼
AtmosRelayWebSocketSession.configuration()
  1. URLSessionConfiguration.ephemeral
  2. copy timeout / cookie / headers from .default
     (do not copy protocolClasses)
  3. strip Expo inspector URLProtocol classes
  4. if they remain: URLSessionConfiguration()  // not the swizzled getters
     copy the same settings; strip again;
     if they remain: protocolClasses = []
        │
        ▼
URLSession(configuration:delegate:delegateQueue:)
  webSocketTask(with:)
        │
        ▼
relay WSS (101 upgrade is not intercepted)
```

No new crate, WS action, REST route, or JS transport API.

## Module design

### `apps/mobile/modules/atmos-url-session-socket/ios/AtmosUrlSessionSocketModule.swift`

Add a file-local helper (name may be an enum with static methods) used only by `connect`:

```swift
URLSession(configuration: AtmosRelayWebSocketSession.configuration(), ...)
```

`AtmosRelayWebSocketSession.configuration()`:

1. Start from `URLSessionConfiguration.ephemeral`.
2. Copy these properties from `URLSessionConfiguration.default` so the handshake matches the previous session:
   - `timeoutIntervalForRequest`
   - `timeoutIntervalForResource`
   - `waitsForConnectivity`
   - `httpCookieAcceptPolicy`
   - `httpShouldSetCookies`
   - `httpCookieStorage` (shared jar, not ephemeral's private store)
   - `httpAdditionalHeaders`
3. Do **not** copy `protocolClasses`, `urlCache`, or any Expo type. Cache is unused for this upgrade.
4. Drop protocol classes whose ObjC/Swift name is `EXRequestInterceptorProtocol`, `ExpoRequestInterceptorProtocol`, or a module-qualified suffix of either.
5. If an inspector class is still present, allocate `URLSessionConfiguration()` (NSObject `init`, not the class getters Expo swizzles), repeat steps 2–4, and if needed set `protocolClasses = []` so only system URL loading protocols remain.

Comment in code, not only in this spec: **why `.default` is unsafe** (inspector, 101, `-1005`, Release unaffected).

Existing QUALITY-012 behavior is unchanged: 16 MiB cap, `sendPing`, defer `closeCode == 0`, invalidate the session on finish.

### JS wrapper

`apps/mobile/src/api/url-session-websocket.ts` stays as-is. Tests may read the Swift source.

### Agent rail

One NEVER bullet in `apps/mobile/AGENTS.md`: do not open this socket with `URLSessionConfiguration.default`. Point at this spec.

## Transport settings copied from `.default`

The current `connect` path sets no custom timeouts, cookies, or headers on the session. Auth is the `client_token` (or equivalent) query on the `wss` URL, not a session `Authorization` header. Copying the listed `.default` properties keeps any process-wide cookie jar, extra headers, and timeouts that REST already uses.

| Property                     | `.default` (current)    | New config                                           |
| ---------------------------- | ----------------------- | ---------------------------------------------------- |
| `timeoutIntervalForRequest`  | system default (60s)    | copied from `.default`                               |
| `timeoutIntervalForResource` | system default (7 days) | copied from `.default`                               |
| `waitsForConnectivity`       | `false`                 | copied from `.default`                               |
| cookies                      | shared storage          | same shared storage, not ephemeral's private jar     |
| `httpAdditionalHeaders`      | usually `nil`           | copied from `.default`                               |
| `protocolClasses`            | swizzled in Debug       | ephemeral / stripped / empty — never the interceptor |

## Rollout plan

1. Land this TECH + TEST (this directory) and the README inventory row.
2. Change the Swift session factory; add a Bun source assertion that `URLSession(configuration: .default` is gone.
3. Targeted `bun test` on the socket tests; oxlint/oxfmt on touched paths; `package.json` lint script stays `--max-warnings=455`.
4. Manual Debug + inspector relay connect is recorded as a gap on Linux (no Simulator here).

## Risks & tradeoffs

- **Risk:** A future Expo build swizzles `ephemeral` the same way as `default`. The strip + `URLSessionConfiguration()` fallback is the mitigation. If `init` ever called the swizzled getter internally, `protocolClasses = []` still removes extra protocols.
- **Risk:** Copying `httpCookieStorage` from `.default` still reads the swizzled getter. That only copies scalar/storage properties; it must not assign `protocolClasses`.
- **Tradeoff:** Debug REST `fetch` keeps using `.default` and stays visible in the inspector. Only Computer/terminal WebSockets skip it. Inspecting those sockets in Metro is out of scope.
- **If this breaks in production:** Release never used the interceptor. Reverting the Swift helper restores `.default` (and the Debug bug).
- **Rollback path:** revert the module file. No migration, flag, or native rebuild contract beyond the usual Debug client rebuild.

## Dependencies & compatibility

- Builds on QUALITY-012 (same native socket). Does not change its lifecycle contract.
- Minimum: existing Expo SDK 56 Debug client. No SDK bump.
- External: `expo-dev-launcher` interceptor behavior as of the SDK 56 sources (`DevLauncherNetworkInterceptor.swift`).

## Open questions

None. Inspector-on Debug vs Release is already decided; the remaining proof is a Simulator handshake, which this Linux environment cannot run.
