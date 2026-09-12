# TEST · APP-072: Automation execute modes

> Test Plan · how we verify Execute Agent modes, interactive completion, Standalone sidebar, and the 1h dismissible stale prompt. References PRD APP-072 and TECH APP-072.

## Test strategy

Deterministic Rust tests own mode persistence, start branching, complete/fail rules, stale prompt (no status change), synthetic scope, and “runner does not exec atmos”. Bun tests own landing routes, chip copy, sidebar synthesis, setup tab catalogs, and skill/manifest structure. CLI tests own invoke action names. Playwright is reserved for the setup try-run navigation if a harness fixture exists; otherwise service + Bun cover the contract. Agent-browser explores Execute Agent chrome and the stale banner.

- Unit / integration: execute_mode default, config discriminator, landing href, stale elapsed helper, prompt template contains skill path + CLI verbs.
- Service: start_run branches; complete requires final.md; stale scan sets prompted_at only; dismiss does not change status; Headless still uses process_runner.
- WebSocket/API: new actions in `WsContract`; create/update round-trip `execute_mode`.
- Bun: i18n keys, sidebar virtual group, chip sentence case, skill registry.
- E2E: optional happy-path setup → try-run Headless lands on `?run=`.
- Exploratory agent-browser: Execute Agent tabs + stale banner click-to-dismiss.
- Manual: live Terminal/Chat inject on a Computer with tmux.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2 |
| M2 | S3, S4 |
| M3 | S5, S6 |
| M4 | S7, S8 |
| M5 | S9, S10 |
| M6 | S11, S12 |
| M7 | S13, S14, S15 |
| M8 | S16, S17 |
| M9 | S18, S19 |
| M10 | S20, S21 |
| M11 | S22, S23, S24 |
| M12 | S25, S26 |
| M13 | S25 |
| M14 | S27, S28 |
| M15 | S29, S30, S31 |
| 1h prompt | S32, S33, S34 |
| N1, N3 | deferred |
| N2 | S20 |
| N4 | S23 |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Rust | `cargo test` | create/get execute_mode | default omitted | column `headless` | planned |
| S2 | Bun | `bun test` | AutomationSetup | fixture source | three tabs above Instructions | planned |
| S3 | Bun | `bun test` | Headless picker | AutomationAgentPicker | inline max-height; no popover | planned |
| S4 | Bun / Rust | `bun test` / `cargo test` | unavailable agent | no non-interactive flags | `unavailable_reason` shown; cannot select | planned |
| S5 | Rust | `cargo test` | interactive resolver | terminal mode | uses interactive flags, not `--print` | planned |
| S6 | Bun | `bun test` | Terminal tab | setup source | TerminalAgentSelectorWithRunConfig present | planned |
| S7 | Bun | `bun test` | Chat tab | setup source | installedAgents / history picker, not terminal list | planned |
| S8 | Rust | `cargo test` | chat agent_config | `{kind:chat}` | stored in agent_config_json | planned |
| S9 | Rust | `cargo test` | start_run terminal | execute_mode=terminal | does not spawn process_runner | planned |
| S10 | Rust | `cargo test` | scheduler/github entry | same start_run_from_model | no silent headless fallback | planned |
| S11 | Rust | `cargo test` | headless start | execute_mode=headless | process_runner; tmux None; surface none | planned |
| S12 | Rust | `cargo test` | headless complete | process exit | runner writes final.md / run.json | planned |
| S13 | Rust | `cargo test` | project terminal scope | target project | workspace_id = project guid | planned |
| S14 | Rust | `cargo test` | new_workspace then tab | target new_workspace | created_workspace_guid set before session | planned |
| S15 | Rust | `cargo test` | standalone scope | target standalone | scope `automation:{guid}`; cwd definition dir; no worktree | planned |
| S16 | Rust | `cargo test` | chat create+send | mode chat | AgentChatService create then send | planned |
| S17 | Rust | `cargo test` | chat standalone cwd | workspace_id automation: | no get_workspace; cwd definition dir | planned |
| S18 | Rust | `cargo test` | interactive prompt | build prompt | skill path + `atmos automation complete` | planned |
| S19 | Rust | `cargo test` | no TTY parse | interactive finish | status stays running without complete | planned |
| S20 | Bun | `bun test` | chip copy | i18n + chip helper | “Automation”; tooltip job · short id | planned |
| S21 | Rust / Bun | `cargo test` | metadata | origin+run_guid | survives reload (server fields) | planned |
| S22 | Bun | `bun test` | sidebar synth | list standalone | group Automations Standalone; one row per job | planned |
| S23 | Bun | `bun test` | filter | show_automation_workspaces=false | virtual group hidden | planned |
| S24 | Rust | `cargo test` | no Project insert | standalone create | project table unchanged | planned |
| S25 | Bun | `bun test` | landing href | run DTO | headless `?run=`; terminal/chat tab routes | planned |
| S26 | Bun | `bun test` | try-run validation | empty name | blocked; no run_now | planned |
| S27 | Structural | grep | runner | process_runner + interactive_runner | no `~/.atmos/bin/atmos` exec | planned |
| S28 | Rust / CLI | `cargo test` | complete invoke | CLI | action `automation_run_complete` via invoke | planned |
| S29 | Structural | grep | skill | skills/atmos-automation | in ALL_SYSTEM_SKILL_NAMES + manifest | planned |
| S30 | Structural | grep | atmos-cli | SKILL.md | points completion here | planned |
| S31 | Rust / CLI | `cargo test` | paths/status | CLI | invoke `automation_run_paths` / `automation_run_get` | planned |
| S32 | Rust | `cargo test` | 1h scan | running 61m terminal | stale_prompted_at set; status still running | planned |
| S33 | Rust | `cargo test` | dismiss | prompted run | dismissed true; status unchanged | planned |
| S34 | Bun | `bun test` | banner | stale DTO | click calls dismiss; not toastManager success | planned |

