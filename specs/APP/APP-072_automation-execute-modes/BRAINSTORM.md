# Brainstorm · APP-072: Automation execute modes

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

APP-017 / APP-019 already run automations, but **every run is headless**: `tokio::process::Command` in `process_runner`, no terminal tab, no Agent Chat tab. Target (project / workspace / new workspace / standalone) only picks `cwd`. “Continue in terminal” is a post-run follow-up that navigates to a tab and copies a prompt; it does not start the job.

Users now want the job itself to choose **how** the agent executes:

1. **Headless Spawn** — today’s unattended CLI spawn (keep).
2. **Terminal Agent** — each run opens a **new terminal tab** in the chosen environment and runs an *interactive* terminal agent.
3. **Agent Chat** — same targeting, but a **new Agent Chat tab**.

Setup UI: above Instructions, an **Execute Agent** control with those three tabs. Headless no longer uses a popover — show the agent list inline, fixed height, scrollable.

Why now: live-md Instructions/Memories landed; headless is right for unattended work but wrong when the user wants to watch, steer, or approve. APP-017 originally used a tmux **Automations** tab and later removed it (IMP headless runner) because unattended TTY was wasteful. This spec **re-introduces visible surfaces as an explicit mode**, not as the only runner.

Current workaround: Run headless, then Continue in terminal / standalone chat.

Who feels it: Agentic Builder who schedules or repeatedly runs the same job and sometimes wants a live tab, sometimes wants no UI.

Why it’s hard: creating a **tab** is a UI attach problem; creating a **session** is a server problem. Scheduled / GitHub runs often have no open browser. CLI can create workspaces today, but cannot yet create a chat or inject an agent command into a new terminal. Shelling `atmos` from the API would recurse (CLI → `/api/cli/invoke` → same server).

## Goals (draft)

- **Primary** — One persisted execute mode per automation: Headless Spawn / Terminal Agent / Agent Chat.
- **Primary** — Headless picker is an inline scrollable list (no popover).
- **Primary** — Terminal / Chat runs create a **new tab per run** in the selected environment; **new workspace** creates the worktree first, then the tab inside it.
- **Primary** — Interactive prompts tell the agent to write artifacts / memory using job paths (no headless `--print` / stdout parser).
- **Primary** — Terminal / Chat tabs created by a run carry an **Automation** mark.
- **Secondary** — Same server capabilities exposed on CLI so agents/scripts can do the same orchestration (do not make the runner exec `atmos`).

## What already exists

| Capability | Today |
|---|---|
| Headless run | `AutomationService` → `process_runner` (piped stdio). `tmux_*` always `None`. |
| New workspace per run | `create_automation_workspace` + `created_workspace_guid`. No tab. |
| Interactive follow-up | `automation_continue_in_terminal` writes `continue_prompt.xml`, returns command; UI navigates / standalone chat. |
| CLI workspace | `atmos workspace create --project --name --branch` → `workspace_create`. |
| CLI terminal | `atmos terminal create --workspace [--name --cwd --shell]` → `terminal_session_create` (`detach_after_create: true`). **No launch command. Workspace id required.** |
| CLI chat | **None.** Server already has `agent_chat_create` + `agent_chat_send`. |
| CLI automation | **None.** Runs start via WS (`automation_run_now`, scheduler, GitHub). |
| Tab chrome / pending command | Web: `queuePendingRun` / `queueAgentRun` (Welcome). Not on the CLI. |
| Chat vs terminal catalogs | Different. Terminal = `resources/terminal-agents`. Chat = APP-067/068 providers. |

## Options

### Option A — UI-only orchestration

On Run now, the web app creates the workspace (existing WS), opens a tab, queues `launchCommand` or `agent_chat_create` + send. Scheduler stays headless-only (or no-ops Terminal/Chat when UI is closed).

**Pros**: Fastest; reuses Welcome `queueAgentRun`; no CLI work.
**Cons**: Scheduled / GitHub / remote Computer without an open UI cannot honor Terminal/Chat. Mode becomes “manual only,” which is easy to misread.
**Unknown**: Whether HUMAN wants scheduled Terminal/Chat at all.

### Option B — Server owns the run; CLI mirrors the verbs (recommended)

`AutomationService` stays the runner. It already creates workspaces. Extend **server** actions so a run can:

- create a detached terminal session, send the interactive launch + prompt
- `agent_chat_create` + `agent_chat_send` with the job prompt
- persist `source = automation` + `run_guid` on that session/chat

CLI grows thin APP-063 verbs that **invoke the same actions** (`atmos chat create/send`, `atmos terminal create --command`, optional `atmos automation run`). The API **must not** spawn `~/.atmos/bin/atmos` to start a run.

