# PROGRESS · APP-071: Device Preview agent control

> Implementation Progress · current state, handoff notes, blockers, and verification status. This file is not a requirements source.

## Status

- **State**: ready_to_push
- **Branch**: feat/APP-070-simulator-android
- **Last updated**: 2026-09-07
- **Current owner**: lead agent (atmos-long-task-impl)
- **Current phase**: done (production code; scenario TEST.md still for atmos-specs-test-run)

## Snapshot

- Done: S0–S5 production code; per-slice reviews pass; CROSS-A/B pass; S3-rework NO_CLAIM `fix` pass
- Next: commit + push this branch
- Blocked: none
- Must not: parent session writing feature code; MCP / injected Chat tools; vendor helper chrome; auto-boot from tap

## Implementation Checklist

- [x] Core engine helper clients (`device_control`)
- [x] Core service `DeviceControlService` + `simulator_list` ownership join
- [x] API / WebSocket routing + `@atmos/api-types`
- [x] CLI `atmos simulator`
- [x] System skill + manifest
- [x] Web: Agent copy overlay + `/device-preview` chips
- [ ] Tests (handoff to atmos-specs-test-run after production code)
- [x] Cross-review (no P0/P1); push pending

## Slice Kanban

> Orchestration board for `atmos-long-task-impl`. Not a requirements source.

| ID | Wave | Owns | Forbids | Depends | Status | Impl | Review | Verify |
|----|------|------|---------|---------|--------|------|--------|--------|
| S0 | 0 | `crates/core-engine/src/device_control/**`, `crates/core-engine/src/lib.rs` | `crates/core-service/**`, `apps/**`, `packages/**`, `skills/**` | — | done | ok | pass | `cargo test -p core-engine device_control` |
| S1 | 1 | `crates/core-service/src/service/device_preview/**`, `crates/core-service/src/lib.rs` (re-exports only), `crates/core-service/src/error.rs` if new codes required | `apps/**`, `packages/api-types/**`, `crates/core-engine/**` except using public APIs | S0 | done | ok | pass | `cargo test -p core-service device_preview` |
| S2 | 2 | `apps/api/src/api/ws/message.rs`, `apps/api/src/api/ws/router/mod.rs`, `apps/api/src/api/ws/router/simulator.rs`, `apps/api/src/api/cli/invoke.rs`, `apps/api/src/relay/external_events.rs` (ServiceError match only), `crates/core-service/src/error.rs` (DeviceControl mapping only), `packages/api-types` simulator + extract fixtures | `apps/cli/**`, `apps/web/**`, `skills/**`, `crates/core-engine/**`, `crates/core-service/src/service/device_preview/**` | S1 | done | ok | pass | `cargo test -p api` + api-types extract/check/test |
| S3 | 3 | `apps/cli/src/**` | `apps/web/**`, `crates/**`, `skills/**` | S2 | done | ok | pass | `cargo test -p atmos` |
| S4 | 3 | `skills/atmos-device-preview/**`, `skills/system-skills-manifest.json`, `crates/infra/src/utils/system_skill_sync.rs`, `skills/atmos-cli/SKILL.md`, `skills/atmos-desktop-use/SKILL.md` | `apps/**`, `crates/core-*/**` | S2 | done | ok | pass | grep ALL_SYSTEM_SKILL_NAMES + manifest |
| S5 | 3 | `apps/web/src/features/simulator/**`, `apps/web/src/api/ws/simulator-api.ts`, `apps/web/src/shared/lib/ai-context-protocol.ts`, WelcomePage, SlashCommandPopover, TerminalAgentInputOverlay, use-agent-composer-popovers, AgentPromptComposer, en.json, zh.json | `apps/cli/**`, `vendor/**`, `crates/**` | S2 | done | ok | pass | bun tests for prompt + structural grep |

**Status**: `planned` · `ready` · `in_progress` · `blocked` · `in_review` · `rework` · `done`

## Slice Cards

### S0 — core-engine device_control

