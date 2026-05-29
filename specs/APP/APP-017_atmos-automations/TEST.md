# TEST · APP-017: Atmos Automations

> Test Plan · how we verify local-per-Computer scheduled terminal-agent automations. References PRD APP-017 and TECH APP-017.

## Test strategy

APP-017 spans persistence, scheduler logic, terminal execution, WebSocket transport, and a new management UI. The test plan uses the cheapest level that proves each behavior, with fake terminal-agent CLIs for automation runner tests so the suite does not depend on any real external agent provider.

- **Rust unit / integration**: SQLite migrations/repositories, schedule parsing, no-catch-up behavior, run recovery from `run.json`, artifact path safety, agent command resolution/wrapping, and workspace `create_source = "automation"` mapping.
- **Service-level**: `AutomationService` with temp SQLite + temp `HOME` + fake agent executable in `PATH`; tmux runner tests may use a tmux integration harness or a thin `TmuxEngine` test double.
- **End-to-end**: Playwright against local API/Web for Management Center navigation, creation flow, run controls, run history, artifact opening, and live WS updates.
- **Manual-only**: real OS desktop notifications, real push-server delivery, real remote VPS Computer, and real third-party terminal-agent CLI smoke tests. Automated coverage uses local doubles because these paths depend on host OS services, network credentials, or user-installed binaries.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 · Management entry | S1, S2 |
| M2 · Creation flow | S3, S4 |
| M3 · Instructions composer | S3, S4, S31, S32 |
| M4 · Agent selection | S5, S6 |
| M5 · Trigger configuration | S7, S8, S20 |
| M6 · Local-per-Computer ownership | S9, S25 |
| M7 · Metadata persistence | S9, S10, S18 |
| M8 · Artifact persistence | S11, S12, S16 |
| M9 · Terminal execution | S11, S15, S19 |
| M10 · File-based result | S11, S12, S16, S22 |
| M11 · Run environments | S11, S13, S14, S15, S17 |
| M12 · Automation-created workspaces | S17, S18 |
| M13 · Run history | S12, S16, S21, S22, S30 |
| M14 · Run controls | S19, S20, S23, S30 |
| M15 · Notifications | S24, S25, S30 |
| M16 · Remote Computer behavior | S26, S27 |
| N1-N5 | Deferred; see Non-coverage |

## Coverage Status

_Last run: 2026-05-26._

- S7/S8/S21 — covered by `crates/core-service/src/service/automation/scheduler.rs` unit tests, including configured timezone conversion; `cargo test -p core-service automation -- --nocapture` passed with 19 automation tests.
- S5/S11/S22/S24 — partially covered by `automation/agents.rs`, `automation/runner.rs`, and `automation/lifecycle.rs` unit tests plus a local fake supported-agent WS smoke run that created a standalone automation, ran it through tmux, wrote `prompt.md`, `output.log`, `final.md`, `run.json`, and reached `completed`.
- S1/S2 — smoke-covered by `bun --cwd apps/web typecheck` and HTTP render of `http://127.0.0.1:3032/automations`; full browser E2E remains pending because no Playwright harness is installed.
- S3-S6, S9-S20, S23, S25-S30 — pending fuller service/E2E harness coverage; manual/fake-agent smoke covered the main standalone happy path only.

## Scenarios

### S1 — Management Center opens Automations

- **Level**: E2E (Playwright)
- **Given**: the app shell is connected to an Atmos Server.
- **When**: the user opens Management Center and chooses **Automations**.
- **Then**: the route changes to `/automations`, the Automations page renders, and no REST request is made for automation list data.
- **Signals**: active Management Center item, URL route, WS `automation_list` request observed.

### S2 — Automations empty state is usable

- **Level**: E2E (Playwright)
- **Given**: SQLite has no `automation` rows.
- **When**: the user opens `/automations`.
- **Then**: the page shows an empty state with a create action, and no run-history or artifact errors are shown.
- **Signals**: empty state visible, create action enabled, browser console has no unhandled WS errors.

### S3 — Create automation with composer instructions

