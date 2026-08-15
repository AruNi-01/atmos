# TEST · APP-060: Vendor serve-sim

> Test Plan · how we verify vendored serve-sim download, spawn, embed, and `/exec` absence. References PRD APP-060 and TECH APP-060.

## Test strategy

Deterministic bun tests cover pin/path/sha256/probe/claim/url builders and the `/exec` patch (source + a fixture HTTP handler). Desktop smoke covers IPC registration. Real Xcode + Simulator boot is manual. Hosted-web copy is bun/structural plus agent-browser when a Desktop UI is running. No Playwright E2E: the web harness cannot spawn Simulator.app.

- Unit / integration: pin JSON, `~/.atmos` paths, sha256 mismatch, claim exclusive workspace, iframe URL builder, setup-reason mapping, `/exec` disabled.
- Service-level: n/a (no new `apps/api` surface).
- WebSocket/API-level: none. IPC only.
- End-to-end (Playwright): none for this spec.
- Exploratory agent-browser: setup card copy + New tab entry on Desktop when available.
- Manual-only: first download on a clean Mac, second start from cache, hide Simulator.app, disconnect frees the port, no-Xcode card.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S12 |
| M2 | S2, S3 |
| M3 | S4, S5 |
| M4 | S6, S13 |
| M5 | S7 |
| M6 | S8, S9 |
| M7 | S10 |
| M8 | S14 (manual) |
| M9 | S11 |
| M10 | S7 |
| M11 | S12 |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Bun | `bun test` | Desktop + web simulator tests | mock workspace id | tab id `simulator`; one per workspace | planned |
| S2 | Bun | `bun test` | download/sha256 module | fake archive + expected digest | progress callback; dest exists | planned |
| S3 | Bun | `bun test` | sha256 mismatch | mutated bytes | dest absent; retryable error | planned |
| S4 | Bun | `bun test` | spawn argv + state URL | fixture state JSON | argv has `--host 127.0.0.1` and `-p`; URL loopback | planned |
| S5 | Bun | `bun test` | iframe URL builder | port + udid | `http://127.0.0.1:<port>/?device=<udid>` | planned |
| S6 | Bun | `bun test` | structural | feature sources | no phone-shell / SimulatorScreen / custom HID as main path | planned |
| S7 | Bun | `bun test` | claims | two workspace ids | second start replaces first claim | planned |
| S8 | Bun | `bun test` | probe reason mapping | fake uname / missing xcode | card reason + button id | planned |
| S9 | Bun | `bun test` | probe | `arch=x86_64` / `linux` | `unsupported_arch` / `unsupported_platform` | planned |
| S10 | Bun | `bun test` | hosted copy | `isDesktopRuntime=false` | Desktop CTA; no start invoke | planned |
| S11 | Bun | `bun test` | stop | fake child | SIGTERM our pid; no `--kill` in argv | planned |
| S12 | Bun | `bun test` | i18n | en.json / zh.json | sentence case; no `npx`; zh not English paste | planned |
| S13 | Bun | `bun test` | vendor middleware | source + optional live helper | `/exec` + `/exec-ws` match upstream (token/Origin, command runs) | planned |
| S14 | Manual | human | clean Mac + Xcode | real Simulator | Simulator.app hidden; Atmos focused; port gone after close | planned |

## Scenarios

### S1 — Open Simulator tab

- **Level**: Bun
- **Given**: a workspace in Desktop.
- **When**: the user chooses Simulator from the New tab menu.
- **Then**: a single `simulator` tab opens for that workspace.
- **Signals**: tab value `simulator`; second open focuses the same tab.

### S2 — First-run download

- **Level**: Bun
- **Given**: pin version not on disk; download URL returns a matching tarball.
- **When**: `simulator_ensure` runs.
- **Then**: archive is fetched, hashed, extracted to `~/.atmos/runtime/serve-sim/<version>/`.
- **Signals**: progress events; `serve-sim` exists and is executable.

### S3 — Checksum failure

- **Level**: Bun
- **Given**: tarball bytes do not match pin sha256.
- **When**: ensure downloads.
- **Then**: dest is not installed; error is retryable.
- **Signals**: no `serve-sim` under that version; error code `checksum_mismatch`.

### S4 — Spawn argv

- **Level**: Bun
- **Given**: helper installed.
- **When**: start builds the child argv.
- **Then**: command is the installed binary; args include `--host 127.0.0.1`, `-p <port>`, and the udid; no `npx`; no `ELECTRON_RUN_AS_NODE`.
- **Signals**: argv snapshot.

### S5 — Iframe URL

- **Level**: Bun
- **Given**: state `{ url, device }` or port + udid.
- **When**: the panel builds the iframe src.
- **Then**: loopback HTTP with `?device=<udid>`.
- **Signals**: no `0.0.0.0`, no LAN IP.

### S6 — No custom phone chrome

- **Level**: Bun structural
- **Given**: `apps/web/src/features/simulator` and desktop simulator sources.
- **When**: scanned.
- **Then**: no Atmos-owned SimulatorScreen canvas / device-shell / HID mapper as the live preview.
- **Signals**: preview is an `iframe`.

### S7 — One claim

- **Level**: Bun
- **Given**: workspace A holds a claim.
- **When**: workspace B starts.
- **Then**: A's pid is signaled; claim is B's.
- **Signals**: claims.json has one entry.

### S8 — Missing Xcode card

