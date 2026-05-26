# REVIEW · APP-017: Atmos Automations - Implementation Review

> Post-implementation review log for architecture, maintainability, code size, testability, and follow-up fixes. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) -> [PRD](./PRD.md) -> [TECH](./TECH.md) -> [TEST](./TEST.md)); does not replace them.

**Review date**: 2026-05-26  
**Review scope**: non-functional architecture and maintainability review  
**Related code**: `crates/core-service/src/service/automation/`, `apps/web/src/features/automations/`, `resources/terminal-agents/builtin_agents.json`

---

## Review Summary

The APP-017 implementation has the right product and architecture direction: Automations live in the local Atmos Server, metadata stays in SQLite, artifacts stay under `~/.atmos/`, the UI uses WebSocket-first flows, and the built-in terminal agent manifest is shared by Rust and TypeScript.

The main risk is maintainability after the first vertical slice. Several modules now mix orchestration, UI state, rendering, shell generation, and test boundaries in files that are already too large. Before adding more trigger types, retention controls, webhook/event sources, or richer agent adapters, the implementation should be split into smaller ownership units.

---

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-001 | P1 | backend | `AutomationService` is too broad | verified |
| REV-002 | P1 | frontend | `AutomationPage.tsx` is too large | verified |
| REV-003 | P1 | backend | Runner command generation is too stringly | verified |
| REV-004 | P2 | backend | Scheduler and runner dependencies are hard to test | verified |
| REV-005 | P2 | api/frontend | Automation event changes are stringly typed | verified |
| REV-006 | P2 | frontend | Automation event reload flow is duplicated | verified |
| REV-007 | P3 | backend/resources | Built-in agent manifest include path is brittle | verified |

---

## REV-001 · `AutomationService` is too broad

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`AutomationService` currently acts as a broad service object for CRUD, validation, scheduler startup, run orchestration, target resolution, start-failure handling, notifications, event emission, DTO conversion, and tests. The feature works, but the module will be hard to evolve safely as Automations grows.

### Evidence

- `crates/core-service/src/service/automation/mod.rs:333` - `AutomationService` owns several unrelated collaborators and runtime state.
- `crates/core-service/src/service/automation/mod.rs:484` - definition CRUD and run APIs live in the same module.
- `crates/core-service/src/service/automation/mod.rs:794` - run start orchestration is embedded in the main service module.
- `crates/core-service/src/service/automation/mod.rs:1119` - scheduler tick and scheduled start-failure handling are also embedded in the same module.

### Required fix

Split the current module inside `crates/core-service/src/service/automation/` without moving it to another package:

- `service.rs` - public service facade and dependency wiring.
- `lifecycle.rs` or `runner_service.rs` - run creation, start, cancel, completion transitions.
- `scheduler_service.rs` - scheduler tick, due-run claiming, missed-run normalization.
- `target_resolver.rs` - project/workspace/new-workspace/standalone target resolution.
- `validation.rs` - create/update/schedule validation.
- `events.rs` - event DTOs and event emission helpers.

### Acceptance

- [x] `mod.rs` becomes a module index plus small exports, not the primary implementation file.
- [x] No single automation backend source file owns both scheduler tick logic and run lifecycle orchestration.
- [x] Existing verification gates still pass: `cargo check -p core-service`, `cargo check -p api`, and `cargo test -p core-service automation -- --nocapture`.

### Fix log

- 2026-05-26 - Finding recorded after implementation review.
- 2026-05-26 - Split backend implementation into `events.rs`, `lifecycle.rs`, `run_watcher.rs`, `scheduler_service.rs`, `target.rs`, and `validation.rs`; `mod.rs` is now the service facade/DTO conversion surface instead of owning scheduler, run lifecycle, target resolution, and validation.
- 2026-05-26 - Verified with `cargo check -p core-service`, `cargo check -p api`, and `cargo test -p core-service automation -- --nocapture`.

---

## REV-002 · `AutomationPage.tsx` is too large

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`AutomationPage.tsx` is a large page file that mixes data orchestration, routing state, list rendering, detail rendering, setup form, agent picker, environment picker, trigger picker, run history, and artifact preview state. This increases merge conflicts and makes UI changes harder to review.