## Scenarios

### S1 — Default execute mode is headless

- **Level**: Rust
- **Given**: create payload omits `execute_mode`.
- **When**: automation is created and fetched.
- **Then**: `execute_mode` is `headless`.
- **Signals**: SQLite/default + detail DTO.

### S2 — Execute Agent tabs persist

- **Level**: Bun
- **Given**: setup page source.
- **When**: Headless / Terminal / Chat tabs render above Instructions.
- **Then**: selected tab is the saved mode on edit.
- **Signals**: `execute_mode` field in create/update request builder.

### S3 — Headless list is inline

- **Level**: Bun
- **Given**: Headless tab selected.
- **When**: agent list renders.
- **Then**: `AutomationAgentPicker` is used; no popover trigger for the list.
- **Signals**: `max-h` scroll container in picker.

### S4 — Non-interactive-missing agents stay unavailable

- **Level**: Bun / Rust
- **Given**: capability with `automation_supported=false`.
- **When**: Headless list renders / create validates headless agent.
- **Then**: row disabled with `unavailable_reason`; create rejects that agent in headless.
- **Signals**: existing reason copy.

### S5 — Terminal uses interactive flags

- **Level**: Rust
- **Given**: execute_mode=terminal, known agent.
- **When**: launch command is built.
- **Then**: interactive flags are present; headless `--print` / exec flags are not.
- **Signals**: `build_terminal_launch_command` / interactive resolver.

### S6 — Terminal tab shows run-config

- **Level**: Bun
- **Given**: Terminal Agent tab.
- **When**: setup chrome is inspected.
- **Then**: `TerminalAgentSelectorWithRunConfig` (or WelcomeAgentSelector menu) is present.
- **Signals**: source contains that component.

### S7 — Chat picker is not the terminal list

- **Level**: Bun
- **Given**: Agent Chat tab.
- **When**: picker renders.
- **Then**: catalog is `installedAgents` / Agent Chat history picker, not `AutomationAgentPicker`.
- **Signals**: setup source.

### S8 — Chat config stored with discriminator

