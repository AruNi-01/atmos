# Brainstorm · APP-017: Atmos Automations

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos already has the ingredients for long-running autonomous work: an `apps/api` Atmos Server per Computer, terminal-agent CLI integrations, project/workspace context, terminal and filesystem capabilities, a Desktop/Web/CLI surface, and APP-016's Relay path for reaching remote Computers. The missing product layer is a durable way to say "run this agentic task later or repeatedly, with this context, on this Computer, and show me what happened."

After follow-up product direction, APP-017 should converge toward **local-per-Computer automations**. If a user wants an automation on a remote VPS, they connect to that remote Atmos Computer and create the automation there; the automation metadata and files live on that Computer. No cloud scheduler/control-plane dependency is needed for M1.

## Goals (draft)

- Make recurring agent work a first-class Atmos object: definition, trigger, execution context, run history, output, and pause/resume controls.
- Preserve Atmos's "one Computer owns the state" model: an automation is created and executed on the currently connected Atmos Computer.
- Start with useful software-development loops before becoming a generic workflow platform.
- Keep unattended execution reviewable and bounded: clear target context, rate limits, concurrency, logs, and no hidden file mutation surprises.
- Prefer WebSocket/event updates for interactive run state; use REST only for bootstrap/settings-style persistence.

## Settled direction from follow-up

- **Execution path**: run terminal agent CLIs, not ACP sessions directly. Each run creates a terminal tab named **Automations** in the target project/workspace context and launches the selected agent in non-interactive mode.
- **Result capture**: model output should be written to files so users can inspect results after the run. Terminal output remains useful for live/debug viewing, but the durable artifact is file-based.
- **Storage split**: automation metadata lives in the local SQLite database on that Computer. Prompt, run result files, logs, and other large/user-readable artifacts live under `~/.atmos/`.
- **Remote behavior**: no special remote automation product path. A remote automation is just a local automation created while the UI is connected to a remote Atmos Computer.
- **Notifications**: Desktop/Web notifications are in scope. Push-server notifications are gated by a user setting such as "automation push notifications enabled"; if enabled, completed/failed/cancelled/interrupted runs also push.
- **Run environment**: user can target a Project, a specific Workspace, or "create a new Workspace on each run." If no Project/Workspace is selected, run in `~/.atmos/automations/runs/{date-time}/{automation-id}/`.
- **Workspace source**: workspaces created by automations should use `create_source = "automation"`; the UI should show an automation icon label when displaying these workspaces.
- **Agent picker**: reuse the existing agent selector, but filter to agents with a verified non-interactive command. Unsupported agents appear unavailable with copy explaining that they do not support non-interactive automation runs.
- **Setup UI**: reuse the Welcome page composer shape. Replace the top title/copy with automation-specific language, add an automation display-name input, and replace lower controls with Project, Workspace, and Triggers.
- **Management entry**: add Automations as an item in the Management Center.

## Options

### Option A — Local Computer scheduler (M1 direction)

Each Atmos Server stores automation definitions locally and runs them with a lightweight scheduler while that Computer is online. The UI can create a scheduled task such as "every morning, check failing GitHub Actions for this workspace and open an agent session if there is a real fix."

**Pros**: matches the product direction; aligns with local-first Atmos; works for remote VPS by connecting to that Computer first; reuses local DB, terminal sessions, workspace creation, and notification settings.
**Cons**: no run while that Computer is offline; every Computer owns its own automation list; webhook/event triggers are harder without a push path.
**Unknown**: exact SQLite tables and artifact file layout belong in TECH, but the DB/filesystem split is settled.

### Option B — Terminal-runner wrapper

Automations become a thin orchestration layer over the existing terminal system. A scheduled trigger opens a terminal tab named **Automations**, writes a prompt file, starts a non-interactive CLI command, captures combined terminal output plus final output into run files, and records status in SQLite.

**Pros**: concrete and sympathetic to how Atmos agents work today; creates visible terminal evidence; easy to debug; avoids inventing a second agent runtime.
**Cons**: needs reliable process supervision, cancellation, and exit-code handling; different agents use different headless flags; terminal tabs may accumulate unless lifecycle is defined.
**Decision**: create one **Automations** tab/window per run, with an internal tmux window name that includes the run id.

### Option C — Workspace-per-run automation

When creating an automation, the user can choose to create a fresh workspace for each run. The automation name becomes the workspace display name, `create_source` becomes `automation`, and the workspace list gains an automation icon label.

**Pros**: isolates changes; gives users a clean review surface; fits code-modifying automations better than running repeatedly in the same workspace.
**Cons**: can create workspace clutter; needs pruning/archiving UX; branch naming and failed setup flows need clear handling.
**Unknown**: whether "new workspace each run" is M1 or M2.

### Option D — Full workflow automation platform (defer)

Build a full automation center with schedules, GitHub/GitLab, Slack, Linear, Sentry, PagerDuty, webhooks, MCP tools, templates, single-repo/multi-repo/no-repo modes, and service-account identity.

**Pros**: strong parity with current agent platforms; useful beyond coding; supports security/compliance, product ops, and support workflows.
**Cons**: too broad for a first spec; risks turning Atmos into an integration platform before the core run model is proven.
**Unknown**: which integrations Atmos should own versus expose through MCP/skills.

