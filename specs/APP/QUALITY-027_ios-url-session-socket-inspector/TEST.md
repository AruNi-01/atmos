# TEST · QUALITY-027: iOS URLSession socket bypasses Expo network inspector

> Test Plan · how we verify the native Computer/terminal socket does not use `URLSessionConfiguration.default` and still keeps timeout / cookie / header parity. References TECH QUALITY-027.

## Test strategy

The failure is an iOS Debug URLSession handshake. This Linux environment has no Simulator, so executable proof is a Bun source assertion on the Swift module plus the existing JS wrapper tests. A Mac Debug client with the inspector on is the only live handshake check; record it as a gap rather than pushing screenshots or hostnames.

- Unit (Bun source): the Swift file must not pass `.default` into `URLSession(configuration:)`, must not copy `protocolClasses` from `.default`, and must not turn the inspector off.
- Unit (Bun JS): existing `UrlSessionWebSocket` wrapper tests stay green.
- Toolchain: `package.json` `lint` stays `oxlint --max-warnings=455`. oxlint/oxfmt on touched paths.
- Manual: Debug + inspector connecting to relay. Not run here. Do not add the `ios-parity` label to force that job.
- Exploratory agent-browser: omitted. Native iOS binary, not a web page.

## Coverage map

| Requirement                                                                | Scenario IDs |
| -------------------------------------------------------------------------- | ------------ |
| R1. Session is not `URLSessionConfiguration.default`                       | S1, S6       |
| R2. Use `ephemeral`, then strip inspector protocols; no `init()` fallback  | S2, S5       |
| R3. Timeout, cookie, and header settings copied from `.default`            | S3           |
| R3. `protocolClasses` is not copied from `.default`                        | S4           |
| R4. Inspector / `EX_DEV_CLIENT_NETWORK_INSPECTOR` is not turned off        | S7           |
| JS wrapper still connects after handlers are assigned                      | S8           |
| Lint cap unchanged; no `ios-parity` label / evidence / hostnames in the PR | S9           |
| Live Debug + inspector handshake                                           | S10 (manual) |

## Execution map

| Scenario | Level     | Expected tool | Target command / method                                       | Fixture / data     | Signals                                                                                          | Status  |
| -------- | --------- | ------------- | ------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ | ------- |
| S1       | Unit      | `bun test`    | `apps/mobile/src/api/atmos-url-session-socket-config.test.ts` | Swift source       | no `URLSession(configuration: .default`                                                          | pass    |
| S2       | Unit      | `bun test`    | same                                                          | Swift source       | `configuration()` is ephemeral + apply + strip; no `URLSessionConfiguration()`                   | pass    |
| S3       | Unit      | `bun test`    | same                                                          | Swift source       | copies `timeoutIntervalForRequest`, `httpCookieStorage`, `httpAdditionalHeaders` from `.default` | pass    |
| S4       | Unit      | `bun test`    | same                                                          | Swift source       | does not assign `protocolClasses` from `.default`                                                | pass    |
| S5       | Review    | File read     | `AtmosRelayWebSocketSession.configuration()`                  | Swift source       | no `containsExpoNetworkInspectorProtocol`; no `URLSessionConfiguration()`                        | pass    |
| S6       | Unit      | `bun test`    | same                                                          | Swift source       | comment names inspector, 101, and `-1005`                                                        | pass    |
| S7       | Unit      | `bun test`    | same + `app.config.js` / env files if touched                 | repo source        | no new `EX_DEV_CLIENT_NETWORK_INSPECTOR=false`                                                   | pass    |
| S8       | Unit      | `bun test`    | `apps/mobile/src/api/url-session-websocket.test.ts`           | Fake native socket | existing connect / close / ping tests pass                                                       | pass    |
| S9       | Toolchain | shell         | read `package.json` `lint`; oxlint/oxfmt on touched paths     | repo root          | `--max-warnings=455`; no `ios-parity` label change                                               | pass    |
| S10      | Manual    | Simulator     | Debug client, inspector on, connect Computer/terminal WS      | Mac + relay        | open event; not `-1005`. **not run** on Linux                                                    | not_run |

## Scenarios

### S1 — Connect does not pass `.default` into `URLSession`

- **Level**: Unit
- **Given**: `AtmosUrlSessionSocketModule.swift`.
- **When**: the Bun test reads the file.
- **Then**: there is no `URLSession(configuration: .default` (optional whitespace allowed). Mentions of `.default` in comments or as a _source_ of timeout/cookie/header copies are allowed.
- **Signals**: regex assertion.

### S2 — Ephemeral is the only factory

- **Level**: Unit / review
- **Given**: the same Swift file.
- **When**: `configuration()` is read.
- **Then**: it takes `URLSessionConfiguration.ephemeral`, calls `applySharedDefaultTransportSettings`, then `stripExpoNetworkInspectorProtocols`, and returns. There is no `URLSessionConfiguration()` branch.
- **Signals**: those three calls in order; no `let clean = URLSessionConfiguration()`.

### S3 — Timeout, cookie, and headers stay aligned with `.default`

- **Level**: Unit
- **Given**: the configuration helper.
- **When**: the test inspects copied properties.
- **Then**: the helper assigns `timeoutIntervalForRequest`, `timeoutIntervalForResource`, `httpCookieStorage`, and `httpAdditionalHeaders` from `URLSessionConfiguration.default` (or an equivalent `shared` binding of that object). `httpCookieAcceptPolicy` / `httpShouldSetCookies` / `waitsForConnectivity` are copied or documented as matching.
- **Signals**: those identifiers in the Swift helper.

### S4 — Inspector protocol list is not inherited

