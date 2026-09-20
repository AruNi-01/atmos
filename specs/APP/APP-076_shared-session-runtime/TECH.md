# TECH · APP-076: Shared session Runtime

> Technical Design · HOW. Implements PRD APP-076: Shared session Runtime. **No backward compatibility.** Addresses M1–M6. Installer/R2 two-line cutover, UDS-only bind, and idle-stop daemon are specified as follow-ups, not this slice.

## Scope summary

This slice makes **one user-session Atmos Runtime** the only local backend:

- Supervisor logic lives in **one Rust unit** (`crates/runtime-manager` supervisor).
- CLI and Desktop are **thin callers** of that unit (reuse vs start; never a second Server when product UI is healthy).
- Desktop quit **does not stop** Runtime. Only `atmos runtime stop` (explicit) does.
- CLI product commands that need Server **lazy-ensure** Runtime.
- Desktop Use status/driver/doctor/prefs go through **Atmos Server HTTP** (`/api/desktop-use/*`) using `crates/desktop-use`. Electron must not `execFile` `atmos desktop-use` on the hot path. Host app identity for TCC stays **Atmos Desktop Use** (`com.atmos.desktop.use`).

The `atmos` CLI process is **not** the long-running HTTP/WS backend.

## Architecture overview

```
Desktop.app / browser / `atmos` CLI
        │  ensure / invoke / HTTP
        ▼
crates/runtime-manager  (single supervisor: ensure / status / stop / reuse policy)
        │  spawn once
        ▼
Atmos Server (apps/api)     ← only local backend
        │
        ├── static web + skills
        └── /api/desktop-use/*  → crates/desktop-use → optional host .app (TCC)
```

Touched:

- `crates/runtime-manager/src/supervisor.rs` — reuse/UI probe, classify ensure, ownership policy.
- `apps/cli/src/server_invoke.rs`, `apps/cli/src/commands/runtime.rs`, `apps/cli/src/commands/desktop_use/`.
- `apps/api/src/api/desktop_use.rs` (new) + `apps/api/src/api/mod.rs`.
- `apps/desktop-electron/src/runtime/ensure.ts`, `src/main.ts` quit, `src/desktop-use/client.ts`.

## Decisions

1. **Reusable Runtime** = `/healthz` OK **and** `GET /` looks like product HTML (`<!doctype html` / `<html`). Healthz-only leftover processes are **not** reused (Desktop may reclaim; CLI ensure errors with force-restart hint).
2. **Ownership**: Runtime belongs to the user session, not the window. `desktop_quit_should_stop_runtime()` is **always false**. Remove Electron `stopOwnedAtmosServer` from `before-quit`. Manifest `source` is always `runtime-manager` (Desktop no longer writes `desktop-electron`).
3. **CLI lazy-ensure**: on `SERVER_UNREACHABLE` for product invoke / desktop-use HTTP, call `ensure_running` once and retry. `atmos runtime ensure|status|stop` stay explicit. Flag `--no-ensure` on API client skips lazy start.
4. **Desktop boot**: still may spawn Server **through the same classify+spawn helpers conceptually**; this slice rewires quit + reuse + manifest source. Full deletion of TS spawn is a follow-up when Desktop only calls `atmos runtime ensure` / native supervisor. **This slice must not kill Runtime on quit and must reuse a healthy UI Server.**
5. **Desktop Use transport**: REST under `/api/desktop-use` (not WsAction). Justification: host-tool lifecycle is not a workbench session stream; matches existing `/api/system/cli-*` host ops. CLI `atmos desktop-use` prefers these routes when Runtime is up; otherwise lazy-ensure then retry; in-process `DesktopUseManager` only if Runtime binary is missing (CLI-only without Server install — status of on-disk engine still works).
6. **TCC**: drive/capture-with-engine still launches **Atmos Desktop Use.app**. Electron overlay remains shell-only.
7. **Idle-stop**: specified (no clients + idle) but **not implemented** in this slice. Explicit stop only.
8. **Local transport this slice**: TCP loopback as today. UDS is a follow-up (known-debt); not required for M1–M6.

## Module-by-module design

### crates/runtime-manager

Add (same crate, `supervisor` feature):