- **Level**: E2E (Playwright) + service-level
- **Given**: one Project exists and a supported fake terminal agent is installed.
- **When**: the user opens the Automations setup UI, enters a display name, writes Agent Instructions in the composer, selects the Project, selects the agent, chooses a daily trigger, and submits.
- **Then**: an automation definition is created, `instructions.md` is written under `~/.atmos/automations/definitions/{automation_guid}/`, and the list shows the display name and next scheduled run.
- **Signals**: WS `automation_create` success, SQLite `automation` row, `instructions_path` exists, list row visible.

### S4 — Create validation rejects missing required fields

- **Level**: E2E (Playwright) + service-level
- **Given**: the setup UI is open.
- **When**: the user submits without a display name or without Agent Instructions.
- **Then**: the UI blocks submission or the service returns a validation error; no SQLite row and no definition directory are created.
- **Signals**: validation message, failed `automation_create` response, automation count unchanged, no new definition folder.

### S5 — Supported agents are selectable

- **Level**: Service-level + component test
- **Given**: `PATH` contains a fake agent executable with configured non-interactive flags.
- **When**: the UI requests `automation_agent_capabilities`.
- **Then**: the agent appears selectable with `automation_supported = true`.
- **Signals**: WS response capability row, enabled agent select item.

### S6 — Unsupported agents are disabled with a reason

- **Level**: Service-level + component test
- **Given**: a known agent executable is missing or has no configured non-interactive flags.
- **When**: the UI requests `automation_agent_capabilities`.
- **Then**: the agent is unavailable, displays a reason, and `automation_create` rejects that `agent_id`.
- **Signals**: `automation_supported = false`, disabled select item, service validation error.

### S7 — Scheduled presets generate the expected next run

- **Level**: Rust unit / integration
- **Given**: a fixed timezone and frozen clock.
- **When**: schedule preview is requested for hourly, daily, weekly, and monthly presets.
- **Then**: each preview returns the next expected future timestamps and stores the same normalized schedule in SQLite on create.
- **Signals**: `automation_schedule_preview` response, persisted `schedule_kind`, `schedule_expr`, `schedule_timezone`, `next_run_at`.

### S8 — Invalid custom cron is rejected

- **Level**: Rust unit / service-level
- **Given**: the user enters an invalid five-field cron expression.
- **When**: the UI requests schedule preview or submits the automation.
- **Then**: validation fails with a recoverable message and no automation definition is persisted.
- **Signals**: failed `automation_schedule_preview` or `automation_create`, no SQLite row, error copy visible.

### S9 — Definitions are local to the current Computer

- **Level**: Service-level
- **Given**: two isolated Atmos Server test environments with different temp SQLite DBs and different temp `HOME` directories.
- **When**: an automation is created in environment A.
- **Then**: environment A lists it and environment B does not.
- **Signals**: DB row only in A, definition files only under A's temp `~/.atmos/`, `automation_list` on B returns empty.

### S10 — Definitions persist across server restart

- **Level**: Service-level
- **Given**: an automation definition exists in SQLite and `instructions.md` exists on disk.
- **When**: services are reconstructed against the same DB and HOME.
- **Then**: `automation_list` and `automation_get` return the same definition and next run.
- **Signals**: same automation GUID in WS response, same `instructions_path`, unchanged `next_run_at`.

### S11 — Standalone manual run writes minimal artifacts

- **Level**: Service-level with fake agent + tmux runner harness
- **Given**: a standalone automation and a fake agent that exits `0` and writes a final message.
- **When**: the user invokes `automation_run_now`.
- **Then**: the runner creates `~/.atmos/automations/runs/{date-time}/{automation-guid}/`, writes `prompt.md`, `output.log`, `final.md`, and `run.json`, and marks the run `completed`.
- **Signals**: artifact files exist, `run.json.status = "completed"`, SQLite `automation_run.status = completed`, `final.md` content matches fake agent output.

### S12 — Failed run preserves output and status