- **Level**: Bun
- **Given**: probe `xcode_missing`.
- **When**: the panel renders.
- **Then**: setup card + Install Xcode button; no iframe.
- **Signals**: reason + action id.

### S9 — Unsupported host

- **Level**: Bun
- **Given**: linux or x86_64 darwin.
- **When**: probe.
- **Then**: `unsupported_platform` or `unsupported_arch`; start is not attempted.
- **Signals**: reason enum.

### S10 — Hosted Web

- **Level**: Bun
- **Given**: `isDesktopRuntime() === false`.
- **When**: Simulator tab opens.
- **Then**: “needs Atmos Desktop” card; no `simulator_start`.
- **Signals**: copy key; invoke not called.

### S11 — Stop our pid only

- **Level**: Bun
- **Given**: a running child we spawned.
- **When**: stop.
- **Then**: that pid is signaled; argv never includes `--kill`.
- **Signals**: kill spy; no `--kill`.

### S12 — Copy

- **Level**: Bun
- **Given**: en.json + zh.json simulator keys.
- **When**: scanned.
- **Then**: sentence case; no `npx`; zh is translated.
- **Signals**: fixture assertions.

### S13 — `/exec` gone

- **Level**: Bun
- **Given**: vendored middleware / exec-ws.
- **When**: inspected (and, if a helper is running, probed).
- **Then**: HTTP `/exec` and `/exec-ws` `{command}` behave like upstream (token + Origin; command runs).
- **Signals**: source assertions; optional 404.

### S14 — Manual Mac

- **Level**: Manual
- **Given**: Apple Silicon + Xcode + a device.
- **When**: first open, second open, close tab.
- **Then**: first run downloads; second uses cache; Simulator.app does not stay frontmost; port is free after close.
- **Signals**: panel iframe; `lsof` empty.

## Performance & load budgets

- Cached start (helper already on disk, device already booted): preview URL ready < 5s typical.
- Download is bounded by GitHub; show bytes in-panel.

## Regression checklist

- [ ] No `npx` / npm registry in the runtime start path.
- [ ] No helper under `Contents/Resources`.
- [ ] No writes under `~/.atmos/data/desktop/`.
- [ ] `apps/desktop` (Tauri) untouched.
- [ ] Hosted Web cannot start a helper.
- [ ] `serve-sim --kill` is never invoked.

## Exploratory agent-browser checks

Use after the panel exists. Load Agent Browser instructions first (`agent-browser` skill or `agent-browser skills get core --full`).

1. Desktop workspace: New tab → Simulator. Confirm setup or download or iframe — not a blank center.
2. Hosted / non-desktop viewport: same entry shows Desktop CTA; no iframe to a random host.
3. Failure: simulate missing helper URL; Retry stays in-panel.
4. Console: no unhandled iframe / invoke errors on the setup-card path.

## Acceptance criteria

- [ ] All Must Have items have a scenario.
- [ ] S13 proves `/exec` cannot run a host shell.
- [ ] No new unconditional REST / WS actions.
- [ ] `just lint` and targeted `bun test` / `cargo test` on touched packages pass.
- [ ] Coverage Status filled after test-run.

## Manual verification steps

1. Clean `~/.atmos/runtime/serve-sim`: open Simulator → download → iframe.
2. Quit and reopen: no download; iframe from cache.
3. Watch the Dock: Simulator.app must not stay focused after boot.
4. Close the tab: `lsof -iTCP:<port> -sTCP:LISTEN` is empty.
5. Hide Xcode (`sudo xcode-select -s /Library/Developer/CommandLineTools` or PATH without `xcrun`): setup card, not a white iframe.
6. `curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:<port>/exec` is `404`.

## Non-coverage

- Real GitHub Release download in CI (no guaranteed network + tag).
- Camera / location / `open -R` Tools after `/exec` removal (known degrade).
- Intel / Android / remote tunnel.

## Coverage Status

Implemented 2026-08-15 on `feat/vendor-serve-sim`.

| Scenario | Status | Proof |
|----------|--------|-------|
| S1 | covered | `apps/web/src/features/simulator/__tests__/simulator.test.ts` tab id + store |
| S2 | partial | download module + pack script; live GitHub fetch is manual / tag-gated |
| S3 | covered | `apps/api/src/simulator.rs` checksum maps to `ChecksumMismatch` |
| S4 | covered | `buildServeSimArgv` in `simulator.test.ts` |
| S5 | covered | iframe URL tests (desktop + web) |
| S6 | covered | structural iframe / no SimulatorScreen |
| S7 | covered | claims test keeps one workspace |
| S8 | covered | setupActionForReason + probe `xcode_missing` |
| S9 | covered | probe `unsupported_platform` / `unsupported_arch` |
| S10 | covered | cloud / non-Mac API returns `unsupported_platform`; web uses `/ws` not IPC |
| S11 | covered | `stopPid` SIGTERM; argv has no `--kill` |
| S12 | covered | en.json / zh.json assertions |
| S13 | covered | vendored middleware + exec-ws source assertions |
| S14 | manual | needs a real Mac + Xcode + published or locally packed helper |

Commands run:

- `bun test` in `apps/desktop-electron` (`src/simulator`, `src/ipc/router.test.ts`)
- `bun test` in `apps/web` (`src/features/simulator`, `src/app-shell/__tests__`)
- `cargo test -p runtime-manager layout_is_under_atmos_home`

Remaining: first GitHub Release (`just pack-serve-sim` then tag `serve-sim-0.1.37-atmos.1`); pin `sha256` is empty until that pack.
