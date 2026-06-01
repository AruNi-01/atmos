# IMPROVEMENT · APP-017: Atmos Automations — Operational Log

> Living record of production issues, quality gaps, mitigations shipped, and follow-ups. Complements the frozen planning quartet ([BRAINSTORM](./BRAINSTORM.md) → [PRD](./PRD.md) → [TECH](./TECH.md) → [TEST](./TEST.md)); does not replace them.

**Related code**: `apps/web/src/features/automations/components/AutomationSetup.tsx`, `apps/web/src/features/automations/components/AutomationSetupControls.tsx`, `apps/web/src/features/welcome/components/WelcomeComposerCard.tsx`, `apps/web/src/features/welcome/components/WelcomeComposerControls.tsx`

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After fixing a user-reported bug, reliability issue, quality regression, agent ergonomics gap, or deliberate product parity gap. |
| **Entry id** | `IMP-NNN` — zero-padded, monotonic in this file (next: **IMP-006**). |
| **Status** | `open` → `mitigated` → `closed` (or `wont-fix` with reason). |
| **Do not** | Duplicate full TECH sections; link to TECH/PRD and paste only deltas. |
| **Versions** | If agent-facing behavior changes, note the relevant Skill / CLI / runtime version in the entry. |

---

## Index

| Id | Title | Status | Date |
|----|-------|--------|------|
| IMP-001 | Restore welcome-composer automation setup | mitigated | 2026-05-28 |
| IMP-002 | Fill headless defaults for Kilo and Kimi | mitigated | 2026-05-28 |
| IMP-003 | Expose schedule timezone in trigger composer | mitigated | 2026-05-28 |
| IMP-004 | Scope automations composer commands to automation context | mitigated | 2026-05-29 |
| IMP-005 | Replace terminal-backed runs with background agent processes | mitigated | 2026-05-31 |

---

## IMP-001 · Restore welcome-composer automation setup

| Field | Value |
|-------|--------|
| **Date** | 2026-05-28 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | ergonomics |

### Problem

The create automation page drifted from APP-017's setup requirement. Instead of using the welcome page's full-screen composer-style UI with automation-specific copy, it rendered a conventional multi-section form with separate cards for display name, agent, instructions, environment, and trigger. This made the flow visually inconsistent with the requested setup pattern and hid the intended "compose first, configure through compact controls" interaction.

### Root cause

The implementation reused the welcome `PromptComposer`, but not the welcome composer shell and control-row interaction model. Automation-only fields were laid out as full form sections instead of being exposed through compact controls with popover editors.

### Solution

Restore the setup UI to the welcome page pattern: automation-specific dynamic headline copy with the ATMOS wordmark, welcome-style composer card, floating agent selector, and an automation footer row whose buttons open Atmos-surface popovers for display name, run environment, and trigger configuration. Keep the submit affordance as a Timer icon inside the composer surface and keep backend request shape unchanged.

Refine the trigger editor so trigger kind is selected from a single select control first; only the remaining fields for the selected trigger kind are shown below it.

Update the built-in Droid automation command to use Factory's headless `droid exec --skip-permissions-unsafe` mode, so installed Droid CLIs are treated as automation-capable and match the yolo/bypass behavior used by the other built-in automation agents.

### Result

Mitigated in the web UI. The create/edit automation setup now uses the welcome-style full-screen composer shell, automation-specific dynamic headline copy, a floating reused agent selector, the reused prompt composer, and compact footer popover controls for display name, run environment, and trigger configuration. Browser DOM smoke verified that the Name, Environment, and Trigger popovers open and update visible setup state.

### Code / docs touched

- `apps/web/src/features/automations/components/AutomationSetup.tsx`
- `apps/web/src/features/automations/components/AutomationSetupControls.tsx`
- `apps/web/src/features/welcome/components/WelcomeComposerControls.tsx`
- `apps/web/src/features/welcome/components/WelcomeComposerCard.tsx`
- `apps/web/src/features/welcome/lib/welcome-page-helpers.tsx`
- `apps/web/src/app-shell/LeftSidebarManagementCenter.tsx`
- `apps/web/src/app-shell/global-search-app-items.tsx`