- **Level**: Service-level with fake agent
- **Given**: a standalone automation and a fake agent that exits non-zero after writing output.
- **When**: the user invokes `automation_run_now`.
- **Then**: the run becomes `failed`, `output.log` and `run.json` are preserved, and run history shows the failed outcome.
- **Signals**: SQLite run status `failed`, `run.json.exit_code != 0`, run history row visible, artifact get returns output.

### S13 — Project target run uses Project cwd

- **Level**: Service-level
- **Given**: an automation targeting a Project and a fake agent that records its current working directory.
- **When**: the automation runs.
- **Then**: the fake agent runs from the Project path and artifacts still live under `~/.atmos/automations/runs/...`.
- **Signals**: fake agent cwd output, `automation_run.cwd`, artifact directory under HOME.

### S14 — Existing Workspace target run uses Workspace cwd

- **Level**: Service-level
- **Given**: an automation targeting an existing Workspace worktree and a fake agent that records its current working directory.
- **When**: the automation runs.
- **Then**: the fake agent runs from the Workspace worktree path.
- **Signals**: fake agent cwd output equals resolved workspace path, run row `workspace_guid`.

### S15 — Invalid target combinations are rejected

- **Level**: Service-level
- **Given**: create requests with missing `project_guid` for Project target, missing `workspace_guid` for Workspace target, or both project/workspace for Standalone target.
- **When**: `automation_create` is called.
- **Then**: each request is rejected before any definition files or DB rows are created.
- **Signals**: validation errors, DB unchanged, no new files under `~/.atmos/automations/definitions`.

### S16 — Run detail opens final output and output log

- **Level**: E2E (Playwright) + service-level
- **Given**: an automation has one completed run with `final.md` and `output.log`.
- **When**: the user opens run detail and chooses the result or output artifact.
- **Then**: the UI fetches the requested artifact through WS and can invoke `app_open` for local OS opening.
- **Signals**: `automation_run_get`, `automation_artifact_get`, and `app_open` WS requests; artifact content visible or open action success.

### S17 — New Workspace per run marks create source

- **Level**: Service-level + E2E smoke
- **Given**: an automation targets `new_workspace` for a Project.
- **When**: the automation runs.
- **Then**: a Workspace is created with `create_source = "automation"`, default display name equal to the automation display name, and the run row stores `created_workspace_guid`.
- **Signals**: `workspace` DB row, `automation_run.created_workspace_guid`, workspace card data includes `createSource: "automation"`.

### S18 — Automation-created Workspace shows icon label

- **Level**: Component test + E2E smoke
- **Given**: the workspace list includes one workspace with `createSource = "automation"`.
- **When**: workspace surfaces render.
- **Then**: the workspace card/list row shows the automation icon label and is not filtered out like `issue_only`.
- **Signals**: visible icon label, workspace appears in normal workspace list.

### S31 — Automations composer keeps file mentions but hides GitHub mentions

- **Level**: Frontend integration
- **Given**: the APP-017 create/edit setup composer is open.
- **When**: the user types `@` while a Project or Workspace target is selected.
- **Then**: the mention popover offers file results from that target context, but no GitHub issue/PR suggestions are shown in the Automations setup flow.
- **Signals**: `WelcomeMentionPopover` renders a Files section only; issue/PR items are absent.

### S32 — Slash skills follow the selected Project or Workspace

- **Level**: Frontend unit / integration
- **Given**: the local skill list contains one global skill, one Project A skill, and one Project B skill.
- **When**: the user opens the setup composer slash menu while targeting Project A, then switches to a Workspace that belongs to Project B, then switches to Standalone.
- **Then**: the slash menu shows global + Project A skill first, then global + Project B skill after the workspace switch, then only the global skill for Standalone.
- **Signals**: filtered slash-skill ids update immediately after each environment change; unrelated project-scoped skills are absent.

### S19 — Different automations can run concurrently

- **Level**: Service-level with fake long-running agents
- **Given**: two different automations target the same Workspace and each fake agent sleeps before completing.
- **When**: both are triggered at nearly the same time.
- **Then**: both runs become `running`, both get separate **Automations** terminal windows with unique internal tmux names, and both can complete independently.
- **Signals**: two `automation_run` rows with status `running`, distinct `tmux_window_name`, both final statuses `completed`.