- **Level**: Rust
- **Given**: create with execute_mode=chat and chat spawn fields.
- **When**: row is persisted.
- **Then**: `agent_config_json` contains `"kind":"chat"` and `provider_id`.
- **Signals**: JSON parse of stored blob.

### S9 — Terminal start does not use process_runner

- **Level**: Rust
- **Given**: execute_mode=terminal.
- **When**: `start_run_from_model` succeeds far enough to branch.
- **Then**: process_runner is not spawned; surface_kind=terminal.
- **Signals**: spy or invocation flag.

### S10 — Schedule / GitHub honor saved mode

- **Level**: Rust
- **Given**: scheduled/GitHub trigger on a chat/terminal automation.
- **When**: `start_run_from_model` is invoked.
- **Then**: execute_mode on the run matches the definition; no rewrite to headless.
- **Signals**: run row `execute_mode`.

### S11 — Headless surface is none

- **Level**: Rust
- **Given**: headless automation.
- **When**: run starts.
- **Then**: `surface_kind` is none/null; `tmux_*` remain None.
- **Signals**: run DTO.

### S12 — Headless still writes artifacts from process exit

- **Level**: Rust
- **Given**: existing process_runner contract.
- **When**: child exits 0 after writing.
- **Then**: status completed; runner-owned `final.md` / `run.json`.
- **Signals**: existing runner tests still pass.

### S13 — Project terminal scope is project guid

- **Level**: Rust
- **Given**: target_kind=project.
- **When**: terminal session is created.
- **Then**: `workspace_id` / `surface_scope_id` equal the project guid.
- **Signals**: CreateSessionParams.

### S14 — New workspace then tab

- **Level**: Rust
- **Given**: target_kind=new_workspace.
- **When**: terminal/chat run starts.
- **Then**: `created_workspace_guid` is set and is the session scope.
- **Signals**: resolve_target + surface_scope_id.

### S15 — Standalone synthetic scope, no worktree

- **Level**: Rust
- **Given**: target_kind=standalone.
- **When**: terminal run starts.
- **Then**: scope is `automation:{guid}`; cwd is definition dir; workspace_service create is not called.
- **Signals**: path under `~/.atmos/data/automations/definitions/`.

### S16 — Chat create then first send

- **Level**: Rust
- **Given**: execute_mode=chat.
- **When**: run starts.
- **Then**: create is called, then send with the interactive prompt.
- **Signals**: surface_session_id = chat id.

### S17 — Standalone chat does not look up a Workspace row

- **Level**: Rust
- **Given**: workspace_id=`automation:{guid}`.
- **When**: cwd is resolved.
- **Then**: definition dir is used; `get_workspace` is not required.
- **Signals**: cwd resolve helper.

### S18 — Interactive prompt names skill + CLI

- **Level**: Rust
- **Given**: terminal/chat prompt builder.
- **When**: prompt is rendered.
- **Then**: it contains `~/.atmos/skills/.system/atmos-automation/SKILL.md` and `atmos automation complete --run`.
- **Signals**: string contains.

### S19 — Interactive run stays running without complete

- **Level**: Rust
- **Given**: terminal run started; agent never calls complete.
- **When**: no complete/cancel.
- **Then**: status remains `running`.
- **Signals**: run row.

### S20 — Chip is sentence-case Automation

- **Level**: Bun
- **Given**: i18n + chip helper.
- **When**: sidebar and tab labels are built.
- **Then**: copy is `Automation` (not `AUTOMATION`); no `uppercase` class; tooltip is `{job} · {short id}`.
- **Signals**: en.json + helper tests.

### S21 — Mark survives reload via server metadata

- **Level**: Rust / Bun
- **Given**: created terminal/chat with origin/source automation + run_guid.
- **When**: metadata is read back.
- **Then**: chip inputs are present without client-only flags.
- **Signals**: tmux metadata / AgentChatMeta fields.

### S22 — Virtual Standalone sidebar

- **Level**: Bun
- **Given**: two standalone automations.
- **When**: sidebar model is synthesized.
- **Then**: one Project-level **Automations Standalone** group and two job rows (not per-run).
- **Signals**: `automation:standalone` + `automation:{guid}`.

