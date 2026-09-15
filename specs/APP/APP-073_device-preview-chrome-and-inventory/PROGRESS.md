# PROGRESS · APP-073: Device Preview chrome and inventory

> Implementation Progress · current state, handoff notes, blockers, and verification status. This file is not a requirements source.

## Status

- **State**: ready_for_review
- **Branch**: feat/device-preview-chrome-and-inventory
- **Last updated**: 2026-09-15
- **Current owner**: lead agent (atmos-long-task-impl)
- **Current phase**: wave 0 — engine catalogs / camera files / lifecycle argv

## Snapshot

- what is done: APP-073 quartet written; kanban sliced
- what is next: Wave 0 impl (S0) then read-only review
- what is blocked: nothing
- what must not be touched: `PROGRESS.md` (lead only); do not add the third-party product name this spec forbids

## Slice Kanban

> Orchestration board for `atmos-long-task-impl`. Not a requirements source.

| ID | Wave | Owns | Forbids | Depends | Status | Impl | Review | Verify |
|----|------|------|---------|---------|--------|------|--------|--------|
| S0 | 0 | `crates/core-engine/src/host_devices/**`, `crates/core-engine/src/lib.rs`, `crates/core-engine/AGENTS.md`, `crates/runtime-manager/src/layout.rs`, `crates/runtime-manager/src/lib.rs`, `agents/references/runtime/atmos-home-layout.md` | `crates/core-service/**`, `apps/**`, `packages/**`, `vendor/**` | — | done | ok | pass | `cargo test -p core-engine host_devices -- --nocapture` |
| S1 | 1 | `crates/core-service/src/service/device_preview/**`, `crates/core-service/src/lib.rs`, `crates/core-service/AGENTS.md`, `crates/core-engine/src/device_control/**` | `vendor/**`, `apps/**`, `packages/api-types/**`, pin JSON | S0 | done | ok | pass | `cargo test -p core-service device_preview -- --nocapture` |
| S2 | 1 | `vendor/serve-sim/**`, `scripts/serve-sim/**`, `crates/core-service/pins/serve-sim-requirement.json` | `crates/core-engine/**`, `apps/**`, `packages/**` | — | done | ok | pass | pin version + pack.sh omits simcam + ATMOS-PATCHES behaviors present |
| S3 | 2 | `apps/api/src/api/ws/router/simulator.rs`, `apps/api/src/api/ws/router/mod.rs`, `apps/api/src/api/ws/message.rs`, `apps/api/src/api/cli/invoke.rs`, `packages/api-types/src/ws/**`, `packages/api-types/fixtures/**`, `apps/cli/src/commands/simulator.rs`, `apps/web/src/api/ws/simulator-api.ts` | `vendor/**`, `apps/web/src/features/**`, `apps/web/messages/**` | S1 | done | ok | pass | extract-actions + cargo test api/cli |
| S4 | 3 | `apps/web/src/features/simulator/**`, `apps/web/messages/en.json`, `apps/web/messages/zh.json` | `crates/**`, `vendor/**`, `packages/api-types/**` | S3 | done | ok | pass | `bun test apps/web/src/features/simulator` |

**Status**: `planned` · `ready` · `in_progress` · `blocked` · `in_review` · `rework` · `done`

## Slice Cards

### S0 — Engine catalogs, camera files, lifecycle argv

- **Wave**: 0
- **Goal**: Pure `host_devices` capabilities: parse catalogs, build create/boot/shutdown/delete argv, Android camera `imagefile:` files (seed / atomic write / PNG validate / wiring parse), free emulator port. `simulator_camera_dir()` in runtime-manager.
- **Out of scope**: claims, WS, UI, helper spawn, serve-sim rebase, appearance (simctl/adb wrappers can live here as argv+parse if cheap; DeviceControlService wiring is S1)
- **Owns**:
  - `crates/core-engine/src/host_devices/**`
  - `crates/core-engine/src/lib.rs`
  - `crates/core-engine/AGENTS.md`
  - `crates/runtime-manager/src/layout.rs`
  - `crates/runtime-manager/src/lib.rs`
  - `agents/references/runtime/atmos-home-layout.md`
- **Forbids**: `crates/core-service/**`, `apps/**`, `packages/**`, `vendor/**`
- **Reads (read-only)**: APP-073 TECH Host command contract; existing `host_devices/mod.rs`; `device_control/`
- **Depends**: —
- **Invariants** (copied from TECH):
  - No `workspace_id` in engine.
  - iOS runtimes from `simctl list runtimes --json`; keep `isAvailable` and iOS only; types from `supportedDeviceTypes`.
  - Android profiles from `avdmanager list device` quoted id; images from `sdkmanager --list_installed` `system-images;…`.
  - Android create argv **must** include `--device` and must **not** include `--force`.
  - AVD name `^[A-Za-z0-9._-]+$`.
  - Android boot argv: `-avd -no-audio -no-window -gpu host -no-boot-anim -port` plus `-camera-front imagefile:` and `-camera-back imagefile:`.
  - Port range even 5554..=5682.
  - Camera files `<dir>/<serial>-front.png` / `-back.png`; atomic tmp+rename; PNG max 32 MiB; signature + IHDR + IDAT + IEND.
  - Wiring: `hardware-qemu.ini` both `hw.camera.front/back=imagefile:<path>`.
  - iOS already-booted / already-shutdown stderr is success.
  - Tests never spawn qemu; fixtures over bytes/stdout.
  - Do not add the third-party product name this spec forbids.
