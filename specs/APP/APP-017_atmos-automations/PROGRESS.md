# PROGRESS · APP-017: Atmos Automations

> Implementation Progress · current state, handoff notes, blockers, and verification status. This file is not a requirements source.

## Status

- **State**: implemented_pending_manual_release_checks
- **Branch**: TBD
- **Last updated**: 2026-05-26
- **Current owner**: Implementation agent
- **Current phase**: local_m1_complete

## Snapshot

- Planning docs are complete through `TEST.md`.
- M1 implementation is in place across persistence, runner, scheduler, recovery, WebSocket API, workspace labeling, notification settings, and the Automations management UI.
- Automated coverage covers schedule parsing, wrapper/run status utilities, compile/typecheck gates, WS smoke, HTTP page smoke, and a local fake-agent standalone manual run through tmux.
- Manual release checks remain for native Desktop notifications, push-server delivery, remote Computer behavior, and one real installed terminal-agent CLI.
- Requirements remain in `PRD.md`; architecture remains in `TECH.md`; verification contract remains in `TEST.md`.

## Implementation Checklist

- [x] Infra migration/entities/repos for `automation` and `automation_run`
- [x] Core service types, validation, artifact helpers, and automation agent resolver
- [x] Scheduler with no-catch-up behavior and same-automation re-entry protection
- [x] Runner with per-run **Automations** terminal window, fake-agent test support, `run.json` status, and minimal artifacts
- [x] Startup recovery from small `run.json` files and tmux window checks
- [x] Workspace integration for `create_source = "automation"`
- [x] Notification settings and automation outcome notifications
- [x] WebSocket actions/events and API routing
- [x] Web Automations page, setup flow, run history/detail, and settings UI
- [x] Automated tests from `TEST.md`
- [ ] Manual verification for desktop notifications, push server, remote Computer, and one real terminal-agent CLI

## Progress Log

### 2026-05-26

- Completed BRAINSTORM, PRD, TECH, and TEST planning.
- Added this progress file before implementation starts.
- Verified APP-017 specs do not contain explicit external reference-source wording.
- Added `automation` and `automation_run` SQLite migration, entities, and repository.
- Added `AutomationService` CRUD/list/detail, validation, artifact helpers, schedule preview, agent capabilities, and event broadcast skeleton.
- Wired automation WebSocket actions/events through `apps/api` without adding REST.
- Added a thin web Automations route, Management Center item, document title, global-search item, and list page backed by WS.
- Verified `cargo check -p infra`, `cargo check -p core-service`, `cargo check -p api`, and `bun --cwd apps/web typecheck`.
- Added tmux-safe automation runner, command wrapper, `run.json` watcher, cancellation, startup recovery, and scheduled tick loop.
- Added trusted automation workspace creation path and visible `automation` workspace labels.
- Added notification settings for automation outcomes and optional push forwarding.
- Replaced thin Automations page with create/edit setup, run history/detail, run controls, and artifact viewing.
- Added targeted Rust tests for schedule parsing, no-catch-up next-run calculation, wrapper artifacts, and terminal status parsing.
- Verified local fake-agent standalone manual run through WebSocket: create automation, run now, status `completed`, artifact fetch for `final.md` and `run.json`.
- Updated schedule computation to interpret cron expressions in each automation's configured timezone and store UTC `next_run_at`; added coverage for `Asia/Shanghai`.
- Tightened agent capability detection on Unix so supported agents must have an executable bit, not just an existing file path.
- Replaced the separate automation agent catalog with a resolver that consumes the existing shared terminal agent definitions and `~/.atmos/agent/terminal_code_agent.json` overrides/custom agents.
- Consolidated core-service automation implementation under `crates/core-service/src/service/automation/` instead of flat `service/automation_*.rs` modules.
- Moved built-in terminal agent defaults out of `packages/shared` into the neutral repo-level `resources/terminal-agents/builtin_agents.json` manifest; web and core-service both consume that manifest.

## Decisions Since TECH

| ID | Decision | Why | Source update |
|----|----------|-----|---------------|
| D1 | Manual runner and scheduler paths now execute real runs instead of returning the earlier implementation placeholder. | The tmux runner, watcher, and scheduler are implemented. | No TECH change required. |
| D2 | Scheduler uses due-list plus `next_run_at` advancement and an in-process start lock instead of a transactional `claim_due_schedules` helper. | This matches the simpler M1 concurrency rule: same automation does not re-enter; different automations do not mutually exclude. | Updated `TECH.md` Scheduler section. |
| D3 | Built-in terminal agent definitions are shared between the existing Agent Select UI and the automation resolver; automation only adds prompt-file/stdin wrapping and capability checks. | Avoids maintaining two copies of agent commands/flags when third-party CLIs change. | Updated `TECH.md` Automation agent resolver section. |

## Verification Status