- **Wave**: 0
- **Goal**: Workspace-free helper I/O: coord validation, PNG write+IHDR size, simctl screenshot, serve-sim CLI spawn, serve-emu loopback HTTP.
- **Out of scope**: claims, workspace_id, WS, CLI, UI, downloading helpers.
- **Owns**: `crates/core-engine/src/device_control/` (new module tree), `crates/core-engine/src/lib.rs` (module + pub use only).
- **Forbids**: `crates/core-service/**`, `apps/**`, `packages/**`, `skills/**`, `vendor/**`, Cargo.toml unless a dep is truly missing (reqwest already present — do not add image crate; parse PNG IHDR).
- **Reads**: TECH APP-071 core-engine section; `crates/core-engine/AGENTS.md`; existing `reqwest` usage.
- **Depends**: —
- **Invariants**:
  - No `workspace_id` in this crate.
  - Coords `0.0..=1.0` or reject.
  - Loopback HTTP only; short timeout; no redirects off `127.0.0.1`.
  - `GET /api/screenshot` prefers `image/png`; if JSON-base64, decode in `serve_emu.rs`.
  - Caller passes serve-sim binary path; do not invent install paths.
  - iOS type: non-ASCII → typed engine error, do not silently strip.
- **Verify**: `cargo test -p core-engine device_control`
- **Review checklist**:
  1. Coord reject outside 0..=1 with no I/O.
  2. Android HTTP host is loopback; tap body `{x,y}`.
  3. iOS tap argv contains `tap`, two floats, `-d udid`.
  4. Screenshot result is filesystem path + width/height, not base64 on the API of this module.
  5. No workspace/claim types imported.

### S1 — DeviceControlService

- **Wave**: 1
- **Goal**: `resolve_target`, verbs, list with project/workspace names, persist claim `name`, tmp PNG dir, never call `start()` from HID.
- **Out of scope**: WS enum, CLI clap, web.
- **Owns**: `crates/core-service/src/service/device_preview/**`, `crates/core-service/src/lib.rs` re-exports, error mapping if `ServiceError` needs codes.
- **Forbids**: `apps/**`, `packages/api-types/**`, editing `crates/core-engine` internals.
- **Depends**: S0
- **Invariants**: TECH `resolve_target`; `NO_CLAIM` does not start; other-workspace udid → `ClaimedByOtherWorkspace`; list DTO has no url/port; PNG dest `~/.atmos/tmp/device-preview/<workspace_id>/`.
- **Verify**: `cargo test -p core-service device_preview`
- **Review checklist**: resolve_target matrix; start() spy count 0; list names joined; iOS back unsupported before spawn.

### S2 — WS + api-types

- **Wave**: 2
- **Goal**: `simulator_list|screenshot|tap|swipe|type|press` WsAction + contract extract; invoke envelope uses `DeviceControlError::code()`.
- **Owns**: `apps/api/src/api/ws/message.rs`, `apps/api/src/api/ws/router/mod.rs`, `apps/api/src/api/ws/router/simulator.rs`, `apps/api/src/api/cli/invoke.rs`, `apps/api/src/relay/external_events.rs` (ServiceError match arm only), `crates/core-service/src/error.rs` (`From<DeviceControlError>` / variant only), `packages/api-types/src/ws/actions.ts`, `packages/api-types/src/ws/dto/simulator.ts`, `packages/api-types/src/ws/contract/simulator.ts`, `packages/api-types/fixtures/actions.server.json` (via extract-actions).
- **Depends**: S1
- **Invariants**: no new REST product route; `dispatch_cli_action` reuses same handlers; error.code uppercase snake (`NO_CLAIM` etc.); list DTO has no url/port; workspace_id required on screenshot/tap/swipe/type/press.
- **Verify**: `cargo test -p api` + extract/check/test `@atmos/api-types`
- **Review checklist**: every new action has WsContract; invoke maps DeviceControl codes not ACTION_FAILED; control service shares the same DevicePreviewService as start/stop; no start() from HID handlers.

### S3 — CLI

