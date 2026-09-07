# TEST · APP-070: Simulator optimize + Android

> Test Plan · how we verify Device Preview + Workspace claims + Android helper install/iframe. References PRD APP-070 and TECH APP-070.

## Test strategy

Deterministic Rust tests own inventory parsing, per-platform probe, and claim policy (no steal, auto-claim free, restore). Bun tests own iframe URL, setup-reason mapping, i18n, and structural “preview is still an iframe / no Atmos Device Screen”. Pack scripts get argv/layout assertions. Real Xcode + AVD boot is manual. Playwright cannot spawn Simulator.app or the Android emulator — no E2E for the live iframe.

- Unit / integration: `core-engine` simctl/adb fixtures; `core-service` claim algorithm; pin/sha256; iframe URL; reason → card.
- WebSocket/API-level: start/stop/status DTO shapes via existing API tests if a harness is cheap; otherwise service-level with a fake helper spawn.
- End-to-end (Playwright): none for live devices.
- Exploratory agent-browser: setup cards and tab entry when Desktop **or** local Web UI is up (no real emulator required).
- Manual-only: first Android download, two-workspace live previews, hide Simulator.app, serve-emu chrome parity.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1 |
| M2 | S2, S3, S4 |
| M3 | S5, S6, S7 |
| M4 | S8, S9, S10 |
| M5 | S11, S12 |
| M6 | S9, S13 |
| M7 | S10, S14 |
| M8 | S15, S16 |
| M9 | S17 |
| M10 | S2, S6, S10 |
| M11 | S5, S18 |
| M12 | S19 |
| M13 | S20 (manual) |
| M14 | S12, S21 |
| N1–N4 | deferred |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Bun | `bun test` | web simulator tab tests | workspace id | tab value `simulator`; one per workspace | planned |
| S2 | Rust | `cargo test` | DevicePreview probe | Xcode missing, AVD present | `ios.ready=false`, `android.ready=true`; Start allowed | planned |
| S3 | Rust | `cargo test` | DevicePreview probe | Android SDK missing, iPhone available | `android` env reason; `ios.ready=true` | planned |
| S4 | Rust | `cargo test` | host gate | linux or x86_64 | host `unsupported_*`; no platform ready | planned |
| S5 | Bun / script | `bun test` or pack dry-run | serve-emu pin + argv | pin JSON | path `runtime/serve-emu/<version>`; argv has `--host 127.0.0.1`; no `npx` | planned |
| S6 | Rust | `cargo test` | checksum | mutated tarball | `checksum_mismatch`; dest absent | planned |
| S7 | Structural | `bun test` / grep | NOTICE + vendor | `vendor/serve-emu`, NOTICE | Apache-2.0; no serve-avd runtime | planned |
| S8 | Rust | `cargo test` | auto-claim | two free devices, no prefs | start picks a free id; claim persisted | planned |
| S9 | Rust | `cargo test` | no steal | A claimed udid U | B start with U → `device_already_claimed`; A still owns U | planned |
| S10 | Rust | `cargo test` | no free device | all claimed | `no_device`; no eviction | planned |
| S11 | Rust | `cargo test` | restore | live claim for A | status returns url; second start reuses pid | planned |
| S12 | Rust | `cargo test` | stop scoped | A and B running | stop A kills A pid only; B claim remains | planned |
| S13 | Rust | `cargo test` | two claims | iOS + Android free | two entries in claims.json | planned |
| S14 | Bun | `bun test` | setup mapping | `no_device` | card action id; no iframe | planned |
| S15 | Bun | `bun test` | iframe URL | port + udid | loopback + `device=` query | planned |
| S16 | Bun structural | `bun test` | feature sources | `features/simulator` | live preview is `iframe`; no Atmos DeviceScreen canvas | planned |
| S17 | Bun structural | `bun test` | serve-emu client | vendor preview | device title/picker, below-device actions, right tools panel (selectors/classes as implemented) | planned |
| S18 | Bun | `bun test` | i18n | en.json / zh.json | sentence case; no `npx`; zh translated | planned |
| S19 | Bun | `bun test` | loopback vs relay | `connectionMode` | local/hosted loopback can start; relay → `not_desktop` retry, no Desktop-only CTA | planned |
| S20 | Manual | human | Mac + Xcode + AVD | real devices | iOS hide Simulator.app; Android iframe; two workspaces | planned |
| S21 | Rust | `cargo test` | argv | stop/start builders | no `--kill` | planned |

