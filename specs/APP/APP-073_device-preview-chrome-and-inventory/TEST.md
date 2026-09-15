# TEST · APP-073: Device Preview chrome and inventory

> Test Plan · how we verify the serve-sim bump, Atmos appearance/camera chrome, and Computer device inventory. References PRD APP-073 and TECH APP-073.

## Test strategy

Rust owns catalogs, create/boot/shutdown/delete parsing and service policy (no steal, shutdown releases our claim, delete shuts down then deletes unless foreign claim, start boots then attaches `-s`). DeviceControl appearance mapping and camera file/wiring/PNG guards are unit/service tests with fake engine hooks. Bun tests own chrome visibility (appearance always on a claim; camera only Android), i18n, iframe still present, and WS wrapper names. Real Simulator.app / qemu / PNG-on-camera is manual. Playwright does not boot emulators.

- Unit / integration: `core-engine` simctl JSON / `avdmanager list device` / `sdkmanager --list_installed` fixtures; appearance parse; PNG 32 MiB cap + signature; `imagefile:` argv; `hardware-qemu.ini` wiring; pin version string.
- Service-level: `DevicePreviewService` lifecycle + claims; `DeviceControlService` no_claim / unsupported_on_platform.
- WebSocket/API-level: new `simulator_*` DTO + contract extract; CLI parse of new verbs.
- End-to-end (Playwright): none for live devices. Optional structural panel test only if a harness can mount Simulator chrome with mocked WS — otherwise Bun.
- Exploratory agent-browser: inventory + chrome layout when the tab is up (mocked or empty inventory is enough).
- Manual-only: 0.1.48 iOS iframe, real appearance, real Android PNG, real create/boot.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2, S3 |
| M2 | S4, S5 |
| M3 | S6, S7, S8 |
| M4 | S9, S10, S11, S12, S32, S33 |
| M5 | S13, S14 |
| M6 | S15, S16, S17, S30, S31 |
| M7 | S18, S19, S33 |
| M8 | S20, S21, S22, S34 |
| M9 | S23, S24 |
| M10 | S25, S26 |
| M11 | S27 |
| M12 | S28 |
| M13 | S7, S10, S16, S19, S21, S24 |
| N1–N5 | deferred |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Structural / script | `cargo test` / pin read / pack dry-run | pin JSON + UPSTREAM + ATMOS-PATCHES | vendor tree | version `0.1.48-atmos.1`; patches list loopback, no `--kill`, postMessage stop | planned |
| S2 | Structural | grep / pack script test | `scripts/serve-sim/pack.sh` | pack source | `simcam` still omitted | planned |
| S3 | Rust | `cargo test` | DevicePreview start iOS fake helper | fake 0.1.48 hooks | iframe url + claim; argv has `127.0.0.1`; no `--kill` | planned |
| S4 | Bun | `bun test` | SimulatorPanel chrome | mocked claim | appearance control rendered; sentence case keys in en+zh | planned |
| S5 | Bun | `bun test` | i18n | en.json / zh.json | zh translated; no ALL CAPS; no `npx` | planned |
| S6 | Rust | `cargo test` | appearance_set iOS + Android fakes | live claim, booted | engine called with light/dark; uimode yes/no mapping | planned |
| S7 | Rust | `cargo test` | appearance without claim | no DeviceClaim | `no_claim`; no simctl/adb | planned |
| S8 | Rust | `cargo test` | appearance while Shutdown | claim, boot=Shutdown | `device_not_booted` | planned |
| S9 | Rust | `cargo test` | camera_inject Android | claim android, wired, PNG < 32 MiB | atomic write to `<serial>-front.png`; placeholder not used | planned |
| S10 | Rust | `cargo test` | camera_inject iOS | claim ios | `unsupported_on_platform`; no inject | planned |
| S11 | Rust | `cargo test` | camera PNG too large / not png | 32 MiB+ or jpeg | processing error; no inject | planned |
| S12 | Bun | `bun test` | camera control visibility | ios vs android claim | control absent on iOS; present on Android | planned |
| S13 | Rust | `cargo test` | inventory lists + claim annotation | two devices, one claimed | `claimed_by_workspace` set; physical adb absent | planned |
| S14 | Bun | `bun test` | relay gate | `connectionMode=relay` | no inventory actions; needs-this-Mac card | planned |
| S15 | Rust | `cargo test` | create iOS + Android | catalog fixtures | new Shutdown device; no helper spawn; no auto-claim | planned |
| S16 | Rust | `cargo test` | create missing runtime/image | empty catalog | `runtime_missing` or `system_image_missing`; no process | planned |
| S17 | Rust | `cargo test` | create name collision | existing AVD name | suffix or typed exists error; no `--force` clobber | planned |
| S18 | Rust | `cargo test` | boot unclaimed Shutdown | fake engine | engine boot called; no helper | planned |
| S19 | Rust | `cargo test` | boot device claimed by B | A’s workspace | `device_already_claimed`; B still owner | planned |
| S20 | Rust | `cargo test` | shutdown our claimed device | live helper pid | helper SIGTERM; claim gone; engine shutdown; no `--kill` | planned |
| S21 | Rust | `cargo test` | shutdown B’s claimed device from A | B owns udid | `device_already_claimed`; B helper alive | planned |
| S22 | Rust | `cargo test` | simulator_stop does not shutdown VM | live claim | helper gone; engine shutdown **not** called | planned |
| S23 | Rust | `cargo test` | delete unclaimed (even Booted) | fake engine | shutdown then delete called | planned |
| S24 | Rust | `cargo test` | delete foreign claim | B owns udid | `device_already_claimed`; no delete | planned |
| S25 | Rust | `cargo test` | start Shutdown Android | shutdown AVD | seed feeds; qemu argv has imagefile + `-no-window`; helper `-s serial`; one qemu | planned |
| S26 | Bun structural | `bun test` | preview still iframe | feature sources | live preview is `iframe`; one `simulator` tab | planned |
| S27 | Structural | grep / bun | no catalog in helpers | vendor serve-sim/emu UI | create/boot dialogs not added to helper pages; WS names on Atmos contract | planned |
| S28 | Rust / CLI | `cargo test` | CLI parse invoke | `apps/cli` simulator tests | create/boot/shutdown/delete/appearance/camera map to `simulator_*` | planned |
| S29 | agent-browser | `agent-browser` | Simulator tab chrome | local web, no real VM ok | inventory + appearance visible; camera hidden without Android claim; no clipped chrome | planned |
| S30 | Rust | `cargo test` | parse catalogs | simctl runtimes JSON; avdmanager list device; sdkmanager --list_installed | iOS types nested under runtime; Android profile quoted id; system-images; only | planned |
| S31 | Rust | `cargo test` | avdmanager create argv | create android | argv contains `--device`; no `--force`; no missing-device hang | planned |
| S32 | Rust | `cargo test` | camera unwired | hardware-qemu.ini without imagefile | `camera_unavailable`; file may still write but verb fails | planned |
| S33 | Rust | `cargo test` | Android boot argv | boot_android | `-camera-front imagefile:` and `-camera-back imagefile:`; `-no-window`; `-gpu host`; even port 5554–5682 | planned |
| S34 | Rust | `cargo test` | already booted / shutdown | simctl error text | boot/shutdown treated as success | planned |