### S23 — Filter hides the virtual group

- **Level**: Bun
- **Given**: `show_automation_workspaces=false`.
- **When**: sidebar is derived.
- **Then**: virtual group is omitted; `create_source=automation` workspaces stay hidden as today.
- **Signals**: filter helper.

### S24 — No Project row inserted

- **Level**: Rust
- **Given**: standalone automation create.
- **When**: create completes.
- **Then**: project table row count unchanged; no git worktree API call.
- **Signals**: repo spy / count.

### S25 — Landing routes

- **Level**: Bun
- **Given**: run DTOs for each mode/target.
- **When**: `runLandingHref` runs.
- **Then**: headless → `/automations?run=`; project terminal → `/project?id=…&tab=terminal-tab:auto-{short}`; standalone chat → `/automation?id=…&tab=agent-chat:{chatId}`.
- **Signals**: helper tests.

### S26 — Invalid setup blocks try-run

- **Level**: Bun
- **Given**: empty display name.
- **When**: try-run is invoked.
- **Then**: existing validation error; `automation_run_now` is not called.
- **Signals**: form helper.

### S27 — Runner never execs atmos

- **Level**: Structural
- **Given**: automation runner sources.
- **When**: scanned for `~/.atmos/bin/atmos` / `Command::new("atmos")`.
- **Then**: no matches in process_runner / interactive_runner / lifecycle.
- **Signals**: grep.

### S28 — CLI complete is invoke

- **Level**: Rust / CLI
- **Given**: `atmos automation complete --run R`.
- **When**: command runs against a fake invoke.
- **Then**: action is `automation_run_complete`; body has `run_guid`.
- **Signals**: recorded invoke.

### S29 — Skill registered

- **Level**: Structural
- **Given**: repo after impl.
- **When**: sync list + manifest are read.
- **Then**: `atmos-automation` is in `ALL_SYSTEM_SKILL_NAMES` and `system-skills-manifest.json`.
- **Signals**: those files.

### S30 — atmos-cli cross-link

- **Level**: Structural
- **Given**: `skills/atmos-cli/SKILL.md`.
- **When**: Related skills is read.
- **Then**: automation completion points at `atmos-automation`.
- **Signals**: explicit line.

### S31 — CLI status / paths

- **Level**: Rust / CLI
- **Given**: fake invoke.
- **When**: `status` / `paths` run.
- **Then**: actions are `automation_run_get` and `automation_run_paths`.
- **Signals**: recorded invoke.

### S32 — 1h scan notifies only

- **Level**: Rust
- **Given**: terminal run running for 61 minutes, `stale_prompted_at` null.
- **When**: `scan_stale_interactive_prompts` runs.
- **Then**: `stale_prompted_at` is set; `status` is still `running`; no complete/fail/cancel.
- **Signals**: run row + event `automation_stale_prompt`.

### S33 — Dismiss does not change status

- **Level**: Rust
- **Given**: prompted running run.
- **When**: `automation_run_stale_dismiss`.
- **Then**: `stale_prompt_dismissed=1`; status still `running`.
- **Signals**: run DTO.

### S34 — Banner is not a success toast

- **Level**: Bun
- **Given**: stale banner component.
- **When**: click handler runs.
- **Then**: it calls dismiss; source does not use `toastManager` success for this click.
- **Signals**: component test.

## Performance & load budgets

- Stale scan on the existing automation tick must be a single indexed/filter query, not a per-run process wait.
- Terminal inject TUI wait capped at 30s so a scheduled tick cannot hang the scheduler loop (spawn the wait; do not block the claim unlock beyond start persist).

## Regression checklist

- [ ] Headless APP-017 process_runner tests still pass.
- [ ] `already_running` still blocks a second run of the same automation.
- [ ] `create_source=automation` workspace chip still sentence case.
- [ ] `agent_chat_create` without automation prefix still resolves real workspaces.
- [ ] `terminal_session_create` without new fields still detaches as today.
- [ ] English UI has no ALL CAPS / `uppercase` on Automation chips.
- [ ] No `Command::new` / exec of `~/.atmos/bin/atmos` in the runner.