### Evidence

- `apps/web/src/features/automations/components/AutomationPage.tsx:153` - main page state and effects begin in the same file.
- `apps/web/src/features/automations/components/AutomationPage.tsx:699` - detail panel rendering lives in the same file.
- `apps/web/src/features/automations/components/AutomationPage.tsx:1180` - setup flow and picker components continue in the same file.

### Required fix

Split the page into smaller feature components under `apps/web/src/features/automations/components/`:

- `AutomationPageShell`
- `AutomationListPanel`
- `AutomationDetailPanel`
- `AutomationSetup`
- `AutomationAgentPicker`
- `AutomationEnvironmentPicker`
- `AutomationTriggerPicker`
- `RunHistoryPanel`
- `RunDetailPanel`

Move schedule form helpers into `apps/web/src/features/automations/lib/` and stateful selection/runs logic into focused hooks.

### Acceptance

- [x] `AutomationPage.tsx` only wires the page shell and top-level state.
- [x] Picker components can be reviewed independently.
- [x] `bun --cwd apps/web typecheck` passes.
- [x] Targeted ESLint for touched automation frontend files passes.

### Fix log

- 2026-05-26 - Finding recorded after implementation review.
- 2026-05-26 - Split the page into shell, list, detail, setup, picker, run history, and run detail components; `AutomationPage.tsx` now only wires page state into the shell/setup.
- 2026-05-26 - Verified with `bun --cwd apps/web typecheck` and `bun --cwd apps/web lint src/features/automations`.

---

## REV-003 · Runner command generation is too stringly

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The runner command builder manually assembles a large shell script and appends agent-specific flags as raw command fragments. This is brittle for quoting, prompt delivery, and future agent-specific behavior.

### Evidence

- `crates/core-service/src/service/automation/agents.rs:49` - prompt content is passed through command substitution for non-echo agents.
- `crates/core-service/src/service/automation/agents.rs:305` - runner shell script is assembled in Rust string code.
- `crates/core-service/src/service/automation/agents.rs:410` - agent flags are appended as raw shell fragments.

### Required fix

Keep the shared `resources/terminal-agents/builtin_agents.json` manifest, but make command construction typed:

- Add a `PromptStrategy` enum such as `stdin`, `arg`, `prompt_flag`, and future `file_flag`.
- Add a small runner script/template builder that accepts structured fields instead of raw shell fragments.
- Add snapshot or unit tests for each supported built-in agent command.

### Acceptance

- [x] Prompt delivery strategy is explicit in Rust types and/or manifest schema.
- [x] Command generation tests cover at least the fake supported agent and each built-in automation-supported agent.
- [x] No command builder path requires ad hoc prompt interpolation into a shell string.

### Fix log

- 2026-05-26 - Finding recorded after implementation review.
- 2026-05-26 - Added typed `PromptStrategy`, structured flag parsing, and `RunnerScriptBuilder`; runner prompt delivery no longer uses `$(cat "$PROMPT_FILE")` or raw `cat "$PROMPT_FILE" | ...`.
- 2026-05-26 - Verified by `cargo test -p core-service automation -- --nocapture`, including built-in agent prompt-strategy command tests.

---

## REV-004 · Scheduler and runner dependencies are hard to test

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The scheduler and runner are wired directly through concrete service, tmux, filesystem, notification, and workspace dependencies. This is acceptable for the first vertical slice, but it raises the cost of service-level tests and makes failure-mode coverage harder.

### Evidence

- `crates/core-service/src/service/automation/mod.rs:367` - scheduler task startup is owned directly by `AutomationService`.
- `crates/core-service/src/service/automation/mod.rs:821` - run startup directly coordinates DB, filesystem, terminal, workspace, and notification behavior.

### Required fix

Introduce small testable boundaries without over-abstracting the production design:

- A clock provider for scheduler tests.
- A terminal launcher boundary for tmux runner tests.
- A target resolver boundary for project/workspace/new-workspace resolution.
- A narrow artifact writer boundary if runner artifact behavior keeps growing.

### Acceptance

- [x] Scheduler tests can cover missed-run normalization and due-run claiming without real tmux.
- [x] Runner lifecycle tests can fake terminal launch success/failure.
- [x] `TEST.md` coverage status is updated when scenarios move from pending to covered.