## Scenarios

### S1 — Helper pin is 0.1.48-atmos.1 with Atmos patches

- **Level**: Structural / script
- **Given**: the vendored tree and pin JSON after the bump.
- **When**: pack metadata and `ATMOS-PATCHES.md` are read.
- **Then**: version is `0.1.48-atmos.1`; patches still require loopback, refuse global `--kill`, and Stop posts `atmos:simulator-stop`.
- **Signals**: pin `version`; UPSTREAM tag `@expo/serve-sim@0.1.48`; patch list.

### S2 — simcam stays out of the archive

- **Level**: Structural
- **Given**: `scripts/serve-sim/pack.sh`.
- **When**: staging paths are inspected.
- **Then**: `dist/simcam` is not copied into the tarball layout.
- **Signals**: pack script has no simcam stage (APP-060 omit remains).

### S3 — iOS preview still claims and binds loopback

- **Level**: Rust
- **Given**: fake hooks reporting helper `0.1.48-atmos.1` installed.
- **When**: `start` for an iOS udid.
- **Then**: claim persisted; preview URL loopback; argv has no `--kill`.
- **Signals**: `DeviceClaim.url`; spawn spec host/port.

### S4 — Appearance control is Atmos chrome

- **Level**: Bun
- **Given**: a mocked live claim.
- **When**: Simulator panel renders ready.
- **Then**: Light / Dark is in Atmos chrome, not only inside iframe HTML.
- **Signals**: appearance control test id / text from `features.simulator` messages.