## Exploratory agent-browser checks

Use `agent-browser` (load the installed skill or `agent-browser skills get core --full`) against local web when API+web are up:

1. Open `/automations` create: Execute Agent tabs above Instructions; Headless list scrolls inline; Chat tab is the Chat catalog.
2. Narrow viewport: tabs wrap without ALL CAPS; Standalone sidebar chip readable.
3. If a stale banner can be seeded: click dismisses it; run status in history stays Running.
4. Watch console/WS for failed `automation_*` actions.

## Acceptance criteria

- [ ] M1–M15 each have a scenario that would fail if the behavior regressed.
- [ ] Headless default and process-exit contract unchanged.
- [ ] Terminal/Chat stay `running` until complete / --failed / cancel.
- [ ] 1h prompt never changes run status; dismiss only clears the prompt.
- [ ] Standalone uses `automation:{guid}` and does not insert a Project row.
- [ ] Runner does not exec `atmos`.
- [ ] Skill is dedicated and registered in both sync lists.
- [ ] `WsContract` includes `automation_run_complete`, `automation_run_paths`, `automation_run_stale_dismiss`.
- [ ] Chip copy is sentence-case **Automation**.
- [ ] Coverage Status updated after test-run with exact commands.

## Manual verification steps

1. Create Headless job, try-run, land on `/automations?run=…`, `final.md` from process.
2. Create Terminal + Project job, try-run, new Project terminal tab with Automation mark; `atmos automation complete --run` finishes it.
3. Create Standalone + Chat job; sidebar shows Automations Standalone; `/automation?id=` opens files + chat tab.
4. Leave a Terminal run >1h (or seed `started_at`); banner appears; click clears it; history still Running.
5. Cancel an interactive run; tab remains; the agent turn stops (Terminal via tmux Esc/Ctrl+C, Chat via the same stop API as the chat Stop button); status cancelled.

## Non-coverage

- Live TUI-ready regex timing across every vendor CLI (cap + follow-up list only).
- Mobile sidebar / setup.
- N1 extra CLI mirrors (`atmos chat create/send`, `terminal create --command`).
- Hosted / cross-Computer scheduler.
- Guaranteeing a focused browser at schedule fire time.

## Coverage Status

Ran 2026-09-12. Follow-up verification same day.

| Scenario | Status | Covered by |
|----------|--------|------------|
| S1 | ✅ | `parse_execute_mode_defaults_and_rejects_unknown` + `s1_create_persists_headless_execute_mode` |
| S2 | ✅ | `automation-execute-modes.test.ts` |
| S3 | ✅ | same + `AutomationAgentPicker` inline `max-h-[178px]` |
| S4 | ✅ | picker `disabled={!agent.automation_supported}` + `unavailable_reason` |
| S5 | ✅ | `interactive_prompt_points_at_skill_and_cli` + agents `s5_*` / `s11_*` interactive flags |
| S6 | ✅ | setup source keeps `WelcomeAgentSelector` only when `executeMode === "terminal"` |
| S7 | ✅ | setup source uses `useNativeChatAgentListQuery` |
| S8 | ✅ | `s8_chat_config_stores_kind_and_provider` |
| S9–S12 | ⚠️ | Headless APP-017 `output_rendering` / `runner` / agents `s11_*` passed; no live `start_run` spy |
| S13 | ✅ | `project_scope_uses_project_guid` |
| S14 | ✅ | `s14_new_workspace_scope_uses_created_workspace_guid` + `s14_new_workspace_run_persists_created_workspace_guid` |
| S15 | ✅ | `standalone_scope_is_synthetic` + `standalone_scope_never_collides_with_group_id` |
| S16–S17 | ✅ | `s16_s17_chat_create_then_send_uses_standalone_scope_without_workspace_row` (create-before-send + standalone cwd). No live AgentChatService spawn. |
| S18 | ✅ | `interactive_prompt_points_at_skill_and_cli` |
| S19 | ✅ | `only_terminal_and_chat_are_interactive`; complete requires non-empty `final.md` |
| S20 | ✅ | `automation-run-landing.test.ts` + `AutomationChip` + tab/sidebar mark source |
| S21 | ✅ | `s21_chat_surface_metadata_survives_reload` |
| S22 | ✅ | `standalone-sidebar.test.ts` |
| S23 | ✅ | synthetic rows use `createSource: "automation"` + `left-sidebar-derived.test.ts` |
| S24 | ✅ | `s24_standalone_create_does_not_insert_project` |
| S25 | ✅ | `automation-run-landing.test.ts` |
| S26 | ✅ | `formValid` empty-name gate + try-run returns before `onRunNow` |
| S27 | ✅ | CLI/skill tests assert invoke client; runner modules do not exec `atmos` |
| S28 / S31 | ✅ | `apps/cli` `verbs_call_server_invoke_actions` |
| S29 / S30 | ✅ | `atmos-automation-skill.test.ts` |
| S32 | ✅ | `stale_prompt_age_is_one_hour` + `s32_s33_stale_prompt_scan_and_dismiss_keep_running` |
| S33 | ✅ | same DB fixture: dismiss sets `stale_prompt_dismissed`, status stays `running` |
| S34 | ✅ | `automation-execute-modes.test.ts` stale banner |