**Pros**: Scheduled and manual share one path. Matches APP-063 (CLI is a client, not a second data plane). Agents can script the same thing. Tab badge can read server metadata even after reload.
**Cons**: Need PTY inject without a browser; project-scoped `terminal_session_create` (today `workspace_id` only); Chat catalog vs terminal catalog.
**Unknown**: How a project (not workspace) terminal is keyed — UI often uses project guid as the session scope.

### Option C — Runner shells `atmos workspace create && atmos terminal create && …`

Treat CLI as the automation engine.

**Pros**: Feels like “one tool for automation.”
**Cons**: API → CLI → API loop; PATH / min-version gates on every scheduled tick; still cannot open a **tab** (only a session); Chat verbs don’t exist yet; duplicates `create_automation_workspace`.
**Unknown**: None that make this better than B — the missing verbs still have to be server actions first.

### Headless picker (UI)

#### H1 — Inline fixed-height list (requested)

Same agents as today’s automation-capable set (`params` / `yoloParams`). No popover.

#### H2 — Keep popover, add mode tabs only

Smaller UI change. Rejects the stated Headless UX.

### Interactive prompt

#### P1 — Mode-specific prompt template (requested)

Headless keeps stdout/file capture. Terminal/Chat prompts include: job name, instructions, **memory path**, **run dir / result path**, and an explicit “write `final.md` / update memory yourself” contract.

#### P2 — Same prompt, hope the agent notices paths

Weaker; interactive agents will not write `final.md` unless told.

### Tab mark

#### M1 — Server metadata + UI badge

`create_source` / `origin: automation` on terminal session and chat meta. Tab chip “Automation” (sentence case). Workspace created by the run already has `create_source = "automation"`.

#### M2 — Client-only label on the tab id

Lost on reload / other Computer UI. Too weak if scheduled runs matter.

## Key forks in the road

- **Fork 1 — Who starts Terminal/Chat runs?** UI-only (A) vs server runner + CLI mirrors (B) vs shell-out to CLI (C). **Decide in PRD.** Recommendation: **B**.
- **Fork 2 — Scheduled / GitHub + Terminal/Chat?** Same as Run now (create session even if no UI), or force Headless for unattended triggers. **Decide in PRD.**
- **Fork 3 — Standalone target + Terminal/Chat?** No project/workspace tab context today (Continue already falls back to standalone chat). Disallow, or always use Chat on an automations surface. **Decide in PRD.**
- **Fork 4 — Agent lists.** One terminal-agent list for all three tabs, or Headless/Terminal = terminal catalog, Chat = Chat providers. **Decide in PRD.**
- **Fork 5 — Project terminals.** `terminal_session_create` requires `workspace_id`. Confirm project guid-as-scope vs a new project field. **Decide in TECH.**
- **Fork 6 — Is Execute Agent only a saved mode, or also a setup dry-run?** **Decide in PRD.**

## Open questions

- [x] Fork 1–4, 6 — decided in PRD (server owns run; same mode for schedule/GitHub; Standalone virtual group; two catalogs; persisted mode + try-run).
- [x] Tab mark — sidebar visible **Automation** chip; tabs icon + tooltip (`{job} · {short run id}`), plus the word when space allows.
- [x] New tab every Terminal/Chat run — confirmed in PRD.
- [x] Interactive run status — stays `running` until CLI complete / `--failed` / cancel. **Rejected:** auto-fail / interrupt after a timeout (including a 24h stale fail). After 1 hour, notify only; dismiss clears the prompt and does not change status.
- [x] Chat uses Chat spawn config, not terminal `yoloParams`.
- [x] Run now / try-run navigates to the matching surface.

## References

- Existing: `crates/core-service/src/service/automation/` (`lifecycle.rs`, `process_runner.rs`, `target.rs`, `agents.rs`)
- CLI: `apps/cli/src/commands/product.rs` (`workspace`, `terminal`); APP-063 invoke
- Chat wire: `agent_chat_create`, `agent_chat_send` in `@atmos/api-types`
- Terminal wire: `terminal_session_create` (`workspace_id` required, no command field)
- Related specs: [APP-017](../APP-017_atmos-automations/), [APP-019](../APP-019_github-automation-triggers/), [APP-024](../APP-024_terminal-agent-run-config/), [APP-063](../APP-063_agent-first-product-cli/), [APP-067-chat](../APP-067_atmos_agent_abs/), [APP-068](../APP-068_agent_chat_arch_optimize/)
- APP-017 IMPROVEMENT: headless process runner replaced the tmux Automations tab

## Ready to promote

- Promote to PRD: three execute modes; inline Headless list; new tab per Terminal/Chat run; new workspace then tab; interactive prompt includes memory + result paths; Automation mark on those tabs.
- Promote to PRD: **do not** implement the runner by exec-ing the CLI; extend server actions, then add CLI verbs.
- Promote to TECH: session/chat `origin` metadata; prompt templates; project terminal scope; run-status coupling to tab lifetime.
- Hold: scheduled Terminal/Chat, standalone + visible tab, Chat vs terminal catalog — need HUMAN.