### S20 — Same automation does not re-enter while running

- **Level**: Service-level
- **Given**: one automation already has a `running` run.
- **When**: the scheduler claims another occurrence or the user clicks Run Now.
- **Then**: the scheduled occurrence is skipped with next run advanced, and manual Run Now returns `already_running`; no second run row is created.
- **Signals**: one active run row, `automation_run_now` error code, `automation.next_run_at` advanced for scheduled path.

### S21 — No catch-up after offline/asleep interval

- **Level**: Rust integration
- **Given**: an enabled schedule whose `next_run_at` is in the past because the server was offline.
- **When**: the scheduler starts.
- **Then**: it computes the next future `next_run_at` and creates no historical run rows for missed ticks.
- **Signals**: `automation_run` count unchanged, `automation.next_run_at > now`.

### S22 — Run history reflects terminal statuses

- **Level**: Service-level + E2E
- **Given**: one automation has runs in `running`, `completed`, `failed`, `cancelled`, and `interrupted` states.
- **When**: the user opens run history.
- **Then**: each run appears with the correct outcome, timestamps, artifact links, and latest status on the automation summary.
- **Signals**: `automation_run_list` response, UI status labels, `automation.last_status`.

### S23 — Cancel active run

- **Level**: Service-level with fake long-running agent + E2E smoke
- **Given**: an automation run is `running`.
- **When**: the user invokes cancel.
- **Then**: the service sends an interrupt to the tmux window, marks the run `cancelled`, updates `run.json`, and emits `automation_run_updated`.
- **Signals**: cancelled DB row, `run.json.status = "cancelled"`, WS event, terminal window stopped or killed.

### S24 — Startup recovery syncs terminal statuses from run.json

- **Level**: Rust integration / service-level
- **Given**: SQLite has a `running` run whose `run.json` was updated to `completed` while the API process was down.
- **When**: `recover_running_runs()` runs on startup.
- **Then**: SQLite status becomes `completed` without reading `output.log`.
- **Signals**: DB status changed, no output-log read in test double, artifact paths unchanged.

### S25 — Startup recovery marks lost terminal as interrupted

- **Level**: Rust integration / service-level
- **Given**: SQLite has a `running` run, `run.json.status = "running"`, and the recorded tmux window no longer exists.
- **When**: `recover_running_runs()` runs.
- **Then**: SQLite status becomes `interrupted` and existing artifacts remain linked.
- **Signals**: DB status `interrupted`, `automation_run_updated` event, artifact files untouched.

### S30 — Scheduled start failure pauses the automation

- **Level**: Service-level + E2E smoke
- **Given**: an enabled scheduled automation whose next occurrence is due, but its agent executable, target, or instructions cannot be resolved before a terminal run starts.
- **When**: the scheduler tick attempts to start the automation.
- **Then**: a failed scheduled run is written with `failure_kind = "start_failed"`, the schedule is paused, the Automations header explains the start failure, and the user can resume the schedule manually after fixing the configuration.
- **Signals**: `automation_run.status = failed`, `automation_run.failure_kind = start_failed`, `automation.schedule_paused = true`, `automation_definition_updated.change = paused_after_start_failure`, header resume action calls `automation_resume`.

### S26 — Local and push notification gating

- **Level**: Service-level + component test
- **Given**: notification settings enable browser/desktop automation outcomes but push forwarding is disabled.
- **When**: a run completes or fails.
- **Then**: an `automation_notification` WS event is emitted, but no push request is sent.
- **Signals**: `AutomationNotification` event, push client test double call count `0`.

### S27 — Push notification sends only when enabled

- **Level**: Service-level with fake push server
- **Given**: push server config is enabled and `push_automation_outcomes = true`.
- **When**: a run reaches `completed`, `failed`, `cancelled`, or `interrupted`.
- **Then**: a push payload is sent with automation name and status, but without prompt text, output text, or model result content.
- **Signals**: fake push request body, absence of prompt/output/final content.

### S28 — Remote Computer actions affect the connected server