### Follow-ups

- [ ] Capture a visual screenshot once Browser screenshot capture is available for this page.
- [x] Verify every required automation field is reachable from the compact control row.

---

## IMP-002 · Fill headless defaults for Kilo and Kimi

| Field | Value |
|-------|--------|
| **Date** | 2026-05-28 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | integration correctness |

### Problem

Kilo Code and Kimi were listed as built-in terminal agents but had empty default automation flags, so the automation capability resolver classified them as unsupported even though their current CLIs document non-interactive execution modes.

### Root cause

The shared terminal-agent manifest had not been refreshed after Kilo and Kimi added/documented headless modes. Since the resolver treats empty built-in flags as "not automation-capable", both agents were blocked before installation status or prompt strategy could matter.

### Solution

Update Kilo Code to use `kilo run --auto --dangerously-skip-permissions` and Kimi to use `kimi --print -p`. Kimi uses the `prompt_flag` strategy so the automation runner passes the prompt after `-p`, matching the CLI documentation. Extend the built-in command-spec regression test so both invocations stay covered.

### Result

Kilo and Kimi now have non-empty headless defaults in the shared manifest. Installed CLIs can be surfaced as automation-capable unless the user overrides those built-ins with custom flags or disables the agent.

---

## IMP-003 · Expose schedule timezone in trigger composer

| Field | Value |
|-------|--------|
| **Date** | 2026-05-28 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | scheduling ergonomics |

### Problem

Automation schedules already carry a timezone through the frontend request and Rust scheduler, but the create/edit composer did not expose the timezone as an editable control. Users could only accept the browser-detected timezone, making cross-region schedules hard to author.

### Root cause

`AutomationSetup` initialized and persisted timezone state, but `AutomationTriggerPicker` only edited trigger kind and schedule fields. The compact composer footer could display timezone in the summary while the popover had no way to change it.

### Solution

Add a compact timezone select to the right side of the Trigger popover title. Default the selected value to the existing browser-resolved timezone state, enumerate common IANA timezones by region, and include the current timezone at the top when it is not part of the common list.

### Result

Users can now switch the schedule timezone in place while configuring the trigger. Schedule preview and the composer footer summary update through the existing timezone state and backend payload.

---

## IMP-004 · Scope automations composer commands to automation context

| Field | Value |
|-------|--------|
| **Date** | 2026-05-29 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | integration correctness |

### Problem

The APP-017 setup page reused the welcome composer command surfaces too literally. The local Automations flow mixed in welcome GitHub mention expectations even though this setup path should only expose file mentions, and the `/skill` menu listed project-scoped skills from unrelated projects instead of following the currently selected Project or Workspace.

### Root cause

`AutomationSetup` mounted the same mention/slash popovers as the welcome page, while `useWelcomeSlashSearch` loaded a global skill list once and never filtered project-scoped skills by the active automation environment.

### Solution

Keep the `@` mention popover in file-only mode inside `AutomationSetup`, with GitHub issue/PR previews forced off for APP-017. Add project-context filtering to the shared slash-skill search so the Automations setup passes its effective target project id and only sees global skills plus project-scoped skills for that selected Project or Workspace. Treat Standalone as no-project context, which means only global skills remain visible.

### Result

Automations create/edit now behaves like an automation-scoped composer instead of a full welcome-page clone. `@` keeps file suggestions only, without GitHub issue/PR suggestions, and `/skill` updates immediately when the user switches between Project, Workspace, New Workspace, and Standalone targets.

### Code / docs touched

- `apps/web/src/features/automations/components/AutomationSetup.tsx`
- `apps/web/src/features/welcome/components/WelcomeComposerCard.tsx`
- `apps/web/src/features/welcome/hooks/use-welcome-slash-search.ts`
- `apps/web/src/features/welcome/hooks/__tests__/use-welcome-slash-search.test.ts`
- `specs/APP/APP-017_atmos-automations/{PRD,TECH,TEST,IMPROVEMENT}.md`

### Follow-ups

- [ ] Add a browser-level smoke test for the slash popover once the local Playwright/browser harness is in place for Automations.

---