### S5 — Copy is localized, sentence case

- **Level**: Bun
- **Given**: en and zh message files.
- **When**: new keys are asserted.
- **Then**: zh is translated; labels are sentence case; no `npx`.
- **Signals**: JSON keys; no `text-transform: uppercase` on these controls.

### S6 — Appearance maps to simctl / uimode

- **Level**: Rust
- **Given**: booted iOS claim and booted Android claim.
- **When**: `appearance_set` light then dark.
- **Then**: iOS engine sees `light`/`dark`; Android engine sees `no`/`yes` night.
- **Signals**: fake engine call args.

### S7 — Appearance without a claim

- **Level**: Rust
- **Given**: workspace with no live claim.
- **When**: `appearance_set`.
- **Then**: `no_claim`; no host command.
- **Signals**: typed reason; engine call count 0.

### S8 — Appearance while the VM is Shutdown

- **Level**: Rust
- **Given**: claim whose inventory state is Shutdown.
- **When**: `appearance_get`.
- **Then**: `device_not_booted`.
- **Signals**: reason; no simctl ui.

### S9 — Android PNG inject rewrites the imagefile

- **Level**: Rust
- **Given**: Android live claim; wiring true; PNG bytes under 32 MiB.
- **When**: `camera_inject` front with `png_base64`.
- **Then**: `<cameraDir>/<serial>-front.png` is the new PNG (atomic rename); back file unchanged.
- **Signals**: file digest; no qemu restart.

### S10 — iOS camera rejected

- **Level**: Rust
- **Given**: iOS live claim.
- **When**: `camera_inject`.
- **Then**: `unsupported_on_platform` before any file write.
- **Signals**: reason; camera dir unchanged.

### S11 — PNG too large or not PNG

- **Level**: Rust
- **Given**: Android claim, wired.
- **When**: inject 32 MiB+1 buffer, JPEG bytes, or truncated PNG.
- **Then**: error; feed file unchanged.
- **Signals**: processing error; digest unchanged.

### S12 — Camera chrome only on Android claims

- **Level**: Bun
- **Given**: panel with iOS claim vs Android claim.
- **When**: render.
- **Then**: camera control only for Android.
- **Signals**: query by label / test id.

### S13 — Inventory annotates claims and drops physical adb

- **Level**: Rust
- **Given**: iPhone + Pixel AVD + a USB adb serial in the adb fixture.
- **When**: `inventory`.
- **Then**: two (or more) emulator/sim rows; USB serial absent; claimed row has `claimed_by_workspace`.
- **Signals**: device ids; `serial` filter.

### S14 — Relay does not expose inventory actions

- **Level**: Bun
- **Given**: `connectionMode === "relay"`.
- **When**: Simulator tab renders.
- **Then**: needs-this-Mac setup; no Add/Boot buttons enabled.
- **Signals**: existing `not_desktop` reason.

### S15 — Add device does not boot or claim

- **Level**: Rust
- **Given**: installed iOS type+runtime and Android type+image.
- **When**: `create` each.
- **Then**: Shutdown row returned; `running` helpers empty; claims file unchanged.
- **Signals**: `state == Shutdown`; helper spawn count 0.

### S16 — Add device without installed runtime/image