## Scenarios

### S1 — Same Simulator tab

- **Level**: Bun
- **Given**: a workspace in Desktop.
- **When**: the user opens Simulator from the New tab menu twice.
- **Then**: one `simulator` tab; it is the Android entry too.
- **Signals**: tab value `simulator`; no `android` tab kind.

### S2 — Android ready without Xcode

- **Level**: Rust
- **Given**: probe fixtures with no Xcode and one available AVD + adb/emulator.
- **When**: probe runs.
- **Then**: `ios.reason` is `xcode_missing` (or `simctl_missing`); `android.ready` is true (or `helper_missing` if binary absent). Workspace Start is allowed.
- **Signals**: nested probe; not a single host `xcode_missing` that blocks Android.

### S3 — iOS ready without Android SDK

- **Level**: Rust
- **Given**: simctl lists an iPhone; SDK/adb missing.
- **When**: probe runs.
- **Then**: iOS can start; Android reason is `android_sdk_missing` or `adb_missing`.
- **Signals**: `ios.ready` independent of `android.ready`.

### S4 — Unsupported host

- **Level**: Rust
- **Given**: `linux` or `x86_64`.
- **When**: probe runs.
- **Then**: no helper download; Start is not attempted.
- **Signals**: `unsupported_platform` or `unsupported_arch`.

### S5 — serve-emu install layout

- **Level**: Bun / pack
- **Given**: pin version.
- **When**: pack `--install` or download extract runs.
- **Then**: binary lives under `~/.atmos/runtime/serve-emu/<version>/`; spawn argv is that binary + loopback port + device id.
- **Signals**: path exists; argv snapshot has no `npx`.

### S6 — Checksum mismatch

- **Level**: Rust
- **Given**: bytes ≠ pin sha256.
- **When**: ensure downloads serve-emu.
- **Then**: version dir not installed; reason `checksum_mismatch`; retryable.
- **Signals**: dest absent.

### S7 — Not serve-avd / Apache-2.0

- **Level**: Structural
- **Given**: repo after vendor.
- **When**: scanned.
- **Then**: `vendor/serve-emu/` exists; runtime spawn does not reference `serve-avd`; NOTICE lists the binary.
- **Signals**: path + NOTICE section.

### S8 — Auto-claim free

- **Level**: Rust
- **Given**: two available unclaimed devices; no prefs.
- **When**: workspace A starts without udid.
- **Then**: A’s claim points at one free device.
- **Signals**: claims.json one entry; device `claimed_by` = A.

### S9 — Never steal

- **Level**: Rust
- **Given**: A claimed device U.
- **When**: B starts with `udid=U`.
- **Then**: B gets `device_already_claimed` (or equivalent); A still holds U; A’s pid still running.
- **Signals**: claims still `{A: U}`.

### S10 — No free device

- **Level**: Rust
- **Given**: the only available device is claimed by A.
- **When**: B starts without udid.
- **Then**: `no_device`; A is not evicted.
- **Signals**: single claim remains.

### S11 — Restore claim

- **Level**: Rust
- **Given**: A has a live helper.
- **When**: `simulator_status(A)` then `simulator_start(A)` with no udid.
- **Then**: same url/pid reused; no second spawn.
- **Signals**: pid unchanged.

### S12 — Stop is per workspace

- **Level**: Rust
- **Given**: A and B both running.
- **When**: stop A.
- **Then**: A’s child is signaled; B’s port still open; B’s claim remains.
- **Signals**: claims.json one entry (B).

### S13 — Concurrent iOS + Android

- **Level**: Rust
- **Given**: free iPhone + free AVD; both helpers mocked as listening.
- **When**: A starts iOS, B starts Android.
- **Then**: two claims, two platforms, two ports.
- **Signals**: claims length 2.

### S14 — Empty device card

- **Level**: Bun
- **Given**: start result `no_device`.
- **When**: panel renders.
- **Then**: setup/empty card, not iframe.
- **Signals**: reason + action id.

### S15 — Iframe URL

- **Level**: Bun
- **Given**: claim url + udid.
- **When**: `iframeSrc` runs.
- **Then**: `http://127.0.0.1:<port>/?device=<udid>`.
- **Signals**: no `0.0.0.0`.