- **Level**: E2E with two local server roots or relay test harness
- **Given**: the UI can switch between Computer A and Computer B, each backed by a different DB/HOME.
- **When**: the user creates an automation while connected to Computer B.
- **Then**: Computer B owns the definition, run artifacts, terminal metadata, and notifications; Computer A remains unchanged.
- **Signals**: B DB/files contain automation, A DB/files do not, WS route uses B connection.

### S29 — Remote manual run creates remote artifacts

- **Level**: Manual smoke or relay E2E if harness exists
- **Given**: the UI is connected to a real remote Atmos Computer.
- **When**: the user runs a standalone automation.
- **Then**: the run directory is created under the remote Computer's `~/.atmos/`, not the local client machine.
- **Signals**: remote filesystem path exists, local filesystem has no matching run directory, UI run detail resolves artifact paths from remote server.

## Performance & load budgets

- `automation_list` for 500 automation definitions returns in under 300 ms on a local development machine.
- Scheduler tick with 500 enabled automations and no due runs completes in under 100 ms.
- Manual `automation_run_now` creates the DB row and emits the first `automation_run_updated` event within 2 seconds, excluding agent execution time.
- Run history for one automation with 1,000 runs returns the first page in under 300 ms without reading artifact files.
- Startup recovery for 100 `running` rows reads only `run.json` files and completes in under 1 second when tmux checks are stubbed.

## Regression checklist

- [ ] No automation CRUD or run-control REST endpoint is added; WS remains the primary transport.
- [ ] No prompt, model output, terminal log, or push token is stored in SQLite.
- [ ] No prompt or output content is included in Desktop/Web push payloads.
- [ ] Different automations targeting the same Workspace can run concurrently.
- [ ] The same automation cannot create two simultaneous `running` runs.
- [ ] Missed ticks while the server was offline do not create backfilled run rows.
- [ ] `run.json` writes are atomic and never parsed from a partial file.
- [ ] `issue_only` workspace filtering is unchanged; `automation` workspaces are visible with a label.
- [ ] Unsupported agents cannot be selected or created through direct WS calls.
- [ ] Artifact paths cannot escape `~/.atmos/automations/`.

## Acceptance criteria

- [ ] Every Must Have PRD item M1-M16 is covered by at least one implemented scenario above.
- [ ] All automated scenarios selected for M1 pass in CI or the documented local regression command.
- [ ] Manual-only checks have been run once on macOS Desktop before release.
- [ ] No new unconditional REST endpoints are introduced for automation definitions, runs, or artifacts.
- [ ] The runner works with a fake non-interactive agent without requiring any real external agent CLI.
- [ ] `running`, `completed`, `failed`, `cancelled`, and `interrupted` are the only run status values exposed by API/UI.
- [ ] The run artifact directory contains only the required M1 files unless the user/agent creates additional files: `prompt.md`, `output.log`, `final.md`, `run.json`.
- [ ] No explicit reference-source wording or external product inspiration text appears in APP-017 spec files.

## Manual verification steps

1. On macOS Desktop, enable browser and desktop notifications, run a fake or installed supported agent automation, and confirm a native notification appears for completion.
2. Configure one real push server, enable automation push outcomes, run a completed and a failed automation, and confirm the remote notification payload contains only automation name/status.
3. Connect the UI to a real remote Atmos Computer, create a standalone automation, run it, and verify the run directory exists on the remote machine under `~/.atmos/automations/runs/...`.
4. Smoke-test at least one real installed terminal-agent CLI in non-interactive auto-accept mode, because automated coverage uses fake agents.

## Non-coverage

- **N1 templates**: deferred until product templates are designed.
- **N2 webhook/event triggers**: deferred; M1 only covers manual and scheduled triggers.
- **N3 retention controls**: deferred; tests only verify artifacts are written and preserved.
- **N4 prompt test mode**: deferred; manual Run Now is covered instead.
- **N5 rich custom-agent controls**: richer custom-agent automation controls are deferred; M1 tests shared built-in terminal agent definitions, existing terminal-agent overrides, and fake test agents.
- **Cloud wake/sleep guarantees**: out of scope; M1 explicitly does not wake machines or backfill missed ticks.