| Area | Command / Method | Last result | Notes |
|------|------------------|-------------|-------|
| Rust check | `cargo check -p infra` | pass | Migration/entities/repo compile. |
| Rust check | `cargo check -p core-service` | pass | Service DTOs/resolver/schedule/artifacts compile. |
| Rust check | `cargo check -p api` | pass | WS action routing and service wiring compile. |
| Rust tests | `cargo test -p core-service automation -- --nocapture` | pass | 12 automation-focused unit tests. |
| Web typecheck | `bun --cwd apps/web typecheck` | pass | Route/page/action union and frontend terminal-agent manifest adapter compile. |
| Web lint | `bun --cwd apps/web eslint src/features/agent/lib/terminal-agent-definitions.ts src/features/wiki/components/AgentSelect.tsx src/features/automations/components/AutomationPage.tsx src/features/automations/hooks/use-automations.ts src/features/automations/types.ts` | pass | APP-017 frontend files and Agent Select source reuse. |
| Diff hygiene | `git diff --check` | pass | No whitespace errors. |
| Full lint | `cargo clippy -p core-service -- -D warnings`; `bun --cwd apps/web lint` | blocked by pre-existing unrelated findings | New APP-017 lint findings were fixed; full commands still fail outside APP-017 touched logic. |
| WS smoke | Bun WebSocket script against `ws://127.0.0.1:30319/ws` | pass | `automation_list`, `automation_agent_capabilities`, create/run/artifact flow. |
| HTTP smoke | `curl http://127.0.0.1:3032/automations` | pass | Page renders title and route payload after Next compile. |

## Known Blockers

- [ ] Add full service/E2E harness coverage for project/workspace/new-workspace targets, cancellation, notifications, and recovery.

## Handoff Notes

> Follow [`agents/references/compact-instructions.md`](../../../agents/references/compact-instructions.md). Keep this section compact, current, and implementation-oriented.

### Task goal

Implement APP-017 Atmos Automations as local-per-Computer scheduled/manual terminal-agent runs with durable SQLite metadata, local file artifacts, per-run **Automations** terminal windows, WebSocket-first management, and Desktop/Web plus optional push notifications.

### Current progress

Planning is complete through `TEST.md`. M1 implementation is in place and verified with targeted tests plus a local fake-agent standalone run through tmux.

### Completed work

- `BRAINSTORM.md`, `PRD.md`, `TECH.md`, and `TEST.md` are written.
- `PROGRESS.md` is initialized for implementation handoff.
- APP-017 docs have been checked for explicit external reference-source wording.
- `crates/infra` migration/entities/repo exist for automation metadata and runs.
- `crates/core-service` exposes `AutomationService` plus schedule/artifact/automation agent resolver helpers.
- `crates/core-service` runs automations through tmux windows, writes minimal artifacts, watches `run.json`, recovers running rows, and starts scheduled due runs.
- `apps/api` accepts automation WS management actions, starts scheduler/recovery on startup, and forwards service events.
- `apps/web` has `/automations` route, Management Center navigation, setup flow, run history/detail, controls, and artifact viewing.
- Notification settings include automation outcomes and optional push forwarding.

### Key decisions

- Different automations may run concurrently, even against the same Project/Workspace.
- The same automation must not re-enter while it has a `running` run.
- Run statuses are only `running`, `completed`, `failed`, `cancelled`, and `interrupted`.
- M1 writes only `prompt.md`, `output.log`, `final.md`, and `run.json`.
- `run.json` is a small fixed-schema status file and is read fully during startup recovery.
- Missed schedule ticks while Atmos Server is offline/asleep are not backfilled.
- Automation reuses the same built-in terminal agent definitions as Agent Select, plus existing `terminal_code_agent.json` overrides/custom agents.

### Constraints

- Start implementation from `TECH.md`, not from this file.
- Use `TEST.md` as the verification contract when adding tests.
- Keep automation CRUD/run control on WebSocket; do not add duplicate REST endpoints.
- Do not store prompt, output, or model result bodies in SQLite.
- Do not reintroduce explicit external reference-source wording into APP-017 docs.

### Open issues

- Manual release checks remain for Desktop notification display, real push server delivery, remote Computer ownership, and one real terminal-agent CLI.
- Full service/E2E harness coverage remains pending beyond the targeted M1 unit tests and local fake-agent smoke.

### Next steps

1. Add deeper service/E2E tests for project/workspace/new-workspace target runs, cancellation, startup recovery, and notification gating.
2. Run manual release checks on macOS Desktop, a real push server, a real remote Computer, and one real installed terminal-agent CLI.
3. Consider retention controls/templates/richer custom-agent automation controls in later phases.

### Relevant files/symbols

- `specs/APP/APP-017_atmos-automations/TECH.md`
- `specs/APP/APP-017_atmos-automations/TEST.md`
- `crates/infra/src/db/migration/mod.rs`
- `crates/infra/src/db/entities/workspace.rs`
- `crates/infra/src/db/repo/workspace_repo.rs`
- `crates/infra/src/db/repo/automation_repo.rs`
- `crates/core-service/src/service/automation/mod.rs`
- `crates/core-service/src/service/automation/agents.rs`
- `crates/core-service/src/service/automation/artifacts.rs`
- `crates/core-service/src/service/automation/runner.rs`
- `crates/core-service/src/service/automation/scheduler.rs`
- `crates/core-service/src/service/terminal.rs`
- `crates/core-service/src/service/notification.rs`
- `apps/api/src/api/ws/message.rs`
- `apps/api/src/api/ws/router/mod.rs`
- `apps/api/src/api/ws/router/automation.rs`
- `apps/api/src/api/ws/terminal_handler.rs`
- `apps/web/src/app-shell/LeftSidebarManagementCenter.tsx`
- `apps/web/src/features/automations/components/AutomationPage.tsx`
- `apps/web/src/features/welcome/components/PromptComposer.tsx`

## Changed Areas

- `crates/infra`: completed for rollout step 1
- `crates/core-service`: implemented for M1
- `crates/core-engine`: implemented small tmux helpers
- `apps/api`: implemented WS actions, events, scheduler startup
- `apps/web`: implemented management UI and notification settings
- `packages/ui`: not_started