### Fix log

- 2026-05-26 - Finding recorded after implementation review.
- 2026-05-26 - Mitigated by splitting scheduler, lifecycle, target resolution, validation, and run watcher code into separate modules.
- 2026-05-26 - Added a narrow `AutomationTerminalLauncher` boundary around terminal window creation and command dispatch, with fake-launcher unit tests for create/send failure paths; updated `TEST.md` coverage status.
- 2026-05-26 - Verified with `cargo test -p core-service automation -- --nocapture`.

---

## REV-005 · Automation event changes are stringly typed

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | api/frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Automation definition event changes use string values such as `paused_after_start_failure`. This can drift between Rust and TypeScript as more change kinds are added.

### Evidence

- `crates/core-service/src/service/automation/mod.rs:320` - definition update events expose `change` as `String`.
- `apps/web/src/features/automations/types.ts` - frontend keeps a separate union for automation event changes.

### Required fix

Add a Rust enum for automation definition change kinds and serialize it with `snake_case`. Keep database storage string-based if needed, but convert at the service/API boundary.

### Acceptance

- [x] Backend event change kinds are represented by a Rust enum.
- [x] TypeScript event change types match backend serialized names.
- [x] Scheduled start-failure pause still emits the header-visible change.

### Fix log

- 2026-05-26 - Finding recorded after implementation review.
- 2026-05-26 - Added Rust `AutomationDefinitionChange` enum with `snake_case` serialization and TypeScript `AutomationDefinitionChange` union alias.
- 2026-05-26 - Verified with `cargo check -p api` and `bun --cwd apps/web typecheck`.

---

## REV-006 · Automation event reload flow is duplicated

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Frontend event handling currently performs local list mutation and broad reloads in the automation hook, while the page also listens to automation events for selected-run state. This creates redundant WebSocket work and makes state ownership harder to reason about.

### Evidence

- `apps/web/src/features/automations/hooks/use-automations.ts:50` - event subscription mutates local state and calls broad reloads.
- `apps/web/src/features/automations/components/AutomationPage.tsx:277` - page-level event handling also reacts to automation events.

### Required fix

Make one hook/store the owner of automation event consumption. Split list data, selected definition data, and run history refresh paths so run events do not reload agent capabilities or unrelated definitions.

### Acceptance

- [x] One frontend module owns automation event subscription.
- [x] Run events refresh only affected run/definition data.
- [x] Agent capability reloads happen only when explicitly requested or when agent configuration changes.

### Fix log

- 2026-05-26 - Finding recorded after implementation review.
- 2026-05-26 - Moved automation event subscription ownership into `use-automation-page-state.ts`; `use-automations.ts` now owns requests/list mutation helpers, and run events no longer reload agent capabilities.
- 2026-05-26 - Verified with `bun --cwd apps/web typecheck` and `bun --cwd apps/web lint src/features/automations`.

---

## REV-007 · Built-in agent manifest include path is brittle

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P3 |
| **Area** | backend/resources |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The built-in terminal agent manifest is correctly shared from `resources/terminal-agents/builtin_agents.json`, but the Rust include path is a long relative path from the crate source file.

### Evidence

- `crates/core-service/src/service/automation/agents.rs:9` - `include_str!` reaches the repository root through multiple `..` segments.

### Required fix

Keep the manifest in `resources/terminal-agents/`, but centralize the include path through a helper constant, build-time environment, or small resource loader so future crate layout changes do not silently break the path.

### Acceptance

- [x] The manifest is still not duplicated into `packages/shared`.
- [x] Rust and TypeScript still read the same `builtin_agents.json` source.
- [x] `cargo check -p core-service` catches manifest path errors clearly.

### Fix log

- 2026-05-26 - Finding recorded after implementation review.
- 2026-05-26 - Added `terminal_agent_manifest.rs` helper using `CARGO_MANIFEST_DIR`, preserving a single `resources/terminal-agents/builtin_agents.json` source for Rust and TypeScript.
- 2026-05-26 - Verified with `cargo check -p core-service` and `cargo test -p core-service automation -- --nocapture`.