## Candidate user-facing shapes

- **Automation definition**: name, prompt/instructions, enabled state, trigger, target Computer, optional project/workspace, agent/model/provider, and output policy.
- **Triggers**: manual run now; scheduled hourly/daily/weekly/monthly presets; preset-specific time inputs; custom cron expression.
- **Run modes**:
  - Project run: one workspace/project context, usually allowed to read/write code.
  - Computer run: no specific repo, useful for local maintenance, reports, environment checks.
  - Workspace run: target an existing workspace.
  - New-workspace run: create a workspace each time, marked with `create_source = "automation"`.
- **Outputs**: Triage-like inbox, run detail page, linked agent session, optional PR/comment/Slack-style notification later.
- **Memory**: per-automation notes across runs, explicit and inspectable; disabled by default for untrusted event payloads.
- **Templates**: daily repo brief, CI fixer, dependency update scout, stale branch cleanup, workspace health check, changelog draft, security invariant check.

## Initial non-interactive agent command findings

Implementation should not copy the terminal-agent list for automations. The settled direction is to reuse the existing terminal-agent selection source and user terminal-agent settings, then let automation add only the prompt-file/stdin wrapper and non-interactive capability checks. The resolver probes whether the executable is installed, exposes unsupported agents with a clear reason, and should be re-verified against locally installed CLI versions before release.

## Key forks in the road

- **One Automations terminal tab vs one tab per run**: one tab keeps the UI compact; per-run tabs make live debugging clearer. Decide in PRD/TECH.
- **Schedule-only vs event-triggered**: M1 direction is scheduled/manual; webhook/GitHub events can wait. Decide in PRD.
- **Terminal CLI wrapper vs ACP runner**: direction is terminal CLI wrapper; TECH must define process supervision and capture.
- **Local working tree vs isolated worktree/sandbox**: local execution is pragmatic for Atmos Computer; unattended writes need clear safety rails. Decide in TECH.
- **Project vs workspace vs new-workspace vs no-target default**: all are desired, but PRD should decide the first shippable subset.
- **SQLite metadata vs file artifacts**: split is settled; TECH decides exact schema, file names, retention, and cleanup.
- **REST settings vs WS run control**: definitions may use REST-like persistence; live run output/cancel/status should extend the existing WS protocol. Decide in TECH.
- **Push server notification default**: local Desktop/Web notification is baseline; push server should be opt-in through settings. Decide exact UX in PRD.

## Open questions

- [ ] Should M1 include all run environments, or start with Project + Workspace + no-target and add new-workspace-per-run next?
- [ ] Should the automation display name always become the workspace display name for new-workspace runs, or should users override it?
- [ ] What optional files beyond prompt, output log, final message, and run metadata should each run directory contain later?
- [ ] How long should `~/.atmos/automations/runs/...` artifacts be retained, and who cleans them up?
- [x] Missed jobs while Atmos Server is asleep/offline are not backfilled; startup computes the next future run time.
- [ ] How should the user test an automation prompt before scheduling it: one-off dry run, run in the Automations terminal, or preview plan only?
- [ ] What cancellation semantics are required for long agent runs, terminal commands, and partial diffs?
- [ ] How do we avoid duplicate PRs or duplicate comments when a trigger fires repeatedly?
- [ ] Should custom agents be allowed through the existing terminal-agent command/flag settings, or should automation add its own richer validation UI later?

## References

- Existing code: `apps/api/src/api/ws`, `apps/api/src/api/ws/terminal_handler.rs`, `apps/web/src/features/wiki/components/AgentSelect.tsx`, `apps/web/src/features/welcome/components/WelcomeComposerCard.tsx`, `apps/web/src/app-shell/LeftSidebarManagementCenter.tsx`, `crates/infra/src/db/entities/workspace.rs`, `crates/infra/src/db/migration/m20260428_000020_add_workspace_create_source.rs`.
- Related specs: [APP-004 Local Agent Integration](../APP-004_local-agent-integration-acp/TECH.md), [APP-005 GitHub Integration](../APP-005_github-integration/PRD.md), [APP-016 Atmos Computer](../APP-016_atmos-computer/TECH.md).

## Ready to promote

- Promote to PRD: launch as local-per-Computer recurring terminal-agent runs, not a hosted cloud automation platform.
- Promote to PRD: M1 candidates are automation name, instructions composer, agent picker filtered by non-interactive support, project/workspace/no-target environment, scheduled/manual trigger, local run history, pause/resume, and Desktop/Web notifications.
- Promote to PRD: M2 candidates are new-workspace-per-run if not in M1, webhook/GitHub event triggers, templates, push-server notification settings polish, and retention controls.
- Promote to TECH: model the run lifecycle as definition -> trigger event -> running terminal process -> captured files -> completed/failed/cancelled/interrupted artifact.
- Promote to TECH: define `~/.atmos/automations/` directory layout and SQLite metadata schema together.
- Promote to TECH: add `create_source = "automation"` usage and UI icon label behavior for automation-created workspaces.
- Promote to TECH: keep live run output and cancellation on WS; keep definition CRUD/settings persistence narrowly scoped.
- Promote to TECH: run non-interactive terminal agents in auto-accept mode and rely on visible target context, durable artifacts, and workspace isolation for review.