### S16 — Still iframe, no Atmos canvas

- **Level**: Bun structural
- **Given**: `apps/web/src/features/simulator`.
- **When**: scanned.
- **Then**: ready state is an `iframe`; no new Atmos `DeviceScreen` / MJPEG canvas as the main path.
- **Signals**: source assertions.

### S17 — serve-emu chrome parity

- **Level**: Bun structural
- **Given**: vendored serve-emu client.
- **When**: scanned (and visual manual S20).
- **Then**: device identity control, actions under the device, right tools panel exist. iOS serve-sim layout is not regressed.
- **Signals**: component/test ids agreed at impl; ATMOS-PATCHES.md lists the chrome patch.

### S18 — Copy

- **Level**: Bun
- **Given**: en.json + zh.json simulator keys.
- **When**: scanned.
- **Then**: sentence case; no `npx`; zh is translated; Android SDK / AVD strings exist.
- **Signals**: fixture assertions.

### S19 — Loopback Web vs remote Computer

- **Level**: Bun
- **Given**: Web runtime (not Electron) with a Computer on this Mac, or a relay session.
- **When**: Simulator tab opens / Start.
- **Then**: loopback (`connectionMode !== relay`) probes and can `simulator_start`. Relay shows “needs this Mac” and does not start. No Desktop-app-only CTA.
- **Signals**: hook has no `isHostedAtmosOrigin`; `simulatorHelperReachable`; copy is not “Get Atmos Desktop” as the start gate.

### S20 — Manual Mac

- **Level**: Manual
- **Given**: Apple Silicon, Xcode, at least one iPhone sim, Android SDK, one AVD.
- **When**: first Android open; second Android open; iOS open in another workspace; close A.
- **Then**: first Android downloads; second uses cache; both iframes live; stop A does not kill B; Simulator.app does not stay frontmost on iOS start; serve-emu chrome matches serve-sim (picker / below-device actions / right tools).
- **Signals**: two loopback ports; visual chrome.

### S21 — No global `--kill`

- **Level**: Rust
- **Given**: start/stop argv builders.
- **When**: stop runs.
- **Then**: argv never includes `serve-sim --kill` or serve-emu global kill.
- **Signals**: argv snapshot.

## Performance & load budgets

- Cached iOS start (helper on disk, sim booted): preview URL ready < 5s typical (APP-060).
- Cached Android start with **already booted** AVD: preview URL ready < 10s typical.
- Cold AVD boot is unbounded relative to emulator image; UI stays on in-panel starting state; do not fake a timeout as `no_device`.

## Regression checklist

- [ ] iOS APP-060 path still iframes serve-sim after the `core-service` move.
- [ ] Missing Xcode does not block Android Start.
- [ ] Missing Android SDK does not block iOS Start.
- [ ] Two workspaces do not share one claim (APP-060 S7 overturned).
- [ ] No `npx` / npm registry on the runtime start path.
- [ ] No helper under `Contents/Resources` or `~/.atmos/data/desktop/`.
- [ ] `apps/desktop` (Tauri) untouched.
- [ ] Hosted Web with a Computer on this Mac can start; relay/remote cannot iframe `127.0.0.1`.
- [ ] Physical `adb` devices are not claimed.
- [ ] `serve-sim --kill` is never invoked.

## Exploratory agent-browser checks

Use after the panel exists. Load Agent Browser instructions first (`agent-browser` skill or `agent-browser skills get core --full`). Live emulator is optional.

1. Desktop or local Web: New tab → Simulator. Confirm setup, download, or iframe — not a blank center.
2. Force an iOS-missing probe (copy/reason): Android CTA or iOS card is specific, not “Simulator failed”.
3. Relay / remote Computer: “needs this Mac” card; no iframe to a random host. Local/hosted loopback: probe/start, not a Desktop download CTA.
4. Console: no unhandled iframe / WS errors on the setup-card path.
5. Narrow viewport: setup card copy not clipped.

## Acceptance criteria

- [ ] All Must Have items have at least one passing scenario at the declared level (S20 manual counted for M9/M13).
- [ ] APP-060 iOS iframe still works (S15, S16, S20).
- [ ] Claim tests prove no steal + two concurrent claims.
- [ ] No new REST endpoints.
- [ ] `just lint` and targeted `cargo test` / `bun test` on touched packages pass, or scoped alternatives are recorded.
- [ ] `atmos-specs-test-run` has updated Coverage Status after implementation.