## IMP-005 · Replace terminal-backed runs with background agent processes

| Field | Value |
|-------|--------|
| **Date** | 2026-05-31 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | reliability / resource usage |
| **Agent-facing versions** | Built-in terminal-agent manifest as of 2026-05-31; current CommandCode `cmd --print`, Codex `codex exec`, Claude `claude --print` style headless CLIs |

### Problem

APP-017 M1 intentionally runs each automation inside a tmux window named **Automations** so users can see terminal evidence. In practice, unattended automations do not need a visible terminal during execution. The terminal-backed runner wastes terminal/window resources, adds lifecycle failure modes, and can break CLIs whose headless mode expects piped stdio rather than a TTY-oriented interactive session.

Users still need durable evidence after the run: prompt, raw output, parsed final result, status, and enough context to continue manually if the automation result needs follow-up.

### Root cause

The current runner conflates two concerns:

- **Execution**: running a non-interactive agent until it exits.
- **Inspection / follow-up**: letting a user view what happened and continue in an interactive terminal agent.

Because execution happens through tmux, the service has to create windows, send shell text, poll terminal liveness, and wrap stdout through shell/`tee` plumbing. That makes a background automation depend on terminal behavior even when the user only wants persisted artifacts.

### Solution

Move automation execution to a background process runner in `crates/core-service`, while keeping WebSocket as the UI transport.

The new execution model:

```text
AutomationService
  -> resolve target cwd
  -> prepare run artifacts
  -> build structured agent argv
  -> tokio::process::Command spawn
  -> pipe prompt through stdin or argv/file strategy
  -> stream stdout/stderr into artifacts and WS events
  -> write final.md + events.jsonl + run.json
```

Implementation shape:

- Add a runner boundary such as `AutomationProcessRunner` under `crates/core-service/src/service/automation/`.
- Replace tmux launch for normal automation runs with `tokio::process::Command`.
- Use `stdin/stdout/stderr = piped`; do not use `shell` on Unix. If Windows support is required later, gate `.cmd`/`.bat` shell behavior explicitly.
- Preserve the current run artifact directory contract and add `events.jsonl` for structured per-line output events.
- Keep SQLite small: store run status, timestamps, exit code, target metadata, artifact paths, process id if available, and optional parser metadata. Do not store prompt/output bodies in SQLite.
- Cancellation should set `cancellation_requested`, send a child kill/terminate signal, wait briefly, then force kill if needed. The final status remains `cancelled` when the stop was user-requested.

Agent invocation should be typed, not string-shell based:

```rust
pub struct AutomationAgentInvocation {
    pub executable: PathBuf,
    pub argv: Vec<String>,
    pub prompt_delivery: PromptDelivery,
    pub output_format: AgentOutputFormat,
}

pub enum PromptDelivery {
    Stdin,
    ArgvLast,
    MessageFlag(&'static str),
    MessageFileFlag(&'static str),
}

pub enum AgentOutputFormat {
    PlainText,
    JsonLines,
    ClaudeStreamJson,
    CodexJsonLines,
}
```

The built-in manifest can continue to be the shared source of truth, but the automation resolver should evolve from `params + promptStrategy` into a structured argv builder. Examples to support:

- Claude: `claude -p --output-format stream-json`
- Codex: `codex exec --json --sandbox workspace-write`
- Cursor Agent: `agent --print --output-format stream-json`
- Gemini: `gemini --output-format stream-json --yolo`
- OpenCode: `opencode run --format json ... -`
- Qwen: `qwen --yolo -`
- Aider: `aider --message-file -`

The exact command defaults must be verified against installed CLI help before implementation. User overrides from `~/.atmos/agent/terminal_code_agent.json` should remain supported, but custom automation argv may need an explicit `automation` section so interactive terminal flags and headless automation flags do not collide.

### WebSocket behavior

Automation management remains WebSocket-first.

Add or extend service events so clients can observe a running background process without attaching to a terminal:

- `automation_run_updated`: status/timestamps/paths, same as today.
- `automation_run_output`: optional live chunk or parsed event for the selected run.
- `automation_run_artifact_updated`: emitted when `final.md`, `output.log`, or `events.jsonl` changes enough for the UI to refresh.