- **Level**: Rust
- **Given**: empty runtime catalog.
- **When**: `create`.
- **Then**: `runtime_missing` or `system_image_missing`.
- **Signals**: reason; no `simctl create` / `avdmanager create`.

### S17 — Duplicate AVD name

- **Level**: Rust
- **Given**: AVD `Pixel_8` exists.
- **When**: create with the same default name.
- **Then**: suffix or exists error; existing AVD not `--force` overwritten.
- **Signals**: engine argv has no `--force` on the original name, or unique new name.

### S18 — Boot unclaimed does not spawn helper

- **Level**: Rust
- **Given**: Shutdown unclaimed iOS udid.
- **When**: `boot`.
- **Then**: engine boot called; no serve-sim spawn.
- **Signals**: spawn count 0; device Booted in fake snapshot.

### S19 — Cannot boot someone else’s claimed device

- **Level**: Rust
- **Given**: B claimed U.
- **When**: A calls `boot` U.
- **Then**: `device_already_claimed`.
- **Signals**: reason; B claim intact.

### S20 — Shut down our preview releases claim without `--kill`

- **Level**: Rust
- **Given**: A has live helper pid P on U.
- **When**: A `shutdown` U.
- **Then**: P SIGTERM; claim gone; engine shutdown U; argv never `--kill`.
- **Signals**: claims.json; kill_pid(P); no kill-all.

### S21 — Shut down refuses foreign claim

- **Level**: Rust
- **Given**: B owns U with helper alive.
- **When**: A `shutdown` U.
- **Then**: `device_already_claimed`; B helper still listed.
- **Signals**: reason; B pid alive.

### S22 — Stop preview does not power off the VM

- **Level**: Rust
- **Given**: live claim.
- **When**: `simulator_stop`.
- **Then**: helper gone; `shutdown_device` not called.
- **Signals**: engine shutdown count 0.

### S23 — Delete unclaimed shuts down then deletes

- **Level**: Rust
- **Given**: unclaimed AVD (Shutdown or Booted).
- **When**: `delete`.
- **Then**: engine shutdown then `avdmanager delete avd --name`; inventory no longer contains it.
- **Signals**: shutdown then delete order; `--name`.

### S24 — Delete refuses a foreign claim

- **Level**: Rust
- **Given**: B owns the device.
- **When**: A `delete`.
- **Then**: `device_already_claimed`; engine delete not called; B helper alive.
- **Signals**: reason; B pid.

### S25 — Preview of Shutdown Android boots once then attaches

- **Level**: Rust
- **Given**: Shutdown AVD, no serial yet.
- **When**: `start` with that udid.
- **Then**: seed placeholder PNGs; one qemu with imagefile + `-no-window`; helper argv `-s emulator-…`; no `--avd` on that spawn.
- **Signals**: boot then spawn order; camera argv; serial attach.

### S26 — Preview remains iframe on the simulator tab

- **Level**: Bun structural
- **Given**: feature sources.
- **When**: panel ready with url.
- **Then**: `iframe` is the live stream; tab id still `simulator`.
- **Signals**: `SimulatorPanel` iframe; no DeviceScreen canvas.

### S27 — Helpers do not implement the catalog

- **Level**: Structural
- **Given**: vendored helper UI and Atmos contract.
- **When**: search for create-AVD / create-simulator product flows.
- **Then**: new create/boot/shutdown WS live in Atmos contract; helper pages are not given a second Add-device product dialog as part of this spec.
- **Signals**: `packages/api-types` `simulator_create`; vendor UI unchanged except 0.1.48 rebase + existing Atmos patches.

### S28 — CLI maps new verbs

- **Level**: Rust / CLI
- **Given**: `apps/cli` simulator command tests.
- **When**: parse `create` / `boot` / `shutdown` / `delete` / `appearance` / `camera`.
- **Then**: invoke action names match TECH table.
- **Signals**: `parse_ws_action` / invoke fixtures.

### S29 — Exploratory chrome