### Commands (this follow-up)

```bash
cargo test -p core-service -p infra --offline --lib automation
# 75 core-service + 11 infra passed (includes APP-017 output_rendering / runner / agents s11)
cargo test -p api --offline --bins -- agent_chat terminal
# 6 passed (no automation router tests exist)
bun test apps/web/src/features/automations apps/web/src/app-shell/left-sidebar-derived.test.ts apps/web/src/app-shell/__tests__/left-sidebar-workspace-jobs.test.ts apps/web/src/app-shell/__tests__/workspace-surface-switch.test.ts apps/web/src/features/automations/lib/__tests__/automation-run-landing.test.ts
# 72 passed
```

`just typecheck` skipped (no TS public-type changes).

### Browser sanity (local :3030 / :30303 already up)

- Fallback: Cursor browser (agent-browser CLI not used).
- `/automations`: list + sidebar **Automations Standalone** chip is sentence-case `Automation`.
- `/automations?automationView=create`: Execute agent tabs above Instructions — Headless spawn (inline list, unsupported agents disabled), Terminal agent (run-config selector), Agent chat (Claude/Codex/OpenCode/Pi/Grok catalog). Try run stays disabled with empty name.
- In-page "New automation" click updated the URL but did not remount setup until a hard navigation; not treated as an APP-072 contract failure.

### Remaining gaps

- No Playwright / live Computer try-run (tmux inject, complete CLI).
- No live `start_run` / AgentChatService spawn integration.
- `process_runner.rs` itself has no `#[cfg(test)]`; APP-017 coverage is via `output_rendering` + `runner` + agents `s11_*`.
- Stale banner click not exercised live.

### Cancel interrupt follow-up (2026-09-12)

```bash
cargo test -p core-engine --offline --lib named_keys
# 2 passed (named keys are not `-l`; live Esc / Esc×2 / C-c bytes on an isolated socket)
cargo test -p core-service --offline --lib interrupt
# 5 passed (cancel interrupts then marks cancelled; per-agent keys; no kill_window)
bun test apps/web/src/app-shell/__tests__/center-stage-tab-hover.test.ts apps/web/src/features/terminal/store/__tests__/terminal-store-helpers.test.ts apps/web/src/features/automations/lib/__tests__/automation-tab-mark.test.ts
# 25 passed (stable pane snapshot; no getSnapshot loop)
```

Live UI (`/automations?automationTab=history`, API `:30303`):

- Terminal smoke `c03b5c3b` → Cancel: sqlite `cancelled`; tmux `auto-c03b5c3b` still running Codex; pane showed `esc again to edit previous message`; Codex tab stayed open.
- Chat smoke `698bd0f0` → Cancel: sqlite `cancelled`; `Open chat` remained; `~/.atmos/data/agent/chats/ce3b1f91-…` still on disk.
