# TEST · APP-076: Shared session Runtime

> Test Plan · verify one session Runtime, shared ensure, Desktop quit does not kill Runtime, CLI-only lazy ensure, Desktop Use via Server. References PRD APP-076 and TECH APP-076.

## Test strategy

Deterministic unit tests on shipped supervisor classify/ownership functions and Desktop/CLI wrappers. No Electron launch required for M1–M5. Cheap `cargo test` / `bun test` on touched crates. Optional `atmos runtime status` when the binary can be built.

- Unit: `classify_ensure`, `desktop_quit_should_stop_runtime`, HTML probe, CLI lazy-ensure predicate.
- Bun: Desktop quit no-op, ownership helper, Desktop Use client prefers Runtime URL.
- CLI/API: desktop-use HTTP handlers + lazy-ensure retry shape.
- E2E / agent-browser: none in this slice (no new UI chrome).
- Manual: concurrent Desktop + CLI on a real machine (listed).

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 reuse healthy UI Runtime | S1, S2 |
| M2 Desktop quit does not kill | S3, S4 |
| M3 CLI-only lazy ensure | S5, S6 |
| M4 CLI is not the backend | S7 |
| M5 Desktop Use via Runtime | S8, S9 |
| M6 explicit stop | S10 |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Rust unit | `cargo test` | `cargo test -p runtime-manager --features supervisor classify_ensure` | booleans | Reuse when running+healthy+ui | covered |
| S2 | Rust unit | `cargo test` | `looks_like_atmos_ui_html` | HTML vs 404 text | product HTML true; "Not Found" false | covered |
| S3 | Rust unit | `cargo test` | `desktop_quit_should_stop_runtime` | none | returns false | covered |
| S4 | Bun | `bun test` | `apps/desktop-electron/src/runtime/ensure.test.ts` | shipped `stopOwnedAtmosServer` | `stopped: false`, `shared_runtime` | covered |
| S5 | Rust unit | `cargo test` | `cli_should_lazy_ensure` | flags | true when needs_server && !no_ensure | covered |
| S6 | Rust unit | `cargo test` | `cli_should_lazy_ensure` | `--no-ensure` | false | covered |
| S7 | Rust unit | `cargo test` | `cli_is_not_long_running_backend` comment via `desktop_quit` + invoke module docs test `runtime_backend_is_server` | none | policy: supervisor starts Server binary not CLI as daemon | covered |
| S8 | Rust unit | `cargo test -p api` | desktop-use status route or handler JSON | in-process manager | `product` Desktop Use | covered |
| S9 | Bun | `bun test` | desktop-use client runtime URL helper | host/port | path `/api/desktop-use/status` | covered |
| S10 | Rust unit | `cargo test` | classify + stop is separate from quit | force_restart | stop not implied by quit policy | covered |

## Scenarios

### S1 — Second ensure reuses healthy UI Runtime

- **Level**: Rust unit
- **Given**: running=true, healthy=true, ui_ok=true, force_restart=false
- **When**: `classify_ensure`
- **Then**: `EnsureClassify::Reuse`
- **Signals**: enum variant Reuse (maps to `AlreadyRunning`)

### S2 — Healthz without product UI is not reusable

- **Level**: Rust unit
- **Given**: HTML probe samples
- **When**: `looks_like_atmos_ui_html` / classify with ui_ok=false
- **Then**: not Reuse; Unhealthy unless force
- **Signals**: false for `"Not Found"`; Unhealthy classify

### S3 — Desktop quit policy never stops Runtime

- **Level**: Rust unit
- **Given**: supervisor policy
- **When**: `desktop_quit_should_stop_runtime()`
- **Then**: false
- **Signals**: boolean false

### S4 — Electron quit helper is a no-op

- **Level**: Bun
- **Given**: shipped `stopOwnedAtmosServer`
- **When**: called with or without a fake owned pid
- **Then**: `stopped === false`, reason `shared_runtime`
- **Signals**: test file assertions

### S5 — CLI lazy-ensure when Server needed

- **Given**: `no_ensure=false`, `needs_server=true`
- **When**: `cli_should_lazy_ensure`
- **Then**: true

### S6 — `--no-ensure` skips start

- **Given**: `no_ensure=true`
- **When**: `cli_should_lazy_ensure`
- **Then**: false