- **Level**: agent-browser
- **Given**: local web Simulator tab (real VM optional).
- **When**: open the tab, inspect inventory and chrome, narrow the viewport.
- **Then**: controls readable; camera hidden without Android claim; no overlay blocking iframe; console clean of WS contract errors.
- **Signals**: screenshots / notes in Coverage Status. Not a pass/fail oracle for claims.

### S30 — Catalog parsers

- **Level**: Rust
- **Given**: fixture stdout for `simctl list runtimes --json`, `avdmanager list device`, `sdkmanager --list_installed`.
- **When**: parse functions run.
- **Then**: iOS available iOS runtimes expose `supportedDeviceTypes`; watchOS dropped; Android profile id is the quoted string; only `system-images;…` packages remain.
- **Signals**: fixture snapshots.

### S31 — Android create always passes `--device`

- **Level**: Rust
- **Given**: profile `pixel_6` and an installed image package.
- **When**: `create_android`.
- **Then**: argv is `create avd --name … --package … --device pixel_6` with no `--force`.
- **Signals**: captured argv.

### S32 — Unwired camera is unavailable

- **Level**: Rust
- **Given**: Android claim; `hardware-qemu.ini` without `hw.camera.front=imagefile:…`.
- **When**: `camera_inject`.
- **Then**: `camera_unavailable`; no fake success.
- **Signals**: reason.

### S33 — Android boot argv is camera-ready and windowless

- **Level**: Rust
- **Given**: free port 5554.
- **When**: `boot_android`.
- **Then**: seed writes both facings; argv contains `-no-window`, `-gpu host`, `-port 5554`, `-camera-front imagefile:…-front.png`, `-camera-back imagefile:…-back.png`.
- **Signals**: argv vector; files exist.

### S34 — Already booted / already shutdown are success

- **Level**: Rust
- **Given**: simctl stderr `current state: Booted` / `current state: Shutdown`.
- **When**: `boot_ios` / `shutdown_ios`.
- **Then**: ok, not `boot_failed` / `shutdown_failed`.
- **Signals**: result.ok.

## Performance & load budgets

- Inventory / probe stay in the same order of magnitude as today’s `simulator_probe` (shell out to `simctl` + `emulator -list-avds`); no extra polling loop in the client beyond refetch on `simulator_devices_changed` and tab focus.
- Camera PNG decode + write capped at 32 MiB; reject above that rather than buffering unbounded on `/ws`.

## Regression checklist

- [ ] iOS iframe Stop still posts `atmos:simulator-stop` and does not `serve-sim --kill`.
- [ ] Device switch in the iframe still posts `atmos:simulator-device` and cannot steal.
- [ ] APP-071 screenshot/tap/swipe/type/press still require a live claim and still work after the 0.1.48 rebase.
- [ ] Two workspaces, two previews: shutdown A does not kill B.
- [ ] `simulator_stop` does not power off the VM (S22).
- [ ] Physical adb still absent from inventory.
- [ ] Relay still cannot start.
- [ ] Pin sha256 filled before a production helper download path is enabled.

## Exploratory agent-browser checks

Use after the first UI pass. Load Agent Browser instructions first (installed skill or `agent-browser skills get core --full`). If missing, `specs/references/agent-browser-setup.md`. Record in Coverage Status; do not treat as the claims/lifecycle oracle.

1. Open the Simulator tab on local web and complete Add-device dialog open/close (even if create is mocked).
2. Narrow viewport: inventory collapse must not hide Appearance on a claimed preview.
3. Trigger a typed error (for example Add with empty runtime if the UI allows) and confirm copy is actionable.
4. Watch console for failed `simulator_*` names or extract-contract mismatches.

## Acceptance criteria

- [ ] All Must Have PRD items have at least one passing scenario at the declared level.
- [ ] No new unconditional REST endpoints.
- [ ] serve-sim pin is `0.1.48-atmos.1` with Atmos patches listed and `simcam` omitted.
- [ ] Create/boot/shutdown/delete live in Atmos service tests, not in helper page tests.
- [ ] `atmos-specs-test-run` has updated Coverage Status, including exact commands and any agent-browser/manual result.
- [ ] `just lint` and scoped `cargo test` / `bun test` for touched crates/apps pass, or a scoped alternative is recorded.

