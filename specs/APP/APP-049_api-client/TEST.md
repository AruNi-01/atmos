# TEST · APP-049: API Client

> Verification for shared WS session kernel and web/mobile cutover.

## Test strategy

| Level | Why |
|-------|-----|
| Package unit | Policy matrix, no-queue, scope guard, redaction, single-flight |
| App unit | Mobile façade; web store tests added in PR3 |
| Typecheck | api-types + api-client + apps |
| Manual / smoke | Local + optional relay |
| Joint cutover | Types import + one real request path |

## Coverage map

| PRD | Scenarios |
|-----|-----------|
| M1, M10 | T-DEP-01 |
| M2, M4, M12 | T-SES-01..04, T-REQ-01..03 |
| M3, M13 | T-RCN-01..04 |
| M5 | T-TYPE-01 |
| M6, M14 | T-WEB-01..03 |
| M7 | T-MOB-01..02 |
| M8 | T-SCOPE-01..02 |
| M9 | T-EVT-01, T-MSG-01 |
| M11 | T-URL-01, T-AUTH-01 |

## Execution map

| ID | Level | Focus | Status |
|----|-------|-------|--------|
| T-DEP-01 | static | no react/rn/zustand in package.json | pending |
| T-SES-01 | unit | connect → connected | pending |
| T-SES-02 | unit | request/response by request_id | pending |
| T-SES-03 | unit | error frame rejects | pending |
| T-SES-04 | unit | single-flight connect | pending |
| T-REQ-01 | unit | request when not connected rejects (no send) | pending |
| T-REQ-02 | unit | request timeout | pending |
| T-REQ-03 | unit | close flushes pending | pending |
| T-RCN-01 | unit | backoff delays | pending |
| T-RCN-02 | unit | exhausted stop | pending |
| T-RCN-03 | unit | exhausted slow_retry 60s | pending |
| T-RCN-04 | unit | disconnect / clean close no reconnect | pending |
| T-SCOPE-01 | unit | isValid false before wait | pending |
| T-SCOPE-02 | unit | isValid false after wait before send | pending |
| T-EVT-01 | unit | notification fan-out | pending |
| T-MSG-01 | unit | onMessage raw | pending |
| T-URL-01 | unit | url factory each attempt | pending |
| T-AUTH-01 | unit | log redacts token=; no Authorization API | pending |
| T-TYPE-01 | typecheck | WsAction from api-types | pending |
| T-MOB-01 | app | mobile tests green | pending |
| T-MOB-02 | app | raw message consumers still work | pending |
| T-WEB-01 | app/manual | connect + one request | pending |
| T-WEB-02 | app unit | store single-flight + intentional disconnect | pending |
| T-WEB-03 | app | provider does not double-schedule timers | pending |
| T-JOINT-01 | integration | api-types + kernel + mobile/web smoke | pending |

## Scenarios (selected detail)

### T-REQ-01 — No queue

- **Given** session reconnecting or disconnected
- **When** `request` is called
- **Then** promise rejects and mock `send` call count is 0

### T-RCN-03 — Web exhausted behavior

- **Given** `DEFAULT_WEB_RECONNECT`
- **When** max attempts exhausted
- **Then** next schedule uses ~60000ms slow retry (fake timers), not permanent silent death

### T-RCN-02 — Mobile exhausted behavior

- **Given** `DEFAULT_MOBILE_RECONNECT`
- **When** max attempts exhausted
- **Then** no further reconnect timers; state terminal closed/disconnected per mapping

### T-SCOPE-02 — After wait invalidation

- **Given** `isValid` true then false after `waitUntilConnected` resolves
- **When** `requestWhenReady` runs
- **Then** rejects without send

### T-AUTH-01 — No header auth path

- **Given** package public API
- **When** inspected / exercised
- **Then** no API to set WS Authorization headers; logged URLs redact tokens

### T-JOINT-01 — Cutover smoke

- **Given** 048 + 049 cutover on a branch
- **When** package tests + mobile suite + web one `fs_get_home_dir` or bootstrap request
- **Then** all green
- **Owner**: this TEST (049), not 048 alone

## Regression checklist

- [ ] Package tests green including both exhausted policies
- [ ] Mobile WS tests green
- [ ] Web typecheck; connect smoke
- [ ] Desktop wait path still 30s when desktop runtime
- [ ] Relay path: app still supplies tokenized URL; kernel unchanged
- [ ] APP-035 scope callers still use double-check semantics
- [ ] No second reconnect loop in provider

## Acceptance criteria

1. Web and mobile main-app WS use `@atmos/api-client` for pending + reconnect.
2. URL/auth/bootstrap remain app-owned; documented and tested (no header auth in kernel).
3. Behavioral matrix implemented as options with exported defaults.
4. `request` never queues; `requestWhenReady` covers web scope case.
5. APP-048 Phase 1 dependency satisfied.
6. Framework-free core package.

## Manual steps

1. Local API + web: load workbench, one WS action.
2. Mobile simulator: connect computer, list/bootstrap path.
3. Toggle offline/online if feasible; observe single reconnect chain.
4. Switch computer on web if multi-computer fixture exists; confirm scope errors not silent cross-write.

## Non-coverage

- Relay Worker correctness (APP-016 server-side)
- Terminal PTY client (N2)
- Query cache correctness (APP-035)
- Desktop Electron IPC
- All 225 action behaviors

## Coverage Status

_Not run — pre-implementation._