- **Level**: Unit
- **Given**: the configuration helper.
- **When**: the test looks for `protocolClasses` assignment from `.default`.
- **Then**: the helper does not set `protocolClasses` from the `.default` configuration. It may strip named Expo inspector classes after starting from `ephemeral`.
- **Signals**: no `protocolClasses =` from the default object.

### S5 — No getter-free `init()` fallback

- **Level**: Review
- **Given**: the configuration helper after the inspector-protocol strip.
- **When**: the source is read for a remaining-inspector check or `URLSessionConfiguration()`.
- **Then**: `containsExpoNetworkInspectorProtocol` is absent. After the filter that check would always be false, and `URLSessionConfiguration()` / `init()` is not used (deprecated since iOS 13). Strip of named Expo inspector classes is the only interceptor defense.
- **Signals**: `configuration()` body is the three steps in TECH; no `URLSessionConfiguration()` call.

### S6 — Comment explains why `.default` is unsafe

- **Level**: Unit
- **Given**: the Swift module.
- **When**: the test reads comments on the helper.
- **Then**: the comment names `EX_DEV_CLIENT_NETWORK_INSPECTOR` (or expo-dev-launcher / `ExpoRequestInterceptorProtocol`), 101 Switching Protocols, and `NSURLErrorDomain` / `-1005`.
- **Signals**: those strings in the file.

### S7 — Inspector stays on

- **Level**: Unit
- **Given**: this change set.
- **When**: the test / review scans env and config.
- **Then**: nothing sets `EX_DEV_CLIENT_NETWORK_INSPECTOR` to false, and `expo-dev-launcher` is not removed from the Debug client config.
- **Signals**: no such assignment in the diff; `app.config.js` still lists `expo-dev-launcher` for Debug.

### S8 — JS wrapper regression

- **Level**: Unit
- **Given**: `url-session-websocket.test.ts`.
- **When**: `bun test` runs that file.
- **Then**: connect-after-handlers, close-before-connect, error/close forwarding, send-before-open, and ping/pong still pass.
- **Signals**: bun exit 0.

### S9 — Toolchain rails

- **Level**: Toolchain
- **Given**: root `package.json` `lint` script.
- **When**: the script is read; oxlint/oxfmt run on touched paths.
- **Then**: the script is still `oxlint --max-warnings=455`. This PR does not add the `ios-parity` label, evidence files, screenshots, or a `host` field.
- **Signals**: script text; empty diff on the parity workflow labels; no binary/screenshot additions.

### S10 — Live Debug client with inspector

- **Level**: Manual
- **Given**: an iOS Simulator or device Debug build with the network inspector on, signed in, one online Computer.
- **When**: the app opens the main `/ws` (and a terminal WS if one is started).
- **Then**: the native socket reaches `open` and does not fail with `NSURLErrorDomain -1005`. Release remains green.
- **Signals**: in-app connected state. Do not commit logs, screenshots, or hostnames.
- **Gap**: not run in this Linux agent.

## Performance & load budgets

Unchanged. Handshake still uses one URLSession WebSocket per Computer/terminal connection.

## Regression checklist

- [x] `AtmosUrlSessionSocket` does not call `URLSession(configuration: .default`.
- [x] QUALITY-012 ping, 16 MiB cap, and close-code deferral are still in the same file.
- [x] Debug REST `fetch` can still use `.default` (inspector remains for HTTP).
- [x] `package.json` lint cap stays 455.
- [x] No `ios-parity` label, evidence push, or hostname in the change.

## Exploratory agent-browser checks

Omitted. Native iOS module; no web route.

## Acceptance criteria

- [x] S1–S8 pass at the declared Bun/source level.
- [x] S9: lint script is still `--max-warnings=455`.
- [x] S10 is either run on a Mac or recorded `not_run` with the Simulator reason.
- [x] Inspector is not disabled as a workaround.
- [x] Coverage Status lists the exact commands after implementation.

## Manual verification steps

1. On a Mac: Debug `just mobile-ios` (or device Debug), inspector left on.
2. Sign in and connect to an online Computer.
3. Confirm the workspace list / chat socket is `open`, not a repeating `-1005` error.
4. Optional: open a terminal WS and confirm the same.

Do not attach screenshots or evidence to the PR.

## Non-coverage

- Android RN WebSocket.
- Metro inspector UI showing Computer/terminal frames (those sockets intentionally skip the interceptor).
- Live handshake in CI (parity is Release and excludes the dev client).

## Coverage Status

2026-10-22 follow-up (drop `URLSessionConfiguration()` fallback):

- S1, S4, S7 — pass. `cd apps/mobile && bun test src/api/atmos-url-session-socket-config.test.ts` (3 tests: no `.default` session, no `protocolClasses` copy from `.default`, inspector stays on). Combined with S8: 8 pass, 0 fail.
- S2, S5 — pass by reading `AtmosRelayWebSocketSession.configuration()`: ephemeral → apply shared timeout/cookie/header settings → strip inspector protocols → return. No `containsExpoNetworkInspectorProtocol`, no `URLSessionConfiguration()`.
- S8 — pass. `cd apps/mobile && bun test src/api/url-session-websocket.test.ts` (5 tests).
- S9 — pass. `bunx oxlint --max-warnings=455` on the two socket test files (exit 0) and repo-wide `bunx oxlint --max-warnings=455` (exit 0). Cap not raised. No `ios-parity` label, screenshots, evidence, or hostname.
- S10 — not_run. No iOS Simulator in this environment.

Commands:

```bash
cd apps/mobile && bun test src/api/atmos-url-session-socket-config.test.ts src/api/url-session-websocket.test.ts
bunx oxlint --max-warnings=455 apps/mobile/src/api/atmos-url-session-socket-config.test.ts apps/mobile/src/api/url-session-websocket.test.ts
```