```rust
pub fn looks_like_atmos_ui_html(body: &str) -> bool;

pub enum EnsureClassify {
    Reuse,          // running + healthy + ui
    Start,          // not running
    Unhealthy,      // running but not healthy/ui — error unless force_restart
}

pub fn classify_ensure(running: bool, healthy: bool, ui_ok: bool, force_restart: bool) -> Result<EnsureClassify, &'static str>;

/// Always false. Desktop/CLI must call this instead of ad-hoc ownership.
pub fn desktop_quit_should_stop_runtime() -> bool { false }

pub fn cli_should_lazy_ensure(no_ensure: bool, needs_server: bool) -> bool;
```

`ensure_running` uses `classify_ensure` after probing healthz + UI. Second ensure with a live healthy UI returns `EnsureOutcome::AlreadyRunning`.

### apps/cli

- `ApiClientArgs.no_ensure: bool` (`--no-ensure`).
- `server_invoke::invoke` / `get_json`: if unreachable and `cli_should_lazy_ensure`, `ensure_running(Default::default())` then retry once.
- `atmos desktop-use`: HTTP to `/api/desktop-use/...` after lazy-ensure; fall back to in-process manager only when runtime is not installed.

### apps/api

New module `apps/api/src/api/desktop_use.rs`, nest `/api/desktop-use`:

| Method | Path | Handler |
|--------|------|---------|
| GET | `/status` | `DesktopUseManager::status` |
| GET | `/doctor` | `permission_doctor` |
| POST | `/driver/ensure` | `ensure_driver` |
| POST | `/driver/stop` | `stop_driver` |
| POST | `/driver/restart` | `restart_driver` |
| POST | `/driver/check` | `runtime_check` |
| POST | `/driver/uninstall` | `uninstall_driver` |
| GET | `/prefs` | `load_prefs` |
| PUT | `/prefs` | `update_prefs` |

JSON `ApiResponse`. Blocking manager calls via `spawn_blocking`. `apps/api/Cargo.toml` depends on `desktop-use`.

### apps/desktop-electron

- `desktopQuitShouldStopRuntime()` in `src/runtime/ownership.ts` — always `false`; `main.ts` `before-quit` **must not** call `stopOwnedAtmosServer`.
- `stopOwnedAtmosServer` becomes a no-op returning `{ stopped: false, reason: "shared_runtime" }` (keeps tests pointing at shipped function).
- Manifest writer uses `source: "runtime-manager"`.
- `desktop-use/client.ts`: `runDesktopUseJson` first `fetch`es Runtime `/api/desktop-use/...` using loopback from `get_api_config` / `ATMOS_PORT` / `127.0.0.1:30303`. CLI `execFile` only if Runtime HTTP fails **and** CLI is present (degraded); prefer Runtime.

## Data model

Reuse `RuntimeManifest` (`crates/runtime-manager/src/manifest.rs`). `source` = `"runtime-manager"`.

`EnsureOutcome::{AlreadyRunning, Started}(RuntimeStatus)` unchanged.

## Transport

### REST (justified)

Host lifecycle is not a WS session. Routes listed above. Loopback; same auth as `/api/system` (local trust / optional `ATMOS_LOCAL_TOKEN`).

### WebSocket

No new `WsAction` in this slice.

## Security & permissions

- Desktop Use grant overlay remains Electron/shell.
- Server handlers do not call vendor `permissions grant`.
- Manifest still contains no tokens.

## Rollout plan

1. Policy + classify + tests in `runtime-manager`.
2. CLI lazy-ensure + desktop-use HTTP client.
3. API `/api/desktop-use`.
4. Desktop quit/ownership + client fetch.
5. Tests + Coverage Status.

## Risks & tradeoffs

- **Risk**: Desktop still contains TS spawn for boot; two spawners until follow-up. Mitigate by shared classify rules and **identical quit policy** (never kill).
- **Tradeoff**: REST for Desktop Use vs WsAction — host tools are not workbench streams.
- **Rollback**: revert this spec’s files; no data migration.

## Dependencies & compatibility

- Depends on APP-016 Runtime manifest, APP-052 Desktop Use crate, APP-063 CLI invoke.
- **No backward compatibility** with `startedServer` quit-kills or `source: desktop-electron`.

## Follow-ups (not this slice)

- Desktop boot only via supervisor (delete TS spawn).
- UDS `~/.atmos/run/api.sock`.
- Idle-stop.
- Single Runtime installer replacing local-web-runtime + Desktop extraResources.
- Engine tarball inside Runtime package.

## Open questions

None for this slice. Idle timeout duration deferred.