The UI does not need to replay every chunk from SQLite. It can read persisted artifacts through the existing artifact fetch action when the user opens run detail. Live chunks are best-effort WS events for the currently connected client.

### Continue in terminal

Add a user action from run detail: **Continue in Terminal**.

The action should create a normal interactive terminal agent session after the user reviews an automation result. It should not retroactively move the automation process into a terminal.

Suggested WS action:

```ts
type AutomationContinueInTerminalReq = {
  runGuid: string;
  agentId?: string;
  includeOutputLog?: boolean;
};
```

Backend behavior:

1. Load the run, automation definition, target cwd, and artifact paths.
2. Resolve the interactive terminal command for `agentId` or the run's original agent.
3. Create/open a normal terminal in the relevant Project/Workspace/Standalone context.
4. Build a continuation prompt file under the run directory, for example `continue_prompt.md`.
5. Start the terminal agent with an initial prompt, or create the terminal and send the prompt text after the shell is ready, depending on the selected agent's interactive launch behavior.
6. Return terminal/session identifiers so the UI can focus the new terminal.

Continuation prompt should include:

- Automation display name and run id.
- Original automation instructions.
- Trigger kind and trigger context path if present.
- Target cwd, Project/Workspace ids, and created workspace id if any.
- `prompt.md`, `final.md`, `output.log`, `events.jsonl`, and `run.json` absolute paths.
- Inline `final.md` content when it is below a small cap, otherwise a path-only reference.
- A short instruction: continue from this automation result, inspect artifacts as needed, and ask before destructive changes unless the terminal agent mode already grants permission.

Avoid inlining the full `output.log` by default. Large logs should remain file references.

### Result

Mitigated in backend execution, WebSocket protocol, and the Automations run-detail UI.

- Manual and scheduled automations no longer create tmux windows during unattended execution.
- Runs now spawn the resolved agent binary directly from `core-service` with piped stdio, persisted `prompt.md`, `output.log`, `final.md`, `events.jsonl`, and `run.json` artifacts.
- Run output is emitted through the existing WebSocket event channel as `automation_run_output`, while durable evidence remains file-backed.
- Run detail exposes `Result`, `Output Log`, `Prompt`, `Events`, and `Run JSON`.
- Users can click **Continue** from a completed, failed, cancelled, or interrupted run. For Project/Workspace targets the UI queues an exact interactive terminal command and navigates to the terminal tab; for Standalone targets it copies the command because there is no project/workspace terminal context to focus.
- Terminal resources are used only when the user explicitly chooses an interactive follow-up.

### Code / docs touched

- `crates/core-service/src/service/automation/agents.rs`
- `crates/core-service/src/service/automation/lifecycle.rs`
- `crates/core-service/src/service/automation/run_watcher.rs`
- `crates/core-service/src/service/automation/process_runner.rs`
- `crates/core-service/src/service/automation/runner.rs`
- `crates/core-service/src/service/automation/scheduler_service.rs`
- `apps/api/src/api/ws/message.rs`
- `apps/api/src/api/ws/router/automation.rs`
- `apps/api/src/api/ws/automation_events.rs`
- `apps/web/src/features/automations/components/AutomationDetailPanel.tsx`
- `apps/web/src/features/automations/components/RunDetailPanel.tsx`
- `apps/web/src/features/automations/hooks/use-automations.ts`
- `apps/web/src/features/automations/hooks/use-automation-page-state.ts`
- `apps/web/src/features/workspace/store/workspace-creation-store.ts`
- `apps/web/src/app-shell/CenterStage.tsx`
- `resources/terminal-agents/builtin_agents.json`

### Follow-ups

- [x] Keep this as an APP-017 improvement implementation; no new spec was needed.
- [x] Split built-in manifest defaults into automation vs interactive params where needed.
- [x] Define an initial file-backed `events.jsonl` stream for stdout/stderr chunks.
- [ ] Add broader service tests with fake agent binaries for stdout, stderr, JSONL parsing, cancellation, non-zero exit, and large output.
- [ ] Add UI smoke coverage for artifact refresh and **Continue in Terminal** focus behavior.