- **Wave**: 3 (parallel with S4/S5)
- **Goal**: `atmos simulator` thin invoke client, JSON envelope, no helper HTTP.
- **Owns**: `apps/cli/src/**` as needed for simulator group
- **Forbids**: `crates/**`, `apps/web/**`
- **Depends**: S2
- **Verify**: `cargo test -p atmos`
- **Review checklist**: invoke action names; no port in payload; `--workspace` / sticky context; screenshot path in result.

### S4 — system skill

- **Wave**: 3
- **Goal**: `atmos-device-preview` skill + sync + cross-links.
- **Owns**: skill dir, manifest, `system_skill_sync.rs`, two sibling SKILL.md one-liners.
- **Depends**: S2 (CLI verbs exist in spec; skill can land after S2 even if S3 parallel)
- **Verify**: grep ALL_SYSTEM_SKILL_NAMES + manifest files
- **Review checklist**: list+ask tree; 0..1 coords; no curl/ports; not folded into atmos-cli.

### S5 — web copy + slash chips

- **Wave**: 3
- **Goal**: prompt builder, SimulatorPanel Agent overlay, `/device-preview` on Welcome + Terminal + Agent Chat; AI context kind; i18n.
- **Owns**: `apps/web/src/features/simulator/**`, `apps/web/src/api/ws/simulator-api.ts`, `apps/web/src/shared/lib/ai-context-protocol.ts`, WelcomePage, SlashCommandPopover, TerminalAgentInputOverlay, use-agent-composer-popovers, AgentPromptComposer, en.json, zh.json.
- **Forbids**: `vendor/**`, `apps/cli/**`
- **Depends**: S2 (`simulator_list`)
- **Verify**: bun tests for prompt + structural grep
- **Review checklist**: overlay not in serve-emu; clipboard protocol; Agent Chat not `/cmd:`; prompt has no url/port; sentence case; zh translated.

## Progress Log

### 2026-09-07

- Created kanban; dispatching S0.
- S0 impl ok + review pass (19 `device_control` tests).
- S1 impl ok + review pass (35 `device_preview` tests). `error.rs` left unchanged; S2 will add `ServiceError` mapping so invoke codes are `NO_CLAIM` not `ACTION_FAILED`.
- Dispatching S2.
- S2 impl ok + review pass (`cargo test -p api` 75; api-types extract 315 / check / 23 tests).
- Dispatching Wave 3 parallel S3/S4/S5.
- S3/S4/S5 impl ok + slice reviews pass.
- CROSS-A (stack/wire) pass; CROSS-B (skill/web) pass. P2: generic CLI `fix` on NO_CLAIM vs PRD M2 — reworked in S3-rework (review pass).
- Ready to commit and push.

## Decisions Since TECH

| ID | Decision | Why | Source update |
|----|----------|-----|---------------|
| D1 | CLI `NO_CLAIM` envelope `fix` is “Start the Simulator tab, then retry” (mapped in `commands/simulator.rs`, not global invoke) | PRD M2; CROSS-A P2 | none (behavior matches PRD) |

## Verification Status

| Area | Command / Method | Last result | Notes |
|------|------------------|-------------|-------|
| Rust tests | `cargo test -p core-engine device_control` | pass (19) | S0 |
| Rust tests | `cargo test -p core-service device_preview` | pass (35) | S1 |
| Rust tests | `cargo test -p api` | pass (75) | S2 |
| Rust tests | `cargo test -p atmos` | pass | S3 |
| Rust tests | `cargo test -p infra system_skill` | pass (4) | S4 |
| Web tests | `bun test` simulator + slash-icons + ai-context | pass (40 in CROSS-B) | S5 |
| E2E / manual | live HID | not_run | atmos-specs-test-run |

## Known Blockers

- none

## Handoff Notes

### Task goal

Ship APP-071 M1–M15 production code; cross-review; push if no P0/P1.

### Current progress

S0–S5 done; CROSS-A/B pass; S3-rework pass. Production code ready to push. Scenario TEST.md not executed (handoff to atmos-specs-test-run).

### Next steps

Commit + push `feat/APP-070-simulator-android`. Then atmos-specs-test-run for TEST.md scenarios.
