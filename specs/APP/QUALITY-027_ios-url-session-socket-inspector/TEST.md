# TEST · QUALITY-027: iOS URLSession socket bypasses Expo network inspector

> Test Plan · how we verify the native Computer/terminal socket does not use `URLSessionConfiguration.default` and still keeps timeout / cookie / header parity. References TECH QUALITY-027.

## Test strategy

The failure is an iOS Debug URLSession handshake. This Linux environment has no Simulator, so executable proof is a Bun source assertion on the Swift module plus the existing JS wrapper tests. A Mac Debug client with the inspector on is the only live handshake check; record it as a gap rather than pushing screenshots or hostnames.

- Unit (Bun source): the Swift file must not pass `.default` into `URLSession(configuration:)`, must start from `ephemeral`, must copy timeout/cookie/header fields, must not copy `protocolClasses` from `.default`, and must keep a getter-free fallback.
- Unit (Bun JS): existing `UrlSessionWebSocket` wrapper tests stay green.
- Toolchain: `package.json` `lint` stays `oxlint --max-warnings=455`. oxlint/oxfmt on touched paths.
- Manual: Debug + inspector connecting to relay. Not run here. Do not add the `ios-parity` label to force that job.
- Exploratory agent-browser: omitted. Native iOS binary, not a web page.

## Coverage map

| Requirement                                                                | Scenario IDs |
| -------------------------------------------------------------------------- | ------------ |
| R1. Session is not `URLSessionConfiguration.default`                       | S1, S6       |
| R2. Prefer `ephemeral`; fallback if inspector protocols remain             | S2, S5       |
| R3. Timeout, cookie, and header settings copied from `.default`            | S3           |
| R3. `protocolClasses` is not copied from `.default`                        | S4           |
| R4. Inspector / `EX_DEV_CLIENT_NETWORK_INSPECTOR` is not turned off        | S7           |
| JS wrapper still connects after handlers are assigned                      | S8           |
| Lint cap unchanged; no `ios-parity` label / evidence / hostnames in the PR | S9           |
| Live Debug + inspector handshake                                           | S10 (manual) |

## Execution map

| Scenario | Level     | Expected tool | Target command / method                                                      | Fixture / data     | Signals                                                                                          | Status  |
| -------- | --------- | ------------- | ---------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ | ------- |
| S1       | Unit      | `bun test`    | `apps/mobile/src/api/url-session-websocket.test.ts` or colocated module test | Swift source       | no `URLSession(configuration: .default`                                                          | planned |
| S2       | Unit      | `bun test`    | same                                                                         | Swift source       | `URLSessionConfiguration.ephemeral` is the first factory                                         | planned |
| S3       | Unit      | `bun test`    | same                                                                         | Swift source       | copies `timeoutIntervalForRequest`, `httpCookieStorage`, `httpAdditionalHeaders` from `.default` | planned |
| S4       | Unit      | `bun test`    | same                                                                         | Swift source       | does not assign `protocolClasses` from `.default`                                                | planned |
| S5       | Unit      | `bun test`    | same                                                                         | Swift source       | `URLSessionConfiguration()` fallback and inspector protocol strip / empty `protocolClasses`      | planned |
| S6       | Unit      | `bun test`    | same                                                                         | Swift source       | comment names inspector, 101, and `-1005`                                                        | planned |
| S7       | Unit      | `bun test`    | same + `app.config.js` / env files if touched                                | repo source        | no new `EX_DEV_CLIENT_NETWORK_INSPECTOR=false`                                                   | planned |
| S8       | Unit      | `bun test`    | `apps/mobile/src/api/url-session-websocket.test.ts`                          | Fake native socket | existing connect / close / ping tests pass                                                       | planned |
| S9       | Toolchain | shell         | read `package.json` `lint`; oxlint/oxfmt on touched paths                    | repo root          | `--max-warnings=455`; no `ios-parity` label change                                               | planned |
| S10      | Manual    | Simulator     | Debug client, inspector on, connect Computer/terminal WS                     | Mac + relay        | open event; not `-1005`. **not run** on Linux                                                    | planned |

## Scenarios

### S1 — Connect does not pass `.default` into `URLSession`

- **Level**: Unit
- **Given**: `AtmosUrlSessionSocketModule.swift`.
- **When**: the Bun test reads the file.
- **Then**: there is no `URLSession(configuration: .default` (optional whitespace allowed). Mentions of `.default` in comments or as a _source_ of timeout/cookie/header copies are allowed.
- **Signals**: regex assertion.

### S2 — Ephemeral is the preferred factory

- **Level**: Unit
- **Given**: the same Swift file.
- **When**: the test inspects the configuration helper.
- **Then**: `URLSessionConfiguration.ephemeral` appears before any `URLSessionConfiguration()` fallback.
- **Signals**: source contains `URLSessionConfiguration.ephemeral`.

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
- **Then**: the helper does not set `protocolClasses` from the `.default` configuration. It may strip named Expo inspector classes or set `protocolClasses = []` on the fallback.
- **Signals**: no `protocolClasses =` from the default object.

### S5 — Fallback if ephemeral is intercepted

- **Level**: Unit
- **Given**: the configuration helper.
- **When**: inspector protocol classes are still present after the ephemeral path.
- **Then**: the source allocates `URLSessionConfiguration()`, strips Expo inspector protocol names, and can set `protocolClasses = []`.
- **Signals**: those tokens in the Swift file.

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

- [ ] `AtmosUrlSessionSocket` does not call `URLSession(configuration: .default`.
- [ ] QUALITY-012 ping, 16 MiB cap, and close-code deferral are still in the same file.
- [ ] Debug REST `fetch` can still use `.default` (inspector remains for HTTP).
- [ ] `package.json` lint cap stays 455.
- [ ] No `ios-parity` label, evidence push, or hostname in the change.

## Exploratory agent-browser checks

Omitted. Native iOS module; no web route.

## Acceptance criteria

- [ ] S1–S8 pass at the declared Bun/source level.
- [ ] S9: lint script is still `--max-warnings=455`.
- [ ] S10 is either run on a Mac or recorded `not_run` with the Simulator reason.
- [ ] Inspector is not disabled as a workaround.
- [ ] Coverage Status lists the exact commands after implementation.

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

> Filled after implementation by `atmos-specs-test-run`. Include exact automated tests, commands, and remaining gaps.