- **Verify**: `cargo test -p core-engine host_devices` and `cargo test -p runtime-manager layout`
- **Review checklist**:
  1. Catalog parsers match TECH (iOS nested types; Android quoted profile id; system-images only).
  2. `buildCreateAvdArgs` has `--device` and no `--force`.
  3. Android boot argv has both imagefile cameras, `-no-window`, `-gpu host`, even port.
  4. PNG validator rejects jpeg/truncated/>32MiB; atomic write never leaves `.tmp`.
  5. Wiring parse requires both facings; no workspace/claim types in engine.
- **HUMAN open questions**: none

### S1 — Service policy + appearance/camera control

- **Wave**: 1
- **Goal**: `DevicePreviewService` inventory/create/boot/shutdown/delete + claim policy; `start` Atmos-boots Android then serve-emu `-s serial`; `DeviceControlService` appearance + camera inject/clear with `no_claim` / `unsupported_on_platform` / `camera_unavailable`.
- **Out of scope**: WS router, CLI, web, vendor pin
- **Owns**: `crates/core-service/src/service/device_preview/**`, `crates/core-service/src/lib.rs`, `crates/core-service/AGENTS.md`, `crates/core-engine/src/device_control/**` (appearance helpers only if not already in host_devices)
- **Forbids**: `vendor/**`, `apps/**`, `packages/api-types/**`, `crates/core-service/pins/serve-sim-requirement.json`
- **Depends**: S0
- **Invariants**: never steal; create does not auto-boot/claim; stop preview does not shutdown VM; delete foreign claim refused; camera iOS → `unsupported_on_platform`; unwired → `camera_unavailable`; helper argv attach uses `-s` after Atmos boot
- **Verify**: `cargo test -p core-service device_preview`
- **Review checklist**:
  1. Foreign claim boot/shutdown/delete → `device_already_claimed`.
  2. `simulator_stop` does not call engine shutdown.
  3. Android `start` on Shutdown: boot then helper `-s`, not `--avd`.
  4. Appearance maps light/dark to simctl / uimode yes|no.
  5. Camera inject requires live claim + wiring.
- **HUMAN open questions**: none

### S2 — serve-sim 0.1.48-atmos.1 rebase

- **Wave**: 1
- **Goal**: Vendor pin `@expo/serve-sim@0.1.48` as `0.1.48-atmos.1`; rebase ATMOS-PATCHES; pack omits simcam.
- **Owns**: `vendor/serve-sim/**`, `scripts/serve-sim/**`, `crates/core-service/pins/serve-sim-requirement.json`
- **Forbids**: engine/service logic, apps, api-types
- **Depends**: —
- **Invariants**: loopback; no global `--kill`; Stop posts `atmos:simulator-stop`; device posts `atmos:simulator-device`; no simcam in pack.sh; no forbidden product-name strings
- **Verify**: pin JSON version; `rg simcam scripts/serve-sim/pack.sh` empty copy; ATMOS-PATCHES lists 8 behaviors
- **Review checklist**:
  1. Pin version `0.1.48-atmos.1`.
  2. ATMOS-PATCHES still requires loopback and no `--kill`.
  3. pack.sh does not stage `dist/simcam`.
- **HUMAN open questions**: none

### S3 — WS + api-types + CLI

- **Wave**: 2
- **Goal**: New `simulator_*` actions, contract extract, CLI invoke wrappers, web `simulator-api.ts` wrappers only.
- **Owns**: listed in kanban
- **Depends**: S1
- **Invariants**: WebSocket only; `simulator_list` remains live claims; camera exactly one of path/png_base64; 32 MiB cap at service already
- **Verify**: extract-actions/check-actions; CLI parse tests
- **Review checklist**:
  1. Every new action has WsContract row.
  2. CLI maps to same wire names as TECH table.
  3. `simulator_list` not overloaded as inventory.
- **HUMAN open questions**: none

### S4 — Web chrome + i18n

- **Wave**: 3
- **Goal**: Inventory panel, add dialog, appearance, Android camera chrome; iframe stays; en+zh sentence case; relay blocked.
- **Owns**: listed in kanban
- **Depends**: S3
- **Invariants**: camera control hidden on iOS claim; no success toasts; no ALL CAPS; iframe is live stream
- **Verify**: `bun test` simulator feature
- **Review checklist**:
  1. Appearance visible on mocked claim.
  2. Camera only when platform android.
  3. Relay still needs-this-Mac.
  4. zh translated, sentence case.
- **HUMAN open questions**: none

## Implementation Checklist

- [ ] Core engine catalogs/camera/lifecycle
- [ ] Core service logic + claims
- [ ] serve-sim pin
- [ ] API / WebSocket / CLI
- [ ] Web UI + i18n
- [ ] TEST.md automated scenarios
- [ ] PR + babysit

## Progress Log

### 2026-09-15

- Kanban written; Wave 0 ready to dispatch.

## Decisions Since TECH

| ID | Decision | Why | Source update |
|----|----------|-----|---------------|
| — | none yet | — | — |

## Verification Status

| Area | Command / Method | Last result | Notes |
|------|------------------|-------------|-------|
| Rust tests | `cargo test -p core-engine -p core-service` | not_run | |
| Web tests | `bun test` simulator | not_run | |
| Forbidden strings | worktree grep for the forbidden product name | pending clippy + vendor comment strip | |
| PR | `gh pr create` | not_run | merge=false |

## Known Blockers

- [ ] none

## Handoff Notes

### Task goal

Ship APP-073: helper pin, Atmos appearance/camera chrome, Computer device inventory.

### Current progress

Wave 0 ready.

### Next steps

Dispatch S0 impl subagent.

### Relevant files/symbols

See slice Owns.