## Manual verification steps

1. Pack and install `0.1.48-atmos.1`; Start iOS preview; Stop; confirm Simulator.app hide still best-effort; confirm a second workspace preview survives.
2. Appearance Light/Dark on iOS and on Android live claims; guest UI changes.
3. Android: Boot from Atmos; inject a small PNG front then back; **reopen** the emulator camera app and confirm the still. Clear restores the placeholder. A helper-only (unwired) boot returns `camera_unavailable`. iOS claim hides the control.
4. Add iOS simulator from an installed type+runtime; Boot; Preview. Shut down. Delete.
5. Add Android AVD from an installed image; Boot from Atmos; Preview (single qemu). From a second workspace, Shut down that AVD is refused.
6. `atmos simulator inventory` / `create` / `appearance get` against the same Computer.

## Non-coverage

- Installing system images / Xcode runtimes from the UI (N2).
- iOS `simcam` (N3).
- Native Device Screen and multi-stream grid (N4, N5).
- Linux / Windows / Intel.
- Live Playwright against Simulator.app / qemu (no harness).

## Coverage Status

_Last run: 2026-09-15 · `cargo test -p core-engine -p core-service` (244 + 640 passed) · `cargo test -p api -- simulator` (5 passed) · `cargo test -p atmos -- simulator` (10 passed) · `bun test apps/web/src/features/simulator` (40 passed)._