### S7 — Backend is Atmos Server

- **Given**: architecture constants / `runtime_backend_kind()`
- **When**: read shipped helper
- **Then**: `"atmos-server"` not `"atmos-cli"`

### S8 — Desktop Use status via Server types

- **Given**: API handler wrapping `DesktopUseManager::status`
- **When**: serialize
- **Then**: JSON includes product name Desktop Use

### S9 — Electron client builds Runtime URL

- **Given**: host 127.0.0.1 port 30303
- **When**: `desktopUseRuntimeUrl`
- **Then**: `http://127.0.0.1:30303/api/desktop-use/status`

### S10 — Explicit stop is the only stop

- **Given**: quit policy false
- **When**: compare to `stop_running` existing API
- **Then**: stop remains a separate supervisor function; quit does not call it from policy

## Regression checklist

- [ ] Desktop `before-quit` does not stop shared Runtime
- [ ] Second ensure does not spawn when UI healthy
- [ ] CLI invoke unreachable path can lazy-ensure
- [ ] Desktop Use IPC does not require a new atmos process per click when Runtime is up
- [ ] Manifest source is `runtime-manager`

## Exploratory agent-browser checks

Omitted: no new user-facing chrome in this slice.

## Acceptance criteria

- [ ] M1–M6 each have a passing automated scenario
- [ ] `cargo test -p runtime-manager --features supervisor` passes for new tests
- [ ] `bun test` on desktop-electron runtime + desktop-use URL helper passes
- [ ] Coverage Status filled with exact commands

## Manual verification steps

1. Start Desktop, then `atmos runtime status` — running, same port; quit Desktop, status still running until `atmos runtime stop`.
2. Stop Runtime, run `atmos workspace list` (or status) without Desktop — lazy-ensure brings Server up.

## Non-coverage

- UDS bind, idle-stop, installer merge, engine tarball in Runtime package (TECH follow-ups).
- Full Electron boot spawn deletion (follow-up).

## Coverage Status

Captured 2026-09-20. Commands:

```
cargo test -p runtime-manager --features supervisor
# 29 passed (S1–S3, S5–S7, S10)

cargo test -p api desktop_use
# 1 passed (S8)

cargo test -p atmos desktop_use
cargo test -p atmos product_http_lazy
# CLI: prefs/doctor/driver Runtime HTTP + lazy-ensure wiring

bun test src/runtime/ensure.test.ts src/desktop-use/client.test.ts src/desktop-use/lifecycle.structural.test.ts
# cwd apps/desktop-electron; 18 pass (S4, S9)

./target/debug/atmos runtime status
# two consecutive runs: installed/running/healthy, same pid 54021 / port 30303
```

Logs: implementer scratch `runtime-unification-tests.log`, `runtime-cli-launch.log`.

| Scenario | Status |
|----------|--------|
| S1 classify Reuse | ✅ `supervisor::tests::classify_reuses_healthy_product_ui` |
| S2 HTML probe / no-UI | ✅ `ui_html_probe`, `classify_rejects_healthz_without_ui` |
| S3 quit policy false | ✅ `desktop_quit_never_stops_runtime` |
| S4 Electron no-op stop | ✅ `stopOwnedAtmosServer never kills shared Runtime` |
| S5 lazy ensure | ✅ `cli_lazy_ensure_rules` |
| S6 --no-ensure | ✅ `cli_lazy_ensure_rules` |
| S7 backend is Server | ✅ `runtime_backend_is_server_not_cli` |
| S8 Desktop Use product JSON | ✅ `api::desktop_use::tests::status_payload_is_desktop_use_product` |
| S9 Runtime URL helper | ✅ `builds Runtime Desktop Use URLs on loopback` |
| S10 explicit stop vs quit | ✅ classify force_restart Start; quit policy false |

Re-run of `cargo test -p api` after a later edit failed with disk full (`No space left on device`); first run of that test passed. runtime-manager and bun tests re-ran green `--offline`. `cargo check -p atmos --offline` after P1 prefs/lazy-ensure wiring succeeded.

Review subagents (architecture + ownership): no remaining P0. P1 prefs/CLI POST lazy-ensure/doctor-without-CLI addressed in a follow-up edit (Runtime HTTP first).