## Manual verification steps

1. Clean `~/.atmos/runtime/serve-emu`: open Simulator on a Mac with SDK + AVD → download → iframe.
2. Quit and reopen: no Android re-download; iframe from cache.
3. Second workspace: second device or “no available device”; first iframe stays.
4. Close first tab: its port is free; second port remains.
5. Hide Xcode from PATH: Android still starts; iOS shows Xcode card.
6. Unset `ANDROID_HOME` / hide `adb`: iOS still starts; Android card names SDK/adb.
7. Compare iOS and Android helper pages: picker, below-device actions, right tools.

## Non-coverage

- Real GitHub Release download in CI (tag-gated).
- Live emulator boot in CI (no guaranteed Android SDK / nested virtualization).
- Physical devices, Linux/Windows, Metro, Agent HID, native Atmos canvas (out of PRD).
- Pixel-perfect chrome vs serve-sim (structural + one manual visual pass).

## Coverage Status

_Last run: 2026-09-07 · `bun test apps/web/src/features/simulator/__tests__/simulator.test.ts` (22 passed); `just pack-serve-emu --install` + GitHub Release `serve-emu-0.0.5-atmos.1` (manifest sha256 `286d7911dfc2234dae5883351c03b99c83632eb349d6c9ff187061866b63d186`); `just pack-serve-sim --install` locally (iOS postMessage in this machine's helper). Pin `sha256` fields stay empty; runtime reads Release `manifest.json`. S20 / live AVD not run._

- S1 — ✅ `apps/web/src/features/simulator/__tests__/simulator.test.ts` (`keeps one tab id per workspace`)
- S2 — ✅ `crates/core-service/src/service/device_preview/probe.rs::android_ready_without_xcode`
- S3 — ✅ `crates/core-service/src/service/device_preview/probe.rs::ios_ready_without_android_sdk`
- S4 — ✅ `crates/core-service/src/service/device_preview/tests.rs::{linux,x86_64}_host_is_unsupported`
- S5 — ✅ structural pack/pin/argv in `simulator.test.ts`; `just pack-serve-emu --install`; Release https://github.com/AruNi-01/atmos/releases/tag/serve-emu-0.0.5-atmos.1 (`manifest.json` sha256 filled; pin sha256 stays empty like serve-sim)
- S6 — ✅ `crates/core-service/src/service/device_preview/tests.rs::checksum_mismatch_does_not_mark_ready`
- S7 — ✅ `simulator.test.ts` NOTICE + `vendor/serve-emu` Apache-2.0
- S8 — ✅ `crates/core-service/src/service/device_preview/tests.rs::auto_claim_picks_a_free_device`; `probe_annotates_claimed_devices`; `concurrent_start_does_not_double_claim`
- S9 — ✅ `never_steals_another_workspace_device`
- S10 — ✅ `no_free_device_leaves_existing_claim`
- S11 — ✅ `restore_reuses_pid`
- S12 — ✅ `stop_is_scoped_to_workspace`
- S13 — ✅ `two_workspaces_can_claim_two_platforms`
- S14 — ✅ `maps setup reasons to real buttons` (`no_device` → `openXcode`)
- S15 — ✅ `forces loopback iframe urls`
- S16 — ✅ `preview is an iframe and not a canvas shell`
- S17 — ✅ `keeps serve-emu chrome selectors aligned with device preview`
- S18 — ✅ i18n sentence case / zh / no npx
- S19 — ✅ `lets loopback Computers start, including hosted web, and blocks relay` (`simulatorHelperReachable`, no `isHostedAtmosOrigin`)
- S20 — ⏸ manual Mac + live AVD/Simulator.app (not CI)
- S21 — ✅ `helper_argv_is_loopback_without_kill` + spawn refuses `--kill`; `parse_helper_line` exact argv token (Pixel_8 vs Pixel_8_Pro) and booted `-s emulator-5554` via `helper_process_ids`; vendor `useSimStream` posts `atmos:simulator-stop` instead of `serve-sim --kill`; `isGlobalServeSimKill` rejects global `-k`/`--kill`
- Exploratory agent-browser — ⏸ `not_run`: no Desktop/dev server in this session; live emulator is out of CI.