- S1 — ✅ `apps/web/src/features/simulator/__tests__/simulator.test.ts` `serve-sim pin 0.1.48 > pins 0.1.48-atmos.1 with Atmos patches and omits simcam from pack` (pin JSON + UPSTREAM `@expo/serve-sim@0.1.48` + ATMOS-PATCHES loopback / no global `--kill` / `atmos:simulator-stop`); start claim.version from the same pin in `crates/core-service/src/service/device_preview/tests.rs::start_ios_claims_loopback_without_kill`
- S2 — ✅ same bun pin test: `scripts/serve-sim/pack.sh` has omit comment only, no `cp` of `dist/simcam`, no `$STAGE/simcam`
- S3 — ✅ `crates/core-service/src/service/device_preview/tests.rs::start_ios_claims_loopback_without_kill` (`DevicePreviewService::start` → persisted `DeviceClaim.url` via `claim_preview_url`, spawn spec + `helper_args` loopback, `args_contain_global_kill` false); `crates/core-service/src/service/device_preview/args.rs::tests::helper_argv_is_loopback_without_kill`
- S4 — ✅ `apps/web/src/features/simulator/__tests__/simulator.test.ts` `device preview chrome and inventory > keeps appearance and android camera on Atmos chrome around the iframe` (`SimulatorAppearanceControl`, `data-atmos-simulator-chrome`, Light/Dark keys)
- S5 — ✅ bun `i18n > uses sentence case and translated zh without npx` and `device preview chrome and inventory > localizes chrome copy in sentence case`
- S6 — ✅ `crates/core-service/src/service/device_preview/control_tests.rs::appearance_maps_ios_light_dark_and_android_uimode`
- S7 — ✅ `control_tests.rs::appearance_without_claim_does_not_run_host`
- S8 — ✅ `control_tests.rs::appearance_while_shutdown_is_device_not_booted`
- S9 — ✅ `control_tests.rs::android_camera_inject_writes_front_feed` (front PNG rewrite, back placeholder, qemu count unchanged)
- S10 — ✅ `control_tests.rs::ios_camera_is_unsupported_before_io`
- S11 — ✅ `control_tests.rs::camera_rejects_oversized_and_non_png`; `crates/core-engine/src/host_devices/camera.rs::tests::rejects_jpeg_truncated_and_oversize_png`
- S12 — ✅ bun chrome test: camera control `platform === "android"` and `if (!show) return null`; panel mounts camera only when `claimedPlatform === "android"`
- S13 — ✅ `tests.rs::inventory_annotates_claims_and_drops_physical_adb` (`DevicePreviewService::inventory` after `parse_adb_devices_l` + `merge_android_devices`); `crates/core-engine/src/host_devices/mod.rs::tests::drops_physical_adb_and_maps_avd_serial`; `tests.rs::probe_annotates_claimed_devices`
- S14 — ✅ bun `lists host devices and gates add/boot when relay is blocked`; `local web vs remote computer > lets loopback Computers start, including hosted web, and blocks relay` (`simulatorHelperReachable("relay") === false`)
- S15 — ✅ `tests.rs::create_does_not_boot_or_claim`
- S16 — ✅ `tests.rs::create_missing_runtime_or_image`
- S17 — ✅ `tests.rs::create_name_collision_suffixes_without_force`
- S18 — ✅ `tests.rs::boot_unclaimed_does_not_spawn_helper`
- S19 — ✅ `tests.rs::boot_foreign_claim_is_refused`
- S20 — ✅ `tests.rs::shutdown_our_claim_stops_helper_without_kill_then_vm`
- S21 — ✅ `tests.rs::shutdown_foreign_claim_is_refused`
- S22 — ✅ `tests.rs::stop_preview_does_not_shutdown_vm` (helper pid killed, claim gone, engine shutdown count 0)
- S23 — ✅ `tests.rs::delete_unclaimed_shuts_down_then_deletes`
- S24 — ✅ `tests.rs::delete_foreign_claim_is_refused`
- S25 — ✅ `tests.rs::start_shutdown_android_boots_once_then_attaches_serial` (one qemu imagefile + `-no-window`, helper `helper_args` `-s emulator-…`, no `--avd`, placeholder feeds)
- S26 — ✅ bun `no custom phone chrome > preview is an iframe and not a canvas shell`; chrome test still asserts `<iframe` / `data-atmos-guest-iframe` / no `DeviceScreen`; `SIMULATOR_TAB_VALUE === "simulator"`
- S27 — ✅ bun `device preview chrome and inventory > keeps create/boot/shutdown on the Atmos contract, not helper pages` (`packages/api-types` `simulator_create`/`boot`/`shutdown`/`delete`/`inventory`; vendor helper UI has none)
- S28 — ✅ `apps/cli/src/commands/simulator.rs::tests::parses_simulator_inventory_and_lifecycle_verbs`; `parses_simulator_appearance_and_camera_verbs`; `apps/api/src/api/cli/invoke.rs::tests::parses_simulator_control_actions`
- S29 — ⏸ not_run: agent-browser exploratory chrome not executed in this slice (no local web session / Agent Browser pass)
- S30 — ✅ `crates/core-engine/src/host_devices/catalog.rs::tests::parses_available_ios_runtimes_and_drops_watch_tv`; `parses_avd_profile_quoted_id_and_skips_blocks_without_id`; `parses_installed_system_images_only`
- S31 — ✅ `crates/core-engine/src/host_devices/lifecycle.rs::tests::create_android_avd_argv_requires_device_and_skips_force`
- S32 — ✅ `control_tests.rs::unwired_camera_is_unavailable`
- S33 — ✅ `lifecycle.rs::tests::boot_android_argv_is_camera_ready_windowless_host_gpu` (`free_emulator_port` 5554, `-no-window`, `-gpu host`, both `imagefile:` facings); S25 service start seeds placeholder PNGs
- S34 — ✅ `tests.rs::already_booted_and_shutdown_are_success`; `lifecycle.rs::tests::ios_already_booted_and_shutdown_helpers`

Exploratory agent-browser — ⏸ not_run (see S29).

Manual live qemu / Simulator.app — ⏸ not_run; recorded in implementer `manual-camera.txt`. Camera/appearance oracles above use fake engine hooks.

Remaining gaps: live 0.1.48 iOS iframe, real appearance, real Android PNG-on-camera, and real create/boot (TEST.md Manual verification steps). `cargo clippy -p core-engine -p core-service --tests -- -D warnings` is red on pre-existing `clippy::never_loop` in `catalog.rs::parse_quoted_device_id` and unrelated `crates/agent` warnings; `cargo fmt --check` on the same packages is clean.
